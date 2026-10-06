import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type JSX, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { WorldBloom } from './WorldBloom'
import { acesPreimage, bloomDprCap, isBloomOn } from './world-bloom'
import { WorldChrome } from './WorldChrome'
import { WorldOffice } from './WorldOffice'
import { WorldRobot } from './WorldRobot'
import { WorldStructure } from './WorldStructure'
import { useWorldContext } from './world-context-store'
import { boxFromStyle, consoleBoxes, frameOf, placeStations, taskOfAgent, terraceFloor, terraceSignFromChip, type CanvasBox, type FloorTerrace } from './world-structure'
import { NIGHT } from './world-palette'
import { cardTiers, clampDpr, statsOn, type CardCandidate } from './world-perf'
import { bloomRenders, createQualityGovernor, getWorldQuality, pinWorldQuality, qualityPlan, readQualityPin, sessionDpr, sessionQuality, SETTLE_WINDOWS, stepSessionDpr, stepWorldQuality, useBloomRendered, useWorldQuality, worldDpr, type QualityGovernor as Governor } from './world-quality'
import { getAgent, getAgentIds } from './agent-world-store'
import { hasArrival, selectAgent, selectedAgent, takeArrival, useFocusedAgent } from './world-select'
import { useRoster, useWaiting } from './world-roster'
import { goalOf, stationPlan, type RosterEntry, type Station } from './world-scene'
import type { CameraPose } from '@shared/redesign-contracts'
import { FLOOR_SCALE } from '@shared/world-space'
import { arcFraming, dollyBy, focusPose, glide, isoPose, ORBIT_TARGET, slabHalf, VIEW, ZOOM_STEP, type CameraApi } from './world-set'
import { dollyAt, LEAVE_MS, motionOf, popDelaysFromTarget, settleLeavers, type Leaver, type Vec3, type WorldTransition } from './world-transition'
import { paintPlanFloor } from './plan-floor'
import { liveView } from './world-camera'
import { setWorldCameraTarget, setWorldCameraWedge, setWorldLandingViewport, worldCameraTarget } from './world-toggle'
import { WorldCameraPanel } from './WorldCameraPanel'

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
 *     down by ONE quality tier (M430, `world-quality.ts`): `full` | `lean` |
 *     `flat`, decided from the MEASURED frame rate by `QualityGovernor` and
 *     never stored. A tier is a plan — whether the bloom may run, the key
 *     light's shadow map (2048, 1024, none: `Lights`), the pixel ratio's cap
 *     and floor, and how many full cards `CardBudget` hands out (the rest are
 *     dots). The ratio steps down inside a tier, the tier steps down at the
 *     ratio's floor, and neither steps back up in a session (the governor's
 *     comment in world-quality.ts says why). The harness pins a tier through
 *     `window.__tcWorldQuality`; the app never writes it, and
 *     `.world-view[data-quality]` says which tier is drawn.
 * (4c) **The pixel ratio is the Canvas's `dpr` PROP, never a `setDpr` alone.**
 *     fiber 9.8 re-applies the prop's ratio on EVERY render of `<Canvas>`
 *     (`applyRootConfiguration`: "the pixel ratio follows the device on every
 *     call"), so a `setDpr` from inside the scene lasts only until this view
 *     next re-renders — a card re-ranking, an agent arriving — and the room
 *     silently goes back to the full ratio. The governor reports the ratio up
 *     (`onDpr`) and this view hands it back down as the prop.
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
function Lights({ extent, shadowMap }: { extent: number; shadowMap: number }): JSX.Element {
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
  // M430: the tier's shadow map. Two facts from three r186's source, each a
  // silent failure if missed:
  //  - three allocates a light's map only while `shadow.map` is null
  //    (WebGLShadowMap.render), so a new `mapSize` alone changes NOTHING — the
  //    old target is disposed and nulled here, and the next frame allocates
  //    one at the new size;
  //  - the switch that makes "no shadows" cost nothing is the LIGHT's
  //    `castShadow`, not the canvas's `shadows` (`gl.shadowMap.enabled`).
  //    `shadowMapEnabled` is a program parameter, but the renderer's
  //    `needsProgramChange` never compares it, so flipping the renderer's flag
  //    alone keeps every lit material on its USE_SHADOWMAP program: still
  //    paying the filtered lookup per fragment, against a map no longer drawn —
  //    shadows frozen where the robots stood. Flipping the light's `castShadow`
  //    changes the lights' hash (`numDirectionalShadows`), which bumps
  //    `lights.state.version`, which recompiles every lit material — with no
  //    shadow caster, so without the lookup — and leaves the shadow pass no
  //    light to draw for (it returns on `lights.length === 0` before it
  //    starts). No `material.needsUpdate` is needed; the recompile is one
  //    hitch at the step, which the down-only governor pays once.
  useLayoutEffect(() => {
    const shadow = key.current?.shadow
    if (!shadow) return
    if (shadowMap > 0) shadow.mapSize.set(shadowMap, shadowMap)
    if (shadow.map) {
      shadow.map.dispose()
      shadow.map = null
    }
  }, [shadowMap])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#c3cad6', 0.95]} />
      <directionalLight
        ref={key}
        position={[extent * 0.7, extent * 1.5, extent * 0.55]}
        intensity={1.7}
        castShadow={shadowMap > 0}
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
function TransitionRig({ transition, start, controls, api, arcRadius, reduced, stations, terraces, shift }: { transition: WorldTransition; start: Vec3; controls: RefObject<OrbitControlsRef | null>; api: RefObject<CameraApi | null>; arcRadius: number; reduced: boolean; stations: RefObject<ReadonlyMap<string, Station>>; terraces: RefObject<THREE.Group | null>; shift: readonly [number, number, number] | null }): null {
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
      },
      focus: (agentId) => {
        const c = controls.current
        const station = stations.current?.get(agentId)
        if (!c || station === undefined) return false
        // Where the robot IS: at the table while it waits on a person, else behind its desk.
        const slot = goalOf(getAgent(agentId)?.status ?? 'idle', station.conductor) === 'table' ? station.seat : (station.home ?? station.seat)
        const pose = focusPose(slot, copyOf(camera.position), copyOf(c.target))
        begin(pose.position, pose.target, FIT_MS)
        return true
      },
      plan: () => {
        const c = controls.current
        if (!c) return null
        const agents = [...(stations.current?.values() ?? [])].map((station) => {
          const waiting = getAgent(station.agentId)?.status === 'waiting_approval'
          const slot = goalOf(getAgent(station.agentId)?.status ?? 'idle', station.conductor) === 'table' ? station.seat : (station.home ?? station.seat)
          return { agentId: station.agentId, at: { x: slot.x, z: slot.z }, waiting }
        })
        return { half: slabHalf(arc.current), camera: { x: camera.position.x, z: camera.position.z }, target: { x: c.target.x, z: c.target.z }, agents }
      },
      centre: (x, z) => {
        const c = controls.current
        if (!c) return
        // The whole rig slides: the camera keeps its side and its distance, only what it looks at moves.
        const dx = x - c.target.x, dz = z - c.target.z
        begin({ x: camera.position.x + dx, y: camera.position.y, z: camera.position.z + dz }, { x, y: c.target.y, z }, FIT_MS)
      },
      apply: (pose: CameraPose) => {
        const c = controls.current
        if (!c) return
        // Floor point → scene point. The group is shifted so the frame centre
        // sits on the origin; the pose's target is the unshifted floor point.
        const look = {
          x: pose.target.x + (shift?.[0] ?? 0),
          y: ORBIT_TARGET.y,
          z: pose.target.z + (shift?.[2] ?? 0)
        }
        const dx = camera.position.x - c.target.x
        const dz = camera.position.z - c.target.z
        const azimuth = Math.atan2(dx, dz)
        const polar = Math.min(c.maxPolarAngle, Math.max(c.minPolarAngle, Math.PI / 2 - pose.pitch))
        const distance = Math.min(c.maxDistance, Math.max(c.minDistance, pose.distance))
        const s = Math.sin(polar)
        begin({
          x: look.x + distance * s * Math.sin(azimuth),
          y: look.y + distance * Math.cos(polar),
          z: look.z + distance * s * Math.cos(azimuth)
        }, look, FIT_MS)
      }
    }
    return () => { api.current = null }
  }, [api, camera, controls, shift, stations])

  useFrame(() => {
    const c = controls.current
    const now = performance.now()
    const s = transition.sample(now)
    const motion = motionOf(s, reduced)
    const rise = terraces.current
    if (rise) rise.scale.set(1, motion.terrace, 1)
    if (c) {
      const floor = { x: c.target.x - (shift?.[0] ?? 0), z: c.target.z - (shift?.[2] ?? 0) }
      setWorldCameraTarget(floor)
      const box = typeof window === 'undefined' ? { width: 1, height: 1 } : { width: window.innerWidth, height: window.innerHeight }
      const shown = liveView(floor, camera.position, c.target, box)
      setWorldCameraWedge(shown.points)
      setWorldLandingViewport(shown.viewport)
    }
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
      // M432. A look asked for from Orchestrate ("View in World"), taken on the first
      // resting frame that has one of its agents in the room: pick it and glide to it.
      if (hasArrival()) {
        const id = takeArrival((agentId) => stations.current?.has(agentId) === true, Date.now())
        if (id !== null) {
          selectAgent(id)
          api.current?.focus(id)
        }
      }
      return
    }
    if (c) c.enabled = false
    const at = dollyAt(rest.current, ORBIT_TARGET, motion.dolly)
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
      // M430: the tier and the ratio it is drawn at, so a live run can say what it measured.
      el.textContent = `${fps} fps · ${a.calls} calls · ${Math.round(a.tris / 1000)}k tris · ${getWorldQuality()} @${state.viewport.dpr.toFixed(2)}x`
      el.dataset.fps = String(fps)
    }
    a.frames = 0
    a.since = now
  }, -1)
  return null
}

