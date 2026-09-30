import type { PersistedWorkItem } from '@shared/work-items'
import { carryBackend } from '@shared/agent-backends'
import { useMemo, type RefObject } from 'react'
import { useChat, getChat } from '@renderer/chat/chat-store'
import { chatStateInput, chatHasRun, deliveredUserTurns } from '@renderer/chat/chat-model'
import type { ChatStateInput } from '@renderer/panels/panel-state'
import type { Viewport } from './viewport'
import { orderPanels } from './spatial-order'
import type { Registry } from '@renderer/session/session-registry'
import { useLiveSession } from '@renderer/session/live-session-store'
import { useUsage } from '@renderer/session/usage-store'
import { isFilePanel, isShapePanel, isTerminalPanel, type Panel, isChatPanel, isWatcherPanel, isWorkPanel, isImagePanel } from '@renderer/panels/panels'
import { panelState, type StateInput } from '@renderer/panels/panel-state'
import { getAgentState } from '@renderer/session/agent-state-store'
import { watchStateInput } from '@renderer/watcher/watcher-store'
import { panelName, panelPath } from '@renderer/palette/panel-name'
import { REASON_CHAT_NO_BASELINE, type PanelRow } from '@renderer/palette/commands'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { WorkspaceRow } from '@shared/ipc-contract'
import type { WorkItemState } from '@shared/work-items'
import { buildRailRows, railSignature } from '../shell/rail-rows'
import {
  attentionSignature, buildAttentionRows, buildElsewhereRows, buildWorkspaceRows, workspaceSignature, type PendingApproval
} from '../shell/rail-sections'
import { useApprovals } from '@renderer/chat/chat-store'
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
  /** M116. A work card's item state by item id; absent when the board is empty. See buildRailRows. */
  workStateOf?: (itemId: string) => WorkItemState | undefined
  /** M133. A workflow trigger's template name by id — the rail row and the pane both read it. */
  templateNameOf?: (templateId: string) => string | undefined
  /** M266. Teammate display name by id — chat silhouette leads on the rail and Go-to. */
  teammateNameOf?: (teammateId: string) => string | undefined
  /** M401 (B2). A panel's settled task outcome by panel id. See buildRailRows. */
  outcomeOf?: (panelId: string) => string | undefined
  /** M252. The workflow's record by id, for the inspector's reach and read fields. */
  templateOf?: (templateId: string) => import('@shared/templates').PersistedTemplate | undefined
  /** M116. The record itself, for the inspector's five facts. */
  workItemOf?: (itemId: string) => PersistedWorkItem | undefined
  /**
   * M196 (D04). The app's worktree records, so the inspector can name the
   * repository behind a dispatched conversation's lane. Optional and this is
   * its only production caller — omitting it renders no lane field at all,
   * which is right for a canvas that has no lanes and wrong for one that has.
   */
  lanes?: readonly { path: string; root: string; branch?: string }[]
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
 * M64. The Go-to row's name, path and state input. Built when the palette
 * opens (this memo is keyed on palette.open, like `restartable`); the WORD
 * the row shows is rendered live by the palette from `state` and the store,
 * so a panel that flips to needs-you while the overlay is up still reads
 * needs-you. Only the `state:` query's ORDER uses the build-time word.
 */
function findingFields(p: Panel, registry: Registry, dormantIds: ReadonlySet<string>, teammateNameOf?: (id: string) => string | undefined): { name: string; path?: string; state: StateInput; stateWord: string } {
  const status = registry.get(p.rect.id)?.status
  const resolved = status?.kind === 'running' ? status.command : undefined
  const tailKind = isFilePanel(p) && p.source.prose === true ? 'note' : p.kind
  const state: StateInput = { kind: tailKind, status, dormant: isTerminalPanel(p) && dormantIds.has(p.rect.id), ...(isWatcherPanel(p) ? { watch: watchStateInput(p.rect.id) } : {}) }
  const { word } = panelState(state, getAgentState(p.rect.id))
  const path = panelPath(p)
  const teammateName = isChatPanel(p) && p.chat.teammateId !== undefined && teammateNameOf !== undefined
    ? teammateNameOf(p.chat.teammateId)
    : undefined
  return { name: panelName(p, resolved, teammateName === undefined ? undefined : { teammateName }), ...(path === undefined ? {} : { path }), state, stateWord: word }
}

