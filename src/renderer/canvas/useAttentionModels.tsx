import { type Dispatch, type RefObject, type SetStateAction, useEffect, useMemo, useRef, type JSX } from 'react'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { AgentBackend } from '@shared/agent-session'
import type { AgentOptions } from '@shared/cost'
import { type CredentialMeta, SERVICES } from '@shared/credential-schema'
import type { Inbox } from '@renderer/shell/decision-inbox'
import type { PaletteActions } from '@renderer/palette/commands'
import { type Panel, isReviewPanel, isChatPanel, isWorkPanel } from '@renderer/panels/panels'
import type { PersistedRun } from '@shared/layout-schema'
import type { PersistedWorkItem } from '@shared/work-items'
import { type ReadyReview, arrivedReviews, readyReviews, reviewNotice } from '@renderer/shell/ready-review'
import type { SessionBackendInfo, SpawnResult } from '@shared/ipc-contract'
import { useAttentionOsSettings } from '@renderer/shell/useAttentionOsSettings'
import { useDecisionInbox } from '@renderer/shell/useDecisionInbox'
import { useTaskQueue } from '@renderer/shell/useTaskQueue'
import { useAwaySince } from '@renderer/shell/presence'
import { ReturnBriefingCard, useReturnBriefing } from '@renderer/shell/ReturnBriefing'
import type { ResumeSummary } from '@shared/resume-summary'
import { getChat } from '@renderer/chat/chat-store'
import { emptyTeammate, type PersistedTeammate } from '@shared/teammates'
import type { PersistedRoutine } from '@shared/routines'
import { planView } from '@shared/task-plan'
import { reopenTaskDetail, reopenTaskOutcome, type ReopenTask } from '@shared/persistence'
import type { BoardVerbs } from './useBoardVerbs'
import type { Point, WorldRect } from './viewport'
import type { TaskMembership } from './task-members'
import { useInspectorDetail } from './useInspectorDetail'
import { useActivityFeed } from './useActivityFeed'
import { panelLabel } from './canvas-constants'
import { interruptedRunAccount, type InterruptedRun } from './run-model'
import { planFactsOf } from '../focus/plan-facts'
import { ResumeBanner } from '../shell/ResumeBanner'
import { useReopenNotice } from '../shell/ReopenNotice'
import { useJobRecovery } from '../shell/JobRecoveryNotice'
import { useAttentionAnnouncer } from '../shell/useAttentionAnnouncer'
import { notifyRefused } from '../shell/toast'

import type { RailAttention } from '@renderer/shell/rail-sections'
import type { ReviewHandoff } from '@shared/review-readiness'
import type { RunsApi } from './useRuns'
import type { ShellChrome } from '@renderer/shell/useShellChrome'
import type { VaultModel } from './useVault'
import type { Registry } from '@renderer/session/session-registry'
import { APP_OPENED_AT } from './canvas-constants'
/**
 * M506 (E4, the Canvas.tsx split). What asks for the person's attention, and
 * the panes beside it: the Teammates, Toolbox and vault panes' props, the
 * inspector's summary and review model, the announcer, the decision inbox,
 * the return briefing, the task queue and its ready-to-review notice, the
 * reopen notice, job recovery and the resume banner and strip, and a task's
 * plan view. Lifted out of Canvas VERBATIM as one contiguous run and called
 * at exactly the position it occupied, just below useSkillsPane. The hooks it
 * calls keep their order, so Canvas's hook order is unchanged.
 */
