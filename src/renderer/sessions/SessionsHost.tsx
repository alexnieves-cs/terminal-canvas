import type { JSX } from 'react'
import { shellControl } from '@renderer/shell/shell-control'

/**
 * M438. The Sessions page's mount point. L-D fills the body. The header link
 * is Orchestrate's door on this page (D2) — the View menu and the palette row
 * are the other two. Empty on purpose: a sentence about having nothing yet
 * would be a second empty state for a page that does not own its content.
 */
export function SessionsHost({ onShowOrchestrate }: { onShowOrchestrate?: () => void }): JSX.Element {
  return (
    <section className="sessions-host" data-sessions-host aria-label="Sessions">
      <header className="sessions-host__bar">
        <h1 className="sessions-host__title">Sessions</h1>
        {onShowOrchestrate !== undefined && (
          <button type="button" className="sessions-host__orch" data-sessions-orchestrate title="Show Orchestrate"
            {...shellControl(onShowOrchestrate)}>Orchestrate</button>
        )}
      </header>
    </section>
  )
}
