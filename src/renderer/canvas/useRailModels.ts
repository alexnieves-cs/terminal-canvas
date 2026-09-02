import { useMemo, type RefObject } from 'react'
import type { Viewport } from './viewport'
import { orderPanels } from './spatial-order'
import type { Registry } from '@renderer/session/session-registry'
import { useLiveSession } from '@renderer/session/live-session-store'
import { useUsage } from '@renderer/session/usage-store'
import { isFilePanel, isTerminalPanel, type Panel } from '@renderer/panels/panels'
import { panelState, statePriority } from '@renderer/panels/panel-state'
import { getAgentState } from '@renderer/session/agent-state-store'
import { panelName, panelPath } from '@renderer/palette/panel-name'
import type { PanelRow } from '@renderer/palette/commands'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { WorkspaceRow } from '@shared/ipc-contract'
import { buildRailRows, railSignature } from '../shell/rail-rows'
import {
  attentionSignature, buildAttentionRows, buildWorkspaceRows, workspaceSignature
} from '../shell/rail-sections'
import {
  buildInspectorModel, inspectorSignature, isRestartable
} from '../shell/inspector-fields'
import { EMPTY_PANELS, panelLabel } from './canvas-constants'

export interface RailModelsDeps {
  registry: Registry
  palette: PaletteController
  /** Read out of a ref, never off `panels` — see panelRows' own comment. */
  panelsRef: RefObject<Panel[]>
  viewportRef: RefObject<Viewport>
  panels: Panel[]
  displayPanels: Panel[]
  dormantIds: ReadonlySet<string>
  workspaceRows: WorkspaceRow[]
  waitingIds: readonly string[]
  selectedId: string | null
  /** M49. The global terminal font size, for the inspector's Detail field. */
  globalFontSize: number
}

/**
 * The derived models the side rail and the inspector render from.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split). Every
 * model here is a `built` value, a `signature` STRING derived from it, and a
 * `useMemo` keyed on that signature — the shape that freezes an array's
 * IDENTITY while its inputs churn. `panels` is a fresh array on every
 * `setPanelRect`, i.e. every frame of a drag, and none of these panes render
 * anything about a rect; without the signature freeze each would re-render at
 * 60Hz behind a drag. The signatures are `JSON.stringify`-based rather than
 * separator-joined for a reason `verify:rail` 14 pins: a user's own panel
 * title is free to contain any separator, and could otherwise forge a field
 * boundary and freeze the rail on stale rows.
 *
 * Keep the built/signature/memo triple intact when editing any of these. A
 * memo keyed on the built object rather than its signature is the same code
 * with the freeze silently removed.
 */
/**
 * M64. The Go-to row's name, path and state word. Computed once when the
 * palette opens, like `restartable`: the row's state may go stale while the
 * overlay is up, which is the same accepted trade — recomputing on
 * registry.version() would re-seat the selected row under the user.
 */
function findingFields(p: Panel, registry: Registry, dormantIds: ReadonlySet<string>): { name: string; path?: string; stateWord: string; statePriority: number } {
  const status = registry.get(p.rect.id)?.status
  const resolved = status?.kind === 'running' ? status.command : undefined
  const tailKind = isFilePanel(p) && p.source.prose === true ? 'note' : p.kind
  const { word } = panelState({ kind: tailKind, status, dormant: isTerminalPanel(p) && dormantIds.has(p.rect.id) }, getAgentState(p.rect.id))
  const path = panelPath(p)
  return { name: panelName(p, resolved), ...(path === undefined ? {} : { path }), stateWord: word, statePriority: statePriority(word) }
}

function orderPanelsFor(panels: Panel[], viewport: Viewport | null, lastFocusedAt: Record<string, number>): Panel[] {
  if (viewport === null) return panels
  const byId = new Map(panels.map((p) => [p.rect.id, p]))
  const order = orderPanels(panels.map((p) => p.rect), viewport, { w: window.innerWidth, h: window.innerHeight }, lastFocusedAt)
  const out: Panel[] = []
  for (const id of order) { const p = byId.get(id); if (p !== undefined) out.push(p) }
  return out
}

