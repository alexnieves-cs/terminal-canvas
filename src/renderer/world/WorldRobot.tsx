import { memo, Suspense, useEffect, useMemo, useRef, type JSX, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getAgent, useAgentStatus } from './agent-world-store'
import { WorldCard } from './WorldCard'
import { agentTint, effectOf, goalOf, isTyping, type Effect, type Station } from './world-scene'
import { ARRIVE_MS, easeInOutCubic, popOf, type WorldTransition } from './world-transition'

/**
 * One agent as a robot: a rigged Quaternius character walking between its desk
 * and the meeting table, its pose a function of the event store.
 *
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library table
 * says why: three.js is +2.2MB in the first chunk if anything static reaches it).
 *
 * Three layers, in the order they land on the skeleton each frame:
 *
 *   1. CLIPS, from the model's own animation set — `Idle`, or `Walk` while the
 *      robot is travelling (to a new desk as the arc re-flows, or to the table
 *      to wait for a person), crossfaded; and one-shots over the idle — `Wave`
 *      for a message, `HitReact` for an error or a failed tool.
 *   2. STATES layered after the mixer by turning bones a little: forearms
 *      working and a bob while a tool call is open ("typing"), a slow sway
 *      while `thinking`.
 *   3. A PULSE: the head tilts once when a thought arrives.
 *
 * Everything is read from `getAgent` inside the frame loop, never from React
 * state, so an event costs a ref read — not a render of a skinned mesh.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **Materials are cloned per robot.** SkeletonUtils.clone shares geometry
 *     AND materials, so tinting the shared `Main` material would repaint every
 *     robot the colour of whichever agent set it last.
 * (2) **History is not replayed.** The event cursor starts at the record's
 *     last seq, so opening the view mid-session does not make every robot wave
 *     and flinch through its ring of fifty events at once.
 * (3) **An overlay is undone before the mixer runs, and re-captured after.**
 *     The mixer writes a bone back only when its sampled value CHANGED since
 *     the last frame, so a bone on a constant track (an idle arm) is never
 *     rewritten — and an additive `rotateX` per frame then compounds until the
 *     robot is tumbling across its desk. Each overlay bone's pre-overlay pose is
 *     kept (`Rig.base`), put back ahead of `mixer.update`, and taken again after
 *     it, so what is added is always added to the CLIP's pose and never to
 *     last frame's. This is measured, not theory: the tumbling is what the
 *     first version did.
 * (4) **Bones are found by `isBone`, not by name alone.** The model has a mesh
 *     node called `Head` ahead of the `Head` bone in traversal order, and
 *     `getObjectByName('Head')` returns the mesh — tilting it moves nothing a
 *     person can see, with no error.
 * (5) **The pop scales `bob`, never `placer`.** `placer` carries the walk and
 *     the status card, and the card's DOM position is projected from it — a
 *     robot scaled to 0 on `placer` drags its card's anchor down to its feet.
 *     `bob` is the robot's body alone, and its origin is the floor, so a scale
 *     there grows the robot from its feet. A scale of exactly 0 is a singular
 *     matrix (three warns on the normal matrix), so the pop floors at 1e-4 and
 *     the body is hidden below that instead.
 */

const MODEL_BASE = `${import.meta.env.BASE_URL}models/quaternius-platformer/`
const CHARACTER_URL = `${MODEL_BASE}Character.glb`
const CHARACTER_GUN_URL = `${MODEL_BASE}Character_Gun.glb`
const BEE_URL = `${MODEL_BASE}Bee.glb`

export const ROBOT_HEIGHT = 1.8
/** World units per second, and how much faster than authored the Walk clip plays to keep the feet from skating. */
const WALK_SPEED = 2.4
const WALK_CLIP_SCALE = 1.3
const FADE_S = 0.25
/** How long the head-tilt pulse lasts. */
const TILT_S = 1.3
/** A queued one-shot older than this is for a moment that has passed. */
const QUEUE_S = 1.0

// Preloaded when this chunk loads, so the first robot does not wait on the
// network behind a Suspense fallback of nothing.
//
// BOTH decoders are off, here and at every useGLTF below, and each fails
// differently when left on: Draco's default path is a CDN the CSP refuses, and
// drei's Meshopt default instantiates a WebAssembly module on first use, which
// `script-src 'self'` (no 'wasm-unsafe-eval') refuses as an unhandled rejection
// at load. These files are plain glTF, so neither decoder has anything to do.
const PLAIN = [false, false] as const
useGLTF.preload(CHARACTER_URL, ...PLAIN)
useGLTF.preload(CHARACTER_GUN_URL, ...PLAIN)

