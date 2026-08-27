# M8a Shell Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the canvas in a persistent, collapsible app frame — a top bar with visible spawn, zoom, search and settings controls, plus empty rail and inspector regions that M8b–M8d fill.

**Architecture:** `Canvas.tsx`'s returned tree gains an outer `.shell` CSS grid whose middle cell is the existing `.canvas` host; the rail and inspector are grid columns that take real width, so the canvas *insets* rather than being overlaid. The shell's components are presentational and live in `src/renderer/shell/`, receiving already-derived props and calling `PaletteActions` — the verb surface that already exists — so the shell is a second view, never a second implementation. Collapse state lives in the existing `preferences` map as two new `SettingDef`s, so persistence, palette rows and schema validation come for free.

**Tech Stack:** Electron 43, React 19 (no StrictMode), TypeScript, CSS grid, plain-node + real-Electron verify suites.

**Spec:** `docs/superpowers/specs/2026-08-27-m8-app-shell-design.md`

## Global Constraints

- **The shell never owns canvas state.** Rail, inspector and top bar receive derived props and call `PaletteActions` members. A row or button that needs a verb which does not exist adds it to `PaletteActions`, never reimplements it locally.
- **A shell control must never take DOM focus.** Every control mounts `shellControl()` (Task 4), whose `onMouseDown` calls `preventDefault()`. Focus never leaves xterm's hidden textarea, so `focusedId` stays pinned, the panel stays live, and `Cmd+C`/`Cmd+V` keep their target.
- **Cmd is required for every shell chord**, same rule as every canvas shortcut, and shell chords stand down while the palette is open (`palette.isOpen()`).
- **New chords are excluded from auto-repeat.** `event.repeat` bails, and `preventDefault()` runs *before* the bail so the tail of a held chord is swallowed rather than leaking to the focused agent's PTY.
- **The `setViewport` setter stays private.** Camera work reaches `useViewport` as named verbs only.
- **`preset:spawn-by-id` is the only spawn path.** Only main can resolve an absent `command` into the user's login shell.
- **No new IPC channel.** `verify:ipc` stays at 20 channels.
- **`npm run verify` must be green** at the end of every task that touches source.
- Check numbering after this milestone: `verify:layout` **85 checks, last number 83**; `verify:panels` **75 checks, last number 69**.

## File Structure

**Create:**
- `src/renderer/shell/shell-control.ts` — the focus-preserving handler pair every shell control mounts. Pure, no React import beyond the event type.
- `src/renderer/shell/useShellChrome.ts` — rail/inspector open state, its persistence through `settings:set`, and the two chords. The only stateful shell module.
- `src/renderer/shell/TopBar.tsx` — spawn split-button, zoom cluster, search, settings. Presentational.
- `src/renderer/shell/SideRail.tsx` — header and an empty body in M8a; M8b–M8d fill it.
- `src/renderer/shell/Inspector.tsx` — header and an empty body in M8a; M8c fills it.

**Modify:**
- `src/shared/settings-schema.ts` — two new `SettingDef`s and a `SHELL_CATEGORY`.
- `src/renderer/canvas/useViewport.ts` — two new named verbs, `zoomBy` and `fitAll`.
- `src/renderer/canvas/Canvas.tsx` — render the frame, move `onMouseDownCapture` to `.shell`, load presets at mount.
- `src/renderer/styles.css` — the grid, the collapsed variants, the shell's chrome.
- `scripts/verify-layout.cjs` — checks 82–83.
- `scripts/verify-panels.cjs` — checks 64–69.
- `CLAUDE.md`, `README.md` — the milestone row and the check counts.

---

### Task 1: The two shell settings

**Files:**
- Modify: `src/shared/settings-schema.ts`
- Test: `scripts/verify-layout.cjs`

**Interfaces:**
- Consumes: `SettingDef`, `SETTINGS`, `settingDef(id)`, `createLayoutStore` — all existing.
- Produces: `SHELL_CATEGORY` (exported const, `'Shell'`); setting ids `'shell.railOpen'` and `'shell.inspectorOpen'`, both `type: 'boolean'`, both `default: true`. Task 4 reads and writes them.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, immediately before the `console.log('\n' + '='.repeat(60))` line at the end of the file:

```js
// 82. M8a's rail toggle. Declared like every other def and round-tripping
//     through a write and a reopen. The keywords carry more weight here than
//     usual: a user who wants the sidebar back has no vocabulary for "rail",
//     so "sidebar" and "panel list" have to be in the haystack or the switch
//     is reachable only by someone who already knows its name.
{
  const def = L.settingDef('shell.railOpen')
  const declared = def !== undefined && def.type === 'boolean' && def.default === true &&
    def.category === L.SHELL_CATEGORY &&
    typeof def.label === 'string' && def.label.length > 0 &&
    typeof def.description === 'string' && def.description.length > 0 &&
    Array.isArray(def.keywords) && def.keywords.includes('sidebar')
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  a.setPreference('shell.railOpen', false)
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('82 shell.railOpen is declared and round-trips',
    declared && b.getSetting('shell.railOpen') === false,
    `declared=${declared} reopened=${b.getSetting('shell.railOpen')}`)
}

// 83. The inspector toggle, and the half that is not a copy of 82: the two
//     ids are INDEPENDENT. One sparse map holds both, and writing one must
//     not disturb the other — a shared key, or a def whose id was pasted from
//     its neighbour, produces two switches that move together and looks like
//     a rendering bug rather than a schema one.
{
  const def = L.settingDef('shell.inspectorOpen')
  const declared = def !== undefined && def.type === 'boolean' && def.default === true &&
    def.category === L.SHELL_CATEGORY &&
    typeof def.label === 'string' && def.label.length > 0 &&
    typeof def.description === 'string' && def.description.length > 0 &&
    Array.isArray(def.keywords) && def.keywords.length > 0
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  a.setPreference('shell.inspectorOpen', false)
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('83 shell.inspectorOpen is declared, round-trips, and is independent of the rail',
    declared && b.getSetting('shell.inspectorOpen') === false &&
      b.getSetting('shell.railOpen') === true,
    `declared=${declared} inspector=${b.getSetting('shell.inspectorOpen')} rail=${b.getSetting('shell.railOpen')}`)
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:layout`
Expected: FAIL. `82` and `83` both fail with `declared=false`, because `L.SHELL_CATEGORY` is `undefined` and `settingDef` returns `undefined` for both ids. The report prints `83/85 passed` and `FAILED: 82 ..., 83 ...`.

