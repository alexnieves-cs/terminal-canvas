/**
 * M304. The Watch lens: the workspace's sessions as a lit, orbitable 3D scene
 * that shows the WORK — every file a session reads or writes is a tower, every
 * write flies the real (scrubbed) code token from the session to the tower and
 * drops a slab on it, every command rises as a column from its station and
 * resolves green or red, and a file two sessions wrote wears an amber ring.
 *
 * It is the Scene's companion, not its replacement: the Scene is the
 * hit-accurate diorama (polygon targets, semantic zoom, minimap, keyboard
 * parity with the List — M291–M298), and every one of its checks still drives
 * it. Watch is a perspective camera a person can orbit, so nothing here can be
 * pixel-matched to an SVG target; selection is a raycast on the session's own
 * mesh, and the List stays the keyboard door for everything Watch shows.
 *
 * Load-bearing, each failing silently:
 *
 * (1) **Reached only through lazy().** three.js + fiber are the +2.2MB the
 *     first chunk must not carry (CLAUDE.md's library table; `orch-zoom.3`
 *     pins the importer set, `orch-live.door.1` the lazy()).
 * (2) **Demand frameloop, re-armed only by motion.** A frame is asked for
 *     while an effect is in flight, a slab is still dropping, a session is
 *     working (its core turns) or the camera is damping. An idle workspace
 *     renders NOTHING between React updates — the rule OrchestrationCubes
 *     measured and kept (its useFrame header).
 * (3) **History is never replayed.** orchLiveFresh's first call animates
 *     nothing; towers stand at their model height from the first frame, and
 *     only tool calls that arrive while the lens is open fly.
 * (4) **Every painted string came through the caller's scrub.** Tokens and
 *     commands are agent output; the model (orchestration-live.ts) scrubs them
 *     before they reach this file, which paints what it is given and nothing
 *     it reads for itself.
 */
import { useEffect, useMemo, useRef, useState, type JSX, type MutableRefObject, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { OrchestrationBloom } from './orchestration-bloom'
import { shellControl } from '@renderer/shell/shell-control'
import { agentWord, TONE_WORKING } from '@renderer/panels/panel-state'
import {
  orchLiveFresh,
  orchLiveLayout,
  orchLiveSlabs,
  ORCH_LIVE_LINES_PER_SLAB,
  type OrchLiveEvent,
  type OrchLiveFile,
  type OrchLiveModel,
  type OrchLivePlatform,
  type OrchLiveSession
} from './orchestration-live'

export interface OrchestrationLiveProps {
  model: OrchLiveModel
  islands: readonly { id: string; label: string }[]
  primaryIslandId: string | null
  selectedId: string | null
  quality?: 'full' | 'lean' | 'flat'
  onSelect: (id: string) => void
  onJump: (id: string) => void
}

const SLAB_H = 0.16
const SLAB_GAP = 0.05
const PLINTH_H = 0.12
const CORE_Y = 1.0
const STAGGER_S = 0.42

function reducedMotionNow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readCss(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw === '' ? fallback : raw
}

interface Palette {
  iris: THREE.Color
  amber: THREE.Color
  green: THREE.Color
  red: THREE.Color
  surface: THREE.Color
  steel: THREE.Color
  idle: THREE.Color
  line: THREE.Color
  dark: boolean
  mono: string
}

function readPalette(): Palette {
  const c = (n: string, f: string): THREE.Color => { try { return new THREE.Color(readCss(n, f)) } catch { return new THREE.Color(f) } }
  return {
    iris: c('--iris', '#5ec4d4'),
    amber: c('--amber', '#e8b44c'),
    green: c('--green', '#6fcf8a'),
    red: c('--red', '#ef7a7a'),
    surface: c('--deck-surface', '#161a21'),
    steel: c('--deck-steel', '#7a8598'),
    idle: c('--fg-4', '#7b8292'),
    line: c('--line-strong', '#363d49'),
    dark: document.documentElement.getAttribute('data-theme') !== 'light',
    mono: readCss('--font-mono', 'ui-monospace, Menlo, monospace')
  }
}

/** The palette, re-read when the theme or contrast changes (the same observer every deck mesh uses). */
function usePalette(): Palette {
  const [p, setP] = useState(readPalette)
  useEffect(() => {
    const observer = new MutationObserver(() => setP(readPalette()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'style'] })
    return () => observer.disconnect()
  }, [])
  return p
}

/** One radial-falloff texture for every glow sprite. */
function makeGlowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function glowSprite(tex: THREE.Texture, color: THREE.Color, size: number, opacity: number, dark: boolean): THREE.Sprite {
  // Additive only on a dark ground: additive over a light ground can only
  // lighten, and reads as a hole in the floor (OrchestrationCubes' useDarkTheme).
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false }))
  s.scale.setScalar(size)
  return s
}

/** A scrubbed token on a rounded plate, as a camera-facing sprite. */
function tokenSprite(text: string, color: THREE.Color, p: Palette): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')!
  const f = 32
  const font = `500 ${f}px ${p.mono}`
  g.font = font
  const w = Math.ceil(g.measureText(text).width) + 28
  canvas.width = w
  canvas.height = f + 22
  g.font = font
  g.fillStyle = p.dark ? 'rgba(11,13,17,.82)' : 'rgba(255,255,255,.94)'
  const r = 12
  g.beginPath()
  g.moveTo(r, 0); g.arcTo(w, 0, w, canvas.height, r); g.arcTo(w, canvas.height, 0, canvas.height, r); g.arcTo(0, canvas.height, 0, 0, r); g.arcTo(0, 0, w, 0, r)
  g.fill()
  g.fillStyle = `#${color.getHexString()}`
  g.textBaseline = 'middle'
  g.fillText(text, 14, canvas.height / 2 + 1)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }))
  s.scale.set(w / 115, canvas.height / 115, 1)
  s.renderOrder = 10
  return s
}

