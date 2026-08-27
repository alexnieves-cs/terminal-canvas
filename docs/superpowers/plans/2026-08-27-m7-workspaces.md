# M7 Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named canvases you switch between from the command palette, where the agents in the workspace you are not looking at keep running.

**Architecture:** A workspace switch is a *second boot*. `renderer/main.tsx`'s `boot()` already awaits a `CanvasState` from main and renders a `Canvas` that receives its starting state as a prop; switching replaces that starting state rather than mutating a running canvas, and everything derived from it (the id counter, the undo stack, the camera, the selection) is re-derived rather than carried. Main owns `layout.json` and therefore owns the switch transaction; the renderer asks by invoke. The on-disk format already carries `workspaces: Workspace[]` and `activeWorkspaceId` from M4b, so no migration and no `LAYOUT_VERSION` bump.

**Tech Stack:** TypeScript, Electron 43, React 19 (no StrictMode), esbuild-bundled plain-node verify suites, xterm.js + node-pty behind a tmux backend.

**Spec:** `docs/superpowers/specs/2026-08-27-m7-workspaces-design.md`

## Global Constraints

Copied verbatim from the spec and from `CLAUDE.md`. Every task's requirements implicitly include this section.

- **`LAYOUT_VERSION` does not change and no on-disk file is rewritten by a migration.** The format already carries workspaces (M4b).
- **Switching demotes, never disposes.** A hidden workspace's PTYs and tmux sessions keep running. The only proof that counts is *the same pid across a round trip*.
- **`pty.kill` has exactly TWO callers, both inside `session-registry.ts`** — `disposeAll` and `dispose(id)`. M7 adds none. Every new removal path routes through `registry.dispose(id)`.
- **`registry.dispose` has THREE call sites in `Canvas.tsx` today** (`onClosePanel`, `applyHistory`, `onReset`). M7 makes it **four**. `CLAUDE.md`'s count is updated in the same commit as the code (Task 8).
- **`PanelId` doubles as the tmux session name** and must satisfy `ID_PATTERN` (`/^[A-Za-z0-9_-]+$/`). Panel ids must be unique across *all* workspaces, not per workspace.
- **Never zero workspaces.** `deleteWorkspace` of the last one installs a fresh `defaultWorkspace()` and activates it.
- **No new event channel.** Five invokes only. Attention counts are derived renderer-side from `agent:state` messages the renderer already receives.
- **Cmd is required for every canvas shortcut**, and M7 adds no new chord.
- **Comments explain *why*.** Match the surrounding density; a non-obvious line without a reason attached will be "fixed" by someone later.
- **`npm run verify` must be green before any task claims done.** Individual suites may be run during a task; the full chain gates the commit.
- Commits: `feat(m7): ...`, `fix(m7): ...`, `docs(m7): ...`.
- Check numbering continues from current tails: `verify:layout` ends at **81**, `verify:palette` at **58**, `verify:panels` at **63**, `verify:ipc` at **20 channels**.

---

## File Structure

| File | Responsibility after M7 |
|---|---|
| `src/shared/layout-schema.ts` | **unchanged** — already defines `Workspace`, `LayoutSnapshot.workspaces`, `activeWorkspaceId`, `defaultWorkspace()` |
| `src/shared/ipc-contract.ts` | five channel constants, `WorkspaceRow` (an IPC payload shape, not an on-disk one — the same split `PresetListRow` draws against `Preset`), `CanvasBridge.workspace` |
| `src/main/layout-store.ts` | the five accessors; the never-zero-workspaces invariant; the flush-then-swap transaction |
| `src/main/ipc.ts` | five handlers |
| `src/preload/index.ts` | `window.canvas.workspace.*` |
| `src/renderer/palette/palette-model.ts` | `SECTIONS` entry, `PaletteScope` member |
| `src/renderer/palette/Palette.tsx` | `SCOPE_LABEL` member |
| `src/renderer/palette/commands.ts` | `WorkspaceRow` rows, disabled reasons, waiting counts |
| `src/renderer/canvas/Canvas.tsx` | the activate handler (replace state, reseed ids, clear history), the delete handler (fourth `registry.dispose` call site), workspace rows for the palette |
| `src/renderer/main.tsx` | seed `nextIdRef` from every workspace's ids, not the active one's |
| `scripts/verify-layout.cjs` | checks 82–93 |
| `scripts/verify-palette.cjs` | checks 59–64 |
| `scripts/verify-panels.cjs` | checks 64–69 |

---

### Task 1: Workspace CRUD in the store

The data layer, minus the switch. Deliberately split from Task 2 so a reviewer can gate the *transaction* separately from the *collection*.

**Files:**
- Modify: `src/main/layout-store.ts` (the `LayoutStore` interface, ~line 47–90; the returned object, ~line 190–345)
- Modify: `src/shared/ipc-contract.ts` (add `WorkspaceRow` only — no channels yet)
- Test: `scripts/verify-layout.cjs` (append checks 82–88)

**Interfaces:**
- Consumes: `defaultWorkspace()`, `ID_PATTERN`, `activeWorkspace()`, `scheduleWrite()` — all already in the files above.
- Produces, relied on by Tasks 2, 3 and 6:

```ts
// src/shared/ipc-contract.ts
/**
 * One workspace as the palette needs it. An IPC payload shape, not an on-disk
 * one — the same split PresetListRow draws against Preset. `panelIds` rather
 * than a waiting count: main does not know which panels are in wants-you, and
 * the renderer already holds every agent:state transition it would need.
 */
export interface WorkspaceRow {
  id: string
  name: string
  panelIds: string[]
  active: boolean
}

// src/main/layout-store.ts — added to the LayoutStore interface
workspaces(): WorkspaceRow[]
createWorkspace(name: string): string
renameWorkspace(id: string, name: string): boolean
deleteWorkspace(id: string): boolean
```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, immediately before the `console.log('\n' + '='.repeat(60))` line at the end:

```js
// M7. Workspaces. The format has carried them since M4b (Workspace extends
// CanvasState, keyed by activeWorkspaceId) — these checks are about the STORE,
// which until now could only ever see one of them.

// 82. A fresh store answers one workspace, and it is the active one.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const ws = s.workspaces()
  ok('82 a fresh store has exactly one active workspace',
    ws.length === 1 && ws[0].active === true && ws[0].id === L.DEFAULT_WORKSPACE_ID,
    JSON.stringify(ws))
}

// 83. createWorkspace mints an ID_PATTERN-valid id, does NOT activate it, and
//     returns an id the list then contains. Not activating is the point: a
//     create that also switched would make "new workspace" a destination
//     change the user did not ask for, and Task 2 owns switching.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const id = s.createWorkspace('school')
  const ws = s.workspaces()
  const made = ws.find((w) => w.id === id)
  ok('83 createWorkspace mints a valid id and does not activate it',
    L.ID_PATTERN.test(id) && ws.length === 2 && made !== undefined &&
      made.name === 'school' && made.active === false &&
      made.panelIds.length === 0,
    `id=${id} ${JSON.stringify(ws)}`)
}

// 84. panelIds reports the workspace's own panels. This is what the renderer
//     intersects with attentionIds() — a wrong answer here is a waiting count
//     attributed to the wrong canvas.
{
  const path = tmp()
  writeFileSync(path, file(), 'utf8')
  const s = L.createLayoutStore({ filePath: path })
  s.load()
  const ws = s.workspaces()
  ok('84 panelIds reports the workspace’s own panels',
    ws.length === 1 && ws[0].panelIds.length === 1 && ws[0].panelIds[0] === 'p1',
    JSON.stringify(ws[0].panelIds))
}

// 85. Rename round-trips through a write and a reopen; an unknown id is false
//     and changes nothing — the same "false when the id names nothing" rule
//     renamePreset and deletePrompt already obey.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  const id = a.createWorkspace('school')
  const renamed = a.renameWorkspace(id, 'university')
  const missing = a.renameWorkspace('nope', 'x')
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  const found = b.workspaces().find((w) => w.id === id)
  ok('85 renameWorkspace round-trips, and an unknown id is false',
    renamed === true && missing === false && found !== undefined &&
      found.name === 'university',
    `renamed=${renamed} missing=${missing} name=${found && found.name}`)
}

// 86. Deleting a NON-active workspace removes it and leaves the active id
//     alone.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const id = s.createWorkspace('school')
  const gone = s.deleteWorkspace(id)
  const ws = s.workspaces()
  ok('86 deleting a non-active workspace leaves the active one alone',
    gone === true && ws.length === 1 &&
      ws[0].id === L.DEFAULT_WORKSPACE_ID && ws[0].active === true,
    JSON.stringify(ws))
}

// 87. Deleting the ACTIVE workspace activates a neighbour. Leaving
//     activeWorkspaceId naming a record that is gone would send
//     activeWorkspace() into its repair branch — a branch written for a
//     snapshot built in code and documented as unreachable from a parsed
//     file, which repairs by silently discarding whatever the caller thought
//     it was working with.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const other = s.createWorkspace('school')
  const gone = s.deleteWorkspace(L.DEFAULT_WORKSPACE_ID)
  const ws = s.workspaces()
  ok('87 deleting the active workspace activates a neighbour',
    gone === true && ws.length === 1 && ws[0].id === other && ws[0].active === true,
    JSON.stringify(ws))
}

// 88. NEVER ZERO WORKSPACES. parseLayout guarantees at least one ON LOAD, but
//     that is a read-path guarantee and deleteWorkspace is a write path that
//     did not exist when it was written. Deleting the last one installs a
//     fresh default and activates it — and it must survive a reopen, because
//     the failure this guards is a file with an empty workspaces array.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  const gone = a.deleteWorkspace(L.DEFAULT_WORKSPACE_ID)
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  const ws = b.workspaces()
  ok('88 deleting the last workspace installs a fresh one',
    gone === true && ws.length === 1 && ws[0].active === true &&
      ws[0].panelIds.length === 0,
    JSON.stringify(ws))
}
```

