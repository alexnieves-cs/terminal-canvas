# M7: Workspaces — Design

**Status:** approved, not yet implemented
**Predecessor:** `2026-08-26-m6-panel-legibility-design.md`
**Backlog entry:** #2, *Named, saved canvases (workspaces)*

## Goal

Give the canvas a second dimension: **named canvases you switch between**,
each with its own panels, its own camera, and its own selection — while the
agents in the one you are not looking at keep running.

Through M6d the app has exactly one canvas. That is fine while the canvas holds
one project. It stops being fine the moment it holds two, because the two share
a coordinate space and nothing separates them but distance: "startup" and
"school" are the same infinite plane with a gap in the middle, and the only
tools for telling them apart are panning far enough and remembering which
direction you went. `Cmd+1` fits *everything*, the palette's panel switcher
lists *everything*, and M6d's edge pips point at *everything*. Every navigation
affordance this app has built gets less useful as the canvas accumulates
unrelated work.

M7 makes the separation real and cheap to cross.

## Scope

In:

- **Create, rename, delete and switch** named workspaces, driven from the
  `Cmd+K` palette as its own section and its own drill-in scope.
- **Switching demotes, never disposes.** A hidden workspace's PTYs — and its
  tmux sessions — keep running.
- **Waiting counts on the workspace rows.** A workspace with panels in
  `wants-you` says so in the palette, so M6d's premise survives a workspace it
  cannot see into.
- **Delete stops what it kills**, behind the palette's existing destructive
  confirm, with the agent count named in the question.

Out, and deliberately so:

- **The merged all-in-one view.** The backlog names it, and it is the one part
  of #2 that fights an invariant head-on: `LIVE_BUDGET` (8) is a global cap on
  live WebGL contexts, not a per-workspace one, so a view that renders every
  workspace at once is precisely the case that tries to exceed it. Tiering must
  stay the thing that decides, and a merged view is a question about tiering,
  not about workspaces. It can be built later without moving any state this
  milestone lays down.
- **Moving panels between workspaces.** The backlog frames it as *rubber-band
  select → move to new workspace*, and rubber-band selection is backlog #52,
  which does not exist. A single-panel "Move to workspace…" is buildable today
  and is still deferred: it adds a fourth hazard (a panel changing workspace
  while its session stays in the registry, and what its `z` and its undo entry
  mean on arrival) to a milestone that already has three.
- **A workspace-switching keyboard shortcut.** `Cmd+0` is reset and `Cmd+1` is
  fit-everything, so the obvious `Cmd+1..9` is taken. Spending a new chord
  before we know the real switching frequency is a guess; the palette is the
  surface, and a chord can be added later without changing anything here.
- **A migration.** There is none to write. See below.

## The part that is already done

**M4b took this entry's advice literally, and the on-disk half of M7 shipped
two milestones ago.** `shared/layout-schema.ts` already defines:

```ts
export interface Workspace extends CanvasState { id: string; name: string }
export interface LayoutSnapshot {
  activeWorkspaceId: string
  workspaces: Workspace[]
  /* ... */
}
```

with a comment saying why: *"M4b always has exactly one and never surfaces the
concept to the renderer. The dimension exists in the FORMAT only, per
ideas-backlog item 2: a file written as one flat record of panels makes named
workspaces a migration, and one written as a keyed collection makes them nearly
free."* `parseWorkspace` validates the collection, `activeWorkspaceId` falls
back to `workspaces[0].id` when it names nothing, and `parseLayout` guarantees
at least one workspace survives any file.

So **`LAYOUT_VERSION` does not change and no file is rewritten.** Every
`layout.json` on disk today already holds exactly one workspace named `Canvas`
with id `w1`, and it opens under M7 as a canvas with one workspace in it.

**The demote-not-dispose half is also mostly free**, and for a reason that is a
direct payoff of M3's architecture rather than luck. Swapping the `panels`
array unmounts `TerminalPanel`, whose unmount calls `registry.detachSlot(id)`
— which disposes the WebGL addon and removes the host from the document while
the `PanelSession`, its PTY, and its tmux session stay in the module-level
registry untouched. "Two lifetimes, not one" means *this component is
unmounting* and *this panel is going away* are already different statements,
and a workspace switch is the first feature to make that distinction pay at
the scale of a whole canvas rather than one culled panel.

That is the good news, and it is worth stating plainly so nobody budgets for
work that does not exist. What follows is the work that does.

## The central insight

**A workspace switch is a second boot.**

