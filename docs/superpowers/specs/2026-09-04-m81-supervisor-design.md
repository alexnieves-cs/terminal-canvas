# M81 — The supervisor

**Status:** design, 2026-09-04. **Branch:** `m81-supervisor`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 1 (one state vocabulary), 6, 7, 9; 2.0 principles 10
(three natures, one canvas), 11 (one vocabulary whoever produced it), 12 (the transcript is a
well).
**Thesis sentence:** an agent whose subject is the canvas itself — it can read what every
panel is doing, and it answers in the same words the canvas uses.

## What this milestone is for

Every surface so far tells a person what the canvas is doing. Nothing tells an AGENT. The
supervisor is a chat panel whose job is the canvas: it reads the model through `tc status`,
the read-only control verb this milestone adds, and answers questions about it — what is
waiting, what failed, what a run cost. It is the thesis sentence's last clause reached from
the other side: a node on the canvas whose subject is the canvas.

## Design

### `tc status` (`control-protocol.ts`, `control-handler.ts`; verify:control)

- A fifth verb, `status`, parsed like the others on the SOCKET, refusing a `command`/`args`
  key as they all do — and refused by name at the URL door, which M54 restricted to `open`
  (a URL has nowhere to put a reply, and `status` is a question). Its reply carries the canvas MODEL as JSON: `{ ok: true, canvas: { panels: [{ id, kind,
  title, state, cwd, cost? }], edges: [{ from, to, trigger }], runs: [{ id, name, outcome,
  panels, cost? }] }}`.
- READ-ONLY by construction: `status` has no arm that spawns, focuses, writes or kills. The
  handler builds it from what main already holds (PtyManager's sessions) plus ONE ask of the
  renderer over the ephemeral reply channel `canvas:counts` already uses — a new event,
  `canvas:model`, answered by the renderer with the panels, edges and runs it is rendering.
  A renderer that does not answer in time yields `{ panels: [], edges: [], runs: [] }` with a
  `note` saying so, the three-state rule.
- The words are the canvas's own: `state` is the state vocabulary's word (`working`, `needs
  you`, `idle`, `asleep`, `exited 0`), never a second set; a trigger is
  `trigger-words.ts`'s.

### The supervisor panel (`agent-session-args.ts`, the spawn sheet)

- `headlessArgs` gains an optional `appendSystemPrompt`, passed as
  `--append-system-prompt <text>`; `AgentSessionSpec` carries it so a chat can be created
  with one. The supervisor's text names its job and its one tool: read the canvas with
  `tc status`, answer in the canvas's own words, never spawn or close anything.
- A supervisor is a chat panel created with that prompt, its `agentOptions.permissionMode`
  left alone, spawned from the sheet's `what` list as `supervisor of this canvas`. Its first
  message — `What is this canvas doing?` — is INSERTED into its composer, never sent
  (M80's rule: nothing starts work the user has not read).
- ONE per workspace: the sheet's row is disabled by name when one exists
  (`this canvas already has a supervisor`).

## What it must not break

- The control surface's refusal rules (`command` never accepted; the socket stays 0600).
- `verify:ipc`: `canvas:model` is an EVENT with an ephemeral reply channel, like
  `canvas:counts`, so it is not a handler-backed invoke and must not be counted as one.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| `status` accepting a command; the URL door answering a question; an unknown key spawning something | `verify:control status.1` |
| The model's words drifting from the canvas's vocabulary | `verify:control status.2` |
| A renderer that does not answer yielding an empty model with no note | `verify:control status.2` |
| The append flag missing, or applied to a resumed session | `verify:agent-session supervisor.1` |
| A second supervisor offered; the first message sent rather than inserted | `verify:panels supervisor.1` |
| `tc status` not answering over the real socket with the real model | `verify:panels supervisor.1` |

## Manual-only, added

- A real `claude` supervisor actually calling `tc status` and reading its own canvas.
- **That `claude --resume <id> --append-system-prompt <text>` is ACCEPTED.** The flag is
  passed on every spawn, fresh and resumed, on the reasoning that the CLI keeps no record of
  an appended prompt — but whether it takes the flag beside `--resume`, ignores it, or
  refuses, is an unverified protocol claim about `claude` 2.1.259, the same standing as M17's
  `--session-id` filename rule (the verifier's finding).
- **That `tc` is on the supervisor's PATH.** M54 writes the launcher into `userData/bin`; a
  chat session's environment is the login environment, and nothing here checks the two meet.
- **That the supervisor's first `tc status` raises an M76 permission request** the user must
  answer — the sheet does not say so, and the permission mode is left at the CLI's default.
