# M304–M305 — the Watch lens and the task chrome

Branch `m304-orchestrate-live` (worktree `../tc-orch-live`), off local main `0dc3a801`.
Direction: the approved mockup at https://claude.ai/artifact/DfAMmtUs8JiiW3YvzPWe2W
("one task, one next step, one scene", then "make the centre significantly more 3D and let
the person watch the work").

## M304 — Watch

A third lens beside Scene and List: a perspective three.js scene a person can orbit, which
draws the WORK rather than the roster.

| What happened | What Watch draws | Read from |
|---|---|---|
| A session is working / waiting | an iris (amber) core that turns, two orbit rings when working, a glow | the roster's state |
| Idle / ended | a settled cube, no light; ended is see-through | the roster's state |
| A file was read | a pale scan ring walks down its tower | `tool_use` Read / Grep / Glob / ACP `read` |
| A file was written | an arc from session to tower carrying the first written line (scrubbed), then a green slab drops; red for removed lines | `tool_use` Edit / MultiEdit / Write / codex `apply_patch` / ACP `edit` |
| A command ran | a column rises from the station and resolves to a green or red flare from its `tool_result` | `tool_use` Bash (and a terminal's live command) |
| Two sessions wrote one file | an amber ring round its tower | the model's `writers` |

- `orchestration-live.ts` is the pure model (plain-node, `orch-live.1–.7`): tool mapping by
  name across engines, events keyed `session:toolUseId`, towers capped at 12 (the rest
  counted), a layout that is deterministic from its inputs, and `orchLiveFresh`, whose
  FIRST read animates nothing — history stands as towers and never replays.
- `OrchestrationLive.tsx` is the scene, reached only through `lazy()` (`orch-live.door.1`),
  on the demand frameloop (`orch-live.frame.1`), reusing the one bloom door.
  `orch-zoom.3`'s importer set now names it.
- Every string it paints — a token, a command, a path — crossed `outward()` in the view
  before it was a string in the model (`orch-live.4` plants a key and reads the model).
- Tower height is the lines the SESSIONS wrote (1 slab ≈ 4), labelled with the number,
  and the legend says "not git": the workbench's Changes tab is git's count.
- Watch is not the default lens. The Scene is the hit-accurate diorama every
  `verify:panels:orchestrate` check drives by its SVG targets; Watch is a perspective
  camera and cannot be pixel-matched to one. The lens is a persisted preference, so one
  press keeps it.

## M305 — the chrome

- A task header replaces M299's title row, its four count tiles, the blocker strip and the
  command row: a mono eyebrow, the goal as the page title in the display serif, placement
  and the blocker sentence on one line (`#orch-blocker` kept, `orch.lens.2`), the board's
  own four words as a stage rail, and the actions with Review changes as the one filled
  primary (`.is-primary`).
- The roster is grouped by state — Working, Needs you, Idle, Ended — with each count as
  its group's header; an empty group is not drawn. The Working and Needs you headers are
  the metric lens's door (the tiles' click since M269).
- Needs attention became a Needs-you card that renders only when something needs the
  person; `Nothing needs you` was a zero-value statement at rest.
- The workbench's Changes tab opens its first file's diff through the same gate a click
  uses, so the middle is never "Choose a file".

## Traps met

- **A regex that deletes the first line of a multi-line CSS rule leaves its body
  dangling**, and the stray `}` swallows the NEXT rule silently: the serif title rule was
  eaten this way, with every suite green (`verify:styles` does not parse brace balance).
- **`disposeObject` on a glow sprite disposed the SHARED glow texture**; and
  `sparks.forEach(disposeObject)` passed the index as the `maps` flag. Only a token label
  owns its map now.
- **The chat store drops events for panels it never seeded**, so a shot scene run alone
  (SHOT_ONLY) must `loadMain()` first or every seeded turn vanishes.
- **A strict bounding-sphere fit leaves a flat scene a speck**: the fit factor is 0.56,
  measured.
- **`state.2` forbids spelling a state word**: Watch reads `TONE_WORKING` and
  `agentWord()` like every other renderer file.

## Critic and goldens

(Round 1 rejected Watch — label collisions, a crop, an idle callout, a different window;
fixed. Round 2 verdicts below, recorded before `UPDATE_GOLDENS=1`.)

Round 2, the fresh-context critic's verdicts, written before the goldens:

- **orchestration** — Accept: the task header, stage rail, single filled primary, roster grouped by state and auto-opened diff all render cleanly in light theme; the station-label overlaps and the clipped workbench row predate this change.
- **orchestration-dark** — Accept: it matches the light capture in dark theme, with a clearly lit current stage and a legible "Review changes" primary and no new defects.
- **orchestration-working** — Accept: the WORKING/IDLE groups with counts, the blue working state and "Next: Watch its output" correctly show a live session.
- **orchestration-watch** — Accept: in the same 1440x900 window as its siblings, the callout with its stem follows the working session, the platforms outside the task are unlit steel, the tool buttons are styled, and the collision pass clears the tower labels; the arc-token overlap on health.ts and the slight edge clipping of the fit are follow-ups, not blockers.

The four goldens were written from those captures (at GOLDEN_SCALE) and no other scene's
golden was touched — `UPDATE_GOLDENS=1` rewrites every scene, so it was not used. After the
verdicts the fit factor moved 0.5 → 0.56 (the critic's edge-clipping note) and Watch was
recaptured before its golden was written.

Owed: the arc token is not in the label collision pass (a transient, so it is exempt from
the golden); `verify:visual`'s watchdog was sized for 64 scenes and this adds a 65th (~4 s
of a 57 s margin) — re-measure per the comment above `const WATCHDOG`.
