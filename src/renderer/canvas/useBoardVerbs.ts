import { useCallback, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  addLink, cascadeCentre, isChatPanel, isTerminalPanel, isWorkPanel, makeChatPanel, makePanel,
  nextZ, setLinkAutomation, setLinkLabel, workCardItemId, CHAT_W, type Panel
} from '@renderer/panels/panels'
import { seedAfter } from '@renderer/panels/recover'
import { screenToWorld, type Viewport, type WorldRect } from './viewport'
import { arrangePlan, fitTaskTarget, missingSentence, showTaskTarget, type TaskMembership } from './task-members'
import { WORK_ITEM_STATES, carryWorkItem, prRefusal, repoOfKey, type PersistedWorkItem } from '@shared/work-items'
import {
  SWARM_PRESETS, primarySeat, swarmRefusal, swarmSeatRefusal, swarmSystemPrompt,
  type SwarmMark, type SwarmPresetId
} from '@shared/swarm'
import { DISPATCH_PROMPT, SUPERVISOR_PROMPT, sendRefusalSentence } from '@shared/agent-session'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'
import { claudeAvailable, codexAvailable, type PresetRow } from '@renderer/palette/commands'
import { deliverToComposer, lastAssistantText } from '@renderer/chat/chat-store'
import { type CanvasGroup } from '@renderer/groups/groups'
import { type CredentialMeta } from '@shared/credential-schema'
import type { InputMode } from '@renderer/palette/Palette'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { StartWorkOutcome } from '@renderer/palette/start-work'
import type { ReviewTaskContext } from '@renderer/review/ReviewNode'
import type { useTaskHandoffs } from './useTaskHandoffs'

/**
 * Read off the hook that owns them rather than re-spelled here: these four
 * are handed straight through from `useTaskHandoffs`, and a second spelling
 * of a record shape is the drift `cardItemOf`/`workCardItemId` only escapes
 * by being two DELIBERATE type worlds.
 */
type TaskHandoffs = ReturnType<typeof useTaskHandoffs>

/** How much of a lane agent's last message the review node's task section carries. */
const ACCOUNT_MAX = 400

/**
 * What a verb answers to a door that can refuse: the shape every `boardVerbs`
 * member below returns, and the shape the palette rows, the agent lines and
 * the action nodes all read.
 */
export type VerbOutcome = { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }

/**
 * M114/M115. The board verbs the canvas INSTALLS rather than returns.
 *
 * Named here because three modules now spell it — `Canvas.tsx` mints the ref,
 * this hook fills it, and `usePaletteActions` reads it — and a fourth
 * hand-copy of a ten-member inline type is how the members drift apart.
 *
 * Every member is optional because the ref is minted empty, one render before
 * this hook's first pass fills it: a door that fires in that gap refuses by
 * name (`?.` then a refusal sentence) rather than throwing.
 */
export interface BoardVerbs {
  dispatch?: (itemId: string, teammateId: string, root?: string) => Promise<StartWorkOutcome>
  swarm?: (itemId: string, teammateId: string, root: string, preset: SwarmPresetId) => Promise<StartWorkOutcome>
  openPr?: (itemId: string) => void
  commentPr?: (itemId: string) => void
  markDone?: (itemId: string) => void
  review?: (itemId: string) => VerbOutcome
  /** `partial` says the camera framed SOME of the task — the surfaces speak only then. */
  show?: (panelId: string) => { kind: 'ran'; note?: string; partial?: true } | { kind: 'refused'; reason: string }
  related?: (panelId: string) => VerbOutcome
  arrange?: (panelId: string) => VerbOutcome
  fitTask?: () => VerbOutcome
}

export interface BoardVerbsDeps {
  /* ---- canvas state, and the refs the async paths read it through ---- */
  panels: Panel[]
  setPanels: Dispatch<SetStateAction<Panel[]>>
  panelsRef: MutableRefObject<Panel[]>
  /** The DISPLAYED panels — an anchored card's derived rect, a merged lane's synthetic one. */
  displayPanelsRef: MutableRefObject<readonly Panel[]>
  groups: CanvasGroup[]
  setWorkItems: Dispatch<SetStateAction<PersistedWorkItem[]>>
  /**
   * The board's mirror, written at the same moment as the state. Recovery
   * reads the association again before React is obliged to render, so every
   * async path here reads and writes THIS, never the `workItems` closure.
   */
  workItemsRef: MutableRefObject<PersistedWorkItem[]>
  /** Filled by this hook during render; see `BoardVerbs`. */
  boardVerbsRef: MutableRefObject<BoardVerbs>
  /** The merged view is READ-ONLY: every verb that writes geometry refuses through this. */
  mergedRef: MutableRefObject<boolean>
  nextIdRef: MutableRefObject<number>
  commitHistory: (next: Panel[]) => void

  /* ---- selection, focus and the camera ---- */
  selectedIds: ReadonlySet<string>
  selectedIdsRef: MutableRefObject<ReadonlySet<string>>
  selectOnly: (id: string | null) => void
  focusedId: string | null
  focusedIdRef: MutableRefObject<string | null>
  onFocusPanel: (id: string) => void
  viewportRef: MutableRefObject<Viewport>
  /** Through the camera TRAIL, so Cmd+[ goes back from every frame these verbs make. */
  frameRects: (rects: WorldRect[]) => void

  /* ---- the surfaces a refusal is spoken through ---- */
  palette: PaletteController
  setInputMode: Dispatch<SetStateAction<InputMode | null>>

  /* ---- what the refusals are judged against ---- */
  presetRowsRef: MutableRefObject<PresetRow[]>
  teammatesRef: MutableRefObject<PersistedTeammate[]>
  credentialRows: CredentialMeta[]

