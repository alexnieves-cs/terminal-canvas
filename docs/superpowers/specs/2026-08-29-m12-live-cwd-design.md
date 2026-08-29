# M12: Live cwd and live command — Design

**Status:** designed, not yet implemented.
**Predecessor:** `2026-08-29-m10-visual-system-design.md` by number; by
DEPENDENCY, none — M10 (the visual system) touches `styles.css` and no `.tsx`,
and M11 (themes) is claimed by M10's own spec. This milestone touches
`tmux-args.ts`, `pty-manager.ts`, the IPC contract, a new renderer store and
the inspector, and shares not one file with either. The number records claim
order, not a build order: M12 can land before M10 or M11 without conflict.
**Backlog entries:** #41 (live cwd and live command — the whole of this spec),
and the four entries that already assume it works: #3 (file tree — "which
directory?"), #4 (multiplayer's git badge), #19 (token accounting's transcript
correlation) and #26 (per-project agent config). M9's own spec named #41 as
"the one place M9 inherits a known-wrong assumption"; this is that assumption
being paid off, though **not** for M9 itself — see "Scope".

## Goal

Make "this panel's directory" a true statement.

It is not one today, and nothing says so. `PanelSpec.cwd` is where a panel was
told to spawn; `PtyCreateResult.cwd` is what main resolved that to at spawn
time. Both are frozen the instant the process starts, and the first thing
anyone does in a shell is `cd`. So the inspector's `cwd` field —
`running?.cwd ?? panel.spec.cwd`, two spawn-time values wearing a present-tense
label — is confidently wrong for any panel that moved, for the rest of that
panel's life, with nothing anywhere indicating it.

This is a **correction, not a feature**. Its value is not the field; it is that
four already-captured entries assert this fact exists, and each of them is
silently wrong for a moved panel. M12 makes the assertion true.

## Why it is nearly free, and why that is the argument

`parseListOutput` already pulls `#{pane_current_path}` out of tmux. The result
is consumed exactly once, at boot reconciliation, and thrown away. The list is
also **global**: `buildListArgs` asks tmux once for every session at once, so
polling costs one subprocess per tick whether the canvas holds two panels or
forty. That is unusual, and it is what makes a poller the right shape here
rather than the expensive one it usually is.

## Scope

In:

- **`#{pane_current_command}` added to `LIST_FORMAT`**, beside the
  `#{pane_start_command}` already there, and `currentCommand` on
  `TmuxListEntry`.
- **A second, slow tick in `PtyManager`**, deduped, emitting a new
  `session:live` event only when a value actually changed.
- **A renderer store**, `live-session-store.ts`, subscribed per panel id.
- **The inspector** showing the live directory and the live program, as fields
  BESIDE the spawn-time ones rather than replacing them.
