# M5b: Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app one typed surface — `Cmd+K` — that runs commands, manages presets, jumps between panels, and pastes saved prompts into the focused terminal.

**Architecture:** A renderer overlay rendered as a sibling of `.world` (never inside it — a `scale()` ancestor would shrink it and put it in the coordinate space `pointer-correct.ts` rewrites). Pure modules at the bottom (`fuzzy.ts`, `palette-model.ts`, `commands.ts`) bundled into a new plain-node suite; React only at the top. Preset and prompt mutations are renderer→main invokes, inverting M5a's main→renderer direction, because the palette belongs to the renderer while the menu belonged to main.

**Tech Stack:** TypeScript, React 19 (no StrictMode), Electron 43, esbuild-bundled plain-node verify suites. No new dependencies — the renderer runs under `default-src 'self'`.

**Spec:** `docs/superpowers/specs/2026-08-25-m5b-command-palette-design.md`

## Global Constraints

- **No new runtime dependencies.** The fuzzy matcher is hand-written; the renderer's CSP forbids CDN scripts and remote assets.
- **Absence stays absence.** `command` absent means "the user's login shell" everywhere it travels. Never spread a preset/prompt object in a way that carries `command: undefined`; build payloads by construction, as `templateOf` does.
- **Every new `IPC` channel gets a main-process handler in the same task.** `verify:ipc` walks `Object.values(IPC)` and fails otherwise.
- **`tsconfig.node.json` / `tsconfig.web.json` set `noUnusedLocals` and `noUnusedParameters`** — prefix intentionally-unused params with `_`.
- **Comments explain *why*.** Match the density of the surrounding code; a non-obvious line with no reason attached will be "fixed" later.
- **Commits are conventional and scoped:** `feat(m5b): ...`, `test(m5b): ...`, `docs(m5b): ...`.
- **Check numbering continues where each suite left off:** `verify:layout` next is 42, `verify:panels` next is 33, `verify:viewport` next is 49. `verify:palette` is new and starts at 1.
- **`npm run verify` must be green before the milestone is claimed done.** It is the whole verification story; there is no unit runner and no linter.

## File structure

New:

| File | Responsibility |
|---|---|
| `src/renderer/palette/fuzzy.ts` | Subsequence match + score. Pure; no DOM, no React. |
| `src/renderer/palette/palette-model.ts` | Filter a `Command[]`, move/clamp the selection over runnable rows. Pure. |
| `src/renderer/palette/commands.ts` | Build the `Command[]` from plain data + callbacks. Pure. |
| `src/renderer/palette/usePalette.ts` | Open/close state, the `Cmd+K` binding, focus capture and restore. |
| `src/renderer/palette/Palette.tsx` | The view: input, grouped list, keyboard handling. |
| `src/main/prompts.ts` | Read `.claude/commands/*.md` under a cwd, capped. Merge with the saved store. |
| `scripts/palette-entry.cjs` | Bundle entry for the pure palette modules. |
| `scripts/verify-palette.cjs` | The new plain-node suite. |

Modified: `src/shared/layout-schema.ts`, `src/shared/ipc-contract.ts`, `src/preload/index.ts`, `src/main/layout-store.ts`, `src/main/presets.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/renderer/canvas/Canvas.tsx`, `src/renderer/canvas/useViewport.ts`, `src/renderer/canvas/viewport.ts`, `src/renderer/styles.css`, `scripts/verify-layout.cjs`, `scripts/verify-viewport.cjs`, `scripts/verify-panels.cjs`, `scripts/panels-entry.cjs`, `package.json`, `README.md`, `CLAUDE.md`.

---

### Task 1: `fuzzy.ts`, `palette-model.ts`, and the `verify:palette` suite

**Files:**
- Create: `src/renderer/palette/fuzzy.ts`
- Create: `src/renderer/palette/palette-model.ts`
- Create: `scripts/palette-entry.cjs`
- Create: `scripts/verify-palette.cjs`
- Modify: `package.json` (two script entries)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `fuzzyMatch(query: string, target: string): { score: number; positions: number[] } | null`
  - `interface Command { id: string; title: string; subtitle?: string; group: CommandGroup; disabledReason?: string; run(): void }`
  - `type CommandGroup = 'Panel' | 'Preset' | 'Prompt' | 'Canvas'`
  - `filterCommands(commands: Command[], query: string): Command[]`
  - `firstRunnable(commands: Command[]): number`
  - `stepRunnable(commands: Command[], from: number, delta: 1 | -1): number`

`Command` lives in `palette-model.ts` (not `commands.ts`) so the pure filter module does not import from the module that builds the list.

- [ ] **Step 1: Write the bundle entry**

`scripts/palette-entry.cjs`:

```js
/* Bundle entry for the palette's pure modules. No DOM, no React, no native
   dependency, so the suite runs under plain node — the same tier as
   viewport-entry.cjs. Palette.tsx and usePalette.ts are deliberately absent:
   they are the React layer, and pulling them in would drag react into a
   bundle that exists precisely to avoid needing a renderer. */
module.exports = {
  ...require('../src/renderer/palette/fuzzy'),
  ...require('../src/renderer/palette/palette-model'),
  ...require('../src/renderer/palette/commands')
}
```

(`commands.ts` arrives in Task 2. Until then the require fails, which is why Step 2's first run must be done after Step 3 creates a stub — see below.)

- [ ] **Step 2: Write the failing checks**

`scripts/verify-palette.cjs`:

```js
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
```

- [ ] **Step 3: Create empty modules so the bundle resolves, then run the suite**

```sh
mkdir -p src/renderer/palette
printf 'export {}\n' > src/renderer/palette/fuzzy.ts
printf 'export {}\n' > src/renderer/palette/palette-model.ts
printf 'export {}\n' > src/renderer/palette/commands.ts
node scripts/verify-palette.cjs
```

Expected: every check FAILs (`P.fuzzyMatch is not a function` surfaces as a thrown TypeError on check 1). **Watch it fail before writing any implementation.** If the bundle itself fails to build, fix the entry before continuing — a suite that cannot build is not a failing test.

- [ ] **Step 4: Implement `fuzzy.ts`**

```ts
/**
 * The palette's matcher. Hand-written rather than a dependency: the renderer
 * runs under a strict CSP (default-src 'self'), and a matcher small enough to
 * test exhaustively is cheaper than a dependency decision.
 *
 * Pure — no DOM, no React — which is what puts it in the plain-node
 * verify:palette tier alongside palette-model.ts.
 */

export interface FuzzyMatch {
  score: number
  /** Indices into the ORIGINAL target, so the view can highlight them. */
  positions: number[]
}

/** What counts as the start of a word, for the boundary bonus. */
const BOUNDARY = /[\s\-_/.]/

const CONTIGUOUS_BONUS = 10
const BOUNDARY_BONUS = 8
/** Small, and capped, so "earlier" breaks ties without outweighing structure. */
const EARLINESS_MAX = 4

/**
 * Greedy leftmost subsequence match. Returns null when `query` is not a
 * subsequence of `target` at all — the palette needs "remove this row", not
 * "rank it last".
 *
 * Greedy, not optimal: for 'ab' against 'a-ab' it takes the first 'a' and
 * scores lower than the contiguous 'ab' later in the string. Optimal matching
 * is a dynamic program over both strings, and the difference only shows up in
 * ranking, never in whether a row appears. Not worth the cost until a real
 * query ranks visibly wrongly.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query === '') return { score: 0, positions: [] }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const positions: number[] = []
  let ti = 0

  for (const ch of q) {
    // A space SEPARATES terms rather than being matched: "new pan" should find
    // "New panel", and every real separator in a target is already scored as a
    // word boundary below.
    if (ch === ' ') continue
    let found = -1
    while (ti < t.length) {
      const here = ti
      ti += 1
      if (t[here] === ch) {
        found = here
        break
      }
    }
    if (found === -1) return null
    positions.push(found)
  }

  // A query of nothing but spaces matched nothing and excluded nothing.
  if (positions.length === 0) return { score: 0, positions: [] }

  let score = 0
  for (let i = 0; i < positions.length; i += 1) {
    const p = positions[i]
    if (i > 0 && p === positions[i - 1] + 1) score += CONTIGUOUS_BONUS
    if (p === 0 || BOUNDARY.test(target[p - 1])) score += BOUNDARY_BONUS
  }
  score += Math.max(0, EARLINESS_MAX - positions[0])
  return { score, positions }
}
```

- [ ] **Step 5: Implement `palette-model.ts` and fix the harness exit line**

```ts
import { fuzzyMatch } from './fuzzy'

/**
 * The palette's list model: what a row is, how a query narrows the list, and
 * how the selection moves. Pure — the React layer in Palette.tsx owns no
 * decisions this file can make.
 */

export type CommandGroup = 'Panel' | 'Preset' | 'Prompt' | 'Canvas'

export interface Command {
  id: string
  title: string
  /** Second line: a cwd, a preset's command, a prompt's source. */
  subtitle?: string
  group: CommandGroup
  /**
   * Present means unrunnable, and says WHY. The same rule menuLabel() states
   * for the preset submenu: a greyed-out row with no reason is a bug report.
   */
  disabledReason?: string
  run(): void
}

const haystack = (c: Command): string => (c.subtitle ? `${c.title} ${c.subtitle}` : c.title)

/**
 * Narrow by query, best first, ties in CONSTRUCTION order.
 *
 * Stability is load-bearing, not tidiness: construction order is what carries
 * the grouping (Panel, then Preset, then Prompt, then Canvas), and an unstable
 * sort would reshuffle equally-scoring rows on every keystroke.
 *
 * Disabled rows are kept. They exist to explain themselves.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const scored: Array<{ command: Command; score: number; order: number }> = []
  commands.forEach((command, order) => {
    const match = fuzzyMatch(query, haystack(command))
    if (match) scored.push({ command, score: match.score, order })
  })
  scored.sort((a, b) => (b.score - a.score) || (a.order - b.order))
  return scored.map((s) => s.command)
}

const runnable = (c: Command | undefined): boolean => c !== undefined && c.disabledReason === undefined

/** The row Enter would run on a fresh list, or -1 when there is no such row. */
export function firstRunnable(commands: Command[]): number {
  const index = commands.findIndex((c) => runnable(c))
  return index
}

/**
 * The next runnable row in `delta`'s direction, wrapping.
 *
 * Returns -1 when nothing is runnable, which the view must tell apart from
 * "row 0": returning 0 there would let Enter run a disabled command. `from`
 * may be out of range — the list shrinks under the selection on every
 * keystroke — and is normalised rather than trusted.
 */
export function stepRunnable(commands: Command[], from: number, delta: 1 | -1): number {
  const n = commands.length
  if (n === 0) return -1
  const start = from >= 0 && from < n ? from : delta === 1 ? -1 : 0
  for (let step = 1; step <= n; step += 1) {
    const index = (((start + delta * step) % n) + n) % n
    if (runnable(commands[index])) return index
  }
  return -1
}
```

- [ ] **Step 6: Add the npm scripts**

In `package.json`, after `"verify:layout"`:

```json
    "verify:palette": "node scripts/verify-palette.cjs",
```

and insert it into the `verify` chain immediately after `verify:layout` (it is a plain-node suite, so it belongs in the fast group before the build):

```json
    "verify": "npm run verify:viewport && npm run verify:registry && npm run verify:layout && npm run verify:palette && npm run verify:tmux && npm run verify:pty && npm run verify:pty-manager && npm run verify:window && npm run verify:ipc && npm run build && npm run verify:canvas && npm run verify:xterm && npm run verify:panels",
```

- [ ] **Step 7: Run the suite and the typecheck**

```sh
npm run verify:palette
npm run typecheck:web
```

Expected: `18/18 checks passed`, and a clean typecheck. `commands.ts` is still the `export {}` stub — that is fine; Task 2 fills it.

- [ ] **Step 8: Commit**

```sh
git add src/renderer/palette scripts/palette-entry.cjs scripts/verify-palette.cjs package.json
git commit -m "test(m5b): the palette's matcher and list model, and a suite for them"
```

---

### Task 2: `commands.ts` — the list, built from data

**Files:**
- Modify: `src/renderer/palette/commands.ts` (replacing the stub)
- Modify: `scripts/verify-palette.cjs` (checks 19–30)

**Interfaces:**
- Consumes: `Command`, `CommandGroup` from `palette-model.ts` (Task 1).
- Produces:
  - `interface PresetRow { id: string; name: string; available: boolean; builtIn: boolean; isDefault: boolean; subtitle: string }`
  - `interface PromptRow { id: string; name: string; source: 'saved' | 'project' }`
  - `interface PanelRow { id: string; label: string }`
  - `interface PaletteActions { spawnPreset(id): void; beginRenamePreset(id, currentName): void; deletePreset(id): void; setDefaultPreset(id): void; goToPanel(id): void; insertPrompt(id): void; beginSavePrompt(): void; deletePrompt(id): void; resetCanvas(): void; zoomToFit(): void }`
  - `interface PaletteContext { presets: PresetRow[]; prompts: PromptRow[]; panels: PanelRow[]; capturedId: string | null; hasSelection: boolean; actions: PaletteActions }`
  - `buildCommands(ctx: PaletteContext): Command[]`
  - The exported reason constants: `REASON_NO_FOCUS`, `REASON_NO_SELECTION`, `REASON_BUILT_IN_RENAME`, `REASON_BUILT_IN_DELETE`, `REASON_PROJECT_PROMPT`, `REASON_NOT_ON_PATH`, `REASON_ALREADY_DEFAULT`

`buildCommands` is pure — it takes **data and callbacks**, never the registry. That is the same dependency-injection move `session-registry.ts` makes to stay plain-node testable, and it is what lets these checks run without an Electron window.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-palette.cjs`, before the `const failed = ...` tally:

```js
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
    resetCanvas: record('resetCanvas'),
    zoomToFit: record('zoomToFit')
  }
}

