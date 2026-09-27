/**
 * Presets, panels and sessions.
 *
 * What a panel IS and what its session does: spawning from a preset, the
 * spawn sheet, the panel lifecycle verbs (lock/pin/maximise/restart), the
 * worktree rows and the Auto verbs.
 *
 * One slice of `usePaletteActions`. Every body here is the one that lived in
 * that file before the split, moved verbatim — see `./types.ts` for why `ctx.self`
 * is the object under construction rather than a getter.
 */

import { answerTeamAsk as answerTeamAskInStore } from '@renderer/shell/useTeamAsks'
import { notifyRefused } from '../../shell/toast'
import { normalisePreviewPath } from '@shared/preview'
import { inspectionDirectory } from '../inspection-directory'
import { BACKEND_IDS, DEFAULT_BACKEND } from '@shared/agent-backends'
import { backendAvailable, claudeAvailable, codexAvailable } from '@renderer/palette/commands'
import { carryMarks } from '@renderer/panels/panels'
import { approvals, isAnswered, markAnswered, reportedModels, scrollToTurn, unmarkAnswered } from '@renderer/chat/chat-store'
import { refreshChatGrants } from '@renderer/chat/useChatSessions'
import { withdrawApprovalOutcome } from '@renderer/shell/approval-outcome'
import { normaliseTypedUrl } from '@shared/browser-panel'
import { denyMessageFor } from '@renderer/chat/chat-model'
import type { SpawnResult } from '@shared/ipc-contract'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { getLiveSession } from '@renderer/session/live-session-store'
import { buildSpawnRequest } from '@renderer/palette/spawn-sheet'
import { LINEUPS, lineupPlan, type Lineup } from '@shared/lineups'
import { getChat } from '@renderer/chat/chat-store'
import { templateRefusal } from '@renderer/palette/template-model'
import { SUPERVISOR_PROMPT } from '@shared/agent-session'
import { isWatcherPanel, isGithubPanel, isMemoryPanel, isBrowserPanel, isWorkPanel, isSkillPanel, isImagePanel, isNotePanel, isRelayPanel, isChatPanel, isFilePanel, isJiraPanel, isReviewPanel, isTerminalPanel, isToolboxPanel, isWorkflowPanel, type Panel } from '@renderer/panels/panels'
import type { CapturedPanel } from '@shared/ipc-contract'
import { railLabel } from '../../shell/rail-rows'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'
import { adoptedRunId, permissionRecordTitle, recordOrchEvent } from '../../orchestration/orch-record'

export type PresetsActions = Pick<PaletteActions,
  | 'spawnPreset'
  | 'beginRenamePreset'
  | 'deletePreset'
  | 'setDefaultPreset'
  | 'setPresetWorktree'
  | 'beginRemoveWorktree'
  | 'revealWorktree'
  | 'savePanelAsPreset'
  | 'beginSpawnSheet'
  | 'closePanel'
  | 'startPanel'
  | 'lockPanel'
  | 'unlockPanel'
  | 'pinPanel'
  | 'unpinPanel'
  | 'maximisePanel'
  | 'restorePanel'
  | 'beginAnnotate'
  | 'restartPanel'
  | 'restartPanelWithMode'
  | 'beginRenamePanel'
  | 'setPanelFontSize'
  | 'markPresetRead'
  | 'startAuto'
  | 'stopAuto'
  | 'answerApproval'
  | 'answerTeamAsk'
  | 'openAsChat'
  | 'openInTerminal'
  | 'newChat'
  | 'newSandboxChat'
  | 'scrollChatTurn'
  | 'openToolbox'
  | 'openSkillPanel'
  | 'beginBrowser'
  | 'goToPanel'
  | 'jumpPrompt'
  | 'copyLastOutput'
>

