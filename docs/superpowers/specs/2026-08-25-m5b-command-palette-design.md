# M5b: Command Palette — Design

**Status:** approved, not yet implemented
**Predecessor:** `2026-08-25-m5a-presets-design.md`

## Goal

Give the app one surface that can be typed at.

Everything the canvas can do today is reachable exactly one way: an app menu
item, or a `Cmd`-gated keystroke wired by hand in `useViewport.ts`. That was
sufficient while the verb list was short. M5a made it insufficient in a
specific, recorded way — it shipped presets that can be created and picked but
not renamed, deleted, reordered, or made default, and its spec named the reason:

> Building a preset-manager dialog now would be the first modal in this app,
> and it would collide with xterm's keyboard focus — the same problem M5b has
> to solve properly and once.

M5b is that "properly and once." The palette is not primarily a faster menu; it
is the app's answer to **who owns the keyboard**, and preset management, panel
navigation, and a prompt library are the three things that become possible the
moment that question has an answer.

## Scope

In:

- A `Cmd+K` overlay: a text field, a fuzzy-filtered command list, arrow-key
  selection, `Enter` to run, `Escape` to close.
- A focus discipline the rest of the app can rely on — stated as four rules
  below, and the reason this milestone is architectural rather than cosmetic.
- **Preset management**: rename, delete, and set-as-default for user presets;
  spawn from any preset. Exactly the debt M5a deferred here by name.
- **A panel switcher**: "Go to <panel>" moves the camera and selects, without
  waking a dormant panel.
- **A prompt library**: saved prompts pasted into the focused panel, drawn from
  two sources — a global store in `layout.json`, and `.claude/commands/*.md`
  read from the focused panel's `cwd`.
- Canvas verbs that already exist but are menu-only: reset canvas, zoom to fit,
  the three restore toggles.

Out, and deliberately so:

- **Prompt placeholders** (`{{cwd}}`, `{{branch}}`, `{{selection}}`).
  ideas-backlog #27 is right that they are what separates a prompt library from
  a clipboard manager, and `{{branch}}` in particular wants the read-the-real-
  cwd-from-the-pid machinery that #4's git-status badge owns. A prompt that
  pastes fixed text is the whole of M5b.
- **Writing `.claude/commands/`.** The project source is read-only. Saving
  always writes the global store. Authoring a file into someone's repository —
  which they will commit — is a decision that should be asked for explicitly,
  not acquired as a side effect of pressing "save".
- **Preset reordering.** Rename, delete and set-default make the list usable;
  ordering it is a drag-and-drop surface inside an overlay, and `allPresets()`
  deliberately fixes built-ins first so the order is stable as users add their
  own. Revisit when there are enough presets for order to matter.
- **Automatic prompt capture** ("you've typed this five times — save it?").
  ideas-backlog #27 lists this under "worth resisting" and gives the reason:
  noticing requires retaining everything the user types, and the user's typing
  includes credentials. Saving is always a deliberate gesture.
