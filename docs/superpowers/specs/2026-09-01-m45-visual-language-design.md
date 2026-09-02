# M45 — The visual language

**Status:** designed 2026-09-01. Criterion 3 of the 1.0 brief, and the one
milestone the scope decision exempts from "do not widen": a single
considered design reaches every component's styling by definition.
**Backlog entries:** #10 (light/dark), the whole of `docs/ui-followup-work.md`
items 1–7, and the "M23" interface-architecture spec's Phase 0 and Phase 5.

## Where the app is, measured

- **One theme, and it is not the one its selector names.** The only colour
  block is `:root, :root[data-theme="dark"]` and it holds M19's "soft
  machine": a pale porcelain casing (`--s-0: #e3e6eb`, `color-scheme:
  light`) with dark terminal wells. Nothing in the renderer sets
  `data-theme` or reads `prefers-color-scheme`. The dark theme M10 designed
  for does not exist; the light one exists under the dark one's name.
- **Depth is drawn with shadows, not lines.** Raised surfaces are a
  white-up-left/grey-down-right pair, recesses the inverse, and hover and
  selection are RECESSES (`--s-4` darker than the ground). That grammar is
  the reason a `@media (forced-colors)` block has to restore borders by
  hand, and the reason a dark theme cannot be a token swap: a soft-UI dark
  ramp is a re-derivation of every shadow, not a re-fill of every colour.
- **Type runs from 10.5px to 56px in two faces.** `--t-xs` 10.5 through
  `--t-lg` 15 on the system stack, then `--t-xl` 20 to `--t-4xl` 56 in
  Poppins Black — a bundled marketing face carrying an editorial look, used
  for the top-bar wordmark and a few headings, with its own `@font-face`,
  a CSP `font-src` path, and a `font-display: block` load race.
- **Icons are text.** `&times;`, `&#9654;`, `&#9998;`, `⚙`, `⟳`, `‹`, `›`,
  `✎`, `↻`, `−`, `+` render as glyphs from whatever font the stack resolves
  — `⚙` and `▶` are emoji-presentation-eligible and can come back in colour
  — at three different optical centres and a stroke weight the font chose.
- **Targets are under 24px.** `.rail-row__close` is 18px wide;
  `.panel__close`, `.shell__region-add`, `.inspector__link-action` and the
  review/toolbox/file refresh controls are ~18–21px tall. WCAG 2.2's 24×24
  floor (SC 2.5.8) is missed by every icon control in the app.
- **Motion is mostly right.** Two duration tokens, one easing, four
  keyframes, six transitions, and a global reduced-motion block that
  collapses everything to .01ms. What is missing is a rule for the camera,
  which M56 owns.
- **The style suite measures ONE block.** `verify:styles` 11 flattens every
  theme block into one map, last declaration wins; a second block would be
  measured only where it overwrote the first.

## Direction, decided

**A quiet instrument: flat surfaces, hairline boundaries, modest elevation,
one accent, two themes from one token set.** This retires the soft-machine
grammar deliberately rather than extending it. Three reasons, each a
mechanism rather than a preference:

1. **A boundary drawn with a line survives every rendering the app must
   live in** — dark, light, forced colours, a 4K display, a screenshot
   pasted into an issue — while a boundary drawn with a shadow pair
   survives one. The forced-colours block that restores borders by hand is
   the proof: it is the design admitting lines were load-bearing all along.
2. **A dark theme becomes a second VALUE block, exactly as M10 designed**,
   because depth no longer needs re-deriving per theme. Hover and selection
   go back to being lighter-or-tinted, which is what every native macOS
   control does and what a user's hand already expects.
3. **The terminal is the product and the chrome must not compete with it.**
   A neumorphic casing is the most visually assertive chrome available; an
   agent's own colours should be the loudest thing on screen.

### Type

