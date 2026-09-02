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
 *   8      Widened in M45 to "any token declared on bare :root", so a
 *          structural token can no longer be moved into a theme block
 *          unnoticed. What it still cannot see is a NEW structural token
 *          declared only inside a theme block and nowhere on :root — that
 *          is a token every other theme must remember to repeat, and it
 *          reads to this check as a colour.
 *   11     Reads only six-digit hex. A ground or text token written as
 *          rgb()/oklch() is skipped as undeclared and REPORTED as such, so
 *          the failure is loud rather than silent — but a token written
 *          that way is not measured either.
 *   icons.1 Greps source text for the glyph inventory the M45 spec lists.
 *          A glyph spelled some other way (a numeric entity for ×, a
 *          lookalike code point) is a button with a text icon this check
 *          does not know about.
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

// 7 — the structure/colour split, from the colour side. `rootOnly` — the
//     rules whose selector is EXACTLY `:root`, the structural block — is
//     shared with check 8, so both read the same definition of it.
const rootOnly = all.filter((r) => /^:root$/.test(r.sel))
const colourInRoot = rootOnly.flatMap((r) =>
  [...r.body.matchAll(/(--[a-z0-9-]+)\s*:\s*(?:#|rgb|hsl|oklch|color-mix)/gi)].map((m) => m[1]))
ok(7, 'bare :root declares no colour', colourInRoot.length === 0, `colour on :root: ${colourInRoot.join(' ')}`)

// 8 — and from the structure side. Was VACUOUS until M45 introduced the
//     first [data-theme] blocks; now it is what stops a structural token
//     (space, radius, type, motion, the one-off lengths) from quietly
//     acquiring a per-theme value that every other theme must then remember
//     to repeat. "Structural" is DEFINED as "declared on bare :root" rather
//     than by a name regex — the old regex listed sp|r|dur|t|lh|ease and
//     missed --font-mono, --titlebar-h, --navgrid-cell and --file-gutter-w.
const structural = new Set(rootOnly.flatMap((r) =>
  [...r.body.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])))
const structInTheme = themeRules.filter((r) => /\[data-theme/.test(r.sel))
  .flatMap((r) => [...r.body.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]))
  .filter((t) => structural.has(t))
ok(8, 'no structural token inside a theme block', structInTheme.length === 0, `structure in theme: ${structInTheme.join(' ')}`)

// 9 — reduced motion is honoured
ok(9, 'a prefers-reduced-motion block exists', /@media[^{]*prefers-reduced-motion/.test(bare))

// 10 — focus is visible somewhere
ok(10, 'at least one :focus-visible rule exists', all.some((r) => /:focus-visible/.test(r.sel)))

// 11 — measured contrast for every text token against every ground it can
//      land on, PER THEME BLOCK. Before M45 this flattened every theme block
//      into one map (last declaration wins), so a second block would have been
//      measured only where it overwrote the first — the hole the M19
//      stylesheet's own comment names as the reason it shipped one block. A
//      rule is filed under every theme its selector list names: `:root` is
//      "root", `[data-theme="light"]` is "light", `[data-theme="dark"]` is
//      "dark", and `:root, :root[data-theme="dark"]` is both.
//
//      --s-5 is deliberately NOT a ground: it is a pressed state, transient,
//      and no text is ever read against it. The five accents are measured for
//      the NON-TEXT rule (WCAG 1.4.11, 3:1) on --s-1 and --s-4: they are
//      borders, dots and icons, and a waiting panel's amber border is the
//      single most important signal in the app.
function blockNames (sel) {
  const names = new Set()
  for (const part of sel.split(',').map((p) => p.trim())) {
    if (/^:root$/.test(part)) names.add('root')
    const m = part.match(/data-theme="([a-z]+)"/)
    if (m) names.add(m[1])
  }
  return [...names]
}
const perBlock = {}       // name -> { token: value } for every declaration
const perBlockHex = {}    // name -> { token: #rrggbb } for the measurable ones
for (const r of themeRules) {
  for (const name of blockNames(r.sel)) {
    perBlock[name] ??= {}
    perBlockHex[name] ??= {}
    for (const m of r.body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      perBlock[name][m[1]] = m[2].trim()
      const hex = m[2].trim().match(/^#[0-9a-fA-F]{6}$/)
      if (hex) perBlockHex[name][m[1]] = hex[0]
    }
  }
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
const accents = ['--blue', '--green', '--amber', '--red', '--iris']
const accentGrounds = ['--s-1', '--s-4']
const bad = []
const measured = Object.keys(perBlockHex).filter((name) => Object.keys(perBlockHex[name]).length > 0)
for (const name of measured) {
  const tok = perBlockHex[name]
  for (const [t, min] of Object.entries(texts)) {
    for (const g of grounds) {
      if (!tok[t] || !tok[g]) { bad.push(`[${name}] ${t}/${g} undeclared`); continue }
      const r = ratio(tok[t], tok[g])
      if (r < min) bad.push(`[${name}] ${t} on ${g} = ${r.toFixed(2)} (need ${min})`)
    }
  }
  for (const a of accents) {
    for (const g of accentGrounds) {
      if (!tok[a] || !tok[g]) { bad.push(`[${name}] ${a}/${g} undeclared`); continue }
      const r = ratio(tok[a], tok[g])
      if (r < 3.0) bad.push(`[${name}] ${a} on ${g} = ${r.toFixed(2)} (need 3.0, non-text)`)
    }
  }
}
ok(11, `every text and accent token clears its ratio in every theme block (${measured.join(', ') || 'none'})`,
  measured.length > 0 && bad.length === 0, bad.length ? bad.join('; ') : 'no theme block declares a hex token')

// M45 — theme.1. Two blocks, one token set. A token declared in one theme
//       and not the other is a colour that falls through to the OTHER
//       theme's value (or to nothing) with no error: a dark-only --s-4 makes
//       light hover fill dark grey, and it shows only when a user hovers, in
//       the theme the author was not looking at.
const lightSet = new Set(Object.keys(perBlock.light || {}))
const darkSet = new Set(Object.keys(perBlock.dark || {}))
const onlyLight = [...lightSet].filter((t) => !darkSet.has(t))
const onlyDark = [...darkSet].filter((t) => !lightSet.has(t))
ok('theme.1', 'the light and dark blocks declare the same token set',
  lightSet.size > 0 && darkSet.size > 0 && onlyLight.length === 0 && onlyDark.length === 0,
  `light=${lightSet.size} dark=${darkSet.size} only-light: ${onlyLight.join(' ')} only-dark: ${onlyDark.join(' ')}`)

// M45 — theme.2. Bare :root carries the LIGHT block's values, so the app has
//       a theme before useTheme stamps the attribute — the frame between
//       first paint and the settings load — and it is the same theme
//       `system` resolves to on a light desktop. A mismatch is a flash of
//       the wrong theme on every launch, visible once and never reported.
const rootMap = perBlock.root || {}
const lightMap = perBlock.light || {}
const rootMismatch = Object.keys(lightMap).filter((t) => rootMap[t] !== lightMap[t])
ok('theme.2', 'bare :root declares the light block\'s values',
  Object.keys(lightMap).length > 0 && rootMismatch.length === 0,
  `light tokens=${Object.keys(lightMap).length} differing on :root: ${rootMismatch.slice(0, 8).join(' ')}`)

// M45 — icons.1. No entity or symbol glyph as a control's text, anywhere in
//       the renderer (source text, comments stripped). A glyph icon renders
//       from whichever font the stack resolves: ⚙ and ▶ are emoji-
//       presentation-eligible and can come back in colour, and each sits at
//       its own optical centre at a stroke weight the font chose. The
//       inventory is the spec's; `−`/`+` are text in a diff stat, so for
//       those two only the exact `>−</button>` / `>+</button>` shape counts.
const GLYPHS = ['&times;', '&#9654;', '&#9998;', '×', '⚙', '⟳', '‹', '›', '✎', '↻', '▶']
function walk (dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}
const RENDERER = path.join(__dirname, '..', 'src', 'renderer')
const glyphSites = []
for (const file of walk(RENDERER)) {
  const text = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const rel = path.relative(RENDERER, file)
  for (const g of GLYPHS) if (text.includes(g)) glyphSites.push(`${rel}:${g}`)
  for (const m of text.matchAll(/>\s*([−+])\s*<\/button>/g)) glyphSites.push(`${rel}:${m[1]}`)
}
ok('icons.1', 'no entity or symbol glyph is a control\'s text content in src/renderer',
  glyphSites.length === 0, `${glyphSites.length} site(s): ${glyphSites.slice(0, 10).join(' ')}`)

// M45 — font.1. No bundled face: no @font-face in the stylesheet and no
//       font-src in the CSP. The chrome sets the system UI stack, which is
//       what Terminal, Xcode and every system dialog set, so an app that
//       reads as native reads as finished; a bundled display face is a load
//       race (font-display: block) and a CSP allowance for nothing.
const HTML = process.env.TC_HTML || path.join(__dirname, '..', 'src', 'renderer', 'index.html')
const html = fs.readFileSync(HTML, 'utf8')
const fontFace = /@font-face/.test(bare)
const fontSrc = /font-src/.test(html)
ok('font.1', 'no @font-face in the stylesheet and no font-src in the CSP',
  !fontFace && !fontSrc, `@font-face=${fontFace} font-src=${fontSrc}`)

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
