# Obsidian — the visual redesign (M109–M111): build log

Branch `m109-obsidian`, 2026-09-05, off `main` at 2.2.0 (`cc5a069`). Spec:
`docs/superpowers/specs/2026-09-05-obsidian-design.md`. Plan:
`docs/superpowers/plans/2026-09-05-obsidian.md`. Brief amendment:
`docs/superpowers/specs/2026-09-05-design-brief-obsidian.md`. One log for the run, a section
per milestone. Ships as 2.3.0.

## Where it came from

A design review published as an artifact ("Terminal Canvas, redrawn") laid four directions
over the M61 shots; the user chose Obsidian — glass and blur, a subtle aura and glow, cyan,
12px, the system face, three motion moments, dark as the flagship — plus every one of the ten
cross-cutting refinements. The run waited for Act III to merge: every act milestone touched
`styles.css`, `Canvas.tsx`, `CLAUDE.md` and `README.md`, and two Electron verify chains flake
each other.

## M109 — the material

### Red first

`verify:styles` `obsidian.1`, `blur.1`, `pulse.1`, and `ground.1`/`shadow.1` rewritten to the
amended rule; with M110's `primary.1`, `far.1`, `motion.1` written in the same pass. All eight
red on the pre-M109 stylesheet — watched (23/31).

### What landed

- Both theme blocks re-tuned and nine names added to each (`--glass-1/2`, `--edge-light`,
  `--bezel`, `--lift`, `--aura-1/2`, `--on-iris`, `--blur`); the dark ramp deepened from a
  ten-point spread to twenty; the well to `#0c0f16` with `themes.ts` moved in the same commit.
  Check 11 held on the first derivation. Every measured token stayed hex — `verify:panels`
  parses `--line-strong` with `toRgb`, so a glass fill is a NEW name.
- `--panel-bg` and `--chrome-bg` alias the glass. The card-ground check (`.panel`'s computed
  background against `var(--panel-bg)`) measures the real fill through the alias and needed
  no change.
- The aura: `.shell__aura` at `z-index: -1` inside `.shell { isolation: isolate }`, and
  `.canvas__aura` before `.world` translated at `0.12` of the viewport. `.canvas` is
  transparent. The first cut gave every region `z-index: 1` to sit above the aura — which
  would have put the dock's fixed popover UNDER the canvas (two stacking contexts at the same
  index, later DOM wins). A negative index on the aura alone needs no region to change.
- The frame: `--glass-1` over `--blur`, `--lift`; the far tiers set `backdrop-filter: none`;
  every later rule on the frame that writes `box-shadow` (selected, link-target, wants-you and
  its keyframes) restates the lift. `shadow.1`'s allow-list names the frame, its state rules,
  the keyframe selectors (the rule splitter parses `0%, 100%` as a selector) and the launcher.
- The glow: `.pf::before`, 1px outside the left edge, clipped by the frame, `box-shadow` in
  `--tone-dim`; doubled at the far tiers. **This is the first real `.pf::before` rule in the
  file.** `tone.1` slices the stylesheet at the first `.pf::before` to check that nothing
  AFTER the tone block binds a hue to a state selector — and until now the string occurred
  only in a comment, which the check strips first, so `indexOf` returned -1 and the second arm
  covered one character. It runs now and passes: nothing after the block binds a hue.
- The pulse: `wants-you-pulse 1.2s ease-in-out 2`, resting on its static ring (the ring's own
  comment on reduced motion stands).
- The bezel on `.panel__chrome` (`position: relative` so its outer 1px shadow paints over the
  slot); `--r-sm/md/lg` 5/8/12; the dock's pressed tile filled.

### Looked at

`kinds-dark`: the aura reads as one light source through the rail and the top bar; the glass
shows the aura through a panel's body; the lift is a finger's width, not a float. The glow at
100% is quiet — "subtle" was the choice; it is legible on the amber panel and faint on green.
`zoomed-out-dark` at 22% (the summary tier): the cards are dark over the aura and the minimap
agrees with the canvas. `attention`: the amber ring and the one breath. `overview` (light):
the porcelain sibling holds; the filled New panel and Run again read as the two verbs.

## M110 — the signals

- `.is-primary` and its five sites as ONE selector list (`primary.1` reads the list): New
  panel, Send, Restart (`inspector__action--primary`, a class added in `Inspector.tsx`), Run
  again (the Workspaces row through `.rail-run .rail-row__verb`; the Work tab's through the
  same class), Connect Jira. Commit stays quiet by its own comment. A disabled primary falls
  back to the outlined look — the composer's Send with an empty draft is the common case and
  reads as "not yet", not as "the accent went away".
- The status wall: `color-mix(in srgb, var(--tone) 26%, var(--s-1))` on the block tier and
  the minimap's blocks, one expression (`far.1` compares the percentage). The summary tier's
  state word sits in a `--tone-dim` capsule.
- `palette-enter` scales from `.98`.

## M111 — the two surfaces, and ship

- The launcher: a hero (wordmark at `--t-2xl`, the brief's one heading, over a light from
  `--aura-1`), three doors as cards (New panel…, Chat with Claude…, Open a file…), the presets,
  codex and the note as the quiet prompt lines, the environment footer. Every
  `data-launcher-*` attribute and `.launcher__verb` class stayed on every verb: the checks
  count `[data-launcher] .launcher__verb:not([disabled])` and read the preset names. The frame's
  chrome row was dropped after the first shot: "terminal canvas" above "terminal canvas" read
  as a caption to itself.
- The chat: a user turn as a `--s-2` band, the tool name a chip, the composer a raised
  `--s-3` field with an iris ring on focus.
- `npm run verify`: the chain read to its exit line (below). `npm run shot`: 49 scenes.

### The chain

`npm run verify` exit 1 on the first run: every suite green through `verify:xterm`, then the panels suite 306/307 — `theme.1` pins the dark xterm background as a literal (`#14161c`), which M109 moved with `--well`; the literal updated to `#0c0f16` with a comment. The rerun of the panels suite alone, while `graphify update` competed for the machine, dropped `annot.1`, `history.1` and `browser.1` (a null `getBoundingClientRect`, a guest that never went live) — all three had passed in the first run, the recorded load-flake shape. Rerun alone: 307/307, exit 0. The graph refreshed.

## Amended, and where

- The brief: `2026-09-05-design-brief-obsidian.md` (principle 4, the ground, the state edge,
  motion, the frame, the primary control, the launcher, the chat).
- `verify:styles`: `ground.1` and `shadow.1` rewritten; `obsidian.1`, `blur.1`, `pulse.1`,
  `primary.1`, `far.1`, `motion.1` added.
- `docs/load-bearing.md`: the boundary entry amended (one lift, restated); a new entry on glass
  as a new name and where blur is paid. `CLAUDE.md`: one entry. README: three rows, the status
  line, the "what it looks like" sentence. `verify:meta version.1`: 2.3.0.

## What green does not say

The blur's cost on a twenty-panel canvas was not measured on this machine — the fixture holds
twenty-one panels and the shots render in one frame each, which is not a pan. The far tiers
are off the blur by rule; if a live canvas heats, `.panel`'s `backdrop-filter` is the one
line, and the app is the 2.2.0 look plus the aura without it. Manual-only, recorded.
