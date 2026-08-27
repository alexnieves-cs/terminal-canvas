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
  // No module in this bundle imports from @shared or @renderer today —
  // commands.ts's only import is its sibling palette-model.ts. The aliases are
  // here pre-emptively, and that is the whole point: verify-viewport.cjs was
  // in exactly this state right up until panel-interaction.ts grew a real
  // VALUE import from @shared and the bundle broke with "Could not resolve".
  // They cost nothing until the day they are load-bearing.
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
  group: 'canvas',
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

// --- commands.ts -----------------------------------------------------------

/** Records every action call, so a check can assert what a row is wired to. */
const spyActions = () => {
  const calls = []
  const record = (name) => (...args) => calls.push([name, ...args])
  return {
    calls,
    spawnPreset: record('spawnPreset'),
    beginRenamePreset: record('beginRenamePreset'),
    deletePreset: record('deletePreset'),
    setDefaultPreset: record('setDefaultPreset'),
    goToPanel: record('goToPanel'),
    insertPrompt: record('insertPrompt'),
    beginSavePrompt: record('beginSavePrompt'),
    deletePrompt: record('deletePrompt'),
    beginRenamePanel: record('beginRenamePanel'),
    resetCanvas: record('resetCanvas'),
    zoomToFit: record('zoomToFit'),
    toggleSetting: record('toggleSetting'),
    beginEditSetting: record('beginEditSetting')
  }
}

const ctx = (over = {}) => ({
  presets: [],
  prompts: [],
  panels: [],
  settings: [],
  capturedId: null,
  hasSelection: false,
  actions: spyActions(),
  ...over
})

const byId = (list, id) => list.find((c) => c.id === id)

const SHELL = { id: 'shell', name: 'Login shell', available: true, builtIn: true, isDefault: true, subtitle: '~' }
const CLAUDE = { id: 'claude', name: 'Claude', available: false, builtIn: true, isDefault: false, subtitle: '~' }
const MINE = { id: 'u1', name: 'claude — work', available: true, builtIn: false, isDefault: false, subtitle: '~/work' }

// 19. Every preset produces a spawn row, and the row calls spawnPreset with
//     that preset's id — never a substituted one. Spawning the wrong program
//     in the wrong directory is worse than spawning nothing (main/index.ts).
{
  const c = ctx({ presets: [SHELL, MINE] })
  const row = byId(P.buildCommands(c), 'preset.spawn.u1')
  row.run()
  ok('19 a preset spawn row calls spawnPreset with its own id',
    c.actions.calls.length === 1 && c.actions.calls[0][0] === 'spawnPreset' && c.actions.calls[0][1] === 'u1')
}

// 20. An unavailable preset is DISABLED and says why, rather than being hidden.
//     A user who installed neither CLI should still learn the feature exists
//     and what it wants — the same posture menuLabel() takes in the menu.
{
  const rows = P.buildCommands(ctx({ presets: [CLAUDE] }))
  const row = byId(rows, 'preset.spawn.claude')
  ok('20 an unavailable preset is disabled with a reason',
    row !== undefined && row.disabledReason === P.REASON_NOT_ON_PATH)
}

// 21. Built-ins refuse rename AND delete, each with its own reason. Built-ins
//     are code, not data (main/presets.ts): a "successful" rename would write a
//     user preset shadowing a built-in id and revert on the next launch.
{
  const rows = P.buildCommands(ctx({ presets: [SHELL] }))
  ok('21 a built-in refuses rename and delete, with reasons',
    byId(rows, 'preset.rename.shell').disabledReason === P.REASON_BUILT_IN_RENAME &&
    byId(rows, 'preset.delete.shell').disabledReason === P.REASON_BUILT_IN_DELETE)
}

// 22. A user preset allows both.
{
  const rows = P.buildCommands(ctx({ presets: [MINE] }))
  ok('22 a user preset can be renamed and deleted',
    byId(rows, 'preset.rename.u1').disabledReason === undefined &&
    byId(rows, 'preset.delete.u1').disabledReason === undefined)
}

