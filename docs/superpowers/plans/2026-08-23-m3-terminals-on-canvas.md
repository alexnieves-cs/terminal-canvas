# M3 Terminals on the Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put real terminals into the canvas's world layer with LOD tiers and viewport culling, without letting a zoom gesture kill a running agent.

**Architecture:** Panel state splits into two lifetimes. A *session* — created once, disposed once — owns the xterm `Terminal` and the PTY and lives in a module-level registry outside React. A *view* is mounted and unmounted freely by tiering and owns nothing. Tier assignment is a pure function alongside the M2 viewport math. The registry takes its bridge and its terminal factory as injected dependencies, so its logic is testable under plain node with fakes.

**Tech Stack:** TypeScript, React 19, xterm 5.5.0 (+ fit and WebGL addons), electron-vite, esbuild for bundling test targets. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-23-m3-terminals-on-canvas-design.md`

## Global Constraints

- No new npm dependencies.
- `lod.ts` imports nothing from the DOM or React, like `viewport.ts`. It is bundled into the existing `verify:viewport` target and must run under plain node.
- `session-registry.ts` imports nothing from React and never touches `window` or `document` directly. Everything platform-specific arrives through injected `Bridge` and `SessionFactory`. This is what makes it testable under plain node.
- **A tier change must never call `pty.kill`.** `pty.kill` is called only from `disposeAll()`. If you find yourself killing a PTY anywhere else, the design has been broken.
- `LIVE_MIN_SCALE = 0.5`, `LIVE_BUDGET = 8`, `CULL_MARGIN_PX = 240`, `DEMOTE_DELAY_MS = 250`, `INTERACT_MIN_SCALE = 0.9`, `INTERACT_MAX_SCALE = 1.1`.
- A `PanelSpec` stored in `panels.ts` omits `cols`/`rows`. They are supplied at `pty.create` time from the fitted terminal, never invented.
- Every canvas keyboard shortcut requires `Cmd` (`metaKey`). Bare keys belong to the PTY — including `Escape` and `Ctrl+C`.
- Test scripts follow the existing `scripts/verify-*.cjs` idiom: a `results` array, an `ok(name, pass, detail)` helper, a `N/M passed` summary, and `process.exit(1)` / `app.exit(1)` on failure.
- TDD is mandatory: write the check, run it, watch it fail for the right reason, then implement.
- `npm run typecheck` must pass before every commit. `npm run verify` must pass before the final commit.

---

### Task 1: Prove xterm survives a detached host

The whole eviction design assumes a `Terminal` keeps working while its host div
is out of the document. Nothing in the spec is safe until that is known. This
task builds no product code — it answers the question, and the answer either
unblocks Task 3 or sends us back to the spec.

**Files:**
- Create: `scripts/xterm-detach-entry.js`
- Create: `scripts/verify-xterm-detach.cjs`
- Modify: `package.json` (add `verify:xterm` script)

**Interfaces:**
- Consumes: nothing.
- Produces: a verified answer, plus `npm run verify:xterm`. No exported code.

- [ ] **Step 1: Write the probe entry**

This runs *in the renderer*. It drives a real `Terminal` through the exact
lifecycle eviction will use and parks the results on `window.__probe`.

Create `scripts/xterm-detach-entry.js`:

```js
/* Probe: does an xterm Terminal survive having its host detached?
   Bundled by verify-xterm-detach.cjs and loaded in a hidden window. */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

const readRows = (term) => {
  const buf = term.buffer.active
  const lines = []
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)
    if (!line) continue
    const text = line.translateToString(true)
    if (text.trim()) lines.push(text.trim())
  }
  return lines
}

