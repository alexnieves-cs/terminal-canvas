import { useLayoutEffect, useRef, useState, type JSX } from 'react'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@renderer/primitives/Menu'

/**
 * M408 (D1). THE RIGHT-CLICK MENU — one per object, and one for the ground.
 *
 * It owns no verb. Its rows are handed in by Canvas, built from the SAME lists
 * the other surfaces render (object-verbs.ts: a panel's ⋯ list, the pill's
 * selection list), plus the edit rows a terminal's own Copy/Paste are — so
 * nothing here can drift from the ⋯ menu or the pill.
 *
 * It goes through the Menu primitive (Radix: roving focus, typeahead, Escape,
 * outside-press dismissal), opened by a pointer that was never on its
 * trigger: the trigger is a zero-size anchor at the press point, and
 * `pointerOpen` tells the primitive not to take the keyboard out of the
 * terminal (useOpenIntent's rule). It lives in SCREEN space, a sibling of
 * `.world`, so it keeps its size at every zoom; `data-context-for` names what
 * it is about (a panel id, or `canvas`) and is on the canvas's screen-control
 * list, so a press on it is never a press on the world beneath.
 */
export interface ContextRow {
  /** Stable, and `data-context-item` on the row: a panel verb's id, `edit.copy`, `sel.<key>`… */
  id: string
  label: string
  title?: string
  /** Why the row cannot run; absent when it can. */
  disabled?: string
  run: () => void
  /** A line under the label (an advanced door's benefit). */
  benefit?: string
  /** A hairline goes above the first row of each new section. */
  section: string
}

export interface CanvasContextMenuProps {
  /** Where it opened, in the canvas host's own pixels. */
  at: { x: number; y: number }
  /** A panel id, or `canvas` for the ground. */
  forId: string
  heading?: string
  rows: readonly ContextRow[]
  onClose: () => void
}

export function CanvasContextMenu({ at, forId, heading, rows, onClose }: CanvasContextMenuProps): JSX.Element {
  // Kept on screen: opened near the canvas's right or bottom edge it flips to
  // the press's other side, as a system context menu does. Measured before
  // the first paint, from the menu's own box against the host's.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [flip, setFlip] = useState<{ x: boolean; y: boolean }>({ x: false, y: false })
  useLayoutEffect(() => {
    const root = rootRef.current
    const menu = root?.querySelector<HTMLElement>('[data-context-menu]')
    const host = root?.parentElement
    if (!menu || !host) return
    const w = menu.offsetWidth, h = menu.offsetHeight
    setFlip({ x: at.x + w > host.clientWidth, y: at.y + h > host.clientHeight && at.y - h >= 0 })
  }, [at.x, at.y, rows.length])
  return (
    <div ref={rootRef} className="canvas-context" data-context-for={forId} style={{ left: at.x, top: at.y }}
      onContextMenu={(e) => e.preventDefault()}>
      <Menu open={true} onOpenChange={(open) => { if (!open) onClose() }} pointerOpen={true}>
        <MenuTrigger className="canvas-context__anchor" tabIndex={-1} aria-hidden="true" />
        <MenuContent>
          <div className="canvas-context__menu" role="menu" data-context-menu={forId}
            data-flip-x={flip.x ? '' : undefined} data-flip-y={flip.y ? '' : undefined}>
            {heading !== undefined && <div className="canvas-context__heading" data-context-heading>{heading}</div>}
            {rows.map((row, i) => (
              <MenuItem key={row.id} className={`pf__verb pf__verb--word canvas-context__item${row.benefit !== undefined ? ' pf__menu-door' : ''}${i > 0 && rows[i - 1]!.section !== row.section ? ' canvas-context__item--section' : ''}`}
                data-context-item={row.id} disabled={row.disabled !== undefined} title={row.disabled ?? row.title ?? row.label}
                onSelect={() => { if (row.disabled === undefined) row.run() }}>
                {row.benefit !== undefined ? <><span>{row.label}</span><span className="pf__menu-benefit">{row.benefit}</span></> : row.label}
              </MenuItem>
            ))}
          </div>
        </MenuContent>
      </Menu>
    </div>
  )
}