- [ ] **Step 2: Run the checks and watch them fail**

```bash
npm run verify:layout
```

Expected: FAIL on 82–88 with `TypeError: s.workspaces is not a function`. The other 83 checks must still pass — if any of them moved, stop and find out why before writing any implementation.

- [ ] **Step 3: Add the `WorkspaceRow` type**

In `src/shared/ipc-contract.ts`, beside `PresetListRow`:

```ts
/**
 * One workspace as the palette needs it.
 *
 * An IPC payload shape, not an on-disk one — the same split PresetListRow
 * draws against Preset, and it matters for the same reason: layout-schema.ts
 * decides what is VALID on disk, and a field that exists only to render a row
 * has no business in the format.
 *
 * `panelIds` rather than a waiting count. Main does not know which panels are
 * in wants-you in a form the renderer should trust it for, and the renderer
 * already receives every agent:state transition — so shipping a count here
 * would put the derivation in the wrong process to no benefit. See M6d's
 * "M7 added no IPC channel" reasoning, which this follows.
 */
export interface WorkspaceRow {
  id: string
  name: string
  panelIds: string[]
  active: boolean
}
```

- [ ] **Step 4: Add the four accessors to the `LayoutStore` interface**

In `src/main/layout-store.ts`, add to the imports:

```ts
import type { WorkspaceRow } from '../shared/ipc-contract'
```

and to the `LayoutStore` interface, after `deletePrompt`:

```ts
  /** Every workspace, with the active one flagged. Copied out, like presets(). */
  workspaces(): WorkspaceRow[]
  /**
   * Mint one and return its id. Does NOT activate it: a create that also
   * switched would move the user somewhere they did not ask to go, and
   * switching is a transaction with its own rules (see activateWorkspace).
   */
  createWorkspace(name: string): string
  /** False when the id names nothing, like renamePreset. */
  renameWorkspace(id: string, name: string): boolean
  /**
   * False when the id names nothing. Deleting the ACTIVE workspace activates
   * a neighbour, and deleting the LAST one installs a fresh default — there
   * is never zero workspaces, which parseLayout guarantees only on load.
   *
   * NOTE: this removes the RECORD. The panels' sessions belong to the
   * renderer's registry and are disposed there, before this is called.
   */
  deleteWorkspace(id: string): boolean
```

- [ ] **Step 5: Implement the four accessors**

In `src/main/layout-store.ts`, add a helper beside `activeWorkspace()`:

```ts
  // Ids are `w<n>` above the current maximum, the same shape parseWorkspace's
  // own fallback already assumes (`w${index + 1}`). Derived from the existing
  // ids rather than from the count, so deleting w2 out of [w1, w2, w3] cannot
  // mint a second w3.
  function nextWorkspaceId(): string {
    const max = snapshot.workspaces.reduce((n, w) => {
      const match = /^w(\d+)$/.exec(w.id)
      return match ? Math.max(n, Number(match[1])) : n
    }, 0)
    return `w${max + 1}`
  }
```

and add these members to the returned object, after `deletePrompt`:

```ts
    workspaces: () =>
      snapshot.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        // Copied out for the reason presets() copies: a caller must not be
        // able to mutate the snapshot the store is about to serialise.
        panelIds: w.panels.map((p) => p.id),
        active: w.id === snapshot.activeWorkspaceId
      })),

    createWorkspace(name) {
      const id = nextWorkspaceId()
      // Built field by field off defaultWorkspace() rather than spread with an
      // override, so a future field added to Workspace gets its default here
      // instead of silently arriving as undefined.
      snapshot.workspaces = [...snapshot.workspaces, { ...defaultWorkspace(), id, name }]
      scheduleWrite()
      return id
    },

    renameWorkspace(id, name) {
      const found = snapshot.workspaces.find((w) => w.id === id)
      if (!found) return false
      snapshot.workspaces = snapshot.workspaces.map((w) =>
        w.id === id ? { ...w, name } : w
      )
      scheduleWrite()
      return true
    },

    deleteWorkspace(id) {
      const before = snapshot.workspaces.length
      snapshot.workspaces = snapshot.workspaces.filter((w) => w.id !== id)
      if (snapshot.workspaces.length === before) return false
      // NEVER ZERO. parseLayout guarantees at least one workspace on LOAD, but
      // that is the read path; this is a write path that did not exist when it
      // was written. With an empty array, activeWorkspace()'s repair branch —
      // documented as unreachable from a parsed file — fires on the next save
      // and repairs by discarding whatever the caller had.
      if (snapshot.workspaces.length === 0) {
        snapshot.workspaces = [defaultWorkspace()]
      }
      // A activeWorkspaceId naming a record that is gone is the same class of
      // fact-on-disk-that-outlives-this-run as a defaultPresetId naming a
      // deleted preset: recoverable at read time, but only HERE is the moment
      // the workspace goes away visible.
      if (snapshot.activeWorkspaceId === id) {
        snapshot.activeWorkspaceId = snapshot.workspaces[0].id
      }
      scheduleWrite()
      return true
    },
```

- [ ] **Step 6: Run the checks and watch them pass**

```bash
npm run typecheck && npm run verify:layout
```

Expected: `90/90 passed`. (83 existing + 7 new.)

- [ ] **Step 7: Commit**

```bash
git add src/main/layout-store.ts src/shared/ipc-contract.ts scripts/verify-layout.cjs
git commit -m "feat(m7): workspace CRUD in the layout store

The collection half. The format has carried workspaces since M4b, so this
adds accessors over data that was already on disk, plus one invariant the
parser could not hold: parseLayout guarantees at least one workspace on
LOAD, and deleteWorkspace is a write path that did not exist then."
```

---

### Task 2: `activateWorkspace` — the flush-then-swap transaction

The save race. This is the hazard with **no visible symptom**: the file stays well-formed, it just holds the wrong panels, and the user finds out launches later.

**Files:**
- Modify: `src/main/layout-store.ts`
- Test: `scripts/verify-layout.cjs` (append checks 89–93)

**Interfaces:**
- Consumes: `WorkspaceRow` and the four accessors from Task 1; `activeWorkspace()`, `resolvedSettings()`, `initial()`'s restore logic.
- Produces, relied on by Tasks 3 and 5:

```ts
// src/main/layout-store.ts — added to the LayoutStore interface
activateWorkspace(id: string, outgoing: CanvasState): ActivateResult | null

// src/shared/ipc-contract.ts
export interface ActivateResult {
  state: CanvasState
  allPanelIds: string[]
}
```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, before the summary block:

