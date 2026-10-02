import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type JSX, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { WorldBloom } from './WorldBloom'
import { acesPreimage, useBloomOn } from './world-bloom'
import { WorldChrome } from './WorldChrome'
import { WorldOffice } from './WorldOffice'
import { WorldRobot } from './WorldRobot'
import { STUDIO } from './world-palette'
import { cardTiers, clampDpr, createDprGovernor, DPR_MAX, DPR_MIN, type CardCandidate } from './world-perf'
import { getAgentIds } from './agent-world-store'
import { useRoster } from './world-roster'
import { stationPlan, type RosterEntry, type Station } from './world-scene'
import { dollyBy, glide, isoPose, ORBIT_TARGET, slabHalf, VIEW, ZOOM_STEP, type CameraApi } from './world-set'
import { dollyAt, LEAVE_MS, popDelays, settleLeavers, type Leaver, type Vec3, type WorldTransition } from './world-transition'

/**
 * The 3D world view: every live agent in the event store as a robot at its own
 * desk, with a meeting table in the middle. The scene reads ONLY the store —
 * nothing here, in this file or any other under world/, touches the bridge or
 * a socket — so a simulated agent, a real session and a teammate's all arrive
 * the same way.
 *
 * Reached only through `lazy()` in WorldStage, and this is the root of the
 * file set CLAUDE.md's library table names (`three`, fiber, drei, here and in
 * WorldOffice / WorldRobot / WorldCard). A static import from anything
 * Canvas.tsx reaches puts three.js in the first chunk — +2.2MB, no error, no
 * red suite.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **No `<Environment>`.** drei's default fetches an HDR from a CDN, which
 *     the renderer's CSP (`default-src 'self'`) refuses — the lights come out
 *     flat and nothing is logged but a blocked request. Light is a hemisphere
 *     and two directional lights, all in-scene; the robots' and the table's
 *     gloss is a `RoomEnvironment` built in code (world-gloss.ts).
 * (2) **The studio's light is tuned for ACES.** The canvas is NOT `flat`: the
 *     renderer tone-maps with ACESFilmic (the reference's high-key look), which
 *     rolls highlights off and greys a saturated colour, so the unlit things
 *     (the trim, the eyes, the board) say `toneMapped={false}` and the lit ones
 *     are lit for it. Put `flat` back and the whole room re-lights brighter and
 *     flatter with no error. With bloom on (M420) the composer applies the SAME
 *     ACES (WorldBloom's header, (2)) and `toneMapped={false}` stops meaning
 *     anything, which is why the ground is painted as a pre-image below.
 * (3) **`shadows="percentage"`, not `true` or `"soft"`.** three r186 REMOVED
 *     `PCFSoftShadowMap`: asking for it (R3F's default for `true`) logs a
 *     warning and falls back to `PCFShadowMap` — which is now the soft one,
 *     filtered by a rotated Vogel disk whose width is `shadow.radius`. Say what
 *     you get. The key light's shadow camera is sized to the platform
 *     (`Lights`) and must follow it when the room grows, or the far robots stand
 *     outside the map and cast nothing.
 * (4) **The camera cannot go under the floor** — `maxPolarAngle` stops well
 *     short of the horizon, and the slab's top is the floor — and a pan is
 *     clamped to the room, because a pan moves the orbit's TARGET and an
 *     unbounded one can carry the view out of the scene.
 * (4b) **`frameloop="always"`, on purpose.** The Watch lens renders on demand
 *     because it is a still image between events. Here the robots' idle
 *     motion is the point, so something moves every frame; the cost is held
 *     down by a capped pixel ratio (and `QualityGovernor`, which steps it
 *     down further if the frame rate stays low), a few hundred draw calls
 *     including the shadow pass, and a budget of full cards (`CardBudget`) —
 *     the rest are dots.
 * (5) **The orbit controls are OFF while the camera is travelling, and the
 *     rest pose is whatever the orbit last held.** OrbitControls rebuilds the
 *     camera from its own spherical state on every `update()`, so a dolly
 *     written onto the camera while it is enabled is overwritten the same
 *     frame and the opening shot never plays — no error, the room just
 *     appears. `TransitionRig` therefore disables the controls for the move,
 *     writes the camera itself, and on arrival re-enables them and calls
 *     `update()` once so the orbit picks up from where the shot ended. While
 *     at rest it copies the camera's position into `rest` every frame, so
 *     leaving dollies back out from where a person left the view and not from
 *     the opening pose (the camera would jump to it first). The overlay's
 *     "Fit room" and zoom buttons are glides under the SAME rule — the rig
 *     disables the controls, writes the camera, and re-enables them — and the
 *     rig's own hand-back at rest steps aside while one is running, or it would
 *     snap the camera to the rest pose on the first frame of the glide.
 * (6) **Nothing here disposes the renderer.** R3F's own unmount frees the
 *     scene, the renderer and then loses its context (forceContextLoss) — and
 *     it tracks each unmount with a token that StrictMode's simulated
 *     unmount/remount does not trip. A cleanup of ours that also called
 *     `gl.dispose()` would kill the live context of the remount.
 */

