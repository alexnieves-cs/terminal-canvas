# M6d — Attention Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell the user about a panel that wants them *when they are not looking at it* — a pip on the viewport edge pointing at each off-screen `wants-you` panel, and `Cmd+J` to fly the camera to the next one.

**Architecture:** Two pure functions in the plain-node tier (`edgeIndicator` in
`viewport.ts`, `nextAttentionId` in a new `attention.ts`), one set-valued
subscription added to the existing per-id agent-state store, one chrome
component outside the `.world` transform, and one new case in `useViewport`'s
keydown switch. **No new IPC channel**: main already pushes every agent-state
change, so the attention set is derived renderer-side from data already
arriving.

**Tech Stack:** TypeScript, React 18 (`useSyncExternalStore`), Electron, esbuild-driven plain-node verify suites.

**Spec:** `docs/superpowers/specs/2026-08-26-m6-panel-legibility-design.md`, section "M6d — Attention routing".

## Global Constraints

Copied from the spec and from `CLAUDE.md`'s load-bearing details. Every task's
requirements implicitly include these.

- **Scope is two surfaces, not five.** Edge pips and the jump key only. The
  spec also lists an OS notification, a dock badge and a sound; those are
  explicitly **out** of this milestone (decided in brainstorming, 2026-08-27)
  because no verify tier in this repo can drive an OS notification, a dock
  badge or an audio element, and three unverifiable surfaces would land beside
  two verifiable ones under one green run.
- **The jump key does NOT acknowledge.** `Cmd+J` calls `centreOn` +
  `selectAndRaise` — no `registry.wake`, no `registry.focus`, no
  `agent:acknowledge`. Focus remains the single renderer-side trigger for
  acknowledgement and main remains the only author of the state.
- **`wants-you` must outrank `.panel--selected` in CSS.** This deliberately
  reverses half of a rule `styles.css` and `CLAUDE.md` currently state. Only
  `wants-you` outranks selection; `starting`/`busy`/`idle`/`exited` stay below it.
- **No new IPC channel.** `verify:ipc` stays at 20 channels. If a task finds
  itself adding one, stop — the design is being changed, not implemented.
- **Agent state must never bump `registry.version()`.** The attention set is a
  second subscription on `agent-state-store.ts`, notified only on membership
  change, never on `busy`/`idle` churn.
- **`Cmd` is required, and `Cmd+J` is NOT in `REPEATABLE_KEYS`.** A held chord
  must jump once, not fifteen times.
- New settings id, exact string: `agent.edgeIndicators`. Category:
  `AGENT_CATEGORY` (the existing constant). Type `boolean`, default `true`.
- Commits: `feat(m6d): ...`, `test(m6d): ...`, `docs(m6d): ...`.
- `npm run verify` must be green before any task is claimed done. There is no
  test-name filter in any suite — each runs everything.

---

### Task 1: `edgeIndicator` — the pure direction verb

**Files:**
- Modify: `src/renderer/canvas/viewport.ts` (append after `centreOn`)
- Test: `scripts/verify-viewport.cjs` (append checks 56–65 before the summary block)

**Interfaces:**
- Consumes: `Point`, `Size`, `Viewport`, `WorldRect`, `worldToScreen`, `centreOn` — all already exported from `viewport.ts`.
- Produces:
  ```ts
  export const EDGE_INDICATOR_MARGIN: number  // 24
  export interface EdgeIndicator { x: number; y: number; angle: number }
  export function edgeIndicator(
    rect: WorldRect, vp: Viewport, size: Size, margin?: number
  ): EdgeIndicator | null
  ```
  `x`/`y` are canvas-local screen pixels; `angle` is radians, `0` = pointing
  right, measured with `Math.atan2(dy, dx)`. Task 4 renders these.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-viewport.cjs`, immediately before the
`console.log('\n' + '='.repeat(60))` summary block at the end of the file:

```js
// 56-65. edgeIndicator: where on the viewport edge to draw a pip pointing at
//     an off-screen panel, and which way to rotate it. This lives in
//     viewport.ts rather than in the component for one reason: the arithmetic
//     is wrong at scale !== 1 in a way that is invisible in a screenshot taken
//     at 100%, and only the plain-node tier can sweep scales cheaply.
const EDGE_SIZE = { width: 1400, height: 900 }
// A camera centred on the world origin at a chosen scale, built with the
// canvas's own verb rather than by hand so these checks cannot drift from
// what centreOn actually produces.
const cameraAt = (scale) =>
  V.centreOn({ x: 0, y: 0, scale }, { id: 'origin', x: -1, y: -1, w: 2, h: 2 }, EDGE_SIZE)
const M = V.EDGE_INDICATOR_MARGIN

