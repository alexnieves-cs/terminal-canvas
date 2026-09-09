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
  // @renderer is LOAD-BEARING here and has been since M9b; @shared is the
  // pre-emptive one. This comment claimed the opposite until M14 measured it:
  // rail-rows.ts:1 and inspector-fields.ts:3 both import isReviewPanel — a
  // VALUE, not a type — from @renderer/panels/panels, so building this entry
  // with no alias block fails with two "Could not resolve" errors, with
  // @renderer alone it builds, and with @shared alone it fails identically.
  // M11's nav-grid.ts is now a THIRD such import — waitingCount, also a
  // value, from @renderer/shell/rail-sections — so the alias is required by
  // two independent tracks rather than one.
  // A required alias that is present looks exactly like a pre-emptive one,
  // which is why the honest way to answer the question is to DELETE the alias
  // and build rather than to read the imports. See CLAUDE.md's "The plain-node
  // verify bundles now configure a @shared alias" for the corrected table.
  // @shared is now REQUIRED, and the premise this comment used to record —
  // "every @shared import reachable from here is an `import type`" — is false
  // as of M194: `canvas/inspection-directory.ts` value-imports
  // `panels/panels.ts`, which value-imports `carryChatMarks` and
  // `carryBackend` from @shared. That is exactly the re-export chain
  // docs/verify-suites.md warns is easy to miss by eye, and reasoning from the
  // old sentence would conclude the alias is removable. It is not; deleting it
  // and building is still the only way to answer the question.
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

// M63. The rail no longer says the pid — the word is the vocabulary's,
// and with no agent state applied a live process reads `running`.
ok('5 running reads as running', R.railTail(running(48213, '/bin/zsh'), false) === 'running')

// 6. Dormant OUTRANKS the status kind. A dormant panel's status is
//    {kind:'idle'}, and "not started" is true but useless — "asleep" is the
//    vocabulary's word (M63), the same one the panel's own card shows, and it
//    is what tells the user the start control on this row exists at all.
ok('6 dormant outranks the status kind',
  R.railTail({ kind: 'idle' }, true) === 'asleep')

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
ok('9 starting says so', R.railTail({ kind: 'starting' }, false) === 'starting')

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

// 14. FIELD SEPARATION. A label is USER TEXT, and `railTail`'s 'error' case
//     returns `status.message` VERBATIM — the one tail value a fixture can
//     set to arbitrary text, which is what lets the separator itself move
//     between fields. Under the naive `id + '|' + label + '|' + tail + '|' +
//     dormant`, set a's row is 'n1|x|y|t|false' and set b's row is
//     'n1|x|y|t|false' too: the pipe that used to separate label from tail in
//     set a is now sitting one field to the right in set b, and the flattened
//     strings collide even though the two rows hold genuinely different
//     labels and tails. JSON.stringify keeps the two fields quoted and
//     distinct, so it does not collide. This is the check that makes
//     JSON.stringify the answer rather than a chosen separator, and it must
//     keep failing against any implementation that goes back to concatenating
//     with one — see the fix report in task-1-report.md for the fault
//     injection that proves it does.
{
  const a = R.buildRailRows(
    [panel('n1', { title: 'x|y' })],
    statuses({ n1: { kind: 'error', message: 't' } }), NONE)
  const b = R.buildRailRows(
    [panel('n1', { title: 'x' })],
    statuses({ n1: { kind: 'error', message: 'y|t' } }), NONE)
  ok('14 a title cannot forge a field boundary', R.railSignature(a) !== R.railSignature(b))
}

// 15. Array order is preserved and there is exactly one row per panel. Order
//     is `panels` order deliberately — NOT Panel.z. Sorting the rendered list
//     by z would move DOM nodes on every raise, and a move is
//     remove-then-insert; the rail holds no live terminal, but the rule is the
//     one panels.ts states and there is no reason for the two lists to
//     disagree about what order means. The three fixture panels are given
//     DISTINCT, deliberately out-of-step z values (n3:3, n1:1, n2:2) — every
//     other fixture in this file leans on `panel()`'s default `z: 1` for
//     every row, which makes a z-sort a no-op and this check pass identically
//     against `[...panels].sort((a, b) => a.z - b.z)` inserted into
//     `buildRailRows` (confirmed by fault injection: 15/15 either way with a
//     uniform z). With z spread out, array order ('n3,n1,n2') and a z-sort
//     ('n1,n2,n3') diverge, so the assertion below only passes against the
//     array-order implementation the comment above actually describes. Do not
//     "tidy" these back to a uniform z.
{
  const rows = R.buildRailRows(
    [panel('n3', { z: 3 }), panel('n1', { z: 1 }), panel('n2', { z: 2 })], statuses({}), NONE)
  ok('15 one row per panel, in array order',
    rows.length === 3 && rows.map((r) => r.id).join(',') === 'n3,n1,n2')
}

/* ---- The inspector's read model (M8c) ---- */

// 16. Every agent state gets a human label, and the ABSENT state gets one too.
//     Undefined is the ordinary case for a panel that has never spawned, not
//     an error, so a bare `state.toUpperCase()` would throw on the most common
//     input the inspector sees.
{
  const labels = ['starting', 'busy', 'idle', 'wants-you', 'exited']
    .map((s) => R.agentStateLabel(s))
  ok('16 every agent state has a label, and so does the absent one',
    labels.every((l) => typeof l === 'string' && l.length > 0) &&
      new Set(labels).size === 5 &&
      typeof R.agentStateLabel(undefined) === 'string' &&
      R.agentStateLabel(undefined).length > 0,
    JSON.stringify(labels) + ' / ' + JSON.stringify(R.agentStateLabel(undefined)))
}

// 17. THE SHARED PREDICATE. `starting` counts as running.
//     This is not a detail: Canvas.tsx's canvas:counts provider has counted
//     'running' || 'starting' since M5b, because a panel whose pty:create has
//     not resolved yet is emphatically a process the user has started — and
//     main's reset confirm names that number. The inspector's summary must not
//     invent a second answer to the same question, so both read THIS. A
//     'starting'-excluding implementation passes every other check here and
//     makes two surfaces disagree only in the window a spawn is in flight.
ok('17 isRunning counts starting as running, and nothing else as running',
  R.isRunning({ kind: 'starting' }) === true &&
    R.isRunning(running(1, '/bin/zsh')) === true &&
    R.isRunning({ kind: 'idle' }) === false &&
    R.isRunning({ kind: 'exited', code: 0 }) === false &&
    R.isRunning({ kind: 'error', message: 'x' }) === false &&
    R.isRunning(undefined) === false)

// 18. The empty state's summary.
{
  const panels = [panel('n1'), panel('n2'), panel('n3')]
  const st = statuses({ n1: running(1, '/bin/zsh'), n2: { kind: 'starting' } })
  const s = R.buildInspectorSummary(panels, st, ['n1'])
  ok('18 the summary counts panels, running and waiting',
    s.panels === 3 && s.running === 2 && s.waiting === 1, JSON.stringify(s))
}

// 19. PHANTOM FILTER. An id in the attention set whose panel is gone must not
//     be counted. Agent state survives a panel's closure (main sends the
//     transition, the renderer's store keeps it until something clears it), so
//     the waiting set can legitimately name an id no panel answers to — the
//     same orphan reachableQueue drops at the head of the jump queue. Counting
//     it gives a summary that says "1 waiting" on a canvas with nothing to go
//     to, and the user hunts for a panel that does not exist.
{
  const s = R.buildInspectorSummary([panel('n1')], statuses({}), ['n1', 'ghost'])
  ok('19 the summary ignores a waiting id no panel answers to',
    s.waiting === 1, JSON.stringify(s))
}

// M46 — summary.1. The no-selection summary carries the CANVAS-WIDE token
//      and dollar totals (backlog #19's aggregate half): the sum over every
//      panel's usage, priced per model exactly as one panel is, so a panel
//      whose model has no price makes the TOTAL unpriceable (undefined) rather
//      than silently smaller. A fourth argument, `usageOf`, and nothing else
//      changes for the three counts.
{
  const panels = [panel('n1'), panel('n2'), panel('n3')]
  const st = statuses({})
  const u = (input, output, model) => ({
    totals: { input, output, cacheWrite: 0, cacheRead: 0 },
    byModel: { [model]: { input, output, cacheWrite: 0, cacheRead: 0 } }, turns: 1, subagentTurns: 0 })
  const usage = { n1: u(1000, 100, 'claude-sonnet-5'), n2: u(500, 50, 'claude-sonnet-5') }
  const s = R.buildInspectorSummary(panels, st, [], (id) => usage[id])
  const bad = R.buildInspectorSummary(panels, st, [], (id) => id === 'n3' ? u(1, 1, 'nobody-knows-this-model') : usage[id])
  const none = R.buildInspectorSummary(panels, st, [])
  ok('summary.1 the summary totals tokens and list-price dollars across every panel, and an unpriceable panel makes the total undefined',
    s.tokens === 1650 && typeof s.cost === 'number' && s.cost > 0 &&
      bad.tokens === 1652 && bad.cost === undefined &&
      none.tokens === 0 && none.cost === 0,
    JSON.stringify({ s, bad, none }))
}

// M49 — type.1. The Detail field: the effective size, and whether it is the
//      default or this panel's own.
{
  const p = panel('n1')
  const m = R.buildInspectorModel(p, undefined, undefined, [], undefined, undefined, { fontSize: 13, isDefault: true })
  const o = R.buildInspectorModel({ ...p, fontSize: 16 }, undefined, undefined, [], undefined, undefined, { fontSize: 16, isDefault: false })
  const f = (mm) => mm.fields.find((x) => x.key === 'font-size')
  ok('type.1 the inspector shows the effective font size and whether it is the default',
    f(m) !== undefined && /13/.test(f(m).value) && /default/.test(f(m).value) &&
      f(o) !== undefined && /16/.test(f(o).value) && !/default/.test(f(o).value),
    JSON.stringify({ m: f(m), o: f(o) }))
}

// 20. The heading is the SAME honest chain the rail and the header walk.
//     Two labels for one panel differing only in the common case is the defect
//     railLabel's own comment describes; the inspector must not reopen it.
{
  const m = R.buildInspectorModel(panel('n1'), running(48213, '/bin/zsh'))
  ok('20 the heading resolves the honest chain, not the spec',
    m.heading === '/bin/zsh' && m.id === 'n1', JSON.stringify(m.heading))
}

// 21. THE CHECK THIS PANE EXISTS FOR. The links are shown SEPARATELY, not
//     collapsed. "Why does this say login shell" is only answerable if the
//     user can see that the spec asked for nothing AND that main resolved
//     /bin/zsh. A model that rendered one merged `command` field would satisfy
//     check 20 and leave the question unanswerable, which is the whole read
//     half's stated purpose.
{
  const m = R.buildInspectorModel(panel('n1'), running(48213, '/bin/zsh'))
  const f = (k) => m.fields.find((x) => x.key === k)
  ok('21 the resolved command and the spec\'s absence are separate fields',
    f('command') !== undefined && f('command').value === '/bin/zsh' &&
      f('spec-command') !== undefined && f('spec-command').value !== '/bin/zsh' &&
      f('spec-command').value.length > 0,
    JSON.stringify(m.fields))
}

// 22. cwd comes from what main resolved while running, and falls back to the
//     spec's when there is no resolved answer yet. Both halves: a
//     status-only implementation renders an empty cwd for every panel that has
//     not spawned, which is every panel on a restored canvas.
{
  const runningCwd = R.buildInspectorModel(
    panel('n1'), { kind: 'running', pid: 1, command: '/bin/zsh', cwd: '/Users/x/proj', reattached: false })
  const idleCwd = R.buildInspectorModel(panel('n1', { spec: { cwd: '~/fallback', args: [] } }), undefined)
  const f = (m, k) => m.fields.find((x) => x.key === k).value
  ok('22 cwd is the resolved one while running, the spec\'s otherwise',
    f(runningCwd, 'cwd') === '/Users/x/proj' && f(idleCwd, 'cwd') === '~/fallback',
    `${f(runningCwd, 'cwd')} / ${f(idleCwd, 'cwd')}`)
}

// 23. Exit code 0 must RENDER. It is the single most common exit there is, and
//     `code || '—'` prints the wrong thing for exactly it — the same lesson
//     railTail's comment records one screenful up. Asserted with 0 explicitly,
//     because a check written with a non-zero code passes either way.
{
  const m = R.buildInspectorModel(panel('n1'), { kind: 'exited', code: 0 })
  const f = m.fields.find((x) => x.key === 'exit')
  ok('23 an exit code of 0 is rendered, not swallowed',
    f !== undefined && f.value.includes('0'), JSON.stringify(f))
}

// 24. The reattached badge — M6a carried this field with ZERO readers and
//     CLAUDE.md records the spec's "a reattached panel visibly says so"
//     criterion as deliberately unmet. This is the first reader.
{
  const fresh = R.buildInspectorModel(panel('n1'), running(1, '/bin/zsh'))
  const back = R.buildInspectorModel(panel('n1'),
    { kind: 'running', pid: 1, command: '/bin/zsh', cwd: '~', reattached: true })
  ok('24 reattached is carried from the status, both ways',
    fresh.reattached === false && back.reattached === true)
}

// 25. THE RESTART GATE. Offered for a SPAWNED panel only — running or exited.
//     Exited is the most natural target the verb has ("run that again"), so an
//     implementation gating on `kind === 'running'` alone reads as correct and
//     removes the verb from the case that wants it most. A never-started panel
//     has its own verb with its own affordance (M8b's start control) and must
//     not get a second one here.
{
  const of = (status) => R.buildInspectorModel(panel('n1'), status).restartable
  ok('25 restartable for running and exited, not for a panel that never started',
    of(running(1, '/bin/zsh')) === true &&
      of({ kind: 'exited', code: 1 }) === true &&
      of({ kind: 'starting' }) === true &&
      of({ kind: 'idle' }) === false &&
      of(undefined) === false)
}

// 25b. THE SAME GATE, AS AN EXPORTED PREDICATE. Canvas's panelRows needs this
//      exact answer for the palette's Restart row, and two copies of "can this
//      be restarted" would let the inspector offer the verb while the palette
//      refused it for the same panel, both on screen at the same time — the
//      drift isRunning's own comment describes one function up.
//
//      `error` is asserted here and NOT in check 25 above, which reads the
//      model rather than the predicate: restarting after a spawn that errored
//      is the second most natural target the verb has, and an implementation
//      written to the phrase "running, starting or exited" would exclude it
//      while looking entirely correct.
ok('25b isRestartable is the gate, exported',
  R.isRestartable(running(1, '/bin/zsh')) === true &&
    R.isRestartable({ kind: 'starting' }) === true &&
    R.isRestartable({ kind: 'exited', code: 0 }) === true &&
    R.isRestartable({ kind: 'error', message: 'x' }) === true &&
    R.isRestartable({ kind: 'idle' }) === false &&
    R.isRestartable(undefined) === false)

// 26. THE 60Hz DEFENCE, and the reason this module exists rather than a .map()
//     in Canvas.tsx. The selected panel comes out of `panels`, which is a
//     fresh array on every setPanelRect — every frame of a drag. The rect is
//     carried in the fixture BECAUSE this check moves it; a model that ignored
//     rects by construction would make this vacuous.
{
  const a = R.buildInspectorModel(panel('n1'), running(1, '/bin/zsh'))
  const b = R.buildInspectorModel(
    { ...panel('n1'), rect: { id: 'n1', x: 900, y: -400, w: 500, h: 300 } },
    running(1, '/bin/zsh'))
  ok('26 the signature ignores a rect change',
    R.inspectorSignature(a) === R.inspectorSignature(b))
}

// 27. …and moves for everything a field actually renders. Three separate
//     movers, because an implementation that hashed only the id passes 26.
{
  const base = R.buildInspectorModel(panel('n1'), running(1, '/bin/zsh'))
  const titled = R.buildInspectorModel(panel('n1', { title: 'auth' }), running(1, '/bin/zsh'))
  const repid = R.buildInspectorModel(panel('n1'), running(2, '/bin/zsh'))
  const gone = R.buildInspectorModel(panel('n1'), { kind: 'exited', code: 3 })
  const sig = R.inspectorSignature
  ok('27 the signature moves on a title, a pid and a status change',
    sig(base) !== sig(titled) && sig(base) !== sig(repid) && sig(base) !== sig(gone))
}

// 27b. Nothing selected is a first-class state, not a crash. Canvas passes
//      null when selectedId is null — which is every launch before the first
//      click, and every background click after one.
ok('27b the signature accepts the empty selection',
  typeof R.inspectorSignature(null) === 'string' &&
    R.inspectorSignature(null) !== R.inspectorSignature(
      R.buildInspectorModel(panel('n1'), undefined)))


/* ---- The workspaces section (M8d) ---- */

// A WorkspaceRow as main's workspace:list hands one back, trimmed to what
// buildWorkspaceRows reads.
const ws = (id, name, panelIds, active = false) => ({ id, name, panelIds, active })

// 28. The intersection, and the ONE derivation. commands.ts computed this
//     inline until M8d; two derivations of one number agree the day they are
//     written and drift the first time one is wrong, and the drift here is a
//     count on screen that no log explains.
ok('28 waitingCount counts this workspace\'s panels that are waiting',
  R.waitingCount(['a', 'b', 'c'], ['b', 'c', 'z']) === 2)

// 29. An attention id that names no panel of THIS workspace contributes
//     nothing. That covers both real cases at once: a panel waiting in some
//     OTHER workspace, and a phantom — an id whose panel is gone but whose
//     agent state survived the closure, the same orphan reachableQueue drops.
//
//     28 already exercises ONE foreign id inside a partial overlap, so this is
//     the no-overlap boundary rather than the first sighting of the fault; a
//     plain attentionIds.length is caught earlier and louder, by 28, 30 and 31
//     alike. The second clause is the one this check adds that nothing else
//     covers: an EMPTY workspace must read 0 however many agents are waiting
//     elsewhere, which is the row a just-created workspace renders.
ok('29 waitingCount ignores an id this workspace does not own',
  R.waitingCount(['a'], ['zz', 'yy']) === 0 &&
    R.waitingCount([], ['a', 'b']) === 0)

// 30. The row carries what the section renders: the name, a panel COUNT (not
//     the ids), its own waiting count, and the active flag. `waiting` stays a
//     NUMBER — the view composes the text, the same rule Command.waiting
//     obeys in the palette (verify:palette 64).
{
  const rows = R.buildWorkspaceRows(
    [ws('w1', 'Main', ['n1', 'n2'], true), ws('w2', 'Scratch', ['n3'])],
    ['n2'])
  ok('30 a workspace row carries name, panel count, waiting count and active',
    rows.length === 2 &&
      rows[0].id === 'w1' && rows[0].name === 'Main' &&
      rows[0].panels === 2 && rows[0].waiting === 1 && rows[0].active === true &&
      rows[1].panels === 1 && rows[1].waiting === 0 && rows[1].active === false)
}

// 31. Per workspace, never global. A waiting panel in Main must not inflate
//     Scratch's count — the failure a global `attentionIds.length` produces,
//     which reads as "every workspace is waiting for you" and makes the
//     number worthless the moment there is more than one canvas.
{
  const rows = R.buildWorkspaceRows(
    [ws('w1', 'Main', ['n1'], true), ws('w2', 'Scratch', ['n2'])],
    ['n1'])
  // Length-guarded, and not for tidiness: at the RED step buildWorkspaceRows
  // is a stub returning [], so an unguarded rows[0].waiting is a TypeError —
  // which ENDS THE RUN and takes every check below it with it (CLAUDE.md, "A
  // check that THROWS aborts the run").
  ok('31 the waiting count is per workspace, not global',
    rows.length === 2 && rows[0].waiting === 1 && rows[1].waiting === 0)
}

// 32. THE 60Hz DEFENCE, in the shape this section actually needs it. There is
//     no rect here to move, so the volatile input is IDENTITY: reloadWorkspaces()
//     hands Canvas a brand-new array of brand-new objects on every palette
//     open, and without a signature that ignores identity the useMemo would
//     hand SideRail a fresh array — defeating its memo — for a reload that
//     changed nothing at all.
{
  const a = R.buildWorkspaceRows([ws('w1', 'Main', ['n1'], true)], ['n1'])
  const b = R.buildWorkspaceRows([ws('w1', 'Main', ['n1'], true)], ['n1'])
  ok('32 the workspace signature ignores array and object identity',
    a !== b && R.workspaceSignature(a) === R.workspaceSignature(b))
}

// 33. …and moves for everything the row renders. THREE separate movers,
//     because an implementation that hashed only the ids passes 32 — and a
//     frozen array with a stale count is a rail that reports "2 waiting"
//     forever with nothing throwing.
{
  const base = R.buildWorkspaceRows([ws('w1', 'Main', ['n1'], true)], [])
  const renamed = R.buildWorkspaceRows([ws('w1', 'Home', ['n1'], true)], [])
  const grown = R.buildWorkspaceRows([ws('w1', 'Main', ['n1', 'n2'], true)], [])
  const waiting = R.buildWorkspaceRows([ws('w1', 'Main', ['n1'], true)], ['n1'])
  const sig = R.workspaceSignature
  ok('33 the workspace signature moves on a name, a count and a waiting change',
    sig(base) !== sig(renamed) && sig(base) !== sig(grown) &&
      sig(base) !== sig(waiting))
}

/* ---- The attention section (M8d) ---- */

// A RailRow as buildRailRows produces one, trimmed to what buildAttentionRows
// reads. Built through the real railLabel so the label under test is the same
// one the Panels section renders, not a literal that could drift from it.
const railRowFor = (id, panel, status) => ({
  id, label: R.railLabel(panel, status), tail: 'x', dormant: false
})

// 34. Queue ORDER survives, and a phantom does not. The queue is ENTRY order —
//     longest-waiting first — which is the whole of what makes this a queue
//     rather than a set; an implementation that mapped over panelRows and
//     filtered by membership would render the CANVAS's order instead and look
//     entirely correct until two agents ring in the wrong sequence.
//
//     The phantom is the same orphan reachableQueue drops: agent state
//     survives a panel's closure by design, so an id here can name a panel
//     that no longer exists, and a row for it navigates nowhere.
{
  const rows = R.buildAttentionRows(
    ['n3', 'ghost', 'n1'],
    [railRowFor('n1', panel('n1'), running(1, '/bin/zsh')),
     railRowFor('n3', panel('n3'), running(3, '/bin/zsh'))])
  ok('34 the attention rows keep queue order and drop a phantom',
    rows.length === 2 && rows[0].id === 'n3' && rows[1].id === 'n1')
}

// 35. ONE LABEL PER PANEL, and this is why the builder takes the built
//     RailRow[] rather than the panels: looking the label up off the row the
//     Panels section already renders is what stops the two sections showing
//     two different names for one panel. The fixture is a TITLED panel, so a
//     builder that re-derived from spec.command would say "/bin/zsh" here
//     while the Panels row three lines up said "auth refactor".
{
  const p = panel('n1', { title: 'auth refactor' })
  const rows = R.buildAttentionRows(['n1'], [railRowFor('n1', p, running(1, '/bin/zsh'))])
  ok('35 an attention row shows the Panels row\'s label for the same id',
    rows.length === 1 && rows[0].label === R.railLabel(p, running(1, '/bin/zsh')) &&
      rows[0].label === 'auth refactor')
}

// 36. The signature ignores identity and moves on both things a row shows.
//     ORDER is one of them and is easy to miss: two queues holding the same
//     ids in a different sequence are genuinely different lists, and a
//     signature blind to order would freeze the section on a stale sequence
//     while every id in it was still correct.
{
  const rows = (queue, title) => R.buildAttentionRows(
    queue,
    [railRowFor('n1', panel('n1', title ? { title } : {}), running(1, '/bin/zsh')),
     railRowFor('n2', panel('n2'), running(2, '/bin/sh'))])
  const sig = R.attentionSignature
  const base = rows(['n1', 'n2'])
  ok('36 the attention signature ignores identity and moves on order and label',
    sig(base) === sig(rows(['n1', 'n2'])) && base !== rows(['n1', 'n2']) &&
      sig(base) !== sig(rows(['n2', 'n1'])) &&
      sig(base) !== sig(rows(['n1', 'n2'], 'renamed')))
}

// 36b. The empty queue is a first-class state, not a crash — and it is the
//      state this section is in nearly all the time, which is exactly why it
//      is the one an implementation is least likely to have looked at.
ok('36b the empty queue signs as a stable, distinct string',
  typeof R.attentionSignature(R.buildAttentionRows([], [])) === 'string' &&
    R.attentionSignature(R.buildAttentionRows([], [])) !==
      R.attentionSignature(R.buildAttentionRows(
        ['n1'], [railRowFor('n1', panel('n1'), running(1, '/bin/zsh'))])))

// 37. not-a-repo renders NOTHING — hidden, not an error row. It is the
//     ordinary answer for a panel in the home directory, i.e. most panels,
//     and a red field on most panels most of the time trains the user to
//     ignore the section entirely.
ok('37 not-a-repo is hidden, not an error',
  R.buildReviewFields({ kind: 'not-a-repo' }).hidden === true)

// 38. An absent result — the query has not answered yet — is also hidden, and
//     must not throw. Every selection change passes through this state.
ok('38 an absent result is hidden and does not throw',
  R.buildReviewFields(undefined).hidden === true)

// 39. The real answer names files and both totals, with the counts as the
//     numbers they are rather than pre-formatted text.
{
  const m = R.buildReviewFields({
    kind: 'changes', root: '/r', added: 12, removed: 3,
    files: [{ path: 'a.ts', added: 12, removed: 3, binary: false, untracked: false }]
  })
  ok('39 changes names files and both totals',
    m.hidden === false && m.files.length === 1 &&
      m.summary.includes('1 file') && m.summary.includes('12') && m.summary.includes('3'))
}

// 40. Ten files, then a `+N more` tail. The pane is 260px wide and an
//     unbounded list turns the inspector into a scrolling surface it has
//     never been.
{
  const files = Array.from({ length: 14 }, (_, i) =>
    ({ path: `f${i}.ts`, added: 1, removed: 0, binary: false, untracked: false }))
  const m = R.buildReviewFields({ kind: 'changes', root: '/r', added: 14, removed: 0, files })
  ok('40 the file list caps at REVIEW_FILE_CAP with a more count',
    m.files.length === R.REVIEW_FILE_CAP && m.more === 4)
}