`renderer/main.tsx`'s `boot()` already does the whole operation: it awaits a
`CanvasState` from main, awaits the set of live session ids, and renders a
`Canvas` that *receives* its starting state as a prop rather than inventing
one. The comment there records the side benefit as outliving the reason — *"a
Canvas that RECEIVES its starting state can be mounted by verify:panels against
a known layout"* — and M7 is the second customer for exactly that property.

Every design decision below follows from taking that seriously. Switching is
not a mutation applied to a running canvas; it is a replacement of the canvas's
starting state, and everything derived from that state (the id counter, the
undo stack, the camera, the selection) is re-derived rather than carried.

## Architecture

### Five invokes, no new event channel

All renderer→main, matching the direction rule M5b established: main owns the
file, so palette-driven mutations are invokes.

```
workspace:list      → WorkspaceRow[] { id, name, panelIds, active }
workspace:activate  (id, outgoing: CanvasState)
                    → { state: CanvasState, allPanelIds: string[] }
workspace:create    (name) → id
workspace:rename    (id, name) → boolean
workspace:delete    (id) → boolean
```

`verify:ipc` goes from 20 channels to 25.

**There is no `workspace:attention` channel, and there must not be.** M6d's own
note records the reasoning and it applies again here verbatim: the renderer
already receives every `agent:state` transition for every panel main knows
about, so the attention set is derived renderer-side. `workspace:list` returns
each workspace's `panelIds` — a fact main holds anyway — and the renderer
intersects that with `attentionIds()` it is already maintaining. Asking main to
recompute a set the renderer can fold from messages already in hand would make
main a second author of a derived fact, the same shape of drift "One map, and a
typed view over it" removed for settings.

`panelIds` rather than a `waitingCount`: main does not know which panels are in
`wants-you` in a form the renderer should trust it for, and shipping a count
would put the derivation in the wrong process to no benefit.

### Store accessors

`main/layout-store.ts` grows five members beside the preset and prompt ones,
following the same rules those obey — copied out on read, `scheduleWrite()` on
mutation, `false` for an id that names nothing:

```ts
workspaces(): WorkspaceRow[]
createWorkspace(name: string): string          // mints and returns the id
renameWorkspace(id: string, name: string): boolean
deleteWorkspace(id: string): boolean
activateWorkspace(id: string, outgoing: CanvasState): CanvasState | null
```

**One invariant is new and belongs to the store, not to the parser: there is
never zero workspaces.** `parseLayout` already guarantees at least one *on
load* — `if (workspaces.length === 0) workspaces.push(defaultWorkspace())` —
but that is a read-path guarantee, and `deleteWorkspace` is a write path that
did not exist when it was written. Deleting the last workspace installs a fresh
`defaultWorkspace()` and activates it. Without that, `activeWorkspace()`'s
repair branch — written for a snapshot built in code and documented as
unreachable from a parsed file — becomes reachable at runtime, and it repairs
by silently discarding whatever the caller thought it was working with.

`deleteWorkspace` of the **active** workspace activates a neighbour rather than
leaving `activeWorkspaceId` naming a record that is gone.

### Ids

Workspace ids are minted by the store, must satisfy `ID_PATTERN`, and follow
the existing `w<n>` shape that `parseWorkspace`'s own fallback already assumes
(`w${index + 1}`). They are not tmux session names and carry no constraint
beyond the pattern.

## The three hazards

None of these is the hazard the backlog entry named. The entry warned about
`LIVE_BUDGET` and about the format being flat; the first is out of scope with
the merged view and the second was solved in M4b. These are what is actually
left, and all three are silent.

### 1. The save race — activate is a flush, not a swap

`LayoutStore.save()` merges an incoming `CanvasState` into **whatever workspace
is active at the moment it runs**, and writes are coalesced on a 500ms
debounce. So a switch that merely flips `activeWorkspaceId` and lets the
renderer carry on has a window in which workspace A's panels are written into
workspace B's record — a well-formed file that is simply wrong, discovered by
the user as "my school canvas has my startup's panels in it" some launches
later, with nothing in any log.

`activateWorkspace(id, outgoing)` therefore takes the outgoing state as an
argument and does both halves in one synchronous call: write `outgoing` into
the **old** record, then flip the id, then return the new record's state. The
renderer stops sending `layout:save` for the old canvas before it asks — the
`activate` call *is* that canvas's last save.

This is the one hazard with no visible symptom at all, and it is the reason
`activate` takes a parameter it looks like it should not need.

### 2. Id uniqueness — seed from every workspace, not the active one

