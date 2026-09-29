# Run prompt — The canvas, remade (for Opus 5.5)

> Paste everything below the line into a fresh Opus 5.5 session at the repo root.
> Supersedes an uncommitted same-day draft, whose
> engineering rules are carried over intact and whose design and orchestration halves are new.

---

You are the design director and lead engineer for this run on **terminal-canvas**
(`/Users/alexnieves/Documents/terminal-canvas`). It is an Electron app for macOS: an infinite canvas
of authored objects, meaning agents, terminals, files, previews, workflows, pictures and notes,
which a person arranges, edits and keeps. You own this run from the first screenshot to the merge.

**I explicitly opt in to multi-agent orchestration.** Use subagents, forks and Workflow scripts
wherever they buy parallelism or a fresh pair of eyes. You choose the scale, and I'd rather you
spend agents on critique and verification than on duplicated building.

## What I want

Three outcomes, in priority order:

1. **A canvas that people love using.** Revamp the canvas page (`src/renderer/canvas/`, with
   `Canvas.tsx` at about 9.3k lines) wherever it has the most user impact. That covers placing and
   arranging, pan/zoom/minimap/tiers, selection and marquee, links, annotations, snapping, the
   HUD, the command pill, the launcher and empty states. Polish the design until it feels
   crafted: motion that explains, type and spacing with rhythm, states that are never dead or
   blank. Orchestrate and Team view are separate pages, so touch them only at shared seams.
2. **Full flowcharts on the canvas**, built as a real feature to the bar of FigJam or
   Excalidraw, not a demo. The spec is below.
3. **A few features that make people say "oh, nice."** Pick 2–4 that grow from this product's
   thesis: *the canvas is where you see and act on the connections between agents, tools and
   evidence.* Some starting points to evaluate, not mandates:
   - **A living flowchart.** Connect a flowchart shape to a real terminal, agent or task, and the
     shape shows that object's live state (running, needs you, done, failed). A plan drawn on the
     canvas becomes a dashboard of the work it describes.
   - **Sketch → plan.** Select a flowchart and choose "Start work from this". Each process node
     becomes a step in a task plan, and nothing runs until a person approves it (the existing
     plan/approval rules apply).
   - **Agent draws it.** An agent line such as "diagram how auth flows through `src/main`" returns
     Mermaid, which lands as an editable flowchart. It arrives inert, like every import.
   - **Canvas craft:** smart snapping with distance guides, quick-connect from any object, a
     presentation/follow path through frames, and a zoom-to-selection camera that feels physical.

   Prefer ideas that reuse what already exists (tasks, plans, links, the Yjs shared canvas,
   Mermaid, the four doors) over parallel systems. If your evidence points to something better
   than this list, build that instead and tell me why.

Three changes that land completely beat eight that are half-built. Depth over breadth.

## How to work — the shape I expect

**Phase 0: Ground truth (before any design).** Several past "rebuild" briefs in this repo
duplicated work that had already landed, so look first.
- Run `npm run shot` and read every canvas scene. Launch the real app (the `run` skill) and use it
  twice, once as a first-time user and once as a daily user with a busy canvas. Record friction
  with screenshots.
- Read `docs/ideas-backlog.md` (open canvas items), `docs/product-rules.md`,
  `docs/architecture-map.md`, `src/renderer/canvas/CLAUDE.md`, `src/renderer/CLAUDE.md` (library
  doors), and the latest build logs. `docs/development-waves-proposal-2026-09-28.md` is a proposal,
  not an approved plan, but it names real gaps.
- Existing infrastructure you must decide to reuse or deliberately not reuse: M187's note forms
  (sticky/text/frame), `LinkLayer` + `link-geometry.ts`, `AnnotationLayer` (M93/M155 strokes),
  `SnapGuides`, `marquee`, `lod`/`tier-fade`, the workflow diagram painter (M133), and
  `@xyflow/react` (confined to `renderer/workflow/`).