export function useRailModels(deps: RailModelsDeps) {
  const {
    registry, palette, panelsRef, panels, displayPanels, dormantIds,
    workspaceRows, waitingIds, selectedId, viewportRef, globalFontSize } = deps

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
      // M44. Spatial order: on-screen panels first (nearest the camera centre),
      // then the rest by focus recency. Computed once on open, reading refs.
      ? orderPanelsFor(panelsRef.current, viewportRef.current, registry.lastFocusedAt()).map((p) =>
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
                kind: p.kind,
                ...(isTerminalPanel(p) && p.fontSize !== undefined ? { fontSize: p.fontSize } : {}),
                title: p.title,
                restartable: isTerminalPanel(p) ? isRestartable(registry.get(p.rect.id)?.status) : false,
                // M20. From the SESSION's spec, like everything else that
                // reports what a panel is actually running.
                agent: registry.get(p.rect.id)?.spec.agent !== undefined,
                ...findingFields(p, registry, dormantIds)
              }
            : {
                id: p.rect.id,
                label: panelLabel(p),
                kind: p.kind,
                ...(isTerminalPanel(p) && p.fontSize !== undefined ? { fontSize: p.fontSize } : {}),
                restartable: isTerminalPanel(p) ? isRestartable(registry.get(p.rect.id)?.status) : false,
                agent: registry.get(p.rect.id)?.spec.agent !== undefined,
                ...findingFields(p, registry, dormantIds)
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
  // displayPanels, not `panels`: while merged the rail is the only surface
  // that can name a foreign panel at all, and a rail listing this workspace's
  // panels beside a canvas showing everyone's would be the two disagreeing on
  // screen at once. goToPanel reads the same array, which is what keeps every
  // row it renders navigable.
  const railBuilt = buildRailRows(displayPanels, (id) => registry.get(id)?.status, dormantIds)
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
  // M15. Unconditional and above the ternary for the same reason
  // useLiveSession is: a hook cannot live inside a conditional, and
  // `selectedId ?? ''` is a panel id that matches nothing, which the store
  // answers undefined for.
  const selectedUsage = useUsage(selectedId ?? '')
  const inspectorBuilt = selectedPanel === undefined
    ? null
    : buildInspectorModel(
        selectedPanel,
        registry.get(selectedPanel.rect.id)?.status,
        selectedLive,
        // M13. The whole panel list, so the Links section can name the other
        // end of each link and drop one whose other end is not on this canvas.
        // The parameter is optional and this is its only production caller;
        // omitting it renders an always-empty section that looks like a
        // feature nobody built.
        panels,
        // M15. The Cost section's data. Optional and this is its only
        // production caller, the same trade `live` and `panels` made.
        selectedUsage,
        // M20. The SESSION's knobs, never selectedPanel.spec.agentOptions.
        // registry.ensure returns an existing session unchanged, so the
        // session's spec is what actually reached pty.create while the panel's
        // is merely what this canvas currently holds — and a pane that read the
        // panel could claim a permission mode the running agent is not in.
        registry.get(selectedPanel.rect.id)?.spec.agentOptions,
        // M49. The effective font size and whose it is.
        isTerminalPanel(selectedPanel)
          ? { fontSize: selectedPanel.fontSize ?? globalFontSize, isDefault: selectedPanel.fontSize === undefined }
          : undefined,
        // M63. Asleep is the one state the status cannot say.
        dormantIds.has(selectedPanel.rect.id)
      )
  const inspectorSig = inspectorSignature(inspectorBuilt)
  const inspectorModel = useMemo(() => inspectorBuilt, [inspectorSig])
  // A BOOLEAN, never `selectedPanel` itself, and that is the whole reason it
  // is derived here instead of inside the effect: `panels` is a fresh array on
  // every setPanelRect, so `selectedPanel` is a fresh find() result on every
  // frame of a drag, and putting it in the dep array below would re-fire the
  // query — and its git subprocesses — at 60Hz. A boolean is equal to itself.
  // Every SESSIONLESS kind, not only review nodes. Main holds no baseline for
  // a panel that never spawned, so the engine answers `never-started` for a
  // file panel too — a perfectly correct answer to a question nobody should be
  // asking, rendered as "this panel has no session yet" under a heading for a
  // panel that will never have one, above an Open-review button whose handler
  // refuses it and returns. One wrong query, both defects; see verify:panels
  // 112, which pins the review node's half of exactly this.
  const selectedIsSessionless = selectedPanel !== undefined && !isTerminalPanel(selectedPanel)

  return {
    panelRows, railRows, railWorkspaces, railAttention,
    selectedPanel, selectedLive, inspectorModel, selectedIsSessionless
  }
}
