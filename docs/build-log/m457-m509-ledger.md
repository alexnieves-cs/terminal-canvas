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
| #31 | M465 | `shots.yml`: every scene painted on `macos-latest` (offscreen at 2x, so the runner's 1024px screen cannot clamp it), published as a phone gallery (artifact + the orphan `shots-gallery` branch). Harness fixes the first runs exposed: a hidden window's first capture is a stale frame (the three dark scenes that captured light), each `rd-*` scene paints its own steward fixture, `runner` is not a private word on GitHub runners, the flowchart scenes use ⌘0 (Fit all) and the palette's New shell since the redesign moved ⌘1/⌘N. Also the dispatch-only `goldens` job (M467): `UPDATE_GOLDENS=1 verify:visual` on the runner, pending list trimmed, a `goldens/run-<id>` branch for a PR; the fixture path is `/tmp` on CI so a runner image cannot move it | shots run: 97 scenes, 0 failed; `verify` |

## C — Autonomy (M475–M486)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #33 | M475 (C1a) | Check-gated done: `AUTO-DONE` is a claim; a run started with a check runs it after the marker and only exit 0 is `checked`; a failed check goes back as the next turn up to its retries, then stuck: check; no check is `claimed` ("done · unchecked", never "passed"). Production runner `auto-check-runner.ts` | `verify:auto` auto.check.1–14 |
| #36 | M476 (C1b) | The chip says `checked` or `agent says done`; the review queue names the check that passed and sorts checked work first, bare claims last | `verify:ux` ux.verdict.1–3 |
| this PR | M477 (C2a) | Tonight batches: one auto run at a time on existing chats, each with an optional check and budget; a usage limit pauses and resumes the same task, never stops it; `powerSaveBlocker` held only while a batch runs, released on every exit (done, stop, quit, error). No door yet (C2b) | `verify:auto` tonight.1–6 |

## D — Reach (M487–M494)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #35 | M487 | `tc mcp`: a stdio MCP server (`@modelcontextprotocol/sdk`) where each of nine tools is one control-socket line; every answer scrubbed per string, then `outward`; `send_to_agent` reaches chats only; a fresh-context critic's two must-fix findings fixed before review | `verify:mcp` (new), `verify:control` |
| #42 | M488 | Gated MCP writes: `approvals`/`answer`/`accept` socket verbs and `list_approvals`, `answer_approval`, `accept_review` tools; writes refused by name unless `remote.mcpWrites` (default off, not plan-writable), always refused for a panel token; `accept` merges only at a full `expectHead`; each write on the decision audit; critic findings fixed, merge race filed as Q-001 | `verify:mcp` gate.1–5, `verify:control` |

## E — Cut and untangle (M495–M509)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #34 | M498 (E4) | `CenterPages.tsx`: the Orchestrate, Team, Focus, Sessions and Review pages leave `Canvas.tsx` verbatim. 10,695 → 10,417 lines | blocking `verify` green; four text checks read the new file and require `<CenterPages>` |
| #37 | M499–M506 (E4) | Eight hook seams (`useSkillsPane`, `useWorkflowVerbs`, `usePreviewVerbs`, `useCreationVerbs`, `useObjectVerbs`, `useChatSwapVerbs`, `useNavigatorModels`, `useAttentionModels`), each a contiguous run at its old position. 10,417 → 8,094 | text checks re-pointed at the new files, each still requiring the call in Canvas |
| #41 | M507 (E4) | Fourteen more seams: hooks (`useRunRows`, `useTaskLens`, `useAnnotations`, `useShellTail`, `usePanelGestures`, `useShellSettings`, `useShellReads`, `useMainRows`, `useHistoryVerbs`, `useSnapAndAgentLinks`, `useRunningSessions`) and render functions (`renderPanelNode`, `renderHostOverlays`, `renderInspectorPane`, `renderShellChrome`, `renderWorldLayers`), each called at its old position. 8,094 → 3,978, under the 4,000 target | blocking `verify` green; text checks follow the code into the new file only while Canvas still calls it; `memo-stable.1` (lane A) re-pointed in #38 |

## F — Visual and motion polish (M510–M519)

Added after the run opened, at the owner's request. Plan: [docs/streams/polish.md](../streams/polish.md).

| PR | Milestone | What | Checks |
|---|---|---|---|
| #43 | M510 | Lane F: `ownership.json` (F owns `polish.md`, `verify-polish.cjs`), the `st:F` fence, `streams.own.1` covers A–F, the run book's row, `docs/streams/polish.md` | `verify:meta` streams.own.1 |
| this PR | M511–M512 | Top-bar search capped at the page switch's right edge; the empty canvas's note above the zoom bar; the blank card a glass surface on `first-arrive`. `--dur-state`/`--ease-spring` (+ `MOTION_STATE_MS`); tone edges, glows, words and dots fade on the state speed; one measured, sliding thumb for `SegmentedControl` and `Tabs` | `verify:polish` (new) polish.fence/motion/tokens/thumb/topbar |