- Fan this out. For example, run parallel read-only agents that each map one seam (persistence,
  links/geometry, selection/drag, export gates, Yjs sync), plus one that audits the live UI. Keep
  the conclusions and leave the file dumps in their contexts.

**Phase 1: Direction (write it down, then commit to it).**
- Use the `impeccable` skill. The project has no `PRODUCT.md` yet. Write one from `README.md`,
  `CLAUDE.md` and `docs/product-rules.md` (product truth only, invent nothing), and flag it in the
  ledger for my review. This is a **refinement/extension of the incumbent visual system**, not a
  rebrand: the code and tokens are the design authority. Use `/impeccable critique` on the
  current canvas to ground the ranking, and `shape` for the flowchart interaction design.
- Rank revamp candidates by user impact × reach ÷ risk. Put the ranking, the chosen top few and
  the reasons in the ledger.
- Settle the flowchart architecture (below) and the edge-model question before any code.

**Phase 2: Build.** Work in a worktree on its own branch. Parallelize across **disjoint files**:
schema/persistence, shape rendering, connector routing, Mermaid I/O, auto-layout and verify
checks each separate cleanly. **`Canvas.tsx` is the hotspot.** Extract the seam you need first
(the useBoardVerbs split is the precedent: pull out verb runs, never state clusters), then let
agents build behind it. Never let two agents race on the same file. You integrate and review
everything, and you never forward a subagent's work unread.

**Phase 3: Critique → one fix batch → confirm.** Hand a fresh-context critic the before/after
shots and the direction. Fix everything material in one batch, confirm with at most one more
round, and stop. Open-ended polishing loops are waste.

**Phase 4: Gate and land.** See Verification.

## Flowchart spec — what "full" means

A person can do all of this without leaving the canvas:

- **Shapes:** process, decision, terminator (start/end), input/output, document, subprocess,
  connector/junction, and free text. Each is resizable and restylable (fill, stroke, text) from
  the **existing token set**. Pick a tasteful default palette and add no new colours ad hoc.
- **Labels** edited in place on shapes and on connectors.
- **Connectors** attach to shape ports and stay attached as shapes move. They come in straight,
  orthogonal (routed sensibly around shapes) and curved styles, with an arrowhead at either end,
  both ends or neither.
- **Fast building:** drag from a port into empty space to create and connect the next shape.
  Keyboard creation (Tab for a child, Enter for a sibling, or a better scheme you can defend),
  duplicate, align/distribute, and snap to guides and grid. Building a 10-node chart should
  feel quick with only a keyboard.
- **Grouping:** group a chart and move it as a unit. Swimlanes/containers are a stretch goal.
  Decide and record the decision.
- **Auto-layout** of a selection, top-down and left-right, animated so the person can follow
  where each node went.
- **Mermaid `flowchart` in and out** (paste or import → shapes, and export → Mermaid), plus
  PNG/SVG through the existing export doors.
- **Everything else a canvas object gets:** undo/redo, copy/paste, multi-select, delete, tiering
  at zoom-out, persistence across relaunch, and sync through the existing Yjs shared-canvas layer
  on a shared workspace.
- **Mixed edges:** a connector can run between a flowchart shape and a live canvas object
  (terminal, agent, file, note). Decide whether these are the same records as today's panel
  links or a separate kind, and justify the choice. This decision enables the "living flowchart"
  idea above.
- **Scale:** a 200-shape chart must pan and zoom smoothly. Build that fixture and measure it.
  Don't assume it.

**Architecture: settle this first.** Choose (a) native authored canvas objects (like M187's
forms), (b) one flowchart panel hosting an editor such as xyflow, or a hybrid. The product rule
("an object is authored, not only started", with the same selection/drag/undo/tiering/export as
everything else) and the phrase "on the canvas page" both point toward (a). If you choose
otherwise, argue it and widen the xyflow door explicitly in `src/renderer/CLAUDE.md`. Either
way, **a flowchart is not a `note`**, because a note is a Markdown file and nothing else is.

