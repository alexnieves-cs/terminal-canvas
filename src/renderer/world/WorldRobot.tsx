import { memo, Suspense, useEffect, useMemo, useRef, type JSX, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getAgent, useAgentStatus } from './agent-world-store'
import { WorldCard } from './WorldCard'
import { studioEnv } from './world-gloss'
import { agentTint, effectOf, goalOf, hopsOn, isTyping, leanOf, type Station } from './world-scene'
import { ARRIVE_MS, easeInOutCubic, popOf, type WorldTransition } from './world-transition'

/**
 * One agent as a robot: a glossy capsule body in the agent's colour, a dark
 * visor with two lit eyes, walking between its desk and the meeting table, its
 * pose a function of the event store.
 *
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library table
 * says why: three.js is +2.2MB in the first chunk if anything static reaches it).
 *
 * Built from primitives, not a rigged model (M415): every robot shares ONE set
 * of geometries (`robotKit`) and differs only by its body material, so a robot
 * is eight small draw calls and no skeleton, and every motion is a few sines
 * on plain groups instead of a mixer blending clips:
 *
 *   - an idle BOB, phase-shifted per agent so a room never breathes in unison;
 *   - a LEAN toward what it is busy with (`leanOf`): into the desk while a tool
 *     call is open, back while it thinks, toward the table while it waits there;
 *   - a HOP with a squash-and-stretch when a tool call starts (`hopsOn`);
 *   - one-shots for the rest of the feed: a WAVE for a message, a SHAKE for an
 *     error or a failed call, a head TILT for a thought — and a blink, and a
 *     waddle while walking.
 *
 * Everything is read from `getAgent` inside the frame loop, never from React
 * state, so an event costs a ref read — not a render.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **The gloss is a generated room, not an HDR.** A clearcoat with nothing
 *     to reflect is a flat plastic; drei's `<Environment>` would fetch an HDR
 *     from a CDN the CSP refuses. `RoomEnvironment` is built in code and
 *     prefiltered once per renderer (`studioEnv`, world-gloss.ts) — and it is set on
 *     the glossy materials only, never `scene.environment`, which would relight
 *     the office.
 * (2) **History is not replayed.** The event cursor starts at the record's
 *     last seq, so opening the view mid-session does not make every robot hop,
 *     wave and shake through its ring of fifty events at once.
 * (3) **The pop scales `bob`, never `placer`.** `placer` carries the walk and
 *     the status card, and the card's DOM position is projected from it — a
 *     robot scaled to 0 on `placer` drags its card's anchor down to its feet.
 *     `bob` is the robot's body alone, and its origin is the floor, so a scale
 *     there grows the robot from its feet. A scale of exactly 0 is a singular
 *     matrix (three warns on the normal matrix), so the pop floors at 1e-4 and
 *     the body is hidden below that instead.
 * (4) **The kit is shared and never disposed.** Geometry is uploaded per
 *     renderer and dropped with its context, so one module-level set serves
 *     every mount; disposing it from one robot's cleanup would blank the rest.
 *     The body MATERIAL is per robot (it carries the colour) and is disposed.
 */

/** Where the head's crown is — the name pill floats just above it. */
export const ROBOT_TOP = 1.55

/** Body proportions: a big head on a short capsule, the reference's chubby figure. */
const HIP_Y = 0.32
const TORSO_Y = 0.6
const SHOULDER = { x: 0.3, y: 0.8 } as const
const HEAD_Y = 1.17
const HEAD_R = 0.38
/** The head is a sphere scaled to these, so its face is an ellipsoid with these semi-axes. */
const HEAD_SCALE = [1.1, 0.94, 0.92] as const
const HEAD_AXES = { x: HEAD_R * HEAD_SCALE[0], y: HEAD_R * HEAD_SCALE[1], z: HEAD_R * HEAD_SCALE[2] } as const
/** The visor: a rounded rectangle on the face, centred a little below the head's middle. */
const VISOR = { w: 0.6, h: 0.4, r: 0.12, y: -0.02 } as const
const ARM_REST = 0.14

