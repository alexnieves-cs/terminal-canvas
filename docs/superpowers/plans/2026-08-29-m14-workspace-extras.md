# M17: The workspace extras M7 did not ship — Implementation Plan

**Number:** renumbered from M14 to M17 on merge — the credential boundary took
M14, the subagent nodes took M15 and the file panels took M16 by reaching `main`
first. The filename still says `m14` on purpose; see the design spec's "Number"
note. The `verify:*` check NUMBERS quoted in the body below are PLAN-TIME numbers
and several of them are now wrong: this milestone's `verify:panels` block was
renumbered three times on merge (to 138–151), its `verify:layout` checks once (to
118–124) and its `verify:palette` rows once (to 78–80). `CLAUDE.md`'s suite table is
the authority; this file is left as the record of what was planned.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all three pieces backlog #2 left open — a merged all-in-one view across every workspace, moving panels between workspaces, and a workspace-switching chord — plus the rubber-band marquee (#52's first third) that the move is blocked on.

**Architecture:** One new read channel (`workspace:merged`) hands the renderer every workspace's stored panels; a new pure module lays them out in per-workspace lanes for **display only**, so no workspace record ever gains a second writer. Geometry in the merged view is read-only for exactly that reason. Selection widens from one id to a `Set`, built by a background marquee, and a new write channel (`workspace:move-panels`) relocates a selection between workspace records without touching a single session.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React 18, esbuild-bundled plain-node verify suites. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-m14-workspace-extras-design.md` — read it before Task 1. Every "why" below is argued there; this plan is the "how".

## Global Constraints

These apply to every task. Most are load-bearing invariants whose violation is **silent** — no crash, no log — and each is stated in `CLAUDE.md` under the heading named.

- **A tier change must never reach `pty.kill`.** `pty.kill` has exactly two callers, both in `session-registry.ts`. `registry.dispose` has exactly five call sites in `Canvas.tsx`. **`verify:panels` 94 counts both by regex over the source text.** This milestone adds neither: the move relocates records, it does not dispose. If either number legitimately changes, update check 94 deliberately and say why in the commit. ("Two lifetimes, not one"; "Undo removing a panel must dispose its session".)
- **Nothing may spawn a process without a user gesture.** Any panel arriving from disk or from another workspace enters dormant unless `pty.list()` says it is already live, and the dormant set must be committed in the **same synchronous batch** as the panel array — never a render later. ("A workspace switch is a second boot".)
- **Every canvas shortcut is `Cmd`-gated**, and chords using Shift match on `event.code`, never `event.key`. ("Cmd is required for every canvas shortcut"; `verify:panels` 80.)
- **One history entry per committed gesture**, and operations that cross workspace records push none at all.
- **Panel ids are global, not per-workspace** — `PanelId` doubles as a tmux session name. The move mints no ids, so it cannot collide; do not add one.
- **`focusedId` stays a single id.** `assignTiers` pins the focused panel live unconditionally, so an uncleared or widened `focusedId` holds WebGL contexts and budget slots for the rest of the run.
- **A check that THROWS aborts the suite**, and every check after it never runs — so its RED is not evidence. Guard calls that may not exist (`if (row) row.run()`), and when writing checks test-first, confirm each new check's RED separately.
- **Verify suite numbering continues, never restarts:** `verify:layout` resumes at 109, `verify:palette` at 70, `verify:panels` at 118.
- **`npm run verify` must be green before any task is called done.** Individual suites during a task; the full chain before the commit that closes it.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/renderer/canvas/merged-layout.ts` | Pure: place every workspace's panels into non-overlapping lanes for display |
| `src/renderer/canvas/marquee.ts` | Pure: normalise a drag into a rect, and select the panels it intersects |
| `scripts/verify-merged.cjs` | Plain-node suite for both modules above |
| `scripts/merged-entry.cjs` | esbuild entry re-exporting both modules for that suite |
| `src/renderer/canvas/MergedLanes.tsx` | Renders lane headers in the world layer |
| `src/renderer/canvas/Marquee.tsx` | Renders the marquee rect in screen space |

**Modified:**

| File | Change |
|---|---|
| `src/main/layout-store.ts` | `mergedWorkspaces()`, `movePanels()` |
| `src/shared/ipc-contract.ts` | Two channels, `MergedWorkspace`, two bridge members |
| `src/preload/index.ts` | Two bridge implementations |
| `src/main/ipc.ts` | Two handlers |
| `src/renderer/canvas/Canvas.tsx` | `selectedIds`, marquee gesture, merged mode, move action, chords |
| `src/renderer/canvas/useViewport.ts` | Three chords |
| `src/renderer/palette/commands.ts` | Move rows, merged-view row |
| `src/renderer/shell/TopBar.tsx` | Merged-view toggle button |
| `src/renderer/styles.css` | Marquee, lane header (theme tokens only — `verify:styles` 1) |
| `README.md`, `CLAUDE.md`, `docs/ideas-backlog.md` | Docs, per Task 10 |

---

## Task 1: The store learns to read every workspace, and to move panels between them

Main owns workspace records; the renderer only ever holds the active workspace's array. Both new verbs therefore start here, with no IPC and no UI, testable under plain node.

**Files:**
- Modify: `src/main/layout-store.ts` (the returned object literal, near `workspaces()` at ~line 430)
- Modify: `src/shared/ipc-contract.ts` (the `MergedWorkspace` type only — the channels come in Task 2)
- Test: `scripts/verify-layout.cjs` (append checks 109–114)

**Interfaces:**
- Consumes: `LayoutSnapshot`, `Workspace extends CanvasState`, `PersistedPanel` from `@shared/layout-schema`; the existing `activeWorkspace()`, `allPanelIds()`, `scheduleWrite()` closures.
- Produces:
```ts
// src/shared/ipc-contract.ts
export interface MergedWorkspace {
  id: string
  name: string
  active: boolean
  panels: PersistedPanel[]
}

// src/main/layout-store.ts — on the LayoutStore interface
mergedWorkspaces(): MergedWorkspace[]
/** Moves panels between workspace records. Returns the target id, or null. */
movePanels(
  panelIds: string[],
  target: { workspaceId: string } | { newName: string }
): { workspaceId: string } | null
```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, before the summary. Match the file's existing `ok(n, pass, detail)` style and give each a **descriptive label** — checks 98–103 shipped with bare numeric ones and printed no title on failure, which `CLAUDE.md` records as a mistake not to repeat.

```js
/* ---- M17: reading every workspace, and moving panels between them ---- */

// 109. mergedWorkspaces() spans EVERY workspace and carries whole panels,
//      not the panelIds workspaces() carries. Both halves matter: a view
//      that could only see the active workspace is not a merged view, and
//      ids alone cannot be laid out because they have no geometry.
{
  const store = freshStore()
  const other = store.createWorkspace('School')
  store.save({ panels: [pp('n1', 0, 0)], camera: CAM, selectedId: null, focusedId: null })
  store.activateWorkspace(other, { panels: [pp('n1', 0, 0)], camera: CAM, selectedId: null, focusedId: null })
  store.save({ panels: [pp('n2', 40, 40)], camera: CAM, selectedId: null, focusedId: null })
  const merged = store.mergedWorkspaces()
  ok('109 mergedWorkspaces spans every workspace, with whole panels',
    merged.length === 2 &&
    merged.every((w) => Array.isArray(w.panels)) &&
    merged.flatMap((w) => w.panels.map((p) => p.id)).sort().join(',') === 'n1,n2' &&
    merged.filter((w) => w.active).length === 1,
    JSON.stringify(merged.map((w) => [w.name, w.active, w.panels.map((p) => p.id)])))
}

