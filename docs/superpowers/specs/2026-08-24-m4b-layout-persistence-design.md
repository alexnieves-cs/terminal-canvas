# M4b: Layout Persistence — Design

**Status:** approved, not yet implemented
**Predecessor:** `2026-08-23-m4a-panel-manipulation-design.md`

## Goal

Make a canvas survive quitting the app. M4a made panel geometry user-authored
for the first time — before it, every rect came from `SEED_PANELS` and never
changed, so there was nothing to save. Now a user drags, resizes, closes, and
raises panels, and every one of those edits dies on quit. M4b writes that state
to disk and reads it back.

## Scope

In:

- Persist panel layout: id, rect, `z`, and spec (`cwd`, `command`, `args`).
- Persist camera position: the viewport's `x`, `y`, `scale`.
- Persist selection and focus.
- Three "Restore on launch" checkboxes in the app menu gating the above.
- Restored panels are **dormant**: they spawn no process until clicked.
- A `layout.json` in `userData`, owned by the main process, written atomically.
- First run (and a reset canvas) opens one centred panel.

Out, and deliberately so:

- **The new-canvas wizard** — panel-count slider, per-panel working directory
  chosen from the filesystem, and a Claude Code / Codex CLI picker. This is a
  second subsystem: a modal rendering surface, `dialog.showOpenDialog` plumbing,
  and CLI detection. It is the *next* milestone and it replaces M4b's
  single-centred-panel placeholder. Bundling it here would reverse the
  deliberate decision to add no new rendering surface, roughly triple the
  milestone, and give a broken relaunch two possible causes instead of one.
- **tmux backing** (M4c). A restored panel spawns a *fresh* process when woken;
  it does not reconnect to the one that was running last session.
- **Scrollback contents.** Replaying a dead process's output into a live
  terminal shows stale text as though it were current.
- **Multiple named workspaces / layout files.** One canvas, one file.
- **Migration machinery.** `LAYOUT_VERSION` is 1 and there is nothing to
  migrate from. A future version falls back and preserves the old file
  (below); it does not transform it.

## The central tension

M3's lazy spawn (`session-registry.ts`'s `attachSlot` → `spawn`) creates a PTY
the first time a panel goes `live`. That was unambiguous while every panel was
brand new: "the first time you look at it" and "the first time you asked for
it" were the same event.

Persistence separates them. A restored panel is one you asked for *last* run,
and spawning it because the camera drifted over it is a decision the app makes
on your behalf. On a twelve-panel canvas that is twelve agent CLIs launched by
panning.

**Resolution: dormancy.** A restored panel carries `dormant: true` and is never
promoted out of the card tier, whatever the viewport says. Clicking it clears
the flag; normal tiering resumes from there. A restored canvas therefore holds
zero WebGL contexts and zero PTYs until the user touches something.

Waking hangs off `onSelectPanel`, **not** `onFocusPanel`. A carded panel has no
`.panel__slot` and therefore no focus handler of its own: a click on its body
falls through to the canvas background, which hit-tests and selects. Hooking
`onFocusPanel` would make a dormant panel unwakeable by clicking the very card
that says "click to start".

This composes forward: in M4c, waking a dormant panel becomes *reconnect to its
tmux session* rather than *spawn a fresh process*. The dormancy flag is the seam
M4c needs and would otherwise have to invent.

### Dormancy outranks focus

`assignTiers` currently pins the focused panel `live` unconditionally. Restoring
focus would therefore spawn a process at boot, contradicting "dormant until
clicked". The precedence rule is explicit and lives in `lod.ts`:

> A dormant panel is never promoted, even when it is the focused panel.

So restored focus comes back as a selection highlight and a `Cmd+C` routing
target only. `getSelection()` on an unspawned session returns `''`, which is
harmless.

## Architecture

### Ownership: main, not the renderer

The store lives in the main process. The renderer describes intent; main decides
when bytes reach disk. This mirrors the PTY decision from M1, for the same
reason: the renderer is the process that can vanish without warning, so anything
that must survive its death cannot be owned by it.

The deciding argument is the quit flush. It has to happen at `before-quit`,
main-side. If the renderer owned the debounce, main would have to ask the
renderer for a snapshot at exactly the moment the renderer might already be
destroyed — which is precisely the failure `window-lifecycle.ts` exists to
handle, where `Cmd+R` and `Cmd+W` tear down the page without running any React
cleanup. With main holding the latest snapshot in memory, the flush is a
synchronous `writeFileSync` with nobody to ask.

`localStorage` in the renderer is rejected for a second, independent reason: the
renderer's origin is `http://localhost:5173` under `npm run dev` and `file://`
in a build, so a dev layout and a packaged layout would be separate stores and
neither would ever see the other.

### Two channels, no new events

