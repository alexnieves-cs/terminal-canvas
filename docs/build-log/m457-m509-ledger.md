# M457–M509 ledger — the streams run, 6.0 to a finished product

Run book: [docs/streams/RUN.md](../streams/RUN.md).
Plan: [docs/streams/ROADMAP.md](../streams/ROADMAP.md).
Ownership: [docs/streams/ownership.json](../streams/ownership.json).
**This ledger is the state.** One row per merged PR, newest at the bottom of its stream.

## Decisions

- 2026-10-21: the owner chose all five streams at once, and to ship 6.0.0 unsigned
  (signing and notarization are decided before 6.1).
- Goldens are written only after the owner has looked at the CI shot gallery.

## S0 (M457) — run scaffolding

| PR | What | Checks |
|---|---|---|
| this PR | Lanes A–E in `docs/streams/ownership.json`, the hook reads them (lane from `RD_LANE` or `.git/tc-lane`), `st:<lane>` CSS fences, this ledger, `verify:meta streams.own.1` | `verify:meta` |

## A — Trust the gate (M458–M464)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #32 | M462 | `verify:visual` runs on CI as a non-blocking job and uploads every scene (`out/visual/`): `TC_VISUAL_SCALE`/`TC_SHOT_SCALE` paint 2x on the runner's 1x screen, `VISUAL_SHOT_DIR` keeps the captures, the watchdog honours `TC_WATCHDOG_SCALE` | job uploaded 97 scenes; size and "runner" paint issues are B's (#31) |

## B — Ship 6.0 (M465–M474)

| PR | Milestone | What | Checks |
|---|---|---|---|

## C — Autonomy (M475–M486)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #33 | M475 (C1a) | Check-gated done: `AUTO-DONE` is a claim; a run started with a check runs it after the marker and only exit 0 is `checked`; a failed check goes back as the next turn up to its retries, then stuck: check; no check is `claimed` ("done · unchecked", never "passed"). Production runner `auto-check-runner.ts` | `verify:auto` auto.check.1–14 |
| #36 | M476 (C1b) | The chip says `checked` or `agent says done`; the review queue names the check that passed and sorts checked work first, bare claims last | `verify:ux` ux.verdict.1–3 |
| #39 | M477 (C2a) | Tonight batches: one auto run at a time on existing chats, each with an optional check and budget; a usage limit pauses and resumes the same task, never stops it; `powerSaveBlocker` held only while a batch runs, released on every exit (done, stop, quit, error). No door yet (C2b) | `verify:auto` tonight.1–6 |
| this PR | M478 (C3) | Morning queue: one list across every task in the welcome-back card, worked in order — failed checks first (an auto run stuck on its check counts), then decisions, then work: checked, then to review, then agent-says-done, cheapest (fewest files) first within each | `verify:ux` morning.1–3 |
| this PR | M479 (C4) | Collision radar: sibling lanes of one repository that changed the same files (committed or not, against their fork from main), and git's trial merge of each such pair (`merge-tree --write-tree`, no checkout touched), flagged on BOTH tasks' work cards: a conflict in the needs-you tone, a clean overlap quiet. New channel `lane:radar`; read on the handoffs' trigger, never a timer | `verify:review` radar.1–5 |
| this PR | M480 (C2b) | Tonight's doors: the `tonight` verb (`tonight stop` ends it) with all four doors — Run tonight on the New task sheet, the `task.tonight` palette row, `tc plan tonight`, an action node — refused to a teammate's plan. The renderer names the board's open tasks with a live conversation (brief and criteria as the task, the recipe's checks as the gate) and says which it left out; main parses and runs them. Channels `tonight:start/stop/status`. `tc tonight` short form asked of lane D (requests Q-002) | `verify:verbs` closure.v9.1, tonight.doors.1; `verify:auto` tonight.batch.1 |

## D — Reach (M487–M494)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #35 | M487 | `tc mcp`: a stdio MCP server (`@modelcontextprotocol/sdk`) where each of nine tools is one control-socket line; every answer scrubbed per string, then `outward`; `send_to_agent` reaches chats only; a fresh-context critic's two must-fix findings fixed before review | `verify:mcp` (new), `verify:control` |

## E — Cut and untangle (M495–M509)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #34 | M498 (E4) | `CenterPages.tsx`: the Orchestrate, Team, Focus, Sessions and Review pages leave `Canvas.tsx` verbatim. 10,695 → 10,417 lines | blocking `verify` green; four text checks read the new file and require `<CenterPages>` |
| #37 | M499–M506 (E4) | Eight hook seams (`useSkillsPane`, `useWorkflowVerbs`, `usePreviewVerbs`, `useCreationVerbs`, `useObjectVerbs`, `useChatSwapVerbs`, `useNavigatorModels`, `useAttentionModels`), each a contiguous run at its old position. 10,417 → 8,094 | text checks re-pointed at the new files, each still requiring the call in Canvas |
