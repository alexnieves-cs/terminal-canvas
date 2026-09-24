import { useCallback, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  addLink, cascadeCentre, isChatPanel, isTerminalPanel, isWatcherPanel, isWorkPanel, makeChatPanel, makePanel, makeWatcherPanel, WATCHER_H,
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
import { insideDirectory } from '@shared/work-scope'
import { dispatchMessage, prBody, suggestCheckCommand, watcherArgv, type PrEvidence } from '@shared/task-flow'
import { prepareFailureLine, setupBrief, type PrepareResult, type RepoSetup } from '@shared/repo-setup'
import { portableRecipeFromTask, recipeMessage } from '@shared/recipes'
import { preflightTools, recipePreflight, recipeTexts } from '@shared/recipe-portability'
import { outward } from '@shared/outward'
import { BACKENDS, backendOf, carryBackend } from '@shared/agent-backends'
import { adoptedRunId, beginRun, mintRunId, recordOrchEvent, runOfTask } from '../orchestration/orch-record'

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
  /** M324. Open the focus view of the task a card or member panel belongs to. */
  focus?: (panelId: string) => VerbOutcome
  /** M326. Open a task's focus view by its item — where a task a person just started lands. */
  focusItem?: (itemId: string) => void
  /**
   * Decision queue. The ONE task a panel belongs to, or undefined for none or
   * several — so an answered request is filed under its task. A task
   * timeline read filters events by `itemId`, so a row without one never
   * shows up in the task's history.
   */
  taskOfPanel?: (panelId: string) => string | undefined
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
  /**
   * 5.3. The palette's Start work door, by REF: the palette is built below
   * this hook, and a ref keeps `taskContextFor`'s identity stable so the
   * review node's memo still holds.
   */
  startWorkRef: MutableRefObject<{ beginStartWork(opts: { itemId: string }): void } | null>

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
    startWorkRef, relatedItemId, setRelatedItemId
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
    // M319. The card's backend (absent is claude). The sheet judged it against
    // the task; this is the executor's own gate for the doors with no sheet
    // (the one-gesture drop, a re-dispatch): a CLI discovery did not find, or
    // an arrangement on a backend that cannot carry a seat's role, refuses
    // HERE — before a worktree exists — rather than after the agent starts.
    const backend = backendOf(item)
    if (swarm !== undefined && !BACKENDS[backend].appendsPrompt && standingPanel === undefined) {
      const reason = `${BACKENDS[backend].reasons.noPrompt} — choose claude for an arrangement`
      patch({ note: reason })
      return { kind: 'refused', reason }
    }
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
    // M312. PREPARATION, BEFORE THE AGENT — the repository's SAVED setup runs
    // its install steps in the lane, and a failure stops the start here with
    // the step, its exit and its own last line on the card (each step's whole
    // output is a check-output record). An agent handed a broken environment
    // "repairs" it, usually by editing the wrong thing. No saved setup is the
    // old start, unchanged.
    let prepared: PrepareResult | null = null
    let setup: RepoSetup | null = null
    if (panel === undefined) {
      patch({ note: 'preparing the lane with the repository setup…' })
      const read = await window.canvas.setup.read(lane.path).catch(() => null)
      setup = read?.kind === 'saved' ? read.setup : null
      // M321. PREFLIGHT, the executor's own gate — the sheet ran the same
      // check, but the one-gesture drop and a re-dispatch open no sheet. The
      // tools the setup and the checks invoke must be on the login PATH, the
      // setup the recipe needs must be saved, and no placeholder may reach a
      // shell unfilled; a failure stops the start before any setup step runs
      // and before an agent exists.
      const card = workItemsRef.current.find((i) => i.id === itemId) ?? item
      const setupFor = read === null || read.kind === 'not-a-repo' ? null : read
      const wanted = preflightTools({ checks: card.checks ?? [], ...(card.recipeUsed === undefined ? {} : { recipe: card.recipeUsed.definition }), setup: setupFor })
      const probe = typeof window.canvas.setup.preflight === 'function'
        ? await window.canvas.setup.preflight({ root: lane.path, tools: wanted.map((t) => t.tool) }).catch(() => null)
        : null
      const pre = recipePreflight({
        checks: card.checks ?? [],
        ...(card.recipeUsed === undefined ? {} : { recipe: card.recipeUsed.definition }),
        texts: recipeTexts({ brief: card.brief ?? '', criteria: card.criteria ?? [], checks: card.checks ?? [], deliverables: card.deliverables ?? [] }),
        renderContext: { repository: lane.path, ...(card.recipeUsed?.params === undefined ? {} : { params: card.recipeUsed.params }) },
        setup: setupFor,
        tools: probe?.tools ?? {},
        ports: probe?.ports ?? null
      })
      if (pre.blocked !== undefined) {
        const reason = `Not started — ${pre.blocked}`
        patch({ note: reason })
        return { kind: 'refused', reason }
      }
      if (setup !== null) {
        prepared = await window.canvas.setup.prepare({ lane: lane.path }).catch((e: unknown) => ({ kind: 'unreadable' as const, detail: e instanceof Error ? e.message : String(e) }))
        const failed = prepareFailureLine(prepared)
        if (failed !== null) {
          patch({ note: failed })
          const bad = 'steps' in prepared ? prepared.steps.find((st) => st.exitCode !== 0) : undefined
          void recordOrchEvent({
            runId: mintRunId(), itemId, event: 'check', source: 'app',
            title: 'Preparation failed', detail: failed,
            // The failed step's output record, by id, so a reader can open it.
            ...(bad?.outputId === undefined ? {} : { key: `setup-output:${bad.outputId}` })
          })
          return { kind: 'refused', reason: failed }
        }
      }
      patch({ note: 'the lane is ready, but the conversation has not been created yet' })
    }
    if (panel === undefined) {
      const sessionId = crypto.randomUUID()
      // M275. A swarm's PRIMARY seat is still a dispatched lane — it takes the
      // item's `panelId` and its worktree — but its brief is the seat's, not
      // the generic one: an explorer told to commit as it goes is an explorer
      // that writes. `swarmSystemPrompt` folds the lane's own rules (never
      // push, never open a PR) back into every seat brief that needs them.
      // M319. A backend with no appended prompt (codex, copilot) gets none —
      // main would drop it silently — and its lane rules ride the first
      // message instead (below). The sheet said so before the start.
      const lanePrompt = swarm === undefined ? DISPATCH_PROMPT : swarmSystemPrompt(swarm, SUPERVISOR_PROMPT)
      const created = await window.canvas.agentSession.create({ id: chatId, cwd: lane.path, sessionId, teammateId, ...carryBackend(item), ...(BACKENDS[backend].appendsPrompt ? { appendSystemPrompt: lanePrompt } : {}) })
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
      const chatPanel = { ...makeChatPanel(chatId, centre, nextZ(before), { cwd: lane.path, sessionId, teammateId, dispatch: true, ...carryBackend(item), ...(swarm === undefined ? {} : { swarm }) }), title: item.key ?? item.title }
      const anchor: PersistedWorkItem['anchor'] = card === undefined ? undefined : { panelId: chatId, dx: card.rect.x - chatPanel.rect.x, dy: card.rect.y - chatPanel.rect.y }
      let next: Panel[] = [...before, chatPanel]
      if (card !== undefined) next = setLinkLabel(addLink(next, card.rect.id, chatId), card.rect.id, chatId, 'dispatched')
      panelsRef.current = next
      setPanels(() => { commitHistory(next); return next })
      panel = chatPanel
      patch({ anchor, note: 'the lane and the conversation are ready, but the first message has not been sent yet' })
      selectOnly(chatId)
    }
    // M310. The brief and the criteria ride the first message: an agent told
    // only a title works to the title, and the review then asks about
    // criteria it never saw (`task-flow.ts`).
    // M312/M314. The recipe's context, checks and deliverables, and the
    // prepared environment (ports, services, the checks the setup declares),
    // read from the item as it stands now — the sheet wrote them after mint.
    const current = workItemsRef.current.find((i) => i.id === itemId) ?? item
    const saved = current.recipeId?.startsWith('mine-') === true ? await window.canvas.recipes.list().catch(() => []) : []
    const composed = dispatchMessage(current, [recipeMessage(current, saved), setupBrief(setup, prepared)])
    // M319. The lane's rules as the message's first section where the CLI
    // has no appended prompt — weaker (no deny list comes with it), and the
    // sheet's fit row said so, but a codex lane told nothing about staying in
    // its worktree is a lane that pushes.
    const message = BACKENDS[backendOf(current)].appendsPrompt ? composed : `## How to work in this lane\n${DISPATCH_PROMPT}\n\n${composed}`
    // M197 (D05). The first send's answer is READ. `send` has a `{ refused }`
    // arm — M82's budget ceiling refuses and STORES NOTHING, by that
    // milestone's own rule — so a dispatch over budget used to leave a chat
    // panel, a worktree and a card marked `todo` with no message anywhere and
    // nothing on screen saying why. The card's own state machine then never
    // reached `working`, because `working` is the runtime's word from a turn
    // that never started. The lane and the chat are real and are KEPT; the
    // note says the send did not happen, which is the recoverable state.
    const sent = await window.canvas.agentSession.send(chatId, message, [])
    const notSent = sendRefusalSentence(sent)
    if (notSent !== null) {
      patch({ note: `the lane and the conversation are ready, but the first message was refused — ${notSent}` })
      return { kind: 'refused', reason: notSent }
    }
    patch({ note: undefined })
    // M300. The dispatch is RECORDED once it has actually happened — after the
    // lane, the conversation and the first send all landed. Every refusal
    // above returns before this line, because a row written when an action was
    // merely offered would put a dispatch in the history of a task nobody
    // dispatched. This is also where the execution's id is minted: a rerun
    // (M302) mints another, so an earlier run's artifacts stay the earlier
    // run's. Not awaited — recording is beside the work, never in front of it.
    const runId = mintRunId()
    beginRun(itemId, runId)
    void recordOrchEvent({
      runId, itemId, panelId: chatId, event: 'dispatch', source: 'person',
      // M320. The conversation's name and vendor, recorded — its transcript is
      // deleted when the chat closes, and this row is what still says who did it.
      producer: { title: item.key ?? item.title, kind: 'chat', ...carryBackend(item) },
      title: `Dispatched ${item.key ?? item.title}`,
      detail: `${teammateId} in ${lane.path}`
    })
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
    // M300. A REVIEW MARK is the moment this app knows which files an
    // execution produced AND that a person accepted them, so it is where the
    // artifact references are recorded — with the content identity the mark
    // was bound to, which is what lets a later reader say whether the files
    // have moved on since. Paths only: the record never copies a file.
    //
    // Only a mark writes a row. Every other patch — a note, a state, a brief
    // edit — passes through here constantly and records nothing, because a
    // row per keystroke is a log, not a history.
    const reviewed = fields.reviewed
    if (reviewed !== undefined && reviewed.files > 0) {
      // `reviewed.files` is a COUNT — the mark records how much was reviewed,
      // not which paths. The paths come from the same read the mark was made
      // against (`taskPathsOf`), so the row's references and the mark's
      // signature describe one review rather than two. When that read is no
      // longer held, the row is still written: the count and the identity are
      // the durable facts, and a row with no paths says so by having none,
      // which the Artifacts tab shows as a run with nothing listed under it.
      const paths = taskPathsOf(itemId)
      // M320. The lane's root rides the row so main can digest each path as it
      // is NOW — the reviewed version a later reader compares against — and the
      // lane's chat is named as the producer, so a closed chat still has a name.
      const card = workItemsRef.current.find((i) => i.id === itemId)
      const lanePanel = card?.panelId === undefined ? undefined : panelsRef.current.find((p) => p.rect.id === card.panelId)
      const laneChat = lanePanel !== undefined && isChatPanel(lanePanel) ? lanePanel : undefined
      void recordOrchEvent({
        runId: runOfTask(itemId) ?? adoptedRunId(itemId), itemId, event: 'artifact', source: 'person',
        ...(laneChat === undefined ? {} : {
          panelId: laneChat.rect.id,
          root: laneChat.chat.cwd,
          producer: { title: laneChat.title ?? card?.title ?? laneChat.rect.id, kind: 'chat', ...carryBackend(laneChat.chat) }
        }),
        title: `Reviewed ${reviewed.files} changed file${reviewed.files === 1 ? '' : 's'}`,
        ...(paths === undefined ? {} : { paths }),
        ...(reviewed.identity === undefined ? {} : { tested: reviewed.identity }),
        at: reviewed.at
      })
    }
  }, [taskPathsOf])
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

  // M310. `openPr` is declared below this callback; the review's Open PR reads
  // it through this ref at press time, never by closure (a TDZ at render).
  const openPrRef = useRef<((itemId: string, evidence?: PrEvidence) => Promise<void>) | null>(null)
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
      },
      // 5.3. The closed-conversation arm of the same button: the Start work
      // sheet for THIS item, which re-uses its lane. It opens a sheet the
      // person confirms — nothing is spawned by the press alone.
      onStartAgain: (id) => { startWorkRef.current?.beginStartWork({ itemId: id }) },
      // M307. The review, together. The brief and the criteria are the
      // person's (M287); the comments and the confirmed criteria are theirs
      // too, and ride the work item so they outlive this node and the chat.
      ...(item.brief === undefined ? {} : { brief: item.brief }),
      ...(item.criteria === undefined ? {} : { criteria: item.criteria }),
      ...(item.criteriaMet === undefined ? {} : { criteriaMet: item.criteriaMet }),
      ...(item.comments === undefined ? {} : { comments: item.comments }),
      // The lane's watchers, by the SAME rule `checksFromWatchers` filters by,
      // so a watcher in a neighbouring lane cannot vouch for this one.
      watchers: panelsRef.current.filter(isWatcherPanel)
        .filter((p) => p.watch.cwd !== '' && insideDirectory(record.path, p.watch.cwd))
        .map((p) => ({ id: p.rect.id, cwd: p.watch.cwd, command: p.watch.command, args: p.watch.args })),
      onToggleCriterion: (id, criterion, met) => {
        const it = workItemsRef.current.find((i) => i.id === id)
        if (it === undefined) return
        const now = new Set(it.criteriaMet ?? [])
        if (met) now.add(criterion)
        else now.delete(criterion)
        // Only criteria that still exist are kept: an edited criterion is unconfirmed.
        patchWorkItem(id, { criteriaMet: (it.criteria ?? []).filter((c) => now.has(c)) })
      },
      onComments: (id, next) => { patchWorkItem(id, { comments: next }) },
      // A HAND-OFF, sent by a person's press after the whole text was shown —
      // dispatch's kind of message, not a template (M80's insert rule is
      // `onDraftFollowUp` below). The refusal is the send's own sentence.
      onSendFollowUp: async (id, text) => {
        const it = workItemsRef.current.find((i) => i.id === id)
        if (it?.panelId === undefined || !panelsRef.current.some((p) => p.rect.id === it.panelId && isChatPanel(p))) return 'the lane\'s conversation is closed'
        try {
          const refusal = sendRefusalSentence(await window.canvas.agentSession.send(it.panelId, text, []))
          if (refusal === null) {
            void recordOrchEvent({
              runId: runOfTask(id) ?? adoptedRunId(it.panelId), event: 'dispatch', source: 'person',
              title: 'Review follow-up sent to the agent', detail: text.split('\n')[0] ?? '', itemId: id, panelId: it.panelId,
              key: 'review-followup'
            })
          }
          return refusal
        } catch (e) {
          return e instanceof Error ? e.message : 'the message could not be sent'
        }
      },
      // M310. The PR, from the review, with the evidence the review gathered.
      ...(item.source === 'github' && item.key !== undefined ? {
        onOpenPr: (id: string, evidence: PrEvidence) => { void openPrRef.current?.(id, evidence) },
        ...(item.pr === undefined ? {} : { pr: item.pr })
      } : {}),
      ...(item.note === undefined ? {} : { note: item.note }),
      // M310. RUN CHECKS in the lane — a watcher in the lane's own directory,
      // run once now and left DISARMED (it re-runs when asked, not on every
      // edit the agent makes). Its runs are the lane's witnessed checks, each
      // with its own output record (M306).
      suggestCheck: async () => {
        // M314/M312. What the task was told decides "done" comes first (its
        // recipe's copy), then the repository's saved checks, then a guess
        // from the lane's files — each joined with && so one watcher runs all.
        const own = workItemsRef.current.find((i) => i.id === itemId)?.checks
        if (own !== undefined && own.length > 0) return own.join(' && ')
        const setup = await window.canvas.setup.read(record.path).catch(() => null)
        if (setup?.kind === 'saved' && setup.setup.checks.length > 0) return setup.setup.checks.join(' && ')
        const listed = await window.canvas.files.list(record.path).catch(() => null)
        if (listed === null || listed.kind !== 'ok') return null
        const names = listed.entries.map((e) => e.name)
        let manifest: string | undefined
        if (names.includes('package.json')) {
          // A one-off read: `file:read` arms a watch by panel id, so the probe
          // id is closed straight after — nothing stays watching.
          const probe = `probe-${itemId}`
          try {
            const got = await window.canvas.file.read({ panelId: probe, path: `${record.path}/package.json` })
            if (got.kind === 'text') manifest = got.content
          } catch { /* no manifest text; the suggestion falls through */ }
          void window.canvas.file.close(probe).catch(() => {})
        }
        return suggestCheckCommand(names, manifest)
      },
      onRunChecks: async (id, command) => {
        // M312. Through the shell when the command needs one (task-flow.ts).
        const argv = watcherArgv(command)
        if (argv === null) return 'type the command that runs this lane\'s checks'
        const it = workItemsRef.current.find((i) => i.id === id)
        const lane = taskLaneOf(id)
        if (it === undefined || lane === undefined) return 'the lane is gone — start the task again'
        const watcherId = `w${nextIdRef.current++}`
        const trigger = { kind: 'path' as const, path: lane.path }
        // Main first, then the run, THEN the panel: the node's own create on
        // mount is idempotent at the id, and a run asked for before main knew
        // the watcher would be dropped with no word.
        const made = await window.canvas.watcher.create({ id: watcherId, cwd: lane.path, command: argv.command, args: argv.args, trigger, armed: false })
        if (!made.ok) return made.reason
        void window.canvas.watcher.run(watcherId)
        const chat = it.panelId === undefined ? undefined : panelsRef.current.find((p) => p.rect.id === it.panelId)
        const centre = chat === undefined
          ? { x: 0, y: 0 }
          : { x: chat.rect.x + chat.rect.w / 2, y: chat.rect.y + chat.rect.h + 40 + WATCHER_H / 2 }
        setPanels((current) => {
          const made = makeWatcherPanel(watcherId, cascadeCentre(centre, current), nextZ(current), { cwd: lane.path, command: argv.command, args: argv.args, trigger })
          const next = [...current, { ...made, title: `checks · ${it.title}`, watch: { ...made.watch, armed: false as const } }]
          panelsRef.current = next
          commitHistory(next)
          return next
        })
        return null
      },
      // M314. What the task promised back, and "Save as recipe" — its outcome,
      // criteria, deliverables and arrangement with the checks that passed.
      ...(item.deliverables === undefined ? {} : { deliverables: item.deliverables }),
      onSaveRecipe: async (id: string, name: string, passedChecks: string[]) => {
        const it = workItemsRef.current.find((i) => i.id === id)
        if (it === undefined) return 'the task is gone'
        const saved = await window.canvas.recipes.list().catch(() => [])
        const chat = it.panelId === undefined ? undefined : panelsRef.current.find((p) => p.rect.id === it.panelId)
        const swarm = chat !== undefined && isChatPanel(chat) ? chat.chat.swarm?.preset : undefined
        // M321. PORTABLE: the task's lane and the repository it was started in
        // are this machine's paths — under them becomes `{repository}`, any
        // other absolute path a named parameter, so the recipe can be taken to
        // another repository without repairing it by hand.
        const laneRoot = chat !== undefined && isChatPanel(chat) ? chat.chat.cwd : undefined
        const setupRoot = laneRoot === undefined ? undefined : await window.canvas.setup.read(laneRoot).then((r) => (r.kind === 'not-a-repo' ? undefined : r.setup.root), () => undefined)
        const roots = [laneRoot, it.recipeUsed?.repository, setupRoot].filter((x): x is string => x !== undefined && x !== '')
        const { recipe } = portableRecipeFromTask(it, { name, passedChecks, now: Date.now(), saved, roots, ...(swarm === undefined ? {} : { swarm }) })
        const r = await window.canvas.recipes.save(recipe)
        return r.ok ? null : r.reason
      },
      // M315. ACCEPTED: the lane landed in the main tree's branch. The task is
      // done — the person's own state to set, and merging is that act — and
      // the note says where it went, so the board card carries the outcome.
      onAccepted: (id, merged) => {
        patchWorkItem(id, { state: 'done', merged: { into: merged.into, sha: merged.sha, at: Date.now() } })
      },
      onDraftFollowUp: (id, text) => {
        const it = workItemsRef.current.find((i) => i.id === id)
        if (it?.panelId === undefined) return
        selectOnly(it.panelId)
        onFocusPanel(it.panelId)
        void deliverToComposer(it.panelId, text)
      }
    }
  }, [taskHandoffOf, taskLaneOf, taskPathsOf, refreshTaskHandoffs, patchWorkItem, selectOnly, onFocusPanel, startWorkRef])

  const openPr = useCallback(async (itemId: string, evidence?: PrEvidence): Promise<void> => {
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
    // M310. The evidence rides the PR when the review gathered it.
    // M310. Through the ONE outward gate: the body now carries check commands
    // and the person's own words, and a command can hold a token.
    const body = outward(prBody(item, evidence), 'pull request body').text
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
  openPrRef.current = openPr
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
