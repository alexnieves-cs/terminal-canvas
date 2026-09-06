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
  // @renderer became load-bearing in M8d: commands.ts imports the VALUE
  // waitingCount from shell/rail-sections so the palette and the rail share
  // one derivation of a workspace's waiting count — measured in M18 by
  // REMOVING the alias and watching this bundle fail to build, which is the
  // only way to answer this question reliably rather than reading it off the
  // imports. @shared became load-bearing too, in M14: commands.ts now imports
  // the VALUE SERVICES from @shared/credential-schema (not just types, the
  // way every earlier @shared import here was), so both aliases are exercised
  // on every build now — the "needing no alias YET" state
  // verify-viewport.cjs's own comment warns about is no longer this file's
  // state for either one.
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
    // M96–M97
    beginRunVerb: record('beginRunVerb'), startAuto: record('startAuto'), stopAuto: record('stopAuto'),
    // M100
    openTeammates: record('openTeammates'),
    // M103
    beginBrowser: record('beginBrowser'),
    // M106
    toggleFlip: record('toggleFlip'),
    addWorkItem: record('addWorkItem'), beginNewWorkItem: record('beginNewWorkItem'), dispatchWorkItem: record('dispatchWorkItem'), openPr: record('openPr'), commentPr: record('commentPr'), markDone: record('markDone'), openBoard: record('openBoard'),
    // M92
    lockPanel: record('lockPanel'), unlockPanel: record('unlockPanel'), pinPanel: record('pinPanel'), unpinPanel: record('unpinPanel'), maximisePanel: record('maximisePanel'), restorePanel: record('restorePanel'),
    beginRenamePreset: record('beginRenamePreset'),
    deletePreset: record('deletePreset'),
    setDefaultPreset: record('setDefaultPreset'),
    goToPanel: record('goToPanel'),
    insertPrompt: record('insertPrompt'),
    answerApproval: record('answerApproval'),
    beginSavePrompt: record('beginSavePrompt'),
    deletePrompt: record('deletePrompt'),
    beginRenamePanel: record('beginRenamePanel'),
    resetCanvas: record('resetCanvas'),
    addBookmark: record('addBookmark'),
    goToBookmark: record('goToBookmark'),
    deleteBookmark: record('deleteBookmark'),
    cameraBack: record('cameraBack'),
    cameraForward: record('cameraForward'),
    exportPanelText: record('exportPanelText'),
    exportCanvasPng: record('exportCanvasPng'),
    beginRenameBookmark: record('beginRenameBookmark'),
    zoomToFit: record('zoomToFit'),
    toggleSetting: record('toggleSetting'),
    beginEditSetting: record('beginEditSetting'),
    // M20. The compound restart-with-a-mode verb the panel.mode rows call.
    restartPanelWithMode: record('restartPanelWithMode'),
    // M27. The New note row's verb. Missing it does not FAIL a check — it
    // THROWS out of row.run(), which ends the process where it stands and
    // takes every check below with it, printing no summary at all. That is
    // the trap CLAUDE.md's "a check that THROWS aborts the run" records, and
    // it is exactly how this omission surfaced: the suite reported nothing
    // rather than a red check.
    newNote: record('newNote'),
    // M37. The three worktree verbs. Missing any one of them THROWS out of
    // row.run() and takes the rest of the suite with it — newNote's own trap.
    setPresetWorktree: record('setPresetWorktree'),
    beginRemoveWorktree: record('beginRemoveWorktree'),
    revealWorktree: record('revealWorktree'),
    // M39. The clear-scrollback verb, confirm-gated in the action.
    beginClearScrollback: record('beginClearScrollback'),
    // M13. beginLink is reached from panel.link; the other two are the
    // inspector's own, reached from no Command row — kept here anyway so the
    // fixture stays honest about the full PaletteActions shape, the reason
    // the inspector's existing actions below are here.
    beginLink: record('beginLink'),
    removeLink: record('removeLink'),
    beginRelabelLink: record('beginRelabelLink'),
    // The inspector's own action, reached from no Command row: closing and
    // saving already have gestures elsewhere. Kept here anyway so the fixture
    // stays honest about the full PaletteActions shape.
    savePanelAsPreset: record('savePanelAsPreset'),
    // Restart IS reached from a row (checks 66/66b), so this recorder is not
    // merely for shape: without it `row.run()` calls undefined and the check
    // dies with a TypeError instead of failing an assertion — and a THROW in
    // this single-script suite aborts every check written after it.
    restartPanel: record('restartPanel'),
    // Review IS reached from a row too (checks 67/68), same reason.
    openReview: record('openReview'),
    openToolbox: record('openToolbox'),
    // Both move verbs ARE reached from rows, so these are not merely shape:
    // without them `row.run()` calls undefined and the check dies with a
    // TypeError, which in this single-script suite aborts every check written
    // after it.
    movePanelsToWorkspace: record('movePanelsToWorkspace'),
    beginMovePanelsToNewWorkspace: record('beginMovePanelsToNewWorkspace'),
    toggleBroadcastInput: record('toggleBroadcastInput'),
    beginSpawnSheet: record('beginSpawnSheet'),
    toggleGroup: record('toggleGroup'),
    removeGroup: record('removeGroup'),
    // The three credential verbs (the credential checks exercise
    // buildCredentialRows directly, but buildCommands also reaches these
    // through ctx.actions).
    beginSetCredential: record('beginSetCredential'),
    verifyCredential: record('verifyCredential'),
    beginDeleteCredential: record('beginDeleteCredential'),
    // panel.open-file's row calls this (check 73, renumbered from this
    // milestone's own original 70 — main's credential checks claimed 70-72
    // first) — same reason as restartPanel and openReview above.
    openFile: record('openFile'),
    setPanelFontSize: record('setPanelFontSize'),
    tidyPanels: record('tidyPanels')
  }
}