const ctx = (over = {}) => ({
  presets: [],
  prompts: [],
  panels: [],
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
  const order = []
  for (const r of rows) if (order[order.length - 1] !== r.group) order.push(r.group)
  ok('30 groups are built in a fixed order',
    order.join(',') === 'Panel,Preset,Prompt,Canvas', order.join(','))
}
```

- [ ] **Step 2: Run the checks and watch 19–30 fail**

```sh
npm run verify:palette
```

Expected: checks 1–18 PASS, 19–30 FAIL (`P.buildCommands is not a function`).

- [ ] **Step 3: Implement `commands.ts`**

```ts
import type { Command } from './palette-model'

/**
 * The palette's command list, built from PLAIN DATA and callbacks.
 *
 * Nothing here touches the registry, the DOM, or IPC — that is what keeps it
 * in the plain-node verify:palette tier, the same dependency-injection move
 * session-registry.ts makes with its bridge and terminal factory. The callers
 * of these callbacks live in Canvas.tsx, where the registry actually is.
 */

/** A preset as the palette needs it: main answers preset:list with these. */
export interface PresetRow {
  id: string
  name: string
  /** Its command is on the resolved login PATH. Only main can know this. */
  available: boolean
  /** Built-ins are code, not data: they refuse rename and delete. */
  builtIn: boolean
  isDefault: boolean
  /** cwd, and the command if there is one. Searchable via filterCommands. */
  subtitle: string
}

export interface PromptRow {
  id: string
  name: string
  /** 'saved' is the store in layout.json; 'project' is .claude/commands. */
  source: 'saved' | 'project'
}

export interface PanelRow {
  id: string
  label: string
}

export interface PaletteActions {
  spawnPreset(id: string): void
  beginRenamePreset(id: string, currentName: string): void
  deletePreset(id: string): void
  setDefaultPreset(id: string): void
  goToPanel(id: string): void
  insertPrompt(id: string): void
  beginSavePrompt(): void
  deletePrompt(id: string): void
  resetCanvas(): void
  zoomToFit(): void
}

export interface PaletteContext {
  presets: PresetRow[]
  prompts: PromptRow[]
  panels: PanelRow[]
  /**
   * focusedId as it was when the palette OPENED, not now. Opening moves DOM
   * focus to the input; the app-level focus is deliberately left alone, and
   * every panel-acting command targets the panel the user was in.
   */
  capturedId: string | null
  hasSelection: boolean
  actions: PaletteActions
}

// Reasons are exported so the checks assert the same strings the user reads,
// rather than a paraphrase that can drift away from the UI.
export const REASON_NO_FOCUS = 'no focused panel'
export const REASON_NO_SELECTION = 'select some text in a panel first'
export const REASON_BUILT_IN_RENAME = "built-in presets can't be renamed"
export const REASON_BUILT_IN_DELETE = "built-in presets can't be deleted"
export const REASON_PROJECT_PROMPT = 'this prompt is a file in your project'
export const REASON_NOT_ON_PATH = 'not found on PATH'
export const REASON_ALREADY_DEFAULT = 'already the default'

/** Present-means-unrunnable, so an undefined reason must not become a key. */
const withReason = (command: Command, reason: string | undefined): Command =>
  reason === undefined ? command : { ...command, disabledReason: reason }

/**
 * Build the whole list, in the order the user sees it with an empty query.
 *
 * Group order is Panel, Preset, Prompt, Canvas and it is load-bearing:
 * filterCommands sorts stably, so construction order IS the grouping.
 */
export function buildCommands(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []

  for (const panel of ctx.panels) {
    out.push({
      id: `panel.goto.${panel.id}`,
      title: `Go to ${panel.label}`,
      group: 'Panel',
      run: () => actions.goToPanel(panel.id)
    })
  }

  for (const preset of ctx.presets) {
    out.push(
      withReason(
        {
          id: `preset.spawn.${preset.id}`,
          title: `New panel from ${preset.name}`,
          subtitle: preset.subtitle,
          group: 'Preset',
          run: () => actions.spawnPreset(preset.id)
        },
        preset.available ? undefined : REASON_NOT_ON_PATH
      )
    )
    out.push(
      withReason(
        {
          id: `preset.rename.${preset.id}`,
          title: `Rename preset ${preset.name}`,
          group: 'Preset',
          run: () => actions.beginRenamePreset(preset.id, preset.name)
        },
        preset.builtIn ? REASON_BUILT_IN_RENAME : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `preset.delete.${preset.id}`,
          title: `Delete preset ${preset.name}`,
          group: 'Preset',
          run: () => actions.deletePreset(preset.id)
        },
        preset.builtIn ? REASON_BUILT_IN_DELETE : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `preset.default.${preset.id}`,
          title: `Make ${preset.name} the Cmd+N default`,
          group: 'Preset',
          run: () => actions.setDefaultPreset(preset.id)
        },
        preset.isDefault ? REASON_ALREADY_DEFAULT : undefined
      )
    )
  }

  for (const prompt of ctx.prompts) {
    // The source is on the ROW, and same-named prompts are never merged:
    // pasting the wrong project's context into an agent is silent and costly.
    const subtitle = prompt.source === 'project' ? 'project — .claude/commands' : 'saved'
    out.push(
      withReason(
        {
          id: `prompt.insert.${prompt.id}`,
          title: `Insert prompt: ${prompt.name}`,
          subtitle,
          group: 'Prompt',
          run: () => actions.insertPrompt(prompt.id)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `prompt.delete.${prompt.id}`,
          title: `Delete prompt: ${prompt.name}`,
          subtitle,
          group: 'Prompt',
          run: () => actions.deletePrompt(prompt.id)
        },
        prompt.source === 'project' ? REASON_PROJECT_PROMPT : undefined
      )
    )
  }

  out.push(
    withReason(
      {
        id: 'prompt.save',
        title: 'Save selection as prompt',
        group: 'Prompt',
        run: () => actions.beginSavePrompt()
      },
      // Which one is missing, not just that something is: "no focused panel"
      // and "select some text" send the user to two different actions.
      ctx.capturedId === null
        ? REASON_NO_FOCUS
        : ctx.hasSelection
          ? undefined
          : REASON_NO_SELECTION
    )
  )

  out.push({
    // "Reset zoom", not "Zoom to fit": useViewport exposes resetViewport
    // (Cmd+0's INITIAL) and deliberately not fitTo (Cmd+1), because the camera
    // setter stays private and only named verbs get out. The row says what it
    // does rather than what the spec first called it.
    id: 'canvas.fit',
    title: 'Reset zoom',
    subtitle: 'Cmd+0',
    group: 'Canvas',
    run: () => actions.zoomToFit()
  })
  out.push({
    id: 'canvas.reset',
    title: 'Reset canvas…',
    group: 'Canvas',
    run: () => actions.resetCanvas()
  })

  return out
}
```

- [ ] **Step 4: Run the checks**

```sh
npm run verify:palette && npm run typecheck:web
```

Expected: `30/30 checks passed`.

- [ ] **Step 5: Commit**

```sh
git add src/renderer/palette/commands.ts scripts/verify-palette.cjs
git commit -m "feat(m5b): the command list, built from data and callbacks"
```

---

### Task 3: The overlay, and the four focus rules

This is the task the milestone exists for. Everything after it is a list of commands plugged into a surface that already handles the keyboard correctly.

**Files:**
- Create: `src/renderer/palette/usePalette.ts`
- Create: `src/renderer/palette/Palette.tsx`
- Modify: `src/renderer/canvas/useViewport.ts` (stand-down predicate)
- Modify: `src/renderer/canvas/Canvas.tsx` (mount, paste guard, actions)
- Modify: `src/renderer/styles.css`
- Modify: `scripts/verify-panels.cjs` (checks 33–36)

**Interfaces:**
- Consumes: `buildCommands`, `PaletteContext`, `PaletteActions` (Task 2); `filterCommands`, `firstRunnable`, `stepRunnable`, `Command` (Task 1).
- Produces:
  - `usePalette(deps: { focusedIdRef: RefObject<string | null>; restoreFocus(id: string): void }): PaletteController`
  - `interface PaletteController { open: boolean; capturedId: string | null; openPalette(): void; closePalette(): void; isOpen: () => boolean }`
  - `<Palette controller={...} actions={...} presets={...} prompts={...} panels={...} hasSelection={...} />`
  - `useViewport(..., shouldIgnoreKeys?: () => boolean)` — a sixth, optional, referentially-stable parameter.

Task 3 wires the palette to **presets and panels only**; prompt data arrives in Task 10 and is passed as an empty array until then, so this task ends with a working, testable overlay.

- [ ] **Step 1: Write the failing checks (33–36) in `verify-panels.cjs`**

Append after the current check 32, before the tally. The helpers `ok`, `waitUntil`, `sleep` and the `wc` handle already exist in the file; reuse them exactly as the surrounding checks do.

```js
  // 33. Cmd+K opens the palette and takes DOM focus OFF the terminal.
  //     This is the whole milestone in one assertion: xterm reads its own
  //     hidden textarea and nothing else, so moving DOM focus to the input is
  //     what stops bare keys reaching the PTY — no global key swallowing
  //     required. Bound as a RENDERER keydown, not a menu accelerator, for the
  //     same reason Cmd+N is: a main-process accelerator would never receive
  //     a dispatched KeyboardEvent, so this check could not exist.
  {
    await wc.executeJavaScript(`
      document.querySelector('.panel__slot .xterm-helper-textarea')?.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    `)
    const state = await waitUntil(
      () => wc.executeJavaScript(`(() => {
        const el = document.activeElement
        return {
          open: document.querySelector('.palette') !== null,
          onInput: el !== null && el.classList.contains('palette__input'),
          onTerminal: el !== null && el.classList.contains('xterm-helper-textarea')
        }
      })()`),
      2000
    )
    ok('33 Cmd+K opens the palette and moves DOM focus off xterm',
      state.open && state.onInput && !state.onTerminal, JSON.stringify(state))
  }

  // 34. Canvas shortcuts stand down while it is open. Cmd+N typed while
  //     filtering must not ALSO spawn a panel — useViewport's window keydown
  //     listener sees every key regardless of what has DOM focus, so the
  //     palette has to tell it to stand down.
  {
    const before = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
    await wc.executeJavaScript(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))
    `)
    await sleep(300)
    const after = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
    ok('34 Cmd+N does not spawn while the palette is open', before === after, `${before} -> ${after}`)
  }

  // 35. Cmd+V while the palette is open fills the INPUT, not the PTY. main's
  //     menu accelerator sends edit:paste unconditionally, and Canvas routes it
  //     into the focused session — so without a guard the text lands in a
  //     running agent, invisibly, while the user watches an empty text field.
  {
    const MARK = 'M5BPASTEMARK'
    wc.send('edit:paste', MARK)
    const seen = await waitUntil(
      () => wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        return { inInput: input !== null && input.value.includes('${MARK}'),
                 inTerminal: window.__m4aCellToScreen('${MARK}') !== null }
      })()`),
      2000
    )
    ok('35 a menu paste with the palette open reaches the input, not the PTY',
      seen.inInput && !seen.inTerminal, JSON.stringify(seen))
  }

  // 36. Escape closes and gives the keyboard BACK. Without this the user
  //     presses Escape, types, sees nothing happen, and concludes they
  //     mis-clicked. SessionHandle.focus() exists for exactly this.
  {
    await wc.executeJavaScript(`
      document.querySelector('.palette__input')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    `)
    const state = await waitUntil(
      () => wc.executeJavaScript(`(() => {
        const el = document.activeElement
        return {
          closed: document.querySelector('.palette') === null,
          onTerminal: el !== null && el.classList.contains('xterm-helper-textarea')
        }
      })()`),
      2000
    )
    ok('36 Escape closes the palette and restores the terminal', state.closed && state.onTerminal,
      JSON.stringify(state))
  }
