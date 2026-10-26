import type { History } from '@renderer/panels/history'
import type { Dispatch, MouseEvent as ReactMouseEvent, RefObject, SetStateAction, JSX } from 'react'
import { type Annotation, ANNOTATIONS_MAX } from '@shared/annotations'
import { type ApprovalRow, type PresetRow, REASON_NO_CLAUDE, claudeAvailable, codexAvailable } from '@renderer/palette/commands'
import type { CapabilityAnswer } from '@shared/toolbox-query'
import { type InputMode, Palette } from '@renderer/palette/Palette'
import { type Panel, isChatPanel, isTerminalPanel, isWorkflowPanel } from '@renderer/panels/panels'
import type { PanelSearchResult, PresetTemplate, SessionBackendInfo } from '@shared/ipc-contract'
import { type PersistedStarter, starterKeysToApply } from '@shared/starter'
import type { PersistedTeammate } from '@shared/teammates'
import type { PersistedWorkItem } from '@shared/work-items'
import type { ResumeSummary } from '@shared/resume-summary'
import { BlankCanvas } from '@renderer/shell/EmptyState'
import { ConnectedSpawnMenu } from '@renderer/palette/SpawnSheet'
import { NavGrid } from '@renderer/navgrid/NavGrid'
import { Onboarding } from '@renderer/onboarding/Onboarding'
import { REASON_NO_CODEX } from '@shared/agent-session'
import { STARTER_LAYOUTS } from '@shared/lineups'
import { adoptCommand, adoptSentence } from '@shared/tmux-adopt'
import { armConnectedSpawn, clearArmedSpawn } from '@renderer/panels/spawn-cursor'
import { connectedSpawnMenu } from '@renderer/panels/connected-spawn'
import { dismissReturn } from '@renderer/shell/presence'
import { foundAgentIds, onboardingReadiness } from '@shared/onboarding'
import { lineupWhatId } from '@renderer/palette/spawn-sheet'
import { panelName } from '@renderer/palette/panel-name'
import { pinCount } from '@renderer/canvas/lod'
import type { BoardVerbs } from './useBoardVerbs'
import { type MarqueeScreenRect, Marquee } from './MarqueeLayer'
import { type Point, type Viewport, type WorldRect, worldToScreen } from './viewport'
import { CanvasHud } from './CanvasHud'
import { DiagnosticsOverlay } from './DiagnosticsOverlay'
import { EdgeIndicators } from './EdgeIndicators'
import { FIT_TASK_NO_CONTEXT, missingSentence } from './task-members'
import { JobRecoveryNotice } from '../shell/JobRecoveryNotice'
import { Launcher } from './Launcher'
import { Minimap } from './MinimapOverlay'
import { PackPreview } from '../pack/PackPreview'
import { PresenceLayer } from '../presence/PresenceLayer'
import { ReopenNotice } from '../shell/ReopenNotice'
import { RestoreSplash, StartupSplash } from './StartupSplash'
import { RosterStrip } from '../presence/RosterStrip'
import { STARTER_HINT, hintsLeft } from './hints'
import { SyncChip } from '../presence/SyncChip'
import { WelcomeBack } from '../shell/WelcomeBack'
import { alignRects } from './arrange'
import { shellControl } from '../shell/shell-control'

import type { AdoptableSession } from '@shared/tmux-adopt'
import type { AgentProbe } from '@shared/onboarding'
import type { ConnectedRequest } from '@renderer/panels/spawn-cursor'
import type { CreationResult } from '@shared/verb-table'
import type { CredentialMeta } from '@shared/credential-schema'
import type { Diagnostics } from './useDiagnostics'
import type { EnvReport } from '@shared/env-report'
import type { FirstWorkOutcome } from '@shared/onboarding'
import type { FirstWorkRequest } from '@shared/onboarding'
import type { JobRecoveryModel } from '@renderer/shell/JobRecoveryNotice'
import type { LinkMode } from './useLinkMode'
import type { MergedLayout } from './merged-layout'
import type { NavGridController } from '@renderer/navgrid/useNavGrid'
import type { OnboardingAnswers } from '@shared/onboarding'
import type { PackAddResult } from '@shared/ipc-contract'
import type { PackPreviewState } from '@renderer/pack/PackPreview'
import type { PaletteActions } from '@renderer/palette/commands'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { PanelRow } from '@renderer/palette/commands/row-types'
import type { PanelSession } from '@renderer/session/panel-session'
import type { PersistedGroup } from '@shared/groups'
import type { PromptRow } from '@renderer/palette/commands/row-types'
import type { RailRow } from '@renderer/shell/rail-rows'
import type { ReopenModel } from '@renderer/shell/ReopenNotice'
import type { RestoreFacts } from './splash'
import type { ReturnBriefing } from '@shared/return-briefing'
import type { SettingRow } from '@shared/ipc-contract'
import type { SharedCanvas } from '@renderer/shared-canvas/useSharedCanvas'
import type { ShellChrome } from '@renderer/shell/useShellChrome'
import type { SplashMode } from './splash'
import type { TaskMembership } from './task-members'
import type { TaskRegion } from '@shared/redesign-contracts'
import type { UpdateState } from '@renderer/session/update-store'
import type { WorkSearchResult } from '@shared/work-search'
import type { WorkspaceRow } from '@shared/ipc-contract'
import type { WorktreeListRow } from '@shared/ipc-contract'
/**
 * M507 (E4, the Canvas.tsx split). What the canvas host draws over the world:
 * the edge indicators, the overview, the merged view's lanes, the marquee, the
 * connected-object menu, presence, the link and annotate banners, broadcast,
 * the nav grid, diagnostics, the splash, the restore card, onboarding, the
 * launcher and the empty canvas, the task lens, the HUD, a pack's preview and
 * the palette. Moved VERBATIM; it is a plain function Canvas calls in the same
 * place in the host, never a component, and every value it reads arrives in
 * one context object named as Canvas names it.
 */