window.__probe = (async () => {
  const out = {}

  // 1. Open against an attached host, as a live panel would.
  const host = document.createElement('div')
  host.style.cssText = 'width: 640px; height: 400px;'
  document.body.appendChild(host)

  const term = new Terminal({ fontSize: 13, scrollback: 1000, allowProposedApi: true })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(host)
  let webgl = new WebglAddon()
  term.loadAddon(webgl)
  fit.fit()

  term.write('BEFORE-DETACH\r\n')
  await new Promise((r) => setTimeout(r, 200))
  out.colsWhileAttached = term.cols
  out.rowsWhileAttached = term.rows

  // 2. Evict: drop the WebGL context and take the host out of the document.
  webgl.dispose()
  webgl = null
  host.remove()
  await new Promise((r) => setTimeout(r, 100))

  // 3. Write while detached. This is the assertion that matters: output
  //    arriving for an off-screen panel must not be lost.
  try {
    term.write('WHILE-DETACHED\r\n')
    await new Promise((r) => setTimeout(r, 200))
    out.detachedWriteThrew = false
  } catch (error) {
    out.detachedWriteThrew = String(error)
  }
  out.bufferWhileDetached = readRows(term)

  // 4. Promote again: re-append the SAME host, take a fresh WebGL context,
  //    refit. term.open() is deliberately not called a second time.
  document.body.appendChild(host)
  try {
    const again = new WebglAddon()
    term.loadAddon(again)
    out.webglReloaded = true
  } catch (error) {
    out.webglReloaded = String(error)
  }
  fit.fit()
  term.refresh(0, term.rows - 1)
  await new Promise((r) => setTimeout(r, 300))

  out.bufferAfterReattach = readRows(term)
  out.colsAfterReattach = term.cols
  out.rowsAfterReattach = term.rows
  out.domTextAfterReattach = (host.querySelector('.xterm-rows')?.textContent || '').trim()
  out.canvasCount = host.querySelectorAll('canvas').length

  return out
})()
```

- [ ] **Step 2: Write the failing check**

Create `scripts/verify-xterm-detach.cjs`:

```js
/* Verifies the assumption the whole M3 eviction design rests on: that an xterm
   Terminal keeps accepting writes while its host div is out of the document,
   and renders correctly once the host is put back.
   Run with: npm run verify:xterm

   If this fails, do not proceed with Task 3 — the spec's eviction model needs
   rethinking, not a workaround. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { writeFileSync, mkdirSync } = require('node:fs')
const { app, BrowserWindow } = require('electron')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const OUT_DIR = join(__dirname, '..', 'out', 'verify')
mkdirSync(OUT_DIR, { recursive: true })

buildSync({
  entryPoints: [join(__dirname, 'xterm-detach-entry.js')],
  outfile: join(OUT_DIR, 'xterm-detach.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  loader: { '.css': 'text' }
})

// No CSP here on purpose: this is a probe page, not the app.
writeFileSync(
  join(OUT_DIR, 'xterm-detach.html'),
  '<!doctype html><html><body><script src="xterm-detach.js"></script></body></html>'
)

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 800 })
  await win.loadFile(join(OUT_DIR, 'xterm-detach.html')).catch(() => {})
  await sleep(2000)

  const probe = await win.webContents.executeJavaScript('window.__probe')

  ok('1 writing to a detached terminal does not throw',
    probe.detachedWriteThrew === false,
    String(probe.detachedWriteThrew))

  ok('2 output written while detached reaches the buffer',
    probe.bufferWhileDetached.includes('WHILE-DETACHED'),
    JSON.stringify(probe.bufferWhileDetached))

  ok('3 scrollback from before eviction survives re-attachment',
    probe.bufferAfterReattach.includes('BEFORE-DETACH') &&
      probe.bufferAfterReattach.includes('WHILE-DETACHED'),
    JSON.stringify(probe.bufferAfterReattach))

  ok('4 the re-attached host renders its buffer to the DOM',
    probe.domTextAfterReattach.includes('BEFORE-DETACH'),
    JSON.stringify(probe.domTextAfterReattach.slice(0, 80)))

  ok('5 a fresh WebGL addon loads on the same Terminal',
    probe.webglReloaded === true,
    String(probe.webglReloaded))

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
```

- [ ] **Step 3: Add the npm script**

In `package.json`, after `verify:canvas`:

```json
"verify:xterm": "unset ELECTRON_RUN_AS_NODE && node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/verify-xterm-detach.cjs",
```

- [ ] **Step 4: Run it and record the real answer**

Run: `npm run verify:xterm`

This is the one check in the plan whose failure is *informative rather than a
bug*. Three outcomes:

- **All 5 pass** — the spec's eviction model is sound. Proceed to Task 2.
- **Check 4 fails but 1–3 pass** — the buffer survives but re-attachment does
  not repaint. Note the exact behaviour, then in Task 4 make `attach()` call
  `term.refresh(0, term.rows - 1)` after `fit()` and re-run. Still proceed.
- **Check 1, 2 or 3 fails** — the buffer does not survive detachment. **Stop.**
  Do not start Task 3. Report the failure and return to the spec: eviction
  would have to keep the host in the document (e.g. `visibility: hidden` with
  only the WebGL addon disposed), which changes the tier machine.

- [ ] **Step 5: Commit**

```bash
git add scripts/xterm-detach-entry.js scripts/verify-xterm-detach.cjs package.json
git commit -m "test(m3): prove xterm survives a detached host"
```

---

### Task 2: Tier assignment

**Files:**
- Create: `src/renderer/canvas/lod.ts`
- Modify: `scripts/viewport-entry.cjs` (export the new module)
- Modify: `scripts/verify-viewport.cjs` (append checks 20-25)

**Interfaces:**
- Consumes: `WorldRect`, `Viewport`, `Size` from `src/renderer/canvas/viewport.ts`.
- Produces: `type Tier = 'live' | 'card'`; `LIVE_MIN_SCALE = 0.5`; `LIVE_BUDGET = 8`; `CULL_MARGIN_PX = 240`; `assignTiers(input: TierInput): Record<string, Tier>` where

```ts
interface TierInput {
  rects: WorldRect[]
  viewport: Viewport
  size: Size
  focusedId: string | null
  budget?: number
  lastFocusedAt: Record<string, number>
}
```

- [ ] **Step 1: Extend the bundle entry**

`scripts/viewport-entry.cjs` currently re-exports `viewport.ts` and
`canvas-input.ts`. Add the new module alongside them, matching the existing
style in that file:

```js
export * from '../src/renderer/canvas/lod'
```

- [ ] **Step 2: Write the failing checks**

Append to the IIFE in `scripts/verify-viewport.cjs`, after the existing
checks. `assignTiers` is destructured from the same bundle the file already
requires.

```js
// --- lod.ts -------------------------------------------------------------

const SIZE = { width: 1000, height: 800 }
const AT_ORIGIN = { x: 0, y: 0, scale: 1 }
const panelAt = (id, x, y) => ({ id, x, y, w: 520, h: 340 })

// 20. On screen is live; far off screen is a card.
{
  const rects = [panelAt('near', 100, 100), panelAt('far', 90000, 90000)]
  const tiers = assignTiers({
    rects, viewport: AT_ORIGIN, size: SIZE, focusedId: null, lastFocusedAt: {}
  })
  ok(20, tiers.near === 'live' && tiers.far === 'card',
    `near=${tiers.near} far=${tiers.far}`)
}

// 21. The margin band: a panel just outside the viewport is still live, so
//     panning does not thrash a WebGL context at the edge.
{
  const justOutside = panelAt('edge', SIZE.width + 100, 100) // 100px past the edge
  const tiers = assignTiers({
    rects: [justOutside], viewport: AT_ORIGIN, size: SIZE,
    focusedId: null, lastFocusedAt: {}
  })
  const wayOutside = panelAt('gone', SIZE.width + 5000, 100)
  const tiers2 = assignTiers({
    rects: [wayOutside], viewport: AT_ORIGIN, size: SIZE,
    focusedId: null, lastFocusedAt: {}
  })
  ok(21, tiers.edge === 'live' && tiers2.gone === 'card',
    `edge=${tiers.edge} gone=${tiers2.gone}`)
}

// 22. Below LIVE_MIN_SCALE nothing unfocused is live, however on-screen.
{
  const rects = [panelAt('a', 0, 0), panelAt('b', 600, 0)]
  const tiers = assignTiers({
    rects, viewport: { x: 0, y: 0, scale: 0.3 }, size: SIZE,
    focusedId: null, lastFocusedAt: {}
  })
  ok(22, tiers.a === 'card' && tiers.b === 'card', JSON.stringify(tiers))
}

// 23. The budget caps live panels no matter how many are on screen.
{
  const rects = []
  for (let i = 0; i < 20; i++) {
    rects.push(panelAt('p' + i, (i % 5) * 40, Math.floor(i / 5) * 40))
  }
  const tiers = assignTiers({
    rects, viewport: AT_ORIGIN, size: SIZE, focusedId: null,
    budget: 3, lastFocusedAt: {}
  })
  const live = Object.values(tiers).filter((t) => t === 'live').length
  ok(23, live === 3, `live=${live} of ${rects.length}`)
}

// 24. The focused panel is live off screen, below threshold, and over budget.
//     Typing must never land in a card.
{
  const rects = [panelAt('focused', 90000, 90000)]
  for (let i = 0; i < 20; i++) rects.push(panelAt('p' + i, (i % 5) * 40, 0))
  const tiers = assignTiers({
    rects, viewport: { x: 0, y: 0, scale: 0.2 }, size: SIZE,
    focusedId: 'focused', budget: 2, lastFocusedAt: {}
  })
  ok(24, tiers.focused === 'live', JSON.stringify(tiers.focused))
}

// 25. Eviction drops the least-recently-focused panel first.
{
  const rects = [panelAt('old', 0, 0), panelAt('recent', 40, 0), panelAt('newest', 80, 0)]
  const tiers = assignTiers({
    rects, viewport: AT_ORIGIN, size: SIZE, focusedId: null, budget: 2,
    lastFocusedAt: { old: 1000, recent: 2000, newest: 3000 }
  })
  ok(25, tiers.old === 'card' && tiers.recent === 'live' && tiers.newest === 'live',
    JSON.stringify(tiers))
}
```

- [ ] **Step 3: Run the checks and watch them fail**

Run: `npm run verify:viewport`
Expected: the bundle step fails — `Could not resolve "../src/renderer/canvas/lod"`. That is the right failure: the module does not exist.

- [ ] **Step 4: Create the module with signatures only, and watch the checks fail again**

```ts
export type Tier = 'live' | 'card'
export const LIVE_MIN_SCALE = 0.5
export const LIVE_BUDGET = 8
export const CULL_MARGIN_PX = 240

export function assignTiers(_input: TierInput): Record<string, Tier> {
  return {}
}
```

Run: `npm run verify:viewport`
Expected: checks 20-25 FAIL with `undefined` tiers; checks 1-19 still pass. Watch this before implementing — a check that has never failed has proved nothing.

- [ ] **Step 5: Write the implementation**

Create `src/renderer/canvas/lod.ts`:

```ts
import { screenToWorld, type Size, type Viewport, type WorldRect } from './viewport'

/**
 * Which panels get a real terminal and which get a cheap card.
 *
 * Pure on purpose, exactly like viewport.ts: tiering is the logic most likely
 * to be subtly wrong (budgets, eviction order, edge thrash) and least
 * pleasant to debug through a running WebGL canvas.
 */

export type Tier = 'live' | 'card'

/** Below this, terminal text is unreadable anyway and a card is honest. */
export const LIVE_MIN_SCALE = 0.5

/** Browsers drop WebGL contexts near 16. Sit well under the cliff. */
export const LIVE_BUDGET = 8

/**
 * Culling uses a viewport expanded by this margin, so a panel is promoted
 * before it is visible and demoted well after it leaves. Promotion and
 * demotion happening at the same boundary would destroy and recreate a WebGL
 * context every frame while panning along an edge.
 */
export const CULL_MARGIN_PX = 240

export interface TierInput {
  rects: WorldRect[]
  viewport: Viewport
  size: Size
  focusedId: string | null
  budget?: number
  /** Epoch ms per panel id. Missing means never focused. */
  lastFocusedAt: Record<string, number>
}

function intersectsViewport(rect: WorldRect, vp: Viewport, size: Size): boolean {
  // Compare in world space: convert the margin-expanded screen rect once,
  // rather than converting every panel to screen space.
  const topLeft = screenToWorld({ x: -CULL_MARGIN_PX, y: -CULL_MARGIN_PX }, vp)
  const bottomRight = screenToWorld(
    { x: size.width + CULL_MARGIN_PX, y: size.height + CULL_MARGIN_PX },
    vp
  )
  return (
    rect.x < bottomRight.x &&
    rect.x + rect.w > topLeft.x &&
    rect.y < bottomRight.y &&
    rect.y + rect.h > topLeft.y
  )
}

