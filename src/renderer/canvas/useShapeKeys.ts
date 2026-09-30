import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { SHAPE_SIZE, nextStepForm, type Port, type ShapeForm } from '@shared/flowchart'
import { portPoint } from '@shared/flowchart-geometry'
import { isShapePanel, type Panel } from '@renderer/panels/panels'
import { COPYABLE } from '@renderer/flowchart/object-clipboard'
import { setEditingShape } from '@renderer/flowchart/shape-edit-store'
import type { FlowchartVerbs } from './useFlowchartVerbs'
import type { Connectors } from './useConnectors'

/**
 * M390. THE DIAGRAM'S KEYS — a scoped, recorded exception to "every canvas
 * chord is ⌘" (docs/build-log/m388-m396-ledger.md, D3).
 *
 * The ⌘-gate exists because a focused terminal claims every bare key. These
 * keys act ONLY when (1) DOM focus is on the canvas host or nothing — never a
 * terminal's textarea, an input, an editor — (2) no overlay holds the
 * keyboard (`shouldIgnoreKeys`), and (3) the selection is non-empty and made
 * of authored objects alone. So a terminal can never see a key the canvas
 * took, and a key the canvas takes can never reach a terminal. A shape press
 * hands the keyboard to the host first (useFlowchartVerbs' releaseKeyboard).
 *
 *   Enter         edit the selected shape's label
 *   Tab           add the NEXT STEP, connected, in the chart's flow; its label opens
 *   ⇧Tab          select the step before (the source of an incoming connector)
 *   ⌥ + arrow     add a connected shape in that direction — a branch
 *   arrow         nudge by 1 (⇧: 10), committed once on release
 *   Delete / ⌫    delete the selection
 *   ⌘D            duplicate the selection
 *
 * While a label is open its editor stops every key (ShapeLayer), and Tab
 * there commits AND adds the next step — a chain is typed without leaving
 * the keyboard (onShapeText's `tab` arm, wired here through `nextStep`).
 */

export interface ShapeKeysDeps {
  hostRef: RefObject<HTMLElement | null>
  panelsRef: RefObject<Panel[]>
  selectedIdsRef: RefObject<ReadonlySet<string>>
  shouldIgnoreKeys: () => boolean
  mergedRef: RefObject<boolean>
  flowchart: FlowchartVerbs
  connectors: Connectors
  selectOnly: (id: string | null) => void
}

const ARROW: Record<string, Port> = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e' }
const NORMAL: Record<Port, { x: number; y: number }> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } }
/** World units between a step and the next one Tab makes — one rank gap (flowchart-layout's default). */
const STEP_GAP = 64

/** The direction a chart flows through `id`: the way its incoming line arrived, else the way its outgoing lines leave, else down. */
export function flowPort(panels: readonly Panel[], id: string): Port {
  const self = panels.find((p) => p.rect.id === id)
  if (self === undefined) return 's'
  const c = { x: self.rect.x + self.rect.w / 2, y: self.rect.y + self.rect.h / 2 }
  const dirTo = (other: Panel, sign: 1 | -1): Port => {
    const o = { x: other.rect.x + other.rect.w / 2, y: other.rect.y + other.rect.h / 2 }
    const dx = (c.x - o.x) * sign
    const dy = (c.y - o.y) * sign
    return Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? 's' : 'n') : (dx >= 0 ? 'e' : 'w')
  }
  const incoming = panels.find((p) => p.connectors?.some((k) => k.to === id))
  if (incoming !== undefined) return dirTo(incoming, 1)
  const firstOut = self.connectors?.[0]
  const out = firstOut === undefined ? undefined : panels.find((p) => p.rect.id === firstOut.to)
  if (out !== undefined) return dirTo(out, -1)
  return 's'
}

/**
 * Where the next shape off `port` goes: a step gap beyond the port, slid
 * sideways (alternating) until its box is clear of every other object — a
 * second Tab from the same step lands BESIDE the first child, not on it.
 */
