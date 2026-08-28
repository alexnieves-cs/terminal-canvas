# M9b — The Panel Kind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Panel` stops meaning "a PTY behind an xterm" — a review node sits on the canvas beside its agent, renders real hunks in world space, survives a relaunch and its subject's closure, and takes no `LIVE_BUDGET` slot and no WebGL context.

**Architecture:** A discriminated union on `Panel.kind`, absent-on-disk meaning `'terminal'`. `Canvas.tsx` partitions the array by kind *before* tiering, so a review node is structurally incapable of reaching `assignTiers` or `registry.ensure`. The node queries main by its stored `{ repoRoot, baselineSha }` rather than by a panel id, which is what lets it outlive the subject whose baseline main drops on kill. M9a's engine grows three read-only members — an honest eighth arm, a baseline-addressed review, and a per-file diff — and three invoke channels carry them.

**Tech Stack:** TypeScript, Electron (three processes, one shared contract), React 18 without StrictMode, esbuild-bundled plain-node verify suites plus real-Electron ones. No new runtime dependency — the diff is `git diff` text parsed by a pure function.

**Spec:** `docs/superpowers/specs/2026-08-28-m9-review-layer-design.md` (the `# M9b — The panel kind` section, plus `## Success criteria` 4 and 5). Read it alongside this plan.

**Predecessor plan:** `docs/superpowers/plans/2026-08-28-m9a-review-engine.md` — M9a's engine, baselines and inspector section are consumed here and not re-explained.

## Global Constraints

- **`kind` is optional on disk and absent means `'terminal'`.** Every `layout.json` in existence predates it, and `parseLayout` drops malformed entries *individually* — so a required `kind` would silently delete every panel from every existing canvas on first launch. Same rule `title` already obeys.
- **A PRESENT but unknown `kind` is dropped with a warning**, never defaulted to terminal. Absent is a historical fact; `"kind": "tree"` is a file from a future version, and spawning a process for a node that never asked for one is the failure this milestone exists to make impossible.
- **Every runtime test is `kind === 'review'`.** Never `=== 'terminal'`, never `!== 'review'` as the *positive* branch. The default direction has to be terminal everywhere, including in verify fixtures that were written before this milestone and construct panels with no `kind` at all.
- **A review node never reaches `assignTiers`, `registry.ensure`, `registry.dispose` or `pty.kill`.** `pty.kill` keeps exactly two callers in `session-registry.ts` and `registry.dispose` keeps exactly five call sites in `Canvas.tsx` — `verify:panels` 94 reads both counts out of the source text and must stay green.
- **Ids come from the same global sequence, with a distinguishable prefix:** `r<N>` alongside `n<N>`, both minted from `nextIdRef`, which seeds from `allPanelIds` across *every* workspace. `PanelId` doubles as a tmux session name; a review node minting an id a terminal panel already owns is M7's invisible collision through a new door.
- **No new npm dependency, no syntax highlighting.** Added/removed/context colouring only — a tokenizer for N languages is a milestone of its own (the spec's own out-of-scope line).
- **`npm run verify` must be green at the end of every task**, including `npm run build`'s typecheck. The union changes a type every renderer surface consumes; a task that leaves `tsc` red is a task that is not done.
- Commits are conventional and scoped: `feat(m9b): …`, `fix(m9b): …`, `test(m9b): …`, `docs(m9b): …`.

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/renderer/review/review-node-model.ts` | Pure: `ReviewSubject` + `ReviewResult` + an expanded path in, a rendered node model out, plus its 60Hz signature. No React, no DOM — joins the plain-node tier. |
| `src/renderer/review/ReviewNode.tsx` | The view: one review node in world space. Chrome, file list, one expanded file's hunks, and the scroll host the wheel rule yields to. Owns nothing. |

**Modified:**

| Path | Change |
|---|---|
| `src/shared/review.ts` | `ReviewSubject`, `DiffLine`, `ReviewDiff`, `ReviewDiffRequest`; the eighth `ReviewResult` arm. |
| `src/shared/layout-schema.ts` | `PersistedPanel` becomes a union; `parsePanel` grows the review branch. |
| `src/shared/ipc-contract.ts` | Three invokes: `review:baseline`, `review:at`, `review:diff`. |
| `src/preload/index.ts` | The three bridge members. |
| `src/main/git-args.ts` | `buildFileDiffArgs` finally called; `buildNewFileDiffArgs`, `parseDiffLines`, the caps. |
| `src/main/git-runner.ts` | `GitResult` carries the exit `code` and `stderr`. |
| `src/main/review-engine.ts` | `resolveRepo` answers a union; `reviewAt`; `fileDiff`; `review()` delegates. |
| `src/main/baseline-capture.ts` | Records *why* a cwd produced no baseline, not merely that it did. |
| `src/main/index.ts` | Wires the two new engine deps and the three handlers' collaborators. |
| `src/main/ipc.ts` | The three handlers. |
| `src/renderer/panels/panels.ts` | The union, `makeReviewPanel`, `reviewCentre`, `isReviewPanel`. |
| `src/renderer/panels/layout-adapt.ts` | Both directions branch on kind. |
| `src/renderer/canvas/Canvas.tsx` | Partition, render, the wheel rule, `openReview`, id minting. |
| `src/renderer/shell/rail-rows.ts` | A review row's label and tail. |
| `src/renderer/shell/inspector-fields.ts` | A review node's own inspector model. |
| `src/renderer/shell/Inspector.tsx` | The Open review button; actions gated by kind. |
| `src/renderer/palette/commands.ts` | `openReview` on `PaletteActions`; the `panel.review` row. |
| `src/renderer/styles.css` | `.review-node` and its parts. |
| `scripts/rail-entry.cjs`, `scripts/panels-entry.cjs` | New exports the suites need. |
| `scripts/verify-{viewport,layout,review,rail,palette,panels}.cjs` | The new checks. |
| `README.md`, `CLAUDE.md` | The milestone row, the verify table, the load-bearing details. |

**Check numbering** (each suite's current last number, so nothing collides):

| Suite | Last today | This milestone adds |
|---|---|---|
| `verify:viewport` | 73 | 74–78 |
| `verify:layout` | 103 | 104–108 |
| `verify:review` | 37b | 38–48 |
| `verify:rail` | 45 | 46–56 |
| `verify:palette` | 66b | 67–69 |
| `verify:panels` | 101 | 102–111 |
| `verify:ipc` | 27 channels | 30 channels |

---

### Task 1: The union in `panels.ts`

**Files:**
- Modify: `src/shared/review.ts` (add `ReviewSubject`)
- Modify: `src/renderer/panels/panels.ts`
- Test: `scripts/verify-viewport.cjs` (checks 74–78; `panels.ts` is already in `viewport-entry.cjs`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ReviewSubject { subjectId: string; repoRoot: string; baselineSha: string; label: string }` (exported from `@shared/review`, re-exported as a type by `panels.ts`); `PanelBase`, `TerminalPanel`, `ReviewPanel`, `Panel = TerminalPanel | ReviewPanel`; `isReviewPanel(panel: Panel): panel is ReviewPanel`; `REVIEW_W = 640`, `REVIEW_H = 520`, `REVIEW_GAP = 40`; `makeReviewPanel(id: string, centre: Point, z: number, subject: ReviewSubject, size?: { w?: number; h?: number }): ReviewPanel`; `reviewCentre(subject: WorldRect, w?: number, h?: number): Point`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-viewport.cjs`, before the summary block:

```js
/* ---- M9b: the panel kind ---- */

// 74. A panel with NO `kind` at all reads as a TERMINAL panel. This is the
//     disk rule (absent means terminal — every layout.json predates the
//     field) stated as a runtime fact, and it is also what keeps every
//     fixture in every suite written before this milestone meaning what it
//     said. The direction is not symmetric and the asymmetry is the whole
//     check: a review node misread as a terminal fails loudly at
//     registry.ensure, while a terminal misread as a review node silently
//     stops spawning on every restored canvas.
ok('74 a panel with no kind is not a review panel',
  R.isReviewPanel({ rect: { id: 'n1', x: 0, y: 0, w: 720, h: 460 }, z: 1, spec: { cwd: '~', args: [] } }) === false)

// 75. makeReviewPanel centres EXACTLY, the contract check 48 pins for
//     makePanel. Placement is cascadeCentre's job and stays outside.
{
  const subject = { subjectId: 'n4', repoRoot: '/r', baselineSha: 'abc', label: 'claude' }
  const p = R.makeReviewPanel('r1', { x: 100, y: 50 }, 9, subject)
  ok('75 makeReviewPanel centres on the point it is given',
    p.kind === 'review' && p.rect.id === 'r1' && p.z === 9 &&
      p.rect.x === 100 - R.REVIEW_W / 2 && p.rect.y === 50 - R.REVIEW_H / 2)
}

// 76. THE ONE TO KNOW BY NUMBER. makePanel forces the minted id into
//     spec.panelId — a template carrying a stale one gives two panels one
//     session. Copying that line into makeReviewPanel is the obvious move
//     and it is catastrophic and silent: subject.subjectId would be
//     rewritten to the NODE's own id, so the node would be a review OF
//     ITSELF — a panel with no baseline, reporting never-started forever,
//     on a feature whose entire purpose is to report the subject's work.
//     The subject is a DIFFERENT panel and must be carried verbatim.
{
  const subject = { subjectId: 'n4', repoRoot: '/r', baselineSha: 'abc', label: 'claude' }
  const p = R.makeReviewPanel('r1', { x: 0, y: 0 }, 1, subject)
  ok('76 makeReviewPanel does NOT rewrite subjectId to its own id',
    p.subject.subjectId === 'n4' && p.subject.repoRoot === '/r' &&
      p.subject.baselineSha === 'abc' && p.subject.label === 'claude')
}

// 77. reviewCentre places the node BESIDE its subject — clear of the
//     subject's right edge, not on top of it. Asserted as a gap between the
//     two rects rather than as a coordinate, so the constants can move
//     without this check restating them.
{
  const subjectRect = { id: 'n4', x: 0, y: 0, w: 720, h: 460 }
  const c = R.reviewCentre(subjectRect)
  const left = c.x - R.REVIEW_W / 2
  ok('77 reviewCentre clears the subject\'s right edge',
    left >= subjectRect.x + subjectRect.w && c.y === subjectRect.y + R.REVIEW_H / 2)
}

// 78. A review node is an ordinary occupant of the cascade lattice: a second
//     node beside the same subject must not land byte-identically on the
//     first. cascadeCentre reads rects and knows nothing about kinds, which
//     is exactly the property being pinned — nothing here needed a special
//     case, and a later "optimisation" that filtered the panel list by kind
//     before cascading would reintroduce M6's indistinguishability bug for
//     review nodes alone.
{
  const subjectRect = { id: 'n4', x: 0, y: 0, w: 720, h: 460 }
  const c = R.reviewCentre(subjectRect)
  const existing = R.makeReviewPanel('r1', c, 1,
    { subjectId: 'n4', repoRoot: '/r', baselineSha: 'abc', label: 'claude' })
  const next = R.cascadeCentre(c, [existing])
  ok('78 a second review node cascades off the first',
    next.x === c.x + R.CASCADE_STEP && next.y === c.y + R.CASCADE_STEP)
}
```

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:viewport`
Expected: FAIL. 74 fails on `R.isReviewPanel is not a function` — **which THROWS and ends the process, so 75–78 never run at all.** That is the documented hazard in `CLAUDE.md` ("A check that THROWS aborts the run"). Note the suite total, then temporarily comment out check 74's line and re-run to watch 75–78 fail on their own; restore it before Step 3. Their RED is not evidence unless it has been seen.

- [ ] **Step 3: Add `ReviewSubject` to the shared review types**

In `src/shared/review.ts`, after `ReviewBaseline`:

```ts
/**
 * What a review NODE stores about the panel it reviews: everything needed to
 * ask git the question again, with no live pointer into the panel array.
 *
 * In shared/ beside ReviewBaseline because all three processes hold it — the
 * renderer builds it, layout-schema.ts persists it, and main answers
 * review:at from it.
 *
 * It carries a COPY of the baseline (repoRoot + baselineSha) rather than the
 * subject's id alone, and that is the whole design of the node: main DROPS a
 * panel's stored baseline when its session is killed (see main/index.ts's
 * dropBaseline), so a node that asked `review:panel(subjectId)` would go
 * blank the moment its agent was dismissed — which is exactly the moment a
 * review of finished work is most useful. `label` is a snapshot of the
 * honest chain's answer at creation time for the same reason: the panel it
 * names may not exist any more.
 */
export interface ReviewSubject {
  /** The panel this reviews. Kept for peer attribution, NOT as a live pointer. */
  subjectId: PanelId
  repoRoot: string
  baselineSha: string
  /** The subject's label when the node was made — see above. */
  label: string
}
```

- [ ] **Step 4: Make `Panel` a union**

In `src/renderer/panels/panels.ts`, replace the `Panel` interface with the union and add the constructors. `rect`, `z` and `title` keep their existing doc comments verbatim — they move to `PanelBase` unchanged:

```ts
import type { ReviewSubject } from '@shared/review'

export type { ReviewSubject }

export interface PanelBase {
  rect: WorldRect
  /** …existing Panel.z comment, unchanged… */
  z: number
  /** …existing Panel.title comment, unchanged… */
  title?: string
}

/**
 * A panel with a PTY behind an xterm — what `Panel` meant on its own until
 * M9b.
 */
export interface TerminalPanel extends PanelBase {
  kind: 'terminal'
  spec: PanelSpecTemplate
}

/**
 * A non-terminal panel: a rendered review of what one agent changed.
 *
 * It has no spec, and that absence is the point rather than an omission —
 * there is nothing to spawn, so it never reaches assignTiers, never reaches
 * registry.ensure, and can take neither a LIVE_BUDGET slot nor a WebGL
 * context. Canvas.tsx partitions on kind BEFORE tiering so that is
 * structurally true rather than merely unasked-for.
 */
export interface ReviewPanel extends PanelBase {
  kind: 'review'
  subject: ReviewSubject
}

export type Panel = TerminalPanel | ReviewPanel

/**
 * The ONLY kind test in the codebase, and it is deliberately positive.
 *
 * Never write `kind === 'terminal'` anywhere: `kind` is absent in every
 * layout.json written before M9b (see parsePanel) and in every verify
 * fixture written before it, and both must keep meaning "terminal". Asking
 * only whether something IS a review node makes the default fall the safe
 * way everywhere at once — a terminal panel misread as a review node stops
 * spawning silently on a restored canvas, while a review node misread as a
 * terminal fails loudly the first time anything reads its absent spec.
 */
export function isReviewPanel(panel: Panel): panel is ReviewPanel {
  return panel.kind === 'review'
}
```

- [ ] **Step 5: Add `kind: 'terminal'` to every existing construction**

`makePanel`'s return, `firstRunPanels`, and `SEED_PANELS`. The seed array goes through a small local helper rather than twelve edited literals, so the coordinates `verify:panels`' fixtures depend on cannot be disturbed by the edit:

```ts
const seed = (id: string, x: number, y: number, z: number): TerminalPanel => ({
  kind: 'terminal',
  rect: { id, x, y, w: PANEL_W, h: PANEL_H },
  spec: shell(id),
  z
})

export const SEED_PANELS: Panel[] = [
  seed('s01', 0, 0, 1), seed('s02', 800, 0, 2), seed('s03', 1600, 0, 3),
  seed('s04', 0, 540, 4), seed('s05', 800, 540, 5), seed('s06', 1600, 540, 6),
  seed('s07', -900, 270, 7), seed('s08', -900, 810, 8), seed('s09', 2500, 270, 9),
  seed('s10', 400, 1100, 10), seed('s11', 1200, 1100, 11), seed('s12', 400, -640, 12)
]
```

`makePanel` returns `TerminalPanel` (not `Panel`), so its callers keep the narrower type:

```ts
export function makePanel(
  id: string,
  centre: Point,
  z: number,
  spec?: Omit<PanelSpecTemplate, 'panelId'> & { panelId?: string },
  size?: { w?: number; h?: number }
): TerminalPanel {
  const w = size?.w ?? PANEL_W
  const h = size?.h ?? PANEL_H
  return {
    kind: 'terminal',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    // …existing panelId comment, unchanged…
    spec: spec ? { ...spec, panelId: id } : shell(id),
    z
  }
}
```

`firstRunPanels` gains `kind: 'terminal'` on its single literal.

- [ ] **Step 6: Add the review constructors**

At the end of `panels.ts`:

```ts
/**
 * A review node is TALLER and NARROWER than a terminal panel: it is a list of
 * paths and a column of diff lines, both of which read better in a portrait
 * box than in the 720x460 landscape one a terminal wants.
 */
export const REVIEW_W = 640
export const REVIEW_H = 520

/** World units between a subject's right edge and its review node's left. */
export const REVIEW_GAP = 40

/**
 * Beside the subject, top-aligned with it, so the pair reads as one unit at
 * any zoom.
 *
 * The RESULT is a request, not a decision: Canvas.tsx runs it through
 * cascadeCentre exactly as onSpawn does, so opening two reviews of one panel
 * does not stack them byte-identically — the coincidence rule M6 established,
 * which review nodes inherit for free because cascadeCentre reads rects and
 * knows nothing about kinds.
 */
export function reviewCentre(subject: WorldRect, w = REVIEW_W, h = REVIEW_H): Point {
  return { x: subject.x + subject.w + REVIEW_GAP + w / 2, y: subject.y + h / 2 }
}

/**
 * Centred exactly on the point it is given, the contract makePanel has.
 *
 * `subject` is carried VERBATIM. Do not copy makePanel's `{ ...spec, panelId:
 * id }` line here: that line exists because a spec's panelId names the panel
 * ITSELF, while a subject's subjectId names a DIFFERENT panel. Forcing the
 * minted id into it makes the node a review of itself — no baseline, "not
 * started" forever, and nothing anywhere saying why. verify:viewport 76.
 */
export function makeReviewPanel(
  id: string,
  centre: Point,
  z: number,
  subject: ReviewSubject,
  size?: { w?: number; h?: number }
): ReviewPanel {
  const w = size?.w ?? REVIEW_W
  const h = size?.h ?? REVIEW_H
  return {
    kind: 'review',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    subject,
    z
  }
}
```

- [ ] **Step 7: Run the checks**

Run: `npm run verify:viewport`
Expected: PASS, 78 checks reported (73 existing + 5). `npm run typecheck` will still be RED — every consumer of `Panel.spec` now sees a union, and Tasks 2, 7 and 10 fix them. That is expected at this step and only at this step; do not "fix" it by widening `Panel` back.

- [ ] **Step 8: Commit**

```bash
git add src/shared/review.ts src/renderer/panels/panels.ts scripts/verify-viewport.cjs
git commit -m "feat(m9b): Panel becomes a union, and the review node's constructors"
```

---

### Task 2: Persistence — the union on disk

**Files:**
- Modify: `src/shared/layout-schema.ts` (`PersistedPanel`, `parsePanel`)
- Modify: `src/renderer/panels/layout-adapt.ts`
- Test: `scripts/verify-layout.cjs` (checks 104–108)

**Interfaces:**
- Consumes: `ReviewSubject` from `@shared/review`; `Panel`/`TerminalPanel`/`ReviewPanel`/`isReviewPanel` from Task 1.
- Produces: `PersistedPanelBase`, `PersistedTerminalPanel`, `PersistedReviewPanel`, `PersistedPanel = PersistedTerminalPanel | PersistedReviewPanel`; `toPanels`/`fromPanels` handling both kinds.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`, before its summary block (the file's existing helpers — `parseLayout`, the temp-dir store — are already in scope; follow the surrounding checks' style for building a store):

```js
const SUBJECT = { subjectId: 'n4', repoRoot: '/tmp/repo', baselineSha: 'abc123', label: 'claude' }
const reviewPanelOnDisk = (id, over = {}) => ({
  id, x: 10, y: 20, w: 640, h: 520, z: 3, kind: 'review', subject: { ...SUBJECT }, ...over
})

// 104. The rule every other check in this block depends on: a panel with NO
//      `kind` key is a TERMINAL panel. Every layout.json in existence
//      predates the field, and parseLayout drops entries INDIVIDUALLY — so a
//      required `kind` would not fail loudly, it would silently empty every
//      saved canvas on first launch. The same trade `title` already makes.
{
  const out = R.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main',
      panels: [{ id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }] }],
    activeWorkspaceId: 'w1'
  }))
  const p = out.value.workspaces[0].panels[0]
  ok('104 a panel with no kind survives as a terminal panel',
    p !== undefined && p.kind === undefined && p.cwd === '~' &&
      R.toPanels([p])[0].kind === 'terminal')
}

