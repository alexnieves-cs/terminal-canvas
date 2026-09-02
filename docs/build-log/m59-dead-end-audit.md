# M59 — The dead-end audit

**Status:** finished 2026-09-02.
**Branch:** `m59-dead-end-audit`. **Spec:** `docs/superpowers/specs/2026-09-02-m59-dead-end-audit-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m59-dead-end-audit.md`. Criterion 1.

One line: every surface walked and written down in `docs/dead-end-audit.md`; the three dead
ends the walk found fixed (drop-on-panel handoff, drops under an overlay, bookmark rename);
two structural checks keep the rule true.

## What landed

- `docs/dead-end-audit.md`: the walk, every palette reason with the fix it points at, what
  was found finished, what could not be walked.
- `Canvas.tsx`: `dropPath` — one function behind the real drop and `__m59Drop`; over a live
  terminal the path is pasted (shell-quoted, bracketed); with the palette or nav grid open
  the drop is ignored; otherwise a file panel at the drop's world point, as before.
- Palette: `Rename bookmark…` per bookmark through the input mode presets use.
- Checks: `verify:panels drop.1`, `verify:palette rename.1` and `audit.1` (six contexts,
  every disabled row names a reason), `verify:meta audit.1` (every `REASON_*` is in the audit).

## Snags

- `audit.1` passed on its first run: the invariant already held everywhere. Recorded rather
  than faked red — it is a guard for the next row, not evidence about this one.
- The drop check first observed the paste in the log tail, where a prompt line without its
  newline is not yet a line; it now observes the manager's write.

- Check 112 (the inspector's review button minting one node) failed three runs out of four
  on this branch. A diagnostic added to its detail showed the button `null` at the 5s mark
  and present when the pane was probed a moment later: the button appears once
  `review:panel` (a git call) answers, and under the full chain, with the panels suite last
  on a loaded machine, that took longer than 5s. The wait is now 15s, matching check 113's
  own git-bound wait; the diagnostic stays.

## Not proven

- Pixels and native dialogs, as the audit's "Not walked" section says.
