import { useCallback, useMemo, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import type { FlowDirection, ShapeFill, ShapeInk, ShapeStroke } from '@shared/flowchart'
import { looksLikeMermaid, mermaidImportSentence, parseMermaid, serializeMermaid } from '@shared/flowchart-mermaid'
import { layoutFlow } from '@shared/flowchart-layout'
import { flowchartSvg, type FlowchartSvgColours } from '@shared/flowchart-svg'
import { GROUP_COLOURS, type PersistedGroup } from '@shared/groups'
import { isShapePanel, nextZ, type Panel } from '@renderer/panels/panels'
import { graphToPanels, panelsToGraph, svgModelOf } from '@renderer/flowchart/flow-convert'
import { CAMERA_MAX_MS, CAMERA_MIN_MS } from '@renderer/motion'
import type { VerbResult } from './useFlowchartVerbs'
import type { Point, WorldRect } from './viewport'

/**
 * M391. THE FLOWCHART IN AND OUT — Mermaid import (paste, a file, an agent's
 * line), Mermaid and SVG export through the gate, and auto-layout.
 *
 * INERT ON THE WAY IN. Imported text becomes shapes and connectors and
 * nothing else — a shape is a form and a label; there is no field a `click`
 * directive or a callback could land in, and the parser drops and COUNTS
 * every such line (flowchart-mermaid.ts). The import sentence says what was
 * left out. An agent's diagram lands in a group named for where it came from.
 *
 * GATED ON THE WAY OUT. Both exports are TEXT, so main runs them through
 * `outward` and the result reports the scrub count (ledger D6). The canvas PNG
 * stays the one binary door: an SVG built here carries no raster, no script,
 * no href (flowchart-svg.ts, and main refuses one that does).
 */

export interface FlowchartIODeps {
  setPanels: Dispatch<SetStateAction<Panel[]>>
  commitHistory: (next: Panel[]) => void
  panelsRef: RefObject<Panel[]>
  nextIdRef: MutableRefObject<number>
  setGroups: Dispatch<SetStateAction<PersistedGroup[]>>
  nextGroupIdRef: MutableRefObject<number>
  mergedRef: RefObject<boolean>
  selectedIdsRef: RefObject<ReadonlySet<string>>
  selectOnly: (id: string | null) => void
  addToSelection: (id: string) => void
  worldCentre: () => Point
  /** Frame these rects (a camera jump onto the trail). */
  frameRects: (rects: WorldRect[]) => void
  /** Reduced motion, read at use. */
  reducedMotion: () => boolean
  /** A panel's name as the rest of the app says it — the SVG's label for a live object a connector reaches. */
  nameOf: (p: Panel) => string
}

export interface FlowchartIO {
  importMermaid: (text: string, source: string, at?: Point) => VerbResult
  /** A paste of plain text: Mermaid becomes a diagram; anything else is not ours (false). */
  importPasted: (text: string) => boolean
  importMermaidFile: (path?: string) => Promise<VerbResult>
  exportFlowchart: (format: string, ids?: readonly string[]) => Promise<VerbResult>
  layout: (direction: string, ids?: readonly string[]) => VerbResult
  /** The chart a selection (or a door's ids) means: one shape → every shape it reaches; several → those. */
  chartScope: (ids?: readonly string[]) => Set<string>
}

const DIRECTION_WORDS: Record<string, FlowDirection> = { down: 'TB', tb: 'TB', td: 'TB', up: 'BT', bt: 'BT', right: 'LR', lr: 'LR', left: 'RL', rl: 'RL' }

/** A ```mermaid fence (as an agent's answer or a README carries it) is the wrapper, not the diagram. */
export function stripFence(text: string): string {
  const m = /^\s*```\s*(?:mermaid)?\s*\n([\s\S]*?)\n\s*```\s*$/i.exec(text)
  return m === null ? text : m[1]
}

export function useFlowchartIO(deps: FlowchartIODeps): FlowchartIO {
  const { setPanels, commitHistory, panelsRef, nextIdRef, setGroups, nextGroupIdRef, mergedRef, selectedIdsRef, selectOnly, addToSelection, worldCentre, frameRects, reducedMotion, nameOf } = deps
  const animRef = useRef<number | null>(null)

  const selectMany = (ids: readonly string[]): void => {
    if (ids.length === 0) return
    selectOnly(ids[0])
    for (const id of ids.slice(1)) addToSelection(id)
  }

  const importMermaid = useCallback((text: string, source: string, at?: Point): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to import a diagram' }
    const parsed = parseMermaid(stripFence(text))
    if (parsed.kind !== 'ok') return { kind: 'refused', reason: parsed.reason }
    if (parsed.graph.nodes.length === 0) return { kind: 'refused', reason: 'the diagram has no shapes in it' }
    const centre = at ?? worldCentre()
    // Ids are minted OUT HERE, never inside the setPanels updater — an
    // updater must be pure (StrictMode runs it twice; Canvas.tsx's own note).
    const laid = graphToPanels(parsed.graph, () => nextIdRef.current++, { x: centre.x, y: centre.y }, 0)
    const dx = -laid.width / 2
    const dy = -laid.height / 2
    const shifted = laid.panels.map((p) => ({ ...p, rect: { ...p.rect, x: p.rect.x + dx, y: p.rect.y + dy } }))
    const made = { panels: shifted, groups: laid.groups }
    setPanels((current) => {
      // Placed centred on the point, above everything, in ONE history entry.
      const z0 = nextZ(current)
      const next = [...current, ...shifted.map((p, i) => ({ ...p, z: z0 + i }))]
      commitHistory(next)
      return next
    })
    // The chart lands as a group — its subgraphs, or one group named for
    // where it came from, so a diagram an agent drew says so on the canvas.
    const groupsToMake = made.groups.length > 0 ? made.groups : [{ label: parsed.title ?? source, ids: made.panels.map((p) => p.rect.id) }]
    setGroups((current) => [...current, ...groupsToMake.filter((g) => g.ids.length > 0).map((g) => {
      const n = nextGroupIdRef.current++
      return { id: `g${n}`, label: g.label.slice(0, 80), colour: GROUP_COLOURS[(n - 1) % GROUP_COLOURS.length], panelIds: g.ids }
    })])
    selectMany(made.panels.map((p) => p.rect.id))
    if (made.panels.length > 0) frameRects(made.panels.map((p) => p.rect))
    // Lines neither end could hold (a node with more than 64 lines in AND out) are said, never lost silently.
    const lost = laid.dropped === 0 ? '' : ` · ${laid.dropped} line${laid.dropped === 1 ? '' : 's'} left out (more than 64 on one shape)`
    return { kind: 'ran', note: `${mermaidImportSentence(parsed)}${lost} · from ${source}` }
  }, [commitHistory, frameRects, mergedRef, nextGroupIdRef, nextIdRef, setGroups, setPanels, worldCentre])

  const importPasted = useCallback((text: string): boolean => {
    const body = stripFence(text)
    if (!looksLikeMermaid(body)) return false
    importMermaid(body, 'a paste')
    return true
  }, [importMermaid])

  const importMermaidFile = useCallback(async (path?: string): Promise<VerbResult> => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to import a diagram' }
    const read = await window.canvas.flowchart.read(path === undefined ? {} : { path })
    if (read.kind === 'cancelled') return { kind: 'ran', note: 'nothing imported' }
    if (read.kind === 'refused') return { kind: 'refused', reason: read.reason }
    return importMermaid(read.text, read.name)
  }, [importMermaid, mergedRef])

  const exportFlowchart = useCallback(async (format: string, ids?: readonly string[]): Promise<VerbResult> => {
    if (format !== 'mermaid' && format !== 'svg') return { kind: 'refused', reason: `${format} is not an export format — mermaid or svg` }
    const want = new Set(ids !== undefined && ids.length > 0 ? ids : [...(selectedIdsRef.current ?? [])])
    const panels = panelsRef.current ?? []
    // A selection of shapes exports those; no shape selected exports every shape on the canvas.
    let scope = [...want].some((id) => { const p = panels.find((q) => q.rect.id === id); return p !== undefined && isShapePanel(p) }) ? want : new Set<string>()
    // One shape selected means ITS CHART, as for a layout.
    if (scope.size === 1) scope = reachable(panels, [...scope][0])
    if (!panels.some((p) => isShapePanel(p) && (scope.size === 0 || scope.has(p.rect.id)))) return { kind: 'refused', reason: 'there is no diagram on this canvas to export' }
    let text: string
    let note = ''
    if (format === 'mermaid') {
      const { graph, leftOut } = panelsToGraph(panels, scope)
      text = serializeMermaid(graph)
      if (leftOut > 0) note = ` · ${leftOut} line${leftOut === 1 ? '' : 's'} to a live object left out (Mermaid has no word for one)`
    } else {
      text = flowchartSvg(svgModelOf(panels, scope, nameOf), themeColours())
    }
    const out = await window.canvas.export.flowchart({ format, text, suggestedName: format === 'mermaid' ? 'diagram.mmd' : 'diagram.svg' })
    if (out.kind === 'cancelled') return { kind: 'ran', note: 'nothing exported' }
    if (out.kind === 'refused') return { kind: 'refused', reason: out.reason }
    const scrubbed = out.redacted === 0 ? 'nothing looked like a secret' : `${out.redacted} secret${out.redacted === 1 ? '' : 's'} scrubbed`
    return { kind: 'ran', note: `exported to ${out.path} · ${scrubbed}${note}` }
  }, [nameOf, panelsRef, selectedIdsRef])

  const layout = useCallback((direction: string, ids?: readonly string[]): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to arrange' }
    const dir = DIRECTION_WORDS[direction.toLowerCase()]
    if (dir === undefined) return { kind: 'refused', reason: `${direction} is not a direction — down, right, up or left` }
    const panels = panelsRef.current ?? []
    const picked = new Set(ids !== undefined && ids.length > 0 ? ids : [...(selectedIdsRef.current ?? [])])
    // One shape selected means ITS CHART: every shape it reaches by connectors.
    let scope = new Set([...picked].filter((id) => { const p = panels.find((q) => q.rect.id === id); return p !== undefined && isShapePanel(p) && p.locked !== true }))
    if (scope.size === 1) scope = reachable(panels, [...scope][0])
    const shapes = panels.filter((p) => scope.has(p.rect.id) && isShapePanel(p) && p.locked !== true)
    if (shapes.length < 2) return { kind: 'refused', reason: 'select a chart (or two or more shapes) to lay out' }
    const edges: { from: string; to: string }[] = []
    for (const p of shapes) for (const c of p.connectors ?? []) if (scope.has(c.to)) edges.push({ from: p.rect.id, to: c.to })
    const laid = layoutFlow({ nodes: shapes.map((s) => ({ id: s.rect.id, w: s.rect.w, h: s.rect.h })), edges }, dir)
    // The chart keeps its top-left: laid out where it is, never flung elsewhere.
    const ox = Math.min(...shapes.map((s) => s.rect.x))
    const oy = Math.min(...shapes.map((s) => s.rect.y))
    const from = new Map(shapes.map((s) => [s.rect.id, { x: s.rect.x, y: s.rect.y }]))
    const to = new Map(shapes.map((s) => { const at = laid.positions.get(s.rect.id) ?? { x: 0, y: 0 }; return [s.rect.id, { x: ox + at.x, y: oy + at.y }] }))
    const far = Math.max(0, ...shapes.map((s) => { const a = from.get(s.rect.id)!; const b = to.get(s.rect.id)!; return Math.hypot(b.x - a.x, b.y - a.y) }))
    const place = (t: number, commit: boolean): void => {
      setPanels((current) => {
        const next = current.map((p) => {
          const a = from.get(p.rect.id)
          const b = to.get(p.rect.id)
          if (a === undefined || b === undefined) return p
          return { ...p, rect: { ...p.rect, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } }
        })
        if (commit) commitHistory(next)
        return next
      })
    }
    if (animRef.current !== null) cancelAnimationFrame(animRef.current)
    // MOTION THAT EXPLAINS: every shape travels to its place so the eye can
    // follow where each one went — a camera-tier move (160–320ms by distance,
    // motion.ts), eased, and ONE history entry at the end. Reduced motion is
    // the end state at once.
    const duration = reducedMotion() || far < 1 ? 0 : Math.min(CAMERA_MAX_MS, Math.max(CAMERA_MIN_MS, CAMERA_MIN_MS + far / 4))
    if (duration === 0) { place(1, true) } else {
      const start = performance.now()
      const step = (now: number): void => {
        const k = Math.min(1, (now - start) / duration)
        const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
        if (k >= 1) { animRef.current = null; place(1, true); return }
        place(eased, false)
        animRef.current = requestAnimationFrame(step)
      }
      animRef.current = requestAnimationFrame(step)
    }
    return { kind: 'ran', note: `${shapes.length} shapes laid out ${direction === 'tb' || direction === 'td' ? 'down' : direction}` }
  }, [commitHistory, mergedRef, panelsRef, reducedMotion, selectedIdsRef, setPanels])

  const chartScope = useCallback((ids?: readonly string[]): Set<string> => {
    const panels = panelsRef.current ?? []
    const picked = [...new Set(ids !== undefined && ids.length > 0 ? ids : [...(selectedIdsRef.current ?? [])])].filter((id) => { const p = panels.find((q) => q.rect.id === id); return p !== undefined && isShapePanel(p) })
    return picked.length === 1 ? reachable(panels, picked[0]) : new Set(picked)
  }, [panelsRef, selectedIdsRef])

  return useMemo(() => ({ importMermaid, importPasted, importMermaidFile, exportFlowchart, layout, chartScope }), [importMermaid, importPasted, importMermaidFile, exportFlowchart, layout, chartScope])
}