export function assignTiers(input: TierInput): Record<string, Tier> {
  const { rects, viewport, size, focusedId, lastFocusedAt } = input
  const budget = input.budget ?? LIVE_BUDGET

  const tiers: Record<string, Tier> = {}
  for (const rect of rects) tiers[rect.id] = 'card'

  const eligible = rects.filter(
    (rect) =>
      rect.id !== focusedId &&
      viewport.scale >= LIVE_MIN_SCALE &&
      intersectsViewport(rect, viewport, size)
  )

  // Most-recently-focused first, so eviction takes the stalest panel. Ties
  // (never focused) keep declaration order, which is stable across renders.
  eligible.sort((a, b) => (lastFocusedAt[b.id] ?? 0) - (lastFocusedAt[a.id] ?? 0))

  // The focused panel is pinned live unconditionally — off screen, below the
  // scale threshold, budget full, any of it. It therefore consumes a slot and
  // can evict a panel that is fully visible. That is correct and surprising:
  // keystrokes must never land in a card.
  let slots = budget
  if (focusedId && tiers[focusedId] !== undefined) {
    tiers[focusedId] = 'live'
    slots -= 1
  }

  for (const rect of eligible) {
    if (slots <= 0) break
    tiers[rect.id] = 'live'
    slots -= 1
  }

  return tiers
}
```

- [ ] **Step 6: Run the checks**

Run: `npm run verify:viewport`
Expected: `25/25 passed`.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/canvas/lod.ts scripts/viewport-entry.cjs scripts/verify-viewport.cjs
git commit -m "feat(m3): pure tier assignment with budget and eviction"
```

---

### Task 3: The session registry

The heart of the milestone. The registry owns panel lifetime; React does not.
It takes its bridge and its terminal factory as parameters, so this task's
checks run under plain node with fakes and no DOM at all.

**Files:**
- Create: `src/renderer/session/panel-session.ts`
- Create: `src/renderer/session/session-registry.ts`
- Create: `scripts/registry-entry.cjs`
- Create: `scripts/verify-registry.cjs`
- Modify: `package.json` (add `verify:registry`, add it to `verify`)

**Interfaces:**
- Consumes: `PanelId`, `PanelSpec`, `PtyDataChunk`, `PtyExitInfo` from `src/shared/types.ts`; `Tier` from `src/renderer/canvas/lod.ts`.
- Produces:

```ts
// panel-session.ts
type PanelStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running'; pid: number }
  | { kind: 'exited'; code: number }
  | { kind: 'error'; message: string }

type PanelSpecTemplate = Omit<PanelSpec, 'cols' | 'rows'>

interface SessionHandle {
  readonly host: HTMLElement
  attach(): void
  detach(): void
  write(data: string): void
  size(): { cols: number; rows: number }
  tail(lines: number): string[]
  focus(): void
  onInput(listener: (data: string) => void): void
  dispose(): void
}

interface SessionFactory { create(id: PanelId): SessionHandle }

interface PanelSession {
  id: PanelId
  spec: PanelSpecTemplate
  handle: SessionHandle
  status: PanelStatus
  tier: Tier
  spawned: boolean
  lastFocusedAt: number
}

// session-registry.ts
interface Bridge { pty: { ... } }        // structural subset of window.canvas
interface Registry {
  ensure(id: PanelId, spec: PanelSpecTemplate): PanelSession
  get(id: PanelId): PanelSession | undefined
  all(): PanelSession[]
  applyTiers(tiers: Record<PanelId, Tier>): void
  /** Called by the view AFTER it puts handle.host into the document. */
  attachSlot(id: PanelId): void
  /** Called by the view's cleanup, before the host leaves the document. */
  detachSlot(id: PanelId): void
  focus(id: PanelId): void
  lastFocusedAt(): Record<PanelId, number>
  version(): number
  subscribe(listener: () => void): () => void
  disposeAll(): void
}
function createRegistry(deps: { bridge: Bridge; factory: SessionFactory; now?: () => number }): Registry
```

- [ ] **Step 1: Write the bundle entry**

Create `scripts/registry-entry.cjs`, mirroring `viewport-entry.cjs`:

```js
/* esbuild entry: re-exports the registry for plain-node testing.
   The registry takes its bridge and factory as parameters precisely so this
   bundle needs no DOM and no Electron. */
export * from '../src/renderer/session/session-registry'
export * from '../src/renderer/session/panel-session'
```

- [ ] **Step 2: Write the failing checks**

Create `scripts/verify-registry.cjs`:

```js
/* Verifies panel session lifetime.
   Run with: npm run verify:registry

   Plain node: the registry never touches window or document, so its logic is
   testable with fakes. The check that matters most is 5 — demotion must not
   kill a PTY. That failure is silent in a running app: the panel comes back
   on screen looking like a fresh terminal and the agent's work is gone. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'registry.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'registry-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs'
})
const { createRegistry } = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

/** Records every bridge call so assertions can be made about what was NOT called. */
function fakeBridge() {
  const calls = { create: [], write: [], resize: [], kill: [], dataListeners: 0 }
  let onData = null
  let onExit = null
  return {
    calls,
    emitData: (chunk) => onData && onData(chunk),
    emitExit: (info) => onExit && onExit(info),
    pty: {
      async create(spec) {
        calls.create.push(spec)
        return { panelId: spec.panelId, pid: 4000 + calls.create.length, command: spec.command, cwd: spec.cwd }
      },
      async write(req) { calls.write.push(req) },
      async resize(req) { calls.resize.push(req) },
      async kill(id) { calls.kill.push(id) },
      onData(listener) { calls.dataListeners++; onData = listener; return () => { onData = null } },
      onExit(listener) { onExit = listener; return () => { onExit = null } }
    }
  }
}

function fakeFactory() {
  const made = new Map()
  return {
    made,
    create(id) {
      const state = {
        id, attached: false, disposed: false, written: [], cols: 80, rows: 24,
        focused: false, inputListener: null
      }
      made.set(id, state)
      return {
        host: { id },
        attach() { state.attached = true },
        detach() { state.attached = false },
        write(data) { state.written.push(data) },
        size() { return { cols: state.cols, rows: state.rows } },
        tail() { return state.written.slice(-3) },
        focus() { state.focused = true },
        onInput(listener) { state.inputListener = listener },
        dispose() { state.disposed = true }
      }
    }
  }
}

const SPEC = { panelId: 'p1', cwd: '/tmp', command: 'zsh', args: [] }
const setup = () => {
  const bridge = fakeBridge()
  const factory = fakeFactory()
  let clock = 1000
  const registry = createRegistry({ bridge, factory, now: () => (clock += 10) })
  return { bridge, factory, registry }
}
const tick = () => new Promise((r) => setImmediate(r))

;(async () => {
  // 1. One data subscription for the whole canvas, not one per panel.
  {
    const { bridge, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.ensure('p2', { ...SPEC, panelId: 'p2' })
    registry.ensure('p3', { ...SPEC, panelId: 'p3' })
    ok(1, bridge.calls.dataListeners === 1, `listeners=${bridge.calls.dataListeners}`)
  }

  // 2. Creating a session does NOT spawn a PTY. Spawning happens on first
  //    live-ification, when a fitted terminal can supply real cols/rows.
  {
    const { bridge, registry } = setup()
    registry.ensure('p1', SPEC)
    await tick()
    ok(2, bridge.calls.create.length === 0, `create calls=${bridge.calls.create.length}`)
  }

  // 3. Going live attaches, then spawns with the fitted size.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1') // the view calls this once the host is mounted
    await tick()
    const spawned = bridge.calls.create[0]
    ok(3, factory.made.get('p1').attached && spawned && spawned.cols === 80 && spawned.rows === 24,
      JSON.stringify(spawned))
  }

  // 4. Chunks route to the right session and nowhere else.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.ensure('p2', { ...SPEC, panelId: 'p2' })
    registry.applyTiers({ p1: 'live', p2: 'live' })
    registry.attachSlot('p1')
    registry.attachSlot('p2')
    await tick()
    bridge.emitData({ panelId: 'p1', data: 'hello' })
    ok(4, factory.made.get('p1').written.includes('hello') &&
          !factory.made.get('p2').written.includes('hello'),
      JSON.stringify(factory.made.get('p2').written))
  }

  // 5. THE CHECK. Demotion detaches but never kills. A zoom gesture must not
  //    destroy a running agent.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.applyTiers({ p1: 'card' })
    registry.detachSlot('p1')
    await tick()
    const state = factory.made.get('p1')
    ok(5, bridge.calls.kill.length === 0 && !state.attached && !state.disposed,
      `kills=${bridge.calls.kill.length} attached=${state.attached} disposed=${state.disposed}`)
  }

  // 6. Output keeps arriving for a demoted panel and lands in its buffer.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.applyTiers({ p1: 'card' })
    registry.detachSlot('p1')
    bridge.emitData({ panelId: 'p1', data: 'while-carded' })
    ok(6, factory.made.get('p1').written.includes('while-carded'),
      JSON.stringify(factory.made.get('p1').written))
  }

  // 7. Re-promotion re-attaches and does NOT spawn a second PTY.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.applyTiers({ p1: 'card' })
    registry.detachSlot('p1')
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    ok(7, bridge.calls.create.length === 1 && factory.made.get('p1').attached,
      `create calls=${bridge.calls.create.length}`)
  }

  // 8. Exit updates status and leaves the session in place to be read.
  {
    const { bridge, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    bridge.emitExit({ panelId: 'p1', exitCode: 3 })
    const session = registry.get('p1')
    ok(8, session.status.kind === 'exited' && session.status.code === 3,
      JSON.stringify(session.status))
  }

  // 9. A spawn failure becomes an error status, not an unhandled rejection.
  {
    const bridge = fakeBridge()
    bridge.pty.create = async () => { throw new Error('command not found: nope') }
    const factory = fakeFactory()
    const registry = createRegistry({ bridge, factory })
    registry.ensure('p1', { ...SPEC, command: 'nope' })
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const status = registry.get('p1').status
    ok(9, status.kind === 'error' && status.message.includes('nope'), JSON.stringify(status))
  }

  // 10. Focus records a timestamp, which is what eviction orders by.
  {
    const { registry } = setup()
    registry.ensure('p1', SPEC)
    registry.ensure('p2', { ...SPEC, panelId: 'p2' })
    registry.focus('p1')
    registry.focus('p2')
    const stamps = registry.lastFocusedAt()
    ok(10, stamps.p2 > stamps.p1, JSON.stringify(stamps))
  }

  // 11. Subscribers are notified on status change, and version() advances so
  //     useSyncExternalStore has a stable scalar to compare.
  {
    const { bridge, registry } = setup()
    let notifications = 0
    registry.subscribe(() => notifications++)
    registry.ensure('p1', SPEC)
    const before = registry.version()
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    ok(11, notifications > 0 && registry.version() > before,
      `notifications=${notifications} version ${before} -> ${registry.version()}`)
  }

  // 12. disposeAll is the ONLY path that kills.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.disposeAll()
    ok(12, bridge.calls.kill.length === 1 && factory.made.get('p1').disposed,
      `kills=${JSON.stringify(bridge.calls.kill)}`)
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(failed.length ? 1 : 0)
})()
```

