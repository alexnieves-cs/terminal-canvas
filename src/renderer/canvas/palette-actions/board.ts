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

import { backendAvailable, claudeAvailable, codexAvailable } from '@renderer/palette/commands'
import { BACKEND_IDS } from '@shared/agent-backends'
import { WORK_ITEM_STATES, carryWorkItem, upsertWorkItem, workItemRefusal, type PersistedWorkItem } from '@shared/work-items'
import type { IssueChoice } from '@renderer/palette/StartWorkSheet'
import { repoOfKey } from '@shared/work-items'
import { startAgentName, startWorkNeeds, type StartWorkOutcome, type StartWorkRepo } from '@renderer/palette/start-work'
import { getChat } from '@renderer/chat/chat-store'
import { allRecipes } from '@shared/recipes'
import { recipeUse } from '@shared/recipe-portability'
import { isWorkPanel, isChatPanel } from '@renderer/panels/panels'
import type { PaletteActions } from '@renderer/palette/commands'
import { bindFitTask } from '@renderer/canvas/flight'
import type { ActionCtx } from './types'

/**
 * M310. The open issues a task can start FROM — GitHub's and Jira's lists,
 * read through the same doors their nodes use, merged. A service that is not
 * connected contributes nothing; when neither answers, the sheet says why
 * rather than showing an empty list that reads as "you have no issues".
 */
async function readOpenIssues(): Promise<{ kind: 'items'; items: IssueChoice[] } | { kind: 'none'; reason: string }> {
  const [gh, jira] = await Promise.all([
    window.canvas.github.list().catch(() => null),
    window.canvas.jira.list().catch(() => null)
  ])
  const items: IssueChoice[] = [
    ...(gh?.kind === 'items' ? gh.items.map((i) => ({ source: 'github' as const, key: i.id, title: i.title, url: i.url, description: i.description })) : []),
    ...(jira?.kind === 'items' ? jira.items.map((i) => ({ source: 'jira' as const, key: i.id, title: i.title, url: i.url, description: i.description })) : [])
  ]
  if (items.length > 0) return { kind: 'items', items }
  const why = gh !== null && gh.kind !== 'items' ? gh.reason : jira !== null && jira.kind !== 'items' ? jira.reason : 'no open issues were found'
  return { kind: 'none', reason: `no issues — ${why}` }
}