// 105. A review panel round-trips through the format with all four subject
//      fields intact. baselineSha is the one that matters most: without it
//      the node cannot ask git anything at all, and a node that silently
//      lost it would render "not started" beside an agent that did an
//      hour's work — this milestone's headline silent failure, reached
//      through the format rather than through the engine.
{
  const out = R.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [reviewPanelOnDisk('r1')] }],
    activeWorkspaceId: 'w1'
  }))
  const p = out.value.workspaces[0].panels[0]
  ok('105 a review panel round-trips with its whole subject',
    p !== undefined && p.kind === 'review' && p.subject.subjectId === 'n4' &&
      p.subject.repoRoot === '/tmp/repo' && p.subject.baselineSha === 'abc123' &&
      p.subject.label === 'claude')
}

// 106. A malformed subject costs THAT panel, not the file — the rule this
//      whole parser is built on. Its neighbour must survive in the same
//      read, which is the half that fails if the review branch throws
//      instead of returning null.
{
  const out = R.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      reviewPanelOnDisk('r1', { subject: { subjectId: 'n4' } }),
      { id: 'n9', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const ids = out.value.workspaces[0].panels.map((p) => p.id)
  ok('106 a review panel with a broken subject is dropped alone',
    ids.length === 1 && ids[0] === 'n9' && out.warnings.length > 0)
}

// 107. THE ASYMMETRY. ABSENT means terminal (104); a PRESENT but unknown
//      kind is DROPPED, never defaulted. `"kind": "tree"` is a file written
//      by a later version of this app, and reading it as a terminal panel
//      would spawn a process for a node that never asked for one — with a
//      cwd and args it does not have. Dropping it costs one panel; guessing
//      costs a process.
{
  const out = R.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main',
      panels: [{ id: 'x1', x: 0, y: 0, w: 640, h: 520, z: 1, kind: 'tree' }] }],
    activeWorkspaceId: 'w1'
  }))
  ok('107 an unknown kind is dropped, not defaulted to terminal',
    out.value.workspaces[0].panels.length === 0 &&
      out.warnings.some((w) => w.includes('kind')))
}

// 108. The two kinds validate DIFFERENT fields, in both directions: a review
//      panel needs no cwd/args (it has no spec to build), and a terminal
//      panel still requires them. Asserting only the first half passes
//      against a parser that stopped validating cwd for everything.
{
  const out = R.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      reviewPanelOnDisk('r1'),
      { id: 'n2', x: 0, y: 0, w: 720, h: 460, z: 1, args: [] }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const ids = out.value.workspaces[0].panels.map((p) => p.id)
  ok('108 a review panel needs no cwd; a terminal panel still does',
    ids.length === 1 && ids[0] === 'r1')
}

// 108b. fromPanels writes a review panel back out with no cwd/args keys at
//       all, and toPanels(fromPanels(x)) is x. The absent-stays-absent rule
//       `command` and `title` already obey, applied to a whole branch:
//       writing `cwd: undefined` here would make the panel fail its own
//       parse on the next launch (check 108's terminal half), i.e. a canvas
//       that loses its review nodes on every relaunch.
{
  const node = R.makeReviewPanel
    ? R.makeReviewPanel('r1', { x: 0, y: 0 }, 3, { ...SUBJECT })
    : null
  const persisted = R.fromPanels([{ kind: 'review', rect: { id: 'r1', x: 10, y: 20, w: 640, h: 520 }, z: 3, subject: { ...SUBJECT } }])
  const back = R.toPanels(persisted)
  ok('108b a review panel survives fromPanels -> toPanels',
    node !== null && !('cwd' in persisted[0]) && !('args' in persisted[0]) &&
      back[0].kind === 'review' && back[0].subject.baselineSha === 'abc123' &&
      back[0].rect.x === 10)
}
```

Note: `makeReviewPanel` is not exported by `layout-entry.cjs`'s bundle — the guard in 108b is there so the check reports a clean FAIL rather than throwing and taking the summary with it. If it reads `null`, add `...require('../src/renderer/panels/panels')` to `scripts/layout-entry.cjs`.

- [ ] **Step 2: Run the checks and watch them fail**

Run: `npm run verify:layout`
Expected: FAIL on 105, 106, 107, 108, 108b (104 passes today — it is the pre-existing behaviour, and it is here as the regression guard for the next four). Confirm each failure's message names the reason you expect; a check failing because the fixture is malformed proves nothing.

- [ ] **Step 3: Make `PersistedPanel` a union**

In `src/shared/layout-schema.ts`, replace `PersistedPanel`:

```ts
import type { ReviewBaseline, ReviewSubject } from './review'

export interface PersistedPanelBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  z: number
  /** …existing title comment, unchanged… */
  title?: string
}

export interface PersistedTerminalPanel extends PersistedPanelBase {
  /**
   * OPTIONAL, and absent means 'terminal'. Every layout.json ever written
   * predates this field, and parsePanel drops entries individually — so a
   * required discriminant would not fail loudly, it would quietly empty
   * every existing canvas the first time a user launched the new build.
   * Writers still EMIT it (fromPanels), so files written from M9b onward are
   * explicit; only readers tolerate its absence.
   */
  kind?: 'terminal'
  cwd: string
  /** Absent means "the user's login shell" — main resolves it. See PanelSpec. */
  command?: string
  // …existing PanelSpec.env note, unchanged…
  args: string[]
}

export interface PersistedReviewPanel extends PersistedPanelBase {
  kind: 'review'
  /**
   * The whole subject, not a panel id. See ReviewSubject in shared/review.ts:
   * a node outlives the panel it reviews, whose baseline main drops on kill.
   */
  subject: ReviewSubject
}

export type PersistedPanel = PersistedTerminalPanel | PersistedReviewPanel
```

- [ ] **Step 4: Branch `parsePanel`**

Keep the id, duplicate-id and coordinate checks exactly as they are — they are common to both kinds — then split. The `kind` read happens after the geometry, so a malformed review panel still reports the same "unusable id"/"coordinate" warnings a terminal one would:

```ts
function parseReviewSubject(raw: unknown, id: string, warnings: string[]): ReviewSubject | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped review panel ${id}: subject was not an object`)
    return null
  }
  const { subjectId, repoRoot, baselineSha, label } = raw
  // All four are required. A subject missing any one of them cannot ask git
  // its question, and a node that renders a heading over a permanently empty
  // body is worse than a node that was never restored: it looks like the
  // feature is broken rather than like the file was.
  if (!isStr(subjectId) || !ID_PATTERN.test(subjectId)) {
    warnings.push(`dropped review panel ${id}: subject id was unusable`)
    return null
  }
  if (!isStr(repoRoot) || !isStr(baselineSha) || !isStr(label)) {
    warnings.push(`dropped review panel ${id}: subject was incomplete`)
    return null
  }
  return { subjectId, repoRoot, baselineSha, label }
}
```

and inside `parsePanel`, after `seen.add(id)` and the geometry clamp:

```ts
  const base = {
    id,
    x,
    y,
    // …existing clamp comment, unchanged…
    w: Math.max(MIN_PANEL_W, w),
    h: Math.max(MIN_PANEL_H, h),
    z,
    ...(isStr(title) ? { title } : {})
  }

  // ABSENT is terminal — the whole file's compatibility rule. A PRESENT but
  // unrecognised kind is dropped instead, and the difference is deliberate:
  // absence is a historical fact about every file written before M9b, while
  // "kind": "tree" is a file from a LATER version of this app, and reading
  // it as a terminal panel would spawn a process for a node that never
  // asked for one — out of a record that carries no cwd and no args.
  const { kind } = raw
  if (kind === 'review') {
    const subject = parseReviewSubject((raw as Record<string, unknown>).subject, id, warnings)
    if (subject === null) return null
    return { ...base, kind: 'review', subject }
  }
  if (kind !== undefined && kind !== 'terminal') {
    warnings.push(`dropped panel ${id}: unrecognised kind ${JSON.stringify(kind)}`)
    return null
  }
  // …the existing cwd / args validation and the terminal return, unchanged
  // except for adding `kind: 'terminal'` to the returned object…
```

The existing `cwd`/`args` checks move below this branch so a review panel is never asked for them.

- [ ] **Step 5: Branch `layout-adapt.ts`**

```ts
export function toPanels(persisted: PersistedPanel[]): Panel[] {
  return persisted.map((p) => {
    const base = {
      rect: { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h },
      z: p.z,
      ...(p.title === undefined ? {} : { title: p.title })
    }
    // The disk rule stated once, in the one place it converts: only 'review'
    // is tested positively, so an absent kind — every pre-M9b file — becomes
    // a terminal panel here rather than anywhere further downstream.
    if (p.kind === 'review') return { ...base, kind: 'review' as const, subject: { ...p.subject } }
    return {
      ...base,
      kind: 'terminal' as const,
      spec: {
        panelId: p.id,
        cwd: p.cwd,
        // …existing absent-command comment, unchanged…
        ...(p.command === undefined ? {} : { command: p.command }),
        args: [...p.args]
      }
    }
  })
}

export function fromPanels(panels: Panel[]): PersistedPanel[] {
  return panels.map((panel) => {
    const base = {
      id: panel.rect.id,
      x: panel.rect.x,
      y: panel.rect.y,
      w: panel.rect.w,
      h: panel.rect.h,
      z: panel.z,
      // Same absent-stays-absent rule as `command`, and for the same reason.
      ...(panel.title === undefined ? {} : { title: panel.title })
    }
    // No cwd and no args keys AT ALL on this branch — not `cwd: undefined`.
    // A review record carrying an explicit undefined cwd fails its own parse
    // on the next launch (the terminal branch's cwd check), which is a canvas
    // that loses every review node on every relaunch, silently.
    if (panel.kind === 'review') return { ...base, kind: 'review' as const, subject: { ...panel.subject } }
    return {
      ...base,
      kind: 'terminal' as const,
      cwd: panel.spec.cwd,
      ...(panel.spec.command === undefined ? {} : { command: panel.spec.command }),
      args: [...panel.spec.args]
    }
  })
}
```

- [ ] **Step 6: Run the checks**

Run: `npm run verify:layout`
Expected: PASS, 108 checks (103 existing + 5, plus the lettered `108b`; the reported count rises by 6).

- [ ] **Step 7: Commit**

```bash
git add src/shared/layout-schema.ts src/renderer/panels/layout-adapt.ts scripts/verify-layout.cjs scripts/layout-entry.cjs
git commit -m "feat(m9b): the panel kind on disk, absent meaning terminal"
```

---

### Task 3: The eighth arm — `repo-unreadable`

M9a's `review-engine.ts` records this gap in two comments and names M9b as its owner. `resolveRepo` answers `null` for "this is not a repository" **and** for "git refused to open it", and the concrete, ordinary second case is the macOS `/usr/bin/git` Command Line Tools stub: it exists, it spawns (so it is not the ENOENT `git-missing` covers) and it exits non-zero on every invocation. Both render as no section at all. On a review NODE that is a worse failure than it was in the inspector — the node is a panel the user deliberately opened, and a deliberately-opened panel that renders nothing reads as a broken app.

