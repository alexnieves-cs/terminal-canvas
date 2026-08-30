# M13: Subagent nodes on the canvas — Design

**Status:** designed, not yet implemented.
**Predecessor:** `2026-08-29-m12-live-cwd-design.md`, and by DEPENDENCY as well
as by number — M13 attributes a session by a panel's **live** cwd, which is the
fact M12 made true. A panel that `cd`s into another repository is an ordinary
case, and a spawn-time cwd would attribute its subagents to the wrong project
silently. M13 also touches `pty-manager.ts` (one new call on the existing live
tick), the IPC contract (one event), a new renderer store and a new layer
inside `.world`. It shares no file with M10 (the visual system, `styles.css`
only) or M11 (themes), both claimed by a concurrent track.
**Backlog entries:** #7 (the whole of this spec). It is cited by #9 (the
agentic super app — a canvas whose unit is "a thing an agent can work in") and
touches the same side channel #19 (token and dollar accounting) names as its
own likely source.

## Goal

Show an agent's subagents on the canvas as they run.

This is the thing an infinite canvas can do that a tabbed terminal
fundamentally cannot, and #7 calls it "arguably the most *differentiating*
idea" on the list. Today a `claude` panel that fans out to six subagents shows
one scrolling column of text; the structure — six of them, this one is a code
reviewer, that one has been going for four minutes — exists and is invisible.

## What changed since #7 was captured, and why it re-scopes the milestone

#7 says detection "is the same unsolved problem as #5, harder", and proposes
either parsing the CLI's rendered output or hoping for a machine-readable side
channel. **The side channel exists, and it is better than the entry hoped for.**
Claude Code writes, per session:

```
~/.claude/projects/<cwd-slug>/<sessionId>/subagents/
    agent-a39674afc5b8a0f44.jsonl        the subagent's own transcript
    agent-a39674afc5b8a0f44.meta.json    155 bytes, written at spawn
```

and the sidecar is very nearly the node's data model already:

```json
{"agentType":"general-purpose","description":"Re-review final fix wave",
 "toolUseId":"toolu_01CuMouzeVCS7hKZJ7umDCEu","spawnDepth":1,"model":"sonnet"}
```

Four consequences, each removing work the entry assumed:

- **A file appearing in `subagents/` IS the spawn event.** No output parsing at
  all — the half of #7 that made it "harder than #5" is gone.
- **`description` is a label the MODEL wrote** about what the subagent is for,
  not a string scraped out of a repaint. It is the single most useful thing a
  node can show and it costs nothing.
- **`spawnDepth` gives tree depth**, so nesting is free rather than inferred.
- **Completion is exact.** `toolUseId` appears twice in the PARENT transcript —
  once as the `tool_use` that spawned the subagent, once as the `tool_result`
  that ended it. Verified against a real 1.4MB transcript: two occurrences, and
  no others.

What is left expensive is a question #7 never reaches, because it assumed
detection would dominate: **which panel does a session belong to?** Nothing in
a transcript names a PTY. That is where this milestone's one judgement call is,
and it is answered under "Attribution" below.

## Scope

In:

- A main-side watcher that turns `subagents/` directories into records, polled
  on the existing live tick.
- One IPC event carrying those records to the renderer.
- A renderer store, per parent panel id.
- A layer inside `.world` rendering a small node per subagent, with an edge to
  its parent, that follows the parent's rect.
- A node that dims when its subagent finishes, and goes when its parent goes.
- An explicit, visible refusal when a panel's session cannot be attributed.

Out, deliberately, each with its reason:

- **Openable nodes.** A node that expands to show its subagent's own messages
  is the genuinely differentiating version and roughly doubles this milestone:
  it is a second scrollable surface with its own wheel ownership
  (`[data-scroll-host]`), its own selection, and its own memo story. Deferred
  as its own milestone, not forgotten.
