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

The goldens are stored at HALF scale (`GOLDEN_SCALE` 0.5): the first full-size refresh of
the 52 scenes then declared (51 landed — `composer` did not paint) was 34 MB of PNG on disk,
and the committed half-scale set is 14 MB for 54 — a moved control or a changed word is
still orders of magnitude over the budget there. The harness echoes the renderer's console
so a scene that fails to paint says why. Watchdog: two runs of 159.2 s, times 1.25, 200 s.
(The first comparison run's worst-case ratio was read off a terminal and not kept as an
artifact; the verifier is right that it is unrecorded, and it is not claimed.)

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

Four fresh-context reviews ran after the goldens landed (`64ff1a1`): a critic and a verifier
for Act II, a critic and a verifier for Act III, each seeing only the diff, the spec, the
checks and the docs. Everything below landed in one wave (the commit after this one).

**Act II critic — FIX-FIRST, 2 Critical, 5 Major, 11 Minor.**
- *Critical 1:* `Canvas.onSpawn` built the PanelSpec field by field and never copied `env`,
  so M147's environment half — the preset's map and the sheet's field — was dropped after the
  parser and before `buildPtyEnv`: the form did nothing, and the checks stopped at the
  parser. Red `env.spawn.1` (core; the variable read back off the terminal), then the one
  spread. *Critical 2* was F.12, already fixed at HEAD.
- *Majors:* `workspace-from-template` sat in the verb table with no executor arm — and the
  new `verify:verbs executor.1` (every table id has a `case`) found `dispatch` and `board`
  had never had one either since M113–M116; all three have arms now, refusing by name. M145's
  chat arm double-attached an image (the chat's own `edit:paste` door already attaches the
  bytes) — dropped; its silent arms (a paste into a card, a write that failed) now SAY why on
  the palette's feedback line through a `say` member (excluded from every plan). M140's
  divergence from its spec is recorded in the spec and `docs/load-bearing.md` beside M5b (the
  store stays read-only; the door is a deliberate edit); M142's per-workspace line is marked
  declined in the spec; M143's spec section says the road not taken.
- *Minors, each landed:* the `⌘1` hint dropped from `Zoom to fit` (the chord runs `fitAll`);
  `zoomTarget` pure with `fit.target.1` (the arms had only the Electron check); the row's
  `pastesImagePath` fact now rides the sheet's capability sentence; the ledger read keyed on
  the panel count, not the registry's version; `intoNewWorkspace` undoes its mint on a
  refusal and dedupes the name; `parseEnvMap` refuses a key with whitespace or `=`
  (`preset.env.3`); `PoolSendResult` keeps its named members; `onOpenFile` stable for the
  memo'd toolbox nodes; the join refusal says `target`.

**Act II verifier — 52 SUPPORTED, 8 OVERCLAIMED, 1 UNSUPPORTED.** The Act II build log now
carries the Electron-tier tallies it lacked, the `workflow.2c` bullet as reverted, `fit.1`'s
dispatched shift-mousedown, M144's narrower "no layout box moves", M140's hook/MCP rows as
data at the Electron tier, and the note that M142 shipped without its renderer read; the Act
I spec's Places-gate sentence is struck by name; the styles check that shared `toolbox.open.1`
with the rail is `toolbox.open.style.1`.

**Act III critic — FIX-FIRST, 2 Major, 9 Minor.**
- *Major 1:* the `reduced-motion` scene proved nothing — the harness sets M56's OVERRIDE at
  boot and the override is read before the media query. The scene now clears the override
  for the jump and restores it after, so the real media feature is what lands the flight.
- *Major 2:* `PIXEL_BUDGET`'s sentence overstated the suite by orders of magnitude — a
  changed word is a few hundred pixels, under the frame's jitter. The suite gained a second
  question: 32 px TILES, any tile more than 35 % different fails (jitter scatters, a change
  clusters); both sentences say what each budget sees.
- *Minors:* the watchdog kills the shot child; a 1x display is refused once by name; the
  ledger keying (above); F.7's prose quotes the code; F.1's home is backlog #83 (the minimap
  yields), F.3 cites M45's three-way choice; the chrome-overhang loss has a home, #84;
  CLAUDE.md's suite counts updated.

**Act III verifier — 46 SUPPORTED, 4 OVERCLAIMED, 2 UNSUPPORTED.** The golden-size figures
are the real ones (52 declared / 51 landed at `41fabf6`; 14 MB at half scale), the
unrecorded 0.077 % is no longer claimed, the README's declined list names F.11, and this
section replaces the placeholder the verifier found.
