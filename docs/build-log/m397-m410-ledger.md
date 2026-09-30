# M397–M410 ledger — make the daily loop feel obvious

Run prompt: [2026-09-30-ux-critique-run-prompt-gpt61-sol.md](../superpowers/specs/2026-09-30-ux-critique-run-prompt-gpt61-sol.md)
(written for GPT 6.1 Sol, run by Claude Opus 5.5 as lead with subagent builders and fresh-context critics).
Branch `m397-daily-loop` off main `6362a94e`. **This ledger is the state.** Reread it after a compaction.

Commit trailer: the prompt asks for `Model: GPT 6.1 Sol`. This run was NOT made by that model, so commits carry
the Claude co-author trailer instead. Writing the wrong model's name would be a false record.

Baseline reds (from the M396 gate): `verify:panels:agents template.1`, `verify:panels:product starter.1`,
`verify:visual starter`. `starter` is expected to change (A1, A2).

## Plan (finding IDs → milestones, grouped by the files they touch)

| M | IDs | Area |
|---|---|---|
| M397 | A1, A4, A8, A11 | styles: note editor height, terminal scrim, menu layer, type scale |
| M398 | A2, A3 | shot fence, subagent watcher (main) |
| M399 | A5, A6, A7, A9, A10 | wheel yield, palette freeze, dismissal, search, disabled reasons |
| M400 | B1 | one task form behind every door |
| M401 | B2, B3, B9 | review: merged state, sizing, one reviewed notion |
| M402 | B4 | one placement rule |
| M403 | B5, B6, B7, B8 | permission line, progress strip, return notice, ask a question |
| M404+ | C/D by impact per risk | decided after Wave B; skipped IDs listed with reasons |
| last-1 | critique → one fix batch → confirm | |
| last | gate | |

Machine rules: at most two app instances (slots 1–2, CDP 9210/9220); one Electron verify tier at a time via
`/tmp/tc-electron-lock` (a DIRECTORY: `mkdir` to take it, `rm -rf` only one you made). Builders run one at a time in
this checkout. Screenshots go to `/tmp/tc-daily-loop-shots/<ID>-{before,after}.png`.

## Milestones

### M397 — correctness in the stylesheet: note editor height, terminal scrim, menu layer, pane type

Reproduced every ID in the real built app (slot 1, CDP 9210) before touching it. Screenshots are in
`/tmp/tc-daily-loop-shots/` (`A1-before/after`, `A1-after-md-panel`, `A1-after-newnote`, `A4-before/after`,
`A4-after-focused`, `A8-before/after`, `A11-before-*/after-teammates`).

**A1 (P0), the Markdown editor is 0px.** *Reproduced:* starter note, measured by `eval`: `.file-node__editor` 224×0,
host 224×0, `.monaco-editor` 224×2.8. The body is `display: block`. *Cause:* as the prompt says, and wider than it
says. `.file-node__editor { flex: 1; min-height: 0 }` sizes nothing inside `.pf__body--text`, a block scroller, and the
host is `position: absolute; inset: 0`. So every file panel in edit mode was affected, not only notes. A plain `.txt`
had the same 0px host. *Fix:* the edit-mode body becomes a flex column only while Monaco is its child
(`.pf__body--text[data-file-mode="edit"]:has(> .file-node__editor)`). Its other children are `flex: none`, and the
editor is `flex: 1 1 auto` with a 64px floor, so a conflict banner in a short panel scrolls the body instead of
squeezing the editor back to nothing. Rich mode and the read view keep their block flow. The selector keys on
`.pf__body--text[data-file-mode]`, not `.file-node__body`, because `verify:styles frame.1` forbids a kind declaring
`__body`. *Measured after:* starter note 64 world px (the floor, since the starter's note panel is short, 160px, and its
body scrolls), a `.md` file panel 213px, ⌘K › New note 213px, a non-note `.txt` 213px (all at 57% zoom). Rich mode
still shows its content-height block (125px) with the body in block flow. *Checks:* `verify:panels:product
note.editor.height.1` measures `offsetHeight` of the host and of `.monaco-editor` on the starter note (≥48 layout px).
It runs after the agent door's second application of the starter, so it doesn't depend on `starter.1`'s visible-line
click, which is the baseline red. `verify:panels:kinds note.editor.height.2` measures the same on a plain file in edit
mode. *Note on the baseline:* `starter.1`'s `note` arm looks for "Welcome" in the note's text, which a 0px Monaco
never renders. But `starter.1` is still red for a different reason, `started: false`: the visible Starter line isn't
hit-testable because the launcher card is below the fold (A5, M399). Re-check it after A5 lands.