```js
// 89. THE SAVE RACE. activate writes the OUTGOING state into the OLD record
//     before flipping the active id. save() merges into whatever is active AT
//     THE MOMENT IT RUNS, on a 500ms coalescing debounce — so a switch that
//     merely flips the id has a window in which workspace A's panels are
//     written into workspace B. The file stays well-formed. This is the whole
//     reason activate takes a parameter it looks like it should not need.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const other = s.createWorkspace('school')
  const outgoing = {
    panels: [panel({ id: 'a1' })],
    camera: { x: 7, y: 8, scale: 3 },
    selectedId: 'a1',
    focusedId: 'a1'
  }
  const res = s.activateWorkspace(other, outgoing)
  const ws = s.workspaces()
  const old = ws.find((w) => w.id === L.DEFAULT_WORKSPACE_ID)
  const now = ws.find((w) => w.id === other)
  ok('89 activate writes the outgoing state into the OLD record',
    res !== null && old !== undefined && old.panelIds.join() === 'a1' &&
      now !== undefined && now.active === true && now.panelIds.length === 0,
    `old=${old && old.panelIds.join()} new=${now && now.panelIds.join()}`)
}

// 90. activate returns the INCOMING workspace's state, with the restore
//     settings applied the same way initial() applies them — a switch is a
//     second boot, so the two must not answer differently.
{
  const path = tmp()
  writeFileSync(path, file(), 'utf8')
  const s = L.createLayoutStore({ filePath: path })
  s.load()
  const other = s.createWorkspace('school')
  const empty = { panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }
  // Into the new one...
  s.activateWorkspace(other, empty)
  // ...and back, which must hand p1 (and its camera) straight back.
  const res = s.activateWorkspace(L.DEFAULT_WORKSPACE_ID, empty)
  ok('90 activate returns the incoming workspace’s own state',
    res !== null && res.state.panels.length === 1 && res.state.panels[0].id === 'p1' &&
      res.state.camera.x === 10 && res.state.camera.scale === 2,
    JSON.stringify(res && res.state.camera))
}

// 91. allPanelIds spans EVERY workspace, not the active one. nextIdRef seeds
//     from this, and PanelId doubles as the tmux session name — so a partial
//     view here is two panels naming one session, where the second to go live
//     attaches to the first one's process. This is the id-collision defect
//     M4a fixed by removing length-derived ids, resurrected through a door
//     M4a could not see.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const other = s.createWorkspace('school')
  const empty = { panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }
  s.activateWorkspace(other, {
    ...empty, panels: [panel({ id: 'n3' }), panel({ id: 'n7' })]
  })
  const res = s.activateWorkspace(other, { ...empty, panels: [panel({ id: 'n1' })] })
  const ids = res === null ? [] : [...res.allPanelIds].sort()
  ok('91 allPanelIds spans every workspace',
    ids.join() === 'n1,n3,n7', ids.join())
}

// 92. An unknown id returns null and changes NOTHING — in particular it must
//     not have written the outgoing state anywhere. A switch to a workspace
//     that is gone (a stale palette row, a second window) must be a no-op,
//     not a half-applied transaction.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const res = s.activateWorkspace('nope', {
    panels: [panel({ id: 'zz' })],
    camera: { x: 1, y: 1, scale: 1 }, selectedId: null, focusedId: null
  })
  const ws = s.workspaces()
  ok('92 activating an unknown id is null and changes nothing',
    res === null && ws.length === 1 && ws[0].panelIds.length === 0,
    `res=${res} ${JSON.stringify(ws)}`)
}

// 93. The whole transaction survives a write and a reopen. 89 proves the
//     in-memory ordering; this proves it reached disk, which is where the
//     save race actually hurts.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  const other = a.createWorkspace('school')
  a.activateWorkspace(other, {
    panels: [panel({ id: 'a1' })],
    camera: { x: 5, y: 6, scale: 1 }, selectedId: null, focusedId: null
  })
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  const ws = b.workspaces()
  const old = ws.find((w) => w.id === L.DEFAULT_WORKSPACE_ID)
  const now = ws.find((w) => w.id === other)
  ok('93 the activate transaction survives a reopen',
    old !== undefined && old.panelIds.join() === 'a1' &&
      now !== undefined && now.active === true,
    JSON.stringify(ws))
}
```

- [ ] **Step 2: Run the checks and watch them fail**

```bash
npm run verify:layout
```

Expected: FAIL on 89–93 with `TypeError: s.activateWorkspace is not a function`. Checks 1–88 still pass.

- [ ] **Step 3: Add `ActivateResult` to the contract**

In `src/shared/ipc-contract.ts`, below `WorkspaceRow`:

```ts
/**
 * What a switch hands back. A workspace switch is a SECOND BOOT — the same
 * two facts boot() awaits, in one round trip instead of two.
 *
 * `allPanelIds` spans every workspace, deliberately. The renderer seeds
 * nextIdRef from it, and PanelId doubles as the tmux session name: seeding
 * from the ACTIVE workspace's ids alone would let Cmd+N in one workspace mint
 * an id another workspace is already using, and the second panel to go live
 * would attach to the first one's process.
 */
export interface ActivateResult {
  state: CanvasState
  allPanelIds: string[]
}
```

`CanvasState` is already imported there; if not, add `import type { CanvasState } from './layout-schema'`.

- [ ] **Step 4: Implement `activateWorkspace`**

In `src/main/layout-store.ts`, add to the `LayoutStore` interface after `deleteWorkspace`:

```ts
  /**
   * Switch the active workspace, and write the outgoing canvas into the one
   * being left. Null when the id names nothing, having changed nothing.
   *
   * It takes `outgoing` — a parameter it looks like it should not need — for
   * one reason: save() merges into whatever is active AT THE MOMENT IT RUNS,
   * and writes are coalesced on a WRITE_DEBOUNCE_MS timer. A switch that
   * merely flipped the id would leave a window in which the outgoing canvas's
   * next save lands in the INCOMING workspace's record. The file stays
   * well-formed and simply holds the wrong panels, which the user discovers
   * launches later with nothing in any log. This call IS the outgoing
   * canvas's last save.
   */
  activateWorkspace(id: string, outgoing: CanvasState): ActivateResult | null
```

Add `ActivateResult` to the `WorkspaceRow` import. Then, in the returned object, after `deleteWorkspace`:

```ts
    activateWorkspace(id, outgoing) {
      const target = snapshot.workspaces.find((w) => w.id === id)
      // Nothing is written for an unknown id. A half-applied transaction — the
      // outgoing state saved, the switch refused — is strictly worse than a
      // no-op, because the caller has no way to tell it happened.
      if (!target) return null

      // 1. Write the outgoing canvas into the workspace being LEFT, obeying
      //    the same restore settings save() obeys. Reusing save() itself is
      //    exactly right here: it merges into activeWorkspace(), which is
      //    still the OLD one at this point in the function. Ordering is the
      //    whole mechanism — moving this below the flip is the save race.
      this.save(outgoing)

      // 2. Flip.
      snapshot.activeWorkspaceId = id
      scheduleWrite()

      // 3. Hand back the incoming canvas exactly as initial() would, so a
      //    switch and a boot cannot answer differently.
      return { state: this.initial(), allPanelIds: allPanelIds() }
    },
```

`this.save` and `this.initial` resolve because both are members of the same returned object literal. If the surrounding code style avoids `this` here, hoist `save` and `initial` into named function declarations above the `return` and call those instead — but do not duplicate their bodies, because two copies of the restore-settings logic is precisely the second-storage failure M6b removed.

Add the `allPanelIds` helper beside `nextWorkspaceId`:

```ts
  // Every id in every workspace. The renderer seeds nextIdRef from this, and
  // the reason it must not be the active workspace's ids alone is that
  // PanelId doubles as a tmux session name — see ActivateResult.
  function allPanelIds(): string[] {
    return snapshot.workspaces.flatMap((w) => w.panels.map((p) => p.id))
  }
```

- [ ] **Step 5: Run the checks and watch them pass**

```bash
npm run typecheck && npm run verify:layout
```

Expected: `95/95 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/main/layout-store.ts src/shared/ipc-contract.ts scripts/verify-layout.cjs
git commit -m "feat(m7): activateWorkspace, a flush-then-swap transaction

save() merges into whatever is active when it runs, on a 500ms coalescing
debounce, so a switch that merely flipped activeWorkspaceId would let the
outgoing canvas's next save land in the incoming workspace's record. The
file stays well-formed and holds the wrong panels. activate takes the
outgoing state so the write and the flip are one call."
```

---

### Task 3: The IPC surface

**Files:**
- Modify: `src/shared/ipc-contract.ts` (the `IPC` object, ~line 21–103; `CanvasBridge`)
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `scripts/verify-ipc-surface.cjs` (its channel count assertion)

**Interfaces:**
- Consumes: `workspaces()`, `createWorkspace()`, `renameWorkspace()`, `deleteWorkspace()`, `activateWorkspace()` from Tasks 1–2.
- Produces, relied on by Tasks 4–7:

```ts
// window.canvas.workspace
list(): Promise<WorkspaceRow[]>
activate(id: string, outgoing: CanvasState): Promise<ActivateResult | null>
create(name: string): Promise<string>
rename(id: string, name: string): Promise<boolean>
remove(id: string): Promise<boolean>
```

