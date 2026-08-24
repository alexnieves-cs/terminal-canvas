# M4b: Layout Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A canvas — panels, camera, selection — survives quitting the app, with restored panels dormant until clicked, undo over panel actions, and three menu checkboxes gating what comes back.

**Architecture:** A pure, plain-node-testable schema module in `src/shared/` validates the on-disk format and never throws. A main-process store owns the file: it coalesces writes, writes atomically, and flushes synchronously at `before-quit` — main owns it because the renderer is the process that can vanish without warning. Two `invoke` channels carry a flat canvas state in each direction; workspaces and settings are resolved main-side and the renderer never learns they exist.

**Tech Stack:** TypeScript, Electron (main + preload + renderer), React 18 (no StrictMode), `node:fs`, esbuild for the verify bundles.

**Spec:** `docs/superpowers/specs/2026-08-24-m4b-layout-persistence-design.md`

## Global Constraints

- **`LAYOUT_VERSION = 1`.** A file with a greater version is not read; it is backed up to `layout.json.bak` and replaced by defaults.
- **Panel ids must match `/^[A-Za-z0-9_-]+$/`.** `PanelId` doubles as the tmux session name from M4c, and tmux rejects `.` and `:`.
- **`parseLayout` must never throw.** Malformed entries are dropped individually and named in `warnings`; the rest of the file survives.
- **`flushSync` must never throw.** It runs inside `app.on('before-quit')`, where an exception can wedge the quit.
- **A tier change must never reach `pty.kill`.** `pty.kill` has exactly two callers in the renderer: `disposeAll` and `dispose(id)`. This plan adds no third.
- **`Cmd` is required for every canvas shortcut.** `Cmd+Z`/`Cmd+Shift+Z` are claimed; `Ctrl+Z` stays untouched and reaches the PTY as SIGTSTP.
- **The renderer has no `process.env`.** electron-vite compiles it to `{}`. Never read it renderer-side.
- **No `StrictMode`.** Do not add it.
- **Write timing:** `WRITE_DEBOUNCE_MS = 500`. **History cap:** `HISTORY_LIMIT = 50`.
- **Comments explain *why*.** Match the density of the surrounding code; a non-obvious line without a reason attached gets "fixed" by someone later.
- **`npm run verify` must be green before any task is claimed done.**

## Preconditions

**The working tree had uncommitted drop-guard work in it when this plan was
written.** `src/renderer/drop-guard.ts` (new), plus edits to
`src/renderer/main.tsx`, `src/main/index.ts`, and `scripts/verify-canvas.cjs`.
Three of those four files are also modified by this plan. **Land or stash that
work before starting Task 1**, and re-read `main.tsx` and `main/index.ts` before
editing them — the code blocks below were written against the tree as it stood
and show the M4b changes only.

In particular, `main.tsx` now calls `installDropGuard()` before mounting React.
Task 6 rewrites that file; the call must survive.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/shared/panel-geometry.ts` | `MIN_PANEL_W`/`MIN_PANEL_H`, needed by both the renderer's drag math and the shared validator |
| `src/shared/layout-schema.ts` | The on-disk format: types, defaults, `parseLayout`. Pure — no `fs`, no `electron`, no DOM |
| `src/renderer/panels/layout-adapt.ts` | `toPanels`/`fromPanels` between `PersistedPanel` and `Panel` |
| `src/renderer/panels/history.ts` | The pure undo stack |
| `src/main/layout-store.ts` | Read, merge, coalesce, atomic write, `flushSync`. File path injected |
| `scripts/layout-entry.cjs` | esbuild entry bundling the schema, the store, and the adapters |
| `scripts/verify-layout.cjs` | The new plain-node suite |

**Modified**

`src/shared/ipc-contract.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/main/menu.ts`, `src/preload/index.ts`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/canvas/Canvas.tsx`, `src/renderer/canvas/useViewport.ts`, `src/renderer/canvas/lod.ts`, `src/renderer/canvas/panel-interaction.ts`, `src/renderer/session/session-registry.ts`, `src/renderer/session/panel-session.ts`, `src/renderer/panels/panels.ts`, `src/renderer/components/TerminalPanel.tsx`, `scripts/viewport-entry.cjs`, `scripts/verify-viewport.cjs`, `scripts/verify-registry.cjs`, `scripts/verify-panels.cjs`, `scripts/panels-entry.cjs`, `package.json`, `README.md`, `CLAUDE.md`.

**One infrastructure note that affects several tasks.** The esbuild `buildSync` calls in `scripts/verify-*.cjs` currently configure **no path aliases**. Existing bundled modules get away with it because every cross-boundary import is `import type`, which esbuild erases. This plan introduces *value* imports from `@shared`, so Task 1 adds `alias` to those configs. Skipping it produces `Could not resolve "@shared/panel-geometry"` at bundle time.

---

### Task 1: The shared schema and the `verify:layout` harness

**Files:**
- Create: `src/shared/panel-geometry.ts`
- Create: `src/shared/layout-schema.ts`
- Create: `scripts/layout-entry.cjs`
- Create: `scripts/verify-layout.cjs`
- Modify: `src/renderer/canvas/panel-interaction.ts:32-33`
- Modify: `scripts/verify-viewport.cjs` (esbuild `alias`)
- Modify: `scripts/verify-registry.cjs` (esbuild `alias`)
- Modify: `package.json` (the `verify:layout` script, and `verify`)

**Interfaces:**
- Consumes: nothing.
- Produces: `LAYOUT_VERSION`, `ID_PATTERN`, `DEFAULT_CAMERA`, `DEFAULT_WORKSPACE_ID`, `RestoreSettings`, `PersistedPanel`, `PersistedCamera`, `Workspace`, `CanvasState`, `LayoutSnapshot`, `defaultSettings()`, `defaultWorkspace()`, `defaultSnapshot()`, `parseLayout(raw): { snapshot, warnings, futureVersion }`. Also `MIN_PANEL_W`/`MIN_PANEL_H` from `@shared/panel-geometry`.

> **Spec refinement, deliberate:** the spec writes `parseLayout`'s return as `{ snapshot, warnings }`. This plan adds a third field, `futureVersion: boolean`. The store has to know whether to back the file up before overwriting it, and the alternative — string-matching a warning message — makes a log line load-bearing. Note it in the module comment.

- [ ] **Step 1: Move the panel minimums into `shared/`**

Create `src/shared/panel-geometry.ts`:

```ts
/**
 * Panel size floors. They live in shared/ rather than beside applyDrag
 * because two layers now need them: the renderer's resize math clamps to
 * them, and the shared layout validator rejects a persisted panel smaller
 * than one — a hand-edited file could otherwise produce a panel too small to
 * hold a terminal and too small to grab a resize handle on.
 */
export const MIN_PANEL_W = 200
export const MIN_PANEL_H = 160
```

In `src/renderer/canvas/panel-interaction.ts`, replace the two `export const` lines (32-33) with a re-export, so every existing importer keeps working:

```ts
// Re-exported rather than moved outright: applyDrag's callers import them from
// here, and shared/ is where the layout validator needs them.
export { MIN_PANEL_W, MIN_PANEL_H } from '@shared/panel-geometry'
```

- [ ] **Step 2: Teach the verify bundles the `@shared` alias**

This is what makes Step 1's value import resolve. In **both** `scripts/verify-viewport.cjs` and `scripts/verify-registry.cjs`, add an `alias` key to the `buildSync({...})` options object:

```js
buildSync({
  entryPoints: [join(__dirname, 'viewport-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // The verify bundles resolved no aliases until M4b, and got away with it
  // because every cross-boundary import was `import type` (erased by esbuild).
  // panel-interaction.ts now imports a real VALUE from @shared, so the alias
  // has to exist or the bundle fails with "Could not resolve".
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
```

Run `npm run verify:viewport` and `npm run verify:registry`. Both must still be green (39/39 and 20/20) — you have changed no behaviour, only where two constants live.

- [ ] **Step 3: Write the failing checks**

Create `scripts/layout-entry.cjs`:

```js
/* esbuild entry for the layout suite. The schema is pure and the store takes
   its file path as a parameter, so neither needs Electron or a DOM — which is
   what keeps this suite in the cheap plain-node tier. */
module.exports = {
  ...require('../src/shared/layout-schema'),
  ...require('../src/shared/panel-geometry')
}
```

Create `scripts/verify-layout.cjs`:

```js
/* Verifies the on-disk layout format and the store that owns it.
   Run with: npm run verify:layout

   Pure modules plus node:fs against a tmpdir — no Electron, no DOM, no built
   renderer. Every check here guards a failure that is SILENT in a running
   app: a corrupt file that opens a dead canvas, or two panels quietly sharing
   one session. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'layout.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'layout-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const L = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

/** A minimal valid panel, so each check can vary exactly one field. */
const panel = (over = {}) => ({
  id: 'p1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: ['-l'], ...over
})
const file = (over = {}) => JSON.stringify({
  version: 1,
  activeWorkspaceId: 'w1',
  workspaces: [{
    id: 'w1', name: 'Canvas', panels: [panel()],
    camera: { x: 10, y: 20, scale: 2 }, selectedId: null, focusedId: null
  }],
  settings: { layout: true, camera: true, focus: true },
  ...over
})
const active = (snap) => snap.workspaces.find((w) => w.id === snap.activeWorkspaceId)

// 1. A well-formed file round-trips with no warnings.
{
  const { snapshot, warnings } = L.parseLayout(file())
  const w = active(snapshot)
  ok('1 a valid file parses unchanged',
    warnings.length === 0 && w.panels.length === 1 && w.camera.scale === 2,
    `warnings=${warnings.length} panels=${w.panels.length}`)
}

// 2. Garbage never throws — it degrades to defaults.
{
  let threw = null
  let allDefault = true
  for (const raw of ['', '{', 'null', '[]', '"a string"', '{"version":1}']) {
    try {
      const { snapshot } = L.parseLayout(raw)
      if (!Array.isArray(snapshot.workspaces) || snapshot.workspaces.length === 0) allDefault = false
    } catch (e) { threw = `${raw}: ${e.message}` }
  }
  ok('2 unparseable input never throws and always yields a workspace',
    threw === null && allDefault, threw ?? 'ok')
}

// 3. scale <= 0 is replaced. screenToWorld divides by it: a zero would make
//    every coordinate Infinity and the canvas dead with no error anywhere.
{
  const bad = (scale) => active(L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [], camera: { x: 0, y: 0, scale },
      selectedId: null, focusedId: null }]
  })).snapshot).camera.scale
  ok('3 a corrupt scale is replaced with the default',
    bad(0) === L.DEFAULT_CAMERA.scale && bad(-2) === L.DEFAULT_CAMERA.scale &&
    bad(NaN) === L.DEFAULT_CAMERA.scale,
    `0=${bad(0)} -2=${bad(-2)} NaN=${bad(NaN)}`)
}

// 4. A panel with a non-finite coordinate is dropped, not rendered at left:NaN.
{
  const { snapshot, warnings } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas',
      panels: [panel(), panel({ id: 'p2', x: NaN })],
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  }))
  ok('4 a panel with a NaN coordinate is dropped and the rest survive',
    active(snapshot).panels.length === 1 && warnings.length === 1,
    `kept=${active(snapshot).panels.length} warnings=${warnings.length}`)
}

// 5. Undersized panels are clamped, not dropped: the geometry is recoverable
//    and losing the panel would be a worse answer than resizing it.
{
  const { snapshot } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [panel({ w: 10, h: 10 })],
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  }))
  const p = active(snapshot).panels[0]
  ok('5 an undersized panel is clamped to the minimums',
    p && p.w === L.MIN_PANEL_W && p.h === L.MIN_PANEL_H, `w=${p && p.w} h=${p && p.h}`)
}

// 6. THE IMPORTANT ONE. Duplicate ids are the only failure here with no
//    visible symptom: registry.ensure returns the EXISTING session, so two
//    panels render one handle.host, which can live in only one slot. This is
//    the bug M4a's nextIdRef was written to kill, arriving through a file.
{
  const { snapshot, warnings } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas',
      panels: [panel({ id: 'dup', x: 0 }), panel({ id: 'dup', x: 900 })],
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  }))
  const kept = active(snapshot).panels
  ok('6 a duplicate id keeps the first entry only',
    kept.length === 1 && kept[0].x === 0 && warnings.length === 1,
    `kept=${kept.length} x=${kept[0] && kept[0].x}`)
}

// 7. tmux rejects '.' and ':' in a session name, and PanelId becomes the
//    session name in M4c. Rejecting them now is free; migrating later is not.
{
  const ids = ['ok-1', 'ok_2', 'bad.id', 'bad:id', 'bad id', '']
  const { snapshot } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas',
      panels: ids.map((id, i) => panel({ id, x: i * 10 })),
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  }))
  const kept = active(snapshot).panels.map((p) => p.id)
  ok('7 ids unsafe as a tmux session name are rejected',
    kept.length === 2 && kept[0] === 'ok-1' && kept[1] === 'ok_2', kept.join(','))
}

// 8. A future version is not interpreted, and says so loudly enough that the
//    store knows to back the file up before replacing it.
{
  const { snapshot, futureVersion } = L.parseLayout(file({ version: 99 }))
  ok('8 a future version falls back and reports itself',
    futureVersion === true && active(snapshot).panels.length === 0,
    `futureVersion=${futureVersion} panels=${active(snapshot).panels.length}`)
}

// 9. An empty or unresolvable workspace list still yields a canvas to open.
{
  const empty = L.parseLayout(file({ workspaces: [] })).snapshot
  const missing = L.parseLayout(file({ activeWorkspaceId: 'nope' })).snapshot
  ok('9 an empty or unresolvable workspace list still yields one canvas',
    active(empty) !== undefined && active(missing) !== undefined &&
    missing.activeWorkspaceId === missing.workspaces[0].id,
    `empty=${!!active(empty)} missing=${!!active(missing)}`)
}

// 10. selectedId/focusedId must name a panel that survived validation, or a
//     dropped panel leaves focus pointing at nothing.
{
  const { snapshot } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [panel({ id: 'p1' })],
      camera: L.DEFAULT_CAMERA, selectedId: 'gone', focusedId: 'p1' }]
  }))
  const w = active(snapshot)
  ok('10 selection pointing at a dropped panel is cleared',
    w.selectedId === null && w.focusedId === 'p1',
    `selected=${w.selectedId} focused=${w.focusedId}`)
}

// 11. title is reserved for ideas-backlog item 6. Nothing writes it in M4b, so
//     both its presence and its absence have to be tolerated.
{
  const withTitle = active(L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [panel({ title: 'auth refactor' })],
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  })).snapshot).panels[0]
  const without = active(L.parseLayout(file()).snapshot).panels[0]
  ok('11 an optional title survives and its absence is tolerated',
    withTitle.title === 'auth refactor' && without.title === undefined,
    `with=${withTitle.title} without=${without.title}`)
}

// 12. Settings default to on and are coerced, so a hand-edited "true" string
//     cannot turn a boolean into something the menu renders as checked-ish.
{
  const missing = L.parseLayout(file({ settings: undefined })).snapshot.settings
  const junk = L.parseLayout(file({ settings: { layout: 'yes', camera: 0, focus: true } })).snapshot.settings
  ok('12 settings default to on and are coerced to real booleans',
    missing.layout === true && missing.camera === true && missing.focus === true &&
    junk.layout === true && junk.camera === true && junk.focus === true,
    JSON.stringify(junk))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
```

