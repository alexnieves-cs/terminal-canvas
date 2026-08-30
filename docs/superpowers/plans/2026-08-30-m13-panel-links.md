# M13 — links between panels: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user draw a directed, optionally labelled line from one panel to another, persist it, and remove it — the decorative half of backlog #24 and only that half.

**Architecture:** A link is `{ to, label? }` stored on the **source** panel (`PanelBase.links`), so it rides the existing `Panel[]` through the undo stack and the layout file with no new top-level state and no new IPC channel. Pure geometry lives in `renderer/canvas/link-geometry.ts` (plain-node tier); one `<svg>` layer inside `.world` at `z-index: 0` with `pointer-events: none` draws them; a one-shot armed mode resolved by a capture-phase mousedown creates them; the inspector removes and labels them.

**Tech Stack:** TypeScript, React (no StrictMode), Electron, esbuild-bundled plain-node verify suites, real-Electron verify suites.

**Spec:** [`docs/superpowers/specs/2026-08-30-m13-panel-links-design.md`](../specs/2026-08-30-m13-panel-links-design.md)

## Global Constraints

Copied verbatim from the spec and from `CLAUDE.md`. **Every task's requirements implicitly include this section.**

- **The code says `link`, never `edge`.** `EdgeIndicators.tsx` and `viewport.ts`'s `edgeIndicator` already mean the off-screen attention pip. Do not name any new symbol, class, file, or `data-` attribute with the word `edge`.
- **No new IPC channel.** `verify:ipc` must stay at `1/1` covering **31** channels, and `README.md`'s channel list must not need an edit (`verify:meta` 14).
- **`History<Panel[]>` must not change type.** `commitHistory` and `applyHistory` in `Canvas.tsx` must not be modified. If a task appears to need it, stop and report.
- **`registry.dispose` must stay at exactly 5 call sites in `Canvas.tsx`, and `pty.kill` at exactly 2 callers in `session-registry.ts`.** `verify:panels` 94 counts these by regex over the source text, comments included. Do not write the literal string `registry.dispose(` in a comment.
- **`SECTIONS` is not edited by this plan.** If it ever is, `verify:panels` 48 must be run too, not only `verify:palette`.
- **Every new CSS rule uses existing tokens.** `verify:styles` check 1 fails on any hardcoded colour outside a theme block, in hex, `rgb()`, `rgba()` or `hsl()`; check 3 fails on fractional `opacity`; checks 4–6 fail on literal type/radius/spacing values.
- **Run the plain-node suite for a task before committing it**, and `npm run verify` in full before the final commit. Set `TC_VERIFY_SUFFIX=m13links` on any run so a concurrent checkout's tmux sockets are not killed.
- **A check that THROWS aborts its whole suite**, so every check written after it never runs and its RED is not evidence. When watching a check fail, guard calls that may not exist yet (`if (fn) fn()`), and note which checks a throw prevented from running.
- Working directory is the worktree: `/Users/alexnieves/Documents/terminal-canvas/.claude/worktrees/m13-edges`.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/renderer/panels/panels.ts` | modify | `PanelLink` type on `PanelBase`; `pruneLinksTo`, `addLink`, `removeLink`, `setLinkLabel`; `removePanel` grows the incoming prune |
| `src/renderer/canvas/link-geometry.ts` | create | `linkAnchors`, `buildLinkSegments` — pure, plain-node tier |
| `src/shared/layout-schema.ts` | modify | `PersistedPanelBase.links`; `parseLinks`; `parseWorkspace` drops links to panels that did not survive |
| `src/renderer/panels/layout-adapt.ts` | modify | `links` across `toPanels`/`fromPanels` |
| `src/renderer/canvas/LinkLayer.tsx` | create | the one SVG layer inside `.world` |
| `src/renderer/canvas/useLinkMode.ts` | create | the one-shot armed state, `Escape` and `blur` |
| `src/renderer/shell/inspector-fields.ts` | modify | `InspectorLinkRow`, `buildLinkRows`, `InspectorModel.links` |
| `src/renderer/shell/Inspector.tsx` | modify | the Links section |
| `src/renderer/canvas/Canvas.tsx` | modify | mount the layer, wire the mode, the three link actions |
| `src/renderer/palette/commands.ts` | modify | the `panel.link` row |
| `src/renderer/styles.css` | modify | `.link-layer`, `.link-banner`, `.inspector__link` |
| `scripts/viewport-entry.cjs` | modify | add `link-geometry` |
| `scripts/verify-viewport.cjs` | modify | checks 79–88 |
| `scripts/verify-layout.cjs` | modify | checks 109–113 |
| `scripts/verify-rail.cjs` | modify | checks 72–75 |
| `scripts/verify-panels.cjs` | modify | checks 125–129 |
| `CLAUDE.md`, `README.md`, `docs/ideas-backlog.md` | modify | the decisions log, the milestone table, and #24 rewritten down to the open half |

Tasks 1–3 are pure and plain-node. Task 4 is persistence. Tasks 5–8 are the renderer. Task 9 is end-to-end. Task 10 is documentation.

---

### Task 1: The link type and the pure panel mutators

**Files:**
- Modify: `src/renderer/panels/panels.ts`
- Modify: `scripts/verify-viewport.cjs` (append checks 79–82)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface PanelLink { to: string; label?: string }`
  - `PanelBase.links?: PanelLink[]`
  - `pruneLinksTo(panel: Panel, id: string): Panel`
  - `addLink(panels: Panel[], from: string, to: string): Panel[]`
  - `removeLink(panels: Panel[], from: string, to: string): Panel[]`
  - `setLinkLabel(panels: Panel[], from: string, to: string, label: string): Panel[]`
  - `linksOf(panel: Panel): PanelLink[]` — `panel.links ?? []`, the one place absence is normalised

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-viewport.cjs`, immediately before the `console.log('\n' + '='.repeat(60))` summary block:

```js
// ---------------------------------------------------------------------------
// M13. Links between panels. `link`, never `edge`: EdgeIndicators.tsx and
// viewport.ts's edgeIndicator already mean the off-screen attention pip.

// 79. addLink refuses a self-link and refuses a duplicate, and BOTH clauses
//     are required. A self-link is a segment with no direction — linkAnchors
//     answers null for it (check 85), so it would persist forever as a link
//     that renders nothing, which is indistinguishable from a broken feature.
//     A duplicate A->B paints two identical overlapping paths, which is
//     cascadeCentre's indistinguishability argument reached through a
//     different door: the canvas looks like it holds one link while holding
//     two, and removing "the" link leaves one behind.
//
//     B->A alongside A->B is explicitly still allowed — they are different
//     claims — and that clause is what stops a fix for the duplicate case
//     over-correcting into "one link per pair".
{
  const mk = (id) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1 })
  const base = [mk('a'), mk('b')]
  const self = V.addLink(base, 'a', 'a')
  const once = V.addLink(base, 'a', 'b')
  const twice = V.addLink(once, 'a', 'b')
  const both = V.addLink(once, 'b', 'a')
  ok('79 addLink refuses a self-link and a duplicate, but allows the reverse',
    V.linksOf(self[0]).length === 0 &&
    V.linksOf(once[0]).length === 1 && V.linksOf(once[0])[0].to === 'b' &&
    V.linksOf(twice[0]).length === 1 &&
    V.linksOf(both[1]).length === 1 && V.linksOf(both[1])[0].to === 'a')
}

// 80. THE ONE WORTH KNOWING BY NUMBER. removePanel strips INCOMING links, not
//     only the outgoing ones that leave with the panel holding them. This is
//     backlog #24's named failure — "dangling edges are the standard failure
//     of every graph UI that stored ids without deciding this" — and putting
//     the prune inside removePanel rather than at its call sites is what makes
//     the close and the prune land in ONE history entry, so one Cmd+Z restores
//     both (verify:panels 128).
//
//     Its second clause is the over-correction guard and is not redundant: an
//     implementation that stripped every link from every survivor satisfies
//     the first clause perfectly and silently empties the canvas of links on
//     any close at all.
{
  const mk = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', [{ to: 'b' }, { to: 'c' }]), mk('b', [{ to: 'c' }]), mk('c')]
  const next = V.removePanel(panels, 'c')
  const a = next.find((p) => p.rect.id === 'a')
  const b = next.find((p) => p.rect.id === 'b')
  ok('80 removePanel strips links POINTING AT the removed panel, and only those',
    next.length === 2 &&
    V.linksOf(a).length === 1 && V.linksOf(a)[0].to === 'b' &&
    V.linksOf(b).length === 0)
}

