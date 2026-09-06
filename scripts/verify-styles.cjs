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
  const hintZ = Number((/\.hint-strip\s*\{[^}]*z-index:\s*(\d+)/.exec(bare) || [])[1])
  const hudOpaque = /\.canvas-hud\s*\{[^}]*background:\s*var\(--s-[0-9]\)/.test(bare)
  const drawerTop = drawer ? /top:\s*var\(--shell-top-h\)/.test(drawer[1]) : false
  const drawerBottom = drawer ? /bottom:\s*0\b/.test(drawer[1]) : false
  ok('compact.1', 'the compact drawers run from the top bar to the bottom, under the status strip and the hint strip, which sit on an opaque ground',
    Number.isFinite(drawerZ) && hudZ > drawerZ && hintZ > drawerZ && hudOpaque && drawerTop && drawerBottom,
    JSON.stringify({ drawerZ, hudZ, hintZ, hudOpaque, drawerTop, drawerBottom }))
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
  ok('ground.1', 'the canvas ground is flat: no gradient, no --dot token',
    canvas !== null && !/gradient/.test(canvasBg) && dotUses === 0 && dotDeclared === 0,
    JSON.stringify({ canvasBg: canvasBg.slice(0, 80), dotUses, dotDeclared }))

  const restingUses = bodyRules.filter((r) => /var\(--e-[12]\)/.test(r.body)).map((r) => r.sel)
  const OVERLAY = /\.palette\b|\.dock__popover|\.shell--(nav|ctx)-drawer|\.diagnostics-overlay|\.sheet__suggestions/
  const overlayMisuse = bodyRules.filter((r) => /var\(--e-[34]\)/.test(r.body) && !OVERLAY.test(r.sel)).map((r) => r.sel)
  ok('shadow.1', 'no resting shadow: --e-1/--e-2 unused in the body, --e-3/--e-4 only on overlays',
    restingUses.length === 0 && overlayMisuse.length === 0,
    JSON.stringify({ restingUses: restingUses.slice(0, 6), overlayMisuse: overlayMisuse.slice(0, 6) }))

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

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
