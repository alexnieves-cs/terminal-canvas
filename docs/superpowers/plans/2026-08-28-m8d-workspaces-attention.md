# M8d — Workspaces and Attention in the Rail: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the left rail its two remaining sections — a Workspaces list that
switches, creates, renames and deletes, and an Attention queue that navigates to
whoever is waiting — using only verbs that already exist.

**Architecture:** One new pure module (`renderer/shell/rail-sections.ts`) holds
the waiting-count derivation, the two row builders and their two signatures; it
joins `rail-rows.ts` and `inspector-fields.ts` in the plain-node `verify:rail`
tier. `palette/commands.ts` is switched to call the shared count so there is one
derivation rather than two. `SideRail.tsx` grows two sections around the panel
outline; a new `RailWorkspaceRow.tsx` renders a workspace row's three sibling
controls; attention rows are rendered inline because every one of them is
`wants-you` by construction and needs no `useAgentState` subscription.
`Canvas.tsx` freezes both new arrays on their signatures beside `railRows`.

**Tech Stack:** TypeScript, React 18 (no StrictMode), Electron, plain-CJS verify
scripts driven by `esbuild` + `node`, and real-Electron verify scripts driven by
`executeJavaScript` / `sendInputEvent`.

**Spec:** `docs/superpowers/specs/2026-08-27-m8-app-shell-design.md`, § *M8d —
Workspaces and attention in the rail* (amended 2026-08-28). Read that section
before starting; every decision below argues from it.

## Global Constraints

Copied from the spec and from `CLAUDE.md`. Every task's requirements implicitly
include this section.

- **M8d adds NO verb and NO IPC channel.** Every callback comes off
  `CanvasActions` (`switchWorkspace`, `beginCreateWorkspace`,
  `beginRenameWorkspace`, `deleteWorkspace`, `goToPanel`). `verify:ipc` stays at
  **26** channels. If you find yourself adding a channel, stop — the answer is
  already in the renderer.
- **`registry.dispose` keeps exactly 5 call sites in `Canvas.tsx` and
  `bridge.pty.kill` keeps exactly 2 callers in `session-registry.ts`.**
  `verify:panels` check 94 pins both by reading the source text. M8d must leave
  both numbers untouched; a rail control that disposed anything directly would
  move them.
- **Every shell control mounts `shellControl(...)`.** No exceptions. It is what
  stops DOM focus leaving xterm's hidden textarea.
- **Rename and delete route into the palette's input mode**, by calling the
  existing `CanvasActions` members. The shell owns no modality and adds no
  confirm of its own.
- **The attention section never acknowledges.** Clicking a row calls
  `goToPanel` and nothing else. Focus stays the renderer's single
  acknowledgement trigger; main stays the sole author of the state.
- **`waiting` stays a NUMBER on the row data and is composed into text by the
  view.** Never build a display string in the pure module and never splice a
  count into anything a matcher scans — `verify:palette` 64 pins that rule for
  the palette's own row and it holds here for the same reason.
- **A check that THROWS aborts the whole run** (`CLAUDE.md`, "A check that
  THROWS aborts the run"). These suites have no per-check isolation. The RED
  steps below are therefore written so the new checks fail *behaviourally*
  rather than by `TypeError`, and each RED step states the exact expected
  failure count.
- **Verify command:** `npm run verify` must be green before the milestone is
  claimed done. Individual suites while iterating: `npm run verify:rail`,
  `npm run verify:palette`, `npm run build && npm run verify:panels`.
- **Comments explain *why*.** Match the surrounding density. A non-obvious line
  with no reason attached will be "fixed" by someone later.

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/shell/rail-sections.ts` **(new)** | The pure half of both new sections: `waitingCount`, `buildWorkspaceRows`, `workspaceSignature`, `buildAttentionRows`, `attentionSignature`. No React, no DOM, both imports `import type`. |
| `src/renderer/shell/RailWorkspaceRow.tsx` **(new)** | One workspace row: switch / rename / delete as three sibling controls. `memo`'d. |
| `src/renderer/shell/SideRail.tsx` | Grows the Workspaces and Attention sections around the existing Panels section. |
| `src/renderer/palette/commands.ts` | Loses its inline waiting-count expression, gains the shared import. |
| `src/renderer/canvas/Canvas.tsx` | Builds and freezes the two new arrays; passes them and five callbacks to `SideRail`. |
| `src/renderer/styles.css` | Rail becomes a flex column; new classes for the section header action, the empty state, the waiting count and the rename control. |
| `scripts/rail-entry.cjs` | Adds `rail-sections` to the plain-node bundle. |
| `scripts/verify-rail.cjs` | Checks 28–36b. |
| `scripts/verify-palette.cjs` | Comment correction only — its `@renderer` alias stops being pre-emptive. |
| `scripts/verify-panels.cjs` | Checks 95–98. |
| `README.md`, `CLAUDE.md` | The milestone row and the verify-table entries. |

---

### Task 1: `rail-sections.ts` — one waiting count, and the workspace rows

**Files:**
- Create: `src/renderer/shell/rail-sections.ts`
- Modify: `scripts/rail-entry.cjs`
- Modify: `scripts/verify-rail.cjs` (append checks 28–33 before the summary block)
- Modify: `src/renderer/palette/commands.ts` (the inline count at the `--- Workspaces ---` block)
- Modify: `scripts/verify-palette.cjs` (the alias comment)

**Interfaces:**
- Consumes: `WorkspaceRow` from `@shared/ipc-contract` (`{ id, name, panelIds: string[], active: boolean }`), type-only.
- Produces, for Tasks 2–4:
  - `waitingCount(panelIds: readonly string[], attentionIds: readonly string[]): number`
  - `interface RailWorkspace { id: string; name: string; panels: number; waiting: number; active: boolean }`
  - `buildWorkspaceRows(workspaces: readonly WorkspaceRow[], attentionIds: readonly string[]): RailWorkspace[]`
  - `workspaceSignature(rows: readonly RailWorkspace[]): string`

- [ ] **Step 1: Add the module to the plain-node bundle**

The checks cannot load an export from a file the bundle never requires. Edit
`scripts/rail-entry.cjs` — replace its whole contents with:

```js
/* Bundle entry for the shell's pure row modules. No React, no DOM, no native
   dependencies, so the suite runs under plain node — the cheapest tier this
   repo has. M8c's inspector rows and M8d's workspace and attention rows both
   joined this entry rather than getting suites of their own. */
module.exports = {
  ...require('../src/renderer/shell/rail-rows'),
  ...require('../src/renderer/shell/inspector-fields'),
  ...require('../src/renderer/shell/rail-sections')
}
```

- [ ] **Step 2: Create the module as deliberately-wrong stubs**

This is the RED-enabling step, and it is not busywork: `CLAUDE.md` records that
a `TypeError` from a missing export **ends the process where it stands**, so
every check written below it never runs and its RED is not evidence. Stubs that
return a typed-but-wrong value let all six new checks execute and fail for a
behavioural reason, which is the RED this task actually wants.

Create `src/renderer/shell/rail-sections.ts`:

```ts
import type { WorkspaceRow } from '@shared/ipc-contract'

export function waitingCount(
  _panelIds: readonly string[],
  _attentionIds: readonly string[]
): number {
  return -1 // STUB — replaced in step 5
}

export interface RailWorkspace {
  id: string
  name: string
  panels: number
  waiting: number
  active: boolean
}

export function buildWorkspaceRows(
  _workspaces: readonly WorkspaceRow[],
  _attentionIds: readonly string[]
): RailWorkspace[] {
  return [] // STUB — replaced in step 5
}

export function workspaceSignature(_rows: readonly RailWorkspace[]): string {
  return '' // STUB — replaced in step 5
}
```

- [ ] **Step 3: Write the failing checks**

Append to `scripts/verify-rail.cjs`, immediately **before** the
`console.log('\n' + '='.repeat(60))` summary block at the end of the file:

```js
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
//     An implementation reaching for attentionIds.length passes 28 and fails
//     here.
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
  ok('31 the waiting count is per workspace, not global',
    rows[0].waiting === 1 && rows[1].waiting === 0)
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
```

- [ ] **Step 4: Run the checks and watch them fail**

Run: `npm run verify:rail`

Expected: the run reaches the summary (no `TypeError`, nothing aborted) and
reports `29/35 passed` with `FAILED: 28, 29, 30, 31, 32, 33`. All six new
checks must appear in that list. If fewer than six are listed, something
aborted — fix that before continuing, because an unlisted check has not been
watched failing.

Note for the record: check 29's second clause (`waitingCount([], [...]) === 0`)
would pass against a stub returning `0`; the stub returns `-1` precisely so no
new check can go green for the wrong reason at this step.

- [ ] **Step 5: Write the real implementation**

Replace the whole of `src/renderer/shell/rail-sections.ts`:

```ts
import type { WorkspaceRow } from '@shared/ipc-contract'

/**
 * The rail's Workspaces and Attention sections, as plain data.
 *
 * Pure by construction — no React, no DOM, no registry reference — for the
 * same reason rail-rows.ts and palette/commands.ts are: it puts the pieces
 * most able to be subtly wrong in the cheapest verify tier the repo has. Both
 * of this file's imports are `import type` and esbuild erases them, so the
 * bundle still resolves no VALUE from @shared.
 *
 * It is a separate file from rail-rows.ts rather than an append to it because
 * that module's stated subject is the Panels section and its signature.
 */

/**
 * How many of one workspace's panels are waiting on the user.
 *
 * THE one derivation. palette/commands.ts computed this inline until M8d
 * (`w.panelIds.filter((id) => ctx.attentionIds.includes(id)).length`) and now
 * calls this instead, because two derivations of one number agree the day they
 * are written and drift the first time one is wrong — and the drift here is a
 * count on screen that no log explains. Same trade M8c made with isRunning,
 * which the inspector's summary and main's canvas:counts now share.
 *
 * The intersection is what does the work: an attention id this workspace does
 * not own contributes nothing, which covers a panel waiting in some other
 * canvas and a PHANTOM alike — an id whose panel is gone but whose agent state
 * survived the closure, the orphan reachableQueue drops at the head of the
 * jump queue.
 *
 * One honest limit, recorded so it is not later read as a bug: `panelIds`
 * comes from main's store, which saves on a 500ms coalescing debounce, so for
 * up to one debounce window a just-closed panel can still be listed here and a
 * phantom can still be counted. That is acceptable for a COUNT and would not
 * be for a navigation target — which is exactly why buildAttentionRows below
 * filters against the rendered panel rows instead.
 */
export function waitingCount(
  panelIds: readonly string[],
  attentionIds: readonly string[]
): number {
  const waiting = new Set(attentionIds)
  return panelIds.reduce((n, id) => (waiting.has(id) ? n + 1 : n), 0)
}

/**
 * One row of the Workspaces section.
 *
 * `waiting` is a NUMBER, deliberately, and the view composes it into text.
 * Building the string here would be the same mistake the palette declined when
 * it put the count on `Command.waiting` rather than in the row's title: a count
 * is transient state, not a name, and the moment it is baked into a string it
 * starts reaching things that scan strings.
 */
export interface RailWorkspace {
  id: string
  name: string
  panels: number
  waiting: number
  active: boolean
}

/** A view over main's own list, never a second source for it. */
export function buildWorkspaceRows(
  workspaces: readonly WorkspaceRow[],
  attentionIds: readonly string[]
): RailWorkspace[] {
  return workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    panels: w.panelIds.length,
    waiting: waitingCount(w.panelIds, attentionIds),
    active: w.active
  }))
}