export type BoardActions = Pick<PaletteActions,
  | 'reviewTask'
  | 'showTask'
  | 'showRelated'
  | 'arrangeTask'
  | 'fitTask'
  | 'focusTask'
  | 'addWorkItem'
  | 'beginStartWork'
  | 'beginRepoSetup'
  | 'openInEditor'
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
  bindFitTask(() => { void boardVerbsRef.current?.fitTask?.() })
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
    // M324. The focus view is Canvas's page; the same delegation.
    focusTask: (panelId) => boardVerbsRef.current?.focus?.(panelId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
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
      let recipes = allRecipes([])
      // M400. The launcher's recent folders, offered beside the granted repositories.
      let recents: readonly string[] = []
      const openSheet = (title: string, titleFixed: boolean, wanted: string | null, itemId: string | undefined, teammateId: string | undefined, preferTeammateId?: string): void => {
        const item = itemId === undefined ? undefined : (workItemsRef.current ?? []).find((i) => i.id === itemId)
        setInputMode({
          kind: 'start',
          label: 'New task',
          verb: 'start',
          initial: '',
          submit: () => undefined,
          start: {
            title,
            titleFixed,
            wanted,
            teammates: teammatesRef.current ?? [],
            ...(teammateId === undefined ? {} : { teammateId }),
            ...(preferTeammateId === undefined ? {} : { preferTeammateId }),
            recents,
            // M400. The launcher's Choose… — main's folder dialog.
            chooseFolder: () => window.canvas.teammate.choosePlace(),
            // M275. What an ARRANGEMENT needs to judge itself, read at open:
            // whether any CLI can take a seat at all, the card's own state,
            // and the ceiling — so the sheet can say who would queue before
            // Enter rather than after the fourth agent has already started.
            agentAvailable: claudeAvailable(presetRows) || codexAvailable(presetRows),
            ...(item === undefined ? {} : { itemState: item.state }),
            // M319. What the backend field judges each row against: which
            // CLIs discovery found, the card's own vendor (a re-start keeps
            // it), and the ceilings a backend with no cost cannot report to.
            available: Object.fromEntries(BACKEND_IDS.map((id) => [id, backendAvailable(presetRows, id)])),
            ...(item?.backend === undefined ? {} : { backend: item.backend }),
            budgetUsd: Number(settingRows.find((r) => r.id === 'agents.budgetUsd')?.value ?? 0),
            windowPercent: Number(settingRows.find((r) => r.id === 'agents.budgetWindowPercent')?.value ?? 0),
            ceiling: {
              maxConcurrent: Number(settingRows.find((r) => r.id === 'agents.maxConcurrent')?.value ?? 0),
              liveAgents: panelsRef.current.filter((p) => isChatPanel(p) && (getChat(p.rect.id).snapshot?.status === 'streaming' || getChat(p.rect.id).snapshot?.status === 'starting')).length,
              queued: panelsRef.current.reduce((n, p) => n + (isChatPanel(p) ? (getChat(p.rect.id).snapshot?.queued ?? 0) : 0), 0)
            },
            ...(opts?.swarm === undefined ? {} : { swarm: opts.swarm }),
            ...(item?.brief ?? opts?.brief) === undefined ? {} : { brief: item?.brief ?? opts?.brief },
            ...(item?.criteria ?? opts?.criteria) === undefined ? {} : { criteria: item?.criteria ?? opts?.criteria },
            // M314. The recipes, read at open (built-ins are code; the person's from main).
            recipes,
            ...(opts?.recipeId === undefined ? {} : { recipeId: opts.recipeId }),
            ...(item?.checks === undefined ? {} : { checks: item.checks }),
            ...(item?.deliverables === undefined ? {} : { deliverables: item.deliverables }),
            // M313. A proposal's directory picks its repository once the list is read.
            ...(opts?.preferRoot === undefined ? {} : { preferRoot: opts.preferRoot }),
            // M312. The chosen repository's setup, and the route to edit it.
            setupOf: (root) => window.canvas.setup.read(root),
            // M403 (B5). The existing toolbox reader, for the effective permission mode (no new door).
            toolboxOf: (cwd) => window.canvas.toolbox.read({ panelId: 'start-sheet', cwd }),
            // M321. The preflight's probe: tools on PATH and the next lane's ports, nothing run.
            ...(typeof window.canvas.setup.preflight === 'function' ? { preflightOf: (req: { root: string; tools: readonly string[] }) => window.canvas.setup.preflight(req) } : {}),
            openSetup: (root) => self.beginRepoSetup(root),
            // M310. The flagship start: the connected services' open issues,
            // through the same reads the GitHub and Jira nodes use. Only the
            // typed door asks — a card already IS its issue.
            ...(itemId === undefined ? { issues: readOpenIssues } : {}),
            repositories: (id) => window.canvas.board.repositories({ teammateId: id }),
            submit: async (choice) => {
              // M400 (B1). WHO, when nobody was picked: the launcher's own
              // reuse-or-mint executor (Canvas's `teammateForFolder`) — the
              // repository answer first, a new teammate whose only place is
              // exactly this folder only then, and NOTHING minted (no teammate,
              // no card) on a refusal. So it runs before `addWorkItem` below.
              let teammateId = choice.teammateId
              // M403. The root to start in: a symlinked folder becomes the
              // directory git works in, the one the mint granted.
              let root = choice.root
              if (teammateId === undefined) {
                // M403. A mint is named after the engine the sheet chose (`startAgentName`), as its who line says.
                const who = await boardVerbsRef.current?.teammateFor?.(choice.root, choice.preferTeammateId, startAgentName(choice.backend))
                if (who === undefined) return { kind: 'refused', reason: 'the canvas is not ready yet' }
                if (who.kind !== 'teammate') return { kind: 'refused', reason: who.reason }
                teammateId = who.id
                root = who.root
              }
              // The task is minted only once the triple is answered: a sheet
              // the user escapes must leave no card behind, the same rule
              // M149 reached for `New workspace from` (an Escape used to
              // strand the user in an empty workspace).
              // M310. From an issue, the card IS that issue (the board's dedupe
              // by key, so a second start from it is the same task); the
              // outcome and criteria are the person's, written on the card.
              const words = {
                ...(choice.brief === undefined ? {} : { brief: choice.brief }),
                ...(choice.criteria === undefined ? {} : { criteria: choice.criteria }),
                // M314. The recipe's copy lands on the card; the recipe is not consulted again.
                ...(choice.checks === undefined ? {} : { checks: choice.checks }),
                ...(choice.deliverables === undefined ? {} : { deliverables: choice.deliverables }),
                ...(choice.recipeId === undefined ? {} : { recipeId: choice.recipeId }),
                // M394. A plan drawn as a chart rides onto the card as it is
                // created; its steps are each started by the person (M327).
                ...(opts?.plan === undefined ? {} : { plan: opts.plan }),
                // M319. The chosen backend lands on the card; the executor reads it there.
                // Written even when absent (claude): a card that ran on codex and is
                // re-started on claude must lose its old vendor, and `carryWorkItem`
                // drops an undefined key rather than writing it.
                backend: choice.backend,
                // M321. The EXACT definition this run starts from — kept on the
                // card, never re-read, so editing the recipe later cannot
                // rewrite what this task was started with.
                ...(() => {
                  const r = choice.recipeId === undefined ? undefined : recipes.find((x) => x.id === choice.recipeId)
                  return r === undefined ? {} : { recipeUsed: recipeUse(r, { at: Date.now(), repository: choice.root, ...(choice.recipeParams === undefined ? {} : { params: choice.recipeParams }) }) }
                })()
              }
              const id = itemId ?? (choice.issue !== undefined
                ? self.addWorkItem({ source: choice.issue.source, key: choice.issue.key, title: choice.issue.title, url: choice.issue.url, ...(choice.issue.description === '' ? {} : { description: choice.issue.description }), state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'], ...words })
                : self.addWorkItem({ source: 'typed', title: choice.title, state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'], ...words }))
              if (Object.keys(words).length > 0) {
                // An existing card (or a dedupe hit) keeps its own fields through
                // `upsertWorkItem`; what the person typed here is written on it.
                const next = (workItemsRef.current ?? []).map((i) => (i.id === id ? carryWorkItem({ ...i, ...words, updatedAt: Date.now() }) : i))
                workItemsRef.current = next
                setWorkItems(next)
              }
              // ONE route in, two executors out. The arrangement decides which,
              // and nothing else does: a swarm that fell through to `startWork`
              // would open one lane and report `started`, which is the silent
              // half of a feature that looks like it ran.
              // M394. The chart's shapes learn which step each became, now the card exists.
              opts?.onCreated?.(id)
              const outcome = choice.swarm === undefined
                ? await self.startWork(id, teammateId, root)
                : await self.startSwarm(id, teammateId, root, choice.swarm)
              // M326. The task opens in its workspace once it has started.
              if (outcome.kind === 'started') boardVerbsRef.current?.focusItem?.(id)
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
      // M315. The TYPED door (no card) opens on the teammate the person's most
      // recent task used, when it still exists: a second task on the same
      // repository asked them to choose agent and repository again from blank
      // selects. A card keeps its own rule (its teammate, or the question).
      const recentTeammate = item !== undefined ? undefined : [...(workItemsRef.current ?? [])]
        .filter((i) => i.teammateId !== undefined && (teammatesRef.current ?? []).some((t) => t.id === i.teammateId))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.teammateId
      // M400. The recent teammate is a PREFERENCE (reused when its places hold
      // the folder), never a pick: a pick would gate the folder on it again.
      const teammateId = opts?.teammateId
      // With no teammate chosen there is nothing to read and nothing to
      // derive: the sheet opens on the question it can answer.
      // M275. An ARRANGEMENT always opens the sheet, even when the triple is
      // complete. The empty-needs fast path exists so M114's one-gesture drop
      // stays one gesture; a shape that opens five panels, two worktrees and
      // three handoffs is not that, and the seats must be stated before any
      // of them is minted (the sheet's own standing rule).
      // M314. A recipe opens the sheet (its fields are to be read before a
      // start), after the person's recipes arrive — a slow read costs the
      // saved ones, never the sheet.
      const withRecipes = (open: () => void): void => {
        void Promise.all([
          window.canvas.recipes.list().then((saved) => { recipes = allRecipes(saved) }, () => undefined),
          window.canvas.spawn.recent().then((r) => { recents = r }, () => undefined)
        ]).finally(open)
      }
      if (teammateId === undefined || item === undefined || opts?.swarm !== undefined || opts?.recipeId !== undefined) { withRecipes(() => openSheet(title, item !== undefined, wanted, item?.id, teammateId, recentTeammate)); return }
      void window.canvas.board.repositories({ teammateId }).then((answer) => {
        const repos: readonly StartWorkRepo[] = answer.kind === 'repos' ? answer.repos : []
        const needs = startWorkNeeds({ title, teammateId }, { teammates: teammatesRef.current ?? [], repos, wanted })
        if (needs.length > 0) { withRecipes(() => openSheet(title, true, wanted, item.id, teammateId)); return }
        void self.startWork(item.id, teammateId).then((o) => { if (o.kind === 'started') boardVerbsRef.current?.focusItem?.(item.id) })
      })
    },
    /** M197. The executor, unchanged in shape: the same `dispatchWorkItem` every door already ran through, now answering. */
    startWork: async (itemId, teammateId, root): Promise<StartWorkOutcome> =>
      (await boardVerbsRef.current?.dispatch?.(itemId, teammateId, root)) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    /** M275. The arrangement's executor — Canvas's, installed the same way, and a no-op refusal before it is installed rather than a throw. */
    startSwarm: async (itemId, teammateId, root, preset): Promise<StartWorkOutcome> =>
      (await boardVerbsRef.current?.swarm?.(itemId, teammateId, root, preset)) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    /**
     * M312. THE REPOSITORY SETUP SHEET for a directory's repository — the
     * captured panel's cwd when none is named. Main answers the saved record
     * or a detected draft; saving is the person's decision (repo-setup.ts).
     */
    beginRepoSetup: (cwd) => {
      const panel = cwd === undefined ? panelsRef.current.find((p) => p.rect.id === palette.capturedId) : undefined
      // The panel's own directory by kind: a chat's and a terminal's cwd, a watcher's, a file's folder.
      const own = panel as { chat?: { cwd?: string }; spec?: { cwd?: string }; watch?: { cwd?: string }; source?: { path?: string } } | undefined
      const dir = cwd ?? own?.chat?.cwd ?? own?.watch?.cwd ?? (own?.source?.path?.replace(/\/[^/]*$/, '') || undefined) ?? own?.spec?.cwd
      if (dir === undefined || dir === '') {
        setInputMode({ kind: 'text', label: 'Repository setup — the folder of the repository', verb: 'open', initial: '', submit: (value) => { if (value.trim() !== '') self.beginRepoSetup(value.trim()) } })
        palette.openPalette()
        return
      }
      void window.canvas.setup.read(dir).then((read) => {
        setInputMode({
          kind: 'setup',
          label: 'Repository setup',
          initial: '',
          submit: () => undefined,
          setup: {
            read,
            save: async (setup) => {
              const r = await window.canvas.setup.save(setup)
              return r.ok ? { ok: true } : { ok: false, reason: r.reason }
            }
          }
        })
        palette.openPalette()
      })
    },
    /**
     * M313. OPEN IN EDITOR — the given path, else the captured panel: a file
     * panel's file, else the folder its conversation, terminal or watcher
     * works in (for a lane, the worktree). Silent when it opened; a refusal,
     * or a fallback that dropped the line, is said in the palette.
     */
    openInEditor: (target, panelId) => {
      const subject = panelId ?? palette.capturedId
      const panel = target === undefined ? panelsRef.current.find((p) => p.rect.id === subject) : undefined
      const own = panel as { chat?: { cwd?: string }; spec?: { cwd?: string }; watch?: { cwd?: string }; source?: { path?: string } } | undefined
      const file = own?.source?.path
      const dir = own?.chat?.cwd ?? own?.watch?.cwd ?? own?.spec?.cwd
      const t = target ?? (file !== undefined ? { path: file } : dir !== undefined && dir.startsWith('/') ? { path: dir, dir: true } : undefined)
      const say = (label: string): void => {
        setInputMode({ kind: 'text', label, feedback: true, verb: 'close', initial: '', submit: () => setInputMode(null) })
        palette.openPalette()
      }
      if (t === undefined) { say('Select a file, a conversation or a terminal first — Open in editor opens what it works on'); return }
      void window.canvas.editor.open(t).then((r) => {
        if (r.kind === 'refused') say(r.reason)
        else if (r.note !== undefined) say(r.note)
      }, (e: unknown) => say(e instanceof Error ? e.message : String(e)))
    },
    beginNewWorkItem: () => {
      setInputMode({
        kind: 'text',
        label: 'Add a task to the board — its title',
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
