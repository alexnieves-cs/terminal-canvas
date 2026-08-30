# M24 — Drawing Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user draw a link by dragging from a port handle on a panel's border to another panel, with proximity snapping, a live preview, a bezier edge, and a hover-revealed remove badge.

**Architecture:** All new code lands in `src/renderer/`. The pure geometry extends `canvas/link-geometry.ts` (already in the plain-node `verify:viewport` bundle). The gesture is a new `canvas/useLinkDraw.ts` modelled line-for-line on the existing `canvas/usePanelDrag.ts` — state in a ref, `depsRef` mirroring, listeners on `document`. The handles are one new `components/PanelPorts.tsx` mounted by all five panel kinds. `shared/layout-schema.ts`, `shared/ipc-contract.ts` and `renderer/panels/panels.ts` are not touched.

**Tech Stack:** TypeScript, React 18 (no StrictMode), Electron, plain SVG. No new dependencies — this repo runs on exactly one runtime dependency (`node-pty`) and adds none here.

**Spec:** [`docs/superpowers/specs/2026-08-30-m24-link-drawing-design.md`](../specs/2026-08-30-m24-link-drawing-design.md)

---

## Global Constraints

Copied verbatim from the spec and from `CLAUDE.md`. Every task's requirements implicitly include this section.

- **`shared/layout-schema.ts`, `shared/ipc-contract.ts` and `renderer/panels/panels.ts` must be byte-identical to their pre-milestone state when this plan finishes.** Success criterion 6. Verify with `git diff --stat` before the final commit.
- **No new IPC channel.** `verify:ipc` stays at **45**. Links ride inside `CanvasState` through the existing `layout:load` / `layout:save` / `workspace:activate`.
- **No new npm dependency.**
- **`verify:styles` rules apply to every CSS line written here:** no hardcoded colour outside a theme block in *any* notation (hex, `rgb()`, `rgba()`, `hsl()`) — use theme tokens; every `var(--token)` must be declared; **no fractional `opacity`** (`opacity: .5` fails check 3 — use `0` and `1`); spacing from `--sp-*`, radius from `--r-*`, type from `--t-*`.
- **New check numbers:** `verify:viewport` continues from **93** (its last is 92). `verify:panels` continues from **174** (its last is 173). Do not reuse or renumber existing checks except where this plan explicitly says to rewrite check 127.
- **Run `npm run verify` before claiming any task done.** There is no unit-test runner and no linter; that chain is the whole verification story.
- **Comments explain *why*.** A non-obvious line without a reason attached gets "fixed" by someone later. Match the density of the surrounding file.
- **Commit format:** conventional, scoped `m24` — e.g. `feat(m24): ...`, `test(m24): ...`, `docs(m24): ...`. End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

### Constants introduced by this plan

Declared in `src/renderer/canvas/link-geometry.ts` unless noted. Every one of these is a **tuning value with no automated coverage of its feel** — see Task 8's hand-check.

| Constant | Value | Meaning |
|---|---|---|
| `CURVE_RATIO` | `0.4` | Control-point offset as a fraction of endpoint distance |
| `CURVE_MIN` | `24` | Lower clamp on that offset, in world units |
| `CURVE_MAX` | `160` | Upper clamp on that offset, in world units |
| `SNAP_RADIUS_PX` | `90` | Proximity radius, in **screen** pixels — divided by `scale` at the call site |
| `PORT_MIN_SCALE` | `0.4` | Below this viewport scale, ports do not render |

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/renderer/canvas/link-geometry.ts` | **Modify.** Pure geometry: anchors + their sides, bezier control points, the `d` string, and nearest-target resolution | 1, 3 |
| `src/renderer/canvas/LinkLayer.tsx` | **Modify.** Renders committed edges as bezier paths, the in-flight ghost, hover hit strokes and the `×` badge | 2, 5, 6 |
| `src/renderer/canvas/useLinkDraw.ts` | **Create.** The drag gesture: document listeners, snap resolution, commit/cancel | 4 |
| `src/renderer/components/PanelPorts.tsx` | **Create.** The four handles. One component, five call sites | 4 |
| `src/renderer/components/TerminalPanel.tsx` | **Modify.** Mount `<PanelPorts>` | 4 |
| `src/renderer/review/ReviewNode.tsx`, `src/renderer/file/FileNode.tsx`, `src/renderer/jira/JiraNode.tsx`, `src/renderer/toolbox/ToolboxNode.tsx` | **Modify.** Mount `<PanelPorts>` | 7 |
| `src/renderer/canvas/Canvas.tsx` | **Modify.** Own the draw state; pass it down; wire commit through `addLink` + `commitHistory` | 4, 5, 6 |
| `src/renderer/styles.css` | **Modify.** `.panel__port`, `.link-layer__ghost`, `.link-layer__hit`, `.link-layer__badge` | 4, 5, 6 |
| `scripts/verify-viewport.cjs` | **Modify.** Checks 93–96 | 1, 3 |
| `scripts/verify-panels.cjs` | **Modify.** Checks 174–178; rewrite 127 | 4, 5, 6, 7 |
| `CLAUDE.md`, `README.md`, `docs/ideas-backlog.md` | **Modify.** Record the milestone and the pointer-events downgrade | 8 |

---

## Task 1: Anchor sides and the bezier path

**Files:**
- Modify: `src/renderer/canvas/link-geometry.ts`
- Test: `scripts/verify-viewport.cjs` (append checks 93, 94, 95 before the closing summary block)

**Interfaces:**
- Consumes: nothing from earlier tasks. `WorldRect` from `./viewport` is `{ id, x, y, w, h }`.
- Produces:
  ```ts
  export type LinkSide = 'n' | 'e' | 's' | 'w'
  export interface LinkAnchors {
    x1: number; y1: number; x2: number; y2: number
    fromSide: LinkSide; toSide: LinkSide
  }
  export function linkAnchors(from: WorldRect, to: WorldRect, sides?: undefined): LinkAnchors | null
  export function linkControls(a: LinkAnchors): { c1: { x: number; y: number }; c2: { x: number; y: number } }
  export function linkPath(a: LinkAnchors): string
  export const CURVE_RATIO: number
  export const CURVE_MIN: number
  export const CURVE_MAX: number
  ```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-viewport.cjs`, immediately **before** the `console.log('\n' + '='.repeat(60))` summary block at the end of the file:

```js
// ---------------------------------------------------------------------------
// M24. Drawing links. The pure half: which side each anchor sits on, and the
// bezier built from that. See docs/superpowers/specs/2026-08-30-m24-link-drawing-design.md
// ---------------------------------------------------------------------------

// 93. linkAnchors reports WHICH SIDE each anchor landed on. This is a read of
//     a decision the function already makes — the side is whichever of tx/ty
//     bound the crossing, plus the sign of dx/dy — so it is new output rather
//     than new arithmetic, and checks 83/84 must stay green beside it.
//
//     The fixture is the SHALLOW diagonal check 84 already uses, for check
//     84's own reason: at 45 degrees the x and y crossings tie, so a wrong
//     implementation answers a plausible side and the check proves nothing.
//     Here the x crossing binds strictly, so 'e' and 'w' are the only correct
//     answers and a tie-breaking bug is visible.
{
  const a = { id: 'a', x: -50, y: -50, w: 100, h: 100 }
  const b = { id: 'b', x: 350, y: 50, w: 100, h: 100 }
  const s = V.linkAnchors(a, b)
  // And the reverse, which must mirror: b's ray leaves west and enters a east.
  const r = V.linkAnchors(b, a)
  ok('93 linkAnchors reports the side each anchor sits on',
    s !== null && s.fromSide === 'e' && s.toSide === 'w' &&
      r !== null && r.fromSide === 'w' && r.toSide === 'e',
    s === null ? 'null' : `forward ${s.fromSide}->${s.toSide} reverse ${r && r.fromSide}->${r && r.toSide}`)
}

// 94. The control points are AXIS-ALIGNED to the sides they leave from, and
//     point OUTWARD. That perpendicular rule is what makes the curve leave the
//     border rather than kink at it.
//
//     Asserted as a RELATION rather than as literal coordinates. Literals go
//     stale the moment CURVE_RATIO is tuned, and the repair a later reader
//     reaches for is to paste in whatever the implementation currently
//     returns — which is a check that can no longer fail.
//
//     The vertical pair is the discriminating fixture: a control point built
//     from the SEGMENT direction rather than from the SIDE is identical to the
//     correct one on a horizontal pair, so a horizontal-only check passes
//     against an implementation that never reads the side at all.
{
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 }
  const b = { id: 'b', x: 0, y: 400, w: 100, h: 100 }   // b is DIRECTLY BELOW a
  const s = V.linkAnchors(a, b)
  const c = s && V.linkControls(s)
  // a exits south: c1 is directly below the exit, same x. b enters north: c2
  // is directly above the entry, same x.
  const perpendicular = c !== null &&
    near(c.c1.x, s.x1) && c.c1.y > s.y1 &&
    near(c.c2.x, s.x2) && c.c2.y < s.y2
  ok('94 linkControls pushes each control point perpendicular to its own side',
    s !== null && s.fromSide === 's' && s.toSide === 'n' && perpendicular,
    s === null ? 'null' : `sides ${s.fromSide}->${s.toSide} c1=${JSON.stringify(c.c1)} c2=${JSON.stringify(c.c2)}`)
}

// 95. The offset is CLAMPED AT BOTH ENDS, and both are asserted: a one-sided
//     clamp passes a one-sided check. Unclamped, a very short link loops
//     absurdly and a very long one is indistinguishable from a straight line,
//     so the clamp is what makes the curve read the same way at every distance.
//
//     Also pins purity: the same anchors twice produce a byte-identical string,
//     since anything consulting a clock or a random seed would make every link
//     on the canvas twitch on every repaint.
{
  const near0 = { id: 'a', x: 0, y: 0, w: 10, h: 10 }
  const near1 = { id: 'b', x: 30, y: 0, w: 10, h: 10 }     // tiny gap
  const far0 = { id: 'c', x: 0, y: 0, w: 10, h: 10 }
  const far1 = { id: 'd', x: 20000, y: 0, w: 10, h: 10 }   // huge gap
  const sNear = V.linkAnchors(near0, near1)
  const sFar = V.linkAnchors(far0, far1)
  const cNear = sNear && V.linkControls(sNear)
  const cFar = sFar && V.linkControls(sFar)
  const offNear = cNear && Math.abs(cNear.c1.x - sNear.x1)
  const offFar = cFar && Math.abs(cFar.c1.x - sFar.x1)
  const d1 = sFar && V.linkPath(sFar)
  const d2 = sFar && V.linkPath(sFar)
  ok('95 the control offset clamps at BOTH ends, and linkPath is pure',
    near(offNear, V.CURVE_MIN) && near(offFar, V.CURVE_MAX) &&
      typeof d1 === 'string' && d1.startsWith('M') && d1.includes('C') && d1 === d2,
    `near=${offNear} (min ${V.CURVE_MIN}) far=${offFar} (max ${V.CURVE_MAX}) d=${d1}`)
}
```