/** Every shape connected to `id` by connectors, in either direction. */
function reachable(panels: readonly Panel[], id: string): Set<string> {
  const adj = new Map<string, string[]>()
  const link = (a: string, b: string): void => { adj.set(a, [...(adj.get(a) ?? []), b]); adj.set(b, [...(adj.get(b) ?? []), a]) }
  const shapeIds = new Set(panels.filter(isShapePanel).map((p) => p.rect.id))
  for (const p of panels) for (const c of p.connectors ?? []) if (shapeIds.has(p.rect.id) && shapeIds.has(c.to)) link(p.rect.id, c.to)
  const seen = new Set([id])
  const queue = [id]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    for (const n of adj.get(cur) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n) }
  }
  return seen
}

/**
 * The theme's colours as LITERALS for an exported SVG: `var()` does not
 * resolve in a file opened elsewhere (the recharts lesson, chart-tokens.ts),
 * so each token is read off the live document once, at export.
 */
function themeColours(): FlowchartSvgColours {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback
  const fill: Record<ShapeFill, string> = { plain: v('--s-1', '#f6f7fa'), none: 'none', yellow: v('--tint-yellow', '#fbf3d5'), blue: v('--tint-blue', '#e2ecf9'), green: v('--tint-green', '#e0f0e4'), pink: v('--tint-pink', '#f9e4ec') }
  const stroke: Record<ShapeStroke, string> = { line: v('--line-strong', '#b5bcc7'), ink: v('--fg-2', '#3f4552'), iris: v('--iris', '#0b7f97'), violet: v('--violet', '#6a4fc4'), none: 'none' }
  const ink: Record<ShapeInk, string> = { fg: v('--fg', '#1b1e26'), muted: v('--fg-3', '#5b6271') }
  return { fill, stroke, ink, background: v('--s-0', '#e3e7ee'), line: v('--fg-3', '#5b6271') } as FlowchartSvgColours
}
