/**
 * M173. THE HINTS AS DATA. M48's four gesture hints and the tmux notice are
 * one list: each an id (persisted under `hints.seen` once a person has used
 * the gesture or dismissed the notice) and a SENTENCE. The fixed hint strip
 * that carried them was a strip that itself needed explaining (the brief,
 * finding 5); they live where a person needs them — the rail's empty state
 * (the gestures) and the launcher (the tmux notice, a first-run banner) — and
 * a seen id never comes back. Pure; `verify:rail hints.1`.
 */
export type HintId = 'pan' | 'zoom' | 'palette' | 'new-panel' | 'tmux'
export interface Hint { id: HintId; text: string; where: 'rail' | 'launcher' }

export const HINTS: ReadonlyArray<Hint> = [
  { id: 'pan', text: 'A two-finger drag pans the canvas.', where: 'rail' },
  { id: 'zoom', text: 'A pinch, or ⌘= and ⌘−, zooms it.', where: 'rail' },
  { id: 'palette', text: '⌘K opens the palette with every verb.', where: 'rail' },
  { id: 'new-panel', text: '⌘N starts a panel where the camera is.', where: 'rail' },
  { id: 'tmux', text: 'No tmux was found, so sessions end when the app reloads — install tmux to keep agents running across a relaunch.', where: 'launcher' }
]

/** `where` narrows to one surface's hints; both surfaces read this one list (the Act III critic: two readers of one list had drifted). */
export function hintsLeft(seen: ReadonlySet<string>, where?: Hint['where']): Hint[] {
  return HINTS.filter((h) => !seen.has(h.id) && (where === undefined || h.where === where))
}

/** The tmux notice's own sentence, the launcher's banner text. A dismissal outlives an install: the Environment report still states the backend, and a notice that came back after every relaunch would be a strip again. */
export const TMUX_HINT: Hint = HINTS[4]

/**
 * M262. TAUGHT AFTER AN ATTEMPT, ONE AT A TIME. Four sentences at rest were
 * four instructions before a person had tried anything — the review's
 * complaint. The rail now carries a hint only once the person has reached
 * for its gesture the wrong way (Canvas.tsx's attempt listener: a mouse drag
 * on the empty canvas is a reach for pan, a mouse wheel for zoom, typing into
 * nothing for the palette, a double-click for a new panel), and only that
 * one. A seen id still never comes back.
 */
export function contextualHint(seen: ReadonlySet<string>, attempted: HintId | null): Hint[] {
  if (attempted === null) return []
  return hintsLeft(seen, 'rail').filter((h) => h.id === attempted)
}

/** What an input on the empty canvas was reaching for, or null. Pure — the listener hands it the facts. */
export function attemptOf(e: { type: string; button?: number; deltaMode?: number; ctrlKey?: boolean; metaKey?: boolean; key?: string }): HintId | null {
  if (e.type === 'mousedown' && e.button === 0) return 'pan'
  if (e.type === 'wheel' && e.ctrlKey !== true && e.deltaMode === 1) return 'zoom'
  if (e.type === 'dblclick') return 'new-panel'
  if (e.type === 'keydown' && e.metaKey !== true && e.ctrlKey !== true && typeof e.key === 'string' && e.key.length === 1) return 'palette'
  return null
}
