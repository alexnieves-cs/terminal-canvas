import type { MorningItem } from '@shared/return-briefing'
import { nightFilmScript, nightWindow, type FilmPanelInput } from '@shared/night-film'
import type { Panel } from '@renderer/panels/panels'
import { encodeFilm } from './film-encode'

/**
 * M564 (lane L). "Last night" — the morning queue's button: read the night's
 * record from main, build the script (every word through `outward` there),
 * draw and encode it here, and hand main the bytes to save.
 *
 * One flight at a time: a second press while a film renders says so rather
 * than starting a second encoder on the same hardware.
 */

export type LastNightResult =
  | { kind: 'written'; path: string; seconds: number; redacted: number }
  | { kind: 'cancelled' }
  | { kind: 'busy' }
  | { kind: 'failed'; reason: string }

export interface LastNightDeps {
  panels: readonly Panel[]
  labelOf: (panel: Panel) => string
  queue: readonly MorningItem[]
  awaySince: number | null
  now?: () => number
  onProgress?: (fraction: number) => void
}

let flying = false

/** A panel as the film sees it: where it is, its name without the id suffix the switcher adds, and its kind. */
export function filmPanelOf(panel: Panel, label: string): FilmPanelInput {
  const { id, x, y, w, h } = panel.rect
  return { id, label: label.replace(new RegExp(` \\(${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)$`), ''), kind: panel.kind ?? 'terminal', rect: { x, y, w, h } }
}

export async function makeLastNightFilm(deps: LastNightDeps): Promise<LastNightResult> {
  if (flying) return { kind: 'busy' }
  flying = true
  try {
    const bridge = window.canvas
    if (typeof bridge?.film?.night !== 'function' || typeof bridge.export?.nightFilm !== 'function') return { kind: 'failed', reason: 'the night film is not wired in this build' }
    const now = (deps.now ?? Date.now)()
    // The batch, when one ran, decides the window.
    const status = await bridge.tonight.status().catch(() => null)
    const { from, to } = nightWindow(status, deps.awaySince, now)
    const record = await bridge.film.night({ from, to })
    if (record.kind === 'refused') return { kind: 'failed', reason: record.reason }
    const script = nightFilmScript({
      from, to,
      panels: deps.panels.map((p) => filmPanelOf(p, deps.labelOf(p))),
      timeline: record.entries,
      seenBefore: record.seenBefore,
      tonight: record.tonight,
      queue: deps.queue
    })
    const film = await encodeFilm(script, { onProgress: (done, total) => deps.onProgress?.(done / total) })
    const saved = await bridge.export.nightFilm({ bytes: film.bytes, seconds: film.seconds, redacted: script.redacted })
    return saved
  } catch (error: unknown) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
  } finally {
    flying = false
  }
}

/** The one sentence the button says after it ran. */
export function lastNightWords(r: LastNightResult): { ok: boolean; sentence: string; detail?: string } | null {
  if (r.kind === 'cancelled') return null
  if (r.kind === 'busy') return { ok: false, sentence: 'Last night\'s film is already rendering' }
  if (r.kind === 'failed') return { ok: false, sentence: 'Couldn\'t make last night\'s film', detail: r.reason }
  const scrub = r.redacted === 0 ? '' : ` · ${r.redacted} secret${r.redacted === 1 ? '' : 's'} redacted`
  return { ok: true, sentence: `Saved last night as a ${r.seconds}-second film${scrub}`, detail: r.path }
}
