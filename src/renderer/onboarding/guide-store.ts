/**
 * M644. Whether the guided first canvas is running, outside React.
 *
 * Kept where the first-run card keeps its own "done" (localStorage): it is a
 * fact about this install's first hour, not a preference anyone edits, and it
 * must survive a relaunch in the middle of the tour. Three values: absent
 * (never started: someone who set up before this existed is not interrupted),
 * `on:<step>` and `done`.
 */

const KEY = 'tc.guide'
const listeners = new Set<() => void>()

function read(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null || !raw.startsWith('on:')) return null
    const n = Number(raw.slice(3))
    return Number.isInteger(n) && n >= 0 ? n : 0
  } catch { return null }
}

let step: number | null = typeof window === 'undefined' ? null : read()

function write(next: number | null, ended: boolean): void {
  step = next
  try { window.localStorage.setItem(KEY, ended || next === null ? 'done' : `on:${next}`) } catch { /* the tour may return next launch */ }
  for (const listener of listeners) listener()
}

/** The step the guide is on, or null when it is not running. */
export function guideStepIndex(): number | null {
  return step
}

export function subscribeGuide(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Begin at step one. The first-run card calls this as it closes, finished or skipped; never twice. */
export function startGuide(): void {
  try { if (window.localStorage.getItem(KEY) !== null) return } catch { return }
  write(0, false)
}

export function setGuideStep(next: number): void {
  if (step === null) return
  write(next, false)
}

export function endGuide(): void {
  if (step === null) return
  write(null, true)
}