// 23. Rename hands the CURRENT name through, so the palette's input opens
//     pre-filled — renaming "claude — work" to "claude — work 2" must not mean
//     retyping it.
{
  const c = ctx({ presets: [MINE] })
  byId(P.buildCommands(c), 'preset.rename.u1').run()
  ok('23 rename carries the current name',
    c.actions.calls[0][0] === 'beginRenamePreset' && c.actions.calls[0][2] === 'claude — work')
}

// 24. The preset that already IS the default has a disabled set-default row.
//     Runnable, it would rewrite the file and rebuild the menu to no effect.
{
  const rows = P.buildCommands(ctx({ presets: [SHELL, MINE] }))
  ok('24 the current default cannot be re-defaulted',
    byId(rows, 'preset.default.shell').disabledReason === P.REASON_ALREADY_DEFAULT &&
    byId(rows, 'preset.default.u1').disabledReason === undefined)
}

// 25. With no captured focus, every prompt insert is disabled and says so —
//     the palette records focusedId at OPEN time, and "nothing was focused" is
//     a state a user can easily be in (they clicked the background first).
{
  const rows = P.buildCommands(ctx({ prompts: [{ id: 'p1', name: 'review', source: 'saved' }] }))
  ok('25 no captured panel disables prompt insertion',
    byId(rows, 'prompt.insert.p1').disabledReason === P.REASON_NO_FOCUS)
}

// 26. With a captured panel, it runs and names the prompt.
{
  const c = ctx({ capturedId: 'n1', prompts: [{ id: 'p1', name: 'review', source: 'saved' }] })
  const row = byId(P.buildCommands(c), 'prompt.insert.p1')
  row.run()
  ok('26 a captured panel enables insertion',
    row.disabledReason === undefined && c.actions.calls[0][0] === 'insertPrompt' && c.actions.calls[0][1] === 'p1')
}

// 27. A project prompt cannot be deleted from the palette: it is a file in the
//     user's repository, and the reason has to say that rather than nothing.
{
  const rows = P.buildCommands(ctx({
    capturedId: 'n1',
    prompts: [{ id: 'proj:review', name: 'review', source: 'project' }]
  }))
  ok('27 a project prompt refuses deletion, with a reason',
    byId(rows, 'prompt.delete.proj:review').disabledReason === P.REASON_PROJECT_PROMPT)
}

// 28. Two prompts with the SAME name from different sources are two rows.
//     Never deduped: pasting the wrong project's context into an agent is a
//     quiet way to waste an hour (ideas-backlog #27), so the source is on the
//     row and both survive.
{
  const rows = P.buildCommands(ctx({
    capturedId: 'n1',
    prompts: [
      { id: 'p1', name: 'review', source: 'saved' },
      { id: 'proj:review', name: 'review', source: 'project' }
    ]
  }))
  const inserts = rows.filter((r) => r.id.startsWith('prompt.insert.'))
  ok('28 same-named prompts from two sources are two distinguishable rows',
    inserts.length === 2 && inserts[0].subtitle !== inserts[1].subtitle,
    inserts.map((r) => r.subtitle).join(' | '))
}

// 29. "Save selection as prompt" needs BOTH a captured panel and a selection,
//     and says which one is missing. Saving is always a deliberate gesture —
//     ideas-backlog #27 rules out automatic capture, because noticing what to
//     capture means retaining everything the user types, credentials included.
{
  const none = byId(P.buildCommands(ctx({})), 'prompt.save')
  const noSel = byId(P.buildCommands(ctx({ capturedId: 'n1' })), 'prompt.save')
  const both = byId(P.buildCommands(ctx({ capturedId: 'n1', hasSelection: true })), 'prompt.save')
  ok('29 saving a prompt needs a panel and a selection, and says which is missing',
    none.disabledReason === P.REASON_NO_FOCUS &&
    noSel.disabledReason === P.REASON_NO_SELECTION &&
    both.disabledReason === undefined)
}