  /* ---- the task layer: ONE set of records, never a second list ---- */
  taskHandoffOf: TaskHandoffs['handoffOf']
  taskLaneOf: TaskHandoffs['laneOf']
  taskPathsOf: TaskHandoffs['pathsOf']
  refreshTaskHandoffs: TaskHandoffs['refresh']
  /** M203/M204. Every task's members, built ONE way — the component owns the live-session read. */
  taskMemberships: (shown: readonly Panel[], items: readonly PersistedWorkItem[]) => TaskMembership[]
  reviewTaskLane: (itemId: string) => VerbOutcome

  /* ---- M204's lens ---- */
  relatedItemId: string | null
  setRelatedItemId: Dispatch<SetStateAction<string | null>>
}

/**
 * The board's verbs: dispatch a work item into a lane, start a swarm
 * arrangement over that lane, open and comment its PR, mark it done, and the
 * four camera verbs that show, frame and arrange a task.
 *
 * Lifted out of `Canvas.tsx` verbatim — a purely structural split, in the
 * shape M28 gave `useInspectorDetail`: one CONTIGUOUS run of hook calls,
 * called at exactly its old position, taking one `Deps` object it destructures
 * on entry so the dependency arrays keep naming the members and never `deps`
 * (which the caller rebuilds every render).
 *
 * Nine of this module's bindings never leave it — `dispatchAttemptsRef` and
 * `swarmAttemptsRef` with the `*Attempt` functions they guard, and the frozen
 * terminal-id chain — which is the point of the split: the one-attempt-per-item
 * rule is machinery, and it used to sit at the same level as the verbs it
 * protects.
 *
 * WHAT THIS RETURNS IS NOT ALL IT PUBLISHES. Ten verbs are installed into
 * `boardVerbsRef` during render, the way they always were: that ref is minted
 * above the palette memo, and the palette, the agent lines and the action
 * nodes reach the verbs through it. Those assignments are ORDER-SENSITIVE
 * statements, not effects — moving this call moves them.
 */
