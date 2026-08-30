# M16: File panels — a live document beside a live agent

> Written as M13, renumbered to M16 on merge — main had already claimed M13
> (twice over, via M14/M15's own earlier renumbering) while this branch was
> in flight. See the milestone-wide renumbering commit for the full story.

**Status:** designed, not yet implemented.
**Predecessor:** by DEPENDENCY, M9b. That milestone turned `Panel` from a single
shape into a discriminated union on `kind` and made `Canvas.tsx` partition the
panel list once, so that a kind with no `spec` structurally cannot reach
`assignTiers`, `registry.ensure`, or a `LIVE_BUDGET` slot. This milestone is the
second customer of that work, and it is the one that proves the union was worth
building: adding a third kind should cost a parser branch, a component, and a
handful of guards — not an architecture.
**Backlog entries:** #14, tier 1 only ("text-ish local files — a watcher plus a
viewer. **Start here.**"). It also touches #3 (file access is main-side, new IPC
channels, nothing in the renderer touches `fs`) by establishing the read half of
that rule.

## Goal

Put a local file on the canvas, beside the agent that is editing it, and have it
change as the agent changes it.

The backlog states the thesis better than a restatement would: *"The point of
putting the sheet next to the agent is that the agent is working on that sheet,
and you watch it change. Side-by-side is not a layout preference — it is the
feature."* A canvas is the only UI shape where twelve of these at once is
coherent, and this app already has the canvas.

What makes it tractable is the backlog's own observation: most of the value here
is **a file watcher plus a renderer**, which is a far smaller problem than
"embed Excel". No vendor integration, no second renderer process, no transform
collision. A path, a watch, and a `<pre>`.

## Scope

In:

- **A third panel kind, `file`**, persisted in `layout.json`, surviving a reload
  and a relaunch like any other panel.
- **Main-side read**, returning a small union of honest states rather than a
  string.
- **Main-side watch**, pushing a change to the renderer within about a second of
  the file moving.
- **A renderer component**, plain monospace with line numbers, that reuses the
  existing panel chrome so drag, resize, selection, z-order and the pointer
  corrector work with no new code.
- **Two doors**: a command-palette row that opens a native file dialog, and a
  Finder drop onto the canvas.
- **Rail and inspector arms**, so a file panel is a first-class citizen of the
  shell rather than a rectangle the outline cannot name.

Out, deliberately, and each said here so it is not re-litigated later:

- **Writing.** This is a viewer. The backlog's hardest open question — *"when
  the agent and the user edit the same file at the same moment, who wins?"* — is
  not answered here, it is **dissolved**: read-only means there is nothing the
  user can lose. That question comes back the day an editor lands, and it should
  be decided then, with a dirty flag and a real stance, rather than defaulted
  into now.
- **`.xlsx` and any binary format.** Tier 2 in the backlog. A binary file gets a
  named state and a sentence, not a renderer.
- **`<iframe>` / `WebContentsView` web panels.** Tier 3, and the backlog already
  explains why it is the architecturally expensive tier.
- **Native app windows in a panel.** The backlog calls this "a 'no' item"; this
  spec agrees and adds nothing.
- **Syntax highlighting.** A dependency, a language-detection surface, and a
  re-highlight cost on a file an agent may rewrite every second. The plumbing is
  the load-bearing half of this milestone; a highlighter is a later, purely
  additive change that risks nothing if it is deferred and risks the schedule if
  it is not.
- **Rendered markdown.** Same argument, plus a sanitisation surface.
- **A file tree / browser.** That is #3, a separate milestone. This one opens a
  file you name.

## The three decisions that carry the milestone

Everything else follows from these.

### 1. Liveness is a directory watch and a push, not a file watch and not a poll

The backlog asks for "a watch subscription". The repo's most recent word on the
subject argues the other way: `ipc-contract.ts`'s comment above `REVIEW_PANEL`
records a deliberate pull-only stance — *"A push channel would make main a
second author of a timing decision the renderer already makes correctly."* Both
are right about their own subject, and the difference is what the signal means.

