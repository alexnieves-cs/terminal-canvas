# v8 Act I — the frame every kind wears (M163–M166): design

Brief: `2026-09-07-m162-product-polish-brief.md` (the rest rule, the path rule, the metrics
rule, finding 1, 2, 8, 10, 14, 15, 17, 18, 19, 20). Branch `m163-frame`.

## M163 — the quiet header

**At rest** a `PanelFrame` header shows: the kind glyph in a soft tint (`.pf__state--kind`,
already there for every non-terminal kind; a terminal shows its state dot, and gains the
`terminal` glyph in `icons.tsx` for the rail's headings in M171), the title, and one state:
the dot for a terminal, the `badge pf__word` pill for a kind whose word IS the state (chat,
watcher, work). Everything else — `⋯`, the lock and pin marks, the kind's own verbs in the
chrome slot, `fill`, `×` — sits in its box at `opacity: 0` and comes to `1` on `.pf:hover`,
`.pf:focus-within` and `.panel--selected`, in `--dur-1`. The kind's SUMMARY line
(`.pf__summary`: the chat's `repo · main · claude`, a file's byte count, a work card's key)
stays at rest — it identifies. The layout never moves on hover: opacity, never display.

- The controls keep their box (`targets.1` ≥ 24px), their `aria-label`, their tab order, and
  answer a script's click without a hover (`menu.1`, lock/pin/fill, close arming: every check
  that clicks a chrome verb). `pointer-events` is never `none` on them.
- `verify:panels` `header.1` (the 320px frame) keeps reading widths > 0: opacity does not
  change a box.
- The `.pf__chrome` hit-test at 15/35/65/85 % width (`kinds` 436-448) must still land on the
  chrome and not a button: the controls' positions do not move (they were at the right end
  and stay there).
- **The machine cost leaves the header.** `MachineCostBadge` is removed from
  `TerminalPanel`'s chrome and from the card tiers; a `Machine` section in the inspector's
  Detail tab reads `useMachineCost(panelId)` (`CPU · RAM`, or `not running`), beside — not
  inside — the `Cost` section (`cost.history.1` reads `data-usage-row` and must not see a
  second cost-shaped row). The HUD's `data-machine-cost-total` stays until M173 removes the
  status bar's figures.
- **Finding 8, the dark lift.** Dark `--glass-1` `.74` → `.88`, `--edge-light` `.06` → `.11`,
  `--lift` `0 20px 40px -22px rgba(0,0,0,.75)` → `0 24px 48px -20px rgba(0,0,0,.8)`. Light
  stands. The state edge (`.pf::before`) keeps its glow; the 3px `border-left` tone stripe
  (`.panel.pf` 2080-2086) is softened: 2px, and its colour is `color-mix(tone 70%, frame-line)`
  so it reads as a tinted border rather than a stripe.
- Checks: `verify:styles rest.1` — the chrome verbs' rule (`.pf__chrome .pf__verb`,
  `.pf__mark`, `.pf__close`) sets `opacity: 0` and a `.pf:hover, .pf:focus-within,
  .panel--selected` rule sets them to `1`, with a `transition` naming `--dur-1`;
  `verify:styles metrics.1` — `data-machine-cost` appears under `src/renderer` only in the
  inspector and the machine-cost store, and no `.panel__machine-cost` / `.panel__card-cost`
  rule remains; `verify:panels` `rest.1` (core) — a live panel's `[data-panel-more]` has
  computed opacity `0` at rest and `1` after a hover, and `.click()` opens its menu without one;
  `machine.1` (shell) — the inspector's `[data-inspector-machine]` shows a CPU figure for a
  live panel and `not running` for a dormant one.
- Goldens: `kinds`, `kinds-dark`, `header`, and every scene with a panel (the whole set moves;
  each gets its sentence).

## M164 — the body's material

Reading kinds (review, file in prose mode, toolbox, skills, work, memory, note, github,
integrations, the subagent notes, the trail's cards) set prose in `--font-ui` at `--t-base`
/ `--lh-body`, wrap at `--measure`, inset `--inset`; mono only for code spans, diffs, paths
and commands. Terminal bodies keep their cells; the `--well` bezel (`--bezel` under the
chrome's hairline) is made visible on the dark theme by the M163 re-values.

**The path rule.** `shared/display-path.ts`: `displayPath(path, root?) → { short, full }`:
under a root, `basename(root) + '/' + relative`; outside every root, the last two segments
with a leading `…/`; `~` for the home prefix when no root is given; never the empty string.
Every `PanelFrame` body that prints a path calls it and puts `full` on the element's
`title`: the review node's root line and file rows, the file node's path line, the toolbox
node's root, the skill node's file, the memory node's root, the watcher's cwd, the
teammates pane's places, the browser's nothing (a URL is not a path). The palette's rows
and the sheet's suggestions are M175's. `shortPath` (the palette's) stays for the tool rows
until M168 moves them to `displayPath`.

- Checks: `verify:rail path.1` — the helper's arms; `verify:panels path.1` (kinds) — the
  review body and the file body render no `/private/var` or `/var/folders` text and carry the
  full path on `title`.
- Finding 14 (the trail cards: name in the UI face, the phase as a sentence, no caps), 15 (the
  subagent notes' face — M162 did the face; the caps heading `SUBAGENTS` becomes a sentence
  case heading), 18 (the work card's verbs as quiet chips: `.pf__verb--word` material), 19 (the
  browser's Back/Forward/Reload as icon controls: `ArrowLeft`, `ArrowRight`, `Reload` in
  `icons.tsx`, each with its `aria-label`), 20 (the memory node's add line in the UI face).

## M165 — diffs as cards

The review node's per-file rows become file CARDS: a header with the basename (bold, UI
face) and the directory (mono, `--fg-3`), `+n −n` as two soft pills (`--green-dim`,
`--red-dim`), the hunk beneath in mono with the add/remove washes on the whole line, and
`discard` revealed on hover of the card (the rest rule) — present, named, in the tab order.
Commit and refresh stay as the frame's verbs (revealed with the chrome). The DOM hooks the
checks read (`review-node__file`, `data-review-file`, `.review-node__line--add`, the discard
verb's attribute) are kept; the card is a restyle of the row plus a header element.

- Checks: `verify:styles diff.1` — a `.review-node__file` rule with `--r-md` and a
  `.review-node__discard` rule at `opacity: 0` revealed by the card's `:hover` /
  `:focus-within`; the existing review checks (`kinds`) stay green.
- Goldens: `kinds`, `kinds-dark`, `across`, `inspector-work`, `tool-objects`.

## M166 — the far view as a status wall

At the summary and block tiers a card shows the kind glyph, the name and a state WASH —
`color-mix(tone 26%, --s-1)` (M110's, already the block's) on the summary tier too — and
nothing else: the summary tier's last line and cost readout go (the cost by the metrics rule;
the last line is the rail's, M105). The minimap keeps the same wash (`far.1`).

- Checks: `verify:styles far.2` — the summary tier's rule fills with the same `color-mix`
  expression as the block tier and declares no `__cost` child; `verify:panels far.1` (core) —
  at scale 0.2 a summary card renders its glyph and name and no `data-machine-cost`.
- Goldens: `zoomed-out`, `zoomed-out-dark`, `overview`, `flip`, `group-collapsed`.

## What this act declines

Finding 13 and 22 (the brief's reasons). Hiding the work card's verbs (18). A second
markdown/diff renderer: the review's hunk stays the M9 renderer, restyled.