- [ ] **Step 3: Add the category and the two defs**

In `src/shared/settings-schema.ts`, add beside `AGENT_CATEGORY`:

```ts
/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const SHELL_CATEGORY = 'Shell'
```

and append these two entries to the `SETTINGS` array, after `agent.edgeIndicators`:

```ts
  {
    id: 'shell.railOpen',
    label: 'Show the side rail',
    description: 'Keep the left rail open beside the canvas.',
    keywords: ['rail', 'sidebar', 'side bar', 'left', 'panel list', 'outline', 'shell', 'chrome', 'hide'],
    type: 'boolean',
    default: true,
    category: SHELL_CATEGORY
  },
  {
    id: 'shell.inspectorOpen',
    label: 'Show the inspector',
    description: 'Keep the right inspector open beside the canvas.',
    keywords: ['inspector', 'details', 'properties', 'right', 'sidebar', 'info', 'shell', 'chrome', 'hide'],
    type: 'boolean',
    default: true,
    category: SHELL_CATEGORY
  }
```

- [ ] **Step 4: Run the checks and watch them pass**

Run: `npm run verify:layout`
Expected: PASS — `85/85 passed`.

- [ ] **Step 5: Confirm nothing else moved**

Run: `npm run verify:palette && npm run typecheck`
Expected: `verify:palette` still reports `60/60 passed`. Every palette settings row is generated from `SETTINGS` by main's `settings:list`, and `verify:palette` builds its rows from hand-written fixtures, so two new defs must change nothing there. If this suite moves, the palette has grown a hardcoded settings list that should not exist.

- [ ] **Step 6: Commit**

```bash
git add src/shared/settings-schema.ts scripts/verify-layout.cjs
git commit -m "feat(m8a): declare the two shell chrome settings"
```

---

### Task 2: The frame

**Files:**
- Create: `src/renderer/shell/TopBar.tsx`, `src/renderer/shell/SideRail.tsx`, `src/renderer/shell/Inspector.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx` (the returned tree only), `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs`

**Interfaces:**
- Produces: the DOM contract every later task and milestone reads — `.shell` (grid root), `.shell__top`, `.shell__rail`, `.shell__inspector`, and `.canvas` unchanged as the middle cell and still the element `hostRef` points at.
- Consumes: nothing new.

**Why the frame is rendered by `Canvas.tsx` and not by `App.tsx`.** The spec's architecture diagram shows the frame under `.app`. Every verb the shell needs — `paletteActions`, `openPalette`, the camera verbs, `presetRows` — is state that lives inside `Canvas`, so an `App`-owned frame would mean either lifting all of that state up or threading it back through a callback, and both make `App` a state owner in exchange for a nicer diagram. `Canvas` renders the frame; `.app` keeps its `padding: 38px 0 0` for the traffic lights. `hostRef` stays on `.canvas`, which is what keeps `useViewport`, `EdgeIndicators` and every `getBoundingClientRect()` call measuring the right box.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-panels.cjs`, inside the main IIFE at the end of the existing checks:

```js
// 64. THE FRAME INSETS THE CANVAS, and the canvas survives being inset.
//
//     Two assertions, and the second is the one worth having. That the
//     canvas got narrower is nearly tautological once a grid exists. That a
//     panel is STILL PROMOTED afterwards is not: a narrower canvas host is a
//     smaller cull region, assignTiers legitimately demotes on it, and a
//     frame that quietly demoted the panel the user was looking at would
//     render as a card with no error anywhere. The .xterm probe is the same
//     "is it still live" proof check 51 makes for the spawn cascade.
{
  const geom = await wc.executeJavaScript(`(() => {
    const shell = document.querySelector('.shell')
    const canvas = document.querySelector('.canvas')
    const rail = document.querySelector('.shell__rail')
    const inspector = document.querySelector('.shell__inspector')
    if (!shell || !canvas || !rail || !inspector) return null
    const c = canvas.getBoundingClientRect()
    return {
      canvasWidth: c.width,
      windowWidth: window.innerWidth,
      railWidth: rail.getBoundingClientRect().width,
      inspectorWidth: inspector.getBoundingClientRect().width,
      canvasLeft: c.left
    }
  })()`)
  const live = await wc.executeJavaScript(
    `document.querySelectorAll('.panel .xterm').length`)
  ok('64 the shell frame insets the canvas and leaves a panel promoted',
    geom !== null && geom.railWidth > 40 && geom.inspectorWidth > 40 &&
      geom.canvasWidth < geom.windowWidth - 80 &&
      geom.canvasLeft >= geom.railWidth - 1 &&
      live > 0,
    JSON.stringify(geom) + ` live=${live}`)
}
```

- [ ] **Step 2: Run the check and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL — `64 ...` fails with `null live=1`, because `.shell` does not exist. (Build first: this suite loads `out/renderer/index.html`, so an unbuilt change is invisible to it.)

- [ ] **Step 3: Create the three region components**

`src/renderer/shell/SideRail.tsx`:

```tsx
import type { JSX } from 'react'

/**
 * The left rail. M8a ships the region and its header only — M8b fills it with
 * the panel outline and M8d adds workspaces and the attention queue.
 *
 * Presentational by construction: it takes no callbacks yet, and when it does
 * they will be PaletteActions members. A rail that reached into Canvas for its
 * own copy of a verb would be a second implementation of it; see the spec's
 * "The shell is a second view over one verb surface".
 */
export function SideRail(): JSX.Element {
  return (
    <aside className="shell__rail" aria-label="Side rail">
      <div className="shell__region-title">Canvas</div>
    </aside>
  )
}
```

`src/renderer/shell/Inspector.tsx`:

```tsx
import type { JSX } from 'react'

/**
 * The right inspector. M8a ships the region and its header only; M8c fills it
 * with the selected panel's resolved command, cwd, pid and reattached flag —
 * fields main has carried since M6a with no reader anywhere.
 */
export function Inspector(): JSX.Element {
  return (
    <aside className="shell__inspector" aria-label="Inspector">
      <div className="shell__region-title">Panel</div>
    </aside>
  )
}
```

`src/renderer/shell/TopBar.tsx`:

```tsx
import type { JSX } from 'react'

/**
 * The top bar. M8a Task 2 ships the empty region so the grid is real and
 * check 64 can measure it; Task 5 fills it with the spawn, zoom, search and
 * settings controls.
 */
export function TopBar(): JSX.Element {
  return <header className="shell__top" aria-label="Toolbar" />
}
```

- [ ] **Step 4: Wrap the canvas in the grid**

In `src/renderer/canvas/Canvas.tsx`, add the imports:

```tsx
import { TopBar } from '../shell/TopBar'
import { SideRail } from '../shell/SideRail'
import { Inspector } from '../shell/Inspector'
```

and change the returned tree so the existing `<div className="canvas" ...>` becomes the middle cell of a new grid root. The canvas element itself — its className, its `ref={hostRef}` and all three mouse handlers — is unchanged:

```tsx
  return (
    <div className="shell">
      <TopBar />
      <SideRail />
      <div
        className="canvas"
        ref={hostRef}
        onMouseDownCapture={onMouseDownCapture}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
        {/* ...unchanged: .world, EdgeIndicators, CanvasHud, Palette... */}
      </div>
      <Inspector />
    </div>
  )
```

- [ ] **Step 5: Add the grid CSS**

In `src/renderer/styles.css`, add after the `.app` rule:

```css
/* M8a. The frame. The rail and inspector are grid COLUMNS with real width,
   so .canvas is genuinely narrower rather than partly hidden under an
   overlay — which is what keeps every getBoundingClientRect() in the canvas
   honest. Nothing in the canvas measures the window (useViewport, Canvas and
   EdgeIndicators all measure the .canvas host at event time), which is the
   whole reason insetting is safe; a future window measurement breaks this
   silently. */
.shell {
  --shell-rail-w: 240px;
  --shell-inspector-w: 260px;
  display: grid;
  height: 100%;
  grid-template-columns: var(--shell-rail-w) 1fr var(--shell-inspector-w);
  grid-template-rows: 36px 1fr;
  grid-template-areas:
    "top top top"
    "rail canvas inspector";
}

.shell__top { grid-area: top; }
.shell__rail { grid-area: rail; }
.shell__inspector { grid-area: inspector; }
.canvas { grid-area: canvas; }

/* min-width/min-height 0 on the canvas cell: a grid item defaults to
   min-width:auto, which refuses to shrink below its content and would let the
   canvas overflow the frame rather than inset — the failure looks like the
   inspector being pushed off screen. */
.canvas {
  min-width: 0;
  min-height: 0;
}

.shell__top,
.shell__rail,
.shell__inspector {
  background: var(--chrome-bg);
  color: var(--text);
  overflow: hidden;
}

.shell__top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
}

.shell__rail { border-right: 1px solid var(--border); }
.shell__inspector { border-left: 1px solid var(--border); }

.shell__region-title {
  padding: 10px 12px 6px;
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

Delete the now-duplicated `height: 100%` from the original `.canvas` rule if it conflicts; keep `position: relative`, `overflow: hidden`, the dot-grid background and the cursor.

- [ ] **Step 6: Run the check and watch it pass**

Run: `npm run build && npm run verify:panels`
Expected: PASS — `64 the shell frame insets the canvas and leaves a panel promoted`.

- [ ] **Step 7: Run the suites the geometry could have broken**

Run: `npm run verify:canvas && npm run verify:panels`
Expected: both green — `verify:panels` at `68/68 passed`. Checks 1–63 all run against a canvas that is now narrower; any that hardcoded a screen coordinate assuming a full-width canvas fails here, and the fix is the check's coordinate, not the frame.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/shell src/renderer/canvas/Canvas.tsx src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m8a): the shell frame, with the canvas as its middle cell"
```

---

### Task 3: Raise the palette's outside-click exit to the shell

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx:1034-1041` (`onMouseDownCapture`) and the returned tree from Task 2
- Test: `scripts/verify-panels.cjs`

**Interfaces:**
- Consumes: `palette.isOpen()`, `palette.dismissPalette()` — both existing.
- Produces: nothing new. The handler keeps its name and its body; only the element it is mounted on changes.

**Why this is its own task.** `onMouseDownCapture` is a prop on the `.canvas` div. After Task 2 the shell regions are *siblings* of `.canvas`, so a mousedown on a shell control never reaches it: the palette stays open, looking ready to take a query, while every bare key goes to the agent — a fourth, un-audited exit, and `Escape` cannot undo it because the key no longer reaches the palette's `onKeyDown`. Task 2 introduces that defect and this task closes it, before Task 5 adds controls that would trip it.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-panels.cjs`:

```js
// 65. THE PALETTE'S THIRD EXIT STILL WORKS FROM THE SHELL.
//
//     Task 2 made the shell a SIBLING of .canvas, and the outside-click
//     dismissal is a capture listener on .canvas — so without this it never
//     runs for a shell click and the overlay stays up with DOM focus on a
//     button. That is the fourth, un-audited exit "Three ways out of the
//     palette" exists to remove, and Escape cannot undo it because the key no
//     longer reaches the palette's own onKeyDown.
//
//     Check 42 already pins the canvas case and must stay green: this is an
//     ADDITIONAL door, not a replacement one.
{
  await wc.executeJavaScript(`
    if (document.querySelector('.palette') === null) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    }
  `)
  const opened = await waitUntil(
    () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
  const dismissed = await wc.executeJavaScript(`(async () => {
    const rail = document.querySelector('.shell__rail')
    rail.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 300 }))
    await new Promise((r) => setTimeout(r, 120))
    return document.querySelector('.palette') === null
  })()`)
  ok('65 a mousedown on the shell dismisses the open palette',
    opened === true && dismissed === true,
    `opened=${opened} dismissed=${dismissed}`)
}
```