- [ ] **Step 3: Add the npm script**

In `package.json`, add after `verify:viewport`:

```json
"verify:registry": "node scripts/verify-registry.cjs",
```

and put it into the `verify` chain, right after `verify:viewport`:

```json
"verify": "npm run verify:viewport && npm run verify:registry && npm run verify:pty && npm run verify:pty-manager && npm run verify:window && npm run verify:ipc && npm run build && npm run verify:canvas && npm run verify:xterm",
```

- [ ] **Step 4: Run and watch it fail**

Run: `npm run verify:registry`
Expected: the bundle step fails — `Could not resolve "../src/renderer/session/session-registry"`.

- [ ] **Step 5: Write panel-session.ts**

```ts
import type { PanelId, PanelSpec } from '@shared/types'
import type { Tier } from '@renderer/canvas/lod'

/**
 * One panel's retained state. Created once, disposed once — never by tiering.
 *
 * The split between this and the React view is the point of M3: "this
 * component is unmounting" and "this panel is going away" were the same
 * statement in M1, and culling makes them different. Confusing them kills a
 * running agent silently.
 */

export type PanelStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running'; pid: number }
  | { kind: 'exited'; code: number }
  | { kind: 'error'; message: string }

/** cols/rows are absent on purpose: they are not known until the panel is fitted. */
export type PanelSpecTemplate = Omit<PanelSpec, 'cols' | 'rows'>

/**
 * Everything the registry needs from a terminal, and nothing about xterm.
 * The registry is testable under plain node because this interface is all it
 * sees; the real implementation lives in terminal/session-factory.ts.
 */
export interface SessionHandle {
  readonly host: HTMLElement
  /** Open (first time only), take a WebGL context, fit. */
  attach(): void
  /** Drop the WebGL context and take the host out of the document. */
  detach(): void
  write(data: string): void
  size(): { cols: number; rows: number }
  /** Last N non-empty buffer lines, for the card tier. */
  tail(lines: number): string[]
  focus(): void
  onInput(listener: (data: string) => void): void
  dispose(): void
}

export interface SessionFactory {
  create(id: PanelId): SessionHandle
}

export interface PanelSession {
  id: PanelId
  spec: PanelSpecTemplate
  handle: SessionHandle
  status: PanelStatus
  tier: Tier
  spawned: boolean
  lastFocusedAt: number
}
```

- [ ] **Step 6: Write session-registry.ts**