- **Persistence.** Nodes are derived and rebuilt from the watcher; nothing is
  written to `layout.json`. See "Why not a third panel kind".
- **Non-Claude CLIs.** `codex` and every other agent CLI write no such
  directory. The feature is simply ABSENT there — no node, no error, no empty
  section. This spec does not pretend to generality it does not have, and the
  README must say so rather than describing the feature as "your agent's
  subagents".
- **Individual node drag, close, or selection**, and rail rows for nodes. See
  the cost stated under "Why not a third panel kind".

## Why not a third panel kind — the load-bearing decision

The obvious shape is `kind: 'subagent'` beside `terminal` and `review`, since
M9b already built the union and the partition. It is the wrong shape, and the
reason is what `Panel` MEANS in this codebase.

`Panel` is the **persisted** type. Being in the `panels` array is not a
rendering fact, it is a contract: `parseLayout` validates you and needs an arm
for you, `layout.save` writes you, `nextIdRef` must mint you without collision,
and each of `Canvas.tsx`'s four panel-removing surfaces must learn to skip you —
`onClosePanel`, `applyHistory`, `resetCanvas` and `deleteWorkspace`, which M9b
already taught to skip one kind and which would each need a second clause. A
panel that must be filtered out of every save is a type fighting its own
contract.

Note what that is NOT: it does not move `verify:panels` 94's two source-text
counts. Those stay put precisely because M9b wrote its guards on the loop's
ITERATION rather than on the call — a discipline a fourth kind would inherit
along with the obligation to remember it at four sites. The cost of a third
kind is the four guards, not the counts.

Subagent nodes are instead a **derived sibling layer inside `.world`**:

```
.canvas
  .world   translate(...) scale(...)
      {panels.map(...)}       TerminalPanel | ReviewNode      persisted
      <SubagentLayer />       derived from the watcher        not persisted
  <EdgeIndicators/>  <CanvasHud/>                             chrome, outside .world
```

`SubagentLayer` is **inside** `.world`, unlike `EdgeIndicators` — and the
contrast is the point. A pip's whole job is to stay pinned to the viewport's
physical edge regardless of pan or zoom, which is why it is chrome. A subagent
node belongs to a PLACE on the canvas, beside its parent, so it must pan and
zoom with it. Mounting it as chrome would be the same mistake as mounting the
pips in `.world`, in the other direction.

**This makes #7's stated constraint unreachable rather than enforced.** The
entry asks that subagent nodes "must not consume `LIVE_BUDGET` or a WebGL
context", and proposes teaching `lod.ts` that some nodes are never live. M9b
already found the better answer for review nodes and this inherits it: nodes
are not in `panels`, so they never reach the partition, let alone `assignTiers`
or `registry.ensure`. There is no guard to forget, because there is no code
path. A guard is a convention; this is an invariant.

It also avoids three specific landmines for free. No `layout-schema` arm, so no
repeat of M9b's absent-versus-unknown `kind` problem. No id prefix, so M9b's
`^[nr](\d+)$` reseed hazard does not get a third letter to forget. And the two
hard-coded counts in `verify:panels` 94 do not move.

**The cost, stated rather than buried:** a node cannot be dragged, closed or
selected on its own, and does not appear in the rail. It follows its parent and
goes with it. Given that nodes are cleared with the parent anyway, that is
judged correct rather than a compromise — but it is the decision to revisit
first if nodes later need to be openable, because an openable node probably
does want selection.

## Components

### `main/subagent-scan.ts` — pure

No `fs`, no `electron`, no `node-pty`; the plain-node tier, on the terms
`git-args.ts` and `tmux-args.ts` already meet.

- `slugFor(cwd)` — the project directory name Claude Code derives from a cwd.
  Observed rule: every character outside `[A-Za-z0-9]` becomes `-`, so `/repo`
  is `-repo` and `/repo/.claude/x` is `-repo--claude-x`. **It is a HINT, never
  an oracle.** The mapping is undocumented and was derived from 31 real
  directory names, none of which contains an underscore or a space, so those
  two cases are genuinely unknown. That is why attribution confirms rather than
  trusts — see below.