- [ ] **Step 2: Run the check and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL — `65 ... opened=true dismissed=false`. The palette is still on screen because the capture listener sits on a sibling of the element that was clicked.

- [ ] **Step 3: Move the handler up one element**

In `Canvas.tsx`'s returned tree, move `onMouseDownCapture` from the `.canvas` div to the `.shell` div. The handler's body is unchanged — the `closest('.palette')` containment test and `dismissPalette()` (which deliberately does **not** restore focus, because the click itself is the focus gesture) both stay exactly as they are:

```tsx
    <div className="shell" onMouseDownCapture={onMouseDownCapture}>
```

```tsx
      <div
        className="canvas"
        ref={hostRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
```

Update the handler's own comment to record why it is one level up:

```tsx
  // Mounted on .shell, not .canvas: since M8a the top bar, rail and inspector
  // are SIBLINGS of .canvas, so a listener there never sees a click on a shell
  // control — the overlay would stay up with DOM focus on a button and every
  // bare key going to the agent. Capture phase and the explicit
  // closest('.palette') test are unchanged and still load-bearing: .palette's
  // own bubble-phase stopPropagation cannot stop an ancestor's capture
  // listener that has already run.
  const onMouseDownCapture = (event: MouseEvent<HTMLDivElement>): void => {
```

- [ ] **Step 4: Run the check and watch it pass**

Run: `npm run build && npm run verify:panels`
Expected: PASS — `65`, and **`42` still passes**. If 42 goes red, the containment test or `dismissPalette` was altered while moving the handler; restore them verbatim.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx scripts/verify-panels.cjs
git commit -m "fix(m8a): raise the palette's outside-click exit to the shell root"
```

---

### Task 4: Collapse, persistence, and the focus-preserving control

**Files:**
- Create: `src/renderer/shell/shell-control.ts`, `src/renderer/shell/useShellChrome.ts`
- Modify: `src/renderer/shell/SideRail.tsx`, `src/renderer/shell/Inspector.tsx`, `src/renderer/canvas/Canvas.tsx`, `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs`

**Interfaces:**
- Consumes: `shell.railOpen` / `shell.inspectorOpen` (Task 1); `window.canvas.settings.list()` and `.set()`; `palette.isOpen()`.
- Produces:
  - `shellControl(run: () => void): { onMouseDown: (e: ReactMouseEvent) => void; onClick: (e: ReactMouseEvent) => void }` — mounted on every shell control by Task 5 too.
  - `useShellChrome(deps: { paletteIsOpen: () => boolean }): { railOpen: boolean; inspectorOpen: boolean; toggleRail: () => void; toggleInspector: () => void }`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`:

```js
// 66. COLLAPSE IS REAL LAYOUT, AND IT PERSISTS TO MAIN'S STORE.
//     Read back through settings:list rather than off the shell's own class,
//     for the same reason check 53 does: a toggle that only flips a local
//     boolean looks identical on screen and is gone on the next launch.
{
  const before = await wc.executeJavaScript(
    `document.querySelector('.canvas').getBoundingClientRect().width`)
  await wc.executeJavaScript(`
    document.querySelector('.shell__rail-toggle').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))
  `)
  await sleep(150)
  const after = await wc.executeJavaScript(
    `document.querySelector('.canvas').getBoundingClientRect().width`)
  const stored = await wc.executeJavaScript(
    `window.canvas.settings.list().then((rows) =>
       rows.find((r) => r.id === 'shell.railOpen').value)`)
  ok('66 collapsing the rail widens the canvas and reaches main\'s store',
    after > before + 100 && stored === false,
    `before=${before} after=${after} stored=${stored}`)
}

// 66b. AUTO-REPEAT IS ONE GESTURE. A held Cmd+\ toggles once, not fifteen
//      times — the Cmd+K defect, which for a toggle means the rail's final
//      state depends on whether the user released on an odd or even repeat.
//      Like checks 7b and 33b this supplies repeat:true by hand, so it proves
//      the guard READS the flag and says nothing about who sets it.
{
  const open = () => wc.executeJavaScript(
    `document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
  const start = await open()
  await wc.executeJavaScript(`
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: '\\\\', code: 'Backslash', metaKey: true, repeat: true, bubbles: true }))
    }
  `)
  await sleep(200)
  const afterRepeats = await open()
  await wc.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: '\\\\', code: 'Backslash', metaKey: true, repeat: false, bubbles: true }))
  `)
  await sleep(200)
  const afterReal = await open()
  ok('66b a held Cmd+\\ toggles the rail once, not once per repeat',
    afterRepeats === start && afterReal !== start,
    `start=${start} afterRepeats=${afterRepeats} afterReal=${afterReal}`)
}

// 66c. A SHELL CONTROL NEVER TAKES THE KEYBOARD.
//      The quietest failure this surface has: click a button, and the next
//      keystroke goes nowhere because DOM focus is on the button rather than
//      xterm's hidden textarea. focusedId ALSO has to survive — assignTiers
//      pins the focused panel live, and it is the Cmd+C target.
{
  const id = await wc.executeJavaScript(`window.__m4aSessions()[0].id`)
  await clickPanel(id)
  await sleep(120)
  const focusedBefore = await wc.executeJavaScript(`window.__m4aSelection().focusedId`)
  const insideBefore = await wc.executeJavaScript(
    `document.activeElement.closest('.panel') !== null`)
  await wc.executeJavaScript(`(() => {
    const btn = document.querySelector('.shell__rail-toggle')
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })()`)
  await sleep(150)
  const focusedAfter = await wc.executeJavaScript(`window.__m4aSelection().focusedId`)
  const insideAfter = await wc.executeJavaScript(
    `document.activeElement.closest('.panel') !== null`)
  ok('66c a shell control takes neither focusedId nor DOM focus',
    focusedBefore === id && focusedAfter === id &&
      insideBefore === true && insideAfter === true,
    `focused ${focusedBefore}->${focusedAfter} inside ${insideBefore}->${insideAfter}`)
}
```