// 30. Groups arrive in a fixed order — Panel, Preset, Prompt, Canvas — because
//     filterCommands' stability means CONSTRUCTION order is what the user sees
//     with an empty query.
{
  const rows = P.buildCommands(ctx({
    panels: [{ id: 'n1', label: 'login shell — work (n1)' }],
    presets: [SHELL],
    prompts: [{ id: 'p1', name: 'review', source: 'saved' }],
    capturedId: 'n1'
  }))
  // Through filterCommands, NOT straight off buildCommands. Construction order
  // stopped being the grouping the moment sorting became section-first, and
  // the property worth pinning is the one the user actually sees: whatever
  // else moves, each section appears ONCE and they appear in SECTIONS order.
  // Asserting the built array instead would pass forever while the rendered
  // list interleaved, which is exactly how the old defect survived M5b.
  const seen = []
  for (const r of P.filterCommands(rows, '')) {
    if (seen[seen.length - 1] !== r.group) seen.push(r.group)
  }
  const expected = P.SECTIONS.map((s) => s.id).filter((id) => seen.includes(id))
  ok('30 sections render once each, in SECTIONS order',
    seen.join(',') === expected.join(','), seen.join(',') + ' vs ' + expected.join(','))
}

// 31-32 — M6a. The rename row is aimed at capturedId, NOT at the row's own
//     panel: the palette captures focusedId on open and deliberately never
//     clears it, and every panel-acting command targets the panel the user was
//     in. With nothing focused the row must stay VISIBLE with its reason — a
//     row that disappears is indistinguishable from a feature that is missing.
{
  const row = byId(
    P.buildCommands(ctx({ capturedId: null, panels: [{ id: 'p1', label: 'p1' }] })),
    'panel.rename'
  )
  ok('31 rename stays visible with a reason when nothing is focused',
    row !== undefined && row.disabledReason === P.REASON_NO_FOCUS)
}
{
  const c = ctx({
    capturedId: 'p1',
    panels: [{ id: 'p1', label: 'p1', title: 'auth refactor' }]
  })
  const row = byId(P.buildCommands(c), 'panel.rename')
  row.run()
  ok('32 rename is runnable, echoes the current name, and acts on the captured panel',
    row.disabledReason === undefined &&
    row.subtitle.includes('auth refactor') &&
    c.actions.calls[0][0] === 'beginRenamePanel' &&
    c.actions.calls[0][1] === 'p1' &&
    c.actions.calls[0][2] === 'auth refactor')
}

// 33 — M6a whole-branch review, Important 1. A titled panel's goto row must
//     be findable by its TITLE, not just by its command/cwd/id label — the
//     switcher is the primary find-a-panel surface on an infinite canvas, and
//     "auth refactor" typed into Cmd+K found nothing until the row carried a
//     subtitle (haystack() in palette-model.ts is `${title} ${subtitle}`).
//     Asserting the exact row id (not just count === 1) is what would catch a
//     regression that put the subtitle back on the wrong row.
{
  const rows = P.buildCommands(ctx({
    panels: [
      { id: 'p1', label: 'zsh — ~ (p1)', title: 'auth refactor' },
      { id: 'p2', label: 'zsh — ~ (p2)' }
    ]
  }))
  const found = P.filterCommands(rows, 'auth')
  ok('33 a titled panel is findable in the palette by its title',
    found.length === 1 && found[0].id === 'panel.goto.p1', found.map((c) => c.id).join(','))
}


// --- M6p: sections, at-rest hiding, best-match selection, highlighting ------

// 34-35. Section-first sorting is the fix for the defect M5b shipped: the old
//     comparator was `(b.score - a.score) || (a.order - b.order)`, so score won
//     OUTRIGHT and construction order — which commands.ts's header comment
//     calls "the grouping" — only ever survived the EMPTY query. One keystroke
//     and the groups interleaved, which is how "Delete preset Claude" came to
//     sit above "New panel from Claude" with nothing but a repeated uppercase
//     chip to tell them apart. 34 is the half that catches a regression to the
//     old comparator: the manage row scores strictly higher and must still
//     come second. 35 is the half that stops the fix going too far — inside a
//     section, score must STILL decide, or the whole ranker is dead.
{
  // 'del' is contiguous and word-initial in the manage row, and a scattered
  // subsequence in the panel row, so score alone would invert these two.
  const list = [
    cmd('a', 'Go to double-check ledger', { group: 'panel' }),
    cmd('b', 'Delete preset X', { group: 'manage' })
  ]
  const out = P.filterCommands(list, 'del')
  ok('34 a section earlier in SECTIONS outranks a better score in a later one',
    out.length === 2 && out[0].id === 'a' && out[1].id === 'b',
    out.map((c) => c.id).join(','))
}
{
  const list = [
    cmd('scattered', 'c l a u d e', { group: 'spawn' }),
    cmd('exact', 'Claude', { group: 'spawn' })
  ]
  const out = P.filterCommands(list, 'cla')
  ok('35 inside one section, score still decides',
    out.length === 2 && out[0].id === 'exact', out.map((c) => c.id).join(','))
}

