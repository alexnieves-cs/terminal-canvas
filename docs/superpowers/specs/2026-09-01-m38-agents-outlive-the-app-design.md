# M38 — Agents that outlive the app

**Status:** designed 2026-09-01. Required for 1.0 by the scope amendment
(`2026-09-01-v1-scope-decision.md` §7, feature 5).
**Backlog entry:** #56.

## What this milestone is for

Since M4c a panel's process lives in a tmux session on a private socket, and
a renderer teardown — `Cmd+R`, `Cmd+W` — detaches the client and leaves the
agent running, so the next page lands back in it mid-sentence. Quitting the
app does not: `before-quit` calls `killAll()` and then `shutdown()`, which is
`kill-server`, with a comment recording that agents never outlive the app.
That was M4c's scope line, not a technical limit. The substrate that survives
`Cmd+R` survives `Cmd+Q` for free — `detachAll()` and `new-session -A` are
the same two calls in a different order — and the boot reconciliation
already reattaches every session whose panel the layout knows and kills the
rest. An agent that has been working for forty minutes should not be ended
because the user quit to restart their Mac.

## Decisions

### 1. A setting, and it ships OFF

`session.keepOnQuit`, a boolean `SettingDef` in a new `Sessions` category —
the standing rule (#11) that anything a user can toggle lives in the one
schema, which buys the persisted value, the palette row and the menu item
for free. **Off by default, overruling the brief's implied default in
writing** (scope decision §7): a person who quits an app expects its
processes to stop, and an agent left burning tokens behind a quit is exactly
the surprise the setting's description has to name. The author, who wants the
opposite, is one palette row away, and the choice persists.

The description says what it DOES and what it needs: "Keep every panel's
process running after you quit, and reattach on the next launch. Needs tmux;
without it processes end with the app either way." The direct backend has no
sessions to keep, and a setting that is honest about that beats one that is
ignored silently.

### 2. The quit sequence is one pure module, and it keeps its ORDER

`main/quit.ts` exports `runQuit({ keep, manager, backend, flush })`, which
performs exactly one of two sequences:

- **end** (the default): `manager.killAll()`, then `flush()`, then
  `backend.shutdown()` — today's sequence, unchanged, including the ordering
  `before-quit` records: teardown first because `kill()` schedules store
  writes (`dropBaseline`, `dropSession`) that the flush has to include.
- **keep**: `manager.detachAll()`, then `flush()`, and **no `shutdown()`**.
  The clients are killed, every session stays running on the socket, the
  layout is written synchronously, and the server — with the pane-died hook
  still pointing at `userData/tmux-exits` — survives the process.

The module takes its collaborators injected so `verify:pty-manager` can run
the real sequence against a real `PtyManager` on a real tmux server on the
verify socket, which is the only place this can be proven: an `app.on(
'before-quit')` handler is unreachable from any suite. `main/index.ts`'s
handler becomes a call to `runQuit` with `keep` read from the store at quit
time (never captured earlier — a value read at boot would freeze the toggle
until the next launch).

**Teardown-then-flush stays load-bearing in BOTH arms**, and the keep arm
has a second reason for it: the boot orphan-killer ends any session whose
panel the layout does not know, so a flush that ran BEFORE a store write
landed would be an agent killed at the next launch for not having been
written down yet. `detachAll()` schedules no writes today, but `flushSync`
after it is what keeps that true by construction rather than by inspection.

### 3. Boot needs no new code, and the two things it already does are why

- `main.tsx` asks `pty:list` before the first render and restores every
  panel with a live session as REATTACHABLE rather than dormant — "dormancy
  is about spawning, not attaching", the rule M4c settled. A kept session is
  precisely a live session with a saved panel.
- The orphan-killer ends sessions with no saved panel; with `flushSync` at
  quit, a kept session always has one. `staleBaselineIds` keeps the
  baselines of surviving sessions, so a review of a kept panel still diffs
  against the snapshot its agent started from.

Two limits stay as they are and are recorded rather than fixed:
`firstSpawnedAt` after a relaunch falls back to now (pty-manager's own
comment), so a kept `claude` panel's subagent nodes are unclaimable until
its next spawn; and `agent:state` starts at `starting` for a reattached
session, so a kept agent that is mid-question shows no `wants-you` until its
next bell.

### 4. The HUD and README say what quitting means

The README's "Quitting the app does tear them down" becomes a sentence
naming the setting. The HUD's direct-backend warning is unchanged — it
already says sessions end on reload, which subsumes quit.

## What it must not break

- **`pty.kill` keeps exactly two renderer callers; `detachAll`/`kill`/
  `shutdown` stay three distinct operations** with `runQuit` as a named
  fourth caller that picks between them, never a fourth operation.
- **The verify suites never touch the production sockets.** The new check
  runs on the verify socket and ends with a definite `kill-server`, per check
  20's obligation.
- **The single-instance lock's gate** — a losing instance still touches no
  store, socket or PTY; `runQuit` is called only past `hasInstanceLock`.
- **The reset dialog's "cannot be undone" promise** is untouched: reset is a
  layout operation, not a quit.

## Verification

- `verify:pty-manager` `keep-on-quit.1`: `runQuit({ keep: true })` against a
  real manager on the verify socket leaves the session listed and a fresh
  manager's `create()` at the same id reports `reattached: true` with the
  SAME pane pid — the pid is the only observable that separates "kept" from
  "killed and respawned" (check 20's rule). `keep-on-quit.2`: `runQuit({
  keep: false })` ends the session and the server, and the flush ran between
  teardown and shutdown (order observed through injected spies).
- `verify:layout` `keep-on-quit.1`: the setting exists, is boolean, defaults
  to `false`, and `resolveSetting` answers the default on an empty map.
- `verify:panels`: nothing new — the palette row is auto-generated from the
  schema and check 78's shape already covers a boolean setting reaching the
  frame.
