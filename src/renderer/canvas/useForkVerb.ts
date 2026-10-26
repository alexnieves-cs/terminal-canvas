import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect } from 'react'
import { type Panel, isChatPanel, makeChatPanel, nextZ } from '@renderer/panels/panels'
import { panelName } from '@renderer/palette/panel-name'
import { forkWords, messageWords } from '@shared/turn-fork'
import { compareReplay, noteFork, setBrancher, type BranchAnswer } from '../replay/replay-store'
import type { PlaceFn } from './place-new'

/**
 * M558–M559 (lane K). Branch a chat from an earlier turn: main builds the
 * worktree at that turn's snapshot and writes the conversation cut there
 * under a NEW panel id the renderer mints (M74's import rule — main never
 * invents an id); this hook then places the fork BESIDE the original and
 * turns the Replay sheet into a compare of the two.
 *
 * The fork is a plain chat: the backend and its knobs carry over, but never
 * a teammate, a supervisor's prompt or a lane mark — it runs in a worktree
 * that is no teammate's place, and a second supervisor would be a second
 * author of the canvas.
 */
export interface UseForkVerbDeps {
  commitHistory: (next: Panel[]) => void
  mergedRef: RefObject<boolean>
  nextIdRef: RefObject<number>
  panelsRef: RefObject<Panel[]>
  placer: (opts?: { quiet?: true; lit?: true; exact?: boolean }) => PlaceFn
  selectOnly: (id: string | null) => void
  setPanels: Dispatch<SetStateAction<Panel[]>>
}

export function useForkVerb(deps: UseForkVerbDeps): (panelId: string, turn: number) => Promise<BranchAnswer> {
  const { commitHistory, mergedRef, nextIdRef, panelsRef, placer, selectOnly, setPanels } = deps
  const branch = useCallback(async (fromId: string, turn: number): Promise<BranchAnswer> => {
    if (mergedRef.current) return { kind: 'refused', sentence: 'Could not branch: the merged view is read-only' }
    const panel = panelsRef.current.find((p) => p.rect.id === fromId)
    if (panel === undefined || !isChatPanel(panel)) return { kind: 'refused', sentence: 'Could not branch: only a chat on this canvas can be branched' }
    const newId = `c${nextIdRef.current++}`
    const result = await window.canvas.fork.branch({ fromPanelId: fromId, toPanelId: newId, turn })
    if (result.kind === 'refused') return { kind: 'refused', sentence: forkWords(result, turn) }
    const rect = panel.rect
    const title = `${panelName(panel)} · from ${messageWords(turn)}`
    const place = placer({ lit: true })
    setPanels((current) => {
      const made = makeChatPanel(newId, { x: rect.x + rect.w * 1.5 + 40, y: rect.y + rect.h / 2 }, nextZ(current), {
        cwd: result.cwd,
        sessionId: result.sessionId,
        ...(panel.chat.backend === undefined ? {} : { backend: panel.chat.backend }),
        ...(panel.chat.agentOptions === undefined ? {} : { agentOptions: panel.chat.agentOptions })
      }, { w: rect.w, h: rect.h })
      const next = [...current, place(current, { ...made, title }, { anchored: true, parentId: fromId })]
      commitHistory(next)
      return next
    })
    selectOnly(newId)
    noteFork(newId, fromId, turn)
    compareReplay(newId)
    return { kind: 'forked', panelId: newId, sentence: forkWords(result, turn) }
  }, [commitHistory, mergedRef, nextIdRef, panelsRef, placer, selectOnly, setPanels])
  useEffect(() => {
    setBrancher(branch)
    return () => setBrancher(null)
  }, [branch])
  return branch
}