/** World units per second while walking, and the step rate. */
const WALK_SPEED = 2.4
const STEP_HZ = 11
const HOP_S = 0.36
const WAVE_S = 1.5
const SHAKE_S = 0.55
const TILT_S = 1.3
const BLINK_EVERY_S = 4.3

interface Kit {
  leg: THREE.BufferGeometry
  torso: THREE.BufferGeometry
  arm: THREE.BufferGeometry
  head: THREE.BufferGeometry
  visor: THREE.BufferGeometry
  eyes: THREE.BufferGeometry
  halo: THREE.BufferGeometry
  visorMaterial: THREE.MeshPhysicalMaterial
  eyeMaterial: THREE.MeshBasicMaterial
  haloMaterial: THREE.MeshBasicMaterial
}

/** A soft elliptical falloff, drawn in code (the CSP takes no image from elsewhere, and this needs none). */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.35, '#7a7a7a')
  grad.addColorStop(1, '#000000')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

/** How far the head's surface stands in front of its centre at (x, y), in the head's own frame. */
function faceZ(x: number, y: number): number {
  const u = 1 - (x / HEAD_AXES.x) ** 2 - (y / HEAD_AXES.y) ** 2
  return HEAD_AXES.z * Math.sqrt(Math.max(u, 0))
}

/**
 * Lays a flat (x, y) geometry onto the face, `lift(x, y)` proud of it. A face
 * plate must FOLLOW the head: a flat or merely bent box is a few big triangles
 * whose chords sink inside the sphere at the middle, so only its sides show —
 * which is what the first version (a RoundedBoxGeometry, bent) did.
 */
function conform(geometry: THREE.BufferGeometry, lift: (x: number, y: number) => number): void {
  const p = geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    p.setZ(i, faceZ(x, y) + lift(x, y))
  }
  p.needsUpdate = true
  geometry.computeVertexNormals()
}

/** A dense plane pulled into a rounded rectangle: every vertex in a corner square is drawn onto the corner's arc. */
function roundedPlate(w: number, h: number, r: number, cy: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 30, 20)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const ix = w / 2 - r, iy = h / 2 - r
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i)
    const dx = Math.abs(x) - ix, dy = Math.abs(y) - iy
    if (dx > 0 && dy > 0) {
      // Square → disc on the corner: scale by the square's radius over the circle's along that ray.
      const k = Math.max(dx, dy) / Math.hypot(dx, dy)
      p.setXY(i, Math.sign(x) * (ix + dx * k), Math.sign(y) * (iy + dy * k))
    }
  }
  return g.translate(0, cy, 0)
}