// 41. `shared` says the COUNT and says it cannot attribute. The files are
//     still listed — repository-level truth is still truth — so a check that
//     only asserted "files is empty" would pin the wrong design.
{
  const m = R.buildReviewFields({
    kind: 'shared', root: '/r', panelCount: 4,
    files: [{ path: 'a.ts', added: 1, removed: 0, binary: false, untracked: false }]
  })
  ok('41 shared lists its files and names the panel count',
    m.files.length === 1 && m.note !== undefined && m.note.includes('4'))
}

// 42. baseline-lost and never-started are DIFFERENT notes. They are two
//     situations with two different fixes — "restart this panel" versus
//     "start it" — and collapsing them tells a user whose agent has been
//     running for an hour that it has not started.
{
  const lost = R.buildReviewFields({ kind: 'baseline-lost', root: '/r' })
  const never = R.buildReviewFields({ kind: 'never-started' })
  ok('42 baseline-lost and never-started carry different notes',
    lost.note !== undefined && never.note !== undefined && lost.note !== never.note)
}

// 43. `clean` is a VISIBLE "no changes", not hidden. Hiding it makes a panel
//     that has genuinely changed nothing indistinguishable from one the
//     feature is not working for.
{
  const m = R.buildReviewFields({ kind: 'clean', root: '/r' })
  ok('43 clean is visible and says so',
    m.hidden === false && m.files.length === 0 && m.summary.toLowerCase().includes('no change'))
}

// 44. The signature moves on a change and is stable otherwise — the same 60Hz
//     defence inspectorSignature gives the pane's other half.
{
  const a = { kind: 'changes', root: '/r', added: 1, removed: 0,
    files: [{ path: 'a.ts', added: 1, removed: 0, binary: false, untracked: false }] }
  const b = { kind: 'changes', root: '/r', added: 2, removed: 0,
    files: [{ path: 'a.ts', added: 2, removed: 0, binary: false, untracked: false }] }
  ok('44 reviewSignature is stable and moves on a change',
    R.reviewSignature(R.buildReviewFields(a)) === R.reviewSignature(R.buildReviewFields(a)) &&
      R.reviewSignature(R.buildReviewFields(a)) !== R.reviewSignature(R.buildReviewFields(b)))
}

// 45. git-missing is the one arm 37-44 left uncovered, and it is the branch a
//     user hits when the app cannot find git at all. It must assert the
//     arm's actual content, not merely that it differs from some other arm —
//     a regression that swapped it with baseline-lost's model, or that left
//     it hidden like not-a-repo, would still pass "differs from X" and would
//     read on screen as the Changes section silently rendering nothing on
//     every panel, which looks like a feature that was never built rather
//     than a bug.
ok('45 git-missing is visible with its own summary and note',
  (() => {
    const m = R.buildReviewFields({ kind: 'git-missing' })
    return m.hidden === false && m.summary === 'unavailable' && m.note === 'no git binary was found'
  })())

// 46. The new arm RENDERS, with a note naming the cause. `hidden` would be
//     the wrong answer here for the same reason `clean` is not hidden: a
//     panel the feature is broken for and a panel with nothing to report
//     must not look identical.
{
  const m = R.buildReviewFields({ kind: 'repo-unreadable', detail: 'xcrun: error: invalid active developer path' })
  ok('46 repo-unreadable renders a note, not nothing',
    m.hidden === false && m.summary === 'unavailable' &&
      typeof m.note === 'string' && m.note.includes('xcrun'))
}

// 47. The boundary the new arm exists to draw, from the other side:
//     not-a-repo is STILL hidden. It is the ordinary answer for a panel in
//     the home directory, and a permanent error row on most panels teaches
//     the user to stop reading the section. Asserting 46 alone passes
//     against an implementation that stopped hiding anything.
ok('47 not-a-repo is still hidden', R.buildReviewFields({ kind: 'not-a-repo' }).hidden === true)

const SUBJ = { subjectId: 'n4', repoRoot: '/tmp/repo', baselineSha: 'abc', label: 'claude' }
const nodeModel = (result, expandedPath = null, title) =>
  R.buildReviewNodeModel({ subject: SUBJ, title, result, expandedPath })

// 48. An UNRESOLVED query still renders. This is the first of the two places
//     the node deliberately disagrees with the inspector: buildReviewFields
//     returns HIDDEN for `undefined`, because the pane flickers through that
//     state on every selection change. A node is a panel the user opened on
//     purpose, and one that renders nothing while its invoke is in flight is
//     indistinguishable from one that is broken.
{
  const m = nodeModel(undefined)
  ok('48 an in-flight query still renders a heading and a summary',
    m.heading.includes('claude') && m.summary !== '' && m.files.length === 0)
}

// 49. THE ONE TO KNOW BY NUMBER. not-a-repo is HIDDEN in the pane and
//     RENDERED in the node, and both halves are asserted in one condition —
//     asserting only the node half passes against an implementation that
//     simply called buildReviewFields and ignored `hidden`, which is the
//     obvious "don't repeat yourself" move and is wrong: it would render a
//     deliberately-opened panel as an empty box.
ok('49 not-a-repo: hidden in the pane, rendered in the node',
  R.buildReviewFields({ kind: 'not-a-repo' }).hidden === true &&
    nodeModel({ kind: 'not-a-repo' }).summary !== '')

// 50. Exactly one row is expanded, and it is the one named. `expanded` lives
//     on the ROW rather than as a separate id on the model so the view can
//     render without a second lookup — and so a path that is no longer in
//     the list (the file was reverted between queries) expands nothing at
//     all rather than leaving a dangling open panel.
{
  const result = { kind: 'changes', root: '/r', added: 4, removed: 1, files: [
    { path: 'a.ts', added: 3, removed: 1, binary: false, untracked: false },
    { path: 'b.ts', added: 1, removed: 0, binary: false, untracked: false }
  ] }
  const m = nodeModel(result, 'b.ts')
  const gone = nodeModel(result, 'deleted.ts')
  ok('50 exactly the named row is expanded',
    m.files[0].expanded === false && m.files[1].expanded === true &&
      gone.files.every((f) => f.expanded === false))
}

// 51. The node's cap is its own, and it is LARGER than the pane's: the node
//     is a scroll host in world space, the 260px inspector is not. Sharing
//     REVIEW_FILE_CAP would silently truncate a review of a large change to
//     ten files, which is the omission this feature's honest-degradation
//     rule forbids — so `more` reports the remainder either way.
{
  const files = Array.from({ length: R.NODE_FILE_CAP + 5 }, (_, i) =>
    ({ path: `f${i}.ts`, added: 1, removed: 0, binary: false, untracked: false }))
  const m = nodeModel({ kind: 'changes', root: '/r', added: 65, removed: 0, files })
  ok('51 the node caps at its own, larger cap and reports the rest',
    R.NODE_FILE_CAP > R.REVIEW_FILE_CAP && m.files.length === R.NODE_FILE_CAP && m.more === 5)
}

// 52. The model is a pure function of its inputs, which is what lets
//     ReviewNode.tsx memo the BUILD on those inputs and carry no signature of
//     its own — unlike rail-rows.ts, which needs one.
//
//     The distinction is the point of this check's shape. buildRailRows is
//     handed `panels.map(...)`, freshly allocated every render, so nothing
//     there is identity-stable and only a content hash can answer "did
//     anything I render change". Every input here survives a rect change by
//     reference, so React's dependency comparison answers it for free — and
//     a signature over a model carrying up to 600 lines of diff text would
//     have to be recomputed on every frame of a drag to save one object
//     allocation, imposing the exact cost it exists to prevent.
//
//     So the serialization happens HERE, in the check, where it is free and
//     runs once. Equal inputs must produce a DEEP-equal model, and three
//     separate INPUTS must each move it — the result, the expanded path and
//     the title — because an implementation that carried only the file list
//     passes the first clause alone.
//
//     The `diff` travelling in the painted pair is FIXTURE BOOKKEEPING, not a
//     fourth mover, and the distinction cost this check a clause. It is what
//     the node paints beneath the model, so painting the pair is what the
//     component actually renders — but it is not an input to
//     buildReviewNodeModel, so an assertion that varying it changes the
//     string is true of EVERY implementation, a constant-returning one
//     included. It is therefore held IDENTICAL across all four paintings, so
//     that any difference observed is the model's and nothing else's.
{
  const result = { kind: 'changes', root: '/r', added: 1, removed: 0, files: [
    { path: 'a.ts', added: 1, removed: 0, binary: false, untracked: false }] }
  const diff = { kind: 'diff', truncated: 0, lines: [{ kind: 'add', text: '+x' }] }
  const painted = (model, d) => JSON.stringify([model, d])
  const a = painted(nodeModel(result), diff)
  const b = painted(nodeModel(result), diff)
  const expanded = painted(nodeModel(result, 'a.ts'), diff)
  // A DIFFERENT ReviewResult, which is the input the decorative diff clause
  // used to stand in for: `clean` and `changes` are the two arms a user is
  // most often looking at, and a model that ignored `result` entirely would
  // still satisfy the expansion and title clauses.
  const otherResult = painted(nodeModel({ kind: 'clean', root: '/r' }), diff)
  const renamed = painted(nodeModel(result, null, 'my review'), diff)
  ok('52 the model is pure in its inputs, and result, expansion and title all move it',
    a === b && expanded !== a && otherResult !== a && renamed !== a)
}

const reviewPanel = (id, over = {}) => ({
  kind: 'review', rect: { id, x: 0, y: 0, w: 640, h: 520 }, z: 1,
  subject: { ...SUBJ }, ...over
})

// 53. A review row names its SUBJECT, not itself: "review" alone tells
//     nobody which agent's work it is, on a rail whose entire job is telling
//     panels apart. Its tail is 'review' rather than a status — it has no
//     process, and railTail's status vocabulary ('not started', 'exited 0')
//     would be a lie in every one of its words.
{
  const row = R.buildRailRows([reviewPanel('r1')], () => undefined, NONE)[0]
  ok('53 a review row names its subject and says review',
    row.label === 'review: claude' && row.tail === 'review' && row.dormant === false)
}

// 54. A user's own title still outranks it — the first link of the honest
//     chain, which is not a terminal-only rule.
ok('54 a titled review node uses its title',
  R.buildRailRows([reviewPanel('r1', { title: 'auth diff' })], () => undefined, NONE)[0].label === 'auth diff')

// 55. `dormant: false` is load-bearing rather than incidental: the rail's
//     start control renders on dormant rows only, and a review node that
//     reported dormant would offer a "start" arrow for a panel that has
//     nothing to start — a control that cannot work, on the surface whose
//     rule is that a visible control does something.
ok('55 a review row is never dormant', R.buildRailRows(
  [reviewPanel('r1')], () => undefined, new Set(['r1']))[0].dormant === false)

// 56. The inspector model for a review node: it names the subject, and both
//     process verbs are refused. `restartable: false` is the clause that
//     matters — Restart is rendered disabled rather than absent, and a
//     review node that reported restartable would offer to end a process it
//     does not have, which reaches restartPanel and disposes nothing while
//     looking like it worked.
{
  const m = R.buildInspectorModel(reviewPanel('r1'), undefined)
  ok('56 a review node\'s inspector model refuses the process verbs',
    m.kind === 'review' && m.restartable === false && m.reattached === false &&
      m.fields.some((f) => f.key === 'subject' && f.value === 'n4') &&
      m.fields.some((f) => f.key === 'repo' && f.value === '/tmp/repo'))
}

// 57. `changes` offers the verb, and the paths are EVERY file the result
//     reported — not the rows under NODE_FILE_CAP. The cap is a display
//     bound; deriving the commit from the rendered rows would silently drop
//     every file past the sixtieth from the commit, which is a partial commit
//     that looks complete and is the quietest possible wrong answer for an
//     irreversible write. Sized off NODE_FILE_CAP rather than a literal, so
//     it keeps testing the OVERFLOW if that cap ever moves.
{
  const n = R.NODE_FILE_CAP + 5
  const files = Array.from({ length: n }, (_, i) =>
    ({ path: `f${i}.ts`, added: 1, removed: 0, binary: false, untracked: false }))
  const m = nodeModel({ kind: 'changes', root: '/r', added: n, removed: 0, files })
  ok('57 changes offers commit over EVERY reported file, not the rendered ones',
    m.commit.kind === 'ready' && m.commit.paths.length === n &&
      m.files.length === R.NODE_FILE_CAP && m.commit.label.includes(String(n)),
    `paths=${m.commit.paths.length} rows=${m.files.length} label=${m.commit.label}`)
}

// 58. `shared` BLOCKS it, visibly. A commit here would bundle another agent's
//     work under this node's message, which is exactly the confident wrong
//     answer the shared arm exists to refuse — and hiding the control instead
//     would make "not supported here" indistinguishable from "not built yet",
//     the rule verify:palette 31 states. The reason must NAME the situation:
//     a generic "unavailable" sends the user looking for a bug.
{
  const m = nodeModel({ kind: 'shared', root: '/r', panelCount: 2, files: [
    { path: 'a.ts', added: 1, removed: 0, binary: false, untracked: false }] })
  ok('58 shared blocks the commit with a reason that names the sharing',
    m.commit.kind === 'blocked' && /share/i.test(m.commit.reason) &&
      m.commit.reason.includes('2'), `commit=${JSON.stringify(m.commit)}`)
}

// 59. Every other arm offers nothing, and `clean` is the one worth naming:
//     there is genuinely nothing to commit, so a disabled control there would
//     be a permanent grey button on the state a node spends most of its life
//     in — including, from now on, the state it lands in immediately AFTER a
//     successful commit. The in-flight query is included for the same reason
//     check 48 includes it: it is every selection change and every mount.
{
  const arms = [
    { kind: 'clean', root: '/r' },
    { kind: 'not-a-repo' },
    { kind: 'never-started' },
    { kind: 'git-missing' },
    { kind: 'baseline-lost', root: '/r' },
    { kind: 'repo-unreadable', root: '/r', detail: 'x' }
  ]
  const none = arms.every((r) => nodeModel(r).commit.kind === 'none')
  ok('59 every non-changes arm offers no commit, an in-flight query included',
    none && nodeModel(undefined).commit.kind === 'none')
}

// discard.1 (M53). The model's discard mirrors its commit: ready over EVERY
//     reported path on `changes`, blocked with a reason that NAMES the
//     sharing on `shared`, and none on the arms with nothing to restore. The
//     control is disabled with the reason, never removed — verify:palette
//     31's rule, the same as check 58 above.
{
  const files = Array.from({ length: R.NODE_FILE_CAP + 3 }, (_, i) =>
    ({ path: `f${i}.ts`, added: 1, removed: 0, binary: false, untracked: i % 2 === 0 }))
  const ready = nodeModel({ kind: 'changes', root: '/r', files })
  const shared = nodeModel({ kind: 'shared', root: '/r', panelCount: 3, files: files.slice(0, 1) })
  const lost = nodeModel({ kind: 'baseline-lost', root: '/r' })
  ok('discard.1 discard is ready over every reported path, blocked by name on shared, none on baseline-lost',
    ready.discard !== undefined && ready.discard.kind === 'ready' && ready.discard.paths.length === files.length &&
      shared.discard !== undefined && shared.discard.kind === 'blocked' && /share/i.test(shared.discard.reason) && shared.discard.reason.includes('3') &&
      lost.discard !== undefined && lost.discard.kind === 'none',
    JSON.stringify({ ready: ready.discard, shared: shared.discard, lost: lost.discard }))
}

// 60. A RENAME contributes BOTH paths to the commit and ONE row to the list,
//     and the two halves have to be asserted together or the check is about
//     the wrong thing. `git diff --numstat` does rename detection by default,
//     so `git mv old new` is ONE entry carrying `path: new` and
//     `renamedFrom: old`. A commit set built from `path` alone stages the
//     addition and never stages the deletion — read-tree seeded the scratch
//     index from HEAD, so HEAD's own `old` survives into the new tree and the
//     commit RESURRECTS a file the agent deleted, while the node says "1 file
//     changed". Nothing is lost (the resurrected blob is HEAD's own) and the
//     next review self-corrects, but it is content the user did not intend on
//     this app's one irreversible write. The DISPLAY half is check 57's rule
//     from the other side: the commit set and the rendered list are two
//     different questions, and widening one must not widen the other — a row
//     per old path would report "2 files changed" for one `git mv`.
{
  const m = nodeModel({ kind: 'changes', root: '/r', added: 1, removed: 1, files: [
    { path: 'new name.ts', added: 1, removed: 1, binary: false, untracked: false,
      renamedFrom: 'old name.ts' },
    { path: 'plain.ts', added: 2, removed: 0, binary: false, untracked: false }
  ] })
  const paths = m.commit.kind === 'ready' ? m.commit.paths : []
  ok('60 a rename commits both of its paths and still renders one row',
    m.commit.kind === 'ready' &&
      paths.includes('new name.ts') && paths.includes('old name.ts') &&
      paths.includes('plain.ts') && paths.length === 3 &&
      m.files.length === 2 && m.files.every((f) => f.path !== 'old name.ts'),
    `paths=${JSON.stringify(paths)} rows=${m.files.map((f) => f.path).join(',')}`)
}

// 61. BOTH, never one merged field. The spawn-time cwd and the live one are
// separate rows, which is this pane's stated reason to exist applied to a
// second pair: "why is this not where I started it" is answerable only when the
// user can see both halves. A merged implementation renders something entirely
// plausible and deletes the feature — and it passes any check that only asserts
// the live value is on screen, which is why this asserts the SPAWN row is still
// there too.
{
  const panel = { rect: { id: 'p1', x: 0, y: 0, w: 100, h: 100, z: 1 },
    spec: { panelId: 'p1', cwd: '/home/me', cols: 80, rows: 24 } }
  const status = { kind: 'running', pid: 42, command: '/bin/zsh', cwd: '/home/me',
    reattached: false }
  const model = R.buildInspectorModel(panel, status, { cwd: '/repo/x', currentCommand: 'claude' })
  const at = (k) => model.fields.find((f) => f.key === k)
  ok('61 the inspector shows the live cwd BESIDE the spawn one, not instead of it',
    at('cwd') !== undefined && at('cwd').value === '/home/me' &&
      at('live-cwd') !== undefined && at('live-cwd').value === '/repo/x' &&
      at('live-command') !== undefined && at('live-command').value === 'claude',
    JSON.stringify(model.fields))
}

// 62. NO LIVE ANSWER, NO ROW — and read this check's limit before trusting it.
// It asserts an ABSENCE, so it is GREEN before the feature exists and it can
// never be watched failing; it is a regression guard, and 61 and 63 are what
// carry the milestone. What it guards is real: the direct backend has no live
// answer and never will, and a panel on the tmux backend has none until the
// first tick lands, so this is the ordinary state rather than an error.
// Backfilling the spawn cwd under a live label is indistinguishable from a
// correct answer, which is worse than an absent row — while a CONSUMER, which
// needs a directory rather than making a claim, falls back happily. The two
// rules disagree on purpose.
{
  const panel = { rect: { id: 'p1', x: 0, y: 0, w: 100, h: 100, z: 1 },
    spec: { panelId: 'p1', cwd: '/home/me', cols: 80, rows: 24 } }
  const status = { kind: 'running', pid: 42, command: '/bin/zsh', cwd: '/home/me',
    reattached: false }
  const model = R.buildInspectorModel(panel, status, undefined)
  const keys = model.fields.map((f) => f.key)
  ok('62 with no live answer there is no live row, and no backfill',
    !keys.includes('live-cwd') && !keys.includes('live-command') &&
      keys.includes('cwd'),
    JSON.stringify(keys))
}

// 63. THE SIGNATURE MOVES. inspectorSignature is what Canvas freezes the pane
// on, so a live value not covered by it renders once and then never updates
// again — a cwd frozen at whatever it was when the panel was selected, with
// nothing throwing. Both halves are asserted separately, because an
// implementation that folded in only the cwd passes a cwd-only check.
{
  const panel = { rect: { id: 'p1', x: 0, y: 0, w: 100, h: 100, z: 1 },
    spec: { panelId: 'p1', cwd: '/home/me', cols: 80, rows: 24 } }
  const status = { kind: 'running', pid: 42, command: '/bin/zsh', cwd: '/home/me',
    reattached: false }
  const sig = (live) => R.inspectorSignature(R.buildInspectorModel(panel, status, live))
  const base = sig({ cwd: '/a', currentCommand: 'zsh' })
  const movedCwd = sig({ cwd: '/b', currentCommand: 'zsh' })
  const movedCmd = sig({ cwd: '/a', currentCommand: 'node' })
  ok('63 a live cwd change and a live command change each move the signature',
    base !== movedCwd && base !== movedCmd && movedCwd !== movedCmd,
    `${base} | ${movedCwd} | ${movedCmd}`)
}

// 64. THE LIVE ROWS OUTLIVE THE PROCESS if the push is gated on `live !==
// undefined` alone. Nothing clears the live store when a session exits — every
// clearLiveSession call site in Canvas.tsx is a DISPOSE, not an exit — so a
// panel whose shell ran `exit` keeps its last-known live answer sitting in the
// map forever, and buildInspectorModel would go on rendering "running: sh"
// two rows above "exit: exited 0" for the rest of that panel's life. That is
// the milestone's own thesis (a present-tense label showing a stale value is
// worse than none) failing through the one path nobody looked at. The fix is
// isRunning, this file's own shared predicate for "is this panel a live
// process" — not a second, narrower copy of that judgment written inline here.
// Uses the top-of-file `panel()`/`running()` helpers rather than hand-rolled
// literals, because a literal built with `z` nested inside `rect` (as checks
// 61-63 above do) is the WRONG shape for a real Panel, which keeps `z`
// top-level, and that mistake should not spread to a fourth check.
{
  const p = panel('p1', { spec: { cwd: '/home/me', args: [] } })
  const liveAnswer = { cwd: '/repo/x', currentCommand: 'claude' }
  const exited = { kind: 'exited', code: 0 }
  const model = R.buildInspectorModel(p, exited, liveAnswer)
  const keys = model.fields.map((f) => f.key)
  ok('64 an exited panel renders no live row even with a live answer still cached, while its spawn cwd stays',
    !keys.includes('live-cwd') && !keys.includes('live-command') &&
      keys.includes('cwd') && keys.includes('exit'),
    JSON.stringify(keys))
}

// ---- M11: the nav grid's pure cell arithmetic (65-70) ----
// nav-grid.ts joins THIS suite rather than getting one of its own, the
// precedent inspector-fields.ts, rail-sections.ts and review-node-model.ts
// all set: a suite for one pure file re-proves the same esbuild wiring.
const gridWs = (id, name, panelIds = [], active = false) => ({ id, name, panelIds, active })

// 65. Position is STABLE as the list grows. This is success criterion 2, and
//     it is the whole argument for a hold-to-reveal gesture over Cmd+K: if a
//     workspace moves cell when a neighbour is added, there is no muscle
//     memory to build and the feature is a worse palette.
{
  const two = R.buildGrid([gridWs('w1', 'Main'), gridWs('w2', 'auth')], [])
  const five = R.buildGrid(
    [gridWs('w1', 'Main'), gridWs('w2', 'auth'), gridWs('w3', 'c'), gridWs('w4', 'd'), gridWs('w5', 'e')], [])
  ok(65, two[1].kind === 'workspace' && two[1].workspaceId === 'w2'
      && five[1].kind === 'workspace' && five[1].workspaceId === 'w2',
    `w2 at cell 1 in both: ${two[1].workspaceId} / ${five[1].workspaceId}`)
}

// 66. Cell 8 is ALWAYS `more`, even when there is nothing to overflow into.
//     A cell that appears only sometimes has no stable position, and this is
//     the one escape hatch to a 9th+ workspace: verify:palette 31's rule, that
//     a row which disappears is indistinguishable from a missing feature.
{
  const small = R.buildGrid([gridWs('w1', 'Main')], [])
  const many = R.buildGrid(Array.from({ length: 12 }, (_, i) => gridWs('w' + i, 'n' + i)), [])
  ok(66, small.length === 9 && many.length === 9
      && small[8].kind === 'more' && many[8].kind === 'more',
    `${small[8].kind} / ${many[8].kind}`)
}

// 67. Unused cells are `empty`, and a 9th workspace does NOT take cell 8.
{
  const nine = R.buildGrid(Array.from({ length: 9 }, (_, i) => gridWs('w' + i, 'n' + i)), [])
  const one = R.buildGrid([gridWs('w1', 'Main')], [])
  ok(67, nine[7].kind === 'workspace' && nine[8].kind === 'more'
      && one[1].kind === 'empty' && one[7].kind === 'empty',
    `cell7=${nine[7].kind} cell8=${nine[8].kind} empty=${one[1].kind}`)
}

// 68. stepCell SKIPS empty cells and REFUSES TO WRAP at each of the four
//     edges. Both halves in one check because each alone passes against a
//     different wrong implementation: a wrapping stepper still skips empties,
//     and a non-wrapping one that lands on an empty cell is a dead key —
//     stepRunnable's rule for the palette's disabled rows.
{
  const cells = R.buildGrid([gridWs('a', 'A'), gridWs('b', 'B')], []) // 0,1 filled; 2-7 empty; 8 more
  const rightOffEdge = R.stepCell(cells, 2, 1, 0)   // index 2 is top-right
  const leftOffEdge = R.stepCell(cells, 0, -1, 0)
  const upOffEdge = R.stepCell(cells, 1, 0, -1)
  const downOffEdge = R.stepCell(cells, 8, 0, 1)
  const skipped = R.stepCell(cells, 1, 1, 0)        // cell 2 is empty
  ok(68, rightOffEdge === 2 && leftOffEdge === 0 && upOffEdge === 1 && downOffEdge === 8
      && skipped === 1,
    `edges ${rightOffEdge}/${leftOffEdge}/${upOffEdge}/${downOffEdge} skip=${skipped}`)
}

// 69. The cursor seeds on the ACTIVE workspace's own cell, so a release with
//     no arrow pressed is a no-op. The gesture has to be abandonable by doing
//     nothing, which is how Cmd+Tab behaves and what makes it safe to summon
//     speculatively.
{
  const cells = R.buildGrid([gridWs('w1', 'A'), gridWs('w2', 'B', [], true), gridWs('w3', 'C')], [])
  ok(69, R.initialCursor(cells) === 1, `seeded ${R.initialCursor(cells)}`)
}

