import { PANEL_H, PANEL_W } from './panels'

/**
 * M443. Where the pointer last was, in world units. Module state so onSpawn
 * (declared long before the canvas's later hooks) can read it without a new
 * hook in the middle of Canvas. Null until the mouse has moved over the canvas,
 * which is what keeps an unmoved Cmd+N on the view centre.
 */
let cursor: { x: number; y: number } | null = null

export function noteSpawnCursor(point: { x: number; y: number } | null): void {
  cursor = point === null ? null : { x: point.x, y: point.y }
}

export function spawnCursor(): { x: number; y: number } | null {
  return cursor === null ? null : { x: cursor.x, y: cursor.y }
}

/** The selected panel's size, or the default terminal, when a cursor spawn names no preset size. */
export function spawnSize(
  panels: readonly { rect: { id: string; w: number; h: number } }[],
  selected: ReadonlySet<string>
): { w: number; h: number } {
  if (selected.size === 1) {
    const id = [...selected][0]
    const panel = panels.find((candidate) => candidate.rect.id === id)
    if (panel !== undefined) return { w: panel.rect.w, h: panel.rect.h }
  }
  return { w: PANEL_W, h: PANEL_H }
}

export interface ArmedSpawn { from: string; at: { x: number; y: number } }

let armed: ArmedSpawn | null = null

export function armConnectedSpawn(next: ArmedSpawn): void {
  armed = next
}

/** One shot. The next onSpawn places at `at` and links back to `from`. */
export function takeArmedSpawn(): ArmedSpawn | null {
  const next = armed
  armed = null
  return next
}

export function clearArmedSpawn(): void {
  armed = null
}

export interface ConnectedRequest { from: string; at: { x: number; y: number }; name: string }

type Opener = (request: ConnectedRequest | null) => void
let opener: Opener | null = null

export function setConnectedOpener(next: Opener | null): void {
  opener = next
}

export function openConnectedSpawn(from: string, at: { x: number; y: number }, name: string): void {
  opener?.({ from, at, name })
}