```

These checks run inside the same async IIFE as the existing ones and depend on a panel already being focused — place them **after** an existing check that leaves a panel focused (the file focuses panels via `.panel__slot` clicks earlier); if the nearest preceding check has cleared focus, focus one explicitly first with the same click sequence the earlier checks use.

- [ ] **Step 2: Build and run, and watch 33–36 fail**

```sh
npm run build && npm run verify:panels
```

Expected: 1–32 PASS, 33–36 FAIL (there is no `.palette` element). **Do not continue until you have seen this output.**

- [ ] **Step 3: Implement `usePalette.ts`**

```ts
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Who owns the keyboard.
 *
 * M5a deferred preset editing here by name: "building a preset-manager dialog
 * now would be the first modal in this app, and it would collide with xterm's
 * keyboard focus — the same problem M5b has to solve properly and once." This
 * hook is that once, and the rules are four:
 *
 * 1. Opening focuses the palette's input. xterm reads its own hidden textarea
 *    and nothing else, so that alone stops bare keys reaching the PTY. (The
 *    focusing itself is Palette.tsx's, on mount — the element has to exist.)
 * 2. DOM focus is NOT app focus. focusedId is deliberately left alone:
 *    clearing it would demote the panel (assignTiers pins the focused panel
 *    live), lose the Cmd+C target, and drop the very panel most commands are
 *    about to act on. The id is CAPTURED at open time instead.
 * 3. Canvas shortcuts stand down — see isOpen(), which useViewport and the
 *    edit:paste listener consult.
 * 4. Closing calls restoreFocus(capturedId), i.e. SessionHandle.focus().
 */

export interface PaletteController {
  open: boolean
  /** focusedId as it was when the palette opened. */
  capturedId: string | null
  openPalette(): void
  closePalette(): void
  /**
   * Referentially STABLE, and reads a ref rather than state. useViewport keeps
   * it in a keydown effect's dep array, and a function that changed identity
   * on every open/close would tear that listener down and reinstall it — the
   * same constraint shouldYieldWheel documents one file over.
   */
  isOpen: () => boolean
}

export function usePalette(deps: {
  focusedIdRef: RefObject<string | null>
  restoreFocus: (id: string) => void
}): PaletteController {
  const [open, setOpen] = useState(false)
  const [capturedId, setCapturedId] = useState<string | null>(null)

  const openRef = useRef(open)
  openRef.current = open
  const capturedRef = useRef(capturedId)
  capturedRef.current = capturedId
  // deps is a fresh object every render; mirroring it keeps the toggle
  // listener's dep array empty so it installs exactly once.
  const depsRef = useRef(deps)
  depsRef.current = deps

  const isOpen = useCallback(() => openRef.current, [])

  const openPalette = useCallback(() => {
    setCapturedId(depsRef.current.focusedIdRef.current)
    setOpen(true)
  }, [])

  const closePalette = useCallback(() => {
    setOpen(false)
    const id = capturedRef.current
    // Restore the terminal's keyboard. Nothing else gives it back: the input
    // is about to unmount, and an unmounted element's blur focuses <body>.
    if (id) depsRef.current.restoreFocus(id)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd-gated like every other canvas shortcut — bare keys belong to the
      // TUI. Ctrl/Alt excluded so Cmd+Ctrl+K is not silently the same chord.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key !== 'k' && event.key !== 'K') return
      event.preventDefault()
      // A toggle, not an open: Cmd+K twice must not leave a palette the user
      // has to find the Escape key for.
      if (openRef.current) closePalette()
      else openPalette()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openPalette, closePalette])

  return { open, capturedId, openPalette, closePalette, isOpen }
}
```

- [ ] **Step 4: Implement `Palette.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, firstRunnable, stepRunnable, type Command } from './palette-model'
import {
  buildCommands,
  type PaletteActions,
  type PanelRow,
  type PresetRow,
  type PromptRow
} from './commands'
import type { PaletteController } from './usePalette'

/**
 * The overlay. Rendered as a sibling of `.world`, NEVER inside it: a scale()
 * ancestor would shrink the palette at low zoom and would place it in the
 * coordinate space pointer-correct.ts rewrites, so every click in it would be
 * re-dispatched with coordinates meant for a terminal cell grid.
 */

/** Rename and save-prompt both need a name. The palette is already a text field. */
export interface InputMode {
  label: string
  initial: string
  submit(value: string): void
}

export interface PaletteProps {
  controller: PaletteController
  actions: PaletteActions
  presets: PresetRow[]
  prompts: PromptRow[]
  panels: PanelRow[]
  hasSelection: boolean
  /** Set by beginRenamePreset / beginSavePrompt; null is command mode. */
  inputMode: InputMode | null
}