// 81. removeLink and setLinkLabel act on the ONE named link and leave its
//     neighbours alone. Asserted together because each alone passes against an
//     implementation that clears the whole array: removeLink's own success is
//     indistinguishable from "removed everything" when the fixture has one
//     link, so the fixture carries two.
{
  const mk = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', [{ to: 'b' }, { to: 'c' }])]
  const removed = V.removeLink(panels, 'a', 'b')
  const labelled = V.setLinkLabel(panels, 'a', 'c', 'feeds')
  const rows = V.linksOf(labelled[0])
  ok('81 removeLink and setLinkLabel touch one link each, never the array',
    V.linksOf(removed[0]).length === 1 && V.linksOf(removed[0])[0].to === 'c' &&
    rows.length === 2 &&
    rows.find((l) => l.to === 'c').label === 'feeds' &&
    rows.find((l) => l.to === 'b').label === undefined)
}

// 82. A panel with NO links key at all reads as no links, and that is the
//     ordinary case rather than an edge one: it is every panel in every
//     layout.json ever written, and every panel this app mints. linksOf is the
//     one place that absence is normalised, so nothing downstream has to
//     remember `?? []` — a missed one is a TypeError inside a render, which
//     takes the whole canvas down rather than one link.
{
  const bare = { kind: 'terminal', rect: { id: 'a', x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: 'a', cwd: '~', args: [] }, z: 1 }
  ok('82 a panel with no links key reads as no links',
    Array.isArray(V.linksOf(bare)) && V.linksOf(bare).length === 0 &&
    V.linksOf(V.removePanel([bare], 'zz')[0]).length === 0)
}
```

- [ ] **Step 2: Run the checks and watch them fail**

```bash
npm run verify:viewport
```

Expected: the suite **aborts with a TypeError** at check 79 — `V.addLink is not a function` — so 80, 81 and 82 never run. That is expected and is why this step is separate: their RED is not yet evidence. Note the total (78 before this task) so the jump to 82 at Step 4 is checkable.

- [ ] **Step 3: Implement**

In `src/renderer/panels/panels.ts`, add to `PanelBase` and add the mutators. Place `PanelLink` immediately above `PanelBase`:

```ts
/**
 * A directed link from the panel HOLDING it to the panel it names.
 *
 * Adjacency on the source rather than a top-level array, and that is what
 * keeps History<Panel[]> — and therefore commitHistory and applyHistory, the
 * two functions in this file's neighbourhood carrying the loudest caveat there
 * is — completely untouched: a link rides Panel, so undo and redo work with no
 * changes to either. The usual objection to storing a relation on one endpoint
 * is that the endpoint is arbitrary; it is not arbitrary here, because the
 * link is DIRECTED (the arrowhead is at `to`), which makes the source a real
 * owner rather than a coin toss.
 *
 * Called `link`, never `edge`: EdgeIndicators.tsx and viewport.ts's
 * edgeIndicator already mean the off-screen attention pip, and a second
 * unrelated `edge` in renderer/canvas/ would make every future grep ambiguous
 * between two features with nothing to do with each other.
 */
export interface PanelLink {
  /** The panel this points AT. The panel holding it is the source. */
  to: string
  /** What the user says it means. Absent until they say — see makePanel. */
  label?: string
}
```

Add to `PanelBase`, after `title`:

```ts
  /**
   * Outgoing links. OPTIONAL, and absent means none — which is every panel in
   * every layout.json ever written and every panel this app mints. Read it
   * through linksOf, never directly, so the absence is normalised in one
   * place: a missed `?? []` is a TypeError inside a render, which takes the
   * whole canvas down rather than one link.
   */
  links?: PanelLink[]
```

Then, after `removePanel`'s current position:

```ts
/** The one place `links` being absent is normalised. See PanelBase.links. */
export function linksOf(panel: Panel): PanelLink[] {
  return panel.links ?? []
}

/**
 * Drop every link on this panel that points at `id`. Returns the panel
 * UNCHANGED (same reference) when nothing pointed there, so removePanel's map
 * does not churn identities for every survivor on every close — TerminalPanel
 * is memo'd on its rect and z rather than on the panel object, so this is
 * economy rather than correctness, but a fresh object for every panel on every
 * close is a pointless allocation on a path that already does real work.
 */
export function pruneLinksTo(panel: Panel, id: string): Panel {
  const links = linksOf(panel)
  if (!links.some((l) => l.to === id)) return panel
  const kept = links.filter((l) => l.to !== id)
  // The key is DELETED rather than set to an empty array when nothing is left,
  // so a panel that never had links and a panel whose last link was pruned
  // serialise identically. Otherwise closing a panel rewrites `links: []` onto
  // every survivor in layout.json, which is noise in a file people read.
  const { links: _drop, ...rest } = panel
  return (kept.length === 0 ? rest : { ...rest, links: kept }) as Panel
}

/** Replace one panel, by id, with the result of `f`. */
function mapPanel(panels: Panel[], id: string, f: (p: Panel) => Panel): Panel[] {
  return panels.map((p) => (p.rect.id === id ? f(p) : p))
}

/**
 * Add `from -> to`, refusing a self-link and refusing a duplicate.
 *
 * A self-link is a segment with no direction: linkAnchors answers null for
 * coincident centres, so it would persist forever as a link that renders
 * nothing — indistinguishable from a broken feature. A duplicate paints two
 * identical overlapping paths, which is cascadeCentre's indistinguishability
 * argument through a different door: the canvas looks like it holds one link
 * while holding two, and removing "the" link leaves one behind.
 *
 * `to -> from` alongside `from -> to` IS allowed. They are different claims,
 * and a fix for the duplicate case that collapsed them would be over-
 * correcting into "one link per pair". verify:viewport 79.
 */
export function addLink(panels: Panel[], from: string, to: string): Panel[] {
  if (from === to) return panels
  const source = panels.find((p) => p.rect.id === from)
  if (!source || !panels.some((p) => p.rect.id === to)) return panels
  if (linksOf(source).some((l) => l.to === to)) return panels
  return mapPanel(panels, from, (p) => ({ ...p, links: [...linksOf(p), { to }] }))
}

export function removeLink(panels: Panel[], from: string, to: string): Panel[] {
  return mapPanel(panels, from, (p) => pruneLinksTo(p, to))
}

/**
 * Set one link's label. An empty string CLEARS it rather than storing '',
 * so the palette's input mode has a way to undo a label without a second verb
 * — and so an empty label cannot round-trip to disk as a field that renders as
 * a blank row the user cannot see or remove.
 */
export function setLinkLabel(panels: Panel[], from: string, to: string, label: string): Panel[] {
  return mapPanel(panels, from, (p) => ({
    ...p,
    links: linksOf(p).map((l) =>
      l.to === to ? (label === '' ? { to: l.to } : { to: l.to, label }) : l
    )
  }))
}
```

Finally rewrite `removePanel`:

```ts
/**
 * Drop the panel AND every link pointing at it.
 *
 * The incoming prune lives HERE rather than at the call sites, and that
 * placement is the whole of the dangling-link stance. Both callers are the two
 * branches of Canvas.tsx's onClosePanel, and both are already inside a
 * setPanels updater whose result goes straight to commitHistory — so the panel
 * and its links leave in ONE committed gesture, land in ONE history entry, and
 * one Cmd+Z brings back both (verify:panels 128). A prune written at the call
 * sites would be two places to get right, and the one that got missed would
 * leave a link pointing at nothing with no error anywhere.
 *
 * Outgoing links need nothing: they leave with the panel holding them.
 */
export function removePanel(panels: Panel[], id: string): Panel[] {
  return panels.filter((p) => p.rect.id !== id).map((p) => pruneLinksTo(p, id))
}
```

- [ ] **Step 4: Run the checks and watch them pass**

```bash
npm run verify:viewport
```

Expected: `82/82 passed`. Confirm the count rose from 78 to 82 — four new checks, none of them skipped by an abort.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/panels/panels.ts scripts/verify-viewport.cjs
git commit -m "feat(m13): PanelLink, the pure link mutators, and removePanel's incoming prune"
```

---

### Task 2: Link geometry

**Files:**
- Create: `src/renderer/canvas/link-geometry.ts`
- Modify: `scripts/viewport-entry.cjs`
- Modify: `scripts/verify-viewport.cjs` (append checks 83–88)

**Interfaces:**
- Consumes: `linksOf`, `PanelLink`, `Panel` from Task 1; `WorldRect` from `viewport.ts`.
- Produces:
  - `interface LinkSegment { key: string; from: string; to: string; label?: string; x1: number; y1: number; x2: number; y2: number }`
  - `linkAnchors(from: WorldRect, to: WorldRect): { x1; y1; x2; y2 } | null`
  - `buildLinkSegments(panels: Panel[]): LinkSegment[]`

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-viewport.cjs`, before the summary block:

```js
// 83. The anchors sit on the two rects' BORDERS, not their centres. A line
//     drawn to a centre disappears under the panel it points at, so the
//     arrowhead — the only thing carrying direction — would never be visible.
//     Asserted on a horizontal pair, where the answer is exact and a check
//     cannot pass by being approximately right.
{
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 }
  const b = { id: 'b', x: 300, y: 0, w: 100, h: 100 }
  const s = V.linkAnchors(a, b)
  ok('83 linkAnchors lands on both borders, not the centres',
    s !== null && near(s.x1, 100) && near(s.y1, 50) && near(s.x2, 300) && near(s.y2, 50))
}

