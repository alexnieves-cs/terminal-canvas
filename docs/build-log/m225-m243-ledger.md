# M225–M243 — the v11 visual run: Obsidian amplified

The run prompt: [`docs/superpowers/specs/2026-09-09-v11-visual-run-prompt.md`](../superpowers/specs/2026-09-09-v11-visual-run-prompt.md).

This ledger, not memory, is the state. Rebuild from it, then `CLAUDE.md`, then the Act 0
brief (M226), then README's milestone table, in that order.

**The golden gate.** No `UPDATE_GOLDENS=1` for a scene until a fresh-context critic has looked
at that scene's before/after/diff and written a sentence here saying what changed and why it is
correct. Every such sentence lives under its milestone's "goldens touched" heading.

**Numbering.** M193–M224 are reserved by the v10 product guide and are worked separately; this
run takes M225–M243 and touches no D-item.

---

## Act 0 — the baseline and the brief (M225–M226)

### M225 · baseline

- Branch: `m225-visual-baseline`, off `main` at `24165b7`.
- Tree confirmed clean before the first line changed (the v10 in-flight work named in the
  prompt had already landed at `13b84be`; nothing of anyone else's was committed or reverted).
- Stale verify tmux servers killed before the baseline run (the load-flake rule).

**`npm run verify` — exit 0, 0 FAIL, at `24165b7` before a line changed.** Per-suite tallies:

```
verify:onboarding    14/14      verify:agent-state     27/27
verify:meta          40/40      verify:agent-session  141/141
verify:styles        56/56      verify:verbs           23/23
verify:viewport     142/142     verify:teammates       26/26
verify:groups         6/6       verify:electron         4/4
verify:merged        12/12      verify:control         26/26
verify:registry      38/38      verify:package         13/13
verify:layout       255/255     verify:pty             10/10
verify:credentials   18/18      verify:pty-manager     63/63
verify:jira          15/15      verify:window           4/4
verify:github         7/7       verify:ipc              1/1
verify:palette      148/148     verify:canvas           6/6
verify:rail         204/204     verify:xterm           11/11
verify:review       106/106     verify:panels:core     78/78
verify:subagent      27/27      verify:panels:shell    96/96
verify:file          97/97      verify:panels:kinds    49/49
verify:toolbox      104/104     verify:panels:agents   80/80
verify:usage         26/26      verify:panels:product  96/96
verify:machine-cost   7/7
verify:tmux          35/35
```


**`npm run verify:packaged` — exit 0, 12/12 passed** at the same sha (the pre-release gate:
a real signed-shape build, the scratch socket, a PTY in the packaged app, the single-instance
refusal and the incumbent's survival).

### M225 · the zero-diff proof, and what it caught

`npm run build && npm run verify:visual` was run with **nothing changed**, to prove the harness
is stable before a single golden is allowed to move. It was not stable — and the instability was
not the harness:

```
58/60 passed
FAILED: kinds     FAIL — a 32px tile at 672,736 is 40% different (budget 35%)
        kinds-dark FAIL — a 32px tile at 672,736 is 37% different (budget 35%)
[verify:visual] 177.5s wall
```

**The other 56 scenes reproduced under both budgets**, so the harness itself is stable — the
`shot` fixture, the window size, the theme switches and the real-Electron paint all repeat. The
two failures are one real change in one place: the tile at `672,736` in both themes is inside the
`Watchdog fires under load` work card, and comparing the golden with the fresh capture shows the
card's verb row changed from `Assign to… / Open PR / Review / Done` to `Start work… / Resume`,
with a new `review: not started` line above it.

**That is M202's change, not this run's.** `13b84be` ("review handoff and readiness") touched
`src/renderer/work/WorkNode.tsx` — the v10 D07 work that landed on `main` days before this run
opened — and did not regenerate the two goldens that paint a work card. `git log --oneline --
verify/visual/goldens/kinds.png` last moves at `0ad5ea0` (M179).

**Disposition.** The two goldens are rebaselined HERE, at M225, through the full golden gate — a
fresh-context critic looked at before/after/diff for each scene and wrote the sentence recorded
below. The alternative was to carry two permanent reds on the two most information-dense scenes
in the suite for the whole of Acts I–V, which would mask exactly the drift the gate exists to
catch. The sentences attribute the change to **M202**; nothing in this run caused it, and the
final message says so.

This is also the answer to a question the run prompt asks implicitly: a golden that changed
without a critic's sentence fails the goal condition, and two of them were already in that state
on `main` when the run started.

### M225 · the golden walk — what is flat, per scene

All 58 declared scenes were walked by four **fresh-context critics** (no prompt, no spec, no
source — images only). Their sentences, by scene. This list is Act V's audit input.

| Scene | What is flat |
|---|---|
| `across` | Panel bodies, rail and canvas ground sit within a few points of one value; the review sheet is separated only by a hairline, the file rows read as flat tinted bands rather than recessed diff wells, and the `on exit 0` edge is bare grey geometry with a loose label. |
| `approval` | The floating diff sheet, the attention toast, the minimap and the panels are one near-white on near-white; the sheet reads as a cutout, and the diff's code block and the eight-button control grid are flat tiles that never read as wells or keys. |
| `attention` | The attention HUD, the callout, the tooltip cards and the minimap all sit on the canvas value with a 1px hairline, so the HUD and minimap read as pasted-on rectangles; the amber border is the only real depth cue in frame. |
| `auto` | The composer well reads as a printed line rather than a field, the diff block sits flush with the prose, and the minimap floats with a plain 1px border and no shadow. |
| `board` | The four lanes are divided only by hairlines with no lane well, and the focused task card sits at the same fill as the panels it overlaps, so its four inline buttons read as unlit holes rather than a raised sheet. |
| `browser` | The URL field and the device/Capture strip sit at the page body's value, so two rows of chrome eat space above content that should run edge-to-edge and the address field reads as painted-on text. |
| `chat` | The focused chat is the only surface with elevation, which exposes that its own composer well, the collapsed `2 tools` row and the snippets are all the panel's own white — every internal division is a hairline. |
| `chat-copilot` | The `New panel…` sheet has no more elevation than the panels beneath it, and its WHERE/WHAT/TITLE fields are outlines at the sheet's fill, so no input reads as a well. |
| `compact` | The context pane's stacked action grid eats a block of vertical space, and its disabled cells are indistinguishable in MATERIAL from live ones — every button is the same flat outlined rectangle on the pane's own value. |
| `composer` | Four nested boxes (attachment row, file suggestions, chip row, message field) in one white with 1px borders, so nothing says which layer is the typing surface. |
| `file-missing` | The action grid's disabled and enabled controls are nearly indistinguishable, and the `not found` chip reads as static text. |
| `flip` | The green flip placard is the one piece of material with a value shift, which exposes the panel bodies behind it as white voids with no recess for their terminal wells. |
| `github` | The frontmost floating sheet is the same value as the panels beneath; inside, three issue blocks are separated purely by hairline rules with no card material; the minimap is a flat rectangle that does not read as an overlay. |
| `graph` | The selected edge is a plain grey hairline arrow with no colour, weight or badge expressing its `after a turn` rule while the context pane describes that rule in text. |
| `group` | The group frame is bare geometry — an outline and a label, no fill, tint or shadow tying its children together — and the wells inside both panels sit at the exact white of the panel chrome. |
| `group-collapsed` | The dashed boundary carries nothing but a title; both members sit at the ground value, and the `asleep` panel reads as an empty hole. |
| `header` | Tabs and RUNS rows are on one flat ground with an underline and hairlines carrying all the hierarchy; the open panel menu renders its rows as full-width outlined boxes that read as empty input fields. |
| `ink` | The ink stroke crosses the group frame and the panel with identical weight in both, so the drawn layer has no sense of sitting above or below; the `Annotating` bar is a white pill on white canvas. |
| `inspector-detail` | One continuous white column: no recessed field or grouped card for COMMAND/CWD/MACHINE, and the tab underline is the sole hierarchy signal in the rail. |
| `inspector-tools` | A flat text list — skill rows are plain text with no row surface, `Open toolbox` is a hairline chip, and the pane's boundary is one vertical hairline. |
| `inspector-work` | The four sections are the pane's own value with hairline rules, so the pane reads as one undifferentiated sheet; the two terminal wells are pure white with no recession, indistinguishable from a blank note. |
| `integrations` | The pane dissolves into the workspace (one hairline at its right edge), and `Verify` / `Reconnect…` are thin outlines that read as empty fields rather than actions. |
| `kinds` | Terminal, review, file, note, board and chat are the same white card with the same hairline and a thin left accent, so a code viewer, a Markdown note and a live terminal read as identical sheets of paper. |
| `kinds-dark` | Every panel body is the same near-black as the canvas; panels are defined purely by hairline plus a coloured accent, and the dark scene loses even the faint light-mode shadow that would say "above". |
| `launcher` | One flat white slab: the teal primary is the only element with material, the secondary rows are bare text with hairline dividers, and the two cards read as empty text inputs rather than pressable. |
| `lineup` | A large white slab on white whose only depth cue is a soft blur; every field is a white box on white with no inset. |
| `memory` | No zebra or recessed table ground on the row list, and the input plus kind dropdown are flat outlines flush with the panel, so the composer does not read as an input bar distinct from the log. |
| `merged` | At 22% the board is a field of undifferentiated pale rectangles; the workspace box is a bare hairline rectangle and the connectors are thin grey hairlines carrying no direction, weight or label. |
| `navigator-files` | Almost entirely empty grey with no tree well or indentation guides, and the caption chips are flat boxes at the panels' own value so they read as clipped fragments rather than notes floating above. |
| `navigator-panels` | The callout cards, the chat and the terminal well are white-on-white with hairlines; the terminal body in particular does not read as a recessed output well. |
| `navigator-workspaces` | Rail, workspace list and canvas are three surfaces at one value; the selected row's pale tint and the rail hairline do all the work. |
| `overview` | The amber border proves state CAN be expressed in the frame, yet the body is an empty white rectangle with no terminal recess, and the note cards have no shadow so they read as holes punched in the panels beneath. |
| `palette` | The most-floating surface in the app has a faint border and no scrim or strong shadow; its search field and rows share the palette's own value so the selected row is a barely-there band. |
| `palette-dark` | The palette body is a mid-grey barely above the scrim, the selected row is a slightly lighter band, and the search field has no recessed material at all. |
| `palette-query` | Neither the palette's elevation nor the current selection is expressed by material — the highlighted row is a barely-tinted band and the scrollbar a faint sliver. |
| `reduced-motion` | With motion removed nothing is left to express state: the `click to start` well is the panel's own white, the needs-you badge is a flat pill with a hard pointer and no elevation, and disabled rows differ only by lighter text. |
| `routine` | A text input, a read-only value, a button and a textarea are all the same flat outlined rectangle, so nothing distinguishes an editable well from a pressable surface. |
| `runs` | The terminal's output area is identical to its own title bar and to the canvas behind it; the `on exit 0` label floats unattached with no chip or track binding it to the line. |
| `search` | The palette reads as a flat white slab, the query is large text on the same white rather than a recessed field, and the selected row is a faint tint plus a 2px bar. |
| `search-empty` | The empty state is one flat strip inside an unelevated popover, so it reads as a torn-off piece of the top bar rather than a floating overlay. |
| `skills` | The shelf columns are hairline-outlined boxes at the rail's own value so they read as table cells rather than cards, entries have no separation from one another, and the selected panel's well is flat white despite a focus ring. |
| `spawn-sheet` | The autocomplete under WHAT has no elevation over the field it overlays, so the suggestion list reads as part of the form; the ENV textarea has no inset. |
| `start-work` | Three outline-only fields on the sheet's own white, no scrim or shadow over a live canvas, and the primary action is hint text rather than a button — nothing reads as pressable. |
| `starter` | The flattest scene: every example card is a white rectangle on a barely-tinted frame that is itself near-white, and the workflow inside is bare boxes joined by grey hairlines. |
| `subagents` | The caption chip merges with the panel behind it (both white with a hairline), and the terminal well is an expanse of pure white with no inset, texture or gutter to say "a live console". |
| `supervisor` | The sheet floats on a blur alone, and its path field and the explanatory paragraph sit on one white — editable input and static help text are indistinguishable as surfaces. |
| `teammate` | Brief textarea, checkboxes, name and interval inputs all sit at the pane value with 1px outlines; the browser's viewport-preset row is a toolbar of same-value chips eating a band above content. |
| `templates` | The modal's shadow is so soft it merges into the blurred canvas, and its three inputs are hairline outlines at exactly the sheet's white. |
| `tool-objects` | The only element with real depth is the diff's red/green tinting; the tool-call card, the sheet containing it and the canvas are three nested surfaces at one white with hairlines. |
| `trail` | The four trail cards neither connect visually to the panel they describe nor read as a layer above the canvas, and the host's `$ claude` output area shows no recessed well. |
| `vault` | The filter box and note list are flat on the rail; the note body, its BACKLINKS block and the line-numbered listing sit at panel value with only rules between them. |
| `verbs` | A real error is red text on the same white as the input with only a hairline between, giving it no material weight; the attention card and the diff card both float with no shadow. |
| `watcher` | Six controls in a toolbar row compete with two lines of command output beneath, and the echo strip and status strip are hairline bands on the same white as the well. |
| `wide` | Two stacked toolbars plus two lines of status prose eat roughly a third of the workflow panel above the diagram; node boxes, edges and port dots are uniform grey geometry. |
| `workflow` | Two full rows of hairline chips above the graph eat vertical space; the nodes are flat grey boxes and the edges thin grey arrows whose labels sit on the canvas rather than on the edge. |
| `workflow-edit` | The flattest of the workflow scenes: node cards, the block library and the graph ground are one white, and the edges are plain grey arrows whose only information is a small text label. |
| `zoomed-out` | At 22% every panel collapses to the same white card with a hairline so the cluster reads as noise; only the two tinted cards carry signal and the connectors are threads that vanish at this scale. |
| `zoomed-out-dark` | **The best-differentiated scene** — the dark ground gives the miniatures genuine figure/ground and amber/cyan read at a glance — but the connectors are faint bare strokes carrying no information. |

### M225 · defects the walk found (not material — recorded for M242)

Reported by the fresh-context critics as genuine rendering defects rather than flatness. Each
carries a disposition in M226 below.

1. ~~**`palette-dark` / `zoomed-out-dark` — the shell chrome stays LIGHT while the canvas and
   the palette are dark.**~~ **NOT REPRODUCED.** Checked against `palette-dark.png` directly:
   the top bar, the navigator rail and the context pane are all fully dark, and `k.theme('dark')`
   is the same mechanism `kinds-dark` uses, which the same critic called correctly dark. The
   critic was wrong. Recorded because M191 has a similarly-worded DECLINED finding on this scene,
   and conflating the two would have carried a phantom defect into 5.1 — an agent's finding is
   evidence, not a verdict.
2. **`palette` / `palette-dark` — the last row is hard-clipped mid-glyph** at the list's bottom
   edge with no fade or scroll affordance, so it reads as broken rather than scrollable.
3. **`routine` — the teammates rail overflows**: the `ada` row's detail line is drawn on top of
   the `bo` row and the interval labels are clipped at the rail's right edge.
4. **`teammate` — the rail's content runs off the bottom of the window** (the PROMPT field is
   cut) with no visible scroll indication.
5. **`starter` — the caption chips overlap the bottom edge of the card above them**, and the
   note card's Save is cut off by the card's right edge.
6. **`verbs` / `attention` — the attention card sits half over the rail's notification bell** and
   is clipped by the window's bottom edge.
7. **The minimap overlays panel content** (`attention`, `group`, `group-collapsed`, `kinds-dark`)
   and clips the needs-you badge. The minimap IS an overlay by design; what the critics object to
   is that it does not READ as one.
8. **`integrations` — a code fragment runs inline with prose with no code styling**
   (`tc api jira <path>`), and the refused-broker sentence wraps awkwardly in red at small size.
9. **`workflow-edit` is rendered at a larger canvas than its neighbours** (it declares
   `size: [1800, 1000]`) and its `workers`/`report` nodes are clipped by the panel's right edge.
10. **Several scenes show panels clipped mid-word at the viewport edge.** Most of these are the
    fixture's deliberate framing, not a defect; `chat`'s right-hand text cut flush against the
    window with no container visible is the one worth re-checking.

---

## M226 · the brief

Spec: [`docs/superpowers/specs/2026-09-09-m226-obsidian-amplified-brief.md`](../superpowers/specs/2026-09-09-m226-obsidian-amplified-brief.md).

It carries the elevation scale (both themes), the rim recipe, the edge-flow state table with the
exact source of each signal, the chromeless frame rule with its per-kind exception list, the
motion budget, and the aura's activity term with its budget.

### M226 · findings and dispositions

The M225 walk collapses into five themes plus a defect list. Every one carries FIX-in-act-N or
DECLINE-with-a-reason; nothing is left without one.

| # | Theme, from the walk | Disposition |
|---|---|---|
| A | **One value everywhere.** Panel, ground, rail, pane and overlay sit within a few points of each other; a hairline is the only separation. Named in 40+ of the 58 scenes. | **FIX — Act I (M227–M228) and Act IV.** `--glass-0`/`--glass-3` widen the ramp; the rim pair gives a raised surface a lit top edge. The two existing levels do not move, so every golden stays a valid comparison. |
| B | **No recessed wells.** Terminal wells, code blocks, inputs, textareas, search fields and composers are flush with their panel; "the terminal body does not read as a live console" is said five separate ways. | **FIX — M228, then per-surface in Act IV.** `--glass-0` + `--rim-inner`. The terminal's own screen keeps painting `--well` (xterm's background) — the recess is the FRAME's, not the cells'. |
| C | **Nothing floats.** The palette, sheets, menus, popovers, the minimap, the attention HUD and the caption chips read as pasted-on rectangles or as holes punched in the panels beneath. | **FIX — M240 (palette/launcher/sheets), M241 (minimap).** These are the `--glass-3` tier. They are also the surfaces most likely to acquire a stacking-context bug, so each gets an `elementFromPoint` PAINT check, not a query check (M149's lesson). |
| D | **Edges are bare geometry.** `on exit 0` labels float unattached; the selected edge expresses its rule only as text in the context pane; at 22% the connectors vanish. | **FIX — Act II (M230–M233).** Six states, each from a signal already on the wire. The label's unattached feel is answered by the armed line lifting to `--iris-dim` rather than by a new chip. |
| E | **Toolbar rows eat content.** Terminal, watcher, browser and workflow headers put four to six controls above content that should run edge-to-edge. | **PART FIX, PART DECLINE.** Terminal: FIX in Act III (chromeless). Watcher, browser, workflow, chat, review, file: **DECLINED** — their headers carry a fact the body does not repeat (a state word, a device width, an address, a count), and removing them would hide information rather than chrome. The frame rule (brief §4) is the written form of that split; M236 puts it in `CLAUDE.md`. |

| # | Defect from the walk | Disposition |
|---|---|---|
| 1 | dark-theme chrome | **NOT REPRODUCED** — see above; the critic was wrong. |
| 2 | the palette's last row clipped mid-glyph with no fade | **FIX — M240.** Confirmed by hand on `palette-dark.png`. A clipped row and a scrollable list are two different facts and currently look identical. |
| 3 | the teammates rail overflows and rows overlap | **DECLINE for this run** — a layout defect in the teammates pane, not material; it is not on any surface Acts I–IV touch. Recorded in `docs/visual-audit-5.1.md` (M242) for the next product run. |
| 4 | the teammate rail's content runs off the bottom with no scroll indication | **DECLINE for this run**, same reason as 3, and recorded with it. |
| 5 | `starter`'s caption chips overlap the card above; the note card's Save is clipped | **DECLINE for this run** — M181's starter geometry, not material. Recorded in M242. |
| 6 | the attention card sits over the rail's bell and is clipped by the window | **DECLINE for this run** — the popover's anchoring, not material. Recorded in M242. |
| 7 | the minimap overlays panel content and does not read as an overlay | **FIX (the second half) — M241.** The overlap is by design; that it does not READ as an overlay is exactly theme C. |
| 8 | `integrations` runs a code fragment inline with prose with no code styling | **FIX — M238**, where the context/integration surfaces get the material pass; a mono leaf inside prose is already the M164 idiom. |
| 9 | `workflow-edit` is rendered larger than its neighbours and clips two nodes | **DECLINE** — the scene declares `size: [1800, 1000]` deliberately (it is the wide-editor scene). The clipping is the fixture's framing. |
| 10 | panels clipped mid-word at the viewport edge | **DECLINE** — the fixtures' deliberate framing in every case checked. |

### M225 · goldens touched — the two M202 rebaselines, and their critic sentences

A **fresh-context critic** (no prompt, no ledger, no spec — the three images per scene, plus
`WorkNode.tsx` to confirm what a control does) walked before / after / diff for both scenes.
It computed the changed regions from the diff bitmaps rather than trusting the gate's summary,
and found the real changed area is **two clusters totalling ~336x80 px**, not the single 32px
tile the gate reports — the gate names only the WORST tile.

> **`kinds`** — the work card gained `execution: not started` and `review: not started` facts, a
> new enabled `Resume` verb, an `Assign to…` → `Start work…` relabel and a now-disabled
> `Review`, **and that is correct because** each is the rendered consequence of the
> handoff/execution props in `WorkNode.tsx` (the label from `handoff.actionLabel`, `Review`
> disabled with `handoff.detail` as its reason, refusals shown by name rather than removed), and
> the card still reads complete and unclipped.

> **`kinds-dark`** — the identical change appears with correct dark-theme tokens and no other
> structural difference, **and that is correct because** the two scenes render the same fixture
> through the same component, so the dark golden must move in lockstep with the light one.

**Both sentences describe M202's change, not this run's.** Nothing in M225 touched a component.

### M225 · the second finding — the goldens baked an ephemeral port

The same critic found something the gate structurally cannot: the rail's
`browser · 127.0.0.1:<port>` row differs on EVERY capture, because `scripts/shot.cjs` opened its
harness dev server with `listen(0)`. About 171 differing pixels — under both budgets, so the
suite never says a word, which is precisely the blind spot `verify-visual.cjs`'s own header
declares ("a change under both is under this suite's sight").

That is noise inside the one artefact this whole run's gate compares against, and every
`UPDATE_GOLDENS=1` froze a fresh meaningless number into it.

**FIXED in M225**: the harness now prefers port `31789` and **falls back** to an ephemeral port
if it is taken. Deterministic where it can be, degrading where it cannot — a machine where the
port is busy must still be able to paint the scenes, and a differently-sized port number there
is still under both budgets. Failing loudly instead would have traded a cosmetic gain for a
harness that cannot run on a busy machine.

This is in scope for M225 rather than deferred: the milestone's stated job is to prove the
harness stable at zero diff, and this is a harness-stability defect that proving it uncovered.

---

## Act I — the material (M227–M229)

Branch: `m225-visual-baseline` (Act 0 and Act I share it; the act closes to `main` with its
build log).

### M227 · the depth tokens

- Spec: [`2026-09-09-m227-depth-tokens.md`](../superpowers/specs/2026-09-09-m227-depth-tokens.md)
- Plan: [`2026-09-09-m227-depth-tokens-plan.md`](../superpowers/plans/2026-09-09-m227-depth-tokens-plan.md)
- Red-first evidence: [`m227-pure-red-evidence.md`](m227-pure-red-evidence.md) — `depth.1` and
  `rim.1` both watched FAILING against the untouched stylesheet, with the details naming the
  absence (`declared: [1, 2]`, `both: false`), so neither was passing by accident.

**What landed.** `--glass-0`, `--glass-3`, `--rim`, `--rim-inner` in **both** theme blocks, and
nothing else. `--glass-1` and `--glass-2` keep their M109/M163 values exactly.

**New check `depth.1`** — the ramp declares all four levels in both blocks and elevation is
monotonic: a surface sits on `--glass-N` only inside a surface below `N`. It is a containment
test over selector TEXT, and the prefix test requires a combinator deliberately — a bare
`startsWith` would make `.pf` "contain" `.pf__body`, a BEM sibling, and the check would fail on a
correct stylesheet. Its blind spot (containment that exists only in the DOM) is written into its
own comment rather than left for a later reader.

**`obsidian.1` extended** with all four names. It is a FLOOR — it filters for MISSING names — so
adding to it can only tighten it; a load-bearing token that no check pins is one a later run
deletes without noticing.

**`rim.1` held to M228.** A check that requires a surface to USE the pair cannot be satisfied by
a milestone that changes no surface. Landing it here meant either a red suite or a check written
to pass vacuously, and the second is worse.

**The values, and why the ramp is right.** Measured relative luminance says `--glass-0` reads as
`--s-0` in the dark theme — but `--s-0` is not its parent. A well sits inside a PANEL, and against
`--glass-1` the dark well is about a third of the panel's luminance and the light well is clearly
darker than its panel. The ramp is monotonic **against each surface's actual container**, which
is what `depth.1` checks and what the eye reads.

**Zero-drift proof.** `UPDATE_GOLDENS=1 npm run verify:visual` on a build carrying these four
tokens wrote **exactly the two goldens M202 had left stale and kept the other 56 byte for byte**
(`59/59 passed`). Fifty-six scenes unchanged with the tokens declared is the evidence that the
token layer is inert until it is spent — the claim M227 exists to make.

```
PASS  kinds golden written
PASS  kinds-dark golden written
56 × "golden kept — unchanged within both budgets"
59/59 passed
```

**Goldens touched:** `kinds`, `kinds-dark` — both attributed to **M202** above, with a critic
sentence each. **No golden moved for M227's own change.**

### M228 · the rim pair, applied

- Spec: [`2026-09-09-m228-rim-pair.md`](../superpowers/specs/2026-09-09-m228-rim-pair.md)
- Plan: [`2026-09-09-m228-rim-pair-plan.md`](../superpowers/plans/2026-09-09-m228-rim-pair-plan.md)
- Red-first evidence: [`m228-pure-red-evidence.md`](m228-pure-red-evidence.md)

**What landed.** `--rim-top` (the recipe, on bare `:root`) worn by `.panel` at all eight rules
that write the frame's shadow and by `.launcher`; `--rim-inner` worn by `.panel__slot::after`
and `.launcher__well`. Two new PAINT checks in `verify:panels:core`.

**Three findings, none of which a text-level check could have produced.** All three came from
mutation-testing the paint checks — delete the rim pair, rebuild, re-measure. The full account
is in the red-evidence file; the short form:

1. **`box-shadow: inset` on `.panel__slot` never painted.** An inset shadow paints between an
   element's background and its CONTENT, and xterm's canvases *are* the slot's content.
   `verify:styles` was green on a rule that did nothing. The recess moved to
   `.panel__slot::after` at `z-index: 11` (xterm's layers run to 10; `.pf__body`'s
   `isolation: isolate` keeps that number local) with `pointer-events: none`.
2. **`--rim` was a second name for `--edge-light` — STRUCK.** `.pf__chrome` has carried
   `inset 0 1px 0 var(--edge-light)` since M109 and the chrome's top edge IS the frame's top
   edge; a paint check measured the two stacked at one y, values agreeing to within .03 alpha
   in both themes. M226's brief §2 argued they could not collide, named their separate sites,
   and was wrong. The brief is struck with the measurement. `--rim-top` resolves to
   `--edge-light`; `--rim-inner` survives because nothing recessed anything before it.
3. **Both paint checks were VACUOUS on their first two cuts** — they passed against a
   stylesheet with the rim pair deleted, because "a lit band exists at a frame's top edge" is
   also true of the border, and "a dark band exists at a slot's top edge" is also true of the
   chrome's border-bottom. Both were rewritten as DIFFERENTIALS (two points on the same
   surface, compared) with every sample point validated by `elementFromPoint` first.