- `cwdOf(firstLine)` — the `cwd` field carried on every transcript line. A
  claimed session is **confirmed** by reading its own first line and checking
  that cwd against the panel's, so a wrong slug degrades to NO nodes rather
  than to somebody else's nodes. Guessing the slug is cheap and being wrong
  about it must stay harmless; this is what makes that true, and it is the one
  guard that turns an undocumented format from a correctness risk into an
  availability one.
- `parseMeta(text)` — a `.meta.json` into a record, or `null`. It must tolerate
  an unknown extra field and a MISSING field individually rather than throwing:
  this is a format this repo does not own and cannot version, so the rule
  `parseLayout` already obeys applies with more force, not less.
- `chooseSession(dirs, spawnedAt)` — which session directory a panel claims,
  given the directories under one slug: the most recently created one that
  post-dates the spawn, or none.
- `attributable(panelSlugs)` — takes every panel's slug at once and answers
  which panels may be attributed, refusing every panel in a slug more than one
  panel maps to. It is a SEPARATE function from `chooseSession` because it is a
  fact about the canvas rather than about the filesystem, and a per-panel
  signature could not express it — the shape that makes the refusal testable
  without a filesystem at all.
- `scanForResults(chunk, ids)` — which of the given `toolUseId`s appear as a
  `tool_result` in a chunk of parent-transcript text.

### `main/subagent-watch.ts` — state, with injected reads

Takes its filesystem reads as injected dependencies, exactly as
`review-engine.ts` takes its `GitRunner`, so the whole watcher can be driven
against fakes with no real `~/.claude` anywhere in earshot. Holds, per panel:
the claimed session directory, the known subagent records, and a **byte offset**
into the parent transcript.

### `main/pty-manager.ts` — one call on an existing tick

**Cadence: the existing `LIVE_TICK_MS` (2s) tick, not a third timer.**
`CLAUDE.md`'s rule that the idle tick and the live tick stay separate is about
the 500ms idle tick's RESOLUTION — merging it would coarsen `agent.idleAfterMs`
by four times, silently. Nothing like that is at stake here: this is the same
cadence class as the live poll, and its cost per tick is a `readdir` of a
directory that is usually empty, beside the `execFileSync` already on that tick.

**Not a file watcher**, and for a narrower reason than #19's. #19 declines a
watcher over a repository this app does not own, because it would fire on every
build artifact. That argument does not apply to a purpose-built directory that
changes only when a subagent spawns. What does apply: the directory **does not
exist until the first subagent spawns**, so `fs.watch` means watching the parent
and re-arming — machinery for a signal a 2s poll already delivers on the scale a
human reads.

**Completion, and the offset.** The parent transcript reaches megabytes and
re-reading it every 2s is not acceptable — the failure would be invisible,
showing up as heat rather than as a wrong pixel, which is the shape M12's own
dedupe check exists for. So the watcher reads only bytes appended since its last
offset and scans them for a `tool_result`. On FIRST attach it seeks to EOF and
back-scans a bounded tail (256KB) to settle any subagent already sitting in
`subagents/`.

```
tick, per attributed panel:
  readdir(subagents/)         new *.meta.json     => record, state = running
  read parent [offset .. EOF] tool_result for id  => state = done
  offset = EOF
  dedupe, then send only on a change
```

The dedupe is inherited from `session:live` and is **the design, not an
optimisation**: without it this sends a message every 2s per panel describing a
fact that changes when a model decides to fan out.

### IPC — one event, and the count does not move

```
main --send--> subagent:state    -> renderer
```

