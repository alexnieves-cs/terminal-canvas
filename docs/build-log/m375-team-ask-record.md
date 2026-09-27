# M375 — the team ask: a permission request in the shared doc, answered in one's own name

**Verdict: shipped (the record, its rules and its policy; the owner's machine publishing
and deciding is M376, and a teammate's answer on screen is M377).** Arc 2 asks for a
multi-human approval queue with spend thresholds, aligned with ACP's
`session/request_permission`. Permission requests route to a team queue, and spend limits
trigger escalation. Until now an agent's permission request could be answered only on
the machine that runs it, by the one person at that keyboard.

A team ask is that request as the shared workspace records it:
- the asking agent's panel, and whose agent it is;
- the tool, and a scrubbed summary of what it would do;
- how many people must allow it: one, or two once the agent's spend has reached the
  team's line.

Every member sees it. Answers are allow-once or deny, one per person, each in the
answerer's own name, and the collab server refuses any other. The owner's machine closes
it once, with how it ended.

## What landed

- **`SharedAsk`**, **`AskAnswer`**, **`AskOutcome`** and three ops (`shared/canvas-ops.ts`):
  - `ask-open`: for your own agent, in your own name;
  - `ask-answer`: in your own name, while the ask is open;
  - `ask-close`: by the ask's owner, once.
  
  The role table gains the three, and a viewer does none of them.
- **`canvas:asks`** in the workspace doc (`shared/canvas-doc.ts`):
  - one field map per ask, with one field per person's answer (`answer:<user id>`), so
    two people answering at once both survive;
  - `readSharedAsks`;
  - `applyCanvasOp`'s three writers;
  - `opContext`;
  - `inspectUpdate` reads a raw update back as the three ops. A rewritten answer, a
    rewritten field, an ask created with an answer already inside, and anything else
    come back `unknown`, and the table refuses them.
- **`shared/team-asks.ts`** (new, pure): `approvalsNeeded(spent, line)`,
  `askDecision(need, answers)` and `askProgressWords`.

## Decisions, and why

- **The server judges who answered.** A Yjs write carries no author. The field's name
  does (`answer:<user id>`), and `beforeSync` compares it with the AUTHENTICATED user of
  the connection that wrote it. A modified client cannot answer in someone else's name:
  the connection is closed and the room never sees the answer (`srv.ask.1`).
- **Allow-once and deny only.** ACP's options include `allow_always`. A standing grant on
  someone else's agent is not a teammate's to give, so M98's session grants stay the
  owner's, on the owner's machine.
- **One deny decides.** A person who says no to a command on a shared canvas is not
  outvoted by a second yes.
- **Two distinct people past the line, not two answers.** An answer is one field per
  person and written once, so one person cannot count twice.
- **Written once, never rewritten.** An answer and an outcome are each permanent. The
  owner decides over answers that cannot move under it, and a closed ask cannot be
  reopened (the tombstone rule's reason, one map over).
- **The owner answering is one person like any other** (M376 writes their answer to the
  doc in their own name). The count is one count, and everyone sees it.

## Checks

- `verify:canvas-sync`:
  - `ask.policy.1`:
    - one allow, or two at or past the line;
    - no line means no escalation;
    - one deny decides;
    - the progress words.
  - `ask.auth.1`, the table: opening for another's agent or in another's name, answering
    for another, after the close, or for no such ask, and closing another's ask, each
    refused by its own sentence. A viewer does none of it.
  - `ask.inspect.1`, reading a raw update back:
    - open, answer and close are read as themselves;
    - a rewritten answer, a rewritten field and an ask created with an answer inside
      are `unknown`.
  - `srv.ask.1`, through a real Hocuspocus server:
    - an editor's own answer reaches the owner;
    - the same editor answering in the owner's name is refused and closed;
    - a viewer's answer is dropped;
    - the owner's close reaches the editor.

  79/79.

No display changed, so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean and the plain suites this milestone reaches
are green (see Checks). The full `npm run verify` ran once for the team-queue chain
(M375–M379) on the tree holding all five; its result is in M379's ledger.

## Owed

- **M376 (proposed): the owner's machine.**
  - For an agent whose owner routed it to the team (off by default), main writes each
    permission request as an ask, the summary scrubbed with the count kept
    (`redactSecrets`' caller list, deliberately).
  - It reads the answers, decides with `askDecision`, and answers through
    `answerPermission`.
  - A local answer writes the owner's own answer and closes the ask.
- **M377 (proposed): a teammate's answer.** A team ask in a teammate's Needs you, with
  Allow once and Deny, the progress words, and its four doors.
- **Closed asks stay in the doc.** They are small: a few hundred bytes of fields each.
  Pruning a closed ask is safe, because nobody may write into it, but it needs its own op
  and check.

Next: M376 (the owner's machine publishes, reads and decides).