```ts
import type { PanelId, PtyCreateResult, PtyDataChunk, PtyExitInfo } from '@shared/types'
import type { Tier } from '@renderer/canvas/lod'
import type {
  PanelSession,
  PanelSpecTemplate,
  SessionFactory,
  SessionHandle
} from './panel-session'

/**
 * Owns every panel's session for the lifetime of the renderer.
 *
 * Deliberately free of React and of window/document: the bridge and the
 * terminal factory are injected, which is what lets verify:registry drive the
 * whole lifecycle under plain node with fakes.
 */

export interface Bridge {
  pty: {
    create(spec: {
      panelId: PanelId
      cwd: string
      command: string
      args: string[]
      cols: number
      rows: number
    }): Promise<PtyCreateResult>
    write(req: { panelId: PanelId; data: string }): Promise<void>
    resize(req: { panelId: PanelId; cols: number; rows: number }): Promise<void>
    kill(panelId: PanelId): Promise<void>
    onData(listener: (chunk: PtyDataChunk) => void): () => void
    onExit(listener: (info: PtyExitInfo) => void): () => void
  }
}

export interface Registry {
  ensure(id: PanelId, spec: PanelSpecTemplate): PanelSession
  get(id: PanelId): PanelSession | undefined
  all(): PanelSession[]
  applyTiers(tiers: Record<PanelId, Tier>): void
  focus(id: PanelId): void
  lastFocusedAt(): Record<PanelId, number>
  version(): number
  subscribe(listener: () => void): () => void
  disposeAll(): void
}

export interface RegistryDeps {
  bridge: Bridge
  factory: SessionFactory
  now?: () => number
}

export function createRegistry(deps: RegistryDeps): Registry {
  const { bridge, factory } = deps
  const now = deps.now ?? (() => Date.now())

  const sessions = new Map<PanelId, PanelSession>()
  const listeners = new Set<() => void>()
  let version = 0

  /**
   * One subscription for the whole canvas. One per panel would make every
   * chunk cross N listeners and be discarded N-1 times — twenty times the work
   * to deliver the same bytes with twenty panels open.
   */
  bridge.pty.onData((chunk: PtyDataChunk) => {
    // Written straight through to xterm, never into React state: 16ms-batched
    // output through setState would re-render the canvas at 60Hz for content
    // React does not draw.
    sessions.get(chunk.panelId)?.handle.write(chunk.data)
  })

  bridge.pty.onExit((info: PtyExitInfo) => {
    const session = sessions.get(info.panelId)
    if (!session) return
    session.status = { kind: 'exited', code: info.exitCode }
    session.handle.write(
      `\r\n\x1b[38;5;244m[process exited with code ${info.exitCode}]\x1b[0m\r\n`
    )
    bump()
  })

  function bump(): void {
    version += 1
    for (const listener of listeners) listener()
  }

  function spawn(session: PanelSession): void {
    // Attach first: cols/rows must come from a fitted terminal so the shell's
    // first TIOCGWINSZ is correct. Spawning at 80x24 and resizing after makes
    // agent TUIs draw their frame twice.
    const { cols, rows } = session.handle.size()
    session.spawned = true
    session.status = { kind: 'starting' }
    bump()

    session.handle.onInput((data) => {
      void bridge.pty.write({ panelId: session.id, data })
    })

    bridge.pty
      .create({ panelId: session.id, cwd: session.spec.cwd, command: session.spec.command,
        args: session.spec.args, cols, rows })
      .then((result) => {
        session.status = { kind: 'running', pid: result.pid }
        bump()
      })
      .catch((error: unknown) => {
        session.status = { kind: 'error', message: String(error) }
        bump()
      })
  }

  /**
   * Tier changes only flip a flag and notify. Attachment cannot happen here:
   * attach() calls term.open(), which measures a laid-out node, and the host
   * is not in the document until React has rendered a slot for it — which it
   * only does once the tier says 'live'. So the view calls attachSlot() back
   * once the host is actually mounted.
   */
  function setTier(session: PanelSession, tier: Tier): void {
    session.tier = tier
    bump()
  }

  return {
    ensure(id, spec) {
      const existing = sessions.get(id)
      if (existing) return existing
      const session: PanelSession = {
        id,
        spec,
        handle: factory.create(id),
        status: { kind: 'idle' },
        tier: 'card',
        spawned: false,
        lastFocusedAt: 0
      }
      sessions.set(id, session)
      // Deliberately no bump(): ensure() is called while Canvas renders, and
      // notifying a useSyncExternalStore subscriber mid-render makes React
      // warn about updating a component while rendering another. The panel
      // list living in React state is already what triggers that render.
      return session
    },

    get: (id) => sessions.get(id),
    all: () => [...sessions.values()],

    applyTiers(tiers) {
      for (const session of sessions.values()) {
        const next = tiers[session.id] ?? 'card'
        if (next !== session.tier) setTier(session, next)
      }
    },

    attachSlot(id) {
      const session = sessions.get(id)
      if (!session) return
      // The host is in the document now, so open() can measure it.
      session.handle.attach()
      if (!session.spawned) {
        spawn(session)
        return
      }
      // Already running: the grid may have changed while it was carded.
      const { cols, rows } = session.handle.size()
      void bridge.pty.resize({ panelId: session.id, cols, rows })
    },

    detachSlot(id) {
      const session = sessions.get(id)
      if (!session) return
      // Frees the WebGL context. Never kills: the PTY keeps running and its
      // output keeps arriving, which is the entire reason this registry exists.
      session.handle.detach()
    },

    focus(id) {
      const session = sessions.get(id)
      if (!session) return
      session.lastFocusedAt = now()
      if (session.tier === 'live') session.handle.focus()
      bump()
    },

    lastFocusedAt() {
      const stamps: Record<PanelId, number> = {}
      for (const session of sessions.values()) stamps[session.id] = session.lastFocusedAt
      return stamps
    },

    version: () => version,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    disposeAll() {
      // The only place a PTY is killed.
      for (const session of sessions.values()) {
        session.handle.dispose()
        if (session.spawned) void bridge.pty.kill(session.id)
      }
      sessions.clear()
      bump()
    }
  }
}
```

- [ ] **Step 7: Run the checks**

Run: `npm run verify:registry`
Expected: `12/12 passed`.

If check 3 fails on `cols`, `size()` is being read before `attach()` — the
order inside `attachSlot` is attach, then size, then create.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/session scripts/registry-entry.cjs scripts/verify-registry.cjs package.json
git commit -m "feat(m3): session registry that outlives React"
```

---

### Task 4: Split terminal construction from attachment

`createTerminal` currently constructs and calls `term.open(container)` in one
breath. Tiering needs those apart, because `open()` measures font metrics and
cannot run against a node outside the document.

**Files:**
- Modify: `src/renderer/terminal/create-terminal.ts`
- Create: `src/renderer/terminal/session-factory.ts`

**Interfaces:**
- Consumes: `SessionHandle`, `SessionFactory` from `src/renderer/session/panel-session.ts`.
- Produces: `createTerminal(): TerminalHandles` (now returns detached, no `container` parameter); `attachTerminal(handles: TerminalHandles, host: HTMLElement): void`; `detachTerminal(handles: TerminalHandles): void`; `createSessionFactory(): SessionFactory`.

- [ ] **Step 1: Rework create-terminal.ts**

Keep the `theme` constant and the `Terminal` options exactly as they are — the
font metrics must not change, or panels resize when they swap tier. Replace the
bottom half of the file:

```ts
export interface TerminalHandles {
  term: Terminal
  fitAddon: FitAddon
  webgl: WebglAddon | null
  rendererKind: 'webgl' | 'dom'
  /** open() has been called once; it must never be called again. */
  opened: boolean
  /** Set when a context loss makes WebGL untrustworthy for this terminal. */
  webglDisabled: boolean
}

/**
 * Constructs a Terminal WITHOUT opening it. Attachment is separate because
 * open() measures font metrics against a laid-out node, so it cannot run while
 * the host is out of the document — and a panel that has never been on screen
 * has no size to be measured.
 */
export function createTerminal(): TerminalHandles {
  const term = new Terminal({ /* unchanged options */ })
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  return { term, fitAddon, webgl: null, rendererKind: 'dom', opened: false, webglDisabled: false }
}

/**
 * Puts a terminal on screen: open once, take a WebGL context, fit.
 * The host must already be in the document.
 */
export function attachTerminal(handles: TerminalHandles, host: HTMLElement): void {
  if (!handles.opened) {
    handles.term.open(host)
    handles.opened = true
  }

  if (!handles.webglDisabled && !handles.webgl) {
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        // A lost context leaves the canvas blank. Drop it, and do not ask for
        // another on the next promotion — a terminal that has lost one context
        // tends to lose the next, and the DOM renderer at least draws.
        handles.webgl?.dispose()
        handles.webgl = null
        handles.webglDisabled = true
        handles.rendererKind = 'dom'
      })
      handles.term.loadAddon(webgl)
      handles.webgl = webgl
      handles.rendererKind = 'webgl'
    } catch (error) {
      console.warn('[terminal] WebGL renderer unavailable, using DOM renderer', error)
      handles.webglDisabled = true
      handles.rendererKind = 'dom'
    }
  }

  handles.fitAddon.fit()
  handles.term.refresh(0, handles.term.rows - 1)
}

/** Frees the WebGL context. The Terminal and its buffer survive untouched. */
export function detachTerminal(handles: TerminalHandles): void {
  handles.webgl?.dispose()
  handles.webgl = null
  handles.rendererKind = 'dom'
}

export function disposeTerminal(handles: TerminalHandles): void {
  handles.webgl?.dispose()
  handles.term.dispose()
}
```

If Task 1's check 4 failed (re-attachment did not repaint), the `term.refresh`
call above is what fixes it — it is already included.

- [ ] **Step 2: Write the session factory**

Create `src/renderer/terminal/session-factory.ts`:

```ts
import type { PanelId } from '@shared/types'
import type { SessionFactory, SessionHandle } from '@renderer/session/panel-session'
import {
  attachTerminal,
  createTerminal,
  detachTerminal,
  disposeTerminal,
  type TerminalHandles
} from './create-terminal'

/**
 * The real SessionHandle: xterm behind the interface the registry sees.
 *
 * The host div is created once, detached, and reused forever. Tiering moves
 * this node in and out of the document; it never recreates it, because
 * term.open() is not repeatable and everything xterm has drawn lives inside.
 */
function createHandle(id: PanelId): SessionHandle {
  const host = document.createElement('div')
  host.className = 'panel__terminal'
  host.dataset.panelId = id

  let handles: TerminalHandles | null = null

  const ensure = (): TerminalHandles => {
    if (!handles) handles = createTerminal()
    return handles
  }

  return {
    host,
    attach() {
      const h = ensure()
      // The caller has already put host into the document; open() measures it.
      attachTerminal(h, host)
    },
    detach() {
      if (handles) detachTerminal(handles)
      host.remove()
    },
    write(data) {
      ensure().term.write(data)
    },
    size() {
      const h = ensure()
      return { cols: h.term.cols, rows: h.term.rows }
    },
    tail(lines) {
      if (!handles) return []
      // Read xterm's own parsed grid rather than keeping a second copy of every
      // byte and hand-rolling an ANSI stripper.
      const buffer = handles.term.buffer.active
      const out: string[] = []
      for (let i = buffer.length - 1; i >= 0 && out.length < lines; i--) {
        const text = buffer.getLine(i)?.translateToString(true).trim()
        if (text) out.unshift(text)
      }
      return out
    },
    focus() {
      handles?.term.focus()
    },
    onInput(listener) {
      ensure().term.onData(listener)
    },
    dispose() {
      if (handles) disposeTerminal(handles)
      handles = null
      host.remove()
    }
  }
}