/**
 * Geometry and materials go; a texture goes only when asked (`maps`): the glow
 * sprites share ONE texture, and disposing it with the first spark blanks every
 * glow in the scene with no error — only a token label owns its map.
 */
function disposeObject(o: THREE.Object3D, maps = false): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    m.geometry?.dispose?.()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      if (maps) (x as THREE.SpriteMaterial).map?.dispose()
      x.dispose()
    }
  })
}

/** Where a tower's top is, given how many slabs stand on it now. */
function towerTopY(slabs: number): number {
  return PLINTH_H + slabs * (SLAB_H + SLAB_GAP) + 0.3
}

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

function Platform({ plate, p, shadows }: { plate: OrchLivePlatform; p: Palette; shadows: boolean }): JSX.Element {
  const tiers = useMemo(() => {
    const s = plate.size
    const specs = [[s + 0.9, 0.34], [s + 0.35, 0.26], [s, 0.16]] as const
    let y = 0
    return specs.map(([side, h]) => {
      const body = new THREE.BoxGeometry(side, h, side)
      const tier = { body, edges: new THREE.EdgesGeometry(body), y: y + h / 2 }
      y += h
      return tier
    })
  }, [plate.size])
  useEffect(() => () => { for (const t of tiers) { t.body.dispose(); t.edges.dispose() } }, [tiers])
  // Only the focused task's platform is lit; the rest are the floor the eye passes over.
  const accent = plate.primary ? p.iris : p.steel
  return (
    <group position={[plate.x, 0, plate.z]} rotation={[0, Math.PI / 4, 0]}>
      {tiers.map((t, i) => {
        const deck = i === tiers.length - 1
        return (
          <group key={i} position={[0, t.y, 0]}>
            <mesh geometry={t.body} receiveShadow={shadows} castShadow={shadows && i === 0}>
              <meshPhysicalMaterial color={p.surface} roughness={0.55} metalness={0.25} clearcoat={0.4} clearcoatRoughness={0.35}
                emissive={accent} emissiveIntensity={deck ? (plate.primary ? 0.16 : 0.02) : 0.02} />
            </mesh>
            <lineSegments geometry={t.edges}>
              <lineBasicMaterial color={deck ? accent : p.line} transparent opacity={deck ? (plate.primary ? 1 : 0.35) : 0.3} toneMapped={!(deck && plate.primary)} />
            </lineSegments>
          </group>
        )
      })}
    </group>
  )
}

/** The platforms' top face — every object stands on it. */
const DECK_Y = 0.34 + 0.26 + 0.16

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

interface SessionHandle { core: THREE.Object3D; pulse: (strength: number) => void; hovered: () => boolean }