// 84. THE ONE WORTH KNOWING BY NUMBER, and the only check that separates a ray
//     CLIP from a per-axis CLAMP. This is edgeIndicator's documented mistake
//     one file over, and it fails the same silent way: clamping dx to the
//     half-width and dy to the half-height independently sends every diagonal
//     to a corner, so every link leaves and enters a panel at the same four
//     points regardless of the true bearing — and still renders, and still
//     looks like a working feature.
//
//     The fixture is deliberately a SHALLOW diagonal (dx 400, dy 100) on a
//     SQUARE rect: the x crossing binds, so the correct answer is on the right
//     EDGE at a y strictly between the centre and the corner, while the clamp
//     shorthand puts it exactly on the corner. A 45-degree fixture could not
//     tell them apart — both answers are the corner there — which is why the
//     angles are unequal.
{
  const a = { id: 'a', x: -50, y: -50, w: 100, h: 100 }
  const b = { id: 'b', x: 350, y: 50, w: 100, h: 100 }
  const s = V.linkAnchors(a, b)
  // centre a = (0,0), centre b = (400,100). t binds on x at 50/400.
  const expectedY = 100 * (50 / 400)
  ok('84 linkAnchors CLIPS the ray rather than clamping the two axes',
    s !== null && near(s.x1, 50) && near(s.y1, expectedY) &&
    // the clamp shorthand would answer the corner, y = 50
    Math.abs(s.y1 - 50) > 1)
}

// 85. Coincident centres answer null. There is no direction to draw, and
//     normalising a zero-length vector is how a NaN gets into a transform and
//     takes the whole layer's paint with it — every link gone, not just this
//     one, with nothing thrown.
{
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 }
  const b = { id: 'b', x: 0, y: 0, w: 60, h: 60 }
  ok('85 coincident centres answer null rather than a NaN segment',
    V.linkAnchors(a, b) === null && V.linkAnchors(a, a) === null)
}

// 86. buildLinkSegments flattens the adjacency into drawables, carrying the
//     label through. The key must be stable and must distinguish DIRECTION,
//     or a->b and b->a collide as one React key and one of the two silently
//     stops rendering.
{
  const mk = (id, x, links) => ({ kind: 'terminal', rect: { id, x, y: 0, w: 100, h: 100 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', 0, [{ to: 'b', label: 'feeds' }]), mk('b', 300, [{ to: 'a' }])]
  const segs = V.buildLinkSegments(panels)
  ok('86 buildLinkSegments carries the label and keys both directions apart',
    segs.length === 2 &&
    segs.find((s) => s.from === 'a').label === 'feeds' &&
    segs.find((s) => s.from === 'b').label === undefined &&
    new Set(segs.map((s) => s.key)).size === 2)
}

// 87. A link whose target is not in the panel array is DROPPED, and its
//     neighbour still renders. This is the second, deliberately redundant
//     prune — removePanel is the first — and it covers a state removePanel
//     cannot see: PanelId is global across workspaces (see CLAUDE.md, "Panel
//     ids are global, not per-workspace"), so a link naming a panel that lives
//     in a DIFFERENT workspace resolves to nothing on this canvas and must
//     render nothing rather than throw. A hand-edited file reaches the same
//     state. The surviving-neighbour clause is what stops a fix from dropping
//     the whole source panel's links on one bad target.
{
  const mk = (id, x, links) => ({ kind: 'terminal', rect: { id, x, y: 0, w: 100, h: 100 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', 0, [{ to: 'gone' }, { to: 'b' }]), mk('b', 300)]
  const segs = V.buildLinkSegments(panels)
  ok('87 a link to an absent panel is dropped and its neighbour survives',
    segs.length === 1 && segs[0].from === 'a' && segs[0].to === 'b')
}

// 88. A review node is an ordinary endpoint, in both directions. links sits on
//     PanelBase rather than on the terminal arm, so nothing here needed a kind
//     check — which is the property being pinned. A later "optimisation" that
//     filtered the panel list by kind before flattening would silently delete
//     every link touching a review node, on a canvas where linking a node to a
//     second agent's panel is exactly what the feature is for.
{
  const term = { kind: 'terminal', rect: { id: 'n1', x: 0, y: 0, w: 100, h: 100 }, spec: { panelId: 'n1', cwd: '~', args: [] }, z: 1, links: [{ to: 'r1' }] }
  const node = { kind: 'review', rect: { id: 'r1', x: 300, y: 0, w: 100, h: 100 }, z: 2, links: [{ to: 'n1' }], subject: { subjectId: 'n1', repoRoot: '/r', baselineSha: 'abc', label: 'claude' } }
  const segs = V.buildLinkSegments([term, node])
  ok('88 a review node is an ordinary link endpoint in both directions',
    segs.length === 2 && segs.some((s) => s.to === 'r1') && segs.some((s) => s.from === 'r1'))
}
```

- [ ] **Step 2: Run and watch fail**

```bash
npm run verify:viewport
```

Expected: aborts at 83 with `V.linkAnchors is not a function`; 84–88 never run. Note that, so their RED is confirmed separately at Step 4 by the count reaching 88.

- [ ] **Step 3: Implement**

Create `src/renderer/canvas/link-geometry.ts`:

```ts
import type { WorldRect } from './viewport'
import { linksOf, type Panel } from '@renderer/panels/panels'

/**
 * The pure half of M13. No DOM, no React, no native dependency — it joins the
 * plain-node verify:viewport bundle beside viewport.ts and lod.ts, the same
 * placement nav-grid.ts and rail-rows.ts earned. The gesture is the risky half
 * of this milestone and the arithmetic is not; keeping them in separate files
 * is what lets the arithmetic be checked in seconds.
 */

export interface LinkSegment {
  /**
   * React key. It carries BOTH ids and their order: a->b and b->a are
   * different claims and are both allowed (see addLink), so a key built from
   * an unordered pair would collide and one of the two would silently stop
   * rendering.
   */
  key: string
  from: string
  to: string
  label?: string
  x1: number
  y1: number
  x2: number
  y2: number
}

const centre = (r: WorldRect): { x: number; y: number } => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2
})

/**
 * Where the segment between two panels starts and ends: on each rect's
 * BORDER, along the centre-to-centre ray.
 *
 * Borders rather than centres because a line drawn to a centre disappears
 * under the panel it points at, and the arrowhead is the only thing carrying
 * direction.
 *
 * It CLIPS THE RAY; it does not clamp the two axes independently. That
 * shorthand — clamp dx to the half-width, clamp dy to the half-height — is
 * edgeIndicator's documented mistake one file over, and it fails the same
 * silent way: every diagonal corners, so links leave and enter panels at the
 * same four points regardless of true bearing, while still rendering and still
 * looking like a working feature. Taking the SMALLER of the two per-axis
 * parametric crossings and scaling the whole ray by that one t is what keeps
 * the exit point on the true bearing. verify:viewport 84.
 *
 * null for coincident centres: there is no direction to draw, and normalising
 * a zero-length vector is how a NaN reaches a transform and takes the whole
 * layer's paint with it — every link gone, not only this one, with nothing
 * thrown.
 */
export function linkAnchors(
  from: WorldRect,
  to: WorldRect
): { x1: number; y1: number; x2: number; y2: number } | null {
  const a = centre(from)
  const b = centre(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return null

  // Scale the ray by the smaller crossing so the exit stays on the bearing.
  // Infinity for a zero component is correct and deliberate: that axis is
  // never the binding one, and Math.min picks the other.
  const exit = (r: WorldRect, ox: number, oy: number): { x: number; y: number } => {
    const tx = ox === 0 ? Infinity : r.w / 2 / Math.abs(ox)
    const ty = oy === 0 ? Infinity : r.h / 2 / Math.abs(oy)
    const t = Math.min(tx, ty)
    return { x: ox * t, y: oy * t }
  }
  const out = exit(from, dx, dy)
  const back = exit(to, -dx, -dy)
  return { x1: a.x + out.x, y1: a.y + out.y, x2: b.x + back.x, y2: b.y + back.y }
}

/**
 * Every drawable link on this canvas, flattened out of the adjacency.
 *
 * A link whose target is not in `panels` is DROPPED. That is a second prune —
 * removePanel is the first — and the redundancy is deliberate, because this
 * one covers a state removePanel cannot see: PanelId is global across
 * workspaces, so a link naming a panel in a DIFFERENT workspace resolves to
 * nothing on this canvas, and a hand-edited file reaches the same place. It
 * must render nothing rather than throw. verify:viewport 87.
 */
export function buildLinkSegments(panels: Panel[]): LinkSegment[] {
  const byId = new Map(panels.map((p) => [p.rect.id, p.rect]))
  const out: LinkSegment[] = []
  for (const panel of panels) {
    const from = panel.rect
    for (const link of linksOf(panel)) {
      const to = byId.get(link.to)
      if (!to) continue
      const anchors = linkAnchors(from, to)
      if (!anchors) continue
      out.push({
        key: `${from.id} ${link.to}`,
        from: from.id,
        to: link.to,
        ...(link.label === undefined ? {} : { label: link.label }),
        ...anchors
      })
    }
  }
  return out
}
```

Add to `scripts/viewport-entry.cjs`, after the `panels` line:

```js
  /* M13: the link geometry. Pure, type-only imports beyond panels.ts, so it
     belongs in the cheapest tier beside viewport.ts and lod.ts. */
  ...require('../src/renderer/canvas/link-geometry'),
```

Note `link-geometry.ts` imports `@renderer/panels/panels` as a **value** (`linksOf`), so `scripts/verify-viewport.cjs`'s esbuild `alias` block needs `@renderer` added beside the existing `@shared`:

```js
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    // link-geometry.ts imports linksOf — a real VALUE — from @renderer/panels.
    // The bundle resolved only @shared until M13 for the reason recorded there:
    // every other cross-boundary import in this bundle is `import type`, which
    // esbuild erases before it ever resolves anything.
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
```

- [ ] **Step 4: Run and watch pass**

```bash
npm run verify:viewport
```

Expected: `88/88 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/link-geometry.ts scripts/viewport-entry.cjs scripts/verify-viewport.cjs
git commit -m "feat(m13): link geometry — a clipped ray between two panel borders"
```

---

### Task 3: Persistence

**Files:**
- Modify: `src/shared/layout-schema.ts`
- Modify: `src/renderer/panels/layout-adapt.ts`
- Modify: `scripts/verify-layout.cjs` (append checks 109–113)

**Interfaces:**
- Consumes: `PanelLink` (Task 1), `linksOf` (Task 1).
- Produces: `PersistedPanelBase.links?: PanelLink[]`; `parseLinks(raw, id, warnings)`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, before its summary block. Match the file's existing `ok(...)` helper signature — read the two checks above the insertion point and copy their call shape exactly.

```js
// 109. ABSENT is none, and that is the compatibility clause: every
//      layout.json ever written has no links key, so a reader that warned
//      about the absence would warn once per panel on every existing file.
//      A PRESENT but malformed links warns rather than vanishing silently —
//      the line parsePresets (41) and parseBaselines (99) already draw.
{
  const bare = parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'C', panels: [
    { id: 'a', x: 0, y: 0, w: 700, h: 400, z: 1, cwd: '~', args: [] }
  ] }] }))
  const bad = parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'C', panels: [
    { id: 'a', x: 0, y: 0, w: 700, h: 400, z: 1, cwd: '~', args: [], links: 'nope' }
  ] }] }))
  const p = (r) => r.snapshot.workspaces[0].panels[0]
  ok('109 an absent links key warns nothing; a malformed one warns',
    p(bare).links === undefined && bare.warnings.length === 0 &&
    p(bad).links === undefined && bad.warnings.some((w) => /link/i.test(w)))
}

