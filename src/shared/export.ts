import type { TimelineEntry } from './run-ledger'
import type { TonightStatus } from './tonight'

/** M112. What the renderer hands main: the id, and the live buffer when the panel has one. */
export interface PanelTextExportRequest {
  panelId: string
  /**
   * The xterm buffer serialized by `SessionHandle.serialize()`: every real
   * line ending is a `\r\n`, and a display wrap is never one (xterm's own
   * `isWrapped` decides this in the renderer, where the buffer still is —
   * see session-factory.ts). Absent for a never-spawned panel.
   */
  buffer?: string
}

/** M58. What an export did. Five arms for text, three for the picture; never a boolean.
 *  M112 adds `source` to the written arm: the durable log, or the live buffer the
 *  renderer supplied — the palette's feedback says which, because the two differ in
 *  length (the log is ring-trimmed at its stated cap; the buffer at 10 000 rows). */
export type PanelTextExportResult =
  | { kind: 'written'; path: string; lines: number; redacted: number; source: 'log' | 'buffer' }
  | { kind: 'cancelled' }
  | { kind: 'empty' }
  | { kind: 'off' }
  | { kind: 'failed'; reason: string }

export type CanvasPngExportResult =
  | { kind: 'written'; path: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: string }

/** M248. A deck's file, by path — main reads it itself, never a renderer's copy. */
export interface DeckPdfExportRequest { path: string }

/** M248. `pages` is one per slide; `redacted` is the outward gate's count across every slide. */
export type DeckPdfExportResult =
  | { kind: 'written'; path: string; pages: number; redacted: number }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: string }

/** M562 (lane L). The window a night film covers, epoch ms. */
export interface NightFilmRecordRequest { from: number; to: number }

/**
 * M562. What the night left on record: the ledger rows inside the night
 * (tool rows left out — hundreds a night, never a shot), the panels already
 * on record before it, and the Tonight batch, so the renderer can build the
 * script without the panes' 200-row cap.
 */
export type NightFilmRecord =
  | { kind: 'ok'; entries: TimelineEntry[]; seenBefore: string[]; tonight: TonightStatus | null }
  | { kind: 'refused'; reason: string }

/**
 * M563. The finished film. `redacted` is the outward gate's count from the
 * script the frames were drawn from (shared/night-film.ts) — a film is
 * pixels, so its words are scrubbed before they are drawn, never after.
 */
export interface NightFilmExportRequest { bytes: Uint8Array; seconds: number; redacted: number }

export type NightFilmExportResult =
  | { kind: 'written'; path: string; seconds: number; redacted: number }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: string }
