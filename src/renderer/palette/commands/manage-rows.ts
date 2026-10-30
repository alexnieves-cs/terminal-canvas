import { PROVIDERS as CLOUD_PROVIDERS, type CloudProviderId } from '@shared/cloud-lane'
import { noteFormSentence } from '@shared/notes'
import { shapeFormSentence } from '@shared/flowchart'
import { CAPABILITY_ORDER, capabilityWords, normalizeCapability } from '@shared/toolbox-query'
import type { Command } from '../palette-model'
import { SERVICES } from '@shared/credential-schema'
import type { PaletteContext } from './context'
import { REASON_NO_FOCUS, REASON_BUILT_IN_RENAME, REASON_BUILT_IN_DELETE, REASON_PROJECT_PROMPT, REASON_UNREAD_PRESET, REASON_ALREADY_DEFAULT, REASON_BUILT_IN_WORKTREE, REASON_NO_WORKTREES, REASON_WORKTREE_ATTACHED, REASON_SEARCH_OFF, REASON_SEARCH_NO_MATCHES, REASON_NO_PROMPTS, REASON_NO_PANELS_SELECTED, REASON_GROUP_NEEDS_TWO, REASON_NOT_IN_GROUP, REASON_MERGED_READ_ONLY, REASON_BROADCAST_NEEDS_TWO } from './reasons'
import { withReason, hiddenAtRestIf } from './with-reason'

/**
 * M620. Split out of palette/commands.ts, in the order buildCommands pushes
 * them: Manage: services, capabilities, logs, worktrees, groups, transcripts, workflows, notes, shapes, pictures, cloud, Tonight and the tournament. Each section is its own function over the same context, so a
 * new row goes beside its neighbours instead of into one 2.7k-line function.
 */