export function createSessionFactory(): SessionFactory {
  return { create: createHandle }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: it FAILS in `TerminalPanel.tsx`, which still calls
`createTerminal(container)` with an argument and destructures `rendererKind`.
That is expected — Task 5 rewrites that file. Do not patch it here; do not
commit a broken typecheck either. Go straight to Task 5 and commit both
together.

---

### Task 5: Wire the canvas to real terminals

This is the task that ends M2's regression: the app shows live terminals again,
now on the canvas. It is one task because none of its pieces is independently
runnable — the panel data, the view, and the canvas wiring only typecheck
together.

**Files:**
- Create: `src/renderer/panels/panels.ts`
- Create: `src/renderer/session/useRegistry.ts`
- Rewrite: `src/renderer/components/TerminalPanel.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/canvas/useViewport.ts` (expose size + a spawn hook)
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Delete: `src/renderer/canvas/PlaceholderPanel.tsx`, `src/renderer/canvas/placeholder-panels.ts`

**Interfaces:**
- Consumes: `createRegistry`, `Registry` (Task 3); `createSessionFactory` (Task 4); `assignTiers`, `LIVE_BUDGET` (Task 2); `hitTest`, `screenToWorld`, `WorldRect` (M2).
- Produces: `interface Panel { rect: WorldRect; spec: PanelSpecTemplate }`; `SEED_PANELS: Panel[]`; `makePanel(id: string, centre: Point): Panel`; `useRegistryVersion(registry: Registry): number`.

- [ ] **Step 1: Write the panel data**

Create `src/renderer/panels/panels.ts`:

```ts
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { Point, WorldRect } from '@renderer/canvas/viewport'

/**
 * A panel is its geometry plus its spec. cols/rows are deliberately absent
 * from the spec: they are not known until the panel is attached and fitted,
 * and inventing them here would reintroduce the spawn-at-80x24 problem lazy
 * spawning exists to avoid.
 */
export interface Panel {
  rect: WorldRect
  spec: PanelSpecTemplate
}

export const PANEL_W = 720
export const PANEL_H = 460

const shell = (panelId: string, cwd = '~'): PanelSpecTemplate => ({
  panelId,
  cwd,
  command: process.env.SHELL ?? '/bin/zsh',
  args: ['-l']
})

/**
 * Scattered well outside the initial viewport, exactly as M2's placeholders
 * were: panning to find something stays testable by hand, and culling has
 * something to cull.
 */
export const SEED_PANELS: Panel[] = [
  { rect: { id: 's01', x: 0, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s01') },
  { rect: { id: 's02', x: 800, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s02') },
  { rect: { id: 's03', x: 1600, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s03') },
  { rect: { id: 's04', x: 0, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s04') },
  { rect: { id: 's05', x: 800, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s05') },
  { rect: { id: 's06', x: 1600, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s06') },
  { rect: { id: 's07', x: -900, y: 270, w: PANEL_W, h: PANEL_H }, spec: shell('s07') },
  { rect: { id: 's08', x: -900, y: 810, w: PANEL_W, h: PANEL_H }, spec: shell('s08') },
  { rect: { id: 's09', x: 2500, y: 270, w: PANEL_W, h: PANEL_H }, spec: shell('s09') },
  { rect: { id: 's10', x: 400, y: 1100, w: PANEL_W, h: PANEL_H }, spec: shell('s10') },
  { rect: { id: 's11', x: 1200, y: 1100, w: PANEL_W, h: PANEL_H }, spec: shell('s11') },
  { rect: { id: 's12', x: 400, y: -640, w: PANEL_W, h: PANEL_H }, spec: shell('s12') }
]

/** Cmd+N: a panel centred on wherever the camera is looking. */
export function makePanel(id: string, centre: Point): Panel {
  return {
    rect: { id, x: centre.x - PANEL_W / 2, y: centre.y - PANEL_H / 2, w: PANEL_W, h: PANEL_H },
    spec: shell(id)
  }
}
```

Note `process.env.SHELL` is read in the renderer, where it is undefined — the
`??` fallback is what actually applies. That is fine and deliberate: the main
process resolves the real login shell environment for the PTY anyway
(`shell-env.ts`), so this string only needs to name an executable that exists.

- [ ] **Step 2: Write the React binding**

Create `src/renderer/session/useRegistry.ts`:

```ts
import { useSyncExternalStore } from 'react'
import type { Registry } from './session-registry'

/**
 * Subscribes React to registry STATUS changes only. Terminal output never
 * comes through here — it is written straight into xterm, because routing
 * 16ms-batched PTY output through setState would re-render the canvas at 60Hz
 * for content React does not draw.
 *
 * The snapshot is a version integer rather than the session map: React needs a
 * value it can compare by identity, and the sessions are mutable by design.
 */
export function useRegistryVersion(registry: Registry): number {
  return useSyncExternalStore(
    (listener) => registry.subscribe(listener),
    () => registry.version(),
    () => registry.version()
  )
}
```

- [ ] **Step 3: Rewrite TerminalPanel as a view**

Replace `src/renderer/components/TerminalPanel.tsx` entirely. Note what is
*gone*: no `pty.create`, no `pty.kill`, no data subscription, no `disposed`
flag. The component owns nothing, so its cleanup destroys nothing.

Note what else is gone: the `ResizeObserver`. The spec calls out a trap where
detaching a host makes its content box zero, the observer fires at 0x0, and a
running agent's shell is resized to roughly 1x1. Rather than guarding against
that, this design removes the cause — a panel's size is fixed in world
coordinates, so nothing but attachment changes its box, and `attachSlot` already
fits on every promotion. **Do not add a `ResizeObserver` back in M3.** When M4
adds panel resizing it will need one, and it will need the zero-size guard.

```tsx
import { memo, useEffect, useRef, type JSX } from 'react'
import type { PanelSession, PanelStatus } from '@renderer/session/panel-session'
import type { WorldRect } from '@renderer/canvas/viewport'

export interface TerminalPanelProps {
  session: PanelSession
  rect: WorldRect
  selected: boolean
  interactive: boolean
  onSelect: (id: string) => void
  onFocus: (id: string) => void
  /** Called once the retained host is in the document, so it can be opened. */
  onSlotMount: (id: string) => void
  /** Called before the host leaves the document, so its context can be freed. */
  onSlotUnmount: (id: string) => void
}

const CARD_LINES = 6

function TerminalPanelImpl({
  session, rect, selected, interactive, onSelect, onFocus, onSlotMount, onSlotUnmount
}: TerminalPanelProps): JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const live = session.tier === 'live'

  useEffect(() => {
    const slot = slotRef.current
    if (!slot || !live) return

    // Order matters: the host must be IN the document before the registry
    // opens a terminal against it, because open() measures a laid-out node.
    slot.appendChild(session.handle.host)
    onSlotMount(session.id)

    // Cleanup frees the WebGL context and removes the node. It does NOT kill
    // or dispose anything: this component unmounting means the panel scrolled
    // off screen, not that the panel is going away.
    return () => {
      onSlotUnmount(session.id)
      if (session.handle.host.parentNode === slot) slot.removeChild(session.handle.host)
    }
  }, [live, session.id, session.handle.host, onSlotMount, onSlotUnmount])

  return (
    <div
      className={`panel${selected ? ' panel--selected' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <header
        className="panel__chrome"
        onMouseDown={(event) => {
          // Chrome selects; body passes through. stopPropagation keeps the
          // canvas from reading this as a background click and deselecting.
          event.stopPropagation()
          onSelect(session.id)
        }}
      >
        <span className="panel__title">{session.spec.command}</span>
        <StatusBadge status={session.status} />
      </header>

      {live ? (
        <div
          className="panel__slot"
          ref={slotRef}
          onMouseDown={(event) => {
            event.stopPropagation()
            onFocus(session.id)
            // Outside the interaction band xterm's own coordinate math is off
            // by a factor of the zoom, so the click would land on the wrong
            // cell. Focus the panel and stop; typing still works, and the
            // correction lands in M4 with drag and resize.
            if (!interactive) event.preventDefault()
          }}
        />
      ) : (
        <PanelCard session={session} />
      )}
    </div>
  )
}