// 70. ...and seeds on cell 8 (`more`) when the ACTIVE workspace is past cell 7
//     and therefore has no cell of its own. This is the case no fixture
//     reaches by accident — it needs nine workspaces to exist at all — and
//     seeding cell 0 there makes a no-arrow release jump to a DIFFERENT
//     workspace, which is exactly the accident check 65 exists to prevent.
{
  const rows = Array.from({ length: 10 }, (_, i) => gridWs('w' + i, 'n' + i, [], i === 9))
  ok(70, R.initialCursor(R.buildGrid(rows, [])) === 8,
    `seeded ${R.initialCursor(R.buildGrid(rows, []))}`)
}

// 70b. A cell's waiting number comes from rail-sections' waitingCount, and is
//      a NUMBER on the cell rather than composed text — the rule Command.waiting
//      and RailRow.waiting already obey. Intersection, never a global count.
{
  const cells = R.buildGrid(
    [gridWs('w1', 'Main', ['n1', 'n2']), gridWs('w2', 'auth', ['n3'])], ['n1', 'n9'])
  ok('70b', cells[0].kind === 'workspace' && cells[0].waiting === 1
      && cells[1].kind === 'workspace' && cells[1].waiting === 0,
    `${cells[0].waiting} / ${cells[1].waiting}`)
}

// 71. A ZERO VECTOR on an empty cell returns the index unchanged rather than
//     hanging. Asserted directly as a return value, on purpose, rather than
//     by letting the suite time out: `dx===0 && dy===0` never changes
//     col/row, so an unguarded loop re-checks the SAME empty cell forever —
//     the idiomatic no-op default for an unrecognised key in Task 2's
//     keyboard wiring reaches this immediately. A hang here is a frozen
//     renderer, not a thrown error, so this suite would never print a
//     failure for it on its own; the check exists so a regression shows up
//     as a red assertion instead of a suite that never finishes.
{
  const cells = R.buildGrid([gridWs('a', 'A'), gridWs('b', 'B')], []) // cell 2 is empty
  ok(71, R.stepCell(cells, 2, 0, 0) === 2, `stepCell(2,0,0)=${R.stepCell(cells, 2, 0, 0)}`)
}

// ---------------------------------------------------------------------------
// M13 (link rows). The inspector's link rows. `link`, never `edge` — see
// panels.ts. Two unrelated feature branches both used the milestone number
// M13 for different work; this is the link-rows one, renumbered at nothing
// (it kept 72-75, the checks below were renumbered around it instead).

// 72. Both directions, and they are DISTINGUISHED. A pane that listed only
//     outgoing links answers "what does this feed" and leaves "what feeds
//     this" unanswerable from the panel that is selected — the user would have
//     to select every other panel in turn to find out. The direction is a
//     FIELD rather than baked into the row's text, so the view composes the
//     arrow: the rule Command.waiting and RailRow.waiting already keep.
{
  const panels = [
    panel('a', { links: [{ to: 'b' }] }),
    panel('b'),
    panel('c', { links: [{ to: 'a', label: 'feeds' }] })
  ]
  const rows = R.buildLinkRows(panels[0], panels)
  ok('72 buildLinkRows reports both directions and keeps them apart',
    rows.length === 2 &&
    rows.filter((r) => r.direction === 'out').length === 1 &&
    rows.filter((r) => r.direction === 'in').length === 1 &&
    rows.find((r) => r.direction === 'out').to === 'b' &&
    rows.find((r) => r.direction === 'in').to === 'c' &&
    rows.find((r) => r.direction === 'in').label === 'feeds',
    JSON.stringify(rows))
}

// 73. A row NAMES the other panel by the honest chain, never by its bare id:
//     `n7` tells the user nothing. This is a fourth READER of that chain (the
//     panel header, railLabel and the attention section are the others), so
//     the fixture is a TITLED panel — the only fixture that can tell a
//     re-derivation from spec.command apart from a real read, because the
//     wrong implementation says `/bin/zsh` here while the Panels row three
//     lines up says `auth refactor`. rail-sections.ts 35's argument, at a
//     second surface.
{
  const panels = [
    panel('a', { links: [{ to: 'b' }], spec: { cwd: '~', command: '/bin/zsh', args: [] } }),
    panel('b', { title: 'auth refactor', spec: { cwd: '~', command: '/bin/zsh', args: [] } })
  ]
  const rows = R.buildLinkRows(panels[0], panels)
  ok('73 a link row names the other panel by its title, not its id',
    rows.length === 1 && rows[0].title === 'auth refactor',
    JSON.stringify(rows))
}

// 74. A link whose other end is not on this canvas contributes NO row —
//     buildLinkSegments' prune, at the pane. It is reachable the same two
//     ways: a hand-edited file, and a link naming a panel in ANOTHER
//     workspace, since PanelId is global. A row for a panel the user cannot
//     select is a dead entry whose remove control is the only part that works,
//     and it reads as a bug in the pane rather than in the file.
{
  const panels = [panel('a', { links: [{ to: 'ghost' }, { to: 'b' }] }), panel('b')]
  const rows = R.buildLinkRows(panels[0], panels)
  ok('74 a link whose other end is not on this canvas renders no row',
    rows.length === 1 && rows[0].to === 'b',
    JSON.stringify(rows))
}

// 75. THE ONE WORTH KNOWING BY NUMBER, and the check that stops the pane
//     freezing. Canvas freezes the inspector model on inspectorSignature, so a
//     value the signature does not cover renders once and then never updates
//     again — stuck at whatever it was when the panel was selected, with
//     nothing throwing. Adding, removing AND relabelling are asserted as three
//     separate movers, because an implementation that hashed only the link
//     COUNT passes the first two and freezes on the third.
//
//     The first clause is the non-vacuity guard, and it is not decoration: the
//     fourth parameter is OPTIONAL (every pre-M13 caller and every pre-M13
//     check must keep its exact meaning — the trade `live` already made in M12
//     and review-engine.ts's `notARepo` made in M9a), so a model built without
//     it must carry an EMPTY array rather than undefined. Without that clause
//     every comparison below could be undefined-vs-undefined and would pass
//     against a model that has no links field at all.
{
  const sig = (panels) =>
    R.inspectorSignature(R.buildInspectorModel(panels[0], undefined, undefined, panels))
  const noArg = R.buildInspectorModel(panel('a'), undefined)
  const none = sig([panel('a'), panel('b')])
  const one = sig([panel('a', { links: [{ to: 'b' }] }), panel('b')])
  const labelled = sig([panel('a', { links: [{ to: 'b', label: 'feeds' }] }), panel('b')])
  const automated = sig([panel('a', { links: [{ to: 'b', automation: { kind: 'restart-on-exit', enabled: true } }] }), panel('b')])
  ok('75 inspectorSignature moves on a link added, removed and relabelled',
    Array.isArray(noArg.links) && noArg.links.length === 0 &&
    none !== one && one !== labelled && none !== labelled && automated !== one,
    `noArg=${JSON.stringify(noArg.links)} distinct=${new Set([none, one, labelled, automated]).size}`)
}

// M41 — handoff.1. The link row carries the handoff state as a NAMED value
//      ('off' | 'exit' | 'idle'), the automation list's sentence names the
//      trigger AND the bound (the rule states its own limit where it is
//      made), and the control's title states the NEXT state — a three-state
//      cycle button whose label only said the current state would leave the
//      user guessing what a press does.
{
  const desc = typeof R.describeAutomation === 'function' ? R.describeAutomation : null
  const ctl = typeof R.handoffControl === 'function' ? R.handoffControl : null
  const m = (links) => R.buildInspectorModel(panel('a', { links }), undefined, undefined, [panel('a', { links }), panel('b')])
  const exitRow = m([{ to: 'b', automation: { kind: 'handoff', enabled: true, trigger: 'exit' } }]).links[0]
  const idleRow = m([{ to: 'b', automation: { kind: 'handoff', enabled: true, trigger: 'idle' } }]).links[0]
  const offRow = m([{ to: 'b', automation: { kind: 'handoff', enabled: false, trigger: 'idle' } }]).links[0]
  const bareRow = m([{ to: 'b' }]).links[0]
  const restartRow = m([{ to: 'b', automation: { kind: 'restart-on-exit', enabled: true } }]).links[0]
  const sExit = desc ? desc({ kind: 'handoff', enabled: true, trigger: 'exit' }) : null
  const sIdle = desc ? desc({ kind: 'handoff', enabled: true, trigger: 'idle' }) : null
  const sRestart = desc ? desc({ kind: 'restart-on-exit', enabled: true }) : null
  const cExit = ctl ? ctl('exit') : null
  const cOff = ctl ? ctl('off') : null
  const cIdle = ctl ? ctl('idle') : null
  ok('handoff.1 link rows name the handoff state, the sentence names trigger and bound, the control names the next state',
    desc !== null && ctl !== null &&
      exitRow.handoff === 'exit' && idleRow.handoff === 'idle' && offRow.handoff === 'off' && bareRow.handoff === 'off' && restartRow.handoff === 'off' &&
      /handoff on exit · last 200 lines, 16 KiB max/.test(sExit) && /handoff after a turn · last 200 lines, 16 KiB max/.test(sIdle) && /restart/.test(sRestart) &&
      cExit.label === 'handoff: exit' && /idle/.test(cExit.title) && /exit/.test(cOff.title) && /off/.test(cIdle.title),
    JSON.stringify({ exitRow, sExit, sIdle, sRestart, cExit, cOff, cIdle }))
}

// M16: the file node's view model, and the rail/inspector arms it feeds.
// Renumbered from M13's original 72-76: main landed a DIFFERENT M13 while
// this branch was in flight ("links between panels", backlog #24), which
// independently claimed 72-75 in this same file. See the milestone-wide
// renumbering commit for the full story.
const src = { path: '/Users/x/notes/todo.md' }
// 76 — the ordinary case: a heading that is the BASENAME, the directory as its
// own field, and the lines numbered from 1.
{
  const m = R.buildFileNodeModel({ source: src, title: undefined,
    result: { kind: 'text', content: 'a\nb', bytes: 3, lines: 2, truncatedLines: 0, mtimeMs: 0 } })
  ok(76, m.heading === 'todo.md' && m.directory === '/Users/x/notes'
      && m.lines.length === 2 && m.lines[0].n === 1 && m.lines[0].text === 'a'
      && m.truncatedNote === undefined,
    `76 — a text file renders numbered lines under its basename: ${m.heading} / ${m.directory}`)
}
// 77 — the user's own title outranks the basename, the honest chain's first
// link, for BOTH other kinds already and now for a third.
{
  const m = R.buildFileNodeModel({ source: src, title: 'the plan',
    result: { kind: 'text', content: 'a', bytes: 1, lines: 1, truncatedLines: 0, mtimeMs: 0 } })
  ok(77, m.heading === 'the plan', `77 — a titled file panel uses its own title: ${m.heading}`)
}
// 78 — THE CHECK THIS MODEL EXISTS FOR, and the one that separates it from
// 'just call buildReviewFields': every non-text arm renders a NOTE and a
// heading, never nothing. The inspector pane may hide itself when it has
// nothing to say; a panel the user deliberately opened and dragged must not,
// because a panel rendering nothing at all is indistinguishable from a broken
// one and the user has no way to ask why.
{
  const arms = [
    { kind: 'missing' },
    { kind: 'too-large', bytes: 9e9, cap: 2097152 },
    { kind: 'binary', bytes: 40 },
    { kind: 'unreadable', detail: 'EACCES' }
  ]
  const models = arms.map((result) => R.buildFileNodeModel({ source: src, title: undefined, result }))
  const allNoted = models.every((m) => typeof m.note === 'string' && m.note.length > 0
    && m.heading === 'todo.md' && m.lines.length === 0)
  // And they must be four DIFFERENT sentences: 'this file is gone' and 'this
  // file is binary' are two situations with two different fixes, and
  // collapsing them tells a user the wrong one.
  const distinct = new Set(models.map((m) => m.note)).size === 4
  ok(78, allNoted && distinct,
    `78 — every non-text arm renders a heading and its OWN note: noted=${allNoted} distinct=${distinct}`)
}
// 79 — truncation is reported, and it reports the NUMBER it was given rather
// than recomputing one from the rendered lines. A model that recomputed would
// always say 0, because the content it was handed is already truncated.
{
  const m = R.buildFileNodeModel({ source: src, title: undefined,
    result: { kind: 'text', content: 'a\nb', bytes: 99, lines: 27, truncatedLines: 25, mtimeMs: 0 } })
  ok(79, m.lines.length === 2 && typeof m.truncatedNote === 'string' && m.truncatedNote.includes('25'),
    `79 — the truncated remainder is reported: ${JSON.stringify(m.truncatedNote)}`)
}
// 80 — the rail and inspector arms. A file row is NEVER dormant (a start arrow
// on it is a promise nothing can keep), its tail says 'file', and the
// inspector refuses the process verbs.
{
  const panel = { kind: 'file', rect: { id: 'f1', x: 0, y: 0, w: 640, h: 520 }, z: 1, source: src }
  const rows = R.buildRailRows([panel], () => undefined, new Set(['f1']))
  const im = R.buildInspectorModel(panel, undefined)
  ok(80, rows[0].label === 'todo.md' && rows[0].tail === 'file' && rows[0].dormant === false
      && im.kind === 'file' && im.restartable === false,
    `80 — the rail and inspector arms: label=${rows[0].label} tail=${rows[0].tail} dormant=${rows[0].dormant} restartable=${im.restartable}`)
}

// 81. THREE states, not two, and the pane must not collapse them. No pin
//     renders NOTHING (a login shell can never have a cost, and "$0.00"
//     beside it is a confident wrong answer); pinned-but-nothing-yet renders
//     a NOTE (true for the first seconds of every panel, and an empty section
//     there reads as broken); totals render figures. This is M9a's
//     not-a-repo / never-started distinction, in a second section.
{
  const none = R.buildUsageFields(undefined, false)
  const waiting = R.buildUsageFields(undefined, true)
  const totals = R.buildUsageFields(
    { totals: { input: 2, output: 1095, cacheWrite: 1491, cacheRead: 120118 },
      byModel: { 'claude-opus-5': { input: 2, output: 1095, cacheWrite: 1491, cacheRead: 120118 } },
      turns: 3, subagentTurns: 1 }, true)
  ok(81, none.hidden === true
      && waiting.hidden === false && waiting.note !== undefined && waiting.rows.length === 0
      && totals.hidden === false && totals.note === undefined && totals.rows.length > 0,
    `none=${none.hidden} waiting=${waiting.note} totals=${totals.rows.length}`)
}

// 82. The four classes render as FOUR figures, not one sum. The pane's whole
//     job here is to let the user see what the number is made of — "the
//     inspector shows the links, not the answer" applied to a third pair —
//     and a single "121,613 tokens" row is unanswerable when the user asks
//     why it is so large.
{
  const m = R.buildUsageFields(
    { totals: { input: 2, output: 1095, cacheWrite: 1491, cacheRead: 120118 },
      byModel: { 'claude-opus-5': { input: 2, output: 1095, cacheWrite: 1491, cacheRead: 120118 } },
      turns: 1, subagentTurns: 0 }, true)
  const labels = m.rows.map((r) => r.label).join('|')
  ok(82, ['input', 'output', 'cache write', 'cache read'].every((l) => labels.includes(l)),
    labels)
}

// 83. The dollar figure is LABELLED and never bare. A Max or Pro subscriber
//     is charged nothing per token, so an unlabelled figure states as fact a
//     number that is wrong for a large share of the people reading it.
{
  const m = R.buildUsageFields(
    { totals: { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 },
      byModel: { 'claude-opus-5': { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 } },
      turns: 1, subagentTurns: 0 }, true)
  ok(83, typeof m.cost === 'number' && /list price/i.test(m.costLabel ?? ''),
    `${m.cost} / ${m.costLabel}`)
}

// 84. An UNPRICED model yields tokens and NO dollar figure — check 11's rule
//     reaching the pane. A zero here renders "$0.00" beside a visibly working
//     agent, which is the one thing this section must never say.
{
  const m = R.buildUsageFields(
    { totals: { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 },
      byModel: { 'model-from-next-year': { input: 1000, output: 1000, cacheWrite: 0, cacheRead: 0 } },
      turns: 1, subagentTurns: 0 }, true)
  ok(84, m.cost === undefined && m.rows.length > 0, `cost=${m.cost} rows=${m.rows.length}`)
}

// 85. Subagent turns are reported SEPARATELY. They are in the same transcript
//     and they spend real money, so they count — but a panel that is large
//     because it dispatched twelve subagents is a different situation from
//     one the user talked to for an hour, and the pane has to say which.
{
  const m = R.buildUsageFields(
    { totals: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 },
      byModel: { 'claude-opus-5': { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 } },
      turns: 5, subagentTurns: 2 }, true)
  ok(85, m.turns === 5 && m.subagentTurns === 2, `${m.turns}/${m.subagentTurns}`)
}

// 86. inspectorSignature MOVES on a usage change and stays byte-identical on
//     a rect change. THE check for this milestone's 60Hz defence: Canvas
//     freezes the model on that signature, so a live value it does not cover
//     renders once and never updates again — stuck at whatever it was when
//     the panel was selected, with nothing throwing. M12's check 63 exactly,
//     and usage is the newest field and so the easiest to leave uncovered.
{
  // pinned (panel.spec.agent !== undefined) must be true for usage to reach
  // the model at all — see buildUsageFields' own doc comment — so this
  // fixture declares an agent, unlike the bare panel() default every other
  // check in this file uses.
  const p = panel('n1', { spec: { cwd: '~', args: [], agent: 'claude-code' } })
  const u1 = { totals: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0 },
               byModel: {}, turns: 1, subagentTurns: 0 }
  const u2 = { totals: { input: 2, output: 2, cacheWrite: 0, cacheRead: 0 },
               byModel: {}, turns: 2, subagentTurns: 0 }
  const a = R.inspectorSignature(R.buildInspectorModel(p, undefined, undefined, [], u1))
  const b = R.inspectorSignature(R.buildInspectorModel(p, undefined, undefined, [], u2))
  const moved = R.inspectorSignature(R.buildInspectorModel(
    { ...p, rect: { ...p.rect, x: 999 } }, undefined, undefined, [], u1))
  ok(86, a !== b && a === moved, `usageMoved=${a !== b} rectStable=${a === moved}`)
// M20 checks 87-93: file-tree-model.ts, joining this suite for the reason
// inspector-fields.ts, rail-sections.ts, review-node-model.ts and nav-grid.ts
// all did — pure, type-only imports, and a suite of its own would re-prove
// this esbuild wiring for one file.
//
// Numbered M13 throughout design and implementation; renumbered to M20 on
// merge into main — a different, unrelated milestone ("links between
// panels", still M13, above) had already claimed both the M13 label and this
// suite's own check numbers 72-86 (some of it using bare-number ok(N, ...)
// calls rather than quoted-string labels, so an earlier survey of this range
// that only matched ok('N missed them) by the time this branch tried to
// merge. 87 is the first number past that branch's real maximum.
{
  const ROOT = '/tmp/tc root'
  const okDir = (names) => ({
    kind: 'ok',
    truncated: 0,
    entries: names.map((n) => ({ name: n, kind: n.endsWith('/') ? 'dir' : 'file' }))
      .map((e) => ({ name: e.name.replace(/\/$/, ''), kind: e.kind }))
  })

  // 87. Nothing expanded is the root's own children at depth 0, in the order
  // the DirResult gave them — the model never re-sorts, because main already
  // did and two sorts is two places to disagree.
  {
    const dirs = new Map([[ROOT, okDir(['src/', 'README.md'])]])
    const rows = R.buildFileRows(ROOT, dirs, new Set())
    ok('87 nothing expanded yields the root\'s children at depth 0',
      rows.length === 2 &&
      rows[0].name === 'src' && rows[0].depth === 0 && rows[0].kind === 'dir' &&
      rows[1].name === 'README.md' && rows[1].depth === 0,
      rows.map((r) => `${r.name}@${r.depth}`).join(','))
  }

  // 88. Children splice BENEATH their parent at depth+1 and the later sibling
  // is undisturbed. The sibling clause is the half with teeth: an
  // implementation that appended children rather than splicing them passes any
  // check that only counts rows, and renders a tree whose contents are in the
  // right set and the wrong place.
  {
    const dirs = new Map([
      [ROOT, okDir(['src/', 'zz.md'])],
      [`${ROOT}/src`, okDir(['main.ts'])]
    ])
    const rows = R.buildFileRows(ROOT, dirs, new Set([`${ROOT}/src`]))
    ok('88 children splice beneath their parent without moving a later sibling',
      rows.length === 3 &&
      rows[0].name === 'src' && rows[0].state === 'expanded' &&
      rows[1].name === 'main.ts' && rows[1].depth === 1 &&
      rows[2].name === 'zz.md' && rows[2].depth === 0,
      rows.map((r) => `${r.name}@${r.depth}`).join(','))
  }

  // 89. Collapse removes descendants TRANSITIVELY. A one-level implementation
  // leaves the grandchildren behind at depth 2 under a parent that is no
  // longer rendered, and they read as top-level entries with suspicious
  // indentation rather than as an error.
  {
    const dirs = new Map([
      [ROOT, okDir(['a/'])],
      [`${ROOT}/a`, okDir(['b/'])],
      [`${ROOT}/a/b`, okDir(['deep.txt'])]
    ])
    const both = new Set([`${ROOT}/a`, `${ROOT}/a/b`])
    const open = R.buildFileRows(ROOT, dirs, both)
    both.delete(`${ROOT}/a`)
    const shut = R.buildFileRows(ROOT, dirs, both)
    ok('89 collapsing a parent removes its descendants transitively',
      open.length === 3 &&
      shut.length === 1 && shut[0].name === 'a' && shut[0].state === 'collapsed',
      `open=${open.length} shut=${shut.map((r) => r.name).join(',')}`)
  }

  // 90. An expanded directory with no answer YET renders a loading row, and a
  // failed one renders a note. Both are first-class states for the reason the
  // review pane's in-flight arm is: a section that renders nothing while it
  // waits reads as broken on every selection change, and an unreadable
  // directory that renders nothing is indistinguishable from an empty one.
  {
    const dirs = new Map([
      [ROOT, okDir(['pending/', 'denied/'])],
      [`${ROOT}/denied`, { kind: 'unreadable', detail: 'EACCES: permission denied' }]
    ])
    const rows = R.buildFileRows(ROOT, dirs, new Set([`${ROOT}/pending`, `${ROOT}/denied`]))
    const loading = rows.find((r) => r.state === 'loading')
    const note = rows.find((r) => r.state === 'note')
    ok('90 an unanswered directory loads and a failed one renders a note',
      loading !== undefined && loading.depth === 1 &&
      note !== undefined && note.depth === 1 &&
      typeof note.note === 'string' && note.note.length > 0,
      `loading=${loading ? loading.depth : 'absent'} note=${note ? note.note : 'absent'}`)
  }

  // 91. THE ONE WORTH KNOWING BY NUMBER. treeSignature moves on an expand —
  // without which Canvas freezes the rows and the tree never opens — and a
  // FILENAME cannot forge a field boundary.
  //
  // railSignature already records this for a user TITLE. A filename is a wider
  // door: the user does not have to type it, an agent writes it, into a
  // directory this app does not own, and the tree lists whatever is there. The
  // fixture therefore builds two DIFFERENT trees whose rows differ only in
  // where a separator falls, and asserts their signatures differ — which a
  // JSON.stringify satisfies and any join(sep) does not.
  {
    const dirs = new Map([[ROOT, okDir(['a/'])], [`${ROOT}/a`, okDir(['x.txt'])]])
    const shut = R.treeSignature(R.buildFileRows(ROOT, dirs, new Set()))
    const open = R.treeSignature(R.buildFileRows(ROOT, dirs, new Set([`${ROOT}/a`])))

    // A genuine MULTI-row collision under the naive scheme
    // `rows.map(r => `${name}|${depth}|${kind}`).join(';')` — a single-row
    // fixture cannot exercise this at all, because one row's name differing
    // from another's produces distinct output under nearly any scheme, safe
    // or not; there is no second row for a join separator to be mistaken for
    // a boundary of. Constructed as FileRow arrays directly (bypassing
    // buildFileRows), since this half is testing treeSignature itself, not
    // the flattening.
    //
    // rowsB is two ordinary rows: naive(B) = "a|0|file" + ";" + "b|0|file"
    //                                       = "a|0|file;b|0|file"
    // rowsA is ONE row whose name is itself "a|0|file;b" — a filename an
    // agent can write with nothing more exotic than a semicolon and a pipe —
    // so naive(A) = "a|0|file;b" + "|0|file" = "a|0|file;b|0|file", BYTE FOR
    // BYTE equal to naive(B). Under the naive join these two entirely
    // different trees (one row vs. two) collide into one string and the tree
    // would freeze on stale rows. JSON.stringify must still tell them apart.
    const naiveJoin = (rows) => rows.map((r) => `${r.name}|${r.depth}|${r.kind}`).join(';')
    const rowsA = [{ path: `${ROOT}/a|0|file;b`, name: 'a|0|file;b', depth: 0, kind: 'file', state: 'collapsed' }]
    const rowsB = [
      { path: `${ROOT}/a`, name: 'a', depth: 0, kind: 'file', state: 'collapsed' },
      { path: `${ROOT}/b`, name: 'b', depth: 0, kind: 'file', state: 'collapsed' }
    ]
    const collides = naiveJoin(rowsA) === naiveJoin(rowsB)
    const a = R.treeSignature(rowsA)
    const b = R.treeSignature(rowsB)

    ok('91 the signature moves on an expand and a multi-row filename collision cannot forge a field',
      shut !== open && collides && a !== b,
      `expand=${shut !== open} naiveCollides=${collides} forge=${a !== b}`)
  }

  // 92. relativePath strips the root; a path NOT under the root falls back to
  // absolute. That fallback is not defensive — it is the state a panel that
  // cd'd away between the read and the click produces, and an absolute answer
  // there is the correct one.
  {
    ok('92 relativePath strips the root and falls back to absolute',
      R.relativePath(ROOT, `${ROOT}/src/main.ts`) === 'src/main.ts' &&
      R.relativePath(ROOT, '/elsewhere/x.ts') === '/elsewhere/x.ts' &&
      R.relativePath(ROOT, ROOT) === '.',
      `${R.relativePath(ROOT, `${ROOT}/src/main.ts`)} / ${R.relativePath(ROOT, '/elsewhere/x.ts')}`)
  }

  // 93. Three clauses, separately. A check that only tries the space case
  // passes against a quoter that quotes EVERYTHING, which is a feature that
  // works and is noisy on every ordinary path.
  {
    ok('93 shellQuote leaves a plain path alone, quotes a space, escapes a quote',
      R.shellQuote('src/main.ts') === 'src/main.ts' &&
      R.shellQuote('my docs/a.txt') === "'my docs/a.txt'" &&
      R.shellQuote("it's.txt") === "'it'\\''s.txt'",
      `${R.shellQuote('src/main.ts')} | ${R.shellQuote('my docs/a.txt')} | ${R.shellQuote("it's.txt")}`)
  }
}
}