- [ ] **Step 2: Run the checks and verify they fail**

Run: `npm run verify:viewport`

Expected: **FAIL** on 93, 94 and 95. Because `linkControls` does not exist, `V.linkControls` is `undefined` and calling it throws a `TypeError` — **which ends the process and takes checks 94 and 95's own RED with it, and any check after them.** That is this repo's documented "a check that THROWS aborts the run" hazard. So confirm the RED in two steps:

1. Run as written. Confirm 93 prints `FAIL` (it does not call `linkControls`).
2. Temporarily comment out the *bodies* of checks 94 and 95, re-run, and confirm the summary line reports the same total minus two — proving nothing else broke. Then restore them.

Do not record 94/95 as "watched failing" on the strength of the process dying.

- [ ] **Step 3: Add the side to `linkAnchors`**

In `src/renderer/canvas/link-geometry.ts`, add the type above `linkAnchors` and change `exit` to report the side. The clip arithmetic is untouched:

```ts
/**
 * Which border an anchor sits on. Reported rather than computed separately:
 * linkAnchors already decides this when it takes Math.min(tx, ty), and a
 * second derivation elsewhere would drift from it the first time one of them
 * was wrong.
 */
export type LinkSide = 'n' | 'e' | 's' | 'w'

export interface LinkAnchors {
  x1: number
  y1: number
  x2: number
  y2: number
  /** The side of `from` the ray leaves through. */
  fromSide: LinkSide
  /** The side of `to` the ray enters through. */
  toSide: LinkSide
}
```

Then, inside `linkAnchors`, replace the `exit` helper and the return:

```ts
  const exit = (
    r: WorldRect,
    ox: number,
    oy: number
  ): { x: number; y: number; side: LinkSide } => {
    const tx = ox === 0 ? Infinity : r.w / 2 / Math.abs(ox)
    const ty = oy === 0 ? Infinity : r.h / 2 / Math.abs(oy)
    const t = Math.min(tx, ty)
    // The side falls out of WHICH crossing bound. tx binding means the ray
    // left through a vertical border (east or west) and the sign of ox says
    // which; ty binding means a horizontal one. The <= rather than < settles
    // the exact-45-degree tie toward the vertical border deterministically —
    // either answer is defensible there, and picking one in code rather than
    // leaving it to float comparison is what keeps linkPath reproducible.
    const side: LinkSide = tx <= ty ? (ox > 0 ? 'e' : 'w') : oy > 0 ? 's' : 'n'
    return { x: ox * t, y: oy * t, side }
  }
  const out = exit(from, dx, dy)
  const back = exit(to, -dx, -dy)
  return {
    x1: a.x + out.x,
    y1: a.y + out.y,
    x2: b.x + back.x,
    y2: b.y + back.y,
    fromSide: out.side,
    toSide: back.side
  }
```

Also widen the signature's return type to `LinkAnchors | null` and add the reserved parameter:

```ts
export function linkAnchors(
  from: WorldRect,
  to: WorldRect,
  /**
   * RESERVED and unused. M24's design decision 2 chose derived anchors, which
   * is what kept shared/layout-schema.ts out of that milestone entirely. This
   * parameter exists so the deferred half — an edge that REMEMBERS which side
   * it left from — can be taken later without rewriting this module. Nothing
   * passes it today; if you are adding the first caller, that is the milestone
   * that also grows PanelLink and both parsers.
   */
  _sides?: undefined
): LinkAnchors | null {
```

- [ ] **Step 4: Add `linkControls` and `linkPath`**

Append to `src/renderer/canvas/link-geometry.ts`:

```ts
/**
 * How far a control point is pushed out of its border, as a fraction of the
 * distance between the two anchors, clamped at both ends.
 *
 * The clamps are not defensive. Unclamped, a link between two adjacent panels
 * gets an offset of a few units and reads as a straight line with a kink,
 * while a link across a panned canvas gets an offset of thousands and loops
 * off screen before coming back. The clamp is what makes the curve read the
 * same way at every distance, which is the whole of "clean" here.
 *
 * All three are TUNING values with no automated coverage of how they LOOK.
 * verify:viewport 94 and 95 pin the relation (perpendicular, clamped, pure)
 * and say nothing about whether the result is attractive. There is no visual
 * regression test in this repo and that is a stated position; these were
 * checked by hand once and are recorded as such in CLAUDE.md.
 */
export const CURVE_RATIO = 0.4
export const CURVE_MIN = 24
export const CURVE_MAX = 160

const OUTWARD: Record<LinkSide, { x: number; y: number }> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 }
}

/**
 * The two cubic control points, pushed PERPENDICULAR out of the border each
 * anchor sits on.
 *
 * Perpendicular to the SIDE, never along the segment. Those two are identical
 * for a horizontal pair and diverge everywhere else, so the shorthand looks
 * correct on the fixture a first check reaches for and produces a curve that
 * kinks at the border for every other pair. verify:viewport 94 uses a VERTICAL
 * fixture precisely because it is one the shorthand gets wrong.
 *
 * Exported separately from linkPath so the relation is checkable without
 * parsing an SVG path string back apart — a check that had to parse `d` would
 * be testing a regex rather than the geometry.
 */
export function linkControls(a: LinkAnchors): {
  c1: { x: number; y: number }
  c2: { x: number; y: number }
} {
  const dx = a.x2 - a.x1
  const dy = a.y2 - a.y1
  const distance = Math.hypot(dx, dy)
  const offset = Math.min(CURVE_MAX, Math.max(CURVE_MIN, distance * CURVE_RATIO))
  const o1 = OUTWARD[a.fromSide]
  const o2 = OUTWARD[a.toSide]
  return {
    c1: { x: a.x1 + o1.x * offset, y: a.y1 + o1.y * offset },
    c2: { x: a.x2 + o2.x * offset, y: a.y2 + o2.y * offset }
  }
}

/**
 * The SVG `d` for one link. Pure: the same anchors always produce a
 * byte-identical string, because anything consulting a clock or a random seed
 * here would make every link on the canvas twitch on every repaint.
 */
export function linkPath(a: LinkAnchors): string {
  const { c1, c2 } = linkControls(a)
  return `M ${a.x1} ${a.y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${a.x2} ${a.y2}`
}
```

- [ ] **Step 5: Run the checks and verify they pass**

Run: `npm run verify:viewport`

Expected: **PASS**, with the total up by 3 and checks 83–88 still green. If 83 or 84 went red, the clip arithmetic was disturbed — revert and re-apply, changing only `exit`'s return shape.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/canvas/link-geometry.ts scripts/verify-viewport.cjs
git commit -m "$(cat <<'EOF'
feat(m24): linkAnchors reports each anchor's side; add the bezier path

The side is a read of a decision linkAnchors already makes — whichever of
tx/ty bound the crossing, plus the sign — so it is new output rather than
new arithmetic, and checks 83/84 stay green untouched.

linkControls is exported separately from linkPath so verify:viewport 94 can
assert the perpendicular RELATION without parsing an SVG path string back
apart. Its fixture is a VERTICAL pair deliberately: a control point built
from the segment direction rather than from the side is identical to the
correct one on a horizontal pair, so a horizontal-only check passes against
an implementation that never reads the side at all.

95 pins BOTH clamps, because a one-sided clamp passes a one-sided check.

The reserved `_sides` parameter is unused and documented as such: M24 chose
derived anchors, which is what kept shared/layout-schema.ts out of the
milestone entirely, and this is the door back to the other half.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Render committed links as curves

**Files:**
- Modify: `src/renderer/canvas/link-geometry.ts` (`LinkSegment` gains `d`)
- Modify: `src/renderer/canvas/LinkLayer.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `linkPath`, `LinkAnchors`, `LinkSide` from Task 1.
- Produces: `LinkSegment` gains `d: string`, `fromSide: LinkSide`, `toSide: LinkSide`. The DOM contract `[data-link]` moves from `<line>` to `<path>`, keeping the same attribute and the same `"<from> <to>"` value — `verify:panels` 125/127/128's `linkPaths()` helper queries `.link-layer [data-link]` and is element-agnostic, so it keeps working.

- [ ] **Step 1: Add `d` to `LinkSegment`**

In `src/renderer/canvas/link-geometry.ts`, extend the interface:

```ts
export interface LinkSegment {
  key: string
  from: string
  to: string
  label?: string
  x1: number
  y1: number
  x2: number
  y2: number
  fromSide: LinkSide
  toSide: LinkSide
  /**
   * The rendered path. Built HERE rather than in the component, so the whole
   * shape of a link is decided in the module verify:viewport can drive under
   * plain node — the same split that put the anchors here rather than in
   * LinkLayer in M13.
   */
  d: string
  /**
   * The cubic's control points, carried so a consumer can find the CURVE's own
   * midpoint without measuring a laid-out path element.
   *
   * The label and (from M24's task 6) the remove badge both sit at t = 0.5,
   * where a cubic reduces to (P0 + 3C1 + 3C2 + P3) / 8 — a closed form needing
   * no DOM. The alternative, getPointAtLength, makes the position depend on a
   * laid-out element and so cannot be computed on the first render at all.
   *
   * Flattened to four numbers rather than two points because LinkSegment is
   * serialised into React keys and read by checks; a nested object here buys
   * nothing and reads worse at every call site.
   */
  c1x: number
  c1y: number
  c2x: number
  c2y: number
}
```

And in `buildLinkSegments`, replace the `out.push(...)` call:

```ts
      const controls = linkControls(anchors)
      out.push({
        key: `${from.id} ${link.to}`,
        from: from.id,
        to: link.to,
        // Absent stays absent, the rule `title` and `command` already obey:
        // `label: undefined` is a different fact from the key being missing,
        // and it is the one that survives a structured clone.
        ...(link.label === undefined ? {} : { label: link.label }),
        ...anchors,
        d: linkPath(anchors),
        c1x: controls.c1.x,
        c1y: controls.c1.y,
        c2x: controls.c2.x,
        c2y: controls.c2.y
      })
```

Add `linkControls` and `linkPath` to this file's own imports if they are declared below `buildLinkSegments` — they are in the same module, so a plain function declaration is hoisted and no import is needed.

- [ ] **Step 2: Swap the `<line>` for a `<path>` in `LinkLayer.tsx`**

Replace the `<line>` element inside the `segments.map` with:

```tsx
          <path
            className="link-layer__line"
            data-link={s.key}
            d={s.d}
            markerEnd="url(#link-arrow)"
          />
```

Leave the `<defs>`, the `<marker>`, the label `<text>` and the `memo` exactly as they are. `orient="auto-start-reverse"` already orients the head along the path's own end tangent, so a curve gets a correctly-angled arrowhead with no change.

Update the label's position to sit on the curve rather than on the straight midpoint — the straight midpoint can now fall well off the drawn line:

```tsx
          {s.label !== undefined && (
            <text
              className="link-layer__label"
              // The CURVE's midpoint, not the chord's. At t = 0.5 a cubic
              // reduces to (P0 + 3C1 + 3C2 + P3) / 8, so this needs no path
              // measurement and no DOM — a getPointAtLength call here would
              // make the label position depend on a laid-out element and
              // would not survive the first render.
              x={(s.x1 + 3 * s.c1x + 3 * s.c2x + s.x2) / 8}
              y={(s.y1 + 3 * s.c1y + 3 * s.c2y + s.y2) / 8}
              textAnchor="middle"
            >
              {s.label}
            </text>
          )}
```

The control points this reads are already on `LinkSegment` from Step 1.

- [ ] **Step 3: Style the curve**

In `src/renderer/styles.css`, replace the `.link-layer__line` rule. `fill: none` is now load-bearing rather than incidental — a `<path>` with a default fill paints the region the curve encloses as a solid blob:

```css
/* M24. A path rather than a line. `fill: none` is now LOAD-BEARING: an SVG
   path fills the region its curve encloses by default, so without it every
   link paints as a solid crescent over the canvas. It was harmless on the
   <line> this replaced, which has no interior to fill. */
.link-layer__line {
  stroke: var(--line-strong);
  stroke-width: 2px;
  stroke-linecap: round;
  fill: none;
}
```

- [ ] **Step 4: Verify the existing end-to-end link checks still pass**

Run: `npm run build && npm run verify:panels`

Expected: checks **125, 127 and 128 still PASS**. They query `.link-layer [data-link]`, which is element-agnostic, so a `<path>` satisfies them. If 127 fails here, stop — it should not change until Task 6, and a failure now means the layer took pointer events early.

- [ ] **Step 5: Run the pure suite too**

Run: `npm run verify:viewport`

Expected: **PASS**, including 86/87/88 which read `buildLinkSegments`' output and must not have been disturbed by the added fields.

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add src/renderer/canvas/link-geometry.ts src/renderer/canvas/LinkLayer.tsx src/renderer/styles.css
git commit -m "$(cat <<'EOF'
feat(m24): render links as bezier curves

The d string is built in link-geometry.ts rather than in the component, so
the whole shape of a link stays in the module verify:viewport drives under
plain node — the same split that put the anchors there in M13.

data-link moves from <line> to <path> and keeps its attribute and value, so
verify:panels 125/127/128's linkPaths() helper is unaffected: it queries
'.link-layer [data-link]' and is element-agnostic.

`fill: none` becomes load-bearing rather than incidental. A <line> has no
interior to fill; a <path> paints the region its curve encloses, so without
it every link renders as a solid crescent.

The label moves to the CURVE's midpoint via the cubic's t=0.5 closed form
(P0 + 3C1 + 3C2 + P3)/8 rather than the chord's, which can now fall well
off the drawn line. Closed form rather than getPointAtLength, which would
make the label position depend on a laid-out element.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Nearest-target resolution

**Files:**
- Modify: `src/renderer/canvas/link-geometry.ts`
- Test: `scripts/verify-viewport.cjs` (append check 96)

**Interfaces:**
- Consumes: `WorldRect` from `./viewport`; `hitTest` is **not** imported (see the comment in Step 2 — this module stays free of `viewport.ts`).
- Produces:
  ```ts
  export const SNAP_RADIUS_PX: number
  export function nearestLinkTarget(
    rects: WorldRect[],
    world: { x: number; y: number },
    radiusWorld: number,
    excludeId: string
  ): string | null
  ```

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-viewport.cjs`, before the summary block:

```js
// 96. nearestLinkTarget resolves a drop. Four clauses, each rejecting a
//     different wrong implementation, because any one of them alone passes
//     against something broken:
//
//     (a) A panel CONTAINING the point beats a merely-near one. Without it, a
//         drop squarely inside a panel that happens to sit near a smaller
//         neighbour links the neighbour — the single most confusing outcome
//         this gesture can produce, because the user was aiming at a thing
//         they were pointing directly at.
//     (b) The SOURCE is excluded. Without it every drag snaps back to itself,
//         addLink refuses the self-link, and the gesture can never complete —
//         a feature that is silently 100% broken.
//     (c) A panel outside the radius answers null, or the drop has no empty
//         space at all and a mis-aimed release always links SOMETHING.
//     (d) Of two panels both in range, the NEARER wins.
//
//     The rects are given in the z-order the caller uses (hitOrder), and the
//     containment scan walks it backwards, so the topmost of two overlapping
//     panels wins — the same convention hitTest already established.
{
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 }
  const b = { id: 'b', x: 200, y: 0, w: 100, h: 100 }
  const c = { id: 'c', x: 260, y: 0, w: 40, h: 40 }
  const rects = [a, b, c]
  // (a) a point INSIDE b, which is also within radius of c's rect.
  const inside = V.nearestLinkTarget(rects, { x: 250, y: 20 }, 200, 'a')
  // (b) a point inside a, with a as the source.
  const self = V.nearestLinkTarget(rects, { x: 50, y: 50 }, 200, 'a')
  // (c) a point far from everything.
  const far = V.nearestLinkTarget(rects, { x: 5000, y: 5000 }, 90, 'a')
  // (d) a point in empty space between b and a, closer to b.
  const nearer = V.nearestLinkTarget(rects, { x: 180, y: 50 }, 200, 'a')
  ok('96 nearestLinkTarget prefers containment, excludes the source, and respects the radius',
    inside === 'b' && self === null && far === null && nearer === 'b',
    `inside=${inside} self=${self} far=${far} nearer=${nearer}`)
}
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run verify:viewport`

Expected: **FAIL** on 96 with all four values `undefined` — `nearestLinkTarget` does not exist, so `V.nearestLinkTarget(...)` throws a `TypeError`. Because a throw ends the run, confirm the RED by the summary total dropping rather than by seeing `FAIL 96` printed. Guard the call while confirming if you want the printed form:

```js
  const call = (...args) => (typeof V.nearestLinkTarget === 'function' ? V.nearestLinkTarget(...args) : undefined)
```

Use the guarded form only to observe the RED; the committed check calls `V.nearestLinkTarget` directly, because a guard that survives into the tree is a check that silently stops testing anything the day the export is deleted.

- [ ] **Step 3: Implement**

Append to `src/renderer/canvas/link-geometry.ts`:

```ts
/**
 * How close to a panel a drop counts as landing on it, in SCREEN pixels.
 *
 * Screen pixels, converted to world by dividing by scale at the call site —
 * deliberately UNLIKE cascadeCentre's CASCADE_STEP, which is world-fixed on
 * purpose so a cascade stays constant relative to the panels at every zoom.
 * A snap radius is the opposite problem: the user aims with a cursor in
 * screen space, so a world-fixed radius would be unhittable at 0.2x and
 * absurdly grabby at 3x — the same panel would need a 5x more accurate
 * release depending only on how far the user happened to be zoomed out.
 */
export const SNAP_RADIUS_PX = 90

/** Shortest distance from a point to a rect. Zero when the point is inside. */
function distanceToRect(r: WorldRect, p: { x: number; y: number }): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h))
  return Math.hypot(dx, dy)
}

/**
 * Which panel a drop at `world` should link to, or null.
 *
 * A panel CONTAINING the point always wins, even when a smaller neighbour's
 * border is nearer — a user releasing squarely inside a panel meant that
 * panel, and answering the neighbour is the most confusing outcome this
 * gesture can produce. Only when nothing contains the point does proximity
 * decide.
 *
 * `rects` is expected in the SAME z-order hitTest takes (bottom first), and
 * the containment scan walks it backwards for hitTest's own reason: the
 * topmost of two overlapping panels is the one the user can see and is
 * pointing at. A caller that hands this an unsorted array gets a defensible
 * but arbitrary answer on overlap, silently — Canvas passes hitOrder, which
 * is already sorted by Panel.z.
 *
 * `excludeId` is REQUIRED rather than optional. Without it every drag from a
 * port resolves to the panel the port is on, addLink refuses the self-link,
 * and the gesture can never complete — a feature that is silently and totally
 * broken, with no error anywhere. verify:viewport 96's (b) clause.
 *
 * This module deliberately does not import hitTest from viewport.ts, even
 * though the containment half duplicates it: link-geometry.ts's only value
 * import today is linksOf, and a second one would make the dependency
 * direction between two pure canvas modules a thing a reader has to check.
 * The duplicated test is four comparisons.
 */
export function nearestLinkTarget(
  rects: WorldRect[],
  world: { x: number; y: number },
  radiusWorld: number,
  excludeId: string
): string | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i]
    if (r.id === excludeId) continue
    if (
      world.x >= r.x &&
      world.x < r.x + r.w &&
      world.y >= r.y &&
      world.y < r.y + r.h
    ) {
      return r.id
    }
  }
  let best: string | null = null
  let bestDistance = radiusWorld
  for (const r of rects) {
    if (r.id === excludeId) continue
    const d = distanceToRect(r, world)
    // Strictly less, so a panel exactly AT the radius is out. The boundary has
    // to fall one way or the other and out is the honest direction: the radius
    // is the point at which the user has plainly not aimed at anything.
    if (d < bestDistance) {
      bestDistance = d
      best = r.id
    }
  }
  return best
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm run verify:viewport`

Expected: **PASS**, total up by one.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/renderer/canvas/link-geometry.ts scripts/verify-viewport.cjs
git commit -m "$(cat <<'EOF'
feat(m24): nearestLinkTarget resolves a drop

Containment beats proximity: a user releasing squarely inside a panel meant
that panel, and answering a nearer small neighbour is the most confusing
outcome this gesture can produce.

excludeId is REQUIRED rather than optional. Without it every drag from a
port resolves to the panel the port sits on, addLink refuses the self-link,
and the gesture can never complete — silently and totally broken, with no
error anywhere.

SNAP_RADIUS_PX is in SCREEN pixels, divided by scale at the call site, and
its comment names CASCADE_STEP and why that one is world-fixed instead: a
cascade should stay constant relative to the panels at every zoom, while a
snap radius is aimed at with a cursor and would otherwise be unhittable at
0.2x and grabby at 3x.

Does not import hitTest despite duplicating four comparisons — this module's
only value import is linksOf, and a second would make the dependency
direction between two pure canvas modules something a reader has to check.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The gesture, the ports, and a link drawn end to end

**Files:**
- Create: `src/renderer/canvas/useLinkDraw.ts`
- Create: `src/renderer/components/PanelPorts.tsx`
- Modify: `src/renderer/components/TerminalPanel.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (append checks 174, 175)

**Interfaces:**
- Consumes: `nearestLinkTarget`, `SNAP_RADIUS_PX` (Task 3); `linkAnchors`, `linkPath` (Task 1); existing `addLink` from `@renderer/panels/panels`; existing `commitHistory`, `hitOrder`, `viewportRef`, `hostRef` in `Canvas.tsx`.
- Produces:
  ```ts
  // useLinkDraw.ts
  export interface LinkDrawState {
    from: string
    cursor: { x: number; y: number }   // world coords
    target: string | null
  }
  export interface LinkDrawDeps {
    hostRef: RefObject<HTMLElement | null>
    viewportRef: RefObject<Viewport>
    rectsRef: RefObject<WorldRect[]>
    onCommit(from: string, to: string): void
  }
  export interface LinkDraw {
    state: LinkDrawState | null
    begin(from: string, event: { clientX: number; clientY: number }): void
    /** Stable; reads a ref. Safe in a listener dep array. */
    isDrawing: () => boolean
  }
  export function useLinkDraw(deps: LinkDrawDeps): LinkDraw

  // PanelPorts.tsx
  export const PORT_MIN_SCALE: number
  export function PanelPorts(props: {
    panelId: string
    onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  }): JSX.Element | null
  ```

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, immediately before the file's final summary block. They reuse the existing `panelBox`, `railGoTo`, `linkPaths` and `settle` helpers — but those are scoped inside the earlier link block, so re-declare the two small ones locally:

```js
      // ---------------------------------------------------------------------
      // M24. Drawing a link by dragging from a port handle.
      // ---------------------------------------------------------------------

      const portBox = (id, side) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-panel-id="${id}"] [data-port="${side}"]')
        if (!el) return null
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return { zero: true }
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
      })()`)

      // A REAL drag: sendInputEvent, four intermediate moves, and the
      // `leftButtonDown` modifier. All three matter and none is padding.
      // sendInputEvent because a dispatched MouseEvent is isTrusted:false and
      // performs no default action (check 75c's limit). Four moves because the
      // gesture's listeners live on `document` precisely so they survive the
      // cursor leaving the port, and one synthetic hop exercises neither the
      // tracking nor the listener lifetime. `leftButtonDown` because Chromium
      // derives MouseEvent.buttons from the MODIFIER bitfield rather than the
      // `button` field — the same spelling trap the isAutoRepeat note records
      // — and the gesture ends itself on a move with no button held, so
      // without it every drag here would end on its first move.
      const dragPortTo = async (from, to) => {
        wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= 4; i++) {
          wc.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(from.x + ((to.x - from.x) * i) / 4),
            y: Math.round(from.y + ((to.y - from.y) * i) / 4),
            button: 'left',
            modifiers: ['leftButtonDown']
          })
        }
        wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
        await settle()
      }

      const m24Links = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.link-layer [data-link]')].map((e) => e.getAttribute('data-link'))`)

      // 174. A link drawn by the REAL gesture: press a port, drag, release on
      //      a panel. Asserted by the data-link key carrying BOTH IDS IN ORDER
      //      rather than by "a path exists" — an empty layer satisfies a count,
      //      and a key built from an unordered pair satisfies "a link appeared"
      //      while collapsing a->b and b->a into one.
      //
      //      The port must have a NON-ZERO box, which portBox reports
      //      separately: ports are opacity-0 at rest and a zero-sized element
      //      would make every coordinate here land on the panel beneath,
      //      turning this into a check about panel drag with a green result.
      {
        const src = M24_A
        const dst = M24_B
        await railGoTo(dst)                    // frame the target
        const port = await portBox(src, 'e')
        const box = await panelBox(dst)
        if (port && !port.zero && box) await dragPortTo(port, { x: Math.round(box.cx), y: Math.round(box.cy) })
        const links = await m24Links()
        ok('174 a port drag draws a link, keyed with both ids in order',
          port !== null && port.zero !== true && box !== null &&
            links.includes(src + ' ' + dst),
          `port=${JSON.stringify(port)} box=${JSON.stringify(box)} links=${JSON.stringify(links)}`)
      }

      // 175. The drop must NOT WAKE the target. Check 126's argument through a
      //      new door: 126 covers the completing CLICK of the armed mode, and
      //      nothing in it can see a drag.
      //
      //      Holds by construction here rather than by a guard — waking hangs
      //      off onSelectPanel, which fires from MOUSEDOWN, and our mousedown
      //      was consumed by the port while the mouseup lands on a panel that
      //      has no mouseup handler at all. "Holds by construction" is exactly
      //      the claim a later refactor breaks silently, which is why it is
      //      checked rather than argued.
      //
      //      SPAWNED, never "absent from __m4aSessions()". The registry mints a
      //      PanelSession for every rendered panel including a dormant one —
      //      that is the whole of "two lifetimes, not one" — so the absence
      //      form fails against CORRECT code, which is how check 126's own
      //      first draft failed.
      {
        const src = M24_A
        await railGoTo(M24_DORMANT)
        const port = await portBox(src, 'e')
        const box = await panelBox(M24_DORMANT)
        if (port && !port.zero && box) await dragPortTo(port, { x: Math.round(box.cx), y: Math.round(box.cy) })
        const target = (await wc.executeJavaScript(
          `(window.__m4aSessions ? window.__m4aSessions() : [])`))
          .find((x) => x.id === M24_DORMANT)
        const links = await m24Links()
        ok('175 a port drag links a dormant panel WITHOUT waking it',
          port !== null && box !== null &&
            links.includes(src + ' ' + M24_DORMANT) &&
            target !== undefined && target.spawned === false && target.dormant === true,
          `target=${JSON.stringify(target)} links=${JSON.stringify(links)}`)
      }
