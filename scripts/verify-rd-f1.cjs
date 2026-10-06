/* Lane F1 (M436). The seam check stays. The rd-tone checks read the pure
   palette and the stylesheet as text — no Electron, no DOM.

   Watched red before the theme blocks and panel-state moved, then green
   after. Each id's comment says what the red run showed. */
'use strict'
const { readFileSync, readdirSync, statSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const cssPath = join(ROOT, 'src', 'renderer', 'styles.css')
const cssRaw = readFileSync(cssPath, 'utf8')
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const contracts = readFileSync(join(ROOT, 'src', 'shared', 'redesign-contracts.ts'), 'utf8')
const own = JSON.parse(readFileSync(join(ROOT, 'docs', 'redesign', 'ownership.json'), 'utf8'))
const open = '/* ── rd:F1 ── */'
const close = '/* ── /rd:F1 ── */'
ok('rd-f1.0 seam present',
  cssRaw.includes(open) && cssRaw.indexOf(close) > cssRaw.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['F1']) && own.lanes['F1'].some((g) => g.endsWith('verify-rd-f1.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify')
mkdirSync(OUT, { recursive: true })
const alias = {
  '@shared': join(ROOT, 'src', 'shared'),
  '@renderer': join(ROOT, 'src', 'renderer')
}
buildSync({
  entryPoints: [join(ROOT, 'src', 'shared', 'state-palette.ts')],
  outfile: join(OUT, 'rd-f1-palette.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias
})
buildSync({
  entryPoints: [join(ROOT, 'src', 'renderer', 'panels', 'panel-state.ts')],
  outfile: join(OUT, 'rd-f1-panel-state.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias
})
const palette = require(join(OUT, 'rd-f1-palette.cjs'))
const panelState = require(join(OUT, 'rd-f1-panel-state.cjs'))

function rules (text) {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(text)) !== null) out.push({ sel: m[1].trim(), body: m[2] })
  return out
}
function props (body) {
  const map = {}
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim()
  return map
}
const all = rules(css)
const lightBody = (all.find((r) => /data-theme="light"/.test(r.sel)) || { body: '' }).body
const darkBody = (all.find((r) => /data-theme="dark"/.test(r.sel)) || { body: '' }).body
const light = props(lightBody)
const dark = props(darkBody)
const norm = (v) => String(v || '').replace(/\s+/g, '').toLowerCase()

// rd-tone.parity.1. Watched red: every --state-* token was absent from both
// theme blocks, so the first diff was `--state-working` missing on dark and
// light, and the accent aliases still held the pre-F1 hexes.
{
  const missing = []
  for (const [theme, block, name] of [[palette.STATE_PALETTE.dark, dark, 'dark'], [palette.STATE_PALETTE.light, light, 'light']]) {
    for (const token of palette.PALETTE_TOKENS) {
      if (norm(block[token]) !== norm(theme[token])) missing.push(`${name} ${token} css=${block[token] || 'absent'} palette=${theme[token]}`)
    }
    for (const [aliasName, token] of Object.entries(palette.ACCENT_ALIAS)) {
      if (norm(block[aliasName]) !== norm(theme[token])) missing.push(`${name} ${aliasName} css=${block[aliasName] || 'absent'} wanted ${theme[token]}`)
    }
  }
  // StateTone has no trailing semicolon (redesign-contracts.ts is types-only
  // and this lane does not edit it). Stop at the next declaration.
  const tones = (contracts.match(/export type StateTone\s*=\s*([\s\S]*?)(?=\n\n|\nexport|\n\/\*\*)/) || [, ''])[1]
  const named = [...tones.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
  const unmapped = named.filter((t) => !palette.TONE_TO_TOKEN[t] || !palette.PALETTE_TOKENS.includes(palette.TONE_TO_TOKEN[t]))
  const toneSet = [...panelState.TONES].sort().join(' ')
  const namedSet = [...named].sort().join(' ')
  ok('rd-tone.parity.1 theme hexes equal state-palette.ts for both themes, and every StateTone maps to one of those tokens',
    missing.length === 0 && named.length >= 9 && unmapped.length === 0 && namedSet === toneSet,
    missing.slice(0, 8).join('; ') || (unmapped.length ? `unmapped ${unmapped.join(' ')}` : `StateTone [${namedSet}] panel-state [${toneSet}]`))
}

// rd-tone.bind.1. Watched red: the tone block bound --blue, --amber, --green,
// --red, --muted and --line-strong. A var() that is not a --state-* token is
// the old split.
{
  const toneRules = all.filter((r) => /^\[data-tone(?:="[^"]+")?\]$/.test(r.sel.replace(/\s+/g, '')))
  const stray = []
  for (const r of toneRules) {
    for (const m of r.body.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (!m[1].startsWith('--state-')) stray.push(`${r.sel} ${m[1]}`)
    }
  }
  const covered = panelState.TONES.filter((t) => toneRules.some((r) => r.sel.includes(`"${t}"`) || (t === 'kind' && /data-tone="kind"/.test(r.sel))))
  ok('rd-tone.bind.1 the [data-tone] rules read only --state-* tokens',
    toneRules.length >= panelState.TONES.length && stray.length === 0 && covered.length === panelState.TONES.length,
    JSON.stringify({ rules: toneRules.length, stray: stray.slice(0, 8), missing: panelState.TONES.filter((t) => !covered.includes(t)) }))
}

// rd-tone.glow.1. Watched red: the far-tier `.pf::before` rule spilled
// `0 0 24px 6px` on every tone. Selection is excluded (D1's halo lives on
// --glow-iris, not in a tone rule). needs-you is the only tone that glows.
// data-edge-arriving is the interface's arrival flash, not a tone.
{
  const hasHalo = (body) => /filter\s*:/.test(body) || /box-shadow\s*:[^;]*\b0\s+0\s+(?!0px\b)(?!0\b)[\d.]+px/.test(body)
  const needs = (sel) => /data-tone="needs-you"|panel--agent-wants-you|landing-halo|wants-you/.test(sel)
  const selection = (sel) => /\.panel--selected\b/.test(sel)
  const otherTone = (sel) => /data-tone="(?!needs-you)[a-z-]+"/.test(sel) || /panel--agent-(?:busy|idle|exited|starting)\b/.test(sel)
  const stateEdge = (sel) => /\.pf::before\b/.test(sel)
  const bad = all.filter((r) => hasHalo(r.body) && !selection(r.sel) && !(needs(r.sel) && !otherTone(r.sel)) && (otherTone(r.sel) || (stateEdge(r.sel) && !needs(r.sel))))
    .map((r) => r.sel.replace(/\s+/g, ' ').slice(0, 140))
  ok('rd-tone.glow.1 no glow, box-shadow halo or filter applies to any tone except needs-you',
    bad.length === 0,
    bad.slice(0, 4).join(' | ') || 'clean')
}

// rd-tone.select.1. Watched red: --glow-iris was `0 0 0 1px var(--iris)`,
// a 1px ring in the working accent with no halo.
{
  const glow = (/--glow-iris:\s*([^;]+);/.exec(css) || [, ''])[1].replace(/\s+/g, ' ').trim()
  const ring = /0 0 0 2px var\(--state-select\)/.test(glow)
  const halo = /0 0 6px var\(--state-select\)/.test(glow)
  ok('rd-tone.select.1 selection is a 2px ring and a 6px halo in --state-select',
    ring && halo, glow || 'no --glow-iris')
}

// rd-tone.literal.1. Watched red twice. Before the theme blocks moved, the
// detail was "no palette hex in either theme block". After they moved, a
// stray `#5BE1E6` in StatusDot.tsx (outside a comment) failed this id on
// that file, and was removed. World files stay exempt until W0. Theme
// blocks may carry the hexes.
{
  const hexes = new Set(palette.stateHexes())
  const themeBodies = lightBody + '\n' + darkBody
  const themeHas = [...themeBodies.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase())
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
  const renderer = join(ROOT, 'src', 'renderer')
  const offenders = []
  for (const file of walk(renderer)) {
    const rel = file.slice(ROOT.length + 1).split('\\').join('/')
    if (rel.startsWith('src/renderer/world/')) continue
    if (!/\.(tsx?|css|js)$/.test(rel)) continue
    let text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    if (rel === 'src/renderer/styles.css') {
      text = text.replace(lightBody, '').replace(darkBody, '')
    }
    for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      if (hexes.has(m[0].toLowerCase())) offenders.push(`${rel}:${m[0]}`)
    }
  }
  const inTheme = themeHas.filter((h) => hexes.has(h))
  ok('rd-tone.literal.1 no state hex in src/renderer outside the theme blocks; world/ is exempt until W0',
    offenders.length === 0 && inTheme.length > 0,
    offenders.length ? offenders.slice(0, 8).join(', ') : `theme carries ${inTheme.length} palette hexes`)
}

// rd-tone.d7.1. Watched red: passed, work-done and auto-done all returned
// tone 'idle'. Words stay the words they were.
{
  const passedWatch = panelState.panelState({ kind: 'watcher', status: undefined, dormant: false, watch: { status: 'passed' } }, undefined)
  const done = panelState.panelState({ kind: 'work', status: undefined, dormant: false, work: { state: 'done' } }, undefined)
  const legend = panelState.MINIMAP_LEGEND
  const legendDone = legend.some((row) => row.tone === 'done')
  ok('rd-tone.d7.1 watcher passed, work done and auto done use the done tone; words stay; the minimap legend gains done',
    passedWatch.word === 'idle' && passedWatch.tone === 'done' &&
      done.word === 'done' && done.tone === 'done' &&
      panelState.autoTone('done') === 'done' && panelState.autoTone('running') === 'working' &&
      panelState.autoTone('stuck') === 'needs-you' && panelState.autoTone('stopped') === 'exited' &&
      legendDone,
    JSON.stringify({ passed: passedWatch, done, legend }))
}

const passedN = results.filter((r) => r.pass).length
console.log('\n' + passedN + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