Add to `package.json` scripts, and put it in `verify` **before** the build (it needs no built renderer):

```json
"verify:layout": "node scripts/verify-layout.cjs",
"verify": "npm run verify:viewport && npm run verify:registry && npm run verify:layout && npm run verify:pty && npm run verify:pty-manager && npm run verify:window && npm run verify:ipc && npm run build && npm run verify:canvas && npm run verify:xterm && npm run verify:panels"
```

- [ ] **Step 4: Watch them fail**

Run: `npm run verify:layout`
Expected: the esbuild step fails with `Could not resolve "../src/shared/layout-schema"`. **This is the correct failure** — the module does not exist yet. Do not proceed until you have seen it.

- [ ] **Step 5: Implement `layout-schema.ts`**

Create `src/shared/layout-schema.ts`:

```ts
import { MIN_PANEL_H, MIN_PANEL_W } from './panel-geometry'

/**
 * The on-disk layout format, and the one function that reads it.
 *
 * Pure by construction — no fs, no electron, no DOM — which is what lets
 * verify:layout run it under plain node. The store that owns the file lives in
 * main/layout-store.ts and takes its path as a parameter for the same reason.
 *
 * parseLayout NEVER throws. A corrupt or hand-edited file must open a working
 * app, not a dead one, so every failure degrades to a default and names itself
 * in `warnings` instead of propagating.
 */

export const LAYOUT_VERSION = 1

/**
 * PanelId doubles as the tmux session name from M4c (see shared/types.ts), and
 * tmux rejects '.' and ':' in a session name. M4b is where ids first become
 * durable, so this is the last moment the constraint is free rather than a
 * migration of everyone's saved file.
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** Matches useViewport's INITIAL, so "camera restore off" and "fresh app" agree. */
export const DEFAULT_CAMERA = { x: 120, y: 120, scale: 1 }

export const DEFAULT_WORKSPACE_ID = 'w1'

export interface RestoreSettings {
  layout: boolean
  camera: boolean
  focus: boolean
}

export interface PersistedPanel {
  id: string
  x: number
  y: number
  w: number
  h: number
  z: number
  cwd: string
  /** Absent means "the user's login shell" — main resolves it. See PanelSpec. */
  command?: string
  args: string[]
  /**
   * User-set panel name. NOTHING in M4b writes this — no UI sets a title yet.
   * Reserved because ideas-backlog item 6 puts titles on Panel and says
   * "persisted by M4b": an optional field costs a line now and a format change
   * later. Readers must tolerate its absence.
   */
  title?: string
}

export interface PersistedCamera {
  x: number
  y: number
  scale: number
}

/**
 * The flat state the renderer sends and receives. It has no workspace id and
 * no name, because the renderer has no concept of workspaces at all.
 */
export interface CanvasState {
  panels: PersistedPanel[]
  camera: PersistedCamera
  selectedId: string | null
  focusedId: string | null
}

/**
 * One canvas. M4b always has exactly one and never surfaces the concept to the
 * renderer. The dimension exists in the FORMAT only, per ideas-backlog item 2:
 * a file written as one flat record of panels makes named workspaces a
 * migration, and one written as a keyed collection makes them nearly free.
 */
export interface Workspace extends CanvasState {
  id: string
  name: string
}

export interface LayoutSnapshot {
  version: number
  activeWorkspaceId: string
  workspaces: Workspace[]
  settings: RestoreSettings
}

export function defaultSettings(): RestoreSettings {
  return { layout: true, camera: true, focus: true }
}

export function defaultWorkspace(): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Canvas',
    panels: [],
    camera: { ...DEFAULT_CAMERA },
    selectedId: null,
    focusedId: null
  }
}

/**
 * An EMPTY canvas, not a first-run one. The format layer decides what is
 * VALID; it does not decide product defaults, which would drag PANEL_W/PANEL_H
 * into shared/ behind it. The renderer supplies firstRunPanels() when it
 * receives no panels.
 */
export function defaultSnapshot(): LayoutSnapshot {
  return {
    version: LAYOUT_VERSION,
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: [defaultWorkspace()],
    settings: defaultSettings()
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function parsePanel(
  raw: unknown,
  seen: Set<string>,
  warnings: string[]
): PersistedPanel | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a panel that was not an object')
    return null
  }
  const { id, x, y, w, h, z, cwd, command, args, title } = raw
  if (!isStr(id) || !ID_PATTERN.test(id)) {
    warnings.push(`dropped a panel with an unusable id: ${JSON.stringify(id)}`)
    return null
  }
  if (seen.has(id)) {
    // Two panels sharing an id is the only failure in this file with NO
    // visible symptom: registry.ensure returns the existing session, so both
    // render one handle.host, which can live in exactly one slot.
    warnings.push(`dropped a duplicate panel id: ${id}`)
    return null
  }
  if (!isNum(x) || !isNum(y) || !isNum(w) || !isNum(h) || !isNum(z)) {
    warnings.push(`dropped panel ${id}: a coordinate was not a finite number`)
    return null
  }
  if (!isStr(cwd)) {
    warnings.push(`dropped panel ${id}: cwd was not a string`)
    return null
  }
  if (!Array.isArray(args) || !args.every(isStr)) {
    warnings.push(`dropped panel ${id}: args was not an array of strings`)
    return null
  }
  seen.add(id)
  const panel: PersistedPanel = {
    id,
    x,
    y,
    // Clamped rather than dropped: the geometry is recoverable, and losing the
    // panel is a worse answer than resizing it.
    w: Math.max(MIN_PANEL_W, w),
    h: Math.max(MIN_PANEL_H, h),
    z,
    cwd,
    args: [...args]
  }
  if (isStr(command)) panel.command = command
  if (isStr(title)) panel.title = title
  return panel
}

function parseCamera(raw: unknown, warnings: string[]): PersistedCamera {
  if (!isRecord(raw) || !isNum(raw.x) || !isNum(raw.y) || !isNum(raw.scale) || raw.scale <= 0) {
    // A zero or negative scale is not cosmetic: screenToWorld divides by it,
    // so every coordinate becomes Infinity or NaN and the canvas is dead with
    // no error raised anywhere.
    warnings.push('replaced an unusable camera')
    return { ...DEFAULT_CAMERA }
  }
  return { x: raw.x, y: raw.y, scale: raw.scale }
}

function parseWorkspace(raw: unknown, index: number, warnings: string[]): Workspace | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped workspace ${index}: not an object`)
    return null
  }
  const id = isStr(raw.id) && ID_PATTERN.test(raw.id) ? raw.id : `w${index + 1}`
  const name = isStr(raw.name) ? raw.name : 'Canvas'
  const seen = new Set<string>()
  const panels = (Array.isArray(raw.panels) ? raw.panels : [])
    .map((p) => parsePanel(p, seen, warnings))
    .filter((p): p is PersistedPanel => p !== null)

  // A selection naming a panel that did not survive validation would leave
  // focus pointing at nothing — and assignTiers pins the focused id live.
  const pick = (v: unknown): string | null => (isStr(v) && seen.has(v) ? v : null)

  return {
    id,
    name,
    panels,
    camera: parseCamera(raw.camera, warnings),
    selectedId: pick(raw.selectedId),
    focusedId: pick(raw.focusedId)
  }
}

function parseSettings(raw: unknown): RestoreSettings {
  // Default ON, and coerced: a hand-edited `"yes"` must not become a value the
  // menu renders as some third state.
  const r = isRecord(raw) ? raw : {}
  const flag = (v: unknown): boolean => (typeof v === 'boolean' ? v : true)
  return { layout: flag(r.layout), camera: flag(r.camera), focus: flag(r.focus) }
}

/**
 * `futureVersion` is a third field the design spec does not name. The store
 * has to know whether to back the file up before overwriting it, and the only
 * alternative — string-matching a warning message — would make a log line
 * load-bearing.
 */
export function parseLayout(raw: string): {
  snapshot: LayoutSnapshot
  warnings: string[]
  futureVersion: boolean
} {
  const warnings: string[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    warnings.push('layout file was not valid JSON; starting from defaults')
    return { snapshot: defaultSnapshot(), warnings, futureVersion: false }
  }

  if (!isRecord(parsed)) {
    warnings.push('layout file was not an object; starting from defaults')
    return { snapshot: defaultSnapshot(), warnings, futureVersion: false }
  }

  if (isNum(parsed.version) && parsed.version > LAYOUT_VERSION) {
    warnings.push(
      `layout file is version ${parsed.version}, newer than ${LAYOUT_VERSION}; not read`
    )
    return { snapshot: defaultSnapshot(), warnings, futureVersion: true }
  }

  const workspaces = (Array.isArray(parsed.workspaces) ? parsed.workspaces : [])
    .map((w, i) => parseWorkspace(w, i, warnings))
    .filter((w): w is Workspace => w !== null)

  if (workspaces.length === 0) {
    warnings.push('layout file had no usable workspace; starting from an empty one')
    workspaces.push(defaultWorkspace())
  }

  const requested = parsed.activeWorkspaceId
  const activeWorkspaceId =
    isStr(requested) && workspaces.some((w) => w.id === requested)
      ? requested
      : workspaces[0].id

  return {
    snapshot: {
      version: LAYOUT_VERSION,
      activeWorkspaceId,
      workspaces,
      settings: parseSettings(parsed.settings)
    },
    warnings,
    futureVersion: false
  }
}
```

- [ ] **Step 6: Run the checks**

Run: `npm run verify:layout`
Expected: `12/12 passed`.

Then run `npm run verify:viewport` and `npm run verify:registry` — both must still be green, confirming the constant move and the alias change broke nothing.

- [ ] **Step 7: Commit**

```bash
git add src/shared/panel-geometry.ts src/shared/layout-schema.ts \
        src/renderer/canvas/panel-interaction.ts \
        scripts/layout-entry.cjs scripts/verify-layout.cjs \
        scripts/verify-viewport.cjs scripts/verify-registry.cjs package.json