/**
 * The same 60Hz defence railSignature provides, against a different volatile
 * input. There is no rect here; what churns is IDENTITY — reloadWorkspaces()
 * hands Canvas a brand-new array of brand-new objects on mount and on every
 * palette open — so without this the useMemo would hand SideRail a fresh array,
 * defeating its memo, for a reload that changed nothing.
 *
 * JSON.stringify over the ROWS, for both of railSignature's reasons: over the
 * rows, so "the signature covers exactly what a row renders" is structurally
 * true rather than dependent on someone remembering to add a field; and JSON
 * rather than `a + '|' + b`, because a workspace NAME is user text and an
 * ordinary separator is a field boundary a name is free to forge — freezing
 * the rail on stale rows for the users whose names happen to contain that
 * character and nobody else.
 *
 * The object literal in buildWorkspaceRows therefore has a load-bearing KEY
 * ORDER, the same way buildRailRows' does.
 */
export function workspaceSignature(rows: readonly RailWorkspace[]): string {
  return JSON.stringify(rows)
}
```

- [ ] **Step 6: Run the checks and watch them pass**

Run: `npm run verify:rail`
Expected: `35/35 passed`.

- [ ] **Step 7: Switch `commands.ts` to the shared count**

This is what makes step 5's "THE one derivation" comment true rather than
aspirational. In `src/renderer/palette/commands.ts`, add the import beside the
existing type-only ones near the top of the file:

```ts
import { waitingCount } from '@renderer/shell/rail-sections'
```

Then, in the `// --- Workspaces ---` block, replace this line:

```ts
    const waiting = w.panelIds.filter((id) => ctx.attentionIds.includes(id)).length
```

with:

```ts
    // The shared derivation, not a second copy of it — the rail's Workspaces
    // section renders the same number and must not compute it again.
    const waiting = waitingCount(w.panelIds, ctx.attentionIds)
```

- [ ] **Step 8: Correct the now-false comment in `verify-palette.cjs`**

Its alias block says commands.ts's "only import is its sibling
palette-model.ts" and calls the aliases pre-emptive. As of step 7 the
`@renderer` alias is load-bearing, and a comment claiming otherwise is exactly
the "confidently false why" this repo warns about. Replace lines 18–22 of
`scripts/verify-palette.cjs` (the comment immediately above `alias:`) with:

```js
  // @renderer became load-bearing in M8d: commands.ts imports the VALUE
  // waitingCount from shell/rail-sections so the palette and the rail share
  // one derivation of a workspace's waiting count. @shared is still
  // pre-emptive (every @shared import here is `import type`, which esbuild
  // erases) and stays for the reason verify-viewport.cjs learned the hard
  // way: needing no alias YET is exactly the state it was in until the day
  // panel-interaction.ts grew a real value import and the bundle broke.
```

- [ ] **Step 9: Run both suites and typecheck**

Run: `npm run typecheck && npm run verify:rail && npm run verify:palette`

Expected: typecheck clean; `35/35 passed` for rail; `71/71 passed` for palette
— **unchanged** from before this task. Check 64 in particular must still pass:
it pins that `waiting` reaches the row as a typed field and never enters the
haystack `fuzzyMatch` scans, and swapping the derivation must not have moved
that.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/shell/rail-sections.ts src/renderer/palette/commands.ts \
  scripts/rail-entry.cjs scripts/verify-rail.cjs scripts/verify-palette.cjs
git commit -m "feat(m8d): one waiting count, and the workspace rows built from it

commands.ts computed a workspace's waiting count inline; the rail is about
to render the same number, and a second copy of that expression would agree
today and drift the first time one of them was wrong. waitingCount moves
into shell/rail-sections.ts and commands.ts calls it — M8c's isRunning
trade applied to a second derived number.

Checks 28-33 in verify:rail. 32/33 are the 60Hz pair in the shape this
section needs them: there is no rect to move here, so what churns is
IDENTITY (reloadWorkspaces hands Canvas a fresh array on every palette
open) and the signature has to ignore it while still moving on a name, a
count and a waiting change.