interface Rig {
  root: THREE.Object3D
  /** Uniform scale that makes the model ROBOT_HEIGHT tall, and the lift that stands it on y = 0. */
  scale: number
  lift: number
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  materials: THREE.Material[]
  byName: Map<string, THREE.MeshStandardMaterial[]>
  bones: { head?: THREE.Object3D; armL?: THREE.Object3D; armR?: THREE.Object3D; foreL?: THREE.Object3D; foreR?: THREE.Object3D; torso?: THREE.Object3D }
  /** The overlay bones and each one's pose BEFORE the overlay — see (3) above. */
  overlay: THREE.Object3D[]
  base: THREE.Quaternion[]
}

/**
 * A BONE by name. GLTFLoader strips `.` from node names ("LowerArm.L" →
 * "LowerArmL"), so either spelling matches, and only `isBone` nodes count.
 */
function bone(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  const bare = name.replace(/\./g, '')
  let found: THREE.Object3D | undefined
  root.traverse((o) => {
    if (!found && (o as THREE.Bone).isBone && (o.name === name || o.name === bare)) found = o
  })
  return found
}

function buildRig(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, height: number): Rig {
  const root = cloneSkinned(gltf.scene)
  const materials: THREE.Material[] = []
  const byName = new Map<string, THREE.MeshStandardMaterial[]>()
  const own = (material: THREE.Material): THREE.Material => {
    const copy = material.clone()
    materials.push(copy)
    const list = byName.get(copy.name) ?? []
    list.push(copy as THREE.MeshStandardMaterial)
    byName.set(copy.name, list)
    return copy
  }
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
    // A skinned mesh's bounding sphere is the bind pose's; a swinging arm leaves it.
    mesh.frustumCulled = false
  })
  root.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(root, true)
  const size = box.max.y - box.min.y
  const scale = size > 0 ? height / size : 1
  const mixer = new THREE.AnimationMixer(root)
  const actions = new Map<string, THREE.AnimationAction>()
  for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip))
  const bones = {
    head: bone(root, 'Head'), torso: bone(root, 'Torso'),
    armL: bone(root, 'UpperArm.L'), armR: bone(root, 'UpperArm.R'),
    foreL: bone(root, 'LowerArm.L'), foreR: bone(root, 'LowerArm.R')
  }
  const overlay = Object.values(bones).filter((b): b is THREE.Object3D => b !== undefined)
  return {
    root, scale, lift: -box.min.y * scale, mixer, actions, materials, byName, bones,
    overlay, base: overlay.map((b) => b.quaternion.clone())
  }
}

function disposeRig(rig: Rig): void {
  rig.mixer.stopAllAction()
  rig.mixer.uncacheRoot(rig.root)
  for (const material of rig.materials) material.dispose()
}

/**
 * Paints the model's three body materials from one agent colour: `Main` is the
 * shell, `Main2` its shade, `Main_Light` the trim. Eyes, joints and the gun
 * keep the model's own black, white and grey, so it still reads as a robot.
 */
function tintRig(rig: Rig, tint: string): void {
  const base = new THREE.Color(tint)
  const set = (name: string, color: THREE.Color): void => {
    for (const material of rig.byName.get(name) ?? []) material.color.copy(color)
  }
  set('Main', base)
  set('Main2', base.clone().multiplyScalar(0.55))
  set('Main_Light', base.clone().lerp(new THREE.Color('#ffffff'), 0.55))
}

/** Shortest-arc exponential approach — a yaw that never spins the long way round. */
function dampAngle(current: number, target: number, rate: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * (1 - Math.exp(-rate * dt))
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
  tiltAt: number
  queued: Extract<Effect, 'wave' | 'hit'> | null
  queuedAt: number
  current: THREE.AnimationAction | null
  once: boolean
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
}