Note `remove`, not `delete` — `delete` is a reserved word and the bridge already spells the preset equivalent `remove`.

- [ ] **Step 1: Watch the existing channel check fail**

First confirm the current count so the change is visible:

```bash
npm run build && npm run verify:ipc
```

Expected: PASS at 20 channels. Note the number; the check derives its list from `IPC`, so adding channels without handlers is what makes it fail.

- [ ] **Step 2: Add the five channels**

In `src/shared/ipc-contract.ts`, inside the `IPC` object after `AGENT_ACKNOWLEDGE`:

```ts
  ,
  /**
   * The workspace surface. All five point renderer -> main for the reason
   * M5b's preset mutations do: main owns layout.json, and the palette is the
   * renderer's — so a mutation is an invoke, not an event.
   *
   * There is deliberately NO workspace attention channel. The renderer
   * already receives every agent:state transition for every panel main knows
   * about, so the attention set is folded renderer-side; WORKSPACE_LIST
   * returns panelIds and the renderer intersects. Asking main to recompute a
   * set the renderer already holds would make main a second author of a
   * derived fact — the same reasoning M6d recorded for not adding a channel.
   */
  WORKSPACE_LIST: 'workspace:list',
  /** Takes the outgoing canvas: the switch IS its last save. See the store. */
  WORKSPACE_ACTIVATE: 'workspace:activate',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_RENAME: 'workspace:rename',
  WORKSPACE_DELETE: 'workspace:delete'
```

And in `CanvasBridge`, beside `preset` / `prompt` / `settings`:

```ts
  workspace: {
    list(): Promise<WorkspaceRow[]>
    /**
     * `outgoing` is the canvas being left. Resolves null when the id names
     * nothing, having changed nothing.
     */
    activate(id: string, outgoing: CanvasState): Promise<ActivateResult | null>
    create(name: string): Promise<string>
    rename(id: string, name: string): Promise<boolean>
    /** `remove`, not `delete`: `delete` is reserved, as PresetBridge already found. */
    remove(id: string): Promise<boolean>
  }
```

- [ ] **Step 3: Add the five handlers**

In `src/main/ipc.ts`, at the end of `registerIpcHandlers`:

```ts
  // Straight through to the store, with no PaletteHandlers indirection: unlike
  // preset:spawn-by-id (which needs main's command resolution) and
  // canvas:request-reset (which needs main's dialog), nothing here needs a
  // collaborator main/index.ts owns. A handler that just forwards is the right
  // shape when there is genuinely nothing to add.
  ipcMain.handle(IPC.WORKSPACE_LIST, () => layoutStore.workspaces())

  ipcMain.handle(
    IPC.WORKSPACE_ACTIVATE,
    (_event, id: string, outgoing: CanvasState) =>
      layoutStore.activateWorkspace(id, outgoing)
  )

  ipcMain.handle(IPC.WORKSPACE_CREATE, (_event, name: string) =>
    layoutStore.createWorkspace(name)
  )

  ipcMain.handle(IPC.WORKSPACE_RENAME, (_event, id: string, name: string) =>
    layoutStore.renameWorkspace(id, name)
  )

  ipcMain.handle(IPC.WORKSPACE_DELETE, (_event, id: string) =>
    layoutStore.deleteWorkspace(id)
  )
```

- [ ] **Step 4: Expose the bridge**

In `src/preload/index.ts`, add to the `bridge` object:

```ts
  workspace: {
    list: () => ipcRenderer.invoke(IPC.WORKSPACE_LIST),
    activate: (id: string, outgoing: CanvasState) =>
      ipcRenderer.invoke(IPC.WORKSPACE_ACTIVATE, id, outgoing),
    create: (name: string) => ipcRenderer.invoke(IPC.WORKSPACE_CREATE, name),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke(IPC.WORKSPACE_RENAME, id, name),
    remove: (id: string) => ipcRenderer.invoke(IPC.WORKSPACE_DELETE, id)
  },
```

- [ ] **Step 5: Run the check and watch it pass at 25**

```bash
npm run typecheck && npm run build && npm run verify:ipc
```

Expected: PASS, now reporting **25** channels. If it reports 25 declared but fails on a missing handler, a channel constant was added without its `ipcMain.handle` — that is exactly what this suite exists to catch.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-contract.ts src/main/ipc.ts src/preload/index.ts
git commit -m "feat(m7): five workspace invokes, and no event channel

All five point renderer -> main, the direction M5b established for palette
mutations. No attention channel: the renderer already receives every
agent:state transition, so workspace:list returns panelIds and the
renderer intersects with the set it is already maintaining."
```

---

### Task 4: The palette's workspace section

Pure list construction, in the cheapest tier. No renderer, no DOM.

**Files:**
- Modify: `src/renderer/palette/palette-model.ts` (`SECTIONS` ~line 29, `PaletteScope` ~line 43)
- Modify: `src/renderer/palette/Palette.tsx` (`SCOPE_LABEL` ~line 90)
- Modify: `src/renderer/palette/commands.ts` (`PaletteContext`, `PaletteActions`, `buildCommands`)
- Test: `scripts/verify-palette.cjs` (append checks 59–64)

**Interfaces:**
- Consumes: `WorkspaceRow` from Task 1; `Command`, `SECTIONS`, `filterCommands`, `withReason` already in these files.
- Produces, relied on by Tasks 5–7:

```ts
// src/renderer/palette/commands.ts — added to PaletteActions
switchWorkspace(id: string): void
beginCreateWorkspace(): void
beginRenameWorkspace(id: string, currentName: string): void
deleteWorkspace(id: string, name: string, liveCount: number): void

// added to PaletteContext
workspaces: WorkspaceRow[]
/** Panel ids currently in wants-you. Intersected with each row's panelIds. */
attentionIds: readonly string[]

// exported reason
export const REASON_ALREADY_ACTIVE = 'already the active workspace'
```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-palette.cjs`, before its summary block. Match the existing file's fixture helpers — read the top of that file first and reuse its `ctx(...)` builder rather than inventing a second one; the snippet below assumes a `ctx({...})` helper that fills unspecified `PaletteContext` fields with empty defaults.

```js
// M7. Workspaces. A section, a drill-in, and a waiting count that must not be
// searchable.

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
      rows.every((c) => c.section === 'workspace' || c.section === 'manage'),
    `workspace=${wi} manage=${mi}`)
}

// 60. The ACTIVE workspace's switch row is disabled with its reason, not
//     absent. The rule check 31 states in its own comment: a row that
//     disappears is indistinguishable from a feature that is missing.
{
  const rows = P.buildCommands(ctx({ workspaces: WS }))
  const active = rows.find((c) => c.section === 'workspace' && c.title.includes('startup'))
  const other = rows.find((c) => c.section === 'workspace' && c.title.includes('school'))
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

// 64. The waiting count renders in the title and is NOT searchable. A count is
//     state, not a name: a row findable by typing "2" is a row whose match
//     score changes as agents finish, which is a ranking that moves under the
//     user for reasons they cannot see.
{
  const rows = P.buildCommands(ctx({ workspaces: WS, attentionIds: ['n3', 'n4'] }))
  const school = rows.find((c) => c.section === 'workspace' && c.title.includes('school'))
  const startup = rows.find((c) => c.section === 'workspace' && c.title.includes('startup'))
  const searchable = school !== undefined && P.haystack(school).includes('2 waiting')
  ok('64 the waiting count is in the title and not in the haystack',
    school !== undefined && school.title.includes('2 waiting') &&
      startup !== undefined && !startup.title.includes('waiting') &&
      !searchable,
    `title=${school && school.title} searchable=${searchable}`)
}
```

If `haystack` is not currently exported from `palette-model.ts`, export it as part of this task — the check needs to assert what the matcher actually sees, and a paraphrase would drift.

- [ ] **Step 2: Run the checks and watch them fail**

```bash
npm run verify:palette
```

Expected: FAIL on 59–64. Checks 1–58 still pass.

- [ ] **Step 3: Add the section and the scope**

In `src/renderer/palette/palette-model.ts`:

```ts
export const SECTIONS: readonly SectionDef[] = [
  { id: 'panel', label: 'Panels' },
  { id: 'spawn', label: 'New panel' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'workspace', label: 'Workspaces' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'setting', label: 'Settings' },
  { id: 'manage', label: 'Manage' }
]

export type PaletteScope = 'presets' | 'prompts' | 'settings' | 'workspaces'
```