/**
 * The room's quality tier and pixel ratio (M430, `world-quality.ts`). Reads the
 * same once-per-half-second window `StatsProbe` writes to the readout, but
 * through its own frame hook so neither depends on the other being mounted.
 *
 * Each window it reads the harness pin, feeds the governor (unless pinned, or
 * the window was a stall), publishes a tier step to the session's store — where
 * the view, the cards and the materials read it — and reports the ratio to
 * draw at UP to the view, which hands it to `<Canvas dpr>` (header, (4c)). The
 * ratio is the governed one under the tier's cap, the display's own and, while
 * the bloom renders, its pixel budget (`bloomDprCap`). That budget used to be
 * applied by the composer itself; it moved here because two writers of one
 * ratio fought — the composer's unmount put the display's ratio back over the
 * governor's step, so a tier that dropped the bloom RAISED the fill.
 */
function QualityGovernor({ onDpr, bloom }: { onDpr: (dpr: number) => void; bloom: boolean }): null {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const governor = useRef<Governor | null>(null)
  // A reopened view starts at the session's tier AND ratio: neither is tried again once it failed.
  // The open's own compile/load/dolly windows are not counted (`SETTLE_WINDOWS`).
  governor.current ??= createQualityGovernor(Math.min(window.devicePixelRatio, sessionDpr()), sessionQuality(), SETTLE_WINDOWS)
  const acc = useRef({ frames: 0, since: 0 })
  const reported = useRef(-1)
  const latest = useRef({ onDpr, width, height })
  latest.current = { onDpr, width, height }

  const apply = useCallback((): void => {
    const g = governor.current!
    const { onDpr: report, width: w, height: h } = latest.current
    const tier = getWorldQuality()
    const display = window.devicePixelRatio
    // A pinned tier is drawn at its own cap, not wherever the governor had got to.
    const governed = readQualityPin(harnessPin()) !== null ? Infinity : g.dpr
    const ceiling = bloomRenders(isBloomOn(), tier) ? bloomDprCap(w, h, display) : Infinity
    const next = worldDpr(governed, display, qualityPlan(tier), ceiling)
    if (Math.abs(next - reported.current) < 1e-3) return
    reported.current = next
    report(next)
  }, [])

  // A resize, or the bloom coming or going (the person's switch or the tier), moves the budget now, not at the next window.
  useEffect(() => { apply() }, [apply, width, height, bloom])

  useFrame((state) => {
    const a = acc.current
    const now = state.clock.elapsedTime
    if (a.since === 0) a.since = now
    a.frames++
    const span = now - a.since
    if (span < 0.5) return
    const g = governor.current!
    const pin = readQualityPin(harnessPin())
    pinWorldQuality(pin)
    // A window much longer than half a second means the loop stalled (a hidden
    // window, a long model load, the recompile after a tier step): that is not
    // a frame rate to act on. Nor is a pinned tier's — the harness is measuring it.
    if (span > 1.5 || pin !== null) g.gap()
    else {
      const { width: w, height: h } = latest.current
      const display = window.devicePixelRatio
      const ceiling = bloomRenders(isBloomOn(), g.tier) ? Math.min(clampDpr(display), bloomDprCap(w, h, display)) : clampDpr(display)
      const step = g.observe(a.frames / span, ceiling)
      if (step !== null) {
        stepWorldQuality(step.tier)
        stepSessionDpr(step.dpr)
      }
    }
    apply()
    a.frames = 0
    a.since = now
  }, -1)
  return null
}

