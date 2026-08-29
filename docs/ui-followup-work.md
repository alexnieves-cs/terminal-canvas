# UI follow-up work

**Created:** 2026-08-29, out of the M10 visual-system design
(`superpowers/specs/2026-08-29-m10-visual-system-design.md`).
**Status:** none of this is scheduled. This file exists so it is not
re-discovered from scratch in three months.

M10 is deliberately values-only: one file (`src/renderer/styles.css`), no
`.tsx`, no class renames, no new dependency. That boundary was chosen because
the complete set of CSS values any verify suite reads is three things (see
M10's "The three invariants"), which makes a token swap provably safe. Every
item below fell outside it, and each fell outside for a *specific* reason
recorded here rather than for being less important.

Ordered by (payoff ÷ risk), highest first. The first three are cheap; the last
three each need their own verification story.

---

## 1. Inspector values set as code — the cheapest item on this list

**Why:** the pane's stated purpose is answering *"why does this panel say
login shell"*. Its `command`, `asked for` and `cwd` fields are paths and argv
— code — and are currently set in the UI sans face at 11px, identical to the
prose around them.

The absent case is the whole argument. Rendering `login shell` in a
proportional face beside `/bin/zsh` in mono is the clearest possible signal
that one is a *description* and the other a *resolved value* — which is
exactly the distinction the pane exists to make, and the one M5a's
"absent `command` must stay absent" rule turns on.

**Do:** add a `--mono` modifier class to those three values in
`shell/Inspector.tsx`; `--font-mono` at 11.5px, `--fg-2`.

**Risk: low.** `verify:rail` asserts on the *model* (`buildInspectorModel`),
not on rendered class names, so a presentational class is invisible to it.
Confirm with a grep before assuming.

**Cost of not doing it:** the one surface built to explain the chain looks
like a settings sheet.

---

## 2. Visible shortcut chips in the top bar

**Why:** `⌘N`, `⌘K`, `⌘1` and `⌘\` live in `title` attributes and nowhere
else. The two most-used shortcuts in the app are discoverable only by
hovering. `.palette__kbd` already exists and is already styled.

**Do:** a `kbd` chip on **New panel** and **Search** only. Not on the rest —
the top bar's own comment says the toolbar must not compete with the canvas
for attention, and chips on all four turn a 36px bar into a keyboard
reference.

**Risk: low.** Adds a child element inside two buttons.
`verify:panels` 76/78 click those buttons by class, not by text content —
confirm before assuming.

---

## 3. The dot grid decision

**Why:** currently `#1c2030` on `#0b0c11` = **1.21:1**. Not subtle —
imperceptible. It is a compositing cost buying nothing.

This is M10 open question 2 and is a *preference*, not a cost, which is the
only reason it is not simply in M10. The recommendation there was **grid at a
visible alpha AND a soft radial vignette**: the grid is what makes panning
legible (without a texture there is no parallax cue and the world can feel
stuck), and the vignette is what stops a large dark field reading as a void.

**Do:** decide, then it is a one-line CSS change and could be folded into M10
if answered in time.

---

## 4. Pointer targets under 24 CSS px

**Why:** WCAG 2.2 SC 2.5.8 asks for 24×24. Current sizes:

| Control | Size |
|---|---|
| `.rail-row__start` / `__rename` / `__close` | **18 × ~21**, three abreast with a 2px gap |
| `.shell__top button` | ~21 tall (`3px 9px` padding at 11px) |
| `.panel__close` | ~20 tall (`2px 7px`) |
| `.review-node__refresh` | ~20 tall |
| `.shell__region-add` | ~18 |

**Do:** 24×24 minimum, `display: grid; place-items: center`, which also fixes
the optical-centre problem in item 5 for free.

**Risk: medium — this is a layout change, not a values change.** Rail rows go
from ~21px to ~28px, which changes how many rows fit before `.rail-list`
scrolls. Gated on M10 open question 6 (density target); the recommendation
there was to take the conformant size and accept fewer visible rows, since the
rail scrolls anyway.

---

## 5. SVG icon set, replacing HTML entity glyphs

**Why:** the app ships `&times;`, `&#9654;`, `&#9998;`, `⚙`, `⟳`, `−`, `+`,
`‹`, `›` as text. Three distinct problems:

1. **`⚙` (U+2699) and `▶` (U+25B6) are emoji-presentation-eligible.** No
   variation selector is present, so on macOS they can resolve to Apple Color
   Emoji depending on the fallback chain — a full-colour gear in a monochrome
   grey toolbar. This is font-stack roulette, not a styling choice.
2. **They sit at different optical centres.** `×` rides the baseline at cap
   height, `▶` centres differently, `✎` has a descender. Three controls in a
   row at three heights is a specific, nameable reason a UI reads as "off".
3. **Stroke weight is inherited from the font**, so they are either too heavy
   at 600 or too thin at 400, never right.

**Do:** inline SVG, 14px, `stroke-width: 1.5`, `stroke="currentColor"`, on a
24px grid cell (item 4). Lucide's geometry suits this aesthetic. **Every icon
takes `aria-hidden="true"`** — the buttons already carry `aria-label`, and an
un-hidden icon adds a second accessible name, which is the half of the ARIA
guideline nobody checks for.

**Risk: medium.** **First task is `grep -n "'×'\|&times;\|textContent" scripts/verify-panels.cjs`** —
if any check selects a control by its glyph rather than its class, the swap
moves a selector. Do not assume either way.

---

## 6. Hover-revealed row controls — the biggest decluttering win

**Why:** every rail row shows its `×` permanently. On a twelve-panel canvas
that is twelve close buttons competing for attention with the twelve panel
names they sit beside.

**Do:** `opacity: 0` at rest, revealed on `:hover` **and `:focus-within`** —
the focus half is what keeps them Tab-reachable, which `opacity: 0` alone
would not.

**One exception that must not be missed:** `.rail-row__start` (the dormant
panel's ▶) **must stay visible**. It is the only affordance a dormant panel
has, and hiding it makes the feature unfindable — the rule `verify:palette`
31's comment already states: *a control that disappears is indistinguishable
from a feature that is missing.*

**Risk: medium, and it needs its own verification story.**
`verify:panels` 84, 85 and 86 drive these controls, and **a dispatched
`MouseEvent` does not trigger `:hover`** — the same untrusted-event limit
`verify:panels` 47 records from the other side (a synthetic `WheelEvent`
performs no default scroll). A real `webContents.sendInputEvent` does produce
hover, which is the route `verify:panels` 75c already uses for focus
behaviour, so the fix is to drive these the same way rather than to weaken the
checks.

**Fallback if that proves awkward:** `opacity: 0.35` at rest instead of `0`.
Keeps most of the calm, loses none of the hit area, and changes nothing about
how a check clicks.

---

## 7. Self-hosted type

**Why:** the app is on `-apple-system, BlinkMacSystemFont, "SF Pro Text"`. SF
is a good face and it is also *the default*, which is what makes an app read
as templated. The matches for this product type are **Inter** (with `cv05`,
`cv08`, `ss03` — the features that make it read as a precision tool rather
than a marketing site) or **IBM Plex Sans + JetBrains Mono**.

**The blocker is the CSP, and it is a real one.** `src/renderer/index.html`
sets `default-src 'self'`. **The Google Fonts CDN is not an option** — this
means a bundled dependency (`@fontsource-variable/*`), woff2 in the build, and
a `font-src` edit to `index.html`. That is a decision about the app's
dependency surface, not a value.

**Cheaper interim, needing no dependency:** SF Pro is set too loose at small
sizes for UI chrome. `letter-spacing: -0.01em` on `.rail-row__main`,
`.palette__row`, `.inspector__value` and `.panel__title` is the highest-ratio
typographic change available on the system stack.

**Related, and it belongs with M11 rather than here:** the app has **four**
monospace stacks — `.panel__card`, `.review-node__body`, `create-terminal.ts`,
and `--font-mono` once M10 adds it. The xterm one already names
`"JetBrains Mono"`, a face the app does not ship, so it silently falls through
to `"SF Mono"` on every machine. M10 unifies the two in CSS; the xterm stack
lives in the same file as the terminal `ITheme` and moves with it in M11.

---

## 8. Visual regression testing

**Why:** M10 adds no check, deliberately — see its "Verification" section. The
plain-node tiers have no DOM, and an Electron check reading a computed token
would be asserting that a token equals itself, the shape `verify:panels` 32's
comment already warns about: a check that reads as coverage and proves
nothing.

So there is currently **no automated way to notice a visual regression**. That
is an accepted gap, not an oversight, and it is the honest reason M10's
verification story is "prove it broke nothing" rather than "prove it looks
right".

**Do, if ever:** a screenshot suite over the existing hidden-window harness.
It is its own milestone — image storage, a diff threshold that tolerates font
rasterisation differences across machines, and a golden-update workflow.
`verify:packaged`'s "kept out of the default chain because it is slow and
needs the network" precedent applies: it would be a pre-release gate, not part
of `npm run verify`.

---

## Explicitly NOT on this list

**Light mode and further themes.** Not deferred — *scheduled*, as **M11 —
Themes**, sketched in M10's "What M10 does not solve". It is a different kind
of item: three files, a new registry verb, and one reopened schema decision
(`SettingDef['type']` gaining `'enum'`, removed once as a customer-free
abstraction per `ideas-backlog.md` #11 — a theme picker is the customer).
M10 ships the `[data-theme]` shape so M11 is a block of values rather than a
refactor.
