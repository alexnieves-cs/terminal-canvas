import type { PaletteActions } from '@renderer/palette/commands'
import { isShapePanel } from '@renderer/panels/panels'
import { setEditingShape } from '@renderer/flowchart/shape-edit-store'
import type { ActionCtx } from './types'

/**
 * M388. The flowchart's verbs, as the palette, the agent line and a workflow
 * node reach them. The slice is thin on purpose: the meaning lives in
 * `useFlowchartVerbs` (the Canvas half), which the gesture and the inspector
 * call too — one implementation behind all four doors (the executor's rule).
 */
export type FlowchartActions = Pick<PaletteActions,
  | 'addShape'
  | 'setShapeText'
  | 'styleShape'
  | 'editShapeLabel'
  | 'connectObjects'
  | 'styleConnector'
  | 'duplicateObjects'
  | 'alignObjects'
  | 'distributeObjects'
  | 'layoutFlowchart'
  | 'importFlowchart'
  | 'exportFlowchart'
>

/** A door's id list: space- or comma-separated; absent or blank is the person's selection. */
const idList = (ids?: string): string[] | undefined => {
  const out = (ids ?? '').split(/[\s,]+/).filter(Boolean)
  return out.length === 0 ? undefined : out
}

export function flowchartActions(ctx: ActionCtx): FlowchartActions {
  const { flowchartVerbs, connectorVerbs, flowchartIO, panelsRef, selectedIdsRef } = ctx
  return {
    addShape: (form, text) => {
      const out = flowchartVerbs.addShape(form, text)
      return out.kind === 'ran' ? { kind: 'ran', ...(out.note === undefined ? {} : { note: out.note }) } : out
    },
    setShapeText: (panelId, text) => flowchartVerbs.setShapeText(panelId, text),
    styleShape: (panelId, field, value) => {
      // One field per call — the agent's line names it; `line` is the word a
      // person uses for a stroke, `text` for the label's colour.
      const key = field === 'line' || field === 'stroke' ? 'stroke' : field === 'text' || field === 'ink' ? 'ink' : field
      if (key !== 'form' && key !== 'fill' && key !== 'stroke' && key !== 'ink') return { kind: 'refused', reason: `${field} is not something a shape has — form, fill, line or text` }
      return flowchartVerbs.setShapeStyle([panelId], { [key]: value })
    },
    connectObjects: (from, to, label) => {
      const out = connectorVerbs.connect(from, to, label === undefined ? undefined : { label })
      return out.kind === 'ran' ? { kind: 'ran', ...(out.note === undefined ? {} : { note: out.note }) } : out
    },
    styleConnector: (id, field, value) => {
      const v = value.trim()
      switch (field) {
        case 'route': return connectorVerbs.patch(id, { route: v })
        case 'arrows': case 'ends': return connectorVerbs.patch(id, { ends: v })
        case 'line': case 'stroke': return connectorVerbs.patch(id, { stroke: v })
        case 'dashed': return v === 'on' || v === 'true' || v === 'yes' ? connectorVerbs.patch(id, { dashed: true }) : v === 'off' || v === 'false' || v === 'no' ? connectorVerbs.patch(id, { dashed: false }) : { kind: 'refused', reason: 'dashed is on or off' }
        case 'label': return connectorVerbs.patch(id, { label: v.replace(/\\n/g, ' ') })
        default: return { kind: 'refused', reason: `${field} is not something a connector has — route, arrows, line, dashed or label` }
      }
    },
    duplicateObjects: (ids) => flowchartVerbs.duplicate(idList(ids)),
    alignObjects: (edge, ids) => flowchartVerbs.align(edge, idList(ids)),
    distributeObjects: (axis, ids) => flowchartVerbs.distribute(axis, idList(ids)),
    layoutFlowchart: (direction, ids) => flowchartIO.layout(direction, idList(ids)),
    importFlowchart: (path) => flowchartIO.importMermaidFile(path === undefined || path.trim() === '' ? undefined : path.trim()),
    exportFlowchart: (format) => flowchartIO.exportFlowchart(format),
    editShapeLabel: () => {
      const id = [...(selectedIdsRef.current ?? [])].find((sid) => { const p = panelsRef.current?.find((q) => q.rect.id === sid); return p !== undefined && isShapePanel(p) })
      if (id === undefined) return { kind: 'refused', reason: 'select a shape first' }
      setEditingShape(id)
      return { kind: 'ran' }
    }
  }
}
