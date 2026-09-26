# M341 — the critics' defects: work-card verbs, queued rows, one verb agreement, the ACTIVITY need word, the harness's setup read, a panel menu at the window's foot

**Verdict: shipped.** All six new defects that M340's fresh-context critics found are
fixed, and each changed scene was judged again by a fresh critic before its golden was
rewritten. One of the six took three tries. The first two were wrong in instructive ways,
recorded below so nobody repeats them. Built 2026-09-26 on local `main` on top of M340
([m340-visual-gate-and-golden-debt.md](m340-visual-gate-and-golden-debt.md)).

## What landed

1. **The work card's verb row wraps** (`styles.css .work-node__verbs`). M324's `Focus`
   verb made the row wider than the card, so `Done`, the last verb, was clipped at the
   card's right edge in every scene with a work card.
2. **A queued message is its tag line plus two lines** (`styles.css .chat__waiting*`,
   `ChatConversation.tsx`). Before, a long queued message filled the box's 40%, and the
   box's scroll edge cut a line through its glyphs. The row's Edit and Remove were out of
   view: a person saw part of a message and no way to act on it. Now the text clamps to
   two lines, with the whole text as the row's title and in Edit. The verbs ride the tag
   line (CSS `order`), and the box never gets shorter than one whole row
   (`max-height: max(40%, 7.5rem)`).
3. **`1 other needs nothing`** (`task-queue.ts`). The singular took the plural verb.
4. **The ACTIVITY `needs you` word has a cell of its own** (`styles.css
   .activity-row__need`: grid column 3, row 2). It had none, so auto-placement put it in
   a third row's first column. That widened the glyph column and pushed a needs-you
   row's title about 32px right of the others (the `wide` scene). The age now
   right-aligns in its column, which the word can widen.
5. **The Start work sheet reads the real setup in the shot harness** (`shot.cjs` wires a
   real `createRepoSetupStore` read at position 39, the kit, and `panels-entry.cjs`
   exports `INERT_KIT`). `INERT_KIT.setupRead` answers `not-a-repo`, a false claim
   from an inert door, so the `start-work` scene printed "Setup: not a repository"
   under the repository field that named one. The now-visible "Set up this repository…"
   button also got a gap from its sentence.
6. **A panel's ⋯ menu stays inside the visible canvas** (`PanelFrame.tsx menuRoom`). M315
   bounded the menu by its own panel and let it scroll. That holds until the panel
   itself runs past the window's foot, and then the bound is off-screen too. The menu's
   height is now also capped at the room between its own top edge and the canvas's (or
   window's) foot, in the menu's own world pixels. It is re-measured every frame while
   the menu is open.

## Decisions, and why

- **The menu does NOT open upward.** That was the first fix. It passed its own rect check,
  and the `header` scene then showed no menu at all: `.panel` clips with
  `overflow: hidden`, so a menu above its header is painted nowhere. The check now
  hit-tests what is painted (`elementFromPoint` on the title and the last row), never a
  rect.
- **The room is measured on every frame the menu is open, not once per opening.** The
  second fix measured once, and the `header` scene opened its menu while `goTo`'s
  camera flight was still landing, so the cap was computed for a place the panel then
  left. A pan under an open menu is the same case. The cost is one rect read per frame,
  only while a menu is open, with a state change only on a real move.
