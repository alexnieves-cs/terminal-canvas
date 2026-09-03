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
| **worktree** | on/off, shown only when *where* is a git repository the app can check | the preset's |

Keys: `Tab`/`Shift+Tab` move between fields; `↑`/`↓` in *where* walk its suggestions and
`Tab` accepts one; `Enter` anywhere spawns; `Escape` cancels (one stage — a sheet is not a
scope). The suggestion rows under *where* are, in order: the focused panel's live directory,
the recent directories (main keeps the last twelve spawn cwds in `layout.json`, absent-or-
malformed rules, read over one new invoke `spawn:recent`), then every open panel's directory;
typing filters them contiguously. A directory that does not exist is refused at submit with
the reason in the sheet, not spawned into.

Submit builds a `PresetTemplate` and calls the ordinary `onSpawn(centre, template, {title})`
— the path `⌘N` and the menu already take — so the new panel is placed by `cascadeCentre`,
enters `History`, and is FOCUSED. A focused panel is promoted live unconditionally by
`assignTiers`, which is what makes the typed-command case spawn immediately without a
"spawn at a stated grid" door: it is not a camera-initiated spawn, it is a focus-initiated
one, and focus already outranks the budget.

**Absent stays absent.** The sheet never fills in a command for a preset whose command is
absent (the login shell); it passes the template through with the key missing, the rule M5a
pins in four layers.

### The typed command — a task panel

When *what* is a typed command, the template is `{ cwd, command: '/bin/sh', args: ['-lc',
cmd] }` and the title defaults to the command itself. The pill reads `exited N` when it ends
(the vocabulary already says so) and the run ledger has its row. Nothing else is special
about it: it is an ordinary panel whose process is a command rather than a shell.

### The doors

- `New panel…` row in the palette's New panel section (first row); `⌘⇧N`.
- The top bar's button becomes `New panel…` and opens the sheet; `⌘N` stays the instant
  default and its chip moves to the palette's `New panel from <default>` row.
- The launcher's lines: each preset line still spawns instantly (one click to a working
  panel is the launcher's promise); a fifth line `Choose where and what…` opens the sheet.
- The launcher is reshaped per the brief: a panel-shaped card with a chrome row and a well,
  its verbs as mono prompt lines, the environment line inside the well, the gesture hints
  left to the hint strip.

### What it must not break

- `preset:spawn-by-id` and the menu path are untouched; the sheet is a renderer-side
  template built from rows the renderer already holds plus one read-only invoke.
- `⌘N` keeps its behaviour and its undo shape (`verify:panels` 19/21).
- The palette's four focus rules (`usePalette`) — the sheet is the same overlay and the same
  input ownership.

### Checks

- `verify:layout recent.1` — `recentDirectories` parses with absent/malformed/per-entry rules
  and is capped at twelve, most recent first, deduplicated.
- `verify:palette sheet.1` — the `New panel…` row exists at rest, first in its section, and
  the `⌘N` row names the default preset; `sheet.2` — `buildSheetTemplate(fields)` (pure):
  a preset with an absent command stays absent, a typed command becomes `/bin/sh -lc`, the
  agent options ride only for an agent preset, the title rides only when typed.
- `verify:panels sheet.3` — `⌘⇧N` opens the sheet, typing a command and Enter spawns a
  live, focused panel titled with the command at the viewport centre whose pill later reads
  `exited 0`; `sheet.4` — the *where* field lists the focused panel's live cwd first and a
  chosen recent directory is the spawned panel's cwd.
- `verify:ipc` covers the new channel by construction; both IPC diagrams gain the line.
