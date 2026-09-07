# v7 Act III — the visual-regression suite and the 4.0 UX audit (M148–M149): design

Written 2026-09-07 against the close of Act II. M61 built the visual LOOP: `npm run shot`
paints 53 scenes of the real renderer from a seeded fixture canvas and writes a manifest of
intents, and a person (and a fresh-context critic) reads the images. It asserts nothing. Act
III gives it teeth and walks it once more at 4.0.

## M148 — `verify:visual`

### What it is

A real-Electron suite, **not in `npm run verify`** (it consumes a build and paints 53 scenes
in about two minutes — the same reason `verify:packaged` is a hand-run gate), that renders
every scene through the shot harness and compares each PNG with a committed GOLDEN:

- `scripts/verify-visual.cjs` is its own Electron entry. It runs the shot harness as a child
  Electron process into a scratch `SHOT_DIR` (the harness is unchanged; `SHOT_DIR` was
  already its override), then decodes each scene and its golden with Electron's own
  `nativeImage` — no image library enters the repository — and compares.
- Goldens live in `verify/visual/goldens/<scene>.png`, committed. They are the truth a
  person accepted by looking, which is the only truth a screenshot can have.
- **The tolerant diff.** Two images of the same size are compared pixel by pixel; a pixel
  DIFFERS when any channel differs by more than `CHANNEL_TOLERANCE` (24 of 255 — font
  antialiasing and a WebGL terminal's subpixel jitter sit under it, a colour change sits
  over it); a scene FAILS when differing pixels exceed `PIXEL_BUDGET` (0.5 % of the frame —
  a moved control or a lost row is orders of magnitude more) or when the sizes differ. The
  two constants sit beside their reasons; a check that loosens them is the review's business.
- Every red writes `out/visual/<scene>.diff.png` (the differing pixels in one colour over a
  dimmed golden) beside the fresh capture, so a person can see what moved before deciding
  which side is right.
- Three outcomes per scene, never two: `PASS` (under budget, with the ratio), `FAIL` (over,
  with the ratio and the diff's path), `MISSING` (no golden, no comparison — red unless
  updating). A scene the harness itself failed to paint is `FAIL` with the harness's reason.

### Updating goldens, documented

`UPDATE_GOLDENS=1 npm run verify:visual` writes every fresh capture over its golden and
exits 0. The rule, in `docs/verify-suites.md` and at the top of the script: update only after
LOOKING at the fresh image and the diff and deciding the change is the intended one; an
update made to turn a red green is the suite turned off. A milestone that changes a scene
commits the golden in the same commit as the change, so `git log -- verify/visual/goldens`
is the visual changelog.

### Pinned in the chain

`verify:meta visual.1`: `scripts/verify-visual.cjs` exists, `package.json` has `verify:visual`
and it is NOT in the `verify` chain (like `verify:packaged`; check 19 gains it as a named
exclusion with its reason), the goldens directory holds one PNG per scene the harness
declares (the scene names read from `scripts/shot.cjs` as text), and the two tolerance
constants are numbers with a comment each.

## M149 — the 4.0 UX audit

`docs/ux-audit-4.0.md`, written from LOOKING at every scene `npm run shot` paints at the close
of Act II (53), plus the scenes this act adds. The method is M61–M70's: per scene, what the
image shows against its intent, what is wrong, and what was done. Findings are fixed in this
act with a check each where one is cheap, or declined by name. Six lenses, each a section:

1. **Every scene against its intent** — the walk.
2. **Empty, loading and error states** — every pane and kind has three states, never two
   (the repository's rule); the audit lists each pane's three and adds the scenes that show
   the empty and the error arms where the harness paints only the loaded one (`*-empty`,
   `*-error` scenes as needed).
3. **Motion, reduced motion and focus order** — the camera flights honour
   `prefers-reduced-motion` (M56); the state pulse is finite (M111); Tab order through the
   chrome and the panes (`reach.1–.3`). A `reduced-motion` scene captures the flight's end
   state with the preference on.
4. **Chrome accessibility** — every control a name (M66 `labels.*`), contrast on both
   themes for the state edge, the tone words and the dim text; `aria-*` on the tab groups.
5. **Density** — `compact` (< 1100 px) and `wide` (> 1600 px) exist; add `hidpi` at a
   device scale factor of 2 (a 200 % display), where blur, hairlines and the WebGL terminal
   change.
6. **Act IV and Act V scenes** — added when those milestones land, named here as owed.

The language stays the Obsidian brief's (M109–M111): the nine glass names, one resting
shadow, blur at the near tiers only, the finite pulse, the state edge's glow; anything the
audit adds is a NEW name in both theme blocks, never a re-spelling (`obsidian.1`, `theme.1`).
