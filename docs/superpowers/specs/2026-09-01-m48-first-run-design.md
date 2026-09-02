# M48 — First run, and every empty state

**Status:** designed 2026-09-01. Criterion 2 of the 1.0 brief.
**Backlog entries:** #38 (first run), #47 (the environment report), and the
"M23" spec's §8.

## What this milestone is for

A fresh install boots `firstRunPanels()` — one centred placeholder on a grey
field with a zoom percentage in the corner — and every canvas shortcut is
`Cmd`-gated by design, so nothing on that screen teaches anything. The
brief's second criterion is that a stranger reaches a working panel running
THEIR agent CLI and understands the canvas, panels, workspaces and the
palette without the README. Adjacent and cheaper than any of that: when the
login-shell probe fails, every panel says "command not found" with no
explanation anywhere the user can see.

## Decisions

### 1. Keyed on `panels.length === 0`, never on "nothing running"

A restored canvas has no output and no processes until its panels are
woken, so a first-run state keyed on activity would appear on top of a
perfectly good workspace. The launcher shows when the ACTIVE workspace
holds no panels — which is a fresh install, a reset, and an emptied
workspace, all of which want the same thing. `firstRunPanels()` stops
minting a placeholder panel: an empty canvas is now a designed state.

### 2. Not a tour: a launcher card, in the canvas, made of the real verbs

Centred in the canvas (outside `.world`, so it never scales), the launcher
offers what the palette's New panel section offers, through the SAME
actions — `spawnPreset` for each available preset (Claude, Codex, a login
shell, "Claude in a fresh worktree"), `openFile`, `newNote` — so a panel
minted here is indistinguishable from one minted by `⌘N`. A preset whose
command is not on PATH is present and disabled with its reason (the same
`REASON_NOT_ON_PATH`), with one line saying what to install; the card
therefore also answers "why does Claude not appear".

### 3. A gesture-hint strip, until each gesture has been used

Bottom-centre, four hints — pan (two-finger drag), zoom (pinch or `⌘=`),
`⌘K` the palette, `⌘N` a new panel — each fading permanently the first time
its gesture is used, persisted in the settings map as `hints.seen`
(a string-list setting, the second customer of a non-boolean type). A hint
that comes back on every launch is nagging; one that never appears is a
README.

### 4. The environment report, and the probe banner

`main` already resolves the login environment, probes tmux, and logs which
of `claude`, `codex` and `git` it found and where — to stdout, which nobody
sees. One invoke, `env:report`, returns those facts: the resolved PATH's
entries, each CLI's path or absence, tmux's version or the fallback reason,
the layout file's path, whether a `.bak` was written, and the time the probe
ran (a `brew install` mid-session is invisible until relaunch, and a report
that does not say when it looked would turn that limit into a lie). Key
NAMES only, never values — #31's rule for the login environment. It renders
as the palette's `Environment…` scope and as the launcher's "found / not
found" line. When the shell probe FAILED, a one-line banner at the top of
the canvas names the cause and points at the report — worth more than the
rest of this milestone to the person it happens to.

### 5. Every empty state, and the list is finite

| Surface | Today | Now |
|---|---|---|
| Panels navigator, no panels | nothing under the heading | "no panels — ⌘N to start one" |
| Files navigator, no cwd | nothing | which panel is selected and why there is nothing to list |
| Worktrees scope, none | disabled door (M37) | unchanged |
| Search scope, before typing / no hits / off | three states (M42) | unchanged |
| Context pane, nothing selected | the summary | unchanged, plus a hint line "select a panel to inspect it" |
| Attention popover, empty | — | "nothing waiting" |

## What it must not break

- **Dormancy**: the launcher never appears over a canvas with dormant
  panels (decision 1); `verify:panels`' seeded canvases never see it.
- **The real create path**: a hardcoded first-run panel is `SEED_PANELS`
  with a nicer name; the launcher calls `paletteActions` only.
- **`verify:ipc`** moves by one (`env:report`).

## Verification

- `verify:layout` `firstrun.1`: `hints.seen` parses as a string list,
  rejects a non-list, defaults empty.
- `verify:palette` `firstrun.1`: the Environment scope's rows from a
  report fixture, and each CLI row's found/absent rendering.
- `verify:panels` `firstrun.1`: a canvas booted with zero panels shows the
  launcher; pressing its Claude control spawns through `preset:spawn-by-id`
  (the harness's real handler) and the launcher leaves; `firstrun.2`: a
  canvas restored with one DORMANT panel shows no launcher; `firstrun.3`: a
  hint fades after its gesture and stays faded across a reload; `env.1`: a
  report with a failed probe renders the banner.
- `verify:meta` 14 against both diagrams.