/**
 * The studio's light: a white hemisphere over a pale-gray ground colour (the
 * soft, shadowless fill that makes the room high-key), one KEY directional
 * from the front-right that casts the soft shadows, and a faint cool fill from
 * the opposite side so the shadowed faces are not black. `extent` is the
 * platform's half-width plus a margin: the key's shadow camera is an
 * orthographic box over it, re-fitted when the room grows.
 */
function Lights({ extent }: { extent: number }): JSX.Element {
  const key = useRef<THREE.DirectionalLight>(null)
  useLayoutEffect(() => {
    const light = key.current
    if (!light) return
    const cam = light.shadow.camera
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = extent * 4
    cam.updateProjectionMatrix()
  }, [extent])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#c3cad6', 0.95]} />
      <directionalLight
        ref={key}
        position={[extent * 0.7, extent * 1.5, extent * 0.55]}
        intensity={1.7}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-radius={3.5}
        shadow-intensity={0.6}
      />
      <directionalLight position={[-extent, extent * 0.5, -extent * 0.4]} intensity={0.4} color="#dbe6ff" />
    </>
  )
}

/** Keeps the orbit's target inside the room, moving the camera with it so the view slides instead of tilting. */
type OrbitControlsRef = ComponentRef<typeof OrbitControls>

function useRoomClamp(controls: RefObject<OrbitControlsRef | null>, limit: number) {
  const camera = useThree((s) => s.camera)
  return useCallback(() => {
    const c = controls.current
    if (!c) return
    const t = c.target
    const r = Math.hypot(t.x, t.z)
    const k = r > limit ? limit / r : 1
    const y = Math.min(2.2, Math.max(0.3, t.y))
    if (k === 1 && y === t.y) return
    const nx = t.x * k
    const nz = t.z * k
    camera.position.x += nx - t.x
    camera.position.y += y - t.y
    camera.position.z += nz - t.z
    t.set(nx, y, nz)
  }, [camera, controls, limit])
}

function Controls({ controls, limit, maxDistance }: { controls: RefObject<OrbitControlsRef | null>; limit: number; maxDistance: number }): JSX.Element {
  const clamp = useRoomClamp(controls, limit)
  return (
    <OrbitControls
      ref={controls}
      target={[ORBIT_TARGET.x, ORBIT_TARGET.y, ORBIT_TARGET.z]}
      enableDamping
      dampingFactor={0.08}
      minDistance={VIEW.minDistance}
      maxDistance={maxDistance}
      minPolarAngle={VIEW.minPolar}
      maxPolarAngle={VIEW.maxPolar}
      screenSpacePanning={false}
      onChange={clamp}
    />
  )
}

/** How long a "Fit room" glide and a zoom step take, ms. */
const FIT_MS = 700
const ZOOM_MS = 260

interface Glide {
  from: Vec3
  to: Vec3
  fromTarget: Vec3
  toTarget: Vec3
  at: number
  span: number
}

const copyOf = (v: { x: number; y: number; z: number }): Vec3 => ({ x: v.x, y: v.y, z: v.z })
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k })

/**
 * The opening and closing shot: the camera dollies between a high, wide pose
 * and the resting orbit as the transition runs. See (5) in the header. The same
 * rig runs the overlay's camera buttons (`api`): a glide to the opening angle
 * for the room as it is now, or one step in or out along the line to the target.
 */