/** The harness's tier pin. The app never writes it (`world.quality.pin.1`). */
function harnessPin(): unknown {
  return (window as unknown as { __tcWorldQuality?: unknown }).__tcWorldQuality
}

/**
 * How long a lost context has to come back on its own before the stage says
 * so. three `preventDefault`s the loss (WebGLRenderer's `onContextLost`) and
 * re-initialises on `webglcontextrestored`, and Chromium restores a context
 * whose loss was prevented — a GPU-process reset usually brings the room back
 * by itself within a second. Unmounting the scene at the loss (the first cut)
 * threw that recovery away and left the note up until a reopen.
 */
export const LOST_GRACE_MS = 2000

/**
 * A context LOST while the room is up (a GPU reset, the driver taking it back)
 * that does NOT come back within `LOST_GRACE_MS` leaves a dead canvas; the
 * stage then replaces the scene with its no-WebGL note (with a retry). The
 * listeners go in this effect's cleanup, which fiber runs before its own
 * teardown loses the context on purpose (`forceContextLoss` after an unmount),
 * so leaving the world is never reported as a loss (and the stage only acts on
 * it while the world is on).
 */
function ContextWatch({ onLost }: { onLost: () => void }): null {
  const canvas = useThree((s) => s.gl.domElement)
  const latest = useRef(onLost)
  latest.current = onLost
  useEffect(() => {
    let timer = 0
    const lost = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => latest.current(), LOST_GRACE_MS)
    }
    const restored = (): void => window.clearTimeout(timer)
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    return () => {
      window.clearTimeout(timer)
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
    }
  }, [canvas])
  return null
}