```

**Fixture setup.** Put this immediately before the two checks. It is the disk-append-and-reload route checks 39, 84 and 125 already use, with three ids and a park coordinate distinct from every existing fixture so a stale one cannot be mistaken for this block's.

```js
      const M24_A = 'm24A'
      const M24_B = 'm24B'
      const M24_C = 'm24C'
      const M24_DORMANT = 'm24-dormant'

      // Seeded through the layout file and a reload rather than through
      // spawns, because check 175 needs a panel that has GENUINELY never been
      // promoted, and the only way to get one is a panel restored from disk
      // that no camera has ever framed.
      //
      // A, B and C are 260 world units apart, which is what lets a rail click
      // on one leave the others on screen: .canvas is ~700px wide here, so
      // framing B puts A's centre ~260px left of centre, comfortably inside.
      // Check 125's own first draft parked its pair 600 apart and failed with
      // the target's rect off the window entirely.
      //
      // M24_DORMANT is parked at (80000,80000): distinct from check 39's
      // (50000,50000), check 84's (60000,60000) and check 125's (70000,70000).
      //
      // Seeded HERE rather than borrowed from the M13 link block. By this
      // point in the run M18's move and delete checks have left the active
      // workspace with no terminal panel at all — check 165's own first draft
      // reported `terminal=null` and failed for a fixture reason rather than a
      // behavioural one.
      flushLayoutStore()
      {
        const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
        const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
        const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
        ws.panels.push(
          { id: M24_A, x: -2400, y: -2000, w: 200, h: 160, z: maxZ + 1, cwd: '~', args: ['-l'] },
          { id: M24_B, x: -2140, y: -2000, w: 200, h: 160, z: maxZ + 2, cwd: '~', args: ['-l'] },
          { id: M24_C, x: -2400, y: -1740, w: 200, h: 160, z: maxZ + 3, cwd: '~', args: ['-l'] },
          { id: M24_DORMANT, x: 80000, y: 80000, w: 200, h: 160, z: maxZ + 4, cwd: '~', args: ['-l'] }
        )
        writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
        layoutStore.load()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        await waitUntil(async () =>
          (await wc.executeJavaScript(
            `!!document.querySelector('[data-rail-row="${M24_A}"]')`)) || false,
          6000)
        await settle()
      }
```

`flushLayoutStore`, `LAYOUT_PATH`, `layoutStore`, `waitUntil` and `settle` are all already in scope at the end of this file — this is the same block check 125's fixture uses verbatim, with different ids and coordinates.

- [ ] **Step 2: Run and verify they fail**

Run: `npm run build && npm run verify:panels`

Expected: **FAIL** on 174 and 175, both reporting `port=null` — no `[data-port]` element exists. This is the honest RED for this task: the ports are what the checks are looking for and they are not there. Neither check throws, because `portBox` returns `null` rather than indexing into nothing, and both `if` guards skip the drag.

- [ ] **Step 3: Write `useLinkDraw.ts`**

Create `src/renderer/canvas/useLinkDraw.ts`:

```ts
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { nearestLinkTarget, SNAP_RADIUS_PX } from './link-geometry'
import { screenToWorld, type Viewport, type WorldRect } from './viewport'

export interface LinkDrawState {
  /** The panel the drag started from. */
  from: string
  /** The cursor, in WORLD coordinates, so the ghost renders inside .world. */
  cursor: { x: number; y: number }
  /** The panel a release right now would link to, or null. */
  target: string | null
}

export interface LinkDrawDeps {
  hostRef: RefObject<HTMLElement | null>
  /** Read through a ref: the viewport changes on every wheel event. */
  viewportRef: RefObject<Viewport>
  /** Read through a ref: rects change on every frame of a panel drag. */
  rectsRef: RefObject<WorldRect[]>
  /** Called once, on a release that resolved to a target that is not the source. */
  onCommit(from: string, to: string): void
}

export interface LinkDraw {
  state: LinkDrawState | null
  begin(from: string, event: { clientX: number; clientY: number }): void
  /**
   * Referentially STABLE, and reads a ref rather than state, so it can sit in
   * a listener's dep array without tearing that listener down on every move —
   * the constraint usePalette.isOpen, shouldYieldWheel and LinkMode.isArmed
   * all already record.
   */
  isDrawing: () => boolean
}

/**
 * The drag that draws a link (M24).
 *
 * Modelled line for line on usePanelDrag: state in a ref, a depsRef mirroring
 * the callbacks so the document listeners are installed once and never torn
 * down, and move/up on `document` rather than on the port — the cursor leaves
 * the port immediately and a listener on it would stop receiving events the
 * moment it did.
 *
 * It does not collide with xterm-pointer.ts's capture-phase interceptor, for
 * usePanelDrag's own reason: that interceptor only corrects a gesture whose
 * mousedown landed inside a `.panel__slot`, and a port is a sibling of the
 * slot rather than a child of it.
 *
 * DROPPING ON A DORMANT PANEL CANNOT WAKE IT, structurally. Waking hangs off
 * onSelectPanel, which fires from MOUSEDOWN; our mousedown was consumed by the
 * port, and the mouseup lands on a panel that has no mouseup handler at all.
 * That is M13 success criterion 2 held by construction rather than by a guard
 * — and "by construction" is precisely the claim a later refactor breaks
 * silently, which is why verify:panels 175 checks it rather than trusting it.
 */