function Session({ s, x, z, selected, p, tex, reducedMotion, shadows, handles, onSelect, onJump }: {
  s: OrchLiveSession; x: number; z: number; selected: boolean; p: Palette; tex: THREE.Texture
  reducedMotion: boolean; shadows: boolean
  handles: Map<string, SessionHandle>
  onSelect: (id: string) => void; onJump: (id: string) => void
}): JSX.Element {
  const core = useRef<THREE.Mesh>(null!)
  const shell = useRef<THREE.Mesh>(null!)
  const ringA = useRef<THREE.Mesh>(null!)
  const ringB = useRef<THREE.Mesh>(null!)
  const halo = useRef<THREE.Sprite | null>(null)
  const group = useRef<THREE.Group>(null!)
  const pulse = useRef(0)
  const phase = useRef(Math.random() * 6)
  const [hover, setHover] = useState(false)
  const hoverRef = useRef(false)
  hoverRef.current = hover
  const working = s.state === TONE_WORKING
  const needs = s.state === 'needs-you'
  const lit = working || needs
  const color = needs ? p.amber : working ? p.iris : p.idle
  // An idle cube is the surface lifted a little toward the idle grey — present, never a light.
  const idleBody = useMemo(() => p.surface.clone().lerp(p.idle, 0.45), [p.surface, p.idle])
  useEffect(() => {
    if (!lit) return
    const g = glowSprite(tex, color, 1.9, 0.5, p.dark)
    g.position.y = CORE_Y
    group.current.add(g)
    halo.current = g
    return () => { group.current?.remove(g); g.material.dispose(); halo.current = null }
  }, [lit, color, tex, p.dark])
  useEffect(() => {
    handles.set(s.id, { core: core.current, pulse: (n) => { pulse.current = Math.max(pulse.current, n) }, hovered: () => hoverRef.current })
    return () => { handles.delete(s.id) }
  }, [handles, s.id])
  const invalidate = useThree((st) => st.invalidate)
  // A hover shows an idle session's name: the label projector only runs on a rendered frame.
  useEffect(() => { document.body.style.cursor = hover ? 'pointer' : ''; invalidate(); return () => { document.body.style.cursor = '' } }, [hover, invalidate])
  useFrame((state, delta) => {
    pulse.current = Math.max(0, pulse.current - delta * 1.4)
    if (!lit) return
    const busy = working ? 1 : 0.25
    if (!reducedMotion) {
      phase.current += delta * (0.8 + busy * 1.6)
      core.current.rotation.y += delta * (0.4 + busy)
      core.current.rotation.x += delta * 0.25 * busy
      shell.current.rotation.y -= delta * 0.35
      const bob = Math.sin(phase.current) * 0.07
      core.current.position.y = shell.current.position.y = CORE_Y + bob
      if (working) {
        ringA.current.rotation.set(Math.PI / 2 + Math.sin(phase.current * 0.7) * 0.5, phase.current * 0.6, 0)
        ringB.current.rotation.set(Math.PI / 2 + Math.cos(phase.current * 0.5) * 0.7, -phase.current * 0.4, 0)
      }
    }
    const beat = needs && !reducedMotion ? (Math.sin(state.clock.elapsedTime * 2.2) + 1) * 0.25 : 0
    const m = core.current.material as THREE.MeshStandardMaterial
    m.emissiveIntensity = 0.9 + busy * 0.6 + pulse.current * 1.2 + beat
    if (halo.current) halo.current.material.opacity = 0.35 + busy * 0.2 + pulse.current * 0.4 + beat * 0.4
    if (!reducedMotion || pulse.current > 0) state.invalidate()
  })
  const click = (e: ThreeEvent<MouseEvent>): void => { e.stopPropagation(); onSelect(s.id) }
  const dbl = (e: ThreeEvent<MouseEvent>): void => { e.stopPropagation(); onJump(s.id) }
  return (
    <group ref={group} position={[x, DECK_Y, z]}
      onClick={click} onDoubleClick={dbl}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true) }} onPointerOut={() => setHover(false)}>
      <mesh position={[0, 0.03, 0]} receiveShadow={shadows}>
        <cylinderGeometry args={[0.55, 0.58, 0.06, 32]} />
        <meshStandardMaterial color={p.surface} roughness={0.5} metalness={0.3} />
      </mesh>
      {(selected || hover) && (
        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.62, 0.7, 48]} />
          <meshBasicMaterial color={p.iris} transparent opacity={selected ? 1 : 0.5} toneMapped={false} />
        </mesh>
      )}
      {lit ? (
        <>
          <mesh ref={core} position={[0, CORE_Y, 0]} castShadow={shadows}>
            <icosahedronGeometry args={[0.36, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} roughness={0.25} metalness={0.3} flatShading />
          </mesh>
          <mesh ref={shell} position={[0, CORE_Y, 0]}>
            <icosahedronGeometry args={[0.54, 1]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.22} />
          </mesh>
          {working && (
            <>
              <mesh ref={ringA} position={[0, CORE_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.76, 0.012, 6, 64]} />
                <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
              </mesh>
              <mesh ref={ringB} position={[0, CORE_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.94, 0.01, 6, 64]} />
                <meshBasicMaterial color={color} transparent opacity={0.35} toneMapped={false} />
              </mesh>
            </>
          )}
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.03, 0.12, 0.95, 12, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
          </mesh>
        </>
      ) : (
        // Idle is a settled cube with no light; exited is the same cube, darker and see-through.
        <mesh ref={core} position={[0, 0.3, 0]} castShadow={shadows}>
          <boxGeometry args={[0.48, 0.48, 0.48]} />
          <meshStandardMaterial color={idleBody} roughness={0.75} transparent opacity={s.state === 'exited' ? 0.4 : 1} />
        </mesh>
      )}
      {/* An invisible, generous hit volume: the core is small and moving. */}
      <mesh position={[0, 0.7, 0]} visible={false}>
        <cylinderGeometry args={[0.7, 0.7, 1.6, 12]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// File towers
// ---------------------------------------------------------------------------

interface TowerHandle { group: THREE.Group; top: () => number; scan: () => void; holdUntil: (t: number) => void }

function Tower({ f, x, z, p, tex, reducedMotion, shadows, handles }: {
  f: OrchLiveFile; x: number; z: number; p: Palette; tex: THREE.Texture; reducedMotion: boolean; shadows: boolean
  handles: Map<string, TowerHandle>
}): JSX.Element {
  const group = useRef<THREE.Group>(null!)
  const { added, removed } = orchLiveSlabs(f)
  const target = removed + added
  // Slabs already standing, per index: when each one was born (for its drop) —
  // the FIRST render stands every slab at rest (history is never replayed).
  const born = useRef<number[] | null>(null)
  const hold = useRef(0)
  const clock = useThree((s) => s.clock)
  if (born.current === null) born.current = Array.from({ length: target }, () => -99)
  const slabs = useRef<THREE.Mesh[]>([])
  const ring = useRef<THREE.Mesh | null>(null)
  const halo = useRef<THREE.Mesh>(null)
  const crown = useRef<THREE.Sprite | null>(null)
  useEffect(() => {
    const b = born.current!
    const at = Math.max(clock.elapsedTime, hold.current)
    for (let k = 0; b.length < target; k++) b.push(reducedMotion ? -99 : at + k * 0.08)
    b.length = target
  }, [target, clock, reducedMotion])
  useEffect(() => {
    const c = glowSprite(tex, p.iris, 1.4, 0, p.dark)
    group.current.add(c)
    crown.current = c
    return () => { group.current?.remove(c); c.material.dispose() }
  }, [tex, p.iris, p.dark])
  useEffect(() => {
    handles.set(f.path, {
      group: group.current,
      top: () => towerTopY(born.current?.length ?? 0),
      holdUntil: (t) => { hold.current = Math.max(hold.current, t) },
      scan: () => {
        if (ring.current) return
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.02, 6, 40), new THREE.MeshBasicMaterial({ color: p.dark ? 0xffffff : 0x1b1e26, transparent: true, opacity: 0.8 }))
        r.rotation.x = Math.PI / 2
        r.userData.t0 = clock.elapsedTime
        group.current.add(r)
        ring.current = r
      }
    })
    return () => { handles.delete(f.path) }
  }, [handles, f.path, p.dark, clock])
  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    let moving = false
    const b = born.current!
    slabs.current.forEach((m, i) => {
      if (!m) return
      const rest = PLINTH_H + i * (SLAB_H + SLAB_GAP) + SLAB_H / 2
      // A slab the effect has not stamped yet (this render added it) waits hidden.
      const t0 = b[i] ?? Infinity
      const k = Math.min(1, Math.max(0, (now - t0) / 0.45))
      m.visible = now >= t0
      m.position.y = rest + (1 - k) * (1 - k) * 2.2
      m.scale.setScalar(0.35 + 0.65 * k)
      if (k < 1) moving = true
    })
    if (crown.current) {
      crown.current.position.y = towerTopY(b.length)
      const since = now - Math.max(...b, -99)
      crown.current.material.opacity = since >= 0 && since < 1.2 ? (1 - since / 1.2) * 0.9 : 0
      if (since >= 0 && since < 1.2) moving = true
    }
    if (ring.current) {
      const k = (now - ring.current.userData.t0) / 1.3
      const h = towerTopY(b.length) - 0.3
      if (k >= 1) { group.current.remove(ring.current); disposeObject(ring.current); ring.current = null }
      else { ring.current.position.y = h - k * (h - 0.1); (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); moving = true }
    }
    if (halo.current && f.contended) {
      const s = reducedMotion ? 1 : 1 + Math.sin(now * 2.6) * 0.05
      halo.current.scale.setScalar(s)
      if (!reducedMotion) moving = true
    }
    if (moving) state.invalidate()
    void delta
  })
  const ghost = target === 0
  return (
    <group ref={group} position={[x, DECK_Y, z]}>
      <mesh position={[0, PLINTH_H / 2, 0]} castShadow={shadows} receiveShadow={shadows}>
        <cylinderGeometry args={[0.6, 0.68, PLINTH_H, 6]} />
        <meshStandardMaterial color={p.surface} roughness={0.5} metalness={0.4} emissive={p.steel} emissiveIntensity={0.05} />
      </mesh>
      {ghost && (
        // Read, never written: a see-through slab, so a read-only file is present but never mistaken for a change.
        <mesh position={[0, PLINTH_H + SLAB_H / 2, 0]}>
          <boxGeometry args={[0.86, SLAB_H, 0.86]} />
          <meshStandardMaterial color={p.steel} transparent opacity={0.28} />
        </mesh>
      )}
      {Array.from({ length: target }, (_, i) => {
        const del = i < removed
        const col = del ? p.red : p.green
        return (
          <mesh key={i} ref={(m) => { if (m) slabs.current[i] = m }} castShadow={shadows} rotation={[0, (i % 2) * 0.08, 0]}>
            <boxGeometry args={[0.86, SLAB_H, 0.86]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.32} roughness={0.35} metalness={0.2} />
          </mesh>
        )
      })}
      {f.contended && (
        <mesh ref={halo} position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.95, 0.035, 8, 48]} />
          <meshBasicMaterial color={p.amber} transparent opacity={0.95} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Effects: write arcs with their token, run columns, core pulses
// ---------------------------------------------------------------------------

/** A queued event: `delay` is seconds after the previous one; `at` is stamped on the canvas clock when Effects first sees it. */
interface QueueItem { ev: OrchLiveEvent; delay: number; at?: number }

interface Fx { t0: number; dur: number; update: (k: number) => void; end: () => void; started?: boolean; start?: () => void }

function Effects({ queue, towers, sessions, p, tex, reducedMotion, paused, version }: {
  queue: MutableRefObject<QueueItem[]>
  towers: Map<string, TowerHandle>
  sessions: Map<string, SessionHandle>
  p: Palette; tex: THREE.Texture; reducedMotion: boolean; paused: boolean
  /** Bumped when events join the queue: a sleeping demand loop has to be woken to see them. */
  version: number
}): JSX.Element {
  const root = useRef<THREE.Group>(null!)
  const fx = useRef<Fx[]>([])
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => () => { for (const f of fx.current) f.end(); fx.current = [] }, [])
  const origin = (id: string): THREE.Vector3 | null => {
    const h = sessions.get(id)
    if (!h) return null
    const v = new THREE.Vector3()
    h.core.getWorldPosition(v)
    return v
  }
  const spawn = (ev: OrchLiveEvent, now: number): void => {
    const from = origin(ev.sessionId)
    sessions.get(ev.sessionId)?.pulse(1)
    if (from === null) return
    const tower = ev.path !== undefined ? towers.get(ev.path) : undefined
    if (ev.kind === 'read' && tower) { tower.scan(); return }
    if (ev.kind === 'write' && tower) {
      const top = new THREE.Vector3()
      tower.group.getWorldPosition(top)
      top.y += tower.top()
      const mid = from.clone().lerp(top, 0.5)
      mid.y += 2.2 + from.distanceTo(top) * 0.12
      const curve = new THREE.QuadraticBezierCurve3(from, mid, top)
      const del = ev.added === 0 && ev.removed > 0
      const col = del ? p.red : p.iris
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.02, 6, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
      const sparks = Array.from({ length: 10 }, () => glowSprite(tex, col, 0.42, 0, p.dark))
      const label = ev.token !== undefined ? tokenSprite(ev.token, del ? p.red : p.green, p) : null
      root.current.add(tube, ...sparks)
      if (label) root.current.add(label)
      tower.holdUntil(now + 1.2)
      fx.current.push({
        t0: now, dur: 1.6,
        update: (k) => {
          tube.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.6
          sparks.forEach((s, i) => {
            const u = Math.min(1, Math.max(0, k * 1.3 - i * 0.035))
            s.position.copy(curve.getPoint(u))
            s.material.opacity = u >= 1 || u <= 0 ? 0 : 0.9 * (1 - i / 12)
          })
          if (label) {
            label.position.copy(curve.getPoint(Math.min(1, k * 1.15))).add(new THREE.Vector3(0, 0.45, 0))
            label.material.opacity = k < 0.85 ? 1 : (1 - k) / 0.15
          }
        },
        end: () => { root.current?.remove(tube, ...sparks); disposeObject(tube); sparks.forEach((sp) => disposeObject(sp)); if (label) { root.current?.remove(label); disposeObject(label, true) } }
      })
      return
    }
    if (ev.kind === 'run') {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: p.iris, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }))
      const flareColor = ev.ok === false ? p.red : ev.ok === true ? p.green : p.iris
      const flare = glowSprite(tex, flareColor, 2.3, 0, p.dark)
      const base = from.clone()
      base.y = DECK_Y
      col.position.copy(base)
      flare.position.copy(base)
      root.current.add(col, flare)
      fx.current.push({
        t0: now, dur: 2.2,
        update: (k) => {
          const h = Math.min(1, k * 1.6) * 3.2
          col.scale.y = Math.max(0.001, h)
          col.position.y = DECK_Y + h / 2
          col.material.opacity = 0.32 * (1 - Math.max(0, k - 0.6) / 0.4)
          flare.position.y = DECK_Y + h
          flare.material.opacity = k > 0.55 ? Math.sin(((k - 0.55) / 0.45) * Math.PI) : 0
        },
        end: () => { root.current?.remove(col, flare); disposeObject(col); disposeObject(flare) }
      })
    }
  }
  useFrame((state) => {
    const now = state.clock.elapsedTime
    // Stamp arrivals on THIS clock (the canvas's), chained after whatever is still due.
    let last = now
    for (const q of queue.current) { if (q.at === undefined) q.at = Math.max(now, last) + (q === queue.current[0] ? 0 : q.delay); last = q.at }
    if (!paused) {
      // Due events leave the queue in order; reduced motion keeps the pulse and
      // the towers' new heights, and skips the flight.
      while (queue.current.length > 0 && (queue.current[0]!.at ?? Infinity) <= now) {
        const { ev } = queue.current.shift()!
        if (reducedMotion) { sessions.get(ev.sessionId)?.pulse(1); if (ev.kind === 'read' && ev.path) towers.get(ev.path)?.scan() }
        else spawn(ev, now)
      }
    }
    for (let i = fx.current.length - 1; i >= 0; i--) {
      const f = fx.current[i]!
      const k = (now - f.t0) / f.dur
      f.update(Math.min(1, k))
      if (k >= 1) { f.end(); fx.current.splice(i, 1) }
    }
    if (fx.current.length > 0 || queue.current.length > 0) state.invalidate()
  })
  useEffect(() => { invalidate() }, [invalidate, version])
  return <group ref={root} />
}

