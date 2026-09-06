/** M112. What the renderer hands main: the id, and the live buffer when the panel has one. */
export interface PanelTextExportRequest {
  panelId: string
  /** The xterm buffer serialized (VT sequences) by `SessionHandle.serialize()`; absent for a never-spawned panel. */
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
