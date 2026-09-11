import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { minimapProjection, minimapToWorld, viewportCentredAt, type MinimapProjection } from './minimap'
import type { Size, Viewport, WorldRect } from './viewport'
import { useAgentState } from '@renderer/session/agent-state-store'
import { panelState, type StateInput } from '@renderer/panels/panel-state'
import { useChat } from '@renderer/chat/chat-store'
import { chatStateInput } from '@renderer/chat/chat-model'

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

function Block({ row, box }: { row: MinimapRow; box: { x: number; y: number; w: number; h: number } }): JSX.Element {
  const shown = useMinimapRowState(row)
  return (
    <div className="minimap__block" data-minimap-block={row.id} data-tone={shown.tone} title={`${row.label} — ${shown.word}`}
      style={{ left: box.x, top: box.y, width: Math.max(2, box.w), height: Math.max(2, box.h) }} />
  )
}

function MinimapAltRow({ row }: { row: MinimapRow }): JSX.Element {
  const shown = useMinimapRowState(row)
  return <li>{row.label} — {shown.word}</li>
}

export function Minimap({ rects, rows, viewport, goTo, marks }: MinimapProps): JSX.Element | null {
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

  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
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
    dragRef.current = { moved: false }
    setGhost(local(event))
    const move = (e: MouseEvent): void => { if (dragRef.current) { dragRef.current.moved = true; setGhost(local(e)) } }
    const up = (e: MouseEvent): void => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
      const p = local(e)
      dragRef.current = null
      setGhost(null)
      const world = minimapToWorld(p, projection)
      goTo(viewportCentredAt(world, viewport, size))
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }, [projection, viewport, size, goTo])

  const viewBox = ghost === null ? projection.view : { ...projection.view, x: ghost.x - projection.view.w / 2, y: ghost.y - projection.view.h / 2 }
  // An empty canvas has no board to show: nothing, rather than an iris box
  // beside the launcher with no purpose a person could name.
  if (rects.length === 0) return null
  const cover = (projection.view.w * projection.view.h) / ((MINIMAP_W - 2 * 6) * (MINIMAP_H - 2 * 6))
  return (
    <div
      ref={hostRef}
      className="minimap"
      data-minimap
      data-cover={cover > 0.9 ? 'full' : 'part'}
      role="img"
      aria-label={`Overview: ${rects.length} panel${rects.length === 1 ? '' : 's'}; click or drag to move the camera`}
      title="Overview — click or drag to move the camera"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      onMouseDown={onMouseDown}
    >
      {projection.blocks.map((b) => {
        const row = byId.get(b.id)
        return row === undefined ? null : <Block key={b.id} row={row} box={b} />
      })}
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
    </div>
  )
}