verify-palette.cjs's alias comment stops being true with this commit: its
@renderer alias is now load-bearing rather than pre-emptive."
```

---

### Task 2: `buildAttentionRows` — the queue, its phantoms, and one label per panel

**Files:**
- Modify: `src/renderer/shell/rail-sections.ts`
- Modify: `scripts/verify-rail.cjs` (append checks 34–36b)

**Interfaces:**
- Consumes: `RailRow` from `./rail-rows` (`{ id, label, tail, dormant }`), type-only; `waitingCount` and friends from Task 1.
- Produces, for Task 4:
  - `interface RailAttention { id: string; label: string }`
  - `buildAttentionRows(queue: readonly string[], panelRows: readonly RailRow[]): RailAttention[]`
  - `attentionSignature(rows: readonly RailAttention[]): string`

- [ ] **Step 1: Add the stubs**

Same RED-enabling reason as Task 1 step 2. Append to
`src/renderer/shell/rail-sections.ts`:

```ts
import type { RailRow } from './rail-rows'

export interface RailAttention {
  id: string
  label: string
}

export function buildAttentionRows(
  _queue: readonly string[],
  _panelRows: readonly RailRow[]
): RailAttention[] {
  return [] // STUB — replaced in step 4
}

export function attentionSignature(_rows: readonly RailAttention[]): string {
  return '' // STUB — replaced in step 4
}
```

(Move the `import type { RailRow }` line up beside the existing
`import type { WorkspaceRow }` at the top of the file rather than leaving it
mid-file — TypeScript allows either, and imports mid-file read as an accident.)

- [ ] **Step 2: Write the failing checks**

Append to `scripts/verify-rail.cjs`, before the summary block:

```js
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
```

- [ ] **Step 3: Run the checks and watch them fail**

Run: `npm run verify:rail`

Expected: the run reaches the summary and reports `35/39 passed` with
`FAILED: 34, 35, 36, 36b`. All four must be listed.

- [ ] **Step 4: Write the real implementation**

In `src/renderer/shell/rail-sections.ts`, replace the two stubs from step 1
with:

```ts
/**
 * One row of the Attention section. No agent state field, because every row in
 * this section is `wants-you` by construction — that is what put it here.
 */
export interface RailAttention {
  id: string
  label: string
}

/**
 * The wants-you queue, filtered to panels that actually exist on this canvas.
 *
 * It takes the ALREADY-BUILT RailRow[] rather than the panel list, and that is
 * the load-bearing part of the signature: filtering the queue down to ids that
 * have a panel row IS reachableQueue's phantom filter, and reading the label
 * off that same row is what stops the two sections rendering two different
 * names for one panel. One lookup, both guarantees.
 *
 * Iterating the QUEUE and looking up the row — never iterating the rows and
 * testing membership — is what preserves entry order, longest-waiting first.
 * The other direction renders the canvas's order instead and looks entirely
 * correct until two agents ring in the wrong sequence.
 *
 * The phantom it drops is the one agent-state-store can legitimately hold: a
 * closed panel's state survives its closure, and under M6c's session.killed
 * guard nothing ever clears it — so an unfiltered section renders a row that
 * navigates nowhere, on a canvas with nothing to go to.
 *
 * Because it filters against the RENDERED panel rows rather than main's stored
 * panelIds, it is also strictly tighter than waitingCount above, which can lag
 * by one save debounce. A count may lag; a navigation target may not.
 */
export function buildAttentionRows(
  queue: readonly string[],
  panelRows: readonly RailRow[]
): RailAttention[] {
  const byId = new Map(panelRows.map((row) => [row.id, row]))
  const out: RailAttention[] = []
  for (const id of queue) {
    const row = byId.get(id)
    if (row !== undefined) out.push({ id, label: row.label })
  }
  return out
}

/**
 * Same defence, same means, as workspaceSignature above — and ORDER is part of
 * what it covers, because JSON.stringify over an array is order-sensitive and
 * two queues holding the same ids in a different sequence are different lists.
 * A signature blind to order would freeze the section on a stale sequence with
 * every id in it still correct, which is the hardest kind of wrong to see.
 */
export function attentionSignature(rows: readonly RailAttention[]): string {
  return JSON.stringify(rows)
}
```

- [ ] **Step 5: Run the checks and typecheck**

Run: `npm run typecheck && npm run verify:rail`
Expected: typecheck clean; `39/39 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shell/rail-sections.ts scripts/verify-rail.cjs
git commit -m "feat(m8d): the attention queue, its phantoms and its one label

buildAttentionRows takes the already-built RailRow[] rather than the panel
list, and that is the whole of its signature: filtering the queue to ids
that have a panel row IS reachableQueue's phantom filter, and reading the
label off that same row is what stops the two sections rendering two
different names for one panel.