/* ==================== M21: the Toolbox section and the node ============ */

// A minimal inventory fixture, built by hand rather than through readToolbox:
// this suite's subject is the two VIEW MODELS, and the reader has its own
// real-filesystem fixture in verify:toolbox.
const invEntry = (over) => ({
  id: JSON.stringify(['skill', 'user', '/h/.claude/skills/x/SKILL.md']),
  kind: 'skill', scope: 'user', sourcePath: '/h/.claude/skills/x/SKILL.md',
  active: { kind: 'active' }, alsoDefinedIn: [],
  name: 'graphify', description: 'Build a graph.', descriptionTruncated: false,
  ...over
})
const inventory = (over) => ({
  kind: 'inventory',
  inventory: {
    cwd: '/repo', readAt: 1000, entries: [invEntry()], permissions: [], sources: [],
    pluginsEnabled: [], pluginsDisabledCount: 0,
    unresolved: { skillOverridesOff: [], mcpEnabled: [], mcpDisabled: [] },
    overflow: { skills: 0, commands: 0, agents: 0, mcp: 0, hooks: 0, total: 0 },
    freshness: { kind: 'unknown' },
    ...over
  }
})

// 94 is the check the section's whole hiding policy rests on, and it is M9a's
// not-a-repo/never-started split reaching a FOURTH section. THREE states, and
// collapsing any two is a wrong answer rather than a simplification: a panel
// with no directory renders NOTHING ("0 skills" beside a review node is the
// confident wrong answer that teaches a user to stop believing the section), a
// read that has not answered yet renders a NOTE (true for one IPC round trip
// on every selection, where an empty section reads as broken), and only an
// actual inventory renders rows.
{
  const none = R.buildToolboxFields({ kind: 'no-cwd' })
  const pending = R.buildToolboxFields(undefined)
  const real = R.buildToolboxFields(inventory())
  ok(94,
    none.hidden === true
      && pending.hidden === false && pending.rows.length === 0 && pending.summary !== ''
      && real.hidden === false && real.rows.length === 1,
    `three states: no-cwd hidden, in-flight notes ("${pending.summary}"), inventory renders rows`)
}

// 95 — an UNREADABLE source is named; an ABSENT one says nothing. The same
// distinction verify:toolbox 28 pins in the reader, carried to the one surface
// a user reads: "no skills" because the directory was read and was empty is a
// different sentence from "no skills" because it could not be opened, and only
// one of them means go and look.
{
  const quiet = R.buildToolboxFields(inventory({
    sources: [{ path: '/repo/.claude/skills', scope: 'project', what: 'skills', status: 'absent' }]
  }))
  const loud = R.buildToolboxFields(inventory({
    sources: [{ path: '/repo/.claude/settings.json', scope: 'project', what: 'settings', status: 'unreadable', detail: 'EACCES' }]
  }))
  ok(95, quiet.note === undefined && typeof loud.note === 'string' && loud.note !== '',
    `absent is silent, unreadable is named: ${String(loud.note)}`)
}

// 96 is TOOLBOX_ROW_CAP, asserted on the remainder as a NUMBER rather than on
// rendered "+N more" text — REVIEW_FILE_CAP's own rule, and the reason is that
// a list which silently stops is indistinguishable from a directory with
// nothing in it.
{
  const many = []
  for (let i = 0; i < R.TOOLBOX_ROW_CAP + 4; i += 1) {
    many.push(invEntry({ id: `s${i}`, name: `skill-${i}` }))
  }
  const m = R.buildToolboxFields(inventory({ entries: many }))
  ok(96, m.rows.length === R.TOOLBOX_ROW_CAP && m.more === 4,
    `pane cap ${R.TOOLBOX_ROW_CAP}, remainder counted: ${m.rows.length}+${m.more}`)
}

// 97 is the check the NODE's own model exists for, and the only one that
// separates it from "just call buildToolboxFields" — the identical argument
// review-node-model.ts earns against buildReviewFields. The pane is a strip in
// a 260px column that must VANISH when it has nothing to say; a node is a
// panel the user deliberately opened, placed and dragged, and one that renders
// nothing at all is indistinguishable from a broken one. So `no-cwd` is HIDDEN
// in the pane and RENDERED in the node.
{
  const pane = R.buildToolboxFields({ kind: 'no-cwd' })
  const node = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: undefined, result: { kind: 'no-cwd' }
  })
  ok(97,
    pane.hidden === true
      && node.heading !== '' && node.summary !== '' && typeof node.note === 'string',
    `no-cwd: hidden in the pane, heading AND note in the node ("${String(node.note)}")`)
}

// 98 is the honest chain's first link reaching a FIFTH kind: a user's own
// title outranks the derived label, exactly as it already does for a terminal
// header, a review node and a file panel. The DIRECTORY stays its own field,
// never folded into the heading — the split inspector-fields draws for cwd.
{
  const derived = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: undefined, result: undefined
  })
  const titled = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: 'auth toolbox', result: undefined
  })
  ok(98,
    derived.heading.includes('repo') && titled.heading === 'auth toolbox'
      && derived.directory === '/repo' && titled.directory === '/repo',
    `title outranks the label, directory stays its own field`)
}

// 99 is the projection observed at the last surface before pixels, and that is
// why it exists rather than trusting verify:toolbox 11: that check pins
// projectMcpServer, and this pins that nothing between it and a rendered row
// puts the secret back. An MCP row shows the arg COUNT and the env KEY NAMES;
// a hook row shows the PROGRAM and the real command length. Neither can show
// what it was never handed, which is exactly the point.
{
  const node = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' },
    title: undefined,
    result: inventory({ entries: [
      { id: 'm1', kind: 'mcp', scope: 'user', sourcePath: '/h/.claude.json',
        active: { kind: 'active' }, alsoDefinedIn: [], name: 'railway',
        transport: 'stdio', command: 'npx', argCount: 3,
        envKeys: ['RAILWAY_TOKEN'], envKeysOverflow: 0 },
      { id: 'h1', kind: 'hook', scope: 'user', sourcePath: '/h/.claude/settings.json',
        active: { kind: 'active' }, alsoDefinedIn: [], event: 'PreToolUse',
        matcher: 'Bash', matcherTruncated: false, index: 0, hookType: 'command',
        program: 'node guard.js', commandChars: 92 }
    ] })
  })
  const mcp = node.groups.find((g) => g.kind === 'mcp')
  const hook = node.groups.find((g) => g.kind === 'hook')
  ok(99,
    !!mcp && mcp.rows[0].detail.includes('3 args') && mcp.rows[0].detail.includes('RAILWAY_TOKEN')
      && !!hook && hook.rows[0].detail.includes('node guard.js')
      && hook.rows[0].detail.includes('92 chars') && hook.rows[0].name.includes('PreToolUse'),
    `arg COUNT and env KEY NAME render; hook shows PROGRAM and length`)
}

// 100 — a hook has no name, so its row renders a COORDINATE. Synthesising one
// is the fix that breaks the feature: a fabricated name in a list starts
// matching searches it has no business matching, the rule Command.waiting
// already states for a count.
{
  const node = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: undefined,
    result: inventory({ entries: [
      { id: 'h1', kind: 'hook', scope: 'user', sourcePath: '/s.json',
        active: { kind: 'active' }, alsoDefinedIn: [], event: 'Stop',
        matcher: '', matcherTruncated: false, index: 0, hookType: 'command',
        program: 'echo', commandChars: 9 }
    ] })
  })
  const row = node.groups[0].rows[0]
  ok(100, row.name === 'Stop' && !row.name.includes('#'),
    `a matcherless hook renders its EVENT, never a synthesised name: ${row.name}`)
}

// 101 — every non-active state is MUTED and NAMED rather than dropped. A
// disabled skill the user is hunting for must still be in the list saying why:
// a row that disappears is indistinguishable from one that was never installed
// (verify:palette 31's rule), and "why can this agent not do X" is the question
// the whole feature exists to answer.
{
  const node = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: undefined,
    result: inventory({ entries: [
      invEntry({ id: 'a', name: 'on' }),
      invEntry({ id: 'b', name: 'off', active: { kind: 'disabled', by: '/s.json' } }),
      invEntry({ id: 'c', name: 'wait', active: { kind: 'needs-approval' } }),
      invEntry({ id: 'd', name: 'huh', active: { kind: 'unknown', why: 'plugin-owned' } })
    ] })
  })
  const rows = node.groups[0].rows
  ok(101,
    rows.length === 4
      && rows[0].muted === false && rows[0].state === ''
      && rows[1].muted === true && rows[1].state === 'disabled'
      && rows[2].muted === true && rows[2].state === 'needs approval'
      && rows[3].muted === true && rows[3].state.includes('plugin-owned'),
    `four active states, four distinct labels, none dropped`)
}

// 102 is the freshness arm, and its WORDING is what this pins: a fact about
// FILES, never a claim about the running agent. An mtime bump with no semantic
// change would otherwise read as "your agent is missing X", the confident
// wrong answer this milestone's honesty rule forbids. `unknown` is NOT stale —
// it is what a panel that never spawned answers, and what a reattach after a
// full relaunch answers, both ordinary.
{
  const fresh = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: undefined,
    result: inventory({ freshness: { kind: 'fresh' } })
  })
  const stale = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: undefined,
    result: inventory({ freshness: { kind: 'stale', changedPaths: ['/repo/.claude/settings.json'], since: 1 } })
  })
  const unknown = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: undefined,
    result: inventory({ freshness: { kind: 'unknown' } })
  })
  ok(102,
    fresh.stale === false && unknown.stale === false
      && stale.stale === true && typeof stale.staleNote === 'string'
      && stale.staleNote.includes('settings.json')
      && !stale.staleNote.toLowerCase().includes('missing'),
    `fresh and unknown are both not-stale; stale names the FILE: ${String(stale.staleNote)}`)
}

// 103 is the node's own LARGER cap, per KIND rather than overall — a node has a
// whole panel to fill, unlike the 260px pane, and a hundred skills must not
// push every MCP server off the bottom of a list whose whole purpose is
// answering "can this agent do X". The remainder is reported, never dropped.
{
  const many = []
  for (let i = 0; i < R.TOOLBOX_NODE_ROW_CAP + 3; i += 1) {
    many.push(invEntry({ id: `s${i}`, name: `skill-${i}` }))
  }
  many.push({ id: 'm1', kind: 'mcp', scope: 'user', sourcePath: '/h/.claude.json',
    active: { kind: 'active' }, alsoDefinedIn: [], name: 'railway',
    transport: 'stdio', command: 'npx', argCount: 0, envKeys: [], envKeysOverflow: 0 })
  const node = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' }, title: undefined,
    result: inventory({ entries: many })
  })
  const skills = node.groups.find((g) => g.kind === 'skill')
  const mcp = node.groups.find((g) => g.kind === 'mcp')
  ok(103,
    R.TOOLBOX_NODE_ROW_CAP > R.TOOLBOX_ROW_CAP
      && !!skills && skills.rows.length === R.TOOLBOX_NODE_ROW_CAP && skills.more === 3
      && !!mcp && mcp.rows.length === 1,
    `per-KIND cap: skills ${skills && skills.rows.length}+${skills && skills.more}, mcp survives`)
}

// 104 is the rail and inspector arms together, and it is the FIFTH kind earning
// the same refusal the review node and the file panel already do: a toolbox
// row is NEVER dormant — the honest answer, since a "click to start" arrow on
// a panel with no process is a promise nothing can keep — its tail says
// `toolbox`, and the inspector's restartable flag refuses every process verb.
// The dormant SET deliberately names this panel, so a kind-blind
// implementation would render 'dormant' here and be caught.
{
  const panel = {
    kind: 'toolbox',
    rect: { id: 't1', x: 0, y: 0, w: 560, h: 620 },
    z: 1,
    source: { cwd: '/Users/me/repo', label: 'repo' }
  }
  const rows = R.buildRailRows([panel], () => undefined, new Set(['t1']))
  const model = R.buildInspectorModel(panel, undefined)
  ok(104,
    rows.length === 1 && rows[0].dormant === false && rows[0].tail === 'toolbox'
      && rows[0].label === 'toolbox · repo'
      && model.kind === 'toolbox' && model.restartable === false && model.reattached === false
      && model.fields.some((f) => f.key === 'toolbox-cwd' && f.value === '/Users/me/repo'),
    `never dormant, tail '${rows[0].tail}', label '${rows[0].label}', process verbs refused`)
}

// 105 is this section's own 60Hz defence, the shape checks 26-27, 63 and 86
// already earn — and it asserts toolboxSignature rather than
// inspectorSignature deliberately: the inventory arrives ASYNCHRONOUSLY on its
// own clock, so it gets its own signature rather than widening one whose
// subject is a different fact. Canvas freezes the model on it, so a change the
// signature does not cover renders once and never updates again.
{
  const a = R.buildToolboxFields(inventory())
  const b = R.buildToolboxFields(inventory())
  const moved = R.buildToolboxFields(inventory({ entries: [invEntry({ name: 'other' })] }))
  ok(105,
    R.toolboxSignature(a) === R.toolboxSignature(b)
      && R.toolboxSignature(a) !== R.toolboxSignature(moved)
      && R.toolboxSignature(null) !== R.toolboxSignature(a),
    `equal models share a signature, a changed inventory moves it, null is its own`)
}


// 106 — the editability gate, BOTH directions in one read. An `editable` that
// is always false satisfies the truncated half perfectly and deletes the
// milestone, so the untruncated clause is what makes this a check rather than
// a restatement. Truncated text is read-only because saving a truncated
// buffer back would delete every line past FILE_MAX_LINES with a
// successful-looking result — "half a file is a different file" in its most
// destructive available form.
{
  const editable = R.buildFileNodeModel({
    source: { path: '/tmp/a/notes.md' },
    title: undefined,
    result: { kind: 'text', content: 'one\ntwo\n', bytes: 8, lines: 2, truncatedLines: 0, mtimeMs: 1 }
  })
  const truncated = R.buildFileNodeModel({
    source: { path: '/tmp/a/huge.log' },
    title: undefined,
    result: { kind: 'text', content: 'one\n', bytes: 999, lines: 40000, truncatedLines: 30000, mtimeMs: 1 }
  })
  ok(106, editable.editable === true && truncated.editable === false
      && typeof truncated.editableNote === 'string' && truncated.editableNote.length > 0,
    `106 — untruncated text is editable, truncated text is not and says why: ` +
    `editable=${editable.editable} truncated=${truncated.editable}`)
}

// 107 — every NON-text arm is uneditable, and each says why in its OWN
// sentence. Four arms collapsed onto one note tells a user reading "binary"
// that reopening the file will help; this is check 78's non-vacuity rule
// applied to the gate rather than to the note.
{
  const arms = [
    { kind: 'missing' },
    { kind: 'too-large', bytes: 9e6, cap: 2097152 },
    { kind: 'binary', bytes: 42 },
    { kind: 'unreadable', detail: 'EACCES' }
  ].map((result) => R.buildFileNodeModel({ source: { path: '/tmp/a/x' }, title: undefined, result }))
  const notes82 = arms.map((m) => m.editableNote)
  ok(107, arms.every((m) => m.editable === false)
      && notes82.every((n) => typeof n === 'string' && n.length > 0)
      && new Set(notes82).size === notes82.length,
    `107 — no non-text arm is editable and each says why distinctly: ` +
    `editable=${JSON.stringify(arms.map((m) => m.editable))}`)
}

// ---------------------------------------------------------------------------
// M23 — the agent knobs in the inspector (ideas-backlog #8 part 1).
// ---------------------------------------------------------------------------

// 108. The knobs render from the SESSION's spec, not from the panel's.
//
//     The fixture builds the two DISAGREEING, which is the only shape that can
//     tell them apart — a fixture where they agree passes against either
//     implementation and proves nothing. It matters because `registry.ensure`
//     returns an existing session unchanged, so `session.spec` is by
//     construction the spec of the most recent `pty.create` for that panel
//     while `panel.spec` is merely what the canvas currently holds; reading
//     the panel would let the pane claim a mode the running agent is not in.
//
//     Absent knobs render NO rows at all rather than "default" — the same rule
//     the Cost section's three states already state, and the reason a login
//     shell shows nothing here instead of a confident nothing-in-particular.
{
  const withOpts = panel('p1', {
    spec: {
      panelId: 'p1', cwd: '~', args: [], command: 'claude', agent: 'claude-code',
      agentOptions: { permissionMode: 'plan', effort: 'high', model: 'opus' }
    }
  })
  // What the canvas holds, deliberately different from what was spawned.
  const staleOnPanel = {
    ...withOpts,
    spec: { ...withOpts.spec, agentOptions: { permissionMode: 'bypassPermissions' } }
  }
  const status = { kind: 'running', pid: 1, command: 'claude', cwd: '/x', reattached: false }

  const m = R.buildInspectorModel(
    staleOnPanel, status, undefined, [], undefined, withOpts.spec.agentOptions
  )
  const at = (k) => {
    const f = m.fields.find((x) => x.key === k)
    return f && f.value
  }

  const bare = R.buildInspectorModel(
    panel('p2', { spec: { panelId: 'p2', cwd: '~', args: ['-l'] } }),
    undefined, undefined, [], undefined, undefined
  )
  const bareKeys = bare.fields.map((f) => f.key)

  ok(108,
    at('agent-mode') === 'plan' &&
      at('agent-effort') === 'high' &&
      at('agent-model') === 'opus' &&
      !bareKeys.includes('agent-mode') &&
      !bareKeys.includes('agent-effort') &&
      !bareKeys.includes('agent-model'),
    JSON.stringify({
      mode: at('agent-mode'), effort: at('agent-effort'), model: at('agent-model'),
      bare: bareKeys
    }))
}

// 109. inspectorSignature MOVES when a knob changes, and is byte-identical
//     across a rect change. Canvas freezes the model on that signature, so a
//     value the signature does not cover renders once and then never updates
//     again — stuck at whatever it was when the panel was selected, with
//     nothing throwing. The knobs are the newest field on the model and so the
//     easiest for a later edit to leave uncovered.
{
  const base = panel('p1', {
    spec: { panelId: 'p1', cwd: '~', args: [], command: 'claude', agent: 'claude-code' }
  })
  const st = { kind: 'running', pid: 1, command: 'claude', cwd: '/x', reattached: false }
  const sig = (opts, rect) => R.inspectorSignature(
    R.buildInspectorModel(
      rect ? { ...base, rect: { ...base.rect, x: rect } } : base,
      st, undefined, [], undefined, opts
    )
  )
  const a = sig({ permissionMode: 'plan' })
  const moved = sig({ permissionMode: 'plan' }, 999)
  const b = sig({ permissionMode: 'acceptEdits' })
  const c = sig({ permissionMode: 'plan', effort: 'max' })
  ok(109, a === moved && a !== b && a !== c && b !== c,
    JSON.stringify({ rectStable: a === moved, modeMoves: a !== b, effortMoves: a !== c }))
}

/* ---- Every kind answers for itself ---- */

// kind-tail.1. EVERY member of the Panel['kind'] union gets a tail of its own,
//     and only 'terminal' is allowed to answer the process vocabulary.
//
//     railTail's three sessionless arms are a hand-maintained checklist, and a
//     kind added without one does not fail — it FALLS THROUGH to `dormant`
//     (always false for a sessionless kind, per buildRailRows) and then to
//     `status === undefined`, and renders 'not started'. That is a sentence
//     about a process the panel does not own, on a panel that will never have
//     one, and it is exactly what the comments above each existing arm say
//     those arms are there to prevent.
//
//     This is not hypothetical. 'jira' — the kind added most recently and
//     written most tersely — shipped with no arm at all and rendered
//     'not started' in the rail for the life of every Jira panel. This check
//     was watched RED against that code, reporting jira -> "not started".
//
//     The list is spelled out rather than derived, because Panel['kind'] is a
//     TYPE and this suite is plain node with no type information at runtime —
//     so a sixth kind must be added here by hand. That is the same obligation
//     isTerminalPanel already carries (panels.ts says so in its own comment),
//     and a failing check is a far cheaper reminder than a rail row that lies.
//
//     The TERMINAL clause is the non-vacuity guard: 'not started' is the
//     CORRECT answer for a terminal panel that has not spawned, so a check
//     that only asserted "no kind says 'not started'" would be demanding the
//     wrong thing of the one kind that owns a process.
{
  const PROCESS_WORDS = ['not started', 'dormant', 'asleep', 'exited', 'pid ', 'starting', 'running', 'working', 'needs you']
  const SESSIONLESS = ['review', 'file', 'toolbox', 'jira', 'memory', 'github']
  const tails = {}
  for (const k of SESSIONLESS) tails[k] = R.railTail(undefined, false, k)
  const bad = SESSIONLESS.filter((k) => PROCESS_WORDS.some((w) => tails[k].includes(w)))
  // Each kind must also be DISTINGUISHABLE — two kinds sharing one tail is the
  // copy-paste that produced this defect's sibling in inspector-fields.ts.
  const distinct = new Set(SESSIONLESS.map((k) => tails[k])).size === SESSIONLESS.length
  const terminalStillHonest = R.railTail(undefined, false, 'terminal') === 'not started'
  // M73. A chat panel is a PROCESS node: with no session answer yet its tail
  // is the honest process word, like a terminal's — deliberately NOT in the
  // sessionless list above, and asserted so a chat arm that fell through to
  // its kind name ("chat") would be caught here.
  const chatHonest = R.railTail(undefined, false, 'chat') === 'not started'
  ok('kind-tail.1 every sessionless kind has its own tail and only terminal speaks of processes',
    bad.length === 0 && distinct && terminalStillHonest && chatHonest,
    JSON.stringify({ tails, bad, distinct, terminalStillHonest, chatHonest }))
}

// kind-tail.2. buildInspectorModel reports each kind AS ITSELF. InspectorModel.kind
//     is typed Panel['kind'], so every kind name is legal in every arm and a
//     copy-pasted arm is invisible to tsc — which is exactly what happened:
//     the Jira arm returned `kind: 'file'`. That field is what the Inspector
//     reads to decide which controls a panel gets, so a mislabelled panel is
//     offered another kind's verbs.
//
//     Asserted for all four sessionless kinds in ONE read, because an arm that
//     got any single one wrong still looks correct beside the other three.
{
  const R_ = R
  const mk = (kind, extra) => ({ kind, rect: { id: kind[0] + '1', x: 0, y: 0, w: 100, h: 100 }, z: 1, ...extra })
  const got = {
    review: R_.buildInspectorModel(mk('review', { subject: { subjectId: 'p1', repoRoot: '/r', baselineSha: 'abc', label: 'x' } }), undefined, undefined, []).kind,
    file: R_.buildInspectorModel(mk('file', { source: { path: '/a/b.txt' } }), undefined, undefined, []).kind,
    toolbox: R_.buildInspectorModel(mk('toolbox', { source: { cwd: '/a', label: 'a' } }), undefined, undefined, []).kind,
    jira: R_.buildInspectorModel(mk('jira', { title: 'Jira tickets' }), undefined, undefined, []).kind,
    // M88. The second work panel joins the same rule.
    // Guarded: an unknown kind falls through to the terminal arm and THROWS
    // on its absent spec, which would abort the suite — a red row is the
    // signal, not a stack.
    github: (() => { try { return R_.buildInspectorModel(mk('github', { title: 'GitHub work' }), undefined, undefined, []).kind } catch (e) { return `threw: ${String(e && e.message)}` } })(),
    chat: R_.buildInspectorModel(mk('chat', { chat: { cwd: '/a', sessionId: 'u-1' } }), undefined, undefined, []).kind
  }
  const allSelf = Object.entries(got).every(([k, v]) => k === v)
  ok('kind-tail.2 the inspector model reports every sessionless kind as itself',
    allSelf, JSON.stringify(got))
}

// M196 (D04) — scope.fields.1. THE TWO FACTS THE CHAT ARM WAS MERGING.
//      A dispatched conversation's `chat.cwd` is an app-owned worktree LANE,
//      and the inspector showed only that folder — while its memories, its
//      skills brief and its Places verdict were every one of them being judged
//      against the repository the lane was cut from. Directory, repository and
//      lane are three facts; the pane had one row for all three.
//      BOTH new rows are absent for an ordinary chat, and that is half the
//      check: a `worktree lane —` row on a conversation that is not in one is
//      the zero-value-at-rest statement D01's density contract names.
//      The lane is matched with the SAME containment main's gate uses, so a
//      cwd BELOW the lane still resolves and a sibling sharing a path prefix
//      does not.
{
  const mk = (kind, extra) => ({ kind, rect: { id: kind[0] + '1', x: 0, y: 0, w: 100, h: 100 }, z: 1, ...extra })
  const LANE = '/app/worktrees/api-ab12/tc-p1'
  const lanes = [{ id: 'w1', path: LANE, root: '/home/u/work/api', branch: 'tc/p1' }]
  const build = (cwd, records) => R.buildInspectorModel(
    mk('chat', { chat: { cwd, sessionId: 'u-1' } }),
    undefined, undefined, [], undefined, undefined, undefined, undefined, undefined, undefined, undefined, records)
  const keys = (m) => m.fields.map((f) => f.key)
  const value = (m, key) => (m.fields.find((f) => f.key === key) ?? {}).value
  const inLane = build(LANE, lanes)
  const belowLane = build(`${LANE}/src`, lanes)
  const plain = build('/home/u/work/api', lanes)
  // The prefix decoy: a directory the records do not cover whose path starts
  // with the lane's. It must show NO lane rather than the neighbour's.
  const decoy = build('/app/worktrees/api-ab12/tc-p1x/src', lanes)
  // Nobody asked: the parameter is optional, and omitting it renders no rows.
  const unasked = build(LANE, undefined)
  ok('scope.fields.1 a chat in a worktree lane names its repository AND its lane as two fields beside the directory, from the lane root and from a subdirectory of it alike; an ordinary chat carries neither row rather than an empty one; a directory sharing a path prefix with a lane is not given the lane\'s repository; and a caller that passes no records renders no rows at all',
    keys(inLane).includes('chat-cwd') &&
      keys(inLane).includes('chat-repository') && keys(inLane).includes('chat-lane') &&
      value(inLane, 'chat-cwd') === LANE &&
      value(inLane, 'chat-repository') === '/home/u/work/api' && value(inLane, 'chat-lane') === 'tc/p1' &&
      keys(belowLane).includes('chat-repository') && value(belowLane, 'chat-repository') === '/home/u/work/api' &&
      value(belowLane, 'chat-cwd') === `${LANE}/src` &&
      !keys(plain).includes('chat-repository') && !keys(plain).includes('chat-lane') &&
      !keys(decoy).includes('chat-repository') && !keys(decoy).includes('chat-lane') &&
      !keys(unasked).includes('chat-repository'),
    JSON.stringify({ inLane: keys(inLane), belowLane: keys(belowLane), plain: keys(plain), decoy: keys(decoy), unasked: keys(unasked), repo: value(inLane, 'chat-repository'), lane: value(inLane, 'chat-lane') }))
}

