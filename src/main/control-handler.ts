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
