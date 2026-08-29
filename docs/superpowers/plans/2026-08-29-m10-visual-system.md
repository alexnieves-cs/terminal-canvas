# M10 Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the renderer a design token layer — surfaces, text, accents, spacing, radius, elevation, motion — split so that adding a theme later is a block of values rather than a refactor.

**Architecture:** One stylesheet, restructured rather than rewritten. `:root` keeps structure (spacing, radius, motion, type); every colour moves into a `:root, :root[data-theme="dark"]` block so a future `[data-theme="light"]` wins on specificity rather than source order. Every existing rule is then re-expressed in terms of those tokens. No `.tsx` is touched, no class is renamed, no dependency is added.

**Tech Stack:** Plain CSS custom properties. One new plain-node verify script (zero imports, the tier `build/builder-config.cjs` already occupies). No build step change, no new package.

**Spec:** `docs/superpowers/specs/2026-08-29-m10-visual-system-design.md` — read it first. This plan argues from it and does not restate its reasoning.

## Global Constraints

Copied verbatim from the spec. **Every task's requirements implicitly include this section.**

1. **`.panel--agent-wants-you`'s `border-color` must compute to exactly the same colour as `--amber`.** `verify:panels` 62 and 97 read `--amber` off `document.documentElement`, paint a probe with the returned string, and compare the probe's resolved `color` to the panel's `borderTopColor`. A `color-mix()`, an alpha, or a second amber token on either side breaks both checks. **Adding a `box-shadow` or `animation` to that selector is safe** — the assertion reads `borderTopColor` only.
2. **Expanded rail and inspector must stay wider than 40px.** `verify:panels` 73 asserts `railWidth > 40 && inspectorWidth > 40`.
3. **Never transition or animate `transform` on `.world` or `.panel`.** Four checks read `.world`'s computed transform through `DOMMatrixReadOnly`; one reads `zIndex`. Motion is confined to `background-color`, `color`, `border-color`, `opacity` and `box-shadow`.
4. **No `.tsx` file is modified by any task in this plan.** No class name is added, renamed or removed. If a task appears to need one, stop — it belongs in `docs/ui-followup-work.md`, not here.
5. **`npm run verify` must be green at the end of every task**, not only at the end of the plan.

### Spec amendment, made deliberately

The spec says **"Touches: `src/renderer/styles.css`, and nothing else."** This plan adds two files: `scripts/verify-styles.cjs` and a `package.json` script entry.

That is a deliberate amendment, not an oversight. The spec's boundary exists to bound **risk to the running app**, and a plain-node script that reads a file and exits cannot affect the renderer. What it buys is large: M10's success criteria are all mechanical, and without an executable audit they are aspirations that decay the first time someone adds a hex in a hurry. Task 1 updates the spec's own header to say so, so the two documents do not disagree.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/verify-styles.cjs` | **create** | M10's success criteria, executable. Reads `styles.css` as text, asserts 11 lexical and arithmetic facts, exits non-zero on any failure. Zero imports. |
| `package.json` | modify | Add `verify:styles`; add it to the `verify` chain. |
| `src/renderer/styles.css` | modify | Everything else. |
| `docs/superpowers/specs/2026-08-29-m10-visual-system-design.md` | modify (Task 1 only) | Header amended to match the two files above. |

**Why the audit is text-based and not a CSS parser.** A parser is a dependency, and this suite must stay in the cheapest tier the repo has. Every fact M10 asserts — how many distinct font sizes exist, whether a hex appears outside a theme block — is a *lexical* fact, not a cascade fact, so text is the right level. The script's own header comment must say what it cannot see: it never renders anything, so a green run means the stylesheet obeys M10's rules, never that the app looks right.

---

### Task 1: The style audit, and watching it fail

Test-first, adapted honestly to a repo with no test runner: **the audit script IS the failing test.** It is written first, run against the untouched stylesheet, and must report `1/11`. Every later task turns one or more of its checks green.

**Files:**
- Create: `scripts/verify-styles.cjs`
- Modify: `package.json` (scripts block)
- Modify: `docs/superpowers/specs/2026-08-29-m10-visual-system-design.md` (header only)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run verify:styles`, exit 0 on all-pass and 1 on any failure. Checks are numbered 1–11 and later tasks refer to them **by number**. The numbers are stable; do not renumber.

- [ ] **Step 1: Write the audit script**

Create `scripts/verify-styles.cjs` with exactly this content:

```js
#!/usr/bin/env node
/**
 * M10's success criteria, made executable.
 *
 * Plain node, zero imports — the tier `build/builder-config.cjs` already
 * occupies. It reads `src/renderer/styles.css` as TEXT rather than parsing it
 * with a CSS library, deliberately: a dependency here would drag npm install
 * into the one suite that must stay the cheapest thing in the repo, and the
 * facts M10 asserts (how many distinct font sizes exist, is there a hex
 * outside a theme block) are lexical facts, not cascade facts.
 *
 * WHAT IT CANNOT SEE, stated so nobody reads a green run as more than it is:
 * it never renders anything. It cannot tell you the app looks right, only
 * that the stylesheet obeys the rules M10 set for itself. There is no visual
 * regression test in this repo — see the spec's "Verification" section for
 * why that is a position rather than an omission.
 */
const fs = require('fs')
const path = require('path')

const CSS = process.env.TC_CSS || path.join(__dirname, '..', 'src', 'renderer', 'styles.css')
let failures = 0
let checks = 0
function ok (n, title, cond, detail) {
  checks++
  if (cond) { console.log(`ok   ${n} ${title}`); return }
  failures++
  console.log(`FAIL ${n} ${title}${detail ? `\n       ${detail}` : ''}`)
}

const src = fs.readFileSync(CSS, 'utf8')

// Strip comments once. Every check below runs on comment-free text, or a hex
// quoted in a comment counts as a hex in the stylesheet.
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '')

// Split into (selector, body) rules. Good enough for a flat stylesheet whose
// only nesting is @media and @keyframes, which is what this file is.
function rules (text) {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(text)) !== null) out.push({ sel: m[1].trim(), body: m[2] })
  return out
}
const all = rules(bare)

