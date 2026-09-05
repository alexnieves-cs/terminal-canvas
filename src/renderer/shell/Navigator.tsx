import { memo, type JSX } from 'react'
import type { RailRow } from './rail-rows'
import type { RailWorkspace } from './rail-sections'
import type { FileRow } from './file-tree-model'
import type { NavigatorPane } from './useShellChrome'
import { RailPanelRow } from './RailPanelRow'
import { RailWorkspaceRow } from './RailWorkspaceRow'
import type { RailRun } from './rail-sections'
import { FileTree } from './FileTree'
import { VaultPane, type VaultPaneProps } from './VaultPane'
import { IntegrationsPane, type IntegrationsPaneProps } from './IntegrationsPane'
import { shellControl } from './shell-control'
import { ChevronLeft, Plus, Lanes } from '@renderer/icons'

export interface NavigatorProps {
  navigator: NavigatorPane
  onToggle: () => void
  // Workspaces
  workspaces: RailWorkspace[]
  /** M79. Runs, newest first, with Run again. */
  runs: Array<RailRun & { note?: string }>
  onRunAgain: (id: string) => void
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: () => void
  onRenameWorkspace: (id: string, currentName: string) => void
  onDeleteWorkspace: (id: string, name: string, panelCount: number) => void
  // Panels
  rows: RailRow[]
  selectedId: string | null
  onGoToPanel: (id: string) => void
  onStartPanel: (id: string) => void
  /** M66. While merged, every start control is disabled with its reason. */
  merged?: boolean
  onClosePanel: (id: string) => void
  // Files
  treeRootPath: string | null
  treeRootLabel: string | null
  /** M68. The selected panel the tree is rooted on, by its label. */
  treeRootPanel: string | null
  /** M68. The Workspaces pane's door to the merged view. */
  onToggleMerged: () => void
  treeRows: FileRow[]
  treeRootPending: boolean
  treeEmptyReason: string
  onToggleDir: (path: string) => void
  onInsertPath: (path: string) => void
  onRefreshTree: () => void
  /** M83. The Files pane's memory door and its named reason. */
  onOpenMemory: () => void
  memoryReason?: string
  /** M85. The vault pane's model — its own three states, built by Canvas. */
  vault: VaultPaneProps
  /** M89. The integrations page's model. */
  integrations: IntegrationsPaneProps
}

/**
 * M46. The navigator: ONE pane at a time, the whole column tall.
 *
 * The rail used to render three sections unconditionally, each capped at a
 * third of one column forever, and a fourth had nowhere to go. Now the dock
 * chooses which of Panels, Workspaces or Files fills the column, and each
 * list gets the full height. Attention moved to the dock (a badge plus a
 * popover); the rail's third copy of a fact the canvas already carries twice
 * (edge pips, Cmd+J) is gone.
 *
 * Presentational by construction, like the rail it replaces: every prop is
 * derived data or a CanvasActions member, memo'd, and EVERY row array it
 * takes is frozen on a signature by Canvas — an unfrozen array here defeats
 * the memo at 60Hz during a drag, invisibly on a four-panel canvas.
 *
 * Always MOUNTED. Collapsing is a width change on the grid column (or, at
 * Compact, the drawer class), never an unmount — the rows stay reconciled
 * while invisible, which is why they need the signature freeze rather than a
 * memo keyed on the open state.
 *
 * The class names are the M8a rail's, kept on purpose: `.shell__rail`,
 * `.shell__rail-toggle`, `.rail-list--panels`, `.rail-list--workspaces`, and
 * the Files pane keeps `.shell__tree` around its own header and list, so
 * every check that reads them still finds the surface it means.
 */