For review, the signal worth reacting to is "an agent finished a turn", which
the renderer already observes as an `idle` transition; main has nothing to add.
For a file, the signal is "the bytes on disk changed", which **only main can
see**. There is no renderer-side event that means it. So this is not a
relitigation of the review posture; it is a different question with a different
answer, and the app already has a precedent for that answer in M12's
`session:live`.

A poll was considered and rejected on the brief's own bar. M12's tick is 2000ms
and the backlog says *"the panel reflects it within a second"*. A poll also puts
a synchronous `stat` per open panel on main's event loop, and M12's spec already
accepted one such stall reluctantly rather than enthusiastically.

**The watch is on `dirname(path)`, filtered to the basename — never on the file
path itself.** This is the single most important implementation detail in the
milestone, and it is invisible in every casual test. Agents and editors do not
write files in place; they write a temporary file and `rename()` it over the
target, which replaces the inode. `fs.watch` on a file path stays bound to the
**old** inode, so it fires once for the initial truncate — or not at all — and
then never again. The panel goes permanently stale, showing content from before
the agent's first write, with no error anywhere. It looks exactly like a watcher
that was never wired up, which is why a fix would be aimed at the wrong place.
Watching the directory survives the rename, and it also delivers deletion and
re-creation for free, which the `missing` state needs anyway.

The push is deduped in main against a content hash, for M12's reason stated in
M12's words: undeduped, this is a stream of messages describing a fact that
changed once. Its failure is invisible — no pixel is wrong, it shows up as heat.

`fs.watch` is a Node built-in. `chokidar` would be the **second runtime
dependency in this project's history** (`dependencies` is `{"node-pty":
"1.1.0"}`, one entry), and it would buy nothing this design needs.

### 2. The panel kind must be added to the partition positively, not negatively

`Canvas.tsx` currently spells "is a terminal panel" as `!isReviewPanel(p)`, and
that is correct today for the reason `panels.ts` documents: absent `kind` means
terminal, so a negative test on the only non-terminal kind is also the safe test
for legacy data.

With a **second** sessionless kind that spelling becomes wrong in the dangerous
direction. A file panel would satisfy `!isReviewPanel(p)`, land in
`terminalPanels`, reach `assignTiers` and `registry.ensure` with no `spec`, and
either throw or mint a `PanelSession` for a panel that has no process — burning
a `LIVE_BUDGET` slot and a WebGL context on a `<pre>`.

The fix is one helper, `isTerminalPanel(p) => !isReviewPanel(p) &&
!isFilePanel(p)`, defined once in `panels.ts`. It keeps the property that makes
the current spelling safe — absent and unknown kinds still fall to terminal —
while giving a fourth kind exactly one line to edit instead of a dozen call
sites to audit. Every teardown guard currently written as
`if (isReviewPanel(panel)) continue` becomes `if (!isTerminalPanel(panel))
continue`, and the guards stay on the loop's **iteration** rather than on the
call, so `verify:panels` 94's deliberate five-`registry.dispose`-site count does
not move.

The teardown guards are not cosmetic. `registry.dispose(id)` sends `pty.kill`
even for an id this renderer holds no local session for — by design, for
hidden-workspace panels — so routing a file panel through it sends a
`tmux kill-session` named after a panel that never had one, and calls
`dropBaseline` on that id. Harmless until an id is recycled, and then not.

### 3. Every failure gets its own state with its own sentence

The read returns a union, in the shape `ReviewResult` already established:

| Arm | When | Rendered as |
|---|---|---|
| `text` | the ordinary case | content, with `truncated` reporting any remainder |
| `missing` | the path does not exist | "this file no longer exists" — the panel **stays open** |
| `too-large` | over the byte cap | the size, and the cap |
| `binary` | a NUL byte in the first 8 KB | "this looks like a binary file" |
| `unreadable` | `EACCES`, a directory, anything else | the errno and message, verbatim |

Collapsing any two of these produces a panel that is blank for four different
reasons. A deleted file in particular must **not** close its panel: a panel
silently vanishing from the canvas is the exact "a missing feature is
indistinguishable from a bug" failure this codebase designs against everywhere
else, and re-creating the file must bring the content back — which the directory
watch already delivers.

The caps are security boundaries, not preferences, and `main/prompts.ts` states
the reason: the path is whatever the user pointed a panel at, so both the size
and the content are attacker-shaped inputs. Oversized files are **reported, not
truncated at the read** (`prompts.ts`'s rule); the *render* cap is a separate
number that truncates and reports the remainder, the way `parseDiffLines`
already does.

## Architecture

### Shared

`src/shared/file-panel.ts` — the `FileSource` and `FileResult` types, and the
two caps. New file rather than an addition to `review.ts`, because they share
nothing but a shape.

```ts
export interface FileSource { path: string }        // absolute; main expands ~

