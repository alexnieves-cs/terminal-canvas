# M71 — The agent-session runtime

**Status:** design, 2026-09-03. **Branch:** `m71-agent-session`. **Kind:** runtime — no UI, no
IPC, no screenshot, by design (see "What this milestone deliberately does not ship").
**Thesis sentence:** this is the seam that lets a node on the canvas be a conversation with an
agent rather than a PTY; every Act I milestone is built over it, and it is built first so the
abstraction is shaped by the domain and not by a chat screen.

## What this milestone is for

Today the only way this application can run an agent is to spawn a login shell in a PTY, hand it
argv and read bytes. Everything in the backlog that is not a terminal has been stuck on that.
M71 adds a main-process object that represents *an agent conversation* — a structured,
streaming transcript of turns, tool calls, tool results, permission requests, usage and
stops — with a lifecycle of its own, no xterm anywhere near it, and an injected process
runner so the whole thing is verifiable under plain node against a recorded stream.

## The backend, and the facts measured before designing

The backend is the installed `claude` CLI in headless mode. It needs no credential this app
holds (it uses the user's own login, exactly as a terminal panel running `claude` does), stores
no token, crosses no CSP boundary (every byte stays in main), and is verifiable offline against
a recorded stream. It is also the version with the stronger product claim: the same agent
behind a terminal panel and a chat panel, with the same `CLAUDE.md`, skills, hooks and memory,
because the runtime deliberately does NOT pass `--bare` or strip settings.

Measured against `claude` **2.1.259** on 2026-09-03, on this machine, and recorded here because
every one of these is another program's contract that can change in a release with nothing in
this repository to notice (the same standing M17 gave `--session-id`):

- **Flags.** `-p --output-format stream-json --input-format stream-json --verbose
  --include-partial-messages --permission-prompt-tool stdio`. Without `--verbose` the
  stream carries only the final result. Without `--include-partial-messages` there are no
  token deltas. Without `--permission-prompt-tool stdio` a tool that needs approval is
  DENIED automatically and the stream carries a `system/permission_denied` line — no request
  ever reaches the host (measured twice, with `--permission-prompts host` and with an
  `initialize` control request first; neither is sufficient). With it, the CLI emits a
  `control_request` of subtype `can_use_tool` and waits for a `control_response`.
- **Record types on stdout, one JSON object per line.** `system` (subtypes seen: `init`,
  `status`, `thinking_tokens`, `hook_started`, `hook_progress`, `hook_response`,
  `permission_denied`), `stream_event` (wrapping the API's `message_start`,
  `content_block_start`, `content_block_delta` with `text_delta` / `thinking_delta` /
  `signature_delta` / `input_json_delta`, `content_block_stop`, `message_delta`,
  `message_stop`), `assistant` (a complete message record — emitted ONCE PER CONTENT BLOCK
  with the same `message.id`, so a turn with a thinking block and a tool call arrives as two
  `assistant` records that must be merged by id, and whose `usage` is repeated, never summed),
  `user` (a tool result, or with `--replay-user-messages` an echo of our own message marked
  `isReplay: true`), `rate_limit_event`, `control_response`, `control_request`, and `result`.
- **Multi-turn.** Each user message written to stdin as `{"type":"user","message":{"role":
  "user","content":[{"type":"text","text":…}]}}` produces one `system/init` … `result`
  sequence. The process stays alive between turns and exits when stdin closes.
- **`result`.** `subtype: 'success'` with `is_error: false` on a normal end; `stop_reason`
  (`end_turn`), `terminal_reason` (`completed`), `num_turns`, `duration_ms`, `result` (the
  final text), `session_id`, `usage` (the API's four token classes — **per turn**, measured
  as differing `output_tokens` across three turns of one process) and `total_cost_usd`
  (**cumulative across the process**, measured as 0.0215 → 0.1609 → 0.1684 across the same
  three turns). The two facts are different and the accumulator must treat them
  differently: usage is summed, cost is taken as the latest value.
- **Interrupt.** `{"type":"control_request","request_id":R,"request":{"subtype":
  "interrupt"}}` on stdin is answered on stdout by `{"type":"control_response","response":
  {"subtype":"success","request_id":R,"response":{"still_queued":[]}}}`. The turn in flight
  then ends with a `result`. **Amended after the hand run (build log):** an interrupted
  turn's `result` is `subtype: 'error_during_execution'`, `is_error: true`, a zero usage and
  an unchanged cumulative cost, and the CLI appends a `user` record reading `[Request
  interrupted by user]`. The session marks the turn interrupted from its own state, never
  from the record — which is what stops that result rendering as an error.
- **Permission request.** `{"type":"control_request","request_id":R,"request":{"subtype":
  "can_use_tool","tool_name","display_name","input","description","permission_suggestions",
  "tool_use_id"}}`; answered by `{"type":"control_response","response":{"subtype":"success",
  "request_id":R,"response":{"behavior":"allow","updatedInput":<input>}}}`, or a `deny`
  behaviour with a `message`. The deny shape is taken from the Agent SDK's documented
  contract and was not exercised here; it is listed as manual-only.
- **`initialize`.** A control request of subtype `initialize` is answered with the CLI's
  slash commands, agents and capabilities. Not used by M71; recorded because the composer
  milestone's "project prompts as slash commands" can read them from here rather than
  re-deriving them from `.claude/commands`.
- **`session_id`** is a UUID the CLI accepts from `--session-id` (M17's pin) and reports on
  `system/init` and every record. `--resume <id>` continues that conversation in a fresh
  process, from the transcript the CLI itself writes under `~/.claude/projects`. This is what
  makes a conversation survive the app's own relaunch without this app storing a byte of it.

## Design

Three modules, one suite, one wiring change.

### `src/shared/transcript.ts` — the schema and the line parser (pure)

- `ContentBlock` is a discriminated union: `text`, `thinking`, `tool_use` (`id`, `name`,
  `input: Record<string, unknown>`), `tool_result` (`toolUseId`, `content: string`,
  `isError`), and `unknown` (`kind: string`). A block of a type this version does not know
  is KEPT as an `unknown` placeholder rather than dropped, so a transcript rendered later
  says "a block this version cannot render" instead of silently shortening a turn.
- `TranscriptTurn`: `{ id, role: 'user' | 'assistant', blocks, model?, usage?, at }`.
- `TranscriptEvent` is what one stream line parses to: `session` (from `system/init`:
  `sessionId`, `model`, `cwd`, `version`), `message-start`, `block-start`, `block-delta`
  (`text` / `thinking` / `input-json`, each carrying the block index and the string),
  `block-stop`, `message-stop` (`stopReason`), `assistant` (a complete record: message id,
  model, blocks, usage), `user` (blocks — tool results, or a replayed user message flagged
  `replay`), `result` (`ok`, `subtype`, `stopReason`, `usage`, `costUsd`, `durationMs`,
  `numTurns`, `text`, `sessionId`), `permission-request` (`requestId`, `toolName`,
  `input`, `description`, `toolUseId`), `control-response` (`requestId`, `ok`), `ignored`
  (a known record this app has no use for — hook events, status, rate limits, thinking
  token counts — with its `kind`), `unknown` (a top-level type or system subtype this
  version has never seen, with its `kind`), and `malformed` (a line that was not JSON or not
  an object, with a bounded preview).
- **Absent, malformed, unknown — the discipline every parser here follows.** A missing
  `usage` is "not yet priced", never zero; a missing `stop_reason` is absent, never
  `'end_turn'`; a non-number token count is 0 through the same `num()` rule
  `usage-parse.ts` uses (NaN poisons every later sum). A malformed LINE costs that line and
  nothing else. An unknown TYPE is reported as `unknown`, not dropped — the CLI will grow new
  record types and the one place that can notice is a counter on the session, not a log
  nobody reads.
- `parseStreamChunk(text, carry) → { events, carry }` with the carry rule
  `usage-parse.ts` established: the trailing fragment after the last newline is never parsed
  and is prepended to the next chunk, so a record split across two reads lands exactly once.
- Usage is `TokenTotals` from `shared/cost.ts` — four classes, never two.

### `src/main/agent-runner.ts` — the injected process seam

```ts
interface AgentProcess {
  readonly pid: number | undefined
  write(line: string): void          // one JSON line, newline appended by the caller
  onData(cb: (chunk: string) => void): void
  onExit(cb: (info: { code: number | null; signal: string | null }) => void): void
  kill(): void
}
type AgentRunner = (spawn: { command: string; args: string[]; cwd: string;
                             env: Record<string, string> }) => AgentProcess
```

The seam is PROCESS-shaped, not protocol-shaped, and that is the point: the failure paths
the bar names — a truncated stream, a malformed line mid-stream, a non-zero exit — are byte
and process facts, and a runner that handed the session parsed events could not produce any
of them. The suite's fake runner replays a recorded stream in chunks it chooses, breaks
lines where it chooses, and exits when it chooses.

`src/main/claude-cli-runner.ts` is the real one: `child_process.spawn` with piped stdio,
the resolved login environment (`shell-env.ts`'s, the same environment every PTY gets — that
is how `claude` finds its login and its config), stdout decoded through a
`StringDecoder` (a multibyte codepoint can straddle a read; M17's lesson), stderr captured
to a bounded ring and surfaced on a non-zero exit. It imports neither `electron` nor
`node-pty`, so it runs under plain node — which is how it was confirmed by hand against the
real CLI (build log), while staying out of `npm run verify`.

### `src/main/agent-session.ts` — `AgentSessionManager`

- **Ids are the caller's.** `create({ id, cwd, agentOptions?, resume? })` takes the id the
  renderer minted (in M72 it is the panel id), for the reason `tc` never mints a panel id:
  two authors of one id space is the duplicate-id defect. The CLI's own session UUID is a
  second fact: minted at create through an injected `newSessionId()` and passed as
  `--session-id`, so it is known before the process has written a byte, and used as
  `--resume` for every later spawn of the same conversation. `resume` on create is how a
  restored panel (M72) continues yesterday's conversation.
- **Spawn on first `send`, not on `create`.** A created session with no process costs
  nothing, which is what a restored-but-untouched chat panel should cost — the same argument
  dormancy makes for terminals, reached from the other side. `create` is synchronous and
  cannot fail.
- **One process per session, multi-turn over stdin.** `send(id, text)` writes a user
  message; while a turn is in flight a second `send` is QUEUED in the session and written
  when the `result` arrives (the queue is ours, not the CLI's, so the transcript shows the
  pending turn and dispose drops it deterministically). When the process has exited —
  crashed, was killed by an interrupt timeout, or the app relaunched — the next `send`
  respawns it with `--resume <uuid>`.
- **Status is one word from a closed set:** `not-started` → `starting` (spawned, no `init`
  yet) → `ready` → `streaming` → back to `ready` on a `result`; `exited` (with the code)
  from any live state; `disposed`, terminal. It is the runtime's own fact, derived only from
  process and protocol events, and M72 maps it onto the canvas's state vocabulary rather
  than the runtime spelling a UI word.
- **Turns are assembled from the complete records, deltas are for the screen.**
  `assistant` records sharing a `message.id` merge into one turn; `user` records append a
  turn of tool results; deltas are forwarded as events and never used to build the stored
  turn, so a dropped delta cannot corrupt the transcript and the transcript is exactly what
  the CLI said it said. Deltas are coalesced per session on a 16ms timer — adjacent text or
  thinking deltas for the same block index are joined into one event — for the reason
  `pty-manager.ts` batches at 16ms: the renderer must not be re-rendered per token.
- **Accounting.** The `result`'s per-turn usage is summed into the session's `TokenTotals`;
  its cumulative `total_cost_usd` replaces the session's `costUsd`. `turns` counts results.
  Both live on the session snapshot `list()` returns, alongside status, the CLI session
  UUID, the pid when live, and counters for ignored, unknown and malformed lines — the
  three-state rule as numbers, so a new CLI version shows up as a non-zero `unknown` rather
  than as a transcript that got quieter.
- **Interrupt.** `interrupt(id)` writes the control request and arms a grace timer
  (`interruptGraceMs`, injected, 5000 in production). If the turn's `result` has not arrived
  when it fires, the process is killed: `exited`, and the next `send` resumes. The turn is
  marked `interrupted` by the session from its own state the instant the request is written,
  never from the result record, which was not observed. An interrupt with no turn in flight
  is a no-op that returns `false`.
- **Permission requests** are events (`permission-request`) held on the session as
  `pending` until `answerPermission(id, requestId, { allow: true } | { allow: false,
  message })` writes the response. A request the process abandons (exit) is dropped from
  `pending` with a `permission-dropped` event, so a UI never shows a question nobody can
  answer. This is the seam the approvals milestone answers from; M71 ships the seam and its
  check, not a surface.
- **Identity, the M61 rule, on both doors.** Every process callback — data and exit — is
  gated on `this.sessions.get(id) === session` before it touches the map, emits, or changes
  status. `dispose(id)` kills the process and deletes the entry synchronously; the OS process
  exits milliseconds later, usually printing, and by then the id may belong to a session
  recreated at it (restart in place will reuse ids exactly as the PTY layer does). An
  unguarded exit callback would mark the NEW session exited; an unguarded data callback would
  stream the dead process's tail into it. `verify:agent-session` drives exactly that
  sequence with a fake whose old process keeps talking after the kill.
- **Subscription.** `subscribe(cb)` returns its own unsubscribe, the preload convention.
  Events carry the session id. Nothing here bumps any renderer version — that is M72's
  concern and it will go through a per-panel store, never `registry.version()`.
- **`disposeAll()`** at quit, in both arms of `runQuit` (a headless process cannot be
  reattached after its parent dies; what survives is the CLI's own transcript, reachable by
  `--resume`, so the keep-on-quit setting has nothing to keep here and is not consulted).
  `quit.ts` grows an optional `agents` dependency so its existing checks stay as they are.

### What this milestone deliberately does not ship

- **No UI, no IPC channel, no screenshot.** M72 adds the panel kind, the channels, and the
  durable transcript store. A milestone with no image in the harness will look unfinished in
  the table; it is not — building the runtime before any screen exists is the whole reason it
  is M71 and not M73.
- **No durable transcript of its own.** The CLI writes one and `--resume` reads it; the
  application's own file (needed so a restored panel can RENDER yesterday's turns without
  a process) is M72's, where its reader is.
- **No `--bare`, no settings stripping, no system prompt of its own.** "Same agent" means
  the user's hooks and skills run; the supervisor milestone will be the first to append a
  system prompt, and it adds the argument then.
- **No second backend.** The runner is injected, which is the seam a Codex adapter would
  use; building the abstraction before a second instance exists is the failure the backlog
  names. The third `AgentKind` milestone decides.

## What it must not break

- `verify:pty-manager keep-on-quit.1/.2` call `runQuit` without an `agents` dependency;
  the new field is optional and absent means nothing to dispose.
- `agentArgs` (`main/agent-args.ts`) is reused for the knobs and the session pin, so a
  Claude flag spelling lives in exactly one table. The headless base argv is a second list
  in `agent-session-args.ts`, and it is a DIFFERENT contract (a TUI does not take
  `--output-format`), so the two are not merged.
- Nothing in this milestone imports `electron` outside `main/index.ts`'s wiring. The suite
  is plain node.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A record split across two reads parsed twice or never | `transcript.carry` |
| A malformed line mid-stream costing the rest of the turn | `session.malformed` |
| A new CLI record type vanishing silently | `transcript.unknown`, the `unknown` counter |
| A truncated stream (exit with no `result`) leaving the session `streaming` forever | `session.truncated` |
| A non-zero exit reported as a clean turn | `session.exit-code` |
| An interrupt that writes the request and nothing else | `session.interrupt`, `session.interrupt-timeout` |
| A dead process's late bytes or exit landing in a session recreated at its id | `session.identity` |
| Usage summed from repeated `assistant` records, or cost summed across turns | `session.accounting` |
| A second `send` mid-turn lost or interleaved | `session.queue` |
| A permission request with no way to answer, or one outliving its process | `session.permission`, `session.permission-dropped` |
| Per-token re-render | `session.coalesce` |

## Manual-only, added by this milestone

- The real `claude-cli-runner.ts` against the real CLI: a turn, a tool call, a permission
  request answered, an interrupt. Confirmed once by hand under plain node (build log); never
  in `npm run verify`, which stays offline.
- The `deny` branch of a permission response: taken from the SDK contract, not observed.
  (The interrupted turn's result WAS observed in the hand run; see the amendment above.)
