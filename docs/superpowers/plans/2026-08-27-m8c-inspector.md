# M8c — The Inspector and Restart-in-Place: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the shell's right pane with the selected panel's honest, link-by-link identity, and give the app its one new capability in all of M8 — restarting a panel's process in place.

**Architecture:** The inspector is a second **view**, never a second derivation. Its read model is a pure module (`renderer/shell/inspector-fields.ts`) that joins M8b's `verify:rail` suite through the entry that already predicts it, and it is frozen on a signature exactly as `rail-rows.ts` is, because the selected panel comes out of the same `panels` array that is a fresh object on every drag frame. Its act half reaches the app only through `PaletteActions` — no new callback is closed over locally. Restart routes through `registry.dispose(id)` and a fresh `ensure`, adding no `pty.kill` call site; `dispose` starts **returning** the kill promise so the destroy-before-respawn ordering is a property of the restart code rather than of main's current synchrony.

**Tech Stack:** TypeScript, React 18 (no StrictMode), Electron, esbuild-built plain-node verify suites, real-Electron verify suites.

**Spec:** `docs/superpowers/specs/2026-08-27-m8-app-shell-design.md` — the **M8c section**, amended in commit `8ccb964` with the four decisions this plan implements. Read the M8 architecture section ("Three rules the shell must obey", "The shell owns no modality") too; it governs every task here.

## Global Constraints

Copied from the spec and from `CLAUDE.md`. Every task's requirements implicitly include this section.

- **`npm run verify` must be green before any task is called done.** It is the whole verification story; there is no unit runner and no linter. Individual suites are listed in `CLAUDE.md`'s table.
- **Every shell control mounts `shellControl()`** from `renderer/shell/shell-control.ts`. It `preventDefault()`s its own mousedown so DOM focus never leaves xterm's hidden textarea. No exceptions — spec rule 2.
- **The shell never owns canvas state.** Inspector props are derived data plus `PaletteActions` members. A verb the shell needs that the palette lacks is added to `PaletteActions`, and its members stay **required, never optional**.
- **The shell owns no modality.** Rename routes into the palette's existing `InputMode` via `beginRenamePanel`. No shell-native dialog.
- **`pty.kill` has exactly two callers, both inside `session-registry.ts`** (`dispose(id)` and `disposeAll()`). Nothing in this milestone adds a third, in particular not in `Canvas.tsx`.
- **The resolved command is never copied back into `PanelSpec`.** Reading `PanelStatus` is the only honest route; writing back would make it a fifth place M5a's absent-`command` rule can be lost.
- **`tsconfig.node.json` / `tsconfig.web.json` set `noUnusedLocals` and `noUnusedParameters`** — prefix intentionally-unused params with `_`.
- **Comments explain *why*.** Match the surrounding density; a non-obvious line without a reason attached gets "fixed" by someone later.
- **Commits:** conventional format scoped by milestone — `feat(m8c): …`, `test(m8c): …`, `fix(m8c): …`, `docs(m8c): …`.
- **Test-first.** Write the failing check, **run it and watch it fail against the non-existent module**, then implement. A check that has never been seen red is not evidence.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/renderer/shell/inspector-fields.ts` | **New.** Pure read model: the link-by-link fields, the agent-state label, the running predicate, the canvas summary, the signature. No React, no DOM, no registry reference. | 1 |
| `scripts/rail-entry.cjs` | Re-export the new module into the existing plain-node bundle. | 1 |
| `scripts/verify-rail.cjs` | Checks 16–27b. | 1 |
| `src/renderer/shell/Inspector.tsx` | The pane: read half, act half, empty state. Presentational; every control `shellControl()`. | 2, 3, 6 |
| `src/renderer/styles.css` | Inspector field/badge/action styling. | 2 |
| `src/renderer/canvas/Canvas.tsx` | Builds the model, freezes it on the signature, passes actions; `onCounts` rewritten onto the shared predicate; `restartPanel`. | 2, 6 |
| `src/shared/ipc-contract.ts` | `PRESET_SAVE_PANEL` channel + bridge member. | 3 |
| `src/main/presets.ts` | **`presetFromCapture`** — the extracted, pure mint-and-name step both save paths call. | 3 |
| `src/main/index.ts` | Menu path calls the extracted helper; new invoke handler. | 3 |
| `src/preload/index.ts` | Bridge wiring for the new invoke. | 3 |
| `src/renderer/session/session-registry.ts` | `dispose(id)` returns the kill promise. | 4 |
| `src/renderer/palette/commands.ts` | `restartPanel` on `PaletteActions`; `restartable` on `PanelRow`; the `Restart panel…` row. | 6 |
| `scripts/verify-registry.cjs`, `verify-pty-manager.cjs`, `verify-layout.cjs`, `verify-panels.cjs` | New checks. | 3–6 |
| `CLAUDE.md`, `README.md` | The verify table, the milestone row, the re-derived counts. | 7 |

---

### Task 1: The inspector's pure read model

**Files:**
- Create: `src/renderer/shell/inspector-fields.ts`
- Modify: `scripts/rail-entry.cjs`
- Test: `scripts/verify-rail.cjs` (append checks 16–27b before the summary block at the end)

**Interfaces:**
- Consumes: `Panel` from `@renderer/panels/panels`, `PanelStatus` from `@renderer/session/panel-session`, `AgentState` from `@shared/types`.
- Produces, for Tasks 2 and 6:
  - `interface InspectorField { key: string; label: string; value: string }`
  - `interface InspectorModel { id: string; title?: string; heading: string; fields: InspectorField[]; reattached: boolean; restartable: boolean }`
  - `interface InspectorSummary { panels: number; running: number; waiting: number }`
  - `agentStateLabel(state: AgentState | undefined): string`
  - `isRunning(status: PanelStatus | undefined): boolean`
  - `buildInspectorModel(panel: Panel, status: PanelStatus | undefined): InspectorModel`
  - `buildInspectorSummary(panels: readonly Panel[], statusOf: (id: string) => PanelStatus | undefined, waitingIds: readonly string[]): InspectorSummary`
  - `inspectorSignature(model: InspectorModel | null): string`

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-rail.cjs`, immediately **before** the `console.log('\n' + '='.repeat(60))` summary block. The fixture helpers `panel`, `running`, `NONE`, `statuses` and `ok` already exist at the top of that file — reuse them, do not redefine them.

```js
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
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:rail`
Expected: the esbuild step **fails outright** — `rail-entry.cjs` does not yet re-export the module, so `R.agentStateLabel` and its siblings are `undefined`. Add the entry line first (below), re-run, and expect `15/28 passed` with `FAILED: 16, 17, 18, …, 27b` — every new check red because the module does not exist. **Watch this output. Do not proceed on a bundle error alone**; a bundle error proves the file is missing, not that the checks discriminate.

Modify `scripts/rail-entry.cjs`:

```js
/* Bundle entry for the shell's pure row modules. No React, no DOM, no native
   dependencies, so the suite runs under plain node — the cheapest tier this
   repo has. M8d's workspace and attention rows are expected to join this entry
   rather than get suites of their own; M8c's inspector rows already have. */
module.exports = {
  ...require('../src/renderer/shell/rail-rows'),
  ...require('../src/renderer/shell/inspector-fields')
}
```

- [ ] **Step 3: Write the module**

Create `src/renderer/shell/inspector-fields.ts`:

```ts
import type { AgentState } from '@shared/types'
import type { Panel } from '@renderer/panels/panels'
import type { PanelStatus } from '@renderer/session/panel-session'

/**
 * What the inspector renders, as plain data.
 *
 * Pure by construction — no React, no DOM, no registry reference — for the
 * same reason rail-rows.ts is, and it joins the same suite. The two pieces
 * most able to be subtly wrong live here: the link-by-link chain (whose whole
 * point is that it does NOT collapse) and the 60Hz signature.
 */

export interface InspectorField {
  /** Stable key. Also `data-inspector-field`, which is how a check finds it. */
  key: string
  label: string
  value: string
}

export interface InspectorModel {
  id: string
  /** The user's own name, if any. The rename control echoes it. */
  title?: string
  /** The COLLAPSED honest chain — the one answer the header and rail show. */
  heading: string
  fields: InspectorField[]
  reattached: boolean
  restartable: boolean
}

export interface InspectorSummary {
  panels: number
  running: number
  waiting: number
}

/** Rendered when the spec asked for nothing and main has not answered yet. */
const NO_SPEC_COMMAND = 'none — the login shell'

const AGENT_LABELS: Record<AgentState, string> = {
  starting: 'starting',
  busy: 'working',
  idle: 'idle',
  'wants-you': 'wants you',
  exited: 'exited'
}

/**
 * Undefined is an ordinary input, not an error: it is every panel that has
 * never spawned, which on a restored canvas is most of them. A bare index into
 * AGENT_LABELS would render "undefined" and a bare `.toUpperCase()` would
 * throw, both for the commonest case this function sees.
 */
export function agentStateLabel(state: AgentState | undefined): string {
  return state === undefined ? 'no signal' : AGENT_LABELS[state]
}

/**
 * The ONE definition of "this panel is running a process", shared by the
 * inspector's summary and Canvas.tsx's canvas:counts provider.
 *
 * `starting` counts. A panel whose pty:create has not resolved yet is
 * emphatically a process the user started, and main's reset confirm names this
 * number to the user before destroying it. Before M8c the predicate was
 * written inline in the counts provider only; the inspector reusing it rather
 * than writing a second one is the same rule "One map, and a typed view over
 * it" states for settings — two derivations agree the day they are written and
 * drift the first time one is wrong, and here the drift window is exactly the
 * moment a spawn is in flight, which no check would ever happen to sample.
 */
export function isRunning(status: PanelStatus | undefined): boolean {
  return status?.kind === 'running' || status?.kind === 'starting'
}

/**
 * The collapsed chain — identical to railLabel's, deliberately. Two labels for
 * one panel that differ only in the common case is the defect railLabel's own
 * comment describes, and the inspector sits directly beside the rail on
 * screen, where a disagreement is not merely wrong but visibly wrong.
 */
function heading(panel: Panel, status: PanelStatus | undefined): string {
  return panel.title
    ?? (status?.kind === 'running' ? status.command : undefined)
    ?? panel.spec.command
    ?? 'login shell'
}

/**
 * The read half.
 *
 * Every link of the chain gets its OWN field rather than the collapsed answer,
 * and that is this pane's stated reason to exist: "why does this say login
 * shell" is answerable only if the user can see both that the spec asked for
 * nothing and that main resolved /bin/zsh. Merging them into one `command`
 * row would look tidier, render the same string in the common case, and delete
 * the feature.
 *
 * `restartable` is spawned-only — running, starting or exited. Exited is the
 * most natural target the verb has; a never-started panel already has its own
 * verb with its own affordance (M8b's start control, and the card that says
 * "click to start"), and offering a second one here would undo the separation
 * M8b's rule 1 draws between navigating and waking.
 */
export function buildInspectorModel(
  panel: Panel,
  status: PanelStatus | undefined
): InspectorModel {
  const running = status?.kind === 'running' ? status : undefined
  const fields: InspectorField[] = [
    { key: 'command', label: 'command', value: running?.command ?? 'not started' },
    { key: 'spec-command', label: 'asked for', value: panel.spec.command ?? NO_SPEC_COMMAND },
    { key: 'cwd', label: 'cwd', value: running?.cwd ?? panel.spec.cwd },
    // String(), not a template with a fallback: pid is a number and 0 is not a
    // real pid, so there is no zero-trap here — but the exit field below has
    // one, and writing both the same way keeps the difference from reading as
    // an accident.
    { key: 'pid', label: 'pid', value: running === undefined ? '—' : String(running.pid) }
  ]
  if (status?.kind === 'exited') {
    // A TEMPLATE, never `code || …`: 0 is the commonest exit there is and the
    // falsy branch would print the wrong tail for exactly it. Same trap
    // railTail documents.
    fields.push({ key: 'exit', label: 'exit', value: `exited ${status.code}` })
  }
  if (status?.kind === 'error') {
    fields.push({ key: 'error', label: 'error', value: status.message })
  }
  return {
    id: panel.rect.id,
    ...(panel.title !== undefined ? { title: panel.title } : {}),
    heading: heading(panel, status),
    fields,
    reattached: running?.reattached === true,
    restartable: status !== undefined && status.kind !== 'idle'
  }
}

/**
 * The empty state: what the canvas holds when nothing is selected.
 *
 * `waitingIds` is filtered against the panels rather than counted, and that is
 * not defensiveness. Agent state SURVIVES a panel's closure — main sends the
 * transition and the renderer's store keeps it until something clears it — so
 * the attention set can legitimately name an id no panel answers to, the same
 * orphan reachableQueue drops at the head of the jump queue. Counting it says
 * "1 waiting" on a canvas with nothing to go to, and the user hunts for a
 * panel that does not exist.
 */
export function buildInspectorSummary(
  panels: readonly Panel[],
  statusOf: (id: string) => PanelStatus | undefined,
  waitingIds: readonly string[]
): InspectorSummary {
  const ids = new Set(panels.map((p) => p.rect.id))
  return {
    panels: panels.length,
    running: panels.filter((p) => isRunning(statusOf(p.rect.id))).length,
    waiting: waitingIds.filter((id) => ids.has(id)).length
  }
}

/**
 * The same defence railSignature provides, for the same reason and by the same
 * means. `panels` is a fresh array on every setPanelRect — every frame of a
 * drag — and the selected panel comes straight out of it, so without this the
 * inspector would rebuild and re-render sixty times a second for rect changes
 * it renders nothing about.
 *
 * JSON.stringify over the MODEL rather than a hand-rolled concatenation, for
 * both of railSignature's reasons: over the model, so "the signature covers
 * exactly what the pane renders" is structurally true rather than dependent on
 * someone remembering to add a field; and JSON rather than `a + '|' + b`,
 * because a title and a cwd are user text and an ordinary separator could be
 * forged inside one, freezing the pane on stale fields for the users whose
 * titles happen to contain that character and nobody else.
 *
 * Agent state is deliberately absent from the model and therefore from this
 * signature: the pane subscribes useAgentState(id) itself, the same split
 * RailPanelRow makes.
 */
export function inspectorSignature(model: InspectorModel | null): string {
  return JSON.stringify(model)
}
```