**A4 (P1), the terminal header hides row 0.** *Reproduced:* a fresh ⌘N shell showed no prompt at all. With the chrome's
background removed in the page, `alexnieves@… ~ %` and the cursor were on row 0 under it. The chrome was 44px tall with
a solid `--well` band down to 62%, about 2.6 rows. *Cause:* the scrim was a full-width band. Its comment's claim that it
only ever hides the oldest row is false on a fresh shell or after `clear`. *Fix (scrim only, box model untouched):* the
band paints nothing (`background: none`). The chrome stays `position: absolute` with the same padding and its lit top
edge (`--rim-top`). The `--well` backing moves onto the parts themselves: the title, the state word, and each control
while it is shown. The title's backing is a box-shadow spread up and left over whole cells, because a backing hugging
the name cut the prompt's first glyphs in half, which read as a rendering fault. It stops at the lit top edge
(`rim.paint.1`). *Decision:* at rest, row 0 now shows everything to the right of the name (the name covers the prompt's
first ~11 characters cleanly). While controls are shown (hover, focus, selected), the `⋯` control's own backing covers a
few cells of row 0. That was preferred to hiding the controls while typing, which would spend M44's reach rule.
*Checks:* `verify:panels:core chromeless.row0.1`. elementFromPoint can't see this, because the chrome is
`pointer-events: none` at rest. So it measures computed style: the band paints nothing, the parts that paint a backing
(inflated by their shadow reach) cover under half of row 0's width (0.249 measured), the chrome stays
`position: absolute`, and the name is visible at rest. `chromeless.resize.1` / `.paint.1` / `rim.paint.1` stay green.

**A8 (P2), the minimap draws over the View menu.** *Reproduced:* the minimap (z 940) painted over the right half of
the theme rows. `elementFromPoint` there returned `minimap__view`. The shortcut read `⇧⌘\\`. *Cause:* the menu's 950
ranks only inside `.shell__top`'s stacking context, and the bar was 920. The label was JSX text, which is not a string
literal, so `\\` printed two backslashes. *Fix:* `.shell__top` goes to 960, above every canvas HUD layer (pill 930,
minimap and toaster 940, HUD 950) and under the palette scrim (999) and modal sheets (1000). `.link-banner` goes from
930 to 970 to keep its M257 guarantee of out-ranking the bar. The label is `{'⇧⌘\\'}`. *Check:*
`verify:panels:agents menu.layer.1` opens View with a real click and requires every row point over the minimap to win
elementFromPoint, plus the one-backslash label. At the harness's window size the two don't meet, so the menu is
translated onto the map inside its own stacking context and back. Stacking is decided by the contexts, not the position.
Setting the bar back to 920 in the live app made 6 probes land on `minimap__view`.

**A11 (P2), text at 16px.** *Reproduced* by scanning the rail for own-text elements at 16px: the Teammates name input
and its `.pf__note`, the Skills pane's empty note, and every `.skill-card__name`. *Fix:* `.shell__rail .pf__note` takes
`--t-sm` (a note inherits the reading body's `--t-base` inside a panel, but in a rail pane its nearest sized ancestor
was the document). `.skill-card__name` takes `--t-sm`, which other rail labels get from `.rail-row__main`. The
Teammates name field takes the panes' shared input look (the `.inspector__input` / `.vault-pane__filter`
declarations: line border, `--r-sm`, `--s-1`, `--t-sm`, iris focus ring). After: the rail scan finds nothing at 16px.
*Check:* `verify:styles pane.type.1` (static; P2). *Not done:* the Teammates note sits flush against the rail's left
edge with no inset. That was true before and isn't text size, so it's left for the lead.

**Goldens expected to move (not written; the lead does goldens):** `starter` (the note now paints its editor). Every
scene with a live terminal (A4 — the band scrim is gone and the name has its own backing), e.g. `kinds`, `kinds-dark`,
`header`, `trail`, `attention`, `palette*`, `flip`, `overview`, `group*`, `merged`, `zoomed-out*`, `compact`, `wide`.
Any scene with a file draft open. `skills`, `teammate`, `routine` (A11). `account-menu` only if the minimap is in its
frame (A8).

**Suites:** `verify:styles` 93/93. `verify:panels:core` 86/86. `verify:panels:kinds` 51/51. `verify:panels:agents`
83/84: only `template.1` (baseline). `verify:panels:product` 130/131: only `starter.1` (baseline). Two earlier product
runs hit the watchdog and three workflow drag checks went red while macOS's `mediaanalysisd` held the load average at
20–85. At load 5 the same code ran green but for the baseline in 182 s, so those reds were load, measured by the re-run. `npm run affected` (39 suites): 37 passed. The two reds are `panels:agents` (`template.1`, baseline) and `panels:product` (`starter.1`, baseline, plus a watchdog at 230.7 s while the load average was 7–16). Re-run alone at load 4–5, product finished in 181.7 s (79% of its watchdog) with only `starter.1` red.
