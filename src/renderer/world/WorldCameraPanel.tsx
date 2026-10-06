import { useEffect, useRef, useState, type JSX, type RefObject } from 'react'
import type { CameraPose, ZoomTier } from '@shared/redesign-contracts'
import { shortcutById, matchShortcut, type ShortcutEvent } from '@shared/shortcuts'
import { selectedAgent } from './world-select'
import { setWorldOn } from './world-toggle'
import type { CameraApi } from './world-set'
import {
  backTo2d,
  boundsOf,
  fitRoom,
  followAgent,
  orbitBy,
  panBy,
  tierPose,
  toPose,
  zoomToCursor,
  type FloorBounds,
  type ScreenPoint,
  type WorldCamera
} from './world-camera'

/**
 * The camera panel (M451) and the hook W2 mounts. Plain DOM, no three.js.
 *
 * The pose lives here. The rig still owns the WebGL camera: `apply` on the
 * `CameraApi` is the door for that pose (R-062). Until the rig grows it, Fit
 * and Follow also call the doors the rig already has (`fit`, `focus`), and
 * the tier buttons record the pose the overview is showing.
 *
 * Every chord is read from the registry. A glyph written in this file would
 * drift from `shortcuts.ts` the moment a chord moved.
 */

type Rig = CameraApi & { apply?: (pose: CameraPose) => void }

const FALLBACK: FloorBounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 }

function roomBounds(camera: RefObject<CameraApi | null>): FloorBounds {
  const plan = camera.current?.plan()
  if (plan === null || plan === undefined) return FALLBACK
  const agents = boundsOf(plan.agents.map((agent) => agent.at))
  if (agents !== null) return agents
  return { minX: -plan.half, maxX: plan.half, minZ: -plan.half, maxZ: plan.half }
}

function pushPose(camera: RefObject<CameraApi | null>, next: WorldCamera, fallback: 'fit' | 'none'): void {
  const rig = camera.current as Rig | null
  if (rig?.apply) {
    rig.apply(toPose(next))
    return
  }
  if (fallback === 'fit') rig?.fit()
}

export interface WorldCameraHandle {
  camera: WorldCamera
  pose: CameraPose
  setTier: (tier: ZoomTier) => void
  fit: () => void
  follow: () => void
  backTo2d: () => void
  orbit: (dx: number, dy: number) => void
  pan: (dx: number, dy: number) => void
  zoomAt: (cursor: ScreenPoint, factor: number) => void
}

export function useWorldCamera(camera: RefObject<CameraApi | null>): WorldCameraHandle {
  const [size, setSize] = useState({ width: 1440, height: 865 })
  const [cam, setCam] = useState<WorldCamera>(() => tierPose('map', { x: 0, z: 0 }, { width: 1440, height: 865 }))
  const camRef = useRef(cam)
  camRef.current = cam
  const sizeRef = useRef(size)
  sizeRef.current = size

  useEffect(() => {
    const read = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  const apply = (next: WorldCamera, fallback: 'fit' | 'none'): void => {
    camRef.current = next
    setCam(next)
    pushPose(camera, next, fallback)
  }

  return {
    camera: cam,
    pose: toPose(cam),
    setTier: (tier) => apply(tierPose(tier, camRef.current.target, sizeRef.current, camRef.current.azimuth), 'none'),
    fit: () => apply(fitRoom(roomBounds(camera), sizeRef.current, 'map'), 'fit'),
    follow: () => {
      const id = selectedAgent()
      const at = id === null ? undefined : camera.current?.plan()?.agents.find((agent) => agent.agentId === id)?.at
      if (at !== undefined) apply(followAgent(camRef.current, at, sizeRef.current), 'none')
      if (id !== null) camera.current?.focus(id)
    },
    backTo2d: () => {
      // The viewport to land on. The canvas applies it when R-064 lands;
      // leaving the room is this button's own job.
      void backTo2d(camRef.current, sizeRef.current)
      setWorldOn(false)
    },
    orbit: (dx, dy) => apply(orbitBy(camRef.current, dx, dy), 'none'),
    pan: (dx, dy) => apply(panBy(camRef.current, dx, dy, sizeRef.current), 'none'),
    zoomAt: (cursor, factor) => apply(zoomToCursor(camRef.current, sizeRef.current, cursor, factor), 'none')
  }
}

function Chord({ id }: { id: string }): JSX.Element | null {
  const chord = shortcutById(id)?.chord
  if (chord === undefined || chord === '') return null
  return <kbd className="world-camera__kbd">{chord}</kbd>
}

const TIERS: readonly { tier: ZoomTier; id: 'tier-work' | 'tier-plan' | 'tier-map'; label: string }[] = [
  { tier: 'work', id: 'tier-work', label: 'Work' },
  { tier: 'plan', id: 'tier-plan', label: 'Plan' },
  { tier: 'map', id: 'tier-map', label: 'Map' }
]

export function WorldCameraPanel({ camera }: { camera: RefObject<CameraApi | null> }): JSX.Element {
  const handle = useWorldCamera(camera)
  const handleRef = useRef(handle)
  handleRef.current = handle

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const el = event.target instanceof HTMLElement ? event.target : null
      if (el?.closest('input, textarea, select, [contenteditable="true"]') != null) return
      const chord: ShortcutEvent = {
        metaKey: event.metaKey || event.ctrlKey,
        ctrlKey: false,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        code: event.code
      }
      const hit = matchShortcut(chord)
      if (hit === null) return
      const api = handleRef.current
      if (hit.id === 'tier-work' || hit.id === 'tier-plan' || hit.id === 'tier-map') {
        const tier = hit.id === 'tier-work' ? 'work' : hit.id === 'tier-plan' ? 'plan' : 'map'
        api.setTier(tier)
        return
      }
      if (hit.id === 'fit-all') { api.fit(); return }
      if (hit.id === 'world') { api.backTo2d(); return }
      if (hit.id === 'follow') api.follow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="world-camera" role="group" aria-label="Camera" data-world-camera data-camera-tier={handle.camera.tier}>
      <div className="world-camera__row" data-world-gesture="orbit">
        <span>Orbit</span>
        <span className="world-camera__kbd">drag</span>
      </div>
      <div className="world-camera__row" data-world-gesture="pan">
        <span>Pan</span>
        <span className="world-camera__kbd">Shift-drag</span>
      </div>
      <div className="world-camera__row" data-world-gesture="zoom" title="Scroll, or pinch. A pinch arrives as a wheel with ctrlKey.">
        <span>Zoom to cursor</span>
        <span className="world-camera__chords">
          <Chord id={'zoom-scroll'} />
          <Chord id={'zoom-pinch'} />
        </span>
      </div>
      {TIERS.map((row) => (
        <button
          key={row.tier}
          type="button"
          className="world-camera__row"
          aria-pressed={handle.camera.tier === row.tier}
          data-world-tier={row.tier}
          onClick={() => handle.setTier(row.tier)}
        >
          <span>{row.label}</span>
          <Chord id={row.id} />
        </button>
      ))}
      <button type="button" className="world-camera__row" onClick={() => handle.fit()} data-world-fit-room>
        <span>Fit room</span>
        <Chord id={'fit-all'} />
      </button>
      <button type="button" className="world-camera__row" onClick={() => handle.follow()} data-world-follow>
        <span>Follow picked</span>
        <Chord id={'follow'} />
      </button>
      <button type="button" className="world-camera__row" onClick={() => handle.backTo2d()} data-world-back>
        <span>Back to 2D</span>
        <Chord id={'world'} />
      </button>
    </div>
  )
}