export function useBoardVerbs(deps: BoardVerbsDeps) {
  const {
    panels, setPanels, panelsRef, displayPanelsRef, groups, setWorkItems, workItemsRef,
    boardVerbsRef, mergedRef, nextIdRef, commitHistory,
    selectedIds, selectedIdsRef, selectOnly, focusedId, focusedIdRef, onFocusPanel,
    viewportRef, frameRects, palette, setInputMode,
    presetRowsRef, teammatesRef, credentialRows,
    taskHandoffOf, taskLaneOf, taskPathsOf, refreshTaskHandoffs, taskMemberships, reviewTaskLane,
    relatedItemId, setRelatedItemId
  } = deps
  /**
   * M114. DISPATCH — the one verb. In order, each step refusing by name into
   * the record's `note` and minting nothing when it does: main's `board:lane`
   * (the repository under the teammate's places, the gate on its root, the
   * worktree), then `agent:create` in the lane as the teammate under
   * DISPATCH_PROMPT, then the chat panel beside the card with a plain edge
   * labelled `dispatched` (no trigger — the edge is a statement, not an
   * automation), then the first message SENT (a dispatch is a hand-off, not
   * a draft — the M80 insert rule is for templates a person finishes). The
   * state stays `todo` here: `working` is the runtime's word (the turn-start
   * effect above), never the click's.
   */
  const dispatchAttemptsRef = useRef<Map<string, Promise<StartWorkOutcome>>>(new Map())
  const dispatchWorkItemAttempt = useCallback(async (itemId: string, teammateId: string, root?: string, swarm?: SwarmMark): Promise<StartWorkOutcome> => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const item = workItemsRef.current.find((i) => i.id === itemId)
    if (item === undefined) return { kind: 'refused', reason: `no work item is called ${itemId} — it may have been closed` }
    const patch = (fields: Partial<PersistedWorkItem> & { anchor?: PersistedWorkItem['anchor']; note?: string }): PersistedWorkItem | undefined => {
      // Recovery reads the association again before React is obliged to
      // render. Keep the mirror current at the write, the same rule M197's
      // addWorkItem learned when a typed item was minted and started in one
      // tick.
      const next = workItemsRef.current.map((i) => (i.id === itemId ? carryWorkItem({ ...i, ...fields, updatedAt: Date.now() }) : i))
      workItemsRef.current = next
      setWorkItems(next)
      return next.find((i) => i.id === itemId)
    }
    const chatId = item.panelId ?? `c${nextIdRef.current++}`
    // A reserved id can outlive a refused create without joining the panel
    // roster. Re-seed from it before any other mint can reuse the number.
    nextIdRef.current = seedAfter([chatId], nextIdRef.current)
    const standingPanel = panelsRef.current.find((p) => p.rect.id === chatId)
    if (standingPanel !== undefined && !isChatPanel(standingPanel)) {
      const reason = `${chatId} now belongs to a ${standingPanel.kind} panel — choose a new task or close the conflicting panel`
      patch({ note: reason })
      return { kind: 'refused', reason }
    }
    // A completed dispatch is idempotent. Only the named refused-send stage
    // retries a message through an existing conversation.
    const retryingSend = item.note?.startsWith('the lane and the conversation are ready, but the first message was refused — ') === true ||
      item.note === 'the lane and the conversation are ready, but the first message has not been sent yet'
    const repo = item.key === undefined ? null : repoOfKey(item.key)
    const lane = await window.canvas.board.lane({ itemId, chatPanelId: chatId, teammateId, ...(repo === null ? {} : { repo }), ...(root === undefined ? {} : { root }) })
    if (lane.kind === 'refused') { patch({ note: lane.reason }); return { kind: 'refused', reason: lane.reason } }
    // Revalidate the requested teammate/root through main before calling a
    // standing dispatch complete. A different teammate may not inherit this
    // lane merely because the conversation already exists.
    if (standingPanel !== undefined && !retryingSend) return { kind: 'started', itemId, panelId: chatId }
    // The lane association lands BEFORE agent:create. A refusal or a relaunch
    // can therefore resume it by the same panel id; `ensureForPanel` sees the
    // same id/root pair and returns the standing worktree.
    patch({ teammateId, panelId: chatId, worktreeId: lane.worktreeId, note: 'the lane is ready, but the conversation has not been created yet', state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] })
    let panel = standingPanel
    if (panel === undefined) {
      const sessionId = crypto.randomUUID()
      // M275. A swarm's PRIMARY seat is still a dispatched lane — it takes the
      // item's `panelId` and its worktree — but its brief is the seat's, not
      // the generic one: an explorer told to commit as it goes is an explorer
      // that writes. `swarmSystemPrompt` folds the lane's own rules (never
      // push, never open a PR) back into every seat brief that needs them.
      const created = await window.canvas.agentSession.create({ id: chatId, cwd: lane.path, sessionId, teammateId, appendSystemPrompt: swarm === undefined ? DISPATCH_PROMPT : swarmSystemPrompt(swarm, SUPERVISOR_PROMPT) })
      if (created.kind === 'refused') { patch({ note: `the lane is ready, but the conversation was refused — ${created.reason}` }); return { kind: 'refused', reason: created.reason } }
      const GAP = 48
      // The card and the offset are computed HERE, from the ref, not inside
      // the updater: React runs an updater later, while the recovery record
      // must already name the exact panel it will anchor to.
      const before = panelsRef.current
      const card = before.find((p) => workCardItemId(p) === itemId)
      const centre = card === undefined
        ? cascadeCentre(screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current), before)
        : { x: card.rect.x + card.rect.w + GAP + CHAT_W / 2, y: card.rect.y + card.rect.h / 2 }
      const chatPanel = { ...makeChatPanel(chatId, centre, nextZ(before), { cwd: lane.path, sessionId, teammateId, dispatch: true, ...(swarm === undefined ? {} : { swarm }) }), title: item.key ?? item.title }
      const anchor: PersistedWorkItem['anchor'] = card === undefined ? undefined : { panelId: chatId, dx: card.rect.x - chatPanel.rect.x, dy: card.rect.y - chatPanel.rect.y }
      let next: Panel[] = [...before, chatPanel]
      if (card !== undefined) next = setLinkLabel(addLink(next, card.rect.id, chatId), card.rect.id, chatId, 'dispatched')
      panelsRef.current = next
      setPanels(() => { commitHistory(next); return next })
      panel = chatPanel
      patch({ anchor, note: 'the lane and the conversation are ready, but the first message has not been sent yet' })
      selectOnly(chatId)
    }
    const header = ['Dispatched work item', item.key ?? '(typed)', item.title, item.url ?? ''].filter((l) => l !== '').join('\n')
    const body = item.description === undefined || item.description === '' ? '' : `\n\n${item.description}`
    // M197 (D05). The first send's answer is READ. `send` has a `{ refused }`
    // arm — M82's budget ceiling refuses and STORES NOTHING, by that
    // milestone's own rule — so a dispatch over budget used to leave a chat
    // panel, a worktree and a card marked `todo` with no message anywhere and
    // nothing on screen saying why. The card's own state machine then never
    // reached `working`, because `working` is the runtime's word from a turn
    // that never started. The lane and the chat are real and are KEPT; the
    // note says the send did not happen, which is the recoverable state.
    const sent = await window.canvas.agentSession.send(chatId, `${header}${body}`, [])
    const notSent = sendRefusalSentence(sent)
    if (notSent !== null) {
      patch({ note: `the lane and the conversation are ready, but the first message was refused — ${notSent}` })
      return { kind: 'refused', reason: notSent }
    }
    patch({ note: undefined })
    return { kind: 'started', itemId, panelId: chatId }
  }, [commitHistory, selectOnly])
  const dispatchWorkItem = useCallback((itemId: string, teammateId: string, root?: string, swarm?: SwarmMark): Promise<StartWorkOutcome> => {
    const standing = dispatchAttemptsRef.current.get(itemId)
    if (standing !== undefined) return standing
    const attempt = dispatchWorkItemAttempt(itemId, teammateId, root, swarm)
    dispatchAttemptsRef.current.set(itemId, attempt)
    void attempt.finally(() => {
      if (dispatchAttemptsRef.current.get(itemId) === attempt) dispatchAttemptsRef.current.delete(itemId)
    })
    return attempt
  }, [dispatchWorkItemAttempt])
  boardVerbsRef.current.dispatch = (itemId, teammateId, root) => dispatchWorkItem(itemId, teammateId, root)
  /**
   * M275. START A SWARM — the arrangement, on top of the dispatch above and
   * never beside it.
   *
   * Step one is `dispatchWorkItem` itself, for the PRIMARY seat. That is the
   * whole reason this reads as short: the lane, the Places gate, the worktree,
   * the card's `dispatched` edge, the item's `panelId`/`worktreeId` and the
   * first send are M114's and stay M114's, so a task a swarm started is the
   * same kind of thing as a task a solo start made — Open PR, Review the lane
   * and M202's readiness all keep working, with no arm for "but it was a
   * swarm". A second lane-maker here would be a second author of what a task
   * is, and the two would drift in whichever arm nobody opens.
   *
   * Everything after step one is ADDITIVE and cannot unmake it. A seat refused
   * half way disposes the sessions THIS call created and leaves the primary
   * lane standing, because that lane is exactly what a solo start would have
   * produced and throwing it away to punish a later refusal would destroy real
   * work. The card's note says which seat was refused and why, which is the
   * recoverable state — the same shape M197 gave the refused first send.
   */
  const swarmAttemptsRef = useRef<Map<string, Promise<StartWorkOutcome>>>(new Map())
  const startSwarmAttempt = useCallback(async (itemId: string, teammateId: string, root: string, presetId: SwarmPresetId): Promise<StartWorkOutcome> => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const preset = SWARM_PRESETS[presetId]
    const item = workItemsRef.current.find((i) => i.id === itemId)
    if (item === undefined) return { kind: 'refused', reason: `no work item is called ${itemId} — it may have been closed` }
    const mate = teammatesRef.current.find((t) => t.id === teammateId)
    // Named here rather than left to `swarmRefusal`, which SKIPS the teammate
    // arms for the doors that never ask for one (the card's menu). An executor
    // that reached main with a teammate id nothing answers to would be refused
    // by `board:lane` one step later, in main's words, after a seat was minted.
    if (mate === undefined) return { kind: 'refused', reason: `no teammate is called ${teammateId} — it may have been deleted; open the Teammates pane` }
    // THE LAST GATE, and the same function the sheet's disabled Start read.
    // A caller that reached here another way (the verb, a card's menu) is
    // judged by the same sentences rather than by a second opinion.
    const blocked = swarmRefusal(preset, {
      agentAvailable: claudeAvailable(presetRowsRef.current) || codexAvailable(presetRowsRef.current),
      teammate: { name: teammateWord(mate), places: mate.places },
      item: { state: item.state }
    })
    if (blocked !== null) return { kind: 'refused', reason: blocked }
    const primary = primarySeat(preset)
    if (primary === undefined) return { kind: 'refused', reason: `the ${preset.label} arrangement names no primary seat` }

    const started = await dispatchWorkItem(itemId, teammateId, root, { preset: presetId, role: primary.role })
    if (started.kind === 'refused') return started
    const primaryId = started.panelId
    const anchor = panelsRef.current.find((p) => p.rect.id === primaryId)
    if (anchor === undefined) return { kind: 'refused', reason: `the ${preset.label} lane was made but its panel is gone — the arrangement was not built` }
    // The lane's own folder, read from the panel the dispatch just committed
    // rather than carried out of `board:lane`: a seat sharing the task lane
    // must share the folder the primary seat is ACTUALLY in, and the panel is
    // where that fact ended up.
    const lanePath = isChatPanel(anchor) ? anchor.chat.cwd : root
    const centre = { x: anchor.rect.x + anchor.rect.w / 2, y: anchor.rect.y + anchor.rect.h / 2 }
    // M81's one-supervisor rule, asked once and honoured rather than fought:
    // a canvas that already has a supervisor keeps it, and the arrangement
    // says so instead of refusing the whole start over a hub it can borrow.
    const standingSupervisor = panelsRef.current.find((p) => isChatPanel(p) && p.chat.supervisor === true)

    const minted = new Map<string, string>([[preset.primary, primaryId]])
    const madePanels: Panel[] = []
    const createdChats: string[] = []
    const sends: Array<{ id: string; text: string }> = []
    const notes: string[] = []
    const undoCreated = (): void => { for (const id of createdChats) void window.canvas.agentSession.dispose({ id, drop: true }) }
    const patchNote = (note: string | undefined): void => {
      const next = workItemsRef.current.map((i) => (i.id === itemId ? carryWorkItem({ ...i, ...(note === undefined ? {} : { note }), updatedAt: Date.now() }) : i))
      workItemsRef.current = next
      setWorkItems(next)
    }

    for (const seat of preset.seats) {
      if (seat.key === preset.primary) continue
      if (seat.role === 'supervisor' && standingSupervisor !== undefined) {
        // Borrowed, not minted — and it joins `minted` so the arrangement's
        // edges still reach it. An arrangement whose hub edges silently went
        // nowhere would look wired and be a drawing.
        minted.set(seat.key, standingSupervisor.rect.id)
        notes.push('this canvas already had a supervisor — the arrangement uses it as its hub')
        continue
      }
      const at = { x: centre.x + seat.dx, y: centre.y + seat.dy }
      if (seat.kind === 'terminal') {
        // A terminal seat is minted HERE from a resolved spec, never spawned
        // through the event path — M80's rule: the event path places the panel
        // itself, commits its own history entry, and leaves this loop guessing
        // which panel arrived, which is exactly what the edges cannot tolerate.
        const id = `n${nextIdRef.current++}`
        madePanels.push({ ...makePanel(id, at, 1, { panelId: id, cwd: seat.place === 'root' ? root : lanePath, command: '/bin/sh', args: ['-lc', seat.command ?? ''] }, { ...(seat.w === undefined ? {} : { w: seat.w }), ...(seat.h === undefined ? {} : { h: seat.h }) }), title: seat.title })
        minted.set(seat.key, id)
        continue
      }
      let cwd = seat.place === 'root' ? root : lanePath
      if (seat.place === 'own-lane') {
        // Its own worktree, through the SAME `board:lane` the primary took —
        // keyed on this seat's own chat id, which is what makes it a different
        // lane rather than the same one under another name.
        const laneId = `c${nextIdRef.current++}`
        nextIdRef.current = seedAfter([laneId], nextIdRef.current)
        const repo = item.key === undefined ? null : repoOfKey(item.key)
        const lane = await window.canvas.board.lane({ itemId, chatPanelId: laneId, teammateId, root, ...(repo === null ? {} : { repo }) })
        if (lane.kind === 'refused') { undoCreated(); patchNote(swarmSeatRefusal(seat, lane.reason)); return { kind: 'refused', reason: swarmSeatRefusal(seat, lane.reason) } }
        cwd = lane.path
      }
      const id = `c${nextIdRef.current++}`
      nextIdRef.current = seedAfter([id], nextIdRef.current)
      const sessionId = crypto.randomUUID()
      const mark: SwarmMark = { preset: presetId, role: seat.role }
      const create = await window.canvas.agentSession.create({ id, cwd, sessionId, teammateId, appendSystemPrompt: swarmSystemPrompt(mark, SUPERVISOR_PROMPT) })
      if (create.kind === 'refused') { undoCreated(); patchNote(swarmSeatRefusal(seat, create.reason)); return { kind: 'refused', reason: swarmSeatRefusal(seat, create.reason) } }
      createdChats.push(id)
      const chat = { cwd, sessionId, teammateId, swarm: mark, ...(seat.role === 'supervisor' ? { supervisor: true as const } : {}) }
      madePanels.push({ ...makeChatPanel(id, at, 1, chat, { ...(seat.w === undefined ? {} : { w: seat.w }), ...(seat.h === undefined ? {} : { h: seat.h }) }), title: seat.title })
      minted.set(seat.key, id)
      // A seat with no message opens QUIET and waits for the edge that feeds
      // it (swarm.ts's rule): a seat sent a message AND fed by a handoff
      // answers the wrong question first, with the real input arriving
      // mid-turn where nobody will read it as an input at all.
      if (seat.message !== undefined && seat.message !== '') sends.push({ id, text: seat.message })
    }

    setPanels((current) => {
      let next: Panel[] = [...current]
      let z = nextZ(current)
      for (const panel of madePanels) next = [...next, { ...panel, z: z++ }]
      for (const edge of preset.edges) {
        const from = minted.get(edge.from)
        const to = minted.get(edge.to)
        if (from === undefined || to === undefined) continue
        next = addLink(next, from, to)
        next = setLinkLabel(next, from, to, edge.label)
        // A STATEMENT edge gets no automation at all — see `SwarmEdge.automate`.
        // `setLinkAutomation` returns the identical array for a cycle, which is
        // why the hub's edges are statements: an enabled edge out of a hub that
        // its own workers feed would be refused there and leave a drawing.
        if (edge.automate) next = setLinkAutomation(next, from, to, { kind: 'handoff', enabled: true, trigger: edge.trigger })
      }
      commitHistory(next)
      return next
    })
    panelsRef.current = [...panelsRef.current, ...madePanels]
    // The sends go out AFTER the panels are committed: the chat store is
    // seeded by each panel's own hook, and a send into an unseeded chat is
    // dropped by the store's never-seeded guard (M80's insert learned this).
    for (const { id, text } of sends) void window.canvas.agentSession.send(id, text, [])
    // M275. The review node is the arrangement's, not a seat: it is this app's
    // own object for "gather the diff", and minting a chat to describe one
    // would be a worse answer to the same question.
    if (preset.opensReview === true) {
      const opened = boardVerbsRef.current.review?.(itemId)
      if (opened !== undefined && opened.kind === 'refused') notes.push(`the review node was not opened — ${opened.reason}`)
    }
    patchNote(notes.length === 0 ? undefined : notes.join(' · '))
    return { kind: 'started', itemId, panelId: primaryId }
  }, [commitHistory, dispatchWorkItem])
  const startSwarm = useCallback((itemId: string, teammateId: string, root: string, presetId: SwarmPresetId): Promise<StartWorkOutcome> => {
    // The same one-attempt-per-item rule the dispatch has, and for the same
    // reason at four times the cost: two arrangements racing on one card would
    // mint two hubs, two runners and two sets of edges over one lane.
    const standing = swarmAttemptsRef.current.get(itemId)
    if (standing !== undefined) return standing
    const attempt = startSwarmAttempt(itemId, teammateId, root, presetId)
    swarmAttemptsRef.current.set(itemId, attempt)
    void attempt.finally(() => {
      if (swarmAttemptsRef.current.get(itemId) === attempt) swarmAttemptsRef.current.delete(itemId)
    })
    return attempt
  }, [startSwarmAttempt])
  boardVerbsRef.current.swarm = (itemId, teammateId, root, presetId) => startSwarm(itemId, teammateId, root, presetId)
  /**
   * M115. THE RETURN PATH. `openPr` refuses by name through `prRefusal` (the
   * one function the card's disabled title also reads) BEFORE main is asked;
   * main pushes the lane and POSTs through the broker, whose write gate asks
   * the teammate's spend card. `opened` and `exists` alike give the card its
   * `pr` and the state `review` — the runtime's word, from the event. Every
   * refusal lands in the record's `note`, where the card shows it.
   */
  const patchWorkItem = useCallback((itemId: string, fields: Partial<PersistedWorkItem> & { anchor?: PersistedWorkItem['anchor']; note?: string }) => {
    setWorkItems((current) => current.map((i) => (i.id === itemId ? carryWorkItem({ ...i, ...fields, updatedAt: Date.now() }) : i)))
  }, [])
  /**
   * M202 (D07). Everything the review node's task section needs, resolved
   * where the facts live. `undefined` — and so no task section at all — when
   * the review was opened by another door, when the item has left the board,
   * or when its worktree record is gone: a task section over a lane that is
   * not there would describe a diff belonging to nobody.
   *
   * `ledgerPanelIds` is every TERMINAL on this canvas. It is deliberately not
   * narrowed to the lane here: a terminal's live cwd can differ from the one
   * a command ran in, and the ledger row carries the cwd that is actually
   * true. The node filters on that, through `observedCommands`.
   */
  /*
   * The terminal ids the ledger is read from, FROZEN on their own signature.
   *
   * `taskContextFor` runs on every render of a task-bearing review node, and
   * a fresh array here would be a fresh prop, which defeats `ReviewNode`'s
   * memo — the 60Hz cascade that memo exists to prevent, and the reason the
   * rail and inspector models are frozen the same way (`useRailModels`).
   */
  const terminalIds = useMemo(() => panels.filter(isTerminalPanel).map((p) => p.rect.id), [panels])
  const terminalIdsKey = terminalIds.join(' ')
  const terminalIdsRef = useRef<readonly string[]>(terminalIds)
  const frozenTerminalIds = useMemo(() => terminalIds, [terminalIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps
  terminalIdsRef.current = frozenTerminalIds

  const taskContextFor = useCallback((itemId: string | undefined): ReviewTaskContext | undefined => {
    if (itemId === undefined) return undefined
    const item = workItemsRef.current.find((i) => i.id === itemId)
    if (item === undefined || item.worktreeId === undefined) return undefined
    // The SAME records the handoff was judged against, never a second list.
    const record = taskLaneOf(itemId)
    if (record === undefined) return undefined
    const handoff = taskHandoffOf(itemId)
    if (handoff === undefined) return undefined
    // A CHAT, not merely a panel that exists. `insertIntoComposer` is a
    // no-op for anything else, so a lane that is a terminal would leave
    // `Continue the conversation` enabled and doing nothing at all — the
    // silent failure this repository's refusal-by-name rule exists for. The
    // panels check caught it; nothing on screen would have.
    const chatAlive = item.panelId !== undefined && panelsRef.current.some((p) => p.rect.id === item.panelId && isChatPanel(p))
    return {
      itemId,
      title: item.title,
      lanePath: record.path,
      handoff,
      // The SAME read the handoff was judged against — never a second one.
      paths: taskPathsOf(itemId) ?? [],
      // A lane whose conversation is open contributes the agent's own last
      // words. Labelled in the section as an ACCOUNT and never as evidence:
      // an agent saying it fixed something is a claim, and this phase exists
      // to stop claims being painted as findings.
      ...(chatAlive ? { account: lastAssistantText(item.panelId as string).trim().slice(0, ACCOUNT_MAX) } : {}),
      // The review node's own Refresh and its Mark reviewed move the CARD
      // too. Without this the card's readiness has exactly one trigger — a
      // chat turn ending — so a lane driven by a terminal could sit on
      // `reviewed` over a diff that had moved, with nothing on screen saying
      // the reading was old.
      onRefresh: refreshTaskHandoffs,
      ...(item.reviewed === undefined ? {} : { reviewed: item.reviewed }),
      ledgerPanelIds: terminalIdsRef.current,
      ...(chatAlive ? { chatPanelId: item.panelId as string } : {}),
      // M285. The identity rides into the mark when main sent one; absent
      // stays absent, and the mark then reads `unknown` rather than current.
      onMarkReviewed: (id, signature, files, identity) => patchWorkItem(id, { reviewed: { at: Date.now(), signature, files, ...(identity === undefined ? {} : { identity }) } }),
      // FOCUS and INSERT — never send. M80's rule for every message this app
      // puts in a composer: the person decides what their agent is told.
      onContinue: (id, paths) => {
        const it = workItemsRef.current.find((i) => i.id === id)
        if (it?.panelId === undefined) return
        selectOnly(it.panelId)
        onFocusPanel(it.panelId)
        const named = paths.slice(0, 10)
        const rest = paths.length - named.length
        void deliverToComposer(it.panelId, paths.length === 0
          ? 'I have looked at the lane and it holds no changes. '
          : `I have reviewed these changes:\n${named.map((path) => `- ${path}`).join('\n')}${rest > 0 ? `\n- and ${rest} more` : ''}\n\n`)
      }
    }
  }, [taskHandoffOf, taskLaneOf, taskPathsOf, refreshTaskHandoffs, patchWorkItem, selectOnly, onFocusPanel])

  const openPr = useCallback(async (itemId: string): Promise<void> => {
    if (mergedRef.current) return
    const item = workItemsRef.current.find((i) => i.id === itemId)
    if (item === undefined) return
    const mate = item.teammateId === undefined ? undefined : teammatesRef.current?.find((t) => t.id === item.teammateId)
    const connected = credentialRows.some((c) => c.service === 'github' && c.rejectedAt === undefined)
    const lanes = await window.canvas.worktree.list()
    const lane = lanes.find((w) => w.id === item.worktreeId)
    const standing = lane === undefined ? undefined : await window.canvas.board.laneStatus({ path: lane.path, root: lane.root })
    const refusal = prRefusal(item, standing, connected, mate)
    if (refusal !== null || lane === undefined || item.teammateId === undefined || item.panelId === undefined || item.key === undefined) { patchWorkItem(itemId, { note: refusal ?? 'no lane yet — dispatch the item first' }); return }
    const repo = repoOfKey(item.key)
    if (repo === null) return
    const body = [`Dispatched from the Terminal Canvas board.`, item.url === undefined ? '' : `Closes ${item.url}`, item.description ?? ''].filter((l) => l !== '').join('\n\n')
    const result = await window.canvas.board.openPr({ itemId, panelId: item.panelId, teammateId: item.teammateId, worktreeId: lane.id, repo, title: item.title, body })
    if (result.kind === 'opened' || result.kind === 'exists') {
      patchWorkItem(itemId, { pr: { number: result.number, url: result.url }, state: WORK_ITEM_STATES[2] as PersistedWorkItem['state'], note: undefined })
      return
    }
    if ('reason' in result) patchWorkItem(itemId, { note: `${result.kind === 'push-failed' ? 'push failed — ' : ''}${result.reason}` })
  }, [credentialRows, patchWorkItem])
  const commentPr = useCallback(async (itemId: string): Promise<void> => {
    const item = workItemsRef.current.find((i) => i.id === itemId)
    if (item === undefined || item.pr === undefined || item.key === undefined || item.panelId === undefined || item.teammateId === undefined) return
    const repo = repoOfKey(item.key)
    const number = /#(\d+)$/.exec(item.key)
    if (repo === null || number === null) return
    const result = await window.canvas.board.commentPr({ panelId: item.panelId, teammateId: item.teammateId, repo, number: Number(number[1]), body: `Pull request: ${item.pr.url}` })
    // A success is not a note (a note is what went wrong, or what to do next); the refusal is.
    patchWorkItem(itemId, { note: result.kind === 'commented' ? undefined : result.reason })
  }, [patchWorkItem])
  /**
   * M115. `done` is the USER's. On a GitHub item with a PR the comment is
   * offered as a second card and declining it still marks done. A Jira item
   * marks done here and moves in Jira from its ticket row (M24's transition
   * list) — recorded as the owed follow-up rather than a second Jira write.
   */
  const markDone = useCallback((itemId: string): void => {
    const item = workItemsRef.current.find((i) => i.id === itemId)
    if (item === undefined) return
    const laneOpen = item.panelId !== undefined && item.state === WORK_ITEM_STATES[1] && panelsRef.current.some((p) => p.rect.id === item.panelId)
    patchWorkItem(itemId, { state: WORK_ITEM_STATES[3] as PersistedWorkItem['state'], note: laneOpen ? 'lane still open — close the chat to stop it' : undefined })
    if (item.source === 'github' && item.pr !== undefined) {
      setInputMode({ kind: 'confirm', label: `Comment the PR on ${item.key ?? 'the issue'}?`, initial: '', submit: () => { void commentPr(itemId) } })
      palette.openPalette()
    }
  }, [patchWorkItem, commentPr, palette])
  boardVerbsRef.current.openPr = (itemId) => { void openPr(itemId) }
  boardVerbsRef.current.commentPr = (itemId) => { void commentPr(itemId) }
  boardVerbsRef.current.markDone = markDone
  // M202 (D07). The fourth door's landing point: the palette row, the agent
  // line and an action node all reach the card's own Review through here.
  boardVerbsRef.current.review = reviewTaskLane
  // M203 (D08). SHOW THIS TASK. Membership is derived at PRESS time from what
  // the canvas already holds — the DISPLAYED panels (an anchored card's
  // derived rect, a merged lane's synthetic one), the board, the worktree
  // rows, the runs and the live cwds — and framed through the camera TRAIL.
  // A camera move and nothing else: no selection, no focus, no tier change,
  // no geometry, so no session can be reached from here.
  boardVerbsRef.current.show = (panelId: string) => {
    const shown = displayPanelsRef.current
    const items = workItemsRef.current
    const memberships = taskMemberships(shown, items)
    const target = showTaskTarget(panelId, shown, memberships, Object.fromEntries(items.map((i) => [i.id, i.title])))
    if (target.kind === 'refused') return target
    frameRects(target.rects)
    const title = items.find((i) => i.id === target.itemId)?.title ?? target.itemId
    const gone = missingSentence(target.missing)
    // `partial` is what a SURFACE keys on: the card and the palette row say
    // nothing when the whole task was framed — the camera move IS the answer,
    // and `say` opens the palette, which would sit over the very task just
    // shown and swallow Cmd+[ (task.show.1's first run) — and speak only when
    // part of the task is gone. The agent door reports the note either way.
    return { kind: 'ran', note: `showing ${target.rects.length} panel${target.rects.length === 1 ? '' : 's'} of ${title}${gone === '' ? '' : ` — ${gone}`}`, ...(gone === '' ? {} : { partial: true as const }) }
  }
  // M204 (D08). SHOW RELATED — the lens on, or off for the task already
  // shown. Resolution is show-task's (a card, or the one task a member is in).
  boardVerbsRef.current.related = (panelId: string) => {
    const shown = displayPanelsRef.current
    const items = workItemsRef.current
    const target = showTaskTarget(panelId, shown, taskMemberships(shown, items), Object.fromEntries(items.map((i) => [i.id, i.title])))
    if (target.kind === 'refused') return target
    const title = items.find((i) => i.id === target.itemId)?.title ?? target.itemId
    if (relatedItemId === target.itemId) { setRelatedItemId(null); return { kind: 'ran', note: `stopped showing what is related to ${title}` } }
    setRelatedItemId(target.itemId)
    return { kind: 'ran', note: `showing what is related to ${title} — ${target.rects.length} panel${target.rects.length === 1 ? '' : 's'}; nothing moved` }
  }
  // M204 (D08). FRAME and ARRANGE, keyed by the ITEM. The verbs resolve a
  // panel to its task first; the lens bar already knows its task and calls
  // these directly — acting through a proxy panel could pick one that
  // belongs to two tasks and refuse under a bar naming one (M204's critic).
  const frameItem = (itemId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const shown = displayPanelsRef.current
    const membership = taskMemberships(shown, workItemsRef.current).find((m) => m.itemId === itemId)
    const ids = new Set(membership?.members.map((m) => m.panelId) ?? [])
    const rects = shown.filter((q) => ids.has(q.rect.id)).map((q) => q.rect)
    if (rects.length === 0) return { kind: 'refused', reason: 'no panel of this task is on the canvas — its card and its conversation are closed' }
    frameRects(rects)
    return { kind: 'ran' }
  }
  // ARRANGE THIS TASK — `arrangePlan` decides, one history entry writes. A
  // dispatched card is a FOLLOWER of its conversation (its rect is derived
  // from the anchor every render), so only the leader's rect is written and
  // the card comes with it; an undo of the entry restores both.
  const arrangeItem = (itemId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    if (mergedRef.current) return { kind: 'refused', reason: 'leave the merged view to arrange — its geometry is not this canvas\'s to write' }
    const shown = displayPanelsRef.current
    const items = workItemsRef.current
    const membership = taskMemberships(shown, items).find((m) => m.itemId === itemId)
    if (membership === undefined) return { kind: 'refused', reason: 'this task is no longer on the board' }
    const followers = items.flatMap((i) => i.anchor === undefined ? [] : shown.filter((q) => isWorkPanel(q) && q.work.itemId === i.id).map((q) => ({ id: q.rect.id, leaderId: i.anchor!.panelId, dx: i.anchor!.dx, dy: i.anchor!.dy })))
    // A COLLAPSED group was folded on purpose; its members are obstacles here,
    // not panels this verb may pull out of the fold (M204's critic).
    const folded = new Set(groups.filter((g) => g.collapsed === true).flatMap((g) => g.panelIds))
    const plan = arrangePlan({ memberIds: membership.members.map((m) => m.panelId), panels: shown, followers, fixedIds: folded })
    if (plan.kind === 'refused') return plan
    const moved = new Map(plan.rects.map((r) => [r.id, r]))
    // The file's commit protocol: MOVE through `setPanels` and push the entry
    // from inside its updater (`tidyPanels`, onSpawn, a drag). `commitHistory`
    // alone only records an undo entry — `history` is separate state whose
    // value this component never reads — so the first cut answered `arranged
    // 2 panels`, framed where they would have gone, and moved nothing.
    // `task.arrange.1` found it on screen; no pure check can.
    setPanels((prev) => {
      const next = prev.map((q) => { const r = moved.get(q.rect.id); return r === undefined || (r.x === q.rect.x && r.y === q.rect.y) ? q : { ...q, rect: { ...q.rect, x: r.x, y: r.y } } })
      if (next.every((q, i) => q === prev[i])) return prev
      commitHistory(next)
      return next
    })
    // The block can slide clear of a band of panels and land off screen, so
    // the camera FOLLOWS it — through the trail, so Cmd+[ goes back (M204's
    // critic: a task that silently left the view is the disappearance this
    // repo refuses everywhere else).
    const carried = followers.filter((f) => moved.has(f.leaderId)).flatMap((f) => { const lead = moved.get(f.leaderId)!; const own = shown.find((q) => q.rect.id === f.id); return own === undefined ? [] : [{ ...own.rect, x: lead.x + f.dx, y: lead.y + f.dy }] })
    frameRects([...plan.rects, ...carried])
    const title = items.find((i) => i.id === itemId)?.title ?? itemId
    return { kind: 'ran', note: `arranged ${plan.rects.length} panel${plan.rects.length === 1 ? '' : 's'} of ${title} — one undo puts them back` }
  }
  boardVerbsRef.current.arrange = (panelId: string) => {
    if (mergedRef.current) return { kind: 'refused', reason: 'leave the merged view to arrange — its geometry is not this canvas\'s to write' }
    const shown = displayPanelsRef.current
    const items = workItemsRef.current
    const target = showTaskTarget(panelId, shown, taskMemberships(shown, items), Object.fromEntries(items.map((i) => [i.id, i.title])))
    return target.kind === 'refused' ? target : arrangeItem(target.itemId)
  }
  // M258. FIT TASK — the four doors' landing point (the HUD button, the
  // `task.fit` row, `tc plan fit-task`, an action node). The ACTIVE task is
  // the lens's when one is lit, else the one task of the single selected
  // panel (or the focused one). M264: a successful frame also lights the
  // sticky related lens so stage and camera agree — Show related or Fit task
  // are the stage entrances; no soft follow.
  boardVerbsRef.current.fitTask = () => {
    const shown = displayPanelsRef.current
    const items = workItemsRef.current
    const selected = selectedIdsRef.current
    const panelId = selected.size === 1 ? [...selected][0] : (focusedIdRef.current ?? undefined)
    const target = fitTaskTarget({ lensItemId: relatedItemId, ...(panelId === undefined ? {} : { panelId }), panels: shown, memberships: taskMemberships(shown, items), titles: Object.fromEntries(items.map((i) => [i.id, i.title])) })
    if (target.kind === 'refused') return target
    setRelatedItemId(target.itemId)
    frameRects(target.rects)
    const title = items.find((i) => i.id === target.itemId)?.title ?? target.itemId
    return { kind: 'ran', note: `fitted ${target.rects.length} panel${target.rects.length === 1 ? '' : 's'} of ${title}` }
  }
  // The HUD's disabled state is the CHEAP half of that decision — is there
  // any task context at all — so no membership is derived per render; a
  // panel in no task still refuses by name on press.
  const fitTaskContext = relatedItemId !== null || selectedIds.size === 1 || focusedId !== null

  /**
   * What the COMPONENT still needs by name. `dispatchWorkItem`, `openPr` and
   * `commentPr` are deliberately absent: every door reaches those through
   * `boardVerbsRef` (the palette, the agent lines, the action nodes), and
   * returning them as well would put a second, unused name on a verb that
   * already has exactly one way in.
   */
  return { patchWorkItem, taskContextFor, markDone, frameItem, arrangeItem, fitTaskContext }
}
