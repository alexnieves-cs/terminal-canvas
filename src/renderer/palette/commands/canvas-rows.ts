import { SWARM_LIST, SWARM_PRESETS } from '@shared/swarm'
import { LINEUPS, LINEUP_IDS } from '@shared/lineups'
import { lineupWhatId } from '../spawn-sheet'
import type { Command } from '../palette-model'
import { updateSentence } from '@renderer/session/update-store'
import { requestTier } from '@renderer/canvas/flight'
import { openSettingsPage } from '@renderer/settings/open'
import type { PaletteContext } from './context'
import { withReason, hiddenAtRestIf } from './with-reason'
import { runLastNight } from '@renderer/film/last-night-door'

/**
 * M620. Split out of palette/commands.ts, in the order buildCommands pushes
 * them: Canvas: tiers, history, the center pages, the board, arrangements and recipes. Each section is its own function over the same context, so a
 * new row goes beside its neighbours instead of into one 2.7k-line function.
 */
export function canvasRows(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []
  // --- Canvas --------------------------------------------------------------

  out.push({
    // M146. TWO rows, two names. `Reset zoom` returns to INITIAL. ⌘0 is Fit
    // all (R-032); this row has no chord.
    id: 'canvas.fit',
    title: 'Reset zoom',
    group: 'canvas',
    run: () => actions.resetZoom()
  })
  out.push({
    id: 'canvas.zoom-fit',
    // M409 (C5). Named for what it will frame, in the HUD's own words: "Zoom
    // to fit", "Fit task" and the HUD's "Fit all" read as three names for one
    // thing. With a selection it is Fit selection; without one it IS Fit all.
    // "zoom to fit" stays in searchText, so the old phrase still finds it.
    // The title follows zoomTarget's arms (the M409 critic): a selection only
    // counts when it holds a PANEL the fit can frame, and an empty canvas —
    // where the verb resets, and Reset zoom is the row — rests in search.
    title: ctx.selectedIds.some((id) => ctx.panels.some((p) => p.id === id)) ? 'Fit selection' : 'Fit all',
    ...hiddenAtRestIf(ctx.panels.length === 0),
    // R-032. ⌘0 is Fit all. The chip moves here from Reset zoom. Check 48
    // counts every row with a shortcut, including one hidden at rest.
    shortcut: '⌘0',
    subtitle: 'the selected panels, or every panel',
    searchText: 'fit all selection zoom to fit frame view',
    group: 'canvas',
    run: () => actions.zoomToFit()
  })
  // M444. The tier flights and the settings page. No shortcut field: check 48
  // counts every chip, and these chords already live on the HUD.
  out.push({
    id: 'canvas.tier.work',
    title: 'Go to Work',
    subtitle: 'live terminals',
    searchText: 'go to work tier zoom',
    group: 'canvas',
    run: () => requestTier('work')
  })
  out.push({
    id: 'canvas.tier.plan',
    title: 'Go to Plan',
    subtitle: 'cards, one sentence each',
    searchText: 'go to plan tier zoom cards',
    group: 'canvas',
    run: () => requestTier('plan')
  })
  out.push({
    id: 'canvas.tier.map',
    title: 'Go to Map',
    subtitle: 'territories and state dots',
    searchText: 'go to map tier zoom overview',
    group: 'canvas',
    run: () => requestTier('map')
  })
  out.push({
    id: 'canvas.settings',
    title: 'Open Settings',
    subtitle: 'keyboard, appearance, the page',
    searchText: 'open settings page keyboard',
    group: 'canvas',
    run: () => { openSettingsPage() }
  })
  // M409 (C5). Undo and Redo, which ⌘K did not have ("undo" matched 123 rows
  // and selected a usage-window setting). The shortcut chips are the menu's.
  // Titled "canvas change" and refused BY NAME where ⌘Z is someone else's (the
  // M409 critic): the menu's ⌘Z goes to a focused draft first (serveDraftEdit)
  // and stands down behind a covering view (shouldIgnoreKeys), but these rows
  // call undoCanvas bare — a person in a note who typed "undo" would have
  // rewound a panel spawn behind the text they meant to fix.
  const historyOwner = ctx.draftHeld === true ? 'the editor has its own ⌘Z — this would rewind the canvas behind it'
    : ctx.canvasCovered === true ? 'the canvas is covered — go back to it to undo there' : undefined
  out.push(
    withReason({ id: 'canvas.undo', title: 'Undo canvas change', subtitle: 'the last change to the canvas — a move, a close, a spawn', searchText: 'undo revert back history', group: 'canvas', shortcut: '⌘Z', ...hiddenAtRestIf(ctx.canUndo === false), run: () => actions.undoCanvas() },
      historyOwner ?? (ctx.canUndo === false ? 'nothing to undo' : undefined)),
    withReason({ id: 'canvas.redo', title: 'Redo canvas change', subtitle: 'the change Undo took back', searchText: 'redo again history', group: 'canvas', shortcut: '⌘⇧Z', ...hiddenAtRestIf(ctx.canRedo === false), run: () => actions.redoCanvas() },
      historyOwner ?? (ctx.canRedo === false ? 'nothing to redo' : undefined))
  )
  out.push({
    // The row is deliberately NOT hiddenAtRest, unlike every administration
    // row: this is a whole VIEW MODE, and its only other gesture is one
    // toolbar button a user may never have looked at. It says "Merged view"
    // rather than which way the toggle currently sits, because — unlike a
    // setting row — the canvas itself is the readout: a user in the merged
    // view is looking at four lanes.
    id: 'canvas.merged',
    title: 'Merged view: every workspace at once',
    searchText: 'merge merged workspaces lanes all overview toggle',
    group: 'canvas',
    run: () => actions.toggleMerged()
  })
  // M268. Center-page doors — same verbs as the TopBar / dock toggles.
  out.push({
    id: 'canvas.orchestration',
    // D2 (R-015). The door a person uses is "Show Orchestrate", the same
    // title as the View menu row and the Sessions header. The id stays.
    title: 'Show Orchestrate',
    searchText: 'orchestration orchestrate dashboard overview ops agents activity',
    group: 'canvas',
    run: () => actions.setCenterView('orchestration')
  })
  out.push({
    id: 'canvas.show',
    title: 'Show Canvas',
    searchText: 'canvas center view panels world',
    group: 'canvas',
    run: () => actions.setCenterView('canvas')
  })
  // M404 (C3). People's palette door. The top-bar segment shows only when
  // signed in or on a shared workspace; this row is always here, and the
  // page it opens carries the sign-in button when that is what is missing.
  out.push({
    id: 'canvas.people',
    title: 'Show People',
    subtitle: 'who in your organization is working, and on what',
    searchText: 'people team members organization presence who is working observe',
    group: 'canvas',
    run: () => actions.setCenterView('team')
  })
  // M570 (lane O). The Lessons page: what discards and sent review comments
  // taught. Always here — reading what was kept spends nothing.
  // M607 (lane L's film, a second door). The briefing's "Last night ▸" goes
  // away with the card; the film can still be made from here, any morning.
  out.push({
    id: 'film.last-night',
    title: 'Render last night as a film',
    subtitle: 'a 60-second time-lapse of what the agents did while you were away, saved where you choose',
    searchText: 'film night time-lapse timelapse video last night replay movie overnight',
    group: 'canvas',
    run: () => { actions.say(runLastNight() ? 'Rendering last night\'s film — it is saved when it is done' : 'the night film is not available in this window') }
  })
  out.push({
    id: 'learn.open',
    title: 'Show Lessons',
    subtitle: 'what your reviews taught the agents here',
    searchText: 'lessons learn learned harness rules mistakes discarded comments review claude.md skills',
    group: 'canvas',
    run: () => actions.setCenterView('learn')
  })
  out.push({
    id: 'canvas.reset',
    title: 'Reset canvas…',
    group: 'canvas',
    run: () => actions.resetCanvas()
  })
  // M113. The typed door onto the board. A canvas-group row (a panel-group
  // row competes with Go-to rows by fuzzy score) and never disabled: a typed
  // item needs no service, no place and no CLI — it is a title on a board.
  out.push({
    id: 'board.open',
    title: 'Open Board',
    searchText: 'board kanban columns todo working review done dispatch',
    group: 'canvas',
    run: () => actions.openBoard()
  })
  // M197 (D05). THE START WORK DOOR. Present always and never disabled: the
  // flow's own sentences are the answer to every empty case (no place, no
  // repository), each naming its fix, and a row that vanished would read as a
  // feature that was never built. It is the only door that reaches a start
  // with no board card already in hand.
  // M400 (B1). "task" is the noun: the row is New task…, the same sheet the
  // top bar's "+ New task" opens, and its `leads` lift it into the Tasks
  // section above every other row for "new", "task" and "start"
  // (`verify:palette task.rank.1`). The old words stay in searchText, so
  // "start work" still finds it. The UX pass: at rest it leads too
  // (`leadsAtRest`), the first row ⌘K opens on.
  out.push({
    id: 'start.work',
    title: 'New task…',
    subtitle: 'what, where, and who — an agent works on it on its own branch',
    searchText: 'new task start work issue dispatch teammate repository folder lane begin',
    leads: ['new task', 'task', 'start task', 'start work'],
    leadsAtRest: true,
    group: 'canvas',
    run: () => actions.beginStartWork()
  })
  // M275. THE ARRANGEMENT DOORS, one row per preset. Four rows rather than one
  // row that then asks which: the arrangements are not variants of a setting,
  // they are four different shapes of work, and a person searching for
  // "review" should find the review arrangement rather than a menu. Present
  // always and never disabled, for `start.work`'s own reason — every empty
  // case has a sentence of its own naming its fix, and the sheet is where it
  // is said. The sheet opens with the arrangement already chosen.
  //
  // WRITTEN OUT, not looped. `closure.v9.1` finds a verb's palette door by
  // reading this file as TEXT (`id: '<row>'`), so a row built from a template
  // literal is a door the door-check cannot see — declared and unprovable.
  // `verify:swarm rows.1` fails for a preset with no row here, which is the
  // other half: neither can drift without a red.
  const swarmRow = (preset: typeof SWARM_LIST[number]): Omit<Command, 'id'> => ({
    title: `New task as a ${preset.label} arrangement…`, subtitle: preset.hint,
    searchText: `swarm arrangement start work ${preset.id} ${preset.label} supervisor handoff worktree lane multi agent seats`,
    group: 'canvas', run: () => actions.beginStartWork({ swarm: preset.id })
  })
  out.push({ id: 'work.swarm.explore', ...swarmRow(SWARM_PRESETS.explore) })
  out.push({ id: 'work.swarm.implement', ...swarmRow(SWARM_PRESETS.implement) })
  out.push({ id: 'work.swarm.test', ...swarmRow(SWARM_PRESETS.test) })
  out.push({ id: 'work.swarm.review', ...swarmRow(SWARM_PRESETS.review) })
  // M314. THE RECIPE DOORS — written out, `closure.v9.1`'s reason above. Each
  // opens Start work with the recipe chosen: its context, checks and
  // deliverables filled in and editable, its one question focused.
  const recipeRow = (id: string, title: string, subtitle: string, words: string): Omit<Command, 'id'> => ({
    title, subtitle, searchText: `recipe start work ${words}`, group: 'canvas', run: () => actions.beginStartWork({ recipeId: id })
  })
  out.push({ id: 'recipe.fix-test', ...recipeRow('recipe-fix-test', 'Fix a failing test…', 'reproduce, fix the cause, prove it passes', 'fix failing test red broken ci') })
  out.push({ id: 'recipe.implement-issue', ...recipeRow('recipe-implement-issue', 'Implement an issue…', 'from the issue to a reviewed change with tests', 'implement issue feature ticket github jira') })
  out.push({ id: 'recipe.review-change', ...recipeRow('recipe-review-change', 'Review a change…', 'findings ranked by severity, no edits', 'review change diff branch pr pull request code review') })
  // The UX pass. A person's OWN recipes were reachable only from New task ›
  // Options; each is a row now, beside the built-ins, opening the same sheet.
  for (const r of ctx.savedRecipes ?? []) {
    out.push({ id: `recipe.saved.${r.id}`, ...recipeRow(r.id, `${r.name}…`, 'your saved recipe — opens New task with it filled in', `saved ${r.name}`) })
  }
  // The UX pass. Arrangements (M104's lineups) were reachable only from a
  // select inside the panel sheet; each opens that sheet on it now.
  for (const id of LINEUP_IDS) {
    out.push({
      id: `arrangement.${id}`, title: `New panels as ${LINEUPS[id].label}…`, subtitle: `arrangement — ${LINEUPS[id].hint}`,
      // Found by typing, not at rest: the resting list's budget (`palette.rest.1`).
      searchText: `arrangement lineup layout seats ${id} ${LINEUPS[id].label}`, group: 'spawn', hiddenAtRest: true,
      run: () => actions.beginSpawnSheet(undefined, undefined, { what: lineupWhatId(id) })
    })
  }
  // The UX pass. Routines were reachable only from the agent profiles pane.
  for (const r of ctx.routines ?? []) {
    out.push({
      id: `routine.run.${r.id}`, title: `Run routine ${r.name} now`, subtitle: 'a scheduled run, started early — its schedule is unchanged',
      searchText: `routine run now schedule ${r.name}`, group: 'canvas', hiddenAtRest: true, run: () => actions.runRoutine(r.id)
    })
  }
  out.push({ id: 'recipe.investigate-bug', ...recipeRow('recipe-investigate-bug', 'Investigate a bug…', 'reproduce, find the root cause, propose a fix', 'investigate bug debug root cause reproduce') })
  // M312. The repository setup, for the captured panel's repository.
  out.push({
    id: 'repo.setup',
    title: 'Repository setup…',
    subtitle: 'how this repository installs, serves, checks and previews — every new lane inherits it',
    searchText: 'repository setup install dependencies services ports checks preview environment prepare lane',
    group: 'canvas',
    run: () => actions.beginRepoSetup()
  })
  // M313. The captured panel in the person's own editor: a file (at its
  // line when it has one), or the folder a conversation or terminal works in.
  out.push({
    id: 'editor.open',
    title: 'Open in editor',
    subtitle: 'the selected file, or the folder its agent works in — in your editor (Settings ▸ Open files in)',
    searchText: 'open in editor vscode code cursor zed ide worktree file line external',
    group: 'canvas',
    shortcut: '⌘⇧E',
    run: () => actions.openInEditor()
  })
  out.push({
    id: 'board.new',
    // M400. Named for what it does — a card on the board, nothing started —
    // so it cannot be mistaken for New task… (the row above it in the old list).
    title: 'Add a task to the board…',
    searchText: 'board work item task card todo kanban new add',
    group: 'canvas',
    run: () => actions.beginNewWorkItem()
  })
  // M123. The by-hand door onto the update NOTICE. Always present and never
  // disabled: the check's own third state (`could not check — <reason>`) is
  // the honest answer offline, and a row that vanished would read as a
  // feature that was never built. The subtitle is the LAST answer, so a
  // user who already asked sees it without asking again.
  out.push(withReason({
    id: 'update.check',
    title: 'Check for updates…',
    subtitle: ctx.update === undefined || ctx.update === null ? 'ask GitHub whether a newer release is published — nothing is installed' : updateSentence(ctx.update),
    searchText: 'update check release version newer github download notice',
    group: 'canvas',
    run: () => actions.checkForUpdates()
  }, ctx.update?.checking === true ? 'checking…' : undefined))

  return out
}