// ---------------------------------------------------------------------------
// Camera: orbit, damped, with an optional follow of the active session
// ---------------------------------------------------------------------------

function CameraRig({ bounds, autoRotate, follow, reset }: { bounds: { x: number; z: number; r: number }; autoRotate: boolean; follow: THREE.Vector3 | null; reset: number }): null {
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const invalidate = useThree((s) => s.invalidate)
  const controls = useRef<OrbitControls | null>(null)
  const size = useThree((s) => s.size)
  // FIT, not a fixed radius: the distance at which a sphere around every platform
  // fills the narrower of the two fields of view, seen from the same three-quarter
  // angle every time — so one platform is not a speck and seven are not cropped.
  const centre = useMemo(() => new THREE.Vector3(bounds.x, 0.4, bounds.z), [bounds.x, bounds.z])
  const home = useMemo(() => {
    const cam = camera as THREE.PerspectiveCamera
    const vfov = (cam.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * Math.max(0.5, size.width / Math.max(1, size.height)))
    // 0.5, not 1: the scene is a flat disc seen from above at a slant, so its
    // silhouette is far smaller than the bounding SPHERE a strict fit assumes —
    // measured, the strict fit left the platforms a speck in the middle of the well.
    const dist = (bounds.r * 0.5) / Math.sin(Math.min(vfov, hfov) / 2)
    return new THREE.Vector3(0.58, 0.6, 0.55).normalize().multiplyScalar(dist).add(centre)
  }, [camera, bounds.r, centre, size.width, size.height])
  const radius = home.distanceTo(centre)
  useEffect(() => {
    const c = new OrbitControls(camera, dom)
    c.enableDamping = true
    c.dampingFactor = 0.08
    c.minDistance = 8
    c.maxDistance = Math.max(60, radius * 2.4)
    c.maxPolarAngle = Math.PI * 0.44
    c.minPolarAngle = Math.PI * 0.12
    c.target.copy(centre)
    c.addEventListener('change', () => invalidate())
    controls.current = c
    camera.position.copy(home)
    c.update()
    return () => { c.dispose(); controls.current = null }
  }, [camera, dom, invalidate, radius, home, centre])
  useEffect(() => {
    if (reset === 0 || !controls.current) return
    camera.position.copy(home)
    controls.current.target.copy(centre)
    controls.current.update()
  }, [reset, camera, home, centre])
  useFrame((state, delta) => {
    const c = controls.current
    if (!c) return
    c.autoRotate = autoRotate
    c.autoRotateSpeed = 0.35
    if (follow) {
      // A nudge toward the active session, never a re-centre: the fit stays the frame.
      const goal = new THREE.Vector3(centre.x + (follow.x - centre.x) * 0.25, 0.4, centre.z + (follow.z - centre.z) * 0.25)
      if (c.target.distanceToSquared(goal) > 0.0004) { c.target.lerp(goal, 1 - Math.pow(0.02, delta)); state.invalidate() }
    }
    // update() returns true while damping has motion left; keep asking until it settles.
    if (c.update() || autoRotate) state.invalidate()
  })
  return null
}

