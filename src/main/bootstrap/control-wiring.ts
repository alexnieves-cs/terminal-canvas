import { brokerCardTool, createBroker } from '../broker'
import { createHttpsBrokerFetcher } from '../credential-verify'
import { createControlHandler } from '../control-handler'
import { requestFromRenderer, requestFromRendererWith } from '../ipc'
import { allPresets, templateOf } from '../presets'
import { IPC_EVENTS, type ControlCanvasModel, type BoardControlReply, type BoardControlRequest } from '../../shared/ipc-contract'
import type { AgentPlanReply, AgentPlanRequest } from '../../shared/plan'
import { sendToRenderer } from './window'
import { TEAMMATE_ROOT, teammateSlug, type Places } from './places'
import type { Stores } from './stores'
import type { MainState, PanelTokens } from './context'
import type { AccountService } from '../account-session'
import type { ShareControl } from '../share-control'

/**
 * M87. The broker over the credential store — the store's LAST reader — with
 * the real HTTPS fetcher and an audit file beside the run ledger. Wired to
 * the control handler and the board's GitHub verbs only: NO IPC CHANNEL
 * REACHES IT, so the renderer can neither spend a credential nor see what an
 * agent spent.
 */
export interface ControlWiring {
  broker: ReturnType<typeof createBroker>
  handler: ReturnType<typeof createControlHandler>
  /** M102. A panel's teammate is MAIN's own record, never the CLI's claim. */
  teammateOfPanel(panelId: string): string | undefined
}

