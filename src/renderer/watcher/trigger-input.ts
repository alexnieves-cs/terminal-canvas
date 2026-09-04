import { WATCH_TIMER_MIN_MS, type WatchTrigger } from '@shared/watch-trigger'

/**
 * M84. What a person types in the palette's trigger line, as a trigger.
 *
 * The accepted spellings are the ones the NODE SHOWS, so what a user types is
 * what they read back afterwards: `every 10m`, `branch`, or a path (relative
 * to the panel's directory, or absolute). Anything else is refused and the
 * line re-prompts with what to try — a parse that guessed would arm a real
 * command against the wrong thing, and the user would find out by watching it
 * never run.
 *
 * A `panel` trigger is deliberately NOT typed here: its source is a node on
 * the canvas, which is a link drawn between two panels, not a word.
 */
export function parseTriggerWords(text: string, root: string, source?: { id: string; label: string }): WatchTrigger | null {
  const t = text.trim()
  if (t === '') return null
  // `after this` / `when this passes` — the SELECTED panel as the source. This
  // is the milestone's headline sentence ("when the tests pass, tell the
  // agent") and without it a `panel` trigger was reachable only by editing
  // layout.json by hand (M84's verifier). The words are the ones the node
  // will show back, with the panel's own label in place of `this`.
  if (source !== undefined) {
    if (/^(?:after|when)\s+this\s+(?:passes|exits\s*0|succeeds)$/i.test(t)) return { kind: 'panel', sourceId: source.id, on: 'exit-ok' }
    if (/^(?:after|when)\s+this\s+fails$/i.test(t)) return { kind: 'panel', sourceId: source.id, on: 'exit-fail' }
    if (/^(?:after|when)\s+this(?:\s+ends|\s+exits)?$/i.test(t)) return { kind: 'panel', sourceId: source.id, on: 'exit' }
    if (/^(?:after|when)\s+this\s+(?:finishes|is\s+idle|finishes\s+a\s+turn)$/i.test(t)) return { kind: 'panel', sourceId: source.id, on: 'idle' }
  }
  // A word that LOOKS like one of those and is not must be refused, never
  // read as a path: `after this thing` as a directory name is a watcher armed
  // against something that does not exist, discovered by never firing.
  if (/^(?:after|when)\b/i.test(t)) return null
  if (/^branch$|^git$|^head$|^when the branch moves$/i.test(t)) return { kind: 'git-ref', root }
  const every = /^(?:every\s+)?(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hours?)$/i.exec(t)
  if (every !== null) {
    const n = Number(every[1])
    const unit = (every[2] ?? 'm').toLowerCase()
    const ms = unit.startsWith('h') ? n * 3600_000 : unit.startsWith('m') && unit !== 'ms' ? n * 60_000 : n * 1000
    // Below the floor is refused, not clamped: a user who asked for every
    // second must be told the shortest interval, not quietly given a
    // different watcher from the one they described.
    if (ms < WATCH_TIMER_MIN_MS) return null
    return { kind: 'timer', everyMs: ms }
  }
  // Anything that ENDS in a duration was meant to be a timer, however it was
  // spelled: `evry 10m` read as a path arms a real command against a
  // directory named `evry 10m`, and the user finds out by watching it never
  // run (M84's verifier). Refused, so the line re-prompts with what to try.
  if (/^every\b/i.test(t) || /\b\d+\s*(?:s|sec|secs|seconds?|m|min|mins|minutes?|h|hours?)$/i.test(t)) return null
  const path = t.startsWith('/') ? t : `${root.replace(/\/+$/, '')}/${t.replace(/^\.\//, '')}`
  return { kind: 'path', path }
}
