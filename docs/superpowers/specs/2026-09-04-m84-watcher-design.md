# M84 — The watcher

**Status:** design, 2026-09-04. **Branch:** `m84-watcher`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 1 (a state that has no process is drawn as one),
2 (every frame carries a state edge), 6 (every control says what it is), 7 (three states),
9 (a disabled row names the fix); 2.0 principles 10 (a process node speaks the process
words) and 11 (the same words wherever the same fact appears).
**Thesis sentence:** a node that runs a command when something happens, so the canvas holds
work that is waiting rather than only work a person started.

## What this milestone is for

Every process on this canvas is started by a person: a panel is spawned, a chat is sent to,
a template is instantiated. The scope decision calls the watcher backlog #55's triggered
form, and it is the last of the five surfaces §1 names for 2.0. A watcher is the node that
says *when this changes, run this* — the tests that run themselves on a save, the typecheck
that runs when the agent's branch moves, the build that runs every ten minutes — and, being
a process node, it is a handoff SOURCE like any other, so "when the tests pass, tell the
agent" is an edge rather than a feature.

## Design

### The kind (`watcher` — the eighth)

A PROCESS node that is not a terminal: it has a process, so it speaks the process words
(principle 10), but it has no PTY, no xterm and no place in `LIVE_BUDGET`. Its panel record:

```ts
{ kind: 'watcher', watch: { cwd, command, args, trigger, lastRun? } }
```

`command`/`args` are what M5's presets already are — a command and its argv, run through
`child_process.spawn` with `shell: false`, never through a shell string.

### The triggers (`shared/watch-trigger.ts`, pure)

```ts
type WatchTrigger =
  | { kind: 'path'; path: string }        // a change under a file or directory
  | { kind: 'git-ref'; root: string }     // HEAD or a ref under root moved
  | { kind: 'timer'; everyMs: number }    // a clock
  | { kind: 'panel'; sourceId: string; on: HandoffTrigger }  // another node ended
```

`triggerWord(trigger)` gives the ONE phrase every surface uses (`on a change in src/`,
`when the branch moves`, `every 10m`, `when tests exits 0`) — the closed vocabulary rule
`trigger-words.ts` already applies to edges, extended, not copied. `describeTrigger` is its
long form for the inspector. A `panel` trigger reuses `handoffFires` verbatim: there is one
table for "did this end in a way that fires something", and a watcher asks it too.

### The runner (`main/watch-runner.ts`, plain node over injected deps)

- `createWatchRunner({ spawn, now, ledger, onState })`. `spawn` is the process seam, so the
  whole runner is drivable under plain node with a fake — `agent-runner.ts`'s shape.
- **One run at a time per watcher.** A trigger arriving during a run sets a PENDING flag
  and does not queue N runs: the fifth save while the tests are running means "run again
  when you can", once. A watcher that queued would fall further behind the more the user
  worked, which is the failure mode that makes people turn watchers off.
- **The output is a TAIL, capped** (`WATCH_TAIL_BYTES`, 8 KB), kept in memory only. A
  watcher is not a terminal and its body is the last thing that happened, not a scrollback.
  What is durable is the LEDGER row.
- Every finished run appends a `RunRow` through M52's existing run ledger, so the Runs list,
  the context pane's Run section and `tc status` show a watcher's runs with no code of their
  own.
- `run(id)` runs now (the manual verb), `stop(id)` kills the process in flight (`SIGTERM`,
  then `SIGKILL` after `WATCH_KILL_GRACE_MS`), `dispose(id)` stops and forgets.
- **The arming is main's**, except the `panel` arm, which is the RENDERER's (amended while
  building): it is the side that already learns every exit and every turn's end, and it asks
  the same `handoffFires` table the edges ask. Arming it in main would mean main learning a
  panel's ending a second way.
- **The arming is main's**: a `path` trigger arms `FileWatchers` (M22's directory watcher,
  which already survives an atomic rename), a `git-ref` trigger arms it on `<root>/.git`, a
  `timer` trigger arms an interval, and a `panel` trigger is fed by the same exit and idle
  events the handoff machinery already emits. Four arms, one `fire(id)`.

