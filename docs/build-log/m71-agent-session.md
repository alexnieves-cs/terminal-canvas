# M71 — The agent-session runtime

**Branch:** `m71-agent-session`. **Spec:** `docs/superpowers/specs/2026-09-03-m71-agent-session-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m71-agent-session.md`. **Status:** finished 2026-09-03.

**Thesis sentence:** the seam that lets a node be a conversation with an agent rather than a
PTY, built before any screen so the abstraction is shaped by the domain.

## No screenshot, on purpose

This milestone ships nothing a user can see: no panel, no IPC channel, no palette row. The
table will show a milestone with no image in the harness, and that is the design — building
the runtime second, after a chat UI existed, is how an abstraction gets shaped by a screen.
M72 is the first caller.

## What landed

- `src/shared/transcript.ts` — the transcript schema (`ContentBlock`, `TranscriptTurn`), the
  per-line event union, `parseStreamLine` / `parseStreamChunk` with the carry rule, and the
  three stdin encoders (user message, interrupt, permission response). Absent / malformed /
  unknown discipline throughout; an unknown block type is KEPT as a placeholder, an unknown
  record type is REPORTED, a malformed line costs itself.
- `src/main/agent-runner.ts` — the process-shaped seam (`write` / `onData` / `onExit` /
  `kill`), imports nothing.
- `src/main/agent-session-args.ts` — the headless argv over `agentArgs`, so a Claude flag
  spelling lives in one table; `--session-id` on the first spawn, `--resume` after.
- `src/main/agent-session.ts` — `AgentSessionManager`: create / send / interrupt /
  answerPermission / dispose / disposeAll / list / get / transcript / subscribe. Spawn on
  first send; one process per session; a queue for sends mid-turn; 16ms delta batching that
  never reorders a non-delta event; turns assembled from the CLI's complete records; usage
  summed per result, cost taken latest; the interrupt grace timer; permission requests held
  as pending and dropped by name on exit; the M61 identity rule on both process doors, with a
  second clause (`session.proc === proc`) the exit-then-resume case needs.
- `src/main/claude-cli-runner.ts` — the real runner: `child_process.spawn`, a
  `StringDecoder` per process, a bounded stderr tail on exit, SIGTERM on kill, a spawn error
  reported as a signal-less exit carrying the message.
- `src/main/quit.ts` — an optional `agents` dependency disposed in both arms, before the
  flush, wrapped so a throw never skips the flush.
- `src/main/index.ts` — the manager constructed after the env probe with the resolved
  `claude` path (or the bare name, so an absent CLI reads as `exited` with ENOENT in its
  stderr rather than as `starting` forever) and handed to `runQuit`.
- `scripts/verify-agent-session.cjs` + `agent-session-entry.cjs` + four scrubbed fixtures
  under `scripts/fixtures/agent-session/` — 54 checks, wired into the chain.
- Documents: README suite list and milestone row; CLAUDE.md suite table and architecture
  list; `docs/verify-suites.md` row; four `docs/load-bearing.md` entries and one manual-only
  bullet; backlog #8 rewritten down.

## The measurements this milestone rests on

All against `claude` 2.1.259 on this machine, 2026-09-03, recorded in the spec: the flag set
(and that `--permission-prompt-tool stdio` is what turns a refusal into a question — measured
twice without it), the record types, `assistant` emitted once per content block with repeated
usage, `usage` per turn vs `total_cost_usd` cumulative (0.0215 → 0.1609 → 0.1684), the
interrupt round trip, the `can_use_tool` request and its `allow` response, and the
`initialize` response carrying the CLI's slash commands (unused here; noted for the composer).

## Red first

- The whole suite failed at module scope before any module existed (`Could not resolve
  "../src/main/agent-session-args"`) — the right reason, and per `docs/verify-suites.md`'s
  rule not evidence for any individual check.
- First green run: 50/54. The four reds were the SUITE's: `isResult` assumed `type` is the
  first key of a result record (the CLI writes `duration_api_ms` first), which also broke the
  accounting check's turn slicing and left the interrupt check with no result, so its grace
  timer fired; and `session.truncated` expected a transcript of one where the fixture's
  thinking record legitimately stores a partial assistant turn before the cut. Both corrected
  in the suite with the reason in a comment.
