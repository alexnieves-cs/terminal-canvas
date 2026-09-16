/**
 * The R3F island: real lighting/materials for the orchestration diorama's
 * cubes, replacing M274/M275's CSS-3D bodies (`.orch__cube-solid` and its
 * faces). Everything else — ground, edges, hit-targets, beacon, label,
 * callouts, packets — stays exactly where it was, in the surrounding SVG/HTML
 * (OrchestrationView.tsx); this canvas paints ONLY the cube meshes and their
 * shared shadow-catching ground plane, sandwiched between the SVG's ground
 * layer and its (still-interactive) overlay layer in `.orch__graph-wrap`.
 *
 * `pointer-events: none` throughout: clicks, hover and keyboard focus stay on
 * the SVG hit-targets they always used, so selection/jump/overflow wiring in
 * OrchestrationView.tsx is untouched. This canvas only has to look right
 * under wherever those targets already are.
 */
import { TONE_WORKING } from '../panels/panel-state'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ORCH_STAGE_TILT_DEG, orchFitViewbox, type OrchFit } from './orchestration-depth'
import { orchCubeMotion, type OrchCubeTone } from './orchestration-cube-motion'

export interface OrchCubeSpec {
  id: string
  /** Already-projected viewBox-space position/size (post pan/zoom/depth — the same numbers the SVG hit-target uses). */
  x: number
  y: number
  size: number
  /** -1 back of the ring … +1 front; the hub is 0. Drives real z-stacking (occlusion via the depth buffer, not painter's order). */
  depth: number
  hub: boolean
  synthetic: boolean
  tone: OrchCubeTone
  roleColor: string
  selected: boolean
  /** Another cube is selected and this one is not — the sibling dim. */
  dimmed: boolean
  /** A metric/roster lens leaves this cube lit or not. */
  lensedOut: boolean
  /** Unacknowledged wants-you — gates the finite pulse, same condition the beacon uses. */
  attention: boolean
}

export interface OrchestrationCubesProps {
  nodes: readonly OrchCubeSpec[]
  viewBox: { w: number; h: number }
}

const TONE_VAR: Record<OrchCubeTone, string> = {
  working: '--blue',
  'needs-you': '--amber',
  idle: '--green',
  exited: '--red',
  starting: '--line'
}

function readCssColor(varName: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  try {
    return new THREE.Color(raw || '#7a8598')
  } catch {
    return new THREE.Color('#7a8598')
  }
}

function reducedMotionNow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Keeps the orthographic camera's frustum pixel-matched to the canvas, 1 world unit = 1 screen pixel. */
function FitCamera({ width, height }: { width: number; height: number }): null {
  const { camera } = useThree()
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.left = -width / 2
    cam.right = width / 2
    cam.top = height / 2
    cam.bottom = -height / 2
    cam.near = 1
    cam.far = 2000
    cam.position.set(0, 0, 500)
    cam.up.set(0, 1, 0)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
  }, [camera, width, height])
  return null
}

/** Per-cube (tone, attention) elapsed-time bookkeeping — a ref map, not React state, since only useFrame reads it. */
function useCubeClocks(): (id: string, tone: string, attention: boolean, nowMs: number) => { sinceToneMs: number; sinceAttentionMs: number } {
  const ref = useRef(new Map<string, { tone: string; toneAt: number; attention: boolean; attentionAt: number }>())
  return (id, tone, attention, nowMs) => {
    const map = ref.current
    let e = map.get(id)
    if (!e || e.tone !== tone) { e = { tone, toneAt: nowMs, attention: false, attentionAt: nowMs }; map.set(id, e) }
    if (attention && !e.attention) { e.attention = true; e.attentionAt = nowMs }
    if (!attention) e.attention = false
    return { sinceToneMs: nowMs - e.toneAt, sinceAttentionMs: attention ? nowMs - e.attentionAt : 0 }
  }
}

