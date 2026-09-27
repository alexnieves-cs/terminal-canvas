# M384 — the ACP transport seam, written down and pinned

**Verdict: shipped (a seam and its checks; no remote transport, which has no stable spec
to build to).** Arc 2's "ACP hybrid control: drive agents via ACP v1 for structured
sessions, prompts, and permission events; keep PTY as the display layer. Keep a clean,
documented swap point for ACP remote transport when it stabilizes. Respect the declined
host decision."

Measured before building:
- **Structured control over ACP exists** (M119): `copilot --acp`'s handshake,
  `session/new`, `session/prompt`, `session/cancel`, `session/load`, and
  `session/request_permission` answered through the one `answerPermission`.
- **The PTY is the display layer** for every terminal, and a chat is the display for a
  structured session (claude's stream-json, codex's exec JSON, ACP's JSON-RPC). That is
  the hybrid the prompt describes. It is already the product's shape.
- **The declined host decision stands** (backlog #81, by measurement).
  `clientCapabilities` still declines `fs/*` and `terminal/*`.

What was missing was the swap point, written down and held. The codec, the adapters and
the manager reach an ACP agent ONLY through `AgentProcess`: write one JSON line,
`onData`, `onExit`, `kill`. Only `main/agent-runner.ts` spawns. So ACP's remote transport,
when it stabilizes, is one more `AgentRunner` returning an `AgentProcess` over a socket:
- lines go out as messages;
- messages come in as data;
- a close is the exit.

Nothing in the codec, the adapters or the manager changes.

## What landed

- **`docs/architecture-map.md`**: the seam, under M119's ACP entry. It says what a remote
  transport is, where it is chosen (per backend row, where the runner is built), what
  does not change, and which checks hold it.
- **`verify:agent-session acp.transport.1`**: none of the protocol path's modules
  (`acp-transcript.ts`, `backend-adapters.ts`, `agent-session.ts`,
  `agent-session-args.ts`) imports a transport (a child process, a socket, TLS, HTTP,
  Electron, `ws`, node-pty). `AgentRunner` stays `(spawn) => AgentProcess`, and
  `agent-runner.ts` is the one spawner.

## Decisions, and why

- **No `remote` arm, no stub runner.** ACP's remote transport is a draft with no
  endpoint shape to build against. A declared-but-inert transport would be a customer-free
  abstraction, the kind this repository removes (M23-spec §9.1). What a clean swap point
  needs is a narrow interface the protocol already uses and nothing else. That exists, it
  is now named, and a check stops it widening.
- **The behaviour half was already checked.** `acp.3` drives a whole ACP session through
  the manager over an in-memory runner that is not a process: the handshake, the held
  first prompt, the turn and the permission answer. That is exactly what a socket runner
  would be. The new check pins the text half, which a refactor could break quietly by
  importing `child_process` into the adapters.

## Checks

- `verify:agent-session acp.transport.1`. 187/187.

No display changed, so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean; `verify:agent-session` 187/187,
`verify:meta` 51/51.

**The replay chain gate (M381, M382, M383, M380, M384), on the tree holding all five:**
the full `npm run verify` ran 59/61 suites in 729.8s, and every red is the baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

There was no watchdog. The chain's visual pass is in M383's and M380's ledgers: the new
`replay.png`, and the four Work-tab scenes M380 moved.

## Owed

- **The remote runner itself**, once ACP's remote transport has a stable spec and an
  agent that speaks it: a runner, and a row field naming its endpoint.

Next: land M373–M384, then the final report.