Workspaces sit after `prompt` and before `canvas`: they are destinations, like panel rows, and `canvas`/`setting`/`manage` are all errands by the ordering rule already written above `SECTIONS`.

In `src/renderer/palette/Palette.tsx`, add to `SCOPE_LABEL`:

```ts
  workspaces: 'Workspaces'
```

`SCOPE_LABEL` is a `Record<PaletteScope, string>`, so `typecheck` fails until this is added — which is the type system doing the job M6b's plan needed a written section for.

- [ ] **Step 4: Build the rows**

In `src/renderer/palette/commands.ts`, add to `PaletteActions`:

```ts
  switchWorkspace(id: string): void
  beginCreateWorkspace(): void
  beginRenameWorkspace(id: string, currentName: string): void
  /**
   * `liveCount` is passed in rather than looked up because the confirm names
   * it, and the row is the only place that knows both the workspace and the
   * renderer's session set.
   */
  deleteWorkspace(id: string, name: string, liveCount: number): void
```

to `PaletteContext`:

```ts
  workspaces: WorkspaceRow[]
  /**
   * Panel ids currently in wants-you, from the renderer's own attention set.
   * Intersected with each row's panelIds — which is why WORKSPACE_LIST returns
   * ids and not a count: main does not hold this fact, the renderer does.
   */
  attentionIds: readonly string[]
```

a reason:

```ts
export const REASON_ALREADY_ACTIVE = 'already the active workspace'
```

and the rows, in `buildCommands` between the prompt block and the canvas block:

```ts
  // --- Workspaces ----------------------------------------------------------
  for (const w of ctx.workspaces) {
    const waiting = w.panelIds.filter((id) => ctx.attentionIds.includes(id)).length
    out.push(
      withReason(
        {
          id: `workspace.switch.${w.id}`,
          section: 'workspace',
          // The count is in the TITLE and nowhere else. It is state, not a
          // name: putting it in searchText would make the row findable by
          // typing a digit, and its match score would then move as agents
          // finish — a ranking that changes under the user for a reason
          // nothing on screen explains.
          title: waiting > 0 ? `${w.name} · ${waiting} waiting` : w.name,
          searchText: 'switch workspace canvas go to',
          run: () => ctx.actions.switchWorkspace(w.id)
        },
        w.active ? REASON_ALREADY_ACTIVE : undefined
      )
    )
  }

  out.push({
    id: 'workspace.create',
    section: 'workspace',
    title: 'New workspace…',
    searchText: 'create add canvas workspace',
    run: () => ctx.actions.beginCreateWorkspace()
  })

  // --- Manage: the workspace errands ---------------------------------------
  // hiddenAtRest for the reason it exists: three rows per workspace un-hidden
  // would put the resting list back past the roughly-eight-row budget M6p
  // sized it to. They stay findable by query — typing "delete" surfaces them —
  // because a row that disappears is indistinguishable from a feature that is
  // missing.
  for (const w of ctx.workspaces) {
    out.push({
      id: `workspace.rename.${w.id}`,
      section: 'manage',
      title: `Rename workspace “${w.name}”…`,
      hiddenAtRest: true,
      scope: 'workspaces',
      run: () => ctx.actions.beginRenameWorkspace(w.id, w.name)
    })
    out.push({
      id: `workspace.delete.${w.id}`,
      section: 'manage',
      title: `Delete workspace “${w.name}”…`,
      hiddenAtRest: true,
      scope: 'workspaces',
      destructive: true,
      // Marked AND gated. A red row still runs on one Enter, so the mark is
      // not the guard; the confirm (Canvas.tsx) is. Neither half replaces the
      // other.
      run: () => ctx.actions.deleteWorkspace(w.id, w.name, w.panelIds.length)
    })
  }

  out.push({
    id: 'manage.workspaces',
    section: 'manage',
    title: 'Manage workspaces…',
    searchText: 'rename delete workspace canvas',
    entersScope: 'workspaces',
    run: () => {}
  })
```

The `Manage workspaces…` row carries no `hiddenAtRest`: it is the door, and the door is what makes the hiding honest for anyone not guessing a query. Its `run` is a no-op because `runRow` reads `entersScope` as a **field** before running — a row that wants the overlay to stay up has to be readable before it is run.

- [ ] **Step 5: Run the checks and watch them pass**

```bash
npm run typecheck && npm run verify:palette
```

Expected: `66/66 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/palette src/renderer/canvas scripts/verify-palette.cjs
git commit -m "feat(m7): a Workspaces section and drill-in in the palette

Two lines of structure, because M6p made SECTIONS ordered data rather than
a closed union. The waiting count lives in the title and not in the
haystack: a count is state, not a name, and a row findable by typing a
digit is a row whose ranking moves as agents finish."
```

---

### Task 5: Switching in a real renderer

The load-bearing task. Everything before this is provable in plain node; the property that actually matters — *the same process is there when you come back* — is provable only here.

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx` (`nextIdRef` ~line 131, `setHistory` ~line 148, `paletteActions`)
- Modify: `src/renderer/main.tsx` (pass `allPanelIds` into `Canvas`)
- Modify: `src/renderer/App.tsx` (thread the new prop)
- Test: `scripts/verify-panels.cjs` (append checks 64–67)

**Interfaces:**
- Consumes: `window.canvas.workspace.activate` (Task 3), `switchWorkspace` in `PaletteActions` (Task 4), `ActivateResult`.
- Produces, relied on by Tasks 6–7: a `__m7aWorkspace()` hook on `window` for the verify harness, and `Canvas`'s new `allPanelIds: readonly string[]` prop.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, before its summary block. It drives the renderer through `executeJavaScript`; follow the existing checks' shape for `wc`/`zoomTo` helpers.

```js
// M7. Workspace switching. The suite that consumes the build, because the one
// property that matters here is unprovable anywhere cheaper.

// 64. THE PID CHECK. Switch away from a live panel and back, and it must be
//     the SAME PROCESS. Every other check in this milestone stays green
//     against an implementation that disposes on switch: the panels come
//     back, the layout is right, the file is right, and the agents are dead.
//     Same argument verify:pty-manager 12 makes for asserting the reattached
//     pid rather than merely that a session exists.
{
  const before = await wc.executeJavaScript(`
    (async () => {
      const s = window.__m4aSessions()
      const live = s.find((x) => x.spawned)
      return live ? live.pid : null
    })()
  `)
  await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('school')`)
  await settle()
  await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
  await settle()
  const after = await wc.executeJavaScript(`
    (async () => {
      const s = window.__m4aSessions()
      const live = s.find((x) => x.pid === ${JSON.stringify(before)})
      return live ? live.pid : null
    })()
  `)
  ok('64 a switch away and back keeps the SAME pid',
    before !== null && after === before, `before=${before} after=${after}`)
}

// 65. A hidden workspace's panel is out of the DOM while its session is still
//     in the registry. This is "demote, not dispose" stated as two facts that
//     must BOTH hold — the DOM half alone passes against a dispose, and the
//     registry half alone passes against a switch that never rendered.
{
  await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w2')`)
  await settle()
  const state = await wc.executeJavaScript(`
    ({
      panelsInDom: document.querySelectorAll('.panel').length,
      sessionsInRegistry: window.__m4aSessions().length
    })
  `)
  ok('65 a hidden workspace keeps its sessions and loses its DOM',
    state.panelsInDom === 0 && state.sessionsInRegistry > 0,
    JSON.stringify(state))
}

// 66. Cmd+N in the second workspace does not mint an id the first is using.
//     PanelId doubles as the tmux session name, so a collision is two panels
//     naming one session — the second to go live attaches to the first one's
//     process, and neither panel shows anything wrong.
{
  const otherIds = await wc.executeJavaScript(`window.__m7aWorkspace().allPanelIds()`)
  zoomTo(wc, 'n')
  await settle()
  const minted = await wc.executeJavaScript(`
    Array.from(document.querySelectorAll('[data-panel-id]')).map((e) => e.dataset.panelId)
  `)
  const collision = minted.filter((id) => otherIds.includes(id))
  ok('66 a spawn in another workspace mints no colliding id',
    collision.length === 0, `minted=${minted.join()} collision=${collision.join()}`)
}

