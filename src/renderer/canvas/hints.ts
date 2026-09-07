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
export interface Hint { id: HintId; text: string }

export const HINTS: ReadonlyArray<Hint> = [
  { id: 'pan', text: 'A two-finger drag pans the canvas.' },
  { id: 'zoom', text: 'A pinch, or ⌘= and ⌘−, zooms it.' },
  { id: 'palette', text: '⌘K opens the palette with every verb.' },
  { id: 'new-panel', text: '⌘N starts a panel where the camera is.' },
  { id: 'tmux', text: 'No tmux was found, so sessions end when the app reloads — install tmux to keep agents running across a relaunch.' }
]

export function hintsLeft(seen: ReadonlySet<string>): Hint[] {
  return HINTS.filter((h) => !seen.has(h.id))
}