const ctx = (over = {}) => ({
  presets: [],
  prompts: [],
  panels: [],
  settings: [],
  workspaces: [],
  attentionIds: [],
  capturedId: null,
  hasSelection: false,
  selectedIds: [],
  groups: [],
  broadcastReady: false,
  broadcastActive: false,
  actions: spyActions(),
  credentials: [],
  // M37. Empty means "no worktrees yet"; the Manage worktrees door still
  // renders, disabled with a reason, so the feature is findable.
  worktrees: [],
  // M42. The search scope's inputs. null results = no answer yet (before the
  // first keystroke); [] = a query that matched nothing.
  searchQuery: '',
  searchResults: null,
  scrollbackEnabled: true,
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

// 85. Broadcast is a temporary keyboard route, so its one command states
// both the selected object and the active stop action; it is not silently
// offered for a one-panel or dormant selection.
{
  const disabled = byId(P.buildCommands(ctx({ selectedIds: ['n1'] })), 'canvas.broadcast-input')
  const activeContext = ctx({ selectedIds: ['n1', 'n2'], broadcastReady: true })
  const ready = byId(P.buildCommands(activeContext), 'canvas.broadcast-input')
  ready.run()
  const stop = byId(P.buildCommands(ctx({ selectedIds: ['n1', 'n2'], broadcastActive: true })), 'canvas.broadcast-input')
  ok('broadcast-input.1 broadcast input is explicit, target-counted and disabled without two live terminals',
    disabled !== undefined && disabled.disabledReason === P.REASON_BROADCAST_NEEDS_TWO &&
      ready !== undefined && ready.disabledReason === undefined &&
      activeContext.actions.calls[0][0] === 'toggleBroadcastInput' &&
      stop !== undefined && stop.title === 'Stop broadcasting input',
    JSON.stringify({ disabled: disabled && disabled.disabledReason, title: stop && stop.title }))
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
  // found[0] rather than found.length === 1: M14 adds a standing credential
  // row ("Add GitHub token…") whose haystack ("credential token sign in
  // GitHub Add GitHub token…") happens to contain a,u,t,h as a scattered
  // SUBSEQUENCE too — an incidental collision of fuzzy.ts's subsequence
  // matcher, not a defect in either row. It sorts to the CREDENTIAL section,
  // strictly after the panel this check is actually about (filterCommands
  // sorts by section index before score — see palette-model.ts), so the
  // panel's own row is still what Enter would run; that ordering, not
  // exclusivity, is what this check was ever really pinning.
  ok('33 a titled panel is findable in the palette by its title, ranks first, and p2 stays absent',
    found[0]?.id === 'panel.goto.p1' && !found.some((c) => c.id === 'panel.goto.p2'),
    found.map((c) => c.id).join(','))
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

// 47. The deletes are marked destructive, and NOTHING else is. The flag
//     drives red styling and the confirm gate, so a flag that spread to a
//     benign row would put a confirm step in front of spawning a panel.
//     M39 added the third: clearing every panel's recorded output from disk
//     is exactly the kind of row this flag exists for.
{
  const rows = P.buildCommands(ctx({ presets: [MINE], prompts: [{ id: 'p1', name: 'r', source: 'saved' }],
    capturedId: 'n1', panels: [{ id: 'n1', label: 'n1' }] }))
  const marked = rows.filter((r) => r.destructive === true).map((r) => r.id).sort()
  ok('47 exactly the three delete rows are destructive',
    marked.join(',') === 'canvas.clear-scrollback,preset.delete.u1,prompt.delete.p1', marked.join(','))
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
  // M65: the sheet's row carries its own chord (⌘⇧N), a different key.
  ok('48 only the default preset advertises Cmd+N',
    withHint.sort().join(',') === 'canvas.fit=\u23180,preset.spawn.shell=\u2318N,spawn.sheet=\u2318\u21e7N',
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
    // M37 added preset.worktree.<id>, the per-preset isolation toggle.
    inside.join(',') === 'preset.default.u1,preset.delete.u1,preset.rename.u1,preset.spawn.u1,preset.worktree.u1',
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
// M45 — theme.1. An enum setting renders as a CYCLE row: the title names
//     the current value, and running it writes the NEXT value in the enum's
//     order, wrapping. Before M45 an enum fell through to nothing pushed —
//     the row was silently missing, which is the exact trap "a row that
//     disappears is indistinguishable from a feature that was never built"
//     names.
{
  const THEME = {
    id: 'appearance.theme', label: 'Theme',
    description: 'Follow the system, or force light or dark.',
    keywords: ['dark', 'light', 'appearance'], type: 'enum', value: 'system',
    values: ['system', 'light', 'dark'], category: 'Appearance'
  }
  const c = ctx({ settings: [THEME] })
  const row = byId(P.buildCommands(c), 'setting.appearance.theme')
  // Guarded: a missing row must read as RED, not throw and abort every
  // check below this one.
  if (row) row.run()
  const last = ctx({ settings: [{ ...THEME, value: 'dark' }] })
  const lastRow = byId(P.buildCommands(last), 'setting.appearance.theme')
  if (lastRow) lastRow.run()
  ok('theme.1 an enum setting is a cycle row naming its value, and running it writes the next value, wrapping',
    row !== undefined && row.title === 'Theme: system' && row.group === 'setting' &&
      c.actions.calls[0][0] === 'toggleSetting' && c.actions.calls[0][1] === 'appearance.theme' &&
      c.actions.calls[0][2] === 'light' &&
      last.actions.calls.length > 0 && last.actions.calls[0][2] === 'system',
    JSON.stringify({ title: row && row.title, calls: c.actions.calls, wrap: last.actions.calls }))
}
// M48 — firstrun.1. The Environment scope: a door at rest, and one
//     information row per fact of the report — the shell probe, each CLI
//     found or absent (with its path or the install line), tmux, the PATH's
//     entry count, the layout file, and when the probe ran. Information rows
//     run nothing; they exist so "why does Claude not appear" has an answer
//     one Cmd+K away.
{
  const report = {
    probedAt: Date.UTC(2026, 8, 2, 10, 0, 0),
    shell: { path: '/bin/zsh', ok: false, reason: 'login shell produced no PATH' },
    pathEntries: ['/usr/bin', '/bin'],
    clis: [{ name: 'claude', path: null }, { name: 'codex', path: '/opt/homebrew/bin/codex' }, { name: 'git', path: '/usr/bin/git' }],
    tmux: { kind: 'direct', reason: 'tmux not on PATH', path: null },
    layout: { path: '/Users/x/layout.json', backupWritten: false },
    envKeys: ['HOME', 'PATH']
  }
  const rows = typeof P.buildEnvironmentRows === 'function' ? P.buildEnvironmentRows(report) : []
  const byRowId = (id) => rows.find((r) => r.id === id)
  const door = byRowId('manage.environment')
  const claude = byRowId('env.cli.claude')
  const codex = byRowId('env.cli.codex')
  const shell = byRowId('env.shell')
  ok('firstrun.1 the Environment scope has a door and one information row per report fact, with each CLI found or absent',
    door !== undefined && door.entersScope === 'environment' && door.disabledReason === undefined &&
      claude !== undefined && claude.scope === 'environment' && claude.hiddenAtRest === true && /not found/i.test(claude.title) && /install/i.test(claude.subtitle) &&
      codex !== undefined && /found/i.test(codex.title) && codex.subtitle.includes('/opt/homebrew/bin/codex') &&
      shell !== undefined && /could not be read|failed/i.test(shell.title) && shell.subtitle.includes('login shell produced no PATH') &&
      byRowId('env.tmux') !== undefined && byRowId('env.path') !== undefined && byRowId('env.layout') !== undefined && byRowId('env.probed') !== undefined &&
      rows.filter((r) => r.scope === 'environment').every((r) => typeof r.run === 'function'),
    JSON.stringify(rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.subtitle })).slice(0, 8)))
}
// M49 — type.1. Three commit rows on the focused terminal — larger, smaller,
//     default — each disabled with a reason otherwise. No slider: a slider
//     that refits on every tick is sixty full repaints a second.
{
  const P1 = { id: 'n1', label: 'claude', kind: 'terminal', restartable: true, fontSize: 16 }
  const rows = (ctx2) => P.buildCommands(ctx2)
  const withFocus = ctx({ panels: [P1], capturedId: 'n1' })
  const larger = byId(rows(withFocus), 'panel.font.larger')
  const smaller = byId(rows(withFocus), 'panel.font.smaller')
  const reset = byId(rows(withFocus), 'panel.font.default')
  if (larger) larger.run()
  const none = byId(rows(ctx({ panels: [P1], capturedId: null })), 'panel.font.larger')
  const R1 = { id: 'r1', label: 'review', kind: 'review', restartable: false }
  const sessionless = byId(rows(ctx({ panels: [R1], capturedId: 'r1' })), 'panel.font.larger')
  ok('type.1 the three font rows commit on a focused terminal and are disabled with a reason otherwise',
    larger !== undefined && smaller !== undefined && reset !== undefined && larger.disabledReason === undefined &&
      /16/.test(larger.title) && withFocus.actions.calls.some((c) => c[0] === 'setPanelFontSize' && c[1] === 'n1' && c[2] === 17) &&
      none !== undefined && none.disabledReason !== undefined &&
      sessionless !== undefined && sessionless.disabledReason !== undefined,
    JSON.stringify({ larger, none: none && none.disabledReason, sessionless: sessionless && sessionless.disabledReason, calls: withFocus.actions.calls }))
}
// M50 — placement.1. Tidy: on a selection of two or more it arranges the
//     selection; with fewer selected it arranges everything; on exactly one
//     panel on the canvas it is disabled with a reason — one panel has
//     nothing to be tidied against.
{
  const rows = (c) => P.buildCommands(c)
  const two = ctx({ panels: [{ id: 'n1', label: 'a', kind: 'terminal', restartable: false }, { id: 'n2', label: 'b', kind: 'terminal', restartable: false }, { id: 'n3', label: 'c', kind: 'terminal', restartable: false }], selectedIds: ['n1', 'n2'] })
  const sel = byId(rows(two), 'panel.tidy')
  if (sel) sel.run()
  const all = ctx({ panels: [{ id: 'n1', label: 'a', kind: 'terminal', restartable: false }, { id: 'n2', label: 'b', kind: 'terminal', restartable: false }], selectedIds: [] })
  const everything = byId(rows(all), 'panel.tidy')
  if (everything) everything.run()
  const one = byId(rows(ctx({ panels: [{ id: 'n1', label: 'a', kind: 'terminal', restartable: false }], selectedIds: [] })), 'panel.tidy')
  ok('placement.1 the Tidy row arranges the selection when two or more are selected, everything otherwise, and is disabled on a lone panel',
    sel !== undefined && sel.disabledReason === undefined && /selection|2 panels/.test(sel.title) &&
      two.actions.calls.some((c) => c[0] === 'tidyPanels' && JSON.stringify(c[1]) === JSON.stringify(['n1', 'n2'])) &&
      everything !== undefined && everything.disabledReason === undefined && /everything|all/i.test(everything.title) &&
      all.actions.calls.some((c) => c[0] === 'tidyPanels' && JSON.stringify(c[1]) === JSON.stringify(['n1', 'n2'])) &&
      one !== undefined && one.disabledReason !== undefined,
    JSON.stringify({ sel, everything, one: one && one.disabledReason, calls: two.actions.calls }))
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

// 58b — fix round 1. Canvas.tsx's beginEditSetting rejects an out-of-range
// edit by looking up the row's min/max in the SAME ctx.settings list
// buildCommands was given (its own `settingRows` state), not from the
// Command object itself — this suite is pure and never mounts Canvas.tsx, so
// what it CAN prove is that nothing about buildCommands stops that lookup
// from working: a SettingRow's min/max survive unmutated after buildCommands
// runs over it, and the row it produces has an id that strips back (via the
// `setting.<id>` convention every setting row already uses) to exactly that
// SettingRow. This is NOT a check on the re-prompt behaviour itself — see
// the report for what remains unproven.
{
  const bounded = { ...IDLE_AFTER_MS, min: 250, max: 60000 }
  const c = ctx({ settings: [bounded] })
  const row = byId(P.buildCommands(c), 'setting.agent.idleAfterMs')
  const recovered = c.settings.find((s) => s.id === row.id.slice('setting.'.length))
  ok('58b a number row’s id recovers the SettingRow carrying its range',
    row !== undefined && recovered !== undefined &&
    recovered.min === 250 && recovered.max === 60000)
}

// M7. Workspaces. A section, a drill-in, and a waiting count that must not be
// searchable.
//
// NOTE: the Command field for section membership is `group`, not `section` —
// see palette-model.ts's `Command.group: SectionId`. The checks below read
// `.group`, matching the interface every other check in this file already
// uses (e.g. check 30's `byId(rows, 'manage.presets').group === 'manage'`).

const WS = [
  { id: 'w1', name: 'startup', panelIds: ['n1', 'n2'], active: true },
  { id: 'w2', name: 'school', panelIds: ['n3', 'n4'], active: false }
]

// 59. The section exists, sits before `manage`, and every workspace row lands
//     in it. Derived from SECTIONS rather than restated, the rule check 30
//     was rewritten to obey: construction order stopped being the grouping
//     the moment sorting became section-first.
{
  const wi = P.SECTIONS.findIndex((s) => s.id === 'workspace')
  const mi = P.SECTIONS.findIndex((s) => s.id === 'manage')
  const rows = P.buildCommands(ctx({ workspaces: WS }))
    .filter((c) => c.title.includes('startup') || c.title.includes('school'))
  ok('59 the workspace section exists and precedes manage',
    wi !== -1 && mi !== -1 && wi < mi && rows.length > 0 &&
      rows.every((c) => c.group === 'workspace' || c.group === 'manage'),
    `workspace=${wi} manage=${mi}`)
}

// 60. The ACTIVE workspace's switch row is disabled with its reason, not
//     absent. The rule check 31 states in its own comment: a row that
//     disappears is indistinguishable from a feature that is missing.
{
  const rows = P.buildCommands(ctx({ workspaces: WS }))
  const active = rows.find((c) => c.group === 'workspace' && c.title.includes('startup'))
  const other = rows.find((c) => c.group === 'workspace' && c.title.includes('school'))
  ok('60 the active workspace’s row is disabled with a reason',
    active !== undefined && active.disabledReason === P.REASON_ALREADY_ACTIVE &&
      other !== undefined && other.disabledReason === undefined,
    `active=${active && active.disabledReason}`)
}

// 61. The administration rows are hidden at rest and findable by query. Both
//     halves, because an implementation that only hides has quietly deleted
//     three commands from the app.
{
  const all = P.buildCommands(ctx({ workspaces: WS }))
  const resting = P.filterCommands(all, '', null).map((c) => c.id)
  const searched = P.filterCommands(all, 'delete', null).map((c) => c.id)
  const del = all.find((c) => c.id.startsWith('workspace.delete'))
  ok('61 workspace admin rows are hidden at rest and findable by query',
    del !== undefined && del.hiddenAtRest === true &&
      !resting.includes(del.id) && searched.includes(del.id),
    `resting=${resting.length} searched=${searched.length}`)
}

// 62. Delete is marked destructive. Marked AND gated — Task 6 owns the gate;
//     this is the mark, and neither half replaces the other.
{
  const del = P.buildCommands(ctx({ workspaces: WS }))
    .find((c) => c.id.startsWith('workspace.delete'))
  ok('62 the workspace delete row is destructive',
    del !== undefined && del.destructive === true,
    `destructive=${del && del.destructive}`)
}

// 63. The drill-in: `Manage workspaces…` is always visible, enters the scope,
//     and the scope shows the workspace rows and nothing from another scope.
{
  const all = P.buildCommands(ctx({ workspaces: WS }))
  const door = all.find((c) => c.entersScope === 'workspaces')
  const resting = P.filterCommands(all, '', null).map((c) => c.id)
  const inScope = P.filterCommands(all, '', 'workspaces')
  ok('63 the workspaces drill-in has a visible door and its own rows',
    door !== undefined && door.hiddenAtRest === undefined &&
      resting.includes(door.id) && inScope.length > 0 &&
      inScope.every((c) => c.scope === 'workspaces'),
    `inScope=${inScope.length}`)
}

// 64. The waiting count is state, not a name: it never reaches `title` at
//     all, so the view (Palette.tsx) is what composes it into what renders,
//     and the matcher never sees it — a row findable by typing "2" would be
//     a row whose match score moves as agents finish, a ranking that changes
//     under the user for reasons they cannot see. haystack() stays in this
//     assertion (not a re-derivation) because that is the whole reason it
//     was exported: this tests what the matcher actually sees.
{
  const rows = P.buildCommands(ctx({ workspaces: WS, attentionIds: ['n3', 'n4'] }))
  const school = rows.find((c) => c.group === 'workspace' && c.title === 'school')
  const startup = rows.find((c) => c.group === 'workspace' && c.title === 'startup')
  const hay = school !== undefined ? P.haystack(school) : ''
  ok('64 the waiting count is state on the row, composed by the view, never in the haystack',
    school !== undefined && school.title === 'school' && school.waiting === 2 &&
      startup !== undefined && startup.title === 'startup' && startup.waiting === undefined &&
      !hay.includes('waiting') && !hay.includes('2'),
    `title=${school && school.title} waiting=${school && school.waiting} haystack=${hay}`)
}

// 65-65c. doorIndex — the row that leads INTO a scope, which is where the
//     selection has to land when the user pops back OUT of one. Before this,
//     leaving a drill-in re-seeded from bestMatchIndex, and with the empty
//     query a drill-in leaves behind every score ties at 0 — so the highlight
//     jumped to the first row of the first section and the user lost the door
//     they had just walked through. Anchoring on `entersScope` rather than on
//     a remembered row id is what makes this a pure lookup over rows already
//     in hand, and is what lets it answer the ⚙ top-bar path too, where the
//     palette opened straight into a scope and no door was ever traversed.

// 65. The door for the scope being left is found in the resting list.
//     Asserted by ID, never by index: an index here would re-encode SECTIONS'
//     order into this file, which is exactly the restatement check 30 was
//     rewritten to stop doing.
{
  const rows = P.filterCommands(P.buildCommands(ctx({ settings: [SETTING] })), '', null)
  const i = P.doorIndex(rows, 'settings')
  ok('65 doorIndex finds the door that leads into a scope',
    i >= 0 && rows[i].id === 'manage.settings' && rows[i].entersScope === 'settings',
    `i=${i} id=${i >= 0 ? rows[i].id : 'none'}`)
}

// 65b. -1 when the door is not in the list, which is the entire contract the
//      caller's `>= 0` guard rests on — without it the caller would index
//      rows[-1] and seed the selection to undefined. Two fixtures in one
//      assertion, because the door is absent for two different reasons:
//      inside a scope it is filtered out (doors carry no `scope` of their
//      own, check 49), and under a query it cannot match it is ranked out.
{
  const all = P.buildCommands(ctx({ settings: [SETTING] }))
  const inScope = P.filterCommands(all, '', 'settings')
  const unmatched = P.filterCommands(all, 'zzz', null)
  ok('65b doorIndex is -1 when the door is not in the list',
    P.doorIndex(inScope, 'settings') === -1 && P.doorIndex(unmatched, 'settings') === -1,
    `inScope=${P.doorIndex(inScope, 'settings')} unmatched=${P.doorIndex(unmatched, 'settings')}`)
}

// 65c. A DISABLED door is not returned. This is not hypothetical: entering a
//      scope needs a runnable door, but prompt:list re-fires while the
//      palette is open (Canvas.tsx's reloadPrompts tracks capturedId), so the
//      prompts door can go disabled UNDER a user already inside its scope.
//      Seeding the selection there on the way out makes Enter a dead key —
//      the one thing bestMatchIndex's own doc comment refuses to do.
//
//      Both halves in ONE assertion on purpose: the row must be PRESENT and
//      still not returned. Asserting only the -1 would pass against an
//      implementation that finds nothing merely because the row is missing,
//      which says nothing at all about the disabled check.
{
  const rows = P.filterCommands(P.buildCommands(ctx({ prompts: [] })), '', null)
  const door = byId(rows, 'manage.prompts')
  ok('65c doorIndex skips a door that is present but disabled',
    door !== undefined && door.disabledReason !== undefined &&
      P.doorIndex(rows, 'prompts') === -1,
    `present=${door !== undefined} reason=${door && door.disabledReason} i=${P.doorIndex(rows, 'prompts')}`)
}

// 66. THE RESTART ROW exists, is enabled, and is aimed at the CAPTURED panel.
//     Captured rather than "the row's own panel" for the reason panel.rename
//     already obeys: opening the palette moves DOM focus to the input but
//     deliberately leaves focusedId alone, and that captured id is what every
//     panel-acting command targets.
//
//     `run()` is guarded on the row existing rather than called bare. A throw
//     in this single-script suite aborts the run, so an absent row would take
//     66b down with it and its RED would never actually be observed.
{
  const c = ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: '/bin/zsh', restartable: true }]
  })
  const row = byId(P.buildCommands(c), 'panel.restart')
  if (row) row.run()
  ok('66 the restart row is present, enabled, and aimed at the captured panel',
    row !== undefined && row.disabledReason === undefined &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'restartPanel' &&
      c.actions.calls[0][1] === 'n1',
    JSON.stringify(c.actions.calls))
}

