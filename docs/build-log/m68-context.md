# M68 — The context pane finished

**Branch:** `m68-context`. **Spec:** `docs/superpowers/specs/2026-09-02-m68-context-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m68-context.md`. **Status:** finished 2026-09-02.

## What landed

- **Detail repeats nothing.** The pid is the pinned header's; the field list drops it through
  `visibleDetailFields`, the one pure filter the view renders through. `asked for` renders
  only when it differs from the resolved command; when they agree the single row is labelled
  `command · as asked`, so a collapsed row cannot be mistaken for a row never built (the
  critic's first finding). Path fields are left-truncated with the whole path in the title.
- **Work has three headings, always.** Changes: `reading…` / `this directory is not a
  repository` / the list (the verifier caught the first cut rendering the unanswered and the
  not-a-repo arms as one line). Runs: `no runs yet` / rows. Cost: `no agent on this panel —
  nothing to cost` / `no answer from this agent yet` / the four figures. Runs sits before Cost
  (what it did, then what it cost). A sessionless kind's sections each say so.
- **A Changes query that raced the baseline re-asks.** A panel selected while its process
  was arriving read `no session yet` and never asked again (only an idle ARRIVAL re-fired
  the query, which a plain shell never produces). `selectedSpawned` flips the query once on
  spawn, and a `never-started` answer for a spawned panel is re-asked up to six times, half a
  second apart, timer cleared on cleanup. Found by `context.2`, not by a person.
- **Tools shows permissions.** `permissions: 3 allow · 1 deny in 1 file` under the Toolbox
  heading, from the inventory's own `PermissionCounts` (no second invoke: `toolbox:permissions`
  is one file's rules, not a summary), `no permission rules in this directory` when none.
- **The Jira panel offers `Connect Jira…`**, through `shellControl`, opening the palette's
  Credentials scope — the one note in the dead-end audit that named a fix without offering
  it. The audit's row says so now.
- **The navigator.** The Files header names the panel its root belongs to, in the rail's own
  label (the honest chain, the user's title first). The Workspaces list ends with the merged
  view's door: the lanes glyph, `merged view`, pressed while on, through the same
  `toggleMerged` the top bar runs.
- **One register.** `2 panels share this repository, so changes cannot be attributed` in the
  pane and the review node, matching the subagent notice's sentence (critic, finding 6).
- **The compact drawer's action bar, again.** M66's padding rule (`.shell--ctx-drawer
  .inspector__actions`) lost, at equal specificity, to the grid rule added later in the same
  milestone; Close sat under the strip for two milestones and the critic saw it. Three
  classes now. Recorded here because the M66 shot that "proved" the fix was taken before the
  grid rule existed — a shot proves the tree it was taken from.

## Decisions not visible in the diff

- **The earlier "hide Changes for not-a-repo" rule is overruled.** Its argument (a permanent
  placeholder teaches the user to skip the tab) was sound for a placeholder; a heading whose
  line says WHY there is nothing, and what would change it, is an answer. verify-suites.md's
  sentence about not-a-repo being HIDDEN in the pane is now history, and the model's `hidden`
  flag survives as the arm's name.
- **`Open toolbox` stays enabled with nothing installed** (critic, finding 9). A toolbox node
  is a directory's config as a panel — sources, permission files, where a command would go —
  and "nothing installed" is a state it renders, not an absence of outcome.
- **The permissions line carries no mode.** The spec said "mode and counts"; the inventory's
  counts carry no mode, and the agent's mode is Detail's `mode` field already. Recorded, not
  invented.
- **The Jira note's blank well, the Tools micro-labels, the header's repo line, the lane
  tint** (critic 10, 8, 16, 14): nits, recorded; none changes what a user can do.
- **Left for M69/M70:** the rail title truncation when selected (recorded twice now; a wider
  rail is a frame decision); the pane's identity line naming the repository.

## The critic

Seventeen findings. Fixed: 1 (the collapsed row says so), 2 (paths left-truncated), 4
(Runs before Cost), 6 (one register), 7 (cost copy without `pinned`), 12 (the door's glyph),
14 (the drawer's bar — blocking), 15 (the drawer's edge is `--line-strong`). Declined with a
reason: 9. Recorded: 3 (more Detail fields — a feature, not this milestone), 5, 8, 10, 11,
13, 16, 17. What works and was left alone: the three Work headings, the state vocabulary,
the dashed asleep edge, the palette reasons, the launcher.

## The verifier

Twenty findings. Fixed: 3 (two Changes arms), 5 (`shellControl` on Connect; `context.3` now
dispatches a click). Accepted as recorded: 4 (mode, above), 7 (hint wording), 8, 10 (the
`reading…` arm now makes the check non-vacuous), 15 (one spare invoke after a selection
change — bounded), 20 (scope: `context.5`, the re-ask, the label, the order).

## Checks

`verify:rail context.1/.5`; `verify:panels context.2/.3/.4`; 87, 101 and worktree.1 restated
(the pid from the header; the note's register; the path from the field's title). `npm run
verify` green, run alone, before the merge.
