/* Verifies the shell's pure row construction.
   Run with: npm run verify:rail

   Plain node, like verify:viewport and verify:palette: rail-rows.ts imports
   nothing from electron or node-pty and never touches the DOM, so the rail's
   two most easily-wrong pieces — the honest chain and the 60Hz signature —
   sit in the fastest tier rather than needing a real Electron window. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'rail.cjs')
buildSync({
  entryPoints: [join(__dirname, 'rail-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Nothing in this bundle imports a VALUE from @shared or @renderer today —
  // rail-rows.ts's two imports are `import type`, which esbuild erases. The
  // aliases are here pre-emptively for the reason CLAUDE.md records about
  // verify-palette.cjs: needing no alias YET is exactly the state
  // verify-viewport.cjs was in right up until the day it broke.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const R = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

// A panel as panels.ts builds one, trimmed to the fields rail-rows reads.
// `rect` is carried in full BECAUSE it is what check 10 moves: a signature
// that ignored rects by construction would make that check vacuous.
const panel = (id, over = {}) => ({
  rect: { id, x: 0, y: 0, w: 720, h: 460 },
  z: 1,
  spec: { cwd: '~', args: [] },
  ...over
})
const running = (pid, command) => ({ kind: 'running', pid, command, cwd: '~', reattached: false })
const NONE = new Set()
const statuses = (map) => (id) => map[id]

/* ---- The honest chain ---- */

// 1. A user's own title outranks every other link. It is the only one of the
//    four the user chose, so nothing resolved may override it.
ok('1 an explicit title wins over a resolved command',
  R.railLabel(panel('n1', { title: 'auth refactor' }), running(48213, '/bin/zsh')) === 'auth refactor')

// 2. The link that took two milestones to connect. pty:create has returned the
//    RESOLVED command since M4, and for a login-shell panel — spec.command
//    absent, because only main can name the user's shell — it is the only
//    honest label that exists anywhere in the renderer.
ok('2 no title, running: the RESOLVED command, not the spec\'s',
  R.railLabel(panel('n1'), running(48213, '/bin/zsh')) === '/bin/zsh')

// 3. Pre-spawn fallback: a dormant or never-started panel has no resolved
//    command, and the spec's is the best thing left.
ok('3 not running: the spec command',
  R.railLabel(panel('n1', { spec: { cwd: '~', command: '/usr/bin/claude', args: [] } }),
    { kind: 'idle' }) === '/usr/bin/claude')

// 4. The end of the chain. An absent spec.command MEANS "the user's login
//    shell" (M5a's absent-command rule); rendering an empty string here would
//    read as a broken row rather than as a shell.
ok('4 nothing at all: "login shell"',
  R.railLabel(panel('n1'), { kind: 'idle' }) === 'login shell')

/* ---- The status tail ---- */

ok('5 running reads its pid', R.railTail(running(48213, '/bin/zsh'), false) === 'pid 48213')

// 6. Dormant OUTRANKS the status kind. A dormant panel's status is
//    {kind:'idle'}, and "not started" is true but useless — "dormant" is the
//    word the panel's own card uses, and it is what tells the user the start
//    control on this row exists at all.
ok('6 dormant outranks the status kind',
  R.railTail({ kind: 'idle' }, true) === 'dormant')

// 7. THE FALSY TRAP. A successful exit is code 0, and `code || ''` or a
//    ternary on `code` would silently print the wrong tail for the single most
//    common exit there is. Nothing else in this repo can catch it.
ok('7 exit code 0 renders as a number, not as absence',
  R.railTail({ kind: 'exited', code: 0 }, false) === 'exited 0')

ok('8 a non-zero exit renders its code',
  R.railTail({ kind: 'exited', code: 1 }, false) === 'exited 1')

// 9. `starting` is a real state main SENDS directly at spawn (see CLAUDE.md's
//    "`starting` is sent directly"), and a real claude takes seconds to boot —
//    that silence is exactly when the rail should say something is happening.
ok('9 starting says so', R.railTail({ kind: 'starting' }, false) === 'starting…')

/* ---- The signature: the 60Hz defence ---- */

// 10. THE CHECK THIS MODULE EXISTS FOR. `panels` is a fresh array on every
//     setPanelRect — every frame of a drag — and the rail cannot use the
//     palette's escape hatch (key the memo on `open`, read panelsRef) because
//     it is never closed. A rect move must leave the signature BYTE-identical,
//     which is what lets Canvas freeze the rows array on it.
{
  const before = [panel('n1', { title: 'a' }), panel('n2')]
  const after = [
    panel('n1', { title: 'a', rect: { id: 'n1', x: 900, y: -400, w: 720, h: 460 } }),
    panel('n2', { rect: { id: 'n2', x: 12, y: 34, w: 300, h: 200 } })
  ]
  const map = statuses({ n1: running(1, '/bin/zsh'), n2: running(2, '/bin/sh') })
  ok('10 moving every rect leaves the signature byte-identical',
    R.railSignature(R.buildRailRows(before, map, NONE)) ===
    R.railSignature(R.buildRailRows(after, map, NONE)))
}

// 11-13. The other direction: the signature must MOVE for everything a row
//        actually renders, or a frozen array would show stale text forever —
//        the failure being silent, because the rail would simply be wrong.
{
  const map = statuses({ n1: running(1, '/bin/zsh') })
  const base = R.railSignature(R.buildRailRows([panel('n1')], map, NONE))
  ok('11 a title change moves the signature',
    R.railSignature(R.buildRailRows([panel('n1', { title: 'renamed' })], map, NONE)) !== base)
  ok('12 a status change moves the signature',
    R.railSignature(R.buildRailRows([panel('n1')],
      statuses({ n1: { kind: 'exited', code: 3 } }), NONE)) !== base)
  ok('13 waking a dormant panel moves the signature',
    R.railSignature(R.buildRailRows([panel('n1')], map, new Set(['n1']))) !== base)
}

// 14. FIELD SEPARATION. A label is USER TEXT. Under the obvious
//     implementation — `id + '|' + label + '|' + tail` — a title containing
//     the separator forges a field boundary, two genuinely different lists
//     produce one string, and the rail freezes on the wrong rows: for the
//     users whose titles happen to contain that character, and nobody else.
//     This is the check that makes JSON.stringify the answer rather than a
//     chosen separator, and it must keep failing against any implementation
//     that goes back to concatenating with one.
{
  const a = R.buildRailRows([panel('n1', { title: 'x|y' }), panel('n2', { title: 'z' })],
    statuses({}), NONE)
  const b = R.buildRailRows([panel('n1', { title: 'x' }), panel('n2', { title: 'y|z' })],
    statuses({}), NONE)
  ok('14 a title cannot forge a field boundary', R.railSignature(a) !== R.railSignature(b))
}

// 15. Array order is preserved and there is exactly one row per panel. Order
//     is `panels` order deliberately — NOT Panel.z. Sorting the rendered list
//     by z would move DOM nodes on every raise, and a move is
//     remove-then-insert; the rail holds no live terminal, but the rule is the
//     one panels.ts states and there is no reason for the two lists to
//     disagree about what order means.
{
  const rows = R.buildRailRows([panel('n3'), panel('n1'), panel('n2')], statuses({}), NONE)
  ok('15 one row per panel, in array order',
    rows.length === 3 && rows.map((r) => r.id).join(',') === 'n3,n1,n2')
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
