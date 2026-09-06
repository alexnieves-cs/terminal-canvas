# Act II — engines, and a chat with no place (M117–M121)

**Status:** design for the `m117-engines` branch, the second act of the v6 run (3.0.0).
**Method:** one spec, one plan, one build log, one shot pass, one critic+verifier pair and one
merge. Checks written first, COMMITTED BEFORE their implementation (Act I's verifier could
not prove written-first from git; from here the red check is its own commit). `npm run verify`
alone and green before the merge.

## 0. Act 0's answers, which this spec cites

The measurements are in Act I's spec §0 and `scripts/fixtures/agent-session/{copilot,acp}/`.
The ones that decide this act:

- **`cursor-agent` is UNMEASURED.** `cursor-agent status` says `Not logged in`; the headless
  door refuses with "Authentication required. Please run 'agent login' first, or set
  CURSOR_API_KEY". Login opens a browser, which only the user can do. No stream exists to
  parse; a row written from the help text alone would be a guess dressed as a fact.
- **copilot's JSONL door** (`-p --output-format json --allow-all-tools`): one process per
  turn; NO session id in the stream (`parentId` chains the previous event), so the host pins
  one with `--session-id <uuid>` and resumes with `--resume=<uuid>` — verified, the resumed
  turn recalled the file; `assistant.turn_end` fires per MODEL CALL and `result` is the
  turn's end; tool pairs `assistant.message.toolRequests[]` → `tool.execution_start` →
  `tool.execution_complete{success, result.content}`; usage is credits
  (`session.usage_checkpoint`), no tokens per turn and no dollars; `--allow-all-tools` is
  "required for non-interactive mode"; the CLI auto-updated itself mid-run (1.0.78 → 1.0.83).
- **copilot's ACP door** (`copilot --acp`): the handshake completes; `initialize` answers
  `loadSession: true` and `promptCapabilities.image: true`; `session/new` mints the id;
  `session/prompt` answers `end_turn` with token usage; `session/update` carries
  `agent_message_chunk`, `tool_call{kind, status, rawInput}`, `tool_call_update`,
  `usage_update{used, size}`; `session/request_permission` arrived ONLY for the `execute`
  kind with `allow_once | allow_always | reject_once`; **the agent never asked the client
  for `fs/read_text_file` or `terminal/create`** with both advertised; `session/load`
  replays the history.

## 1. What Act II is for, and the one milestone that refuses itself

The registry (M99) exists for this act: an engine is a `BackendDef` row, an adapter in
`main/backend-adapters.ts`, a parser over recorded fixtures, and NO consumer switches on its
name (`verify:agent-session registry.1`). Two engines are measured and land: copilot's
JSONL door as the third row and its ACP door as the fourth — the first ACP client this app
has been, with the row's capabilities FILLED from `initialize`'s answer. Chat mode gives a
chat somewhere to live without a place. The deferred seven become defects with a check each.

### M117 · `cursor-agent` — REFUSED BY NAME

Constraint 4: a declined milestone with a written argument is a successful outcome. The
premise of every engine milestone is a recording; there is none, and the reason is not the
code's. What it would take, in order, none of it this session's to do: `cursor-agent login`
(a browser) or `CURSOR_API_KEY` in the login environment; then Act 0 step 3 verbatim (a
two-turn `stream-json` recording, once with `--stream-partial-output`, into
`scripts/fixtures/agent-session/cursor/`); then this act's M118 shape, row for row. The
`terminal-canvas-v6-run` memory carries the sentence; `docs/ideas-backlog.md` gains the
entry with the three steps. **3.0.0 still stands**: the board landed and copilot is the third
engine.

## 2. M118 · `copilot`, the third row (plain headless)

### 2.1 The row (`shared/agent-backends.ts`, appended)

```ts
copilot: {
  id: 'copilot', label: 'copilot', binary: 'copilot',
  resumes: true,            // --resume=<uuid>, the id the host pinned with --session-id
  interrupts: false,        // one process per turn; a stop is a kill, said so
  images: false,            // --attachment takes a PATH, not bytes; refused by name
  reportsCost: false,       // credits (usage_checkpoint), never dollars
  asksPermission: false,    // --allow-all-tools is required for non-interactive mode
  terminalDoor: false,      // `copilot --resume=<id>` exists; the door is claude's argv today
  oneProcessPerTurn: true, closeStdin: true, adoptsThreadId: false,
  reasons: { noCli, noInterrupt: 'copilot has no interrupt — close the panel to stop it',
    noImages: 'copilot takes an image only as a file path — reference it by its path',
    noTerminal: 'a copilot chat continues only here — the terminal door is claude --resume',
    noPermissions: 'copilot asks no permission here — every tool runs on its own policy (--allow-all-tools is required headless)' }
}
```

