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
  // @shared stays for the original reason: every @shared import reachable
  // from here is an `import type`, which esbuild erases before bundling —
  // and needing no alias YET is exactly the state verify-viewport.cjs was in
  // right up until the day it broke.
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
      && rows[0].label === 'toolbox: repo'
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
  const PROCESS_WORDS = ['not started', 'dormant', 'exited', 'pid ', 'starting']
  const SESSIONLESS = ['review', 'file', 'toolbox', 'jira']
  const tails = {}
  for (const k of SESSIONLESS) tails[k] = R.railTail(undefined, false, k)
  const bad = SESSIONLESS.filter((k) => PROCESS_WORDS.some((w) => tails[k].includes(w)))
  // Each kind must also be DISTINGUISHABLE — two kinds sharing one tail is the
  // copy-paste that produced this defect's sibling in inspector-fields.ts.
  const distinct = new Set(SESSIONLESS.map((k) => tails[k])).size === SESSIONLESS.length
  const terminalStillHonest = R.railTail(undefined, false, 'terminal') === 'not started'
  ok('kind-tail.1 every sessionless kind has its own tail and only terminal speaks of processes',
    bad.length === 0 && distinct && terminalStillHonest,
    JSON.stringify({ tails, bad, distinct, terminalStillHonest }))
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
    jira: R_.buildInspectorModel(mk('jira', { title: 'Jira tickets' }), undefined, undefined, []).kind
  }
  const allSelf = Object.entries(got).every(([k, v]) => k === v)
  ok('kind-tail.2 the inspector model reports every sessionless kind as itself',
    allSelf, JSON.stringify(got))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
