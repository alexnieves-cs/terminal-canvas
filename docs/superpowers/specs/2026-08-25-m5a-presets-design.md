# M5a: Panel Presets — Design

**Status:** approved, not yet implemented
**Predecessor:** `2026-08-24-m4c-tmux-sessions-design.md`

## Goal

Stop making the user re-decide what a panel is every time they create one.

Today every panel on the canvas is the same panel: a login shell in `~`, minted
by `Cmd+N` or restored from disk. The command that actually matters — `claude`
in a particular repo — has to be typed by hand into a fresh shell, every time.
M5a makes that a saved, named thing you pick once.

M4b made the canvas durable; M4c made the processes on it durable. M5a is the
first milestone about what a panel *is* before it exists.

`panels.ts` has been waiting for this. `firstRunPanels()`'s comment names "the
new-canvas wizard milestone (count control, per-panel working directory, CLI
picker)" as the thing that replaces its placeholder panel, and
`PanelSpecTemplate` — `Omit<PanelSpec, 'cols' | 'rows'>`, "everything about a
panel that is known before it has a size" — is already a preset minus a name.

## Scope

M5 as a whole is presets, a command palette, and `electron-builder` packaging.
Those three share almost no code, so they are split into **M5a / M5b / M5c**
with a spec and a plan each, exactly as M4 was split into M4a / M4b / M4c. This
document is M5a only.

In:

- A `Preset` type: `PanelSpecTemplate` plus a name and a default box.
- Built-in presets — `Login shell`, `Claude`, `Codex` — defined in code.
- User presets, created by a "Save panel as preset" gesture, persisted in
  `layout.json` beside `settings`.
- A `New panel from preset ▸` submenu in the app menu, built by main, with
  unavailable commands shown disabled rather than allowed to fail.
- A default preset, which is what `Cmd+N` spawns. Ships as `Login shell`, so
  today's behaviour is the out-of-the-box behaviour.

Out, and deliberately so:

- **Editing, reordering, renaming and deleting presets.** M5a can create and
  pick; changing one means hand-editing `layout.json` until M5b's command
  palette gives the list a real surface. Building a preset-manager dialog now
  would be the first modal in this app, and it would collide with xterm's
  keyboard focus — the same problem M5b has to solve properly and once.
- **Per-preset `env`.** Nothing sets `PanelSpec.env` today, so nothing is lost.
  More importantly, capturing a running panel's environment captures its
  secrets (ideas-backlog #31). When per-panel env arrives it should arrive with
  that question answered, not as a side effect of this milestone.
- **A preset that spawns several panels.** "Three agents in three repos, laid
  out like this" needs placement logic (ideas-backlog #25) that does not exist.
  One preset makes one panel.
- **Live PATH watching.** Command availability is probed once at startup. A
  `brew install claude` mid-session is not noticed until relaunch.
- **cwd-from-pid.** A captured preset stores the panel's *spawn* directory
  (`spec.cwd`), not wherever the user has since `cd`'d to. Reading the real
  working directory from the PTY's pid is its own piece of machinery and
  belongs with ideas-backlog #4's git-status badge, which wants the same thing.

## The central insight

**Main already knows everything a preset needs, and the renderer structurally
cannot.**

Three separate facts in this codebase say so, and each of them is already a
comment block explaining a bug that was hit:

1. `PanelSpec.command` is optional, and absent means "the user's login shell."
   Only main can resolve that. The renderer's `process.env` is compiled by
   electron-vite down to `{}`, so `process.env.SHELL ?? '/bin/zsh'` there is not
   a lookup with a fallback — the fallback is the only branch that ever runs,
   and a fish user silently gets zsh.
2. `resolveCwd` in `pty-manager.ts` expands `~` and falls back to home when the
   directory is gone, because "node-pty passes cwd straight to the OS."
3. `main/index.ts` already probes `claude`, `codex` and `git` against the
   resolved login PATH at startup and logs `NOT FOUND` for each miss. That
   diagnostic is one step from being preset availability.

So the preset list lives in main, the menu that shows it is main's (menus always
are), the store that persists it is main's (`LayoutStore`), and the command
resolution stays where it already is. The renderer receives *templates it
displays and never resolves* — which is exactly what `Panel.spec` already is.

The alternative — presets riding along in `layout:load` and owned by the
renderer — fails on the menu alone: main needs the list to build the submenu, so
there would be two copies and a synchronisation problem. It also hands the
renderer command strings under circumstances where it might be tempted to
resolve one, which is the defect three comment blocks in this repo exist to
prevent.