- [ ] **Step 4: Run the checks and verify they pass**

Run: `npm run verify:rail`
Expected: `28/28 passed` — 15 pre-existing plus 13 new (16-27 and the lettered 27b). The total exceeds the last check NUMBER because of the sub-check, which is this repo's own convention.

Then run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Fault-inject check 21, the one that carries the milestone's purpose**

Temporarily merge the two command fields into one (delete the `spec-command` entry). Run `npm run verify:rail`. Expected: **21 red, 20 green** — that is the proof 21 discriminates the collapsed implementation from the link-by-link one. Restore, re-run, confirm `28/28`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shell/inspector-fields.ts scripts/rail-entry.cjs scripts/verify-rail.cjs
git commit -m "test(m8c): the inspector's read model, and the links it refuses to collapse"
```

---

### Task 2: The inspector renders the selected panel, and the canvas when nothing is

**Files:**
- Modify: `src/renderer/shell/Inspector.tsx` (replace the M8a placeholder body; keep the toggle exactly as it is)
- Modify: `src/renderer/canvas/Canvas.tsx` (build the model, freeze it, pass it; rewrite the `canvas:counts` provider onto the shared predicate)
- Modify: `src/renderer/styles.css` (append after the `.rail-row__tail` block)
- Test: `scripts/verify-panels.cjs` (checks 87–89)

**Interfaces:**
- Consumes: everything Task 1 produced; `useAgentState` from `@renderer/session/agent-state-store`; `PaletteActions.beginRenamePanel(id, currentTitle)` and `PaletteActions.closePanel(id)`, both of which already exist and are already wired.
- Produces, for Tasks 3 and 6:
  - `interface InspectorProps { onToggle: () => void; model: InspectorModel | null; summary: InspectorSummary; onRename: (id: string, currentTitle: string) => void; onClose: (id: string) => void }` — Task 3 adds `onSavePreset`, Task 6 adds `onRestart`.
  - The DOM contract checks read: `[data-inspector-field="<key>"]` per field, `[data-inspector-heading]`, `[data-inspector-badge="reattached"]`, `[data-inspector-summary]` with `[data-summary="panels|running|waiting"]`, and `[data-inspector-action="rename|close"]`.

**Why `beginRenamePanel` needs no new plumbing:** it already ends with `palette.openPalette()` (`Canvas.tsx:1635`), because `Palette.tsx` closes the overlay before running a row's command. Called from the inspector — where the palette was never open — that same line is what opens it. The shell therefore gets the palette's `InputMode` and all four of `usePalette`'s focus rules for free, which is exactly what the spec's "The shell owns no modality" demands.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, before the summary block. Insert this helper next to the other helpers near the top of the file (beside `zoomTo`), since checks 88 and 89 both use it:

```js
/**
 * Clicks a point on the canvas background that no panel covers, so the
 * background handler clears the selection instead of selecting something.
 *
 * A fixed corner is not safe and the reason is the whole helper: a cascaded
 * spawn (check 51) or a restored layout can put a panel anywhere, and a click
 * that lands on one SELECTS it — the exact opposite of what a check about the
 * empty state needs, and it would fail as "the summary did not render" with
 * nothing pointing at the coordinates.
 */
