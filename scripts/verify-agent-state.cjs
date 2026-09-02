/* Verifies the pure agent-state core: the OSC/DCS-aware BEL scanner and the
   state machine.
   Run with: npm run verify:agent-state

   Plain node, no PTY, no Electron. Every check here guards a failure that is
   SILENT in a running app: a bell found inside a window-title sequence makes
   the border flash on every title change for a reason no user could diagnose
   and no log would explain, and a sequence split across a 16ms flush makes
   that happen intermittently and unreproducibly. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'agent-state.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'agent-state-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  // Carried pre-emptively, exactly as verify-palette.cjs carries it: nothing
  // in this bundle imports a VALUE from @shared today (AgentState is a type,
  // which esbuild erases), and "needs no alias yet" is precisely the state
  // verify-viewport.cjs was in right up until the day it broke.
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const A = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const BEL = '\x07'
const ESC = '\x1b'
const ST = ESC + '\\'

/* Feeds a string through the scanner as ONE chunk. */
function scanWhole(text) {
  return A.scanForBell(A.INITIAL_SCAN, text)
}

/* Feeds a string through the scanner ONE BYTE AT A TIME, which is what a
   16ms flush boundary can do to any sequence. A scanner that is correct only
   on whole chunks passes every check above this one and fails in production
   intermittently. */
function scanSplit(text) {
  let state = A.INITIAL_SCAN
  let bells = 0
  for (const ch of text) {
    const r = A.scanForBell(state, ch)
    state = r.state
    bells += r.bells
  }
  return { state, bells }
}

// 1. A bare BEL in ordinary text is a bell.
ok(1, scanWhole('hello' + BEL + 'world').bells === 1, 'bare BEL rings once')

// 2. THE TRAP. `ESC ] 0 ; title BEL` sets the window title. Claude Code emits
//    exactly this, and a naive indexOf(0x07) reports a bell every time the
//    title changes — a border that flashes constantly with no cause.
ok(2, scanWhole(ESC + ']0;my title' + BEL).bells === 0, 'OSC title rings zero bells')

// 3. The ST-terminated spelling of the same thing.
ok(3, scanWhole(ESC + ']0;my title' + ST).bells === 0, 'ST-terminated OSC rings zero')

// 4. A real bell AFTER an OSC body — the scanner must leave OSC state, or
//    every bell following a title change is swallowed.
ok(4, scanWhole(ESC + ']0;t' + BEL + 'after' + BEL).bells === 1, 'bell after OSC still rings')

// 5. DCS bodies are skipped too, and are terminated ONLY by ST.
ok(5, scanWhole(ESC + 'Psomething' + BEL + 'more' + ST).bells === 0, 'DCS body swallows BEL')

// 5b. A real bell AFTER a DCS body — the mirror of check 4 on the DCS branch.
//     Without this, a regression that broke dcs-esc -> text on ST while
//     leaving the OSC exit intact would pass every other check here.
ok('5b', scanWhole(ESC + 'Psomething' + ST + 'after' + BEL).bells === 1, 'bell after DCS still rings')

// 6. Split one byte at a time: the trap must still not ring.
ok(6, scanSplit(ESC + ']0;my title' + BEL).bells === 0, 'split OSC rings zero')

// 7. Split one byte at a time: a real bell must still ring.
ok(7, scanSplit('hi' + BEL).bells === 1, 'split bare BEL rings once')

// 8. The exact production shape: a title set in one flush, its terminator and
//    a real bell in the next.
{
  const a = A.scanForBell(A.INITIAL_SCAN, ESC + ']0;half a ti')
  const b = A.scanForBell(a.state, 'tle' + BEL + 'now' + BEL)
  ok(8, a.bells === 0 && b.bells === 1, 'OSC straddling a flush: one real bell')
}

// 9. CSI sequences are ordinary and must not swallow a following bell.
ok(9, scanWhole(ESC + '[1;31m' + BEL).bells === 1, 'CSI does not swallow a bell')

// 10. Several bells in one chunk are several bells: the scanner counts, it
//     does not merely detect. The state machine dedupes, not this.
ok(10, scanWhole(BEL + BEL + BEL).bells === 3, 'counts every bell')

const IDLE_MS = 1500

/* Every state-machine check runs against an explicit clock. Nothing here calls
   Date.now(): the machine takes `now` as a parameter precisely so idleness is
   testable without a timer, which is the same reason layout-store.ts takes its
   paths as constructor arguments. */

// 11. A fresh detector is 'starting'. Not 'idle': a panel that has never
//     emitted a byte has not finished anything.
ok(11, A.initialDetector(0).state === 'starting', 'fresh detector starts at starting')

// 12. First bytes move starting -> busy.
{
  const d = A.nextState(A.initialDetector(0), { kind: 'output' }, 10, IDLE_MS)
  ok(12, d.state === 'busy' && d.lastOutputAt === 10, 'first output goes busy')
}

// 13. A tick BEFORE the threshold leaves it busy.
{
  let d = A.nextState(A.initialDetector(0), { kind: 'output' }, 0, IDLE_MS)
  d = A.nextState(d, { kind: 'tick' }, IDLE_MS - 1, IDLE_MS)
  ok(13, d.state === 'busy', 'tick under the threshold stays busy')
}

// 14. A tick AT or past the threshold goes idle.
{
  let d = A.nextState(A.initialDetector(0), { kind: 'output' }, 0, IDLE_MS)
  d = A.nextState(d, { kind: 'tick' }, IDLE_MS, IDLE_MS)
  ok(14, d.state === 'idle', 'tick at the threshold goes idle')
}

