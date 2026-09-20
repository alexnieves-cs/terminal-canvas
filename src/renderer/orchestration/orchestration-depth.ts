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

// 56°, near an isometric elevation: the ring projects wide and short, which is the
// stage's own shape, and a cube shows more side face than lid — it reads as an
// object standing on the ground rather than a tile seen from above. (32° until
// the M279 diorama pass; nothing pins the value, only that the meshes wear it.)
export const ORCH_STAGE_TILT_DEG = 56
/** Ground radius over ring radius. The orbit track is drawn at 1/this, so it is named once. */
export const ORCH_GROUND_K = 1.36
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
  const rx = stage.ringR * ORCH_GROUND_K
  return {
    x: stage.w / 2 + (stage.cx - stage.w / 2) * k + cam.x * ORCH_PARALLAX.ground,
    y: stage.h / 2 + (stage.cy + baseDrop - stage.h / 2) * k + cam.y * ORCH_PARALLAX.ground,
    k,
    rx,
    ry: rx * COS_TILT
  }
}

export const ORCH_COS_TILT = COS_TILT
/** A model z-unit (up off the stage) projects to this many screen px; the platform's thickness band and its deck's rise use it. */
export const ORCH_SIN_TILT = Math.sin((ORCH_STAGE_TILT_DEG * Math.PI) / 180)

/**
 * M291. The platform scene's projection: ONE uniform camera over a world that
 * may be larger than the stage. Unlike `orchProjectNode`, no per-layer parallax —
 * a platform is a rectangle spanning many y values, and a zoom rate that varies
 * with y would warp its footprint (and detach its hit-target from the mesh, which
 * is exactly what the cubes' fixed tilt exists to prevent). The tilt is the same
 * foreshortening of y by cos(ORCH_STAGE_TILT_DEG), around the stage's centre.
 * `depth` is the screen-y rank the meshes stack by: further down is nearer.
 */
export function orchProjectWorld(pt: { x: number; y: number }, stage: { w: number; h: number }, cam: OrchCamera): { x: number; y: number; depth: number } {
  const fy = stage.h / 2 + (pt.y - stage.h / 2) * COS_TILT
  return {
    x: stage.w / 2 + (pt.x - stage.w / 2) * cam.k + cam.x,
    y: stage.h / 2 + (fy - stage.h / 2) * cam.k + cam.y,
    depth: (pt.y - stage.h / 2) / (stage.h / 2)
  }
}

/**
 * M292. The camera that shows `bounds` (model units, pre-tilt) whole in the
 * stage, centred, with `pad` around it; k clamped to the scene's zoom range.
 */
export const ORCH_ZOOM_RANGE = { min: 0.22, max: 2.2 } as const
/**
 * M298. Fit all's own floor, under the wheel's: "show everything" outranks
 * the wheel's legibility floor — at 0.22, a hundred platforms could not be
 * fitted at all (measured 179% of the stage's height), and what they need at
 * that size is the summary level semantic zoom already gives them. A wheel
 * notch from there clamps back into the wheel's range, as before.
 */
export const ORCH_FIT_FLOOR = 0.06
/**
 * `margins` (M298) are SCREEN pixels the fit keeps clear above and below the
 * bounds — the label plates, which do not scale with k — so the box the
 * plates are centred in is the stage minus pad minus those; without them the
 * labels of eight platforms clipped the panel's top edge (measured).
 */
export function orchFitCamera(bounds: { x: number; y: number; w: number; h: number }, stage: { w: number; h: number }, pad: number, margins: { top: number; bottom: number; side?: { px: number; at: number } } = { top: 0, bottom: 0 }, floor: number = ORCH_ZOOM_RANGE.min): OrchCamera {
  const boxH = Math.max(1, stage.h - pad * 2 - margins.top - margins.bottom)
  const boxW = Math.max(1, stage.w - pad * 2)
  // Width: the plates (k · w), or — when a screen-sized label `px` wide either
  // side of a centre `at` model units inside the edge reaches past them —
  // k · (w − 2at) + 2px. The tighter of the two; a single plate has no inner
  // span to trade, so its label's width is the panel's to hold.
  const side = margins.side
  const kPlain = boxW / Math.max(1, bounds.w)
  const kLabel = side !== undefined && bounds.w - 2 * side.at > 1 ? (boxW - 2 * side.px) / (bounds.w - 2 * side.at) : Infinity
  const k = Math.min(ORCH_ZOOM_RANGE.max, Math.max(floor, Math.min(kPlain, kLabel, boxH / Math.max(1, bounds.h * COS_TILT))))
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  // Solve orchProjectWorld(centre) = the box's centre for cam.x / cam.y.
  const boxCy = pad + margins.top + boxH / 2
  const fy = stage.h / 2 + (cy - stage.h / 2) * COS_TILT
  return { k, x: -(cx - stage.w / 2) * k, y: boxCy - stage.h / 2 - (fy - stage.h / 2) * k }
}

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
