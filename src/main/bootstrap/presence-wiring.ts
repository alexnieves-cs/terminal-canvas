import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPresenceHub, readPresenceConfig, type PresenceHub } from '../presence/presence-hub'
import { createCanvasSync, type CanvasSync } from '../presence/canvas-sync'
import { HOST_PATTERN } from '../../shared/canvas-doc'
import { hocuspocusConnect } from '../presence/presence-provider'
import { createTeamReporter, type TeamReporter } from '../presence/team-reporter'
import type { AccountService } from '../account-session'
import { recordDecision } from '../decision-audit'
import { createTeamAskRouter, type TeamAskRouter } from '../team-ask-router'
import { shareDecisionRow, type ShareDecision } from '../../shared/decision-audit'
import { requestFromRenderer } from '../ipc'
import { IPC_EVENTS, type ControlCanvasModel } from '../../shared/ipc-contract'
import { readyContents, type MainState } from './context'
import type { Stores } from './stores'

/**
 * Presence over the REAL collaborators: the Hocuspocus provider, the signed-in
 * account, the layout store's workspace list and the live window.
 *
 * Built at module scope with the other collaborators, STARTED in whenReady
 * after the env probe (the config reads `state.loginEnv` at use, like the
 * account's). Rosters go through `readyContents`, never `sendToRenderer`:
 * presence is background news, and a peer moving their cursor must not pop a
 * closed window back open (window.ts's rule).
 */
export function createPresenceWiring(state: MainState, stores: Stores, account: AccountService): PresenceHub {
  return createPresenceHub({
    config: () => readPresenceConfig(process.env, state.loginEnv),
    identity: () => account.presenceIdentity(),
    // M349. With each panel's title, so the roster names a person's agents by
    // their panels (the hub scrubs a title before it is published).
    workspaces: () => {
      const records = stores.layoutStore.current().workspaces
      return stores.layoutStore.workspaces().map((w) => {
        const ws = records.find((r) => r.id === w.id)
        const titles: Record<string, string> = {}
        for (const p of ws?.panels ?? []) if (typeof p.title === 'string' && p.title !== '') titles[p.id] = p.title
        return { id: w.id, panelIds: w.panelIds, titles }
      })
    },
    connect: hocuspocusConnect,
    // A shared workspace meets its teammates' copies under the SHARE's id;
    // an unshared one keeps its per-machine room, for presence only.
    docName: (id) => {
      const share = stores.layoutStore.workspaceShare(id)
      return `tc:workspace:${share?.id ?? id}`
    },
    // Read at use: built after the hub in index.ts, and null in a harness.
    bindCanvas: (id, doc) => state.canvasSync?.bind(id, doc) ?? (() => {}),
    emit: (roster) => { readyContents(state)?.send(IPC_EVENTS.PRESENCE_REMOTE, roster) },
    emitObserved: (observed) => { readyContents(state)?.send(IPC_EVENTS.TEAM_OBSERVED, observed) },
    // Observer mode's snapshot, only ever asked while someone is observing
    // us: the renderer's OWN words through canvas:model (the same ephemeral
    // reply `tc status` uses), the geometry from the layout store — the model
    // carries no rects, and the store has every workspace's, not just the
    // one on screen. Raw here; the hub scrubs titles where they leave.
    snapshot: async (workspaceId) => {
      const ws = stores.layoutStore.mergedWorkspaces().find((w) => w.id === workspaceId)
      if (ws === undefined) return null
      const wc = state.window?.webContents
      const model = wc ? await requestFromRenderer<ControlCanvasModel | null>(wc, IPC_EVENTS.CANVAS_MODEL, null, 1500) : null
      const words = new Map((model?.panels ?? []).map((p) => [p.id, p]))
      const ids = new Set(ws.panels.map((p) => p.id))
      return {
        panels: ws.panels.map((p) => {
          const w = words.get(p.id)
          const title = w?.title ?? ('title' in p && typeof p.title === 'string' ? p.title : '')
          return { id: p.id, kind: w?.kind ?? p.kind ?? 'terminal', title, state: w?.state ?? '', x: p.x, y: p.y, w: p.w, h: p.h }
        }),
        edges: (model?.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ from: e.from, to: e.to }))
      }
    }
  })
}