// ---------------------------------------------------------------------------
// Labels: DOM, projected on every rendered frame
// ---------------------------------------------------------------------------

/** `rank`: lower wins a collision — the callout, then files, then lit sessions, idle names, plates. */
interface LabelSpec { key: string; text: string; extra?: string; cls: string; rank: number; at: () => THREE.Vector3 | null; show?: () => boolean }

function LabelProjector({ specs, host }: { specs: readonly LabelSpec[]; host: RefObject<HTMLDivElement | null> }): null {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  const ordered = useMemo(() => [...specs].sort((a, b) => a.rank - b.rank), [specs])
  useFrame(() => {
    const el = host.current
    if (!el) return
    // A collision pass in screen space, in rank order: a label that would overlap
    // one already placed is hidden rather than drawn over it — every name hidden
    // here is still in the roster, and a file's name is on its hover in the List.
    const placed: { l: number; t: number; r: number; b: number }[] = []
    for (const spec of ordered) {
      const node = el.querySelector<HTMLElement>(`[data-orch-live-label="${CSS.escape(spec.key)}"]`)
      if (!node) continue
      const at = spec.show === undefined || spec.show() ? spec.at() : null
      if (at === null) { node.style.visibility = 'hidden'; continue }
      v.copy(at).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      const w = node.offsetWidth
      const h = node.offsetHeight
      const box = { l: x - w / 2 - 3, t: y - h - 3, r: x + w / 2 + 3, b: y + 3 }
      const onScreen = v.z < 1 && box.l > -w && box.r < size.width + w && box.t > -h && box.b < size.height + h
      const clash = placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t)
      const visible = onScreen && !clash
      node.style.visibility = visible ? 'visible' : 'hidden'
      if (visible) placed.push(box)
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
    }
  })
  return null
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