**`rim.paint.1` is recorded as an INVARIANT, not a delta.** It still passes under mutation,
because the frame's lit top edge predates M228. What M228 changes is whose property it is —
`.panel`'s rather than whichever child sits at the top — so the check's real job begins in
Act III, when the chrome stops being that child. Saying this plainly is the point: a green
check whose meaning is misread is worse than no check.

**Why `--rim-inner` was deepened twice.** First cut `inset 0 1px 2px / .55` (dark): measured a
6-point luminance dip — the paint check called it correctly as no recess. Second cut
`inset 0 2px 4px / .8` on the wrong element: no dip at all. Shipped at `inset 0 2px 3px / .9`
on the pseudo-element: a 6.79-point sink, with the first row of agent output untouched. This is
M163's `--edge-light` finding (.06 invisible, .11 visible) met a second time — answered before
the milestone shipped rather than two versions later.

**The visual gate saw nothing, and that is arithmetic.** `verify:visual` reported **60/60** with
the rim pair on every panel in every scene. A 1px feature contributes one row to a halved
golden: 32 of 1024 pixels in a 32px tile (3.1% against a 35% budget) and far under the 0.5%
frame budget. **A green `verify:visual` is SILENT about this milestone** — it is not
confirmation, and the six scenes below were therefore forced through the gate by hand, as the
run's own rule for a change that matters and sits under the budget requires.

