import type { JSX } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isChatPanel, isTerminalPanel } from '@renderer/panels/panels'
import type { PaletteActions, PresetRow } from '@renderer/palette/commands'
import { backendAvailable } from '@renderer/palette/commands'
import type { Registry } from '@renderer/session/session-registry'
import { SessionsHost } from '@renderer/sessions/SessionsHost'
import { ReviewHost } from '@renderer/review/ReviewHost'
import type { ReviewTaskContext } from '@renderer/review/ReviewNode'
import { insertIntoComposer, type useApprovals } from '@renderer/chat/chat-store'
import { OrchestrationView, type OrchestrationViewProps } from '../orchestration/OrchestrationView'
import { arrangementTemplate } from '../orchestration/orch-arrangement'
import { FocusTask } from '../focus/FocusTask'
import type { FocusSide } from '../focus/focus-model'
import { TeamView } from '../team/TeamView'
import { LearnPage } from '../learn/LearnPage'
import { useLessonHarvest } from '../learn/useLessonHarvest'
import { panelPath } from '@renderer/palette/panel-name'
import type { useAccounts } from '../account/useAccounts'
import type { CenterView, ShellChrome } from '../shell/useShellChrome'
import type { useTaskQueue } from '@renderer/shell/useTaskQueue'
import { railLabel } from '../shell/rail-rows'
import { requestArrival } from '../world/world-select'
import { setWorldOn } from '../world/world-toggle'
import type { TaskMembership } from './task-members'
import { WORK_ITEM_STATES, type PersistedWorkItem } from '@shared/work-items'
import { BACKENDS, BACKEND_IDS } from '@shared/agent-backends'
import { sendRefusalSentence, type AgentBackend } from '@shared/agent-session'
import { planSummary, type planView } from '@shared/task-plan'
import { portableCwd } from '@shared/recipe-portability'
import type { PersistedTeammate } from '@shared/teammates'
import type { SessionBackendInfo, SpawnResult } from '@shared/ipc-contract'

/**
 * M498 (E4, the Canvas.tsx split). The pages that cover the canvas's grid
 * cell — Orchestrate, Team, a task's focus view, Sessions and Review — moved
 * out of Canvas's JSX VERBATIM. Canvas still owns every verb and every piece
 * of state these pages read; this component only lays them out, so each prop
 * below is a value Canvas already had in scope under the same name.
 *
 * The world's lens and stage stay in Canvas: they are not pages, they sit
 * over the canvas page itself (verify:world reads them there).
 */
export interface CenterPagesProps {
  centerView: CenterView
  chooseNavigator: ShellChrome['chooseNavigator']
  setCenterView: (view: CenterView) => void
  leaveForCanvas: () => void
  panels: Panel[]
  panelsRef: { readonly current: Panel[] }
  displayPanelsRef: { readonly current: Panel[] }
  workItems: PersistedWorkItem[]
  workItemsRef: { readonly current: PersistedWorkItem[] }
  taskMemberships: (shown: readonly Panel[], items: readonly PersistedWorkItem[]) => TaskMembership[]
  orchTemplates: OrchestrationViewProps['templates']
  goToPanelOrRequest: (panelId: string) => void
  goToWorkItem: (itemId: string) => void
  frameTaskOf: (panelId: string) => void
  openFileAtCentre: (path: string) => void
  openReview: (subjectId: string) => void
  markDone: NonNullable<OrchestrationViewProps['onMarkDone']>
  paletteActions: PaletteActions
  paletteActionsRef: { readonly current: PaletteActions | null }
  orchestrate: OrchestrationViewProps['orchestrate']
  setOrchestrate: NonNullable<OrchestrationViewProps['onOrchestrate']>
  patchWorkItem: NonNullable<OrchestrationViewProps['onPatchWorkItem']>
  taskHandoffOf: NonNullable<OrchestrationViewProps['taskHandoffOf']>
  refreshTaskHandoffs: NonNullable<OrchestrationViewProps['onRefreshTaskHandoffs']>
  automationResult: OrchestrationViewProps['automationResults']
  presetRows: PresetRow[]
  beginNewChat: (opts?: { cwd?: string; title?: string; message?: string; backend?: AgentBackend; teammateId?: string }) => Promise<SpawnResult>
  workspaceRows: readonly { name: string; active: boolean }[]
  selectedId: string | null
  setOrchSelectedId: NonNullable<OrchestrationViewProps['onSelectionChange']>
  taskQueue: ReturnType<typeof useTaskQueue>
  openFocusTask: (itemId: string, side?: FocusSide) => void
  closeFocusTask: () => void
  planViewsFor: (itemId: string) => ReturnType<typeof planView> | undefined
  accounts: ReturnType<typeof useAccounts>
  focusTask: { itemId: string; from: 'canvas' | 'orchestration'; side?: FocusSide; at: number } | null
  setFocusTask: (next: null) => void
  taskContextFor: (itemId: string | undefined) => ReviewTaskContext | undefined
  teammates: PersistedTeammate[] | null
  moveSessionsToTask: (ids: readonly string[], taskId: string) => void
  pendingApprovals: ReturnType<typeof useApprovals>
  backendInfo: SessionBackendInfo | null
  registry: Registry
}