## Architecture

### The type

```ts
export interface Preset {
  id: string              // ID_PATTERN; unique across built-ins and user presets
  name: string            // what the menu shows
  cwd: string
  command?: string        // absent means the login shell — main resolves it
  args: string[]
  w?: number              // default box; absent means the renderer's PANEL_W/PANEL_H
  h?: number
}
```

`w` and `h` are optional on purpose. `layout-schema.ts` states the rule this
follows: the format layer "decides what is VALID; it does not decide product
defaults, which would drag `PANEL_W`/`PANEL_H` into `shared/`." Absent means the
renderer supplies its own constants, the same way it already supplies
`firstRunPanels()` when it receives no panels.

`command` optional is not a convenience. It is the single field most likely to
be broken by a well-meaning later change, and every layer that touches it —
the parser, the menu, the capture gesture — must preserve absence rather than
resolve it.

### Built-ins are code, not data

`Login shell`, `Claude` and `Codex` are constants in main, merged with the
user's list when the menu is built. Only user-created presets are written to
disk.

Two reasons. Writing built-ins into `layout.json` on first run means deleting
one resurrects it on the next launch, which is a bug with no good explanation.
And it keeps the file proportional to what the user actually made, which matters
because `layout-store.ts` rewrites the whole file on every coalesced save.

Built-in ids are `shell`, `claude`, `codex`. User preset ids are minted as `u1`,
`u2`, … and checked against the built-in ids so the two namespaces cannot
collide.

### Storage

Two new keys on `LayoutSnapshot`, siblings of `settings`:

```ts
presets: Preset[]           // user-created only
defaultPresetId: string     // what Cmd+N spawns; ships as 'shell'
```

This is `layout.json`, not a new store. `CLAUDE.md` already states the rule for
the next feature that wants persistence: "A future settings surface should reach
for the same mechanism — one file, behind `LayoutStore` — rather than inventing a
second store for a fourth toggle." Three independent implementations of "state
that survives a relaunch" is how this app would end up with three different bugs
about atomic writes.

**`LAYOUT_VERSION` stays at 1.** Adding optional keys is compatible in both
directions: a file written before M5a simply has no `presets`, and `parseLayout`
already treats absent as default rather than as corruption. Bumping the version
would advertise a migration that does not exist.

`LayoutStore` grows `presets()`, `addPreset(p)` and `defaultPresetId()`,
mirroring the existing `settings()` / `setSetting(k, v)` pair, and reusing the
same coalesced, atomic write.

### Parsing

A new `parsePresets` sits beside `parsePanel` in `shared/layout-schema.ts`,
under the same rules the file already enforces: **pure, never throws, drops
entries individually with a named warning.** One hand-mangled preset costs that
preset, not the file.

It rejects a non-object, an id failing `ID_PATTERN`, a duplicate id, a
non-string `cwd`, and an `args` that is not an array of strings. `w`/`h`, when
present, are clamped to `MIN_PANEL_W`/`MIN_PANEL_H` rather than dropped — the
same trade `parsePanel` already makes for panel geometry, where losing the entry
is a worse answer than resizing it.

A `defaultPresetId` that resolves to no known preset falls back to `'shell'`,
because the failure it prevents is `Cmd+N` doing nothing at all.

### The IPC surface

Three new events. **No new invoke channels.**

```ts
IPC_EVENTS.PRESET_SPAWN     // main → renderer: { spec, w?, h? }
IPC_EVENTS.PRESET_DEFAULT   // main → renderer: { spec, w?, h? } — same payload
IPC_EVENTS.PRESET_CAPTURE   // main → renderer, ephemeral reply channel
```

`PRESET_SPAWN` and `PRESET_DEFAULT` carry the *same* payload — a resolved
template and an optional size — because they differ only in what the renderer
does with it: spawn now, or remember for the next `Cmd+N`.

`PRESET_CAPTURE` inverts the usual subscribe. On the bridge it is
`preset.onCapture(provide)`, registering a *provider* that returns the focused
panel's spec or `null` — not a listener that receives one. This mirrors
`canvas.onCounts(provide)` exactly, the existing precedent for a
main-asks-renderer round trip, and it is why all three preset channels live in
`IPC_EVENTS` rather than `IPC`.

`PRESET_CAPTURE` is a main→renderer *request*, answered on an ephemeral reply
channel invented per call. That is not a new pattern: `canvas:counts` already
works exactly this way, for the same reason — main owns the menu but only the
renderer knows the answer.