let kit: Kit | null = null
function robotKit(): Kit {
  if (kit) return kit
  // A leg hangs from its hip pivot; an arm from its shoulder.
  const leg = new THREE.CapsuleGeometry(0.1, 0.12, 6, 14).translate(0, -HIP_Y / 2, 0)
  const arm = new THREE.CapsuleGeometry(0.075, 0.22, 6, 12).translate(0, -0.15, 0)
  const torso = new THREE.CapsuleGeometry(0.27, 0.16, 8, 24)
  const head = new THREE.SphereGeometry(HEAD_R, 40, 28)
  // Flush with the head at its rim and a little proud at its middle, so it reads as a screen set INTO the helmet.
  const visor = roundedPlate(VISOR.w, VISOR.h, VISOR.r, VISOR.y)
  conform(visor, (x, y) => {
    const rim = Math.min(1, (VISOR.w / 2 - Math.abs(x)) / 0.07, (VISOR.h / 2 - Math.abs(y - VISOR.y)) / 0.07)
    return 0.004 + 0.022 * Math.max(rim, 0)
  })
  // Two pill-shaped eyes as ONE geometry (one draw call), on the visor, and a
  // soft halo behind them (one more) — the glow a bloom pass would give, for
  // the price of a quad instead of a full-screen pass.
  const EYE = { w: 0.075, h: 0.15, x: 0.105, y: VISOR.y + 0.012 } as const
  const pill = (cx: number): THREE.BufferGeometry => roundedPlate(EYE.w, EYE.h, EYE.w / 2, EYE.y).translate(cx, 0, 0)
  const eyes = mergeGeometries([pill(-EYE.x), pill(EYE.x)])!
  conform(eyes, () => 0.03)
  const halo = mergeGeometries([-EYE.x, EYE.x].map((cx) => new THREE.PlaneGeometry(EYE.w * 2.6, EYE.h * 1.9, 8, 8).translate(cx, EYE.y, 0)))!
  conform(halo, () => 0.027)
  // Both re-centred on the eyes' own middle, so the blink (a y scale) closes them in place.
  eyes.translate(0, -EYE.y, 0)
  halo.translate(0, -EYE.y, 0)
  kit = {
    leg, torso, arm, head, visor, eyes, halo,
    visorMaterial: new THREE.MeshPhysicalMaterial({ color: '#07090d', roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.7 }),
    // Unlit and outside tone mapping: a glow that reads the same in a light or a dark room.
    eyeMaterial: new THREE.MeshBasicMaterial({ color: '#7ff4ff', toneMapped: false }),
    haloMaterial: new THREE.MeshBasicMaterial({ color: '#39e6ff', alphaMap: glowTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  }
  return kit
}

/**
 * The shell: the agent's colour (`agentTint`, the 2D canvas's hash) pushed to
 * full saturation, because the reference's toys are candy-bright and the 2D
 * palette is tuned for a dot on a dark rail. The HUE is the agent's, so it is
 * still one colour in both views.
 */
function shellMaterial(tint: string, env: THREE.Texture): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(tint)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  color.setHSL(hsl.h, Math.max(hsl.s, 0.82), Math.min(Math.max(hsl.l, 0.5), 0.6))
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15,
    envMap: env, envMapIntensity: 0.4
  })
}

/** A stable 0…2π per agent, so idle bobs and blinks are out of step across the room. */
function phaseOf(agentId: string): number {
  let h = 0
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0
  return ((h % 1000) / 1000) * Math.PI * 2
}

/** Shortest-arc exponential approach — a yaw that never spins the long way round. */
function dampAngle(current: number, target: number, rate: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * (1 - Math.exp(-rate * dt))
}

function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/** 0 → 1 → 0 over `span` seconds since `at`; 0 outside it. */
function pulse(t: number, at: number, span: number): number {
  const u = (t - at) / span
  return u >= 0 && u < 1 ? Math.sin(Math.PI * u) : 0
}

interface Motion {
  ready: boolean
  yaw: number
  moving: boolean
  cursor: number
  rec: ReturnType<typeof getAgent>
  typing: boolean
  typingCheckedAt: number
  typingW: number
  walkW: number
  lean: number
  nod: number
  tiltAt: number
  waveAt: number
  hitAt: number
  hopAt: number
}

export interface WorldRobotProps {
  agentId: string
  station: Station
  /** Where the status cards mount; see WorldCard. */
  cards: RefObject<HTMLElement | null>
  /** The canvas↔world move, read for this robot's pop. */
  transition: WorldTransition
  /** How far into the move this robot starts (0 = with the first; see `popDelays`). */
  delay: number
  /** The name pill alone instead of the pill and the full card (it is outside the nearest few; see `cardTiers`). */
  compact: boolean
  /** prefers-reduced-motion: a robot that turns live appears at once instead of growing in. */
  reduced: boolean
}

