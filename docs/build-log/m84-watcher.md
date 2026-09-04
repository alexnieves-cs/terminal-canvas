# M84 — The watcher

**Branch:** `m84-watcher`. **Spec:** `docs/superpowers/specs/2026-09-04-m84-watcher-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m84-watcher.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** a node that runs a command when something happens, so the canvas holds
work that is waiting rather than only work a person started.

## What landed

- `shared/watch-trigger.ts`: the four triggers (`path`, `git-ref`, `timer`, `panel`) and
  `triggerWord` / `describeTrigger` — the ONE phrase every surface says a trigger with, the
  rule `trigger-words.ts` already applies to edges, extended rather than copied.
- `main/watch-runner.ts`: one command per watcher over an INJECTED process seam. One run at
  a time with a coalesced pending (five saves during a run mean one more run); the exit arms
  where a signal is a failure; a tail capped at `WATCH_TAIL_BYTES` keeping the END; a ledger
  row per finished run through M52's existing ledger, metadata only. `verify:file watch.1`.
- Arming, in `main/index.ts`: a recursive `fs.watch` for a directory, `FileWatchers` for a
  file (a git trigger is a file watch on `.git/HEAD`), an interval for a timer, and the
  `panel` trigger fired by the RENDERER from the same events and the same `handoffFires`
  table the graph's edges ask. Four arms, one `fire`.
- The eighth panel kind: `panels.ts` (`WatcherPanel`, `isWatcherPanel`, the clause added to
  `isTerminalPanel`'s partition), `layout-schema.ts`'s parser (a trigger from a later version
  drops its panel rather than being coerced; the timer floor), `layout-adapt.ts` both ways,
  `panel-state.ts`'s watcher arm — a PROCESS node, so it speaks the process words and no new
  word was invented — the rail label and row subscription, the inspector's three fields,
  `WatcherNode.tsx` and the per-panel store mirror.
- The palette's `Watch…` row, disabled by name without a directory; the trigger typed in the
  words the node shows (`every 10m`, `branch`, a path), refused by name rather than guessed.
- Five `watcher:*` invokes and `watcher:state`, in the contract and BOTH diagrams;
  `verify:ipc` at 87.
- `verify:layout watch.1/.2`, `verify:panels watch.1/.2`, a `watcher` shot scene.

## Red first

- `verify:file watch.1`: red at bundle scope (both modules absent), then red once more on my
  own measurement — it counted `running` STATE PUBLISHES to prove the coalesce, and the
  pending flag publishes one too; it counts SPAWNS now, which is the fact it means.
- `verify:layout watch.1/.2`: red with `dropped panel …: unrecognised kind "watcher"`.
- `verify:panels watch.1/.2`: red, then red twice more for two REAL defects and one harness
  fact — see below.

## Decisions taken while building, and why

- **A watcher speaks the process words.** `passed` is `idle` and a non-zero exit is
  `exited N`, the same words a terminal running the same command shows. That is the whole
  reason a wall of watchers is readable without opening any of them, and it cost no new
  vocabulary, no new tone and no change to the rail, the minimap or the far tiers.
- **A signal is a failure.** `exitCode` is null for a signalled process, and a truthiness
  test would read a kill as a pass.
- **One run at a time, with ONE pending.** A queue makes a watcher fall further behind the
  harder its user works, which is why people turn watchers off.
- **The tail keeps the END and is memory only.** A failing command says why on its last
  lines; the durable record is the ledger row, which carries no output at all.
- **The `panel` trigger is the renderer's arm.** It is the side that already learns every
  exit and every turn's end, and it asks the same table the edges ask. Arming it in main
  would give main a second way to learn a panel ended, and the two would disagree only in
  the cases nobody tests.

## What this milestone does not do, stated

- No debounce control, no per-watcher concurrency: one run at a time is the rule, not a
  setting.
- A watcher is a handoff SOURCE only through its trigger; it does not paste its output into
  another panel (that is an edge's job, and an edge from a watcher is not built).
- The timer arm over a real hour, and a long real test command watched by eye, are on the
  manual-only list.

## The visual loop

See the triage below.

## Verification

`npm run verify` run alone. `verify:file` 42/42, `verify:layout` 192/192, `verify:rail` 158/158,
`verify:panels` 293/293, `verify:ipc` 87 channels, and the chain's own exit code 0.

## Triage: the critic

**Accepted and fixed.** The node had no state PILL — the one process node on the canvas
without one, so a supervisor scanning frames read every other node's state and guessed at
this one (now `● idle` in the chrome row, the terminal's own component and position).
`LAST RUN IDLE` was coined copy, shouted, and made one word mean two things on one panel
(now `last run passed` / `last run failed — exit 2` / `last run was stopped (SIGKILL)`, in
plain lower case, with the pill carrying the node's state). `▶` was an unlabelled glyph beside
a phrase it could have been modifying (now the word `Run now`, beside `Stop`). The command
line was the loudest thing in the well while the run's own output was quieter (now muted, at
the smaller size — provenance, not content). The rail row had no state mark at all, so a
watcher read as a document in the one column a person scans for pass and fail (its kind glyph
now carries the state tone).

**Declined, with reasons.** *A resting shadow on the frame.* `verify:styles shadow.1` pins
that panels have no resting shadow; what the critic saw is the SELECTED node's elevation,
which is the selection ring's own treatment.

## Triage: the verifier

Verdict: delivered with gaps — and the gaps were real. **Accepted and fixed:**

- **The arming refusal was discarded.** `create` returns `{ ok: false, reason }` and disarms;
  the node dropped it, so a watcher whose path was gone sat at `not started` forever, still
  runnable by hand, with nothing anywhere saying why it never triggered — and the spec's own
  fifth state was dead code. The node now shows it. `verify:panels watch.3`.
- **Nothing disposed watchers on quit.** A quit mid-run orphaned an `npm test` with no
  window, no ledger row and no way to find it but `ps`. `runQuit` has a `watchers` arm now,
  on BOTH sequences — the keep-on-quit setting is about tmux sessions that can be
  reattached, and a watcher's child cannot be. `verify:file watch.2`.
- **Nothing reconciled main's watcher set.** A reload left main holding an interval and a
  recursive watch that went on RUNNING THE COMMAND for a node nobody could see or stop. Main
  reconciles against every workspace's panels on each create.
- **A timer watcher could reopen the window.** `sendToRenderer` creates a window when there
  is none, so a tick would pop the app back open while nobody was looking. Watcher state is
  news for a window that exists.
- **`stop` could not stop.** One SIGTERM, no escalation (the exported grace constant had zero
  references), and it cleared the pending flag without publishing it. Now SIGTERM, then
  SIGKILL after the grace, and the cleared flag is published. `verify:file watch.2`.
- **No `error` listener on the directory watcher.** Deleting a watched directory emits
  `error` on the `FSWatcher`, and an unhandled one THROWS in main — the whole app, for an
  ordinary thing to do. It now disarms and says so.
- **`remove` lost the run it killed.** The epoch was bumped before the kill, so the in-flight
  run appended no ledger row while `stop` did — the two disagreed about whether a run had
  happened. `verify:file watch.2`.
- **The mount effect keyed on object identity**, so a load that changed nothing re-armed —
  and a re-arm tears down the directory watch and rebuilds it, losing whatever lands in the
  gap. It keys on a string now.
- **`WatchStateInput.pending` was a field the vocabulary never read.** Removed rather than
  copied at every site.
- **`Stop` disappeared instead of being disabled**, which is this repo's named rule and the
  spec's own words. Both verbs are always present, the one that cannot act disabled with its
  reason.
- **`Arm`/`Disarm` was in the spec and missing.** It is a persisted pause now (`armed`
  absent means armed), the trigger phrase reads `not watching` while off, and `Run now` still
  runs it — a pause, not a delete. `verify:panels watch.3`, `verify:layout watch.2`.
- **A `panel` trigger was unreachable from the UI**, so the milestone's headline sentence
  ("when the tests pass, tell the agent") could only be reached by editing `layout.json`.
  `after this passes` / `when this fails` / `after this finishes` are typed in the trigger
  line with a panel selected. `verify:rail watch-words.1`.
- **A misspelled duration became a path.** `evry 10m` armed a real command against a
  directory of that name, discovered by watching it never run. Anything ending in a duration
  is refused and the line re-prompts.
- **`watch.2` accepted `passed` OR `running` and counted nothing**, so a watcher firing twice
  per source ending would have passed. It asserts exactly one ledger row.
- **`watcher:list` had no caller.** It seeds the renderer's store on subscribe, so a reloaded
  canvas shows the run that finished thirty seconds ago rather than `not started`.

**Declined, with reasons, and the spec amended to say so.** *A `watcher` option in the spawn
sheet:* the sheet spawns a preset into a directory, and a watcher needs a command and a
trigger — the palette's two lines already ask exactly those. *Persisting the last run:* a
restored `passed` is a claim about a run whose files may have changed since; the ledger is
the durable record. *`git-ref` beyond `.git/HEAD`:* a ref moved by `git update-ref` or a
fetch that does not touch HEAD is not seen, and the spec now says so rather than implying
more. *Coalescing under a real filesystem, the timer over a real hour, and `stop` against a
real SIGTERM-ignoring process:* the first is proven against the fake spawn and the real
directory watch separately, and the other two are on the manual-only list.