### Three flows

**Spawn from the menu.** Click → main resolves the preset → sends
`PRESET_SPAWN` → the renderer mints an id from `nextIdRef`, builds a panel
centred on the camera, pushes **one** history entry, and lets lazy spawn happen
when tiering promotes it.

This is deliberately the same path `Cmd+N` already takes. `nextIdRef` seeding,
the single-history-entry-per-gesture rule, and — critically — the `applyHistory`
call site that disposes a session when undo removes a panel all keep working
without modification. `makePanel(id, centre, z)` grows a spec-and-size
parameter instead of hardcoding `shell(id)`.

**`Cmd+N` stays in the renderer.** This is the one deliberate deviation from
"main owns presets end to end," and the reason is the check harness rather than
taste. `verify:panels` presses `Cmd+N` by dispatching a `KeyboardEvent` on
`window` (its `zoomTo` helper); a main-process menu accelerator would never
receive that. Moving `Cmd+N` into the menu would force checks 7, 20 and 22 —
plus three further sites — to be rewritten as IPC sends, which would trade real
coverage for architectural tidiness.

Instead main **pushes** the resolved default template over `PRESET_DEFAULT`,
after `layoutStore.load()` and again whenever the presets or the default change.
The renderer caches that one template and `Cmd+N` uses it. Main still owns the
list, the default, and command resolution; the renderer holds a template it
displays and never resolves, which is what `Panel.spec` already is.

**Save the focused panel.** Main cannot know which panel has focus, so it asks
over `PRESET_CAPTURE`. The renderer answers with the focused panel's spec and
rect, or `null`. Main mints a preset id, auto-names it, appends it to the store,
and rebuilds the menu.

Auto-naming, because M5a builds no modal: `<command basename> — <cwd basename>`,
so a `claude` panel in `terminal-canvas` becomes `claude — terminal-canvas`, and
a shell panel becomes `login shell — terminal-canvas`. A colliding name gets a
numeric suffix. Renaming waits for M5b or a hand-edit, and the menu item is
labelled `Save panel as preset` with **no ellipsis**, since the macOS convention
is that an ellipsis promises a dialog and none follows.

### Availability

The menu resolves each distinct `command` through `whichFromEnv` against the
login environment, reusing the probe `main/index.ts` already runs at startup.
A command that is not found renders as a **disabled** item labelled
`Claude — not found on PATH`.

This is the same posture as `shell-env.ts`'s loud fallback and `probeTmux`'s
refusal to trust `tmux -V`: the alternative is a menu entry that spawns a panel
which dies instantly with `command not found`, which looks like the app is
broken rather than like the CLI is missing. Presets with no `command` are always
available, since the login shell always exists.

The probe result is cached from startup. A mid-session install is not noticed —
stated here so it is a known limit rather than a bug report.

### One targeted improvement

`requestCanvasCounts` in `main/ipc.ts` is a bespoke one-off today. With
`PRESET_CAPTURE` it gains a second caller, so it becomes a general
`requestFromRenderer(webContents, channel, fallback, timeoutMs)`. The
ephemeral-channel trick, its 1000ms timeout and its safe fallback then live in
one place rather than being copy-pasted into a second shape.

`CLAUDE.md`'s note about `canvas:counts` deliberately sitting outside the
declared contract — and about `verify:ipc` therefore not covering it — still
holds, and gets updated to describe both users.

## Failure modes

| Case | Behaviour |
|---|---|
| Preset's `cwd` deleted since it was saved | `resolveCwd` expands `~`, finds it missing, warns, falls back to home. Already built; nothing new. |
| Preset's `command` not on PATH | Menu item disabled and labelled. Never spawns a panel that dies with `command not found`. |
| Menu click on an id no longer in the list | No-op plus a warning. Never substitutes a different preset. |
| "Save panel as preset" with nothing focused | `dialog.showMessageBox` — "Focus a panel first." Not a silent no-op. |
| Corrupt preset entry in `layout.json` | Dropped individually with a named warning; the rest of the file opens. |
| `defaultPresetId` resolves to nothing | Falls back to `'shell'`, so `Cmd+N` is never inert. |
| A preset with absent `command` | Spawns the login shell; the header reads `login shell`. Any layer that "helpfully" fills this in is the bug. |

## Testing

New behaviour lands with checks written and watched failing first, as M2, M3 and
M4 did.

**`verify:layout`** (plain node; currently 26 checks, so these are 27–35):