- **One face for the chrome: the system UI stack** (`-apple-system,
  BlinkMacSystemFont, "SF Pro Text", system-ui`). The follow-up list argued
  the default reads as templated; on macOS the opposite holds for a
  developer tool — Terminal, Xcode and every system dialog set SF, and an
  app that reads as native reads as finished. Consistency of size and
  weight is what makes it designed. **Poppins goes**, with its
  `@font-face`, its woff2 and the `font-src` allowance; the wordmark
  becomes the app's name in the UI face at `--t-sm`, 600.
- **One face for values: the mono stack** (`ui-monospace, SFMono-Regular,
  "SF Mono", Menlo, monospace`), and the xterm stack in `create-terminal.ts`
  aligned to the SAME list — today it names JetBrains Mono, which the app
  does not ship and which therefore falls through silently on every
  machine.
- **A six-step scale at a 1.2 ratio, 11 to 24:** `--t-xs` 11 (caps labels
  only, 0.06em tracking, never sentence case), `--t-sm` 12, `--t-md` 13,
  `--t-lg` 15, `--t-xl` 18, `--t-2xl` 24. `--t-3xl`/`--t-4xl` and
  `--lh-display` are deleted; `--lh-tight` 1.25 and `--lh-body` 1.5 stay.
  `font-variant-numeric: tabular-nums` on every figure (pids, counts,
  dollars, zoom).

### Space and shape

- `--sp-1..8`: 2, 4, 6, 8, 12, 16, 24, 32. `--sp-9` (48) is deleted.
- `--r-sm` 4, `--r-md` 6, `--r-lg` 10, `--r-full`. `--r-xl`/`--r-2xl` are
  deleted; the palette and the launcher use `--r-lg`.
- The concentric rule stands: a nested radius decreases by roughly its
  inset.

### Colour: one token set, two blocks

Every colour token is declared in BOTH `:root[data-theme="light"]` and
`:root[data-theme="dark"]`, with bare `:root` holding the light block's
values so the app has a theme before any attribute is stamped. The set:

| Token | Role |
|---|---|
| `--s-0` | the canvas ground — darkest in dark, lightest in light |
| `--s-1` | panel and pane surfaces |
| `--s-2` | chrome: top bar, rail, inspector |
| `--s-3` | raised: palette, HUD, menus |
| `--s-4` | hover fill |
| `--s-5` | pressed / selected fill — never a text ground |
| `--well` | the terminal ground, tied to the xterm theme's `background` |
| `--fg`, `--fg-2`, `--fg-3`, `--fg-4` | text ramp; `--fg-4` disabled only |
| `--line`, `--line-strong` | hairlines; every surface has one |
| `--blue`, `--green`, `--amber`, `--red` (+ `-dim` tints) | agent state |
| `--iris` (+ `-dim`) | the app's own accent, never agent state |
| `--e-1..4` | elevation shadows, never boundaries |
| `--focus` | the focus ring colour (iris) |
| `--dot` | the canvas grid tick |

Values are DERIVED against `verify:styles` 11 rather than chosen: every text
token clears 4.5:1 on every ground it can land on (`--fg-4` 3:1), and every
accent clears 3:1 on `--s-1` and `--s-4` for the non-text rule (WCAG 1.4.11),
which the widened check measures for both blocks. `--amber` stays a literal
colour and `.panel--agent-wants-you` keeps `border-color: var(--amber)`
untransformed (`verify:panels` 62/97 compare by resolved value). The `--in-*`,
`--well-inset`, `--sheen`, `--bevel-*`, `--press-inset`, `--glass-*` and
`--sh-*` tokens and their rules are deleted; the `--text`/`--muted`/`--bg`/
`--panel-bg`/`--chrome-bg`/`--border` aliases stay one more milestone and are
recorded as debt.

The dot grid is visible (`--dot` at an alpha a person can perceive on both
grounds) under a soft radial vignette — M10's own open-question answer,
adopted.

### The terminal follows the theme

