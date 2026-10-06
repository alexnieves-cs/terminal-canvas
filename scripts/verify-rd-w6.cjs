/* Lane W6 (M454). The seam check stays. The rest is the flat room and the
   doors both ways. The model lives in sessions-model and is re-exported
   from object-verbs so this bundle does not teach WorldFlat to import the
   palette. */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
const contracts = readFileSync(join(ROOT, 'src', 'shared', 'redesign-contracts.ts'), 'utf8')
const own = JSON.parse(readFileSync(join(ROOT, 'docs', 'redesign', 'ownership.json'), 'utf8'))
const open = '/* ── rd:W6 ── */'
const close = '/* ── /rd:W6 ── */'
ok('rd-w6.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['W6']) && own.lanes['W6'].some((g) => g.endsWith('verify-rd-w6.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const { buildSync } = require('esbuild')
const OUT = join(ROOT, 'out', 'verify', 'rd-w6.cjs')
buildSync({
  stdin: {
    contents: `
      import { roomKind, worldDoor, flatTerraceLayout, urgentFace, stageWorldDoor, viewInWorld, worldViewPaletteId } from '../src/renderer/canvas/object-verbs'
      import { panelFloor } from '../src/renderer/world/world-structure'
      import { canvasToFloor } from '../src/shared/world-space'
      import { agentWord } from '../src/renderer/panels/panel-state'
      import { hasArrival, takeArrival } from '../src/renderer/world/world-select'
      import { isWorldOn, setWorldOn, worldCameraTarget } from '../src/renderer/world/world-toggle'
      export { roomKind, worldDoor, flatTerraceLayout, urgentFace, stageWorldDoor, viewInWorld, worldViewPaletteId, panelFloor, canvasToFloor, agentWord, hasArrival, takeArrival, isWorldOn, setWorldOn, worldCameraTarget }
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-w6-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  alias: {
    '@shared': join(ROOT, 'src/shared'),
    '@renderer': join(ROOT, 'src/renderer')
  }
})
const M = require(OUT)

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const flat = read('src/renderer/world/WorldFlat.tsx')
const stage = read('src/renderer/world/WorldStage.tsx')
const verbs = read('src/renderer/canvas/object-verbs.ts')
const objects = read('src/renderer/canvas/palette-actions/objects.ts')
const sessions = read('src/renderer/sessions/SessionsTable.tsx') + read('src/renderer/sessions/SessionsHost.tsx') + read('src/renderer/sessions/SessionDetail.tsx')
const requests = read('docs/redesign/requests.md')
const w6css = css.slice(css.indexOf(open), css.indexOf(close))

// rd-w6.flat.1. Watched red: roomKind was not exported.
{
  ok('rd-w6.flat.1 a probe that says no, or a lost context, is the flat room; a live context is the scene',
    M.roomKind(false, false) === 'flat' && M.roomKind(false, true) === 'flat' && M.roomKind(true, true) === 'flat' && M.roomKind(true, false) === 'scene',
    [M.roomKind(false, false), M.roomKind(true, true), M.roomKind(true, false)].join())
}

// rd-w6.flat.2. The stage still mounts one WorldFlat only after the note, and
// the tile keeps Approve (RequestBlock) and Open in Canvas. Forcing the probe
// off is roomKind(false): the same predicate the stage's gate uses.
{
  const gate = stage.indexOf('webgl && !lost ? (')
  const note = stage.indexOf('data-world-no-webgl')
  const flatAt = stage.indexOf('<WorldFlat />')
  ok('rd-w6.flat.2 the flat branch is the probe\'s no and a lost context, and its doors are Approve and Open in Canvas',
    M.roomKind(false, false) === 'flat' && gate > 0 && note > gate && flatAt > note && (stage.match(/<WorldFlat /g) ?? []).length === 1 &&
      /\{waiting \? <RequestBlock agentId=\{agentId\} \/> : null\}/.test(flat) && /data-world-open>Open in Canvas</.test(flat) &&
      /data-world-flat-terrace=/.test(flat) && /takeArrival\(/.test(flat),
    'gate/doors')
}

// rd-w6.flat.3. Context loss sets lost and never removes the canvas host.
{
  ok('rd-w6.flat.3 a lost context falls back inside the layer and does not unmount the 2D canvas',
    /const onLost = useCallback\(\(\) => \{ if \(onRef\.current\) setLost\(true\) \}, \[\]\)/.test(stage) &&
      /data-world-canvas-kept/.test(stage) && !/hostRef\.current\.remove\(/.test(stage) && !/unmountComponentAtNode/.test(stage) &&
      /hostRef\.current/.test(stage),
    'host stays')
}

// rd-w6.door.1. A panel door is that panel's floor point, that agent first.
{
  const panel = { id: 'codex', x: 100, y: 200, w: 100, h: 80 }
  const other = { id: 'claude', x: 0, y: 0, w: 80, h: 80 }
  const region = { id: 'ledger', x: 0, y: 0, w: 400, h: 400 }
  const door = M.worldDoor('codex', 'panel', [other, panel], [region])
  const floor = M.panelFloor(panel)
  const same = door.floor !== null && door.floor.x === floor.x && door.floor.z === floor.z
  ok('rd-w6.door.1 View in World on a panel lands on that panel\'s floor point with that agent first',
    same && JSON.stringify(door.agentIds) === JSON.stringify(['codex']) &&
      M.canvasToFloor({ x: 150, y: 240 }).x === floor.x && M.canvasToFloor({ x: 150, y: 240 }).z === floor.z,
    JSON.stringify(door))
}

// rd-w6.door.2. A task door uses the terrace centre and names every member, the asked panel first.
{
  const panel = { id: 'codex', x: 200, y: 200, w: 40, h: 40 }
  const other = { id: 'claude', x: 10, y: 10, w: 40, h: 40 }
  const outside = { id: 'other', x: 900, y: 900, w: 40, h: 40 }
  const region = { id: 'ledger', x: 0, y: 0, w: 400, h: 400 }
  const door = M.worldDoor('codex', 'task', [other, outside, panel], [region])
  const floor = M.panelFloor(region)
  ok('rd-w6.door.2 View in World on a task lands on the terrace centre and picks the asked agent ahead of the other members',
    door.floor !== null && door.floor.x === floor.x && door.floor.z === floor.z &&
      JSON.stringify(door.agentIds) === JSON.stringify(['codex', 'claude']),
    JSON.stringify(door))
}

// rd-w6.door.3. Staging the door asks for the arrival and writes the floor target. The world is not turned on here: Sessions still has to leave its page first.
{
  M.setWorldOn(false)
  const panel = { id: 'codex', x: 100, y: 200, w: 100, h: 80 }
  const door = M.worldDoor('codex', 'panel', [panel], [])
  M.stageWorldDoor(door, 5000)
  const target = M.worldCameraTarget()
  const arrived = M.takeArrival((id) => id === 'codex', 5000)
  ok('rd-w6.door.3 staging a door requests that arrival and aims the floor target, and taking it clears the request',
    arrived === 'codex' && target.x === door.floor.x && target.z === door.floor.z && M.hasArrival() === false && M.isWorldOn() === false,
    JSON.stringify({ arrived, target, on: M.isWorldOn() }))
}

// rd-w6.door.4. The menu, the sessions row, and the palette action body.
{
  const rowId = M.worldViewPaletteId()
  ok('rd-w6.door.4 the panel menu, the Sessions row and the palette action all name View in World, and the palette id is the one R-080 asks commands.ts to spell',
    /label: 'View in World'/.test(verbs) && /viewInWorld\(panelId/.test(verbs) &&
      /data-session-world=/.test(sessions) && /Show in World/.test(sessions) &&
      /worldViewPaletteRow/.test(objects) && rowId === 'world.view' && /R-080/.test(requests) && /id: 'world\.view'/.test(requests),
    rowId)
}

// rd-w6.flat.4. Terrace tiles keep left-to-right order inside the host.
{
  const host = { w: 200, h: 100 }
  const boxes = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 50, y: 0, w: 10, h: 10 }]
  const placed = M.flatTerraceLayout(boxes, host)
  const a = placed.find((p) => p.id === 'a')
  const b = placed.find((p) => p.id === 'b')
  ok('rd-w6.flat.4 terrace tiles keep their canvas order and sit inside the flat host',
    a !== undefined && b !== undefined && a.left < b.left && a.left >= 0 && b.left + b.width <= host.w + 0.01 && a.top >= 0 && a.top + a.height <= host.h + 0.01 &&
      M.flatTerraceLayout([], host).length === 0,
    JSON.stringify(placed))
}

// rd-w6.flat.5. The urgent face is the queue's own order, via statePriority, not a second spelling.
{
  const needs = M.agentWord('wants-you')
  const idle = M.agentWord('idle')
  const face = M.urgentFace([idle, needs])
  ok('rd-w6.flat.5 a terrace\'s state is the most urgent member\'s word and tone',
    face !== null && face.word === needs.word && face.tone === needs.tone && M.urgentFace([]) === null,
    JSON.stringify(face))
}

// rd-w6.cross.1. Orchestrate's arrival is untouched. The flat room takes the same request.
{
  const canvas = read('src/renderer/canvas/Canvas.tsx')
  const view = read('src/renderer/world/WorldView.tsx')
  ok('rd-w6.cross.1 Orchestrate\'s View in World still requests an arrival before the page change, and the flat room takes that same arrival',
    /onViewInWorld=\{\(ids\) => \{\s*requestArrival\(ids, Date\.now\(\)\)\s*leaveForCanvas\(\)\s*requestAnimationFrame\(\(\) => setWorldOn\(true\)\)/.test(canvas) &&
      /takeArrival\(\(agentId\) => stations\.current\?\.has\(agentId\) === true/.test(view) &&
      /takeArrival\(/.test(flat) && /data-orch-platform-world/.test(read('src/renderer/orchestration/OrchestrationView.tsx')),
    'cross-links')
}

ok('rd-w6.css.1 the Sessions verb fades in and the terrace reads its tone from the token',
  /\.sessions-world \{[^}]*opacity: 0/.test(w6css) && /opacity: 1/.test(w6css) && /var\(--tone\)/.test(w6css) && /var\(--dur-1\)/.test(w6css),
  'css')

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
