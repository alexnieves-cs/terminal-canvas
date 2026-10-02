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
  /** The meeting table's glossy top. */
  readonly tableTop: string
  /** The three floating-cube clusters, brown / teal / purple (muted, like the reference's). */
  readonly cubes: readonly [string, string, string]
  /** Ink for the labels painted onto a texture. */
  readonly ink: string
}

export const STUDIO: WorldPalette = {
  ground: '#eef0f3',
  slab: '#eef0f4',
  desk: '#f8f9fb',
  dark: '#2a2f3a',
  cyan: '#36e6ff',
  cyanCore: '#a6f6ff',
  tableTop: '#07080b',
  cubes: ['#8a5f48', '#3d8a90', '#6b5b9c'],
  ink: '#161a22'
}