function LiveScene({ model, plates, selectedId, quality, p, reducedMotion, paused, follow, reset, active, labels, labelHost, queue, version, onSelect, onJump }: {
  model: OrchLiveModel; plates: OrchLivePlatform[]; selectedId: string | null; quality: 'full' | 'lean' | 'flat'
  p: Palette; reducedMotion: boolean; paused: boolean; follow: boolean; reset: number; active: string | null
  labels: LabelSpec[]; labelHost: RefObject<HTMLDivElement | null>
  queue: MutableRefObject<QueueItem[]>
  version: number
  onSelect: (id: string) => void; onJump: (id: string) => void
}): JSX.Element {
  const tex = useMemo(makeGlowTexture, [])
  useEffect(() => () => tex.dispose(), [tex])
  const gl = useThree((s) => s.gl)
  useEffect(() => { gl.shadowMap.type = THREE.PCFShadowMap; gl.shadowMap.needsUpdate = true }, [gl])
  const sessionHandles = useMemo(() => new Map<string, SessionHandle>(), [])
  const towerHandles = useMemo(() => new Map<string, TowerHandle>(), [])
  sessionHandlesRef.current = sessionHandles
  towerHandlesRef.current = towerHandles
  const shadows = quality !== 'flat'
  const extent = plates.reduce((m, pl) => Math.max(m, Math.hypot(pl.x, pl.z) + pl.size), 10)
  // The fit sphere: the platforms' own centre and the farthest diamond corner from it.
  const bounds = useMemo(() => {
    if (plates.length === 0) return { x: 0, z: 0, r: 8 }
    const x = plates.reduce((a, pl) => a + pl.x, 0) / plates.length
    const z = plates.reduce((a, pl) => a + pl.z, 0) / plates.length
    const r = plates.reduce((m, pl) => Math.max(m, Math.hypot(pl.x - x, pl.z - z) + (pl.size + 0.9) / Math.SQRT2), 4)
    return { x, z, r }
  }, [plates])
  const byId = new Map(model.sessions.map((s) => [s.id, s]))
  const byPath = new Map(model.files.map((f) => [f.path, f]))
  const anyWorking = model.sessions.some((s) => s.state === TONE_WORKING)
  const followAt = useMemo(() => {
    if (!follow || active === null) return null
    for (const pl of plates) { const s = pl.sessions.find((x) => x.id === active); if (s) return new THREE.Vector3(s.x, 0, s.z) }
    return null
  }, [follow, active, plates])
  return (
    <>
      {quality === 'full' && <OrchestrationBloom />}
      <fog attach="fog" args={[p.dark ? '#0b0d11' : '#f4f5f7', extent * 1.6, extent * 4]} />
      <hemisphereLight args={[0xffffff, p.dark ? 0x223344 : 0xdde3ea, p.dark ? 0.55 : 0.9]} />
      <directionalLight position={[-extent * 0.6, extent * 1.2, extent * 0.8]} intensity={p.dark ? 0.9 : 1.2} castShadow={shadows}
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}>
        <orthographicCamera attach="shadow-camera" args={[-extent, extent, extent, -extent, 0.5, extent * 4]} />
      </directionalLight>
      <pointLight position={[0, 6, -4]} color={p.iris} intensity={p.dark ? 8 : 3} distance={extent * 2} decay={1.4} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[extent * 8, extent * 8]} />
        <shadowMaterial transparent opacity={p.dark ? 0.35 : 0.12} />
      </mesh>
      <gridHelper args={[extent * 5, Math.round(extent * 5), p.line, p.line]} position={[0, 0.002, 0]}
        onUpdate={(g: THREE.GridHelper) => { const m = g.material as THREE.LineBasicMaterial; m.transparent = true; m.opacity = p.dark ? 0.22 : 0.4 }} />
      {plates.map((pl) => <Platform key={pl.id ?? '\0none'} plate={pl} p={p} shadows={shadows} />)}
      {plates.flatMap((pl) => pl.files.map((ft) => {
        const f = byPath.get(ft.path)
        return f ? <Tower key={f.path} f={f} x={ft.x} z={ft.z} p={p} tex={tex} reducedMotion={reducedMotion} shadows={shadows} handles={towerHandles} /> : null
      }))}
      {plates.flatMap((pl) => pl.sessions.map((st) => {
        const s = byId.get(st.id)
        return s ? <Session key={s.id} s={s} x={st.x} z={st.z} selected={s.id === selectedId} p={p} tex={tex} reducedMotion={reducedMotion} shadows={shadows} handles={sessionHandles} onSelect={onSelect} onJump={onJump} /> : null
      }))}
      <Effects queue={queue} towers={towerHandles} sessions={sessionHandles} p={p} tex={tex} reducedMotion={reducedMotion} paused={paused} version={version} />
      <CameraRig bounds={bounds} autoRotate={anyWorking && !paused && !reducedMotion} follow={followAt} reset={reset} />
      <LabelProjector specs={labels} host={labelHost} />
    </>
  )
}