const isThemeBlock = (sel) => /\[data-theme/.test(sel) || /(^|,)\s*:root\s*(,|$)/.test(sel)
const themeRules = all.filter((r) => isThemeBlock(r.sel))
const bodyRules = all.filter((r) => !isThemeBlock(r.sel))
const bodyText = bodyRules.map((r) => r.body).join('\n')

// 1 — no hex outside a theme block
const strayHex = [...new Set((bodyText.match(/#[0-9a-fA-F]{3,8}\b/g) || []))]
ok(1, 'no hardcoded hex outside a theme block',
  strayHex.length === 0, `${strayHex.length} found: ${strayHex.slice(0, 8).join(' ')}`)

// 2 — every var(--x) resolves to a declared token
const declared = new Set([...bare.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]))
const used = new Set([...bare.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))
const undef = [...used].filter((v) => !declared.has(v))
ok(2, 'every var(--token) is declared', undef.length === 0, `undefined: ${undef.join(' ')}`)

// 3 — no fractional opacity. It compounds against an already-muted token and
//     is invisible to any audit that reads declared colours. 0 and 1 are fine.
const frac = [...bare.matchAll(/opacity\s*:\s*(0?\.\d+|\d*\.\d+)\s*[;}]/g)].map((m) => m[1])
ok(3, 'no fractional opacity used to dim text',
  frac.length === 0, `${frac.length} found: ${[...new Set(frac)].join(' ')}`)

// 4 — font sizes come from the scale, not from literals. Catches the `font:`
//     shorthand too, which .review-node__body uses.
const fsLit = [...new Set([
  ...[...bodyText.matchAll(/font-size\s*:\s*([\d.]+px)/g)].map((m) => m[1]),
  ...[...bodyText.matchAll(/\bfont\s*:\s*[^;]*?([\d.]+px)\s*\//g)].map((m) => m[1])
])]
ok(4, 'no literal font-size outside the scale', fsLit.length === 0, `literals: ${fsLit.join(' ')}`)

// 5 — radii come from the scale. 50% and 999px are SHAPES (a circle, a pill),
//     not scale steps, so they are exempt by design rather than by oversight.
const radLit = [...new Set([...bodyText.matchAll(/border-radius\s*:\s*([^;}]+)/g)]
  .map((m) => m[1].trim())
  .filter((v) => !/var\(/.test(v) && v !== '50%' && v !== '999px' && v !== '0'))]
ok(5, 'no literal border-radius outside the scale', radLit.length === 0, `literals: ${radLit.join(' ')}`)

// 6 — spacing comes from the scale. The lookbehind is load-bearing: a plain
//     \b matches the `margin-top` inside `scroll-margin-top` and reports a
//     false positive that sends the reader hunting for a padding that is not
//     there. 0 and 1px (hairlines) are exempt.
const spLit = [...new Set([...bodyText.matchAll(/(?<![\w-])(?:padding|margin|gap)(?:-(?:top|right|bottom|left))?\s*:\s*([^;}]+)/g)]
  .flatMap((m) => m[1].trim().split(/\s+/))
  .filter((v) => /^\d+px$/.test(v) && v !== '0px' && v !== '1px'))]
ok(6, 'no literal padding/margin/gap outside the scale', spLit.length === 0, `literals: ${spLit.join(' ')}`)

// 7 — the structure/colour split, from the colour side
const rootOnly = all.filter((r) => /^:root$/.test(r.sel))
const colourInRoot = rootOnly.flatMap((r) =>
  [...r.body.matchAll(/(--[a-z0-9-]+)\s*:\s*(?:#|rgb|hsl|oklch|color-mix)/gi)].map((m) => m[1]))
ok(7, 'bare :root declares no colour', colourInRoot.length === 0, `colour on :root: ${colourInRoot.join(' ')}`)

// 8 — and from the structure side. VACUOUS until Task 2 introduces the first
//     [data-theme] block; it passes today against a stylesheet with no split
//     at all, which is exactly the shape of check this repo distrusts. It is
//     kept because it is the only guard against a later theme block quietly
//     acquiring a radius that every other theme must then remember to repeat.
const structInTheme = themeRules.filter((r) => /\[data-theme/.test(r.sel))
  .flatMap((r) => [...r.body.matchAll(/(--(?:sp|r|dur|t|lh|ease)-[a-z0-9-]+)\s*:/gi)].map((m) => m[1]))
ok(8, 'no structural token inside a theme block', structInTheme.length === 0, `structure in theme: ${structInTheme.join(' ')}`)

// 9 — reduced motion is honoured
ok(9, 'a prefers-reduced-motion block exists', /@media[^{]*prefers-reduced-motion/.test(bare))

// 10 — focus is visible somewhere
ok(10, 'at least one :focus-visible rule exists', all.some((r) => /:focus-visible/.test(r.sel)))

// 11 — measured contrast for every text token against every ground it can
//      land on. --s-5 is deliberately NOT a ground: it is a pressed state,
//      transient, and no text is ever read against it.
const tok = {}
for (const r of themeRules) {
  for (const m of r.body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) tok[m[1]] = m[2]
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (h) => {
  const n = h.slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const grounds = ['--s-0', '--s-1', '--s-2', '--s-3', '--s-4']
const texts = { '--fg': 4.5, '--fg-2': 4.5, '--fg-3': 4.5, '--fg-4': 3.0 }
const bad = []
for (const [t, min] of Object.entries(texts)) {
  for (const g of grounds) {
    if (!tok[t] || !tok[g]) { bad.push(`${t}/${g} undeclared`); continue }
    const r = ratio(tok[t], tok[g])
    if (r < min) bad.push(`${t} on ${g} = ${r.toFixed(2)} (need ${min})`)
  }
}
ok(11, 'every text token clears its ratio on every ground it can land on',
  bad.length === 0, bad.join('; '))

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node scripts/verify-styles.cjs; echo "exit=$?"
```

Expected — **this exact output shape**, `1/11`, exit 1:

```
FAIL 1 no hardcoded hex outside a theme block
       19 found: #1c2030 #f0b429 #1b1d27 #343747 #2f3346 #b9bed6 #e6e8f0 #e8807f
FAIL 2 every var(--token) is declared
       undefined: --fg
FAIL 3 no fractional opacity used to dim text
       9 found: 0.55 0.6 0.7 0.9 0.5 0.25
FAIL 4 no literal font-size outside the scale
       literals: 11px 12px 10px 13px 9px 15px
FAIL 5 no literal border-radius outside the scale
       literals: 6px 4px 3px 10px 5px
FAIL 6 no literal padding/margin/gap outside the scale
       literals: 38px 10px 3px 9px 4px 6px 12px 2px 8px 5px 14px 7px 16px 20px
FAIL 7 bare :root declares no colour
       colour on :root: --bg --panel-bg --chrome-bg --border --text --muted --green --red --blue --amber
ok   8 no structural token inside a theme block
FAIL 9 a prefers-reduced-motion block exists
FAIL 10 at least one :focus-visible rule exists
FAIL 11 every text token clears its ratio on every ground it can land on
       --fg/--s-0 undeclared; ...

1/11 checks passed
exit=1
```

**If check 2 does not report `--fg`, stop and investigate** — that is a real pre-existing defect (five usages of a token that was never declared, working by accident because an invalid custom property makes an inherited `color` resolve to `inherit`). The audit finding it independently is the evidence that it is measuring the right things.

- [ ] **Step 3: Wire it into package.json**

In the `scripts` block, add the entry alongside the other `verify:*` entries:

```json
"verify:styles": "node scripts/verify-styles.cjs",
```

Then add it to the `verify` chain. It is plain node and offline, so it belongs **early**, beside the other cheap suites and before `build`. Find the existing `"verify":` value and insert `npm run verify:styles && ` immediately before whichever plain-node suite currently runs first.

- [ ] **Step 4: Amend the spec header so the two documents agree**

In `docs/superpowers/specs/2026-08-29-m10-visual-system-design.md`, replace:

```
**Touches:** `src/renderer/styles.css`, and nothing else.
```

with:

```
**Touches:** `src/renderer/styles.css` for every visual change, plus
`scripts/verify-styles.cjs` and one `package.json` script entry, added by the
implementation plan so the success criteria below are executable rather than
aspirational. No `.tsx`, no class rename, no `index.html`, no dependency —
the boundary that bounds risk to the running app is unchanged.
```

- [ ] **Step 5: Confirm the suite runs and the app is untouched**

```bash
npm run verify:styles; echo "exit=$?"
npm run verify
```

Expected: `verify:styles` exits 1 with `1/11` (correct — nothing is fixed yet). `npm run verify` **fails at the styles step and no further**. That is the RED for the whole milestone.

To confirm nothing else regressed, temporarily run the rest of the chain without it:

```bash
npm run typecheck && npm run build
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-styles.cjs package.json docs/superpowers/specs/2026-08-29-m10-visual-system-design.md
git commit -m "test(m10): the success criteria, made executable, and watched failing

1/11. Check 2 finds --fg undeclared on its own, which is the evidence
the audit measures the right things rather than restating the file back
to itself: five rules reach for a token that has never existed and look
correct because an invalid custom property makes an inherited color
resolve to inherit.

Check 8 is VACUOUS today and says so in its own comment — there is no
[data-theme] block for it to inspect until the next task. It is kept
because it is the only guard against a later theme block acquiring a
radius that every subsequent theme must then remember to repeat.

Amends the spec's one-file claim, which bounded risk to the running app
and is unchanged by a plain-node script that reads a file and exits."
```

---

### Task 2: The token layer, split into structure and theme

Turns checks **2, 7, 11** green. Turns check **1 partially** green (the `:root` hexes move into a theme block; the palette's 19 remain for Task 3).

**Files:**
- Modify: `src/renderer/styles.css:1-12` (the entire current `:root` block)

**Interfaces:**
- Consumes: `npm run verify:styles` from Task 1.
- Produces: every token later tasks use. Exact names: `--s-0`…`--s-5`, `--line`, `--line-strong`, `--fg`, `--fg-2`, `--fg-3`, `--fg-4`, `--blue`/`--blue-dim`, `--green`/`--green-dim`, `--amber`/`--amber-dim`, `--red`/`--red-dim`, `--sp-1`…`--sp-7`, `--r-sm`/`--r-md`/`--r-lg`/`--r-full`, `--e-1`/`--e-2`/`--e-3`, `--dur-1`/`--dur-2`/`--ease`, `--t-xs`/`--t-sm`/`--t-md`/`--t-lg`, `--lh-tight`/`--lh-body`, `--font-mono`, `--titlebar-h`. Plus back-compat aliases `--text`, `--muted`, `--bg`, `--panel-bg`, `--chrome-bg`, `--border`.

- [ ] **Step 1: Replace the `:root` block**

Delete lines 1–12 of `src/renderer/styles.css` entirely and put this in their place:

```css
/* ─────────────────────────────────────────────────────────────────────────
   STRUCTURE. Theme-invariant by definition, so none of it ever appears in a
   theme block. A radius inside a theme block is a radius every future theme
   has to remember to repeat.
   ───────────────────────────────────────────────────────────────────────── */
:root {
  /* Space. Fourteen ad-hoc padding values collapse to seven steps. The
     constraint IS the mechanism: rhythm comes from the absence of options. */
  --sp-1: 2px;  --sp-2: 4px;  --sp-3: 6px;  --sp-4: 8px;
  --sp-5: 12px; --sp-6: 16px; --sp-7: 24px;

  /* One-off structural constant, tokenised rather than left as a literal so
     the spacing audit can hold at zero literals. It is the hiddenInset
     traffic-light clearance and belongs to no scale. */
  --titlebar-h: 38px;

  /* Radius. Nested corners must DECREASE by roughly the inset or the
     concentric offset reads as sloppy: a --r-md control inside a --r-lg panel
     is right, and today's 6-inside-10 is not. 50% and --r-full are SHAPES (a
     circle, a pill), not scale steps. */
  --r-sm: 4px; --r-md: 6px; --r-lg: 12px; --r-full: 999px;

  /* Type. Six sizes inside a 6px band become four with real ratios. --t-xs is
     legal below the 12px floor ONLY because every user of it is a one- or
     two-word ALL-CAPS label at 0.09em tracking. Sentence-case text at --t-xs
     is a bug. */
  --t-xs: 10.5px; --t-sm: 12px; --t-md: 13px; --t-lg: 15px;
  --lh-tight: 1.25; --lh-body: 1.5;

  /* One monospace stack. There were three in CSS and a fourth in
     create-terminal.ts, which resolve to different faces on some macOS
     configurations. The xterm one moves in M11, with the terminal theme. */
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;

  /* Motion. 90ms is below the threshold at which a change reads as waiting
     and above the one at which it reads as a glitch. */
  --dur-1: 90ms; --dur-2: 160ms;
  --ease: cubic-bezier(.2, .8, .2, 1);

  /* Elevation. Panels have no shadow today, which is why they read as pasted
     onto the canvas rather than floating above it. A shadow only reads as
     depth when the surface beneath differs — which the ramp below provides. */
  --e-1: 0 1px 2px rgba(0, 0, 0, .40);
  --e-2: 0 4px 12px rgba(0, 0, 0, .45), 0 1px 2px rgba(0, 0, 0, .40);
  --e-3: 0 16px 48px rgba(0, 0, 0, .55), 0 2px 8px rgba(0, 0, 0, .40);
}

/* ─────────────────────────────────────────────────────────────────────────
   COLOUR, and colour only. Declared on BOTH selectors so the app is dark with
   no attribute set — which is today's behaviour, byte for byte.

   The specificity is deliberate rather than incidental. `:root` alone is
   (0,1,0) and `:root[data-theme="light"]` is (0,2,0), so a theme block added
   in M11 wins on SPECIFICITY rather than on source order — which means it can
   be appended without reordering anything, and a third theme after it cannot
   silently lose to whichever block happens to be declared last.

   M10 ships exactly one theme block and the renderer sets no `data-theme`
   attribute. No attribute means dark, which is what the app already does.
   Wiring the attribute is M11's first task, not a loose end here.
   ───────────────────────────────────────────────────────────────────────── */
:root,
:root[data-theme="dark"] {
  /* Per-theme, not structural: native scrollbars and form controls must
     follow the theme rather than the OS. */
  color-scheme: dark;

  /* Surface ramp. The old three (bg -> panel -> chrome) spanned 6.6 of
     perceptual lightness, which is why the app read as one flat slab: depth
     was being asserted by a 1.30:1 hairline, and a hairline cannot carry a
     hierarchy. This spans 22.3 L*, every adjacent step >= 2.6.

     Contrast RATIO is the wrong metric for large adjacent fills and is
     deliberately not quoted here; delta-L* is. Ratio is quoted for text. */
  --s-0: #080910;   /* app ground, canvas                          */
  --s-1: #0f111a;   /* panel body, palette list                    */
  --s-2: #161926;   /* chrome: rail, top bar, panel header         */
  --s-3: #1d2130;   /* raised: palette surface, HUD                */
  --s-4: #282d40;   /* hover fill, AND the selected fill           */
  --s-5: #343a52;   /* pressed only — transient, never a text ground */

  /* Hairlines. Both decorative. Neither reaches 3:1 and neither is meant to:
     WCAG 1.4.11 applies to boundaries needed to identify a control or
     understand content, and a divider between two panes is neither. Where a
     border IS the control boundary — focus, active — the accent is used, and
     the accents clear 3:1 with margin. --line reaches 1.86 on --s-1, against
     the 1.30 it replaces. */
  --line:        #39415a;
  --line-strong: #4d5675;

  /* Text ramp. --fg-4 is DISABLED ONLY, and is the reason no other step needs
     to go dimmer: every opacity-based dimming in the old file collapses onto
     it. Measured against the worst ground text can land on (--s-4):
     fg 11.37, fg-2 7.06, fg-3 5.06, fg-4 3.03. */
  --fg:   #e8eaf4;
  --fg-2: #b4bad0;
  --fg-3: #959db8;
  --fg-4: #6e7691;

  /* Accents. Two tones each: saturated for borders, dots and icons; the tint
     for fills, which is what lets a destructive hover read as destructive
     without introducing a second red.

     --amber MUST stay a literal colour declared here, and
     .panel--agent-wants-you MUST keep `border-color: var(--amber)`
     un-transformed. verify:panels 62 and 97 compare the two by resolved
     value. See Global Constraint 1. */
  --blue:  #7aa2f7;  --blue-dim:  rgba(122, 162, 247, .14);
  --green: #9ece6a;  --green-dim: rgba(158, 206, 106, .12);
  --amber: #e0af68;  --amber-dim: rgba(224, 175, 104, .14);
  --red:   #f7768e;  --red-dim:   rgba(247, 118, 142, .12);

  /* Back-compat aliases. These are what let the migration land task by task
     instead of as one unreviewable diff, and they mean the file temporarily
     holds two names for one colour — the duplication M10 exists to remove.
     Kept deliberately for this milestone; retiring them is a follow-up, and
     whoever does it should re-derive the usage counts rather than trust a
     number written here. */
  --text:      var(--fg);
  --muted:     var(--fg-3);
  --bg:        var(--s-0);
  --panel-bg:  var(--s-1);
  --chrome-bg: var(--s-2);
  --border:    var(--line);
}
```

- [ ] **Step 2: Point the five `--fg` usages at a token that now exists**

No edit is needed — `--fg` is now declared, so `.inspector__heading`, `.inspector__value`, `.inspector__action`, `.inspector__review-summary` and `.inspector__review-path` resolve rather than inherit. **Verify this rather than assume it:**

```bash
grep -n 'var(--fg)' src/renderer/styles.css
```

Expected: 5 lines, unchanged. Check 2 in the audit is what proves they now resolve.

- [ ] **Step 3: Tokenise the one structural literal**

`src/renderer/styles.css`, in `.app`:

```css
.app {
  height: 100%;
  padding: var(--titlebar-h) 0 0; /* clears the hiddenInset traffic lights */
}
```

- [ ] **Step 4: Run the audit**

```bash
npm run verify:styles
```

Expected: checks **2, 7, 8, 11** now `ok`. Check 1 still FAILs with the palette's 19 hexes (the `:root` ones are gone; `#1b1d27`, `#343747`, `#2f3346`, `#b9bed6`, `#e6e8f0`, `#e8807f`, `#2a2d3d`, `#6b8afd`, `#c8cbdb`, `#7d8199`, `#6b6f85`, `#8f6570`, `#9db4ff`, `#3d4157`, `#232637`, `#181a23`, `#f0b429`, `#1c2030` remain). Checks 3, 4, 5, 6, 9, 10 still FAIL. Roughly `4/11`.

- [ ] **Step 5: Confirm the app still runs and looks unchanged**

```bash
npm run verify
```

Expected: green apart from `verify:styles`. **Checks 62 and 97 in `verify:panels` are the ones to watch** — they are the Global Constraint 1 proof and this is the task that moved `--amber`.

Then look at it:

```bash
npm run dev
```

Expected: the app is **visibly darker and slightly higher-contrast**, but structurally identical. Nothing has moved. If anything has moved, a structural token was put in the theme block or a colour was left on bare `:root`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat(m10): the token layer, split into structure and theme

Structure stays on bare :root; every colour moves into
:root, :root[data-theme=dark]. The specificity is the mechanism — a
later [data-theme=light] is (0,2,0) against :root's (0,1,0), so it wins
without depending on source order, and a third theme cannot lose to
whichever block happens to be declared last.

Declares --fg, which five inspector rules have been reaching for since
M8c and getting by accident: an invalid custom property makes an
inherited color resolve to inherit, so they picked up --text from
.shell__inspector and looked correct.

The surface ramp is the substantive change. The old three surfaces
spanned 6.6 L* and left a 1.30:1 hairline carrying the whole hierarchy;
this spans 22.3 with every adjacent step >= 2.6, which is why the
dividers are then allowed to stay quiet.

--amber stays a literal, declared, un-transformed colour. verify:panels
62 and 97 compare it to .panel--agent-wants-you's borderTopColor by
resolved value."
```

---

### Task 3: Retire the palette's 19 hardcoded hexes

Turns check **1** green.

**Files:**
- Modify: `src/renderer/styles.css` — the `.palette*` block, plus `.canvas-hud__warn` and `.canvas`'s grid dot.

**Interfaces:**
- Consumes: every token from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Apply this exact mapping**

The palette's colours were chosen independently of `:root` and land *near* it — `#e8807f` beside `--red #f7768e`, `#6b8afd` beside `--blue #7aa2f7`. Two reds meaning one thing, on screen together, is worse than two that plainly differ.

| Was | Becomes | Used by |
|---|---|---|
| `#1b1d27` | `var(--s-3)` | `.palette` background, `.palette__section` background |
| `#181a23` | `var(--s-2)` | `.palette__footer` background |
| `#232637` | `var(--s-2)` | `.palette__kbd` background |
| `#2a2d3d` | `var(--s-4)` | `.palette__row--selected` background |
| `#2f3346` | `var(--s-5)` | `.palette__scope` background |
| `#343747` | `var(--line-strong)` | `.palette` border, `.palette__bar` + `.palette__footer` dividers |
| `#3d4157` | `var(--line-strong)` | `.palette__kbd` border |
| `#e6e8f0` | `var(--fg)` | `.palette__input`, `.palette__confirm` |
| `#c8cbdb` | `var(--fg-2)` | `.palette__row` |
| `#b9bed6` | `var(--fg-2)` | `.palette__scope` |
| `#9095ad` | `var(--fg-3)` | `.palette__kbd` text |
| `#7d8199` | `var(--fg-3)` | `.palette__section`, `.palette__hint`, `.palette__chevron`, `.palette__empty` |
| `#6b6f85` | `var(--fg-3)` | `.palette__footer` — **lifts 3.50:1 to 5.68:1**; it is the app's only self-documentation and was the worst text in the file |
| `#6b6f85` | `var(--fg-4)` | `.palette__row--disabled` — the same old hex, two different new tokens, because disabled and quiet are different facts |
| `#6b8afd` | `var(--blue)` | `.palette__row--selected` accent bar |
| `#9db4ff` | `var(--blue)` | `.palette__hit` |
| `#e8807f` | `var(--red)` | `.palette__row--destructive`, `.palette__confirm` inset bar |
| `#8f6570` | `var(--fg-4)` | `.palette__row--destructive.palette__row--disabled` — **not** a dimmed red. A disabled destructive row is disabled first; keeping it reddish promises an action that cannot run |
| `#f0b429` | `var(--amber)` | `.canvas-hud__warn` |
| `#1c2030` | `rgba(255, 255, 255, .05)` | `.canvas` grid dot — see Step 2 |

**Note the one-to-two split.** `#6b6f85` appears twice in the old file and becomes two *different* tokens, because the two usages are different facts. Do not collapse them.

- [ ] **Step 2: The canvas ground**

`.canvas`'s dot grid is `#1c2030` on `#0b0c11` — **1.21:1**, imperceptible, a compositing cost buying nothing. The spec leaves the *treatment* as open question 2; this plan implements the recommendation there (grid at a visible alpha, plus a vignette so a large dark field does not read as a void). If the answer came back differently, implement that instead and note it in the commit.

```css
.canvas {
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 1px 1px, rgba(255, 255, 255, .05) 1px, transparent 0)
      0 0 / 28px 28px,
    radial-gradient(120% 80% at 50% 0%, #12141d 0%, var(--s-0) 60%);
  cursor: default;
}
```

The grid must stay *barely* visible — a texture, not a pattern. It exists as a parallax cue: with no texture at all there is nothing to tell the eye the world moved, and panning feels stuck.

- [ ] **Step 3: Run the audit**

```bash
npm run verify:styles
```

Expected: check **1** now `ok`. Roughly `5/11`.

If check 1 still fails, it names the survivors — the mapping table above is the complete list, so any hex it reports is one this table missed and should be added to it.

- [ ] **Step 4: Confirm nothing broke**

```bash
npm run verify && npm run dev
```

Expected: green. Open the palette with `⌘K` and confirm the footer text is now clearly readable, the selected row's accent bar is `--blue`, and a destructive row is `--red`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css
git commit -m "refactor(m10): the palette's nineteen hexes, onto the token layer

They were chosen independently of :root and landed NEAR it — #e8807f
beside --red #f7768e, #6b8afd beside --blue #7aa2f7. Two reds meaning
one thing, on screen together, is worse than two that plainly differ.

Two mappings are not mechanical. #6b6f85 becomes --fg-3 in the footer
and --fg-4 on a disabled row, because quiet and disabled are different
facts wearing one hex; the footer lift is 3.50:1 to 5.68:1, and it is
the app's only self-documentation. And a disabled destructive row goes
to --fg-4 rather than to a dimmed red: it is disabled first, and a red
that cannot be clicked promises an action that will not happen.

The canvas grid was 1.21:1 — imperceptible, and a compositing cost
buying nothing. It stays, at an alpha that can actually be seen, because
it is the only parallax cue the canvas has; a vignette joins it so a
large dark field stops reading as a void."
```

---

### Task 4: The contrast pass — delete every fractional opacity

Turns check **3** green.

**Files:**
- Modify: `src/renderer/styles.css` — `.review-node__*` and `.inspector__action:disabled`.

**Interfaces:** consumes Task 2's text ramp. Produces nothing new.

- [ ] **Step 1: Replace each fractional opacity with an explicit token**

Opacity is the wrong tool for de-emphasis in a text ramp: it is unbounded, it compounds against an already-muted colour, and it is invisible to any audit that reads declared colours. `--muted` at `opacity: .6` is ≈2.4:1.

| Rule | Was | Becomes |
|---|---|---|
| `.review-node__root` | `opacity: 0.6` | `color: var(--fg-4)` |
| `.review-node__counts` | `opacity: 0.7` | `color: var(--fg-3)` |
| `.review-node__line--hunk` | `opacity: 0.9` | delete the declaration; `--blue` needs no dimming |
| `.review-node__line--meta` | `opacity: 0.5` | `color: var(--fg-4)` |
| `.review-node__hunk-note`, `.review-node__more` | `opacity: 0.6` | `color: var(--fg-4)` |
| `.review-node__refresh` | `opacity: 0.7` | `color: var(--fg-3)` |
| `.review-node__refresh:hover` | `opacity: 1` | `color: var(--fg)` |
| `.inspector__action:disabled` | `opacity: 0.55` | delete it; the rule already sets `color: var(--muted)` — change that to `color: var(--fg-4)` |

Note `.palette__input--ghost { opacity: 0 }` **stays**. It is not dimming — it is how confirm mode holds DOM focus away from xterm while showing nothing, and `display: none` or `visibility: hidden` would make it unfocusable and hand the keyboard back to the agent with a destructive question on screen. Check 3 permits `0` and `1` for exactly this reason.

- [ ] **Step 2: Run the audit**

```bash
npm run verify:styles
```

Expected: check **3** `ok`. Roughly `6/11`. If it still reports a fraction, it prints the values — find them with `grep -n "opacity:" src/renderer/styles.css`.

- [ ] **Step 3: Confirm**

```bash
npm run verify
```

Expected: green apart from the remaining style checks.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles.css
git commit -m "fix(m10): the opacity dimming that compounded below every threshold

Nine fractional opacities, each multiplying an already-muted token.
--muted on --panel-bg is 4.53:1; at opacity .6 the effective ratio is
about 2.4. Opacity is the wrong tool for de-emphasis in a text ramp —
unbounded, uncomposable, and invisible to any audit that reads declared
colours, which is why this survived a stylesheet full of careful
reasoning about everything else.

Every one collapses onto --fg-3 or --fg-4, which is what those two steps
exist for.

.palette__input--ghost's opacity: 0 stays, and the audit permits 0 and 1
for its sake: it is not dimming, it is how confirm mode holds DOM focus
away from xterm. display:none there would make it unfocusable and hand
the keyboard back to the agent with a destructive question on screen."
```

---

### Task 5: The type scale

Turns check **4** green.

**Files:**
- Modify: `src/renderer/styles.css` — every `font-size` and the two `font:` shorthands.

**Interfaces:** consumes `--t-xs`…`--t-lg`, `--lh-*`, `--font-mono`. Produces nothing new.

- [ ] **Step 1: Map every literal onto the scale**

| Was | Becomes | Where |
|---|---|---|
| `9px` | `var(--t-xs)` | `.inspector__badge`, `.inspector__label`, `.inspector__section-heading` |
| `10px` | `var(--t-xs)` | `.shell__region-title`, `.rail-row__tail`, `.palette__section`, `.inspector__review-note`, `.inspector__review-file`, `.inspector__review-more` |
| `11px` | `var(--t-sm)` | `.shell__top button`, `.shell__zoom-readout`, `.rail-row__main`, `.rail-row__start/__rename/__close`, `.rail-empty`, `.inspector__state-label`, `.inspector__value`, `.inspector__action`, `.inspector__review-summary`, `.badge`, `.canvas-hud`, `.palette__hint`, `.palette__kbd`, `.palette__footer` |
| `12px` | `var(--t-sm)` | `.shell__rail-toggle`, `.shell__inspector-toggle`, `.panel__chrome`, `.palette__scope` |
| `13px` | `var(--t-md)` | `.shell__region-add`, `.inspector__heading`, `.panel__card`, `.palette`, `.palette__number-error` |
| `15px` | `var(--t-lg)` | `.palette__input`, `.palette__confirm` |

**`.inspector__heading` moves from 13px to `--t-lg`**, not `--t-md`: it is the pane's title and the only heading in that column.

- [ ] **Step 2: The two `font:` shorthands**

`.review-node__body`:

```css
  font: var(--t-sm) / var(--lh-body) var(--font-mono);
```

`.panel__card` — replace its `font-family` and `font-size`/`line-height` with:

```css
  font-family: var(--font-mono);
  font-size: var(--t-md);
  line-height: var(--lh-tight);
```

- [ ] **Step 3: Uppercase labels get weight 600**

At weight 400, uppercase micro-text disappears. `.palette__section` already sets 600; its four shell equivalents inherit 400, and two surfaces disagreeing about one idiom is visible whenever the palette is open over the rail.

Add `font-weight: 600;` to `.shell__region-title`, `.inspector__label`, `.inspector__section-heading` and `.inspector__badge`. `.inspector__section-heading` currently sets `font-weight: 400` explicitly — change it, do not add a second declaration.

- [ ] **Step 4: Run the audit**

```bash
npm run verify:styles
```

Expected: check **4** `ok`. Roughly `7/11`.

- [ ] **Step 5: Confirm**

```bash
npm run verify && npm run dev
```

Expected: green. Visually, the rail and inspector rows are slightly larger (11 → 12px) and the tiny uppercase labels are now legible rather than faint. **Watch for reflow**: `verify:panels` 73 asserts the exact canvas inset, so if a wider label pushed a rail control out, that check reports it. Rail row *height* is not asserted anywhere and is expected to grow slightly.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles.css
git commit -m "refactor(m10): six font sizes inside a 6px band, down to four

9, 10, 11, 12, 13, 15 — five of the six steps are 2px or less apart, at
or below the just-noticeable difference, so they never established
hierarchy; they read as inconsistency. Four sizes with real ratios do
the same work.

Every 9px and 10px usage was an uppercase label, which is what lets the
floor rise: --t-xs at 10.5 is legal for one- and two-word ALL-CAPS at
0.09em tracking and for nothing else, and the 11px tier goes to 12
without adding a step.

Uppercase labels also go to weight 600. .palette__section already did;
its four shell equivalents inherited 400 and disappeared, which is
visible the moment the palette opens over the rail.

Also unifies two monospace stacks onto --font-mono. They resolved to
different faces on some macOS configurations. The third, in
create-terminal.ts, moves with the terminal theme in M11."
```

---

### Task 6: Space, radius, elevation

Turns checks **5 and 6** green.

**Files:**
- Modify: `src/renderer/styles.css` — every `padding`, `margin`, `gap` and `border-radius` outside `:root`.

**Interfaces:** consumes `--sp-*`, `--r-*`, `--e-*`. Produces nothing new.

- [ ] **Step 1: Map spacing onto the scale**

Round each literal to its nearest step. Where a value sits between two, **round down** — the scale is tighter than the ad-hoc values were, and the app is a dense tool.

| Was | Becomes |
|---|---|
| `2px` | `var(--sp-1)` |
| `3px`, `4px`, `5px` | `var(--sp-2)` |
| `6px`, `7px` | `var(--sp-3)` |
| `8px`, `9px`, `10px` | `var(--sp-4)` |
| `12px`, `14px` | `var(--sp-5)` |
| `16px`, `20px` | `var(--sp-6)` |

`38px` is already `var(--titlebar-h)` from Task 2. `0` and `1px` stay literal — the audit exempts them, because `1px` is a hairline rather than a spacing step.

- [ ] **Step 2: Map radius onto the scale**

| Was | Becomes |
|---|---|
| `3px`, `4px` | `var(--r-sm)` |
| `5px`, `6px` | `var(--r-md)` |
| `10px` | `var(--r-lg)` |
| `999px` | `var(--r-full)` |
| `50%` | unchanged — a circle is a shape, not a scale step |

`.panel` moves from `10px` to `var(--r-lg)` (12px). **`.panel__chrome` must then gain matching top corners** or a 1px sliver of panel background shows past the header at the corners:

```css
.panel__chrome {
  border-radius: 11px 11px 0 0;   /* --r-lg minus the 1px border */
}
```

This one stays a literal pair rather than a token, and the audit's check 5 will flag it — so express it as a `calc` off the token so both the audit and the relationship hold:

```css
  border-radius: calc(var(--r-lg) - 1px) calc(var(--r-lg) - 1px) 0 0;
```

- [ ] **Step 3: Panels get a shadow**

```css
.panel {
  box-shadow: var(--e-2);
  transition: box-shadow 140ms var(--ease), border-color 140ms var(--ease);
}
.panel--selected { box-shadow: 0 0 0 1px var(--blue), var(--e-3); }
```

**Do not add a `transform` transition here** — Global Constraint 3.

The palette gets `--e-3` and a top inner highlight, which is the one-line move that separates a floating surface from its own shadow:

```css
.palette {
  box-shadow: var(--e-3);
  background-image:
    linear-gradient(var(--s-3), var(--s-3)),
    linear-gradient(180deg, rgba(255, 255, 255, .07), transparent 40%);
  background-origin: border-box;
  background-clip: padding-box, border-box;
}
```

The HUD gets `--e-2` and a backdrop blur — the one place it earns its cost, because the HUD sits over a moving world layer and a solid fill there reads as a sticker:

```css
.canvas-hud {
  background: color-mix(in srgb, var(--s-3) 78%, transparent);
  backdrop-filter: blur(12px) saturate(140%);
  box-shadow: var(--e-2);
}
```

- [ ] **Step 4: Run the audit**

```bash
npm run verify:styles
```

Expected: checks **5 and 6** `ok`. Roughly `9/11`.

- [ ] **Step 5: Confirm — this is the task most likely to move layout**

```bash
npm run verify
```

Expected: green. **`verify:panels` 73 is the one to watch**: it asserts `canvasWidth === windowWidth - railWidth - inspectorWidth` within 1px, so any padding change that made a sidebar overflow reports here.

```bash
npm run dev
```

Expected: panels now visibly float above the canvas rather than sitting flat on it. Check a panel's top corners against its header for a background sliver.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat(m10): the space and radius scales, and the shadow panels never had

Fourteen distinct padding values onto seven steps, five arbitrary radii
onto four. Where a value fell between steps it rounds DOWN: the scale is
tighter than the ad-hoc values were, and this is a dense tool.

.panel goes from 10px to --r-lg, so .panel__chrome's top corners become
calc(--r-lg - 1px) — expressed as a calc rather than a literal 11px so
the relationship survives a change to the token, and so the audit stays
at zero literals.

Panels get --e-2. They had no shadow at all, which is why they read as
pasted onto the canvas rather than floating above it — and a shadow only
reads as depth once the surface beneath differs, which is what the ramp
from the first task bought. No transform transition anywhere near
.panel or .world: four checks read that computed matrix."
```

---

### Task 7: Motion

Turns check **9** green.

**Files:**
- Modify: `src/renderer/styles.css` — a transition rule, one keyframe block, one media query.

**Interfaces:** consumes `--dur-1`, `--dur-2`, `--ease`, `--e-2`, `--amber`. Produces nothing new.

- [ ] **Step 1: State transitions on everything that answers the pointer**

```css
/* Every hover, selection and state change in this app is currently a 0ms
   hard cut — the single largest contributor to the whole thing reading as a
   prototype. 90ms is below the threshold at which a change reads as waiting
   and above the one at which it reads as a glitch.

   NOTE the properties: background-color, color, border-color and opacity,
   never transform. .world carries will-change: transform and is driven at
   60Hz by the viewport, and four checks read its computed matrix through
   DOMMatrixReadOnly — a transition there is both an elastic-feeling pan and
   a race against those reads. */
.rail-row,
.rail-row__main,
.rail-row__close,
.rail-row__start,
.rail-row__rename,
.shell__top button,
.shell__region-add,
.inspector__action,
.palette__row,
.panel__close,
.review-node__file-button,
.review-node__refresh {
  transition:
    background-color var(--dur-1) var(--ease),
    color            var(--dur-1) var(--ease),
    border-color     var(--dur-1) var(--ease),
    opacity          var(--dur-1) var(--ease);
}
```

- [ ] **Step 2: The one attention-getter**

```css
/* wants-you is the only state carrying INTENT — styles.css already makes this
   argument for giving it a second visual channel — so it is the only one
   worth animating. The animation touches box-shadow ALONE, which is what
   keeps verify:panels 62 and 97 green: they read borderTopColor, and this
   never touches it. */
@keyframes wants-you-pulse {
  0%, 100% { box-shadow: 0 0 0 2px var(--amber), 0 0 20px rgba(224, 175, 104, .10), var(--e-2); }
  50%      { box-shadow: 0 0 0 2px var(--amber), 0 0 32px rgba(224, 175, 104, .22), var(--e-2); }
}
.panel--agent-wants-you {
  border-color: var(--amber);
  animation: wants-you-pulse 2.4s ease-in-out infinite;
}
```

**`border-color: var(--amber)` must remain exactly this** — Global Constraint 1. Do not fold it into the keyframes and do not transform it.

- [ ] **Step 3: Reduced motion**

```css
/* Not optional the moment any animation exists, and the app had none until
   this task — which is why there was nothing here before. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

- [ ] **Step 4: Run the audit**

```bash
npm run verify:styles
```

Expected: check **9** `ok`. Roughly `10/11`.

- [ ] **Step 5: Confirm — this is the Global Constraint 1 proof**

```bash
npm run verify
```

Expected: green. **`verify:panels` 62 and 97 specifically.** If either goes red, the animation touched `border-color`; move it back out of the keyframes.

```bash
npm run dev
```

Expected: hovering a rail row now fades rather than snaps, and a `wants-you` panel breathes slowly. Confirm a drag is still perfectly smooth — if the canvas feels elastic while panning, a `transform` transition got in.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat(m10): motion, in the three places it earns its place

There were zero transition declarations in 1,153 lines, so every hover,
selection and state change was a 0ms hard cut. Three rules and then
stop: over-animating a canvas app is worse than not animating one.

The pulse is on wants-you alone, because it is the only state carrying
intent — the argument styles.css already makes for giving it a second
visual channel. It animates box-shadow ONLY, which is what keeps
verify:panels 62 and 97 green: they read borderTopColor, and
border-color stays a plain, untransformed var(--amber) outside the
keyframes.

No transform anywhere. .world carries will-change: transform, is driven
at 60Hz, and four checks read its computed matrix.

prefers-reduced-motion arrives with the first animation the app has ever
had, which is why there was nothing to respect before now."
```

---

### Task 8: Focus

Turns check **10** green. **Last task — the audit must finish 11/11.**

**Files:**
- Modify: `src/renderer/styles.css` — a focus block near the end.

**Interfaces:** consumes `--blue`, `--r-sm`. Produces nothing new.

- [ ] **Step 1: Add the focus rules**

```css
/* The only `outline` in this file before now was `outline: none` on the
   palette input. Because shellControl() calls preventDefault() on mousedown,
   focus never lands on a shell control by MOUSE — but every one of them is
   natively Tab-reachable, so a keyboard user got Chromium's default ring on
   some surfaces and nothing considered anywhere.

   :focus-visible rather than :focus, or every mouse click would ring. */
:where(button, [href], input, [tabindex]):focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

/* Rows sit flush to the palette's edge, so an outset ring would clip. */
.palette__row:focus-visible { outline-offset: -2px; }

/* The input keeps outline: none — a ring inside a ring reads as broken — and
   the BAR carries the indicator instead. Same information, correct object:
   this satisfies "never remove a focus outline without a replacement" by
   RELOCATION rather than by deletion, which is the distinction that makes the
   existing outline:none defensible rather than an oversight. */
.palette__bar:focus-within { box-shadow: inset 0 -1px 0 var(--blue); }
```

`--blue` on `--s-3` is 6.35:1, so the 2px perimeter clears WCAG 2.2 AA Focus Appearance and the AAA form as well.

- [ ] **Step 2: Run the audit — expect a clean sweep**

```bash
npm run verify:styles; echo "exit=$?"
```

Expected:

```
ok   1 no hardcoded hex outside a theme block
ok   2 every var(--token) is declared
ok   3 no fractional opacity used to dim text
ok   4 no literal font-size outside the scale
ok   5 no literal border-radius outside the scale
ok   6 no literal padding/margin/gap outside the scale
ok   7 bare :root declares no colour
ok   8 no structural token inside a theme block
ok   9 a prefers-reduced-motion block exists
ok   10 at least one :focus-visible rule exists
ok   11 every text token clears its ratio on every ground it can land on

11/11 checks passed
exit=0
```

- [ ] **Step 3: The full suite, for the last time**

```bash
npm run verify
```

Expected: **entirely green, `verify:styles` included.**

- [ ] **Step 4: Look at it**

```bash
npm run dev
```

Walk the whole surface: Tab through the top bar and confirm a blue ring appears on each control and nowhere on a mouse click. Open `⌘K` and Tab — the bar underlines rather than double-ringing. Click a rail row, a panel, a resize handle. Ring a bell in a panel and watch it pulse.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat(m10): focus rings, and the outline:none that is now defensible

The only outline in the file was `outline: none`. shellControl()
preventDefault()s mousedown so focus never lands on a shell control by
mouse — but all of them are Tab-reachable, so a keyboard user got
Chromium's default on some surfaces and nothing considered anywhere.

:focus-visible, not :focus, or every click rings.

The palette input keeps its outline: none and the BAR takes the
indicator instead. That is the rule satisfied by relocation rather than
by deletion, and it is what turns a bare outline:none from an oversight
into a decision — a ring inside a ring reads as broken.

11/11 on verify:styles. M10 complete."
```

---

## Self-Review

Run against the spec on 2026-08-29.

**Spec coverage.** Every numbered success criterion maps to a task and to an audit check: 1→T3/check 1, 2→T2/check 2, 3→T2+T4/check 11, 4→T4/check 3, 5→T5+T6/checks 4,5,6, 6→T8/check 10, 7→T7/check 9, 8→T2/checks 7,8, 9→T2 (manual, `npm run dev`), 10→every task. The spec's seven tasks became eight; the extra is the audit harness, which the spec did not anticipate and which required the spec amendment recorded in Global Constraints.

**Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N". Every mapping table is complete rather than exemplary. The one place the plan defers to a decision outside itself is Task 3 Step 2 (the dot grid), which is spec open question 2, and it names the fallback explicitly.

**Type consistency.** Token names were checked across tasks: `--fg`/`--fg-2`/`--fg-3`/`--fg-4` (never `--fg-1`), `--s-0`…`--s-5`, `--sp-1`…`--sp-7`, `--r-sm`/`--r-md`/`--r-lg`/`--r-full`, `--e-1`…`--e-3`, `--dur-1`/`--dur-2`/`--ease`, `--t-xs`/`--t-sm`/`--t-md`/`--t-lg`. Audit check 2 catches any drift mechanically, which is the main reason the audit is Task 1 rather than Task 8.

**One known weakness, recorded rather than fixed.** Audit check 8 is vacuous until Task 2 lands, and the script says so in its own comment. It is kept because it guards a mistake that becomes possible only once a second theme exists — a structural token inside a theme block, which every subsequent theme must then remember to repeat.
