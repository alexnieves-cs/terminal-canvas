# Orchestrate Phase D — run prompt

Paste everything below the line into a fresh session. With `/goal`, point the goal at this file
and keep only the stop condition inline (the condition has a 4,000-character limit). It executes
**Phase D only** of [docs/orchestrate-reference-plan.md](../../orchestrate-reference-plan.md).

**Base branch:** Phase C is **not merged**. Its branch is `m288-orchestrate-phase-c` (worktree
`../tc-orch-phase-c`, tip `6b6d8bb1`). Phase D builds on C, so branch off **that branch**, not
`main`. If the user has merged C by the time you start, branch off `main` instead and say so in
the ledger.

---

You are executing **Phase D — Production 3D** of `docs/orchestrate-reference-plan.md`. This is
the phase that finally pays off the art direction, and it is the one where a wrong move is
measured in frame time and lost legibility rather than in a red suite.

Read the plan whole, then the three prior ledgers in order —
`docs/build-log/m283-m284-orchestrate-phase-a.md`,
`docs/build-log/m285-m287-orchestrate-phase-b.md`,
`docs/build-log/m288-m290-orchestrate-phase-c.md` — including every **Found / deferred**
section. Then `CLAUDE.md`, `docs/product-rules.md` (goldens, tokens, what a restyle may not
touch) and `npm run lb -- orchestration`.

## Numbering and state

- Milestones **M291** (layered platforms and stable grouping), **M292** (semantic zoom,
  minimap, adaptive quality, measured fixtures), **M293** (keyboard/List parity, reduced
  motion, WebGL fallback). Grep `docs/build-log` and `git log` for collisions; take the next
  free triple if any exist.
- Ledger: **`docs/build-log/m291-m293-orchestrate-phase-d.md`**, created first with the goal,
  the exit criterion, a checklist per milestone, a **Measurements** section and a
  **Found / deferred** section. Link it from CLAUDE.md's build-log row after the Phase C entry,
  in the same commit.

## Execution method

- **Serial, one worktree** (`m291-orchestrate-phase-d`). M292's quality tiers depend on M291's
  geometry and on real measurements of it; M293's parity is defined against both.
- The library rule is load-bearing: `three` / `@react-three/fiber` stay behind
  `orchestration/OrchestrationCubes.tsx`, lazily `import()`ed; `postprocessing` stays behind
  `orchestration/orchestration-bloom.tsx`, reached only from that lazy module. A static import
  measured **+2.2MB in the first chunk**. `orch.bloom-door.1/.2` pin the bloom importer set and
  the `lazy()`; nothing pins three's. **Add a check that pins three's importer set too**, then
  verify by building and reading the chunk sizes, not by reading imports.
- The user's uncommitted `Canvas.tsx` / `useShellChrome.ts` edits on main are theirs; don't
  pick them up.
- Scoped check ids (`orch-3d.1`, `orch-zoom.1`, `orch-parity.1`). Commits `feat(m291): …`.
- `npm run affected` between steps. `pgrep` for stray Electron and take
  `/tmp/tc-electron-lock` before any Electron-tier suite.
- Carried traps: bind focus listeners on `document`; a hidden harness window needs
  `wc.focus()`; its `capturePage` can lag the DOM by a step, so where a capture and a check
  disagree the check's DOM read is the fact; a new or re-pinned `WATCHDOG_MS` comment starts
  `// measured`; rerun a cold `verify:visual` warm before calling it red; mirror any new
  `stores.ts` dependency into `panels-harness.cjs`. Phase C moved the Orchestrate checks into
  `verify:panels:orchestrate` — new checks go **there**, and re-measure that part's watchdog
  when you're done.

## M291 — Layered platforms and stable grouping

1. Replace Phase A's card-over-ring island with the real thing: layered illuminated platforms
   in the reference's blue-black material, cyan edges, violet as a **secondary family
   distinction only**. Every state keeps its word and its shape or icon; colour and glow are
   never the only carrier, and height is never a hidden quantitative score.
2. Stations, checkpoints and artifacts are **visually distinct kinds**. A test result must not
   read as another reasoning agent.
3. **Placement is stable under live updates.** Auto-layout preserves existing positions; a new
   island does not re-arrange the ones already there; a returning user recognises where work
   is. Phase C's persisted append-only order is the foundation — extend it, don't replace it.
4. Labels and controls stay screen-aligned and readable. No transparent overlapping objects,
   no camera flight on every event. Decorative geometry is expendable before hit accuracy or
   legibility — say that in a comment where you add any.
5. **Correct hit targets.** A click must select what is visually under the cursor at every
   supported zoom, including where platforms overlap in the isometric projection. Check it.

## M292 — Semantic zoom, minimap, adaptive quality

1. Semantic zoom: task summary → stations → evidence. Blocked and needs-input objects are
   **never** hidden behind an unexplained overflow node at any level.
2. A minimap and a visible selection breadcrumb, plus Fit all, Fit selected and camera Back.
   The default camera stays a fixed, readable isometric.
3. **Measure before you tune.** Build fixtures of **1, 6, 25 and 100 sessions** and record
   frame time and memory for each in the ledger's Measurements section, before and after the
   quality work. These are validation targets, not capacity claims — write the numbers you
   actually saw, including the ones you don't like.
4. Adaptive quality driven by those measurements: instanced or reused geometry, bounded
   labels, demand rendering when idle (the existing demand frameloop), a bloom pass that
   degrades rather than stalls. Grouping with honest counts at the large end, expanding on
   focus.

## M293 — Parity and fallback

1. **List parity**: a synchronised, sortable List with equivalent actions for everything in
   the scene. It is the fallback path, so it must be complete, not a summary.
2. **Keyboard**: arrow-key and list navigation reach every object without precision clicking
   in 3D. Enter inspects; double-click focuses an island; **Open on canvas** stays a separate
   labelled action.
3. **Reduced motion** and **WebGL unavailable** both preserve every essential action. Test
   WebGL-unavailable by actually denying the context, not by trusting a branch.
4. Light and dark, narrow viewport and a large graph all keep the essential actions reachable.

Out of scope (log as deferred if tempted): the durable timeline and restart reconciliation
(Phase E), reusable arrangements and saved views beyond what exists (E), CI/PR/deploy adapters
(F), dependency editing, the Start task dialog.

## Exit criterion (stop here)

From the plan: *legible across fixture sizes; correct hit targets; reduced motion and WebGL
fallback work; no Canvas regression.* Demonstrate each in the real app and record what you saw,
with the fixture numbers, in the ledger.

Before you stop:
1. `npm run verify`, plus `verify:visual` and the re-measured `verify:panels:orchestrate`
   watchdog. List new reds separately from the known pre-existing set named in the earlier
   ledgers; reproduce anything new on the base branch before calling it pre-existing.
2. `npm run shot`, then a **fresh-context critic** on every changed scene — this phase changes
   the most visible surface in the app, so give the critic the art-direction paragraph from the
   plan and ask specifically about legibility at small sizes and whether any state reads by
   colour alone. A sentence per scene in the ledger.
3. **Don't write goldens** (`UPDATE_GOLDENS=1` also re-baselines `starter`), don't merge,
   don't push. List the accepted captures for the user to copy one at a time. Note that
   Phases A–C left goldens owed as well, so say clearly which scenes this phase changed.
4. Report what landed, the commits, the verify result, the measurements, the critic notes, the
   deferred list and any departure from the plan.
