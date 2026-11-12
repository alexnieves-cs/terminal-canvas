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

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