// 66b. DISABLED, NOT ABSENT, when the captured panel never started — and with
//      the not-started reason, NOT the no-focus one. Those are two different
//      situations with two different fixes ("click a panel" vs "start this
//      panel"), and collapsing them tells a user who HAS focused a panel to
//      focus a panel. A row that vanished instead would be indistinguishable
//      from a feature that was never built, the rule check 31 states.
//
//      The reasons are compared against the EXPORTED constants, never against
//      string literals: a literal here would keep passing while the constant
//      the user actually reads said something else entirely. The third clause
//      is what stops both constants being the same string.
{
  const notStarted = byId(P.buildCommands(ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: '/bin/zsh', restartable: false }]
  })), 'panel.restart')
  const noFocus = byId(P.buildCommands(ctx({
    capturedId: null,
    panels: [{ id: 'n1', label: '/bin/zsh', restartable: true }]
  })), 'panel.restart')
  ok('66b restart is disabled with the RIGHT reason in each of its two blocked cases',
    notStarted !== undefined && notStarted.disabledReason === P.REASON_NOT_STARTED &&
      noFocus !== undefined && noFocus.disabledReason === P.REASON_NO_FOCUS &&
      notStarted.disabledReason !== noFocus.disabledReason,
    JSON.stringify([notStarted && notStarted.disabledReason, noFocus && noFocus.disabledReason]))
}

// 67. The Open review row is present, enabled, and aimed at the CAPTURED
//     panel rather than the focused one — the rule panel.rename and
//     panel.restart already obey, because opening the palette moves DOM
//     focus to its input and deliberately leaves focusedId alone.
{
  const c = ctx({
    capturedId: 'n2',
    panels: [
      { id: 'n1', label: 'claude', restartable: true },
      { id: 'n2', label: 'zsh', restartable: true }
    ]
  })
  const row = byId(P.buildCommands(c), 'panel.review')
  if (row) row.run()
  ok('67 the review row is enabled and aimed at the captured panel',
    row !== undefined && row.disabledReason === undefined &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'openReview' &&
      c.actions.calls[0][1] === 'n2',
    JSON.stringify(c.actions.calls))
}

// 68. Disabled — not absent — for a panel that never started, and for no
//     capture at all, with the two DISTINCT reasons check 66b already
//     establishes the rule for. A panel with no session has no baseline, so
//     there is nothing to review against: "start this panel" and "click a
//     panel" are two situations with two different fixes. Compared against
//     the EXPORTED constants, never string literals, which would keep
//     passing while the text the user reads said something else.
{
  const never = byId(P.buildCommands(ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: 'zsh', restartable: false }]
  })), 'panel.review')
  const none = byId(P.buildCommands(ctx({
    capturedId: null,
    panels: [{ id: 'n1', label: 'zsh', restartable: true }]
  })), 'panel.review')
  ok('68 review is disabled with two distinct reasons',
    never !== undefined && never.disabledReason === P.REASON_NOT_STARTED &&
      none !== undefined && none.disabledReason === P.REASON_NO_FOCUS &&
      P.REASON_NOT_STARTED !== P.REASON_NO_FOCUS,
    JSON.stringify([never && never.disabledReason, none && none.disabledReason]))
}

// 69. A review node is in the Panels section like any other panel — an
//     off-screen node must be reachable by keyboard — and the verbs it
//     cannot do are DISABLED there, not missing. Restart is the case: its
//     row is aimed at the captured panel, and a captured review node has no
//     process to restart.
{
  const rows = P.buildCommands(ctx({
    panels: [{ id: 'r1', label: 'review: claude', restartable: false }],
    capturedId: 'r1'
  }))
  ok('69 a review node is navigable and its process verbs are disabled',
    rows.some((r) => r.id === 'panel.goto.r1' && r.disabledReason === undefined) &&
      rows.find((r) => r.id === 'panel.restart')?.disabledReason === P.REASON_NOT_STARTED)
}

// 78. A move row exists per OTHER workspace, and the selection's own
//     workspace is NOT among them. Moving panels to the workspace they are
//     already in is a no-op wearing the costume of a verb: it would run,
//     close the palette, clear the selection and change nothing, which reads
//     as "the move feature is broken" rather than as "that was a no-op".
//
//     Asserted as an exact id set rather than as a count, so a row aimed at
//     the wrong workspace — the failure that actually files a user's panels
//     somewhere they never asked for — cannot satisfy it. The run() clause
//     is what pins the row to its OWN workspace id and to the SELECTED ids:
//     a row that passed the whole canvas, or a neighbour's id, still renders
//     identically.
{
  const c = ctx({ workspaces: WS, selectedIds: ['n1', 'n2'] })
  const rows = P.buildCommands(c)
  const moves = rows.filter((r) => r.id.startsWith('workspace.move.')).map((r) => r.id).sort()
  const row = byId(rows, 'workspace.move.w2')
  if (row) row.run()
  ok('78 one move row per OTHER workspace, aimed at that workspace',
    moves.join(',') === 'workspace.move.w2' &&
      row !== undefined && row.disabledReason === undefined &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'movePanelsToWorkspace' &&
      JSON.stringify(c.actions.calls[0][1]) === '["n1","n2"]' &&
      JSON.stringify(c.actions.calls[0][2]) === '{"workspaceId":"w2"}',
    `moves=[${moves.join(',')}] calls=${JSON.stringify(c.actions.calls)}`)
}

// 79. With an EMPTY selection both move rows are PRESENT and DISABLED with a
//     reason, never absent — check 31's rule: a row that disappears is
//     indistinguishable from a feature that was never built, and a user who
//     has not yet learned that the marquee is what feeds this verb has no way
//     to discover it from an empty list. Compared against the EXPORTED
//     constant rather than a string literal, which would keep passing while
//     the text the user actually reads said something else entirely.
{
  const rows = P.buildCommands(ctx({ workspaces: WS, selectedIds: [] }))
  const move = byId(rows, 'workspace.move.w2')
  const moveNew = byId(rows, 'workspace.move-new')
  ok('79 an empty selection disables the move rows rather than hiding them',
    move !== undefined && move.disabledReason === P.REASON_NO_PANELS_SELECTED &&
      moveNew !== undefined && moveNew.disabledReason === P.REASON_NO_PANELS_SELECTED,
    JSON.stringify([move && move.disabledReason, moveNew && moveNew.disabledReason]))
}

// 80. "Move to new workspace…" is present and enters TEXT INPUT mode rather
//     than running the move immediately — the two-step shape
//     beginRenamePreset already uses, which is what makes Escape a real
//     cancel. The discriminating clause is WHICH action it calls: a row wired
//     straight to movePanelsToWorkspace with an invented name renders
//     identically, runs on one Enter, and files the user's panels into a
//     workspace they never named and cannot cancel out of.
{
  const c = ctx({ workspaces: WS, selectedIds: ['n1', 'n2'] })
  const row = byId(P.buildCommands(c), 'workspace.move-new')
  if (row) row.run()
  ok('80 move-to-new begins an input mode rather than moving immediately',
    row !== undefined && row.disabledReason === undefined &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'beginMovePanelsToNewWorkspace' &&
      JSON.stringify(c.actions.calls[0][1]) === '["n1","n2"]',
    JSON.stringify(c.actions.calls))
}

// 70. A declared service with no stored credential renders an ADD row, and
//     it is unconditionally runnable — a service that vanishes from the list
//     when it has no credential would be indistinguishable from a service
//     this app does not support (check 31's rule, applied here). run() is
//     called and the recorded call checked, not just the row's shape — the
//     same rule the row builder's own comment invokes (a row that does
//     nothing is indistinguishable from a feature never built) applies to
//     THIS check too: checks 32/53/66 all run their row rather than only
//     inspecting it, and a row wired to run: () => {} would have passed
//     every earlier version of this check.
{
  const actions = spyActions()
  const rows = P.buildCredentialRows([], P.SERVICES, actions)
  const add = rows.find((r) => r.id === 'credential.set.github')
  if (add) add.run()
  ok('70 a service with no stored credential renders an enabled ADD row wired to beginSetCredential',
    add !== undefined && add.disabledReason === undefined &&
      actions.calls.length === 1 &&
      actions.calls[0][0] === 'beginSetCredential' && actions.calls[0][1] === 'github',
    JSON.stringify(actions.calls))
}

// 71. Credential rows are hiddenAtRest and live in the credentials scope, the
//     rule every settings row already obeys — M6p sized the resting list to
//     about eight rows deliberately. Same run()-and-assert shape as 70.
{
  const actions = spyActions()
  const rows = P.buildCredentialRows([], P.SERVICES, actions)
  const add = rows.find((r) => r.id === 'credential.set.github')
  if (add) add.run()
  ok('71 a credential row is hiddenAtRest, scoped to credentials, and runnable',
    add !== undefined && add.hiddenAtRest === true && add.scope === 'credentials' &&
      actions.calls.length === 1 &&
      actions.calls[0][0] === 'beginSetCredential' && actions.calls[0][1] === 'github',
    JSON.stringify({ add, calls: actions.calls }))
}

// 72. A service WITH a stored credential renders VERIFY and DELETE rows
//     instead of the ADD row. The delete row is destructive, and the verify
//     row shows the LABEL — what the remote service says the account is
//     called. There is no token anywhere in the CredentialMeta fixture to
//     derive one from, so "never derived from the token" is a STRUCTURAL
//     guarantee of the CredentialMeta type this check cannot itself exercise
//     — it is the type that keeps a token out of reach, not this assertion.
//     Both rows are run and both recorded calls checked, the same reason 70
//     and 71 are.
{
  const meta = [{ service: 'github', label: 'octocat', addedAt: 'x' }]
  const actions = spyActions()
  const rows = P.buildCredentialRows(meta, P.SERVICES, actions)
  const add = rows.find((r) => r.id === 'credential.set.github')
  const del = rows.find((r) => r.id === 'credential.delete.github')
  const verify = rows.find((r) => r.id === 'credential.verify.github')
  if (verify) verify.run()
  if (del) del.run()
  ok('72 a stored credential renders verify/delete rows wired to their actions, delete is destructive, verify shows the label',
    add === undefined &&
      del !== undefined && del.destructive === true &&
      verify !== undefined && verify.title.includes('octocat') &&
      actions.calls.length === 2 &&
      actions.calls[0][0] === 'verifyCredential' && actions.calls[0][1] === 'github' &&
      actions.calls[1][0] === 'beginDeleteCredential' && actions.calls[1][1] === 'github',
    JSON.stringify({ add, del, verify, calls: actions.calls }))
}

// 73. panel.open-file — Task 7's row, uncovered anywhere in this suite until
//     now (verify:panels 134 mints a file panel through the __m13Open test
//     hook directly, bypassing this row, actions.openFile and file:open
//     entirely). It has to read as a create verb, the same as a preset spawn
//     row: present, enabled and visible at rest — there is no captured panel
//     to gate it on and no state in which it should be disabled or hidden —
//     and it has to actually be wired to actions.openFile, or the row is a
//     facade that does nothing when pressed. All four asserted in one read:
//     a regression to any single one of them (dropped row, wrong section
//     leaving it hiddenAtRest, an accidental disabledReason, a run() wired to
//     the wrong action or nothing) would otherwise pass a check that only
//     looked at the others. Renumbered from this milestone's own original 70
//     (built and reviewed as "M13") to 73 on merge, since main's credential
//     checks had already claimed 70-72 by then — see the milestone-wide
//     renumbering commit.
{
  const c = ctx({})
  const rows = P.buildCommands(c)
  const row = byId(rows, 'panel.open-file')
  const resting = P.filterCommands(rows, '', null)
  row?.run()
  ok('73 Open file… is present, enabled, visible at rest, and wired to actions.openFile',
    row !== undefined &&
      row.disabledReason === undefined &&
      row.hiddenAtRest !== true &&
      resting.some((r) => r.id === 'panel.open-file') &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'openFile')
}

// ---------------------------------------------------------------------------
// M13. The link row. `link`, never `edge` — see panels.ts — though the row's
// searchText carries "edge" deliberately, because that is backlog #24's own
// noun and a user who thinks "edge" must still find the row.

// 76. The Link row is present, enabled, and aimed at the CAPTURED panel
//     rather than the focused one — the rule panel.rename, panel.restart and
//     panel.review already obey, because opening the palette moves DOM focus
//     to its input and deliberately leaves focusedId alone.
{
  const c = ctx({
    capturedId: 'n2',
    panels: [
      { id: 'n1', label: 'claude', restartable: true },
      { id: 'n2', label: 'zsh', restartable: true }
    ]
  })
  const row = byId(P.buildCommands(c), 'panel.link')
  if (row) row.run()
  ok('76 the link row is enabled and aimed at the captured panel',
    row !== undefined && row.disabledReason === undefined &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'beginLink' &&
      c.actions.calls[0][1] === 'n2',
    JSON.stringify(c.actions.calls))
}