function TransitionRig({ transition, start, controls, api, arcRadius, reduced }: { transition: WorldTransition; start: Vec3; controls: RefObject<OrbitControlsRef | null>; api: RefObject<CameraApi | null>; arcRadius: number; reduced: boolean }): null {
  const camera = useThree((s) => s.camera)
  const rest = useRef<Vec3>(start)
  const gliding = useRef<Glide | null>(null)
  // Read at the click, not at mount: the room has grown since the view opened.
  const arc = useRef(arcRadius)
  arc.current = arcRadius
  const snap = useRef(reduced)
  snap.current = reduced

  useEffect(() => {
    const begin = (to: Vec3, toTarget: Vec3, span: number): void => {
      const c = controls.current
      if (!c) return
      gliding.current = { from: copyOf(camera.position), to, fromTarget: copyOf(c.target), toTarget, at: performance.now(), span: snap.current ? 0 : span }
    }
    api.current = {
      fit: () => begin(isoPose(arc.current), ORBIT_TARGET, FIT_MS),
      zoom: (direction) => {
        const c = controls.current
        if (!c) return
        const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
        begin(dollyBy(camera.position, c.target, factor, c.minDistance, c.maxDistance), copyOf(c.target), ZOOM_MS)
      }
    }
    return () => { api.current = null }
  }, [api, camera, controls])

  useFrame(() => {
    const c = controls.current
    const now = performance.now()
    const s = transition.sample(now)
    const atRest = s.settled && s.target === 1
    // A glide belongs to the resting view; a move to or from the canvas ends it.
    if (!atRest) gliding.current = null
    const g = gliding.current
    if (atRest && g && c) {
      const k = glide(now - g.at, g.span)
      c.enabled = false
      const at = mix(g.from, g.to, k)
      const look = mix(g.fromTarget, g.toTarget, k)
      camera.position.set(at.x, at.y, at.z)
      c.target.set(look.x, look.y, look.z)
      camera.lookAt(look.x, look.y, look.z)
      if (k >= 1) {
        gliding.current = null
        c.enabled = true
        c.update()
      }
      return
    }
    if (atRest) {
      if (c && !c.enabled) {
        // The shot just ended: stand on the rest pose and hand the camera back.
        camera.position.set(rest.current.x, rest.current.y, rest.current.z)
        camera.lookAt(ORBIT_TARGET.x, ORBIT_TARGET.y, ORBIT_TARGET.z)
        c.enabled = true
        c.update()
      }
      rest.current = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
      return
    }
    if (c) c.enabled = false
    const at = dollyAt(rest.current, ORBIT_TARGET, s.eased)
    camera.position.set(at.x, at.y, at.z)
    camera.lookAt(ORBIT_TARGET.x, ORBIT_TARGET.y, ORBIT_TARGET.z)
  }, -2)
  return null
}

/** Frames per second and draw load, written straight to a DOM node — a React state here would re-render the readout 60 times a second. */
function StatsProbe({ target }: { target: RefObject<HTMLDivElement | null> }): null {
  const info = useThree((s) => s.gl.info)
  const acc = useRef({ frames: 0, since: 0, calls: 0, tris: 0 })
  // gl.info resets on EVERY render() call, and a frame here can be several
  // (a pass of ours, then the scene), so left alone it reports only the last
  // one — "1 call, 0 triangles". Reset by hand, once per frame, at a priority
  // below the default so it runs before any pass; the totals read on the next
  // frame are then the whole of the one before. (Negative priority only: a
  // positive one would take the render away from R3F.)
  useEffect(() => {
    info.autoReset = false
    return () => { info.autoReset = true }
  }, [info])
  useFrame((state) => {
    const a = acc.current
    a.frames++
    a.calls = info.render.calls
    a.tris = info.render.triangles
    info.reset()
    const now = state.clock.elapsedTime
    if (a.since === 0) a.since = now
    if (now - a.since < 0.5) return
    const el = target.current
    if (el) {
      const fps = Math.round(a.frames / (now - a.since))
      el.textContent = `${fps} fps · ${a.calls} calls · ${Math.round(a.tris / 1000)}k tris`
      el.dataset.fps = String(fps)
    }
    a.frames = 0
    a.since = now
  }, -1)
  return null
}