function PanelCard({ session }: { session: PanelSession }): JSX.Element {
  const lines = session.spawned ? session.handle.tail(CARD_LINES) : []
  return (
    <div className="panel__card">
      {session.spawned ? (
        lines.map((line, i) => (
          <div className="panel__card-line" key={i}>{line}</div>
        ))
      ) : (
        <div className="panel__card-idle">not started</div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: PanelStatus }): JSX.Element {
  switch (status.kind) {
    case 'idle':
      return <span className="badge badge--pending">idle</span>
    case 'starting':
      return <span className="badge badge--pending">starting…</span>
    case 'running':
      return <span className="badge badge--running">pid {status.pid}</span>
    case 'exited':
      return <span className="badge badge--exited">exited {status.code}</span>
    case 'error':
      return <span className="badge badge--error">{status.message}</span>
  }
}

// Memoized for the reason PlaceholderPanel already documented: Canvas
// re-renders on every mousemove for the HUD cursor, and a 60Hz cascade into
// panels backed by WebGL contexts is a frame-rate cliff.
export const TerminalPanel = memo(TerminalPanelImpl)
```

- [ ] **Step 4: Wire the canvas**

Rewrite `src/renderer/canvas/Canvas.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from 'react'
import { CanvasHud } from './CanvasHud'
import { useViewport } from './useViewport'
import { assignTiers } from './lod'
import { hitTest, screenToWorld, type Point } from './viewport'
import { TerminalPanel } from '@renderer/components/TerminalPanel'
import { createRegistry } from '@renderer/session/session-registry'
import { useRegistryVersion } from '@renderer/session/useRegistry'
import { createSessionFactory } from '@renderer/terminal/session-factory'
import { makePanel, SEED_PANELS, type Panel } from '@renderer/panels/panels'

/** Clicks reach xterm only near 1:1; see the spec's "Focus and input". */
const INTERACT_MIN_SCALE = 0.9
const INTERACT_MAX_SCALE = 1.1
/** Promote immediately, demote late: the other half of the anti-thrash story. */
const DEMOTE_DELAY_MS = 250

const registry = createRegistry({
  bridge: window.canvas,
  factory: createSessionFactory()
})

// A renderer teardown that skips React cleanup (Cmd+R, Cmd+W) is handled
// main-side by window-lifecycle.ts; this covers the orderly path.
window.addEventListener('beforeunload', () => registry.disposeAll())

export function Canvas(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [panels, setPanels] = useState<Panel[]>(SEED_PANELS)
  const rects = useMemo(() => panels.map((p) => p.rect), [panels])
  const viewport = useViewport(hostRef, rects, onSpawn)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })
  const version = useRegistryVersion(registry)

  // Sessions exist for every panel; only their tier changes. In a memo rather
  // than loose in the render body so it re-runs only when the panel list does.
  useMemo(() => {
    for (const panel of panels) registry.ensure(panel.rect.id, panel.spec)
  }, [panels])

  // Stable identities: these go into TerminalPanel's effect deps, and a fresh
  // arrow each render would tear the terminal down and reopen it every frame.
  const onSlotMount = useCallback((id: string) => registry.attachSlot(id), [])
  const onSlotUnmount = useCallback((id: string) => registry.detachSlot(id), [])
  const onFocusPanel = useCallback((id: string) => {
    setSelectedId(id)
    setFocusedId(id)
    registry.focus(id)
  }, [])
  const onSpawn = useCallback(
    (centre: Point) =>
      setPanels((current) => [...current, makePanel(`n${current.length + 1}`, centre)]),
    []
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const tiers = assignTiers({
      rects,
      viewport,
      size: { width: bounds.width, height: bounds.height },
      focusedId,
      lastFocusedAt: registry.lastFocusedAt()
    })

    // Promotion is immediate so a panel is live by the time you look at it.
    // Demotion waits, so panning along an edge does not destroy and recreate a
    // WebGL context every frame. Held-back demotions keep their current tier.
    const immediate: Record<string, 'live' | 'card'> = {}
    let hasDemotion = false
    for (const [id, tier] of Object.entries(tiers)) {
      const current = registry.get(id)?.tier ?? 'card'
      const demoting = tier === 'card' && current === 'live'
      immediate[id] = demoting ? 'live' : tier
      if (demoting) hasDemotion = true
    }
    registry.applyTiers(immediate)

    if (!hasDemotion) return
    const timer = setTimeout(() => registry.applyTiers(tiers), DEMOTE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [rects, viewport, focusedId, version])

  const toWorld = (event: MouseEvent<HTMLDivElement>): Point | null => {
    const host = hostRef.current
    if (!host) return null
    const bounds = host.getBoundingClientRect()
    return screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewport)
  }

  const onMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    // Only background clicks reach here; panels stopPropagation.
    const world = toWorld(event)
    setSelectedId(world ? hitTest(rects, world) : null)
  }

  const onMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    const world = toWorld(event)
    if (world) setCursor(world)
  }

  const interactive =
    viewport.scale >= INTERACT_MIN_SCALE && viewport.scale <= INTERACT_MAX_SCALE

  return (
    <div className="canvas" ref={hostRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove}>
      <div
        className="world"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
        {panels.map((panel) => {
          const session = registry.get(panel.rect.id)
          if (!session) return null
          return (
            <TerminalPanel
              key={panel.rect.id}
              session={session}
              rect={panel.rect}
              selected={panel.rect.id === selectedId}
              interactive={interactive}
              onSelect={setSelectedId}
              onSlotMount={onSlotMount}
              onSlotUnmount={onSlotUnmount}
              onFocus={onFocusPanel}
            />
          )
        })}
      </div>
      <CanvasHud viewport={viewport} cursor={cursor} selectedId={selectedId} />
    </div>
  )
}
```

- [ ] **Step 5: Add Cmd+N to useViewport**

`useViewport` already owns the Cmd-keyed shortcuts, so the spawn key belongs
there rather than in a second window listener that could disagree about
modifiers. Change the signature and add one case:

```ts
export function useViewport(
  hostRef: RefObject<HTMLElement | null>,
  rects: WorldRect[],
  onSpawn?: (worldCentre: Point) => void
): Viewport {
```

and inside the existing `switch (event.key)`:

```ts
        case 'n':
          // Cmd+N spawns at the viewport centre in WORLD coordinates, so a
          // panel appears where you are looking at any zoom.
          event.preventDefault()
          onSpawn?.(screenToWorld(centre, viewportRef.current))
          break
```

`useViewport` currently closes over `viewport` only through `setViewport`. Add
a ref so the key handler reads the current value without re-subscribing on
every viewport change:

```ts
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
```

and add `onSpawn` to that effect's dependency array. Import `screenToWorld` and
`useRef`.

- [ ] **Step 6: Update App.tsx**

```tsx
import type { JSX } from 'react'
import { Canvas } from './canvas/Canvas'

/**
 * M3: real terminals on the canvas. The M2 regression — placeholder rectangles
 * instead of a live terminal — ends here; Canvas owns the panels now.
 */
export function App(): JSX.Element {
  return (
    <div className="app">
      <Canvas />
    </div>
  )
}
```

- [ ] **Step 7: Style the new pieces**

In `src/renderer/styles.css`, delete the `.placeholder-panel*` rules and add:

```css
/* A panel is positioned once in WORLD pixels. Only .world's transform moves. */
.panel {
  position: absolute;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #262a3d;
  border-radius: 10px;
  background: #12131a;
}

.panel--selected {
  border-color: #7aa2f7;
}

/* The terminal's retained host is appended here; it must fill the slot so
   fit() computes the same grid every time the panel is promoted. */
.panel__slot {
  flex: 1;
  min-height: 0;
}

.panel__card {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  overflow: hidden;
  font-family: "SF Mono", Menlo, monospace;
  font-size: 13px;
  line-height: 1.35;
  color: #6f7690;
}

.panel__card-line {
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel__card-idle {
  color: #4a4f66;
  font-style: italic;
}
```

- [ ] **Step 8: Delete the M2 stand-ins**

```bash
rm src/renderer/canvas/PlaceholderPanel.tsx src/renderer/canvas/placeholder-panels.ts
```

- [ ] **Step 9: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both clean. If `@renderer/*` fails to resolve from a new directory,
the aliases are declared in **both** `electron.vite.config.ts` and the
tsconfigs — check both.

- [ ] **Step 10: Verify by hand**

Run: `npm run dev`

- A grid of panels appears; the ones on screen show live shells, the rest show "not started"
- Type `ls` in a panel — it runs
- Pinch out until the HUD reads under 50% — panels become cards, and the shells keep running
- Pinch back in — the same terminals return with their scrollback intact, not fresh shells
- Click a panel, pinch out, type — the keystrokes still reach the focused panel
- `Cmd+N` adds a panel at the centre of the view
- Pan slowly so a panel straddles the viewport edge — no flicker

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(m3): live terminals on the canvas with LOD tiers"
```

---

### Task 6: Integration checks under real Electron

**Files:**
- Create: `scripts/verify-panels.cjs`
- Modify: `package.json` (add `verify:panels`, add to `verify`)

**Interfaces:**
- Consumes: the built renderer in `out/`, and `pty:list` from the M1 contract.
- Produces: `npm run verify:panels`.

- [ ] **Step 1: Write the failing checks**

Create `scripts/verify-panels.cjs`:

```js
/* Verifies terminals on the canvas in a real renderer.
   Run with: npm run build && npm run verify:panels

   Check 2 is the reason this file exists: culling must not kill a PTY. That
   failure is silent in a running app — the panel returns looking like a fresh
   terminal — so it has to be caught mechanically. pty:list makes it possible. */
const { join } = require('node:path')
const { app, BrowserWindow } = require('electron')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const liveCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('.panel__slot .xterm').length`)
const cardCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('.panel__card').length`)
const sessionCount = (wc) =>
  wc.executeJavaScript(`window.canvas.pty.list().then((s) => s.length)`)
const zoomTo = (wc, key) =>
  wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', metaKey: true })), true`
  )

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
  const wc = win.webContents
  await sleep(3000) // shells must actually spawn

  const live = await liveCount(wc)
  const sessions = await sessionCount(wc)
  ok('1 on-screen panels are live terminals with off-screen panels carded',
    live > 0 && (await cardCount(wc)) > 0, `live=${live} cards=${await cardCount(wc)}`)

  ok('2 live panels never exceed the context budget', live <= 8, `live=${live}`)

  // Cmd+1 fits every panel on screen, which drops scale far below
  // LIVE_MIN_SCALE and must demote everything unfocused.
  await zoomTo(wc, '1')
  await sleep(1200) // longer than DEMOTE_DELAY_MS
  const liveAfterZoomOut = await liveCount(wc)
  const sessionsAfterZoomOut = await sessionCount(wc)

  ok('3 zooming out demotes panels to cards',
    liveAfterZoomOut < live, `live ${live} -> ${liveAfterZoomOut}`)

  ok('4 demotion does not kill a single PTY',
    sessionsAfterZoomOut === sessions && sessions > 0,
    `sessions ${sessions} -> ${sessionsAfterZoomOut}`)

  // Cmd+0 back to 100%: the same sessions must come back, not new ones.
  await zoomTo(wc, '0')
  await sleep(1200)
  ok('5 promotion reuses the existing sessions rather than spawning new ones',
    (await sessionCount(wc)) === sessions && (await liveCount(wc)) > 0,
    `sessions=${await sessionCount(wc)} live=${await liveCount(wc)}`)

  // The interaction gate. At 100% a body click focuses xterm's textarea; at
  // 70% the same click must not, because xterm would resolve it to the wrong
  // cell. Read activeElement rather than guessing from the click coordinates.
  const clickPanelBody = async () => {
    const box = await wc.executeJavaScript(
      `(() => { const s = document.querySelector('.panel__slot');
                if (!s) return null;
                const r = s.getBoundingClientRect();
                return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`
    )
    if (!box) return null
    wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await sleep(400)
    return wc.executeJavaScript(
      `(document.activeElement && document.activeElement.className) || ''`
    )
  }

  const activeAt100 = await clickPanelBody()
  // Two Cmd+- steps from 1.0 land at ~0.69, below INTERACT_MIN_SCALE.
  await zoomTo(wc, '-')
  await zoomTo(wc, '-')
  await sleep(600)
  const activeAtZoomedOut = await clickPanelBody()

  ok('6 body clicks reach xterm at 1:1 but are gated when zoomed out',
    String(activeAt100).includes('xterm-helper-textarea') &&
      !String(activeAtZoomedOut).includes('xterm-helper-textarea'),
    `at 100%: "${activeAt100}" / zoomed out: "${activeAtZoomedOut}"`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
```

- [ ] **Step 2: Add the npm script**

```json
"verify:panels": "unset ELECTRON_RUN_AS_NODE && node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/verify-panels.cjs",
```

and append it to the end of the `verify` chain, after `verify:xterm`:

```json
"verify": "npm run verify:viewport && npm run verify:registry && npm run verify:pty && npm run verify:pty-manager && npm run verify:window && npm run verify:ipc && npm run build && npm run verify:canvas && npm run verify:xterm && npm run verify:panels",
```

- [ ] **Step 3: Run the checks**

Run: `npm run build && npm run verify:panels`
Expected: `6/6 passed`.

If check 4 fails, stop and read `session-registry.ts`: something other than
`disposeAll` is calling `pty.kill`, which is the exact bug this milestone is
built to prevent. Do not "fix" it by loosening the assertion.

If check 3 fails with the live count unchanged, the demote timer is being
cleared by a re-render before it fires — check that the effect's dependency
array does not include something that changes every frame.

- [ ] **Step 4: Run the whole suite and commit**

Run: `npm run verify`
Expected: every suite green, ending with `6/6 passed`.

```bash
git add scripts/verify-panels.cjs package.json
git commit -m "test(m3): drive real terminals on the canvas under Electron"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md` (verify list, milestone table, architecture note)
- Modify: `CLAUDE.md` (commands table, architecture, load-bearing details)

**Interfaces:**
- Consumes: everything above.
- Produces: documentation matching the shipped code.

- [ ] **Step 1: Update the verify lists**

Both files list the verify scripts. Add the three new ones with their real
check counts — run each and read the number off the output rather than copying
from this plan:

| Script | Runtime | Covers |
|---|---|---|
| `verify:registry` | plain node | 12 checks: session lifetime with fakes |
| `verify:xterm` | real Electron | 5 checks: xterm survives a detached host |
| `verify:panels` | real Electron | 6 checks: terminals on the canvas, culling does not kill |

- [ ] **Step 2: Document the two lifetimes in CLAUDE.md**

Add to "Load-bearing details":

```markdown
**Two lifetimes, not one (`session/session-registry.ts`).** A panel's session
— its `Terminal` and its PTY — is created once and disposed once, in a
module-level registry outside React. The React panel is mounted and unmounted
freely by tiering and owns nothing. In M1 "this component is unmounting" and
"this panel is going away" were the same statement; culling makes them
different, and confusing them kills a running agent with no error anywhere.
**A tier change must never call `pty.kill`** — only `disposeAll` does.
`verify:registry` check 5 and `verify:panels` check 4 both exist to catch it.

**Lazy spawn (`session-registry.ts`).** A PTY is created when its panel first
goes live, not at startup. "Fit before spawn" needs real cols/rows, which needs
an attached, laid-out node — so a panel that has never been on screen has no
size to spawn at. It also stops a twelve-panel canvas launching twelve agents
on boot.

**Promote now, demote later (`Canvas.tsx`).** Promotion is immediate;
demotion waits `DEMOTE_DELAY_MS`. Together with `CULL_MARGIN_PX` this makes
promotion and demotion happen at different boundaries. Without it, a panel at
the viewport edge destroys and recreates a WebGL context every frame while you
pan, and the symptom only appears mid-gesture.

**Clicks are gated near 1:1 (`Canvas.tsx`, `INTERACT_MIN_SCALE`).** xterm's
`getCoords` divides a transform-aware pixel offset by an unscaled cell width,
so under `scale(k)` it reports `k` times the true column. Rather than feeding
xterm corrected coordinates, M3 only lets body clicks through between 0.9 and
1.1. Full correction is M4's, alongside drag and resize.
```

Remove the "Current temporary regression" section — it is no longer true.

- [ ] **Step 3: Update the milestone table**

In `README.md`:

```markdown
| M3 | Merge M1+M2: real terminals as panels, LOD + viewport culling | ✅ in review |
```

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(m3): document the two lifetimes and the tier machine"
```

---

## Definition of Done

- [ ] `npm run verify` passes end to end, including `verify:registry`, `verify:xterm`, and `verify:panels`
- [ ] `npm run typecheck` clean
- [ ] `npm run build` clean
- [ ] Manual pass in `npm run dev`: live shells on screen, cards off screen, zoom out and back leaves scrollback intact, typing reaches the focused panel at any zoom, `Cmd+N` spawns at the view centre, no flicker panning along a panel edge
- [ ] `lod.ts` contains no DOM or React imports; `session-registry.ts` contains no React import and no direct `window`/`document` use
- [ ] `pty.kill` appears in exactly one place in the renderer: `disposeAll`
- [ ] `PlaceholderPanel.tsx` and `placeholder-panels.ts` are gone
