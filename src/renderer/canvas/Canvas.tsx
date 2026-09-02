import {
  useCallback, useEffect, useMemo, useRef, useState,
  type DragEvent, type JSX, type MouseEvent
} from 'react'
import { CanvasHud } from './CanvasHud'
import { DiagnosticsOverlay } from './DiagnosticsOverlay'
import { useDiagnostics } from './useDiagnostics'
import { EdgeIndicators } from './EdgeIndicators'
import { LinkLayer } from './LinkLayer'
import { useLinkMode } from './useLinkMode'
import { useSpaceHeld } from './useSpaceHeld'
import { useLinkDraw } from './useLinkDraw'
import { SubagentLayer } from './SubagentLayer'
import { useCanvasTestHooks } from './useCanvasTestHooks'
import { usePaletteActions } from './usePaletteActions'
import { useWorkspaceVerbs } from './useWorkspaceVerbs'
import { useCanvasPointer } from './useCanvasPointer'
import { useRailModels } from './useRailModels'
import { useFileTree } from './useFileTree'
import { useInspectorDetail } from './useInspectorDetail'
import {
  DEMOTE_DELAY_MS, EMPTY_CREDENTIALS, EMPTY_PRESETS, EMPTY_PROMPTS, EMPTY_WORKTREES,
  EMPTY_SELECTION, EMPTY_SETTINGS, EMPTY_WORKSPACES,
  MACHINE_COST_SAMPLE_MS, retainSelection
} from './canvas-constants'
import { useViewport } from './useViewport'
import { assignTiers, LIVE_BUDGET, type Tier } from './lod'
import {
  screenToWorld, type Point, type Viewport, type WorldRect
} from './viewport'
import { Marquee, type MarqueeScreenRect } from './MarqueeLayer'
import { MergedLanes } from './MergedLanes'
import { mergedLayout } from './merged-layout'
import { usePanelDrag } from './usePanelDrag'
import { GroupLayer } from '@renderer/groups/GroupLayer'
import { applyGroupDrag, groupDragState, pruneGroups, raiseGroup, removeGroup, type CanvasGroup } from '@renderer/groups/groups'
import { useGroupDrag } from '@renderer/groups/useGroupDrag'
import type { DragState } from './panel-interaction'
import { nextAttentionId, reachableQueue, type JumpDirection } from './attention'
import { TerminalPanel } from '@renderer/components/TerminalPanel'
import { PORT_MIN_SCALE } from '@renderer/components/PanelPorts'
import { ReviewNode } from '@renderer/review/ReviewNode'
import { FileNode } from '@renderer/file/FileNode'
import { ToolboxNode } from '@renderer/toolbox/ToolboxNode'
import { NavGrid } from '@renderer/navgrid/NavGrid'
import { useNavGrid } from '@renderer/navgrid/useNavGrid'
import { createRegistry } from '@renderer/session/session-registry'
import { useRegistryVersion } from '@renderer/session/useRegistry'
import {
  applyAgentState, attentionIds, clearAgentState, useAttentionIds
} from '@renderer/session/agent-state-store'
import {
  applyLiveSession, clearLiveSession, getLiveSession
} from '@renderer/session/live-session-store'
import { applySubagents, clearSubagents } from '@renderer/session/subagent-store'
import { applyFileResult, clearFileResult } from '@renderer/session/file-store'
import { clearToolbox } from '@renderer/session/toolbox-store'
import { applyUsage, clearUsage } from '@renderer/session/usage-store'
import { applyMachineCosts, clearMachineCost, useMachineCostTotal } from '@renderer/session/machine-cost-store'
import { createSessionFactory } from '@renderer/terminal/session-factory'
import type { CanvasState } from '@shared/layout-schema'
import type { MachineCostTarget } from '@shared/machine-cost'
import type {
  CapturedPanel,
  MergedWorkspace,
  PresetTemplate,
  SessionBackendInfo,
  SettingRow,
  WorkspaceRow, WorktreeListRow } from '@shared/ipc-contract'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'
import {
  cascadeCentre, firstRunPanels, isFilePanel, isJiraPanel, isReviewPanel, isTerminalPanel, isToolboxPanel, makeFilePanel, makeJiraPanel,
  makeToolboxPanel,
  makePanel, makeReviewPanel, nextZ, raisePanel, removePanel, reviewCentre, setPanelRect,
  addLink, setRestartOnExit, linksOf,
  type Panel, type TerminalPanel as TerminalPanelModel
} from '@renderer/panels/panels'
import { createHistory, pushHistory, undoHistory, redoHistory, type History } from '@renderer/panels/history'
import { usePalette } from '@renderer/palette/usePalette'
import { Palette, type InputMode } from '@renderer/palette/Palette'
import type { PresetRow, PromptRow } from '@renderer/palette/commands'
import { type CredentialMeta } from '@shared/credential-schema'
import type { WorkItem } from '@shared/work-item'
import { JiraNode } from '@renderer/jira/JiraNode'
// M8a. The frame is rendered here rather than in App.tsx because every verb it
// will eventually need (paletteActions, the camera verbs, presetRows) is state
// that lives inside Canvas — an App-owned frame would mean lifting all of it up
// or threading it back through a callback, making App a state owner in exchange
// for a tidier diagram.
import { TopBar } from '../shell/TopBar'
import { SideRail } from '../shell/SideRail'
import { Inspector } from '../shell/Inspector'
import type { AutomationRow } from '../shell/Inspector'
import { FileTree } from '../shell/FileTree'
import { useShellChrome } from '../shell/useShellChrome'
import { railLabel } from '../shell/rail-rows'
import { isRestartable, isRunning } from '../shell/inspector-fields'


const registry = createRegistry({
  bridge: window.canvas,
  factory: createSessionFactory()
})

// THERE IS DELIBERATELY NO `beforeunload` TEARDOWN HERE, and adding one back
// silently deletes M4c's headline feature.
//
// Until M4c this file called registry.disposeAll() on beforeunload, because
// "the renderer is going away" and "these processes should die" were the same
// statement. M4c split them: a teardown detaches the tmux CLIENT while the
// SESSION keeps running, so the next page's pty:create lands back in the same
// process. disposeAll() sends pty:kill for every panel, and pty:kill means
// `tmux kill-session` — the opposite of a detach.
//
// It also WINS the race. beforeunload runs before the navigation starts, so on
// Cmd+R main receives every pty:kill first and window-lifecycle.ts's
// did-start-navigation detachAll() then walks an already-empty map. Measured
// under this repo's own Electron: pty:kill(n1) arrived first, detachAll second.
//
// Renderer teardown is main's job in all three of its shapes
// (did-start-navigation, render-process-gone, closed) and quitting is
// before-quit's (killAll + backend.shutdown()), so nothing here is left
// unhandled. What this loses is freeing xterm/WebGL from the renderer side on
// an orderly reload — which costs nothing, since the page is being destroyed
// and the browser reclaims both anyway.
//
// verify:panels check 26 reloads a real renderer against a real PtyManager on
// a tmux backend and asserts the session survives; that is what fails if this
// listener comes back.