// 56. A panel fully on screen gets no pip.
{
  const vp = cameraAt(1)
  const r = V.edgeIndicator({ id: 'a', x: -100, y: -80, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('56 an on-screen panel gets no edge indicator', r === null, JSON.stringify(r))
}

// 57. PARTIALLY on screen also gets no pip. This is the rule most likely to be
//     "simplified" into a fully-visible test, and the cost of getting it wrong
//     is a pip pointing at a panel the user is already looking at — noise on
//     the one surface whose whole job is to be believed.
{
  const vp = cameraAt(1)
  // Straddles the right edge: left half visible, right half off.
  const r = V.edgeIndicator({ id: 'a', x: 640, y: -80, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('57 a partially visible panel gets no edge indicator', r === null, JSON.stringify(r))
}

// 58-61. The four cardinal directions. The pip sits ON the inset box, and the
//     angle points from the viewport centre toward the panel.
{
  const vp = cameraAt(1)
  const right = V.edgeIndicator({ id: 'a', x: 5000, y: -80, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('58 a panel off the right edge pips at the right margin, pointing right',
    right !== null && near(right.x, EDGE_SIZE.width - M) && near(right.angle, 0),
    JSON.stringify(right))

  const left = V.edgeIndicator({ id: 'a', x: -5200, y: -80, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('59 a panel off the left edge pips at the left margin, pointing left',
    left !== null && near(left.x, M) && near(Math.abs(left.angle), Math.PI),
    JSON.stringify(left))

  const up = V.edgeIndicator({ id: 'a', x: -100, y: -5200, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('60 a panel off the top edge pips at the top margin, pointing up',
    up !== null && near(up.y, M) && near(up.angle, -Math.PI / 2),
    JSON.stringify(up))

  const down = V.edgeIndicator({ id: 'a', x: -100, y: 5000, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('61 a panel off the bottom edge pips at the bottom margin, pointing down',
    down !== null && near(down.y, EDGE_SIZE.height - M) && near(down.angle, Math.PI / 2),
    JSON.stringify(down))
}

// 62. A diagonal panel lands on whichever inset edge the ray leaves through,
//     and NEVER outside the box. A clamp-per-axis implementation (clamp x,
//     then clamp y, independently) puts the pip in the corner for every
//     diagonal, so every off-screen panel to the upper right points at the
//     same spot and the direction stops carrying information.
{
  const vp = cameraAt(1)
  const r = V.edgeIndicator({ id: 'a', x: 5000, y: -2000, w: 200, h: 160 }, vp, EDGE_SIZE)
  const inBox = r !== null &&
    r.x >= M - EPS && r.x <= EDGE_SIZE.width - M + EPS &&
    r.y >= M - EPS && r.y <= EDGE_SIZE.height - M + EPS
  // The ray leaves through the RIGHT edge here (the panel is much further out
  // horizontally than vertically), so x is pinned and y is not.
  const onRightEdge = r !== null && near(r.x, EDGE_SIZE.width - M) &&
    r.y > M + EPS && r.y < EDGE_SIZE.height / 2 - EPS
  ok('62 a diagonal panel pips on the edge its ray leaves through, inside the box',
    inBox && onRightEdge && r.angle > -Math.PI / 2 && r.angle < 0, JSON.stringify(r))
}

// 63. The pip is always ON the inset boundary — one coordinate pinned to a
//     margin — for a sweep of directions. A pip drawn at the panel's own
//     projected centre is off screen entirely and therefore invisible, which
//     looks exactly like the feature not being built.
{
  const vp = cameraAt(1)
  let worst = null
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const rect = { id: 'a', x: Math.cos(a) * 6000, y: Math.sin(a) * 6000, w: 200, h: 160 }
    const r = V.edgeIndicator(rect, vp, EDGE_SIZE)
    const pinned = r !== null && (
      near(r.x, M) || near(r.x, EDGE_SIZE.width - M) ||
      near(r.y, M) || near(r.y, EDGE_SIZE.height - M))
    if (!pinned) worst = { a, r }
  }
  ok('63 every direction pips on the inset boundary', worst === null, JSON.stringify(worst))
}

// 64. DIRECTION IS SCALE-INVARIANT. The camera is centred on the same world
//     point at two very different zooms; the panel is off screen at both, so
//     the arrow must point the same way. An implementation that mixed world
//     units into the angle passes at scale 1 and is wrong everywhere else.
{
  const a = V.edgeIndicator({ id: 'a', x: 4000, y: -3000, w: 200, h: 160 }, cameraAt(0.25), EDGE_SIZE)
  const b = V.edgeIndicator({ id: 'a', x: 4000, y: -3000, w: 200, h: 160 }, cameraAt(2.75), EDGE_SIZE)
  ok('64 the pip direction is the same at scale 0.25 and 2.75',
    a !== null && b !== null && near(a.angle, b.angle),
    `${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
}

// 65. VISIBILITY IS NOT. The same panel is on screen zoomed out and off screen
//     zoomed in, and this is the check that separates a scale-aware
//     implementation from one testing world coordinates against a screen-sized
//     box. That mistake yields no pips at all when zoomed in — the state the
//     whole feature is indistinguishable from.
{
  const rect = { id: 'a', x: 900, y: 0, w: 200, h: 160 }
  const out = V.edgeIndicator(rect, cameraAt(0.25), EDGE_SIZE)
  const inn = V.edgeIndicator(rect, cameraAt(2.75), EDGE_SIZE)
  ok('65 visibility is decided in screen space: on screen at 0.25, off at 2.75',
    out === null && inn !== null, `0.25 -> ${JSON.stringify(out)}, 2.75 -> ${JSON.stringify(inn)}`)
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:viewport`
Expected: FAIL. `V.edgeIndicator` is not a function, so checks 56–65 throw or
report `undefined`. Checks 1–55 must still pass — if any of them broke, the
appended block has a syntax error, not the implementation.

- [ ] **Step 3: Implement `edgeIndicator`**

Append to `src/renderer/canvas/viewport.ts`, after `centreOn`:

```ts
/**
 * How far inside the viewport edge a pip sits, in screen pixels. A pip drawn
 * exactly on the boundary is half clipped by the window.
 */
export const EDGE_INDICATOR_MARGIN = 24

/** A point on the viewport edge and the direction to draw an arrow at. */
export interface EdgeIndicator {
  x: number
  y: number
  /** Radians, `Math.atan2` convention: 0 points right, PI/2 points down. */
  angle: number
}

/**
 * Where to draw a pip pointing at `rect`, or null when it needs no pip.
 *
 * The visibility test is in SCREEN space, which is the whole reason this is
 * here and not in the component: `worldToScreen` folds in both the camera
 * translation and the scale, and an implementation that compares world
 * coordinates against a screen-sized box is correct only at scale 1 and
 * translation 0 — it then silently emits no pips at all when zoomed in, which
 * is indistinguishable from the feature not existing (verify:viewport 65).
 *
 * PARTIALLY visible counts as visible. A pip aimed at something already on
 * screen is noise on the one surface whose job is to be believed, and the
 * user can see the panel's own border for that (verify:viewport 57).
 */
export function edgeIndicator(
  rect: WorldRect,
  vp: Viewport,
  size: Size,
  margin = EDGE_INDICATOR_MARGIN
): EdgeIndicator | null {
  const topLeft = worldToScreen({ x: rect.x, y: rect.y }, vp)
  const bottomRight = worldToScreen({ x: rect.x + rect.w, y: rect.y + rect.h }, vp)
  const overlaps =
    bottomRight.x > 0 && topLeft.x < size.width &&
    bottomRight.y > 0 && topLeft.y < size.height
  if (overlaps) return null

  const centreX = size.width / 2
  const centreY = size.height / 2
  const dx = (topLeft.x + bottomRight.x) / 2 - centreX
  const dy = (topLeft.y + bottomRight.y) / 2 - centreY
  // Unreachable while the rect is off screen (a rect centred on the viewport
  // centre overlaps it), but a zero-length ray has no direction and would
  // emit NaN, so it is refused rather than divided by.
  if (dx === 0 && dy === 0) return null

  // Clip the ray from the viewport centre toward the panel against the inset
  // box, by finding the smaller of the two per-axis crossings. Clamping each
  // axis INDEPENDENTLY is the tempting shorthand and is wrong: it parks every
  // diagonal in the same corner, so direction stops carrying information
  // (verify:viewport 62).
  const halfW = Math.max(0, centreX - margin)
  const halfH = Math.max(0, centreY - margin)
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx)
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy)
  const t = Math.min(tx, ty)

  return { x: centreX + dx * t, y: centreY + dy * t, angle: Math.atan2(dy, dx) }
}
```

- [ ] **Step 4: Run the checks and watch them pass**

Run: `npm run verify:viewport`
Expected: `65/65 passed`. Paste the output rather than describing it.

- [ ] **Step 5: Commit**

```sh
git add src/renderer/canvas/viewport.ts scripts/verify-viewport.cjs
git commit -m "feat(m6d): edgeIndicator, the pure direction verb"
```

---

### Task 2: `nextAttentionId` — the pure cycling rule

**Files:**
- Create: `src/renderer/canvas/attention.ts`
- Modify: `scripts/viewport-entry.cjs` (add the module to the bundle)
- Test: `scripts/verify-viewport.cjs` (append checks 66–70)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type JumpDirection = 1 | -1
  export function nextAttentionId(
    queue: readonly string[], current: string | null, direction: JumpDirection
  ): string | null
  ```
  Task 5 calls this from `Canvas.tsx`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-viewport.cjs`, before the summary block:

```js
// 66-70. nextAttentionId: which panel Cmd+J visits next. Pure, and separated
//     from the store on purpose — every failure here is a keypress that lands
//     somewhere the user did not expect, which reads as the key being flaky
//     rather than as an off-by-one.
const Q = ['n1', 'n2', 'n3']

// 66. Nothing wants you: the key does nothing at all. Not "jump to the first
//     panel", which would make Cmd+J a random-navigation key on a quiet canvas.
ok('66 an empty queue has no next id',
  V.nextAttentionId([], null, 1) === null && V.nextAttentionId([], 'n1', -1) === null)

// 67. No cursor yet — the first press of the run. Forward starts at the head
//     (the panel that has been waiting longest, since the queue is in entry
//     order); backward starts at the tail.
ok('67 with no cursor, forward starts at the head and backward at the tail',
  V.nextAttentionId(Q, null, 1) === 'n1' && V.nextAttentionId(Q, null, -1) === 'n3')

// 68. It wraps at BOTH ends. A cycle that stops at the last entry strands the
//     user on one panel with no indication the key is still working.
ok('68 the cycle wraps in both directions',
  V.nextAttentionId(Q, 'n3', 1) === 'n1' && V.nextAttentionId(Q, 'n1', -1) === 'n3')

// 69. The cursor names a panel that has since left the queue — acknowledged,
//     closed, or exited between two presses. This is the common case, not an
//     exotic one: visiting a panel is what makes the user deal with it. It
//     must restart from the end the direction implies rather than returning
//     null, which would make the second press a silent no-op.
ok('69 a stale cursor restarts the cycle rather than dead-ending',
  V.nextAttentionId(Q, 'gone', 1) === 'n1' && V.nextAttentionId(Q, 'gone', -1) === 'n3')

// 70. One waiting panel, and the cursor is already on it. Returning the same
//     id is right: the camera re-frames the panel the user asked for. Skipping
//     it (returning null) would make Cmd+J do nothing in the single most
//     common state this feature has.
ok('70 a single-entry queue keeps returning that entry',
  V.nextAttentionId(['n1'], 'n1', 1) === 'n1' && V.nextAttentionId(['n1'], 'n1', -1) === 'n1')
```

- [ ] **Step 2: Add the module to the bundle entry**

Modify `scripts/viewport-entry.cjs` — add one line to the spread list, after
the `pointer-correct` line:

```js
  ...require('../src/renderer/canvas/attention'),
```

- [ ] **Step 3: Run the checks and watch them fail**

Run: `npm run verify:viewport`
Expected: FAIL — esbuild reports `Could not resolve "../src/renderer/canvas/attention"`.
That failure is the point: it proves the bundle actually reaches the new module
rather than the checks passing against something already in scope.

- [ ] **Step 4: Implement**

Create `src/renderer/canvas/attention.ts`:

```ts
/**
 * Which panel Cmd+J visits next.
 *
 * Pure and separate from agent-state-store.ts on purpose: the store's job is
 * to know WHO is waiting, and this is the rule for WHERE THE CURSOR GOES —
 * the half with wrapping, a stale cursor and a one-element queue in it, i.e.
 * the half that can be subtly wrong in a way that reads to a user as a flaky
 * key rather than as an off-by-one.
 *
 * No DOM, no React: it belongs in the plain-node verify tier beside
 * viewport.ts and lod.ts.
 */

/** Forward through the queue, or backward (Shift+Cmd+J). */
export type JumpDirection = 1 | -1

/**
 * `queue` is in ENTRY order — longest-waiting first — so stepping forward is
 * "deal with the oldest thing next".
 *
 * `current` is the last panel the jump key visited, which may no longer be in
 * the queue: visiting a panel is exactly what leads to it being acknowledged.
 * A stale cursor restarts from the end the direction implies rather than
 * returning null, because a second press that does nothing is indistinguishable
 * from a broken keybinding.
 */
export function nextAttentionId(
  queue: readonly string[],
  current: string | null,
  direction: JumpDirection
): string | null {
  if (queue.length === 0) return null
  const at = current === null ? -1 : queue.indexOf(current)
  if (at === -1) return direction === 1 ? queue[0] : queue[queue.length - 1]
  return queue[(at + direction + queue.length) % queue.length]
}
```

- [ ] **Step 5: Run the checks and watch them pass**

Run: `npm run verify:viewport`
Expected: `70/70 passed`. Paste the output.

- [ ] **Step 6: Commit**

```sh
git add src/renderer/canvas/attention.ts scripts/viewport-entry.cjs scripts/verify-viewport.cjs
git commit -m "feat(m6d): nextAttentionId, the pure cycling rule"
```

---

### Task 3: The `agent.edgeIndicators` setting

**Files:**
- Modify: `src/shared/settings-schema.ts` (append one def to `SETTINGS`)
- Test: `scripts/verify-layout.cjs` (append check 81)

**Interfaces:**
- Consumes: `SettingDef`, `AGENT_CATEGORY` — already in `settings-schema.ts`.
- Produces: the setting id `'agent.edgeIndicators'`, default `true`. Task 4
  reads it through `window.canvas.settings.list()` and Task 5 does not read it
  at all (the jump key has no toggle).

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-layout.cjs`, before its summary block:

```js
// 81. M6d's one setting. Declared like every other def — a label, a
//     description and keywords — and round-tripping through a write and a
//     reopen. The keywords matter as much as the toggle: ideas-backlog #11's
//     argument for a searchable settings surface is that a user who does not
//     know a feature's name can still find its switch, and "arrow" and
//     "off-screen" are what someone would actually type for this one.
{
  const def = S.settingDef('agent.edgeIndicators')
  const declared = def !== undefined && def.type === 'boolean' && def.default === true &&
    def.category === S.AGENT_CATEGORY &&
    typeof def.label === 'string' && def.label.length > 0 &&
    typeof def.description === 'string' && def.description.length > 0 &&
    Array.isArray(def.keywords) && def.keywords.length > 0
  const dir = mkdtempSync(join(tmpdir(), 'tc layout '))
  const a = new LayoutStore(join(dir, 'layout.json'), join(dir, 'layout.tmp'))
  a.setSetting('agent.edgeIndicators', false)
  a.flushSync()
  const b = new LayoutStore(join(dir, 'layout.json'), join(dir, 'layout.tmp'))
  ok('81 agent.edgeIndicators is declared and round-trips',
    declared && b.getSetting('agent.edgeIndicators') === false,
    `declared=${declared} reopened=${b.getSetting('agent.edgeIndicators')}`)
}
```

**Before running:** open `scripts/verify-layout.cjs` and confirm the local
names this block borrows — the module alias (`S.`), the `LayoutStore`
constructor arguments, and the accessor names (`setSetting`/`getSetting`/
`flushSync`) — match what checks 61–80b already use in that file, and that
`mkdtempSync`/`tmpdir`/`join` are already imported at the top. Adjust the
block to that file's spelling rather than introducing a second one; check 80
(a number preference round-trip) is the closest existing model to copy.

**No `verify:palette` check is added, and that is a decision rather than an
omission.** Main's `SETTINGS_LIST` handler maps over `SETTINGS` and hands the
palette a `SettingRow` per def, so a new boolean def reaches the palette with
zero palette code — and `verify:palette` never imports `SETTINGS` at all: its
checks 51–58b build rows from hand-written fixtures. A check there would
therefore assert that generic machinery still works on a fixture named
`agent.edgeIndicators`, proving nothing about the def added here. The fact
worth pinning — that this setting is reachable and does something — is pinned
end to end by `verify:panels` 60 in Task 4, which toggles it through main's
real store and watches the pips go.

- [ ] **Step 2: Run the suite and watch the new check fail**

Run: `npm run verify:layout`
Expected: FAIL on 81 — `settingDef('agent.edgeIndicators')` returns `undefined`,
so `declared=false`. Every other check in the suite must still pass.

- [ ] **Step 3: Implement**

Append to the `SETTINGS` array in `src/shared/settings-schema.ts`, after the
`agent.idleAfterMs` entry:

```ts
  {
    id: 'agent.edgeIndicators',
    label: 'Point at off-screen panels that want you',
    description:
      'Draw an arrow on the edge of the canvas for each panel that wants you but is out of view.',
    keywords: ['edge', 'arrow', 'pip', 'indicator', 'offscreen', 'off-screen', 'attention', 'pointer', 'wants'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  }
```

The jump key deliberately gets no setting of its own: a keybinding that does
nothing while nothing is waiting is already self-silencing, and a switch with
no plausible reason to be turned off is the customer-free abstraction
`ideas-backlog.md` #11 warns against — the same argument that kept `'enum'`
out of `SettingDef['type']`.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `npm run verify:layout`
Expected: `83/83 passed` (82 before, plus 81). If the total differs, re-derive
it from the suite output rather than trusting this plan's arithmetic — lettered
sub-checks make the last number and the count disagree in this file.

- [ ] **Step 5: Commit**

```sh
git add src/shared/settings-schema.ts scripts/verify-layout.cjs
git commit -m "feat(m6d): the agent.edgeIndicators setting"
```

---

### Task 4: The attention set, the pip layer, and the wiring

**Files:**
- Modify: `src/renderer/session/agent-state-store.ts`
- Create: `src/renderer/canvas/EdgeIndicators.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (append checks 58–60)

**Interfaces:**
- Consumes: `edgeIndicator`, `EDGE_INDICATOR_MARGIN`, `EdgeIndicator`, `Viewport`, `Size`, `WorldRect` (Task 1); `applyAgentState`/`clearAgentState` (existing).
- Produces:
  ```ts
  // agent-state-store.ts
  export function attentionIds(): PanelId[]        // read, for Task 5's keydown
  export function useAttentionIds(): PanelId[]     // subscription, for Canvas
  // EdgeIndicators.tsx
  export interface EdgeIndicatorsProps {
    rects: WorldRect[]; viewport: Viewport; ids: string[]
  }
  export function EdgeIndicators(props: EdgeIndicatorsProps): JSX.Element | null
  ```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, inside the same block that holds checks
54–57 (it already owns a `/bin/sh` panel on the direct backend, `panBy`,
`clickBackground`, `agentStateOf` and `shellId`), after check 57:

```js
      // Where a pip for `id` is actually painted, in canvas-local pixels,
      // read out of the DOM rather than off a data- attribute: an attribute
      // would let a pip rendered in the wrong place — or inside .world, where
      // it pans away with the panel — report the right number.
      const pipAt = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('.edge-indicator[data-panel-id=${JSON.stringify(id)}]')
        if (!el) return null
        const host = document.querySelector('.canvas').getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2 - host.left, y: r.top + r.height / 2 - host.top }
      })()`)

      // 58. A wants-you panel that is OFF SCREEN gets a pip, at the position
      //     viewport.ts's own arithmetic says. Recomputed here rather than
      //     imported, the way check 39 recomputes centreOn: this suite loads
      //     the built renderer and has no module to import from.
      //
      //     Asserting WHERE and not merely THAT is the whole value of this
      //     check. "A pip exists" is satisfied by a pip pinned to a corner for
      //     every direction, which is exactly what an independent per-axis
      //     clamp produces (verify:viewport 62 pins the same property in the
      //     pure tier) — and a canvas where every arrow points the same way
      //     tells the user nothing while looking entirely functional.
      {
        // Ring the bell first, while the panel is still on screen and its PTY
        // is known live, THEN pan away. The other order races: a panel panned
        // out of the cull region can be demoted before the write lands.
        ptyManager.write(shellId, BELL_LINE)
        const rang = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'wants-you', 6000)
        if (rang !== true) throw new Error('58: the panel never reached wants-you')

        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(400)

        const expected = await wc.executeJavaScript(`(() => {
          const rect = window.__m5aSpecOf(${JSON.stringify(shellId)}).rect
          const host = document.querySelector('.canvas').getBoundingClientRect()
          const vp = window.__m4aViewport()
          const size = { width: host.width, height: host.height }
          const M = 24
          const tl = { x: rect.x * vp.scale + vp.x, y: rect.y * vp.scale + vp.y }
          const br = { x: (rect.x + rect.w) * vp.scale + vp.x, y: (rect.y + rect.h) * vp.scale + vp.y }
          if (br.x > 0 && tl.x < size.width && br.y > 0 && tl.y < size.height) return null
          const cx = size.width / 2, cy = size.height / 2
          const dx = (tl.x + br.x) / 2 - cx, dy = (tl.y + br.y) / 2 - cy
          const t = Math.min(
            dx === 0 ? Infinity : Math.max(0, cx - M) / Math.abs(dx),
            dy === 0 ? Infinity : Math.max(0, cy - M) / Math.abs(dy))
          return { x: cx + dx * t, y: cy + dy * t }
        })()`)
        if (expected === null) throw new Error('58: the panel is still on screen after the pan')
        const at = await pipAt(shellId)
        // Sub-pixel: getBoundingClientRect returns fractional boxes. A pip in
        // the wrong place is off by hundreds of pixels, so nothing this
        // tolerance admits is a defect this check could otherwise catch.
        const placed = at !== null &&
          Math.abs(at.x - expected.x) < 2 && Math.abs(at.y - expected.y) < 2
        ok('58 an off-screen wants-you panel gets a pip where edgeIndicator says',
          placed, `${JSON.stringify(at)} expected=${JSON.stringify(expected)}`)
      }

      // 59. Panning the panel back into view removes its pip, WITHOUT the
      //     state changing. The panel still wants you — nothing acknowledged
      //     it — so this is the visibility half of the rule on its own, and
      //     the pip layer must be recomputing against the live camera rather
      //     than latching a set of arrows when the bell rang.
      {
        await panBy(1800, 1200)
        const gone = await waitUntil(async () => (await pipAt(shellId)) === null, 3000)
        ok('59 a pip disappears when its panel comes back into view, state unchanged',
          gone === true && (await agentStateOf(shellId)) === 'wants-you',
          `pip=${JSON.stringify(await pipAt(shellId))} state=${await agentStateOf(shellId)}`)
      }

      // 60. THE SETTING DOES SOMETHING, driven the way a user drives it.
      //     Toggled through the real palette — found by a KEYWORD it does not
      //     display, then run — because that is the production path: main's
      //     settings:list maps over SETTINGS, so the row is generated and the
      //     thing that can actually be wrong is the RENDERER never reading the
      //     value. A setting that lists, toggles, persists and changes nothing
      //     on screen is the quietest failure this surface has, and it is
      //     invisible to verify:palette, whose settings checks build rows from
      //     hand-written fixtures and never import SETTINGS at all.
      //
      //     This block is also the only place the new def's keywords are
      //     exercised: check 52 proves that property for a different setting,
      //     and a keyword list that never matched anything would leave the
      //     switch reachable only by someone who already knew its label.
      {
        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(300)
        const shown = await waitUntil(async () => (await pipAt(shellId)) !== null, 3000)

        // openPalette/closePalette are defined in the 52-53 block above; if
        // they are out of scope here, lift them to the enclosing scope rather
        // than writing a second pair — two spellings of "open the palette"
        // drift apart the first time the toggle changes.
        const toggleEdgeIndicators = async () => {
          await openPalette()
          const picked = await wc.executeJavaScript(`(async () => {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value').set
            const input = document.querySelector('.palette__input')
            setter.call(input, 'off-screen')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 100))
            const row = [...document.querySelectorAll('.palette__row')]
              .find((r) => r.textContent.includes('off-screen panels'))
            if (!row) return 'not found'
            row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            return 'ok'
          })()`)
          if (picked !== 'ok') throw new Error(`60: the setting row was ${picked}`)
          // Running a row closes the palette (runRow closes BEFORE running),
          // but assert it rather than assuming — a left-open overlay would
          // swallow the next check's keys.
          await waitUntil(() => wc.executeJavaScript(
            `document.querySelector('.palette') === null`), 2000)
        }

        await toggleEdgeIndicators()
        const hidden = await waitUntil(async () => (await pipAt(shellId)) === null, 4000)
        const storedOff = await wc.executeJavaScript(
          `window.canvas.settings.list().then((s) =>
             s.find((x) => x.id === 'agent.edgeIndicators').value)`)
        await toggleEdgeIndicators()
        const back = await waitUntil(async () => (await pipAt(shellId)) !== null, 4000)

        ok('60 the edge-indicator setting is findable by keyword and actually hides the pips',
          shown === true && hidden === true && storedOff === false && back === true,
          `shown=${shown} hidden=${hidden} stored=${storedOff} back=${back}`)
        await panBy(1800, 1200)
        await sleep(300)
      }

**Before running:** confirm `__m5aSpecOf`, `BELL_LINE`, `waitUntil`, `sleep`,
`panBy`, `clickBackground`, `ptyManager` and (for check 60) `openPalette` /
`closePalette` are all in scope at that point in
`scripts/verify-panels.cjs` (checks 39 and 54–57 use them). If `panBy`'s sign
convention pans the opposite way from what these checks assume, flip the
arguments — what matters is that check 58's pan leaves the panel off screen
and check 59's pan is its exact inverse.

- [ ] **Step 2: Build and run, and watch the checks fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL on 58 (`pipAt` returns `null` — no `.edge-indicator` element
exists) and FAIL on 59 for the wrong reason (it passes vacuously, since a pip
that never existed is trivially gone). **Note the vacuity and accept it here**:
59 only becomes meaningful once 58 passes, which is why they are committed
together and why 59 also asserts the state is still `wants-you`.

- [ ] **Step 3: Add the attention set to the store**

Modify `src/renderer/session/agent-state-store.ts`. Add below the existing
`states`/`listeners` declarations:

```ts
/**
 * Who is waiting, in ENTRY order — a Set iterates in insertion order, which is
 * exactly the queue Cmd+J steps through: longest-waiting first.
 *
 * A SECOND subscription rather than a second store. The per-id subscription
 * above answers "what is panel n3 doing"; this answers "who wants me", which
 * is a set-valued question no per-id hook can serve without every panel
 * subscribing to every other panel — the fan-out this module exists to avoid.
 *
 * It notifies only on MEMBERSHIP change. busy/idle churn on a chatty agent
 * moves through applyAgentState constantly and must not reach here, or the
 * pip layer re-renders at the flush rate for panels whose pips did not move.
 */
const wanting = new Set<PanelId>()
const attentionListeners = new Set<() => void>()
// useSyncExternalStore compares snapshots by identity, so this must be a
// cached array rebuilt only when membership actually changed. Returning a
// fresh array per call makes React re-render forever.
let attentionSnapshot: PanelId[] = []

function syncAttention(panelId: PanelId, state: AgentState | undefined): void {
  const should = state === 'wants-you'
  if (should === wanting.has(panelId)) return
  if (should) wanting.add(panelId)
  else wanting.delete(panelId)
  attentionSnapshot = [...wanting]
  for (const listener of attentionListeners) listener()
}
```

Call it from both writers. In `applyAgentState`, after `states.set(...)`:

```ts
  syncAttention(panelId, state)
```

In `clearAgentState`, after `states.delete(panelId)`:

```ts
  syncAttention(panelId, undefined)
```

And append the two readers:

```ts
/**
 * The queue as a plain read, for the Cmd+J handler: a keydown wants the
 * current answer at press time, not a subscription.
 */
export function attentionIds(): PanelId[] {
  return attentionSnapshot
}

/**
 * The queue can only ever hold panels with a LIVE process, and that falls out
 * of where the states come from rather than needing a filter here: main emits
 * agent state only for sessions in PtyManager's map, which has no dormant
 * entries. A restored canvas full of never-spawned panels therefore draws no
 * pips at all — the spec's "indicators drawn for dormant panels" failure is
 * unreachable by construction, and adding a defensive filter would create a
 * second place that decides what "waiting" means.
 */
/** The same queue, as a subscription, for the pip layer. */
export function useAttentionIds(): PanelId[] {
  return useSyncExternalStore(
    (listener) => {
      attentionListeners.add(listener)
      return () => attentionListeners.delete(listener)
    },
    () => attentionSnapshot,
    () => attentionSnapshot
  )
}
```

- [ ] **Step 4: Create the pip layer**

Create `src/renderer/canvas/EdgeIndicators.tsx`:

```tsx
import { useEffect, useRef, useState, type JSX } from 'react'
import { edgeIndicator, type Size, type Viewport, type WorldRect } from './viewport'

export interface EdgeIndicatorsProps {
  /** Every panel's rect, so a waiting id can be located. */
  rects: WorldRect[]
  viewport: Viewport
  /** The wants-you queue, from agent-state-store's useAttentionIds. */
  ids: string[]
}

/**
 * Arrows on the viewport edge, one per panel that wants you and is out of
 * view.
 *
 * CHROME, deliberately outside `.world`: the pips' POSITIONS are world-space
 * facts, but their rendering is not. Inside the transform they would scale
 * with the zoom and pan off screen with the very panels they point at — i.e.
 * the arrow leaves exactly when it becomes useful.
 *
 * pointer-events: none. A clickable pip would be a fourth navigation verb, and
 * its mousedown would land on `.canvas`'s background handler — which clears
 * focus, hit-tests a world point and WAKES whatever it finds, the trap
 * Palette.tsx's own stopPropagation guard documents. Cmd+J is the way to act
 * on one.
 */
export function EdgeIndicators({ rects, viewport, ids }: EdgeIndicatorsProps): JSX.Element | null {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)

  // The layer measures ITSELF rather than being handed a size from Canvas.
  // Canvas holds no window size today (every consumer measures at event time),
  // and adding one would re-render every panel on every resize frame — the
  // 60Hz cascade TerminalPanel's memo exists to block. This observer re-renders
  // the pip layer and nothing else.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(() => {
      const box = host.getBoundingClientRect()
      setSize({ width: box.width, height: box.height })
    })
    observer.observe(host)
    const box = host.getBoundingClientRect()
    setSize({ width: box.width, height: box.height })
    return () => observer.disconnect()
  }, [])

  const pips: Array<{ id: string; x: number; y: number; angle: number }> = []
  if (size) {
    for (const id of ids) {
      const rect = rects.find((r) => r.id === id)
      if (!rect) continue
      const pip = edgeIndicator(rect, viewport, size)
      if (pip) pips.push({ id, ...pip })
    }
  }

  // The host stays mounted even with nothing to draw: it is what the observer
  // measures, and unmounting it on an empty queue would mean the first pip of
  // the run renders one frame late, with no size yet.
  return (
    <div className="edge-indicators" ref={hostRef}>
      {pips.map((pip) => (
        <div
          key={pip.id}
          className="edge-indicator"
          data-panel-id={pip.id}
          style={{
            transform: `translate(${pip.x}px, ${pip.y}px) translate(-50%, -50%) rotate(${pip.angle}rad)`
          }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Style the pips**

Append to `src/renderer/styles.css`, after the `.canvas-hud` rules:

```css
/* M6d. A sibling of .world, never a child: these are chrome whose POSITIONS
   are world-space facts. Inside the transform they would zoom and pan away
   with the panels they point at. */
.edge-indicators {
  position: absolute;
  inset: 0;
  /* Never a click target. A pip's mousedown would reach .canvas's background
     handler, which clears focus, hit-tests a world point and wakes whatever
     it finds — spawning a process from an arrow. */
  pointer-events: none;
}

.edge-indicator {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  /* A triangle pointing right at rotation 0, matching edgeIndicator's
     Math.atan2 convention. */
  border-left: 12px solid var(--amber);
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
}
```

- [ ] **Step 6: Wire it into Canvas**

Modify `src/renderer/canvas/Canvas.tsx`.

Add to the imports:

```ts
import { EdgeIndicators } from './EdgeIndicators'
import { applyAgentState, clearAgentState, useAttentionIds } from '@renderer/session/agent-state-store'
```

(the second line replaces the existing `agent-state-store` import).

Beside the existing `glowEnabled` effect — which reads `agent.glow` on mount
and again whenever `settingRows` changes — add the same shape for the pips:

```ts
  // Read the same way glowEnabled is, and for the same reason: settingRows is
  // loaded only when the palette OPENS, so it cannot be the source — the pips
  // must know this whether or not the palette has ever been opened.
  const [pipsEnabled, setPipsEnabled] = useState(true)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'agent.edgeIndicators')
      if (row) setPipsEnabled(row.value === true)
    })
  }, [settingRows])

  // Named for what it holds, not for the store function it came from:
  // Task 5 imports the store's `attentionIds` read into this same scope.
  const waitingIds = useAttentionIds()
```

Render it as a sibling of `.world`, immediately before `<CanvasHud .../>` in
the returned JSX:

```tsx
      {pipsEnabled && (
        <EdgeIndicators rects={rects} viewport={viewport} ids={waitingIds} />
      )}
```

**Check the local name for the rect array** before writing that line: `Canvas`
already computes a `WorldRect[]` to hand `useViewport` (the `rects` argument in
its `useViewport(...)` call). Reuse that exact value — do not build a second
one, or the pips and the camera can disagree about where a panel is mid-drag.

- [ ] **Step 7: Build, run, and watch the checks pass**

Run: `npm run build && npm run verify:panels`
Expected: `64/64 passed` (61 before, plus 58, 59 and 60). Re-derive the total
from the output — this suite's count and last check number differ by four
lettered sub-checks.

- [ ] **Step 8: Commit**

```sh
git add src/renderer/session/agent-state-store.ts src/renderer/canvas/EdgeIndicators.tsx \
        src/renderer/canvas/Canvas.tsx src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m6d): edge indicators for off-screen panels that want you"
```

---

### Task 5: `Cmd+J` — the jump key, and the CSS inversion

**Files:**
- Modify: `src/renderer/canvas/useViewport.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css:96-107` (the `.panel--selected` override group)
- Test: `scripts/verify-panels.cjs` (append checks 61–63)

**Interfaces:**
- Consumes: `nextAttentionId`, `JumpDirection` (Task 2); `attentionIds` (Task 4); `centreOn`, `selectAndRaise` (existing in `Canvas.tsx`).
- Produces: a new optional seventh parameter on `useViewport`:
  ```ts
  onJumpAttention?: (direction: JumpDirection) => void
  ```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, after check 60 in the same block. The
block's panel is on screen and still `wants-you` at this point (check 59 panned
it back and asserted both).

```js
      const jump = (shift) => wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown',
          { key: 'j', metaKey: true, shiftKey: ${shift ? 'true' : 'false'}, bubbles: true }))
        true
      `)

      // 61. Cmd+J frames the waiting panel — and frames THAT panel, asserted
      //     as WHERE the camera landed, recomputed from centreOn's own
      //     arithmetic exactly as check 39 does. "The viewport moved" is true
      //     of any pan at all, and a jump key that framed the wrong panel
      //     would satisfy it.
      //
      //     It must also NOT spawn: the jump routes through selectAndRaise,
      //     the half of onSelectPanel factored out precisely so navigation
      //     cannot wake a panel. A wants-you panel has a live PTY and so is
      //     never dormant, but reusing the safe verb is what keeps a future
      //     widening of wants-you from turning a keyboard tour into spawns.
      {
        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(300)
        const spawnedBefore = await wc.executeJavaScript(
          `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(shellId)}) || {}).spawned`)
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        await jump(false)
        await sleep(400)
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        const expected = await wc.executeJavaScript(`(() => {
          const rect = window.__m5aSpecOf(${JSON.stringify(shellId)}).rect
          const host = document.querySelector('.canvas').getBoundingClientRect()
          const vp = window.__m4aViewport()
          return {
            x: host.width / 2 - (rect.x + rect.w / 2) * vp.scale,
            y: host.height / 2 - (rect.y + rect.h / 2) * vp.scale
          }
        })()`)
        const spawnedAfter = await wc.executeJavaScript(
          `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(shellId)}) || {}).spawned`)
        const framed = Math.abs(after.x - expected.x) < 1 && Math.abs(after.y - expected.y) < 1
        ok('61 Cmd+J frames the waiting panel, at the same scale, spawning nothing new',
          framed && after.scale === before.scale && spawnedAfter === spawnedBefore,
          `${JSON.stringify(before)} -> ${JSON.stringify(after)} expected=${JSON.stringify(expected)}`)
      }

      // 62. Landing on the panel does NOT acknowledge it, and the amber
      //     survives the selection ring. Two facts, and both are the decision
      //     this milestone made explicitly: the jump does not focus, so main
      //     never hears an acknowledge, so the state stays wants-you; and the
      //     CSS was inverted so .panel--selected no longer paints over it.
      //
      //     The COLOUR is what this reads, not the state — check 61 already
      //     covers the state — because the silent failure here is purely
      //     visual: the user lands on the panel the key promised and sees
      //     nothing telling them why they are there, while the panel is still
      //     in the queue and the next press may jump straight back to it.
      {
        const selected = await wc.executeJavaScript(
          `!!document.querySelector('[data-panel-id=${JSON.stringify(shellId)}].panel--selected')`)
        const state = await agentStateOf(shellId)
        const colour = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-panel-id=${JSON.stringify(shellId)}]')
          if (!el) return null
          const amber = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()
          const probe = document.createElement('div')
          probe.style.color = amber
          document.body.appendChild(probe)
          const want = getComputedStyle(probe).color
          probe.remove()
          return { border: getComputedStyle(el).borderTopColor, want }
        })()`)
        ok('62 the jump does not acknowledge, and wants-you outranks the selection ring',
          selected === true && state === 'wants-you' &&
          colour !== null && colour.border === colour.want,
          `selected=${selected} state=${state} ${JSON.stringify(colour)}`)
      }

      // 63. Focus is still what acknowledges — the rule this milestone left
      //     alone — and the pip goes with it. Clicking the panel (now on
      //     screen, because check 61 framed it) sends agent:acknowledge, main
      //     clears the state, the store drops it from the queue, and the pip
      //     layer has nothing left to draw even after panning away again.
      {
        const point = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-panel-id=${JSON.stringify(shellId)}] .panel__slot')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        })()`)
        if (!point) throw new Error('63: the framed panel has no slot to click')
        wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        const cleared = await waitUntil(
          async () => (await agentStateOf(shellId)) !== 'wants-you', 4000)
        await panBy(-1800, -1200)
        await sleep(400)
        ok('63 focus acknowledges, and the pip leaves with the state',
          cleared === true && (await pipAt(shellId)) === null,
          `state=${await agentStateOf(shellId)} pip=${JSON.stringify(await pipAt(shellId))}`)
      }