export function presetsActions(ctx: ActionCtx): PresetsActions {
  const {
    markPresetReadNow, registry, palette, panelsRef, displayPanelsRef, presetRows, settingRows,
    centreOn, worldCentre, selectAndRaise, onSelectPanel, onClosePanel, openToolboxPanel,
    beginNewChat, openAsChat, openInTerminal, instantiateTemplate, lockPanel, unlockPanel,
    pinPanel, unpinPanel, maximisePanel, restorePanel, beginAnnotate, restartWithSpec,
    commitHistory, reloadPresets, reloadWorktrees, worktreeRows, setPanels, setInputMode,
    teammatesRef, openBrowserPanel, openSkillPanel, self, intoNewWorkspace, boardVerbsRef
  } = ctx
  return ({
    spawnPreset: (id) => {
      const row = presetRows.find((p) => p.id === id)
      // buildCommands already disables an unavailable row, so this is the
      // second half of the same rule rather than the only one: a stale list —
      // the palette was open while the store changed — must not spawn a panel
      // that dies instantly with "command not found".
      if (!row || !row.available) return
      // Routed through the SAME main-side path the menu uses, so a palette
      // spawn and a menu spawn cannot drift: main resolves the template
      // (absent command included) and sends PRESET_SPAWN back, which Canvas
      // already handles through onSpawn — which is what gives it the ordinary
      // undo behaviour, where removing a panel disposes its session.
      void window.canvas.preset.spawnById(id)
    },
    beginRenamePreset: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: `Rename \u201c${currentName}\u201d to\u2026`,
        initial: currentName,
        submit: (value) => {
          void window.canvas.preset.rename(id, value).then(() => {
            setInputMode(null)
            reloadPresets()
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // — and the effect above would immediately clear it again. Reopening in
      // the same batch is what turns "run the rename command" into "the
      // palette is now a text field", which is the whole point of input mode.
      palette.openPalette()
    },
    deletePreset: (id) => {
      // Gated, not instant. A delete row sat one Enter away from destroying a
      // preset, styled identically to "Go to n1", and the fuzzy matcher will
      // happily put it under a query the user aimed somewhere else.
      //
      // The gate is input mode rather than a dialog, and that is not a
      // shortcut: M5a deferred preset editing entirely because "building a
      // preset-manager dialog now would be the first modal in this app, and it
      // would collide with xterm's keyboard focus". Input mode is that problem
      // already solved, so a confirm inherits all four of usePalette's focus
      // rules instead of reopening the question.
      const name = presetRows.find((p) => p.id === id)?.name ?? id
      setInputMode({
        kind: 'confirm',
        label: `Delete preset \u201c${name}\u201d?`,
        initial: '',
        submit: () => {
          void window.canvas.preset.remove(id).then(reloadPresets)
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // and the clear-on-close effect would wipe it again — the same pairing
      // beginRenamePreset makes, for the same reason.
      palette.openPalette()
    },
    setDefaultPreset: (id) => {
      // No local bookkeeping: main answers by pushing PRESET_DEFAULT, which
      // the existing subscription writes into defaultTemplateRef. One source
      // of truth for what Cmd+N spawns, and it is main's.
      void window.canvas.preset.setDefault(id).then(reloadPresets)
    },
    setPresetWorktree: (id, on) => {
      // Main owns the store and refuses a built-in; the reload is what makes
      // the toggle row's own title flip.
      void window.canvas.preset.setWorktree(id, on).then(reloadPresets)
    },
    beginRemoveWorktree: (id) => {
      // Gated, for deletePreset's reason. The question names the BRANCH,
      // because that is what the user would recognise; the path is in the
      // row's subtitle they just read. A dirty tree is refused by git itself
      // and the refusal comes back as a note in the palette's input mode
      // rather than as silence.
      const row = worktreeRows.find((w) => w.id === id)
      const branch = row?.branch ?? id
      setInputMode({
        kind: 'confirm',
        label: `Remove worktree “${branch}”? Its branch stays; git refuses if the tree is dirty.`,
        initial: '',
        submit: () => {
          void window.canvas.worktree.remove(id).then((result) => {
            reloadWorktrees()
            if (result.kind === 'refused' || result.kind === 'failed') {
              // Shown, never swallowed: a remove that did nothing and said
              // nothing reads as the row being broken. Input mode is the one
              // surface the palette already has for a sentence the user must
              // read; `submit` closes it.
              setInputMode({ kind: 'confirm', label: `Not removed — ${result.reason}`, initial: '', submit: () => {} })
              palette.openPalette()
            }
          })
        }
      })
      palette.openPalette()
    },
    revealWorktree: (id) => {
      void window.canvas.worktree.reveal(id)
    },
    savePanelAsPreset: (id) => {
      // displayPanelsRef, not panelsRef, and this is the read-only split
      // deciding in favour of ON SCREEN rather than SAVED for once. While
      // merged the inspector can have a FOREIGN panel selected, and against
      // panelsRef the lookup simply found nothing: the Save control stayed
      // enabled and did nothing at all — an affordance that lies, which is
      // worse than a disabled one with a reason, and worse again because the
      // user's next move is to press it harder.
      //
      // Saving a foreign panel is safe where DRAGGING one is not, and the
      // difference is direction: a preset is a READ of the panel's spec and
      // its box into a store of its own. It writes no workspace record, moves
      // no session, and the lane offset never reaches it — the rect's w/h are
      // the only geometry a preset carries, and lanes translate, so they are
      // the panel's own numbers either way.
      const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
      // Nothing to save for a sessionless panel: neither a review node nor a
      // file panel has a spec, and the preset either would produce is a shell
      // in a directory it never named. The POSITIVE test, so a fourth kind is
      // a compile error here rather than a shell spawned in a stranger's cwd.
      if (!panel || !isTerminalPanel(panel)) return
      // Where the panel IS, falling back to where it was spawned — the same
      // asymmetry reloadPrompts obeys, stated there in full.
      const captured: CapturedPanel = {
        cwd: getLiveSession(panel.rect.id)?.cwd ?? panel.spec.cwd,
        args: [...panel.spec.args],
        w: panel.rect.w,
        h: panel.rect.h
      }
      // Absent stays absent: a captured login-shell panel must save as a
      // login-shell preset, not as whatever this machine's shell happens to
      // be. Built field by field for the same reason onCapture is.
      if (panel.spec.command !== undefined) captured.command = panel.spec.command
      if (panel.spec.agent !== undefined) captured.agent = panel.spec.agent
      // M20. Both capture surfaces carry it, never one — presetFromCapture is
      // the shared mint precisely so the menu's path and the inspector's
      // cannot disagree about what a saved preset is, and a knob added to one
      // only would give a user two different presets for one panel depending
      // on which surface saved it.
      if (panel.spec.agentOptions !== undefined) captured.agentOptions = panel.spec.agentOptions
      void window.canvas.preset.savePanel(captured).then(reloadPresets)
    },
    // M174. `seed.cwd` is the launcher's recents chip: the sheet opens ON that folder.
    beginSpawnSheet: (templateId?: string, into?: { intoNewWorkspace: true }, seed?: { cwd: string }) => {
      // The focused panel's LIVE directory first (M12's poll, falling back to
      // the spawn cwd), then main's recent list, then every panel's directory.
      // The captured id while the palette is open; from the menu (palette
      // closed) the most recently focused panel, which the registry records.
      const focusedAt = registry.lastFocusedAt()
      const lastFocused = Object.keys(focusedAt).sort((a, b) => focusedAt[b] - focusedAt[a])[0]
      const captured = palette.capturedId ?? lastFocused ?? null
      const focusedPanel = captured === null ? undefined : panelsRef.current.find((p) => p.rect.id === captured)
      const focusedCwd = seed !== undefined ? seed.cwd : focusedPanel !== undefined && isTerminalPanel(focusedPanel)
        ? (getLiveSession(focusedPanel.rect.id)?.cwd ?? focusedPanel.spec.cwd)
        : undefined
      const panelDirs = panelsRef.current.filter(isTerminalPanel).map((p) => getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd)
      const presets = presetRows.map((p) => ({ id: p.id, name: p.name, available: p.available, ...(p.agent === undefined ? {} : { agent: p.agent }), ...(p.cwd === undefined ? {} : { cwd: p.cwd }), ...(p.agentOptions === undefined ? {} : { agentOptions: p.agentOptions }) }))
      const defaultPresetId = presetRows.find((p) => p.isDefault)?.id ?? presetRows[0]?.id ?? ''
      // M262. The times ride a separate read that may fail on its own: an old
      // main without the handler costs the list its dates, never the sheet.
      void Promise.all([window.canvas.spawn.recent(), window.canvas.template.list(), window.canvas.spawn.recentUsed().catch(() => ({}))]).then(([recents, templateList, recentUsed]) => {
        const claudeOk = claudeAvailable(presetRows)
        const templates = templateList.map((template) => {
          const refusal = templateRefusal(template, presetRows, claudeOk)
          return refusal === undefined ? { template } : { template, refusal }
        })
        setInputMode({
          kind: 'sheet',
          label: 'New panel',
          initial: '',
          submit: () => {},
          sheet: {
            presets, defaultPresetId, ...(focusedCwd === undefined ? {} : { focusedCwd }), recents, recentUsed, panelDirs,
            // M262. Task first: the switch in the sheet's header. Not offered
            // for a template or a new-workspace instantiation — both are a
            // shape already chosen, and a task would drop it.
            ...(templateId === undefined && into === undefined ? { startTask: () => self.beginStartWork() } : {}),
            claudeAvailable: claudeOk,
            codexAvailable: codexAvailable(presetRows),
            // M118. Every row's availability from the registry's order — a third row needs no new boolean.
            available: Object.fromEntries(BACKEND_IDS.map((id) => [id, backendAvailable(presetRows, id)])),
            // M99. What live sessions have reported, for the model field's suggestions.
            reportedModels: reportedModels(),
            hasSupervisor: panelsRef.current.some((p) => isChatPanel(p) && p.chat.supervisor === true),
            templates,
            ...(templateId === undefined ? {} : { templateId }),
            instantiate: into === undefined ? instantiateTemplate : intoNewWorkspace,
            teammates: teammatesRef.current,
            // M104. The ceiling as read live: the preview says who queues before Enter.
            ceiling: { maxConcurrent: Number(settingRows.find((r) => r.id === 'agents.maxConcurrent')?.value ?? 0), liveAgents: panelsRef.current.filter((p) => isChatPanel(p) && (getChat(p.rect.id).snapshot?.status === 'streaming' || getChat(p.rect.id).snapshot?.status === 'starting')).length,
              // M121. Sends already waiting behind the ceiling take room too.
              queued: panelsRef.current.reduce((n, p) => n + (isChatPanel(p) ? (getChat(p.rect.id).snapshot?.queued ?? 0) : 0), 0) },
            // M73. A chat is minted HERE, never sent to spawn:sheet: main
            // validates the directory and the CLI through agent:create and
            // the refusal is shown in the sheet like any other.
            // M81. A supervisor is a chat created with the supervisor's own
            // system prompt and its first question in the composer — unsent,
            // like a template's (M80): nothing starts work unread.
            submit: (values) => values.what.kind === 'supervisor'
              ? beginNewChat({ cwd: values.cwd, title: values.title === '' ? 'supervisor' : values.title, agentOptions: values.agentOptions, appendSystemPrompt: SUPERVISOR_PROMPT, message: 'What is this canvas doing?' })
              : values.what.kind === 'chat'
                // M118. The backend by NAME from the arm, never a switch: absent is claude.
                ? beginNewChat({ cwd: values.cwd, title: values.title, agentOptions: values.agentOptions, ...(values.what.backend === undefined ? {} : { backend: values.what.backend }) })
                : values.what.kind === 'lineup'
                  // M104. Seat by seat through the ordinary doors: an agent seat is
                  // the first available agent preset (a worktree lane only when
                  // asked), a shell seat is the login shell or its command, a browser
                  // seat is an M103 pane — never in a worktree.
                  ? (async (): Promise<SpawnResult> => {
                    const plan = lineupPlan(LINEUPS[(values.what as { id: Lineup['id'] }).id], { cwd: values.cwd, worktrees: values.worktree === true, maxConcurrent: 0, liveAgents: 0 })
                    const agentPreset = presetRows.find((p) => p.agent !== undefined && p.available)
                    // Refused BEFORE any seat is minted: a refusal mid-loop leaves half a lineup.
                    if (agentPreset === undefined && plan.seats.some((s) => s.kind === 'agent')) return { kind: 'refused', reason: 'no agent CLI is on the PATH — install claude or codex, or check the environment report' }
                    for (const seat of plan.seats) {
                      if (seat.kind === 'browser') {
                        // M195 (D03). A lineup's preview seat is a preview of the
                        // lineup's OWN folder by construction, so it is born bound
                        // — the one place the app mints a pane already knowing the
                        // project. A cwd that is not absolute binds nothing (there
                        // is no panel yet to take a source id from either, which is
                        // why the binding is a root alone).
                        const lineupRoot = normalisePreviewPath(values.cwd)
                        openBrowserPanel(seat.url ?? 'http://localhost:3000/', lineupRoot === null ? undefined : { root: lineupRoot })
                        continue
                      }
                      if (seat.kind === 'agent') {
                        if (agentPreset === undefined) return { kind: 'refused', reason: 'no agent CLI is on the PATH — install claude or codex, or check the environment report' }
                        const r = await window.canvas.spawn.sheet({ presetId: agentPreset.id, cwd: values.cwd, title: seat.role, ...(seat.lane ? { worktree: true } : {}) })
                        if (r.kind === 'refused') return r
                        continue
                      }
                      const r = seat.command === undefined ? await window.canvas.spawn.sheet({ presetId: 'shell', cwd: values.cwd, title: seat.role }) : await window.canvas.spawn.sheet({ command: seat.command, cwd: values.cwd, title: seat.role })
                      if (r.kind === 'refused') return r
                    }
                    return { kind: 'spawned' }
                  })()
                : values.what.kind === 'teammate'
                  // M100. A chat AS a teammate: the id rides the create; main reads
                  // the brief from its roster and checks the places before the cwd.
                  ? beginNewChat({ cwd: values.cwd, title: values.title === '' ? (teammatesRef.current.find((t) => t.id === (values.what as { id: string }).id)?.name ?? '') : values.title, agentOptions: values.agentOptions, teammateId: (values.what as { id: string }).id })
                : window.canvas.spawn.sheet(buildSpawnRequest(values, presets))
          }
        })
        palette.openPalette()
      })
    },
    // Not a new dispose call site — this IS onClosePanel, the one the panel's
    // own × already uses. See PaletteActions.closePanel for why it is reached
    // through this object rather than closed over directly by the rail.
    closePanel: (id) => onClosePanel(id),
    // The wake path, and deliberately not what a row CLICK does. See
    // PaletteActions.startPanel.
    startPanel: (id) => onSelectPanel(id),
    /**
     * Restart in place: end this panel's process and start a fresh one at the
     * same id, the same rect and the same spec.
     *
     * THE FIFTH registry.dispose CALL SITE in this file, and — like the other
     * four — it adds no caller of pty.kill: dispose() is still exactly one of
     * the two, both inside session-registry.ts. verify:panels 94 pins both
     * numbers by reading the source, because no runtime behaviour can observe
     * how many callers a function has and CLAUDE.md records this exact count
     * going stale once already.
     *
     * Four things about the sequence are load-bearing.
     *
     * clearAgentState FIRST, before the dispose. Agent state survives a
     * panel's closure by design — main sends the transition and the
     * renderer's store keeps it until something clears it — so without this a
     * panel restarted out of wants-you keeps its amber border: a fresh agent
     * wearing a dead one's question, and nothing will ever clear it, because
     * only focus or a write acknowledges and neither says anything about the
     * PREVIOUS process. main's `create` sends `starting` directly (it is the
     * one state nothing transitions into, so a change-gated send would never
     * emit it), which is what re-seeds the panel a moment later.
     *
     * AWAIT the dispose. Under tmux the session must be DESTROYED before the
     * respawn, or `new-session -A` attaches to the very session this was meant
     * to replace and the whole verb becomes a silent no-op — the panel blinks
     * and comes back with the same process in it. dispose() returns the
     * kill's promise for exactly this caller.
     *
     * ensure with dormant FALSE, explicitly rather than inherited. A dormant
     * re-ensure leaves the panel refusing to spawn, which on screen is
     * indistinguishable from a restart that did nothing at all.
     *
     * bumpVersion at the end. ensure() deliberately does not bump — it is
     * normally called during render, where notifying a useSyncExternalStore
     * subscriber makes React warn — so from an event handler nothing else
     * would re-render to mount the new handle's slot or re-run the tiering
     * effect, and the panel would show literally nothing with no error
     * anywhere. dispose() did bump, but that bump is a tick stale by the time
     * this resolves. NOT focus(): it bumps too, but it also moves the
     * keyboard, which a shell control must never do (shell-control.ts).
     *
     * No history entry — the panel array does not change, so there is no
     * gesture to undo. No confirm — the process this ends is precisely the one
     * the user asked to replace; the control's own title is where the warning
     * lives instead.
     */
    // M92. Pass-throughs: the rule lives in Canvas beside the record.
    lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel,
    // M93. The annotate door.
    beginAnnotate: () => { void beginAnnotate() },
    restartPanel: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      // A sessionless panel has no process to restart. The isRestartable gate
      // inside restartWithSpec would refuse either kind anyway (neither holds
      // a session, so the status is undefined), but the narrowing has to
      // happen before `panel.spec` is read at all.
      if (!panel || !isTerminalPanel(panel)) return
      restartWithSpec(id, panel.spec)
    },
    /**
     * M20. Set a panel's permission mode AND restart it, as ONE gesture.
     *
     * Compound rather than two verbs, and the compounding is the design. A
     * bare "change this panel's mode" is unsound twice: `registry.ensure`
     * returns an existing session unchanged, so the spec would move while the
     * process kept the old flags — every surface reading the session would
     * then disagree with every surface reading the panel — and an undo of the
     * spec edit would lie in the other direction, restoring a spec the running
     * process never had. Restarting closes both, because a restart is the one
     * thing that re-reads the argv: tmux `new-session -A` ignores it entirely
     * on a reattach.
     *
     * It is also what lets the inspector label its rows plainly rather than
     * hedging each with "requested". With this as the only mutation path, the
     * session's spec and the running process cannot disagree.
     *
     * ONE history entry, pushed through commitHistory like every other
     * committed gesture — unlike plain restartPanel, which pushes none
     * because the panel array genuinely does not change there. Here it does:
     * the spec is part of the panel, so an undo has something real to undo.
     */
    restartPanelWithMode: (id, mode) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (!panel || !isTerminalPanel(panel)) return
      // Gated on the SESSION's agent, matching agentArgs: a flag appended to a
      // panel main will not treat as an agent is emitted nowhere, so the verb
      // would look like it worked and do nothing.
      if (registry.get(id)?.spec.agent === undefined) return
      const nextSpec: PanelSpecTemplate = {
        ...panel.spec,
        agentOptions: { ...panel.spec.agentOptions, permissionMode: mode }
      }
      setPanels((current) => {
        const next = current.map((p) =>
          p.rect.id === id && isTerminalPanel(p) ? { ...p, spec: nextSpec } : p
        )
        commitHistory(next)
        return next
      })
      restartWithSpec(id, nextSpec)
    },
    beginRenamePanel: (id, currentTitle) => {
      setInputMode({
        kind: 'text',
        label: 'Name this panel…',
        initial: currentTitle,
        submit: (value) => {
          const name = value.trim()
          setPanels((prev) => {
            // A captured id can outlive its panel — the row is aimed at
            // whatever was focused when the palette opened, and that panel
            // may have since been closed. Mapping over a missing id would
            // still rewrite the array (a fresh reference for every element)
            // and push a no-op history entry, so bail out instead: nothing
            // changed, so nothing should look like it did.
            if (!prev.some((p) => p.rect.id === id)) return prev
            // Palette.tsx only calls submit() with a non-empty trimmed value
            // (an empty Enter is a cancel, not a rename to "") — so `name`
            // is never '' here, and clearing a title is not offered by this
            // surface at all. Rebuilt field by field rather than spread, the
            // same absent-stays-absent rule fromPanels obeys, so a future
            // caller that DOES want to clear a title can't get there by
            // accidentally spreading `title: undefined` through.
            // ALL THREE kinds are rebuilt, and `kind` is carried explicitly
            // by each arm rather than spread: a rename that dropped it would
            // turn a review node or a file panel back into a terminal panel on
            // the next parse, which reads its absent spec and empties the
            // canvas. A fourth kind adds a fourth arm here, and the union's
            // exhaustiveness is what makes forgetting one a compile error
            // rather than a silent loss of a panel's own field.
            const next: Panel[] = prev.map((p) => {
              if (p.rect.id !== id) return p
              if (isReviewPanel(p)) {
                return { kind: p.kind, rect: p.rect, subject: p.subject, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M187. The sixteenth kind: a rename carries the note's own
              // record field by field, absent staying absent — the same rule
              // the file panel's fontSize learned in M49.
              if (isNotePanel(p)) {
                return { kind: p.kind, rect: p.rect, note: p.note, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              if (isFilePanel(p)) {
                return { kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M133. The workflow panel's own arm — its `workflow` record is
              // its only identity, and a rename that dropped it would leave a
              // panel naming no template at all on the next parse.
              if (isWorkflowPanel(p)) {
                return { kind: p.kind, rect: p.rect, workflow: p.workflow, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              if (isJiraPanel(p)) return { kind: p.kind, rect: p.rect, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              if (isToolboxPanel(p)) {
                return { kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M83. The seventh arm — a memory node carries its root.
              if (isMemoryPanel(p)) {
                return { kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M88. The ninth arm — a github panel carries nothing but its title.
              if (isGithubPanel(p)) {
                return { kind: p.kind, rect: p.rect, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M84. The eighth arm — a watcher carries its whole record.
              if (isWatcherPanel(p)) {
                return { kind: p.kind, rect: p.rect, watch: p.watch, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M73. The sixth arm; `verify:layout chat.1` is the parse side of
              // the same field-by-field rule this rename obeys.
              if (isChatPanel(p)) {
                return { kind: p.kind, rect: p.rect, chat: p.chat, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M103. The browser pane's one field, by name.
              if (isBrowserPanel(p)) {
                return { kind: p.kind, rect: p.rect, url: p.url, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M116. The work card's one field, by name — the twelfth arm.
              if (isWorkPanel(p)) {
                return { kind: p.kind, rect: p.rect, work: { itemId: p.work.itemId }, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M128. The skill panel's two fields, by name — the thirteenth arm.
              if (isSkillPanel(p)) {
                return { kind: p.kind, rect: p.rect, skill: { scope: p.skill.scope, name: p.skill.name }, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M181. The image panel's one field, by name — the fifteenth arm.
              if (isImagePanel(p)) {
                return { kind: p.kind, rect: p.rect, image: { path: p.image.path, ...(p.image.asset === undefined ? {} : { asset: p.image.asset }), ...(p.image.artifact === undefined ? {} : { artifact: p.image.artifact }) }, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M338. The relay panel's record, field by field — a rename that
              // lost `sessionId` would start a second session on relaunch.
              if (isRelayPanel(p)) {
                return { kind: p.kind, rect: p.rect, relay: { program: p.relay.program, ...(p.relay.sessionId === undefined ? {} : { sessionId: p.relay.sessionId }), ...(p.relay.shareId === undefined ? {} : { shareId: p.relay.shareId }) }, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M49. `fontSize` and `links` ride along field by field, absent
              // staying absent: a rename that rebuilt the panel without them
              // silently dropped a font override and every link the panel
              // held — found while adding the override, fixed for both.
              return { kind: p.kind, rect: p.rect, spec: p.spec, z: p.z, title: name, ...carryMarks(p),
                ...(p.links === undefined ? {} : { links: p.links }),
                ...(p.fontSize === undefined ? {} : { fontSize: p.fontSize }) }
            })
            // One entry for the whole gesture, on commit — the rule a drag
            // already follows. Pushing per keystroke would make one rename
            // take a dozen Cmd+Z presses to unwind.
            commitHistory(next)
            return next
          })
          setInputMode(null)
        }
      })
      // Same reason beginRenamePreset does this: Palette.tsx closes the
      // overlay BEFORE running a row's command, so without reopening, the mode
      // would be set on a palette that is already gone.
      palette.openPalette()
    },
    setPanelFontSize: (id, size) => {
      // A COMMIT, one history entry, the rule a drag and a rename follow. The
      // registry does the rest on the next render: it resolves the effective
      // size and refits the live session once. Rebuilt field by field so an
      // absent override stays absent (fromPanels' rule) — `undefined` here
      // means "back to the global", which is the field's absence.
      setPanels((prev) => {
        const target = prev.find((p) => p.rect.id === id)
        if (!target || !isTerminalPanel(target)) return prev
        if (target.fontSize === size) return prev
        const next: Panel[] = prev.map((p) => {
          if (p.rect.id !== id || !isTerminalPanel(p)) return p
          return { kind: p.kind, rect: p.rect, spec: p.spec, z: p.z,
            ...(p.title === undefined ? {} : { title: p.title }),
            ...carryMarks(p),
            ...(p.links === undefined ? {} : { links: p.links }),
            ...(size === undefined ? {} : { fontSize: size }) }
        })
        commitHistory(next)
        return next
      })
    },
    markPresetRead: (id) => markPresetReadNow(id),
    // M97. The Auto verbs: main starts and stops; the refusal comes back by
    // name and is shown on the palette's line rather than swallowed.
    startAuto: (id, mode, task) => {
      const begin = (t?: string): void => {
        void window.canvas.agentSession.autoStart({ id, mode, ...(t === undefined ? {} : { task: t }) }).then((r) => {
          if (r.kind === 'refused') { setInputMode({ kind: 'text', label: `auto refused — ${r.reason}`, initial: '', feedback: true, submit: () => {} }); palette.openPalette() }
        })
      }
      if (mode === 'custom' && task === undefined) {
        setInputMode({ kind: 'text', label: 'The task, in a sentence…', initial: '', submit: (v) => { if (v.trim() !== '') begin(v) } })
        palette.openPalette()
        return
      }
      begin(task)
    },
    stopAuto: (id) => { void window.canvas.agentSession.autoStop(id) },
    // M76. The ONE answer verb every surface calls; main clears every
    // surface through its permission-answered event. A deny carries a
    // message the agent reads.
    // M98. `scope` rides only when given (an `undefined` key crosses IPC
    // as present); a scoped answer refreshes the store's grants mirror.
    // #16. Marked answered first, so every surface that shows this request
    // (the queue, Orchestrate, the chat card, the palette row) drops it in
    // the same frame rather than on main's round trip — and a second click in
    // that gap sends nothing. A rejected call puts it back.
    // M379. A teammate's ask answered from the palette: the Dock's own door
    // (the store hides it at once and brings it back if main refuses), and a
    // refusal says why.
    answerTeamAsk: (workspaceId, askId, allow) => {
      void answerTeamAskInStore({ workspaceId, askId }, allow ? 'allow' : 'deny').then((reason) => { if (reason !== null) notifyRefused(reason) })
    },
    answerApproval: (id, requestId, allow, scope) => {
      if (isAnswered(id, requestId)) return
      // Read BEFORE the mark: the request is what the record describes, and
      // its task is what files the record in that task's history.
      const asked = approvals().find((a) => a.id === id && a.requestId === requestId)
      const itemId = boardVerbsRef.current?.taskOfPanel?.(id)
      markAnswered(id, requestId)
      void window.canvas.agentSession.answer({ id, requestId, answer: allow ? { allow: true } : { allow: false, message: denyMessageFor(asked?.toolName) }, ...(scope === undefined ? {} : { scope }) })
        .catch(() => { unmarkAnswered(id, requestId); withdrawApprovalOutcome(requestId); return undefined })
        .then((accepted) => {
          if (accepted === undefined) return
          if (scope !== undefined) refreshChatGrants(id)
          /*
           * M300, corrected by M301's critic (finding 5). The decision is
           * recorded only when main ACCEPTED it — `answer` resolves FALSE for
           * a requestId that is no longer pending, and an earlier version
           * ignored the resolved value and wrote the row on resolution. Two
           * surfaces answering one request (the chat card and the Dock, before
           * the first answer's event clears both) then put TWO "Allowed a
           * request" rows in the record for one decision, one of which never
           * reached the agent; so did a stale button for a request the CLI had
           * already dropped.
           *
           * Main's enforcement was never wrong — it refuses the second answer.
           * The RECORD of it was, and the record is what this phase asks a
           * person to trust.
           */
          // #14. Main refused it (no longer pending): the acknowledgment would claim a decision that did not land.
          if (accepted === false) withdrawApprovalOutcome(requestId)
          if (accepted === false) return
          // The source is `person` because a person decided it here.
          void recordOrchEvent({
            runId: adoptedRunId(id), panelId: id, event: 'permission', source: 'person',
            ...(itemId === undefined ? {} : { itemId }),
            // The inbox's own key, so a history row matches the decision it closed.
            key: `p:${requestId}`,
            title: permissionRecordTitle(allow, scope, asked),
            detail: `${requestId}${scope === undefined ? '' : ` · for this ${scope}`}`
          })
        })
    },
    openAsChat: (id) => openAsChat(id),
    openInTerminal: (id) => openInTerminal(id),
    newChat: (backend) => { void beginNewChat(backend === undefined ? undefined : { backend }) },
    // M120. The sandbox flag rides the create; the backend by NAME from the row, absent is claude.
    newSandboxChat: (backend) => { void beginNewChat({ sandbox: true, ...(backend === DEFAULT_BACKEND ? {} : { backend }) }) },
    // M122. The chat store's bus; the panel scrolls the turn's row into view.
    scrollChatTurn: (panelId, turnIndex) => scrollToTurn(panelId, turnIndex),

  
    // Reads the panel from the ref rather than closing over `panels`, the
    // rule every other action in this object obeys: `panels` is a fresh array
    // on every setPanelRect, so closing over it would rebuild this whole memo
    // on every frame of a drag.
    openToolbox: (panelId) => {
      const panel = panelsRef.current.find((p) => p.rect.id === panelId)
      if (panel === undefined) return
      const directory = inspectionDirectory(panel, 'tools')
      if (directory.kind !== 'known') return
      openToolboxPanel(directory.cwd, railLabel(panel, registry.get(panelId)?.status), worldCentre())
    },
    // M127/M128. The skill card's door — the drop, and a click on a card.
    // Canvas owns the mint (it owns the panel array and the id counter); this
    // is the pass-through that gives every caller one name to reach it by.
    openSkillPanel: (scope, name, world) => openSkillPanel(scope, name, world),
    // M103. The page door: a URL or a bare host in the palette's text mode
    // (a bare host gets http://, a dev server being the ordinary case), a
    // refusal by name kept on the feedback line for correction, and the
    // panel minted at the world centre through Canvas.tsx's minter — the
    // same shape every typed door here takes.
    beginBrowser: () => {
      const ask = (initial: string, feedback?: true): void => setInputMode({
        kind: 'text',
        label: feedback === undefined ? 'Open a page — a URL, or a host like localhost:3000' : 'Try a URL or a host — http(s) pages only',
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (value) => {
          const normalised = normaliseTypedUrl(value)
          if (normalised.kind === 'refused') { ask(value, true); return }
          setInputMode(null)
          openBrowserPanel(normalised.url)
        }
      })
      ask('http://localhost:3000')
    },
    goToPanel: (id) => {
      // displayPanelsRef, not panelsRef: while merged the rail lists every
      // workspace's panels, and the rect worth framing is the LANE-OFFSET
      // one — the only place that panel exists on screen. Reading `panels`
      // here would leave every foreign row navigating nowhere at all, which
      // reads as the rail being broken rather than as a lookup in the wrong
      // array.
      const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
      if (!panel) return
      centreOn(panel.rect)
      // Selection WITHOUT the wake. onSelectPanel is the click path and it
      // deliberately wakes (a card's whole affordance is "click to start");
      // navigating is not interacting, so the switcher leaves dormancy alone.
      // verify:panels 39.
      //
      // It DOES raise, though, and deliberately: the selection ring is the
      // only feedback this command gives, and a framed panel that happens to
      // sit under an overlapping one shows none of it — the camera moves and
      // nothing visibly happens. Raising is a z change and nothing else, so it
      // costs none of what the no-wake rule is protecting.
      selectAndRaise(id)
    },
    jumpPrompt: (id, direction) => {
      registry.get(id)?.handle.jumpPrompt(direction)
    },
    copyLastOutput: (id) => {
      const text = registry.get(id)?.handle.lastCommandOutput()
      if (text !== null && text !== undefined) void navigator.clipboard.writeText(text)
    }
  })
}
