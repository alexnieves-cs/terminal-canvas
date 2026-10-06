/**
 * The room from above (M434): what the minimap draws and how a press on it
 * maps back to the floor. Pure — no three.js, no React — so the mapping is
 * checked without a room, and the minimap (plain DOM, `WorldMinimap.tsx`)
 * stays out of the three importer set.
 *
 * Orchestrate's SVG minimap (M292) is the precedent: every place as a mark in
 * plan view, the camera over them, a press moves the camera there. Here the
 * places are robots on one square slab, so the map is that square: world x to
 * the right, world z downward — the plan a person standing at the opening
 * camera would draw.
 */

/** Below this many agents in the room the whole room is in the opening shot, and a map of it says nothing the room does not. */
export const MINIMAP_MIN_AGENTS = 6

/** The map's side, in CSS pixels. */
export const MINIMAP_SIZE = 132

/** A point on the floor. */
export interface FloorPoint { x: number; z: number }

/** What the scene reports for the map: the slab, the camera and where each robot is bound for. */
export interface RoomPlan {
  /** Half the slab's side, in world units. */
  half: number
  camera: FloorPoint
  /** What the orbit looks at. */
  target: FloorPoint
  agents: readonly { agentId: string; at: FloorPoint; waiting: boolean }[]
}

export function minimapShown(agents: number): boolean {
  return agents >= MINIMAP_MIN_AGENTS
}

/** A floor point on the map, in pixels from its top-left; the slab fills the map but for a small margin. */
export function toMap(p: FloorPoint, half: number, size: number = MINIMAP_SIZE): { x: number; y: number } {
  const k = (size - 8) / (2 * Math.max(half, 1e-3))
  return { x: size / 2 + p.x * k, y: size / 2 + p.z * k }
}

/** The inverse: a press on the map, back to the floor — clamped onto the slab, so the camera never aims off its edge. */
export function fromMap(x: number, y: number, half: number, size: number = MINIMAP_SIZE): FloorPoint {
  const k = (size - 8) / (2 * Math.max(half, 1e-3))
  const clamp = (v: number): number => Math.min(half, Math.max(-half, v))
  return { x: clamp((x - size / 2) / k), z: clamp((y - size / 2) / k) }
}

/**
 * The camera's wedge on the plan: where it stands, and two points ahead of
 * what it looks at, spread so the wedge reads as a view and not a line.
 * No `cameraToViewport` here — this file takes no value import (`world.map.2`).
 * The viewport footprint that the 2D minimap would draw is `cameraFootprint`.
 */
export function cameraWedge(camera: FloorPoint, target: FloorPoint, spread = 0.42): [FloorPoint, FloorPoint, FloorPoint] {
  const dx = target.x - camera.x
  const dz = target.z - camera.z
  const len = Math.hypot(dx, dz) || 1
  const ux = dx / len
  const uz = dz / len
  const px = -uz
  const pz = ux
  const reach = Math.max(len, 1)
  return [
    camera,
    { x: camera.x + ux * reach + px * reach * spread, z: camera.z + uz * reach + pz * reach * spread },
    { x: camera.x + ux * reach - px * reach * spread, z: camera.z + uz * reach - pz * reach * spread }
  ]
}

/** The teammates whose eyes are on this agent. Initials come from the peer; a sample name is not a person. */
export function watchersOn<T extends { panelId: string | null }>(peers: readonly T[], agentId: string): T[] {
  return peers.filter((peer) => peer.panelId === agentId)
}

/** A cheap identity for a plan, rounded to what the map can show, so a still room re-renders nothing. */
export function planKey(plan: RoomPlan | null, size: number = MINIMAP_SIZE): string {
  if (plan === null) return ''
  const r = (p: FloorPoint): string => { const m = toMap(p, plan.half, size); return `${Math.round(m.x)},${Math.round(m.y)}` }
  return [plan.half.toFixed(1), r(plan.camera), r(plan.target), ...plan.agents.map((a) => `${a.agentId}@${r(a.at)}${a.waiting ? '!' : ''}`)].join('|')
}