```

**Before running:** check 63's click assumes the panel is live (it has a
`.panel__slot`); check 61 framed it, and the tiering effect promotes a centred
panel, but if the click point comes back null add a `waitUntil(() =>
isLive(shellId), 4000)` before reading it — `isLive` is already defined in this
block.

- [ ] **Step 2: Build, run, and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL on 61 (the camera does not move — nothing handles `j`), and 62
fails on the colour (the selection override still paints blue). 63 may pass
vacuously since nothing ever selected the panel; that is fine and becomes
meaningful once 61 and 62 pass.

- [ ] **Step 3: Add the jump case to `useViewport`**

Modify `src/renderer/canvas/useViewport.ts`.

Import the direction type at the top:

```ts
import type { JumpDirection } from './attention'
```

Add a seventh parameter to `useViewport`, after `shouldIgnoreKeys`:

```ts
  ,
  /**
   * Cmd+J: visit the next panel that wants you; Shift+Cmd+J the previous one.
   * The hook holds no knowledge of WHO is waiting — that lives in the
   * agent-state store, which is renderer state this layer has no business
   * reading. It only turns a chord into a direction.
   *
   * Must be referentially stable: it sits in the keydown effect's dep array.
   */
  onJumpAttention?: (direction: JumpDirection) => void
```

Add the case to the keydown switch, after `case 'n'`:

```ts
        case 'j':
        case 'J':
          // Both spellings: shiftKey is not excluded above (Shift+Cmd+J is
          // the backward cycle), and a shifted `j` arrives as 'J' — the same
          // detail usePalette.ts records about Cmd+Shift+K.
          event.preventDefault()
          onJumpAttention?.(event.shiftKey ? -1 : 1)
          break