- Fault injection, one rule at a time, each turning exactly the intended check red and
  nothing else: the data-door identity guard removed → `session.identity`; cost summed →
  `session.accounting`; the carry dropped → `transcript.carry` and `session.split`; `--resume`
  never used → `session.resume`; the batch not flushed before a non-delta → `session.coalesce.b`;
  `interrupted` not taken from session state → `session.interrupt.b`.

## The hand run against the real CLI

`claude-cli-runner.ts` and the manager bundled under plain node and driven against the
installed `claude` (haiku, in the scratchpad). Observed, in order:

1. `send` → `starting` → `session` (uuid pinned) → thinking block → text block `pong` →
   `result` ok, usage `{input 10, output 62, cacheWrite 39772, cacheRead 0}`, cost 0.0799,
   `ready`. Counters `{ignored 17, unknown 0, malformed 0}` — hooks and status lines, nothing
   this parser has not seen.
2. `send` a Bash task → thinking → `tool_use` (input streamed as four `input-json` deltas) →
   **`permission-request`** for `cat /etc/hosts | head -1` → `answerPermission(allow)` →
   `permission-answered` → a `user` turn with the `tool_result` → thinking → text `done` →
   `result` ok; usage summed to `{28, 260, 40101, 79671}`, cost 0.0895 (latest).
3. `send` "count to 300" → deltas streaming → `interrupt()` returned `true` while
   `streaming` → `control-response` for `tc-int-1` → the partial assistant turn stored →
   a `user` turn reading `[Request interrupted by user]` (the CLI's own) → `ready` → `result`
   with `ok: false`, `subtype: 'error_during_execution'`, zero usage, unchanged cost, and
   `interrupted: true` from the session's state. **This is the observation the spec listed
   as missing; the spec is amended.**
4. `dispose` → `disposed`, list empty, the process gone.

Nothing in `npm run verify` reaches this path; it is on the manual-only list.

## Decisions taken while building, and why

- **The seam is process-shaped.** A protocol-shaped runner could not have produced a
  truncated stream, a malformed line or a late exit, and those are the checks the bar names.
- **Spawn on first send.** M72 will create a session per restored chat panel at boot;
  spawning there is one `claude` per panel the user has not touched.
- **The queue is the session's, not the CLI's.** The CLI would accept a second message
  mid-turn; owning the queue means the transcript shows the pending turn, `dispose` drops it
  deterministically, and an exit reports `queue-dropped` with a count rather than losing it
  silently. A queue that survived an exit would need a respawn nobody asked for, and a
  crashing CLI would loop on it.
- **Turns from complete records, not deltas.** A dropped delta then cannot corrupt what is
  stored, and the stored transcript is exactly what the CLI said.
- **`interrupted` from the session's own state.** The real result for an interrupted turn is
  an error subtype; rendering the record faithfully would show the user an error for the
  thing they asked for.
- **Cost latest, usage summed.** Measured, not assumed; see the load-bearing entry.
- **No `--bare`.** "Same agent" means the user's hooks, skills and `CLAUDE.md` apply. It
  costs boot time (the hook lines are the `ignored` counter) and buys the product claim.
- **The CLI's session id is minted here and pinned.** Known before the first byte, so
  `--resume` is deterministic even if `init` never arrives, and M72 can store it beside the
  panel at create time.
- **`ignored` events are not emitted.** Counted only; a subscriber that wanted every hook
  line would be re-rendering on noise. `unknown` and `malformed` ARE emitted, because those
  are the ones a log should carry.

## What this milestone does not do, stated

- No IPC, no UI, no durable transcript file of the app's own (M72), no second backend, no
  system prompt argument, no `--add-dir`, no MCP configuration. Each is a milestone's
  decision, not an omission.
- The `deny` response shape is from the SDK contract; not exercised against the real CLI.
- `npm run shot` not run: no surface changed.

## Verification

- `npm run verify:agent-session`: 54/54.
- `npm run typecheck`: clean, both projects.
- `npm run verify`, alone, after the documents, the verify tmux server killed first: exit 0, every suite green; `verify:agent-session` 54/54, `verify:panels` 265/265, `verify:pty-manager` and `verify:tmux` on the real server. No screenshot: no surface changed.
