/**
 * The board, tasks and the panes.
 *
 * Work items and the ONE Start work action every door routes into, plus the
 * task verbs Canvas installs through `boardVerbsRef` and the navigator panes
 * each view opens.
 *
 * One slice of `usePaletteActions`. Every body here is the one that lived in
 * that file before the split, moved verbatim — see `./types.ts` for why `ctx.self`
 * is the object under construction rather than a getter.
 */

import { claudeAvailable, codexAvailable } from '@renderer/palette/commands'
import { WORK_ITEM_STATES, upsertWorkItem, workItemRefusal, type PersistedWorkItem } from '@shared/work-items'
import { repoOfKey } from '@shared/work-items'
import { startWorkNeeds, type StartWorkOutcome, type StartWorkRepo } from '@renderer/palette/start-work'
import { getChat } from '@renderer/chat/chat-store'
import { isWorkPanel, isChatPanel } from '@renderer/panels/panels'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type BoardActions = Pick<PaletteActions,
  | 'reviewTask'
  | 'showTask'
  | 'showRelated'
  | 'arrangeTask'
  | 'fitTask'
  | 'addWorkItem'
  | 'beginStartWork'
  | 'startWork'
  | 'startSwarm'
  | 'beginNewWorkItem'
  | 'dispatchWorkItem'
  | 'openPr'
  | 'commentPr'
  | 'markDone'
  | 'openBoard'
  | 'openTeammates'
  | 'openReview'
  | 'reviewAcross'
  | 'openGithub'
  | 'openJira'
  | 'openMemory'
  | 'openFile'
  | 'newNote'
  | 'beginWatcher'
>

