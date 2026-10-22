import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { type Panel, isTerminalPanel, raisePanel, removePanel, withFrameContents } from '@renderer/panels/panels'
import { applyGroupDrag, expandGroup, groupDragState, raiseGroup, removeGroup, toggleGroup, type CanvasGroup } from '@renderer/groups/groups'
import { useGroupDrag } from '@renderer/groups/useGroupDrag'
import { jumpOrder, type Inbox } from '@renderer/shell/decision-inbox'
import { nextReview, type ReadyReview } from '@renderer/shell/ready-review'
import { attentionIds, clearAgentState } from '@renderer/session/agent-state-store'
import { clearLiveSession } from '@renderer/session/live-session-store'
import { clearSubagents } from '@renderer/session/subagent-store'
import { clearFileResult } from '@renderer/session/file-store'
import { clearToolbox } from '@renderer/session/toolbox-store'
import { clearUsage } from '@renderer/session/usage-store'
import { clearMachineCost } from '@renderer/session/machine-cost-store'
import { clearScrollbackTail } from '@renderer/session/scrollback-store'
import { disposeChat } from '@renderer/chat/useChatSessions'
import { disposeWatcher } from '@renderer/watcher/useWatchers'
import { disposeRelayTerminal } from '@renderer/relay/RelayTerminal'
import { clearBrowser } from '@renderer/browser/browser-store'
import { clearUnread, clearLastLine } from '@renderer/session/last-line-store'
import { clearLastActive } from '@renderer/session/last-active-store'
import { clearTrail } from '@renderer/skills/skill-trail-store'
import type { SharedPanel } from '@shared/canvas-ops'
import type { BoardVerbs } from './useBoardVerbs'
import type { SnapGuide } from './placement'
import type { SpacingGuide } from './arrange'
import { type Viewport, type WorldRect, screenToWorld, docFocusRect } from './viewport'
import { forgetAgentLinksFor } from './agent-links-store'
import { retainSelection } from './canvas-constants'
import { applyDrag, type DragState } from './panel-interaction'
import { nextAttentionId, reachableQueue, type JumpDirection } from './attention'
import { forgetEdgesFor } from './useEdgeActivity'
import { attentionCursor, setAttentionCursor } from '../world/world-flight'
import { notifyRefused } from '../shell/toast'

import type { PersistedGroup } from '@shared/groups'
import type { SharedCanvas } from '@renderer/shared-canvas/useSharedCanvas'
import type { Registry } from '@renderer/session/session-registry'
/**
 * M507 (E4, the Canvas.tsx split). The panel gestures: the group drag, a
 * placeholder's drag and removal, group collapse and removal, the panel drag,
 * the slot mount doors, close, select-and-raise, document focus (M256), the
 * attention jump (Cmd+J) and its pill twin, select and focus, and the sheet
 * spawn's focus (M65). Lifted out of Canvas VERBATIM as one contiguous run and
 * called at exactly the position it occupied. The hooks it calls keep their
 * order, so Canvas's hook order is unchanged.
 */
export interface UsePanelGesturesDeps {
  registry: Registry
  addToSelection: (id: string) => void
  beginDrag: (states: readonly DragState[]) => void
  boardVerbsRef: RefObject<BoardVerbs>
  cameraBack: () => void
  centreOn: (rect: WorldRect) => void
  commitHistory: (next: Panel[]) => void
  displayPanelsRef: RefObject<Panel[]>
  frameRects: (rects: WorldRect[]) => void
  hostRef: RefObject<HTMLDivElement | null>
  jumpAttentionImplRef: RefObject<(direction: JumpDirection) => void>
  jumpToAttention: (panelId: string) => void
  landingTargetRef: RefObject<string | null>
  markLaneClosed: (chatId: string) => void
  mergedRef: RefObject<boolean>
  openRequestOfRef: RefObject<(panelId: string) => void>
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  pendingFocusId: string | null
  retireCaptionsOf: (id: string) => void
  selectOnly: (id: string | null) => void
  selectedIds: ReadonlySet<string>
  selectedIdsRef: RefObject<ReadonlySet<string>>
  setDormantIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setFocusedId: Dispatch<SetStateAction<string | null>>
  setGroups: Dispatch<SetStateAction<PersistedGroup[]>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setPendingFocusId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setSnapGuides: (guides: readonly SnapGuide[], spacing?: readonly SpacingGuide[]) => void
  sharedRef: RefObject<SharedCanvas>
  snapNow: (rect: WorldRect, exclude: ReadonlySet<string>, resize?: { growsX: boolean; growsY: boolean; }, min?: { w: number; h: number; }) => WorldRect
  viewportRef: RefObject<Viewport>
}

