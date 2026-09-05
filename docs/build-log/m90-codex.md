# M90 — A second headless backend: build log

Branch `m90-codex`, 2026-09-05. Spec: `docs/superpowers/specs/2026-09-05-m90-codex-design.md`.

## What was measured first

Three streams recorded from codex-cli 0.153.4 into `scripts/fixtures/agent-session/codex/`
(`pong`, `command`, `resume`), with the two facts that shaped the runtime: the prompt is an
argument (one process per turn) and an open stdin blocks the process.

## Red first

`verify:agent-session codex.1` (five lettered checks over the adapter and `codexArgs`) and
`codex.2` (eight over the manager with a fake runner) were written against a module that did
not exist; the suite failed at bundle time, then went 85/85 once the adapter and the manager's
codex arm landed. `verify:panels codex.1`, `verify:rail codex-composer.1` and `verify:layout
codex.1` followed the same shape.

## What the checks caught while building

- **Both field-by-field copy sites dropped `backend`.** `makeChatPanel` and
  `layout-adapt.ts`'s chat copy each rebuild `ChatSource` by name — the rule that keeps an
  absent key absent — so the sheet minted a codex chat and the panel painted `claude`,
  with the record on disk carrying no backend. `verify:panels codex.1` read the file and said
  so; the fix is the same conditional spread the supervisor flag uses at both sites.
- **The harness has no codex on its PATH.** A user preset naming the codex agent over
  `/bin/sh` is what makes the sheet's row available in the suite — the door the
  `composer-claude` preset already uses. On a machine with no codex the check still asserts
  the row's text and its `not on PATH` suffix.
- **Panel ids restart after a reload.** The minted chat took `c117`, an id an earlier block's
  chat had used; that chat's durable transcript file was read back into the new panel. The
  empty-transcript assertion was dropped from the check as unreliable by construction; the
  backend word, the verbs' reasons and the record on disk are the assertions.

## Findings (fresh-context verifier)

Ten findings; six accepted with a check each, one accepted as a nit, three declined.

**Accepted.**

1. **A send between `turn.completed` and the exit was answered `sent` and spawned nothing**
   (blocker). codex flushes its result line before exiting; a handoff target or a fast second
   Enter lands in that window, `inFlight` was already false, and `spawnCodexTurn` returned
   because a process was still held. Now a codex session with a lingering process QUEUES the
   send and `handleExit` serves it. `codex.2.i`.
2. **A codex conversation did not survive a relaunch** (blocker). The thread id was adopted on
   the manager's session only; the record kept the renderer-minted UUID and the next launch ran
   `exec` on a new thread under the same panel. Two halves: the store's `session` arm now
   notifies `onChatSession`, and `Canvas.tsx` writes the id onto a codex record with no history
   entry; and the manager takes `hasTurns` — main answers from the panel's transcript log — so a
   restored codex chat with turns resumes on its FIRST send. `codex.2.l`, and the store's
   snapshot now carries the reported `sessionId`.
3. **The terminal door had two other doors that did not refuse codex.** The palette row and the
   Canvas verb both spawned `claude --resume <thread>` for a codex chat, after removing the
   panel. The row is disabled with the codex reason (a `backend` on the palette's panel row)
   and the verb refuses first. The one sentence is `REASON_CODEX_NO_TERMINAL`, shared.
4. **The spec's `headless` capability was not in the code.** Added to `AGENT_CAPABILITIES`
   for both kinds (interrupts, images, permissions, terminalDoor).
5. **The budget ceiling could not stop a codex turn.** `enforceBudget` stops through
   `interrupt`, which codex refuses. A crossing now KILLS a codex turn in flight with
   `abortReason: 'budget'` — the spec's "never kills" was written for claude, where a graceful
   door exists; here the kill is the only stop, and it is named. `codex.2.j`. The spec is
   amended.
6. **The image refusal was checked nowhere** and lived in main's handler alone. Moved into the
   manager (`refused-images`, stores nothing, spawns nothing), main maps it to the sentence.
   `codex.2.k`.
7. (nit) The duplicate `status: ready` emit in `handleExit`'s codex arm is gone; a
   `turn.completed` with no `usage` object yields an absent `usage`, not zero totals.

**Declined.**

- *`thread.started` never arriving should be a named abort.* Every recorded stream leads with
  it; a stream without it is a CLI change, and the answer the user saw was real — aborting a
  completed turn would say something false. The consequence (the next send starts a thread) is
  bounded and visible in the inspector's session id. Recorded here rather than coded.
- *`turn.failed` followed by exit 0 reads `ready` with the turn counted.* claude's error results
  count as turns too, and the conversation can continue; `ready` is the truthful state.
- *`codexAvailable` (a preset's command resolving) and `codexPath` (main's probe) are different
  probes.* The same shape `claudeAvailable` has had since M73; a wrapper preset enabling the row
  while main refuses by name is the named-refusal path, not a silent one.

**Not verified by any suite, added to the manual list:** `closeStdin` in the real runner (never
bundled), and codex's own definition of `input_tokens` against its cached and cache-write
figures (the adapter subtracts both; the fixture's numbers are consistent with that reading).

