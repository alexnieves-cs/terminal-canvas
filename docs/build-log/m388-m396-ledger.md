# M388–M396 ledger — the canvas, remade, and flowcharts on it

The run prompt is `docs/superpowers/specs/2026-09-29-canvas-revamp-flowchart-prompt-opus55.md`
(Opus 5.5, started 2026-09-29). **This ledger is the state.** If context is summarised, re-read
this file, not memory.

- Branch `m388-canvas-flowchart`, worktree `../tc-canvas-flow`, off main `f7a3247e`.
- Numbering: M387 was the newest build log; `m385-panels-fresh-storage.md:73` *proposed* M386
  (panels hermeticity, owed, never used). This run starts at **M388** and does not take M386.
- Electron runs take `/tmp/tc-electron-lock` (a DIRECTORY — `mkdir` to take, `rm -rf` to
  release). It was a stale 3-day-old dir at the start of this run; taken after `pgrep` found
  no terminal-canvas Electron.

## Milestones

| Milestone | What | Status |
|---|---|---|
| M388 | Shapes: the `shape` kind — record, reader, a lightweight layer, create verbs through the four doors, label edited in place, resize from every edge, tiers, the 200-shape fixture and the perf work it needs | done; 200-shape fixture measured (below) |
| M389 | Connectors: a record on the source object, ports, straight / orthogonal / curved, arrow ends, labels in place, drawn from a port (into empty space creates the next shape), mixed edges | done |
| M390 | Building fast: the keyboard scheme, object copy/paste, duplicate, align/distribute, spacing guides | done; grid NOT built — see D10 |
| M391 | Auto-layout (animated) and Mermaid in/out, SVG export through the gate | done; two boundary rounds (below) |
| M392 | Shared flowcharts: shapes and connectors through the Yjs shared canvas | built and MERGED into this branch: `shape`/`connectors` JSON fields (2 KB / 16 KB caps), `panel-content` op = the retitle rule, peer shapes drawn read-only in the ShapeLayer; audit counts it under `edited` (the action set is pinned by the migration's CHECK); a local panel cannot connect TO a teammate's shape (the layout's load prunes a target that is not in the file) |
| M393 | The living flowchart: a shape connected to a live object shows its state | done (`verify:panels:flowchart`) |
| M394 | Sketch → plan: "Start work from this" | built (7c8f9dcb) |
| M395 | The canvas revamp: the ranked surface changes (below) | done; parts A and B merged |
| M396 | Critique → one fix batch → gate | done — gate green apart from the baseline (below); merged to local main |

## Phase 0 — ground truth (2026-09-29)

**Shots.** `npm run build && SHOT_DIR=<scratch>/shots-before npm run shot`: 81 of the scenes
painted; `starter` failed ("the arrangement is not on screen", the KNOWN baseline red — not
this run's). Canvas scenes read: launcher, kinds(-dark), graph, overview, group, zoomed-out,
compact, wide, ink.

**What exists — do not rebuild.** Marquee and multi-select; groups (M30); camera flights,
trail and bookmarks (M56); `fitSelection` (zoom-to-selection, M146); minimap (M69); semantic
zoom tiers + tier crossfade; the Launcher; the command pill (M249); M187's sticky / text /
frame (`kind: 'note'` with `note.form` in code — "note" is NOT free as a kind name); ink and
labels (M93/M155); edge/centre alignment snapping (M50, `placement.ts snapRect`); `tidyPanels`
(row-packing, instant, not graph-aware); the canvas PNG export; the workflow panel's own
hand-rolled `autoLayout` (acyclic, fixed 168x64 blocks).

**What does not exist** (grepped `src/` and `docs/`): Mermaid anywhere; any graph-layout
dependency; orthogonal routing outside xyflow's `smoothstep`; align/distribute; spacing or
distance guides; grid snap; quick-connect into empty space (`useLinkDraw` cancels silently);
**object copy/paste and duplicate** (`useCanvasClipboard` is terminal text + images only);
a presentation path; per-kind minimum size (200x160 is global); per-kind far-tier rendering
(`PanelFrame.renderFar` turns every non-terminal body into a glyph card below 0.26).

**Defects found while looking (not this run's to own unless a milestone touches them):**
- The agent door's `tidy` arm is a no-op that reports `ran` (`palette-actions/executor.ts`
  ~255; first recorded in the M203/M204 log, never fixed). M391 fixes it (auto-layout shares
  the verb family).
- `seedAfter` (`panels/recover.ts:39`) recognises only `[nrfjt]` id prefixes, so `nt`, `img`,
  `c`, `w`, `m`, `b`, `s` ids are invisible to seeding (lb :357 — duplicate ids are dropped at
  load). M388 widens it (shape ids would otherwise inherit the defect).
- The canvas's `layerTop` IIFE in `PanelFrame.tsx:289` reads computed style on every render;
  the persist effect (`Canvas.tsx:2748`) serialises every panel and sends `layout.save` on
  every camera frame; `Canvas` re-renders on every mousemove (backlog #87). All three are
  measured in M388 against the 200-shape fixture before anything is changed.

## Decisions

### D1. Architecture: native authored objects — a `shape` panel kind with its own light layer
Chosen: **(a)**, native canvas objects. A flowchart shape is a `Panel` of a new kind `shape`
(`{kind:'shape', shape:{form, text, fill?, stroke?, ink?}}`), so it inherits — from the code
that already exists, not a parallel copy — selection, marquee, multi-select drag, groups,
snapping, z order, undo (`History<Panel[]>`), persistence, placeholder sync on a shared
workspace, and it joins `isTerminalPanel`'s exclusion list (product rule: "an object is
authored, not only started"; "joins the exclusion list rather than getting a partition").
**What it does not inherit is `PanelFrame`.** Measured by reading, not guessed: `PanelFrame` is
~20 DOM nodes and ~6 store subscriptions per object, is not memoised, forces a style read per
render, clamps to 200x160, and swaps every non-terminal body for a glyph card at far zoom — so
200 shapes through it would be ~4k nodes re-rendered on every camera frame, and a diamond would
turn into a card when you zoom out. Shapes render in ONE memoised `ShapeLayer` inside `.world`
(each shape a small absolutely positioned element keeping the `data-panel-id` hook), with
handles and ports only on the selected/hovered shape. Chromeless by the M236 test (the shape
IS its content; removing chrome hides nothing) — recorded in the frame-rule list.
(b) — one flowchart panel hosting xyflow — was rejected: shapes inside a panel cannot take a
connector to a live terminal on the canvas (the mixed-edge requirement, and the living
flowchart that rests on it), cannot join canvas selection/undo/groups, and would widen the
xyflow door the renderer's CLAUDE.md confines to `renderer/workflow/`.

### D2. Edge model: connectors are their OWN record, stored on the source object
`connectors?: Connector[]` on `PanelBase` — beside `links`, never inside it.
`Connector = {id, to, from?, toPort?, route?, ends?, label?, tone?, dashed?}`.
- **Not panel links**, because a `PanelLink` MEANS something: it feeds one-hop task membership
  (`task-members.ts:126`), Orchestrate's dependency lines, the agent snapshot, preset saves
  and, with `automation`, handoff. A flowchart arrow drawn between a shape and a terminal must
  not make the shape a task member or a dependency, ever. Links are also one per ordered pair,
  id-less, portless, and the parser dedupes on `to` — a decision's two branches to one target,
  or two arrows on different ports, cannot be represented.
- **On the source object**, like links, because undo is `History<Panel[]>`: anything outside
  `Panel[]` is outside undo (annotations and groups are, today). Storing connectors on the
  source panel gives undo, `removePanel` pruning, copy/paste and snapshot restore one home.
- **Mixed edges are connectors.** `to` may name any panel. A connector between a shape and a
  terminal, agent, file or note is a connector: it binds DISPLAY (M393's living state) and
  never behaviour. Handoff stays a link, drawn from a port with the existing gesture.

### D3. Keyboard: bare keys, scoped — a deliberate, recorded exception to "every chord is ⌘"
The ⌘-gate exists because a focused terminal claims every bare key. The flowchart keys act
ONLY when no terminal holds focus, no text field is focused, and the selection is non-empty
and made only of canvas objects (shapes/connectors). A terminal can never see a key the
canvas took, and a key the canvas takes can never reach a terminal. Scheme:
- selected: **Enter** edits the label; **Tab** adds the next step in the chart's flow
  direction, connected, and opens its label; **⌥+Arrow** adds a connected shape in that
  direction (a branch); **Arrow** nudges (⇧ ×10); **Delete/⌫** deletes.
- editing: **Tab** commits and adds the next step (a chain is typed without leaving the
  keyboard); **Escape** / **⌘Enter** commit; Enter is a newline (labels are multi-line).
Tab/Enter for child/sibling (the mind-map scheme) was not taken: in a flowchart the "child" is
the next step in flow and a "sibling" is a branch, which has a direction — ⌥+Arrow names it.
Enter-to-edit is the FigJam/Figma convention for a selected object.

### D4. ⌘D is Duplicate; the diagnostics overlay moves to ⌘⌥D
⌘D toggled the developer diagnostics overlay (backlog #75), pinned by no check. Duplicate is
the universal design-tool chord and is what a person will press. README's mention is updated.

### D5. Grouping yes, swimlanes no (this run)
A chart groups and moves as a unit through the EXISTING groups (M30) — an imported or
laid-out chart lands as one group. Swimlanes/containers are the stretch goal and are NOT built:
a lane that owns its members is a group with a layout constraint, and M187's frame explicitly
owns nothing; building it well needs its own milestone.

### D6. PNG through the existing door; SVG and Mermaid are TEXT and pass the gate
PNG is the canvas PNG (frame the chart, then Export canvas as PNG) — no second binary door.
SVG is built from the model (vector text, no raster data URLs) and Mermaid is text: both cross
`outward()` in main and report their scrub count; no new `redactSecrets` caller (`gate.2`).

**Revised by the boundary critic (2026-09-29, fresh context, told to break the gates).** Three
confirmed defects and two defence-in-depth gaps; all five fixed, each with a check:
1. HIGH — the renderer built the SVG and main gated its TEXT, but the builder wraps a long word
   across `<tspan>`s, so a token left in pieces and the count under-reported. Main now builds
   the SVG from the model after scrubbing each label WHOLE (load-bearing entry;
   `flowchart.files.13–15`).
2. MEDIUM — the ```mermaid fence regex backtracked for minutes on an unclosed fence over blank
   lines, freezing the renderer on a paste. Now a capped, linear line check in shared
   (`flowchart.mermaid.29`: 60,000 blank lines under 50ms).
3. MEDIUM — a group's label (an imported subgraph names one) reached the shared doc unscrubbed.
   Scrubbed in `diffLocal` like a title, no churn (`cs.flow.10`).
4. LOW — the SVG tripwire missed `<style`, `url(`, `<set`, `<animate`, `@import`. Added
   (`flowchart.files.6–7`).
5. LOW — `flowchart:read` followed links and a refusal quoted the file's first line. Real path
   first, extension re-checked, cap re-checked after the read, no quoting
   (`flowchart.files.16`, `flowchart.mermaid.28`).
**Confirm round (a second fresh critic, told to break the fixes).** All five held, and it found
what the first fix itself broke: (A, MEDIUM) moving the SVG builder into main moved the router
with it — an A* per connector, measured blocking main 9.4 s on one capped Mermaid paste and
69.5 s at the caps, reachable from an agent line with no click. The renderer now sends route
POINTS and main draws them (`pathFromPoints`); `flowchart.files.17` runs the cap-sized chart in
~1.3 s. (B, MEDIUM) the Mermaid door had #1's defect in another form — `<br/>` split
"Bearer\n<token>" — so Mermaid is built in main from the graph too (`.18`). (C, LOW) caps
applied before the scrub (`.19`; group names cut at a word boundary). (LOW) the read's stat and
read were by name — one descriptor now (`.20`). No third round: every finding has a check that
fails without its fix.
Not changed, recorded: `redact.ts`'s GitHub pattern needs a word boundary, so two tokens pasted
back to back with no separator match neither — the scrubber's own limit, older than this run.

### D13. Iris is not an authored colour (M396)
The visual critic's product-rule flag: iris is the canvas's selection colour and the running
hue, and since M393 a shape's OUTLINE is where live state is painted — an iris-lined shape at
rest read as selected or running. It leaves `SHAPE_STROKES` (shapes and connectors). Violet
stays: groups already offer it as an authored colour. A record holding `iris` (written only on
this unshipped branch) loads with that field dropped (`flowchart.persist.11`).

## The live-app audit (2026-09-29, 112 screenshots, old build)

A fenced real-renderer driver used the canvas as a first-timer (empty canvas) and as a daily
user (the 22-panel fixture). Ranked findings, the ones this run owns marked →:
- **P0 → a frame TRAPS what is inside it after one click**: selecting it raises it to the top,
  its `.pf` root blurs what is under it and takes every click (only `.note-node__body` is
  pointer-events: none); an enclosed sticky can no longer be picked. (M395)
- **P1 → no Delete for objects** (and the sticky's × is pushed 28px off its edge by the tint
  chips) — Delete now deletes authored objects (M390); the × is M395's.
- **P1 → ⌘D opened the diagnostics overlay** (now Duplicate, D4); **⌘C/⌘V did nothing** on
  objects (now M390's in-app clipboard).
- **P1 → annotate mode's own strip is unclickable**: the full-world `.annotate-sheet` (z 100000)
  sits over it, each press drops an empty "…" label (seven stayed after Done). (M395)
- **P1 → new objects land ON TOP of whatever is at the view centre** (`cascadeCentre` only
  avoids an exact centre). (M395: a free spot near the centre.)
- **P1 → ⌘ chords die inside a note's field** (⌘K, ⌘=): NoteNode's textarea stops every key.
  The shape label editor had copied the same rule — both now pass ⌘ chords through. (M395)
- **P1 discoverability**: "sticky" ranks disabled rows first; box/arrow/connect/delete find
  nothing — the flowchart rows carry those words now; ranking disabled rows lower is a
  palette-model change NOT taken (recorded, M396 if budget allows).
- **P1 → text illegible zoomed out** (18% summary tier worst) — the "reading from afar" item.
- **P1 → Tidy makes 22 panels a 3-row strip** only readable at 11%. (M395: pack to the view's aspect.)
- P2 → marquee selects page text; snap has no bypass (hold ⌘) and a faint guide; group drag
  with snap on distorts (measured 6px) — M395. P2 links hard to aim; Go-to at fit only selects.
- **What feels good (keep):** drag frames under ~9ms, pinch anchored, undo exact for drag /
  resize / tidy / group drag, fit keeps clear of HUD/minimap/pill, the calm launcher.

## Ranking — the revamp (final, after Assessment A + B; live audit folded in when it lands)

Scored impact × reach ÷ risk (1–5 each). The fresh critic (Assessment A) scored the canvas
**25/40** ("half specific": the words and state model are this product's; the look is a
generic light whiteboard; **the edges are the faintest mark on a canvas whose thesis is
connections**; the canvas has no ground while the workflow panel inside it has a dot grid).

| # | Candidate | I | R | Risk | Score | Evidence |
|---|---|---|---|---|---|---|
| 1 | **Chrome that yields** — one overlay order; minimap yields on hover and hides when everything is already in view (#83); "+ Create" never on a panel's corner or under the top bar; fit/jump frame inside a SAFE AREA clear of the HUD/minimap; pill yields while a menu is open | 3 | 5 | 1 | 15 | A: P1 #2 (kinds, zoomed-out, header, workflow, compact); shots: Create clipped in group/overview |
| 2 | **Object copy/paste + duplicate (⌘C/⌘V/⌘D of objects)** | 5 | 5 | 2 | 12.5 | Phase 0: does not exist at all |
| 3 | **Align / distribute + tidy/align in the pill for a selection** | 3 | 4 | 1 | 12 | A: P2 #7; Phase 0: no verb |
| 4 | **Smooth at scale** — camera/mousemove re-render, persist per frame, PanelFrame's forced style read | 4 | 5 | 2 | 10 | Render map; backlog #87; prerequisite for 200 shapes |
| 5 | **Motion honesty** — overshoot keyframes → decelerate; reduced-motion gaps | 2 | 5 | 1 | 10 | B: panel-enter/settle/pill-expand; no RM block for enter/settle/beacon |
| 6 | **Spacing guides + snap to shapes + a ground while arranging** (grid appears during a drag/resize — explains the snap, zero golden churn at rest) | 4 | 4 | 2 | 8 | A: "no ground"; Phase 0: no spacing guides/grid |
| 7 | **Quick-connect into empty space** | 4 | 3 | 2 | 6 | `useLinkDraw` cancels silently |
| 8 | **Ink smoothing** | 3 | 2 | 1 | 6 | A minor + shots/ink |
| 9 | **Reading from afar** — far-tier names across two lines at a minimum screen size, the agent PREFIX truncated not the suffix; labels scale and never outsize card names | 4 | 4 | 3 | 5.3 | A: P1 #3 (zoomed-out: "claude — …" ×4) |
| 10 | Launcher copy (disabled Start task with a reason, step 3 label, no Fit verbs on an empty canvas) | 2 | 4 | 1 | 8 | A: P3 #8 |
| — | Presentation path through frames | 3 | 2 | 3 | 2 | Evaluated, not built (below) |

**Chosen (M395 + the shared seams in M388/M390):** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 — 2/3/6/7 land as
the flowchart's building milestones because they are the SAME verbs for every object.

**Rejected, with reasons:**
- *Headers printing over the first body line* (A P2 #4) — the terminal is CHROMELESS by M236's
  rule and its chrome must stay absolutely positioned; reserving a top inset changes xterm's
  row count (a refit, the SIGWINCH the frame rule exists to prevent) and product-rules forbids
  touching cell metrics in a restyle. Needs its own milestone with a golden.
- *Six signals for one waiting panel* (A P2 #5) and *the work card's 8 verbs at rest* (A P2 #6)
  — real, but they are the attention system and the work-card kind, not the canvas page; out of
  this run's scope by the brief ("Orchestrate and Team view are separate pages, touch them only
  at shared seams"). Recorded for the backlog.
- *Merged view "paints broken"* (A P1 #1) — to be MEASURED before it is called anything
  (harness capture timing vs real); M395 reproduces it in the live app first.
- *No-overlap/flow layout for panels* (A question 2) — a different product; tidy/align on a
  selection answers the daily need without taking placement away from the person.

## Critique (impeccable) — Phase 1

- Assessment B (detector): canvas TSX clean (0 findings across `src/renderer/canvas`,
  `PanelFrame`, `NoteNode`, `CanvasHud`); `styles.css` 19 warnings, survivors for the canvas:
  overshoot in `panel-enter` / `panel-settle` / `pill-expand` (+ an animated blur), no
  `prefers-reduced-motion` block found for `.panel__motion--entering` / `panel-settle` /
  `pill-beacon` (JS gate unconfirmed), a stale comment at styles.css ~3208, the review
  banner's amber stripe (off-scope). Browser overlay skipped: the renderer needs Electron's
  preload bridge and CSP.
- Assessment A (fresh design review, general-purpose agent, before-shots only): 25/40. Strengths: the state vocabulary and dormant cards; inert teammate placeholders; modes that say what they are. Priority issues are folded into the ranking above.
- Questions skipped: autonomous run per the brief (the owner asked for calls to be recorded,
  not asked).

## PRODUCT.md — owed review
`PRODUCT.md` was written in M388 from README.md, CLAUDE.md and docs/product-rules.md only,
per the brief, WITHOUT impeccable's init interview. The owner should read it; nothing in it is
invented, and where the sources are silent it says so.

### D8. Shapes are not rail rows
A chart is many marks on the canvas, like ink and labels; 200 rows would bury every agent.
Shapes are excluded from the rail and the palette's panel list (`useRailModels`), drawn on the
minimap as ONE outline path, and found on the canvas. The inspector names a selected shape.

### D9. Object copy is an in-app clipboard
⌘C on shapes/notes/pictures holds a copy IN THE APP; the system clipboard gets a content-free
marker ("3 objects from terminal canvas · <nonce>") so a later ⌘V can tell "our copy" from "they
copied something else since". No label text leaves through the clipboard — that would be a
new, ungated outward door. A diagram leaves as text only through the gated Mermaid export.
A terminal or chat is never copied (a copy would be a second process).

### D10. No grid (this run)
`verify:styles ground.1` records a deliberate decision: the canvas is flat, with no dot token.
Spacing guides + edge/centre alignment give the structure a grid would; a visible grid would
reopen that decision and churn every canvas golden. Recorded, not built.

### D11. Connectors from a live object's port
A panel's existing port drag makes a LINK between two live objects (unchanged). If either end
is a shape it makes a CONNECTOR, and released on empty ground it makes a connected PROCESS
step there (quick-connect from any object; before, the release cancelled silently).

### D12. A frame carries its contents — at the gesture, never in the record (M395)
The live audit's P0: one click inside M187's frame raised it over what it enclosed, blurred and
trapped it. Now a frame is never raised by selection, its middle passes every click to the
ground (its label band and a thin ring take the pointer), it has no backdrop blur, and dragging
it by its label or ring moves every object WHOLLY inside it at that moment (FigJam's section) —
computed when the drag begins (`frameContents`), never stored. M187's "a frame owns nothing"
stays true of the RECORD; the layout file is unchanged. A group drag does not carry a frame's
contents; a locked object stays put.

### The 200-shape measurement (verify:panels:flowchart flowchart.perf.*)
200 shapes in a 20×10 grid, 260 connectors (right neighbours, every third column down, seven
long hops), seeded through the real store; 90 frames each, real input, vsync ≈ 8.3ms:
pan p95 **10.0ms** (mean 8.4), pinch-zoom p95 **16.7ms** (mean 9.9), drag one shape p95 **8.8ms**
(its 4 lines re-route), drag a 40-shape selection p95 **9.9ms**; heap 69 MB. Asserted: structure
and a 250ms hang bound only (the Orchestrate precedent — timings are recorded, not gated).
Nothing in the camera path needed changing for this: the ShapeLayer's props do not change on a
camera frame, and the connector cache reuses every route a drag does not touch.

## Checkpoint — 2026-09-29 evening
Built and smoke-tested in the real renderer (`SHOT_ONLY=flowchart npm run shot`): a chart
typed from the keyboard (double-click the ground, Tab, ⌥→, inspector forms, line labels by
double-click) renders as designed. Plain tier: all green except `verify:meta visual.1`
(the new `flowchart` scene has no golden yet — owed after the critic). Found by the smoke
test and fixed: a next step made from a label's Tab was looked up before React had it (one
updater now adds the shape AND its connector — one history entry); a decision's next step
was another decision (`nextStepForm`); a form change kept the old form's mint size.

## In flight — 2026-09-29 late

Parallel, each in its own worktree off the checkpoint `d3189131`, each told the lock protocol:
- `../tc-revamp-objects` (m395-revamp-objects): frames that trap, the annotate strip, ink
  smoothing, ⌘ chords in text fields, the sticky's ×, snap bypass/guide/group drag, marquee text.
- `../tc-revamp-chrome` (m395-revamp-chrome): minimap yields/hides, "+ Create", safe-area
  framing, the pill under a menu, far-tier names, free-space placement, tidy to the view's
  shape, motion honesty, launcher copy.
- `../tc-flow-checks` (m388-flow-checks): `verify:panels:flowchart` — real-input checks and the
  200-shape measurement.
- `../tc-flow-sync` (m392-flow-sync): M392.
- In this worktree: plain checks for the renderer flowchart modules (convert/persist areas).

**Found by the new `flowchart-dark` scene:** ⌘1 (fit) after a terminal was spawned to a chart's
right framed the chart's left column UNDER the navigator rail (host left 348px, chart at x≈257)
— a press there lands on the rail. Sent to the chrome builder (its safe-area item). And a port
drag RELEASED over the rail minted a shape the person could not see: a link/connector draw
released outside the canvas host now cancels (useLinkDraw, useConnectors).

**Bundle:** the first chunk grew ~220 kB (6.98 → 7.20 MB, raw) — the Mermaid scanner, the
layout and the router are all static imports. Measured, recorded; a lazy `import()` for Mermaid
and layout is the obvious cut if the owner wants it (nothing pins the chunk size).

Next: integrate the builders' branches (read every diff), full `npm run shot`, the fresh
critic on before/after, one fix batch, goldens with the critic's sentences, the full gate.

## Impeccable detector (once, at the end)
`impeccable detect --json` over the 21 renderer files this run changed: 16 warnings, all in
`styles.css`, and every one on a line older than this run (`git blame`, each commit an ancestor
of f7a3247e) — side-tab accents, spring easing, two layout transitions. None introduced here;
none fixed here (out of scope, and each is a restyle of a shipped surface with its own golden).

## Goldens (M396) — one sentence per changed scene, before `UPDATE_GOLDENS=1`

Written after the second (confirm) visual critic; its verdicts are quoted, shortened. Where the
confirm round still found a defect, the fix after it was checked by the LEAD looking at the
fresh golden, and that is said on the line — no third critic was run (the prompt's limit).
**Why so many:** the before shots were taken with the canvas host scrolled by earlier scenes'
typing (the M395 host-scroll bug); fixed, every scene whose canvas sits under that scroll now
paints at the true camera. The critic was told that alone is not a verdict.

- account-menu — BETTER — the launcher behind the menu labels step 3 and says why Start is disabled.
- approval — BETTER — the needs-you pill is opaque and clear of the HUD.
- attention — BETTER — the needs-you pill is opaque and no longer bleeds over the review card's corner.
- auto — BETTER — the chat's header row is whole instead of cut at the top.
- compact — critic WORSE ("1 panel need" under the HUD: a drawer moves both by class and nothing resized) → FIXED after: the pill re-places on the shell's class change; the lead looked — the pill sits whole left of the HUD, Create keeps its word.
- edge-firing — SAME — the firing edge is unchanged; "1 selected" clears the HUD.
- flip — SAME — the pill now stops short of the HUD.
- flowchart — GOOD — six shapes, centred labels, elbow connectors, yes/no on ground chips; the Panels list says shapes stay on the canvas.
- flowchart-dark — critic NOT READY (the Shape section hidden behind a saved Activity tab; ports over "no"/"yes") → FIXED after: a shape's pane is its Detail with no tab strip, and while a shape is selected the connector labels lift above the ports; the lead looked — one 8-column swatch grid (eight forms on one row), Arrange / Export / Work rows, "no" and "yes" whole.
- flowchart-far — GOOD — silhouettes in the connectors' ink, Build ringed green, the terminal a green block.
- graph — SAME — the edge inspector and lines unchanged; the pill clears the HUD.
- group — BETTER — the "WORKERS 2" label is in view instead of cut above.
- group-collapsed — SAME — the label shows; the members look as before.
- header — BETTER — with the ⋯ menu open the HUD and pill step away and the menu reads whole.
- ink — SAME — the strip, strokes and selection unchanged.
- inspector-activity / inspector-detail / inspector-tools / inspector-work — SAME — each tab's content unchanged.
- kinds / kinds-dark — BETTER — the corner "+ Create" no longer overlaps the terminal's header.
- launcher — BETTER — step 3 labelled, Start says its reason, no Fit verbs over nothing.
- lineup — SAME.
- merged — BETTER — both lanes framed at 21% with the HUD and needs-you pill whole.
- navigator-files / navigator-panels / navigator-workspaces — SAME.
- overview — BETTER — the needs-you pill is opaque.
- palette — BETTER — "1 session running" clears the HUD. palette-dark — SAME. palette-query — SAME (the chart rows disabled with their reason).
- reduced-motion — SAME — worker b framed and selected instantly.
- search / search-empty / share-dialog / spawn-sheet / start-work / subagents / tool-objects / verbs — SAME.
- wide — BETTER — the workflow's header, Run and ports whole instead of cut at the navigator.
- workflow — BETTER — "nightly sweep" whole with Run (was "htly sweep").
- workflow-edit — BETTER — the node library whole instead of cut at the left.
- zoomed-out / zoomed-out-dark — critic BETTER with half-sliced last lines on small cards → partly FIXED after: the far body is the size container (the first cut named a class no element carries and did nothing), and a short card's name takes one line with an ellipsis while its kicker and state give way; the lead looked — "toolbox ·…", "Jira…", "Watchdog fire…" whole. OWED: two medium cards with three-line names ("codex api thread", "plan the milestone") still lose their last line at the card's edge.

**A third, narrow critic pass — 19 more scenes.** The lead first misfiled 19 scenes as older
golden debt: they render the same as main by a whole-image pixel fraction. By the suite's own
metric (32px tiles, the 0.35 budget), main's renders PASS their goldens and this branch's do
not. In every one of them, the only tile past the budget is the bottom-right HUD row, which is
"+ Create" joining the HUD. A fresh critic judged them with that brief ("nothing blocks"):
- across — BETTER — "+ Create" is off the top-left panel's edge; the wider HUD covers empty canvas.
- browser / edge-waiting / github / routine / teammate / trail — SAME — the corner Create is gone from empty canvas; the HUD grew over empty canvas.
- chat / integrations — BETTER — Create no longer sits on the file panel's code line.
- composer / inspector-caps / team-ask — BETTER — Create is off the panel; the pill stepped 23px left and is clear.
- plan-approval / queue-hold — SAME (net) — Create is off the panel. The wider needs-you pill stepped left and now overlaps 31px of a terminal's blank right edge, part of its resize strip; no text is covered. Watch item.
- relay / shared-canvas / shared-offline — BETTER — the minimap is gone, on purpose: every object is in view (`minimapNeeded`, M395). The HUD stands alone over empty canvas.
- runs — SAME — the HUD's new strip covers the blank middle of a row whose badge was already under it. (Its `pid` is a live value and differs on every capture; that is older than this run.)
- watcher — BETTER (net) — the corner Create no longer covers "project". The HUD now overlaps the blank top-right corner of the `worker b` tile, and its chip keeps 33px of clearance. Watch item.
These 19 goldens were written in a second update after the gate.
`starter` is the known baseline red (the harness cannot paint it).

## The gate (M396)

`npm run verify` twice under the lock (the Electron tier serial), then `verify:visual` by hand.

- **Run 2 (4437b426), the result:** 62/64 suites. The two red suites carry only baseline reds:
  - `verify:panels:agents template.1`;
  - `verify:panels:product starter.1`.

  Of the older baseline list, `panels:agents detail.1` and the product part's
  `workflow.edit.1/.2`, `lib.1`, `wire.1`, `inspect.1`, `save.1` and `panel.1e` are green here
  (the carried-reds merge on main, dcfb5246). Every part's `headroom.1` is green (68–86%).
- **Run 1 (af04423a):** the same two reds, plus `verify:panels:product` killed by its 230 s
  watchdog right after `board.1`. **Not called a flake — measured.** The part alone took 184 s
  (80%), and in run 2 184.6 s (80%), both with only `starter.1` red. One kill in three runs,
  each surviving run at 80%. Watch for it rather than re-pin: headroom.1 says 80%.
- **`verify:visual`:** 79/80. `starter` is the known baseline (the harness cannot paint it).
  Its watchdog was re-pinned at 79 scenes: 307 s and 313.4 s measured, now 395 s.
- **Reds of this run's own:** none.