git commit -m "feat(m4b): the on-disk layout format and its validator

parseLayout never throws: malformed entries are dropped individually and
named in warnings, so one bad panel costs that panel and not the file.
Duplicate ids and tmux-unsafe ids are rejected, because both are silent
in a running app."
```

---

### Task 2: `toPanels` / `fromPanels`

**Files:**
- Create: `src/renderer/panels/layout-adapt.ts`
- Modify: `scripts/layout-entry.cjs`
- Modify: `scripts/verify-layout.cjs` (checks 13-15)

**Interfaces:**
- Consumes: `PersistedPanel`, `CanvasState` from `@shared/layout-schema`; `Panel`, `PANEL_W`, `PANEL_H` from `@renderer/panels/panels`.
- Produces: `toPanels(persisted: PersistedPanel[]): Panel[]`, `fromPanels(panels: Panel[]): PersistedPanel[]`.

- [ ] **Step 1: Add the checks**

Append to `scripts/verify-layout.cjs`, before the summary block:

```js
// 13. A round trip must be lossless. Anything dropped here is a user's canvas
//     quietly degrading a little on every launch.
{
  const persisted = [
    { id: 'a1', x: -40, y: 12.5, w: 720, h: 460, z: 3, cwd: '/tmp', args: ['-l'] },
    { id: 'b2', x: 900, y: 0, w: 300, h: 200, z: 1, cwd: '~', command: '/bin/bash', args: [] }
  ]
  const back = L.fromPanels(L.toPanels(persisted))
  ok('13 persisted -> Panel -> persisted is lossless',
    JSON.stringify(back) === JSON.stringify(persisted),
    JSON.stringify(back))
}

// 14. The nesting is the point: Panel keeps the id on rect and the command on
//     spec, and the file must not be shaped by either of those choices.
{
  const [p] = L.toPanels([{ id: 'a1', x: 1, y: 2, w: 720, h: 460, z: 7, cwd: '/x', args: ['-l'] }])
  ok('14 toPanels produces the nested in-memory shape',
    p.rect.id === 'a1' && p.rect.x === 1 && p.z === 7 &&
    p.spec.panelId === 'a1' && p.spec.cwd === '/x' && p.spec.command === undefined,
    JSON.stringify(p))
}

// 15. An absent command must stay ABSENT, never become the string "undefined"
//     or a renderer-invented default. Only main can name the login shell.
{
  const [p] = L.toPanels([{ id: 'a1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }])
  const [back] = L.fromPanels([p])
  ok('15 an absent command survives as absent, not as a default',
    !('command' in back) && p.spec.command === undefined,
    JSON.stringify(back))
}
```

Add the module to `scripts/layout-entry.cjs`:

```js
module.exports = {
  ...require('../src/shared/layout-schema'),
  ...require('../src/shared/panel-geometry'),
  ...require('../src/renderer/panels/layout-adapt')
}
```

- [ ] **Step 2: Watch them fail**

Run: `npm run verify:layout`
Expected: esbuild fails with `Could not resolve "../src/renderer/panels/layout-adapt"`.

- [ ] **Step 3: Implement**

Create `src/renderer/panels/layout-adapt.ts`:

```ts
import type { PersistedPanel } from '@shared/layout-schema'
import type { Panel } from './panels'

/**
 * Between the persisted shape and the in-memory one.
 *
 * These deliberately do NOT live in shared/layout-schema.ts beside the rest of
 * the format: `Panel` is a renderer type, and shared/ importing from renderer/
 * would invert the dependency direction the codebase is arranged around.
 * Nothing is lost — panels.ts is already in the plain-node verify bundle, and
 * this joins it there.
 *
 * The conversion exists at all because Panel nests (rect carries the id, spec
 * carries the command) and the file must not be shaped by those internal
 * choices. Refactoring Panel should never invalidate a saved canvas.
 */

export function toPanels(persisted: PersistedPanel[]): Panel[] {
  return persisted.map((p) => ({
    rect: { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h },
    spec: {
      panelId: p.id,
      cwd: p.cwd,
      // Spread rather than `command: p.command`, so an absent command stays
      // ABSENT rather than becoming an explicit undefined. Only main can name
      // the login shell; a renderer-side default would silently give a bash or
      // fish user zsh.
      ...(p.command === undefined ? {} : { command: p.command }),
      args: [...p.args]
    },
    z: p.z
  }))
}

export function fromPanels(panels: Panel[]): PersistedPanel[] {
  return panels.map((panel) => ({
    id: panel.rect.id,
    x: panel.rect.x,
    y: panel.rect.y,
    w: panel.rect.w,
    h: panel.rect.h,
    z: panel.z,
    cwd: panel.spec.cwd,
    ...(panel.spec.command === undefined ? {} : { command: panel.spec.command }),
    args: [...panel.spec.args]
  }))
}
```

- [ ] **Step 4: Run**

Run: `npm run verify:layout`
Expected: `15/15 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/layout-adapt.ts scripts/layout-entry.cjs scripts/verify-layout.cjs
git commit -m "feat(m4b): lossless converters between the persisted and in-memory panel

They live renderer-side because Panel is a renderer type and shared/ must
not import from renderer/. An absent command stays absent through both
directions: only main can name the login shell."
```

---

### Task 3: The pure undo stack

**Files:**
- Create: `src/renderer/panels/history.ts`
- Modify: `scripts/viewport-entry.cjs`
- Modify: `scripts/verify-viewport.cjs` (checks 40-45)

**Interfaces:**
- Consumes: nothing.
- Produces: `HISTORY_LIMIT`, `History<T>`, `createHistory<T>(present: T): History<T>`, `pushHistory<T>(h, next): History<T>`, `undoHistory<T>(h): History<T>`, `redoHistory<T>(h): History<T>`, `canUndo(h): boolean`, `canRedo(h): boolean`.

- [ ] **Step 1: Add the checks**

Append to `scripts/verify-viewport.cjs`, before the summary block:

```js
// 40. push/undo/redo is the basic contract.
{
  let h = V.createHistory('a')
  h = V.pushHistory(h, 'b')
  h = V.pushHistory(h, 'c')
  const u1 = V.undoHistory(h)
  const u2 = V.undoHistory(u1)
  const r1 = V.redoHistory(u2)
  ok('40 push then undo then redo walks the states',
    h.present === 'c' && u1.present === 'b' && u2.present === 'a' && r1.present === 'b',
    `${h.present} ${u1.present} ${u2.present} ${r1.present}`)
}

// 41. Undoing past the start and redoing past the end are no-ops, not throws
//     and not undefined. Cmd+Z on a fresh canvas must do nothing quietly.
{
  const fresh = V.createHistory('a')
  const back = V.undoHistory(fresh)
  const fwd = V.redoHistory(fresh)
  ok('41 undo past the beginning and redo past the end are no-ops',
    back.present === 'a' && fwd.present === 'a' &&
    V.canUndo(fresh) === false && V.canRedo(fresh) === false,
    `${back.present} ${fwd.present}`)
}

// 42. A new action after an undo drops the redo branch. Keeping it would let
//     Cmd+Shift+Z jump to a state that never followed the current one.
{
  let h = V.pushHistory(V.createHistory('a'), 'b')
  h = V.undoHistory(h)
  h = V.pushHistory(h, 'c')
  ok('42 a new action after an undo clears the redo branch',
    h.present === 'c' && V.canRedo(h) === false && h.future.length === 0,
    `present=${h.present} future=${h.future.length}`)
}

// 43. The cap bounds memory across a long session. The OLDEST entry is the one
//     dropped — dropping the newest would make the most recent edit unundoable.
{
  let h = V.createHistory(0)
  for (let i = 1; i <= V.HISTORY_LIMIT + 10; i += 1) h = V.pushHistory(h, i)
  ok('43 the past is capped and drops the oldest entry',
    h.past.length === V.HISTORY_LIMIT && h.past[0] === 11,
    `len=${h.past.length} oldest=${h.past[0]}`)
}

// 44. Pure: no input is mutated. Canvas holds these in React state, and a
//     mutated "previous" object is a re-render that never happens.
{
  const h = V.pushHistory(V.createHistory('a'), 'b')
  const before = JSON.stringify(h)
  V.undoHistory(h)
  V.pushHistory(h, 'z')
  ok('44 history operations never mutate their input', JSON.stringify(h) === before)
}

// 45. Pushing the SAME state is still a distinct entry. Canvas pushes on
//     gesture commit, and a drag that ends where it started is a real (if
//     pointless) edit; collapsing it here would need value equality this
//     module has no business defining.
{
  const h = V.pushHistory(V.createHistory('a'), 'a')
  ok('45 pushing an equal state still records an entry',
    V.canUndo(h) === true && h.past.length === 1, `past=${h.past.length}`)
}
```

Add the module to `scripts/viewport-entry.cjs`:

```js
module.exports = {
  ...require('../src/renderer/canvas/viewport'),
  ...require('../src/renderer/canvas/canvas-input'),
  ...require('../src/renderer/canvas/lod'),
  ...require('../src/renderer/canvas/panel-interaction'),
  ...require('../src/renderer/canvas/pointer-correct'),
  ...require('../src/renderer/panels/panels'),
  ...require('../src/renderer/panels/history')
}
```

- [ ] **Step 2: Watch them fail**

Run: `npm run verify:viewport`
Expected: esbuild fails with `Could not resolve "../src/renderer/panels/history"`.

- [ ] **Step 3: Implement**

Create `src/renderer/panels/history.ts`:

```ts
/**
 * The undo stack, as a pure past/present/future triple.
 *
 * Generic over the state it holds and free of React, DOM, and any knowledge of
 * panels — which is what puts it in the plain-node verify bundle beside
 * viewport.ts and lod.ts. Canvas.tsx instantiates it at History<Panel[]>.
 *
 * It is generic for a second reason worth recording: the undo stack and the
 * persistence snapshot are the same data. M4b already serialises Panel[] on
 * every change to feed layout:save, so an undo history is that same sequence
 * kept in memory rather than written to disk.
 */

/** Bounds memory across a long session. Fifty edits is far past useful recall. */
export const HISTORY_LIMIT = 50

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0
}

/**
 * Records `next` as the new present. The redo branch is dropped: keeping it
 * would let Cmd+Shift+Z jump to a state that never followed the current one.
 *
 * Deliberately no equality check. Canvas pushes once per COMMITTED gesture, and
 * a drag that ends where it started is a real edit; deciding otherwise needs a
 * notion of equality this module has no business defining.
 */
export function pushHistory<T>(h: History<T>, next: T): History<T> {
  const past = [...h.past, h.present]
  return {
    // slice from the END, so the OLDEST entry is the one dropped. Dropping the
    // newest would make the most recent edit the one you cannot undo.
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: []
  }
}

/** A no-op at the beginning of history — Cmd+Z on a fresh canvas does nothing. */
export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  const previous = h.past[h.past.length - 1]
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future]
  }
}

/** A no-op at the end of history. */
export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  const [next, ...rest] = h.future
  return { past: [...h.past, h.present], present: next, future: rest }
}
```

- [ ] **Step 4: Run**

Run: `npm run verify:viewport`
Expected: `45/45 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/history.ts scripts/viewport-entry.cjs scripts/verify-viewport.cjs
git commit -m "feat(m4b): a pure past/present/future undo stack

