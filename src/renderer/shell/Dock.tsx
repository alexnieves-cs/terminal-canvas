import { memo, useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ElsewhereRow, RailAttention } from './rail-sections'
import type { CenterView, NavigatorPane } from './useShellChrome'
import { shellControl } from './shell-control'
import { agentWord } from '@renderer/panels/panel-state'
import { Bell, ChevronLeft, ChevronRight, Folder, Gear, Grid, KindNote, KindToolbox, KindWork, Link, People, ProductMark } from '@renderer/icons'
import { EmptyState } from './EmptyState'
import { needsYouCount } from '@shared/attention-words'
import { useAttentionOsSettings } from './useAttentionOsSettings'
import { ApprovalAcks, ApprovalDetail } from './ApprovalDetail'
import { useApprovalOutcomes } from './approval-outcome'
import { SNOOZE_CHOICES, waitedWords, type Inbox, type InboxItem } from './decision-inbox'
import { snoozeDecision, wakeDecision } from './useDecisionInbox'
import { outward } from '@shared/outward'
import { allowMore } from '@shared/agent-session'
import { PLAN_TOOL } from '@shared/transcript'
import { stepCursor, traversalOrder, type QueueDecision, type QueueEvidence, type TaskGroup, type TaskQueue } from './task-queue'
import { dismissLost, setQueueCursor, useQueueCursor } from './useTaskQueue'
import { CheckRunOutput } from '@renderer/checks/CheckRunOutput'
import { teamAskWords } from '@shared/team-asks'
import { answerTeamAsk, useTeamAsks } from './useTeamAsks'