- **Search across panel output** (ideas-backlog #16). The palette searches
  *verbs*, not scrollback. #16 is gated on durable scrollback (#30) and is a
  different feature wearing a similar hat.
- **A second window.** See "Why not a separate BrowserWindow" below.

## The central insight

**A modal in this app is not a UI problem, it is a focus-ownership problem, and
the codebase has already written down what makes it hard.**

Three existing comments say it:

1. `useViewport.ts` gates every canvas shortcut behind `metaKey`, because "agent
   TUIs claim essentially every bare key, so from M3 a bare keystroke must
   always reach the PTY." The palette is the first surface in this app that
   must **swallow bare keys** — the exact inverse of the rule everything else
   obeys.
2. `Canvas.tsx` clears `focusedId` on a background click, because "an id that is
   never cleared holds a WebGL context and a budget slot for the rest of the
   run." So the palette cannot simply "take focus" in the app's sense: doing so
   would demote the panel every command is about to act on.
3. `Canvas.tsx` routes `edit:paste` — main's `Cmd+V` — unconditionally into the
   focused session. With a text field on screen, that pastes into the agent
   instead of the field, invisibly.

Each of those is a silent failure, and none of them is discovered by looking at
a screenshot of an overlay that renders correctly.

## Architecture

### Where the palette lives

A renderer overlay, rendered as a sibling of `.world` inside `Canvas.tsx`'s
clipping host — **never inside `.world`**. A `scale()` ancestor would shrink the
palette to a third of its size at `scale: 0.3`, and would place it in exactly
the coordinate space `pointer-correct.ts` rewrites, so every click in it would
be re-dispatched with corrected coordinates meant for a terminal cell grid.

#### Why not a separate BrowserWindow

A frameless always-on-top window isolates the keyboard for free, which is the
one hard part. It fails on everything else: it has no access to the registry, so
`handle.paste()` — the whole prompt feature — becomes an IPC round trip through
main into a second renderer; the panel list, focus, camera, and preset
availability all have to be re-shipped and kept in sync; and `verify:panels`
would need a second window to drive. The keyboard problem is solvable in one
component. The state problem is not.

### Layering

The canvas's rule holds — pure at the bottom, React only at the top, and the
pure layers bundle into a plain-node suite:

```
src/renderer/palette/
  fuzzy.ts          pure subsequence match + score. No DOM, no React.
  palette-model.ts  pure: filter a Command[], move/clamp/wrap the selection index.
  commands.ts       pure: build Command[] from plain app state + callbacks.
  usePalette.ts     open/close state, the Cmd+K binding, focus save/restore.
  Palette.tsx       the view.
```

`commands.ts` is pure because it takes **data and callbacks**, never the
registry: `buildCommands(context)` where `context` carries presets, prompts,
panels, the captured focus id, and a bag of `run` handlers. That is the same
dependency-injection move `session-registry.ts` makes to stay plain-node
testable, and it is what lets `verify:palette` assert "a built-in preset yields
a rename command that is disabled, with a reason" without an Electron window.

### The four focus rules

1. **Opening focuses the palette's `<input>`.** That alone stops bare keys
   reaching xterm: xterm reads its own hidden textarea and nothing else. No
   global key swallowing, no `preventDefault` on every keystroke.
2. **DOM focus is not app focus.** `focusedId` is NOT cleared on open. Clearing
   it demotes the panel (`assignTiers` pins the focused panel live), loses the
   `Cmd+C` target, and drops the very panel most commands are about to act on.
   The palette records `focusedId` at open time — the **captured id** — and
   every panel-acting command uses that, not whatever focus is at run time.
3. **Canvas shortcuts stand down while it is open.** `useViewport`'s window
   `keydown` early-returns via a predicate passed in the same referentially-
   stable way as `shouldYieldWheel` (a `useCallback` with an empty dep list
   reading a ref) — a non-stable predicate would tear down and reinstall the
   listener on every render. Without this, `Cmd+N` typed while filtering also
   spawns a panel. `edit:paste` gets the same guard, so `Cmd+V` fills the text
   field rather than the agent.
4. **Closing restores the terminal.** Escape, Enter-after-run, and a click
   outside all route through one `close()`, which calls `handle.focus()` on the
   captured id. `SessionHandle.focus()` already exists for this.

### The command

```ts
export interface Command {
  id: string
  title: string
  subtitle?: string
  group: 'Panel' | 'Preset' | 'Prompt' | 'Canvas'
  /** Present means unrunnable, and says WHY. Never a silently dead row. */
  disabledReason?: string
  run(): void
}
```

`disabledReason` is the same rule `menuLabel()` states for the preset submenu:
"a greyed-out row with no reason is a bug report." A prompt-insert command with
no focused panel reads "no focused panel", not nothing.

### Fuzzy matching

A hand-written subsequence matcher in `fuzzy.ts`: a query matches if its
characters appear in order, scored by contiguity, word-boundary hits, and
earliness. No dependency — the renderer runs under a strict CSP
(`default-src 'self'`), and a matcher small enough to test exhaustively is
cheaper than a dependency decision.

### Preset management

Four new invokes, each with a main handler so `verify:ipc` covers them:
`preset:list`, `preset:rename`, `preset:delete`, `preset:set-default`.

- `preset:list` answers with `{ preset, available, isDefault, builtIn }` rows.
  Availability is main's — `resolveAvailability` probes the resolved login PATH,
  which the renderer structurally cannot read.
- **Built-ins refuse rename and delete, and say so.** Built-ins are code, not
  data (`main/presets.ts`): persisting them would mean a deleted one returns on
  the next launch, "a bug with no good explanation." The palette shows the row
  with a `disabledReason` rather than hiding it or letting the call no-op.
- Every mutation makes main do the three things it already does after a preset
  change: rebuild the app menu, re-push `PRESET_DEFAULT`, and save through
  `LayoutStore`. None of that is new code, only a new caller.
- **Rename reuses the palette's own text field** as a second mode. This is why
  the milestone is cheap: the app's first text-entry surface pays for itself
  three times.

### The panel switcher

"Go to <panel>" frames the panel and selects it. Labels come from the same
shape `autoName()` uses — command (or "login shell") plus `basename(cwd)` — plus
the panel id, since user-set panel names are ideas-backlog #6 and do not exist.

**It must not wake a dormant panel.** Waking hangs off *select*, not focus
(`Canvas.tsx`: `onSelectPanel` clears `dormantIds` and calls `registry.wake`),
so the obvious implementation — reuse `onSelectPanel` — spawns an agent process
as a side effect of navigating. Restoring a canvas and arrowing through the
switcher would launch every restored agent, which is precisely what M4b's
dormancy rule exists to prevent. The switcher therefore gets a
select-without-wake path, and the card keeps saying "click to start".

Framing needs one new verb on `useViewport`: `centreOn(rect)`, which changes the
translation and leaves the scale alone. It is added the way `resetViewport` and
`worldCentre` were — a narrow named verb, with the general setter still private,
because "nothing outside this hook should move the camera" is still true of
everything except the two things that ask by name.

### Prompts

```ts
export interface Prompt {
  id: string
  name: string
  body: string
}
```

**Global**: a `prompts: Prompt[]` array in `layout.json`, beside `presets` and
`settings`, parsed by `shared/layout-schema.ts` with the discipline that file
already has — never throw, drop bad entries individually, and warn when a
present-but-wrong field is replaced rather than silently emptying it. Storage
shares with M4b's store; ideas-backlog #27's constraint is explicit that three
independent "state that survives a relaunch" implementations is how this app
ends up with three different bugs about atomic writes.

**Project**: `.claude/commands/*.md` under the captured panel's `spec.cwd`, read
by main (`~` expansion is main's; `resolveCwd` already does it). One level deep,
capped at 100 files and 64KB each — an unbounded recursive read of whatever
directory a user pointed a panel at is a hazard, not a feature. Filename is the
name; the file body is the prompt.

Both sources are merged into one list with **the source labelled on every row**
and never deduped by name. #27 names the failure this avoids: "pasting the wrong
project's context into an agent is a quiet way to waste an hour." Two prompts
called `review` from two sources are two rows, distinguishable.

**Insertion is `handle.paste()`, never `write()`.** This is the load-bearing
detail of the entire prompt feature. `session-factory.ts` records the failure
from `Cmd+V`: a raw write of a five-line prompt into an agent TUI is five
newlines, which is five submissions of four incomplete fragments. `paste()`
goes through xterm, which brackets it, so the block arrives as one input. Every
prompt is multi-line, so every use depends on this.

**Saving** captures the focused panel's selection — `getSelection()`, the same
call backing `Cmd+C` — and asks for a name in the palette's text field. A
deliberate gesture, with no retention of anything the user did not select.

Three invokes: `prompt:list` (takes a cwd, answers with the merged list),
`prompt:save`, `prompt:delete`. Deleting a project prompt is refused with a
reason: it is a file in the user's repository.

### IPC summary

Seven new renderer→main invokes in `IPC`: `preset:list`, `preset:rename`,
`preset:delete`, `preset:set-default`, `prompt:list`, `prompt:save`,
`prompt:delete`. No new main→renderer events — the palette asks, main answers,
and the existing `PRESET_DEFAULT` push already covers the one thing main has to
volunteer after a mutation.

Note the direction change this milestone introduces: M5a's preset channels are
all main→renderer, because the menu is main's. The palette is the renderer's, so
the mutations invert. That is why they belong in `IPC` (walked by `verify:ipc`)
rather than in `IPC_EVENTS` alongside `PRESET_CAPTURE`.

## Failure modes

- **The palette opens and the agent eats your typing.** The input never took DOM
  focus, so xterm's textarea still has it. Silent: the overlay looks right.
  Covered by a `verify:panels` check that types a bare key with the palette open
  and asserts the PTY received nothing.
- **Escape closes and the keyboard goes nowhere.** `close()` did not call
  `handle.focus()`; the user clicks the panel again and assumes they mis-clicked.
- **`Cmd+V` while filtering pastes into the agent.** The `edit:paste` listener
  did not learn about the palette. Invisible, and lands text in a running agent.
- **Navigating spawns agents.** The switcher reused `onSelectPanel`, which
  wakes. A restored twelve-panel canvas launches twelve CLIs from arrow keys.
- **A prompt arrives as five submissions.** `write()` instead of `paste()`.
- **Renaming a built-in appears to work and reverts on relaunch.** The rename
  wrote a user preset shadowing a built-in id instead of being refused.
- **`prompt:list` hangs on a large directory.** No cap, or a recursive walk.

## Testing

- **`verify:palette` (new, plain node)** — `fuzzy.ts` ranking and non-matches;
  `palette-model.ts` filtering, selection clamp and wrap, and that filtering
  keeps the selection on a runnable row; `commands.ts` construction: a built-in
  yields disabled rename *and* delete each with a reason, a user preset yields
  both enabled, no captured focus disables every prompt-insert and the
  save-selection command, and a project-sourced prompt yields a disabled delete.
- **`verify:layout` (extended)** — `parsePrompts` drops bad entries individually,
  treats absent as empty and present-but-wrong as a warning; a rename/delete/
  set-default round trip through `LayoutStore`.
- **`verify:ipc`** — covers the seven new channels by construction.
- **`verify:panels` (extended, real Electron)** — Cmd+K opens and takes the
  keyboard off xterm (bare key in, nothing at the PTY); Escape closes and the
  captured panel's terminal has focus; a prompt insert reaches the focused panel
  as one bracketed block; "go to panel" moves the camera and leaves a dormant
  panel unspawned.

## Files

New:

```
src/renderer/palette/fuzzy.ts
src/renderer/palette/palette-model.ts
src/renderer/palette/commands.ts
src/renderer/palette/usePalette.ts
src/renderer/palette/Palette.tsx
src/main/prompts.ts          reading .claude/commands, capped; pure helpers
scripts/verify-palette.cjs
scripts/palette-entry.cjs
```

Changed: `shared/layout-schema.ts` (the `Prompt` type and `parsePrompts`),
`shared/ipc-contract.ts` (seven channels + bridge members), `preload/index.ts`,
`main/layout-store.ts` (prompts, and preset mutation verbs),
`main/presets.ts` (rename/delete helpers), `main/ipc.ts`, `main/index.ts`,
`renderer/canvas/Canvas.tsx` (mount the palette, the paste guard, the
select-without-wake path), `renderer/canvas/useViewport.ts` (the stand-down
predicate and `centreOn`), `renderer/styles.css`, `package.json`, `README.md`,
`CLAUDE.md`.

## Success criteria

1. `Cmd+K` opens a palette; bare keys typed into it never reach the focused
   PTY; `Escape` closes it and the terminal has the keyboard back.
2. A user preset can be renamed, deleted, and made the `Cmd+N` default from the
   palette, and the change survives a relaunch. A built-in refuses both edits
   and says why.
3. "Go to <panel>" frames a panel without spawning a dormant one.
4. A multi-line saved prompt inserts into the focused panel as a single
   bracketed paste, from both the global store and `.claude/commands/`.
5. `npm run verify` is green, including the new `verify:palette` suite.