Generic and React-free so it runs in the plain-node bundle. The cap drops
the OLDEST entry: dropping the newest would make the most recent edit the
one you cannot undo."
```

---

### Task 4: The main-process layout store

**Files:**
- Create: `src/main/layout-store.ts`
- Modify: `scripts/layout-entry.cjs`
- Modify: `scripts/verify-layout.cjs` (checks 16-24)

**Interfaces:**
- Consumes: everything from `@shared/layout-schema` (imported by relative path `../shared/layout-schema`, matching the rest of `src/main/`).
- Produces:

```ts
export const WRITE_DEBOUNCE_MS = 500
export type Cancel = () => void
export interface LayoutStoreDeps {
  filePath: string
  /** Injected so verify:layout can drive the debounce without real timers. */
  schedule?: (fn: () => void, ms: number) => Cancel
  onWarning?: (message: string) => void
}
export interface LayoutStore {
  load(): void
  initial(): CanvasState
  save(incoming: CanvasState): void
  settings(): RestoreSettings
  setSetting(key: keyof RestoreSettings, value: boolean): void
  reset(): void
  flushSync(): void
}
export function createLayoutStore(deps: LayoutStoreDeps): LayoutStore
```

- [ ] **Step 1: Add the checks**

Append to `scripts/verify-layout.cjs`, before the summary block:

```js
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } = require('node:fs')
const { tmpdir } = require('node:os')

const tmp = () => join(mkdtempSync(join(tmpdir(), 'tc-layout-')), 'layout.json')
/** A fake scheduler, so the debounce is driven explicitly instead of by a clock. */
const fakeClock = () => {
  const pending = []
  return {
    schedule: (fn) => { pending.push(fn); return () => { const i = pending.indexOf(fn); if (i >= 0) pending.splice(i, 1) } },
    fire: () => { const run = pending.splice(0); for (const fn of run) fn() },
    count: () => pending.length
  }
}
const CANVAS = {
  panels: [{ id: 'p1', x: 5, y: 6, w: 720, h: 460, z: 2, cwd: '~', args: ['-l'] }],
  camera: { x: 1, y: 2, scale: 1.5 },
  selectedId: 'p1',
  focusedId: null
}

// 16. A missing file is a first run, not an error.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  const state = store.initial()
  ok('16 a missing layout file yields an empty canvas',
    state.panels.length === 0 && state.camera.scale === L.DEFAULT_CAMERA.scale,
    JSON.stringify(state.camera))
}

// 17. A saved canvas comes back.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load(); a.save(CANVAS); a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('17 a saved canvas round-trips through the file',
    JSON.stringify(b.initial()) === JSON.stringify(CANVAS), JSON.stringify(b.initial()))
}

// 18. COALESCING. Sixty snapshots a second arrive during a drag; they must
//     collapse to one scheduled write, keeping the newest.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  for (let i = 0; i < 60; i += 1) store.save({ ...CANVAS, camera: { x: i, y: 0, scale: 1 } })
  const scheduled = clock.count()
  clock.fire()
  const written = JSON.parse(readFileSync(path, 'utf8'))
  ok('18 sixty saves collapse to one write of the newest state',
    scheduled === 1 && written.workspaces[0].camera.x === 59,
    `scheduled=${scheduled} x=${written.workspaces[0].camera.x}`)
}

// 19. flushSync writes the newest state even with a write still pending, and
//     cancels the pending one rather than leaving it to fire after quit.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  store.save(CANVAS)
  store.flushSync()
  const written = JSON.parse(readFileSync(path, 'utf8'))
  ok('19 flushSync writes immediately and cancels the pending write',
    written.workspaces[0].panels.length === 1 && clock.count() === 0,
    `pending=${clock.count()}`)
}

// 20. flushSync must NEVER throw: it runs inside app.on('before-quit'), where
//     an exception can wedge the quit itself.
{
  const store = L.createLayoutStore({ filePath: '/proc/nonexistent-dir/layout.json' })
  let threw = null
  try { store.load(); store.save(CANVAS); store.flushSync() } catch (e) { threw = e.message }
  ok('20 an unwritable path never throws out of flushSync', threw === null, threw ?? 'ok')
}

// 21. No .tmp file is left behind. The write is tmp-then-rename so a crash
//     mid-write cannot truncate the real file.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load(); store.save(CANVAS); store.flushSync()
  ok('21 the atomic write leaves no .tmp file behind',
    existsSync(path) && !existsSync(path + '.tmp'))
}

// 22. Settings are preserved across a renderer merge. The renderer does not
//     have them and does not send them; main must not lose them.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.setSetting('camera', false)
  store.save(CANVAS)
  store.flushSync()
  const reopened = L.createLayoutStore({ filePath: path })
  reopened.load()
  ok('22 a renderer save preserves main-side settings',
    reopened.settings().camera === false && reopened.settings().layout === true,
    JSON.stringify(reopened.settings()))
}

// 23. Settings are APPLIED by initial(), so the renderer never learns they
//     exist. layout off implies no panels, which implies no selection.
{
  const path = tmp()
  const seed = L.createLayoutStore({ filePath: path })
  seed.load(); seed.save(CANVAS); seed.flushSync()

  const noCamera = L.createLayoutStore({ filePath: path })
  noCamera.load(); noCamera.setSetting('camera', false)
  const noLayout = L.createLayoutStore({ filePath: path })
  noLayout.load(); noLayout.setSetting('layout', false)
  const noFocus = L.createLayoutStore({ filePath: path })
  noFocus.load(); noFocus.setSetting('focus', false)

  ok('23 initial() applies each restore setting independently',
    noCamera.initial().camera.scale === L.DEFAULT_CAMERA.scale &&
    noCamera.initial().panels.length === 1 &&
    noLayout.initial().panels.length === 0 &&
    noLayout.initial().selectedId === null &&
    noFocus.initial().selectedId === null &&
    noFocus.initial().panels.length === 1,
    `cam=${noCamera.initial().camera.scale} lay=${noLayout.initial().panels.length}`)
}

// 24. A future-version file is BACKED UP before being replaced, or the
//     fallback's first write destroys a layout a newer build authored.
{
  const path = tmp()
  writeFileSync(path, JSON.stringify({ version: 99, workspaces: [] }))
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.save(CANVAS)
  store.flushSync()
  const backup = JSON.parse(readFileSync(path + '.bak', 'utf8'))
  ok('24 a future-version file is preserved as .bak before being replaced',
    backup.version === 99 && existsSync(path), `bak.version=${backup.version}`)
}
```

Add the module to `scripts/layout-entry.cjs`:

```js
module.exports = {
  ...require('../src/shared/layout-schema'),
  ...require('../src/shared/panel-geometry'),
  ...require('../src/renderer/panels/layout-adapt'),
  ...require('../src/main/layout-store')
}
```

- [ ] **Step 2: Watch them fail**

Run: `npm run verify:layout`
Expected: esbuild fails with `Could not resolve "../src/main/layout-store"`.

- [ ] **Step 3: Implement**

Create `src/main/layout-store.ts`:

```ts
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import {
  defaultSnapshot,
  defaultWorkspace,
  parseLayout,
  type CanvasState,
  type LayoutSnapshot,
  type RestoreSettings,
  type Workspace
} from '../shared/layout-schema'

/**
 * Owns layout.json.
 *
 * In MAIN rather than the renderer, and the deciding argument is the quit
 * flush. It has to happen at before-quit, main-side. If the renderer owned the
 * debounce, main would have to ask the renderer for a snapshot at exactly the
 * moment the renderer might already be destroyed — which is precisely the
 * failure window-lifecycle.ts exists to handle, where Cmd+R and Cmd+W tear
 * down the page without running any React cleanup. Holding the snapshot here
 * makes the flush a writeFileSync with nobody to ask.
 *
 * `filePath` is a parameter rather than an app.getPath('userData') call inside,
 * the same move session-registry.ts makes with its bridge and factory. It is
 * not ceremony: an electron import here would force verify:layout out of the
 * plain-node tier and into Electron-as-node, where every check costs a process
 * spawn and a native-module load.
 */

export const WRITE_DEBOUNCE_MS = 500

export type Cancel = () => void

export interface LayoutStoreDeps {
  filePath: string
  /**
   * Injected so verify:layout can drive the debounce explicitly instead of
   * waiting on a real clock — which would make the coalescing check both slow
   * and timing-flaky.
   */
  schedule?: (fn: () => void, ms: number) => Cancel
  onWarning?: (message: string) => void
}

export interface LayoutStore {
  /** Read and parse once at startup. Backs up a future-version file. */
  load(): void
  /** The resolved starting state for the renderer, restore settings applied. */
  initial(): CanvasState
  /** Merge a renderer snapshot into the active workspace and schedule a write. */
  save(incoming: CanvasState): void
  settings(): RestoreSettings
  setSetting(key: keyof RestoreSettings, value: boolean): void
  /** Return the active workspace to an empty canvas. */
  reset(): void
  /** Write now, synchronously. Never throws. */
  flushSync(): void
}

const defaultSchedule = (fn: () => void, ms: number): Cancel => {
  const handle = setTimeout(fn, ms)
  return () => clearTimeout(handle)
}