### THE GOLDEN GATE — a procedure correction, made mid-act

The gate says a fresh-context critic must compare **before, after and diff** before
`UPDATE_GOLDENS=1` runs. Acting on that naively produced a **false finding**, and the correction
is load-bearing for every act after this one.

**What went wrong.** `verify:visual` writes `out/visual/<scene>.fresh.png` only for a scene that
FAILS. M228's change was under both budgets, so no scene failed and no "after" existed. To give
the critic something to compare, the golden was used as "before" and a `npm run shot` capture as
"after" — **two different capture paths**. The critic (correctly, from what it was given)
reported that the light theme's frame highlight had been *dimmed* from 253 to 246, a net loss of
lit edge, and flagged it as the thing to decide before baselining.

**It was not real.** Re-measured with both sides captured by `verify:visual` — copy the golden
aside, delete it, let `UPDATE_GOLDENS=1` write the new one (a missing golden is always written),
then compare the copy with the new file — the light theme's frame edge moved by **exactly 0.00
on every row**, averaged over 270 px of x:

```
kinds (light)     y=86 213.4 → 213.4   y=87 253.0 → 253.0   y=88 247.0 → 247.0    Δ 0.00
kinds-dark        y=86  37.6 →  38.0   y=87  39.0 →  43.0   y=88  15.0 →  15.0    Δ +3.47
```

