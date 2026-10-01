import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
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
 * it is about (a panel id, or `canvas`) and it carries `data-screen-control`
 * (screen-controls.ts), so a press on it is never a press on the world beneath.
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
  // M408 follow-up (the critic's items 2 and 3). THE KEYBOARD STAYS IN THE
  // TERMINAL WHILE THIS IS OPEN — `pointerOpen` keeps focus in xterm's helper
  // textarea, which is right for focus and wrong for KEYS: every key went on
  // to xterm, which ignores `defaultPrevented`. Escape closed the menu AND
  // wrote ESC into the PTY, and ESC interrupts a running Claude; arrows and
  // typeahead letters typed into the shell. So one WINDOW capture listener
  // (it runs before Radix's document listener and long before the textarea)
  // claims every key whose target is outside the menu: Escape closes, the
  // arrows and Home/End move focus onto a row (Radix roves from there), a
  // letter moves to the first row it starts (typeahead), anything else is
  // swallowed. ⌘ chords pass: they are the app's own accelerators, and the
  // edit ones arrive as IPC, not as keys. A key already inside the menu is
  // Radix's to handle and is left alone.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const root = rootRef.current
      if (root === null || event.metaKey || event.key === 'Meta') return
      if (event.target instanceof Node && root.contains(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.type !== 'keydown') return
      const items = [...root.querySelectorAll<HTMLButtonElement>('[data-context-item]:not(:disabled)')]
      if (event.key === 'Escape') { closeRef.current(); return }
      let to: HTMLButtonElement | undefined
      if (event.key === 'ArrowDown' || event.key === 'Home') to = items[0]
      else if (event.key === 'ArrowUp' || event.key === 'End') to = items[items.length - 1]
      else if (event.key.length === 1 && !event.ctrlKey && !event.altKey) to = items.find((b) => (b.textContent ?? '').trim().toLowerCase().startsWith(event.key.toLowerCase()))
      to?.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    window.addEventListener('keypress', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
      window.removeEventListener('keypress', onKey, true)
    }
  }, [])
  // And FOCUS COMES BACK (the A7 rule, Menu.tsx's force-mount effect's
  // condition). Radix focuses the CONTENT when the pointer leaves a row, so
  // after a mere hover the menu held focus, and closing it dropped focus on
  // <body>: the next keys went nowhere. What had focus when the menu opened
  // gets it back on close, but only when focus is lost or still in the menu —
  // never taken from a place a row's verb (Copy, Rename) or a person moved it
  // to. A timeout, not a frame: the menu's node must be gone first, and a
  // hidden window runs no frames.
  useEffect(() => {
    const was = document.activeElement
    return () => {
      window.setTimeout(() => {
        const now = document.activeElement
        const lost = now === null || now === document.body || (rootRef.current?.contains(now) ?? false)
        if (lost && was instanceof HTMLElement && was !== document.body && was.isConnected) was.focus({ preventScroll: true })
      }, 0)
    }
  }, [])
  return (
    <div ref={rootRef} className="canvas-context" data-screen-control="" data-context-for={forId} style={{ left: at.x, top: at.y }}
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