### The state (`panel-state.ts`)

A watcher speaks the process words, from its own status:

| Watcher | Word | Tone |
|---|---|---|
| never run | `not started` | `none` |
| running | `working` | `working` |
| last run exited 0 | `idle` | `idle` |
| last run exited N, or a signal | `exited N` | `exited` |
| armed but its trigger cannot be armed | `exited` + the reason in the body | `exited` |

That is the vocabulary as it stands, reached by an eighth kind — no new word, and the pass/
fail of a watcher is therefore legible in the rail, the state edge, the minimap, the far
tiers and the attention surfaces with nothing added to any of them.

### The wire

- `watcher:create`, `watcher:run`, `watcher:stop`, `watcher:dispose`, `watcher:list` as
  invokes; `watcher:state` as a batched send, the shape `agent:event` already uses.
- A renderer mirror, `renderer/watcher/watcher-store.ts`, subscribed per panel id and
  cleared at every panel-removing call site — `chat-store.ts`'s rule, not `registry.version()`.

### The surface

- `WatcherNode.tsx` through `PanelFrame`: the trigger phrase and the command in the chrome
  row, the state on the frame, the body the last run's tail with its exit line, and three
  named controls — `Run now`, `Stop` (disabled with its reason when nothing is running) and
  the refresh-free `Arm`/`Disarm` toggle, which says which it will do.
- A `Watch…` row in the palette and a `watcher` option in the spawn sheet, each disabled by
  name where it cannot run (no directory selected; a `panel` trigger with no source).
- Its far tiers are `PanelFrame`'s: `watcher` as the summary word, its state under it.

## What it must not break

- No PTY: a watcher must never reach `assignTiers`, `registry.ensure` or `LIVE_BUDGET`, and
  closing one must send no `pty.kill` (`verify:panels 94`'s dispose-site count unchanged).
- The one state vocabulary: no new word, no new tone (`verify:rail state.2`).
- The run ledger's rows stay metadata — no output bytes, ever.
- `handoffFires` stays the only table deciding whether an ending fires something.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A trigger during a run queueing N runs instead of one | `verify:file watch.1` |
| A watcher's exit reported as `working` forever, or a signal read as a pass | `verify:file watch.1` |
| The tail growing without bound; output bytes reaching the ledger | `verify:file watch.1` |
| A malformed or absent persisted trigger dropping the whole layout | `verify:layout watch.1` |
| A real file write not triggering a real run; the state not flipping | `verify:panels watch.1` |
| A watcher reaching tiering, or its close sending a kill | `verify:panels watch.1` |
| A watcher's pass not firing a handoff edge | `verify:panels watch.2` |

## Amended after the verifier

- **The spawn sheet gains no `watcher` option.** The sheet spawns a preset into a directory;
  a watcher needs a command AND a trigger, which the palette's two lines already ask for, and
  a second door asking two more questions inside the sheet would be a second vocabulary for
  the same act. The palette's `Watch…` row is the door.
- **The last run is NOT persisted.** A restored watcher reads `not started` until it runs.
  A stored `passed` would be a claim about a run whose files may have changed since the app
  was last open — the confident wrong answer this repo refuses everywhere else. What IS
  durable is the ledger, which the context pane shows.
- **`armed` is persisted, and its ABSENCE means armed** — every watcher written before the
  toggle existed, and the ordinary case.
- **A `panel` trigger is typed as `after this passes`** (and `when this fails`, `after this
  finishes`) with a panel selected — without this the milestone's headline sentence was
  reachable only by hand-editing `layout.json`.
- **`git-ref` watches `.git/HEAD` only.** A ref moved by `git update-ref` or a fetch that
  does not touch HEAD is not seen; the spec's "a ref under root moved" is narrower than it
  read, and this is the narrowing.

## Manual-only, added

- A real long-running test command on a real repository, watched by eye.
- The timer trigger over a real hour.