/** The Team view's server rows, from the hub's summary through the account. */
export function createTeamReporterWiring(hub: PresenceHub, account: AccountService): TeamReporter {
  return createTeamReporter({ summary: () => hub.summary(), report: (r) => account.reportTeam(r) })
}

/**
 * This install's id — the host prefix on every shared-canvas key minted here
 * (canvas-doc.ts). Random, never derived from the person or the machine, and
 * kept in its own file under userData so it outlives a layout.json reset: a
 * new host id would orphan every panel this Mac had put on a shared canvas.
 */
function installId(userData: string): () => string {
  let cached: string | null = null
  return () => {
    if (cached !== null) return cached
    const file = join(userData, 'canvas-host-id')
    try {
      const v = readFileSync(file, 'utf8').trim()
      if (HOST_PATTERN.test(v)) { cached = v; return v }
    } catch { /* first run */ }
    const fresh = BigInt('0x' + randomBytes(8).toString('hex')).toString(36).padStart(6, '0')
    try { writeFileSync(file, fresh, 'utf8') } catch { /* read-only userData: this session's id only */ }
    cached = fresh
    return fresh
  }
}

/** The shared canvas over the layout store, the account and the window. */
export function createCanvasSyncWiring(state: MainState, stores: Stores, account: AccountService, userData: string): CanvasSync {
  const store = stores.layoutStore
  return createCanvasSync({
    host: installId(userData),
    userId: () => account.currentUserId(),
    share: (id) => store.workspaceShare(id),
    activeWorkspaceId: () => store.activeWorkspaceId(),
    // The store's RECORD, read-only — not initial(), which applies the
    // restore settings and would hand back no panels with restore.layout off,
    // tombstoning every one of them on the shared canvas.
    local: (id) => {
      const ws = store.current().workspaces.find((w) => w.id === id)
      if (ws === undefined) return null
      return {
        // M343. A relay panel's minted session crosses (its id and program name only), so a teammate's placeholder can Attach.
        panels: ws.panels.map((p) => ({
          id: p.id, kind: p.kind ?? 'terminal', title: typeof p.title === 'string' ? p.title : '', x: p.x, y: p.y, w: p.w, h: p.h, z: p.z,
          ...(p.kind === 'relay' && p.relay.sessionId !== undefined ? { relay: { session: p.relay.sessionId, program: p.relay.program } } : {})
        })),
        groups: (ws.groups ?? []).map((g) => ({ id: g.id, label: g.label, colour: g.colour, panelIds: [...g.panelIds], ...(g.collapsed === true ? { collapsed: true } : {}) }))
      }
    },
    loadState: (id) => store.sharedState(id),
    saveState: (id, bytes) => store.setSharedState(id, bytes),
    applyToStore: (id, change) => store.applySharedLayout(id, change),
    // Background news like a roster: never pops a closed window open.
    emit: (view) => { readyContents(state)?.send(IPC_EVENTS.CANVAS_SHARED, view) },
    emitText: (push) => { readyContents(state)?.send(IPC_EVENTS.TEXT_REMOTE, push) },
    // M376. A peer answered a team ask: the owner's router decides (read at use).
    onAsks: (id) => { state.teamAsks?.asksChanged(id) },
    refreshRole: (shareId) => account.workspaceRole(shareId),
    setRole: (id, role) => {
      const share = store.workspaceShare(id)
      if (share !== undefined) store.setWorkspaceShare(id, { ...share, role })
    }
  })
}

/**
 * M376. The team queue's owner side over canvas-sync and the agent manager,
 * every collaborator read at USE (context.ts's rule): the agents runtime and
 * the canvas binding both exist later than this, and may be absent.
 */