/**
 * Steps the pixel ratio down when the frame rate stays low. Reads the same
 * once-per-half-second window `StatsProbe` writes to the readout, but through
 * its own frame hook so neither depends on the other being mounted.
 */
function QualityGovernor(): null {
  const setDpr = useThree((s) => s.setDpr)
  const governor = useRef(createDprGovernor(clampDpr(window.devicePixelRatio)))
  const acc = useRef({ frames: 0, since: 0 })
  useFrame((state) => {
    const a = acc.current
    const now = state.clock.elapsedTime
    if (a.since === 0) a.since = now
    a.frames++
    const span = now - a.since
    if (span < 0.5) return
    // A window much longer than half a second means the loop stalled (a hidden
    // window, a long model load): that is not a frame rate to act on.
    if (span > 1.5) governor.current.gap()
    else {
      const next = governor.current.observe(a.frames / span)
      if (next !== null) setDpr(next)
    }
    a.frames = 0
    a.since = now
  }, -1)
  return null
}

/**
 * Which agents get the FULL status card: the nearest few to the camera
 * (`cardTiers`), re-ranked four times a second and only re-rendered when the
 * set actually changes. A robot's station is its desk, not its live position —
 * a walk to the table is a few metres and would only shuffle the ranking
 * between agents that were close anyway.
 */
function CardBudget({ stations, onChange }: { stations: readonly Station[]; onChange: (full: ReadonlySet<string>) => void }): null {
  const camera = useThree((s) => s.camera)
  const current = useRef<ReadonlySet<string>>(new Set())
  const last = useRef(-Infinity)
  const stationsRef = useRef(stations)
  stationsRef.current = stations
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (t - last.current < 0.25) return
    last.current = t
    const candidates: CardCandidate[] = stationsRef.current.map((station) => {
      const at = station.home ?? station.seat
      return { agentId: station.agentId, distance: Math.hypot(camera.position.x - at.x, camera.position.z - at.z) }
    })
    const next = cardTiers(candidates, current.current)
    if (next === current.current) return
    current.current = next
    onChange(next)
  })
  return null
}

/**
 * The agents that are mid-leave (M417): an agent that stops being live leaves
 * the live roster at once, but keeps its place in the ROOM for `LEAVE_MS` so its
 * robot and desk play the leave (`leavePose`) where they stood — and only then
 * does the plan re-flow without it. Re-flowing at once (the first cut) slid
 * every other desk, and resized the slab, under the robot that was sinking: the
 * fresh-context critic read the leave as a glitch for exactly that.
 *
 * Derived DURING render from the previous roster, not in an effect: the render
 * that drops an agent would otherwise commit first and unmount its robot, and
 * the effect would mount a fresh one — on its own clock, growing IN where it
 * should be leaving. Its key and its place in the one robot array are unchanged,
 * so a robot that turns live again mid-leave is the same instance standing back up.
 */
function useLeavers(roster: readonly RosterEntry[], reduced: boolean): ReadonlyMap<string, Leaver<RosterEntry>> {
  const span = reduced ? 0 : LEAVE_MS
  const [track, setTrack] = useState(() => ({ roster, leaving: new Map() as ReadonlyMap<string, Leaver<RosterEntry>> }))
  let current = track
  if (track.roster !== roster) {
    current = { roster, leaving: settleLeavers(track.leaving, track.roster, roster, performance.now(), span) }
    setTrack(current)
  }
  const leaving = current.leaving
  // One timer for the soonest to finish; the settle after it drops every one that has.
  useEffect(() => {
    if (leaving.size === 0) return
    const soonest = Math.min(...[...leaving.values()].map((l) => l.at)) + span
    const timer = window.setTimeout(() => {
      setTrack((t) => {
        const next = settleLeavers(t.leaving, t.roster, t.roster, performance.now(), span)
        return next === t.leaving ? t : { roster: t.roster, leaving: next }
      })
    }, Math.max(0, soonest - performance.now()) + 16)
    return () => window.clearTimeout(timer)
  }, [leaving, span])
  return leaving
}

