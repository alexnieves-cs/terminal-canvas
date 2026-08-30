import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from 'react'
import { CanvasHud } from './CanvasHud'
import { EdgeIndicators } from './EdgeIndicators'
import { useViewport } from './useViewport'
import { assignTiers, LIVE_BUDGET, type Tier } from './lod'
import { hitTest, screenToWorld, type Point, type WorldRect } from './viewport'
import { usePanelDrag } from './usePanelDrag'
import type { DragMode, DragState } from './panel-interaction'
import { nextAttentionId, reachableQueue, type JumpDirection } from './attention'
import { TerminalPanel } from '@renderer/components/TerminalPanel'
import { ReviewNode } from '@renderer/review/ReviewNode'
import { createRegistry } from '@renderer/session/session-registry'
import { useRegistryVersion } from '@renderer/session/useRegistry'
import {
  applyAgentState, attentionIds, clearAgentState, useAgentState, useAttentionIds
} from '@renderer/session/agent-state-store'
import {
  applyLiveSession, clearLiveSession, getLiveSession, useLiveSession
} from '@renderer/session/live-session-store'
import { createSessionFactory } from '@renderer/terminal/session-factory'
import { installPointerCorrection, isCorrectedEvent } from '@renderer/components/xterm-pointer'
import type { CanvasState } from '@shared/layout-schema'
import type {
  ActivateResult,
  CapturedPanel,
  PresetTemplate,
  SessionBackendInfo,
  SettingRow,
  WorkspaceRow
} from '@shared/ipc-contract'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'
import {
  cascadeCentre, firstRunPanels, isReviewPanel, makePanel, makeReviewPanel, nextZ, raisePanel,
  removePanel, reviewCentre, setPanelRect, type Panel, type TerminalPanel as TerminalPanelModel
} from '@renderer/panels/panels'
import { createHistory, pushHistory, undoHistory, redoHistory, type History } from '@renderer/panels/history'
import { usePalette } from '@renderer/palette/usePalette'
import { Palette, type InputMode } from '@renderer/palette/Palette'
import type { PaletteActions, PanelRow, PresetRow, PromptRow } from '@renderer/palette/commands'
// M8a. The frame is rendered here rather than in App.tsx because every verb it
// will eventually need (paletteActions, the camera verbs, presetRows) is state
// that lives inside Canvas — an App-owned frame would mean lifting all of it up
// or threading it back through a callback, making App a state owner in exchange
// for a tidier diagram.
import { TopBar } from '../shell/TopBar'
import { SideRail } from '../shell/SideRail'
import { Inspector } from '../shell/Inspector'
import { useShellChrome } from '../shell/useShellChrome'
import { buildRailRows, railLabel, railSignature } from '../shell/rail-rows'
import {
  attentionSignature, buildAttentionRows, buildWorkspaceRows, workspaceSignature
} from '../shell/rail-sections'
import {
  buildInspectorModel, buildInspectorSummary, buildReviewFields, inspectorSignature,
  isRestartable, isRunning, reviewSignature, type ReviewFieldModel
} from '../shell/inspector-fields'

/** Promote immediately, demote late: the other half of the anti-thrash story. */
const DEMOTE_DELAY_MS = 250

// Module-level so the palette's props keep the same identity between renders;
// a fresh [] each render would rebuild the command list on every frame of a pan.
const EMPTY_PRESETS: PresetRow[] = []
const EMPTY_PROMPTS: PromptRow[] = []
const EMPTY_PANELS: PanelRow[] = []
const EMPTY_SETTINGS: SettingRow[] = []
// Initial value for workspaceRows before the mount-time reloadWorkspaces()
// call below resolves. attentionIds has no equivalent placeholder — it
// reads live off useAttentionIds(), which starts at its own empty snapshot.
const EMPTY_WORKSPACES: WorkspaceRow[] = []

/**
 * The empty selection, as ONE module-scope value, for the reason stated
 * directly above: a fresh `new Set()` per render has a new identity every
 * render, and the selection reaches dependency arrays and memo comparisons —
 * a new identity there is re-render churn on the 60Hz pan/drag path, which is
 * the class of bug `panelRows`, `railSignature` and `resetViewport`'s
 * `useCallback` each exist to keep off this file.
 */
const EMPTY_SELECTION: ReadonlySet<string> = new Set()

/**
 * Drop every id the predicate rejects, PRESERVING the set's identity when
 * nothing was dropped. That half is what keeps this byte-identical to the
 * `(id) => (id && ids.has(id) ? id : null)` updaters it replaced: an
 * unchanged selection was not a state change there, and must not become one
 * here — a set rebuilt on every panel close and every undo would re-render
 * the canvas for a selection that did not move.
 */
function retainSelection(
  current: ReadonlySet<string>,
  keep: (id: string) => boolean
): ReadonlySet<string> {
  const next = new Set([...current].filter(keep))
  if (next.size === current.size) return current
  return next.size === 0 ? EMPTY_SELECTION : next
}

/**
 * What the switcher calls a panel. This is always the command/cwd/id shape —
 * autoName()'s shape in main/presets.ts — regardless of whether the panel has
 * a user-set title: the goto row's TITLE stays stable so `verify:panels`
 * check 39 can keep targeting it by text, and a titled panel's name is
 * carried as the row's SUBTITLE instead (see the panel.goto.* row in
 * commands.ts), which is what actually makes it findable in the palette.
 */