An `IPC_EVENTS` member, handled by nobody. **`verify:ipc` stays at 31.** That
suite asserts over the INVOKE channels, each of which must have an
`ipcMain.handle`; a send is counted by nothing. This exact wrong number has
already been reachable twice — M6d hit it and correctly added no channel, and a
draft of M12's own spec said "31 to 32", which would have made a task fail the
suite by fixing a correct count. Recording it a third time.

### `renderer/session/subagent-store.ts`

A fourth module-level store beside `agent-state-store.ts` and
`live-session-store.ts`, cloned from the latter: subscribed **per parent panel
id**, over a **cached snapshot** (a fresh array per read makes
`useSyncExternalStore` believe the store changes every render, and it loops),
and it **must never bump `registry.version()`**. That counter deliberately moves
only on tier/status/focus/exit; a fact that changes on a 2s tick riding it would
re-render every panel on every OTHER panel's fan-out. This is the fifth entry to
record that rule. It is a CACHE of main's answer and never a second author of
it — nothing here decides that a subagent exists.

It also needs the clear that `clearLiveSession` needs, for the same reason:
without it the map grows for the life of the renderer and a **recycled panel id
inherits a dead panel's subagents**.

### `renderer/canvas/SubagentLayer.tsx`

Reads `terminalPanels` for parent rects and the store for records. Per parent,
places nodes in a small fan beside the panel and draws an edge to it. The rect
it places against is the parent's LIVE rect, so nodes move with a drag.

Nodes are memoised on a signature over what a node RENDERS, the shape
`railSignature` established and for the same reason: a drag rebuilds the parent
array every frame, and the signature is what keeps that off this layer. It is
`JSON.stringify` over the records rather than a concatenation, because
`description` is model-authored text that may contain any separator a
concatenation would pick — the collision `verify:rail` 14 pins for user titles,
reached through a different author.

## Attribution, and the refusal

A panel's live cwd gives the slug. A slug can hold many sessions, and **two
panels in one repository is the ordinary case in this app** — it is precisely
the situation the review layer answers with its `shared` arm rather than
guessing.

The rule:

1. Slug from the panel's **live** cwd (M12's store), falling back to the
   resolved spawn cwd — a consumer needing a directory rather than making a
   claim, which is the fallback rule M12 already draws.
2. Among session directories under that slug, consider only those created after
   the panel spawned. Claim the **most recently created** one, so a panel whose
   agent is restarted follows the new session rather than the dead one.
3. **If two or more panels on the canvas resolve to the same slug, attribute to
   NONE of them** — regardless of how many session directories there are. The
   test is on the PANELS, not on the sessions, and that is the strict direction
   on purpose: two panels in one repository where only one is running `claude`
   is indistinguishable, from the filesystem, from two panels where both are,
   because a panel running a plain shell leaves no trace to rule it out.

The refusal is **visible, not silent**: the affected panels render one line
saying two panels share this repository and subagents cannot be attributed. An
absent feature is indistinguishable from a broken one — the rule
`verify:palette` 31 states for a disabled row and M9c's `shared` commit arm
states for a blocked verb. A confident wrong parentage is worse than no
feature, because a canvas that draws an edge is making a claim.

## Honest degradation

Each of these is an ordinary state, not an error, and none of them may throw or
log repeatedly:

- **No `~/.claude/projects` at all** (the user runs no Claude Code): no nodes,
  ever, and the watcher does no work per tick beyond one failed `stat`.
- **No session directory yet** (a panel running a shell): no nodes.
- **A `subagents/` directory that never appears**: the common case for a
  session with no fan-out, and it must cost a `readdir` of a missing directory
  rather than an exception per panel per tick.
- **A malformed `.meta.json`**: that record dropped, its neighbours kept, one
  warning. The individual-drop rule, applied to a format this repo does not own.
- **The parent transcript unreadable**: nodes stay in `running` rather than
  disappearing. A node that vanishes says the subagent ended; a node stuck
  running says we stopped hearing, which is the true statement.

## What fails silently if undone

