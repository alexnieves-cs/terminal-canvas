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
 *
 * KNOWN GAPS, per check, so a green run is not read as a stronger claim than
 * it makes. Each of these is a real hole, not a hypothetical one:
 *
 *   1 + 7  A colour written as a NORMAL property on bare `:root` — say
 *          `:root { background: #123456 }` — escapes both. Check 1 filters
 *          `:root` out as a theme block before it looks for colours, and
 *          check 7 only inspects declarations whose name starts `--`. The
 *          two together cover the case that has actually occurred (a token,
 *          or a colour in a body rule) and not this one.
 *   4      Only `px`. A font-size in `rem`, `em`, `%` or `pt` is invisible.
 *   6      Only `padding`/`margin`/`gap`. `.canvas-hud`'s `right: 12px` and
 *          `bottom: 12px` are spacing by any reasonable reading and are not
 *          seen, and every `1px` is exempt outright as a hairline — so a
 *          genuine 1px gap that should have been --sp-1 passes too.
 *   8      Its token-name regex lists sp|r|dur|t|lh|ease, so `--e-*`,
 *          `--ease` (matched only by luck, as the `ease` alternative), and
 *          the one-offs `--font-mono` and `--titlebar-h` could all be moved
 *          into a theme block without failing anything. Widening it to "any
 *          token declared on bare :root" is the obvious improvement and was
 *          not made here.
 *
 * The pattern in all of them is the same and is worth stating once: this file
 * greps text. Anything spelled in a way it was not taught to look for is
 * absent as far as it is concerned, and absence reads exactly like compliance.
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

// 1 — no hardcoded colour outside a theme block, in ANY notation. Hex alone
//     was not enough: the spec's own test for criterion 8 is "delete the theme
//     block and no colour remains", and eight rgba() literals survived a green
//     run of the hex-only version — including three that re-mixed amber, green
//     and red by hand at their own alphas (.10/.22, .08) one screenful from the
//     --*-dim tokens that already declared those colours.
//
//     ALLOW is an explicit, per-value allowlist rather than a relaxed regex,
//     so the check stays honest: each entry is a translucent WHITE that models
//     light on a surface (a canvas dot, a top-edge highlight) and must
//     composite over whatever ground the active theme sets. Tokenising them
//     would freeze it to one theme's ground, which is the opposite of the
//     split this check exists to enforce. Each is commented at its site.
//     Anything not on this list is a colour and belongs in the theme block.
const ALLOW = new Set([
  'rgba(103,232,249,.05)', // .canvas dot grid
  'rgba(255,255,255,.07)', // .palette top-edge highlight
  'rgb(255255255/.04)'     // .shell rail and inspector inner highlights
])
const norm = (s) => s.replace(/\s+/g, '')
const strayHex = [...new Set((bodyText.match(/#[0-9a-fA-F]{3,8}\b/g) || []))]
const strayFn = [...new Set((bodyText.match(/\b(?:rgba?|hsla?)\([^)]*\)/g) || []))]
  .filter((v) => !ALLOW.has(norm(v)))
const stray = [...strayHex, ...strayFn]
ok(1, 'no hardcoded colour outside a theme block',
  stray.length === 0, `${stray.length} found: ${stray.slice(0, 8).join(' ')}`)

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
//
//      M23a WIDENED THIS TO LOOP OVER BLOCKS, and the old shape was not merely
//      narrow — it was WRONG in a way that got worse rather than better as
//      themes were added. It flattened EVERY theme rule into one token map,
//      last write wins, so a second block did not go unmeasured: it
//      OVERWROTE whichever tokens it happened to declare and left the rest
//      standing, and check 11 then measured a CHIMERA belonging to no theme.
//      Measured, with a probe block declaring only --s-0/--s-4/--fg*: the
//      check reported `--fg on --s-1 = 1.04`, pairing the probe's text with
//      the previous block's surface. Both halves of that number were real and
//      the pair had never existed.
//
//      M19's own comment in styles.css names this as the blocker for a second
//      theme, in as many words: "A dark soft variant is a real follow-up and
//      it needs check 11 taught to loop over blocks FIRST". This is that.
//
//      The grouping follows the CASCADE rather than source order, because that
//      is what the browser will do: bare `:root` is the base layer, and a
//      `[data-theme="X"]` block overlays it — `:root` is (0,1,0) and
//      `:root[data-theme="X"]` is (0,2,0), so specificity decides and a block
//      can be appended without reordering anything. A rule whose selector
//      names BOTH (`:root, :root[data-theme="dark"]`, which is what ships
//      today) contributes to the base AND to that theme, which is exactly what
//      the browser resolves it to.
const hexes = (body) => {
  const out = {}
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2]
  return out
}
const themeNames = [...new Set(
  themeRules.flatMap((r) => [...r.sel.matchAll(/\[data-theme="([a-z0-9-]+)"\]/g)].map((m) => m[1]))
)]
// Bare `:root` with no attribute — the base every theme inherits.
const baseTokens = {}
for (const r of themeRules) {
  if (/(^|,)\s*:root\s*(,|$)/.test(r.sel)) Object.assign(baseTokens, hexes(r.body))
}
// One entry per theme, base overlaid with that theme's own declarations. If
// the stylesheet declares no named theme at all, the base IS the palette and
// is measured under the name 'default' — never skipped, or removing the
// attribute selector would silently switch this check off.
const palettes = themeNames.length === 0
  ? [{ name: 'default', tok: baseTokens }]
  : themeNames.map((name) => {
    const tok = { ...baseTokens }
    for (const r of themeRules) {
      if (r.sel.includes(`[data-theme="${name}"]`)) Object.assign(tok, hexes(r.body))
    }
    return { name, tok }
  })
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
for (const { name, tok } of palettes) {
  for (const [t, min] of Object.entries(texts)) {
    for (const g of grounds) {
      if (!tok[t] || !tok[g]) { bad.push(`${name}: ${t}/${g} undeclared`); continue }
      const r = ratio(tok[t], tok[g])
      if (r < min) bad.push(`${name}: ${t} on ${g} = ${r.toFixed(2)} (need ${min})`)
    }
  }
}
// `palettes.length > 0` is the NON-VACUITY guard and is not optional: a regex
// that matched nothing would produce no palettes, push no failures, and pass —
// a check that has quietly stopped existing, which is the shape this file's own
// header warns about at length.
ok(11, 'every text token clears its ratio on every ground, in every theme',
  bad.length === 0 && palettes.length > 0,
  bad.length ? bad.join('; ') : `${palettes.length} theme(s) measured: ${palettes.map((p) => p.name).join(', ')}`)

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
