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
| `REASON_TERMINAL_LIVE` | stop the terminal first — one front-end at a time | let the agent exit, or close its process; then Open as chat (M74) |
| `REASON_NOT_CLAUDE_SESSION` | only a terminal started as a claude session can open as chat | start the terminal from the Claude preset (a hand-typed `claude` has no pinned session, M17's rule) |
| `REASON_CHAT_BUSY` | the chat is still answering — interrupt it first | press Interrupt, then Open in terminal (M74) |
| `REASON_CHAT_EMPTY` | send a message first — an empty chat has nothing to move | send one message; the session then exists to resume |
| `REASON_NOT_CHAT` | only a chat panel can open in a terminal | focus a chat panel |
| `REASON_NO_SELECTION_TEMPLATE` | select the panels to save first | select the terminals and chats the template should hold (M80) |
| `REASON_NO_TEMPLATES` | no templates yet — select some panels and save them as one | save a selection; the built-in `review this repository` is always offered beside it (M80) |
| `REASON_CHAT_NO_BASELINE` | send a message first — a chat has no baseline until its agent runs | send one message; the runtime's create captures the baseline (M77) |
| `REASON_NO_APPROVALS` | no agent is asking for permission | nothing to do — the row exists so a person who types `allow` learns there is no open question (M76) |
| `REASON_NO_CLAUDE` | claude was not found on the login PATH — install it, or check the environment report | install `claude`; the same sentence disables the launcher's chat line and the chat panel's composer (M73) |
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
- **File / Jira / Toolbox nodes.** (M68: the Jira panel's no-credential note now carries a `Connect Jira…` verb that opens the palette's Credentials scope — the one note in this list that named a fix without offering it.) Editor save, comment, transition (Move…), refresh —
  each with a three-state result.
- **Integrations page (M89).** The navigator's fifth pane: one section per DECLARED service,
  present whether or not a credential exists, each with one of three closed sentences in its
  tone (`connected as <label>`, `not connected — add a … token`, `token rejected — add a new
  … token`) and ONE verb (`Connect…` / `Verify` / `Reconnect…`), the audit rows beneath with
  a named empty arm (`no calls yet — an agent reaches … with tc api …`), the skipped count
  said, and a note saying what the audit does not show (Jira's own panel reads). The palette's
  `Manage integrations…` door is present at rest and enters the Credentials scope.
- **GitHub work panel (M88).** Three states in the node — reading, the reason (with
  `Connect GitHub…` when it is `no-credential`, the same sentence the broker and the
  credential rows use, `REASON_NO_GITHUB`), and the list with its own empty arm and a note
  when only the pull requests could not be read. The palette's `Open GitHub work` row is
  PRESENT at rest and disabled with that reason, where the Jira door only exists once a
  credential does. `Start session` on every item; `open on GitHub` through the link verb.
- **The broker (M87).** No surface of its own: `tc api` answers a service with no
  credential with the same `not connected — add a <service> token in ⌘K › Credentials`
  sentence the panel rows use, an unknown service or method by name, and a path that could
  escape the service by name — each answer a row in the audit, so an agent's refused attempt
  is as visible as a served one. The URL door refuses the verb outright.
- **Cross-worktree review (M86).** The palette's `Review every worktree…` row is disabled
  with `REASON_NO_REVIEW_TARGET_ACROSS` when no panel inside a repository is captured and with
  `REASON_NO_WORKTREES` when this app has made none; inside the node, commit and discard are
  blocked by name (`one worktree at a time`) rather than absent, a worktree whose directory is
  gone is a section that says so, and the context pane's branch line is absent until asked,
  a phrase when git answered, and nothing (the note beneath explains) when it could not.
- **Vault pane (M85).** Three states before the list — no folder set (names the setting and
  offers `Choose a folder…`), reading, a folder that is not there (the reason, and the same
  verb) — then the list with its filter and a named empty arm for no notes and for no match;
  the cap reported under the list rather than notes silently missing. Inside a note, an
  unresolved `[[link]]` stays a link (dashed) that offers to create the note; the Backlinks
  section says `no note points here yet` rather than vanishing. No REASON_* constant: the
  pane's refusals are its own three arms.
- **Watcher node (M84).** Run now / Stop (the control is one or the other, never a disabled
  pair), the close, and three body states — never run (naming its trigger and the manual
  verb), a run that printed nothing, and the tail. A trigger that could not be armed says so
  in the body rather than leaving a node that silently never runs. Its palette door,
  `Watch…`, is disabled with `REASON_NO_WATCH_ROOT` when no panel with a directory is
  selected, and the trigger line re-prompts by name rather than guessing (a guessed trigger
  arms a real command against the wrong thing, and the user finds out by watching it never
  run).
- **Memory node (M83).** Refresh, the kind select, the add line and its `Add` verb, each
  refusal from the store rendered by name (`a memory needs text`, an unknown kind, a missing
  root), the named empty arm, and the skipped-line count. Its two doors — the palette's
  `Open memory…` row and the Files pane's memory control — are disabled with the SAME named
  reason (`REASON_NO_REPO_MEMORY`) when no panel with a directory is selected, never hidden;
  and the chat's first-send context is stated above the composer before it is sent, which is
  the one place in the app where a dead end would be a disclosure failure rather than a
  usability one.
- **Groups, merged view, first run, orphans, `tc`, the URL scheme.** Each refuses by name
  where it refuses (merged: every geometry write; `tc`: unknown preset / no default /
  missing cwd; the URL door: anything but `open`).

## Not walked

- **Pixels.** No suite sees a stray visual defect; the walk is by source. A pass over a
  real display at both themes and three widths is manual-only.
- **Native dialogs.** Reset, orphan recovery, save dialogs: manual-only.
- **Terminal contents.** What an agent CLI draws is its own; the app's accessibility
  statement (M44) says what the panels cannot offer.

- **M90.** `chat with codex` is present and disabled by name when codex is absent (the sheet); a codex chat's Interrupt mid-turn, its terminal door and an image attachment are each refused with a sentence naming the fix; a codex send with no codex configured is `refused-backend`, never a spawn of a bare name.
- **M91.** The launcher's `Chat with codex…` door is present and disabled by name when codex is absent; every launcher verb is an invitation with a hint naming where it lands.
- **M92.** Six palette rows for lock/unlock, pin/unpin, maximise/restore, each present and disabled naming the state; the ninth pin names the count and the fix; a locked panel's handles stay with the fix in their title; the frame's `fill` control is disabled by name in the merged view.
- **M93.** `Annotate…` is present and disabled by name while merged; the strip carries its exit; History shows three states (reading, none yet with the rule, a list) and Restore is disabled by name while merged; a corrupt snapshot is refused by name.
