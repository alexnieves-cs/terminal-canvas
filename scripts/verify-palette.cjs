/* Verifies the command palette's pure layers.
   Run with: npm run verify:palette

   fuzzy.ts, palette-model.ts and commands.ts have no DOM, no React and no
   native module, so this runs under plain node rather than Electron — the
   same tier, and for the same reason, as verify:viewport. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'palette.cjs')
buildSync({
  entryPoints: [join(__dirname, 'palette-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // commands.ts imports types from @shared. Those are `import type` and are
  // erased, but the aliases cost nothing and stop the next real value import
  // from failing with "Could not resolve" the way panel-interaction.ts did.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const P = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const cmd = (id, title, extra = {}) => ({
  id,
  title,
  group: 'Canvas',
  run: () => {},
  ...extra
})

// 1. A non-subsequence does not match at all. This is the whole filter: a
//    query that is not present in order must remove the row, not rank it low.
{
  ok('1 a non-subsequence returns null', P.fuzzyMatch('zzz', 'New panel') === null)
}

// 2. An empty query matches everything with a flat score, so an unfiltered
//    palette shows the list in CONSTRUCTION order — which is what carries the
//    grouping (Panel, Preset, Prompt, Canvas) that commands.ts builds.
{
  const m = P.fuzzyMatch('', 'New panel')
  ok('2 an empty query matches with score 0', m !== null && m.score === 0 && m.positions.length === 0)
}

// 3. Matching is case-insensitive in both directions.
{
  ok(
    '3 case-insensitive',
    P.fuzzyMatch('NP', 'new panel') !== null && P.fuzzyMatch('np', 'NEW PANEL') !== null
  )
}

// 4. Initials beat a scattered match. 'np' against "New panel" hits two word
//    boundaries; against "Insert prompt" it hits one and starts later. If this
//    inverts, the palette answers the most common query — typing initials —
//    with the wrong row on top, which is the only ranking failure a user
//    actually notices.
{
  const a = P.fuzzyMatch('np', 'New panel')
  const b = P.fuzzyMatch('np', 'Insert prompt')
  ok('4 initials outrank a scattered match', a !== null && b !== null && a.score > b.score,
    `${a && a.score} vs ${b && b.score}`)
}

// 5. A contiguous run outranks the same characters spread out.
{
  const a = P.fuzzyMatch('pan', 'panel')
  const b = P.fuzzyMatch('pan', 'paste and')
  ok('5 contiguity scores higher', a !== null && b !== null && a.score > b.score,
    `${a && a.score} vs ${b && b.score}`)
}

// 6. positions index the TARGET, not the lowercased copy — the view uses them
//    to highlight, and an off-by-one there mis-highlights every row.
{
  const m = P.fuzzyMatch('np', 'New panel')
  ok('6 positions point at the matched characters',
    m !== null && m.positions.length === 2 && 'New panel'[m.positions[0]].toLowerCase() === 'n'
      && 'New panel'[m.positions[1]].toLowerCase() === 'p',
    m && JSON.stringify(m.positions))
}

// 7. Spaces in the query separate terms rather than having to be matched:
//    "new pan" must still find "New panel".
{
  ok('7 a space in the query is a separator, not a character to match',
    P.fuzzyMatch('new pan', 'New panel') !== null)
}

// 8. filterCommands drops non-matches and keeps the rest.
{
  const list = [cmd('a', 'New panel'), cmd('b', 'Reset canvas'), cmd('c', 'Zoom to fit')]
  const out = P.filterCommands(list, 'zoom')
  ok('8 filterCommands keeps only matches', out.length === 1 && out[0].id === 'c')
}

// 9. An empty query returns the list UNCHANGED and in order. Stable order is
//    what makes the grouping meaningful, and a sort that reorders equal scores
//    would shuffle the palette every keystroke back to empty.
{
  const list = [cmd('a', 'New panel'), cmd('b', 'Reset canvas'), cmd('c', 'Zoom to fit')]
  const out = P.filterCommands(list, '')
  ok('9 an empty query preserves construction order',
    out.map((c) => c.id).join('') === 'abc')
}

// 10. Equal scores keep construction order (a stable sort), for the same
//     reason as 9 — two presets that both match 'p' must not swap places as
//     the user types.
{
  const list = [cmd('a', 'p one'), cmd('b', 'p two')]
  const out = P.filterCommands(list, 'p')
  ok('10 ties are stable', out.map((c) => c.id).join('') === 'ab')
}

// 11. The subtitle is searchable. A preset row's title is "New panel from
//     Claude" but its cwd lives in the subtitle, and searching by directory is
//     the second thing anyone tries.
{
  const list = [cmd('a', 'New panel from Claude', { subtitle: '~/work/terminal-canvas' })]
  const out = P.filterCommands(list, 'terminal')
  ok('11 the subtitle is matched too', out.length === 1)
}

// 12. A disabled row SURVIVES filtering. It has to be visible with its reason —
//     "a greyed-out row with no reason is a bug report" (menuLabel) — so the
//     filter must not quietly remove the very row that explains itself.
{
  const list = [cmd('a', 'Claude', { disabledReason: 'not found on PATH' })]
  ok('12 a disabled row is not filtered out', P.filterCommands(list, 'cla').length === 1)
}

// 13. firstRunnable skips disabled rows, so Enter on a fresh palette never
//     lands on something that cannot run.
{
  const list = [cmd('a', 'x', { disabledReason: 'nope' }), cmd('b', 'y')]
  ok('13 firstRunnable skips disabled rows', P.firstRunnable(list) === 1)
}

// 14. firstRunnable returns -1 when NOTHING is runnable, rather than 0. The
//     view needs to tell "select row 0" apart from "there is nothing to press
//     Enter on", and returning 0 would make Enter run a disabled command.
{
  const list = [cmd('a', 'x', { disabledReason: 'nope' })]
  ok('14 firstRunnable returns -1 when nothing is runnable', P.firstRunnable(list) === -1)
}

// 15. stepRunnable moves over disabled rows in both directions.
{
  const list = [cmd('a', 'a'), cmd('b', 'b', { disabledReason: 'nope' }), cmd('c', 'c')]
  ok('15 stepRunnable steps over a disabled row',
    P.stepRunnable(list, 0, 1) === 2 && P.stepRunnable(list, 2, -1) === 0)
}

// 16. stepRunnable WRAPS. A four-row palette where Down at the bottom does
//     nothing reads as frozen.
{
  const list = [cmd('a', 'a'), cmd('b', 'b')]
  ok('16 stepRunnable wraps at both ends',
    P.stepRunnable(list, 1, 1) === 0 && P.stepRunnable(list, 0, -1) === 1)
}

// 17. stepRunnable from an out-of-range index (the list just shrank under the
//     selection, which happens on every keystroke) still lands somewhere real.
{
  const list = [cmd('a', 'a'), cmd('b', 'b')]
  const i = P.stepRunnable(list, 9, 1)
  ok('17 an out-of-range index still resolves', i === 0 || i === 1, String(i))
}

// 18. An empty list yields -1 rather than throwing or returning 0.
{
  ok('18 an empty list has no runnable row',
    P.firstRunnable([]) === -1 && P.stepRunnable([], 0, 1) === -1)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
