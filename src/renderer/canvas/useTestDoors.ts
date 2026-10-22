import { type Dispatch, type RefObject, type SetStateAction, useEffect } from 'react'
import { type AgentBackend, SUPERVISOR_PROMPT } from '@shared/agent-session'
import type { AgentOptions } from '@shared/cost'
import type { PaletteActions } from '@renderer/palette/commands'
import { type Panel, makeWatcherPanel, isChatPanel, nextZ } from '@renderer/panels/panels'
import type { SpawnResult } from '@shared/ipc-contract'
import { typeIntoEditor, editorText, focusEditor } from '@renderer/file/editor-registry'
import { WORK_ITEM_STATES, type PersistedWorkItem } from '@shared/work-items'
import type { StartWorkOutcome } from '@renderer/palette/start-work'
import type { PlaceFn } from './place-new'
import type { Point, Viewport } from './viewport'
import { activityNow, freezeEdgeClock, noteEdgeArrived, noteEdgeFired, noteEdgeWaiting } from './useEdgeActivity'
import { viewCentre } from './safe-area'

import type { ChecklistView } from '@shared/checklist'
import type { DeckView } from '@shared/deck'
import type { ImportedNote } from '@shared/imported-note'
import type { SheetView } from '@shared/sheet'
import type { History } from '@renderer/panels/history'
/**
 * M507 (E4, the Canvas.tsx split). The window doors the Electron suites drive
 * (__m13Open, __m408HistoryDepth, __m407Undo, __m283HostFocus, the board's and
 * the binding's doors, and the rest), installed by one effect. Lifted out of
 * Canvas VERBATIM and called at exactly the position the effect occupied, with
 * one destructured Deps object so its dependency array names the same values.
 */
export interface UseTestDoorsDeps {
  beginNewChatRef: RefObject<(opts?: { cwd?: string | undefined; title?: string | undefined; agentOptions?: AgentOptions | undefined; appendSystemPrompt?: string | undefined; message?: string | undefined; backend?: AgentBackend | undefined; teammateId?: string | undefined; sandbox?: true | undefined; routine?: true | undefined; } | undefined) => Promise<SpawnResult>>
  commitHistory: (next: Panel[]) => void
  dropPath: (path: string, screen: Point) => "ignored" | "pasted" | "opened"
  historyRef: RefObject<History<Panel[]>>
  hostRef: RefObject<HTMLDivElement | null>
  lastHostFocusRef: RefObject<HTMLElement | null>
  nextIdRef: RefObject<number>
  onClosePanel: (id: string) => void
  openAsChatRef: RefObject<(id: string) => Promise<{ kind: string; reason?: string | undefined; }>>
  openFilePanel: (path: string, centre: Point, opts?: { prose?: true; checklist?: ChecklistView; imported?: ImportedNote; sheet?: SheetView; deck?: DeckView; exact?: true; }) => void
  openInTerminalRef: RefObject<(id: string) => { kind: string; reason?: string | undefined; }>
  openJiraPanel: () => void
  openToolboxPanel: (cwd: string, label: string, centre: Point) => void
  paletteActionsRef: RefObject<PaletteActions | null>
  panelsRef: RefObject<Panel[]>
  placer: (opts?: { quiet?: true; lit?: true; exact?: boolean; }) => PlaceFn
  selectOnly: (id: string | null) => void
  setPanels: Dispatch<SetStateAction<Panel[]>>
  spawnWorkCard: (itemId: string) => void
  undoCanvasRef: RefObject<() => void>
  viewportRef: RefObject<Viewport>
  workItemsRef: RefObject<PersistedWorkItem[]>
  worldCentre: () => Point
}