function RobotBody({ agentId, station, cards, transition, delay, compact, reduced }: WorldRobotProps): JSX.Element {
  const k = robotKit()
  const gl = useThree((s) => s.gl)
  const env = useMemo(() => studioEnv(gl), [gl])
  useEffect(() => {
    k.visorMaterial.envMap = env
    k.visorMaterial.needsUpdate = true
  }, [k, env])
  const tint = agentTint(agentId)
  const shell = useMemo(() => shellMaterial(tint, env), [tint, env])
  useEffect(() => () => shell.dispose(), [shell])

  // A string snapshot: re-renders on a status CHANGE only, which is when the
  // bug appears or goes. Everything finer-grained is read in the frame loop.
  const status = useAgentStatus(agentId)

  const placer = useRef<THREE.Group>(null)
  const bob = useRef<THREE.Group>(null)
  const lean = useRef<THREE.Group>(null)
  const hopper = useRef<THREE.Group>(null)
  const upper = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  // This robot's pop (0…1), written by the frame loop and read by its card.
  const pop = useRef(0)
  // The delay is read in the frame loop, which must not be rebuilt for it.
  const delayRef = useRef(delay)
  delayRef.current = delay
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  // When this robot first ran a frame — a robot that turns live mid-session
  // arrives on its own clock instead of blinking in.
  const bornAt = useRef<number | null>(null)
  // The frame loop reads the latest station through a ref: the plan changes as
  // agents arrive, and the loop must not be rebuilt (or its state lost) for it.
  const latest = useRef(station)
  latest.current = station
  const phase = useMemo(() => phaseOf(agentId), [agentId])
  const motion = useRef<Motion>({
    ready: false, yaw: 0, moving: false,
    cursor: getAgent(agentId)?.lastSeq ?? -Infinity, rec: undefined,
    typing: false, typingCheckedAt: -Infinity, typingW: 0, walkW: 0, lean: 0, nod: 0,
    tiltAt: -Infinity, waveAt: -Infinity, hitAt: -Infinity, hopAt: -Infinity
  })

  useFrame((state, delta) => {
    const group = placer.current
    if (!group) return
    const st = motion.current
    const t = state.clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    const rec = getAgent(agentId)

    // ── the pop: the move between the canvas and the world, and arriving ──
    const nowMs = performance.now()
    bornAt.current ??= nowMs
    const moved = popOf(transition.sample(nowMs).raw, delayRef.current)
    const arrived = reducedRef.current ? 1 : easeInOutCubic((nowMs - bornAt.current) / ARRIVE_MS)
    pop.current = Math.min(moved, arrived)
    if (bob.current) {
      bob.current.visible = pop.current > 1e-3
      bob.current.scale.setScalar(Math.max(pop.current, 1e-4))
    }

    // ── events → one-shots ────────────────────────────────────────────────
    if (rec && rec !== st.rec) {
      st.rec = rec
      for (const event of rec.events) {
        if (event.seq <= st.cursor) continue
        if (hopsOn(event)) st.hopAt = t
        const fx = effectOf(event)
        if (fx === 'tilt') st.tiltAt = t
        else if (fx === 'wave') st.waveAt = t
        else if (fx === 'hit') st.hitAt = t
      }
      st.cursor = Math.max(st.cursor, rec.lastSeq)
      st.typingCheckedAt = -Infinity
    }
    // An open call goes stale with the clock, not with an event, so look again.
    if (rec && t - st.typingCheckedAt > 0.5) {
      st.typing = isTyping(rec, Date.now())
      st.typingCheckedAt = t
    }

    // ── where to be, and getting there ───────────────────────────────────
    const here = latest.current
    const goal = goalOf(rec?.status ?? 'idle', here.conductor)
    const slot = goal === 'table' ? here.seat : (here.home ?? here.seat)
    const dx = slot.x - group.position.x
    const dz = slot.z - group.position.z
    const dist = Math.hypot(dx, dz)
    let targetYaw = slot.facing
    if (!st.ready) {
      // First sight: stand in place. Walking in from the origin would be a
      // stroll nobody's event asked for.
      group.position.set(slot.x, 0, slot.z)
      st.yaw = slot.facing
      st.ready = true
    } else if (dist > (st.moving ? 0.04 : 0.12)) {
      st.moving = true
      const step = Math.min(dist, WALK_SPEED * dt)
      group.position.x += (dx / dist) * step
      group.position.z += (dz / dist) * step
      targetYaw = Math.atan2(dx, dz)
    } else {
      st.moving = false
      group.position.x = slot.x
      group.position.z = slot.z
    }
    st.yaw = dampAngle(st.yaw, targetYaw, st.moving ? 14 : 8, dt)
    group.rotation.y = st.yaw

    // ── the body: every layer a damped weight times a sine ────────────────
    const typing = st.typing && !st.moving
    const thinking = rec?.status === 'thinking' && !st.moving
    st.typingW = damp(st.typingW, typing ? 1 : 0, 9, dt)
    st.walkW = damp(st.walkW, st.moving ? 1 : 0, 10, dt)
    st.lean = damp(st.lean, leanOf(rec?.status ?? 'idle', typing, st.moving), 6, dt)
    st.nod = damp(st.nod, typing ? 0.14 : thinking ? -0.16 : 0, 5, dt)
    const step = Math.sin(t * STEP_HZ)
    const shakeU = (t - st.hitAt) / SHAKE_S
    const shake = shakeU >= 0 && shakeU < 1 ? Math.sin(shakeU * 26) * 0.12 * (1 - shakeU) : 0

    if (lean.current) {
      lean.current.rotation.x = st.lean
      lean.current.rotation.z = shake + st.walkW * step * 0.07
    }
    const hop = pulse(t, st.hopAt, HOP_S)
    if (hopper.current) {
      hopper.current.position.y = hop * 0.16 + st.walkW * Math.abs(step) * 0.05
      // Stretch on the way up, settle back as it lands.
      hopper.current.scale.set(1 - hop * 0.05, 1 + hop * 0.09, 1 - hop * 0.05)
    }
    if (upper.current) {
      upper.current.position.y = Math.sin(t * 2.1 + phase) * 0.022 * (1 - st.walkW) + st.typingW * Math.abs(Math.sin(t * 8.5)) * 0.012
    }
    if (legL.current && legR.current) {
      legL.current.rotation.x = st.walkW * step * 0.55
      legR.current.rotation.x = -st.walkW * step * 0.55
    }
    const beat = Math.sin(t * 17)
    const wave = Math.min(1, (t - st.waveAt) / 0.25, (st.waveAt + WAVE_S - t) / 0.3)
    const waveW = wave > 0 ? wave : 0
    if (armL.current) {
      armL.current.rotation.x = -st.walkW * step * 0.5 + st.typingW * (-1.0 + beat * 0.18)
      armL.current.rotation.z = -ARM_REST + Math.sin(t * 1.7 + phase) * 0.03 * (1 - st.typingW)
    }
    if (armR.current) {
      armR.current.rotation.x = (st.walkW * step * 0.5 + st.typingW * (-1.0 - beat * 0.18)) * (1 - waveW)
      armR.current.rotation.z = ARM_REST + Math.sin(t * 1.7 + phase + 1) * 0.03 * (1 - st.typingW) + waveW * (2.25 + Math.sin(t * 13) * 0.32)
    }
    if (head.current) {
      head.current.rotation.x = st.nod
      head.current.rotation.y = Math.sin(t * 0.5 + phase) * 0.14 * (1 - st.typingW) * (1 - st.walkW)
      head.current.rotation.z = (thinking ? Math.sin(t * 1.5) * 0.07 : 0) + 0.32 * pulse(t, st.tiltAt, TILT_S)
    }
    if (eyes.current) {
      const blink = ((t + phase * 3) % BLINK_EVERY_S) < 0.11
      eyes.current.scale.y = blink ? 0.12 : 1
    }
  })

  return (
    <group ref={placer}>
      <group ref={bob}>
        <group ref={lean}>
          <group ref={hopper}>
            <group ref={legL} position={[-0.13, HIP_Y, 0]}>
              <mesh geometry={k.leg} material={shell} castShadow />
            </group>
            <group ref={legR} position={[0.13, HIP_Y, 0]}>
              <mesh geometry={k.leg} material={shell} castShadow />
            </group>
            <group ref={upper}>
              <mesh geometry={k.torso} material={shell} position-y={TORSO_Y} scale={[1.06, 1, 0.92]} castShadow />
              <group ref={armL} position={[-SHOULDER.x, SHOULDER.y, 0]}>
                <mesh geometry={k.arm} material={shell} castShadow />
              </group>
              <group ref={armR} position={[SHOULDER.x, SHOULDER.y, 0]}>
                <mesh geometry={k.arm} material={shell} castShadow />
              </group>
              <group ref={head} position-y={HEAD_Y}>
                <mesh geometry={k.head} material={shell} scale={HEAD_SCALE} castShadow />
                <mesh geometry={k.visor} material={k.visorMaterial} />
                <group ref={eyes} position-y={VISOR.y + 0.012}>
                  <mesh geometry={k.halo} material={k.haloMaterial} />
                  <mesh geometry={k.eyes} material={k.eyeMaterial} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
      {status === 'error' ? <ErrorBug /> : null}
      <WorldCard agentId={agentId} y={ROBOT_TOP} layer={cards} pop={pop} compact={compact} />
    </group>
  )
}

