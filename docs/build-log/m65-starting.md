# M65 — Starting a panel

**Status:** in progress, 2026-09-02.
**Branch:** `m65-starting`. **Spec:** `docs/superpowers/specs/2026-09-02-m65-starting-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m65-starting.md`.

One line: a spawn sheet in the palette (`New panel…`, `⌘⇧N`, the top bar's button, the
launcher's fifth line) answering where, what and how; a typed command becomes a focused task
panel titled with itself; main records the last twelve spawn directories; the launcher is a
panel-shaped card with prompt lines.

## What landed

- `spawn:sheet` and `spawn:recent` (invokes) and `spawn:open-sheet` (the menu's `⌘⇧N`);
  both diagrams; `verify:ipc`'s pin moved to 67 with its reason.
- `PaletteHandlers.spawnWith`: main resolves the preset (absent command stays absent) or
  wraps a typed command in `/bin/sh -lc`, refuses a directory that is not there (with
  `expandTilde`, NOT `resolveCwd` — see below), and sends `PRESET_SPAWN` with `title` and
  `focus` on the template. The renderer's `onSpawn` focuses the panel once it is in state.
- `layout.json`'s `recentDirectories`: parsed with the absent/malformed/per-entry rules,
  capped at twelve, recorded in the `pty:create` handler so every spawn counts.
- `palette/spawn-sheet.ts` (pure): `buildSpawnRequest`, `directorySuggestions`;
  `SpawnSheet.tsx`; `InputMode.kind = 'sheet'`; `beginSpawnSheet` in the actions.
- `PresetListRow` carries `agent` and `cwd` so the sheet knows an agent preset and its home.
- The launcher: a `.pf` card with a chrome row and a well, mono prompt lines, the fifth line
  opening the sheet; the gesture hints left to the strip.
- Checks: `verify:layout recent.1/.2`, `verify:palette sheet.1/.2` (48 restated for the
  sheet's chord), `verify:panels sheet.3/.4` (76 restated: the button opens the sheet and
  Enter in it spawns exactly one panel).

## Decisions not visible in the diff

- **`expandTilde`, not `resolveCwd`, for the sheet's directory.** `resolveCwd` falls back to
  the home directory when a path is missing — right for a restored panel whose directory
  went away, and exactly wrong for a typed path: the first `sheet.3` run spawned two panels
  at `~` from a typo and refused nothing. The refusal now names the path.
- **An untouched default does not filter the suggestions.** With `/tmp` as the preset's
  default the list filtered itself to nothing; a default the user did not type is a value,
  not a query.
- **Enter is handled once.** The where field's own handler and the form's both saw the same
  event; the first run of check 76 spawned two panels per Enter.
- **The focused panel from the menu.** With the palette closed there is no captured id; the
  registry's `lastFocusedAt` names the panel the user was last in, which is the honest
  reading of "the focused panel's directory" from a menu.
- **Check 112 went red once** in a run where the sheet checks were being added and passed on
  the next run alone; recorded as a load flake beside 157.

## The critic

(pending)

## The verifier

(pending)