- **The room is measured from the menu's own top edge.** The ⋯ button's foot sits about
  12px higher (the chrome's padding), and the third fix still overhung the window by
  that much. `menu.room.1` now demands 4px to spare; the first version passed at 864 of
  866.
- **`INERT_KIT.setupRead` is left as it is in `kit.ts`.** `SetupRead` has no
  "unwired" arm, and adding one reaches Start work's copy. Only harnesses use the inert
  kit, and the shot harness now wires the real read. Recorded under Owed.
- **Disagreements with the critics**, verbatim below:
  - `auto`'s missing Edit: an auto run's queued prompt is not `editable`, since M322
    offers Edit only on a person's own queued message.
  - The "new overlap" in eight scenes: the fixture stacks `claude — api (2)` over the
    chat panel, and the queue header moved into the band that panel covers. That is
    z-order between two panels, not a clip.
  - `flip` and `header`: the floating "1 session running" pill over canvas content is a
    HUD, already declined in M340.

## Checks

- `verify:panels:product` **menu.room.1** (new). The ⋯ menu is opened FIRST. Then a real
  wheel carries its panel to 120px above the canvas's foot. The menu must end at least
  4px inside the canvas, scroll, and have its title and (scrolled to) its last row be the
  elements painted there. The part is 109/118, exactly the nine baseline reds.
- `verify:rail`: the attention headline check now reads `1 other needs nothing`.
- `verify:styles` 81/81.

## Goldens (the critics' sentences, verbatim)

**31 scenes rewritten**:
- 23 were over budget. `palette`, `palette-query`, `palette-dark`, `lineup` and
  `spawn-sheet` moved only behind their scrim: the chat transcript re-scrolled when the
  queue box's height changed.
- 8 were changed under budget by fixes 1 and 3. Per the golden rule, those were forced by
  deleting the golden: `kinds`, `kinds-dark`, `chat`, `integrations`, `vault`,
  `watcher`, `board` and `approval`.

### Round 1 — the forced (under-budget) scenes, final

- **kinds:** "Matches intent: fix 1 took. The work card's verb row now wraps, and `Done` sits whole on a second row at the card's left (x≈657, y≈777–800), where the golden had cut its right border at the card edge. It still clears the card bottom and the `1 selected` pill. Nothing else changed: the rest of the diff is sub-pixel text antialiasing across the frame, with the best-fit offset at 0,0."
- **kinds-dark:** "Matches intent: fix 1 took exactly as in `kinds`. `Done` wraps whole onto its own row inside the dark work card. Nothing else changed apart from antialiasing noise."
- **chat:** "Matches intent: only fix 1 reaches this frame. The work card sits mostly under the navigator, so `Done` wrapped onto a second row that starts behind the navigator and is out of sight. `Swarm…` is now the last visible verb and nothing is cut at the card's right edge. This chat has no queued message, so fix 2 is not in frame, and the chat panel itself is unchanged."
- **integrations:** "Matches intent: same as `chat`. `Done` wrapped onto a row hidden under the navigator, and nothing is clipped at the card edge. The Connections pane, the chat and the resume strip are unchanged."
- **vault:** "Matches intent: fix 1 only. The partly off-screen work card lost its right-edge-clipped `Done` to a wrapped row behind the navigator. The plan.md note, its links and Backlinks are unchanged."
- **watcher:** "Matches intent: fix 1 took. In the work card at the top, `Done` wraps whole onto its own row (x≈504, y≈113–135) inside the card. The watcher node, its `idle` pill and `on a change in src` are unchanged."
- **board:** "Matches intent: fix 1 took. In the selected work card, `Done` wraps under `Start work…` (y≈543–566) with room to spare above the card's bottom border. The four board columns and their counts are unchanged."
- **approval:** "Matches intent: fix 3 took, and the Needs you popover now reads `1 other needs nothing`. The one other change is the review node's `Read …/src/server.ts · 06:06` / `Edit · 06:06`, which now read 06:26. That is an unmasked capture-time clock, so this golden will drift on every run."

### Round 1 — what sent the fixes back (paraphrased, then fixed)

- The queue: "Fix 2 only half took" (auto, subagents, attention, overview, file-missing). The two-line clamp held, but in a short chat the row's Edit/Remove were cut by the box's scroll edge ("the top 3px of the first verb pill"). Fixed: the row's verbs ride its tag line, and the box has a one-row floor.
- header: "Fix 6 did not take. The ⋯ menu is not open anywhere in the fresh frame." The upward menu was clipped by `.panel`'s `overflow: hidden`. Fixed: the menu stays in its panel, with its height capped at the visible room.
- wide: "fix 4 took for the names … But the age on those two rows (`35s`, `1m`) is now left-aligned in the column that `needs you` sets." Fixed: the age is right-aligned.
- start-work: "fix 5 took … But the button is jammed against the sentence." Fixed: the button is set off with a margin.
- attention: "the popover row's quoted terminal line went from `Waiting for input` to `? Allow Edit on src/server.ts (y/n)`". That is not this milestone's change: the fixture's terminal races its prompt, and the M340 round saw the `?` line too.

### Round 2 (after the queue, ACTIVITY and setup follow-ups)

- **auto:** "DEFECT: Fix 2 mostly took. The queued box now shows the whole row: the `auto run` tag line with `Remove` on its right, then exactly two lines of text inside the dashed border, and nothing is cut by the box edge. But there is no `Edit` verb, and the minimap now covers the end of line 2, so the ellipsis can't be seen. The only other change is the expected ~30px transcript scroll; the live age is unchanged." — Disagreed: an auto run's queued prompt is not `editable` (M322: Edit is offered only for a person's own queued message), so Remove alone is correct; the minimap is a floating HUD.
- **subagents:** "DEFECT: The only change is fix 2's taller queued box plus the transcript scroll; the SUBAGENTS card and the terminal are unchanged apart from the live pid. Because the box moved down ~37px, the overlapping `claude — api (2)` terminal's top edge now cuts through the queue's header line. The row's `Remove` verb is hidden under the SUBAGENTS card, so fix 2 can't be checked in this scene." — Disagreed: the fixture stacks `claude — api (2)` over the chat; a panel above another covers it by design (z-order), and the header moved into the covered band.
- **flip:** "Matches intent, with one new overlap: both terminals are still flipped to their far-view summaries and the chat, files and review are unchanged. The only change is fix 2's taller queued box and the transcript scroll above it, plus the live pid." — same z-order note.
- **start-work:** "Matches intent: fix 5 took. The Setup line now reads `no setup saved — the agent starts in a bare worktree` (it was the wrong `not a repository — no setup applies`), aligned with the `Setup` label, and the `Set up this repository…` button is a separate bordered control after the sentence. The sheet is ~8px taller as a result, and the chat behind the scrim scrolled as expected; nothing else changed."
- **wide:** "Matches intent: fix 4 took. Both needs-you rows (`claude — api (2)`, `claude — api (chat)`) now indent their names like every other row and put the amber `needs you` at the right end of line 2, where it used to sit on its own third line at the left. Every age (28s…2m) ends in one right-aligned column. The shorter rows let one more row fit at the bottom; the only other change is the live age 29s→28s."
- **attention:** "Matches intent for fix 3, with one new overlap: the popover now reads `1 stopped on you — 1 other needs nothing.`, and the rest of the popover is unchanged. The chat behind shows fix 2's taller queued box and the transcript scroll." — same z-order note.
- **overview:** "Matches intent, with one new overlap: the minimap, the amber waiting panel and the status board are unchanged. The only difference is fix 2's taller queued box and the transcript scroll. The minimap sits bottom-right, not top-right as the intent says, but that is pre-existing and the same in the golden." — same z-order note.
- **file-missing:** "Matches intent: fix 1 took. The work card's verb row wraps and `Done` sits whole on a second line, where before it was clipped at the card's right edge. The file panel's `server.ts was deleted or moved` state is unchanged. In the bottom-right chat, the transcript and queue scrolled as expected, and the minimap now covers the `worked for 2s · … Edited 2 files · Ran 1 command` line instead of the queued text."
- **inspector-detail:** "Matches intent, with one new overlap: the Detail tab (command, wrapped cwd, font size, Process metrics, Restart) is unchanged apart from the live pid. The only other change is fix 2's taller queued box in the chat behind, with its transcript scroll." — same z-order note.
- **inspector-work:** "Matches intent, with one new overlap: the Work tab (Changes, Run, Cost) is unchanged apart from the live pid. The only other change is fix 2's taller queued box in the chat behind, with its transcript scroll." — same z-order note.
- **inspector-tools:** "Matches intent, with one new overlap: the Tools tab (Automations, Toolbox skills and permissions, Open toolbox) is unchanged apart from the live pid. The only other change is fix 2's taller queued box in the chat behind, with its transcript scroll." — same z-order note.
- **header (round 2):** "DEFECT: Fix 6 did not take here. The ⋯ menu is visible and starts with the full title `review: the health check wiring for the api repository` / `terminal`, but it is pixel-identical to the golden: its last row `Verbs in ⌘K` is cut mid-glyph by the window's bottom edge (y=865), with no bottom border and no scrollbar." — sent the fix back again (see the ledger).
- **inspector-activity:** "Matches intent: the Activity tab (three rows at 18s, 19s and 19s, with tone chips) is pixel-identical except the live pid (51785→39754). Fix 4 is not exercised here because there are no needs-you rows. The only real change is fix 2 in the chat behind it, and it took. The queued row is now the `auto run` tag line plus two lines ('Continue the… / fails. Work i…') inside a complete dashed box, with its bottom border visible at y≈376. In the golden a third line, 'alone on its…', was sliced by the list's edge. Besides that, the whole composer got about 37px SHORTER, not taller (top edge moved from y=240 to y=277). The dead space under 'Ready — ⌘⏎ se…' is gone, and that line now sits level with the ↑ send button. The transcript shows about 31px more ('It exports start and health…' is now visible)." — note: the separate `claude — api (2)` panel now covers the lower half of the queue header (canvas z-order, not a clip).
- **navigator-panels:** "Matches intent: the Panels pane is pixel-identical: the resume card, the filter chips, and Agents 10 / Files 4 / Reviews 3 with the 'review: the health check wiri…' row selected. The chat behind shows the same fix 2 result as above: a full two-line queued row with its dashed bottom border (y≈340) and no third line cut. The composer is about 37px shorter (top edge y=210→247), and the transcript gained a line ('It exports start and health…')." — same z-order note.
- **navigator-workspaces:** "Matches intent: the Workspaces pane is pixel-identical (api, 23 panels, marked active; docs, 2 panels; merged view; RUNS; HISTORY). The only diff is the chat behind: fix 2's two-line queued row is whole, the composer is about 37px shorter, the transcript scrolled to show more, and the queue header is half-covered by the overlapping `claude — api (2)` panel, as in the scenes above."
- **navigator-files:** "Matches intent: the Files pane is pixel-identical (REPO header, the src folder, README.md). The only diff is the same chat change: the queued row is now a complete tag line plus two lines, the composer is about 37px shorter with the transcript showing one more line, and the queue header is half-covered by the overlapping `claude — api (2)` panel (z-order, not a clip)."
- **search:** "Matches intent: the search overlay is pixel-identical (query 'FAIL'; PANELS rows 'tests · line 8' and 'tests · line 6' with FAILED/FAIL highlighted; the key footer). Behind the scrim, the chat transcript scrolled about 31px, and the composer below the overlay moved down about 37px: the queued row now shows 'Continue the / fails. Work i' in a closed dashed box, and 'alone on its' is gone. The inspector's Work tab is unchanged except the live pid."
- **search-empty:** "Matches intent: the empty state is pixel-identical ('No matches for \"zzqx\"' with 'try another word'). Behind the scrim there is only the expected chat change: the transcript is re-scrolled, the queued row is complete with two lines and the composer's chips, message box and footer sit about 37px lower. The live pid also changed."
- **palette:** "Matches intent: the palette is pixel-identical (PANELS list with 'GitHub work' selected, status dots, paths, and the footer; 'plan.md' is cut by the footer in both images, which is list scroll). Behind the scrim, only the transcript lines above the palette (y≈87–150) and the right end of the queued row's dashed box (x≈1110–1155, between the palette and the SUBAGENTS card) changed, plus the live pid (47683→35537)."
- **palette-query:** "Matches intent: the palette filtered by 'group' is pixel-identical: the CANVAS rows, disabled rows ('Workflow: run' and 'Open the starter canvas') with their lock-icon reasons, the red 'Clear scrollback logs', the SETTINGS row and the footer. Behind the scrim, only the transcript scroll, the edges of the queued row's dashed box and the pid changed. One thing is pre-existing and unchanged, not a regression: the reason on 'Open the starter canvas' ('…reset the canvas') runs to the right edge with no ellipsis in both images."
- **palette-dark:** "Matches intent: the dark palette is pixel-identical. Behind the scrim, only the chat transcript re-scroll (the 'It exports start and health…' line above the palette), a faint trace of the queued row box's edge and the live pid (51785→39754) differ."
- **lineup:** "Matches intent: the New panel sheet is pixel-identical. Lineup: Workbench with lanes checked shows '3 sessions will open · 1 agent' and the three seats: worker · agent · in a worktree, dev server · shell · in the checkout, and preview · browser · http://localhost:3000/ · in the checkout. Fix 5 does not appear here because this is the Panel tab, not Start work. Behind the scrim, only the transcript scroll, the edges of the queued row's dashed box and the pid changed."
- **spawn-sheet:** "Matches intent: the spawn sheet is pixel-identical: the Folder field with '~' and its two suggestions (repo, just now; tc shot fixtures golden, open panel), Name, Advanced, the Runtime selects, the 'Claude · ~' preview line and the keys foot. The suggestion popover covering the Agent row is the same in both images. Behind the scrim, only the transcript scroll, the edges of the queued row's dashed box and the live pid changed."