```

Add `onJumpAttention` to that effect's dependency array:

```ts
  }, [hostRef, onSpawn, shouldIgnoreKeys, onJumpAttention])
```

**Do NOT add `'j'` to `REPEATABLE_KEYS`.** The existing
`if (event.repeat && !REPEATABLE_KEYS.has(event.key)) return` guard above the
switch is what makes a held `Cmd+J` one jump rather than fifteen; the zoom
steppers are the only keys for which the repeat stream is the feature.

- [ ] **Step 4: Supply the callback from `Canvas.tsx`**

Modify `src/renderer/canvas/Canvas.tsx`. Add the imports:

```ts
import { nextAttentionId, type JumpDirection } from './attention'
```

and add `attentionIds` to the `agent-state-store` import (the read, beside the
`useAttentionIds` subscription Task 4 added).

Define the handler near `goToPanel`/`selectAndRaise`:

```ts
  // Which panel the jump key last visited. A ref, not state: it is a cursor
  // for a keydown handler and nothing renders from it, so putting it in state
  // would re-render the canvas on every press for no visible reason.
  const jumpCursorRef = useRef<string | null>(null)

  /**
   * Cmd+J. centreOn + selectAndRaise, and deliberately NOTHING ELSE — no
   * registry.wake, no registry.focus, no agent:acknowledge. Focus is the
   * renderer's single trigger for acknowledgement (see onFocusPanel), and
   * routing a second one through navigation would make the renderer a second
   * author of a state main owns. The panel therefore keeps its amber border
   * after you land on it, which is why styles.css lets wants-you outrank
   * .panel--selected.
   */
  const onJumpAttention = useCallback((direction: JumpDirection) => {
    const queue = attentionIds()
    const id = nextAttentionId(queue, jumpCursorRef.current, direction)
    // Nothing is waiting: the key does nothing at all. Moving the camera
    // "somewhere" would be worse than silence — the user asked to be taken to
    // a panel that wants them, and there isn't one.
    if (id === null) return
    // panelsRef, not `panels`: this reads at keypress time and must not put a
    // 60Hz-changing array into a useCallback's dep list (the same mirror-into-
    // a-ref move focusedIdRef makes).
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (!panel) return
    jumpCursorRef.current = id
    centreOn(panel.rect)
    selectAndRaise(id)
  }, [centreOn, selectAndRaise])