// Backlog #75's diagnostics overlay model (buildDiagnosticsSnapshot). A
// PanelSession as the registry actually holds one, trimmed to the fields the
// model reads.
const session = (id, over = {}) => ({
  id,
  tier: 'live',
  dormant: false,
  spawned: true,
  status: { kind: 'idle' },
  ...over
})

// 110. Every input field is a straight pass-through — liveCount, heldCount,
//     budget, backend and the IPC rate all come from the caller, never
//     recomputed here. A model that recomputed any of them would be a SECOND
//     author of a fact the caller (Canvas.tsx's tiering effect, main's rate
//     counter) already owns, the same drift "One map, and a typed view over
//     it" exists to prevent.
{
  const backend = { kind: 'tmux', reason: '3.4' }
  const snap = R.buildDiagnosticsSnapshot({
    panels: [], budget: 8, liveCount: 3, heldCount: 2, backend, ipcMessagesPerSecond: 42
  })
  ok(110,
    snap.liveCount === 3 && snap.heldCount === 2 && snap.budget === 8 &&
      snap.backend === backend && snap.ipcMessagesPerSecond === 42,
    JSON.stringify(snap))
}

// 111. A session row carries the pid ONLY for a running session — the same
//     rule PtyCreateResult/PanelStatus already draw, since 'idle'/'starting'
//     have no process to name and 'exited'/'error' no longer do.
{
  const snap = R.buildDiagnosticsSnapshot({
    panels: [
      session('p1', { status: { kind: 'running', pid: 501, command: 'claude', cwd: '/x', reattached: false } }),
      session('p2', { status: { kind: 'idle' } }),
      session('p3', { status: { kind: 'exited', code: 0 } })
    ],
    budget: 8, liveCount: 1, heldCount: 0, backend: null, ipcMessagesPerSecond: null
  })
  const byId = Object.fromEntries(snap.sessions.map((s) => [s.id, s]))
  ok(111,
    byId.p1.pid === 501 && byId.p1.status === 'running' &&
      !('pid' in byId.p2) && byId.p2.status === 'idle' &&
      !('pid' in byId.p3) && byId.p3.status === 'exited',
    JSON.stringify(snap.sessions))
}

// 112. The row carries no field beyond {id, tier, dormant, spawned, status,
//     pid} — the whole point of this model, per its own header comment: a
//     PanelSession also carries `spec` (cwd/command/args), and a check that
//     never looked at the row's own KEYS would pass just as well against an
//     implementation that spread the panel and leaked all three. Fault
//     injection: replacing `sessionOf`'s object literal with a spread of
//     `panel` would add `spec`/`handle`/`sentGrid`/`lastFocusedAt` to this
//     set and turn this check red while 110/111/113 all stayed green.
{
  const withSecrets = session('p1', {
    spec: { panelId: 'p1', cwd: '/Users/alex/secret-project', args: ['--api-key=sk-live-x'] },
    status: { kind: 'running', pid: 1, command: 'claude --api-key sk-live-x', cwd: '/Users/alex/secret-project', reattached: false }
  })
  const snap = R.buildDiagnosticsSnapshot({
    panels: [withSecrets], budget: 8, liveCount: 1, heldCount: 0, backend: null, ipcMessagesPerSecond: null
  })
  const keys = Object.keys(snap.sessions[0]).sort()
  const serialised = JSON.stringify(snap)
  ok(112,
    JSON.stringify(keys) === JSON.stringify(['dormant', 'id', 'pid', 'spawned', 'status', 'tier']) &&
      !serialised.includes('secret-project') && !serialised.includes('sk-live-x'),
    JSON.stringify({ keys, serialised }))
}

// 113. Purity: two calls with deep-equal input produce deep-equal output, and
//     the input's own `panels` array is never mutated — an overlay polling
//     this every two seconds off a live `registry.all()` array must not find
//     the registry's own objects rewritten underneath it.
{
  const panels = [session('p1'), session('p2', { tier: 'card', dormant: true, spawned: false })]
  const frozen = JSON.stringify(panels)
  const input = { panels, budget: 8, liveCount: 1, heldCount: 0, backend: null, ipcMessagesPerSecond: 5 }
  const a = R.buildDiagnosticsSnapshot(input)
  const b = R.buildDiagnosticsSnapshot(input)
  ok(113,
    JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(panels) === frozen,
    JSON.stringify({ equal: JSON.stringify(a) === JSON.stringify(b) }))
}

// 114. An absent backend (the probe has not resolved yet, or this run has no
//     tmux) and an absent IPC rate both render as null rather than a
//     plausible wrong number — the same "zero and unmeasured are different
//     facts" rule buildUsageFields already draws for a panel with no cost
//     read yet.
{
  const snap = R.buildDiagnosticsSnapshot({
    panels: [], budget: 8, liveCount: 0, heldCount: 0, backend: null, ipcMessagesPerSecond: null
  })
  ok(114, snap.backend === null && snap.ipcMessagesPerSecond === null, JSON.stringify(snap))
}

// 115. An empty canvas (no sessions at all, the state of a fresh install)
//     answers an empty `sessions` array rather than throwing or answering
//     undefined — the ordinary state of every launch before the first spawn.
{
  const snap = R.buildDiagnosticsSnapshot({
    panels: [], budget: 8, liveCount: 0, heldCount: 0, backend: null, ipcMessagesPerSecond: null
  })
  ok(115, Array.isArray(snap.sessions) && snap.sessions.length === 0, JSON.stringify(snap.sessions))
}

// M37 — the inspector's three worktree states. Scoped ids.
//
// worktree.1. A session spawned in a worktree renders the branch AND the path,
//      as two rows: the branch is what the user types into `git merge`, the
//      path is what they cd into, and one row holding both is a row too long
//      for a 260px pane.
{
  const st = { ...running(48213, '/bin/zsh'), worktree: { kind: 'active', branch: 'tc/n1-20260901-1432', path: '/ud/worktrees/repo-abc/tc-n1-20260901-1432', root: '/Users/x/repo' } }
  const m = R.buildInspectorModel(panel('n1'), st)
  const branch = m.fields.find((f) => f.key === 'worktree')
  const path = m.fields.find((f) => f.key === 'worktree-path')
  ok('worktree.1 an active worktree renders its branch and its path',
    branch !== undefined && branch.value === 'tc/n1-20260901-1432' &&
      path !== undefined && path.value === '/ud/worktrees/repo-abc/tc-n1-20260901-1432',
    JSON.stringify(m.fields))
}

// worktree.2. A REFUSED worktree renders one row saying so, with the reason —
//      a worktree the user asked for and did not get must never be silent —
//      and no path row, because there is no path.
{
  const st = { ...running(48213, '/bin/zsh'), worktree: { kind: 'refused', reason: '/Users/x is not inside a git repository' } }
  const m = R.buildInspectorModel(panel('n1'), st)
  const branch = m.fields.find((f) => f.key === 'worktree')
  const path = m.fields.find((f) => f.key === 'worktree-path')
  ok('worktree.2 a refused worktree renders one row carrying the refusal and no path',
    branch !== undefined && /^refused — /.test(branch.value) && branch.value.includes('not inside a git repository') &&
      path === undefined,
    JSON.stringify(m.fields))
}

// worktree.3. A panel that never asked renders NEITHER row (the Cost section's
//      rule: no confident nothing), and the signature moves between the three
//      states — a frozen model would show a refusal that has since cleared.
{
  const none = R.buildInspectorModel(panel('n1'), running(48213, '/bin/zsh'))
  const active = R.buildInspectorModel(panel('n1'), { ...running(48213, '/bin/zsh'), worktree: { kind: 'active', branch: 'tc/n1-1', path: '/p', root: '/r' } })
  const refused = R.buildInspectorModel(panel('n1'), { ...running(48213, '/bin/zsh'), worktree: { kind: 'refused', reason: 'no' } })
  const sigs = new Set([R.inspectorSignature(none), R.inspectorSignature(active), R.inspectorSignature(refused)])
  ok('worktree.3 a panel that never asked renders no worktree row, and the signature separates the three states',
    !none.fields.some((f) => f.key === 'worktree' || f.key === 'worktree-path') && sigs.size === 3,
    JSON.stringify({ keys: none.fields.map((f) => f.key), sigs: sigs.size }))
}

// M61 — group-keys.2. NO CONTROL RUNS FROM onMouseDown ALONE. The one check
//     M59's audit lacked: it asked whether every affordance had a name and a
//     reason, never whether it had a route without a pointer. Read as text
//     like verify:styles — a <button in GroupLayer.tsx that carries
//     onMouseDown and does not spread shellControl is invisible to Enter and
//     Space, and nothing at runtime says so.
{
  const src = require('node:fs').readFileSync(join(__dirname, '..', 'src', 'renderer', 'groups', 'GroupLayer.tsx'), 'utf8')
  const buttons = src.split('<button').slice(1).map((b) => b.split('</button>')[0])
  const bad = buttons.filter((b) => /onMouseDown=/.test(b) && !/shellControl|groupControl/.test(b))
  // A local wrapper is accepted only if it is built ON shellControl — a
  // wrapper that re-implemented the pair by hand would pass the name test
  // and could drop the click half again.
  const wrapperComposes = /const groupControl = [\s\S]*?shellControl\(run\)/.test(src)
  ok('group-keys.2 no <button in GroupLayer.tsx runs from onMouseDown alone, and its wrapper is built on shellControl',
    buttons.length >= 2 && bad.length === 0 && wrapperComposes, JSON.stringify({ buttons: buttons.length, bad: bad.length, wrapperComposes }))
}

// M73 — state.chat. The chat arm of the one vocabulary: a chat panel is a
//     process node and speaks the terminal's words. Tested in the order the
//     arm states: a pending permission is `needs you` WHATEVER the process is
//     doing (the process is waiting on the answer), then streaming → working,
//     starting → starting, ready → idle, exited → `exited N` as a template
//     (0 is the common exit; a signal exit has no code and says `exited`),
//     and no answer yet → not started. No new word, no new tone.
{
  const st = (status, pending = 0, exitCode) => R.panelState({ kind: 'chat', status: undefined, dormant: false, chat: { status, pending, exitCode } }, undefined)
  const got = {
    none: R.panelState({ kind: 'chat', status: undefined, dormant: false }, undefined),
    notStarted: st('not-started'), starting: st('starting'), streaming: st('streaming'), ready: st('ready'),
    exited0: st('exited', 0, 0), exited1: st('exited', 0, 1), signal: st('exited', 0, null),
    pendingWhileStreaming: st('streaming', 1), pendingWhileReady: st('ready', 2), disposed: st('disposed'),
    // A transcript with turns and no process is ASLEEP (the restored
    // terminal's word for the same fact), never `not started`; a live
    // process with history speaks its own state.
    historyNoProcess: R.panelState({ kind: 'chat', status: undefined, dormant: false, chat: { status: 'not-started', pending: 0, hasHistory: true } }, undefined),
    historyNoAnswer: R.panelState({ kind: 'chat', status: undefined, dormant: false, chat: (typeof R.chatStateInput === 'function' ? R.chatStateInput(null, true) : undefined) }, undefined),
    historyReady: R.panelState({ kind: 'chat', status: undefined, dormant: false, chat: { status: 'ready', pending: 0, hasHistory: true } }, undefined),
    historyExited: R.panelState({ kind: 'chat', status: undefined, dormant: false, chat: { status: 'exited', pending: 0, exitCode: 1, hasHistory: true } }, undefined)
  }
  ok('state.chat the chat arm speaks the process words: needs you outranks everything, working/starting/idle/exited N, and no answer yet is not started',
    got.none.word === 'not started' && got.none.tone === 'none' &&
      got.notStarted.word === 'not started' && got.starting.word === 'starting' && got.starting.tone === 'starting' &&
      got.streaming.word === 'working' && got.streaming.tone === 'working' &&
      got.ready.word === 'idle' && got.ready.tone === 'idle' &&
      got.exited0.word === 'exited 0' && got.exited1.word === 'exited 1' && got.exited1.tone === 'exited' &&
      got.signal.word === 'exited' && got.signal.tone === 'exited' &&
      got.pendingWhileStreaming.word === 'needs you' && got.pendingWhileStreaming.tone === 'needs-you' &&
      got.pendingWhileReady.word === 'needs you' && got.disposed.word === 'not started' &&
      got.historyNoProcess.word === 'asleep' && got.historyNoProcess.tone === 'asleep' &&
      got.historyNoAnswer.word === 'asleep' && got.historyReady.word === 'idle' && got.historyExited.word === 'exited 1' &&
      Object.values(got).every((r) => R.TONES.includes(r.tone)),
    JSON.stringify(got))
}

// M73 — chat-model.1–.4. The chat panel's pure model: rows from turns, the
//     live-block merge that keeps a token from rendering twice, the
//     composer's arms with their reasons, and the snapshot → state input.
{
  const rows = typeof R.chatRows === 'function' ? R.chatRows : () => null
  const turns = [
    { id: 'u-1', role: 'user', blocks: [{ type: 'text', text: 'run it' }], at: 1 },
    { id: 'm1', role: 'assistant', blocks: [{ type: 'thinking', text: '' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'echo hi' } }], model: 'haiku', at: 2 },
    { id: 'u-2', role: 'user', blocks: [{ type: 'tool_result', toolUseId: 't1', content: 'hi', isError: false }], at: 3 },
    { id: 'm2', role: 'assistant', blocks: [{ type: 'text', text: 'done' }, { type: 'unknown', kind: 'server_tool_use' }], model: 'haiku', at: 4 }
  ]
  const got = rows(turns, null)
  const kinds = got ? got.map((r) => r.kind).join(',') : 'none'
  const tool = got && got.find((r) => r.kind === 'tool')
  ok('chat-model.1 rows: a user text turn is a user row, a tool result folds into its tool row by id (never its own row), an unknown block is an unknown row naming its kind',
    kinds === 'user,thinking,tool,text,unknown' && tool && tool.name === 'Bash' && tool.input.command === 'echo hi' &&
      tool.result && tool.result.content === 'hi' && tool.result.isError === false &&
      got[4].kindName === 'server_tool_use' && got[0].text === 'run it',
    JSON.stringify(got))
  // A stored turn for the live message holds its first TWO blocks; the live
  // block at index 1 is a duplicate and must not render; index 2 is still
  // streaming and must.
  const live = { messageId: 'm2', blocks: [
    { index: 1, block: { type: 'text', text: '' }, text: 'done' },
    { index: 2, block: { type: 'text', text: '' }, text: 'and mo' }
  ] }
  const merged = rows(turns, live)
  const texts = merged ? merged.filter((r) => r.kind === 'text').map((r) => [r.text, r.live === true]) : null
  ok('chat-model.2 a live block whose index the stored turn already covers is dropped, and the one beyond it renders as live — a token never renders twice',
    texts !== null && texts.length === 2 && texts[0][0] === 'done' && texts[0][1] === false && texts[1][0] === 'and mo' && texts[1][1] === true,
    JSON.stringify(texts))
  const otherLive = rows(turns, { messageId: 'm3', blocks: [{ index: 0, block: { type: 'text', text: '' }, text: 'new' }] })
  ok('chat-model.2b a live message with no stored turn yet renders every live block',
    otherLive !== null && otherLive[otherLive.length - 1].kind === 'text' && otherLive[otherLive.length - 1].text === 'new' && otherLive[otherLive.length - 1].live === true,
    JSON.stringify(otherLive && otherLive.slice(-1)))
  const composer = typeof R.composerState === 'function' ? R.composerState : () => null
  const snap = (status, pending = []) => ({ id: 'c', cwd: '/r', status, sessionId: 'u', turns: 0, usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, pending, queued: 0, counters: { ignored: 0, unknown: 0, malformed: 0 } })
  const a = composer(snap('streaming'), true)
  const b = composer(snap('ready'), true)
  const c = composer(null, false)
  const d = composer(null, true)
  const e = composer(snap('exited'), true)
  ok('chat-model.3 the composer: mid-turn Send is disabled by name and Interrupt enabled; at rest the reverse; with no claude Send names the PATH; before any answer Send is enabled; after an exit Send resumes',
    a && a.send.enabled === false && typeof a.send.reason === 'string' && a.interrupt.enabled === true &&
      b && b.send.enabled === true && b.interrupt.enabled === false && typeof b.interrupt.reason === 'string' &&
      c && c.send.enabled === false && /PATH/.test(c.send.reason) &&
      d && d.send.enabled === true && e && e.send.enabled === true,
    JSON.stringify({ a, b, c, d, e }))
  // M76 — approve.3. A question open disables Send by a reason that names the
  // fix (the verbs above), distinct from the streaming reason; Interrupt stays.
  const f = composer(snap('streaming', [{ requestId: 'r', toolName: 'Bash', input: {} }]), true)
  ok('approve.3 the composer with a question open disables Send naming allow/deny, distinct from the streaming reason, and keeps Interrupt',
    f && f.send.enabled === false && /allow or deny/.test(f.send.reason) && f.send.reason !== a.send.reason && f.interrupt.enabled === true, JSON.stringify(f))
  // M90. The second backend's named reasons: Interrupt mid-turn is disabled
  // with codex's own sentence (there is no door), never enabled to a no-op;
  // with no codex Send names codex, not claude; at rest the idle reason wins.
  const g = composer(snap('streaming'), true, 'codex')
  const h = composer(null, false, 'codex')
  const i = composer(snap('ready'), true, 'codex')
  const j = composer(snap('streaming', [{ requestId: 'r', toolName: 'Bash', input: {} }]), true, 'codex')
  ok('codex-composer.1 on a codex chat Interrupt is disabled mid-turn by a reason naming codex and the panel close, Send names codex when it is absent, the idle reason is unchanged at rest, and a claude chat\'s arms are exactly as before',
    g && g.send.enabled === false && g.interrupt.enabled === false && /codex/.test(g.interrupt.reason) && /close the panel/.test(g.interrupt.reason) &&
      h && h.send.enabled === false && /codex/.test(h.send.reason) && /PATH/.test(h.send.reason) && !/claude/.test(h.send.reason) &&
      i && i.send.enabled === true && i.interrupt.enabled === false && i.interrupt.reason === b.interrupt.reason &&
      j && j.interrupt.enabled === false && /codex/.test(j.interrupt.reason) &&
      a.interrupt.enabled === true && composer(snap('streaming'), true, 'claude').interrupt.enabled === true,
    JSON.stringify({ g, h, i, j }))
  const input = typeof R.chatStateInput === 'function' ? R.chatStateInput : () => null
  const i1 = input(snap('streaming', [{ requestId: 'r', toolName: 'Bash', input: {} }]))
  const i2 = input(null)
  const i3 = input({ ...snap('exited'), exitCode: 2 })
  const i4 = input(null, true)
  const i5 = input(snap('ready'), true)
  ok('chat-model.4 the state input carries the status, the pending COUNT, the exit code and whether a transcript exists; no snapshot and no history is undefined',
    i1 && i1.status === 'streaming' && i1.pending === 1 && i2 === undefined && i3 && i3.status === 'exited' && i3.exitCode === 2 &&
      i4 && i4.hasHistory === true && i4.status === 'not-started' && i5 && i5.hasHistory === true && i5.status === 'ready',
    JSON.stringify({ i1, i2, i3, i4, i5 }))
  const arg = typeof R.toolArgument === 'function' ? R.toolArgument : () => null
  ok('chat-model.5 a tool row\'s path argument is shortened from the LEFT so the file name survives; a command is cut from the right',
    arg({ file_path: '/private/var/folders/hl/x/T/tc shot/repo/src/server.ts' }) === '…/src/server.ts' &&
      arg({ command: 'echo hi' }) === 'echo hi' && arg({ command: 'x'.repeat(200) }).length === 94 && arg({}) === '',
    JSON.stringify([arg({ file_path: '/private/var/folders/hl/x/T/tc shot/repo/src/server.ts' }), arg({ command: 'x'.repeat(200) }).length]))
  // M162 — chat-model.6. THE FACE of the argument is decided beside its text:
  //     a path, a command, a pattern or a URL is code (mono); a Task's
  //     description or a search's query is a sentence (the UI face). The Act 0
  //     critic found the M162 sweep had styled the argument's CLASS mono and
  //     put a Task description in mono with nothing owing it.
  const isCode = typeof R.toolArgumentIsCode === 'function' ? R.toolArgumentIsCode : () => null
  ok('chat-model.6 a tool argument is code (mono) for a path, command, pattern or url and a sentence (the UI face) for a description or query',
    isCode({ file_path: '/x/y.ts' }) === true && isCode({ command: 'ls' }) === true && isCode({ pattern: '*.ts' }) === true && isCode({ url: 'https://a' }) === true &&
      isCode({ description: 'Find the failing test' }) === false && isCode({ query: 'electron work area' }) === false && isCode({}) === false,
    JSON.stringify([isCode({ file_path: '/x/y.ts' }), isCode({ description: 'a' }), isCode({})]))
}

// M164 — path.1. THE PATH RULE's one helper. `displayPath(path, root)`:
//     under a root, the root's basename plus the path relative to it (never
//     the root's own absolute prefix); the root itself is its basename; outside
//     every root, the last two segments behind `…/` (the palette's shortPath —
//     one shortening, not two); the home prefix reads `~` when no root is
//     given; `full` is always the absolute path for the tooltip; the empty
//     string is never returned. A second helper would differ from this one
//     exactly where nobody looks — every body that prints a path calls it.
{
  const dp = typeof R.displayPath === 'function' ? R.displayPath : () => null
  const root = '/private/var/folders/hl/x/T/tc shot fixtures golden/repo'
  const a = dp(root + '/src/server.ts', root)
  const b = dp(root, root)
  const c = dp('/private/var/folders/hl/x/T/tc shot fixtures golden/notes/plan.md', root)
  const d = dp('/Users/ada/work/api/src/a.ts', undefined, '/Users/ada')
  const e = dp('/Users/ada', undefined, '/Users/ada')
  const f = dp(root + '/src/server.ts', root + '/')
  ok('path.1 displayPath shows the repository basename and the path relative to it, the root as its basename, a path outside every root as its last two segments, ~ for home, and the full path beside each',
    a && a.short === 'repo/src/server.ts' && a.full === root + '/src/server.ts' &&
      b && b.short === 'repo' && c && c.short === '…/notes/plan.md' && d && d.short === '~/work/api/src/a.ts' && e && e.short === '~' &&
      f && f.short === 'repo/src/server.ts' && dp('', root).short !== '' &&
      // M178 (F.2): a label with a path inside keeps its words and shortens the path.
      (typeof R.displayLabel === 'function' && R.displayLabel('chat: /Users/ada/work/api (c3)') === 'chat: …/work/api (c3)' && R.displayLabel('Open review of chat: ' + root + '/src (c3)', root) === 'Open review of chat: repo/src (c3)'),
    JSON.stringify({ a, b, c, d, e, f, empty: dp('', root) }))
}

// M167 — md.1. THE MARKDOWN GRAMMAR, closed: headings 1–3, paragraphs, lists,
//     fences (an unclosed fence is still code), inline code/bold/italic/link;
//     a table renders as its source in a code block, an image as its alt text;
//     and plainText() of the tree is the text a check reads off the DOM
//     (`data-chat-assistant-text`'s textContent, chat.2 / chat.3).
{
  const md = typeof R.parseMarkdown === 'function' ? R.parseMarkdown : () => null
  const plain = typeof R.plainText === 'function' ? R.plainText : () => null
  const t = md('# Title\n\nA **bold** and *it* with `code` and [a link](https://x.y).\n\n- one\n- two\n\n1. first\n2. second\n\n```ts\nconst a = 1\n```\n\n| a | b |\n|---|---|\n\n![alt text](img.png) tail\n\n```\nunclosed')
  const kinds = t ? t.map((b) => b.kind).join(',') : null
  const para = t && t[1]
  const runs = para && para.children ? para.children.map((r) => r.kind).join(',') : null
  ok('md.1 the markdown grammar: heading, a paragraph with bold/italic/code/link runs, two lists, a fence with its language, a table as code, an image as its alt text, an unclosed fence as code; plainText round-trips',
    kinds === 'heading,paragraph,list,list,code,code,paragraph,code' && runs === 'text,bold,text,italic,text,code,text,link,text' &&
      t[4].lang === 'ts' && t[4].text === 'const a = 1' && t[5].text.startsWith('| a | b |') && t[6].children[0].text === 'alt text' && t[7].text === 'unclosed' &&
      plain(md('hi **there**')) === 'hi there' && plain(md('```\nx = 1\n```')) === 'x = 1' &&
      // The Act II critic's two: a code span is found FIRST, and emphasis never crosses it.
      JSON.stringify(md('2 * 3 = `6 * 1` done')[0].children.map((r) => r.kind)) === JSON.stringify(['text', 'code', 'text']) &&
      JSON.stringify(md('**`a*b`**')[0].children.map((r) => r.kind)) === JSON.stringify(['text', 'code', 'text']) &&
      md('[w](https://en.wikipedia.org/wiki/Foo_(bar)) x')[0].children[0].href === 'https://en.wikipedia.org/wiki/Foo_(bar)' &&
      md('# Title #')[0].children[0].text === 'Title',
    JSON.stringify({ kinds, runs }))
}