```
boot:   renderer --invoke--> layout:load                  --> main reads file,
                                                              applies settings,
                                                              returns resolved state
change: renderer --invoke--> layout:save(snapshot)        --> main coalesces,
                                                              writes at most every 500ms
quit:   app 'before-quit' --> store.flushSync()              (main already holds it)
```

The settings need **no** channel of their own. They affect boot and nothing
else; no renderer code reads them at runtime. Main applies them itself before
returning — if `camera` is off, `layout:load` returns the default camera. The
renderer never learns the settings exist.

This is the same shape as `PanelSpec.command`: main resolves what only main can
know, and the renderer consumes the answer.

On save the renderer sends panels, camera, selection, and focus but **not**
settings, because it does not have them. Main preserves its own `settings` field
across every merge.

### The pure core

```ts
// src/shared/layout-schema.ts — pure. No fs, no electron, no DOM.
export const LAYOUT_VERSION = 1

export interface RestoreSettings {
  layout: boolean
  camera: boolean
  focus: boolean
}

export interface PersistedPanel {
  id: string
  x: number; y: number; w: number; h: number
  z: number
  cwd: string
  /** Absent means "the user's login shell" — see PanelSpec. */
  command?: string
  args: string[]
}

export interface LayoutSnapshot {
  version: number
  panels: PersistedPanel[]
  camera: { x: number; y: number; scale: number }
  selectedId: string | null
  focusedId: string | null
  settings: RestoreSettings
}

/** Never throws. Malformed entries are dropped individually, each naming
 *  itself in `warnings`; the rest of the file is kept. */
export function parseLayout(raw: string): { snapshot: LayoutSnapshot; warnings: string[] }

/** An EMPTY canvas, not a first-run one — see "First run" below. */
export function defaultSnapshot(): LayoutSnapshot
```

The converters between `PersistedPanel` and `Panel` deliberately do **not** live
here:

```ts
// src/renderer/panels/layout-adapt.ts
export function toPanels(persisted: PersistedPanel[]): Panel[]
export function fromPanels(panels: Panel[]): PersistedPanel[]
```

`Panel` is a renderer type, and `shared/` importing from `renderer/` would
invert the dependency direction the whole codebase is arranged around. Putting
the converters on the renderer side costs nothing in testability: `panels.ts` is
already bundled into the plain-node verify target by `viewport-entry.cjs`, and
`layout-adapt.ts` joins it there.

The same reasoning is why `defaultSnapshot()` returns `panels: []` rather than
the first-run panel. The file-format layer decides what a *valid* snapshot is;
it does not get to decide product defaults, which would drag `PANEL_W`/`PANEL_H`
into `shared/` behind it.

Three properties this shape buys:

**Plain-node testable.** No `fs`, no `electron`, no DOM — the same property that
lets `verify:viewport` and `verify:registry` run under system Node.

**A flat persisted panel, not a `Panel`.** `Panel` nests `rect: WorldRect` and
`spec: PanelSpecTemplate`, and `WorldRect` carries the id. Persisting that
nesting verbatim would freeze two internal type shapes into a user-visible file
forever. Explicit converters keep a refactor of the in-memory types from
silently invalidating every saved canvas.

**Partial acceptance.** One malformed panel out of twelve costs that panel, not
the other eleven. `warnings` is a list, not a boolean, and main logs it the way
`shell-env.ts` logs a missed PATH probe.

`cols`/`rows` are deliberately absent, for the reason `panels.ts` already gives
for leaving them out of `PanelSpecTemplate`: they are not known until a panel is
attached and fitted, and a persisted grid would be a stale number that "fit
before spawn" has to override anyway.

### The store

```ts
// src/main/layout-store.ts
export function createLayoutStore(deps: {
  filePath: string
  now?: () => number
}): LayoutStore

export interface LayoutStore {
  /** Read + parse once at startup. Logs warnings. */
  load(): { snapshot: LayoutSnapshot; warnings: string[] }
  /** The resolved starting state the renderer receives, settings applied. */
  initial(): Omit<LayoutSnapshot, 'settings' | 'version'>
  /** Merge a renderer snapshot, preserving settings. Schedules a write. */
  save(incoming: Omit<LayoutSnapshot, 'settings' | 'version'>): void
  settings(): RestoreSettings
  setSetting(key: keyof RestoreSettings, value: boolean): void
  /** Write now, synchronously. Must never throw. */
  flushSync(): void
}
```

`filePath` is injected rather than resolved inside via `app.getPath('userData')`
— the same move `session-registry.ts` makes with its bridge and terminal
factory. This is not ceremony: an `app.getPath` call inside would force the
whole suite into the Electron-as-node tier, where every check costs a process
spawn and a native-module load. One parameter keeps `verify:layout` in the plain
node tier.

