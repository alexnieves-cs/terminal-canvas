# M48 — First run, and every empty state

**Status:** finished 2026-09-02.
**Branch:** `m48-first-run`. **Spec:** `docs/superpowers/specs/2026-09-01-m48-first-run-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-01-m48-first-run.md` (written this session; the spec had none).

One line: an empty canvas is a designed state with a launcher made of the real verbs, four
gesture hints that fade for good, an environment report one ⌘K away, and a banner when the
login shell could not be read.

## What landed

- `main/env-report.ts` (pure): PATH entries, each CLI found or absent, the probe's outcome and
  reason (`shellProbeOutcome()`, recorded where the failure used to be swallowed), tmux's choice,
  the layout file and whether a `.bak` was written, env key NAMES only, `probedAt`. `env:report`
  invoke with an inert default in `registerIpcHandlers`; both diagrams.
- `hints.seen`: the `'list'` setting type (`SettingValue` gains `string[]`), dropped with a
  warning on both doors when not a list of strings; the palette mints no row for a list.
- The Environment scope: `buildEnvironmentRows(report)` — a door and one information row per
  fact — `PaletteScope` `'environment'`.
- `Launcher.tsx` when the active canvas holds no panels (never merged); `firstRunPanels()`
  returns `[]`; `HintStrip.tsx` with fades observed off state; the probe banner; the Files pane's
  no-cwd reason; the context pane's hint line.
- Checks: `verify:tmux env.1`, `verify:layout firstrun.1`, `verify:palette firstrun.1`,
  `verify:panels firstrun.1/.2/.3, env.1`, and `verify:meta claude-md.1`.

## Snags

- `firstrun.2` (no launcher over a dormant panel) is a NEGATIVE and passed before the launcher
  existed, as its comment says; it is a regression guard, trustworthy only now that `firstrun.1`
  has been watched red (no launcher, no preset controls) and then green.

- **CLAUDE.md was empty on main.** The M47 commit's edit script opened the file for writing
  before reading it and truncated it to zero bytes; verify:meta 19 pins README's diagram, not
  this file, so nothing noticed. Restored from the M46 merge with M47's lines re-applied and
  landed as `fix(m47)` on main before M48's work; `claude-md.1` now fails the build if the file
  does not carry every invoke channel, which is only true of a file that exists.
