/**
 * The agent-state detector: a BEL scanner and a state machine, both pure.
 *
 * This module imports nothing at RUNTIME — not electron, not node-pty, not
 * node:fs; its one import is a type, which the compiler erases. That is
 * deliberate and load-bearing: it is what puts the two pieces most able to
 * be subtly wrong into the cheapest, fastest verify tier the repo has, next to
 * tmux-args.ts and presets.ts. If this file ever needs a PTY or a window, the
 * impure part belongs in pty-manager.ts.
 */

// Type-only, and it must stay that way: an erased import is what keeps this
// module free of any runtime dependency at all, which is the whole reason it
// sits in the plain-node verify tier next to tmux-args.ts.
import type { AgentState } from '../shared/types'

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
  const r = scanChunk({ state, osc: '' }, chunk)
  return { state: r.pos.state, bells: r.bells }
}

/**
 * M52. The scanner's POSITION: the grammar state plus the OSC body being
 * accumulated, because an OSC 133 mark can straddle a 16ms flush boundary
 * and has to complete on the next chunk. Only a body that can still be an
 * OSC 133 mark is kept (the prefix is checked as it arrives, and the body is
 * capped), so a window title costs nothing and the hot path stays a byte
 * loop.
 */
export interface ScanPos { state: ScanState; osc: string }
export const INITIAL_POS: ScanPos = { state: 'text', osc: '' }

/** An OSC 133 mark: prompt start, prompt end, command start (with the command), command end (with the exit code). */
export type OscMark =
  | { kind: 'A' }
  | { kind: 'B' }
  | { kind: 'C'; command: string }
  | { kind: 'D'; exit: number | null }

const OSC_PREFIX = '133;'
const OSC_MAX = 4096

function markOf(body: string): OscMark | null {
  if (!body.startsWith(OSC_PREFIX)) return null
  const rest = body.slice(OSC_PREFIX.length)
  const kind = rest[0]
  const payload = rest.length > 1 && rest[1] === ';' ? rest.slice(2) : ''
  if (kind === 'A') return { kind: 'A' }
  if (kind === 'B') return { kind: 'B' }
  if (kind === 'C') {
    let command = payload
    try { command = decodeURIComponent(payload) } catch { /* the hook percent-encodes; a stray % is kept as typed */ }
    return { kind: 'C', command }
  }
  if (kind === 'D') {
    const n = payload === '' ? null : Number(payload)
    return { kind: 'D', exit: n === null || !Number.isFinite(n) ? null : n }
  }
  return null
}

/**
 * scanForBell with a position and the OSC 133 marks it saw. A mark's own BEL
 * terminator is NOT a bell — the trap scanForBell exists for holds for the
 * marks too. Runs on every chunk at the choke point and must never bump
 * anything higher-frequency than the per-command events it yields.
 */
