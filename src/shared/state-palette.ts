/**
 * M436. THE ONE STATE COLOUR, for readers that cannot see a stylesheet.
 *
 * WebGL and canvas-2D paint with hex, and a `var(--state-*)` string does not
 * resolve there. This module is the same closed set the theme blocks declare,
 * both themes, so a robot's eye and a panel's edge cannot drift into two
 * cyans. No DOM: a main-process import of shared/ must not reach the renderer,
 * which is why the tone union lives in redesign-contracts.ts and this file
 * does not import panel-state.ts.
 *
 * Dark values are CONCEPT.md's table (D1's selection ring included). Light
 * values are re-derived against verify:styles check 11 — the dark hexes fail
 * that floor on a light ground, so they are not copied. The ledger records
 * each light hex and why.
 */
import type { StateTone } from './redesign-contracts'

export const PALETTE_TOKENS = [
  '--state-working',
  '--state-needs',
  '--state-done',
  '--state-failed',
  '--state-idle',
  '--external',
  '--guide',
  '--state-select'
] as const

export type PaletteToken = typeof PALETTE_TOKENS[number]
export type PaletteTheme = 'dark' | 'light'

export const STATE_PALETTE: Record<PaletteTheme, Record<PaletteToken, string>> = {
  dark: {
    '--state-working': '#5BE1E6',
    '--state-needs': '#F5B544',
    '--state-done': '#5EDC9A',
    '--state-failed': '#FF6B6B',
    '--state-idle': '#8C94A5',
    '--external': '#A78BFA',
    '--guide': '#FF5FA2',
    '--state-select': '#A6F6FF'
  },
  light: {
    '--state-working': '#348184',
    '--state-needs': '#9F762C',
    '--state-done': '#3C8C62',
    '--state-failed': '#CD5656',
    '--state-idle': '#777B83',
    '--external': '#7D64C4',
    '--guide': '#C44778',
    '--state-select': '#668084'
  }
}

/**
 * Which token a tone paints with. starting breathes in the working cyan;
 * kind, asleep, none and idle are the one slate. exited is the failed token
 * (the tone's name stays `exited` — the word is `exited N`).
 */
export const TONE_TO_TOKEN: Record<StateTone, PaletteToken> = {
  working: '--state-working',
  starting: '--state-working',
  'needs-you': '--state-needs',
  done: '--state-done',
  exited: '--state-failed',
  idle: '--state-idle',
  asleep: '--state-idle',
  none: '--state-idle',
  kind: '--state-idle'
}

/** The accent names that must stay equal to a state token, or the old blue/green split returns under another name. */
export const ACCENT_ALIAS: Record<string, PaletteToken> = {
  '--blue': '--state-working',
  '--iris': '--state-working',
  '--amber': '--state-needs',
  '--green': '--state-done',
  '--red': '--state-failed'
}

export function stateHexes(): string[] {
  const set = new Set<string>()
  for (const theme of Object.values(STATE_PALETTE)) {
    for (const hex of Object.values(theme)) set.add(hex.toLowerCase())
  }
  return [...set]
}