export interface DockProps {
  /** Which pane the navigator shows, when it shows. */
  navigator: NavigatorPane
  /** The navigator is on screen; a dock icon is pressed only then. */
  navVisible: boolean
  onChoose: (pane: NavigatorPane) => void
  /** M268. Which center page is showing; Panels is pressed only on the canvas. */
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
  /** M357. A held agent's "Allow more": the `cap-agent` verb as a person, with `allowMore`'s value. */
  onAllowMore?: (id: string, value: string) => void
  /** M357. A held agent's "Stop": its process ends; the conversation and main's hold stay. */
  onStopAgent?: (id: string) => void
  /** M378. A team ask's answer that main refused, by its reason (the canvas's toast). */
  onTeamAskRefused?: (reason: string) => void
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
  /**
   * M318. The same decisions grouped by TASK, with each task's blocker, next
   * step, what happens after, and the tasks that wait on it — plus failed
   * checks, unreviewed changes and decisions a restart lost. Optional: without
   * it the popover is M308's flat inbox exactly.
   */
  queue?: TaskQueue
  /** M318. Open a decision's evidence — the panel, or the task's review. A check's output opens in place. */
  onEvidence?: (e: QueueEvidence) => void
  /** M324. Open a task's focus view from its group — the decision and its evidence in one place. */
  onFocusTask?: (itemId: string) => void
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
 * M268. Orchestrate is a CENTER PAGE, not a navigator pane. M404 (C2) took
 * its dock button out: the top bar's center segment is its one chrome door
 * (and ⌘K's "Open Orchestrate"). `centerView` is still read here so Panels
 * is pressed only while the canvas shows.
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
/**
 * M318. A queue with nothing to group — only loose panels' permissions and
 * questions — renders as M308's flat inbox, headers and all left out, so the
 * surface a single-agent canvas knows does not change.
 */
function flatQueue(q: TaskQueue): boolean {
  return q.groups.every((g) => g.itemId === null && g.decisions.every((d) => d.inbox !== undefined))
}

function DockImpl({
  navigator, navVisible, onChoose, centerView, onSetCenterView,
  attention, elsewhere, onJumpElsewhere, attentionOpen, onToggleAttention, onGoToPanel, onAnswer, onAllowMore, onStopAgent, onTeamAskRefused, attentionFocus = null, taskTitleOf, inbox, queue, onEvidence, onFocusTask, onSettings,
  expanded, onToggleExpanded
}: DockProps): JSX.Element {
  // M318. KEYBOARD TRAVERSAL — decision → evidence → back. The cursor is the
  // decision the person is on; it survives the popover closing and the jump
  // to evidence (useTaskQueue's module state), so ⌥⌘J — or the "Back to
  // decisions" chip — reopens on it. The popover takes focus only when it was
  // opened FROM the keyboard; a mouse open leaves focus where it was (every
  // shell control's rule), so a terminal keeps its keys.
  const cursor = useQueueCursor()
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<Element | null>(null)
  const [focusWanted, setFocusWanted] = useState(false)
  const [returnTo, setReturnTo] = useState<string | null>(null)
  const [openOutput, setOpenOutput] = useState<string | null>(null)
  // A flat queue walks the rows as DRAWN — the inbox's own rank — never the task builder's kind order.
  const order = queue === undefined ? [] : flatQueue(queue) ? (inbox?.items ?? []).map((i) => i.key) : traversalOrder(queue)
  const orderRef = useRef(order)
  orderRef.current = order
  const openRef = useRef({ attentionOpen, onToggleAttention })
  openRef.current = { attentionOpen, onToggleAttention }
  useEffect(() => {
    if (queue === undefined) return
    // ⌥⌘J: to the decisions (and back to them from the evidence). `code`, not
    // `key`: with Option held, macOS reports J as '∆'.
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey && e.altKey && !e.ctrlKey && e.code === 'KeyJ')) return
      e.preventDefault()
      e.stopPropagation()
      restoreFocusRef.current = document.activeElement
      if (!openRef.current.attentionOpen) openRef.current.onToggleAttention()
      setFocusWanted(true)
      setReturnTo(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [queue === undefined]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!attentionOpen || !focusWanted) return
    setFocusWanted(false)
    popoverRef.current?.focus({ preventScroll: true })
    if (cursor === null || !orderRef.current.includes(cursor)) setQueueCursor(orderRef.current[0] ?? null)
  }, [attentionOpen, focusWanted]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!attentionOpen) setOpenOutput(null) }, [attentionOpen])
  // The cursor row stays in view as it moves.
  useEffect(() => {
    if (!attentionOpen || cursor === null) return
    popoverRef.current?.querySelector(`[data-queue-key="${CSS.escape(cursor)}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [attentionOpen, cursor])
  const openEvidence = (d: QueueDecision): void => {
    setQueueCursor(d.key)
    if (d.evidence.kind === 'output') { setOpenOutput(openOutput === d.key ? null : d.key); return }
    // A permission is answered HERE (#16): its evidence is the request itself,
    // opened in place — closing the popover to frame the agent took the
    // person away from the one surface that resolves it.
    if (d.evidence.kind === 'decision' && d.evidence.requestId !== undefined) { setOpenRequest(d.evidence.requestId); return }
    if (onEvidence === undefined) return
    setReturnTo(d.key)
    if (attentionOpen) onToggleAttention()
    onEvidence(d.evidence)
  }
  const backToDecisions = (): void => {
    restoreFocusRef.current = document.activeElement
    setReturnTo(null)
    if (!attentionOpen) onToggleAttention()
    setFocusWanted(true)
  }
  const onPopoverKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (queue === undefined) return
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, select, [contenteditable="true"]') !== null) return
    const all = queue.groups.flatMap((g) => g.decisions)
    const current = all.find((d) => d.key === cursor)
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); setQueueCursor(stepCursor(order, cursor, 1)) }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); setQueueCursor(stepCursor(order, cursor, -1)) }
    else if ((e.key === 'Enter' || e.key === 'ArrowRight') && current !== undefined && t === popoverRef.current) { e.preventDefault(); openEvidence(current) }
    else if (e.key === ' ' && current?.inbox?.approval !== undefined && t === popoverRef.current) { e.preventDefault(); setOpenRequest(current.inbox.approval.requestId) }
    else if (e.key === 'Escape') {
      e.preventDefault()
      onToggleAttention()
      const back = restoreFocusRef.current
      if (back instanceof HTMLElement) back.focus({ preventScroll: true })
    }
  }
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
      // M404 (C1). No ⌘\ here any more: that chord shows or hides WHICHEVER
      // pane the navigator holds, so claiming it for Panels was false whenever
      // Files or Notes was the pane. The chord lives on each pane's own Hide.
      { id: 'panels', label: 'Panels', icon: <Grid /> },
      // M404 (C2). Workspaces and Orchestrate are gone from the dock: the top
      // bar's workspace crumb (a switcher) and its center segment are their
      // doors, and "Manage workspaces…" / "Open Orchestrate" stay in ⌘K. A
      // second button for the same place is a second thing to learn.
      // M404 (C1). "Board", the pane's own title: "Tasks" is the noun of
      // New task and of Orchestrate's list, and this pane is the GitHub/Jira board.
      { id: 'board', label: 'Board', icon: <KindWork /> }
    ] },
    { label: 'Content', entries: [
      { id: 'files', label: 'Files', shortcut: '⌘B', icon: <Folder /> },
      { id: 'vault', label: 'Notes', icon: <KindNote /> },
      { id: 'skills', label: 'Skills', icon: <KindToolbox /> }
    ] },
    // M404 (C1). The group is "Setup" — what these are for, set up once — so
    // "Connections" names one place, the pane, not also the group around it.
    { label: 'Setup', entries: [
      { id: 'integrations', label: 'Connections', icon: <Link /> },
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
  // M378. The team's asks wait on this person too — on anyone who may edit
  // the canvas — so the badge counts them beside the panels waiting here.
  const team = useTeamAsks()
  const waiting = attention.filter((r) => !snoozedPanels.has(r.id)).length + team.length
  const now = Date.now()
  const canvasPressed = centerView === 'canvas' && navVisible && navigator === 'panels'
  const [historyOpen, setHistoryOpen] = useState<string | null>(null)
  const renderInboxRow = (item: InboxItem, queueKey?: string, affects?: string): JSX.Element => {
                  const row = { id: item.panelId, label: item.label }
                  const a = item.approval
                  const open = a !== undefined && shownRequest === a.requestId
                  const others = item.members.slice(1)
                  return (
                  <li key={item.key} className="rail-row rail-attention" data-rail-attention={row.id} data-inbox-kind={item.kind}
                    data-queue-key={queueKey} data-queue-cursor={queueKey !== undefined && queueKey === cursor ? '' : undefined}
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
                        {/* M355. A hold's context is whose cap it is and where it is raised. */}
                        {(item.kind === 'question' || item.kind === 'cap') && item.context !== undefined && (
                          <p className="inbox__context" data-inbox-context>{outward(item.context, `panel ${row.id}`).text}</p>
                        )}
                        <p className="inbox__meta">
                          {item.task !== undefined && <span data-inbox-task>{item.task}</span>}
                          {item.unblocks > 0 && <span className="inbox__unblocks" data-inbox-unblocks-word>unblocks {item.unblocks}</span>}
                          {others.length > 0 && <span data-inbox-grouped>same request from {item.members.map((m) => m.label).join(', ')}</span>}
                          {item.moreFromPanel > 0 && <span data-inbox-more>+{item.moreFromPanel} more waiting</span>}
                          <span data-inbox-waited>waiting {waitedWords(item.since, now)}</span>
                        </p>
                        {affects !== undefined && <p className="queue__row-affects" data-queue-row-affects>{affects}</p>}
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
                              {/* M359. A plan's summary is its first line, and its verb reads it. */}
                              <span className="rail-attention__argument">{a.toolName === PLAN_TOOL ? 'plan' : a.toolName} · {a.argument}</span>
                              <button type="button" className="rail-row__verb" data-rail-expand={a.requestId} aria-expanded={false}
                                title={a.toolName === PLAN_TOOL ? `Read ${row.label}'s plan before approving it` : `Show ${row.label}'s ${a.toolName} request in full`}
                                {...shellControl(() => setOpenRequest(a.requestId))}>{a.toolName === PLAN_TOOL ? 'Read plan' : 'Review'}</button>
                            </div>
                          )}
                        </div>
                    )}
                    {/* M357. A hold's two answers, HERE. Allow grants the same
                        allowance again through the cap-agent verb, as a person;
                        Stop ends the agent's process, and its conversation and
                        main's hold stay. Leaving it is an answer too: a held
                        agent spends nothing, and Snooze puts the row off. */}
                    {item.kind === 'cap' && item.hold !== undefined && (() => {
                      const more = allowMore(item.hold)
                      if ((onAllowMore === undefined || more === null) && onStopAgent === undefined) return null
                      return (
                        <div className="inbox__group-verbs inbox__hold-verbs" data-inbox-hold={row.id}>
                          {onAllowMore !== undefined && more !== null && (
                            <button type="button" className="approval__verb" data-inbox-allow-more={row.id}
                              title={`${more.words}: sets ${row.label}'s own cap (cap-agent ${more.value}), and what it kept waiting goes first`}
                              {...shellControl(() => onAllowMore(row.id, more.value))}>{more.words}</button>
                          )}
                          {onStopAgent !== undefined && (
                            <button type="button" className="approval__verb approval__verb--deny" data-inbox-stop={row.id}
                              title={`End ${row.label}'s process. The conversation and its hold stay, and it resumes once the cap is raised`}
                              {...shellControl(() => onStopAgent(row.id))}>Stop</button>
                          )}
                        </div>
                      )
                    })()}
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
  }
  // M318. One task: its header (why it waits, the next step, what happens
  // after, who waits on it), then each decision — the inbox's own row for a
  // permission or question, a plain row for a check, a review or a decision
  // a restart lost.
  const renderGroup = (g: TaskGroup): JSX.Element[] => {
    const head = (
      <li key={`task:${g.itemId ?? 'none'}`} className="queue__task" data-queue-task={g.itemId ?? 'none'} data-queue-severity={g.severity}>
        <div className="queue__task-head">
          <span className="queue__task-title">{g.title}</span>
          <span className="queue__task-count">{g.decisions.length === 1 ? '1 decision' : `${g.decisions.length} decisions`}</span>
        </div>
        <p className="queue__why" data-queue-why>{g.why}</p>
        <div className="queue__next">
          <button type="button" className="rail-row__verb queue__next-verb" data-queue-next={g.next.evidence.kind}
            {...shellControl(() => { const d = g.decisions.find((x) => x.evidence === g.next.evidence) ?? g.decisions[0]; if (d !== undefined) openEvidence(d) })}>{g.next.label}</button>
          <span className="queue__after" data-queue-after>{g.after}</span>
          {g.itemId !== null && onFocusTask !== undefined && (
            <button type="button" className="rail-row__verb queue__focus" data-queue-focus={g.itemId} title="Open this task beside its conversation — answer, read the evidence and send a correction in one place"
              {...shellControl(() => { if (g.itemId !== null) onFocusTask?.(g.itemId) })}>Focus task</button>
          )}
        </div>
        {g.affects.length > 0 && (
          <p className="queue__affects" data-queue-affects={g.affects.length}>Waiting on this task: {g.affects.map((a) => a.title).join(', ')}</p>
        )}
      </li>
    )
    // What this task already had answered — kept in the task, folded.
    const hkey = g.itemId ?? 'none'
    const history = g.history.length === 0 ? [] : [(
      <li key={`history:${hkey}`} className="queue__history" data-queue-history={hkey}>
        <button type="button" className="rail-row__verb queue__history-toggle" aria-expanded={historyOpen === hkey} data-queue-history-toggle={hkey}
          {...shellControl(() => setHistoryOpen(historyOpen === hkey ? null : hkey))}>
          Answered in this task · {g.history.length}
        </button>
        {historyOpen === hkey && (
          <ol className="queue__history-list">
            {g.history.map((h) => (
              <li key={h.key} className="queue__history-row" data-queue-history-kind={h.kind} data-queue-history-outcome={h.outcome}>
                <span className="queue__history-text">{h.text}</span>
                <span className="queue__history-at">{((w) => (w === 'just now' ? w : `${w} ago`))(waitedWords(h.at, now))}</span>
              </li>
            ))}
          </ol>
        )}
      </li>
    )]
    return [head, ...g.decisions.map((d) => d.inbox !== undefined ? renderInboxRow(d.inbox, d.key, d.affects) : (
      <li key={d.key} className="rail-row rail-attention queue__row" data-queue-kind={d.kind} data-queue-key={d.key} data-queue-cursor={d.key === cursor ? '' : undefined}>
        <div className="queue__row-main">
          <span className="rail-row__dot status-dot" data-tone={d.kind === 'review' ? 'idle' : 'needs-you'} aria-hidden="true" />
          <span className="queue__row-text">{d.kind === 'check' ? 'Check failed — ' : d.kind === 'review' ? 'Review — ' : d.kind === 'lost' ? 'Before the restart — ' : ''}{d.text}</span>
        </div>
        <p className="queue__row-affects" data-queue-row-affects>{d.affects}</p>
        <div className="queue__row-verbs">
          <button type="button" className="rail-row__verb" data-queue-evidence={d.evidence.kind}
            {...shellControl(() => openEvidence(d))}>{d.evidence.kind === 'output' ? (openOutput === d.key ? 'Hide output' : 'Output') : d.evidence.kind === 'review' ? 'Review' : 'Go to'}</button>
          {d.kind === 'lost' && (
            <button type="button" className="rail-row__verb" data-queue-dismiss={d.key} title="Put this away — nothing was allowed or answered on your behalf"
              {...shellControl(() => dismissLost(d.key))}>Dismiss</button>
          )}
        </div>
        {d.evidence.kind === 'output' && openOutput === d.key && (
          <div className="queue__output"><CheckRunOutput outputId={d.evidence.outputId} subject={`panel ${d.evidence.panelId}`} fallback="This run has no output record." /></div>
        )}
      </li>
    )), ...history]
  }
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
        {/* M318. Back from the evidence to the decision you left. */}
        {!attentionOpen && returnTo !== null && queue !== undefined && order.includes(returnTo) && (
          <button type="button" className="dock__return" data-queue-return={returnTo} title="Back to the decision you were on (⌥⌘J)"
            {...shellControl(backToDecisions)}>← Decisions</button>
        )}
        {attentionOpen && (
          <div className="dock__popover" role="dialog" aria-label="Attention" ref={popoverRef} tabIndex={-1} onKeyDown={onPopoverKey}
            aria-keyshortcuts={queue === undefined ? undefined : 'Alt+Meta+J'}>
            <div className="shell__region-title">Needs you</div>
            {queue !== undefined && !flatQueue(queue) && <p className="queue__headline" data-queue-headline>{queue.headline}{order.length > 0 ? ' ↑↓ to move, ↩ opens the evidence, ⌥⌘J comes back.' : ''}</p>}
            {/* #14. What was just decided, above what is still waiting. */}
            <ApprovalAcks />
            <ul className="rail-list rail-list--attention" aria-label="Attention">
              {/* M318. No agent waiting is still said, even when a task below
                  has a failed check or a review — those are decisions, not agents. */}
              {attention.length === 0 ? (
                <>
                  <li className="rail-empty"><EmptyState id="attention" glyph={<Bell />} /></li>
                  {queue !== undefined && !flatQueue(queue) && queue.groups.map((g) => renderGroup(g))}
                </>
              ) : decisions.length === 0 && (queue === undefined || flatQueue(queue)) ? (
                <li className="rail-empty" data-inbox-all-snoozed="">Everything waiting is snoozed — it comes back on its own, or wake it below.</li>
              ) : (
                (queue === undefined || flatQueue(queue) ? decisions.map((item) => renderInboxRow(item, queue === undefined ? undefined : item.key, queue?.groups.flatMap((g) => g.decisions).find((d) => d.key === item.key)?.affects)) : queue.groups.map((g) => renderGroup(g)))
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
            {/* M378. A TEAMMATE's agent asking (M376): one line a person can read
                whole, whose agent it is, how far the answers have got, and
                the two answers — allow ONCE or deny. Never a standing grant:
                that is the agent's owner's alone. The row jumps to the
                agent's placeholder on this canvas. */}
            {team.length > 0 && (
              <>
                <div className="shell__region-title" data-team-asks-title="">Your team is asking · {team.length}</div>
                <ul className="rail-list rail-list--attention" aria-label="Your team is asking">
                  {team.map((row) => {
                    const w = teamAskWords(row)
                    const answer = (a: 'allow' | 'deny'): void => { void answerTeamAsk(row, a).then((reason) => { if (reason !== null) onTeamAskRefused?.(reason) }) }
                    return (
                      <li key={`${row.workspaceId}/${row.askId}`} className="rail-row rail-attention team-ask" data-team-ask={row.askId}>
                        <button type="button" className="rail-row__main" title={`Go to ${w.who}`} {...shellControl(() => onGoToPanel(row.panelId))}>
                          <span className="rail-row__dot status-dot" data-agent-state="wants-you" data-tone="needs-you" aria-hidden="true" />
                          <span className="rail-row__label">{w.who}</span>
                          <span className="rail-row__go">jump</span>
                        </button>
                        <div className="inbox__why">
                          <p className="team-ask__action" data-team-ask-action="">{w.action}</p>
                          <p className="inbox__meta">
                            <span data-team-ask-progress="">{w.progress}</span>
                            {w.scrubbed !== undefined && <span data-team-ask-scrubbed="">{w.scrubbed}</span>}
                            <span>waiting {waitedWords(row.at, now)}</span>
                          </p>
                        </div>
                        <div className="inbox__group-verbs team-ask__verbs">
                          <button type="button" className="approval__verb" data-team-ask-answer="allow"
                            title={`Allow this one ${row.tool} call for ${w.who} — it asks again next time`}
                            {...shellControl(() => answer('allow'))}>Allow once</button>
                          <button type="button" className="approval__verb approval__verb--deny" data-team-ask-answer="deny"
                            title="Deny it — one deny decides, whoever else allowed"
                            {...shellControl(() => answer('deny'))}>Deny</button>
                        </div>
                      </li>
                    )
                  })}
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
