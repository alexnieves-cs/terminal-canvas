import type { History } from '@renderer/panels/history'
import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef } from 'react'
import type { Annotation } from '@shared/annotations'
import { type Panel, firstRunPanels, isTerminalPanel, isChatPanel, linksOf } from '@renderer/panels/panels'
import type { PersistedRun } from '@shared/layout-schema'
import type { PersistedStarter } from '@shared/starter'
import type { PresetTemplate, CapturedPanel } from '@shared/ipc-contract'
import { clearAgentState, getAgentState } from '@renderer/session/agent-state-store'
import { clearLiveSession, getLiveSession } from '@renderer/session/live-session-store'
import { clearSubagents } from '@renderer/session/subagent-store'
import { clearFileResult } from '@renderer/session/file-store'
import { clearToolbox } from '@renderer/session/toolbox-store'
import { clearUsage, getUsage } from '@renderer/session/usage-store'
import { clearMachineCost } from '@renderer/session/machine-cost-store'
import { clearScrollbackTail } from '@renderer/session/scrollback-store'
import { claimBootSpawns } from '@renderer/session/boot-spawns'
import { recoverPanels, seedAfter } from '@renderer/panels/recover'
import { createHistory, undoHistory, redoHistory } from '@renderer/panels/history'
import type { PaletteActions } from '@renderer/palette/commands'
import { getChat, onChatSession } from '@renderer/chat/chat-store'
import { disposeChat } from '@renderer/chat/useChatSessions'
import { disposeWatcher } from '@renderer/watcher/useWatchers'
import { panelState } from '@renderer/panels/panel-state'
import { BACKENDS, backendOf } from '@shared/agent-backends'
import { chatStateInput } from '@renderer/chat/chat-model'
import { costOf } from '@shared/pricing'
import { disposeRelayTerminal } from '@renderer/relay/RelayTerminal'
import { clearBrowser } from '@renderer/browser/browser-store'
import { buildRunRows } from '@renderer/shell/rail-sections'
import { clearLastLine } from '@renderer/session/last-line-store'
import { clearLastActive } from '@renderer/session/last-active-store'
import { clearTrail } from '@renderer/skills/skill-trail-store'
import type { Point } from './viewport'
import { forgetAgentLinksFor } from './agent-links-store'
import { inspectionDirectory } from './inspection-directory'
import { serveDraftEdit } from './draft-focus'
import { forgetEdgesFor } from './useEdgeActivity'
import { isRunning } from '../shell/inspector-fields'
import { TRIGGER_WORDS } from './trigger-words'

import type { PersistedGroup } from '@shared/groups'
import type { Registry } from '@renderer/session/session-registry'
/**
 * M507 (E4, the Canvas.tsx split). The menu's preset events (M65), the one
 * undo/redo step (M409) with the caption retirement it steps first (M407), the
 * edit:undo and edit:redo listeners, and the canvas reset. paletteActionsRef
 * is declared here, above the preset-event effect that reads it, and assigned
 * beside usePaletteActions further down. Lifted out of Canvas VERBATIM as one
 * contiguous run and called at exactly the position it occupied, with one
 * destructured Deps object so every dependency array names the same values.
 */
export interface UseHistoryVerbsDeps {
  registry: Registry
  applyHistory: (previousPresent: Panel[], next: History<Panel[]>) => void
  commitHistory: (next: Panel[]) => void
  defaultTemplateRef: RefObject<PresetTemplate | undefined>
  dormantIdsRef: RefObject<ReadonlySet<string>>
  focusedIdRef: RefObject<string | null>
  markLaneClosed: (chatId: string) => void
  nextIdRef: RefObject<number>
  onSpawn: (centre: Point, template?: PresetTemplate, opening?: { title?: string; context?: string; focus?: true; exact?: true; atCursor?: true; }) => void
  panelsRef: RefObject<Panel[]>
  resetViewport: () => void
  runsRef: RefObject<PersistedRun[]>
  selectOnly: (id: string | null) => void
  setAnnotating: Dispatch<SetStateAction<boolean>>
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>
  setDormantIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setEditingAnnotation: Dispatch<SetStateAction<string | null>>
  setEnteringPanelIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setFocusedId: Dispatch<SetStateAction<string | null>>
  setGroups: Dispatch<SetStateAction<PersistedGroup[]>>
  setHistory: Dispatch<SetStateAction<History<Panel[]>>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setSelectedAnnotation: Dispatch<SetStateAction<string | null>>
  setStarter: Dispatch<SetStateAction<PersistedStarter | undefined>>
  shouldIgnoreKeys: () => boolean
  stepCaptionHistory: (direction: "undo" | "redo", present: Panel[]) => boolean
  worldCentre: () => Point
}