### Round 3 — the header scene, after the room is measured from the menu's own top

- **header:** "Matches intent: the ⋯ menu is open under an intact header. The title is ellipsised as 'review: the health ch…', and the ⋯ button, the 'working' pill, fill and × are all whole inside the 320px frame. The menu opens with the full title 'review: the health check wiring for the api repository' / 'terminal'. It now ends at a 1px bottom border at y≈856, about 9px above the window's bottom edge (865). 'Fill view' is the last whole row, and the 'Verbs in ⌘K' row is now cut off by the menu's own scroll box, where before the window cut it off. Elsewhere the only product change is the expected chat one: the queued-message box is shorter, so its 'auto run' item shows two whole lines with its dashed bottom border, where it used to show a third line sliced mid-glyph. The box now sits about 37px lower, and the transcript shows one more line ('It exports start and health…') above 'run the tests'. The inspector pid also changed (51785→89852), but that is a live value." The critic added one note: "the scroll cue is weak … There is no scrollbar, fade or bottom shadow." It is owed below.


## Gate

`npm run verify` (2026-09-26, 724.6s): 59/61 suites. Typecheck is clean, and every
plain suite and the build pass. The two red suites carry only the documented baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product` 109/118: `starter.1`, the six `workflow.*` and `reach.1`.

While iterating, the product part was run on its own six times. Two runs hit documented
flakes: `onboarding.start.1` red once (clean on its rerun), and one 230 s watchdog hang
at a load average near 9. Every clean run was 109/118.

`verify:visual`: the writing run (`UPDATE_GOLDENS=1`, with the 8 forced goldens deleted
first) rewrote exactly the 31 judged scenes. The confirming run against a fresh paint
passed 69/70, with `starter` the only red (on purpose).

## Owed

- **`INERT_KIT.setupRead` answers `not-a-repo`**, a false claim, in any harness that does
  not wire the kit. It needs a `SetupRead` arm that says "not read" and the Start work
  copy for it. Small; unscheduled.
- **A scroll cue on the ⋯ menu** (the round-3 critic): once the menu is capped, the only
  sign that more rows exist is a 2px sliver of the next row. A fade or a bottom shadow
  would say it scrolls. It changes goldens, so it is its own small change.
- **The fixture stacks panels over the chat**: `claude — api (2)` covers the queue
  header in eight scenes. That is a scene-composition debt, not a product defect.
- **What M340 proposed as M342 is resolved here**, after one bounded pass, so the number
  goes to the next real milestone. Of the three elements `orchestration-watch` "lost":
  - **`Open Files`**: offered only when the framed subject has files
    (`OrchestrationView.tsx`, `canOpenFiles: visibleFiles.length > 0`,
    `visibleFiles = framed.files`). Since M325, Orchestrate frames the TASK, and this
    task has no files of its own, so the absence is correct.
  - **The `config.ts +2` label**: M304's collision rule hides labels by rank
    (6f838afb, "hides colliding labels by rank"). The label is ranked out, not lost.
  - **The callout's typed token**: the scene's own intent says it is captured mid-flight
    WITHOUT reduced motion, "so the one thing this image cannot pin is the exact frame of
    the arc". This is timing, not a regression.

  **Still owed, unscheduled:** the critic's count mismatch. The pool lists `WORKING 1`
  while the scene's pill reads `2 working`, and the working writer the callout names
  (`codex — api thread`) is not in the pool list. That wants a look at how the pool's
  framed roster and the scene's working count are derived.

Next: M342 (the live Supabase project probed from outside: schema present, the shipped anon key refused everywhere), then M343 (a teammate's relay placeholder offers Attach).