// M168 — chat-model.7. TOOL GROUPS. Consecutive tool rows fold under one
//     header (`worked for 2m · 6 tools`) collapsed by default; a single tool
//     row stays a row (no header for one); the elapsed span is the first and
//     last tool's record times when both exist and absent otherwise (absent
//     stays absent — a header never says `NaN`); every other row passes
//     through in order. `toolVerb` names the family (Read / Edit / Run /
//     Search / the tool's own name) and `toolState` the pill.
{
  const groups = typeof R.toolGroups === 'function' ? R.toolGroups : () => null
  const verb = typeof R.toolVerb === 'function' ? R.toolVerb : () => null
  const state = typeof R.toolState === 'function' ? R.toolState : () => null
  const tool = (id, name, at) => ({ kind: 'tool', id, name, input: {}, live: false, ...(at === undefined ? {} : { at }) })
  const rows = [{ kind: 'user', id: 'u', text: 'x' }, tool('t1', 'Read', 1000), tool('t2', 'Edit', 61000), tool('t3', 'Bash'), { kind: 'text', id: 'a', text: 'done', live: false }, tool('t4', 'Grep')]
  const g = groups(rows)
  const kinds = g ? g.map((x) => x.kind).join(',') : null
  const first = g && g[1]
  ok('chat-model.7 consecutive tool rows fold into one group with the elapsed span when the times exist, a lone tool row stays a row, the rest pass through; toolVerb and toolState name the family and the pill (a stored call with no result reads `no result`, never `done`)',
    kinds === 'user,tools,text,tool' && first && first.rows.length === 3 && first.elapsedMs === 60000 &&
      groups([tool('x', 'Read')])[0].kind === 'tool' && groups([tool('x', 'Read', 5), tool('y', 'Read')])[0].elapsedMs === undefined && groups([tool('x', 'Read', 5), tool('y', 'Read', 900)])[0].elapsedMs === undefined &&
      verb('Read') === 'Read' && verb('Bash') === 'Run' && verb('Grep') === 'Search' && verb('WebFetch') === 'WebFetch' && verb('Write') === 'Edit' &&
      state({ ...tool('a', 'Read'), result: { content: 'x', isError: false } }) === 'done' && state(tool('a', 'Read')) === 'no result' && state({ ...tool('a', 'Read'), live: true }) === 'running' && state({ ...tool('a', 'Read'), result: { content: 'x', isError: true } }) === 'error',
    JSON.stringify({ kinds, first: first && { n: first.rows.length, elapsedMs: first.elapsedMs }, verbs: [verb('Bash'), verb('Grep'), verb('Write')] }))
}

// M169 — composer-rows.1. THE GROWING WELL: the textarea's rows follow the
//     draft's lines — two at rest, one per line, six at most — pure, so the
//     count is checked here and the node only renders it.
{
  const rows = typeof R.composerRows === 'function' ? R.composerRows : () => null
  ok('composer-rows.1 the composer shows two rows at rest, one per line of the draft, and never more than six',
    rows('') === 2 && rows('one') === 2 && rows('a\nb\nc') === 3 && rows('1\n2\n3\n4\n5\n6\n7\n8') === 6,
    JSON.stringify([rows(''), rows('a\nb\nc'), rows('1\n2\n3\n4\n5\n6\n7\n8')]))
}

// M170 — header.3. THE AGENT CARD WHEN IT IS A TERMINAL: a claude / codex /
//     copilot terminal wears the chat's header line — folder · engine — from
//     the SAME builder (chatHeaderLine); a plain shell has no line (null, never
//     an empty string); the engine word is the backend's own, never the
//     spec's agent id.
{
  const ah = typeof R.agentHeader === 'function' ? R.agentHeader : () => null
  ok('header.3 agentHeader gives an agent terminal the chat\'s folder · engine line from chatHeaderLine, and a plain shell none',
    ah({ cwd: '/Users/ada/work/api', agent: 'claude-code' }) === 'api · claude' && ah({ cwd: '/Users/ada/work/api', agent: 'codex' }) === 'api · codex' &&
      ah({ cwd: '/Users/ada/work/api', agent: 'claude-code' }, 'main') === 'api · main · claude' && ah({ cwd: '/Users/ada/work/api' }) === null,
    JSON.stringify([ah({ cwd: '/a/b', agent: 'claude-code' }), ah({ cwd: '/a/b' })]))
}

// M169 — composer-live.1 (the Act II critic). ONE predicate says whether a
//     turn is in flight: `composerLive` is what composerState's arms and the
//     well's `--live` class both read, so Send is never hidden while it is
//     enabled — a restored chat `starting` with turns behind it, or any
//     `starting` with a queue, is NOT live.
{
  const live = typeof R.composerLive === 'function' ? R.composerLive : () => null
  const cs = typeof R.composerState === 'function' ? R.composerState : () => null
  const snap = (over) => ({ status: 'ready', queued: 0, turns: 0, pending: [], ...over })
  const restored = snap({ status: 'starting', turns: 1, pid: 42 })
  const queued = snap({ status: 'starting', turns: 0, queued: 1, pid: 42 })
  const fresh = snap({ status: 'starting', turns: 0, queued: 0, pid: 42 })
  ok('composer-live.1 composerLive is composerState\'s own in-flight predicate: streaming is live, a fresh first spawn is live, a restored or queued `starting` is not — and Send is enabled exactly when the well is not live',
    live(null) === false && live(snap({ status: 'streaming' })) === true && live(fresh) === true && live(restored) === false && live(queued) === false &&
      cs(restored, true).send.enabled === true && cs(fresh, true).send.enabled === false && cs(snap({ status: 'streaming' }), true).send.enabled === false,
    JSON.stringify({ restored: live(restored), queued: live(queued), fresh: live(fresh), sendRestored: cs(restored, true).send.enabled }))
}

// M171 — groups.1. THE RAIL AS PLACES: every row lands in exactly one group
//     (agents · files · reviews · boards · integrations · workflows), in array
//     order within it; an empty group is omitted; the group order is fixed;
//     a kind the table does not name lands with the integrations rather than
//     vanishing (a row that disappears is indistinguishable from a feature
//     that was never built).
{
  const groups = typeof R.railGroups === 'function' ? R.railGroups : () => null
  const row = (id, kind) => ({ id, state: { kind } })
  const g = groups([row('a', 'chat'), row('b', 'file'), row('c', 'terminal'), row('d', 'work'), row('e', 'note'), row('f', 'workflow'), row('g', 'mystery'), row('h', 'review')])
  const ids = g ? g.map((x) => `${x.id}:${x.rows.map((r) => r.id).join('')}`).join(' ') : null
  ok('groups.1 railGroups: one group per row in a fixed order, array order within, empty groups omitted, an unknown kind with the integrations',
    ids === 'agents:ac files:be reviews:h boards:d integrations:g workflows:f' && groups([]).length === 0 && g.every((x) => typeof x.label === 'string' && x.label !== ''),
    JSON.stringify({ ids }))
}

// M173 — hints.1. THE HINTS AS DATA: the four gesture hints (pan, zoom,
//     palette, new-panel) and the tmux notice are one list with ids, each a
//     SENTENCE; `hintsLeft(seen)` is what the empty state and the launcher
//     render — a seen id never comes back, an unknown id in `seen` is ignored.
{
  const hints = Array.isArray(R.HINTS) ? R.HINTS : null
  const left = typeof R.hintsLeft === 'function' ? R.hintsLeft : () => null
  const ids = hints ? hints.map((h) => h.id).join(',') : null
  ok('hints.1 the hints are data — four gestures and the tmux notice, each a sentence — and hintsLeft filters the seen ones',
    ids === 'pan,zoom,palette,new-panel,tmux' && hints.every((h) => typeof h.text === 'string' && h.text.length > 8) &&
      left(new Set(['palette'])).map((h) => h.id).join(',') === 'pan,zoom,new-panel,tmux' && left(new Set(['nope'])).length === 5 &&
      left(new Set(), 'rail').length === 4 && left(new Set(), 'launcher').map((h) => h.id).join(',') === 'tmux' && hints.every((h) => h.where === 'rail' || h.where === 'launcher'),
    JSON.stringify({ ids }))
}

// M177 — empty.2. EMPTY STATES AS DATA: one list; every entry names what its
//     surface is for in a sentence (never a bare zero, an ellipsis or a
//     dash), a verb where the surface has a door; `emptyState(id)` throws on
//     an unknown id rather than rendering nothing; the Panels list's sentence
//     keeps empty.1's words.
{
  const list = Array.isArray(R.EMPTY_STATES) ? R.EMPTY_STATES : null
  const get = typeof R.emptyState === 'function' ? R.emptyState : () => null
  const bad = list ? list.filter((e) => typeof e.sentence !== 'string' || e.sentence.trim().length < 12 || /^[0—–\-…]+$/.test(e.sentence.trim()) || (e.verb !== undefined && (typeof e.verb !== 'string' || e.verb.trim() === ''))) : null
  let threw = false
  try { get('no-such-surface') } catch { threw = true }
  // M179 (the Act IV critic): a list the UI does not read is the "row that
  // disappears" failure in reverse — the check stays green while the words
  // on screen drift. Every id must be RENDERED by name somewhere in the
  // renderer (`<EmptyState id="…"` or `emptyState('…')`), read as text.
  const src = require('node:fs').readdirSync(require('node:path').join(__dirname, '..', 'src', 'renderer'), { recursive: true })
    .filter((f) => /\.tsx?$/.test(String(f)))
    .map((f) => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'renderer', String(f)), 'utf8')).join('\n')
  const unrendered = list ? list.map((e) => e.id).filter((id) => !src.includes(`<EmptyState id="${id}"`) && !src.includes(`emptyState('${id}')`)) : null
  ok('empty.2 the empty states are data: sentences, never a bare zero or ellipsis, a verb where there is a door, the Panels sentence kept, an unknown id refused, and every id rendered by name in the renderer',
    list !== null && list.length >= 9 && bad !== null && bad.length === 0 && get('panels').sentence === 'no panels — ⌘N to start one' && threw && list.some((e) => e.verb !== undefined) && unrendered !== null && unrendered.length === 0,
    JSON.stringify({ n: list && list.length, bad: bad && bad.map((e) => e.id), unrendered }))
}

// M178 — lastline.2 (F.14). The rail's last line is prose: inline code fences
//     are stripped and the words kept — `Want me to wire `/health` to it?`
//     reads without backticks in a list a person scans.
{
  const f = typeof R.lastLineOf === 'function' ? R.lastLineOf : () => null
  ok('lastline.2 lastLineOf strips inline code fences and keeps the words',
    f('a\nWant me to wire `/health` to it?') === 'Want me to wire /health to it?' && f('`x`') === 'x',
    JSON.stringify([f('Want me to wire `/health` to it?')]))
}

// M74 — front.1. THE FRONT-END VERB on the inspector model, both kinds, each
//     arm named: a terminal opens as chat only when it was started as a claude
//     session AND its process is not live; a chat opens in a terminal only when
//     nothing is in flight and it has turns. Every other kind has no verb at
//     all (undefined), never a disabled one — a review node cannot become a
//     conversation. A row that disappears is indistinguishable from a feature
//     never built, so each refusal carries its reason.
{
  const t = (over = {}) => ({ kind: 'terminal', rect: { id: 't1', x: 0, y: 0, w: 1, h: 1 }, z: 1, spec: { panelId: 't1', cwd: '~', args: [], agent: 'claude-code' }, ...over })
  const chat = (over = {}) => ({ kind: 'chat', rect: { id: 'c1', x: 0, y: 0, w: 1, h: 1 }, z: 1, chat: { cwd: '/r', sessionId: 'u' }, ...over })
  const fe = (m) => m && m.frontEnd
  const claudeExited = fe(R.buildInspectorModel(t(), { kind: 'exited', code: 0 }))
  const claudeDormant = fe(R.buildInspectorModel(t(), { kind: 'idle' }, undefined, [], undefined, undefined, undefined, true))
  const claudeLive = fe(R.buildInspectorModel(t(), { kind: 'running', pid: 4, command: 'claude', reattached: false, cwd: '~' }))
  const shell = fe(R.buildInspectorModel(t({ spec: { panelId: 't1', cwd: '~', args: [] } }), { kind: 'exited', code: 0 }))
  const chatRest = fe(R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, { state: { status: 'ready', pending: 0, hasHistory: true }, usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, turns: 2 }))
  const chatBusy = fe(R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, { state: { status: 'streaming', pending: 0, hasHistory: true }, usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, turns: 1 }))
  const chatEmpty = fe(R.buildInspectorModel(chat(), undefined))
  const review = fe(R.buildInspectorModel({ kind: 'review', rect: { id: 'r1', x: 0, y: 0, w: 1, h: 1 }, z: 1, subject: { subjectId: 'p', repoRoot: '/r', baselineSha: 'a', label: 'x' } }, undefined))
  ok('front.1 the front-end verb: a claude terminal opens as chat when exited or asleep, is refused by name while live or when it was a plain shell; a chat opens in a terminal at rest, is refused by name while answering or empty; other kinds have no verb',
    claudeExited && claudeExited.verb === 'open-as-chat' && claudeExited.enabled === true &&
      claudeDormant && claudeDormant.verb === 'open-as-chat' && claudeDormant.enabled === true &&
      claudeLive && claudeLive.verb === 'open-as-chat' && claudeLive.enabled === false && /stop|front-end/.test(claudeLive.reason) &&
      shell && shell.verb === 'open-as-chat' && shell.enabled === false && /claude session/.test(shell.reason) &&
      chatRest && chatRest.verb === 'open-in-terminal' && chatRest.enabled === true &&
      chatBusy && chatBusy.enabled === false && /interrupt/.test(chatBusy.reason) &&
      chatEmpty && chatEmpty.enabled === false && /send a message/.test(chatEmpty.reason) &&
      review === undefined,
    JSON.stringify({ claudeExited, claudeDormant, claudeLive, shell, chatRest, chatBusy, chatEmpty, review }))
}

// M76 — approve.1 / approve.2. THE QUESTION ON THE ROW AND IN THE PANE.
//     approve.1: an attention row for a chat with a pending request carries
//     the OLDEST request (tool and argument) so the popover can answer it; a
//     terminal's row carries none — nothing in this app can answer a question
//     typed into a PTY — and the signature moves when the request changes.
//     approve.2: the inspector model carries the chat's pending request, and
//     none when nothing pends (the component disables by name from that).
{
  const approvals = [
    { id: 'c1', requestId: 'r2', toolName: 'Edit', argument: 'b.ts' },
    { id: 'c1', requestId: 'r1', toolName: 'Bash', argument: 'ls' }
  ]
  const chatRow = { id: 'c1', label: 'api (chat)', tail: 'x', dormant: false }
  const rows = R.buildAttentionRows(['n1', 'c1'], [railRowFor('n1', panel('n1'), running(1, '/bin/zsh')), chatRow], approvals)
  const plain = R.buildAttentionRows(['n1', 'c1'], [railRowFor('n1', panel('n1'), running(1, '/bin/zsh')), chatRow])
  ok('approve.1 a chat attention row carries its first pending request (tool, argument, id); a terminal row carries none; the third argument is optional; the signature moves on the request',
    rows.length === 2 && rows[0].approval === undefined && rows[1].approval !== undefined && rows[1].approval.requestId === 'r2' && rows[1].approval.toolName === 'Edit' && rows[1].approval.argument === 'b.ts' &&
      plain.length === 2 && plain[1].approval === undefined &&
      R.attentionSignature(rows) !== R.attentionSignature(plain),
    JSON.stringify({ rows, plain }))

  const chat = (over = {}) => ({ kind: 'chat', rect: { id: 'c1', x: 0, y: 0, w: 1, h: 1 }, z: 1, chat: { cwd: '/r', sessionId: 'u' }, ...over })
  const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  const pending = R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, { state: { status: 'ready', pending: 1, hasHistory: true }, usage, turns: 2, approval: { requestId: 'r1', toolName: 'Bash', argument: 'ls' } })
  const rest = R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, { state: { status: 'ready', pending: 0, hasHistory: true }, usage, turns: 2 })
  const terminal = R.buildInspectorModel({ kind: 'terminal', rect: { id: 't1', x: 0, y: 0, w: 1, h: 1 }, z: 1, spec: { panelId: 't1', cwd: '~', args: [] } }, { kind: 'idle' })
  ok('approve.2 the inspector model carries a chat\'s pending request and its state word is needs you; none at rest; a terminal has no approval field',
    pending.approval !== undefined && pending.approval.toolName === 'Bash' && pending.approval.argument === 'ls' && pending.approval.requestId === 'r1' && R.panelState(pending.state).word === 'needs you' &&
      rest.approval === undefined && rest.kind === 'chat' && !('approval' in terminal),
    JSON.stringify({ pending: pending.approval, state: pending.state, rest: rest.approval, terminal: 'approval' in terminal }))
}

// M77 — tools.1 / tools.2. TOOL CALLS AS OBJECTS, the pure half.
//     tools.1: a chat tool row carries the file it names (and none for Bash);
//     a review node row carries the number of tool calls that touched ITS path
//     and no other's. tools.2: `reviewable` on the inspector model — a
//     terminal's is restartable; a chat's is "its agent has run"; a chat at
//     rest with no turn is refused by a reason that names the fix, not the
//     terminal's `has not started`.
{
  const turns = [
    { id: 'm1', role: 'assistant', blocks: [
      { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/repo/src/a.ts' } },
      { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' } }
    ], at: 2 }
  ]
  const rows = R.chatRows(turns, null).filter((r) => r.kind === 'tool')
  const model = R.buildReviewNodeModel({
    subject: { subjectId: 'c1', repoRoot: '/repo', baselineSha: 'abc', label: 'chat' },
    result: { kind: 'changes', root: '/repo', added: 1, removed: 0, files: [{ path: 'src/a.ts', added: 1, removed: 0, binary: false, untracked: false }, { path: 'src/b.ts', added: 1, removed: 0, binary: false, untracked: false }], truncated: 0 },
    expandedPath: null,
    touches: { 'src/a.ts': 2 }
  })
  const plain = R.buildReviewNodeModel({
    subject: { subjectId: 'c1', repoRoot: '/repo', baselineSha: 'abc', label: 'chat' },
    result: { kind: 'changes', root: '/repo', added: 1, removed: 0, files: [{ path: 'src/a.ts', added: 1, removed: 0, binary: false, untracked: false }], truncated: 0 },
    expandedPath: null
  })
  const shared = R.buildReviewNodeModel({
    subject: { subjectId: 'c1', repoRoot: '/repo', baselineSha: 'abc', label: 'chat' },
    result: { kind: 'shared', root: '/repo', panelCount: 3, files: [{ path: 'src/a.ts', added: 1, removed: 0, binary: false, untracked: false }] },
    expandedPath: null, touches: { 'src/a.ts': 1 }
  })
  ok('tools.1 a chat tool row carries the file it names and none for Bash; a review row carries the tool-call count for its own path only; the count is optional; a shared repository\'s note does not contradict the counts',
    rows.length === 2 && rows[0].file === '/repo/src/a.ts' && rows[1].file === undefined &&
      model.files[0].touches === 2 && model.files[1].touches === undefined && plain.files[0].touches === undefined &&
      /tool calls are this chat/.test(shared.note) && shared.files[0].touches === 1,
    JSON.stringify({ rows: rows.map((r) => r.file), files: model.files }))

  const t = (over = {}) => ({ kind: 'terminal', rect: { id: 't1', x: 0, y: 0, w: 1, h: 1 }, z: 1, spec: { panelId: 't1', cwd: '~', args: [] }, ...over })
  const chat = () => ({ kind: 'chat', rect: { id: 'c1', x: 0, y: 0, w: 1, h: 1 }, z: 1, chat: { cwd: '/r', sessionId: 'u' } })
  const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  const live = R.buildInspectorModel(t(), { kind: 'running', pid: 4, command: 'sh', reattached: false, cwd: '~' })
  const never = R.buildInspectorModel(t(), { kind: 'idle' })
  const chatRan = R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, { state: { status: 'ready', pending: 0, hasHistory: true }, usage, turns: 1 })
  const chatAlive = R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, { state: { status: 'streaming', pending: 0, hasHistory: false }, usage, turns: 0, ran: true })
  const chatEmpty = R.buildInspectorModel(chat(), undefined)
  ok('tools.2 reviewable: a live terminal yes, a never-started one no; a chat with a turn yes, one with a process alive yes, an empty one no with a reason naming the fix',
    live.reviewable === true && never.reviewable === false && chatRan.reviewable === true && chatAlive.reviewable === true && chatEmpty.reviewable === false &&
      typeof chatEmpty.reviewReason === 'string' && /send a message/.test(chatEmpty.reviewReason) && typeof never.reviewReason === 'string' && never.reviewReason !== chatEmpty.reviewReason,
    JSON.stringify({ live: live.reviewable, never: [never.reviewable, never.reviewReason], chatRan: chatRan.reviewable, chatAlive: chatAlive.reviewable, chatEmpty: [chatEmpty.reviewable, chatEmpty.reviewReason] }))
}

// M79 — run.1. The Runs rows: name, the panel count, the duration, the cost
//      (a dash when absent), and the outcome word — running while open, done,
//      failed when any entry's outcome names a non-zero exit; Run again is
//      refused by name while open and when no root is a terminal.
{
  const run = (over = {}) => ({ id: 'r1', name: 'a → b · 10:00', panelIds: ['a', 'b'], edges: [{ from: 'a', to: 'b' }], startedAt: 1000, endedAt: 61000, entries: [{ panelId: 'a', startedAt: 1000, endedAt: 2000, outcome: 'exit 0' }, { panelId: 'b', startedAt: 2000, endedAt: 61000, outcome: 'exit 0' }], costUsd: 0.1234, ...over })
  const build = typeof R.buildRunRows === 'function' ? R.buildRunRows : () => []
  const rows = build([run(), run({ id: 'r2', endedAt: undefined, costUsd: undefined }), run({ id: 'r3', entries: [{ panelId: 'a', startedAt: 1, endedAt: 2, outcome: 'exit 1' }] }), run({ id: 'r4', entries: [{ panelId: 'a', startedAt: 1, endedAt: 2, outcome: 'stopped by person' }] })], new Set(['a']), 100000)
  ok('run.1 the Runs rows carry name, ONE facts line, and report run ended / working / failed / stopped without calling an unreviewed task done; Run again keeps its named reasons',
    rows.length === 4 && rows[0].name === 'a → b · 10:00' && rows[0].panels === 2 && rows[0].duration === '1m 0s' && rows[0].cost === '$0.12' && rows[0].outcome === 'run ended' && rows[0].tone === 'none' && rows[0].facts === '2 panels · 1m 0s' /* M179: no dollars in the rail — the metrics rule; the Work tab prints the price */ && rows[0].runAgain.enabled === true &&
      rows[1].outcome === 'working' && rows[1].cost === '—' && !/\$|—$/.test(rows[1].facts) && rows[1].runAgain.enabled === false && /still running/.test(rows[1].runAgain.reason) &&
      rows[2].outcome === 'failed' && rows[2].tone === 'exited' && rows[3].outcome === 'stopped' && rows[3].tone === 'asleep' &&
      build([run()], new Set(), 100000)[0]?.runAgain.enabled === false && /terminal/.test(build([run()], new Set(), 100000)[0]?.runAgain.reason ?? ''),
    JSON.stringify(rows))
}

// M78 — graph.1. describeAutomation names the five triggers, each distinct.
// M200 — the two supervision surfaces consume the shared projection and
// expose the exact live request through the standing approval door.
{
  const read = (file) => require('node:fs').readFileSync(join(__dirname, '..', file), 'utf8')
  const workflow = read('src/renderer/workflow/WorkflowNode.tsx')
  const work = read('src/renderer/work/WorkNode.tsx')
  const canvas = read('src/renderer/canvas/Canvas.tsx')
  ok('run.surface.1 workflow and task cards consume the shared live projection, name the blocking node/question, and answer through the same approval action Canvas gives chat and Attention',
    /projectRun\(selectedRun, props\.liveFacts\)/.test(workflow) && /data-workflow-run-blocker/.test(workflow) && /data-workflow-approval="allow"/.test(workflow) &&
      /data-work-execution/.test(work) && /data-work-blocker/.test(work) && /data-work-approval="allow"/.test(work) &&
      /liveFacts=\{liveRunFacts\} onAnswer=\{paletteActions\.answerApproval\}/.test(canvas) && /execution=\{execution\} onAnswer=\{paletteActions\.answerApproval\}/.test(canvas),
    JSON.stringify({ workflow: workflow.includes('projectRun'), work: work.includes('data-work-execution'), canvas: canvas.includes('liveRunFacts') }))
}

// M78 — graph.1. describeAutomation names the five triggers, each distinct.
{
  const d = (trigger) => R.describeAutomation({ kind: 'handoff', enabled: true, trigger })
  const all = ['exit', 'idle', 'exit-ok', 'exit-fail', 'always'].map(d)
  ok('graph.1 describeAutomation names the five triggers distinctly — exit 0, a failing exit, always — and keeps the two bounds',
    /exit 0/.test(d('exit-ok')) && /fail/.test(d('exit-fail')) && /always/.test(d('always')) && /after a turn/.test(d('idle')) && /on exit/.test(d('exit')) &&
      new Set(all).size === 5 && all.every((s) => /200 lines/.test(s)),
    JSON.stringify(all))
}