// 67. Cmd+Z immediately after a switch is INERT. history is one stack over one
//     Panel[], and applyHistory calls registry.dispose for any panel the
//     undone state no longer contains — so an uncleared stack would apply the
//     OTHER workspace's array here and kill this workspace's agents. Doing
//     nothing is the honest failure; doing something is the dangerous one.
{
  await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
  await settle()
  const before = await wc.executeJavaScript(`
    ({ panels: document.querySelectorAll('.panel').length,
       sessions: window.__m4aSessions().length })
  `)
  zoomTo(wc, 'z')   // Cmd+Z
  await settle()
  const after = await wc.executeJavaScript(`
    ({ panels: document.querySelectorAll('.panel').length,
       sessions: window.__m4aSessions().length })
  `)
  ok('67 Cmd+Z right after a switch changes nothing',
    before.panels === after.panels && before.sessions === after.sessions,
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
}
```

- [ ] **Step 2: Run the checks and watch them fail**

```bash
npm run build && npm run verify:panels
```

Expected: FAIL on 64–67 with `window.__m7aWorkspace is not a function`. Checks 1–63 still pass.

- [ ] **Step 3: Seed `nextIdRef` from every workspace**

In `src/renderer/main.tsx`, `boot()` currently awaits `layout.load()` and `pty.list()`. Add a third await and pass the result down:

```ts
  // Every panel id in every workspace, not just the active one.
  //
  // nextIdRef seeds from this. Seeding from `initial.panels` alone was correct
  // while there was exactly one workspace and is a defect the moment there is
  // more than one: PanelId doubles as the tmux session name, so Cmd+N in
  // workspace B could mint an id workspace A is already using, and the second
  // panel to go live would attach to the first one's process — with nothing
  // visibly wrong on either panel. This is the id-collision defect M4a fixed
  // by removing length-derived ids, reachable again through a door M4a could
  // not see.
  let allPanelIds: string[] = initial.panels.map((p) => p.id)
  try {
    const rows = await window.canvas.workspace.list()
    allPanelIds = rows.flatMap((w) => w.panelIds)
  } catch (error: unknown) {
    // Degrades to the active workspace's ids — the M4b behaviour. The failure
    // direction matters: a SHORTER list can collide, so this is logged loudly
    // rather than swallowed.
    console.warn('[boot] could not list workspaces; ids seed from this canvas only', error)
  }
```

and pass `allPanelIds={allPanelIds}` to `<App />`, threading it through `App.tsx` to `Canvas`.

In `Canvas.tsx`, change the `nextIdRef` seed to read the new prop instead of `initial.panels`:

```ts
  const nextIdRef = useRef(
    allPanelIds.reduce((max, id) => {
      const match = /^n(\d+)$/.exec(id)
      return match ? Math.max(max, Number(match[1]) + 1) : max
    }, 1)
  )
```

Keep the existing comment above it and extend it with the workspace reason — do not replace it, since the persistence reason it records is still true.

- [ ] **Step 4: Implement the switch**

In `Canvas.tsx`, add the handler near the other palette actions:

```ts
  /**
   * A workspace switch is a SECOND BOOT.
   *
   * Everything derived from the starting state is RE-DERIVED rather than
   * carried: the id counter (from allPanelIds, which spans every workspace),
   * the undo stack (cleared — see below), the camera, and the selection. What
   * is deliberately NOT touched is the registry: unmounting these panels calls
   * detachSlot, which disposes the WebGL addon and pulls the host out of the
   * DOM while the PanelSession, its PTY and its tmux session stay exactly
   * where they are. That is "two lifetimes, not one" paying out at the scale
   * of a whole canvas instead of one culled panel, and it is why this function
   * contains no dispose call at all.
   */
  const switchWorkspace = useCallback(
    (id: string) => {
      const outgoing = toCanvasState(panelsRef.current, viewportRef.current, selectedId, focusedId)
      void window.canvas.workspace.activate(id, outgoing).then((result) => {
        // Null means the id named nothing — a stale palette row. Main changed
        // nothing, so neither does this.
        if (!result) return
        const next = toPanels(result.state.panels)
        setPanels(next)
        setSelectedId(result.state.selectedId)
        setFocusedId(result.state.focusedId)
        restoreCamera(result.state.camera)
        // Every restored panel arrives DORMANT unless it already has a live
        // session — the same rule boot() applies, for the same reason: a
        // switch must spawn nothing. Reusing the rule rather than restating it
        // is what keeps a switch and a boot from disagreeing.
        void window.canvas.pty.list().then((sessions) => {
          const live = new Set(sessions.map((s) => s.panelId))
          setDormantIds(new Set(next.map((p) => p.rect.id).filter((pid) => !live.has(pid))))
        })
        // HISTORY IS CLEARED, not carried. history is ONE stack over ONE
        // Panel[], and applyHistory calls registry.dispose for any panel the
        // undone state no longer contains — which reaches pty.kill. An
        // uncarried stack would let Cmd+Z apply the previous workspace's array
        // here and KILL THIS WORKSPACE'S AGENTS to restore panels that are not
        // on screen. Cmd+Z doing nothing right after a switch is the honest
        // failure; doing something is the dangerous one.
        //
        // Per-workspace stacks are the tempting alternative and are YAGNI:
        // undo is scoped to a gesture the user just made, and it is not free —
        // the stacks would have to be disposed alongside the workspace, or a
        // deleted workspace's history would hold Panel records whose sessions
        // are gone.
        setHistory(createHistory(next))
        // Above the global maximum, not this canvas's — see the seed.
        nextIdRef.current = result.allPanelIds.reduce((max, pid) => {
          const match = /^n(\d+)$/.exec(pid)
          return match ? Math.max(max, Number(match[1]) + 1) : max
        }, 1)
      })
    },
    [selectedId, focusedId, restoreCamera]
  )
```

`toCanvasState` / `toPanels` are the existing adapters in `layout-adapt.ts` — reuse whatever `Canvas.tsx` already calls at its `layout.save` site rather than writing new conversions.

`restoreCamera` does **not** exist yet and is part of this task. `useViewport` returns exactly `{ viewport, resetViewport, worldCentre, centreOn }` — the setter stays private, because nothing outside should move the camera — so add a **fourth narrow verb** beside the other three:

```ts
  /**
   * The fourth verb that asks by name, after resetViewport, worldCentre and
   * centreOn. Unlike centreOn — which deliberately leaves the scale alone,
   * because framing a panel must not throw away the zoom the user chose —
   * this one DOES set the scale: a workspace's saved zoom is part of what it
   * means to come back to it.
   *
   * A useCallback for the reason resetViewport and centreOn already are, and
   * it is not tidiness: a fresh arrow per render propagates through
   * Canvas.tsx's useMemo for paletteActions into Palette.tsx's commands memo,
   * whose [rows] effect re-seats the selected row — and Canvas re-renders on
   * every mousemove over .canvas. The symptom is arrowing down three times,
   * nudging the mouse, pressing Enter, and running the wrong command.
   */
  const restoreCamera = useCallback((camera: PersistedCamera) => {
    setViewport({ x: camera.x, y: camera.y, scale: camera.scale })
  }, [])
```

Return it from the hook, add it to the same dep arrays `resetViewport` and `centreOn` already sit in, and add a `verify:viewport` check (numbering continues from 72) asserting a restored camera reproduces the stored `x`, `y` **and** `scale` exactly — the scale being the half that separates this verb from `centreOn`.

Wire `switchWorkspace` into `paletteActions`, and add the harness hook beside the other `__m4a*` hooks:

```ts
  // verify:panels reaches the registry and the workspace surface through
  // narrow named hooks; the registry is a module-level closure by design and
  // executeJavaScript has no other route in. Named for what each one ANSWERS,
  // so the suite keeps testing behaviour rather than internals.
  ;(window as unknown as Record<string, unknown>).__m7aWorkspace = () => ({
    switchTo: (id: string) => switchWorkspace(id),
    createAndSwitch: (name: string) =>
      window.canvas.workspace.create(name).then((id) => switchWorkspace(id)),
    allPanelIds: () => window.canvas.workspace.list().then((r) => r.flatMap((w) => w.panelIds))
  })
```

- [ ] **Step 5: Run the checks and watch them pass**

```bash
npm run typecheck && npm run build && npm run verify:panels
```

Expected: `71/71 passed`. If 64 fails while 65 passes, the switch is disposing — that is the headline failure, and no other check will tell you.

- [ ] **Step 6: Commit**

```bash
git add src/renderer scripts/verify-panels.cjs
git commit -m "feat(m7): switch workspaces, demoting rather than disposing

A switch is a second boot: the id counter, the undo stack, the camera and
the selection are all re-derived from the incoming state rather than
carried. The registry is deliberately untouched — unmounting a panel
detaches its slot and leaves its PTY running, which is 'two lifetimes,
not one' paying out at the scale of a whole canvas.

Check 64 asserts the same pid across a round trip. Every other check in
this milestone stays green against an implementation that disposes."
```

---

### Task 6: Create, rename, and delete from the palette

Including the fourth `registry.dispose` call site.

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx` (`paletteActions`, the `InputMode` handlers)
- Test: `scripts/verify-panels.cjs` (append checks 68–69)

**Interfaces:**
- Consumes: `beginCreateWorkspace`, `beginRenameWorkspace`, `deleteWorkspace` from `PaletteActions` (Task 4); `switchWorkspace` (Task 5); `window.canvas.workspace.create/rename/remove` (Task 3).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing checks**

```js
// 68. Deleting a workspace disposes its panels' sessions. Not detach — the
//     record is going, so a surviving session is one no UI can ever reach or
//     stop: backlog #61 (recover an orphan session) does not exist, so it
//     would burn tokens invisibly until quit kill-servers the socket.
{
  await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('doomed')`)
  await settle()
  zoomTo(wc, 'n')            // one panel, which goes live and spawns
  await settle()
  const before = await wc.executeJavaScript(`window.__m4aSessions().length`)
  const doomed = await wc.executeJavaScript(`
    window.canvas.workspace.list().then((r) => (r.find((w) => w.name === 'doomed') || {}).id)
  `)
  await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(doomed)})`)
  await settle()
  const after = await wc.executeJavaScript(`window.__m4aSessions().length`)
  const rows = await wc.executeJavaScript(`window.canvas.workspace.list()`)
  ok('68 deleting a workspace disposes its sessions and its record',
    after < before && !rows.some((w) => w.name === 'doomed'),
    `sessions ${before} -> ${after} rows=${rows.length}`)
}

// 69. The confirm is a real gate: Escape leaves the workspace UNDELETED, read
//     back out of workspace.list() rather than off the overlay. A confirm
//     step that confirms unconditionally is invisible — the same reason check
//     50 reads preset.list() instead of the DOM.
{
  const id = await wc.executeJavaScript(`window.canvas.workspace.create('keepme')`)
  await settle()
  await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(id)})`)
  await settle()
  press(wc, 'Escape')
  await settle()
  const rows = await wc.executeJavaScript(`window.canvas.workspace.list()`)
  ok('69 Escape at the confirm leaves the workspace undeleted',
    rows.some((w) => w.id === id), `rows=${rows.map((w) => w.name).join()}`)
}
```

Add `deleteWorkspace` to the `__m7aWorkspace` hook in the same task.

- [ ] **Step 2: Run and watch them fail**

```bash
npm run build && npm run verify:panels
```

Expected: FAIL on 68–69.

- [ ] **Step 3: Implement create and rename**

In `Canvas.tsx`'s `paletteActions`, following `beginRenamePreset`'s two-step shape exactly — the reopen that looks redundant and is not:

```ts
    beginCreateWorkspace: () => {
      setInputMode({
        kind: 'text',
        label: 'Name the new workspace…',
        initial: '',
        submit: (value) => {
          const name = value.trim()
          void window.canvas.workspace.create(name).then((id) => {
            // Create then switch, as two calls rather than one store method.
            // createWorkspace deliberately does not activate (a create that
            // also switched would move the user somewhere they did not ask to
            // go) — but this row is "new workspace", and arriving in it IS
            // what the user asked for. The store keeps the two separable; the
            // command composes them.
            switchWorkspace(id)
            setInputMode(null)
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without reopening, the mode would be set on a palette that is gone.
      palette.openPalette()
    },

    beginRenameWorkspace: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: 'Rename this workspace…',
        initial: currentName,
        submit: (value) => {
          const name = value.trim()
          void window.canvas.workspace.rename(id, name).then(() => {
            void reloadWorkspaces()
            setInputMode(null)
          })
        }
      })
      palette.openPalette()
    },
```

`reloadWorkspaces` is the `workspace.list()` loader added in Task 7; if Task 7 has not run yet, add the loader here as a plain `useCallback` that sets a `workspaceRows` state, and Task 7 will consume it rather than adding a second one.

- [ ] **Step 4: Implement delete — the fourth `registry.dispose` call site**

```ts
    deleteWorkspace: (id, name, liveCount) => {
      setInputMode({
        kind: 'confirm',
        // The count is IN the question. "Delete this workspace?" and "stop 3
        // running agents?" are different questions, and only the second one
        // is the one being asked.
        label:
          liveCount > 0
            ? `Delete “${name}” and stop ${liveCount} running ${liveCount === 1 ? 'agent' : 'agents'}?`
            : `Delete “${name}”?`,
        initial: '',
        submit: () => {
          void window.canvas.workspace.list().then((rows) => {
            const doomed = rows.find((w) => w.id === id)
            // Re-read rather than trusting the row's captured panelIds: the
            // palette's list is a snapshot from when it opened, and a panel
            // may have been closed since.
            if (doomed) {
              for (const panelId of doomed.panelIds) {
                // THE FOURTH registry.dispose CALL SITE in this file (after
                // onClosePanel, applyHistory and onReset). It adds no caller
                // of pty.kill: dispose(id) and disposeAll() remain the only
                // two inside session-registry.ts, and routing through
                // dispose() rather than reaching for pty.kill directly is
                // exactly what has kept that count true across four
                // milestones.
                //
                // Disposing rather than detaching is deliberate. The RECORD is
                // going, so a surviving session is one no UI can reach or
                // stop — backlog #61 does not exist — which is tokens burning
                // invisibly until quit kill-servers the socket.
                registry.dispose(panelId)
                clearAgentState(panelId)
              }
            }
            void window.canvas.workspace.remove(id).then(() => {
              void reloadWorkspaces()
              setInputMode(null)
            })
          })
        }
      })
      palette.openPalette()
    },
```

**Deleting the ACTIVE workspace**: the store activates a neighbour, but the renderer is still showing the deleted one's panels. After `remove` resolves, if `id` was the active workspace, call `switchWorkspace` on whichever row `workspace.list()` now reports as `active`. Add that branch; without it the canvas shows panels whose sessions were just disposed.

- [ ] **Step 5: Run and watch them pass**

```bash
npm run typecheck && npm run build && npm run verify:panels
```

Expected: `73/73 passed`.

- [ ] **Step 6: Verify the dispose count by hand**

```bash
grep -n "registry.dispose" src/renderer/canvas/Canvas.tsx
grep -n "pty.kill" src/renderer/session/session-registry.ts
```

Expected: **four** `registry.dispose` call sites, **two** `pty.kill` callers. `CLAUDE.md` asks for this to be re-derived rather than trusted, because the number was stale once already. Record both numbers in the commit message.

- [ ] **Step 7: Commit**

```bash
git add src/renderer scripts/verify-panels.cjs
git commit -m "feat(m7): create, rename and delete workspaces from the palette

Delete disposes its panels' sessions behind the existing destructive
confirm, whose question names the count. Detaching instead would orphan
them: backlog #61 does not exist, so a session with no panel is tokens
burning until quit kill-servers the socket.

registry.dispose call sites in Canvas.tsx: 3 -> 4. pty.kill callers in
session-registry.ts: still 2 (both re-derived by grep, not trusted)."
```

---

### Task 7: Waiting counts, end to end

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx` (the `workspaceRows` loader, `attentionIds` into `PaletteContext`)
- Test: `scripts/verify-panels.cjs` (append check 70)

**Interfaces:**
- Consumes: `useAttentionIds()` from `agent-state-store.ts`; `workspaces` and `attentionIds` on `PaletteContext` (Task 4).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing check**

```js
// 70. A wants-you panel in a HIDDEN workspace reaches its palette row. This is
//     M6d's premise applied to the strongest case of "an agent you cannot
//     see": the panel is not merely off screen, its whole canvas is. The
//     count is read off a real rendered row, through main's real store.
{
  await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
  await settle()
  // Ring a real bell on a real panel in w1, then leave.
  const panelId = await wc.executeJavaScript(`
    (window.__m4aSessions().find((s) => s.spawned) || {}).id
  `)
  await wc.executeJavaScript(`window.__m4aWrite(${JSON.stringify(panelId)}, 'printf "\\\\a"\\n')`)
  await settle()
  await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('elsewhere')`)
  await settle()
  press(wc, 'k', ['meta'])          // open the palette
  await settle()
  const titles = await wc.executeJavaScript(`
    Array.from(document.querySelectorAll('.palette__row')).map((e) => e.textContent)
  `)
  ok('70 a hidden workspace with a waiting panel says so on its row',
    titles.some((t) => t.includes('waiting')), titles.join(' | '))
  press(wc, 'Escape')
  await settle()
}
```

- [ ] **Step 2: Run and watch it fail**

```bash
npm run build && npm run verify:panels
```

Expected: FAIL on 70 — no row contains "waiting".

- [ ] **Step 3: Load the rows and feed the attention set**

In `Canvas.tsx`:

```ts
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceRow[]>([])

  // Reloaded on the same occasions the preset list is: after a mutation, and
  // when the palette opens. NOT on a timer and NOT on every agent:state
  // message — the ROWS change rarely (a create, a rename, a delete, a panel
  // opening or closing), while the COUNT is derived live from attentionIds
  // below, so a bell does not have to cross the process boundary twice.
  const reloadWorkspaces = useCallback(
    () => window.canvas.workspace.list().then(setWorkspaceRows),
    []
  )