**Files:**
- Modify: `src/shared/review.ts`, `src/main/git-runner.ts`, `src/main/review-engine.ts`, `src/main/baseline-capture.ts`, `src/main/index.ts`, `src/renderer/shell/inspector-fields.ts`
- Test: `scripts/verify-review.cjs` (38–41), `scripts/verify-rail.cjs` (46–47)

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: `GitResult { stdout: string; ok: boolean; notFound: boolean; code: number; stderr: string }`; `RepoAnswer = { kind: 'root'; root: string } | { kind: 'not-a-repo' } | { kind: 'unreadable'; detail: string }`; `ReviewEngine.resolveRepo(cwd): Promise<RepoAnswer>`; `ReviewEngineDeps.repoUnreadable?: (panelId: string) => string | undefined`; `BaselineCapture.unreadableDetail(panelId): string | undefined`; the `{ kind: 'repo-unreadable'; detail: string }` arm on `ReviewResult`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-review.cjs` (inside the async IIFE, before the summary). The file's existing `fakeRunner`-style helpers are in scope; build results with the new fields:

```js
const gitOk = (stdout) => ({ stdout, ok: true, notFound: false, code: 0, stderr: '' })
const gitFail = (code, stderr) => ({ stdout: '', ok: false, notFound: false, code, stderr })