export function usePanelGestures(deps: UsePanelGesturesDeps) {
  const {
    addToSelection, beginDrag, boardVerbsRef, cameraBack, centreOn, commitHistory, displayPanelsRef, frameRects, hostRef, jumpAttentionImplRef, jumpToAttention, landingTargetRef, markLaneClosed, mergedRef, openRequestOfRef, panels, panelsRef, pendingFocusId, retireCaptionsOf, selectOnly, selectedIds, selectedIdsRef, setDormantIds, setFocusedId, setGroups, setPanels, setPendingFocusId, setSelectedIds, setSnapGuides, sharedRef, snapNow, viewportRef, registry
  } = deps
  const beginGroupDrag = useGroupDrag({
    hostRef,
    viewportRef,
    onDrag: useCallback((state, world, free) => {
      // M50. The group snaps as ONE rect — its members' bounding rect —
      // and the snap's delta shifts the cursor's world point, so every
      // member moves by the same amount and nothing shears.
      const members = new Set(state.members.map((m) => m.panelId))
      const rects = state.members.map((m) => applyDrag(m, world))
      let snappedWorld = world
      // M395. ⌘ held: a free frame, as for a panel (dragFrame's rule).
      if (free) setSnapGuides([])
      else if (rects.length > 0) {
        const bounds = {
          id: `group:${state.groupId}`,
          x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)),
          w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
          h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y))
        }
        const snapped = snapNow(bounds, members)
        snappedWorld = { x: world.x + (snapped.x - bounds.x), y: world.y + (snapped.y - bounds.y) }
      }
      setPanels((current) => applyGroupDrag(current, state, snappedWorld))
    }, [snapNow, setSnapGuides]),
    onCommit: useCallback(() => {
      setSnapGuides([])
      setPanels((current) => {
        commitHistory(current)
        return current
      })
    }, [commitHistory])
  })

  const onBeginGroupDrag = useCallback((group: CanvasGroup, event: MouseEvent<HTMLElement>) => {
    if (mergedRef.current) return
    // A viewer of a shared workspace arranges nothing, a group included.
    if (sharedRef.current.view !== null && !sharedRef.current.mayArrange) return
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const origin = screenToWorld(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewportRef.current
    )
    // Raising is part of the one group gesture and only rewrites Panel.z;
    // member array order remains untouched, so live terminal hosts stay put.
    // M408 follow-up: the raise COMMITS ITSELF (selectAndRaise's rule), because
    // a click under the slop no longer reaches the drag's onCommit.
    setPanels((current) => {
      const next = raiseGroup(current, group)
      if (next.some((p, i) => p.z !== current[i]!.z)) commitHistory(next)
      return next
    })
    beginGroupDrag(groupDragState(group, panelsRef.current, origin))
  }, [beginGroupDrag, commitHistory])

  // A teammate's placeholder, moved by its header through the SAME gesture a
  // panel uses — so the same write-through, snap and role gate apply.
  const onBeginPlaceholderDrag = useCallback((p: SharedPanel, event: { clientX: number; clientY: number }) => {
    if (mergedRef.current) return
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const origin = screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewportRef.current)
    beginDrag([{ panelId: p.id, mode: { kind: 'move' }, originRect: { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }, originWorld: origin }])
  }, [beginDrag])
  const onRemovePlaceholder = useCallback((p: SharedPanel) => {
    void sharedRef.current.removePlaceholder(p.id).then((verdict) => {
      if (!verdict.ok) notifyRefused('Not removed from the shared canvas', verdict.reason)
    })
  }, [])

  // M61. The same two pure transitions the palette's group.toggle row runs
  // (usePaletteActions), so the frame's button and the row cannot disagree.
  const toggleGroupCollapsed = useCallback((id: string) => {
    setGroups((current) => (current.find((g) => g.id === id)?.collapsed ? expandGroup : toggleGroup)(current, id))
  }, [])
  const onRemoveGroup = useCallback((id: string) => {
    setGroups((current) => removeGroup(current, id))
  }, [])

  const onBeginDrag = useCallback(
    (state: DragState) => {
      // GEOMETRY IS READ-ONLY WHILE MERGED, and this is the authoritative
      // gate for both move and resize — every handle and every chrome, on a
      // terminal panel and a review node alike, begins its gesture here. The
      // panels also render no resize handles while merged (TerminalPanel's
      // `readOnly`), which is the visible half; this is the half that holds
      // if some future surface forgets to pass the prop. A drag here would
      // move a rect that carries mergedLayout's lane offset, and setPanelRect
      // writes into `panels` — the ACTIVE workspace's array — so a foreign
      // panel dragged in this view would either land nowhere or, once
      // un-offset by a well-meaning later change, write a wrong coordinate
      // into a workspace record nobody was looking at.
      if (mergedRef.current) return
      // M92. LOCK is one early return, here, at the gate every move and
      // resize passes through: the handles still render (a control that
      // vanishes reads as a bug) and say why in their title.
      if (panelsRef.current.find((p) => p.rect.id === state.panelId)?.locked === true) return
      const host = hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      // The panel supplies CLIENT coordinates; only the canvas knows the
      // viewport, so the conversion belongs here. Converting the POINT (not a
      // delta) is what makes the gesture move by screenDelta / scale:
      // usePanelDrag converts each move the same way, and the two translations
      // cancel in the subtraction applyDrag does.
      // A group is N ordinary drags, not one drag of an enclosing rectangle.
      // Snapshot every origin rect before the first frame rewrites `panels`,
      // then apply the same pointer delta to each immutable origin in
      // usePanelDrag. The pressed member is always present; a resize stays a
      // one-member gesture even when a selection exists.
      //
      // M395. A FRAME CARRIES WHAT IS WHOLLY INSIDE IT, as FigJam's sections
      // do: a move of a frame (by its label or its ring, alone or in a
      // selection) takes every object lying wholly within it at THIS moment
      // along — computed here, at the gesture, and never stored, so M187's
      // "a frame owns nothing" stays true of the record (`frameContents`).
      // The carried objects are ordinary members: one delta, one snap over
      // the bounds, one history entry on release. A locked object stays put
      // (M92), in a selection as in a group.
      const all = panelsRef.current
      const pressed = all.find((panel) => panel.rect.id === state.panelId)
      const moving = state.mode.kind !== 'move' || pressed === undefined
        ? []
        : withFrameContents(selectedIdsRef.current.has(state.panelId)
          ? all.filter((panel) => selectedIdsRef.current.has(panel.rect.id) && (panel.locked !== true || panel.rect.id === state.panelId))
          : [pressed], all)
      const group = moving.length <= 1
        ? [state]
        : moving.map((panel) => (panel.rect.id === state.panelId ? state : {
            ...state,
            panelId: panel.rect.id,
            originRect: panel.rect
          }))
      beginDrag(group.map((member) => ({
        ...member,
        originWorld: screenToWorld(
          { x: member.originWorld.x - bounds.left, y: member.originWorld.y - bounds.top },
          viewportRef.current
        )
      })))
    },
    [beginDrag]
  )

  // Stable identities: these go into TerminalPanel's effect deps, and a fresh
  // arrow each render would tear the terminal down and reopen it every frame.
  const onSlotMount = useCallback((id: string) => registry.attachSlot(id), [])
  const onSlotUnmount = useCallback((id: string) => registry.detachSlot(id), [])
  const onClosePanel = useCallback((id: string) => {
    // Closing is gated with the rest of the mutating gestures, and this gate
    // has to be HERE rather than on the panel's own × — the rail's close
    // control and the inspector's Close button reach the same verb through
    // paletteActions.closePanel, and the rail lists every merged panel. A
    // close aimed at a foreign id would find nothing in `panels` (removePanel
    // is a no-op there) and still reach registry.dispose, which sends
    // pty.kill even for an id this renderer holds no local session for — i.e.
    // it would kill another workspace's agent and leave its panel on that
    // workspace's canvas, with nothing on screen having changed here.
    if (mergedRef.current) return
    // A review node owns no session, so it is dropped from the array and
    // nothing else. This is NOT a sixth dispose call site and must not
    // become one: the registry's dispose sends pty.kill even for an id this
    // renderer holds no session for (see CLAUDE.md), so routing a review
    // node through it would send a tmux kill-session for a panel that never
    // had one — and, worse, drop the baseline of whatever panel later
    // recycles that id.
    // M16 widens this from `isReviewPanel` to "any panel that is not a
    // terminal": a file panel owns no session either, so routing it through
    // the dispose below would send the same stray kill for the same reason.
    if (panelsRef.current.some((p) => p.rect.id === id && !isTerminalPanel(p))) {
      // Its cached content is dropped here rather than in FileNode's unmount
      // cleanup: the cleanup's job is the WATCH (main-side), and a closed
      // panel's result must not survive for a recycled id to inherit. A no-op
      // for a review node, which has no entry.
      clearFileResult(id)
      clearToolbox(id)
      // M73. A chat panel's session is MAIN's, not the registry's, so this
      // is still not a registry.dispose call site: the close ends the
      // process through agent:dispose and drops the durable file. A no-op
      // for the other sessionless kinds.
      // M338. A relay panel DETACHES; the relay reaps a session nobody is attached to.
      disposeChat(id, true); disposeWatcher(id); clearBrowser(id); disposeRelayTerminal(id)
      // M114. The lane's card stays, its state stays: `lane closed` is a note,
      // never a silent trip back to todo.
      markLaneClosed(id)
      setPanels((current) => {
        const next = removePanel(current, id)
        commitHistory(next)
        return next
      })
      setSelectedIds((current) => retainSelection(current, (sid) => sid !== id))
      setFocusedId((current) => (current === id ? null : current))
      return
    }
    // What actually matters is that dispose runs SYNCHRONOUSLY inside this
    // handler, killing the pty on the click that asked for it. The ordering
    // against setPanels is not load-bearing: this is a React synthetic
    // onMouseDown, so setPanels is batched and the unmount happens after the
    // handler returns either way. TerminalPanel's cleanup then runs against an
    // already-disposed session, which is fine by construction — detachSlot
    // early-returns on a missing id, and the cleanup's removeChild is guarded
    // on host.parentNode === slot.
    registry.dispose(id)
    // Same reason as the other two dispose sites: a closed panel's id must
    // not keep a cached agent state that a recycled id could inherit.
    clearAgentState(id)
    forgetEdgesFor(id); forgetAgentLinksFor(id)
    clearLastLine(id)
    clearLastActive(id)
    clearLiveSession(id)
    clearSubagents(id)
    clearTrail(id)
    clearUsage(id)
    clearMachineCost(id)
    clearScrollbackTail(id)
    setPanels((current) => {
      const next = removePanel(current, id)
      commitHistory(next)
      return next
    })
    setSelectedIds((current) => retainSelection(current, (sid) => sid !== id))
    setFocusedId((current) => (current === id ? null : current))
  }, [commitHistory])
  /**
   * Select and raise, without waking. The half onSelectPanel and the palette's
   * goToPanel share: a raise is a z change and nothing more (see "Stacking is
   * Panel.z, never array order"), so it is safe for a navigation that must not
   * start a process, while registry.wake — onSelectPanel's other half — is not.
   */
  const selectAndRaise = useCallback((id: string, additive = false) => {
    if (additive) {
      addToSelection(id)
      return
    }
    // Pressing the chrome of a member is how a completed selection begins a
    // group drag. Do not erase its peers between that press and onBeginDrag;
    // clicking an unselected panel, or the background, still replaces it.
    if (selectedIdsRef.current.size > 1 && selectedIdsRef.current.has(id)) return
    selectOnly(id)
    retireCaptionsOf(id)
    setPanels((current) => {
      // Skip the raise (and the history push it would trigger) when `id` is
      // already topmost. onFocusPanel calls this on every click into a panel
      // to type — without this guard, an ordinary editing session fills
      // HISTORY_LIMIT with z-order noise, and a user's first several Cmd+Z
      // presses undo clicking rather than the edit they meant. This decision
      // belongs here, not in history.ts: that module's docstring deliberately
      // declines to define equality for pushHistory ("no equality check...
      // deciding otherwise needs a notion of equality this module has no
      // business defining") — recognizing a no-op RAISE is a panels.ts/Canvas
      // concept (topmost z), not a general state-equality one, so it stays a
      // caller-side decision instead of smuggling one into the primitive.
      const panel = current.find((p) => p.rect.id === id)
      const alreadyTop = panel !== undefined && current.every((p) => p.z <= panel.z)
      if (alreadyTop) return current
      const next = raisePanel(current, id)
      // M395. A frame is never raised (raisePanel hands back the SAME array):
      // selecting it leaves it behind what it encloses, and pushes nothing.
      if (next === current) return current
      commitHistory(next)
      return next
    })
  }, [addToSelection, commitHistory, selectOnly, retireCaptionsOf])

  /**
   * M256. DOCUMENT FOCUS — one file at a time, centred, widened and the only
   * object at full strength. A VIEW state, never a layout one: the widening is
   * a display rect handed to the one panel (`docFocusRect`), so nothing is
   * written to the layout, the history or the undo stack, and leaving puts
   * the panel back exactly where it was. Entering is a camera JUMP onto the
   * trail, so leaving by the panel's own control is a Camera Back.
   *
   * Left implicitly when the panel stops being the selection (a background
   * click, another panel) — quietening the canvas around a file nobody has
   * selected would hide the thing the person just chose.
   */
  const [docFocusId, setDocFocusId] = useState<string | null>(null)
  const onDocFocus = useCallback((id: string, on: boolean) => {
    if (!on) { setDocFocusId(null); cameraBack(); return }
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (panel === undefined) return
    selectAndRaise(id)
    setDocFocusId(id)
    frameRects([docFocusRect(panel.rect)])
  }, [selectAndRaise, frameRects, cameraBack])
  useEffect(() => {
    if (docFocusId !== null && (!selectedIds.has(docFocusId) || selectedIds.size !== 1)) setDocFocusId(null)
  }, [docFocusId, selectedIds])

  // M308. Assigned below, where the inbox is built; read at press time.
  const inboxRef = useRef<Inbox | null>(null)
  // Ready to review: assigned below, where the task queue is built. ⌘J walks
  // these only once nothing needs the person (ready-review.ts says why).
  const readyReviewRef = useRef<ReadyReview[]>([])
  const reviewCursorRef = useRef<string | null>(null)

  /**
   * Cmd+J. centreOn + selectAndRaise, and deliberately NOTHING ELSE — no
   * registry.wake, no registry.focus, no agent:acknowledge. Focus is the
   * renderer's single trigger for acknowledgement (see onFocusPanel), and
   * routing a second one through navigation would make the renderer a second
   * author of a state main owns. The panel therefore keeps its amber border
   * after you land on it, which is why styles.css lets wants-you outrank
   * .panel--selected.
   *
   * Assigned into jumpAttentionImplRef (declared above, before useViewport)
   * rather than being the callback passed to useViewport directly — see that
   * ref's own comment for why the two cannot be the same binding. Reassigned
   * every render so the closure below always sees the CURRENT centreOn and
   * selectAndRaise, never a stale one from the render that first set it.
   */
  jumpAttentionImplRef.current = (direction: JumpDirection) => {
    // panelsRef, not `panels`: this reads at keypress time and must not put a
    // 60Hz-changing array into a useCallback's dep list (the same mirror-into-
    // a-ref move focusedIdRef makes).
    //
    // The attention store and the panel list can disagree: closing a panel
    // disposes its session and clears its agent state synchronously while
    // pty:kill is still in flight to main, and one more agent:state for that
    // id in that window (an idle tick, a bell) re-inserts it into the queue
    // with nothing left to clear it afterward (M6c's session.killed guard
    // suppresses the matching `exited`). reachableQueue drops any such
    // phantom BEFORE it can seat the cursor — seating it there first and
    // bailing out on a missing panel would leave the cursor stuck on an id it
    // can never leave, killing the key rather than skipping one press.
    // displayPanelsRef, the same array the rail's Attention section is built
    // from: while merged a waiting panel in another lane IS on screen and IS
    // framable, and a queue narrowed to `panels` would skip it while its row
    // sat visible one column to the left.
    const known = new Set(displayPanelsRef.current.map((p) => p.rect.id))
    // M308. The inbox's order — most unblocked first, snoozed skipped.
    const queue = jumpOrder(reachableQueue(attentionIds(), known), inboxRef.current)
    // R-091. The same cursor the World's walk writes, so ⌘J here and ⌘J in
    // the room are one cycle. The world covers the canvas, so one press is
    // not handled twice.
    const id = nextAttentionId(queue, attentionCursor(), direction)
    // Nothing needs the person: the next finished task waiting for review,
    // opened the way the dock's "Review the changes" opens it. With no review
    // either, the key does nothing at all — moving the camera "somewhere"
    // would be worse than silence.
    if (id === null) {
      const review = nextReview(readyReviewRef.current, reviewCursorRef.current)
      if (review === null) return
      reviewCursorRef.current = review.itemId
      boardVerbsRef.current.review?.(review.itemId)
      return
    }
    const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
    // Belt-and-braces: a panel can still vanish between the filter above and
    // this lookup in principle. It must never be the ONLY thing standing
    // between the user and a working key, which is why the filter exists.
    if (!panel) return
    setAttentionCursor(id)
    landingTargetRef.current = id
    centreOn(panel.rect)
    selectAndRaise(id)
    openRequestOfRef.current(id)
  }

  // M249. The command pill's Jump: Cmd+J's queue and the same cursor, so a
  // pill press, a canvas ⌘J and a World ⌘J advance ONE cycle. Lands through
  // jumpToAttention, the notification click's function. Nothing waiting
  // does nothing, for Cmd+J's reason.
  const pillJump = useCallback(() => {
    const known = new Set(displayPanelsRef.current.map((p) => p.rect.id))
    const id = nextAttentionId(jumpOrder(reachableQueue(attentionIds(), known), inboxRef.current), attentionCursor(), 1)
    if (id === null) return
    setAttentionCursor(id)
    // #16. jumpToAttention opens the request itself (a permission in the queue).
    jumpToAttention(id)
  }, [jumpToAttention])
  // Filled by CommandPill with its "expand and take the keyboard"; a ref so
  // useKeyboardNav's listener installs once (openPill's identity is fixed).
  const pillOpenRef = useRef<() => void>(() => {})
  const openPill = useCallback(() => pillOpenRef.current(), [])

  const onSelectPanel = useCallback((id: string, additive = false) => {
    if (additive) {
      selectAndRaise(id, true)
      return
    }
    selectAndRaise(id)
    // Waking hangs off SELECT, not focus. A carded panel has no .panel__slot
    // and so no focus handler of its own — its click falls through to the
    // canvas background, which hit-tests and selects. Hooking onFocusPanel
    // would leave a dormant panel unwakeable by clicking the very card that
    // says "click to start".
    setDormantIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    registry.wake(id)
  }, [selectAndRaise])
  const onFocusPanel = useCallback((id: string) => {
    onSelectPanel(id)
    setFocusedId(id)
    // M105. Looking at it is reading it: the unread mark clears on focus.
    clearUnread(id)
    registry.focus(id)
    // Looking at a panel is reading it. Sent unconditionally rather than only
    // when this panel is in wants-you: main is the only author of that state,
    // and a renderer that decided when to bother telling it would be deciding
    // the state itself — the exact second-author problem the acknowledge
    // channel exists to avoid. The handler is a map lookup and a no-op for
    // any panel that does not want you.
    void window.canvas.agent.acknowledge(id)
  }, [onSelectPanel])
  // M65. The sheet's spawn gets focus once its panel is in state.
  useEffect(() => {
    if (pendingFocusId === null) return
    if (!panels.some((p) => p.rect.id === pendingFocusId)) return
    setPendingFocusId(null)
    onSelectPanel(pendingFocusId)
  }, [pendingFocusId, panels, onSelectPanel])

  return { docFocusId, inboxRef, onBeginDrag, onBeginGroupDrag, onBeginPlaceholderDrag, onClosePanel, onDocFocus, onFocusPanel, onRemoveGroup, onRemovePlaceholder, onSelectPanel, onSlotMount, onSlotUnmount, openPill, pillJump, pillOpenRef, readyReviewRef, selectAndRaise, toggleGroupCollapsed }
}
