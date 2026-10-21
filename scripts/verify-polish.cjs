/* Lane F (M510–M519) — visual and motion polish. Plain node: the stylesheet
   and the primitives read as text. Each check names the silent failure it
   exists for; ids are scoped (polish.*). */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const css = read('src/renderer/styles.css')
const open = '/* ── st:F ── */'
const close = '/* ── /st:F ── */'
const block = css.slice(css.indexOf(open), css.indexOf(close))
// Comments out, so a rule quoted in prose never counts as a rule.
const rules = block.replace(/\/\*[\s\S]*?\*\//g, '')

// polish.fence.1 — the lane writes CSS only inside its fence; a missing
// marker makes the edit hook refuse every edit, silently stalling the lane.
ok('polish.fence.1 styles.css has exactly one st:F fence, in order',
  css.split(open).length === 2 && css.split(close).length === 2 && css.indexOf(close) > css.indexOf(open),
  JSON.stringify({ open: css.split(open).length - 1, close: css.split(close).length - 1 }))

// polish.motion.1 — every animation this lane adds has a reduced-motion
// branch. A missing one is invisible on the machine that wrote it.
{
  const reduce = [...rules.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/g)].map((m) => m[1]).join('\n')
  const animated = [...rules.matchAll(/([^{}]+)\{[^{}]*\banimation:\s*(?!none)[^;]+;[^{}]*\}/g)]
    .map((m) => m[1].trim()).filter((sel) => !/^@/.test(sel) && !/prefers-reduced-motion/.test(sel))
  const missing = animated.filter((sel) => !reduce.includes(sel.split(',')[0].trim()))
  ok('polish.motion.1 every animation in st:F has a prefers-reduced-motion: reduce branch in st:F',
    reduce.length > 0 && missing.length === 0, JSON.stringify({ animated, missing }))
}

// polish.tokens.1 — the state tier is one number in CSS and script.
{
  const dur = Number((rules.match(/--dur-state:\s*(\d+)ms/) || [])[1])
  const js = Number((read('src/renderer/motion.ts').match(/export const MOTION_STATE_MS = (\d+)/) || [])[1])
  const spring = /--ease-spring:\s*linear\(/.test(rules)
  ok('polish.tokens.1 --dur-state equals MOTION_STATE_MS, and --ease-spring is a CSS linear() easing',
    dur > 0 && dur === js && spring, JSON.stringify({ dur, js, spring }))
}

// polish.thumb.1 — one sliding thumb per control. Both primitives measure
// through the hook; the thumb transitions only once "live" (so it never
// slides in from x = 0 on mount); the positioning rules stay at zero
// specificity, or they would un-centre the page switch and un-clip its
// hidden Orchestrate option (rd:F3).
{
  const seg = read('src/renderer/primitives/SegmentedControl.tsx')
  const tabs = read('src/renderer/primitives/Tabs.tsx')
  const hook = read('src/renderer/primitives/useSlidingThumb.ts')
  const uses = /useSlidingThumb<HTMLDivElement>\(value, '\.seg__btn\[aria-pressed="true"\]'\)/.test(seg) && /ref=\{thumb\}/.test(seg) &&
    /useSlidingThumb<HTMLDivElement>\(value, '\.tab\[aria-selected="true"\]'\)/.test(tabs) && /ref=\{thumb\}/.test(tabs)
  const layout = /offsetLeft/.test(hook) && !/getBoundingClientRect\(/.test(hook) && /'live'/.test(hook) && /ResizeObserver/.test(hook)
  const liveOnly = !/\.seg\[data-thumb\]::before\s*\{[^}]*transition/.test(rules) && /\.seg\[data-thumb="live"\]::before[\s\S]*?transition:\s*transform var\(--dur-2\)/.test(rules)
  const positioned = /:where\(\.seg\[data-thumb\], \.tabs\[data-thumb\]\)\s*\{\s*position:\s*relative/.test(rules) && !/(^|\n)\s*\.seg\[data-thumb\]\s*\{[^}]*position/.test(rules)
  ok('polish.thumb.1 the segmented control and tabs share one measured thumb that slides only once live, positioned at zero specificity',
    uses && layout && liveOnly && positioned, JSON.stringify({ uses, layout, liveOnly, positioned }))
}

// polish.topbar.1 — the search field may not reach under the absolutely
// centred page switch (M511, measured on rd-empty/rd-onboarding/rd-sessions).
ok('polish.topbar.1 the top bar search is capped at the page switch\'s right edge, and the empty canvas note stacks above the zoom bar',
  /\.shell__top \.shell__search\s*\{\s*max-width:\s*clamp\(120px,\s*calc\(50% - \d+px\),\s*560px\);\s*margin-inline:\s*auto 0;/.test(rules) &&
    /\.rd-empty__minimap\s*\{\s*bottom:\s*calc\([^;]*--nav-hud-h/.test(rules),
  'st:F rules')

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