/** The live roster with the leavers still in it, in the store's first-seen order — the room as it stands until each leave is over. */
function heldRoster(roster: readonly RosterEntry[], leaving: ReadonlyMap<string, Leaver<RosterEntry>>): readonly RosterEntry[] {
  if (leaving.size === 0) return roster
  const byId = new Map<string, RosterEntry>(roster.map((a) => [a.agentId, a]))
  for (const [id, leaver] of leaving) byId.set(id, leaver.station)
  return getAgentIds().filter((id) => byId.has(id)).map((id) => byId.get(id)!)
}

export function WorldView({ transition, reduced }: { transition: WorldTransition; reduced: boolean }): JSX.Element {
  const roster = useRoster()
  const bloom = useBloomOn()
  const leavers = useLeavers(roster, reduced)
  const held = useMemo(() => heldRoster(roster, leavers), [roster, leavers])
  const plan = useMemo(() => stationPlan(held), [held])
  // Every station in the room, the leaving included: ONE array, because React
  // scopes keys to an array and a robot moved between two would be a remount.
  const stations = useMemo(() => [...plan.stations.values()], [plan])
  const leftAt = useMemo(() => new Map([...leavers].map(([id, l]) => [id, l.at])), [leavers])
  // The card ranking is for the live: a leaver keeps the card it had (WorldRobot) and takes no one's.
  const live = useMemo(() => stations.filter((station) => !leftAt.has(station.agentId)), [stations, leftAt])
  // Each robot's pop is delayed by how far it stands from the middle of the room.
  const delays = useMemo(() => {
    const list = stations.map((station) => {
      const at = station.home ?? station.seat
      return Math.hypot(at.x, at.z)
    })
    const pops = popDelays(list)
    // prefers-reduced-motion: every robot appears with the first, not in a wave.
    return new Map(stations.map((station, i) => [station.agentId, reduced ? 0 : pops[i]!]))
  }, [stations, reduced])
  // Until the first ranking (a quarter second) every card is full, so the room never opens bare.
  const [full, setFull] = useState<ReadonlySet<string> | null>(null)
  const stats = useRef<HTMLDivElement>(null)
  const cards = useRef<HTMLDivElement>(null)
  const controls = useRef<OrbitControlsRef>(null)
  // The overlay's "Fit room" and zoom buttons call this; TransitionRig fills it in.
  const camera = useRef<CameraApi | null>(null)
  // Framed for the room as it is when the view opens; "Fit room" re-frames it for the room as it is then.
  const start = useMemo((): Vec3 => isoPose(plan.arcRadius), [])
  // The ground is unlit, and the bloom's tone map would darken it; paint the value that comes out right.
  const ground = useMemo(() => {
    const c = new THREE.Color(STUDIO.ground)
    return bloom ? c.setRGB(...acesPreimage([c.r, c.g, c.b])) : c
  }, [bloom])
  const half = slabHalf(plan.arcRadius)
  const limit = half - 2

  return (
    <div className="world-view" data-world-view>
      <Canvas
        shadows="percentage"
        dpr={[DPR_MIN, DPR_MAX]}
        camera={{ position: [start.x, start.y, start.z], fov: VIEW.fov, near: 0.1, far: 220 }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
        <color attach="background" args={[ground]} />
        <Lights extent={half + 3} />
        <WorldOffice stations={stations} leftAt={leftAt} arcRadius={plan.arcRadius} reduced={reduced} />
        {stations.map((station) => (
          <WorldRobot key={station.agentId} agentId={station.agentId} station={station} cards={cards} transition={transition} delay={delays.get(station.agentId) ?? 0} compact={leftAt.has(station.agentId) || (full !== null && !full.has(station.agentId))} reduced={reduced} leftAt={leftAt.get(station.agentId) ?? null} />
        ))}
        <Controls controls={controls} limit={limit} maxDistance={Math.max(40, half * 4)} />
        <TransitionRig transition={transition} start={start} controls={controls} api={camera} arcRadius={plan.arcRadius} reduced={reduced} />
        {bloom && <WorldBloom />}
        <StatsProbe target={stats} />
        <QualityGovernor />
        <CardBudget stations={live} onChange={setFull} />
      </Canvas>
      <div className="world-view__cards" ref={cards} />
      <WorldChrome camera={camera} />
      <div className="world-view__stats" ref={stats} aria-hidden="true" />
    </div>
  )
}
