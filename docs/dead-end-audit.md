# The dead-end audit (M59, walked again in M94)

Criterion 1 of the 1.0 brief: nothing a user can reach is a dead end — every surface
finished, every affordance that cannot work present and disabled with a named reason.
This is the walk, written down so the next one does not repeat it — walked first at 1.0
(M59) and again at 2.0 (M94), after M71–M93 added nine panel kinds' worth of surface, a
second headless backend, a broker, three layout verbs and a time machine. The M94 walk
kept the M59 entries that still describe the app, folded the per-milestone lines that had
accreted at the end into their surfaces, and added a section the first walk did not have:
keyboard reach, checked by a REAL Tab rather than by reading the markup. Walked by source and by
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
| `REASON_NO_FOCUS_SELECTED` | selecting a panel is not focusing it — click into it first | click into the selected panel (M399: the focus reason while the HUD says "N selected") |
| `REASON_NOT_STARTED` | that panel has not started | start it (click the card, or its rail row's ▶) |
| `REASON_NOT_TERMINAL` | only a terminal panel has a font size | focus a terminal panel |
| `REASON_NOT_TERMINAL_MARKS` | only a terminal panel marks its commands | focus or select a terminal panel (M399: the prompt-mark rows had borrowed the font-size sentence) |
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
| `REASON_UNREAD_PRESET` | from a pack, not read yet — choose "I've read this preset" first | the `preset.read.<id>` row beside it, whose subtitle is the command and directory (M253) |
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
| `REASON_NOTHING_TO_EXPORT` | this panel has never started, and scrollback is off — turn on scrollback.persist in Settings, or start the panel first | start the panel, or Settings → scrollback.persist |

## Surfaces walked, and their states

### The 1.0 surfaces, still as M59 found them

- **Palette.** Eight sections plus Bookmarks, the scopes (workspaces, credentials, worktrees,
  environment, search), the input modes (text, confirm, number, secret, sheet). Every row is
  one of: runs; disabled with a reason above; or informational. Dynamic families: presets,
  prompts, panels, workspaces, credentials, worktrees, bookmarks, search hits, templates.
- **Rail.** Panel rows (rename, close, ▶ start for dormant — always visible; M92's lock and
  pin marks after the label), workspace rows, the attention list with its empty state,
  sections that collapse. Every control is present at rest and revealed on hover or
  focus-within.
- **Context pane.** Detail / Work / Tools tabs; the action bar (restart, lock/unlock,
  pin/unpin, fill/restore, the front-end verb, rename, save-preset, link, close); restart and
  the front-end verb disabled with a reason on a non-terminal or a never-started panel; pin
  disabled with the SAME sentence the palette row shows (`pinRefusal`); the runs list and the
  changes section, each three-state.
- **Top bar, dock, HUD.** New panel, Search, Settings, merged toggle, context toggle, fit /
  zoom in / zoom out, the attention badge with its popover.
- **Launcher and hint strip.** Every preset control present as an invitation (`Start …`); a
  missing CLI named with what to install; `Chat with Claude…` and `Chat with Codex…` each
  disabled by name when its CLI is absent; the note verb disabled with a reason without a
  root; four hints that fade for good.
- **Menu.** File, Edit, View. Reset confirms, and since M93 the dialog says how many
  snapshots exist and where to restore one.
- **Keyboard.** The chords, arrows and Enter on the canvas, Escape as two-stage in the
  palette — and see "Keyboard reach" below.
- **Drop door, review node, file / Jira / toolbox nodes, groups, merged view, first run,
  orphans, `tc`, the URL scheme.** As M59 recorded them; each refuses by name where it
  refuses.

### The surfaces this run added (M71–M93)

- **Chat panel (M73–M77).** A process kind: the composer's Send and Interrupt disabled by
  name (streaming, a question pending, no CLI on the PATH; codex's own interrupt reason),
  the `@`/`/` completions with a named empty arm, attachments with `remove`, a refused
  attachment shown whole, the approval question with Allow/Deny in the panel, the card's
  summary tier, the rail row, the popover and the pane; tool rows with a `diff` verb that
  is disabled by name without a baseline; `to terminal` disabled by name mid-turn, on an
  empty chat, and on a codex chat (the door is `claude --resume`).
- **The second backend (M90).** `chat with codex` in the sheet and the launcher, disabled by
  name when absent; the chrome names the backend; an image on a codex send is refused by
  name; a codex send with no codex configured is `refused-backend`, never a bare spawn.
- **Edges, runs, templates (M78–M80).** An edge's trigger and label in the pane, remove on
  hover and on the pane, a cycle refused by name; Runs with `Run again` (a chat root skipped
  by name); templates in the sheet with one field per parameter and a refusal naming the
  missing preset or CLI; a built-in template refuses deletion by name.
- **The supervisor and the ceilings (M81–M82).** One supervisor per canvas: the sheet's row
  says so and the create path refuses; a budget crossing interrupts (kills, for codex) and
  says so once; a send past the budget is refused with the number and the fix.
- **Memory node (M83).** Refresh, the kind select, the add line; the store's refusals by
  name; both doors disabled with `REASON_NO_REPO_MEMORY`, never hidden; the chat's context
  stated before it is sent.
- **Watcher node (M84).** Run now / Stop (one or the other), Arm/Disarm with the disarmed
  reason shown, three body states; `Watch…` disabled with `REASON_NO_WATCH_ROOT`; a trigger
  line that re-prompts by name.
- **Vault pane (M85).** Three states before the list, a named empty arm for no notes and no
  match, the cap reported; an unresolved `[[link]]` offers to create; Backlinks says when
  none point here.
- **Git (M86).** `Review every worktree…` disabled with `REASON_NO_REVIEW_TARGET_ACROSS` or
  `REASON_NO_WORKTREES`; commit and discard blocked by name across worktrees; a worktree
  whose directory is gone is a section that says so; the branch line absent / a phrase /
  nothing-with-a-note.
- **The broker, GitHub, Integrations (M87–M89).** `tc api` refuses by name (no credential
  with the ONE sentence, an unknown service or method, a path that could escape) and every
  refusal is an audit row; `Open GitHub work` present without a credential and disabled with
  `REASON_NO_GITHUB`; the Integrations pane's three closed sentences and one verb per service.
- **Lock, pin, maximise (M92).** Six palette rows every one present, the half that does not
  apply disabled naming the state; the ninth pin names the count and the fix; a locked
  panel's handles stay with the fix in their title; the frame's `fill` disabled by name in
  the merged view; a group frame says `N locked`.
- **Snapshots and annotations (M93).** History shows three states (reading, none yet with
  the rule, a list) and Restore is disabled by name while merged; a corrupt snapshot is
  refused by name; `Annotate…` present and disabled by name while merged; the strip carries
  its exit; a note's title says what it is; Delete removes a selected note.

### The surfaces this run added (M96–M107)

- **The verb line (M96).** `Run a verb…` is present at rest with no focus; a typed step is
  refused by name with its fix on the palette's own feedback line and the line kept; a
  destructive step enters confirm mode naming the verb and its target; a plan that reaches
  a plain shell with `type`, `submit` or `interrupt` is refused naming the agent fix; a
  setting outside the closed list is refused naming the palette's Settings door.
- **Auto (M97).** Five rows present on a chat, each disabled by name on a terminal, with no
  focus, and while a run is live (`already running here`); the chip resolves to `done`,
  `stuck — <why>` or `stopped` with a labelled `dismiss`; the chat's `auto` verb opens the
  palette rather than growing a menu.
- **Allow for session (M98).** The card's third verb; the pane's `Session grants` field with
  `Revoke` disabled by name (`nothing granted this session`), codex's reason on a disabled
  control (its sandbox policy decides), and `asking…` before main answers.
- **The registry (M99).** One `chat with <backend>` row per registered backend, disabled with
  `— not on PATH`, never hidden.
- **Teammates and Places (M100).** `chat as <name>` disabled by name with no places; a place
  added only through the folder dialog; `Chat as <name>` disabled naming the fix; a refused
  cwd names the teammate, the path and the folder to add; the roster's door present at rest.
- **Routines (M101).** `Add routine` disabled naming the schedule permission; `Open last`
  disabled with `never run`; a destructive plan line, an interval under a minute, an empty
  prompt, a teammate with no places — each refused by name on the form; `missed at <time>`
  in the attention tone; the section header says the app must be open.
- **Service scope and the spend card (M102).** `grant`/`revoke` per service with `not
  connected` said on the row; the Integrations page's `granted to no teammate — grant it in
  the Teammates pane`; a broker refusal by CODE (`not-granted`, `not-answered`) with the
  pane named as the fix.
- **The browser pane (M103).** `Open a page…` present at rest; a non-http(s) URL refused on
  the feedback line; `Back`/`Forward` disabled with their reasons; `Open in browser` a
  labelled verb; a read of a non-http(s) page refused by scheme, by name.
- **Lineups (M104).** The preview says how many will queue behind the ceiling BEFORE Enter; a
  lineup with no agent CLI on the PATH is refused by name at launch.
- **The rail (M105).** A chat row's last line and unread dot; the dock's `N live` / `N quiet`
  capsules; a terminal row carries no last line, by design.
- **Header discipline (M106).** The title gives, the verbs never; the full title in the
  title attribute and the ⋯ menu; Flip Terminals and Tidy Panes in the Workspace menu and
  as palette rows.
- **Discovery (M107).** `found` / `not found — install …` / `the shell didn't answer … put
  PATH edits in ~/.zprofile, then Check again`, with `Check again` on the launcher.

### The surfaces this run added (M113–M123)

- **The board's doors (M113).** `Add to board` on a GitHub or Jira row reads `Added` for two
  seconds and `On board` when the key is already there — still pressable, a second press
  updates; `New work item…` is a `canvas` row never disabled (a typed item needs no service,
  no place, no CLI); an empty title is refused with `a work item needs a title` and the line
  kept; `tc board add` with no title is a usage error naming it, at the URL door `a URL can
  only open`, and with no window `no canvas is open to add to — open the app first`.
- **Dispatch (M114).** `Assign to…` lists every teammate, each disabled by name with `<name>
  has no places — add a folder in the Teammates pane`; a repository no place holds is
  main's refusal on the card's note naming the repository and the pane; a typed item with
  several places is refused naming the choice (the sheet that asks is deferred by name);
  a closed lane leaves `working` with the note `lane closed` and `Review` on it says where
  the worktree still is. The drag door is the CARD's chrome onto a Teammates-pane row —
  the two panes never share the screen, so a Board row is not a drag source.
- **The return path (M115).** `Open PR` disabled by the one list (`no lane yet — dispatch
  the item first`, `a PR needs a GitHub repository — this item is jira`, the credential
  rows' `not connected` sentence, `<name> may not spend github — grant it in the Teammates
  pane`, `nothing to open a PR for — the lane has no commits past main`) BEFORE the click;
  a push that fails carries git's own line as `push failed — …`; `done` from any door
  offers the PR comment as a second card and declining still marks done; a `working` item
  dropped on `todo` or `done` with its lane open says `lane still open — close the chat to
  stop it`.
- **The Board pane and the card (M116).** Drop targets on `todo` and `done` only (the
  `working` and `review` columns take no drop, by construction); a row whose item has no
  card offers `Show on canvas`; a card whose record is gone says `this item is no longer on
  the board` and keeps only Close; the state word is a pill in the chrome, the provider's
  word muted beside it.
- **The engines (M117–M119).** `cursor-agent` has no row: declined in the spec with the
  three steps (backlog #80), never a row that fails. The sheet lists every registered row,
  `chat with copilot (acp) — not on PATH` when the binary is absent; the how row's mode and
  effort read `no mode flag` / `no effort flag` disabled for a row without them; the
  preview names how two copilot rows differ; a copilot Interrupt is disabled with `copilot
  has no interrupt — close the panel to stop it`, an image refused with its row's sentence;
  a pending ACP handshake reads `waiting for copilot (acp) to open its session` with
  Interrupt disabled by name, and a handshake nobody answers ends the process with
  `handshake-timeout` as the reason; a supervisor, routine or dispatch on a row without an
  appended prompt is refused with `<label> takes no appended prompt — …`.
- **Chat mode (M120).** `New chat (no folder)` is one row per registered backend beside
  `New chat…`, disabled by `<label> has no read-only mode … — use the copilot row instead`
  for acp and by `not on the login PATH` for an absent binary; the launcher's third card
  says `read-only, nowhere to write`; a teammate beside a sandbox is refused with `a
  teammate has places; a chat with no folder has none — pick one or the other`; the header
  reads `sandboxed · no folder`; the model select's empty choice is `auto (the CLI's
  default)`.
- **Search (M122).** `Find in panels…` shows the cap (`the first 50 matches — narrow the
  search`) and the redaction count (`2 secrets redacted from these lines`) before the hits;
  with persistence off the reason reads `terminal output is not being kept — turn on Keep
  output; chats still answer` and the transcript hits stay; `No matches for “word”` only
  after a query.
- **The update notice (M123).** Three states on the palette's own line — `up to date —
  3.0.0`, `3.1.0 is out — Open release`, `could not check — <reason>`; the setting
  `update.checkOnLaunch` is off by default, in the Updates category, and no plan may write
  it; auto-swap is declined in the sentence the launcher shows (an unsigned build cannot
  replace itself).

### The surfaces since M124 (M126–M138), walked in the v7 run's M139

Walked by source and by the suites (the panels harness drives the real pane, panel and
workflow node; `verify:rail skills.1a–g` the pane's model over its six contexts). Every
control is one of: runs; disabled with a reason in its `title`; or a sentence in the empty
arm. The rule holds; two things it found are recorded at the end.

- **The Skills pane (M127).** Three kind tabs over one inventory; a search whose no-match
  arm is a sentence (`noMatchSentence`), never a rack of empty columns; `no directory —
  select a panel with one to read what it can do` when the selected panel has none;
  `reading…` while the shelf loads. New column, always. A column's menu: `Assign to
  teammate…` (a `<select>`, disabled when the column is empty or no teammate exists, titled)
  and Delete — `Ungrouped`'s Delete PRESENT and disabled with `UNGROUPED_DELETE_REASON`. A
  card's menu: Assign (disabled with no teammate, titled), Open. New skill: the scope buttons,
  `project` disabled with the pane's own reason when the selected panel has no repository;
  Create disabled with `a skill needs a name` until one is typed. A shelf key with no file
  behind it keeps its slot and reads `not installed — the shelf kept its slot`.
- **The skill panel (M128).** Sections over one read; `Open folder` and `Help me write`
  disabled with `REASON_NO_SOURCE` until an inventory has named a file; the plugin's
  `details` arm is `unknown — the CLI did not answer` rather than blank; the merged view
  freezes every door with `REASON_MERGED_VIEW`.
- **The editor (M129).** Save disabled with four named reasons — no stamp yet, over the
  read cap (edit it in a terminal), nothing changed, the frontmatter is not grammatical —
  and the write's three results (`written`, `refused — <why>`, `failed — <why>`) are one
  line each; the metadata fields freeze with the same sentence in the merged view. Delete
  confirms with the resource count. Rename refuses an occupied name by name.
- **The trail lane (M130).** Cards `asking` → `one` / `none` / `several` / `unknown — <why>`,
  and (M137) a panel with no directory resolves at once to `this panel has no directory`
  rather than asking forever; the `… and N more` capsule at the cap.
- **Assignments (M131).** The card reads `not visible to <teammate>` from main's own
  verdict; a project-scoped skill is refused naming its repository.
- **The workflow panel (M133, M137, M138).** Run disabled with `templateRefusal`'s
  sentence (M138: a pool that names no list — the blocks themselves run now); Triggers
  disabled with the SAME sentence (M137: a watcher armed on a blocked shape fired into a
  silent refusal every tick); Stop PRESENT always and disabled with `no pool is running`
  (M138); Save disabled with `the live canvas is the editor — …`; Delete disabled for a
  built-in; Build with AI always. Every disabled verb also prints its sentence under the row.
  The Runs tab: `no runs recorded since this app started …` (three states, never an empty
  box) and, per pool block, `not run yet — Run starts the workers`, the items with
  `queued / started / finished`, and a closing row — `done — every item finished`,
  `stopped — by hand`, `stopped — the budget ceiling was crossed; raise agents.budgetUsd to
  continue`, or `refused — <main's reason>`.
- **The pool's workers (M138).** Ordinary chats titled `<block> · <item>`; a worker the
  renderer could not mint ends the pool with the reason in the block's rows; a second Run
  while one is live is refused `… is already running — stop it before running it again`.

**Found and fixed in this walk:** Triggers enabled on a blocked shape (M137), and the fire
path minting nothing without a word (M137). **Not fixed, recorded:** a `collect` joined
by workers minted after its first arrival — the join's expected set grows under it (hand
check 10; `CLAUDE.md`'s M138 entry).

### The surfaces since M139 (M140–M155), walked in the v7 run's M160

- **The toolbox row's Open door (M140).** Present on every row that has a file; a row whose
  file is unreadable keeps the door and the file panel says the arm (`not found`, binary,
  too large). Never removed.
- **The spawn sheet's Env field (M147).** Present for a preset or a command, absent for a
  chat row by the row's own rule (a chat's environment is the CLI's); a line it cannot read
  is named beneath (`not KEY=value: …`), never dropped silently.
- **`Zoom to fit` / `Reset zoom` (M146).** Two rows, always present; on an empty canvas the
  fit RESETS rather than doing nothing (a verb that did nothing reads as broken).
- **The Vault pane's TAGS section (M150).** No section when the vault has no tags (absence,
  not a heading over nothing); a tag row filters, a second press clears; `#nothing` says
  `no note matches #nothing`; the forty-row cap is counted beneath. The note's chip SHOWS
  the pane (the toggle is never called on a pane already showing — M150's critic).
- **The annotate strip's tools (M155).** `label` / `draw`, pressed state as data, never
  disabled: a stroke needs no process and no permission. A press that did not move is a
  label; a moved drag is a stroke; Escape leaves the mode; the merged view ends it (M93's
  rule, inherited).
- **The attention popover and the `⋯` menu (M149).** Walked as PAINTED, not as present:
  both had been open in the DOM and invisible — `popover.paint.1` and `menu.paint.1` ask
  `elementFromPoint`, which is the rule this audit adds: a surface that opens is proven by
  a pixel question.
- **The palette's `say` line (M149).** A refusal that arrives on a keystroke (a paste into a
  card, a write that failed) is said on the feedback line, then Enter or Escape closes it;
  no verb, no plan may name it (`EXCLUDED_ACTIONS`).

## Keyboard reach

`verify:panels reach.1` presses a REAL Tab (`sendInputEvent`, not a dispatched event) from
the context pane's first enabled action and asserts every enabled action is visited in the
bar's order — the three toggles M92 added included — and from the launcher's first verb
asserts every launcher verb is visited. A disabled action is skipped by Tab, and that is
right: it is present, titled, and not a stop. What this does NOT cover: the frame's chrome
controls (`fill`, the marks, close) and the rail rows, whose tab order the M44 keyboard
work set and no check re-walks; and the note editor, which takes focus on placement and
returns it on Enter/Escape (a click check drives that in `annot.1`).

`verify:panels reach.3` (M139, the product part) presses a REAL Tab from the workflow
panel's Run and asserts every enabled verb is visited in the row's order and every disabled
one (Stop with no pool, Save with no editor) is skipped, present and titled; then from the
Skills pane's first control it asserts the named top controls are reached and every disabled
control is titled. The page is FOCUSED first (`wc.focus()`): a hidden window's page raises
no focus events until told, and a walk from an unfocused page visits nothing.

## Not walked

- **Pixels.** No suite sees a stray visual defect; the walk is by source. A pass over a
  real display at both themes and three widths is manual-only; the scenes `npm run shot`
  renders are a person's and a critic's reading, recorded per milestone.
- **Native dialogs.** Reset (now with its snapshot line), orphan recovery, save dialogs:
  manual-only.
- **Terminal contents.** What an agent CLI draws is its own; the app's accessibility
  statement (M44) says what the panels cannot offer.
- **A real network.** Every connector is driven with a fake requester; the Connect verbs
  and the not-connected sentences are what a person reaches with no token, and a real
  GitHub or Jira answer was seen once by hand at most.