`BACKEND_IDS` gains `'copilot'`; `AgentBackend` gains the member; the layout parser's literal
list gains it (the ONE place a literal is allowed, `registry.1`). `carryBackend` unchanged.
`AGENT_CAPABILITIES.copilot`: `flags: { model: '--model' }`, `transcriptAccounting: false`.

### 2.2 The argv (`shared/copilot-transcript.ts`'s `copilotArgs`)

First turn: `-p <text> --output-format json --allow-all-tools --no-auto-update --session-id
<uuid> -C <cwd> [--model <m>]`. Later turns: `-p <text> --output-format json
--allow-all-tools --no-auto-update --resume=<uuid>` (the cwd is the session's; `-C` again is
harmless and kept for the same reason). `--no-auto-update` because the CLI replaced itself
mid-run in Act 0. `--secret-env-vars` is DECLINED: the PTY env carries no credential by
construction (constraint 2), and naming variables that are not there invents a list to
maintain. `appendSystemPrompt` has no flag: a copilot supervisor, routine or dispatched
lane would silently not be one, so the sheet never offers copilot for those (the codex rule,
`registry.2` pins that `appendSystemPrompt` support is a row fact… it is not a row field
today, so: the adapter IGNORES it, and the three doors that append a prompt read
`BACKENDS[b].appendsPrompt` — a NEW row field, `true` for claude only, with the reason
`noPrompt` — the customer for the field is the sheet's supervisor row, the routine's
teammate mint and the dispatch verb, each refusing by name).

### 2.3 The parser (`parseCopilotLine` → `TranscriptEvent[]`)

Every line is `{ type, data, ephemeral?, id, timestamp, parentId }`. Mapping, over the three
fixtures:
- `session.auto_mode_resolved` → `session` with `model: data.chosenModel` and the PINNED
  session id (the stream carries none; the parser is given it).
- `assistant.turn_start` → `message-start` (`messageId: interactionId + turnId`).
- `assistant.message_delta` (ephemeral) → `block-delta` text on index 0 after a
  `block-start` text block the parser mints once per message.
- `assistant.message` → `assistant` with `blocks`: the text (when non-empty) and one
  `tool_use` per `toolRequests[]` (`id: toolCallId`, `name`, `input: arguments`).
- `tool.execution_complete` → `user` with one `tool_result` block (`tool_use_id`, the
  `result.content`, `is_error: !success`) — codex's pair, the same rows.
- `assistant.turn_end` → `message-end`. **Not** the turn's end.
- `result` → `result` (`ok: true`, `subtype: 'success'`); `session.usage_checkpoint` →
  `ignored` (credits are not tokens; nothing priced). `assistant.reasoning*`,
  `session.*`, `user.message`, `model.call_start` → `ignored` by kind; a type this version
  has not seen → `unknown` by kind; a broken line → `malformed`.

### 2.4 The manager

No new arm: copilot is codex's shape (`oneProcessPerTurn`, `closeStdin`), served from
`handleExit`. The one difference — the host pins the id — is `adoptsThreadId: false`, which
the manager already reads. `everSpawned` is the resume rule already there.

### 2.5 Checks