// 38. The ordinary "this is not a repository" answer, which must stay
//     exactly what it was: git exits 128 and says so on stderr. This arm is
//     the answer for a panel in the home directory — i.e. most panels — and
//     turning it into an error would put a red field on nearly every panel.
{
  const engine = R.createReviewEngine({
    run: async () => gitFail(128, 'fatal: not a git repository (or any of the parent directories): .git\n'),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  const answer = await engine.resolveRepo('/home/u')
  ok('38 exit 128 + "not a git repository" is not-a-repo', answer.kind === 'not-a-repo')
}

// 39. THE CASE THIS TASK EXISTS FOR. The Command Line Tools stub exits 1 and
//     prints its own error; git's own fatals exit 128. Anything that is not
//     the 128-and-says-so pair is a repository git DECLINED to open, and the
//     detail is carried so the user is told which. Conflating it with 38 is
//     what M9a shipped, and it renders as nothing at all on screen.
{
  const engine = R.createReviewEngine({
    run: async () => gitFail(1, 'xcrun: error: invalid active developer path\n'),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  const answer = await engine.resolveRepo('/home/u/proj')
  ok('39 a non-128 git failure is unreadable, with a detail',
    answer.kind === 'unreadable' && answer.detail.includes('xcrun'))
}

// 40. The three-way split at the panel level, asserted in ONE check because
//     each pair is individually satisfiable by the wrong implementation:
//     "no baseline" alone is never-started, "no baseline + not a repo" is
//     not-a-repo, and "no baseline + git refused" is now its own arm. An
//     implementation that folded the third into either of the first two
//     passes any two of these three clauses.
{
  const mk = (extra) => R.createReviewEngine({
    run: async () => gitOk(''),
    baselineOf: () => undefined,
    peersInRepo: () => 0,
    ...extra
  })
  const plain = await mk({}).review('p1')
  const notRepo = await mk({ notARepo: () => true }).review('p1')
  const unreadable = await mk({ repoUnreadable: () => 'xcrun: error' }).review('p1')
  ok('40 never-started / not-a-repo / repo-unreadable are three answers',
    plain.kind === 'never-started' && notRepo.kind === 'not-a-repo' &&
      unreadable.kind === 'repo-unreadable' && unreadable.detail === 'xcrun: error')
}

// 41. The capture records WHICH failure it saw, and drop() clears it — the
//     rule isNotARepo already obeys, extended to the second verdict. Without
//     the clear, onReset()'s recycled FIRST_RUN_ID inherits a stranger's
//     "git refused" verdict and reports it against a perfectly good repo.
{
  const capture = R.createBaselineCapture({
    baselineOf: () => undefined,
    setBaseline: () => {},
    resolveRepo: async () => ({ kind: 'unreadable', detail: 'xcrun: error' }),
    captureBaseline: async () => null
  })
  capture.capture('p1', '/home/u/proj')
  await new Promise((r) => setImmediate(r))
  const before = capture.unreadableDetail('p1')
  capture.drop('p1')
  ok('41 an unreadable verdict is recorded and cleared by drop',
    before === 'xcrun: error' && capture.unreadableDetail('p1') === undefined &&
      capture.isNotARepo('p1') === false)
}
```

Append to `scripts/verify-rail.cjs`:

```js
// 46. The new arm RENDERS, with a note naming the cause. `hidden` would be
//     the wrong answer here for the same reason `clean` is not hidden: a
//     panel the feature is broken for and a panel with nothing to report
//     must not look identical.
{
  const m = R.buildReviewFields({ kind: 'repo-unreadable', detail: 'xcrun: error: invalid active developer path' })
  ok('46 repo-unreadable renders a note, not nothing',
    m.hidden === false && m.summary === 'unavailable' &&
      typeof m.note === 'string' && m.note.includes('xcrun'))
}

// 47. The boundary the new arm exists to draw, from the other side:
//     not-a-repo is STILL hidden. It is the ordinary answer for a panel in
//     the home directory, and a permanent error row on most panels teaches
//     the user to stop reading the section. Asserting 46 alone passes
//     against an implementation that stopped hiding anything.
ok('47 not-a-repo is still hidden', R.buildReviewFields({ kind: 'not-a-repo' }).hidden === true)
```

- [ ] **Step 2: Run both suites and watch them fail**

Run: `npm run verify:review` then `npm run verify:rail`
Expected: 38–41 FAIL (`answer.kind` is `undefined` — `resolveRepo` still returns a string or null), 46 FAILs (`hidden` is `true`, since an unknown kind falls through to the shared `changes` tail — read the actual failure, and if it THROWS instead, note that 47 never ran and confirm its RED separately), 47 passes today.

- [ ] **Step 3: Carry the exit code and stderr out of the runner**

`src/main/review-engine.ts`, on `GitResult`:

```ts
export interface GitResult {
  stdout: string
  /** Exit status 0. */
  ok: boolean
  /** The git binary itself could not be spawned (ENOENT). */
  notFound: boolean
  /**
   * The process's exit status, or -1 when it never ran (notFound, or a
   * timeout that killed it with a signal). Carried since M9b for exactly one
   * decision: 128 is git's own "fatal:" status, and it is what separates
   * "this directory is not a repository" from "git declined to open it".
   */
  code: number
  /** First use: the detail repo-unreadable reports. Capped by the caller. */
  stderr: string
}
```

`src/main/git-runner.ts` — the `execFile` callback takes the third argument, and the `gitPath === null` early return gains the two fields:

```ts
        (error, stdout, stderr) => {
          const err = error as (NodeJS.ErrnoException & { code?: number | string }) | null
          const notFound = err !== null && err.code === 'ENOENT'
          resolve({
            stdout: stdout ?? '',
            ok: error === null,
            notFound,
            // execFile puts the EXIT STATUS in `code` for a normal non-zero
            // exit and an ERRNO STRING there for a spawn failure — the same
            // field, two types. -1 for anything that is not a number, so a
            // caller comparing against 128 can never accidentally match
            // 'ENOENT'.
            code: typeof err?.code === 'number' ? err.code : error === null ? 0 : -1,
            stderr: stderr ?? ''
          })
        }
```

and the null-binary branch: `resolve({ stdout: '', ok: false, notFound: true, code: -1, stderr: '' })`.

- [ ] **Step 4: `resolveRepo` answers a union**

In `review-engine.ts`, replace the function and delete the long "NOT covered yet… Reconsidered in M9b" comment it carries — M9b is this milestone, and a deferral note left standing after the deferral is paid is a comment that lies:

```ts
/**
 * What a cwd turned out to be. Three answers, not two, since M9b.
 *
 * The discriminator is git's own exit status plus what it said. 128 is git's
 * "fatal:" status, and `rev-parse --show-toplevel` outside a repository exits
 * 128 saying "not a git repository" — the ordinary case, and the one that
 * must stay quiet, because it is the answer for most panels. Everything else
 * is a repository git DECLINED to open: the macOS Command Line Tools stub
 * (exists, spawns, exits 1 on everything), safe.directory refusing an unowned
 * checkout, an unreadable .git, a cwd that vanished under a running panel.
 * M9a answered null for all of them alike, so the Changes section simply
 * rendered nothing with no note — invisible as a bug, because it is the same
 * shape as the ordinary case.
 *
 * BOTH conditions are required for not-a-repo. Testing the status alone is
 * wrong in the direction that matters: git exits 128 for plenty of fatals
 * that are not "you are outside a repository".
 */
export type RepoAnswer =
  | { kind: 'root'; root: string }
  | { kind: 'not-a-repo' }
  | { kind: 'unreadable'; detail: string }

/** stderr is a whole process's output; the pane shows one line. */
const DETAIL_MAX = 200

const firstLine = (text: string): string =>
  text.split('\n').find((l) => l.trim() !== '')?.trim().slice(0, DETAIL_MAX) ?? 'git exited non-zero'

  const resolveRepo = async (cwd: string): Promise<RepoAnswer> => {
    const result = await run(buildRepoRootArgs(cwd))
    if (result.ok) {
      const root = parseRepoRoot(result.stdout)
      return root === null
        // ok, and nothing on stdout: git answered, and answered nothing.
        // Not a repository is the only reading, and it is the quiet one.
        ? { kind: 'not-a-repo' }
        : { kind: 'root', root }
    }
    if (result.notFound) return { kind: 'unreadable', detail: 'git could not be run' }
    if (result.code === 128 && /not a git repository/i.test(result.stderr)) {
      return { kind: 'not-a-repo' }
    }
    return { kind: 'unreadable', detail: firstLine(result.stderr) }
  }
```

- [ ] **Step 5: The engine's new dep and arm**

`ReviewEngineDeps` gains, beside `notARepo`:

```ts
  /**
   * The detail of a capture that resolved a cwd git DECLINED to open, or
   * undefined. The sibling of `notARepo`, and optional for the same reason:
   * every existing fixture that builds an engine without it keeps compiling
   * and keeps its prior behaviour.
   */
  repoUnreadable?: (panelId: string) => string | undefined
```

and the no-baseline branch of `review()` becomes a three-way split — the unreadable check FIRST, because it is the specific answer and the other two are the general ones:

```ts
    if (baseline === undefined) {
      const detail = deps.repoUnreadable?.(panelId)
      if (detail !== undefined) return { kind: 'repo-unreadable', detail }
      return deps.notARepo?.(panelId) === true ? { kind: 'not-a-repo' } : { kind: 'never-started' }
    }
```

`src/shared/review.ts` gains the arm on `ReviewResult`:

```ts
  /**
   * The cwd IS (or may be) a repository, and git declined to open it — the
   * Command Line Tools stub, safe.directory, an unreadable .git, a vanished
   * checkout. Distinct from `not-a-repo`, which is the ordinary quiet answer
   * for a panel in the home directory: this one is rendered, with `detail`
   * naming what git said, because a user whose repository is invisible to
   * the app needs to be told rather than shown an empty pane.
   */
  | { kind: 'repo-unreadable'; detail: string }
```

- [ ] **Step 6: The capture records which verdict it saw**

`baseline-capture.ts`: `BaselineCaptureDeps.resolveRepo` becomes `(cwd: string) => Promise<RepoAnswer>` (imported as a type from `./review-engine`), `BaselineCapture` gains `unreadableDetail(panelId: string): string | undefined`, and the capture body branches:

```ts
      void (async () => {
        const answer = await deps.resolveRepo(cwd)
        if (answer.kind !== 'root') {
          // Same epoch discipline as the sha write below, and now covering
          // TWO verdicts rather than one: a kill landing mid-resolve must not
          // leave either a stale "not a repo" or a stale "git refused" for
          // whichever panel recycles this id next.
          if ((epoch.get(panelId) ?? 0) === atCall) {
            if (answer.kind === 'not-a-repo') notARepoIds.add(panelId)
            else unreadableDetails.set(panelId, answer.detail)
          }
          return
        }
        const root = answer.root
        // …unchanged from here…
```

with `const unreadableDetails = new Map<string, string>()` beside `notARepoIds`, `drop` clearing both, and `unreadableDetail(panelId) { return unreadableDetails.get(panelId) }`.

- [ ] **Step 7: Wire it in main and render it**

`src/main/index.ts`, in the `createReviewEngine` call beside `notARepo`:

```ts
  repoUnreadable: (panelId) => baselineCapture.unreadableDetail(panelId)
```

`src/renderer/shell/inspector-fields.ts`, in `buildReviewFields`, beside the `git-missing` arm:

```ts
  if (result.kind === 'repo-unreadable') {
    // The detail is git's own words, and it is the whole value of this arm:
    // "unavailable" alone is what M9a rendered for git-missing, and a user
    // who has git installed would have no idea why this panel says it.
    return {
      hidden: false,
      summary: 'unavailable',
      note: `git could not open this repository — ${result.detail}`,
      files: [],
      more: 0
    }
  }
```

- [ ] **Step 8: Run everything that touches the engine**

Run: `npm run verify:review && npm run verify:rail && npm run typecheck:node`
Expected: review 41 checks reported (37 + 4), rail passing 46 and 47.

- [ ] **Step 9: Commit**

```bash
git add src/shared/review.ts src/main/git-runner.ts src/main/review-engine.ts src/main/baseline-capture.ts src/main/index.ts src/renderer/shell/inspector-fields.ts scripts/verify-review.cjs scripts/verify-rail.cjs
git commit -m "feat(m9b): the eighth arm — a repository git declined to open"
```

---

### Task 4: `reviewAt`, `fileDiff`, and the diff parser

**Files:**
- Modify: `src/shared/review.ts`, `src/main/git-args.ts`, `src/main/review-engine.ts`
- Test: `scripts/verify-review.cjs` (42–48)

**Interfaces:**
- Consumes: `RepoAnswer`, the `GitResult` fields from Task 3; `ReviewSubject` from Task 1.
- Produces: `DiffLine { kind: 'add' | 'del' | 'context' | 'hunk' | 'meta'; text: string }`; `ReviewDiff = { kind: 'diff'; lines: DiffLine[]; truncated: number } | { kind: 'binary' } | { kind: 'unavailable' }`; `ReviewDiffRequest { repoRoot: string; baselineSha: string; path: string; untracked: boolean }`; `DIFF_MAX_BYTES = 512 * 1024`, `DIFF_MAX_LINES = 600`; `parseDiffLines(patch: string, maxLines?: number): { lines: DiffLine[]; truncated: number }`; `buildNewFileDiffArgs(root: string, path: string): string[]`; `ReviewEngine.reviewAt(baseline: ReviewBaseline, subjectId: string): Promise<ReviewResult>`; `ReviewEngine.fileDiff(req: ReviewDiffRequest): Promise<ReviewDiff>`.

- [ ] **Step 1: Write the failing checks**

```js
// 42. THE ONE TO KNOW BY NUMBER. A unified diff's file headers begin '---'
//     and '+++', so a parser that tests '+' before '+++' paints the header
//     of every file as an ADDED line — a green "+++ b/src/app.ts" at the top
//     of every hunk, which looks like a rendering quirk and is a
//     classification bug. Order of tests, asserted directly.
{
  const { lines } = R.parseDiffLines('--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n ctx\n')
  ok('42 file headers are meta, not additions',
    lines[0].kind === 'meta' && lines[1].kind === 'meta' && lines[2].kind === 'hunk' &&
      lines[3].kind === 'del' && lines[4].kind === 'add' && lines[5].kind === 'context')
}

// 43. The preamble git prints before the first hunk is meta too, and the
//     "\ No newline at end of file" marker is meta rather than context — it
//     is a note ABOUT the diff, and rendering it as an unchanged source line
//     puts text on screen that is not in the file.
{
  const { lines } = R.parseDiffLines(
    'diff --git a/x b/x\nindex 1..2 100644\nnew file mode 100644\n@@ -0,0 +1 @@\n+hi\n\\ No newline at end of file\n')
  ok('43 the preamble and the no-newline marker are meta',
    lines.slice(0, 3).every((l) => l.kind === 'meta') &&
      lines[lines.length - 1].kind === 'meta')
}

// 44. The cap TRUNCATES and SAYS SO. A node that silently rendered the first
//     600 lines of a 5000-line diff is a review tool that lies by omission,
//     which is the one thing this milestone's honest-degradation rule
//     forbids; the count is what the view renders as "+N more lines".
{
  const patch = Array.from({ length: 50 }, (_, i) => `+line ${i}`).join('\n')
  const out = R.parseDiffLines(patch, 10)
  ok('44 the line cap truncates and reports the remainder',
    out.lines.length === 10 && out.truncated === 40)
}

// 45. THE OUTLIVES-THE-SUBJECT PROPERTY, and the only place it is provable
//     cheaply. reviewAt takes a BASELINE, so it must never consult
//     baselineOf — main drops a panel's stored baseline the moment its
//     session is killed, so an implementation that looked the subject up
//     would go blank exactly when the agent is dismissed, which is when a
//     review of finished work is most useful. The fake throws rather than
//     returning undefined, so a lookup fails loudly instead of degrading
//     into a plausible never-started.
{
  const engine = R.createReviewEngine({
    run: async (args) => args.includes('--numstat')
      ? gitOk('3\t1\tsrc/app.ts\0')
      : gitOk(''),
    baselineOf: () => { throw new Error('reviewAt must not look up a panel') },
    peersInRepo: () => 0
  })
  const result = await engine.reviewAt({ root: '/r', sha: 'abc' }, 'n4')
  ok('45 reviewAt answers from the baseline alone',
    result.kind === 'changes' && result.files[0].path === 'src/app.ts' &&
      result.added === 3 && result.removed === 1)
}

// 46. …and it still reports `shared` rather than a confident wrong
//     attribution, excluding its own subject from the peer count. A node
//     that dropped the exclusion would report every single-panel repository
//     as shared with itself.
{
  const engine = R.createReviewEngine({
    run: async (args) => args.includes('--numstat') ? gitOk('1\t0\tx\0') : gitOk(''),
    baselineOf: () => undefined,
    peersInRepo: (root, except) => (except === 'n4' ? 1 : 99)
  })
  const result = await engine.reviewAt({ root: '/r', sha: 'abc' }, 'n4')
  ok('46 reviewAt excludes its own subject from the peer count',
    result.kind === 'shared' && result.panelCount === 2)
}

// 47. fileDiff's three answers. `binary` is git's own report and must not be
//     parsed as source; a failed diff is `unavailable`, never an EMPTY diff
//     — "this file did not change" for a file the numstat just said changed
//     is the confident wrong answer this whole feature is built to refuse.
{
  const mk = (result) => R.createReviewEngine({
    run: async () => result, baselineOf: () => undefined, peersInRepo: () => 0
  })
  const text = await mk(gitOk('@@ -1 +1 @@\n-a\n+b\n')).fileDiff(
    { repoRoot: '/r', baselineSha: 'abc', path: 'x.ts', untracked: false })
  const bin = await mk(gitOk('Binary files a/x.png and b/x.png differ\n')).fileDiff(
    { repoRoot: '/r', baselineSha: 'abc', path: 'x.png', untracked: false })
  const bad = await mk(gitFail(128, 'fatal: bad object')).fileDiff(
    { repoRoot: '/r', baselineSha: 'abc', path: 'x.ts', untracked: false })
  ok('47 fileDiff answers diff / binary / unavailable',
    text.kind === 'diff' && text.lines.length === 3 &&
      bin.kind === 'binary' && bad.kind === 'unavailable')
}

// 48. An UNTRACKED file — the commonest thing an agent produces — has no
//     entry in `git diff <baseline>` at all, so it needs --no-index against
//     /dev/null. That call EXITS 1 whenever it finds differences, which is
//     every successful call; treating exit 1 as failure here means every new
//     file a user opens reads "unavailable", i.e. the feature is broken for
//     its most common input while looking correct on modified files.
{
  const engine = R.createReviewEngine({
    run: async (args) => args.includes('--no-index')
      ? { stdout: '@@ -0,0 +1 @@\n+hello\n', ok: false, notFound: false, code: 1, stderr: '' }
      : gitOk(''),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  const out = await engine.fileDiff({ repoRoot: '/r', baselineSha: 'abc', path: 'new.txt', untracked: true })
  ok('48 an untracked file diffs against /dev/null, and exit 1 is success',
    out.kind === 'diff' && out.lines.some((l) => l.kind === 'add' && l.text.includes('hello')))
}
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm run verify:review`
Expected: 42 throws (`parseDiffLines` does not exist), which ends the run — so comment it out and watch 43–48 fail on their own, then restore it. Record which numbers you actually saw RED.

- [ ] **Step 3: The wire types**

`src/shared/review.ts`:

```ts
/**
 * One rendered line of a unified diff. `text` is the raw line INCLUDING its
 * leading marker, because a review pane that stripped the +/- would be
 * unreadable when copied out of, and the node colours from `kind` anyway.
 */
export interface DiffLine {
  kind: 'add' | 'del' | 'context' | 'hunk' | 'meta'
  text: string
}

/**
 * `unavailable` is a designed state, not an error path — the same rule the
 * ReviewResult arms follow. It is what a failed or refused diff says, and it
 * is deliberately NOT an empty `diff`: reporting "nothing changed in this
 * file" for a file the numstat just said changed is exactly the confident
 * wrong answer this feature exists to refuse.
 */
export type ReviewDiff =
  | { kind: 'diff'; lines: DiffLine[]; truncated: number }
  | { kind: 'binary' }
  | { kind: 'unavailable' }

/**
 * Addressed by BASELINE, never by panel id — see ReviewSubject on why a node
 * must be able to ask this question after its subject is gone.
 */
export interface ReviewDiffRequest {
  repoRoot: string
  baselineSha: string
  path: string
  /** Untracked files need --no-index; they appear in no diff against a commit. */
  untracked: boolean
}
```

- [ ] **Step 4: The parser and the new argv**

`src/main/git-args.ts` (its only imports stay type-only, so the suite stays plain-node):

```ts
import type { DiffLine } from '@shared/review'

/**
 * A patch larger than this is sliced before parsing. Not a correctness
 * bound — a cap on how much text crosses IPC and lands in a DOM node inside
 * .world, where it is also being scaled by the canvas transform.
 */
export const DIFF_MAX_BYTES = 512 * 1024

/** How many lines of ONE file's diff a review node renders before "+N more". */
export const DIFF_MAX_LINES = 600

/**
 * An untracked file appears in no diff against a commit, so it is diffed
 * against /dev/null instead. `--no-index` exits 1 whenever it finds
 * differences — which is every successful call here — so the caller must
 * treat a non-zero exit as ordinary. verify:review 48.
 */
export function buildNewFileDiffArgs(root: string, path: string): string[] {
  return ['-C', root, 'diff', '--no-index', '--', '/dev/null', path]
}

/**
 * Unified diff text into classified lines.
 *
 * The ORDER of the tests is the whole function. '+++' and '---' are file
 * headers and must be matched BEFORE the single-character '+' and '-', or
 * every file header in every diff renders as an added or removed source
 * line. The remaining preamble git prints (`diff --git`, `index`, `new file
 * mode`, `similarity index`, `rename from/to`) is meta for the same reason,
 * and so is the '\' no-newline marker, which is a note ABOUT the file rather
 * than a line IN it.
 */
export function parseDiffLines(
  patch: string,
  maxLines: number = DIFF_MAX_LINES
): { lines: DiffLine[]; truncated: number } {
  const source = patch.length > DIFF_MAX_BYTES ? patch.slice(0, DIFF_MAX_BYTES) : patch
  // A trailing newline produces one empty final entry, which is not a line.
  const raw = source.split('\n')
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()
  const lines: DiffLine[] = []
  for (const text of raw.slice(0, maxLines)) {
    let kind: DiffLine['kind']
    if (text.startsWith('+++') || text.startsWith('---')) kind = 'meta'
    else if (text.startsWith('@@')) kind = 'hunk'
    else if (text.startsWith('+')) kind = 'add'
    else if (text.startsWith('-')) kind = 'del'
    else if (text.startsWith('\\')) kind = 'meta'
    else if (/^(diff --git|index |new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to)|Binary files )/.test(text)) kind = 'meta'
    else kind = 'context'
    lines.push({ kind, text })
  }
  return { lines, truncated: Math.max(0, raw.length - lines.length) }
}
```

- [ ] **Step 5: Split `review()` and add `fileDiff`**

In `review-engine.ts`, `ReviewEngine` gains the two members, and `review(panelId)` keeps only the part that is ABOUT a panel:

```ts
export interface ReviewEngine {
  resolveRepo(cwd: string): Promise<RepoAnswer>
  captureBaseline(root: string): Promise<string | null>
  /** The panel-addressed question: resolve this panel's baseline, then ask. */
  review(panelId: string): Promise<ReviewResult>
  /**
   * The baseline-addressed question, and the ONE a review node asks. It must
   * never consult baselineOf: main drops a panel's baseline on kill, and a
   * node has to keep answering after its subject is dismissed.
   */
  reviewAt(baseline: ReviewBaseline, subjectId: string): Promise<ReviewResult>
  fileDiff(req: ReviewDiffRequest): Promise<ReviewDiff>
}
```

`review()`'s tail — everything from the `cat-file -e` validation onward — moves into `reviewAt(baseline, subjectId)` verbatim, including all of its comments; `review()` ends with `return reviewAt(baseline, panelId)`. `peersInRepo(root, subjectId)` keeps excluding the asker, which is now explicitly the SUBJECT rather than incidentally the panel.

```ts
  const fileDiff = async (req: ReviewDiffRequest): Promise<ReviewDiff> => {
    if (gitMissing) return { kind: 'unavailable' }
    const result = req.untracked
      ? await run(buildNewFileDiffArgs(req.repoRoot, req.path))
      : await run(buildFileDiffArgs(req.repoRoot, req.baselineSha, req.path))
    // --no-index exits 1 precisely WHEN IT FINDS DIFFERENCES, which is the
    // expected outcome for every untracked file. Treating that as a failure
    // makes the feature broken for the commonest thing an agent produces,
    // while modified files keep working — the shape of bug nobody reports
    // because the app "mostly works". verify:review 48.
    const acceptable = result.ok || (req.untracked && result.code === 1)
    if (!acceptable) return { kind: 'unavailable' }
    // git's own report, and the only honest answer for it: there is nothing
    // to render, and rendering the sentence as source would be a lie about
    // the file's contents.
    if (/^Binary files .* differ$/m.test(result.stdout)) return { kind: 'binary' }
    const { lines, truncated } = parseDiffLines(result.stdout)
    return { kind: 'diff', lines, truncated }
  }
```

- [ ] **Step 6: Run the checks**

Run: `npm run verify:review && npm run typecheck:node`
Expected: 48 checks reported (41 + 7), all passing.

- [ ] **Step 7: Commit**

```bash
git add src/shared/review.ts src/main/git-args.ts src/main/review-engine.ts scripts/verify-review.cjs
git commit -m "feat(m9b): reviewAt, fileDiff, and the diff parser"
```

---

### Task 5: Three channels

**Files:**
- Modify: `src/shared/ipc-contract.ts`, `src/preload/index.ts`, `src/main/ipc.ts`
- Test: `scripts/verify-ipc-surface.cjs` (the count in its one check's label)

**Interfaces:**
- Consumes: `ReviewSubject`, `ReviewDiff`, `ReviewDiffRequest`, `ReviewBaseline`, `ReviewEngine.reviewAt`/`fileDiff`.
- Produces: `IPC.REVIEW_BASELINE = 'review:baseline'`, `IPC.REVIEW_AT = 'review:at'`, `IPC.REVIEW_DIFF = 'review:diff'`; bridge members `review.baseline(panelId): Promise<ReviewBaseline | null>`, `review.at(subject: ReviewSubject): Promise<ReviewResult>`, `review.diff(req: ReviewDiffRequest): Promise<ReviewDiff>`.

- [ ] **Step 1: Write the failing check**

`verify:ipc` is one check whose label carries the count. Update it and watch it fail before the channels exist — the count is the assertion here, so it has to be written first:

In `scripts/verify-ipc-surface.cjs`, the check's label is generated from `channels.length`; add the expectation explicitly beside it:

```js
  // M9b takes the surface to 30: review:baseline mints a node, review:at is
  // the node's own baseline-addressed query, review:diff is one file's hunks.
  const EXPECTED_CHANNELS = 30
  ok(`1 every contract channel has a main-process handler (${channels.length} channels)`,
    missing.length === 0 && channels.length === EXPECTED_CHANNELS,
    missing.length ? `unhandled: ${missing.join(', ')}` : `count=${channels.length}`)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run build && npm run verify:ipc`
Expected: FAIL with `count=27`.

- [ ] **Step 3: Declare the channels**

`src/shared/ipc-contract.ts`, beside `REVIEW_PANEL`:

```ts
  /**
   * This panel's stored baseline, or null. The renderer asks exactly once —
   * when a review node is created — and stores the answer IN the node, so
   * the node can keep asking review:at after main has dropped the panel's
   * baseline on kill. It is deliberately not a general read: nothing else in
   * the renderer has any business knowing a sha.
   */
  REVIEW_BASELINE: 'review:baseline',
  /**
   * The same question review:panel answers, addressed by BASELINE instead of
   * by panel id — which is the entire reason a review node can outlive its
   * subject. Two channels rather than one optional-argument channel, because
   * the two have different lifetimes and different failure arms: review:panel
   * can answer never-started and not-a-repo, and neither is reachable here.
   */
  REVIEW_AT: 'review:at',
  /** One file's hunks. Pull-only, one file at a time — see ReviewDiffRequest. */
  REVIEW_DIFF: 'review:diff'
```

and the bridge type:

```ts
  review: {
    panel(panelId: PanelId): Promise<ReviewResult>
    baseline(panelId: PanelId): Promise<ReviewBaseline | null>
    at(subject: ReviewSubject): Promise<ReviewResult>
    diff(req: ReviewDiffRequest): Promise<ReviewDiff>
  }
```

- [ ] **Step 4: Expose them in the preload**

```ts
  review: {
    panel: (panelId: PanelId) => ipcRenderer.invoke(IPC.REVIEW_PANEL, panelId),
    baseline: (panelId: PanelId) => ipcRenderer.invoke(IPC.REVIEW_BASELINE, panelId),
    at: (subject: ReviewSubject) => ipcRenderer.invoke(IPC.REVIEW_AT, subject),
    diff: (req: ReviewDiffRequest) => ipcRenderer.invoke(IPC.REVIEW_DIFF, req)
  },
```

- [ ] **Step 5: Handle them in main**

`src/main/ipc.ts`, beside the `REVIEW_PANEL` handler:

```ts
  // `?? null`, never undefined: an invoke's reply crosses a structured
  // clone, and `undefined` and "no such panel" would be the same value on
  // the far side of it — the absent-vs-present distinction this codebase
  // already guards for `command`.
  ipcMain.handle(IPC.REVIEW_BASELINE, (_event, panelId: PanelId) =>
    layoutStore.baseline(panelId) ?? null)

  // The subject is unpacked HERE rather than in the engine: the engine's
  // question is about a baseline and a subject id, and teaching it the
  // renderer's node shape would make it a second reader of a persisted type.
  ipcMain.handle(IPC.REVIEW_AT, (_event, subject: ReviewSubject) =>
    reviewEngine.reviewAt(
      { root: subject.repoRoot, sha: subject.baselineSha },
      subject.subjectId
    ))

  ipcMain.handle(IPC.REVIEW_DIFF, (_event, req: ReviewDiffRequest) =>
    reviewEngine.fileDiff(req))
```

- [ ] **Step 6: Run the check**

Run: `npm run build && npm run verify:ipc`
Expected: PASS, `1/1`, 30 channels.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/ipc.ts scripts/verify-ipc-surface.cjs
git commit -m "feat(m9b): review:baseline, review:at and review:diff"
```

---

### Task 6: The node's model

> **Superseded during execution (Task 7's review, fix round 1).**
> `reviewNodeSignature` was DELETED from `review-node-model.ts` and check 52 was
> retargeted to assert the model is a pure function of its inputs, with the
> serialization done test-side. The memo it was written for turned out to be
> inert: `built` and `sig` were computed unconditionally every render, nothing
> consumed the stabilized identity, and the signature itself serialised up to
> `DIFF_MAX_LINES` (600) line objects per frame during a drag — imposing the
> exact 60Hz cost it was meant to prevent. `rail-rows.ts` needs a signature
> because its rows are rebuilt from a freshly-mapped `panels` array every
> render; a review node's inputs are already identity-stable, so
> `useMemo(..., [subject, panel.title, result, expandedPath])` does the same
> job with no serialization. Read the `reviewNodeSignature` code and check-52
> text below as history, not as the shipped design.

**Files:**
- Create: `src/renderer/review/review-node-model.ts`
- Modify: `scripts/rail-entry.cjs`
- Test: `scripts/verify-rail.cjs` (48–52)

The node's model is a SECOND reader of `ReviewResult` beside `buildReviewFields`, and that is deliberate rather than duplication: the two disagree about the one decision that matters. The inspector HIDES `not-a-repo` and an unresolved query, because it is a 260px pane the user did not ask for and a permanent placeholder there teaches them to stop reading it. A node is a panel the user deliberately opened, so it must always render something — a node that renders nothing is indistinguishable from a broken app. Everything the two DO agree on (the plural-file summary, the counts) is shared through the exported helpers below rather than written twice.

**Interfaces:**
- Consumes: `ReviewResult`, `ReviewSubject`, `ReviewDiff` from `@shared/review`.
- Produces: `NODE_FILE_CAP = 60`; `ReviewNodeRow { path: string; added: number; removed: number; binary: boolean; untracked: boolean; expanded: boolean }`; `ReviewNodeModel { heading: string; root: string; summary: string; note?: string; files: ReviewNodeRow[]; more: number }`; `buildReviewNodeModel(input: { subject: ReviewSubject; title?: string; result: ReviewResult | undefined; expandedPath: string | null }): ReviewNodeModel`; `reviewNodeSignature(model: ReviewNodeModel, diff: ReviewDiff | null): string`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-rail.cjs`:

```js
const SUBJ = { subjectId: 'n4', repoRoot: '/tmp/repo', baselineSha: 'abc', label: 'claude' }
const nodeModel = (result, expandedPath = null, title) =>
  R.buildReviewNodeModel({ subject: SUBJ, title, result, expandedPath })

// 48. An UNRESOLVED query still renders. This is the first of the two places
//     the node deliberately disagrees with the inspector: buildReviewFields
//     returns HIDDEN for `undefined`, because the pane flickers through that
//     state on every selection change. A node is a panel the user opened on
//     purpose, and one that renders nothing while its invoke is in flight is
//     indistinguishable from one that is broken.
{
  const m = nodeModel(undefined)
  ok('48 an in-flight query still renders a heading and a summary',
    m.heading.includes('claude') && m.summary !== '' && m.files.length === 0)
}

// 49. THE ONE TO KNOW BY NUMBER. not-a-repo is HIDDEN in the pane and
//     RENDERED in the node, and both halves are asserted in one condition —
//     asserting only the node half passes against an implementation that
//     simply called buildReviewFields and ignored `hidden`, which is the
//     obvious "don't repeat yourself" move and is wrong: it would render a
//     deliberately-opened panel as an empty box.
ok('49 not-a-repo: hidden in the pane, rendered in the node',
  R.buildReviewFields({ kind: 'not-a-repo' }).hidden === true &&
    nodeModel({ kind: 'not-a-repo' }).summary !== '')

// 50. Exactly one row is expanded, and it is the one named. `expanded` lives
//     on the ROW rather than as a separate id on the model so the view can
//     render without a second lookup — and so a path that is no longer in
//     the list (the file was reverted between queries) expands nothing at
//     all rather than leaving a dangling open panel.
{
  const result = { kind: 'changes', root: '/r', added: 4, removed: 1, files: [
    { path: 'a.ts', added: 3, removed: 1, binary: false, untracked: false },
    { path: 'b.ts', added: 1, removed: 0, binary: false, untracked: false }
  ] }
  const m = nodeModel(result, 'b.ts')
  const gone = nodeModel(result, 'deleted.ts')
  ok('50 exactly the named row is expanded',
    m.files[0].expanded === false && m.files[1].expanded === true &&
      gone.files.every((f) => f.expanded === false))
}

// 51. The node's cap is its own, and it is LARGER than the pane's: the node
//     is a scroll host in world space, the 260px inspector is not. Sharing
//     REVIEW_FILE_CAP would silently truncate a review of a large change to
//     ten files, which is the omission this feature's honest-degradation
//     rule forbids — so `more` reports the remainder either way.
{
  const files = Array.from({ length: R.NODE_FILE_CAP + 5 }, (_, i) =>
    ({ path: `f${i}.ts`, added: 1, removed: 0, binary: false, untracked: false }))
  const m = nodeModel({ kind: 'changes', root: '/r', added: 65, removed: 0, files })
  ok('51 the node caps at its own, larger cap and reports the rest',
    R.NODE_FILE_CAP > R.REVIEW_FILE_CAP && m.files.length === R.NODE_FILE_CAP && m.more === 5)
}

// 52. The 60Hz defence, in the shape this surface needs it. Canvas re-renders
//     on every mousemove and every frame of a drag, and a review node holds
//     up to 600 lines of diff text — so the node's own memo has to be able
//     to see "nothing about what I render changed". Three movers, because an
//     implementation that hashed only the file list passes the first clause.
{
  const result = { kind: 'changes', root: '/r', added: 1, removed: 0, files: [
    { path: 'a.ts', added: 1, removed: 0, binary: false, untracked: false }] }
  const diff = { kind: 'diff', truncated: 0, lines: [{ kind: 'add', text: '+x' }] }
  const a = R.reviewNodeSignature(nodeModel(result), diff)
  const b = R.reviewNodeSignature(nodeModel(result), diff)
  const expanded = R.reviewNodeSignature(nodeModel(result, 'a.ts'), diff)
  const otherDiff = R.reviewNodeSignature(nodeModel(result), { kind: 'binary' })
  const renamed = R.reviewNodeSignature(nodeModel(result, null, 'my review'), diff)
  ok('52 the signature is stable, and moves on expansion, diff and title',
    a === b && expanded !== a && otherDiff !== a && renamed !== a)
}
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm run verify:rail`
Expected: 48 throws on `R.buildReviewNodeModel is not a function`, ending the run. Comment 48 out to watch 49–52 fail, then restore.

- [ ] **Step 3: Export the module from the rail bundle**

`scripts/rail-entry.cjs` — widen its header comment from "the shell's pure row modules" to "the shell's and the canvas's pure view models", and add:

```js
  /* M9b: the review node's model is a canvas module rather than a shell one,
     and it joins this bundle anyway for the reason M8c's inspector fields and
     M8d's rail sections both did — it is pure (no React, no DOM, type-only
     imports), and a suite of its own would re-prove the same esbuild wiring
     for one file. */
  ...require('../src/renderer/review/review-node-model')
```

- [ ] **Step 4: Write the model**

`src/renderer/review/review-node-model.ts`:

```ts
import type { ReviewDiff, ReviewResult, ReviewSubject } from '@shared/review'

/**
 * A review node's rendered content, as plain data.
 *
 * A SECOND reader of ReviewResult beside inspector-fields.ts's
 * buildReviewFields, and the split is deliberate. The two differ on exactly
 * one decision and it is the important one: the pane HIDES itself for
 * `not-a-repo` and for an unresolved query, because it is a 260px column the
 * user did not ask for and a permanent placeholder there teaches them to stop
 * reading it. A node is a panel the user deliberately opened — an empty one
 * reads as a broken app, not as an honest absence. Everything else the two
 * agree about is shared, not copied: this module imports nothing from the
 * pane, but both spell the same summary through the same rules below, and a
 * change to one is a change to review the other against.
 */

/**
 * Sixty, against the pane's ten. The node is a scroll host in world space and
 * the pane is a fixed 260px column, so the cap that keeps one honest starves
 * the other: ten files is a truncated review of any real agent's work, and
 * `more` reports the remainder in both.
 */
export const NODE_FILE_CAP = 60

export interface ReviewNodeRow {
  path: string
  added: number
  removed: number
  binary: boolean
  untracked: boolean
  /**
   * On the ROW, not as a separate id on the model, so the view renders in one
   * pass — and so an expanded path that is no longer in the list (the file was
   * reverted between two queries) expands nothing rather than leaving an open
   * body attached to a row that is gone.
   */
  expanded: boolean
}

export interface ReviewNodeModel {
  heading: string
  root: string
  summary: string
  /** The honest arms' explanation. Absent when there is nothing to explain. */
  note?: string
  files: ReviewNodeRow[]
  more: number
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function buildReviewNodeModel(input: {
  subject: ReviewSubject
  /** The user's own name for the NODE, if they renamed it. */
  title?: string
  result: ReviewResult | undefined
  expandedPath: string | null
}): ReviewNodeModel {
  const { subject, title, result, expandedPath } = input
  // The same shape as railLabel's honest chain: the user's own name outranks
  // everything, and the fallback names the SUBJECT rather than the node,
  // because "review" alone tells nobody which agent's work this is. The label
  // is the snapshot taken at creation — the subject panel may be gone.
  const heading = title ?? `review: ${subject.label}`
  const root = subject.repoRoot

  if (result === undefined) {
    return { heading, root, summary: 'reading…', files: [], more: 0 }
  }
  switch (result.kind) {
    case 'never-started':
      return { heading, root, summary: 'nothing yet', note: 'this panel had no session when the review was opened', files: [], more: 0 }
    case 'not-a-repo':
      // RENDERED here, hidden in the pane. See this module's own header.
      return { heading, root, summary: 'no repository', note: 'this panel was not spawned inside a git repository', files: [], more: 0 }
    case 'git-missing':
      return { heading, root, summary: 'unavailable', note: 'no git binary was found', files: [], more: 0 }
    case 'repo-unreadable':
      return { heading, root, summary: 'unavailable', note: `git could not open this repository — ${result.detail}`, files: [], more: 0 }
    case 'baseline-lost':
      return { heading, root, summary: 'unattributable', note: 'this repository could not be read against its baseline', files: [], more: 0 }
    case 'clean':
      // NOT an empty render: a panel that genuinely changed nothing and one
      // the feature is broken for must not look the same.
      return { heading, root, summary: 'no changes', files: [], more: 0 }
    default:
      break
  }

  const rows: ReviewNodeRow[] = result.files.slice(0, NODE_FILE_CAP).map((f) => ({
    path: f.path,
    added: f.added,
    removed: f.removed,
    binary: f.binary,
    untracked: f.untracked,
    expanded: f.path === expandedPath
  }))
  const more = Math.max(0, result.files.length - NODE_FILE_CAP)
  if (result.kind === 'shared') {
    return {
      heading,
      root,
      summary: `${plural(result.files.length, 'file')} changed`,
      note: `${result.panelCount} panels share this repo — changes can't be attributed`,
      files: rows,
      more
    }
  }
  return {
    heading,
    root,
    summary: `${plural(result.files.length, 'file')} changed · +${result.added} −${result.removed}`,
    files: rows,
    more
  }
}

/**
 * The same 60Hz defence railSignature and inspectorSignature give their own
 * surfaces, and the node needs it more than either: Canvas re-renders on every
 * mousemove over the canvas and on every frame of a drag, and a node holds up
 * to DIFF_MAX_LINES lines of text inside .world, where the browser is also
 * applying the canvas transform to all of it.
 *
 * The DIFF is part of the signature rather than a second one, because it is
 * part of what this surface renders — the split inspectorSignature made
 * (model and review on different clocks) does not apply here, where one memo
 * guards both. JSON.stringify for the reason railSignature gives: a path and
 * a diff line are user text, and a hand-rolled separator is one a file name
 * is free to contain.
 */
export function reviewNodeSignature(model: ReviewNodeModel, diff: ReviewDiff | null): string {
  return JSON.stringify([model, diff])
}
```

- [ ] **Step 5: Run the checks**

Run: `npm run verify:rail`
Expected: PASS, 52 numbered checks reported (45 existing + 46/47 from Task 3 + 48–52).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/review/review-node-model.ts scripts/rail-entry.cjs scripts/verify-rail.cjs
git commit -m "feat(m9b): the review node's model, and why it is not the pane's"
```

---

### Task 7: The node on the canvas

> **Superseded during execution (Task 7's review, fix round 1).**
> `reviewNodeSignature` was DELETED from `review-node-model.ts` and check 52 was
> retargeted to assert the model is a pure function of its inputs, with the
> serialization done test-side. The memo it was written for turned out to be
> inert: `built` and `sig` were computed unconditionally every render, nothing
> consumed the stabilized identity, and the signature itself serialised up to
> `DIFF_MAX_LINES` (600) line objects per frame during a drag — imposing the
> exact 60Hz cost it was meant to prevent. `rail-rows.ts` needs a signature
> because its rows are rebuilt from a freshly-mapped `panels` array every
> render; a review node's inputs are already identity-stable, so
> `useMemo(..., [subject, panel.title, result, expandedPath])` does the same
> job with no serialization. Read the `reviewNodeSignature` code and check-52
> text below as history, not as the shipped design.

**Files:**
- Create: `src/renderer/review/ReviewNode.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`, `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (102–104)

**Interfaces:**
- Consumes: `ReviewPanel`, `isReviewPanel` (Task 1); `buildReviewNodeModel`, `reviewNodeSignature`, `NODE_FILE_CAP` (Task 6); `window.canvas.review.at/diff` (Task 5).
- Produces: `ReviewNode` (memo'd component) with props `{ panel: ReviewPanel; selected: boolean; onSelect(id: string): void; onFocus(id: string): void; onBeginDrag(state: DragState): void; onClose(id: string): void }`.

- [ ] **Step 1: Write the failing checks**

These go INSIDE `verify-panels.cjs`'s existing `if (GIT)` review block, after check 101 and **before** its two `rmSync` cleanups — the repository fixture those lines delete is the one these checks review. Move the cleanup down; do not build a second repository.

```js
      /* A review node is seeded through DISK + RELOAD rather than through a
         gesture, and deliberately: the creation gesture is Task 9's subject,
         and a node that can only exist because a button worked would make
         these three checks fail for that button's reasons. The route is the
         one checks 39 and 84 already use for a dormant panel — append to the
         saved canvas, reload, read what came back. It needs a REAL baseline
         sha, so it asks main for the subject panel's own. */
      const seedReviewNode = async (subjectId, nodeId) => {
        const baseline = await wc.executeJavaScript(
          `window.canvas.review.baseline(${JSON.stringify(subjectId)})`)
        if (!baseline) return null
        const saved = layoutStore.initial()
        const panels = saved.panels.concat([{
          id: nodeId, x: 60000, y: 0, w: 640, h: 520, z: 99, kind: 'review',
          subject: { subjectId, repoRoot: baseline.root, baselineSha: baseline.sha, label: 'claude' }
        }])
        // Camera parked ON the node, so it is rendered rather than culled:
        // a review node is never promoted (it has no tier at all), but it is
        // still an ordinary DOM child of .world and still only rendered when
        // the canvas is looking at it.
        layoutStore.save({ panels, camera: { x: -60000 + 200, y: 100, scale: 1 },
          selectedId: null, focusedId: null })
        layoutStore.flushSync()
        wc.reload()
        await waitFor(wc, '.review-node', 10000)
        return nodeId
      }
      const xtermCount = () => wc.executeJavaScript(
        `document.querySelectorAll('.xterm').length`)
      const beforeXterms = await xtermCount()
      const node = first ? await seedReviewNode(first, 'r90') : null

      // 102. The node renders REAL content — the file its subject's agent
      //      actually wrote, read through review:at with no panel id
      //      involved — and there is no terminal machinery underneath it.
      //      Both halves in one read: a node that rendered a file list AND
      //      an empty xterm host would satisfy either half alone, and the
      //      empty host is precisely what a copy-pasted TerminalPanel gives.
      {
        const body = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"]')
          if (!n) return null
          return {
            summary: (n.querySelector('[data-review-node-summary]') || {}).textContent || '',
            files: [...n.querySelectorAll('[data-review-node-file]')]
              .map((e) => e.getAttribute('data-review-node-file')),
            slots: n.querySelectorAll('.panel__slot').length,
            xterms: n.querySelectorAll('.xterm').length
          } })()`)
        ok('102 a review node renders its subject\'s files and no terminal',
          node !== null && body !== null && body.files.includes('agent.txt') &&
            body.summary.includes('file') && body.slots === 0 && body.xterms === 0,
          JSON.stringify(body))
      }

      // 103. THE ONE TO KNOW BY NUMBER — success criterion 4's teeth. The
      //      node holds no PanelSession and consumes no WebGL context, and
      //      both are asserted against the registry and the DOM rather than
      //      argued from the code. The xterm count is compared to the count
      //      BEFORE the node existed, because "the node has no xterm" (102)
      //      is satisfied by an implementation that quietly promoted some
      //      OTHER panel to pay for it.
      {
        const sessions = await sessionMap(wc)
        const afterXterms = await xtermCount()
        ok('103 a review node has no session and costs no WebGL context',
          node !== null && sessions.has('r90') === false && afterXterms <= beforeXterms,
          `xterms ${beforeXterms} -> ${afterXterms}`)
      }

      // 104. It is a child of .world, which is what makes semantic zoom free
          //  rather than a feature: it pans and zooms with the panel it
          //  reviews. Asserted as a real camera move changing its screen
          //  position, not merely as a CSS ancestor — a node re-parented to
          //  the screen-space chrome layer would still match a selector and
          //  would sit still while the canvas moved under it.
      {
        const boxOf = () => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"]')
          return n ? n.getBoundingClientRect().left : null })()`)
        const inWorld = await wc.executeJavaScript(
          `document.querySelector('.world .review-node[data-panel-id="r90"]') !== null`)
        const before = await boxOf()
        await panBy(wc, 120, 0)
        await settle(wc)
        const after = await boxOf()
        ok('104 the node lives in .world and moves with the camera',
          inWorld === true && before !== null && after !== null && Math.abs(after - before) > 50,
          `${before} -> ${after}`)
      }
```

If `waitFor`, `panBy` or `settle` are named differently in this harness, use its existing helpers — do not add new ones.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: 102 fails on `body === null` (nothing renders `.review-node`), 103 passes VACUOUSLY (`node === null` makes it false — check it reports FAIL, not a false pass), 104 fails. If the seeded panel instead disappears from the canvas entirely, Task 2's parse is wrong and belongs fixed there, not here.

- [ ] **Step 3: Write the node**

`src/renderer/review/ReviewNode.tsx`:

```tsx
import { memo, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { ReviewPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { ReviewDiff, ReviewResult } from '@shared/review'
import { useAgentState } from '@renderer/session/agent-state-store'
import { buildReviewNodeModel, reviewNodeSignature } from './review-node-model'

export interface ReviewNodeProps {
  panel: ReviewPanel
  selected: boolean
  onSelect: (id: string) => void
  /**
   * The same onFocus a terminal panel's body calls. Focus here buys one
   * thing and costs nothing: shouldYieldWheel's rule 3 gives the wheel to
   * the FOCUSED panel, so an unfocused node would pan the canvas instead of
   * scrolling its diff. It costs nothing because assignTiers never sees this
   * panel at all — a focused id that names no rect consumes no LIVE_BUDGET
   * slot, which is exactly what the partition in Canvas.tsx guarantees.
   */
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
}

/**
 * One review node, in world space.
 *
 * It owns its OWN query, rather than receiving a result from Canvas, for the
 * reason RailPanelRow owns its own agent-state subscription: a canvas can
 * hold several nodes, and lifting their queries into Canvas would make every
 * node's refresh a Canvas re-render — the 60Hz cascade the memo architecture
 * exists to prevent, arriving through a new door.
 *
 * It reuses the `.panel` class deliberately. Drag, resize, selection, the
 * pointer corrector and shouldYieldWheel's `closest('.panel')` all key off
 * that class and `data-panel-id`; a private class name here would mean four
 * surfaces each growing a second case for a panel that is a panel in every
 * way that matters to them.
 */
function ReviewNodeImpl({
  panel, selected, onSelect, onFocus, onBeginDrag, onClose
}: ReviewNodeProps): JSX.Element {
  const { subject } = panel
  const [result, setResult] = useState<ReviewResult | undefined>(undefined)
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [diff, setDiff] = useState<ReviewDiff | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  // review:at, never review:panel: the node asks about a BASELINE it stores,
  // so it keeps answering after main has dropped the subject panel's own
  // baseline on kill. See ReviewSubject in shared/review.ts.
  useEffect(() => {
    let live = true
    void window.canvas.review.at(subject).then((r) => { if (live) setResult(r) })
    return () => { live = false }
  }, [subject, refreshToken])

  // The subject's agent going quiet is the one signal worth re-reading on —
  // the same choice Canvas's inspector query makes, and for the same reason
  // IPC.REVIEW_PANEL's own comment gives: `idle` means "this agent stopped
  // producing output". A COUNTER of arrivals rather than the state itself,
  // so leaving idle does not fire a second round of git processes. The
  // subject may be gone entirely, in which case this is simply never true.
  const subjectState = useAgentState(subject.subjectId)
  const prevStateRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = subjectState
    if (subjectState === 'idle' && prev !== 'idle') setRefreshToken((n) => n + 1)
  }, [subjectState])

  // One file at a time. Fetching every file's hunks up front is megabytes of
  // text inside .world for a node the user may only glance at.
  useEffect(() => {
    if (expandedPath === null) { setDiff(null); return }
    const row = result !== undefined && (result.kind === 'changes' || result.kind === 'shared')
      ? result.files.find((f) => f.path === expandedPath)
      : undefined
    let live = true
    setDiff(null)
    void window.canvas.review.diff({
      repoRoot: subject.repoRoot,
      baselineSha: subject.baselineSha,
      path: expandedPath,
      untracked: row?.untracked === true
    }).then((d) => { if (live) setDiff(d) })
    return () => { live = false }
  }, [expandedPath, subject, result])

  const built = buildReviewNodeModel({ subject, title: panel.title, result, expandedPath })
  const sig = reviewNodeSignature(built, diff)
  // Frozen on the signature for the reason Canvas freezes inspectorModel:
  // this component re-renders whenever Canvas hands it a new `panel` object
  // — every frame of a drag — and rebuilding up to DIFF_MAX_LINES worth of
  // rendered rows for a rect change is the cost this whole architecture
  // exists to refuse.
  const model = useMemo(() => built, [sig])
  const { rect, z } = panel

  return (
    <div
      className={`panel review-node${selected ? ' panel--selected' : ''}`}
      data-panel-id={rect.id}
      data-review-node
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }}
    >
      <header
        className="panel__chrome"
        onMouseDown={(event: ReactMouseEvent) => {
          event.stopPropagation()
          event.preventDefault()
          onSelect(rect.id)
          onBeginDrag({
            panelId: rect.id,
            mode: { kind: 'move' },
            originRect: rect,
            originWorld: { x: event.clientX, y: event.clientY }
          })
        }}
      >
        <span className="panel__title">{model.heading}</span>
        <button
          type="button"
          className="review-node__refresh"
          title="Read this repository again"
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            setRefreshToken((n) => n + 1)
          }}
        >
          ⟳
        </button>
        {/* No arming step, unlike a terminal panel's ×: there is no process
            to lose. Closing a review node throws away a query, and the same
            button reopens it. */}
        <button
          type="button"
          className="panel__close"
          title="Close this review"
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onClose(rect.id)
          }}
        >
          ×
        </button>
      </header>

      <div
        className="review-node__body"
        // The marker shouldYieldWheel looks for. It is an ATTRIBUTE on the
        // element that actually scrolls, so "does this panel own its wheel"
        // is answered by what the KIND renders rather than by a branch inside
        // the predicate — see Canvas.tsx's rule 3.
        data-scroll-host
        onMouseDown={(event) => {
          event.stopPropagation()
          onFocus(rect.id)
        }}
      >
        <p className="review-node__summary" data-review-node-summary>{model.summary}</p>
        <p className="review-node__root">{model.root}</p>
        {model.note !== undefined && (
          <p className="review-node__note" data-review-node-note>{model.note}</p>
        )}
        <ul className="review-node__files">
          {model.files.map((f) => (
            <li key={f.path} className="review-node__file" data-review-node-file={f.path}>
              <button
                type="button"
                className={`review-node__file-button${f.expanded ? ' review-node__file-button--open' : ''}`}
                onMouseDown={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  onFocus(rect.id)
                  setExpandedPath(f.expanded ? null : f.path)
                }}
              >
                <span className="review-node__path">{f.path}</span>
                <span className="review-node__counts">
                  {f.untracked ? 'new' : f.binary ? 'bin' : `+${f.added} −${f.removed}`}
                </span>
              </button>
              {f.expanded && <Hunks diff={diff} />}
            </li>
          ))}
        </ul>
        {model.more > 0 && <p className="review-node__more">+{model.more} more files</p>}
      </div>

      {(['e', 's', 'se'] as const).map((edge) => (
        <div
          key={edge}
          className={`panel__resize panel__resize--${edge}`}
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onSelect(rect.id)
            onBeginDrag({
              panelId: rect.id,
              mode: { kind: 'resize', edge },
              originRect: rect,
              originWorld: { x: event.clientX, y: event.clientY }
            })
          }}
        />
      ))}
    </div>
  )
}