The light frame is unchanged because the panel's rim sits BEHIND `.pf__chrome`, whose fill is
nearly opaque white in that theme; in dark the chrome is 82% opaque and the rim shows through.
That is the expected behaviour of the change, and the "regression" was an artifact of comparing
across harnesses.

**The corrected procedure, used for the rest of this run.** Copy the goldens aside → delete them
→ `UPDATE_GOLDENS=1 verify:visual` writes them → critic compares the copies with the new files →
**if the critic rejects, restore with one `cp`.** The ordering deviates from the letter of the
gate (the golden is written before the sentence exists) and is recorded here rather than
glossed: the alternative is a critic judging two images the app never produced the same way,
which is what just manufactured a phantom defect. The copies are the rollback, and the decision
is still the critic's.

**The second correction: average, never sample.** Both capture runs carry sub-pixel rasterization
jitter of up to ~48 levels on glyph and high-contrast antialiased edges. Every measurement in
this ledger from here on is averaged over an area (270 px of x for an edge profile, 13x13 for a
point) which swamps it. A single-pixel reading in this repository is not evidence.

### M228 + M229 · goldens touched — the gate's sentences

Seven scenes, rebaselined together at the close of Act I. A **fresh-context critic** compared
each before/after with **both sides captured by `verify:visual`** (the corrected procedure
above), measuring averaged strips rather than sampling pixels.

