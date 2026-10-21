import type { ShellChrome } from '@renderer/shell/useShellChrome'
import type { PendingApproval } from '@renderer/shell/rail-sections'
import type { ReviewHandoff } from '@shared/review-readiness'
import type { VaultModel } from './useVault'
import type { Registry } from '@renderer/session/session-registry'
import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { type AgentBackend, SUPERVISOR_PROMPT, sendRefusalSentence } from '@shared/agent-session'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { AgentOptions } from '@shared/cost'
import { type CredentialMeta, SERVICES } from '@shared/credential-schema'
import type { PaletteActions } from '@renderer/palette/commands'
import { type Panel, isWorkPanel, isFilePanel, isTerminalPanel, type WorkPanel as WorkPanelModel } from '@renderer/panels/panels'
import type { PersistedTeammate } from '@shared/teammates'
import { type PersistedTemplate, allTemplates } from '@shared/templates'
import { type PersistedWorkItem, WORK_ITEM_STATES, USER_SET_STATES, carryWorkItem, type WorkItemState } from '@shared/work-items'
import { type RunLiveFact, projectSession } from '@shared/run-outcome'
import type { SettingRow, SpawnResult, WorkspaceRow, WorktreeListRow, BrokerAuditRowWire } from '@shared/ipc-contract'
import { buildIntegrationRows, INTEGRATION_AUDIT_ROWS } from '@renderer/shell/integration-model'
import { taskChain } from '@renderer/shell/inspector-context'
import { getAgentState } from '@renderer/session/agent-state-store'
import { openSettingsPage } from '@renderer/settings/open'
import { mergedLine } from '@shared/review-readiness'
import type { FocusSide } from '../focus/focus-model'
import { type TaskMembership, showTaskTarget } from './task-members'
import type { Viewport, WorldRect } from './viewport'
import { useBroadcastChord } from './useBroadcastChord'
import { useKeyboardNav } from './useKeyboardNav'
import { useRailModels } from './useRailModels'
import { useFileTree } from './useFileTree'
import { orchestratorTarget } from './command-pill'
import { orchestratorCandidates } from './CommandPill'
import { buildInspectorContext } from '../shell/inspector-context'
import { railLabel } from '../shell/rail-rows'

/**
 * M505 (E4, the Canvas.tsx split). The navigator's models: the broadcast and
 * command pill doors, the rail (useRailModels), the inspector's context band,
 * the file tree, integrations, the note vault and the Board pane. Lifted out
 * of Canvas VERBATIM as one contiguous run and called at exactly the position
 * it occupied, just above useSkillsPane. The hooks it calls keep their order,
 * so Canvas's hook order is unchanged.
 */