`terminal/themes.ts` exports a dark and a light `ITheme`: the dark one is
today's; the light one is a light background, dark text, and a 16-colour ANSI
set re-tuned for a light ground (a bright-yellow-on-white failure is the
whole reason #10 calls this "the whole item"). `create-terminal.ts` takes the
current theme, and a theme change fans `{ theme }` across every session
through M44's `applyTerminalOptions`, with `refresh(0, rows - 1)` on each
attached terminal — a detached one repaints on its next attach, which
`attachTerminal` already forces. The card preview is CSS and follows for
free, which is what keeps a card and its panel agreeing in both themes.

### The setting is the schema's first enum

`appearance.theme`: `system` | `light` | `dark`, default `system`.
`SettingDef['type']` gains `'enum'` with a `values` array; `parsePreferences`
rejects a value outside it exactly as it rejects an out-of-range number
(M23-spec §9.1: the customer-free abstraction M6b removed has its customer).
The palette renders an enum row as a cycle — "Theme: system" → light → dark —
and the menu's submenu gets a radio group. `useTheme` stamps
`document.documentElement.dataset.theme` and, for `system`, follows
`matchMedia('(prefers-color-scheme: dark)')` live.

### Icons

`renderer/icons.tsx`: inline SVG components on a 16px grid in a 24px cell,
`stroke="currentColor"`, `stroke-width="1.5"`, round caps and joins,
`aria-hidden="true"` on every one — the buttons already carry `aria-label`,
and an un-hidden icon adds a second accessible name. The set is exactly what
the glyph inventory needs: `Close`, `Play`, `Pencil`, `Gear`, `Refresh`,
`ChevronLeft`, `ChevronRight`, `Plus`, `Minus`, `Check`, `RotateCw`
(restart-on-exit), `Search`, `Layers` (merged), `Link`. Geometry is authored
in the repository, not fetched.

### Targets, rows and reveals

- `.icon-button`: 24×24 minimum, `display: grid; place-items: center`, which
  also fixes the optical-centre problem the glyphs had. Every icon control
  takes it.
- Rail rows grow to 28px; fewer rows fit before the list scrolls, and the
  list scrolls. Row controls (`__close`, `__rename`) are `opacity: 0` at
  rest and revealed on `:hover` AND `:focus-within`; `.rail-row__start` is
  ALWAYS visible — a dormant panel's only affordance must never hide.
- `kbd` chips on **New panel** (`⌘N`) and **Search** (`⌘K`) only.
- Inspector values that are paths, argv or pids take `.inspector__value--mono`.

### Motion

Tokens only (`--dur-1` 90ms, `--dur-2` 160ms, `--ease`), the four keyframes
kept, the reduced-motion block kept. Nothing new moves in this milestone; the
camera's flights are M56's and must honour the same query.

## What it must not break

- **`verify:styles` 1–10** — every rule stays true; the token-name regex in
  8 widens to any token declared on bare `:root`.
- **`verify:panels` 62/97**: amber by resolved value. **73/125/156**: the
  frame's exact inset — the grid columns keep their widths in this
  milestone (M46 changes them).
- **Every `data-*` attribute and class a check selects on** — class names
  are kept; only values change. The one deliberate exception is the deleted
  `.shell__mark` wordmark rule, which no check reads.
- **No `process.env`, no remote assets**: the CSP loses `font-src` nothing
  else.
- **`registry.version()`**: a theme change fans through `applyTerminalOptions`.

## Verification

- `verify:styles`: 11 iterates blocks and measures BOTH; `theme.1` both
  blocks declare the same token set; `theme.2` bare `:root` carries the
  light block's colours; `icons.1` no entity or symbol glyph is a button's
  text content anywhere in `src/renderer` (source text); `font.1` no
  `@font-face` and no `font-src` in `index.html`.
- `verify:layout` `theme.1`: the enum setting parses, rejects a stray
  value, defaults to `system`.
- `verify:palette` `theme.1`: the enum row cycles and names its value.
- `verify:registry` `theme.1`: a theme change reaches a detached session.
- `verify:panels` `theme.1`: switching to dark stamps the attribute, the
  terminal's option theme changes on a live AND a detached session, and the
  card's computed background matches the theme; `targets.1`: every listed
  icon control measures ≥ 24×24; `reveal.1`: a rail row's close control is
  invisible at rest and visible on `:focus-within`, and the dormant start
  control is visible at rest.
