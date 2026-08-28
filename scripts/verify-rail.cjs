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


console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
