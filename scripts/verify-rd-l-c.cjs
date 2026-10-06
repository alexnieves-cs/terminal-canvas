/* Lane L-C (M444). Plain node. Ids stay scoped.

   rd-l-c.0 stays: the seam (markers, contracts, ownership) is still the
   registration proof.

   Watched red before the modules grew the exports below: rd-l-c.0 passed,
   then `TypeError: M.planStatusSentence is not a function` (esbuild bundled
   the missing names as undefined). Restored by writing those functions. */
'use strict'
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

const css = read('src/renderer/styles.css')
const contracts = read('src/shared/redesign-contracts.ts')
const own = JSON.parse(read('docs/redesign/ownership.json'))
const open = '/* ── rd:L-C ── */'
const close = '/* ── /rd:L-C ── */'
ok('rd-l-c.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['L-C']) && own.lanes['L-C'].some((g) => g.endsWith('verify-rd-l-c.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const span = css.slice(css.indexOf(open), css.indexOf(close))
const canvas = read('src/renderer/canvas/Canvas.tsx') || ''
const viewportHook = read('src/renderer/canvas/useViewport.ts') || ''
const commands = read('src/renderer/palette/commands.ts') || ''
const usePalette = read('src/renderer/palette/usePalette.ts') || ''
const minimap = read('src/renderer/canvas/MinimapOverlay.tsx') || ''
const hud = read('src/renderer/canvas/CanvasHud.tsx') || ''
const lod = read('src/renderer/canvas/lod.ts') || ''
const navigate = read('src/renderer/palette/navigate-tier.tsx') || ''

const OUT = join(ROOT, 'out', 'verify', 'rd-l-c.cjs')
buildSync({
  stdin: {
    contents: `
      export { planStatusSentence } from '../src/renderer/canvas/card-detail'
      export { viewportAtScale, tierFlightMs, easeOut, tierAnchor, selectionCentre, chordCode, navigateAccelerators } from '../src/renderer/canvas/flight'
      export { cyclePaletteKind, commandBand, filterByKind, bandHeaderAt, panelIdOfGoto, kindChipLabel } from '../src/renderer/palette/palette-model'
      export { enterTier, TIER_TARGET } from '../src/renderer/canvas/zoom-tier'
      export { assignTiers, LIVE_BUDGET, LIVE_MIN_SCALE } from '../src/renderer/canvas/lod'
      export { minimapHeader } from '../src/renderer/canvas/card-detail'
      export { emptyState } from '../src/shared/empty-states'
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-l-c-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: {
    '@shared': join(ROOT, 'src', 'shared'),
    '@renderer': join(ROOT, 'src', 'renderer')
  },
  logLevel: 'silent'
})
const M = require(OUT)

ok('rd-l-c.sentence.1 the plan sentence is the last line, else the state word',
  M.planStatusSentence('working', 'Writing tests for streamCsv') === 'Writing tests for streamCsv' &&
  M.planStatusSentence('working', '  ') === 'working' &&
  M.planStatusSentence('needs you', null) === 'needs you' &&
  M.planStatusSentence('idle', 'line one\nline two') === 'line one line two',
  M.planStatusSentence('working', 'Writing tests for streamCsv'))

{
  const from = { x: 40, y: 80, scale: 1 }
  const anchor = { x: 200, y: 100 }
  const to = M.viewportAtScale(from, 0.34, anchor)
  const worldBefore = { x: (anchor.x - from.x) / from.scale, y: (anchor.y - from.y) / from.scale }
  const worldAfter = { x: (anchor.x - to.x) / to.scale, y: (anchor.y - to.y) / to.scale }
  ok('rd-l-c.flight.1 a tier flight keeps the anchor and takes 220ms, or one frame when reduced',
    Math.abs(to.scale - 0.34) < 1e-9 &&
    Math.abs(worldBefore.x - worldAfter.x) < 1e-6 &&
    Math.abs(worldBefore.y - worldAfter.y) < 1e-6 &&
    M.tierFlightMs(false) === 220 &&
    M.tierFlightMs(true) === 0 &&
    M.easeOut(0) === 0 && M.easeOut(1) === 1 && M.easeOut(0.5) > 0.5 &&
    /--dur-flight:\s*220ms/.test(css),
    `scale ${to.scale} ms ${M.tierFlightMs(false)}`)
}

{
  const size = { width: 800, height: 600 }
  const cursor = M.tierAnchor(size, { x: 12, y: 20 }, { x: 400, y: 300 })
  const selected = M.tierAnchor(size, null, { x: 400, y: 300 })
  const centre = M.tierAnchor(size, null, null)
  const box = M.selectionCentre(
    [{ id: 'a', x: 0, y: 0, w: 100, h: 40 }, { id: 'b', x: 200, y: 80, w: 50, h: 20 }],
    new Set(['a', 'b'])
  )
  ok('rd-l-c.flight.2 the anchor is the cursor, else the selection, else the centre',
    cursor.x === 12 && cursor.y === 20 &&
    selected.x === 400 && selected.y === 300 &&
    centre.x === 400 && centre.y === 300 &&
    box !== null && box.x === 125 && box.y === 50,
    JSON.stringify({ cursor, selected, centre, box }))
}

{
  const accel = M.navigateAccelerators()
  const bare = M.chordCode({ key: '0', code: '' })
  const shifted = M.chordCode({ key: ')', code: 'Digit0' })
  ok('rd-l-c.chord.1 the registry names fit-all, work and tidy, and a bare key still finds the digit',
    accel.fitAll === 'CmdOrCtrl+0' &&
    accel.work === 'CmdOrCtrl+1' &&
    accel.plan === 'CmdOrCtrl+2' &&
    accel.map === 'CmdOrCtrl+3' &&
    accel.fitTask === 'Shift+CmdOrCtrl+0' &&
    accel.tidy === 'Shift+CmdOrCtrl+T' &&
    accel.tidyAlias === 'CmdOrCtrl+Alt+T' &&
    bare === 'Digit0' && shifted === 'Digit0' &&
    /matchShortcut\(/.test(viewportHook) &&
    /electronAccelerator\(/.test(viewportHook) &&
    !/case '0':/.test(viewportHook) &&
    !/case '1':/.test(viewportHook),
    JSON.stringify(accel))
}

{
  const pids = new Map([['a', 145], ['b', 148]])
  const before = JSON.stringify([...pids])
  const rects = [
    { id: 'a', x: 0, y: 0, w: 200, h: 120 },
    { id: 'b', x: 240, y: 0, w: 200, h: 120 }
  ]
  const size = { width: 1200, height: 800 }
  const at = (scale, prev, focusedId) => {
    const entry = M.enterTier({ scale, prev, focusedId, panelIds: ['a', 'b'] })
    const tiers = M.assignTiers({
      rects,
      viewport: { x: 0, y: 0, scale },
      size,
      focusedId: entry.releaseFocus ? null : focusedId,
      lastFocusedAt: {},
      cardIds: entry.cardIds
    })
    return { entry, tiers }
  }
  const work = at(M.TIER_TARGET.work, undefined, 'a')
  const plan = at(0.6, 'work', 'a')
  const map = at(M.TIER_TARGET.map, 'plan', null)
  const dormant = M.assignTiers({
    rects, viewport: { x: 0, y: 0, scale: 1 }, size,
    focusedId: 'a', lastFocusedAt: {},
    dormantIds: new Set(['a']), cardIds: new Set()
  })
  ok('rd-l-c.pid.1 work, plan and map keep the same pids and card plan above the live floor',
    JSON.stringify([...pids]) === before &&
    work.entry.tier === 'work' && work.entry.releaseFocus === false && work.tiers.a === 'live' &&
    plan.entry.tier === 'plan' && plan.entry.releaseFocus === true &&
    plan.entry.cardIds.has('a') && plan.entry.cardIds.has('b') &&
    plan.tiers.a === 'card' && plan.tiers.b === 'card' &&
    map.entry.tier === 'map' && map.tiers.a === 'card' && map.tiers.b === 'card' &&
    dormant.a === 'card' &&
    M.LIVE_BUDGET === 8 && M.LIVE_MIN_SCALE === 0.5 &&
    /export const LIVE_BUDGET = 8/.test(lod) &&
    /export const LIVE_MIN_SCALE = 0\.5/.test(lod) &&
    /enterTier\(/.test(navigate) &&
    !/registry\.dispose\(/.test(navigate) &&
    !/pty\.kill/.test(navigate),
    JSON.stringify({ work: work.tiers, plan: plan.tiers, map: map.tiers, dormant: dormant.a }))
}

{
  const rows = [
    { id: 'panel.goto.plaid', title: 'plaid', group: 'panel', pathText: undefined },
    { id: 'panel.goto.stream', title: 'streamCsv.ts', group: 'panel', pathText: '/repo/streamCsv.ts' },
    { id: 'canvas.fit', title: 'Fit all', group: 'canvas' },
    { id: 'task.lead', title: 'Steward', group: 'task' }
  ]
  const everything = M.filterByKind(rows, 'everything')
  const files = M.filterByKind(rows, 'files')
  const commands = M.filterByKind(rows, 'commands')
  ok('rd-l-c.kind.1 kinds cycle and a path row is files',
    M.cyclePaletteKind('everything') === 'panels' &&
    M.cyclePaletteKind('panels') === 'commands' &&
    M.cyclePaletteKind('commands') === 'files' &&
    M.cyclePaletteKind('files') === 'everything' &&
    M.kindChipLabel('everything') === 'Everything' &&
    M.commandBand(rows[0]) === 'panels' &&
    M.commandBand(rows[1]) === 'files' &&
    M.commandBand(rows[2]) === 'commands' &&
    M.commandBand(rows[3]) === 'panels' &&
    everything.length === rows.length &&
    files.length === 1 && files[0].id === 'panel.goto.stream' &&
    commands.length === 1 && commands[0].id === 'canvas.fit' &&
    M.panelIdOfGoto(rows[0]) === 'plaid' &&
    M.panelIdOfGoto(rows[2]) === null &&
    M.bandHeaderAt(rows, 0, 'everything') === 'Panels & tasks' &&
    M.bandHeaderAt(rows, 2, 'everything') === 'Commands' &&
    M.bandHeaderAt(rows, 1, 'everything') === null,
    M.bandHeaderAt(rows, 0, 'everything'))
}

ok('rd-l-c.minimap.1 the header counts tasks and the empty canvas has no zero',
  M.minimapHeader(5) === 'MAP · 5 TASKS' &&
  M.minimapHeader(1) === 'MAP · 1 TASK' &&
  M.minimapHeader(0) === 'MAP' &&
  !/\d/.test(M.minimapHeader(0)) &&
  M.emptyState('minimap').sentence === 'Nothing placed yet' &&
  /emptyState\('minimap'\)/.test(minimap) &&
  /minimapHeader\(/.test(minimap),
  M.minimapHeader(5))

ok('rd-l-c.settings.1 Open Settings calls openSettingsPage and Manage settings stays',
  /title: 'Open Settings'/.test(commands) &&
  /openSettingsPage\(/.test(commands) &&
  /id: 'canvas\.settings'/.test(commands) &&
  /title: 'Manage settings…'/.test(commands) &&
  /id: 'manage\.settings'/.test(commands),
  'palette row')

{
  // The ⌘F branch preventDefaults earlier in the file. The lock belongs to
  // the ⌘K branch, which starts at the key test.
  const branch = usePalette.slice(usePalette.indexOf("event.key !== 'k'"))
  ok('rd-l-c.lock.1 focus lock returns before Cmd+K is swallowed',
    /if \(focusLocked\(\)\) return/.test(branch) &&
    branch.indexOf('if (focusLocked()) return') < branch.indexOf('event.preventDefault()'),
    'early return')
}

{
  const slot = canvas.indexOf('<TierLayer')
  const mount = canvas.indexOf('<NavigateTier')
  ok('rd-l-c.slot.1 the tier mount sits on the TierLayer slot',
    slot >= 0 && mount > slot && mount - slot < 800 &&
    /data-navigate-tier/.test(navigate) &&
    /requestTier\(/.test(hud) &&
    /data-zoom-tier="plan"/.test(span) &&
    /data-zoom-tier="map"/.test(span),
    `slot ${slot} mount ${mount}`)
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