export function useLinkDraw(deps: LinkDrawDeps): LinkDraw {
  const [state, setState] = useState<LinkDrawState | null>(null)
  const stateRef = useRef<LinkDrawState | null>(state)
  stateRef.current = state
  const depsRef = useRef(deps)
  depsRef.current = deps

  const isDrawing = useCallback(() => stateRef.current !== null, [])

  const begin = useCallback((from: string, event: { clientX: number; clientY: number }) => {
    const host = depsRef.current.hostRef.current
    const viewport = depsRef.current.viewportRef.current
    if (!host || !viewport) return
    const bounds = host.getBoundingClientRect()
    const cursor = screenToWorld(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      viewport
    )
    setState({ from, cursor, target: null })
  }, [])

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      const current = stateRef.current
      if (!current) return
      // A move with no button held cannot be part of a drag — it is the tail
      // of a press whose mouseup never arrived (the window lost focus, a
      // dialog stole it). END the gesture rather than skipping the event: a
      // gesture whose document listeners outlive it is a mousemove that keeps
      // recomputing state nobody asked for. usePanelDrag's own lesson.
      if ((event.buttons & 1) === 0) {
        setState(null)
        return
      }
      const host = depsRef.current.hostRef.current
      const viewport = depsRef.current.viewportRef.current
      const rects = depsRef.current.rectsRef.current
      if (!host || !viewport || !rects) return
      const bounds = host.getBoundingClientRect()
      const cursor = screenToWorld(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        viewport
      )
      // SCREEN pixels divided by scale. See SNAP_RADIUS_PX's own comment for
      // why this is not world-fixed the way CASCADE_STEP deliberately is.
      const radius = SNAP_RADIUS_PX / viewport.scale
      const target = nearestLinkTarget(rects, cursor, radius, current.from)
      setState({ from: current.from, cursor, target })
    }

    const onUp = (): void => {
      const current = stateRef.current
      if (!current) return
      setState(null)
      // addLink refuses a self-link anyway; returning here is what keeps the
      // cancel SILENT rather than a no-op that reads as a link which failed.
      if (!current.target || current.target === current.from) return
      depsRef.current.onCommit(current.from, current.target)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  useEffect(() => {
    // Installed ONLY while a draw is in flight, which is what keeps this from
    // being an always-installed bare-key handler. The app's rule is that a
    // bare keystroke always reaches the PTY, and every exception is a visibly
    // present modal state — a ghost curve following the cursor is exactly
    // that. Capture phase, so it beats the palette's and xterm's own handlers
    // the same way useNavGrid's and useLinkMode's do.
    if (state === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      // Stopped as well as handled: the canvas is drawing, so this Escape is
      // ours, and letting it propagate would ALSO send it to the focused
      // agent's PTY where Escape is very much a meaningful key.
      event.stopPropagation()
      setState(null)
    }
    // Required rather than defensive, for useNavGrid's reason: Cmd+Tab away
    // means the mouseup may never be delivered to this window at all, and a
    // draw with no way to end leaves a ghost curve following a cursor that is
    // no longer here.
    const onBlur = (): void => setState(null)
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('blur', onBlur)
    }
  }, [state === null])

  return { state, begin, isDrawing }
}
```

- [ ] **Step 4: Write `PanelPorts.tsx`**

Create `src/renderer/components/PanelPorts.tsx`:

```tsx
import { memo, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { LinkSide } from '@renderer/canvas/link-geometry'

/**
 * Below this viewport scale the ports do not render at all.
 *
 * They are children of .panel and so ride .world's transform — which is right,
 * and which means a 14px dot is 1.4 screen pixels at 0.1x. An affordance that
 * cannot be hit is worse than one that is not offered, because it reads as a
 * bug rather than as a limit. Chosen below LIVE_MIN_SCALE (0.5) deliberately:
 * a panel that is carded is still a legitimate link endpoint, so the ports
 * must outlive promotion rather than disappearing with it.
 */
export const PORT_MIN_SCALE = 0.4

const SIDES: LinkSide[] = ['n', 'e', 's', 'w']

/**
 * The four link handles on a panel's border (M24).
 *
 * Children of .panel, so they ride .world's single translate()/scale() exactly
 * as .panel__resize does — placing them in screen pixels instead would make
 * them drift on every zoom, which is the mistake EdgeIndicators exists on the
 * other side of.
 *
 * One component, FIVE call sites: terminal, review, file, Jira and toolbox.
 * `links` lives on PanelBase and verify:viewport 88 pins that the geometry
 * never asks a panel its kind, so every kind is already a valid endpoint —
 * this makes the GESTURE as kind-agnostic as the arithmetic. The authority on
 * that list is isTerminalPanel's negation in panels.ts, which names all four
 * non-terminal kinds; a fifth kind added later needs a call site here too.
 */
function PanelPortsImpl({
  panelId,
  onBeginLink
}: {
  panelId: string
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
}): JSX.Element | null {
  return (
    <>
      {SIDES.map((side) => (
        <div
          key={side}
          className={`panel__port panel__port--${side}`}
          data-port={side}
          title="Drag to link this panel to another"
          onMouseDown={(event) => {
            // Both are load-bearing and neither is the other. stopPropagation
            // keeps this off the chrome's move-drag and off the canvas's
            // background handler, which would otherwise read it as a click on
            // empty space and start a marquee. preventDefault suppresses the
            // native drag the browser would otherwise begin on the element.
            event.stopPropagation()
            event.preventDefault()
            onBeginLink(panelId, event)
          }}
        />
      ))}
    </>
  )
}

export const PanelPorts = memo(PanelPortsImpl)
```

- [ ] **Step 5: Style the ports**

Append to `src/renderer/styles.css`:

```css
/* M24. The four link handles. Children of .panel, so they ride .world's
   transform with the rest of the panel — the same placement .panel__resize
   already has, and for the same reason: a handle sized in screen pixels would
   drift away from its own border on every zoom.

   z-index 4 so a port beats .panel__resize--se (3) and --e/--s (2) where they
   overlap. --e covers the ENTIRE right border, so the east port sits on top of
   it by construction, and the cursor change is honest feedback about which of
   the two a press will reach.

   opacity 0 and 1, never a fraction: verify:styles check 3 forbids fractional
   opacity, and integers are what this wanted anyway. */
.panel__port {
  position: absolute;
  width: 14px;
  height: 14px;
  z-index: 4;
  border-radius: var(--r-full);
  border: 2px solid var(--s-2);
  background: var(--iris);
  cursor: crosshair;
  opacity: 0;
  transition: opacity var(--dur-1) var(--ease);
}

.panel:hover .panel__port,
/* Every panel reveals its ports while ANY draw is in flight, so the drop
   targets are visible rather than hunted for. This is the single largest
   contributor to the gesture feeling aimed rather than guessed at. */
.canvas--linking .panel__port {
  opacity: 1;
}

/* Below PORT_MIN_SCALE the ports are not rendered at all — see the constant's
   own comment. This rule is the hover half only. */
.panel__port:hover {
  border-color: var(--fg);
}

.panel__port--n { top: -7px; left: 50%; margin-left: -7px; }
.panel__port--s { bottom: -7px; left: 50%; margin-left: -7px; }
.panel__port--w { left: -7px; top: 50%; margin-top: -7px; }
.panel__port--e { right: -7px; top: 50%; margin-top: -7px; }
```

- [ ] **Step 6: Mount the ports in `TerminalPanel.tsx`**

Add the import and render the component immediately after the resize-handle `map`, inside the same `.panel__motion` wrapper:

```tsx
import { PanelPorts, PORT_MIN_SCALE } from './PanelPorts'
```

```tsx
      {/* M24. Suppressed under readOnly exactly as the resize handles are —
          that is the merged view, whose geometry is read-only, and addLink
          there would write to a workspace record this canvas does not own.
          Suppressed below PORT_MIN_SCALE because a 14px dot is under two
          screen pixels at 0.1x. */}
      {!readOnly && scale >= PORT_MIN_SCALE && (
        <PanelPorts panelId={session.id} onBeginLink={onBeginLink} />
      )}
```

Add `scale: number` and `onBeginLink: (panelId: string, event: ReactMouseEvent) => void` to `TerminalPanel`'s props interface, and thread both from `Canvas.tsx` where the component is rendered. `scale` comes from `viewport.scale`.

- [ ] **Step 7: Wire `Canvas.tsx`**

Near the existing `const linkMode = useLinkMode()` (around line 320), add:

```tsx
  // M24. The drag half of link creation. linkMode (the armed click-then-click
  // path the palette and inspector use) is UNCHANGED and stays: it is the
  // keyboard-reachable route, verify:palette 76/77 pin it, and ports are an
  // additional entry point rather than a replacement.
  const linkDraw = useLinkDraw({
    hostRef,
    viewportRef,
    rectsRef: hitOrderRef,
    onCommit: (from, to) => {
      setPanels((current) => {
        const next = addLink(current, from, to)
        // addLink returns the SAME array when it refuses (a self-link, a
        // duplicate), and committing unconditionally would push a history
        // entry for a gesture that changed nothing — one wasted Cmd+Z. The
        // rule is one entry per COMMITTED gesture, never one per attempt.
        if (next !== current) commitHistory(next)
        return next
      })
    }
  })
```

Add the ref that feeds `rectsRef`, beside the existing `displayPanelsRef`:

```tsx
  // Read through a ref because hitOrder is a fresh array on every frame of a
  // panel drag, and useLinkDraw's document listeners are installed once.
  const hitOrderRef = useRef(hitOrder)
  hitOrderRef.current = hitOrder
```

Add the linking class to the canvas host so the CSS above can reveal every panel's ports:

```tsx
        className={`canvas${linkDraw.state !== null ? ' canvas--linking' : ''}`}
```

And pass the two new props at the `TerminalPanel` call site:

```tsx
              scale={viewport.scale}
              onBeginLink={(id, event) => linkDraw.begin(id, event)}
```

- [ ] **Step 8: Run the checks and verify they pass**

Run: `npm run build && npm run verify:panels`

Expected: **174 and 175 PASS.** Also confirm **125, 126, 127 and 128 are still green** — the armed mode must be untouched, and 127 must not have moved yet.

- [ ] **Step 9: Run the whole chain**

Run: `npm run verify`

Expected: green. `verify:styles` is the one most likely to catch something here — a fractional opacity or an untokenised colour in the new CSS.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/canvas/useLinkDraw.ts src/renderer/components/PanelPorts.tsx \
        src/renderer/components/TerminalPanel.tsx src/renderer/canvas/Canvas.tsx \
        src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "$(cat <<'EOF'
feat(m24): draw a link by dragging from a port handle

useLinkDraw is modelled line for line on usePanelDrag: state in a ref, a
depsRef mirroring the callbacks, move/up on `document` because the cursor
leaves the port immediately, and a buttons-up branch that ENDS the gesture
rather than skipping — a gesture whose document listeners outlive it keeps
recomputing state nobody asked for.

Dropping on a dormant panel cannot wake it, structurally: waking hangs off
onSelectPanel, which fires from MOUSEDOWN, and our mousedown was consumed by
the port while the mouseup lands on a panel with no mouseup handler at all.
Check 175 pins it anyway — "holds by construction" is exactly the claim a
later refactor breaks silently. It asserts `spawned === false` and never the
id being absent from __m4aSessions(), because the registry mints a
PanelSession for every rendered panel including a dormant one; the absence
form fails against correct code, which is how check 126's first draft failed.

Escape and blur listeners are installed ONLY while a draw is in flight,
which is what keeps this from being an always-installed bare-key handler.
blur is required rather than defensive: Cmd+Tab means the mouseup may never
reach this window.

The armed click-then-click mode is untouched and stays — it is the
keyboard-reachable path and verify:palette 76/77 pin it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The in-flight preview

**Files:**
- Modify: `src/renderer/canvas/LinkLayer.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (append check 176)

**Interfaces:**
- Consumes: `LinkDrawState` (Task 4), `linkAnchors`/`linkPath` (Task 1).
- Produces: `LinkLayer` gains an optional `draw?: LinkDrawState` prop and a `panelsById` lookup. DOM contract: `.link-layer__ghost` exists exactly while a draw is in flight; `[data-link-target]` marks the prospective target.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-panels.cjs`:

```js
      // 176. A release in genuinely empty space, outside the snap radius,
      //      creates NOTHING — and the same fixture's in-radius release DOES
      //      create a link.
      //
      //      The second half is the non-vacuity guard and is not optional. The
      //      "creates nothing" clause alone passes perfectly against a gesture
      //      that never worked at all, which is the trap check 100 records for
      //      its own negative and the reason it is described there as evidence
      //      only once its positive neighbour has been watched red.
      //
      //      Distances are in SCREEN pixels because SNAP_RADIUS_PX is: the
      //      far drop is 6x the radius away, comfortably outside it at any
      //      scale this fixture runs at.
      {
        const src = M24_A
        const dst = M24_B
        await railGoTo(dst)
        const box = await panelBox(dst)
        const port = await portBox(src, 'e')
        let farLinks = null
        let nearLinks = null
        if (port && !port.zero && box) {
          const before = await m24Links()
          // Far: well outside the radius, in empty canvas.
          await dragPortTo(port, { x: Math.round(box.cx) + 540, y: Math.round(box.cy) + 540 })
          farLinks = await m24Links()
          // Near: just outside the panel's own border, inside the radius.
          const port2 = await portBox(src, 'e')
          if (port2 && !port2.zero) {
            await dragPortTo(port2, { x: Math.round(box.x) - 20, y: Math.round(box.cy) })
          }
          nearLinks = await m24Links()
          farLinks = { before, after: farLinks }
        }
        const key = src + ' ' + dst
        ok('176 a drop outside the radius creates nothing; a near-miss still snaps',
          farLinks !== null && nearLinks !== null &&
            farLinks.after.length === farLinks.before.length &&
            !farLinks.after.includes(key) &&
            nearLinks.includes(key),
          `far=${JSON.stringify(farLinks)} near=${JSON.stringify(nearLinks)}`)
      }
```

**Use `M24_C` as the source, not `M24_A`.** Check 174 already created `M24_A -> M24_B`, so re-running the same pair here would find the link already present and the near-miss clause would pass without the snap ever firing. `M24_C` is seeded by Task 4's fixture block for exactly this, and using it keeps this check independent of 174's outcome:

```js
        const src = M24_C
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run build && npm run verify:panels`

Expected: **FAIL** on 176. Before the preview exists the gesture already resolves a target on release, so the *far* half may already pass — the half that must be red is the near-miss, `nearLinks` not containing the key, because without a rendered preview the user has no feedback but the snap itself should still work. **If 176 passes outright at this step, the preview is not what it is testing** — that is acceptable and expected: 176 is a *snapping* check, and Task 5's preview is the affordance that makes snapping legible. Record it as passing and continue; the RED that matters for this task is visual and is covered by Task 8's hand-check.

- [ ] **Step 3: Render the ghost**

In `LinkLayer.tsx`, accept the draw state and a rect lookup, and render the ghost after the committed segments:

```tsx
function LinkLayerImpl({
  panels,
  draw
}: {
  panels: Panel[]
  draw?: LinkDrawState | null
}): JSX.Element | null {
  const segments = useMemo(() => buildLinkSegments(panels), [panels])
  // The ghost is the one thing in this layer drawn from state that is not
  // persisted. It is built here rather than in its own sibling layer because
  // it needs exactly the same world-space transform the committed links do,
  // and a second absolutely-positioned SVG would be one more node for every
  // hit test in the layer above to walk past.
  const ghost = useMemo(() => {
    if (!draw) return null
    const from = panels.find((p) => p.rect.id === draw.from)
    if (!from) return null
    // A 1x1 rect standing in for the cursor, so the SAME clip arithmetic the
    // committed links use decides where the ghost leaves the source border.
    // Building a second, special-cased path for the in-flight case is how the
    // preview and the committed link end up disagreeing about where a link
    // starts, which reads as the line JUMPING on release.
    const cursorRect = { id: '', x: draw.cursor.x, y: draw.cursor.y, w: 1, h: 1 }
    const anchors = linkAnchors(from.rect, cursorRect)
    return anchors ? linkPath(anchors) : null
  }, [draw, panels])

  if (segments.length === 0 && ghost === null) return null
```

Then inside the `<svg>`, after the segments:

```tsx
      {ghost !== null && (
        <path className="link-layer__ghost" d={ghost} markerEnd="url(#link-arrow)" />
      )}
```

If `segments.length === 0` the `<defs>` still has to render, so make sure the early return covers only the case where there is nothing at all to draw — the edited condition above does that.

- [ ] **Step 4: Mark the prospective target**

In `Canvas.tsx`, at the `TerminalPanel` call site, pass the flag and set an attribute on the panel root in `TerminalPanel.tsx`:

```tsx
              linkTarget={linkDraw.state?.target === panel.rect.id}
```

```tsx
      data-link-target={linkTarget ? '' : undefined}
```

And style it:

```css
/* M24. The panel a release right now would link to. A ring rather than a fill:
   a fill would hide the agent output this app exists to show, on the one panel
   the user is currently looking at. */
.panel[data-link-target] {
  box-shadow: 0 0 0 2px var(--iris);
}

/* The in-flight preview. Dashed so it reads as provisional rather than as a
   link that already exists — the whole point of the preview is that it says
   what WOULD happen, and a solid ghost is indistinguishable from a committed
   link that failed to attach. */
.link-layer__ghost {
  stroke: var(--iris);
  stroke-width: 2px;
  stroke-linecap: round;
  stroke-dasharray: 6 5;
  fill: none;
}
```

- [ ] **Step 5: Pass the draw state to the layer**

In `Canvas.tsx`, at the `<LinkLayer>` call site:

```tsx
          <LinkLayer panels={displayPanels} draw={linkDraw.state} />
```

- [ ] **Step 6: Run and verify**

Run: `npm run build && npm run verify:panels`

Expected: **176 PASS**, and 125/126/127/128/174/175 still green.

- [ ] **Step 7: Commit**

```bash
npm run typecheck
git add src/renderer/canvas/LinkLayer.tsx src/renderer/canvas/Canvas.tsx \
        src/renderer/components/TerminalPanel.tsx src/renderer/styles.css \
        scripts/verify-panels.cjs
git commit -m "$(cat <<'EOF'
feat(m24): live ghost curve and target highlight while drawing

The ghost is built from the SAME linkAnchors/linkPath the committed links
use, with a 1x1 rect standing in for the cursor. A second, special-cased
path for the in-flight case is how the preview and the committed link end up
disagreeing about where a link starts, which reads on screen as the line
JUMPING on release.

It renders inside LinkLayer rather than in a sibling layer because it needs
exactly the same world-space transform, and a second absolutely-positioned
SVG would be one more node for every hit test in the layer above to walk.

Dashed rather than solid: the preview's whole job is to say what WOULD
happen, and a solid ghost is indistinguishable from a committed link that
failed to attach.

Check 176's non-vacuity half is not optional — the "creates nothing" clause
alone passes perfectly against a gesture that never worked at all, which is
the trap check 100 records for its own negative.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Hover target, remove badge, and the rewrite of check 127

**Files:**
- Modify: `src/renderer/canvas/LinkLayer.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (**rewrite** check 127; append check 177)

**Interfaces:**
- Consumes: `LinkSegment.d`, `c1x/c1y/c2x/c2y` (Task 2); the existing `paletteActions.removeLink(from, to)` in `Canvas.tsx`, which already calls `removeLink` + `commitHistory`.
- Produces: DOM contract — `.link-layer__hit` (one per link, transparent, `pointer-events: stroke`), `.link-layer__badge[data-link-remove="<from> <to>"]` rendered only while its link is hovered.

- [ ] **Step 1: Rewrite check 127**

Replace the body of check 127 in `scripts/verify-panels.cjs`. The `elementFromPoint` clause is now structurally false and must go; the behavioural clause it always really rested on stays and becomes the whole check:

```js
      // 127. A click on a link still behaves exactly as a click on bare
      //      canvas. REWRITTEN in M24, and the rewrite is a strengthening
      //      rather than a relaxation.
      //
      //      It used to assert elementFromPoint at a link's midpoint returns
      //      the CANVAS — a structural read of `.link-layer { pointer-events:
      //      none }`. M24 gives each link a transparent hit stroke so it can
      //      be hovered, so that read is now false by design and says nothing
      //      about whether anything broke.
      //
      //      What the check was ALWAYS really making is the behavioural claim,
      //      and it survives the change intact: Canvas's background
      //      onMouseDown computes its hit from clientX/clientY through toWorld
      //      and hitTest, and never reads event.target — so a mousedown on the
      //      hit stroke bubbles to it and clears the selection exactly as a
      //      click on empty canvas does.
      //
      //      This is the check that fails if a stray stopPropagation ever
      //      lands on the hit path. That is the whole of what M24 traded away:
      //      the invariant moved from "nothing in this layer can be hit" (one
      //      CSS declaration, impossible to violate by accident) to "things
      //      that can be hit do not consume", which looks entirely reasonable
      //      to break in review. The failure it produces is a panel pinned
      //      live for the rest of the run with nothing on screen to explain it.
      //
      //      Driven with a REAL sendInputEvent for check 75c's reason: a
      //      dispatched MouseEvent is isTrusted:false and performs no default
      //      action, so it would pass identically against the regression.
      //
      //      NOT __m4aSelection, which is the focused terminal's TEXT
      //      selection and answers '' whatever the click did — the trap this
      //      check's own first draft fell into.
      {
        await railGoTo(LINK_A)
        const mid = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.link-layer [data-link]')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
        })()`)
        let before = null
        let after = null
        if (mid) {
          before = await selectedId()
          await clickAt(mid.x, mid.y)
          after = await selectedId()
        }
        ok('127 a click on a link still reaches the background handler beneath it',
          mid !== null && before !== null && after === null,
          `mid=${JSON.stringify(mid)} selected ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      }
