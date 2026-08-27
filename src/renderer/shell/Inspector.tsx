import type { JSX } from 'react'

/**
 * The right inspector. M8a ships the region and its header only; M8c fills it
 * with the selected panel's resolved command, cwd, pid and reattached flag —
 * fields main has carried since M6a with no reader anywhere.
 */
export function Inspector(): JSX.Element {
  return (
    <aside className="shell__inspector" aria-label="Inspector">
      <div className="shell__region-title">Panel</div>
    </aside>
  )
}