// M75 — composer.1–.4. THE COMPOSER'S PURE MODEL.
//     composer.1: a trigger is `@` or `/` at the start of the text or after
//     whitespace with the caret inside the token — `a/b`, an email, a caret
//     before the trigger are NOT triggers, or every path typed by hand opens
//     a list. composer.2: placeholders are unique names in first-seen order,
//     a hole with no value stays as typed (never blanked), and a name with a
//     space is literal text. composer.3: attachment kinds by extension.
//     composer.4: file completions filter by prefix, directories first with a
//     trailing slash, capped with a remainder count.
{
  const T = typeof R.triggerAt === 'function' ? R.triggerAt : () => 'missing'
  const at = (text, caret) => T(text, caret === undefined ? text.length : caret)
  const cases = {
    atStart: at('@ser'), afterSpace: at('look at @src/ser'), slashStart: at('/rev'), slashAfterSpace: at('please /rev'),
    inPath: at('a/b'), email: at('mail me@x'), caretBefore: at('@ser', 0), mid: at('@server after', 4), closed: at('@server done'), justAt: at('@')
  }
  ok('composer.1 @ and / open a completion only at a token start with the caret inside it; a/b, an email, a caret before the trigger and a finished token do not',
    cases.atStart && cases.atStart.kind === 'file' && cases.atStart.query === 'ser' && cases.atStart.start === 0 &&
      cases.afterSpace && cases.afterSpace.kind === 'file' && cases.afterSpace.query === 'src/ser' && cases.afterSpace.start === 8 &&
      cases.slashStart && cases.slashStart.kind === 'prompt' && cases.slashStart.query === 'rev' &&
      cases.slashAfterSpace && cases.slashAfterSpace.kind === 'prompt' &&
      cases.inPath === null && cases.email === null && cases.caretBefore === null && cases.closed === null &&
      cases.mid && cases.mid.query === 'ser' && cases.justAt && cases.justAt.query === '',
    JSON.stringify(cases))
  const apply = typeof R.applyCompletion === 'function' ? R.applyCompletion : () => null
  const a1 = apply('look at @src/ser and', 8, 16, '@src/server.ts')
  ok('composer.1b applying a completion replaces the token from its start to the caret and puts the caret after the replacement',
    a1 && a1.text === 'look at @src/server.ts and' && a1.caret === 22, JSON.stringify(a1))
  const ph = typeof R.placeholders === 'function' ? R.placeholders : () => null
  const fill = typeof R.fillPlaceholders === 'function' ? R.fillPlaceholders : () => null
  const body = 'review {{selection}} in {{cwd}} then {{selection}} — not {{a name}} and {{ }}'
  const names = ph(body)
  const filled = fill(body, { selection: 'foo', cwd: '/r' })
  ok('composer.2 placeholders are unique names in first-seen order, a hole with no value stays as typed, and a name with a space is literal',
    Array.isArray(names) && names.join(',') === 'selection,cwd' &&
      filled === 'review foo in /r then foo — not {{a name}} and {{ }}' &&
      fill('{{x}}', {}) === '{{x}}' && fill('{{x}}', { x: '' }) === '{{x}}' && ph('plain').length === 0,
    JSON.stringify({ names, filled }))
  const kind = typeof R.attachmentKind === 'function' ? R.attachmentKind : () => null
  const media = typeof R.imageMediaType === 'function' ? R.imageMediaType : () => null
  ok('composer.3 png, jpg, jpeg, gif and webp are images with their media types; everything else is a file',
    kind('a.PNG') === 'image' && kind('b.jpeg') === 'image' && kind('c.webp') === 'image' && kind('d.gif') === 'image' &&
      kind('e.ts') === 'file' && kind('f') === 'file' && kind('g.svg') === 'file' &&
      media('a.jpg') === 'image/jpeg' && media('a.png') === 'image/png' && media('a.ts') === null,
    JSON.stringify([kind('a.PNG'), kind('g.svg'), media('a.jpg')]))
  const comp = typeof R.fileCompletions === 'function' ? R.fileCompletions : () => null
  const entries = [{ name: 'server.ts', kind: 'file' }, { name: 'src', kind: 'dir' }, { name: 'scripts', kind: 'dir' }, { name: 'README.md', kind: 'file' }, { name: 'shared', kind: 'symlink' }]
  const rows = comp(entries, 's', 3)
  ok('composer.4 file completions filter by prefix (case-insensitive), put directories first with a trailing slash, and cap with a remainder count',
    rows && rows.rows.length === 3 && rows.rows[0].label === 'scripts/' && rows.rows[1].label === 'src/' && rows.rows[2].label === 'server.ts' &&
      rows.more === 1 && comp(entries, 'zz', 3).rows.length === 0 && comp(entries, 'zz', 3).more === 0,
    JSON.stringify(rows))
}

// M63 — state.1/.2/.3. THE ONE VOCABULARY. Every combination of kind, status,
//     dormancy and agent state yields a word from the closed vocabulary and a
//     tone from the closed tone set (state.1); no renderer file outside
//     panel-state.ts spells a state word as a display literal (state.2 — the
//     drift this milestone exists to end arrived one word at a time, each
//     file locally consistent); and railTail, now a wrapper, agrees with
//     panelState for every fixture the older checks use (state.3).
{
  const KINDS = ['terminal', 'review', 'file', 'note', 'toolbox', 'jira', 'chat', 'memory', 'github']
  const STATUSES = [undefined, { kind: 'idle' }, { kind: 'starting' }, { kind: 'running', pid: 4, command: '/bin/sh' }, { kind: 'exited', code: 0 }, { kind: 'exited', code: 1 }, { kind: 'error', message: 'spawn failed' }]
  const AGENTS = [undefined, 'starting', 'busy', 'idle', 'wants-you', 'exited']
  const WORDS = new Set(['asleep', 'not started', 'starting', 'running', 'working', 'idle', 'needs you', 'exited', 'review', 'file', 'note', 'toolbox', 'jira', 'memory', 'github'])
  const bad = []
  let count = 0
  for (const kind of KINDS) for (const status of STATUSES) for (const dormant of [false, true]) for (const agent of AGENTS) {
    const r = R.panelState({ kind, status, dormant }, agent)
    count += 1
    const wordOk = WORDS.has(r.word) || /^exited \d+$/.test(r.word) || (status && status.kind === 'error' && r.word === status.message)
    if (!wordOk || !R.TONES.includes(r.tone)) bad.push({ kind, status, dormant, agent, r })
  }
  const live = R.panelState({ kind: 'terminal', status: { kind: 'running', pid: 4, command: 'x' }, dormant: false }, 'wants-you')
  const asleep = R.panelState({ kind: 'terminal', status: { kind: 'idle' }, dormant: true }, 'busy')
  ok('state.1 every kind × status × dormancy × agent combination yields a vocabulary word and a closed-set tone',
    count === KINDS.length * STATUSES.length * 2 * AGENTS.length && bad.length === 0 &&
      live.word === 'needs you' && live.tone === 'needs-you' && asleep.word === 'asleep' && asleep.tone === 'asleep' &&
      R.panelState({ kind: 'terminal', status: { kind: 'exited', code: 0 }, dormant: false }, 'exited').word === 'exited 0',
    JSON.stringify({ count, bad: bad.slice(0, 3) }))

  const { readdirSync, statSync, readFileSync } = require('node:fs')
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : (/\.tsx?$/.test(p) ? [p] : []) })
  const LITERALS = ["'dormant'", "'not started'", "'needs you'", "'working'", "'asleep'", "'starting…'"]
  const offenders = []
  for (const file of walk(join(__dirname, '..', 'src', 'renderer'))) {
    if (file.endsWith('panel-state.ts')) continue
    // The diagnostics overlay prints the bundle's RAW field names (`dormant`
    // is the snapshot key check 112 pins) — a maintainer table, not the
    // display vocabulary.
    if (file.endsWith('DiagnosticsOverlay.tsx')) continue
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    for (const lit of LITERALS) if (text.includes(lit)) offenders.push(`${file.split('/src/renderer/')[1]}:${lit}`)
    // JSX text too — `>needs you<` is a display string with no quotes around
    // it, and the first cut of this pin missed exactly that in Dock.tsx.
    for (const m of text.matchAll(/>\s*(dormant|not started|needs you|working|asleep)\s*</g)) offenders.push(`${file.split('/src/renderer/')[1]}:>${m[1]}<`)
  }
  ok('state.2 no renderer file outside panel-state.ts spells a state word as a display literal',
    offenders.length === 0, offenders.join(', ') || 'clean')

  const fixtures = [[undefined, false, 'terminal'], [{ kind: 'idle' }, true, 'terminal'], [{ kind: 'starting' }, false, 'terminal'], [running(1, '/bin/sh'), false, 'terminal'], [{ kind: 'exited', code: 3 }, false, 'terminal'], [undefined, false, 'review'], [undefined, false, 'note'], [undefined, false, 'jira']]
  const agree = fixtures.every(([st, d, k]) => R.railTail(st, d, k) === R.panelState({ kind: k, status: st, dormant: d }, undefined).word)
  ok('state.3 railTail is panelState with no agent state, for every older fixture', agree)
}

// M64 — find.6. shortPath keeps the LAST segments, so the repository name
//     survives truncation (a path cut from the right is nine identical
//     characters of /private/var per row).
{
  const sp = typeof R.shortPath === 'function' ? R.shortPath : () => undefined
  ok('find.6 shortPath keeps the last two segments with a leading ellipsis and leaves short paths alone',
    sp('/Users/me/work/api') === '…/work/api' && sp('/tmp') === '/tmp' && sp('/a/b') === '/a/b' &&
      // macOS temp paths carry a one-letter `T` segment: never surface it.
      sp('/private/var/folders/hl/T/tc shot') === '…/tc shot' &&
      sp('/private/var/folders/x/T/tc shot fixtures/repo/') === '…/tc shot fixtures/repo' && sp('') === '',
    JSON.stringify([sp('/Users/me/work/api'), sp('/tmp'), sp('/a/b')]))
}