export function CenterPages({
  centerView, chooseNavigator, setCenterView, leaveForCanvas,
  panels, panelsRef, displayPanelsRef, workItems, workItemsRef, taskMemberships, orchTemplates,
  goToPanelOrRequest, goToWorkItem, frameTaskOf, openFileAtCentre, openReview, markDone,
  paletteActions, paletteActionsRef, orchestrate, setOrchestrate, patchWorkItem,
  taskHandoffOf, refreshTaskHandoffs, automationResult, presetRows, beginNewChat, workspaceRows,
  selectedId, setOrchSelectedId, taskQueue, openFocusTask, closeFocusTask, planViewsFor,
  accounts, focusTask, setFocusTask, taskContextFor, teammates, moveSessionsToTask,
  pendingApprovals, backendInfo, registry
}: CenterPagesProps): JSX.Element {
  // M570 (lane O). Mounted with the pages, which are always mounted, so a sent
  // comment is offered as a lesson whether or not the Lessons page is open.
  useLessonHarvest(workItems, (id) => { const p = panelsRef.current.find((x) => x.rect.id === id); return p === undefined ? undefined : panelPath(p) })
  return (
    <>
      {centerView === 'orchestration' && (
        <div className="shell__orch shell__orch--on" data-center-view="orchestration" role="presentation">
          <OrchestrationView
            panels={panels}
            workItems={workItems}
            templates={orchTemplates}
            taskMemberIds={(() => {
              const focused = workItems.find((w) => w.state === WORK_ITEM_STATES[1]) ?? workItems.find((w) => w.state === WORK_ITEM_STATES[2])
              if (focused === undefined) return []
              return taskMemberships(panels, [focused])[0]?.members.map((m) => m.panelId) ?? []
            })()}
            taskMembersOf={(itemId) => {
              const item = workItems.find((w) => w.id === itemId)
              return item === undefined ? [] : taskMemberships(panels, [item])[0]?.members.map((m) => m.panelId) ?? []
            }}
            onJumpPanel={(id) => {
              leaveForCanvas()
              goToPanelOrRequest(id)
            }}
            onJumpWorkItem={(id) => {
              leaveForCanvas()
              goToWorkItem(id)
            }}
            onInterrupt={(id) => { void window.canvas.agentSession.interrupt(id) }}
            onMarkDone={markDone}
            onFocusRelated={(id) => {
              leaveForCanvas()
              frameTaskOf(id)
            }}
            onOpenFiles={() => {
              leaveForCanvas()
              chooseNavigator('files')
            }}
            /*
             * M300. An artifact opens through the canvas's OWN file verb —
             * the same `openFilePanel` the palette row, the drop and the M13
             * link all reach — so Orchestrate owns no second file reader and
             * inherits the watch ownership that one already has. It changes
             * page, which is why the row labels itself "Open on canvas".
             */
            onOpenPath={(path) => {
              leaveForCanvas()
              openFileAtCentre(path)
            }}
            onShowCanvas={() => setCenterView('canvas')}
            // M432. "View in World" on a focused island's plate: back to the canvas page, then
            // the room on the next frame (the page change has uncovered the host the room's
            // move starts from); the room frames the first member standing in it when it settles.
            onViewInWorld={(ids) => {
              requestArrival(ids, Date.now())
              leaveForCanvas()
              requestAnimationFrame(() => setWorldOn(true))
            }}
            // M284. The Dock's, the palette's and the inspector's executor — one permission path.
            onAnswer={paletteActions.answerApproval}
            onReviewOnCanvas={(id) => {
              leaveForCanvas()
              openReview(id)
            }}
            // M287. The workspace's Orchestrate record, the board's one patch
            // door, and the canvas's own readiness judgement — one author each.
            orchestrate={orchestrate}
            onOrchestrate={setOrchestrate}
            onPatchWorkItem={patchWorkItem}
            taskHandoffOf={taskHandoffOf}
            onRefreshTaskHandoffs={refreshTaskHandoffs}
            // M289. What each handoff edge RECORDED, for the read-only lens.
            automationResults={automationResult}
            // M290. Retry's exit: the chat on the canvas with the prompt in its
            // composer, unsent — the composer's own send is the only send.
            onRetryOnCanvas={(id, text) => {
              leaveForCanvas()
              paletteActions.goToPanel(id)
              insertIntoComposer(id, text)
            }}
            // M319. The cross-backend hand-off's exit: a NEW chat on the chosen
            // backend, in the source chat's folder and as its teammate, with the
            // reviewed text inserted — never sent — in its composer.
            backendsAvailable={Object.fromEntries(BACKEND_IDS.map((b) => [b, backendAvailable(presetRows, b)]))}
            onContinueOnBackend={(id, backend, text) => {
              const source = panelsRef.current.find((p) => p.rect.id === id)
              if (source === undefined || !isChatPanel(source)) return
              leaveForCanvas()
              void beginNewChat({
                cwd: source.chat.cwd, backend, message: text,
                title: `${source.title ?? id} · on ${BACKENDS[backend].label}`,
                ...(source.chat.teammateId === undefined ? {} : { teammateId: source.chat.teammateId })
              })
            }}
            // M299. The title row's scope, and the follow-up composer's one send door:
            // the same agentSession.send a chat's composer uses, its answer read by the
            // one sentence-maker, so a refusal reads the same on both pages.
            workspaceName={workspaceRows.find((w) => w.active)?.name}
            // Navigation hierarchy: the canvas's selection goes in, Orchestrate's comes out.
            initialSelectedId={selectedId}
            onSelectionChange={setOrchSelectedId}
            // M325. The task list: the queue's groups, and a task opens in its workspace.
            taskQueue={taskQueue}
            onOpenTask={openFocusTask}
            // M327. A task's plan progress on its row, read the way its plan side reads it.
            planOf={(itemId) => {
              const item = workItems.find((w) => w.id === itemId)
              const views = planViewsFor(itemId)
              return item?.plan === undefined || views === undefined ? undefined : planSummary(item.plan, views)
            }}
            onStartWork={(id) => { leaveForCanvas(); paletteActions.beginStartWork({ itemId: id }) }}
            onSend={async (id, text) => sendRefusalSentence(await window.canvas.agentSession.send(id, text, []))}
            /*
             * M302. SAVE AN ARRANGEMENT. The shape is built here, where the
             * panels and their links live, and saved through the EXISTING
             * template door — so a saved arrangement is an ordinary template
             * everywhere else in the app, with no second store and no schema
             * of its own. Refusals are sentences, never silence.
             */
            onSaveArrangement={async (islandId) => {
              const item = workItems.find((w) => w.id === islandId)
              const shown = displayPanelsRef.current
              const memberIds = item === undefined
                ? shown.filter((p) => isChatPanel(p)).map((p) => p.rect.id)
                : taskMemberships(shown, [item])[0]?.members.map((m) => m.panelId) ?? []
              const members = memberIds.flatMap((id) => {
                const p = shown.find((x) => x.rect.id === id)
                if (p === undefined || !isChatPanel(p)) return []
                return [{ panelId: id, title: railLabel(p, undefined), cwd: p.chat.cwd, rect: p.rect }]
              })
              if (members.length === 0) return 'this island has no conversation to save — an arrangement is its agents and the handoffs between them'
              // Offsets from the FIRST member, so the saved shape is the shape
              // on screen and not a set of absolute coordinates that would put
              // the next instantiation wherever this one happened to sit.
              const origin = members[0]!.rect
              const laneChat = item?.panelId === undefined ? undefined : shown.find((x) => x.rect.id === item.panelId)
              const arrangementRoots = [laneChat !== undefined && isChatPanel(laneChat) ? laneChat.chat.cwd : undefined, item?.recipeUsed?.repository]
                .filter((x): x is string => x !== undefined && x !== '')
              const edges = members.flatMap((m) => {
                const p = shown.find((x) => x.rect.id === m.panelId)
                return (p?.links ?? []).flatMap((l) => (l.automation?.kind === 'handoff' && l.automation.enabled
                  ? [{ from: m.panelId, to: l.to, trigger: l.automation.trigger }]
                  : []))
              })
              const template = arrangementTemplate(item?.title ?? 'Arrangement', {
                goal: item?.title ?? 'Arrangement',
                ...(item?.brief === undefined ? {} : { brief: item.brief }),
                ...(item?.criteria === undefined ? {} : { criteria: item.criteria }),
                // M321. A member working in the task's lane or repository is saved
                // as `{{repository}}` — a template HOLE the spawn sheet asks for —
                // so the arrangement starts in whichever repository it is taken to,
                // not in this machine's lane (which may not even exist then).
                members: members.map((m) => ({ panelId: m.panelId, title: m.title, cwd: portableCwd(m.cwd, arrangementRoots), dx: m.rect.x - origin.x, dy: m.rect.y - origin.y })),
                edges
              })
              const saved = await window.canvas.template.save(template)
              if (saved.kind === 'stale') return 'another editor saved this template first — open it and try again'
              paletteActionsRef.current?.say(`Saved “${template.name}” as an arrangement — starting it opens its conversations and sends nothing`)
              return null
            }}
          />
        </div>
      )}
      {/* The Team view: the same overlay cell, over the same mounted canvas.
          It reads nothing from the canvas — its tiles are people. */}
      {centerView === 'learn' && (
        <div className="shell__orch shell__orch--on" data-center-view="learn" role="presentation">
          <LearnPage panels={panels} />
        </div>
      )}
      {centerView === 'team' && (
        <div className="shell__orch shell__orch--on" data-center-view="team" role="presentation">
          <TeamView accounts={accounts} />
        </div>
      )}
      {/* M324. A task's focus view: the same overlay cell as Orchestrate, over
          the same mounted canvas. A task that no longer exists (deleted,
          another workspace) falls back to the canvas by the effect below. */}
      {centerView === 'focus' && focusTask !== null && (() => {
        const item = workItems.find((w) => w.id === focusTask.itemId)
        if (item === undefined) return null
        const members = taskMemberships(panels, [item])[0]?.members.map((m) => m.panelId) ?? []
        const group = taskQueue.groups.find((g) => g.itemId === item.id)
        const handoff = taskHandoffOf(item.id)
        const ctx = taskContextFor(item.id)
        return (
          <div className="shell__orch shell__orch--on" data-center-view="focus" role="presentation">
            <FocusTask
              // One instance per task: a switch is a new page, so nothing held
              // mid-gesture (an armed Accept, a picked diff line) crosses tasks.
              key={item.id}
              item={item}
              panels={panels}
              workItems={workItems}
              memberIds={members}
              {...(group === undefined ? {} : { group })}
              {...(taskQueue.history[item.id] === undefined ? {} : { history: taskQueue.history[item.id] })}
              {...(handoff === undefined ? {} : { handoff })}
              {...(ctx === undefined ? {} : { taskContext: ctx })}
              backendAvailable={(b) => backendAvailable(presetRows, b)}
              teammateName={(id) => (id === undefined ? undefined : (teammates ?? []).find((t) => t.id === id)?.name ?? id)}
              taskHandoffOf={taskHandoffOf}
              onRefreshTaskHandoffs={refreshTaskHandoffs}
              onPatchWorkItem={patchWorkItem}
              onBack={closeFocusTask}
              onShowOnCanvas={(id) => {
                setFocusTask(null)
                leaveForCanvas()
                const it = workItemsRef.current.find((w) => w.id === id)
                if (it?.panelId !== undefined && panelsRef.current.some((p) => p.rect.id === it.panelId)) frameTaskOf(it.panelId)
                else goToWorkItem(id)
              }}
              onJump={(id) => { setFocusTask(null); leaveForCanvas(); paletteActions.goToPanel(id) }}
              onOpenPath={(path) => { setFocusTask(null); leaveForCanvas(); openFileAtCentre(path) }}
              onStartWork={(id) => { setFocusTask(null); leaveForCanvas(); paletteActions.beginStartWork({ itemId: id }) }}
              {...(focusTask.side === undefined ? {} : { initialSide: focusTask.side })}
              openedAt={focusTask.at}
              // M326. Another task, in the same page; Back still returns where the first was opened from.
              // A task that needs the person opens on its request's evidence —
              // a failed check at its output, changes at the diff; a permission
              // or question is already in the conversation the page claims.
              onSwitchTask={(id) => {
                const ev = taskQueue.groups.find((g) => g.itemId === id)?.next.evidence.kind
                openFocusTask(id, ev === 'output' ? 'checks' : ev === 'review' ? 'changes' : undefined)
              }}
              needsYou={new Set(taskQueue.groups.filter((g) => g.itemId !== null && g.severity !== 'review').map((g) => g.itemId as string))}
              // M327. The plan's check step reads the task's witnessed runs; a
              // step's new agent is an ordinary chat in the step's directory, on
              // the task's backend, its brief INSERTED (M80's rule) by the page.
              checkRuns={taskQueue.runs[item.id] ?? []}
              onSpawnAgent={async (opts) => {
                // No message here: the focus view claims the new conversation
                // first, then hands it the brief — the canvas's panel must not take it.
                const r = await beginNewChat({
                  title: opts.title,
                  ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
                  ...(item.backend === undefined ? {} : { backend: item.backend }),
                  ...(item.teammateId === undefined ? {} : { teammateId: item.teammateId })
                })
                return r.kind === 'spawned' && r.id !== undefined ? { id: r.id } : { reason: r.kind === 'refused' ? r.reason : 'no conversation was opened' }
              }}
              onInterrupt={(id) => { void window.canvas.agentSession.interrupt(id) }}
            />
          </div>
        )
      })()}
      {/* R-012. Sessions and Review sit in the canvas cell, the same way
          Orchestrate does. `.shell__page` is absolutely positioned against
          `.shell`, so the hosts are direct children of it. TopBar used to
          portal them; that stand-in is gone. */}
      {(centerView === 'sessions' || centerView === 'review') && (
        <div className="shell__page" data-center-view={centerView}>
          {centerView === 'sessions'
            ? <SessionsHost
                onShowOrchestrate={() => setCenterView('orchestration')}
                confirmEnd={(ask) => window.canvas.dialog.confirm(ask)}
                onEnd={(ids) => { for (const id of ids) paletteActions.closePanel(id) }}
                onPause={(ids) => { for (const id of ids) void window.canvas.agentSession.interrupt(id) }}
                onRestart={(ids) => { for (const id of ids) paletteActions.restartPanel(id) }}
                onMove={moveSessionsToTask}
                onNewSession={() => paletteActions.beginSpawnSheet()}
                onShowOnCanvas={(id) => { setCenterView('canvas'); paletteActions.goToPanel(id) }}
                onSend={(id, text) => {
                  const panel = panelsRef.current.find((candidate) => candidate.rect.id === id)
                  // paste(), never pty.write. A chat has no terminal handle, so the
                  // callback the host now always receives still has to send it.
                  if (panel !== undefined && isTerminalPanel(panel)) {
                    registry.get(id)?.handle.paste(text)
                    return
                  }
                  void window.canvas.agentSession.send(id, text, [])
                }}
                onDetach={(id) => registry.detachSlot(id)}
                onAllow={(panelId) => {
                  const approval = pendingApprovals.find((row) => row.id === panelId)
                  if (approval !== undefined) paletteActions.answerApproval(approval.id, approval.requestId, true)
                }}
                onDeny={(panelId) => {
                  const approval = pendingApprovals.find((row) => row.id === panelId)
                  if (approval !== undefined) paletteActions.answerApproval(approval.id, approval.requestId, false)
                }}
                onDiff={(panelId) => paletteActions.openReview(panelId)}
                live={{
                  dormant: (id) => registry.get(id)?.dormant === true,
                  // lastFocusedAt is the last click, not a start. The Run column stays empty.
                  startedAt: () => null,
                  survives: (id) => {
                    const session = registry.get(id)
                    if (session === undefined || session.status.kind !== 'running') return null
                    return backendInfo?.kind === 'tmux' ? true : null
                  },
                  // The session stores no diff stat. Asking git once per row would invent one.
                  changes: () => null
                }}
              />
            : <ReviewHost />}
        </div>
      )}
    </>
  )
}
