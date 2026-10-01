import type { JSX, MouseEvent as ReactMouseEvent } from 'react'
import type { CanvasGroup } from './groups'
import { groupRect, lockedCount } from './groups'
import type { Panel } from '@renderer/panels/panels'
import { shellControl } from '@renderer/shell/shell-control'

/**
 * M61. shellControl's pair plus ONE addition the group header forces: the
 * header's own onMouseDown begins a group drag, so a button's mousedown must
 * also stopPropagation or pressing "card" starts dragging the group. The
 * click half is untouched, which is what makes Enter and Space work — the
 * pre-M61 buttons ran their verb from onMouseDown alone and no keyboard
 * could reach them, a route M59's audit had no step to ask about.
 */
const groupControl = (run: () => void): ReturnType<typeof shellControl> => {
  const control = shellControl(run)
  return {
    onMouseDown: (event) => { control.onMouseDown(event); event.stopPropagation() },
    onClick: control.onClick
  }
}

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
            // M408 follow-up. Only the primary button drags a group; a right-
            // or ⌃-press is the context menu's (PanelFrame's rule).
            if (event.button !== 0 || event.ctrlKey) return
            onBeginDrag(group, event)
          }}
        >
          <span className="canvas-group__label">{group.label}</span>
          {/* M92. A locked member stays put under a group drag; the frame says so. */}
          {lockedCount(group, panels) > 0 && <span className="canvas-group__locked" data-group-locked title="locked panels stay where they are when the group is dragged">{lockedCount(group, panels)} locked</span>}
          <span className="canvas-group__count">{group.panelIds.length}</span>
          {!readOnly && <button
            type="button"
            className="canvas-group__toggle"
            {...groupControl(() => onToggle(group.id))}
            title={group.collapsed ? 'Show group panels' : 'Card group panels'}
          >{group.collapsed ? 'expand' : 'card'}</button>}
          {!readOnly && <button
            type="button"
            className="canvas-group__remove"
            {...groupControl(() => onRemove(group.id))}
            title="Remove group (its panels stay)"
          >remove</button>}
        </header>
      </section>
    )
  })}</>
}
