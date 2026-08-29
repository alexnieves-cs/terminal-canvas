# M10: The Visual System — Design

**Status:** designed, not yet implemented.
**Predecessor:** `2026-08-28-m9-review-layer-design.md`
**Touches:** `src/renderer/styles.css` for every visual change, plus
`scripts/verify-styles.cjs` and one `package.json` script entry, added by the
implementation plan so the success criteria below are executable rather than
aspirational. No `.tsx`, no class rename, no `index.html`, no dependency —
the boundary that bounds risk to the running app is unchanged.
**Successor:** M11 — Themes, created by this spec (see "What M10 does not
solve").
**Backlog entries:** none existing. M10 emits several, all listed as bullets
under "What M10 does not solve"; the one it reopens deliberately is
`ideas-backlog.md` #11's removal of an `'enum'` setting type, which a theme
picker finally gives a customer.

## Goal

Make the app look designed rather than assembled, by adding the layer it has
never had: a scale.

Every milestone through M9 added a surface — panels, cards, a palette, a rail,
an inspector, edge pips, review nodes — and each one chose its own colours,
sizes and spacing at the moment it was written. Each choice was reasoned about
(the comments prove it) and most are individually correct. What is missing is
the thing that makes a set of correct choices read as one product: repetition.

M10 introduces that repetition as tokens and re-expresses every existing rule
in terms of them. It changes no structure, invents no component, adds no
feature, and touches no `.tsx` file.

## The diagnosis, as counted rather than felt

Run against `styles.css` at 1,153 lines:

| Symptom | Count | Consequence |
|---|---|---|
| Colour vocabularies | **3** — 10 `:root` tokens, **19 hardcoded hexes** in the palette block, and a **21-colour `ITheme` in `create-terminal.ts`** | The palette's destructive red (`#e8807f`) and the panel's exited red (`--red #f7768e`) are two different reds meaning one thing, on screen together. The third vocabulary is worse: four of its entries are byte-identical copies of `:root` tokens (`background` = `--panel-bg`, `foreground` = `--text`, `cursor` = `--blue`, and `red`/`green`/`yellow`/`blue` = the four accents), duplicated across a language boundary where no stylesheet audit can see them |
| Monospace stacks | **4** — `.panel__card`, `.review-node__body`, `create-terminal.ts`, and `--font-mono` once M10 adds it | The xterm stack already names `"JetBrains Mono"`, a face the app does not ship, so it silently falls through to `"SF Mono"` on every machine |
| Font sizes | **6** — 9, 10, 11, 12, 13, 15px | Five of six steps are ≤2px apart, at or below the just-noticeable difference. They do not establish hierarchy; they read as inconsistency |
| Border radii | **5** — 3, 4, 5, 6, 10px | A 6px control inside a 10px panel has the wrong concentric offset; nested corners must decrease by the inset, and none of these were chosen to |
| Distinct padding values | **14** — 1,2,3,4,5,6,7,8,9,10,12,14,16,20 | No rhythm. Adjacent surfaces align by coincidence or not at all |
| `transition` declarations | **0** | Every hover, selection and state change is a 0ms hard cut — the single largest contributor to "prototype" |
| `:focus-visible` rules | **0** | The only `outline` in the file is `outline: none` on the palette input |
| `prefers-reduced-motion` blocks | **0** | Currently moot; becomes a real gap the moment Task 6 lands |

Two of those are outright defects rather than inconsistencies, and both are
recorded under "Correctness" below.

## Why a token layer and not a redesign

Three reasons, in order of weight.

1. **The failure is global, so the fix must be.** Nothing here is wrong in
   isolation — `direction: rtl` on the truncated review path, `tabular-nums`
   on the zoom readout, the `<mark>` reset in `.palette__hit`, the `45%` tail
   cap with its arithmetic written out, are all better than most shipped
   apps manage. "Clean" is an emergent property of repetition across
   surfaces, and no local edit produces it. A redesign would throw away
   correct reasoning to fix a property that reasoning was never responsible
   for.

2. **A values-only change is provably safe, and a redesign is not.** The
   complete set of CSS values any verify suite reads is three things (see
   "The three invariants"). Every check in the repo is structurally blind to
   a token swap. That is a rare position to be in, and it is worth spending
   deliberately on the highest-leverage change rather than eroding it on
   markup churn.

3. **The expensive items are separable and cheaper afterwards.** Icons, type
   and revealed controls all want the scale to exist first — an SVG set needs
   a size token and a stroke weight, a font needs a type scale to sit in.
   Doing them before M10 means doing them twice.

## Scope

In:

- A **token layer** in `:root`: surface ramp, hairlines, text ramp, accent
  pairs, spacing, radius, elevation, motion.
- **Retiring all 19 hardcoded hexes** onto it.
- A **contrast pass** that removes every `opacity`-based dimming.
- A **type scale** of four sizes, replacing six.
- **Motion**: three transition rules, one state animation, one reduced-motion
  block.
- **`:focus-visible`** rings.

Out, and each with its reason, under "What M10 does not solve".

**M10 touches exactly one file.** No `.tsx`, no class rename, no `index.html`,
no new dependency — which also means the renderer's `default-src 'self'` CSP
is not involved at all.

## The three invariants

Established by grepping every `getComputedStyle` and `getPropertyValue` across
all eleven verify scripts, not by assumption. The complete set of CSS values
any check reads is:

1. **`.panel--agent-wants-you`'s `border-color` must compute to exactly the
   same colour as `--amber`.** `verify:panels` 62 and 97 read `--amber` off
   `document.documentElement`, paint a throwaway probe with the returned
   string, read the probe's resolved `color`, and compare it to the panel's
   `borderTopColor`. A `color-mix()`, an alpha, or a second amber token on
   either side breaks both checks. **Adding a `box-shadow` or an `animation`
   to that selector is safe** — the assertion reads `borderTopColor` and
   nothing else, which is what lets Task 6's pulse exist.

2. **The expanded rail and inspector must stay wider than 40px.**
   `verify:panels` 73 asserts `railWidth > 40 && inspectorWidth > 40` and
   derives every other clause from the measured values, so 240/260 are free to
   change but not to collapse. The 22px collapsed strip is not read by any
   check.

3. **Never transition or animate `transform` on `.world` or `.panel`.** Four
   checks read `.world`'s computed transform through `DOMMatrixReadOnly`
   (`verify:panels` 1023, 1394, 3328; `verify:canvas` 52) and one reads
   `zIndex` (1653). `.world` also carries `will-change: transform` and is
   driven at 60Hz by the viewport — a transition there would make every pan
   feel elastic *and* make those reads race the animation. Motion in M10 is
   confined to `background-color`, `color`, `border-color`, `opacity` and
   `box-shadow`.

Nothing else in any suite observes a computed style. That is the whole
exposure.

## Correctness: two defects found while measuring

### `--fg` is never defined — five usages

```
styles.css:300  .inspector__heading        color: var(--fg)
styles.css:358  .inspector__value          color: var(--fg)
styles.css:375  .inspector__action         color: var(--fg)
styles.css:413  .inspector__review-summary color: var(--fg)
styles.css:445  .inspector__review-path    color: var(--fg)
```

`:root` defines `--text`, not `--fg`. An undefined custom property makes the
declaration invalid at computed-value time, which for the inherited `color`
property resolves to `inherit` — so all five inherit `--text` from
`.shell__inspector` and **look correct by accident**. The moment any
intermediate element sets a `color`, all five silently follow it instead.

This is precisely the class of failure `CLAUDE.md` exists to prevent, and it
survived because the accident is indistinguishable from the intent. M10
defines `--fg` as the primary text token, which makes all five correct by
construction rather than by luck.

### `opacity` dimming compounds below every threshold

`.review-node__root` (`.6`), `.review-node__counts` (`.7`),
`.review-node__hunk-note` / `__more` (`.6`), `.inspector__action:disabled`
(`.55`) all multiply an already-muted colour. `--muted` on `--panel-bg` is
4.53:1; at `opacity: .6` the effective ratio is ≈2.4:1. Opacity is the wrong
tool for de-emphasis in a text ramp — it is unbounded, uncomposable, and
invisible to any audit that reads declared colours. M10 replaces every
instance with an explicit token.

## Measured contrast, before and after

Current, computed from the shipped values:

| Pair | Ratio | |
|---|---|---|
| `--muted #767d95` on `--chrome-bg #191b25` — rail tails, region titles, inspector labels | **4.19** | fails 4.5 |
| `--muted` on `--panel-bg` | **4.53** | passes by 0.03 |
| `.palette__hint` / `.palette__section` `#7d8199` on `#1b1d27` | **4.37** | fails |
| `.palette__footer #6b6f85` on `#181a23` — the app's only self-documentation | **3.50** | fails |
| `.review-node__root` (`--muted` × `.6`) | **≈2.4** | fails |
| `--border #262a38` vs `--panel-bg` | **1.30** | invisible |
| canvas grid dot `#1c2030` vs `--bg` | **1.21** | imperceptible |

After, measured against the proposed ramp. Text lands on `--s-0` through
`--s-4` only; `--s-5` is a pressed state, transient and never a text ground:

```
        s0     s1     s2     s3     s4
--fg   16.56  15.70  14.57  13.34  11.37
--fg-2 10.29   9.75   9.05   8.29   7.06
--fg-3  7.37   6.99   6.49   5.94   5.06
--fg-4  4.41   4.18   3.88   3.55   3.03   (disabled only; 1.4.3-exempt, kept >=3)
```

Every non-disabled pair clears 4.5:1 with margin on the worst surface.

**One honest exception, stated rather than buried.** The hairlines do not
reach 3:1 and are not meant to: `--line` reaches 1.86 on `--s-1` against
today's 1.30. WCAG 1.4.11 applies to boundaries needed to *identify a control
or understand content*, and a divider between two panes is neither. Where a
border genuinely is the control boundary — focus rings, active states — M10
uses the accent, which clears 3:1 comfortably (`--blue` 5.42 minimum,
`--red` 5.16, `--amber` 6.82, `--green` 7.46). The reason the divider is
allowed to stay quiet is the surface ramp below: depth no longer depends on
it.

## The token layer

M10 splits `:root` in two, and **the split is the milestone's one piece of
architecture**. Structure — spacing, radius, motion, type — is theme-invariant
and stays on bare `:root`. Every colour moves into a theme block keyed by a
`data-theme` attribute:

```css
/* Structure. Never varies by theme, so it never appears in a theme block. */
:root {
  --sp-1: 2px;  /* … see below … */
}

/* Colour, and colour only. Declared on BOTH selectors so the app is dark with
   no attribute set — which is today's behaviour, byte for byte.

   The specificity is deliberate rather than incidental. `:root` alone is
   (0,1,0) and `:root[data-theme="light"]` is (0,2,0), so a later theme block
   wins on specificity rather than on source order — which means M11 can add
   `light` without reordering anything, and a third theme after it cannot
   silently lose to whichever block happens to be declared last. */
:root,
:root[data-theme="dark"] {
  color-scheme: dark;   /* per-theme: native scrollbars, form controls and
                           the canvas ground follow the theme, not the OS */

  /* ── Surface ramp ──────────────────────────────────────────────
     Six steps. The old three (bg -> panel -> chrome) spanned 6.6
     of perceptual lightness (L*), which is why the app reads as one
     flat slab: depth was being asserted by a 1.30:1 hairline, and a
     hairline cannot carry a hierarchy. This ramp spans 22.3 L*,
     with each adjacent step >= 2.6 — a visible surface difference,
     which is how depth actually reads on a dark ground.

     Contrast RATIO is the wrong metric for large adjacent fills and
     is deliberately not quoted here; delta-L* is. Ratio is quoted
     for text, above, where it is the right metric. */
  --s-0: #080910;   /* app ground, canvas                    */
  --s-1: #0f111a;   /* panel body, palette list              */
  --s-2: #161926;   /* chrome: rail, top bar, panel header   */
  --s-3: #1d2130;   /* raised: palette surface, HUD          */
  --s-4: #282d40;   /* hover fill, AND the selected fill     */
  --s-5: #343a52;   /* pressed only — transient, never a text ground */

  /* ── Hairlines ─────────────────────────────────────────────────
     Two weights. Both decorative; see the contrast note in the spec
     for why neither chases 3:1 and what carries a load-bearing
     boundary instead. */
  --line:        #39415a;
  --line-strong: #4d5675;

  /* ── Text ramp ─────────────────────────────────────────────────
     Four steps, each with one job. --fg-4 is DISABLED ONLY and is
     the reason no other step needs to go dimmer: every existing
     opacity-based dimming collapses onto it. */
  --fg:   #e8eaf4;   /* primary                               */
  --fg-2: #b4bad0;   /* values, secondary prose               */
  --fg-3: #959db8;   /* labels, tails, hints                  */
  --fg-4: #6e7691;   /* disabled                              */

  /* Back-compat aliases. Kept so the migration can land token-by-
     token; a later task may retire them, but not this milestone. */
  --text:      var(--fg);
  --muted:     var(--fg-3);
  --bg:        var(--s-0);
  --panel-bg:  var(--s-1);
  --chrome-bg: var(--s-2);
  --border:    var(--line);

  /* ── Accents ───────────────────────────────────────────────────
     Two tones each: the saturated one for borders, dots and icons;
     the tint for fills. The tints are what let a destructive hover
     read as destructive without a second red.

     --amber MUST remain a literal colour, declared here, and
     .panel--agent-wants-you MUST keep `border-color: var(--amber)`
     un-transformed. verify:panels 62 and 97 compare the two by
     resolved value. See "The three invariants". */
  --blue:  #7aa2f7;  --blue-dim:  rgba(122, 162, 247, .14);
  --green: #9ece6a;  --green-dim: rgba(158, 206, 106, .12);
  --amber: #e0af68;  --amber-dim: rgba(224, 175, 104, .14);
  --red:   #f7768e;  --red-dim:   rgba(247, 118, 142, .12);

  /* ── Space ─────────────────────────────────────────────────────
     Fourteen ad-hoc values collapse to seven steps. The constraint
     is the point: rhythm comes from the absence of options. */
  --sp-1: 2px;  --sp-2: 4px;  --sp-3: 6px;  --sp-4: 8px;
  --sp-5: 12px; --sp-6: 16px; --sp-7: 24px;

  /* ── Radius ────────────────────────────────────────────────────
     Nested corners must DECREASE by roughly the inset, or the
     concentric offset is visibly wrong. A --r-sm control inside a
     --r-lg panel is right; today's 6-inside-10 is not. */
  --r-sm: 4px; --r-md: 6px; --r-lg: 12px; --r-full: 999px;

  /* ── Elevation ─────────────────────────────────────────────────
     Panels currently have NO shadow, which is why they read as
     pasted onto the canvas rather than floating above it. A shadow
     only reads as depth when the surface beneath differs — which
     the ramp above now provides. */
  --e-1: 0 1px 2px rgba(0,0,0,.40);
  --e-2: 0 4px 12px rgba(0,0,0,.45), 0 1px 2px rgba(0,0,0,.40);
  --e-3: 0 16px 48px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.40);

  /* ── Motion ────────────────────────────────────────────────────
     Two durations and one easing family. 90ms is below the
     threshold at which a change reads as waiting and above the one
     at which it reads as a glitch. */
  --dur-1: 90ms;   /* state flips: hover, selection */
  --dur-2: 160ms;  /* enter / appear                */
  --ease:  cubic-bezier(.2, .8, .2, 1);
}
```

**M10 ships exactly one theme block, and that is the point.** The cost of the
split today is nothing — the same tokens, one selector wider. The cost of
*not* splitting is paid later at the worst moment: every rule that reached a
colour off bare `:root` has to be found and re-pointed while a second palette
is also being introduced, so a mistake in either is indistinguishable from a
mistake in the other. Adding a theme after M10 is authoring a block of values.
Adding one before it would be a refactor.

Two rules keep the split honest, and both are the kind that get "tidied" away:

- **No colour outside a theme block, and no structure inside one.** A radius
  in the dark block is a radius the light theme must remember to repeat; a
  colour on bare `:root` is a colour no theme can override.
- **The renderer sets no `data-theme` in M10.** No attribute means dark, which
  is what the app already does. Wiring the attribute is M11's first task, not
  a loose end here.

## Type scale

Six sizes become four. Every current 9px and 10px usage is an
`text-transform: uppercase` label — `.shell__region-title`,
`.inspector__label`, `.inspector__section-heading`, `.inspector__badge` — so a
single `--t-xs` covers all of them, and the 11px tier can rise to 12px without
adding a step.

```css
:root {
  /* Legal below the 12px body floor because these are 1-2 word
     ALL-CAPS labels with 0.09em tracking, never prose. Any
     sentence-case text at this size is a bug. */
  --t-xs: 10.5px;
  --t-sm: 12px;    /* rail rows, tails, inspector values, hints */
  --t-md: 13px;    /* palette rows, panel titles, headings      */
  --t-lg: 15px;    /* palette input, inspector heading          */
  --lh-tight: 1.25;
  --lh-body:  1.5;
}
```

Two rules ride along, both currently inconsistent:

- **Uppercase micro-labels need weight 600.** `.palette__section` already sets
  it; the shell's four equivalents inherit 400 and disappear. Two surfaces
  disagreeing about the same idiom is visible whenever the palette is open
  over the rail.
- **One monospace stack.** `.panel__card` uses `"SF Mono", Menlo`;
  `.review-node__body` uses `ui-monospace, SFMono-Regular, Menlo`. These
  resolve to different faces on some macOS configurations. One `--font-mono`
  token, used by both.

## Motion

Three rules, and then stop. Over-animating a canvas app is worse than not
animating it.

```css
/* 1. State flips on everything that answers the pointer. */
.rail-row, .rail-row__main, .rail-row__close, .rail-row__start,
.rail-row__rename, .shell__top button, .inspector__action,
.palette__row, .panel__close, .review-node__file-button {
  transition: background-color var(--dur-1) var(--ease),
              color            var(--dur-1) var(--ease),
              border-color     var(--dur-1) var(--ease),
              opacity          var(--dur-1) var(--ease);
}

/* 2. Panel status. Slightly slower: a status change that snaps reads
      as a glitch. box-shadow and border-color ONLY — never transform,
      see invariant 3. */
.panel { transition: box-shadow 140ms var(--ease), border-color 140ms var(--ease); }

/* 3. The one attention-getter. wants-you is the only state carrying
      INTENT — styles.css already makes this argument for its second
      visual channel — so it is the only one worth animating. The
      animation touches box-shadow alone, which is why invariant 1
      survives it. */
@keyframes wants-you-pulse {
  0%, 100% { box-shadow: 0 0 0 2px var(--amber), 0 0 20px rgba(224,175,104,.10), var(--e-2); }
  50%      { box-shadow: 0 0 0 2px var(--amber), 0 0 32px rgba(224,175,104,.22), var(--e-2); }
}
.panel--agent-wants-you { animation: wants-you-pulse 2.4s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

## Focus

Currently the only `outline` in the file is `outline: none`. Because
`shellControl()` calls `preventDefault()` on mousedown, focus never lands on a
shell control by mouse — but every one of them is natively Tab-reachable, so
today a keyboard user gets Chromium's default ring on some surfaces and
nothing considered anywhere.

```css
:where(button, [href], input, [tabindex]):focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
.palette__row:focus-visible { outline-offset: -2px; }  /* flush to the container edge */

/* The palette input keeps outline:none — a ring inside a ring reads as
   broken — and the BAR carries the indicator instead. Same information,
   correct object: this satisfies "never remove a focus outline without a
   replacement" by relocation rather than by deletion. */
.palette__bar:focus-within { box-shadow: inset 0 -1px 0 var(--blue); }
```

`--blue` on `--s-3` is 6.35:1, so the 2px perimeter clears WCAG 2.2 AA Focus
Appearance and the AAA form as well.

## Tasks

Seven, each leaving `npm run verify` green on its own. The order is chosen so
that every later task is expressed in the vocabulary the earlier one
introduced — Task 2 cannot be written before Task 1 exists.

| T | Task | Landing condition |
|---|---|---|
| 1 | Token layer, **split into structural `:root` and a `[data-theme="dark"]` colour block**; define `--fg`; back-compat aliases | `verify` green; every `var(--fg)` resolves to a declared token (today all 5 inherit by accident); no colour on bare `:root`, no structure inside the theme block |
| 2 | Retire all 19 hardcoded hexes in the palette block onto tokens | zero `#rrggbb` outside `:root` |
| 3 | Contrast pass; delete every `opacity`-based text dimming | measured table in the commit message |
| 4 | Type scale; 9px/10px retired; uppercase labels to 600; one `--font-mono` | ≤4 `font-size` values |
| 5 | Space, radius, elevation applied; panel shadow; concentric corners | ≤4 radii, ≤7 spacing values |
| 6 | Motion + `prefers-reduced-motion` | `verify:panels` 62/97 green (the invariant-1 proof) |
| 7 | `:focus-visible` rings | `verify` green |

Task 6 is the only one with a non-trivial verification story, and it is the
reason invariant 1 is written down: it adds an `animation` to the exact
selector two checks assert against, and it is green only because those checks
read `borderTopColor` rather than the computed shadow.

## Verification

M10 adds **no new check**, and that is a deliberate position rather than an
omission.

Every fact M10 changes is a rendered colour, size or duration. The repo has no
tier that can assert on those meaningfully: the plain-node suites have no DOM,
and the Electron suites can read a computed value but would then be asserting
that a token equals itself — the shape `verify:panels` 32's comment already
warns about, where a check reads as coverage and proves nothing. A screenshot
test would catch real regressions and is a dependency and a milestone of its
own.

What M10 does instead is **prove it broke nothing**, which is the claim that
actually matters for a values-only change:

- `npm run verify` green after every task.
- `verify:panels` 62 and 97 specifically after Task 6 — the two checks the
  motion work is closest to.
- The contrast table recomputed and pasted into the Task 3 commit message, so
  the numbers are in the history rather than in someone's memory.

## What M10 does not solve

**The short list, for triage later:**

- **Light mode and any further theme** — M10 ships the *shape*, not a second
  palette. Needs `create-terminal.ts`, a registry-wide retheme, and an `'enum'`
  setting type. → **M11 — Themes**, sketched below.
- **Icons are HTML entity glyphs** (`&times;`, `&#9654;`, `&#9998;`, `⚙`, `⟳`,
  `−`, `+`, `‹`, `›`). Two are emoji-presentation-eligible; all sit at
  different optical centres; stroke weight is uncontrollable. → SVG set.
- **Pointer targets are under 24 CSS px** — the three rail row controls are
  18×21, and five other controls are ~20–21px. WCAG 2.2 SC 2.5.8 wants 24×24.
  → changes row heights, so it is a layout task.
- **Row controls are permanently visible** — twelve close buttons on a
  twelve-panel canvas. Hiding them behind `:hover`/`:focus-within` is the
  largest decluttering win available, and `verify:panels` 84/85/86 drive those
  controls, so it needs its own verification story.
- **Type is the system stack** — and the CSP is `default-src 'self'`, so
  self-hosting Inter / JetBrains Mono means a bundled dependency and a
  `font-src` edit to `index.html`.
- **Four monospace stacks disagree**, and one of them (`create-terminal.ts`)
  already names a face the app does not ship. M10 unifies the two in CSS; the
  xterm one is M11's, since it lives in the same file as the terminal theme.
- **No visual regression test exists, and M10 adds none** — see
  "Verification" for why that is a position rather than an omission. A
  screenshot suite is its own milestone.
- **The dot grid decision** — open question 2, and the only deferred item that
  is a preference rather than a cost.

Each is expanded below, with the reason it stops here.

### M11 — Themes

The successor this milestone creates. Scope, as currently understood:

- Wire a `data-theme` attribute on the document root, driven by a setting.
- Add `SettingDef['type'] = 'enum'` with an `options` list — the first genuine
  customer for a type the codebase removed on purpose (`ideas-backlog.md` #11).
  Reopening it deliberately is the point; it should be re-argued, not assumed.
- Author `[data-theme="light"]`, with its contrast re-measured from scratch. A
  light ground is the harder direction: dark palettes forgive a wrong step,
  light ones show it.
- Move the xterm `ITheme` out of `create-terminal.ts` so both palettes come
  from one place, and add a registry verb that assigns `term.options.theme` to
  every retained `Terminal`. This is the task that touches the create-once
  invariant and deserves the most care.
- Decide whether `prefers-color-scheme` selects the default when the user has
  expressed no preference. (M10 deliberately does not, because there is no
  light block for it to select.)

### The four deferred items, in detail

**Icons are HTML entity glyphs.** `&times;`, `&#9654;`, `&#9998;`, `⚙`, `⟳`,
`−`, `+`, `‹`, `›`. Three separate problems: `⚙` (U+2699) and `▶` (U+25B6) are
emoji-presentation-eligible and can resolve to Apple Color Emoji depending on
the fallback chain, with no variation selector present to stop it; the glyphs
have different optical centres, so three controls in a row sit at three
heights; and stroke weight is inherited from the font, so they are either too
heavy or too thin, never right. Deferred because the fix is a `.tsx` change
and `verify:panels` may select on `'×'` — that grep is the first task of the
follow-up, not a guess to make here.

**Targets are under 24 CSS px.** `.rail-row__start` / `__rename` / `__close`
are `width: 18px` at roughly 21px tall, three abreast with a 2px gap;
`.shell__top button`, `.panel__close`, `.review-node__refresh` and
`.shell__region-add` are all around 20–21px. WCAG 2.2 SC 2.5.8 asks for 24×24.
Fixing it changes row heights, which changes what fits in the rail, which is a
layout change rather than a values change.

**The three row controls are permanently visible.** On a twelve-panel canvas
that is twelve close buttons competing for attention, and hiding them behind
`:hover` / `:focus-within` is the single largest decluttering win available.
Deferred because `verify:panels` 84, 85 and 86 drive those controls, and a
dispatched `MouseEvent` does not trigger `:hover` — so this needs its own
verification story, not a CSS line.

**Type is the system stack.** `-apple-system, BlinkMacSystemFont, "SF Pro
Text"`. SF is a good face and it is also the default, which is what makes an
app read as templated. Inter (with `cv05`, `cv08`, `ss03`) or IBM Plex Sans
with JetBrains Mono are the matches for this product type. Deferred because
the renderer's CSP is `default-src 'self'` — the Google Fonts CDN is not an
option, so this means a `@fontsource` dependency, bundled woff2, and a
`font-src` edit to `index.html`. That is a real decision, not a value.

One more, smaller: **the canvas dot grid is imperceptible** at 1.21:1 and is
currently a compositing cost buying nothing. M10 either commits to it at a
visible alpha or removes it — see open question 2, which is the user's call
rather than the spec's.

## Success criteria

Falsifiable, so that "it looks nicer" is never the evidence:

1. Zero hardcoded hex values outside `:root`.
2. Zero undefined custom properties; `--fg` resolves rather than inherits.
3. Every non-disabled text/background pair measures ≥ 4.5:1, computed and
   recorded.
4. Zero `opacity`-based text dimming.
5. ≤ 4 `font-size` values; ≤ 4 `border-radius` values *plus* `50%` on circular
   dots and `--r-full` on pills, which are shapes rather than scale steps;
   ≤ 7 spacing values.
6. Every interactive element has a `:focus-visible` treatment.
7. A `prefers-reduced-motion` block exists and covers every animation added.
8. Colour appears only inside a `[data-theme]` block; structure appears only
   on bare `:root`. Removing the theme block leaves a stylesheet with no
   colour in it — which is the mechanical test that the split is real.
9. With no `data-theme` attribute set, the rendered app is dark and behaves
   exactly as it does today.
10. `npm run verify` green.

## Risks

**The one real risk is invariant 1**, and it is written down rather than
mitigated: a later editor who "tidies" `--amber` into an alias chain, or
applies a `color-mix()` to the wants-you border, turns `verify:panels` 62 and
97 red for a reason that has nothing to do with attention routing. The
mitigation is the comment in the token block, sited at the declaration where
the mistake would be made.

**A softer risk is the aliases.** Keeping `--text`, `--muted`, `--bg`,
`--panel-bg`, `--chrome-bg` and `--border` as aliases is what lets the
migration land task by task, and it also means the file temporarily holds two
names for one colour — exactly the duplication M10 exists to remove. They are
kept for this milestone deliberately and their retirement is a follow-up, not
a loose end. Whoever removes them should re-derive the usage count rather than
trust this paragraph.

---

# Open design questions

Ten decisions this spec deliberately does not make, because they are
preferences about what the app should feel like rather than facts about what
it currently does. Each carries options, a recommendation, and what it costs
to leave unanswered.

### 1. How loud should `wants-you` be?

The one state carrying intent. Today: amber border plus a 2px ring.

- **(a)** Leave it static — ring only.
- **(b)** Add the slow `box-shadow` pulse (Task 6 as specced).
- **(c)** Pulse only while the panel is off screen, i.e. pair it with the edge
  pip and let an on-screen panel stay still.

*Recommendation: (b).* A canvas whose premise is that you were not watching
needs one signal that survives peripheral vision, and 2.4s is slow enough not
to nag. **(c)** is the interesting answer and is more work than M10 has:
"off screen" is `edgeIndicator`'s question, not CSS's.

*Cost of deferring:* none. Task 6 can ship (a) and add the animation later.

### 2. Does the canvas keep its dot grid?

At `#1c2030` on `#0b0c11` it is **1.21:1** — not subtle, imperceptible.

- **(a)** Remove it. The canvas is a void and a void is honest.
- **(b)** Raise it to `rgba(255,255,255,.05)` (≈1.09 over the new `--s-0`;
  visible in practice because it is a repeating pattern, not a single edge).
- **(c)** Replace it with a soft radial vignette centred high — no grid, but
  the ground stops reading as flat.
- **(d)** Grid *and* vignette.

*Recommendation: (d).* The grid is what makes panning legible — without a
texture there is no parallax cue at all, and the world can feel stuck. The
vignette is what stops a large dark field reading as a void.

*Cost of deferring:* none, but this is the most visible single change in the
milestone and worth deciding before Task 1 rather than after.

### 3. One selection idiom, or two?

The rail uses a background fill (`rgba(255,255,255,.08)`); the palette uses a
fill **plus** a 2px inset accent bar, with a comment explaining that at 13px
on a dark ground the fill alone is too subtle.

If that argument is true in the palette, it is true in the rail — the rail's
rows are 11px, smaller.

- **(a)** Both surfaces get fill + accent bar.
- **(b)** Both get fill only; the palette's bar is removed.
- **(c)** Keep them different, on the grounds that a palette selection means
  "Enter runs this" and a rail selection means "this is the current panel",
  and two different meanings may deserve two different marks.

*Recommendation: (a).* The palette's own comment is the strongest argument in
the file for the accent bar, and **(c)**'s distinction is real but is already
carried by context — nobody confuses an open modal with a sidebar.

*Cost of deferring:* low, but this is a Task 1/5 decision and retrofitting it
means touching both surfaces twice.

### 4. Is the app committing to dark-only? — **ANSWERED: no**

*Decided 2026-08-29. Recorded here rather than deleted, because the reasoning
constrains M10 and schedules M11.*

**The app supports dark and light, and is built so further themes are values
rather than work.** M10 does not ship light. It ships the *shape* — the
`:root` / `[data-theme]` split described under "The token layer" — and stays
one file with zero DOM risk.

The split is where it is because light mode is **not** a values-only change,
which was established by reading `create-terminal.ts` rather than assumed:

- **The terminal has its own palette, in TypeScript.** A 21-colour `ITheme`
  const, four of whose entries duplicate `:root` tokens exactly. A light app
  with dark terminal rectangles in every panel does not read as a light app;
  it reads as broken.
- **That palette is fixed at construction, and the `Terminal` is never
  reconstructed.** It is passed to `new Terminal({ theme })`, and the
  `Terminal` is created once and retained for the life of the renderer with
  `term.open()` running at most once — the invariant `create-terminal.ts` and
  `CLAUDE.md` are both most protective of. Switching theme at runtime means
  assigning `term.options.theme` on **every retained `Terminal` in the
  registry**, which is a new registry verb, not a CSS rule.
- **The settings schema cannot express a theme picker.** `SettingDef['type']`
  is `'boolean' | 'number'`. `CLAUDE.md` records that an earlier draft added
  `'enum'` and it was removed deliberately as a customer-free abstraction
  (`ideas-backlog.md` #11) — while the same file's `keywords` doc comment uses
  *"a user looking for the theme types 'dark'"* as its motivating example. The
  schema has been describing this feature as hypothetical since M6b. A theme
  picker is the customer `'enum'` was missing, so adding it reopens a decision
  the codebase declined on principle rather than inventing a new one.

Three files, one new registry operation, one reopened schema decision. That is
a milestone, and it is **M11 — Themes**, sketched under "What M10 does not
solve".

What remains genuinely open is only the *count*: whether M11 ships two themes
or a set. The architecture is indifferent — a theme is a block of values under
a `[data-theme]` selector either way — so this can be answered when M11 is
specced rather than now.

### 5. Should `starting` stay visually identical to `idle`?

`agent-state.ts` refuses to alias them ("painting it idle at spawn would make
the very first thing the user sees a lie"), and `styles.css` carries two rules
that render them identically anyway, with comments explaining the coincidence
is deliberate and must move together.

A real `claude` takes seconds to boot. That is exactly the window a user wants
feedback in.

- **(a)** Keep them identical. The state machine's distinction is internal.
- **(b)** Give `starting` its own quiet treatment — a dimmed border, or a
  slow shimmer on the card.
- **(c)** Give it the neutral border but an animated ellipsis or a progress
  hairline in the panel chrome.

*Recommendation: (b), dimmed border only.* The state exists, it is reachable,
and it is the one moment the app currently says nothing. **(c)** is chrome
work and belongs with the icon milestone.

*Cost of deferring:* none. This is additive.

### 6. What is the density target?

Rail rows are ~21px, top-bar buttons ~21px. That is denser than macOS system
UI and denser than most editors. Fixing targets to 24px (deferred out of M10)
pushes rows to ~28px, which is roughly Linear's density and noticeably airier.

- **(a)** Stay dense. More panels visible in the rail is worth more than
  comfort.
- **(b)** Go to 24/28px for accessibility conformance and accept fewer visible
  rows.
- **(c)** Make it a setting — `shell.density`, which the existing
  `SettingDef` machinery would generate a palette row for free.

*Recommendation: (b).* SC 2.5.8 is not optional, and the rail scrolls anyway,
so "fewer visible rows" costs less than it sounds. **(c)** is tempting because
it is nearly free, and it is exactly the customer-free abstraction
`ideas-backlog.md` #11 warns against — one user, one density.

*Cost of deferring:* this gates the deferred target-size work, so it should be
answered before that milestone is planned, not before M10 ships.

### 7. Should the inspector read as code, or as prose?

The pane's stated purpose is answering "why does this panel say login shell".
Its `command`, `asked for` and `cwd` fields are paths and argv — code — and
are currently set in the UI sans face at 11px.

- **(a)** Set those three in `--font-mono` at 11.5px, `--fg-2`. The pane reads
  as a developer tool.
- **(b)** Leave as-is. One face is calmer.
- **(c)** Mono for `command` and `cwd`; sans for everything else including
  `asked for`, on the grounds that `asked for` is often the word "nothing".

*Recommendation: (a),* and note that the absent case is exactly why: rendering
`login shell` in a proportional face beside `/bin/zsh` in mono is the clearest
possible way to show that one is a description and the other is a resolved
value — which is the distinction the pane exists to make.

*Cost of deferring:* none, but this needs a `.tsx` class and so is out of
M10's scope by construction. It is the strongest candidate for the first task
of the follow-up.

### 8. Does `--muted` deserve to split?

Today one token serves "secondary information" and "disabled". They have
different contrast obligations — 4.5:1 versus exempt — and merging them is why
the current `--muted` sits at 4.19:1 on chrome: it was pulled down to look
disabled somewhere.

M10 splits it into `--fg-3` and `--fg-4`. The question is whether the
back-compat `--muted` alias should point at `--fg-3` (as specced) or be
retired immediately.

- **(a)** Alias to `--fg-3`, retire later. Migration lands task by task.
- **(b)** Retire immediately; every usage is rewritten in Task 1.

*Recommendation: (a),* which is what the spec assumes. **(b)** makes Task 1
touch far more of the file and is the version most likely to produce a
mistake in a task whose whole value is being unbreakable.

### 9. Does the palette get a search glyph?

The empty state is currently an unlabeled 680px field. Every comparable
surface (Raycast, Linear, VS Code) puts a magnifier at the left.

- **(a)** Yes, once the SVG set exists.
- **(b)** No — the scope chip already occupies that position when a drill-in
  is active, and two things fighting for one slot is worse than an empty one.
- **(c)** A glyph that becomes the scope chip when a scope is entered.

*Recommendation: (c),* which is nearly free once (a) exists and resolves (b)'s
objection rather than conceding to it. Out of M10 by scope.

### 10. Should the top bar's shortcuts be visible rather than hover-only?

`⌘N`, `⌘K`, `⌘1`, `⌘\` are all in `title` attributes and nowhere else. A `kbd`
chip in the button — styled like `.palette__kbd`, which already exists — is
the cheapest available signal that this is a tool for people who will learn
it.

- **(a)** Visible chips on New panel and Search; `title` for the rest.
- **(b)** All of them.
- **(c)** None; the palette's footer is where shortcuts live.

*Recommendation: (a).* **(b)** turns a 40px bar into a keyboard reference and
competes with the canvas, which the bar's own comment says it must not do.
**(c)** is the status quo and means the two most-used shortcuts in the app are
discoverable only by hovering.

*Cost of deferring:* none; needs `.tsx`, so it is out of M10 regardless.