It iterates the QUEUE and looks rows up, never the reverse — the other
direction renders the canvas's order instead of entry order and looks
correct until two agents ring in the wrong sequence. Check 34 pins both
halves; 35 uses a TITLED panel so a re-derived label would be visibly
wrong; 36 pins that the signature moves on an ORDER change, which is the
half a set-shaped implementation loses silently."
```

---

### Task 3: The Workspaces section on screen

**Files:**
- Create: `src/renderer/shell/RailWorkspaceRow.tsx`
- Modify: `src/renderer/shell/SideRail.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx` (the `railRows` memo block, and the `<SideRail .../>` element)
- Modify: `src/renderer/styles.css`
- Modify: `scripts/verify-panels.cjs` (checks 95, 95b, 96)

**Interfaces:**
- Consumes: `RailWorkspace`, `buildWorkspaceRows`, `workspaceSignature` from Task 1; `shellControl` from `./shell-control`; `CanvasActions`' `switchWorkspace`, `beginCreateWorkspace`, `beginRenameWorkspace`, `deleteWorkspace`.
- Produces, for Task 4: `SideRailProps` already carrying `workspaces` and the four workspace callbacks, so Task 4 only appends `attention`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, immediately **after** check 94's closing
`}` and **before** the `} catch (error) {` line:

```js
    // ---------------------------------------------------------------------
    // M8d — the rail's Workspaces and Attention sections.
    // ---------------------------------------------------------------------

    // Local helpers: panBy and agentStateOf are block-scoped to the M6c/M6d
    // block far above and are not reachable here.
    const railPan = (dx, dy) => wc.executeJavaScript(`
      document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, clientX: 700, clientY: 450,
        deltaX: ${dx}, deltaY: ${dy}, deltaMode: 0
      }))
      true
    `)
    const railAgentState = (id) => wc.executeJavaScript(
      `(() => { const el = document.querySelector('[data-panel-id=${JSON.stringify(id)}]')
                return el ? el.getAttribute('data-agent-state') : null })()`)
    const clickRail = (selector) => wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`)
    const activeWorkspaceId = () => wc.executeJavaScript(
      `window.canvas.workspace.list().then((r) => (r.find((w) => w.active) || {}).id)`)

    // 95. SWITCHING FROM THE RAIL IS THE SAME SWITCH, WITH THE SAME PIDS.
    //     Check 64 makes this claim for the palette's switcher and explains
    //     why the pid is the only observable that can make it: every other
    //     read — panel counts, the layout, the file on disk — stays green
    //     against an implementation that quietly disposes and respawns on
    //     switch, because a respawned agent is indistinguishable from a
    //     reattached one in anything that only counts. The rail is a SECOND
    //     door onto the same action, so it inherits the same obligation, and
    //     the spec's "the shell adds no second switching path" is precisely
    //     the claim this check tests.
    //
    //     The workspace ids are captured, never hardcoded: nextWorkspaceId()
    //     mints w<max+1> over whatever already exists and this suite has
    //     created and deleted several by now, so a literal here would be a
    //     guess — and a wrong guess is SILENT, since activate() on an unknown
    //     id returns null and changes nothing.
    const homeWorkspaceId = await activeWorkspaceId()
    {
      const before = await settledSessionMap(wc)
      await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('rail-away')`)
      await settle()
      const clicked = await clickRail(
        `.rail-row[data-rail-workspace=${JSON.stringify(homeWorkspaceId)}] .rail-row__main`)
      await settle()
      const landedOn = await activeWorkspaceId()
      const after = await settledSessionMap(wc)
      const { ok: preserved, changed } = pidsPreserved(before, after)
      ok('95 clicking a rail workspace row switches, keeping every pid',
        clicked === true && landedOn === homeWorkspaceId &&
          before.size > 0 && preserved,
        `clicked=${clicked} landed=${landedOn} before=${before.size} changed=[${changed.join(', ')}]`)
    }

    // 95b. The ACTIVE workspace's row is present and DISABLED, never absent.
    //      The rule verify:palette 60 already pins for the palette's own
    //      switch row, and it is the same argument check 31 makes there: a
    //      row that disappears is indistinguishable from a feature that is
    //      missing, and here it would also make the rail's list silently
    //      disagree with its own count of how many workspaces exist.
    {
      const state = await wc.executeJavaScript(`(() => {
        const row = document.querySelector(
          '.rail-row[data-rail-workspace=${JSON.stringify(homeWorkspaceId)}]')
        if (!row) return null
        const main = row.querySelector('.rail-row__main')
        return {
          present: true,
          disabled: main.disabled === true,
          canRename: row.querySelector('.rail-row__rename') !== null,
          canDelete: row.querySelector('.rail-row__close') !== null,
          tail: row.querySelector('.rail-row__tail').textContent
        }
      })()`)
      ok('95b the active workspace row is disabled, not absent, and still admin-able',
        state !== null && state.disabled === true &&
          state.canRename === true && state.canDelete === true &&
          /\d+ panel/.test(state.tail),
        JSON.stringify(state))
    }

    // 96. A HIDDEN WORKSPACE WITH A WAITING PANEL SAYS SO ON ITS RAIL ROW.
    //     70b's fixture reached from the new surface, and the strongest form
    //     of M6d's premise: an agent you cannot see because its whole CANVAS
    //     is hidden, not merely because it is off screen. It is also the one
    //     check that proves the two sections divide the question the way the
    //     spec says they do — Attention cannot name this panel (it is not on
    //     this canvas, and a row that navigates nowhere is worse than none),
    //     so the workspace row's count is the ONLY place the fact surfaces.
    {
      const BELL_LINE = "printf '\\007'\n"
      const waitroomId = await wc.executeJavaScript(
        `window.__m7aWorkspace().createAndSwitch('rail-waitroom')`)
      await settle()
      // A real shell, not Cmd+N's default `cat -v`: cat only ECHOES what it is
      // handed, so the escaped text never becomes a 0x07 byte and the check
      // could not pass against correct code. Same substitution 54-63, 70b and
      // 83 all make.
      const idsBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const panelId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore.includes(id)) || false
      }, 4000)
      if (!panelId) throw new Error('96: PRESET_SPAWN produced no new panel')
      const spawned = await waitUntil(
        async () => (await settledSessionMap(wc)).has(panelId), 8000)
      if (!spawned) throw new Error(`96: panel ${panelId} never got a PTY`)
      ptyManager.write(panelId, BELL_LINE)
      const rang = await waitUntil(
        async () => (await railAgentState(panelId)) === 'wants-you', 6000)
      if (rang !== true) throw new Error('96: the panel never reached wants-you')

      await wc.executeJavaScript(
        `window.__m7aWorkspace().switchTo(${JSON.stringify(homeWorkspaceId)})`)
      await settle()
      const tail = await wc.executeJavaScript(`(() => {
        const row = document.querySelector(
          '.rail-row[data-rail-workspace=${JSON.stringify(waitroomId)}]')
        return row ? row.querySelector('.rail-row__tail').textContent : null
      })()`)
      ok('96 a hidden workspace with a waiting panel says so on its rail row',
        tail !== null && tail.includes('1 waiting'), `tail=${JSON.stringify(tail)}`)
    }
```

- [ ] **Step 2: Run and watch the checks fail**

Run: `npm run build && npm run verify:panels`

Expected: `FAILED: 95, 95b, 96` and a total of `107/110 passed`. All three must
be listed and the run must reach the summary. `clickRail` returns `false`
rather than throwing when the selector matches nothing, and the tail reads are
guarded with `row ? ... : null`, which is what keeps a missing element from
aborting the run and taking the other two REDs with it (`CLAUDE.md`, "A check
that THROWS aborts the run").

Note: 96 still calls `throw` for its *fixture* failures (no panel, no PTY, no
bell). That is deliberate and matches 70b — a fixture that did not build is not
a finding about the rail, and reporting it as one would be worse than stopping.

- [ ] **Step 3: Write the workspace row component**

Create `src/renderer/shell/RailWorkspaceRow.tsx`:

```tsx
import { memo, type JSX } from 'react'
import type { RailWorkspace } from './rail-sections'
import { shellControl } from './shell-control'

export interface RailWorkspaceRowProps {
  row: RailWorkspace
  onSwitch: (id: string) => void
  onRename: (id: string, currentName: string) => void
  onDelete: (id: string, name: string, panelCount: number) => void
}

/**
 * One row of the Workspaces section.
 *
 * Three sibling controls, the shape RailPanelRow already uses and for the same
 * reason: nested interactive elements are invalid HTML and give the browser no
 * defensible answer about which one a click meant.
 *
 * The three callbacks are CanvasActions members passed straight through — no
 * adapters, no local state. A rail that reached into Canvas for its own copy of
 * "switch workspace" would be a second implementation of M7's transaction, and
 * the two would agree the day they were written; the spec calls this out as the
 * load-bearing decision of the whole milestone.
 *
 * Rename and delete route into the palette's input mode via those same
 * members, which is what preserves M7's destructive confirm and its rule that
 * the question names the agent count — Canvas recomputes that count honestly
 * against main's pty list before showing it, so this row is free to hand over
 * the PANEL count it has.
 *
 * The active row's switch is DISABLED rather than removed, the rule
 * verify:palette 60 pins for the palette's own switch row: a row that
 * disappears is indistinguishable from a feature that is missing. Its rename
 * and delete stay live, because deleting the workspace you are in is a
 * supported path (Canvas switches away before it removes).
 */
function RailWorkspaceRowImpl({
  row, onSwitch, onRename, onDelete
}: RailWorkspaceRowProps): JSX.Element {
  return (
    <li
      className={`rail-row${row.active ? ' rail-row--selected' : ''}`}
      data-rail-workspace={row.id}
    >
      <button
        type="button"
        className="rail-row__main"
        disabled={row.active}
        title={row.active ? 'Already the active workspace' : `Switch to ${row.name}`}
        {...shellControl(() => onSwitch(row.id))}
      >
        <span className="rail-row__label">{row.name}</span>
        {/*
          The count is composed HERE, never in rail-sections.ts. `waiting` is a
          number on the row for the same reason Command.waiting is a typed
          field in the palette: a count is transient state, not a name, and the
          moment it is baked into a string it starts reaching things that scan
          strings.
        */}
        <span className="rail-row__tail">
          {row.waiting > 0 && (
            <span className="rail-row__waiting">{row.waiting} waiting · </span>
          )}
          {row.panels} panel{row.panels === 1 ? '' : 's'}
        </span>
      </button>
      <button
        type="button"
        className="rail-row__rename"
        title={`Rename ${row.name}`}
        aria-label={`Rename ${row.name}`}
        {...shellControl(() => onRename(row.id, row.name))}
      >
        &#9998;
      </button>
      <button
        type="button"
        className="rail-row__close"
        title={`Delete ${row.name}`}
        aria-label={`Delete ${row.name}`}
        {...shellControl(() => onDelete(row.id, row.name, row.panels))}
      >
        &times;
      </button>
    </li>
  )
}

