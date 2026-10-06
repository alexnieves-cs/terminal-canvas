/**
 * The colours of the 3D room (M448): one night studio, the same ink as the
 * app's dark ground, in both app themes.
 *
 * M415/M416 painted a high-key studio so the room would not follow the chrome.
 * The redesign reverses that: the ground is the dark `--s-0` (`#0b0d12`), the
 * shells are one neutral, and the only saturated colour in the room is state
 * (eyes, antenna, floor ring, desk screen) read from `state-palette.ts`.
 * Identity stays on the chest light alone, and it is chosen to sit clear of
 * those five state colours (`rd-world.identity.1`).
 *
 * Strings, not THREE.Color, so this file stays three-free and the scene decides
 * how to build a colour. `STUDIO` is the same object as `NIGHT`: WorldOffice,
 * WorldPlatform, WorldProps and WorldStructure are not this lane's, and they
 * already read `STUDIO`.
 */
import { agentWord } from '@renderer/panels/panel-state'
import { STATE_PALETTE, TONE_TO_TOKEN, type PaletteTheme } from '@shared/state-palette'
import type { AgentStatus } from '@shared/world-events'
import type { Tone } from '@renderer/panels/panel-state'
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
 * The chest light only (M448). The shell is `SHELL` for every robot; this
 * list is how a room of them stays distinguishable without borrowing a state
 * colour. Ten long, so the eleventh arrival wraps (`world.critic.hue.3`).
 * The first nine are distinct, so `demo-0…8` still reads as nine figures
 * (`world.critic.hue.1`). Ordered blue / violet / magenta, never a state hue:
 * the old candy set sat inside ΔE 20 of failed, needs and working.
 *
 * Until M417 a robot was `colorOf(agentId)`, the presence hash, and ids that
 * differ only in a trailing digit landed on two or three hues. `colorOf`
 * paints OWNERS on the 2D canvas, never agents.
 */
export const ROBOT_TINTS: readonly string[] = [
  '#2f5bff',
  '#7a3cff',
  '#ff4fa8',
  '#f4f1ea',
  '#2a2e37',
  '#1d4ed8',
  '#a855f7',
  '#1e222a',
  '#4c6fff',
  '#b44cff'
]

/** One shell for every robot. Neutral, and far enough from idle that a resting agent is not the same grey as its body. */
export const SHELL = '#6e6256'

/** Dim trim. Under the bloom cutoff, so a strip does not glow; state does. */
export const TRIM = '#3a4250'

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

/**
 * Feed status → tone, then the frozen palette. Unquoted keys: `verify:rail`
 * `state.2` forbids the display word as a quoted literal outside panel-state.
 * `error` is the exited tone, which paints the failed token. Anything the
 * table does not name takes the busy tone, the same cyan a live agent uses.
 */
const FEED_TONE: Record<AgentStatus, Tone> = {
  working: agentWord('busy').tone,
  thinking: agentWord('busy').tone,
  idle: agentWord('idle').tone,
  waiting_approval: agentWord('wants-you').tone,
  error: 'exited'
}

/** The state colour for a feed status. Theme defaults to dark: the room is the night studio in both app themes. */
export function stateHexForAgent(status: string, theme: PaletteTheme = 'dark'): string {
  const tone = Object.prototype.hasOwnProperty.call(FEED_TONE, status)
    ? FEED_TONE[status as AgentStatus]
    : agentWord('busy').tone
  return STATE_PALETTE[theme][TONE_TO_TOKEN[tone]]
}

export const NIGHT: WorldPalette = {
  ground: '#0b0d12',
  slab: '#12151c',
  desk: '#1a1f28',
  dark: '#0e1116',
  cyan: TRIM,
  cyanCore: '#4a5568',
  amber: stateHexForAgent('waiting_approval'),
  tableTop: '#07080b',
  ink: '#161a22',
  zoneInk: '#868c97'
}

/** The name the rest of the room already imports. Same object as `NIGHT`. */
export const STUDIO: WorldPalette = NIGHT