Writes go to `layout.json.tmp` and then `rename`, which is atomic on macOS.
Without it a crash mid-write leaves a truncated file; `parseLayout` would
survive that, but it would survive it by discarding the entire canvas.

### Boot ordering

`layout:load` is async but `useState` is not. `src/renderer/main.tsx` awaits the
load once before `createRoot().render()`, and `Canvas` takes its starting state
as a **prop** rather than reading `SEED_PANELS` directly.

The window is already `show: false` until `ready-to-show`, so a one-round-trip
delay is invisible.

The side benefit is worth as much as the feature: a `Canvas` that receives its
initial state can be mounted by `verify:panels` against a known layout, instead
of against whatever a hardcoded constant happens to say. That constant is about
to become a product decision that keeps changing.

### Save cadence

The renderer sends a full snapshot on every change to
`[panels, viewport, selectedId, focusedId]` — unthrottled, including roughly
sixty per second mid-drag. Main coalesces, keeping only the newest, and writes at
most once per 500ms.

This resembles the mistake `pty-manager.ts`'s batching exists to prevent, so the
difference is recorded explicitly. PTY data was *thousands* of messages per
second flooding the renderer's event loop continuously; this is sixty small JSON
payloads per second reaching an otherwise-idle main process, and only while a
gesture is in progress. Coalescing in one place — the process that has to
survive the other's death — is worth more than shaving those sixty sends.

A free consequence of main holding the snapshot in memory: **`Cmd+R` now
restores the layout too.** Today a reload throws the user back to the twelve
seed panels.

## Failure modes

Every row below fails *silently* without its guard, which is this repo's stated
bar for a guard being worth writing.

| Input | Symptom with no guard |
|---|---|
| `scale: 0` or negative | `screenToWorld` divides by it; every coordinate becomes `Infinity`/`NaN` and the canvas is dead with no error |
| `NaN` or missing `x`/`y` | Panel renders at `left: NaN` — invisible, unclickable, still holding a session |
| `w`/`h` below `MIN_PANEL_W`/`MIN_PANEL_H` | A panel too small to hold a terminal and too small to grab a resize handle on |
| **Duplicate ids** | `registry.ensure` returns the *existing* session, so two panels render one `handle.host`, which can only live in one slot. This is exactly the bug M4a's `nextIdRef` was introduced to kill; a hand-edited file reintroduces it through a different door |
| `version` greater than `LAYOUT_VERSION` | Fields we cannot interpret. Fall back — but `rename` the file to `layout.json.bak` **first**, or the fallback's next write destroys a layout authored by a newer build |
| `userData` unwritable (permissions, disk full) | Must log loudly and keep running from memory. `flushSync` must never throw at `before-quit`, where an exception can wedge the quit itself |
| Id containing `.` or `:` | Silent in M4b; breaks M4c, because tmux rejects those in a session name |

### Id stability is M4b's debt to M4c

`shared/types.ts` already commits `PanelId` to doubling as the tmux session name
from M4 onward, and M4b is where ids first become *durable*. This is the last
cheap moment to constrain them: `parseLayout` requires
`/^[A-Za-z0-9_-]+$/` and drops entries that fail it. Discovering the constraint
in M4c would mean migrating every user's saved file.

### `nextIdRef` must seed from the restored panels

`Canvas.tsx` initialises `nextIdRef` to `1` on every run. Restore a canvas
containing `n5`, press `Cmd+N` five times, and the fifth new panel is also `n5`
— a duplicate id, with every silent consequence listed above.

This is the same defect M4a fixed when it replaced length-derived ids.
Persistence resurrects it through a different door, because the panel array is
no longer guaranteed to have started empty. `nextIdRef` seeds from the highest
numeric suffix among restored ids, plus one.

## Settings surface

A "Restore on launch" submenu in the existing app menu, three
`type: 'checkbox'` items backed by `store.settings()`:

```
Terminal Canvas
  ├─ Restore on launch  ▸
  │    ✓ Panel layout
  │    ✓ Camera position
  │    ✓ Selection & focus
  └─ Reset canvas…
```

All three default to on. Toggling one calls `store.setSetting` and takes effect
at the next launch — nothing in the running session changes, because nothing in
the running session reads them.

`Reset canvas…` clears the stored layout and returns the canvas to its first-run
state. It confirms first, via `dialog.showMessageBox`: unlike closing a single
panel, this is not recoverable by re-doing one action.

`buildAppMenu()` gains parameters (the current settings and a toggle callback),
so it is built after `store.load()` in `app.whenReady`.

## First run

One panel, centred at the world origin, with the same `shell()` spec seed panels
use today. This is a deliberate placeholder that the wizard milestone replaces.

