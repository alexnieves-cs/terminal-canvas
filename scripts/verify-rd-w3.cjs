/* Lane W3 (M451). Overview, camera and time. Plain node. Ids stay scoped.
   rd-w3.0 stays: the seam is still the registration proof.

   Watched red before world-camera.ts existed: esbuild could not resolve
   src/renderer/world/world-camera.ts, so the suite exited before any ok()
   after the seam check had been added to the same file. Restored by writing
   the module the checks call. */
'use strict'
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const css = read('src/renderer/styles.css')
const contracts = read('src/shared/redesign-contracts.ts')
const own = JSON.parse(read('docs/redesign/ownership.json'))
const open = '/* ── rd:W3 ── */'
const close = '/* ── /rd:W3 ── */'
ok('rd-w3.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['W3']) && own.lanes['W3'].some((g) => g.endsWith('verify-rd-w3.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify', 'rd-w3.cjs')
buildSync({
  stdin: {
    contents: `
      export { fitRoom, zoomToCursor, wheelFactor, tierPose, orbitBy, panBy, followAgent, boundsOf, boundsCenter, floorToScreen, screenToFloor, cameraFootprint, toPose, backTo2d, tierAt, TIER_SCALE } from '../src/renderer/world/world-camera'
      export { TIER_PITCH } from '../src/shared/world-space'
      export { TIER_TARGET, tierFor } from '../src/renderer/canvas/zoom-tier'
      export { verbsForRoom, PAST_ROOM_REASON, tickTone, tourStep, tourOfferLabel, TOUR_OFFER_MS } from '../src/renderer/world/world-replay'
      export { cameraWedge, watchersOn } from '../src/renderer/world/world-minimap'
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-w3-entry.ts',
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

const size = { width: 1440, height: 865 }
const near = (a, b) => Math.abs(a - b) < 1e-6

{
  // Terraces that do not sit on the origin. Fit used to aim there, and the
  // bounds landed off-centre with no error.
  const bounds = { minX: 8, maxX: 36, minZ: -4, maxZ: 28 }
  const cam = M.fitRoom(bounds, size, 'map')
  const center = M.boundsCenter(bounds)
  const screen = M.floorToScreen(cam, size, center)
  const dx = Math.abs(screen.x - size.width / 2) / size.width
  const dy = Math.abs(screen.y - size.height / 2) / size.height
  const origin = M.floorToScreen(M.tierPose('map', { x: 0, z: 0 }, size), size, center)
  const ox = Math.abs(origin.x - size.width / 2) / size.width
  const oy = Math.abs(origin.y - size.height / 2) / size.height
  ok('rd-world.fit.1 Fit centres the terrace bounds to within 2% of the viewport; aiming at the origin does not',
    dx < 0.02 && dy < 0.02 && (ox > 0.02 || oy > 0.02) && cam.target.x === center.x && cam.target.z === center.z,
    `fit ${dx.toFixed(4)},${dy.toFixed(4)} origin ${ox.toFixed(4)},${oy.toFixed(4)}`)
}

{
  const cam = M.tierPose('plan', { x: 4, z: -6 }, size)
  const cursor = { x: 320, y: 180 }
  const before = M.screenToFloor(cam, size, cursor)
  const next = M.zoomToCursor(cam, size, cursor, 1.6)
  const after = M.screenToFloor(next, size, cursor)
  const pinch = M.zoomToCursor(cam, size, cursor, M.wheelFactor(-12, true))
  const afterPinch = M.screenToFloor(pinch, size, cursor)
  ok('rd-world.zoom.1 zoom-to-cursor keeps the floor point under the cursor fixed, and a ctrlKey pinch uses the same rule',
    near(before.x, after.x) && near(before.z, after.z) &&
    near(before.x, afterPinch.x) && near(before.z, afterPinch.z) &&
    next.distance !== cam.distance && M.wheelFactor(-12, true) > 1 && M.wheelFactor(12, true) < 1,
    `${before.x},${before.z} → ${after.x},${after.z}`)
}

{
  const cam = M.tierPose('plan', { x: 1, z: 2 }, size)
  const turned = M.orbitBy(cam, 40, 10)
  const panned = M.panBy(cam, 80, -20, size)
  const followed = M.followAgent(cam, { x: 9, z: 3 }, size)
  const work = M.tierPose('work', { x: 0, z: 0 }, size)
  const map = M.tierPose('map', { x: 0, z: 0 }, size)
  const back = M.backTo2d(map, size)
  const span = M.boundsOf([{ x: 1, z: 2 }, { x: 5, z: -1 }])
  // The copy in world-camera must stay the canvas's. A canvas import there
  // fails world.ctx.door.1, so the equality is the pin.
  const scales = [0, 0.18, 0.22, 0.24, 0.25, 0.28, 0.34, 0.67, 0.7, 0.73, 1, 1.4, NaN, Infinity]
  const prevs = [undefined, 'work', 'plan', 'map']
  const band = scales.every((s) => prevs.every((p) => M.tierAt(s, p) === M.tierFor(s, p)))
  ok('rd-world.pose.1 orbit keeps the target, pan moves it, follow frames the agent at Work, and the tier pitches are world-space\'s',
    turned.target.x === cam.target.x && turned.target.z === cam.target.z && turned.azimuth !== cam.azimuth &&
    (panned.target.x !== cam.target.x || panned.target.z !== cam.target.z) && panned.azimuth === cam.azimuth &&
    followed.target.x === 9 && followed.target.z === 3 && followed.tier === 'work' &&
    work.pitch === M.TIER_PITCH.work && map.pitch === M.TIER_PITCH.map && work.tier === 'work' && map.tier === 'map' &&
    M.TIER_SCALE.work === M.TIER_TARGET.work && M.TIER_SCALE.plan === M.TIER_TARGET.plan && M.TIER_SCALE.map === M.TIER_TARGET.map &&
    band && Math.abs(back.scale - M.TIER_TARGET.map) < 1e-9 &&
    span.minX < 1 && span.maxX > 5 && span.minZ < -1 && span.maxZ > 2,
    `work ${work.pitch} map ${map.pitch}`)
}

{
  const cam = M.tierPose('map', { x: 2, z: 4 }, size)
  const foot = M.cameraFootprint(cam, size)
  const corners = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: size.width, y: size.height },
    { x: 0, y: size.height }
  ]
  const onCorner = foot.length === 4 && foot.every((p, i) => {
    const s = M.floorToScreen(cam, size, p)
    return Math.abs(s.x - corners[i].x) < 1 && Math.abs(s.y - corners[i].y) < 1
  })
  const wedge = M.cameraWedge({ x: 0, z: 0 }, { x: 0, z: 4 })
  ok('rd-world.wedge.1 the footprint is the viewport via cameraToViewport, and the plan wedge starts at the camera',
    onCorner && wedge.length === 3 && wedge[0].x === 0 && wedge[0].z === 0 && wedge[1].z > 0 && wedge[2].z > 0 && wedge[1].x !== wedge[2].x,
    `wedge ${JSON.stringify(wedge)}`)
}

{
  const past = M.verbsForRoom(true, [{ id: 'open', label: 'Open' }, { id: 'ask', label: 'Ask' }])
  const live = M.verbsForRoom(false, [{ id: 'open', label: 'Open' }])
  const time = read('src/renderer/world/WorldTime.tsx')
  ok('rd-world.past.1 a past room disables every verb with one reason, and the scrubber says that reason',
    M.PAST_ROOM_REASON === 'past room — go Live to act' &&
    past.every((v) => v.disabled === true && v.reason === M.PAST_ROOM_REASON) &&
    live[0].disabled === false && live[0].reason === null && live[0].label === 'Open' &&
    time.includes('PAST_ROOM_REASON') && time.includes('verbsForRoom'),
    M.PAST_ROOM_REASON)
}

{
  const error = { agentId: 'a', seq: 1, ts: 1, type: 'error', payload: { message: 'no' } }
  const wait = { agentId: 'a', seq: 2, ts: 2, type: 'status', payload: 'waiting_approval' }
  const work = { agentId: 'a', seq: 3, ts: 3, type: 'status', payload: 'working' }
  const done = { agentId: 'a', seq: 4, ts: 4, type: 'message', payload: { text: 'shipped' } }
  const thought = { agentId: 'a', seq: 5, ts: 5, type: 'thought', payload: { text: '…' } }
  ok('rd-world.tick.1 a tick\'s tone is the state palette\'s name, and the W3 span paints it with the token',
    M.tickTone(error) === 'exited' && M.tickTone(wait) === 'needs-you' && M.tickTone(work) === 'working' &&
    M.tickTone(done) === 'done' && M.tickTone(thought) === null &&
    css.includes('.world-time__mark[data-tone="needs-you"]') &&
    css.includes('var(--state-needs)') && css.includes('var(--state-failed)') &&
    !/#[0-9a-fA-F]{3,8}/.test(css.slice(css.indexOf(open), css.indexOf(close))),
    `${M.tickTone(wait)} ${M.tickTone(error)}`)
}

{
  ok('rd-world.tour.1 the away offer is a 40s tour, and reduced motion cuts instead of flying',
    M.TOUR_OFFER_MS === 40000 && M.tourOfferLabel() === 'Tour the changes · 40s' &&
    M.tourStep(true) === 'cut' && M.tourStep(false) === 'fly',
    M.tourOfferLabel())
}

{
  const peers = [
    { userId: '1', initials: 'AA', panelId: 'codex', color: '#ccc' },
    { userId: '2', initials: 'BB', panelId: 'claude', color: '#ddd' },
    { userId: '3', initials: 'CC', panelId: null, color: '#eee' }
  ]
  const on = M.watchersOn(peers, 'codex')
  const peersSrc = read('src/renderer/world/WorldPeers.tsx')
  const mini = read('src/renderer/world/WorldMinimap.tsx')
  ok('rd-world.peer.1 a watcher chip is that teammate\'s initials, never a hardcoded sample',
    on.length === 1 && on[0].initials === 'AA' && M.watchersOn(peers, 'missing').length === 0 &&
    /watchersOn\(/.test(peersSrc) && /watchersOn\(/.test(mini) &&
    !/['"]MK['"]/.test(peersSrc) && !/['"]MK['"]/.test(mini) &&
    /\{p\.initials\}/.test(peersSrc) && /\.initials\}/.test(mini),
    on.map((p) => p.initials).join(','))
}

{
  const panel = read('src/renderer/world/WorldCameraPanel.tsx')
  const camera = read('src/renderer/world/world-camera.ts')
  const ids = ['tier-work', 'tier-plan', 'tier-map', 'fit-all', 'world', 'follow', 'zoom-scroll', 'zoom-pinch']
  ok('rd-world.chord.1 the camera panel takes every chord from the registry',
    /export function useWorldCamera\(/.test(panel) && /shortcutById\(/.test(panel) &&
    ids.every((id) => panel.includes(`'${id}'`)) && !/⌘/.test(panel) &&
    /Orbit/.test(panel) && /Pan/.test(panel) && /Shift/.test(panel) && /ctrlKey/.test(panel) &&
    /Fit room/.test(panel) && /Follow picked/.test(panel) && /Back to 2D/.test(panel) &&
    !/from 'three'|from '@react-three|from 'react'/.test(camera) &&
    !/from '@renderer\/canvas\//.test(camera),
    'registry')
  const shortcuts = read('src/shared/shortcuts.ts')
  ok('rd-world.follow.1 Follow picked is F, named followPicked, and the overview panel consumes that chord',
    /\{ id: 'follow', chord: 'F', scope: 'canvas', group: 'navigate', label: 'Follow picked' \}/.test(shortcuts) &&
    /'follow': 'followPicked'/.test(shortcuts) &&
    (shortcuts.match(/chord: 'F'/g) ?? []).length === 1 &&
    /chord: '⌘F'/.test(shortcuts) &&
    /if \(hit\.id === 'follow'\) \{ event\.preventDefault\(\); api\.follow\(\); return \}/.test(panel),
    'follow')
}

{
  const pure = read('src/renderer/world/world-minimap.ts')
  const shot = read('scripts/shot-scenes/rd-w3.cjs')
  ok('rd-world.mount.1 the overview scene paints, the plan map stays free of value imports, and the panel is mounted beside the W3 mark',
    /name: 'rd-world-overview'/.test(shot) && /run:/.test(shot) &&
    /14-world-overview\.png/.test(shot) &&
    !/^import(?!.*type)/m.test(pure) &&
    /<WorldCameraPanel /.test(read('src/renderer/world/WorldView.tsx')) &&
    /data-rd-mount="W3"/.test(read('src/renderer/world/WorldView.tsx')) &&
    !/<WorldCameraPanel /.test(read('src/renderer/world/WorldTime.tsx')) &&
    !/from ['"]three['"]|from ['"]@react-three/.test(pure),
    'mount')
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
