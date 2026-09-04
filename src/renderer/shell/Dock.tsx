import { memo, type JSX } from 'react'
import type { RailAttention } from './rail-sections'
import type { NavigatorPane } from './useShellChrome'
import { shellControl } from './shell-control'
import { agentWord } from '@renderer/panels/panel-state'
import { Bell, Folder, Grid, KindNote, Layers } from '@renderer/icons'

export interface DockProps {
  /** Which pane the navigator shows, when it shows. */
  navigator: NavigatorPane
  /** The navigator is on screen; a dock icon is pressed only then. */
  navVisible: boolean
  onChoose: (pane: NavigatorPane) => void
  attention: RailAttention[]
  attentionOpen: boolean
  onToggleAttention: () => void
  onGoToPanel: (id: string) => void
  /** M76. Answer a chat's pending request from the popover, without going to it. */
  onAnswer: (id: string, requestId: string, allow: boolean) => void
}

/**
 * M46. The dock: a 48px icon column, the only permanently resident chrome
 * besides the top bar. Each icon selects the navigator pane; clicking the
 * active one collapses the pane. This is what makes a fifth navigator cheap
 * — a row in this array, not a negotiation over a column's height.
 *
 * Attention is NOT a pane. It is a count badge on its icon, always visible —
 * the half that keeps a waiting agent from becoming invisible now that the
 * rail's always-resident section is gone — plus a popover on click, because
 * attention is transient and interruptive and a popover is the shape that
 * matches. The badge is the aria-live region (`polite`), for the same reason
 * the old section was: it is the always-mounted surface that changes.
 *
 * Every control mounts shellControl(): focus never leaves the terminal.
 */
function DockImpl({ navigator, navVisible, onChoose, attention, attentionOpen, onToggleAttention, onGoToPanel, onAnswer }: DockProps): JSX.Element {
  const entries: Array<{ id: NavigatorPane; label: string; icon: JSX.Element }> = [
    { id: 'panels', label: 'Panels', icon: <Grid /> },
    { id: 'workspaces', label: 'Workspaces', icon: <Layers /> },
    { id: 'files', label: 'Files', icon: <Folder /> },
    // M85. The fourth pane the dock's own comment said would be cheap.
    { id: 'vault', label: 'Vault', icon: <KindNote /> }
  ]
  return (
    <nav className="shell__dock" aria-label="Dock">
      {entries.map((e) => {
        const pressed = navVisible && navigator === e.id
        return (
          <button
            key={e.id}
            type="button"
            className={`dock__button icon-button${pressed ? ' dock__button--on' : ''}`}
            data-dock={e.id}
            aria-pressed={pressed}
            aria-label={e.label}
            title={pressed ? `Hide ${e.label.toLowerCase()}` : `Show ${e.label.toLowerCase()}`}
            {...shellControl(() => onChoose(e.id))}
          >
            {e.icon}
          </button>
        )
      })}
      <div className="dock__attention">
        <button
          type="button"
          className={`dock__button icon-button${attentionOpen ? ' dock__button--on' : ''}`}
          data-dock="attention"
          aria-pressed={attentionOpen}
          aria-label={attention.length === 0 ? 'Attention: nothing waiting' : `Attention: ${attention.length} waiting`}
          title="Panels that want you"
          {...shellControl(onToggleAttention)}
        >
          <Bell />
        </button>
        {/* Always mounted, so the live region exists before the first bell;
            empty text when nothing waits, which a screen reader reads as
            nothing. */}
        <span className="dock__badge" data-dock-badge aria-live="polite" hidden={attention.length === 0}>
          {attention.length === 0 ? '' : String(attention.length)}
        </span>
        {attentionOpen && (
          <div className="dock__popover" role="dialog" aria-label="Attention">
            <div className="shell__region-title">Attention</div>
            <ul className="rail-list rail-list--attention" aria-label="Attention">
              {attention.length === 0 ? (
                <li className="rail-empty">nothing waiting</li>
              ) : (
                attention.map((row) => (
                  <li key={row.id} className="rail-row rail-attention" data-rail-attention={row.id}>
                    {/* goToPanel and NOTHING else — never onSelectPanel (which
                        wakes) and never an acknowledge: focus is the renderer's
                        single acknowledgement trigger. */}
                    <button
                      type="button"
                      className="rail-row__main"
                      title={`Go to ${row.label}`}
                      {...shellControl(() => onGoToPanel(row.id))}
                    >
                      <span className="rail-row__dot status-dot" data-agent-state="wants-you" data-tone="needs-you" aria-hidden="true" />
                      <span className="rail-row__label">{row.label}</span>
                      {/* M63. The word, and a visible verb: the row IS the jump. */}
                      <span className="rail-row__tail" data-tone={agentWord('wants-you').tone}>{agentWord('wants-you').word}</span>
                      <span className="rail-row__go">jump</span>
                    </button>
                    {/* M76. A chat's question, answerable HERE: the tool named
                        on each verb, the argument in mono under the row. A
                        terminal's row has no verbs — nothing in this app can
                        answer a question typed into a PTY on the user's
                        behalf — and says only `jump`. */}
                    {row.approval !== undefined && (
                      <div className="rail-attention__approval" data-rail-approval={row.approval.requestId}>
                        <span className="rail-attention__argument">{row.approval.argument}</span>
                        <button type="button" className="rail-row__verb" data-rail-allow title={`Allow ${row.approval.toolName} in ${row.label}`}
                          {...shellControl(() => onAnswer(row.id, row.approval!.requestId, true))}>Allow {row.approval.toolName}</button>
                        <button type="button" className="rail-row__verb" data-rail-deny title={`Deny ${row.approval.toolName} in ${row.label}`}
                          {...shellControl(() => onAnswer(row.id, row.approval!.requestId, false))}>Deny {row.approval.toolName}</button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </nav>
  )
}

export const Dock = memo(DockImpl)