// 110. The returned panels are COPIES. A caller mutating what it was handed
//      must not reach the snapshot the store is about to serialise — the
//      rule workspaces() and presets() already obey. Here it is sharper:
//      the merged view's whole job is to OFFSET these rects for display, so
//      a shared reference means the display offset is written to disk.
{
  const store = freshStore()
  store.save({ panels: [pp('n1', 10, 20)], camera: CAM, selectedId: null, focusedId: null })
  const merged = store.mergedWorkspaces()
  merged[0].panels[0].x = 99999
  ok('110 mergedWorkspaces hands back copies, not the live snapshot',
    store.mergedWorkspaces()[0].panels[0].x === 10,
    String(store.mergedWorkspaces()[0].panels[0].x))
}

// 111. The move itself: the panel leaves the source record and arrives in
//      the target. Asserted as BOTH halves in one read, because a move that
//      only added would duplicate a panel id across two workspaces — and a
//      duplicate PanelId is two panels sharing one tmux session.
{
  const store = freshStore()
  const target = store.createWorkspace('School')
  store.save({ panels: [pp('n1', 0, 0), pp('n2', 40, 40)], camera: CAM, selectedId: null, focusedId: null })
  const result = store.movePanels(['n2'], { workspaceId: target })
  const byName = Object.fromEntries(store.mergedWorkspaces().map((w) => [w.name, w.panels.map((p) => p.id)]))
  ok('111 a moved panel leaves the source AND arrives in the target',
    result !== null && result.workspaceId === target &&
    byName['Main'].join(',') === 'n1' && byName['School'].join(',') === 'n2',
    JSON.stringify(byName))
}

// 112. allPanelIds is UNCHANGED across a move. The move mints no id and
//      destroys none — it relocates a record. nextIdRef is seeded from this
//      list, so a move that dropped an id from it would let a later Cmd+N
//      mint an id that is still live in another workspace, and `new-session
//      -A` would attach the new panel to the old panel's process.
{
  const store = freshStore()
  const target = store.createWorkspace('School')
  store.save({ panels: [pp('n1', 0, 0), pp('n7', 40, 40)], camera: CAM, selectedId: null, focusedId: null })
  const before = store.allPanelIds().slice().sort().join(',')
  store.movePanels(['n7'], { workspaceId: target })
  ok('112 allPanelIds is unchanged across a move',
    store.allPanelIds().slice().sort().join(',') === before,
    before + ' -> ' + store.allPanelIds().slice().sort().join(','))
}

// 113. An unknown target changes NOTHING and says so. A half-applied move —
//      panels removed, never delivered — loses them with no UI able to reach
//      them again, which is the orphan outcome the delete design rejects.
//      Same reasoning activateWorkspace's own unknown-id branch records.
{
  const store = freshStore()
  store.save({ panels: [pp('n1', 0, 0)], camera: CAM, selectedId: null, focusedId: null })
  const result = store.movePanels(['n1'], { workspaceId: 'w-nope' })
  ok('113 an unknown target moves nothing and returns null',
    result === null && store.mergedWorkspaces()[0].panels.map((p) => p.id).join(',') === 'n1',
    JSON.stringify(store.mergedWorkspaces().map((w) => w.panels.map((p) => p.id))))
}

// 114. Moving to a NEW name mints exactly ONE workspace and puts the panels
//      in it. Exactly-one is half the check: a mint per panel is the obvious
//      loop bug, and it produces N single-panel workspaces that look almost
//      right in the rail.
{
  const store = freshStore()
  store.save({ panels: [pp('n1', 0, 0), pp('n2', 40, 40)], camera: CAM, selectedId: null, focusedId: null })
  const before = store.workspaces().length
  const result = store.movePanels(['n1', 'n2'], { newName: 'Spike' })
  const made = store.mergedWorkspaces().find((w) => w.name === 'Spike')
  ok('114 a move to a new name mints exactly one workspace holding both panels',
    result !== null && store.workspaces().length === before + 1 &&
    made !== undefined && made.panels.map((p) => p.id).sort().join(',') === 'n1,n2' &&
    made.active === false,
    JSON.stringify(store.workspaces().map((w) => w.name)))
}
```

If `freshStore()`, `pp(...)` and `CAM` do not already exist as helpers in that file, define them next to the new block from whatever the surrounding checks already do (they construct a `LayoutStore` over a temp path and build `PersistedPanel` literals). Reuse the file's existing helpers if they are named differently — do **not** add a second set.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:layout`
Expected: FAIL on 109 — `store.mergedWorkspaces is not a function` would **throw** and abort the run, so wrap the new block's first line defensively or accept that only 109's failure is evidence and confirm 110–114 RED separately after `mergedWorkspaces` exists. Note in the commit which checks were watched failing.

- [ ] **Step 3: Implement both store members**

In `src/main/layout-store.ts`, add to the returned object literal next to `workspaces()`:

```ts
    /**
     * Every workspace's panels, for the merged view. workspaces() carries
     * panelIds because a rail row needs a count; this carries whole panels
     * because a lane needs geometry.
     *
     * The panels are COPIED, not referenced. The merged view's entire job is
     * to translate these rects into lanes for display, and a shared reference
     * would make that display offset the value the next coalesced save
     * serialises — a well-formed layout.json with the wrong rects in it,
     * found launches later, with nothing naming the view that caused it.
     */
    mergedWorkspaces() {
      return snapshot.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        active: w.id === snapshot.activeWorkspaceId,
        panels: w.panels.map((p) => ({ ...p }))
      }))
    },

    /**
     * Relocates panels between workspace records.
     *
     * It mints no PanelId and destroys none — allPanelIds is unchanged across
     * a move (check 112), which is what stops a later Cmd+N minting an id that
     * is still live somewhere else. It also touches NO SESSION: a moved panel
     * becomes a hidden workspace's panel with a running tmux session, which is
     * the state a workspace switch already produces ("demote, not dispose").
     *
     * Resolving the target BEFORE removing anything is the ordering that
     * matters: a half-applied move — removed, never delivered — loses panels
     * whose sessions keep running with no UI able to reach them, the orphan
     * outcome deleteWorkspace explicitly rejects.
     */
    movePanels(panelIds, target) {
      const wanted = new Set(panelIds)
      if (wanted.size === 0) return null

      let targetId: string
      if ('newName' in target) {
        targetId = this.createWorkspace(target.newName)
      } else {
        if (!snapshot.workspaces.some((w) => w.id === target.workspaceId)) return null
        targetId = target.workspaceId
      }

      const moving: PersistedPanel[] = []
      for (const w of snapshot.workspaces) {
        if (w.id === targetId) continue
        const keep = w.panels.filter((p) => !wanted.has(p.id))
        if (keep.length !== w.panels.length) {
          moving.push(...w.panels.filter((p) => wanted.has(p.id)))
          w.panels = keep
        }
      }
      if (moving.length === 0) return null

      const dest = snapshot.workspaces.find((w) => w.id === targetId)
      if (!dest) return null
      // The rect is carried unchanged. A moved panel lands where it was,
      // which may collide with something already in the target — visible the
      // next time the user switches there, and honest. Cascading it here
      // would move a panel the user did not ask to move.
      dest.panels = [...dest.panels, ...moving]

      // A moved panel must not stay named as the SOURCE workspace's
      // selection or focus: those ids are per-workspace state, and a
      // selectedId naming a panel the record no longer holds is restored on
      // the next switch as a selection nothing answers to.
      for (const w of snapshot.workspaces) {
        if (w.selectedId !== null && wanted.has(w.selectedId) && w.id !== targetId) w.selectedId = null
        if (w.focusedId !== null && wanted.has(w.focusedId) && w.id !== targetId) w.focusedId = null
      }

      scheduleWrite()
      return { workspaceId: targetId }
    },
```