// 77. Disabled — not absent — with two DISTINCT reasons, the shape checks 66b
//     and 68 already establish. "Click a panel first" and "there is nothing on
//     this canvas to link to" are two situations with two different fixes, and
//     collapsing them tells a user who HAS selected a panel to select a panel.
//     Compared against the EXPORTED constants, never string literals, which
//     would keep passing while the text the user reads said something else.
//
//     The single-panel case is the one that only this feature has: a link
//     needs a second endpoint, so a canvas of one panel can offer the verb
//     and never complete it.
{
  const alone = byId(P.buildCommands(ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: 'zsh', restartable: true }]
  })), 'panel.link')
  const none = byId(P.buildCommands(ctx({
    capturedId: null,
    panels: [
      { id: 'n1', label: 'zsh', restartable: true },
      { id: 'n2', label: 'claude', restartable: true }
    ]
  })), 'panel.link')
  ok('77 link is disabled with two distinct reasons',
    alone !== undefined && alone.disabledReason === P.REASON_NOTHING_TO_LINK &&
      none !== undefined && none.disabledReason === P.REASON_NO_FOCUS &&
      P.REASON_NOTHING_TO_LINK !== P.REASON_NO_FOCUS,
    JSON.stringify([alone && alone.disabledReason, none && none.disabledReason]))
}


// 81. The toolbox row: present, ENABLED, and aimed at the CAPTURED panel —
//     the rule panel.rename, Restart, review and link already obey, since
//     opening the palette moves DOM focus to its input and deliberately
//     leaves focusedId alone.
{
  const c = ctx({
    capturedId: 'n2',
    panels: [
      { id: 'n1', label: 'claude', restartable: true },
      { id: 'n2', label: 'zsh', restartable: true }
    ]
  })
  const row = byId(P.buildCommands(c), 'panel.toolbox')
  if (row) row.run()
  ok('81 the toolbox row is enabled and aimed at the captured panel',
    row !== undefined && row.disabledReason === undefined &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'openToolbox' &&
      c.actions.calls[0][1] === 'n2',
    JSON.stringify(c.actions.calls))
}

// 82 is the one worth knowing by number, and it is a DIFFERENCE from the two
//     rows beside it rather than a copy of them. Restart and review are both
//     disabled for a panel that never started, because both need a session:
//     restart has no process to replace and review has no baseline to diff
//     against. A toolbox answers for a DIRECTORY, which a panel has from the
//     moment it is minted — so a panel that never spawned still has a
//     perfectly good toolbox, and refusing one here would be a wrong answer
//     rather than a cautious one. Only the no-capture case disables it, and
//     the reason is compared against the EXPORTED constant.
{
  const never = byId(P.buildCommands(ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: 'zsh', restartable: false }]
  })), 'panel.toolbox')
  const none = byId(P.buildCommands(ctx({
    capturedId: null,
    panels: [{ id: 'n1', label: 'zsh', restartable: true }]
  })), 'panel.toolbox')
  const review = byId(P.buildCommands(ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: 'zsh', restartable: false }]
  })), 'panel.review')
  ok('82 a never-started panel still offers a toolbox, though not a review',
    never !== undefined && never.disabledReason === undefined &&
      review !== undefined && review.disabledReason === P.REASON_NOT_STARTED &&
      none !== undefined && none.disabledReason === P.REASON_NO_FOCUS,
    JSON.stringify([never && never.disabledReason, review && review.disabledReason,
      none && none.disabledReason]))
}

// ---------------------------------------------------------------------------
// M23 — the permission-mode rows (ideas-backlog #8 part 1).
// ---------------------------------------------------------------------------

// 83. One runnable row per mode, inside its own scope, hidden at rest, and
//     wired to the COMPOUND verb.
//
//     One row per VALUE rather than a SettingDef, and that is what keeps
//     CLAUDE.md's deliberate deletion of `SettingDef['type'] = 'enum'` deleted:
//     a multi-valued choice expressed as N command rows needs no such type at
//     all. These are per-PANEL anyway, so a global setting would have been the
//     wrong shape even if the type existed.
//
//     The hiddenAtRest clause is not decoration: M6p sized the resting list to
//     roughly eight rows on purpose, and six permission modes un-hidden there
//     is precisely the drift hiddenAtRest exists to refuse.
{
  const c = ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: 'claude', restartable: true, agent: true }]
  })
  const rows = P.buildCommands(c)
  const plan = byId(rows, 'panel.mode.plan')
  const bypass = byId(rows, 'panel.mode.bypassPermissions')
  const door = byId(rows, 'panel.mode')
  if (plan) plan.run()
  ok('83 one runnable row per permission mode, scoped and hidden at rest',
    plan !== undefined && bypass !== undefined && door !== undefined &&
      plan.disabledReason === undefined &&
      plan.scope === 'agent-mode' && plan.hiddenAtRest === true &&
      door.entersScope === 'agent-mode' &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'restartPanelWithMode' &&
      c.actions.calls[0][1] === 'n1' &&
      c.actions.calls[0][2] === 'plan',
    JSON.stringify({ call: c.actions.calls[0], scope: plan && plan.scope }))
}

// 84. THREE distinct blocked reasons, not two collapsed.
//
//     Restart's own rule, plus one this verb adds: a panel that is not running
//     an agent this app knows the flags for has no mode to be in, and
//     `agentArgs` is gated on spec.agent — so offering the verb there would
//     promise a flag that is emitted nowhere, a row that appears to work and
//     silently does nothing. "Click a panel", "start this one" and "this is
//     not an agent" are three situations with three different fixes, and
//     collapsing any two sends a user to do a thing they have already done.
//
//     Compared against the EXPORTED constants, never string literals, so a
//     reworded reason cannot leave this green while the text a user reads says
//     something else.
{
  const noFocus = byId(P.buildCommands(ctx({
    capturedId: null,
    panels: [{ id: 'n1', label: 'claude', restartable: true, agent: true }]
  })), 'panel.mode.plan')
  const notStarted = byId(P.buildCommands(ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: 'claude', restartable: false, agent: true }]
  })), 'panel.mode.plan')
  const notAgent = byId(P.buildCommands(ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: '/bin/zsh', restartable: true, agent: false }]
  })), 'panel.mode.plan')
  ok('84 the mode rows carry three distinct blocked reasons, never collapsed',
    noFocus !== undefined && noFocus.disabledReason === P.REASON_NO_FOCUS &&
      notStarted !== undefined && notStarted.disabledReason === P.REASON_NOT_STARTED &&
      notAgent !== undefined && notAgent.disabledReason === P.REASON_NOT_AN_AGENT &&
      P.REASON_NO_FOCUS !== P.REASON_NOT_STARTED &&
      P.REASON_NOT_STARTED !== P.REASON_NOT_AN_AGENT &&
      P.REASON_NO_FOCUS !== P.REASON_NOT_AN_AGENT,
    JSON.stringify([
      noFocus && noFocus.disabledReason,
      notStarted && notStarted.disabledReason,
      notAgent && notAgent.disabledReason
    ]))
}

// ── M27. The New note row. ──────────────────────────────────────────────

// 85 — present, visible AT REST, enabled when there is a directory to put a
// note in, and actually wired. Four facts in one read, check 73's shape for
// the "Open file…" row beside it: a regression to any single one of them — a
// dropped row, a wrong section leaving it hiddenAtRest, a stray
// disabledReason, a run() wired to nothing — would otherwise pass a check
// that only looked at the others. Visible at rest because it is a CREATE
// verb: M6p sized the resting list to roughly eight rows and every hidden row
// is one a user has to already know the name of, which is exactly wrong for
// the one row whose whole purpose is being discovered.
{
  const c = ctx({ noteRoot: '/Users/x/proj' })
  const rows = P.buildCommands(c)
  const row = byId(rows, 'panel.new-note')
  const resting = P.filterCommands(rows, '', null)
  if (row) row.run()
  ok('85 New note… is present, enabled, visible at rest, and wired to actions.newNote',
    row !== undefined &&
      row.disabledReason === undefined &&
      row.hiddenAtRest !== true &&
      resting.some((r) => r.id === 'panel.new-note') &&
      c.actions.calls.length === 1 &&
      c.actions.calls[0][0] === 'newNote',
    JSON.stringify(c.actions.calls))
}

// 86 — with no panel selected the row is PRESENT and DISABLED with its own
// exported reason, never absent. verify:palette 31's standing rule: a row
// that disappears is indistinguishable from a feature that was never built,
// and this is the one row a user on an empty canvas is most likely to go
// looking for. Compared against the EXPORTED constant rather than a string
// literal, which would keep passing while the sentence the user actually
// reads said something else entirely — and asserted as its OWN reason, not
// REASON_NO_FOCUS, because "click a panel" is the wrong instruction here: a
// note is rooted on the SELECTED panel, which a rail click sets without ever
// moving focus.
{
  const c = ctx({ noteRoot: null })
  const row = byId(P.buildCommands(c), 'panel.new-note')
  // Deliberately NOT calling run() here. A disabled row still HAS a run — it
  // is Palette.tsx's runRow that refuses one, not the row itself — so a
  // "calls === 0" clause would be asserting something no layer promises, and
  // an earlier draft of this check failed for exactly that reason. What the
  // row owes is a reason a user can act on; the refusal lives one layer up
  // and is covered where that layer is driven.
  ok('86 with nowhere to put a note the row is present and disabled with its own reason',
    row !== undefined &&
      row.disabledReason === P.REASON_NO_NOTE_ROOT &&
      P.REASON_NO_NOTE_ROOT !== P.REASON_NO_FOCUS,
    `reason=${JSON.stringify(row && row.disabledReason)}`)
}

// M37 — the worktree rows. Scoped ids.
//
// worktree.1. The presets scope carries a toggle row per preset that names its
//      CURRENT state and flips it: "off" runs setPresetWorktree(id, true),
//      "on" runs it with false. A built-in is disabled with its own reason —
//      built-ins are code, and the row must stay visible so the feature is
//      findable from the one place presets are managed.
{
  const c = ctx({ presets: [SHELL, MINE, { ...MINE, id: 'u2', name: 'iso', worktree: true }] })
  const rows = P.buildCommands(c)
  const off = byId(rows, 'preset.worktree.u1')
  const on = byId(rows, 'preset.worktree.u2')
  const builtIn = byId(rows, 'preset.worktree.shell')
  if (off) off.run()
  if (on) on.run()
  ok('worktree.1 a per-preset toggle row names its state, flips it, and refuses a built-in with a reason',
    off !== undefined && off.scope === 'presets' && off.hiddenAtRest === true && /off$/.test(off.title) &&
      on !== undefined && /on$/.test(on.title) &&
      builtIn !== undefined && builtIn.disabledReason === P.REASON_BUILT_IN_WORKTREE &&
      c.actions.calls.some((k) => k[0] === 'setPresetWorktree' && k[1] === 'u1' && k[2] === true) &&
      c.actions.calls.some((k) => k[0] === 'setPresetWorktree' && k[1] === 'u2' && k[2] === false),
    JSON.stringify({ off, on, builtIn, calls: c.actions.calls }))
}

// worktree.2. The door: present at rest, its subtitle counting records, and
//      disabled with a reason when there are none — a door that vanished would
//      read as a feature that was never built (verify:palette 31's rule).
{
  const empty = byId(P.buildCommands(ctx()), 'manage.worktrees')
  const two = byId(P.buildCommands(ctx({ worktrees: [
    { id: 'w1', branch: 'tc/n1-1', path: '/p1', root: '/r', createdAt: 1, panelId: 'n1', attached: true, panelTitle: 'claude' },
    { id: 'w2', branch: 'tc/n2-1', path: '/p2', root: '/r', createdAt: 2, panelId: 'n2', attached: false }
  ] })), 'manage.worktrees')
  ok('worktree.2 the Manage worktrees door counts records and is disabled with a reason when there are none',
    empty !== undefined && empty.entersScope === 'worktrees' && empty.disabledReason === P.REASON_NO_WORKTREES &&
      two !== undefined && two.disabledReason === undefined && /2 worktrees/.test(two.subtitle),
    JSON.stringify({ empty, two }))
}

// worktree.3. Per record: a destructive remove row, DISABLED with a reason
//      while a panel still owns the worktree (removing the directory under a
//      running agent is not a palette gesture), and enabled once detached —
//      routed through the confirm-gated action, never straight to the invoke.
{
  const c = ctx({ worktrees: [
    { id: 'w1', branch: 'tc/n1-1', path: '/p1', root: '/r', createdAt: 1, panelId: 'n1', attached: true, panelTitle: 'claude' },
    { id: 'w2', branch: 'tc/n2-1', path: '/p2', root: '/r', createdAt: 2, panelId: 'n2', attached: false }
  ] })
  const rows = P.buildCommands(c)
  const attached = byId(rows, 'worktree.remove.w1')
  const detached = byId(rows, 'worktree.remove.w2')
  if (detached) detached.run()
  ok('worktree.3 remove is destructive, refused with a reason while attached, and confirm-gated when detached',
    attached !== undefined && attached.scope === 'worktrees' && attached.destructive === true &&
      attached.disabledReason === P.REASON_WORKTREE_ATTACHED && attached.title.includes('tc/n1-1') &&
      detached !== undefined && detached.disabledReason === undefined &&
      c.actions.calls.some((k) => k[0] === 'beginRemoveWorktree' && k[1] === 'w2'),
    JSON.stringify({ attached, detached, calls: c.actions.calls }))
}

// worktree.4. Per record: a reveal row, always enabled, naming the branch and
//      carrying the path where the fuzzy matcher can find it.
{
  const c = ctx({ worktrees: [
    { id: 'w1', branch: 'tc/n1-1', path: '/ud/worktrees/repo-abc/tc-n1-1', root: '/r', createdAt: 1, panelId: 'n1', attached: true, panelTitle: 'claude' }
  ] })
  const row = byId(P.buildCommands(c), 'worktree.reveal.w1')
  if (row) row.run()
  ok('worktree.4 a reveal row per record opens the directory and is searchable by path',
    row !== undefined && row.disabledReason === undefined && row.title.includes('tc/n1-1') &&
      /repo-abc/.test(row.searchText ?? '') &&
      c.actions.calls.some((k) => k[0] === 'revealWorktree' && k[1] === 'w1'),
    JSON.stringify({ row, calls: c.actions.calls }))
}