export type FileResult =
  | { kind: 'text'; content: string; bytes: number; lines: number
      truncatedLines: number; mtimeMs: number }
  | { kind: 'missing' }
  | { kind: 'too-large'; bytes: number; cap: number }
  | { kind: 'binary'; bytes: number }
  | { kind: 'unreadable'; detail: string }

export const FILE_MAX_BYTES = 2 * 1024 * 1024   // read cap
export const FILE_MAX_LINES = 10_000            // render cap
```

`FILE_MAX_LINES` truncating and reporting `truncatedLines` rather than ending
silently is the `parseDiffLines` rule: a list that just stops is a list that
lies about being complete.

### Disk format

`PersistedFilePanel extends PersistedPanelBase { kind: 'file'; source:
FileSource }`, added to the `PersistedPanel` union. A `parseFileSource(raw, id,
warnings)` sub-parser returning `FileSource | null`, all-or-drop like
`parseReviewSubject` — a panel whose `source` is malformed is dropped
individually with a warning, never defaulted to some path.

The branch goes in `parsePanel` **above** the unrecognised-kind drop. The two
rules that meet there are unchanged and both still required: absent `kind` still
parses as terminal, because that is every file written before M9b; a present
unknown `kind` is still dropped with a warning, because it was written by a
version that knew something this one does not, and guessing "terminal" there
spawns a process for a panel whose author never asked for one.

`layout-adapt.ts` gets matching arms in `toPanels` and `fromPanels`. The
`fromPanels` arm must write **no `cwd` key at all** — not `cwd: undefined` — for
the reason its own comment already records for review nodes: the record then
fails its own parse at the next launch and the canvas silently loses the panel
on every relaunch.

### Renderer model

`panels.ts` gains `FilePanel { kind: 'file'; rect; z; title?; source }`, the
`Panel` union arm, `isFilePanel`, `isTerminalPanel`, and
`makeFilePanel(id, centre, z, source, size?)`.

`makeFilePanel` carries `source` **verbatim**. `makeReviewPanel`'s own comment
warns about the copy-paste that forces the minted id into a payload field naming
a different panel; `source.path` is not an id and the mistake is less reachable
here, but the constructor should still not rewrite what it was handed.

Panel size defaults `FILE_W/H = 640/520`, matching the review node — a document
is a reading surface, taller than wide, not a terminal.

### Ids

`f${nextIdRef.current++}`, off the **same** counter as `n` and `r`. `PanelId`
doubles as a tmux session name and the global-uniqueness rule turns on nothing
else being able to mint a colliding one.

**Both reseed sites — boot and `switchWorkspace` — must move from
`^[nr](\d+)$` to `^[nrf](\d+)$`.** This is the milestone's sharpest trap and it
is a repeat of one the codebase has already documented: a regex blind to the new
prefix recomputes a maximum that a persisted `f7` had no part in, and the next
open mints `f7` a second time. Two panels, one id — React collides on the key
today, and `parseLayout` drops one of them silently at the next load. A
workspace switch is where a reseed is most plausibly forgotten, which is why
there are two sites and not one.

### Main

`src/main/file-read.ts` — pure-ish, plain-node testable (`node:fs` does not move
a module out of that tier; `main/prompts.ts` is the precedent, and what moves a
module out is importing `electron` or `node-pty`). One function,
`readFile(path): FileResult`. `stat` first (size and directory check), then read,
then the NUL scan, then the line split and render cap.

`src/main/file-watch.ts` — a `FileWatchers` manager keyed by `PanelId`:

- `watch(panelId, path, onChange)` — arms `fs.watch(dirname(path))`, filters
  events to `basename(path)`, debounces `WATCH_DEBOUNCE_MS = 100`, re-reads,
  hashes, and calls back only on a changed hash.
- `close(panelId)` / `closeAll()`.

The debounce is not politeness: a single logical save can emit several
`fs.watch` events (`rename` then `change`), and an agent writing a large file in
chunks emits one per chunk. 100 ms is well under the brief's one-second bar and
comfortably above a burst.

**The teardown seams are where a watcher leak lives**, and they are the same two
this app already has for PTYs: renderer navigation (`window-lifecycle.ts`'s
`did-start-navigation`, the seam `detachAll()` uses) and `before-quit`. Without
the first, every `Cmd+R` leaks one `FSWatcher` per open file panel, forever, in a
process that survives every reload — the exact shape of the abandoned-handle bug
`window-lifecycle.ts` was written to fix, in a new resource.

### IPC

Three invokes and one event:

| Channel | Direction | Purpose |
|---|---|---|
| `file:open` | invoke | native open dialog; `{ path } \| null` |
| `file:read` | invoke | read **and arm the watch** for that panel id |
| `file:close` | invoke | disarm the watch |
| `file:changed` | event | `{ panelId, result }`, pushed on a real change |

`file:read` arming the watch is deliberate: it makes "the renderer is showing
this file" and "main is watching this file" one statement rather than two that
can disagree. The component reads on mount and closes on unmount, so a workspace
switch — which unmounts without disposing — correctly stops the watch for a
canvas nobody is looking at, and re-arms on the way back.

**`verify:ipc` goes 31 → 34, not 35.** `file:changed` is an `IPC_EVENTS` member,
handled by nobody and counted by nothing, because that suite asserts over
`Object.values(IPC)` — the invokes. This exact off-by-one has been reachable
twice before in this repo's history and a plan written from a wrong number would
fail the suite while "fixing" a correct count. Saying it here is cheaper than
discovering it there.

The push carries the whole `FileResult` rather than a bare notification. The
alternative — push `{ panelId }` and have the renderer re-invoke `file:read` —
doubles the latency and reintroduces a race between the notification and the
read, for the sole benefit of a smaller message that the byte cap already bounds.

### Renderer store

`src/renderer/session/file-store.ts`, structurally a copy of
`live-session-store.ts`: module-level, one canvas-wide subscription to
`file:changed`, subscribed **per panel id**, over a cached snapshot array so
`useSyncExternalStore` does not see a new identity every render.

**It must never bump `registry.version()`.** Four entries in `CLAUDE.md` already
record this rule for three other stores; this is the fourth and the most acute,
because file content can change several times a second while an agent writes,
and riding that counter would re-render every panel on the canvas on every byte
some other panel's file gained.

### The component

`src/renderer/file/file-node-model.ts` — pure, plain-data, one function
`buildFileNodeModel({ source, title, result })` returning a heading, a subtitle
(the directory), a summary, an optional note, and the lines to render. A second
pure model beside `review-node-model.ts`, tested in the same cheap tier.

`src/renderer/file/FileNode.tsx` — modelled directly on `ReviewNode.tsx`:

- Reuses the `.panel` class and `data-panel-id`, so drag, resize, selection, the
  pointer corrector and `shouldYieldWheel`'s `closest('.panel')` all work with
  no new code. This is a deliberate reuse, not a coincidence.
- `data-scroll-host` on the scrolling body. `shouldYieldWheel` rule 3 is
  attribute-driven precisely so a new scrolling kind needs **no branch in the
  predicate** — the panel opts in by rendering the marker.
- `stopPropagation()` on every key, not only the handled ones, because
  `useViewport`'s keydown listener is on `window`.
- `.catch` on the read promise landing in an `unreadable` arm. An unhandled
  rejection leaves a permanent spinner, which this milestone's honest-degradation
  rule forbids: every failure must land in a rendered arm with a sentence.
- Chrome: drag from the header, a refresh control, a close control with no
  arming step (matching the review node; the `×` on a *terminal* panel arms
  because a mis-click there kills a process).

Line numbers render in a gutter. Long lines do **not** wrap — they scroll
horizontally inside the `data-scroll-host` container, because reflowing source
or a CSV row changes what the file looks like, and the panel's whole claim is
that it shows the file. The overflow is contained: the page itself must never
scroll sideways.

### Shell

`railLabel` gains a `file` arm: `title ?? basename(source.path)`. `railTail`
returns `'file'`, **before** the dormant test, for the reason the review arm
returns `'review'` there — the whole status vocabulary is a sentence about a
process this panel does not have, and `dormant` in particular would render a
"click to start" affordance that nothing can honour.

`buildInspectorModel` gains a `file` arm returning `kind: 'file'`, `restartable:
false`, and fields for path, directory, size, line count, last-modified and the
current state. Restart and Save-as-preset are **disabled with a reason, never
hidden** — `verify:palette` 31's rule, that a control which disappears is
indistinguishable from a feature that was never built. `InspectorModel.kind` is
a required `Panel['kind']`, so adding the union member turns every unhandled
switch into a compile error rather than a silently-enabled control.

### The two doors

**Palette.** An `Open file…` row in the appropriate section, calling
`actions.openFile()`, which invokes `file:open`. Main owns the dialog because
main owns every other dialog in this app. The panel is minted at
`cascadeCentre(worldCentre(), panels)` — the cascade is kind-blind, reading
`rect` only, so a file panel inherits collision-stepping for free.

**Finder drop.** `dragover` (with `preventDefault`, or the browser navigates to
the file and destroys the app's own page) and `drop` on `.canvas`. The panel is
minted at `screenToWorld(dropPoint, viewport)` — the drop's world coordinates,
so the panel lands where the cursor was at every zoom level, not where it was at
1:1.

**The path is recovered through `webUtils.getPathForFile(file)`, exposed on the
preload bridge.** Electron here is 43.4.1, where `File.path` was removed from the
renderer: reading `file.path` yields `undefined`, the mint is skipped, and the
drop looks like it did nothing at all — with no error, because `undefined` is a
perfectly ordinary value for a property that does not exist.

## Verification

New suite `verify:file` (plain node — `file-read.ts` and `file-watch.ts` import
neither `electron` nor `node-pty`), against real files in a **spaced** temp
directory, the rule this repo learned the expensive way from the `pane-died`
redirect bug:

1. `text` for an ordinary file: content, byte count, line count.
2. `missing` for a path that does not exist.
3. `too-large` at one byte over the cap, and `text` **at** the cap — both ends,
   because a bound written with the wrong comparison passes a one-sided check.
4. `binary` for a NUL in the first 8 KB, and `text` for a file whose only NUL is
   past it (the boundary the scan actually draws).
5. `unreadable` for a directory, carrying a detail.
6. The render cap truncates **and reports the remainder** — asserted on
   `truncatedLines` as a number, not on the rendered text.
7. **The atomic-rename survival.** Write a temp file beside the target, `rename`
   it over the target, and assert a change event still fires with the new
   content. *This is the check the milestone exists for.* It fails against a
   `fs.watch(path)` implementation, which is the obvious one, and it is the only
   check in the repo that would ever notice — every casual test writes in place
   and passes either way.
8. The dedupe: a write that does not change the content produces **no** event.
   Its window must span several debounce periods, for the reason
   `verify:pty-manager` 23's window does: a sample too short sees one message
   either way.
9. `closeAll()` leaves no watcher armed — asserted by writing after the close
   and observing no callback.

Existing suites:

- `verify:layout` — a `file` panel round-trips with its whole `source`; a
  malformed `source` is dropped **alone** while its neighbour survives; an absent
  `kind` still parses as terminal (the existing check must stay green); a present
  unknown kind is still dropped; the same union survives `layout-adapt`'s round
  trip, which is the other door onto the format a schema-only check cannot see.
- `verify:viewport` — `makeFilePanel` centres like every other constructor and
  carries `source` verbatim.
- `verify:rail` — `railLabel` and `railTail` for the file arm; a file row is
  never dormant; `buildInspectorModel` refuses the process verbs; the
  `file-node-model` arms, including that `missing` renders a **note** rather than
  nothing (a node the user deliberately opened must never render empty — the one
  decision `review-node-model.ts` already diverges from the inspector pane on).
- `verify:ipc` — 34 channels.
- `verify:panels`, end to end, and these are the ones that say the milestone
  landed rather than compiled:
  - A file panel opened through the real palette row renders the file's real
    content.
  - A **real write to that file** updates the panel — waited on, never slept on,
    because a fixed sleep against a watcher is a flake and not a bound.
  - The panel holds **no `PanelSession`** (read from `__m4aSessions`, the
    renderer's own registry) **and** the `.xterm` count is unchanged from before
    the panel existed. Both clauses are required: the second is what rejects an
    implementation that quietly demoted some other panel to pay for this one.
  - Closing it sends **no** `pty.kill` for its id, asserted through the
    kill-recorder shadow that checks 111/111b established — with a real terminal
    panel closed in the same window asserting its id **is** recorded, because a
    negative against a recording mechanism is vacuous if the recorder is dead.
  - The id reseed: seed a persisted `f7`, reload so the reseed actually runs,
    open a file panel through the real gesture, and assert the minted id collides
    with nothing any workspace already holds.

## Success criteria

1. A file opened from the palette appears on the canvas as a panel, showing its
   real contents, and pans, zooms, drags, resizes and z-orders like every other
   panel.
2. A file dropped from Finder lands at the drop point in world coordinates.
3. An external write to the file — including an **atomic** write — is reflected
   in the panel within about a second, with no user gesture.
4. Deleting the file leaves the panel open, saying so; re-creating it restores
   the content.
5. A file panel consumes no `LIVE_BUDGET` slot, no WebGL context and no PTY, and
   this is structural rather than enforced by a guard.
6. Closing, undoing, resetting the canvas, or deleting a workspace containing a
   file panel sends no PTY kill for that panel's id.
7. A `Cmd+R` reload leaves no watcher armed for panels that are gone.
8. The panel survives a reload and a relaunch, reading its path back from
   `layout.json`.

## Known limitations, stated rather than discovered

- **No writing.** See Scope.
- **A hidden workspace's file panel is not watched.** Its component is
  unmounted, so `file:close` ran. This is correct — nobody is looking — but it
  means "the panel is always current" is true only of the active canvas, and the
  first read on the way back is what makes it current again.
- **A moved or renamed file reads as `missing`.** The panel holds a path, not an
  inode, and following a rename would mean tracking one — which is a different
  and much larger feature, and one that would sometimes follow the wrong file.
- **The watch is per panel, so two panels on one file arm two watchers.** One
  `FSWatcher` per directory per panel is a real cost and an obvious dedupe
  target; it is not worth the shared-lifetime bookkeeping until somebody opens
  the same file twice, which is not a thing people do.
- **No encoding detection.** Files are read as UTF-8. A Latin-1 file renders
  with replacement characters rather than failing, which is the better of the two
  wrong answers, but it is a wrong answer.
