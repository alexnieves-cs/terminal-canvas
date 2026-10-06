/**
 * M454, R-083. The pill's attention sentence, published for the flat room.
 *
 * `world.ctx.door.1` refuses a world file importing `@renderer/canvas/`, and
 * `attentionPillLine` lives there. This is that one sentence after the pill
 * has built it, not a second queue: the pill writes it, the room reads it.
 * Empty is silence, the same as a pill that is not in its attention rest.
 */

let line = ''
const listeners = new Set<() => void>()

export function publishAttentionLine(next: string): void {
  if (next === line) return
  line = next
  for (const listener of listeners) listener()
}

export function attentionLine(): string {
  return line
}

export function subscribeAttentionLine(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
