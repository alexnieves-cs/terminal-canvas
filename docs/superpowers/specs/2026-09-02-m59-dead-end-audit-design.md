# M59 — The dead-end audit

**Status:** designed 2026-09-02. Criterion 1 of the 1.0 brief: "Nothing a
user can reach is a dead end. Every surface finished; every affordance that
cannot work is present and disabled with a named reason." The scope
decision's row adds: "the drop-on-panel handoff; the stray visual defects
found on the way."

## Method

Every surface is WALKED, and the walk is written down
(`docs/dead-end-audit.md`): for each surface, its states, and for each
state either what happens or the named reason nothing does. The walk is by
source and by the suites — the harness drives a real renderer, and the
palette suite drives every row against every context — because no
automated walk can see a stray pixel; what could not be seen is recorded
as not walked, not as clean.

Surfaces: the palette (every static row, every dynamic family, every
scope, every input mode), the rail (rows, controls, sections, the
attention list and its popover), the context pane (three tabs, six
actions, the runs list, the changes section), the top bar and dock, the
HUD, the launcher and hint strip, the menu, the keyboard map, the drop
door, the review node's controls, the file/jira/toolbox nodes' controls,
the group frame, the merged view, the first run, the URL scheme and `tc`.

## What the walk found, and what this milestone fixes

1. **A file dropped ON a terminal panel opened a file panel over it.** The
   drop door hit-tests nothing: every drop mints a file panel at the
   cursor. A user who drags a file onto an agent's terminal means "give
   this to the agent". Fix: the drop point is hit-tested against the
   panels; over a TERMINAL panel the path is PASTED into it (bracketed,
   the same door Jira context uses); anywhere else, the file panel as
   today. The handler and a test hook share one function.
2. **A drop while the palette or nav grid was open minted a panel unseen
   underneath it** (the handler's own comment records it as "worth a note,
   not a fix"). Fix: a drop while an overlay is open is ignored; the note
   becomes a check.
3. **Bookmarks could not be renamed** ("View 1" forever, and the only way
   out was delete). Fix: a `Rename bookmark…` row per bookmark behind the
   palette's input mode, exactly as presets rename.
4. **A structural check that the rule holds everywhere at once**: for a
   matrix of contexts (nothing focused, a sessionless kind focused, merged,
   scrollback off, no presets, no workspaces), every disabled row carries
   a non-empty reason and no two reasons on one row collide — so the next
   row added without a reason turns a suite red.

Things the walk found FINISHED, listed in the audit so the next walk does
not repeat them; and things it could not walk (real dialogs, a real
display's pixels), listed as such.

## Verification

- `verify:panels drop.1` a path dropped over a live terminal panel arrives
  in its PTY as a paste and opens no file panel; the same path dropped
  over empty canvas opens a file panel; a drop with the palette open does
  neither.
- `verify:palette rename.1` the bookmark rename row exists per bookmark
  and begins the rename input; `audit.1` the reason matrix.
- `docs/dead-end-audit.md` exists and `verify:meta` pins that every
  palette `REASON_*` constant is named in it (a reason nobody wrote down
  is a reason nobody reviewed).