The section `CLAUDE.md` is built around. Every row is a change that leaves every
check green and the screen plausible.

| If undone | The silent failure |
|---|---|
| Node placed against the parent's live rect | Nodes detach from a dragged panel and float on the canvas |
| Store does not bump `registry.version()` | Every panel re-renders on every other panel's fan-out — the 60Hz cascade three stores already exist to prevent |
| Offset-based tail read | A megabyte re-read every 2s; no wrong pixel, only heat |
| Dedupe before send | ~30 messages a minute per panel describing an unchanged fact |
| Cleared on panel close, kill and reset | A recycled panel id inherits a dead panel's subagents |
| Attribution declines when ambiguous | An edge drawn to the wrong panel — a confident claim, which is worse than nothing |
| Cached snapshot in the store | `useSyncExternalStore` sees a new array every read and loops |

## Verification

- **`verify:subagent`** (new, plain node) — `subagent-scan.ts` whole:
  slug derivation, `parseMeta` on a good file and on each malformed shape, the
  ambiguous-slug refusal AND its over-correction guard (a single panel in a
  repository must still attribute — a refusal that refuses everything satisfies
  the ambiguity check perfectly and ships a feature that never works), the
  offset arithmetic, and `scanForResults` matching a `tool_result` while NOT
  matching the `tool_use` that carries the same id. Fixtures in a **spaced**
  temp directory, the standing rule since the `pane-died` bug.
- **`verify:pty-manager`** — one check that a settled session produces exactly
  ONE `subagent:state` message, with a window spanning **several ticks**. Check
  23's trap in the same shape: an implementation with no dedupe emits once per
  tick, so a window shorter than a tick sees one message either way and stays
  green against the defect.
- **`verify:panels`** — a real renderer against a seeded fixture `subagents/`
  directory: a node appears; the node's id is **not** in `__m4aSessions`; the
  `.xterm` count is unchanged from BEFORE the node existed (check 103's shape —
  "no terminal" is satisfied by an implementation that quietly demoted some
  other panel to pay for it); and the node moves when its parent is dragged.
  The fixture must be **fenced** to its own temp `~/.claude` root, the rule
  M9a's git fence learned the expensive way: an unfenced harness would read the
  running developer's real transcripts.

## Success criteria

1. A `claude` panel that fans out shows one node per subagent, within one live
   tick, labelled with the model's own description.
2. A node dims when its subagent finishes, and is gone when its parent is.
3. No node holds a `PanelSession`, a WebGL context or a `LIVE_BUDGET` slot, and
   the live `.xterm` count is unchanged by a fan-out.
4. Nodes follow a dragged parent, at 60Hz, without re-rendering any panel.
5. Two panels sharing one repository produce a visible refusal, never an edge.
6. A canvas with no Claude Code session anywhere costs one failed `stat` per
   panel per tick and nothing else.

## Risks

- **The side channel is undocumented and can change.** It is a private
  format this repo does not own, observed on version 2.1.241. The mitigation is
  the honest-degradation section: every parse failure is an absent node, never
  an error. The feature can go quiet after a Claude Code update and the app must
  not.
- **The slug mapping is inferred from 31 samples**, none containing an
  underscore or a space, so those two characters are a genuine unknown. The
  confirm-by-cwd step is what converts that from a correctness risk (somebody
  else's nodes) into an availability one (no nodes), which is the trade this
  whole milestone makes wherever it can.
- **Attribution across a tmux reattach.** A panel whose session survived a
  reload has a spawn time from a previous run, so "created after the panel
  spawned" is weaker there. The fallback is the ambiguity refusal, which is the
  safe direction.
- **First-attach back-scan is bounded.** A subagent that finished well before
  the app attached gets no node. Judged correct — nodes are cleared with the
  parent anyway, so they describe the current run.
- **`spawnDepth` beyond 1 is unexercised.** Nested subagents are believed to
  work by construction, and the spec claims nothing further than that the field
  is read.