> `kinds` — two terminal wells gained a soft 6-row inset shadow peaking at −35 and the lit line
> is a measured no-op, and that is correct because the light theme's inner top row already sat
> at 253 against a 247 fill, and the shadow returns to full paper 11 rows before the first glyph.

> `kinds-dark` — three panel rows gained a +3–5/255 lit hairline and one well gained an 11→5
> inset shadow, and that is correct because the line is clipped exactly to panel widths and
> properly occluded by the minimap and the group ribbon, and the shadow only dims the first
> output line's top 2 antialias rows while the glyph body holds CR 13.40.

> `subagents` — the well gained the standard −34 inset shadow and the ground cooled ~3/255
> toward blue, and that is correct because the shadow falls off monotonically to zero before the
> `$ claude` glyph body and the blue tint is a diffuse gradient with no edge.

> `inspector-work` — both terminal wells gained identical −34 inset shadows and the ground cooled
> ~3/255 toward blue, and that is correct because the two shadows are pixel-identical in profile,
> **proving one shared token rather than a per-panel reimplementation**.

> `runs` — one well gained the −34 inset shadow and the ground did not change at all, and that is
> correct because the scene's run has ended, so an unchanged idle aura is the specified behaviour.

> `launcher` — the launcher's well gained the same −39 inset shadow with an 11px clearance to its
> first text row, and that is correct because the launcher well now recesses identically to a
> terminal well.

