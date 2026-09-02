# M40 — Broadcast input: the audit, and what it was missing

**Status:** designed 2026-09-01. Required for 1.0 by the scope amendment
(`2026-09-01-v1-scope-decision.md` §7, feature 2), which anticipated that
this might be an audit rather than a build.
**Backlog entry:** #21 (shipped as M31, under a commit message that never
said so).

## The audit

M31 shipped a live MODE, not a one-shot send, and it is the mode the brief
asks for. Measured against #21's own constraints:

| #21 asked for | M31 has | Verdict |
|---|---|---|
| Type once, every selected panel receives it | `registry.setInputTargets` fans every keystroke from any selected live terminal to all of them, through the one `pty:write` choke point | done |
| A loud, permanent indicator while active | a `role="status"` banner naming the target count | done |
| An obvious exit | the palette row's title flips to "Stop broadcasting input"; the banner says "open the palette to stop" | **weak** — the exit is two gestures away and the banner names it without offering it |
| `Cmd`-gated to enter and leave | no chord at all; the palette is the only door | **missing** |
| Never wake a dormant panel; skip-and-say | targets are the RUNNING members only, the count says how many, `verify:registry` 26 pins the skip | done |
| Raw bytes vs. "submit this prompt" | raw keystrokes, per panel decision left to the CLI — the honest default for a shell and an agent alike | done |
| A confirmation the first time | none | **declined**, see below |
| Drops when the selection can no longer sustain it | the effect disarms when fewer than two live members remain | done |
| Coverage | `verify:registry` 26 (routing), `verify:palette` broadcast-input.1 (the row) — nothing end to end | **missing** |

## Decisions

1. **A Stop control ON the banner.** The banner is the one thing on screen
   that says the mode is on, so it is where the exit belongs; it mounts
   `shellControl()` so pressing it never takes DOM focus off the terminal —
   a stop that blurred the agent would be a second surprise on the way out
   of the first.
2. **`Cmd+Shift+I` toggles the mode** (I for input), the same chord shape
   every canvas verb takes, matched on `event.code` for the Shift-rewrites-
   the-key reason the workspace chords record. `Cmd+Shift+B` was the obvious
   letter and is not free: `useShellChrome` matches `KeyB` without testing
   Shift, so it would toggle the file tree. Arming by chord goes through the
   SAME `toggleBroadcastInput` the palette row calls, and inherits its guard
   (fewer than two live selected terminals: no-op, and the row's disabled
   reason is where the user learns why).
3. **No first-time confirmation, and the reason is written down.** The mode
   is entered by a named row or a deliberate chord, its banner is
   unmissable, and `rm -rf` in six shells is a risk the banner's count
   states plainly; a confirm on a gesture the user just chose by name trains
   clicking through, which is the argument `confirmReset` already makes
   for the one dialog this app does have.
4. **One end-to-end check**: two live panels selected, the mode armed
   through the palette action, a real keystroke into one, and BOTH PTYs echo
   it; the banner's Stop pressed, and a second keystroke reaches ONE.

## What it must not break

- `pty.kill` two callers, `dispose` five sites — untouched.
- The mode stays UNPERSISTED (a relaunch must never resume broadcasting).
- `shouldIgnoreKeys`: the chord stands down while the palette or nav grid
  is open, like every other.

## Verification

- `verify:panels` `broadcast.1` per decision 4.
- `verify:palette`: unchanged (the row is already pinned).
- A source-text clause in `broadcast.1`'s detail is not needed: the Stop
  control is asserted by pressing it.