The **renderer** decides this, not the store: if the resolved initial state
carries no panels, `Canvas` calls `firstRunPanels()`. A consequence worth
stating rather than discovering — closing every panel, quitting, and relaunching
gives back one fresh panel rather than a blank canvas. That is the intended
reading: a canvas with nothing on it and no visible affordance is the option
this design already rejected, and it should not be reachable by accident either.

Because first-run panels are generated by the renderer on the empty path, the
renderer also knows which panels came from disk. **That is what marks dormancy:**
panels from `toPanels()` are dormant, panels from `firstRunPanels()` are not.

`SEED_PANELS`' twelve scattered entries move into the verify suites as fixture
data, which is what they have always actually been: `verify:panels` leans on
twelve panels existing against a `LIVE_BUDGET` of 8, and that relationship is a
test's requirement, not a product decision.

## Testing

| Suite | Runtime | Gains |
|---|---|---|
| `verify:layout` *(new)* | plain node | Every failure-mode row above; `toPanels`/`fromPanels` round-trip; id validation; coalescing (N saves → 1 write); atomic rename; `flushSync` writing the newest snapshot; a write into an unwritable path not throwing; settings preserved across a renderer merge; settings applied by `initial()` |
| `verify:viewport` | plain node | Dormancy in `assignTiers`: a dormant panel is not promoted, and specifically is not promoted when it is the focused panel |
| `verify:ipc` | real Electron | Free — it already asserts every contract channel has a handler, so `layout:load`/`layout:save` are covered the moment they are declared |
| `verify:panels` | real Electron | Mount `Canvas` with a known initial state: panels land at their persisted rects and `z`; a dormant panel stays carded with the camera sitting on it; clicking it wakes and spawns it; `Cmd+N` after a restore does not collide with a restored id |

`verify:layout` needs a new `scripts/verify-layout.cjs` plus a bundle entry
alongside `viewport-entry.cjs`, and a `verify:layout` script wired into
`npm run verify` **before** the build step, since it needs no built renderer.

The duplicate-id check is the most valuable one in that table, because it is the
only failure that produces no visible symptom at all. A `NaN` rect gives an
invisible panel the user will notice; two panels sharing one session gives a
canvas that looks correct and misbehaves subtly forever.

Not covered, and recorded rather than hidden: the `before-quit` flush under a
real app lifecycle. `flushSync` itself is tested directly in `verify:layout`;
that `app.on('before-quit')` actually calls it is asserted only by reading the
code. `verify:window` is the suite that would grow to cover it, and this is left
as a known gap.

## Files

**New**

- `src/shared/layout-schema.ts` — the pure core: types, `parseLayout`,
  `defaultSnapshot`, `toPanels`, `fromPanels`.
- `src/main/layout-store.ts` — read, merge, coalesce, atomic write, `flushSync`.
  Path injected.
- `scripts/verify-layout.cjs` + its bundle entry.

**Modified**

- `src/shared/ipc-contract.ts` — `LAYOUT_LOAD`, `LAYOUT_SAVE`, and the bridge's
  `layout` namespace.
- `src/main/index.ts` — construct the store, `load()` before `buildAppMenu`,
  flush on `before-quit`.
- `src/main/ipc.ts` — the two handlers.
- `src/main/menu.ts` — the "Restore on launch" submenu and `Reset canvas…`.
- `src/preload/index.ts` — expose `window.canvas.layout`.
- `src/renderer/main.tsx` — await the load before rendering.
- `src/renderer/canvas/Canvas.tsx` — initial state as a prop; save effect;
  `nextIdRef` seeding; wake-on-click.
- `src/renderer/canvas/lod.ts` — dormancy outranks focus.
- `src/renderer/session/session-registry.ts` — the dormant flag; suppress
  spawn-on-promote; `wake(id)`.
- `src/renderer/session/panel-session.ts` — `dormant` on `PanelSession`.
- `src/renderer/panels/panels.ts` — the single centred first-run panel; seed
  panels demoted to fixtures.
- `src/renderer/components/TerminalPanel.tsx` — a dormant card reads
  "click to start".

## Success criteria

1. Drag a panel, resize it, raise it, quit, relaunch — it is where you left it,
   at the size you left it, in the stacking order you left it.
2. Pan and zoom somewhere, quit, relaunch — the camera is where you left it.
3. Relaunch a twelve-panel canvas and pan across all of it: **zero** processes
   spawn and zero WebGL contexts are taken.
4. Click a restored panel: it wakes, spawns, and behaves exactly like a panel
   created this session.
5. Turn off "Camera position" and relaunch: panels restore, camera does not.
6. Corrupt `layout.json` by truncating it: the app opens on a working canvas and
   logs why.
7. `Cmd+R`: the layout survives the reload.
8. `npm run verify` is green, including the new `verify:layout`.
