import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { type Panel, isTerminalPanel, setRestartOnExit, setLinkAutomation } from '@renderer/panels/panels'
import type { PersistedRun } from '@shared/layout-schema'
import type { CanvasGroup } from '@renderer/groups/groups'
import { useChatSessions } from '@renderer/chat/useChatSessions'
import { useWatchers } from '@renderer/watcher/useWatchers'
import { buildRunRows, runSignature } from '@renderer/shell/rail-sections'
import { onChatAuto, onChatTurnEnd, onChatSeeded, lastAssistantText } from '@renderer/chat/chat-store'
import { setLastLine, getLastLine } from '@renderer/session/last-line-store'
import type { LinkAutomation } from '@shared/handoff'
import { lastLineOf } from '../shell/rail-rows'

import type { RunsApi } from './useRuns'
/**
 * M507 (E4, the Canvas.tsx split). The rows a run shows: Run again, the turn-
 * end and seeded last lines, the auto bus into the recorder, the rail's run
 * rows and frames, a panel's run, and the restart-on-exit and link automation
 * setters. Lifted out of Canvas VERBATIM as one contiguous run and called at
 * exactly the position it occupied, just below useHandoff, with one
 * destructured Deps object so every dependency array names the same values.
 */
export interface UseRunRowsDeps {
  commitHistory: (next: Panel[]) => void
  focusedIdRef: RefObject<string | null>
  forgetOpenRunsRef: RefObject<() => void>
  panels: Panel[]
  runTick: number
  runs: PersistedRun[]
  runsApi: RunsApi
  runsRef: RefObject<PersistedRun[]>
  selectedId: string | null
  setAutomationResult: Dispatch<SetStateAction<Map<string, string>>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setRunTick: Dispatch<SetStateAction<number>>
}

