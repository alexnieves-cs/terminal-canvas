/**
 * The colours of the 3D room (M416): a lit STUDIO, pale in both app themes.
 *
 * Until M415 the room read its colours off the live app theme (`--s-0`,
 * `--deck-surface`, …), which made it a dark game level under the dark app.
 * The reference is a high-key studio — a pale ground, light slabs, a black
 * glossy table, cyan light — and what the cards and robots are drawn against
 * is that room, not the chrome around it, so the room no longer follows the
 * theme (the cards' white glass tokens already took this stance in M415).
 * Strings, not THREE.Color, so this file stays three-free and the scene decides
 * how to build a colour.
 */
export interface WorldPalette {
  /** The page ground the canvas sits on, and the fog it fades into. */
  readonly ground: string
  /** The platform's top and walls. */
  readonly slab: string
  /** The desks' bodies — a notch lighter than the slab so they read against it. */
  readonly desk: string
  /** Screens, keyboards, legs: the dark parts of the furniture. */
  readonly dark: string
  /** The glowing trim and the table's edge line — and the tint of the halo around them. */
  readonly cyan: string
  /** The line itself, a shade whiter than its halo: the bright core of a lit strip. */
  readonly cyanCore: string
  /** The decision table's line while anyone waits on a person (M422), and a conflict line's (M423): the app's amber. */
  readonly amber: string
  /** The meeting table's glossy top. */
  readonly tableTop: string
  /** Ink for the labels painted onto a texture. */
  readonly ink: string
  /** The zone sign's grey (M417): a room label, quieter than any agent. */
  readonly zoneInk: string
}

/**
 * The robots' shells (M417), after the reference's toys: eight candy hues plus
 * a white and a graphite one, so a room reads as ten different figures, not as
 * shades of one. ORDERED so that neighbours are far apart (an orange is never
 * followed by a red or a yellow), because a robot takes the next one in the
 * order agents arrived in (`robotTint`).
 *
 * Until M417 a robot was `colorOf(agentId)`, the presence hash, and ids that
 * differ only in a trailing digit — every demo roster, `demo-0…8`, `agent-1…6` —
 * landed on two or three hues (FNV-1a's last step is one multiply, so the last
 * character moves the low bits in a fixed pattern, and `% 360` keeps exactly
 * those). `colorOf` paints OWNERS on the 2D canvas, never agents, so nothing
 * there had to keep matching.
 *
 * Pre-saturated, and dark enough to survive ACES (which greys a light candy to
 * pastel): the shell takes the hex as it is, with no saturation push, which
 * is also what keeps the white and the graphite white and graphite.
 */
export const ROBOT_TINTS: readonly string[] = [
  '#ff6a14', // orange
  '#2763ff', // blue
  '#22c94a', // green
  '#ee2b4a', // red
  '#9a36f5', // purple
  '#f2f3f5', // white
  '#ffc614', // yellow
  '#ff4fa8', // pink
  '#11b9b2', // teal
  '#2a2e37'  // graphite
]

/** Ids in the world's own namespace (the board's `world:you`) are not agents and take no tint. */
const OWN_NAMESPACE = 'world:'

/**
 * An agent's shell colour: the tint at its place in the order the feed FIRST
 * named agents (`getAgentIds`, append-only), counting only agents. That order
 * never reshuffles — a newcomer is appended, a dormant agent keeps its place —
 * so a robot keeps its colour for the session, and the first ten agents are ten
 * different colours however alike their ids are. An id not in the order (a
 * caller with no store) falls back to a well-mixed hash of the id itself.
 */
export function robotTint(agentId: string, order: readonly string[]): string {
  return ROBOT_TINTS[seatIndex(agentId, order) % ROBOT_TINTS.length]!
}

/**
 * An agent's place in the first-seen order, counting only agents — the index
 * its tint is read at, and (the richness pass) its desk's accessory. One count
 * for both, so a robot's colour and its desk never disagree about who came first.
 */
export function seatIndex(agentId: string, order: readonly string[]): number {
  let seen = 0
  for (const id of order) {
    if (id.startsWith(OWN_NAMESPACE)) continue
    if (id === agentId) return seen
    seen++
  }
  return mixedHash(agentId)
}

/** FNV-1a, then murmur3's finaliser: every input bit reaches every output bit, so `id-1` and `id-2` are not neighbours. */
function mixedHash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export const STUDIO: WorldPalette = {
  ground: '#eef0f3',
  slab: '#eef0f4',
  desk: '#f8f9fb',
  dark: '#2a2f3a',
  cyan: '#36e6ff',
  cyanCore: '#a6f6ff',
  amber: '#ffb02e',
  tableTop: '#07080b',
  ink: '#161a22',
  zoneInk: '#868c97'
}
