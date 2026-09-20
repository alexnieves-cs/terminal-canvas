# M291–M293 — Orchestrate Phase D (production 3D)

The state of this run lives here, not in any session's memory. Spec:
[docs/orchestrate-reference-plan.md](../orchestrate-reference-plan.md) (Phase D row of
"Ordered delivery plan"); run prompt:
[2026-09-19-orchestrate-phase-d-run-prompt.md](../superpowers/specs/2026-09-19-orchestrate-phase-d-run-prompt.md).
Earlier ledgers: [Phase A](m283-m284-orchestrate-phase-a.md), [Phase B](m285-m287-orchestrate-phase-b.md),
[Phase C](m288-m290-orchestrate-phase-c.md).

- Branch `m291-orchestrate-phase-d`, worktree `../tc-orch-phase-d`, **off main `8f6ac94f`** — the
  run prompt said to branch off `m288-orchestrate-phase-c` unless the user had merged C first;
  they had (main's tip IS Phase C's merge, and the C branch and worktree are gone), so this
  branch is off main, as the prompt says to do and say in that case.
- Numbering: `M291`/`M292`/`M293` were free on 2026-09-20 — no hit in `docs/build-log`, none in
  `git log --all`, no branch or worktree carrying the number.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main are NOT on
  this branch**, by the run prompt's rule: the worktree is off committed main.
- The spec, the run prompt and `docs/design/` are UNTRACKED in main's tree (the user's), so they
  are not on this branch; the links above resolve in main's checkout.
- Serial, one writer. Subagents read-only, plus the critic.

## Goal

The Orchestrate scene becomes the reference's layered illuminated platforms — one per task
island, stations, checkpoints and artifacts visually distinct kinds standing on them, placement
stable under live updates, hit targets correct where platforms overlap; a semantic zoom from task
summary to stations to evidence, a minimap, a breadcrumb, Fit all / Fit selected / Back; adaptive
quality driven by measured 1/6/25/100-session fixtures; and full List/keyboard parity with
reduced-motion and WebGL-unavailable paths that keep every essential action.

## Exit criterion (stop here)

From the plan: *legible across fixture sizes; correct hit targets; reduced motion and WebGL
fallback work; no Canvas regression.* Shown in the real app, with what was seen recorded below
and the fixture numbers in Measurements; then `npm run verify`, `verify:visual` and the
re-measured `verify:panels:orchestrate` watchdog with every red reported; `npm run shot` and a
fresh-context critic on every changed scene. No goldens written, no merge, no push.

## M291 — Layered platforms and stable grouping

- [ ] Layered illuminated platforms replace the card-over-ring island: blue-black material,
      cyan edges, violet a secondary family distinction only; every state keeps its word and its
      shape or icon; height is never a hidden score.
- [ ] Stations, checkpoints and artifacts are visually distinct kinds.
- [ ] Placement stable under live updates: Phase C's append-only order extended into a fixed
      cell grid; a new island appends, the others keep their place.
- [ ] Labels and controls screen-aligned; no transparent overlapping objects; no camera flight
      on every event; decorative geometry expendable before hit accuracy or legibility (said in
      a comment where geometry is added).
- [ ] Correct hit targets at every supported zoom, including where platforms overlap — checked.
- Checks: `verify:orchestration orch-3d.*`; `verify:panels:orchestrate orch-3d.app.*`.

## M292 — Semantic zoom, minimap, adaptive quality

- [ ] Semantic zoom: task summary → stations → evidence; blocked and needs-input objects never
      hidden behind an unexplained overflow at any level.
- [ ] Minimap, selection breadcrumb, Fit all, Fit selected, camera Back; default camera a
      fixed, readable isometric.
- [ ] Fixtures of 1, 6, 25 and 100 sessions measured for frame time and memory BEFORE and AFTER
      the quality work (Measurements below).
- [ ] Adaptive quality: reused geometry, bounded labels, demand rendering, a bloom that degrades
      rather than stalls; grouping with honest counts, expanding on focus.
- [ ] A check pins `three`'s importer set (beside `orch.bloom-door.*`), and the chunk sizes were
      read from a real build.
- Checks: `verify:orchestration orch-zoom.*`; `verify:panels:orchestrate orch-zoom.app.*`.

## M293 — Parity and fallback

- [ ] List parity: synchronised, sortable, with equivalent actions for everything in the scene.
- [ ] Keyboard: arrow keys and list navigation reach every object; Enter inspects; double-click
      focuses an island; Open on canvas stays a separate labelled action.
- [ ] Reduced motion and WebGL-unavailable both keep every essential action; WebGL tested by
      denying the context.
- [ ] Light and dark, narrow viewport and a large graph keep the essential actions reachable.
- Checks: `verify:orchestration orch-parity.*`; `verify:panels:orchestrate orch-parity.app.*`.

## Measurements

(filled as measured — frame time and memory for the 1/6/25/100-session fixtures, before and
after the quality work; chunk sizes from a real build.)

## Exit demo

(what was seen driving the real app.)

## Critic

(a sentence per changed scene.)

## Gate

(the closing `npm run verify`, `verify:visual`, the re-measured watchdog; new reds listed apart
from the known nine.)

## Found / deferred

Out of scope for Phase D by the run prompt, logged here if the run is tempted: the durable
timeline and restart reconciliation (Phase E), reusable arrangements and saved views beyond what
exists (E), CI/PR/deploy adapters (F), dependency editing, the Start task dialog.