```

Pass it as the seventh argument to the existing `useViewport(...)` call.

**Check `panelsRef` exists** before writing that line — `Canvas.tsx` already
mirrors `panels` into a ref for `panelRows` (the palette's panel list). Reuse
it; if the name differs, use the existing one rather than adding a second
mirror.

- [ ] **Step 5: Invert the CSS**

Modify `src/renderer/styles.css`. In the `.panel--selected, .panel--selected.panel--agent-*`
override group, **remove** the `.panel--selected.panel--agent-wants-you` line,
and add a rule immediately after the group:

```css
/* M6d inverts exactly one half of the rule above. wants-you is the only state
   that carries INTENT — a panel asking you something — and Cmd+J deliberately
   does not acknowledge, so landing on a panel selects it while it is still
   waiting. If selection painted over the amber here, the jump key would take
   you to a panel and hide the very reason it took you there, leaving it in the
   queue with nothing on screen saying so. The other four states stay below
   selection: none of them is asking for anything. */
.panel--selected.panel--agent-wants-you {
  border-color: var(--amber);
  box-shadow: 0 0 0 2px var(--amber);
}
```

- [ ] **Step 6: Build, run, and watch them pass**

Run: `npm run build && npm run verify:panels`
Expected: `67/67 passed` (64 after Task 4, plus 61, 62 and 63). Re-derive from
the output rather than trusting this arithmetic.

- [ ] **Step 7: Typecheck and run the whole suite**

Run: `npm run verify`
Expected: every suite green. Paste the output.

- [ ] **Step 8: Commit**

```sh
git add src/renderer/canvas/useViewport.ts src/renderer/canvas/Canvas.tsx \
        src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m6d): Cmd+J jumps to the next panel that wants you"