If `clickPanel(id)` is not already a helper in this file, use the existing helper the 33–46 block uses to focus a panel; do not invent a second spelling.

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL — all three. `66` and `66c` throw on a null `.shell__rail-toggle`; `66b` reports `start=false afterRepeats=false afterReal=false` because no chord is bound.

- [ ] **Step 3: Write the focus-preserving control helper**

`src/renderer/shell/shell-control.ts`:

```ts
import type { MouseEvent as ReactMouseEvent } from 'react'

/**
 * The handler pair EVERY shell control mounts.
 *
 * `preventDefault()` on mousedown is the whole mechanism, and it is doing
 * something subtler than it looks: it stops the browser moving DOM focus to
 * the button at all, so focus never leaves xterm's hidden textarea and there
 * is nothing to restore afterwards. The alternative — let focus move, then
 * blur back — has a window between the two where a keystroke goes nowhere,
 * and it fails silently exactly the way an unrestored palette close does
 * (see usePalette's rule 4).
 *
 * This also protects `focusedId`, which is NOT merely a highlight: assignTiers
 * pins the focused panel live, and it is what Cmd+C/Cmd+V and every
 * capturedId-gated palette row act on.
 *
 * stopPropagation is deliberately NOT called on mousedown: the palette's
 * outside-click dismissal is a CAPTURE listener on .shell, so it has already
 * run by the time this fires — and a shell click should dismiss an open
 * palette (check 65).
 */
export function shellControl(run: () => void): {
  onMouseDown: (event: ReactMouseEvent) => void
  onClick: (event: ReactMouseEvent) => void
} {
  return {
    onMouseDown: (event) => event.preventDefault(),
    onClick: (event) => {
      event.preventDefault()
      run()
    }
  }
}
```

- [ ] **Step 4: Write the chrome hook**

`src/renderer/shell/useShellChrome.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'

export interface ShellChrome {
  railOpen: boolean
  inspectorOpen: boolean
  toggleRail: () => void
  toggleInspector: () => void
}

/**
 * Rail and inspector visibility, persisted through main's settings store.
 *
 * Read at mount and written through settings:set — never held only in React
 * state. The preferences map is already the one place a user toggle lives
 * ("One map, and a typed view over it"), and a second store for two booleans
 * would be exactly the drift that entry exists to prevent.
 */
export function useShellChrome(deps: { paletteIsOpen: () => boolean }): ShellChrome {
  const { paletteIsOpen } = deps
  const [railOpen, setRailOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)

  // Read once at mount. Like glowEnabled and pipsEnabled in Canvas.tsx, this
  // cannot ride settingRows: that list loads only when the palette OPENS, and
  // the frame has to be right on the first paint whether or not the user has
  // ever pressed Cmd+K.
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const rail = rows.find((r) => r.id === 'shell.railOpen')
      const inspector = rows.find((r) => r.id === 'shell.inspectorOpen')
      if (rail) setRailOpen(rail.value === true)
      if (inspector) setInspectorOpen(inspector.value === true)
    })
  }, [])

  const toggleRail = useCallback(() => {
    setRailOpen((open) => {
      const next = !open
      void window.canvas.settings.set('shell.railOpen', next)
      return next
    })
  }, [])

  const toggleInspector = useCallback(() => {
    setInspectorOpen((open) => {
      const next = !open
      void window.canvas.settings.set('shell.inspectorOpen', next)
      return next
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd, and only Cmd — the same gate every canvas shortcut obeys so that
      // a bare keystroke always reaches the PTY.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
      // event.code, not event.key: with Shift held macOS reports key '|', so
      // a key check would silently miss the inspector's chord.
      if (event.code !== 'Backslash') return
      // Canvas shortcuts stand down while the palette is open — rule 3 of
      // "who owns the keyboard". isOpen reads a ref, so this listener is not
      // torn down and rebuilt on every open and close.
      if (paletteIsOpen()) return
      // preventDefault BEFORE the repeat bail, unlike the modifier checks
      // above: those reject a chord that is not ours, while this one rejects
      // a chord that IS ours and we are declining to act on, so the tail of a
      // held Cmd+\ must still be swallowed rather than leaking to the focused
      // agent's PTY.
      event.preventDefault()
      // A held toggle would flicker the region at the OS repeat rate and
      // leave it open or closed depending on whether the user released on an
      // odd or an even repeat — the Cmd+K defect exactly. Not in
      // REPEATABLE_KEYS, and not an allow-list case: for a toggle the repeat
      // stream is never the feature.
      if (event.repeat) return
      if (event.shiftKey) toggleInspector()
      else toggleRail()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteIsOpen, toggleRail, toggleInspector])

  return { railOpen, inspectorOpen, toggleRail, toggleInspector }
}
```

- [ ] **Step 5: Give the regions their toggles and wire the hook**

In `SideRail.tsx`, take the toggle as a prop and mount `shellControl`:

```tsx
import type { JSX } from 'react'
import { shellControl } from './shell-control'

export function SideRail({ onToggle }: { onToggle: () => void }): JSX.Element {
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
      <div className="shell__region-title">Canvas</div>
    </aside>
  )
}
```

Make the same change in `Inspector.tsx` with `className="shell__inspector-toggle"`, `title="Hide the inspector (⇧⌘\)"` and the glyph `›`.

In `Canvas.tsx`, call the hook beside the other chrome state and apply the classes:

```tsx
  const chrome = useShellChrome({ paletteIsOpen: palette.isOpen })
```

```tsx
    <div
      className={`shell${chrome.railOpen ? '' : ' shell--rail-collapsed'}${
        chrome.inspectorOpen ? '' : ' shell--inspector-collapsed'}`}
      onMouseDownCapture={onMouseDownCapture}
    >
      <TopBar />
      <SideRail onToggle={chrome.toggleRail} />
      ...
      <Inspector onToggle={chrome.toggleInspector} />
```

When a region is collapsed its toggle stays mounted (it is the only way back), so the collapsed strip keeps the button and hides the rest.

