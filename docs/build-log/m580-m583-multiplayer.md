# M580–M583 — the multiplayer canvas: handoffs and a shared review queue

Lane P of the bold-directions run ([bold.md](../streams/bold.md) § P). Built 2026-10-26.

The shared canvas has been live since M333: one workspace Y.Doc per shared workspace,
presence and cursors, a per-field CRDT, roles, shared text, the relay, and a collab
server that judges every client update. M375–M379 added the team's approval queue. What a
team still could not do on it was pass work to each other or check each other's results.
This lane adds those two, in the same doc and through the same one table.

## What landed

- **M580.** Lane P in `docs/streams/ownership.json`, the `st:P` CSS fence, `streams.own.1`
  over A–P.
- **M581 — the record.** `canvas:handoffs` and `canvas:reviews` (`shared/canvas-doc.ts`),
  one field map per object and one field per person (`reply:<id>`, `claim:<id>`,
  `verdict:<id>`), each written once. Seven ops in `shared/canvas-ops.ts`:
  `handoff-open`, `handoff-reply`, `handoff-withdraw`, `review-open`, `review-claim`,
  `review-verdict`, `review-close`. `inspectUpdate` reads a raw update back as them, and
  anything else in those maps comes back `unknown`. The policy (`shared/team-flow.ts`):
  `handoffState`, `stewardOf`, `reviewDecision`, the rows and their words.
- **M582 — main.** `CanvasSync.teamFlow` (the person's queue) and `writeFlow` (one write in
  their name; ids, the chain number, the time and the scrub are made here; a decided
  review is closed by its poster's Done, as the verdicts decided). `createTeamFlowDoors` adds the room's people.
  Channels `team:flow`, `team:flow-write` (body shape-checked by `parseFlowRequest`, no name
  in it) and `team:flow-changed`; `INERT_PRESENCE` answers none.
- **M583 — the screens.** Needs you gains *Handed to you* (Take it, Decline), *Review queue*
  (I'm looking, Approve, Ask for changes) and *Waiting on your team* (Withdraw), in the team
  asks' shape; the notifications label counts them. Palette rows: *Hand off X to Bea*,
  *Offer X to anyone on the team*, *Ask the team to review X* (at rest for the captured
  panel, by search for the rest), and *Take*, *Approve*, *Ask for changes* for what waits.
  A handoff to this person also joins the attention cycle: ⌘J and the pill's Jump walk
  it after the agents waiting on them, and the bell counts it once per panel (asked for by
  the UI/UX audit, PR #72). It stays off the frozen queue's kinds; a panel already queued
  keeps its place, so nothing is visited or counted twice.

## Decisions, and why

See bold.md § P decisions. The ones most likely to be undone:
- **A handoff moves responsibility, not a process.** The agent keeps running on its Mac.
- **A handoff settles without its maker online.** Its replies alone decide it.
- **The holder chain is numbered and checked by the server**, never ordered by a clock.
- **Nobody reviews their own result**, and one "changes" decides a review.
- **`teamFlow` has no plan or workflow-node door**, on purpose (verb-table's reason).

## Checks

`verify:multiplayer` (new, plain node): the role tables (`mp.auth.1–2`), the
state rules (`mp.state.1`), the server's read-back (`mp.inspect.1`), three real
canvas-syncs over a relay (`mp.flow.1–2`, `mp.review.1`), the request parser
(`mp.parse.1`), the doors (`mp.doors.1`), the screens' wiring (`mp.ui.1`), the attention cycle's wiring (`mp.attn.1`), and a real
Hocuspocus server with real providers (`srv.mp.1`). `verify:canvas-sync` 98/98,
`verify:palette`, `verify:verbs`, `verify:styles`, `verify:presence`, `verify:team` stay green.

## Critic

A fresh-context critic found three gate defects, all fixed with checks: one update could
open two handoffs of one panel (now refused, and ties break by id); a poster could close
their own review as approved (now only withdrawn or what the verdicts decided); and the
gate re-read every handoff per panel on every update (now one read per update). It also
found that auto-closing a decided review raced a second reviewer, so Done replaces it.

## Owed

- **The audit trail** (request Q-008): the server judges the seven ops but does not yet
  record them, because the trail's words are pinned by a migration and `server/` is lane D's.
- **A "with Bea" mark on the panel itself.** The snapshot carries `stewards`; the panel rim
  does not draw it yet, so the holder is said in Needs you and the palette only.
- **A note when handing off from the palette.** The palette's rows send an empty note; the
  note field exists end to end and wants a small sheet.
- **Electron DOM checks and a golden** for the new rows, and a live two-Mac run.
- **An honest race** (shared with the asks): two people accepting an open offer within the
  same replication window, or a verdict racing Done, has the server refuse the later write
  and close that connection; the client has no reset after a 4403 yet.
- **Server-side scrub.** Words are scrubbed on the writer's machine, as the asks' are; a
  modified client could send raw text.
