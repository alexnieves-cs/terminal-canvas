import { teamAskWords } from '@shared/team-asks'
import { handoffWords, reviewWords } from '@shared/team-flow'
import type { Command } from '../palette-model'
import { PERMISSION_MODES } from '@shared/cost'
import { statePriority } from '@renderer/panels/panel-state'
import { BACKENDS } from '@shared/agent-backends'
import { pinRefusal } from '@renderer/canvas/lod'
import { displayPath, displayLabel } from '@shared/display-path' // M178 (F.2): a verb row's target never prints a raw path
import type { PaletteContext } from './context'
import { REASON_NO_FOCUS, REASON_NO_REVIEW_TARGET_ACROSS, REASON_NO_WORKTREES, REASON_NOT_STARTED, REASON_NOT_AN_AGENT, REASON_NOTHING_TO_LINK, REASON_TERMINAL_LIVE, REASON_NOT_CLAUDE_SESSION, REASON_CHAT_BUSY, REASON_CHAT_EMPTY, REASON_NOT_CHAT, REASON_NO_APPROVALS } from './reasons'
import { withReason, hiddenAtRestIf } from './with-reason'
import { pendingReadBatch } from '@renderer/chat/read-batch'

/**
 * M620. Split out of palette/commands.ts, in the order buildCommands pushes
 * them: Panels: go to, rename and the per-panel verbs. Each section is its own function over the same context, so a
 * new row goes beside its neighbours instead of into one 2.7k-line function.
 */
