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
  a view state that hands `summary` to every terminal through a `flipped` prop on
  `TerminalPanel` (the verifier caught the first version, which went through
  `CardDetailContext` and so never reached a LIVE panel); M57's far-view renderer is reused
  and no second one is grown; never persisted; a locked panel does not move (nothing moves), a maximised one flips
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

Two fresh-context readers in parallel: a critic over the 47 shots, a verifier over the
branch's diff with the plain-node suites in hand. Twelve verifier findings and fifteen from
the critic; the two agreed on the one blocker.

**Taken.**

- **Flip never reached a LIVE terminal** (verifier 1, critic 2). `cardDetail` reaches only
  `PanelCard`, and a live panel renders its slot; `flip.1` passed on two dormant panels.
  Flip is a `flipped` prop on `TerminalPanel` now: the body is the summary card whatever
  the tier, the slot detaches as a tier change would, the session is untouched. `flip.1`
  wakes one panel first and asserts the slot leaves and returns. Three doc sentences that
  said `CardDetailContext` were rewritten.
- **The lineup's worktree flag was unsettable** (verifier 2, critic 4). A `lanes` checkbox
  on the sheet for a lineup row (`data-sheet-worktree`) feeds `values.worktree`; the lineup
  scene asks it, so the picture shows `in a worktree` on the agent seat alone.
- **The chat's header line could not shrink** (verifier 3, critic 9). It was `pf__kind`,
  which the frame rule fixes; it is `pf__summary` now — the same class the browser's
  address gives with — so on a narrow chat the middle gives before the verbs.
- **`.pf__title { min-width: 0 }` undid M67's floor** (verifier 4). 8ch, and
  `verify:styles header.1` pins 8ch rather than 0.
- **The ⋯ menu's `Verbs in ⌘K…` was wired by nobody** (verifier 5). `PanelMarks` carries a
  `more` door the canvas provides once (focus the panel, set the focus ref — `openPalette`
  captures it synchronously — then open); Escape closes the menu.
- **`Check again` could degrade every later spawn** (verifier 6). `reprobeShellEnv` probes
  into a local and replaces the cache only on success; a failed re-probe reports itself and
  keeps the login environment the PTYs had.
- **Tidy from the Workspace menu wrote geometry in the merged view** (verifier 7). The
  action refuses while merged; the palette row says the merged reason.
- **A lineup could be refused mid-loop** (verifier 8). The agent preset is checked before
  any seat is minted, and the lineup rows are disabled by name with no agent CLI.
- **The ceiling preview undercounted** (verifier 9). `starting` counts as live.
- **Duplicate `clearLastLine` calls** (verifier 10), **`flip.1`'s id overclaimed and
  `docs/verify-suites.md` was not updated** (verifier 11): fixed and written.
- **The lineup's ordinary preview line read `· —`** (critic 3). It names the lineup now.
- **The rail's last line was empty after a relaunch** (critic 6). `onChatSeeded` in the
  chat store; the canvas — the guarded reader — re-derives the line, never unread.
- **`Check again` jammed against `⌘K`** (critic 10a). A gap.
- **`header.png` and `flip.png` re-captured the previous scene** (critic 1–2). The header
  scene goes to the panel by a distinctive fragment of its title and logs where it landed;
  flip rides main's own event and, with the prop, now turns a live terminal too.

**What the reshoot then showed, and was fixed before the chain.** With the header scene
finally on its subject (the scene raises its panel with a chrome press — an earlier scene's
go-to had raised the review panel over it), a LIVE 320px frame pushed `fill` and `×` past
its own edge: the CPU · RAM badge was `flex: none` and the title was already at its floor.
The badge gives now (after the title, before the verbs). The ⋯ menu hung off its button
and was cut at the frame's left edge by `.panel`'s overflow; it spans the frame beneath the
chrome, which is its containing block. And the rail's last line sat BESIDE the row and
squeezed the title to `c..`; the row wraps and the line is a full-width child ordered last.

**Declined, with the reason.**

- The dock capsule's `1 live` beside three green rows (critic 7): `live` is a chat with a
  turn in flight, and the capsule's title says so; a terminal's `idle` is not a chat.
- `repo · main claude` (critic 8): the backend word is the binary's name in mono, a
  distinct token by M91's decision, and the model shows when a session has reported one.
- The launcher's two sentences (critic 10b): the codex row's reason and the environment
  line are two doors — a disabled row must carry its own reason (the dead-end rule).
- The spawn sheet's suggestion list over the WHAT field (critic 12): anchored to its input,
  M65's composition.
- The auto chip shortening before the verbs clip (critic 9, second half): with the header
  line giving first, the chip is the next thing to shrink; deferred by name below.

**Deferred by name.** The stale `auto · complete … working` run beside an idle panel
(critic 11) is the fixture's seeded run; whether a real run can outlive its only panel's
settling is an M79 question for the next run. `flipped` survives a workspace switch and has
no Escape (verifier 12). The ceiling preview does not add the concurrency queue's length
(verifier 9, second half). The ⋯ menu has no outside-click close. A third lineup shot with
a WHERE filled.

## Verification

(At the gate.)