// M39 — scrollback.1. The one verb the durable log adds to the palette: a
//      destructive, hidden-at-rest row in the Canvas group that routes through
//      the confirm-gated action, never straight to the invoke. Findable by
//      typing "scrollback", "history" or "clear".
{
  const c = ctx()
  const rows = P.buildCommands(c)
  const row = byId(rows, 'canvas.clear-scrollback')
  const resting = P.filterCommands(rows, '').map((r) => r.id)
  const typed = P.filterCommands(rows, 'scrollback').map((r) => r.id)
  if (row) row.run()
  ok('scrollback.1 a destructive, hidden-at-rest Clear scrollback row routes through the confirm-gated action',
    row !== undefined && row.group === 'canvas' && row.destructive === true && row.hiddenAtRest === true &&
      !resting.includes('canvas.clear-scrollback') && typed.includes('canvas.clear-scrollback') &&
      c.actions.calls.some((k) => k[0] === 'beginClearScrollback'),
    JSON.stringify({ row, resting: resting.includes('canvas.clear-scrollback'), typed: typed.includes('canvas.clear-scrollback'), calls: c.actions.calls }))
}

// M42 — search scope, rows and the three empty states. Scoped ids.
//
// search.1. A results array becomes one row per hit, in the search scope,
//      group panel, each running goToPanel with THAT hit's panel id and
//      carrying the matched line so the palette's own filter keeps it. The
//      title is the panel's honest label when known, the id otherwise.
{
  const hits = [
    { panelId: 'n1', line: 'Error: cannot read foo', lineIndex: 12 },
    { panelId: 'n2', line: 'Error: undefined bar', lineIndex: 3 }
  ]
  const c = ctx({ searchQuery: 'error', searchResults: hits, panels: [{ id: 'n1', label: 'claude — api (n1)' }] })
  const rows = P.buildCommands(c).filter((r) => r.scope === 'search')
  const r1 = byId(rows, 'search.hit.n1.12')
  const r2 = byId(rows, 'search.hit.n2.3')
  if (r1) r1.run()
  ok('search.1 each hit is a search-scope panel row running goToPanel with its id and carrying the line',
    rows.length === 2 && r1 !== undefined && r2 !== undefined &&
      r1.group === 'panel' && r1.scope === 'search' &&
      /claude — api/.test(r1.title) && /Error: cannot read foo/.test(r1.subtitle) &&
      /Error: cannot read foo/.test(r1.searchText || '') &&
      /n2/.test(r2.title) &&
      c.actions.calls.filter((x) => x[0] === 'goToPanel').length === 1 &&
      c.actions.calls.filter((x) => x[0] === 'goToPanel')[0][1] === 'n1',
    JSON.stringify({ n: rows.length, r1, calls: c.actions.calls }))
}

// search.2. Three empty states, three distinct renderings: scrollback off is
//      one disabled row with its own reason; a query that matched nothing is
//      a DIFFERENT disabled row naming the query; and no answer yet (null,
//      before the first keystroke) is NO row at all.
{
  const off = P.buildCommands(ctx({ scrollbackEnabled: false, searchQuery: 'x', searchResults: null })).filter((r) => r.scope === 'search')
  const none = P.buildCommands(ctx({ scrollbackEnabled: true, searchQuery: 'zzz', searchResults: [] })).filter((r) => r.scope === 'search')
  const blankBefore = P.buildCommands(ctx({ scrollbackEnabled: true, searchQuery: '', searchResults: null })).filter((r) => r.scope === 'search')
  ok('search.2 the three empty states are three distinct rows: off (its reason), no-match (names the query), and nothing before the first keystroke',
    off.length === 1 && off[0].disabledReason === P.REASON_SEARCH_OFF &&
      none.length === 1 && none[0].disabledReason === P.REASON_SEARCH_NO_MATCHES && /zzz/.test(none[0].subtitle || none[0].title) &&
      P.REASON_SEARCH_OFF !== P.REASON_SEARCH_NO_MATCHES &&
      blankBefore.length === 0,
    JSON.stringify({ off, none, blankBefore }))
}

// search.3. The search scope shows ONLY its own rows: every row it produces
//      is scope 'search', and a hit row never leaks into the top level.
{
  const hits = [{ panelId: 'n1', line: 'match here', lineIndex: 1 }]
  const all = P.buildCommands(ctx({ searchQuery: 'match', searchResults: hits, panels: [{ id: 'n1', label: 'n1' }] }))
  const searchRows = all.filter((r) => r.id.startsWith('search.'))
  ok('search.3 every search row is scope search and none leaks to the top level',
    searchRows.length >= 1 && searchRows.every((r) => r.scope === 'search'),
    JSON.stringify(searchRows.map((r) => ({ id: r.id, scope: r.scope }))))
}

// M44 — keyboard.1. buildCommands emits the panel goto rows in the ORDER
//      ctx.panels is given, so Canvas's orderPanels (on-screen first, then by
//      focus recency) decides the palette's panel-list order rather than the
//      command builder imposing one of its own.
{
  const panels = [
    { id: 'n3', label: 'third (n3)' },
    { id: 'n1', label: 'first (n1)' },
    { id: 'n2', label: 'second (n2)' }
  ]
  const rows = P.buildCommands(ctx({ panels }))
  const gotoOrder = rows.filter((r) => r.id.startsWith('panel.goto.')).map((r) => r.id.replace('panel.goto.', ''))
  ok('keyboard.1 panel goto rows keep the order the context gives them',
    JSON.stringify(gotoOrder) === JSON.stringify(['n3', 'n1', 'n2']),
    JSON.stringify(gotoOrder))
}

// M56 — bookmarks and the trail in the palette. A section that exists in
// SECTIONS order, one Go/Delete pair per bookmark, an add row always, and
// back/forward DISABLED with a reason at the trail's ends rather than absent
// (verify:palette 31's rule: a missing row reads as a feature never built).
{
  const c = ctx({ bookmarks: [{ id: 'b1', name: 'View 1' }, { id: 'b2', name: 'Inbox' }], cameraTrail: { back: false, forward: true } })
  const cmds = P.buildCommands(c)
  const section = P.SECTIONS.find((sec) => sec.id === 'bookmark')
  const order = P.SECTIONS.map((sec) => sec.id)
  const add = byId(cmds, 'bookmark.add')
  const go = byId(cmds, 'bookmark.go.b2')
  const del = byId(cmds, 'bookmark.delete.b1')
  const back = byId(cmds, 'camera.back')
  const fwd = byId(cmds, 'camera.forward')
  if (go) go.run()
  if (add) add.run()
  const calls = c.actions.calls.map((x) => x[0])
  ok('bookmark.1 a Bookmarks section between Workspaces and Canvas; add always; go/delete per bookmark; back disabled with a reason at the trail\'s start and forward enabled',
    section !== undefined && order.indexOf('bookmark') > order.indexOf('workspace') && order.indexOf('bookmark') < order.indexOf('canvas') &&
      add !== undefined && add.group === 'bookmark' && go !== undefined && /Inbox/.test(go.title) && go.group === 'bookmark' &&
      del !== undefined && del.destructive === true && /View 1/.test(del.title) &&
      back !== undefined && typeof back.disabledReason === 'string' && /back/.test(back.disabledReason) &&
      fwd !== undefined && fwd.disabledReason === undefined &&
      calls.includes('goToBookmark') && calls.includes('addBookmark'),
    JSON.stringify({ section, add: add && add.title, go: go && go.title, del: del && del.title, back: back && back.disabledReason, fwd: fwd && fwd.disabledReason, calls }))
}

// M58 — export rows. The panel row is disabled with a distinct reason for
// no focus, a sessionless kind, and scrollback off — three different fixes;
// the canvas row is always runnable.
{
  const panels = [{ id: 'n1', label: 'claude', kind: 'terminal' }, { id: 'r1', label: 'review', kind: 'review' }]
  const on = ctx({ panels, capturedId: 'n1', scrollbackEnabled: true })
  const off = ctx({ panels, capturedId: 'n1', scrollbackEnabled: false })
  const none = ctx({ panels, capturedId: null })
  const wrongKind = ctx({ panels, capturedId: 'r1' })
  const row = (c) => byId(P.buildCommands(c), 'panel.export-text')
  const png = byId(P.buildCommands(on), 'canvas.export-png')
  const r = row(on)
  if (r) r.run()
  if (png) png.run()
  const calls = on.actions.calls.map((x) => x[0])
  ok('export.1 the panel text row runs on a focused terminal with scrollback on, and is disabled by name for no focus / a sessionless kind / scrollback off; the PNG row always runs',
    r !== undefined && r.disabledReason === undefined && calls.includes('exportPanelText') && on.actions.calls.find((x) => x[0] === 'exportPanelText')[1] === 'n1' &&
      typeof row(none).disabledReason === 'string' && typeof row(wrongKind).disabledReason === 'string' && /scrollback/i.test(row(off).disabledReason || '') &&
      row(none).disabledReason !== row(off).disabledReason &&
      png !== undefined && png.disabledReason === undefined && png.group === 'canvas' && calls.includes('exportCanvasPng'),
    JSON.stringify({ r: r && r.disabledReason, none: row(none) && row(none).disabledReason, wrong: row(wrongKind) && row(wrongKind).disabledReason, off: row(off) && row(off).disabledReason, png: png && png.group, calls }))
}

// export.2 (M112, review round 1, CRITICAL 2). Opening the buffer door: a
// SPAWNED panel's row must be enabled regardless of scrollback, because
// M112 gave it a second source (the live buffer) that scrollback.persist
// has no say over. The only case still refused is a panel that has NEVER
// spawned with scrollback off — neither a log nor a buffer exists for it.
{
  const spawnedPanel = [{ id: 'n1', label: 'claude', kind: 'terminal', spawned: true }]
  const neverSpawnedPanel = [{ id: 'n1', label: 'claude', kind: 'terminal', spawned: false }]
  const spawnedOff = ctx({ panels: spawnedPanel, capturedId: 'n1', scrollbackEnabled: false })
  const spawnedOn = ctx({ panels: spawnedPanel, capturedId: 'n1', scrollbackEnabled: true })
  const neverSpawnedOff = ctx({ panels: neverSpawnedPanel, capturedId: 'n1', scrollbackEnabled: false })
  const row2 = (c) => byId(P.buildCommands(c), 'panel.export-text')
  ok('export.2 a spawned panel\'s export row is enabled with scrollback off (the live buffer answers) and with it on; a never-spawned panel with scrollback off is still refused, by a reason distinct from no-focus/wrong-kind',
    row2(spawnedOff) !== undefined && row2(spawnedOff).disabledReason === undefined &&
      row2(spawnedOn) !== undefined && row2(spawnedOn).disabledReason === undefined &&
      row2(neverSpawnedOff) !== undefined && typeof row2(neverSpawnedOff).disabledReason === 'string' &&
      /scrollback/i.test(row2(neverSpawnedOff).disabledReason) && /never started|has not started|hasn't been opened/i.test(row2(neverSpawnedOff).disabledReason),
    JSON.stringify({ spawnedOff: row2(spawnedOff) && row2(spawnedOff).disabledReason, spawnedOn: row2(spawnedOn) && row2(spawnedOn).disabledReason, neverSpawnedOff: row2(neverSpawnedOff) && row2(neverSpawnedOff).disabledReason }))
}

// M59 — the audit's two palette checks.
{
  // rename.1: a bookmark can be renamed, per bookmark, through the input
  // mode presets use — "View 1" forever with delete as the only way out was
  // the dead end the walk found.
  const c = ctx({ bookmarks: [{ id: 'b1', name: 'View 1' }] })
  const row = byId(P.buildCommands(c), 'bookmark.rename.b1')
  if (row) row.run()
  const call = c.actions.calls.find((x) => x[0] === 'beginRenameBookmark')
  ok('rename.1 a Rename bookmark row exists per bookmark and begins the rename with its id and current name',
    row !== undefined && /View 1/.test(row.title) && row.group === 'bookmark' && call !== undefined && call[1] === 'b1' && call[2] === 'View 1',
    JSON.stringify({ row: row && row.title, call }))
  // audit.1: across a matrix of contexts, every disabled row carries a
  // non-empty reason (a disabled row with none is the dead end criterion 1
  // forbids), and every row has a run function and a title.
  const contexts = {
    nothing: ctx({}),
    sessionless: ctx({ panels: [{ id: 'r1', label: 'review', kind: 'review' }], capturedId: 'r1' }),
    merged: ctx({ merged: true, selectedIds: ['n1'], panels: [{ id: 'n1', label: 'x', kind: 'terminal' }], capturedId: 'n1' }),
    scrollbackOff: ctx({ scrollbackEnabled: false, panels: [{ id: 'n1', label: 'x', kind: 'terminal' }], capturedId: 'n1', searchQuery: 'x', searchResults: [] }),
    noNoteRoot: ctx({ noteRoot: null }),
    envMissing: ctx({ envReport: null })
  }
  const bad = []
  let rows = 0
  for (const [name, c2] of Object.entries(contexts)) {
    for (const cmd of P.buildCommands(c2)) {
      rows += 1
      if (typeof cmd.title !== 'string' || cmd.title.trim() === '' || typeof cmd.run !== 'function') bad.push(`${name}:${cmd.id}:shape`)
      if ('disabledReason' in cmd && (typeof cmd.disabledReason !== 'string' || cmd.disabledReason.trim() === '')) bad.push(`${name}:${cmd.id}:empty-reason`)
    }
  }
  ok('audit.1 across six contexts every row has a title and a run, and every disabled row names a non-empty reason',
    rows > 100 && bad.length === 0, JSON.stringify({ rows, bad: bad.slice(0, 8) }))
}

