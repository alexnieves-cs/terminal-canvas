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