function RobotBody({ agentId, station, cards, transition, delay }: WorldRobotProps): JSX.Element {
  const gun = station.index % 2 === 1
  const gltf = useGLTF(gun ? CHARACTER_GUN_URL : CHARACTER_URL, ...PLAIN)
  const rig = useMemo(() => buildRig(gltf, ROBOT_HEIGHT), [gltf])
  useEffect(() => () => disposeRig(rig), [rig])
  const tint = agentTint(agentId)
  useEffect(() => tintRig(rig, tint), [rig, tint])

  // A string snapshot: re-renders on a status CHANGE only, which is when the
  // bug appears or goes. Everything finer-grained is read in the frame loop.
  const status = useAgentStatus(agentId)

  const placer = useRef<THREE.Group>(null)
  const bob = useRef<THREE.Group>(null)
  // This robot's pop (0…1), written by the frame loop and read by its card.
  const pop = useRef(0)
  // The delay is read in the frame loop, which must not be rebuilt for it.
  const delayRef = useRef(delay)
  delayRef.current = delay
  // When this robot first ran a frame — a robot that turns live mid-session, or
  // whose model loaded late, arrives on its own clock instead of blinking in.
  const bornAt = useRef<number | null>(null)
  const fadeToRef = useRef<(name: string, once: boolean) => void>(() => {})
  // The frame loop reads the latest station through a ref: the plan changes as
  // agents arrive, and the loop must not be rebuilt (or its state lost) for it.
  const latest = useRef(station)
  latest.current = station
  const motion = useRef<Motion>({
    ready: false, yaw: 0, moving: false,
    cursor: getAgent(agentId)?.lastSeq ?? -Infinity, rec: undefined,
    typing: false, typingCheckedAt: -Infinity, typingW: 0,
    tiltAt: -Infinity, queued: null, queuedAt: 0,
    current: null, once: false
  })

  const idleName = gun && rig.actions.has('Idle_Gun') ? 'Idle_Gun' : 'Idle'
  const walkName = gun && rig.actions.has('Walk_Gun') ? 'Walk_Gun' : 'Walk'

  useEffect(() => {
    const st = motion.current
    st.current = null
    st.once = false
    const onFinished = (event: { action: THREE.AnimationAction }): void => {
      if (event.action !== st.current || !st.once) return
      st.once = false
      fadeTo(st.moving ? walkName : idleName, false)
    }
    // The one place a clip starts: crossfade from whatever is playing.
    function fadeTo(name: string, once: boolean): void {
      const next = rig.actions.get(name)
      if (!next || (next === st.current && !once)) return
      next.reset()
      next.enabled = true
      next.setEffectiveTimeScale(name === walkName ? WALK_CLIP_SCALE : 1)
      next.setEffectiveWeight(1)
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
      next.clampWhenFinished = once
      if (st.current && st.current !== next) st.current.crossFadeTo(next, FADE_S, false)
      next.play()
      st.current = next
      st.once = once
    }
    rig.mixer.addEventListener('finished', onFinished)
    fadeToRef.current = fadeTo
    fadeTo(idleName, false)
    return () => rig.mixer.removeEventListener('finished', onFinished)
  }, [rig, idleName, walkName])

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
    const arrived = easeInOutCubic((nowMs - bornAt.current) / ARRIVE_MS)
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
        const fx = effectOf(event)
        if (fx === 'tilt') st.tiltAt = t
        else if (fx === 'hit' || (fx === 'wave' && st.queued !== 'hit')) { st.queued = fx; st.queuedAt = t }
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

    // ── clips ────────────────────────────────────────────────────────────
    const fadeTo = fadeToRef.current
    if (st.moving) {
      if (st.once || st.current !== rig.actions.get(walkName)) fadeTo(walkName, false)
      st.queued = null
    } else if (st.once) {
      // A one-shot plays out; its 'finished' event hands back to idle.
    } else if (st.queued && t - st.queuedAt < QUEUE_S) {
      fadeTo(st.queued === 'hit' ? 'HitReact' : 'Wave', true)
      st.queued = null
    } else {
      st.queued = null
      fadeTo(idleName, false)
    }
    for (let i = 0; i < rig.overlay.length; i++) rig.overlay[i]!.quaternion.copy(rig.base[i]!)
    rig.mixer.update(dt)
    for (let i = 0; i < rig.overlay.length; i++) rig.base[i]!.copy(rig.overlay[i]!.quaternion)

    // ── states and the pulse, on top of the clip pose ────────────────────
    st.typingW += ((st.typing && !st.moving ? 1 : 0) - st.typingW) * (1 - Math.exp(-9 * dt))
    const b = rig.bones
    if (st.typingW > 0.01) {
      const w = st.typingW
      const beat = Math.sin(t * 17)
      b.armL?.rotateX(-0.75 * w)
      b.armR?.rotateX(-0.75 * w)
      b.foreL?.rotateX(-0.35 * w + beat * 0.16 * w)
      b.foreR?.rotateX(-0.35 * w - beat * 0.16 * w)
      b.torso?.rotateX(0.07 * w)
    }
    if (bob.current) bob.current.position.y = st.typingW * Math.abs(Math.sin(t * 8.5)) * 0.03
    if (rec?.status === 'thinking' && !st.moving) {
      b.head?.rotateX(-0.12)
      b.head?.rotateZ(Math.sin(t * 1.5) * 0.07)
    }
    const since = t - st.tiltAt
    if (since >= 0 && since < TILT_S) b.head?.rotateZ(0.38 * Math.sin((Math.PI * since) / TILT_S))
  })

  return (
    <group ref={placer}>
      <group ref={bob}>
        <group scale={rig.scale} position-y={rig.lift}>
          <primitive object={rig.root} />
        </group>
      </group>
      {status === 'error' ? <ErrorBug /> : null}
      <WorldCard agentId={agentId} y={ROBOT_HEIGHT + 0.2} layer={cards} pop={pop} />
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

function Bee(): JSX.Element {
  const gltf = useGLTF(BEE_URL, ...PLAIN)
  const rig = useMemo(() => buildRig(gltf, 0.42), [gltf])
  useEffect(() => {
    rig.actions.get('Flying')?.play()
    return () => disposeRig(rig)
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
  return (
    <Suspense fallback={null}>
      <RobotBody {...props} />
    </Suspense>
  )
})
