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