export interface UseNavigatorModelsDeps {
  registry: Registry
  beginCreateVaultNote: (name: string) => void
  beginNewChatRef: RefObject<(opts?: { cwd?: string | undefined; title?: string | undefined; agentOptions?: AgentOptions | undefined; appendSystemPrompt?: string | undefined; message?: string | undefined; backend?: AgentBackend | undefined; teammateId?: string | undefined; sandbox?: true | undefined; routine?: true | undefined; } | undefined) => Promise<SpawnResult>>
  centreOn: (rect: WorldRect) => void
  chrome: ShellChrome
  credentialRows: CredentialMeta[]
  deleteWorkspaceRef: RefObject<((id: string, name: string, liveCount: number) => void) | null>
  displayPanels: Panel[]
  displayPanelsRef: RefObject<Panel[]>
  dormantIds: ReadonlySet<string>
  focusedIdRef: RefObject<string | null>
  frameRects: (rects: WorldRect[]) => void
  globalFontSize: number
  hostRef: RefObject<HTMLDivElement | null>
  lastFocusedAtRef: RefObject<Record<string, number>>
  liveRunFacts: Readonly<Record<string, RunLiveFact>>
  markDone: (itemId: string) => void
  noteRootRef: RefObject<string | null>
  onFocusPanel: (id: string) => void
  openFocusTask: (itemId: string, side?: FocusSide) => void
  openPill: () => void
  openVaultNote: (relative: string) => void
  palette: PaletteController
  paletteActions: PaletteActions
  paletteActionsRef: RefObject<PaletteActions | null>
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  pendingApprovals: PendingApproval[]
  prepareFeedback: (says?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  reloadCredentials: () => void
  selectedId: string | null
  selectedIdRef: RefObject<string | null>
  setFocusedId: Dispatch<SetStateAction<string | null>>
  setRelatedItemId: Dispatch<SetStateAction<string | null>>
  setWorkItems: Dispatch<SetStateAction<PersistedWorkItem[]>>
  settingRows: SettingRow[]
  shouldIgnoreKeys: () => boolean
  spawnWorkCard: (itemId: string) => void
  taskHandoffOf: (itemId: string) => ReviewHandoff | undefined
  taskMemberships: (shown: readonly Panel[], items: readonly PersistedWorkItem[]) => TaskMembership[]
  teammateNameOf: (teammateId: string) => string | undefined
  teammates: PersistedTeammate[] | null
  templateRows: PersistedTemplate[]
  terminalNameOf: ReadonlyMap<string, string>
  terminalRectsRef: RefObject<WorldRect[]>
  vault: VaultModel
  viewportRef: RefObject<Viewport>
  waitingIds: string[]
  workItems: PersistedWorkItem[]
  workItemsRef: RefObject<PersistedWorkItem[]>
  workspaceRows: WorkspaceRow[]
  worktreeRows: WorktreeListRow[]
}

export function useNavigatorModels(deps: UseNavigatorModelsDeps) {
  const {
    beginCreateVaultNote, beginNewChatRef, centreOn, chrome, credentialRows, deleteWorkspaceRef, displayPanels, displayPanelsRef, dormantIds, focusedIdRef, frameRects, globalFontSize, hostRef, lastFocusedAtRef, liveRunFacts, markDone, noteRootRef, onFocusPanel, openFocusTask, openPill, openVaultNote, palette, paletteActions, paletteActionsRef, panels, panelsRef, pendingApprovals, prepareFeedback, reloadCredentials, selectedId, selectedIdRef, setFocusedId, setRelatedItemId, setWorkItems, settingRows, shouldIgnoreKeys, spawnWorkCard, taskHandoffOf, taskMemberships, teammateNameOf, teammates, templateRows, terminalNameOf, terminalRectsRef, vault, viewportRef, waitingIds, workItems, workItemsRef, workspaceRows, worktreeRows, registry
  } = deps
  // M40. The banner's Stop and the Cmd+Shift+I chord both run the palette
  // row's own verb through the same ref, so the three exits cannot drift:
  // the guard (two live selected terminals, or the mode already on) lives
  // in toggleBroadcastInput and nowhere else.
  const toggleBroadcastStable = useCallback(() => {
    paletteActionsRef.current?.toggleBroadcastInput()
  }, [])
  useBroadcastChord({ paletteIsOpen: palette.isOpen, toggle: toggleBroadcastStable })
  // M44. Cmd+Arrow traverse (never wakes), Cmd+Enter focus+wake, Cmd+Escape
  // out of the terminal. goToPanel through the ref so the listener never goes
  // stale; focusPanel is onFocusPanel; releaseFocus is the background release.
  const goToPanelStable = useCallback((id: string) => { paletteActionsRef.current?.goToPanel(id) }, [])
  const releaseFocusStable = useCallback(() => setFocusedId(null), [])
  // M249. The pill's input: the orchestrator chat's own send — the door
  // ChatNode's composer calls — or, with no orchestrator, the sheet's
  // supervisor path with the text as its first message, UNSENT in the new
  // composer (M81: nothing starts work unread). Read through refs at send
  // time, so the target is the canvas as it is when Enter lands.
  //
  // It RETURNS its sentence for the pill to show in place, never `say()`: say
  // opens the palette, which would take the keyboard straight back from the
  // terminal the send just returned it to (the critic's finding). Every
  // refusal arm is spelled by sendRefusalSentence — the string arms
  // (budget, backend, no-session…) read as silence otherwise (M197's trap).
  const sendFromPill = useCallback(async (text: string): Promise<string | null> => {
    try {
      const target = orchestratorTarget(orchestratorCandidates(panelsRef.current))
      if (target !== null) return sendRefusalSentence(await window.canvas.agentSession.send(target, text, []))
      const made = await beginNewChatRef.current({ title: 'supervisor', appendSystemPrompt: SUPERVISOR_PROMPT, message: text })
      return made.kind === 'refused' ? made.reason : 'no orchestrator yet — made a supervisor chat; your message is in its composer, unsent'
    } catch (error) {
      return `not sent — ${error instanceof Error ? error.message : String(error)}`
    }
  }, [])
  useKeyboardNav({
    shouldIgnoreKeys,
    rectsRef: terminalRectsRef,
    selectedIdRef,
    focusedIdRef,
    viewportRef,
    lastFocusedAtRef,
    hostRef,
    goToPanel: goToPanelStable,
    focusPanel: onFocusPanel,
    releaseFocus: releaseFocusStable,
    openPill
  })
  // The banner lives INSIDE the canvas host, unlike every other shell
  // control, so its press would bubble to useCanvasPointer's background
  // onMouseDown — which hit-tests the world point under the banner, selects
  // whatever panel lies beneath (or clears the selection and starts a
  // marquee) and releases focus. Stopping it here is what panel chrome does
  // for the same reason; the palette's outside-click dismissal is a CAPTURE
  // listener and has already run. verify:panels broadcast.2 went red on
  // exactly this: Stop cleared the two-panel selection, so the chord that
  // followed was refused by its own guard.
  const onBroadcastStopMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  // M68. The Jira panel's Connect verb: the palette's Credentials scope.
  const openCredentials = useCallback(() => palette.openPalette('credentials'), [palette.openPalette])
  // R-026. The dock's Settings opens the page. Manage settings… stays the
  // palette drill-in (entersScope: 'settings' on that row).
  const openSettingsScope = useCallback(() => {
    openSettingsPage()
  }, [])

  // Keeps deleteWorkspaceRef current for the __m7aWorkspace test hook
  // declared earlier in this component — see that ref's own comment for why
  // it exists instead of a direct reference.
  useEffect(() => {
    deleteWorkspaceRef.current = paletteActions.deleteWorkspace
  }, [paletteActions])

  // The rail's and inspector's derived models, lifted into useRailModels.ts.
  // Each is frozen on a signature string so a drag's 60Hz rect churn cannot
  // re-render panes that render nothing about a rect.
  const {
    panelRows, railRows, railWorkspaces, railAttention, railElsewhere,
    selectedPanel, selectedLive, inspectorModel, selectedIsSessionless
  } = useRailModels({
    registry, palette, panelsRef, viewportRef, panels, displayPanels, dormantIds,
    workspaceRows, waitingIds, selectedId, globalFontSize, terminalNameOf,
    // M116. A work card's row speaks its item's state; absent when the board is empty.
    ...(workItems.length === 0 ? {} : { workStateOf: (itemId: string) => workItems.find((i) => i.id === itemId)?.state, workItemOf: (itemId: string) => workItems.find((i) => i.id === itemId) }),
    // M401 (B2). A merged task's conversation says where its work went.
    ...(workItems.some((i) => i.merged !== undefined) ? { outcomeOf: (panelId: string) => { const m = workItems.find((i) => i.panelId === panelId && i.merged !== undefined)?.merged; return m === undefined ? undefined : mergedLine(m) } } : {}),
    // M133. A workflow trigger's template name, so a watcher whose command is
    // `/usr/bin/true` reads as the workflow it runs — built-ins included.
    templateNameOf: (templateId: string) => allTemplates(templateRows).find((t) => t.id === templateId)?.name,
    teammateNameOf,
    templateOf: (templateId: string) => allTemplates(templateRows).find((t) => t.id === templateId),
    // M196 (D04). The lane records, already read for the skills door's own
    // lane question. ONE source: this is the same list main's `laneRootOf`
    // asks, so the inspector and the Places gate cannot disagree about which
    // repository a lane belongs to.
    lanes: worktreeRows
  })

  const inspectorContextBand = useMemo(() => {
    if (selectedPanel === undefined || inspectorModel === null) return undefined
    const approval = pendingApprovals.find((a) => a.id === selectedPanel.rect.id)
    const memberships = taskMemberships(displayPanels, workItems)
    const membership = memberships.find((m) => m.members.some((x) => x.panelId === selectedPanel.rect.id))
    const relatedItem = membership === undefined ? undefined : workItems.find((i) => i.id === membership.itemId)
    const workItem = isWorkPanel(selectedPanel)
      ? workItems.find((i) => i.id === selectedPanel.work.itemId)
      : relatedItem
    const laneId = workItem?.panelId
    const execution = laneId === undefined || liveRunFacts[laneId] === undefined ? undefined : projectSession(laneId, liveRunFacts[laneId])
    const handoff = workItem === undefined ? undefined : taskHandoffOf(workItem.id)
    return buildInspectorContext({
      panel: selectedPanel,
      ...(approval !== undefined ? { approvalTool: approval.toolName } : {}),
      agentState: getAgentState(selectedPanel.rect.id),
      restartable: inspectorModel.restartable,
      ...(workItem !== undefined ? { workItem: { id: workItem.id, title: workItem.title, state: workItem.state, ...(workItem.note !== undefined ? { note: workItem.note } : {}) } } : {}),
      ...(execution !== undefined ? { execution: { detail: execution.detail, ...(execution.blocker !== undefined ? { blocker: execution.blocker } : {}) } } : {}),
      ...(handoff !== undefined ? { handoff: { actionLabel: handoff.actionLabel, detail: handoff.detail, ...(handoff.blocker !== undefined ? { blocker: handoff.blocker } : {}) } } : {}),
      ...(membership !== undefined && relatedItem !== undefined ? { related: {
        itemId: relatedItem.id, title: relatedItem.title, memberCount: membership.members.length,
        // M310. The flagship flow as one strip, from this task's own members.
        chain: taskChain({
          item: {
            source: relatedItem.source,
            ...(relatedItem.key === undefined ? {} : { key: relatedItem.key }),
            ...(relatedItem.url === undefined ? {} : { url: relatedItem.url }),
            ...(relatedItem.panelId === undefined ? {} : { panelId: relatedItem.panelId }),
            ...(relatedItem.pr === undefined ? {} : { pr: relatedItem.pr })
          },
          members: membership.members.map((m) => ({ panelId: m.panelId, kind: displayPanels.find((p) => p.rect.id === m.panelId)?.kind ?? 'other' }))
        })
      } } : {})
    })
  }, [selectedPanel, inspectorModel, pendingApprovals, displayPanels, workItems, liveRunFacts, taskHandoffOf])

  // M180. The agent door: `tc plan` lands on the SAME executor the palette's
  // verb line runs, with the caller main resolved riding beside the line.
  useEffect(() => window.canvas.canvas.onPlan((req) => paletteActions.runAgentPlan(req.line, req.caller)), [paletteActions])
  // M190. Help ▸ Prepare feedback… — main's menu item, the renderer's draft.
  useEffect(() => window.canvas.canvas.onFeedback(() => { void prepareFeedback() }), [prepareFeedback])

  // The file tree column, lifted into useFileTree.ts. Roots on the SELECTED
  // panel while insertPath pastes into the FOCUSED one — see the hook's doc
  // comment for why collapsing those onto one id is a bug, not a cleanup.
  const {
    treeRoot, treeRootLabel, treeRows, treeRootPending, treeContextReason, noteRoot,
    toggleDir, refreshTree, insertPath
  } = useFileTree({
    registry, selectedPanel, selectedLive, selectedId, settingRows,
    focusedIdRef, panelsRef, noteRootRef
  })

  /**
   * M89. THE INTEGRATIONS PAGE'S DATA: the credential metas the palette
   * already reloads, plus the broker's audit rows, folded through the pure
   * model. Read when the pane is chosen and on its refresh — the audit is a
   * file, and a page nobody is looking at must not re-read it on every tick.
   */
  const [integrationAudit, setIntegrationAudit] = useState<{ rows: BrokerAuditRowWire[]; skipped: number; state: 'pending' | 'failed' | 'ready'; failure?: string }>({ rows: [], skipped: 0, state: 'pending' })
  const reloadIntegrations = useCallback(() => {
    reloadCredentials()
    // One read PER SERVICE, so a busy service cannot push another's rows out
    // of the window and leave it reading `no calls yet` (M89's verifier).
    void Promise.all(SERVICES.map((svc) => window.canvas.broker.audit(INTEGRATION_AUDIT_ROWS, svc.id)))
      .then((answers) => setIntegrationAudit({ rows: answers.flatMap((a) => a.rows), skipped: answers.reduce((n, a) => n + a.skipped, 0), state: 'ready' }))
      .catch((error: unknown) => setIntegrationAudit({ rows: [], skipped: 0, state: 'failed', failure: String(error) }))
  }, [reloadCredentials])
  useEffect(() => { if (chrome.navigator === 'integrations') reloadIntegrations() }, [chrome.navigator, reloadIntegrations])
  const integrationRows = useMemo(() => buildIntegrationRows(SERVICES, credentialRows, integrationAudit.rows), [credentialRows, integrationAudit.rows])
  const integrationsPaneProps = useMemo(() => ({
    onToggle: chrome.toggleNavigator,
    rows: integrationRows,
    audit: integrationAudit.state,
    ...(integrationAudit.failure === undefined ? {} : { auditFailure: integrationAudit.failure }),
    skipped: integrationAudit.skipped,
    panelLabel: (panelId: string) => { const p = panelsRef.current.find((q) => q.rect.id === panelId); return p === undefined ? undefined : railLabel(p, isTerminalPanel(p) ? registry.get(panelId)?.status : undefined) },
    onConnect: (_service: string) => openCredentials(),
    // The verify's OWN answer, then the reload — never a timer racing a
    // fifteen-second request (M89's verifier). A failure is the palette's
    // line, as the credential rows already do it.
    onVerify: (service: string) => { void window.canvas.credential.verify(service).then((res) => { if (!res.ok) paletteActions.verifyCredential(service); reloadIntegrations() }).catch(() => reloadIntegrations()) },
    onRefresh: reloadIntegrations,
    // M102. The roster's grants per service, by teammate name, with the
    // folders each may act from — a teammate's `places`, empty meaning it is
    // granted the service but has nowhere yet to spend it (this redesign's permission
    // line: who may use it, and from which workspace).
    grants: Object.fromEntries(SERVICES.map((svc) => [svc.id, (teammates ?? []).filter((t) => t.services.includes(svc.id)).map((t) => ({ name: t.name, places: t.places }))]))
  }), [chrome.toggleNavigator, integrationRows, integrationAudit.state, integrationAudit.failure, integrationAudit.skipped, openCredentials, paletteActions, reloadIntegrations, teammates])

  // M150. A note's chip asks the pane to filter: the request rides to the
  // pane as data (tag + a counter, so the same tag asked twice lands twice)
  // and the pane is SHOWN on the way — one door from either side.
  // `chooseNavigator` is the dock's TOGGLE (it collapses the pane that is
  // already showing), so it is called only when the vault is not the pane on
  // screen — the first cut closed the pane the user had just read the note
  // from (the M150 critic's Critical; product `vault.tags.1` reads the rail).
  const vaultFilterSeq = useRef(0)
  const [vaultFilterRequest, setVaultFilterRequest] = useState<{ tag: string; nonce: number } | null>(null)
  const { chooseNavigator: chooseNavigatorPane, navVisible: navPaneVisible, navigator: navPane } = chrome
  const filterVaultTag = useCallback((tag: string) => {
    setVaultFilterRequest({ tag, nonce: (vaultFilterSeq.current += 1) })
    if (!(navPaneVisible && navPane === 'vault')) chooseNavigatorPane('vault')
  }, [chooseNavigatorPane, navPaneVisible, navPane])
  /**
   * M85. ONE object each for the pane and for every in-vault note, memoised
   * on the fields they carry: `Navigator` and `FileNode` are memo'd, and a
   * fresh literal per render defeated both on every mousemove and drag frame
   * while a vault was set — the invisible churn the rail's signature freeze
   * exists to prevent (M85's verifier).
   */
  const noteVault = useMemo(() => (
    vault.root === '' ? null : { root: vault.root.replace(/\/+$/, ''), index: vault.index, onOpenNote: openVaultNote, onCreateNote: beginCreateVaultNote, onFilterTag: filterVaultTag }
  ), [vault.root, vault.index, openVaultNote, beginCreateVaultNote, filterVaultTag])
  const vaultSelectedPath = ((): string | null => {
    const p = selectedPanel
    if (!p || !isFilePanel(p) || noteVault === null) return null
    return p.source.path.startsWith(`${noteVault.root}/`) ? p.source.path.slice(noteVault.root.length + 1) : null
  })()
  // M100. The Teammates pane's model. Every write goes to main and reloads
  // the roster from the answer — never an optimistic local flip.
  // M116. The Board pane's model. A row click flies through `centreOn` and
  // NOTHING else — no focus, no raise (the minimap's rule: navigating is not
  // interacting). A drop sets a state the USER may set and refuses the rest
  // by the record's own list, so the pane's drop targets and this setter
  // agree by construction. The card set is a signature so a drag's 60Hz
  // rect churn does not rebuild the pane's props.
  const cardItemIds = panels.filter(isWorkPanel).map((p) => p.work.itemId).sort().join('\u0000')
  // M116. A drop on a user-set column. `done` goes through the SAME verb the
  // card's button and `tc board done` reach (the PR-comment offer included);
  // a drop that leaves a lane mid-turn says so in the note rather than
  // pretending the runtime stopped — the next turn will say `working` again.
  const setWorkItemState = useCallback((itemId: string, state: WorkItemState): void => {
    if (!USER_SET_STATES.includes(state)) return
    if (state === WORK_ITEM_STATES[3]) { markDone(itemId); return }
    setWorkItems((current) => current.map((i) => {
      if (i.id !== itemId) return i
      const laneOpen = i.panelId !== undefined && i.state === WORK_ITEM_STATES[1] && panelsRef.current.some((p) => p.rect.id === i.panelId)
      return carryWorkItem({ ...i, state, ...(laneOpen ? { note: 'lane still open — close the chat to stop it' } : {}), updatedAt: Date.now() })
    }))
  }, [markDone])
  // Frame a panel's one task on the canvas, or say why not — Orchestrate's "focus
  // related" and the title bar's task crumb are the same verb, so one body.
  const frameTaskOf = useCallback((panelId: string): void => {
    const shown = displayPanelsRef.current
    const items = workItemsRef.current
    const target = showTaskTarget(panelId, shown, taskMemberships(shown, items), Object.fromEntries(items.map((i) => [i.id, i.title])))
    if (target.kind === 'refused') {
      paletteActionsRef.current?.say(target.reason)
      return
    }
    setRelatedItemId(target.itemId)
    frameRects(target.rects)
  }, [frameRects])
  const goToWorkItem = useCallback((itemId: string): void => {
    const card = panelsRef.current.find((p): p is WorkPanelModel => isWorkPanel(p) && p.work.itemId === itemId)
    if (card !== undefined) centreOn(card.rect)
  }, [centreOn])
  const boardPaneProps = useMemo(() => {
    const cards = new Set(cardItemIds.split('\u0000'))
    return {
      items: workItems,
      teammates: teammates ?? [],
      laneLabelOf: (panelId: string) => railRows.find((r) => r.id === panelId)?.label,
      hasCard: (itemId: string) => cards.has(itemId),
      onGoTo: goToWorkItem,
      onSetState: setWorkItemState,
      onShowOnCanvas: spawnWorkCard,
      onFocusTask: openFocusTask,
      onToggle: chrome.toggleNavigator
    }
  }, [workItems, teammates, railRows, cardItemIds, goToWorkItem, setWorkItemState, spawnWorkCard, chrome.toggleNavigator, openFocusTask])

  return { boardPaneProps, frameTaskOf, goToPanelStable, goToWorkItem, insertPath, inspectorContextBand, inspectorModel, integrationsPaneProps, noteRoot, noteVault, onBroadcastStopMouseDown, openCredentials, openSettingsScope, panelRows, railAttention, railElsewhere, railRows, railWorkspaces, refreshTree, releaseFocusStable, selectedIsSessionless, selectedPanel, sendFromPill, toggleBroadcastStable, toggleDir, treeContextReason, treeRoot, treeRootLabel, treeRootPending, treeRows, vaultFilterRequest, vaultSelectedPath }
}