- **Two consumers corrected**: project-prompt reading (`.claude/commands` under
  the panel's real directory) and preset capture.

Out, deliberately:

- **Review.** A panel that `cd`'d into a second repository is still reviewed
  against the first. The stored baseline sha lives in the first repository, so
  correcting this needs a recapture-or-refuse policy — a design of its own, and
  the reason CLAUDE.md records the limitation rather than papering over it. It
  is the natural successor to this milestone.
- **Any use of the live command beyond display.** Knowing that `claude` is the
  foreground process is exactly the input a "what is this panel actually
  running" feature wants; nothing in this milestone acts on it.
- **A live-cwd fallback on the direct backend.** There is no answer there and
  inventing one is the specific failure this spec exists to remove.

## Components

**`main/tmux-args.ts`** — `LIST_FORMAT` gains one field; `TmuxListEntry` gains
`currentCommand`; `parseListOutput` reads six columns instead of five. The
`#{pane_dead}` filter is untouched and is load-bearing here for a second
reason: `remain-on-exit on` leaves a finished process listed as existing, so an
unfiltered poll reports a corpse's last known directory as a live fact, every
two seconds, forever.

A missing sixth column yields `''`, the tolerance `command` and `cwd` already
get. This matters at exactly one moment — a running tmux server started by a
build that predates the new format string — and dropping the entry there would
turn a cosmetic gap into a panel that reads as dead.

**`main/pty-manager.ts`** — `LIVE_TICK_MS = 2000` and a `startLiveTick` /
`stopLiveTick` pair modelled on `startIdleTick`, with the same lifetime (armed
on the first session, cleared when the map empties) and the same `unref()`, so
a 0.5Hz timer cannot hold a plain-node verify process open. Note that the
lifetime is not one call site but **four**: `stopIdleTick` is called from three
places today (the exit handler, `kill`, and `killAll`), each guarded on
`this.sessions.size === 0`, and the live tick has to be stopped at every one of
them. Missing a single one leaves a subprocess spawning every two seconds for
the life of the app, on a canvas with no panels left — which nothing on screen
would report. Re-derive that count with `grep -n "stopIdleTick"` rather than
trusting this sentence; this repo has already had one call-site count go stale
inside the commit that recorded it. Each tick calls
`backend.list()`; a `null` answer returns immediately, so the direct backend
costs one property read per tick and never spawns anything.

The **dedupe is the design, not a tuning pass.** Main holds the last values
sent per panel and emits `session:live` only on a change — the rule
`applyEvent` already follows for agent state, and for the same reason stated
there: an undeduped send is thirty messages a minute per panel describing a
fact that changes when a human types `cd`.

**`shared/ipc-contract.ts`** — one new event on `IPC_EVENTS` (not `IPC`; see
Verification for why that distinction decides a check's expected number),
`SESSION_LIVE: 'session:live'`,
payload `{ panelId, cwd, currentCommand }`. Main to renderer, like `PTY_DATA`
and `AGENT_STATE`. It is genuinely a new channel rather than something the
renderer could fold from messages it already has (the test M6d and M7 each
applied and each declined): only main can see tmux, and nothing already
crossing the boundary carries this.

**`renderer/session/live-session-store.ts`** — a copy of
`agent-state-store.ts`'s shape, and deliberately so: module-level, subscribed
**per panel id** so a change for `n3` notifies only what asked about `n3`, over
a cached snapshot because `useSyncExternalStore` compares by identity.

It must never bump `registry.version()`. That counter bumps on
tier/status/focus/exit and nothing higher-frequency, which is what keeps
`TerminalPanel`'s memo blocking the 60Hz pan/zoom cascade. A fact that changes
every two seconds riding it would re-render every panel on every other panel's
`cd`. This is the fourth entry to record that same rule; #5, #17 and #18 each
recorded it independently.

## The inspector, and the asymmetry underneath it

The pane shows the live directory and the live program as their own fields,
alongside the spawn-time `cwd` and the existing resolved/asked-for command
pair. It does **not** overwrite them. That follows "the inspector shows the
links, not the answer": a panel that moved is precisely the case where seeing
both halves is the point, and a single merged `cwd` field renders something
entirely plausible while making "why is this not where I started it" a question
the app cannot answer.

The asymmetry that has to be stated once and obeyed twice:

- **Display reports nothing when there is no live answer.** No tmux, or a panel
  the poller does not cover — the field is absent, not backfilled. A spawn cwd
  shown under a live label is indistinguishable from a correct answer, which is
  worse than an empty field, and #41's own constraint says so.
- **Consumers fall back to the spawn cwd.** Project prompts and preset capture
  need *a* directory; the fallback is exactly today's behaviour, so the
  consumer half is never worse than not shipping this milestone at all.

The two rules disagree on purpose, because a label makes a claim and a
directory argument does not.

## Honest degradation

`SessionBackend.list()` returns `null` on the direct backend by contract — not
"nothing is running", but "ask the manager". The manager's own map holds only
spawn-time values, so there is no live answer to give and none is invented. The
poller does not run, the store stays empty, the fields do not render, and the
consumers use what they use today.

## Two stated limits, recorded rather than fixed

- **A panel with a surviving tmux session that this renderer holds no local
  session for is not polled.** The tick is armed off the map, like the idle
  tick, so a never-promoted panel on a restored canvas has no live answer even
  though tmux could give one. Widening the tick's arming condition is the fix
  and it is not taken here, because the map is also what stops the timer
  running forever in an idle background app.
- **Between ticks the answer is up to two seconds stale.** That is acceptable
  for a label and would not be for anything that navigates or writes, which is
  a second reason review stays out of scope.

## Verification

Test-first, watched failing, in the cheapest tier that can see each fact.

- **`verify:tmux`** — `LIST_FORMAT` carries `#{pane_current_command}`;
  `parseListOutput` returns `currentCommand`; a five-column line from an older
  server still yields an entry with `currentCommand: ''` rather than being
  dropped; the `#{pane_dead}` filter still drops a dead pane, asserted with the
  new column present so the widening cannot have quietly shifted the field it
  reads.
- **`verify:pty-manager`** — the check this milestone turns on. A real tmux
  session, a real `cd` written through the PTY, and **exactly one**
  `session:live` event carrying the new directory, counted after the stream has
  demonstrably settled, then silence across further ticks. The fixture has to
  be able to tell a deduped implementation from an undeduped one — check 17's
  comment records what happens when it cannot, and the same trap applies here
  in reverse: an implementation with no dedupe emits on every tick, so the
  check must span several ticks or it proves nothing. It inherits the block's
  standing obligation to end in a definite `kill-server`.
- **`verify:panels`** — the inspector shows the new directory after a real `cd`
  in a real panel, and the spawn-time field is still on screen beside it (the
  clause that rejects a merged implementation); and a `.claude/commands`
  directory the panel `cd`'d *into* is what `prompt:list` reads, which is the
  only end-to-end proof the consumer half is wired rather than merely present.
- **`verify:ipc`** — **unchanged at 31, and that is the correct answer rather
  than an omission.** That suite asserts over `Object.values(IPC)`, the INVOKE
  channels, each of which must have an `ipcMain.handle`. `session:live` is an
  `IPC_EVENTS` member — main to renderer, like `PTY_DATA` and `AGENT_STATE` —
  which is handled by nobody and counted by nothing. M6d hit this exact
  boundary and recorded it: it added no invoke and the count stayed at 20. An
  earlier draft of this spec said 31 to 32; it was wrong, and a task written
  from it would have failed the suite by "fixing" a correct count.

Both tmux-dependent blocks skip **loudly** where no tmux binary is found, the
rule every tmux block in this repo already obeys.

## Success criteria

1. A panel that `cd`s into another directory says so in the inspector, within a
   tick, without the spawn-time value disappearing.
2. A panel running `claude` reports `claude` as its current program, not the
   `/bin/zsh` it was spawned as.
3. Project prompts are read from where the panel *is*, not where it started.
4. A panel that never moves produces **no** `session:live` traffic after its
   first value — measured, not argued.
5. With no tmux, nothing renders, nothing falls back into a live-labelled
   field, and no behaviour changes from M9c.

## Risks

- **The dedupe is the whole cost story, and a regression in it is invisible.**
  Nothing on screen changes when the app sends thirty messages a minute per
  panel instead of one; it shows up as heat. Success criterion 4 exists to be
  the only thing that would notice.
- **`pane_current_command` is tmux's guess.** It reports the pane's foreground
  process as tmux understands it, which for a shell running a wrapper script
  may not be the name a user recognises. It is a display field only, which is
  the mitigation.
- **Two ticks in one class.** `startIdleTick` and `startLiveTick` share a
  lifetime and differ by an order of magnitude in period; a later edit that
  merges them would silently make idleness detection 4x coarser, which is
  M6c's whole threshold. They stay separate, and the comment says why.
