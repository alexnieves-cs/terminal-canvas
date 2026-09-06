# Obsidian — the visual redesign (M109–M111): design

**Status:** decided 2026-09-05 from the design review artifact "Terminal Canvas, redrawn" and
the user's brief: *Direction A · Obsidian; depth by glass and blur; aura and glow subtle;
interface accent cyan; corners round (12px); typeface system SF, as now; motion in three
moments; dark the flagship theme; plus all ten refinements for any direction.* Branch
`m109-obsidian` off `main` at 2.2.0 (`cc5a069`). Ships as 2.3.0.

## 1. What this is

A visual run, not a feature run. Nothing a panel can DO changes. What changes is the
material the interface is made of: today every surface sits on one plane, separated by a
hairline and a six-point lightness step, and nothing in it appears to be lit. The 2026-09-02
brief called that a "quiet instrument" and forbade the two things that would have made it
premium — shadows at rest and a lit ground. This run amends those two principles (§6) and
keeps every other one: one state vocabulary, one hue per state, one interface accent that is
never an agent colour, identity before provenance, every control named, three states always,
the chrome never louder than the well.

## 2. The material, in tokens

Two theme blocks, one name set (`verify:styles theme.1`), every existing token kept and
re-tuned, and these ADDED to both blocks:

| token | dark (flagship) | light | role |
|---|---|---|---|
| `--glass-1` | `rgba(18, 22, 31, .74)` | `rgba(255, 255, 255, .80)` | a panel's fill, over a blur |
| `--glass-2` | `rgba(13, 16, 24, .82)` | `rgba(246, 247, 250, .86)` | the chrome: top bar, dock, rail, context pane |
| `--edge-light` | `rgba(255, 255, 255, .06)` | `rgba(255, 255, 255, .95)` | the 1px inner light on a top edge — a surface is lit from above |
| `--bezel` | `rgba(0, 0, 0, .45)` | `rgba(30, 40, 70, .10)` | the 1px dark line where the chrome meets the well |
| `--lift` | `0 20px 40px -22px rgba(0, 0, 0, .75)` | `0 12px 30px -16px rgba(30, 50, 90, .28)` | the ONE resting shadow, on the panel frame and nowhere else |
| `--aura-1` | `rgba(99, 102, 241, .22)` | `rgba(14, 116, 144, .14)` | the ground's first light (indigo / teal) |
| `--aura-2` | `rgba(45, 212, 191, .12)` | `rgba(99, 102, 241, .10)` | the ground's second light |
| `--on-iris` | `#06111a` | `#ffffff` | text on a filled accent control |
| `--blur` | `blur(14px) saturate(140%)` | `blur(12px) saturate(120%)` | the backdrop filter, one value |

The surface ramp deepens so five levels are legible (dark: `#070910 / #12161f / #0f131b /
#1a1f2b / #232937 / #2c3344`), the ink ramp is re-derived against `verify:styles` 11, the
well drops to `#0c0f16` and `terminal/themes.ts` follows it byte for byte (the check that
compares them stays). Every measured token stays six-digit hex — `verify:panels` parses
`--line-strong` with `toRgb`, and check 11 skips an rgba — and the glass tokens are NEW names
so nothing that is measured becomes unmeasurable. `--panel-bg` aliases `--glass-1`, which is
what keeps the card-ground check (`.panel`'s computed background against `var(--panel-bg)`)
honest without touching it.

**Radius.** `--r-sm 5px · --r-md 8px · --r-lg 12px` (structural block; nested corners still
step down by the inset). **Accent.** Iris stays the name; the dark value is already cyan
(`#67e8f9`) and stays; light stays `#0b7f97` because cyan on white fails 3:1.

## 3. The surfaces, refinement by refinement

Numbered as the artifact numbered them, so the brief and the build log agree.

1. **The state edge glows.** `.pf::before` — a 1px pseudo-element pinned outside the
   frame's left edge, clipped by the frame's own `overflow: hidden`, carrying `box-shadow:
   0 0 14px 3px var(--tone-dim)`; `pointer-events: none`. It reads `--tone-dim`, so the
   tone block stays the only binding (`tone.1`; and because `.pf::before` now EXISTS as a
   rule, the check's "everything after the tone block" arm runs for the first time — see
   §7). At the summary and block tiers the glow doubles (`0 0 24px 6px`) so the far view
   reads as lights. The needs-you pulse becomes ONE breath: `wants-you-pulse` runs 2
   iterations over 1.2s and rests on its static ring.
2. **A primary control.** `.is-primary`: `background: var(--iris); color: var(--on-iris);
   border-color: transparent`, hover a touch brighter through `--iris-dim` over it. Applied
   to exactly: the top bar's New panel (`.shell__spawn`), the composer's Send
   (`.chat__verb--send`), Restart in the context pane's action bar
   (`.inspector__action--primary`), Run again (both sites), and Jira's Connect
   (`.jira-node__connect`). NOT Commit — `.review-node__commit`'s own comment (a destructive
   verb that looks primary invites the accidental press) stands.
3. **A bezel around the well.** The chrome row gains `box-shadow: inset 0 1px 0
   var(--edge-light), 0 1px 0 var(--bezel)`; the well is a half-step below the glass. The
   slot itself is untouched (its comment forbids padding, border or margin — a shadow on
   the CHROME is how the seam is drawn).