```

Call `reloadWorkspaces()` on mount, when the palette opens, and after each mutation.

```ts
  // The attention set the renderer already maintains from agent:state — see
  // agent-state-store.ts. This is the whole reason WORKSPACE_LIST returns
  // panelIds instead of a count: main does not hold this fact, and asking it
  // to recompute a set the renderer folds correctly would make main a second
  // author of a derived fact.
  const attentionIds = useAttentionIds()
```

and pass both into the `PaletteContext` the `commands` memo builds, adding them to its dependency array.

- [ ] **Step 4: Run and watch it pass**

```bash
npm run typecheck && npm run build && npm run verify:panels
```

Expected: `74/74 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer scripts/verify-panels.cjs
git commit -m "feat(m7): waiting counts on workspace rows

M6d's premise applied to the strongest case of an agent you cannot see:
not merely off screen, but on a canvas that is. Derived renderer-side by
intersecting each row's panelIds with the attention set the renderer
already maintains — no second channel, and no second author of a fact
one side already folds correctly."
```

---

### Task 8: Documentation catches up

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/ideas-backlog.md`

- [ ] **Step 1: Update the verify table in `CLAUDE.md`**

Amend the row for each suite with its new checks and count, in the file's established voice — naming *which* checks are worth knowing by number and *why*, not merely that they exist:

