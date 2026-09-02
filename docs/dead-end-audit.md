# The dead-end audit (M59)

Criterion 1 of the 1.0 brief: nothing a user can reach is a dead end — every surface
finished, every affordance that cannot work present and disabled with a named reason.
This is the walk, written down so the next one does not repeat it. Walked by source and by
the suites (the harness drives a real renderer; the palette suite drives every row against
every context); what a walk by source cannot see is listed at the end as NOT walked.

## The rule, and where it is enforced

A row or control that cannot work is DISABLED with a reason a person can act on, never
absent — a missing row is indistinguishable from a feature never built. `verify:palette
audit.1` pins it structurally across six contexts (nothing focused; a sessionless kind
focused; the merged view; scrollback off; no note root; no environment report): every row
has a title and a `run`, and every disabled row names a non-empty reason. `verify:meta
audit.1` pins that every `REASON_*` constant in `palette/commands.ts` is named in this
file, so a reason nobody wrote down is a reason nobody reviewed.

## The palette's reasons, each with the fix it points at

| Constant | Reason shown | What the user does |
|---|---|---|
| `REASON_NO_FOCUS` | click into a panel first | click into a terminal panel |
| `REASON_NOT_STARTED` | that panel has not started | start it (click the card, or its rail row's ▶) |
| `REASON_NOT_TERMINAL` | only a terminal panel has a font size | focus a terminal panel |
| `REASON_NOT_TERMINAL_OUTPUT` | only a terminal panel has output to export | focus a terminal panel |
| `REASON_NOT_AN_AGENT` | that panel is not running a known agent | the mode rows are for claude/codex sessions |
| `REASON_NO_SELECTION` | select some text in a panel first | drag-select in the terminal |
| `REASON_NO_PANELS_SELECTED` | select panels with a rubber-band drag first | marquee on the canvas |
| `REASON_MERGED_READ_ONLY` | the merged view is read-only — leave it to move panels | `⇧⌘A` |
| `REASON_TIDY_NEEDS_TWO` | needs two panels on the canvas | spawn another |
| `REASON_GROUP_NEEDS_TWO` | select at least two panels to make a group | marquee two |
| `REASON_NOT_IN_GROUP` | the focused panel is not in a group | focus a panel inside a group frame (M61: the Card/Expand and Remove group rows) |
| `REASON_BROADCAST_NEEDS_TWO` | select at least two live terminal panels | marquee two live ones |
| `REASON_NOTHING_TO_LINK` | this canvas has only one panel | spawn another |
| `REASON_ALREADY_ACTIVE` | already the active workspace | — (informational) |
| `REASON_ALREADY_DEFAULT` | already the default | — (informational) |
| `REASON_NOT_ON_PATH` | not found on PATH | install the CLI; the Environment rows say which |
| `REASON_BUILT_IN_RENAME` | built-in presets can't be renamed | save your own preset (`Save panel as preset`) and rename that |
| `REASON_BUILT_IN_DELETE` | built-in presets can't be deleted | — (they are the floor the launcher stands on) |
| `REASON_BUILT_IN_WORKTREE` | built-in presets can't ask for a worktree | save your own preset, then toggle its worktree |
| `REASON_NO_PROMPTS` | no prompts saved yet | `Save prompt…` |
| `REASON_PROJECT_PROMPT` | this prompt is a file in your project | edit the file under `.claude/commands` |
| `REASON_NO_WORKTREES` | no worktrees yet — spawn a panel from a preset that asks for one | preset → worktree |
| `REASON_WORKTREE_ATTACHED` | a panel is still running in it — close that panel first | close the panel |
| `REASON_NO_NOTE_ROOT` | select a panel first — a note is saved in its directory | select a panel |
| `REASON_NO_ENV_REPORT` | the environment has not been read yet | wait for startup; relaunch |
| `REASON_SEARCH_OFF` | scrollback is off — turn on Keep output for search to read | Settings → scrollback.persist |
| `REASON_SEARCH_NO_MATCHES` | try another word | change the query |
| `REASON_SCROLLBACK_OFF` | durable scrollback is off — turn on scrollback.persist in Settings | Settings → scrollback.persist |

## Surfaces walked, and their states

- **Palette.** Eight sections plus Bookmarks (M56), five scopes (workspaces, credentials,
  worktrees, environment, search), three input modes (text, confirm, number). Every row
  is one of: runs; disabled with a reason above; or an informational row (`Environment…`).
  Dynamic families: presets (spawn/rename/delete/default/worktree; built-ins refuse
  rename/delete by name), prompts (insert/delete; project prompts refuse delete by name),
  panels (goto, mode), workspaces (switch/rename/delete/move), credentials
  (set/verify/delete), worktrees (reveal/remove), bookmarks (go/rename/delete), search hits.
  **Found:** bookmarks could not be renamed — fixed (M59, `bookmark.rename.*`).
- **Rail.** Panel rows (rename, close, ▶ start for dormant — always visible), workspace
  rows, the attention list with its empty state ("nothing wants you"), sections that
  collapse. Every control is present at rest and revealed on hover or focus-within.
- **Context pane.** Detail / Work / Tools tabs; six actions (rename, close, link, restart,
  review, save-preset); restart and review disabled with a reason on a non-terminal or a
  never-started panel; the runs list (M52) and the changes section (three-state).
- **Top bar, dock, HUD.** New panel (`⌘N`), Search (`⌘K`), Settings, merged toggle,
  context toggle, fit / zoom in / zoom out, the attention badge with its popover.
- **Launcher and hint strip (M48).** Every preset control present; a missing CLI named
  with what to install; the note verb disabled with a reason without a root; four hints
  that fade for good.
- **Menu.** File (new panel from preset, save panel as preset, reset canvas…), Edit (undo,
  redo, copy, paste), View. Reset confirms; undo cannot remove a running agent without
  the confirm path applyHistory carries.
- **Keyboard.** `⌘N ⌘K ⌘F ⌘0 ⌘1 ⌘= ⌘- ⌘J ⇧⌘J ⇧⌘[ ⇧⌘] ⇧⌘A ⌘\ ⌘[ ⌘]`, arrows and
  Enter on the canvas (M44), Escape as two-stage in the palette.
- **Drop door.** **Found:** a file dropped over a terminal opened a file panel over it, and a
  drop with an overlay open minted a panel unseen — both fixed (M59): over a live terminal
  the path is pasted; with the palette or nav grid open the drop is ignored.
- **Review node.** Refresh, commit (blocked by name on shared), per-file discard (M53,
  blocked by name on shared), the armed sentences, outcome lines.
- **File / Jira / Toolbox nodes.** Editor save, comment, transition (Move…), refresh —
  each with a three-state result.
- **Groups, merged view, first run, orphans, `tc`, the URL scheme.** Each refuses by name
  where it refuses (merged: every geometry write; `tc`: unknown preset / no default /
  missing cwd; the URL door: anything but `open`).

## Not walked

- **Pixels.** No suite sees a stray visual defect; the walk is by source. A pass over a
  real display at both themes and three widths is manual-only.
- **Native dialogs.** Reset, orphan recovery, save dialogs: manual-only.
- **Terminal contents.** What an agent CLI draws is its own; the app's accessibility
  statement (M44) says what the panels cannot offer.