- **27** `parsePresets` drops a non-object entry and keeps the rest.
- **28** Drops a preset whose id fails `ID_PATTERN`.
- **29** Drops a duplicate preset id.
- **30** Drops a preset whose `args` is not an array of strings.
- **31** Clamps a `w`/`h` below the minimum instead of dropping the preset.
- **32** A pre-M5a file with no `presets` key parses clean, with no warning.
- **33** An unresolvable `defaultPresetId` falls back to `'shell'`.
- **34** **A preset with an absent `command` round-trips absent.** This is the check
   that matters most in this suite: a parser that defaults it to `/bin/zsh` is
   the exact silent bug `types.ts` and `panels.ts` both carry comment blocks
   about, and it would pass every other assertion here.
- **35** `addPreset` writes through the existing coalesced, atomic path.

**`verify:panels`** (real Electron; currently 26 checks, so these are 27–31):

- **27** `PRESET_SPAWN` produces a panel with the preset's cwd, command and default
    box, centred on the camera in world coordinates.
- **28** `Cmd+Z` after a `PRESET_SPAWN` removes the panel **and disposes its
    session** — the shape check 22 already established for `Cmd+N`.
- **29** `PRESET_DEFAULT` changes what `Cmd+N` subsequently spawns.
- **30** `PRESET_CAPTURE` returns the focused panel's spec, and returns `null` when
    nothing is focused.
- **31** A command-less preset spawns the login shell and the panel header reads
    `login shell`, not a resolved path.

**`verify:viewport`** (plain node; currently 47 checks, so this is **48**): `makePanel` honours a supplied spec and
size, since its signature changes.

**A gap named on purpose:** `verify:ipc` walks `IPC` — the invoke channels —
only, so all three new *events* sit outside its "every channel has a handler"
guarantee, exactly as `canvas:counts` already does. Checks 27–31 above are their
coverage. This is written down so a later reader does not assume `verify:ipc`
has them.

`scripts/panels-entry.cjs` needs the new wiring. It is its own Electron entry
point rather than `out/main/index.js`, so nothing registers handlers for it the
way `main/index.ts` does at real startup; it already hand-wires
`resolveShellEnv`, `registerIpcHandlers` and a `PtyManager`, and will need the
preset store and the menu pieces beside them.

## Files

| File | Change |
|---|---|
| `src/shared/layout-schema.ts` | `Preset`, `parsePresets`, `presets` + `defaultPresetId` on `LayoutSnapshot`, defaults. Pure; no version bump. |
| `src/shared/ipc-contract.ts` | Three new `IPC_EVENTS` and the `preset` section of `CanvasBridge`. |
| `src/main/presets.ts` (new) | Built-in preset constants, id minting, auto-naming, availability resolution. Pure where it can be. |
| `src/main/layout-store.ts` | `presets()`, `addPreset()`, `defaultPresetId()`, beside the existing settings pair. |
| `src/main/menu.ts` | `New panel from preset ▸` submenu, `Save panel as preset`, disabled-when-missing labelling. |
| `src/main/ipc.ts` | `requestCanvasCounts` generalised to `requestFromRenderer`; the capture round trip. |
| `src/main/index.ts` | Own the preset list; push `PRESET_DEFAULT`; rebuild the menu when presets change. |
| `src/preload/index.ts` | `canvas.preset.onSpawn(listener)` / `onDefault(listener)` / `onCapture(provide)`, each returning its own unsubscribe. |
| `src/renderer/panels/panels.ts` | `makePanel` takes a spec and an optional size. |
| `src/renderer/canvas/Canvas.tsx` | Subscribe to the three events; spawn through the existing `Cmd+N` path. |
| `src/renderer/canvas/useViewport.ts` | `Cmd+N` uses the cached default template. |
| `scripts/verify-layout.cjs`, `scripts/verify-panels.cjs`, `scripts/verify-viewport.cjs`, `scripts/panels-entry.cjs` | The checks above and their wiring. |

## Success criteria

- Picking `Claude` from `New panel from preset ▸` opens a panel already running
  `claude` in that preset's directory, with no typing.
- `Save panel as preset` on a focused panel adds an entry that survives a
  relaunch, and picking it reproduces that panel.
- With `Codex` uninstalled, its menu entry is visibly disabled and says why;
  nothing spawns.
- `Cmd+N` with the shipped default is byte-for-byte today's behaviour: a login
  shell in `~`, centred on the camera.
- A `layout.json` with one corrupt preset opens with every other preset intact.
- `npm run verify` is green, including the new checks in three suites.