export function useRunRows(deps: UseRunRowsDeps) {
  const {
    commitHistory, focusedIdRef, forgetOpenRunsRef, panels, runTick, runs, runsApi, runsRef, selectedId, setAutomationResult, setPanels, setRunTick
  } = deps
  const [runAgainResult, setRunAgainResult] = useState<{ id: string; sentence: string } | null>(null)
  useEffect(() => { forgetOpenRunsRef.current = runsApi.forgetOpen }, [runsApi])
  // M172. The `N live / N quiet` capsules left the dock (the metrics rule); the
  // rail's `Agents · N` heading carries the count. `railCapsules` stays a pure
  // export for `verify:rail lastline.1`.
  // M105. A chat's turn end sets its LAST LINE SAID and, when the user was
  // elsewhere, the unread mark — per id, in its own store, never on version().
  useEffect(() => onChatTurnEnd((id) => { setLastLine(id, lastLineOf(lastAssistantText(id)), focusedIdRef.current !== id) }), [])
  // M105. After a relaunch the row still says what its chat said last — read,
  // never unread: a restored answer was read in its earlier life.
  useEffect(() => onChatSeeded((id) => { if (getLastLine(id).line !== '') return; const line = lastLineOf(lastAssistantText(id)); if (line !== '') setLastLine(id, line, false) }), [])
  // M97. An auto run is a run: the store's auto bus feeds the recorder.
  useEffect(() => onChatAuto((id, status) => runsApi.onAutoEvent(id, status)), [runsApi])
  const anyOpen = runs.some((r) => r.endedAt === undefined)
  useEffect(() => {
    if (!anyOpen) return
    const timer = setInterval(() => setRunTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [anyOpen])
  const onRunAgain = useCallback((id: string) => { setRunAgainResult({ id, sentence: runsApi.runAgain(id, runsRef.current) }) }, [runsApi])
  const terminalIdSet = useMemo(() => new Set(panels.filter(isTerminalPanel).map((p) => p.rect.id)), [panels])
  const runRowsBuilt = useMemo(() => buildRunRows(runs, terminalIdSet, Date.now()), [runs, terminalIdSet, runTick])
  const runRowsSig = runSignature(runRowsBuilt) + (runAgainResult === null ? '' : `|${runAgainResult.id}:${runAgainResult.sentence}`)
  const railRuns = useMemo(() => runRowsBuilt.map((r) => (runAgainResult !== null && runAgainResult.id === r.id ? { ...r, note: runAgainResult.sentence } : r)), [runRowsSig])
  // The run FRAMES: the newest run per set of panels, as read-only group frames,
  // derived every render and never persisted as groups.
  const runFrames = useMemo<CanvasGroup[]>(() => {
    const seen = new Set<string>()
    const out: CanvasGroup[] = []
    for (const run of runs) {
      const key = [...run.panelIds].sort().join(',')
      if (seen.has(key)) continue
      seen.add(key)
      const members = run.panelIds.filter((id) => panels.some((p) => p.rect.id === id))
      if (members.length === 0) continue
      out.push({ id: `run:${run.id}`, label: run.name, colour: 'blue', panelIds: members })
    }
    return out
  }, [runs, panels])
  const panelRun = useMemo(() => {
    if (selectedId === null) return null
    const run = runs.find((r) => r.panelIds.includes(selectedId))
    if (!run) return null
    const row = runRowsBuilt.find((r) => r.id === run.id)
    return row === undefined ? null : { id: run.id, name: run.name, facts: row.facts, outcome: row.outcome, tone: row.tone, runAgain: row.runAgain }
  }, [runs, selectedId, runRowsSig])

  const onSetRestartOnExit = useCallback((from: string, to: string, enabled: boolean) => {
    setPanels((current) => {
      const next = setRestartOnExit(current, from, to, enabled)
      if (next === current) return current
      commitHistory(next)
      return next
    })
    if (!enabled) setAutomationResult((current) => {
      const next = new Map(current)
      next.delete(`${from}:${to}`)
      return next
    })
  }, [commitHistory])

  // M41: the one-rule-per-link mutator, the handoff control's verb. Same
  // shape as onSetRestartOnExit above, which is now a thin call into it.
  const onSetLinkAutomation = useCallback((from: string, to: string, automation: LinkAutomation) => {
    setPanels((current) => {
      const next = setLinkAutomation(current, from, to, automation)
      if (next === current) return current
      commitHistory(next)
      return next
    })
    if (!automation.enabled) setAutomationResult((current) => {
      const next = new Map(current)
      next.delete(`${from}:${to}`)
      return next
    })
  }, [commitHistory])

  // Palette actions. Everything the palette can do that needs the registry,
  // the camera, or IPC lives here — buildCommands takes callbacks precisely so
  // none of that reaches the pure layer.
  /**
   * M27. Create a note and open it, ready to write in.
   *
   * Two steps rather than one, and the prompt is the palette's own input mode
   * rather than a dialog — the machinery M5a's preset editing was deferred
   * over ("a modal would fight xterm for keyboard focus") and which every
   * rename, delete and confirm in this app already reuses, so a note prompt
   * inherits all four of usePalette's focus rules for free.
   *
   * The root is read from the ref at CALL time rather than closed over: the
   * user may select a different panel between opening the palette and running
   * the row, and a note belongs to the project they are looking at NOW.
   *
   * `exists` RE-PROMPTS with feedback rather than opening the existing file.
   * "Create" and "open" are different acts, and silently turning one into the
   * other is how a user ends up appending to a file they thought was new —
   * with the existing bytes untouched either way, since main refuses at the
   * `wx` flag rather than after a check.
   */
  // M73. Keep main told about every chat panel on this canvas; disposal is
  // explicit at the removing sites (see useChatSessions).
  // M84. One module-level subscription to watcher:state, installed once.
  useWatchers()
  useChatSessions(panels)

  return { onRunAgain, onSetLinkAutomation, onSetRestartOnExit, panelRun, railRuns, runFrames }
}