```

- [ ] **Step 2: Write the failing check 177**

Append to `scripts/verify-panels.cjs`:

```js
      // 177. Hovering a link reveals a badge that removes it, and ONE Cmd+Z
      //      restores it.
      //
      //      The one-press clause is check 128's argument inherited: a removal
      //      committed in more than one history entry satisfies "the link came
      //      back" after two presses and looks entirely correct in every other
      //      read, while the user's second press then undoes something else.
      //
      //      Driven through __m4bUndo, NEVER a dispatched Cmd+Z: undo is a
      //      main-process MENU accelerator delivered as IPC, so a synthetic
      //      KeyboardEvent reaches nothing at all. Check 128's first draft
      //      fell into exactly this.
      //
      //      The hover is a real sendInputEvent mouseMove rather than a
      //      dispatched mouseover, because the badge's visibility is driven by
      //      React state set from onMouseEnter and an untrusted event would
      //      prove the handler works while proving nothing about the pointer.
      {
        const key = M24_A + ' ' + M24_B
        await railGoTo(M24_B)
        const mid = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.link-layer [data-link="${key}"]')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
        })()`)
        let badge = null
        let afterRemove = null
        let afterUndo = null
        if (mid) {
          wc.sendInputEvent({ type: 'mouseMove', x: mid.x, y: mid.y })
          await settle()
          badge = await wc.executeJavaScript(`(() => {
            const b = document.querySelector('[data-link-remove="${key}"]')
            if (!b) return null
            const r = b.getBoundingClientRect()
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
          })()`)
          if (badge) {
            await clickAt(badge.x, badge.y)
            afterRemove = await m24Links()
            await wc.executeJavaScript(`window.__m4bUndo && window.__m4bUndo()`)
            await settle()
            afterUndo = await m24Links()
          }
        }
        ok('177 the hover badge removes a link, and ONE undo restores it',
          mid !== null && badge !== null &&
            afterRemove !== null && !afterRemove.includes(key) &&
            afterUndo !== null && afterUndo.includes(key),
          `mid=${JSON.stringify(mid)} badge=${JSON.stringify(badge)} ` +
          `afterRemove=${JSON.stringify(afterRemove)} afterUndo=${JSON.stringify(afterUndo)}`)
      }
```

