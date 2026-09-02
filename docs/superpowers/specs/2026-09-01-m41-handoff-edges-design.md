# M41 — Handoff edges: a link that starts its target with the source's output

**Status:** designed 2026-09-01. Required for 1.0 by the scope amendment
(`2026-09-01-v1-scope-decision.md` §7, feature 3). Depends on M39 (the log
the payload is read from).
**Backlog entry:** #24, the half M25 declined — "piping terminal output".

## What this milestone is for

M13 drew a link, M25 gave it one verb: when the source exits, restart the
target. The verb the canvas is actually for is the other one — one agent
finishes, the next one starts from what it produced — and M25 declined it
for a stated reason: a canvas that writes arbitrary bytes to a PTY needs a
payload and an audit model beyond a relation-owned restart. M39's log is the
payload model (bounded, stripped, main-owned), and the inspector's automation
list is the audit surface. This milestone builds the verb on both.

## Decisions

### 1. A second automation kind on the same link

`PanelLink.automation` becomes a union: the existing
`{ kind: 'restart-on-exit'; enabled }` and
`{ kind: 'handoff'; enabled; trigger: 'exit' | 'idle' }`. One automation per
link, as today: a link is a directed pair and carries one meaning. The
parser accepts either kind, drops a malformed one with a warning naming the
link, and the cycle rule applies to BOTH kinds together: a handoff cycle
A→B→A on `idle` is an infinite ping-pong between two interactive agents, and
it is refused at creation and stripped on load exactly as a restart cycle is.
Both endpoints must be terminal panels.

### 2. "Completes" is two events, chosen per rule

- `exit`: the source's process ended — `registry.onExit`, the event M25
  already listens to. Right for a task-shaped source (`claude -p`, a script).
- `idle`: the source's agent state went busy → idle — the transition main
  already emits, subscribed once at the Canvas through the agent-state store.
  Right for an interactive agent that never exits: one completed turn is one
  handoff, and the source goes busy again only when a human prompts it, so
  this is exactly one delivery per finished turn rather than a stream.

The default is `exit`. The inspector's link row cycles the control through
off → on exit → on idle → off, and the automation list names the trigger.

### 3. The payload is the log's tail, bounded, and pasted

On the trigger, the Canvas asks main for `scrollback:tail(sourceId,
HANDOFF_MAX_LINES)` — the same ANSI-stripped, non-empty-line tail the dormant
card reads — capped at `HANDOFF_MAX_LINES` (200) and `HANDOFF_MAX_CHARS`
(16 KiB), both named in the inspector row's title so the bound is stated
where the rule is made. It is wrapped in one header line naming the source
panel and the trigger, and delivered through `session.handle.paste()` —
bracketed paste, never a raw write, so a multi-line payload cannot submit
line by line into the target (M5b's rule, `verify:panels` 40's distinction).
If persistence is off and the tail is empty, nothing is pasted and the row
says `skipped — no output recorded (scrollback is off)`.

### 4. Delivery waits for a target that can receive, and says so meanwhile

This is where the brief's "starts another" meets fit-before-spawn. A target
can be running, exited, dormant, or never spawned:

- **running**: deliver now.
- **exited**: `restartWithSpec` (the verb restart-on-exit already uses), then
  deliver when running.
- **dormant / never spawned**: `registry.wake(id)` clears dormancy, and the
  panel SPAWNS when tiering next promotes it — a panel with no fitted
  terminal cannot spawn (`spawn()` reads `handle.size()`, and a fabricated
  80×24 is the silent failure that guard exists to prevent), so a
  never-attached target off screen starts the moment it comes on screen.
  The payload is QUEUED in memory for that target and delivered then.

"Delivered when running" means: the target's status is `running` AND its
agent state has left `starting` — the first bytes have arrived, so a TUI
has drawn its prompt — plus one short settle. Pasting into a `claude` that
has not finished starting loses the paste. A queued payload that is not
delivered within `HANDOFF_QUEUE_MS` (5 minutes) is dropped and the row
says so; queues are never persisted, for the reason the broadcast mode is
not.

**This overrules M25's rule for THIS kind, in writing.** M25 refused to
wake a dormant target because a saved restart rule must not launch an agent
merely because another panel exited. A handoff rule is different in what
the user asked for: they linked A to B and chose "when A completes, hand B
its output" — starting B is the rule's whole meaning, and it was configured
by hand on a link the user drew. Restart-on-exit keeps its refusal.

### 5. The audit surface is the inspector's list, and every outcome is a sentence

Each rule's most recent outcome renders beside it, as M25's do:
`handed off 120 lines after exit 0`, `handed off 34 lines after a turn`,
`queued — target starts when it comes on screen`, `skipped — no output
recorded`, `skipped — target did not start within 5 min`, `skipped — target
is not a terminal`. A canvas line is never the only evidence that a PTY was
written to.

## What it must not break

- **`pty.kill` two callers, `dispose` five sites**: waking and restarting go
  through `registry.wake` and `restartWithSpec`, both existing verbs.
- **The link layer's pointer convention and M13's "completing gesture never
  wakes a panel"**: this milestone adds no gesture; the wake happens on a
  process event the user configured, not on a click.
- **`registry.version()` carries nothing new**: queue state is a Canvas
  ref, and delivery watches the agent-state store's own per-panel
  subscription.
- **No agent-reachable path**: a rule exists only through the inspector's
  control on a link the user drew; nothing main does creates one.

## Verification

- `verify:layout` `handoff.1–.3`: the union parses both kinds; a malformed
  `trigger` drops the automation and keeps the link; a handoff cycle is
  stripped on load with a warning, and `setLinkAutomation` refuses to create
  one.
- `verify:viewport` (`panels.ts` is bundled there) `handoff.1`: the mutator
  cycles off → exit → idle → off and refuses a sessionless endpoint.
- `verify:rail` `handoff.1`: the automation list row names the trigger and
  the bound.
- `verify:panels` `handoff.1`: two live panels A→B with a handoff on exit;
  A runs `echo HANDOFF-TOKEN; exit`; B's PTY echoes `HANDOFF-TOKEN` (the
  bracketed paste arriving), the row reads `handed off`. `handoff.2`: the
  same with B carded and dormant — after the exit the row reads `queued`,
  B is woken, and once B is promoted (camera moved onto it) the token arrives.
