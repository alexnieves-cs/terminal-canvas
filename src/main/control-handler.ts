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
import { resolveOpen, type ControlRequest } from './control-protocol'
import type { ControlReply } from './control-server'

export interface ControlSessionRow {
  panelId: string
  pid: number
  cwd: string
  command: string
}

export interface ControlHandlerDeps {
  presets: () => readonly Preset[]
  defaultId: () => string | null
  /** Injected for the plain-node tier; index.ts passes existsSync. */
  exists?: (path: string) => boolean
  spawn: (preset: Preset, cwd: string | undefined) => void
  list: () => ControlSessionRow[]
  /** True when the id named a panel the renderer can fly to. */
  focus: (panelId: string) => boolean
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
    }
  }
}
