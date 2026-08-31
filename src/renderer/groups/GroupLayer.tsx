import type { JSX, MouseEvent as ReactMouseEvent } from 'react'
import type { CanvasGroup } from './groups'
import { groupRect } from './groups'
import type { Panel } from '@renderer/panels/panels'

export function GroupLayer({
  groups, panels, readOnly, onBeginDrag, onToggle, onRemove
}: {
  groups: readonly CanvasGroup[]
  panels: readonly Panel[]
  readOnly: boolean
  onBeginDrag(group: CanvasGroup, event: ReactMouseEvent<HTMLElement>): void
  onToggle(id: string): void
  onRemove(id: string): void
}): JSX.Element {
  return <>{groups.map((group) => {
    const rect = groupRect(group, panels)
    if (!rect) return null
    return (
      <section
        key={group.id}
        className={`canvas-group canvas-group--${group.colour}${group.collapsed ? ' canvas-group--collapsed' : ''}`}
        data-group-id={group.id}
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      >
        <header
          className="canvas-group__header"
          onMouseDown={(event) => {
            if (readOnly) return
            event.preventDefault()
            event.stopPropagation()
            onBeginDrag(group, event)
          }}
        >
          <span className="canvas-group__label">{group.label}</span>
          <span className="canvas-group__count">{group.panelIds.length}</span>
          {!readOnly && <button
            type="button"
            className="canvas-group__toggle"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggle(group.id)
            }}
            title={group.collapsed ? 'Show group panels' : 'Card group panels'}
          >{group.collapsed ? 'expand' : 'card'}</button>}
          {!readOnly && <button
            type="button"
            className="canvas-group__remove"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onRemove(group.id)
            }}
            title="Remove group"
          >×</button>}
        </header>
      </section>
    )
  })}</>
}