export function Palette(props: PaletteProps): JSX.Element {
  const { controller, inputMode } = props
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo(
    () =>
      buildCommands({
        presets: props.presets,
        prompts: props.prompts,
        panels: props.panels,
        capturedId: controller.capturedId,
        hasSelection: props.hasSelection,
        actions: props.actions
      }),
    [props.presets, props.prompts, props.panels, controller.capturedId, props.hasSelection, props.actions]
  )
  const rows = useMemo(() => filterCommands(commands, query), [commands, query])

  // Rule 1: opening focuses the input. This is what takes the keyboard off
  // xterm — nothing else in this component does it, and without it the user's
  // typing goes to the agent while the palette sits there looking ready.
  useEffect(() => {
    inputRef.current?.focus()
  }, [inputMode])

  // The list shrinks under the selection on every keystroke; re-seat it on a
  // row that can actually be run rather than leaving Enter pointed at a
  // disabled command or past the end.
  useEffect(() => {
    setIndex(firstRunnable(rows))
  }, [rows])

  const runSelected = (): void => {
    const row: Command | undefined = index >= 0 ? rows[index] : undefined
    if (!row || row.disabledReason !== undefined) return
    // Close FIRST: the command may focus a panel or open a dialog, and
    // restoring focus afterwards would steal it straight back.
    controller.closePalette()
    row.run()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        controller.closePalette()
        break
      case 'ArrowDown':
        event.preventDefault()
        setIndex((i) => stepRunnable(rows, i, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setIndex((i) => stepRunnable(rows, i, -1))
        break
      case 'Enter':
        event.preventDefault()
        if (inputMode) {
          const value = query.trim()
          controller.closePalette()
          // An empty name is a cancel, not a rename to "".
          if (value) inputMode.submit(value)
        } else {
          runSelected()
        }
        break
      default:
        break
    }
  }

  useEffect(() => {
    setQuery(inputMode ? inputMode.initial : '')
  }, [inputMode])

  return (
    <div className="palette" role="dialog" aria-label="Command palette">
      <input
        ref={inputRef}
        className="palette__input"
        value={query}
        placeholder={inputMode ? inputMode.label : 'Type a command…'}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      {!inputMode && (
        <ul className="palette__list">
          {rows.map((row, i) => (
            <li
              key={row.id}
              className={[
                'palette__row',
                i === index ? 'palette__row--selected' : '',
                row.disabledReason ? 'palette__row--disabled' : ''
              ].join(' ')}
              // onMouseDown, not onClick: a click would blur the input first,
              // and the blur handler closes the palette.
              onMouseDown={(e) => {
                e.preventDefault()
                if (row.disabledReason) return
                controller.closePalette()
                row.run()
              }}
            >
              <span className="palette__group">{row.group}</span>
              <span className="palette__title">{row.title}</span>
              {/* Says WHY it is disabled. A greyed-out row with no reason is a
                  bug report — the same rule menuLabel() states for the menu. */}
              <span className="palette__hint">{row.disabledReason ?? row.subtitle ?? ''}</span>
            </li>
          ))}
          {rows.length === 0 && <li className="palette__empty">No matching command</li>}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Add the stand-down predicate to `useViewport.ts`**

Add the parameter (sixth, optional, after `initialViewport`):

```ts
export function useViewport(
  hostRef: RefObject<HTMLElement | null>,
  rects: WorldRect[],
  onSpawn?: (worldCentre: Point) => void,
  shouldYieldWheel?: (event: WheelEvent) => boolean,
  /** The restored camera. Cmd+0 still returns to INITIAL, not to this. */
  initialViewport?: Viewport,
  /**
   * True while the command palette owns the keyboard. Every shortcut here is
   * Cmd-gated, and so is the palette's own text field — Cmd+N typed while
   * filtering would otherwise ALSO spawn a panel behind the overlay.
   *
   * Must be referentially stable (a useCallback with an empty dep list reading
   * a ref, exactly like shouldYieldWheel): it sits in the keydown effect's dep
   * array, and a changing identity would reinstall the listener on every
   * render.
   */
  shouldIgnoreKeys?: () => boolean
): ViewportControls {
```

Inside `onKeyDown`, immediately after the metaKey/ctrl/alt gate:

```ts
      if (shouldIgnoreKeys?.()) return
```

and add it to that effect's dep array: `}, [hostRef, onSpawn, shouldIgnoreKeys])`.

- [ ] **Step 6: Wire it into `Canvas.tsx`**

Imports:

```ts
import { usePalette } from '@renderer/palette/usePalette'
import { Palette, type InputMode } from '@renderer/palette/Palette'
import type { PaletteActions, PanelRow, PresetRow, PromptRow } from '@renderer/palette/commands'
```

Immediately after `shouldYieldWheel` is declared and **before** the `useViewport` call:

```ts
  // The palette owns the keyboard while it is open; see usePalette's four
  // rules. restoreFocus is SessionHandle.focus() on the panel that was focused
  // when it opened — the registry lookup lives here because the palette layer
  // deliberately knows nothing about the registry.
  const restoreFocus = useCallback((id: string) => {
    registry.get(id)?.handle.focus()
  }, [])
  const palette = usePalette({ focusedIdRef, restoreFocus })
  const [inputMode, setInputMode] = useState<InputMode | null>(null)
```

Change the `useViewport` call to pass the predicate:

```ts
  const { viewport, resetViewport, worldCentre } = useViewport(
    hostRef, rects, onSpawn, shouldYieldWheel, initial.camera, palette.isOpen
  )
```

Guard the clipboard listeners (inside the existing `edit` effect):

```ts
    const offCopy = window.canvas.edit.onCopy(() => {
      // With the palette open the user is looking at a text field, not a
      // terminal. Copy what the DOM has selected instead of the terminal's
      // selection — main's accelerator means the browser never sees a native
      // Cmd+C, so without this branch Cmd+C in the palette does nothing.
      if (palette.isOpen()) {
        const dom = window.getSelection()?.toString() ?? ''
        if (dom) void navigator.clipboard.writeText(dom)
        return
      }
      const id = focusedIdRef.current
      ...
    })
    const offPaste = window.canvas.edit.onPaste((text) => {
      // Rule 3. Without this the text lands in a running agent, invisibly,
      // while the user watches an empty text field. verify:panels 35.
      if (palette.isOpen()) return
      const id = focusedIdRef.current
      ...
    })
```

`palette.isOpen` is stable, so the effect's empty dep array stays correct — add it to the array anyway (`[palette.isOpen]`) so the dependency is visible rather than implied.

Add the actions object and the panel rows. Presets load in Task 5; until then pass `[]`:

```ts
  // Palette actions. Everything the palette can do that needs the registry,
  // the camera, or IPC lives here — buildCommands takes callbacks precisely so
  // none of that reaches the pure layer.
  const paletteActions = useMemo<PaletteActions>(() => ({
    spawnPreset: () => {},          // Task 6
    beginRenamePreset: () => {},    // Task 6
    deletePreset: () => {},         // Task 6
    setDefaultPreset: () => {},     // Task 6
    goToPanel: () => {},            // Task 7
    insertPrompt: () => {},         // Task 11
    beginSavePrompt: () => {},      // Task 11
    deletePrompt: () => {},         // Task 11
    resetCanvas: () => {},         // Task 6, once canvas:request-reset exists
    // Cmd+0's INITIAL, which is the only camera reset useViewport exposes.
    zoomToFit: () => resetViewport()
  }), [resetViewport])

  const panelRows = useMemo<PanelRow[]>(
    () => panels.map((p) => ({ id: p.rect.id, label: panelLabel(p) })),
    [panels]
  )
```

`resetCanvas` stays a no-op in this task: `canvas:request-reset` arrives in Task 5 and is wired up in Task 6, and a call to a channel the preload does not expose yet would not typecheck.

`panelLabel` is a small local helper, next to the component:

```ts
/**
 * What the switcher calls a panel. No user-set names exist yet (ideas-backlog
 * #6 puts titles on Panel and PersistedPanel already reserves the field), so
 * this is the same shape autoName() uses in main/presets.ts — the program and
 * where it is running — plus the id, which is the only guaranteed-unique part.
 */
function panelLabel(panel: Panel): string {
  const command = panel.spec.command ? panel.spec.command.split('/').pop() : 'login shell'
  return `${command} — ${panel.spec.cwd} (${panel.rect.id})`
}
```

Render it, as the LAST child of `.canvas`, after `<CanvasHud .../>` and outside `.world`:

```tsx
      {palette.open && (
        <Palette
          controller={palette}
          actions={paletteActions}
          presets={presetRows}
          prompts={promptRows}
          panels={panelRows}
          hasSelection={hasSelection()}
          inputMode={inputMode}
        />
      )}
```

For this task, `presetRows` and `promptRows` are `[]` constants declared next to `panelRows`, and:

```ts
  // Cheap, and read once per render of the palette: getSelection() is a string
  // copy out of xterm's buffer, not a repaint.
  const hasSelection = (): boolean => {
    const id = palette.capturedId
    return id !== null && (registry.get(id)?.handle.getSelection() ?? '') !== ''
  }
```

- [ ] **Step 7: Add the styles**

Append to `src/renderer/styles.css`:

```css
/* The palette is in SCREEN space — a sibling of .world, never inside it. A
   scale() ancestor would shrink it at low zoom and would put it in the
   coordinate space xterm-pointer.ts rewrites during a drag. */
.palette {
  position: absolute;
  top: 12%;
  left: 50%;
  transform: translateX(-50%);
  width: min(680px, 90%);
  z-index: 1000;
  background: #1b1d27;
  border: 1px solid #343747;
  border-radius: 10px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  font-size: 13px;
}

.palette__input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #343747;
  color: #e6e8f0;
  font: inherit;
  font-size: 15px;
  outline: none;
}

.palette__list {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  max-height: 46vh;
  overflow-y: auto;
}

.palette__row {
  display: grid;
  grid-template-columns: 68px 1fr auto;
  gap: 10px;
  align-items: baseline;
  padding: 7px 16px;
  color: #c8cbdb;
  cursor: default;
}

.palette__row--selected {
  background: #2a2d3d;
}

.palette__row--disabled {
  color: #6b6f85;
}

.palette__group {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #7d8199;
}

.palette__hint {
  font-size: 11px;
  color: #7d8199;
}

.palette__empty {
  padding: 10px 16px;
  color: #7d8199;
}
```

- [ ] **Step 8: Build and run the checks**

```sh
npm run typecheck && npm run build && npm run verify:panels
```

Expected: 36/36 PASS. If 33 fails on `onInput`, the input is not focusing — check that `Palette` mounts before the effect runs and that nothing else calls `focus()` afterwards. If 35 fails with `inTerminal: true`, the paste guard is missing or `palette.isOpen` is being read as a stale closure rather than through the ref.

- [ ] **Step 9: Commit**

```sh
git add src/renderer/palette src/renderer/canvas src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m5b): the palette overlay, and the four rules about who owns the keyboard"
```

---

### Task 4: `LayoutStore` learns to rename, delete, and re-default a preset

**Files:**
- Modify: `src/main/layout-store.ts`
- Modify: `scripts/verify-layout.cjs` (checks 42–46)

**Interfaces:**
- Consumes: `Preset`, `LayoutSnapshot` from `shared/layout-schema.ts`.
- Produces, on `LayoutStore`:
  - `renamePreset(id: string, name: string): boolean`
  - `deletePreset(id: string): boolean`
  - `setDefaultPreset(id: string): void`

Each mutator returns whether it changed anything, so main can answer the palette honestly instead of reporting success for an id that is not there.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, following the file's existing store-construction pattern (a temp file path plus an injected `schedule`):

```js
// 42. renamePreset renames the named preset and nothing else.
{
  const { store, read, tick } = freshStore()   // the helper this file already uses
  store.addPreset({ id: 'u1', name: 'one', cwd: '~', args: [] })
  store.addPreset({ id: 'u2', name: 'two', cwd: '~', args: [] })
  const changed = store.renamePreset('u1', 'renamed')
  tick()
  const presets = read().presets
  ok('42 renamePreset renames exactly one preset',
    changed === true && presets.length === 2 &&
    presets.find((p) => p.id === 'u1').name === 'renamed' &&
    presets.find((p) => p.id === 'u2').name === 'two')
}

// 43. Renaming an id that is not there reports false and writes nothing. Main
//     needs the difference: reporting success for a vanished preset means the
//     palette shows a rename that did not happen.
{
  const { store } = freshStore()
  ok('43 renaming an unknown id reports false', store.renamePreset('nope', 'x') === false)
}

// 44. deletePreset removes only that preset and reports true.
{
  const { store, read, tick } = freshStore()
  store.addPreset({ id: 'u1', name: 'one', cwd: '~', args: [] })
  store.addPreset({ id: 'u2', name: 'two', cwd: '~', args: [] })
  const changed = store.deletePreset('u1')
  tick()
  const presets = read().presets
  ok('44 deletePreset removes exactly one preset',
    changed === true && presets.length === 1 && presets[0].id === 'u2')
}

// 45. Deleting the DEFAULT preset falls the default back to the built-in
//     login shell id rather than leaving defaultPresetId naming a preset that
//     no longer exists. resolveDefault() in main/presets.ts would recover
//     anyway, but a stored id pointing at nothing is a fact on disk that
//     survives every future launch, and only this file can fix it at the
//     moment the preset goes away.
{
  const { store, read, tick } = freshStore()
  store.addPreset({ id: 'u1', name: 'one', cwd: '~', args: [] })
  store.setDefaultPreset('u1')
  store.deletePreset('u1')
  tick()
  ok('45 deleting the default preset restores the built-in default',
    read().defaultPresetId === 'shell', read().defaultPresetId)
}

// 46. setDefaultPreset persists, and does NOT validate against the built-ins —
//     only main knows those (main/presets.ts's resolveDefault), exactly as
//     parseLayout only checks the FORMAT of defaultPresetId.
{
  const { store, read, tick } = freshStore()
  store.setDefaultPreset('claude')
  tick()
  ok('46 setDefaultPreset persists a built-in id it cannot itself verify',
    read().defaultPresetId === 'claude')
}
```

If `freshStore`/`read`/`tick` are not already helpers in this file, write them from the pattern the surrounding checks use — a `mkdtempSync` path, `createLayoutStore({ filePath, schedule })` capturing the scheduled callback, and `JSON.parse(readFileSync(filePath, 'utf8'))`. Do not invent a second style.

- [ ] **Step 2: Run and watch 42–46 fail**

```sh
npm run verify:layout
```

Expected: 1–41 PASS, 42–46 FAIL (`store.renamePreset is not a function`).

- [ ] **Step 3: Implement**

In `src/main/layout-store.ts`, add to the `LayoutStore` interface:

```ts
  /** Rename one user preset. False when the id names nothing. */
  renamePreset(id: string, name: string): boolean
  /**
   * Remove one user preset. False when the id names nothing — including every
   * built-in id, which is not this file's data to remove.
   */
  deletePreset(id: string): boolean
  /** What Cmd+N spawns. Not validated here: only main knows the built-ins. */
  setDefaultPreset(id: string): void
```

and to the returned object, beside `addPreset`:

```ts
    renamePreset(id, name) {
      const found = snapshot.presets.find((p) => p.id === id)
      if (!found) return false
      snapshot.presets = snapshot.presets.map((p) => (p.id === id ? { ...p, name } : p))
      scheduleWrite()
      return true
    },

    deletePreset(id) {
      const before = snapshot.presets.length
      snapshot.presets = snapshot.presets.filter((p) => p.id !== id)
      if (snapshot.presets.length === before) return false
      // A defaultPresetId naming a preset that no longer exists is a fact on
      // disk that outlives this run. resolveDefault() recovers at read time,
      // but only here is the moment the preset goes away visible.
      if (snapshot.defaultPresetId === id) snapshot.defaultPresetId = DEFAULT_PRESET_ID
      scheduleWrite()
      return true
    },

    setDefaultPreset(id) {
      snapshot.defaultPresetId = id
      scheduleWrite()
    },
```

`DEFAULT_PRESET_ID` is already exported from `shared/layout-schema.ts`; add it to this file's existing import from there.

- [ ] **Step 4: Run**

```sh
npm run verify:layout && npm run typecheck:node
```

Expected: `46/46 checks passed`.

- [ ] **Step 5: Commit**

```sh
git add src/main/layout-store.ts scripts/verify-layout.cjs
git commit -m "feat(m5b): the store can rename, delete, and re-default a preset"
```

---

### Task 5: The preset channels — contract, preload, main handlers

**Files:**
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/presets.ts`

**Interfaces:**
- Consumes: `LayoutStore.renamePreset/deletePreset/setDefaultPreset` (Task 4); `PresetRow` (Task 2).
- Produces:
  - `IPC.PRESET_LIST = 'preset:list'`, `IPC.PRESET_RENAME = 'preset:rename'`, `IPC.PRESET_DELETE = 'preset:delete'`, `IPC.PRESET_SET_DEFAULT = 'preset:set-default'`, `IPC.CANVAS_REQUEST_RESET = 'canvas:request-reset'`
  - `window.canvas.preset.list(): Promise<PresetRow[]>`, `.rename(id, name): Promise<boolean>`, `.remove(id): Promise<boolean>`, `.setDefault(id): Promise<void>`
  - `window.canvas.canvas.requestReset(): Promise<void>`
  - `presetRows(presets: PresetAvailability[], defaultId: string, builtInIds: Set<string>): PresetRow[]` in `main/presets.ts`

`verify:ipc` walks `Object.values(IPC)` and fails if any of the five lacks a handler — that is this task's regression test, and it needs no new check.

- [ ] **Step 1: Add the channels to the contract**

In `IPC`:

```ts
  /**
   * The preset list as the PALETTE needs it — names, availability, which is
   * default, and which are built-in. Availability is main's alone: it is
   * resolved against the login PATH, which the renderer's compiled-away
   * process.env cannot see.
   */
  PRESET_LIST: 'preset:list',
  /**
   * The three mutations M5a deferred to the palette. These invert M5a's
   * direction — its preset channels are main -> renderer because the MENU is
   * main's; the palette is the renderer's, so the mutations are invokes, which
   * is also why they belong here rather than in IPC_EVENTS.
   */
  PRESET_RENAME: 'preset:rename',
  PRESET_DELETE: 'preset:delete',
  PRESET_SET_DEFAULT: 'preset:set-default',
  /**
   * "Reset canvas…" asked for from the palette rather than the menu. Main owns
   * the confirmation dialog and the counts request, so the renderer asks main
   * to run the flow it already has instead of growing a second one.
   */
  CANVAS_REQUEST_RESET: 'canvas:request-reset'
```

Add the row type and the bridge members:

```ts
/** One row of the palette's preset list. Mirrors PresetRow in the renderer. */
export interface PresetListRow {
  id: string
  name: string
  available: boolean
  builtIn: boolean
  isDefault: boolean
  subtitle: string
}
```

In `CanvasBridge.preset`:

```ts
    list(): Promise<PresetListRow[]>
    rename(id: string, name: string): Promise<boolean>
    /** `remove`, not `delete`: `delete` is a reserved word as a method name. */
    remove(id: string): Promise<boolean>
    setDefault(id: string): Promise<void>
```

In `CanvasBridge.canvas`:

```ts
    /** Runs main's existing confirm-then-reset flow. */
    requestReset(): Promise<void>
```

- [ ] **Step 2: Add the preload members**

```ts
  preset: {
    onSpawn: ...,
    onDefault: ...,
    onCapture: ...,
    list: () => ipcRenderer.invoke(IPC.PRESET_LIST),
    rename: (id: string, name: string) => ipcRenderer.invoke(IPC.PRESET_RENAME, id, name),
    remove: (id: string) => ipcRenderer.invoke(IPC.PRESET_DELETE, id),
    setDefault: (id: string) => ipcRenderer.invoke(IPC.PRESET_SET_DEFAULT, id)
  },
```

and in `canvas`:

```ts
    requestReset: () => ipcRenderer.invoke(IPC.CANVAS_REQUEST_RESET),
```

- [ ] **Step 3: Add `presetRows` to `main/presets.ts`**

```ts
import type { PresetListRow } from '../shared/ipc-contract'

/**
 * The palette's view of the presets. Built HERE rather than in the renderer
 * because two of the four fields are main's alone: availability comes from the
 * login PATH, and "built-in" is knowable only where BUILT_IN_PRESETS is.
 *
 * The subtitle is what makes a preset searchable by directory, which is the
 * second thing anyone types into a palette after the name.
 */
export function presetRows(
  entries: PresetAvailability[],
  defaultId: string
): PresetListRow[] {
  const builtIn = new Set(BUILT_IN_PRESETS.map((p) => p.id))
  return entries.map(({ preset, available }) => ({
    id: preset.id,
    name: preset.name,
    available,
    builtIn: builtIn.has(preset.id),
    isDefault: preset.id === defaultId,
    // "the user's login shell" spelled out, because only main can resolve an
    // absent command and the renderer must not guess (it would get zsh).
    subtitle: `${preset.command ?? 'login shell'} — ${preset.cwd}`
  }))
}
```

- [ ] **Step 4: Register the handlers**

`registerIpcHandlers` needs the pieces main/index.ts owns — the availability probe, the menu rebuild, and the window to push `PRESET_DEFAULT` at. Extend its signature rather than reaching for module state:

```ts
export interface PresetHandlers {
  list(): PresetListRow[]
  rename(id: string, name: string): boolean
  remove(id: string): boolean
  setDefault(id: string): void
  requestReset(): void
}

export function registerIpcHandlers(
  ptyManager: PtyManager,
  layoutStore: LayoutStore,
  getBackendInfo: () => SessionBackendInfo,
  presets: PresetHandlers
): void {
  ...
  ipcMain.handle(IPC.PRESET_LIST, () => presets.list())
  ipcMain.handle(IPC.PRESET_RENAME, (_event, id: string, name: string) => presets.rename(id, name))
  ipcMain.handle(IPC.PRESET_DELETE, (_event, id: string) => presets.remove(id))
  ipcMain.handle(IPC.PRESET_SET_DEFAULT, (_event, id: string) => presets.setDefault(id))
  ipcMain.handle(IPC.CANVAS_REQUEST_RESET, () => presets.requestReset())
}
```

In `src/main/index.ts`, at the existing `registerIpcHandlers(...)` call site:

```ts
registerIpcHandlers(ptyManager, layoutStore, getBackendInfo, {
  list: () =>
    presetRows(
      resolveAvailability(allPresets(layoutStore.presets()), which),
      layoutStore.defaultPresetId()
    ),
  rename: (id, name) => {
    const changed = layoutStore.renamePreset(id, name)
    // The menu lists presets by name, and Cmd+N's template carries none — but
    // a rename can still change what the menu SAYS, so rebuild. Cheap, and the
    // alternative is a menu that disagrees with the palette until relaunch.
    if (changed) afterPresetChange()
    return changed
  },
  remove: (id) => {
    const changed = layoutStore.deletePreset(id)
    if (changed) afterPresetChange()
    return changed
  },
  setDefault: (id) => {
    layoutStore.setDefaultPreset(id)
    afterPresetChange()
  },
  requestReset: () => {
    void confirmReset()
  }
})
```

and the shared tail, declared next to `rebuildMenu`:

```ts
/**
 * The three things every preset change has to do. Deleting the default one
 * changes what Cmd+N spawns, and the renderer only learns that from a
 * PRESET_DEFAULT push — without it the old template stays in defaultTemplateRef
 * and Cmd+N keeps spawning a preset the user just deleted.
 */
function afterPresetChange(): void {
  rebuildMenu()
  if (mainWindow) pushDefaultPreset(mainWindow.webContents, layoutStore)
}
```

Import `presetRows` alongside the other `./presets` imports.

- [ ] **Step 5: Update every other `registerIpcHandlers` caller**

`scripts/panels-entry.cjs` re-exports it and `scripts/verify-ipc-surface.cjs` calls it with a stub store. Both now need the fourth argument. In `verify-ipc-surface.cjs`, extend the existing stub:

```js
  const presetsStub = {
    list: () => [],
    rename: () => false,
    remove: () => false,
    setDefault: () => {},
    requestReset: () => {}
  }
  registerIpcHandlers(stub, layoutStoreStub, () => ({ kind: 'direct', reason: 'verify' }), presetsStub)
```

and add the same four store members to `layoutStoreStub` (`renamePreset: () => false`, `deletePreset: () => false`, `setDefaultPreset: () => {}`) if that stub is typed structurally at the call site. In `scripts/verify-panels.cjs`, pass the same shape at its `registerIpcHandlers` call.

- [ ] **Step 6: Run**

```sh
npm run typecheck && npm run verify:ipc
```

Expected: `verify:ipc` PASSes with the five new channels included — its check counts `Object.values(IPC)`, so the number in its output goes up. If it fails, a channel was added to the contract without a handler, which is exactly what it is for.

- [ ] **Step 7: Commit**

```sh
git add src/shared/ipc-contract.ts src/preload/index.ts src/main scripts/verify-ipc-surface.cjs scripts/verify-panels.cjs scripts/panels-entry.cjs
git commit -m "feat(m5b): preset mutations as invokes, and the reset the palette asks for"
```

---

### Task 6: Preset commands in the palette, and rename's input mode

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `scripts/verify-panels.cjs` (check 37)

**Interfaces:**
- Consumes: the bridge members from Task 5; `InputMode` from `Palette.tsx`.
- Produces: nothing new — this task fills in the `paletteActions` stubs from Task 3 and loads `presetRows`.

- [ ] **Step 1: Write the failing check 37**

```js
  // 37. A rename made in the palette reaches the store and comes back in the
  //     next preset:list. This is the debt M5a deferred here by name: it
  //     shipped presets that could be created and picked but not renamed,
  //     because the rename needed a text field and the text field needed the
  //     focus rules that did not exist yet.
  {
    await wc.executeJavaScript(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    `)
    await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
    // Filter to the rename row for the user preset the layout file seeded, run
    // it, then type the new name and press Enter.
    const renamed = await wc.executeJavaScript(`(async () => {
      const input = document.querySelector('.palette__input')
      const set = (v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, v)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      set('rename preset')
      await new Promise((r) => setTimeout(r, 50))
      const row = [...document.querySelectorAll('.palette__row')]
        .find((r) => r.textContent.includes('Rename preset'))
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 50))
      const input2 = document.querySelector('.palette__input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input2, 'renamed by palette')
      input2.dispatchEvent(new Event('input', { bubbles: true }))
      input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
      const rows = await window.canvas.preset.list()
      return rows.some((r) => r.name === 'renamed by palette')
    })()`)
    ok('37 a rename in the palette reaches the store', renamed === true)
  }
```

This needs a **user** preset to exist. In the harness's layout-file setup, add one to the JSON it writes before the window loads:

```js
  presets: [{ id: 'u1', name: 'harness preset', cwd: '~', args: [] }],
  defaultPresetId: 'shell',
```

React's controlled `<input>` ignores a plain `input.value = x`; the native-setter dance above is what makes the change reach React's state. Do not simplify it away.

- [ ] **Step 2: Build and watch 37 fail**

```sh
npm run build && npm run verify:panels
```

Expected: 33–36 PASS, 37 FAIL (`window.canvas.preset.list is not a function` until Task 5 is built in, and no rename row until this task lands).

- [ ] **Step 3: Load the preset rows**

In `Canvas.tsx`, replace the `presetRows` constant from Task 3:

```ts
  // Loaded when the palette OPENS, not on mount and not on a subscription: the
  // list is only ever looked at while the overlay is up, and availability is
  // probed once at startup anyway (a brew install mid-session is a known limit
  // of M5a, not something a subscription here would fix).
  const [presetRows, setPresetRows] = useState<PresetRow[]>([])
  const reloadPresets = useCallback(() => {
    void window.canvas.preset.list().then(setPresetRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadPresets()
  }, [palette.open, reloadPresets])
```

- [ ] **Step 4: Fill in the four preset actions**

```ts
    spawnPreset: (id) => {
      const row = presetRows.find((p) => p.id === id)
      if (!row || !row.available) return
      // Routed through the SAME main-side path the menu uses, so a palette
      // spawn and a menu spawn cannot drift: main resolves the template
      // (absent command included) and sends PRESET_SPAWN back, which Canvas
      // already handles through onSpawn — which is what gives it the ordinary
      // undo behaviour, where removing a panel disposes its session.
      void window.canvas.preset.spawnById(id)
    },
    beginRenamePreset: (id, currentName) => {
      setInputMode({
        label: `Rename “${currentName}” to…`,
        initial: currentName,
        submit: (value) => {
          void window.canvas.preset.rename(id, value).then(() => {
            setInputMode(null)
            reloadPresets()
          })
        }
      })
    },
    deletePreset: (id) => {
      void window.canvas.preset.remove(id).then(reloadPresets)
    },
    setDefaultPreset: (id) => {
      // No local bookkeeping: main answers by pushing PRESET_DEFAULT, which
      // the existing subscription writes into defaultTemplateRef. One source
      // of truth for what Cmd+N spawns, and it is main's.
      void window.canvas.preset.setDefault(id).then(reloadPresets)
    },
    resetCanvas: () => {
      // Main owns the confirmation dialog and the counts request. The palette
      // asks for the flow the menu item already runs rather than growing a
      // second one that could drift from it.
      void window.canvas.canvas.requestReset()
    },
```

`spawnById` is a fifth bridge member, and it is worth the extra channel rather than reconstructing the template in the renderer — main is the only side that can resolve an absent command. Add to the contract in this task:

```ts
  /** Spawn from a preset the PALETTE picked. Same path as the menu's pick. */
  PRESET_SPAWN_BY_ID: 'preset:spawn-by-id',
```

preload: `spawnById: (id: string) => ipcRenderer.invoke(IPC.PRESET_SPAWN_BY_ID, id)`; handler in `main/ipc.ts`: `ipcMain.handle(IPC.PRESET_SPAWN_BY_ID, (_e, id: string) => presets.spawn(id))`; and in `main/index.ts` add `spawn: (id) => onSpawnPreset(id)` to the `PresetHandlers` object, where `onSpawnPreset` is lifted out of `rebuildMenu`'s options object into a named function so the menu and the palette call the identical code.

Note the ordering trap: `setInputMode(null)` must run **after** the rename resolves, and `closePalette()` has already run by then (Palette closes before calling `submit`). So the input mode must be cleared even though the palette is shut — otherwise the next `Cmd+K` opens straight into a stale rename field. Clear it in `closePalette`'s caller too:

```ts
  // The palette always opens in command mode. An input mode left set by a
  // cancelled rename would otherwise greet the next Cmd+K with a text field
  // and no explanation.
  useEffect(() => {
    if (!palette.open) setInputMode(null)
  }, [palette.open])
```

- [ ] **Step 5: Build and run**

```sh
npm run typecheck && npm run build && npm run verify:panels && npm run verify:ipc
```

Expected: 37/37 in `verify:panels`, and `verify:ipc` still green with the sixth channel.

- [ ] **Step 6: Commit**

```sh
git add src/renderer/canvas/Canvas.tsx src/shared/ipc-contract.ts src/preload/index.ts src/main scripts/verify-panels.cjs
git commit -m "feat(m5b): rename, delete, and re-default a preset from the palette"
```

---

### Task 7: The panel switcher, and the wake it must not cause

**Files:**
- Modify: `src/renderer/canvas/viewport.ts` (`centreOn`)
- Modify: `src/renderer/canvas/useViewport.ts` (expose it)
- Modify: `src/renderer/canvas/Canvas.tsx` (the action, and select-without-wake)
- Modify: `scripts/verify-viewport.cjs` (checks 49–50)
- Modify: `scripts/verify-panels.cjs` (check 38)

**Interfaces:**
- Consumes: `Viewport`, `WorldRect`, `Size` from `viewport.ts`.
- Produces:
  - `centreOn(vp: Viewport, rect: WorldRect, size: Size): Viewport`
  - `ViewportControls.centreOn(rect: WorldRect): void`

- [ ] **Step 1: Write the failing checks 49–50**

In `scripts/verify-viewport.cjs`:

```js
// 49. centreOn puts the rect's centre at the viewport's centre, at any scale.
{
  let worst = 0
  const size = { width: 1200, height: 800 }
  const rect = { id: 'n1', x: 3000, y: -1500, w: 480, h: 320 }
  for (const vp of VIEWPORTS) {
    const next = V.centreOn(vp, rect, size)
    const centre = V.worldToScreen({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, next)
    worst = Math.max(worst, Math.abs(centre.x - size.width / 2), Math.abs(centre.y - size.height / 2))
  }
  ok('49 centreOn centres the rect at every scale', worst < EPS, `worst drift ${worst}`)
}

// 50. centreOn does NOT change the scale. Framing a panel by zooming to it
//     would reflow nothing (the world transform is scale-blind to xterm) but
//     would throw away the zoom level the user chose — and Cmd+1 already
//     exists for "fit everything".
{
  const size = { width: 1200, height: 800 }
  const rect = { id: 'n1', x: 10, y: 10, w: 100, h: 100 }
  const kept = VIEWPORTS.every((vp) => V.centreOn(vp, rect, size).scale === vp.scale)
  ok('50 centreOn preserves scale', kept)
}
```

- [ ] **Step 2: Run and watch them fail**

```sh
npm run verify:viewport
```

Expected: 49–50 FAIL (`V.centreOn is not a function`).

- [ ] **Step 3: Implement `centreOn`**

In `viewport.ts`, beside `fitTo`:

```ts
/**
 * Put one rect's centre in the middle of the viewport, at the CURRENT scale.
 *
 * Deliberately not a zoom: fitTo (Cmd+1) already exists for "show me
 * everything", and framing a panel by changing the scale would discard the
 * zoom level the user chose to work at.
 */
export function centreOn(vp: Viewport, rect: WorldRect, size: Size): Viewport {
  const world = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
  return {
    scale: vp.scale,
    x: size.width / 2 - world.x * vp.scale,
    y: size.height / 2 - world.y * vp.scale
  }
}
```

- [ ] **Step 4: Expose it from `useViewport`**

Add to `ViewportControls`:

```ts
  /**
   * Frame one panel without changing the zoom. The general setter stays
   * private — nothing outside this hook should move the camera — and this is
   * the third narrow verb that asks by name, after resetViewport and
   * worldCentre.
   */
  centreOn: (rect: WorldRect) => void
```

and in the hook's return value:

```ts
    centreOn: (rect: WorldRect) => {
      const host = hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      setViewport((vp) => centreOn(vp, rect, { width: bounds.width, height: bounds.height }))
    },
```

- [ ] **Step 5: Write the failing check 38 in `verify-panels.cjs`**

```js
  // 38. "Go to <panel>" frames a dormant panel and does NOT start its process.
  //     Waking hangs off SELECT, not focus (onSelectPanel clears dormantIds and
  //     calls registry.wake), so the obvious implementation — reuse
  //     onSelectPanel — would spawn an agent as a side effect of NAVIGATING.
  //     On a restored twelve-panel canvas that is twelve CLIs launched from a
  //     keyboard jump, which is the failure M4b's dormancy rule exists to
  //     prevent. The card still says "click to start", and it still means it.
  {
    const dormantId = (await wc.executeJavaScript(`
      (window.__m4aSessions().find((s) => s.dormant && !s.spawned) || {}).id || null
    `))
    const before = await wc.executeJavaScript(`window.__m4aViewport()`)
    await wc.executeJavaScript(`(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      await new Promise((r) => setTimeout(r, 100))
      const input = document.querySelector('.palette__input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'go to ${dormantId}')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 50))
      document.querySelector('.palette__row').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })()`)
    await sleep(400)
    const after = await wc.executeJavaScript(`window.__m4aViewport()`)
    const stillDormant = await wc.executeJavaScript(`
      (window.__m4aSessions().find((s) => s.id === '${dormantId}') || {}).spawned === false
    `)
    ok('38 go-to frames a dormant panel without spawning it',
      (after.x !== before.x || after.y !== before.y) && stillDormant === true,
      `${JSON.stringify(before)} -> ${JSON.stringify(after)} spawned=${!stillDormant}`)
  }
```

This check requires a dormant panel to exist at that point in the run — the harness's boot reconciliation leaves the seeded panels dormant except the one in `LIVE_AT_BOOT`. If an earlier check has woken them all, seed one more panel in the harness's layout file for this check to use, and say so in the check's comment.

- [ ] **Step 6: Implement the action**

In `Canvas.tsx`, take `centreOn` off the hook:

```ts
  const { viewport, resetViewport, worldCentre, centreOn } = useViewport(
    hostRef, rects, onSpawn, shouldYieldWheel, initial.camera, palette.isOpen
  )
```

and the action:

```ts
    goToPanel: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (!panel) return
      centreOn(panel.rect)
      // Selection WITHOUT the wake. onSelectPanel is the click path and it
      // deliberately wakes (a card's whole affordance is "click to start");
      // navigating is not interacting, so the switcher sets the highlight and
      // leaves dormancy alone. verify:panels 38.
      setSelectedId(id)
    },
```

`centreOn` joins `paletteActions`' dep array.

- [ ] **Step 7: Run everything touched**

```sh
npm run verify:viewport && npm run typecheck && npm run build && npm run verify:panels
```

Expected: `50/50` in viewport, `38/38` in panels.

- [ ] **Step 8: Commit**

```sh
git add src/renderer/canvas scripts/verify-viewport.cjs scripts/verify-panels.cjs
git commit -m "feat(m5b): jump to a panel, without waking what it lands on"
```

---

### Task 8: `Prompt`, `parsePrompts`, and the store that holds them

**Files:**
- Modify: `src/shared/layout-schema.ts`
- Modify: `src/main/layout-store.ts`
- Modify: `scripts/verify-layout.cjs` (checks 47–52)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Prompt { id: string; name: string; body: string }`
  - `parsePrompts(raw: unknown, warnings: string[]): Prompt[]`
  - `LayoutSnapshot.prompts: Prompt[]`
  - `LayoutStore.prompts(): Prompt[]`, `.addPrompt(prompt: Prompt): void`, `.deletePrompt(id: string): boolean`
  - `mintPromptId(existing: Prompt[]): string` (in `main/presets.ts`, beside `mintPresetId`, since it is the same trick and the same file already owns id minting)

- [ ] **Step 1: Write the failing checks**

```js
// 47. An absent prompts key is not corruption. Every file written before M5b
//     has none, and warning about those would make the first launch after an
//     upgrade shout about a file that is perfectly fine — the same trade
//     parsePresets makes (check 32).
{
  const warnings = []
  ok('47 an absent prompts key is silent',
    L.parsePrompts(undefined, warnings).length === 0 && warnings.length === 0)
}

// 48. PRESENT but unusable IS corruption, and says so. A hand-edited
//     `"prompts": {}` that silently emptied the list would leave the user with
//     no evidence beyond a shorter palette.
{
  const warnings = []
  ok('48 a non-array prompts field warns',
    L.parsePrompts({}, warnings).length === 0 && warnings.length === 1)
}

// 49. Bad entries are dropped INDIVIDUALLY. One malformed prompt costs that
//     prompt, not the file — the discipline every parser here follows.
{
  const warnings = []
  const out = L.parsePrompts(
    [
      { id: 'p1', name: 'good', body: 'hello' },
      { id: 'p2', name: 'no body' },
      { id: '', name: 'bad id', body: 'x' },
      { id: 'p3', name: 'also good', body: 'world' }
    ],
    warnings
  )
  ok('49 bad prompts are dropped one at a time',
    out.length === 2 && out[0].id === 'p1' && out[1].id === 'p3' && warnings.length === 2,
    JSON.stringify(warnings))
}

// 50. A duplicate id is dropped, for the reason duplicate PANEL ids are: the
//     palette keys rows by id, and two rows with one id is a React list that
//     renders one of them and loses the other with no error anywhere.
{
  const warnings = []
  const out = L.parsePrompts(
    [{ id: 'p1', name: 'a', body: 'x' }, { id: 'p1', name: 'b', body: 'y' }],
    warnings
  )
  ok('50 a duplicate prompt id is dropped', out.length === 1 && warnings.length === 1)
}

// 51. An EMPTY body is dropped rather than kept. A prompt that pastes nothing
//     is indistinguishable from a broken insert, and the palette would show it
//     as a perfectly ordinary row.
{
  const warnings = []
  ok('51 an empty body is not a prompt',
    L.parsePrompts([{ id: 'p1', name: 'x', body: '' }], warnings).length === 0)
}

// 52. The store round-trips prompts: add, delete, and the file agrees.
{
  const { store, read, tick } = freshStore()
  store.addPrompt({ id: 'p1', name: 'review', body: 'line one\nline two' })
  store.addPrompt({ id: 'p2', name: 'other', body: 'x' })
  const deleted = store.deletePrompt('p1')
  const missing = store.deletePrompt('nope')
  tick()
  const prompts = read().prompts
  ok('52 prompts round-trip through the store',
    deleted === true && missing === false && prompts.length === 1 && prompts[0].id === 'p2')
}
```

`L` is whatever `verify-layout.cjs` already binds the bundled schema module to; use the file's existing name rather than introducing a second.

- [ ] **Step 2: Run and watch 47–52 fail**

```sh
npm run verify:layout
```

Expected: 1–46 PASS, 47–52 FAIL.

- [ ] **Step 3: Implement the schema half**

In `shared/layout-schema.ts`:

```ts
/**
 * A saved prompt: text the user pastes into an agent often enough to name.
 *
 * `body` is deliberately unbounded in length — a prompt IS a paragraph — but
 * empty is invalid: a row that pastes nothing looks exactly like a broken
 * insert. Placeholders ({{cwd}} and friends, ideas-backlog #27) are NOT part
 * of this type; they need the read-the-real-cwd machinery #4 owns, and adding
 * the field before the mechanism exists would ship a format promise nothing
 * keeps.
 */
export interface Prompt {
  id: string
  name: string
  body: string
}
```

Add `prompts: Prompt[]` to `LayoutSnapshot` (documented as "the saved store only; `.claude/commands` is read live, never persisted here — see main/prompts.ts"), `prompts: []` to `defaultSnapshot()`, and:

```ts
function parsePrompt(raw: unknown, seen: Set<string>, warnings: string[]): Prompt | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a prompt that was not an object')
    return null
  }
  const { id, name, body } = raw
  if (!isStr(id) || !ID_PATTERN.test(id)) {
    warnings.push(`dropped a prompt with an unusable id: ${JSON.stringify(id)}`)
    return null
  }
  if (seen.has(id)) {
    warnings.push(`dropped a duplicate prompt id: ${id}`)
    return null
  }
  if (!isStr(body) || body === '') {
    warnings.push(`dropped prompt ${id}: body was empty or not a string`)
    return null
  }
  seen.add(id)
  // Name falls back to the id, the same trade parsePreset makes: an unnamed
  // prompt is usable, and losing saved text over a missing label is not.
  return { id, name: isStr(name) ? name : id, body }
}

/** Never throws; drops entries individually, like every other parser here. */
export function parsePrompts(raw: unknown, warnings: string[]): Prompt[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a prompts field that was not an array')
    return []
  }
  const seen = new Set<string>()
  return raw
    .map((p) => parsePrompt(p, seen, warnings))
    .filter((p): p is Prompt => p !== null)
}
```

and wire it into `parseLayout`'s returned snapshot: `prompts: parsePrompts(parsed.prompts, warnings),`.

- [ ] **Step 4: Implement the store half**

Interface additions:

```ts
  /** The SAVED prompts only. Project prompts are read live; see main/prompts.ts. */
  prompts(): Prompt[]
  addPrompt(prompt: Prompt): void
  /** False when the id names nothing — including any project prompt id. */
  deletePrompt(id: string): boolean
```

Implementation, beside the preset members:

```ts
    // Copied out for the same reason presets() copies: a caller must not be
    // able to mutate the snapshot the store is about to serialise.
    prompts: () => snapshot.prompts.map((p) => ({ ...p })),

    addPrompt(prompt) {
      snapshot.prompts = [...snapshot.prompts, { ...prompt }]
      scheduleWrite()
    },

    deletePrompt(id) {
      const before = snapshot.prompts.length
      snapshot.prompts = snapshot.prompts.filter((p) => p.id !== id)
      if (snapshot.prompts.length === before) return false
      scheduleWrite()
      return true
    },
```

And in `main/presets.ts`, beside `mintPresetId`:

```ts
/** Same trick as mintPresetId, and the same file, because ids are minted here. */
export function mintPromptId(existing: { id: string }[]): string {
  const used = new Set(existing.map((p) => p.id))
  let n = 1
  while (used.has(`p${n}`)) n += 1
  return `p${n}`
}
```

- [ ] **Step 5: Run**

```sh
npm run verify:layout && npm run typecheck:node
```

Expected: `52/52 checks passed`.

- [ ] **Step 6: Commit**

```sh
git add src/shared/layout-schema.ts src/main/layout-store.ts src/main/presets.ts scripts/verify-layout.cjs
git commit -m "feat(m5b): prompts in layout.json, parsed like everything else here"
```

---

### Task 9: `main/prompts.ts` — reading `.claude/commands`, capped

**Files:**
- Create: `src/main/prompts.ts`
- Modify: `scripts/verify-layout.cjs` (checks 53–57) and its bundle entry (`scripts/layout-entry.cjs`)

**Interfaces:**
- Consumes: `Prompt` from `shared/layout-schema.ts`.
- Produces:
  - `interface PromptListRow { id: string; name: string; source: 'saved' | 'project'; body: string }`
  - `readProjectPrompts(dir: string): PromptListRow[]`
  - `mergePrompts(saved: Prompt[], project: PromptListRow[]): PromptListRow[]`
  - `MAX_PROJECT_PROMPTS = 100`, `MAX_PROMPT_BYTES = 64 * 1024`

`main/prompts.ts` may import `node:fs` and `node:path` and still belongs to the plain-node tier — that is exactly what `layout-store.ts` does. What would move it out of the tier is an `electron` or `node-pty` import, so it must have neither, and the cwd it reads is passed in already expanded.

- [ ] **Step 1: Write the failing checks**

Add `...require('../src/main/prompts')` to `scripts/layout-entry.cjs`, then:

```js
// 53. Reads *.md from .claude/commands, names them by filename, and ignores
//     everything else in the directory.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc prompts '))   // spaced, on purpose
  mkdirSync(join(dir, '.claude', 'commands'), { recursive: true })
  writeFileSync(join(dir, '.claude', 'commands', 'review.md'), 'review this diff', 'utf8')
  writeFileSync(join(dir, '.claude', 'commands', 'notes.txt'), 'not a prompt', 'utf8')
  const out = L.readProjectPrompts(dir)
  ok('53 project prompts are the .md files, named by filename',
    out.length === 1 && out[0].name === 'review' && out[0].body === 'review this diff' &&
    out[0].source === 'project')
}

// 54. A missing directory is EMPTY, not an error. Most panels' cwds have no
//     .claude/commands, and a throw here would take the whole prompt list down
//     with it — the palette would show no saved prompts either.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc prompts '))
  ok('54 a missing .claude/commands is empty, not an error',
    L.readProjectPrompts(dir).length === 0)
}

// 55. The file count is capped. An unbounded read of whatever directory a user
//     pointed a panel at is a hazard, not a feature.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc prompts '))
  const commands = join(dir, '.claude', 'commands')
  mkdirSync(commands, { recursive: true })
  for (let i = 0; i < L.MAX_PROJECT_PROMPTS + 20; i += 1) {
    writeFileSync(join(commands, `p${i}.md`), 'body', 'utf8')
  }
  ok('55 the project prompt count is capped',
    L.readProjectPrompts(dir).length === L.MAX_PROJECT_PROMPTS)
}

