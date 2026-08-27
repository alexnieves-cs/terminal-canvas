/**
 * The agent-state detector: a BEL scanner and a state machine, both pure.
 *
 * This module imports NOTHING — not electron, not node-pty, not node:fs. That
 * is deliberate and load-bearing: it is what puts the two pieces most able to
 * be subtly wrong into the cheapest, fastest verify tier the repo has, next to
 * tmux-args.ts and presets.ts. If this file ever needs a PTY or a window, the
 * impure part belongs in pty-manager.ts.
 */

/**
 * Where the scanner is in the escape grammar. It has to be carried BETWEEN
 * calls: output is flushed every 16ms, so an OSC body can straddle two
 * chunks, and a per-chunk function would re-enter the tail of a window title
 * as ordinary text and ring a bell on a title change — intermittently, and
 * only under load, which is the worst shape a bug can have.
 */
export type ScanState = 'text' | 'esc' | 'osc' | 'osc-esc' | 'dcs' | 'dcs-esc'

export const INITIAL_SCAN: ScanState = 'text'

const BEL = 0x07
const ESC = 0x1b

/**
 * Counts genuine terminal bells in `chunk`, skipping the ones that are merely
 * an OSC or DCS string terminator.
 *
 * `ESC ] 0 ; <title> BEL` sets the window title, and Claude Code emits exactly
 * that. A plain `indexOf('\x07')` therefore reports a bell on every title
 * change: the panel's border flashes constantly, for a reason no user could
 * diagnose and no log would explain. This is the one piece of real work the
 * spec's "put the detector at the choke point" decision costs.
 *
 * Returns the count, not a boolean, because the caller may want to know that
 * output was noisy; deduping into a single state change is the state
 * machine's job, not this function's.
 */
export function scanForBell(
  state: ScanState,
  chunk: string
): { state: ScanState; bells: number } {
  let bells = 0
  let s = state
  for (let i = 0; i < chunk.length; i += 1) {
    const c = chunk.charCodeAt(i)
    switch (s) {
      case 'text':
        if (c === ESC) s = 'esc'
        else if (c === BEL) bells += 1
        break
      case 'esc':
        // ESC ] opens an OSC string; ESC P (DCS), ESC X (SOS), ESC ^ (PM) and
        // ESC _ (APC) all open string bodies terminated only by ST. Everything
        // else — CSI included — is a short sequence that cannot contain a BEL,
        // so returning to text is both correct and the safe direction.
        if (c === 0x5d) s = 'osc'
        else if (c === 0x50 || c === 0x58 || c === 0x5e || c === 0x5f) s = 'dcs'
        else if (c === ESC) s = 'esc'
        else s = 'text'
        break
      case 'osc':
        // An OSC string is terminated by BEL *or* by ST. This BEL is the
        // terminator, not a bell — it is the whole trap.
        if (c === BEL) s = 'text'
        else if (c === ESC) s = 'osc-esc'
        break
      case 'osc-esc':
        if (c === 0x5c) s = 'text' // ST
        else if (c === ESC) s = 'osc-esc'
        else s = 'osc'
        break
      case 'dcs':
        // DCS is terminated ONLY by ST. A BEL inside one is body content and
        // is ignored — the safe direction: a missed bell is quiet, a spurious
        // one is a flashing border.
        if (c === ESC) s = 'dcs-esc'
        break
      case 'dcs-esc':
        if (c === 0x5c) s = 'text'
        else if (c === ESC) s = 'dcs-esc'
        else s = 'dcs'
        break
    }
  }
  return { state: s, bells }
}