export const RailWorkspaceRow = memo(RailWorkspaceRowImpl)
```

- [ ] **Step 4: Add the section to `SideRail.tsx`**

Replace the whole of `src/renderer/shell/SideRail.tsx`:

```tsx
import { memo, type JSX } from 'react'
import type { RailRow } from './rail-rows'
import type { RailWorkspace } from './rail-sections'
import { RailPanelRow } from './RailPanelRow'
import { RailWorkspaceRow } from './RailWorkspaceRow'
import { shellControl } from './shell-control'

export interface SideRailProps {
  onToggle: () => void
  workspaces: RailWorkspace[]
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: () => void
  onRenameWorkspace: (id: string, currentName: string) => void
  onDeleteWorkspace: (id: string, name: string, panelCount: number) => void
  rows: RailRow[]
  selectedId: string | null
  onGoToPanel: (id: string) => void
  onStartPanel: (id: string) => void
  onClosePanel: (id: string) => void
}

/**
 * The left rail: Workspaces, Panels, and (from Task 4) Attention.
 *
 * Presentational by construction — every prop is derived data or a
 * CanvasActions member. A rail that reached into Canvas for its own copy of a
 * verb would be a second implementation of it; see the spec's "The shell is a
 * second view over one verb surface".
 *
 * memo'd, and EVERY row array it takes is frozen on a signature by Canvas.
 * Canvas re-renders on every mousemove over the canvas (setCursor) and on
 * every frame of a drag (setPanelRect); without both halves the lists would be
 * rebuilt at 60Hz for rect changes no row displays. Adding an unfrozen array
 * to these props defeats this memo outright, and the symptom is invisible on a
 * four-panel canvas.
 *
 * All three section headers render unconditionally, empty or not. A rail
 * section has no query to type into — which is the only thing that makes the
 * palette's `hiddenAtRest` honest — so hiding one at rest hides it permanently
 * from the user who has never seen it fire. It also keeps the rail's height
 * stable, so the Panels list does not move under the pointer when a bell rings.
 *
 * The toggle stays mounted when the rail is collapsed — the collapsed strip is
 * 22px of button and nothing else, because it is the only way back for a user
 * who does not know the chord.
 */
function SideRailImpl({
  onToggle, workspaces, onSwitchWorkspace, onCreateWorkspace,
  onRenameWorkspace, onDeleteWorkspace,
  rows, selectedId, onGoToPanel, onStartPanel, onClosePanel
}: SideRailProps): JSX.Element {
  return (
    <aside className="shell__rail" aria-label="Side rail">
      <button
        type="button"
        className="shell__rail-toggle"
        title="Hide the side rail (⌘\)"
        aria-label="Hide the side rail"
        {...shellControl(onToggle)}
      >
        ‹
      </button>

      {/*
        The + lives INSIDE the region title so the collapse rule that
        display:none's .shell__region-title takes it with it. A create button
        surviving the collapse would be a control floating in a 22px strip with
        nothing left on screen to explain what it creates.
      */}
      <div className="shell__region-title shell__region-title--action">
        <span>Workspaces</span>
        <button
          type="button"
          className="shell__region-add"
          title="New workspace"
          aria-label="New workspace"
          {...shellControl(onCreateWorkspace)}
        >
          +
        </button>
      </div>
      <ul className="rail-list rail-list--workspaces" aria-label="Workspaces">
        {workspaces.map((row) => (
          <RailWorkspaceRow
            key={row.id}
            row={row}
            onSwitch={onSwitchWorkspace}
            onRename={onRenameWorkspace}
            onDelete={onDeleteWorkspace}
          />
        ))}
      </ul>

      <div className="shell__region-title">Panels</div>
      <ul className="rail-list rail-list--panels" aria-label="Panels">
        {rows.map((row) => (
          <RailPanelRow
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            onGoTo={onGoToPanel}
            onStart={onStartPanel}
            onClose={onClosePanel}
          />
        ))}
      </ul>
    </aside>
  )
}

export const SideRail = memo(SideRailImpl)
```

- [ ] **Step 5: Build and freeze the array in `Canvas.tsx`**

Add the import beside the existing rail import near the top of the file:

```ts
import { buildWorkspaceRows, workspaceSignature } from '../shell/rail-sections'
```

Then, immediately **after** the `const railRows = useMemo(() => railBuilt, [railSig])`
line, insert:

```tsx
  /**
   * The rail's Workspaces section, frozen the same way its rows are — against a
   * different volatile input. There is no rect here: what churns is IDENTITY,
   * because reloadWorkspaces() hands back a brand-new array of brand-new
   * objects on mount and on every palette open. Without the freeze, SideRail's
   * memo is defeated by a reload that changed nothing at all.
   *
   * `waitingIds` is the same live attention set the pips and the inspector
   * summary read — it changes only when MEMBERSHIP changes (syncAttention
   * notifies on nothing else), so a chatty agent's busy/idle churn never
   * reaches this at all.
   */
  const workspaceBuilt = buildWorkspaceRows(workspaceRows, waitingIds)
  const workspaceSig = workspaceSignature(workspaceBuilt)
  const railWorkspaces = useMemo(() => workspaceBuilt, [workspaceSig])
```

Then replace the `<SideRail ... />` element with:

```tsx
      <SideRail
        onToggle={chrome.toggleRail}
        workspaces={railWorkspaces}
        onSwitchWorkspace={paletteActions.switchWorkspace}
        onCreateWorkspace={paletteActions.beginCreateWorkspace}
        onRenameWorkspace={paletteActions.beginRenameWorkspace}
        onDeleteWorkspace={paletteActions.deleteWorkspace}
        rows={railRows}
        selectedId={selectedId}
        onGoToPanel={paletteActions.goToPanel}
        onStartPanel={paletteActions.startPanel}
        onClosePanel={paletteActions.closePanel}
      />
```

Every one of the four new callbacks is a `CanvasActions` member passed straight
through with no adapter. That is not a coincidence to tidy away later — it is
the spec's "the shell adds no second switching path", made structurally true.

- [ ] **Step 6: Style it**

In `src/renderer/styles.css`:

(a) Replace `.shell__rail { border-right: 1px solid var(--border); }` with:

```css
/* Three sections now, so the rail has to divide its own height rather than let
   one list claim a fixed slice of it. Panels is the section that grows;
   Workspaces and Attention are short by construction and are capped so a long
   workspace list cannot push the panel outline off screen. */
