/**
 * M54 — ONE handler behind both doors.
 *
 * Every verb is injected as a function, so the same handler runs in
 * index.ts (over the real store, `templateOf` + a PRESET_SPAWN send, the
 * manager's list, an ATTENTION_JUMP send) and in the verify harnesses (over
 * fakes), and the two never diverge on what `open` means. Main does not
 * mint a panel id — `open` answers "reached the canvas", never an id —
 * because the renderer alone mints ids (the duplicate-id defect, whose
 * symptom is two panels rendering as one).
 */
import { existsSync } from 'node:fs'
import type { Preset } from '../shared/layout-schema'
import type { BoardControlRequest, ControlCanvasModel } from '../shared/ipc-contract'
import { resolveOpen, type ControlRequest } from './control-protocol'
import { unreviewedPresetReason } from './presets'
import type { ControlReply } from './control-server'
import type { AgentPlanCaller, AgentPlanReply } from '../shared/plan'
import type { AccountService } from './account-session'
import type { ShareControl } from './share-control'

export interface ControlSessionRow {
  panelId: string
  pid: number
  cwd: string
  command: string
}

/** M81. The canvas as `tc status` reports it — declared in the contract, beside every other shape both sides read. */
export type { ControlCanvasModel } from '../shared/ipc-contract'

export interface ControlHandlerDeps {
  /** M180. The renderer's plan executor; the caller is the panel main resolved from the token, and its teammate. */
  plan?: (line: string, caller?: AgentPlanCaller) => Promise<AgentPlanReply | null>
  presets: () => readonly Preset[]
  defaultId: () => string | null
  /** Injected for the plain-node tier; index.ts passes existsSync. */
  exists?: (path: string) => boolean
  spawn: (preset: Preset, cwd: string | undefined) => void
  list: () => ControlSessionRow[]
  /** True when the id named a panel the renderer can fly to. */
  focus: (panelId: string) => boolean
  /**
   * M81. The canvas model, asked of the RENDERER (it is the only side that
   * knows a panel's word, its edges and its runs). `null` is "it did not
   * answer in time" — a third state, never an empty model with no note.
   */
  canvas?: () => Promise<ControlCanvasModel | null>
  /** M102. The teammate a panel speaks as, from main's own records — never the CLI's claim. */
  teammateOf?: (panelId: string) => string | undefined
  /** M102. The panel a session token was minted for; undefined for a token this window never minted. */
  panelOfToken?: (token: string) => string | undefined
  /** M87. The broker: the one verb that can spend a credential. Absent means refused by name. */
  broker?: { call(req: { service: string; method: string; path: string; body?: string; panelId?: string }): Promise<{ ok: true; status: number; body: string; truncated: boolean } | { ok: false; reason: string }> }
  /**
   * M113. The board, asked of the RENDERER (it owns the workspace it renders;
   * a main-side write would be overwritten by its next coalesced save).
   * `null` is "no window answered" — a named refusal, never a silent ok.
   */
  board?: (req: BoardControlRequest) => Promise<{ kind: 'ok'; id: string } | { kind: 'refused'; reason: string } | null>
  /**
   * The Terminal Canvas account. Absent means every account verb is refused by
   * name. `login`/`join` are called with `askFirst`, so a person confirms.
   */
  account?: Pick<AccountService, 'login' | 'logout' | 'invite' | 'join'>
  /** M336–M337. The account picker and sharing verbs (share-control.ts). Absent means refused by name. */
  sharing?: ShareControl
  /** M83. The project memory store: the only thing a control verb may write. */
  memory?: {
    list(root: string, limit: number): Promise<{ root: string; entries: unknown[]; skipped: number }>
    add(req: { root: string; kind: string; text: string; panelId?: string }): Promise<{ ok: true; entry: unknown } | { ok: false; reason: string }>
  }
}