// M61 — group-rows.1. THE GROUP VERBS REACH THE PALETTE. GroupLayer's two
//     buttons ran from onMouseDown alone, so a keyboard user could neither
//     card nor remove a group and no row covered either; M59's audit walked
//     palette reasons and missed a control that had a name but no route. One
//     PAIR of rows, on the group holding the captured panel (never one per
//     group — removeLink's rule), disabled with a named reason when the
//     captured panel is in no group, and refusing in the merged view like
//     every other geometry verb.
{
  const groups = [{ id: 'g1', label: 'backend', colour: 'blue', panelIds: ['n1', 'n2'] }]
  const panels = [{ id: 'n1', label: 'n1', kind: 'terminal', restartable: false, isAgent: false }, { id: 'n3', label: 'n3', kind: 'terminal', restartable: false, isAgent: false }]
  const outside = P.buildCommands(ctx({ panels, groups, capturedId: 'n3' }))
  const none = P.buildCommands(ctx({ panels, groups, capturedId: null }))
  const inside = ctx({ panels, groups, capturedId: 'n1' })
  const rows = P.buildCommands(inside)
  const toggle = byId(rows, 'group.toggle')
  const remove = byId(rows, 'group.remove')
  if (toggle) toggle.run()
  if (remove) remove.run()
  const collapsedRows = P.buildCommands(ctx({ panels, groups: [{ ...groups[0], collapsed: true }], capturedId: 'n1' }))
  const mergedRows = P.buildCommands(ctx({ panels, groups, capturedId: 'n1', merged: true }))
  ok('group-rows.1 Card/Expand and Remove rows act on the captured panel\'s group, and name a reason outside one',
    toggle !== undefined && remove !== undefined &&
      /Card group/.test(toggle.title) && /backend/.test(toggle.title) && /Remove group/.test(remove.title) &&
      toggle.disabledReason === undefined && remove.disabledReason === undefined &&
      inside.actions.calls.some((c) => c[0] === 'toggleGroup' && c[1] === 'g1') &&
      inside.actions.calls.some((c) => c[0] === 'removeGroup' && c[1] === 'g1') &&
      /Expand group/.test(byId(collapsedRows, 'group.toggle').title) &&
      byId(outside, 'group.toggle').disabledReason === P.REASON_NOT_IN_GROUP &&
      byId(outside, 'group.remove').disabledReason === P.REASON_NOT_IN_GROUP &&
      byId(none, 'group.toggle').disabledReason === P.REASON_NO_FOCUS &&
      byId(mergedRows, 'group.toggle').disabledReason === P.REASON_MERGED_READ_ONLY,
    JSON.stringify({ toggle: toggle && [toggle.title, toggle.disabledReason], remove: remove && [remove.title, remove.disabledReason], calls: inside.actions.calls }))
}

// M64 — find.1–.4. FINDING A PANEL. Every row that names a panel led with a
//     machine-minted path and hid the user's own name in the dim hint; the
//     empty search never named its term; fuzzy lit scattered letters across
//     /private/var. Identity leads, provenance follows (brief, principle 3).
{
  const st = (kind, status, dormant) => ({ kind, status, dormant })
  const panels = [
    // No statePriority on the rows: the order must come from the vocabulary's
    // own statePriority(), not from numbers a fixture hands over.
    { id: 'p1', label: 'sh — /Users/me/work/api (p1)', kind: 'terminal', restartable: true, agent: false, name: 'sh', path: '/Users/me/work/api', state: st('terminal', { kind: 'running', pid: 1, command: 'sh', cwd: '/x', reattached: false }, false), stateWord: 'needs you' },
    { id: 'p2', label: 'claude — /Users/me/work/web (p2)', kind: 'terminal', restartable: true, agent: true, name: 'claude', title: 'web front', path: '/Users/me/work/web', state: st('terminal', { kind: 'running', pid: 2, command: 'claude', cwd: '/x', reattached: false }, false), stateWord: 'idle' },
    { id: 'p3', label: 'sh — /Users/me/work/api (p3)', kind: 'terminal', restartable: false, agent: false, name: 'sh', path: '/Users/me/work/api', state: st('terminal', undefined, true), stateWord: 'asleep' },
    { id: 'r1', label: 'review: claude (r1)', kind: 'review', restartable: false, agent: false, name: 'review: claude', state: st('review', undefined, false), stateWord: 'review' }
  ]
  const rows = P.buildCommands(ctx({ panels }))
  const g1 = byId(rows, 'panel.goto.p1'), g2 = byId(rows, 'panel.goto.p2'), g3 = byId(rows, 'panel.goto.p3'), gr = byId(rows, 'panel.goto.r1')
  // The row's TITLE is the name (no verb prefix — the footer and searchText
  // carry "go to"), its hint is the left-truncated path alone, and the state
  // rides as `state` for the palette to render live in its tone.
  ok('find.1 a Go-to row leads with the name, hints the left-truncated path, carries its state input, and never shows the id',
    g1 && g1.title === 'sh' && g1.subtitle === '…/work/api' && g1.pathText === '/Users/me/work/api' && g1.state && g1.state.id === 'p1' && g1.mono === true &&
      g2 && g2.title === 'web front' && g2.subtitle === '…/work/web' &&
      g3 && g3.subtitle === '…/work/api' && g3.state.input.dormant === true &&
      gr && gr.title === 'review: claude' && gr.subtitle === undefined && gr.state.input.kind === 'review' &&
      P.filterCommands(rows, 'go to').filter((r) => r.id.startsWith('panel.goto.')).length === 4 &&
      [g1, g2, g3, gr].every((r) => !/\(p\d\)|\(r1\)/.test(r.title + (r.subtitle ?? ''))),
    JSON.stringify([g1, g2, g3, gr].map((r) => r && [r.title, r.subtitle])))

  const gotos = rows.filter((r) => r.id.startsWith('panel.goto.'))
  const byPath = P.filterCommands(gotos, 'work/api').map((r) => r.id)
  const scattered = P.filterCommands(gotos, 'wrkapi').map((r) => r.id)
  const byName = P.filterCommands(gotos, 'wfr').map((r) => r.id)
  ok('find.2 a path matches only as a contiguous substring; a name still matches as a subsequence',
    byPath.length === 2 && byPath.includes('panel.goto.p1') && byPath.includes('panel.goto.p3') &&
      scattered.length === 0 && byName.length === 1 && byName[0] === 'panel.goto.p2',
    JSON.stringify({ byPath, scattered, byName }))

  const needs = P.filterCommands(gotos, 'state:needs').map((r) => r.id)
  const all = P.filterCommands(gotos, 'state:').map((r) => r.id)
  ok('find.3 state: filters Go-to rows by their state word and orders needs-you first',
    needs.length === 1 && needs[0] === 'panel.goto.p1' &&
      all.length === 4 && all[0] === 'panel.goto.p1' && all[1] === 'panel.goto.p2' && all[2] === 'panel.goto.p3' && all[3] === 'panel.goto.r1',
    JSON.stringify({ needs, all }))

  const empty = byId(P.buildCommands(ctx({ panels, searchQuery: 'zzqx', searchResults: [] })), 'search.none')
  const hit = byId(P.buildCommands(ctx({ panels, searchQuery: 'FAIL', searchResults: [{ panelId: 'p2', lineIndex: 3, line: 'FAIL 3 the writer' }] })), 'search.hit.p2.3')
  ok('find.4 the empty search names the term once and a hit row leads with the panel\'s name',
    empty && empty.title === 'No matches for “zzqx”' && empty.subtitle === undefined &&
      hit && hit.title === 'web front' && hit.subtitle === 'FAIL 3 the writer',
    JSON.stringify({ empty: empty && [empty.title, empty.subtitle], hit: hit && [hit.title, hit.subtitle] }))
}

// M65 — sheet.1/.2. STARTING A PANEL. The sheet's row is the first thing under
//     New panel, with its chord; the default preset's row carries ⌘N. The
//     request the sheet builds is pure: an absent command STAYS absent (M5a's
//     four-layer rule reaching a fifth surface), a typed command becomes a
//     `/bin/sh -lc` task titled with itself, agent options ride only on an
//     agent preset, and a title rides only when typed.
{
  const rows = P.buildCommands(ctx({ presets: [SHELL, CLAUDE, MINE] }))
  const sheet = byId(rows, 'spawn.sheet')
  const spawnRows = P.filterCommands(rows, '').filter((r) => r.group === 'spawn')
  const dflt = byId(rows, 'preset.spawn.shell')
  ok('sheet.1 New panel… is the first spawn row with ⌘⇧N, and the default preset\'s row carries ⌘N',
    sheet !== undefined && sheet.shortcut === '⌘⇧N' && spawnRows[0] && spawnRows[0].id === 'spawn.sheet' && dflt && dflt.shortcut === '⌘N',
    JSON.stringify({ sheet: sheet && sheet.title, first: spawnRows[0] && spawnRows[0].id, dflt: dflt && dflt.shortcut }))
  const build = typeof P.buildSpawnRequest === 'function' ? P.buildSpawnRequest : () => null
  const presets = [{ id: 'shell', name: 'Login shell', agent: undefined }, { id: 'claude', name: 'Claude', agent: 'claude-code' }]
  const a = build({ what: { kind: 'preset', id: 'shell' }, cwd: '/work', title: '', agentOptions: { permissionMode: 'plan' } }, presets)
  const b = build({ what: { kind: 'preset', id: 'claude' }, cwd: '/work', title: 'api', agentOptions: { permissionMode: 'plan' } }, presets)
  const c = build({ what: { kind: 'command', command: 'npm test' }, cwd: '/work', title: '', agentOptions: {} }, presets)
  ok('sheet.2 buildSpawnRequest keeps an absent command absent, carries agent options only for an agent preset, titles a task with its command',
    a && a.presetId === 'shell' && !('command' in a) && !('agentOptions' in a) && !('title' in a) && a.cwd === '/work' &&
      b && b.presetId === 'claude' && b.title === 'api' && b.agentOptions && b.agentOptions.permissionMode === 'plan' &&
      c && !('presetId' in c) && c.command === 'npm test' && c.title === 'npm test',
    JSON.stringify({ a, b, c }))
}

// M66 — voice.1 / rank.1. ONE VOICE PER COLUMN, and a match the user can SEE
//     outranks one they cannot. Settings descriptions were Sentence case with
//     full stops beside lower-case verb-first hints in the same column; and
//     `Tidy everything` led a query for "group" through its hidden searchText
//     with nothing highlighted in its title.
{
  const defs = P.SETTINGS ?? []
  // Interior sentences too: "…another. Clicking it…" is two voices in one
  // hint (M66's verifier). A capital after a stop is the tell; a name like
  // "Claude Code" mid-sentence is not.
  const loud = defs.filter((d) => /^[A-Z]/.test(d.description) || /\.$/.test(d.description) || /\. [A-Z]/.test(d.description)).map((d) => d.id)
  ok('voice.1 every setting description starts lower-case, ends without a full stop, and holds no second sentence', defs.length >= 20 && loud.length === 0, JSON.stringify({ count: defs.length, loud }))
  const list = [
    // The hidden row's searchText holds the word contiguously and EARLY (the
    // haystack leads with searchText), so on score alone it wins.
    cmd('hidden', 'Tidy everything', { group: 'panel', searchText: 'group panels tidy' }),
    cmd('visible', 'Card group', { group: 'panel' })
  ]
  const out = P.filterCommands(list, 'group').map((c) => c.id)
  ok('rank.1 a row whose title visibly matches outranks a row matched only through its searchText', out.length === 2 && out[0] === 'visible', out.join(','))
}

// M73 — chat.1. `New chat…` is a CREATE verb beside New note…, visible at
//     rest for the same reason (it is the only gesture that makes one), and
//     disabled BY NAME when claude is not on the login PATH — derived from
//     the preset rows' own availability, so the palette and the launcher
//     cannot disagree about whether the CLI was found.
{
  const found = P.buildCommands(ctx({ presets: [SHELL, { ...CLAUDE, available: true, agent: 'claude-code' }] }))
  const missing = P.buildCommands(ctx({ presets: [SHELL, { ...CLAUDE, available: false, agent: 'claude-code' }] }))
  const none = P.buildCommands(ctx({ presets: [SHELL] }))
  const a = byId(found, 'panel.new-chat')
  const b = byId(missing, 'panel.new-chat')
  const c = byId(none, 'panel.new-chat')
  const resting = P.filterCommands(found, '')
  ok('chat.1 New chat… is a spawn-group row at rest, enabled when a claude preset is available and disabled by name (the PATH) when it is not or when no claude preset exists',
    a && a.group === 'spawn' && a.disabledReason === undefined && resting.some((r) => r.id === 'panel.new-chat') &&
      b && b.disabledReason === P.REASON_NO_CLAUDE && /PATH/.test(P.REASON_NO_CLAUDE) &&
      c && c.disabledReason === P.REASON_NO_CLAUDE,
    JSON.stringify({ a: a && a.disabledReason, b: b && b.disabledReason, c: c && c.disabledReason }))
}

