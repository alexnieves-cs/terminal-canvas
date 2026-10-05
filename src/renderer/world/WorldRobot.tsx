import { memo, Suspense, useEffect, useMemo, useRef, useState, type JSX, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getAgent, getAgentIds, replayAt, useAgentStatus, worldNow } from './agent-world-store'
import { WorldCard } from './WorldCard'
import { glowScale } from './world-bloom'
import { robotLod, type RobotLod } from './world-perf'
import { useBloomRendered } from './world-quality'
import { studioEnv } from './world-gloss'
import { activityOf, openDelegations, poseOf, POSES, type Activity, type Pose } from './world-activity'
import { agentTint, effectOf, goalOf, hopsOn, leanOf, type Station } from './world-scene'
import { worldActions } from './world-context-store'
import { CLICK_SLOP_PX, isRepeatClick, OPEN_HINT, openableFrom, selectAgent, useSelectedAgent } from './world-select'
import { contactBlob, CONTACT, SHELL_RIM } from './world-set'
import { ARRIVE_MS, easeInOutCubic, leavePose, popOf, type WorldTransition } from './world-transition'

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
 * (3b) **A leave sinks `bob` through the floor** (M417, `leavePose`): the same
 *     node the pop scales, moved down, so the card on `placer` stays where the
 *     robot stood and fades on its own, earlier curve (`LeavePose.card`). A robot
 *     whose agent went idle keeps its place in the plan, and its key, until the
 *     leave is over (`useLeavers`, WorldView); the room re-flows after.
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

/** M423: at most this many sub-agents orbit a robot, this small, this far out, this high. */
const SUB_MAX = 3
const SUB_SCALE = 0.34
const SUB_RADIUS = 0.95
const SUB_Y = 0.75

/** Every number a pose has, damped one by one toward the activity's. */
const POSE_KEYS = Object.keys(POSES.rest) as (keyof Pose)[]

interface Kit {
  leg: THREE.BufferGeometry
  torso: THREE.BufferGeometry
  arm: THREE.BufferGeometry
  head: THREE.BufferGeometry
  visor: THREE.BufferGeometry
  eyes: THREE.BufferGeometry
  halo: THREE.BufferGeometry
  /** The ring over the head while a test runs or a sub-agent is out (M422). */
  ring: THREE.BufferGeometry
  /** The floor ring under the robot a person picked. */
  pick: THREE.BufferGeometry
  /** The contact blob's quad, flat on the floor, and its soft round falloff (the richness pass). */
  blob: THREE.BufferGeometry
  blobTexture: THREE.Texture
  visorMaterial: THREE.MeshPhysicalMaterial
  eyeMaterial: THREE.MeshBasicMaterial
  haloMaterial: THREE.MeshBasicMaterial
  ringMaterial: THREE.MeshBasicMaterial
}

/** A soft elliptical falloff, drawn in code (the CSP takes no image from elsewhere, and this needs none). */
/** The eyes' unlit colour, before any bloom boost. */
const EYE_COLOR = '#7ff4ff'

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

/** The contact blob's alpha: dense under the feet, gone by the edge — a smoother falloff than the eyes' halo, because a ring at its rim would read as a decal. */
function contactTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.4, '#a0a0a0')
  grad.addColorStop(0.75, '#2a2a2a')
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
  // the price of a quad instead of a full-screen pass. It is the bloom-off look;
  // with `WorldBloom` on, the eyes are also pushed past 1.0 and bloom around it.
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
    // A broken ring (three quarters of a torus), so its turning reads at any distance.
    ring: new THREE.TorusGeometry(0.26, 0.022, 8, 40, Math.PI * 1.5).rotateX(Math.PI / 2),
    pick: new THREE.RingGeometry(0.46, 0.53, 56).rotateX(-Math.PI / 2),
    blob: new THREE.PlaneGeometry(CONTACT.radius * 2, CONTACT.radius * 2).rotateX(-Math.PI / 2),
    blobTexture: contactTexture(),
    visorMaterial: new THREE.MeshPhysicalMaterial({ color: '#07090d', roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.7 }),
    // Unlit and outside tone mapping: a glow that reads the same in a light or a dark room.
    eyeMaterial: new THREE.MeshBasicMaterial({ color: EYE_COLOR, toneMapped: false }),
    haloMaterial: new THREE.MeshBasicMaterial({ color: '#39e6ff', alphaMap: glowTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    ringMaterial: new THREE.MeshBasicMaterial({ color: '#39e6ff', transparent: true, opacity: 0.9, toneMapped: false })
  }
  return kit
}