export function createControlHandler(deps: ControlHandlerDeps): (req: ControlRequest) => Promise<ControlReply> {
  const exists = deps.exists ?? existsSync
  return async (req: ControlRequest): Promise<ControlReply> => {
    switch (req.verb) {
      case 'plan': {
        if (deps.plan === undefined) return { ok: false, error: 'the plan bridge is not available here' }
        // M180. A token names the panel that REALLY asked (the `api` arm's
        // rule): one this window never minted is refused, never trusted, and
        // the panel's teammate rides to the renderer so a bounded chat stays bounded.
        let caller: AgentPlanCaller | undefined
        if (req.token !== undefined) {
          const owner = deps.panelOfToken?.(req.token)
          if (owner === undefined) return { ok: false, error: 'the panel token is not one this window minted — run tc from inside a panel this app opened' }
          const teammateId = deps.teammateOf?.(owner)
          caller = { panelId: owner, ...(teammateId === undefined ? {} : { teammateId }) }
        }
        const reply = await deps.plan(req.line, caller).catch(() => null)
        if (reply === null) return { ok: false, error: 'no canvas answered the plan — open the app first' }
        return reply.kind === 'ran' ? { ok: true, summary: reply.summary } : { ok: false, error: reply.reason }
      }
      case 'ping':
        return { ok: true }
      case 'open': {
        const resolved = resolveOpen({ req, presets: deps.presets(), defaultId: deps.defaultId(), exists })
        if (resolved.kind === 'refused') return { ok: false, error: resolved.error }
        // M253. `tc spawn` is a door too; an unread pack preset is refused here as at the palette.
        const unread = unreviewedPresetReason(resolved.preset)
        if (unread !== null) return { ok: false, error: unread }
        deps.spawn(resolved.preset, resolved.cwd)
        return { ok: true, preset: resolved.preset.id }
      }
      case 'list':
        return {
          ok: true,
          sessions: deps.list(),
          note: 'running sessions only — a dormant card has no session and is not listed'
        }
      case 'focus':
        return deps.focus(req.id) ? { ok: true } : { ok: false, error: `no panel ${req.id}` }
      case 'memory': {
        if (deps.memory === undefined) return { ok: false, error: 'this window has no memory store' }
        if (req.op === 'list') {
          const root = req.root ?? ''
          if (root === '') return { ok: false, error: 'memory list needs a root — the repository whose memory to read' }
          // A non-positive or absurd limit is refused BY NAME rather than
          // clamped quietly: `--limit 0` answers an empty list that reads
          // exactly like a repository nobody has written about, which is the
          // one wrong answer this store must never give (M83's verifier).
          const limit = req.limit ?? 50
          if (!Number.isInteger(limit) || limit < 1) return { ok: false, error: `${JSON.stringify(req.limit)} is not a usable limit — ask for at least one memory` }
          return { ok: true, memory: await deps.memory.list(root, limit) }
        }
        const written = await deps.memory.add({ root: req.root, kind: req.kind, text: req.text, ...(req.panelId === undefined ? {} : { panelId: req.panelId }) })
        return written.ok ? { ok: true, entry: written.entry } : { ok: false, error: written.reason }
      }
      case 'api': {
        if (deps.broker === undefined) return { ok: false, error: 'this window has no broker' }
        // M102. A token names the panel that REALLY asked — main minted it into
        // that session's environment — and overrides any claimed panelId; a
        // token this window never minted is refused, never trusted.
        let panelId = req.panelId
        if (req.token !== undefined) {
          const owner = deps.panelOfToken?.(req.token)
          if (owner === undefined) return { ok: false, error: 'the panel token is not one this window minted — run tc from inside a panel this app opened' }
          panelId = owner
        }
        const teammateId = panelId === undefined ? undefined : deps.teammateOf?.(panelId)
        const answer = await deps.broker.call({ service: req.service, method: req.method, path: req.path, ...(req.body === undefined ? {} : { body: req.body }), ...(panelId === undefined ? {} : { panelId }), ...(teammateId === undefined ? {} : { teammateId }), ...(req.cost === undefined ? {} : { cost: req.cost }) })
        return answer.ok ? { ok: true, status: answer.status, body: answer.body, truncated: answer.truncated } : { ok: false, error: answer.reason }
      }
      case 'task': {
        // M313. A PROPOSAL: the renderer opens Start work filled in and says
        // so; a person presses Start. The cwd is checked here so a typo'd
        // directory is refused at the door instead of pre-filling a sheet
        // that then fails to find its repository.
        if (deps.board === undefined) return { ok: false, error: 'the board is not available here' }
        if (req.cwd !== undefined && !exists(req.cwd)) return { ok: false, error: `cwd ${req.cwd} does not exist` }
        const { verb: _verb, ...fields } = req
        const answer = await deps.board({ op: 'propose', ...fields }).catch(() => null)
        if (answer === null) return { ok: false, error: 'no canvas is open to bring the task into — open the app first' }
        return answer.kind === 'ok' ? { ok: true, id: answer.id } : { ok: false, error: answer.reason }
      }
      case 'board': {
        // Writes NOTHING here: the renderer upserts through its ordinary
        // path and answers with the surviving id. No spawn, focus or kill.
        if (deps.board === undefined) return { ok: false, error: 'the board is not available here' }
        const answer = await deps.board(req.op === 'add' ? { op: 'add', title: req.title } : { op: 'done', id: req.id }).catch(() => null)
        if (answer === null) return { ok: false, error: 'no canvas is open to add to — open the app first' }
        return answer.kind === 'ok' ? { ok: true, id: answer.id } : { ok: false, error: answer.reason }
      }
      case 'login':
      case 'logout':
      case 'invite':
      case 'join': {
        if (deps.account === undefined) return { ok: false, error: 'accounts are not available here' }
        // Each arm's result is metadata by construction (shared/account.ts):
        // an invite's code is the one plaintext, and it is the person's to share.
        const r = req.verb === 'login' ? await deps.account.login({ askFirst: true })
          : req.verb === 'logout' ? await deps.account.logout(req.githubId)
          : req.verb === 'invite' ? await deps.account.invite({ role: req.role, ...(req.orgId === undefined ? {} : { orgId: req.orgId }) })
          : await deps.account.join({ code: req.code, askFirst: true })
        if ('reason' in r) return { ok: false, error: r.reason, kind: r.kind }
        return { ok: true, ...r }
      }
      case 'accounts':
      case 'use':
      case 'shares':
      case 'share':
      case 'open-share':
      case 'share-role': {
        if (deps.sharing === undefined) return { ok: false, error: 'accounts are not available here' }
        const sh = deps.sharing
        return req.verb === 'accounts' ? sh.accounts()
          : req.verb === 'use' ? sh.use(req.who)
          : req.verb === 'shares' ? sh.shares()
          : req.verb === 'share' ? sh.share(req.orgId)
          : req.verb === 'open-share' ? sh.openShare(req.shareId)
          : sh.shareRole({ shareId: req.shareId, who: req.who, role: req.role })
      }
      case 'status': {
        // READ-ONLY by construction: this arm has no spawn, focus, write or
        // kill in it, and the whole verb is one call into a renderer that
        // only reports. A canvas nobody answered for is EMPTY WITH A NOTE.
        // A rejection is the same third state as a timeout: the canvas did
        // not answer. It must not escape into the socket's reply path.
        const model = deps.canvas === undefined ? null : await deps.canvas().catch(() => null)
        if (model === null) {
          return { ok: true, canvas: { panels: [], edges: [], runs: [] }, note: 'the canvas did not answer in time — it may be starting, or no window is open' }
        }
        return { ok: true, canvas: model }
      }
    }
  }
}
