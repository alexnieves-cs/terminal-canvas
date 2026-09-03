# M65 — Starting a panel

**Status:** design, 2026-09-02. **Branch:** `m65-starting`.
**Brief principles built against:** §6 "starting a panel", 3 (identity), 7 (three states), 9
(copy). Feature and surface: shot, looked at, critiqued.

## What this milestone is for

Starting a panel today is one of: `⌘N` (the default preset, in the preset's directory), a
preset row in the palette (same), or a launcher tile (same). The question the daily user
actually answers by hand — *where*, then *what*, then *how* — has no surface: they open a
shell, `cd`, and type `claude --permission-mode plan`. The one-off task (`npm test` in a
panel of its own) has no surface at all and the previous scope decision cut it on a
collision this document resolves.

## Design

### The spawn sheet

A second palette mode beside the single-field input: `InputMode.kind = 'sheet'`, a short
form rendered in the palette's body. Fields, top to bottom:

| field | what | default |
|---|---|---|
| **what** | a preset (choice) or a typed one-off command (text) | the default preset |
| **where** | a directory (text, with suggestion rows) | the focused panel's live cwd, else the preset's |
| **title** | optional (text) | empty — the honest label applies |
| **mode / effort / model** | choices, shown only when *what* is an agent preset | the preset's |
| ~~**worktree**~~ | struck while building (2026-09-02): "shown only when *where* is a git repository" needs a main-side git check on every keystroke, a milestone of its own. The preset's own worktree flag still rides through `templateOf`; the request carries `worktree` for a later field. | — |

Keys: `Tab`/`Shift+Tab` move between fields; `↑`/`↓` in *where* walk its suggestions and
`Tab` or `Enter` accepts the highlighted one; `Enter` anywhere else spawns; `Escape` cancels
(one stage — a sheet is not a scope). *Where* is the first field and holds focus on open,
its default selected (amended after the critic: the sheet led with *what*). The suggestion rows under *where* are, in order: the focused panel's live directory,
the recent directories (main keeps the last twelve spawn cwds in `layout.json`, absent-or-
malformed rules, read over one new invoke `spawn:recent`), then every open panel's directory;
typing filters them contiguously. A directory that does not exist is refused at submit with
the reason in the sheet, not spawned into.

Submit sends a `SpawnRequest` to main (`spawn:sheet`), where ONE pure function
(`main/spawn-request.ts`, run by main and by the verify harness alike) resolves the preset
or the typed command into a `PresetTemplate`, refuses a path that is not a directory, and
sends `PRESET_SPAWN` — the channel the menu already uses — so the renderer's `onSpawn`
places it by `cascadeCentre`, enters `History`, and FOCUSES it (`template.focus`). Amended
after the verifier: the first draft said the template was built renderer-side; building it
in main is what keeps an absent command absent through main's own `templateOf` and keeps
the sheet and the menu on one path. A focused panel is promoted live unconditionally by
`assignTiers`, which is what makes the typed-command case spawn immediately without a
"spawn at a stated grid" door: it is not a camera-initiated spawn, it is a focus-initiated
one, and focus already outranks the budget.

**Absent stays absent.** The sheet never fills in a command for a preset whose command is
absent (the login shell); it passes the template through with the key missing, the rule M5a
pins in four layers.

### The typed command — a task panel

When *what* is a typed command, the template is `{ cwd, command: '/bin/sh', args: ['-lc',
cmd] }` and the title defaults to the command itself. The pill reads `exited N` when it ends
(the vocabulary already says so). Nothing else is special about it: it is an ordinary panel
whose process is a command rather than a shell. (A first draft claimed a run-ledger row;
struck: the ledger is fed by OSC 133 marks, which a bare `sh -lc` does not emit.)

### The doors

- `New panel…` row in the palette's New panel section (first row); `⌘⇧N`.
- The top bar's button becomes `New panel…` and opens the sheet; `⌘N` stays the instant
  default and its chip moves to the palette's `New panel from <default>` row.
- The launcher's lines: `New panel…` leads (the line that asks where comes before the ones
  that spawn at `~`); each preset line still spawns instantly (one click to a working panel
  is the launcher's promise).
- The launcher is reshaped per the brief: a panel-shaped card with a chrome row and a well,
  its verbs as mono prompt lines, the environment line inside the well, the gesture hints
  left to the hint strip.

### What it must not break

- `preset:spawn-by-id` and the menu path are untouched; the sheet adds one mutating
  invoke (`spawn:sheet`) that ends on the menu's own channel, and one read-only invoke.
- `⌘N` keeps its behaviour and its undo shape (`verify:panels` 19/21).
- The palette's four focus rules (`usePalette`) — the sheet is the same overlay and the same
  input ownership.

### Checks

- `verify:layout recent.1` — `recentDirectories` parses with absent/malformed/per-entry rules
  and is capped at twelve, most recent first, deduplicated.
- `verify:palette sheet.1` — the `New panel…` row exists at rest, first in its section, and
  the `⌘N` row names the default preset; `sheet.2` — `buildSpawnRequest` (pure, renderer):
  a preset request never carries a command, agent options ride only for an agent preset, a
  typed command is titled with itself. `verify:layout spawn.1` — `resolveSpawnRequest`
  (pure, main): an absent command stays absent, `/bin/sh -lc` for a task, options merge
  onto an agent preset only, a file or a missing preset is refused with a reason.
- `verify:panels sheet.3` — `⌘⇧N` opens the sheet, typing a command and Enter spawns a
  live, focused panel titled with the command at the viewport centre whose pill later reads
  `exited 0`; `sheet.4` — the *where* field lists the focused panel's live cwd first and a
  chosen recent directory is the spawned panel's cwd.
- `verify:ipc` covers the new channel by construction; both IPC diagrams gain the line.