// 56. An oversized file is skipped rather than truncated. Half a prompt pasted
//     into an agent is worse than none: it reads as a complete instruction.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc prompts '))
  const commands = join(dir, '.claude', 'commands')
  mkdirSync(commands, { recursive: true })
  writeFileSync(join(commands, 'huge.md'), 'x'.repeat(L.MAX_PROMPT_BYTES + 1), 'utf8')
  writeFileSync(join(commands, 'fine.md'), 'ok', 'utf8')
  const out = L.readProjectPrompts(dir)
  ok('56 an oversized prompt file is skipped, not truncated',
    out.length === 1 && out[0].name === 'fine')
}

// 57. Same-named prompts from the two sources both survive the merge, with
//     distinct ids. Deduping by name is the quiet way to paste the wrong
//     project's context into an agent (ideas-backlog #27).
{
  const merged = L.mergePrompts(
    [{ id: 'p1', name: 'review', body: 'saved body' }],
    [{ id: 'proj:review', name: 'review', source: 'project', body: 'project body' }]
  )
  ok('57 same-named prompts from two sources both survive',
    merged.length === 2 && new Set(merged.map((p) => p.id)).size === 2 &&
    merged.filter((p) => p.source === 'project').length === 1)
}
```

`mkdtempSync`, `mkdirSync`, `writeFileSync`, `tmpdir` and `join` may already be imported at the top of `verify-layout.cjs`; add only what is missing.

- [ ] **Step 2: Run and watch 53–57 fail**

```sh
npm run verify:layout
```

Expected: 53–57 FAIL (`L.readProjectPrompts is not a function`).

- [ ] **Step 3: Implement**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Prompt } from '../shared/layout-schema'

/**
 * The project half of the prompt library: `.claude/commands/*.md` under a
 * panel's cwd.
 *
 * Read LIVE and never persisted. A prompt in the user's repository belongs to
 * the repository — it version-controls with the project and works when they
 * are in a plain terminal outside this app, which is the whole argument for
 * reading the format rather than inventing a private one (ideas-backlog #27).
 * Writing it is deliberately out of scope: authoring a file someone will
 * commit is a decision to ask for, not to acquire as a side effect of "save".
 *
 * Imports node:fs and stays in the plain-node verify tier for the same reason
 * layout-store.ts does — it is `electron` and `node-pty` that move a module
 * out of that tier, not the filesystem. The cwd arrives already expanded;
 * resolving `~` is main's job and pty-manager's resolveCwd already owns it.
 */

