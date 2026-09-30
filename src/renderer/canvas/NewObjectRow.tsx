import type { JSX } from 'react'
import { Plus } from '@renderer/icons'
import { shellControl } from '@renderer/shell/shell-control'

/**
 * M263. ONE create door on an occupied canvas: a single `+` that opens the
 * same Task | Panel sheet the shell's Create / ⌘⇧N use. The permanent
 * creatable-kind pill band is gone — kinds stay reachable via the sheet,
 * palette, agent line and workflow (four doors), not nine equal canvas pills.
 *
 * It REPEATS the title bar's Create (the global door), so it is styled as a
 * quiet text button — never a second dominant action on the surface.
 *
 * Empty canvas: this component is not mounted; the launcher owns the composed
 * Start work · Ask · Create… strip.
 *
 * M395. It is mounted INSIDE the HUD (`CanvasHud`'s `create`), never on the
 * canvas's top-left corner: there it printed onto whatever panel was framed
 * beneath it and clipped under the top bar (the critic's P1 #2).
 */
export function NewObjectRow(props: {
  onOpenCreate: () => void
  /** Named reason when create is refused (merged view); never removes the control. */
  disabledReason?: string
}): JSX.Element {
  const disabled = props.disabledReason !== undefined
  return (
    <nav className="new-object-row" aria-label="Create" data-create-face="plus"
      onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <button type="button" className="new-object-row__plus" data-create-open
        disabled={disabled} title={props.disabledReason ?? 'Create…'}
        aria-label={disabled ? `Create: ${props.disabledReason}` : 'Create'}
        {...shellControl(() => { if (!disabled) props.onOpenCreate() })}>
        <Plus /><span>Create</span>
      </button>
    </nav>
  )
}