- `verify:layout`: 83 → **95 checks**, last number 93. Name 89 (the save race — `activate` writes the outgoing state into the OLD record, and the ordering is the whole mechanism), 91 (`allPanelIds` spans every workspace, because `PanelId` is a tmux session name), and 88 (never zero workspaces — `parseLayout`'s guarantee is a read-path one and `deleteWorkspace` is a write path).
- `verify:palette`: 60 → **66 checks**, last number 64. Name 64: the waiting count is in the title and *not* the haystack.
- `verify:panels`: 67 → **74 checks**, last number 70. Name 64 as the load-bearing one: *every other check in this milestone stays green against an implementation that disposes on switch.*
- `verify:ipc`: 20 → **25 channels**, newest being `workspace:activate`.

- [ ] **Step 2: Correct the dispose call-site count**

Find the "**Undo removing a panel must dispose its session**" section. It says three call sites and asks the reader to re-derive rather than trust. Change it to **four**, add the delete-workspace site, and keep the re-derivation warning — the warning is the load-bearing part, not the number. Record the grep output from Task 6 Step 6 as the evidence.

- [ ] **Step 3: Add the new load-bearing entries to `CLAUDE.md`**

Three, in the established voice:

1. **"A workspace switch is a second boot."** Everything derived from the starting state is re-derived; the registry is deliberately untouched, which is "two lifetimes, not one" at canvas scale.
2. **"`activateWorkspace` takes the outgoing canvas, and that parameter is the whole mechanism."** `save()` merges into whatever is active when it runs, on a 500ms debounce; a switch that merely flipped the id would write A's panels into B's record, and the file stays well-formed.
3. **"Panel ids are global, not per-workspace."** `nextIdRef` seeds from `allPanelIds` because `PanelId` doubles as the tmux session name — the M4a collision defect, reachable again through a door M4a could not see.

- [ ] **Step 4: Update `README.md`**

Add the milestone row:

```markdown
| M7 | Workspaces: named canvases, switching without disposing | ✅ done |
```

And, in the same honest register the README already uses for M6d's unbuilt surfaces, record what M7 deliberately did not build: **the merged all-in-one view** (it is the case that would exceed `LIVE_BUDGET`, which is a global cap on WebGL contexts, not a per-workspace one), **moving panels between workspaces** (its natural gesture is rubber-band selection, backlog #52, which does not exist), and **a switching keyboard shortcut** (`Cmd+0` and `Cmd+1` are taken, and a new chord is a guess until the switching frequency is known).

- [ ] **Step 5: Mark the backlog entry**

In `docs/ideas-backlog.md`, mark #2 as landed in M7, noting which of its three parts shipped and which did not, so the entry stays useful rather than looking wholly done.

- [ ] **Step 6: Run the whole chain**

```bash
npm run verify
```

Expected: every suite green. This is the gate; nothing claims done before it passes.

- [ ] **Step 7: Refresh the knowledge graph**

Per the global instruction, since `graphify-out/graph.json` exists:

```bash
graphify update .
```

Prose changed substantially in this task, so also consider a full `graphify .` — `update` is AST-only and the doc/concept layer goes stale silently.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md README.md docs/ideas-backlog.md graphify-out
git commit -m "docs(m7): CLAUDE.md and README catch up to workspaces

Three new load-bearing entries (a switch is a second boot; activate's
outgoing parameter IS the mechanism; panel ids are global), the dispose
call-site count corrected 3 -> 4 by grep rather than by trust, and the
verify table updated: layout 95, palette 66, panels 74, ipc 25.

README records what M7 deliberately did not build, in the same register
M6d's unbuilt notification/dock/sound surfaces already use."
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the five invokes and `WorkspaceRow` → Task 3 (with the type landing in Task 1, where its first consumer is); the store accessors and never-zero-workspaces → Task 1; the save race → Task 2; id uniqueness → Tasks 2 and 5; undo reset → Task 5; the palette section, scope, hidden-at-rest rows and waiting counts → Tasks 4 and 7; delete and the fourth dispose call site → Task 6; every documentation obligation → Task 8. The spec's eight success criteria are covered by checks 89/93 (1), 64 (2), 65 and the dormancy branch in Task 5 (3), 66 and 91 (4), 67 (5), 70 (6), 68/69 (7), and Task 8 Step 6 (8).

**Type consistency.** `WorkspaceRow` is `{ id, name, panelIds, active }` in Tasks 1, 3, 4 and 7. `ActivateResult` is `{ state, allPanelIds }` in Tasks 2, 3 and 5. The bridge member is `remove`, not `delete`, in Tasks 3 and 6. `PaletteActions` gains exactly `switchWorkspace`, `beginCreateWorkspace`, `beginRenameWorkspace`, `deleteWorkspace(id, name, liveCount)` in Task 4 and all four are implemented with those signatures in Tasks 5–6. `reloadWorkspaces` is introduced in Task 6 and consumed in Task 7, with a note preventing a second copy.

**Three assumptions, all checked against the code rather than left as hedges:**

1. **`restoreCamera` does not exist and must be built (Task 5).** `useViewport` returns exactly `{ viewport, resetViewport, worldCentre, centreOn }` — `setViewport` stays private, and none of the three verbs sets a camera outright. Task 5 therefore adds `restoreCamera(camera: PersistedCamera)` as the **fourth narrow verb**, beside the note in `useViewport.ts` that already explains why the setter is not exposed ("nothing outside should move the camera"). It must be a `useCallback` for the reason `resetViewport` and `centreOn` already are — an unstable identity propagates through `paletteActions`' `useMemo` into `Palette.tsx`'s `commands` memo, whose `[rows]` effect re-seats the selected row, and `Canvas` re-renders on every mousemove. Add it to the same dep arrays, and add a `verify:viewport` check (numbering continues from 72) that a restored camera reproduces the stored `x`/`y`/`scale` exactly — unlike `centreOn`, this verb **does** set the scale, because a workspace's saved zoom is part of what it means to come back to it.
2. **`verify-palette.cjs` already has the `ctx(...)` fixture builder**, at line 214. Task 4's checks use it as written; add `workspaces: []` and `attentionIds: []` to its defaults so the 58 existing checks keep compiling against the widened `PaletteContext`.
3. **`haystack` is currently module-private** (`const haystack = (c: Command): string => ...`). Task 4 exports it, because check 64 must assert what the matcher actually sees — a check that re-derived the haystack itself would pass against a `searchText` that had drifted, which is precisely the regression `searchText`'s own note records.