function CubeMesh({ node, fit, size, viewBoxW, reducedMotion, getClocks }: {
  node: OrchCubeSpec
  fit: OrchFit
  size: { width: number; height: number }
  viewBoxW: number
  reducedMotion: boolean
  getClocks: ReturnType<typeof useCubeClocks>
}): JSX.Element {
  const mesh = useRef<THREE.Mesh>(null!)
  const material = useRef<THREE.MeshPhysicalMaterial>(null!)
  const lift = useRef(0)
  const colorToken = node.synthetic ? TONE_VAR[node.tone] : node.roleColor
  const [base, setBase] = useState(() => readCssColor(colorToken))
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    const sync = (): void => setBase(readCssColor(colorToken))
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'style'] })
    sync()
    return () => observer.disconnect()
  }, [colorToken])
  // Demand-mode canvases also repaint when a reduced-motion user changes theme.
  useEffect(() => invalidate(), [base, invalidate])
  const restEmissive = node.synthetic ? 0 : node.hub ? 0.55 : node.tone === 'needs-you' ? 0.3 : node.tone === TONE_WORKING ? 0.18 : 0.06
  const half = (node.size * fit.scale) / 2
  const outline = useMemo(() => {
    const box = new THREE.BoxGeometry(half * 2, half * 2, half * 2)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [half])
  useEffect(() => () => outline.dispose(), [outline])
  // Same tilt/yaw the CSS-3D body wore: one fixed stage rotateX, plus a per-node
  // yaw so satellites don't all face the camera identically (orchestration-depth.ts).
  const yawDeg = node.hub ? 45 : 40 + (node.x / viewBoxW) * 10
  const rotation: [number, number, number] = [(-ORCH_STAGE_TILT_DEG * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0]

  useFrame((state, delta) => {
    const nowMs = state.clock.elapsedTime * 1000
    const { sinceToneMs, sinceAttentionMs } = getClocks(node.id, node.tone, node.attention, nowMs)
    const motion = orchCubeMotion({
      tone: node.tone,
      hub: node.hub,
      synthetic: node.synthetic,
      selected: node.selected,
      attention: node.attention,
      sinceToneMs,
      sinceAttentionMs,
      clockMs: nowMs,
      reducedMotion
    })
    lift.current = reducedMotion ? motion.lift : THREE.MathUtils.damp(lift.current, motion.lift, 12, delta)
    const screenX = node.x * fit.scale + fit.offsetX
    const screenY = node.y * fit.scale + fit.offsetY
    mesh.current.position.set(
      screenX - size.width / 2,
      -(screenY - size.height / 2) - motion.yOffset,
      node.depth * 24 + lift.current
    )
    // Orthographic projection makes a pure Z move toward the camera invisible
    // (no perspective enlargement) — a slight scale rides with the lift so
    // "selected" still reads as "lifted", not just "less dim".
    mesh.current.scale.setScalar(motion.scale * (1 + lift.current / 220))
    const dim = (node.dimmed || node.lensedOut) && !node.selected
    const sat = node.tone === 'exited' ? 0.35 : 1
    const hsl = { h: 0, s: 0, l: 0 }
    base.getHSL(hsl)
    // Lifted a touch off the raw tone lightness — the old CSS top face mixed
    // its tone 48% into --fg for the same reason: a lit box reads as a flat
    // colour swatch unless it's brighter than the swatch itself.
    const lightness = Math.min(0.82, hsl.l * 1.3 + 0.08) * (node.tone === 'exited' ? 0.9 : 1) * (dim ? 0.75 : 1)
    const color = new THREE.Color().setHSL(hsl.h, hsl.s * sat * (dim ? 0.55 : 1), lightness)
    material.current.color.copy(color)
    material.current.emissive.copy(color)
    material.current.emissiveIntensity = (restEmissive + (node.hub && !node.synthetic && !reducedMotion ? (Math.sin(nowMs / 700) + 1) * 0.16 : 0) + motion.emissiveBoost + motion.rimBoost * 0.25) * (dim ? 0.4 : 1)
  })

  return (
    <mesh ref={mesh} rotation={rotation} castShadow={!node.synthetic} receiveShadow>
      <boxGeometry args={[half * 2, half * 2, half * 2]} />
      <meshPhysicalMaterial ref={material} roughness={0.16} metalness={0.25} transparent opacity={0.68} depthWrite={false} clearcoat={1} clearcoatRoughness={0.12} />
      <lineSegments geometry={outline}>
        <lineBasicMaterial color={base} transparent opacity={0.8} />
      </lineSegments>
    </mesh>
  )
}

function CubeScene({ nodes, viewBox, reducedMotion }: { nodes: readonly OrchCubeSpec[]; viewBox: { w: number; h: number }; reducedMotion: boolean }): JSX.Element {
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const fit = useMemo(() => orchFitViewbox(viewBox, size), [viewBox, size.width, size.height])
  const getClocks = useCubeClocks()
  useEffect(() => {
    // fiber 9.4's `shadows` shorthand still resolves to the removed
    // PCFSoftShadowMap on this three.js version, spamming a deprecation
    // warning every shadow-map render; set the type directly instead.
    gl.shadowMap.type = THREE.PCFShadowMap
    gl.shadowMap.needsUpdate = true
  }, [gl])
  return (
    <>
      <FitCamera width={size.width} height={size.height} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[160, 260, 340]} intensity={1.3} castShadow={!reducedMotion}>
        <orthographicCamera attach="shadow-camera" args={[-size.width, size.width, size.height, -size.height, 1, 1200]} />
      </directionalLight>
      <mesh position={[0, 0, -80]} receiveShadow>
        <planeGeometry args={[size.width * 1.4, size.height * 1.4]} />
        <shadowMaterial transparent opacity={0.28} />
      </mesh>
      {nodes.map((n) => (
        <CubeMesh key={n.id} node={n} fit={fit} size={size} viewBoxW={viewBox.w} reducedMotion={reducedMotion} getClocks={getClocks} />
      ))}
    </>
  )
}

export function OrchestrationCubes({ nodes, viewBox }: OrchestrationCubesProps): JSX.Element {
  const reducedMotion = reducedMotionNow()
  return (
    <div className="orch__cube-canvas" aria-hidden="true">
      <Canvas
        orthographic
        // Explicit type: fiber 9.4's boolean/default shorthand asks for
        // PCFSoftShadowMap, which this three.js version removed — every
        // shadow re-resolve logged a deprecation warning without this.
        shadows={reducedMotion ? false : 'percentage'}
        dpr={[1, 2]}
        frameloop={reducedMotion ? 'demand' : 'always'}
        gl={{ antialias: true, alpha: true }}
      >
        <CubeScene nodes={nodes} viewBox={viewBox} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
