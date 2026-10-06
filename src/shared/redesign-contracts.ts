/**
 * Redesign contracts (M435). Types only: no functions, no values, no runtime.
 *
 * F2 and F3 implement these shapes in parallel. Later lanes code against them.
 * No lane owns this file (docs/redesign/ownership.json). A field change is a
 * docs/redesign/requests.md entry the lead accepts, not an edit from a lane.
 *
 * StateTone is declared here rather than re-exported from
 * renderer/panels/panel-state.ts. shared/ must not import renderer/ — the
 * canvas layering rule run backwards would put a renderer module under every
 * main-process import of shared/. The union matches panel-state.ts `Tone`.
 * F1's rd-tone checks pin the two lists equal.
 */

export type StateTone =
  | 'kind'
  | 'asleep'
  | 'none'
  | 'starting'
  | 'working'
  | 'needs-you'
  | 'idle'
  | 'done'
  | 'exited'

/** Why a surface is in the one attention queue. Order is the queue's, not this union's. */
export type AttentionKind = 'approval' | 'question' | 'shell-prompt' | 'failed' | 'recovery'

export interface AttentionItem {
  id: string
  kind: AttentionKind
  /** Panel the item is about. */
  panelId: string
  taskId: string | null
  /** The same sentence panelState would say. The queue must not invent a second wording. */
  sentence: string
  /** Epoch ms the item became true. */
  since: number
  /** Primary verb label. The handler is the palette executor, not a second door. */
  verb: string
}

export interface TaskRegionBounds {
  x: number
  y: number
  w: number
  h: number
}

export interface TaskRegion {
  id: string
  ticket: string | null
  title: string
  agentCount: number
  criteriaDone: number
  criteriaTotal: number
  /** Union of member rects plus padding, snapped to the 24px grid. Canvas pixels. */
  bounds: TaskRegionBounds
}

export type ZoomTier = 'work' | 'plan' | 'map'

/** World floor point. canvasToFloor divides canvas pixels by 100: x stays x, y becomes z. */
export interface FloorPoint {
  x: number
  z: number
}

export interface CameraPose {
  tier: ZoomTier
  target: FloorPoint
  distance: number
  pitch: number
}

export type ShortcutScope = 'canvas' | 'panel' | 'anywhere' | 'mouse'

export type ShortcutGroup = 'create' | 'sessions' | 'navigate' | 'mouse' | 'existing'

export interface ShortcutDef {
  id: string
  /** Display chord, for example "⌘K". The registry is the only list. */
  chord: string
  scope: ShortcutScope
  group: ShortcutGroup
  label: string
  /** Set when this chord is the hidden one-release alias of another id (D5). */
  aliasOf?: string
}