// 36-38. Section-first sorting would, on its own, point Enter at the first
//     runnable row of the FIRST section rather than at what the user was
//     typing towards — so the seed becomes bestMatchIndex, which re-scores the
//     already-filtered rows and ignores their sections entirely. 37 is the one
//     that matters: a "best match" that lands on a disabled row makes Enter a
//     no-op, and a silent no-op reads as a broken palette.
{
  const list = [
    cmd('a', 'Go to zsh', { group: 'panel' }),
    cmd('b', 'Claude', { group: 'spawn' })
  ]
  const out = P.filterCommands(list, 'cla')
  ok('36 bestMatchIndex points at the best match, not the first section',
    P.bestMatchIndex(out, 'cla') === out.findIndex((c) => c.id === 'b'),
    String(P.bestMatchIndex(out, 'cla')))
}
{
  const list = [
    cmd('best', 'Claude', { group: 'spawn', disabledReason: 'not found on PATH' }),
    cmd('worse', 'c l a', { group: 'spawn' })
  ]
  const out = P.filterCommands(list, 'cla')
  ok('37 bestMatchIndex skips a disabled row even when it scores highest',
    P.bestMatchIndex(out, 'cla') === out.findIndex((c) => c.id === 'worse'),
    String(P.bestMatchIndex(out, 'cla')))
}
{
  const list = [cmd('a', 'Claude', { group: 'spawn', disabledReason: 'nope' })]
  ok('38 bestMatchIndex is -1 when nothing is runnable',
    P.bestMatchIndex(P.filterCommands(list, 'cla'), 'cla') === -1)
}

// 39-40. hiddenAtRest is the row-count fix, and it is TWO rules, not one.
//     Hiding admin errands from the resting list is the point; hiding them
//     from SEARCH would be the bug — verify:palette 31 already states the rule
//     in its own comment ("a row that disappears is indistinguishable from a
//     feature that is missing"), and a half-implemented hide satisfies 39 while
//     quietly deleting four commands from the app. Both halves, always.
{
  const list = [
    cmd('keep', 'Claude', { group: 'spawn' }),
    cmd('admin', 'Delete preset Claude', { group: 'manage', hiddenAtRest: true })
  ]
  const out = P.filterCommands(list, '')
  ok('39 a hiddenAtRest row is dropped from the resting list',
    out.length === 1 && out[0].id === 'keep', out.map((c) => c.id).join(','))
}
{
  const list = [
    cmd('keep', 'Claude', { group: 'spawn' }),
    cmd('admin', 'Delete preset Claude', { group: 'manage', hiddenAtRest: true })
  ]
  ok('40 a hiddenAtRest row comes back as soon as the user types',
    P.filterCommands(list, 'delete').some((c) => c.id === 'admin'))
}

// 41. searchText is what makes the retitles safe. Dropping "New panel from"
//     from a spawn row's title is a clear win under a NEW PANEL header, but
//     haystack() is title + subtitle — so without a place to put the dropped
//     words, "new panel" silently stops finding the rows it has always found.
//     The row would still be there; it would just no longer be reachable the
//     way people reach it. (M6b's plan schedules this same field for its
//     keyword search, so it lands once, here.)
{
  const list = [cmd('a', 'Claude', { group: 'spawn', searchText: 'new panel from spawn' })]
  ok('41 searchText is searchable without being rendered',
    P.filterCommands(list, 'new panel').length === 1 &&
    P.filterCommands(list, 'zzz').length === 0)
}
// 41b. The whole phrase, generic half AND specific half, in the order a
//     person types them. This is the case that a naive haystack loses:
//     fuzzyMatch is one ordered subsequence over one concatenated string, so
//     with the title spliced in FRONT of searchText the matcher consumes
//     "new panel from" out of the trailing terms and then has to find
//     "claude" after it — which is not there. The row would stay in the list
//     and silently stop answering the query searchText exists to answer.
{
  const list = [cmd('a', 'Claude', { group: 'spawn', subtitle: '~', searchText: 'new panel from spawn' })]
  ok('41b the generic words and the specific name match as one phrase',
    P.filterCommands(list, 'new panel from claude').length === 1 &&
    P.filterCommands(list, 'claude').length === 1)
}