> `zoomed-out-dark` — the ground warmed by up to +30 in R−B across two lobes with a smooth trough
> between them, and that is correct because a 3px-step derivative scan finds no hard edge
> anywhere in the canvas that is not also in the before image, so **the earlier seam is gone**,
> and the amber `needs you` card is pixel-identical while the ground beside it stays blue-leaning
> at R−B = −9.4, so it remains unambiguously the loudest thing in the frame.

**Two caveats the critic raised, kept rather than smoothed away:**

- **These goldens do not exercise "every panel frame".** Every panel in all seven scenes has a
  header bar, so the frame's own lit edge is occluded in each of them. It is measurable in dark
  (the chrome is 82% opaque) and a measured **no-op** in light. This is the same fact
  `rim.paint.1` records as an invariant rather than a delta, and **Act III is where it starts
  mattering** — a chromeless terminal has no header to supply the light.
- **In dark, the well shadow reaches 2–3 rows into the first output line's antialiasing** (top
  glyph row CR 3.02 → 2.63) while the glyph BODY is untouched at CR 13.40. Named, not hidden.

### M228 · a THIRD stale golden set, from M199/M200

The critic found a **fourth change** riding along in three of the seven scenes that is not this
run's: a green `idle` chip replaced by grey `run ended` text in `runs`, `subagents` and
`inspector-work`.