`Canvas.tsx`'s `nextIdRef` seeds from the restored ids so that five `Cmd+N`
presses do not collide with a restored `n5`. With N workspaces, the active
workspace's ids are a **partial view** of the ids in play — and `PanelId`
doubles as the tmux session name (which is why `ID_PATTERN` exists at all). Two
panels in two workspaces sharing an id do not merely confuse the layout: they
name one tmux session, so the second one to go live **attaches to the first
one's process.**

This is the id-collision defect M4a fixed by removing length-derived ids,
resurrected through a door M4a could not see.

`workspace:activate` returns `allPanelIds` — every panel id across every
workspace — and the renderer seeds `nextIdRef` above the global maximum.
`boot()` gets the same treatment from `layout:load`.

**Main minting ids was the other candidate and is rejected.** `Cmd+N` mints
inside the `setPanels` updater, on `current`, and that is load-bearing: React
applies queued updaters sequentially, so two spawns batched into one tick each
see the previous one's array. `cascadeCentre`'s note records what happens when
that becomes a ref read — both presses pick the same slot, and the stacking bug
returns under batching. An async id from main would force exactly that
restructuring, to solve a problem a synchronous seed already solves.

### 3. Undo resets on switch

`history` is one stack over one `Panel[]`, and `applyHistory` calls
`registry.dispose` for a panel an undone state no longer contains — which
reaches `pty.kill`. So `Cmd+Z` immediately after a switch would apply workspace
A's panel array to workspace B, and **kill workspace B's agents** to restore
panels that are not on screen.

History is cleared on activate. `Cmd+Z` right after a switch doing *nothing* is
the honest failure; doing *something* is the dangerous one.

Per-workspace history stacks are the tempting alternative and are YAGNI: undo
is scoped to a gesture the user just made, and nobody has asked to undo a
gesture on a canvas they cannot see. It is also not free — the stacks would
have to be disposed alongside the workspace, or a deleted workspace's history
would hold `Panel` records whose sessions are gone.

## Palette surface

`SECTIONS` gains `{ id: 'workspace', label: 'Workspaces' }` and `PaletteScope`
gains a `'workspaces'` member. That is the whole structural change, and it is
two lines because M6p replaced the closed `CommandGroup` union with ordered
data specifically so adding a section would be an append rather than an edit in
three places. M6b's settings section is the worked example to copy.

Rows:

| Row | `hiddenAtRest` | Notes |
|---|---|---|
| Switch to *«name»* | no | One per workspace. Destinations, like panel rows. The active one is disabled with its reason ("already active"), not hidden. |
| New workspace… | yes | `InputMode`, like preset rename. |
| Rename *«name»*… | yes | One per workspace. |
| Delete *«name»*… | yes | One per workspace. `destructive: true`. |
| Manage workspaces… | **no** | `entersScope: 'workspaces'`. The door, for anyone not guessing a query. |

The administration rows are hidden at rest for the reason `hiddenAtRest`
exists: three rows per workspace un-hidden would put the resting list back past
the roughly-eight-row budget M6p sized it to. They stay findable by query —
typing "delete" surfaces them in `Manage` — because *a row that disappears is
indistinguishable from a feature that is missing.*

**Waiting counts.** A switch row for a workspace with panels in `wants-you`
renders as `school · 2 waiting`. The count is **not** in `searchText`: it is
state, not a name, and a row you can find by typing "2" is a row whose match
score changes as agents finish.

## Delete, and the fourth dispose call site

Deleting a workspace disposes every panel in it — `registry.dispose(id)` →
`pty.kill` → `tmux kill-session` — behind the palette's existing destructive
confirm, whose question names the count:

> Delete "school" and stop 3 running agents?

The alternatives were considered and rejected. *Detach and leave the sessions
running* orphans them with no UI able to reach or stop them: backlog #61
(recover an orphan session) does not exist, so today that is agents burning
tokens invisibly until quit `kill-server`s the socket. *Refuse while anything
is live* is safe but makes deleting a busy workspace a chore, and pushes a
decision onto the user every single time that the confirm dialog can present
once.

**`CLAUDE.md` says `registry.dispose` has three call sites in `Canvas.tsx` and
asks the reader to re-derive that count rather than trust it — because it was
stale once already, having stayed at two after the reset handler arrived.** M7
makes it four. That note is updated in the same commit as the code, not after.
The count of `pty.kill` callers inside `session-registry.ts` stays **two**,
because the delete handler routes through `dispose(id)` like the other three
rather than reaching for `pty.kill` itself — which is precisely what has kept
that number true across four milestones.

## Failure modes