// 110. A malformed ENTRY is dropped individually and its neighbours survive —
//      the per-entry tolerance parseLayout gives a malformed panel (100). One
//      bad link costs that link, not the panel's whole set.
{
  const r = parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'C', panels: [
    { id: 'a', x: 0, y: 0, w: 700, h: 400, z: 1, cwd: '~', args: [],
      links: [{ to: 'b' }, { to: 42 }, { to: 'c', label: 'feeds' }, 'nope'] },
    { id: 'b', x: 0, y: 0, w: 700, h: 400, z: 2, cwd: '~', args: [] },
    { id: 'c', x: 0, y: 0, w: 700, h: 400, z: 3, cwd: '~', args: [] }
  ] }] }))
  const links = r.snapshot.workspaces[0].panels[0].links
  ok('110 a malformed link entry is dropped alone',
    links.length === 2 && links[0].to === 'b' &&
    links[1].to === 'c' && links[1].label === 'feeds')
}

// 111. THE ONE WORTH KNOWING BY NUMBER. A link naming a panel that did not
//      SURVIVE validation is dropped, and parseWorkspace is the only place
//      that can do it — it is the only scope that knows the whole surviving
//      set. It already builds `seen` for exactly this purpose (selectedId and
//      focusedId are filtered through it), so this is a second pass over a set
//      that already exists rather than new bookkeeping.
//
//      This is the on-disk half of the dangling-link stance; removePanel is
//      the in-memory half, and a canvas needs BOTH because a file can be
//      hand-edited between launches. The surviving-link clause is the
//      over-correction guard: dropping every link because one target was bad
//      empties the canvas silently.
{
  const r = parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'C', panels: [
    { id: 'a', x: 0, y: 0, w: 700, h: 400, z: 1, cwd: '~', args: [],
      links: [{ to: 'b' }, { to: 'ghost' }] },
    { id: 'b', x: 0, y: 0, w: 700, h: 400, z: 2, cwd: '~', args: [] },
    { id: 'ghost', x: 0, y: 0, w: 700, h: 400, z: 3, args: [] }
  ] }] }))
  const ws = r.snapshot.workspaces[0]
  ok('111 a link to a panel that did not survive validation is dropped',
    ws.panels.length === 2 &&
    ws.panels[0].links.length === 1 && ws.panels[0].links[0].to === 'b')
}

// 112. Links survive a write and a reopen through the real coalesced store,
//      with the label intact — the round trip 101 gives a baseline.
//      (Follow the store-construction shape of check 101 exactly; copy its
//      tmpdir/flush/reopen sequence rather than inventing one.)

// 113. The union survives layout-adapt's fromPanels/toPanels round trip, which
//      is the OTHER door onto this format and the one a schema-only check
//      cannot see (108b's argument). Its absent-stays-ABSENT clause is the
//      half that carries weight: `links: undefined` is a different fact from
//      the key being missing, and an adapter that spread its input would write
//      an explicit undefined into every panel that has no links.
{
  const withLinks = [
    { kind: 'terminal', rect: { id: 'a', x: 1, y: 2, w: 700, h: 400 }, z: 1,
      spec: { panelId: 'a', cwd: '~', args: [] }, links: [{ to: 'b', label: 'feeds' }] },
    { kind: 'terminal', rect: { id: 'b', x: 3, y: 4, w: 700, h: 400 }, z: 2,
      spec: { panelId: 'b', cwd: '~', args: [] } }
  ]
  const back = toPanels(fromPanels(withLinks))
  ok('113 links round-trip through layout-adapt, and absence stays absent',
    back[0].links.length === 1 && back[0].links[0].label === 'feeds' &&
    !('links' in back[1]) &&
    !('links' in fromPanels(withLinks)[1]))
}
```

Write check 112's body by copying check 101's store construction verbatim and asserting a link survives; do not invent a different store setup.

- [ ] **Step 2: Run and watch fail**

```bash
npm run verify:layout
```

Expected: 109 FAILs (a bare `parseLayout` result has no `links`, and the malformed case produces no warning). Record which of 110–113 ran and which were prevented by any throw.

- [ ] **Step 3: Implement**

In `src/shared/layout-schema.ts`, add to `PersistedPanelBase` after `title`:

```ts
  /**
   * Outgoing links, M13. OPTIONAL, and absent means none — which is every
   * layout.json ever written, so a reader that treated absence as corruption
   * would warn once per panel on every existing file. A PRESENT but malformed
   * value warns and is replaced, the line parsePresets and parseBaselines
   * already draw: a silently vanished field is a user's work gone with nothing
   * said.
   */
  links?: { to: string; label?: string }[]
```

Add `parseLinks` beside `parseReviewSubject`:

```ts
/**
 * Entries are dropped INDIVIDUALLY, the per-entry tolerance parseLayout gives
 * a malformed panel: one bad link costs that link, not the panel's whole set.
 *
 * This does NOT check that `to` names a real panel — it cannot, because it
 * runs per panel and the surviving set is not known until every panel has
 * parsed. parseWorkspace does that second pass. verify:layout 111.
 */
function parseLinks(
  raw: unknown,
  id: string,
  warnings: string[]
): { to: string; label?: string }[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    warnings.push(`dropped panel ${id}'s links: not an array`)
    return undefined
  }
  const out: { to: string; label?: string }[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!isRecord(entry) || !isStr(entry.to) || !ID_PATTERN.test(entry.to)) {
      warnings.push(`dropped a link on panel ${id}: target was unusable`)
      continue
    }
    // A self-link and a duplicate are both refused at creation (addLink); a
    // hand-edited file is the other door onto them, and each renders nothing
    // or renders twice, so both are dropped here for the same reasons.
    if (entry.to === id || seen.has(entry.to)) {
      warnings.push(`dropped a link on panel ${id}: ${entry.to === id ? 'self' : 'duplicate'}`)
      continue
    }
    seen.add(entry.to)
    out.push({ to: entry.to, ...(isStr(entry.label) ? { label: entry.label } : {}) })
  }
  return out.length === 0 ? undefined : out
}
```

In `parsePanel`, add to `base` after the `title` spread:

```ts
    ...(() => {
      const links = parseLinks((raw as Record<string, unknown>).links, id, warnings)
      return links === undefined ? {} : { links }
    })()