// 42-43. splitHighlight finally spends what fuzzy.ts has been computing and
//     throwing away since M5b — its own comment says positions are "indices
//     into the ORIGINAL target, so the view can highlight them", and no view
//     ever did. Adjacent characters must MERGE into one segment: a span per
//     character would render fine and then break sub-pixel letter-spacing
//     across the whole title.
{
  const seg = P.splitHighlight('New panel', 'np')
  ok('42 splitHighlight marks the matched characters and merges runs',
    JSON.stringify(seg) === JSON.stringify([
      { text: 'N', hit: true },
      { text: 'ew ', hit: false },
      { text: 'p', hit: true },
      { text: 'anel', hit: false }
    ]), JSON.stringify(seg))
}
{
  // The resting list is the common case, and it must not pay for a highlight
  // pass or render a title chopped into segments for no reason.
  const empty = P.splitHighlight('Claude', '')
  const miss = P.splitHighlight('Claude', 'zzz')
  ok('43 an empty or non-matching query is one unhighlighted segment',
    JSON.stringify(empty) === JSON.stringify([{ text: 'Claude', hit: false }]) &&
    JSON.stringify(miss) === JSON.stringify([{ text: 'Claude', hit: false }]),
    JSON.stringify(empty) + ' ' + JSON.stringify(miss))
}
// 44-45. The two retitles, and the one thing that makes them safe. Under a
//     NEW PANEL header "New panel from Claude" says "new panel" twice, and
//     under a PROMPTS header so does "Insert prompt: review" — but haystack()
//     is title + subtitle, so dropping those words would also drop the search
//     term people already type. Both halves in one check each: the title is
//     the bare noun AND the old phrasing still finds it.
{
  const rows = P.buildCommands(ctx({ presets: [CLAUDE] }))
  const row = byId(rows, 'preset.spawn.claude')
  ok('44 a spawn row is titled with the preset alone and still found by "new panel"',
    row.title === 'Claude' &&
    P.filterCommands(rows, 'new panel').some((c) => c.id === 'preset.spawn.claude'),
    row.title)
}
{
  const rows = P.buildCommands(ctx({
    prompts: [{ id: 'p1', name: 'review', source: 'saved' }],
    capturedId: 'n1',
    panels: [{ id: 'n1', label: 'n1' }]
  }))
  const row = byId(rows, 'prompt.insert.p1')
  ok('45 a prompt row is titled with the prompt alone and still found by "insert prompt"',
    row.title === 'review' &&
    P.filterCommands(rows, 'insert prompt').some((c) => c.id === 'prompt.insert.p1'),
    row.title)
}

// 46. The row-count fix, stated as the two facts that define it: the errands
//     are hidden at rest, and the verbs are NOT. Checking only the first half
//     would pass just as well against an implementation that hid the whole
//     preset section, which is the failure worth catching — the resting list
//     would be tidy and the app would have lost its spawn rows.
{
  const rows = P.buildCommands(ctx({ presets: [MINE], prompts: [{ id: 'p1', name: 'r', source: 'saved' }],
    capturedId: 'n1', panels: [{ id: 'n1', label: 'n1' }] }))
  const hidden = (id) => byId(rows, id).hiddenAtRest === true
  const shown = (id) => byId(rows, id).hiddenAtRest === undefined
  ok('46 administration is hidden at rest; the verbs are not',
    hidden('preset.rename.u1') && hidden('preset.delete.u1') && hidden('preset.default.u1') &&
    hidden('prompt.delete.p1') &&
    shown('preset.spawn.u1') && shown('prompt.insert.p1') &&
    shown('panel.rename') && shown('canvas.fit'))
}