/**
 * Which agents get the FULL status card: the nearest few to the camera
 * (`cardTiers`, as many as the tier's plan allows — `max`), re-ranked four
 * times a second and only re-rendered when the set actually changes. A robot's station is its desk, not its live position —
 * a walk to the table is a few metres and would only shuffle the ranking
 * between agents that were close anyway.
 */
function CardBudget({ stations, max, onChange }: { stations: readonly Station[]; max: number; onChange: (full: ReadonlySet<string>) => void }): null {
  const camera = useThree((s) => s.camera)
  // Read at the tick: a tier step re-ranks at the next quarter second.
  const budget = useRef(max)
  budget.current = max
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
    const next = cardTiers(candidates, current.current, budget.current)
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

/**
 * The canvas is still mounted under the room. Its regions and panels are the
 * layout: read their inline canvas pixels once, at open. A later drag is
 * R-051 — this lane cannot import `moveRegion` (`world.ctx.door.1`).
 */
function readCanvasPlacement(): { panels: CanvasBox[]; regions: CanvasBox[]; floors: FloorTerrace[]; frame: ReturnType<typeof frameOf> } {
  if (typeof document === 'undefined') return { panels: [], regions: [], floors: [], frame: null }
  const panels: CanvasBox[] = []
  for (const el of document.querySelectorAll<HTMLElement>('.panel[data-panel-id]')) {
    const id = el.getAttribute('data-panel-id')
    if (id === null) continue
    const box = boxFromStyle(id, el.style.left, el.style.top, el.style.width, el.style.height)
    if (box !== null) panels.push(box)
  }
  const regions: CanvasBox[] = []
  const floors: FloorTerrace[] = []
  for (const el of document.querySelectorAll<HTMLElement>('[data-task-region]')) {
    const id = el.getAttribute('data-task-region')
    if (id === null) continue
    const box = boxFromStyle(id, el.style.left, el.style.top, el.style.width, el.style.height)
    if (box === null) continue
    regions.push(box)
    const floor = terraceFloor(box)
    floors.push({ id, label: terraceSignFromChip(el.querySelector('.task-region__chip')?.textContent ?? id), center: floor.center, w: floor.w, d: floor.d })
  }
  return { panels, regions, floors, frame: frameOf(floors) }
}

/** The plan, painted once from the layout. Under the terraces, never a screenshot. */
function PlanGround({ panels, regions }: { panels: readonly CanvasBox[]; regions: readonly CanvasBox[] }): JSX.Element | null {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null
    let maxX = 1
    let maxY = 1
    for (const rect of [...regions, ...panels]) {
      maxX = Math.max(maxX, rect.x + rect.w)
      maxY = Math.max(maxY, rect.y + rect.h)
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(2048, Math.max(1, Math.ceil(maxX)))
    canvas.height = Math.min(2048, Math.max(1, Math.ceil(maxY)))
    paintPlanFloor(canvas, {
      regions: regions.map((rect) => ({ x: rect.x, y: rect.y, w: rect.w, h: rect.h })),
      panels: panels.map((rect) => ({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }))
    })
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    return { map, width: canvas.width, height: canvas.height }
  }, [panels, regions])
  useEffect(() => () => texture?.map.dispose(), [texture])
  if (texture === null) return null
  const w = texture.width / FLOOR_SCALE
  const d = texture.height / FLOOR_SCALE
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, -0.04, d / 2]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={texture.map} toneMapped={false} />
    </mesh>
  )
}