// M80 — template.1 / template.2. THE TEMPLATE MODEL. template.1: the holes
//      across every field in first-seen order, filled with the composer's own
//      rule (a hole with no value stays as typed), and the nodes placed
//      around a centre. template.2: the named refusal — a node naming a preset
//      that is gone, a chat node with no claude — and none when it can run.
{
  const template = {
    id: 't1', name: 'review {{repository}}',
    nodes: [
      { key: 'chat', kind: 'chat', cwd: '{{repository}}', message: 'Review {{repository}} for {{what}}', dx: -220, dy: 0 },
      { key: 'diff', kind: 'terminal', cwd: '{{repository}}', command: 'git diff --stat', title: '{{what}}', dx: 220, dy: 0 }
    ],
    edges: [{ from: 'chat', to: 'diff', trigger: 'idle' }]
  }
  const holes = P.templateHoles(template)
  const filled = P.fillTemplate(template, { repository: '/r' })
  const both = P.fillTemplate(template, { repository: '/r', what: 'bugs' })
  const placed = P.templatePanels(both, { x: 1000, y: 500 })
  ok('template.1 the holes are the unique names across every field in first-seen order; a filled template keeps a hole with no value as typed; the nodes are placed around the centre in node order',
    JSON.stringify(holes) === '["repository","what"]' &&
      filled.nodes[0].cwd === '/r' && filled.nodes[0].message === 'Review /r for {{what}}' && filled.name === 'review /r' &&
      both.nodes[1].title === 'bugs' && both.nodes[1].command === 'git diff --stat' &&
      placed.length === 2 && placed[0].key === 'chat' && placed[0].centre.x === 780 && placed[0].centre.y === 500 && placed[1].centre.x === 1220,
    JSON.stringify({ holes, filled, placed }))

  const presets = [{ id: 'p1', name: 'shell' }]
  const okTpl = { id: 'a', name: 'a', nodes: [{ key: 'x', kind: 'terminal', presetId: 'p1', cwd: '~', dx: 0, dy: 0 }], edges: [] }
  const gone = { id: 'b', name: 'b', nodes: [{ key: 'x', kind: 'terminal', presetId: 'nope', cwd: '~', dx: 0, dy: 0 }], edges: [] }
  const chat = { id: 'c', name: 'c', nodes: [{ key: 'x', kind: 'chat', cwd: '~', dx: 0, dy: 0 }], edges: [] }
  const bare = { id: 'd', name: 'd', nodes: [{ key: 'x', kind: 'terminal', cwd: '~', dx: 0, dy: 0 }], edges: [] }
  const loop = { id: 'e', name: 'e', nodes: [{ key: 'x', kind: 'terminal', command: 'a', cwd: '~', dx: 0, dy: 0 }, { key: 'y', kind: 'terminal', command: 'b', cwd: '~', dx: 0, dy: 0 }], edges: [{ from: 'x', to: 'y', trigger: 'exit' }, { from: 'y', to: 'x', trigger: 'exit' }] }
  const none = P.buildCommands(ctx()).find((r) => r.id === 'template.none')
  ok('template.2 templateRefusal names the reason — a preset that is gone, a chat node with no claude, a node naming neither, a loop — and is undefined when the template can run; with no templates saved the palette still offers one disabled row',
    P.templateRefusal(okTpl, presets, true) === undefined &&
      typeof P.templateRefusal(gone, presets, true) === 'string' && /preset/.test(P.templateRefusal(gone, presets, true)) &&
      typeof P.templateRefusal(chat, presets, false) === 'string' && /claude/.test(P.templateRefusal(chat, presets, false)) &&
      P.templateRefusal(chat, presets, true) === undefined &&
      /neither/.test(P.templateRefusal(bare, presets, true) ?? '') && /loop/.test(P.templateRefusal(loop, presets, true) ?? '') &&
      none !== undefined && none.disabledReason === P.REASON_NO_TEMPLATES,
    JSON.stringify({ ok: P.templateRefusal(okTpl, presets, true), gone: P.templateRefusal(gone, presets, true), chat: P.templateRefusal(chat, presets, false) }))
}

// M77 — tools.1. `Open review` on a chat gates on `reviewable`, with the chat's
//     own reason when it cannot — never the terminal's `has not started`.
{
  const chatRow = (over = {}) => ({ id: 'c1', label: 'chat · api', kind: 'chat', restartable: false, agent: false, ...over })
  const yes = P.buildCommands(ctx({ capturedId: 'c1', panels: [chatRow({ reviewable: true })] })).find((r) => r.id === 'panel.review')
  const no = P.buildCommands(ctx({ capturedId: 'c1', panels: [chatRow({ reviewable: false, reviewReason: 'send a message first — a chat has no baseline until its agent runs' })] })).find((r) => r.id === 'panel.review')
  const legacy = P.buildCommands(ctx({ capturedId: 'c1', panels: [chatRow()] })).find((r) => r.id === 'panel.review')
  ok('tools.1 Open review on a chat is enabled by reviewable and refused by the chat\'s own reason; a row without the field falls back to restartable',
    yes && yes.disabledReason === undefined && no && /send a message/.test(no.disabledReason) && legacy && legacy.disabledReason === P.REASON_NOT_STARTED,
    JSON.stringify({ yes: yes && yes.disabledReason, no: no && no.disabledReason, legacy: legacy && legacy.disabledReason }))
}

// M76 — approve.1. Two rows per pending request, named with the tool and the
//     panel, each running the ONE answer verb; with nothing pending one
//     disabled row whose reason says so — a row that disappears is
//     indistinguishable from a feature never built.
{
  const withOne = ctx({ approvals: [{ id: 'c1', requestId: 'r1', toolName: 'Bash', argument: 'ls', label: 'api (chat)' }] })
  const rows = P.buildCommands(withOne)
  const allow = rows.find((r) => r.id === 'approval.allow.c1.r1')
  const deny = rows.find((r) => r.id === 'approval.deny.c1.r1')
  if (allow) allow.run()
  if (deny) deny.run()
  const none = P.buildCommands(ctx()).find((r) => r.id === 'approval.none')
  const noneWithOne = rows.find((r) => r.id === 'approval.none')
  ok('approve.1 Allow and Deny rows per pending request, named with the tool and the panel, running the answer verb; one disabled row with a named reason when nothing pends, and none when something does',
    allow && /Allow Bash/.test(allow.title) && /api \(chat\)/.test(allow.title) && allow.disabledReason === undefined && /permission|approve/.test(allow.searchText) &&
      deny && /Deny Bash/.test(deny.title) &&
      withOne.actions.calls.some((c) => c[0] === 'answerApproval' && c[1] === 'c1' && c[2] === 'r1' && c[3] === true) &&
      withOne.actions.calls.some((c) => c[0] === 'answerApproval' && c[1] === 'c1' && c[2] === 'r1' && c[3] === false) &&
      none && none.disabledReason === P.REASON_NO_APPROVALS && /asking/.test(P.REASON_NO_APPROVALS) && noneWithOne === undefined,
    JSON.stringify({ allow: allow && allow.title, deny: deny && deny.title, calls: withOne.actions.calls, none: none && none.disabledReason }))
}

// M74 — front.1. The two front-end rows, each aimed at the captured panel and
//     each disabled BY NAME in every situation it cannot apply: a claude
//     terminal opens as chat only when its process is not live, a plain
//     shell never can, a chat opens in a terminal only at rest and with turns.
//     Neither row is hidden — the rule verify:palette 31 states.
{
  const term = (over = {}) => ({ id: 't1', label: 'claude — api', kind: 'terminal', restartable: true, agent: true, claude: true, ...over })
  const rows = (c) => P.buildCommands(c)
  const exited = byId(rows(ctx({ panels: [term({ state: { kind: 'terminal', status: { kind: 'exited', code: 0 }, dormant: false } })], capturedId: 't1' })), 'panel.open-as-chat')
  const live = byId(rows(ctx({ panels: [term({ state: { kind: 'terminal', status: { kind: 'running', pid: 1, command: 'claude' }, dormant: false } })], capturedId: 't1' })), 'panel.open-as-chat')
  const shell = byId(rows(ctx({ panels: [term({ agent: false, claude: false })], capturedId: 't1' })), 'panel.open-as-chat')
  const codex = byId(rows(ctx({ panels: [term({ agent: true, claude: false })], capturedId: 't1' })), 'panel.open-as-chat')
  const noFocus = byId(rows(ctx({ panels: [term()] })), 'panel.open-as-chat')
  const chatRow = (over = {}) => ({ id: 'c1', label: 'chat · repo', kind: 'chat', restartable: false, agent: false, turns: 2, ...over })
  const rest = byId(rows(ctx({ panels: [chatRow()], capturedId: 'c1' })), 'panel.open-in-terminal')
  const busy = byId(rows(ctx({ panels: [chatRow({ busy: true })], capturedId: 'c1' })), 'panel.open-in-terminal')
  const empty = byId(rows(ctx({ panels: [chatRow({ turns: 0 })], capturedId: 'c1' })), 'panel.open-in-terminal')
  const wrongKind = byId(rows(ctx({ panels: [term({ state: { kind: 'terminal', status: { kind: 'exited', code: 0 }, dormant: false } })], capturedId: 't1' })), 'panel.open-in-terminal')
  const asChatOnChat = byId(rows(ctx({ panels: [chatRow()], capturedId: 'c1' })), 'panel.open-as-chat')
  ok('front.1 Open as chat is enabled for an exited claude terminal and refused by name while live, for a plain shell, with no focus, or on a chat; Open in terminal is enabled for a chat at rest and refused by name while answering, when empty, or on a terminal',
    exited && exited.disabledReason === undefined && live && live.disabledReason === P.REASON_TERMINAL_LIVE &&
      shell && shell.disabledReason === P.REASON_NOT_CLAUDE_SESSION && codex && codex.disabledReason === P.REASON_NOT_CLAUDE_SESSION && noFocus && noFocus.disabledReason === P.REASON_NO_FOCUS &&
      asChatOnChat && asChatOnChat.disabledReason === P.REASON_NOT_CLAUDE_SESSION &&
      rest && rest.disabledReason === undefined && busy && busy.disabledReason === P.REASON_CHAT_BUSY &&
      empty && empty.disabledReason === P.REASON_CHAT_EMPTY && wrongKind && wrongKind.disabledReason === P.REASON_NOT_CHAT &&
      /stop/.test(P.REASON_TERMINAL_LIVE) && /interrupt/.test(P.REASON_CHAT_BUSY),
    JSON.stringify({ exited: exited && exited.disabledReason, live: live && live.disabledReason, shell: shell && shell.disabledReason, rest: rest && rest.disabledReason, busy: busy && busy.disabledReason, empty: empty && empty.disabledReason, wrongKind: wrongKind && wrongKind.disabledReason }))
}

// M88 — github.1. THE SECOND WORK PANEL'S DOOR is present at rest and
//      DISABLED with the Connect reason when no github credential exists —
//      never absent, the rule the Jira door broke for a milestone (its row
//      only existed once a credential did) and `verify:palette 31` states.
//      With a credential it runs the open verb.
{
  let opened = 0
  const actions = { ...spyActions(), openGithub: () => { opened += 1 } }
  const without = P.buildCommands(ctx({ credentials: [], actions }))
  const withCred = P.buildCommands(ctx({ credentials: [{ service: 'github', label: 'octocat', addedAt: 'now', verifiedAt: 'now' }], actions }))
  const rowOff = without.find((c) => c.id === 'github.open')
  const rowOn = withCred.find((c) => c.id === 'github.open')
  if (rowOn && rowOn.disabledReason === undefined) rowOn.run()
  ok('github.1 the Open GitHub work row is present without a credential and disabled with the Connect reason, and enabled with one it opens the panel',
    rowOff !== undefined && typeof rowOff.disabledReason === 'string' && /not connected/.test(rowOff.disabledReason) && /Credentials/.test(rowOff.disabledReason) &&
      rowOn !== undefined && rowOn.disabledReason === undefined && opened === 1,
    JSON.stringify({ rowOff: rowOff && { disabledReason: rowOff.disabledReason }, rowOn: rowOn && { disabledReason: rowOn.disabledReason }, opened }))
}

// M89 — integrations.1. ONE SENTENCE for a missing service, imported, never
//      spelled: the GitHub door's reason IS `notConnectedReason('github')`
//      byte for byte; the Jira rows say the same shape; and the
//      `Manage integrations…` door is present at rest and enters the
//      Credentials scope, so the page and the palette share one path.
{
  const rows = P.buildCommands(ctx({ credentials: [] }))
  const gh = rows.find((c) => c.id === 'github.open')
  const door = rows.find((c) => c.id === 'manage.integrations')
  const one = typeof P.notConnectedReason === 'function' ? P.notConnectedReason('github') : null
  ok('integrations.1 the GitHub door\'s reason is notConnectedReason byte for byte, and Manage integrations… is present at rest and enters the Credentials scope',
    gh !== undefined && one !== null && gh.disabledReason === one &&
      door !== undefined && door.disabledReason === undefined && door.entersScope === 'credentials',
    JSON.stringify({ gh: gh && gh.disabledReason, one, door: door && { scope: door.entersScope, reason: door.disabledReason } }))
}

