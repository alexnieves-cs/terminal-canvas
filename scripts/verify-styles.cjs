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
const grounds = ['--s-0', '--s-1', '--s-2', '--s-3', '--s-4', '--bubble'] // --bubble: M162, the user turn's ground, so text on it is measured
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

// M47 — frame.1. ONE panel frame. Five kinds used to ship five hand-rolled
//       headers, and `__summary`/`__refresh`/`__note`/`__more`/`__body` each
//       existed three or four times as near-duplicates across the kind
//       namespaces — the kind that drifts. The frame owns each family ONCE
//       (`.pf__*`); a kind namespace may not declare any of them. Counted
//       over selectors, comment-free, so a rule commented out does not pass.
const KIND_NS = /\.(review-node|file-node|toolbox-node|jira-node)__(summary|refresh|note|more|body)\b/g
const kindFamilies = [...new Set([...bare.matchAll(KIND_NS)].map((m) => m[0]))]
const frameFamilies = ['summary', 'note', 'more', 'body'].filter((f) => new RegExp(`\\.pf__${f}\\b`).test(bare))
ok('frame.1', 'the five duplicated panel-kind families are declared once, on the frame, and never on a kind',
  kindFamilies.length === 0 && frameFamilies.length === 4,
  `kind rules: ${kindFamilies.join(' ') || 'none'}; frame families: ${frameFamilies.join(' ')}`)

// M144 — chrome.scale.1. ZOOM-INDEPENDENT CHROME (backlog #60), the boundary
// pinned as text from both sides: `.pf__chrome` and `.panel__resize` are
// counter-scaled by `--chrome-scale` (a CSS `transform`, which changes NO
// layout box — so no refit, no SIGWINCH, no reflow of a running agent when
// the camera zooms), and `.pf__body` carries no transform at all, because a
// transform on the subtree hosting xterm is the arithmetic pointer-correct.ts
// exists to compensate for. The variable has a fallback of 1, so a frame
// rendered outside `.world` (a check's fixture, a future overlay) is unscaled.
{
  const chromeRule = (bare.match(/\.pf__chrome\s*\{[^}]*\}/g) || []).find((r) => /transform:\s*scale\(var\(--chrome-scale/.test(r)) || null
  const handleRule = (bare.match(/\.panel__resize\s*\{[^}]*\}/g) || []).find((r) => /transform:\s*scale\(var\(--chrome-scale/.test(r)) || null
  const bodyRules = bare.match(/\.pf__body\s*\{[^}]*\}/g) || []
  const bodyTransformed = bodyRules.some((r) => /transform:/.test(r))
  ok('chrome.scale.1', '.pf__chrome and .panel__resize counter-scale by --chrome-scale (a transform, with a fallback of 1) and .pf__body carries no transform',
    chromeRule !== null && /var\(--chrome-scale,\s*1\)/.test(chromeRule) && handleRule !== null && bodyRules.length > 0 && !bodyTransformed,
    JSON.stringify({ chrome: chromeRule && chromeRule.slice(0, 120), handle: handleRule && handleRule.slice(0, 120), bodyTransformed }))
}

// M149 — toolbox.open.style.1 (audit F.2; the rail's `toolbox.open.1` pins the row's sourcePath, this pins the door's place on the line). The toolbox row's Open door sits at the
// end of its line (`margin-left: auto`, never growing) rather than dropping
// under the description as a line of its own, the way it painted in the
// `kinds` scene.
{
  const rule = (bare.match(/\.toolbox-node__open\s*\{[^}]*\}/g) || [])[0] || null
  ok('toolbox.open.style.1', '.toolbox-node__open sits at the end of its row line (margin-left: auto, flex 0 0 auto)',
    rule !== null && /margin-left:\s*auto/.test(rule) && /flex:\s*0 0 auto/.test(rule), rule || 'no rule')
}

// M149 — routine.last.1 (audit F.10). The routine status line is a wrapping
// flex row — the badge and the sentence break BETWEEN each other — and the
// badge never breaks inside itself.
{
  const row = (bare.match(/\.teammates-pane__last\s*\{[^}]*\}/g) || [])[0] || null
  const badge = (bare.match(/\.teammates-pane__last \.badge\s*\{[^}]*\}/g) || [])[0] || null
  ok('routine.last.1', 'a routine\'s status line wraps between its badge and its sentence (flex-wrap), and the badge keeps its words (nowrap)',
    row !== null && /display:\s*flex/.test(row) && /flex-wrap:\s*wrap/.test(row) && badge !== null && /white-space:\s*nowrap/.test(badge), JSON.stringify({ row, badge }))
}

// M149 — menu.stack.1 (audit F.12). The chrome bar is LIFTED above the body:
// M144's counter-scale transform made `.pf__chrome` a stacking context, and
// with no z-index of its own it painted UNDER the positioned body that
// follows it in the DOM — the `⋯` menu (absolute, inside the chrome) was open
// in the DOM and invisible under a live terminal. The `header` golden showed it.
{
  const rules = bare.match(/\.pf__chrome\s*\{[^}]*\}/g) || []
  const lifted = rules.some((r) => /z-index:\s*[1-9]/.test(r))
  // xterm's own layers carry z-indexes up to 10; the body isolates them so the
  // chrome's z-index competes with the body alone, never with a layer inside it.
  const body = (bare.match(/\.pf__body\s*\{[^}]*\}/g) || [])[0] || ''
  ok('menu.stack.1', '.pf__chrome carries a positive z-index and .pf__body isolates its own stacking, so the chrome and its ⋯ menu paint above the body that follows it',
    lifted && /isolation:\s*isolate/.test(body), JSON.stringify({ chrome: rules.map((r) => r.replace(/\s+/g, ' ').slice(0, 80)), body: body.replace(/\s+/g, ' ').slice(0, 80) }))
}

// M149 — popover.stack.1 (audit F.14). The dock is LIFTED above the navigator
// column: M109's glass blur (`backdrop-filter`) made `.shell__dock` a stacking
// context, and with no z-index of its own the whole column — the attention
// popover inside it, `z-index: 950` — painted under the rail's `z-index: 900`.
// The popover had been open in the DOM and invisible since 2.3.0; the
// `attention` golden showed a badge and no popover.
{
  const dock = (bare.match(/\.shell__dock\s*\{[^}]*backdrop-filter[^}]*\}/g) || [])[0] || ''
  const dockZ = (dock.match(/z-index:\s*(\d+)/) || [])[1]
  // The rail is glass too (a stacking context at z auto, painted after the
  // dock in DOM order) and its compact DRAWER form carries 900: the dock must
  // outrank the highest z-index any rule naming .shell__rail declares.
  const railZ = Math.max(0, ...[...bare.matchAll(/([^{}]*\.shell__rail[^{}]*)\{([^}]*)\}/g)].map((m) => Number((m[2].match(/z-index:\s*(\d+)/) || [, 0])[1])))
  // The blur also makes the column the CONTAINING BLOCK of its fixed
  // popover, so the shell-wide `overflow: hidden` clipped it to 48px.
  const unclipped = /overflow:\s*visible/.test(dock)
  ok('popover.stack.1', '.shell__dock (a glass stacking context) carries a z-index above every .shell__rail rule\'s and overflow: visible, so the attention popover paints over the navigator in every layout',
    dockZ !== undefined && Number(dockZ) > railZ && unclipped, JSON.stringify({ dockZ, railZ, unclipped }))
}