const clickEmptyCanvas = (wc) => wc.executeJavaScript(`(() => {
  const host = document.querySelector('.canvas')
  const box = host.getBoundingClientRect()
  const rects = [...document.querySelectorAll('.panel')].map((p) => p.getBoundingClientRect())
  for (let y = box.top + 20; y < box.bottom - 20; y += 40) {
    for (let x = box.left + 20; x < box.right - 20; x += 40) {
      if (!rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) {
        host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }))
        return { x, y }
      }
    }
  }
  return null
})()`)
```

Then the checks:

```js
// 87. THE READ HALF, AND THE CRITERION IT CLOSES.
//     The inspector must show what MAIN RESOLVED, not what the spec asked
//     for. For a login-shell panel spec.command is ABSENT — only main can
//     name the user's shell — so a pane that read the spec would render the
//     stand-in 'login shell' for every default panel and look entirely
//     plausible doing it. Asserting `command` is an absolute path is what
//     separates the two; asserting merely that it is non-empty does not.
//
//     The SECOND clause is the pane's stated reason to exist: the spec link
//     is shown SEPARATELY, so "why does this say login shell" is answerable.
//     A merged single-command implementation passes the first clause alone.
{
  const sessions = await settledSessionMap(wc)
  const targetId = [...sessions.keys()][0]
  await wc.executeJavaScript(`
    document.querySelector('.rail-row[data-rail-row=' + ${JSON.stringify(JSON.stringify(''))}.slice(0,0) + ${JSON.stringify(`"${''}"`)}.slice(0,0) + JSON.stringify(${JSON.stringify(targetId)}) + '] .rail-row__main')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await settle()
  const read = await wc.executeJavaScript(`(() => {
    const f = (k) => document.querySelector('[data-inspector-field="' + k + '"] .inspector__value')
    const g = (k) => { const el = f(k); return el ? el.textContent : null }
    return { command: g('command'), spec: g('spec-command'), cwd: g('cwd'), pid: g('pid') }
  })()`)
  ok('87 the inspector shows the RESOLVED command and the spec link separately',
    read.command !== null && read.command.startsWith('/') &&
      read.spec !== null && read.spec !== read.command &&
      read.pid === String(sessions.get(targetId)),
    JSON.stringify(read) + ` expected pid ${sessions.get(targetId)}`)
}

// 88. The empty state. Nothing selected is not "nothing to show": it is the
//     canvas's own summary, and it is the state the app launches in and
//     returns to on every background click.
//
//     The running count is read back out of pty:list rather than restated,
//     because a hardcoded number here would go stale the first time a fixture
//     panel is added — the same staleness CLAUDE.md records for verify:panels
//     48's ORDER array.
{
  const clicked = await clickEmptyCanvas(wc)
  await settle()
  const summary = await wc.executeJavaScript(`(() => {
    const root = document.querySelector('[data-inspector-summary]')
    if (!root) return null
    const g = (k) => { const el = root.querySelector('[data-summary="' + k + '"]'); return el ? el.textContent : null }
    return { panels: g('panels'), running: g('running'), waiting: g('waiting'),
             fields: document.querySelectorAll('[data-inspector-field]').length }
  })()`)
  const panelCount = await wc.executeJavaScript(`window.__m4aSessions().length`)
  // CONTROLLER RULING (pre-flight CONFLICT-2): derived, never hardcoded to '0'.
  // Checks 54/57/63 ring and acknowledge real bells earlier in this same run,
  // so whether the attention set is empty here depends on their cleanup, which
  // nothing guarantees. A hardcoded 0 fails as "0 !== 1" and points nowhere.
  const waitingNow = await wc.executeJavaScript(
    `String(document.querySelectorAll('.panel[data-agent-state="wants-you"]').length)`)
  ok('88 with nothing selected the inspector summarises the canvas instead',
    clicked !== null && summary !== null &&
      summary.panels === String(panelCount) &&
      summary.waiting === waitingNow &&
      summary.fields === 0,
    `clicked=${JSON.stringify(clicked)} summary=${JSON.stringify(summary)} panels=${panelCount} waiting=${waitingNow}`)
}

// 89. ONE TITLE SOURCE, THREE VIEWS.
//     The inspector's rename must reach the palette's InputMode — the shell
//     owns no modality — and the name it commits must appear in the panel's
//     own header, its rail row AND the inspector's heading. Asserting only
//     the inspector would pass against a pane holding a private copy of the
//     title, which is the drift the honest chain exists to prevent, and it
//     would show up as two names for one panel sitting side by side on
//     screen.
{
  const sessions = await settledSessionMap(wc)
  const targetId = [...sessions.keys()][0]
  await wc.executeJavaScript(`
    document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await settle()
  await wc.executeJavaScript(`
    document.querySelector('[data-inspector-action="rename"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await settle()
  const opened = await wc.executeJavaScript(
    `document.querySelectorAll('.palette').length === 1 &&
     document.activeElement === document.querySelector('.palette__input')`)
  await wc.executeJavaScript(`(() => {
    const input = document.querySelector('.palette__input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'inspector rename')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await pressPlain(wc, 'Enter')
  await settle()
  const names = await wc.executeJavaScript(`(() => {
    const id = ${JSON.stringify(targetId)}
    const header = document.querySelector('.panel[data-panel-id="' + id + '"] .panel__title')
    const rail = document.querySelector('.rail-row[data-rail-row="' + id + '"] .rail-row__label')
    const heading = document.querySelector('[data-inspector-heading]')
    return {
      header: header ? header.textContent : null,
      rail: rail ? rail.textContent : null,
      heading: heading ? heading.textContent : null
    }
  })()`)
  ok('89 an inspector rename opens the palette and reaches all three views',
    opened === true && names.header === 'inspector rename' &&
      names.rail === 'inspector rename' && names.heading === 'inspector rename',
    `opened=${opened} ${JSON.stringify(names)}`)
}
```

> **Note on check 87's selector.** The nested `JSON.stringify` gymnastics above are wrong — write it plainly, the way check 89 does:
> ```js
> await wc.executeJavaScript(`
>   document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
>     .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
> ```
> Use that form in both places. (`JSON.stringify(targetId)` interpolates a quoted JS string literal into the evaluated source, which is why it sits outside the CSS quotes rather than inside them.)

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: `FAILED: 87, 88, 89` — every selector returns `null` because the placeholder inspector renders only its toggle and a `Panel` title. Read the printed details and confirm the failures say "null", i.e. the elements are absent, not that they hold the wrong text.

- [ ] **Step 3: Verify the panel header exposes what check 89 reads**

Run: `grep -n "panel__title\|data-panel-id" src/renderer/components/TerminalPanel.tsx`
If `.panel__title` is not the class the header renders, adjust check 89's selector to match what is there. **Do not add a class to `TerminalPanel.tsx` for the check's convenience** — the check reads production markup, and inventing a hook for it makes the check about itself.

- [ ] **Step 4: Write the inspector**

Replace the body of `src/renderer/shell/Inspector.tsx`:

```tsx
import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { InspectorModel, InspectorSummary } from './inspector-fields'
import { agentStateLabel } from './inspector-fields'
import { shellControl } from './shell-control'

export interface InspectorProps {
  onToggle: () => void
  /** null when nothing is selected — the launch state, and every background click. */
  model: InspectorModel | null
  summary: InspectorSummary
  onRename: (id: string, currentTitle: string) => void
  onClose: (id: string) => void
}

/**
 * The right inspector: what the selected panel actually is, and what the
 * canvas holds when nothing is selected.
 *
 * memo'd, and both its data props are frozen by Canvas — `model` on
 * inspectorSignature, `summary` on its own three numbers. Canvas re-renders on
 * every mousemove over the canvas (setCursor) and on every frame of a drag
 * (setPanelRect); without both halves this pane would rebuild at 60Hz for
 * rect changes it displays nothing about, the same trap SideRail documents.
 *
 * The toggle stays mounted when the inspector is collapsed, for the same
 * reason the rail's does: it is the only way back without ⇧⌘\.
 */
function InspectorImpl({ onToggle, model, summary, onRename, onClose }: InspectorProps): JSX.Element {
  return (
    <aside className="shell__inspector" aria-label="Inspector">
      <button
        type="button"
        className="shell__inspector-toggle"
        title="Hide the inspector (⇧⌘\)"
        aria-label="Hide the inspector"
        {...shellControl(onToggle)}
      >
        ›
      </button>
      <div className="shell__region-title">Panel</div>
      {model === null
        ? <InspectorEmpty summary={summary} />
        : <InspectorPanel model={model} onRename={onRename} onClose={onClose} />}
    </aside>
  )
}

export const Inspector = memo(InspectorImpl)

/**
 * Nothing selected. Deliberately a summary rather than a blank pane or a
 * "select a panel" instruction: the counts are the one thing a user cannot get
 * by looking at the canvas once it is larger than the viewport, and M8d's
 * cross-workspace counts land here rather than needing a new surface.
 */
function InspectorEmpty({ summary }: { summary: InspectorSummary }): JSX.Element {
  return (
    <div className="inspector__body" data-inspector-summary>
      <dl className="inspector__fields">
        <div className="inspector__field">
          <dt className="inspector__label">panels</dt>
          <dd className="inspector__value" data-summary="panels">{summary.panels}</dd>
        </div>
        <div className="inspector__field">
          <dt className="inspector__label">running</dt>
          <dd className="inspector__value" data-summary="running">{summary.running}</dd>
        </div>
        <div className="inspector__field">
          <dt className="inspector__label">waiting</dt>
          <dd className="inspector__value" data-summary="waiting">{summary.waiting}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * Its OWN useAgentState subscription, for the reason RailPanelRow's comment
 * gives: agent-state-store subscribes per panel id precisely so a change for
 * n3 notifies only whatever asked about n3. Lifting this into Canvas and
 * passing the state down would make every agent transition in the app a
 * Canvas re-render.
 *
 * A separate component rather than a branch inside InspectorImpl, because a
 * hook cannot be called conditionally and `model` is legitimately null.
 */
function InspectorPanel({
  model, onRename, onClose
}: { model: InspectorModel; onRename: (id: string, title: string) => void; onClose: (id: string) => void }): JSX.Element {
  const state = useAgentState(model.id)
  return (
    <div className="inspector__body">
      <div className="inspector__heading" data-inspector-heading>{model.heading}</div>
      <div className="inspector__state">
        {/*
          The ATTRIBUTE, not only a class: a class is a styling decision a
          restyle may rename, while data-agent-state is this pane's stated
          answer to "what is that agent doing" — the same split check 54 draws
          for the panel itself and RailPanelRow draws for its dot.
        */}
        <span className="inspector__dot" data-agent-state={state ?? 'none'} aria-hidden="true" />
        <span className="inspector__state-label">{agentStateLabel(state)}</span>
        {model.reattached && (
          /*
            M6a carried PanelStatus.running.reattached with ZERO readers, and
            CLAUDE.md records the spec's "a reattached panel visibly says so"
            criterion as deliberately unmet by that milestone. This is the
            reader that meets it.
          */
          <span className="inspector__badge" data-inspector-badge="reattached">reattached</span>
        )}
      </div>
      <dl className="inspector__fields">
        {model.fields.map((field) => (
          <div className="inspector__field" key={field.key} data-inspector-field={field.key}>
            <dt className="inspector__label">{field.label}</dt>
            <dd className="inspector__value">{field.value}</dd>
          </div>
        ))}
      </dl>
      <div className="inspector__actions">
        <button
          type="button"
          className="inspector__action"
          data-inspector-action="rename"
          title={`Rename ${model.heading}`}
          {...shellControl(() => onRename(model.id, model.title ?? ''))}
        >
          Rename…
        </button>
        <button
          type="button"
          className="inspector__action"
          data-inspector-action="close"
          title={`Close ${model.heading}`}
          {...shellControl(() => onClose(model.id))}
        >
          Close panel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire it in `Canvas.tsx`**

Add to the imports beside the existing `buildRailRows` line:

```tsx
import {
  buildInspectorModel, buildInspectorSummary, inspectorSignature, isRunning
} from '../shell/inspector-fields'
```

Immediately **after** the `railRows` memo (`const railRows = useMemo(() => railBuilt, [railSig])`), add:

```tsx
  /**
   * The inspector's model, frozen the same way the rail's rows are and for the
   * same reason: the selected panel comes straight out of `panels`, a fresh
   * array on every setPanelRect — i.e. every frame of a drag — and this pane
   * renders nothing about a rect.
   *
   * The dep array is the SIGNATURE, not the model: when the signature is
   * equal, the model is equal by construction, so returning the previous
   * object is not a stale read.
   */
  const selectedPanel = selectedId === null
    ? undefined
    : panels.find((p) => p.rect.id === selectedId)
  const inspectorBuilt = selectedPanel === undefined
    ? null
    : buildInspectorModel(selectedPanel, registry.get(selectedPanel.rect.id)?.status)
  const inspectorSig = inspectorSignature(inspectorBuilt)
  const inspectorModel = useMemo(() => inspectorBuilt, [inspectorSig])

  // Frozen on its three numbers for the same reason: a fresh object every
  // render defeats Inspector's memo on its own, whatever the model does.
  const summaryBuilt = buildInspectorSummary(
    panels, (id) => registry.get(id)?.status, waitingIds)
  const summarySig = `${summaryBuilt.panels}/${summaryBuilt.running}/${summaryBuilt.waiting}`
  const inspectorSummary = useMemo(() => summaryBuilt, [summarySig])
```

Replace the `<Inspector onToggle={chrome.toggleInspector} />` element at the end of the returned tree with:

```tsx
      <Inspector
        onToggle={chrome.toggleInspector}
        model={inspectorModel}
        summary={inspectorSummary}
        onRename={paletteActions.beginRenamePanel}
        onClose={paletteActions.closePanel}
      />
```

And rewrite the `canvas:counts` provider (`Canvas.tsx:637`) onto the shared predicate — this is the point of `isRunning` existing at all:

```tsx
    const offCounts = window.canvas.canvas.onCounts(() => ({
      panels: panelsRef.current.length,
      // The SAME predicate the inspector's summary uses. It was written inline
      // here until M8c; two derivations of "how many agents are running" agree
      // the day they are written and drift the first time one is wrong, and
      // the drift window here is exactly the moment a spawn is in flight —
      // which no check would ever happen to sample.
      running: panelsRef.current.filter((p) => isRunning(registry.get(p.rect.id)?.status)).length
    }))
```

- [ ] **Step 6: Add the styles**

Append to `src/renderer/styles.css`, after the `.rail-row__tail` block:

```css
/* The inspector's body. Scrolls on its own for the same reason .rail-list
   does: a long cwd plus an error message can exceed the pane's height, and a
   body that grew would push the collapse toggle off screen — the one control
   that is the way back from a collapse. */
.inspector__body {
  padding: 4px 12px 12px;
  overflow-y: auto;
  max-height: calc(100% - 60px);
}

.inspector__heading {
  color: var(--fg);
  font-size: 13px;
  margin-bottom: 8px;
  /* A resolved command is an absolute path and a title is user text; neither
     is bounded, and the pane is 260px. Break rather than overflow: the rail
     next door clips, but a path the user cannot read at all defeats the one
     question this pane exists to answer. */
  overflow-wrap: anywhere;
}

.inspector__state {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.inspector__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
  flex: none;
}

/* The same four colours the rail's dot uses. Kept as its own selector list
   rather than a shared class, because .rail-row__dot is 5px and this is 7px —
   sharing the rule would couple two sizes that have no reason to agree. */
.inspector__dot[data-agent-state="busy"] { background: var(--blue); }
.inspector__dot[data-agent-state="wants-you"] { background: var(--amber); }
.inspector__dot[data-agent-state="exited"] { background: var(--red); }

.inspector__state-label { color: var(--muted); font-size: 11px; }

.inspector__badge {
  margin-left: auto;
  padding: 1px 5px;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--muted);
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.inspector__fields { margin: 0; }

.inspector__field { margin-bottom: 8px; }

.inspector__label {
  color: var(--muted);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inspector__value {
  margin: 1px 0 0;
  color: var(--fg);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.inspector__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
}

.inspector__action {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
  font-size: 11px;
  text-align: left;
}

.inspector__action:hover { background: rgba(255, 255, 255, 0.06); }

/* Disabled is the restart control's resting state on a panel that never
   started (Task 6). Kept visible rather than hidden, per the rule
   verify:palette 31 states: a control that disappears is indistinguishable
   from a feature that is missing. */
.inspector__action:disabled {
  color: var(--muted);
  cursor: default;
  opacity: 0.55;
}
.inspector__action:disabled:hover { background: transparent; }
```

Also extend the collapse rule so the body hides with the region — find the existing block and add the new selector:

```css
.shell--rail-collapsed .shell__rail .rail-list,
.shell--rail-collapsed .shell__rail .shell__region-title,
.shell--inspector-collapsed .shell__inspector .shell__region-title,
.shell--inspector-collapsed .shell__inspector .inspector__body {
  display: none;
}
```

- [ ] **Step 7: Run everything and verify**

Run: `npm run typecheck && npm run build && npm run verify:panels`
Expected: `87, 88, 89` green; every pre-existing check still green. **Check 42 and check 73 especially** — both are about the palette's outside-click exit, and check 89 opens the palette from a shell control for the first time.

Run: `npm run verify:rail`
Expected: still `28/28`.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/shell/Inspector.tsx src/renderer/canvas/Canvas.tsx src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m8c): the inspector's read half, and one predicate for 'running'"
```

---

### Task 3: Save as preset — one implementation, reached from two surfaces

**Files:**
- Modify: `src/main/presets.ts` (add `presetFromCapture`)
- Modify: `src/main/index.ts` (menu path calls it; supply the new handler)
- Modify: `src/main/ipc.ts` (`PaletteHandlers.savePanel`, the handler)
- Modify: `src/shared/ipc-contract.ts` (channel + bridge member)
- Modify: `src/preload/index.ts` (bridge wiring)
- Modify: `src/renderer/palette/commands.ts` (`PaletteActions.savePanelAsPreset`)
- Modify: `src/renderer/canvas/Canvas.tsx` (the action, and the new Inspector prop)
- Modify: `src/renderer/shell/Inspector.tsx` (the button)
- Test: `scripts/verify-layout.cjs` (check 97), `scripts/verify-panels.cjs` (check 90); `verify:ipc` needs no edit — it derives the channel list from the contract.

**Interfaces:**
- Consumes: `CapturedPanel` from `@shared/ipc-contract`; `allPresets`, `mintPresetId`, `autoName` from `main/presets.ts`; `LayoutStore.addPreset`.
- Produces:
  - `presetFromCapture(user: Preset[], captured: CapturedPanel): Preset` — pure; mints the id, auto-names, preserves an absent `command`.
  - `IPC.PRESET_SAVE_PANEL = 'preset:save-panel'`; bridge `window.canvas.preset.savePanel(captured: CapturedPanel): Promise<void>`.
  - `PaletteActions.savePanelAsPreset(id: string): void`.
  - Inspector prop `onSavePreset: (id: string) => void`; DOM hook `[data-inspector-action="save-preset"]`.

**Why a new channel at all.** `preset:capture` is a main→renderer *request*, answered off `focusedIdRef.current`. The inspector describes the **selected** panel, and this app keeps `selectedId` and `focusedId` deliberately distinct — a rail row selects without focusing. Reusing the existing path would save a different panel than the pane is describing, silently, because the preset written is well-formed and merely wrong. Main stays the sole author of preset identity; `mintPresetId` and `autoName` do not move.

- [ ] **Step 1: Write the failing check for main's shared step**

Append to `scripts/verify-layout.cjs`, before the summary block (the file's last check is 96; `L` is its bundle handle — confirm the local variable name at the top of the file and use it):

```js
// 97. THE SHARED MINT. Both save surfaces — the menu's focused-panel path and
//     M8c's preset:save-panel invoke — go through this one function, so they
//     cannot disagree about what a saved preset is called or what id it gets.
//     Two copies would agree the day they were written and diverge the first
//     time one was edited, and the user's evidence would be two presets named
//     differently for the same panel depending on which surface saved it.
//
//     The absent-command clause is the one that matters most and is asserted
//     with `in`, not with a truthiness test: `command: undefined` is a
//     DIFFERENT fact from the key being absent, and it is the fact that
//     survives an IPC structured clone as `'command' in preset === true`.
//     Losing it makes every command-less preset spawn a hardcoded shell
//     instead of resolving the user's real login shell.
{
  const captured = { cwd: '/Users/x/proj', args: ['--foo'], w: 700, h: 400 }
  const p = L.presetFromCapture([], captured)
  const withCommand = L.presetFromCapture([p], { ...captured, command: '/opt/homebrew/bin/fish' })
  ok('97 presetFromCapture mints, names, and keeps an absent command absent',
    typeof p.id === 'string' && p.id.length > 0 &&
      p.id !== withCommand.id &&
      ('command' in p) === false &&
      withCommand.command === '/opt/homebrew/bin/fish' &&
      p.name.includes('login shell') && p.name.includes('proj') &&
      p.cwd === '/Users/x/proj' && p.args.length === 1 && p.args[0] === '--foo' &&
      p.w === 700 && p.h === 400,
    JSON.stringify([p, withCommand]))
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run verify:layout`
Expected: `FAILED: 97` — `L.presetFromCapture is not a function`, surfacing as a thrown TypeError or a false assertion depending on how the suite guards. Confirm the failure names the missing function.

- [ ] **Step 3: Extract the shared step in `src/main/presets.ts`**

Add after `autoName`:

```ts
/**
 * The one place a captured panel becomes a preset.
 *
 * Both save surfaces call this: the menu's focused-panel path and M8c's
 * preset:save-panel invoke from the inspector. It is main's because both of
 * its decisions are main's — `mintPresetId` has to see every existing id
 * including the built-ins, and `autoName` has to see every existing NAME to
 * de-duplicate. A renderer-side reconstruction would see neither.
 *
 * Rebuilt field by field rather than spread, the fourth site to obey the
 * absent-command rule: spreading `captured` would carry `command: undefined`
 * into the object, where `'command' in preset` then reads TRUE — a different
 * fact from the field being absent, and the one that survives an IPC
 * structured clone. Every command-less preset would start spawning a
 * hardcoded shell instead of the user's real login shell.
 */
export function presetFromCapture(user: Preset[], captured: CapturedPanel): Preset {
  return {
    id: mintPresetId(user),
    name: autoName(captured, allPresets(user)),
    cwd: captured.cwd,
    ...(captured.command !== undefined ? { command: captured.command } : {}),
    args: [...captured.args],
    w: captured.w,
    h: captured.h
  }
}
```

Add `CapturedPanel` to this file's type imports from `../shared/ipc-contract`. If `presets.ts` does not already import from there, add `import type { CapturedPanel } from '../shared/ipc-contract'` — it is a type-only import, so esbuild erases it and `verify:layout` stays in the plain-node tier.

- [ ] **Step 4: Run it and verify it passes**

Run: `npm run verify:layout`
Expected: `99/99 passed` (the suite's own count line; the last check number is now 97).

- [ ] **Step 5: Point the menu path at it, so there is provably one implementation**

In `src/main/index.ts`, replace the mint-and-add block inside `savePresetFromFocusedPanel`:

```ts
  const preset = presetFromCapture(layoutStore.presets(), captured)
  layoutStore.addPreset(preset)
  rebuildMenu()
```

Delete the now-unused local construction and drop `mintPresetId`/`autoName` from this file's imports **only if nothing else there uses them** (`grep -n "mintPresetId\|autoName" src/main/index.ts` first — `noUnusedLocals` will fail the build otherwise, which is the check working).

- [ ] **Step 6: Add the channel**

In `src/shared/ipc-contract.ts`, add to the `IPC` object beside `PRESET_SPAWN_BY_ID`:

```ts
  /**
   * Save a preset from a panel the RENDERER picked, rather than from whichever
   * panel is focused.
   *
   * The distinction is the whole reason this channel exists. PRESET_CAPTURE is
   * a main -> renderer request answered off focusedIdRef, which is right for
   * the menu item (there is no other panel a menu could mean) and wrong for
   * the inspector, which describes the SELECTED panel — an id this app keeps
   * deliberately distinct from the focused one, since a rail row selects
   * without focusing. Reusing capture there would save a different panel than
   * the pane is describing, and the preset it wrote would be well-formed and
   * merely wrong.
   *
   * Main still mints the id and the name (presetFromCapture): the renderer
   * can see neither the built-in ids nor the existing names.
   */
  PRESET_SAVE_PANEL: 'preset:save-panel',
```

And to the `preset` block of the bridge type:

```ts
    /** Save THIS panel as a preset. See PRESET_SAVE_PANEL. */
    savePanel(captured: CapturedPanel): Promise<void>
```

In `src/preload/index.ts`, beside `spawnById`:

```ts
    savePanel: (captured: CapturedPanel) => ipcRenderer.invoke(IPC.PRESET_SAVE_PANEL, captured),
```

In `src/main/ipc.ts`, add to `PaletteHandlers`:

```ts
  /**
   * The inspector's save. Handed in for the same reason `spawn` is: minting a
   * preset needs the layout store and a menu rebuild, both of which are
   * main/index.ts's.
   */
  savePanel(captured: CapturedPanel): void
```

…its type import, and the handler beside `PRESET_SPAWN_BY_ID`'s:

```ts
  ipcMain.handle(IPC.PRESET_SAVE_PANEL, (_event, captured: CapturedPanel) => {
    palette.savePanel(captured)
  })
```

In `src/main/index.ts`, add to the object passed as `palette`:

```ts
    savePanel: (captured) => {
      layoutStore.addPreset(presetFromCapture(layoutStore.presets(), captured))
      rebuildMenu()
    },
```

- [ ] **Step 7: Write the renderer half**

In `src/renderer/palette/commands.ts`, add to `PaletteActions` (required, never optional — the rule this interface already states twice):

```ts
  /**
   * Save one panel as a preset. Takes an id rather than reading the focused
   * panel, because the inspector acts on the SELECTED one and those are
   * deliberately different ids.
   *
   * Emits no Command row: the menu item already covers the focused-panel case,
   * and M6p sized the resting list on purpose.
   */
  savePanelAsPreset(id: string): void
```

In `Canvas.tsx`'s `paletteActions` memo, beside `startPanel`:

```ts
    savePanelAsPreset: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (!panel) return
      // spec.cwd is the SPAWN directory, not wherever the user has since cd'd
      // to — the same limit onCapture records; reading the real one means
      // asking the pid (ideas-backlog #4).
      const captured: CapturedPanel = {
        cwd: panel.spec.cwd,
        args: [...panel.spec.args],
        w: panel.rect.w,
        h: panel.rect.h
      }
      // Absent stays absent: a captured login-shell panel must save as a
      // login-shell preset, not as whatever this machine's shell happens to
      // be. Built field by field for the same reason onCapture is.
      if (panel.spec.command !== undefined) captured.command = panel.spec.command
      void window.canvas.preset.savePanel(captured).then(reloadPresets)
    },
```

Add `reloadPresets` to the memo's dep array if it is not already there (it is — `reloadPresets` appears in the existing list).

In `Inspector.tsx`, add `onSavePreset: (id: string) => void` to `InspectorProps`, thread it through `InspectorImpl` into `InspectorPanel`, and add the button between Rename and Close:

```tsx
        <button
          type="button"
          className="inspector__action"
          data-inspector-action="save-preset"
          title={`Save ${model.heading} as a preset`}
          {...shellControl(() => onSavePreset(model.id))}
        >
          Save as preset
        </button>
```

And in `Canvas.tsx`'s `<Inspector …>` element: `onSavePreset={paletteActions.savePanelAsPreset}`.

- [ ] **Step 8: Write the failing end-to-end check**

Append to `scripts/verify-panels.cjs`:

```js
// 90. SAVES THE SELECTED PANEL, NOT THE FOCUSED ONE.
//     Driven with the two ids DELIBERATELY DIFFERENT, which is the entire
//     check: taken with them equal it passes against the defect this channel
//     exists to remove — main's own preset:capture path, which answers off
//     focusedIdRef and would have saved the wrong panel every time the user
//     reached the inspector by clicking a rail row (the one gesture that
//     selects without focusing).
//
//     Both ids are read out of PRODUCTION MARKUP rather than through a test
//     hook, because neither hook answers this: __m4aSelection() returns the
//     focused terminal's TEXT selection (not an id, despite the name) and
//     __m4aSessions() reports {id, dormant, spawned} and no cwd. Widening
//     either one for this check would be adding a hook to observe something
//     the DOM already states — .panel--selected IS the selection, and DOM
//     focus living inside a panel IS that panel being focused.
//
//     The preset's subtitle carries its full cwd (presetRows builds it as
//     `command — cwd`), and the cwd is read off the inspector's own field
//     BEFORE saving. That field is already pinned by check 87, so it is a
//     legitimate source here rather than a second derivation.
{
  const before = await wc.executeJavaScript(`window.canvas.preset.list()`)
  const ids = await wc.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.rail-row')].map((r) => r.dataset.railRow)
    return rows
  })()`)
  const focusId = ids[0]
  const selectId = ids.find((id) => id !== focusId)
  // Focus one panel by clicking into its terminal, the way a user does.
  // Dispatched on .xterm-screen, never on .panel__slot: xterm binds its
  // listeners on .xterm, one level BELOW the slot, and capture-toward-target
  // traversal never visits a target's own descendants — the mistake CLAUDE.md
  // records as costing two fix rounds during M4a.
  await wc.executeJavaScript(`
    document.querySelector('.panel[data-panel-id="' + ${JSON.stringify('')}.slice(0,0) + JSON.stringify(${JSON.stringify(focusId)}).slice(1,-1) + '"] .xterm-screen')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  await settle()
  // Select a DIFFERENT one from the rail — selects and raises, never focuses.
  await wc.executeJavaScript(`
    document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(selectId)} + '"] .rail-row__main')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await settle()
  const observed = await wc.executeJavaScript(`(() => {
    const focusedEl = document.activeElement
    const focusedPanel = focusedEl && focusedEl.closest ? focusedEl.closest('.panel') : null
    const selectedPanel = document.querySelector('.panel--selected')
    const cwdEl = document.querySelector('[data-inspector-field="cwd"] .inspector__value')
    return {
      focused: focusedPanel ? focusedPanel.dataset.panelId : null,
      selected: selectedPanel ? selectedPanel.dataset.panelId : null,
      cwd: cwdEl ? cwdEl.textContent : null
    }
  })()`)
  await wc.executeJavaScript(`
    document.querySelector('[data-inspector-action="save-preset"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await settle()
  const after = await wc.executeJavaScript(`window.canvas.preset.list()`)
  const added = after.filter((p) => !before.some((b) => b.id === p.id))
  ok('90 the inspector saves the SELECTED panel, with focus deliberately elsewhere',
    observed.focused === focusId && observed.selected === selectId &&
      observed.focused !== observed.selected &&
      added.length === 1 && observed.cwd !== null &&
      added[0].subtitle.endsWith(observed.cwd),
    `${JSON.stringify(observed)} added=${JSON.stringify(added)}`)
}
```

> **Write the `focusId` selector plainly**, the way the `selectId` one below it is written — the nested `slice` above is noise:
> ```js
> document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(focusId)} + '"] .xterm-screen')
> ```

**Three prerequisites — verify each before writing the check, and fix whichever is missing:**

1. **The two fixture panels must have different cwds**, or `subtitle.endsWith(observed.cwd)` cannot discriminate. Run `grep -n "cwd" scripts/panels-entry.cjs`. **CONTROLLER RULING (pre-flight CONFLICT-4): reuse an existing panel with a distinct cwd before considering a new one** — check 43 already points one at a spaced temp directory. Adding a fixture panel changes the canvas's panel count, which several existing checks read, and an unrelated count check going red for a fixture reason is expensive to diagnose. Seed a new one only if no two LIVE panels differ, and say so in your report if you had to. **If you do seed one, the spaced path is a feature, not an accident** — `CLAUDE.md` records that a space-free fixture is exactly how the `pane-died` quoting bug survived eight reviews.
2. **`.panel--selected` must be the class a selected panel actually carries.** Run `grep -n "panel--selected" src/renderer/components/TerminalPanel.tsx`. If the selected state is expressed some other way, read it that way instead.
3. **Both panels must be LIVE**, or `.xterm-screen` is absent for the one being focused. `LIVE_BUDGET` is 8 and the fixture canvas is larger; pick the two ids from panels that currently have an `.xterm` under them:
   ```js
   const ids = await wc.executeJavaScript(
     `[...document.querySelectorAll('.panel')].filter((p) => p.querySelector('.xterm')).map((p) => p.dataset.panelId)`)
   ```
   Use that in place of reading the rail rows, and assert `ids.length >= 2` as part of the check so a fixture change that starves it fails loudly rather than passing with `selectId === undefined`.

- [ ] **Step 9: Run everything**

Run: `npm run verify:layout && npm run verify:ipc && npm run build && npm run verify:panels`
Expected: `verify:layout` 99/99; `verify:ipc` `1/1` with its printed channel list now **26 channels**; `verify:panels` with 90 green.

- [ ] **Step 10: Commit**

```bash
git add src/main/presets.ts src/main/index.ts src/main/ipc.ts src/shared/ipc-contract.ts \
        src/preload/index.ts src/renderer/palette/commands.ts src/renderer/canvas/Canvas.tsx \
        src/renderer/shell/Inspector.tsx scripts/verify-layout.cjs scripts/verify-panels.cjs
git commit -m "feat(m8c): save the selected panel as a preset, through main's own mint"
```

---

### Task 4: `dispose` returns its kill, and the restart sequence at the registry tier

**Files:**
- Modify: `src/renderer/session/session-registry.ts` (`dispose(id)` returns `Promise<void>`)
- Test: `scripts/verify-registry.cjs` (checks 21–23)

**Interfaces:**
- Produces: `Registry.dispose(id: PanelId): Promise<void>` — resolves when main has confirmed the kill. `disposeAll()` stays `void`; it has no production caller and nothing respawns after it.
- Produces: `Registry.bumpVersion(): void` — advances `version()` and notifies subscribers, and does nothing else.
- Consumed by: Task 6's `restartPanel`.

**`bumpVersion` is a controller ruling, added to this task after the pre-flight scan.**
The plan originally left Task 6 to solve this and flagged it as unresolved. It belongs here
instead, because it is a change to the registry's surface and this is the registry's task.

The problem it solves: `ensure()` deliberately does **not** `bump()` — its own comment says why,
namely that it is normally called while `Canvas` renders, and notifying a `useSyncExternalStore`
subscriber mid-render makes React warn about updating a component while rendering another. Restart
calls `ensure` from an **event handler**, outside render, where nothing else will trigger the
re-render that mounts the new handle's slot. So the restarted panel would sit there showing
nothing, with no error anywhere, until some unrelated interaction re-rendered the canvas.

The obvious existing member does not work: `focus(id)` bumps, but it also sets `lastFocusedAt` and
calls `handle.focus()`, which moves the keyboard — violating the shell's rule 2 ("shell controls
never take DOM focus"). Solving it by calling `ensure` during render does not work either: the
tiering memo's `ensure` early-returns for an existing session, so the fresh one would never be
created there at all.

**Why this changes at all.** The spec told M8c to rely on `PtyManager.kill` reaching `backend.destroy(panelId)` before the respawn. It does — but only because `ipcMain.handle(PTY_KILL)` is a synchronous handler, `PtyManager.kill` is synchronous, and the tmux backend's `destroy` bottoms out in `execFileSync`. Every link there is incidental. Make any of them async and the create overtakes the kill: `new-session -A` finds the doomed session still alive, attaches, and restart silently becomes a no-op returning the user to the agent they asked to replace. Returning the promise adds **no `pty.kill` call site** — it is the same single call with its result no longer discarded — and moves the ordering into the restart code where it can be read.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-registry.cjs`, before the summary block, inside the existing async IIFE:

```js
  // 21. THE RESTART SEQUENCE. Restart is dispose-then-ensure at ONE id, and
  //     this is that sequence driven directly, without a renderer.
  //
  //     The clauses that carry weight are the ones about IDENTITY: the new
  //     session must be a DIFFERENT object with a DIFFERENT handle, because
  //     term.open() runs at most once ever and a reused Terminal is a panel
  //     that renders nothing with no error anywhere. And it must be NOT
  //     dormant — an ensure that inherited dormancy would leave a restarted
  //     panel refusing to spawn, which looks exactly like a restart that did
  //     nothing.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const first = registry.get('p1')
    const firstHandle = first.handle

    await registry.dispose('p1')
    registry.ensure('p1', SPEC, { dormant: false })
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const second = registry.get('p1')

    ok('21 restart disposes and re-ensures at the same id, with a fresh handle and no dormancy',
      first !== second && second.id === 'p1' &&
        second.handle !== firstHandle &&
        second.dormant === false && second.spawned === true &&
        bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'p1' &&
        bridge.calls.create.length === 2 &&
        bridge.calls.create[0].panelId === 'p1' && bridge.calls.create[1].panelId === 'p1',
      `kills=${JSON.stringify(bridge.calls.kill)} creates=${bridge.calls.create.length}`)
  }

  // 22. THE ORDERING GUARANTEE restart depends on. dispose() must RESOLVE
  //     after the bridge's kill has resolved, or awaiting it buys nothing and
  //     the respawn can overtake the destroy — under tmux, `new-session -A`
  //     then reattaches to the very session the restart meant to replace and
  //     the whole verb becomes a silent no-op.
  //
  //     The fake kill is deliberately made SLOW and the create is recorded
  //     against a flag the kill flips. A check that only awaited dispose()
  //     and asserted "it resolved" passes against `dispose(id) { …; void
  //     bridge.pty.kill(id) }` returning undefined, because `await undefined`
  //     resolves immediately and truthfully.
  {
    const { bridge, registry } = setup()
    let killFinished = false
    bridge.pty.kill = async (id) => {
      bridge.calls.kill.push(id)
      await new Promise((r) => setTimeout(r, 20))
      killFinished = true
    }
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    await registry.dispose('p1')
    ok('22 dispose resolves only after main has confirmed the kill',
      killFinished === true, `killFinished=${killFinished}`)
  }

  // 24. bumpVersion advances version() and does NOTHING else.
  //     The "nothing else" half is the whole reason it exists rather than
  //     reusing focus(), which also bumps: focus() moves the keyboard, and a
  //     restart that stole focus would violate the shell's rule 2 — silently,
  //     because the panel would look right and the next keystroke would land
  //     somewhere the user did not choose.
  {
    const { factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const state = factory.made.get('p1')
    const focusedBefore = state.focused
    const stampBefore = registry.lastFocusedAt().p1
    let notified = 0
    const off = registry.subscribe(() => { notified += 1 })
    const before = registry.version()
    registry.bumpVersion()
    const after = registry.version()
    off()
    ok('24 bumpVersion advances version and notifies, without touching focus',
      after === before + 1 && notified === 1 &&
        state.focused === focusedBefore &&
        registry.lastFocusedAt().p1 === stampBefore,
      `version ${before} -> ${after}, notified=${notified}, focused ${focusedBefore} -> ${state.focused}`)
  }

  // 23. The OLD handle is never written to again. pty:data arrives on one
  //     subscription for the whole canvas, keyed by panel id, so a restart
  //     that left the disposed handle reachable would route the NEW process's
  //     output into a disposed terminal — a restarted panel that stays blank
  //     while its agent runs perfectly well, with nothing in any log.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const oldState = factory.made.get('p1')
    const writtenBefore = oldState.written.length

    await registry.dispose('p1')
    registry.ensure('p1', SPEC, { dormant: false })
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    bridge.emitData({ panelId: 'p1', data: 'after restart' })

    ok('23 output after a restart reaches the new handle, never the disposed one',
      oldState.disposed === true &&
        oldState.written.length === writtenBefore &&
        registry.get('p1').handle !== undefined,
      `disposed=${oldState.disposed} writes ${writtenBefore} -> ${oldState.written.length}`)
  }
```

> **Note:** `factory.made` is a `Map` keyed by panel id and `fakeFactory` **overwrites** the entry on a second `create(id)`. Capture `oldState` **before** the second `ensure`, as written above. If a later reader "tidies" that capture to after, check 23 silently asserts things about the new handle instead.

- [ ] **Step 2: Run them and watch 22 fail**

Run: `npm run verify:registry`
Expected: **21 and 23 pass, 22 fails.** That split is the point and worth pausing on: the sequence already works today (21, 23 green) because main's synchrony happens to order it correctly; only 22 — the check about the *guarantee* rather than the *outcome* — is red. If 22 passes before you change anything, the fake kill is not actually slow; fix the fixture before proceeding, because a green 22 against `void bridge.pty.kill(id)` proves nothing.

- [ ] **Step 3: Return the promise**

In `src/renderer/session/session-registry.ts`, change the interface declaration:

```ts
  /**
   * One of exactly TWO callers of pty.kill in this file; disposeAll is the
   * other. A tier change must never reach either.
   *
   * Returns the kill's promise rather than discarding it, and that is M8c's
   * one change here. Restart is dispose-then-ensure at the same id, and under
   * tmux the destroy MUST complete before the respawn or `new-session -A`
   * reattaches to the very session the restart meant to replace. That ordering
   * happens to hold today anyway — ipcMain.handle(PTY_KILL) is synchronous
   * down to an execFileSync — but every link in that chain is incidental to
   * this file, and the failure it guards is completely silent: the restart
   * appears to do nothing at all. Returning the promise makes the ordering a
   * property of the caller that needs it. The four call sites that do not
   * respawn ignore the result, correctly.
   */
  dispose(id: PanelId): Promise<void>
```

…and the implementation's tail:

```ts
    async dispose(id) {
      const session = sessions.get(id)
      // …every existing comment in this method stays exactly as it is…
      const killed = bridge.pty.kill(id)
      if (session) bump()
      await killed
    },
```

**Note the ordering inside:** `bump()` must still run before the await, not after. The local teardown is already done at that point and the subscribers need to hear about it on the same tick they always have; moving the bump behind the await would delay every close by one IPC round trip and make `verify:panels`' close checks flaky for a reason nothing points at.

Add the member beside `version` in both the interface and the returned object:

```ts
  /**
   * Advance version() and notify, and do nothing else.
   *
   * Exists for exactly one caller: restart, which calls ensure() from an EVENT
   * HANDLER rather than during render. ensure() deliberately does not bump —
   * see its own comment: it normally runs while Canvas renders, and notifying a
   * useSyncExternalStore subscriber mid-render makes React warn about updating
   * one component while rendering another. Outside render that protection
   * becomes a gap: nothing re-renders, so the new handle's host is never
   * mounted and the restarted panel shows nothing at all, with no error.
   *
   * focus(id) would also bump, and is the tempting one-liner — but it sets
   * lastFocusedAt and calls handle.focus(), moving the keyboard. A shell
   * control that moves focus violates the rule shell-control.ts exists to
   * enforce, and it fails silently: the panel looks right and the user's next
   * keystroke goes somewhere they did not choose.
   */
  bumpVersion(): void
```

…implemented as `bumpVersion: () => bump(),` in the returned object.

- [ ] **Step 4: Run and verify**

Run: `npm run verify:registry`
Expected: `29/29 passed` (25 before, plus 21–24).

Run: `npm run typecheck`
Expected: clean. If `Canvas.tsx`'s four existing `registry.dispose(id)` statements now trip a "floating promise" complaint, they will not — the repo has no linter and `tsc` does not flag unawaited promises. Leave them unawaited; none of them respawns.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/session/session-registry.ts scripts/verify-registry.cjs
git commit -m "test(m8c): dispose returns its kill, so restart can order the respawn"
```

---

### Task 5: A restarted tmux session is a different process

**Files:**
- Test: `scripts/verify-pty-manager.cjs` (check 20)

**Interfaces:** consumes only the existing `PtyManager` and tmux backend. No source changes — this task proves the behaviour restart relies on, at the tier that can actually see a pid.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-pty-manager.cjs`, inside the tmux block (the one guarded by the "skipped loudly when no tmux binary is found" branch), after check 19:

```js
    // 20. THE MIRROR OF CHECK 12, and the single assertion that separates a
    //     real restart from a reattach.
    //
    //     Check 12 pins that detach-then-create is the SAME pid — that is the
    //     whole of M4c's reload survival. Restart is the opposite claim about
    //     the same two calls with kill() in the middle instead of detachAll(),
    //     and every OTHER observable is identical between the two: the session
    //     name is the same, the client count returns to 1, list() reports one
    //     session either way. Only the pane pid tells them apart.
    //
    //     Without this check, a restart that forgot backend.destroy would show
    //     `new-session -A` reattaching to the surviving session — the user
    //     presses Restart, the agent keeps running, and nothing anywhere says
    //     the verb did not happen.
    {
      const h = makeHarness(tmuxBackend)
      await h.manager.create(spec('r1'))
      await sleep(700)
      const before = tmuxCli(['-L', VERIFY_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const beforePid = (/r1 (\d+)/.exec(before) ?? [])[1]

      h.manager.kill('r1')
      await sleep(500)
      const between = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])

      await h.manager.create(spec('r1'))
      await sleep(700)
      const after = tmuxCli(['-L', VERIFY_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const afterPid = (/r1 (\d+)/.exec(after) ?? [])[1]

      ok('20 restarting kills the session and respawns a DIFFERENT process at the same panel id',
        beforePid && afterPid && beforePid !== afterPid &&
          between.includes('r1') === false &&
          after.includes('r1'),
        `pid ${beforePid} -> ${afterPid}, session between: ${JSON.stringify(between.trim())}`)
      h.manager.kill('r1')
    }
```

The middle clause — the session is **gone** between the kill and the create — is what keeps the check honest if pids are ever recycled by the OS: a different pid alone is strong evidence, an absent session in between is proof the destroy happened.

- [ ] **Step 2: Run it**

Run: `npm run verify:pty-manager`
Expected: `25/25 passed` — **this check should pass immediately**, because `PtyManager.kill` has reached `backend.destroy(panelId)` since M4c. It is a *characterisation* check, and that is fine and deliberate: it pins behaviour Task 6 is about to depend on, in the one suite that can see a pid. Say so in the commit message rather than pretending it was ever red.

If tmux is absent on the machine, the suite skips this block **loudly**. Do not call Task 5 done on a skip — run it somewhere with tmux before the milestone closes, because this is the only check that can catch the ordering hazard Task 4 exists to remove.

- [ ] **Step 3: Fault-inject once, to prove it discriminates**

Temporarily comment out `this.getBackend().destroy(panelId)` in `PtyManager.kill`'s second (has-a-local-session) branch. Run `npm run verify:pty-manager`. Expected: **20 red**, with the same pid before and after and `r1` still listed in between. Restore and re-run. Record the result in the commit message — this is the only evidence that check 20 is not merely describing tmux to itself.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-pty-manager.cjs
git commit -m "test(m8c): a restart is a different pid, and destroy is what makes it one"
```

---

### Task 6: Restart in place

**Files:**
- Modify: `src/renderer/shell/inspector-fields.ts` (export `isRestartable`)
- Modify: `src/renderer/palette/commands.ts` (`PaletteActions.restartPanel`, `PanelRow.restartable`, the `Restart panel…` row, a new reason constant)
- Modify: `src/renderer/canvas/Canvas.tsx` (the verb, `panelRows` carrying `restartable`, the Inspector prop)
- Modify: `src/renderer/shell/Inspector.tsx` (the button, disabled when not restartable)
- Test: `scripts/verify-rail.cjs` (25b), `scripts/verify-palette.cjs` (66, 66b), `scripts/verify-panels.cjs` (91–94)

**Interfaces:**
- Consumes: `Registry.dispose(id): Promise<void>` (Task 4), `Registry.ensure(id, spec, { dormant: false })`, `clearAgentState(id)` from `@renderer/session/agent-state-store`.
- Produces:
  - `isRestartable(status: PanelStatus | undefined): boolean`
  - `PaletteActions.restartPanel(id: string): void`
  - `PanelRow.restartable: boolean`
  - `REASON_NOT_STARTED = 'that panel has not started'`
  - Inspector prop `onRestart: (id: string) => void`; DOM hook `[data-inspector-action="restart"]`.

**The sequence, and why each line is where it is:**

```
clearAgentState(id)        // BEFORE the dispose, so a wants-you border cannot
                           // survive into the new session — main's `create`
                           // sends `starting` directly and will re-seed it.
await registry.dispose(id) // The kill, confirmed. One call site, unchanged.
registry.ensure(id, spec,  // Fresh handle; term.open() runs at most once ever.
  { dormant: false })      // Explicit, not inherited: a dormant re-ensure is a
                           // restart that silently refuses to spawn.
```

Nothing else. No history push — the rect does not move, and "one history entry per committed gesture" is about gestures that change the panel array. No confirm. No `pty.kill`. The respawn itself is React's: `TerminalPanel`'s slot effect deps on `session.handle.host`, so the new handle's new host re-runs it into `onSlotMount` → `attachSlot` → `spawn`.

- [ ] **Step 1: Write the failing checks — the pure tier first**

Insert into `scripts/verify-rail.cjs` immediately **after check 25**, not at the end — a lettered sub-check that sits three checks away from the check it qualifies reads as an unrelated one, and this file's other sub-checks (`41b`, `58b`, `65b`) all sit beside their parents:

```js
// 25b. The gate as an exported predicate, because Canvas's panelRows needs the
//      SAME answer for the palette's Restart row. Two copies of "can this be
//      restarted" would let the inspector offer the verb while the palette
//      refused it for the same panel, on screen at the same time.
ok('25b isRestartable is the gate, exported',
  R.isRestartable(running(1, '/bin/zsh')) === true &&
    R.isRestartable({ kind: 'starting' }) === true &&
    R.isRestartable({ kind: 'exited', code: 0 }) === true &&
    R.isRestartable({ kind: 'error', message: 'x' }) === true &&
    R.isRestartable({ kind: 'idle' }) === false &&
    R.isRestartable(undefined) === false)
```

Append to `scripts/verify-palette.cjs`, before its summary block (the file's last check is 65c; reuse its existing `ctx`/`actions` fixture helpers rather than building new ones):

```js
// 66. The Restart row exists, is aimed at the CAPTURED panel, and runs the
//     verb. Aimed at capturedId for the same reason Rename is: opening the
//     palette moves DOM focus to the input but deliberately leaves focusedId
//     alone, and that captured id is what every panel-acting command targets.
{
  const c = ctx({
    capturedId: 'n1',
    panels: [{ id: 'n1', label: '/bin/zsh', restartable: true }]
  })
  const row = byId(P.buildCommands(c), 'panel.restart')
  row.run()
  ok('66 the restart row is present, enabled, and aimed at the captured panel',
    row !== undefined && row.disabledReason === undefined &&
      c.actions.calls[0][0] === 'restartPanel' &&
      c.actions.calls[0][1] === 'n1',
    JSON.stringify(c.actions.calls))
}

// 66b. DISABLED, NOT ABSENT, when the captured panel never started — and the
//      reason must be the not-started one, NOT the no-focus one. Those are
//      different situations with different fixes ("click a panel" vs "start
//      this panel"), and collapsing them tells the user to do the thing they
//      already did. A row that vanished instead would be indistinguishable
//      from a feature that was never built — the rule check 31 states.
//
//      The two reasons are compared against the EXPORTED constants, never
//      against string literals: a literal here would keep passing while the
//      constant said something else entirely.
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
```

**The fixture idiom above is the file's real one, verified against `verify-palette.cjs` before this
plan was written** — `ctx(over)` builds a full `PaletteContext` with `actions: spyActions()`,
`byId(list, id)` finds a row, `P.` is the bundle handle, and `c.actions.calls[i]` is
`[methodName, ...args]`. Do not invent `buildCommands`/`ctxWith` helpers; they do not exist.

**CONTROLLER RULING (pre-flight CONFLICT-1): `spyActions()` needs a `restartPanel` recorder, added
in this same commit.** `PaletteActions` members are required by global constraint, and `spyActions()`
builds its object by hand — so a row whose `run()` calls a missing `actions.restartPanel` throws a
TypeError rather than failing an assertion. Add `restartPanel: record('restartPanel')` beside its
siblings. (Task 3 does the same for `savePanelAsPreset`; if that recorder is missing when you get
here, add it too rather than leaving the fixture half-wired.)

**CONTROLLER RULING (row placement): `Restart panel…` is NOT `hiddenAtRest`, and it uses the
`withReason(row, reason)` wrapper.** Its sibling `Rename panel…` is neither hidden nor pushed as a
bare two-argument call — read that push at `commands.ts:212-231` and mirror it exactly. Both rows
are single rows aimed at `capturedId` in the `panel` section, and an asymmetry between two adjacent
rows is a surprise rather than a design.

- [ ] **Step 2: Run both and watch them fail**

Run: `npm run verify:rail && npm run verify:palette`
Expected: `verify:rail` `FAILED: 25b`; `verify:palette` `FAILED: 66, 66b`. Confirm 66/66b fail because the row is **absent** (`row === undefined`), which is the honest starting state.

- [ ] **Step 3: Implement the pure halves**

In `inspector-fields.ts`, add the exported predicate and use it in `buildInspectorModel`:

```ts
/**
 * Can this panel be restarted? Spawned only — running, starting, exited or
 * errored.
 *
 * Exported rather than inlined into buildInspectorModel because the palette's
 * Restart row needs the SAME answer: two copies would let the inspector offer
 * the verb while the palette refused it for the same panel, both on screen at
 * once. Exited is deliberately included — "run that again" is most of why the
 * verb exists. `idle` and `undefined` are the never-started cases, and those
 * already have their own verb with its own affordance (M8b's start control,
 * and the card that says "click to start"); a second one here would undo the
 * separation M8b's rule 1 draws between navigating and waking.
 */
export function isRestartable(status: PanelStatus | undefined): boolean {
  return status !== undefined && status.kind !== 'idle'
}
```

…and in `buildInspectorModel`, replace the inline expression with `restartable: isRestartable(status)`.

In `commands.ts`: add `restartable: boolean` to `PanelRow` (**required**, for the reason this interface's siblings already state — an optional flag lets a half-finished wiring compile while the row is silently always-disabled or always-enabled); export `export const REASON_NOT_STARTED = 'that panel has not started'` beside the other reasons; add `restartPanel(id: string): void` to `PaletteActions` with a doc comment recording that this is the **one** verb M8 adds that earns a `Command` row, because unlike close and start it has no other gesture anywhere; and emit the row immediately after the `panel.rename` row, mirroring its shape:

```ts
    out.push(
      withReason(
        {
          id: 'panel.restart',
          title: 'Restart panel…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.restartPanel(ctx.capturedId!)
        },
        // Two different blocked situations with two different fixes: "click a
        // panel first" and "this panel has not started". Collapsing them into
        // one reason tells a user who HAS focused a panel to focus a panel.
        ctx.capturedId === null
          ? REASON_NO_FOCUS
          : (target?.restartable === true ? undefined : REASON_NOT_STARTED)
      )
    )
```

Note the shape: `withReason(row, reason)`, exactly as the `panel.rename` push directly above it
does, and **no `hiddenAtRest`** — see the row-placement ruling above. Reuse the `target` const the
rename block already computes if the two pushes end up in one block; do not compute it twice.

**This adds a row to an existing section rather than a new section, so `SECTIONS` is untouched** —
but run `npm run build && npm run verify:panels` anyway before calling the task done. `CLAUDE.md`
records M7 leaving `verify:panels` 48 red for two whole tasks because a palette change was verified
only in the plain-node tier, and check 48 asserts the rendered section headers.

- [ ] **Step 4: Implement the verb**

In `Canvas.tsx`'s `paletteActions` memo, beside `savePanelAsPreset`:

```ts
    /**
     * Restart in place: end this panel's process and start a fresh one at the
     * same id, the same rect and the same spec.
     *
     * Three things about the sequence are load-bearing.
     *
     * clearAgentState FIRST, before the dispose. Agent state survives a
     * panel's closure by design, so without this a panel restarted out of
     * wants-you keeps its amber border — a restarted agent inheriting a dead
     * one's question. main's `create` sends `starting` directly (it is the one
     * state nothing ever transitions INTO), so the new session re-seeds it.
     *
     * AWAIT the dispose. Under tmux the session must be destroyed before the
     * respawn or `new-session -A` reattaches to the very session this was
     * meant to replace, and the restart becomes a silent no-op. dispose()
     * returns the kill's promise for exactly this caller.
     *
     * ensure with dormant FALSE, explicitly. Inheriting dormancy would leave
     * the panel refusing to spawn, which looks identical to a restart that did
     * nothing at all.
     *
     * No history entry: the panel array does not change, so there is no
     * gesture to undo. No confirm: the process this ends is the one the user
     * asked to replace. And no pty.kill — dispose() is still one of exactly
     * two callers, both inside session-registry.ts.
     */
    restartPanel: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (!panel) return
      if (!isRestartable(registry.get(id)?.status)) return
      clearAgentState(id)
      void registry.dispose(id).then(() => {
        // Re-checked rather than captured: the await is a real gap, and the
        // panel can be closed inside it. Re-ensuring a closed panel would
        // resurrect a session with no panel able to reach it — the orphan
        // dispose()'s own comment exists to prevent.
        if (!panelsRef.current.some((p) => p.rect.id === id)) return
        registry.ensure(id, panel.spec, { dormant: false })
        // ensure() deliberately does not bump — it is normally called during
        // render, where notifying a subscriber makes React warn — so nothing
        // here would re-render to mount the new handle's slot, and the panel
        // would show nothing at all with no error anywhere. dispose() already
        // bumped, but that bump is a tick stale by the time this resolves.
        // NOT focus(): it bumps too, but it also moves the keyboard, which a
        // shell control must never do (shell-control.ts's whole purpose).
        registry.bumpVersion()
      })
    },
```

Add `restartable` to the `panelRows` memo's row construction:

```ts
    { id: p.rect.id, label: panelLabel(p), restartable: isRestartable(registry.get(p.rect.id)?.status) }
```

…in **both** branches of its existing `title !== undefined` conditional, and import `isRestartable` alongside the other `inspector-fields` imports.

In `Inspector.tsx`, add `onRestart: (id: string) => void` to `InspectorProps`, thread it through, and render it as the **first** action:

```tsx
        <button
          type="button"
          className="inspector__action"
          data-inspector-action="restart"
          disabled={!model.restartable}
          title={model.restartable
            ? `Restart ${model.heading} — ends the running process and starts it again`
            : `${model.heading} has not started yet`}
          {...shellControl(() => onRestart(model.id))}
        >
          Restart
        </button>
```

The `title` is where the warning lives. There is no confirm — decided, not deferred — so the control itself has to say that it ends a running process, including when that process is mid-question.

And in `Canvas.tsx`'s `<Inspector …>`: `onRestart={paletteActions.restartPanel}`.

- [ ] **Step 5: Write the end-to-end checks**

Append to `scripts/verify-panels.cjs`:

```js
// 91. THE REATTACHED BADGE — M6a's outstanding success criterion, met.
//     CLAUDE.md records PanelStatus.running.reattached as a live field with
//     ZERO readers and the spec's "a reattached panel visibly says so"
//     criterion as deliberately unmet. This is the check that meets it.
//
//     It runs its OWN reload rather than borrowing check 26's, for the reason
//     check 39's comment gives about the same temptation: coupling to another
//     check's setup makes this one fail for reasons that have nothing to do
//     with the badge. Skipped LOUDLY without tmux — the direct backend has no
//     reattachment to display, so a green here on a tmux-free machine would
//     be a lie about coverage.
if (!TMUX) {
  console.log('SKIP  91 the reattached badge — no tmux binary; reattachment is unreachable')
} else {
  const before = await settledSessionMap(wc)
  wc.reload()
  await waitUntil(async () => (await liveCount(wc)) > 0, 15000)
  await settle()
  const targetId = [...before.keys()][0]
  await wc.executeJavaScript(`
    document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await settle()
  const badge = await wc.executeJavaScript(
    `document.querySelectorAll('[data-inspector-badge="reattached"]').length`)
  const after = await sessionMap(wc)
  ok('91 a panel whose session survived a reload says so in the inspector',
    badge === 1 && after.get(targetId) === before.get(targetId),
    `badge=${badge} pid ${before.get(targetId)} -> ${after.get(targetId)}`)
}

// 92. RESTART: a different process, and no inherited question.
//     Both halves in one read, because each alone passes against a real bug.
//     The pid alone is satisfied by a restart that leaves the old amber
//     border in place; the cleared state alone is satisfied by a "restart"
//     that only calls clearAgentState and never touches the process.
//
//     The bell is rung exactly the way check 54 rings one — copy that
//     mechanism rather than inventing a second, since a bell that never
//     reaches main makes this check green for the wrong reason.
{
  const sessions = await settledSessionMap(wc)
  const targetId = [...sessions.keys()].find((id) =>
    // Live panels only: a carded panel has no .xterm and cannot be selected
    // through a click into its terminal.
    true)
  await wc.executeJavaScript(`
    document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await settle()
  /* ---- ring a real bell into targetId, exactly as check 54 does ---- */
  const waiting = await waitUntil(async () => await wc.executeJavaScript(
    `document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"]')
       .getAttribute('data-agent-state') === 'wants-you'`), 8000)
  const pidBefore = (await sessionMap(wc)).get(targetId)
  await wc.executeJavaScript(`
    document.querySelector('[data-inspector-action="restart"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  const respawned = await waitUntil(async () => {
    const m = await sessionMap(wc)
    const pid = m.get(targetId)
    return pid !== undefined && pid !== pidBefore ? pid : false
  }, 12000)
  await settle()
  const state = await wc.executeJavaScript(
    `document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"]')
       .getAttribute('data-agent-state')`)
  const relive = await wc.executeJavaScript(
    `document.querySelectorAll('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"] .xterm').length`)
  ok('92 restart replaces the process and does not inherit the old wants-you',
    waiting === true && respawned !== false && respawned !== pidBefore &&
      state !== 'wants-you' && relive === 1,
    `pid ${pidBefore} -> ${respawned} state=${state} xterm=${relive}`)
}

// 93. DISABLED, NOT ABSENT, on a panel that never started. A restart control
//     that vanished would read as a feature that is missing; one that ran
//     would end a process that does not exist and re-ensure a session the
//     user never asked to start — waking a panel from a verb whose name says
//     the opposite.
//
//     CONTROLLER RULING (pre-flight CONFLICT-5): the target is FOUND at run
//     time, not named. The plan first pointed this at the dormant panel check
//     39 seeds — but M8b's check 85 clicks that panel's start control and
//     asserts it wakes, so by the time this check runs it is spawned and
//     `restartable` is legitimately true. The check would then fail against a
//     fixture that no longer describes it, and read as a broken disabled-gate.
//     Asserting that a never-started panel was FOUND is half the check: without
//     it, `undefined` flows into the selector and the failure says nothing.
{
  const dormantId = await wc.executeJavaScript(
    `(window.__m4aSessions().find((s) => s.dormant === true || s.spawned === false) || {}).id || null`)
  await wc.executeJavaScript(`
    document.querySelector('.rail-row[data-rail-row="' + ${'${JSON.stringify(dormantId)}'} + '"] .rail-row__main')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await settle()
  const control = await wc.executeJavaScript(`(() => {
    const el = document.querySelector('[data-inspector-action="restart"]')
    return el ? { present: true, disabled: el.disabled } : { present: false }
  })()`)
  ok('93 restart is present and disabled for a panel that never started',
    dormantId !== null && control.present === true && control.disabled === true,
    `dormantId=${'${dormantId}'} control=${'${JSON.stringify(control)}'}`)
}

// 94. THE TWO COUNTS THIS MILESTONE MOVES, re-derived rather than trusted.
//     CLAUDE.md records that the dispose call-site count went stale once
//     already — it said two while the reset handler had made it three — so
//     M8c pins both numbers in a check instead of in prose alone. Reading the
//     SOURCE is the point: no runtime behaviour can observe how many callers
//     a function has, and the invariant is about the source.
//
//     When a later milestone legitimately adds a dispose call site, this
//     check goes red and the number is updated DELIBERATELY, with the reason
//     in the commit message. That is the whole mechanism.
{
  const registrySrc = readFileSync(
    join(__dirname, '..', 'src', 'renderer', 'session', 'session-registry.ts'), 'utf8')
  const canvasSrc = readFileSync(
    join(__dirname, '..', 'src', 'renderer', 'canvas', 'Canvas.tsx'), 'utf8')
  const kills = (registrySrc.match(/bridge\.pty\.kill\(/g) ?? []).length
  const disposes = (canvasSrc.match(/registry\.dispose\(/g) ?? []).length
  ok('94 pty.kill still has exactly two callers, and Canvas has five dispose sites',
    kills === 2 && disposes === 5, `kills=${kills} disposes=${disposes}`)
}
```

**Three things to settle while writing these:**
- Check 92's `targetId` selection is a stub — pick a panel that is **live** (has an `.xterm`), the same way Task 3's check 90 prerequisite 3 describes, and assert you found one rather than letting `undefined` flow into a selector.
- Check 92's bell: read check 54 and reuse its exact mechanism. Do not invent one.
- Check 93 finds its target at run time per the ruling in its own comment. If `__m4aSessions()` returns no never-started panel at that point in the run, seed one the way check 39 does — that check already establishes seeding a dormant panel with its own reload as the supported pattern — and say in your report that you had to.
- Check 94 needs `readFileSync` and `join` in scope; both are likely already imported at the top of the file — confirm with `grep -n "require('node:fs')\|readFileSync" scripts/verify-panels.cjs` and add to the existing import rather than a second one.

- [ ] **Step 6: Run everything**

Run: `npm run verify:rail && npm run verify:palette && npm run build && npm run verify:panels`
Expected: all green. If check 94 reports `disposes=4`, the restart verb is not routing through `registry.dispose` — find out why before changing the number.

- [ ] **Step 7: Fault-inject check 92, both halves**

- Remove `clearAgentState(id)` from `restartPanel`. Expected: **92 red** on `state === 'wants-you'`. Restore.
- Replace `await registry.dispose(id)` with a bare `registry.dispose(id)` (unawaited) and run under tmux. Expected: either 92 red on an unchanged pid, or green — **and if it is green, say so plainly in the commit message.** The race may not reproduce on this machine, because main's kill path is synchronous today. Task 4's check 22 is what actually pins the guarantee; this injection only tells you whether the race is currently observable.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/shell/inspector-fields.ts src/renderer/shell/Inspector.tsx \
        src/renderer/palette/commands.ts src/renderer/canvas/Canvas.tsx \
        scripts/verify-rail.cjs scripts/verify-palette.cjs scripts/verify-panels.cjs
git commit -m "feat(m8c): restart in place, and the two counts pinned in a check"
```

---

### Task 7: The documentation, and the counts that go stale

**Files:**
- Modify: `CLAUDE.md` (the verify table, the load-bearing details, the IPC diagram)
- Modify: `README.md` (the milestone row, the M8 prose)
- Test: `npm run verify` end to end

This is not paperwork. `CLAUDE.md`'s verify table is how the next reader knows what a check number means, and this repo has already been bitten twice by a count in that table being wrong (`registry.dispose`'s call sites, `verify:panels` 48's `ORDER` array).

- [ ] **Step 1: Re-derive every count that moved — do not trust this plan's numbers**

```bash
npm run verify:rail    | tail -3
npm run verify:palette | tail -3
npm run verify:layout  | tail -3
npm run verify:registry| tail -3
npm run verify:ipc     | tail -3
npm run verify:panels  | tail -3
grep -c "registry.dispose(" src/renderer/canvas/Canvas.tsx
grep -c "bridge.pty.kill(" src/renderer/session/session-registry.ts
grep -n "registry.dispose" src/renderer/canvas/Canvas.tsx
```

Write down what each actually printed. The table entries must say the printed totals, and where a suite's count and its last check number differ because of lettered sub-checks, say **both** — that is the convention every existing row follows.

- [ ] **Step 2: Update `CLAUDE.md`'s verify table**

Amend these rows with what Step 1 printed:
- **`verify:rail`** — M8c's inspector model: the link-by-link fields, the shared `isRunning` predicate, the summary's phantom filter, the restart gate, the signature.
- **`verify:registry`** — 21–23, and note that **22 is the one worth knowing by number**: it pins that `dispose` resolves *after* main confirms the kill, which is the only thing making the awaited restart meaningful; 21 and 23 pass today without it.
- **`verify:pty-manager`** — 20, the mirror of 12, and the note that it was verified by fault injection rather than by ever being red.
- **`verify:layout`** — 97, the shared mint.
- **`verify:palette`** — 66/66b, and the two distinct disabled reasons.
- **`verify:ipc`** — 26 channels, up from 25 at M7.
- **`verify:panels`** — 87–94, with 90 and 94 flagged as the two worth knowing by number: 90 is the only check driven with `selectedId ≠ focusedId` on purpose, and 94 pins the two counts prose alone has already lost once.

- [ ] **Step 3: Update `CLAUDE.md`'s architecture and load-bearing sections**

- The IPC diagram: add `preset:save-panel` to the invoke list.
- **"Undo removing a panel must dispose its session"** — the call-site count moves from four to five. Re-derive it with the documented grep and update both the number and the list of what the sites are. Add restart, and say why it is not a sixth `pty.kill` caller.
- A new entry, **"`dispose` returns its kill, and restart is the only caller that cares"** — the ordering hazard, why it holds today by accident, and what `verify:registry` 22 pins.
- A new entry, **"The inspector shows the links, not the answer"** — that the pane deliberately does not collapse the honest chain, and that `verify:rail` 21 fails against the collapsed version.
- A new entry, **"One predicate for 'running'"** — `isRunning`, shared by the summary and `canvas:counts`, and that `starting` counts.
- Amend **"The header's honest chain"** — it says the resolved command is never copied back into `PanelSpec`; the inspector is now a third reader of `PanelStatus` and must obey the same rule.
- Amend **"`reattached` costs a probe"** — its last paragraph says "M6a carries the fact and stops there — nothing renders it yet" and that the success criterion "is deliberately NOT met by this milestone". **M8c meets it.** Rewrite that paragraph rather than leaving a claim the code has outgrown; `CLAUDE.md` itself warns that its prose is not re-derived the way its counts are.
- Amend **"Auto-repeat is one gesture"**'s neighbours if any list of `PaletteActions` members is enumerated anywhere — `restartPanel` and `savePanelAsPreset` join it.

- [ ] **Step 4: Update `README.md`**

- Add the milestone row: `| M8c | The inspector: what a panel is, and restart in place | ✅ done |`
- The M8 prose section (around line 259) describes the shell as adding "no verb of its own". That stops being true with restart, which is M8's one new capability. Amend that sentence rather than leaving it — and say what restart is: dispose-and-re-ensure at the same panel id, which under tmux means the session is destroyed and a genuinely different process starts, not a reattach.
- Mention that a reattached panel now says so, closing M6a's outstanding criterion.

- [ ] **Step 5: Run the whole suite**

Run: `npm run verify`
Expected: every suite green, ending with `verify:panels`.

Then run the pre-release gate, since this milestone touched a native-adjacent path (`pty.kill`'s return value crosses the preload bridge):

Run: `npm run verify:packaged`
Expected: 9/9. If tmux is unavailable, say so rather than reporting a pass.

- [ ] **Step 6: Update the knowledge graph**

Run: `graphify update .`
(Per the global instruction: `graphify-out/graph.json` exists in projects that use it — skip if it does not. Use the `update` subcommand form, never the `--update` flag.)

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs(m8c): the inspector, restart, and the counts re-derived"
```

---

## Self-Review

Run against the spec's M8c section after the plan is complete:

- **Read half** — editable title (Task 2, check 89), agent state with its label (Task 1 check 16, Task 2), resolved `command` and `cwd` (Task 1 checks 21–22, Task 2 check 87), `pid` (check 87), `exited <code>` (check 23), `reattached` badge (check 24, check 91). ✅
- **Empty state** — panel count, running, waiting (Task 1 check 18, Task 2 check 88). ✅
- **Act half** — Rename through `beginRenamePanel` (check 89), Save as preset (Task 3), Close through `onClosePanel` (Task 2), Restart (Task 6). ✅
- **Restart's five spec bullets** — `dispose` + fresh `ensure`, never a direct `pty.kill` (Task 6, check 94); destroy before respawn (Task 4 check 22, Task 5 check 20); the `Terminal` is not reused (Task 4 check 21); agent state cleared and re-seeded (Task 6 check 92); not destructive, no confirm (Task 6, decided in the spec amendment). ✅
- **The spec's named checks** — `verify:registry` restart/dormancy (21), `verify:pty-manager` different pid (20), `verify:panels` resolved command / badge / cleared wants-you / caller count (87, 91, 92, 94), plus the amended `verify:rail`, `verify:layout` and `verify:ipc` entries. ✅
- **Success criterion 4** — "a reattached panel visibly says so" — Task 2 renders it, check 91 proves it, Task 7 corrects the two places that record it as unmet. ✅
- **Type consistency** — `InspectorModel`/`InspectorSummary`/`InspectorField` defined in Task 1 and used unchanged in Tasks 2, 3, 6; `isRestartable` introduced in Task 6 and back-fitted into `buildInspectorModel` in the same task; `PaletteActions.savePanelAsPreset` and `.restartPanel` named identically at every call site. ✅

**Known soft spots, flagged rather than hidden:**
- ~~Task 6's post-`ensure` notifier was left as an unresolved stand-in.~~ **Resolved by controller ruling before execution:** `Registry.bumpVersion()`, implemented in Task 4 with its own check 24. The two wrong answers it avoids — `focus()` steals the keyboard, calling `ensure` during render never creates the session because the tiering memo early-returns — are both recorded at Task 4.
- Task 5's check 20 passes on first write. It is a characterisation check by design, and Step 3's fault injection is what earns it.
- Check 91 needs tmux. Without it the milestone's headline criterion is unproven on that machine.