/**
 * `null` is "still reading", which is a different sentence from
 * `unavailable` — and both are different from an empty diff, which this
 * component can never render, because review-engine.ts refuses to produce
 * one (see fileDiff's own comment).
 */
function Hunks({ diff }: { diff: ReviewDiff | null }): JSX.Element {
  if (diff === null) return <p className="review-node__hunk-note">reading…</p>
  if (diff.kind === 'binary') return <p className="review-node__hunk-note">binary file</p>
  if (diff.kind === 'unavailable') return <p className="review-node__hunk-note">this diff could not be read</p>
  return (
    <div className="review-node__hunks" data-review-node-hunks>
      {diff.lines.map((line, i) => (
        <div className={`review-node__line review-node__line--${line.kind}`} key={i}>{line.text}</div>
      ))}
      {diff.truncated > 0 && (
        <div className="review-node__hunk-note">+{diff.truncated} more lines</div>
      )}
    </div>
  )
}

export const ReviewNode = memo(ReviewNodeImpl)
```

- [ ] **Step 4: Partition the canvas**

In `Canvas.tsx`:

```tsx
  // Hit testing and the pip layer keep the WHOLE array: a review node is a
  // real, clickable panel and an off-screen one is a real thing to point at.
  const rects = useMemo(() => panels.map((p) => p.rect), [panels])

  /**
   * Tiering's input, and the reason a review node cannot take a LIVE_BUDGET
   * slot or a WebGL context: it is not in the array assignTiers is given, so
   * the guarantee is structural rather than a rule assignTiers has to obey.
   * The same filter gates registry.ensure below — a review node has no spec
   * to ensure with, and minting a PanelSession for one would put a terminal
   * in the map with nothing to run in it.
   */
  const terminalPanels = useMemo(() => panels.filter((p) => !isReviewPanel(p)), [panels])
  const terminalRects = useMemo(() => terminalPanels.map((p) => p.rect), [terminalPanels])