export function nextStepPoint(panels: readonly Panel[], from: Panel, port: Port, form: ShapeForm): { x: number; y: number } {
  const size = SHAPE_SIZE[form]
  const p = portPoint(isShapePanel(from) ? from.shape.form : null, from.rect, port)
  const n = NORMAL[port]
  const drop = { x: p.x + n.x * STEP_GAP, y: p.y + n.y * STEP_GAP }
  const side = { x: n.y !== 0 ? 1 : 0, y: n.x !== 0 ? 1 : 0 }
  const step = side.x !== 0 ? size.w + 40 : size.h + 40
  const clear = (d: { x: number; y: number }): boolean => {
    const cx = d.x + n.x * size.w / 2
    const cy = d.y + n.y * size.h / 2
    const box = { x: cx - size.w / 2 - 8, y: cy - size.h / 2 - 8, w: size.w + 16, h: size.h + 16 }
    return !panels.some((q) => q.rect.x < box.x + box.w && box.x < q.rect.x + q.rect.w && q.rect.y < box.y + box.h && box.y < q.rect.y + q.rect.h)
  }
  for (let k = 0; k <= 8; k++) {
    const off = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * step
    const d = { x: drop.x + side.x * off, y: drop.y + side.y * off }
    if (clear(d)) return d
  }
  return drop
}

export function useShapeKeys(deps: ShapeKeysDeps): { nextStep: (id: string) => void; previousStep: (id: string) => void } {
  const { hostRef, panelsRef, selectedIdsRef, shouldIgnoreKeys, mergedRef, selectOnly } = deps
  // The verbs are read at USE through a ref: `connectors` is a fresh object
  // whenever a route changes (every frame of a drag), and re-installing the
  // window listener at that rate would be churn for nothing.
  const liveRef = useRef(deps)
  liveRef.current = deps

  const nextStep = useCallback((id: string): void => {
    const panels = panelsRef.current ?? []
    const from = panels.find((p) => p.rect.id === id)
    if (from === undefined || !isShapePanel(from)) return
    const port = flowPort(panels, id)
    const form: ShapeForm = nextStepForm(from.shape.form)
    liveRef.current.connectors.extend(id, port, nextStepPoint(panels, from, port, form))
  }, [panelsRef])
  const previousStep = useCallback((id: string): void => {
    const prev = (panelsRef.current ?? []).find((p) => p.connectors?.some((k) => k.to === id))
    if (prev !== undefined) selectOnly(prev.rect.id)
  }, [panelsRef, selectOnly])

  useEffect(() => {
    const flowchart = (): FlowchartVerbs => liveRef.current.flowchart
    const connectors = (): Connectors => liveRef.current.connectors
    const canvasHasKeys = (): boolean => {
      const active = document.activeElement
      return active === null || active === document.body || active === hostRef.current
    }
    const selection = (): Panel[] => {
      const ids = selectedIdsRef.current ?? new Set<string>()
      return (panelsRef.current ?? []).filter((p) => ids.has(p.rect.id))
    }
    let nudging = false
    const onKeyDown = (event: KeyboardEvent): void => {
      if (mergedRef.current === true || shouldIgnoreKeys() || !canvasHasKeys()) return
      const sel = selection()
      if (sel.length === 0 || !sel.every(COPYABLE)) return
      const only = sel.length === 1 ? sel[0] : null
      // ⌘D: duplicate. (The diagnostics overlay moved to ⌘⌥D — D4.)
      if (event.metaKey && !event.altKey && !event.ctrlKey && event.code === 'KeyD') {
        event.preventDefault()
        if (!event.repeat) flowchart().duplicate()
        return
      }
      if (event.metaKey || event.ctrlKey) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        flowchart().deleteObjects()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        selectOnly(null)
        return
      }
      if (only !== null && isShapePanel(only)) {
        if (event.key === 'Enter') { event.preventDefault(); setEditingShape(only.rect.id); return }
        if (event.key === 'Tab') {
          event.preventDefault()
          if (event.shiftKey) previousStep(only.rect.id)
          else nextStep(only.rect.id)
          return
        }
        const dir = ARROW[event.key]
        if (dir !== undefined && event.altKey) {
          event.preventDefault()
          if (event.repeat) return
          connectors().extend(only.rect.id, dir, nextStepPoint(panelsRef.current ?? [], only, dir, nextStepForm(only.shape.form)))
          return
        }
      }
      const dir = ARROW[event.key]
      if (dir !== undefined && !event.altKey) {
        event.preventDefault()
        const d = event.shiftKey ? 10 : 1
        const n = NORMAL[dir]
        nudging = true
        flowchart().nudge(n.x * d, n.y * d, false)
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (!nudging || ARROW[event.key] === undefined) return
      nudging = false
      flowchart().nudge(0, 0, true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [hostRef, panelsRef, selectedIdsRef, shouldIgnoreKeys, mergedRef, selectOnly, nextStep, previousStep])
  return { nextStep, previousStep }
}
