# M117–M121 — Engines, and a chat with no place: build log

Branch `m117-engines`, base `main@2d088e2` (Act I merged). One spec
(`docs/superpowers/specs/2026-09-06-m117-m121-engines-design.md`), one plan
(`docs/superpowers/plans/2026-09-06-m117-m121-engines.md`), two tracks on the one branch:
Track A (M118 copilot → M120 chat mode) in the main session, Track B (M119 the ACP client,
then M121's seven) as a fresh-context subagent in a worktree off the rows commit. Every red
check is its own commit before its feat commit — Act I's verifier could not prove
written-first from git, and now it can (`git log --oneline main..m117-engines` alternates
`check(…) — red` and `feat(…)`).

## M117 — `cursor-agent`, refused by name

Constraint 4. The CLI is installed and was not logged in on this machine; the headless door
refuses with the vendor's own sentence, and login is a browser step only a person can take.
No stream exists, so no row: a row from the help text would be a guess dressed as a
measured fact, and `BACKENDS` is a table of measured facts. The three steps that land it are
`docs/ideas-backlog.md` #80. 3.0.0 stands — the board landed and copilot is the third
engine.

## M118 — copilot, the third row

Measured, not read: GitHub Copilot CLI 1.0.83's JSONL door, recorded in Act 0
(`scripts/fixtures/agent-session/copilot/{pong,command,resume}.jsonl`). The facts that shaped
the row, each pinned by `copilot.1`/`copilot.2`: the stream states NO session id — every
line's `parentId` is the previous event's id — so the host pins one with `--session-id` and
resumes with `--resume=`, claude's shape behind codex's process model; the parser is TOLD
the id (`ParseContext`, `parseChunk`'s third argument, ignored by the other two); the manager
marks `everSpawned` on the first `session` event for a per-turn row that does not adopt, or
the second turn would pin the same id again and start a conversation with no memory (the
one red in `copilot.2.b`, found by the check). `assistant.turn_end` fires per model call —
it is `message-end`, and `result` is the turn's end. `--allow-all-tools` is required
headless, so no permission ever reaches the host and the row says so. `--no-auto-update`
because the CLI replaced itself between two Act 0 recordings. Credits are not tokens: no
usage, no cost.

Four row fields landed for EVERY row in one commit so `registry.2` went green once:
`appendsPrompt` (only claude — the supervisor row, the routine mint and the dispatch verb all
mint through `beginNewChat`, which refuses an appended prompt by the row's `noPrompt`
sentence), `handshake` (only acp), `sandboxArgs` (M120's), `models` (copilot's closed list).
`AgentKind` gained `copilot` as a PRESET kind (the interactive CLI in a terminal is real, and
the built-in preset's probe is how the chat doors learn the binary is on the PATH — codex's
rule). The sheet's `SheetWhat` chat arm became ONE arm keyed by `backend`, M90's `codex` kind
folded in: a fourth row needed no new member in the sheet, the mint or the request builder.
`--secret-env-vars` declined (the PTY env carries no credential by construction; naming
variables that are not there invents a list). `AGENT_CAPABILITIES.acp` was not added: `acp`
is not a preset kind (it shares copilot's binary), a small deviation from the spec's §2.1.

## M119 — the canvas as an ACP client (Track B)

Track B's report, folded in at the merge (`d23437a`). `shared/acp-transcript.ts` is the
codec: JSON-RPC over the line seam, both directions, to the one `TranscriptEvent` union —
`initialize`'s answer as a `session` event carrying `negotiated`, `session/new`'s as the
adopted id, `agent_message_chunk` as block deltas, `tool_call`/`tool_call_update` as the
tool pair, the prompt's result with token usage, `session/request_permission` as the one
`permission-request` event with the option ids riding in `input.__options`, and
`session/load`'s replay as `replay: true` turns. The adapter grew optional encoders the
manager PREFERS when a row has them; two deviations from the plan, each argued: the
handshake is TWO hooks (`handshake` at spawn, `openSession` once `initialize` answers),
because the resume decision must read `negotiated.loadSession` from that answer and cannot
be minted up front; and `session/cancel` is a NOTIFICATION (no id) per ACP. The codec's
pending-request state lives in `session.carry` as JSON — reset on spawn and exit, so a dead
process's ids can never match a live one. The first send is HELD until the session opens;
`interrupt` is refused while a prompt is held. The grant lands at answer time: `index.ts`
grants before it answers, so `Allow for session` is `allow_always` on that very answer.
`clientCapabilities` declines `fs/*` and `terminal/*` by measurement (`acp.4` pins the
line; backlog #81). Three things the checks caught in their feat commits: a load's answer
carries no session id (`noteRequest`'s fourth argument), `acp.4`'s regex first matched the
header COMMENT (the `tone.1` trap, anchored on `export const`), and the ACP fixtures
themselves had never been committed — the blanket `*.log` in `.gitignore` hid them since
Act 0; a scoped negation tracks them now.

## M120 — chat mode, and the model word

`New chat (no folder)`: one palette row per registered row (disabled by the row's
`noSandbox` sentence for acp, by `noCli` for a binary not on the PATH), the launcher's third
card, and `beginNewChat({ sandbox: true })`. Main resolves the cwd to `userData/sandbox/<id>`
through `resolveSandboxCwd` (pure over injected mkdir/rm; an id that is not a plain segment
is refused — the id is minted by the renderer and a `../` in it would be a folder outside
the sandbox root), skips the Places gate BY CONSTRUCTION (the folder is the app's), and
refuses a teammate beside `sandbox` first (`sandboxTeammateRefusal`, one sentence). The
row's `sandboxArgs` ride every spawn through the adapter's `sandbox` input — claude's
`--permission-mode plan`, codex's `--sandbox read-only` placed BEFORE the positional prompt,
copilot's two `--deny-tool`s (denial rules outrank `--allow-all-tools`) — and a row without
them refuses the SEND by name (`refused-sandbox`), spawning nothing. The folder goes on
dispose with `drop`, never on exit. `ChatSource.sandbox` is carried by `carryChatMarks`
beside `dispatch`; the header line reads `sandboxed · no folder` (`SANDBOX_HEADER`), never
the app's directory name, which would read as a project the user never chose. The model
word was already M20's `agentOptions.model`; what landed is the row's `models` list rendered
as a select where the CLI has one (`modelChoices`).

## M121 — the deferred seven (Track B)

One check commit and one fix commit each, the smallest change at the named line: (1) a
routine's chat is MARKED (`ChatSource.routine`, carried by `carryChatMarks` beside
`dispatch` and `sandbox`) so `useChatSessions` appends `ROUTINE_PROMPT` again after a
relaunch; (2) `tc memory add/list --teammate <id>` maps to the `teammate:<id>` root; (3) the
⋯ menu closes on an outside `mousedown` (`verify:panels menu.1`); (4) `flipped` resets on a
workspace switch and the host carries `data-flipped` (`flip.1` widened — it creates a
throwaway `flip-away` workspace); (5) `lineupPlan` takes `queued` so the preview counts the
sends already waiting; (6) `sealAbandoned(runs, at, idle?)` seals an open run whose every
panel is idle at load — Track B noted it is INERT at the two load sites (every panel is idle
at load) and that the observed stale row comes through `useRuns.onAutoEvent` from a seeded
`running` auto status, which it did not redesign; the plan's literal fix, recorded as
such and the observation carried to M124; (7) `.chat__auto` gives (`verify:styles header.2`).

## The checks

`verify:agent-session registry.2` (four rows, four fields), `copilot.1–.1.e`, `copilot.2–.2.b`,
`sandbox.1`, and Track B's `acp.1–.4`; `verify:palette sheet.copilot.1`, `sandbox.1`;
`verify:rail header.2`; `verify:layout chat.sandbox.1`; `verify:file sandbox.1`;
`verify:teammates sandbox.1`; M121's checks per commit. Each red check is its own commit.

## The gate

The shot pass first showed the `chat-copilot` scene's preview reading `chat with claude`
under a copilot row — fixed before the reviewers saw it (the preview names the chosen
row's engine, and now its capability sentence). The scene shows the row DISABLED (`— not on
PATH`): the shot harness strips the PATH, and the codex scene's rule holds — the row is the
assertion on every machine, the mint only where the binary is.

**The critic** (fresh context) found fourteen; taken, every one but one: two refusals
answered in codex's words for every backend (`REASON_NO_CODEX`, `REASON_CODEX_NO_IMAGES`) —
the row's own sentences now; `claude is waiting for your answer` on an acp permission —
the row's label; the pending ACP handshake was a two-state result that could hang silently
with Interrupt enabled to a no-op — `awaitingHandshake` rides the snapshot, the composer
says `waiting for <label> to open its session` with Interrupt disabled by name, and a
handshake nobody answers is killed after the interrupt grace with `handshake-timeout` as
the reason; claude's permission modes and efforts offered to copilot and acp as controls
that did nothing — disabled with `<label> has no permission mode flag`; `default model` and
`auto` as two rows for one meaning — `auto (the CLI's default)` is the empty choice and the
list carries the rest; the sheet's preview names how two copilot rows differ (derived from
the row: asks before a command runs · interrupts · images · a read-only mode); the sandbox
rows sit beside `New chat…` in the spawn group; the acp `noSandbox` sentence names its fix;
the auto chip's ellipsis lived on an inline-flex row and never applied — the words are a
block that gives; the lineups are disabled only when NO row is available; M121 (6) is said
plainly at its call site and in the README row. **Declined:** renaming copilot's deny
arguments to the stream's tool names — `--deny-tool` takes a permission KIND
(`shell(command)`, `write(path)`), which the recorded `copilot help permissions` says and
`copilot.sandbox.1` now pins as text; the model word before the first turn is seeded from
the spec.

**The verifier** proved written-first FROM GIT this time (every spec check's red commit
precedes its feat commit) and every constraint, and named five blockers, each fixed: the
`Allow for session` grant landed AFTER the answer, so an ACP answer carried `allow_once`
where the code's own comment promised `allow_always` — the grant goes first now, guarded by
the pending lookup rather than a revoke; `registry.1`'s regex named only `claude|codex`, so
a `backend === 'copilot'` would have passed — four names now; M121 (6) was a pure function
nobody calls — restated, not claimed; a raw NUL byte in `copilot-transcript.ts` made the file
binary to git and blind to grep — spelled `\u0000`; eight stale CLAUDE.md suite rows and
the spec's missing `verify:panels` copilot-row check — both landed. Recorded and accepted:
three feat commits edited their check's assertion (one loosened `acp.2`'s turn count to a
before/after comparison), `sandbox.1` does not pin codex's tail position on RESUME (whether
`exec resume` accepts `--sandbox` after the prompt is unmeasured — a manual-only line), and
four stray `docs/research/*` files rode in through Track B's merge and were dropped.

The renderer pass after the fixes: `verify:panels` found two of my own — the record's cwd
came from the live snapshot, and a RECYCLED panel id answered with a stale session's folder
(codex.1 and memory.2 read `no such directory: <a removed fixture>`); the record keeps the
intended cwd now, except a sandbox chat's, which main resolved. `menu.1` queried the DOM in
the same tick as a React click; `flip.1` expected no cards after returning to a workspace
whose panels are dormant.

The chain: see the last line of this log.

## What green does not prove

That a real `copilot -p` turn under this app's env reaches GitHub Copilot with the user's
login (the fixtures were recorded by hand, once, under a shell); that `copilot --acp` under
the app answers the handshake as it did under the probe; that `--permission-mode plan`
refuses a write in a real claude sandbox turn. Each is a manual-only line.