function orderPanelsFor(panels: Panel[], viewport: Viewport | null, lastFocusedAt: Record<string, number>): Panel[] {
  if (viewport === null) return panels
  const byId = new Map(panels.map((p) => [p.rect.id, p]))
  const order = orderPanels(panels.map((p) => p.rect), viewport, { w: window.innerWidth, h: window.innerHeight }, lastFocusedAt)
  const out: Panel[] = []
  for (const id of order) { const p = byId.get(id); if (p !== undefined) out.push(p) }
  return out
}

/**
 * M74. What the two front-end rows need from a CHAT panel: whether a turn is
 * in flight and how many turns it holds — read once at palette open, like
 * every other row field, from the chat store's mirror.
 */
/**
 * M77. `Open review`'s gate per kind: a terminal's is restartable (absent here
 * so the row falls back to it); a chat's is "its agent has run" — a completed
 * turn in the transcript or a process alive — with its own reason otherwise.
 */
function reviewFields(p: Panel): { reviewable?: boolean; reviewReason?: string } {
  if (!isChatPanel(p)) return {}
  return chatHasRun(getChat(p.rect.id)) ? { reviewable: true } : { reviewable: false, reviewReason: REASON_CHAT_NO_BASELINE }
}

function frontEndFields(p: Panel): { busy?: boolean; turns?: number } {
  if (!isChatPanel(p)) return {}
  const chat = getChat(p.rect.id)
  return {
    busy: chat.snapshot !== null && (chat.snapshot.status === 'streaming' || chat.snapshot.pending.length > 0),
    ...carryBackend(p.chat),
    ...(p.chat.teammateId === undefined ? {} : { teammateId: p.chat.teammateId }),
    // M97. Absent unless a run is live or just resolved — the palette's Auto rows read it.
    ...(chat.snapshot?.auto === undefined ? {} : { auto: chat.snapshot.auto }),
    turns: deliveredUserTurns(chat.turns)
  }
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
      ? orderPanelsFor(panelsRef.current.filter((p) => !isShapePanel(p)), viewportRef.current, registry.lastFocusedAt()).map((p) =>
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
                // M92. Layout facts on the row, absent unless set.
                ...(p.locked === true ? { locked: true } : {}),
                ...(p.pinned === true ? { pinned: true } : {}),
                ...(p.maximised === undefined ? {} : { maximised: true }),
                ...reviewFields(p),
                // M20. From the SESSION's spec, like everything else that
                // reports what a panel is actually running.
                agent: registry.get(p.rect.id)?.spec.agent !== undefined,
                claude: registry.get(p.rect.id)?.spec.agent === 'claude-code',
                // M112 (review round 1, CRITICAL 2). Same pattern as `agent`
                // one line up: read off the session, passed in as plain data.
                spawned: registry.get(p.rect.id)?.spawned === true,
                ...frontEndFields(p),
                ...findingFields(p, registry, dormantIds, deps.teammateNameOf)
              }
            : {
                id: p.rect.id,
                label: panelLabel(p),
                kind: p.kind,
                ...(isTerminalPanel(p) && p.fontSize !== undefined ? { fontSize: p.fontSize } : {}),
                restartable: isTerminalPanel(p) ? isRestartable(registry.get(p.rect.id)?.status) : false,
                // M92. Layout facts on the row, absent unless set.
                ...(p.locked === true ? { locked: true } : {}),
                ...(p.pinned === true ? { pinned: true } : {}),
                ...(p.maximised === undefined ? {} : { maximised: true }),
                ...reviewFields(p),
                agent: registry.get(p.rect.id)?.spec.agent !== undefined,
                spawned: registry.get(p.rect.id)?.spawned === true,
                ...frontEndFields(p),
                ...findingFields(p, registry, dormantIds, deps.teammateNameOf)
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
  // M388. Shapes are not rail rows (ledger D8): a chart is many marks on the
  // canvas, like ink and labels, and 200 rows would bury every agent. They are
  // found on the canvas and through their chart, never one row each.
  const railBuilt = buildRailRows(displayPanels.filter((p) => !isShapePanel(p)), (id) => registry.get(id)?.status, dormantIds, deps.workStateOf, deps.templateNameOf, deps.teammateNameOf, deps.outcomeOf)
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
  // M76. The pending requests ride the rows so the popover can answer them.
  const pendingApprovals = useApprovals()
  const attentionBuilt = buildAttentionRows(waitingIds, railBuilt, pendingApprovals)
  const attentionSig = attentionSignature(attentionBuilt)
  const railAttention = useMemo(() => attentionBuilt, [attentionSig])

  // D17 / 4.4. The other workspaces' waiting panels, frozen by value like
  // every list here (JSON: a workspace name is user text).
  const elsewhereBuilt = buildElsewhereRows(workspaceRows, waitingIds)
  const elsewhereSig = JSON.stringify(elsewhereBuilt)
  const railElsewhere = useMemo(() => elsewhereBuilt, [elsewhereSig])

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
  // M73. Unconditional, for the reason the two above are; an id that is not
  // a chat panel's answers the store's empty state.
  const selectedChat = useChat(selectedId ?? '')
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
        dormantIds.has(selectedPanel.rect.id),
        // M73. The chat session's facts, when main has answered.
        // A restored panel's fresh session reports nothing spent; the file's
        // last `meta` line holds yesterday's figures, and is the answer until
        // this launch's session has priced a turn of its own.
        selectedChat.snapshot === null ? undefined : (() => {
          const snap = selectedChat.snapshot
          const meta = selectedChat.meta
          const useMeta = snap.turns === 0 && meta !== undefined
          return {
            state: chatStateInput(snap, selectedChat.turns.length > 0) as ChatStateInput,
            usage: useMeta ? meta.usage : snap.usage,
            costUsd: useMeta ? meta.costUsd : snap.costUsd,
            // M352. Main's meter, whatever this launch has priced: its caps bind from the first turn.
            ...(snap.meter === undefined ? {} : { meter: snap.meter }),
            model: snap.model ?? selectedChat.turns.find((t) => t.model !== undefined)?.model,
            turns: useMeta ? meta.turns : snap.turns,
            // M77. The ONE definition the palette row uses too.
            ran: chatHasRun(selectedChat),
            // M76. The oldest pending request, for the pane's Allow and Deny.
            ...((): { approval?: PendingApproval } => { const a = pendingApprovals.find((x) => x.id === selectedPanel.rect.id); return a === undefined ? {} : { approval: a } })(),
            // M98. Main's grants, mirrored; absent until it has answered (the field reads `unknown`).
            ...(selectedChat.grants === undefined ? {} : { grants: selectedChat.grants })
          }
        })(),
        // M116. The work card's record, for its word and its five facts.
        // D12. A capture's task, by the id it recorded — absent from the store reads as gone, not as never.
        isWorkPanel(selectedPanel) ? deps.workItemOf?.(selectedPanel.work.itemId)
          : isImagePanel(selectedPanel) && selectedPanel.image.artifact?.kind === 'capture' && selectedPanel.image.artifact.taskId !== undefined
            ? deps.workItemOf?.(selectedPanel.image.artifact.taskId) : undefined,
        // M133. A workflow trigger's template name, so the `runs` field says
        // the workflow rather than `/usr/bin/true`.
        deps.templateNameOf,
        // M196. The lane records, for the chat arm's repository and lane rows.
        deps.lanes,
        // M252. The workflow's record, for its reach and whether it was read.
        deps.templateOf
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
  // M77. A chat is a process kind: main holds its baseline from agent:create.
  const selectedIsSessionless = selectedPanel !== undefined && !isTerminalPanel(selectedPanel) && !isChatPanel(selectedPanel)

  return {
    panelRows, railRows, railWorkspaces, railAttention, railElsewhere,
    selectedPanel, selectedLive, inspectorModel, selectedIsSessionless
  }
}