export function createLayoutStore(deps: LayoutStoreDeps): LayoutStore {
  const { filePath } = deps
  const schedule = deps.schedule ?? defaultSchedule
  const warn = deps.onWarning ?? ((m: string) => console.warn(`[layout] ${m}`))

  let snapshot: LayoutSnapshot = defaultSnapshot()
  let cancelPending: Cancel | null = null
  let dirty = false

  function activeWorkspace(): Workspace {
    const found = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId)
    if (found) return found
    // parseLayout guarantees at least one workspace and a resolvable active id,
    // so this only fires for a snapshot built in code. Repair rather than
    // throw: there is no caller that can do anything useful with an exception.
    const fresh = defaultWorkspace()
    snapshot.workspaces = [fresh]
    snapshot.activeWorkspaceId = fresh.id
    return fresh
  }

  function writeNow(): void {
    // Never throws. flushSync's caller is app.on('before-quit'), where an
    // exception can wedge the quit itself; and a disk that cannot be written
    // is a reason to log, not a reason to refuse to run.
    try {
      const tmp = `${filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
      // rename is atomic on macOS. Writing in place would let a crash
      // mid-write leave a truncated file — parseLayout survives that, but it
      // survives it by discarding the whole canvas.
      renameSync(tmp, filePath)
      dirty = false
    } catch (error: unknown) {
      warn(`could not write ${filePath}: ${String(error)}`)
    }
  }

  function scheduleWrite(): void {
    dirty = true
    // Coalescing, not queueing. A drag sends ~60 snapshots a second; only the
    // newest matters, and re-arming would postpone the write for the whole
    // gesture rather than bounding it.
    if (cancelPending) return
    cancelPending = schedule(() => {
      cancelPending = null
      writeNow()
    }, WRITE_DEBOUNCE_MS)
  }

  return {
    load() {
      if (!existsSync(filePath)) return

      let raw: string
      try {
        raw = readFileSync(filePath, 'utf8')
      } catch (error: unknown) {
        warn(`could not read ${filePath}: ${String(error)}`)
        return
      }

      const { snapshot: parsed, warnings, futureVersion } = parseLayout(raw)
      for (const message of warnings) warn(message)

      if (futureVersion) {
        // Preserve it before the fallback's first write replaces it. Without
        // this, opening an old build once destroys a layout a newer build
        // authored, with no way back.
        try {
          renameSync(filePath, `${filePath}.bak`)
          warn(`preserved the newer layout file as ${filePath}.bak`)
        } catch (error: unknown) {
          warn(`could not back up ${filePath}: ${String(error)}`)
        }
      }

      snapshot = parsed
    },

    initial() {
      const w = activeWorkspace()
      const { layout, camera, focus } = snapshot.settings
      // Settings are applied HERE so the renderer never learns they exist —
      // the same shape as PanelSpec.command, where main resolves what only
      // main can know and the renderer consumes the answer.
      const panels = layout ? w.panels.map((p) => ({ ...p })) : []
      // With no panels there is nothing for a selection to name, so it goes
      // regardless of the focus setting.
      const keepSelection = layout && focus
      return {
        panels,
        camera: camera ? { ...w.camera } : { ...defaultWorkspace().camera },
        selectedId: keepSelection ? w.selectedId : null,
        focusedId: keepSelection ? w.focusedId : null
      }
    },

    save(incoming) {
      const w = activeWorkspace()
      // Only the four fields the renderer owns. `settings`, `id`, and `name`
      // are main's and must survive every merge — the renderer does not have
      // them and cannot send them back.
      w.panels = incoming.panels.map((p) => ({ ...p }))
      w.camera = { ...incoming.camera }
      w.selectedId = incoming.selectedId
      w.focusedId = incoming.focusedId
      scheduleWrite()
    },

    settings: () => ({ ...snapshot.settings }),

    setSetting(key, value) {
      snapshot.settings[key] = value
      scheduleWrite()
    },

    reset() {
      const w = activeWorkspace()
      const fresh = defaultWorkspace()
      w.panels = []
      w.camera = { ...fresh.camera }
      w.selectedId = null
      w.focusedId = null
      scheduleWrite()
    },

    flushSync() {
      if (cancelPending) {
        cancelPending()
        cancelPending = null
      }
      if (dirty) writeNow()
    }
  }
}
```

- [ ] **Step 4: Run**

Run: `npm run verify:layout`
Expected: `24/24 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/main/layout-store.ts scripts/layout-entry.cjs scripts/verify-layout.cjs
git commit -m "feat(m4b): the main-process layout store

Main owns the file because the quit flush cannot ask a renderer that may
already be destroyed. Writes coalesce to one per 500ms and land via
tmp-then-rename; flushSync never throws, since it runs inside before-quit."
```

---

### Task 5: The IPC surface and main wiring

**Files:**
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `createLayoutStore`, `LayoutStore` from `./layout-store`; `CanvasState` from `@shared/layout-schema`.
- Produces: `IPC.LAYOUT_LOAD = 'layout:load'`, `IPC.LAYOUT_SAVE = 'layout:save'`, and on the bridge:

```ts
layout: {
  load(): Promise<CanvasState>
  save(state: CanvasState): Promise<void>
}
```

- [ ] **Step 1: Declare the channels**

In `src/shared/ipc-contract.ts`, add to `IPC`:

```ts
  /** Live sessions, so a fresh renderer can reconcile instead of guessing. */
  PTY_LIST: 'pty:list',
  /**
   * The resolved starting canvas. Main applies the restore settings before
   * answering, so the renderer never learns those settings exist.
   */
  LAYOUT_LOAD: 'layout:load',
  /** A full snapshot on every change; main coalesces and decides when to write. */
  LAYOUT_SAVE: 'layout:save'
```

Import `CanvasState` at the top:

```ts
import type { CanvasState } from './layout-schema'
```

and add to `CanvasBridge`, after `edit`:

```ts
  layout: {
    /** Called ONCE, before React mounts. See renderer/main.tsx. */
    load(): Promise<CanvasState>
    save(state: CanvasState): Promise<void>
  }
```

- [ ] **Step 2: Expose it in the preload**

In `src/preload/index.ts`, add to the `bridge` object after `edit`:

```ts
  layout: {
    load: () => ipcRenderer.invoke(IPC.LAYOUT_LOAD),
    save: (state: CanvasState) => ipcRenderer.invoke(IPC.LAYOUT_SAVE, state)
  },
```

and add `import type { CanvasState } from '../shared/layout-schema'`.

- [ ] **Step 3: Handle them in main**

In `src/main/ipc.ts`, change the signature and add two handlers:

```ts
import type { LayoutStore } from './layout-store'
import type { CanvasState } from '../shared/layout-schema'

/** Registers the whole renderer -> main surface. One place, one call. */
export function registerIpcHandlers(ptyManager: PtyManager, layoutStore: LayoutStore): void {
  // ... existing pty handlers unchanged ...

  ipcMain.handle(IPC.LAYOUT_LOAD, () => layoutStore.initial())

  ipcMain.handle(IPC.LAYOUT_SAVE, (_event, state: CanvasState) => {
    layoutStore.save(state)
  })
}
```

- [ ] **Step 4: Construct and flush it**

In `src/main/index.ts`:

```ts
import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { createLayoutStore } from './layout-store'
// ... existing imports ...

const ptyManager = new PtyManager(() => mainWindow?.webContents ?? null)

// userData is the standard per-user application directory; app.getPath is only
// valid once the app module is loaded, which it is by the time this module runs.
const layoutStore = createLayoutStore({
  filePath: join(app.getPath('userData'), 'layout.json')
})
```

In `app.whenReady()`, load the store **before** the menu is built (Task 10 gives the menu the settings) and before the window exists:

```ts
  layoutStore.load()

  buildAppMenu()
  registerIpcHandlers(ptyManager, layoutStore)
  createWindow()
```

Replace the `before-quit` handler:

```ts
app.on('before-quit', () => {
  // Flush BEFORE killing the PTYs. killAll can take time and this must not be
  // racing a process teardown; the store already holds the newest snapshot, so
  // this is a synchronous write with nothing to wait for.
  layoutStore.flushSync()
  ptyManager.killAll()
})
```

- [ ] **Step 5: Verify the contract**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run verify:ipc`
Expected: PASS — it asserts every channel in `IPC` has a main-process handler, so it now covers `layout:load` and `layout:save`. If `verify-ipc-surface.cjs` constructs `registerIpcHandlers` itself, give it a store built against a tmpdir path; check `scripts/verify-ipc-surface.cjs` and update the call site to match the new two-argument signature.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/ipc.ts src/main/index.ts scripts/verify-ipc-surface.cjs
git commit -m "feat(m4b): layout:load and layout:save on the IPC contract

Two invoke channels and no new events: the restore settings affect boot
only, so main applies them itself and the renderer never learns they
exist. before-quit flushes the store before killing PTYs."
```

---

### Task 6: The renderer boots from the store

**Files:**
- Modify: `src/renderer/main.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/canvas/useViewport.ts`
- Modify: `src/renderer/panels/panels.ts`

**Interfaces:**
- Consumes: `window.canvas.layout.load()`, `toPanels` (Task 2), `CanvasState`, `DEFAULT_CAMERA`.
- Produces: `firstRunPanels(): Panel[]` and `FIRST_RUN_ID = 'p1'` from `panels.ts`; `Canvas({ initial }: { initial: CanvasState })`; `App({ initial })`; `useViewport(hostRef, rects, onSpawn, shouldYieldWheel, initialCamera)`.

- [ ] **Step 1: Give `panels.ts` a first-run canvas**

In `src/renderer/panels/panels.ts`, add below `SEED_PANELS` (leave `SEED_PANELS` in place — `verify:panels` depends on twelve panels against a `LIVE_BUDGET` of 8, which is a test's requirement rather than a product decision):

```ts
/** The id the single first-run panel gets. Kept out of the `n` sequence Cmd+N uses. */
export const FIRST_RUN_ID = 'p1'

/**
 * What a fresh install — or a canvas that was reset — opens with.
 *
 * One panel at the world origin, deliberately a placeholder: the new-canvas
 * wizard milestone (count control, per-panel working directory, CLI picker)
 * replaces this. SEED_PANELS' twelve scattered entries stay put as verify
 * fixture data, which is what they have always actually been.
 */
export function firstRunPanels(): Panel[] {
  return [{ rect: { id: FIRST_RUN_ID, x: -PANEL_W / 2, y: -PANEL_H / 2, w: PANEL_W, h: PANEL_H }, spec: shell(FIRST_RUN_ID), z: 1 }]
}
```

- [ ] **Step 2: Let the camera start somewhere other than `INITIAL`**

In `src/renderer/canvas/useViewport.ts`, take an optional starting viewport:

```ts
export function useViewport(
  hostRef: RefObject<HTMLElement | null>,
  rects: WorldRect[],
  onSpawn?: (worldCentre: Point) => void,
  shouldYieldWheel?: (event: WheelEvent) => boolean,
  /** The restored camera. Cmd+0 still returns to INITIAL, not to this. */
  initialViewport?: Viewport
): Viewport {
  const [viewport, setViewport] = useState<Viewport>(initialViewport ?? INITIAL)
```

Leave `case '0'` calling `setViewport(INITIAL)` unchanged: Cmd+0 means "home", and pointing it at whatever the camera happened to be at launch would make it a different, less useful shortcut.

- [ ] **Step 3: Await the load before React mounts**

Replace `src/renderer/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { App } from './App'
import { installDropGuard } from './drop-guard'

// Installed before React mounts, and never uninstalled: an unhandled file drop
// navigates the renderer, which kills every PTY in the window. Nothing about
// that is React's concern, so it does not live in a component's effect.
// PRESERVED FROM THE DROP-GUARD WORK — do not drop this call while rewriting
// the file for the async boot below.
installDropGuard()

const container = document.getElementById('root')
if (!container) throw new Error('#root missing from index.html')

// The starting canvas is awaited BEFORE the first render rather than loaded in
// an effect afterwards. useState is synchronous, so an async initial state
// would mean rendering an empty canvas first and running the whole tiering
// pass against it. The window is `show: false` until ready-to-show, so one IPC
// round trip is invisible.
//
// The side benefit outlives the reason: a Canvas that RECEIVES its starting
// state can be mounted by verify:panels against a known layout, instead of
// against whatever a hardcoded constant happens to say.
async function boot(): Promise<void> {
  const initial = await window.canvas.layout.load()
  // Deliberately NOT wrapped in StrictMode. StrictMode double-invokes effects
  // in development, which for a terminal means spawning a PTY, killing it, and
  // spawning it again on every mount.
  createRoot(container!).render(<App initial={initial} />)
}

void boot()
```

- [ ] **Step 4: Thread it through `App`**

Replace `src/renderer/App.tsx`:

```tsx
import type { JSX } from 'react'
import type { CanvasState } from '@shared/layout-schema'
import { Canvas } from './canvas/Canvas'

/**
 * M4b: the starting canvas arrives from main rather than from a constant.
 * App stays a pass-through — it exists to own the outer layout, not state.
 */
export function App({ initial }: { initial: CanvasState }): JSX.Element {
  return (
    <div className="app">
      <Canvas initial={initial} />
    </div>
  )
}
```

- [ ] **Step 5: Boot `Canvas` from the prop**

In `src/renderer/canvas/Canvas.tsx`, replace the `panels` state initialiser and the `nextIdRef` initialiser.

Add imports:

```ts
import type { CanvasState } from '@shared/layout-schema'
import { toPanels } from '@renderer/panels/layout-adapt'
import { firstRunPanels, makePanel, nextZ, raisePanel, removePanel, setPanelRect, type Panel } from '@renderer/panels/panels'
```

(`SEED_PANELS` is no longer imported here.)

Change the signature and the two initialisers:

```tsx
export function Canvas({ initial }: { initial: CanvasState }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  // An empty panel list means first run (or a reset canvas): the store returns
  // no panels and the renderer decides what "nothing" opens with. That also
  // makes closing every panel and relaunching give back one fresh panel rather
  // than a blank canvas — intended, since a canvas with nothing on it and no
  // visible affordance is the outcome this design already rejected.
  const [panels, setPanels] = useState<Panel[]>(() =>
    initial.panels.length > 0 ? toPanels(initial.panels) : firstRunPanels()
  )

  // ... rects / hitOrder unchanged ...

  // Seeded from the RESTORED ids, never from a constant. `1` on every run was
  // sound while the array always started empty; persistence breaks that.
  // Restore a canvas holding n5, press Cmd+N five times, and the fifth panel is
  // n5 too — a duplicate id, and every consequence of one is silent:
  // registry.ensure returns the EXISTING session, so the new panel renders the
  // old one's handle.host (which can live in exactly one slot), and
  // setPanelRect/removePanel then act on both entries at once. This is the same
  // defect M4a fixed by replacing length-derived ids; persistence resurrects it
  // through a different door.
  const nextIdRef = useRef(
    initial.panels.reduce((max, p) => {
      const match = /^n(\d+)$/.exec(p.id)
      return match ? Math.max(max, Number(match[1]) + 1) : max
    }, 1)
  )
```

Restore selection and focus, and pass the camera to `useViewport`:

```tsx
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId)
  const [focusedId, setFocusedId] = useState<string | null>(initial.focusedId)
```

```tsx
  const viewport = useViewport(hostRef, rects, onSpawn, shouldYieldWheel, initial.camera)
```

- [ ] **Step 6: Typecheck and run the existing suites**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run verify`
Expected: every suite green. `verify:panels` still passes because a fresh `userData` has no `layout.json`, so `initial.panels` is empty — but note it now exercises the **one-panel** first-run canvas rather than twelve. If any `verify:panels` check depends on twelve panels being present, have `scripts/panels-entry.cjs` seed the store's file with `SEED_PANELS` converted through `fromPanels` before the window loads, so the suite keeps the fixture it was written against. Do not weaken the checks to match a smaller canvas.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/main.tsx src/renderer/App.tsx src/renderer/canvas/Canvas.tsx \
        src/renderer/canvas/useViewport.ts src/renderer/panels/panels.ts scripts/panels-entry.cjs
git commit -m "feat(m4b): the renderer boots from the persisted canvas

main.tsx awaits layout:load before the first render, so Canvas receives
its starting state as a prop instead of reading a constant. nextIdRef
seeds from the restored ids: initialising it to 1 would collide with a
restored n5 after five Cmd+N presses, silently."
```

---

### Task 7: Dormancy

**Files:**
- Modify: `src/renderer/canvas/lod.ts`
- Modify: `src/renderer/session/panel-session.ts`
- Modify: `src/renderer/session/session-registry.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/components/TerminalPanel.tsx`
- Modify: `scripts/verify-viewport.cjs` (checks 46-47)
- Modify: `scripts/verify-registry.cjs` (checks 21-22)

**Interfaces:**
- Consumes: `TierInput`, `PanelSession`, `Registry` from earlier code.
- Produces: `TierInput.dormantIds?: ReadonlySet<string>`; `PanelSession.dormant: boolean`; `Registry.ensure(id, spec, options?: { dormant?: boolean })`; `Registry.wake(id): void`.

- [ ] **Step 1: Add the tiering checks**

Append to `scripts/verify-viewport.cjs`:

```js
// 46. A dormant panel is never promoted, even sitting in the middle of the
//     viewport. This is what makes panning a restored canvas spawn nothing.
{
  const rects = [{ id: 'a', x: 0, y: 0, w: 400, h: 300 }, { id: 'b', x: 500, y: 0, w: 400, h: 300 }]
  const base = { rects, viewport: { x: 0, y: 0, scale: 1 }, size: { width: 1600, height: 900 }, focusedId: null, lastFocusedAt: {} }
  const plain = V.assignTiers(base)
  const withDormant = V.assignTiers({ ...base, dormantIds: new Set(['a']) })
  ok('46 a dormant panel is not promoted even when fully visible',
    plain.a === 'live' && withDormant.a === 'card' && withDormant.b === 'live',
    `plain.a=${plain.a} dormant.a=${withDormant.a} b=${withDormant.b}`)
}

// 47. THE PRECEDENCE RULE. assignTiers pins the focused panel live
//     unconditionally, so restoring focus onto a restored panel would spawn a
//     process at boot — contradicting "dormant until clicked". Dormancy wins.
{
  const rects = [{ id: 'a', x: 0, y: 0, w: 400, h: 300 }]
  const tiers = V.assignTiers({
    rects, viewport: { x: 0, y: 0, scale: 1 }, size: { width: 1600, height: 900 },
    focusedId: 'a', lastFocusedAt: {}, dormantIds: new Set(['a'])
  })
  ok('47 dormancy outranks focus', tiers.a === 'card', `a=${tiers.a}`)
}
```

- [ ] **Step 2: Watch them fail**

Run: `npm run verify:viewport`
Expected: FAIL on 46 and 47 — `assignTiers` ignores `dormantIds`, so both return `'live'`.

- [ ] **Step 3: Implement the tiering rule**

In `src/renderer/canvas/lod.ts`, add to `TierInput`:

```ts
  /**
   * Panels restored from disk that have not been clicked yet. A dormant panel
   * is NEVER promoted — see the precedence note in assignTiers.
   */
  dormantIds?: ReadonlySet<string>
```

and in `assignTiers`:

```ts
  const { rects, viewport, size, focusedId, lastFocusedAt } = input
  const budget = input.budget ?? LIVE_BUDGET
  const dormant = input.dormantIds ?? new Set<string>()
```

```ts
  const eligible = rects.filter(
    (rect) =>
      rect.id !== focusedId &&
      !dormant.has(rect.id) &&
      viewport.scale >= LIVE_MIN_SCALE &&
      intersectsViewport(rect, viewport, size)
  )
```

```ts
  // Dormancy OUTRANKS focus, and the ordering is the whole point. Restoring
  // focus onto a panel that came back from disk would otherwise pin it live at
  // boot, spawn its PTY, and contradict "dormant until clicked" on the very
  // first frame. Restored focus therefore comes back as a highlight and a
  // Cmd+C routing target only.
  let slots = budget
  if (focusedId && tiers[focusedId] !== undefined && !dormant.has(focusedId)) {
    tiers[focusedId] = 'live'
    slots -= 1
  }
```

Run `npm run verify:viewport`. Expected: `47/47 passed`.

- [ ] **Step 4: Add the registry checks**

Append to `scripts/verify-registry.cjs` (following the file's existing `ok(...)` and fake-bridge conventions; check the file for the exact helper names before writing):

```js
// 21. A dormant session does not spawn when its slot attaches. Belt and braces
//     under the tiering rule: dormant panels should never reach 'live' at all,
//     but a registry that spawns on attach regardless would make the whole
//     feature depend on lod.ts alone being right.
{
  const { registry, bridge } = makeRegistry()
  registry.ensure('d1', spec('d1'), { dormant: true })
  registry.applyTiers({ d1: 'live' })
  registry.attachSlot('d1')
  ok('21 attaching a dormant session spawns no pty',
    bridge.created.length === 0 && registry.get('d1').spawned === false,
    `created=${bridge.created.length}`)
}

// 22. wake() clears dormancy and spawns exactly once, and a second wake is a
//     no-op rather than a second process.
{
  const { registry, bridge } = makeRegistry()
  registry.ensure('d1', spec('d1'), { dormant: true })
  registry.applyTiers({ d1: 'live' })
  registry.attachSlot('d1')
  registry.wake('d1')
  registry.wake('d1')
  ok('22 wake spawns once and is idempotent',
    bridge.created.length === 1 && registry.get('d1').dormant === false,
    `created=${bridge.created.length}`)
}
```

Run `npm run verify:registry`. Expected: FAIL on 21 and 22 (`ensure` takes two arguments; `wake` does not exist).

- [ ] **Step 5: Implement dormancy in the session layer**

In `src/renderer/session/panel-session.ts`, add to `PanelSession`:

```ts
  /**
   * True for a panel restored from disk that has not been clicked this run.
   *
   * A restored panel is one the user asked for LAST run; spawning it because
   * the camera drifted over it is a decision the app would be making on their
   * behalf, and on a twelve-panel canvas that is twelve agent CLIs launched by
   * panning. lod.ts never promotes a dormant panel (dormancy outranks even
   * focus), and attachSlot refuses to spawn one, so both layers have to agree
   * before a process starts.
   *
   * In M4c this becomes the seam where waking means RECONNECT to a surviving
   * tmux session rather than spawn a fresh process.
   */
  dormant: boolean
```

In `src/renderer/session/session-registry.ts`:

```ts
export interface Registry {
  ensure(id: PanelId, spec: PanelSpecTemplate, options?: { dormant?: boolean }): PanelSession
  // ... existing members ...
  /**
   * Clear dormancy and, if the slot is already attached, spawn. Called when
   * the user clicks a restored panel — via onSelectPanel, not onFocusPanel: a
   * carded panel has no .panel__slot and therefore no focus handler at all.
   */
  wake(id: PanelId): void
}
```

```ts
    ensure(id, spec, options) {
      const existing = sessions.get(id)
      if (existing) return existing
      const session: PanelSession = {
        id,
        spec,
        handle: factory.create(id),
        status: { kind: 'idle' },
        tier: 'card',
        spawned: false,
        dormant: options?.dormant ?? false,
        sentGrid: null,
        lastFocusedAt: 0
      }
      sessions.set(id, session)
      return session
    },
```

In `attachSlot`, guard the spawn:

```ts
    attachSlot(id) {
      const session = sessions.get(id)
      if (!session) return
      session.handle.attach()
      if (!session.spawned) {
        // A dormant panel gets its terminal but not its process. Under the
        // tiering rule it should never be live at all; this second guard means
        // "no process starts by itself" does not rest on lod.ts alone.
        if (session.dormant) return
        spawn(session)
        return
      }
      // ... existing sentGrid comparison unchanged ...
    },
```

Add `wake` beside `focus`:

```ts
    wake(id) {
      const session = sessions.get(id)
      if (!session || !session.dormant) return
      session.dormant = false
      // Only spawn if the host is actually attached: spawn() reads
      // handle.size(), which needs a fitted terminal. If the panel is still
      // carded, clearing the flag is enough — tiering will promote it and
      // attachSlot will spawn on the way in.
      if (session.tier === 'live' && !session.spawned) spawn(session)
      else bump()
    },
```

Run `npm run verify:registry`. Expected: `22/22 passed`.

- [ ] **Step 6: Wire dormancy through `Canvas`**

In `Canvas.tsx`, track which ids are still dormant:

```tsx
  // Panels that came from disk start dormant; first-run panels do not. The
  // renderer is what generates first-run panels, so it is also what knows
  // which panels were restored — no flag has to cross the IPC boundary.
  const [dormantIds, setDormantIds] = useState<ReadonlySet<string>>(
    () => new Set(initial.panels.map((p) => p.id))
  )
```

Pass the dormant flag when creating sessions:

```tsx
  useMemo(() => {
    for (const panel of panels) {
      registry.ensure(panel.rect.id, panel.spec, { dormant: dormantIds.has(panel.rect.id) })
    }
  }, [panels, dormantIds])
```

Feed it to tiering, inside the existing `assignTiers` call:

```tsx
    const tiers = assignTiers({
      rects,
      viewport,
      size: { width: bounds.width, height: bounds.height },
      focusedId,
      lastFocusedAt: registry.lastFocusedAt(),
      dormantIds
    })
```

and add `dormantIds` to that effect's dependency array.

Wake on select:

```tsx
  const onSelectPanel = useCallback((id: string) => {
    setSelectedId(id)
    setPanels((current) => raisePanel(current, id))
    // Waking hangs off SELECT, not focus. A carded panel has no .panel__slot
    // and so no focus handler of its own — its click falls through to the
    // canvas background, which hit-tests and selects. Hooking onFocusPanel
    // would leave a dormant panel unwakeable by clicking the very card that
    // says "click to start".
    setDormantIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    registry.wake(id)
  }, [])
```

- [ ] **Step 7: Say so on the card**

In `src/renderer/components/TerminalPanel.tsx`, replace `PanelCard`:

```tsx
function PanelCard({ session }: { session: PanelSession }): JSX.Element {
  const lines = session.spawned ? session.handle.tail(CARD_LINES) : []
  return (
    <div className="panel__card">
      {session.spawned ? (
        lines.map((line, i) => (
          <div className="panel__card-line" key={i}>{line}</div>
        ))
      ) : (
        // A dormant panel is a restored one waiting for permission, not an
        // unvisited one waiting for the camera. Saying "not started" for both
        // would hide the only affordance the restored canvas has.
        <div className="panel__card-idle">
          {session.dormant ? 'click to start' : 'not started'}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Run everything**

Run: `npm run verify`
Expected: all suites green, including `47/47` viewport and `22/22` registry.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/canvas/lod.ts src/renderer/session/panel-session.ts \
        src/renderer/session/session-registry.ts src/renderer/canvas/Canvas.tsx \
        src/renderer/components/TerminalPanel.tsx \
        scripts/verify-viewport.cjs scripts/verify-registry.cjs
git commit -m "feat(m4b): restored panels are dormant until clicked

Dormancy outranks focus in assignTiers, so restoring focus cannot spawn a
process at boot. attachSlot carries a second guard, so 'nothing starts by
itself' does not rest on lod.ts alone. Waking hangs off select, because a
carded panel has no focus handler at all."
```

---

### Task 8: The save path

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `scripts/verify-panels.cjs` (check 18)
- Modify: `scripts/panels-entry.cjs`

**Interfaces:**
- Consumes: `fromPanels` (Task 2), `window.canvas.layout.save`.
- Produces: nothing new; this closes the loop.

- [ ] **Step 1: Add the check**

`verify:panels` is its own Electron entry, so it can point the store at a tmpdir and read the file back. Append to `scripts/verify-panels.cjs`:

```js
// 18. A change in the renderer reaches the file. Without this the whole
//     milestone can look correct in a single session and persist nothing.
{
  // The store writes on a 500ms debounce; flushSync is what before-quit calls.
  await win.webContents.executeJavaScript(`
    (() => { const p = document.querySelector('.panel'); return p && p.getAttribute('data-panel-id') })()
  `)
  const moved = await waitUntil(async () => {
    await dragPanelBy(win.webContents, 137, 42)
    await sleep(700)
    flushLayoutStore()
    if (!existsSync(LAYOUT_PATH)) return null
    const saved = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
    return saved.workspaces[0].panels.length > 0 ? saved.workspaces[0].panels[0] : null
  }, 5000)
  ok('18 a panel moved in the renderer is written to layout.json',
    moved !== null && Number.isFinite(moved.x) && Number.isFinite(moved.y),
    JSON.stringify(moved))
}
```

In `scripts/panels-entry.cjs`, re-export the store so the suite can build one and flush it, alongside the existing exports:

```js
module.exports = {
  ...require('../src/main/ipc'),
  ...require('../src/main/pty-manager'),
  ...require('../src/main/shell-env'),
  ...require('../src/main/layout-store')
}
```

In `scripts/verify-panels.cjs`'s setup, build the store against a tmpdir path, pass it to `registerIpcHandlers`, and expose `LAYOUT_PATH` and `flushLayoutStore` for the check above. `dragPanelBy` already exists in this file for the M4a drag checks — reuse it rather than writing a second dispatcher.

- [ ] **Step 2: Watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL on 18 — nothing in the renderer calls `layout.save`, so the file is never written.

- [ ] **Step 3: Implement the save effect**

In `Canvas.tsx`, add after the tiering effect:

```tsx
  // Persist on every change. Unthrottled on purpose, including the ~60/sec a
  // drag produces: main coalesces to one write per 500ms and keeps only the
  // newest, so one process owns the timing — and it is the one that has to
  // survive the other's death.
  //
  // This resembles the flood pty-manager.ts's 16ms batching exists to prevent,
  // and the difference is worth stating. That was THOUSANDS of messages a
  // second arriving continuously at the renderer's event loop; this is sixty
  // small JSON payloads a second reaching an otherwise-idle main process, and
  // only while a gesture is in progress.
  useEffect(() => {
    void window.canvas.layout.save({
      panels: fromPanels(panels),
      camera: viewport,
      selectedId,
      focusedId
    })
  }, [panels, viewport, selectedId, focusedId])
```

Add `import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'`.

- [ ] **Step 4: Run**

Run: `npm run build && npm run verify:panels`
Expected: `18/18 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx scripts/verify-panels.cjs scripts/panels-entry.cjs
git commit -m "feat(m4b): the renderer pushes a snapshot on every change

Unthrottled by design — main coalesces to one write per 500ms, so the
process that has to survive the other's death is the one that owns the
timing."
```

---

### Task 9: Undo and redo

**Files:**
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/menu.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `scripts/verify-panels.cjs` (checks 19-20)

**Interfaces:**
- Consumes: `createHistory`, `pushHistory`, `undoHistory`, `redoHistory` (Task 3).
- Produces: `IPC_EVENTS.EDIT_UNDO = 'edit:undo'`, `IPC_EVENTS.EDIT_REDO = 'edit:redo'`; bridge `edit.onUndo(fn)`, `edit.onRedo(fn)`.

- [ ] **Step 1: Add the checks**

Append to `scripts/verify-panels.cjs`:

```js
// 19. ONE undo per gesture, not one per frame. A drag emits ~60 setPanels
//     calls; if each pushed history, undoing a single drag would take sixty
//     Cmd+Z presses and the feature would be unusable without ever failing.
{
  const before = await panelRect(win.webContents, FIRST_ID)
  await dragPanelBy(win.webContents, 200, 120)
  const after = await panelRect(win.webContents, FIRST_ID)
  await win.webContents.executeJavaScript(`window.__m4bUndo()`)
  const undone = await panelRect(win.webContents, FIRST_ID)
  ok('19 one drag is one undo',
    after.x !== before.x && Math.abs(undone.x - before.x) < 1 && Math.abs(undone.y - before.y) < 1,
    `before=${before.x} after=${after.x} undone=${undone.x}`)
}

// 20. Undoing a close brings the panel back DORMANT. Its PTY was killed on the
//     click that closed it and there is nothing to revive, so the honest
//     restoration is the geometry plus a card that asks before starting again.
{
  const countBefore = await panelCount(win.webContents)
  await closePanel(win.webContents, FIRST_ID)
  const countClosed = await panelCount(win.webContents)
  await win.webContents.executeJavaScript(`window.__m4bUndo()`)
  const restored = await waitUntil(
    () => win.webContents.executeJavaScript(
      `(() => { const p = document.querySelector('[data-panel-id="${FIRST_ID}"] .panel__card-idle'); return p && p.textContent })()`
    ), 2000)
  ok('20 undoing a close restores the panel dormant',
    countClosed === countBefore - 1 &&
    (await panelCount(win.webContents)) === countBefore &&
    restored === 'click to start',
    `card="${restored}"`)
}
```

`panelRect`, `panelCount`, and `closePanel` exist in this file from M4a — reuse them. Add one narrow hook alongside the existing `__m4a*` set (`executeJavaScript` has no other route into React state; keep it to a single verb):

```tsx
    w.__m4bUndo = (): void => setHistory((h) => { const next = undoHistory(h); applyHistory(next); return next })
```

- [ ] **Step 2: Watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL on 19 and 20 — `window.__m4bUndo` is not a function.

- [ ] **Step 3: Declare the events**

In `src/shared/ipc-contract.ts`, add to `IPC_EVENTS`:

```ts
  /**
   * Cmd+Z / Cmd+Shift+Z, forwarded from the main-process menu exactly as
   * EDIT_COPY/EDIT_PASTE are. Ctrl+Z is deliberately untouched and reaches the
   * PTY as SIGTSTP — the same split as Cmd+C (copy) versus Ctrl+C (SIGINT).
   */
  EDIT_UNDO: 'edit:undo',
  EDIT_REDO: 'edit:redo'
```

and to `CanvasBridge.edit`:

```ts
    onUndo(listener: () => void): () => void
    onRedo(listener: () => void): () => void
```

In `src/preload/index.ts`, add to `bridge.edit`:

```ts
    onUndo: (listener) => subscribe<void>(IPC_EVENTS.EDIT_UNDO, listener),
    onRedo: (listener) => subscribe<void>(IPC_EVENTS.EDIT_REDO, listener)
```

- [ ] **Step 4: Add the accelerators**

In `src/main/menu.ts`, at the top of the `Edit` submenu, before `Copy`:

```ts
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => focused()?.webContents.send(IPC_EVENTS.EDIT_UNDO)
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: () => focused()?.webContents.send(IPC_EVENTS.EDIT_REDO)
        },
        { type: 'separator' },
```

Do **not** use the stock `'undo'`/`'redo'` roles: like `'copy'`/`'paste'`, they drive `document.execCommand` against the focused DOM element, which for a canvas of panels means either nothing or xterm's hidden textarea.

- [ ] **Step 5: Hold the history in `Canvas`**

In `Canvas.tsx`:

```tsx
  // The undo stack holds Panel[] — the same array persistence already
  // serialises. Camera moves are deliberately absent: pan and zoom are
  // continuous and self-evidently reversible by doing the opposite, and
  // putting them here would make Cmd+Z usually rewind a scroll instead of the
  // edit the user meant.
  const [history, setHistory] = useState<History<Panel[]>>(() => createHistory(panels))

  // Applying a history state has to reach the registry too: an undone close
  // must recreate the panel's session, and it comes back DORMANT because its
  // PTY was killed on the click that closed it and there is nothing to revive.
  const applyHistory = useCallback((next: History<Panel[]>) => {
    const ids = new Set(next.present.map((p) => p.rect.id))
    setPanels(next.present)
    setDormantIds((current) => {
      const merged = new Set([...current].filter((id) => ids.has(id)))
      for (const panel of next.present) {
        if (!registry.get(panel.rect.id)?.spawned) merged.add(panel.rect.id)
      }
      return merged
    })
    setSelectedId((id) => (id && ids.has(id) ? id : null))
    setFocusedId((id) => (id && ids.has(id) ? id : null))
  }, [])

  const commitHistory = useCallback((next: Panel[]) => {
    setHistory((h) => pushHistory(h, next))
  }, [])
```

Push **once per committed gesture**, in `usePanelDrag`'s `onCommit` — which already runs exactly once on mouseup, and is the same boundary `pty:resize` uses:

```tsx
    onCommit: useCallback((id: string, mode: DragMode) => {
      // One history entry per gesture. setPanels ran ~60 times during the drag;
      // pushing there would make a single drag take sixty Cmd+Z presses.
      setPanels((current) => { commitHistory(current); return current })
      if (mode.kind !== 'resize') return
      registry.refit(id)
    }, [commitHistory]),
```

and on each discrete panel action — inside `onSpawn`, `onClosePanel`, and `onSelectPanel` — call `commitHistory` with the array the action produces.

Subscribe to the menu events beside the existing clipboard subscription:

```tsx
  useEffect(() => {
    const offUndo = window.canvas.edit.onUndo(() =>
      setHistory((h) => { const next = undoHistory(h); applyHistory(next); return next })
    )
    const offRedo = window.canvas.edit.onRedo(() =>
      setHistory((h) => { const next = redoHistory(h); applyHistory(next); return next })
    )
    return () => { offUndo(); offRedo() }
  }, [applyHistory])
```

- [ ] **Step 6: Run**

Run: `npm run build && npm run verify:panels`
Expected: `20/20 passed`.

Then by hand: open a terminal panel, run `sleep 100`, press `Ctrl+Z`, and confirm the shell reports the job suspended. `Cmd+Z` must not have stolen it.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/menu.ts \
        src/renderer/canvas/Canvas.tsx scripts/verify-panels.cjs
git commit -m "feat(m4b): undo and redo over panel actions

One entry per COMMITTED gesture, so a drag is one Cmd+Z and not sixty.
Delivered through the same main-menu forwarding as Cmd+C/Cmd+V, because
the stock roles drive execCommand. Ctrl+Z stays SIGTSTP."
```

---

### Task 10: The Restore submenu and Reset canvas

**Files:**
- Modify: `src/main/menu.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`

**Interfaces:**
- Consumes: `LayoutStore.settings/setSetting/reset` (Task 4).
- Produces: `buildAppMenu(options: { settings: RestoreSettings; onToggle(key, value): void; onReset(): void })`; `IPC_EVENTS.CANVAS_RESET = 'canvas:reset'`; `IPC.CANVAS_COUNTS = 'canvas:counts'`.

- [ ] **Step 1: Let main ask the renderer what a reset would cost**

The confirmation has to name what is about to be lost, and only the renderer knows how many panels exist and how many are running. Add to `IPC` in `ipc-contract.ts`:

```ts
  /**
   * What a Reset canvas… confirmation has to name. Main owns the dialog but
   * only the renderer knows the live session statuses, so it asks.
   */
  CANVAS_COUNTS: 'canvas:counts'
```

and to `IPC_EVENTS`:

```ts
  /** Confirmed reset: drop every panel and return to the first-run canvas. */
  CANVAS_RESET: 'canvas:reset'
```

Extend the bridge:

```ts
  canvas: {
    /** Registers the answer to canvas:counts. Returns its own unsubscribe. */
    onCounts(provide: () => { panels: number; running: number }): () => void
    onReset(listener: () => void): () => void
  }
```

In the preload, `canvas:counts` is a main→renderer *request*, so use `ipcRenderer.on` plus a reply rather than `invoke`:

```ts
  canvas: {
    onCounts: (provide) => {
      const wrapped = (event: IpcRendererEvent, replyChannel: string): void => {
        ipcRenderer.send(replyChannel, provide())
      }
      ipcRenderer.on(IPC.CANVAS_COUNTS, wrapped)
      return () => ipcRenderer.removeListener(IPC.CANVAS_COUNTS, wrapped)
    },
    onReset: (listener) => subscribe<void>(IPC_EVENTS.CANVAS_RESET, listener)
  }
```

In `src/main/ipc.ts`, add a small helper main can await:

```ts
/**
 * Asks the renderer for the panel and running-process counts, so the reset
 * confirmation can name what it is about to destroy. Resolves to zeroes if the
 * renderer does not answer within the timeout — a dialog that never opens is a
 * worse failure than one that undercounts.
 */
export function requestCanvasCounts(
  webContents: Electron.WebContents
): Promise<{ panels: number; running: number }> {
  return new Promise((resolve) => {
    const replyChannel = `canvas:counts:reply:${Date.now()}`
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      resolve({ panels: 0, running: 0 })
    }, 1000)
    ipcMain.once(replyChannel, (_event, counts: { panels: number; running: number }) => {
      clearTimeout(timer)
      resolve(counts)
    })
    webContents.send(IPC.CANVAS_COUNTS, replyChannel)
  })
}
```

- [ ] **Step 2: Build the submenu**

In `src/main/menu.ts`, change the signature and add the items to the app-name submenu, after `{ role: 'about' }`:

```ts
import { BrowserWindow, Menu, app, clipboard, dialog, type MenuItemConstructorOptions } from 'electron'
import type { RestoreSettings } from '../shared/layout-schema'

export interface AppMenuOptions {
  settings: RestoreSettings
  onToggle(key: keyof RestoreSettings, value: boolean): void
  onReset(): void
}

export function buildAppMenu(options: AppMenuOptions): void {
```

```ts
        { type: 'separator' },
        {
          label: 'Restore on launch',
          submenu: (
            [
              ['layout', 'Panel layout'],
              ['camera', 'Camera position'],
              ['focus', 'Selection & focus']
            ] as [keyof RestoreSettings, string][]
          ).map(([key, label]) => ({
            label,
            type: 'checkbox' as const,
            checked: options.settings[key],
            // Nothing in the running session changes: these affect boot only,
            // which is exactly why they need no IPC event of their own.
            click: (item) => options.onToggle(key, item.checked)
          }))
        },
        {
          label: 'Reset canvas…',
          click: () => options.onReset()
        },
        { type: 'separator' },
```

- [ ] **Step 3: Wire the reset dialog**

In `src/main/index.ts`, inside `app.whenReady()`:

```ts
  layoutStore.load()

  buildAppMenu({
    settings: layoutStore.settings(),
    onToggle: (key, value) => layoutStore.setSetting(key, value),
    onReset: () => {
      void confirmReset()
    }
  })
```

and add the function above `createWindow`:

```ts
/**
 * Reset is the only action in the app Cmd+Z cannot take back, which is exactly
 * why it is the only one that asks. The message NAMES what is about to be lost
 * — a generic "Are you sure?" trains people to click through the one that
 * mattered, and closing seven idle panels is not the same act as closing seven
 * running agents.
 */
async function confirmReset(): Promise<void> {
  const window = mainWindow
  if (!window) return
  const { panels, running } = await requestCanvasCounts(window.webContents)
  const detail =
    running > 0
      ? `${panels} panel${panels === 1 ? '' : 's'} will be closed, including ${running} running process${running === 1 ? '' : 'es'}. This cannot be undone.`
      : `${panels} panel${panels === 1 ? '' : 's'} will be closed. This cannot be undone.`

  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    message: 'Reset this canvas?',
    detail,
    buttons: ['Cancel', 'Reset Canvas'],
    // Cancel is the default, so Return dismisses rather than destroys.
    defaultId: 0,
    cancelId: 0
  })
  if (response !== 1) return

  layoutStore.reset()
  layoutStore.flushSync()
  window.webContents.send(IPC_EVENTS.CANVAS_RESET)
}
```

Import `dialog` from `electron`, `IPC_EVENTS` from `../shared/ipc-contract`, and `requestCanvasCounts` from `./ipc`.

- [ ] **Step 4: Answer both in the renderer**

In `Canvas.tsx`:

```tsx
  // Main owns the reset dialog but only the renderer knows the live statuses,
  // so it supplies the counts the confirmation names.
  useEffect(() => {
    const offCounts = window.canvas.canvas.onCounts(() => ({
      panels: panelsRef.current.length,
      running: panelsRef.current.filter((p) => {
        const kind = registry.get(p.rect.id)?.status.kind
        return kind === 'running' || kind === 'starting'
      }).length
    }))
    const offReset = window.canvas.canvas.onReset(() => {
      // dispose, not just drop: reset kills every process, and dispose is one
      // of the two legitimate callers of pty.kill in the renderer.
      for (const panel of panelsRef.current) registry.dispose(panel.rect.id)
      const fresh = firstRunPanels()
      setPanels(fresh)
      setDormantIds(new Set())
      setSelectedId(null)
      setFocusedId(null)
      setHistory(createHistory(fresh))
    })
    return () => { offCounts(); offReset() }
  }, [])
```

`panelsRef` mirrors `panels` into a ref beside the existing `focusedIdRef`/`viewportRef`, for the same reason those exist: these listeners must be installed once, and `panels` changes on every frame of a drag.

```tsx
  const panelsRef = useRef(panels)
  panelsRef.current = panels
```

- [ ] **Step 5: Verify**

Run: `npm run verify`
Expected: all green. `verify:ipc` now also covers `canvas:counts`.

Then by hand, since no suite drives a native dialog:
1. Toggle off **Camera position**, quit, relaunch — panels restore, camera does not.
2. `Reset canvas…` with a running panel — the detail line names both counts, `Return` cancels, `Reset Canvas` returns the canvas to one panel.

- [ ] **Step 6: Commit**

```bash
git add src/main/menu.ts src/main/index.ts src/main/ipc.ts src/shared/ipc-contract.ts \
        src/preload/index.ts src/renderer/canvas/Canvas.tsx
git commit -m "feat(m4b): Restore on launch checkboxes and a naming reset dialog

The confirmation names the panel and running-process counts, because a
generic 'Are you sure?' trains you to click through the one that mattered.
Cancel is the default id, so Return dismisses rather than destroys."
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/ideas-backlog.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing executable.

- [ ] **Step 1: Update the README**

Mark M4b done in the milestone table. Add `npm run verify:layout` to the command list with the one-line description `on-disk layout format + the store that owns it, plain node`. Add a paragraph under "Things that are non-obvious" covering dormancy — that a restored canvas holds no processes and no WebGL contexts until clicked, and that this is what stops a relaunch-and-pan from launching twelve agents.

- [ ] **Step 2: Update `CLAUDE.md`**

Add to the verify table: `verify:layout | plain node | 24 checks: the on-disk
format's validation and the store's coalescing, atomic write, and settings
resolution`. Update the check counts for `verify:viewport` (39 → 47),
`verify:registry` (20 → 22), and `verify:panels` (17 → 20).

**Read the real counts out of each suite's own output rather than trusting these
numbers.** Concurrent work on the drop guard adds checks to `verify:canvas`,
and CLAUDE.md carrying a stale count is exactly the kind of small untruth a
later reader builds on. Run each suite and copy what it prints.

Add these to "Load-bearing details", each with its reason:

- **Dormancy outranks focus (`lod.ts`).** Restored focus would otherwise spawn a process at boot.
- **The store is main's because the quit flush cannot ask a dead renderer (`layout-store.ts`).**
- **`parseLayout` never throws, and drops entries individually (`shared/layout-schema.ts`).** Duplicate ids are the one failure with no visible symptom.
- **`nextIdRef` seeds from restored ids (`Canvas.tsx`).** Initialising it to `1` collides with a restored `n5`.
- **One history entry per committed gesture (`Canvas.tsx`).** Per-frame pushes make one drag sixty `Cmd+Z` presses.
- **`Cmd+Z` is claimed, `Ctrl+Z` is not.** Same split as `Cmd+C`/`Ctrl+C`.
- **The verify bundles now configure a `@shared` alias.** Value imports across the boundary fail to resolve without it.
- **`RestoreSettings` lives in `layout.json`, not a second store.** `docs/ideas-backlog.md` item 11 asks that a future settings surface share M4b's persistence mechanism rather than invent one, and names this as a decision to make when M4b lands. It is made: main owns both, in one file, behind `LayoutStore`. Three booleans do not justify the declarative schema item 11 describes — but a fourth toggle arriving should reach for that schema rather than adding another ad-hoc field here.

Update the "Working on this repo" line to point at M4c — or at the new-canvas wizard, if that is next — rather than M4b.

- [ ] **Step 3: Close out the backlog items M4b consumed**

The backlog grew from seven items to fourteen while this plan was being
written; re-read it before editing, and touch only the items M4b actually
consumed.

In `docs/ideas-backlog.md`, item 2's **Action for M4b** is now done: note that the persisted file is a keyed collection of workspaces with an id and a name, so the remaining work is a switcher and a UI, not a migration. Item 6's "Persisted by M4b" is half done: `PersistedPanel.title` exists and round-trips, but nothing writes it and `Panel` has no `title` field yet — say exactly that, so the next reader does not assume more shipped than did.

Item 11's storage constraint is also resolved: record that `RestoreSettings`
lives in `layout.json` behind `LayoutStore`, so a settings surface inherits that
mechanism instead of introducing a second one.

- [ ] **Step 4: Final verification**

Run: `npm run verify`
Expected: every suite green.

Then walk the spec's success criteria by hand — they are the acceptance test, and none of 1-7 or 9-11 is fully covered by a suite:

1. Drag, resize, raise, quit, relaunch — geometry and stacking survive.
2. Pan/zoom, quit, relaunch — the camera survives.
3. Relaunch a multi-panel canvas and pan across all of it — zero processes spawn.
4. Click a restored panel — it wakes, spawns, and behaves like a fresh one.
5. Turn off Camera position, relaunch — panels restore, camera does not.
6. Truncate `layout.json` by hand — the app opens on a working canvas and logs why.
7. `Cmd+R` — the layout survives the reload.
9. Close a running panel, `Cmd+Z` — it returns dormant.
10. `Ctrl+Z` in a focused terminal — still suspends the foreground process.
11. `Reset canvas…` — names both counts; `Return` cancels.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md docs/ideas-backlog.md
git commit -m "docs(m4b): record what layout persistence changed

The invariants worth protecting: dormancy outranking focus, the store
being main's because the quit flush cannot ask a dead renderer, and
nextIdRef seeding from restored ids."
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: format and pure core → Task 1; converters → Task 2; undo stack → Task 3; store, atomic write, coalescing, settings resolution → Task 4; the two channels and the quit flush → Task 5; boot ordering, first run, `nextIdRef` → Task 6; dormancy and its precedence rule → Task 7; save cadence → Task 8; undo delivery → Task 9; the menu and reset → Task 10; docs → Task 11.

**Known gap, carried from the spec.** That `app.on('before-quit')` actually calls `flushSync` is asserted only by reading the code. `flushSync` itself is covered by `verify:layout` checks 19-21, and `verify:window` is the suite that would grow to cover the wiring. Left as a recorded gap rather than a silent one.

**Deliberate deviations from the spec, both noted at their task.** `parseLayout` returns a third field, `futureVersion`, so the store need not string-match a log message. `MIN_PANEL_W`/`MIN_PANEL_H` move to `src/shared/panel-geometry.ts`, which the spec's file list did not anticipate — the validator needs them and `shared/` cannot import from `renderer/`.

**Things an implementer must not "simplify".** The `@shared` alias in the esbuild configs (Task 1 Step 2) looks like unrelated tooling churn and is load-bearing. `attachSlot`'s dormancy guard (Task 7) looks redundant against the tiering rule and is deliberately belt-and-braces. `pushHistory`'s lack of an equality check (Task 3) is a decision, not an omission.