- [ ] **Step 6: Add the collapsed CSS**

```css
/* Collapsed is a WIDTH change on the grid, not display:none: the toggle has
   to stay clickable or the region is unreachable without the chord. */
.shell--rail-collapsed { --shell-rail-w: 22px; }
.shell--inspector-collapsed { --shell-inspector-w: 22px; }

.shell--rail-collapsed .shell__rail .shell__region-title,
.shell--inspector-collapsed .shell__inspector .shell__region-title {
  display: none;
}

.shell__rail-toggle,
.shell__inspector-toggle {
  width: 100%;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
}

/* NO width transition. A transition fires ResizeObserver every frame, which
   re-runs assignTiers at 60Hz mid-animation — the cascade TerminalPanel's memo
   and registry.version() both exist to block. The collapse is a discrete
   width change, and the 250ms demote hold absorbs the single step. */
```

- [ ] **Step 7: Run the checks and watch them pass**

Run: `npm run build && npm run verify:panels`
Expected: PASS — `66`, `66b`, `66c`, and `71/71 passed`.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/shell src/renderer/canvas/Canvas.tsx src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m8a): collapsible rail and inspector, persisted and chorded"
```

---

### Task 5: The top bar's controls

**Files:**
- Modify: `src/renderer/shell/TopBar.tsx`, `src/renderer/canvas/useViewport.ts`, `src/renderer/canvas/Canvas.tsx`
- Test: `scripts/verify-panels.cjs`

**Interfaces:**
- Consumes: `shellControl` (Task 4); `PaletteActions.spawnPreset`, `PresetRow` (`{ id, name, available, builtIn, isDefault, subtitle }`); `palette.openPalette`.
- Produces:
  - `useViewport` gains `zoomBy(factor: number): void` and `fitAll(): void` on `ViewportControls`.
  - `TopBar` props: `{ presets: PresetRow[]; scale: number; onSpawnPreset: (id: string) => void; onZoomBy: (factor: number) => void; onFit: () => void; onSearch: () => void; onSettings: () => void }`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`:

```js
// 67. THE SPAWN BUTTON SPAWNS EXACTLY ONE PANEL, THROUGH MAIN.
//     Exactly one is half the check: a button that also let its click reach
//     the canvas background would spawn once and select something else, and a
//     double-fire looks identical to a slow machine.
{
  const before = await wc.executeJavaScript(`window.__m4aSessions().length`)
  await wc.executeJavaScript(`
    document.querySelector('.shell__spawn').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))
  `)
  await sleep(400)
  const after = await wc.executeJavaScript(`window.__m4aSessions().length`)
  ok('67 the New panel button spawns exactly one panel',
    after === before + 1, `${before} -> ${after}`)
}

// 68. THE ZOOM CLUSTER MOVES THE CAMERA THROUGH NAMED VERBS.
//     Reads __m4aScale rather than a CSS transform so it is the same number
//     viewport.ts computes. Fit is asserted separately from the steppers
//     because they are different verbs and a wiring that pointed both at
//     resetViewport would still change the scale.
{
  const start = await wc.executeJavaScript(`window.__m4aScale()`)
  await wc.executeJavaScript(`
    document.querySelector('.shell__zoom-in').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))
  `)
  await sleep(120)
  const zoomedIn = await wc.executeJavaScript(`window.__m4aScale()`)
  await wc.executeJavaScript(`
    document.querySelector('.shell__zoom-out').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))
  `)
  await sleep(120)
  const backOut = await wc.executeJavaScript(`window.__m4aScale()`)
  await wc.executeJavaScript(`
    document.querySelector('.shell__fit').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))
  `)
  await sleep(200)
  const fitted = await wc.executeJavaScript(`window.__m4aScale()`)
  ok('68 the zoom cluster steps in, steps out, and fits',
    zoomedIn > start + 0.01 && Math.abs(backOut - start) < 0.001 && fitted > 0,
    `start=${start} in=${zoomedIn} out=${backOut} fit=${fitted}`)
}

// 69. SEARCH AND SETTINGS OPEN THE PALETTE, AND SETTINGS ARRIVES IN ITS SCOPE.
//     The scope is the half that matters: an M6b setting is hiddenAtRest, so a
//     settings button that merely opened the palette would land the user on a
//     list with no settings visible at all — a feature that reads as missing.
{
  await wc.executeJavaScript(`(() => {
    const input = document.querySelector('.palette__input')
    if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })()`)
  await sleep(120)
  await wc.executeJavaScript(`
    document.querySelector('.shell__search').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))
  `)
  const searchOpened = await waitUntil(
    () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
  await wc.executeJavaScript(`(() => {
    const input = document.querySelector('.palette__input')
    if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })()`)
  await sleep(120)
  await wc.executeJavaScript(`
    document.querySelector('.shell__settings').dispatchEvent(
      new MouseEvent('click', { bubbles: true }))
  `)
  await waitUntil(
    () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
  await sleep(150)
  const inScope = await wc.executeJavaScript(`(() => {
    const chip = document.querySelector('.palette__scope')
    const rows = [...document.querySelectorAll('.palette__row')]
    return {
      chip: chip ? chip.textContent.trim() : null,
      sawASetting: rows.some((r) => r.textContent.includes('Idle after'))
    }
  })()`)
  ok('69 search opens the palette and settings opens it in the settings scope',
    searchOpened === true && inScope.sawASetting === true,
    `search=${searchOpened} scope=${JSON.stringify(inScope)}`)
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL — all three throw on null elements (`.shell__spawn`, `.shell__zoom-in`, `.shell__search`).

- [ ] **Step 3: Add the two named camera verbs**

In `src/renderer/canvas/useViewport.ts`, add to the `ViewportControls` interface:

```ts
  /**
   * Multiply the scale about the viewport's centre — the fourth narrow verb,
   * after resetViewport, worldCentre and centreOn. The top bar's +/- buttons
   * need to zoom and the setter stays private: exposing it would make every
   * future caller a camera owner and take the coordinate math out of
   * verify:viewport's reach.
   */
  zoomBy: (factor: number) => void
  /** Frame every panel — the same target Cmd+1 hits, named so the top bar
   *  and the keydown case cannot drift apart. */
  fitAll: () => void