/**
 * Flavour for the one state that deserves it: an agent in `error` has a bug.
 * The model pack's Bee circles its robot until the status moves on.
 */
function ErrorBug(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <Bee />
    </Suspense>
  )
}

const BEE_URL = `${import.meta.env.BASE_URL}models/quaternius-platformer/Bee.glb`
const BEE_HEIGHT = 0.42

// BOTH decoders are off, and each fails differently when left on: Draco's
// default path is a CDN the CSP refuses, and drei's Meshopt default
// instantiates a WebAssembly module on first use, which `script-src 'self'`
// (no 'wasm-unsafe-eval') refuses as an unhandled rejection at load. The file
// is plain glTF, so neither decoder has anything to do.
const PLAIN = [false, false] as const

interface BeeRig {
  root: THREE.Object3D
  scale: number
  lift: number
  mixer: THREE.AnimationMixer
  materials: THREE.Material[]
}

function buildBee(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): BeeRig {
  // SkeletonUtils.clone shares materials with the cached glTF; own them so a dispose here frees only this bee's.
  const root = cloneSkinned(gltf.scene)
  const materials: THREE.Material[] = []
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const own = (m: THREE.Material): THREE.Material => { const c = m.clone(); materials.push(c); return c }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
    // A skinned mesh's bounding sphere is the bind pose's; a flapping wing leaves it.
    mesh.frustumCulled = false
  })
  root.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(root, true)
  const size = box.max.y - box.min.y
  const scale = size > 0 ? BEE_HEIGHT / size : 1
  const mixer = new THREE.AnimationMixer(root)
  const flying = gltf.animations.find((clip) => clip.name === 'Flying')
  if (flying) mixer.clipAction(flying).play()
  return { root, scale, lift: -box.min.y * scale, mixer, materials }
}

function Bee(): JSX.Element {
  const gltf = useGLTF(BEE_URL, ...PLAIN)
  const rig = useMemo(() => buildBee(gltf), [gltf])
  useEffect(() => () => {
    rig.mixer.stopAllAction()
    rig.mixer.uncacheRoot(rig.root)
    for (const material of rig.materials) material.dispose()
  }, [rig])
  const group = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(delta, 0.1)
    const a = state.clock.elapsedTime * 2.4
    g.position.set(Math.cos(a) * 0.95, 1.25 + Math.sin(a * 1.9) * 0.14, Math.sin(a) * 0.95)
    g.rotation.y = -a
    rig.mixer.update(dt)
  })
  return (
    <group ref={group}>
      <group scale={rig.scale} position-y={rig.lift}>
        <primitive object={rig.root} />
      </group>
    </group>
  )
}

export const WorldRobot = memo(function WorldRobot(props: WorldRobotProps): JSX.Element {
  return <RobotBody {...props} />
})