```

In `parseWorkspace`, after `panels` is built and before the `pick` helper:

```ts
  // The second pass, and the only place it can happen: a link naming a panel
  // that did not SURVIVE validation has to be dropped, and only this scope
  // knows the whole surviving set. `seen` is already built for exactly this
  // shape of question — selectedId and focusedId are filtered through it — so
  // this reuses it rather than adding bookkeeping.
  //
  // This is the on-disk half of the dangling-link stance. removePanel is the
  // in-memory half, and a canvas needs both, because a file can be hand-edited
  // between two launches. verify:layout 111.
  for (const panel of panels) {
    if (panel.links === undefined) continue
    const kept = panel.links.filter((l) => seen.has(l.to))
    if (kept.length === panel.links.length) continue
    warnings.push(`dropped ${panel.links.length - kept.length} link(s) on panel ${panel.id}: no such panel`)
    if (kept.length === 0) delete panel.links
    else panel.links = kept
  }
```

In `src/renderer/panels/layout-adapt.ts`, add to `toPanels`' `base`:

```ts
      // Absent stays absent, the rule `title` and `command` already obey here.
      ...(p.links === undefined ? {} : { links: p.links.map((l) => ({ ...l })) })
```

and the mirror in `fromPanels`' `base`:

```ts
      ...(panel.links === undefined ? {} : { links: panel.links.map((l) => ({ ...l })) })
```

- [ ] **Step 4: Run and watch pass**

```bash
npm run verify:layout
```

Expected: `117/117 passed` (112 before, plus 109–113).

- [ ] **Step 5: Commit**

```bash
git add src/shared/layout-schema.ts src/renderer/panels/layout-adapt.ts scripts/verify-layout.cjs
git commit -m "feat(m13): persist links, dropping dangling ones at parse"
```

---

### Task 4: The inspector's Links rows

**Files:**
- Modify: `src/renderer/shell/inspector-fields.ts`
- Modify: `scripts/verify-rail.cjs` (append checks 72–75)

**Interfaces:**
- Consumes: `linksOf`, `PanelLink` (Task 1).
- Produces:
  - `interface InspectorLinkRow { to: string; direction: 'out' | 'in'; label?: string; title: string }`
  - `buildLinkRows(panel: Panel, panels: Panel[]): InspectorLinkRow[]`
  - `InspectorModel.links: InspectorLinkRow[]`
  - `buildInspectorModel(panel, status, live?, panels?)` — a fourth **optional** parameter

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-rail.cjs` before its summary block, matching its existing `ok(...)` shape:

```js
// 72. Both directions, and they are DISTINGUISHED. A pane that listed only
//     outgoing links answers "what does this feed" and leaves "what feeds
//     this" unanswerable from the panel that is selected — the user would have
//     to select every other panel in turn to find out. The direction field is
//     what lets the view render an arrow that points the right way; collapsing
//     it renders every link as though this panel were the source.
{
  const mk = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', [{ to: 'b' }]), mk('b'), mk('c', [{ to: 'a', label: 'feeds' }])]
  const rows = R.buildLinkRows(panels[0], panels)
  ok('72 buildLinkRows reports both directions and keeps them apart',
    rows.length === 2 &&
    rows.filter((r) => r.direction === 'out').length === 1 &&
    rows.filter((r) => r.direction === 'in').length === 1 &&
    rows.find((r) => r.direction === 'in').label === 'feeds')
}

// 73. A row NAMES the other panel by the honest chain, not by its id. `n7`
//     tells the user nothing, and this is the fourth reader of that chain
//     (the panel header, railLabel and the attention section are the others)
//     — so the fixture is a TITLED panel, which is the only fixture that can
//     tell a re-derivation from `spec.command` apart from a real read: the
//     wrong implementation says `/bin/zsh` here while the Panels row three
//     lines up says `auth refactor`. rail-sections.ts 35's argument, at a
//     second surface.
{
  const mk = (id, extra) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', command: '/bin/zsh', args: [] }, z: 1, ...extra })
  const panels = [mk('a', { links: [{ to: 'b' }] }), mk('b', { title: 'auth refactor' })]
  const rows = R.buildLinkRows(panels[0], panels)
  ok('73 a link row names the other panel by its title, not its id',
    rows.length === 1 && rows[0].title === 'auth refactor')
}

// 74. A link whose other end is not on this canvas contributes NO row —
//     buildLinkSegments' prune, at the pane. It is reachable the same two
//     ways: a hand-edited file, and a link naming a panel in another
//     workspace, since PanelId is global. A row for a panel the user cannot
//     select is a dead entry whose remove control is the only thing that
//     works, and it would read as a bug in the pane rather than in the file.
{
  const mk = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', [{ to: 'ghost' }, { to: 'b' }]), mk('b')]
  const rows = R.buildLinkRows(panels[0], panels)
  ok('74 a link whose other end is not on this canvas renders no row',
    rows.length === 1 && rows[0].to === 'b')
}

// 75. THE ONE WORTH KNOWING BY NUMBER, and it is the check that stops the pane
//     freezing. Canvas freezes the inspector model on inspectorSignature, so a
//     value the signature does not cover renders once and then never updates
//     again — stuck at whatever it was when the panel was selected, with
//     nothing throwing. Adding, removing AND relabelling are asserted as three
//     separate movers, because an implementation that hashed only the link
//     COUNT passes the first two and freezes on the third.
//
//     Its first clause is the non-vacuity guard: the fourth parameter is
//     OPTIONAL (every pre-M13 caller and check must keep its exact meaning —
//     the trade `live` already made in M12), so a model built without it must
//     carry an EMPTY links array rather than undefined, or every clause below
//     compares undefined to undefined and passes against a model that has no
//     links field at all.
{
  const mk = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const noArg = R.buildInspectorModel(mk('a'), undefined)
  const sig = (panels) => R.inspectorSignature(R.buildInspectorModel(panels[0], undefined, undefined, panels))
  const none = sig([mk('a'), mk('b')])
  const one = sig([mk('a', [{ to: 'b' }]), mk('b')])
  const labelled = sig([mk('a', [{ to: 'b', label: 'feeds' }]), mk('b')])
  ok('75 inspectorSignature moves on a link added, removed and relabelled',
    Array.isArray(noArg.links) && noArg.links.length === 0 &&
    none !== one && one !== labelled && none !== labelled)
}
```