Add both signatures to the `LayoutStore` interface (~line 90–135) with the same doc comments in short form, and add `MergedWorkspace` to `src/shared/ipc-contract.ts` importing `PersistedPanel` from `@shared/layout-schema` the way the file's other types do.

Note `this.createWorkspace` requires the object literal to be a plain object (it is). If the file's style avoids `this`, hoist `createWorkspace`'s body the way `doSave`/`doInitial` were hoisted for `activateWorkspace` and call the hoisted function — the file's own comment at ~line 257 explains why that hoisting exists, and this is the same situation.

- [ ] **Step 4: Run to verify they pass**

Run: `npm run verify:layout`
Expected: PASS, 118/118 (112 + 6).

- [ ] **Step 5: Fault-inject check 112, then commit**

Temporarily make `movePanels` drop the moved ids from `allPanelIds` (e.g. filter them out of `dest.panels`); confirm 112 goes RED; revert. This is the check with the most dangerous failure and the least visible one.

```bash
git add src/main/layout-store.ts src/shared/ipc-contract.ts scripts/verify-layout.cjs
git commit -m "feat(m14): the store reads every workspace, and moves panels between them"
```

---

## Task 2: Two channels, end to end

**Files:**
- Modify: `src/shared/ipc-contract.ts` (channels + bridge members)
- Modify: `src/preload/index.ts` (bridge implementations)
- Modify: `src/main/ipc.ts` (handlers)
- Modify: `README.md` (the channel diagram — `verify:meta` 14 fails otherwise)
- Test: `npm run verify:ipc`, `npm run verify:meta`

**Interfaces:**
- Consumes: `store.mergedWorkspaces()`, `store.movePanels()` from Task 1.
- Produces:
```ts
IPC.WORKSPACE_MERGED: 'workspace:merged'
IPC.WORKSPACE_MOVE_PANELS: 'workspace:move-panels'

// on WorkspaceBridge in the CanvasBridge type
merged(): Promise<MergedWorkspace[]>
movePanels(
  panelIds: PanelId[],
  target: { workspaceId: string } | { newName: string }
): Promise<{ workspaceId: string } | null>
```

- [ ] **Step 1: Add the channels and watch `verify:ipc` fail**

Add both to the `IPC` object in `src/shared/ipc-contract.ts`, beside the other `WORKSPACE_*` entries, each with a doc comment. `WORKSPACE_MERGED`'s should record why it is a second channel rather than a widening of `WORKSPACE_LIST`:

```ts
  /**
   * Every workspace's panels at once, for the merged view.
   *
   * A SECOND channel rather than a widening of WORKSPACE_LIST, which already
   * fires on mount, on every palette open, on every workspace mutation, on
   * every switch and on every panels.length change. Putting every panel of
   * every workspace on that payload makes a hot path fat to serve a mode
   * that is off almost always.
   *
   * Returns records, not display panels: the renderer places them into lanes
   * (merged-layout.ts), because lane placement is pure geometry over plain
   * data and belongs in the tier that can test it under plain node.
   */
  WORKSPACE_MERGED: 'workspace:merged',
  /**
   * Relocates panels between workspace records. Touches NO SESSION on either
   * side — a moved panel becomes a hidden workspace's panel with a running
   * tmux session, the state a switch already produces. See LayoutStore.movePanels.
   */
  WORKSPACE_MOVE_PANELS: 'workspace:move-panels',
```

Run: `npm run verify:ipc`
Expected: FAIL — the suite asserts every channel in `Object.values(IPC)` has an `ipcMain.handle`, so it names both as unhandled.

- [ ] **Step 2: Handlers, preload, bridge type**

`src/main/ipc.ts`, beside the other workspace handlers:

```ts
  ipcMain.handle(IPC.WORKSPACE_MERGED, (): MergedWorkspace[] => layoutStore.mergedWorkspaces())

  ipcMain.handle(
    IPC.WORKSPACE_MOVE_PANELS,
    (
      _event,
      panelIds: PanelId[],
      target: { workspaceId: string } | { newName: string }
    ): { workspaceId: string } | null => layoutStore.movePanels(panelIds, target)
  )
```

`src/preload/index.ts`, inside the existing `workspace` object:

```ts
    merged: () => ipcRenderer.invoke(IPC.WORKSPACE_MERGED),
    movePanels: (panelIds, target) =>
      ipcRenderer.invoke(IPC.WORKSPACE_MOVE_PANELS, panelIds, target),
```

And both members on the bridge type in `ipc-contract.ts`'s `workspace: { ... }` block.

- [ ] **Step 3: Add both channels to the README diagram**

`verify:meta` 14 asserts every channel string in the contract appears in the README, and it exists because the diagram has gone stale before. In `README.md`'s ASCII channel diagram, beside the existing workspace lines:

```
renderer --invoke--> workspace:merged / workspace:move-panels               --> main
```

Keep it inside the same fence — check 14's own comment records that splitting the diagram across two fences makes it fail loudly, which is intended.

- [ ] **Step 4: Run both suites**

Run: `npm run verify:ipc && npm run verify:meta`
Expected: `verify:ipc` PASS at 33 channels (it reports `1/1`, not "33 checks"). `verify:meta` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/ipc.ts README.md
git commit -m "feat(m14): workspace:merged and workspace:move-panels, 31 channels to 33"
```

---

## Task 3: `merged-layout.ts`, and the suite it needs

**Files:**
- Create: `src/renderer/canvas/merged-layout.ts`
- Create: `scripts/merged-entry.cjs`, `scripts/verify-merged.cjs`
- Modify: `package.json` (`verify:merged` script, and the `verify` chain — `verify:meta` 19 fails otherwise)
- Modify: `CLAUDE.md` (the suite table — do the full entry in Task 10, but add the row now so the table is never wrong mid-branch)

**Interfaces:**
- Consumes: `MergedWorkspace` (Task 2), `Panel`/`WorldRect` from `@renderer/panels/panels` and `@renderer/canvas/viewport`, `toPanels` from `@renderer/canvas/layout-adapt`.
- Produces:
```ts
export const LANE_GUTTER = 400
export const LANE_MIN_WIDTH = 800
export interface Lane {
  workspaceId: string; name: string; active: boolean
  origin: { x: number; y: number }; bounds: WorldRect
}
export interface MergedLayout { panels: Panel[]; lanes: Lane[] }
export function mergedLayout(workspaces: MergedWorkspace[]): MergedLayout
```

- [ ] **Step 1: Write the suite and its entry point**

`scripts/merged-entry.cjs`:

```js
// esbuild entry for verify:merged. Both modules are pure — no DOM, no
// electron, no node-pty — so they run in the cheapest tier the repo has.
module.exports = {
  ...require('../src/renderer/canvas/merged-layout.ts'),
  ...require('../src/renderer/canvas/marquee.ts')
}
```

`scripts/verify-merged.cjs`: copy `scripts/verify-rail.cjs`'s header verbatim (esbuild `buildSync` block, the `@shared`/`@renderer` aliases, the `ok()` helper, the summary/exit-code footer), pointing `entryPoints` at `merged-entry.cjs` and `outfile` at `out/verify/merged.cjs`. The aliases are required here and not pre-emptive: `merged-layout.ts` imports a real value (`toPanels`) from `@renderer`.

Then the checks:

```js
const ws = (id, name, active, panels) => ({ id, name, active, panels })
const p = (id, x, y, w = 720, h = 460) => ({ id, x, y, w, h, z: 1 })

