# v7 Act III — the visual-regression suite and the 4.0 UX audit (M148–M149): build log

`main`, 2026-09-07, after Act II. Spec: `docs/superpowers/specs/2026-09-07-v7-act3-visual-design.md`.
Plan: `docs/superpowers/plans/2026-09-07-v7-act3-visual.md`.

## M148 — `verify:visual`

Red: `verify:meta visual.1` (`720798e`). `scripts/verify-visual.cjs` is an Electron entry
that runs `npm run shot` as a child into a scratch `SHOT_DIR`, decodes each capture and its
golden with `nativeImage` and compares with two constants that carry their own sentences —
`CHANNEL_TOLERANCE` 24/255, `PIXEL_BUDGET` 0.5 %. Reds write `out/visual/<scene>.diff.png`
(differing pixels in red over the dimmed golden) beside `<scene>.fresh.png`. `verify:meta` 19
names `verify:visual` as the second exclusion beside `verify:packaged`.

The goldens are stored at HALF scale (`GOLDEN_SCALE` 0.5): a full-size refresh was 34 MB of
PNG for 53 scenes, ten at half — and a moved control or a changed word is still orders of
magnitude over the budget there. The first run against the first goldens reproduced at
0.077 % worst case; the harness echoes the renderer's console so a scene that fails to
paint says why. Watchdog: two runs of 159.2 s, times 1.25, 200 s.

## M149 — the audit

`docs/ux-audit-4.0.md`, from looking at every golden — twice, because the first goldens were
wrong from `runs` on (below). Fourteen findings, each FIXED with a check, DECLINED by name, or
OWED with what would close it. The ones that mattered:

- **F.8 — two defects found by a golden that looked nothing like its intent.** The `runs`
  golden showed an empty workspace named `review this repository` and a week line stuck at
  `reading the ledger…`. M147's `New workspace from` minted the workspace BEFORE the sheet
  asked its holes, so the `templates` scene's Escape stranded every later scene (and the
  `composer` scene's chat was in the other workspace, which is why it stopped painting).
  M142's renderer half had never been wired — a partial patch left every piece but the one
  `ledger.usage` call. Red: `workspace.template.2` (shell), `summary.history.2` (rail);
  `cost.history.1` (kinds) had been red since the merge. Fixed at `9c75f6d`.
- **F.12 — the `⋯` menu invisible over a live terminal, since M144 (this run).** Open in the
  DOM (the `menu.1` check read it), not on screen: the counter-scale transform had made the
  chrome a stacking context that painted under the positioned slot after it. Red
  `menu.stack.1` / `menu.paint.1`; fixed with `z-index: 2` on the chrome and `isolation:
  isolate` on the body. Consequence stated: at ~50 % the overhanging chrome owns the pointer
  over the body's top rows, and three checks that had reached xterm through it (core 9,
  agents `hover.1`, `links.1`) write six blank rows first.
- **F.14 — the attention popover invisible since 2.3.0.** Open in the DOM through every check
  of it: M109's blur made the dock a stacking context and the containing block of its fixed
  popover, which the shell-wide `overflow: hidden` clipped to 48 px. Red `popover.stack.1` /
  `popover.paint.1`; fixed with `overflow: visible` and a z-index above the navigator's
  drawer. **The rule both teach: a surface that opens is proven by `elementFromPoint`, never
  by its presence in the DOM.**
- **F.13 — a live terminal that painted blank once.** `verify:xterm repaint.1` pins the plain
  re-attach path at the pixel level (the spike page had never loaded xterm's stylesheet; its
  first capture was a cursor box, which the first cut of the check accepted). Green; the blank
  did not recur; backlog #82 names what would close it.
- The smaller fixes: the toolbox Open door at its row's end (F.2), the board's empty-column
  sentences (F.7), the routine line wrapping between its phrases (F.10). Declines: F.1, F.3,
  F.4, F.5, F.6, F.9, F.11, each with the earlier rule it defers to.
- Scenes: `reduced-motion` (the real media feature through the DevTools protocol, captured a
  beat after Enter) and `file-missing` added; `scale-100` tried and dropped by measurement
  (`capturePage` renders at the display's scale whatever the override says). Three scene
  mistakes the walk taught, recorded in `docs/verify-suites.md`.
- Lenses 2–5 of the audit quote the source's own sentences for every state and name the
  check behind every motion and accessibility claim.

## Reviews

Recorded below once the fresh-context critic and verifier have run over Acts II and III.
