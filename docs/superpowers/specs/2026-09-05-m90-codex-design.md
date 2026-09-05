# M90 — A second headless backend

**Status:** design, 2026-09-05. **Branch:** `m90-codex`. **Kind:** runtime + surface.
**Briefs built against:** 1.x principles 7 (three states), 9 (a disabled row names the fix);
2.0 principles 10 (a process node speaks the process words) and 11 (the same words whoever
produced them).
**Thesis sentence:** the chat panel is a conversation with an agent, not with one vendor's
CLI — the seam M71 fixed holds a second backend without the panel learning which one.

## What this milestone is for

M71 built the chat runtime over one contract: a process, a line parser to `TranscriptEvent`,
a stdin encoder. Everything above it — the panel, the store, approvals, handoffs, runs,
templates, the supervisor — reads events and never the vendor. This milestone proves the
seam by putting `codex exec --json` behind it, measured against this machine's
`codex-cli 0.153.4` and recorded like M71's facts. Whatever Codex cannot do is a named reason
in the panel, never a missing control.

## The facts measured (codex-cli 0.153.4, 2026-09-05)

- `codex exec --json -C <dir> --sandbox <mode> --skip-git-repo-check "<prompt>"` with stdin
  CLOSED — an open stdin blocks on `Reading additional input from stdin…`. The prompt is an
  argument: one process per turn.
- The stream: `thread.started {thread_id}`, `turn.started`, `item.started` /
  `item.completed` with `item: { id, type: 'agent_message' | 'command_execution' | …, text?
  | command, aggregated_output, exit_code, status }`, `turn.completed { usage: {
  input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens,
  reasoning_output_tokens } }`. No deltas, no cost figure, no permission request — the
  sandbox policy decides.
- Resume: `codex exec resume <thread_id> "<prompt>" --json`; the stream repeats
  `thread.started` with the same id. No interrupt door: stopping a turn is killing the
  process.

## Design

### The adapter (`shared/codex-transcript.ts`, pure — `verify:agent-session codex.1`)

- `parseCodexLine(line)` → `TranscriptEvent`: `thread.started` → `session` (the thread id is
  the session id); `turn.started` → `ignored`; `item.completed` with `agent_message` → an
  `assistant` event with one text block; `command_execution` completed → an `assistant`
  event carrying a `tool_use` block (`name: 'Bash'`, `input: { command }`) and a `user`
  event carrying its `tool_result` (the aggregated output, `isError` when the exit code is
  non-zero) — the shapes the panel's rows already render; `item.started` → `ignored`;
  `turn.completed` → `result` with `usage` mapped to the app's totals and NO `costUsd`
  (the accounting flag for codex is already false); anything else → `unknown` with its
  kind. Malformed lines are `malformed`, as claude's are.
- `codexArgs(input)` → the argv: `exec --json -C <cwd> --skip-git-repo-check` plus the
  sandbox and model flags from `AgentOptions`, then the prompt; `exec resume <id>
  "<prompt>" --json` on every later turn.

### The runtime (`main/agent-session.ts`)

- `AgentSessionSpec` and `ChatSource` gain `backend?: 'claude' | 'codex'`, absent meaning
  claude (every pre-M90 record). The manager takes `backends: Record<Backend, { command;
  runner; parse; args }>`; a session's backend is fixed at create.
- **One process per turn for codex.** `send` spawns `exec` (first) or `exec resume` (later)
  with the text as the argument and stdin closed; the process exits at `turn.completed`, and
  the session reads `ready`, not `exited` — an exit that IS the end of a turn is the
  backend's normal shape, and painting it `exited 0` would show a red panel after every
  answer. A queued message spawns the next process when the current one ends.
- **Amended after the verifier.** A send while a codex process lingers between its result and
  its exit QUEUES. The thread id is written onto the record (`onChatSession` → `Canvas.tsx`)
  and a restored codex chat with turns resumes on its first send (`hasTurns`, main's answer
  from the transcript log). A budget crossing KILLS a codex turn in flight, named `budget` —
  the only stop codex has. An image on a codex send is `refused-images` in the manager.
- **Named reasons, not missing controls:** `interrupt` on a codex session answers `false`
  and the composer's Interrupt is disabled with `codex has no interrupt — close the panel to
  stop it`; there is never a permission request (`pending` stays empty) and the approval
  surfaces need no code; an image attachment is refused by name (`codex takes no images
  here`).
- `AGENT_CAPABILITIES.codex` gains what the headless contract needs: `headless: { resumes:
  true, interrupts: false, permissions: false, images: false }`.

### The surface

- The spawn sheet's `chat with codex` option beside `chat with claude`, disabled by name when
  the CLI is not on the PATH (`codexPath` from the same probe that finds claude).
- The chat panel shows the backend in its chrome (`codex` / `claude`) and speaks the same
  state words; the rail row is unchanged.

## What it must not break

- Every existing claude check in `verify:agent-session`; the M61 identity rule on both doors.
- The transcript log's shape (a codex turn is stored as the same `TranscriptTurn`).

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A codex stream misread: no session, a command with no result, usage lost | `verify:agent-session codex.1` |
| A turn's end read as an exit; a second send spawning `exec` instead of `resume`; the prompt on stdin | `verify:agent-session codex.2` |
| Interrupt or an image silently accepted on codex | `verify:agent-session codex.2.d`, `codex.2.k` |
| A send lost between the result and the exit; a relaunch starting a new thread; a budget crossing ignored | `codex.2.i`, `codex.2.l`, `codex.2.j` |
| The terminal door reached from the palette row or the verb | `verify:panels codex.1` (the chrome), the shared reason on all three |
| The sheet's codex option absent rather than disabled | `verify:panels codex.1` |

## Manual-only, added

- A real codex turn in the real panel (the suites replay the recorded streams).