export function scanChunk(pos: ScanPos, chunk: string): { pos: ScanPos; bells: number; marks: OscMark[]; ends: number[] } {
  let bells = 0
  let s = pos.state
  let osc = pos.osc
  const marks: OscMark[] = []
  // M306. Where each mark's terminator ENDS in this chunk, parallel to
  // `marks` — a separate array so a mark's own shape (which verifiers compare
  // whole) is unchanged. It is what lets a command's captured output be the
  // bytes between C and D rather than whole chunks with the prompt attached.
  const ends: number[] = []
  let i = 0
  const endOsc = (): void => {
    const mark = markOf(osc)
    if (mark) { marks.push(mark); ends.push(i + 1) }
    osc = ''
  }
  const take = (c: number): void => {
    // Accumulate only while the body can still be a mark: the prefix must
    // match as it arrives, and the whole body is capped.
    if (osc.length < OSC_MAX && (osc.length >= OSC_PREFIX.length ? osc.startsWith(OSC_PREFIX) : OSC_PREFIX.startsWith(osc + String.fromCharCode(c)) || osc.startsWith(OSC_PREFIX))) osc += String.fromCharCode(c)
    else if (osc.length < OSC_PREFIX.length) osc = '\u0000' // poisoned: cannot become a mark, and never matches the prefix
  }
  for (i = 0; i < chunk.length; i += 1) {
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
        if (c === 0x5d) { s = 'osc'; osc = '' }
        else if (c === 0x50 || c === 0x58 || c === 0x5e || c === 0x5f) s = 'dcs'
        else if (c === ESC) s = 'esc'
        else s = 'text'
        break
      case 'osc':
        // An OSC string is terminated by BEL *or* by ST. This BEL is the
        // terminator, not a bell — it is the whole trap.
        if (c === BEL) { s = 'text'; endOsc() }
        else if (c === ESC) s = 'osc-esc'
        else take(c)
        break
      case 'osc-esc':
        if (c === 0x5c) { s = 'text'; endOsc() } // ST
        else if (c === ESC) s = 'osc-esc'
        else { s = 'osc'; take(c) }
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
  return { pos: { state: s, osc }, bells, marks, ends }
}

/**
 * The detector's whole memory for one panel.
 *
 * `lastOutputAt` is why this is a record rather than the bare AgentState the
 * design sketch named: "no bytes for idleAfterMs" is a claim about WHEN the
 * last byte arrived, and a function handed only the current state cannot make
 * it. Carrying the scanner's position here too means one object per session
 * rather than two parallel maps that can fall out of step.
 */
export interface Detector {
  state: AgentState
  lastOutputAt: number
  /** M52: the scanner's position, not only its state — an OSC 133 mark can straddle a flush. */
  scan: ScanPos
}

export type AgentEvent =
  | { kind: 'output' }
  | { kind: 'bell' }
  /** The slow tick. Idleness is the absence of output, so only a clock can see it. */
  | { kind: 'tick' }
  /** The user acted on this panel: typed into it, or looked at it. */
  | { kind: 'acknowledge' }
  | { kind: 'exit' }

export function initialDetector(now: number): Detector {
  // 'starting', not 'idle': a panel that has never emitted a byte has not
  // finished anything, and painting it idle at spawn would make the very first
  // thing the user sees a lie.
  return { state: 'starting', lastOutputAt: now, scan: INITIAL_POS }
}

/**
 * The state machine:
 *
 *   starting --first bytes--> busy
 *   busy --no bytes for idleAfterMs--> idle
 *   (busy | idle) --bell--> wants-you
 *   wants-you --user input to this panel, or focus--> busy | idle
 *   any --pty exit--> exited
 *
 * Pure, and takes `now` as a parameter, so every transition above is testable
 * under plain node without a timer.
 */
export function nextState(
  prev: Detector,
  event: AgentEvent,
  now: number,
  idleAfterMs: number
): Detector {
  // Terminal. A dying process emits its last bytes AFTER onExit is known —
  // pty-manager flushes the pending buffer before announcing the exit — and a
  // detector that revived on them would leave a dead panel glowing busy for
  // the rest of the run.
  if (prev.state === 'exited') return prev
  if (event.kind === 'exit') return { ...prev, state: 'exited' }

  switch (event.kind) {
    case 'output':
      // wants-you is STICKY: it survives further output. A TUI repaints after
      // asking its question, so clearing on output would clear the state
      // milliseconds after setting it and the feature would never be seen.
      return {
        ...prev,
        lastOutputAt: now,
        state: prev.state === 'wants-you' ? 'wants-you' : 'busy'
      }
    case 'bell':
      // The bell is the only signal that carries INTENT. Idleness cannot tell
      // "finished" from "asked a question"; this can, which is why M6d's
      // notification will be gated on this state and not on idleness.
      return { ...prev, lastOutputAt: now, state: 'wants-you' }
    case 'tick':
      if (prev.state !== 'busy') return prev
      return now - prev.lastOutputAt >= idleAfterMs ? { ...prev, state: 'idle' } : prev
    case 'acknowledge':
      // Cleared by the user acting on the panel, never by the clock — without
      // that rule a bell from an hour ago still glows and the attention set
      // never empties. Which state it lands in is not a detail: landing on
      // busy for an agent that has finished would paint it working forever,
      // since nothing further arrives to move it along.
      if (prev.state !== 'wants-you') return prev
      return {
        ...prev,
        state: now - prev.lastOutputAt >= idleAfterMs ? 'idle' : 'busy'
      }
  }
}