.shell__rail {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
```

(b) Replace the `.rail-list` rule's `max-height: calc(100% - 60px);` line —
that bound assumed a single list and is wrong with three — so the rule reads:

```css
.rail-list {
  list-style: none;
  margin: 0;
  padding: 0 4px;
  overflow-y: auto;
}
/* min-height: 0 or the flex item refuses to shrink below its content and the
   list scrolls the whole rail instead of itself — the same min-width:0 trap
   the canvas grid cell documents one screenful up. */
.rail-list--panels { flex: 1 1 auto; min-height: 0; }
.rail-list--workspaces,
.rail-list--attention { flex: 0 1 auto; max-height: 26%; }
```

(c) Add, beside the existing `.shell__region-title` rule:

```css
.shell__region-title--action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.shell__region-add {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
}
.shell__region-add:hover { color: var(--text); }
```

(d) Add `.rail-row__rename` to the existing start/close rules so it inherits
the same 18px quiet-chrome treatment:

```css
.rail-row__start,
.rail-row__rename,
.rail-row__close {
```

and

```css
.rail-row__start:hover,
.rail-row__rename:hover,
.rail-row__close:hover { color: var(--text); }
```

(e) Add:

```css
/* The active workspace's switch is disabled, not hidden. Keep it at full text
   colour: greying it out would read as "this workspace is unavailable" rather
   than "you are already here", which is the opposite of what it means. */
.rail-row__main:disabled { cursor: default; color: var(--text); }

/* Amber, because it is the same fact the panel border and the row dot already
   paint amber. */
.rail-row__waiting { color: var(--amber); }
```

- [ ] **Step 7: Run the checks and watch them pass**

Run: `npm run typecheck && npm run build && npm run verify:panels`

Expected: typecheck clean; `110/110 passed`. Checks 95, 95b and 96 pass, and
**every pre-existing check still passes** — in particular 81–86 (the panel
outline), 73 (the exact canvas inset), and 94 (the two source-text counts,
which M8d must not move).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/shell/RailWorkspaceRow.tsx src/renderer/shell/SideRail.tsx \
  src/renderer/canvas/Canvas.tsx src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m8d): the Workspaces section, switching through M7's own transaction

Every callback is a CanvasActions member passed straight through — switch,
create, rename, delete — so the rail is a second DOOR onto M7's transaction
rather than a second implementation of it. Check 95 is what makes that
claim testable: the pid is the only observable that separates a real
demote-and-switch from a dispose-and-respawn, which is why 64 asserts it
for the palette's switcher and why this one has to assert it again for the
rail.

95b pins the active row disabled rather than absent (verify:palette 60's
rule), with its rename and delete still live because deleting the workspace
you are in is supported. 96 is 70b's fixture from the new surface: a
hidden workspace's waiting panel can only surface as a count on its
workspace row, because Attention deliberately cannot name a panel that is
not on this canvas.

The rail becomes a flex column — .rail-list's max-height: calc(100% - 60px)
assumed a single list and is wrong with three."
```

---

### Task 4: The Attention section on screen

**Files:**
- Modify: `src/renderer/shell/SideRail.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `scripts/verify-panels.cjs` (checks 97, 98)

**Interfaces:**
- Consumes: `RailAttention`, `buildAttentionRows`, `attentionSignature` from Task 2; `SideRailProps` from Task 3; `paletteActions.goToPanel`.
- Produces: nothing further; Task 5 is documentation only.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, after check 96's closing `}` and before
the `} catch (error) {` line:

```js
    // 97. A WAITING PANEL APPEARS IN THE QUEUE, AND CLICKING IT NAVIGATES
    //     WITHOUT ACKNOWLEDGING.
    //     Three facts in one read, and each alone passes against a different
    //     wrong rail. The ROW existing is satisfied by a section that lists
    //     every panel rather than the queue. The CAMERA moving is satisfied by
    //     a row wired to onSelectPanel — which would also wake a dormant panel
    //     and is the exact shape check 84 exists to reject. And the amber
    //     surviving is the one that pins the spec's rule that the shell never
    //     acknowledges: focus is the renderer's single acknowledgement
    //     trigger and main is the sole author of the state, so a row that
    //     cleared it locally would make the renderer a second author of a
    //     fact main owns.
    //
    //     The COLOUR is read, not the state, for check 62's reason: the
    //     failure this guards is purely visual. Main can hold wants-you
    //     perfectly while .panel--selected paints over it in blue, and a check
    //     asking only "is the state still wants-you" passes against exactly
    //     that regression.
    let attentionPanelId = null
    {
      const BELL_LINE = "printf '\\007'\n"
      const idsBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      attentionPanelId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore.includes(id)) || false
      }, 4000)
      if (!attentionPanelId) throw new Error('97: PRESET_SPAWN produced no new panel')
      const spawned = await waitUntil(
        async () => (await settledSessionMap(wc)).has(attentionPanelId), 8000)
      if (!spawned) throw new Error(`97: panel ${attentionPanelId} never got a PTY`)
      ptyManager.write(attentionPanelId, BELL_LINE)
      const rang = await waitUntil(
        async () => (await railAgentState(attentionPanelId)) === 'wants-you', 6000)
      if (rang !== true) throw new Error('97: the panel never reached wants-you')

      // Built once rather than quoted inline at each use. Threading a
      // selector through two template layers is how a check ends up matching
      // nothing and reporting a pass; 98 builds its own for the same reason,
      // since this one is block-scoped to check 97.
      const attentionRowSel =
        `.rail-attention[data-rail-attention=${JSON.stringify(attentionPanelId)}]`
      const rowAppeared = await waitUntil(() => wc.executeJavaScript(
        `document.querySelector(${JSON.stringify(attentionRowSel)}) !== null`), 4000)

      // Pan the panel away first, so "the click framed it" is a claim the
      // camera can actually falsify. Clicking a row for a panel already
      // centred moves nothing and would pass against a row wired to nothing.
      await railPan(-1800, -1200)
      await settle()
      const before97 = await wc.executeJavaScript(`window.__m4aViewport()`)
      const clicked = await clickRail(`${attentionRowSel} .rail-row__main`)
      await settle()
      const after97 = await wc.executeJavaScript(`window.__m4aViewport()`)
      const colour = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-panel-id=${JSON.stringify(attentionPanelId)}]')
        if (!el) return null
        const amber = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()
        const probe = document.createElement('div')
        probe.style.color = amber
        document.body.appendChild(probe)
        const want = getComputedStyle(probe).color
        probe.remove()
        return { border: getComputedStyle(el).borderTopColor, want }
      })()`)
      ok('97 the attention row navigates to its panel and leaves it amber',
        rowAppeared === true && clicked === true &&
          (after97.x !== before97.x || after97.y !== before97.y) &&
          after97.scale === before97.scale &&
          colour !== null && colour.border === colour.want,
        `row=${rowAppeared} clicked=${clicked} ` +
          `${JSON.stringify(before97)} -> ${JSON.stringify(after97)} ${JSON.stringify(colour)}`)
    }

    // 98. FOCUS IS STILL WHAT ACKNOWLEDGES, AND THE ROW LEAVES WITH THE STATE.
    //     The other half of 97, and the half that proves the section is a VIEW
    //     over the attention set rather than a list with a life of its own: a
    //     row that survived the state clearing would navigate to a panel with
    //     nothing to say, and the queue would only ever grow.
    //
    //     Clicking the PANEL (now on screen, because 97 framed it) is the
    //     gesture — not a rail control, which by design takes neither DOM
    //     focus nor focusedId and therefore acknowledges nothing.
    {
      const point = await wc.executeJavaScript(`(() => {
        const el = document.querySelector(
          '[data-panel-id=${JSON.stringify(attentionPanelId)}] .panel__slot')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)
      if (!point) throw new Error('98: the framed panel has no slot to click')
      wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
      // One selector string, built once. Nesting JSON.stringify inside a
      // template inside executeJavaScript is exactly the kind of quoting that
      // silently matches nothing and reports a pass.
      const rowSel = JSON.stringify(
        `.rail-attention[data-rail-attention=${JSON.stringify(attentionPanelId)}]`)
      const panelSel = JSON.stringify(`[data-panel-id=${JSON.stringify(attentionPanelId)}]`)
      const gone = await waitUntil(async () => {
        const state = await wc.executeJavaScript(`(() => {
          const panel = document.querySelector(${panelSel})
          return {
            agent: panel ? panel.getAttribute('data-agent-state') : null,
            row: document.querySelector(${rowSel}) !== null
          }
        })()`)
        return (state.agent !== 'wants-you' && state.row === false) ? state : false
      }, 6000)
      ok('98 focusing the panel clears the state and its attention row',
        gone !== false, `state=${JSON.stringify(gone)}`)
    }

    // The empty state, read once now that 98 has emptied the queue. It is the
    // state this section is in nearly all the time, which is exactly why it is
    // the one most likely to have been left rendering nothing at all — and a
    // section header with a void under it reads as a broken list rather than
    // as "nobody needs you".
    {
      const empty = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('.rail-list--attention .rail-empty')
        return el ? el.textContent : null
      })()`)
      ok('98b an empty attention queue says so rather than rendering nothing',
        typeof empty === 'string' && empty.trim().length > 0, `empty=${JSON.stringify(empty)}`)
    }
```

- [ ] **Step 2: Run and watch the checks fail**

Run: `npm run build && npm run verify:panels`

Expected: `FAILED: 97, 98, 98b`, total `110/113 passed`. All three listed, run
reaches the summary.