export function useTestDoors(deps: UseTestDoorsDeps): void {
  const {
    beginNewChatRef, commitHistory, dropPath, historyRef, hostRef, lastHostFocusRef, nextIdRef, onClosePanel, openAsChatRef, openFilePanel, openInTerminalRef, openJiraPanel, openToolboxPanel, paletteActionsRef, panelsRef, placer, selectOnly, setPanels, spawnWorkCard, undoCanvasRef, viewportRef, workItemsRef, worldCentre
  } = deps
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__m13Open = (path: string): void => openFilePanel(path, worldCentre())
    // M408 (D1). How many undo steps the panel history holds — read-only, so
    // grab.slop.1 can say a click and a rename double-click wrote none.
    w.__m408HistoryDepth = (): number => historyRef.current.past.length
    // M407 follow-up. The edit:undo step itself, so starter.caption.undo.1 can
    // press it twice inside ONE task (two IPC messages may each get a render).
    w.__m407Undo = (): void => undoCanvasRef.current()
    // M283. What a return from Orchestrate would hand the keyboard back to (orch-page.4).
    w.__m283HostFocus = (): string | null => { const el = lastHostFocusRef.current; return el === null ? null : `${el.tagName}.${String(el.className).split(' ')[0]}${el.isConnected ? '' : ' (gone)'}` }
    // M113/M114. The board's doors for verify:panels — the SAME verbs the
    // palette rows and the card call, through the palette ref.
    // M182. The binding's Update, through the same member the text mode's submit calls.
    w.__m182Update = (ids: string[]): Promise<{ kind: string; reason?: string; note?: string }> => paletteActionsRef.current?.updateBoundTemplate(ids) ?? Promise.resolve({ kind: 'refused', reason: 'not ready' })
    w.__m113 = {
      add: (item: Omit<PersistedWorkItem, 'id' | 'createdAt' | 'updatedAt' | 'state'> & { state?: PersistedWorkItem['state'] }): string | null =>
        paletteActionsRef.current?.addWorkItem({ ...item, state: item.state ?? (WORK_ITEM_STATES[0] as PersistedWorkItem['state']) }) ?? null,
      dispatch: (itemId: string, teammateId: string, root?: string): Promise<StartWorkOutcome> =>
        paletteActionsRef.current?.dispatchWorkItem(itemId, teammateId, root) ?? Promise.resolve({ kind: 'refused', reason: 'not ready' }),
      // M197. The START door, through the SAME action every real door takes —
      // the hook proves the real path rather than a parallel one, the rule
      // __m13Open established.
      start: (opts?: { itemId?: string; teammateId?: string; title?: string }): void => paletteActionsRef.current?.beginStartWork(opts),
      items: (): PersistedWorkItem[] => workItemsRef.current,
      close: (id: string): void => onClosePanel(id),
      show: (itemId: string): void => spawnWorkCard(itemId),
      done: (itemId: string): void => paletteActionsRef.current?.markDone(itemId)
    }
    // M233. The flow door, for the shot harness and the panels suite.
    //
    // It calls the SAME store functions useHandoff calls — noteEdgeFired,
    // noteEdgeArrived, noteEdgeWaiting — rather than reaching into the
    // layer or setting an attribute, which is the rule __m13Open and
    // __m59Drop already obey: a hook that reconstructs the behaviour proves
    // the reconstruction, not the app. A scene painted through this is
    // therefore a scene of the real grammar with only the TRIGGER faked.
    //
    // A state with no golden is a state no critic ever sees, and `firing`
    // and `waiting` cannot be reached from a fixture without a real agent
    // exiting on cue — which is the whole reason this exists.
    w.__m233Flow = (op: string, from: string, to: string, owed?: string[]): void => {
      if (op === 'fired') noteEdgeFired(from, to)
      else if (op === 'arrived') noteEdgeArrived(from, to)
      else if (op === 'waiting') noteEdgeWaiting(to, owed ?? [])
      else if (op === 'thaw') freezeEdgeClock(null)
    }
    // A read-only window onto the store, so a scene or a check can say WHY a
    // state did not render instead of guessing from an absent attribute.
    w.__m233Dump = (): string => JSON.stringify([...activityNow()])
    // The clock freeze, so a golden of a moving packet is not a flaky golden.
    // See freezeEdgeClock: it fakes WHEN it is and nothing else — the real
    // reducer computes the real t and the real bez() places the real dot.
    w.__m233Freeze = (at: number): void => freezeEdgeClock(at)
    // M59. The drop door, by screen point — see dropPath.
    // M91. The hook takes CLIENT coordinates (what a check reads off a rect)
    // and subtracts the host's origin, exactly as the real onDrop does — the
    // first version handed them to dropPath raw, which is host-relative, and
    // an error the size of the shell's left columns went unseen while the
    // rail was 260px (the slot's centre still fell inside the panel).
    w.__m59Drop = (path: string, x: number, y: number): string => {
      const bounds = hostRef.current?.getBoundingClientRect()
      return dropPath(path, { x: x - (bounds?.left ?? 0), y: y - (bounds?.top ?? 0) })
    }
    // M21's mint, through the SAME openToolboxPanel the inspector button and
    // the palette row both call — so the hook proves the real path rather than
    // a parallel one, the rule __m13Open already obeys.
    w.__m20Toolbox = (cwd: string, label: string): void =>
      openToolboxPanel(cwd, label, worldCentre())
    // M276. The file editor's door, for the checks that used to type by
    // calling the native textarea value setter — Monaco has no such surface.
    // It executes a REAL edit on the REAL model, so the change event React
    // listens to fires exactly as it does under a keystroke: the rule
    // __m13Open established, applied to a widget instead of a verb. The
    // refused alternative (a hidden mirror textarea, so those checks passed
    // untouched) is written up in monaco.ts.
    w.__m276Type = (node: Element | null, text: string): boolean => typeIntoEditor(node, text)
    w.__m276Text = (node: Element | null): string | null => editorText(node)
    w.__m276Focus = (node: Element | null): boolean => focusEditor(node)
    // M24's mint, through the SAME openJiraPanel the palette row calls — so
    // the hook proves the real gesture rather than a parallel mint, the rule
    // __m13Open and __m20Toolbox already obey.
    w.__m24Jira = (): void => openJiraPanel()
    // M73's mint, through the SAME beginNewChat the palette row, the launcher
    // line and the sheet call — read through a ref because beginNewChat is
    // declared below this block (it needs selectOnly), the create-above /
    // assign-below shape this file already uses. Resolves main's answer, so a
    // check can read a refusal by name.
    w.__m73Chat = (cwd: string): Promise<{ kind: string; reason?: string }> => beginNewChatRef.current({ cwd })
    // M81. The supervisor the sheet's row makes, and whether a second is offered.
    w.__m81Supervisor = async (cwd?: string): Promise<boolean> => {
      const result = await beginNewChatRef.current({ ...(cwd === undefined ? {} : { cwd }), title: 'supervisor', appendSystemPrompt: SUPERVISOR_PROMPT, message: 'What is this canvas doing?' })
      return result.kind === 'spawned'
    }
    w.__m81SupervisorOffered = (): boolean => !panelsRef.current.some((p) => isChatPanel(p) && p.chat.supervisor === true)
    // M287. A watcher panel, minted the way the palette's `watch` verb mints
    // one (makeWatcherPanel + commitHistory + selectOnly); the node registers
    // itself with main on mount, so a check can then `watcher.run` it and read
    // a REAL run's outcome and stamp in the workbench. The trigger is a timer
    // an hour out — the check runs it by hand.
    w.__m287Watcher = (cwd: string, command: string, args: string[]): string => {
      const watcherId = `w${nextIdRef.current++}`
      const centre = viewCentre(hostRef.current, viewportRef.current)
      const place = placer()
      setPanels((current) => {
        const next = [...current, place(current, makeWatcherPanel(watcherId, centre, nextZ(current), { cwd, command, args, trigger: { kind: 'timer', everyMs: 3600000 } }))]
        commitHistory(next)
        return next
      })
      selectOnly(watcherId)
      return watcherId
    }
    // M74's two verbs, through the same functions the palette rows, the
    // action bar and the chrome buttons call.
    w.__m74OpenAsChat = (id: string): Promise<{ kind: string; reason?: string }> => openAsChatRef.current(id)
    w.__m74OpenInTerminal = (id: string): { kind: string; reason?: string } => openInTerminalRef.current(id)
  }, [openFilePanel, worldCentre, openJiraPanel, dropPath])
}