```

- the tiering effect takes `rects: terminalRects` and depends on `terminalRects` in place of `rects`;
- the `registry.ensure` memo iterates `terminalPanels`;
- `onClosePanel` branches BEFORE it disposes:

```tsx
  const onClosePanel = useCallback((id: string) => {
    // A review node owns no session, so it is dropped from the array and
    // nothing else. This is NOT a sixth registry.dispose call site and must
    // not become one: dispose(id) sends pty.kill even for an id this
    // renderer holds no session for (see CLAUDE.md), so routing a review
    // node through it would send a tmux kill-session for a panel that never
    // had one — and, worse, drop the baseline of whatever panel later
    // recycles that id.
    if (panelsRef.current.some((p) => p.rect.id === id && isReviewPanel(p))) {
      setPanels((current) => { const next = removePanel(current, id); commitHistory(next); return next })
      if (selectedId === id) setSelectedId(null)
      return
    }
    // …the existing terminal path, unchanged…
  }, [/* existing deps */])
```

- the render map branches:

```tsx
          {panels.map((panel) => {
            if (isReviewPanel(panel)) {
              return (
                <ReviewNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={panel.rect.id === selectedId}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                />
              )
            }
            const session = registry.get(panel.rect.id)
            if (!session) return null
            return (<TerminalPanel /* …unchanged… */ />)
          })}
```

Note `onSelect={selectAndRaise}` rather than `onSelectPanel`: `onSelectPanel` clears the dormant id and calls `registry.wake`, which is meaningless for a node and would be a wake path reached by clicking something that is not a panel with a process. This is the same distinction "The rail navigates; only the start control wakes" already draws.

- [ ] **Step 5: Style it**

`src/renderer/styles.css`, after the `.panel` rules:

```css
/* A review node reuses .panel for its box, its chrome and its resize
   handles — see ReviewNode.tsx — and adds only what a scrollable text body
   needs. The body is the ONE element carrying data-scroll-host, which is
   what gives this kind the wheel over itself. */