export function useHistoryVerbs(deps: UseHistoryVerbsDeps) {
  const {
    applyHistory, commitHistory, defaultTemplateRef, dormantIdsRef, focusedIdRef, markLaneClosed, nextIdRef, onSpawn, panelsRef, resetViewport, runsRef, selectOnly, setAnnotating, setAnnotations, setDormantIds, setEditingAnnotation, setEnteringPanelIds, setFocusedId, setGroups, setHistory, setPanels, setSelectedAnnotation, setStarter, shouldIgnoreKeys, stepCaptionHistory, worldCentre, registry
  } = deps
  // The three preset events main pushes (see main/index.ts's menu handlers).
  // Routed through onSpawn/commitHistory rather than a second spawn path so a
  // preset spawn inherits the SAME undo behaviour as Cmd+N: undo removing a
  // panel must dispose its session, and that guarantee lives in applyHistory,
  // reachable only by going through the ordinary history stack.
  // Declared here, above the preset-event effect that reads it (M65's
  // ⌘⇧N subscription), and assigned beside usePaletteActions far below —
  // the create-then-assign shape M28's hook split records.
  const paletteActionsRef = useRef<PaletteActions | null>(null)
  useEffect(() => {
    const spawnPushed = (template: PresetTemplate): void => {
      // M65. A template from the sheet carries its title and asks for focus;
      // a menu template carries neither and spawns exactly as before.
      onSpawn(worldCentre(), template, template.title === undefined && template.focus === undefined
        ? undefined
        : { ...(template.title === undefined ? {} : { title: template.title }), ...(template.focus === undefined ? {} : { focus: true as const }) })
    }
    const offSpawn = window.canvas.preset.onSpawn(spawnPushed)
    // Subscribed THEN claimed, in one task: a push that arrived before this
    // effect ran was queued at boot, and from here on it reaches spawnPushed.
    for (const template of claimBootSpawns()) spawnPushed(template)
    // M65. The menu's ⌘⇧N asks the renderer for the sheet. Through a ref:
    // paletteActions is built far below this effect.
    const offSheet = window.canvas.spawn.onOpenSheet((which) => {
      if (which === 'task') paletteActionsRef.current?.beginStartWork()
      else paletteActionsRef.current?.beginSpawnSheet()
    })
    // M90. A codex chat's thread id is the CLI's: written onto the record the
    // first time the stream names it, with no history entry (nothing the user
    // did), so a relaunch resumes the same thread. A claude id never changes.
    const offSession = onChatSession((id, sessionId) => {
      setPanels((current) => {
        const panel = current.find((p) => p.rect.id === id)
        if (!panel || !isChatPanel(panel) || !BACKENDS[backendOf(panel.chat)].adoptsThreadId || panel.chat.sessionId === sessionId) return current
        return current.map((p) => (p === panel ? { ...panel, chat: { ...panel.chat, sessionId } } : p))
      })
    })
    // M55. Recovered orphans, only ever after the user answered Restore.
    // Through commitHistory like a spawn, so Cmd+Z un-adopts — which
    // disposes the sessions, and that is right: asked, said yes, said no.
    const offRecover = window.canvas.session.onRecover((rows) => {
      const centre = worldCentre()
      nextIdRef.current = seedAfter(rows.map((r) => r.panelId), nextIdRef.current)
      setEnteringPanelIds((current) => { const next = new Set(current); for (const r of rows) next.add(r.panelId); return next })
      setPanels((current) => {
        const fresh = recoverPanels(rows.filter((r) => !current.some((p) => p.rect.id === r.panelId)), current, centre)
        if (fresh.length === 0) return current
        const next = [...current, ...fresh]
        commitHistory(next)
        return next
      })
    })
    const offDefault = window.canvas.preset.onDefault((template) => {
      defaultTemplateRef.current = template
    })
    const offCapture = window.canvas.preset.onCapture(() => {
      const id = focusedIdRef.current
      if (!id) return null
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      // A sessionless panel has no spec to capture, so it saves as no preset:
      // a review node has no command and a file panel names a file rather than
      // a directory. Neither can be the focused panel today (nothing focuses
      // one but its own body), and this answers null rather than throwing if
      // that ever changes. `!isTerminalPanel`, not `isReviewPanel`: the latter
      // lets a file panel through to `panel.spec`, which does not exist.
      if (!panel || !isTerminalPanel(panel)) return null
      // Where the panel IS, falling back to where it was spawned — the same
      // asymmetry reloadPrompts obeys, stated there in full.
      const captured: CapturedPanel = {
        cwd: getLiveSession(panel.rect.id)?.cwd ?? panel.spec.cwd,
        args: [...panel.spec.args],
        w: panel.rect.w,
        h: panel.rect.h
      }
      // Absent stays absent: a captured login-shell panel must save as a
      // login-shell preset, not as whatever this machine's shell happens to be.
      if (panel.spec.command !== undefined) captured.command = panel.spec.command
      if (panel.spec.agent !== undefined) captured.agent = panel.spec.agent
      if (panel.spec.worktree !== undefined) captured.worktree = panel.spec.worktree
      // M20. Both capture surfaces carry it, never one — presetFromCapture is
      // the shared mint precisely so the menu's path and the inspector's
      // cannot disagree about what a saved preset is, and a knob added to one
      // only would give a user two different presets for one panel depending
      // on which surface saved it.
      if (panel.spec.agentOptions !== undefined) captured.agentOptions = panel.spec.agentOptions
      return captured
    })
    return () => {
      offSheet()
      offSession()
      offSpawn()
      offRecover()
      offDefault()
      offCapture()
    }
  }, [onSpawn, worldCentre])

  // Menu-driven undo/redo, delivered the same way as copy/paste — through
  // main's menu accelerators, never the stock 'undo'/'redo' roles, which
  // drive document.execCommand against whatever DOM element happens to be
  // focused (xterm's hidden textarea, most of the time) rather than this
  // history stack.
  // M409 (C5). The one undo/redo STEP, lifted so ⌘K's Undo/Redo rows run
  // exactly what edit:undo runs. The guards stay on the IPC path below: they
  // are about a chord pressed behind an overlay, and a palette row runs as
  // the palette closes.
  // M407's caption retirement is its own history entry, so it steps first —
  // decided INSIDE the updater, against the history this press is handed
  // (the follow-up: a ref read outside it lagged a second press in the tick).
  const undoCanvas = useCallback(() => {
    setHistory((h) => {
      if (stepCaptionHistory('undo', h.present)) return h
      const next = undoHistory(h); applyHistory(h.present, next); return next
    })
  }, [applyHistory, stepCaptionHistory, setHistory])
  const redoCanvas = useCallback(() => {
    setHistory((h) => {
      if (stepCaptionHistory('redo', h.present)) return h
      const next = redoHistory(h); applyHistory(h.present, next); return next
    })
  }, [applyHistory, stepCaptionHistory, setHistory])
  const undoCanvasRef = useRef(undoCanvas)
  undoCanvasRef.current = undoCanvas
  useEffect(() => {
    // Rule 3 again, and this is the sharpest edge of it: Cmd+Z is a menu
    // accelerator on exactly the same footing as Cmd+V, so with the palette
    // open and a name half-typed it does not undo the TYPING — it runs
    // applyHistory, which removes a panel and disposes its session, behind the
    // overlay, with no visible cause. verify:panels 37.
    //
    // Sharper still under the nav grid, which is why the guard is
    // shouldIgnoreKeys and not palette.isOpen: the grid is revealed by a
    // HELD Cmd, so Cmd+Z is one keypress away for the whole time it is up —
    // it kills a running agent behind an opaque overlay, and the workspace
    // switch on release then carries the evidence off screen entirely.
    // verify:panels 123.
    const offUndo = window.canvas.edit.onUndo(() => {
      if (shouldIgnoreKeys()) return
      // A draft's ⌘Z undoes its TYPING, never a panel spawn behind it.
      if (serveDraftEdit('undo')) return
      undoCanvas()
    })
    const offRedo = window.canvas.edit.onRedo(() => {
      if (shouldIgnoreKeys()) return
      if (serveDraftEdit('redo')) return
      redoCanvas()
    })
    return () => {
      offUndo()
      offRedo()
    }
  }, [undoCanvas, redoCanvas, shouldIgnoreKeys])

  // Pulled out of the onReset listener below so verify:panels' __m4bReset
  // hook (see the test-hook effect further down) can drive the exact same
  // path a confirmed main-process reset does — executeJavaScript has no way
  // to trigger the native confirmation dialog that guards the real trigger,
  // so this is the narrow verb the suite calls instead.
  const resetCanvas = useCallback(() => {
    // dispose, not just drop: reset kills every process. This is one of the
    // FIVE dispose call sites in this file — the others are the close button,
    // undo/redo removing a panel, workspace delete, and restart in place —
    // and pty.kill itself still has only its two callers inside
    // session-registry.ts, because every one of the five routes through
    // dispose() rather than calling pty.kill directly. verify:panels 94 pins
    // both numbers; it regex-counts the call over this whole file, comments
    // included, which is why this comment does not spell it with its
    // parentheses.
    // Reset drops every panel whatever its kind, but only a terminal panel
    // has anything to TEAR DOWN. A review node holds no PanelSession, and
    // the registry's dispose reaches pty.kill even for an id this renderer
    // holds no local session for — so skipping the node here is what stops a
    // reset sending a tmux kill-session named after a panel that never had
    // one, and dropping in main the baseline of whatever panel later
    // recycles that id (FIRST_RUN_ID makes recycled ids reachable from this
    // very function). Positive test, and on the iteration rather than on the
    // call, for the two reasons applyHistory's own guard states.
    for (const panel of panelsRef.current) {
      if (!isTerminalPanel(panel)) {
        // M16: `!isTerminalPanel`, not `isReviewPanel`. A file panel is the
        // second sessionless kind and would otherwise have taken the dispose
        // branch below, sending a kill for a panel that never had a session.
        // Its cached content goes with it, the same reason the two clears
        // below exist — a reset drops every panel at once, and FIRST_RUN_ID
        // makes recycled ids reachable from this very function.
        clearFileResult(panel.rect.id)
        clearToolbox(panel.rect.id)
        // M73. See onClosePanel: main's session, main's file, no registry.
        disposeChat(panel.rect.id, true); disposeWatcher(panel.rect.id); clearBrowser(panel.rect.id); disposeRelayTerminal(panel.rect.id)
        markLaneClosed(panel.rect.id)
        continue
      }
      registry.dispose(panel.rect.id)
      // Same reason as the undo/redo site above: reset drops every panel at
      // once, and each dropped id needs its cached agent state cleared too.
      clearAgentState(panel.rect.id)
      forgetEdgesFor(panel.rect.id); forgetAgentLinksFor(panel.rect.id)
      clearLastLine(panel.rect.id)
      clearLastActive(panel.rect.id)
      clearLiveSession(panel.rect.id)
      clearSubagents(panel.rect.id)
      clearTrail(panel.rect.id)
      clearUsage(panel.rect.id)
      clearMachineCost(panel.rect.id)
      clearScrollbackTail(panel.rect.id)
    }
    const fresh = firstRunPanels()
    setPanels(fresh)
    setGroups([])
    // M93. A reset is a reset: the notes go with the panels.
    setAnnotations([])
    // M181. And the starter may lay itself out again: a reset is a first run.
    setStarter(undefined)
    setSelectedAnnotation(null); setEditingAnnotation(null); setAnnotating(false)
    setDormantIds(new Set())
    selectOnly(null)
    setFocusedId(null)
    setHistory(createHistory(fresh))
    // firstRunPanels() places its panel at the world origin. Without
    // returning the camera too, reset from anywhere but the origin leaves
    // that panel off screen — an empty canvas, exactly what "First run"
    // is not supposed to allow — and the save effect below immediately
    // persists the still-distant camera over the one layoutStore.reset()
    // just cleared, so the blank view survives a relaunch.
    resetViewport()
  }, [resetViewport])

  // Main owns the reset dialog but only the renderer knows the live statuses,
  // so it supplies the counts the confirmation names.
  useEffect(() => {
    // M81. `tc status`'s model: the canvas in its OWN words — the state
    // vocabulary's word per panel, the edge labels' trigger words, the run
    // rows' outcome — so a supervisor reading this and a person reading the
    // rail are told the same thing (principle 11).
    const offModel = window.canvas.canvas.onModel(() => ({
      panels: panelsRef.current.map((p) => {
        const word = isTerminalPanel(p)
          ? panelState({ kind: 'terminal', status: registry.get(p.rect.id)?.status, dormant: dormantIdsRef.current.has(p.rect.id) }, getAgentState(p.rect.id))
          : isChatPanel(p)
            ? panelState({ kind: 'chat', status: undefined, dormant: false, chat: chatStateInput(getChat(p.rect.id).snapshot, getChat(p.rect.id).turns.length > 0) ?? { status: 'not-started' as const, pending: 0, hasHistory: false } }, undefined)
            // A document kind has no process word; the model says so in the
          // vocabulary's own terms rather than inventing one (M81's verifier:
          // the prompt tells the supervisor the closed set, so a `review`
          // here is a word its instructions say does not exist).
          // The vocabulary's own function decides the word, never a literal:
          // a document kind has no process, which is what `panelState` says
          // for a terminal that never started (verify:rail state.2).
          : panelState({ kind: 'terminal', status: undefined, dormant: false }, undefined)
        const usage = getUsage(p.rect.id)
        // No usage recorded is NOT zero — a confident `cost: 0` beside a
        // working agent is the answer `machine-cost` already refuses.
        const priced = usage === undefined || Object.keys(usage.byModel).length === 0
          ? undefined
          : Object.entries(usage.byModel).reduce<number | undefined>((acc, [model, totals]) => {
            const c = costOf(totals, model)
            return acc === undefined || c === undefined ? undefined : acc + c
          }, 0)
        const cost = priced
        // M366. The directory the inspector's Tools rule reads for this
        // panel, so `tc toolbox` asks main about the same directories the
        // palette's capability scope does (a sandbox chat has none).
        const tools = inspectionDirectory(p, 'tools')
        return {
          id: p.rect.id, kind: p.kind, state: word.word,
          ...(p.title === undefined ? {} : { title: p.title }),
          ...(isTerminalPanel(p) ? { cwd: getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd } : isChatPanel(p) ? { cwd: p.chat.cwd } : {}),
          ...(tools.kind === 'known' ? { toolsCwd: tools.cwd } : {}),
          ...(cost === undefined ? {} : { cost })
        }
      }),
      edges: panelsRef.current.flatMap((p) => linksOf(p)
        // Every edge, including a plain link and a DISABLED rule: "no edge"
        // and "an edge that is off" are different facts (M81's verifier).
        .map((l) => ({
          from: p.rect.id,
          to: l.to,
          trigger: l.automation?.kind === 'handoff' && l.automation.enabled
            ? TRIGGER_WORDS[l.automation.trigger]
            : l.automation?.kind === 'handoff' ? 'off' : 'none'
        }))),
      runs: runsRef.current.map((r) => {
        const row = buildRunRows([r], new Set(), Date.now())[0]
        return { id: r.id, name: r.name, outcome: row?.outcome ?? '', panels: r.panelIds.length, ...(r.costUsd === undefined ? {} : { cost: r.costUsd }) }
      })
    }))
    const offCounts = window.canvas.canvas.onCounts(() => ({
      panels: panelsRef.current.length,
      // The SAME predicate the inspector's summary uses. It was written inline
      // here until M8c; two derivations of "how many agents are running" agree
      // the day they are written and drift the first time one is wrong, and
      // the drift window here is exactly the moment a spawn is in flight —
      // which no check would ever happen to sample.
      running: panelsRef.current.filter((p) => isRunning(registry.get(p.rect.id)?.status)).length
    }))
    const offReset = window.canvas.canvas.onReset(resetCanvas)
    return () => {
      offCounts()
      offModel()
      offReset()
    }
  }, [resetCanvas])

  return { paletteActionsRef, redoCanvas, resetCanvas, undoCanvas, undoCanvasRef }
}