/**
 * The shell, in the agent's tint as it is (`ROBOT_TINTS`, world-palette.ts):
 * the palette is already candy-bright and pre-darkened for ACES, and a
 * saturation push here — what M415 did to the presence hash — would turn the
 * white robot grey-blue and the graphite one a muddy colour.
 */
function shellMaterial(tint: string, env: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint), roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15,
    envMap: env, envMapIntensity: 0.4,
    // The rim (SHELL_RIM, world-set.ts): a grazing-angle lobe, so the silhouette reads against the pale slab.
    sheen: SHELL_RIM.sheen, sheenRoughness: SHELL_RIM.roughness, sheenColor: new THREE.Color(SHELL_RIM.color)
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
  /** It was mid-leave on the last frame. */
  left: boolean
  yaw: number
  moving: boolean
  cursor: number
  rec: ReturnType<typeof getAgent>
  /** What the hands are on (`activityOf`), re-read twice a second — an open call goes stale with the clock. */
  activity: Activity
  activityCheckedAt: number
  /** The pose as it is NOW, damped toward `POSES[activity]` every frame. */
  pose: Pose
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
  /** performance.now() when its agent stopped being live, or null while it is (see `leavePose`). */
  leftAt: number | null
}

function RobotBody({ agentId, station, cards, transition, delay, compact, reduced, leftAt }: WorldRobotProps): JSX.Element {
  const k = robotKit()
  const gl = useThree((s) => s.gl)
  const env = useMemo(() => studioEnv(gl), [gl])
  useEffect(() => {
    k.visorMaterial.envMap = env
    k.visorMaterial.needsUpdate = true
  }, [k, env])
  // The eyes are unlit; with bloom on they are pushed past 1.0 so the composer
  // has something to bloom, and off they are the plain colour (world-bloom.ts).
  // The kit is shared by every robot, so each writes the same value.
  const bloom = useBloomRendered()
  useEffect(() => {
    k.eyeMaterial.color.set(EYE_COLOR).multiplyScalar(glowScale(EYE_COLOR, bloom))
  }, [k, bloom])
  // The first-seen order is append-only, so an agent's place in it — and its tint — never moves.
  const tint = agentTint(agentId, getAgentIds())
  const shell = useMemo(() => shellMaterial(tint, env), [tint, env])
  useEffect(() => () => shell.dispose(), [shell])

  // A string snapshot: re-renders on a status CHANGE only, which is when the
  // bug appears or goes. Everything finer-grained is read in the frame loop.
  const status = useAgentStatus(agentId)
  const picked = useSelectedAgent() === agentId

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
  const ring = useRef<THREE.Mesh>(null)
  const blob = useRef<THREE.Mesh>(null)
  // Per robot, because its opacity is this robot's hop; the texture under it is the kit's, shared.
  const blobMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#1b2030', alphaMap: k.blobTexture, transparent: true, depthWrite: false, toneMapped: false }), [k])
  useEffect(() => () => blobMaterial.dispose(), [blobMaterial])
  // M433. The level of detail: the meshes that cast, and the halo — both dropped for a far robot (`robotLod`).
  const casters = useRef(new Set<THREE.Mesh>())
  const cast = (mesh: THREE.Mesh | null): void => { if (mesh) casters.current.add(mesh) }
  const halo = useRef<THREE.Mesh>(null)
  const lod = useRef<RobotLod | null>(null)
  const camera = useThree((s) => s.camera)
  const viewHeight = useThree((s) => s.size.height)
  // M423: the sub-agents it has out — a small robot each, orbiting it, while the delegation is open.
  const [subs, setSubs] = useState(0)
  const subsRef = useRef(0)
  const orbit = useRef<THREE.Group>(null)
  // This robot's pop (0…1), written by the frame loop and read by its card.
  const pop = useRef(0)
  // The delay is read in the frame loop, which must not be rebuilt for it.
  const delayRef = useRef(delay)
  delayRef.current = delay
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  const leftAtRef = useRef(leftAt)
  leftAtRef.current = leftAt
  // fiber drops an unmounted object from its hovered set WITHOUT a pointerout, so a robot that sinks
  // under a resting pointer would leave its hint and the pointer cursor on the canvas over bare floor.
  const hovered = useRef(false)
  useEffect(() => () => {
    if (!hovered.current) return
    gl.domElement.style.cursor = ''
    gl.domElement.title = ''
  }, [gl])
  // A leaving robot keeps the card it had: it is out of the card ranking the
  // moment it leaves, and a card that vanished on that frame would be the very
  // pop the leave exists to remove. The card fades with the robot's pop instead.
  const cardless = useRef(compact)
  if (leftAt === null) cardless.current = compact
  // When this robot first ran a frame — a robot that turns live mid-session
  // arrives on its own clock instead of blinking in.
  const bornAt = useRef<number | null>(null)
  // The frame loop reads the latest station through a ref: the plan changes as
  // agents arrive, and the loop must not be rebuilt (or its state lost) for it.
  const latest = useRef(station)
  latest.current = station
  const phase = useMemo(() => phaseOf(agentId), [agentId])
  const motion = useRef<Motion>({
    ready: false, left: false, yaw: 0, moving: false,
    cursor: getAgent(agentId)?.lastSeq ?? -Infinity, rec: undefined,
    activity: 'rest', activityCheckedAt: -Infinity, pose: { ...POSES.rest }, walkW: 0, lean: 0, nod: 0,
    tiltAt: -Infinity, waveAt: -Infinity, hitAt: -Infinity, hopAt: -Infinity
  })

  useFrame((state, delta) => {
    const group = placer.current
    if (!group) return
    const st = motion.current
    const t = state.clock.elapsedTime
    const dt = Math.min(delta, 0.1)
    const rec = getAgent(agentId)

    // ── M433: level of detail, from how large the robot is on screen ──
    const away = Math.max(0.1, camera.position.distanceTo(group.position))
    const fov = 'fov' in camera ? (camera.fov as number) : 40
    const nextLod = robotLod(viewHeight / (2 * Math.tan((fov * Math.PI) / 360) * away), lod.current)
    if (nextLod !== lod.current) {
      lod.current = nextLod
      for (const mesh of casters.current) mesh.castShadow = nextLod === 'near'
      if (halo.current) halo.current.visible = nextLod === 'near'
    }

    // ── the pop: the move between the canvas and the world, and arriving ──
    const nowMs = performance.now()
    bornAt.current ??= nowMs
    const moved = popOf(transition.sample(nowMs).raw, delayRef.current)
    // Live again before the leave finished: stand back up on the arrival clock, not with a snap.
    if (leftAtRef.current === null && st.left) { st.left = false; bornAt.current = nowMs }
    if (leftAtRef.current !== null) st.left = true
    const arrived = reducedRef.current ? 1 : easeInOutCubic((nowMs - bornAt.current) / ARRIVE_MS)
    const leave = leftAtRef.current === null ? null : leavePose(nowMs - leftAtRef.current, reducedRef.current ? 0 : undefined)
    const shown = Math.min(moved, arrived)
    // The card reads `pop`; the body its own scale — a leave fades the card sooner than it shrinks the robot.
    pop.current = shown * (leave?.card ?? 1)
    const body = shown * (leave?.scale ?? 1)
    if (bob.current) {
      bob.current.visible = body > 1e-3
      bob.current.scale.setScalar(Math.max(body, 1e-4))
      // Through the floor: the slab is opaque, so what has sunk is hidden without a per-robot fade.
      bob.current.position.y = -(leave?.sink ?? 0)
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
      st.activityCheckedAt = -Infinity
    }
    // An open call goes stale with the clock, not with an event, so look again.
    if (rec && t - st.activityCheckedAt > 0.5) {
      st.activity = activityOf(rec, worldNow())
      st.activityCheckedAt = t
      const out = Math.min(SUB_MAX, openDelegations(rec, worldNow()).length)
      if (out !== subsRef.current) { subsRef.current = out; setSubs(out) }
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
    // The activity's pose (world-activity.ts) is the target; walking overrides
    // the upper body, because a robot crossing the room is walking, whatever
    // its last call was.
    const want = poseOf(st.moving ? 'rest' : st.activity)
    const p = st.pose
    for (const key of POSE_KEYS) p[key] = damp(p[key], want[key], key === 'typeHz' ? 4 : 6, dt)
    st.walkW = damp(st.walkW, st.moving ? 1 : 0, 10, dt)
    st.lean = damp(st.lean, st.moving ? leanOf(rec?.status ?? 'idle', false, true) : p.lean, 6, dt)
    st.nod = damp(st.nod, p.nod, 5, dt)
    const thinking = st.activity === 'think' && !st.moving
    const step = Math.sin(t * STEP_HZ)
    const shakeU = (t - st.hitAt) / SHAKE_S
    const shake = shakeU >= 0 && shakeU < 1 ? Math.sin(shakeU * 26) * 0.12 * (1 - shakeU) : 0
    const tap = p.tap * Math.max(0, Math.sin(t * 5.2 + phase))

    if (lean.current) {
      lean.current.rotation.x = st.lean
      lean.current.rotation.z = shake + st.walkW * step * 0.07
    }
    const hop = pulse(t, st.hopAt, HOP_S)
    if (hopper.current) {
      hopper.current.position.y = hop * 0.16 + st.walkW * Math.abs(step) * 0.05 + tap * 0.02
      // Stretch on the way up, settle back as it lands.
      hopper.current.scale.set(1 - hop * 0.05, 1 + hop * 0.09, 1 - hop * 0.05)
    }
    // The contact blob reads the body's own scale and lift, so it pops, hops and leaves with the robot.
    if (blob.current) {
      const b = contactBlob(hopper.current?.position.y ?? 0, body)
      blob.current.visible = b.opacity > 0.005
      blob.current.scale.setScalar(Math.max(b.scale, 1e-4))
      blobMaterial.opacity = b.opacity
    }
    const beatW = p.type * (1 - st.walkW)
    if (upper.current) {
      upper.current.position.y = Math.sin(t * 2.1 + phase) * 0.022 * (1 - st.walkW) + beatW * Math.abs(Math.sin(t * p.typeHz * 0.5)) * 0.012
    }
    if (legL.current && legR.current) {
      legL.current.rotation.x = st.walkW * step * 0.55
      legR.current.rotation.x = -st.walkW * step * 0.55 - tap * 0.18
    }
    const beat = Math.sin(t * p.typeHz)
    const wave = Math.min(1, (t - st.waveAt) / 0.25, (st.waveAt + WAVE_S - t) / 0.3)
    const waveW = wave > 0 ? wave : 0
    const still = 1 - st.walkW
    // Folded: both forearms forward and across. Hand up: the right arm high and
    // steady. Pointing: the right arm straight out toward the sub-agent.
    const fold = p.fold * still
    const up = Math.max(p.handUp * still, waveW)
    const point = p.point * still
    if (armL.current) {
      armL.current.rotation.x = -st.walkW * step * 0.5 + (p.reach + beatW * beat * 0.18) * still - fold * 1.25
      armL.current.rotation.z = -ARM_REST + Math.sin(t * 1.7 + phase) * 0.03 * (1 - beatW) + fold * 0.85
    }
    if (armR.current) {
      armR.current.rotation.x = (st.walkW * step * 0.5 + (p.reach - beatW * beat * 0.18) * still - fold * 1.25 - point * 1.45) * (1 - up)
      armR.current.rotation.z = ARM_REST + Math.sin(t * 1.7 + phase + 1) * 0.03 * (1 - beatW) - fold * 0.85 + point * 0.25 +
        up * (2.5 + (waveW > p.handUp ? Math.sin(t * 13) * 0.32 : Math.sin(t * 2.4) * 0.05))
    }
    if (head.current) {
      head.current.rotation.x = st.nod
      head.current.rotation.y = Math.sin(t * p.scanHz * 2 + phase) * p.scan * still
      head.current.rotation.z = (thinking ? Math.sin(t * 1.5) * 0.07 : 0) + 0.32 * pulse(t, st.tiltAt, TILT_S)
    }
    if (orbit.current) {
      orbit.current.rotation.y = reducedRef.current ? 0 : t * 0.9
      orbit.current.position.y = SUB_Y + Math.sin(t * 2.3 + phase) * 0.05
    }
    if (ring.current) {
      ring.current.visible = p.ring > 0.02
      ring.current.rotation.y = t * (st.activity === 'delegate' ? 1.6 : 3.2)
      ring.current.scale.setScalar(0.6 + 0.4 * p.ring)
    }
    if (eyes.current) {
      const blink = ((t + phase * 3) % BLINK_EVERY_S) < 0.11
      eyes.current.scale.y = blink ? 0.12 : 1
    }
  })

  return (
    <group
      ref={placer}
      // A click picks it (the card stays full, the ask goes to it); a drag that
      // started on it was an orbit and picks nothing.
      onClick={(event) => {
        if (event.delta > CLICK_SLOP_PX || leftAtRef.current !== null) return
        event.stopPropagation()
        // M429: the second click of a double-click leaves the first one's pick
        // alone — toggling it off here would drop the card the double-click
        // is about to open from.
        if (isRepeatClick(event.nativeEvent.detail)) return
        selectAgent(picked ? null : agentId)
      }}
      // M429. A double-click opens its panel, through the room's open door
      // (Canvas's jump, after the room closes) — the same drag guard as the
      // click: fiber measures `delta` from this press, so a double-click
      // whose second press dragged was an orbit. It (re)picks first, so the
      // robot is picked whatever its first click toggled; an agent with no
      // panel to land on (the simulator's, a teammate's elsewhere), or the
      // past room, is picked and goes nowhere.
      onDoubleClick={(event) => {
        if (event.delta > CLICK_SLOP_PX || leftAtRef.current !== null) return
        event.stopPropagation()
        selectAgent(agentId)
        const actions = worldActions()
        if (openableFrom(agentId, replayAt() !== null, actions)) actions!.open(agentId)
      }}
      // The canvas's own tooltip is the robot's hint (its card layer is deaf
      // to the pointer, so a title there never shows): asked on each hover,
      // because whether it can open changes with the canvas and the replay.
      onPointerOver={(event) => {
        event.stopPropagation()
        hovered.current = true
        gl.domElement.style.cursor = 'pointer'
        // A robot mid-leave opens nothing (both doors refuse it), so it promises nothing either.
        gl.domElement.title = leftAtRef.current === null && openableFrom(agentId, replayAt() !== null, worldActions()) ? OPEN_HINT : ''
      }}
      onPointerOut={() => { hovered.current = false; gl.domElement.style.cursor = ''; gl.domElement.title = '' }}
    >
      {/* Under the pick ring and the slab's trim (renderOrder 0, no depth write), a few mm over the floor paint. */}
      <mesh ref={blob} geometry={k.blob} material={blobMaterial} position-y={0.008} />
      {picked ? <mesh geometry={k.pick} material={k.ringMaterial} position-y={0.02} /> : null}
      <group ref={bob}>
        {subs > 0 ? (
          <group ref={orbit} position-y={SUB_Y}>
            {Array.from({ length: subs }, (_, i) => {
              const a = (i / subs) * Math.PI * 2
              return (
                <group key={i} position={[Math.sin(a) * SUB_RADIUS, 0, Math.cos(a) * SUB_RADIUS]} rotation-y={a} scale={SUB_SCALE}>
                  <mesh geometry={k.torso} material={shell} position-y={TORSO_Y} scale={[1.06, 1, 0.92]} />
                  <group position-y={HEAD_Y}>
                    <mesh geometry={k.head} material={shell} scale={HEAD_SCALE} />
                    <mesh geometry={k.visor} material={k.visorMaterial} />
                    <mesh geometry={k.eyes} material={k.eyeMaterial} position-y={VISOR.y + 0.012} />
                  </group>
                </group>
              )
            })}
          </group>
        ) : null}
        <group ref={lean}>
          <group ref={hopper}>
            <group ref={legL} position={[-0.13, HIP_Y, 0]}>
              <mesh ref={cast} geometry={k.leg} material={shell} castShadow />
            </group>
            <group ref={legR} position={[0.13, HIP_Y, 0]}>
              <mesh ref={cast} geometry={k.leg} material={shell} castShadow />
            </group>
            <group ref={upper}>
              <mesh ref={cast} geometry={k.torso} material={shell} position-y={TORSO_Y} scale={[1.06, 1, 0.92]} castShadow />
              <group ref={armL} position={[-SHOULDER.x, SHOULDER.y, 0]}>
                <mesh ref={cast} geometry={k.arm} material={shell} castShadow />
              </group>
              <group ref={armR} position={[SHOULDER.x, SHOULDER.y, 0]}>
                <mesh ref={cast} geometry={k.arm} material={shell} castShadow />
              </group>
              <group ref={head} position-y={HEAD_Y}>
                <mesh ref={cast} geometry={k.head} material={shell} scale={HEAD_SCALE} castShadow />
                <mesh geometry={k.visor} material={k.visorMaterial} />
                <group ref={eyes} position-y={VISOR.y + 0.012}>
                  <mesh ref={halo} geometry={k.halo} material={k.haloMaterial} />
                  <mesh geometry={k.eyes} material={k.eyeMaterial} />
                </group>
              </group>
            </group>
          </group>
          <mesh ref={ring} geometry={k.ring} material={k.ringMaterial} position-y={ROBOT_TOP + 0.05} visible={false} />
        </group>
      </group>
      {status === 'error' ? <ErrorBug /> : null}
      <WorldCard agentId={agentId} y={ROBOT_TOP} layer={cards} pop={pop} compact={cardless.current} />
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