// 1. The whole point: two workspaces whose panels overlap by construction
//    (both laid out around the origin, months apart, by two cameras that
//    never knew about each other) must not overlap after placement. This is
//    the obstacle M7's own paragraph misnamed as LIVE_BUDGET.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', true, [p('n1', 0, 0), p('n2', 100, 100)]),
    ws('w2', 'School', false, [p('n3', 0, 0), p('n4', 100, 100)])
  ])
  const rect = (id) => out.panels.find((q) => q.rect.id === id).rect
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  const cross = [['n1', 'n3'], ['n1', 'n4'], ['n2', 'n3'], ['n2', 'n4']]
  ok('1 panels from different workspaces never overlap',
    cross.every(([a, b]) => !overlaps(rect(a), rect(b))),
    JSON.stringify(cross.map(([a, b]) => [a, b, overlaps(rect(a), rect(b))])))
}

// 2. ...while each workspace's OWN arrangement survives intact. The
//    arrangement is the information worth preserving — a merged view that
//    re-flowed every panel into a grid would show the user a canvas they
//    have never seen. Asserted as a RELATIVE offset, which is the only thing
//    a lane translation may not change.
{
  const out = R.mergedLayout([ws('w2', 'School', false, [p('n3', 0, 0), p('n4', 250, 130)])])
  const a = out.panels.find((q) => q.rect.id === 'n3').rect
  const b = out.panels.find((q) => q.rect.id === 'n4').rect
  ok('2 a workspace\'s own relative geometry is preserved',
    b.x - a.x === 250 && b.y - a.y === 130, `${b.x - a.x},${b.y - a.y}`)
}

// 3. The active workspace's lane is FIRST, so toggling the mode does not
//    scroll the user away from the canvas they were looking at.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', false, [p('n1', 0, 0)]),
    ws('w2', 'School', true, [p('n3', 0, 0)])
  ])
  ok('3 the active workspace gets the first lane',
    out.lanes[0].workspaceId === 'w2' && out.lanes[0].active === true,
    out.lanes.map((l) => l.workspaceId).join(','))
}

// 4. An EMPTY workspace still gets a lane. It has no bounding box to derive
//    one from, so the obvious implementation drops it — and a workspace that
//    silently vanishes from the merged view reads as a workspace that was
//    deleted. It must disagree with neither the rail nor the palette about
//    how many workspaces exist.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', true, [p('n1', 0, 0)]),
    ws('w2', 'Empty', false, [])
  ])
  ok('4 an empty workspace still gets a lane',
    out.lanes.length === 2 && out.lanes.some((l) => l.workspaceId === 'w2'),
    out.lanes.map((l) => l.workspaceId).join(','))
}

// 5. Panels carry their REAL identity through. Only rect.x/rect.y are
//    synthetic — the id, spec, title and kind are the panel's own, which is
//    what lets the registry, agent state, edge pips, the rail and the
//    inspector all work on a foreign panel with no change at all.
{
  const out = R.mergedLayout([
    ws('w2', 'School', false, [{ ...p('n3', 0, 0), title: 'auth refactor' }])
  ])
  const panel = out.panels[0]
  ok('5 a merged panel keeps its real id, title and spec',
    panel.rect.id === 'n3' && panel.title === 'auth refactor' &&
    panel.spec !== undefined && panel.rect.w === 720,
    JSON.stringify({ id: panel.rect.id, title: panel.title }))
}

// 6. Purity and stability: the same input twice is byte-identical, and the
//    output depends on nothing but the input. A placement that consulted a
//    camera, a clock or a random seed would make lanes shuffle between
//    refetches, which reads as the canvas rearranging itself.
{
  const input = () => [
    ws('w1', 'Main', true, [p('n1', 0, 0)]),
    ws('w2', 'School', false, [p('n3', 30, 30)])
  ]
  ok('6 mergedLayout is pure — identical input, identical output',
    JSON.stringify(R.mergedLayout(input())) === JSON.stringify(R.mergedLayout(input())))
}

// 7. A lane's bounds CONTAIN every panel placed in it. The lane header and
//    any future lane chrome are drawn from bounds, so bounds that did not
//    contain the content would render a label floating away from the panels
//    it names.
{
  const out = R.mergedLayout([ws('w1', 'Main', true, [p('n1', 0, 0), p('n2', 300, 200)])])
  const lane = out.lanes[0]
  const inside = (r) =>
    r.x >= lane.bounds.x && r.y >= lane.bounds.y &&
    r.x + r.w <= lane.bounds.x + lane.bounds.w &&
    r.y + r.h <= lane.bounds.y + lane.bounds.h
  ok('7 every panel sits inside its own lane\'s bounds',
    out.panels.every((q) => inside(q.rect)),
    JSON.stringify(lane.bounds))
}
```

- [ ] **Step 2: Wire the suite and watch it fail**

Add to `package.json`:
```json
"verify:merged": "node scripts/verify-merged.cjs",
```
and insert `npm run verify:merged` into the `verify` chain, in the plain-node group between `verify:viewport` and `verify:registry`.

Run: `npm run verify:merged`
Expected: FAIL — esbuild cannot resolve `merged-layout.ts`. That is a build error, not an assertion failure; it is the honest RED for a module that does not exist.

- [ ] **Step 3: Implement `merged-layout.ts`**

```ts
import { toPanels } from './layout-adapt'
import type { MergedWorkspace } from '@shared/ipc-contract'
import type { Panel } from '@renderer/panels/panels'
import type { WorldRect } from './viewport'

/**
 * Places every workspace's panels into non-overlapping lanes, for DISPLAY
 * ONLY.
 *
 * The obstacle this module exists for is coordinates, not budget. Every
 * workspace stores its panels in the same world space, clustered around
 * wherever that canvas's camera has been, so two workspaces' panels overlap
 * by construction — not by a cascade collision, but because nothing has ever
 * kept them apart. cascadeCentre cannot help: it separates a new panel from a
 * coincident one within ONE array, and here the arrays were laid out
 * independently by two cameras that never knew about each other.
 *
 * Nothing here is ever written back. The returned rects are synthetic; the
 * ids, specs, titles and kinds are the panels' own, which is what lets every
 * existing consumer — the registry, agent state, edge pips, the rail, the
 * inspector — work on a foreign panel with no change at all. LayoutStore
 * .mergedWorkspaces() hands back copies precisely so this offset cannot reach
 * the snapshot the store serialises.
 *
 * Pure, like viewport.ts and lod.ts, and for the same reason: this is the
 * geometry most likely to be subtly wrong and least pleasant to debug through
 * a running WebGL canvas.
 */

/** World units between lanes. Wide enough to read as a gap at a fitted zoom. */
export const LANE_GUTTER = 400

/** An empty workspace has no bounding box; it still gets a lane this wide. */
export const LANE_MIN_WIDTH = 800

export interface Lane {
  workspaceId: string
  name: string
  active: boolean
  /** The translation applied to every panel of this workspace. */
  origin: { x: number; y: number }
  /** World rect containing every panel in the lane. Lane chrome draws from this. */
  bounds: WorldRect
}

export interface MergedLayout {
  panels: Panel[]
  lanes: Lane[]
}

