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

## B — Ship 6.0 (M465–M474)

| PR | Milestone | What | Checks |
|---|---|---|---|

## C — Autonomy (M475–M486)

| PR | Milestone | What | Checks |
|---|---|---|---|

## D — Reach (M487–M494)

| PR | Milestone | What | Checks |
|---|---|---|---|

## E — Cut and untangle (M495–M509)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #34 | M498 (E4) | `CenterPages.tsx`: the Orchestrate, Team, Focus, Sessions and Review pages leave `Canvas.tsx` verbatim. 10,695 → 10,417 lines | blocking `verify` green; four text checks read the new file and require `<CenterPages>` |
| #37 | M499–M506 (E4) | Eight hook seams (`useSkillsPane`, `useWorkflowVerbs`, `usePreviewVerbs`, `useCreationVerbs`, `useObjectVerbs`, `useChatSwapVerbs`, `useNavigatorModels`, `useAttentionModels`), each a contiguous run at its old position. 10,417 → 8,094 | text checks re-pointed at the new files, each still requiring the call in Canvas |
