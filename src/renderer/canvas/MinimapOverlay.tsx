import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { minimapCovered, minimapNeeded, minimapPanViewport, minimapPresence, minimapProjection, minimapToWorld, minimapViewHit, projectBox, viewportCentredAt, type MinimapPointer, type MinimapPresence, type MinimapProjection } from './minimap'
import type { Size, Viewport, WorldRect } from './viewport'
import { useAgentState } from '@renderer/session/agent-state-store'
import { MINIMAP_LEGEND, panelState, type StateInput } from '@renderer/panels/panel-state'
import { useChat } from '@renderer/chat/chat-store'
import { chatStateInput } from '@renderer/chat/chat-model'
import { emptyState } from '@shared/empty-states'
import { minimapHeader } from './card-detail'

/**
 * M69. THE MINIMAP — the status board at thumbnail scale, in the canvas's
 * top-right corner, outside .world. Every panel is a block in its tone (the
 * same word the edge, the dot and the rail say), the camera is an iris
 * rectangle, and the thumb is the one overlay besides the HUD's zoom cluster
 * that takes the pointer: a click flies the camera there; a drag previews
 * the camera's rectangle under the pointer and moves on release. Both go
 * through `goTo` (useViewport's goToViewport), so the trail records them and
 * nothing here touches the camera's setter — the rule useViewport keeps.
 */

export const MINIMAP_W = 160
export const MINIMAP_H = 100

export interface MinimapRow { id: string; state: StateInput; label: string }

export interface MinimapProps {
  rects: WorldRect[]
  rows: readonly MinimapRow[]
  viewport: Viewport
  goTo: (vp: Viewport) => void
  /** M93. World points of the annotations — drawn as dots so the map shows the margins too. */
  marks?: readonly { x: number; y: number }[]
  /** M258. The selected panels — drawn with a neutral ring, never the camera's iris, so the two cannot be confused. */
  selected?: ReadonlySet<string>
  /** M388. The flowchart shapes among `rects` — drawn as ONE outline path, no per-shape subscription: a chart is a shape on the map, not two hundred status blocks. */
  shapeIds?: ReadonlySet<string>
  /**
   * M402 (B3). A camera flight is under way. The map's `needed` is judged on
   * every in-between frame, so a flight from a view that framed everything
   * brought the full map in on its first frame — over the object being flown
   * to. While flying it stays as it was at take-off — hidden if it was
   * hidden, tucked aside if it was showing — and the landing's framing
   * reserved its box (useViewport's `safely`), so it returns clear of the target.
   */
  flying?: boolean
  /** M442. Task territories, outlined and unfilled so a block's tone stays the panel's. */
  regions?: readonly { x: number; y: number; w: number; h: number }[]
}

/** The one place a minimap row's state is derived — Block and its `.sr-only`
 *  text alternative below both call it, so a colour and its word can never
 *  drift apart. */
function useMinimapRowState(row: MinimapRow): ReturnType<typeof panelState> {
  const agent = useAgentState(row.id)
  // M73. A chat block reads its session mirror, as the rail row does, so the
  // status board shows a conversation's state and not its kind.
  const chat = useChat(row.id)
  const chatInput = row.state.kind === 'chat' ? chatStateInput(chat.snapshot, chat.turns.length > 0) : undefined
  return panelState(chatInput === undefined ? row.state : { ...row.state, chat: chatInput }, agent)
}

function Block({ row, box, selected }: { row: MinimapRow; box: { x: number; y: number; w: number; h: number }; selected: boolean }): JSX.Element {
  const shown = useMinimapRowState(row)
  return (
    <div className="minimap__block" data-minimap-block={row.id} data-tone={shown.tone} data-selected={selected ? '' : undefined} title={`${row.label} — ${shown.word}`}
      style={{ left: box.x, top: box.y, width: Math.max(2, box.w), height: Math.max(2, box.h) }} />
  )
}

function MinimapAltRow({ row }: { row: MinimapRow }): JSX.Element {
  const shown = useMinimapRowState(row)
  return <li>{row.label} — {shown.word}</li>
}

