# M259 — the workflow editor, and board / GitHub / Jira / Connections

Branch `m259-workflow-board` (worktree `../tc-m259-workflow-board`), from `1df08dc8`.
The brief is the user's §12 (workflow editor) and §13 (board, GitHub and Jira). The design
direction is the Obsidian brief's material, sharpened rather than replaced: no new colour
token, no new dependency, no renamed hook.

## §12 — the workflow editor

| Brief line | What landed | Where it is bound |
|---|---|---|
| One compact toolbar: Run, Add node, Edit trigger, History | One `role="toolbar"` row replaces the verb row, the tab strip and the column of reasons between them. Stop, Save, Delete and Build with AI move into an overflow menu under `⋯`, which is still `.workflow-node__more-actions` | `m208.hierarchy.1`; `workflow.panel.1` now expects one tab hook, `runs` |
| Status prose into a status panel or tooltip | A status pill says one word at rest (`Unsaved`, `N to finish`, or a dot). It is never a zero-value statement. Its popover lists every disabled verb's reason and every unfinished block, revealed on hover or focus at opacity 0 → 1. Each reason is also on its control's `title` | `workflow.save.1` still reads the reason lines |
| Left node library that collapses after placement | A left drawer of glyph tiles. A successful drop or Add closes it; a refusal leaves it open | `workflow.lib.1` asserts the collapse and reopens the drawer the way a person would |
| Type differentiation: icon, title strip, subtle interior | Every block has a glyph and a kind-name strip (`WORKFLOW_NODE_GLYPH`). The hue comes from the kind's **family**, not the kind: agents use the accent, workers over a list use blue, and the hands (shell, verb, fetch) stay neutral. The interior is a 4% wash of that hue | — (visual; see goldens below) |
| Heavier edges, trigger labels on the edge | Each edge is a 2px cubic between the facing borders, with a 12px invisible hit twin. The trigger word sits in a pill at the curve's t = ½ | `wfx.edge.1` |
| Arrow motion once when control passes | `wf-flow`: one bright segment travels each finished edge once, then ends invisible. It is named in `motion.2`'s allowlist. Under reduced motion it is removed, and the lit stroke still reports the handoff | `motion.2` |
| Upstream and downstream path on select | `neighbourhood()` lights the block's lineage. Everything else is dimmed by colour, not opacity (`styles 3`) | `wfx.path.1`, `wfx.ui.1` |
| Invalid or incomplete connections on the graph | A block missing a required field, a fetch with a write method, a block with no edges, or a collect block that nothing feeds gets a dashed amber border, a warning glyph and its reason. A wire that would loop, duplicate or self-connect is refused **at the pointer while held** | `wfx.issue.1/2`, `wfx.ui.1` |
| Automatic layout, horizontal and vertical | `autoLayout()` ranks by longest path and places each rank at its inputs' mean slot, so chains draw straight. It is committed as ONE `arrange` draft operation (one step, refused whole). The control floats in the graph's corner | `wfx.layout.1`, `wfx.ui.1` |
| Ports only on hover or while connecting | Ports sit at opacity 0 until the block is hovered or a wire is live (opacity, not display, so a scripted pointer still lands) | `workflow.wire.1` |
| Grouped inspector controls in human language | The node editor has four fieldsets: Basics, What it does, Where it works and Capacity. Labels are in sentence case with a one-line hint each. An edge reads "Handoff · A to B" and "B starts…" | `workflow.inspect.1` (hooks unchanged) |
| Run timeline mapped back to nodes | The History drawer beside the graph (never a tab over it) holds the selected run's timeline, one row per block from `run.mapping`. Hovering a row lights its block, and pressing it selects the block. A pre-M184 run says it cannot be placed | `wfx.timeline.1` |
| One traveling highlight, then quiet checks | `completedWalk()` orders finished edges by rank. Each edge's step is pinned the first time it joins the walk, so it moves once and never replays. Finished blocks keep a small check and no other change | `wfx.walk.1` |

