import { memo, useEffect, useState, type JSX } from 'react'
import type { ElsewhereRow, RailAttention } from './rail-sections'
import type { CenterView, NavigatorPane } from './useShellChrome'
import { shellControl } from './shell-control'
import { agentWord } from '@renderer/panels/panel-state'
import { Bell, ChevronLeft, ChevronRight, Folder, Gear, Grid, KindNote, KindToolbox, KindWork, Layers, Link, Orbit, People, ProductMark } from '@renderer/icons'
import { EmptyState } from './EmptyState'
import { needsYouCount } from '@shared/attention-words'
import { useAttentionOsSettings } from './useAttentionOsSettings'
import { ApprovalAcks, ApprovalDetail } from './ApprovalDetail'
import { useApprovalOutcomes } from './approval-outcome'
import { SNOOZE_CHOICES, waitedWords, type Inbox, type InboxItem } from './decision-inbox'
import { snoozeDecision, wakeDecision } from './useDecisionInbox'
import { outward } from '@shared/outward'

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
  /** D17 / 4.4. Hidden workspaces with a panel that needs you, oldest first. */
  elsewhere: ElsewhereRow[]
  /** Switches workspace if it must, then lands on the panel. */
  onJumpElsewhere: (panelId: string) => void
  attentionOpen: boolean
  onToggleAttention: () => void
  onGoToPanel: (id: string) => void
  /** M76. Answer a chat's pending request from the popover, without going to it. `scope` is M98's session grant. */
  onAnswer: (id: string, requestId: string, allow: boolean, scope?: 'session') => void
  /**
   * #16. The request a navigation shortcut (the inspector's "Review request")
   * opened the queue on — expanded in place of the default, which is the
   * longest-waiting request. Null when the queue was opened by the bell.
   */
  attentionFocus?: string | null
  /** #17. The task a panel belongs to, for the approval's context line. */
  taskTitleOf?: (panelId: string) => string | undefined
  /**
   * M308. The queue as DECISIONS: ranked by what each unblocks, duplicates
   * grouped, snoozed ones apart. Optional — a caller without it renders the
   * queue in arrival order exactly as before.
   */
  inbox?: Inbox
  onSettings: () => void
  /** Backlog #13. The labelled rail is showing — a remembered choice, else Wide's default. */
  expanded: boolean
  onToggleExpanded: () => void
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
  attention, elsewhere, onJumpElsewhere, attentionOpen, onToggleAttention, onGoToPanel, onAnswer, attentionFocus = null, taskTitleOf, inbox, onSettings,
  expanded, onToggleExpanded
}: DockProps): JSX.Element {
  // #16. ONE request's detail is open at a time: the person's own choice,
  // else the one a shortcut pointed at, else the longest-waiting — so the
  // queue opens on a decision, not on a list of summaries. A new focus from
  // a shortcut overrides an earlier choice; `null` is an explicit collapse.
  const [openRequest, setOpenRequest] = useState<string | null | undefined>(undefined)
  useEffect(() => { setOpenRequest(undefined) }, [attentionFocus, attentionOpen])
  // M308. The TOP decision opens by default — the inbox's rank, else arrival order.
  const firstRequest = (inbox?.items.find((i) => i.approval !== undefined)?.approval ?? attention.find((r) => r.approval !== undefined)?.approval)?.requestId ?? null
  const focusLive = attentionFocus !== null && attention.some((r) => r.approval?.requestId === attentionFocus)
  // #14. While an answer is being acknowledged the next request waits folded:
  // opening it in the same frame put a different command where the person's
  // had been, before they could see their press land.
  const acknowledging = useApprovalOutcomes().length > 0
  const shownRequest = openRequest !== undefined ? openRequest : (focusLive ? attentionFocus : acknowledging ? null : firstRequest)
  const groups: Array<{ label: string; entries: Array<{ id: NavigatorPane; label: string; shortcut?: string; icon: JSX.Element }> }> = [
    { label: 'Work', entries: [
      // M315. Named for what it opens — the Panels pane — not "Canvas", which is
      // also the view switch beside it and the default workspace's name.
      { id: 'panels', label: 'Panels', shortcut: '⌘\\', icon: <Grid /> },
      { id: 'workspaces', label: 'Workspaces', icon: <Layers /> },
      { id: 'board', label: 'Tasks', icon: <KindWork /> }
    ] },
    { label: 'Content', entries: [
      { id: 'files', label: 'Files', shortcut: '⌘B', icon: <Folder /> },
      { id: 'vault', label: 'Notes', icon: <KindNote /> },
      { id: 'skills', label: 'Skills', icon: <KindToolbox /> }
    ] },
    { label: 'Connections', entries: [
      { id: 'integrations', label: 'Services', icon: <Link /> },
      { id: 'teammates', label: 'Teammates', icon: <People /> }
    ] }
  ]
  const os = useAttentionOsSettings()
  // M308. What the popover lists: the inbox's ranked decisions, or — for a
  // caller without one — the queue itself, one plain item per row.
  const [snoozeOpen, setSnoozeOpen] = useState<string | null>(null)
  const decisions: InboxItem[] = inbox?.items ?? attention.map((row) => ({
    key: row.id, kind: row.approval === undefined ? 'question' as const : 'permission' as const, panelId: row.id, label: row.label,
    members: [{ panelId: row.id, label: row.label, ...(row.approval === undefined ? {} : { requestId: row.approval.requestId }) }],
    ...(row.approval === undefined ? {} : { approval: row.approval }),
    moreFromPanel: 0, blocker: '', since: 0, unblocks: 0
  }))
  const snoozed = inbox?.snoozed ?? []
  // Members, not items: a grouped decision is still that many panels waiting.
  const snoozedPanels = new Set(snoozed.flatMap((i) => i.members.map((m) => m.panelId)))
  const waiting = attention.filter((r) => !snoozedPanels.has(r.id)).length
  const now = Date.now()
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
            aria-keyshortcuts={e.shortcut === undefined ? undefined : e.shortcut.replace('⌘', 'Meta+')}
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
            title={orchPressed ? 'Show Canvas — arrange and work' : 'Show Orchestrate — monitor and review'}
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
          aria-label={waiting === 0 ? (attention.length === 0 ? 'Notifications: nothing waiting' : `Notifications: ${attention.length} snoozed`) : `Notifications: ${needsYouCount(waiting)}`}
          aria-keyshortcuts="Meta+J"
          title="Notifications: panels that need you (⌘J)"
          {...shellControl(onToggleAttention)}
        >
          <Bell />
          <span className="dock__label" aria-hidden="true">Notifications <kbd>⌘J</kbd></span>
        </button>
        {/* Always mounted, so the live region exists before the first bell;
            empty text when nothing waits, which a screen reader reads as
            nothing. */}
        {/* M308. The badge counts what is NOT snoozed — putting a decision
            off is the point of a snooze — and the popover still lists both. */}
        <span className="dock__badge" data-dock-badge data-attention-new={waiting > 0 ? '' : undefined} aria-live="polite" hidden={waiting === 0}>
          {waiting === 0 ? '' : String(waiting)}
        </span>
        {attentionOpen && (
          <div className="dock__popover" role="dialog" aria-label="Attention">
            <div className="shell__region-title">Needs you</div>
            {/* #14. What was just decided, above what is still waiting. */}
            <ApprovalAcks />
            <ul className="rail-list rail-list--attention" aria-label="Attention">
              {attention.length === 0 ? (
                <li className="rail-empty"><EmptyState id="attention" glyph={<Bell />} /></li>
              ) : decisions.length === 0 ? (
                <li className="rail-empty" data-inbox-all-snoozed="">Everything waiting is snoozed — it comes back on its own, or wake it below.</li>
              ) : (
                decisions.map((item) => {
                  const row = { id: item.panelId, label: item.label }
                  const a = item.approval
                  const open = a !== undefined && shownRequest === a.requestId
                  const others = item.members.slice(1)
                  return (
                  <li key={item.key} className="rail-row rail-attention" data-rail-attention={row.id} data-inbox-kind={item.kind}
                    data-inbox-unblocks={item.unblocks > 0 ? String(item.unblocks) : undefined}>
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
                      <span className="rail-row__label">{row.label}{others.length > 0 ? ` + ${others.length} more` : ''}</span>
                      {/* M63. The word, and a visible verb: the row IS the jump. */}
                      <span className="rail-row__tail" data-tone={agentWord('wants-you').tone}>{agentWord('wants-you').word}</span>
                      <span className="rail-row__go">jump</span>
                    </button>
                    {/* M308. WHY it waits, and enough to decide: the blocker,
                        its task, what deciding unblocks, how long it waited. */}
                    {inbox !== undefined && (
                      <div className="inbox__why" data-inbox-why={item.key}>
                        <p className="inbox__blocker">{item.blocker}</p>
                        {item.kind === 'question' && item.context !== undefined && (
                          <p className="inbox__context" data-inbox-context>{outward(item.context, `panel ${row.id}`).text}</p>
                        )}
                        <p className="inbox__meta">
                          {item.task !== undefined && <span data-inbox-task>{item.task}</span>}
                          {item.unblocks > 0 && <span className="inbox__unblocks" data-inbox-unblocks-word>unblocks {item.unblocks}</span>}
                          {others.length > 0 && <span data-inbox-grouped>same request from {item.members.map((m) => m.label).join(', ')}</span>}
                          {item.moreFromPanel > 0 && <span data-inbox-more>+{item.moreFromPanel} more waiting</span>}
                          <span data-inbox-waited>waiting {waitedWords(item.since, now)}</span>
                        </p>
                      </div>
                    )}
                    {/* M76. A chat's question, answerable HERE. A
                        terminal's row has no verbs — nothing in this app can
                        answer a question typed into a PTY on the user's
                        behalf — and says only `jump`. */}
                    {a !== undefined && (
                        <div className="rail-attention__approval" data-rail-approval={a.requestId} data-rail-approval-open={open ? '' : undefined}>
                          {/* #16. The queue is the ONE surface that explains and
                              resolves a request; the badge, the pill and the
                              inspector only navigate here. Collapsed, a row is its
                              summary and a verb to open it; open, it is the
                              whole decision (#17's layout). */}
                          {open ? (
                            <div className="rail-attention__detail">
                              <ApprovalDetail
                                approval={a}
                                agent={row.label}
                                {...(taskTitleOf?.(row.id) === undefined ? {} : { task: taskTitleOf(row.id) })}
                                onAnswer={(allow, scope) => onAnswer(row.id, a.requestId, allow, scope)}
                              />
                              {/* M308. ONE decision, several askers: each request is
                                  still answered individually, and only "once" —
                                  a session grant is per conversation, never bulk. */}
                              {others.length > 0 && (
                                <div className="inbox__group-verbs">
                                  <button type="button" className="approval__verb" data-inbox-allow-all={item.key}
                                    title={`Allow this one ${a.toolName} call for each of the ${item.members.length} agents asking — each asks again next time`}
                                    {...shellControl(() => { for (const m of item.members) if (m.requestId !== undefined) onAnswer(m.panelId, m.requestId, true) })}>
                                    Allow all {item.members.length} once
                                  </button>
                                  <button type="button" className="approval__verb approval__verb--deny" data-inbox-deny-all={item.key}
                                    {...shellControl(() => { for (const m of item.members) if (m.requestId !== undefined) onAnswer(m.panelId, m.requestId, false) })}>
                                    Deny all {item.members.length}
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="rail-attention__summary">
                              <span className="rail-attention__argument">{a.toolName} · {a.argument}</span>
                              <button type="button" className="rail-row__verb" data-rail-expand={a.requestId} aria-expanded={false}
                                title={`Show ${row.label}'s ${a.toolName} request in full`}
                                {...shellControl(() => setOpenRequest(a.requestId))}>Review</button>
                            </div>
                          )}
                        </div>
                    )}
                    {/* M308. Put a decision off — until a time, never forever. */}
                    {inbox !== undefined && (
                      <div className="inbox__snooze" data-inbox-snooze={item.key}>
                        {snoozeOpen === item.key ? (
                          <>
                            <span className="inbox__snooze-label">Snooze for</span>
                            {SNOOZE_CHOICES.map((c) => (
                              <button key={c.minutes} type="button" className="rail-row__verb" data-inbox-snooze-for={c.minutes}
                                {...shellControl(() => { snoozeDecision(item.key, c.minutes); setSnoozeOpen(null) })}>{c.label}</button>
                            ))}
                            <button type="button" className="rail-row__verb" {...shellControl(() => setSnoozeOpen(null))}>Cancel</button>
                          </>
                        ) : (
                          <button type="button" className="rail-row__verb" data-inbox-snooze-open={item.key}
                            title="Hide this decision for a while — it stays waiting, and comes back on its own"
                            {...shellControl(() => setSnoozeOpen(item.key))}>Snooze</button>
                        )}
                      </div>
                    )}
                  </li>
                  )
                })
              )}
            </ul>
            {/* M308. Snoozed decisions: still waiting, counted, and wakeable. */}
            {snoozed.length > 0 && (
              <>
                <div className="shell__region-title" data-inbox-snoozed-title="">Snoozed · {snoozed.length}</div>
                <ul className="rail-list rail-list--attention" aria-label="Snoozed decisions">
                  {snoozed.map((item) => (
                    <li key={item.key} className="rail-row rail-attention inbox__snoozed" data-inbox-snoozed={item.key}>
                      <span className="rail-row__label">{item.label} — {item.blocker}</span>
                      <span className="inbox__meta"><span>back in {Math.max(1, Math.round((item.until - now) / 60_000))} min</span></span>
                      <button type="button" className="rail-row__verb" data-inbox-wake={item.key}
                        {...shellControl(() => wakeDecision(item.key))}>Wake</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {/* D17 / 4.4. Read-only: what needs you in OTHER workspaces, by
                name and count (their panels are not rendered here, so a label
                would be a guess). The jump is the existing activation, then
                the same landing a notification click makes. */}
            {elsewhere.length > 0 && (
              <>
                <div className="shell__region-title" data-attention-elsewhere-title="">In other workspaces</div>
                <ul className="rail-list rail-list--attention" aria-label="Needs you in other workspaces">
                  {elsewhere.map((w) => (
                    <li key={w.workspaceId} className="rail-row rail-attention" data-attention-elsewhere={w.workspaceId}>
                      <button type="button" className="rail-row__main" title={`Switch to ${w.name} and go to the longest-waiting panel`}
                        {...shellControl(() => onJumpElsewhere(w.panelIds[0]))}>
                        <span className="rail-row__dot status-dot" data-agent-state="wants-you" data-tone="needs-you" aria-hidden="true" />
                        <span className="rail-row__label">{w.name}</span>
                        <span className="rail-row__tail" data-tone="needs-you">{needsYouCount(w.panelIds.length)}</span>
                        <span className="rail-row__go">switch</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {/* 4.2. The OS half of attention, found where attention lives: a
                person who has never searched settings for "sound" still learns
                it exists — and that it is off — the first time they look here. */}
            {os.notify !== null && os.sound !== null && (
              <div className="dock__popover-foot" data-attention-os="">
                <button type="button" className="rail-row__verb" data-attention-os-toggle="notify" aria-pressed={os.notify}
                  title="Post an OS notification when a panel needs you and this window is behind another"
                  {...shellControl(() => os.toggle('attention.notify'))}>Notify · {os.notify ? 'on' : 'off'}</button>
                <button type="button" className="rail-row__verb" data-attention-os-toggle="sound" aria-pressed={os.sound}
                  title="Play your system alert sound when a panel needs you"
                  {...shellControl(() => os.toggle('attention.sound'))}>Sound · {os.sound ? 'on' : 'off'}</button>
              </div>
            )}
          </div>
        )}
      </div>
        <button type="button" className="dock__button shell__settings icon-button" data-dock="settings"
          aria-label="Settings" title="Settings" {...shellControl(onSettings)}><Gear /><span className="dock__label" aria-hidden="true">Settings</span></button>
        {/* Backlog #13. A new person should not have to hover every icon to
            learn the app's shape: this puts every name on screen at once, and
            the choice is remembered. Its own label names what it WILL do. */}
        <button type="button" className="dock__button dock__expand icon-button" data-dock="expand"
          aria-pressed={expanded} aria-label="Expand navigation"
          title={expanded ? 'Collapse navigation to icons' : 'Expand navigation to show names'}
          {...shellControl(onToggleExpanded)}>
          {expanded ? <ChevronLeft /> : <ChevronRight />}
          <span className="dock__label" aria-hidden="true">{expanded ? 'Collapse navigation' : 'Expand navigation'}</span>
        </button>
      </div>
      {/* M172. The `N live / N quiet` capsules left the dock (the metrics rule): the count is the rail's `Agents · N` heading. */}
    </nav>
  )
}

export const Dock = memo(DockImpl)
