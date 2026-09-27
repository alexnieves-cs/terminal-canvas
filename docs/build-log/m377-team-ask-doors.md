# M377 — a teammate's side of the team queue: the asks they may answer, and their answer

**Verdict: shipped (main, the contract and the bridge; the Needs-you rows, the palette
rows and their golden are M378).** M376 put an agent's permission request in the shared
workspace doc. A teammate's machine now has what it needs to show and answer one:
- `team:asks` answers with every open ask of someone else's, in a shared workspace this
  person may EDIT, that they have not answered yet. It gives oldest first, the asking
  agent's placeholder and its title, the owner's name when presence knows them, the
  tool, its scrubbed line, and how many allows it has and needs.
- `team:ask-answer` writes one answer, allow once or deny, in the signed-in person's
  name.
- `team:asks-changed` pushes the list again whenever a teammate opens, answers or closes
  one.

## What landed

- **`TeamAskRow`** and **`teammateAskRows`** (`shared/team-asks.ts`, pure):
  - an ask the answers have already decided is left out;
  - so are a closed ask, the person's own asks, and anything they already answered.
- **`CanvasSync.teammateAsks`** (`presence/canvas-sync.ts`): every bound shared workspace
  the person may edit. A viewer is asked nothing, because the server would drop their
  answer.
- **`createTeamAskDoors`** (`bootstrap/presence-wiring.ts`):
  - the rows, with each owner's name from the room's roster;
  - the answer, written as main's signed-in person through canvas-sync's authorised
    write;
  - the push. canvas-sync's `onAsks` now also pushes the list, and our own answer
    pushes it from the door, since no observer echoes our own write.
- **Three channels** (`shared/ipc-contract.ts`, `preload/index.ts`, `main/ipc.ts`,
  CLAUDE.md's list, the README's diagram): `TEAM_ASKS`, `TEAM_ASK_ANSWER` (its body shape-checked in main,
  with no name in it) and `TEAM_ASKS_CHANGED`. They are exposed on
  `window.canvas.team` as `asks`, `answerAsk` and `onAsks`. `INERT_PRESENCE` answers
  none, and refuses every answer by name.

## Decisions, and why

- **The name is main's, never the request's.** `team:ask-answer` carries a workspace, an
  ask and allow-or-deny, and no user. Main writes the signed-in person, and the collab
  server checks that against the connection (M375). A renderer cannot answer as someone
  else, and neither can a modified client.
- **A viewer is asked nothing.** The server drops a viewer's write. Listing an ask they
  cannot answer would be a needs-you with no possible answer.
- **Decided asks leave the list before the owner closes them.** Between a second allow
  arriving and the owner's machine writing `closed`, the answers already decide the ask.
  A row that stayed would invite an answer that changes nothing.
- **The owner's name only when presence knows it.** The doc holds a user id. Showing one
  as a name, or guessing, is worse than "a teammate" (M378's words).

## Checks

- `verify:canvas-sync team.rows.1`, over three real canvas-syncs (owner, editor, viewer),
  relayed:
  - the editor's list is someone else's open asks, oldest first, with the placeholder's
    title, the owner's name, the need and the progress;
  - a closed ask, the owner's own and anything for a viewer are absent;
  - answering drops the row, and the owner's doc holds the answer;
  - an answer written in another's name is refused.

  83/83.
- `verify:ipc 1`: every contract channel has a handler. Its pinned count is 204, with a
  comment line naming the two new invoke channels.
- `verify:meta 14`: the README's diagram carries all three. CLAUDE.md's channel list
  does too.
- `verify:presence` 33/33 and `verify:account` 61/61 stay green.

No display changed, so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean and the plain suites this milestone reaches
are green (see Checks). The full `npm run verify` ran once for the team-queue chain
(M375–M379) on the tree holding all five; its result is in M379's ledger.

## Owed

- **M378 (proposed): the rows in Needs you.**
  - A "Your team is asking" section with the tool and its line, whose agent it is, the
    progress words, Allow once, Deny, and a jump to the placeholder.
  - The badge counts them.
  - A palette row per ask, which is a person's door only. A plan, an agent and a
    workflow node may never answer a permission question (`answerApproval`'s reason,
    M98).
  - The owner's `waiting` said where Allow was pressed.
  - A golden with a critic.

Next: M378 (the team's asks in Needs you).