.review-node__body {
  flex: 1;
  min-height: 0;          /* or the list refuses to shrink and the box overflows */
  overflow-y: auto;
  padding: 8px 10px;
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--fg-dim);
  background: var(--panel-bg);
}
.review-node__summary { margin: 0 0 2px; color: var(--fg); }
.review-node__root { margin: 0 0 8px; opacity: 0.6; word-break: break-all; }
.review-node__note { margin: 0 0 8px; color: var(--warn); }
.review-node__files { list-style: none; margin: 0; padding: 0; }
.review-node__file-button {
  display: flex; width: 100%; gap: 8px; justify-content: space-between;
  padding: 3px 4px; border: 0; border-radius: 3px;
  background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.review-node__file-button:hover,
.review-node__file-button--open { background: var(--row-hover); }
.review-node__path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.review-node__counts { flex: none; opacity: 0.7; }
.review-node__hunks { margin: 2px 0 8px; padding: 4px 0; border-left: 2px solid var(--border); }
.review-node__line { padding: 0 6px; white-space: pre; }
/* Added/removed/context only. Syntax highlighting is a tokenizer for N
   languages, which is a dependency and a milestone of its own — the spec's
   own out-of-scope line. */
.review-node__line--add { color: var(--ok); background: rgba(63, 185, 80, 0.08); }
.review-node__line--del { color: var(--error); background: rgba(248, 81, 73, 0.08); }
.review-node__line--hunk { color: var(--accent); opacity: 0.9; }
.review-node__line--meta { opacity: 0.5; }
.review-node__hunk-note, .review-node__more { margin: 4px; opacity: 0.6; }
.review-node__refresh {
  border: 0; background: none; color: inherit; cursor: pointer; opacity: 0.7;
}
```

Use the repository's existing custom-property names — read the `:root` block at the top of `styles.css` and substitute; do not introduce new colour variables.

- [ ] **Step 6: Run the checks**

Run: `npm run build && npm run verify:panels`
Expected: 102, 103, 104 PASS; every earlier check still green — particularly 1, 3, 8, 15 (the seed-panel tiering checks), which the partition touches.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/review/ReviewNode.tsx src/renderer/canvas/Canvas.tsx src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m9b): the review node on the canvas, outside tiering"
```

---

### Task 8: The wheel rule, generalized

`shouldYieldWheel`'s rule 3 is "a wheel over the focused **terminal** scrolls that terminal", and it asks the question by looking for `.panel__slot`. A review node owns a scrollable diff and needs the same yield, or scrolling a long diff pans the camera instead — the palette bug M6p fixed, one surface over. The spec is explicit that this must be a property of the KIND rather than an `if` inside the predicate: `shouldYieldWheel` is documented as the sole authority on wheel ownership, and its whole recorded history is about a conjunction that could only ever narrow what it said.

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx` (rule 3), `src/renderer/components/TerminalPanel.tsx` (the slot's marker)
- Test: `scripts/verify-panels.cjs` (105)

**Interfaces:**
- Consumes: the `data-scroll-host` attribute `ReviewNode`'s body already carries (Task 7).
- Produces: nothing new; rule 3 becomes attribute-driven.

- [ ] **Step 1: Write the failing check**

```js
      // 105. A wheel over a FOCUSED review node's body is left uncancelled
      //      (the browser scrolls the diff) and moves no camera, while the
      //      same wheel over the canvas background still pans — the two
      //      halves check 47 already pins for the palette, on a second
      //      surface. Cancellation, not scrollTop: a synthetic WheelEvent is
      //      untrusted and Chromium performs no default action for one, so a
      //      scrollTop assertion would fail the correct implementation. The
      //      camera clause is what makes it more than a tautology.
      {
        const focused = await wc.executeJavaScript(`(() => {
          const body = document.querySelector('.review-node[data-panel-id="r90"] .review-node__body')
          if (!body) return null
          body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        await settle(wc)
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        const cancelled = await wc.executeJavaScript(`(() => {
          const body = document.querySelector('.review-node[data-panel-id="r90"] .review-node__body')
          const e = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
          return body.dispatchEvent(e) === false })()`)
        await settle(wc)
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        ok('105 a wheel over a focused review node is the node\'s, not the camera\'s',
          focused === true && cancelled === false && after.x === before.x && after.y === before.y,
          `cancelled=${cancelled} ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL with `cancelled=true` and a moved camera — rule 3 finds no `.panel__slot` in a review node, so the wheel is the camera's.

- [ ] **Step 3: Mark the terminal's slot**

`TerminalPanel.tsx`, on the live slot's `div`: add `data-scroll-host` beside `className="panel__slot"`, with:

```tsx
          // The marker shouldYieldWheel's rule 3 looks for. It is on the SLOT
          // rather than on .panel because a carded panel has no terminal to
          // hand a wheel to — the "requiring the slot" clause rule 3 already
          // documented, now expressed as a fact each kind states about itself.
```

- [ ] **Step 4: Generalize rule 3**

`Canvas.tsx`, replacing the final two lines of `shouldYieldWheel`:

```ts
    // 3. A wheel belongs to a PANEL only when it is over the FOCUSED one AND
    // that panel owns internal scroll. Which panels do is answered by the
    // KIND, through what it renders: a live terminal's slot and a review
    // node's diff body both carry data-scroll-host, and a card carries
    // nothing. Deliberately NOT an `if (panel.kind === …)` here — this
    // predicate is the sole authority on wheel ownership, and every future
    // kind that scrolls would otherwise mean editing it again, in a function
    // whose whole recorded history is about how easily it can be narrowed
    // by accident.
    //
    // The old test was `.panel__slot`, which was this same question asked in
    // terminal-only vocabulary: a restored focusedId can name a panel lod.ts
    // still refuses to promote (dormancy beats focus), and a card has no
    // xterm to hand the event to — yielding there means the wheel reaches
    // nothing at all and the app reads as frozen.
    return panel.querySelector('[data-scroll-host]') !== null
```

- [ ] **Step 5: Run the check**

Run: `npm run build && npm run verify:panels`
Expected: 105 PASSes, and check 12 (the three-part terminal wheel check) is still green — it is the regression guard for the rewrite.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx src/renderer/components/TerminalPanel.tsx scripts/verify-panels.cjs
git commit -m "fix(m9b): the wheel goes to the focused panel that owns scroll"
```

---

### Task 9: Opening a review

**Files:**
- Modify: `src/renderer/palette/commands.ts`, `src/renderer/canvas/Canvas.tsx`, `src/renderer/shell/Inspector.tsx`
- Test: `scripts/verify-palette.cjs` (67–68), `scripts/verify-panels.cjs` (106–107)

**Interfaces:**
- Consumes: `makeReviewPanel`, `reviewCentre` (Task 1); `window.canvas.review.baseline` (Task 5); `railLabel` (existing).
- Produces: `PaletteActions.openReview(subjectId: string): void`; the `panel.review` Command row; `InspectorProps.onOpenReview: (id: string) => void`.

- [ ] **Step 1: Write the failing palette checks**

```js
// 67. The Open review row is present, enabled, and aimed at the CAPTURED
//     panel rather than the focused one — the rule panel.rename and
//     panel.restart already obey, because opening the palette moves DOM
//     focus to its input and deliberately leaves focusedId alone.
{
  const rows = R.buildCommands({ ...base, panels: [
    { id: 'n1', label: 'claude', restartable: true },
    { id: 'n2', label: 'zsh', restartable: true }
  ], capturedId: 'n2' })
  const row = rows.find((r) => r.id === 'panel.review')
  let target = null
  if (row) { row.run(); target = actions.lastOpenReview }
  ok('67 the review row is enabled and aimed at the captured panel',
    row !== undefined && row.disabledReason === undefined && target === 'n2')
}

// 68. Disabled — not absent — for a panel that never started, and for no
//     capture at all, with the two DISTINCT reasons check 66b already
//     establishes the rule for. A panel with no session has no baseline, so
//     there is nothing to review against: "start this panel" and "click a
//     panel" are two situations with two different fixes. Compared against
//     the EXPORTED constants, never string literals, which would keep
//     passing while the text the user reads said something else.
{
  const never = R.buildCommands({ ...base, panels: [{ id: 'n1', label: 'zsh', restartable: false }], capturedId: 'n1' })
    .find((r) => r.id === 'panel.review')
  const none = R.buildCommands({ ...base, panels: [{ id: 'n1', label: 'zsh', restartable: true }], capturedId: null })
    .find((r) => r.id === 'panel.review')
  ok('68 review is disabled with two distinct reasons',
    never !== undefined && never.disabledReason === R.REASON_NOT_STARTED &&
      none !== undefined && none.disabledReason === R.REASON_NO_FOCUS &&
      R.REASON_NOT_STARTED !== R.REASON_NO_FOCUS)
}
```

Use whatever the suite's existing `base`/`actions` fixture helpers are called; add `openReview: (id) => { actions.lastOpenReview = id }` to the fake actions object.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run verify:palette`
Expected: both FAIL with `row === undefined`. Note that 67 calls `row.run()` behind an `if (row)` — the guard check 66 already uses, so an absent row cannot throw and take 68's RED with it.

- [ ] **Step 3: Add the action and the row**

`commands.ts`, on `PaletteActions`:

```ts
  /**
   * Open a review node for this panel: ask main for its stored baseline,
   * then place a node beside it. Takes an id rather than reading the focused
   * panel, for the reason savePanelAsPreset does — the inspector acts on the
   * SELECTED panel and the palette on the CAPTURED one, and neither is
   * `focusedId`.
   *
   * This one EARNS a Command row, unlike closePanel/startPanel: opening a
   * review has exactly one other gesture (the inspector's button), and the
   * inspector can be collapsed.
   */
  openReview(subjectId: string): void
```

and the row, beside `panel.restart` in the `panel` section — reusing that block's own `target` local (`ctx.panels.find((p) => p.id === ctx.capturedId)`) rather than declaring a second one:

```ts
  out.push({
    id: 'panel.review',
    section: 'panel',
    title: target === undefined ? 'Open review' : `Open review of ${target.label}`,
    searchText: 'review changes diff git what changed',
    // The SAME field the Restart row gates on, deliberately not a second
    // boolean: "has this panel ever spawned" is one fact, and it is exactly
    // the question both verbs ask — a panel that never started has no
    // baseline, so there is nothing to review it against. Two flags derived
    // from one status would agree the day they were written and disagree the
    // first time one of them was wrong.
    ...(ctx.capturedId === null || target === undefined
      ? { disabledReason: REASON_NO_FOCUS }
      : target.restartable ? {} : { disabledReason: REASON_NOT_STARTED }),
    run: () => { if (target !== undefined) actions.openReview(target.id) }
  })
```

- [ ] **Step 4: Implement `openReview` in Canvas**

```tsx
  /**
   * A review node is minted from the SUBJECT's stored baseline, asked for
   * once here and then carried inside the node — see ReviewSubject. The
   * label is snapshotted through the same honest chain the rail row walks,
   * because the panel it names may be closed long before the node is.
   */
  const openReview = useCallback((subjectId: string) => {
    const subject = panelsRef.current.find((p) => p.rect.id === subjectId)
    // A review of a review is not a thing, and the id could only reach here
    // from a row that should have been gated.
    if (subject === undefined || isReviewPanel(subject)) return
    const label = railLabel(subject, registry.get(subjectId)?.status)
    void window.canvas.review.baseline(subjectId).then((baseline) => {
      // Null is reachable despite the row's gate: a panel can be killed
      // between the click and the reply, and main drops its baseline on
      // kill. Minting a node with no baseline would produce a panel that can
      // never answer anything.
      if (baseline === null) return
      // `r`, from the SAME counter `n` comes from. PanelId doubles as a tmux
      // session name, so a review node minting an id a terminal panel in any
      // workspace already owns is M7's invisible collision through a new
      // door — the second panel to go live attaches to the first one's
      // session and the user simply sees one agent through two panels.
      const id = `r${nextIdRef.current++}`
      setPanels((current) => {
        // cascadeCentre for the reason onSpawn uses it: opening two reviews
        // of one panel must not stack them byte-identically, which is a
        // canvas that looks like it holds one node while holding two.
        const centre = cascadeCentre(reviewCentre(subject.rect), current)
        const next = [
          ...current,
          makeReviewPanel(id, centre, nextZ(current), {
            subjectId,
            repoRoot: baseline.root,
            baselineSha: baseline.sha,
            label
          })
        ]
        commitHistory(next)
        return next
      })
      setSelectedId(id)
    })
  }, [])
```

Add `openReview` to the `paletteActions` memo (and its dep array), and widen both id-seeding regexes — the `nextIdRef` initialiser and `switchWorkspace`'s re-seed — from `/^n(\d+)$/` to `/^[nr](\d+)$/`, with:

```ts
      // Both prefixes, one sequence. `r` nodes and `n` panels draw from the
      // same counter precisely so neither can mint an id the other owns; a
      // regex that only saw `n` would restore a canvas holding r7 and then
      // hand out n7, which is one id for two panels.
```

- [ ] **Step 5: Add the inspector's button**

`Inspector.tsx`, inside the existing Changes `<section>`, directly under the summary/note:

```tsx
          {/*
            Inside the section rather than beside Restart, and that placement
            IS the gate: the section renders only when the review model is
            not hidden, so the button exists exactly when there is something
            to open — no disabled state to explain, and no button at all on
            the panels (most of them) that are not in a repository.
          */}
          <button
            type="button"
            className="inspector__action"
            data-inspector-action="review"
            title={`Open a review node for ${model.heading}`}
            {...shellControl(() => onOpenReview(model.id))}
          >
            Open review
          </button>
```

with `onOpenReview: (id: string) => void` on `InspectorProps` and threaded through `InspectorPanel`; Canvas passes `onOpenReview={paletteActions.openReview}`.

- [ ] **Step 6: Write and run the end-to-end checks**

```js
      // 106. The inspector's button makes a real node beside a real panel,
      //      through main's real baseline. Three clauses, and the id prefix
      //      is one of them: `r` is what tells a reader of layout.json (and
      //      of a tmux session list) which panels can possibly own a
      //      session.
      {
        const beforeIds = await panelIds(wc)
        await selectPanel(first)
        await waitFor(wc, '[data-inspector-action="review"]', 5000)
        await clickShell(wc, '[data-inspector-action="review"]')
        const node = await waitUntil(async () => {
          const ids = await panelIds(wc)
          const fresh = ids.filter((id) => !beforeIds.includes(id))
          return fresh.length === 1 ? fresh[0] : false
        }, 8000)
        const heading = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id=' +
            ${JSON.stringify(JSON.stringify(node))} + ']')
          return n ? n.querySelector('.panel__title').textContent : null })()`)
        const sessions = await sessionMap(wc)
        ok('106 the inspector opens a review node for the selected panel',
          typeof node === 'string' && node.startsWith('r') &&
            typeof heading === 'string' && heading.includes('review') &&
            sessions.has(node) === false,
          `node=${node} heading=${heading}`)
      }

      // 107. THE ID CHECK. A review node draws from the same counter as
      //      Cmd+N, so the next terminal panel must not reuse its number —
      //      PanelId doubles as a tmux session name, and two panels naming
      //      one session is the failure with no visible symptom at all (the
      //      second to go live attaches to the first one's process). Read
      //      across EVERY workspace, not just this one, for the same reason
      //      check 66 does.
      {
        await zoomTo(wc, 'n')
        await settle(wc)
        const ids = await wc.executeJavaScript(
          `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
        const numbers = ids.map((id) => /^[nr](\d+)$/.exec(id)).filter(Boolean).map((m) => m[1])
        ok('107 review nodes and panels never share a number',
          new Set(numbers).size === numbers.length, JSON.stringify(ids))
      }
```

Run: `npm run verify:palette && npm run build && npm run verify:panels`
Expected: 67, 68, 106, 107 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/palette/commands.ts src/renderer/canvas/Canvas.tsx src/renderer/shell/Inspector.tsx scripts/verify-palette.cjs scripts/verify-panels.cjs
git commit -m "feat(m9b): open a review from the inspector and the palette"
```

---

### Task 10: The other surfaces

A review node is a `Panel`, so the rail, the inspector and the palette's panel switcher all receive one. Each renders it — a node panned off screen must stay reachable, which is the whole argument M8b's rail was built on — and each disables the verbs that make no sense for it *with a reason*, rather than hiding them. `verify:palette` 31's rule applies unchanged: a row that disappears is indistinguishable from a feature that was never built.

**Files:**
- Modify: `src/renderer/shell/rail-rows.ts`, `src/renderer/shell/inspector-fields.ts`, `src/renderer/shell/Inspector.tsx`, `src/renderer/canvas/Canvas.tsx` (`panelRows`)
- Test: `scripts/verify-rail.cjs` (53–56), `scripts/verify-palette.cjs` (69), `scripts/verify-panels.cjs` (108)

**Interfaces:**
- Consumes: `isReviewPanel`, `ReviewPanel` (Task 1).
- Produces: `railLabel`/`railTail`/`buildRailRows` accepting either kind; `InspectorModel.kind: 'terminal' | 'review'`; `buildInspectorModel` accepting either kind.

- [ ] **Step 1: Write the failing checks**

`scripts/verify-rail.cjs`:

```js
const reviewPanel = (id, over = {}) => ({
  kind: 'review', rect: { id, x: 0, y: 0, w: 640, h: 520 }, z: 1,
  subject: { ...SUBJ }, ...over
})

// 53. A review row names its SUBJECT, not itself: "review" alone tells
//     nobody which agent's work it is, on a rail whose entire job is telling
//     panels apart. Its tail is 'review' rather than a status — it has no
//     process, and railTail's status vocabulary ('not started', 'exited 0')
//     would be a lie in every one of its words.
{
  const row = R.buildRailRows([reviewPanel('r1')], () => undefined, NONE)[0]
  ok('53 a review row names its subject and says review',
    row.label === 'review: claude' && row.tail === 'review' && row.dormant === false)
}

// 54. A user's own title still outranks it — the first link of the honest
//     chain, which is not a terminal-only rule.
ok('54 a titled review node uses its title',
  R.buildRailRows([reviewPanel('r1', { title: 'auth diff' })], () => undefined, NONE)[0].label === 'auth diff')

// 55. `dormant: false` is load-bearing rather than incidental: the rail's
//     start control renders on dormant rows only, and a review node that
//     reported dormant would offer a "start" arrow for a panel that has
//     nothing to start — a control that cannot work, on the surface whose
//     rule is that a visible control does something.
ok('55 a review row is never dormant', R.buildRailRows(
  [reviewPanel('r1')], () => undefined, new Set(['r1']))[0].dormant === false)

// 56. The inspector model for a review node: it names the subject, and both
//     process verbs are refused. `restartable: false` is the clause that
//     matters — Restart is rendered disabled rather than absent, and a
//     review node that reported restartable would offer to end a process it
//     does not have, which reaches restartPanel and disposes nothing while
//     looking like it worked.
{
  const m = R.buildInspectorModel(reviewPanel('r1'), undefined)
  ok('56 a review node\'s inspector model refuses the process verbs',
    m.kind === 'review' && m.restartable === false && m.reattached === false &&
      m.fields.some((f) => f.key === 'subject' && f.value === 'n4') &&
      m.fields.some((f) => f.key === 'repo' && f.value === '/tmp/repo'))
}
```

`scripts/verify-palette.cjs`:

```js
// 69. A review node is in the Panels section like any other panel — an
//     off-screen node must be reachable by keyboard — and the verbs it
//     cannot do are DISABLED there, not missing. Restart is the case: its
//     row is aimed at the captured panel, and a captured review node has no
//     process to restart.
{
  const rows = R.buildCommands({ ...base,
    panels: [{ id: 'r1', label: 'review: claude', restartable: false }], capturedId: 'r1' })
  ok('69 a review node is navigable and its process verbs are disabled',
    rows.some((r) => r.id === 'panel.goto.r1' && r.disabledReason === undefined) &&
      rows.find((r) => r.id === 'panel.restart')?.disabledReason === R.REASON_NOT_STARTED)
}
```

`scripts/verify-panels.cjs`:

```js
      // 108. The node is in the rail, and its row NAVIGATES — the rule
      //      M8b's rows already obey. The camera clause is what rejects a
      //      row wired to nothing; the session clause is what rejects a row
      //      that reached onSelectPanel, whose wake path has no meaning here
      //      and whose real cost is that it is the app's spawn gesture.
      {
        await panBy(wc, 900, 600)
        await settle(wc)
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        const clicked = await clickRail(wc, 'r90')
        await settle(wc)
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        const sessions = await sessionMap(wc)
        ok('108 the rail lists a review node and its row frames it',
          clicked === true && (after.x !== before.x || after.y !== before.y) &&
            sessions.has('r90') === false)
      }
```

- [ ] **Step 2: Run all three and watch them fail**

Run: `npm run verify:rail && npm run verify:palette && npm run build && npm run verify:panels`
Expected: 53–56 FAIL (53/54 on a `panel.spec` read of an object that has no spec — likely a THROW, so confirm 55/56's RED separately by commenting 53–54 out), 69 FAILs or passes depending on how `panelRows` currently degrades, 108 FAILs because no rail row exists for `r90`.

- [ ] **Step 3: Branch the rail's chain**

`rail-rows.ts`:

```ts
export function railLabel(panel: Panel, status: PanelStatus | undefined): string {
  // The user's own title is the first link for BOTH kinds — it is the one
  // link the user chose.
  if (panel.title !== undefined) return panel.title
  // A review node names its SUBJECT. The label is the snapshot taken when
  // the node was created (see ReviewSubject): the subject panel may be gone,
  // and re-deriving from a live lookup here is exactly what would blank the
  // row at the moment the node is most useful.
  if (isReviewPanel(panel)) return `review: ${panel.subject.label}`
  return (status?.kind === 'running' ? status.command : undefined)
    ?? panel.spec.command
    ?? 'login shell'
}

export function railTail(status: PanelStatus | undefined, dormant: boolean, kind: Panel['kind'] = 'terminal'): string {
  // Before the dormant test, because a review node is never dormant and the
  // whole status vocabulary below ('not started', 'exited 0', 'pid 4821') is
  // a sentence about a process it does not have.
  if (kind === 'review') return 'review'
  // …unchanged…
}
```

`buildRailRows` passes `panel.kind` and forces `dormant: isReviewPanel(panel) ? false : dormantIds.has(id)`. The row shape is unchanged, which is what keeps `railSignature` and `RailPanelRow` untouched — the start control already renders on dormant rows only, so a never-dormant row gets none without a second rule.

- [ ] **Step 4: Branch the inspector model**

`inspector-fields.ts`: `InspectorModel` gains `kind: 'terminal' | 'review'`, and `buildInspectorModel` returns early for a node:

```ts
  if (isReviewPanel(panel)) {
    return {
      kind: 'review',
      id: panel.rect.id,
      heading: railLabel(panel, undefined),
      title: panel.title,
      // A node has no process, so neither verb applies. FALSE rather than
      // absent, for the reason PanelRow.restartable is required: an optional
      // flag lets a half-finished wiring compile with the control silently
      // always-enabled, and tsc says nothing at all about it.
      restartable: false,
      reattached: false,
      fields: [
        { key: 'reviews', label: 'reviews', value: panel.subject.label },
        { key: 'subject', label: 'panel', value: panel.subject.subjectId },
        { key: 'repo', label: 'repo', value: panel.subject.repoRoot },
        // Short, because the pane is 260px and nobody reads forty hex
        // characters — but PRESENT, because it is the one field that says
        // which moment this node is measuring from.
        { key: 'baseline', label: 'since', value: panel.subject.baselineSha.slice(0, 8) }
      ]
    }
  }
```

`Inspector.tsx` gates the two process verbs on the kind, disabled with a reason rather than hidden:

```tsx
          disabled={model.kind === 'review' || !model.restartable}
          title={model.kind === 'review'
            ? 'A review node has no process to restart'
            : model.restartable ? `Restart ${model.heading} — …` : `${model.heading} has not started yet`}
```

and the same treatment for `Save as preset` (`'A review node is not a spawnable panel'`). `Rename…` and `Close panel` stay enabled for both kinds — both mean exactly what they say for a node.

- [ ] **Step 5: Branch `panelRows`**

`Canvas.tsx`'s `panelRows` memo builds its label through `railLabel(p, registry.get(p.rect.id)?.status)` — which now handles both kinds — and `restartable: isReviewPanel(p) ? false : isRestartable(registry.get(p.rect.id)?.status)`.

- [ ] **Step 6: Run everything**

Run: `npm run verify:rail && npm run verify:palette && npm run build && npm run verify:panels`
Expected: 53–56, 69, 108 PASS; rail 1–15 (the terminal chain and the signature) still green.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/shell/rail-rows.ts src/renderer/shell/inspector-fields.ts src/renderer/shell/Inspector.tsx src/renderer/canvas/Canvas.tsx scripts/verify-rail.cjs scripts/verify-palette.cjs scripts/verify-panels.cjs
git commit -m "feat(m9b): a review node in the rail, the inspector and the switcher"
```

---

### Task 11: It survives, and the documentation

The milestone's last two success criteria, plus the documentation this repository treats as part of the deliverable rather than as a follow-up.

**Files:**
- Test: `scripts/verify-panels.cjs` (109–111)
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Write the failing checks**

```js
      // 109. Success criterion 4's last clause: a review node survives a
      //      relaunch. Driven through a REAL reload rather than a parse
      //      check — Task 2 already pins the format, and what this adds is
      //      that the restored node still ANSWERS, which needs its subject
      //      to have survived main's own startup baseline sweep.
      {
        wc.reload()
        await waitFor(wc, '.review-node[data-panel-id="r90"]', 10000)
        const files = await waitUntil(async () => {
          const f = await wc.executeJavaScript(
            `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
               .map((e) => e.getAttribute('data-review-node-file'))`)
          return f.length > 0 ? f : false
        }, 8000)
        ok('109 a review node survives a reload and still reports its files',
          Array.isArray(files) && files.includes('agent.txt'), JSON.stringify(files))
      }

      // 110. SUCCESS CRITERION 5, and the check the node's whole design
      //      exists for. Closing the subject panel drops its baseline in
      //      main (dropBaseline, on kill) — so a node that had asked
      //      review:panel(subjectId) would go blank exactly here, at the
      //      moment a review of finished work is most useful. The node keeps
      //      answering because it carries the baseline itself.
      {
        await closePanelById(wc, first)
        await settle(wc)
        const stillThere = await waitUntil(async () => {
          const f = await wc.executeJavaScript(
            `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
               .map((e) => e.getAttribute('data-review-node-file'))`)
          return f.includes('agent.txt') ? f : false
        }, 8000)
        // Re-queried, not merely still painted: the node re-reads on its own
        // refresh, and a stale DOM from before the close would satisfy a
        // check that only looked at what was on screen.
        const requeried = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"] .review-node__refresh')
          if (!n) return false
          n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        const after = await waitUntil(async () => {
          const f = await wc.executeJavaScript(
            `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
               .map((e) => e.getAttribute('data-review-node-file'))`)
          return f.includes('agent.txt') ? f : false
        }, 8000)
        ok('110 a review node outlives the panel it reviews',
          stillThere !== false && requeried === true && after !== false)
      }

      // 111. Closing the NODE kills nothing. onClosePanel branches before it
      //      disposes, and this is the only check that can see the branch:
      //      dispose(id) sends pty.kill even for an id this renderer holds no
      //      session for, so routing a node through it would send a tmux
      //      kill-session named after a panel that never had one — and drop
      //      the baseline of whatever panel later recycles that id.
      {
        const before = (await sessionMap(wc)).size
        await closePanelById(wc, 'r90')
        await settle(wc)
        const gone = await wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="r90"]') === null`)
        const after = (await sessionMap(wc)).size
        ok('111 closing a review node ends no session',
          gone === true && after === before, `sessions ${before} -> ${after}`)
      }
```

`closePanelById` is whatever the suite already uses to click a panel's `×` (or the rail's close control); reuse it rather than adding a second closer.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: with Tasks 1–10 landed, 109 and 111 should already pass — they are regression guards. **110 is the one that must be watched failing**, and it cannot be against the shipped code. Prove it by fault injection instead: temporarily change `ReviewNode`'s query from `window.canvas.review.at(subject)` to `window.canvas.review.panel(subject.subjectId)`, watch 110 go RED (and 102 stay GREEN, which is what shows 110 is testing the thing it claims), then revert.

- [ ] **Step 3: Run the whole suite**

Run: `npm run verify`
Expected: every suite green. Then `npm run verify:packaged` if a release is near — M9b adds no native module and no packaging change, so it is not a gate for this milestone.

- [ ] **Step 4: Update `README.md`**

- Add the milestone row: `| M9b | The panel kind: a review node on the canvas | ✅ done |`.
- Extend the M9a prose section with a short M9b section — what a review node is, that it takes no budget slot and no WebGL context, that it outlives its subject, and that hunks are added/removed/context only.

- [ ] **Step 5: Update `CLAUDE.md`**

The verify table first — every count this milestone moved:

| Suite | New total |
|---|---|
| `verify:viewport` | 78 |
| `verify:layout` | 109 (last number 108, plus `108b`) |
| `verify:review` | 48 |
| `verify:rail` | 56 |
| `verify:palette` | 74 (last number 69, sub-checks unchanged) |
| `verify:panels` | 124 (last number 111) |
| `verify:ipc` | 30 channels |

Re-derive each from the suite's own printed output rather than from this table — the table is a prediction, and `CLAUDE.md`'s own prose records what happens when a count is trusted instead of re-read.

Then the load-bearing entries, in the file's existing voice. One paragraph each, each naming the silent failure it prevents:

1. **`kind` is optional on disk, absent is terminal, and a present unknown kind is dropped.** The asymmetry and why guessing costs a process.
2. **A review node never reaches `assignTiers` or `registry.ensure`**, because `Canvas.tsx` partitions before tiering — structural, not a rule anything obeys.
3. **A review node's query is addressed by BASELINE, not by panel id**, because main drops a panel's baseline on kill and the node has to outlive its subject. Name `verify:panels` 110 and the fault injection that proved it.
4. **`onClosePanel` branches before it disposes**, and the branch is not a sixth `registry.dispose` call site — `verify:panels` 94's two counts are unchanged, and `verify:panels` 111 is what fails if the branch is removed.
5. **Rule 3 of `shouldYieldWheel` is attribute-driven** (`data-scroll-host`), and why it is a property of the kind rather than an `if` in the predicate.
6. **The node's model is a second reader of `ReviewResult`, deliberately**, and the one decision it makes differently (`hidden`), with `verify:rail` 49 as the check that separates it from "just call `buildReviewFields`".
7. **`makeReviewPanel` must not force the minted id into `subject.subjectId`** — the copy-paste trap `verify:viewport` 76 exists for.
8. **Ids are one sequence with two prefixes**, and the regex that reads both.
9. **The eighth arm** — what 128-and-says-so buys, and that the CLT stub is the ordinary case rather than an exotic one.
10. **What M9b did not solve**, kept honest: the review node does not re-query on a file-system change (pull, not push — the spec's own decision), an untracked file's diff costs a second git call, and `#41`'s live-cwd limitation still means a panel that `cd`s out of its repository is reviewed against the first one.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-panels.cjs README.md CLAUDE.md
git commit -m "docs(m9b): the panel kind, and what the review node costs"
```

---

## Self-review notes for the executor

Three things this plan predicts will be wrong, so that finding them is not a surprise:

1. **The verify-harness helper names** (`waitFor`, `panBy`, `settle`, `clickRail`, `clickShell`, `panelIds`, `closePanelById`, `sessionMap`, `zoomTo`) are quoted from memory of `verify-panels.cjs`'s existing vocabulary. Use whatever that file actually defines; adding a near-duplicate helper is the wrong fix.
2. **`buildCommands`' fixture shape** in `verify-palette.cjs` (`base`, `actions`) is likewise from the file's existing style. Match it.
3. **`styles.css`'s custom properties** (`--fg-dim`, `--ok`, `--error`, `--accent`, `--row-hover`) are placeholders for whatever that file's `:root` block actually declares. Substitute; do not add new variables for this milestone.

And one thing to refuse if it is suggested during execution: **do not add a file watcher** so the node refreshes itself. The spec declines it explicitly ("Pull, not push", backlog #19), and the node already re-reads on the one signal that means something — its subject's agent going idle.