(`R` is this suite's existing bundle handle — use whatever identifier `verify-rail.cjs` already binds.)

- [ ] **Step 2: Run and watch fail**

```bash
npm run verify:rail
```

Expected: aborts at 72 with `R.buildLinkRows is not a function`. Note 73–75 did not run.

- [ ] **Step 3: Implement**

In `src/renderer/shell/inspector-fields.ts`, add near `ReviewFieldRow`:

```ts
export interface InspectorLinkRow {
  /** The panel at the OTHER end, whichever direction this link runs. */
  to: string
  /** 'out' is this panel -> other; 'in' is other -> this panel. */
  direction: 'out' | 'in'
  label?: string
  /** The other panel's name, by the honest chain. Never its bare id. */
  title: string
}

/**
 * Every link touching this panel, in both directions.
 *
 * BOTH directions, because a pane listing only outgoing links answers "what
 * does this feed" and leaves "what feeds this" answerable only by selecting
 * every other panel in turn. The direction is a FIELD rather than baked into
 * the title, so the view composes the arrow — the rule Command.waiting and
 * RailRow.waiting already keep.
 *
 * A link whose other end is not in `panels` contributes NO row, which is
 * buildLinkSegments' prune at the pane and is reachable the same two ways: a
 * hand-edited file, and a link naming a panel in another workspace, since
 * PanelId is global. A row for a panel the user cannot select is a dead entry.
 *
 * The name comes from railLabel — the same honest chain the panel header, the
 * rail row and the attention section walk — so this is a fourth READER of it
 * and never a fourth re-derivation. verify:rail 73.
 */
export function buildLinkRows(panel: Panel, panels: Panel[]): InspectorLinkRow[] {
  const byId = new Map(panels.map((p) => [p.rect.id, p]))
  const id = panel.rect.id
  const rows: InspectorLinkRow[] = []
  const row = (
    other: Panel | undefined,
    to: string,
    direction: 'out' | 'in',
    label?: string
  ): void => {
    if (!other) return
    rows.push({ to, direction, ...(label === undefined ? {} : { label }), title: railLabel(other, undefined) })
  }
  for (const link of linksOf(panel)) row(byId.get(link.to), link.to, 'out', link.label)
  for (const source of panels) {
    if (source.rect.id === id) continue
    for (const link of linksOf(source)) {
      if (link.to === id) row(source, source.rect.id, 'in', link.label)
    }
  }
  return rows
}
```

Add `links: InspectorLinkRow[]` to `InspectorModel` (**required**, not optional — an optional field lets a half-finished wiring compile with an always-empty section and `tsc` says nothing, the reason `restartable` is required), give `buildInspectorModel` a fourth optional parameter, and set the field on **both** arms:

```ts
export function buildInspectorModel(
  panel: Panel,
  status: PanelStatus | undefined,
  live?: LiveSession | undefined,
  /**
   * Every panel on this canvas, so the link rows can name the other end and
   * drop a link whose other end is not here. OPTIONAL and defaulted to an
   * empty list, so every pre-M13 caller and every pre-M13 check keeps its
   * exact meaning — the same trade `live` made in M12 and review-engine.ts's
   * `notARepo` made in M9a. An EMPTY array rather than undefined, so the
   * section has one shape everywhere and no reader needs a `?? []`.
   */
  panels?: Panel[]
): InspectorModel {
  const links = buildLinkRows(panel, panels ?? [])
  // ... both the review arm and the terminal arm set `links,`
```

`inspectorSignature` is `JSON.stringify(model)`, so it covers the new field with no edit — but confirm check 75 passes rather than assuming it.

- [ ] **Step 4: Run and watch pass**

```bash
npm run verify:rail
```

Expected: `79/79 passed` (75 before, plus 72–75).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/inspector-fields.ts scripts/verify-rail.cjs
git commit -m "feat(m13): the inspector's link rows, in both directions"
```

---

### Task 5: The link layer

**Files:**
- Create: `src/renderer/canvas/LinkLayer.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/canvas/Canvas.tsx` (mount it inside `.world`)

**Interfaces:**
- Consumes: `buildLinkSegments`, `LinkSegment` (Task 2).
- Produces: `<LinkLayer panels={panels} />`, rendering `svg.link-layer` with one `path[data-link]` per segment, keyed `from\0to`.

- [ ] **Step 1: Write the component**

Create `src/renderer/canvas/LinkLayer.tsx`:

```tsx
import { memo, useMemo } from 'react'
import { buildLinkSegments } from './link-geometry'
import type { Panel } from '@renderer/panels/panels'

/**
 * Every link on the canvas, as one SVG inside `.world`.
 *
 * INSIDE `.world`, so it inherits the single translate()/scale() and pans,
 * zooms and clips with the panels for free — the exact opposite of
 * EdgeIndicators, which is a SIBLING of `.world` precisely because a
 * viewport-pinned pip must not zoom away.
 *
 * BENEATH the panels, at z-index 0, and that IS Panel.z's scheme rather than a
 * second one: nextZ returns max(..., 0) + 1, so every panel this app mints has
 * z >= 1 and sits above. Below is also right on its own merits — a line
 * painted over a terminal obscures the agent output the app exists to show —
 * and costs nothing, because linkAnchors puts both endpoints ON the panel
 * borders, so the whole segment including the arrowhead is outside both rects.
 * (A hand-edited layout.json with a negative z would paint that panel under
 * this layer. parsePanel accepts any finite z and clamping it would change
 * existing files for a case no gesture can produce; left alone deliberately.)
 *
 * pointer-events: none on the layer and everything in it, which is a property
 * of the layer rather than a hit-test anyone has to remember. A link cannot
 * swallow a click aimed at a panel, cannot swallow the background click that
 * clears focusedId (which would pin a panel live and hold a WebGL context for
 * the rest of the run), and cannot interfere with the capture-phase palette
 * dismissal on .shell. It is also why this milestone adds nothing at all to
 * shouldYieldWheel.
 *
 * NOT culled: a link is an SVG path with no process, no WebGL context and no
 * budget slot, so the reason panels are culled does not apply. Nobody has
 * measured a canvas with two hundred links; if that is ever slow the fix is a
 * viewport intersection test here.
 */
function LinkLayerImpl({ panels }: { panels: Panel[] }): JSX.Element | null {
  // Rebuilt on every render of Canvas — which includes every frame of a drag,
  // correctly, because a link's endpoint is moving. That is the same cost
  // EdgeIndicators already pays. The memo is what stops a Canvas re-render
  // that moved no rect (a cursor move, a palette open) repainting anything.
  const segments = useMemo(() => buildLinkSegments(panels), [panels])
  if (segments.length === 0) return null
  return (
    <svg className="link-layer" aria-hidden="true" overflow="visible">
      <defs>
        <marker
          id="link-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="link-layer__head" />
        </marker>
      </defs>
      {segments.map((s) => (
        <g key={s.key}>
          <line
            className="link-layer__line"
            data-link={s.key}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            markerEnd="url(#link-arrow)"
          />
          {s.label !== undefined && (
            <text
              className="link-layer__label"
              x={(s.x1 + s.x2) / 2}
              y={(s.y1 + s.y2) / 2}
              textAnchor="middle"
            >
              {s.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

export const LinkLayer = memo(LinkLayerImpl)
```

- [ ] **Step 2: Add the CSS**

Append to `src/renderer/styles.css`, near the other canvas layers. **Every value is a token** — `verify:styles` 1 fails on any hardcoded colour outside a theme block, and 3 on a fractional `opacity`:

```css
/* M13. Inside .world (so it pans and zooms with the panels) and beneath them
   at z-index 0 — nextZ mints z >= 1 for every panel. Deaf to the pointer as a
   property of the layer, so a link can never swallow a click meant for a panel
   or for the background. */
.link-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  overflow: visible;
}
.link-layer__line {
  stroke: var(--line-strong);
  stroke-width: 2px;
  fill: none;
}
.link-layer__head { fill: var(--line-strong); }
.link-layer__label {
  fill: var(--fg-3);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 4px;
}
```

- [ ] **Step 3: Mount it**

In `Canvas.tsx`, add the import and render `<LinkLayer panels={panels} />` as the **first** child of `div.world`, above the `panels.map(...)`:

```tsx
        <div
          className="world"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
        >
          {/* First child and z-index 0: beneath every panel. See LinkLayer. */}
          <LinkLayer panels={panels} />
          {panels.map((panel) => {
```

- [ ] **Step 4: Verify it builds and nothing regressed**

```bash
npm run typecheck && npm run verify:styles && npm run build
```

Expected: typecheck clean, `verify:styles` still `19/19`, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/LinkLayer.tsx src/renderer/styles.css src/renderer/canvas/Canvas.tsx
git commit -m "feat(m13): the link layer — one SVG in .world, beneath the panels, deaf to the pointer"
```

---

### Task 6: The one-shot armed mode

**Files:**
- Create: `src/renderer/canvas/useLinkMode.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `addLink` (Task 1), `hitTest` (`viewport.ts`), `commitHistory`/`setPanels` (existing).
- Produces: `useLinkMode(): { from: string | null; arm(id): void; disarm(): void; isArmed(): boolean }`

- [ ] **Step 1: Write the hook**

Create `src/renderer/canvas/useLinkMode.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The one-shot armed state behind "link this panel to…".
 *
 * ONE-SHOT is the safety property, not a simplification: the first mousedown
 * anywhere on the canvas resolves it either way, so unlike a persistent mode
 * (backlog #21's broadcast input, whose whole warning is about a mode you can
 * forget you are in) there is no state to be left in. That plus the banner is
 * success criterion 6.
 *
 * Escape cancels, and this is the ONE place M13 claims a bare key. The rule
 * everywhere else is that a bare keystroke must always reach the PTY, and
 * every exception is a modal surface that is visibly present: the palette
 * swallows every key while open, and useNavGrid claims bare Escape and bare
 * arrows while its overlay is up. An armed link mode is the same shape —
 * visible, one key, one shot.
 *
 * blur disarms too, for useNavGrid's reason: Cmd+Tab away and back must not
 * leave a canvas armed, because the banner is the only evidence and the user
 * has stopped looking at it.
 */
export interface LinkMode {
  /** The source panel id while armed; null otherwise. */
  from: string | null
  arm: (id: string) => void
  disarm: () => void
  /**
   * A ref read, not state — so it can sit in the dep arrays of the listeners
   * below without tearing them down on every arm and disarm. The same shape
   * usePalette's isOpen has, and for the same reason.
   */
  isArmed: () => boolean
}

export function useLinkMode(): LinkMode {
  const [from, setFrom] = useState<string | null>(null)
  const fromRef = useRef<string | null>(null)
  fromRef.current = from

  const disarm = useCallback(() => setFrom(null), [])
  const arm = useCallback((id: string) => setFrom(id), [])
  const isArmed = useCallback(() => fromRef.current !== null, [])

  useEffect(() => {
    if (from === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Stopped as well as handled: the canvas is armed, so this Escape is
      // ours and must not also reach the focused agent's PTY.
      event.preventDefault()
      event.stopPropagation()
      setFrom(null)
    }
    const onBlur = (): void => setFrom(null)
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('blur', onBlur)
    }
  }, [from])

  return { from, arm, disarm, isArmed }
}
```

- [ ] **Step 2: Wire the completing click in `Canvas.tsx`**

Add `const linkMode = useLinkMode()` beside the other controllers, and a capture-phase mousedown on the **canvas host**. Put it on the existing `div.canvas` as `onMouseDownCapture`:

```tsx
  /**
   * Resolves an armed link mode, and it MUST be capture phase.
   *
   * Every panel's own chrome handler stopPropagations its mousedown, so a
   * listener on the background onMouseDown never sees a click on a panel —
   * which is every click that can complete a link. Worse, letting the click
   * reach a panel's own handler reaches onSelectPanel, which clears the
   * dormant id and calls registry.wake: completing a link onto a dormant panel
   * would SPAWN AN AGENT, which is success criterion 2 failing and exactly the
   * accident the dormancy rule exists to prevent. Stopping the event here is
   * what makes the completing click do one thing and only one.
   *
   * It hit-tests the WORLD point rather than reading event.target, so a click
   * on a panel's chrome, its card and its terminal body all mean the same
   * thing — and it reuses hitOrder, arithmetic that is already pinned.
   */
  const onLinkModeMouseDownCapture = (event: MouseEvent<HTMLDivElement>): boolean => {
    const source = linkMode.from
    if (source === null) return false
    event.preventDefault()
    event.stopPropagation()
    linkMode.disarm()
    const world = toWorld(event)
    const hit = world ? hitTest(hitOrder, world) : null
    // A hit on the source, or on the background, cancels. addLink refuses a
    // self-link anyway; returning early here is what keeps the cancel silent
    // rather than a no-op that looks like a failed link.
    if (!hit || hit === source) return true
    setPanels((current) => {
      const next = addLink(current, source, hit)
      // addLink returns the SAME array when it refuses (a duplicate), so
      // committing unconditionally would push a history entry for a gesture
      // that changed nothing — one wasted Cmd+Z, and the rule is one entry per
      // committed gesture, not one per attempt.
      if (next !== current) commitHistory(next)
      return next
    })
    return true
  }
```

Call it first from the existing handler on `div.canvas`:

```tsx
        <div
          className="canvas"
          ref={hostRef}
          onMouseDownCapture={onLinkModeMouseDownCapture}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
        >
```

- [ ] **Step 3: Add the banner**

Render inside `div.canvas`, as a sibling of `NavGrid` (i.e. outside `.world`, so it is viewport-pinned chrome):

```tsx
        {linkMode.from !== null && (
          <div className="link-banner" role="status">
            Linking from <strong>{panelLabel(linkMode.from)}</strong> — click a panel, or press Escape
          </div>
        )}
```

Use whatever the file's existing panel-naming helper is called; if there is none in scope, use the panel's `title` with its id as the fallback rather than inventing a fifth reader of the honest chain.

CSS, tokens only:

```css
/* M13. Success criterion 6: an armed mode must never be invisible. Outside
   .world, so it is viewport-pinned chrome rather than something that pans
   away from the user while the mode it describes is still armed. */
.link-banner {
  position: absolute;
  top: var(--sp-5);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  padding: var(--sp-3) var(--sp-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-full);
  background: var(--s-3);
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  pointer-events: none;
}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run verify:styles && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/useLinkMode.ts src/renderer/canvas/Canvas.tsx src/renderer/styles.css
git commit -m "feat(m13): the one-shot link mode, resolved in the capture phase so it cannot wake a panel"
```

---

### Task 7: The inspector section and the palette row

**Files:**
- Modify: `src/renderer/shell/Inspector.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx` (three actions, and pass `panels` to `buildInspectorModel`)
- Modify: `src/renderer/palette/commands.ts`
- Modify: `src/renderer/styles.css`
- Modify: `scripts/verify-palette.cjs` (append checks 76–77)

**Interfaces:**
- Consumes: `InspectorLinkRow`, `buildLinkRows` (Task 4); `addLink`/`removeLink`/`setLinkLabel` (Task 1); `LinkMode` (Task 6).
- Produces: `PaletteActions.beginLink(id)`, `.removeLink(from, to)`, `.beginRelabelLink(from, to, current)`; the `panel.link` command row.

- [ ] **Step 1: Write the failing palette checks**

Append to `scripts/verify-palette.cjs`:

```js
// 76. panel.link is aimed at the CAPTURED panel, not the focused one — the
//     rule panel.rename, Restart and panel.review all obey, because opening
//     the palette moves DOM focus to its input and deliberately leaves
//     focusedId alone.
// 77. It is DISABLED with two DISTINCT reasons rather than absent: no captured
//     panel, and a canvas with nothing to link to. Those are two situations
//     with two different fixes ("click a panel" versus "make another panel"),
//     and collapsing them tells a user who HAS selected a panel to select a
//     panel. Both constants are compared as EXPORTED constants rather than as
//     string literals, which would keep passing while the text the user reads
//     said something else. verify:palette 66b's shape.
```

Write both bodies by copying the shape of the existing `panel.review` checks (67–68) in this file — same fixture builder, same `find((c) => c.id === ...)` lookup, same exported-constant comparison — substituting `panel.link` and the two new reason constants.

- [ ] **Step 2: Run and watch fail**

```bash
npm run verify:palette
```

Expected: both FAIL (`panel.link` is not in the list).

- [ ] **Step 3: Implement the palette row**

In `src/renderer/palette/commands.ts`, export the two reasons beside the existing ones and add the row in the same section as `panel.rename`:

```ts
export const REASON_NOTHING_TO_LINK = 'this canvas has only one panel'
```

Row, mirroring `panel.rename`'s construction **exactly** — this file builds
rows with `withReason(command, reason | undefined)` and the section field is
called `group`, not `section`. Push it beside `panel.restart`:

```ts
    out.push(
      withReason(
        {
          id: 'panel.link',
          title: 'Link this panel to…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          // `edge` is in the search text deliberately, and this is the ONE
          // place the word is allowed: it is backlog #24's own noun, so a user
          // who thinks "edge" still finds the row. It is user-facing search
          // text, never a symbol.
          searchText: 'link edge connect relate arrow',
          group: 'panel',
          run: () => actions.beginLink(ctx.capturedId!)
        },
        // TWO different blocked situations with two different fixes, the shape
        // panel.restart states one row up: "click a panel first" and "there is
        // nothing to link to". Collapsing them tells a user who HAS selected a
        // panel to select a panel.
        ctx.capturedId === null
          ? REASON_NO_FOCUS
          : (ctx.panels.length < 2 ? REASON_NOTHING_TO_LINK : undefined)
      )
    )
```

Confirm `searchText` is a field the `Command` type actually carries before
using it; if it is not, fold the word into the title's own searchable text the
way the neighbouring rows do rather than inventing a field.

`searchText` carries `edge` deliberately — the backlog's word, so a user who thinks "edge" still finds the row. That is the one place the word is allowed, and it is user-facing search text rather than a symbol.

- [ ] **Step 4: Implement the actions**

In `Canvas.tsx`'s `paletteActions`:

```ts
    beginLink: (id) => {
      linkMode.arm(id)
      // The palette must be gone: the completing gesture is a click on the
      // canvas, and runRow closes before running anyway — this is explicit so
      // the arming is not left behind an overlay the user then has to dismiss.
      palette.closePalette()
    },
    removeLink: (from, to) => {
      setPanels((current) => {
        const next = removeLink(current, from, to)
        commitHistory(next)
        return next
      })
    },
    beginRelabelLink: (from, to, current) => {
      setInputMode({
        kind: 'text',
        label: 'Label this link',
        initial: current,
        submit: (value) => {
          setPanels((panelsNow) => {
            const next = setLinkLabel(panelsNow, from, to, value.trim())
            commitHistory(next)
            return next
          })
          setInputMode(null)
        }
      })
      // The same reopen beginRenamePreset makes, for the same reason: the
      // overlay is closed BEFORE a row's command runs, so without this the
      // mode would be set on a palette that is already gone.
      palette.openPalette()
    },
```

Match `beginRenamePanel`'s exact `InputMode` shape rather than the sketch above if it differs.

Pass the panel list into the model — this is what makes the section non-empty:

```ts
  buildInspectorModel(selectedPanel, status, live, panels)
```

- [ ] **Step 5: Implement the section**

In `Inspector.tsx`'s `PanelBody`, after the `inspector__fields` list:

```tsx
      {model.links.length > 0 && (
        <div className="inspector__links" data-inspector-links>
          <div className="inspector__section-label">links</div>
          {model.links.map((link) => (
            <div className="inspector__link" key={`${link.direction}-${link.to}`} data-inspector-link={link.to}>
              <span className="inspector__link-dir" aria-hidden="true">
                {link.direction === 'out' ? '→' : '←'}
              </span>
              <span className="inspector__link-title">{link.title}</span>
              {link.label !== undefined && <span className="inspector__link-label">{link.label}</span>}
              <button
                type="button"
                className="inspector__link-action"
                title="Label this link"
                {...shellControl(() =>
                  onRelabelLink(
                    link.direction === 'out' ? model.id : link.to,
                    link.direction === 'out' ? link.to : model.id,
                    link.label ?? ''
                  )
                )}
              >
                ✎
              </button>
              <button
                type="button"
                className="inspector__link-action"
                title="Remove this link"
                {...shellControl(() =>
                  onRemoveLink(
                    link.direction === 'out' ? model.id : link.to,
                    link.direction === 'out' ? link.to : model.id
                  )
                )}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
```

The `direction === 'out' ? … : …` pair is load-bearing: a link is stored on its **source**, so an incoming row must address the *other* panel as `from`. Getting it backwards makes the remove control on an incoming row silently do nothing — the mutator would look for a link that panel does not hold.

Both controls use `shellControl`, so neither takes DOM focus — see `CLAUDE.md`'s "A shell control never takes DOM focus".

CSS uses tokens only, following `.inspector__field`'s existing rules.

- [ ] **Step 6: Verify**

```bash
npm run verify:palette && npm run verify:rail && npm run typecheck && npm run verify:styles && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/shell/Inspector.tsx src/renderer/canvas/Canvas.tsx src/renderer/palette/commands.ts src/renderer/styles.css scripts/verify-palette.cjs
git commit -m "feat(m13): the inspector's Links section and the palette's link row"
```

---

### Task 8: End-to-end checks

**Files:**
- Modify: `scripts/verify-panels.cjs` (append checks 125–129)

- [ ] **Step 1: Write the failing checks**

Append before the suite's summary. Follow the file's existing helpers (`zoomTo`, `clickRail`, `settle`, `waitUntil`, `executeJavaScript`) rather than inventing new ones.

```js
// 125. The link is created by the real gesture and rendered: arm through the
//      palette action, click the target, and a path carrying BOTH ids is in
//      the DOM. Asserted by the data-link key rather than by "an svg exists",
//      because an empty layer satisfies the latter.

// 126. THE ONE WORTH KNOWING BY NUMBER. The completing click must NOT WAKE the
//      target. A check that only asserts "a link appeared" passes against an
//      implementation that also spawned an agent — the completing click
//      reaching onSelectPanel is exactly the defect the capture-phase
//      interception exists to prevent, and on a restored canvas it is one
//      agent CLI per link the user draws.
//
//      It therefore needs a GENUINELY dormant target, which on this canvas
//      means the disk-append-and-reload route checks 39 and 84 already use —
//      a panel this renderer has never promoted. It asserts the panel is
//      still dormant AND that no new session appeared in __m4aSessions, in one
//      read: the dormancy flag alone passes against a wake that failed to
//      spawn for an unrelated reason (over budget, off screen), and the
//      session count alone passes against a wake on an already-spawned panel.

// 127. A click over a link still reaches the panel beneath it. This is
//      success criterion 5, and it is the only check that can see
//      pointer-events: none — the property is invisible to every DOM read
//      that does not actually dispatch a click through the layer. Drive it
//      with a REAL sendInputEvent rather than a dispatched MouseEvent, for
//      check 75c's reason: a synthetic event is untrusted and Blink runs no
//      default action for one, so a dispatched click proves nothing about
//      what the browser would have done on its own.

// 128. THE SECOND ONE WORTH KNOWING BY NUMBER. Closing the target removes the
//      link, and ONE Cmd+Z restores the panel AND the link together.
//
//      The one-press clause is the whole check. An implementation that pruned
//      the links in a SEPARATE commit satisfies "the link came back" after
//      two presses and looks entirely correct in every other read — and the
//      user's second press then undoes something else. So the assertion is a
//      single press restoring both, in one DOM read.

// 129. Links survive a real renderer reload, which is the persistence claim
//      end to end: it needs the field to have been written by fromPanels,
//      parsed by parsePanel, and survived parseWorkspace's second pass, none
//      of which a plain-node check can see together.
```

Write each body against the harness's existing idioms. For 126, copy check 84's `rail-dormant` fixture construction (append a panel to `layout.json` at a far world coordinate, then reload) rather than building a new one.

- [ ] **Step 2: Run and watch fail**

```bash
TC_VERIFY_SUFFIX=m13links npm run build && TC_VERIFY_SUFFIX=m13links npm run verify:panels
```

Watch each new check fail for the right reason before implementing anything, and note which were prevented from running by a throw.

- [ ] **Step 3: Fix whatever they surface**

Tasks 1–7 should already satisfy 125, 127, 128 and 129. Check 126 is the one most likely to be genuinely red — if it is, the capture-phase handler is running too late or is not stopping the event.

- [ ] **Step 4: Run the full suite**

```bash
TC_VERIFY_SUFFIX=m13links npm run verify
```

Expected: every suite green, `verify:panels` at `149/149`, `verify:ipc` still `1/1` over **31** channels.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-panels.cjs
git commit -m "test(m13): links end to end — created, not waking, click-through, undone together, restored"
```

---

### Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/ideas-backlog.md`

- [ ] **Step 1: `CLAUDE.md`**

Add to the verify table the new check ranges (`verify:viewport` 79–88, `verify:layout` 109–113, `verify:rail` 72–75, `verify:palette` 76–77, `verify:panels` 125–129), naming by number the ones this plan flags: viewport 80 and 84, layout 111, rail 75, panels 126 and 128.

Add to `## Load-bearing details`, in the file's established voice — each entry naming the *silent* failure that follows from undoing it:

- **"The code says `link`, and `edge` already means something else"**
- **"Links are adjacency on the source panel, and `History<Panel[]>` is why"**
- **"`removePanel` prunes incoming links, so a close and its links are one undo entry"**
- **"`linkAnchors` clips a ray, it does not clamp two axes"** — cross-reference the existing `edgeIndicator` entry, which states the same rule for the other feature
- **"The link layer is inside `.world`, beneath the panels, and deaf to the pointer"**
- **"The completing click is intercepted in the capture phase, or it wakes a panel"**

Also update the architecture diagram's note that M13 added **no** IPC channel, beside the existing M6d and M7 notes that reached the same boundary and declined it.

- [ ] **Step 2: `README.md`**

Add M13 to the milestone table. **Do not touch the IPC channel list** — this milestone adds none, and `verify:meta` 14 is checking that list against `ipc-contract.ts`.

- [ ] **Step 3: `docs/ideas-backlog.md`**

Per the file's own rule — "Where a milestone shipped most of an entry and deliberately left part of it, the entry stays but is **rewritten down to the part that is still open**, keeping the recorded constraint attached to the half that still has to survive it" — rewrite #24 down to the functional flavour and its open question, noting that the decorative half shipped in M13 and that the primitive is now available to #7. Do **not** delete #24 and do **not** renumber anything.

- [ ] **Step 4: Full verify**

```bash
TC_VERIFY_SUFFIX=m13links npm run verify
```

`verify:meta` is first in the chain and is what catches a README that drifted.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/ideas-backlog.md
git commit -m "docs(m13): record the link primitive and rewrite backlog #24 down to its functional half"
```

---

## Self-review

**Spec coverage.** Success criterion 1 → Tasks 3, 6, 8 (check 129). 2 → Task 6, check 126. 3 → Tasks 1, 8 (check 128). 4 → structural: links are never in the array `assignTiers` receives; asserted by 127's click-through and by the absence of any registry call in Tasks 5–7. 5 → Task 5's `pointer-events: none`, check 127. 6 → Task 6's banner plus one-shot resolution. 7 → Global Constraints, confirmed by `verify:ipc` in Task 8.

Spec sections all have tasks: naming (Global Constraints), data model (1), cascade delete (1), geometry (2), rendering (5), creating (6), deleting/labelling (7), persistence (3), verification (1–4, 7, 8), what it does not solve (9, backlog rewrite).

**Type consistency.** `linksOf`, `pruneLinksTo`, `addLink`, `removeLink`, `setLinkLabel`, `linkAnchors`, `buildLinkSegments`, `buildLinkRows` are spelled identically at every appearance. `PanelLink.to`/`.label` and `InspectorLinkRow.to`/`.direction`/`.label`/`.title` are consistent between Tasks 1, 4 and 7. `buildInspectorModel`'s fourth parameter is `panels?: Panel[]` in both Task 4 and Task 7.

**Known soft spots**, called out rather than hidden: Task 3's check 112 and Task 8's five bodies are specified by their *assertions and their reasons* but delegate their fixture construction to existing checks in the same file, because both harnesses have idioms (store construction; `waitUntil`/`sendInputEvent`) that are longer than the checks themselves and that a from-scratch rewrite would get subtly wrong. Each names the exact check to copy.