```

---

### Task 6: Documentation and the knowledge graph

**Files:**
- Modify: `README.md` (milestone table, verify script table, keyboard section if one exists)
- Modify: `CLAUDE.md` (verify tables, the M6d hazard entry, new load-bearing entries)

**Interfaces:**
- Consumes: everything above. Produces nothing code reads.

- [ ] **Step 1: Update `README.md`**

Add to the milestone table, after the M6c row:

```
| M6d | Attention routing: edge pips for off-screen panels, Cmd+J to jump | ✅ done |
```

Say plainly, in the same paragraph style the M6c prose uses, what M6d does
**not** do: no OS notification, no dock badge, no sound. The spec lists all
five; three were deliberately left out, and a README that lists the milestone
without saying so reads as though they shipped.

- [ ] **Step 2: Update `CLAUDE.md`'s verify tables**

Three edits, each a fact a future reader will otherwise get wrong:

1. `verify:viewport` — 55 checks becomes 70. Add: "M6d adds `edgeIndicator`
   (56–65) and `nextAttentionId` (66–70). 57 and 65 are the two worth keeping:
   57 pins that a PARTIALLY visible panel gets no pip, and 65 is the only check
   that separates a screen-space visibility test from a world-space one, a
   mistake that emits no pips at all when zoomed in."
2. `verify:layout` — 82 becomes 83, last number 81. `verify:palette` is
   UNCHANGED, and say why in one clause: settings rows are generated from
   `SETTINGS` by main's `settings:list`, so a new def needs no palette code and
   a fixture-built check there would prove nothing about it — `verify:panels`
   60 is where the new setting is actually exercised.
3. `verify:panels` — 61 becomes 67, last number 63. Note that 58 asserts WHERE
   the pip is, not that one exists, and why (a per-axis clamp corners every
   diagonal and still renders a pip).

- [ ] **Step 3: Replace the M6d hazard entry**

`CLAUDE.md` currently carries **"Hazard for M6d: `selectAndRaise` does not
acknowledge"**, which poses the question this milestone answered. Replace that
entry with the answer, keeping the reasoning that made it a hazard:

> **The jump key does not acknowledge, and `wants-you` outranks selection
> (`Canvas.tsx`'s `onJumpAttention`, `styles.css`).** `Cmd+J` is `centreOn` +
> `selectAndRaise` and nothing else — no wake, no focus, no
> `agent:acknowledge` — so focus stays the renderer's single acknowledgement
> trigger and main stays the only author of the state. That leaves a landed-on
> panel still in `wants-you`, which is why `.panel--selected.panel--agent-wants-you`
> now paints amber rather than blue: the alternative is a key that takes you to
> a panel and hides the reason it took you there, while the panel stays in the
> queue. Only `wants-you` outranks selection; the other four states do not,
> because none of them is asking for anything. `verify:panels` 62 reads the
> COLOUR for this, not the state — the failure is purely visual.

- [ ] **Step 4: Add the new load-bearing entries**

Write these in the same voice as the surrounding entries — each naming the
silent failure it prevents:

- **The attention set is a second subscription, not a second store**
  (`agent-state-store.ts`). Membership-only notification; why the snapshot must
  be a cached array (`useSyncExternalStore` compares by identity and a fresh
  array per call loops); why the per-id hook cannot serve a set-valued question.
- **The pips are outside `.world`, and measure themselves**
  (`EdgeIndicators.tsx`). Inside the transform they zoom and pan away with the
  panels they point at. The `ResizeObserver` lives in the layer rather than in
  `Canvas` because a size in `Canvas` state re-renders every panel on every
  resize frame.
- **`edgeIndicator` clips a ray, it does not clamp two axes**
  (`viewport.ts`). Independent per-axis clamping corners every diagonal, so
  every off-screen panel to the upper right points at the same spot and the
  arrows stop carrying information — while still looking entirely functional.
- **Partially visible counts as visible** (`viewport.ts`). A pip aimed at a
  panel the user can already see is noise on the one surface whose job is to be
  believed.
- **`Cmd+J` is not in `REPEATABLE_KEYS`** — one line, cross-referencing the
  existing auto-repeat entry rather than restating it.

Also add `agent.edgeIndicators` to the settings prose if `CLAUDE.md` enumerates
the schema's ids anywhere, and state explicitly that **M6d added no IPC
channel** — `verify:ipc` stays at 20 — since "the attention set is derived
renderer-side from data already arriving" is exactly the kind of fact a later
reader reinvents a channel for.

- [ ] **Step 5: Refresh the knowledge graph**

Run: `graphify update .`
Then, because this task changed prose and `update` is AST-only: `graphify .`

- [ ] **Step 6: Final verification and commit**

Run: `npm run verify`
Expected: every suite green. Paste the output rather than describing it.

```sh
git add CLAUDE.md README.md graphify-out
git commit -m "docs(m6d): CLAUDE.md and README catch up to attention routing"
```

---

## What this plan deliberately does not do

- **No OS notification, no dock badge, no sound.** The spec lists all five
  M6d surfaces; this plan ships the two the repo can verify. The other three
  are main-side or asset-side work with no tier in this repo able to drive
  them, and landing three unverifiable surfaces under one green run is the
  shape of coverage that reads as proof and is not. A later milestone can add
  them against the same attention set, with a new Electron-tier harness that
  actually constructs a `Notification` and reads `app.dock` — the same gap
  `CLAUDE.md` already records for the derived Restore submenu.
- **No clickable pips.** A pip's mousedown would reach `.canvas`'s background
  handler, which clears focus, hit-tests a world point and wakes what it finds.
  Solvable — `Palette.tsx` solves the same problem — but it is a fourth
  navigation verb, and `Cmd+J` already reaches every panel a pip points at.
- **No change to what enters `wants-you`.** M6c owns the detector; this
  milestone only routes attention to what it already decides.
- **No jump-key setting.** A keybinding that does nothing while nothing is
  waiting is self-silencing; a switch nobody would turn off is the
  customer-free abstraction `ideas-backlog.md` #11 warns against.
- **No acknowledgement on landing.** Explicitly decided, not overlooked. See
  the replaced hazard entry in Task 6.