export function manageRows(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []
  // --- Manage --------------------------------------------------------------
  //
  // Everything below is hiddenAtRest except the two doors, and the doors are
  // why the hiding is honest. Administration stays one keystroke away (type
  // "delete" and it is back, in this section) rather than one guess away.

  // The doors. `entersScope` rather than a callback, and `run` is genuinely a
  // no-op: entering a drill-in is view state that never leaves Palette.tsx, so
  // routing it through Canvas.tsx would make the canvas a stakeholder in which
  // rows the palette is currently showing — and the view has to know BEFORE it
  // runs the row, because running one normally closes the overlay.
  // M365. The capability query's door, and its rows: one per panel with a
  // toolbox directory, in answer order (has, inactive, unknown, lacks). Each
  // row carries the typed name in its searchText, so the scope's own filter
  // never hides an answer for not containing the name in its title.
  out.push({ id: 'capability.open', title: 'Which agents can…', subtitle: 'type a skill, command, agent or MCP server name — each agent\'s own toolbox answers', group: 'panel', entersScope: 'capability', searchText: 'capability can skill command agent mcp server toolbox which agents who can', run: () => {} })
  {
    // Scope-bound rows: filterCommands shows them only inside `capability`.
    const q = ctx.capabilityQuery ?? ''
    if (normalizeCapability(q) === '') {
      out.push(withReason({ id: 'capability.hint', title: 'Type a name', subtitle: 'a skill, a /command, an @agent or an MCP server', group: 'panel', scope: 'capability', hiddenAtRest: true, run: () => {} }, 'type the name to ask about'))
    } else if (ctx.capability === undefined || ctx.capability === null) {
      out.push(withReason({ id: 'capability.reading', title: 'Reading each agent\'s toolbox…', group: 'panel', scope: 'capability', hiddenAtRest: true, searchText: q, run: () => {} }, 'reading'))
    } else if (ctx.capability.length === 0) {
      out.push(withReason({ id: 'capability.none', title: 'No agent on this canvas has a toolbox to ask', group: 'panel', scope: 'capability', hiddenAtRest: true, searchText: q, run: () => {} }, 'open a conversation or an agent terminal in a folder first'))
    } else {
      const sorted = [...ctx.capability].sort((a, b) => CAPABILITY_ORDER[a.answer.kind] - CAPABILITY_ORDER[b.answer.kind])
      for (const r of sorted) {
        out.push({ id: `capability.${r.panelId}`, title: r.label, subtitle: capabilityWords(q, r.answer), group: 'panel', scope: 'capability', hiddenAtRest: true, searchText: q, run: () => actions.goToPanel(r.panelId) })
      }
    }
  }
  out.push({
    id: 'manage.presets',
    title: 'Manage saved commands…',
    subtitle: `${ctx.presets.length} saved command${ctx.presets.length === 1 ? '' : 's'}`,
    group: 'manage',
    entersScope: 'presets',
    run: () => {}
  })
  out.push(
    withReason(
      {
        id: 'manage.prompts',
        title: 'Manage prompts…',
        subtitle: `${ctx.prompts.length} prompt${ctx.prompts.length === 1 ? '' : 's'}`,
        group: 'manage',
        entersScope: 'prompts',
        run: () => {}
      },
      ctx.prompts.length === 0 ? REASON_NO_PROMPTS : undefined
    )
  )
  {
    // Booleans AND numbers now produce rows, so the count is the length again
    // — but derive it from the same predicate the loop uses rather than from
    // ctx.settings.length, so a future type that produces no row (an enum,
    // still uncustomered) cannot make this door claim a setting the scope
    // does not show.
    const settingCount = ctx.settings.filter(
      (s) => s.type === 'boolean' || s.type === 'number' || s.type === 'text'
    ).length
    out.push({
      id: 'manage.settings',
      title: 'Manage settings…',
      subtitle: `${settingCount} setting${settingCount === 1 ? '' : 's'}`,
      group: 'manage',
      entersScope: 'settings',
      run: () => {}
    })
  }
  out.push({
    id: 'manage.workspaces',
    title: 'Manage workspaces…',
    subtitle: `${ctx.workspaces.length} workspace${ctx.workspaces.length === 1 ? '' : 's'}`,
    group: 'manage',
    entersScope: 'workspaces',
    run: () => {}
  })
  out.push({
    id: 'manage.credentials',
    title: 'Manage credentials…',
    subtitle: `${ctx.credentials.length} of ${SERVICES.length} connected`,
    group: 'manage',
    entersScope: 'credentials',
    run: () => {}
  })

  for (const preset of ctx.presets) {
    out.push(
      withReason(
        {
          id: `preset.rename.${preset.id}`,
          title: `Rename saved command ${preset.name}`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          run: () => actions.beginRenamePreset(preset.id, preset.name)
        },
        preset.builtIn ? REASON_BUILT_IN_RENAME : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `preset.delete.${preset.id}`,
          title: `Delete saved command ${preset.name}`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          destructive: true,
          run: () => actions.deletePreset(preset.id)
        },
        preset.builtIn ? REASON_BUILT_IN_DELETE : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `preset.default.${preset.id}`,
          title: `Make ${preset.name} the ⌘⌥N default`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          run: () => actions.setDefaultPreset(preset.id)
        },
        // M253 (the critic, 2). Unread first: Cmd+N would otherwise spawn a
        // stranger's command with no refusal anywhere on its path.
        preset.reviewed === false ? REASON_UNREAD_PRESET : preset.isDefault ? REASON_ALREADY_DEFAULT : undefined
      )
    )
    // M37. A toggle that names its CURRENT state rather than a pair of rows:
    // two rows (turn on / turn off) with one always disabled would be two
    // rows describing one fact. A built-in stays visible and refuses with a
    // reason that says what to do instead.
    out.push(
      withReason(
        {
          id: `preset.worktree.${preset.id}`,
          title: `Spawn ${preset.name} in a fresh worktree: ${preset.worktree === true ? 'on' : 'off'}`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          searchText: 'worktree isolate branch git',
          run: () => actions.setPresetWorktree(preset.id, preset.worktree !== true)
        },
        preset.builtIn ? REASON_BUILT_IN_WORKTREE : undefined
      )
    )
  }

  // M39. The durable log's one verb. Hidden at rest and destructive, like
  // the credential and preset deletes: a row that clears every panel's
  // recorded output must not sit beside "Go to n1" under a query aimed
  // elsewhere, and a user who wants it types "scrollback" or "clear".
  out.push({
    id: 'canvas.clear-scrollback',
    title: 'Clear scrollback logs',
    subtitle: 'removes every panel’s recorded output from disk',
    group: 'canvas',
    hiddenAtRest: true,
    destructive: true,
    searchText: 'scrollback history log output clear delete disk',
    run: () => actions.beginClearScrollback()
  })

  // M37. The worktree door and its rows. The door is present at rest and
  // disabled with a reason when there are none: a door that vanished would
  // read as a feature that was never built, the rule every other door here
  // already obeys.
  out.push(
    withReason(
      {
        id: 'manage.worktrees',
        title: 'Manage worktrees…',
        subtitle: `${ctx.worktrees.length} worktree${ctx.worktrees.length === 1 ? '' : 's'}`,
        group: 'manage',
        entersScope: 'worktrees',
        searchText: 'worktree branch git isolate',
        run: () => {}
      },
      ctx.worktrees.length === 0 ? REASON_NO_WORKTREES : undefined
    )
  )
  for (const wt of ctx.worktrees) {
    // M86. The row says where the branch stands, from the local tracking ref.
    const who = `${wt.status === undefined ? '' : `${wt.status} — `}${wt.attached ? `${wt.panelTitle ?? wt.panelId} is in it` : ''}`.replace(/ — $/, '')
    out.push(
      withReason(
        {
          id: `worktree.remove.${wt.id}`,
          title: `Remove worktree ${wt.branch}`,
          subtitle: who === '' ? wt.path : `${who} · ${wt.path}`,
          group: 'manage',
          scope: 'worktrees',
          hiddenAtRest: true,
          destructive: true,
          searchText: `worktree remove delete ${wt.path} ${wt.root}`,
          run: () => actions.beginRemoveWorktree(wt.id)
        },
        wt.attached ? REASON_WORKTREE_ATTACHED : undefined
      )
    )
    out.push({
      id: `worktree.reveal.${wt.id}`,
      title: `Reveal worktree ${wt.branch} in Finder`,
      subtitle: wt.path,
      group: 'manage',
      scope: 'worktrees',
      hiddenAtRest: true,
      searchText: `worktree reveal open finder ${wt.path} ${wt.root}`,
      run: () => actions.revealWorktree(wt.id)
    })
  }

  for (const prompt of ctx.prompts) {
    const subtitle = prompt.source === 'project' ? 'project — .claude/commands' : 'saved'
    out.push(
      withReason(
        {
          id: `prompt.delete.${prompt.id}`,
          title: `Delete prompt: ${prompt.name}`,
          subtitle,
          group: 'manage',
          scope: 'prompts',
          hiddenAtRest: true,
          destructive: true,
          run: () => actions.deletePrompt(prompt.id)
        },
        prompt.source === 'project' ? REASON_PROJECT_PROMPT : undefined
      )
    )
  }

  // hiddenAtRest for the reason every other admin row is: two rows per
  // workspace un-hidden would put the resting list back past the roughly-
  // eight-row budget M6p sized it to. They stay findable by query — typing
  // "delete" surfaces them — because a row that disappears is
  // indistinguishable from a feature that is missing.
  // The selection size, phrased once. Every move row says it, because the row
  // is the only place a user learns HOW MANY panels the verb is about — the
  // marquee that built the selection is long gone by the time the palette is
  // open, and a row reading only "Move to school" is a verb with an invisible
  // object.
  const count = `${ctx.selectedIds.length} panel${ctx.selectedIds.length === 1 ? '' : 's'}`

  // M61. The two verbs GroupLayer's header carries, on the group holding the
  // CAPTURED panel. One pair, never one per group: a row per group would
  // scale with the canvas (removeLink's rule), and the captured panel is
  // what every other panel verb in this palette already targets.
  {
    const held = ctx.capturedId === null ? undefined : (ctx.groups ?? []).find((g) => g.panelIds.includes(ctx.capturedId as string))
    const reason = ctx.merged
      ? REASON_MERGED_READ_ONLY
      : (ctx.capturedId === null ? REASON_NO_FOCUS : (held === undefined ? REASON_NOT_IN_GROUP : undefined))
    const name = held === undefined ? '' : ` “${held.label}”`
    out.push(withReason({
      id: 'group.toggle', ...hiddenAtRestIf(held === undefined),
      title: held?.collapsed ? `Expand group${name}` : `Card group${name}`,
      subtitle: held?.collapsed ? 'show its panels again' : 'fold its panels to cards — nothing is closed',
      searchText: 'group collapse expand card fold unfold',
      group: 'canvas',
      run: () => { if (held !== undefined) actions.toggleGroup(held.id) }
    }, reason))
    out.push(withReason({
      id: 'group.remove', ...hiddenAtRestIf(held === undefined),
      title: `Remove group${name}`,
      subtitle: 'the frame goes; its panels stay',
      searchText: 'group remove delete ungroup dissolve',
      group: 'canvas',
      run: () => { if (held !== undefined) actions.removeGroup(held.id) }
    }, reason))
  }

  out.push(
    withReason(
      {
        id: 'canvas.group-selection', ...hiddenAtRestIf(ctx.selectedIds.length < 2),
        title: `Group ${count}…`,
        searchText: 'group selected panels region label',
        group: 'canvas',
        run: () => actions.beginCreateGroup(ctx.selectedIds)
      },
      ctx.merged
        ? REASON_MERGED_READ_ONLY
        : (ctx.selectedIds.length < 2 ? REASON_GROUP_NEEDS_TWO : undefined)
    )
  )

  out.push(
    withReason(
      {
        id: 'canvas.broadcast-input', ...hiddenAtRestIf(!(ctx.broadcastActive || ctx.broadcastReady)),
        title: ctx.broadcastActive ? 'Stop broadcasting input' : `Broadcast input to ${count}`,
        searchText: 'broadcast input type selected terminals agents',
        group: 'canvas',
        run: () => actions.toggleBroadcastInput()
      },
      ctx.broadcastActive || ctx.broadcastReady ? undefined : REASON_BROADCAST_NEEDS_TWO
    )
  )

  for (const w of ctx.workspaces) {
    out.push({
      id: `workspace.rename.${w.id}`,
      title: `Rename workspace “${w.name}”…`,
      group: 'manage',
      scope: 'workspaces',
      hiddenAtRest: true,
      run: () => actions.beginRenameWorkspace(w.id, w.name)
    })
    // A move row per OTHER workspace. The ACTIVE one is skipped rather than
    // disabled: moving panels to the workspace they are already in is a no-op
    // wearing the costume of a verb — it would run, close the palette, clear
    // the selection and change nothing, which reads as a broken feature rather
    // than as a no-op. That is the opposite ruling from the switch row above,
    // which IS disabled-with-a-reason for the active workspace, and the
    // difference is that "you are already here" is a useful thing to be told
    // about a destination and a meaningless thing to be told about a filing
    // cabinet.
    if (!w.active) {
      out.push(
        withReason(
          {
            id: `workspace.move.${w.id}`,
            title: `Move ${count} to “${w.name}”`,
            searchText: 'move panels to workspace file relocate send',
            group: 'manage',
            scope: 'workspaces',
            hiddenAtRest: true,
            // NO `destructive`, deliberately, one line above a row that has
            // it. `Command.destructive` is typed `?: true` rather than
            // `boolean` precisely so absent is the only way to say "benign" —
            // and a move IS benign: nothing is killed on either side, the
            // panel and its running agent both survive. Marking it would put a
            // confirm gate in front of a reversible edit and train the user to
            // dismiss the gate that guards the delete row below it.
            run: () => actions.movePanelsToWorkspace(ctx.selectedIds, { workspaceId: w.id })
          },
          // The merged reason is tested FIRST and outranks the empty one: in
          // the merged view a selection is easy to have (one click on any
          // lane's panel) and telling that user to select something is
          // telling them to do the thing they have already done. Disabled
          // WITH a reason, never absent — a row that disappears is
          // indistinguishable from a feature that was never built, and this
          // one is genuinely available one toggle away.
          ctx.merged
            ? REASON_MERGED_READ_ONLY
            : (ctx.selectedIds.length === 0 ? REASON_NO_PANELS_SELECTED : undefined)
        )
      )
    }
    out.push({
      id: `workspace.delete.${w.id}`,
      title: `Delete workspace “${w.name}”…`,
      group: 'manage',
      scope: 'workspaces',
      hiddenAtRest: true,
      destructive: true,
      // Marked AND gated. A red row still runs on one Enter, so the mark is
      // not the guard; the confirm (Task 6, in Canvas.tsx) is. Neither half
      // replaces the other.
      run: () => actions.deleteWorkspace(w.id, w.name, w.panelIds.length)
    })
  }

  out.push(
    withReason(
      {
        id: 'workspace.move-new',
        title: `Move ${count} to a new workspace…`,
        searchText: 'move panels new workspace file relocate send',
        group: 'manage',
        scope: 'workspaces',
        hiddenAtRest: true,
        // No `destructive` either — see the per-workspace row above.
        // begin*, never the move itself: the name has to be typed, and the
        // ellipsis is a promise that Escape still gets the user out.
        run: () => actions.beginMovePanelsToNewWorkspace(ctx.selectedIds)
      },
      // Present and DISABLED, never absent — the rule the whole file obeys: a
      // row that disappears is indistinguishable from a feature that was never
      // built, and a user who has not yet discovered that the rubber-band drag
      // is what feeds this verb has nowhere else to learn it.
      // Same precedence as the per-workspace rows above, and for the same
      // reason. This one matters slightly more: it MINTS a workspace, so a
      // merged-view run would file another workspace's panels into a canvas
      // that did not exist a moment ago.
      ctx.merged
        ? REASON_MERGED_READ_ONLY
        : (ctx.selectedIds.length === 0 ? REASON_NO_PANELS_SELECTED : undefined)
    )
  )

  // M42 — the search scope. Rows exist only in scope 'search'; the view shows
  // them only when the user has opened that scope. Three empty states, never
  // one — a folded pair tells the user the wrong fix.
  // M122. Persistence off is no longer the whole answer: the chat transcript
  // logs answer regardless, so the reason says so and the hits that came
  // still render beneath it. Only a query with an answer of NOTHING says
  // "no matches"; before the first keystroke the scope is quiet.
  if (!ctx.scrollbackEnabled) {
    out.push(withReason(
      { id: 'search.off', title: 'Terminal output is not being kept', subtitle: 'turn on Keep recent output on disk — chats still answer', group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} },
      REASON_SEARCH_OFF
    ))
  }
  if (ctx.searchResults !== null) {
    const result = ctx.searchResults
    const searched = result.searched
    const work = ctx.workSearch ?? null
    if (searched !== undefined && ctx.searchQuery.trim() !== '') {
      // D13. The scope names every source it read, and that it is THIS workspace's — nothing private to another was read.
      const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
      const t = work === null
        ? `searched ${plural(searched.terminals, 'terminal')} and ${plural(searched.chats, 'chat')}`
        : `searched ${plural(searched.terminals, 'terminal')}, ${plural(searched.chats, 'chat')}, ${plural(work.searched.tasks, 'task')} and ${plural(work.searched.retained, 'retained outcome')} in this workspace`
      // M399 (A9): `searchText` is the query itself. The palette's own filter
      // runs over every row, so this line (what was read) showed only for a
      // query that happened to fuzzy-match "searched … terminals" — typing
      // `alex` hid it. It describes THIS answer, so it matches whatever asked.
      out.push(withReason({ id: 'search.scope', title: t, searchText: ctx.searchQuery, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t))
    }
    for (const failure of result.failures ?? []) {
      const t = `could not read ${failure.source} — ${failure.reason}`
      out.push(withReason({ id: `search.fail.${failure.source}`, title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t))
    }
    // D13. Tasks and retained outcomes lead: they are what the work MEANT,
    // and the output lines beneath are where it happened. A hit frames the
    // task's card through the existing verb; one with no card says so and
    // runs nothing — a retained outcome never reopens its lane.
    if (work !== null && ctx.searchQuery.trim() !== '') {
      if (work.capped) { const t = `the first ${work.cap} tasks and outcomes — narrow the search`; out.push(withReason({ id: 'search.work-cap', title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t)) }
      if (work.redacted > 0) { const t = `${work.redacted} secret${work.redacted === 1 ? '' : 's'} redacted from these tasks`; out.push(withReason({ id: 'search.work-redacted', title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t)) }
      for (const hit of work.hits) {
        const id = hit.source === 'task' ? `search.task.${hit.itemId}` : `search.retained.${hit.outcomeId ?? hit.itemId}`
        const lead = hit.source === 'task' ? 'Task' : 'Retained outcome'
        const row = { id, title: `${lead} · ${hit.title}`, subtitle: `${hit.field}: ${hit.line}`, searchText: `${hit.title} ${hit.line}`, group: 'panel' as const, scope: 'search' as const, hiddenAtRest: true as const,
          run: () => { if (hit.cardPanelId !== undefined) { const r = actions.showTask(hit.cardPanelId); if (r.kind === 'refused' || r.partial === true) actions.say(r.kind === 'refused' ? r.reason : (r.note ?? '')) } } }
        out.push(hit.cardPanelId === undefined ? withReason(row, 'this task\'s card is no longer on the canvas — its record is kept, and nothing was reopened') : row)
      }
    }
    if (result.hits.length === 0 && (work === null || work.hits.length === 0)) {
      // Only once a query has been typed: an empty query answers null above,
      // not [], so "no matches" never shows before the first keystroke.
      if (ctx.searchQuery.trim() !== '') {
        out.push(withReason(
          // M64. Names the term, once — the old row said "No matches" in the
          // title and "no matches" in the hint and never the word typed.
          { id: 'search.none', title: `No matches for “${ctx.searchQuery.trim()}”`, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} },
          REASON_SEARCH_NO_MATCHES
        ))
        // M604. The dead end gets a way on: what was typed is often the task
        // itself ("fix the flaky login test"), so offer to start it.
        const typed = ctx.searchQuery.trim()
        out.push({ id: 'search.start-task', title: `Start a task: “${typed}”`, subtitle: 'opens New task with this as its sentence', group: 'panel', scope: 'search', hiddenAtRest: true, run: () => actions.beginStartWork({ title: typed }) })
      }
    } else {
      // M122. What the answer LEFT OUT comes first: the cap, and the secrets the gate replaced.
      // INFORMATION, not verbs: disabled with their own sentence, so stepping skips them and Enter never lands on a row that does nothing.
      if (result.capped) { const t = `the first ${result.cap} matches — narrow the search`; out.push(withReason({ id: 'search.cap', title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t)) }
      if (result.redacted > 0) { const t = `${result.redacted} secret${result.redacted === 1 ? '' : 's'} redacted from these lines`; out.push(withReason({ id: 'search.redacted', title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t)) }
      // M64. The hit leads with the panel's NAME, not its path-and-id label.
      const labelOf = new Map(ctx.panels.map((row) => [row.id, row.title ?? row.name ?? row.label]))
      for (const hit of result.hits) {
        const isTurn = hit.kind === 'transcript'
        out.push({
          id: isTurn ? `search.hit.${hit.panelId}.t${hit.turnIndex ?? 0}` : `search.hit.${hit.panelId}.${hit.lineIndex ?? 0}`,
          // The panel's name AND which kind the line came from: two panels can share a name, and the two verbs differ.
          title: `${labelOf.get(hit.panelId) ?? hit.panelId} · ${isTurn ? `chat turn ${(hit.turnIndex ?? 0) + 1}` : `line ${(hit.lineIndex ?? 0) + 1}`}`,
          mono: true,
          // The matched line, and the haystack: the palette's own filter runs
          // over title+subtitle+searchText, so typing narrows the hits too.
          subtitle: hit.line,
          searchText: hit.line,
          group: 'panel',
          scope: 'search',
          hiddenAtRest: true,
          // A transcript hit flies to the chat AND to the turn; a scrollback hit keeps M42's door.
          run: () => { actions.goToPanel(hit.panelId); if (isTurn) actions.scrollChatTurn(hit.panelId, hit.turnIndex ?? 0) }
        })
      }
    }
  }

  // M180. The palette's door for `new-chat` is the existing `panel.new-chat`
  // row (and the codex sandbox rows) — a third row minting the same chat was
  // the critic's finding; only the readiness verb is new here.
  out.push(withReason({ id: 'starter.open', title: 'Open the starter canvas', subtitle: 'Your agent and one captioned example of each kind of object', group: 'canvas', searchText: 'starter canvas examples onboarding first run welcome', run: () => { void actions.openStarter() } },
    ctx.starterReason ?? undefined))
  // M182. The six editing verbs as rows over the SELECTED workflow panel's
  // template, each opening the palette's text mode; disabled by name when no
  // workflow panel is selected. The diagram's drag and Delete are the canvas
  // doors for move and remove; M183 brings the library and the port drag.
  {
    const wf = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'workflow')
    const templateId = wf === undefined ? undefined : (ctx.workflowTemplateOf?.(wf.id))
    const reason = templateId === undefined ? 'select a workflow panel first' : undefined
    // Six literal ids (closure.v9.1 reads this file as TEXT for each door's row).
    const edit = (verb: 'add' | 'move' | 'set' | 'remove' | 'edge' | 'unedge') => () => { if (templateId !== undefined) actions.beginWorkflowEdit(templateId, verb) }
    out.push(withReason({ id: 'workflow.add', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: add node…', subtitle: 'a terminal, chat, pool, orchestrator or collect node in the draft', group: 'canvas', searchText: 'workflow template edit add node diagram', run: edit('add') }, reason))
    out.push(withReason({ id: 'workflow.move', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: move node…', subtitle: 'shift a node by an offset', group: 'canvas', searchText: 'workflow template edit move node diagram', run: edit('move') }, reason))
    out.push(withReason({ id: 'workflow.set', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: set field…', subtitle: 'change one field of a node', group: 'canvas', searchText: 'workflow template edit set field node diagram', run: edit('set') }, reason))
    out.push(withReason({ id: 'workflow.remove', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: remove node…', subtitle: 'a node, and its edges with it', group: 'canvas', searchText: 'workflow template edit remove node diagram', run: edit('remove') }, reason))
    out.push(withReason({ id: 'workflow.edge', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: connect…', subtitle: 'an edge from one node to another, on a trigger', group: 'canvas', searchText: 'workflow template edit connect edge diagram', run: edit('edge') }, reason))
    out.push(withReason({ id: 'workflow.save', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: save', subtitle: 'write the draft back to the template', group: 'canvas', searchText: 'workflow template save draft revision', run: () => { if (templateId !== undefined) void actions.saveWorkflow(templateId) } }, reason))
    // M184 (the critic, 15f). A built-in's ONLY save is a copy, and it was
    // reachable from the panel alone: `workflow.save` dead-ended at "a
    // built-in workflow saves as a copy" with no door the sentence named.
    out.push(withReason({ id: 'workflow.copy', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: save a copy', subtitle: 'keep the diagram under a new name', group: 'canvas', searchText: 'workflow template save copy duplicate built-in', run: () => { if (templateId !== undefined) void actions.saveWorkflowCopy(templateId) } }, reason))
    out.push(withReason({ id: 'workflow.run', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: run', subtitle: 'run the shape on the diagram', group: 'canvas', searchText: 'workflow template run diagram start', run: () => { if (templateId !== undefined) actions.runWorkflowNow(templateId) } }, reason))
    out.push(withReason({ id: 'workflow.stop', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: stop', subtitle: 'interrupt what this workflow started', group: 'canvas', searchText: 'workflow template stop interrupt', run: () => { if (templateId !== undefined) actions.stopWorkflow(templateId) } }, reason))
    // M188. Test this node: the selected block, run on its own, with its
    // duration and a named failure — never its neighbours.
    out.push(withReason({ id: 'node.test', ...hiddenAtRestIf(templateId === undefined), title: 'Test this node', subtitle: 'run the selected block on its own and report what it answered', group: 'canvas', searchText: 'node test run block try execute action fetch', run: () => { if (templateId !== undefined) void actions.testNode(templateId) } }, reason))
    out.push(withReason({ id: 'workflow.unedge', ...hiddenAtRestIf(templateId === undefined), title: 'Workflow: disconnect…', subtitle: 'remove the edge between two nodes', group: 'canvas', searchText: 'workflow template edit disconnect edge diagram', run: edit('unedge') }, reason))
  }
  const imagePanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'image')?.id
  // M202 (D07). The selected work card, for the task review row. Derived the
  // same way and for the same reason: the row is PRESENT at rest and disabled
  // by name, because a row that disappears is indistinguishable from a
  // feature that was never built.
  const workPanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'work')?.id
  // M190. Feedback: a DRAFT, opened in the person's own browser. The row says
  // what the door does, because "Send feedback" would promise a send this app
  // never makes.
  // M336–M337. The account and sharing rows. The three sharing rows open the
  // share dialog; the dialog is where anything is shared, opened or changed.
  // R-080. The literal id is what closure.v9.1 reads. The body stays worldViewPaletteRow, reached through viewInWorld, so this file does not import the world modules.
  out.push({ id: 'world.view', title: 'View in World', subtitle: 'Open the World on this panel, or on its task when it has one', group: 'panel', searchText: 'world view show in world camera floor task panel', run: () => actions.viewInWorld(ctx.selectedIds[0]) })
  out.push({ id: 'account.sign-in', title: 'Account: sign in with GitHub…', subtitle: 'to share workspaces and see who in your organization is working', group: 'canvas', searchText: 'account sign in login github supabase add another switch', run: () => { void actions.signIn() } })
  out.push({ id: 'share.workspace', title: 'Share this workspace…', subtitle: 'put it in one of your organizations — teammates see cards, never commands or transcripts', group: 'canvas', searchText: 'share workspace team organization collaborate invite members', run: () => { void actions.shareWorkspace() } })
  out.push({ id: 'share.open', title: 'Open a shared workspace…', subtitle: 'the workspaces your teammates shared with you', group: 'canvas', searchText: 'open shared workspace team join room', run: () => { void actions.openSharedWorkspace() } })
  out.push({ id: 'share.role', title: 'Shared workspace: members and roles…', subtitle: 'who is in, and whether they edit or watch — the owner decides', group: 'canvas', searchText: 'share role member editor viewer remove permission access', run: () => { void actions.proposeShareRole() } })
  // M352. The verb line, like note.tint: the value is typed, and a person's line may raise a cap.
  const chatPanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'chat')?.id
  out.push(withReason({ id: 'agent.cap', ...hiddenAtRestIf(chatPanelId === undefined), title: 'Cap this agent…', subtitle: 'its own spend and context caps — or back to the Settings caps', group: 'canvas', searchText: 'agent cap spend budget cost context tokens limit hold stop dollars', run: () => actions.beginRunVerb('cap-agent') }, chatPanelId === undefined ? 'select an agent conversation first' : undefined))
  // M361. Opens the verb line, like cap-agent: the place and the comment are typed.
  out.push(withReason({ id: 'review.comment', ...hiddenAtRestIf(ctx.selectedIds.length === 0), title: 'Comment on a review line…', subtitle: 'a comment pinned to a line of this task\'s diff; from an agent it is a proposal', group: 'canvas', searchText: 'review comment line diff note objection reviewer proposal', run: () => actions.beginRunVerb('review-comment') }, ctx.selectedIds.length === 0 ? 'select a task\'s card, its review or its conversation first' : undefined))
  out.push({ id: 'feedback.open', title: 'Prepare feedback…', subtitle: 'a scrubbed draft in your browser — you read it and send it, this app does not', group: 'canvas', searchText: 'feedback issue bug report problem help github', run: () => { void actions.prepareFeedback() } })
  // M189. The portable file's two rows. Export writes what is on this canvas
  // (pictures only when the person asks, through the verb line); Import makes
  // a SEPARATE workspace and starts nothing.
  out.push({ id: 'portable.export', title: 'Export this canvas…', subtitle: 'one file: the objects, the workflows, secrets scrubbed and every omission named', group: 'canvas', searchText: 'export canvas file share portable save send', run: () => { void actions.exportCanvas() } })
  // M251. Present at rest and disabled by name, the image.replace rule: the
  // verb itself refuses a file that is not Markdown, in its own sentence.
  const deckPanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'file')?.id
  out.push(withReason({ id: 'deck.export-pptx', ...hiddenAtRestIf(deckPanelId === undefined), title: 'Deck: export to PowerPoint…', subtitle: 'the selected Markdown file as slides — headings, bullets, pictures and notes; secrets scrubbed and anything left out named', group: 'canvas', searchText: 'deck slides pptx powerpoint keynote export presentation markdown', run: () => { if (deckPanelId !== undefined) void actions.exportDeck(deckPanelId).then((r) => actions.say(r.kind === 'refused' ? r.reason : (r.note ?? ''))) } }, deckPanelId === undefined ? 'select a Markdown file panel first' : undefined))
  out.push({ id: 'portable.import', title: 'Import a canvas…', subtitle: 'into a new workspace, with nothing started', group: 'canvas', searchText: 'import canvas file open portable load', run: () => { void actions.importCanvas() } })
  // M250. A literal id, for closure.v9.1's text read. The refusal (a docx the
  // converter cannot read, a note already there) lands on the feedback line.
  out.push({ id: 'note.import-docx', title: 'Import a Word document…', subtitle: 'a new Markdown note beside the .docx — what was dropped is named, and the note waits to be read', group: 'canvas', searchText: 'import word docx document convert note markdown', run: () => { void actions.importDocx().then((r) => { if (r.kind === 'refused') actions.say(r.reason) }) } })
  // M253. A pack's two rows. Import shows what the pack holds and needs FIRST
  // and adds nothing until Add; export writes the library — not this canvas.
  out.push({ id: 'pack.export', title: 'Export a pack…', subtitle: 'your workflows, saved prompts and saved commands in one file — secrets scrubbed, credentials named and never carried', group: 'canvas', searchText: 'export pack share bundle discipline library workflows prompts presets', run: () => { void actions.exportPack() } })
  out.push({ id: 'pack.sample', title: 'Import the sample dev-relations pack…', subtitle: 'release notes, changelog, announcement and PR-comment workflows — shown first, added only when you choose Add', group: 'canvas', searchText: 'sample pack dev relations devrel release notes changelog announcement github', run: () => { void actions.importSamplePack() } })
  // M255. Publishing the SELECTED draft file. Disabled by name until exactly
  // one panel is selected; the action then checks it is a file and says so.
  // Main's own dialog shows the text and asks before anything is sent.
  const oneSelected = ctx.selectedIds.length === 1 ? undefined : 'select the one draft file to publish first'
  out.push(withReason({ id: 'publish.release', ...hiddenAtRestIf(oneSelected !== undefined), title: 'Publish as a GitHub release…', subtitle: 'the selected draft file becomes a release under the tag you type — you see the text before it is sent', group: 'canvas', searchText: 'publish github release notes tag draft', run: () => actions.beginPublish('release') }, oneSelected))
  out.push(withReason({ id: 'publish.comment', ...hiddenAtRestIf(oneSelected !== undefined), title: 'Comment on a pull request…', subtitle: 'the selected draft file becomes a comment on the PR you name — you see the text before it is sent', group: 'canvas', searchText: 'publish github comment pull request pr draft', run: () => actions.beginPublish('comment') }, oneSelected))
  out.push(withReason({ id: 'publish.discussion', ...hiddenAtRestIf(oneSelected !== undefined), title: 'Post a GitHub Discussion…', subtitle: 'the selected draft file becomes a Discussion in the category you name — you see the text before it is sent', group: 'canvas', searchText: 'publish github discussion announcement post draft', run: () => actions.beginPublish('discussion') }, oneSelected))
  out.push({ id: 'pack.import', title: 'Import a pack…', subtitle: 'shows what it holds and needs; nothing is added until you choose Add', group: 'canvas', searchText: 'import pack bundle open discipline library add', run: () => { void actions.importPack() } })
  // M255 (merge). An imported workflow is marked read by the button ON its
  // workflow panel (M252's `onMarkRead`), never by a palette row: M253's
  // `workflow.read.<id>` rows would have cleared ANY unread template —
  // a described tool's included — which `verify:verbs tool.door.1` forbids.
  // M187. One row per FORM, because "add a note" and "draw a region around
  // this work" are different intentions and a form picker would make a
  // person choose twice. Each says what its form is FOR (the empty-state
  // rule's sentence, from `noteFormSentence`).
  // Three LITERAL ids: `closure.v9.1` reads this file as text for each door's
  // row, and a template literal is a row it cannot see (which is exactly the
  // "a declaration is not a door" failure the check exists for).
  out.push({ id: 'note.add.sticky', title: 'Add a sticky note', subtitle: noteFormSentence('sticky'), group: 'canvas', searchText: 'note sticky add annotate label yellow', run: () => { actions.addNote('sticky') } })
  out.push({ id: 'note.add.text', title: 'Add free text', subtitle: noteFormSentence('text'), group: 'canvas', searchText: 'note text add type words heading', run: () => { actions.addNote('text') } })
  out.push({ id: 'note.add.frame', title: 'Add a named region', subtitle: noteFormSentence('frame'), group: 'canvas', searchText: 'note frame region group area label around', run: () => { actions.addNote('frame') } })
  // M388. The flowchart shape's rows — eight LITERAL ids, one per form, for
  // the reason the note rows above spell out (closure.v9.1 reads this file as
  // text; a template literal is a row it cannot see).
  out.push({ id: 'shape.add.process', title: 'Add a process step', subtitle: shapeFormSentence('process'), group: 'canvas', searchText: 'flowchart shape process step box diagram add', run: () => { actions.addShape('process') } })
  out.push({ id: 'shape.add.decision', title: 'Add a decision', subtitle: shapeFormSentence('decision'), group: 'canvas', searchText: 'flowchart shape decision diamond question branch diagram add', run: () => { actions.addShape('decision') } })
  out.push({ id: 'shape.add.terminator', title: 'Add a start or end', subtitle: shapeFormSentence('terminator'), group: 'canvas', searchText: 'flowchart shape terminator start end stadium pill diagram add', run: () => { actions.addShape('terminator') } })
  out.push({ id: 'shape.add.io', title: 'Add an input or output', subtitle: shapeFormSentence('io'), group: 'canvas', searchText: 'flowchart shape input output io parallelogram data diagram add', run: () => { actions.addShape('io') } })
  out.push({ id: 'shape.add.document', title: 'Add a document', subtitle: shapeFormSentence('document'), group: 'canvas', searchText: 'flowchart shape document doc page diagram add', run: () => { actions.addShape('document') } })
  out.push({ id: 'shape.add.subprocess', title: 'Add a subprocess', subtitle: shapeFormSentence('subprocess'), group: 'canvas', searchText: 'flowchart shape subprocess subroutine predefined diagram add', run: () => { actions.addShape('subprocess') } })
  out.push({ id: 'shape.add.junction', title: 'Add a junction', subtitle: shapeFormSentence('junction'), group: 'canvas', searchText: 'flowchart shape junction connector point circle merge diagram add', run: () => { actions.addShape('junction') } })
  out.push({ id: 'shape.add.text', title: 'Add diagram text', subtitle: shapeFormSentence('text'), group: 'canvas', searchText: 'flowchart shape text label caption diagram add', run: () => { actions.addShape('text') } })
  const shapeSelected = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'shape')?.id
  out.push(withReason({ id: 'shape.label', ...hiddenAtRestIf(shapeSelected === undefined), title: 'Edit this shape\'s label', subtitle: 'type on the shape itself — Escape or a click away keeps it', group: 'canvas', searchText: 'flowchart shape label text rename edit', run: () => { actions.editShapeLabel() } }, shapeSelected === undefined ? 'select a shape first' : undefined))
  out.push(withReason({ id: 'shape.style', ...hiddenAtRestIf(shapeSelected === undefined), title: 'Restyle this shape…', subtitle: 'form, fill, line or text', group: 'canvas', searchText: 'flowchart shape style form fill line colour stroke', run: () => actions.beginRunVerb('shape-style') }, shapeSelected === undefined ? 'select a shape first' : undefined))
  // M389–M391. The arranging and flowchart rows — LITERAL ids (closure.v9.1).
  const many = ctx.selectedIds.length
  out.push(withReason({ id: 'flowchart.connect', title: 'Connect two objects…', subtitle: 'an arrow between two objects — or drag from a port', group: 'canvas', searchText: 'flowchart connector connect arrow line link shapes', run: () => actions.beginRunVerb('connect') }, undefined))
  out.push({ id: 'flowchart.connector.style', title: 'Restyle a connector…', subtitle: 'route, arrows, line, dashed or label', group: 'canvas', searchText: 'connector line arrow route curved straight elbow dashed label style', run: () => actions.beginRunVerb('connector-style') })
  out.push(withReason({ id: 'flowchart.duplicate', ...hiddenAtRestIf(many === 0), title: 'Duplicate', subtitle: 'shapes, notes and pictures — ⌘D', group: 'canvas', searchText: 'duplicate copy clone shape note picture', run: () => { actions.duplicateObjects() } }, many === 0 ? 'select a shape, a note or a picture first' : undefined))
  out.push(withReason({ id: 'arrange.align.left', ...hiddenAtRestIf(many < 2), title: 'Align left edges', subtitle: 'line the selection up on its leftmost edge', group: 'canvas', searchText: 'align left arrange line up', run: () => { actions.alignObjects('left') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.hcentre', ...hiddenAtRestIf(many < 2), title: 'Align centres (horizontally)', subtitle: 'one vertical line through every centre', group: 'canvas', searchText: 'align centre center horizontal arrange', run: () => { actions.alignObjects('hcentre') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.right', ...hiddenAtRestIf(many < 2), title: 'Align right edges', subtitle: 'line the selection up on its rightmost edge', group: 'canvas', searchText: 'align right arrange', run: () => { actions.alignObjects('right') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.top', ...hiddenAtRestIf(many < 2), title: 'Align top edges', subtitle: 'line the selection up on its topmost edge', group: 'canvas', searchText: 'align top arrange', run: () => { actions.alignObjects('top') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.vcentre', ...hiddenAtRestIf(many < 2), title: 'Align middles (vertically)', subtitle: 'one horizontal line through every centre', group: 'canvas', searchText: 'align middle centre vertical arrange', run: () => { actions.alignObjects('vcentre') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.bottom', ...hiddenAtRestIf(many < 2), title: 'Align bottom edges', subtitle: 'line the selection up on its lowest edge', group: 'canvas', searchText: 'align bottom arrange', run: () => { actions.alignObjects('bottom') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.distribute.across', ...hiddenAtRestIf(many < 3), title: 'Space evenly across', subtitle: 'equal gaps, left to right; the outer two stay put', group: 'canvas', searchText: 'distribute space evenly horizontal across arrange', run: () => { actions.distributeObjects('across') } }, many < 3 ? 'select three or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.distribute.down', ...hiddenAtRestIf(many < 3), title: 'Space evenly down', subtitle: 'equal gaps, top to bottom; the outer two stay put', group: 'canvas', searchText: 'distribute space evenly vertical down arrange', run: () => { actions.distributeObjects('down') } }, many < 3 ? 'select three or more objects first' : undefined))
  out.push(withReason({ id: 'flowchart.layout.down', ...hiddenAtRestIf(shapeSelected === undefined && many < 2), title: 'Lay out this chart, top to bottom', subtitle: 'the selected chart in ranks, each shape travelling to its place', group: 'canvas', searchText: 'flowchart layout auto arrange tidy diagram vertical down', run: () => { actions.layoutFlowchart('down') } }, shapeSelected === undefined && many < 2 ? 'select a shape in a chart first' : undefined))
  out.push(withReason({ id: 'flowchart.layout.right', ...hiddenAtRestIf(shapeSelected === undefined && many < 2), title: 'Lay out this chart, left to right', subtitle: 'the selected chart in columns, each shape travelling to its place', group: 'canvas', searchText: 'flowchart layout auto arrange tidy diagram horizontal right', run: () => { actions.layoutFlowchart('right') } }, shapeSelected === undefined && many < 2 ? 'select a shape in a chart first' : undefined))
  out.push(withReason({ id: 'flowchart.plan', ...hiddenAtRestIf(shapeSelected === undefined), title: 'New task from this chart…', subtitle: 'its steps become a task plan — nothing runs until you press Start', group: 'canvas', searchText: 'flowchart plan start work task steps sketch diagram', run: () => { actions.planFromChart() } }, shapeSelected === undefined ? 'select a shape in a chart first' : undefined))
  out.push({ id: 'flowchart.import', title: 'Import a Mermaid flowchart…', subtitle: 'a .mmd or .md file becomes shapes you can edit — nothing in it runs', group: 'canvas', searchText: 'mermaid import flowchart diagram graph file', run: () => { void actions.importFlowchart() } })
  out.push({ id: 'flowchart.export.mermaid', title: 'Export the diagram as Mermaid…', subtitle: 'the selected chart, or every shape — secrets scrubbed, the count said', group: 'canvas', searchText: 'mermaid export flowchart diagram save text', run: () => { void actions.exportFlowchart('mermaid') } })
  out.push({ id: 'flowchart.export.svg', title: 'Export the diagram as SVG…', subtitle: 'a vector picture of the chart — text only, secrets scrubbed', group: 'canvas', searchText: 'svg export flowchart diagram image vector save', run: () => { void actions.exportFlowchart('svg') } })
  const notePanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'note')?.id
  out.push(withReason({ id: 'note.tint', ...hiddenAtRestIf(notePanelId === undefined), title: 'Tint this note…', subtitle: 'yellow, blue, green or pink', group: 'canvas', searchText: 'note tint colour yellow blue green pink sticky', run: () => actions.beginRunVerb('note-tint') }, notePanelId === undefined ? 'select a sticky note first' : undefined))
  // M186. The picture rows. `image.add` opens the verb line (a path is what
  // it needs and this app has no second file browser); `image.replace` acts on
  // the SELECTED picture through the system's own chooser, and is disabled by
  // name when the selection is not a picture.
  out.push({ id: 'image.add', title: 'Image: add a picture…', subtitle: 'from a file — or drop one on the canvas', group: 'canvas', searchText: 'image add picture png jpeg drop paste screenshot', run: () => actions.beginRunVerb('image-add') })
  // M543. One row per provider, so the palette names who the task goes to.
  // The ids are written out, not built from PROVIDERS: closure.v9.1 finds a
  // verb's palette row by its literal id.
  const cloudRow = ({ id, provider }: { id: string; provider: CloudProviderId }): void => {
    const label = CLOUD_PROVIDERS.find((p) => p.id === provider)?.label ?? provider
    out.push(withReason({ id, ...hiddenAtRestIf(workPanelId === undefined), title: `Task: send to ${label}`, subtitle: 'hand the selected work card\'s task to a cloud agent; it comes back as a pull request — you are asked before anything is sent', group: 'canvas', searchText: `task cloud send remote agent pull request ${provider} ${label}`, run: () => { if (workPanelId !== undefined) void actions.sendToCloud(workPanelId, provider).then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } }, workPanelId === undefined ? 'select a work card first' : undefined))
  }
  cloudRow({ id: 'task.cloud.copilot', provider: 'copilot' })
  cloudRow({ id: 'task.cloud.claude-action', provider: 'claude-action' })
  // M544. Hidden at rest like the send rows; the action refuses by name when the card's lane is not ready.
  out.push(withReason({ id: 'task.cloud.merge', ...hiddenAtRestIf(workPanelId === undefined), title: 'Task: merge the cloud pull request', subtitle: 'squash-merge the selected work card\'s cloud lane once its checks pass — re-checked and asked first', group: 'canvas', searchText: 'task cloud merge pull request ready accept land', run: () => { if (workPanelId !== undefined) void actions.mergeCloud(workPanelId).then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } }, workPanelId === undefined ? 'select a work card first' : undefined))
  out.push(withReason({ id: 'work.review', ...hiddenAtRestIf(workPanelId === undefined), title: 'Task: review the lane', subtitle: 'open the review for the selected work card\'s lane, beside the task and its conversation', group: 'canvas', searchText: 'task review lane work card changes diff ready handoff', run: () => { if (workPanelId !== undefined) { const r = actions.reviewTask(workPanelId); if (r.kind === 'refused') actions.say(r.reason) } } }, workPanelId === undefined ? 'select a work card first' : undefined))
  // M203 (D08). From a card, or from the one selected panel of a task; the
  // verb itself refuses by name for a panel in no task or in two.
  const taskPanelId = workPanelId ?? (ctx.selectedIds.length === 1 ? ctx.selectedIds[0] : undefined)
  out.push(withReason({ id: 'task.show', ...hiddenAtRestIf(taskPanelId === undefined), title: 'Task: show this task', subtitle: 'frame the selected card\'s task — or the task the selected panel belongs to; nothing moves', group: 'canvas', searchText: 'task show frame related lane conversation work card find navigate where', run: () => { if (taskPanelId !== undefined) { const r = actions.showTask(taskPanelId); if (r.kind === 'refused' || r.partial === true) actions.say(r.kind === 'refused' ? r.reason : (r.note ?? '')) } } }, taskPanelId === undefined ? 'select a work card, or one panel of a task, first' : undefined))
  out.push(withReason({ id: 'task.focus', ...hiddenAtRestIf(taskPanelId === undefined), title: 'Task: focus this task', subtitle: 'open the task beside its conversation — changes, checks, review and preview on one page; Esc comes back', group: 'canvas', searchText: 'task focus workspace conversation diff review checks preview open page', run: () => { if (taskPanelId !== undefined) { const r = actions.focusTask(taskPanelId); if (r.kind === 'refused') actions.say(r.reason) } } }, taskPanelId === undefined ? 'select a work card, or one panel of a task, first' : undefined))
  out.push(withReason({ id: 'task.related', ...hiddenAtRestIf(taskPanelId === undefined), title: 'Task: show related', subtitle: 'ring the task\'s panels and dim the rest; nothing moves — again to turn it off', group: 'canvas', searchText: 'task related highlight lens dim focus members show', run: () => { if (taskPanelId !== undefined) { const r = actions.showRelated(taskPanelId); if (r.kind === 'refused') actions.say(r.reason) } } }, taskPanelId === undefined ? 'select a work card, or one panel of a task, first' : undefined))
  // M258. Fit task — present at rest; the verb itself refuses by name with no task context.
  // M480. Tonight: start and stop, both through the one verb.
  // M548. The tournament's three rows: start on the selected card's task (its
  // check picks the winner), stop the live one, pick the winner it named.
  out.push(withReason({ id: 'task.tournament', ...hiddenAtRestIf(workPanelId === undefined), title: 'Task: run as a tournament', subtitle: 'the selected card\'s task on several agents at once, each in its own worktree — its check picks the winner', group: 'canvas', searchText: 'tournament compete agents race several models best of check winner bracket', run: () => { if (workPanelId !== undefined) void actions.runTournament(workPanelId).then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } }, workPanelId === undefined ? 'select a work card first' : undefined))
  // M606. The field is the person's to choose: the plain row runs the default
  // field (claude opus and sonnet, then codex, copilot), this one asks first.
  out.push(withReason({ id: 'task.tournament-field', ...hiddenAtRestIf(workPanelId === undefined), title: 'Task: run as a tournament with chosen agents…', subtitle: 'name two to six agents, such as claude:opus claude:sonnet codex', group: 'canvas', searchText: 'tournament choose agents field entrants models race compete', run: () => { if (workPanelId !== undefined) actions.beginTournamentField(workPanelId) } }, workPanelId === undefined ? 'select a work card first' : undefined))
  out.push({ id: 'task.tournament-stop', ...hiddenAtRestIf(true), title: 'Stop the tournament', subtitle: 'stop every entrant still running and score the field as it stands', group: 'canvas', searchText: 'tournament stop cancel bracket', run: () => { void actions.runTournament('stop').then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } })
  out.push({ id: 'task.tournament-pick', ...hiddenAtRestIf(true), title: 'Pick the tournament\'s winner', subtitle: 'keep the winner as the task\'s lane and close the other entrants\' chats; their worktrees stay until you remove them', group: 'canvas', searchText: 'tournament pick winner accept keep bracket', run: () => { void actions.runTournament('pick').then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } })
  out.push({ id: 'task.tournament-judge', ...hiddenAtRestIf(true), title: 'Judge the tournament', subtitle: 'a read-only claude chat compares the entrants that passed — advice; the scorer\'s pick stands until you choose', group: 'canvas', searchText: 'tournament judge compare review entrants bracket', run: () => { void actions.runTournament('judge').then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } })
  out.push({ id: 'task.tournament-combine', ...hiddenAtRestIf(true), title: 'Combine the tournament\'s entrants…', subtitle: 'open the task — its Combine tab puts lanes together and checks the result before anything lands', group: 'canvas', searchText: 'tournament combine best parts merge entrants bracket', run: () => { void actions.runTournament('combine').then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } })
  out.push({ id: 'task.tonight', title: 'Run tonight', subtitle: 'the open tasks, one auto run at a time while you are away — paused at usage limits, the Mac kept awake', group: 'canvas', searchText: 'tonight overnight batch night auto run queue away sleep', run: () => { void actions.runTonight().then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } })
  out.push({ id: 'task.tonight-stop', ...hiddenAtRestIf(true), title: 'Stop tonight\'s batch', subtitle: 'stop the current run and drop the rest of the queue; the Mac may sleep again', group: 'canvas', searchText: 'tonight stop overnight batch cancel', run: () => { void actions.runTonight('stop').then((r) => actions.say(r.kind === 'refused' ? r.reason : r.note ?? '')) } })
  out.push({ id: 'task.fit', title: 'Fit task', subtitle: 'frame the active task — the one Show related lit, else the selected panel\'s task', group: 'canvas', searchText: 'fit task frame zoom active lens focus camera', run: () => { const r = actions.fitTask(); if (r.kind === 'refused') actions.say(r.reason) } })
  out.push(withReason({ id: 'task.arrange', ...hiddenAtRestIf(taskPanelId === undefined), title: 'Task: arrange this task', subtitle: 'compact the task\'s panels in reading order, clear of everything else — one undo', group: 'canvas', searchText: 'task arrange tidy compact layout members gather', run: () => { if (taskPanelId !== undefined) { const r = actions.arrangeTask(taskPanelId); if (r.kind === 'refused') actions.say(r.reason) } } }, taskPanelId === undefined ? 'select a work card, or one panel of a task, first' : undefined))
  out.push(withReason({ id: 'image.replace', ...hiddenAtRestIf(imagePanelId === undefined), title: 'Image: replace this picture…', subtitle: 'choose different bytes for the selected picture', group: 'canvas', searchText: 'image replace picture missing repair choose', run: () => { if (imagePanelId !== undefined) void actions.replaceImage(imagePanelId) } }, imagePanelId === undefined ? 'select a picture panel first' : undefined))
  // M185, and M195's fifth. The preview's rows. Every one is PRESENT at rest — the verbs
  // refuse by name against no subject (this repo's rule: a row that
  // disappears is indistinguishable from a feature that was never built) —
  // and the ids are literals `closure.v9.1` reads this file as text for.
  out.push({ id: 'preview.open', title: 'Preview: open the project', subtitle: 'the page a process of the selected panel is serving', group: 'canvas', searchText: 'preview open project port dev server localhost discover', run: () => { void actions.openPreview() } })
  out.push({ id: 'preview.width', title: 'Preview: set the width…', subtitle: 'phone, tablet, laptop or full', group: 'canvas', searchText: 'preview width device phone tablet laptop responsive', run: () => actions.beginRunVerb('preview-width') })
  out.push({ id: 'preview.capture', title: 'Preview: capture the page', subtitle: 'a real picture of the pane, placed as an image on the canvas', group: 'canvas', searchText: 'preview capture screenshot picture image page', run: () => { void actions.capturePreview() } })
  out.push({ id: 'preview.bind', title: 'Preview: bind the source', subtitle: 'the selected panel\'s folder is the work this preview reloads for', group: 'canvas', searchText: 'preview bind source project folder reload own owner', run: () => { const r = actions.bindPreview(); if (r.kind === 'refused') actions.say(r.reason) } })
  out.push({ id: 'preview.dev', title: 'Preview: start the dev server', subtitle: "the project's own dev script, in a terminal you can see and stop", group: 'canvas', searchText: 'preview dev server npm run start serve project', run: () => { void actions.startDevServer() } })
  out.push({ id: 'onboarding.readiness', title: 'Check engine readiness', subtitle: 'Ask the login shell again which conversation engines are installed', group: 'canvas', searchText: 'onboarding setup install claude codex environment readiness', run: () => { void actions.checkReadiness() } })

  return out
}
