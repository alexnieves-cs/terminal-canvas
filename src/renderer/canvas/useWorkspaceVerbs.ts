import type { Annotation } from '@shared/annotations'
import type { PersistedStarter } from '@shared/starter'
import { seedAfter } from '@renderer/panels/recover'
import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { Registry } from '@renderer/session/session-registry'
import { installPointerCorrection } from '@renderer/components/xterm-pointer'
import type { Panel } from '@renderer/panels/panels'
import type { CanvasGroup } from '@renderer/groups/groups'
import { createHistory, type History } from '@renderer/panels/history'
import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'
import type { PaletteActions } from '@renderer/palette/commands'
import type { CanvasState, PersistedBookmark, PersistedRun } from '@shared/layout-schema'
import { sealAbandoned } from './run-model'
import type { ActivateResult, MergedWorkspace } from '@shared/ipc-contract'
import { EMPTY_SELECTION, retainSelection } from './canvas-constants'
import type { LinkDraw } from './useLinkDraw'
import type { Viewport } from './viewport'

export interface WorkspaceVerbsDeps {
  registry: Registry
  /**
   * The ONE in-flight flag covering both a switch and a merge toggle. Set
   * synchronously at entry and released in a `finally`; a second attempt is
   * refused, never queued.
   */
  transitionRef: RefObject<boolean>
  mergedRef: RefObject<boolean>
  preMergeRef: RefObject<{
    camera: Viewport
    selectedId: string | null
    focusedId: string | null
  } | null>
  panelsRef: RefObject<Panel[]>
  groupsRef: RefObject<CanvasGroup[]>
  /** M56. Bookmarks travel with the workspace exactly as groups do. */
  bookmarksRef: RefObject<PersistedBookmark[]>
  /** M79. The runs, saved with the outgoing workspace like its bookmarks. */
  runsRef: RefObject<PersistedRun[]>
  /** M93. */
  annotationsRef: RefObject<Annotation[]>
  viewportRef: RefObject<Viewport>
  nextIdRef: RefObject<number>
  toggleMergedImplRef: RefObject<() => void>
  restoreCamera: (camera: Viewport) => void
  selectedId: string | null
  focusedId: string | null
  selectOnly: (id: string | null) => void
  linkDraw: LinkDraw
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setGroups: Dispatch<SetStateAction<CanvasGroup[]>>
  setBookmarks: Dispatch<SetStateAction<PersistedBookmark[]>>
  /** M79. The incoming workspace's runs; without this the outgoing history is written into it. */
  setRuns: Dispatch<SetStateAction<PersistedRun[]>>
  /** M93. */
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>
  /** M181. The starter record travels with its workspace, like the notes. */
  starterRef: RefObject<PersistedStarter | undefined>
  setStarter: Dispatch<SetStateAction<PersistedStarter | undefined>>
  /** M79. Forget every open run's component: the incoming workspace's panels are different ones. */
  forgetOpenRuns: () => void
  setDormantIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setFocusedId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setHistory: Dispatch<SetStateAction<History<Panel[]>>>
  setMerged: Dispatch<SetStateAction<boolean>>
  setMergedData: Dispatch<SetStateAction<MergedWorkspace[] | null>>
  /** M121. Flip is a VIEW state; a switch is a new view, so it lands unflipped. */
  setFlipped: Dispatch<SetStateAction<boolean>>
}

export interface WorkspaceVerbs {
  switchWorkspace: (id: string) => Promise<boolean>
  resolveDormant: (ids: string[]) => Promise<Set<string>>
  toggleMerged: () => void
  movePanelsToWorkspace: (
    panelIds: string[],
    target: { workspaceId: string } | { newName: string }
  ) => void
  /**
   * Written by `paletteActions` and by `reloadWorkspaces`, both declared
   * BELOW this hook's call site. They are created here rather than in Canvas
   * because their readers (`switchWorkspace`, `movePanelsToWorkspace`) are
   * here — create-then-assign order is preserved either way, and keeping the
   * ref beside its reader is what stops a later edit from separating them.
   */
  deleteWorkspaceRef: RefObject<PaletteActions['deleteWorkspace'] | null>
  reloadWorkspacesRef: RefObject<(() => void) | null>
}

