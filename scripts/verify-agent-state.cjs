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

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