4. **The far view as a status wall.** The block tier's fill goes from `--tone-dim` (16%
   alpha, invisible on a dark ground at 8%) to `color-mix(in srgb, var(--tone) 26%,
   var(--s-1))` with the title in `--tone`; the minimap's blocks use the SAME expression, so
   the two are one status board. The summary tier's state word carries a `--tone-dim`
   capsule behind it. Asleep, none and starting keep their greys.
5. **The launcher's moment.** The one place the app is allowed a moment: a wordmark at
   `--t-2xl` (the brief's "launcher's one heading") over a glow drawn from the aura tokens,
   three DOORS as cards in a row — New panel…, Chat with Claude…, Open a file… — and the
   remaining verbs (Start <preset>…, Chat with Codex…, New note…) as the quiet list beneath,
   the environment line as the footer. Every `data-launcher-*` attribute and the
   `.launcher__verb` / `-name` / `-hint` classes stay on every verb, door or not: the checks
   count `[data-launcher] .launcher__verb:not([disabled])` and read the preset names.
6. **The chrome gets a material.** Top bar, dock, rail and context pane are `--glass-2`
   over the aura with an inner top light; the pressed dock item is a filled iris square
   with a soft glow; icons already sit at a 1.5px stroke (kept).
7. **Motion with intent.** Three moments and no others: the palette enters with a scale
   from 98% over `--dur-2` (the existing keyframe, plus scale); a panel entering needs-you
   breathes once (item 1); a camera flight eases on the existing curve. No hover lifts.
8. **Typeface.** Decided: system SF. `font.1` stands unchanged.
9. **The empty canvas is a place.** The aura: `.shell__aura`, an absolutely positioned
   first child of the shell (`isolation: isolate`; the regions above it at `z-index: 1`)
   painting two radial lights from `--aura-1`/`--aura-2`; and `.canvas__aura`, a sibling
   of `.world` that follows the camera at a fraction of its translation (`0.12`) so a pan
   reads as movement through a lit space. `.canvas` itself becomes `transparent` — the
   ground is the shell's. Both aura layers are `pointer-events: none`. No dot grid.
10. **Chat rhythm.** A user turn is a band (`--s-2` glass, `--r-md`) rather than a labelled
    column; the tool row's name is a chip; the composer is a raised field (`--s-3`, a
    hairline, an iris ring on focus) with the filled Send beside a quiet Interrupt.

## 4. Where blur is NOT paid

`backdrop-filter` composites a layer per element. A panel pays it at the live and card
tiers, where the viewport bounds how many are on screen; at the summary and block tiers
(`.world[data-detail="summary"|"block"] .pf`) it is `none` — the glass is invisible at 26%
and the panel count is unbounded. The HUD stays opaque `--s-3` (`compact.1` reads that, and
it sits over a world that repaints on every pan frame). The palette stays opaque for the
reason its comment gives. The chrome regions blur a static backdrop, which the compositor
caches.

## 5. Milestones

- **M109 — the material.** Tokens (both blocks), the aura, glass on panel and chrome, the
  edge glow and the one breath, the bezel, the radii, the well and `themes.ts`. Checks:
  `verify:styles obsidian.1` (the glass set present in both blocks and `--panel-bg`
  aliasing `--glass-1`), `ground.1` amended (the canvas is transparent and flat; the two aura
  rules exist and take no pointer), `shadow.1` amended (`--lift` on the panel frame and the
  launcher only; `--e-1/2` still unused; `--e-3/4` still overlays only), `blur.1` (the far
  tiers set `backdrop-filter: none`), `pulse.1` (the wants-you animation is finite).
- **M110 — the signals.** The primary control on its five sites, the far view and minimap
  as one status wall, the palette's scale moment. Checks: `primary.1` (the rule and its
  five sites, read as text), `far.1` (block and minimap share one fill expression),
  `motion.1` (the palette keyframe scales).
- **M111 — the two surfaces, and ship 2.3.0.** The launcher's doors and the chat's rhythm;
  the shot harness re-run and a fresh-context critic over the PNGs against the amended
  brief; the version, the README table, both diagrams unchanged (no channel moves), CLAUDE.md
  and `docs/load-bearing.md` in agreement.

## 6. The brief, amended

`docs/superpowers/specs/2026-09-02-design-brief.md` §4 principle 4 and §5 Colour ("resting
shadows go", "the ground is flat") are amended by this spec, dated: **a LIT EDGE marks a
boundary and ONE resting lift is the panel's; the ground is a lit space the camera moves
through.** The amendment lives in `2026-09-05-design-brief-obsidian.md` beside the brief, and
the critic is handed both.

## 7. What the checks cannot see, said once

`verify:styles` greps text. It will see the tokens, the rules and the sites; it will not see
whether the blur costs frames on a twenty-panel canvas, whether the aura is too loud, or
whether the launcher's doors read as doors. Those are the shot harness's and the critic's,
and they are recorded in the build log as looked-at, not as green. One latent fact surfaces
with item 1: `tone.1` slices the stylesheet at the first `.pf::before` rule, and until now
that string occurred only in a comment, which the check strips first — so its "nothing after
the tone block binds a hue" arm never ran. Adding the rule turns it on; whatever it flags is
fixed in M109 and named in the log.
