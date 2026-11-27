import type { NightFilmExportRequest, NightFilmExportResult } from '@shared/export'
import { encodeFrames, filmCodec } from '../film/film-encode'
import { getJournal } from '../world/agent-world-store'
import { getUsageHistory } from '../session/usage-store'
import { LAPSE_SIZE, lapseFrame, lapseScript } from './fleet-film'
import { paintLapseFrame } from './fleet-paint'

/**
 * M699. "Export time-lapse": the wall's window as an MP4, drawn offscreen from
 * a script and saved through the night film's door (`export:night-film`, with
 * `film: 'fleet'` for the name). The one module that reads the live stores for
 * the film, and it reads them ONCE, into the script; from there on the frames
 * come from the script alone (fleet-film.ts says why).
 */

export type LapseResult =
  | { kind: 'written'; path: string; seconds: number; redacted: number }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: string }

export interface LapseDeps {
  from: number
  to: number
  nameOf: (agentId: string) => string
  save: (req: NightFilmExportRequest) => Promise<NightFilmExportResult>
  onProgress?: (fraction: number) => void
  seconds?: number
}

export async function exportFleetLapse(deps: LapseDeps): Promise<LapseResult> {
  if (await filmCodec() === null) return { kind: 'failed', reason: 'this build cannot encode H.264 video' }
  const script = lapseScript({ journal: getJournal(), history: getUsageHistory(), from: deps.from, to: deps.to, nameOf: deps.nameOf, seconds: deps.seconds })
  if (script.agents.length === 0) return { kind: 'failed', reason: 'no agent has done anything in this window yet' }
  try {
    const film = await encodeFrames({
      width: LAPSE_SIZE.w,
      height: LAPSE_SIZE.h,
      fps: script.fps,
      total: script.frames,
      paint: (ctx, i) => paintLapseFrame(ctx, lapseFrame(script, i), script),
      onProgress: (done, total) => deps.onProgress?.(done / Math.max(1, total))
    })
    const saved = await deps.save({ bytes: film.bytes, seconds: film.seconds, redacted: script.redacted, film: 'fleet' })
    return saved
  } catch (error: unknown) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}

/** The sentence the wall shows after an export, or null while none has run. */
export function lapseWords(r: LapseResult): string {
  if (r.kind === 'cancelled') return 'Not saved.'
  if (r.kind === 'failed') return `Could not make the time-lapse: ${r.reason}.`
  const name = r.path.split('/').pop() ?? r.path
  const scrubbed = r.redacted > 0 ? `, ${r.redacted} secret${r.redacted === 1 ? '' : 's'} redacted` : ''
  return `Saved ${name} (${Math.round(r.seconds)} s${scrubbed}).`
}