```

and implement them beside `resetViewport`:

```ts
  const zoomBy = useCallback((factor: number) => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const centre = { x: bounds.width / 2, y: bounds.height / 2 }
    setViewport((vp) => zoomAt(vp, centre, factor))
  }, [hostRef])

  const fitAll = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    setViewport(fitTo(rectsRef.current, { width: bounds.width, height: bounds.height }))
  }, [hostRef])
```

Then make the keydown cases call the verbs instead of repeating the arithmetic — `case '1'` calls `fitAll()`, `'='`/`'+'` call `zoomBy(KEYBOARD_ZOOM_STEP)`, `'-'` calls `zoomBy(1 / KEYBOARD_ZOOM_STEP)` — each still calling `event.preventDefault()` first. Add `zoomBy` and `fitAll` to the hook's returned object.

- [ ] **Step 4: Fill in the top bar**

`src/renderer/shell/TopBar.tsx`:

```tsx
import type { JSX } from 'react'
import type { PresetRow } from '../palette/commands'
import { shellControl } from './shell-control'

export interface TopBarProps {
  presets: PresetRow[]
  scale: number
  onSpawnPreset: (id: string) => void
  onZoomBy: (factor: number) => void
  onFit: () => void
  onSearch: () => void
  onSettings: () => void
}

const ZOOM_STEP = 1.2

/**
 * The visible verbs. Every one of them already existed as a chord or a palette
 * row; this bar is a second VIEW over them, which is why each handler is a
 * prop rather than an implementation.
 *
 * The spawn button routes through onSpawnPreset -> PaletteActions.spawnPreset
 * -> preset:spawn-by-id, i.e. main. That is not indirection for its own sake:
 * only main can resolve an ABSENT command into the user's login shell, so a
 * renderer-side spawn would launch a hardcoded shell for the built-in preset
 * and every user preset saved from a login-shell panel.
 */
export function TopBar({
  presets, scale, onSpawnPreset, onZoomBy, onFit, onSearch, onSettings
}: TopBarProps): JSX.Element {
  const fallback = presets.find((p) => p.available)
  const preferred = presets.find((p) => p.isDefault && p.available) ?? fallback

  return (
    <header className="shell__top" aria-label="Toolbar">
      <button
        type="button"
        className="shell__spawn"
        disabled={preferred === undefined}
        title={preferred ? `New ${preferred.name} panel (⌘N)` : 'No preset is available'}
        {...shellControl(() => { if (preferred) onSpawnPreset(preferred.id) })}
      >
        + New panel
      </button>

      <div className="shell__zoom" role="group" aria-label="Zoom">
        <button type="button" className="shell__zoom-out" title="Zoom out (⌘−)"
          aria-label="Zoom out" {...shellControl(() => onZoomBy(1 / ZOOM_STEP))}>−</button>
        <span className="shell__zoom-readout">{Math.round(scale * 100)}%</span>
        <button type="button" className="shell__zoom-in" title="Zoom in (⌘=)"
          aria-label="Zoom in" {...shellControl(() => onZoomBy(ZOOM_STEP))}>+</button>
        <button type="button" className="shell__fit" title="Fit everything (⌘1)"
          {...shellControl(onFit)}>Fit</button>
      </div>

      <div className="shell__spacer" />

      <button type="button" className="shell__search" title="Search commands (⌘K)"
        {...shellControl(onSearch)}>Search ⌘K</button>
      <button type="button" className="shell__settings" title="Settings"
        aria-label="Settings" {...shellControl(onSettings)}>⚙</button>
    </header>
  )
}
```

`ZOOM_STEP` is restated here rather than imported because `useViewport`'s `KEYBOARD_ZOOM_STEP` is module-private; if a later task exports it, import it and delete this constant.

- [ ] **Step 5: Wire it, and load presets at mount**

In `Canvas.tsx`, destructure the two new verbs from `useViewport` and pass the props:

```tsx
  const { viewport, resetViewport, worldCentre, centreOn, zoomBy, fitAll } = useViewport(...)
```

```tsx
      <TopBar
        presets={presetRows}
        scale={viewport.scale}
        onSpawnPreset={paletteActions.spawnPreset}
        onZoomBy={zoomBy}
        onFit={fitAll}
        onSearch={palette.openPalette}
        onSettings={openSettingsScope}
      />
```

`presetRows` currently loads only when the palette opens, so add a mount load beside the existing effect — the bar needs a default preset name before the user has ever pressed `Cmd+K`:

```tsx
  // The top bar names the default preset, so the list must exist before the
  // palette has ever been opened. The palette-open reload below stays: it is
  // what keeps the rows fresh after a rename or a delete.
  useEffect(() => { reloadPresets() }, [reloadPresets])
```

Add the settings-scope opener beside `paletteActions`, using whatever the palette's existing scope-entry API is (the same door `manage.settings`'s `entersScope: 'settings'` row uses — reuse it, do not add a second way in):

```tsx
  const openSettingsScope = useCallback(() => {
    palette.openPalette()
    setPaletteScope('settings')
  }, [palette])
