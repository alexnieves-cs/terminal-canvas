/** M58. What an export did. Five arms for text, three for the picture; never a boolean. */
export type PanelTextExportResult =
  | { kind: 'written'; path: string; lines: number; redacted: number }
  | { kind: 'cancelled' }
  | { kind: 'empty' }
  | { kind: 'off' }
  | { kind: 'failed'; reason: string }

export type CanvasPngExportResult =
  | { kind: 'written'; path: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: string }