function panelLabel(panel: Panel): string {
  // A review node has no command and no cwd of its own — its subject's repo
  // root is what identifies it, and the label snapshot is what names the
  // agent it reviews. Same shape as the terminal case (a name, then the id)
  // so the switcher's rows stay one kind of row.
  if (isReviewPanel(panel)) return `review: ${panel.subject.label} (${panel.rect.id})`
  const command = panel.spec.command ? panel.spec.command.split('/').pop() : 'login shell'
  // M12's live cwd is deliberately NOT read here. This label carries no
  // present-tense claim — unlike an inspector field labelled "now in", it
  // says nothing that could go stale — so there is nothing here for a live
  // answer to make wrong, and pulling in getLiveSession would only add a
  // claim this row was never making. Left as spec.cwd on purpose; see
  // CLAUDE.md's "Display renders nothing without a live answer" entry for
  // the fuller argument this is a corner of.
  return `${command} — ${panel.spec.cwd} (${panel.rect.id})`
}

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
  // Hit testing and the pip layer keep the WHOLE array: a review node is a
  // real, clickable panel and an off-screen one is a real thing to point at.
  const rects = useMemo(() => panels.map((p) => p.rect), [panels])

  /**
   * Tiering's input, and the reason a review node cannot take a LIVE_BUDGET
   * slot or a WebGL context: it is not in the array assignTiers is given, so
   * the guarantee is structural rather than a rule assignTiers has to obey.
   * The same filter gates registry.ensure below — a review node has no spec
   * to ensure with, and minting a PanelSession for one would put a terminal
   * in the map with nothing to run in it.
   */
  const terminalPanels = useMemo(
    () => panels.filter((p): p is TerminalPanelModel => !isReviewPanel(p)),
    [panels]
  )
  const terminalRects = useMemo(() => terminalPanels.map((p) => p.rect), [terminalPanels])
  // hitTest returns the LAST match, so paint order and pick order agree only
  // if the array it receives is in paint order. Paint order is z now, not
  // array position — see the note on Panel.z.
  const hitOrder = useMemo(
    () => [...panels].sort((a, b) => a.z - b.z).map((p) => p.rect),
    [panels]
  )
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
      // Both prefixes, one sequence. `r` nodes and `n` panels draw from the
      // same counter precisely so neither can mint an id the other owns; a
      // regex that only saw `n` would restore a canvas holding r7 and then
      // hand out n7, which is one id for two panels.
      const match = /^[nr](\d+)$/.exec(id)
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
    (centre: Point, template?: PresetTemplate) => {
      const chosen = template ?? defaultTemplateRef.current
      const id = `n${nextIdRef.current++}`
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
          makePanel(
            id,
            placed,
            nextZ(current),
            chosen
              ? { panelId: id, cwd: chosen.cwd, args: [...chosen.args], ...(chosen.command !== undefined ? { command: chosen.command } : {}) }
              : undefined,
            chosen ? { w: chosen.w, h: chosen.h } : undefined
          )
        ]
        commitHistory(next)
        return next
      })
    },
    [commitHistory]
  )
  // The selection is a SET, so a later marquee can build a multi-selection
  // without renaming forty call sites. Nothing in this milestone creates one
  // with more than a single member yet.
  //
  // focusedId is deliberately NOT widened alongside it. assignTiers pins the
  // focused panel live unconditionally, so focus is a budget-and-WebGL-context
  // claim rather than a highlight — a set of them would hold LIVE_BUDGET slots
  // for the rest of the run, with nothing on screen saying so.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() =>
    initial.selectedId === null ? EMPTY_SELECTION : new Set([initial.selectedId])
  )
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
  const selectOnly = useCallback((id: string | null): void => {
    setSelectedIds(id === null ? EMPTY_SELECTION : new Set([id]))
  }, [])
  const [focusedId, setFocusedId] = useState<string | null>(initial.focusedId)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })

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
    // whatever panel later recycles that id. The test is POSITIVE
    // (isReviewPanel), never `!isTerminalPanel`, so a third kind added later
    // is treated as a terminal panel by default rather than silently losing
    // its teardown. The guard is on the ITERATION rather than on the call,
    // which is what keeps verify:panels 94's dispose-call-site count at five.
    for (const panel of previousPresent) {
      if (isReviewPanel(panel)) continue
      if (!ids.has(panel.rect.id)) {
        registry.dispose(panel.rect.id)
        // Without this the agent-state map grows for the life of the
        // renderer and a recycled id inherits a dead panel's border.
        clearAgentState(panel.rect.id)
        clearLiveSession(panel.rect.id)
      }
    }
    setPanels(next.present)
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

  // The one place that decides who owns a wheel gesture. Three rules, and the
  // ORDER is the load-bearing part: the palette outranks zoom, and zoom
  // outranks the focused panel.
  const shouldYieldWheel = useCallback((event: WheelEvent): boolean => {
    const target = event.target as HTMLElement | null

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

  const {
    viewport, resetViewport, worldCentre, centreOn, restoreCamera, zoomBy, fitAll
  } = useViewport(
    hostRef, rects, onSpawn, shouldYieldWheel, initial.camera, palette.isOpen, onJumpAttention
  )
  const version = useRegistryVersion(registry)

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
      // clipboard; Palette.tsx serves its own input instead.
      if (palette.isOpen()) return
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      const selection = session?.handle.getSelection()
      if (selection) void navigator.clipboard.writeText(selection)
    })
    const offPaste = window.canvas.edit.onPaste((text) => {
      // Rule 3. Without this the text lands in a running agent, invisibly,
      // while the user watches an empty text field. verify:panels 35.
      if (palette.isOpen()) return
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      if (text) session?.handle.paste(text)
    })
    return () => {
      offCopy()
      offPaste()
    }
    // palette.isOpen is referentially stable, so this stays a once-only
    // install; listing it makes the dependency visible rather than implied.
  }, [palette.isOpen])

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
      // A review node has no spec to capture, so it saves as no preset. It
      // cannot be the focused panel today (nothing focuses one but its own
      // body), and it answers null rather than throwing if that ever changes.
      if (!panel || isReviewPanel(panel)) return null
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
    const offUndo = window.canvas.edit.onUndo(() => {
      if (palette.isOpen()) return
      setHistory((h) => { const next = undoHistory(h); applyHistory(h.present, next); return next })
    })
    const offRedo = window.canvas.edit.onRedo(() => {
      if (palette.isOpen()) return
      setHistory((h) => { const next = redoHistory(h); applyHistory(h.present, next); return next })
    })
    return () => {
      offUndo()
      offRedo()
    }
  }, [applyHistory, palette.isOpen])

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
      if (isReviewPanel(panel)) continue
      registry.dispose(panel.rect.id)
      // Same reason as the undo/redo site above: reset drops every panel at
      // once, and each dropped id needs its cached agent state cleared too.
      clearAgentState(panel.rect.id)
      clearLiveSession(panel.rect.id)
    }
    const fresh = firstRunPanels()
    setPanels(fresh)
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
    (id: string) => {
      const outgoing: CanvasState = {
        panels: fromPanels(panelsRef.current),
        camera: viewportRef.current,
        selectedId,
        focusedId
      }
      void (async (): Promise<void> => {
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
          return
        }
        // Null means the id named nothing — a stale palette row, or a
        // workspace deleted out from under an in-flight switch. Main changed
        // nothing, so neither does this.
        if (!result) return
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
        nextIdRef.current = Math.max(
          nextIdRef.current,
          result.allPanelIds.reduce((max, pid) => {
            // Both prefixes, one sequence — see nextIdRef's own comment.
            const match = /^[nr](\d+)$/.exec(pid)
            return match ? Math.max(max, Number(match[1]) + 1) : max
          }, 1)
        )
        // Refreshes workspaceRows so the rail's Workspaces section reflects
        // which workspace is now active — see reloadWorkspacesRef's own
        // comment for why this is a ref rather than a direct call.
        reloadWorkspacesRef.current?.()
      })()
    },
    [selectedId, focusedId, restoreCamera]
  )

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

  // Test hooks for verify:panels. The registry (and, since M7, the workspace
  // surface) is a module-level/main-owned concept with no other route in for
  // executeJavaScript. Kept to narrow, single-purpose reads/writes — named
  // for what each one ANSWERS — rather than exposing the registry itself, so
  // the suite cannot quietly start depending on internals. Grep `w\.__` in
  // this effect for the current count rather than trusting a number here:
  // it has already drifted once (an earlier comment said "seven" after the
  // count had grown past a dozen).
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__m4aScale = (): number => viewportRef.current.scale
    w.__m4aWrite = (data: string): void => {
      const id = focusedIdRef.current
      if (id) registry.get(id)?.handle.write(data)
    }
    w.__m4aSelection = (): string => {
      const id = focusedIdRef.current
      return registry.get(id ?? '')?.handle.getSelection() ?? ''
    }
    w.__m4aGrid = (): { cols: number; rows: number } | null => {
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      // Guarded on the tier, because size() throws by design for a session
      // that was never attached (see session-factory). There is a window
      // between focusedId being set and attachSlot landing, and an unguarded
      // read there would reject executeJavaScript and surface as an
      // infrastructure error for the whole suite rather than a null.
      return session && session.tier === 'live' ? session.handle.size() : null
    }
    /**
     * The full viewport, so a check can re-derive screenToWorld itself rather
     * than assert against the production conversion it is testing.
     */
    w.__m4aViewport = (): { x: number; y: number; scale: number } => ({
      ...viewportRef.current
    })
    /** Screen-space centre of the first cell of `word` in the focused panel. */
    w.__m4aCellToScreen = (word: string): { x: number; y: number } | null => {
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      if (!session) return null
      const found = session.handle.locate(word)
      if (!found) return null
      const rect = session.handle.host.getBoundingClientRect()
      const cell = session.handle.cellSize()
      const scale = viewportRef.current.scale
      // rect is transform-aware (screen px); cell is CSS px. Multiplying the
      // cell offset by the scale is the INVERSE of correctForScale, which is
      // how a caller turns a buffer position back into a real screen point.
      return {
        x: rect.left + (found.col + 0.5) * cell.width * scale,
        y: rect.top + (found.row + 0.5) * cell.height * scale
      }
    }
    /** A panel's xterm scrollback offset, by id — not just the focused one. */
    w.__m4aScrollY = (id: string): number | null => {
      const session = registry.get(id)
      return session ? session.handle.scrollPosition() : null
    }
    /**
     * Every session's boot-reconcile state, by id. Answers whether dormancy
     * came out right at launch: a panel reattached to a live tmux session
     * must be non-dormant, and one with nothing to reattach to must stay
     * dormant — see CLAUDE.md's "Dormancy is about spawning, not attaching".
     */
    w.__m4aSessions = (): Array<{ id: string; dormant: boolean; spawned: boolean }> =>
      registry.all().map((s) => ({ id: s.id, dormant: s.dormant, spawned: s.spawned }))
    /**
     * Drives the same undo path Cmd+Z does. executeJavaScript has no way to
     * dispatch a real main-process menu accelerator, so this is the narrow
     * verb verify:panels needs to exercise undo without one.
     */
    w.__m4bUndo = (): void =>
      setHistory((h) => { const next = undoHistory(h); applyHistory(h.present, next); return next })
    /**
     * Drives the same reset path the confirmed "Reset canvas…" menu item
     * does, minus the native dialog executeJavaScript cannot reach. Exists
     * so verify:panels can cover the reset handler at all — until this hook,
     * no suite exercised it, which is how the camera-left-behind and
     * panels-still-imply-workspace-loss defects both survived to a
     * whole-branch review.
     */
    w.__m4bReset = (): void => resetCanvas()
    /**
     * A panel's spec and rect, by id — what check 27/29/31 read back to
     * confirm a preset actually reached makePanel rather than just checking
     * that SOME panel appeared.
     */
    w.__m5aSpecOf = (id: string): { spec: PanelSpecTemplate; rect: WorldRect } | null => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      return panel && !isReviewPanel(panel) ? { spec: panel.spec, rect: panel.rect } : null
    }
    /** The template currently pushed as Cmd+N's default, or undefined. */
    w.__m5aDefaultSpec = (): PresetTemplate | undefined => defaultTemplateRef.current
    /**
     * verify:panels' route into workspace switching, the same reason every
     * other __m4a* hook exists: the registry (and now the workspace surface)
     * is a module-level/main-owned concept executeJavaScript cannot reach any
     * other way. Kept narrow and named for what each member ANSWERS.
     */
    w.__m7aWorkspace = (): {
      switchTo: (workspaceId: string) => void
      createAndSwitch: (name: string) => Promise<string>
      allPanelIds: () => Promise<string[]>
      deleteWorkspace: (workspaceId: string) => void
    } => ({
      switchTo: (workspaceId: string) => switchWorkspace(workspaceId),
      // Returns the id the store actually minted, not just a fire-and-forget
      // void: nextWorkspaceId() derives from the current maximum `w<n>`, so a
      // caller has no honest way to predict it in advance. A check that
      // hardcodes the id it EXPECTS createWorkspace to hand back is a check
      // that never actually switched anywhere the day that assumption drifts
      // — it would still read as green, just against the wrong workspace.
      createAndSwitch: (name: string) =>
        window.canvas.workspace.create(name).then((workspaceId) => {
          switchWorkspace(workspaceId)
          return workspaceId
        }),
      allPanelIds: () =>
        window.canvas.workspace.list().then((rows) => rows.flatMap((row) => row.panelIds)),
      // Drives the SAME gated action a real "Delete workspace…" palette row
      // does — paletteActions.deleteWorkspace, reached through a ref because
      // paletteActions is declared later in this component (see
      // deleteWorkspaceRef's own comment). Not a bypass: this still opens
      // the confirm and still waits on an Enter/Escape the way the real row
      // does, which is what lets verify:panels prove the confirm is a real
      // gate rather than only that a delete function exists. name/liveCount
      // are read off main's own list rather than guessed, the same reason
      // createAndSwitch above never hardcodes an id.
      deleteWorkspace: (workspaceId: string) => {
        void window.canvas.workspace.list().then((rows) => {
          const row = rows.find((r) => r.id === workspaceId)
          deleteWorkspaceRef.current?.(
            workspaceId, row?.name ?? workspaceId, row?.panelIds.length ?? 0
          )
        })
      }
    })
  }, [applyHistory, resetCanvas, switchWorkspace])

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
    onCommit: useCallback((id: string, mode: DragMode) => {
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
      if (mode.kind !== 'resize') return
      // One commit per gesture, never one per frame: a full-screen agent TUI
      // repaints its whole frame on every SIGWINCH, and resizing live would
      // mean sixty of those a second at sizes the user never meant to keep.
      // refit sends at most one pty:resize, and none if the grid is unchanged.
      registry.refit(id)
    }, [commitHistory])
  })

  const onBeginDrag = useCallback(
    (state: DragState) => {
      const host = hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      // The panel supplies CLIENT coordinates; only the canvas knows the
      // viewport, so the conversion belongs here. Converting the POINT (not a
      // delta) is what makes the gesture move by screenDelta / scale:
      // usePanelDrag converts each move the same way, and the two translations
      // cancel in the subtraction applyDrag does.
      beginDrag({
        ...state,
        originWorld: screenToWorld(
          { x: state.originWorld.x - bounds.left, y: state.originWorld.y - bounds.top },
          viewportRef.current
        )
      })
    },
    [beginDrag]
  )

  // Stable identities: these go into TerminalPanel's effect deps, and a fresh
  // arrow each render would tear the terminal down and reopen it every frame.
  const onSlotMount = useCallback((id: string) => registry.attachSlot(id), [])
  const onSlotUnmount = useCallback((id: string) => registry.detachSlot(id), [])
  const onClosePanel = useCallback((id: string) => {
    // A review node owns no session, so it is dropped from the array and
    // nothing else. This is NOT a sixth dispose call site and must not
    // become one: the registry's dispose sends pty.kill even for an id this
    // renderer holds no session for (see CLAUDE.md), so routing a review
    // node through it would send a tmux kill-session for a panel that never
    // had one — and, worse, drop the baseline of whatever panel later
    // recycles that id.
    if (panelsRef.current.some((p) => p.rect.id === id && isReviewPanel(p))) {
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
  const selectAndRaise = useCallback((id: string) => {
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
  }, [commitHistory])

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
    const known = new Set(panelsRef.current.map((p) => p.rect.id))
    const queue = reachableQueue(attentionIds(), known)
    const id = nextAttentionId(queue, jumpCursorRef.current, direction)
    // Nothing is waiting: the key does nothing at all. Moving the camera
    // "somewhere" would be worse than silence — the user asked to be taken to
    // a panel that wants them, and there isn't one.
    if (id === null) return
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    // Belt-and-braces: a panel can still vanish between the filter above and
    // this lookup in principle. It must never be the ONLY thing standing
    // between the user and a working key, which is why the filter exists.
    if (!panel) return
    jumpCursorRef.current = id
    centreOn(panel.rect)
    selectAndRaise(id)
  }

  const onSelectPanel = useCallback((id: string) => {
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
      dormantIds
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
  }, [terminalRects, viewport, focusedId, version, dormantIds])

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
  useEffect(() => {
    void window.canvas.layout.save({
      panels: fromPanels(panels),
      camera: viewport,
      selectedId,
      focusedId
    })
  }, [panels, viewport, selectedId, focusedId])

  const toWorld = (event: MouseEvent<HTMLDivElement>): Point | null => {
    const host = hostRef.current
    if (!host) return null
    const bounds = host.getBoundingClientRect()
    return screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewport)
  }

  const onMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    // Only background clicks reach here; panels stopPropagation.
    const world = toWorld(event)
    const hit = world ? hitTest(hitOrder, world) : null
    // Through onSelectPanel, not selectOnly: selecting raises. A live
    // panel's own chrome handler already does that, but a CARDED panel has no
    // handler of its own — its click falls through to the background path, and
    // calling selectOnly here directly would select it without raising it.
    if (hit) onSelectPanel(hit)
    else selectOnly(null)
    // Focus is released together with selection. assignTiers pins the focused
    // panel live unconditionally — off screen, below the scale threshold,
    // budget full — so a focusedId that is never cleared holds a WebGL context
    // and a budget slot for the rest of the run, however far you pan away. It
    // also keeps React's idea of focus in step with the DOM's: clicking away
    // blurs xterm's textarea, and a stale focusedId would keep routing Cmd+C
    // to the panel the user just left. Releasing focus is all this does; the
    // chrome-selects / body-passes-through split is untouched.
    setFocusedId(null)
  }

  // The palette's third exit (the spec's focus rule 4 names Escape,
  // Enter-after-run, and a click outside — this is the third). CAPTURE phase
  // on the canvas host, and it has to be: every panel handler stopPropagations
  // its own mousedown, so a click on a PANEL never reaches the background
  // onMouseDown below and a close written there would fire for background
  // clicks only. Without any of it the overlay survives the click with its
  // input blurred and xterm's textarea focused — bare keys reach the agent
  // while the palette sits there looking ready, and Escape reaches the PTY
  // rather than the palette. verify:panels 42.
  //
  // Nothing is prevented or stopped: the click must still do its ordinary job
  // of selecting and focusing whatever it landed on, which is also why this
  // dismisses (no focus restore) rather than closing — see dismissPalette.
  //
  // Mounted on .shell, not .canvas: since M8a the top bar, rail and inspector
  // are SIBLINGS of .canvas, so a listener there never sees a click on a shell
  // control — the overlay would stay up with DOM focus on a button and every
  // bare key going to the agent. Capture phase and the explicit
  // closest('.palette') test are unchanged and still load-bearing: .palette's
  // own bubble-phase stopPropagation cannot stop an ancestor's capture
  // listener that has already run.
  const onMouseDownCapture = (event: MouseEvent<HTMLDivElement>): void => {
    if (!palette.isOpen()) return
    // Clicks INSIDE the overlay are not an exit. The .palette root's own
    // bubble-phase stopPropagation cannot help here — a capture listener on an
    // ancestor has already run by then — so the containment test is explicit.
    if ((event.target as HTMLElement | null)?.closest('.palette')) return
    palette.dismissPalette()
  }

  const onMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    // Ignore the corrected clones xterm-pointer dispatches during a selection
    // drag. Those carry CSS-pixel client coordinates measured against the
    // panel's slot — right for xterm, wrong for anything that converts a real
    // screen point to world space. They bubble through .canvas like any other
    // event, so without this the HUD's world cursor jumps for the whole drag,
    // by (1 - 1/scale) times the offset into the panel.
    if (isCorrectedEvent(event.nativeEvent)) return
    const world = toWorld(event)
    if (world) setCursor(world)
  }

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
    // prompts alone.
    const cwd = panel !== undefined && !isReviewPanel(panel)
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

  // The workspace list, reloaded after every mutation the palette's own
  // create/rename/delete commands drive below — the same "main is the only
  // side that knows what the store now says" rule reloadPresets/
  // reloadPrompts/reloadSettings already follow. It also reloads on mount
  // and on every palette open, the same two occasions the sibling lists
  // reload on below, and every row that needs `attentionIds` reads it from
  // this same state and loader rather than a second one.
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceRow[]>(EMPTY_WORKSPACES)
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

  // Named for what it holds, not for the store function it came from:
  // Task 5 imports the store's `attentionIds` read into this same scope.
  const waitingIds = useAttentionIds()

  /**
   * A review node is minted from the SUBJECT's stored baseline, asked for
   * once here and then carried inside the node — see ReviewSubject. The
   * label is snapshotted through the same honest chain the rail row walks,
   * because the panel it names may be closed long before the node is.
   */
  const openReview = useCallback((subjectId: string) => {
    const subject = panelsRef.current.find((p) => p.rect.id === subjectId)
    // A review of a review is not a thing, and the id could only reach here
    // from a row that should have been gated.
    if (subject === undefined || isReviewPanel(subject)) return
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
      if (current === undefined || isReviewPanel(current)) return
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

  // Palette actions. Everything the palette can do that needs the registry,
  // the camera, or IPC lives here — buildCommands takes callbacks precisely so
  // none of that reaches the pure layer.
  const paletteActions = useMemo<PaletteActions>(() => ({
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
    goToPanel: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
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
    insertPrompt: (id) => {
      // The panel the palette CAPTURED, not the focused one: opening the
      // palette moves DOM focus to its input, and a background click clears
      // focusedId outright.
      const target = palette.capturedId
      const body = promptBodiesRef.current.get(id)
      // A row whose body the last reload did not carry is a list that moved
      // under the user (the file was deleted while the palette was open).
      // Inserting nothing is the only honest answer; inserting the wrong
      // prompt into a running agent is not.
      if (!target || body === undefined) return
      // paste(), NEVER write(). session-factory.ts spells out the failure it
      // exists to prevent: term.paste wraps the payload in bracketed-paste
      // markers when the app has enabled them (and normalises LF to CR), so a
      // multi-line prompt arrives as ONE input. A raw write submits every
      // newline separately — pasting a five-line prompt into `claude` fires
      // off four incomplete fragments and then the tail. EVERY prompt is
      // multi-line, so every use of this feature depends on this call.
      // verify:panels 40 is the check that can tell the two apart.
      registry.get(target)?.handle.paste(body)
    },
    beginSavePrompt: () => {
      const target = palette.capturedId
      // The current SELECTION, the same call that backs Cmd+C. A deliberate
      // gesture and nothing else: capturing automatically would mean
      // retaining everything the user ever types, credentials included.
      const selection = target ? (registry.get(target)?.handle.getSelection() ?? '') : ''
      // buildCommands already disables the row without a selection; this is
      // the second half of the same rule, against a list that went stale
      // while the palette was open.
      if (!selection) return
      setInputMode({
        kind: 'text',
        label: 'Name this prompt\u2026',
        initial: '',
        submit: (name) => {
          void window.canvas.prompt.save(name, selection).then(() => setInputMode(null))
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // and the clear-on-close effect would wipe it again — the same pairing
      // beginRenamePreset makes, for the same reason.
      palette.openPalette()
    },
    deletePrompt: (id) => {
      // Confirmed for the same reason deletePreset is; see there.
      const name = promptRows.find((p) => p.id === id)?.name ?? id
      const captured = palette.capturedId
      setInputMode({
        kind: 'confirm',
        label: `Delete prompt \u201c${name}\u201d?`,
        initial: '',
        submit: () => {
          // Reloaded rather than filtered locally: main is the only side that
          // knows what the store now says, and a project prompt refuses
          // deletion there (the row is disabled, but a stale list could still
          // reach here). Reloaded against the id captured when the row RAN,
          // not against palette.capturedId at confirm time: the confirm step
          // reopens the palette, which re-captures — and re-capturing while
          // the input holds DOM focus can hand back a different panel, whose
          // project prompts are a different directory's.
          void window.canvas.prompt.remove(id).then(() => reloadPrompts(captured))
        }
      })
      palette.openPalette()
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
            // Both kinds are rebuilt, and `kind` is carried explicitly by
            // each arm rather than spread: a rename that dropped it would
            // turn a review node back into a terminal panel on the next
            // parse, which reads its absent spec and empties the canvas.
            const next: Panel[] = prev.map((p) => {
              if (p.rect.id !== id) return p
              return isReviewPanel(p)
                ? { kind: p.kind, rect: p.rect, subject: p.subject, z: p.z, title: name }
                : { kind: p.kind, rect: p.rect, spec: p.spec, z: p.z, title: name }
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
    resetCanvas: () => {
      // Main owns the confirmation dialog and the counts request. The palette
      // asks for the flow the menu item already runs rather than growing a
      // second one that could drift from it. FIRE-AND-FORGET: main returns
      // before the user answers the dialog, so this promise resolving says
      // nothing about whether a reset happened and nothing here may act on it.
      void window.canvas.canvas.requestReset()
    },
    // Cmd+0's INITIAL, which is the only camera reset useViewport exposes.
    zoomToFit: () => resetViewport(),
    toggleSetting: (id, value) => {
      // Main owns the store, so the write goes there and the row list is
      // reloaded from the answer rather than updated optimistically: an
      // optimistic row that main refused (an unknown id, a wrong type) would
      // show the new value until the next reload and then flip back.
      void window.canvas.settings.set(id, value).then(reloadSettings)
    },
    beginEditSetting: (id, label, current) => {
      // Read off the row we already loaded, rather than hardcoding 250/60000
      // (or any other bound): the schema is the single source of truth for
      // min/max, and a renderer-side constant would silently drift from it
      // the day a range changes. Absent for a row with no bound.
      const row = settingRows.find((s) => s.id === id)
      const { min, max } = row ?? {}

      // Re-entrant so an out-of-range refusal can reopen the same edit with
      // the bad value still visible, rather than starting over from `current`.
      const openEdit = (initial: string, refused?: string): void => {
        setInputMode({
          kind: 'number',
          label: refused ? `${label} (ms) — ${refused}` : `${label} (ms)…`,
          initial,
          // Set ONLY on the refusal reopen. The ordinary label above is a
          // placeholder-worthy hint ("here's the current value"); this one is
          // an answer to a question nobody asked unless they just typed
          // something wrong, and a placeholder can't show it — see
          // InputMode's `feedback` doc comment in Palette.tsx.
          ...(refused ? { feedback: true as const } : {}),
          submit: (value) => {
            const parsed = Number(value)
            // A non-number is a cancel, not a write of NaN. main's
            // setPreference would refuse NaN anyway, but bouncing it here
            // means a typo does not close the palette and silently change
            // nothing.
            if (!Number.isFinite(parsed)) {
              setInputMode(null)
              return
            }
            // Checked here too, even though main enforces the SAME bound in
            // setPreference. main's check is the last line of defence for a
            // file it did not write; it is not enough on its own, because a
            // refusal that happens only there is INVISIBLE — the palette
            // closes exactly as it does on success, SETTINGS_SET's handler
            // resolves regardless, and reloadSettings() re-fetches the
            // unchanged value with nothing anywhere saying the edit was
            // dropped. Re-opening here is what makes the refusal visible to
            // the user; it does not replace main's check, which still catches
            // a value that reached this process by some other route.
            if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
              openEdit(value, `must be ${min ?? '−∞'}–${max ?? '∞'}, got ${parsed}`)
              return
            }
            void window.canvas.settings.set(id, parsed).then(() => {
              setInputMode(null)
              reloadSettings()
            })
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command (and
        // before calling an input mode's submit), so without this the mode
        // would be set on a palette that is already gone and the
        // clear-on-close effect would wipe it — the same pairing
        // beginRenamePreset and deletePreset both make, and the reason the
        // out-of-range branch above must call openEdit (which reopens) rather
        // than just setInputMode.
        palette.openPalette()
      }

      openEdit(String(current))
    },
    switchWorkspace,
    beginCreateWorkspace: () => {
      setInputMode({
        kind: 'text',
        label: 'Name the new workspace…',
        initial: '',
        submit: (value) => {
          const name = value.trim()
          // An empty trimmed value is a cancel, not "name this workspace
          // the empty string" — parseWorkspace accepts '' and it would
          // round-trip to disk, leaving the switch row and the admin rows
          // rendering blank text with no way back to a real name short of
          // deleting the workspace.
          if (name.length === 0) {
            setInputMode(null)
            return
          }
          void window.canvas.workspace.create(name).then((id) => {
            // Create then switch, as two calls rather than one store method.
            // createWorkspace deliberately does NOT activate what it mints
            // (a create that also switched would move the user somewhere
            // they did not ask to go) — but this row is "new workspace",
            // and arriving in it IS what the user asked for. The store
            // keeps the two separable; the command composes them.
            switchWorkspace(id)
            reloadWorkspaces()
            setInputMode(null)
          }, (error: unknown) => {
            // Unhandled otherwise: void-ing this chain silences the lint,
            // not the rejection. Nothing has happened to the canvas yet at
            // this point (create runs before switch), so failing here is
            // the cheap, honest case — just tell the palette to stop
            // waiting rather than leaving it hung on a promise that will
            // never resolve.
            console.warn('[workspace] could not create workspace', name, error)
            setInputMode(null)
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without reopening, the mode would be set on a palette that is gone.
      palette.openPalette()
    },
    beginRenameWorkspace: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: 'Rename this workspace…',
        initial: currentName,
        submit: (value) => {
          const name = value.trim()
          // Same cancel rule as beginCreateWorkspace: an empty trimmed
          // value must not reach the store, or the rename "succeeds" into
          // a blank name that round-trips to disk.
          if (name.length === 0) {
            setInputMode(null)
            return
          }
          void window.canvas.workspace.rename(id, name)
            .catch((error: unknown) => {
              // Unhandled otherwise. Refused or rejected, the palette still
              // has to stop waiting — reloadWorkspaces() below reflects
              // whichever name main actually kept either way.
              console.warn('[workspace] could not rename workspace', id, error)
            })
            .finally(() => {
              reloadWorkspaces()
              setInputMode(null)
            })
        }
      })
      // Same reason beginCreateWorkspace/beginRenamePreset both do this.
      palette.openPalette()
    },
    deleteWorkspace: (id, name, panelCount) => {
      // Gated, not instant — the same reason deletePreset above is: a
      // delete row sat one Enter away from destroying a workspace's worth
      // of running agents, styled identically to "Go to n1".
      //
      // `panelCount` (commands.ts's `w.panelIds.length`) is a PANEL count,
      // not a LIVE one — three dormant, never-spawned panels would read as
      // "stop 3 running agents", which is false, in the one place a false
      // claim is worst: a destructive confirm. Recomputed honestly below,
      // before the question is ever shown, against main's own pty list
      // rather than this renderer's local registry — the same reason
      // dispose()'s own fix above exists: a panel this renderer holds no
      // PanelSession for (another workspace's, or one surviving a reload)
      // can still be genuinely running, so the registry alone would
      // undercount exactly the panels most worth warning about.
      void (async (): Promise<void> => {
        let liveCount = panelCount
        try {
          const [rows, sessions] = await Promise.all([
            window.canvas.workspace.list(),
            window.canvas.pty.list()
          ])
          const row = rows.find((w) => w.id === id)
          if (row) {
            const liveIds = new Set(sessions.map((s) => s.panelId))
            liveCount = row.panelIds.filter((pid) => liveIds.has(pid)).length
          }
        } catch (error: unknown) {
          // Failing toward the ORIGINAL (panel) count is the safe direction
          // for a destructive confirm: overstating what is about to stop is
          // the honest side of a guess to be wrong on, understating it is
          // not.
          console.warn('[workspace] could not compute a live count for delete confirm', id, error)
        }
        setInputMode({
          kind: 'confirm',
          // The count is IN the question. "Delete this workspace?" and
          // "stop 3 running agents?" are different questions, and only the
          // second one is the one actually being asked.
          label:
            liveCount > 0
              ? `Delete “${name}” and stop ${liveCount} running ${liveCount === 1 ? 'agent' : 'agents'}?`
              : `Delete “${name}”?`,
          initial: '',
          submit: () => {
            void (async (): Promise<void> => {
              try {
                const before = await window.canvas.workspace.list()
                const doomed = before.find((w) => w.id === id)
                // Re-read rather than trusting the row's captured
                // panelIds: the palette's list is a snapshot from when it
                // opened, and a panel may have been closed (or opened)
                // since.
                if (doomed) {
                  // Deleting the ACTIVE workspace: switch away BEFORE
                  // removing the record, never after. IPC.WORKSPACE_ACTIVATE's
                  // own doc comment says why — activate() writes its
                  // `outgoing` argument into whichever workspace main
                  // considers active AT THE MOMENT IT RUNS, and main's own
                  // remove() reassigns activeWorkspaceId to a neighbour the
                  // instant this record is gone. An activate() issued AFTER
                  // remove() would therefore write THIS (about-to-be-deleted)
                  // workspace's own stale panels — captured before dispose()
                  // below ever ran — into whatever main just made active,
                  // silently resurrecting a disposed panel's id there. This
                  // was caught by a failing check, not by reading the doc
                  // comment first: verify:panels 69 disposed the session
                  // correctly and then watched it reappear in the registry a
                  // moment later, reintroduced by exactly this write.
                  // Switching first means the outgoing write lands on the
                  // record actually being left — this one, which we are
                  // about to delete anyway, so it is harmless there.
                  //
                  // A workspace with no neighbour (this was the ONLY one)
                  // gets the SAME treatment, not a special one: mint a
                  // fresh replacement and switch to IT first, exactly as
                  // though it were a neighbour that already existed. The
                  // earlier shape of this branch let main's remove()
                  // install its own fresh default and switched to THAT
                  // afterward — which is the identical after-remove()
                  // mistake this comment already rules out, just with the
                  // neighbour missing rather than merely stale: the
                  // outgoing write still landed on a real, currently-active
                  // record (the fresh default) with this doomed workspace's
                  // disposed panels, resurrecting them there. 'Canvas'
                  // matches the name main's own defaultWorkspace() would
                  // have installed, so the user sees the same thing either
                  // way — the only difference is which process decided.
                  // Captured BEFORE the switch below, and out of this
                  // canvas's own panel array, because that array is the only
                  // place a KIND is knowable here: main's workspace rows
                  // carry ids and nothing else. A review node holds no
                  // PanelSession, and dispose() reaches pty.kill regardless
                  // (see the loop's own comment), so an unguarded node id
                  // here sends a kill for a panel that never had a session
                  // and drops the baseline of whatever panel recycles that
                  // id. Positive test, as everywhere else.
                  //
                  // Honest about its reach: this covers the ACTIVE
                  // workspace, which is the only one whose panels this
                  // renderer holds objects for. Deleting a HIDDEN workspace
                  // that contains a review node still sends that stray kill
                  // — harmless in the same way it was harmless everywhere
                  // before this guard (main tolerates destroying a session it
                  // never spawned), and closable only by teaching
                  // WORKSPACE_LIST to carry a kind, which is a channel
                  // change this milestone did not scope.
                  const doomedReviewIds = doomed.active
                    ? new Set(panelsRef.current.filter(isReviewPanel).map((p) => p.rect.id))
                    : new Set<string>()
                  let target = before.find((w) => w.id !== id)
                  if (doomed.active && !target) {
                    const freshId = await window.canvas.workspace.create('Canvas')
                    target = { id: freshId, name: 'Canvas', panelIds: [], active: false }
                  }
                  if (doomed.active && target) switchWorkspace(target.id)
                  for (const panelId of doomed.panelIds) {
                    // THE FOURTH registry.dispose CALL SITE in this file
                    // (after onClosePanel, applyHistory and onReset). It
                    // adds no caller of pty.kill: dispose(id) and
                    // disposeAll() remain the only two inside
                    // session-registry.ts, and routing through dispose()
                    // rather than reaching for pty.kill directly is exactly
                    // what has kept that count true across four milestones.
                    //
                    // Disposing rather than detaching is deliberate. The
                    // workspace RECORD is going, so a surviving session is
                    // one no UI can ever reach or stop again — the backlog
                    // item for recovering an orphan session does not exist
                    // — which means an agent would burn tokens invisibly
                    // until quit kill-servers the whole tmux socket. This
                    // holds even for a panelId this renderer has no LOCAL
                    // PanelSession for (a hidden workspace's own panel, or
                    // one surviving a reload): dispose()'s own fix sends
                    // pty.kill regardless, mirroring main's PtyManager.kill.
                    // And, like the reset and undo loops, it skips a review
                    // node's id — see doomedReviewIds above for what the skip
                    // buys and exactly how far it reaches.
                    if (doomedReviewIds.has(panelId)) continue
                    registry.dispose(panelId)
                    clearAgentState(panelId)
                    clearLiveSession(panelId)
                  }
                }
                await window.canvas.workspace.remove(id)
              } catch (error: unknown) {
                // Unhandled otherwise. By the time any of these awaits could
                // reject, the sessions above may already be disposed — the
                // worst case this action's brief calls out — so silence here
                // would strand the user on a canvas full of dead panels with
                // no path back and nothing in any log.
                console.warn('[workspace] could not delete workspace', id, error)
              } finally {
                reloadWorkspaces()
                setInputMode(null)
              }
            })()
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command, so
        // without reopening, the mode would be set on a palette that is
        // gone. Reopened here rather than before the count above, since
        // this whole function is now async: opening early would show a
        // confirm whose wording changes a beat later, which reads as the
        // dialog glitching rather than as a deliberate wait.
        palette.openPalette()
      })()
    },
    // Not a new dispose call site — this IS onClosePanel, the one the panel's
    // own × already uses. See PaletteActions.closePanel for why it is reached
    // through this object rather than closed over directly by the rail.
    closePanel: (id) => onClosePanel(id),
    // The wake path, and deliberately not what a row CLICK does. See
    // PaletteActions.startPanel.
    startPanel: (id) => onSelectPanel(id),
    savePanelAsPreset: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      // Nothing to save for a review node: it has no spec, and the preset it
      // would produce is a shell in a directory it never named.
      if (!panel || isReviewPanel(panel)) return
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
      void window.canvas.preset.savePanel(captured).then(reloadPresets)
    },
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
    restartPanel: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      // A review node has no process to restart. The isRestartable gate below
      // would refuse it anyway (it holds no session, so its status is
      // undefined), but the narrowing has to happen before `panel.spec` is
      // read at all.
      if (!panel || isReviewPanel(panel)) return
      // The same gate the Restart row and the inspector button render, read
      // from the same function rather than re-expressed here: a verb that
      // acted on a never-started panel would end a process that does not
      // exist and then ensure a session the user never asked to start —
      // waking a panel from a verb whose name says the opposite.
      if (!isRestartable(registry.get(id)?.status)) return
      clearAgentState(id)
      clearLiveSession(id)
      void registry.dispose(id).then(() => {
        // RE-CHECKED, never captured: the await is a real gap and the panel
        // can be closed inside it (the × and the rail's close control are
        // both one click away). Re-ensuring a closed panel would mint a
        // session no UI can ever reach or stop again — the orphan dispose()'s
        // own comment exists to prevent, arriving through a new door.
        if (!panelsRef.current.some((p) => p.rect.id === id)) return
        registry.ensure(id, panel.spec, { dormant: false })
        // TOUCH, then bump. Both are deliberate and neither substitutes for
        // the other. ensure() mints the new session at lastFocusedAt 0, and
        // assignTiers fills its LIVE_BUDGET slots in lastFocusedAt order — so
        // without the stamp the restarted panel joins at the BACK of the
        // eviction queue and is the first candidate denied a slot on a canvas
        // already at budget. attachSlot is the ONLY caller of spawn(), so a
        // denied slot means this verb killed and never respawned. The reach is
        // ordinary, not theoretical: the inspector acts on selectedId, and the
        // rail's row click selects WITHOUT focusing, so "pick a panel in the
        // rail, press Restart" is exactly the gesture that lands here.
        //
        // touch bumps too, so the bumpVersion below is nominally redundant —
        // it is kept because the re-render is a SEPARATE requirement with its
        // own reason (see this verb's doc comment), and leaning on a member
        // named for the eviction queue to also supply it would make a silent
        // blank panel the cost of ever reordering these two lines. The two
        // notifications land in one synchronous block and React batches them.
        registry.touch(id)
        registry.bumpVersion()
        // NOT registry.focus(id), and the residue is recorded rather than
        // papered over. When the palette drove this restart, runRow already
        // called restoreFocus(capturedId) -> handle.focus() on the very handle
        // dispose() then destroyed, so DOM focus is on <body> and the next
        // keystroke goes nowhere until the user clicks the panel — the same
        // silent failure usePalette's rule 4 exists to prevent. focus(id)
        // CANNOT fix it from here: the session was re-ensured at tier 'card'
        // one line ago, and focus() only calls handle.focus() on a LIVE
        // session, so the call would stamp, bump, and move no keyboard at all
        // — a line that reads as a fix and is not one. The new handle cannot
        // take focus until React has mounted its slot and attachSlot() has
        // opened it, which is at minimum a render away and is not guaranteed
        // to happen at all (see the off-screen residue in CLAUDE.md). Landing
        // it needs the REGISTRY to own a one-shot "focus on next attach",
        // consumed inside attachSlot; that is a deliberate design decision,
        // not a line to sneak into a fix wave.
      })
    },
    openReview
  }), [resetViewport, centreOn, selectAndRaise, presetRows, promptRows, reloadPresets,
       palette.openPalette, palette.capturedId, reloadPrompts, commitHistory,
       reloadSettings, settingRows, switchWorkspace, reloadWorkspaces,
       onClosePanel, onSelectPanel, openReview])

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

  // Keyed on palette.open and read out of panelsRef, NOT on `panels`. `panels`
  // is a fresh array on every setPanelRect, i.e. every frame of a drag — and
  // this array flows into Palette.tsx's `commands` memo, whose [rows] effect
  // re-seats the selected row. Tracking it would re-seat the palette's
  // selection at 60Hz behind a drag, the same silent-selection-move defect
  // "resetViewport must stay a useCallback" documents one file over. The list
  // is only ever looked at while the overlay is up, and the commands that add
  // or remove a panel close it first, so recomputing at open is enough.
  const panelRows = useMemo<PanelRow[]>(
    () => (palette.open
      ? panelsRef.current.map((p) =>
          // Field-by-field, not a spread: an untitled panel must produce a
          // row with NO `title` key, not one holding `title: undefined`.
          // Renderer-internal only (no structured clone here to carry the
          // undefined across), but this is the one rule the rest of the
          // branch is careful about everywhere else — stay consistent.
          // `restartable` is on BOTH branches, not folded in afterwards: the
          // branch exists only so an untitled panel gets no `title` key at
          // all, and a required field added to one arm and forgotten on the
          // other is a compile error rather than a silently always-disabled
          // row — which is why PanelRow.restartable is required.
          //
          // It is also the first field here derived from a panel's STATUS
          // rather than from its spec, so it inherits this memo's tradeoff:
          // computed once when the palette opens, and not recomputed if a
          // spawn lands while the overlay is up. That is deliberate, not an
          // oversight — the alternative is a dependency on registry.version(),
          // which changes on every tier/status/focus/exit and would re-seat
          // the palette's selected row underneath the user, the defect
          // "The palette's selection moves only when the user moves it"
          // exists to prevent. The cost is one stale row for a panel whose
          // pty:create resolved during the moment the palette was open; the
          // inspector, which has no such constraint, is always current.
          p.title !== undefined
            ? {
                id: p.rect.id,
                label: panelLabel(p),
                title: p.title,
                restartable: isReviewPanel(p) ? false : isRestartable(registry.get(p.rect.id)?.status)
              }
            : {
                id: p.rect.id,
                label: panelLabel(p),
                restartable: isReviewPanel(p) ? false : isRestartable(registry.get(p.rect.id)?.status)
              }
        )
      : EMPTY_PANELS),
    [palette.open]
  )

  /**
   * The rail's rows, and the one defence that makes an always-open list
   * affordable.
   *
   * `panels` is a fresh array on every setPanelRect — i.e. every frame of a
   * drag. `panelRows` above escapes that by keying on `palette.open` and
   * reading panelsRef, which works only because the palette is a surface that
   * is usually closed. The rail has no such escape: it is never closed. So the
   * rows are rebuilt on EVERY render (cheap — N panels, no IO, no allocation
   * that matters) and their ARRAY IDENTITY is then frozen on a signature of
   * only the fields a row renders. A drag moves rects, the signature is
   * byte-identical, `railRows` keeps its identity, and memo'd SideRail and
   * RailPanelRow re-render nothing.
   *
   * The dep array is the SIGNATURE, not `railBuilt`, and that is the whole
   * mechanism rather than a lint workaround: when the signature is equal,
   * `railBuilt` is equal by construction, so returning the previous array is
   * not a stale read.
   *
   * The status is read straight off the registry rather than from React state,
   * the same way TerminalPanel reads it. `version` — already in this render —
   * is what makes a status change (idle -> running, with a pid) re-run this at
   * all; registry.version() bumps on tier/status/focus/exit and nothing
   * higher-frequency, which is exactly the rate the rail wants.
   */
  // The full `panels` array, not `terminalPanels`: a review node is a Panel
  // like any other, and railLabel/railTail/buildRailRows now branch on kind
  // themselves (M9b's shell task) — an off-screen node has to stay reachable
  // from the rail for the identical reason M8b's rows exist at all.
  const railBuilt = buildRailRows(panels, (id) => registry.get(id)?.status, dormantIds)
  const railSig = railSignature(railBuilt)
  const railRows = useMemo(() => railBuilt, [railSig])

  /**
   * The rail's Workspaces section, frozen the same way its rows are — against a
   * different volatile input. There is no rect here: what churns is IDENTITY,
   * because reloadWorkspaces() hands back a brand-new array of brand-new
   * objects on every occasion it runs — every workspace mutation and every
   * workspace switch, plus mount, and every change to the panel COUNT. Without
   * the freeze, SideRail's memo is defeated by a reload that changed nothing at
   * all.
   *
   * That freeze is also the answer to "why is it safe to reload this often".
   * The panel-count reload (declared with its siblings above) fires on every
   * spawn and every close, and when nothing about any workspace actually
   * changed the signature is byte-identical, this useMemo hands back the
   * previous array, and SideRail re-renders nothing. The cost is one IPC round
   * trip per spawn or close and no render churn at all.
   *
   * `waitingIds` is the same live attention set the pips and the inspector
   * summary read — it changes only when MEMBERSHIP changes (syncAttention
   * notifies on nothing else), so a chatty agent's busy/idle churn never
   * reaches this at all.
   */
  const workspaceBuilt = buildWorkspaceRows(workspaceRows, waitingIds)
  const workspaceSig = workspaceSignature(workspaceBuilt)
  const railWorkspaces = useMemo(() => workspaceBuilt, [workspaceSig])

  /**
   * The attention queue, frozen like every other list this rail renders.
   *
   * Built from `railBuilt` — the CURRENT rows, not the frozen `railRows` — so
   * the two are read in one pass; they are equal whenever the signature is,
   * and reading the fresh one keeps the dependency obvious rather than subtle.
   *
   * Passing the built ROWS rather than `panels` is what gives the phantom
   * filter and the shared label in one operation: an id with no panel row is
   * an orphan (agent state survives a panel's closure by design) and must not
   * become a row that navigates nowhere.
   */
  const attentionBuilt = buildAttentionRows(waitingIds, railBuilt)
  const attentionSig = attentionSignature(attentionBuilt)
  const railAttention = useMemo(() => attentionBuilt, [attentionSig])

  /**
   * The inspector's model, frozen the same way the rail's rows are and for the
   * same reason: the selected panel comes straight out of `panels`, a fresh
   * array on every setPanelRect — i.e. every frame of a drag — and this pane
   * renders nothing about a rect.
   *
   * The dep array is the SIGNATURE, not the model: when the signature is
   * equal, the model is equal by construction, so returning the previous
   * object is not a stale read.
   */
  const selectedPanel = selectedId === null
    ? undefined
    : panels.find((p) => p.rect.id === selectedId)
  // buildInspectorModel now branches on kind itself (M9b's shell task), so a
  // selected review node gets a real model — its own fields, Restart and
  // Save-as-preset disabled with a reason — rather than the pane's empty
  // state. The empty selection stays a first-class state (verify:rail 27b)
  // for the genuinely-no-selection case.
  // Unconditional and above the ternary: a hook cannot live inside a
  // conditional, and `selectedId ?? ''` is a panel id that matches nothing,
  // which the store answers undefined for.
  const selectedLive = useLiveSession(selectedId ?? '')
  const inspectorBuilt = selectedPanel === undefined
    ? null
    : buildInspectorModel(
        selectedPanel,
        registry.get(selectedPanel.rect.id)?.status,
        selectedLive
      )
  const inspectorSig = inspectorSignature(inspectorBuilt)
  const inspectorModel = useMemo(() => inspectorBuilt, [inspectorSig])
  // A BOOLEAN, never `selectedPanel` itself, and that is the whole reason it
  // is derived here instead of inside the effect: `panels` is a fresh array on
  // every setPanelRect, so `selectedPanel` is a fresh find() result on every
  // frame of a drag, and putting it in the dep array below would re-fire the
  // query — and its git subprocesses — at 60Hz. A boolean is equal to itself.
  const selectedIsReview = selectedPanel !== undefined && isReviewPanel(selectedPanel)

  // The Changes section's own data, queried through review:panel rather than
  // computed here — the engine (main-side, real git) is the sole authority,
  // the same "no second author of a fact one side already derives correctly"
  // rule M6d and M7 both state in CLAUDE.md.
  const [review, setReview] = useState<ReviewFieldModel | null>(null)
  const selectedAgentState = useAgentState(selectedId ?? '')

  // A COUNTER of idle ARRIVALS, not the state itself. The review effect used
  // to depend on `selectedAgentState` wholesale, so `starting`, `busy`,
  // `idle`, `wants-you` and `exited` each re-fired it — up to four git
  // subprocesses per transition, on a path a chatty agent walks constantly —
  // while the spec and IPC.REVIEW_PANEL's own comment both name exactly one
  // useful signal: the transition TO `idle`, which means "this agent stopped
  // producing output" and is therefore the moment its work is worth
  // re-reading. Depending on a derived `state === 'idle'` boolean would not
  // do: it changes on the way OUT of idle too, which is a firing with nothing
  // new to read.
  const [idleArrivals, setIdleArrivals] = useState(0)
  const prevAgentRef = useRef<{ id: string | null; state: string | undefined }>({
    id: null,
    state: undefined
  })
  useEffect(() => {
    const prev = prevAgentRef.current
    prevAgentRef.current = { id: selectedId, state: selectedAgentState }
    // Only a transition WITHIN one panel's own selection. Across a selection
    // change the id has already re-fired the review effect below, and
    // counting it again would spend a second round of git processes to learn
    // the same answer.
    if (prev.id === selectedId && selectedAgentState === 'idle' && prev.state !== 'idle') {
      setIdleArrivals((n) => n + 1)
    }
  }, [selectedId, selectedAgentState])

  useEffect(() => {
    // Cleared UNCONDITIONALLY, before the invoke, not only when the selection
    // goes to null. The `live` flag below prevents a stale WRITE; nothing
    // prevented the stale RENDER, so selecting panel B kept panel A's model —
    // a real file list, with real counts — under B's heading for an IPC round
    // trip plus up to four git subprocesses, which is plainly visible on a
    // real repository. That is the confident wrong attribution this milestone
    // exists to prevent, arriving from the renderer rather than from git.
    // verify:panels 100b.
    setReview(null)
    // A review NODE is skipped outright, leaving `review` null so the Changes
    // section never renders for it. Main holds no baseline for a node's own
    // id, so the engine answers `never-started` — a perfectly correct answer
    // to a question nobody should be asking — and the pane rendered "this
    // panel has no session yet" under a heading for a panel that will never
    // have one, plus an Open-review button whose handler refuses a node as a
    // subject and returns. Both are one wrong query, not two bugs.
    // verify:panels 112.
    if (selectedId === null || selectedIsReview) return
    let live = true
    void window.canvas.review.panel(selectedId).then((result) => {
      // The guard is not defensiveness: an invoke issued for panel A can
      // resolve AFTER the user has selected panel B, and writing it then
      // would show A's changes under B's name — the same wrong-panel
      // attribution, from the other direction.
      if (live) setReview(buildReviewFields(result))
    })
    return () => { live = false }
  }, [selectedId, selectedIsReview, idleArrivals])
  const reviewSig = reviewSignature(review)
  // Frozen on reviewSignature for the identical reason inspectorModel is
  // frozen on inspectorSig above: buildReviewFields returns a fresh object on
  // six of its eight arms, and an unfrozen prop here defeats Inspector's memo
  // outright — see Inspector.tsx's own doc comment.
  const reviewModel = useMemo(() => review, [reviewSig])

  // Frozen on its three numbers for the same reason: a fresh object every
  // render defeats Inspector's memo on its own, whatever the model does.
  const summaryBuilt = buildInspectorSummary(
    panels, (id) => registry.get(id)?.status, waitingIds)
  const summarySig = `${summaryBuilt.panels}/${summaryBuilt.running}/${summaryBuilt.waiting}`
  const inspectorSummary = useMemo(() => summaryBuilt, [summarySig])

  // Cheap, and read once per render of the palette: getSelection() is a string
  // copy out of xterm's buffer, not a repaint.
  const hasSelection = (): boolean => {
    const id = palette.capturedId
    return id !== null && (registry.get(id)?.handle.getSelection() ?? '') !== ''
  }

  return (
    <div
      className={`shell${chrome.railOpen ? '' : ' shell--rail-collapsed'}${
        chrome.inspectorOpen ? '' : ' shell--inspector-collapsed'}`}
      onMouseDownCapture={onMouseDownCapture}
    >
      <TopBar
        presets={presetRows}
        scale={viewport.scale}
        onSpawnPreset={paletteActions.spawnPreset}
        onZoomBy={zoomBy}
        onFit={fitAll}
        onSearch={palette.openPalette}
        onSettings={openSettingsScope}
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
      <div
        className="canvas"
        ref={hostRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
        <div
          className="world"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
        >
          {panels.map((panel) => {
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
                />
              )
            }
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
              />
            )
          })}
        </div>
        {pipsEnabled && (
          <EdgeIndicators rects={rects} viewport={viewport} ids={waitingIds} />
        )}
        <CanvasHud viewport={viewport} cursor={cursor} selectedId={selectedId} backend={backendInfo} />
        {palette.open && (
          <Palette
            controller={palette}
            actions={paletteActions}
            presets={presetRows}
            prompts={promptRows}
            panels={panelRows}
            settings={settingRows}
            workspaces={workspaceRows}
            // The renderer's own attention set (agent-state-store.ts), not a
            // second derivation: main never learns "which panels are
            // wants-you" as a set, only individual agent:state transitions,
            // and asking it to recompute one here would make it a second
            // author of a fact this side already folds correctly.
            attentionIds={waitingIds}
            hasSelection={hasSelection()}
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
        review={reviewModel}
      />
    </div>
  )
}