export function createControlWiring(state: MainState, stores: Stores, places: Places, tokens: PanelTokens, account?: AccountService, sharing?: ShareControl): ControlWiring {
  const { layoutStore, credentialStore, brokerAudit, ptyManager, memoryStore, teammateMemory } = stores

  // M102. A panel's teammate is MAIN's own record (the chat's `teammateId`),
  // never the CLI's claim; the grant is the roster's; a write asks on the
  // teammate's chat through the manager's external question — the one door.
  const teammateOfPanel = (panelId: string): string | undefined => {
    for (const ws of layoutStore.mergedWorkspaces()) for (const p of ws.panels) if (p.id === panelId && p.kind === 'chat') return p.chat.teammateId
    return undefined
  }
  const chatOfTeammate = (teammateId: string, preferred?: string): string | undefined => {
    const live = state.agents?.list().map((s) => s.id) ?? []
    if (preferred !== undefined && live.includes(preferred)) return preferred
    for (const ws of layoutStore.mergedWorkspaces()) for (const p of ws.panels) if (p.kind === 'chat' && p.chat.teammateId === teammateId && live.includes(p.id)) return p.id
    return undefined
  }

  const broker = createBroker({
    store: credentialStore, fetcher: createHttpsBrokerFetcher(), audit: brokerAudit,
    services: (teammateId) => layoutStore.teammates().find((t) => t.id === teammateId)?.services,
    account: (service) => credentialStore.list().find((c) => c.service === service)?.label,
    approve: async (ask) => {
      const chatId = chatOfTeammate(ask.teammateId, ask.panelId)
      if (chatId === undefined || state.agents === null) return false
      // M255. Asked under a per-request name, so "Allow for session" answers
      // THIS write only — never every later github write from the chat.
      return state.agents.askExternal(chatId, brokerCardTool(ask), { command: `${ask.method} ${ask.path}`, account: ask.account, cost: ask.cost }, `${ask.method} ${ask.path} as ${ask.account} · cost: ${ask.cost} (as stated by the caller)`)
    }
  })

  const handler = createControlHandler({
    // M87. The one verb that can spend a credential.
    broker,
    // The account verbs; login and join confirm with a person (account-session.ts).
    ...(account === undefined ? {} : { account }),
    // M336–M337. The picker and sharing verbs; every change asks a person (share-control.ts).
    ...(sharing === undefined ? {} : { sharing }),
    teammateOf: teammateOfPanel,
    panelOfToken: (token) => tokens.panelOf(token),
    presets: () => allPresets(layoutStore.presets()),
    defaultId: () => layoutStore.defaultPresetId() || null,
    spawn: (preset, cwd) => {
      const template = templateOf(preset)
      if (cwd !== undefined) template.cwd = cwd
      sendToRenderer(state, stores, IPC_EVENTS.PRESET_SPAWN, template)
    },
    list: () => ptyManager.list().map((r) => ({ panelId: r.panelId, pid: r.pid, command: r.command, cwd: r.cwd })),
    // M81. `tc status`: the RENDERER's own model — it is the only side that
    // knows a panel's state word, its edges and its runs. Asked over the
    // ephemeral reply channel canvas:counts already uses; a window that does
    // not answer yields null, which the handler turns into an empty model
    // WITH a note.
    // M83. The project memory: one store for the app, keyed per repository.
    // The control door resolves the root through the SAME scope resolver the
    // IPC door uses. An agent runs `tc memory add` wherever its shell is
    // standing, which is usually a subdirectory: without this its memories
    // land in a file the node and the chat never read, and every door still
    // shows a plausible non-empty list (M83's verifier).
    memory: {
      // M100. The teammate prefix routes here as it does at the IPC door.
      list: async (root, limit) => {
        if (root.startsWith(TEAMMATE_ROOT)) return teammateMemory.list(teammateSlug(stores, root), limit)
        const resolved = await places.memoryScope(root)
        // M196. A read that could not be scoped answers EMPTY with its reason on
        // the row rather than a confident empty list against a stray key.
        if (!resolved.ok) return { root, entries: [], skipped: 0, unresolved: resolved.reason }
        return { ...memoryStore.list(resolved.root, limit), ...(resolved.scope === undefined ? {} : { scope: resolved.scope }) }
      },
      add: async (req) => {
        if (req.root.startsWith(TEAMMATE_ROOT)) return teammateMemory.add({ ...req, root: teammateSlug(stores, req.root) })
        const resolved = await places.memoryScope(req.root)
        if (!resolved.ok) return { ok: false as const, reason: resolved.reason }
        return memoryStore.add({ ...req, root: resolved.root })
      }
    },
    // M369. The decision audit, read from main's own file.
    audit: (limit) => stores.decisionAudit.list(limit),
    canvas: async () => {
      const wc = state.window?.webContents
      if (!wc) return null
      return requestFromRenderer<ControlCanvasModel | null>(wc, IPC_EVENTS.CANVAS_MODEL, null, 1500)
    },
    // M113. The board verb asks the renderer, which owns the workspace it renders.
    // M180. The plan door asks the renderer the same way. No window is the
    // handler's `null`; a plan that outlives the wait is a DIFFERENT answer —
    // its steps are still running on the canvas, and "no canvas answered" would
    // send the caller to relaunch an app that is mid-send (the critic).
    plan: async (line, caller) => {
      const wc = state.window?.webContents
      if (!wc) return null
      return requestFromRendererWith<AgentPlanReply, AgentPlanRequest>(wc, IPC_EVENTS.CANVAS_PLAN, { line, ...(caller === undefined ? {} : { caller }) },
        { kind: 'refused', reason: 'the plan is still running on the canvas — it did not finish within 30 s; check the canvas before repeating it' }, 30000)
    },
    board: async (req) => {
      const wc = state.window?.webContents
      if (!wc) return null
      return requestFromRendererWith<BoardControlReply | null, BoardControlRequest>(wc, IPC_EVENTS.BOARD_ADD, req, null, 2000)
    },
    // Running sessions only: a dormant card has no session here, and `list`
    // says so in its note.
    focus: (id) => {
      if (!ptyManager.list().some((r) => r.panelId === id)) return false
      sendToRenderer(state, stores, IPC_EVENTS.ATTENTION_JUMP, id)
      return true
    }
  })

  return { broker, handler, teammateOfPanel }
}