export function Canvas({
  initial,
  liveSessionIds,
  defaultTemplate,
  allPanelIds
}: {
  initial: CanvasState
  /** Panels that already have a process; see renderer/main.tsx for the rule. */
  liveSessionIds: Set<string>
  /**
   * Cmd+N's template, as of the moment React mounted. A PROP rather than
   * something this component subscribes for, because main's push arrives
   * before any effect here runs — see renderer/main.tsx.
   */
  defaultTemplate?: PresetTemplate
  /**
   * Every panel id in every workspace, not just this one's — see
   * renderer/main.tsx for why nextIdRef needs the whole set rather than
   * `initial.panels` alone. A prop, and re-derived on every switch (below,
   * from ActivateResult.allPanelIds) rather than fetched here again: main
   * already answers with the up-to-date set as part of the switch itself.
   */
  allPanelIds: readonly string[]
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  // An empty panel list means first run (or a reset canvas): the store returns
  // no panels and the renderer decides what "nothing" opens with. That also
  // makes closing every panel and relaunching give back one fresh panel rather
  // than a blank canvas — intended, since a canvas with nothing on it and no
  // visible affordance is the outcome this design already rejected.
  const [panels, setPanels] = useState<Panel[]>(() =>
    initial.panels.length > 0 ? toPanels(initial.panels) : firstRunPanels()
  )
  const [groups, setGroups] = useState<CanvasGroup[]>(() => initial.groups ?? [])
  const nextGroupIdRef = useRef(
    (initial.groups ?? []).reduce((next, group) => {
      const match = /^g(\d+)$/.exec(group.id)
      return match ? Math.max(next, Number(match[1]) + 1) : next
    }, 1)
  )
  /**
   * M14's merged view: every workspace's panels on one canvas, in lanes.
   *
   * TRANSIENT view state, deliberately not a persisted setting. It is the
   * palette being open, not the rail being collapsed: persisting it would
   * mean a launch that reads every workspace's panels and mints a session for
   * each before the user has done anything at all.
   *
   * `mergedData` is main's answer (workspace:merged) and `merged` is whether
   * the user is looking at it; they are separate because leaving must not
   * throw away what was fetched mid-flight, and because a null `mergedData`
   * with `merged` true is the moment between the toggle and the answer.
   */
  const [merged, setMerged] = useState(false)
  const [mergedData, setMergedData] = useState<MergedWorkspace[] | null>(null)
  // Selection and drag handlers need the merged boundary before their own
  // declarations below; the stable ref also keeps memo'd panel callbacks from
  // changing identity when this transient view toggles.
  const mergedRef = useRef(merged)
  mergedRef.current = merged
  const mergedView = useMemo(
    () => (mergedData ? mergedLayout(mergedData) : null),
    [mergedData]
  )
  /**
   * What is RENDERED and TIERED — never what is SAVED.
   *
   * `panels` stays the active workspace's real array and remains the ONLY
   * thing the layout.save effect reads, which is what keeps the number of
   * writers to a workspace record at one. That split is the entire reason
   * geometry is read-only while merged: a rect here carries mergedLayout's
   * lane offset, so a drag would have to un-offset it and write it into
   * ANOTHER workspace's record while the coalesced save is writing this
   * one's — producing a well-formed layout.json with wrong coordinates in
   * it, found launches later with nothing naming the drag that caused it.
   */
  const displayPanels = merged && mergedView ? mergedView.panels : panels
  // Entry motion belongs to a panel's creation, not its mount. TerminalPanel
  // deliberately unmounts as it crosses LOD tiers, and replaying an entrance
  // after a pan would turn ordinary navigation into motion. The id is removed
  // when the wrapper animation ends, so its one-time render cost cannot join
  // the canvas's 60Hz path either.
  const [enteringPanelIds, setEnteringPanelIds] = useState<ReadonlySet<string>>(() => new Set())
  // Hit testing and the pip layer keep the WHOLE array: a review node is a
  // real, clickable panel and an off-screen one is a real thing to point at.
  const rects = useMemo(() => displayPanels.map((p) => p.rect), [displayPanels])

  /**
   * Tiering's input, and the reason a sessionless panel cannot take a
   * LIVE_BUDGET slot or a WebGL context: it is not in the array assignTiers is
   * given, so the guarantee is structural rather than a rule assignTiers has
   * to obey. The same filter gates registry.ensure below — a review node and a
   * file panel each have no spec to ensure with, and minting a PanelSession
   * for one would put a terminal in the map with nothing to run in it.
   *
   * `isTerminalPanel`, never `!isReviewPanel`. That spelling was correct while
   * `review` was the only sessionless kind and is wrong in the DANGEROUS
   * direction with two: a file panel satisfies !isReviewPanel, lands here,
   * reaches registry.ensure with no spec, and burns a budget slot and a WebGL
   * context on a <pre>. See isTerminalPanel's own comment in panels.ts.
   */
  const terminalPanels = useMemo(
    // displayPanels, so the merged view tiers foreign panels too — and
    // isTerminalPanel, main's POSITIVE predicate, never !isReviewPanel: with a
    // third kind on the canvas the negative test admits a file panel here,
    // which reaches registry.ensure with no spec and burns a budget slot and a
    // WebGL context on a <pre>.
    () => displayPanels.filter((p): p is TerminalPanelModel => isTerminalPanel(p)),
    [displayPanels]
  )
  const terminalRects = useMemo(() => terminalPanels.map((p) => p.rect), [terminalPanels])
  // A collapsed group is a presentation request, never a lifecycle command:
  // its panels remain in the registry and merely receive lod.ts's cheap card.
  const collapsedPanelIds = useMemo(() => new Set(
    groups.filter((group) => group.collapsed).flatMap((group) => group.panelIds)
  ), [groups])
  // hitTest returns the LAST match, so paint order and pick order agree only
  // if the array it receives is in paint order. Paint order is z now, not
  // array position — see the note on Panel.z.
  const hitOrder = useMemo(
    () => [...displayPanels].sort((a, b) => a.z - b.z).map((p) => p.rect),
    [displayPanels]
  )
  // M35. Read through a ref because hitOrder is a fresh array on every frame
  // of a panel drag, and useLinkDraw's document listeners are installed once.
  // Declared here, immediately after hitOrder itself, rather than beside the
  // other display-time refs further down (displayPanelsRef's neighbourhood):
  // useLinkDraw is constructed further below, once viewportRef exists (see
  // its own comment there for why THAT is deferred), and this ref has to
  // exist before that construction reads it.
  const hitOrderRef = useRef(hitOrder)
  hitOrderRef.current = hitOrder

  // M13. Armed by the palette's `panel.link` row and the inspector's Link
  // button; resolved by the next mousedown on the canvas (see
  // onLinkModeMouseDownCapture). Declared up here because the mousedown
  // handler and the render both read it.
  const linkMode = useLinkMode()
  // Declared before useViewport (which takes it as an argument) rather than
  // grouped with the other callbacks below: a const used before its
  // declaration is a TDZ error, not just a style preference.
  //
  // The id is a monotonic sequence, NOT the array's length. Length-derived ids
  // were sound while the array only grew; removePanel breaks that — spawn n13, close any
  // panel, spawn again, and the second panel is n13 too. Every consequence is
  // silent: registry.ensure returns the EXISTING session, so the new panel
  // renders the old one's handle.host (which can only live in one slot), and
  // setPanelRect/removePanel then act on both entries at once. The counter is a
  // ref rather than state because nothing renders it. `n` keeps it clear of the
  // seed panels' `s` ids.
  //
  // Seeded from the RESTORED ids, never from a constant. `1` on every run was
  // sound while the array always started empty; persistence breaks that.
  // Restore a canvas holding n5, press Cmd+N five times, and the fifth panel is
  // n5 too — the same duplicate-id defect the comment above describes,
  // resurrected through a different door.
  //
  // M7: seeded from `allPanelIds` — EVERY workspace's ids, not just this
  // one's (`initial.panels`) — for the same persistence reason, arriving
  // through a different door. PanelId doubles as the tmux session name, so
  // Cmd+N in workspace B minting an id workspace A already uses is two panels
  // naming one session; the second to go live attaches to the first one's
  // process, with nothing visibly wrong on either panel. `switchWorkspace`
  // re-seeds this same ref from ActivateResult.allPanelIds on every switch,
  // for the identical reason.
  const nextIdRef = useRef(
    allPanelIds.reduce((max, id) => {
      // All THREE prefixes, one sequence. `n` panels, `r` review nodes and
      // `f` file panels draw from the same counter precisely so none can mint
      // an id another owns; a regex that only saw `n` would restore a canvas
      // holding r7 and then hand out n7, which is one id for two panels. The
      // same trap is live for `f`: a regex blind to it recomputes a maximum a
      // persisted f7 had no part in, and the next open mints f7 twice — React
      // collides on the key and parseLayout drops one silently at the next
      // load. BOTH seed sites (here and switchWorkspace) must carry the same
      // character class; missing either reopens it through the other door.
      const match = /^[nrfjt](\d+)$/.exec(id)
      return match ? Math.max(max, Number(match[1]) + 1) : max
    }, 1)
  )
  // The undo stack holds Panel[] — the same array persistence already
  // serialises. Camera moves are deliberately absent: pan and zoom are
  // continuous and self-evidently reversible by doing the opposite, and
  // putting them here would make Cmd+Z usually rewind a scroll instead of the
  // edit the user meant.
  //
  // The `present` half of History is read only through the updater callbacks
  // below (setHistory((h) => ...)), never off a `history` local — every read
  // site needs the LATEST past/future, and closing over a render's snapshot
  // would undo/redo against a stale stack the moment two edits landed in the
  // same tick. Destructuring only the setter also keeps `noUnusedLocals`
  // honest instead of manufacturing a read nothing else needs.
  const [, setHistory] = useState<History<Panel[]>>(() => createHistory(panels))

  // Declared before onSpawn (which uses it) rather than grouped with the
  // other undo plumbing below applyHistory needs: applyHistory itself needs
  // setSelectedIds/setFocusedId/setDormantIds, which are not declared until
  // further down, so it is defined after them. commitHistory has no such
  // dependency and can be pushed up here instead of forward-declaring onSpawn.
  //
  // A note on a pattern used throughout this file's history plumbing: onSpawn,
  // onClosePanel, and onSelectPanel below all call commitHistory (which itself
  // calls setHistory) from INSIDE a setPanels(current => ...) updater, and the
  // undo/redo paths (the effect above and __m4bUndo) call applyHistory (which
  // calls four more setters) from inside a setHistory updater. React's
  // documented contract is that updater functions are pure — no side effects.
  // This is safe ONLY because this app deliberately runs without StrictMode
  // (see src/renderer/main.tsx and CLAUDE.md's "No StrictMode" note): under
  // StrictMode, React double-invokes updaters in development to surface
  // exactly this kind of impurity, and every operation here (pushHistory,
  // registry.dispose, the setState calls in applyHistory) is idempotent under
  // a second invocation with the same arguments, but the DOUBLE-INVOCATION
  // itself — two dispose() calls, two history pushes — is not something this
  // code has been proven against. If StrictMode is ever turned back on, this
  // whole call chain needs re-auditing before trusting it again.
  const commitHistory = useCallback((next: Panel[]) => {
    setHistory((h) => pushHistory(h, next))
  }, [])

  // The template Cmd+N spawns. A ref, not state: it is read inside onSpawn's
  // callback and a re-render is pointless — nothing on screen depends on it.
  //
  // SEEDED from the prop, not from undefined. main pushes PRESET_DEFAULT at
  // did-finish-load, which is over before this component's effects run, so the
  // subscription below never sees the boot push — renderer/main.tsx catches it
  // at module scope and it arrives here as a prop. Seeding from undefined
  // instead reads as harmless (makePanel falls back to a login shell) and is
  // exactly the silent inertness that made every configured default do
  // nothing; verify:panels 32 is the check that fails if this goes back.
  // The subscription stays for the re-push case: a runtime change to the
  // presets or the default still has to land after mount.
  const defaultTemplateRef = useRef<PresetTemplate | undefined>(defaultTemplate)

  const onSpawn = useCallback(
    (centre: Point, template?: PresetTemplate, opening?: { title?: string; context?: string }) => {
      const chosen = template ?? defaultTemplateRef.current
      const id = `n${nextIdRef.current++}`
      setEnteringPanelIds((current) => new Set(current).add(id))
      setPanels((current) => {
        // Where the panel ACTUALLY goes. Without this, N presses at an
        // unmoved camera produce N byte-identical rects and the canvas looks
        // like it holds one panel — see cascadeCentre for the whole argument.
        //
        // `current` — this updater's own argument — and never a panelsRef.
        // React applies queued updaters sequentially, so two spawns batched
        // into one tick each see the previous one's array; a ref (written a
        // render later) would hand both presses the same array and both would
        // pick the same slot, which is the stacking bug resurrected through a
        // door that only opens under batching.
        //
        // cascadeCentre being PURE is also what keeps this line clear of the
        // hazard the note above describes: called twice with the same
        // `current` it returns the same point, so a StrictMode double-invoke
        // could not place the panel somewhere else.
        const placed = cascadeCentre(centre, current)
        const next = [
          ...current,
          { ...makePanel(
            id,
            placed,
            nextZ(current),
            chosen
              ? {
                  panelId: id,
                  cwd: chosen.cwd,
                  args: [...chosen.args],
                  ...(chosen.command !== undefined ? { command: chosen.command } : {}),
                  ...(chosen.agent !== undefined ? { agent: chosen.agent } : {})
                  ,
                  // M20. The knobs, same absent-stays-absent rule as the two
                  // fields above it — this is the copy verify:panels 156
                  // exists to catch, because a key dropped here is legal
                  // TypeScript and produces a panel with no knobs, which
                  // looks exactly like a user who never asked for any.
                  ...(chosen.agentOptions !== undefined ? { agentOptions: chosen.agentOptions } : {}),
                  // M37. The same rule, a fifth time.
                  ...(chosen.worktree !== undefined ? { worktree: chosen.worktree } : {})
                }
              : undefined,
            chosen ? { w: chosen.w, h: chosen.h } : undefined
          ), ...(opening?.title === undefined ? {} : { title: opening.title }) }
        ]
        commitHistory(next)
        return next
      })
    },
    [commitHistory]
  )
  const [openingContexts, setOpeningContexts] = useState<Map<string, string>>(() => new Map())
  // A STABLE identity, and the reason is TerminalPanel's memo. This was an
  // inline arrow on every terminal panel — a new function on every Canvas
  // render, and Canvas renders on every mousemove — so every panel's memo
  // re-rendered at 60Hz regardless of `version`, `title`, `glow` and M35's
  // `onBeginLink`/`linkTarget` discipline, all of which exist to protect it.
  // Nothing threw and nothing looked wrong; the app just got heavy while a
  // panel was dragged. Closes over a setter only, so the list is empty.
  // verify:panels memo-stable.1 pins the JSX.
  const onContextPasted = useCallback((id: string) => {
    setOpeningContexts((current) => { const next = new Map(current); next.delete(id); return next })
  }, [])
  const spawnJiraTicket = useCallback((item: WorkItem) => {
    const id = `n${nextIdRef.current}`
    setOpeningContexts((current) => new Map(current).set(id, `Jira ticket ${item.id}: ${item.title}\n\n${item.description}`))
    onSpawn(screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current), undefined, { title: `${item.id}: ${item.title}` })
  }, [onSpawn])
  const openJiraPanel = useCallback(() => {
    const id = `j${nextIdRef.current++}`
    setPanels((current) => { const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current); const next = [...current, makeJiraPanel(id, cascadeCentre(centre, current), nextZ(current))]; commitHistory(next); return next })
  }, [commitHistory])
  // The selection is a SET: M18's marquee and M26's additive click build a
  // multi-selection without renaming the older single-selection call sites.
  //
  // focusedId is deliberately NOT widened alongside it. assignTiers pins the
  // focused panel live unconditionally, so focus is a budget-and-WebGL-context
  // claim rather than a highlight — a set of them would hold LIVE_BUDGET slots
  // for the rest of the run, with nothing on screen saying so.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() =>
    initial.selectedId === null ? EMPTY_SELECTION : new Set([initial.selectedId])
  )
  // A visible, intentionally temporary keyboard route. It is not persisted:
  // a relaunch must never resume sending a user's next keystroke to several
  // agents just because that happened to be useful before the window closed.
  const [broadcastInput, setBroadcastInput] = useState(false)
  // A chrome press selects and begins its drag in the same synchronous event.
  // React has not re-rendered between those two calls, so group drag reads this
  // mirror rather than a selection closure from the previous render.
  const selectedIdsRef = useRef<ReadonlySet<string>>(selectedIds)
  selectedIdsRef.current = selectedIds
  /**
   * The one selected panel, or null when zero OR MANY are selected. Every
   * existing reader of the selection — the inspector, the review query, the
   * rail, the HUD, the CanvasState written to disk — is asking "which single
   * panel is this about", and a multi-selection correctly reads as none: the
   * inspector's empty state is already a first-class state (verify:rail 27b),
   * not an error path that needs a new case adding to it.
   */
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null
  /**
   * Replace the whole selection with one panel, or clear it. The verb every
   * pre-existing `setSelectedId(x)` call site wanted; the set-shaped setter
   * stays private to this component so a caller cannot grow the selection by
   * accident before the gesture that is supposed to exists.
   */
  /**
   * The selection as an ARRAY, memoised on the Set's identity.
   *
   * Not `[...selectedIds]` inline at the JSX: this flows into Palette's
   * `commands` memo, whose [rows] effect re-seats the selected row, so a fresh
   * array on every render would re-seat the palette's selection on every
   * mousemove over the canvas — the silent-selection-move defect
   * "resetViewport must stay a useCallback" documents. `selectedIds` keeps its
   * identity across renders that do not change the selection (EMPTY_SELECTION
   * and retainSelection both preserve it), which is what makes this stable.
   */
  const selectedPanelIds = useMemo(() => [...selectedIds], [selectedIds])

  const selectOnly = useCallback((id: string | null): void => {
    const next = id === null ? EMPTY_SELECTION : new Set([id])
    selectedIdsRef.current = next
    setSelectedIds(next)
  }, [])
  /** Additive selection is deliberately add-only: background click clears. */
  const addToSelection = useCallback((id: string): void => {
    // A merged selection could contain ids owned by several workspaces. The
    // marquee already refuses to construct one there; shift-click must uphold
    // the same boundary rather than reopening that path through panel chrome.
    if (mergedRef.current || selectedIdsRef.current.has(id)) return
    const next = new Set(selectedIdsRef.current)
    next.add(id)
    selectedIdsRef.current = next
    setSelectedIds(next)
  }, [])
  // M13/motion: an entry animation ends and the id leaves the set. Kept
  // beside the selection helpers rather than folded into them — it is a
  // render-cost concern, not a selection one.
  const onPanelEntryEnd = useCallback((id: string) => {
    setEnteringPanelIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])
  const [focusedId, setFocusedId] = useState<string | null>(initial.focusedId)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })
  /**
   * The rubber band, in SCREEN pixels, or null when no marquee is in
   * progress. Screen rather than world because that is what the band is
   * PAINTED in — see Marquee.tsx — while the selection it drives is computed
   * in world units from the same two points; the two spaces are derived from
   * one gesture rather than kept in step by hand.
   */
  const [marquee, setMarquee] = useState<MarqueeScreenRect | null>(null)
  /** The gesture's origin in WORLD units, or null between gestures. */
  const marqueeFromRef = useRef<Point | null>(null)
  /**
   * The in-progress gesture's own teardown, or null when none is running.
   *
   * beginMarquee's `endMarquee` closes over the listeners it must remove, so
   * it cannot be lifted out of that closure — and something OUTSIDE the
   * gesture (entering the merged view) has to be able to end it. A ref is the
   * narrowest way to publish exactly that one verb.
   */
  const marqueeEndRef = useRef<(() => void) | null>(null)

  // One shot: the backend cannot change during a run, so this is not a
  // subscription. A failure leaves it null and the HUD simply says nothing,
  // which is the correct silent case — we only ever speak up for bad news.
  const [backendInfo, setBackendInfo] = useState<SessionBackendInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.canvas.session
      .info()
      .then((info) => {
        if (!cancelled) setBackendInfo(info)
      })
      .catch((error: unknown) => {
        console.warn('[backend] could not read the session backend', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Panels that came from disk start dormant; first-run panels do not. The
  // renderer is what generates first-run panels, so it is also what knows
  // which panels were restored — no flag has to cross the IPC boundary.
  //
  // A restored panel with a live tmux session is subtracted out here: it has
  // no process to spawn, so M4b's dormancy rule does not apply to it — see
  // renderer/main.tsx for the full rule this settles.
  const [dormantIds, setDormantIds] = useState<ReadonlySet<string>>(
    () => new Set(initial.panels.map((p) => p.id).filter((id) => !liveSessionIds.has(id)))
  )

  // Applying a history state has to reach the registry too: an undone close
  // must recreate the panel's session, and it comes back DORMANT because its
  // PTY was killed on the click that closed it and there is nothing to
  // revive — registry.ensure (in the useMemo below) recreates the session
  // from scratch once the panel reappears in `panels`, and passing dormant:
  // true for it is what turns that into a card instead of a fresh spawn.
  //
  // Takes the PREVIOUS present array as its first argument, not just `next`.
  // Before M7 the departing set was derived from the WHOLE registry (every
  // session not in `next.present`), which was self-healing rather than a
  // shortcut: the registry only ever held ids from this one canvas's own
  // history, so "everything the registry has that `next` doesn't" and
  // "everything THIS transition just dropped" were the same set. M7 breaks
  // that equivalence — the registry now legitimately holds sessions for every
  // OTHER workspace too (see switchWorkspace's "demote, not dispose" doc
  // comment) — so a registry-wide diff would dispose every hidden workspace's
  // sessions on ANY undo/redo in this one, including a genuine no-op (empty
  // past/future, `next === previous`, nothing actually moved). Diffing
  // against the specific state this transition left, instead, gives the
  // right answer in both worlds: a real undo/redo still disposes exactly the
  // panel(s) that vanished from `present`, and a no-op disposes nothing,
  // because previousIds and ids are then identical.
  const applyHistory = useCallback((previousPresent: Panel[], next: History<Panel[]>) => {
    const ids = new Set(next.present.map((p) => p.rect.id))
    // Undo of a spawn (or redo of a close) removes a panel from `present`
    // without ever routing through onClosePanel, so without this loop a
    // panel undone out of existence keeps a live PTY forever: no panel
    // remains to render a close button for it, and the NEXT action clears
    // `future`, so redo cannot bring it back either. Calling registry.dispose
    // here is legitimate, not a violation of "tiering must never reach
    // dispose" — undo of a spawn IS an explicit panel removal, the same act
    // the close button and the reset handler perform, just driven by Cmd+Z
    // instead of a click. It does not add a caller of pty.kill: dispose(id)
    // and disposeAll() remain the only two (see session-registry.ts), and
    // routing through dispose() rather than calling pty.kill directly is
    // exactly what keeps that count true.
    // GUARDED FOR REVIEW NODES, the same branch onClosePanel takes one
    // screenful of reasons further down. A node owns no PanelSession, and
    // the registry's dispose sends pty.kill even for an id this renderer
    // holds no local session for (see CLAUDE.md, "dispose(id) sends pty.kill
    // even when this renderer holds no local session for that id") — so an
    // unguarded node undone out of existence sends a tmux kill-session named
    // after a panel that never had one, and drops in main the baseline of
    // whatever panel later recycles that id. M16's file panel is the SECOND
    // sessionless kind, and its arrival is what turns the old positive test
    // (`isReviewPanel`) from safe into wrong: a file panel satisfies
    // !isReviewPanel, so it would have taken the dispose branch and sent
    // exactly the stray kill this guard exists to prevent. The test is now
    // `!isTerminalPanel`, which is still a POSITIVE question about the one
    // kind that owns a process — see isTerminalPanel's own comment for why it
    // is spelled as it is. The guard stays on the ITERATION rather than on the
    // call, which is what keeps verify:panels 94's dispose-call-site count at
    // five.
    for (const panel of previousPresent) {
      if (!isTerminalPanel(panel)) {
        // A file panel's own cache still has to go — for the reason the two
        // clears below exist: without it the map grows for the life of the
        // renderer and a recycled id inherits a dead panel's file. Gated on
        // the panel actually being GONE, exactly as the dispose branch is: an
        // undo that merely moved a panel leaves it mounted, and clearing a
        // mounted panel's result puts it back to "reading…" with nothing left
        // to re-read it, because the effect's deps did not change.
        if (!ids.has(panel.rect.id)) { clearFileResult(panel.rect.id); clearToolbox(panel.rect.id) }
        continue
      }
      if (!ids.has(panel.rect.id)) {
        registry.dispose(panel.rect.id)
        // Without this the agent-state map grows for the life of the
        // renderer and a recycled id inherits a dead panel's border.
        clearAgentState(panel.rect.id)
        clearLiveSession(panel.rect.id)
        clearSubagents(panel.rect.id)
        clearUsage(panel.rect.id)
        clearMachineCost(panel.rect.id)
      }
    }
    setPanels(next.present)
    setGroups((current) => pruneGroups(current, ids))
    setDormantIds((current) => {
      const merged = new Set([...current].filter((id) => ids.has(id)))
      for (const panel of next.present) {
        const session = registry.get(panel.rect.id)
        // Read the registry's OWN dormant flag, not `!spawned`. registry.wake
        // clears session.dormant but does not spawn (a woken panel still has
        // to be promoted to live before attachSlot spawns it) — so a panel
        // woken while zoomed out below LIVE_MIN_SCALE stays unspawned with
        // dormant already false. Re-deriving from `!spawned` would put it
        // back in dormantIds on the next undo even though registry.ensure
        // (in the tiering memo) returns that SAME session untouched, leaving
        // its card reading "not started" instead of "click to start" until
        // another click. Keying off session.dormant means the two can never
        // diverge for a panel whose session already exists.
        //
        // A session of `undefined` is the OTHER case this loop has to cover:
        // undoing a close deletes the session entirely (registry.dispose),
        // so it does not exist yet here and the memo below recreates it from
        // scratch once `panels` re-renders. That recreation is what must
        // come back dormant (its PTY is gone with nothing to revive), so a
        // missing session counts as dormant too.
        if (!session || session.dormant) merged.add(panel.rect.id)
      }
      return merged
    })
    setSelectedIds((current) => retainSelection(current, (id) => ids.has(id)))
    setFocusedId((id) => (id && ids.has(id) ? id : null))
  }, [])

  // Mirrors focusedId into a ref so shouldYieldWheel (below) can read the
  // current focus without being redefined on every focus change — it must
  // stay referentially stable (useCallback with an empty dep list) so
  // useViewport's effect installs the wheel listener exactly once.
  const focusedIdRef = useRef(focusedId)
  focusedIdRef.current = focusedId

  // Same mirror-into-a-ref pattern, for the reset listener below: it must
  // install once, but panels changes on every frame of a drag.
  const panelsRef = useRef(panels)
  panelsRef.current = panels

  // M27. The same pattern again, for a value declared in the OTHER direction:
  // `noteRoot` depends on the selection and the live-session store and is
  // computed far below, while `beginNewNote` sits in the palette-actions memo
  // far above. Assigned where noteRoot is defined; read at CALL time, which is
  // also what makes the row act on the panel selected NOW rather than the one
  // selected when the palette opened.
  const noteRootRef = useRef<string | null>(null)
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  // Panels can disappear through close, undo, reset, or a workspace move.
  // Repair membership in one place so none of those paths leave a group
  // pointing at a vanished rect.
  useEffect(() => {
    const ids = new Set(panels.map((panel) => panel.rect.id))
    setGroups((current) => pruneGroups(current, ids))
  }, [panels])

  /**
   * The same mirror for the merged view's two facts, and the split between
   * them matters at every read site.
   *
   * `mergedRef` gates the MUTATING gestures (drag, resize, close, marquee).
   * Those handlers must keep a stable identity — onBeginDrag and onClosePanel
   * both go into TerminalPanel's memo'd props, and a fresh arrow per toggle
   * would re-render every panel — so they read the flag rather than close
   * over it.
   *
   * `displayPanelsRef` is what anything acting on WHAT IS ON SCREEN reads:
   * goToPanel and the attention jump both frame a rect, and while merged the
   * only rects that exist on screen are lane-offset ones. Reading `panels`
   * there would leave the rail listing a foreign panel whose row navigates
   * nowhere. Everything that acts on what is SAVED keeps reading panelsRef —
   * that is the read-only split, restated as two refs.
   */
  /**
   * What the canvas looked like the instant before the merged view opened:
   * the camera, the selection and the focus.
   *
   * The merged view's whole design claim is that it writes nothing, and until
   * this ref existed that claim was false for three of the four fields
   * layout.save persists. Panning while merged wrote a LANE-SPACE camera into
   * the active workspace's record — coordinates that mean nothing outside the
   * lane arrangement they came from — and selecting a foreign panel wrote its
   * id there too. Neither is recoverable by leaving, because the damage is
   * already on disk: quit while merged and the next launch opens onto empty
   * space with a selectedId naming a panel this workspace has never held.
   *
   * A ref rather than state because nothing renders from it and it must not
   * re-run the save effect on its own; null exactly when `merged` is false.
   */
  const preMergeRef = useRef<{
    camera: Viewport
    selectedId: string | null
    focusedId: string | null
  } | null>(null)
  const displayPanelsRef = useRef(displayPanels)
  displayPanelsRef.current = displayPanels

  /**
   * ONE in-flight flag covering BOTH async workspace transitions —
   * `switchWorkspace` and `toggleMerged` — because either one starting while
   * the other (or itself) is mid-flight corrupts a workspace RECORD, and the
   * two ways it does so are different enough that a per-function guard would
   * close only half of it.
   *
   * A switch's window is two IPC round trips (activate, then pty:list),
   * widened arbitrarily by whatever main is doing — pollLive's execFileSync
   * blocks main's event loop for the duration of a tmux subprocess every two
   * seconds. Inside that window:
   *
   *   Two Cmd+Shift+] presses. The second reads `workspaceRows.active`, which
   *   the first switch has not refreshed yet (reloadWorkspaces runs at the
   *   very END of the async block), re-targets the SAME id, and captures a
   *   second `outgoing` from `panelsRef` — still workspace A's panels,
   *   because setPanels has not landed either. Both activates write A's panel
   *   array, the second into B's record: A's panel ids listed in TWO
   *   workspaces, which is the one-tmux-session-two-panels hazard global
   *   panel ids exist to make impossible.
   *
   *   Cmd+Shift+A then Cmd+Shift+]. toggleMerged commits `preMergeRef` AFTER
   *   its two awaits, so the merge entry lands after the switch has already
   *   happened — and that ref then describes the OUTGOING workspace while
   *   `merged` is true, which is exactly what the layout.save effect reads.
   *   Every save for as long as the view stays open writes the previous
   *   workspace's camera, selection and focus into the INCOMING workspace's
   *   record, and leaving restores that camera over the switch's own. It is
   *   the corruption switchWorkspace's own merged-leave guard exists to
   *   prevent, reached from the other side.
   *
   * A second transition requested while one is in flight is REFUSED, never
   * queued: a queued switch lands on a canvas the user has since left, and
   * the rule this file already applies to an uncarried undo stack holds here
   * too — doing nothing is the honest failure, doing something is the
   * dangerous one. It is set SYNCHRONOUSLY at entry (both bodies run to their
   * first await synchronously, so nothing can interleave before it is set)
   * and cleared in a `finally`, so a throw or a rejection cannot wedge the
   * two chords dead for the rest of the run.
   */
  const transitionRef = useRef(false)

  // Same ordering problem, same fix as reloadWorkspacesRef below: the nav grid
  // (M11) needs `switchWorkspace` for its commit, and that is declared several
  // hundred lines further down — so useNavGrid cannot exist here, while both
  // consumers of "is the grid open" DO: shouldYieldWheel's rule 0 immediately
  // below, and the shouldIgnoreKeys passed into useViewport. It holds the
  // PREDICATE rather than a mirrored boolean so both read the hook's own ref
  // with no one-render lag, and both stay referentially stable — each sits in
  // an effect dep array that must never be torn down and reinstalled.
  // Populated by an effect right after useNavGrid is declared; read only from
  // event handlers, long after mount.
  const navGridIsOpenRef = useRef<() => boolean>(() => false)

  // The one place that decides who owns a wheel gesture. Four rules, and the
  // ORDER is the load-bearing part: the nav grid outranks everything, the
  // palette outranks zoom, and zoom outranks the focused panel.
  const shouldYieldWheel = useCallback((event: WheelEvent): boolean => {
    const target = event.target as HTMLElement | null

    // 0. While the nav grid is open every canvas gesture stands down. It has
    // already swallowed the keyboard; it would be strange for a pinch to zoom
    // the world behind it. Unlike rule 1 this is NOT a containment test: the
    // grid covers the whole canvas and yields the gesture by standing the
    // camera down rather than by handing it to a scroll host, so there is
    // nothing under the cursor for a target test to find.
    if (navGridIsOpenRef.current()) return true

    // 1. The palette owns EVERY wheel over itself, zoom gestures included. It
    // is a screen-space overlay mounted INSIDE .canvas, so useViewport's
    // capture-phase listener sees the event before the overlay does; without
    // this rule its preventDefault() suppresses the native scrolling of
    // .palette__list (max-height: 46vh, overflow-y: auto) and pans the camera
    // instead — the list simply never gets to move. The containment test is
    // explicit for the same reason onMouseDownCapture's is: .palette's own
    // bubble-phase stopPropagation cannot stop a capture listener on an
    // ancestor that has already run. Outranking rule 2 is deliberate and is
    // rule 3 of "who owns the keyboard" applied to the pointer: while the
    // palette is open, every other canvas gesture stands down.
    if (target?.closest?.('.palette')) return true

    // 2. A zoom gesture is otherwise always the camera's, never a terminal
    // scroll, regardless of what is under the cursor. Both spellings are
    // claimed because canvas-input.ts treats both as a zoom intent: a trackpad
    // pinch arrives as a wheel with ctrlKey true, and Cmd+wheel is the mouse
    // equivalent. Claiming only ctrlKey would leave a mouse user who has
    // clicked into a panel unable to zoom the canvas while the cursor is over
    // it — and would make Cmd, the modifier every other canvas shortcut
    // requires, the one thing the canvas ignores here.
    if (event.ctrlKey || event.metaKey) return false

    // 3. A wheel belongs to a PANEL only when it is over the FOCUSED one AND
    // that panel owns internal scroll. Which panels do is answered by the
    // KIND, through what it renders: a live terminal's slot and a review
    // node's diff body both carry data-scroll-host, and a card carries
    // nothing. Deliberately NOT an `if (panel.kind === …)` here — this
    // predicate is the sole authority on wheel ownership, and every future
    // kind that scrolls would otherwise mean editing it again, in a function
    // whose whole recorded history is about how easily it can be narrowed
    // by accident.
    //
    // The old test was `.panel__slot`, which was this same question asked in
    // terminal-only vocabulary: a restored focusedId can name a panel lod.ts
    // still refuses to promote (dormancy beats focus), and a card has no
    // xterm to hand the event to — yielding there means the wheel reaches
    // nothing at all and the app reads as frozen.
    const id = focusedIdRef.current
    if (!id) return false
    const panel = target?.closest?.('.panel')
    if (panel?.getAttribute('data-panel-id') !== id) return false
    return panel.querySelector('[data-scroll-host]') !== null
  }, [])

  // The palette owns the keyboard while it is open; see usePalette's four
  // rules. restoreFocus is SessionHandle.focus() on the panel that was focused
  // when it opened — the registry lookup lives here because the palette layer
  // deliberately knows nothing about the registry.
  const restoreFocus = useCallback((id: string) => {
    registry.get(id)?.handle.focus()
  }, [])
  const palette = usePalette({ focusedIdRef, restoreFocus })
  // null is command mode. Set by beginRenamePreset and beginSavePrompt.
  const [inputMode, setInputMode] = useState<InputMode | null>(null)
  // The palette always OPENS in command mode. Both ends of a rename leave the
  // mode set otherwise: a completed one resolves after Palette has already
  // closed itself (it closes before calling submit, so nothing on screen is
  // left to clear it), and a cancelled one never reaches submit at all. Either
  // way the next Cmd+K would greet the user with a stale text field, no list,
  // and no explanation.
  useEffect(() => {
    if (!palette.open) setInputMode(null)
  }, [palette.open])

  // Cmd+J needs `centreOn` (returned BY this very useViewport call) and
  // `selectAndRaise` (defined further below, near goToPanel) as closures, but
  // must ALSO be passed INTO this call as its seventh argument — a genuine
  // circular dependency, not just an ordering inconvenience: the value this
  // callback needs does not exist until after the call it is an argument to
  // returns. jumpAttentionImplRef is the indirection every other "must be
  // stable but needs current data" case in this file already uses (see
  // panelsRef/focusedIdRef above) — the OUTER callback below has a fixed,
  // empty-deps identity for useViewport's dep array, while the actual jump
  // logic is assigned into the ref once centreOn and selectAndRaise exist and
  // is refreshed every render so it never runs against a stale closure.
  const jumpAttentionImplRef = useRef<(direction: JumpDirection) => void>(() => {})
  const onJumpAttention = useCallback((direction: JumpDirection) => {
    jumpAttentionImplRef.current(direction)
  }, [])

  // The same indirection, for the same reason, for M14's two workspace
  // chords: stepWorkspace needs `workspaceRows`, which is state declared
  // hundreds of lines below this call, and toggleMerged needs the merged
  // state — referencing either here would be a TDZ error rather than a stale
  // closure. The OUTER callbacks have a fixed, empty-deps identity so
  // useViewport's keydown effect is installed once (a fresh identity there
  // would tear the window listener down and reinstall it on every mousemove
  // over the canvas), while the implementations are assigned into the refs
  // once they exist and refreshed every render.
  const stepWorkspaceImplRef = useRef<(delta: 1 | -1) => void>(() => {})
  const onStepWorkspace = useCallback((delta: 1 | -1) => {
    stepWorkspaceImplRef.current(delta)
  }, [])
  const toggleMergedImplRef = useRef<() => void>(() => {})
  const onToggleMerged = useCallback(() => {
    toggleMergedImplRef.current()
  }, [])
  // Every canvas keyboard shortcut stands down while EITHER overlay owns the
  // keyboard, and so do the four menu accelerators below (see the edit:*
  // subscriptions). ONE predicate rather than three copies of "who owns the
  // keyboard", which is what this file already does for the wheel.
  //
  // Composed here rather than passing palette.isOpen straight through,
  // because the nav grid's own capture listener cannot be relied on to stop
  // useViewport's. Both are bound on `window`, and a SAME-TARGET dispatch —
  // which is exactly what verify:panels' window.dispatchEvent produces, and
  // never what a real keypress produces — invokes every listener on that
  // target regardless of phase, so the shared predicate is the only thing
  // that covers it. (For a real keypress the grid's capture-phase
  // stopPropagation at `window` DOES suppress bubble-phase listeners on
  // `window`, so it is belt-and-braces there — but it is not useless and
  // must not be removed: it is what stops a bare arrow reaching xterm's own
  // target-phase handler further down the tree.)
  //
  // Stable identity, reading a stable callback and a ref, because it sits in
  // useViewport's keydown effect dep array — a fresh arrow per render would
  // tear that listener down and reinstall it on every mousemove over the
  // canvas (Canvas re-renders on setCursor).
  const shouldIgnoreKeys = useCallback(
    () => palette.isOpen() || navGridIsOpenRef.current(),
    [palette.isOpen]
  )

  const {
    viewport, resetViewport, worldCentre, centreOn, restoreCamera, zoomBy, fitAll,
    beginPanDrag, panning
  } = useViewport(
    hostRef, rects, onSpawn, shouldYieldWheel, initial.camera, shouldIgnoreKeys, onJumpAttention,
    onStepWorkspace, onToggleMerged
  )
  // Backlog #68: space-drag and middle-drag pan for the mouse-only user. See
  // useSpaceHeld.ts for why this is gated on real DOM focus rather than the
  // app's own focusedId/palette/draft state.
  const spaceHeld = useSpaceHeld()
  const version = useRegistryVersion(registry)
  const machineCostTotal = useMachineCostTotal()

  // Main reads ONE process table for this whole list, then walks each root's
  // descendants there. The renderer owns this low-frequency schedule because
  // closing or switching a canvas should stop the work immediately; neither
  // the registry nor a module-level main timer can know that fact.
  const machineCostTargets = useMemo<MachineCostTarget[]>(() => panels.flatMap((panel) => {
    if (!isTerminalPanel(panel)) return []
    const status = registry.get(panel.rect.id)?.status
    return status?.kind === 'running' ? [{ panelId: panel.rect.id, pid: status.pid }] : []
  }), [panels, version])

  useEffect(() => {
    let current = true
    let inFlight = false
    const sample = (): void => {
      if (inFlight) return
      if (machineCostTargets.length === 0) {
        applyMachineCosts({ panels: [], total: { cpuPercent: 0, memoryBytes: 0 } })
        return
      }
      inFlight = true
      void window.canvas.machine.sample(machineCostTargets).then((snapshot) => {
        if (current) applyMachineCosts(snapshot)
      }).catch((error: unknown) => {
        // A ps failure is normally a transient process-table race. Keep the
        // prior reading until the next tick rather than turning it into zero.
        console.warn('[machine-cost] could not sample process trees', error)
      }).finally(() => {
        inFlight = false
      })
    }
    sample()
    const timer = window.setInterval(sample, MACHINE_COST_SAMPLE_MS)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [machineCostTargets])

  // What the banner calls the source panel. railLabel is the honest chain's
  // one reader — the panel header, the rail row, the attention section and
  // the inspector's link rows all go through it — so the banner reads it too
  // rather than becoming a fifth re-derivation that says `/bin/zsh` where
  // every other surface says `auth refactor`. Falls back to the bare id only
  // if the panel is gone, which a disarm makes very short-lived.
  const linkSourceName = useMemo(() => {
    if (linkMode.from === null) return ''
    const panel = panels.find((p) => p.rect.id === linkMode.from)
    return panel ? railLabel(panel, registry.get(panel.rect.id)?.status) : linkMode.from
  }, [linkMode.from, panels, version])

  // Sessions exist for every panel; only their tier changes. In a memo rather
  // than an effect: ensure() runs synchronously during render (so a session
  // exists by the time this same render tries to look one up below) and
  // deliberately never calls bump() — notifying a useSyncExternalStore
  // subscriber mid-render is what React's "update while rendering another
  // component" warning is about. The panel list living in React state is
  // already what triggers this render, so nothing is lost by not bumping.
  useMemo(() => {
    for (const panel of terminalPanels) {
      registry.ensure(panel.rect.id, panel.spec, { dormant: dormantIds.has(panel.rect.id) })
    }
  }, [terminalPanels, dormantIds])

  // Only sessions that are already running can be broadcast targets. This is
  // a filter over the existing registry, never a call to ensure/wake, so an
  // inactive selection remains inactive when the mode is armed.
  const broadcastTargetIds = useMemo(() => (
    merged
      ? []
      : terminalPanels
        .filter((panel) => {
          const session = registry.get(panel.rect.id)
          return selectedIds.has(panel.rect.id) && session?.status.kind === 'running'
        })
        .map((panel) => panel.rect.id)
  ), [merged, selectedIds, terminalPanels, version])
  const broadcastReady = broadcastTargetIds.length >= 2

  useEffect(() => {
    if (!broadcastInput || !broadcastReady) {
      registry.setInputTargets([])
      if (broadcastInput && !broadcastReady) setBroadcastInput(false)
      return
    }
    registry.setInputTargets(broadcastTargetIds)
    return () => registry.setInputTargets([])
  }, [broadcastInput, broadcastReady, broadcastTargetIds])

  // Menu-driven clipboard. The old per-panel TerminalPanel used to own this
  // subscription directly against xterm; now that TerminalPanel is a dumb
  // view, ONE subscription here routes to whichever session is focused,
  // rather than each panel subscribing and every panel but one discarding
  // the event. focusedIdRef (declared above, alongside shouldYieldWheel)
  // mirrors state into a ref (the same pattern as useViewport's viewportRef)
  // so the listener reads the current focus without resubscribing. (Cmd+C/
  // Cmd+V arrive as main-side menu accelerators via edit:copy/edit:paste,
  // not as a canvas keydown, so they are unrelated to useViewport's "every
  // shortcut requires Cmd" rule for bare keys reaching the PTY.)
  useEffect(() => {
    const offCopy = window.canvas.edit.onCopy(() => {
      // With the palette open the user is looking at a text field, not a
      // terminal, and focusedId still names that terminal (rule 2 keeps it).
      // Copying its selection here would put text the user cannot see on the
      // clipboard; Palette.tsx serves its own input instead. shouldIgnoreKeys
      // rather than palette.isOpen because the nav grid is the SAME
      // situation and a worse one: revealing it means the user is already
      // holding Cmd, which makes a stray Cmd+C the most plausible chord in
      // the app, aimed at a selection an opaque overlay is covering.
      if (shouldIgnoreKeys()) return
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      const selection = session?.handle.getSelection()
      if (selection) void navigator.clipboard.writeText(selection)
    })
    const offPaste = window.canvas.edit.onPaste((text) => {
      // Rule 3. Without this the text lands in a running agent, invisibly,
      // while the user watches an empty text field (palette, verify:panels
      // 35) or an opaque grid overlay (nav grid) — and in the grid's case the
      // switch that follows on release takes the evidence off screen.
      if (shouldIgnoreKeys()) return
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      if (text) session?.handle.paste(text)
    })
    return () => {
      offCopy()
      offPaste()
    }
    // shouldIgnoreKeys is referentially stable, so this stays a once-only
    // install; listing it makes the dependency visible rather than implied.
  }, [shouldIgnoreKeys])

  // ONE subscription for the whole canvas, not one per panel: the payload
  // names its own panel, and the store fans it out to exactly the panel that
  // subscribed to that id. A per-panel subscription would mean every panel
  // receiving and discarding every other panel's updates — the same argument
  // the single Cmd+C/Cmd+V subscription above makes.
  useEffect(() => window.canvas.agent.onState((update) => {
    applyAgentState(update.panelId, update.state)
  }), [])

  // One subscription for the whole canvas, like agent.onState above and for the
  // same reason: the store fans out per panel id, so a per-panel subscription
  // here would deliver every panel's update to every panel.
  useEffect(() => window.canvas.session.onLive((update) => {
    applyLiveSession(update.panelId, update.cwd, update.currentCommand)
  }), [])

  // One subscription for the whole canvas, like session.onLive above and for
  // the same reason: the store fans out per panel id, so a per-panel
  // subscription here would deliver every panel's update to every panel.
  useEffect(() => window.canvas.session.onSubagents((update) => {
    applySubagents(update.panelId, update)
  }), [])

  // The fourth canvas-wide subscription, for the same reason as the ones
  // above: main's file:changed names its own panel and the store fans it out
  // to exactly the panel that subscribed to that id, so a per-panel
  // subscription would deliver every file's change to every file panel. It
  // carries the whole RESULT rather than a "something changed" ping, so a
  // panel that is mounted but scrolled away is updated without a second
  // round trip.
  useEffect(() => window.canvas.file.onChanged((event) => {
    applyFileResult(event.panelId, event.result)
  }), [])

  // The fifth canvas-wide subscription, for the same reason as the ones
  // above: the store fans out per panel id, so a per-panel subscription here
  // would deliver every panel's usage update to every panel.
  useEffect(() => window.canvas.session.onUsage(({ panelId, usage }) => {
    applyUsage(panelId, usage)
  }), [])

  // The three preset events main pushes (see main/index.ts's menu handlers).
  // Routed through onSpawn/commitHistory rather than a second spawn path so a
  // preset spawn inherits the SAME undo behaviour as Cmd+N: undo removing a
  // panel must dispose its session, and that guarantee lives in applyHistory,
  // reachable only by going through the ordinary history stack.
  useEffect(() => {
    const offSpawn = window.canvas.preset.onSpawn((template) => {
      onSpawn(worldCentre(), template)
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
      offSpawn()
      offDefault()
      offCapture()
    }
  }, [onSpawn, worldCentre])

  // Menu-driven undo/redo, delivered the same way as copy/paste — through
  // main's menu accelerators, never the stock 'undo'/'redo' roles, which
  // drive document.execCommand against whatever DOM element happens to be
  // focused (xterm's hidden textarea, most of the time) rather than this
  // history stack.
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
      setHistory((h) => { const next = undoHistory(h); applyHistory(h.present, next); return next })
    })
    const offRedo = window.canvas.edit.onRedo(() => {
      if (shouldIgnoreKeys()) return
      setHistory((h) => { const next = redoHistory(h); applyHistory(h.present, next); return next })
    })
    return () => {
      offUndo()
      offRedo()
    }
  }, [applyHistory, shouldIgnoreKeys])

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
        continue
      }
      registry.dispose(panel.rect.id)
      // Same reason as the undo/redo site above: reset drops every panel at
      // once, and each dropped id needs its cached agent state cleared too.
      clearAgentState(panel.rect.id)
      clearLiveSession(panel.rect.id)
      clearSubagents(panel.rect.id)
      clearUsage(panel.rect.id)
      clearMachineCost(panel.rect.id)
    }
    const fresh = firstRunPanels()
    setPanels(fresh)
    setGroups([])
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
      offReset()
    }
  }, [resetCanvas])

  // Same mirror-into-a-ref pattern, for the listeners below that need the
  // current scale but must not resubscribe: `viewport` changes on every wheel
  // event, and a document-level listener reinstalled at 60Hz mid-gesture would
  // drop the drag state it is holding.
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  // M35. The drag half of link creation. linkMode (declared above, the armed
  // click-then-click path the palette and inspector use) is UNCHANGED and
  // stays: it is the keyboard-reachable route, verify:palette 76/77 pin it,
  // and ports are an additional entry point rather than a replacement.
  //
  // Declared HERE — after viewportRef, not beside linkMode further up —
  // because it reads viewportRef synchronously in the object literal below;
  // a `const` read before its own declaration is a TDZ error, the identical
  // constraint linkMode's own comment states for its position relative to
  // useViewport. hitOrderRef is declared earlier for the same reason and
  // was already in scope.
  const linkDraw = useLinkDraw({
    hostRef,
    viewportRef,
    rectsRef: hitOrderRef,
    onCommit: (from, to) => {
      // The VERB refuses, not only the affordance. This repo's standing rule,
      // stated for the move verb: it "refuses on `mergedRef` too rather than
      // only its palette rows going disabled — a disabled row is an
      // affordance, and the verb has to be the authority."
      //
      // Here the affordance is `readOnly`, which suppresses the ports — and
      // `readOnly` is OPTIONAL WITH A DEFAULT on all four non-terminal kinds,
      // so a missed or dropped `readOnly={merged}` at any of the five call
      // sites compiles clean and renders ports in the merged view with
      // nothing red anywhere.
      //
      // Corrected in the M35 final review: an earlier draft of this comment
      // claimed that drag would addLink a FOREIGN panel id into the active
      // workspace's record, persisted and then silently pruned by
      // buildLinkSegments. That path is not reachable — addLink (panels.ts,
      // frozen) refuses unless BOTH ids are already in the array it is
      // handed, and that array is always `current` from this component's own
      // `panels` state (the active workspace's own array), never
      // `displayPanels` (the merged, lane-translated one the ports would
      // actually render against). A foreign endpoint on either side returns
      // the SAME array: nothing written, no history entry, nothing persisted.
      //
      // What a dropped readOnly DOES reach is a drag between two panels both
      // already in the active workspace, while the merged view happens to be
      // showing them in a foreign lane — a real write of an ordinary, valid
      // link, which is a "the merged view is read-only" violation rather than
      // a corrupted record.
      //
      // linkDraw.end() at toggleMerged stands down an in-flight draw; this
      // stands down a commit that reaches here by any other route.
      //
      // NO CHECK EXERCISES THIS. It is structural defence: ports do not render
      // while merged, so the gesture cannot be driven through the UI there,
      // and a check that reached past the UI to call onCommit directly would
      // be asserting against a fixture rather than against the feature. See
      // the M35 task-8 report for the declined check 180.
      if (mergedRef.current) return
      setPanels((current) => {
        const next = addLink(current, from, to)
        // addLink returns the SAME array when it refuses (a self-link, a
        // duplicate), and committing unconditionally would push a history
        // entry for a gesture that changed nothing — one wasted Cmd+Z. The
        // rule is one entry per COMMITTED gesture, never one per attempt.
        if (next !== current) commitHistory(next)
        return next
      })
    }
  })
  // Ruling P3: a STABLE identity, never an inline arrow at the TerminalPanel
  // call site. Canvas re-renders on every mousemove over .canvas (setCursor),
  // so a fresh arrow per render would be a changed prop on every memoized
  // panel on every frame — the exact hazard resetViewport's own comment
  // records for the palette's dependency arrays. `linkDraw.begin` is itself
  // stable (a useCallback with an empty dep array inside useLinkDraw), so
  // depending on it alone keeps this callback's identity fixed too.
  const onBeginLink = useCallback(
    (id: string, event: MouseEvent) => linkDraw.begin(id, event),
    [linkDraw.begin]
  )

  // Switching workspaces, the merged view, and moving panels between
  // workspaces, lifted into useWorkspaceVerbs.ts. Called from exactly the
  // position those verbs used to occupy — both refs it returns are assigned
  // further down this component, and the await-before-commit orderings inside
  // it are load-bearing (see the hook's own doc comment).
  const {
    switchWorkspace, resolveDormant, toggleMerged, movePanelsToWorkspace,
    deleteWorkspaceRef, reloadWorkspacesRef
  } = useWorkspaceVerbs({
    registry, transitionRef, mergedRef, preMergeRef, panelsRef, groupsRef,
    viewportRef, nextIdRef, toggleMergedImplRef, restoreCamera, selectedId,
    focusedId, selectOnly, linkDraw, setPanels, setGroups,
    setDormantIds, setFocusedId, setSelectedIds, setHistory, setMerged,
    setMergedData
  })

  // The `window.__m4a*` surface verify:panels drives the renderer through,
  // lifted into useCanvasTestHooks.ts. Called from exactly the position the
  // effect used to occupy: deleteWorkspaceRef is created above and assigned
  // below, and moving this call would break that order silently.
  useCanvasTestHooks({
    registry,
    viewportRef,
    focusedIdRef,
    panelsRef,
    defaultTemplateRef,
    deleteWorkspaceRef,
    setHistory,
    applyHistory,
    resetCanvas,
    switchWorkspace,
    movePanelsToWorkspace
  })

  // One gesture at a time, driven by document listeners installed once. Moves
  // rewrite the rect on every frame; only a resize commits anything to the PTY,
  // and only on release.
  const beginDrag = usePanelDrag({
    hostRef,
    viewportRef,
    onDrag: useCallback(
      (id: string, rect: WorldRect) => setPanels((current) => setPanelRect(current, id, rect)),
      []
    ),
    onCommit: useCallback((states: readonly DragState[]) => {
      // One history entry per gesture. onDrag (above) called setPanels ~60
      // times during the drag; pushing there would make a single drag take
      // sixty Cmd+Z presses to undo. This runs exactly once, on mouseup,
      // reading the settled array back out of setPanels's updater rather than
      // closing over a stale `panels` from render.
      setPanels((current) => {
        commitHistory(current)
        return current
      })
      // A move changes no terminal dimension, so it has nothing to commit.
      const resized = states.filter((state) => state.mode.kind === 'resize')
      if (resized.length === 0) return
      // One commit per gesture, never one per frame: a full-screen agent TUI
      // repaints its whole frame on every SIGWINCH, and resizing live would
      // mean sixty of those a second at sizes the user never meant to keep.
      // refit sends at most one pty:resize, and none if the grid is unchanged.
      for (const state of resized) registry.refit(state.panelId)
    }, [commitHistory])
  })

  const beginGroupDrag = useGroupDrag({
    hostRef,
    viewportRef,
    onDrag: useCallback((state, world) => {
      setPanels((current) => applyGroupDrag(current, state, world))
    }, []),
    onCommit: useCallback(() => {
      setPanels((current) => {
        commitHistory(current)
        return current
      })
    }, [commitHistory])
  })

  const onBeginGroupDrag = useCallback((group: CanvasGroup, event: MouseEvent<HTMLElement>) => {
    if (mergedRef.current) return
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const origin = screenToWorld(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewportRef.current
    )
    // Raising is part of the one group gesture and only rewrites Panel.z;
    // member array order remains untouched, so live terminal hosts stay put.
    setPanels((current) => raiseGroup(current, group))
    beginGroupDrag(groupDragState(group, panelsRef.current, origin))
  }, [beginGroupDrag])

  const toggleGroupCollapsed = useCallback((id: string) => {
    setGroups((current) => current.map((group) => {
      if (group.id !== id) return group
      if (!group.collapsed) return { ...group, collapsed: true }
      const next = { ...group }
      delete next.collapsed
      return next
    }))
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
      const group = state.mode.kind === 'move' && selectedIdsRef.current.has(state.panelId)
        ? panelsRef.current.filter((panel) => selectedIdsRef.current.has(panel.rect.id)).map((panel) => ({
            ...state,
            panelId: panel.rect.id,
            originRect: panel.rect
          }))
        : [state]
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
    clearLiveSession(id)
    clearSubagents(id)
    clearUsage(id)
    clearMachineCost(id)
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
      commitHistory(next)
      return next
    })
  }, [addToSelection, commitHistory, selectOnly])

  // Which panel the jump key last visited. A ref, not state: it is a cursor
  // for a keydown handler and nothing renders from it, so putting it in state
  // would re-render the canvas on every press for no visible reason.
  const jumpCursorRef = useRef<string | null>(null)

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
    const queue = reachableQueue(attentionIds(), known)
    const id = nextAttentionId(queue, jumpCursorRef.current, direction)
    // Nothing is waiting: the key does nothing at all. Moving the camera
    // "somewhere" would be worse than silence — the user asked to be taken to
    // a panel that wants them, and there isn't one.
    if (id === null) return
    const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
    // Belt-and-braces: a panel can still vanish between the filter above and
    // this lookup in principle. It must never be the ONLY thing standing
    // between the user and a working key, which is why the filter exists.
    if (!panel) return
    jumpCursorRef.current = id
    centreOn(panel.rect)
    selectAndRaise(id)
  }

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
    registry.focus(id)
    // Looking at a panel is reading it. Sent unconditionally rather than only
    // when this panel is in wants-you: main is the only author of that state,
    // and a renderer that decided when to bother telling it would be deciding
    // the state itself — the exact second-author problem the acknowledge
    // channel exists to avoid. The handler is a map lookup and a no-op for
    // any panel that does not want you.
    void window.canvas.agent.acknowledge(id)
  }, [onSelectPanel])

  // Demotions held back for DEMOTE_DELAY_MS, keyed by panel id, valued by the
  // epoch ms at which the hold started. Refs, not state: the hold is bookkeeping
  // for a timer, and putting it in state would make every hold trigger the very
  // re-render that used to restart the timer.
  const heldSinceRef = useRef(new Map<string, number>())
  const demoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The most recent unheld assignment, read by the timer when it fires. A held
  // demotion is released against the LATEST tiering, not the one that was
  // current when the hold started — so a panel that came back into view during
  // the delay stays live instead of being demoted by a stale decision.
  const tiersRef = useRef<Record<string, Tier>>({})
  // Backlog #75: live count, held count and the budget, lifted out of this
  // effect's closure so the diagnostics overlay can read them. A plain ref,
  // updated once at the end of the effect below — no new render, no new
  // dependency, and nothing that could bump registry.version().
  const tieringDiagnosticsRef = useRef({ liveCount: 0, heldCount: 0, budget: LIVE_BUDGET })

  // The timer belongs to the component, not to this effect's dependency list:
  // arming it inside an effect whose cleanup clears it meant any change to
  // [rects, viewport, focusedId, version] restarted the 250ms clock. `viewport`
  // changes on every wheel event, so a continuous trackpad pan plus its
  // momentum restarted it indefinitely and nothing ever demoted.
  useEffect(() => () => {
    if (demoteTimerRef.current !== null) clearTimeout(demoteTimerRef.current)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const tiers = assignTiers({
      // terminalRects, not rects: a review node has no tier at all, and this
      // is the one line that makes that structural. See terminalPanels above.
      rects: terminalRects,
      viewport,
      size: { width: bounds.width, height: bounds.height },
      focusedId,
      lastFocusedAt: registry.lastFocusedAt(),
      dormantIds,
      cardIds: collapsedPanelIds
    })
    tiersRef.current = tiers

    // Promotion is immediate so a panel is live by the time you look at it.
    // Demotion waits, so panning along an edge does not destroy and recreate a
    // WebGL context every frame. Held-back demotions keep their current tier.
    const held = heldSinceRef.current
    const now = Date.now()
    const applied: Record<string, Tier> = {}
    const holding: string[] = []
    let liveCount = 0
    for (const [id, tier] of Object.entries(tiers)) {
      const current = registry.get(id)?.tier ?? 'card'
      if (tier === 'card' && current === 'live') {
        if (!held.has(id)) held.set(id, now)
        holding.push(id)
        applied[id] = 'live'
      } else {
        held.delete(id)
        applied[id] = tier
        if (tier === 'live') liveCount += 1
      }
    }
    // Drop stale holds for panels that no longer exist, so the map cannot grow
    // without bound across a run.
    for (const id of [...held.keys()]) if (tiers[id] === undefined) held.delete(id)

    // INVARIANT: the tier map applied here never contains more than LIVE_BUDGET
    // live panels — hold-backs included. assignTiers already caps its own
    // promotions, but a hold-back is a live panel it did not count, so without
    // this every panel visited during a pan would stay live for the whole
    // gesture and blow through the WebGL context budget. Oldest holds go first:
    // they are the ones that have already had most of the anti-flicker grace
    // period the hold exists to provide.
    holding.sort((a, b) => (held.get(a) ?? 0) - (held.get(b) ?? 0))
    const allowedHolds = Math.max(0, LIVE_BUDGET - liveCount)
    for (const id of holding.slice(0, Math.max(0, holding.length - allowedHolds))) {
      applied[id] = 'card'
      held.delete(id)
    }

    registry.applyTiers(applied)
    tieringDiagnosticsRef.current = { liveCount, heldCount: held.size, budget: LIVE_BUDGET }

    // Arm the release timer only when one is not already running. Re-arming on
    // every render is what made the delay unreachable during a gesture.
    if (held.size === 0 || demoteTimerRef.current !== null) return
    demoteTimerRef.current = setTimeout(() => {
      demoteTimerRef.current = null
      // Release every hold at once against the latest tiering. A hold armed
      // late in the window gets slightly less than the full delay, which is
      // fine: the point is to bound the destroy/recreate RATE of WebGL
      // contexts, not to give each panel an exact grace period.
      heldSinceRef.current.clear()
      registry.applyTiers(tiersRef.current)
    }, DEMOTE_DELAY_MS)
  }, [terminalRects, viewport, focusedId, version, dormantIds, collapsedPanelIds])

  // Persist on every change. Unthrottled on purpose, including the ~60/sec a
  // drag produces: main coalesces to one write per 500ms and keeps only the
  // newest, so one process owns the timing — and it is the one that has to
  // survive the other's death.
  //
  // This resembles the flood pty-manager.ts's 16ms batching exists to prevent,
  // and the difference is worth stating. That was THOUSANDS of messages a
  // second arriving continuously at the renderer's event loop; this is sixty
  // small JSON payloads a second reaching an otherwise-idle main process, and
  // only while a gesture is in progress.
  //
  // While merged, three of the four fields come from the PRE-MERGE snapshot
  // rather than from live state, and that is the whole of this effect's
  // special-casing — `panels` is untouched and stays the only array written,
  // which is the split displayPanels' own comment describes.
  //
  // Two ways to stop the merged view writing a lane-space camera were
  // available and only one of them is safe. Capture-on-enter plus
  // restore-on-leave ALONE lets the next save correct the record, which is
  // fine for a user who leaves the view — and wrong for the one who quits
  // inside it, because before-quit flushes whatever the last save left and
  // there is no "next save" to correct anything. So the snapshot is read
  // HERE too: every save issued while merged writes exactly what the save
  // issued one instant before the toggle would have written. `panels` is
  // still live, so a Cmd+N while merged is persisted normally.
  useEffect(() => {
    // Read at call time rather than through a dep, because a ref cannot
    // trigger this effect and does not need to: it is written once, in the
    // same synchronous block that sets `merged`, so the render that flips the
    // flag already sees it.
    const before = preMergeRef.current
    void window.canvas.layout.save({
      panels: fromPanels(panels),
      groups,
      camera: merged && before ? before.camera : viewport,
      selectedId: merged && before ? before.selectedId : selectedId,
      focusedId: merged && before ? before.focusedId : focusedId
    })
  }, [panels, groups, viewport, selectedId, focusedId, merged])

  // Every mouse gesture the canvas host owns, lifted into useCanvasPointer.ts.
  // Four of the returned handlers are plain functions rather than useCallbacks
  // — see the hook's doc comment for why memoizing them would be a behaviour
  // change rather than a cleanup.
  const {
    onCanvasMouseDownCapture, onMouseDown, onMouseDownCapture, onMouseMove
  } = useCanvasPointer({
    hostRef, viewport, viewportRef, panelsRef, marqueeFromRef, marqueeEndRef,
    navGridIsOpenRef, hitOrder, palette, linkMode, merged, spaceHeld,
    beginPanDrag, commitHistory, selectAndRaise, selectOnly, onSelectPanel,
    setPanels, setSelectedIds, setFocusedId, setMarquee, setCursor
  })

  // Loaded on mount AND whenever the palette opens — but never on a
  // subscription: availability is probed once at startup anyway (a brew
  // install mid-session is a known limit of M5a, not something a subscription
  // here would fix), and reloading after every mutation is enough because main
  // is the only side that knows what the store now says. The mount-time load
  // is the effect twelve lines below, added by M8a: until then this list was
  // palette-only, and the comment here still said so — see that effect for why
  // the top bar cannot wait for a first Cmd+K.
  const [presetRows, setPresetRows] = useState<PresetRow[]>(EMPTY_PRESETS)
  const reloadPresets = useCallback(() => {
    void window.canvas.preset.list().then(setPresetRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadPresets()
  }, [palette.open, reloadPresets])
  // The top bar names the default preset, so the list must exist before the
  // palette has ever been opened — the bar renders on the first paint and the
  // user may never press Cmd+K at all. The palette-open reload above STAYS:
  // this one runs once, and it is the reopen that keeps the rows fresh after
  // a rename, a delete or a change of default.
  useEffect(() => { reloadPresets() }, [reloadPresets])

  // The prompt list, reloaded whenever the palette opens — and whenever the
  // panel it captured changes, because a project's prompts are its own
  // directory's and two panels are rarely in the same one.
  const [promptRows, setPromptRows] = useState<PromptRow[]>(EMPTY_PROMPTS)
  // Bodies are deliberately NOT in the row type the palette renders:
  // buildCommands has no use for a paragraph, and putting one in a list row's
  // props means re-rendering the whole list whenever a prompt file changes.
  const promptBodiesRef = useRef(new Map<string, string>())
  const reloadPrompts = useCallback((capturedId: string | null) => {
    const panel = capturedId ? panelsRef.current.find((p) => p.rect.id === capturedId) : undefined
    // Where the panel IS, falling back to where it was spawned.
    //
    // The fallback is the asymmetry this milestone states once and obeys twice:
    // DISPLAY renders nothing without a live answer, because a spawn-time value
    // under a present-tense label is indistinguishable from a correct one — but
    // a CONSUMER needs a directory, and the spawn cwd is exactly what it used
    // before this milestone, so falling back here is never worse than not
    // shipping. A review node has no cwd of its own and still lists the saved
    // prompts alone, and so does a file panel — the path it names is a FILE,
    // and handing a file to prompt.list as though it were a directory would
    // read the wrong project's commands or none at all.
    const cwd = panel !== undefined && isTerminalPanel(panel)
      ? (getLiveSession(panel.rect.id)?.cwd ?? panel.spec.cwd)
      : null
    void window.canvas.prompt.list(cwd).then((rows) => {
      promptBodiesRef.current = new Map(rows.map((r) => [r.id, r.body]))
      setPromptRows(rows.map(({ id, name, source }) => ({ id, name, source })))
    })
  }, [])
  useEffect(() => {
    if (palette.open) reloadPrompts(palette.capturedId)
  }, [palette.open, palette.capturedId, reloadPrompts])

  // The settings list, reloaded whenever the palette opens — main owns the
  // store, so the row list always reflects what it actually holds rather than
  // whatever the palette last rendered.
  const [settingRows, setSettingRows] = useState<SettingRow[]>(EMPTY_SETTINGS)
  const reloadSettings = useCallback(() => {
    void window.canvas.settings.list().then(setSettingRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadSettings()
  }, [palette.open, reloadSettings])

  // Credential metadata, reloaded on palette open ONLY — the same shape as
  // reloadSettings immediately above, and deliberately not also on mount the
  // way reloadPresets is: nothing outside the palette reads this list, so
  // there is no top-bar-shaped reason to have it ready before a first Cmd+K.
  // That absence is also what keeps credential:list off the boot path —
  // scripts/verify-canvas.cjs's registerIpcHandlers wiring has no credential
  // store to answer it, and firing this at mount would surface as an
  // unrelated-looking canvas failure that points nowhere near this feature.
  const [credentialRows, setCredentialRows] = useState<CredentialMeta[]>(EMPTY_CREDENTIALS)
  const reloadCredentials = useCallback(() => {
    void window.canvas.credential.list().then(setCredentialRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadCredentials()
  }, [palette.open, reloadCredentials])
  // M37. The worktree list, for the same reason and on the same trigger as
  // credentials: main owns the records, the palette is the only reader, and
  // reading at mount would surface a failure nowhere near this feature.
  const [worktreeRows, setWorktreeRows] = useState<WorktreeListRow[]>(EMPTY_WORKTREES)
  const reloadWorktrees = useCallback(() => {
    void window.canvas.worktree.list().then(setWorktreeRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadWorktrees()
  }, [palette.open, reloadWorktrees])

  // The workspace list, reloaded after every mutation the palette's own
  // create/rename/delete commands drive below — the same "main is the only
  // side that knows what the store now says" rule reloadPresets/
  // reloadPrompts/reloadSettings already follow. It also reloads on mount
  // and on every palette open, the same two occasions the sibling lists
  // reload on below, and every row that needs `attentionIds` reads it from
  // this same state and loader rather than a second one.
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceRow[]>(EMPTY_WORKSPACES)
  /**
   * Which workspaces EXIST, as a value that only changes when one of them
   * does — the merged refetch's dep, and see that effect for what a stale
   * lane costs.
   *
   * Derived rather than read off the array because reloadWorkspaces() hands
   * back a fresh array of fresh objects every time it runs, including on
   * every panels.length change, so the array identity is not evidence that
   * anything moved. JSON.stringify rather than a join for the reason
   * railSignature gives: a workspace NAME is user text, and a separator a
   * name is free to contain lets two different lists collapse to one string
   * — here that means a rename that goes unnoticed and a lane left showing
   * the old name, for the users whose names contain the delimiter and nobody
   * else.
   *
   * panelIds is deliberately NOT in it: it changes on every spawn and close,
   * which panels.length already covers one dep along.
   *
   * NOT rail-sections' own `workspaceSignature`, which this file already
   * imports and uses for the rail's frozen rows: that one folds in each
   * workspace's WAITING COUNT, so it moves on every bell — and a bell must
   * not fire an IPC round trip and a re-tier of every lane. Two signatures
   * over the same rows, answering two different questions.
   */
  const workspaceListSignature = useMemo(
    () => JSON.stringify(workspaceRows.map((w) => [w.id, w.name, w.active])),
    [workspaceRows]
  )
  const reloadWorkspaces = useCallback(() => {
    // Rejection handled rather than voided. void-ing the chain silences the
    // lint, not the failure, and M8d raised what a swallowed one costs: before
    // the rail, a failed reload meant missing rows in a surface that reloads on
    // every open, so the next Cmd+K repaired it. Now it leaves an always-mounted
    // Workspaces section stuck on whatever it last had — at mount, on nothing at
    // all — with no console line naming the reason.
    void window.canvas.workspace.list().then(setWorkspaceRows, (error: unknown) => {
      console.warn('[workspace] could not list workspaces', error)
    })
  }, [])
  // Mount (so the first Cmd+K sees real rows even if no mutation has run
  // yet) and every palette open (so a workspace mutated while the palette
  // was closed still shows up) — the two occasions reloadPresets/
  // reloadSettings already cover for their own lists. Deliberately NOT a
  // dependency of any agent-state effect: the ROWS change rarely, while the
  // waiting COUNT is derived live below from attentionIds, so a bell must
  // not reload this list on every agent:state message.
  useEffect(() => { reloadWorkspaces() }, [reloadWorkspaces])
  // Keeps reloadWorkspacesRef current for switchWorkspace, declared earlier
  // in this component — see that ref's own comment for why.
  useEffect(() => { reloadWorkspacesRef.current = reloadWorkspaces }, [reloadWorkspaces])

  /**
   * Cmd+Shift+] and Cmd+Shift+[: the next or previous workspace, WRAPPING.
   *
   * It walks `workspaceRows` — the rail's own list, in main's own order — so
   * the chord and the rail's Workspaces section cannot disagree about what
   * "next" means, and it wraps rather than stopping at the ends: an
   * unwrapped `rows[at + delta]` is `undefined` at both edges, which reads as
   * a chord that stopped working rather than as a boundary.
   *
   * A single workspace is a deliberate no-op. `switchWorkspace` on the
   * ALREADY-active id is a real activate round trip that rewrites the record
   * it just read, and there is nowhere to go, so the honest answer is
   * nothing at all. Everything else — including leaving the merged view
   * first — is switchWorkspace's, so this cannot become a second switching
   * path.
   */
  const stepWorkspace = useCallback((delta: 1 | -1) => {
    if (workspaceRows.length < 2) return
    const at = workspaceRows.findIndex((w) => w.active)
    // No active row means the list has not loaded yet (mount, or a failed
    // reload that logged its own warning) — stepping from an unknown index
    // would land on an arbitrary workspace, which is worse than nothing.
    if (at < 0) return
    const next = workspaceRows[(at + delta + workspaceRows.length) % workspaceRows.length]
    switchWorkspace(next.id)
  }, [workspaceRows, switchWorkspace])
  // Handed to useViewport through the ref declared beside its call, for the
  // ordering reason that ref's own comment gives.
  stepWorkspaceImplRef.current = stepWorkspace
  useEffect(() => {
    if (palette.open) reloadWorkspaces()
  }, [palette.open, reloadWorkspaces])
  // The third occasion, and the one the rail added. A workspace row renders
  // `N panels`, and NOTHING above reloads on a spawn or a close: mount, palette
  // open, and the create/rename/delete/switch call sites are the whole set. So
  // a mouse-only user who clicks the top bar's New panel three times reads
  // "1 panel" two lines above a Panels list showing four rows, and it stays
  // wrong until they happen to open the palette — which they may never do, and
  // mouse-only reachability is exactly what this section exists for.
  //
  // Keyed on panels.LENGTH, never on `panels`: the array identity is fresh on
  // every setPanelRect, i.e. every frame of a drag, so keying on the array
  // would fire an IPC round trip at 60Hz for rect changes no workspace row
  // displays — the same churn railSignature and every memo in this file exist
  // to keep off the shell.
  //
  // It sees main's post-save state because of DECLARATION ORDER: the
  // layout.save effect is declared earlier in this component, React runs a
  // commit's effects in declaration order, and both IPC handlers are
  // synchronous and processed in arrival order. doSave mutates w.panels in
  // place — only its scheduleWrite is debounced — and workspaces() reads that
  // same in-memory snapshot, so the reply is fresh within one round trip.
  // Moving this effect above the save one would leave every count one panel
  // stale, with nothing to point at.
  useEffect(() => { reloadWorkspaces() }, [panels.length, reloadWorkspaces])

  /**
   * Keep the merged view current while it is open.
   *
   * Keyed on `panels.length` and not on `panels`: the array is a fresh
   * identity on every setPanelRect — i.e. every frame of a drag — and an
   * effect on the array itself would put an IPC round trip on the 60Hz path.
   * The COUNT is what a Cmd+N or a close actually changes, which is the whole
   * reason to refetch: without this, a panel spawned while merged is missing
   * from its own lane until the user toggles the view off and on, which reads
   * as the spawn having failed.
   *
   * It re-derives dormancy under the identical rule and in the identical
   * order, because a refetch is an entry as far as registry.ensure is
   * concerned: it can introduce panel ids this canvas has never rendered (a
   * spawn in ANOTHER window, a panel filed here by a move).
   *
   * `panels.length` ALONE was not enough, and the gap was the worst thing in
   * this milestone. A workspace mutation changes no panel on THIS canvas, so
   * deleting a NON-ACTIVE workspace while merged left its lane rendering
   * panels whose sessions had just been disposed — and a lane on screen is
   * clickable, because hitOrder is built from displayPanels. Clicking a ghost
   * runs onSelectPanel, which clears dormancy and calls registry.ensure,
   * which MINTS A FRESH SESSION for an id no workspace holds any more;
   * tiering promotes it and attachSlot spawns. An agent under a deleted
   * workspace's panel id, reachable from no UI ever again, from one click —
   * the no-unguarded-spawn rule broken through a door no per-task review
   * could see. Create and rename leave the same lane stale, cosmetically.
   *
   * So it also keys on `workspaceListSignature`, a STRING derived from
   * workspaceRows rather than the array itself: reloadWorkspaces() hands back
   * a brand-new array of brand-new objects on every call, including the one
   * this component fires on every panels.length change, so an effect keyed on
   * the array would refetch on identities that describe no change at all.
   * The signature covers id, name and which one is active — every workspace
   * MUTATION — and deliberately not panelIds, which changes on every spawn
   * and is already covered by panels.length one dep along. Gating the delete
   * on `merged` was the alternative and is worse: it would leave the stale
   * lane in place for create and rename too.
   */
  useEffect(() => {
    if (!merged) return
    let live = true
    void (async (): Promise<void> => {
      let workspaces: MergedWorkspace[]
      try {
        workspaces = await window.canvas.workspace.merged()
      } catch (error: unknown) {
        console.warn('[merged] could not refresh the merged view', error)
        return
      }
      const dormant = await resolveDormant(
        workspaces.flatMap((w) => w.panels.map((p) => p.id))
      )
      // The guard is not defensiveness: this fetch can resolve after the user
      // has already left the merged view, and committing then would put every
      // other workspace's panels back on a canvas that is no longer showing
      // them — with a dormantIds set naming ids this workspace does not hold.
      if (!live) return
      setMergedData(workspaces)
      setDormantIds(dormant)
    })()
    return () => { live = false }
  }, [merged, panels.length, workspaceListSignature, resolveDormant])

  // Read once at mount and again whenever a setting changes, so toggling the
  // glow off takes effect without a relaunch. settingRows is loaded only when
  // the palette OPENS, so it cannot be the source here — a panel must know
  // this whether or not the palette has ever been opened.
  const [glowEnabled, setGlowEnabled] = useState(true)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'agent.glow')
      if (row) setGlowEnabled(row.value === true)
    })
  }, [settingRows])

  // Read the same way glowEnabled is, and for the same reason: settingRows is
  // loaded only when the palette OPENS, so it cannot be the source — the pips
  // must know this whether or not the palette has ever been opened.
  const [pipsEnabled, setPipsEnabled] = useState(true)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'agent.edgeIndicators')
      if (row) setPipsEnabled(row.value === true)
    })
  }, [settingRows])

  // Rail and inspector visibility, persisted through main's settings store and
  // chorded on Cmd+\ / ⇧Cmd+\. Sits beside glowEnabled and pipsEnabled above
  // because it is the same kind of state and reads exactly the way they do:
  // its own settings:list call (settingRows is empty until the palette has
  // been opened, and the frame must be right on the first paint), re-run
  // whenever settingRows changes identity. That last half is not optional —
  // both settings are ordinary booleans, so main auto-generates a palette row
  // for each, and without the dependency a palette toggle would persist while
  // the rail never moved. See useShellChrome's own doc comment and
  // verify:panels 78.
  const chrome = useShellChrome({ paletteIsOpen: palette.isOpen, settingsSignal: settingRows })

  // Backlog #75's diagnostics overlay toggle. Ephemeral, unlike chrome above:
  // this is a debug view, not a persisted preference.
  const diagnostics = useDiagnostics({ paletteIsOpen: palette.isOpen })
  // Stable identity, for the same reason resetViewport/centreOn must stay
  // useCallbacks: the overlay's own poll effect depends on this, and Canvas
  // re-renders on every mousemove over .canvas (setCursor) — an unstable
  // identity would restart that effect's interval on every frame the mouse
  // moves while the overlay is open.
  const getDiagnosticsInput = useCallback(
    () => ({
      panels: registry.all(),
      budget: tieringDiagnosticsRef.current.budget,
      liveCount: tieringDiagnosticsRef.current.liveCount,
      heldCount: tieringDiagnosticsRef.current.heldCount,
      backend: backendInfo
    }),
    [backendInfo]
  )

  // Named for what it holds, not for the store function it came from:
  // Task 5 imports the store's `attentionIds` read into this same scope.
  const waitingIds = useAttentionIds()

  // Cell 8's door. The palette's own workspaces drill-in, never a second list:
  // the grid holds eight cells and the ninth is how you reach a ninth
  // workspace, which is a surface that already exists.
  const openWorkspaceScope = useCallback(
    () => palette.openPalette('workspaces'), [palette.openPalette])

  /**
   * M11's Cmd+G grid. Declared HERE rather than beside shouldYieldWheel
   * because it needs `workspaceRows` and `waitingIds`, neither of which exists
   * that far up; the two consumers that DO live up there read it back through
   * navGridIsOpenRef (see that ref's own comment).
   *
   * onCommit is switchWorkspace itself, not a second switching path: the grid
   * is a GESTURE onto M7's existing transaction, the same way the rail's
   * workspace row is.
   */
  const navGrid = useNavGrid({
    workspaces: workspaceRows,
    attentionIds: waitingIds,
    onCommit: switchWorkspace,
    onMore: openWorkspaceScope,
    // The palette owns the keyboard while it is open; two surfaces both
    // claiming Cmd is the one arrangement rule 3 of "who owns the keyboard"
    // exists to prevent.
    enabled: !palette.open
  })
  // Publishes the predicate to the two consumers declared above it — see
  // navGridIsOpenRef's own comment. In an effect rather than a render-time
  // assignment because navGrid.isOpen is a stable useCallback: this runs once.
  useEffect(() => { navGridIsOpenRef.current = navGrid.isOpen }, [navGrid.isOpen])

  /**
   * A review node is minted from the SUBJECT's stored baseline, asked for
   * once here and then carried inside the node — see ReviewSubject. The
   * label is snapshotted through the same honest chain the rail row walks,
   * because the panel it names may be closed long before the node is.
   */
  const openReview = useCallback((subjectId: string) => {
    const subject = panelsRef.current.find((p) => p.rect.id === subjectId)
    // A review of a review is not a thing, and neither is a review of a file
    // panel: only a terminal panel ever had a session, and only a session ever
    // had a baseline. The id could only reach here from a row that should have
    // been gated.
    if (subject === undefined || !isTerminalPanel(subject)) return
    const label = railLabel(subject, registry.get(subjectId)?.status)
    void window.canvas.review.baseline(subjectId).then((baseline) => {
      // Null is reachable despite the row's gate: a panel can be killed
      // between the click and the reply, and main drops its baseline on
      // kill. Minting a node with no baseline would produce a panel that can
      // never answer anything.
      if (baseline === null) return
      // RE-READ, never the captured `subject`: the await is a real gap, and
      // it is not only "the panel got closed" (dispose drops the baseline
      // too, which the null check above already catches). A WORKSPACE
      // SWITCH landing in this gap replaces the whole `panels` array while
      // leaving the subject's session — and therefore its baseline —
      // perfectly intact (demote, not dispose), so `baseline` comes back
      // non-null for a panel that is no longer in THIS canvas. Using the
      // captured `subject.rect` would place the node by a rect that only
      // meant something in the workspace that is no longer on screen, and
      // the node would carry a subjectId nothing here answers to.
      const current = panelsRef.current.find((p) => p.rect.id === subjectId)
      if (current === undefined || !isTerminalPanel(current)) return
      // `r`, from the SAME counter `n` comes from. PanelId doubles as a tmux
      // session name, so a review node minting an id a terminal panel in any
      // workspace already owns is M7's invisible collision through a new
      // door — the second panel to go live attaches to the first one's
      // session and the user simply sees one agent through two panels.
      const id = `r${nextIdRef.current++}`
      setPanels((existing) => {
        // cascadeCentre for the reason onSpawn uses it: opening two reviews
        // of one panel must not stack them byte-identically, which is a
        // canvas that looks like it holds one node while holding two.
        const centre = cascadeCentre(reviewCentre(current.rect), existing)
        const next = [
          ...existing,
          makeReviewPanel(id, centre, nextZ(existing), {
            subjectId,
            repoRoot: baseline.root,
            baselineSha: baseline.sha,
            label
          })
        ]
        commitHistory(next)
        return next
      })
      selectOnly(id)
    })
  }, [commitHistory])

  /**
   * Put a file on the canvas, at a world point.
   *
   * Modelled on openReview, and it needs none of that function's await: the
   * path is already in hand, so there is no IPC gap for a workspace switch to
   * land in and nothing to re-read afterwards. The READ is the node's own
   * (FileNode's mount effect), which is what keeps "the renderer is showing
   * this file" and "main is watching it" one statement.
   */
  const openFilePanel = useCallback((path: string, centre: Point, opts?: { prose?: true }) => {
    if (path === '') return
    // `f`, off the SAME counter as `n` and `r`. PanelId doubles as a tmux
    // session name and the global-uniqueness rule turns on nothing else being
    // able to mint a colliding one — see nextIdRef's own comment for the two
    // seed sites that keep this counter ahead of every persisted id.
    //
    // Minted OUTSIDE the updater, exactly as openReview mints its `r`: a
    // state updater must be pure, and `nextIdRef.current++` inside one is a
    // side effect StrictMode would run twice, burning an id per spawn.
    const id = `f${nextIdRef.current++}`
    setPanels((existing) => {
      // cascadeCentre for the reason onSpawn and openReview both use it:
      // opening the same file twice at an unmoved camera must not stack the
      // two byte-identically, which is a canvas that looks like it holds one
      // panel while holding two.
      const next = [
        ...existing,
        makeFilePanel(id, cascadeCentre(centre, existing), nextZ(existing), {
          path,
          // Conditional, never `...opts`. A spread writes `prose: undefined`,
          // which `'prose' in source` reads as PRESENT — the absent-stays-
          // absent trap this field's own doc comment records. ONE mint
          // function for both, so a note and an opened file cannot drift
          // apart in id minting, cascading, z-order or selection.
          ...(opts?.prose === true ? { prose: true as const } : {})
        })
      ]
      commitHistory(next)
      return next
    })
    // selectOnly, not setSelectedIds: a freshly opened file panel is the
    // whole selection, and this is the one helper that says so. See the
    // selectedIds note — the marquee made selection a SET, so every
    // single-panel selector goes through here.
    selectOnly(id)
  }, [commitHistory, selectOnly])

  /**
   * Open a toolbox node for one panel's directory.
   *
   * Takes the cwd and a LABEL rather than a panel id, and that is the same
   * decision `openReview` makes for `ReviewSubject`: the node must keep
   * answering after the panel it was opened from is closed, so it snapshots
   * what it needs at mint time and holds no reference to the panel.
   */
  const openToolboxPanel = useCallback((cwd: string, label: string, centre: Point) => {
    if (cwd === '') return
    // `t`, off the SAME counter as `n`, `r`, `f` and `j`. Minted OUTSIDE the
    // updater for openFilePanel's stated reason: a state updater must be pure,
    // and `nextIdRef.current++` inside one is a side effect StrictMode would
    // run twice. See nextIdRef's two seed sites, both of which had to widen
    // their regex to `[nrfjt]` for this prefix — and which were already blind
    // to M19's own `j`.
    const id = `t${nextIdRef.current++}`
    setPanels((existing) => {
      const next = [
        ...existing,
        makeToolboxPanel(id, cascadeCentre(centre, existing), nextZ(existing), { cwd, label })
      ]
      commitHistory(next)
      return next
    })
    selectOnly(id)
  }, [commitHistory, selectOnly])

  /**
   * The drop door, on the .canvas host.
   *
   * preventDefault on dragover is REQUIRED, not defensive: without it the
   * browser's default action for a dropped file is to NAVIGATE to it, which
   * destroys the app's own page — every panel, every camera, the whole
   * renderer — and looks like a crash rather than like a missing handler.
   *
   * Known, currently-unaddressed edge case: these handlers are on `.canvas`,
   * and both the palette and the nav grid mount as children of it too — so a
   * drop while either overlay is open mints a file panel underneath it,
   * unseen until the overlay closes. Worth a note, not a fix.
   */
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])
  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    // One file. A multi-file drop opening N panels at once is a decision to
    // ask for rather than to acquire as a side effect of a gesture.
    const file = event.dataTransfer.files[0]
    if (file === undefined) return
    // Electron 43 REMOVED File.path from the renderer. Reading `file.path`
    // yields undefined, the mint is skipped, and the drop looks like it did
    // nothing at all — with no error, because undefined is a perfectly
    // ordinary value for a property that does not exist. webUtils.getPathForFile,
    // behind the bridge, is the supported replacement.
    const path = window.canvas.file.pathForFile(file)
    if (!path) return
    const host = event.currentTarget.getBoundingClientRect()
    // The DROP's own world point, so the panel lands under the cursor at every
    // zoom rather than where the cursor would have been at 1:1.
    openFilePanel(path, screenToWorld(
      { x: event.clientX - host.left, y: event.clientY - host.top },
      viewportRef.current
    ))
  }, [openFilePanel])

  /**
   * verify:panels' route into the file-panel gesture, the same reason every
   * other window hook in this file exists: main's open dialog is native and a
   * real drop cannot be synthesised, so executeJavaScript has no other way in.
   *
   * It drives openFilePanel — the SAME function the palette row and the drop
   * handler both call — rather than reaching for setPanels itself, so a check
   * that passes through it is evidence about production code rather than about
   * a second mint path that only the suite can reach.
   *
   * Its own effect rather than a member of the __m4a* block above, and that is
   * forced rather than tidy: this effect's dependency list is evaluated during
   * render at the line it sits on, and openFilePanel is a `const` declared
   * further down — naming it up there is a TDZ error, not a style preference.
   */
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__m13Open = (path: string): void => openFilePanel(path, worldCentre())
    // M21's mint, through the SAME openToolboxPanel the inspector button and
    // the palette row both call — so the hook proves the real path rather than
    // a parallel one, the rule __m13Open already obeys.
    w.__m20Toolbox = (cwd: string, label: string): void =>
      openToolboxPanel(cwd, label, worldCentre())
    // M24's mint, through the SAME openJiraPanel the palette row calls — so
    // the hook proves the real gesture rather than a parallel mint, the rule
    // __m13Open and __m20Toolbox already obey.
    w.__m24Jira = (): void => openJiraPanel()
  }, [openFilePanel, worldCentre, openJiraPanel])

  /**
   * A node committed. Advance ITS OWN stored baseline to the commit it just
   * made, and nothing else.
   *
   * Without this the node reports the same files after a commit as before it,
   * permanently: it diffs the working tree against its baseline, and
   * committing does not change the working tree. A second press would then
   * re-commit content that is already in history.
   *
   * The SUBJECT PANEL's baseline in main is deliberately left alone. A node
   * can outlive its subject, so reaching into that panel's state is only
   * sometimes possible at all — and a write verb on one panel silently
   * resetting another surface's reading is the wrong direction.
   *
   * NO history entry. Cmd+Z cannot undo a commit, and an undo that restored
   * the old baseline would put the node back to reporting work that is now in
   * history — an undo stack that lies about what it can reverse is worse than
   * one that declines. The panel array still changes, so the existing
   * layout.save effect persists the new sha with no extra plumbing.
   */
  const onReviewCommitted = useCallback((nodeId: string, sha: string) => {
    if (sha === '') return
    setPanels((existing) => existing.map((p) =>
      p.rect.id === nodeId && isReviewPanel(p)
        ? { ...p, subject: { ...p.subject, baselineSha: sha } }
        : p))
  }, [])

  /**
   * The restart sequence, shared by `restartPanel` and `restartPanelWithMode`
   * so the two can never drift.
   *
   * `nextSpec` is what the panel should come back as. `restartPanel` passes
   * the spec unchanged; `restartPanelWithMode` passes one carrying a new
   * permission mode, which is the ONLY way a knob ever changes on a live
   * panel — see restartPanelWithMode's own comment for why a bare edit is
   * unsound.
   *
   * Every ordering note on the old restartPanel still applies verbatim and is
   * left where it was; this function is that body with one parameter added.
   */
  const restartWithSpec = useCallback(
    (id: string, nextSpec: PanelSpecTemplate) => {
      if (!isRestartable(registry.get(id)?.status)) return
      clearAgentState(id)
      clearLiveSession(id)
      clearSubagents(id)
      clearUsage(id)
      clearMachineCost(id)
      void registry.dispose(id).then(() => {
        // RE-CHECKED, never captured: the await is a real gap and the panel
        // can be closed inside it.
        if (!panelsRef.current.some((p) => p.rect.id === id)) return
        registry.ensure(id, nextSpec, { dormant: false })
        registry.touch(id)
        registry.bumpVersion()
      })
    },
    [registry]
  )

  // #24: functional links run from the registry's post-status exit hook, not
  // from a second raw IPC listener. A dormant or absent target is RECORDED as
  // skipped and never woken: an automation may restart an already-running
  // terminal, but it must not create an agent the user did not explicitly
  // start. The rule graph is cycle-free at creation and load, so one exit can
  // cascade only along a finite directed chain.
  const [automationResult, setAutomationResult] = useState<Map<string, string>>(() => new Map())
  const automationRowsBuilt: AutomationRow[] = panels.flatMap((source) => linksOf(source)
    .filter((link) => link.automation?.kind === 'restart-on-exit')
    .map((link) => {
      const target = panels.find((panel) => panel.rect.id === link.to)
      return target === undefined ? null : {
        from: source.rect.id,
        to: target.rect.id,
        source: railLabel(source, undefined),
        target: railLabel(target, undefined),
        enabled: link.automation!.enabled
      }
    })
    .filter((row): row is AutomationRow => row !== null))
  const automationRowsSignature = JSON.stringify(automationRowsBuilt)
  const automationRows = useMemo(() => automationRowsBuilt, [automationRowsSignature])
  useEffect(() => registry.onExit((info) => {
    const source = panelsRef.current.find((panel) => panel.rect.id === info.panelId)
    if (!source || !isTerminalPanel(source)) return
    for (const link of linksOf(source)) {
      if (link.automation?.kind !== 'restart-on-exit' || !link.automation.enabled) continue
      const key = `${source.rect.id}:${link.to}`
      const target = panelsRef.current.find((panel) => panel.rect.id === link.to)
      const session = target && isTerminalPanel(target) ? registry.get(target.rect.id) : undefined
      if (!target || !isTerminalPanel(target) || !session || session.dormant) {
        setAutomationResult((current) => new Map(current).set(key, 'skipped — target is dormant'))
        continue
      }
      if (!isRestartable(session.status)) {
        setAutomationResult((current) => new Map(current).set(key, 'skipped — target has not started'))
        continue
      }
      setAutomationResult((current) => new Map(current).set(key, `ran after exit ${info.exitCode}`))
      restartWithSpec(target.rect.id, target.spec)
    }
  }), [registry, restartWithSpec])

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
  const beginNewNote = useCallback(() => {
    const root = noteRootRef.current
    // The row is already disabled without a root; this is the second half of
    // the same rule, against a selection that changed while the palette was
    // open — the guard beginSavePrompt already keeps for its own list.
    if (root === null) return

    const stamp = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    // A date-stamped default, because the commonest note has no name the user
    // has thought of yet, and an empty field makes them invent one before
    // they can write anything down. Editable, obviously — it is a text field.
    const suggested = `notes/${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}.md`

    const prompt = (initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (name) => {
          // A blank submit is the same CANCEL a blank rename already is.
          if (name.trim() === '') { setInputMode(null); return }
          const seedTitle = name.trim().replace(/\.[^./]*$/, '').split('/').pop() ?? name.trim()
          void window.canvas.file
            .create({ root, name, seed: `# ${seedTitle}\n\n` })
            .then((res) => {
              if (res.kind === 'created') {
                setInputMode(null)
                openFilePanel(res.path, worldCentre(), { prose: true })
                return
              }
              // Every refusal re-prompts carrying the typed name, so the user
              // can correct it — InputMode's `feedback` exists precisely
              // because a placeholder only shows when the field is EMPTY,
              // which it never is on this path.
              const why =
                res.kind === 'exists' ? 'there is already a file with that name'
                  : res.detail
              prompt(name, `Couldn\u2019t create that note \u2014 ${why}`, true)
            })
            .catch((error: unknown) => {
              // Mandatory, for FileNode's reason: an unhandled rejection
              // leaves the input mode open forever with no explanation, which
              // reads as the app having frozen.
              prompt(name, `Couldn\u2019t create that note \u2014 ${String(error)}`, true)
            })
        }
      })
      // Palette.tsx closes the overlay BEFORE it runs a row's command AND
      // before it calls an input mode's submit, so without this the mode
      // would be set on a palette that is already gone and Canvas's own
      // clear-on-close effect would wipe it. The same pairing
      // beginRenamePreset, deletePreset and beginEditSetting all make — and
      // the reason every refusal branch below re-enters through `prompt`
      // rather than calling setInputMode on its own. Watched failing exactly
      // here: verify:panels 176 reported `stillInInput:false` with the
      // palette back in command mode, so a duplicate name silently did
      // nothing rather than saying the name was taken.
      palette.openPalette()
    }

    prompt(suggested, 'Name this note\u2026')
  }, [palette, openFilePanel, worldCentre])

  // Every verb the palette, top bar, rail and inspector share, lifted into
  // usePaletteActions.ts. Still ONE memoized object with the same dependency
  // array — Palette.tsx memoizes its command list on this prop's identity.
  const paletteActions = usePaletteActions({
    registry, palette, linkMode, panelsRef, displayPanelsRef, mergedRef,
    promptBodiesRef, nextGroupIdRef, presetRows, promptRows, settingRows,
    broadcastInput, broadcastReady, resetViewport, centreOn, worldCentre,
    selectAndRaise, selectOnly, onSelectPanel, onClosePanel, openReview,
    openFilePanel, openToolboxPanel, openJiraPanel, beginNewNote,
    restartWithSpec, commitHistory, switchWorkspace,
    movePanelsToWorkspace, toggleMerged, reloadPresets, reloadPrompts,
    reloadSettings, reloadCredentials, reloadWorkspaces, reloadWorktrees, worktreeRows, setPanels, setGroups,
    setInputMode, setBroadcastInput
  })
  // The link layer's remover, with an identity that outlives the palette's
  // captured id. `paletteActions` is rebuilt whenever `palette.capturedId`
  // changes, so handing `paletteActions.removeLink` straight to LinkLayer
  // re-rendered the whole layer on every palette open — the exact case its
  // own memo comment names as one it stops. Read through a ref so the wrapper
  // never goes stale and never changes. verify:panels memo-stable.1.
  const paletteActionsRef = useRef(paletteActions)
  paletteActionsRef.current = paletteActions
  const removeLinkStable = useCallback((from: string, to: string) => {
    paletteActionsRef.current.removeLink(from, to)
  }, [])

  /**
   * The top bar's ⚙. It opens the palette straight into the settings
   * drill-in through the controller's own scope — the SAME authority the
   * `Manage settings…` row's `entersScope: 'settings'` reaches, not a second
   * door. The scope is what makes the button honest: every setting row is
   * hiddenAtRest, so merely opening the palette would land the user on a list
   * with no settings visible at all, which reads as a feature that was never
   * built.
   */
  const openSettingsScope = useCallback(() => {
    palette.openPalette('settings')
    // A useCallback for consistency with its sibling verbs, not for a
    // load-bearing reason. An earlier comment here claimed an unstable
    // identity would re-render TopBar on every mousemove over the canvas;
    // that is false. TopBar is not memo-wrapped, so it re-renders whenever
    // Canvas does — which a mousemove's setCursor already makes it do —
    // whatever this prop's identity is. The parallel note in useViewport.ts
    // IS true and load-bearing (those callbacks sit in a keydown effect's dep
    // array); don't read this one as saying the same thing.
  }, [palette.openPalette])

  // Keeps deleteWorkspaceRef current for the __m7aWorkspace test hook
  // declared earlier in this component — see that ref's own comment for why
  // it exists instead of a direct reference.
  useEffect(() => {
    deleteWorkspaceRef.current = paletteActions.deleteWorkspace
  }, [paletteActions])

  // The rail's and inspector's derived models, lifted into useRailModels.ts.
  // Each is frozen on a signature string so a drag's 60Hz rect churn cannot
  // re-render panes that render nothing about a rect.
  const {
    panelRows, railRows, railWorkspaces, railAttention,
    selectedPanel, selectedLive, inspectorModel, selectedIsSessionless
  } = useRailModels({
    registry, palette, panelsRef, panels, displayPanels, dormantIds,
    workspaceRows, waitingIds, selectedId
  })

  // The file tree column, lifted into useFileTree.ts. Roots on the SELECTED
  // panel while insertPath pastes into the FOCUSED one — see the hook's doc
  // comment for why collapsing those onto one id is a bug, not a cleanup.
  const {
    treeRoot, treeRootLabel, treeRows, treeRootPending, noteRoot,
    toggleDir, refreshTree, insertPath
  } = useFileTree({
    registry, selectedPanel, selectedLive, selectedId, settingRows,
    focusedIdRef, noteRootRef
  })

  // The inspector's async detail sections, lifted into useInspectorDetail.ts.
  // Each is a three-state result — nothing to show / asked but unanswered / a
  // real answer — and must stay one; see the hook's doc comment.
  const {
    toolboxModel, reviewModel, inspectorSummary, hasSelection
  } = useInspectorDetail({
    registry, palette, panels, selectedId, selectedPanel,
    selectedIsSessionless, waitingIds
  })

  return (
    <div
      className={`shell${chrome.railOpen ? '' : ' shell--rail-collapsed'}${
        chrome.inspectorOpen ? '' : ' shell--inspector-collapsed'}${
        chrome.treeOpen ? '' : ' shell--tree-collapsed'}`}
      onMouseDownCapture={onMouseDownCapture}
    >
      {/* FIRST child, before TopBar: grid areas place every region regardless
          of DOM order, but a screen reader walks DOM order, and the tree is
          the leftmost region on screen. */}
      <FileTree
        onToggle={chrome.toggleTree}
        rootPath={treeRoot}
        rootLabel={treeRootLabel}
        rows={treeRows}
        rootPending={treeRootPending}
        onToggleDir={toggleDir}
        onInsertPath={insertPath}
        onRefresh={refreshTree}
      />
      <TopBar
        presets={presetRows}
        scale={viewport.scale}
        onSpawnPreset={paletteActions.spawnPreset}
        onZoomBy={zoomBy}
        onFit={fitAll}
        onSearch={palette.openPalette}
        onSettings={openSettingsScope}
        merged={merged}
        onToggleMerged={toggleMerged}
      />
      <SideRail
        onToggle={chrome.toggleRail}
        workspaces={railWorkspaces}
        onSwitchWorkspace={paletteActions.switchWorkspace}
        onCreateWorkspace={paletteActions.beginCreateWorkspace}
        onRenameWorkspace={paletteActions.beginRenameWorkspace}
        onDeleteWorkspace={paletteActions.deleteWorkspace}
        rows={railRows}
        selectedId={selectedId}
        onGoToPanel={paletteActions.goToPanel}
        onStartPanel={paletteActions.startPanel}
        onClosePanel={paletteActions.closePanel}
        attention={railAttention}
      />
      {/* M35 (Fix round 1). `canvas--ports-hidden` is a CLASS on the canvas
          host, never a `scale` prop threaded into every TerminalPanel. Ports
          are hidden below PORT_MIN_SCALE — a 14px dot is under two screen
          pixels at MIN_SCALE (0.1) — but `viewport.scale` changes on every
          frame of a zoom (`zoomAt`), and a `scale` prop on a memoized panel
          component would be a changed prop on every one of those frames,
          defeating `memo` for every panel on every zoom gesture. See
          PanelPorts.tsx's own comment. */}
      <div
        // `panning` is real React state (flips only at drag begin/end, so no
        // 60Hz cost); spaceHeld.isHeld() reads a ref and is therefore
        // best-effort here — Canvas already re-renders on nearly every
        // mousemove (setCursor), so the class catches up within a frame or
        // two of the keypress rather than exactly on it. Cursor feedback
        // only; the gesture itself never consults this className.
        className={`canvas${panning ? ' canvas--panning' : spaceHeld.isHeld() ? ' canvas--space-armed' : ''}${linkDraw.state !== null ? ' canvas--linking' : ''}${viewport.scale < PORT_MIN_SCALE ? ' canvas--ports-hidden' : ''}`}
        ref={hostRef}
        onMouseDownCapture={onCanvasMouseDownCapture}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div
          className="world"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
        >
          <GroupLayer
            groups={merged ? [] : groups}
            panels={displayPanels}
            readOnly={merged}
            onBeginDrag={onBeginGroupDrag}
            onToggle={toggleGroupCollapsed}
            onRemove={onRemoveGroup}
          />
          {/* First child, and z-index 0 in the stylesheet, so it paints
              beneath every panel — nextZ mints z >= 1. It is inside .world so
              it pans and zooms with the panels. The LAYER itself still takes
              no pointer events; M35 Task 6 opts each link's own hit stroke
              and remove badge back in individually so a link can be hovered
              and removed without the layer as a whole ever swallowing a
              click. See LinkLayer.

              Fed displayPanels rather than panels, for the same reason the
              panel map below is: while merged the only rects on screen are
              lane-offset ones, and a layer drawn from `panels` would paint
              every link at its un-offset position — lines detached from the
              panels they join. buildLinkSegments skips a link whose target is
              not in the array it was handed, so a link that crosses a lane
              boundary simply does not draw rather than drawing wrong.

              onRemove is the SAME paletteActions.removeLink the inspector's
              link rows use — never a second copy — so both surfaces produce
              exactly one history entry and cannot disagree about what
              removing a link means. Suppressed while merged, where geometry
              and links are read-only, the same gate the drag and the move
              verb already take. */}
          <LinkLayer
            panels={displayPanels}
            draw={linkDraw.state}
            onRemove={merged ? undefined : removeLinkStable}
          />
          {displayPanels.map((panel) => {
            // The partition, at the last hop. onSelect is selectAndRaise and
            // NOT onSelectPanel: the latter clears the dormant id and calls
            // registry.wake, which is the app's spawn gesture and means
            // nothing for a panel with no process — the same distinction the
            // rail draws between navigating and starting.
            if (isReviewPanel(panel)) {
              return (
                <ReviewNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  onCommitted={onReviewCommitted}
                  // The commit input is the second surface in this app that
                  // takes DOM focus off xterm, so it inherits usePalette's
                  // rule 4 — see ReviewNode's own prop comments for both
                  // halves, and for why no check can observe it.
                  restoreFocus={restoreFocus}
                  focusedId={focusedId}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                />
              )
            }
            // The second sessionless arm, and onSelect is selectAndRaise here
            // for the same reason it is above: a file panel has no process, so
            // onSelectPanel's clear-dormant and registry.wake would be the
            // app's spawn gesture aimed at something that can never spawn.
            if (isFilePanel(panel)) {
              return (
                <FileNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  // The editor textarea is a third surface that takes DOM
                  // focus off xterm, so it inherits usePalette's rule 4 —
                  // see FileNode's own prop comments for both halves, and
                  // ReviewNode's restoreFocus prop for the precedent.
                  restoreFocus={restoreFocus}
                  focusedId={focusedId}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                />
              )
            }
            if (isToolboxPanel(panel)) {
              return (
                <ToolboxNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  // selectAndRaise, never onSelectPanel: the latter's
                  // clear-dormant and registry.wake are the SPAWN gesture, and
                  // a toolbox node can never spawn anything.
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                />
              )
            }
            if (isJiraPanel(panel)) return <JiraNode key={panel.rect.id} panel={panel} selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag} onClose={onClosePanel} onSpawn={spawnJiraTicket} focusedId={focusedId} restoreFocus={restoreFocus} readOnly={merged} onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id} />
            const session = registry.get(panel.rect.id)
            if (!session) return null
            return (
              <TerminalPanel
                key={panel.rect.id}
                session={session}
                version={version}
                rect={panel.rect}
                z={panel.z}
                title={panel.title}
                selected={selectedIds.has(panel.rect.id)}
                onSelect={onSelectPanel}
                onSlotMount={onSlotMount}
                onSlotUnmount={onSlotUnmount}
                onFocus={onFocusPanel}
                onBeginDrag={onBeginDrag}
                onClose={onClosePanel}
                glow={glowEnabled}
                readOnly={merged}
                openingContext={openingContexts.get(panel.rect.id)}
                onContextPasted={onContextPasted}
                entering={enteringPanelIds.has(panel.rect.id)}
                onEntryEnd={onPanelEntryEnd}
                onBeginLink={onBeginLink}
                linkTarget={linkDraw.state?.target === panel.rect.id}
              />
            )
          })}
          {/* INSIDE .world, unlike the pips and the marquee below it: a lane
              header names a region of the WORLD, so it has to pan and scale
              with the panels it labels — see MergedLanes' own comment. Last
              in the world layer rather than first only because JSX order is
              not paint order here: panels carry an explicit zIndex from
              Panel.z (>= 1) and the lanes sit at 0, which is what keeps a
              lane behind the panels it contains. */}
          <MergedLanes lanes={merged && mergedView ? mergedView.lanes : []} />
          {/* Inside .world, not beside it — the opposite of EdgeIndicators
              and for the mirror-image reason: a pip must stay pinned to the
              viewport's edge, a subagent node belongs to a place beside its
              parent panel, so it has to pan and zoom with it. terminalPanels,
              never `panels`: a review node has no subagents of its own, and
              it is already outside this array for the identical reason it is
              outside assignTiers' input. */}
          <SubagentLayer panels={terminalPanels} />
        </div>
        {pipsEnabled && (
          <EdgeIndicators rects={rects} viewport={viewport} ids={waitingIds} />
        )}
        {/* Beside the pips and outside .world for the same reason — see
            Marquee.tsx. It renders null at rest, so there is no "no marquee"
            element for anything to find. */}
        <Marquee rect={marquee} />
        {/* A SIBLING of .world, like EdgeIndicators above: .world carries the
            one translate()/scale() transform, and an overlay inside it would
            pan and zoom away with the canvas it is pinned to. */}
        {/* M13. Success criterion 6: an armed mode must never be invisible.
            A SIBLING of .world like NavGrid above, so it is viewport-pinned
            chrome rather than something that pans away from the user while
            the mode it describes is still armed. */}
        {linkMode.from !== null && (
          <div className="link-banner" role="status">
            Linking from <strong>{linkSourceName}</strong> — click a panel, or press Escape
          </div>
        )}
        {broadcastInput && (
          <div className="link-banner" role="status">
            Broadcasting keyboard input to <strong>{broadcastTargetIds.length} terminals</strong> — open the palette to stop
          </div>
        )}
        <NavGrid controller={navGrid} />
        <DiagnosticsOverlay
          open={diagnostics.open}
          onClose={diagnostics.close}
          getRendererInput={getDiagnosticsInput}
        />
        <CanvasHud
          viewport={viewport}
          cursor={cursor}
          selectedId={selectedId}
          backend={backendInfo}
          machineCost={machineCostTotal}
        />
        {palette.open && (
          <Palette
            controller={palette}
            actions={paletteActions}
            presets={presetRows}
            prompts={promptRows}
            panels={panelRows}
            settings={settingRows}
            workspaces={workspaceRows}
            credentials={credentialRows}
            worktrees={worktreeRows}
            // The renderer's own attention set (agent-state-store.ts), not a
            // second derivation: main never learns "which panels are
            // wants-you" as a set, only individual agent:state transitions,
            // and asking it to recompute one here would make it a second
            // author of a fact this side already folds correctly.
            attentionIds={waitingIds}
            hasSelection={hasSelection()}
            selectedIds={selectedPanelIds}
            noteRoot={noteRoot}
            merged={merged}
            broadcastReady={broadcastReady}
            broadcastActive={broadcastInput}
            inputMode={inputMode}
          />
        )}
      </div>
      <Inspector
        onToggle={chrome.toggleInspector}
        model={inspectorModel}
        summary={inspectorSummary}
        onRename={paletteActions.beginRenamePanel}
        onClose={paletteActions.closePanel}
        onSavePreset={paletteActions.savePanelAsPreset}
        onRestart={paletteActions.restartPanel}
        onOpenReview={paletteActions.openReview}
        onLink={paletteActions.beginLink}
        onRemoveLink={paletteActions.removeLink}
        onRelabelLink={paletteActions.beginRelabelLink}
        onSetRestartOnExit={onSetRestartOnExit}
        automationResults={automationResult}
        automations={automationRows}
        review={reviewModel}
        toolbox={toolboxModel}
        onOpenToolbox={paletteActions.openToolbox}
      />
    </div>
  )
}
