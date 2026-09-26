import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPresenceHub, readPresenceConfig, type PresenceHub } from '../presence/presence-hub'
import { createCanvasSync, type CanvasSync } from '../presence/canvas-sync'
import { HOST_PATTERN } from '../../shared/canvas-doc'
import { hocuspocusConnect } from '../presence/presence-provider'
import { createTeamReporter, type TeamReporter } from '../presence/team-reporter'
import type { AccountService } from '../account-session'
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
    refreshRole: (shareId) => account.workspaceRole(shareId),
    setRole: (id, role) => {
      const share = store.workspaceShare(id)
      if (share !== undefined) store.setWorkspaceShare(id, { ...share, role })
    }
  })
}

/** The share doors: the account's rows, the store's record, the hub's rooms. */
export function createShareDoors(state: MainState, stores: Stores, account: AccountService) {
  const store = stores.layoutStore
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
      return { kind: 'ok' as const, workspaceId }
    },
    setShareMember: (req: { shareId: string; userId: string; role: 'owner' | 'editor' | 'viewer' | null }) => account.setShareMember(req),
    shareMembers: (shareId: string) => account.shareMembers(shareId)
  }
}
