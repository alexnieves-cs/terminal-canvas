# Act III — the polish that pays (M104–M107): build log

Branch `m104-lineup`, 2026-09-05. Spec: `docs/superpowers/specs/2026-09-05-act3-design.md`.
Plan: `docs/superpowers/plans/2026-09-05-act3.md`. Four milestones over near-disjoint files,
built as two tracks in one sitting.

## Red first

`verify:palette lineup.1–.2`, `verify:rail lastline.1` and `header.1`, `verify:file env.1`,
`verify:styles header.1`, `verify:panels header.1` and `flip.1` — every one red before its
module or rule existed (the styles check went red against the frame with no rule; the file
check against a report with no probe record).

## M104 — the lineup preview

- `shared/lineups.ts`: four lineups as SEATS; `lineupPlan` is pure and says how many sessions
  open, which seats get a worktree lane (agent seats only, only when asked — a browser or a
  shell in a worktree points at a directory the dev server was never started in) and, against
  `agents.maxConcurrent` read live with the live agent count, how many will queue and the
  sentence that says so.
- The sheet's `lineup: Workbench — …` rows preview the plan under the ordinary preview line
  BEFORE Enter mints anything; the launch goes seat by seat through the ordinary doors (the
  first available agent preset with `worktree` for a lane, the login shell or a command, an
  M103 pane) and refuses by name when no agent CLI is on the PATH.

## M105 — the rail says what is happening

- `session/last-line-store.ts`: per panel, by id, never on `registry.version()`; set on a
  chat's turn end from the transcript's last complete text block (`lastLineOf`: the last
  non-empty line, cut from the right — prose, not a path), marked unread when the turn ended
  while the panel was not focused, cleared on focus, cleared at every removing site beside
  `clearAgentState`.
- The chat row's second line and unread dot; the dock's `N live` / `N quiet` capsules from
  `railCapsules` over the rail's own rows. A terminal row carries no last line: its scrollback
  is not a conversation, and faking one from OSC 133 would be a different content in the two
  front-ends — declined by name in the spec.

## M106 — header discipline, Tidy and Flip

- ONE rule in `styles.css`, for every kind: `.pf__title` shrinks (`min-width: 0`, ellipsis)
  and every chrome control is `flex: 0 0 auto`; the full title rides the `title` attribute and
  the top of the frame's `⋯` menu — the one menu the act adds. `verify:styles header.1` pins
  the rule, `verify:panels header.1` measures a 320px frame with a long title.
- The Workspace menu: Tidy Panes (M40's arrangement) and Flip Terminals — `canvas:flip` toggles
  a view state that hands `summary` to every terminal frame through the SAME
  `CardDetailContext` the camera uses, so M57's far-view renderer is reused and no second one is
  grown; never persisted; a locked panel does not move (nothing moves), a maximised one flips
  in place. `verify:panels flip.1`.

## M107 — the app explains itself

- Changes refresh on the selected chat's turn end (`useInspectorDetail` subscribes
  `onChatTurnEnd`; M77's baseline was there, the trigger was not).
- The thread header reads `api · main · claude · claude-opus-5` (`chatHeaderLine`; the branch
  from M86's `git:status`, the model from the session's snapshot; every absent piece absent).
- **Discovery, fixed as a defect.** The environment report carries `probe` — the shells asked,
  the folders checked, whether the shell answered — and `probeOutcome` gives THREE states: a
  shell that timed out reads `the shell didn't answer … put PATH edits in ~/.zprofile, then
  Check again`, never `not found`; the launcher's line says which and offers `Check again`,
  which asks the login shell once more (`env:report` with `again`) and reports; the app's own
  environment applies on relaunch, said on the row. This was the repository's own three-state
  rule broken by a surface it already shipped.

## Findings (critic and verifier)

(At the gate.)

## Verification

(At the gate.)
