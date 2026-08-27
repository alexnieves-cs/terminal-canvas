import type { JSX } from 'react'
import { shellControl } from './shell-control'

/**
 * The right inspector. M8a ships the region, its header and its collapse
 * toggle; M8c fills it with the selected panel's resolved command, cwd, pid
 * and reattached flag — fields main has carried since M6a with no reader
 * anywhere.
 *
 * The toggle stays mounted when the inspector is collapsed, for the same
 * reason the rail's does: it is the only way back without ⇧⌘\.
 */
export function Inspector({ onToggle }: { onToggle: () => void }): JSX.Element {
  return (
    <aside className="shell__inspector" aria-label="Inspector">
      <button
        type="button"
        className="shell__inspector-toggle"
        title="Hide the inspector (⇧⌘\)"
        aria-label="Hide the inspector"
        {...shellControl(onToggle)}
      >
        ›
      </button>
      <div className="shell__region-title">Panel</div>
    </aside>
  )
}