// 15. Output while idle goes back to busy.
{
  let d = { state: 'idle', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'output' }, 9000, IDLE_MS)
  ok(15, d.state === 'busy', 'output revives idle to busy')
}

// 16. A bell from busy goes to wants-you.
{
  let d = A.nextState(A.initialDetector(0), { kind: 'output' }, 0, IDLE_MS)
  d = A.nextState(d, { kind: 'bell' }, 100, IDLE_MS)
  ok(16, d.state === 'wants-you', 'bell from busy wants you')
}

// 17. A bell from idle goes to wants-you too — an agent that finished and
//     THEN asked a question is the common case.
{
  const d = A.nextState({ state: 'idle', lastOutputAt: 0, scan: A.INITIAL_SCAN }, { kind: 'bell' }, 5000, IDLE_MS)
  ok(17, d.state === 'wants-you', 'bell from idle wants you')
}

// 18. STICKY. More agent output does NOT clear wants-you. Without this rule a
//     bell followed by one more repaint — which every TUI does — clears the
//     state before the user has looked, and the feature is invisible.
{
  let d = { state: 'wants-you', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'output' }, 100, IDLE_MS)
  ok(18, d.state === 'wants-you', 'output does not clear wants-you')
}

// 19. STICKY over time. A tick does not clear it either — it is cleared by the
//     user acting, never by the clock, or the pips would empty themselves.
{
  let d = { state: 'wants-you', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'tick' }, 60 * 60 * 1000, IDLE_MS)
  ok(19, d.state === 'wants-you', 'an hour of ticks does not clear wants-you')
}

// 20. Acknowledge clears it — to BUSY when output is recent.
{
  let d = { state: 'wants-you', lastOutputAt: 1000, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'acknowledge' }, 1100, IDLE_MS)
  ok(20, d.state === 'busy', 'acknowledge with recent output goes busy')
}

// 21. ...and to IDLE when it is not. The two are not interchangeable: landing
//     on busy for a finished agent would paint it working forever, because
//     nothing further arrives to move it.
{
  let d = { state: 'wants-you', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'acknowledge' }, IDLE_MS + 1, IDLE_MS)
  ok(21, d.state === 'idle', 'acknowledge with stale output goes idle')
}

// 22. Acknowledge on a panel that does not want you changes nothing. It is
//     sent on every focus, so it must be idempotent and cheap.
{
  const d = A.nextState({ state: 'busy', lastOutputAt: 0, scan: A.INITIAL_SCAN }, { kind: 'acknowledge' }, 1, IDLE_MS)
  ok(22, d.state === 'busy', 'acknowledge is a no-op when not wanting you')
}

// 23. Exit wins from anywhere.
{
  const d = A.nextState({ state: 'wants-you', lastOutputAt: 0, scan: A.INITIAL_SCAN }, { kind: 'exit' }, 1, IDLE_MS)
  ok(23, d.state === 'exited', 'exit wins from wants-you')
}

// 24. 'exited' is TERMINAL. A dying process emits its last bytes after the
//     exit is known, and a detector that revived on them would leave a dead
//     panel glowing busy for the rest of the run.
{
  let d = { state: 'exited', lastOutputAt: 0, scan: A.INITIAL_SCAN }
  d = A.nextState(d, { kind: 'output' }, 10, IDLE_MS)
  const afterBell = A.nextState(d, { kind: 'bell' }, 20, IDLE_MS)
  ok(24, d.state === 'exited' && afterBell.state === 'exited', 'exited is terminal')
}

// M52 — osc133.1/.2. scanChunk is scanForBell with a POSITION rather than a
//      bare state (the OSC body has to be carried across a chunk boundary),
//      yielding OSC 133 marks beside the bell count: A (prompt start), B
//      (prompt end), C;<command> (command start — the command line, percent-
//      encoded, which the standard does not carry and the ledger needs) and
//      D;<exit>. A mark's BEL terminator is NOT a bell — that is the whole
//      trap scanForBell exists for, and it must hold for the marks too.
{
  const has = typeof A.scanChunk === 'function' && A.INITIAL_POS !== undefined
  const text = 'x' + ESC + ']133;A' + BEL + '$ ' + ESC + ']133;B' + BEL + ESC + ']133;C;ls%20-la' + BEL + 'out' + BEL + ESC + ']133;D;1' + ST + 'tail'
  const whole = has ? A.scanChunk(A.INITIAL_POS, text) : null
  ok('osc133.1 scanChunk yields A/B/C(command)/D(exit) marks and counts only the genuine bell',
    has && whole.bells === 1 && JSON.stringify(whole.marks) === JSON.stringify([
      { kind: 'A' }, { kind: 'B' }, { kind: 'C', command: 'ls -la' }, { kind: 'D', exit: 1 }]) && whole.pos.state === 'text',
    JSON.stringify(whole))
  // One byte at a time: every mark must still arrive whole, exactly once.
  let pos = has ? A.INITIAL_POS : null
  const marks = []
  let bells = 0
  if (has) for (const ch of text) { const r = A.scanChunk(pos, ch); pos = r.pos; marks.push(...r.marks); bells += r.bells }
  ok('osc133.2 a mark split across chunk boundaries completes on the next chunk, once',
    has && bells === 1 && JSON.stringify(marks) === JSON.stringify([
      { kind: 'A' }, { kind: 'B' }, { kind: 'C', command: 'ls -la' }, { kind: 'D', exit: 1 }]),
    JSON.stringify({ bells, marks }))
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