export interface RenderHostOverlaysContext {
  history: History<Panel[]>
  activeWorkspaceId: string | undefined
  addPack: (token: string) => Promise<PackAddResult>
  adoptable: { tmuxPath: string; sessions: AdoptableSession[]; } | null
  agentLinksOn: boolean
  annotateTool: "draw" | "label"
  annotating: boolean
  annotationMarks: { x: number; y: number; }[]
  annotations: Annotation[]
  arrangeItem: (itemId: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  askWithoutFolder: (intention: string) => void
  backendInfo: SessionBackendInfo | null
  boardVerbsRef: RefObject<BoardVerbs>
  bookmarkRows: { id: string; name: string; }[]
  briefing: ReturnBriefing | null
  broadcastInput: boolean
  broadcastReady: boolean
  broadcastTargetIds: string[]
  canvasCoveredRef: RefObject<boolean>
  capability: { panelId: string; label: string; answer: CapabilityAnswer; }[] | null
  captionRedoRef: RefObject<{ present: Panel[]; captions: Annotation[]; }[]>
  captionUndoRef: RefObject<{ present: Panel[] | null; captions: Annotation[]; }[]>
  chatInFolder: (req: FirstWorkRequest) => void
  chrome: ShellChrome
  commitHistory: (next: Panel[]) => void
  completeOnboarding: (answers: OnboardingAnswers) => void
  connectedSpawn: ConnectedRequest | null
  createObject: (kind: string, value?: string) => Promise<CreationResult>
  credentialRows: CredentialMeta[]
  diagnostics: Diagnostics
  endAnnotate: () => void
  envBannerDismissed: boolean
  envReport: EnvReport | null
  finishOnboarding: () => void
  fitAll: () => void
  fitTaskContext: boolean
  flying: boolean
  frameItem: (itemId: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  getDiagnosticsInput: () => { panels: PanelSession[]; budget: number; liveCount: number; heldCount: number; backend: SessionBackendInfo | null; }
  globalFontSize: number
  goToPanelStable: (id: string) => void
  goToViewport: (vp: Viewport) => void
  groups: PersistedGroup[]
  hasSelection: () => boolean
  hintsLoaded: boolean
  hintsSeen: ReadonlySet<string>
  importCanvas: (path?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  inputMode: InputMode | null
  jobRecovery: JobRecoveryModel | null
  launcherPutAway: boolean
  launcherRecentUsed: Record<string, number>
  launcherRecents: string[]
  lens: TaskMembership | null
  linkMode: LinkMode
  linkSourceName: string
  makeTaskRef: RefObject<() => void>
  markHint: (id: string) => void
  marquee: MarqueeScreenRect | null
  merged: boolean
  mergedView: MergedLayout | null
  minimapEnabled: boolean
  navGrid: NavGridController
  noteRoot: string | null
  onBroadcastStopMouseDown: (event: ReactMouseEvent) => void
  onCapabilityQuery: (query: string) => void
  onSearchQuery: (query: string) => void
  onSpawn: (centre: Point, template?: PresetTemplate, opening?: { title?: string; context?: string; focus?: true; exact?: true; atCursor?: true; }) => void
  onboardingDone: boolean
  onboardingProbes: AgentProbe[]
  packPreview: PackPreviewState | null
  palette: PaletteController
  paletteActions: PaletteActions
  paletteActionsRef: RefObject<PaletteActions | null>
  paletteApprovals: ApprovalRow[]
  paletteTemplates: { refusal?: string | undefined; id: string; name: string; nodes: number; edges: number; }[]
  panelRows: PanelRow[]
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  pipsEnabled: boolean
  presetRows: PresetRow[]
  promptRows: PromptRow[]
  railRows: RailRow[]
  rects: WorldRect[]
  reopen: ReopenModel | null
  restoreFacts: RestoreFacts | null
  restoreOpen: boolean
  resumeBanner: JSX.Element | null
  resumedNext: { itemId: string; text: string; action?: "review" | "answer" | "resume" | "start" | undefined; } | null
  runResumeAction: (itemId: string, action: ResumeSummary["action"]) => void
  scrollbackPersist: boolean
  searchResults: PanelSearchResult | null
  selectedIds: ReadonlySet<string>
  selectedIdsRef: RefObject<ReadonlySet<string>>
  selectedPanelIds: string[]
  setAdoptable: Dispatch<SetStateAction<{ tmuxPath: string; sessions: AdoptableSession[]; } | null>>
  setAnnotateTool: Dispatch<SetStateAction<"draw" | "label">>
  setConnectedSpawn: Dispatch<SetStateAction<ConnectedRequest | null>>
  setEnvBannerDismissed: Dispatch<SetStateAction<boolean>>
  setLauncherPutAway: Dispatch<SetStateAction<boolean>>
  setPackPreview: Dispatch<SetStateAction<PackPreviewState | null>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setRelatedItemId: Dispatch<SetStateAction<string | null>>
  setRestoreLeft: Dispatch<SetStateAction<boolean>>
  setSplash: Dispatch<SetStateAction<SplashMode>>
  settingRows: SettingRow[]
  shapeIdSet: Set<string>
  shared: SharedCanvas
  showOnboarding: boolean
  splash: SplashMode
  startFirstWork: (req: FirstWorkRequest) => Promise<FirstWorkOutcome>
  starter: PersistedStarter | undefined
  taskRegions: TaskRegion[]
  teammates: PersistedTeammate[] | null
  terminalNameOf: ReadonlyMap<string, string>
  toggleAgentLinks: () => void
  toggleBroadcastStable: () => void
  trail: { back: boolean; forward: boolean; }
  updateState: UpdateState
  viewport: Viewport
  waitingIds: string[]
  wakeTarget: (id: string) => void
  workItems: PersistedWorkItem[]
  workSearch: WorkSearchResult | null
  workspaceRows: WorkspaceRow[]
  worktreeRows: WorktreeListRow[]
  worldCentre: () => Point
  zoomBy: (factor: number) => void
}

export function renderHostOverlays(ctx: RenderHostOverlaysContext): JSX.Element {
  const {
    activeWorkspaceId, addPack, adoptable, agentLinksOn, annotateTool, annotating, annotationMarks, annotations, arrangeItem, askWithoutFolder, backendInfo, boardVerbsRef, bookmarkRows, briefing, broadcastInput, broadcastReady, broadcastTargetIds, canvasCoveredRef, capability, captionRedoRef, captionUndoRef, chatInFolder, chrome, commitHistory, completeOnboarding, connectedSpawn, createObject, credentialRows, diagnostics, endAnnotate, envBannerDismissed, envReport, finishOnboarding, fitAll, fitTaskContext, flying, frameItem, getDiagnosticsInput, globalFontSize, goToPanelStable, goToViewport, groups, hasSelection, hintsLoaded, hintsSeen, importCanvas, inputMode, jobRecovery, launcherPutAway, launcherRecentUsed, launcherRecents, lens, linkMode, linkSourceName, makeTaskRef, markHint, marquee, merged, mergedView, minimapEnabled, navGrid, noteRoot, onBroadcastStopMouseDown, onCapabilityQuery, onSearchQuery, onSpawn, onboardingDone, onboardingProbes, packPreview, palette, paletteActions, paletteActionsRef, paletteApprovals, paletteTemplates, panelRows, panels, panelsRef, pipsEnabled, presetRows, promptRows, railRows, rects, reopen, restoreFacts, restoreOpen, resumeBanner, resumedNext, runResumeAction, scrollbackPersist, searchResults, selectedIds, selectedIdsRef, selectedPanelIds, setAdoptable, setAnnotateTool, setConnectedSpawn, setEnvBannerDismissed, setLauncherPutAway, setPackPreview, setPanels, setRelatedItemId, setRestoreLeft, setSplash, settingRows, shapeIdSet, shared, showOnboarding, splash, startFirstWork, starter, taskRegions, teammates, terminalNameOf, toggleAgentLinks, toggleBroadcastStable, trail, updateState, viewport, waitingIds, wakeTarget, workItems, workSearch, workspaceRows, worktreeRows, worldCentre, zoomBy
    , history
  } = ctx
  return (
    <>
    {pipsEnabled && (
      <EdgeIndicators rects={rects} viewport={viewport} ids={waitingIds} onFly={goToPanelStable} labelOf={(id) => { const p = panels.find((x) => x.rect.id === id); return p === undefined ? id : panelName(p, undefined, { defaultName: terminalNameOf.get(id) }) }} />
    )}
    {/* M69. The overview: outside .world like the pips, in the top-right
        corner, hidden while merged (the merged view's geometry is not this
        canvas's) and by `canvas.minimap`. */}
    {/* An overview of nothing is noise beside the launcher: it appears
        with the first object. */}
    {minimapEnabled && !merged && panels.length > 0 && (
      <Minimap rects={rects} rows={railRows} viewport={viewport} goTo={goToViewport} marks={annotationMarks} selected={selectedIds} shapeIds={shapeIdSet} flying={flying} regions={taskRegions.map((region) => region.bounds)} />
    )}
    {/* M66. Lane HEADERS in screen space — chrome, like the pips: a lane
        name inside .world scaled to 4px text at the zoom the merged view
        is used at (M61's critic, finding 4). Positioned from the lane's
        world rect through the viewport, so they ride a pan; the in-world
        .merged-lane__name stays for the checks that read it and is not
        painted. */}
    {merged && mergedView && mergedView.lanes.map((lane) => {
      const at = worldToScreen({ x: lane.bounds.x, y: lane.bounds.y - 56 }, viewport)
      // The header hangs UP from its anchor (translate -100%), so an
      // anchor above ~36px puts it outside the host: clamp, so a lane
      // whose top is at the viewport's top still shows its name.
      return (
        <div key={lane.workspaceId} className={`lane-header${lane.active ? ' lane-header--active' : ''}`} data-screen-control="" data-lane-header={lane.workspaceId} style={{ left: Math.max(at.x, 8), top: Math.max(at.y, 36) }}>
          <span className="lane-header__name">{lane.name}</span>
          {lane.active && <span className="lane-header__note">this workspace</span>}
        </div>
      )
    })}
    {/* Beside the pips and outside .world for the same reason — see
        Marquee.tsx. It renders null at rest, so there is no "no marquee"
        element for anything to find. */}
    <Marquee
      rect={marquee}
      selectionCount={selectedIds.size}
      onAlign={() => {
        setPanels((prev) => {
          const wanted = selectedIdsRef.current
          const chosen = prev.filter((panel) => wanted.has(panel.rect.id) && panel.locked !== true)
          if (chosen.length < 2) return prev
          const positions = alignRects(chosen.map((panel) => panel.rect), 'left')
          const next = prev.map((panel) => {
            const at = positions.get(panel.rect.id)
            return at === undefined ? panel : { ...panel, rect: { ...panel.rect, x: at.x, y: at.y } }
          })
          if (next.every((panel, index) => panel === prev[index])) return prev
          commitHistory(next)
          return next
        })
      }}
      onTidy={() => paletteActions.tidyPanels([...selectedIds])}
      onMakeTask={() => makeTaskRef.current()}
      onPauseAll={() => { for (const id of selectedIds) void window.canvas.agentSession.interrupt(id) }}
    />
    {connectedSpawn !== null && (() => {
      const at = worldToScreen(connectedSpawn.at, viewport)
      const model = connectedSpawnMenu(connectedSpawn.name, presetRows)
      const from = connectedSpawn.from
      const point = connectedSpawn.at
      const cwdOf = (): string => {
        const source = panels.find((panel) => panel.rect.id === from)
        if (source !== undefined && isTerminalPanel(source)) return source.spec.cwd
        if (source !== undefined && isChatPanel(source)) return source.chat.cwd
        return '~'
      }
      return (
        <ConnectedSpawnMenu
          title={model.title}
          agents={model.agents}
          presets={model.presets}
          foot={model.foot}
          style={{ position: 'absolute', left: at.x, top: at.y, zIndex: 40 }}
          onClose={() => { clearArmedSpawn(); setConnectedSpawn(null) }}
          onAgent={(kind) => {
            armConnectedSpawn({ from, at: point })
            const cwd = cwdOf()
            onSpawn(point, kind === 'shell' ? { cwd, args: [] } : { cwd, args: [], agent: kind === 'claude' ? 'claude-code' : 'codex' }, { focus: true })
            setConnectedSpawn(null)
          }}
          onPreset={(id) => {
            armConnectedSpawn({ from, at: point })
            void window.canvas.preset.spawnById(id)
            setConnectedSpawn(null)
          }}
        />
      )
    })()}
    {/* Presence: remote selections and cursors on their own 2D canvas, and
        the roster of who else is here. Siblings of .world like Marquee —
        screen-pinned, and a remote update repaints this layer only. */}
    <PresenceLayer workspaceId={activeWorkspaceId} viewport={viewport} rects={rects} />
    {/* M348. One top-centre column: who is here, then — on a shared
        workspace that is offline or catching up — what its sync is doing. */}
    <div className="presence-top" data-screen-control="">
      <RosterStrip workspaceId={activeWorkspaceId} />
      <SyncChip workspaceId={activeWorkspaceId} shared={shared.view !== null} />
    </div>
    {/* A SIBLING of .world, like EdgeIndicators above: .world carries the
        one translate()/scale() transform, and an overlay inside it would
        pan and zoom away with the canvas it is pinned to. */}
    {/* M13. Success criterion 6: an armed mode must never be invisible.
        A SIBLING of .world like NavGrid above, so it is viewport-pinned
        chrome rather than something that pans away from the user while
        the mode it describes is still armed. */}
    {linkMode.from !== null && (
      <div className="link-banner" role="status" data-screen-control="">
        Linking from <strong>{linkSourceName}</strong> — click a panel, or press Escape
      </div>
    )}
    {/* M93. The annotate strip: LOUD, with its exit on it (M40's rule). */}
    {/* M395. The strip TAKES the pointer (styles.css) and keeps its presses:
        a press on it is a press on a tool, never a label dropped on the
        ground beneath it — the canvas's own mousedown places labels. */}
    {annotating && (
      <div className="link-banner link-banner--annotate" role="status" data-screen-control="" data-annotate-strip onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}>
        <strong>Annotating</strong> — {annotateTool === 'draw' ? 'drag to draw, on a panel or the canvas' : 'click to place a note, on a panel or the canvas'}; Escape to stop
        {/* M155. The cap, said before it bites: ink reaches it in ordinary use where labels never did. */}
        {annotations.length >= ANNOTATIONS_MAX && <span className="link-banner__note" data-annotate-cap> · at the cap of {ANNOTATIONS_MAX} — the oldest goes next</span>}
        {/* M155. The two tools, pressed state as data: `draw` inks a drag, `label` is M93's note. */}
        <span className="link-banner__tools" role="group" aria-label="Annotate tool">
          <button type="button" className={`link-banner__tool${annotateTool === 'label' ? ' link-banner__tool--on' : ''}`} data-annotate-tool="label" aria-pressed={annotateTool === 'label'} {...shellControl(() => setAnnotateTool('label'))}>label</button>
          <button type="button" className={`link-banner__tool${annotateTool === 'draw' ? ' link-banner__tool--on' : ''}`} data-annotate-tool="draw" aria-pressed={annotateTool === 'draw'} {...shellControl(() => setAnnotateTool('draw'))}>draw</button>
        </span>
        <button type="button" className="link-banner__stop" aria-label="Stop annotating" data-annotate-done {...shellControl(endAnnotate)}>Done</button>
      </div>
    )}
    {broadcastInput && (
      <div className="link-banner" role="status" data-screen-control="">
        Broadcasting keyboard input to <strong>{broadcastTargetIds.length} terminals</strong>
        {/* M40. The exit lives on the banner: a mode whose only way out is
            a palette search is a dead end for whoever arrived by the
            chord. shellControl so the press never moves DOM focus off
            the terminal that is still receiving the keystrokes. */}
        {/* onMouseDown overrides shellControl's own (which only
            preventDefaults): onBroadcastStopMouseDown does that AND
            stopPropagation, the extra this one control inside .canvas needs. */}
        <button type="button" className="link-banner__stop" aria-label="Stop broadcasting"
          {...shellControl(toggleBroadcastStable)} onMouseDown={onBroadcastStopMouseDown}>Stop</button>
        <span className="link-banner__hint">⌘⇧I</span>
      </div>
    )}
    <NavGrid controller={navGrid} />
    <DiagnosticsOverlay
      open={diagnostics.open}
      onClose={diagnostics.close}
      getRendererInput={getDiagnosticsInput}
    />
    {splash !== 'none' && !merged && (
      <StartupSplash mode={splash} rects={rects} viewport={viewport} onDone={() => setSplash('none')} />
    )}
    {restoreOpen && restoreFacts !== null && !merged && (
      <RestoreSplash
        facts={restoreFacts}
        rects={panels.map((panel) => ({ x: panel.rect.x, y: panel.rect.y, w: panel.rect.w, h: panel.rect.h }))}
        onDone={() => setRestoreLeft(true)}
      />
    )}
    {showOnboarding && !merged && (
      <Onboarding
        workspaceName={workspaceRows.find((w) => w.active)?.name ?? ''}
        probes={onboardingProbes}
        enabled={foundAgentIds(onboardingProbes)}
        {...(envReport === null ? {} : { tmux: { path: envReport.tmux.path } })}
        onHandoff={(_handoff, answers) => completeOnboarding(answers)}
        onSkip={finishOnboarding}
        onCustom={() => { finishOnboarding(); paletteActionsRef.current?.beginSpawnSheet() }}
      />
    )}
    {/* One empty state at a time. The launcher holds an empty canvas
        until the person puts it away ("Blank canvas"); only then does the
        quieter blank card show, and every button on it does something:
        the task box opens the new-task sheet on that sentence, the quick
        spawns are ⌘N's preset and a login shell, and a starter layout
        opens the panel sheet on its lineup (the person still picks the
        folder there). */}
    {onboardingDone && panels.length === 0 && !merged && launcherPutAway && (
      <BlankCanvas
        workspace={workspaceRows.find((w) => w.active)?.name ?? ''}
        onStart={(sentence) => paletteActions.beginStartWork({ title: sentence.trim() })}
        onQuick={(id) => {
          if (id === 'import') { void importCanvas(); return }
          if (id === 'agent') {
            const preset = presetRows.find((p) => p.isDefault && p.available) ?? presetRows.find((p) => p.agent !== undefined && p.available)
            if (preset !== undefined) { paletteActions.spawnPreset(preset.id); return }
            paletteActions.beginSpawnSheet()
            return
          }
          onSpawn(worldCentre(), { cwd: '~', args: [] }, { focus: true })
        }}
        adopt={adoptable === null ? null : {
          sentence: adoptSentence(adoptable.sessions),
          onPlace: () => {
            // One panel per session, each through the one placement rule,
            // so they cascade rather than stack. Each is a tmux client:
            // closing it detaches, and their session keeps running.
            for (const row of adoptable.sessions) {
              onSpawn(worldCentre(), { cwd: row.cwd === '' ? '~' : row.cwd, ...adoptCommand(adoptable.tmuxPath, row.target), title: `${row.agent} · ${row.session}` })
            }
            setAdoptable(null)
          },
          onLeave: () => setAdoptable(null)
        }}
        onMoreWays={() => setLauncherPutAway(false)}
        onLayout={(id) => {
          const layout = STARTER_LAYOUTS.find((row) => row.id === id)
          if (layout === undefined) return
          if (layout.lineup === null) { onSpawn(worldCentre(), { cwd: '~', args: [] }, { focus: true }); return }
          paletteActions.beginSpawnSheet(undefined, undefined, { what: lineupWhatId(layout.lineup) })
        }}
      />
    )}
    {/* M48. The launcher: keyed on the panel COUNT of this canvas, never
        on activity, and never while merged (the merged view's geometry is
        read-only). A sibling of .world, so it never scales. */}
    {/* M403 (B6). The first start's guide is no longer a popover here: it
        sat over the composer's Send/Answer, the buttons its own copy told
        the person to use. It is a strip INSIDE its conversation
        (`firstTaskStrip`, handed to that ChatNode as `guide`). */}
    {panels.length === 0 && !merged && !launcherPutAway && (() => {
      // Computed once so the tmux/starter notices and the starter door's
      // own disabled reason read the SAME facts — two separate ternaries
      // over the same inputs had already drifted once (the Act III
      // critic, hints.ts's header).
      const launcherHintsLeft = hintsLoaded ? hintsLeft(hintsSeen, 'launcher') : []
      const starterReasonForLauncher = starterKeysToApply(starter).length === 0 ? 'every starter object is already on this canvas' : onboardingReadiness(envReport).preferred === undefined ? 'no conversation engine has been discovered — the starter begins with an agent; install one and Check again' : null
      return (
      <Launcher
        presets={presetRows}
        onImportCanvas={() => { void importCanvas() }}
        recents={launcherRecents}
        recentUsed={launcherRecentUsed}
        onCreateObject={(kind) => { void createObject(kind).then((r) => { if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) }) }}
        onBlankCanvas={() => setLauncherPutAway(true)}
        // M205 (D09). The intent form: D05's Start work, the one alternative, and the folder dialog.
        onStartWork={startFirstWork}
        onAsk={askWithoutFolder}
        onChatHere={chatInFolder}
        onChooseFolder={() => window.canvas.teammate.choosePlace()}
        teammates={teammates ?? []}
        tmux={backendInfo?.kind === 'direct' && launcherHintsLeft.some((h) => h.id === 'tmux') ? backendInfo.reason : null}
        onDismissTmux={() => markHint('tmux')}
        // M205 critic 2.4. Only worth pointing at when the door itself
        // would work — a hint aimed at a disabled starter reads as a
        // broken promise the moment someone follows it.
        starterHint={starterReasonForLauncher === null && launcherHintsLeft.some((h) => h.id === 'starter') ? STARTER_HINT.text : null}
        onDismissStarterHint={() => markHint('starter')}
        report={envReport}
        onOpenSetup={(url) => { void window.canvas.links.open({ panelId: '', target: url }) }}
        onCheckAgain={() => paletteActions.checkReadiness()}
        onSpawnPreset={paletteActions.spawnPreset}
        onOpenSheet={paletteActions.beginSpawnSheet}
        onOpenFile={paletteActions.openFile}
        onNewNote={paletteActions.newNote}
        noteReason={noteRoot === null ? 'select a panel first — a note is saved in its directory' : null}
        onNewChat={paletteActions.newChat}
        // M205. The starter is an OPTIONAL line; the primary never lays it out.
        onOpenStarter={() => { void paletteActions.openStarter() }}
        starterReason={starterReasonForLauncher}
        chatReason={claudeAvailable(presetRows) ? null : REASON_NO_CLAUDE}
        onNewCodexChat={() => paletteActions.newChat('codex')}
        codexReason={codexAvailable(presetRows) ? null : REASON_NO_CODEX}
        update={updateState}
        onOpenRelease={(url) => { void window.canvas.links.open({ panelId: '', target: url }) }}
      />
      )
    })()}
    {/* The UX pass (4.4). One "while you were away" card: the floating
        briefing (M309: only when the navigator's Panels pane is not there
        to hold it; Resume alone is the strip), the Reopened notice and
        Unfinished work (M316), and the login-shell banner (M48), each a
        section of it, with one Dismiss all. */}
    {(() => {
      const floatBriefing = briefing !== null && resumeBanner !== null && !(chrome.navVisible && chrome.navigator === 'panels')
      const envProblem = envReport !== null && !envReport.shell.ok && !envBannerDismissed
      const sections = [floatBriefing, reopen !== null, jobRecovery !== null, envProblem].filter(Boolean).length
      return (
        <div className="recovery-slot" data-recovery-slot="" data-screen-control="">
          {sections > 0 && (
            <WelcomeBack
              count={sections}
              onDismissAll={() => {
                if (floatBriefing) dismissReturn()
                if (reopen?.acknowledgeable === true) reopen.acknowledge()
                jobRecovery?.dismiss()
                setEnvBannerDismissed(true)
              }}
            >
              {floatBriefing && resumeBanner}
              {reopen !== null && (
                <ReopenNotice
                  model={reopen}
                  onGo={paletteActions.goToPanel}
                  onStart={(id) => { paletteActions.goToPanel(id); wakeTarget(id) }}
                />
              )}
              {jobRecovery !== null && <JobRecoveryNotice model={jobRecovery} />}
              {envProblem && envReport !== null && (
                <div className="env-banner" data-env-banner role="status">
                  Your login shell could not be read ({envReport.shell.reason ?? 'the probe failed'}) — CLIs installed
                  through your shell's rc files may not be found.{' '}
                  {/* The UX pass. The fix is a button, not a sentence pointing at ⌘K. */}
                  <button type="button" className="pf__verb pf__verb--word env-banner__check" data-env-banner-check {...shellControl(() => palette.openPalette('environment'))}>Check environment</button>
                </div>
              )}
            </WelcomeBack>
          )}
        </div>
      )
    })()}
    {/* M204 (D08). The lens bar: which task is lit, how much of it, what
        is missing, and the ways out. Viewport-pinned like the env banner.
        M264: Escape clears the lens when it is not destined for a focused
        terminal or text draft (see the relatedItemId keydown effect). */}
    {lens !== null && (() => {
      const title = workItems.find((i) => i.id === lens.itemId)?.title ?? lens.itemId
      const gone = missingSentence(lens.missing)
      // Every control is present and enabled but Arrange in the merged
      // view; each refuses BY NAME through the feedback line (a task with
      // nothing on the canvas says so) rather than greying out silently.
      const act = (r: { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }): void => { if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) }
      return (
        <div className="task-lens" data-screen-control="" data-task-lens-bar={lens.itemId} role="status">
          <span className="task-lens__title">{title}</span>
          <span className="task-lens__count" data-task-lens-count>{lens.members.length} related</span>
          {gone !== '' && <span className="task-lens__missing" data-task-lens-missing>{gone}</span>}
          {resumedNext !== null && resumedNext.itemId === lens.itemId && (resumedNext.action === 'review' || resumedNext.action === 'answer'
            // M315. A next action with a door is a BUTTON — as a label it
            // was the one word on the bar that looked pressable and was not.
            ? <button type="button" className="pf__verb pf__verb--word task-lens__next task-lens__next--go" data-task-lens-next title={resumedNext.text} {...shellControl(() => runResumeAction(resumedNext.itemId, resumedNext.action))}>{resumedNext.text}</button>
            : <span className="task-lens__next" data-task-lens-next title={resumedNext.text}>{resumedNext.text}</span>)}
          <button type="button" className="pf__verb pf__verb--word" data-task-lens-verb="frame" title="Frame every panel of this task"
            {...shellControl(() => act(frameItem(lens.itemId)))}>Frame</button>
          <button type="button" className="pf__verb pf__verb--word" data-task-lens-verb="arrange" disabled={merged}
            title={merged ? 'the merged view is read-only' : 'Compact this task\'s panels in reading order, clear of everything else — one undo'}
            {...shellControl(() => { if (!merged) act(arrangeItem(lens.itemId)) })}>Arrange</button>
          <button type="button" className="pf__verb pf__verb--word" data-task-lens-verb="stop" title="Stop showing what is related" {...shellControl(() => setRelatedItemId(null))}>Stop</button>
        </div>
      )
    })()}
    <CanvasHud
      updateNewer={updateState.result?.kind === 'newer' ? { version: updateState.result.version, url: updateState.result.url } : null}
      viewport={viewport}
      onZoomBy={zoomBy}
      onFit={fitAll}
      fitTask={{ disabledReason: fitTaskContext ? undefined : FIT_TASK_NO_CONTEXT, run: () => { const r = boardVerbsRef.current.fitTask?.(); if (r !== undefined && r.kind === 'refused') paletteActionsRef.current?.say(r.reason) } }}
      agentLinks={{ on: agentLinksOn, onToggle: toggleAgentLinks }}
      // M263/M395. Occupied canvas only: one Create + into the shared
      // sheet, on the HUD's ground (CanvasHud). The empty canvas's launcher
      // owns Start work · Ask · Create… and the Fit verbs have nothing to frame.
      create={panels.length > 0 ? { onOpen: paletteActions.beginSpawnSheet, ...(merged ? { disabledReason: 'leave merged view to create an object' } : {}) } : undefined}
      empty={panels.length === 0}
    />
    {packPreview !== null && (
      <PackPreview preview={packPreview} onAdd={addPack} onClose={() => setPackPreview(null)} />
    )}
    {/* A flat, non-interactive scrim: no blur (a composited layer over a
        canvas that repaints on every pan frame is the cost .palette's own
        comment already declines to pay) and no pointer-events, so the
        outside-click exit stays exactly where it was — .shell's capture
        handler, never here. */}
    {palette.open && <div className="palette__scrim" data-screen-control="" aria-hidden="true" />}
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
        envReport={envReport}
        starterReason={starterKeysToApply(starter).length === 0 ? 'every starter object is already on this canvas' : onboardingReadiness(envReport).preferred === undefined ? 'no conversation engine has been discovered — the starter begins with an agent' : starter === undefined && panels.length > 0 ? 'the starter lays out on an empty canvas — reset the canvas or make a new workspace for it' : null}
        update={updateState}
        workflowTemplateOf={(panelId) => { const p = panelsRef.current.find((x) => x.rect.id === panelId); return p !== undefined && isWorkflowPanel(p) ? p.workflow.templateId : undefined }}
        bookmarks={bookmarkRows}
        cameraTrail={trail}
        // M407 follow-up: a retired caption is an undo step too, so ⌘K's
        // rows agree with what ⌘Z will do (`present: null` is pinned to
        // this very present when the press's render commits).
        canUndo={history.past.length > 0 || (captionUndoRef.current.at(-1) !== undefined && (captionUndoRef.current.at(-1)?.present ?? history.present) === history.present)}
        canRedo={history.future.length > 0 || captionRedoRef.current.at(-1)?.present === history.present}
        canvasCovered={canvasCoveredRef.current}
        globalFontSize={globalFontSize}
        // The renderer's own attention set (agent-state-store.ts), not a
        // second derivation: main never learns "which panels are
        // wants-you" as a set, only individual agent:state transitions,
        // and asking it to recompute one here would make it a second
        // author of a fact this side already folds correctly.
        attentionIds={waitingIds}
        pinnedCount={pinCount(panels)}
        approvals={paletteApprovals}
        templates={paletteTemplates}
        teammateCount={teammates === null ? undefined : teammates.length}
        hasSelection={hasSelection()}
        selectedIds={selectedPanelIds}
        groups={groups}
        noteRoot={noteRoot}
        merged={merged}
        broadcastReady={broadcastReady}
        broadcastActive={broadcastInput}
        inputMode={inputMode}
        searchResults={searchResults}
        workSearch={workSearch}
        scrollbackEnabled={scrollbackPersist}
        onSearchQuery={onSearchQuery}
        capability={capability}
        onCapabilityQuery={onCapabilityQuery}
      />
    )}
    </>
  )
}