// M150 — tags.1. The tag chip is the LINK family's — its rule exists, reads
// a token the wikilink already reads (`--iris`), and declares no hex of
// its own (the M109 rule: a new colour is a new name in both theme blocks).
{
  const rule = (bare.match(/\.file-node__tag\s*\{[^}]*\}/g) || [])[0] || null
  ok('tags.1', '.file-node__tag exists, reads var(--iris) and declares no colour literal of its own',
    rule !== null && /var\(--iris\)/.test(rule) && !/#[0-9a-f]{3,8}\b/i.test(rule), rule || 'no rule')
}

// M61 — hidden.1. `hidden` MUST WIN. The context pane's three tabs each
// render a <section hidden={tab !== id}>, and `.context__panel { display:
// block }` — a selector with higher specificity than the UA's `[hidden]`
// rule — silently overrode it, so every tab showed all three bodies
// stacked. verify:panels reads the attribute and passed; only a screenshot
// saw it (M61's first render). Any rule that sets `display` on a class the
// renderer also toggles with `hidden` must carry a `[hidden]` reset.
{
  // Derived from the renderer's own JSX rather than a hand list: every
  // element that carries `hidden=` is collected with the first class it
  // names, so a fourth toggled class is covered the day it is written.
  // The lookbehind keeps `aria-hidden=` out: that attribute hides from a
  // screen reader, not from paint, and matched on the first run.
  const { readdirSync, statSync, readFileSync } = require('node:fs')
  const { join } = require('node:path')
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.tsx') ? [p] : []) })
  const toggled = new Set()
  for (const file of walk(join(__dirname, '..', 'src', 'renderer'))) {
    const text = readFileSync(file, 'utf8')
    for (const tag of text.match(/<[a-z][^>]*(?<![a-z-])hidden=[^>]*>/g) ?? []) {
      const cls = /className=[{]?[`"']([A-Za-z0-9_-]+)/.exec(tag)
      if (cls) toggled.add(cls[1])
    }
  }
  const bad = [...toggled].filter((c) => new RegExp(`\\.${c}\\s*\\{[^}]*display\\s*:`).test(bare) && !new RegExp(`\\.${c}\\[hidden\\]`).test(bare))
  ok('hidden.1', 'every class that sets display and is toggled with the hidden attribute carries a [hidden] reset',
    toggled.size >= 2 && bad.length === 0, bad.length ? `no [hidden] rule for: ${bad.join(', ')}` : `toggled classes: ${[...toggled].join(', ')}`)
}

// M63 — tone.1. THE TONE BLOCK IS THE ONLY BINDING. Every tone panel-state.ts
// can produce has a `[data-tone="…"]` rule, and no selector OUTSIDE that
// block binds an agent hue (--blue/--amber/--green/--red) to a data-tone or
// a data-agent-state. The state's colour used to be spelled in four places;
// a fifth would drift exactly as the words did.
{
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'renderer', 'panels', 'panel-state.ts'), 'utf8')
  const tones = (/export const TONES[^=]*= \[([^\]]*)\]/.exec(src) || ['', ''])[1].match(/'([a-z-]+)'/g).map((t) => t.replace(/'/g, ''))
  const missing = tones.filter((t) => !bare.includes(`[data-tone="${t}"]`))
  const start = bare.indexOf('[data-tone] {')
  const end = bare.indexOf('.pf::before')
  const outside = bare.slice(0, start) + bare.slice(end)
  // Any rule whose selector names a state — a data-tone or data-agent-state
  // attribute, or a `--busy/--wants-you/--idle/--exited/--starting/--asleep`
  // class suffix — and binds an agent hue. Multi-line selector lists are
  // joined first so a state on an earlier line is not missed. The ONE
  // allowed exception is the frame's own attention glow (`.panel--agent-*`
  // border tint), a separate checked property the spec keeps beside the edge.
  const stray = [...outside.matchAll(/([^{}]*)\{([^}]*)\}/g)]
    .filter((m) => /\[data-(?:tone|agent-state)="[^"]+"\]|--(?:busy|wants-you|idle|exited|starting|asleep)\b/.test(m[1]))
    .filter((m) => /var\(--(?:blue|amber|green|red)\)/.test(m[2]))
    .map((m) => m[1].trim().replace(/\s+/g, ' '))
    .filter((sel) => !/^\.panel(--selected)?\.?panel--agent-/.test(sel) && !/^\.panel--agent-/.test(sel))
  ok('tone.1', 'every tone has a [data-tone] rule and no state-named selector outside the tone block binds an agent hue (the frame glow excepted)',
    tones.length >= 8 && missing.length === 0 && start > 0 && stray.length === 0,
    JSON.stringify({ tones: tones.length, missing, stray: stray.slice(0, 4) }))
}

// M66 — compact.1. THE DRAWERS DO NOT COVER THE STRIP. At the compact
// breakpoint the navigator and context panes are drawers over the canvas;
// the status strip and the hint strip must sit ABOVE them (a higher
// z-index, an opaque ground) and the drawers must run from the top bar down.
// The critic saw "CPU 0% · RAM" cut off under the context drawer.
{
  const drawer = /\.shell--nav-drawer \.shell__rail,\s*\.shell--ctx-drawer \.shell__inspector\s*\{([^}]*)\}/.exec(bare)
  const drawerZ = drawer ? Number((/z-index:\s*(\d+)/.exec(drawer[1]) || [])[1]) : NaN
  const hudZ = Number((/\.canvas-hud\s*\{[^}]*z-index:\s*(\d+)/.exec(bare) || [])[1])
  // M173: the hint strip is gone (its hints are the empty state's); only the HUD pill is probed.
  const hudOpaque = /\.canvas-hud\s*\{[^}]*background:\s*var\(--s-[0-9]\)/.test(bare)
  const drawerTop = drawer ? /top:\s*var\(--shell-top-h\)/.test(drawer[1]) : false
  const drawerBottom = drawer ? /bottom:\s*0\b/.test(drawer[1]) : false
  ok('compact.1', 'the compact drawers run from the top bar to the bottom, under the status strip and the hint strip, which sit on an opaque ground',
    Number.isFinite(drawerZ) && hudZ > drawerZ && hudOpaque && drawerTop && drawerBottom,
    JSON.stringify({ drawerZ, hudZ, hudOpaque, drawerTop, drawerBottom }))
}

// M67 — ground.1 / shadow.1 / hairline.1. THE FRAME, SECOND PASS. The brief
// overrules three beta decisions in one sentence each: the ground is flat
// (no dot grid, no vignette), nothing at rest carries a shadow (`--line` is
// the boundary; `--e-3`/`--e-4` are for overlays only), and a dark-theme
// frame has a hairline a person can see. Each fails silently if undone: a
// shadow creeps back on one selector and the frame reads "raised" again.
{
  // EVERY `.canvas {` rule, not the first: the first is the grid-area
  // one-liner, and a gradient reinstated in the real rule would have passed
  // (M67's verifier).
  const canvasRules = bodyRules.filter((r) => r.sel === '.canvas')
  const canvas = canvasRules.length > 0 ? canvasRules : null
  const canvasBg = canvasRules.map((r) => (r.body.match(/background[^;]*;/g) || []).join(' ')).join(' ')
  const dotUses = (bare.match(/var\(--dot\)/g) || []).length
  const dotDeclared = (src.match(/--dot:/g) || []).length
  // M109. AMENDED: the ground is a LIT SPACE, not a flat fill — but the light
  // lives on two aura layers (`.shell__aura` behind every region, `.canvas__aura`
  // beside .world, following the camera), never on .canvas itself, which is
  // transparent so the shell's light shows through. Both take no pointer:
  // a layer over the world that hit-tests would swallow the background
  // mousedown that clears selection. Still no dot grid.
  const auraShell = bodyRules.find((r) => r.sel === '.shell__aura')
  const auraCanvas = bodyRules.find((r) => r.sel === '.canvas__aura')
  const auraOk = (r) => r !== undefined && /gradient/.test(r.body) && /pointer-events:\s*none/.test(r.body) && /var\(--aura-1\)/.test(r.body)
  ok('ground.1', 'the canvas is transparent and flat; the light is on the two aura layers, each a gradient from the aura tokens that takes no pointer; no --dot token',
    canvas !== null && !/gradient/.test(canvasBg) && /background:\s*transparent/.test(canvasBg) && dotUses === 0 && dotDeclared === 0 && auraOk(auraShell) && auraOk(auraCanvas),
    JSON.stringify({ canvasBg: canvasBg.slice(0, 80), dotUses, dotDeclared, auraShell: auraShell !== undefined, auraCanvas: auraCanvas !== undefined }))

  const restingUses = bodyRules.filter((r) => /var\(--e-[12]\)/.test(r.body)).map((r) => r.sel)
  const OVERLAY = /\.palette\b|\.dock__popover|\.shell--(nav|ctx)-drawer|\.diagnostics-overlay|\.sheet__suggestions/
  const overlayMisuse = bodyRules.filter((r) => /var\(--e-[34]\)/.test(r.body) && !OVERLAY.test(r.sel)).map((r) => r.sel)
  // M109. AMENDED: ONE resting shadow exists and it is named — `--lift`, on
  // the panel frame (and the launcher, which wears the frame) and nowhere
  // else. --e-1/--e-2 stay unused; --e-3/--e-4 stay overlay-only. A lift
  // creeping onto a rail row or a card would put the old "everything
  // floats" grammar back one selector at a time.
  const liftUses = bodyRules.filter((r) => /var\(--lift\)/.test(r.body)).map((r) => r.sel)
  // The frame, its selected/state rules, the wants-you keyframes (parsed as
  // `0%, 100%` selectors) and the launcher, which wears the frame.
  const LIFT_OK = /^\.panel(\b|--)|^\.launcher$|^\d+%/
  const liftMisuse = liftUses.filter((sel) => !LIFT_OK.test(sel))
  ok('shadow.1', 'one resting shadow, --lift, on the panel frame and the launcher only; --e-1/--e-2 unused in the body, --e-3/--e-4 only on overlays',
    restingUses.length === 0 && overlayMisuse.length === 0 && liftUses.length >= 1 && liftMisuse.length === 0,
    JSON.stringify({ restingUses: restingUses.slice(0, 6), overlayMisuse: overlayMisuse.slice(0, 6), liftUses, liftMisuse }))

  const dark = /\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(bare)
  const darkBinds = dark ? /--frame-line:\s*var\(--line-strong\)/.test(dark[1]) : false
  const declared = (bare.match(/--frame-line:/g) || []).length
  const panel = /\n\.panel\s*\{([^}]*)\}/.exec(bare)
  const panelUses = panel ? /border:[^;]*var\(--frame-line\)/.test(panel[1]) : false
  ok('hairline.1', 'the frame border is --frame-line, declared in both blocks and --line-strong in the dark one',
    declared >= 2 && darkBinds && panelUses, JSON.stringify({ declared, darkBinds, panelUses }))
}

{
  // M91. The rail was widened from 260px: titles truncated at the old width
  // (recorded three times across M66–M68). The token is the one place, and
  // the drawer overlay that stands in for it on narrow shells matches it.
  const nav = /--shell-nav-w:\s*(\d+)px/.exec(bare)
  const width = nav ? Number(nav[1]) : 0
  const drawer = /\.shell--nav-drawer \.shell__rail,[^{]*\{[^}]*width:\s*(\d+)px/.exec(bare)
  ok('rail-w.1', 'the navigator rail is at least 300px wide and its drawer overlay matches the token',
    width >= 300 && drawer !== null && Number(drawer[1]) === width, JSON.stringify({ width, drawer: drawer && drawer[1] }))
}

{
  // M91. At the far tiers the frame border thickens in world units so it
  // stays ~1 device pixel: summary enters at 0.26, block at 0.11.
  const summary = /\.world\[data-detail="summary"\] \.pf \{[^}]*border-width:\s*(\d+)px/.exec(bare)
  const block = /\.world\[data-detail="block"\] \.pf \{[^}]*border-width:\s*(\d+)px/.exec(bare)
  const sPx = summary ? Number(summary[1]) * 0.26 : 0
  const bPx = block ? Number(block[1]) * 0.11 : 0
  ok('far-line.1', 'the frame border at the summary and block tiers paints about one device pixel at each tier\'s entry scale',
    sPx >= 0.8 && sPx <= 1.5 && bPx >= 0.8 && bPx <= 1.5, JSON.stringify({ summary: summary && summary[1], block: block && block[1], sPx, bPx }))
}

// M106 — header.1. THE FRAME RULE, once, for every kind: the title shrinks
// (M67's 8ch floor — never 0, which was the critic's blocking finding then —
// and an ellipsis) and the verbs never do (flex 0 0 auto), so a narrow frame
// keeps its controls and never prints `Revie…` beside them.
{
  const titleRule = all.find((r) => /\.pf__title\b/.test(r.sel) && /min-width\s*:\s*8ch/.test(r.body) && /text-overflow\s*:\s*ellipsis/.test(r.body))
  const verbRule = all.find((r) => /\.pf__verb\b|\.pf__close\b/.test(r.sel) && /flex\s*:\s*0 0 auto|flex-shrink\s*:\s*0/.test(r.body))
  ok('header.1', 'the frame title shrinks with an ellipsis and the chrome verbs never shrink — one rule for every kind',
    titleRule !== undefined && verbRule !== undefined, `title: ${titleRule ? titleRule.sel : 'none'} · verbs: ${verbRule ? verbRule.sel : 'none'}`)
}

// M121 — header.2. THE AUTO CHIP GIVES before the verbs clip: with the
// header line already giving first (M107), the chip was the next thing to
// hold its width, and at a narrow frame the chrome verbs clipped instead of
// it (M107's critic 9, second half). The chip takes .pf__title's own rule —
// min-width 0, hidden overflow, an ellipsis — and may shrink (flex 1 1 auto).
{
  const chipRule = all.find((r) => /\.chat__auto\b(?![-_])/.test(r.sel) && /min-width\s*:\s*0/.test(r.body) && /overflow\s*:\s*hidden/.test(r.body) && /text-overflow\s*:\s*ellipsis/.test(r.body) && /flex\s*:\s*1 1 auto/.test(r.body))
  ok('header.2', 'the auto chip shrinks with an ellipsis before the chrome verbs clip — min-width 0, overflow hidden, text-overflow ellipsis, flex 1 1 auto on .chat__auto',
    chipRule !== undefined, chipRule ? chipRule.sel : 'no .chat__auto rule with the four declarations')
}

// M109 — obsidian.1. THE GLASS SET, in both blocks. theme.1 already proves
// the two blocks agree; this pins that the set EXISTS (a missing --glass-1
// leaves every panel with no fill and no error — check 2 would catch the
// var, but not a panel rule that was simply never written to use it) and
// that --panel-bg aliases --glass-1: verify:panels reads a card's computed
// background against var(--panel-bg), so the alias is what keeps that check
// measuring the real fill.
{
  const GLASS = ['--glass-1', '--glass-2', '--edge-light', '--bezel', '--lift', '--aura-1', '--aura-2', '--on-iris', '--blur']
  const missing = GLASS.filter((t) => !(perBlock.light || {})[t] || !(perBlock.dark || {})[t])
  const alias = ['light', 'dark'].every((n) => /var\(--glass-1\)/.test((perBlock[n] || {})['--panel-bg'] || ''))
  const panelUses = /\n\.panel\s*\{[^}]*background:\s*var\(--panel-bg\)/.test(bare) || /\n\.panel\s*\{[^}]*background:\s*var\(--glass-1\)/.test(bare)
  const onIrisHex = ['light', 'dark'].every((n) => /^#[0-9a-fA-F]{6}$/.test((perBlock[n] || {})['--on-iris'] || ''))
  ok('obsidian.1', 'the glass set is declared in both theme blocks, --panel-bg aliases --glass-1, the panel fills with it, and --on-iris is measurable hex',
    missing.length === 0 && alias && panelUses && onIrisHex, JSON.stringify({ missing, alias, panelUses, onIrisHex }))
}

// M109 — blur.1. WHERE BLUR IS NOT PAID. backdrop-filter composites a layer
// per element; the live and card tiers are bounded by the viewport, the far
// tiers are not (a hundred blocks at 8%), and the glass is invisible there
// anyway. The far-tier rules must set it to none, and the HUD must stay off
// it (compact.1 reads its opaque ground; it sits over a world that repaints
// on every pan frame).
{
  const panelBlur = /\n\.panel\s*\{[^}]*backdrop-filter:\s*var\(--blur\)/.test(bare)
  const farOff = /\.world\[data-detail="summary"\] \.pf,\s*\.world\[data-detail="block"\] \.pf\s*\{[^}]*backdrop-filter:\s*none/.test(bare)
  const hudRule = bodyRules.find((r) => r.sel === '.canvas-hud')
  const hudOff = hudRule !== undefined && !/backdrop-filter/.test(hudRule.body)
  ok('blur.1', 'the panel blurs through --blur at the near tiers, the far tiers set backdrop-filter: none, and the HUD never blurs',
    panelBlur && farOff && hudOff, JSON.stringify({ panelBlur, farOff, hudOff }))
}

// M109 — pulse.1. ONE BREATH. The brief's motion rule is three moments; the
// needs-you pulse is one of them and it ENDS — an infinite pulse on a panel
// that waits an hour is a heartbeat the user learns to ignore. The static
// ring stays declared outside the keyframes (its own comment says why).
{
  const wy = /\n\.panel--agent-wants-you\s*\{([^}]*)\}/.exec(bare)
  const anim = wy ? /animation:\s*wants-you-pulse[^;]*;/.exec(wy[1]) : null
  const finite = anim !== null && !/infinite/.test(anim[0]) && /\b[1-4]\s*;/.test(anim[0])
  const staticRing = wy ? /box-shadow:[^;]*var\(--amber\)/.test(wy[1]) : false
  ok('pulse.1', 'the wants-you pulse runs a finite number of breaths (1–4) and rests on its static amber ring',
    finite && staticRing, JSON.stringify({ anim: anim && anim[0], staticRing }))
}

// M110 — primary.1. ONE FILLED CONTROL PER SURFACE. The rule fills with the
// interface accent and inks with --on-iris, and it is on exactly the five
// sites the spec names — never Commit, whose own comment refuses it. Read
// as selectors in the stylesheet: a site that lost the class reads as an
// ordinary outlined button, which is the pre-M110 look and not an error.
{
  const rule = all.find((r) => /\.is-primary\b/.test(r.sel) && /background:\s*var\(--iris\)/.test(r.body) && /color:\s*var\(--on-iris\)/.test(r.body))
  const SITES = ['.shell__spawn', '.chat__verb--send', '.inspector__action--primary', '.rail-run .rail-row__verb', '.jira-node__connect']
  const sel = rule ? rule.sel.replace(/\s+/g, ' ') : ''
  const missing = SITES.filter((s) => !sel.includes(s))
  const commit = sel.includes('.review-node__commit')
  ok('primary.1', 'the .is-primary rule fills with --iris, inks with --on-iris, and names its five sites and never Commit',
    rule !== undefined && missing.length === 0 && !commit, JSON.stringify({ sel: sel.slice(0, 200), missing, commit }))
}

// M110 — far.1. ONE STATUS WALL. The block tier and the minimap draw the
// same fact and must draw it with the same fill — one color-mix of the tone
// over the surface — or the map and the canvas disagree about what a
// colour means at a glance, which is the whole reason the minimap exists.
{
  const mix = /color-mix\(in srgb, var\(--tone\) (\d+)%, var\(--s-1\)\)/
  const block = /\.panel__card-block\[data-tone\]\s*\{([^}]*)\}/.exec(bare)
  const mini = /\n\.minimap__block\s*\{([^}]*)\}/.exec(bare)
  const b = block ? mix.exec(block[1]) : null
  const m = mini ? mix.exec(mini[1]) : null
  ok('far.1', 'the block tier and the minimap share one color-mix fill of the tone over --s-1',
    b !== null && m !== null && b[1] === m[1], JSON.stringify({ block: b && b[0], mini: m && m[0] }))
}

// M110 — motion.1. The palette's moment: it enters with a scale as well as
// the rise, on its own element (never .world). The reduced-motion block
// still stands it down.
{
  const kf = /@keyframes palette-enter\s*\{([\s\S]*?)\}\s*\}/.exec(bare)
  const scales = kf ? /from\s*\{[^}]*scale\(\.9[0-9]\)/.test(kf[1]) : false
  ok('motion.1', 'the palette-enter keyframe scales from below 1 on the palette\'s own element',
    scales, JSON.stringify({ kf: kf && kf[1].replace(/\s+/g, ' ').slice(0, 160) }))
}

// M127 — skills.1. THE COLUMN FITS THE NAVIGATOR. The navigator is a fixed
// ~300px (M46: its width is the breakpoint's, never the pane's), so a Skills
// column that asks for more than the pane can hold renders half off the left
// edge with its title cut — which is what the `skills` shot scene found. The
// three facts that keep it inside are lexical and are pinned here: the column
// declares a FIXED width and `min-width: 0` (a flex basis alone loses to a
// heading whose controls do not shrink), the heading's title GIVES (M106's
// one header rule: the title ellipsises, every control is `flex: 0 0 auto`),
// and the rack — the PANE, never the shell — is what scrolls sideways.
//
// What it cannot see: the rendered width. A `width` in a unit larger than the
// navigator would pass this and fail the eye; the shot scene is the check for
// that, and it is not in `npm run verify`.
{
  const col = all.find((r) => /(^|,)\s*\.skills-pane__column\s*(,|$)/.test(r.sel))
  const colFixed = col ? /(^|;|\s)width:\s*[\d.]+r?em/.test(col.body) && /min-width:\s*0/.test(col.body) : false
  // The title's OWN rule, not the heading's `:not(.skills-pane__column-title)`
  // sibling clause, which names it and declares nothing about it.
  const title = all.find((r) => /(^|,)\s*\.skills-pane__column-title\s*(,|$)/.test(r.sel))
  const titleGives = title ? /text-overflow:\s*ellipsis/.test(title.body) && /min-width:\s*0/.test(title.body) : false
  const rack = all.find((r) => /\.skills-pane__columns\b/.test(r.sel))
  const rackScrolls = rack ? /overflow-x:\s*auto/.test(rack.body) : false
  ok('skills.1', 'a Skills column has a fixed width and min-width: 0, its heading title ellipsises, and the rack scrolls sideways',
    colFixed && titleGives && rackScrolls, JSON.stringify({ colFixed, titleGives, rackScrolls }))
}

// M162 — face.1. THE FACE RULE. `--font-mono` is for code, commands, paths
// and terminal cells; everything a person reads as a sentence or a name is
// set in `--font-ui`. `body` already defaults to the UI face, so mono is an
// explicit opt-in, and this check is the closed list of surfaces that may
// NOT opt in. Two arms, because the failure has two shapes:
//   - the SUBJECT arm: a rule whose subject (the last compound of a selector)
//     is a listed prose surface and whose body sets the mono face fails.
//     Only the subject is read, so `.chat__text code { mono }` — a code leaf
//     under a prose surface, the very shape the brief prescribes — passes
//     (the Act 0 critic: the first cut matched any compound and forbade it).
//   - the ANCESTOR arm: the four containers that once set mono for everything
//     beneath them (`.chat__transcript` did, from M73 until this milestone,
//     and every sentence the agent wrote inherited it with nothing on screen
//     to say so) may not set it again under any selector shape.
// What it cannot see: a face set from a component's inline style, a family
// aliased through a second token, or a prose class this list does not name.
// The goldens are the check for those. `.pf__body--text`, the reading
// bodies' ancestor, joined the ancestor arm in M164.
{
  const PROSE = [
    '.pf__title', '.launcher__title', '.launcher__verb-name', '.launcher__env',
    '.chat__transcript', '.chat__input', '.chat__text', '.chat__role', '.chat__popup-row', '.chat__empty',
    '.rail-row__start', '.rail-row__rename', '.rail-row__close', '.rail-row__label', '.rail-empty',
    '.memory-node__text', '.memory-node__select', '.subagent-node__desc', '.subagent-ambiguous', '.subagent-more',
    '.annotation__label', '.annotation__editor', '.inspector__link-title', '.inspector__link-label', '.inspector__select',
    '.link-layer__label', '.board-row__note', '.skill-card__note', '.integration__row-meta', '.github-item__body',
    '.workflow-node__block-sub', '.workflow-node__edge-word', '.watcher-node__when', '.file-node__backlink-verb',
    '.review-node__section-count', '.skills-pane__filter', '.palette__state', '.palette__title', '.skill-card__resources', '.diagnostics-overlay', '.trail-card__name',
    '.panel__card', '.sheet__preview', '.lane-header__name', '.edge-indicator__name', '.inspector__run-name'
  ]
  const ANCESTORS = ['.chat__transcript', '.diagnostics-overlay', '.panel__card', '.subagent-ambiguous', '.pf__body--text' /* M164 */]
  const sets = (body) => /font(?:-family)?\s*:[^;}]*(?:var\(\s*--font-mono\s*\)|\bmonospace\b|ui-monospace)/.test(body)
  const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // The subject of one selector: its last compound, combinators and
  // pseudo-elements stripped, `:is(...)`/`:where(...)` unwrapped.
  const subject = (sel) => sel.replace(/:(?:is|where)\(([^)]*)\)/g, '$1').trim().split(/\s*[\s>+~]\s*/).pop().replace(/::?[\w-]+(?:\([^)]*\))?/g, '')
  const hits = []
  for (const r of all) {
    if (!sets(r.body)) continue
    for (const part of r.sel.split(',')) {
      const subj = subject(part)
      for (const p of PROSE) if (new RegExp(`(^|[^\\w-])${esc(p)}(?![\\w-])`).test(subj)) hits.push(`${p} ← ${part.trim().slice(0, 60)}`)
      for (const a of ANCESTORS) if (new RegExp(`(^|[^\\w-])${esc(a)}(?![\\w-])`).test(part) && !hits.includes(`${a} ← ${part.trim().slice(0, 60)}`)) hits.push(`${a} ← ${part.trim().slice(0, 60)}`)
    }
  }
  ok('face.1', 'no prose surface sets the mono face, and no former mono ancestor does under any selector (the face rule)',
    hits.length === 0, `${hits.length} mono on prose: ${[...new Set(hits)].slice(0, 12).join(' | ')}`)
}

// M162 — polish.1. The brief's four tokens: `--bubble` (the user turn's
// ground) in BOTH theme blocks as six-digit hex so check 11 measures text on
// it, and the three structural values — the prose measure, the body size, the
// reading inset — on bare `:root` where check 8 keeps them out of the themes.
// A token declared in one block only falls through silently (theme.1's
// lesson); a measure written as a literal `72ch` at each site drifts at the
// third site.
{
  const rootMap = perBlock.root || {}
  const light = perBlock.light || {}
  const dark = perBlock.dark || {}
  const hex = (v) => /^#[0-9a-f]{6}$/i.test(v || '')
  const facts = {
    bubble: hex(light['--bubble']) && hex(dark['--bubble']) && light['--bubble'] !== dark['--bubble'],
    measure: /^\d+ch$/.test(rootMap['--measure'] || ''),
    base: rootMap['--t-base'] === '14px',
    inset: rootMap['--inset'] === '20px',
    ground: grounds.includes('--bubble')
  }
  ok('polish.1', 'the brief\'s tokens: --bubble hex in both blocks (and a measured ground), --measure / --t-base / --inset on :root',
    Object.values(facts).every(Boolean), JSON.stringify(facts))
}

// M163 — rest.1. THE REST RULE on the frame: at rest a header shows the kind
// glyph, the title and one state; the verbs, the marks and the close sit in
// their box at opacity 0 and come to 1 on the frame's :hover, :focus-within
// and .panel--selected, through a transition on --dur-1. Opacity, never
// display: the box stays (targets.1's 24px, header.1's widths) and a script's
// click lands without a hover. 0 and 1 only — check 3 refuses a fraction.
{
  const at = (re) => all.filter((r) => re.test(r.sel))
  const hidden = at(/\.pf__chrome\s+\.pf__verb/).some((r) => /(^|;|\s)opacity:\s*0\s*(;|$)/.test(r.body) && /transition:[^;]*var\(--dur-1\)/.test(r.body))
  const marks = at(/\.pf__chrome\s+\.pf__mark/).some((r) => /(^|;|\s)opacity:\s*0\s*(;|$)/.test(r.body))
  const close = at(/\.pf__chrome\s+\.pf__close/).some((r) => /(^|;|\s)opacity:\s*0\s*(;|$)/.test(r.body))
  const revealed = all.filter((r) => /\.pf:hover/.test(r.sel) && /\.pf:focus-within/.test(r.sel) && /\.panel--selected/.test(r.sel))
    .some((r) => /opacity:\s*1\b/.test(r.body))
  const reduced = /@media[^{]*prefers-reduced-motion[^{]*\{[\s\S]*?\.pf__chrome[\s\S]*?transition:\s*none/.test(bare)
  ok('rest.1', 'the chrome verbs, marks and close rest at opacity 0 (a --dur-1 transition) and reveal at 1 on the frame\'s :hover, :focus-within and .panel--selected; reduced motion drops the transition',
    hidden && marks && close && revealed && reduced, JSON.stringify({ hidden, marks, close, revealed, reduced }))
}

// M163 — metrics.1. THE METRICS RULE: CPU and RAM belong in the inspector.
// `data-machine-cost` (the per-panel readout) appears under src/renderer in
// the inspector alone — never on a header, a card tier or the rail — and the
// stylesheet has no rule for a header or card cost. The HUD's TOTAL
// (`data-machine-cost-total`) is M173's, matched apart by its suffix.
{
  const root = path.join(__dirname, '..', 'src', 'renderer')
  const files = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.tsx?$/.test(e.name)) files.push(f) } }
  walk(root)
  const sites = files.filter((f) => /data-machine-cost(?!-total)/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f))
  const allowed = new Set(['shell/Inspector.tsx'])
  const stray = sites.filter((f) => !allowed.has(f))
  const rules = all.filter((r) => /\.panel__machine-cost|\.panel__card-cost|\.panel__card-summary-cost/.test(r.sel)).map((r) => r.sel.slice(0, 40))
  ok('metrics.1', 'the per-panel CPU/RAM readout lives in the inspector only (no header, card or rail site) and the stylesheet has no header/card cost rule',
    sites.length >= 1 && stray.length === 0 && rules.length === 0, JSON.stringify({ sites, stray, rules }))
}

// M165 — diff.1. DIFFS AS CARDS. A review file row is a CARD (the control
// radius, a hairline), its `discard` verb rests at opacity 0 and reveals on
// the card's :hover / :focus-within (the rest rule) — and stays at 1 while
// ARMED (`keep` must be readable without a pointer over it), and the two count
// pills read the add/remove washes that already exist (--green-dim, --red-dim).
{
  const card = all.find((r) => /(^|,)\s*\.review-node__file\s*(,|$)/.test(r.sel))
  const isCard = card ? /border-radius:\s*var\(--r-md\)/.test(card.body) && /border:\s*1px solid var\(--line\)/.test(card.body) : false
  const discard = all.filter((r) => /(^|,)\s*\.review-node__discard\s*(,|$)/.test(r.sel)).some((r) => /(^|;|\s)opacity:\s*0\s*(;|$)/.test(r.body))
  const reveal = all.some((r) => /\.review-node__file:hover/.test(r.sel) && /\.review-node__file:focus-within/.test(r.sel) && /\.review-node__discard--armed/.test(r.sel) && /opacity:\s*1\b/.test(r.body))
  const pills = all.some((r) => /\.review-node__add\b/.test(r.sel) && /--green-dim/.test(r.body)) && all.some((r) => /\.review-node__del\b/.test(r.sel) && /--red-dim/.test(r.body))
  ok('diff.1', 'a review file row is a card (--r-md, a hairline), its discard rests at opacity 0 and reveals on hover/focus-within or while armed, and its counts are two washed pills',
    isCard && discard && reveal && pills, JSON.stringify({ isCard, discard, reveal, pills }))
}

// M166 — far.2. THE FAR VIEW AS A STATUS WALL. The summary tier fills with
// the SAME tone wash the block tier and the minimap use (far.1's color-mix,
// 26% of the tone over --s-1), shows a kind glyph beside the name, and prints
// no last line: at a fifth of the size a card is a light with a name, not a
// paragraph (the brief, finding 10).
{
  const block = all.find((r) => /\.panel__card-block\[data-tone\]/.test(r.sel))
  const mix = block && (block.body.match(/color-mix\([^)]*\)/) || [null])[0]
  const summary = all.filter((r) => /\.panel__card-summary\[data-tone\]|\.panel__card--summary\[data-tone\]/.test(r.sel))
  const sameWash = mix !== null && summary.some((r) => r.body.replace(/\s+/g, '').includes(mix.replace(/\s+/g, '')))
  const glyph = all.some((r) => /\.panel__card-summary-glyph\b/.test(r.sel))
  const noLine = !all.some((r) => /\.panel__card-summary-line\b/.test(r.sel))
  ok('far.2', 'the summary tier fills with the block tier\'s own tone wash, carries a kind glyph, and has no last-line rule',
    sameWash && glyph && noLine, JSON.stringify({ mix, sameWash, glyph, noLine }))
}

// M167 — turns.1. THE TURNS: the user's turn is a bubble on --bubble at --r-lg,
// at most 75% wide and aligned right; the assistant's is unboxed prose at
// --measure; .chat__role is CLIPPED (the accessible name stays, the caps
// column goes); .chat__when rests at 0 and reveals on the row's hover (the
// rest rule).
{
  const user = all.find((r) => /(^|,)\s*\.chat__row--user\s*(,|$)/.test(r.sel))
  const bubble = user ? /var\(--bubble\)/.test(user.body) && /max-width:\s*75%/.test(user.body) && /var\(--r-lg\)/.test(user.body) && /margin-left:\s*auto|align-self:\s*flex-end/.test(user.body) : false
  const assistant = all.find((r) => /(^|,)\s*\.chat__row--assistant\s*(,|$)/.test(r.sel))
  const measured = assistant ? /max-width:\s*var\(--measure\)/.test(assistant.body) : false
  const role = all.find((r) => /(^|,)\s*\.chat__role\s*(,|$)/.test(r.sel))
  const clipped = role ? /position:\s*absolute/.test(role.body) && /clip/.test(role.body) : false
  const when = all.find((r) => /(^|,)\s*\.chat__when\s*(,|$)/.test(r.sel))
  const hidden = when ? /(^|;|\s)opacity:\s*0\s*(;|$)/.test(when.body) : false
  const reveal = all.some((r) => /\.chat__row:hover \.chat__when/.test(r.sel) && /opacity:\s*1\b/.test(r.body))
  ok('turns.1', 'the user turn is a --bubble at --r-lg, at most 75% wide and aligned right; the assistant turn is unboxed at --measure; the role label is clipped; the timestamp rests hidden and reveals on hover',
    bubble && measured && clipped && hidden && reveal, JSON.stringify({ bubble, measured, clipped, hidden, reveal }))
}

// M168 — tools.1. TOOL ROWS: one collapsed row per call — a glyph slot, the
// verb, the target, a state pill — and the expanded result in a scrolling
// well capped at twelve lines; the `TOOL` ::before label is gone; a group's
// header row exists and its rows are hidden while collapsed.
{
  const label = all.some((r) => /\.chat__row--tool::before/.test(r.sel) && /content:\s*'tool'/.test(r.body))
  const glyph = all.some((r) => /\.chat__tool-glyph\b/.test(r.sel))
  const pill = all.some((r) => /\.chat__tool-state\b/.test(r.sel) && /border-radius:\s*var\(--r-full\)/.test(r.body))
  // `some`, not `find`: a second rule names the same subject for its flex line (the opened body takes the whole row).
  const capped = all.some((r) => /(^|,)\s*\.chat__tool-result\s*(,|$)/.test(r.sel) && /max-height:\s*calc\(12 \*/.test(r.body))
  const group = all.some((r) => /\.chat__tools-head\b/.test(r.sel)) && all.some((r) => /\.chat__tools--collapsed \.chat__row--tool/.test(r.sel) && /display:\s*none/.test(r.body))
  ok('tools.1', 'a tool row has a glyph slot, a state pill and no TOOL label; the result well is capped at twelve lines; a group has a header and hides its rows while collapsed',
    !label && glyph && pill && capped && group, JSON.stringify({ label, glyph, pill, capped, group }))
}

// M169 — composer.1. THE COMPOSER: a rounded well (--r-lg, a hairline, an
// inset shadow on --bezel, the iris ring on focus-within); Send is the one
// filled control (.chat__verb--send stays in primary.1's list); Interrupt is
// PRESENT always (codex.1 reads its attributes) and takes Send's place only
// while a turn runs — at rest it is out of the flow by class, never by a
// fraction of opacity; the chips row above the text; the approval sentence
// and its two buttons in the same well.
{
  const well = all.find((r) => /(^|,)\s*\.chat__composer\s*(,|$)/.test(r.sel))
  const rounded = well ? /border-radius:\s*var\(--r-lg\)/.test(well.body) && /border:\s*1px solid var\(--line\)/.test(well.body) && /inset 0 1px 2px var\(--bezel\)/.test(well.body) : false
  const ring = all.some((r) => /\.chat__composer:focus-within/.test(r.sel) && /--iris/.test(r.body))
  const interruptRest = all.some((r) => /\.chat__verb--interrupt\b/.test(r.sel) && !/--live/.test(r.sel) && /display:\s*none/.test(r.body))
  const interruptLive = all.some((r) => /\.chat__composer--live \.chat__verb--interrupt/.test(r.sel) && /display:\s*(inline-flex|inline-block|flex|block)/.test(r.body))
  const sendLive = all.some((r) => /\.chat__composer--live \.chat__verb--send/.test(r.sel) && /display:\s*none/.test(r.body))
  const chips = all.some((r) => /\.chat__chips\b/.test(r.sel)) && all.some((r) => /\.chat__chip--quiet\b/.test(r.sel))
  const approval = all.some((r) => /\.chat__permission-sentence\b/.test(r.sel))
  ok('composer.1', 'the composer is a rounded well with an inset shadow and an iris ring on focus; Interrupt is out of the flow at rest and replaces Send while a turn runs; the chips row and the approval sentence live in the well',
    rounded && ring && interruptRest && interruptLive && sendLive && chips && approval, JSON.stringify({ rounded, ring, interruptRest, interruptLive, sendLive, chips, approval }))
}

// M171 — rail.1. THE RAIL AS PLACES: a quiet heading rule (`.rail-heading`,
// the caps tracking, never `.rail-row` — empty.1 counts rows); the kind glyph
// in a soft tint; a state DOT slot on every stateful row with the word kept
// in the tail but clipped (the checks read its text; a person reads the dot
// and the title); `start` at opacity 0 revealed on the row's hover /
// focus-within (the rest rule); the selected row a soft filled pill.
{
  const heading = all.find((r) => /(^|,)\s*\.rail-heading\s*(,|$)/.test(r.sel))
  const headingOk = heading ? /letter-spacing:\s*var\(--track-caps\)/.test(heading.body) && /text-transform:\s*uppercase/.test(heading.body) : false
  const tint = all.some((r) => /(^|,)\s*\.rail-row__kind\s*(,|$)/.test(r.sel) && /background:\s*var\(--iris-dim\)/.test(r.body))
  // `some`, not `find`: these subjects have an M46/M66 rule earlier in the file and the M171 rule later.
  const clipped = all.some((r) => /\.rail-list--panels \.rail-row__tail\s*(,|$)/.test(r.sel) && /position:\s*absolute/.test(r.body) && /clip/.test(r.body)) && !all.some((r) => /(^|,)\s*\.rail-row__tail\s*(,|$)/.test(r.sel) && /clip/.test(r.body)) // scoped to the Panels list: other lists' tails are facts
  const dot = all.some((r) => /\.rail-row__state-dot\b/.test(r.sel))
  const startHidden = all.some((r) => /(^|,)\s*\.rail-row__start\s*(,|$)/.test(r.sel) && /(^|;|\s)opacity:\s*0\s*(;|$)/.test(r.body))
  const startReveal = all.some((r) => /\.rail-row:hover \.rail-row__start/.test(r.sel) && /\.rail-row:focus-within \.rail-row__start/.test(r.sel) && /opacity:\s*1\b/.test(r.body))
  const pill = all.some((r) => /(^|,)\s*\.rail-row--selected\s*(,|$)/.test(r.sel) && /background:\s*var\(--iris-dim\)/.test(r.body) && /border-radius:\s*var\(--r-md\)/.test(r.body))
  ok('rail.1', 'a caps heading rule, the kind glyph tinted, the tail clipped beside a state dot, start hidden at rest and revealed on hover/focus-within, the selected row a filled pill',
    headingOk && tint && clipped && dot && startHidden && startReveal && pill, JSON.stringify({ headingOk, tint, clipped, dot, startHidden, startReveal, pill }))
}

// M172 — dock.1. THE DOCK AS NAMED PLACES: each button carries a `.dock__label`
// at opacity 0 that reveals on the button's :hover / :focus-visible (a tag
// beside the icon, never a wider dock); the current place is a filled pill
// (--iris-dim); the `N live / N quiet` capsules are gone from the dock (the
// metrics rule — the count lives in the rail's `Agents · N` heading), so no
// `.dock__capsule` rule remains and `Dock.tsx` renders no `data-dock-capsules`;
// the top bar's search is a FIELD-shaped button (`.shell__search` stays a
// button for shell 78) with a hairline and --r-full.
{
  const label = all.some((r) => /(^|,)\s*\.dock__label\s*(,|$)/.test(r.sel) && /(^|;|\s)opacity:\s*0\s*(;|$)/.test(r.body))
  const reveal = all.some((r) => /\.dock__button:hover \.dock__label/.test(r.sel) && /\.dock__button:focus-visible \.dock__label/.test(r.sel) && /opacity:\s*1\b/.test(r.body))
  const on = all.some((r) => /(^|,)\s*\.dock__button--on\s*(,|$)/.test(r.sel) && /background:\s*var\(--iris-dim\)/.test(r.body))
  const noCapsule = !all.some((r) => /\.dock__capsule/.test(r.sel))
  const dockSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'shell', 'Dock.tsx'), 'utf8')
  const noCapsuleDom = !/data-dock-capsules/.test(dockSrc)
  const search = all.some((r) => /\.shell__top \.shell__search\s*(,|$)/.test(r.sel) && /border-radius:\s*var\(--r-full\)/.test(r.body) && /border:\s*1px solid var\(--line\)/.test(r.body)) // (0,2,0): the bar's generic button rule must not win
  ok('dock.1', 'the dock buttons carry a hidden label revealed on hover/focus-visible, the current place is a filled pill, the capsules are gone from the dock and its CSS, and the top bar\'s search is a field-shaped button',
    label && reveal && on && noCapsule && noCapsuleDom && search, JSON.stringify({ label, reveal, on, noCapsule, noCapsuleDom, search }))
}

// M173 — hud.2. THE STATUS BAR AT REST SAYS NOTHING: `.canvas-hud` is a
// floating pill (--r-full) holding the zoom controls and the update notice
// alone — no coordinates, no selected name, no CPU · RAM total, no tmux
// sentence — so no `__cost`, `__warn`, `__focus` or `__word` rule remains,
// and no `.hint-strip` rule (the strip is gone; its hints are the empty
// state's sentences, `hints.1`).
{
  // `some`: a breakpoint block declares `.canvas-hud` before the main rule does.
  const pill = all.some((r) => /(^|,)\s*\.canvas-hud\s*(,|$)/.test(r.sel) && /border-radius:\s*var\(--r-full\)/.test(r.body))
  const gone = ['.canvas-hud__cost', '.canvas-hud__warn', '.canvas-hud__focus', '.canvas-hud__word', '.hint-strip'].filter((c) => all.some((r) => r.sel.includes(c)))
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'canvas', 'CanvasHud.tsx'), 'utf8')
  const noFigures = !/data-machine-cost-total|canvas-hud__warn|canvas-hud__focus/.test(src)
  ok('hud.2', 'the HUD is a pill with the zoom controls and the update notice alone — no cost, tmux, coordinates or selected-name rule, no hint strip',
    pill && gone.length === 0 && noFigures, JSON.stringify({ pill, gone, noFigures }))
}

// M174 — launcher.1. THE LAUNCHER AS A WELCOME: the wordmark in the UI face
// (the last mono prose), the three doors as soft cards (--r-lg, --s-1, a
// hairline, the name at --t-lg), the verb list in the UI face with mono ONLY
// on the command itself (`.launcher__verb-command`), a recents row, and the
// environment line as one sentence — no `>` prompt glyph before a verb.
{
  const wordmark = all.some((r) => /(^|,)\s*\.launcher__wordmark\s*(,|$)/.test(r.sel) && /font-family:\s*var\(--font-ui\)/.test(r.body))
  const doorOk = all.some((r) => /(^|,)\s*\.launcher__verb--door\s*(,|$)/.test(r.sel) && /border-radius:\s*var\(--r-lg\)/.test(r.body) && /background:\s*var\(--s-1\)/.test(r.body))
  const doorName = all.some((r) => /\.launcher__verb--door \.launcher__verb-name/.test(r.sel) && /font-size:\s*var\(--t-lg\)/.test(r.body))
  const noPrompt = !all.some((r) => /\.launcher__verb-name::before/.test(r.sel) && /content:/.test(r.body))
  const command = all.some((r) => /(^|,)\s*\.launcher__verb-command\s*(,|$)/.test(r.sel) && /font-family:\s*var\(--font-mono\)/.test(r.body))
  const recents = all.some((r) => /(^|,)\s*\.launcher__recents\s*(,|$)/.test(r.sel))
  ok('launcher.1', 'the wordmark in the UI face, the doors as soft cards with the name at --t-lg, no > prompt glyph, mono only on .launcher__verb-command, a recents row',
    wordmark && doorOk && doorName && noPrompt && command && recents, JSON.stringify({ wordmark, doorOk, doorName, noPrompt, command, recents }))
}

// M175 — material.1. PALETTE AND SHEETS, one material: rows and controls at
// --t-md in the UI face (the brief's own ramp — 13px is a row, 14px is prose),
// mono ONLY on the palette's path rows and the sheet's `--mono` inputs, the
// section headings in caps tracking, the palette's state a DOT with the word
// clipped beside it (the rest rule; the word stays for data-state-word).
{
  const monoRules = all.filter((r) => /\.palette__|\.sheet__/.test(r.sel) && /font(?:-family)?\s*:[^;}]*--font-mono/.test(r.body)).map((r) => r.sel.trim())
  const monoOk = monoRules.every((sel) => /--mono|__fill-name|__fill-input|__preview|__suggestion/.test(sel)) // the suggestion row holds a path
  const section = all.some((r) => /(^|,)\s*\.palette__section\s*(,|$)/.test(r.sel) && /letter-spacing:\s*var\(--track-caps\)/.test(r.body))
  const state = all.some((r) => /(^|,)\s*\.palette__state\s*(,|$)/.test(r.sel) && /position:\s*absolute/.test(r.body) && /clip/.test(r.body))
  const dot = all.some((r) => /\.palette__state-dot\b/.test(r.sel) && /border-radius:\s*50%/.test(r.body))
  const label = all.some((r) => /(^|,)\s*\.sheet__label\s*(,|$)/.test(r.sel) && /letter-spacing:\s*var\(--track-caps\)/.test(r.body))
  ok('material.1', 'the palette and sheets: mono only on path rows and --mono inputs, caps section headings and sheet labels, the palette\'s state a dot with the word clipped',
    monoOk && section && state && dot && label, JSON.stringify({ monoRules, section, state, dot, label }))
}

// M176 — motion.2. MOTION WITH INTENT: every transition and animation in the
// stylesheet runs on a token — --dur-1 (a reveal), --dur-2 (an arrival),
// --dur-breath (the needs-you pulse and the caret), --dur-stagger (the ⌘G
// grid's per-cell delay, M179) — never a literal, in the shorthands AND the
// longhands (`animation-delay` carried eight literals the first regex could
// not see; the Act IV verifier); the panel's arrival keyframe is a RISE on
// --dur-2 — the brief's scale from .98 was DECLINED in M178: `.pf__motion`
// is an ancestor of `.pf__body`, and a scale there broke the annotation
// stage (product annot.1); only the moments' keyframes are declared (the
// arrival, the palette's rise, the pulse, the caret, the trail card's
// arrival, the ⌘G grid's rise); the reduced-motion block exists (check 9).
{
  // `0ms` and `.01ms` are the reduced-motion block's own values — no motion is
  // not a duration; every other literal is a duration that escaped the tokens.
  const literal = [...bare.matchAll(/(?:transition|animation|transition-duration|transition-delay|animation-duration|animation-delay)\s*:[^;}]*?(\d*\.?\d+m?s)\b/g)].filter((m) => !/^(0m?s|\.01ms)$/.test(m[1])).map((m) => m[0].replace(/\s+/g, ' ').slice(0, 60))
  // A RISE, not a scale: a scale on .pf__motion (an ancestor of .pf__body) broke product annot.1 — declined in the ledger.
  const spawn = /@keyframes\s+panel-enter\s*\{[^}]*translateY\(8px\)/.test(bare) && !/@keyframes\s+panel-enter\s*\{[^}]*scale\(/.test(bare) && all.some((r) => /\.panel__motion--entering/.test(r.sel) && /animation:[^;]*panel-enter[^;]*var\(--dur-2\)/.test(r.body))
  const breath = /--dur-breath:\s*1\.2s/.test(bare)
  const names = [...bare.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]).sort()
  // navgrid-cell-enter: the ⌘G grid's cells rising (M44) — an overlay's arrival, the palette's family.
  const allowed = ['chat-caret', 'navgrid-cell-enter', 'palette-enter', 'panel-enter', 'trail-card-in', 'wants-you-pulse']
  const stray = names.filter((n) => !allowed.includes(n))
  ok('motion.2', 'every transition and animation duration is a token (--dur-1 / --dur-2 / --dur-breath), the panel arrival is a rise on --dur-2 (never a scale above .pf__body), and only the moments\' keyframes are declared',
    literal.length === 0 && spawn && breath && stray.length === 0, JSON.stringify({ literal: literal.slice(0, 6), spawn, breath, stray }))
}

// M177 — empty.1. EMPTY STATES AS PLACES: one `.empty-state` rule — centred,
// the UI face, a glyph slot (`.empty-state__glyph`), the sentence and one
// verb — and no `__empty` or `.rail-empty` rule setting a mono face.
{
  const rule = all.find((r) => /(^|,)\s*\.empty-state\s*(,|$)/.test(r.sel))
  const centred = rule ? /text-align:\s*center/.test(rule.body) && /font-family:\s*var\(--font-ui\)/.test(rule.body) : false
  const glyph = all.some((r) => /\.empty-state__glyph\b/.test(r.sel))
  const verb = all.some((r) => /\.empty-state__verb\b/.test(r.sel))
  const monoEmpty = all.filter((r) => /__empty\b|\.rail-empty\b/.test(r.sel) && /--font-mono/.test(r.body)).map((r) => r.sel.trim())
  ok('empty.1', 'one centred .empty-state rule in the UI face with a glyph slot and a verb, and no empty-state rule in mono',
    centred && glyph && verb && monoEmpty.length === 0, JSON.stringify({ centred, glyph, verb, monoEmpty }))
}

// M178 — tree.1 (F.4). The Files heading keeps the ROOT's name: the
// `.shell__tree-root` span never shrinks (flex-shrink 0) up to a ceiling,
// and the panel attribution beside it (`.shell__tree-panel`) is the span
// that gives (flex-grow, flex-shrink, min-width 0). The first M178 wave
// wrote a 3ch FLOOR on a shrinking root — and 3ch is exactly `R…`, the
// failure it meant to fix — under a pre-M178 min-width: 0 that overrode it
// anyway; the critic read `R…` on navigator-files while the audit said FIXED.
{
  const root = all.find((r) => r.sel.trim() === '.shell__tree-root')
  const panel = all.find((r) => r.sel.trim() === '.shell__tree-panel')
  const rb = root ? root.body : ''
  const pb = panel ? panel.body : ''
  const rootFixed = /flex:\s*0\s+0\s+auto/.test(rb) && !/flex-shrink:\s*[1-9]/.test(rb)
  const ceiling = /max-width:\s*\d+%/.test(rb)
  const panelGives = /flex:\s*1\s+1\s+0/.test(pb) && /min-width:\s*0/.test(pb)
  ok('tree.1', 'the Files heading keeps the root\'s name — .shell__tree-root never shrinks (flex 0 0 auto) up to a ceiling, and .shell__tree-panel beside it is the span that gives (flex 1 1 0, min-width 0)',
    rootFixed && ceiling && panelGives, JSON.stringify({ rootFixed, ceiling, panelGives }))
}

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
