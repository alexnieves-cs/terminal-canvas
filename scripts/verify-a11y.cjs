/* Run with: node scripts/verify-a11y.cjs
   M645. The second accessibility pass, pinned. Plain node: it reads SOURCE,
   because each fix is a one-attribute or one-character decision that a later
   edit can undo with no visual change and no other suite going red. The
   evidence for every line here was an axe-core 4.10 run over the web demo
   (light and dark, canvas, Sessions, Review, People, the palette and the
   four Settings panes) and a Tab walk from a fresh window; this suite holds
   what that run found fixed. It does not run axe: there is no browser in the
   plain-node tier, and an Electron suite would pin pixels this does not need. */
const { readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const check = (id, test) => {
  try { const r = test(); ok(id, r.pass, JSON.stringify(r.detail)) } catch (error) { ok(id, false, error.message) }
}

// a11y.guard.1 Radix's focus guards (two tabindex=0 spans at the ends of
// <body>) stay mounted for as long as a force-mounted menu does, which is
// always: the first Tab of a fresh window landed on an invisible span. Each
// content primitive reports its `open` to one counter, and the guards are
// tab stops only while that count is above zero.
check('a11y.guard.1 the menu, popover and dialog primitives all report open surfaces to the guard counter', () => {
  const files = ['Menu.tsx', 'Popover.tsx', 'Dialog.tsx'].map((f) => [f, read(`src/renderer/primitives/${f}`)])
  const missing = files.filter(([, s]) => !/import \{ useFocusGuardStops \} from '\.\/focus-guard-stops'/.test(s) || !/useFocusGuardStops\(open\)/.test(s)).map(([f]) => f)
  return { pass: missing.length === 0, detail: { missing } }
})
check('a11y.guard.2 the guards are -1 with nothing open and 0 with something open, counted, never one surface\'s own flag', () => {
  const s = read('src/renderer/primitives/focus-guard-stops.ts')
  return {
    pass: /openSurfaces > 0 \? 0 : -1/.test(s) && /\[data-radix-focus-guard\]/.test(s) && /if \(open\) openSurfaces \+= 1/.test(s) && /Math\.max\(0, openSurfaces - 1\)/.test(s),
    detail: { length: s.length }
  }
})

// a11y.landmark.1 A <header> outside <article>/<section> maps to the BANNER
// landmark, so every panel on the canvas was a second page header (axe
// landmark-banner-is-top-level, one per panel, and landmark-unique).
check('a11y.landmark.1 a panel\'s chrome strip is role="none", not a banner landmark', () => {
  const s = read('src/renderer/components/PanelFrame.tsx')
  return { pass: /<header ref=\{headerRef\} className="pf__chrome panel__chrome" role="none"/.test(s), detail: { found: (s.match(/<header[^>]*pf__chrome[^>]*>/) ?? [''])[0] } }
})
check('a11y.landmark.2 no live region is an <aside> (role="status" is not allowed on it)', () => {
  const s = read('src/renderer/shell/ResumeBanner.tsx')
  return { pass: !/<aside\b/.test(s) && (s.match(/role="status"/g) ?? []).length === 2, detail: { asides: (s.match(/<aside\b/g) ?? []).length } }
})

// a11y.heading.1 Sessions, Review, Orchestrate and Settings print their own
// h1; the canvas with objects on it had none (axe page-has-heading-one). Its
// h1 sits in the top bar's banner (a heading outside a landmark is axe
// `region`) and only while the canvas is the view, so no view has two.
check('a11y.heading.1 the top bar carries one visually hidden h1, shown only on the canvas view', () => {
  const top = read('src/renderer/shell/TopBar.tsx')
  return { pass: (top.match(/<h1\b/g) ?? []).length === 1 && /\{centerView === 'canvas' && <h1 className="sr-only">Canvas<\/h1>\}/.test(top), detail: { h1: (top.match(/<h1[^>]*>[^<]*<\/h1>/g) ?? []) } }
})
check('a11y.heading.2 the inspector\'s section headings are h2', () => {
  const s = read('src/renderer/shell/Inspector.tsx')
  const h3 = (s.match(/<h3 className="inspector__section-heading/g) ?? []).length
  const h2 = (s.match(/<h2 className="inspector__section-heading/g) ?? []).length
  return { pass: h3 === 0 && h2 > 0, detail: { h2, h3 } }
})

// a11y.ink.1 State text measured 2.8 to 3.6 to 1 on the light ground. A tone
// is tuned as paint (dot, rim, wash); text takes it pulled towards the ink,
// derived from --tone so the colour still comes only from the Tone.
check('a11y.ink.1 state text in Sessions is the tone mixed towards the ink, and the selected palette hint steps up to --fg-2', () => {
  const s = read('src/renderer/styles.css')
  const w = s.slice(s.indexOf('/* ── st:W ── */'), s.indexOf('/* ── /st:W ── */'))
  return {
    pass: /\.sessions-state,\s*\.sessions-card__sentence \{ color: color-mix\(in oklab, var\(--tone\) \d+%, var\(--fg\)\); \}/.test(w) && /\.palette__row--selected \.palette__hint \{ color: var\(--fg-2\); \}/.test(w),
    detail: { fence: w.length }
  }
})

// a11y.name.1 A button whose label is two spans in a flex row was read as one
// run-together word ("vitest watchidle", "3needs you", "CanvasArrange and
// work"). A literal space between them paints nothing in a flex row and puts
// the gap back in the accessible name.
check('a11y.name.1 the rail row, the live status and the centre switch keep a space between their two words', () => {
  const rail = read('src/renderer/shell/RailPanelRow.tsx')
  const live = read('src/renderer/shell/LiveStatus.tsx')
  const top = read('src/renderer/shell/TopBar.tsx')
  const detail = {
    rail: /\{' '\}\s*<span className="rail-row__tail"/.test(rail),
    live: (live.match(/<span className="live-status__count">\{\w+\}<\/span>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?\{' '\}/g) ?? []).length,
    top: (top.match(/<\/span>\{' '\}<span className="shell__center-purpose">/g) ?? []).length
  }
  return { pass: detail.rail && detail.live === 2 && detail.top === 3, detail }
})

// ── M646 (unslop). The polish pass that took out the tells that make an
// interface read as generated: neon glows on chrome, a 3D flip-in, a bouncy
// overshoot, and copy that hangs every second clause off an em dash. Each
// was one declaration or one string, so each is pinned here as source.
const css = read('src/renderer/styles.css').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (sel) => {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(css)) !== null) if (m[1].split(',').some((x) => x.trim() === sel)) out.push(m[2])
  return out
}
// unslop.glow.1 Chrome does not spill light. The current dock place, the
// search field's hover and an agent's glyph each carried a blurred box-shadow
// of the accent; needs-you is the one tone that glows (rd-tone.glow.1), and a
// halo on navigation competed with it.
check('unslop.glow.1 the dock\'s current place, the search hover and the agent glyph carry no blurred glow', () => {
  // A shadow's THIRD length is its blur; `0 0 0 1px` is a hairline ring, `0 0 12px` a glow.
  const blurred = (body) => (/box-shadow:([^;]*)/.exec(body)?.[1] ?? '').split(/,(?![^(]*\))/)
    .some((sh) => { const n = sh.replace(/color-mix\([^)]*\)|var\([^)]*\)|inset/g, '').match(/-?[\d.]+(px)?/g) ?? []; return n.length >= 3 && parseFloat(n[2]) > 0 })
  const detail = {
    dock: rule('.dock__button--on').filter(blurred).length,
    search: rule('.shell__top .shell__search:hover').filter(blurred).length,
    glyph: rule('.pf--kind-terminal .pf__state--kind[data-agent-glyph]').filter(blurred).length
  }
  return { pass: detail.dock === 0 && detail.search === 0 && detail.glyph === 0 && rule('.dock__button--on').length > 0, detail }
})
// unslop.dock.1 The labelled dock's buttons are rows. `.icon-button` is an
// inline-grid that centres its items, so expanded, the icon sat ABOVE its
// name and the two rows overflowed the 32px button into the next one.
check('unslop.dock.1 an expanded dock button is a flex row with a gap, so the icon sits beside its name', () => {
  const body = rule('.shell[data-dock="expanded"] .dock__button').join(';')
  return { pass: /display:\s*flex/.test(body) && /align-items:\s*center/.test(body) && /gap:\s*var\(--sp-/.test(body), detail: { body } }
})
// unslop.motion.1 Arrivals decelerate into place and stop. The success pop
// overshot to 1.06 and sprang back; the Watch callout flipped in on rotateX.
check('unslop.motion.1 the verified pop never overshoots and the callout rises without a 3D flip', () => {
  const pop = /@keyframes integration-verified-pop\s*\{([\s\S]*?)\}\s*\}/.exec(css)?.[1] ?? ''
  const scales = [...pop.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]))
  const rise = /@keyframes orch-callout-rise[^\n]*/.exec(css)?.[0] ?? ''
  return { pass: scales.length > 0 && Math.max(...scales) <= 1 && rise !== '' && !/rotate/.test(rise), detail: { scales, rise } }
})
// unslop.copy.1 The empty states and the blank canvas's purpose are written
// as sentences. An em dash joining two clauses is the most recognisable tell
// of generated copy; a full stop or a semicolon says the same thing.
check('unslop.copy.1 no empty-state sentence and no blank-canvas line joins its clauses with an em dash', () => {
  const s = read('src/shared/empty-states.ts')
  const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const strings = [...code.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)].map((m) => m[1]).filter((x) => /[—]/.test(x))
  // orch-activity is a template that composes NO_RECENT_EVENTS with \u2014; it is the Orchestrate feed's, read by verify:orchestration.
  return { pass: strings.length === 0, detail: { strings } }
})

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