// 47. Both deletes are marked destructive, and NOTHING else is. The flag
//     drives red styling and the confirm gate, so a flag that spread to a
//     benign row would put a confirm step in front of spawning a panel.
{
  const rows = P.buildCommands(ctx({ presets: [MINE], prompts: [{ id: 'p1', name: 'r', source: 'saved' }],
    capturedId: 'n1', panels: [{ id: 'n1', label: 'n1' }] }))
  const marked = rows.filter((r) => r.destructive === true).map((r) => r.id).sort()
  ok('47 exactly the two delete rows are destructive',
    marked.join(',') === 'preset.delete.u1,prompt.delete.p1', marked.join(','))
}

// 48. The Cmd+N hint, on the DEFAULT preset's spawn row and no other. This is
//     worth more than its size: CLAUDE.md records that the default-preset
//     feature sat inert for an entire milestone because nothing anywhere said
//     what Cmd+N would spawn — the out-of-the-box canvas looked correct and
//     only a user who hand-edited defaultPresetId could tell. A hint on every
//     row would say it just as loudly and be a lie on all but one.
{
  const rows = P.buildCommands(ctx({ presets: [SHELL, MINE] }))
  const withHint = rows.filter((r) => r.shortcut !== undefined).map((r) => r.id + '=' + r.shortcut)
  ok('48 only the default preset advertises Cmd+N',
    withHint.sort().join(',') === 'canvas.fit=\u23180,preset.spawn.shell=\u2318N',
    withHint.join(','))
}

// 49. The drill-in doors. They must be visible AT REST — the whole design
//     rests on administration being one keystroke away rather than one guess
//     away, and a door that only appears once you have already typed "manage"
//     is not a door. They carry no scope of their own, so entering `presets`
//     does not show the row you entered it through.
{
  const rows = P.buildCommands(ctx({ presets: [SHELL], prompts: [{ id: 'p1', name: 'r', source: 'saved' }] }))
  const resting = P.filterCommands(rows, '').map((r) => r.id)
  const inside = P.filterCommands(rows, '', 'presets').map((r) => r.id)
  ok('49 both drill-in doors rest in Manage, and are not shown inside a scope',
    resting.includes('manage.presets') && resting.includes('manage.prompts') &&
    !inside.includes('manage.presets') &&
    byId(rows, 'manage.presets').group === 'manage' &&
    byId(rows, 'manage.presets').entersScope === 'presets' &&
    byId(rows, 'manage.prompts').entersScope === 'prompts',
    resting.filter((id) => id.startsWith('manage.')).join(','))
}

// 50. What a scope actually shows: every row of its own kind INCLUDING the
//     hidden ones (that is what the user came here for), and nothing from any
//     other kind. A scope that leaked the panel switcher in would be a filter
//     that filters nothing.
{
  const rows = P.buildCommands(ctx({
    presets: [MINE], prompts: [{ id: 'p1', name: 'r', source: 'saved' }],
    panels: [{ id: 'n1', label: 'n1' }], capturedId: 'n1'
  }))
  const inside = P.filterCommands(rows, '', 'presets').map((r) => r.id).sort()
  ok('50 a scope shows its own rows, hidden ones included, and nothing else',
    inside.join(',') === 'preset.default.u1,preset.delete.u1,preset.rename.u1,preset.spawn.u1',
    inside.join(','))
}