```

If `usePalette` has no scope setter, add one there rather than reaching into `Palette.tsx` state — a second scope authority is the drift this milestone's whole architecture avoids.

- [ ] **Step 6: Style the bar**

```css
.shell__top button {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  padding: 3px 9px;
  font-size: 11px;
  cursor: pointer;
}
.shell__top button:disabled { color: var(--muted); cursor: default; }
.shell__zoom { display: flex; align-items: center; gap: 4px; }
.shell__zoom-readout {
  min-width: 40px;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.shell__spacer { flex: 1; }
```

- [ ] **Step 7: Run the checks and watch them pass**

Run: `npm run build && npm run verify:panels`
Expected: PASS — `67`, `68`, `69`, and `74/74 passed`.

- [ ] **Step 8: Run the camera suites the refactor could have broken**

Run: `npm run verify:viewport && npm run verify:canvas && npm run verify:panels`
Expected: all green. Step 3 rewrote three keydown cases to route through the new verbs; `verify:panels` 7, 17, 22, 26, 29 and 51 all drive `Cmd+N`/`Cmd+0`/`Cmd+1` and are what catch a verb wired to the wrong target.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/shell src/renderer/canvas scripts/verify-panels.cjs
git commit -m "feat(m8a): the top bar — spawn, zoom, search and settings"
```

---

### Task 6: Documentation catches up

**Files:**
- Modify: `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: everything above. Produces: no code.

- [ ] **Step 1: Update the verify table in `CLAUDE.md`**

`verify:layout` becomes **85 checks (the last check number is 83)**, adding: M8a's two shell settings, `shell.railOpen` and `shell.inspectorOpen`, declared and round-tripping (82–83) — with 83 additionally pinning that the two ids are independent, since one sparse map holds both and a pasted id produces two switches that move together.

`verify:panels` becomes **75 checks (the last check number is 69)**, adding: the frame insetting the canvas while leaving a panel promoted (64 — and note it asserts the `.xterm` probe, because a narrower canvas is a smaller cull region and a silently demoted panel is the failure); the palette's outside-click exit still working from a shell click (65); collapse reaching main's store (66); a held `Cmd+\` toggling once (66b); a shell control taking neither `focusedId` nor DOM focus (66c); the spawn button spawning exactly one panel (67); the zoom cluster (68); and search plus the settings scope (69).

- [ ] **Step 2: Add a load-bearing-details entry to `CLAUDE.md`**

Add after the M6d entries:

```markdown
**The shell insets the canvas, and that is only safe because nothing measures
the window (`Canvas.tsx`, `styles.css`).** `useViewport`, `Canvas.tsx` and
`EdgeIndicators` all read `getBoundingClientRect()` on the `.canvas` host at
event time, and the pip layer carries its own `ResizeObserver` precisely so
`Canvas` need hold no size — so making the canvas a grid cell narrower than
the window required no coordinate change anywhere. A future
`window.innerWidth` read breaks this silently: pips would aim at the window's
edge while the canvas ended 240px earlier. Two second-order effects are real.
A narrower host is a smaller cull region, so opening the rail legitimately
demotes panels — correct, not a bug. And the collapse must stay a DISCRETE
width change: an animated one fires `ResizeObserver` every frame and re-runs
`assignTiers` at 60Hz, the cascade `TerminalPanel`'s memo and
`registry.version()` both exist to block. `verify:panels` 64 is the check, and
it asserts a panel is still promoted rather than merely that the canvas got
narrower.

**A shell control never takes DOM focus (`shell/shell-control.ts`).** Every
control mounts `shellControl()`, whose `onMouseDown` calls `preventDefault()`
so the browser never moves focus off xterm's hidden textarea. The alternative
— let focus move, then blur back — has a window where a keystroke goes
nowhere, and it fails exactly as silently as an unrestored palette close.
`focusedId` is the other half: it is not a highlight, it is what pins a panel
live in `assignTiers` and what `Cmd+C`/`Cmd+V` act on, so a shell button that
cleared it would demote the panel and strand the clipboard. `verify:panels`
66c asserts both.

**The palette's outside-click exit is mounted on `.shell`, not `.canvas`
(`Canvas.tsx`'s `onMouseDownCapture`).** M8a made the top bar, rail and
inspector siblings of `.canvas`, so a listener there never sees a click on a
shell control — the overlay would stay up, looking ready for a query, while
every bare key went to the agent, and `Escape` could not undo it because the
key no longer reaches the palette's `onKeyDown`. That is the fourth exit
"Three ways out of the palette" exists to remove. The capture phase and the
explicit `closest('.palette')` test are unchanged and still load-bearing.
`verify:panels` 42 pins the canvas case; 65 pins the shell one.
```

- [ ] **Step 3: Update `README.md`**

Add to the milestone table:

```markdown
| M8a | The app shell: a frame, collapsible rail and inspector, a visible toolbar | ✅ done |
```

and add a short "Things that are non-obvious" paragraph noting that the chrome is a second view over the palette's verb surface, that every control is deliberately unfocusable, and that both side regions collapse with `⌘\` and `⇧⌘\`.

- [ ] **Step 4: Run the whole suite**

Run: `npm run verify`
Expected: green, with `verify:layout` at `85/85` and `verify:panels` at `75/75`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs(m8a): the shell frame, and what its geometry costs"
```

---

## Self-Review

**Spec coverage.** Frame and grid → Task 2. Top bar's four control groups → Task 5. Collapse, persistence, chords, auto-repeat → Tasks 1 and 4. The palette-exit defect the spec names in rule 3 → Task 3. The focus rule (constraint 2) → Task 4's `shellControl` plus check 66c. The "no new modality" rule needs no task in M8a: nothing here renames or deletes anything. The tiering hazard is covered by check 64's `.xterm` probe and by the no-transition CSS comment in Task 4 Step 6.

**Deviation from the spec, recorded deliberately.** The spec's diagram puts the frame in `App.tsx`; this plan renders it from `Canvas.tsx` (Task 2's rationale). The spec's *rules* are unaffected — the shell components are still presentational and still call `PaletteActions` — but the spec's architecture diagram and this plan disagree on one line, and the spec should be amended rather than left to look authoritative.

**Type consistency.** `shellControl` returns `{ onMouseDown, onClick }` in Task 4 and is spread as `{...shellControl(...)}` in Tasks 4 and 5. `useShellChrome` returns `{ railOpen, inspectorOpen, toggleRail, toggleInspector }` and every consumer uses those four names. `zoomBy`/`fitAll` are declared on `ViewportControls` in Task 5 Step 3 and consumed under the same names in Step 5. `PresetRow.isDefault` and `.available` match `palette/commands.ts:19-29`.

**Known unknown, flagged rather than papered over.** Task 5 Step 5's settings-scope opener assumes `usePalette` exposes (or can cheaply expose) a scope setter. If it does not, the fix is to add one there — not to reach into `Palette.tsx`'s state from the shell, which would make the shell a second scope authority.