`git log -S "run ended" -- src/` names it: **`1776905 feat(m199-m200): make run supervision
honest`**, the v10 work that landed on `main` before this run opened. Like M202's work-card
change, it shipped without regenerating the goldens it altered — and unlike M202's, it sat
**under both budgets**, so the M225 zero-diff proof could not see it either.

> `runs`, `subagents`, `inspector-work` — a green `idle` state chip became grey `run ended`
> text, and that is correct because `run-outcome.ts:167` returns `{ word: 'run ended', tone:
> 'none' }` for a sealed run, which is M199's own decision that a finished run is not a state a
> panel is IN; it is attributed to **M199/M200**, not to this run.

**The pattern is the finding.** The v10 run shipped at least two UI changes without regenerating
their goldens, and one of them was invisible to the gate by arithmetic. `git log --
verify/visual/goldens` has therefore been an incomplete record of what this app looks like.
Recorded for M242's audit; not this run's to fix beyond baselining what it touched.

### M228 · a second nondeterministic region, recorded not fixed

`runs.png` bakes a live `pid 74607`. Same class as the ephemeral port M225 fixed, but harder:
the port was the harness's own server and could be pinned, whereas the pid belongs to a real
spawned process. It is under both budgets, so it never fails — it simply means one more region
of one golden carries a number that means nothing. **DECLINED for this run**, recorded for M242.

---

## Act II — reactive edges (M230–M233)

### M230 · the pure model

Spec/evidence: [`m230-pure-red-evidence.md`](m230-pure-red-evidence.md). `shared/edge-activity.ts`
— six states keyed `from:to`, each a PROJECTION of a fact the renderer already computes. Six
checks watched failing with **142/148 still passing**, which the try-wrapper in
`viewport-entry.cjs` is what makes possible.

Red-first found **two bugs in the checks rather than the model** (a fixture that seeded a 50 ms
arrival and expected breathing; one that expected an edge to be armed with its endpoint outside
the armed set), and then a real ambiguity in the brief, resolved and recorded: "unarrived edges
stay at rest" is read as **stay STILL**, so an undelivered edge inside a live run is `armed` —
lifted and static. Three readings kept apart where the literal one offered two.

### M231 · the store

`renderer/canvas/useEdgeActivity.ts`, modelled on `agent-state-store.ts`. Module-level,
subscribed per edge, snapshot objects cached, and **cleared at all four panel-removing call
sites** beside `clearAgentState`, plus `forgetAllEdges` on a workspace switch (which closes
nothing, so the per-panel path would never fire).

**It does not ride `registry.version()`**, and the store's header says why at length: that
counter carries tier/status/focus/exit and deliberately nothing higher-frequency.

**The store holds the state; the layer owns the animation.** A firing packet's `t` changes every
frame, so pushing it through the store would notify sixty times a second per edge — the exact
fan-out the module exists to avoid. `same()` deliberately does not compare `t`.

### M232 · the layer

One shared rAF for the whole layer, none at all while `edgesAnimateNow()` is false — which is a
canvas's normal condition even mid-run, so the common case pays nothing. Five of the six states
are pure CSS on the line that already existed; only `firing` adds an element.