| Failure | Symptom | What catches it |
|---|---|---|
| Switch disposes instead of demoting | Every agent in the workspace you left is dead when you come back; the panel restores dormant and looks *plausible* | `verify:panels`: same pid across a round trip |
| Save race writes A into B | A well-formed file with the wrong panels in a workspace, noticed launches later | `verify:layout`: save-then-activate ordering |
| `nextIdRef` seeds from the active workspace only | Two panels attach to one tmux session; the second shows the first's output | `verify:panels`: mint after a switch, assert no collision |
| Undo crosses the switch | `Cmd+Z` kills agents in the workspace you just arrived at | `verify:panels`: `Cmd+Z` after a switch is inert |
| Deleting the last workspace | `activeWorkspace()`'s repair branch fires and discards state | `verify:layout`: never zero workspaces |
| Delete leaves sessions running | Invisible token burn, unreachable until quit | `verify:panels`: session count after delete |
| Waiting count in `searchText` | Row ranking changes as agents finish; a query stops matching mid-type | `verify:palette` |

## Verification

New checks, in the cheapest tier each can live in — the rule this repo already
follows, and the reason `layout-store.ts` takes its path as a parameter.

**`verify:layout`** (plain node, ~12 checks): the five accessors; `activate`
writing the outgoing state into the **old** record before flipping (the
ordering check, which is the save race); never zero workspaces; deleting the
active workspace activating a neighbour; deleting the last one installing a
fresh default; a rename surviving a write and a reopen; `createWorkspace`
minting an `ID_PATTERN`-valid id; `activate` on an unknown id returning null
and changing nothing.

**`verify:palette`** (plain node, ~6 checks): the section's position in
`SECTIONS`; the drill-in scope and what it shows; delete marked `destructive`;
the administration rows hidden at rest and findable by query; the active
workspace's switch row disabled-with-a-reason rather than absent; the waiting
count rendering in the title and **not** in `searchText`.

**`verify:panels`** (real renderer, ~6 checks): **switch away from a live panel
and back, and assert the same pid** — the load-bearing one; a hidden
workspace's panel absent from the DOM while its session is still in the
registry; id minting after a switch not colliding with the other workspace's
ids; `Cmd+Z` after a switch being inert; delete disposing its panels' sessions;
the waiting count reaching a real rendered row through main's real store.

**`verify:ipc`**: 20 → 25.

**The pid check is the one that matters and it has to be that suite.** Every
other check listed here stays green against an implementation that disposes on
switch instead of demoting — the panels come back, the layout is right, the
file is right, and the agents are dead. It is the same argument
`verify:pty-manager` 12 makes for asserting the *reattached pid* rather than
merely that a session exists.

## Files

| File | Change |
|---|---|
| `src/shared/layout-schema.ts` | **none** — the format already carries workspaces |
| `src/shared/ipc-contract.ts` | five channels, bridge types, and `WorkspaceRow` — which lives here rather than in `layout-schema.ts` because it is an IPC payload shape, not an on-disk one, the same split `PresetListRow` already draws against `Preset` |
| `src/main/layout-store.ts` | five accessors; never-zero-workspaces |
| `src/main/ipc.ts` | five handlers |
| `src/preload/index.ts` | `window.canvas.workspace.*` |
| `src/renderer/canvas/Canvas.tsx` | activate handler: replace state, reseed `nextIdRef`, clear history, dispose on delete (fourth call site) |
| `src/renderer/main.tsx` | seed `nextIdRef` from `allPanelIds`, not the active workspace's |
| `src/renderer/palette/palette-model.ts` | `SECTIONS` entry, `PaletteScope` member, `SCOPE_LABEL` |
| `src/renderer/palette/commands.ts` | workspace rows, disabled reasons, waiting counts |
| `scripts/verify-layout.cjs`, `verify-palette.cjs`, `verify-panels.cjs` | the checks above |
| `CLAUDE.md`, `README.md` | the dispose call-site count (three → four), the milestone table, the new invariants |

## Success criteria

1. Two named workspaces exist, and `Cmd+K` switches between them.
2. An agent left running in workspace A is **still the same process** when you
   come back to it — same pid, not a restored dormant panel that looks like one.
3. Switching does not spawn anything. A workspace whose panels were never live
   arrives dormant, as M4b's rule requires.
4. `Cmd+N` in workspace B never mints an id workspace A is using.
5. `Cmd+Z` immediately after a switch does nothing, and in particular kills
   nothing.
6. A workspace with a panel in `wants-you` says so on its palette row, so M6d's
   claim survives a canvas it cannot see into.
7. Deleting a workspace names how many agents it is about to stop, and stops
   them.
8. `npm run verify` is green.
