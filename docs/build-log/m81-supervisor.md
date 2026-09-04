# M81 — The supervisor

**Branch:** `m81-supervisor`. **Spec:** `docs/superpowers/specs/2026-09-04-m81-supervisor-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m81-supervisor.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** an agent whose subject is the canvas itself — it can read what every
panel is doing, and it answers in the same words the canvas uses.

## What landed

- `tc status`: a fifth control verb, parsed on the socket, refused by name at the URL door,
  refusing a `command` key like every other verb, with no arm that spawns, focuses or writes.
  Its reply carries the canvas model — panels with their state WORD, cwd and cost; edges with
  their trigger words; runs with their outcome and cost. `verify:control status.1–.2` (9/9).
- `canvas:model`: the renderer's answer, over the ephemeral reply channel `canvas:counts`
  uses (an event, not an invoke, so `verify:ipc`'s handler rule does not cover it), read
  entirely from refs. A window that does not answer yields an empty model with a note.
- `--append-system-prompt` in `headlessArgs` and `AgentSessionSpec`, riding every spawn;
  `SUPERVISOR_PROMPT` in `shared/agent-session.ts`; `ChatSource.supervisor` through the
  parser, the panel factory, the layout adapter and `useChatSessions`' restore.
  `verify:agent-session supervisor.1` (70/70).
- The spawn sheet's `supervisor of this canvas` row — disabled by name when one exists or
  when `claude` is absent — creating a chat with that prompt and `What is this canvas doing?`
  in its composer, unsent.
- `verify:panels supervisor.1` (286/286): `tc status` over the REAL socket, its model
  compared against the DOM's own words, a `command` key refused, one supervisor, its question
  unsent. A `supervisor` shot scene. README row; CLAUDE.md note and counts; verify-suites
  counts; three `docs/load-bearing.md` entries; this log.

## Red first

- `verify:control status.1–.3` red at the verb (unknown), then at the handler's missing arm,
  then at the word producers.
  `verify:agent-session supervisor.1` red at the absent flag.
- The first `status.1` asserted the URL door ANSWERS a status; it does not, by M54's design —
  a URL has nowhere to put a reply. The check now pins the refusal and the spec says so.
- **The verifier found what no check saw**: `appendSystemPrompt` was spread INSIDE the
  session's `counters` object, so `session.appendSystemPrompt` was always undefined and no
  real spawn ever carried the prompt — every supervisor was an ordinary chat with the right
  title. It typechecks. `verify:agent-session supervisor.1` now drives the MANAGER to the
  runner's argv rather than calling `headlessArgs` directly, and goes red without the fix.
- `verify:panels supervisor.1` red four times, each a real defect: the panel factory dropped the
  `supervisor` flag (so a second supervisor was still offered), and the model captured a
  stale `dormantIds` — it told the supervisor a woken panel was `asleep` while the pill said
  `idle`, which is exactly the disagreement the check compares for; then the stored-flag
  clause read the wrong path (the flag lives on the chat SOURCE, where `copyChatSource`
  writes it); then the sheet was opened with a menu accelerator the harness does not have
  (it opens through the palette's own row).

## Decisions taken while building, and why

- **Read-only by construction**, not by prompt: the verb has no writing arm.
- **The model is the renderer's**: main knows sessions, not words, edges or runs.
- **The prompt rides every spawn** and the flag lives on the panel: the CLI keeps no record.
- **The first question is inserted, never sent** (M80's rule, reached again).
- **One supervisor per canvas**, said by a disabled row rather than a missing one.

## What this milestone does not do, stated

- No interval re-ask: the supervisor answers when asked. A timer would spend tokens on a
  canvas nobody is looking at, which is the rule `machine:sample` already states.
- The summary line is not mirrored into the status strip; the strip's slot is the selection's.
- `tc status` reports; nothing in this app lets an agent act on the canvas.

## The visual loop

**The critic** (briefs + the PNG, fresh context). Accepted: the preview — the only text that
says what a supervisor IS — shared a line with the key hints and was cut off mid-sentence (it
has its own wrapping row now); the one-per-canvas rule was stated only as a refusal (the
preview says it in both directions); nothing said what would land (`it starts asleep and
reads the canvas on your first send`); the title field hid its honest default (`supervisor`
as the placeholder). Declined, recorded: the HOW row's three `default …` values and the
sheet's heading ellipsis are M65's design, unchanged here; the WHERE field holds a real
editable path, so it cannot be left-truncated the way a row's label is.

**The verifier** (spec + diff, fresh context): "delivered with gaps", and its first finding
was the milestone's real defect — see Red first. Accepted and fixed: the misplaced field; the
control check that asserted a pass-through (`status.3` now checks the word PRODUCERS); a
document kind reporting its kind name as a state word; `cost: 0` for a panel with no usage
recorded; edges without a rule vanishing from the model rather than reporting `off` or
`none`; one-supervisor enforced only by a disabled option (the create path refuses too, and
the check reads the option from the DOM); the durable round trip unchecked (the flag is read
back off the store); a rejecting `canvas()` escaping into the socket's reply path; the DOM
word comparison being vacuous if the attribute were renamed (a non-vacuity clause); the
resume+append claim, the launcher's PATH and the first permission request now recorded as
manual-only; both IPC diagrams updated with `canvas:model`. Declined with reasons: `canvas?`
being optional on the handler's deps (every other dep there is required for the same reason,
and a missing one degrades to the named third state, which is the honest answer).

## Verification

Run alone, after the tmux verify server was killed: `npm run verify` green end to end —
`verify:control` 10/10, `verify:agent-session` 70/70, `verify:panels` 286/286, `verify:ipc`
80 channels. The `supervisor` scene re-shot twice and read.