/** One row of the merged list the palette shows. */
export interface PromptListRow {
  id: string
  name: string
  source: 'saved' | 'project'
  body: string
}

/**
 * Caps, not preferences. The directory is whatever the user pointed a panel
 * at, so both the count and the size are attacker-shaped inputs in the
 * ordinary case of "I opened a panel in a repo I just cloned".
 */
export const MAX_PROJECT_PROMPTS = 100
export const MAX_PROMPT_BYTES = 64 * 1024

/** The prefix that keeps a project id from ever colliding with a saved one. */
const PROJECT_ID_PREFIX = 'proj:'

export function readProjectPrompts(cwd: string): PromptListRow[] {
  const dir = join(cwd, '.claude', 'commands')
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    // Missing, unreadable, or not a directory. Every one of those is the
    // ordinary case — most cwds have no .claude/commands — and throwing would
    // take the SAVED prompts down with it, since they share one list call.
    return []
  }

  const out: PromptListRow[] = []
  // Sorted so the palette's order is stable across launches; readdir's order
  // is filesystem-dependent, and a list that reshuffles is a list you cannot
  // learn.
  for (const entry of names.sort()) {
    if (out.length >= MAX_PROJECT_PROMPTS) break
    // One level deep. Claude Code namespaces commands in subdirectories, and
    // supporting that means a recursive walk over a directory this app does
    // not control — a bigger promise than M5b makes.
    if (extname(entry) !== '.md') continue
    const path = join(dir, entry)
    try {
      const stat = statSync(path)
      // Skipped, never truncated: half a prompt pasted into an agent reads as
      // a complete instruction.
      if (!stat.isFile() || stat.size > MAX_PROMPT_BYTES) continue
      const body = readFileSync(path, 'utf8')
      if (body === '') continue
      const name = basename(entry, '.md')
      out.push({ id: `${PROJECT_ID_PREFIX}${name}`, name, source: 'project', body })
    } catch {
      // One unreadable file costs that file, the same discipline parseLayout
      // applies to one malformed panel.
      continue
    }
  }
  return out
}

