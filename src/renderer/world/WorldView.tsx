import { useCallback, useEffect, useMemo, useRef, type ComponentRef, type JSX, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { WorldOffice } from './WorldOffice'
import { WorldRobot } from './WorldRobot'
import { useWorldPalette } from './world-palette'
import { useStationPlan } from './world-roster'
import { dollyAt, popDelays, type Vec3, type WorldTransition } from './world-transition'

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
 *     flat and nothing is logged but a blocked request. Light is two directional
 *     lights and a hemisphere, all in-scene.
 * (2) **The floor sits BELOW the contact-shadow plane** (y = -0.02 vs 0.004).
 *     A floor at the shadow camera's own height is drawn into the depth pass
 *     and shades the whole room.
 * (3) **The camera cannot go under the floor** — `maxPolarAngle` stops short of
 *     the horizon — and a pan is clamped to the room, because a pan moves the
 *     orbit's TARGET and an unbounded one can carry the view out of the scene.
 * (4) **`frameloop="always"`, on purpose.** The Watch lens renders on demand
 *     because it is a still image between events. Here the robots' idle clips
 *     are the point, so something moves every frame; the cost is held down by
 *     a capped pixel ratio, a handful of draw calls and no shadow maps.
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
 *     the opening pose (the camera would jump to it first).
 * (6) **Nothing here disposes the renderer.** R3F's own unmount frees the
 *     scene, the renderer and then loses its context (forceContextLoss) — and
 *     it tracks each unmount with a token that StrictMode's simulated
 *     unmount/remount does not trip. A cleanup of ours that also called
 *     `gl.dispose()` would kill the live context of the remount.
 */

/** The point the orbit looks at, in the middle of the room a little above the floor. */
const ORBIT_TARGET: Vec3 = { x: 0, y: 0.9, z: 0.4 }

function Lights({ dark }: { dark: boolean }): JSX.Element {
  return (
    <>
      <hemisphereLight args={[dark ? '#dfe7ff' : '#ffffff', dark ? '#4a5160' : '#8b93a3', dark ? 1.15 : 1.45]} />
      <directionalLight position={[6, 12, 9]} intensity={dark ? 2.2 : 2.6} />
      <directionalLight position={[-9, 5, -6]} intensity={0.9} color={dark ? '#9bb4ff' : '#c9d6ff'} />
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
      minDistance={4}
      maxDistance={maxDistance}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2 - 0.06}
      screenSpacePanning={false}
      onChange={clamp}
    />
  )
}

/**
 * The opening and closing shot: the camera dollies between a high, wide pose
 * and the resting orbit as the transition runs. See (5) in the header.
 */
function TransitionRig({ transition, start, controls }: { transition: WorldTransition; start: Vec3; controls: RefObject<OrbitControlsRef | null> }): null {
  const camera = useThree((s) => s.camera)
  const rest = useRef<Vec3>(start)
  useFrame(() => {
    const c = controls.current
    const s = transition.sample(performance.now())
    if (s.settled && s.target === 1) {
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
  // gl.info resets on EVERY render() call, and a frame here is several (the
  // contact-shadow pass, then the scene), so left alone it reports only the
  // last one — "1 call, 0 triangles". Reset by hand, once per frame, at a
  // priority below the default so it runs before either pass; the totals read
  // on the next frame are then the whole of the one before. (Negative priority
  // only: a positive one would take the render away from R3F.)
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

export function WorldView({ transition }: { transition: WorldTransition }): JSX.Element {
  const palette = useWorldPalette()
  const { plan } = useStationPlan()
  const stations = useMemo(() => [...plan.stations.values()], [plan])
  // Each robot's pop is delayed by how far it stands from the middle of the room.
  const delays = useMemo(() => {
    const list = stations.map((station) => {
      const at = station.home ?? station.seat
      return Math.hypot(at.x, at.z)
    })
    const pops = popDelays(list)
    return new Map(stations.map((station, i) => [station.agentId, pops[i]!]))
  }, [stations])
  const stats = useRef<HTMLDivElement>(null)
  const cards = useRef<HTMLDivElement>(null)
  const controls = useRef<OrbitControlsRef>(null)
  // Framed for the room as it is when the view opens; a person zooms for a bigger one.
  const start = useMemo((): Vec3 => {
    const dist = Math.max(16, plan.arcRadius * 2.9)
    return { x: 0, y: dist * 0.53, z: dist * 0.82 }
  }, [])
  const limit = plan.arcRadius + 3

  return (
    <div className="world-view" data-world-view>
      <Canvas
        flat
        dpr={[1, 1.75]}
        camera={{ position: [start.x, start.y, start.z], fov: 40, near: 0.1, far: 140 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={[palette.ground]} />
        <fog attach="fog" args={[palette.ground, 20, 46]} />
        <Lights dark={palette.dark} />
        <WorldOffice stations={stations} palette={palette} />
        {stations.map((station) => (
          <WorldRobot key={station.agentId} agentId={station.agentId} station={station} cards={cards} transition={transition} delay={delays.get(station.agentId) ?? 0} />
        ))}
        <ContactShadows position={[0, 0.004, 0]} opacity={palette.dark ? 0.7 : 0.4} scale={plan.arcRadius * 2 + 10} blur={2.2} far={2.4} resolution={512} />
        <Controls controls={controls} limit={limit} maxDistance={Math.max(30, plan.arcRadius * 5)} />
        <TransitionRig transition={transition} start={start} controls={controls} />
        <StatsProbe target={stats} />
      </Canvas>
      <div className="world-view__cards" ref={cards} />
      <div className="world-view__stats" ref={stats} aria-hidden="true" />
    </div>
  )
}