**Three defects found by LOOKING at the new scene, none by a check:**

1. **The far-tier cull was inverted.** The run prompt says "culled at `cardDetail === 'tail'`",
   and `tail` is the **nearest** tier in `card-detail.ts` — the tier names say what a card SHOWS
   (its scrollback tail), not how far away it is. Implemented literally it disabled the whole
   grammar at 100% and left it animating across a hundred cards at 8%: the exact opposite of the
   budget the rule protects. **Silent**, because a feature that never animates is
   indistinguishable from one that is idle. The brief is corrected with the reason.
2. **The arrowhead stayed grey on a lit line.** An SVG marker does not inherit its path's stroke
   — the same fact that forced `link-arrow-selected` to exist in M78. A third marker,
   `link-arrow-flow`, rather than reusing the selected one: `selected` means "the user is
   pointing at this" and `flow` means "something is crossing it".
3. **The packet was painted, correct, and invisible — twice.** Once behind three panels (links
   paint BENEATH panels by design, M13), once behind the navigator rail at `client x = 268`. Both
   times the DOM was right. The scene's diagnostic now logs the packet's **painted rect**, not
   its presence.

### M233 · arrival, blocking, reduced motion, and two new scenes

- The arrival flash reuses `.pf::before` — M109's state-edge glow — so it inherits that
  pseudo-element's clipping and `pointer-events: none`, and one element cannot contradict itself
  about what an edge of the frame means. `--iris`, not the tone: an arrival is the INTERFACE
  reporting that something crossed, not a change in what the panel's agent is doing.
- **The waiting breath is FINITE.** The first cut was `infinite` and `verify:styles motion.2`
  stopped it — rightly: M111's `pulse.1` settled that nothing here animates forever. It is the
  wants-you pulse's exact shape reused: three breaths, then rest on a static stroke brighter
  than `armed`'s, so a join waiting all afternoon still reads differently from a live edge that
  never delivered, with nothing moving.
- **Reduced motion removes the TRAVEL, not the REPORT.** The packet is hidden (not frozen — a
  dot parked mid-edge says "something is stuck here", a different and wrong statement) and the
  breath stands down, while every state's stroke survives. `edge.flow.css.1` checks this arm
  specifically, and it is the whole argument for a discrete grammar over a continuous tint.
- **Two new scenes**, because a state with no golden is a state no critic ever sees.

**The `edge-firing` scene freezes the clock, and that is disclosed.** A packet's position is a
function of elapsed time, so a live capture would place the dot tens of pixels apart between
runs — a permanently flaky golden, which is exactly what M225 spent effort removing. The scene
freezes the clock at a chosen instant; what that fakes is **when it is** and nothing else. The
real reducer computes the real `t` and the real `bez()` places the real dot on the real curve.
`edge-waiting` needs no freeze: it is captured after the finite breath has ended, so the resting
state is what any capture would find.


### M233 · goldens touched, and the gate's rejection

A fresh-context critic **REJECTED both new scenes** on their first framing, and it was right:
the frame contained one lit edge and no resting one, so "the lit/quiet contrast" — the only
thing the pair exists to show — was not in the picture. The subject occupied about 2% of the
frame and the two images differed by a single 6px dot.

**What was fixed:** the scenes are reframed from `worker a` at half size with the inspector
closed, so the journey is in the shot rather than an arrowhead arriving from nowhere.

**What was NOT fixed, and why.** The join's second edge (from the chat) has three panels stacked
over its short path in this fixture. Exposing it means moving panels that five other goldens are
shot against. **DECLINED**, and both scene intents now say so rather than claiming a contrast
they do not show.

**What the rejection changed structurally.** The critic's strongest point was technical: the two
goldens differ by 42 px (the packet) while carrying ~400 px of antialias drift on a panel's
rounded corners between captures, so **no whole-image budget can tell them apart**. Goldens are
for LOOKING; the regression guarantee is `edge.paint.1` in `verify:panels:agents`, which drives
a fire through the store's own door and reads the compositor.

> `edge-firing` — the worker's ruled edge into `claude — api (2)` is lit with a matching
> arrowhead and an 8px packet sitting exactly on the curve, and that is correct because the
> packet is placed by the real reducer's `t` through the real `bez()`, the clock freeze fakes
> only WHEN it is, and every other edge on the canvas stays the quiet grey line.

> `edge-waiting` — the same edge rests lit with the packet absent, and that is correct because
> the travel is over while the join is not: it is captured after the finite breath has ended, so
> it shows the state a person who waits a minute actually sees, and the one a reduced-motion
> user sees from the start.

### M233 · the near-miss worth recording: a fixture leak laundered by UPDATE_GOLDENS

The first rebaseline of the two new scenes **rewrote 28 goldens**, and the suite reported
`61/61 passed` — because in UPDATE mode "passed" means "written", not "correct".

The cause was a `the join` **bookmark** added to the shot fixture to frame the scenes. A bookmark
appears in the palette's Go-to rows, so every scene that lists them changed. A scene must not
change the fixture other scenes are shot against.

Reverted with `git checkout verify/visual/goldens`, the bookmark removed, and the framing done
with an existing panel plus a zoom. The rebaseline then wrote **exactly the two new files**.

**Nothing caught this but counting the writes.** Not a check, not a critic — reading the output
and noticing the number was 28 when it should have been 2. This repo's own rule ("a golden
changes on purpose or not at all") is exactly this, and the tooling's happy path is silent about
it, so the count is now part of the procedure recorded above.