export function panelRows(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []
  // --- Panels --------------------------------------------------------------

  for (const panel of ctx.panels) {
    // "Go to" KEEPS its verb, asymmetrically: the other two rows lost the
    // prefix their header now supplies, and this one does not. Two reasons.
    // The Panels section holds goto rows AND "Rename panel…", so the verb is
    // still doing work — and verify:panels 39 finds this row by the literal
    // text "Go to" before recomputing centreOn's arithmetic to prove WHERE the
    // camera landed, which is the most delicate assertion in that suite.
    //
    // A user-set title rides as the SUBTITLE: haystack() includes it, so this
    // is what makes a panel named "auth refactor" findable by typing "auth".
    // Conditional, not `subtitle: panel.title`, so an untitled panel gets no
    // subtitle key at all rather than one holding undefined.
    // M64. Identity leads: the NAME (the user's title when set), then a hint
    // of the state word and the path cut from the left. The path is
    // `pathText`, matched only as a contiguous substring — never fuzzy, so
    // typing "group" no longer lights g…o…u…p across /private/var. The
    // user's title and the name are the searchText, so a title still finds
    // its row.
    // No "Go to" prefix (M64, after the critic): ten rows under a PANELS
    // heading repeating the verb pushed identity six characters right. The
    // verb lives in the footer ("↵ go to") and in searchText, so typing
    // "go to" still lists every panel. The state word is rendered LIVE by
    // the palette from `state` + the store, in its tone; the build-time
    // `stateWord` is only the `state:` query's key.
    const name = panel.title ?? panel.name ?? panel.label
    out.push({
      id: `panel.goto.${panel.id}`,
      title: name,
      mono: true,
      // M175. The path rule's one helper (a panel row knows no repository root, so this is its last-two-segments arm — backlog #86 is the root).
      ...(panel.path === undefined ? {} : { subtitle: displayPath(panel.path).short, pathText: panel.path }),
      ...(panel.state === undefined ? {} : { state: { id: panel.id, input: panel.state } }),
      ...(panel.stateWord === undefined ? {} : { stateWord: panel.stateWord, statePriority: statePriority(panel.stateWord) }),
      searchText: `go to ${panel.title !== undefined ? `${panel.title} ${panel.name ?? ''}` : (panel.name ?? '')}`,
      group: 'panel',
      run: () => actions.goToPanel(panel.id)
    })
  }

  {
    const target = ctx.panels.find((p) => p.id === ctx.capturedId)
    out.push(
      withReason(
        {
          id: 'panel.rename',
          title: 'Rename panel…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.beginRenamePanel(ctx.capturedId!, target?.title ?? '')
        },
        // Aimed at the CAPTURED panel, not at a row's own panel: opening the
        // palette moves DOM focus to the input but deliberately leaves
        // focusedId alone, and that captured id is what every panel-acting
        // command targets.
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
    // M74. The two front-end verbs, aimed at the captured panel like Restart,
    // each refused BY NAME in every situation it cannot apply — never hidden.
    const termLive = target !== undefined && target.kind === 'terminal' && target.state?.status?.kind === 'running'
    out.push(
      withReason(
        {
          id: 'panel.open-as-chat', ...hiddenAtRestIf(ctx.capturedId === null),
          title: 'Open as chat',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          searchText: 'open as chat conversation front-end claude session transcript',
          group: 'panel',
          run: () => actions.openAsChat(ctx.capturedId!)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS
          : target === undefined || target.kind !== 'terminal' || target.claude !== true ? REASON_NOT_CLAUDE_SESSION
            : termLive ? REASON_TERMINAL_LIVE : undefined
      )
    )
    // M383. A conversation scrubbed back to any turn, its files as they stood
    // then, and another beside it — the Replay sheet, a view. Offered on the
    // captured panel when it is a chat; any other panel names why not.
    out.push(
      withReason(
        {
          id: 'chat.replay', ...hiddenAtRestIf(ctx.capturedId === null),
          title: 'Replay this conversation…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          searchText: 'replay rewind history timeline turn files virtual filesystem compare runs side by side conversation chat',
          group: 'panel',
          run: () => actions.openReplay(ctx.capturedId!)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS
          : target === undefined || target.kind !== 'chat' ? 'select a conversation first — a replay is read from a chat\'s own transcript'
            : undefined
      )
    )
    // M76. Two rows per pending request, named with the tool and the panel;
    // with nothing pending ONE disabled row whose reason says so. The rows
    // are what the OS notification, the popover and the pane all lead to:
    // an answer given from wherever the user is.
    const approvals = ctx.approvals ?? []
    for (const a of approvals) {
      const where = `${a.toolName} · ${a.label}`
      out.push({
        id: `approval.allow.${a.id}.${a.requestId}`, title: `Allow ${where}`, subtitle: a.argument, mono: true,
        searchText: `allow approve permission needs you ${a.toolName} ${a.label}`, group: 'panel',
        run: () => actions.answerApproval(a.id, a.requestId, true)
      })
      out.push({
        id: `approval.deny.${a.id}.${a.requestId}`, title: `Deny ${where}`, subtitle: a.argument, mono: true,
        searchText: `deny refuse permission needs you ${a.toolName} ${a.label}`, group: 'panel',
        run: () => actions.answerApproval(a.id, a.requestId, false)
      })
    }
    // M533 (G3). One row for the whole batch of reads, beside the per-request
    // rows, with the count in its title so the press says what it will do.
    if (approvals.length > 0) {
      const reads = pendingReadBatch(approvals.map((a) => a.id))
      out.push(withReason({
        id: 'approval.allow-reads', title: `Allow every pending read (${reads.length})`, group: 'panel',
        subtitle: 'reads and searches inside each chat\'s folder, once each — writes and commands still wait for you',
        searchText: 'allow all every read reads search batch approve permission needs you',
        // Recomputed at the press: a list from when the palette was built can name a request id a restarted agent reused.
        run: () => { for (const r of pendingReadBatch(approvals.map((a) => a.id))) actions.answerApproval(r.panelId, r.requestId, true) }
      }, reads.length === 0 ? 'no pending request is a read inside its chat\'s folder' : undefined))
    }
    // M379. A teammate's agent asking (M376): two rows per ask, the Needs-you
    // section's two answers, so an ask can be answered from wherever the
    // person is. Allow is ONCE — a standing grant is the agent owner's alone.
    for (const t of ctx.teamAsks ?? []) {
      const w = teamAskWords(t)
      out.push({
        id: `team.allow.${t.workspaceId}.${t.askId}`, title: `Allow once — ${w.who}`, subtitle: w.action, mono: true,
        searchText: `allow approve team teammate ask needs you ${t.tool} ${w.who}`, group: 'panel',
        run: () => actions.answerTeamAsk(t.workspaceId, t.askId, true)
      })
      out.push({
        id: `team.deny.${t.workspaceId}.${t.askId}`, title: `Deny — ${w.who}`, subtitle: w.action, mono: true,
        searchText: `deny refuse team teammate ask needs you ${t.tool} ${w.who}`, group: 'panel',
        run: () => actions.answerTeamAsk(t.workspaceId, t.askId, false)
      })
    }
    // M583. The multiplayer canvas from wherever the person is: hand an agent
    // they hold to someone in the room (or to anyone), put it up for review,
    // and the Needs-you section's own verbs for what is waiting on them. The
    // captured panel's rows stand at rest; every other held agent's are found
    // by typing, so a canvas of twenty agents does not bury the list.
    const flow = ctx.teamFlow
    for (const h of flow?.held ?? []) {
      const atRest = h.panelId === ctx.capturedId
      const who = h.title === '' ? 'this agent' : h.title
      for (const t of (flow?.teammates ?? []).filter((x) => x.workspaceId === h.workspaceId)) {
        out.push({
          id: `team.handoff.${h.workspaceId}.${h.panelId}.${t.userId}`, title: `Hand off ${who} to ${t.name}`, group: 'panel', ...(atRest ? {} : { hiddenAtRest: true }),
          subtitle: 'they hold it from then on — its questions and review go to them; it keeps running here',
          searchText: `hand off handoff pass give teammate team ${t.name} ${who}`,
          run: () => actions.teamFlow({ kind: 'hand-off', workspaceId: h.workspaceId, panelId: h.panelId, to: t.userId, note: '' })
        })
      }
      out.push({
        id: `team.handoff.${h.workspaceId}.${h.panelId}.anyone`, title: `Offer ${who} to anyone on the team`, group: 'panel', ...(atRest ? {} : { hiddenAtRest: true }),
        subtitle: 'the first teammate to take it holds it',
        searchText: `hand off handoff offer anyone team teammate ${who}`,
        run: () => actions.teamFlow({ kind: 'hand-off', workspaceId: h.workspaceId, panelId: h.panelId, to: '', note: '' })
      })
      out.push({
        id: `team.review.ask.${h.workspaceId}.${h.panelId}`, title: `Ask the team to review ${who}`, group: 'panel', ...(atRest ? {} : { hiddenAtRest: true }),
        subtitle: 'puts it in the shared review queue — anyone but you can approve it or ask for changes',
        searchText: `review ask team queue approve second pair of eyes ${who}`,
        run: () => actions.teamFlow({ kind: 'ask-review', workspaceId: h.workspaceId, panelId: h.panelId, title: who, summary: '' })
      })
    }
    for (const r of flow?.handoffs ?? []) {
      const w = handoffWords(r)
      out.push({
        id: `team.take.${r.workspaceId}.${r.handoffId}`, title: `Take ${w.who}`, subtitle: r.note === '' ? w.ask : r.note, group: 'panel',
        searchText: `take accept handoff handed team teammate needs you ${w.who}`,
        run: () => actions.teamFlow({ kind: 'take', workspaceId: r.workspaceId, handoffId: r.handoffId })
      })
    }
    for (const r of flow?.reviews ?? []) {
      const w = reviewWords(r)
      out.push({
        id: `team.review.approve.${r.workspaceId}.${r.reviewId}`, title: `Approve — ${r.title}`, subtitle: w.who, group: 'panel',
        searchText: `approve review team queue needs you ${r.title} ${w.who}`,
        run: () => actions.teamFlow({ kind: 'approve', workspaceId: r.workspaceId, reviewId: r.reviewId })
      })
      out.push({
        id: `team.review.changes.${r.workspaceId}.${r.reviewId}`, title: `Ask for changes — ${r.title}`, subtitle: w.who, group: 'panel',
        searchText: `request changes review team queue needs you ${r.title} ${w.who}`,
        run: () => actions.teamFlow({ kind: 'request-changes', workspaceId: r.workspaceId, reviewId: r.reviewId })
      })
    }
    if (approvals.length === 0) {
      out.push(withReason({
        id: 'approval.none', title: 'Answer a permission request…', searchText: 'allow deny approve permission needs you', group: 'panel', hiddenAtRest: true,
        run: () => {}
      }, REASON_NO_APPROVALS))
    }
    out.push(
      withReason(
        {
          id: 'panel.open-in-terminal', ...hiddenAtRestIf(ctx.capturedId === null),
          title: 'Open in terminal',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          searchText: 'open in terminal front-end resume claude session',
          group: 'panel',
          run: () => actions.openInTerminal(ctx.capturedId!)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS
          : target === undefined || target.kind !== 'chat' ? REASON_NOT_CHAT
            : target.backend !== undefined && !BACKENDS[target.backend].terminalDoor ? BACKENDS[target.backend].reasons.noTerminal
            : target.busy === true ? REASON_CHAT_BUSY
              : (target.turns ?? 0) === 0 ? REASON_CHAT_EMPTY : undefined
      )
    )
    out.push(
      withReason(
        {
          id: 'panel.restart',
          title: 'Restart panel…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.restartPanel(ctx.capturedId!)
        },
        // TWO different blocked situations with two different fixes: "click a
        // panel first" and "this panel has not started". Collapsing them into
        // one reason tells a user who HAS focused a panel to focus a panel,
        // which is worse than no reason at all — it sends them to do the one
        // thing they already did. Not hiddenAtRest, and a plain withReason
        // call, both matching the Rename row directly above: two adjacent rows
        // aimed at the same captured panel that behaved differently would read
        // as a surprise rather than as a design.
        ctx.capturedId === null
          ? REASON_NO_FOCUS
          : (target?.restartable === true ? undefined : REASON_NOT_STARTED)
      )
    )
    // M20. The door, and one row per permission mode inside it.
    //
    // ONE ROW PER VALUE rather than a SettingDef: `SettingDef['type']` has no
    // 'enum' member, and CLAUDE.md records that removal as deliberate — a
    // customer-free abstraction per ideas-backlog #11. A multi-valued choice
    // expressed as N command rows inside a scope needs no such type at all, so
    // that decision stays closed. These are per-PANEL anyway, not global, so a
    // setting would have been the wrong shape even if the type existed.
    // M92. Six rows, three pairs, every one PRESENT: the half that does not
    // apply is disabled naming the state, so a user who does not know a panel
    // is locked learns it from the row rather than from a drag that refuses.
    {
      const need = ctx.capturedId === null || target === undefined ? REASON_NO_FOCUS : undefined
      const pins = ctx.pinnedCount ?? 0
      const pair = (id: string, title: string, run: (pid: string) => void, reason: string | undefined): void => {
        out.push(withReason({ id, title, subtitle: target ? (target.title ?? target.label) : 'no panel', group: 'panel', ...hiddenAtRestIf(ctx.panels.length === 0), run: () => run(ctx.capturedId!) }, need ?? reason))
      }
      pair('panel.lock', 'Lock panel', actions.lockPanel, target?.locked === true ? 'already locked — Unlock panel is the row' : undefined)
      pair('panel.unlock', 'Unlock panel', actions.unlockPanel, target?.locked === true ? undefined : 'not locked')
      pair('panel.pin', 'Pin panel live', actions.pinPanel, target === undefined ? undefined : pinRefusal(target.kind, target.pinned === true, pins))
      pair('panel.unpin', 'Unpin panel', actions.unpinPanel, target?.pinned === true ? undefined : 'not pinned')
      pair('panel.maximise', 'Maximise panel', actions.maximisePanel, target?.maximised === true ? 'already maximised — Restore panel is the row' : undefined)
      pair('panel.restore', 'Restore panel', actions.restorePanel, target?.maximised === true ? undefined : 'not maximised')
    }

    out.push(
      withReason(
        {
          id: 'panel.mode',
          title: 'Restart in permission mode…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          searchText: 'permission mode plan accept edits bypass agent claude',
          hiddenAtRest: true,
          entersScope: 'agent-mode',
          run: () => {}
        },
        // The same two distinct reasons panel.restart carries, plus a third of
        // this verb's own: a panel with no agent has no mode to be in, and
        // offering the verb there would promise something the flag cannot do —
        // agentArgs is gated on spec.agent, so it would emit nothing at all.
        ctx.capturedId === null
          ? REASON_NO_FOCUS
          : target?.restartable !== true
            ? REASON_NOT_STARTED
            : target?.agent !== true
              ? REASON_NOT_AN_AGENT
              : undefined
      )
    )
    for (const mode of PERMISSION_MODES) {
      out.push(
        withReason(
          {
            id: `panel.mode.${mode}`,
            title: mode,
            subtitle: target ? (target.title ?? target.label) : 'no panel',
            group: 'panel',
            scope: 'agent-mode',
            hiddenAtRest: true,
            searchText: `permission mode ${mode}`,
            run: () => actions.restartPanelWithMode(ctx.capturedId!, mode)
          },
          ctx.capturedId === null
            ? REASON_NO_FOCUS
            : target?.restartable !== true
              ? REASON_NOT_STARTED
              : target?.agent !== true
                ? REASON_NOT_AN_AGENT
                : undefined
        )
      )
    }
    out.push(
      withReason(
        {
          id: 'panel.link', ...hiddenAtRestIf(ctx.panels.length === 0),
          title: 'Link this panel to\u2026',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.beginLink(ctx.capturedId!)
        },
        // TWO different blocked situations with two different fixes, the shape
        // panel.restart and panel.review both state: "click a panel first" and
        // "there is nothing on this canvas to link to". Collapsing them tells
        // a user who HAS selected a panel to select a panel.
        //
        // The second is this verb's own case rather than a copy: a link needs
        // a SECOND endpoint, so a canvas holding one panel can offer the verb
        // and never complete it.
        ctx.capturedId === null
          ? REASON_NO_FOCUS
          : (ctx.panels.length < 2 ? REASON_NOTHING_TO_LINK : undefined)
      )
    )
    out.push(
      withReason(
        {
          id: 'panel.toolbox', ...hiddenAtRestIf(ctx.panels.length === 0),
          title: target === undefined ? 'Open toolbox' : `Open toolbox for ${displayLabel(target.label)}`,
          subtitle: 'its skills, tools and permissions — add a skill so it loads instructions only when they apply',
          searchText: 'toolbox skills mcp hooks commands subagents permissions what can this agent do',
          group: 'panel',
          run: () => { if (target !== undefined) actions.openToolbox(target.id) }
        },
        // ONE reason, not two, and the difference from the Restart and review
        // rows beside it is the point: those gate on "has this panel ever
        // spawned", because a baseline only exists once it has. A toolbox
        // answers for a DIRECTORY, which a panel has from the moment it is
        // minted — so a panel that never started still has a perfectly good
        // toolbox, and refusing one here would be a wrong answer rather than
        // a cautious one.
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
    // M86. Every worktree of the subject's repository in one node, disabled by
  // name when this app has made none: the ordinary review already answers
  // for a single tree.
  out.push(
    withReason(
      {
        id: 'panel.review.across', ...hiddenAtRestIf(ctx.panels.length === 0),
        title: target === undefined ? 'Review every worktree' : `Review every worktree of ${displayLabel(target.label)}'s repository`,
        searchText: 'review worktree worktrees branches across all git',
        group: 'panel',
        run: () => { if (target !== undefined) actions.reviewAcross(target.id) }
      },
      // The SAME gate the ordinary review row keeps (a file, a memory node
      // or a never-started panel has nothing to review across), then the
      // worktree count — an enabled row that does nothing on click is the
      // failure the reason exists to prevent (M86's verifier).
      ctx.capturedId === null || target === undefined
        ? REASON_NO_REVIEW_TARGET_ACROSS
        : (target.reviewable !== undefined ? !target.reviewable : !target.restartable)
          ? (target.reviewReason ?? REASON_NOT_STARTED)
          : ctx.worktrees.length === 0 ? REASON_NO_WORKTREES : undefined
    )
  )
  out.push(
      withReason(
        {
          id: 'panel.review', ...hiddenAtRestIf(ctx.panels.length === 0),
          title: target === undefined ? 'Open review' : `Open review of ${displayLabel(target.label)}`,
          searchText: 'review changes diff git what changed',
          group: 'panel',
          run: () => { if (target !== undefined) actions.openReview(target.id) }
        },
        // The SAME field the Restart row gates on, deliberately not a second
        // boolean: "has this panel ever spawned" is one fact, and it is
        // exactly the question both verbs ask — a panel that never started
        // has no baseline, so there is nothing to review it against. Two
        // flags derived from one status would agree the day they were
        // written and disagree the first time one of them was wrong.
        ctx.capturedId === null || target === undefined
          ? REASON_NO_FOCUS
          : target.reviewable !== undefined
            ? (target.reviewable ? undefined : (target.reviewReason ?? REASON_NOT_STARTED))
            : (target.restartable ? undefined : REASON_NOT_STARTED)
      )
    )
  }

  return out
}
