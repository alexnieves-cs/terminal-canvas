/**
 * Scene depth for the Orchestration graph — pure, plain node (verify:orchestration).
 *
 * The camera tilt is a PROJECTION, not a CSS rotateX on the <svg>: cubes are
 * foreignObjects, and a 3D transform on an SVG ancestor flattens them in
 * Chromium and detaches hit-testing from what is drawn. So the ring's depth
 * axis is foreshortened by cos(tilt) here, and every cube wears the same fixed
 * rotateX (ORCH_STAGE_TILT_DEG) — one stage, one camera, top + side faces.
 *
 * Parallax is by layer: ground and hub slowest, satellites faster the nearer
 * they sit, callouts fastest (they float above the scene, nearest the eye).
 */

export const ORCH_STAGE_TILT_DEG = 32
const COS_TILT = Math.cos((ORCH_STAGE_TILT_DEG * Math.PI) / 180)

export const ORCH_PARALLAX = { ground: 0.6, hub: 0.6, satFar: 0.78, satNear: 0.92, callout: 1 } as const

export type OrchDepthBand = 'far' | 'mid' | 'near'

export interface OrchCamera { x: number; y: number; k: number }
export interface OrchStage { w: number; h: number; cx: number; cy: number; ringR: number }

export interface OrchProjected {
  x: number
  y: number
  /** Multiplies the model size: zoom at this layer's rate times depth scale. */
  scale: number
  /** -1 back of the ring … +1 front; the hub is 0. */
  depth: number
  band: OrchDepthBand
  rate: number
  /** How far a callout slides past its cube, so callouts pan fastest. */
  calloutDrift: { x: number; y: number }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function orchDepthBand(depth: number): OrchDepthBand {
  return depth < -0.35 ? 'far' : depth > 0.35 ? 'near' : 'mid'
}

/** Zoom at a layer's rate, so slower layers also zoom less (the same parallax on k). */
const layerZoom = (k: number, rate: number): number => 1 + (k - 1) * rate

export function orchProjectNode(
  node: { x: number; y: number; hub: boolean },
  stage: OrchStage,
  cam: OrchCamera
): OrchProjected {
  const depth = node.hub ? 0 : clamp((node.y - stage.cy) / Math.max(stage.ringR, 1), -1, 1)
  const rate = node.hub ? ORCH_PARALLAX.hub : ORCH_PARALLAX.satFar + (ORCH_PARALLAX.satNear - ORCH_PARALLAX.satFar) * ((depth + 1) / 2)
  const k = layerZoom(cam.k, rate)
  // Foreshorten around the hub, then zoom around the board centre as before.
  const fy = stage.cy + (node.y - stage.cy) * COS_TILT
  return {
    x: stage.w / 2 + (node.x - stage.w / 2) * k + cam.x * rate,
    y: stage.h / 2 + (fy - stage.h / 2) * k + cam.y * rate,
    scale: k * (1 + depth * 0.1),
    depth,
    band: orchDepthBand(depth),
    rate,
    calloutDrift: {
      x: (cam.x + (node.x - stage.w / 2) * (cam.k - 1)) * (ORCH_PARALLAX.callout - rate),
      y: (cam.y + (fy - stage.h / 2) * (cam.k - 1)) * (ORCH_PARALLAX.callout - rate)
    }
  }
}

/** The ground ellipse sits under the hub's base and moves with the hub layer. */
export function orchGroundPlane(stage: OrchStage, cam: OrchCamera, baseDrop: number): { x: number; y: number; k: number; rx: number; ry: number } {
  const k = layerZoom(cam.k, ORCH_PARALLAX.ground)
  const rx = stage.ringR * 1.45
  return {
    x: stage.w / 2 + (stage.cx - stage.w / 2) * k + cam.x * ORCH_PARALLAX.ground,
    y: stage.h / 2 + (stage.cy + baseDrop - stage.h / 2) * k + cam.y * ORCH_PARALLAX.ground,
    k,
    rx,
    ry: rx * COS_TILT
  }
}

export const ORCH_COS_TILT = COS_TILT

export interface OrchFit { scale: number; offsetX: number; offsetY: number }

/**
 * Mirrors SVG `preserveAspectRatio="xMidYMid meet"`: a uniform scale plus a
 * centred letterbox. The R3F cube island shares this with the SVG ground/edge/
 * callout layers so a mesh always lands under its own hit-target and label,
 * whatever the container's aspect ratio.
 */
export function orchFitViewbox(viewBox: { w: number; h: number }, viewport: { width: number; height: number }): OrchFit {
  if (viewport.width <= 0 || viewport.height <= 0 || viewBox.w <= 0 || viewBox.h <= 0) return { scale: 1, offsetX: 0, offsetY: 0 }
  const scale = Math.min(viewport.width / viewBox.w, viewport.height / viewBox.h)
  return { scale, offsetX: (viewport.width - viewBox.w * scale) / 2, offsetY: (viewport.height - viewBox.h * scale) / 2 }
}