export function boardActions(ctx: ActionCtx): BoardActions {
  const {
    palette, panelsRef, presetRows, settingRows, worldCentre, openReview, openFilePanel,
    openJiraPanel, openMemoryPanel, openGithubPanel, openReviewAcross, beginWatcher,
    beginNewNote, setPanels, setInputMode, teammatesRef, chooseNavigator, workItemsRef,
    setWorkItems, boardVerbsRef, self
  } = ctx
  return ({
    // M202 (D07). ONE action, four doors — the card's verb, the palette row,
    // the agent line and an action node all land here, the way M197 made
    // every Start work door land on one. The panel is resolved to its ITEM
    // here rather than by each door, so a card whose item left the board
    // refuses in one sentence instead of four.
    reviewTask: (panelId) => {
      const panel = panelsRef.current.find((p) => p.rect.id === panelId)
      if (panel === undefined) return { kind: 'refused', reason: `there is no panel ${panelId} on this canvas` }
      if (!isWorkPanel(panel)) return { kind: 'refused', reason: `${panelId} is not a work card — a task review needs one` }
      return boardVerbsRef.current?.review?.(panel.work.itemId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' }
    },
    // M203 (D08). Canvas owns every fact membership reads (the runs, the live
    // cwds, the worktree rows), so this delegates the way `reviewTask` does
    // rather than widening this hook's deps with four more.
    showTask: (panelId) => boardVerbsRef.current?.show?.(panelId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    // M204 (D08). The same delegation, for the same reason.
    showRelated: (panelId) => boardVerbsRef.current?.related?.(panelId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    arrangeTask: (panelId) => boardVerbsRef.current?.arrange?.(panelId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    // M258. Fit task reads the lens and the selection, both Canvas's.
    fitTask: () => boardVerbsRef.current?.fitTask?.() ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    // M113. The dedupe lives in upsertWorkItem; the id the caller gets back is
    // the SURVIVING one, which for a second `Add to board` is the first's.
    addWorkItem: (item) => {
      const id = item.id ?? `wi${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
      const next = upsertWorkItem(workItemsRef.current ?? [], { ...item, id }, Date.now())
      setWorkItems(next)
      // M197. The MIRROR is made current here, not left to the next render.
      // `workItemsRef.current = workItems` is a render-time assignment, so a
      // caller that adds an item and acts on it in the same tick — which is
      // exactly what the start flow's submit does, minting the typed task and
      // then starting it — reads a list the new item is not in yet, and the
      // start refuses with `no work item is called <id>`. The render-time
      // assignment then writes this same value again; making it current
      // sooner cannot make it wrong.
      workItemsRef.current = next
      // The card's rail label is the panel's title, stamped at mint; an update through the dedupe moves it too, or the rail reads yesterday's title beside today's card.
      setPanels((current) => current.map((p) => { const wid = isWorkPanel(p) ? p.work.itemId : undefined; const rec = wid === undefined ? undefined : next.find((i) => i.id === wid); return rec === undefined || p.title === rec.title ? p : { ...p, title: rec.title } }))
      const identity = item.key === undefined ? undefined : next.find((i) => i.source === item.source && i.key === item.key)
      return identity === undefined ? id : identity.id
    },
    /**
     * M197 (D05). START WORK — the ONE action, and every door is a route
     * into it: the palette row, the card's menu, the Teammates-pane drop and
     * the agent's `dispatch` verb all land here.
     *
     * It asks only for what it cannot derive. `startWorkNeeds` answers which
     * of the triple is missing, and an EMPTY answer dispatches with NO SHEET
     * at all — which is what keeps M114's one-gesture drop a one-gesture
     * drop. The sheet opens only when something is genuinely unknown.
     *
     * The task is minted here when there is none (the typed door), through
     * the SAME `addWorkItem` dedupe every other board door takes, so a start
     * on an item already on the board updates it rather than minting a twin.
     */
    beginStartWork: (opts) => {
      const openSheet = (title: string, titleFixed: boolean, wanted: string | null, itemId: string | undefined, teammateId: string | undefined): void => {
        const item = itemId === undefined ? undefined : (workItemsRef.current ?? []).find((i) => i.id === itemId)
        setInputMode({
          kind: 'start',
          label: 'Start work',
          verb: 'start',
          initial: '',
          submit: () => undefined,
          start: {
            title,
            titleFixed,
            wanted,
            teammates: teammatesRef.current ?? [],
            ...(teammateId === undefined ? {} : { teammateId }),
            // M275. What an ARRANGEMENT needs to judge itself, read at open:
            // whether any CLI can take a seat at all, the card's own state,
            // and the ceiling — so the sheet can say who would queue before
            // Enter rather than after the fourth agent has already started.
            agentAvailable: claudeAvailable(presetRows) || codexAvailable(presetRows),
            ...(item === undefined ? {} : { itemState: item.state }),
            ceiling: {
              maxConcurrent: Number(settingRows.find((r) => r.id === 'agents.maxConcurrent')?.value ?? 0),
              liveAgents: panelsRef.current.filter((p) => isChatPanel(p) && (getChat(p.rect.id).snapshot?.status === 'streaming' || getChat(p.rect.id).snapshot?.status === 'starting')).length,
              queued: panelsRef.current.reduce((n, p) => n + (isChatPanel(p) ? (getChat(p.rect.id).snapshot?.queued ?? 0) : 0), 0)
            },
            ...(opts?.swarm === undefined ? {} : { swarm: opts.swarm }),
            repositories: (id) => window.canvas.board.repositories({ teammateId: id }),
            submit: async (choice) => {
              // The task is minted only once the triple is answered: a sheet
              // the user escapes must leave no card behind, the same rule
              // M149 reached for `New workspace from` (an Escape used to
              // strand the user in an empty workspace).
              const id = itemId ?? self.addWorkItem({ source: 'typed', title: choice.title, state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] })
              // ONE route in, two executors out. The arrangement decides which,
              // and nothing else does: a swarm that fell through to `startWork`
              // would open one lane and report `started`, which is the silent
              // half of a feature that looks like it ran.
              const outcome = choice.swarm === undefined
                ? await self.startWork(id, choice.teammateId, choice.root)
                : await self.startSwarm(id, choice.teammateId, choice.root, choice.swarm)
              return outcome.kind === 'started' ? { kind: 'started' } : { kind: 'refused', reason: outcome.reason }
            },
            openTeammates: () => chooseNavigator('teammates'),
            // M262. The expert route, offered only on the TYPED door: a start
            // from a card is about that card, and a raw panel would drop it.
            ...(itemId === undefined ? { openPanel: () => self.beginSpawnSheet() } : {})
          }
        })
        palette.openPalette()
      }
      const item = opts?.itemId === undefined ? undefined : (workItemsRef.current ?? []).find((i) => i.id === opts.itemId)
      const title = item?.title ?? opts?.title ?? ''
      const wanted = item?.key === undefined ? null : repoOfKey(item.key)
      const teammateId = opts?.teammateId
      // With no teammate chosen there is nothing to read and nothing to
      // derive: the sheet opens on the question it can answer.
      // M275. An ARRANGEMENT always opens the sheet, even when the triple is
      // complete. The empty-needs fast path exists so M114's one-gesture drop
      // stays one gesture; a shape that opens five panels, two worktrees and
      // three handoffs is not that, and the seats must be stated before any
      // of them is minted (the sheet's own standing rule).
      if (teammateId === undefined || item === undefined || opts?.swarm !== undefined) { openSheet(title, item !== undefined, wanted, item?.id, teammateId); return }
      void window.canvas.board.repositories({ teammateId }).then((answer) => {
        const repos: readonly StartWorkRepo[] = answer.kind === 'repos' ? answer.repos : []
        const needs = startWorkNeeds({ title, teammateId }, { teammates: teammatesRef.current ?? [], repos, wanted })
        if (needs.length > 0) { openSheet(title, true, wanted, item.id, teammateId); return }
        void self.startWork(item.id, teammateId)
      })
    },
    /** M197. The executor, unchanged in shape: the same `dispatchWorkItem` every door already ran through, now answering. */
    startWork: async (itemId, teammateId, root): Promise<StartWorkOutcome> =>
      (await boardVerbsRef.current?.dispatch?.(itemId, teammateId, root)) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    /** M275. The arrangement's executor — Canvas's, installed the same way, and a no-op refusal before it is installed rather than a throw. */
    startSwarm: async (itemId, teammateId, root, preset): Promise<StartWorkOutcome> =>
      (await boardVerbsRef.current?.swarm?.(itemId, teammateId, root, preset)) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    beginNewWorkItem: () => {
      setInputMode({
        kind: 'text',
        label: 'New work item — a title',
        initial: '',
        submit: (value) => {
          const refusal = workItemRefusal(value)
          if (refusal !== null) { setInputMode({ kind: 'text', label: refusal, initial: value, submit: () => undefined }); return }
          const id = `wi${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
          setWorkItems((current) => upsertWorkItem(current, { id, source: 'typed', title: value.trim(), state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] }, Date.now()))
          setInputMode(null)
        }
      })
      palette.openPalette()
    },
    // M114/M115. Installed by Canvas; a verb asked before install is a no-op, never a throw.
    dispatchWorkItem: (itemId, teammateId, root) => boardVerbsRef.current?.dispatch?.(itemId, teammateId, root),
    openPr: (itemId) => boardVerbsRef.current?.openPr?.(itemId),
    commentPr: (itemId) => boardVerbsRef.current?.commentPr?.(itemId),
    markDone: (itemId) => boardVerbsRef.current?.markDone?.(itemId),
    // M116. A view, like openTeammates.
    openBoard: () => chooseNavigator('board'),
    // M100. The roster's door: the navigator's pane, chosen the way the dock chooses it.
    openTeammates: () => chooseNavigator('teammates')
    ,
    openReview,
    reviewAcross: (id) => openReviewAcross(id),
    openGithub: () => openGithubPanel(),
    openJira: () => openJiraPanel(),
    // M83. The project memory for the captured panel's repository — resolved
    // by MAIN (only it knows what a directory's repository root is), so the
    // node's subject is the same root `tc memory` writes under.
    openMemory: () => { void openMemoryPanel() },

    /**
     * The palette's door onto a file panel: main owns the native open dialog,
     * so this is an invoke rather than anything the renderer can put on
     * screen itself.
     *
     * A null reply is a CANCEL and must mint nothing — the one outcome a
     * dialog has that a click does not, and the one an unchecked `then` would
     * turn into a panel pointed at the empty string. The camera's own centre
     * is the placement, exactly as a menu-driven spawn uses worldCentre():
     * there is no cursor to land under, because the gesture ended in a
     * separate window.
     */
    openFile: () => {
      void window.canvas.file.open().then((path) => {
        if (path === null) return
        openFilePanel(path, worldCentre())
      })
    },
    newNote: () => beginNewNote(),
    beginWatcher
  })
}