`verify:agent-session copilot.1` (parser over the three fixtures: the model from
`auto_mode_resolved`, the tool pair under one id, `turn_end` NOT a result, `result` the end,
`usage_checkpoint` ignored, the resumed stream's `result`), `copilot.1.e` (argv first and
resumed; `--no-auto-update` present; the prompt an argument), `copilot.2` (the manager over
the fake runner: spawn per send, `--session-id` pinned on the first, `--resume=` on the
second, interrupt refused by name, an image refused by name, the exit after `result` is the
turn's END), `registry.1–.3` extended by construction; `verify:panels` reads
`data-chat-backend="copilot"` from a chat minted through the sheet's row (the codex.1 shape).

## 3. M119 · The canvas as an ACP client — the fourth row

### 3.1 The shape, from the measurement

ACP is a RESIDENT process speaking JSON-RPC 2.0 over stdio, bidirectional: the client
requests (`initialize`, `session/new`, `session/load`, `session/prompt`, `session/cancel`),
the agent notifies (`session/update`) and REQUESTS (`session/request_permission`). The
manager's line seam already carries a resident process with a `write(line)` — the ACP
adapter is a codec over it, not a second runtime.

- `shared/acp-transcript.ts` — pure: `acpInitialize(id)`, `acpSessionNew(id, cwd)`,
  `acpSessionLoad(id, sessionId, cwd)`, `acpPrompt(id, sessionId, text, images)`,
  `acpCancel(id, sessionId)`, `acpPermissionAnswer(requestId, optionId)` (the encoders,
  each one JSON line), and `parseAcpLine(line, state) → { events: TranscriptEvent[]; state }`
  where `state` is the pending request-id map (a response is matched to what was asked).
  Mapping: `initialize`'s result → `session` carrying the capabilities (see 3.2);
  `session/new`'s result → `session` with `sessionId` (adopted: `adoptsThreadId: true`);
  `agent_message_chunk` → `block-start`/`block-delta` text; `tool_call` → `assistant` with
  a `tool_use` block (`id: toolCallId`, `name: kind`, `input: rawInput`, `title` in the
  description) ; `tool_call_update{status:'completed'}` → `user` `tool_result` with the
  content text; `usage_update` → `ignored`; `session/prompt`'s result → `result` with
  `stopReason` and `usage` mapped to `TokenTotals` (input/output; cached read/write);
  `session/request_permission` → `permission-request` with `requestId` = the JSON-RPC id,
  `toolName: toolCall.kind`, `input: rawInput`, `description: title`, and the option ids
  carried in `input.__options` (so the answer maps `allow` → `allow_once`, `deny` →
  `reject_once`, and M98's session grant → `allow_always`); an error response →
  `result{ok:false, error}`; `available_commands_update`, `session_info_update`,
  `config_option_update`, `user_message_chunk` → `ignored`.
- `main/backend-adapters.ts` `acp` adapter: `args: ['--acp']`; `parseChunk` over
  `parseAcpLine`; and the adapter surface grows THREE optional encoders every row may have —
  `encodeUser`, `encodeInterrupt`, `encodePermission` — which the manager prefers over the
  stream-json encoders when present (claude's stay the default: `registry.1` holds, the
  manager reads the adapter, never the name). The manager's spawn for a row with
  `handshake: true` writes `initialize` then `session/new` (or `session/load` when
  `everSpawned`) before the first prompt, and holds the first send until `session/new`
  answers (the pending-request map in the adapter's carry state).
- **`clientCapabilities`: `fs: { readTextFile: false, writeTextFile: false }`, `terminal:
  false`.** Both DECLINED BY NAME, with the measurement as the reason: copilot's ACP never
  asked for either with both advertised — it runs its own tools — so a host answer would be
  code with no consumer (M23's customer-free-abstraction rule), and a terminal the agent owns
  is a panel whose lifetime the registry does not own (two lifetimes). Recorded in
  `docs/ideas-backlog.md` as the next run's milestone with the capability lines to flip.
- `session/update` `plan` — never seen in the fixtures; the parser maps it to `ignored` by
  kind and the chip projection is DECLINED for lack of a recording.

### 3.2 The row, filled from `initialize`

```ts
acp: {
  id: 'acp', label: 'copilot (acp)', binary: 'copilot',
  resumes: true /* loadSession */, interrupts: true /* session/cancel */, images: true /* promptCapabilities.image */,
  reportsCost: false, asksPermission: true, terminalDoor: false,
  oneProcessPerTurn: false, closeStdin: false, adoptsThreadId: true, handshake: true, appendsPrompt: false,
  reasons: { … noPermissions: 'copilot (acp) asks before a command runs — a grant answers allow_always for the session' }
}
```

The three capabilities the CLI states (`loadSession`, `image`, and the permission kinds) are
ALSO read live from `initialize`'s answer and stored on the session snapshot as
`negotiated`; the row is the static promise, the snapshot the measured fact, and the
composer's image refusal reads the snapshot when present. `verify:agent-session acp.2` pins
that a fixture whose `initialize` answers `loadSession: false` makes the session's `resume`
door refuse by name even though the row says `true`.

### 3.3 Permissions through the ONE `answerPermission`

The tracker (M76) turns the `permission-request` event into `wants-you` on the panel's
channel with no code of its own; `answerPermission` reaches the adapter's `encodePermission`;
M98's `preAnswer` grants answer `allow_always` before the request is pending
(`permission-auto-allowed`). The card's third verb (`Allow for session`) maps to
`allow_always` — the first backend where the vendor's own vocabulary has that word.

### 3.4 Checks

`verify:agent-session acp.1` (the codec over the four fixtures: the handshake's three
requests in order, the id adopted from `session/new`, the chunk → delta, the tool pair, the
prompt result's usage, `request_permission` → the event and the answer line by id;
`session/load` replays as `replay: true` user/assistant turns), `acp.2` (the negotiated
capability outranks the row), `acp.3` (the manager over a fake stdio pair: the first send
waits for `session/new`, `interrupt` writes `session/cancel`, a grant answers
`allow_always` before pending, a process exit mid-prompt aborts the turn with the reason),
`acp.4` (`clientCapabilities` in the `initialize` line are exactly the two declines, as text).

## 4. M120 · Chat mode, and the model word

### 4.1 A chat with no place

`AgentSessionSpec.sandbox?: true` (absent is today). In `agent:create`, main resolves the cwd
to a fresh `userData/sandbox/<id>` (mkdir; NEVER a Place, never the home fallback — the
Places gate is bypassed by construction because the folder is the app's, and a `teammateId`
beside `sandbox` is REFUSED: a teammate has places, a sandbox has none — `verify:teammates
sandbox.1`), and spawns with the row's `sandboxArgs` — a NEW row field, the tool-denying
argv: claude `['--permission-mode', 'plan']` (plan mode: read-only, no edits, no shell
writes), codex `['--sandbox', 'read-only']`, copilot `['--deny-tool', 'shell', '--deny-tool',
'write']` (denial rules outrank `--allow-all-tools`, `copilot help permissions`), acp
`undefined` — a row with no `sandboxArgs` DECLINES chat mode by name (`reasons.noSandbox`).
`ChatSource.sandbox?: true` (carried by `carryChatMarks`); the header line reads
`sandboxed · no folder` (M107's `chatHeaderLine` with `folder` absent and a `sandbox` flag);
the sheet's third card `New chat (no folder)` and the palette door of the same name; the
directory is deleted when the chat is DISPOSED (`agent:dispose` with `drop`), not on exit.

### 4.2 The model word

`agentOptions.model` already rides the spec, the snapshot and `ChatSource` (M20's knob);
what is new is the ROW's `models?: readonly string[]` — a closed list where the CLI has one
(`copilot --model` names `auto`, `claude-haiku-4.5`, `gpt-5-mini`… — the fixtures' own
`availableModels`; claude and codex free text) — which the sheet renders as a select when
present and a text field otherwise, and `--model` goes on argv by the adapter (it does for
claude and codex already; copilot's `flags.model`). The header's fourth piece reads
`snapshot.model` (M107) and, before the first turn, the chosen `agentOptions.model`.

### 4.3 Checks

`verify:agent-session sandbox.1` (argv per row from `sandboxArgs`; a row without it refuses;
the cwd rule under a fake `mkdir`; dispose deletes), `verify:teammates sandbox.1` (a
sandboxed chat under a teammate is refused with the sentence), `verify:palette sandbox.1`
(the door's row and its reason per row), `verify:rail header.2` (`sandboxed · no folder`).

## 5. M121 · The deferred seven, as defects

One commit each, the check first where a suite reaches it; find the line, fix it, do not
redesign: (1) the routine chat's rule prompt not surviving relaunch — `ChatSource.routine?:
true` carried, `useChatSessions` appends `ROUTINE_PROMPT` (the M81 shape; `carryChatMarks`
grows the mark; `verify:agent-session dispatch.1` widened); (2) `tc memory add --teammate
<id>` — the CLI flag and the root prefix (`verify:control memory.2` widened); (3) the ⋯
menu's outside-click — a document `mousedown` listener closing it (`verify:panels menu.1`);
(4) `flipped` surviving a workspace switch — reset on switch (`verify:panels flip.1`
widened); (5) the ceiling preview ignoring the concurrency queue — `lineupPlan` counts
queued sends (`verify:palette lineup.1` widened); (6) a stale seeded run beside an idle
panel — `sealAbandoned` also seals a run whose panels are all idle at load (`verify:layout
runs.1`); (7) the auto chip shortening before verbs clip — `.chat__auto` gives (min-width 0,
ellipsis) like `.pf__title` (`verify:styles header.2`).

## 6. Tracks

| Track A | Track B |
|---|---|
| M118 copilot row + parser + argv → M120 sandbox + models | M119 ACP codec + adapter + manager arms (its files: `shared/acp-transcript.ts`, the `acp` adapter, the manager's handshake/encoder arms) → M121's seven |

Both append one row to `agent-backends.ts` and one adapter; the row order is `claude, codex,
copilot, acp`. Track B starts after Track A's row commit (the `appendsPrompt`, `handshake`,
`sandboxArgs`, `models` fields are declared in that first commit for every row).

## 7. Declared non-goals

`cursor-agent` (unmeasured, §1); Gemini CLI and Grok (not installed); dictation and voice; a
second ACP agent; per-engine pricing tables; `fs/*` and `terminal/*` client capabilities
(declined by measurement, §3.1); the `plan` chip projection (no recording); copilot's
`--secret-env-vars` (§2.2); a copilot terminal door.

## 8. What green will not prove

That a real `copilot -p` turn under this app's env reaches GitHub Copilot with the user's
login (the fixtures were recorded by hand, once); that `copilot --acp` under the app answers
the handshake as it did under the probe; that `--permission-mode plan` refuses a write in a
real claude sandbox turn. Each is a manual-only line; M124 re-reads the list.