export function WorldView({ transition, reduced, onLost }: { transition: WorldTransition; reduced: boolean; onLost: () => void }): JSX.Element {
  const focused = useFocusedAgent()
  const roster = useRoster()
  const waiting = useWaiting()
  // A pick is of a robot IN this room (M429 review): one that has left — gone idle and sunk, or
  // moved out with its workspace — lets the pick go, or Enter would open a panel for a robot no one
  // can see any more, and the Ask field would stay addressed to it.
  useEffect(() => {
    const id = selectedAgent()
    if (id !== null && !roster.some((a) => a.agentId === id)) selectAgent(null)
  }, [roster])
  // And a closed room keeps no pick: a reopened room is a fresh look (world-select.ts's header) —
  // after a double-click left for a panel, the next open's first Enter would otherwise go straight back.
  useEffect(() => () => selectAgent(null), [])
  // M430: the room's tier, and the bloom as RENDERED — the person's choice AND the tier's, never the person's bit alone.
  const quality = useWorldQuality()
  const tierPlan = qualityPlan(quality)
  const bloom = useBloomRendered()
  // The ratio the governor reports; it rides the Canvas's prop (header, (4c)).
  // The first frame is drawn at what the governor will ask for — the session's ratio and, while the
  // bloom renders, its pixel budget (the window's size stands in for the canvas's until fiber measures it).
  const [dpr, setDpr] = useState(() => {
    const display = window.devicePixelRatio
    const ceiling = bloom ? bloomDprCap(window.innerWidth, window.innerHeight, display) : Infinity
    return worldDpr(sessionDpr(), display, qualityPlan(getWorldQuality()), ceiling)
  })
  const leavers = useLeavers(roster, reduced)
  const held = useMemo(() => heldRoster(roster, leavers), [roster, leavers])
  // M423: agents on the same task sit together on one terrace; the plan re-flows when that changes.
  const ctx = useWorldContext()
  const groups = useMemo(() => taskOfAgent(ctx.tasks), [ctx.tasks])
  const groupKey = useMemo(() => held.map((a) => `${a.agentId}=${groups.get(a.agentId) ?? ''}`).join(','), [held, groups])
  const plan = useMemo(() => stationPlan(held, (id) => groups.get(id) ?? null), [held, groupKey])
  // M450. The canvas boxes, once. Empty when the 2D layer has not painted
  // regions — the ring room is unchanged then.
  const [placement] = useState(readCanvasPlacement)
  const placed = useMemo(() => placeStations(plan.stations, placement.panels), [plan, placement])
  // Every station in the room, the leaving included: ONE array, because React
  // scopes keys to an array and a robot moved between two would be a remount.
  const stations = useMemo(() => [...placed.values()], [placed])
  const consoles = useMemo(() => consoleBoxes(placement.panels, new Set(placed.keys())), [placement, placed])
  const framingArc = placement.frame === null ? null : arcFraming(placement.frame.half)
  // The orbit looks at the origin. Shift the stood-up canvas so its centre
  // lands there; terrace math stays canvasToFloor before the shift.
  // One array for the life of the view. A fresh one each render would re-bind
  // the camera api (the rig's effect depends on it) and drop a glide mid-way.
  const shift = useMemo(() => placement.frame === null ? null : ([-placement.frame.center.x, 0, -placement.frame.center.z] as const), [placement.frame])
  const anchor = placement.frame === null || framingArc === null ? null : { x: placement.frame.center.x, z: placement.frame.center.z, arc: framingArc }
  // The camera's focus reads the room as it is at the press (M425's tour).
  const stationsRef = useRef<ReadonlyMap<string, Station>>(placed)
  stationsRef.current = placed
  const leftAt = useMemo(() => new Map([...leavers].map(([id, l]) => [id, l.at])), [leavers])
  // The card ranking is for the live: a leaver keeps the card it had (WorldRobot) and takes no one's.
  const live = useMemo(() => stations.filter((station) => !leftAt.has(station.agentId)), [stations, leftAt])
  // Each robot's pop is delayed by how far it stands from the middle of the room.
  const delays = useMemo(() => {
    const centre = placement.frame?.center
    if (centre !== undefined) setWorldCameraTarget({ x: centre.x, z: centre.z })
    const points = stations.map((station) => {
      const at = station.home ?? station.seat
      return { x: at.x, z: at.z }
    })
    const pops = popDelaysFromTarget(points, worldCameraTarget())
    // prefers-reduced-motion: every robot appears with the first, not in a wave.
    return new Map(stations.map((station, i) => [station.agentId, reduced ? 0 : pops[i]!]))
  }, [stations, reduced, placement])
  // Until the first ranking (a quarter second) every card is full, so the room never opens bare.
  const [full, setFull] = useState<ReadonlySet<string> | null>(null)
  const stats = useRef<HTMLDivElement>(null)
  const statsShown = useMemo(() => statsOn(), [])
  const cards = useRef<HTMLDivElement>(null)
  const controls = useRef<OrbitControlsRef>(null)
  const terraces = useRef<THREE.Group>(null)
  // The overlay's "Fit room" and zoom buttons call this; TransitionRig fills it in.
  const camera = useRef<CameraApi | null>(null)
  // Framed for the room as it is when the view opens; "Fit room" re-frames it for the room as it is then.
  const start = useMemo((): Vec3 => isoPose(framingArc ?? plan.arcRadius), [])
  // The ground is unlit, and the bloom's tone map would darken it; paint the value that comes out right.
  const ground = useMemo(() => {
    const c = new THREE.Color(NIGHT.ground)
    return bloom ? c.setRGB(...acesPreimage([c.r, c.g, c.b])) : c
  }, [bloom])
  const half = slabHalf(framingArc ?? plan.arcRadius)
  const limit = Math.max(half - 2, shift === null ? 0 : Math.hypot(placement.frame?.center.x ?? 0, placement.frame?.center.z ?? 0) + 4)

  return (
    <div className="world-view" data-world-view data-quality={quality} data-world-focus={focused !== null ? '' : undefined}>
      <Canvas
        shadows="percentage"
        dpr={dpr}
        camera={{ position: [start.x, start.y, start.z], fov: VIEW.fov, near: 0.1, far: 480 }}
        // A click on empty floor lets the picked robot go (an orbit's release is not a click: fiber measures the drag).
        onPointerMissed={(event) => { if (event.type === 'click') selectAgent(null) }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
        <color attach="background" args={[ground]} />
        <Lights extent={half + 3} shadowMap={tierPlan.shadowMap} />
        <group position={shift ?? [0, 0, 0]}>
          <PlanGround panels={placement.panels} regions={placement.regions} />
          <group ref={terraces}>
            <WorldOffice stations={stations} leftAt={leftAt} arcRadius={anchor?.arc ?? plan.arcRadius} reduced={reduced} waiting={waiting.length} anchor={anchor} consoles={consoles} />
            <WorldStructure stations={stations} zones={plan.zones} arcRadius={plan.arcRadius} reduced={reduced} floors={placement.floors} />
          </group>
          {stations.map((station) => (
            <WorldRobot key={station.agentId} agentId={station.agentId} station={station} cards={cards} transition={transition} delay={delays.get(station.agentId) ?? 0} compact={leftAt.has(station.agentId) || (full !== null && !full.has(station.agentId))} reduced={reduced} leftAt={leftAt.get(station.agentId) ?? null} />
          ))}
        </group>
        <Controls controls={controls} limit={limit} maxDistance={Math.max(80, half * 6)} />
        <TransitionRig transition={transition} start={start} controls={controls} api={camera} arcRadius={plan.arcRadius} reduced={reduced} stations={stationsRef} terraces={terraces} shift={shift} />
        {bloom && <WorldBloom />}
        <StatsProbe target={stats} />
        <QualityGovernor onDpr={setDpr} bloom={bloom} />
        <CardBudget stations={live} max={tierPlan.cards} onChange={setFull} />
        <ContextWatch onLost={onLost} />
      </Canvas>
      <div className="world-view__cards" ref={cards} />
      <WorldChrome camera={camera} />
      {/* rd:W1 mount. WorldLens is on the canvas. The rig reads motionOf, popDelaysFromTarget, setWorldCameraTarget and paintPlanFloor. */}
      <div data-rd-mount="W1" hidden />
      {/* rd:W3 mount. useWorldCamera, the camera panel, the away card and peers. Props kept stable: camera, tier, following, onFollow. */}
      <div data-rd-mount="W3" hidden />
      <WorldCameraPanel camera={camera} />
      <div className="world-view__stats" ref={stats} aria-hidden="true" data-on={statsShown ? '' : undefined} />
    </div>
  )
}