**Declined, with reason.** Auto layout is a panel gesture over the draft, not a new verb. It has
no palette row or agent line, so `V9_DOORS`' four-door closure is not claimed for it. Agents
already move blocks one at a time through `workflow-move`. A `workflow-arrange` verb would be
its own milestone.

## §13 — board, GitHub, Jira

| Brief line | What landed | Where it is bound |
|---|---|---|
| Wider board lanes, distinct from the navigator | While the Board is the navigator's pane, the column widens to 420px (`.shell:has(.board-pane)`), and the compact drawer widens to match. Lanes are tinted wells with a tone mark, not rail rows | `rail-w.1` (the token default is untouched) |
| Real draggable cards: title, repository, assignee, state | Each card shows the repository (`repositoryOf`, read off the key) and the provider's state when it disagrees with the lane. The title is clamped to two lines. The key, teammate and lane sit at the foot | board checks' hooks unchanged |
| Visible drop targets while dragging | While a card is being dragged, each lane says what a drop would do. An open lane shows a dashed accent well, the lane under the pointer is solid, the card's own lane stays quiet, and a runtime lane names who sets it | — (HTML5 DnD; not reachable from a dispatched event) |
| Consistent state names | `providerState()` in `panel-state.ts` (state words live only there, `state.2`) maps GitHub's and Jira's words onto the board's four. An unknown Jira status keeps its own words and claims no column | `boardx.state.1/2` |
| No ticket prose in the navigator | Cards carry titles only. Jira descriptions show two lines on the canvas until Show more | — |
| Contained failure banner with a primary recovery | `ConnectionBanner`: a headline, the provider's reason, and one filled recovery (Connect/Reconnect for credentials, Try again otherwise). Jira's *rejected* arm had no fix before; it has one now | GitHub/Jira connect checks (hooks unchanged) |
| Readable activity instead of raw audit logs | `activityOf()` turns a call into a sentence, e.g. "Commented on o/r#12". Three outcomes, never two. The HTTP line sits behind "Request details" | `boardx.activity.1`; `integrations.1` reads the same `data-integration-row` |
| GitHub/Jira: status, review, assignee, next action first | Each row leads with the state pill, then the kind and "your review requested", then the title. The next action (Start review / Start session) is the row's one filled control, and the metadata comes last | — |
| Sync freshness, stale canvas copy | Panel headers show `updated 3m ago`, amber and "may be stale" after 10 minutes (`syncWord`). A work card calls its provider state a *copy*. It says "may be stale" only when that is certain: `updatedAt` is the latest the copy can be | `boardx.fresh.1` |
| Optimistic transitions with success or rollback | Board: the move is immediate, then "Moved … to done" with Undo, or "Couldn't move — it stays in …". Jira: the pill shows the target as *pending* (dashed), then "Moved to X" once the re-read confirms, or a rollback line with Jira's reason. The screen still never presents an unconfirmed state as Jira's | — |

## Evidence

- Plain tier, run in this worktree: `verify:layout` 266/266, `verify:rail` 210/210,
  `verify:styles` 62/62, `verify:palette` 148/148, `verify:meta` 50/50, `verify:verbs` 26/26,
  `verify:agent-session` 141/141, `verify:onboarding` 21/21, `verify:control` 27/27, and every
  other suite `npm run affected` names on the plain tier. `tsc` (node and web) clean.
- `wfx.*` and `boardx.*` were written first and watched red (`R.providerState is not a
  function`; the layout bundle failing to resolve `workflow-graph`).
- Electron tier: see the ledger line added after the gate.

## Goldens

This restyle changes the workflow, board, GitHub, Jira and integrations scenes on purpose. Per
the golden-sentence rule, each changed scene needs a critic's sentence here before
`UPDATE_GOLDENS=1` writes it. That is owed and has not been done blind.