- [ ] **Step 3: Run and verify 177 fails and 127 is red-then-fixed**

Run: `npm run build && npm run verify:panels`

Expected: **177 FAILs** with `badge=null` — no `[data-link-remove]` element exists. **127 should PASS already**, because its rewritten form asserts only the behavioural claim, which is true today. Confirm that; a red 127 here means the rewrite got the helper names wrong, not that behaviour changed.

- [ ] **Step 4: Render the hit stroke and the badge**

In `LinkLayer.tsx`, add hover state and an `onRemove` prop:

```tsx
function LinkLayerImpl({
  panels,
  draw,
  onRemove
}: {
  panels: Panel[]
  draw?: LinkDrawState | null
  onRemove?: (from: string, to: string) => void
}): JSX.Element | null {
  const [hovered, setHovered] = useState<string | null>(null)
```

Inside the `segments.map`, **immediately BEFORE the visible `<path>`** from Task 2. The order is load-bearing twice: SVG paint order is document order, so the invisible hit stroke must come first or its 18px transparent band would paint over the 2px visible curve — and the `.link-layer__hit:hover + .link-layer__line` rule in Step 5 is an adjacent-sibling selector that only matches when the line immediately follows the hit path.

```tsx
          {/* The hit stroke. Wide and transparent, and it takes pointer events
              where the LAYER does not — .link-layer keeps pointer-events:none
              and this opts back in individually.

              IT MUST NEVER CALL stopPropagation. Canvas's background
              onMouseDown computes its hit from clientX/clientY through toWorld
              and hitTest and never reads event.target, so a mousedown here
              bubbles to it and behaves identically to a click on bare canvas:
              selection clears, focusedId clears, a marquee begins. That is the
              whole mechanism by which M24 keeps M13's guarantee while making
              a link hoverable, and verify:panels 127 is what fails if it is
              broken. A stopPropagation added here would look entirely
              reasonable in review and would pin a panel live for the rest of
              the run, holding a WebGL context, with nothing on screen to
              explain it. */}
          <path
            className="link-layer__hit"
            d={s.d}
            onMouseEnter={() => setHovered(s.key)}
            onMouseLeave={() => setHovered((h) => (h === s.key ? null : h))}
          />
          {hovered === s.key && onRemove !== undefined && (
            <g
              className="link-layer__badge"
              data-link-remove={s.key}
              transform={`translate(${(s.x1 + 3 * s.c1x + 3 * s.c2x + s.x2) / 8}, ${
                (s.y1 + 3 * s.c1y + 3 * s.c2y + s.y2) / 8
              })`}
              onMouseEnter={() => setHovered(s.key)}
              onMouseDown={(event) => {
                // The badge DOES stop the event, unlike the hit stroke above:
                // removing a link must not ALSO deselect the canvas underneath
                // and start a marquee. This is the one element in this layer
                // that consumes, and it is deliberate.
                event.stopPropagation()
                event.preventDefault()
                onRemove(s.from, s.to)
                setHovered(null)
              }}
            >
              <circle r="9" />
              <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" />
            </g>
          )}
```

Note the badge sits at the **curve's** midpoint using the same closed form the label uses, so the two land together rather than the badge appearing off the line.

- [ ] **Step 5: Style them**

```css
/* M24. The hover target. Transparent and wide, and it opts back INTO pointer
   events where .link-layer opts out — `stroke` rather than `all`, so only the
   stroked band is hittable and the path's notional interior is not.

   The width is a hit target rather than a visual: 18 world units is a
   comfortable aim at scale 1 and shrinks with the zoom, which is correct —
   at low zoom the ports are gone too, so there is no gesture left to serve. */
.link-layer__hit {
  stroke: transparent;
  stroke-width: 18px;
  fill: none;
  pointer-events: stroke;
  cursor: pointer;
}

/* The adjacent-sibling selector is why the hit path renders BEFORE the line.
   `.link-layer__line:hover` would be dead: the visible line inherits the
   layer's pointer-events: none and can never be hovered itself. */
.link-layer__hit:hover + .link-layer__line {
  stroke: var(--iris);
}

/* The remove badge. pointer-events: all, because it is the ONE element in this
   layer that is meant to consume a click. */
.link-layer__badge {
  pointer-events: all;
  cursor: pointer;
}

.link-layer__badge circle {
  fill: var(--s-3);
  stroke: var(--line-strong);
  stroke-width: 1px;
}

.link-layer__badge path {
  stroke: var(--red);
  stroke-width: 1.5px;
  stroke-linecap: round;
  fill: none;
}
```

- [ ] **Step 6: Pass `onRemove` from `Canvas.tsx`**

```tsx
          <LinkLayer
            panels={displayPanels}
            draw={linkDraw.state}
            // The SAME action the inspector's link rows use, never a second
            // copy: paletteActions.removeLink already calls removeLink and
            // commitHistory together, so both surfaces produce exactly one
            // history entry and cannot disagree about what removing a link
            // means. Suppressed while merged, where geometry and links are
            // read-only — the same gate the drag and the move verb take.
            onRemove={merged ? undefined : paletteActions.removeLink}
          />
```

- [ ] **Step 7: Run and verify**

Run: `npm run build && npm run verify:panels`

Expected: **177 PASS, 127 PASS**, and 125/126/128/174/175/176 green.

- [ ] **Step 8: Run the whole chain**

Run: `npm run verify`

- [ ] **Step 9: Commit**

```bash
git add src/renderer/canvas/LinkLayer.tsx src/renderer/canvas/Canvas.tsx \
        src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "$(cat <<'EOF'
feat(m24): hover a link to remove it; rewrite check 127

The layer keeps pointer-events: none; a transparent wide hit stroke opts
back in individually with pointer-events: stroke, and the badge is the ONE
element here that consumes a click.

The hit stroke MUST NEVER call stopPropagation. Canvas's background
onMouseDown computes its hit from clientX/clientY through toWorld and
hitTest and never reads event.target, so a mousedown on the stroke bubbles
to it and behaves identically to a click on bare canvas. That is the whole
mechanism by which this keeps M13's guarantee while making a link hoverable.

Check 127 is REWRITTEN, and it is a strengthening. It asserted that
elementFromPoint at a link's midpoint returns the CANVAS — a structural read
of the CSS declaration, now false by design. The behavioural claim it was
always really making survives intact and becomes the whole check: a real
click on a link still clears the selection.

What this trades away, stated plainly: the invariant moves from "nothing in
this layer can be hit" (one CSS declaration, impossible to violate by
accident) to "things that can be hit do not consume", which any future
stopPropagation on the hit path silently breaks — and would look entirely
reasonable in review. The failure is a panel pinned live for the rest of the
run, holding a WebGL context, with nothing on screen to explain it.

onRemove is paletteActions.removeLink, the SAME action the inspector's link
rows use, so both surfaces produce exactly one history entry and cannot
disagree about what removing a link means.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Ports on the other four kinds

**Files:**
- Modify: `src/renderer/review/ReviewNode.tsx`
- Modify: `src/renderer/file/FileNode.tsx`
- Modify: `src/renderer/jira/JiraNode.tsx`
- Modify: `src/renderer/toolbox/ToolboxNode.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx` (thread `scale` and `onBeginLink` to each)
- Test: `scripts/verify-panels.cjs` (append check 178)

**Interfaces:**
- Consumes: `PanelPorts`, `PORT_MIN_SCALE` (Task 4).
- Produces: nothing new. Each of the four kinds gains the same two props and the same conditional render.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-panels.cjs`:

```js
      // 178. Ports render on a NON-TERMINAL kind, and are ABSENT in the merged
      //      view — asserted in one read, because "no ports anywhere" passes
      //      the absence half perfectly while deleting the feature. The same
      //      both-directions rule check 106 states for `editable`.
      //
      //      `links` lives on PanelBase and verify:viewport 88 pins that the
      //      geometry never asks a panel its kind, so every kind is already a
      //      valid ENDPOINT — this is the half that makes the GESTURE as
      //      kind-agnostic as the arithmetic.
      //
      //      A FILE panel is the fixture, not a review node. Both are equally
      //      valid non-terminal kinds for this claim, and a file panel is
      //      minted by one call to the __m13Open test hook with no git binary
      //      anywhere in earshot — where a review node needs a real repository
      //      fixture, and checks 99-101 already have to SKIP LOUDLY on a
      //      machine with no git. Gating this check on git would make the
      //      milestone's kind-agnostic claim untested on exactly the machines
      //      least able to notice.
      {
        const before = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(M24_FILE_FIXTURE)})`)
        const fileId = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          const fresh = now.find((id) => !before.has(id))
          return fresh || false
        }, 5000)

        const onFile = fileId ? await portBox(fileId, 'e') : null
        const onTerminal = await portBox(M24_A, 'e')
        // Enter the merged view; ports must vanish on BOTH, because geometry
        // and links are read-only there and addLink would write to a workspace
        // record this canvas does not own.
        await MERGE_M24()
        await settle()
        const mergedFile = fileId ? await portBox(fileId, 'e') : null
        const mergedTerminal = await portBox(M24_A, 'e')
        await MERGE_M24()
        await settle()
        ok('178 ports render on a file panel and vanish in the merged view',
          fileId && onFile !== null && onFile.zero !== true &&
            onTerminal !== null && onTerminal.zero !== true &&
            mergedFile === null && mergedTerminal === null,
          `fileId=${fileId} onFile=${JSON.stringify(onFile)} onTerminal=${JSON.stringify(onTerminal)} ` +
          `mergedFile=${JSON.stringify(mergedFile)} mergedTerminal=${JSON.stringify(mergedTerminal)}`)
      }
```

Two locals this block needs, declared just above it. `chord` and `MERGE` are defined inside M18's own scoped block and are not in scope here, so the merged toggle is re-declared rather than reached for:

```js
      // The merged chord, re-declared: M18's own `chord`/`MERGE` helpers are
      // scoped to that block. `code: 'KeyA'` and not `key`, for check 152's
      // reason — Shift rewrites the printed character, so a key-based test is
      // correct on one keyboard layout and silently dead on every other.
      const MERGE_M24 = () => wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', {` +
        ` key: 'A', code: 'KeyA', metaKey: true, shiftKey: true, bubbles: true })), true`)

      // A file this suite already owns. Reuse the FIXTURE path checks 134-137
      // build — grep `__m13Open` for the constant in scope at that point and
      // point this at the same file, or write a one-line file into the same
      // spaced temp directory those checks already create.
      const M24_FILE_FIXTURE = FIXTURE

- [ ] **Step 2: Run and verify it fails**

Run: `npm run build && npm run verify:panels`

Expected: **FAIL** on 178 with `onNode=null` — the review node renders no ports yet. `onTerminal` should be non-null, which is the clause proving the check can see ports at all.

- [ ] **Step 3: Mount `PanelPorts` in each of the four kinds**

In each of `ReviewNode.tsx`, `FileNode.tsx`, `JiraNode.tsx` and `ToolboxNode.tsx`, add the import and the same block used in `TerminalPanel.tsx`, immediately after that file's own resize-handle `map`:

```tsx
import { PanelPorts, PORT_MIN_SCALE } from '@renderer/components/PanelPorts'
```

```tsx
      {/* M24. The same block TerminalPanel carries, and for the same reasons:
          `links` lives on PanelBase, so this kind is already a valid endpoint
          and the gesture should reach it too. Suppressed under readOnly (the
          merged view, whose geometry and links are read-only) and below
          PORT_MIN_SCALE (a 14px dot is under two screen pixels at 0.1x). */}
      {!readOnly && scale >= PORT_MIN_SCALE && (
        <PanelPorts panelId={panel.rect.id} onBeginLink={onBeginLink} />
      )}
```

Add `scale: number` and `onBeginLink: (panelId: string, event: ReactMouseEvent) => void` to each component's props, and thread both from `Canvas.tsx` at each call site — the same two values already passed to `TerminalPanel` in Task 4.

If a kind does not currently receive a `readOnly` prop, pass `merged` from `Canvas.tsx` under that name to match the others rather than inventing a second spelling.

- [ ] **Step 4: Run and verify it passes**

Run: `npm run build && npm run verify:panels`

Expected: **178 PASS**, and every other check green.

- [ ] **Step 5: Confirm the kind list is complete**

Run:

```bash
grep -n "isTerminalPanel" src/renderer/panels/panels.ts
grep -rln "PanelPorts" src/renderer
```

`isTerminalPanel`'s negation names every non-terminal kind and is the authority on that list. Confirm the second command lists **five** components plus `PanelPorts.tsx` itself. If `isTerminalPanel` names a kind with no `PanelPorts` call site, add it now — that mismatch is exactly the four-versus-five error this milestone's spec self-review caught.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run verify
git add src/renderer/review/ReviewNode.tsx src/renderer/file/FileNode.tsx \
        src/renderer/jira/JiraNode.tsx src/renderer/toolbox/ToolboxNode.tsx \
        src/renderer/canvas/Canvas.tsx scripts/verify-panels.cjs
git commit -m "$(cat <<'EOF'
feat(m24): ports on all five panel kinds

`links` lives on PanelBase and verify:viewport 88 pins that the geometry
never asks a panel its kind, so every kind was ALREADY a valid endpoint.
This makes the gesture as kind-agnostic as the arithmetic.

isTerminalPanel's negation is the authority on the kind list, and Step 5 of
this task greps it rather than trusting a written count — this milestone's
own spec self-review caught a four-versus-five error made exactly by reading
a list instead of that function.

Check 178 asserts presence and merged-view absence in ONE read, because "no
ports anywhere" passes the absence half perfectly while deleting the
feature.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Documentation, the hand-check, and the constraint audit

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/ideas-backlog.md`

**Interfaces:**
- Consumes: everything. Produces: no code.

- [ ] **Step 1: Audit the global constraints**

Run and read the output:

```bash
git diff --stat main -- src/shared/layout-schema.ts src/shared/ipc-contract.ts src/renderer/panels/panels.ts
```

Expected: **empty**. Success criterion 6. If any of the three shows a diff, stop and remove it — the milestone's whole scope argument rests on those files not moving.

```bash
npm run verify:ipc
```

Expected: `1/1`, covering **45** channels. If the number moved, a channel was added and the spec's claim is false.

- [ ] **Step 2: Do the hand-check that no suite can cover**

This is the only step in this plan whose result is a written observation rather than a passing check. There is no visual regression test in this repo and that is a stated position, so record what was seen rather than implying coverage.

```bash
npm run dev
```

Then, by hand:

1. Hover a panel — four dots fade in on its borders. Hover away — they fade out.
2. Drag from the east port to a panel to its right. The ghost curve leaves the border **perpendicular** and does not kink. The target gets a ring.
3. Release. The committed curve **does not jump** — it lands where the ghost was.
4. Zoom to roughly 2× and repeat. Then zoom out below ~0.4× and confirm the ports are **gone** rather than present-and-unhittable.
5. Drag and release in open space well away from any panel — nothing is created, and the ghost disappears.
6. Drag and release just outside a panel's border — it snaps.
7. Press Escape mid-drag — the ghost disappears and no link is created.
8. Hover a committed link — the × badge appears at the curve's midpoint. Click it; the link goes. `Cmd+Z`; it comes back.
9. Click *on* a link (not the badge) with a panel selected — the selection clears, exactly as clicking empty canvas does.
10. Draw two links between the same pair of nearby panels in opposite directions — confirm the two curves are **visually distinguishable** rather than overlapping into one line.

Write the outcome of 2, 3, 6 and 10 into the CLAUDE.md entry in Step 3 — those four are the ones the tuning constants decide and that nothing automated observes. If any of them reads badly, tune `CURVE_RATIO` / `CURVE_MIN` / `CURVE_MAX` / `SNAP_RADIUS_PX` and re-run `npm run verify:viewport` (checks 94 and 95 assert relations, not literals, so tuning must not turn them red — if it does, the check was written with literals after all and that is the bug).

- [ ] **Step 3: Write the CLAUDE.md entries**

Add to the `## Load-bearing details` section. Four entries; each must name the silent failure that follows from undoing it, matching the file's established density:

1. **"The link layer's guarantee moved from structural to conventional."** State the old mechanism (`pointer-events: none` on the layer, impossible to violate by accident), the new one (a hit stroke that opts in and never calls `stopPropagation`), why it holds (Canvas's background `onMouseDown` reads coordinates, never `event.target`), what breaks it (any `stopPropagation` on `.link-layer__hit`), and what that failure looks like (a panel pinned live for the run, holding a WebGL context, with nothing on screen to explain it). Name check 127 and say it was rewritten from a structural claim to a behavioural one.
2. **"`SNAP_RADIUS_PX` is screen-space and `CASCADE_STEP` is world-fixed, and both are right."** The two constants look like the same decision made twice in opposite directions; say why each is correct for its own gesture.
3. **"`linkControls` pushes perpendicular to the SIDE, never along the segment."** Name the horizontal-fixture trap: the two are identical for a horizontal pair, so a horizontal-only check passes against an implementation that never reads the side. Name check 94's vertical fixture.
4. **"The curve's feel is verified by hand, once."** Record the Step 2 observations with the same standing this file already gives the `isAutoRepeat` probe, the `--session-id` filename rule and the link layer's own pixel probe: a fact about one machine on one day, written down, not counted as coverage.

Also update the `verify:viewport`, `verify:panels` and `verify:styles` rows of the commands table with the new totals and a description of each new check, in the style the existing rows use.

- [ ] **Step 4: Update README.md**

Add the milestone row after M23:

```
| M24 | Drawing links: port handles, snapping, and bezier edges | ✅ done |
```

- [ ] **Step 5: Update docs/ideas-backlog.md**

Entry #24's decorative half is now complete. Rewrite its opening so it says the *ergonomics* shipped in M24 alongside the model in M13, and leave the functional half — an edge that pipes or restarts — exactly as it is, including its open question about whether a rule visible only as a line on the canvas is auditable. Add M24's spec to the "see also" links beside M13's.

- [ ] **Step 6: Full verification and commit**

```bash
npm run verify
```

Expected: every suite green. Then:

```bash
git add CLAUDE.md README.md docs/ideas-backlog.md
git commit -m "$(cat <<'EOF'
docs(m24): record the milestone and the pointer-events downgrade

Four load-bearing entries. The one that matters is the first: the link
layer's guarantee moved from STRUCTURAL (pointer-events: none on the layer,
impossible to violate by accident) to CONVENTIONAL (a hit stroke that opts
in and never calls stopPropagation). It holds because Canvas's background
onMouseDown reads clientX/clientY and never event.target. Any future
stopPropagation on .link-layer__hit breaks it, would look entirely
reasonable in review, and produces a panel pinned live for the rest of the
run holding a WebGL context with nothing on screen to explain it.

The other three record why SNAP_RADIUS_PX is screen-space while
CASCADE_STEP is world-fixed and both are right; why linkControls pushes
perpendicular to the SIDE rather than along the segment, and the horizontal
fixture that hides the difference; and the hand-check of the curve's feel,
recorded with the same standing as the isAutoRepeat probe — a fact about one
machine on one day, not counted as coverage.

Backlog #24's decorative half is now complete in both flavours. The
functional half and its open auditability question are unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```
