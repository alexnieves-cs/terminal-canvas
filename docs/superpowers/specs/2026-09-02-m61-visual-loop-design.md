# M61 — The visual loop, and three post-1.0 defects

**Status:** design, 2026-09-02. **Branch:** `m61-visual-loop`.

## What this milestone is for

The M36–M60 run built a visual language and never looked at the result. `verify:styles`
reads CSS as text; `scripts/shot.cjs` paints five PNGs and was not run during M45. The first
screenshot anyone took after 1.0 showed a label hanging off a panel's edge like a rendering
error. Nothing in the harness could have seen it.

M61 builds the loop every later surface milestone runs through: **render the real renderer
to PNGs, look at them, hand them to a critic who cannot read the code.** It also fixes the
three defects the post-1.0 review confirmed, because each has a check-shaped fix and leaving
them for later means a run that starts by knowingly shipping known bugs.

This milestone is fixed by the brief. Everything after it is decided in the scope decision
that follows.

## Failure modes this guards against

1. A visible defect that no suite can see, shipped with a green badge. (The harness.)
2. A dead process's trailing bytes landing in a *new* panel's terminal at the same id, and a
   log file `kill()` dropped coming back from the dead. (`pty-manager.ts`.)
3. A control a keyboard user cannot reach, in a repo whose rule is "every control is
   reachable three ways". (`GroupLayer.tsx`.)
4. A roadmap document described as the contract, silently stale by twenty-five rows.
   (`README.md`, and the pin that stops it recurring.)

## Part 1 — The screenshot harness (`npm run shot`)

### Shape

`scripts/shot.cjs` stays what it is — an Electron entry that reuses `panels-entry.cjs`'s
bundle, never a verify suite — and grows a **scene list**. Each scene is `{name, intent,
run}`: `run` drives the renderer through the same keyboard/DOM route a user takes (chords via
`KeyboardEvent`, controls via a dispatched `click`, never by reaching into React state), then
captures. `intent` is one sentence saying what the scene is supposed to show, written for the
critic. The harness writes `<name>.png` for every scene, plus `manifest.json` — the scene
list with intents — so the critic prompt is generated from the run rather than typed.

Output goes to `SHOT_DIR`, defaulting to `out/shots/` (build output, gitignored). It is one
command: `npm run shot` builds nothing; run `npm run build` first, as `verify:panels` does.
The README's "verify" section says so.

### Fixture

The harness seeds its own `layout.json` — two workspaces, a group, every panel kind, a
never-spawned dormant panel with a recorded scrollback tail, and two live terminals whose
cwds are the same fixture repository so the subagent watcher reports them ambiguous — plus
a `TC_CLAUDE_PROJECTS` root, a scratch scrollback directory whose log for the dormant panel is
pre-written (so search has something to hit), and a throwaway `userData`. Nothing it does
touches the real store, the production tmux sockets, or the developer's home. It runs on
the direct backend: reattach is not a visual property.

### Scenes

Rendered at 1440×900 unless stated; `-dark` variants where the theme changes what the scene
proves.

| scene | intent |
|---|---|
| `launcher` | the empty canvas a fresh install sees |
| `kinds` | one of every panel kind side by side: live terminal, dormant card, review, file, toolbox, jira |
| `kinds-dark` | the same, dark theme |
| `subagents` | two panels sharing one repository — the attribution notice beside them |
| `palette` / `palette-dark` | Cmd+K at rest |
| `palette-query` | the palette filtered, disabled rows with their reasons visible |
| `search` | the search scope with hits over the durable log |
| `search-empty` | the search scope with a query that hits nothing |
| `inspector-detail` / `-work` / `-tools` | the context pane's three tabs on a live panel |
| `navigator-panels` / `-workspaces` / `-files` | the dock's three navigator panes |
| `attention` | the attention popover with one panel waiting |
| `group` / `group-collapsed` | a named group around two panels, expanded then carded |
| `merged` | the merged view with two workspaces in lanes |
| `zoomed-out` / `zoomed-out-dark` | the canvas at scale ~0.22, below the summary threshold, semantic-zoom cards |
| `compact` (1000×760) / `wide` (1800×1000) | the shell at its other two breakpoints |

Twenty-three images. That is the set a critic needs to say "that is wrong" about any
surface a daily user touches.

### What it must not do

Assert. A red harness would be a verify suite with a slower loop; its output is judged by
eyes. It must also not be wired into `verify` — `verify:meta` 19 excludes only
`verify:packaged` by name, and `shot` is not a `verify:` script, so nothing changes there.

## Part 2 — The exit-flush race (`src/main/pty-manager.ts`)

### Design

The gate goes in `flush()` itself, not in `onExit`. There are two doors into a stale flush,
and gating only the one the review named leaves the other open:

- `onExit` flushes before the identity check (the named door);
- `enqueue()` on a read that lands after `kill()` sets a *new* `flushTimer`, which fires
  `flush()` from a timer for a session no longer in the map (the unnamed door).

`flush(session)` therefore first asks `this.sessions.get(session.panelId) === session`. If
not, it clears the timer, empties the buffer, and returns — no send, no append. The
flush-before-exit rule for a **natural** exit is untouched: a session that exited on its own
is still in the map when `onExit` runs, so its last lines still reach the renderer and the
log. The rule that changes is stated in the module's own voice: *a session that is no longer
this panel's session has no right to speak to it.*

The `onExit` call site keeps its flush call and its comment gains the reason it is now safe.

### Check

`verify:pty-manager` `exit-flush.1`: spawn `sh -c 'trap "echo LATE-TAIL-77" EXIT; sleep 30'`
with a recording scrollback sink, `kill()` it, immediately `create()` at the same id, wait,
then assert no `pty:data` payload for that id after the kill contains the marker and no
append after the drop contains it. Red on the current tree, by construction: the trap prints
after `kill()` returns.

## Part 3 — Group controls reach the keyboard (`GroupLayer.tsx`, palette)

### Design

Both buttons go through `shellControl()`, with one addition the group header needs: the
header's own `onMouseDown` begins a drag, so the button's mousedown must also
`stopPropagation()` or pressing "card" starts a drag. A small local wrapper composes the two.
The toggle keeps its text label ("card"/"expand") because the word is the affordance; the
remove button keeps its icon and `aria-label`.

Two palette rows, on the group that contains the **captured** panel (the row the palette
already targets everything else at): `Card group “X”` / `Expand group “X”` and
`Remove group “X”`. One pair, never one per group — `removeLink`'s rule. Disabled with a
named reason when the captured panel is in no group (`REASON_NOT_IN_GROUP`), and, as every
canvas-geometry verb is, in the merged view (`REASON_MERGED_READ_ONLY`, already the group-creation row's reason). `PaletteContext` gains `groups` (id, label, collapsed, panelIds).

### Checks

- `verify:palette` `group-rows.1`: the two rows exist, disabled with `REASON_NOT_IN_GROUP`
  when the captured panel is in no group, enabled and titled with the group's label when it is.
- `verify:panels` `group-keys.1`: with a group seeded in the layout and one member woken
  live, a dispatched `click` on `.canvas-group__toggle` cards the live member and a second
  expands it; a `click` on `.canvas-group__remove` removes the frame and leaves both panels
  and the PTY standing. (Seeded rather than made through the palette: the palette's
  create-group flow is not this check's subject.)

### What M59's audit missed, and why

The dead-end audit walked palette reasons and shell controls — surfaces that *name* their
affordances. A button that runs from `onMouseDown` has a name and a title; what it lacks is
a route, and the audit had no step that asked "can this be reached without a pointer". That
step is now a `verify:styles`-style text check: `verify:rail` `group-keys.2` greps
`GroupLayer.tsx` for a `<button` that carries `onMouseDown` without `shellControl`. Cheap,
and it is the check that would have caught this.

## Part 4 — The milestone table, and its pin

`README.md`'s table gains M36–M60, one row each, scope written from the build-log summaries.
`verify:meta` `milestones.1` reads `docs/build-log/mNN-*.md` and asserts every milestone
with a build log has a `| MNN |` row in the README, and every README row at or above M36 has
a build log. The second direction stops a row from being invented ahead of the work.

## Part 5 — The named visible defect

The subagent attribution notice (`.subagent-ambiguous`) gets the frame its sibling nodes
have: the same border, radius, surface and shadow as `.subagent-node`, `white-space: normal`
so it wraps inside its 200px width instead of running past the canvas, and it sits at the
node column's x, where a node would be. It is the one design change in M61, because the
brief names it and because leaving the harness's first named finding unfixed would make the
first critic report a rerun of the review that motivated this milestone. Every other finding
the critic raises is recorded and scheduled, not fixed here.

### Addendum, found by the first render (2026-09-02)

The context pane's three tabs all showed the same body: `.context__panel { display: block }`
outranks the user-agent `[hidden]` rule, so every `hidden` tab panel still painted, stacked.
`verify:panels` reads the `hidden` attribute and passed; only pixels saw it. Fixed in this
milestone (one `[hidden]` reset), with `verify:styles hidden.1` pinning that any class that
sets `display` and is toggled with `hidden` carries the reset. Recorded here rather than
deferred because it is the harness's first catch and the reason the harness exists.

## Definition of done

- `npm run shot` exists and writes the twenty-three images and the manifest in one command.
- I have looked at every image; a fresh-context critic given only the images and their
  intents has reported; the build log records each finding as accepted-and-scheduled,
  accepted-and-fixed, or rejected with a reason.
- The three defects are fixed with the checks above, each seen red first.
- `npm run verify` green, run alone. Merged to `main`; branched again immediately.