## Rules that fail silently here

Every rule in the root `CLAUDE.md` exists because the obvious version breaks *without an
error*. Treat them as facts about the terrain rather than as bureaucracy:

- Before changing a module, run `npm run lb -- <module>`. Search `docs/load-bearing.md` and never
  scroll it. The entries are written from the cause, so search by module, not by symptom.
- **Four doors:** every new verb (create shape, connect, auto-layout, Mermaid in/out, and any
  "wow" feature) must be reachable from a canvas gesture, a palette row, an agent line AND a
  workflow node (`verify:verbs closure.v9.1`).
- **Persistence** lives in `src/shared/layout-schema/`. An absent key is not a malformed one, and
  a malformed field costs the field, not the object. Old layouts must still load.
- **Outward gate:** Mermaid and SVG exports are TEXT, so they go through `outward` /
  `redactSecrets` and report the scrub count. The canvas PNG is the one ungated door, and adding
  a second binary export would need its own recorded decision.
- **Import inertness:** imported or agent-generated Mermaid starts nothing. Anything that can
  *act* (such as sketch → plan) needs a person's approval first.
- **Frame rule (M236):** flowchart shapes are almost certainly chromeless. Record them in the list
  in `styles.css`. Chrome over a chromeless body is absolutely positioned and never collapses.
- **Density layers:** at rest a shape shows its label only. Configuration belongs in the
  inspector.
- **Drag math:** use `screenToWorld(p₂) − screenToWorld(p₁)` and recompute from the gesture's
  origin rect every frame. Connector endpoints follow the same rule.
- **Motion** respects the existing motion tiers and reduced motion.

## Verification

- Commits use `feat(mNNN): …`, starting at the next free milestone number after the newest in
  `docs/build-log/` (M387 was the latest as of today; check again, because parallel sessions have
  collided before). Keep a ledger at `docs/build-log/<range>-ledger.md`, write to it as you go,
  and link it from `CLAUDE.md` (`verify:meta ledger.1`). **The ledger is your state.** If your
  context gets summarized, reread the ledger instead of trusting memory.
- New checks take scoped ids (`ok('flowchart.connect.1 …')`). Use `npm run affected` between
  steps and run `npm run verify` before calling anything done. Report **your reds and the
  pre-existing baseline reds separately** (the Electron-tier baseline is in the build log). Never
  call something a flake without measuring it.
- For Electron: `pgrep` for strays first, take `/tmp/tc-electron-lock`, and run only one
  Electron tier at a time (the machine OOMs otherwise). Don't gate on
  `TC_VERIFY_ELECTRON_JOBS`.
- **Goldens change on purpose.** Each changed scene gets a fresh-context critic's sentence in the
  ledger before `UPDATE_GOLDENS=1`. Boundary changes (export gate, import inertness) also get a
  critic.
- Run the impeccable detector once over the changed UI at the end:
  `~/.claude/skills/impeccable/scripts/impeccable detect --json <changed targets>`.
- When the gate is green apart from the known baseline, merge to local `main`. **Do not push.**
  Then run `graphify update .`.

## Autonomy

Make reasonable calls yourself and record them in the ledger rather than stopping to ask.
Stop and ask only if (1) a change would break the persistence format for existing users'
layouts, (2) a design would need a new outward (network or export) door, or (3) the evidence
says the flowchart feature conflicts with a product rule in a way you can't resolve. If you
believe part of this brief is wrong for users, say so and propose the better thing. Push back
when you have evidence.

## What I want back

A short, honest report:
1. What you revamped and the evidence behind it, with before/after screenshots.
2. The flowchart architecture and edge-model decisions, with reasons.
3. The "oh, nice" features you built, and the ones you evaluated and rejected, with reasons.
4. Commits.
5. Verify results: your reds and the pre-existing reds, listed separately.
6. What is still owed: goldens, `PRODUCT.md` review, manual real-Mac checks, stretch items.

Anything you skipped or couldn't verify, say so plainly.