export function Minimap({ rects, rows, viewport, goTo, marks, selected, shapeIds, flying, regions }: MinimapProps): JSX.Element | null {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 1, height: 1 })
  // The CANVAS's size, not the thumb's: the camera's rectangle is the canvas
  // in world units. Measured from the parent, the way EdgeIndicators
  // measures its own full-canvas host.
  useEffect(() => {
    const parent = hostRef.current?.parentElement
    if (!parent) return
    const read = (): void => { const b = parent.getBoundingClientRect(); setSize({ width: b.width, height: b.height }) }
    const observer = new ResizeObserver(read)
    observer.observe(parent)
    read()
    return () => observer.disconnect()
  }, [])

  const projection: MinimapProjection = useMemo(
    () => minimapProjection({ rects, viewport, size, thumb: { w: MINIMAP_W, h: MINIMAP_H } }),
    [rects, viewport, size]
  )
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  // M258. `ghost` is the preview rectangle's TOP-LEFT in thumb px. Two
  // gestures share it: a press on the camera's rectangle GRABS it (the
  // rectangle slides with the grab offset kept, minimapPanViewport from the
  // ORIGIN camera and projection), a press anywhere else recentres it on the
  // pointer (M69). Either way the camera moves once, on release, through
  // goTo — the preview-not-track rule the minimap's load-bearing entry keeps.
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  const dragRef = useRef<{ moved: boolean } | null>(null)
  const local = (event: MouseEvent | ReactMouseEvent): { x: number; y: number } => {
    const b = hostRef.current!.getBoundingClientRect()
    return { x: event.clientX - b.left, y: event.clientY - b.top }
  }
  const onMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    // The one control on the canvas that takes the pointer: preventDefault
    // keeps DOM focus where it was (xterm), stopPropagation keeps the canvas
    // host from starting a marquee or a pan under the thumb.
    event.preventDefault(); event.stopPropagation()
    const origin = local(event)
    const pr = projection, vp = viewport
    const grab = minimapViewHit(origin, pr)
    const at = (p: { x: number; y: number }): { x: number; y: number } => grab
      ? { x: pr.view.x + (p.x - origin.x), y: pr.view.y + (p.y - origin.y) }
      : { x: p.x - pr.view.w / 2, y: p.y - pr.view.h / 2 }
    dragRef.current = { moved: false }
    setGrabbing(grab)
    setGhost(at(origin))
    const move = (e: MouseEvent): void => { if (dragRef.current) { dragRef.current.moved = true; setGhost(at(local(e))) } }
    const up = (e: MouseEvent): void => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
      const p = local(e)
      const moved = dragRef.current?.moved === true
      dragRef.current = null
      setGhost(null)
      setGrabbing(false)
      if (grab) {
        // A press on the rectangle that never moved is not a request to go
        // anywhere: the camera is already there.
        if (moved) goTo(minimapPanViewport(vp, origin, p, pr))
        return
      }
      goTo(viewportCentredAt(minimapToWorld(p, pr), vp, size))
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }, [projection, viewport, size, goTo])

  // M395 (backlog #83). THE MAP YIELDS. `aside` tucks it into its corner
  // while the pointer works in a panel it covers or crosses it mid-gesture
  // (minimap.ts's minimapPresence); `hidden` while every object is already in
  // view, where a click on it goes nowhere (minimapNeeded). The element STAYS
  // MOUNTED either way: the ResizeObserver above lives on it, and the safe
  // area (safe-area.ts) reads its box to reserve it while hidden.
  const needed = minimapNeeded(rects, viewport, size)
  const [presence, setPresence] = useState<MinimapPresence>('rest')
  // M402. `needed` as it was when the camera last stood still (the flying prop's note).
  const settledNeededRef = useRef(needed)
  if (flying !== true) settledNeededRef.current = needed
  // During a flight `needed` is the TAKE-OFF value only — the live one led
  // the first cut, so a flight that left a framing brought the map in anyway.
  const shownNeeded = flying === true ? settledNeededRef.current : needed
  const shownPresence: MinimapPresence | 'hidden' = !shownNeeded ? 'hidden' : flying === true ? 'aside' : presence
  const presenceRef = useRef<MinimapPresence>('rest')
  const beforeRef = useRef<MinimapPointer | null>(null)
  // The latest camera and rects for the document listener, which is
  // installed once — re-installing it on every camera frame would cost more
  // than the reads it saves.
  const liveRef = useRef({ rects, viewport })
  liveRef.current = { rects, viewport }
  useEffect(() => {
    const set = (next: MinimapPresence): void => {
      if (presenceRef.current === next) return
      presenceRef.current = next
      setPresence(next)
    }
    const onMove = (event: MouseEvent): void => {
      const map = hostRef.current
      const parent = map?.parentElement
      if (map === null || map === undefined || parent === null || parent === undefined || map.offsetWidth === 0) { beforeRef.current = null; set('rest'); return }
      // Our own drag is intent by definition; leave the presence alone.
      if (dragRef.current !== null) return
      const hb = parent.getBoundingClientRect()
      const box = map.offsetParent === parent
        ? { x: map.offsetLeft, y: map.offsetTop, w: map.offsetWidth, h: map.offsetHeight }
        : (() => { const b = map.getBoundingClientRect(); return { x: b.left - hb.left, y: b.top - hb.top, w: b.width, h: b.height } })()
      const at = { x: event.clientX - hb.left, y: event.clientY - hb.top }
      const target = event.target instanceof Element ? event.target : null
      const over = target?.closest('[data-panel-id]')?.getAttribute('data-panel-id') ?? null
      const now: MinimapPointer = { at, over, pressed: event.buttons !== 0 }
      const { rects: rs, viewport: vp } = liveRef.current
      set(minimapPresence(presenceRef.current, now, beforeRef.current, box, minimapCovered(box, rs, vp)))
      beforeRef.current = now
    }
    const onLeave = (): void => { beforeRef.current = null; set('rest') }
    document.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  const viewBox = ghost === null ? projection.view : { ...projection.view, x: ghost.x, y: ghost.y }
  // An empty canvas has no board. The sentence is the shared empty state,
  // and it carries no digit — a zero here would be a count of nothing.
  if (rects.length === 0) {
    const sentence = emptyState('minimap').sentence
    return (
      <div ref={hostRef} className="minimap minimap--empty" data-screen-control="" data-minimap role="img" aria-label={sentence}>
        <p className="minimap__empty">{sentence}</p>
      </div>
    )
  }
  const cover = (projection.view.w * projection.view.h) / ((MINIMAP_W - 2 * 6) * (MINIMAP_H - 2 * 6))
  return (
    <div
      ref={hostRef}
      className="minimap"
      data-screen-control=""
      data-minimap
      data-cover={cover > 0.9 ? 'full' : 'part'}
      data-presence={shownPresence}
      aria-hidden={shownPresence === 'hidden' ? true : undefined}
      data-grabbing={grabbing ? '' : undefined}
      role="img"
      aria-label={`Overview: ${rects.length} panel${rects.length === 1 ? '' : 's'}; click to move the camera, or drag the view rectangle to pan`}
      title="Overview — click to move the camera, or drag the view rectangle to pan"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      onMouseDown={onMouseDown}
    >
      <p className="minimap__header">{minimapHeader(regions?.length ?? 0)}</p>
      {(regions ?? []).map((region, i) => {
        const box = projectBox(region, projection)
        return <div key={`region-${i}`} className="minimap__region" data-minimap-region style={{ left: box.x, top: box.y, width: Math.max(2, box.w), height: Math.max(2, box.h) }} />
      })}
      {projection.blocks.map((b) => {
        const row = byId.get(b.id)
        return row === undefined ? null : <Block key={b.id} row={row} box={b} selected={selected?.has(b.id) === true} />
      })}
      {/* M388. The diagram's shapes, one path for all of them. */}
      {shapeIds !== undefined && shapeIds.size > 0 && (
        <svg className="minimap__shapes" data-minimap-shapes width={MINIMAP_W} height={MINIMAP_H} aria-hidden="true">
          <path d={projection.blocks.filter((b) => shapeIds.has(b.id)).map((b) => `M${b.x.toFixed(1)} ${b.y.toFixed(1)}h${Math.max(1, b.w).toFixed(1)}v${Math.max(1, b.h).toFixed(1)}h${(-Math.max(1, b.w)).toFixed(1)}Z`).join('')} />
        </svg>
      )}
      {/* M93. Annotations as dots, so the map shows the margins too. */}
      {(marks ?? []).map((m, i) => (
        <span key={i} className="minimap__mark" data-minimap-mark style={{ left: m.x * projection.scale + projection.ox, top: m.y * projection.scale + projection.oy }} />
      ))}
      {/* M256 (spec §19). The map's own `aria-label` says how many panels and
          nothing about which — a colour swatch at thumbnail scale has no text
          equivalent otherwise. A screen reader reaches every panel's label
          and state here; a sighted person never sees it (`.sr-only`). */}
      <ul className="sr-only">
        {projection.blocks.map((b) => {
          const row = byId.get(b.id)
          return row === undefined ? null : <MinimapAltRow key={b.id} row={row} />
        })}
      </ul>
      <div className={`minimap__view${ghost !== null ? ' minimap__view--dragging' : ''}`} data-minimap-view
        style={{ left: viewBox.x, top: viewBox.y, width: Math.max(4, viewBox.w), height: Math.max(4, viewBox.h) }} />
      {/* M258. The legend is contextual: opacity 0 at rest, 1 on hover. */}
      <div className="minimap__legend" data-minimap-legend aria-hidden="true">
        {MINIMAP_LEGEND.map((l) => <span key={l.tone} className="minimap__legend-item"><span className="minimap__legend-swatch" data-tone={l.tone} />{l.word}</span>)}
        <span className="minimap__legend-item"><span className="minimap__legend-swatch minimap__legend-swatch--view" />view</span>
      </div>
    </div>
  )
}
