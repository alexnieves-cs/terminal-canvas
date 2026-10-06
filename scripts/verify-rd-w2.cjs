/* Phase 0 seam for lane W2. The lane replaces the body. This check only
   proves the seam is present, so the suite is registered before any feature
   code. Ids stay scoped: keep rd-w2.0 green when you add the real checks. */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
const contracts = readFileSync(join(ROOT, 'src', 'shared', 'redesign-contracts.ts'), 'utf8')
const own = JSON.parse(readFileSync(join(ROOT, 'docs', 'redesign', 'ownership.json'), 'utf8'))
const open = '/* ── rd:W2 ── */'
const close = '/* ── /rd:W2 ── */'
ok('rd-w2.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['W2']) && own.lanes['W2'].some((g) => g.endsWith('verify-rd-w2.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const { buildSync } = require('esbuild')
const OUT = join(ROOT, 'out', 'verify', 'rd-w2.cjs')
buildSync({
  stdin: {
    contents: `
      import { askChip, boxFromStyle, failedLine, frameOf, panelFloor, placeStations, shiftPlacement, terraceDragCanvas, terraceFloor, terraceSignFromChip } from '../src/renderer/world/world-structure'
      import { canvasToFloor, FLOOR_SCALE } from '../src/shared/world-space'
      import { moveRegion } from '../src/renderer/canvas/task-regions'
      export { askChip, boxFromStyle, failedLine, frameOf, panelFloor, placeStations, shiftPlacement, terraceDragCanvas, terraceFloor, terraceSignFromChip, canvasToFloor, FLOOR_SCALE, moveRegion }
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-w2-entry.ts',
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

// rd-world.layout.1. The esbuild above fails closed if terraceFloor (or
// moveRegion) is not exported. The assertions are canvasToFloor, panelFloor,
// and one moveRegion plan from terraceDragCanvas.
{
  const region = { x: 240, y: 192, w: 1056, h: 624 }
  const floor = M.terraceFloor(region)
  const center = M.canvasToFloor({ x: region.x + region.w / 2, y: region.y + region.h / 2 })
  const panel = { id: 'codex-ledger', x: 792, y: 216, w: 480, h: 288 }
  const desk = M.panelFloor(panel)
  const deskCenter = M.canvasToFloor({ x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 })
  const from = floor.center
  const to = { x: from.x + 1.5, z: from.z - 0.4 }
  const delta = M.terraceDragCanvas(from, to)
  const members = [{ id: 'claude-ledger', x: 264, y: 216, w: 480, h: 288 }, { id: 'codex-ledger', x: 792, y: 216, w: 480, h: 288 }]
  const moved = M.moveRegion(members, delta.dx, delta.dy)
  const same = moved.rects.length === members.length && moved.rects.every((rect, i) => rect.id === members[i].id && rect.w === members[i].w && rect.h === members[i].h && rect.x === members[i].x + delta.dx && rect.y === members[i].y + delta.dy)
  const station = {
    agentId: 'codex-ledger', conductor: false, index: 1,
    desk: { x: 1, z: 2, facing: 0.2 },
    home: { x: 1, z: 3, facing: 0.2 },
    seat: { x: 0, z: 0, facing: 0 }
  }
  const placed = M.placeStations(new Map([[station.agentId, station]]), [panel])
  const home = placed.get('codex-ledger').home
  ok('rd-world.layout.1 terrace centre and size are canvasToFloor of the region, a desk sits at the panel floor point, and a terrace drag is one moveRegion plan',
    floor.center.x === center.x && floor.center.z === center.z && floor.w === region.w / M.FLOOR_SCALE && floor.d === region.h / M.FLOOR_SCALE &&
      desk.x === deskCenter.x && desk.z === deskCenter.z &&
      same && moved.rects.length === 2 &&
      home.x === desk.x && home.z > desk.z &&
      M.terraceSignFromChip('Ledger CSV export · SW-412 · 4 agents · 2 of 4 criteria') === 'Ledger CSV export · SW-412 · 2/4' &&
      M.boxFromStyle('a', '10px', '20px', '0', '4') === null,
    `floor=${JSON.stringify(floor)} delta=${JSON.stringify(delta)}`)
}

// rd-world.drag.1. The scene commits one terrace drag through the publisher.
// It never imports moveRegion. Canvas's mover calls the verb once and writes
// one history entry inside the panels updater, not once per member. The
// stood-up room follows that same canvas delta.
{
  const structure = readFileSync(join(ROOT, 'src', 'renderer', 'world', 'WorldStructure.tsx'), 'utf8')
  const publisher = readFileSync(join(ROOT, 'src', 'renderer', 'world', 'useWorldContextPublisher.ts'), 'utf8')
  const canvas = readFileSync(join(ROOT, 'src', 'renderer', 'canvas', 'Canvas.tsx'), 'utf8')
  const moverAt = canvas.indexOf('const moveTaskRegion')
  const mover = canvas.slice(moverAt, canvas.indexOf('useWorldContextPublisher({', moverAt))
  const commits = (mover.match(/commitHistory\(/g) ?? []).length
  const shifted = M.shiftPlacement(
    [{ id: 'a', x: 10, y: 20, w: 100, h: 80 }],
    [{ id: 'task', x: 0, y: 0, w: 400, h: 300 }, { id: 'other', x: 8, y: 8, w: 40, h: 40 }],
    [{ id: 'task', label: 'T', center: { x: 2, z: 1.5 }, w: 4, d: 3 }],
    'task',
    ['a'],
    100,
    -50
  )
  const panel = shifted.panels[0]
  const region = shifted.regions[0]
  const other = shifted.regions[1]
  const floor = shifted.floors[0]
  ok('rd-world.drag.1 a terrace drag commits moveRegion once through the publisher, and the stood-up room follows that one canvas delta',
    /commitRegionMove\(terrace\.id, delta\.dx, delta\.dy\)/.test(structure) &&
      /terraceDragCanvas\(/.test(structure) &&
      !/from '@renderer\/canvas\//.test(structure) &&
      /setRegionMover\(/.test(publisher) &&
      /latest\.current\.moveRegion\(regionId, dx, dy\)/.test(publisher) &&
      /moveRegion\(members, dx, dy\)/.test(mover) &&
      commits === 1 &&
      /setPanels\(\(current\) => \{[\s\S]*commitHistory\(next\)/.test(mover) &&
      panel.x === 110 && panel.y === -30 && region.x === 100 && region.y === -50 &&
      other.x === 8 && other.y === 8 &&
      floor.center.x === 3 && floor.center.z === 1,
    `commits=${commits} panel=${panel.x},${panel.y} floor=${floor.center.x},${floor.center.z}`)
}

// rd-world.chrome.1. Watched red before the host override: the span did not
// name .command-pill, .minimap or .canvas-hud. Those are the 2D components'
// own classes (CommandPill, Minimap, CanvasHud). The room does not import
// them — world.ctx.door.1 forbids it — so the host reveals the instances
// Canvas already mounted.
{
  const span = css.slice(css.indexOf(open), css.indexOf(close))
  const pill = readFileSync(join(ROOT, 'src', 'renderer', 'canvas', 'CommandPill.tsx'), 'utf8')
  const map = readFileSync(join(ROOT, 'src', 'renderer', 'canvas', 'MinimapOverlay.tsx'), 'utf8')
  const hud = readFileSync(join(ROOT, 'src', 'renderer', 'canvas', 'CanvasHud.tsx'), 'utf8')
  const view = readFileSync(join(ROOT, 'src', 'renderer', 'world', 'WorldView.tsx'), 'utf8')
  const chrome = readFileSync(join(ROOT, 'src', 'renderer', 'world', 'WorldChrome.tsx'), 'utf8')
  ok('rd-world.chrome.1 the room reveals the canvas pill, minimap and tier switch, and leaves W1 and W3 mounts empty',
    /\.canvas--behind-world > \.command-pill/.test(span) && /\.canvas--behind-world > \.minimap/.test(span) && /\.canvas--behind-world > \.canvas-hud/.test(span) &&
      /className="command-pill"/.test(pill) && /className="minimap"/.test(map) && /className="canvas-hud"/.test(hud) && /data-hud-tier=\{tier\}/.test(hud) &&
      /data-rd-mount="W1"/.test(view) && /data-rd-mount="W3"/.test(view) && /rd:W1 mount/.test(view) && /rd:W3 mount/.test(view) &&
      !/from '@react-three\//.test(chrome) && !/from 'three'/.test(chrome),
    'shared chrome')
}

// rd-world.state.1. Ask chips and the failed pill are functions of the feed.
// The beacon is the only vertical column and only while waiting. The desk
// screen reads stateHexForAgent (R-039).
{
  const waiting = { status: 'waiting_approval', events: [{ type: 'message', payload: { text: 'wants to edit ledger.ts' } }] }
  const quiet = { status: 'working', events: [{ type: 'message', payload: { text: 'Writing tests' } }] }
  const failed = { status: 'error', events: [{ type: 'message', payload: { text: 'exited 1' } }] }
  const robot = readFileSync(join(ROOT, 'src', 'renderer', 'world', 'WorldRobot.tsx'), 'utf8')
  const office = readFileSync(join(ROOT, 'src', 'renderer', 'world', 'WorldOffice.tsx'), 'utf8')
  const beaconAt = robot.indexOf('function NeedsBeacon')
  ok('rd-world.state.1 a waiting agent chips its message, a failure pills its own line, and only that wait raises the beacon',
    M.askChip(waiting) === 'wants to edit ledger.ts' && M.askChip(quiet) === null && M.failedLine(failed) === 'exited 1' && M.failedLine(quiet) === null &&
      beaconAt > 0 && /status === 'waiting_approval' \? <NeedsBeacon /.test(robot) && /stateHexForAgent\('waiting_approval'\)/.test(robot.slice(beaconAt)) &&
      /material\.emissive\.set\(stateHexForAgent\(status\)\)/.test(office) && /const drawTable = false/.test(office),
    `ask=${M.askChip(waiting)} fail=${M.failedLine(failed)}`)
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
