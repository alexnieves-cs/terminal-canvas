import { memo, type JSX } from 'react'
import type { RailAttention } from './rail-sections'
import type { CenterView, NavigatorPane } from './useShellChrome'
import { shellControl } from './shell-control'
import { agentWord } from '@renderer/panels/panel-state'
import { Bell, Folder, Gear, Grid, KindNote, KindToolbox, KindWork, Layers, Link, Orbit, People, ProductMark } from '@renderer/icons'
import { EmptyState } from './EmptyState'

export interface DockProps {
  /** Which pane the navigator shows, when it shows. */
  navigator: NavigatorPane
  /** The navigator is on screen; a dock icon is pressed only then. */
  navVisible: boolean
  onChoose: (pane: NavigatorPane) => void
  /** M268. Which center page is showing; Orchestrate is pressed from this, not the navigator. */
  centerView: CenterView
  /** M268. Swap canvas ↔ orchestration. Choosing Canvas also lands on the panels navigator. */
  onSetCenterView: (view: CenterView) => void
  attention: RailAttention[]
  attentionOpen: boolean
  onToggleAttention: () => void
  onGoToPanel: (id: string) => void
  /** M76. Answer a chat's pending request from the popover, without going to it. */
  onAnswer: (id: string, requestId: string, allow: boolean) => void
  onSettings: () => void
}

/**
 * M46/M257. The dock: a compact icon column that becomes a labelled rail at
 * wide breakpoints, the only permanently resident chrome besides the top bar. Each icon selects the navigator pane; clicking the
 * active one collapses the pane. This is what makes a fifth navigator cheap
 * — a row in this array, not a negotiation over a column's height.
 *
 * M268. Orchestrate is a CENTER PAGE, not a navigator pane — it sits in the
 * Work group beside Canvas, and pressing it swaps the center column while
 * the canvas host stays mounted underneath.
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
function DockImpl({
  navigator, navVisible, onChoose, centerView, onSetCenterView,
  attention, attentionOpen, onToggleAttention, onGoToPanel, onAnswer, onSettings
}: DockProps): JSX.Element {
  const groups: Array<{ label: string; entries: Array<{ id: NavigatorPane; label: string; shortcut?: string; icon: JSX.Element }> }> = [
    { label: 'Work', entries: [
      { id: 'panels', label: 'Canvas', shortcut: '⌘\\', icon: <Grid /> },
      { id: 'workspaces', label: 'Workspaces', icon: <Layers /> },
      { id: 'board', label: 'Tasks', icon: <KindWork /> }
    ] },
    { label: 'Content', entries: [
      { id: 'files', label: 'Files', shortcut: '⌘B', icon: <Folder /> },
      { id: 'vault', label: 'Notes', icon: <KindNote /> },
      { id: 'skills', label: 'Skills', icon: <KindToolbox /> }
    ] },
    { label: 'Connections', entries: [
      { id: 'integrations', label: 'Integrations', icon: <Link /> },
      { id: 'teammates', label: 'Teammates', icon: <People /> }
    ] }
  ]
  const canvasPressed = centerView === 'canvas' && navVisible && navigator === 'panels'
  const orchPressed = centerView === 'orchestration'
  return (
    <nav className="shell__dock" aria-label="Dock">
      <span className="dock__product" aria-hidden="true"><ProductMark /></span>
      {groups.map((group) => <div className="dock__group" data-dock-group={group.label.toLowerCase()} key={group.label}>
        <div className="dock__group-label">{group.label}</div>
        {group.entries.map((e) => {
        const isCanvas = e.id === 'panels'
        const pressed = isCanvas
          ? canvasPressed
          : centerView === 'canvas' && navVisible && navigator === e.id
        return (
          <button
            key={e.id}
            type="button"
            className={`dock__button icon-button${pressed ? ' dock__button--on' : ''}`}
            data-dock={e.id}
            aria-pressed={pressed}
            aria-label={e.label}
            title={`${pressed ? 'Hide' : 'Show'} ${e.label}${e.shortcut === undefined ? '' : ` (${e.shortcut})`}`}
            {...shellControl(() => {
              if (isCanvas) {
                onSetCenterView('canvas')
                onChoose('panels')
                return
              }
              onChoose(e.id)
            })}
          >
            {e.icon}
            {/* M172/M257. The name is always a tooltip and becomes a persistent label at wide widths. */}
            <span className="dock__label" aria-hidden="true">{e.label}{e.shortcut !== undefined && <kbd>{e.shortcut}</kbd>}</span>
          </button>
        )
      })}
        {group.label === 'Work' && (
          <button
            type="button"
            className={`dock__button icon-button${orchPressed ? ' dock__button--on' : ''}`}
            data-dock="orchestration"
            aria-pressed={orchPressed}
            aria-label="Orchestrate"
            title={orchPressed ? 'Show Canvas' : 'Show Orchestration'}
            {...shellControl(() => onSetCenterView(orchPressed ? 'canvas' : 'orchestration'))}
          >
            <Orbit />
            <span className="dock__label" aria-hidden="true">Orchestrate</span>
          </button>
        )}
      </div>)}
      <div className="dock__group dock__group--system" data-dock-group="system">
        <div className="dock__group-label">System</div>
        <div className="dock__attention">
        <button
          type="button"
          className={`dock__button icon-button${attentionOpen ? ' dock__button--on' : ''}`}
          data-dock="attention"
          aria-pressed={attentionOpen}
          aria-label={attention.length === 0 ? 'Attention: nothing waiting' : `Attention: ${attention.length} waiting`}
          title="Notifications: panels that need you (⌘J)"
          {...shellControl(onToggleAttention)}
        >
          <Bell />
          <span className="dock__label" aria-hidden="true">Notifications <kbd>⌘J</kbd></span>
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
                <li className="rail-empty"><EmptyState id="attention" glyph={<Bell />} /></li>
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
        <button type="button" className="dock__button shell__settings icon-button" data-dock="settings"
          aria-label="Settings" title="Settings" {...shellControl(onSettings)}><Gear /><span className="dock__label" aria-hidden="true">Settings</span></button>
      </div>
      {/* M172. The `N live / N quiet` capsules left the dock (the metrics rule): the count is the rail's `Agents · N` heading. */}
    </nav>
  )
}

export const Dock = memo(DockImpl)