// M66 — labels.1/.2. EVERY CONTROL SAYS WHAT IT IS. Read as text, like
//     verify:styles: every <button in the renderer carries an aria-label, a
//     title, or visible text inside its element (labels.1); every element
//     that is an .icon-button carries an aria-label or a title on the SAME
//     element (labels.2). M61's critic had a category the dead-end audit
//     never had — "cannot identify" — and nine controls fell into it.
{
  const { readdirSync, statSync, readFileSync } = require('node:fs')
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.tsx') ? [p] : []) })
  const unlabelled = [], iconBare = []
  for (const file of walk(join(__dirname, '..', 'src', 'renderer'))) {
    const text = readFileSync(file, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    const rel = file.split('/src/renderer/')[1]
    // Attributes may contain `=>` (a shellControl spread); a `>` closes the
    // tag only when it is not an arrow's.
    for (const m of text.matchAll(/<button\b((?:=>|[^>])*?)>([\s\S]*?)<\/button>/g)) {
      const attrs = m[1], body = m[2]
      const named = /aria-label=|title=/.test(attrs)
      // A `{t.name}` / `{label}` expression is text a person reads too.
      const visibleText = /[A-Za-z…]{2,}/.test(body.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, (x) => (/['"`][A-Za-z…]{2,}|\.(name|label|title)\b|\b(label|title|name|text|word)\b/.test(x) ? 'text' : '')))
      if (!named && !visibleText) unlabelled.push(`${rel}: <button${attrs.trim().slice(0, 50)}`)
      if (/icon-button/.test(attrs) && !named) iconBare.push(`${rel}: <button${attrs.trim().slice(0, 50)}`)
    }
  }
  ok('labels.1 every <button in the renderer carries an aria-label, a title, or visible text', unlabelled.length === 0, unlabelled.join(' | ') || 'clean')
  ok('labels.2 every .icon-button carries an aria-label or a title on the same element', iconBare.length === 0, iconBare.join(' | ') || 'clean')
}

console.log('\n' + '='.repeat(60))
// M68 — context.1. THE DETAIL TAB REPEATS NOTHING. The pinned header shows
// the pid, so the field list must not; `asked for` earns its row only when
// it differs from the resolved command (an ABSENT spec always differs — the
// login-shell question check 21 protects keeps its answer). Pure, on the
// model's field list, so the view has one rule and the checks read it.
{
  const vf = R.visibleDetailFields
  const fields = [
    { key: 'command', label: 'command', value: '/bin/zsh' },
    { key: 'spec-command', label: 'asked for', value: '/bin/zsh' },
    { key: 'cwd', label: 'cwd', value: '/tmp' },
    { key: 'pid', label: 'pid', value: '123' },
    { key: 'font-size', label: 'font size', value: '13 (default)' }
  ]
  const same = typeof vf === 'function' ? vf(fields).map((f) => f.key) : null
  const sameLabel = typeof vf === 'function' ? vf(fields).find((f) => f.key === 'command')?.label : null
  const differ = typeof vf === 'function' ? vf(fields.map((f) => f.key === 'spec-command' ? { ...f, value: 'nothing — main chose the login shell' } : f)).map((f) => f.key) : null
  ok('context.1 the visible Detail fields drop pid and drop asked-for only when it equals the command, in order',
    same !== null && JSON.stringify(same) === JSON.stringify(['command', 'cwd', 'font-size']) &&
      sameLabel === 'command · as asked' &&
      differ !== null && JSON.stringify(differ) === JSON.stringify(['command', 'spec-command', 'cwd', 'font-size']),
    JSON.stringify({ same, sameLabel, differ }))
}

// M68 — context.5. THE PERMISSIONS LINE'S ARMS: no rules anywhere, else the
// buckets that are non-zero, counted across only the files that carry any.
{
  const pl = R.permissionsLine
  const none = typeof pl === 'function' ? pl([{ path: '/a', scope: 'project', allow: 0, deny: 0, ask: 0, additionalDirectories: 0 }]) : null
  const some = typeof pl === 'function' ? pl([
    { path: '/a', scope: 'project', allow: 2, deny: 0, ask: 1, additionalDirectories: 0 },
    { path: '/b', scope: 'user', allow: 1, deny: 1, ask: 0, additionalDirectories: 0 },
    { path: '/c', scope: 'local', allow: 0, deny: 0, ask: 0, additionalDirectories: 0 }
  ]) : null
  ok('context.5 the permissions line says none, or the non-zero buckets across the files that carry rules',
    none === 'no permission rules in this directory' && some === '3 allow · 1 deny · 1 ask in 2 files',
    JSON.stringify({ none, some }))
}
// M84 — watch-words.1. THE TRIGGER VOCABULARY, and the palette's parse of it.
//      One table for the phrase every surface says (a second copy is exactly
//      the drift `trigger-words.ts` exists to prevent), and a parse that
//      REFUSES what it does not understand: a guess arms a real command
//      against a path that does not exist, and the user finds out by watching
//      it never run. `after this passes` is the milestone's headline sentence
//      and is only reachable when a source panel is selected.
{
  const W = R
  const src = { id: 'n3', label: 'tests' }
  const words = {
    path: W.triggerWord({ kind: 'path', path: '/repo/src/' }),
    git: W.triggerWord({ kind: 'git-ref', root: '/repo' }),
    timer: W.triggerWord({ kind: 'timer', everyMs: 90000 }),
    panelBare: W.triggerWord({ kind: 'panel', sourceId: 'n3', on: 'exit-ok' }),
    panelLabelled: W.triggerWord({ kind: 'panel', sourceId: 'n3', on: 'exit-ok' }, 'tests')
  }
  const parse = (t, source) => W.parseTriggerWords(t, '/repo', source)
  const parsed = {
    dir: parse('src'),
    absolute: parse('/elsewhere/pkg'),
    dotted: parse('./src'),
    timer: parse('every 10m'),
    bareTimer: parse('10m'),
    seconds: parse('every 30s'),
    branch: parse('branch'),
    tooFast: parse('every 1s'),
    typo: parse('evry 10m'),
    afterNoSource: parse('after this passes'),
    after: parse('after this passes', src),
    afterFails: parse('when this fails', src),
    afterTurn: parse('after this finishes', src),
    afterNonsense: parse('after this thing', src)
  }
  ok('watch-words.1 the trigger phrase comes from one table (and takes a panel LABEL when the canvas has one); the palette parses a path, a timer and a branch, refuses a timer below the floor and an `every` typo rather than reading it as a path, and reads `after this passes` only when a source panel is selected',
    /on a change in src$/.test(words.path) && words.git === 'when the branch moves' &&
      words.timer === 'every 1m 30s' && /n3/.test(words.panelBare) && /tests exits 0/.test(words.panelLabelled) &&
      parsed.dir.kind === 'path' && parsed.dir.path === '/repo/src' &&
      parsed.absolute.path === '/elsewhere/pkg' && parsed.dotted.path === '/repo/src' &&
      parsed.timer.everyMs === 600000 && parsed.bareTimer.everyMs === 600000 && parsed.seconds.everyMs === 30000 &&
      parsed.branch.kind === 'git-ref' && parsed.tooFast === null && parsed.typo === null &&
      parsed.afterNoSource === null &&
      parsed.after.kind === 'panel' && parsed.after.on === 'exit-ok' && parsed.after.sourceId === 'n3' &&
      parsed.afterFails.on === 'exit-fail' && parsed.afterTurn.on === 'idle' && parsed.afterNonsense === null,
    JSON.stringify({ words, parsed }))
}

// M89 — integrations.1. THE PAGE'S MODEL, pure. One row per DECLARED
//      service whether or not a credential exists (a service that vanished
//      from the page would read as unsupported); three closed states, and
//      the durable rejection mark outranks a verified date — a token that
//      verified last week and was rejected today is rejected; the audit rows
//      under a service are its own, newest first, capped, with a refusal
//      marked rather than dropped.
{
  const build = typeof R.buildIntegrationRows === 'function' ? R.buildIntegrationRows : null
  const services = [{ id: 'github', label: 'GitHub', help: '' }, { id: 'jira', label: 'Jira', help: '' }]
  const metas = [
    { service: 'github', label: 'octocat', addedAt: '2026-09-01', verifiedAt: '2026-09-01T10:00:00Z', rejectedAt: '2026-09-04T09:00:00Z' },
    { service: 'jira', label: 'me@acme.test', addedAt: '2026-09-02', verifiedAt: '2026-09-02T10:00:00Z' }
  ]
  const audit = []
  for (let i = 0; i < 30; i += 1) audit.push({ at: 1000 + i, service: 'github', method: 'GET', path: `/p${i}`, status: i === 29 ? 0 : 200, bytes: 10, panelId: 'n1', ...(i === 29 ? { reason: 'not connected' } : {}) })
  audit.push({ at: 5000, service: 'jira', method: 'POST', path: '/issue/X/comment', status: 201, bytes: 3 })
  const rows = build ? build(services, metas, audit.slice().reverse(), 20) : null
  const gh = rows ? rows.find((r) => r.id === 'github') : undefined
  const jira = rows ? rows.find((r) => r.id === 'jira') : undefined
  const none = build ? build(services, [], [], 20) : null
  // A token added and never verified is its own state, never `connected as`.
  const stored = build ? build(services, [{ service: 'github', label: 'GitHub', addedAt: '2026-09-04' }], [], 20) : null
  const gs = stored ? stored.find((r) => r.id === 'github') : undefined
  ok('integrations.1 one row per declared service; a rejection mark outranks a verified date and offers Reconnect; a verified credential reads connected as its label and offers Verify; no credential reads not connected and offers Connect; the audit rows under a service are its own, newest first, capped, a refusal marked',
    rows !== null && rows.length === 2 &&
      gh && gh.state === 'rejected' && /token rejected/.test(gh.sentence) && gh.verb === 'reconnect' && gh.rows.length === 20 && gh.rows[0].at === 1029 && gh.rows[0].status === 0 && gh.rows.every((r) => r.service === 'github') &&
      jira && jira.state === 'connected' && jira.who === 'me@acme.test' && /connected as me@acme\.test/.test(jira.sentence) && jira.verb === 'verify' && jira.rows.length === 1 &&
      none && none.length === 2 && none.every((r) => r.state === 'not-connected' && /not connected/.test(r.sentence) && r.verb === 'connect' && r.rows.length === 0) &&
      gs && gs.state === 'stored' && /not verified/.test(gs.sentence) && gs.verb === 'verify' && !/connected as/.test(gs.sentence),
    JSON.stringify({ gh: gh && { state: gh.state, sentence: gh.sentence, verb: gh.verb, n: gh.rows.length, first: gh.rows[0] }, jira: jira && { state: jira.state, sentence: jira.sentence, verb: jira.verb }, none: none && none.map((r) => [r.id, r.state, r.verb]) }))
}

// M98 — grant.1. The inspector's `Session grants` field on a chat: three
// arms — none, the tools with a Revoke verb, and codex's named reason on a
// disabled control (it cannot ask, so it cannot be granted).
{
  const chat = (over = {}) => ({ kind: 'chat', rect: { id: 'c1', x: 0, y: 0, w: 1, h: 1 }, z: 1, chat: { cwd: '/r', sessionId: 'u', ...over } })
  const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  const base = { state: { status: 'ready', pending: 0, hasHistory: true }, usage, turns: 2 }
  const none = R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, { ...base, grants: [] })
  const some = R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, { ...base, grants: ['Bash', 'Edit'] })
  const codex = R.buildInspectorModel(chat({ backend: 'codex' }), undefined, undefined, [], undefined, undefined, undefined, false, { ...base, grants: [] })
  const unknown = R.buildInspectorModel(chat(), undefined, undefined, [], undefined, undefined, undefined, false, base)
  ok('grant.1 the chat inspector model carries a grants field: `none` with Revoke disabled by name, the tool list with Revoke enabled, codex\'s named reason (sandbox policy) on a disabled control, and `unknown` before main has answered — never a missing field',
    none.grants !== undefined && none.grants.kind === 'none' && none.grants.revoke.enabled === false && /nothing/.test(none.grants.revoke.reason) &&
      some.grants.kind === 'some' && some.grants.tools.join(',') === 'Bash,Edit' && some.grants.revoke.enabled === true &&
      codex.grants.kind === 'cannot' && /codex/.test(codex.grants.reason) && /sandbox/.test(codex.grants.reason) && codex.grants.revoke.enabled === false &&
      unknown.grants.kind === 'unknown',
    JSON.stringify({ none: none.grants, some: some.grants, codex: codex.grants, unknown: unknown.grants }))
}

// M105 — lastline.1. THE RAIL SAYS WHAT IS HAPPENING: a chat row carries the
// agent's LAST LINE SAID (the transcript's last complete text block, one line,
// cut from the right — prose, not a path) and an UNREAD mark when its turn
// ended while the user was elsewhere; a terminal row carries neither (its
// scrollback is not a conversation); the capsules count quiet and live.
{
  const has = typeof R.lastLineOf === 'function' && typeof R.railCapsules === 'function'
  const one = has ? R.lastLineOf('It exports `start` and `health`.\nWant me to wire `/health` to it?') : null
  const long = has ? R.lastLineOf('x'.repeat(200)) : null
  const empty = has ? R.lastLineOf('   \n') : null
  const caps = has ? R.railCapsules([
    { id: 'c1', kind: 'chat', state: { kind: 'chat', status: undefined, dormant: false, chat: { status: 'streaming', pending: 0 } } },
    { id: 'c2', kind: 'chat', state: { kind: 'chat', status: undefined, dormant: false, chat: { status: 'ready', pending: 0 } } },
    { id: 'c3', kind: 'chat', state: { kind: 'chat', status: undefined, dormant: false, chat: { status: 'not-started', pending: 0, hasHistory: true } } },
    { id: 'n1', kind: 'terminal', state: { kind: 'terminal', status: { kind: 'running', pid: 1, command: 'sh', cwd: '/', reattached: false }, dormant: false } }
  ]) : null
  ok('lastline.1 lastLineOf takes the LAST non-empty line of the last answer, ellipsised from the right past the cap, and is empty for nothing; railCapsules counts a streaming chat as live and a ready or asleep one as quiet, and a terminal in neither',
    has && one === 'Want me to wire /health to it?' /* M178 (F.14): the fences are stripped — lastline.2 */ && typeof long === 'string' && long.length < 120 && /…$/.test(long) && empty === '' &&
      caps !== null && caps.live === 1 && caps.quiet === 2 && /1 live/.test(caps.liveWord) && /2 quiet/.test(caps.quietWord),
    JSON.stringify({ one, longLen: long && long.length, empty, caps }))
}

// M107 — header.1. THE THREAD HEADER reads on from the mark: folder · branch ·
// engine · model, each absent piece simply absent — never `undefined`, never
// a placeholder that reads as a value.
{
  const has = typeof R.chatHeaderLine === 'function'
  const full = has ? R.chatHeaderLine({ cwd: '/home/u/work/api', branch: 'main', backend: 'claude', model: 'claude-opus-5' }) : null
  const bare = has ? R.chatHeaderLine({ cwd: '/home/u/work/api', backend: 'claude' }) : null
  const root = has ? R.chatHeaderLine({ cwd: '/', backend: 'codex' }) : null
  ok('header.1 the chat header line is `api · main · claude · claude-opus-5` with every piece present, `api · claude` with only the folder and engine, and never spells undefined',
    has && full === 'api · main · claude · claude-opus-5' && bare === 'api · claude' && typeof root === 'string' && !/undefined/.test(root) && /codex/.test(root),
    JSON.stringify({ full, bare, root }))
}

// M116 — board.1. THE WORK CARD'S STATE WORD COMES FROM DATA. The `work`
// arm of panel-state.ts speaks the ITEM's state — the one kind whose word is
// neither its kind nor a process's — and each of the four words maps to an
// EXISTING tone (todo→kind, working→working, review→starting, done→idle), so
// no stylesheet rule and no token is new for it. The words are read off
// `WORK_ITEM_STATES` by index here, never spelled: `state.2` forbids the
// `'working'` literal outside panel-state.ts, and this check obeys the same rule so a
// renamed state fails it loudly instead of passing on a stale string. The
// drop-target rule is data too: `USER_SET_STATES` is exactly two, both
// members of the four, and it is the list every column and every verb reads.
// The rail label is `work · <title>`, the title being what the mint stamped
// on the card from the item.
{
  try {
    const S = R.WORK_ITEM_STATES, U = R.USER_SET_STATES
    const has = Array.isArray(S) && S.length === 4 && Array.isArray(U)
    const expectTones = ['kind', 'working', 'starting', 'idle']
    const arms = has ? S.map((state, i) => { const r = R.panelState({ kind: 'work', status: undefined, dormant: false, work: { state } }, undefined); return { state, r, ok: r.word === state && r.tone === expectTones[i] } }) : []
    // With no item (the record dropped) the arm names its kind, like every document kind.
    const gone = has ? R.panelState({ kind: 'work', status: undefined, dormant: false }, undefined) : null
    const label = R.railLabel({ kind: 'work', rect: { id: 'k1', x: 0, y: 0, w: 1, h: 1 }, z: 1, title: 'Fix the thing', work: { itemId: 'wi-7' } }, undefined)
    const bare = R.railLabel({ kind: 'work', rect: { id: 'k2', x: 0, y: 0, w: 1, h: 1 }, z: 1, work: { itemId: 'wi-7' } }, undefined)
    ok('board.1 the work arm yields each of the four state words with its existing tone (kind/working/starting/idle) and `work` with tone kind when the item is gone; USER_SET_STATES is exactly two members of WORK_ITEM_STATES; the rail label is `work · <title>` and `work` for a card with no title',
      has && arms.length === 4 && arms.every((a) => a.ok) && R.TONES.includes(arms[0].r.tone) &&
        gone !== null && gone.word === 'work' && gone.tone === 'kind' &&
        U.length === 2 && U.every((u) => S.includes(u)) && U[0] === S[0] && U[1] === S[3] &&
        label === 'work · Fix the thing' && bare === 'work',
      JSON.stringify({ S, U, arms, gone, label, bare }))
  } catch (e) { ok('board.1 (threw)', false, String(e)) }
}

/* ---- M127: the Skills pane. The pane's columns over one inventory.
   Every check lands on the PURE model: the component owns only the tabs, the
   search box and the drag handlers. The three facts that fail silently if
   undone are the three the pane's promise rests on — a column that vanishes
   when it empties reads as a broken pane, a card that vanishes when its file
   is gone reads as a shelf a `git pull` edited, and an empty pane and "no
   skill matches zzzz" are different renderings that lead to different fixes. */
{
  try {
    const entries = [
      { kind: 'skill', scope: 'user', name: 'superpowers:brainstorming', description: 'd1',
        resources: { kind: 'none' }, pluginId: 'superpowers@x' },
      { kind: 'skill', scope: 'project', name: 'audit', description: 'd2',
        resources: { kind: 'some', n: 3 } },
      { kind: 'command', scope: 'user', name: 'review', description: 'd3' }
    ]
    const shelf = { columns: [{ id: 'c1', title: 'mobile', keys: ['["project","audit"]'] }] }
    const cols = R.buildSkillColumns(entries, shelf, { kind: 'skill', query: '', scopes: null, placedOnly: false })

    ok('skills.1a only the asked KIND appears',
       cols.every((c) => c.cards.every((k) => k.name !== 'review')), 'a command is not a skill')
    ok('skills.1b a placed skill sits in its column and says `placed`',
       cols.find((c) => c.id === 'c1').cards[0].why === 'placed', '')
    ok('skills.1c a plugin skill derives its own column',
       cols.some((c) => c.id === 'plugin:superpowers'), cols.map((c) => c.id).join(','))
    ok('skills.1d Ungrouped is ALWAYS present, even when it holds nothing',
       cols.some((c) => c.id === R.UNGROUPED_COLUMN_ID),
       'a column that vanishes when empty reads as a broken pane')

    const shelfWithGhost = { columns: [{ id: 'c1', title: 'mobile', keys: ['["user","gone"]'] }] }
    const ghost = R.buildSkillColumns(entries, shelfWithGhost, { kind: 'skill', query: '', scopes: null, placedOnly: false })
    ok('skills.1e a key whose skill is gone KEEPS its slot, marked not installed',
       ghost.find((c) => c.id === 'c1').cards.some((k) => k.installed === false),
       'the shelf is the user arrangement; a git pull does not get to edit it')

    const none = R.buildSkillColumns(entries, shelf, { kind: 'skill', query: 'zzzz', scopes: null, placedOnly: false })
    // The SENTENCE too, not just the empty list: `[]` and the words the pane
    // paints over it are one decision, and a check on the list alone leaves
    // the half the user reads unpinned — which is how "no skill matches" and
    // "no skill in this directory" drift into each other.
    ok('skills.1f a search matching nothing yields NO columns AND the pane\'s own two sentences say which',
       none.length === 0 &&
       R.noMatchSentence('skill', 'zzzz') === 'no skill matches zzzz' &&
       R.noMatchSentence('agent', '') === 'no agent in this directory',
       JSON.stringify({ n: none.length, q: R.noMatchSentence('skill', 'zzzz'), empty: R.noMatchSentence('agent', '') }))

    const placed = R.buildSkillColumns(entries, shelf, { kind: 'skill', query: '', scopes: null, placedOnly: true })
    ok('skills.1g placedOnly hides derived cards but never the Ungrouped column',
       placed.every((c) => c.cards.every((k) => k.why === 'placed')) &&
       placed.some((c) => c.id === R.UNGROUPED_COLUMN_ID), JSON.stringify(placed.map((c) => c.id)))
    // M127 fix wave. Spec §3's "Ungrouped refuses deletion BY NAME" was
    // structural only: the column is always injected and its Delete is
    // disabled, and nothing pinned the sentence the user actually reads. A
    // refusal with no words is the failure this repo bans — a control that
    // is merely grey is indistinguishable from one that is broken — so the
    // sentence is an exported constant the pane renders and this asserts.
    ok('skills.1h Ungrouped refuses deletion in WORDS, and the pane and the check share the one sentence',
       R.UNGROUPED_DELETE_REASON === 'Ungrouped is where an unplaced card sits - it cannot be deleted',
       JSON.stringify({ reason: R.UNGROUPED_DELETE_REASON }))
  } catch (e) { ok('skills.1 (threw)', false, String(e)) }
}
  // M120 — header.2. A sandboxed chat's header says so where the folder
  // would be: `sandboxed · no folder`, never the app's own sandbox directory
  // name, which would read as a project the user never chose.
  {
    let line = null
    try { line = R.chatHeaderLine({ cwd: '/Users/u/Library/Application Support/terminal-canvas/sandbox/c9', backend: 'claude', sandbox: true }) } catch (e) { line = String(e) }
    ok('header.2 a sandboxed chat\'s header line reads `sandboxed · no folder · claude`, the sandbox directory never named',
      line === 'sandboxed · no folder · claude', JSON.stringify({ line }))
  }


// M137 — workflow.trigger.1 / workflow.fire.1. Two text pins on the workflow
// panel's blocked shape, deferred from the M126–M133 log's minors list.
// Both are the same fact reached from two doors: a template holding a
// `pool`/`orchestrator`/`collect` block (or a missing preset, or a cycle)
// cannot run, and Run is disabled with `templateRefusal`'s sentence — but
// Triggers was still ENABLED, so a person could arm a watcher whose every
// fire would instantiate nothing (the fire path never consulted the refusal),
// with the ledger recording a success. Pinned as text because the disabled
// state is a prop the component wires, and the fire path is a callback in
// Canvas.tsx that no pure model owns.
{
  const { readFileSync } = require('node:fs')
  const wf = readFileSync(join(__dirname, '..', 'src', 'renderer', 'workflow', 'WorkflowNode.tsx'), 'utf8')
  const triggers = wf.match(/verb\('triggers',[^\n]*/)
  ok('workflow.trigger.1 the Triggers verb is disabled with the same runReason Run is — a watcher armed on a blocked shape fires into a refusal',
    triggers !== null && /props\.runReason/.test(triggers[0]),
    triggers ? triggers[0].trim() : 'no Triggers verb found')
  const canvas = readFileSync(join(__dirname, '..', 'src', 'renderer', 'canvas', 'Canvas.tsx'), 'utf8')
  const start = canvas.indexOf('const runWorkflow = useCallback(')
  const body = start === -1 ? '' : canvas.slice(start, canvas.indexOf('}, [', start))
  ok('workflow.fire.1 runWorkflow consults templateRefusal before instantiating, so a fired trigger on a blocked template returns the refusal instead of minting nothing',
    body.includes('templateRefusal(') && body.indexOf('templateRefusal(') < body.indexOf('instantiateTemplateRef.current('),
    JSON.stringify({ found: start !== -1, consults: body.includes('templateRefusal(') }))
}


// M138 — pool.model.1. The Runs tab's pool rows are a PROJECTION of main's
// events and nothing else: queued keeps its slot when it starts, finished
// is found by worker id, a stop or a refusal ends `live` and carries main's
// reason, and the closing sentence names the three ways a pool ends.
{
  let st = R.EMPTY_POOL
  const step = (e) => { st = R.reducePool(st, e) }
  step({ kind: 'started', id: 'w1', item: 'a' })
  step({ kind: 'queued', item: 'b', reason: 'concurrency' })
  step({ kind: 'started', id: 'w2', item: 'b' })
  step({ kind: 'finished', id: 'w1' })
  const mid = st
  step({ kind: 'stopped', why: 'budget' })
  const ended = st
  const refused = R.reducePool(R.EMPTY_POOL, { kind: 'refused', why: 'could not read the work list: ENOENT' })
  const refusedThenStopped = R.reducePool(refused, { kind: 'stopped', why: 'by-hand' })
  const rerun = R.reducePool(ended, { kind: 'started', id: 'w9', item: 'z' })
  ok('pool.model.1 reducePool keeps a queued item in its slot when it starts, marks finished by worker id, ends live on stop/refusal with the reason (a stop after a refusal keeps the refusal), starts a new run clean after an end, and the closing words name the three ends',
    mid.live === true && mid.items.map((i) => i.item + ':' + i.state).join(',') === 'a:finished,b:started' && mid.items[1].id === 'w2' &&
      ended.live === false && ended.stopped === 'budget' && refused.live === false && /ENOENT/.test(refused.refused) &&
      refusedThenStopped.refused !== undefined && refusedThenStopped.stopped === undefined &&
      rerun.items.length === 1 && rerun.items[0].item === 'z' && rerun.live === true && rerun.stopped === undefined &&
      /by hand/.test(R.poolStoppedWord('by-hand')) && /every item/.test(R.poolStoppedWord('empty')) && /budget/.test(R.poolStoppedWord('budget')) &&
      typeof R.REASON_NO_POOL_LIVE === 'string',
    JSON.stringify({ mid, ended, refused }))
}

// M141 — holes.builtin.1–.3. BACKLOG #27's four placeholders as BUILT-IN
// holes: {{cwd}}, {{branch}}, {{selection}}, {{panel}} are filled from the
// TARGET panel before any question is asked and are never among the holes
// the palette asks for; a built-in with no value stays AS TYPED (M75's rule —
// a {{branch}} outside a repository stays visible rather than vanishing); an
// ordinary hole is untouched by the built-in fill and still asked.
{
  const R2 = R
  const has = typeof R2.fillBuiltIns === 'function' && Array.isArray(R2.BUILT_IN_HOLES) && typeof R2.askableHoles === 'function'
  const body = 'review {{selection}} in {{cwd}} on {{branch}} for {{panel}} — then {{ticket}}'
  const filled = has ? R2.fillBuiltIns(body, { cwd: '/w/repo', branch: 'main', selection: 'foo()', panel: 'api' }) : ''
  ok('holes.builtin.1 fillBuiltIns fills the four built-in holes from the target and leaves an ordinary hole for the question',
    has && filled === 'review foo() in /w/repo on main for api — then {{ticket}}',
    JSON.stringify({ has, filled }))
  const partial = has ? R2.fillBuiltIns(body, { cwd: '/w/repo', panel: 'api', selection: '' }) : ''
  ok('holes.builtin.2 a built-in with no value (absent, or an empty selection) stays as typed, never blanked',
    has && partial === 'review {{selection}} in /w/repo on {{branch}} for api — then {{ticket}}',
    JSON.stringify({ partial }))
  const asked = has ? R2.askableHoles(body) : null
  ok('holes.builtin.3 askableHoles lists only the holes a person is asked for — the four built-ins are never questions — and BUILT_IN_HOLES names exactly cwd, branch, selection, panel',
    has && Array.isArray(asked) && asked.join(',') === 'ticket' && [...R2.BUILT_IN_HOLES].sort().join(',') === 'branch,cwd,panel,selection',
    JSON.stringify({ asked, builtIns: R2.BUILT_IN_HOLES }))
}

// M142 — summary.history.1. The summary's `history` — this week's usage
// rows folded and PRICED by the same per-model rule the live totals use
// (an unpriceable model makes the figure undefined, never smaller) — has
// three states, never two: no rows (nothing ran this week), rows with no
// price (`unpriced`), and a figure with its session count. `historyWord`
// is the sentence the pane prints for each.
{
  const totals = (input, output) => ({ input, output, cacheWrite: 0, cacheRead: 0 })
  const has = typeof R.foldUsageHistory === 'function' && typeof R.historyWord === 'function'
  const rows = [
    { kind: 'usage', panelId: 'n1', byModel: { 'claude-sonnet-5': totals(1000, 100) }, turns: 3, endedAt: 5000 },
    { kind: 'usage', panelId: 'n2', byModel: { 'claude-sonnet-5': totals(500, 50) }, turns: 1, endedAt: 9000 }
  ]
  const priced = has ? R.foldUsageHistory(rows) : null
  const unpriced = has ? R.foldUsageHistory([...rows, { kind: 'usage', panelId: 'n3', byModel: { 'nobody-knows': totals(1, 1) }, turns: 1, endedAt: 1 }]) : null
  const none = has ? R.foldUsageHistory([]) : null
  ok('summary.history.1 foldUsageHistory sums tokens and prices per model across the rows (undefined when any model is unpriced), counts sessions, and historyWord names the three states',
    has && priced !== null && priced.sessions === 2 && priced.tokens === 1650 && typeof priced.costUsd === 'number' && priced.costUsd > 0 &&
      unpriced.sessions === 3 && unpriced.costUsd === undefined && none.sessions === 0 &&
      /nothing/.test(R.historyWord(none)) && /unpriced/.test(R.historyWord(unpriced)) && /\$/.test(R.historyWord(priced)) && /2 sessions/.test(R.historyWord(priced)),
    JSON.stringify({ has, priced, unpriced, none, words: has ? [R.historyWord(none), R.historyWord(unpriced), R.historyWord(priced)] : null }))
}

// M140 — toolbox.open.1 (backlog #26's write half beyond skills). Every
// toolbox row carries the FILE it came from (`sourcePath`, the same field the
// inventory already holds), so the node can open it in the file panel — M22's
// editor, the one write door every markdown and JSON file under `.claude`
// already had. A command, a subagent, a hook's settings file and an MCP
// server's config all open there; a skill keeps its own editor beside it. The
// path rides the row rather than being looked up again at click time, so the
// door and the row cannot name different files.
{
  const node = R.buildToolboxNodeModel({
    source: { cwd: '/repo', label: 'repo' },
    title: undefined,
    result: inventory({ entries: [
      { id: 'c1', kind: 'command', scope: 'project', sourcePath: '/repo/.claude/commands/greet.md', active: { kind: 'active' }, alsoDefinedIn: [], name: 'greet', description: 'says hi' },
      { id: 'm1', kind: 'mcp', scope: 'user', sourcePath: '/h/.claude.json', active: { kind: 'active' }, alsoDefinedIn: [], name: 'railway', transport: 'stdio', command: 'npx', argCount: 3, envKeys: [], envKeysOverflow: 0 },
      { id: 'h1', kind: 'hook', scope: 'user', sourcePath: '/h/.claude/settings.json', active: { kind: 'active' }, alsoDefinedIn: [], event: 'PreToolUse', matcher: 'Bash', matcherTruncated: false, index: 0, hookType: 'command', program: 'node guard.js', commandChars: 92 }
    ] })
  })
  const rows = node.groups.flatMap((g) => g.rows)
  const byName = (name) => rows.find((r) => r.name.includes(name))
  ok('toolbox.open.1 every toolbox row carries the sourcePath its entry came from — a command, an MCP server and a hook alike — so the node\'s Open door names the same file the inventory read',
    rows.length === 3 && byName('greet') && byName('greet').sourcePath === '/repo/.claude/commands/greet.md' &&
      byName('railway') && byName('railway').sourcePath === '/h/.claude.json' &&
      byName('PreToolUse') && byName('PreToolUse').sourcePath === '/h/.claude/settings.json',
    JSON.stringify(rows.map((r) => [r.name, r.sourcePath])))
}

// M149 — summary.history.2 (the audit's `runs` scene). The renderer's read
// of `ledger:usage` was never wired when M142 landed (a partial patch), so
// the summary's week line said `reading the ledger…` forever — the
// asked-but-unanswered rendering standing in for an answer, the very
// collapse the three-state rule exists to forbid. A read that REJECTS is a
// fourth arm with its own sentence, never the reading one.
{
  const failed = typeof R.historyWord === 'function' ? R.historyWord(null) : ''
  ok('summary.history.2 historyWord(null) — the ledger could not be read — is its own sentence, distinct from reading and from nothing',
    /could not be read/.test(failed) && !/reading/.test(failed) && !/nothing/.test(failed), JSON.stringify({ failed }))
}

// M149 — board.empty.1 (audit F.7). An empty board column is not a bare
// zero: a user-set column says it is a drop target, a runtime column names
// what sets it. Read as text (the pane renders the sentence directly).
{
  const { readFileSync } = require('node:fs')
  const src = readFileSync(join(__dirname, '..', 'src', 'renderer', 'shell', 'BoardPane.tsx'), 'utf8')
  ok('board.empty.1 an empty board column carries a sentence — a drop target for a user-set column, the runtime rule for working and review — under data-board-empty',
    /data-board-empty=\{state\}/.test(src) && /drop a card/.test(src) && /set when a dispatched lane starts/.test(src) && /set when a lane opens its pull request/.test(src),
    JSON.stringify({ attr: /data-board-empty/.test(src), words: [/drop a card/.test(src), /dispatched lane/.test(src), /pull request/.test(src)] }))
}

{
  const terminal = panel('context-terminal', { spec: { cwd: '/intended', args: [] } })
  const chat = panel('context-chat', { kind: 'chat', chat: { cwd: '/project', sessionId: 'fixture' } })
  const review = panel('context-review', { kind: 'review', subject: { repoRoot: '/review' } })
  const toolbox = panel('context-toolbox', { kind: 'toolbox', source: { cwd: '/tools' } })
  const dir = R.inspectionDirectory
  const sandboxed = { ...chat, chat: { ...chat.chat, sandbox: true } }
  ok('context.policy.1 chat inspection shares a cwd while terminal, review and toolbox policies retain their existing meaning',
    dir(chat, 'files').cwd === '/project' && dir(chat, 'tools').cwd === '/project' &&
    dir(terminal, 'files', '/live').cwd === '/live' && dir(terminal, 'files').cwd === '/intended' &&
    dir(terminal, 'tools', '/live').cwd === '/intended' && dir(review, 'files').cwd === '/review' &&
    dir(review, 'tools').kind === 'no-directory' && dir(toolbox, 'files').kind === 'no-directory' && dir(toolbox, 'tools').cwd === '/tools')
  ok('context.policy.2 no subject, sandbox, malformed, relative and missing cwd and non-directory kinds do not become project context',
    dir(undefined, 'files').kind === 'no-directory' &&
    dir(sandboxed, 'files').kind === 'absent' && /sandbox/i.test(dir(sandboxed, 'tools').reason) &&
    ['', '  ', undefined].every((cwd) => dir({ ...chat, chat: { cwd } }, 'files').kind === 'unavailable') &&
    // Both surfaces must refuse a relative cwd IDENTICALLY. Files used to
    // answer `known` for one and let main resolve it against ITS working
    // directory, painting a plausible basename over whatever that hit, while
    // Tools refused the same string.
    ['relative/path', './here', '../up'].every((cwd) =>
      ['files', 'tools'].every((surface) => dir({ ...chat, chat: { cwd } }, surface).kind === 'unavailable')) &&
    dir({ ...chat, chat: { cwd: '~/project' } }, 'files').cwd === '~/project' &&
    ['file', 'image', 'note', 'workflow', 'browser'].every((kind) => dir(panel('no-dir', { kind }), 'files').kind === 'no-directory'))
  // The spec's clause is that the three silences have DISTINCT explanations, so
  // the check compares the sentences and not only the arm names: collapsing
  // two of them into one string passed every assertion above.
  const reasons = [dir(sandboxed, 'files').reason, dir({ ...chat, chat: { cwd: '' } }, 'files').reason, dir({ ...chat, chat: { cwd: 'rel' } }, 'files').reason]
  ok('context.policy.3 a sandboxed conversation, an unrecorded directory and a relative one each get their own sentence, and a kind with no directory gets none — the surface names it',
    reasons.every((r) => typeof r === 'string' && r.trim().length > 0) && new Set(reasons).size === 3 &&
    dir(panel('no-dir', { kind: 'file' }), 'files').reason === undefined && dir(undefined, 'tools').reason === undefined,
    JSON.stringify(reasons))
  // M194. The structural claim, read as TEXT — the same shape
  // `verify:agent-session registry.1` uses for "no consumer switches on the
  // backend name". The pure policy above can be perfect while a consumer
  // quietly keeps its own copy, which is exactly what `skillsCwd` was doing
  // when this milestone started: a fourth hand-written copy that had already
  // drifted from the three it was supposed to agree with. Nothing else in the
  // suite can see a fifth one being added.
  const CONSUMERS = [
    ['src/renderer/canvas/useFileTree.ts', 'the Files pane'],
    ['src/renderer/canvas/useInspectorDetail.ts', "the inspector's Tools section"],
    ['src/renderer/canvas/usePaletteActions.ts', 'the Open toolbox verb'],
    ['src/renderer/canvas/Canvas.tsx', "the Skills pane's cwd"]
  ]
  const asks = CONSUMERS.filter(([f]) => /inspectionDirectory\(/.test(require('node:fs').readFileSync(join(__dirname, '..', ...f.split('/')), 'utf8')))
  ok('context.policy.4 every inspection consumer ASKS the one policy rather than keeping its own copy of the rule',
    asks.length === CONSUMERS.length,
    JSON.stringify({ asking: asks.map(([, w]) => w), missing: CONSUMERS.filter((c) => !asks.includes(c)).map(([, w]) => w) }))
  const failed = R.buildToolboxFields({ kind: 'unavailable', reason: 'Directory unavailable' })
  ok('context.tools.1 an unavailable inventory is visible with a named disabled detail action, never empty or loading',
    !failed.hidden && failed.summary === 'Directory unavailable' && failed.openReason === failed.summary && failed.rows.length === 0)
  const failedNode = R.buildToolboxNodeModel({ source: { cwd: '/repo', label: 'repo' }, title: undefined, result: { kind: 'unavailable', reason: 'the directory is no longer there' } })
  ok('context.tools.3 the toolbox NODE says an unavailable directory in main\'s own words, never `no directory` and never an empty inventory',
    failedNode.summary === 'toolbox unavailable' && failedNode.note === 'the directory is no longer there' && (failedNode.groups ?? []).length === 0,
    JSON.stringify({ summary: failedNode.summary, note: failedNode.note }))
  // M194. The arm above is reached by a POSITIVE test for `inventory`, not by
  // falling through — so a kind this build has no arm for (an older main, a
  // later arm) says so instead of throwing `undefined.entries` inside a
  // render. It is also what makes the check above red-first-able: with a
  // fall-through, deleting the `unavailable` arm ABORTED this suite on a
  // TypeError and every check below it never ran (docs/verify-suites.md).
  // CAUGHT, not called bare: without the guard this check exists for, the call
  // THROWS, and a throw here would abort the suite so that every check below it
  // never ran and this red would not be evidence (docs/verify-suites.md's first
  // rule — the same rule that found the defect in the first place).
  let future
  try { future = R.buildToolboxFields({ kind: 'not-a-kind-this-build-knows' }) } catch (e) { future = { threw: String(e) } }
  ok('context.tools.2 an inventory kind this build has no arm for is named, never a throw inside the section or an empty inventory',
    future.threw === undefined && !future.hidden && /shape this version does not know/.test(future.summary) && future.openReason === future.summary && future.rows.length === 0,
    JSON.stringify(future))
}

// M195 (D03) — preview.source.1. THE PREVIEW'S PROVENANCE, at the inspector's
//      own density layer. The pane says which FOLDER at the contextual layer;
//      the inspector is where the whole of it lives, and it is FOUR states
//      rather than two. A binding whose source panel is still open names it; a
//      binding whose source panel has been CLOSED keeps working and says the
//      panel is gone, which is the difference between a preview a person
//      trusts and one they think is broken; a binding with NO source panel (a
//      lineup's preview seat is born that way — a folder and no panel to name)
//      still gets words rather than a bare path; and a pane bound to nothing
//      says that NOTHING RELOADS IT, which is the claim the first cut of this
//      milestone got backwards (it said a change "reloads this pane for
//      nothing", which describes the behaviour M195 REMOVED — an unbound pane
//      does not reload at all, so binding turns reloading ON).
//      The url row is untouched: this ADDS provenance and replaces no identity.
//      Wrapped, because these three calls sit above the tally and a throw here
//      would print no tally at all (`docs/verify-suites.md` rule 1).
{
  const NAME = 'preview.source.1 the inspector\'s browser panel keeps its url and gains its preview source in four states, each a different sentence: bound with the source panel open (which it names), bound with the source panel closed (the folder still bound, and it says so), bound with no source panel at all (words, not a bare path), and not bound (which says nothing reloads this pane rather than claiming it reloads for nothing)'
  try {
    const bound = { rect: { id: 'bv1', x: 0, y: 0, w: 640, h: 480 }, z: 1, kind: 'browser', url: 'http://127.0.0.1:5173/', preview: { root: '/w/api', sourcePanelId: 'n1' } }
    const orphan = { ...bound, rect: { ...bound.rect, id: 'bv2' }, preview: { root: '/w/api', sourcePanelId: 'gone' } }
    const rootOnly = { ...bound, rect: { ...bound.rect, id: 'bv4' }, preview: { root: '/w/api' } }
    const unbound = { rect: { id: 'bv3', x: 0, y: 0, w: 640, h: 480 }, z: 1, kind: 'browser', url: 'http://127.0.0.1:5173/' }
    const source = panel('n1', { title: 'the api' })
    const field = (m, key) => m.fields.find((f) => f.key === key)
    const mBound = R.buildInspectorModel(bound, undefined, undefined, [bound, source])
    const mOrphan = R.buildInspectorModel(orphan, undefined, undefined, [orphan, source])
    const mRootOnly = R.buildInspectorModel(rootOnly, undefined, undefined, [rootOnly, source])
    const mUnbound = R.buildInspectorModel(unbound, undefined, undefined, [unbound, source])
    const lines = [field(mBound, 'preview-source'), field(mOrphan, 'preview-source'), field(mRootOnly, 'preview-source'), field(mUnbound, 'preview-source')]
    ok(NAME,
      lines.every((f) => f !== undefined && typeof f.value === 'string' && f.value.length > 0) &&
        new Set(lines.map((f) => f.value)).size === 4 &&
        field(mBound, 'url') !== undefined && field(mBound, 'url').value === 'http://127.0.0.1:5173/' &&
        /\/w\/api/.test(lines[0].value) && /the api/.test(lines[0].value) &&
        /\/w\/api/.test(lines[1].value) && /closed/.test(lines[1].value) &&
        /\/w\/api/.test(lines[2].value) && !/closed/.test(lines[2].value) && /[a-z]{3}/.test(lines[2].value.replace('/w/api', '')) &&
        /not bound/.test(lines[3].value) && /nothing reloads/.test(lines[3].value) && !/reloads this pane for nothing/.test(lines[3].value) &&
        // The pane's register: lowercase, no full stops (M194's C5).
        lines.every((f) => !/^[A-Z]/.test(f.value) && !f.value.endsWith('.')),
      JSON.stringify({ bound: lines[0], orphan: lines[1], rootOnly: lines[2], unbound: lines[3], url: field(mBound, 'url') }))
  } catch (e) {
    ok(NAME, false, 'threw: ' + String(e && e.message || e))
  }
}

const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
