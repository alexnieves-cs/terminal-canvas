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
import type { ControlCanvasModel } from '../shared/ipc-contract'
import { resolveOpen, type ControlRequest } from './control-protocol'
import type { ControlReply } from './control-server'

export interface ControlSessionRow {
  panelId: string
  pid: number
  cwd: string
  command: string
}

/** M81. The canvas as `tc status` reports it — declared in the contract, beside every other shape both sides read. */
export type { ControlCanvasModel } from '../shared/ipc-contract'

export interface ControlHandlerDeps {
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
  /** M87. The broker: the one verb that can spend a credential. Absent means refused by name. */
  broker?: { call(req: { service: string; method: string; path: string; body?: string; panelId?: string }): Promise<{ ok: true; status: number; body: string; truncated: boolean } | { ok: false; reason: string }> }
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
      case 'ping':
        return { ok: true }
      case 'open': {
        const resolved = resolveOpen({ req, presets: deps.presets(), defaultId: deps.defaultId(), exists })
        if (resolved.kind === 'refused') return { ok: false, error: resolved.error }
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
        const answer = await deps.broker.call({ service: req.service, method: req.method, path: req.path, ...(req.body === undefined ? {} : { body: req.body }), ...(req.panelId === undefined ? {} : { panelId: req.panelId }) })
        return answer.ok ? { ok: true, status: answer.status, body: answer.body, truncated: answer.truncated } : { ok: false, error: answer.reason }
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
