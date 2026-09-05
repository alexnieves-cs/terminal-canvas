import { redactSecrets } from './redact'

/**
 * M96. THE ONE OUTWARD GATE.
 *
 * Pane content leaving the app — a plan's `read`, an agent's context, an
 * export, M103's browser-pane read — passes here and nowhere else. It is
 * `redactSecrets` (M39's scrubber, the one export already applies) plus a
 * note naming WHERE the content came from and how many placeholders were
 * written, so the caller can say so beside what it shows. One gate rather
 * than one call per reader, because a reader added later that forgets the
 * call has no symptom at all: the token simply goes with the text.
 *
 * Pure; `verify:verbs gate.1` plants a token in a real scrollback log and
 * reads it back through this.
 */
export interface Outward {
  text: string
  redacted: number
  /** `from panel p1 · 1 secret redacted`, or `from panel p1` when nothing was. */
  note: string
}

export function outward(text: string, source: string): Outward {
  const { text: scrubbed, count } = redactSecrets(text)
  const note = count === 0 ? `from ${source}` : `from ${source} · ${count} secret${count === 1 ? '' : 's'} redacted`
  return { text: scrubbed, redacted: count, note }
}