If 97 fails at its `throw` for the fixture rather than at `ok(...)`, that is a
fixture problem and not a finding — the bell must be delivered to a real
`/bin/sh`, never to `Cmd+N`'s default `cat -v`, which merely echoes bytes and
never produces a real `0x07`.

- [ ] **Step 3: Render the section in `SideRail.tsx`**

Add to the imports:

```tsx
import type { RailAttention, RailWorkspace } from './rail-sections'
```

(replacing the `RailWorkspace`-only import line from Task 3).

Add to `SideRailProps`, after `onClosePanel`:

```tsx
  attention: RailAttention[]
```

Add `attention` to the destructured parameter list, and append this section
after the Panels `</ul>`, before the closing `</aside>`:

```tsx
      <div className="shell__region-title">Attention</div>
      <ul className="rail-list rail-list--attention" aria-label="Attention">
        {attention.length === 0 ? (
          // Not an absent list. This section is empty nearly all the time, and
          // a header with a void under it reads as a broken list rather than
          // as "nobody needs you" — the same argument hiddenAtRest makes in
          // the palette, where a row that disappears is indistinguishable from
          // a feature that was never built.
          <li className="rail-empty">nothing waiting</li>
        ) : (
          attention.map((row) => (
            <li
              key={row.id}
              className="rail-row rail-attention"
              data-rail-attention={row.id}
            >
              {/*
                goToPanel and NOTHING else. Not onSelectPanel (which wakes —
                check 84), and emphatically not an acknowledge: focus is the
                renderer's single acknowledgement trigger and main is the sole
                author of the state, so a row that cleared it here would make
                the renderer a second author of a fact main owns. The panel
                therefore stays amber after the jump, which is what
                .panel--selected.panel--agent-wants-you exists for.
              */}
              <button
                type="button"
                className="rail-row__main"
                title={`Go to ${row.label}`}
                {...shellControl(() => onGoToPanel(row.id))}
              >
                {/*
                  Static, not a useAgentState subscription: every row in this
                  section is wants-you by construction — that is what put it
                  here — so subscribing would be asking a question whose answer
                  is already the reason the row exists.
                */}
                <span
                  className="rail-row__dot"
                  data-agent-state="wants-you"
                  aria-hidden="true"
                />
                <span className="rail-row__label">{row.label}</span>
              </button>
            </li>
          ))
        )}
      </ul>
```

- [ ] **Step 4: Build and freeze the array in `Canvas.tsx`**

Extend the rail-sections import:

```ts
import {
  attentionSignature, buildAttentionRows, buildWorkspaceRows, workspaceSignature
} from '../shell/rail-sections'
```

Insert immediately after the `railWorkspaces` memo from Task 3:

```tsx
  /**
   * The attention queue, frozen like every other list this rail renders.
   *
   * Built from `railBuilt` — the CURRENT rows, not the frozen `railRows` — so
   * the two are read in one pass; they are equal whenever the signature is,
   * and reading the fresh one keeps the dependency obvious rather than subtle.
   *
   * Passing the built ROWS rather than `panels` is what gives the phantom
   * filter and the shared label in one operation: an id with no panel row is
   * an orphan (agent state survives a panel's closure by design) and must not
   * become a row that navigates nowhere.
   */
  const attentionBuilt = buildAttentionRows(waitingIds, railBuilt)
  const attentionSig = attentionSignature(attentionBuilt)
  const railAttention = useMemo(() => attentionBuilt, [attentionSig])
```

And add one prop to the `<SideRail>` element, after `onClosePanel`:

```tsx
        attention={railAttention}
```

- [ ] **Step 5: Style the empty state**

Add to `src/renderer/styles.css`, beside the `.rail-row__waiting` rule:

```css
.rail-empty {
  padding: 4px 8px;
  color: var(--muted);
  font-size: 11px;
}
```

- [ ] **Step 6: Run the checks and watch them pass**

Run: `npm run typecheck && npm run build && npm run verify:panels`
Expected: typecheck clean; `113/113 passed`.

- [ ] **Step 7: Fault-inject once, to confirm 97 can actually fail**

Check 97's amber clause is the only thing in the repo asserting that the rail
does not acknowledge, and a clause that cannot fail is worse than no clause.
Temporarily change the attention row's handler in `SideRail.tsx` from
`onGoToPanel(row.id)` to something that also focuses — the quickest honest
injection is to swap it to `onStartPanel(row.id)`, which selects and wakes:

Run: `npm run build && npm run verify:panels`
Expected: **97 fails.** Record the failure line in the commit message.

Then revert the injection (`git checkout -- src/renderer/shell/SideRail.tsx`
would lose Task 4's work — undo the one line by hand), rebuild, and confirm
`113/113 passed` again before committing.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/shell/SideRail.tsx src/renderer/canvas/Canvas.tsx \
  src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m8d): the attention queue in the rail, navigating without acknowledging