/** The typed line's width and step count, one step per character (the keyframe is orch-live-type). */
function typedStyle(chars: number): { width: string; animationTimingFunction: string } {
  return { width: `${chars + 1}ch`, animationTimingFunction: `steps(${Math.max(1, chars)})` }
}

// The handle maps live inside the Canvas; labels outside it read them through these.
const sessionHandlesRef: { current: Map<string, SessionHandle> | null } = { current: null }
const towerHandlesRef: { current: Map<string, TowerHandle> | null } = { current: null }

export function OrchestrationLive({ model, islands, primaryIslandId, selectedId, quality = 'full', onSelect, onJump }: OrchestrationLiveProps): JSX.Element {
  const p = usePalette()
  const reducedMotion = reducedMotionNow()
  const plates = useMemo(() => orchLiveLayout(model, islands, primaryIslandId), [model, islands, primaryIslandId])
  const [paused, setPaused] = useState(false)
  const [follow, setFollow] = useState(true)
  const [reset, setReset] = useState(0)
  const labelHost = useRef<HTMLDivElement>(null)
  const queue = useRef<QueueItem[]>([])
  const seen = useRef<Set<string> | null>(null)
  const [latest, setLatest] = useState<OrchLiveEvent | null>(null)
  const [count, setCount] = useState(0)
  // New tool calls join the queue, staggered so a burst reads as a sequence.
  useEffect(() => {
    const { fresh, seen: next } = orchLiveFresh(model.events, seen.current)
    seen.current = next
    if (fresh.length === 0) return
    for (const ev of fresh) queue.current.push({ ev, delay: STAGGER_S })
    if (queue.current.length > 24) queue.current.splice(0, queue.current.length - 24)
    setLatest(fresh[fresh.length - 1]!)
    setCount((c) => c + fresh.length)
  }, [model.events])
  // The callout follows the WORK: the selection only when it is itself doing
  // something (working or waiting on the person), else the latest event's session,
  // else any working one. A selected idle terminal is not what Watch is for.
  const selectedLit = model.sessions.find((s) => s.id === selectedId && (s.state === TONE_WORKING || s.state === 'needs-you'))
  const latestLive = latest !== null ? model.sessions.find((s) => s.id === latest.sessionId && s.state !== 'exited') : undefined
  const active = selectedLit?.id ?? latestLive?.id ?? model.sessions.find((s) => s.state === TONE_WORKING)?.id ?? model.sessions.find((s) => s.state === 'needs-you')?.id ?? null
  const activeSession = model.sessions.find((s) => s.id === active) ?? null
  const shownEvent = activeSession !== null ? (latest?.sessionId === activeSession.id ? latest : activeSession.latest) : null
  const working = model.sessions.filter((s) => s.state === TONE_WORKING).length

  const labels = useMemo<LabelSpec[]>(() => {
    const out: LabelSpec[] = []
    const byPath = new Map(model.files.map((f) => [f.path, f]))
    for (const pl of plates) {
      out.push({ key: `plate:${pl.id ?? ''}`, rank: 5, text: pl.label, cls: 'orch-live__label orch-live__label--plate', at: () => new THREE.Vector3(pl.x, 0.1, pl.z + pl.size * 0.72) })
      for (const ft of pl.files) {
        const f = byPath.get(ft.path)
        if (!f) continue
        const n = f.added || f.removed ? `+${f.added}${f.removed ? ` −${f.removed}` : ''}` : `${f.reads} read${f.reads === 1 ? '' : 's'}`
        out.push({ key: `file:${f.path}`, rank: f.contended ? 1 : 2, text: f.name, extra: n, cls: `orch-live__label orch-live__label--file${f.contended ? ' orch-live__label--warn' : ''}`,
          at: () => { const h = towerHandlesRef.current?.get(f.path); return h ? new THREE.Vector3(ft.x, DECK_Y + h.top() + 0.1, ft.z) : null } })
      }
      for (const st of pl.sessions) {
        const s = model.sessions.find((x) => x.id === st.id)
        if (!s || s.id === active) continue
        const lit = s.state === TONE_WORKING || s.state === 'needs-you'
        // Rest density: a lit session is named; an idle one is a settled cube whose
        // name appears on hover or selection (the roster names every one of them).
        out.push({ key: `session:${s.id}`, rank: lit ? 3 : 4, text: s.title, cls: `orch-live__label orch-live__label--session${lit ? '' : ' orch-live__label--dim'}`, at: () => new THREE.Vector3(st.x, DECK_Y + (lit ? 2.05 : 1.0), st.z),
          ...(lit ? {} : { show: () => s.id === selectedId || sessionHandlesRef.current?.get(s.id)?.hovered() === true }) })
      }
    }
    if (active !== null) {
      for (const pl of plates) {
        const st = pl.sessions.find((x) => x.id === active)
        if (st) out.push({ key: 'callout', rank: 0, text: '', cls: '', at: () => new THREE.Vector3(st.x, DECK_Y + 2.1, st.z) })
      }
    }
    return out
  }, [plates, model.files, model.sessions, active, selectedId])

  return (
    <div className="orch-live" data-orch-live data-orch-live-events={count} data-orch-live-towers={model.files.length}>
      <Canvas
        shadows={quality === 'flat' ? false : 'percentage'}
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 32, near: 0.1, far: 400, position: [16, 14, 18] }}
        onPointerMissed={() => undefined}
      >
        <LiveScene model={model} plates={plates} selectedId={selectedId} quality={quality} p={p} reducedMotion={reducedMotion}
          paused={paused} follow={follow} reset={reset} active={active} labels={labels} labelHost={labelHost} queue={queue} version={count}
          onSelect={onSelect} onJump={onJump} />
      </Canvas>
      <div className="orch-live__labels" ref={labelHost} aria-hidden="true">
        {labels.filter((l) => l.key !== 'callout').map((l) => (
          <span key={l.key} className={l.cls} data-orch-live-label={l.key}>{l.text}{l.extra !== undefined && <em>{l.extra}</em>}</span>
        ))}
        {activeSession !== null && (
          <div className="orch-live__callout" data-orch-live-label="callout" data-orch-live-callout={activeSession.id} data-state={activeSession.state}>
            <strong><span className="orch-live__pip" data-state={activeSession.state} />{activeSession.title}</strong>
            <span className="orch-live__say">{shownEvent?.say ?? (activeSession.state === TONE_WORKING ? 'Working' : activeSession.state === 'needs-you' ? 'Waiting on you' : 'Idle')}</span>
            {shownEvent?.token !== undefined && (
              <code key={shownEvent.key} className="orch-live__typing" style={typedStyle(shownEvent.token.length + 2)} data-kind={shownEvent.added === 0 && shownEvent.removed > 0 ? 'del' : 'add'}>
                {shownEvent.added === 0 && shownEvent.removed > 0 ? '− ' : '+ '}{shownEvent.token}
              </code>
            )}
            {shownEvent?.kind === 'run' && shownEvent.command !== undefined && (
              <code key={shownEvent.key} className="orch-live__typing" style={typedStyle(Math.min(40, shownEvent.command.length + 2))} data-kind="run">$ {shownEvent.command}</code>
            )}
          </div>
        )}
      </div>
      <div className="orch-live__hud" role="status" aria-live="polite">
        <span className="orch-live__live" data-on={working > 0 || undefined}><span className="orch-live__pip" data-state={working > 0 ? TONE_WORKING : 'idle'} />{working > 0 ? 'Live' : 'Quiet'}</span>
        <span>{`${working} working · ${count} ${count === 1 ? 'event' : 'events'} since you opened Watch`}</span>
      </div>
      <div className="orch-live__tools" role="toolbar" aria-label="Watch controls">
        <button type="button" className="orch-live__tool" aria-pressed={paused} data-orch-live-pause title={paused ? 'Play — resume the flights' : 'Pause the flights (the model keeps updating)'} {...shellControl(() => setPaused((v) => !v))}>{paused ? 'Play' : 'Pause'}</button>
        <button type="button" className="orch-live__tool" aria-pressed={follow} data-orch-live-follow title="Follow the session doing the latest work" {...shellControl(() => setFollow((v) => !v))}>Follow</button>
        <button type="button" className="orch-live__tool" data-orch-live-reset title="Reset the camera" {...shellControl(() => setReset((n) => n + 1))}>Reset</button>
      </div>
      <div className="orch-live__legend">
        <span><i data-k="working" />{agentWord('busy').word}</span>
        <span><i data-k="needs-you" />{agentWord('wants-you').word}</span>
        <span><i data-k="add" />lines added</span>
        <span><i data-k="del" />removed</span>
        <span><i data-k="idle" />idle</span>
        <span className="orch-live__note">{`Tower = lines written by sessions (1 slab ≈ ${ORCH_LIVE_LINES_PER_SLAB}), not git${model.moreFiles > 0 ? ` · +${model.moreFiles} more files` : ''} · drag to orbit, scroll to zoom`}</span>
      </div>
      {model.sessions.length === 0 && <p className="orch-live__empty">No sessions to watch yet — start one and its work shows up here.</p>}
    </div>
  )
}