export function createTeamAskWiring(state: MainState, stores: Stores, account: AccountService, userData: string): TeamAskRouter {
  const store = stores.layoutStore
  const setting = (id: string): unknown => store.getSetting(id as never)
  return createTeamAskRouter({
    enabled: () => setting('agents.teamAsks') === true,
    escalateAtUsd: () => { const v = setting('agents.teamEscalateUsd'); return typeof v === 'number' && v > 0 ? v : undefined },
    host: installId(userData),
    userId: () => account.currentUserId(),
    workspaceOfPanel: (panelId) => state.canvasSync?.workspaceOfPanel(panelId) ?? null,
    asks: (workspaceId) => state.canvasSync?.asks(workspaceId) ?? null,
    writeAsk: (workspaceId, op) => state.canvasSync?.writeAsk(workspaceId, op) ?? { ok: false, reason: 'sharing is not wired in this build' },
    spentOf: (panelId) => state.agents?.get(panelId)?.meter?.spentUsd,
    answer: (panelId, requestId, answer) => state.agents?.answerPermission(panelId, requestId, answer) ?? false,
    record: (row) => { void recordDecision(stores.runLedger, stores.decisionAudit, row) }
  })
}

/** The share doors: the account's rows, the store's record, the hub's rooms. */
export function createShareDoors(state: MainState, stores: Stores, account: AccountService) {
  const store = stores.layoutStore
  // M373. Every change these doors make was a person's: the app's share
  // dialog, or `tc`'s Cancel-default confirm (share-control.ts). So each one
  // is a person's row on the record, written here where the change lands,
  // for both doors at once. Beside the work, never in front of it: the words
  // may need a lookup, and a slow lookup must not hold the answer back.
  const onRecord = (d: () => Promise<ShareDecision>): void => {
    void d().then((decision) => recordDecision(stores.runLedger, stores.decisionAudit, shareDecisionRow(decision, Date.now()))).catch(() => undefined)
  }
  return {
    async share(req: { orgId?: string }) {
      const id = store.activeWorkspaceId()
      if (store.workspaceShare(id) !== undefined) return { kind: 'refused' as const, reason: 'this workspace is already shared' }
      const name = store.workspaces().find((w) => w.id === id)?.name ?? 'Canvas'
      const r = await account.shareWorkspace({ name, ...(req.orgId === undefined ? {} : { orgId: req.orgId }) })
      if (r.kind !== 'ok') return r
      store.setWorkspaceShare(id, { id: r.share.id, orgId: r.share.orgId, role: r.share.role })
      // The room reopens under the share's name, and the bind seeds the doc.
      state.presence?.reconcile()
      state.canvasSync?.activated()
      onRecord(async () => {
        const team = await account.team(r.share.orgId).catch(() => null)
        return { kind: 'share', shareId: r.share.id, workspace: name, org: team?.kind === 'ok' ? team.org.name : 'its organization' }
      })
      return r
    },
    shares: () => account.listShares(),
    async openShare(shareId: string) {
      const already = store.workspaces().find((w) => store.workspaceShare(w.id)?.id === shareId)
      if (already !== undefined) return { kind: 'ok' as const, workspaceId: already.id }
      const list = await account.listShares()
      if (list.kind !== 'ok') return list
      const row = list.shares.find((s) => s.id === shareId)
      if (row === undefined) return { kind: 'refused' as const, reason: 'you are not a member of that shared workspace' }
      const workspaceId = store.createWorkspace(row.name)
      store.setWorkspaceShare(workspaceId, { id: row.id, orgId: row.orgId, role: row.role })
      state.presence?.reconcile()
      // Only an open that ADDED a workspace is a decision; the already-open
      // answer above changed nothing and records nothing.
      onRecord(async () => ({ kind: 'open', shareId: row.id, workspace: row.name, role: row.role }))
      return { kind: 'ok' as const, workspaceId }
    },
    async setShareMember(req: { shareId: string; userId: string; role: 'owner' | 'editor' | 'viewer' | null }) {
      const r = await account.setShareMember(req)
      // The door is handed an id; the record says who and which workspace,
      // looked up after the change and falling back to the ids themselves.
      if (r.kind === 'ok') onRecord(async () => {
        const [members, shares] = await Promise.all([account.shareMembers(req.shareId).catch(() => null), account.listShares().catch(() => null)])
        const login = members?.kind === 'ok' ? members.members.find((m) => m.userId === req.userId)?.login : undefined
        const workspace = shares?.kind === 'ok' ? shares.shares.find((s) => s.id === req.shareId)?.name : undefined
        return { kind: 'role', shareId: req.shareId, workspace: workspace ?? 'a shared workspace', who: login ?? `user ${req.userId}`, userId: req.userId, role: req.role }
      })
      return r
    },
    shareMembers: (shareId: string) => account.shareMembers(shareId)
  }
}