export function mergedLayout(workspaces: MergedWorkspace[]): MergedLayout {
  // The ACTIVE workspace's lane comes first, so toggling the mode does not
  // scroll the user away from the canvas they were just looking at.
  const ordered = [...workspaces].sort((a, b) => Number(b.active) - Number(a.active))

  const panels: Panel[] = []
  const lanes: Lane[] = []
  let cursorX = 0

  for (const workspace of ordered) {
    const own = toPanels(workspace.panels)

    // An empty workspace has nothing to measure and still gets a lane: one
    // that vanished would read as a workspace that was deleted, and would
    // make the merged view disagree with the rail about how many exist.
    const box = boundingBox(own)
    const width = Math.max(box?.w ?? 0, LANE_MIN_WIDTH)

    // Translate so the workspace's own top-left lands at the lane's origin.
    // Relative geometry is untouched — the arrangement is the information
    // worth preserving.
    const origin = { x: cursorX - (box?.x ?? 0), y: -(box?.y ?? 0) }

    for (const panel of own) {
      panels.push({
        ...panel,
        rect: { ...panel.rect, x: panel.rect.x + origin.x, y: panel.rect.y + origin.y }
      })
    }

    lanes.push({
      workspaceId: workspace.id,
      name: workspace.name,
      active: workspace.active,
      origin,
      bounds: { id: workspace.id, x: cursorX, y: 0, w: width, h: box?.h ?? 0 }
    })

    cursorX += width + LANE_GUTTER
  }

  return { panels, lanes }
}