// 51-54 — M6b. 52 is the check that justifies the whole searchText field:
//     ideas-backlog #11's argument for a searchable settings surface is that a
//     user looking for the theme types "dark", so a setting findable only by
//     its own label is a setting most users will never find.
//
// R12 fix-round-1 note: the original fixture's keywords included 'zoom', and
// 'zoom' is a literal substring of this description ("...the pan and zoom you
// left it..."). haystack() is searchText + title + subtitle, so a query of
// 'zoom' matched via the SUBTITLE alone and check 52 passed identically with
// searchText never populated — it could not fail, which is worse than no
// check at all for the one property that justifies the field. 'viewport' and
// 'anchor' below are neither substrings NOR subsequence-reachable through
// "Restore camera position" + the description (confirmed by hand, see the fix
// report): reading the description letter-by-letter there is no 'v' before an
// 'i' before an 'e' before a 'w'... in the required order, unlike 'zoom'.
const SETTING = {
  id: 'restore.camera', label: 'Restore camera position',
  description: 'Return the canvas to the pan and zoom you left it at.',
  keywords: ['viewport', 'anchor'], type: 'boolean', value: true,
  category: 'Restore on launch'
}
{
  const row = byId(P.buildCommands(ctx({ settings: [SETTING] })), 'setting.restore.camera')
  ok('51 a setting becomes a runnable row showing its label and description',
    row !== undefined && row.disabledReason === undefined &&
    row.title.includes('Restore camera position') &&
    row.subtitle.includes('Return the canvas'))
}
{
  const rows = P.filterCommands(P.buildCommands(ctx({ settings: [SETTING] })), 'viewport')
  ok('52 a setting is findable by a KEYWORD that appears nowhere in the row',
    rows.some((r) => r.id === 'setting.restore.camera'),
    rows.map((r) => r.id).join(','))
}
{
  const c = ctx({ settings: [SETTING] })
  byId(P.buildCommands(c), 'setting.restore.camera').run()
  ok('53 running a boolean setting row toggles it to the opposite value',
    c.actions.calls[0][0] === 'toggleSetting' &&
    c.actions.calls[0][1] === 'restore.camera' &&
    c.actions.calls[0][2] === false)
}
{
  const off = { ...SETTING, value: false }
  const row = byId(P.buildCommands(ctx({ settings: [off] })), 'setting.restore.camera')
  ok('54 the row says which way the toggle currently sits',
    row.title.includes('Off') || row.title.includes('off'), row.title)
}

// 55-58 — M6c. A NUMBER setting (agent.idleAfterMs) is the first non-boolean
// the schema has ever had, and before this the loop above `continue`d past
// every non-boolean, so it would have been reachable only by hand-editing
// layout.json — failing success criterion 9 ("every switch is found by
// typing a synonym into Cmd+K").
//
// buildOne is this file's `cmd(...)` for a settings row: one setting in, its
// own row out, over the same ctx()/spyActions() plumbing check 51-54 already
// use, so a number fixture doesn't need `P.buildCommands(ctx({...}))`
// inlined at every call site.
const buildOne = (setting, actions = spyActions()) =>
  byId(P.buildCommands(ctx({ settings: [setting], actions })), `setting.${setting.id}`)

const IDLE_AFTER_MS = {
  id: 'agent.idleAfterMs', label: 'Idle after', description: 'ms of silence',
  keywords: ['timeout'], type: 'number', value: 1500, category: 'Agent state'
}

// 55. A NUMBER setting produces a row at all.
{
  const rows = P.buildCommands(ctx({ settings: [IDLE_AFTER_MS] }))
  ok('55 a number setting gets a row', rows.some((r) => r.id === 'setting.agent.idleAfterMs'))
}

// 56. The row's TITLE names the current value. A toggle row says which way it
//     sits (check 54); a number row that did not would leave the user editing
//     a value they cannot see.
{
  const row = buildOne(IDLE_AFTER_MS)
  ok('56 a number row shows its current value', row.title.includes('1500'), row.title)
}

// 57. Running it does NOT toggle anything — it opens an edit. Reusing
//     toggleSetting here would send `!1500` === false to a number setting and
//     the store would refuse it, silently, with the row unchanged.
{
  const calls = []
  const row = buildOne(IDLE_AFTER_MS, {
    ...spyActions(),
    beginEditSetting: (...a) => calls.push(a),
    toggleSetting: () => calls.push(['TOGGLE'])
  })
  row.run()
  ok('57 a number row begins an edit, never a toggle',
    calls.length === 1 && calls[0][0] === 'agent.idleAfterMs' && calls[0][2] === 1500,
    JSON.stringify(calls))
}

// 58. Number rows obey the same hiddenAtRest rule as every other setting row:
//     M6p sized the resting list to about eight rows on purpose.
{
  const row = buildOne(IDLE_AFTER_MS)
  ok('58 a number row is hidden at rest and lives in the settings scope',
    row.hiddenAtRest === true && row.scope === 'settings')
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