/**
 * Switching workspaces, entering and leaving the merged view, and moving
 * panels between workspaces — the three transitions that rewrite the whole
 * canvas at once.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split), and
 * this is the block where a verbatim move mattered most. Two orderings inside
 * it are load-bearing and invisible when broken:
 *
 * `switchWorkspace` AWAITS `pty.list()` before committing `next`, and sets
 * `dormantIds` in the SAME synchronous batch as `setPanels` — a correction
 * arriving even one render late can never repair a session the tiering memo
 * already created non-dormant, and the result is up to LIVE_BUDGET agent CLIs
 * launched by a switch with no user gesture. `toggleMerged` makes the same
 * await-before-commit trade, and calls `linkDraw.end()` synchronously before
 * its first await.
 *
 * The one-line `installPointerCorrection` effect rides along in the middle of
 * this block. It has nothing to do with workspaces; it is here because the
 * extraction lifts a CONTIGUOUS run of hook calls, and pulling it out would
 * have moved a hook relative to its neighbours for tidiness alone.
 */
export function useWorkspaceVerbs(deps: WorkspaceVerbsDeps): WorkspaceVerbs {
  const {
    registry, transitionRef, mergedRef, preMergeRef, panelsRef, groupsRef, bookmarksRef, runsRef, annotationsRef,
    viewportRef, nextIdRef, toggleMergedImplRef, restoreCamera, selectedId,
    focusedId, selectOnly, linkDraw, setPanels, setGroups, setBookmarks, setRuns, setAnnotations, starterRef, setStarter, forgetOpenRuns,
    setDormantIds, setFocusedId, setSelectedIds, setHistory, setMerged,
    setMergedData, setFlipped
  } = deps

  /**
   * A workspace switch is a SECOND BOOT — not merely shaped like one.
   *
   * Everything derived from the starting state is RE-DERIVED rather than
   * carried: the id counter (from ActivateResult.allPanelIds, which spans
   * every workspace — see nextIdRef's comment), the undo stack (cleared, for
   * the reason applyHistory's own comment gives: an uncleared stack would let
   * Cmd+Z apply the OTHER workspace's array here and dispose sessions this
   * workspace still wants running), the camera, and the selection. What is
   * deliberately NOT touched is the registry: unmounting these panels calls
   * detachSlot (TerminalPanel's cleanup), which disposes the WebGL addon and
   * pulls the host out of the DOM while the PanelSession, its PTY and its
   * tmux session stay exactly where they are — "two lifetimes, not one"
   * paying out at the scale of a whole canvas instead of one culled panel.
   * There is no `registry.dispose` call anywhere in this function, and there
   * must never be one: `verify:panels` 64 is the check that fails first if
   * one creeps in, and it is the one no cheaper tier can catch (see
   * CLAUDE.md's "Switching in a real renderer" task note).
   *
   * `pty.list()` is AWAITED BEFORE `next` is committed, and `dormantIds` is
   * set in the SAME synchronous batch as `setPanels`. That ordering is not a
   * style choice: renderer/main.tsx's boot() awaits pty:list before its
   * FIRST render, which is the actual thing that makes "restored panels are
   * dormant unless live" true there — an earlier draft of this function
   * committed `next` first and corrected `dormantIds` afterward, once a
   * second, independent pty:list promise resolved, and its comment claimed
   * to reuse boot()'s rule while doing the opposite of what makes that rule
   * hold. The tiering memo's `registry.ensure(id, spec, { dormant:
   * dormantIds.has(id) })` runs on the FIRST render of the incoming panels,
   * and `ensure` early-returns for a session that already exists — so a
   * dormantIds correction arriving even one render late can never repair a
   * session that was already created non-dormant. Both dormancy layers then
   * agree for the wrong reason: lod.ts promotes the panel because
   * dormantIds does not (yet) contain it, and the registry's own dormancy
   * guard passes because session.dormant is already false. attachSlot spawns.
   * Restoring focusedId makes it worse — assignTiers pins the focused panel
   * live unconditionally. The result was up to LIVE_BUDGET agent CLIs
   * launched by a workspace switch with no user gesture, exactly what
   * "dormant until clicked" exists to prevent.
   */
  const switchWorkspace = useCallback(
    async (id: string): Promise<boolean> => {
      // Refused, not queued, while any workspace transition is already in
      // flight — see transitionRef's own comment for the two corruptions this
      // prevents. The answer is returned rather than swallowed because ONE
      // caller cannot treat a refusal as a no-op: deleteWorkspace switches
      // away BEFORE it removes, and a delete that proceeded on a refused
      // switch is the resurrection bug that ordering exists to prevent.
      if (transitionRef.current) return false
      transitionRef.current = true
      /**
       * A SWITCH WHILE MERGED LEAVES THE MERGED VIEW FIRST, and it happens
       * HERE rather than in the chord that made it a one-keystroke gesture:
       * the rail row and the palette's workspace rows reach this same
       * function, so a guard in one caller would leave the other two
       * producing the corruption below.
       *
       * Two things are wrong about switching from inside the merged view and
       * both are silent. The outgoing state would carry a LANE-SPACE camera
       * — and possibly a FOREIGN selection — into the outgoing workspace's
       * own record, coordinates that mean nothing outside the lane
       * arrangement they came from, and this is the LAST write that record
       * ever gets. And `preMergeRef` would survive pointing at a workspace
       * that is no longer active, so every save after the switch writes the
       * PREVIOUS workspace's pre-merge camera and selection into the INCOMING
       * one (the layout.save effect reads that ref while `merged` is true),
       * and leaving the view then restores that camera over the switch's own.
       *
       * Leaving first is also what a user predicts. In the merged view every
       * workspace is already on screen, so "switch" can only mean "take me to
       * that canvas" — and it is not a no-op either, because the active
       * workspace is still what decides where Cmd+N spawns.
       */
      // The try opens HERE, above the synchronous merged-leave block rather
      // than at the first await, so that EVERY path out of this function —
      // including a throw from the state writes below — releases the
      // in-flight flag. A flag that could wedge would leave both workspace
      // chords silently dead for the rest of the run, which is a worse
      // failure than the corruption it was taken to prevent.
      try {
        const wasMerged = mergedRef.current
        const preMerge = preMergeRef.current
        if (wasMerged) {
          setMerged(false)
          setMergedData(null)
          preMergeRef.current = null
          // The ref is normally mirrored from state on the next render, and the
          // mutating-gesture guards (drag, resize, close, marquee) read it —
          // so it is written by hand here. The window between this line and the
          // commit below is a real one: the activate is an IPC round trip.
          mergedRef.current = false
          // The same two clears toggleMerged's own leave makes, for the same
          // reason: a foreign id must not survive as this workspace's stored
          // selection, and the save effect fires the instant `merged` flips —
          // before the switch's own selectOnly lands.
          const own = new Set(panelsRef.current.map((p) => p.rect.id))
          setSelectedIds((current) => retainSelection(current, (pid) => own.has(pid)))
          setFocusedId((fid) => (fid !== null && own.has(fid) ? fid : null))
          // Back to where the user was standing before the merge, so the
          // instant between here and the incoming workspace's own camera is not
          // spent looking at lane space. restoreCamera below is what the user
          // actually ends on.
          if (preMerge) restoreCamera(preMerge.camera)
        }
        const outgoing: CanvasState = {
          panels: fromPanels(panelsRef.current),
          groups: groupsRef.current,
          bookmarks: bookmarksRef.current,
          runs: runsRef.current,
          ...(annotationsRef.current.length === 0 ? {} : { annotations: annotationsRef.current }),
          ...(starterRef.current === undefined ? {} : { starter: starterRef.current }),
          // The pre-merge snapshot, for the reason the layout.save effect reads
          // the same one: while merged these three are lane-space or foreign.
          // `panels` is untouched either way — it stays the active workspace's
          // real array, which is the read-only split displayPanels describes.
          camera: wasMerged && preMerge ? preMerge.camera : viewportRef.current,
          selectedId: wasMerged && preMerge ? preMerge.selectedId : selectedId,
          focusedId: wasMerged && preMerge ? preMerge.focusedId : focusedId
        }
        let result: ActivateResult | null
        try {
          result = await window.canvas.workspace.activate(id, outgoing)
        } catch (error: unknown) {
          // Unhandled otherwise: `void`ing the chain silences the lint, not
          // the rejection. A throw here can land after main has already
          // flipped activeWorkspaceId (activate is write-then-flip, not
          // atomic across the IPC boundary) while this renderer keeps
          // showing the outgoing canvas — the same shape boot()'s two
          // try/catches exist to prevent, just on the switch path instead of
          // the boot path.
          console.warn('[workspace] could not activate workspace', id, error)
          return false
        }
        // Null means the id named nothing — a stale palette row, or a
        // workspace deleted out from under an in-flight switch. Main changed
        // nothing, so neither does this.
        if (!result) return false
        const next = toPanels(result.state.panels)

        // Every restored panel arrives DORMANT unless it already has a live
        // session — the same rule boot() applies in renderer/main.tsx, for
        // the same reason: a switch must spawn nothing. Resolved BEFORE
        // `next` is committed (see this function's own doc comment above for
        // why the ordering, not just the rule, is what boot() actually
        // relies on) and reusing pty:list — main's authority on what is
        // actually live — rather than restating the rule is what keeps a
        // switch and a boot from disagreeing.
        let dormant: Set<string>
        try {
          const sessions = await window.canvas.pty.list()
          const live = new Set(sessions.map((s) => s.panelId))
          dormant = new Set(next.map((p) => p.rect.id).filter((pid) => !live.has(pid)))
        } catch (error: unknown) {
          // The same failure DIRECTION boot() chooses, for the same reason:
          // an empty set here means "spawn nothing", the safe side to fail
          // toward. Leaving `dormant` unset and falling through to the old
          // (outgoing) dormantIds would fail the OTHER way — every incoming
          // panel reading as non-dormant — which is the mass-spawn this
          // whole fix exists to prevent, arriving through an unhandled
          // rejection instead of a wrong ordering.
          console.warn(
            '[workspace] could not list live sessions; restoring every panel dormant', error
          )
          dormant = new Set(next.map((p) => p.rect.id))
        }

        // Committed together, in one synchronous block with no `await`
        // between them, so React batches them into a single render: `next`
        // and its correct `dormant` set reach the tiering memo on the same
        // pass, never `next` first and `dormant` a render later.
        //
        // setDormantIds here REPLACES the whole set rather than merging into
        // it, so `dormantIds` is not a global fact spanning every workspace
        // — it names only the incoming workspace's dormant panels. That is
        // correct, not lossy: `registry.ensure` early-returns for a session
        // that already exists, so a stale dormant id left over from a
        // workspace no longer showing does nothing if it lingers, and this
        // set is re-derived from a fresh pty:list every time a switch lands
        // here, so nothing is lost by discarding the outgoing workspace's
        // entries.
        setPanels(next)
        setGroups(result.state.groups ?? [])
        setRuns(sealAbandoned(result.state.runs ?? [], Date.now()))
        forgetOpenRuns()
        // M121. A flipped canvas stayed flipped across a switch (verifier 12):
        // the incoming workspace's panels arrived as summaries with nothing on
        // screen saying why. Flip is never persisted, so this is the one place
        // it has to be reset.
        setFlipped(false)
        setBookmarks(result.state.bookmarks ?? [])
        // M93. The incoming workspace's notes, or none: the outgoing ones must
        // not be carried into a workspace that never had them (the verifier).
        setAnnotations(result.state.annotations ?? [])
        // M181. The incoming workspace's starter record, or none.
        setStarter(result.state.starter)
        setDormantIds(dormant)
        selectOnly(result.state.selectedId)
        setFocusedId(result.state.focusedId)
        restoreCamera(result.state.camera)
        // HISTORY IS CLEARED, not carried. history is ONE stack over ONE
        // Panel[], and applyHistory disposes any panel the undone state no
        // longer contains — which reaches pty.kill. An uncarried stack would
        // let Cmd+Z apply the PREVIOUS workspace's array here and kill THIS
        // workspace's sessions to restore panels that are not even on
        // screen. Cmd+Z doing nothing right after a switch is the honest
        // failure; doing something is the dangerous one. verify:panels 67.
        //
        // Per-workspace stacks are the tempting alternative and are YAGNI:
        // undo is scoped to a gesture the user just made, and a per-workspace
        // stack would have to be disposed alongside its workspace or a
        // deleted workspace's history would hold Panel records whose
        // sessions are gone.
        setHistory(createHistory(next))
        // Re-seeded from the GLOBAL maximum ActivateResult hands back, not
        // from `next` alone — the same reason nextIdRef's own comment gives:
        // a workspace can be switched TO while another workspace's ids are
        // higher, and minting from this workspace's own panels would let
        // Cmd+N here collide with an id a hidden workspace already owns.
        // Math.max against the CURRENT counter, never a bare replace: the
        // seed is only as complete as `allPanelIds`, which depends on every
        // outgoing workspace having actually persisted its panels. A
        // restore-settings-off save can leave that list short (see
        // activateWorkspace's applyRestoreSettings:false), and a bare
        // replace would then let the counter drop — minting an id `new-
        // session -A` would attach to a session THIS run already has live
        // elsewhere. Never letting the counter move backwards within a run
        // holds regardless of what any future caller's seed contains.
        // ONE seeding rule, shared with Canvas.tsx's seed and M55's recovery.
        nextIdRef.current = seedAfter(result.allPanelIds, nextIdRef.current)
        // Refreshes workspaceRows so the rail's Workspaces section reflects
        // which workspace is now active — see reloadWorkspacesRef's own
        // comment for why this is a ref rather than a direct call.
        reloadWorkspacesRef.current?.()
        return true
      } finally {
        transitionRef.current = false
      }
    },
    [selectedId, focusedId, restoreCamera]
  )

  /**
   * Which of `ids` must be dormant, asked of main rather than assumed.
   *
   * ONE rule, reached by all three merged-view transitions (enter, refetch,
   * leave), for the reason switchWorkspace reuses pty:list rather than
   * restating the rule: main is the authority on what is actually live, and a
   * second derivation would let a switch and a merge disagree about the same
   * panel.
   *
   * It differs from switchWorkspace's blanket "not live means dormant" in one
   * clause — a panel this renderer already holds an AWAKE session for stays
   * awake — and that clause is not defensiveness, it is the refetch path's
   * common case. A refetch fires because a panel was just spawned in the
   * active workspace, and a freshly spawned panel is not in pty:list until
   * pty:create has resolved; the blanket rule would mark it dormant, lod.ts
   * would then refuse to promote it, and Cmd+N while merged would produce a
   * panel that never starts — a dead panel where the feature promised a live
   * one. An unknown id answers `?? true`, i.e. dormant, which is the safe
   * direction and the only answer that matters for a foreign panel this
   * canvas has never rendered.
   *
   * A rejection fails toward EVERYTHING dormant — the same direction boot()
   * and switchWorkspace both choose, because nothing spawning is the safe
   * side to fail on.
   */
  const resolveDormant = useCallback(async (ids: string[]): Promise<Set<string>> => {
    try {
      const sessions = await window.canvas.pty.list()
      const live = new Set(sessions.map((s) => s.panelId))
      return new Set(
        ids.filter((id) => !live.has(id) && (registry.get(id)?.dormant ?? true))
      )
    } catch (error: unknown) {
      console.warn('[merged] could not list live sessions; every panel dormant', error)
      return new Set(ids)
    }
  }, [])

  /**
   * Enter the merged view, or leave it.
   *
   * THE ORDERING IS THE WHOLE FUNCTION, and it is switchWorkspace's doc
   * comment applied to a second door. `pty.list()` is AWAITED BEFORE the
   * merged array is committed, and `setDormantIds` runs in the SAME
   * synchronous block as `setMergedData`/`setMerged` with no `await` between
   * them, so React batches them into one render. `registry.ensure` (in the
   * tiering memo) early-returns for a session that already exists, so a
   * dormantIds correction arriving even one render later can NEVER repair a
   * session that was already created non-dormant: lod.ts promotes the panel
   * because dormantIds does not yet contain it, the registry's own dormancy
   * guard passes because session.dormant is already false, and attachSlot
   * spawns. Both dormancy layers agree, for the wrong reason. The result
   * would be up to LIVE_BUDGET agent CLIs launched by a VIEW TOGGLE with no
   * user gesture at all — every workspace at once, which is strictly worse
   * than the workspace switch that taught us this.
   *
   * Leaving re-derives the dormant set for the ACTIVE workspace from a FRESH
   * pty:list rather than carrying the merged one back: that set names ids
   * this canvas does not hold, and it is re-derived on every entry anyway —
   * the same replace-rather-than-merge ruling switchWorkspace records.
   */
  const toggleMerged = useCallback(() => {
    // Refused, not queued, while any workspace transition is in flight — the
    // same one flag switchWorkspace takes, because the pair that corrupts a
    // record is a merge and a SWITCH interleaving, not two merges. See
    // transitionRef's own comment. Set synchronously here rather than inside
    // the async body for the reason the flag exists at all: the body below
    // runs to its first await synchronously, but a reader arriving later must
    // not have to prove that to know the window is closed.
    if (transitionRef.current) return
    transitionRef.current = true
    // T4-7: a draw begun on the ordinary canvas and still held when either
    // direction of this toggle lands must not survive it — see LinkDraw.end's
    // own comment for the failure this prevents (a ghost painting across lane
    // space, and an onUp that would commit a link to a foreign workspace's
    // panel id). Synchronous, before the first await, for the same reason
    // transitionRef is set synchronously above: cancel WITHOUT committing,
    // the same path Escape takes.
    linkDraw.end()
    void (async (): Promise<void> => {
      try {
        if (mergedRef.current) {
          const dormant = await resolveDormant(panelsRef.current.map((p) => p.rect.id))
          setMerged(false)
          setMergedData(null)
          setDormantIds(dormant)
          // A foreign id must not survive as this workspace's stored selection.
          // layout.save persists selectedId into the ACTIVE workspace's record,
          // so a selection made in another lane would be written into a
          // workspace that has no such panel — a record that is well-formed and
          // names nothing, and a rail whose selected row does not exist.
          const own = new Set(panelsRef.current.map((p) => p.rect.id))
          setSelectedIds((current) => retainSelection(current, (id) => own.has(id)))
          setFocusedId((id) => (id !== null && own.has(id) ? id : null))
          // The camera goes back to where the user left it, through the named
          // verb rather than by letting the next save sort it out. A merged
          // camera is in LANE SPACE — the active workspace's own panels were
          // normalised to their lane's origin, so the coordinates the user
          // panned to describe a canvas that no longer exists the instant the
          // view closes. Leaving it would put the user in front of empty space
          // with nothing on screen explaining why, and Cmd+0 is a recovery they
          // would have to already know about. restoreCamera, not centreOn: the
          // ZOOM is part of what was left behind too.
          const before = preMergeRef.current
          if (before) restoreCamera(before.camera)
          preMergeRef.current = null
          return
        }
        let workspaces: MergedWorkspace[]
        try {
          workspaces = await window.canvas.workspace.merged()
        } catch (error: unknown) {
          // Unhandled otherwise: `void`ing the chain silences the lint, not the
          // rejection. Nothing is committed, so the canvas stays exactly as it
          // was — the same "main changed nothing, so neither does this" ruling
          // switchWorkspace's null result gets.
          console.warn('[merged] could not read every workspace', error)
          return
        }
        const dormant = await resolveDormant(
          workspaces.flatMap((w) => w.panels.map((p) => p.id))
        )
        // Captured in the SAME synchronous block that commits the view, and the
        // camera comes from the REF rather than from this closure: the two
        // awaits above are a real window, and `viewport` changes on every wheel
        // event, so a closure read here is a camera the leave would restore to
        // wherever the user was standing when toggleMerged was last rebuilt.
        // The selection and focus come from the closure, which is exactly the
        // split switchWorkspace makes for its own outgoing state and for the
        // same reason — both are in this callback's dep list, so neither can be
        // more than one render stale.
        preMergeRef.current = { camera: viewportRef.current, selectedId, focusedId }
        setMergedData(workspaces)
        setDormantIds(dormant)
        setMerged(true)
      } finally {
        transitionRef.current = false
      }
    })()
  }, [resolveDormant, restoreCamera, selectedId, focusedId, linkDraw.end])
  // Cmd+Shift+A's implementation, handed to useViewport through the ref
  // declared beside its call — see that ref's own comment for why the
  // indirection exists rather than a direct argument.
  toggleMergedImplRef.current = toggleMerged


  // Corrects xterm's coordinates for the world transform. Reads the scale
  // through a ref so the listener is installed once and never resubscribes —
  // viewport changes on every wheel event.
  useEffect(() => installPointerCorrection(() => viewportRef.current.scale), [])

  // Mirrors paletteActions.deleteWorkspace for the __m7aWorkspace test hook
  // below, which is defined (and its effect runs) before `paletteActions`
  // exists later in this component — referencing it directly would be a
  // TDZ error, not merely a stale closure. The same mirror-into-a-ref move
  // `focusedIdRef` and `viewportRef` already make in this file. Populated by
  // an effect right after paletteActions is declared; read only from inside
  // a callback the test hook itself doesn't invoke until well after mount.
  const deleteWorkspaceRef = useRef<PaletteActions['deleteWorkspace'] | null>(null)

  // Same ordering problem, same fix: switchWorkspace is declared here, but
  // reloadWorkspaces (below, with the palette's other reload* loaders) reads
  // workspaceRows state that does not exist yet at this point in the
  // component. The rail's Workspaces section renders `active` per row and is
  // ALWAYS mounted — unlike the palette, which reloads fresh on every open —
  // so a switch that left workspaceRows stale would freeze every row's
  // disabled/active state at whatever it last was, including the row a rail
  // click just switched TO, which is silently unclickable from then on.
  const reloadWorkspacesRef = useRef<(() => void) | null>(null)

  /**
   * File a selection of panels into another workspace's record.
   *
   * Two absences carry this whole verb, and both fail SILENTLY if undone.
   *
   * NO registry.dispose, and no pty.kill. A moved panel becomes a HIDDEN
   * workspace's panel with a running tmux session — exactly the state a
   * workspace switch already produces ("demote, not dispose"), reached
   * through a third door. Disposing here would kill a running agent as a
   * side effect of FILING it, and every count-based observable stays correct
   * against that bug: the panel leaves this canvas either way, main's record
   * is right either way, the rail is right either way. Only the pid tells
   * them apart, which is why verify:panels 121 reads pty:list.
   *
   * NO commitHistory. `history` is ONE stack over ONE Panel[], and
   * applyHistory disposes any panel an undone state no longer contains —
   * which reaches pty.kill. An undo after a move would either resurrect
   * panels main's record no longer lists here, or kill sessions that now
   * belong to another workspace. Cmd+Z doing nothing after a move is the
   * honest failure; doing something kills someone else's agents. The same
   * ruling switchWorkspace records for clearing the stack, and M9c's commit
   * records for pushing no entry.
   */
  const movePanelsToWorkspace = useCallback(
    (panelIds: string[], target: { workspaceId: string } | { newName: string }): void => {
      // Nothing selected is not an error and must not mint a workspace: the
      // `newName` branch would otherwise create an empty canvas as the
      // side effect of a verb that then moved nothing into it.
      if (panelIds.length === 0) return
      // The merged view is read-only, and this is the AUTHORITY for that —
      // the palette's own rows are disabled with REASON_MERGED_READ_ONLY, but
      // a disabled row is an affordance and this is the verb. Reached from
      // the merged view, a single CLICK on any lane's panel is a selection,
      // so the move rows would refile a panel out of a workspace the user is
      // not even in — the hazard the marquee gate already covers, reachable
      // with one fewer step and no rubber band to notice. Worse, `panels`
      // does not contain that id, so nothing here would change on screen and
      // `panels.length` would not move — the refetch never fires, and the
      // panel goes on rendering in a lane it no longer belongs to until the
      // view is toggled.
      if (mergedRef.current) return
      void (async (): Promise<void> => {
        let result: { workspaceId: string } | null
        try {
          result = await window.canvas.workspace.movePanels(panelIds, target)
        } catch (error: unknown) {
          // Unhandled otherwise: `void`ing the chain silences the lint, not
          // the rejection — the same treatment switchWorkspace's own await
          // gets, and for the same reason. Main changed nothing it did not
          // finish, so leaving this canvas exactly as it is is the honest
          // response to a throw.
          console.warn('[workspace] could not move panels', panelIds, error)
          return
        }
        // Null means the target named nothing and main changed NOTHING — a
        // stale palette row, or a workspace deleted out from under an
        // in-flight move. Dropping the panels locally here would leave them
        // rendered by no workspace at all while their sessions ran on, so
        // this takes the same branch activateWorkspace's unknown-id case
        // takes, for the same reason.
        if (!result) return
        const moved = new Set(panelIds)
        // Read once from the ref and used for BOTH commits below, so the
        // panels React renders and the panels history is re-seeded from
        // cannot disagree — the same source switchWorkspace reads for the
        // outgoing canvas.
        const remaining = panelsRef.current.filter((p) => !moved.has(p.rect.id))
        setPanels(remaining)
        // HISTORY IS CLEARED, and pushing no entry is NOT enough on its own.
        // That was the first implementation and verify:panels 122 caught it:
        // `history.present` still held the pre-move array, so one Cmd+Z
        // stepped back to a state that predates the moved panel, and
        // applyHistory disposes every panel an undone state no longer
        // contains — killing a running agent that now belongs to ANOTHER
        // workspace, from a keystroke aimed at this one. Measured, not
        // reasoned: `n105: 85186 -> MISSING`.
        //
        // The same clearing switchWorkspace does, for the same reason, and it
        // has the same cost: gestures made in this canvas before the move
        // stop being undoable. The surgical alternative — strip the moved ids
        // out of every past and future entry, so earlier gestures survive —
        // is real machinery over history.ts and is not what this milestone
        // scoped. Cmd+Z doing nothing after a move is the honest failure;
        // doing something kills someone else's agents.
        setHistory(createHistory(remaining))
        // EMPTY_SELECTION rather than a fresh Set, so a move that selected
        // nothing new keeps the identity stable for the memos downstream.
        setSelectedIds(EMPTY_SELECTION)
        // assignTiers pins the focused panel live UNCONDITIONALLY, so a
        // focusedId naming a panel that is no longer on this canvas holds a
        // budget slot for the rest of the run and keeps routing Cmd+C to a
        // panel the user cannot see.
        if (focusedId !== null && moved.has(focusedId)) setFocusedId(null)
        // The rail's Workspaces section renders each workspace's panel count
        // and is ALWAYS mounted, so without this both the source and the
        // destination row keep their pre-move counts until something else
        // happens to reload. A ref for the reason switchWorkspace uses one:
        // reloadWorkspaces is declared further down this component.
        reloadWorkspacesRef.current?.()
      })()
    },
    [focusedId]
  )

  return {
    switchWorkspace, resolveDormant, toggleMerged, movePanelsToWorkspace,
    deleteWorkspaceRef, reloadWorkspacesRef
  }
}