/**
 * Saved first, then project. Never deduped by name: two prompts called
 * "review" from two sources are two rows, and the palette labels each with its
 * source, because pasting the wrong project's context into an agent is silent
 * and expensive.
 */
export function mergePrompts(saved: Prompt[], project: PromptListRow[]): PromptListRow[] {
  return [
    ...saved.map((p) => ({ id: p.id, name: p.name, source: 'saved' as const, body: p.body })),
    ...project
  ]
}
```

- [ ] **Step 4: Run**

```sh
npm run verify:layout && npm run typecheck:node
```

Expected: `57/57 checks passed`.

- [ ] **Step 5: Commit**

```sh
git add src/main/prompts.ts scripts/verify-layout.cjs scripts/layout-entry.cjs
git commit -m "feat(m5b): read .claude/commands, capped, and merge without deduping"
```

---

### Task 10: The prompt channels

**Files:**
- Modify: `src/shared/ipc-contract.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/index.ts`
- Modify: `scripts/verify-ipc-surface.cjs`, `scripts/verify-panels.cjs` (stub shapes only)

**Interfaces:**
- Consumes: `readProjectPrompts`, `mergePrompts`, `PromptListRow` (Task 9); `LayoutStore.prompts/addPrompt/deletePrompt` (Task 8); `mintPromptId` (Task 8).
- Produces:
  - `IPC.PROMPT_LIST = 'prompt:list'`, `IPC.PROMPT_SAVE = 'prompt:save'`, `IPC.PROMPT_DELETE = 'prompt:delete'`
  - `window.canvas.prompt.list(cwd: string | null): Promise<PromptListRow[]>`
  - `window.canvas.prompt.save(name: string, body: string): Promise<void>`
  - `window.canvas.prompt.remove(id: string): Promise<boolean>`

- [ ] **Step 1: Contract**

```ts
  /**
   * The merged prompt list: the saved store plus .claude/commands under the
   * cwd of the panel the palette captured. Takes a cwd because the project
   * half is per-panel — and main expands it, since `~` is main's to resolve.
   * A null cwd means "saved prompts only", which is what a palette opened with
   * nothing focused should show.
   */
  PROMPT_LIST: 'prompt:list',
  /** Always writes the SAVED store. The project half is read-only. */
  PROMPT_SAVE: 'prompt:save',
  PROMPT_DELETE: 'prompt:delete'
```

```ts
/** One row of the palette's prompt list. Mirrors PromptListRow in main. */
export interface PromptBridgeRow {
  id: string
  name: string
  source: 'saved' | 'project'
  body: string
}
```

and on `CanvasBridge`:

```ts
  prompt: {
    list(cwd: string | null): Promise<PromptBridgeRow[]>
    save(name: string, body: string): Promise<void>
    /** False for an id the saved store does not hold — every project id, for one. */
    remove(id: string): Promise<boolean>
  }
```

- [ ] **Step 2: Preload**

```ts
  prompt: {
    list: (cwd: string | null) => ipcRenderer.invoke(IPC.PROMPT_LIST, cwd),
    save: (name: string, body: string) => ipcRenderer.invoke(IPC.PROMPT_SAVE, name, body),
    remove: (id: string) => ipcRenderer.invoke(IPC.PROMPT_DELETE, id)
  },
```

- [ ] **Step 3: Handlers**

Extend `registerIpcHandlers`'s fourth argument rather than adding a fifth — presets and prompts are the same "the palette asks main" surface. Rename the parameter to `palette: PaletteHandlers` and add:

```ts
export interface PaletteHandlers {
  // ... the preset members from Task 5 ...
  listPrompts(cwd: string | null): PromptListRow[]
  savePrompt(name: string, body: string): void
  removePrompt(id: string): boolean
}
```

```ts
  ipcMain.handle(IPC.PROMPT_LIST, (_event, cwd: string | null) => palette.listPrompts(cwd))
  ipcMain.handle(IPC.PROMPT_SAVE, (_event, name: string, body: string) => palette.savePrompt(name, body))
  ipcMain.handle(IPC.PROMPT_DELETE, (_event, id: string) => palette.removePrompt(id))
