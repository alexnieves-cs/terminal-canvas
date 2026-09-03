# M65 — Starting a panel

**Status:** finished 2026-09-02.
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

Handed the brief and three images (launcher, sheet, palette); 25 findings.

**Accepted and fixed in M65**

- 17 — WHERE leads and holds focus with its default selected; Enter starts the default
  there in one key.
- 1 — the mode/effort/model fields read "preset's": the preset's own values are now the
  placeholders (`PresetListRow.agentOptions` rides for that), labelled `mode`/`effort`.
- 2 — the summary line cut the path from the right; it and every suggestion cut from the
  left through `shortPath`.
- 10 — the second suggestion had no provenance; every suggestion says `focused panel`,
  `recent` or `open panel`.
- 12 — the agent row is one label (`how`) and three controls in the field column.
- 6, 19, 21 — one name: `New panel…` on the top bar, the sheet, the launcher's first line
  and the palette row; the sheet's foot says `⌘N starts the default without asking`.
- 8, 22 — the launcher's onboarding sentence and the "an empty canvas" chrome hint are gone.
- 15 — the sheet's title is `--t-lg`.
- 16 — a preset line's hint reads `in ~`.
- 20 — on the launcher the note line says `start a panel first`.
- 5 (half) — the `what` select is in the mono face and its open option reads `type a
  command…`.

**Accepted and scheduled**

- 3, 4 (dot grid, resting shadows) — M67. 13, 14 (the list clips mid-row; ten Go-to rows
  push `New panel…` below the fold) — M66 decides the resting cap. 11 (the suggestion list
  covers the fields below) — M66, with the drawer work.

**Rejected, with the reason**

- 5 (a combobox instead of a select) — a closed list plus one open option is what a select
  says honestly; the open option is named for what it does.
- 7 (lower-case verb names) — preset names are the user's own data; the launcher shows them
  as named. The prompt-line `>` and the mono face carry the brief's intent.
- 9 (the palette says "click into a panel first" while the strip names a selected panel) —
  selection is not focus, and the strip's token is labelled `selected`; the palette's rows
  act on the FOCUSED panel by a rule M5b pins. The reason names the gesture that would work.

**Kept** — 23–25.

## The verifier

Every promise confirmed except two the spec had wrong, now struck in it: the worktree field
(never built; needs a git check per keystroke) and the task panel's run-ledger row (the
ledger is fed by OSC 133, which `sh -lc` does not emit). Acted on:

- `sheet.4` asserted `… || true` and compared a suggestion's text after `shortPath` had
  shortened it — vacuous and stale. It now reads the suggestion's `title` (the full path),
  its provenance, and the spawned panel's real cwd from the PTY list.
- The harness's `spawnWith` duplicated main's logic with its own refusal string. One pure
  function, `main/spawn-request.ts`, now runs in both, and `verify:layout spawn.1` pins it.
- `existsSync` accepted a file; the resolver takes an injected `isDirectory`.
- Recents recorded the unresolved `spec.cwd` (`~`); the handler records `resolveCwd(cwd)`.
- Docs drift (suite counts in two places, dead `.launcher__keys`) fixed; the build log's
  status and the README row now agree.
- Declined: `sheet.3`'s "focused" reads `.panel--selected` — selection is the observable the
  suite has, and `onSelectPanel` is one function; a live/budget discriminator needs eight
  live panels and is M69's overview fixture, not this check's.