A row calls goToPanel and nothing else. Not onSelectPanel, which wakes
(check 84's rule), and emphatically not an acknowledge: focus is the
renderer's single acknowledgement trigger and main is the sole author of
the state, so a row that cleared it locally would make the renderer a
second author of a fact main owns.

Check 97 reads the rendered border COLOUR rather than the state, for check
62's reason — the failure it guards is purely visual, and main can hold
wants-you perfectly while .panel--selected paints over it. Confirmed by
fault injection: rewiring the row to a handler that focuses turns 97 red.

98 is the other half — focusing clears the state AND the row, which is
what makes the section a view over the attention set rather than a list
with a life of its own. 98b pins the empty state, which is what this
section shows nearly all the time."
```

---

### Task 5: Documentation, and the whole suite green

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-27-m8-app-shell-design.md` (status line only)

- [ ] **Step 1: Add the milestone row to `README.md`**

After the `| M8c | The inspector: what a panel is, and restart in place | ✅ done |`
row, add:

```
| M8d | Workspaces and attention in the rail | ✅ done |
```

- [ ] **Step 2: Update the `verify:rail` row in `CLAUDE.md`'s verify table**

The row currently opens `| verify:rail | plain node | 29 checks (the last check
number is 27; …`. Change the opening to `39 checks (the last check number is
36; …` and append to the end of that row's prose, before the closing `|`:

```
. M8d adds the rail's other two sections (28–36b), and its own module `rail-sections.ts` alongside `rail-rows.ts` and `inspector-fields.ts`. **28–29 are the pair worth knowing**: `waitingCount` is now the ONE derivation of "how many of this workspace's panels are waiting" — `palette/commands.ts` computed it inline until M8d and now calls this, the same trade `isRunning` made in M8c — and 29 is what makes the intersection load-bearing rather than incidental, since an implementation reaching for `attentionIds.length` passes 28 and fails only here. 31 states the same fault from the other side: a waiting panel in Main must not inflate Scratch's count, which is what a global count produces and which reads as "every workspace is waiting for you". 32/33 are the 60Hz pair in the shape this section needs them — there is no rect to move here, so the volatile input is IDENTITY (`reloadWorkspaces()` hands Canvas a fresh array of fresh objects on every palette open), and 33's three separate movers are what stop an implementation that hashed only the ids passing 32 and then freezing a stale count forever. **34–35 are the pair that justify `buildAttentionRows`' signature**: it takes the already-built `RailRow[]` rather than the panel list, so filtering the queue to ids that have a row IS `reachableQueue`'s phantom filter and reading the label off that row is what stops the two sections naming one panel differently — one lookup, both guarantees. 34 also pins that the builder iterates the QUEUE and looks rows up rather than the reverse, which is the half that preserves entry order; the reverse renders the canvas's order and looks entirely correct until two agents ring in the wrong sequence. 36 pins that the signature moves on an ORDER change, which a set-shaped implementation loses silently. The count is 39 while the last number is 36, because of the lettered sub-checks `17b`… (see the existing list) plus `25b`, `27b` and `36b`
```

(Re-derive the sub-check list against the file rather than copying it: the row
already names `25b` and `27b`, and M8d adds only `36b`.)

- [ ] **Step 3: Update the `verify:panels` row in `CLAUDE.md`**

Change its opening count from `107 checks` to `113 checks`, and append before
the closing `|`:

```
. M8d adds the rail's other two sections (95–98b). **95 is the one to know by number**, and it is check 64's argument inherited by a second door: the pid is the only observable that separates a real demote-and-switch from a dispose-and-respawn, so a rail switch that quietly disposed would satisfy every count, every layout read and the file on disk, and only the pid would say otherwise. 95b pins the ACTIVE workspace's row present and DISABLED rather than absent — `verify:palette` 60's rule — with its rename and delete still live, because deleting the workspace you are in is a supported path that switches away first. 96 is 70b's fixture reached from the rail, and it is the only check that proves the two sections divide the question the way the spec says: Attention deliberately cannot name a panel that is not on this canvas, so a hidden workspace's waiting agent surfaces ONLY as the count on its workspace row. **97 is the check the attention section exists for**, and its three clauses reject three different wrong rails — the row existing rejects a section that lists every panel, the camera moving rejects a row wired to nothing, and the amber SURVIVING is the one that pins "the shell never acknowledges". It reads the rendered border COLOUR rather than the state for check 62's reason, and it was confirmed by fault injection: rewiring the row to a handler that focuses turns it red while every other clause stays green. It also pans the panel away BEFORE the click, so "the click framed it" is a claim the camera can falsify — clicking a row for an already-centred panel moves nothing and passes against a dead handler. 98 is the other half (focus clears the state AND the row, which is what makes the section a view rather than a list with a life of its own) and 98b pins the empty state, which is what this section shows nearly all the time. The count is 113 while the last number is 98, because of the lettered sub-checks … plus `95b` and `98b`
```

- [ ] **Step 4: Add the M8d entries to `CLAUDE.md`'s "Load-bearing details"**

Add these two sections after the existing rail entries (after "`closePanel` and
`startPanel` are actions members with no palette rows"):

```markdown
**One waiting count, and the rail is a view over it (`shell/rail-sections.ts`'s
`waitingCount`).** `palette/commands.ts` computed a workspace's waiting count
inline until M8d. The rail renders the same number, and a second copy of that
expression would agree the day it was written and drift the first time one of
them was wrong — with the drift landing as a count on screen that no log
explains. It is one exported function both views call, which is the trade
`isRunning` made in M8c for a different derived number and the rule "One map,
and a typed view over it" states for a stored one. `waiting` stays a NUMBER on
the row and the view composes the text: the palette already learned that a
count baked into a title reaches the fuzzy haystack (`verify:palette` 64), and
a count is transient state rather than a name. One honest limit is recorded in
the function's own comment: `panelIds` comes from main's store, which saves on
a 500ms debounce, so for up to one debounce window a just-closed panel can
still be counted. That is acceptable for a count and would not be for a
navigation target — which is exactly why `buildAttentionRows` filters against
the rendered rows instead.

**The attention section takes the built rows, not the panels
(`shell/rail-sections.ts`'s `buildAttentionRows`).** Filtering the queue down
to ids that have a `RailRow` IS `reachableQueue`'s phantom filter, and reading
the label off that same row is what stops the Panels and Attention sections
rendering two different names for one panel. One lookup, both guarantees — and
the alternative (take `panels`, re-derive the label) is a fifth place M6a's
honest chain can be lost. It iterates the QUEUE and looks rows up, never the
reverse: the reverse renders the canvas's order instead of entry order and
looks entirely correct until two agents ring in the wrong sequence, which is a
bug that never reproduces on demand. Every row is `wants-you` by construction,
so no row carries agent state and none subscribes — `RailPanelRow`'s per-id
subscription answers a question this section already knows the answer to.

**The attention section is scoped to the ACTIVE workspace, deliberately
(`Canvas.tsx`'s `railAttention`).** A row's whole job is to navigate, and
`centreOn` can only frame a rect on this canvas — a row for a hidden
workspace's panel would either go nowhere or smuggle in a second switching
path, and the spec rejects both. A waiting panel in a hidden workspace
surfaces as the waiting COUNT on its workspace row instead. The two sections
divide one question between them — *who is waiting here* and *where else is
anyone waiting* — and the obvious "fix", one flat cross-workspace queue,
breaks the click. `verify:panels` 96 is the check that pins the hidden half.
```

- [ ] **Step 5: Update the spec's status line**

In `docs/superpowers/specs/2026-08-27-m8-app-shell-design.md`, replace the
three status lines with:

```
**Status:** implemented and landed — M8a, M8b, M8c and M8d.
```

- [ ] **Step 6: Run the whole suite**

Run: `npm run verify`

Expected: every suite green. Specifically confirm in the output:
`verify:rail` 39/39, `verify:palette` 71/71, `verify:layout` 99/99,
`verify:panels` 113/113, `verify:ipc` 1/1 (26 channels — M8d added none).

If anything outside M8d's own checks is red, do not adjust the check. Find out
what moved.

- [ ] **Step 7: Commit**

```bash
git add README.md CLAUDE.md docs/superpowers/specs/2026-08-27-m8-app-shell-design.md
git commit -m "docs(m8d): the milestone row, the two verify rows, and the three invariants

The verify counts are re-derived from real output, not incremented: rail
29 -> 39 and panels 107 -> 113. The three load-bearing entries are the ones
a later reader would otherwise 'simplify': that waitingCount is ONE
derivation shared with commands.ts, that buildAttentionRows takes the built
rows so the phantom filter and the label lookup are one operation, and that
the attention section is scoped to the active workspace on purpose — with
the reason, because the obvious cross-workspace 'fix' breaks the click."
```

---

## Self-Review

**Spec coverage.**

| Spec requirement | Task |
|---|---|
| Workspaces section: name, panel count, waiting count | 1, 3 |
| Click switches through `activateWorkspace`, no second path | 3 (callbacks passed straight through), check 95 |
| `+` creates | 3 |
| Rename and delete route into input mode | 3 (settled decision: both on the row) |
| Counts are a view, never a second derivation | 1 (`waitingCount` shared with `commands.ts`) |
| Attention: `useAttentionIds()` as a queue, in order | 2, 4 |
| Clicking = `centreOn` + `selectAndRaise`, no acknowledge | 4, check 97 |
| Landed-on panel stays amber | check 97 (border colour) |
| Phantoms filtered like `reachableQueue` | 2, check 34 |
| Attention scoped to the active workspace | 4, checks 96/97, `CLAUDE.md` entry |
| All three sections always visible | 4 (empty state), check 98b |
| The rail does not replace the edge pips | untouched — `EdgeIndicators` and `agent.edgeIndicators` are not modified by any task |
| `verify:rail` checks | 1, 2 |
| `verify:panels` checks | 3, 4 |
| `verify:palette` 64 stays green | 1 step 9 |
| No new verb, no new IPC channel | Global Constraints; confirmed at Task 5 step 6 |

**Placeholder scan.** No TBD/TODO. Every code step carries the actual code.
Task 5 steps 2 and 3 ask the implementer to re-derive the sub-check letter
lists against the file rather than transcribing them — that is a deliberate
instruction to check a fact, not a placeholder, and it exists because
`CLAUDE.md` records these counts going stale before.

**Type consistency.** `RailWorkspace` (data) and `RailWorkspaceRow`
(component) are deliberately different names and do not collide;
`RailAttention` is the data type and has no component. `waitingCount`,
`buildWorkspaceRows`, `workspaceSignature`, `buildAttentionRows` and
`attentionSignature` are spelled identically in Tasks 1, 2, 3 and 4 and in the
`CLAUDE.md` text. The four `SideRail` workspace callbacks match `CanvasActions`
exactly: `switchWorkspace(id)`, `beginCreateWorkspace()`,
`beginRenameWorkspace(id, currentName)`, `deleteWorkspace(id, name, liveCount)`.
