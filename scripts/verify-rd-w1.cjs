/* Lane W1 (M449). rd-w1.0 stays the seam.
   clock.1, reduced.1, tilt.1, pop.1 and align.1 were watched red against the
   pre-M449 clock (no REDUCED_TRANSITION_MS, hostLook had no tilt, popDelays
   took distances from the origin only, handoffMisalignPx was absent) before
   the curves landed. */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
const contracts = readFileSync(join(ROOT, 'src', 'shared', 'redesign-contracts.ts'), 'utf8')
const own = JSON.parse(readFileSync(join(ROOT, 'docs', 'redesign', 'ownership.json'), 'utf8'))
const open = '/* ── rd:W1 ── */'
const close = '/* ── /rd:W1 ── */'
ok('rd-w1.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['W1']) && own.lanes['W1'].some((g) => g.endsWith('verify-rd-w1.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify', 'rd-w1.cjs')
buildSync({
  stdin: {
    contents: `
      export { createWorldTransition, WORLD_TRANSITION_MS, REDUCED_TRANSITION_MS, PLAN_TILT_DEG, CANCEL_CHIP, FILMSTRIP_MS, HOST_SCALE_MIN, POP_STAGGER, hostLook, popDelaysFromTarget, terraceRise, filmstripIndex, motionOf, easeInOutCubic } from '../src/renderer/world/world-transition'
      export { handoffMisalignPx, landingViewport, planFloorPixels, paintPlanFloor } from '../src/renderer/world/plan-floor'
      export { worldCameraTarget, setWorldCameraTarget } from '../src/renderer/world/world-toggle'
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-w1-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  external: ['react'],
  alias: {
    '@shared': join(ROOT, 'src/shared'),
    '@renderer': join(ROOT, 'src/renderer')
  }
})
const T = require(OUT)

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const near = (a, b) => Math.abs(a - b) < 1e-9
const stage = read('src/renderer/world/WorldStage.tsx')
const clock = read('src/renderer/world/world-transition.ts')
const floor = read('src/renderer/world/plan-floor.ts')
const canvas = read('src/renderer/canvas/Canvas.tsx')
const lens = read('src/renderer/world/WorldLens.tsx')

const seam = css.slice(css.indexOf(open), css.indexOf(close))

{
  const rafs = (stage.match(/requestAnimationFrame/g) ?? []).length
  ok('rd-w1.clock.1 world-transition.ts stays the one clock: the stage has one rAF loop, and the pure module has no timer of its own',
    rafs === 1 && !/requestAnimationFrame|setInterval|setTimeout/.test(clock) &&
    (clock.match(/function createWorldTransition/g) ?? []).length === 1 &&
    /motionOf\(s, reduced\)/.test(stage),
    `rafs=${rafs}`)
}

{
  const t = T.createWorldTransition(0, T.REDUCED_TRANSITION_MS, { reduced: true })
  t.setTarget(1, 0)
  const mid = t.sample(60)
  const end = t.sample(120)
  const look = T.hostLook(mid.linear, true)
  const motion = T.motionOf(mid, true)
  const snap = T.createWorldTransition(0, 0)
  snap.setTarget(1, 5)
  ok('rd-w1.reduced.1 a reduced move is a 120ms cross-fade: halfway the world is half visible, the dolly and tilt have not played, and a zero duration still snaps',
    T.REDUCED_TRANSITION_MS === 120 && near(mid.linear, 0.5) && mid.eased === 1 && mid.raw === 1 && !mid.settled &&
    look.tilt === 0 && look.scale === 1 && near(look.opacity, 0.5) &&
    motion.dolly === 1 && motion.terrace === 1 && motion.tilt === 0 &&
    end.settled && end.linear === 1 &&
    snap.sample(5).settled && snap.sample(5).raw === 1,
    JSON.stringify({ mid, look }))
  const back = T.createWorldTransition(0, T.REDUCED_TRANSITION_MS, { reduced: true })
  back.setTarget(1, 0)
  back.setTarget(0, 60)
  ok('rd-w1.reduced.2 Esc mid-fade reverses from where the fade is, at the same speed, and the dolly stays put',
    near(back.sample(60).linear, 0.5) && near(back.sample(90).linear, 0.25) && back.sample(90).eased === 0 &&
    back.sample(120).settled && back.sample(120).linear === 0,
    JSON.stringify(back.sample(90)))
}

{
  ok('rd-w1.tilt.1 the plan tilts back with the eased clock and reduced motion does not tilt or scale',
    T.hostLook(0).tilt === 0 && T.hostLook(0).scale === 1 && T.hostLook(1).tilt === T.PLAN_TILT_DEG && T.PLAN_TILT_DEG > 0 &&
    T.hostLook(1).scale === T.HOST_SCALE_MIN && T.hostLook(1, true).tilt === 0 && T.hostLook(1, true).scale === 1 &&
    /rotateX\(/.test(stage) && /host\.style\.transformOrigin/.test(stage))
}

{
  ok('rd-w1.terrace.1 terraces rise with the eased clock and are already up under reduced motion',
    T.terraceRise(0) === 0 && T.terraceRise(1) === 1 && near(T.terraceRise(0.4), 0.4) && T.terraceRise(0.2, true) === 1)
}

{
  const target = { x: 10, z: 0 }
  const delays = T.popDelaysFromTarget([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 4, z: 0 }], target)
  ok('rd-w1.pop.1 pop delays are measured from the camera target, not the room origin: the desk on the target is first even though the origin is nearer another desk',
    delays[1] === 0 && near(delays[0], T.POP_STAGGER) && delays[2] > 0 && delays[2] < delays[0] &&
    T.popDelaysFromTarget([], target).length === 0,
    delays.join())
}

{
  const size = { width: 1440, height: 900 }
  const points = [{ x: 0, y: 0 }, { x: 200, y: 300 }, { x: 800, y: 450 }, { x: 1439.4, y: 10 }, { x: 20, y: 899.6 }]
  const err = T.handoffMisalignPx(points, { x: 12, y: -40, scale: 1 }, size)
  ok('rd-w1.align.1 the 2D plan and the floor texture coincide within 2px at 1440×900',
    err <= 2 && !/\.png|toDataURL|capturePage/.test(floor),
    String(err))
  const landed = T.landingViewport({ x: 2, z: 3 }, size, 1.25, 'plan')
  const cx = (size.width / 2 - landed.x) / landed.scale
  const cy = (size.height / 2 - landed.y) / landed.scale
  ok('rd-w1.land.1 toggling back centres the 2D viewport on the camera target and keeps the scale',
    Math.abs(cx - 200) <= 2 && Math.abs(cy - 300) <= 2 && Math.abs(landed.scale - 1.25) < 1e-6,
    JSON.stringify({ cx, cy, scale: landed.scale }))
}

{
  const pixels = T.planFloorPixels(
    { regions: [{ x: 0, y: 0, w: 40, h: 40 }], panels: [{ x: 10, y: 10, w: 8, h: 8 }] },
    { width: 64, height: 64 }
  )
  const at = (x, y) => pixels[(y * 64 + x) * 4]
  ok('rd-w1.floor.1 the floor texture is painted from layout rects: a panel texel is not the ground, and a region is not a panel',
    at(10, 10) !== at(0, 50) && at(2, 2) !== at(10, 10) && at(2, 2) !== at(0, 50) && pixels.length === 64 * 64 * 4)
}

{
  const previous = globalThis.__rdW1
  globalThis.__rdW1 = { atMs: 550 }
  try {
    const t = T.createWorldTransition(0)
    t.setTarget(1, 1000)
    const frozen = t.sample(99999)
    const moved = t.sample(1000)
    ok('rd-w1.pin.1 __rdW1.atMs freezes every reader of the one clock at 550ms of a 1000ms move',
      T.WORLD_TRANSITION_MS === 1000 && near(frozen.linear, 0.55) && near(moved.linear, 0.55) && !frozen.settled &&
      T.filmstripIndex(550) === T.FILMSTRIP_MS.indexOf(500),
      JSON.stringify(frozen))
  } finally {
    if (previous === undefined) delete globalThis.__rdW1
    else globalThis.__rdW1 = previous
  }
}

{
  ok('rd-w1.chip.1 the cancel chip reads the one string, with a bar, and the filmstrip is the full move',
    T.CANCEL_CHIP === 'Entering World · Esc cancel' && /\{CANCEL_CHIP\}/.test(stage) &&
    /data-world-cancel/.test(stage) && /data-world-filmstrip/.test(stage) &&
    T.FILMSTRIP_MS.join() === '0,250,500,750,1000' &&
    /\.world-move__chip/.test(seam) && /\.world-move__strip/.test(seam))
}

{
  const at = canvas.indexOf('const machineCostTargets')
  const body = canvas.slice(at, canvas.indexOf('useEffect', at))
  const hostAt = canvas.indexOf('ref={hostRef}')
  const divStart = canvas.lastIndexOf('<div', hostAt)
  const beforeDiv = canvas.slice(Math.max(0, divStart - 180), divStart)
  ok('rd-w1.pid.1 the canvas host stays mounted while the world is up, and the running-pid list does not consult the world bit',
    hostAt > 0 && divStart > 0 && !/worldOn/.test(beforeDiv) &&
    /worldOn \? ' canvas--behind-world'/.test(canvas) && /inert=\{canvasCovered\}/.test(canvas) &&
    /pid: status\.pid/.test(body) && !/worldOn/.test(body) &&
    !/pty:kill|agentSession\.terminate/.test(stage + clock + floor + lens))
}

{
  const worldAt = canvas.indexOf("hit?.id === 'world'")
  const effect = canvas.slice(worldAt, canvas.indexOf("window.addEventListener('keydown', onKey)", worldAt))
  const ignoreAt = effect.indexOf('if (shouldIgnoreKeys()) return')
  ok('rd-w1.keys.1 ⌘⇧W is the registry chord and it is handled before the covered canvas stands its keys down; the host is inert while covered',
    worldAt > 0 && ignoreAt > 0 && /focusLocked\(\)/.test(effect) &&
    /shortcutById\('world'\)/.test(lens) && /shell__world-toggle/.test(lens) && /data-world-lens/.test(lens) &&
    /<WorldLens /.test(canvas) && /inert=\{canvasCovered\}/.test(canvas))
}

{
  T.setWorldCameraTarget({ x: 4, z: -2 })
  const got = T.worldCameraTarget()
  ok('rd-w1.cam.1 the landing target is a writable floor point, defaulting until the scene publishes the live orbit',
    got.x === 4 && got.z === -2 && /setWorldCameraTarget/.test(read('src/renderer/world/world-toggle.ts')) &&
    /landWorld\(worldCameraTarget\(\)\)/.test(stage) && /export function motionOf/.test(clock) &&
    /export function paintPlanFloor/.test(floor) && /export function popDelaysFromTarget/.test(clock))
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