export interface UseAttentionModelsDeps {
  registry: Registry
  approvalTaskOf: (panelId: string) => string | undefined
  backendInfo: SessionBackendInfo | null
  beginNewChat: (opts?: { cwd?: string; title?: string; agentOptions?: AgentOptions; appendSystemPrompt?: string; message?: string; backend?: AgentBackend; teammateId?: string; sandbox?: true; routine?: true; at?: Point; }) => Promise<SpawnResult>
  boardVerbsRef: RefObject<BoardVerbs>
  centreOn: (rect: WorldRect) => void
  chrome: ShellChrome
  chromeRef: RefObject<ShellChrome>
  credentialRows: CredentialMeta[]
  displayPanels: Panel[]
  dormantIds: ReadonlySet<string>
  frameItem: (itemId: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  handoffsVersion: object
  inboxRef: RefObject<Inbox | null>
  jumpToAttention: (panelId: string) => void
  liveSessionIds: Set<string>
  openVaultNote: (relative: string) => void
  palette: PaletteController
  paletteActions: PaletteActions
  paletteActionsRef: RefObject<PaletteActions | null>
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  railAttention: RailAttention[]
  readyReviewRef: RefObject<ReadyReview[]>
  reloadRoutines: () => void
  reloadTeammates: () => void
  restoredTerminals: { id: string; label: string; }[]
  resumeSummary: ResumeSummary | null
  routines: PersistedRoutine[] | null
  runs: PersistedRun[]
  runsApi: RunsApi
  runsCutOff: ReadonlySet<string>
  runsRef: RefObject<PersistedRun[]>
  selectAndRaise: (id: string, additive?: boolean) => void
  selectedId: string | null
  selectedIsSessionless: boolean
  selectedPanel: Panel | undefined
  selectedTeammateId: string | null
  setRelatedItemId: Dispatch<SetStateAction<string | null>>
  setResumeDismissed: Dispatch<SetStateAction<boolean>>
  setResumedNext: Dispatch<SetStateAction<{ itemId: string; text: string; action?: "review" | "answer" | "resume" | "start" | undefined; } | null>>
  setSelectedTeammateId: Dispatch<SetStateAction<string | null>>
  taskHandoffOf: (itemId: string) => ReviewHandoff | undefined
  taskMemberships: (shown: readonly Panel[], items: readonly PersistedWorkItem[]) => TaskMembership[]
  teammates: PersistedTeammate[] | null
  teammatesRef: RefObject<PersistedTeammate[]>
  vault: VaultModel
  vaultFilterRequest: { tag: string; nonce: number; } | null
  vaultSelectedPath: string | null
  waitingIds: string[]
  workItems: PersistedWorkItem[]
  workItemsRef: RefObject<PersistedWorkItem[]>
}

export function useAttentionModels(deps: UseAttentionModelsDeps) {
  const {
    approvalTaskOf, backendInfo, beginNewChat, boardVerbsRef, centreOn, chrome, chromeRef, credentialRows, displayPanels, dormantIds, frameItem, handoffsVersion, inboxRef, jumpToAttention, liveSessionIds, openVaultNote, palette, paletteActions, paletteActionsRef, panels, panelsRef, railAttention, readyReviewRef, reloadRoutines, reloadTeammates, restoredTerminals, resumeSummary, routines, runs, runsApi, runsCutOff, runsRef, selectAndRaise, selectedId, selectedIsSessionless, selectedPanel, selectedTeammateId, setRelatedItemId, setResumeDismissed, setResumedNext, setSelectedTeammateId, taskHandoffOf, taskMemberships, teammates, teammatesRef, vault, vaultFilterRequest, vaultSelectedPath, waitingIds, workItems, workItemsRef, registry
  } = deps
  const teammatesPaneProps = useMemo(() => ({
    onToggle: chrome.toggleNavigator,
    teammates: teammates ?? [],
    loaded: teammates !== null,
    selectedId: selectedTeammateId,
    onSelect: setSelectedTeammateId,
    onCreate: (name: string) => {
      const id = `tm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
      void window.canvas.teammate.save(emptyTeammate(id, name)).then(() => { reloadTeammates(); setSelectedTeammateId(id) })
    },
    onSave: (t: PersistedTeammate) => { void window.canvas.teammate.save(t).then(reloadTeammates) },
    onDelete: (id: string) => { void window.canvas.teammate.remove(id).then(() => { reloadTeammates(); setSelectedTeammateId(null) }) },
    // M197 (D05). Every door is a route into the ONE start action: the drop
    // still starts in one gesture when nothing is missing, and opens the
    // sheet on the missing input when something is.
    onDispatch: (itemId: string, teammateId: string) => paletteActionsRef.current?.beginStartWork({ itemId, teammateId }),
    onAddPlace: (id: string) => {
      void window.canvas.teammate.choosePlace().then((folder) => {
        if (folder === null) return
        const t = teammatesRef.current.find((x) => x.id === id)
        if (!t || t.places.includes(folder)) return
        // M403. main refuses home and `/` as a new place; said, never an
        // unhandled rejection the pane shows as nothing happening.
        void window.canvas.teammate.save({ ...t, places: [...t.places, folder] }).then(reloadTeammates, (e: unknown) => {
          notifyRefused('Place not added', String(e instanceof Error ? e.message : e).replace(/^.*?the teammate could not be kept — /, ''))
        })
      })
    },
    onChat: (id: string) => {
      const t = teammatesRef.current.find((x) => x.id === id)
      if (!t) return
      void beginNewChat({ cwd: t.places[0] ?? '', title: t.name, teammateId: id })
    },
    services: SERVICES.map((svc) => ({ id: svc.id, label: svc.label, connected: credentialRows.some((c) => c.service === svc.id) })),
    routines: routines ?? [],
    onSaveRoutine: async (r: PersistedRoutine) => { const a = await window.canvas.routine.save(r); reloadRoutines(); return a.kind === 'refused' ? a.reason : null },
    onDeleteRoutine: (id: string) => { void window.canvas.routine.remove(id).then(reloadRoutines) },
    onRunRoutine: (id: string) => { void window.canvas.routine.run(id) },
    onOpenLast: (panelId: string) => { selectAndRaise(panelId); const p = panelsRef.current.find((x) => x.rect.id === panelId); if (p) centreOn(p.rect) }
  }), [chrome.toggleNavigator, teammates, selectedTeammateId, reloadTeammates, beginNewChat, credentialRows, routines, reloadRoutines, selectAndRaise, centreOn])

  const vaultPaneProps = useMemo(() => ({
    onToggle: chrome.toggleNavigator,
    root: vault.root,
    notes: vault.notes,
    pending: vault.pending,
    ...(vault.reason === undefined ? {} : { reason: vault.reason }),
    skipped: vault.skipped,
    selectedPath: vaultSelectedPath,
    onOpenNote: openVaultNote,
    onChooseRoot: paletteActions.beginChooseVault,
    onRefresh: vault.refresh,
    // M150. The index's tags and the note's request, as data.
    tags: vault.index.tags,
    filterRequest: vaultFilterRequest
  }), [chrome.toggleNavigator, vault.root, vault.notes, vault.pending, vault.reason, vault.skipped, vaultSelectedPath, openVaultNote, paletteActions.beginChooseVault, vault.refresh, vault.index.tags, vaultFilterRequest])


  // The inspector's async detail sections, lifted into useInspectorDetail.ts.
  // Each is a three-state result — nothing to show / asked but unanswered / a
  // real answer — and must stay one; see the hook's doc comment.
  // M279. The activity feed's producer — always mounted, so the inspector's
  // Activity tab has rows before the orchestration page is ever opened.
  useActivityFeed({ panels })
  const {
    branchLine, repository,
    toolboxModel, reviewModel, inspectorSummary, hasSelection
  } = useInspectorDetail({
    registry, palette, panels, selectedId, selectedPanel,
    selectedIsSessionless, waitingIds,
    // M68. Read from the registry, whose version() this component already
    // re-renders on for status changes — so the flip is seen without a store.
    // M77. A chat's process is main's runtime, read from the chat store.
    selectedSpawned: selectedId !== null && (registry.get(selectedId)?.status.kind === 'running' || getChat(selectedId).snapshot?.pid !== undefined)
  })

  const attentionAnnouncement = useAttentionAnnouncer(railAttention)
  // M308. The Needs-you queue as decisions: ranked by what each unblocks,
  // duplicates grouped, snoozes applied. The ref is ⌘J's and the pill's —
  // their handlers are declared above this line and read it at press time.
  const inbox = useDecisionInbox({ rows: railAttention, panels: displayPanels, taskOf: approvalTaskOf })
  inboxRef.current = inbox

  // M309. The return briefing: every task that moved while the person was
  // away, from the durable record, measured from when they were last here.
  const awaySince = useAwaySince()
  const taskMembersOf = (itemId: string): string[] => {
    const item = workItems.find((w) => w.id === itemId)
    if (item === undefined) return []
    return taskMemberships(displayPanels, [item])[0]?.members.map((m) => m.panelId) ?? (item.panelId === undefined ? [] : [item.panelId])
  }
  const panelLabelOf = (panelId: string): string => { const p = displayPanels.find((q) => q.rect.id === panelId); return p === undefined ? 'a closed panel' : panelLabel(p) }
  const briefing = useReturnBriefing({
    since: awaySince,
    workItems,
    membersOf: taskMembersOf,
    handoffOf: taskHandoffOf,
    inbox,
    labelOf: panelLabelOf,
    cardOf: (itemId) => displayPanels.find((p) => isWorkPanel(p) && p.work.itemId === itemId)?.rect.id
  })
  // M318. The same decisions grouped by TASK — why each is stopped, its next
  // step, what waits on it — with failed checks, unreviewed changes and
  // decisions a restart lost. Timelines are read only while the popover shows.
  const taskQueue = useTaskQueue({
    inbox, workItems, panels: displayPanels, membersOf: taskMembersOf, handoffOf: taskHandoffOf, labelOf: panelLabelOf,
    // M325. Orchestrate's task list and the focus view read the check tallies too.
    active: chrome.attentionOpen || chrome.centerView !== 'canvas'
  })
  const readyToReview = useMemo(() => readyReviews(taskQueue.groups), [taskQueue.groups])
  readyReviewRef.current = readyToReview
  // A task that finishes with changes says so outside the window, once per
  // revision — the same `attention.notify` switch needs-you obeys, and only
  // while the window is not focused (in the window, the dock row and ⌘J are
  // already saying it). The first read seeds `seen` silently: a relaunch
  // does not re-announce work that was already waiting.
  const notifySetting = useAttentionOsSettings().notify
  const seenReviewsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const seen = seenReviewsRef.current
    seenReviewsRef.current = new Set(readyToReview.map((r) => r.key))
    if (seen === null || notifySetting !== true || document.hasFocus() || typeof Notification === 'undefined') return
    for (const r of arrivedReviews(readyToReview, seen)) {
      const words = reviewNotice(r)
      const n = new Notification(words.title, { body: words.body })
      n.onclick = () => { window.focus(); boardVerbsRef.current.review?.(r.itemId) }
    }
  }, [readyToReview, notifySetting])

  // Brief #20. What came back running, what came back stopped, and what was
  // lost while the app was closed — kept until each is dealt with.
  const presentIds = useMemo(() => new Set(displayPanels.map((p) => p.rect.id)), [displayPanels])
  // M401 (B7). The TASKS that came back — the same notice, one line per
  // outcome. Only tasks that existed before this launch (Resume's M315 rule),
  // and only with a panel to show: the conversation, or else the task's
  // review. Read from the work items and the handoff the cards already
  // project, so nothing new is persisted; it re-derives when the lanes are
  // read, which is after boot.
  const reopenTasks = useMemo<ReopenTask[]>(() => {
    const out: ReopenTask[] = []
    for (const item of workItems) {
      if (item.createdAt >= APP_OPENED_AT || item.panelId === undefined) continue
      const chat = displayPanels.find((p) => p.rect.id === item.panelId && isChatPanel(p))
      const review = displayPanels.find((p) => isReviewPanel(p) && p.subject.workItemId === item.id)
      const shown = chat ?? review
      if (shown === undefined) continue
      const h = taskHandoffOf(item.id)
      const outcome = reopenTaskOutcome(h?.state, item.merged !== undefined, chat !== undefined)
      if (outcome === null) continue
      const detail = reopenTaskDetail(outcome, { ...(item.merged === undefined ? {} : { merged: item.merged }), ...(h === undefined ? {} : { state: h.state, word: h.word }) })
      // The time the notice compares with the last exit (`reopenTaskNews`): a
      // finished task by its merge, anything else by its item's last change.
      const changedAt = outcome === 'finished' ? item.merged?.at : item.updatedAt
      out.push({ id: shown.rect.id, label: item.title, outcome, ...(detail === undefined ? {} : { detail }), ...(changedAt === undefined ? {} : { changedAt }) })
    }
    return out
  }, [workItems, displayPanels, taskHandoffOf, handoffsVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const reopen = useReopenNotice({
    restored: restoredTerminals,
    liveAtBoot: liveSessionIds,
    present: presentIds,
    dormant: dormantIds,
    backend: backendInfo?.kind ?? null,
    tasks: reopenTasks,
    openedAt: APP_OPENED_AT
  })

  // M316. What an interrupted job left — the pool's journal from main, and
  // the handoff runs this launch's seal cut off — with the recovery choices.
  const interruptedRuns = useMemo(() => runs
    .filter((r) => runsCutOff.has(r.id))
    .map((r) => interruptedRunAccount(r, (id) => { const p = displayPanels.find((q) => q.rect.id === id); return p === undefined ? 'a closed panel' : panelLabel(p) }))
    .filter((r): r is InterruptedRun => r !== null), [runs, runsCutOff, displayPanels])
  const jobRecovery = useJobRecovery({ runs: interruptedRuns, continueRun: (runId) => runsApi.continueRun(runId, runsRef.current) })

  // M303 (Quiet instrument). Resume work is an INBOX item: it rests at the
  // head of the navigator's Panels pane, and floats over the canvas only when
  // that pane is closed — a card over the canvas covered the panels it named.
  // M309. While there is a return to brief, the briefing takes the banner's
  // slot: the banner is one task's resume, the briefing every task's.
  // M315. The step a resume names, performed: review opens the lane's review
  // in view, answer goes to the waiting conversation. Resume and start keep
  // the frame Continue already did — the conversation is what they open.
  const runResumeAction = (itemId: string, action: ResumeSummary['action']): void => {
    if (action === 'review') {
      const r = boardVerbsRef.current.review?.(itemId)
      if (r !== undefined && r.kind === 'refused') paletteActionsRef.current?.say(r.reason)
    } else if (action === 'answer') {
      const panelId = workItemsRef.current.find((i) => i.id === itemId)?.panelId
      if (panelId !== undefined) jumpToAttention(panelId)
    }
  }
  const resumeOf = (shape: 'card' | 'strip'): JSX.Element | null => resumeSummary === null ? null : (
    <ResumeBanner
      summary={resumeSummary}
      shape={shape}
      onContinue={(itemId) => {
        setResumeDismissed(true)
        setRelatedItemId(itemId)
        // #10. Continuing collapses the summary into the task's normal status:
        // the lens bar it opens carries the next action until the lens closes.
        setResumedNext({ itemId, text: resumeSummary.blocker !== undefined ? `open blocker — ${resumeSummary.blocker}` : resumeSummary.nextAction, ...(resumeSummary.action === undefined ? {} : { action: resumeSummary.action }) })
        const r = frameItem(itemId)
        if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason)
        // M315. Continue DOES the step it names. It framed the task and left
        // "Review" as a label, so the one press a returning person makes
        // brought them back to the conversation and no further.
        else runResumeAction(itemId, resumeSummary.action)
      }}
      onDismiss={() => setResumeDismissed(true)}
    />
  )
  const resumeBanner = briefing !== null ? (
    <ReturnBriefingCard
      briefing={briefing}
      onGoToPanel={paletteActions.goToPanel}
      onReview={(itemId) => { boardVerbsRef.current.review?.(itemId) }}
      onDecision={(panelId, requestId) => {
        jumpToAttention(panelId)
        if (requestId !== undefined) chromeRef.current.openAttentionAt(requestId)
      }}
    />
  ) : resumeSummary !== null && panels.length > 0 ? resumeOf('card') : null
  // #10. Outside the navigator, Resume is a one-line STRIP in its own grid row
  // above the center column — outside the canvas's content, so it covers
  // nothing — and only while the Panels pane is not already holding the card.
  // The briefing keeps its floating slot: it is a list, not a line.
  const resumeStrip = briefing === null && resumeSummary !== null && panels.length > 0 && !(chrome.navVisible && chrome.navigator === 'panels')
    ? resumeOf('strip') : null
  // M327's plan derivation, ONE reader for Orchestrate's task row and the
  // chart shapes bound to a plan's steps (M394) — so a shape and the task
  // list can never disagree about whether a step finished or stopped.
  const planViewsFor = (itemId: string): ReturnType<typeof planView> | undefined => {
    const item = workItems.find((w) => w.id === itemId)
    if (item?.plan === undefined) return undefined
    const members = new Set(taskMemberships(panels, [item])[0]?.members.map((m) => m.panelId) ?? [])
    const owners = new Set(item.plan.steps.map((st) => st.owner).filter((o): o is string => o !== undefined))
    const chats = panels.filter(isChatPanel).filter((p) => p.rect.id === item.panelId || members.has(p.rect.id) || owners.has(p.rect.id)).map((p) => ({ id: p.rect.id, title: p.title ?? p.rect.id }))
    const h = taskHandoffOf(itemId)
    return planView(item.plan, planFactsOf({ chats, runs: taskQueue.runs[itemId] ?? [], review: { standing: h?.standing ?? 'none', accepted: h?.state === 'accepted' || item.merged !== undefined } }))
  }

  return { attentionAnnouncement, branchLine, briefing, hasSelection, inbox, inspectorSummary, jobRecovery, planViewsFor, reopen, repository, resumeBanner, resumeStrip, reviewModel, runResumeAction, taskQueue, teammatesPaneProps, toolboxModel, vaultPaneProps }
}
