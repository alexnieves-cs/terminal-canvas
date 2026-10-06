# Redesign run book (M435–M456)

Spec: [CONCEPT.md](CONCEPT.md) and [mockups/](mockups/). Decisions (binding):
[DECISIONS.md](DECISIONS.md). Guide: [GUIDE.pdf](GUIDE.pdf). Ledger:
[../build-log/m435-m456-ledger.md](../build-log/m435-m456-ledger.md).

This file is the run. The PDF is the source the briefs were transcribed from.
A lane reads its brief, not the PDF.

## What Phase 0 is

Parallel work is safe before any feature code exists. Foundations (F1, F2, F3)
have not started. No token was re-valued, no queue was implemented, no screen
was restyled, and the version is still 5.0.0.

## Branches

The guide's integration branch is `redesign/main`, cut from `main` at tag
`pre-redesign`, with lane branches `rd/<lane>` cut from the wave's tag.

This Phase 0 landed as one pull request onto `main`, because that is the
branch the owner asked for. After it merges:

1. Tag the merge commit `rd-p0`.
2. Tag its parent `pre-redesign` if that tag does not exist yet (the last
   commit that is not the redesign).
3. Cut `redesign/main` from `rd-p0` if later lanes should stay off the
   releasable `main`. Until then, `scripts/redesign/lane.sh` takes an explicit
   base (the guide's launch lines already pass `rd-p0`).

Lane branches: `rd/<name>`, one git worktree each at `../tc-rd-<name>`. Create
them with `scripts/redesign/lane.sh`, not `claude --worktree`. Each worktree
runs its own `npm ci`. Do not symlink `node_modules`.

Commit style: `feat(m442): …` / `fix(m442): …`. Squash only at the very end,
or never. Milestone commits are the history.

## Roles

- **Lead** (`RD_LANE=lead`, on the integration branch). Owns hotspot wiring
  between waves, rebases, merges `--no-ff` in the wave's fixed order, runs G3,
  writes the ledger. Does not implement screen features.
- **Lane** (`RD_LANE` set to the id below). Edits only the globs in
  [ownership.json](ownership.json). Starts in plan mode (`/rd-lane`), then
  implements. G1 while working, G2 before asking to merge.
- **Subagents** in `.claude/agents/`. Slash commands in `.claude/commands/`.

## Waves

| Wave | Lanes | Merge order | Tag |
|---|---|---|---|
| P1 | F1, F2, F3 | F1 → F2 → F3 (F3 rebases onto F2 first) | `rd-foundations` |
| P2a | L-A, L-B, L-D, L-E | L-B → L-A → L-E → L-D | `rd-wave2a` |
| P2b | L-C, L-F | L-C → L-F | `rd-canvas` |
| P3a | W0 | W0 | `rd-w0` |
| P3b | W1, W2, W3 | W2 → W1 → W3 | `rd-w3b` |
| P3c | W4, W6 | W4 → W6 | `rd-w3c` |
| P3d | W5 | W5 | `rd-world` |
| P4 | lead | integration, goldens | |
| P5 | lead | 6.0.0, packaged | |

At most four lanes at once. Electron-tier verify runs one at a time through
`scripts/redesign/with-electron-lock.sh`.

Launch (lead, after `rd-p0` exists):

```sh
scripts/redesign/lane.sh f1-tokens     F1 rd-p0
scripts/redesign/lane.sh f2-model      F2 rd-p0
scripts/redesign/lane.sh f3-frame      F3 rd-p0
```

Then, in each window, plan mode and `/rd-lane`, plus the prompt at the bottom
of that lane's brief. The standard kickoff is in GUIDE.pdf §6 and copied here:

> When I approve the plan: implement it milestone by milestone. For each
> milestone: (1) write the pure model and its checks first with the
> check-author subagent, and watch each check fail before the code exists;
> (2) build the UI on top; (3) run `/rd-gate G1` and fix until green;
> (4) commit as `feat(mNNN): …` with the ledger entry. Use subagents in
> parallel for independent reads. Keep every edit inside
> `docs/redesign/ownership.json` for `$RD_LANE`; if the guard blocks you, do
> not work around it — expose a hook/component in your own files or append to
> `requests.md`. When all milestones are done, run `/rd-gate G2` and stop.
> Do not merge.

## Frozen files

After `rd-foundations`, the lead moves the paths in
`ownership.json`'s `frozen_after_foundations` into `frozen`. The guard then
blocks every non-lead lane. A lane that needs a change appends
[requests.md](requests.md) and stops.

`src/shared/redesign-contracts.ts` is types only. No lane owns it. F2 and F3
implement the shapes. Changing a field is a request the lead accepts.

## Seams

- CSS: `src/renderer/styles.css`, between `/* ── rd:<lane> ── */` and
  `/* ── /rd:<lane> ── */`. F1 also owns the theme token blocks. The guard
  allows every other lane to edit only its own marker span. The blank line
  between blocks is not part of any lane.
- Shots: `scripts/shot-scenes/rd-<lane>.cjs` exports planned scenes
  (`name`, `reference`, `intent`). `scripts/shot.cjs` paints a scene only
  once it has a `run` function, so Phase 0 does not add a capture and
  `verify:meta` `visual.1` still matches one golden per painted scene.
  Narrow a shot run with `TC_SHOT_ONLY=launcher` or the existing `SHOT_ONLY`.
- Checks: `scripts/verify-rd-<lane>.cjs`, registered as `verify:rd-<lane>`.
  Phase 0's only check is `rd-<lane>.0 seam present`. The lane replaces the
  body and keeps that id green.
- IPC: reserved names are comments in `src/shared/ipc-contract.ts`. Adding a
  real channel means a key, a main handler, and the diagram line in
  `CLAUDE.md`, in one change. A comment is not a channel.

## Gates

| Gate | When | What |
|---|---|---|
| G1 | Lane stops | `npm run typecheck`, `npm run affected`, `npm run verify:rd-<lane>` |
| G2 | Before merge | Rebase, `with-electron-lock.sh npm run verify`, shot the lane's scenes, mockup-critic, rules-reviewer (world-guard if the lane id starts with W) |
| G3 | After each merge | Full `npm run verify` on the integration branch, `npm run build`, tag |
| G4 | End of P2 and P3 | Manual QA on a Mac with real CLIs and tmux |
| G5 | Release | `verify:visual` after a person has looked, `verify:packaged` |

Never set `UPDATE_GOLDENS=1`. Goldens are the lead's, after a person has looked.
The settings file denies that command.

## Lane ids

`F1` `F2` `F3` `L-A` `L-B` `L-C` `L-D` `L-E` `L-F` `W0` `W1` `W2` `W3` `W4` `W5` `W6`.

Brief: `docs/redesign/lanes/$RD_LANE.md`. Script key is the id lowercased:
`F1` → `npm run verify:rd-f1`, `L-A` → `npm run verify:rd-l-a`.

## Hotspots

`Canvas.tsx` and `WorldView.tsx` have one owner per wave. Other lanes export
a component or hook. The owner, or the lead, adds the one mounting line.

| Wave | Canvas.tsx | WorldView.tsx |
|---|---|---|
| P2a | L-B | |
| P2b | L-C | |
| P3a | | W0 |
| P3b | W1 (host seam only) | W2 |
| P3c | | W4 |
| P3d | | W5 |

Hook order in `Canvas.tsx` is load-bearing. Read `src/renderer/canvas/CLAUDE.md`
before editing it. L-B leaves a `<TierLayer/>` placeholder and a recovery-overlay
slot so L-C and L-F do not reorder hooks.