function boundingBox(panels: Panel[]): { x: number; y: number; w: number; h: number } | null {
  if (panels.length === 0) return null
  const left = Math.min(...panels.map((p) => p.rect.x))
  const top = Math.min(...panels.map((p) => p.rect.y))
  const right = Math.max(...panels.map((p) => p.rect.x + p.rect.w))
  const bottom = Math.max(...panels.map((p) => p.rect.y + p.rect.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}
```

If `WorldRect` has no `id` field, drop it from `bounds` and type `bounds` as `{x,y,w,h}` — adjust check 7 to match. Confirm against `viewport.ts` before writing.

- [ ] **Step 4: Run**

Run: `npm run verify:merged`
Expected: PASS 7/7 (checks 8–12 arrive in Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/merged-layout.ts scripts/merged-entry.cjs scripts/verify-merged.cjs package.json CLAUDE.md
git commit -m "feat(m14): lanes — the merged view's real obstacle was coordinates"
```

---

## Task 4: `marquee.ts`

**Files:**
- Create: `src/renderer/canvas/marquee.ts`
- Test: `scripts/verify-merged.cjs` (append checks 8–12)

**Interfaces:**
- Consumes: `WorldRect`, `Point` from `./viewport`.
- Produces:
```ts
export function marqueeRect(from: Point, to: Point): WorldRect   // id: 'marquee'
export function marqueeSelection(rect: WorldRect, panels: readonly WorldRect[]): string[]
```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-merged.cjs`:

```js
/* ---- the marquee ---- */
const r = (id, x, y, w = 100, h = 100) => ({ id, x, y, w, h })

// 8. A drag normalises in every direction. Dragging up-and-left is as
//    ordinary as down-and-right, and a rect with negative width selects
//    nothing at all — a marquee that only worked one way would look like an
//    intermittently broken gesture rather than a missing normalisation.
{
  const a = R.marqueeRect({ x: 300, y: 300 }, { x: 100, y: 100 })
  ok('8 a marquee normalises whichever way it is dragged',
    a.x === 100 && a.y === 100 && a.w === 200 && a.h === 200, JSON.stringify(a))
}

// 9. Selection is by INTERSECTION, not containment. A marquee that required
//    full containment could never select a panel bigger than the visible
//    canvas, which at ordinary zoom levels is most of them — a gesture that
//    silently does nothing on the common case.
{
  const picked = R.marqueeSelection(r('m', 50, 50, 20, 20), [r('n1', 0, 0, 720, 460)])
  ok('9 a marquee selects on intersection, not containment',
    picked.join(',') === 'n1', picked.join(','))
}

// 10. A panel merely TOUCHING the marquee's edge is not selected. Zero-area
//     overlap is what a user gets when they drag a marquee up against a panel
//     deliberately to exclude it, and selecting it there makes the gesture
//     feel imprecise in exactly the situation precision was intended.
{
  const picked = R.marqueeSelection(r('m', 100, 0, 50, 50), [r('n1', 0, 0, 100, 100)])
  ok('10 an edge-touching panel is not selected', picked.length === 0, picked.join(','))
}

// 11. Nothing intersected is an EMPTY selection, not a null and not the
//     previous one. A drag on empty space is how a user clears a selection.
{
  ok('11 a marquee over nothing selects nothing',
    R.marqueeSelection(r('m', 5000, 5000, 10, 10), [r('n1', 0, 0)]).length === 0)
}

// 12. Order follows the panels array, so a selection is stable across
//     re-renders rather than reordering under the user between the marquee
//     and the command that acts on it.
{
  const picked = R.marqueeSelection(r('m', -10, -10, 5000, 5000),
    [r('n1', 0, 0), r('n2', 200, 0), r('n3', 400, 0)])
  ok('12 selection order follows the panel array', picked.join(',') === 'n1,n2,n3', picked.join(','))
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:merged`
Expected: FAIL — esbuild cannot resolve `marquee.ts` (it is named in `merged-entry.cjs` from Task 3).

- [ ] **Step 3: Implement**

```ts
import type { Point, WorldRect } from './viewport'

/**
 * The rubber-band marquee's arithmetic. Pure, DOM-free, and separate from the
 * gesture that drives it for the same reason canvas-input.ts takes a plain
 * delta rather than a WheelEvent.
 */

/** Normalises a drag into a rect, whichever direction it was dragged. */
export function marqueeRect(from: Point, to: Point): WorldRect {
  return {
    id: 'marquee',
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(to.x - from.x),
    h: Math.abs(to.y - from.y)
  }
}

/**
 * Every panel the marquee INTERSECTS, in array order.
 *
 * Intersection rather than containment: a marquee requiring full containment
 * could never select a panel larger than the visible canvas, which at ordinary
 * zoom levels is most of them. Strict inequalities, so a panel merely touching
 * the marquee's edge is excluded — dragging up against a panel to leave it out
 * is a deliberate gesture and must work.
 */
export function marqueeSelection(rect: WorldRect, panels: readonly WorldRect[]): string[] {
  return panels
    .filter(
      (p) =>
        p.x < rect.x + rect.w &&
        p.x + p.w > rect.x &&
        p.y < rect.y + rect.h &&
        p.y + p.h > rect.y
    )
    .map((p) => p.id)
}
```

- [ ] **Step 4: Run**

Run: `npm run verify:merged`
Expected: PASS 12/12.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/marquee.ts scripts/verify-merged.cjs
git commit -m "feat(m14): the marquee's arithmetic, intersection and not containment"
```

---

## Task 5: `selectedId` becomes `selectedIds`

A pure refactor with **no behaviour change**. It ships on its own so that the marquee task that follows can be reviewed for behaviour rather than for a rename touching forty call sites.

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx`
- Test: the whole existing suite, unchanged

**Interfaces:**
- Produces (inside `Canvas.tsx`):
```ts
const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(...)
/** The one selected panel, or null when zero or many are selected. */
const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null
const selectOnly = (id: string | null) => setSelectedIds(id === null ? EMPTY : new Set([id]))
```

- [ ] **Step 1: Do the refactor**

- Replace the `selectedId` state (~line 316) with `selectedIds`, seeded from `initial.selectedId` (`new Set([initial.selectedId])` when non-null, else an empty set — hoist a module-level `const EMPTY_SELECTION: ReadonlySet<string> = new Set()` so an empty selection has a stable identity and cannot re-render on every set).
- Derive `selectedId` immediately below it, with the comment explaining that every existing reader wants "the one selected panel" and that a multi-selection correctly reads as none — the inspector's empty state is already a first-class state (`verify:rail` 27b).
- Replace every `setSelectedId(x)` with `selectOnly(x)`. Leave `setFocusedId` alone entirely.
- `.panel--selected` moves from `panel.rect.id === selectedId` to `selectedIds.has(panel.rect.id)`, which is the one place the widening is visible today (a single selection renders identically).
- `CanvasState.selectedId` — sent to main on save and on a switch — stays the single derived id. The on-disk format does not learn about multi-selection: a selection is transient gesture state, and persisting a set would make it a format promise nothing keeps (the reasoning `layout-schema.ts` already records for prompt placeholders).

- [ ] **Step 2: Run the full suite**

Run: `npm run verify`
Expected: PASS, every suite at its existing count — 135/135 for `verify:panels`. A refactor that changed behaviour shows up here.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx
git commit -m "refactor(m14): selection widens to a set, with no behaviour change"
```

---

## Task 6: The marquee gesture

**Files:**
- Create: `src/renderer/canvas/Marquee.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx` (background `onMouseDown` ~line 1392)
- Modify: `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (checks 118–120)

**Interfaces:**
- Consumes: `marqueeRect`, `marqueeSelection` (Task 4); `selectedIds`, `selectOnly`, `setSelectedIds` (Task 5).
- Produces: `<Marquee rect={screenRect | null} />`, rendered as a sibling of `.world`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`. Drive real drags with `wc.sendInputEvent` mouseDown/mouseMove/mouseUp — a dispatched `MouseEvent` is untrusted and cannot prove what the browser would do, the limit checks 47 and 75c already record.

```js
// 118. The marquee selects several panels in one gesture. Asserted as the
//      COUNT of .panel--selected, because a marquee that selected only the
//      last panel it touched would still leave one selected and look almost
//      right.
// 119. A drag starting on a CARDED panel selects it and draws no marquee.
//      The background onMouseDown is not "empty space": a carded panel has no
//      chrome handler of its own, so its click falls through here and is
//      resolved by hitTest. A marquee that started on any background mousedown
//      would rubber-band instead of selecting, every time a user clicked a
//      card — and cards are most of the canvas at LIVE_BUDGET.
// 120. A marquee still RELEASES FOCUS, the job the background handler already
//      had. assignTiers pins the focused panel live unconditionally, so a
//      gesture that forgot this holds a WebGL context and a budget slot for
//      the rest of the run, however far the user pans away. Read focusedId
//      out of the DOM (no element inside a .panel holds document.activeElement)
//      rather than through a test hook.
```

Write these three against the real fixture the surrounding checks use; assert `document.querySelectorAll('.panel--selected').length` for 118/119 and `document.activeElement.closest('.panel') === null` for 120, and additionally that `.canvas-marquee` is absent after 119's drag.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run verify:panels`
Expected: FAIL on 118 (one panel selected, or zero) and on the `.canvas-marquee` clause. Confirm each RED individually — a throw in 118 would take 119 and 120 with it.

- [ ] **Step 3: Implement the gesture**

In `Canvas.tsx`'s background `onMouseDown`, keep the existing `hitTest` branch exactly as it is and add the marquee to the `else`:

```tsx
  const onMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    const world = toWorld(event)
    const hit = world ? hitTest(hitOrder, world) : null
    if (hit) {
      // Unchanged. A CARDED panel has no chrome handler of its own, so its
      // click arrives here — which is why the marquee lives in the else and
      // not at the top of this function. Starting a marquee on any background
      // mousedown would rubber-band instead of selecting a card, and cards are
      // most of the canvas once LIVE_BUDGET is spent.
      onSelectPanel(hit)
    } else {
      selectOnly(null)
      if (world) marqueeFromRef.current = world
    }
    // Unchanged, and load-bearing: assignTiers pins the focused panel live
    // unconditionally, so an uncleared focusedId holds a WebGL context and a
    // budget slot for the rest of the run. A marquee must not become the drag
    // that forgot to release it.
    setFocusedId(null)
  }
```

Track the drag with `mousemove`/`mouseup` listeners installed on `document` for the duration of the gesture — the same reason `installPointerCorrection` binds to the document rather than the panel: the cursor spends most of a marquee outside the element it started in. On each move, recompute `marqueeRect(from, currentWorld)`, store it in state for rendering, and set `setSelectedIds(new Set(marqueeSelection(rect, panels.map((p) => p.rect))))`. On mouseup, clear the rect and the ref. Push **no** history entry — selection is not a panel-array change.

Do **not** run the marquee while `merged` is true (Task 8) or while `palette.isOpen()`.

`Marquee.tsx` renders a single absolutely-positioned `<div className="canvas-marquee">` from a **screen-space** rect, mounted as a sibling of `.world` next to `EdgeIndicators` — inside `.world` it would scale with the zoom and stop tracking the pointer, the same reason the edge pips live outside it.

In `styles.css`, style `.canvas-marquee` using existing theme tokens only. `verify:styles` 1 rejects any hardcoded colour in any notation outside a theme block, 3 rejects fractional `opacity`, and 4–6 reject literal type/radius/spacing values.

- [ ] **Step 4: Run**

Run: `npm run verify:panels && npm run verify:styles`
Expected: PASS, `verify:panels` at 138.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/Marquee.tsx src/renderer/canvas/Canvas.tsx src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m14): a rubber-band marquee that still releases focus"
```

---

## Task 7: The move

**Files:**
- Modify: `src/renderer/palette/commands.ts` (move rows + a `workspace` scope door)
- Modify: `src/renderer/canvas/Canvas.tsx` (`movePanelsToWorkspace` action)
- Test: `scripts/verify-palette.cjs` (checks 70–72), `scripts/verify-panels.cjs` (checks 121–122)

**Interfaces:**
- Consumes: `window.canvas.workspace.movePanels` (Task 2); `selectedIds` (Task 5).
- Produces:
```ts
// PaletteActions
movePanelsToWorkspace(panelIds: string[], target: { workspaceId: string } | { newName: string }): void
// CommandInput additions
selectedIds: string[]
// exported reasons, compared as constants and never as string literals
export const REASON_NO_SELECTION = 'Select panels with a rubber-band drag first'
```

- [ ] **Step 1: Write the failing palette checks**

```js
// 70. A move row exists per OTHER workspace, and the selection's own
//     workspace is not among them. Moving panels to where they already are
//     is a no-op wearing the costume of a verb.
// 71. With an empty selection the rows are present and DISABLED with a
//     reason, never absent — verify:palette 31's rule: a row that disappears
//     is indistinguishable from a feature that was never built. Compared
//     against the EXPORTED constant, not a string literal, which would keep
//     passing while the text the user reads said something else.
// 72. "Move to new workspace…" is present and enters text input rather than
//     running immediately — the two-step shape beginRenamePreset already
//     uses, so Escape is a real cancel.
```

Run: `npm run verify:palette` → FAIL.

- [ ] **Step 2: Write the failing end-to-end checks**

```js
// 121. THE CHECK THIS TASK EXISTS FOR: the moved panel's pid is UNCHANGED.
//      Every other observable stays correct against a move that quietly
//      disposed and respawned — the panel leaves this canvas either way, the
//      record is right either way, the rail is right either way — and only
//      the pid separates them. This is verify:panels 64's argument reaching a
//      third door. Read pids from pty:list before and after; assert the moved
//      panel's is identical AND that it is still listed at all.
// 122. Cmd+Z immediately after a move is INERT. The undo stack is one stack
//      over one Panel[], and applyHistory disposes any panel the undone state
//      no longer contains — which reaches pty.kill. An undo here would either
//      resurrect panels main's record no longer lists, or kill sessions that
//      now belong to another workspace. Assert the panel count is unchanged
//      AND every pid survives.
```

Run: `npm run verify:panels` → FAIL.

- [ ] **Step 3: Implement**

`Canvas.tsx`:

```tsx
  const movePanelsToWorkspace = useCallback(
    (panelIds: string[], target: { workspaceId: string } | { newName: string }): void => {
      if (panelIds.length === 0) return
      void (async (): Promise<void> => {
        const result = await window.canvas.workspace.movePanels(panelIds, target)
        // Null means the target named nothing and main changed nothing — a
        // stale palette row, or a workspace deleted out from under an
        // in-flight move. Neither does this. Same branch activateWorkspace's
        // own unknown-id case takes, for the same reason.
        if (!result) return
        const moved = new Set(panelIds)
        // NO registry.dispose, and no pty.kill. A moved panel becomes a
        // hidden workspace's panel with a running tmux session — the exact
        // state a workspace switch already produces ("demote, not dispose").
        // Disposing here would kill an agent as a side effect of filing it.
        setPanels((current) => current.filter((p) => !moved.has(p.rect.id)))
        setSelectedIds(EMPTY_SELECTION)
        if (focusedId !== null && moved.has(focusedId)) setFocusedId(null)
        // NO commitHistory. The stack moves panels within ONE canvas, and
        // applyHistory disposes any panel an undone state no longer holds —
        // which reaches pty.kill. Cmd+Z after a move doing nothing is the
        // honest failure; doing something kills another workspace's agents.
        // Same ruling M9c's commit records for the same reason.
        reloadWorkspaces()
      })()
    },
    [focusedId, reloadWorkspaces]
  )
```

Add it to `paletteActions` and to `PaletteActions`. In `commands.ts`, emit one `workspace.move` row per workspace other than the active one, plus a `workspace.move-new` row carrying `entersScope`-free two-step input mode; give both `destructive: false`, `hiddenAtRest: true` and `scope: 'workspaces'`, and a `disabledReason` of `REASON_NO_SELECTION` when `selectedIds` is empty.

- [ ] **Step 4: Run**

Run: `npm run verify:palette && npm run verify:panels`
Expected: PASS at 77 and 140.

- [ ] **Step 5: Fault-inject 121, then commit**

Add a `registry.dispose(id)` into the move's loop; confirm 121 goes RED with a changed pid while every other check stays green; revert. Then confirm `verify:panels` 94's two source-text counts are unchanged (five `registry.dispose` sites, two `pty.kill` callers) — if the injection left a stray call, 94 catches it.

```bash
git add src/renderer/canvas/Canvas.tsx src/renderer/palette/commands.ts scripts/verify-palette.cjs scripts/verify-panels.cjs
git commit -m "feat(m14): move panels between workspaces without killing anything"
```

---

## Task 8: The merged view

**Files:**
- Create: `src/renderer/canvas/MergedLanes.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`, `src/renderer/shell/TopBar.tsx`, `src/renderer/palette/commands.ts`, `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (checks 123–126)

**Interfaces:**
- Consumes: `mergedLayout` (Task 3), `window.canvas.workspace.merged` (Task 2).
- Produces: `PaletteActions.toggleMerged(): void`; `<MergedLanes lanes={Lane[]} />`.

- [ ] **Step 1: Write the failing checks**

```js
// 123. Entering the merged view SPAWNS NOTHING. Seed a second workspace with
//      panels on disk, enter merged, and assert pty:list's count is unchanged.
//      This is the milestone's most dangerous line: getting the dormant set a
//      render late launches up to LIVE_BUDGET agent CLIs with no user gesture,
//      because registry.ensure early-returns for a session that already
//      exists and a later correction can never repair it. Seed the second
//      workspace with a persisted focusedId, the way check 68 does — a
//      focused panel is pinned live unconditionally, so this forces the
//      failure rather than hoping a cull coincidence produces it.
// 124. Foreign panels are actually RENDERED and are addressable: assert a
//      .panel exists for the second workspace's panel id, and that a lane
//      header naming that workspace is on screen. Without this, 123 passes
//      vacuously against a merged view that renders nothing at all.
// 125. Nothing is draggable: mousedown-drag a merged panel's chrome and
//      assert its rect is unchanged, and that no close button is rendered.
// 126. Every workspace's STORED rects are byte-identical after a merged
//      session. Read layout.json (or workspace:merged) before and after
//      entering, panning, selecting and leaving. This is the check for the
//      failure the read-only design exists to prevent, and it is the one that
//      would otherwise be found launches later with nothing to blame.
```

Run: `npm run verify:panels` → FAIL.

- [ ] **Step 2: Implement the mode**

In `Canvas.tsx`:

```tsx
  const [merged, setMerged] = useState(false)
  const [mergedData, setMergedData] = useState<MergedWorkspace[] | null>(null)

  const enterMerged = useCallback((): void => {
    void (async (): Promise<void> => {
      const workspaces = await window.canvas.workspace.merged()
      // Resolved BEFORE the merged array is committed, and committed in the
      // SAME synchronous block — the ordering switchWorkspace's doc comment
      // spells out at length. registry.ensure early-returns for a session
      // that already exists, so a dormantIds correction arriving one render
      // later can NEVER repair a session already created non-dormant:
      // lod.ts promotes it, the registry's own dormancy guard passes, and
      // attachSlot spawns. Up to LIVE_BUDGET agents, from a view toggle.
      let dormant: Set<string>
      try {
        const sessions = await window.canvas.pty.list()
        const live = new Set(sessions.map((s) => s.panelId))
        dormant = new Set(
          workspaces.flatMap((w) => w.panels.map((p) => p.id)).filter((id) => !live.has(id))
        )
      } catch (error: unknown) {
        // The same failure DIRECTION boot() and switchWorkspace both choose:
        // everything dormant means nothing spawns, which is the safe side.
        console.warn('[merged] could not list live sessions; every panel dormant', error)
        dormant = new Set(workspaces.flatMap((w) => w.panels.map((p) => p.id)))
      }
      setMergedData(workspaces)
      setDormantIds(dormant)
      setMerged(true)
    })()
  }, [])
```

Leaving restores: `setMerged(false)`, `setMergedData(null)`, and re-derive `dormantIds` for the active workspace from a fresh `pty.list()` under the identical rule. **Do not** carry the merged dormant set back — it names ids this canvas does not hold, and the set is re-derived on every entry anyway (`switchWorkspace`'s own comment makes the same point about replacing rather than merging).

Then:

```tsx
  const mergedView = useMemo(
    () => (mergedData ? mergedLayout(mergedData) : null),
    [mergedData]
  )
  // What is RENDERED and TIERED. `panels` stays the active workspace's real
  // array and remains the ONLY thing the layout.save effect ever writes —
  // that split is what keeps the number of writers to a workspace record at
  // one, which is the whole reason geometry here is read-only.
  const displayPanels = merged && mergedView ? mergedView.panels : panels
```

Route the tiering memo, the rendered panel list, `hitOrder` and `railRows` through `displayPanels`. Leave the `layout.save` effect reading `panels`, untouched.

Gate the mutating gestures on `!merged`: `onDragPanel`/`onCommit`, the resize handles, and `TerminalPanel`'s close button (pass `closable={!merged}`). Refetch `workspace:merged` when `panels.length` changes so a `Cmd+N` while merged appears in the active lane.

`MergedLanes.tsx` renders one header per lane **inside** `.world` — a lane header labels a world region and should scale with it, unlike the edge pips, which must not. Style it from theme tokens only.

Add the toolbar button (`TopBar.tsx`, mounting `shellControl()` so it takes neither DOM focus nor `focusedId`) and a palette row calling `toggleMerged`.

- [ ] **Step 3: Run**

Run: `npm run verify:panels`
Expected: PASS at 144.

- [ ] **Step 4: Fault-inject 123, then commit**

Move `setMergedData`/`setMerged` above the `await pty.list()` so the dormant set lands a render late; confirm 123 goes RED with a higher session count; revert.

```bash
git add src/renderer/canvas/MergedLanes.tsx src/renderer/canvas/Canvas.tsx src/renderer/shell/TopBar.tsx src/renderer/palette/commands.ts src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m14): the merged view — every workspace at once, geometry read-only"
```

---

## Task 9: The three chords

**Files:**
- Modify: `src/renderer/canvas/useViewport.ts`
- Test: `scripts/verify-panels.cjs` (checks 127–129)

- [ ] **Step 1: Write the failing checks**

```js
// 127. Cmd+Shift+] switches to the next workspace and Cmd+Shift+[ comes back,
//      wrapping. Delivered as macOS actually delivers them — { key: '}',
//      code: 'BracketRight', metaKey: true, shiftKey: true } — because Shift
//      REWRITES the printed character. A key === ']' test is dead on arrival
//      and a key === '}' test is correct on a US layout and wrong everywhere
//      else, which is the worse failure because it works for whoever wrote
//      it. verify:panels 80 is the same lesson for the inspector chord.
// 128. Held, they move exactly ONE step: five repeat:true keydowns after the
//      real one switch once. Neither chord joins REPEATABLE_KEYS — a held
//      switch steps through every canvas at the OS repeat rate and lands
//      wherever the stream stopped. Like 7b/33b/75b this supplies repeat:true
//      BY HAND, so it proves the guard READS the flag and says nothing about
//      who sets it.
// 129. Cmd+Shift+A toggles the merged view, and pressing it twice returns to
//      the active workspace's own canvas with its camera restored.
```

Run: `npm run verify:panels` → FAIL.

- [ ] **Step 2: Implement**

In `useViewport.ts`'s keydown listener, beside the existing chords:

```ts
      // event.code, never event.key: Shift rewrites the printed character, so
      // Cmd+Shift+[ arrives as '{'. A key-based test is either dead on
      // arrival or silently US-layout-only. Same rule the inspector chord
      // already obeys (verify:panels 80).
      if (event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey) {
        if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
          event.preventDefault()
          // preventDefault BEFORE the repeat bail, the ordering usePalette.ts
          // uses: this is a chord that IS ours and we are declining to act
          // on, so its tail must still be swallowed rather than leaking to
          // the focused agent's PTY.
          if (event.repeat) return
          stepWorkspace(event.code === 'BracketRight' ? 1 : -1)
          return
        }
        if (event.code === 'KeyA') {
          event.preventDefault()
          if (event.repeat) return
          toggleMerged()
          return
        }
      }
```

`stepWorkspace` walks `workspaceRows` in list order from the active index, wrapping, and calls `switchWorkspace`. All three stand down while the palette is open, through the `shouldIgnoreKeys` path the hook already consults.

- [ ] **Step 3: Run and commit**

Run: `npm run verify:panels`
Expected: PASS at 147.

```bash
git add src/renderer/canvas/useViewport.ts scripts/verify-panels.cjs
git commit -m "feat(m14): three chords, matched on event.code because Shift rewrites the key"
```

---

## Task 10: The documentation the next reader needs

The repo's own convention: `CLAUDE.md` records the *silent* failure each invariant prevents, and shipped backlog entries are deleted rather than ticked.

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/ideas-backlog.md`

- [ ] **Step 1: `CLAUDE.md`**

Add to the suite table: a `verify:merged` row (12 checks, naming 1 and 4 as the ones worth knowing by number), and re-derive the new counts for `verify:layout` (118), `verify:palette` (77), `verify:panels` (147) and `verify:ipc` (33 channels, still reporting `1/1`) **from real output**, not from this plan.

Add these load-bearing entries:

- **"The merged view's obstacle is coordinates, not budget"** — why `LIVE_BUDGET` being global is the answer rather than the problem, and why `cascadeCentre` cannot separate two workspaces' panels.
- **"The merged view has no writer, and that is why geometry is read-only"** — `panels` stays the only thing `layout.save` writes; `mergedWorkspaces()` hands back copies; the failure prevented is a well-formed `layout.json` with display offsets in it.
- **"Entering the merged view resolves dormancy before it commits"** — the `switchWorkspace` ordering rule reaching a third door, with the mass-spawn it prevents.
- **"A move touches no session and pushes no history"** — both halves and their failures, and the note that `registry.dispose`'s five call sites and `pty.kill`'s two callers are unchanged by this milestone.
- **"The marquee starts only where `hitTest` finds nothing"** — a carded panel's click falls through to the background handler, and the focus-release rule the gesture inherits.
- **"The workspace chords match `event.code`"** — Shift rewrites the character; the US-layout-only failure is the worse one.

Add to the plain-node tier paragraph why `merged-layout.ts` and `marquee.ts` qualify — and note that `verify-merged.cjs`'s aliases are **required**, not pre-emptive, because `merged-layout.ts` imports a real value (`toPanels`) from `@renderer`, unlike `verify-rail.cjs`'s.

- [ ] **Step 2: `README.md`**

Add an M17 row to the milestone table and a paragraph in the prose section. Rewrite the M7 paragraph's "three things this milestone deliberately did not build" so it names M17 as where each landed — and say plainly that its stated reason for the merged view was the wrong one, since a reason recorded and never corrected is the kind of thing this file exists to prevent.

- [ ] **Step 3: `docs/ideas-backlog.md`**

- **Delete #2** and add it to the "numbers that are gone" table: `| #2 the workspace extras M7 did not ship | M17 | "The merged view's obstacle is coordinates, not budget", "A move touches no session and pushes no history" |`.
- **Rewrite #52** down to shift-click and group drag, keeping the `applyDrag`-per-member and one-history-push constraints and noting that its background-mousedown focus-release constraint is discharged.
- Update the "Six more entries were rewritten" sentence, which currently names #2 as one of them.
- Add a line to **#21** and **#25** noting a selection now exists, marquee-built.

- [ ] **Step 4: Full verify, then commit**

Run: `npm run verify`
Expected: every suite green.

```bash
git add CLAUDE.md README.md docs/ideas-backlog.md
git commit -m "docs(m14): the merged view's real obstacle, and #2 leaves the backlog"
```

---

## Self-Review

**Spec coverage.** Merged view → Tasks 3, 8. Marquee → Tasks 4, 6. Move → Tasks 1, 2, 7. Chords → Task 9. Read-only geometry → Task 8 step 2 + check 126. Dormancy → Task 8 + check 123. `verify:merged` → Task 3. Backlog consequences → Task 10. Every "What can go wrong" row has a check: spawn (123), pid (121), rects (126), card-marquee (119), focus (120), undo (122), empty lane (`verify:merged` 4).

**Two known gaps, deliberate.** The spec's "no merged-view camera of its own — a `Cmd+1`-style fit on entry" is not given its own check; it is cosmetic and covered by 124's lane header being on screen. And the spec's claim that a selection cannot span workspaces is structural (the marquee is gated off in merged mode, Task 6 step 3) rather than asserted — the channel takes ids and does not assume it, so a future caller could violate it.

**Numbering.** `verify:layout` 109–114, `verify:merged` 1–12, `verify:palette` 70–72, `verify:panels` 118–129. Final expected counts: layout 118, merged 12, palette 77, panels 147, ipc 33 channels.