```

In `main/index.ts`:

```ts
  listPrompts: (cwd) =>
    mergePrompts(
      layoutStore.prompts(),
      // resolveCwd is pty-manager's — the same expansion a spawn gets, so the
      // prompts the palette lists come from the directory the panel is
      // actually in, not from a literal '~' that resolves to nothing.
      cwd === null ? [] : readProjectPrompts(resolveCwd(cwd))
    ),
  savePrompt: (name, body) => {
    layoutStore.addPrompt({ id: mintPromptId(layoutStore.prompts()), name, body })
  },
  removePrompt: (id) => layoutStore.deletePrompt(id)
```

`resolveCwd` currently lives inside `pty-manager.ts`. Export it from there (it is already a standalone function) and import it here rather than writing a second `~` expansion — two of those is how the app ends up listing prompts from a directory it would never spawn in.

- [ ] **Step 4: Update the stubs**

`verify-ipc-surface.cjs`'s stub object and `verify-panels.cjs`'s handler wiring both need the three new members (`listPrompts: () => []`, `savePrompt: () => {}`, `removePrompt: () => false`), and the layout-store stub needs `prompts: () => []`, `addPrompt: () => {}`, `deletePrompt: () => false`.

- [ ] **Step 5: Run**

```sh
npm run typecheck && npm run verify:ipc
```

Expected: green, with three more channels counted.

- [ ] **Step 6: Commit**

```sh
git add src/shared/ipc-contract.ts src/preload/index.ts src/main scripts/verify-ipc-surface.cjs scripts/verify-panels.cjs
git commit -m "feat(m5b): the prompt channels, and one shared cwd expansion"
```

---

### Task 11: Prompts in the palette — insert, save, delete

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `scripts/verify-panels.cjs` (check 39)

**Interfaces:**
- Consumes: `window.canvas.prompt.*` (Task 10); `InputMode` (Task 3); `SessionHandle.paste`/`getSelection`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing check 39**

This is the check that can tell `paste()` from `write()`, and it needs a panel whose program echoes control characters visibly with bracketed paste turned on. Add a preset to the harness's layout file:

```js
  presets: [
    { id: 'u1', name: 'harness preset', cwd: '~', args: [] },
    // Turns bracketed-paste mode ON (so xterm wraps a paste in \e[200~ ... \e[201~)
    // and echoes what arrives with control characters made visible, so the
    // markers show up in the terminal buffer as "^[[200~".
    { id: 'u2', name: 'echo -v', cwd: '~', command: '/bin/sh', args: ['-c', "printf '\\033[?2004h'; cat -v"] }
  ],
```

```js
  // 39. A prompt insert goes through paste(), not write(), and the difference
  //     is the whole feature. session-factory.ts records the failure from
  //     Cmd+V: a raw write of a five-line prompt into an agent TUI is five
  //     newlines, i.e. five submissions of four incomplete fragments. paste()
  //     goes through xterm, which brackets it, so the block arrives as one
  //     input — and every prompt is multi-line, so every use depends on it.
  //
  //     The discriminator is the bracketed-paste markers: the u2 panel enables
  //     mode 2004 and echoes with `cat -v`, so a paste() shows "^[[200~" in the
  //     buffer and a write() shows the bare text. Nothing weaker can tell the
  //     two apart, because against a plain shell both put identical bytes on
  //     the PTY.
  {
    const spawned = await wc.executeJavaScript(`(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      await new Promise((r) => setTimeout(r, 150))
      const input = document.querySelector('.palette__input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'new panel from echo')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 80))
      const row = [...document.querySelectorAll('.palette__row')]
        .find((r) => r.textContent.includes('New panel from echo -v'))
      if (!row) return false
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      return true
    })()`)
    ok('39a the palette spawned the echo panel', spawned === true)

    // Focus it, so the palette captures it, then insert a two-line prompt the
    // harness seeded into the layout file's prompts array.
    await wc.executeJavaScript(`(async () => {
      const slots = [...document.querySelectorAll('.panel__slot')]
      slots[slots.length - 1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 300))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      await new Promise((r) => setTimeout(r, 150))
      const input = document.querySelector('.palette__input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'insert prompt')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 80))
      document.querySelector('.palette__row').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })()`)

    const bracketed = await waitUntil(
      () => wc.executeJavaScript(`window.__m4aCellToScreen('200~') !== null`),
      3000
    )
    ok('39 a prompt insert arrives as a bracketed paste, not a raw write', bracketed === true)
  }
```

Seed the prompt in the harness layout file too:

```js
  prompts: [{ id: 'p1', name: 'two liner', body: 'first line\nsecond line' }],
```

- [ ] **Step 2: Build and watch 39 fail**

```sh
npm run build && npm run verify:panels
```

Expected: 39a and 39 FAIL — the insert action is still the Task 3 no-op.

- [ ] **Step 3: Load the prompt rows**

In `Canvas.tsx`, replacing the Task 3 `promptRows` constant:

```ts
  const [promptRows, setPromptRows] = useState<PromptRow[]>([])
  // Bodies are kept out of the row type the palette renders — buildCommands
  // has no use for them and putting a paragraph in a list row's props means
  // re-rendering the whole list when a prompt file changes.
  const promptBodiesRef = useRef(new Map<string, string>())
  const reloadPrompts = useCallback((capturedId: string | null) => {
    const panel = capturedId ? panelsRef.current.find((p) => p.rect.id === capturedId) : undefined
    // The panel's SPAWN cwd, which is what spec.cwd is. Wherever the user has
    // since cd'd to needs the pid (ideas-backlog #4) and is not M5b's.
    void window.canvas.prompt.list(panel?.spec.cwd ?? null).then((rows) => {
      promptBodiesRef.current = new Map(rows.map((r) => [r.id, r.body]))
      setPromptRows(rows.map(({ id, name, source }) => ({ id, name, source })))
    })
  }, [])
  useEffect(() => {
    if (palette.open) reloadPrompts(palette.capturedId)
  }, [palette.open, palette.capturedId, reloadPrompts])
```

- [ ] **Step 4: Fill in the three prompt actions**

```ts
    insertPrompt: (id) => {
      const target = palette.capturedId
      const body = promptBodiesRef.current.get(id)
      if (!target || body === undefined) return
      // paste(), NEVER write(). session-factory.ts spells out the failure:
      // term.paste wraps the payload in bracketed-paste markers when the app
      // has enabled them, so a multi-line prompt arrives as ONE input instead
      // of several partial submissions. verify:panels 39.
      registry.get(target)?.handle.paste(body)
    },
    beginSavePrompt: () => {
      const target = palette.capturedId
      const selection = target ? (registry.get(target)?.handle.getSelection() ?? '') : ''
      if (!selection) return
      setInputMode({
        label: 'Name this prompt…',
        initial: '',
        submit: (name) => {
          void window.canvas.prompt.save(name, selection).then(() => setInputMode(null))
        }
      })
    },
    deletePrompt: (id) => {
      void window.canvas.prompt.remove(id).then(() => reloadPrompts(palette.capturedId))
    },
```

`palette.capturedId`, `reloadPrompts` join `paletteActions`' dep array.

- [ ] **Step 5: Build and run the whole chain**

```sh
npm run verify
```

Expected: every suite green, including `39/39` in `verify:panels`. If 39 fails while 39a passes, read the terminal buffer in the failing window — if the prompt text is present but `200~` is not, the insert is calling `write()`; if neither is present, the capture id or the panel focus is wrong, not the paste.

- [ ] **Step 6: Commit**

```sh
git add src/renderer/canvas/Canvas.tsx scripts/verify-panels.cjs
git commit -m "feat(m5b): insert, save, and delete prompts from the palette"
```

---

### Task 12: Record what the palette changed

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

Documentation is a task, not a step, because the notes below are the kind this repo treats as load-bearing: each one describes a failure that is silent without it.

- [ ] **Step 1: Mark the milestone**

In `README.md`'s milestone table: `| M5b | Command palette | ✅ done |`. Add a line to the feature list describing `Cmd+K` in the same voice as the surrounding entries.

- [ ] **Step 2: Add the verify table row**

In `CLAUDE.md`'s suite table, between `verify:layout` and `verify:tmux`:

```
| `verify:palette` | plain node | 30 checks: `fuzzy.ts`'s matching and ranking (1–7), `palette-model.ts`'s filter, stability and runnable-row selection (8–18), and `commands.ts`'s list construction — disabled reasons for built-ins, unavailable presets, missing focus and project prompts (19–30) |
```

and update the counts in the `verify:viewport`, `verify:layout` and `verify:panels` rows to their new totals (50, 57, 39).

- [ ] **Step 3: Add the load-bearing notes**

Under "Load-bearing details", in the voice of the existing entries:

- **Who owns the keyboard (`palette/usePalette.ts`, `Canvas.tsx`).** The four rules, and why each fails silently: the input takes DOM focus because xterm reads only its own textarea; `focusedId` is captured rather than cleared because `assignTiers` pins the focused panel live; `useViewport` stands down because its window listener sees every key regardless of DOM focus; `close()` calls `handle.focus()` because an unmounting input leaves focus on `<body>`.
- **`edit:paste` is guarded, `edit:copy` is redirected (`Canvas.tsx`).** With the palette open, `Cmd+V` must fill the input — main sends the text unconditionally — and `Cmd+C` copies the DOM selection, since main's accelerator means the browser never sees a native copy.
- **A prompt insert is `paste()`, never `write()` (`Canvas.tsx`).** With the reason from `session-factory.ts`, and the note that `verify:panels` 39 tells them apart only because its fixture panel enables bracketed-paste mode and echoes with `cat -v`.
- **Navigating must not wake (`Canvas.tsx`'s `goToPanel`).** Waking hangs off `onSelectPanel`, so reusing it would spawn an agent per keyboard jump.
- **Project prompts are read, never written (`main/prompts.ts`).** Capped at 100 files and 64KB, one level deep, missing directory is empty rather than an error, and same-named prompts are never deduped.
- **`centreOn` is the third narrow camera verb (`useViewport.ts`).** The setter stays private; `resetViewport`, `worldCentre` and now `centreOn` ask by name.

Also update the existing note **"`dispose(id)` has three call sites in `Canvas.tsx`"** if this milestone added a fourth — it did not, but re-derive the count from the code rather than trusting this sentence, which is exactly what that note asks for.

- [ ] **Step 4: Commit**

```sh
git add README.md CLAUDE.md
git commit -m "docs(m5b): record what the command palette changed"
```

---

## Self-review

Run this against the spec before declaring the plan done.

**Spec coverage:**

| Spec section | Task |
|---|---|
| Where the palette lives / layering | 1, 2, 3 |
| The four focus rules | 3 |
| The command | 2 |
| Fuzzy matching | 1 |
| Preset management | 4, 5, 6 |
| The panel switcher (incl. no-wake, `centreOn`) | 7 |
| Prompts: global store | 8 |
| Prompts: project source, caps, merge | 9 |
| Prompts: insert via `paste()`, save from selection | 10, 11 |
| IPC summary | 5, 10 |
| Failure modes | 3 (33–36), 6 (37), 7 (38), 11 (39), 9 (53–57) |
| Testing | 1, 2 (`verify:palette`), 4, 8, 9 (`verify:layout`), 5, 10 (`verify:ipc`), 3, 6, 7, 11 (`verify:panels`) |
| Files | Task 12's table update |

**Known deviations from the spec, decided while planning:**

1. The spec's "zoom to fit" canvas command is implemented as **Reset zoom (Cmd+0)**, because `useViewport` exposes `resetViewport` (Cmd+0's INITIAL) and does not expose `fitTo` (Cmd+1). Exposing a fourth camera verb for a palette row was not worth it; the row says what it does.
2. The spec lists seven new invokes; the plan adds **nine** — `preset:spawn-by-id` and `canvas:request-reset` were missed in the spec. Both exist so the palette runs main's existing code rather than a second copy: only main can resolve an absent `command`, and only main owns the reset confirmation dialog.

Both are worth a line in the spec if it is ever revised; neither changes the design.