function NavigatorImpl(props: NavigatorProps): JSX.Element {
  const { navigator, onToggle } = props
  const title = navigator === 'files' ? 'Files' : navigator === 'vault' ? 'Vault' : navigator === 'integrations' ? 'Integrations' : navigator === 'workspaces' ? 'Workspaces' : 'Panels'
  return (
    <aside className="shell__rail" aria-label="Navigator" data-navigator={navigator}>
      {navigator === 'integrations' ? (
        <IntegrationsPane {...props.integrations} onToggle={onToggle} />
      ) : navigator === 'vault' ? (
        <VaultPane {...props.vault} onToggle={onToggle} />
      ) : navigator === 'files' ? (
        <FileTree
          onToggle={onToggle}
          rootPath={props.treeRootPath}
          rootLabel={props.treeRootLabel}
          rootPanel={props.treeRootPanel}
          rows={props.treeRows}
          rootPending={props.treeRootPending}
          emptyReason={props.treeEmptyReason}
          onToggleDir={props.onToggleDir}
          onInsertPath={props.onInsertPath}
          onRefresh={props.onRefreshTree}
          onOpenMemory={props.onOpenMemory}
          memoryReason={props.memoryReason}
        />
      ) : (
        <>
          <div className="shell__region-title shell__region-title--action navigator__header">
            <span>{title}</span>
            <span className="navigator__header-actions">
              {navigator === 'workspaces' && (
                <button
                  type="button"
                  className="shell__region-add icon-button"
                  title="New workspace"
                  aria-label="New workspace"
                  {...shellControl(props.onCreateWorkspace)}
                >
                  <Plus />
                </button>
              )}
              {/* The way back for a user who does not know ⌘\: stays with
                  the pane it collapses. */}
              <button
                type="button"
                className="shell__rail-toggle icon-button"
                title="Hide the navigator (⌘\)"
                aria-label="Hide the navigator"
                {...shellControl(onToggle)}
              >
                <ChevronLeft />
              </button>
            </span>
          </div>
          {navigator === 'workspaces' ? (
            <ul className="rail-list rail-list--workspaces" aria-label="Workspaces">
              {props.workspaces.length === 0 ? (
                // Reachable: the list is empty at mount until the first
                // reloadWorkspaces() resolves. A header with a void under it
                // reads as a broken list.
                <li className="rail-empty">no workspaces</li>
              ) : (
                props.workspaces.map((row) => (
                  <RailWorkspaceRow
                    key={row.id}
                    row={row}
                    onSwitch={props.onSwitchWorkspace}
                    onRename={props.onRenameWorkspace}
                    onDelete={props.onDeleteWorkspace}
                  />
                ))
              )}
              {/* M68. The merged view's door lives with the workspaces it
                  shows, not only in the top bar: a pressed toggle, the same
                  verb the bar's button runs. */}
              <li className="rail-row rail-row--door" data-rail-merged>
                <button
                  type="button"
                  className="rail-row__main"
                  aria-pressed={props.merged === true}
                  title={props.merged ? 'Back to this workspace' : 'Every workspace at once, read-only'}
                  {...shellControl(props.onToggleMerged)}
                >
                  <span className="rail-row__kind" aria-hidden="true"><Lanes /></span>
                  <span className="rail-row__label">merged view</span>
                  <span className="rail-row__tail">{props.merged ? 'on · read-only' : 'all workspaces'}</span>
                </button>
              </li>
              {/* M79. Runs: one execution of a subgraph each, newest first. */}
              <li className="rail-row rail-row--heading" data-rail-runs-heading><span className="shell__region-title">Runs</span></li>
              {props.runs.length === 0 ? (
                <li className="rail-empty" data-rail-runs-empty>no runs yet — a handoff that fires records one</li>
              ) : props.runs.map((run) => (
                <li key={run.id} className="rail-row rail-run" data-rail-run={run.id} data-run-outcome={run.outcome}>
                  {/* Two lines: the name owns the first, the facts and the verb the second. */}
                  <span className="rail-row__label rail-run__name">{run.name}</span>
                  <div className="rail-run__main">
                    {/* The facts truncate first; the state word never does. */}
                    <span className="rail-run__facts">{run.facts}</span>
                    <span className="rail-run__word" data-tone={run.tone}>{run.outcome}</span>
                    <button type="button" className="rail-row__verb" data-rail-run-again={run.id} disabled={!run.runAgain.enabled}
                      title={run.runAgain.enabled ? 'Restart this run\'s roots in order' : run.runAgain.reason}
                      {...shellControl(() => { if (run.runAgain.enabled) props.onRunAgain(run.id) })}>Run again</button>
                  </div>
                  {run.note !== undefined && <span className="rail-run__note" data-rail-run-note>{run.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="rail-list rail-list--panels" aria-label="Panels">
              {props.rows.length === 0 ? (
                // M46 (spec §8.3). The one section that rendered NOTHING when
                // empty; every unconditionally rendered list owes an empty
                // state, and this one names the way out.
                <li className="rail-empty">no panels — ⌘N to start one</li>
              ) : (
                props.rows.map((row) => (
                  <RailPanelRow
                    key={row.id}
                    row={row}
                    selected={row.id === props.selectedId}
                    onGoTo={props.onGoToPanel}
                    onStart={props.onStartPanel}
                    merged={props.merged}
                    onClose={props.onClosePanel}
                  />
                ))
              )}
            </ul>
          )}
        </>
      )}
    </aside>
  )
}

export const Navigator = memo(NavigatorImpl)
