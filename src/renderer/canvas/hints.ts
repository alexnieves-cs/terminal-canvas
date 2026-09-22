/**
 * M173. THE HINTS AS DATA. M48's four gesture hints and the tmux notice are
 * one list: each an id (persisted under `hints.seen` once a person has used
 * the gesture or dismissed the notice) and a SENTENCE. The fixed hint strip
 * that carried them was a strip that itself needed explaining (the brief,
 * finding 5); they live where a person needs them — the rail's empty state
 * (the gestures) and the launcher (the tmux notice, a first-run banner) — and
 * a seen id never comes back. Pure; `verify:rail hints.1`.
 */
export type HintId = 'pan' | 'zoom' | 'palette' | 'new-panel' | 'tmux' | 'starter' | 'first-task'
export interface Hint { id: HintId; text: string; where: 'rail' | 'launcher' }

export const HINTS: ReadonlyArray<Hint> = [
  { id: 'pan', text: 'A two-finger drag pans the canvas.', where: 'rail' },
  { id: 'zoom', text: 'A pinch, or ⌘= and ⌘−, zooms it.', where: 'rail' },
  { id: 'palette', text: '⌘K opens the palette with every verb.', where: 'rail' },
  { id: 'new-panel', text: '⌘N starts a panel where the camera is.', where: 'rail' },
  // The launcher's "Keep agents running between sessions" row states the
  // benefit; this is its "How" disclosure, so the mechanism is named here.
  { id: 'tmux', text: 'Sessions stay alive across a reload or relaunch when tmux is installed — without it, each one ends with the app. Install tmux (for example, brew install tmux), then relaunch.', where: 'launcher' },
  // M205 critic 2.4: the starter canvas lives inside the closed "More ways to
  // start" disclosure on purpose (D09's header — a tour is not the primary),
  // but that leaves it with no door a first-time person would ever open. One
  // sentence, pointing at exactly where it is, shown until dismissed like the
  // tmux notice beside it.
  { id: 'starter', text: 'New to terminal canvas? A starter canvas — under More ways to start, below — walks through one example of every kind of object.', where: 'launcher' }
]

/** `where` narrows to one surface's hints; both surfaces read this one list (the Act III critic: two readers of one list had drifted). */
export function hintsLeft(seen: ReadonlySet<string>, where?: Hint['where']): Hint[] {
  return HINTS.filter((h) => !seen.has(h.id) && (where === undefined || h.where === where))
}

/** The tmux notice's own sentence, the launcher's banner text. A dismissal outlives an install: the Environment report still states the backend, and a notice that came back after every relaunch would be a strip again. */
export const TMUX_HINT: Hint = HINTS[4]
/** The starter-canvas discoverability line, the same "shown until dismissed" shape as `TMUX_HINT`. */
export const STARTER_HINT: Hint = HINTS[5]

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

/**
 * THE FIRST START'S HANDOFF. One dismissible line after the first task is made,
 * worded from the conversation's ACTUAL state rather than a tour's script:
 * what is happening now, and what the person can do next. `sent` is whether
 * the sentence went to the agent (Start task sends it; a conversation-only
 * start inserts it and waits). Null when there is nothing to hand off — the
 * session ended, and the panel says so itself. Not in HINTS: it has no surface
 * of its own before a start, only a `hints.seen` id so it is shown once.
 */
export type FirstTaskStatus = 'not-started' | 'starting' | 'ready' | 'streaming' | 'exited' | 'disposed'
export function firstTaskHint(status: FirstTaskStatus | undefined, turns: number, sent: boolean): string | null {
  if (status === 'exited' || status === 'disposed') return null
  if (status === undefined || status === 'not-started' || status === 'starting') return 'Your agent is starting.'
  if (status === 'streaming') return 'Your agent is working on it. Anything you type now is a follow-up.'
  if (turns === 0 && !sent) return 'Send your first message — your sentence is already in the composer.'
  return 'Your agent answered. Read it in the conversation, or type a follow-up.'
}