// M92. Six rows, each PRESENT: lock/unlock, pin/unpin, maximise/restore. The
// pair's second half is the one that applies; the other is disabled with a
// reason naming the state (`already locked`), never hidden.
{
  const plain = ctx({ capturedId: 'n1', panels: [{ id: 'n1', label: '/bin/zsh', kind: 'terminal' }], pinnedCount: 0 })
  const rows = P.buildCommands(plain)
  const ids = ['panel.lock', 'panel.unlock', 'panel.pin', 'panel.unpin', 'panel.maximise', 'panel.restore']
  const present = ids.every((id) => byId(rows, id) !== undefined)
  const lock = byId(rows, 'panel.lock'), unlock = byId(rows, 'panel.unlock'), pin = byId(rows, 'panel.pin'), unpin = byId(rows, 'panel.unpin'), max = byId(rows, 'panel.maximise'), restore = byId(rows, 'panel.restore')
  if (lock) lock.run()
  if (pin) pin.run()
  if (max) max.run()
  const calls = plain.actions.calls.map((c) => c[0] + ':' + c[1])
  const locked = ctx({ capturedId: 'n1', panels: [{ id: 'n1', label: '/bin/zsh', kind: 'terminal', locked: true, pinned: true, maximised: true }], pinnedCount: 1 })
  const r2 = P.buildCommands(locked)
  const full = ctx({ capturedId: 'n2', panels: [{ id: 'n2', label: '/bin/zsh', kind: 'terminal' }], pinnedCount: 7 })
  const sessionless = P.buildCommands(ctx({ capturedId: 'r1', panels: [{ id: 'r1', label: 'review', kind: 'review' }] }))
  const r3 = P.buildCommands(full)
  const none = P.buildCommands(ctx({ capturedId: null, panels: [] }))
  ok('lockpin.1 all six rows are present; on a plain panel lock/pin/maximise run against the captured id and their opposites are disabled naming the state; on a locked, pinned, maximised panel the reverse; the ninth pin is refused naming the count; with no panel every row names the focus fix',
    present && lock.disabledReason === undefined && pin.disabledReason === undefined && max.disabledReason === undefined &&
      /locked/.test(unlock.disabledReason || '') && /pinned/.test(unpin.disabledReason || '') && /maximised/.test(restore.disabledReason || '') &&
      calls.join(',') === 'lockPanel:n1,pinPanel:n1,maximisePanel:n1' &&
      byId(r2, 'panel.unlock').disabledReason === undefined && byId(r2, 'panel.unpin').disabledReason === undefined && byId(r2, 'panel.restore').disabledReason === undefined &&
      /locked/.test(byId(r2, 'panel.lock').disabledReason || '') &&
      /7/.test(byId(r3, 'panel.pin').disabledReason || '') && /unpin/.test(byId(r3, 'panel.pin').disabledReason || '') &&
      /never carded/.test(byId(sessionless, 'panel.pin').disabledReason || '') && byId(sessionless, 'panel.lock').disabledReason === undefined &&
      ids.every((id) => byId(none, id) !== undefined && typeof byId(none, id).disabledReason === 'string'),
    JSON.stringify({ present, calls, unlock: unlock && unlock.disabledReason, full: byId(r3, 'panel.pin') && byId(r3, 'panel.pin').disabledReason }))
}

// M96 — verbs.1. ONE palette row takes a verb and its arguments: present at
// rest, never hidden, and it opens the palette's text mode through the one
// appended action rather than running anything itself.
{
  const c = ctx({ capturedId: 'n1', panels: [{ id: 'n1', label: '/bin/zsh', kind: 'terminal' }] })
  const row = byId(P.buildCommands(c), 'canvas.run-verb')
  if (row) row.run()
  const none = byId(P.buildCommands(ctx()), 'canvas.run-verb')
  ok('verbs.1 `Run a verb…` is present at rest with no focus and with one, is never hidden, names its example in the subtitle, and runs through beginRunVerb',
    row !== undefined && row.disabledReason === undefined && row.hiddenAtRest === undefined && /verb/i.test(row.title) && /close|focus|type/.test(row.subtitle || '') &&
      c.actions.calls.some((call) => call[0] === 'beginRunVerb') && none !== undefined && none.disabledReason === undefined,
    JSON.stringify({ row: row && { title: row.title, subtitle: row.subtitle, reason: row.disabledReason }, calls: c.actions.calls }))
}

// M97 — auto.1. The Auto rows on the captured chat: four modes and a stop,
// every one PRESENT, disabled by name on a terminal or with no focus.
{
  const chat = ctx({ capturedId: 'c1', panels: [{ id: 'c1', label: 'chat', kind: 'chat' }] })
  const rows = P.buildCommands(chat)
  const ids = ['panel.auto.complete', 'panel.auto.harden', 'panel.auto.review', 'panel.auto.custom', 'panel.auto.stop']
  const present = ids.every((id) => byId(rows, id) !== undefined)
  const complete = byId(rows, 'panel.auto.complete')
  if (complete) complete.run()
  const running = P.buildCommands(ctx({ capturedId: 'c1', panels: [{ id: 'c1', label: 'chat', kind: 'chat', auto: { mode: 'complete', turn: 1, limit: 8, state: 'running' } }] }))
  const terminal = P.buildCommands(ctx({ capturedId: 'n1', panels: [{ id: 'n1', label: '/bin/zsh', kind: 'terminal' }] }))
  const none = P.buildCommands(ctx())
  ok('auto.1 the five Auto rows are present on a chat and the modes run startAuto with the mode; while a run is live the modes are disabled naming it and Stop is enabled; on a terminal every row names the chat fix; with no focus every row names the focus fix',
    present && complete.disabledReason === undefined && chat.actions.calls.some((c) => c[0] === 'startAuto' && c[1] === 'c1' && c[2] === 'complete') &&
      byId(chat.actions.calls.length ? rows : [], 'panel.auto.stop').disabledReason !== undefined &&
      /running|already/.test(byId(running, 'panel.auto.complete').disabledReason || '') && byId(running, 'panel.auto.stop').disabledReason === undefined &&
      ids.every((id) => /chat/.test(byId(terminal, id).disabledReason || '')) &&
      ids.every((id) => typeof byId(none, id).disabledReason === 'string'),
    JSON.stringify({ present, calls: chat.actions.calls, stop: byId(rows, 'panel.auto.stop') && byId(rows, 'panel.auto.stop').disabledReason, running: byId(running, 'panel.auto.complete') && byId(running, 'panel.auto.complete').disabledReason }))
}

// M99 — backends.1. The sheet's conversation rows come from the registry:
// one per backend, disabled by name when its CLI is absent, never hidden.
{
  // Guarded: a throw here would abort every check below it (verify-suites.md rule 1).
  const has = typeof P.backendOptions === 'function' && Array.isArray(P.BACKEND_IDS)
  const rows = has ? P.backendOptions({ claude: true, codex: false }) : []
  const all = has ? P.backendOptions({ claude: true, codex: true, copilot: true, acp: true }) : []
  ok('backends.1 backendOptions lists every registered backend in registry order with its id and label; an absent CLI disables its row naming PATH; a present one is enabled with no suffix',
    has && rows.length === P.BACKEND_IDS.length && rows[0].id === 'claude' && rows[0].disabled === false && rows[0].label === 'chat with claude' &&
      rows[1].id === 'codex' && rows[1].disabled === true && /PATH/.test(rows[1].label) &&
      all.every((r) => r.disabled === false && !/PATH/.test(r.label)),
    JSON.stringify({ rows, all }))
}

// M100 — teammate.1. The sheet's `chat as <name>` rows come from the roster
// (one per teammate, in roster order, the id carried), a teammate with no
// places is offered DISABLED naming the fix, and the palette's Manage
// teammates… door is present at rest.
{
  const has = typeof P.teammateOptions === 'function'
  const rows = has ? P.teammateOptions([
    { id: 't1', name: 'ada', brief: '', places: ['/w'], services: [], skills: [], memory: 't1', chats: [], messaging: false, scheduling: false },
    { id: 't2', name: 'bo', brief: '', places: [], services: [], skills: [], memory: 't2', chats: [], messaging: false, scheduling: false }
  ], true) : []
  const door = byId(P.buildCommands(ctx()), 'manage.teammates')
  ok('teammate.1 teammateOptions lists every teammate as `chat as <name>` with its id, disables one with no places naming the fix, and Manage teammates… is present at rest',
    has && rows.length === 2 && rows[0].id === 't1' && rows[0].label === 'chat as ada' && rows[0].disabled === false &&
      rows[1].disabled === true && /place/.test(rows[1].reason) && door !== undefined,
    JSON.stringify({ has, rows, door: door && door.title }))
}

// M103 — browser.1. THE PAGE DOOR IS ALWAYS PRESENT. `Open a page…` needs no
// captured panel and no directory (a URL is typed, not derived), so the row
// is in the list with no reason on an EMPTY context, and running it enters
// the palette's text mode through `beginBrowser` — never mints a panel here,
// because a panel minted from the row would carry no URL.
{
  const c = ctx({})
  const row = byId(P.buildCommands(c), 'canvas.browser')
  if (row) row.run()
  ok('browser.1 the Open a page… row is present with no reason on an empty context and runs beginBrowser',
    row !== undefined && row.disabledReason === undefined && /Open a page/.test(row.title) && row.group === 'spawn' &&
      c.actions.calls.length === 1 && c.actions.calls[0][0] === 'beginBrowser',
    JSON.stringify({ row: row && { id: row.id, title: row.title, group: row.group, disabledReason: row.disabledReason }, calls: c.actions.calls }))
}

// M104 — lineup.1/.2. THE LINEUP PREVIEW before anything is minted. A lineup
// is seats; `lineupPlan` says how many sessions open, each seat's role and
// kind, WHICH seats get a worktree lane (agent seats only — a browser seat
// in a worktree points at a directory the dev server was never started in)
// and how many will queue behind `agents.maxConcurrent`, read live.
{
  const has = typeof P.lineupPlan === 'function' && typeof P.LINEUPS === 'object'
  const ids = has ? Object.keys(P.LINEUPS) : []
  const bench = has ? P.lineupPlan(P.LINEUPS.workbench, { cwd: '/w', worktrees: true, maxConcurrent: 0, liveAgents: 0 }) : null
  const swarm = has ? P.lineupPlan(P.LINEUPS.swarm, { cwd: '/w', worktrees: true, maxConcurrent: 2, liveAgents: 1 }) : null
  const solo = has ? P.lineupPlan(P.LINEUPS.solo, { cwd: '/w', worktrees: false, maxConcurrent: 0, liveAgents: 0 }) : null
  // M121. Sends ALREADY WAITING behind the ceiling take room too: a ceiling
  // of 3 with one live and one queued has room for ONE more, so a Swarm of
  // three queues two — the preview said one (verifier 9, second half).
  const queuedAhead = has ? P.lineupPlan(P.LINEUPS.swarm, { cwd: '/w', worktrees: false, maxConcurrent: 3, liveAgents: 1, queued: 1 }) : null
  const queuedNoCeiling = has ? P.lineupPlan(P.LINEUPS.swarm, { cwd: '/w', worktrees: false, maxConcurrent: 0, liveAgents: 1, queued: 5 }) : null
  ok('lineup.1 the four lineups exist (solo, pair, workbench, swarm); in a Workbench launched into worktrees only the AGENT seat gets a lane and the shell and browser seats stay in the checkout; without worktrees no seat gets one',
    has && ids.join(',') === 'solo,pair,workbench,swarm' && bench !== null && bench.seats.length === 3 &&
      bench.seats.filter((s) => s.kind === 'agent').every((s) => s.lane === true) && bench.seats.filter((s) => s.kind !== 'agent').every((s) => s.lane === false) &&
      bench.seats.some((s) => s.kind === 'browser' && /localhost:3000/.test(s.url || '')) &&
      solo !== null && solo.seats.every((s) => s.lane === false),
    JSON.stringify({ ids, bench, solo }))
  ok('lineup.2 the preview counts the sessions that will open and, against the live ceiling, how many agents will QUEUE — a Swarm of three agents with one live and a ceiling of two queues two, and the sentence says so before anything is minted; no ceiling queues nothing; (M121) sends already waiting take room too — one live and one queued under a ceiling of three queues two of three, the sentence names the waiting send, and with no ceiling a queue changes nothing',
    swarm !== null && swarm.sessions === 4 && swarm.agents === 3 && swarm.queued === 2 && /2 .*queue/.test(swarm.ceilingLine) && /ceiling of 2/.test(swarm.ceilingLine) &&
      bench !== null && bench.queued === 0 && bench.ceilingLine === '' &&
      queuedAhead !== null && queuedAhead.queued === 2 && /1 (already )?waiting/.test(queuedAhead.ceilingLine) &&
      queuedNoCeiling !== null && queuedNoCeiling.queued === 0 && queuedNoCeiling.ceilingLine === '',
    JSON.stringify({ swarm: swarm && { sessions: swarm.sessions, agents: swarm.agents, queued: swarm.queued, ceilingLine: swarm.ceilingLine }, benchLine: bench && bench.ceilingLine, queuedAhead: queuedAhead && { queued: queuedAhead.queued, line: queuedAhead.ceilingLine }, queuedNoCeiling: queuedNoCeiling && queuedNoCeiling.queued }))
}

// M113 — board.1. THE TYPED DOOR. `New work item…` is a canvas-group row (a
// panel-group row competes with Go-to rows by fuzzy score), never disabled,
// running the palette's text mode — a plan has no typist, so the action is
// excluded from the verb table by name rather than reached.
{
  let row, calls = []
  try {
    const c = ctx()
    row = byId(P.buildCommands(c), 'board.new')
    if (row) row.run()
    calls = c.actions.calls.map((x) => x[0])
  } catch (e) { row = { disabledReason: String(e) } }
  ok('board.1 New work item… is a canvas-group row with no disabled reason that runs beginNewWorkItem',
    row !== undefined && row.group === 'canvas' && row.disabledReason === undefined && /New work item/.test(row.title) && calls.includes('beginNewWorkItem'),
    JSON.stringify({ row: row && { id: row.id, group: row.group, title: row.title, disabledReason: row.disabledReason }, calls }))
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
