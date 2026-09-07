import { memo, useEffect, useMemo, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { ToolboxPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { applyToolbox, useToolbox } from '@renderer/session/toolbox-store'
import { buildToolboxNodeModel } from './toolbox-node-model'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { Refresh } from '@renderer/icons'
import { displayPath } from '@shared/display-path'

export interface ToolboxNodeProps {
  panel: ToolboxPanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  /**
   * The same onFocus a file panel's body calls, and it buys the same thing:
   * `shouldYieldWheel`'s rule 3 gives the wheel to the FOCUSED panel, so an
   * unfocused toolbox node would pan the canvas instead of scrolling its own
   * list. It costs nothing, because a toolbox node never reaches assignTiers
   * at all — Canvas partitions it out before tiering, so a focused id naming
   * one consumes no LIVE_BUDGET slot.
   */
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  /**
   * Shown inside another workspace's lane in M14's merged view, where
   * geometry is read-only. Named `readOnly` to match ReviewNode's and
   * FileNode's own prop of the same name — Canvas.tsx passes `merged`
   * under this name at every one of the five call sites. Suppresses the
   * port handles: addLink there would write to a workspace record this
   * canvas does not own.
   */
  readOnly?: boolean
  /**
   * Begins a link drag from one of this node's four port handles (M35,
   * Task 7). Required on TerminalPanel's own `onBeginLink`'s precedent: an
   * optional prop here compiles clean on a missed wiring and produces "the
   * ring never appears for toolbox nodes" — a feature that reads as
   * unbuilt, `PanelRow.agent`'s own lesson.
   */
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  /** M140. Open a row's own file in the file panel — M22's editor, the one write door. */
  onOpenFile: (path: string) => void
  /**
   * Whether an in-flight link draw would land on THIS node if released now
   * (M35, Task 7 fix round 1). Required on TerminalPanel's own `linkTarget`
   * precedent: an optional prop here compiles clean on a missed wiring and
   * produces "the ring never appears for toolbox nodes" — the exact gap a
   * required `onBeginLink` did not itself catch, because a component that
   * never declares a prop at all has nothing to omit.
   */
  linkTarget: boolean
}

/**
 * What the agent in one directory can actually do, on the canvas beside it.
 *
 * Reuses `.panel` and `data-panel-id` DELIBERATELY, exactly as ReviewNode and
 * FileNode do: drag, resize, selection, the pointer corrector and
 * `shouldYieldWheel`'s `closest('.panel')` all key off them, so a bespoke class
 * would mean reimplementing five behaviours that already work.
 *
 * It owns its OWN read rather than receiving one from Canvas, the rule
 * FileNode and ReviewNode already state: lifting the read into Canvas would
 * make every config change a Canvas re-render, the 60Hz cascade the memo
 * architecture exists to prevent, arriving through a new door.
 *
 * PULL, never push — there is no watcher and no `toolbox:changed` event. Half
 * this feature's sources are shared by every panel on the canvas, so a
 * panel-keyed watcher would arm twelve of them on the same four paths; see
 * `IPC.TOOLBOX_READ`'s own comment. `readAt` is rendered for exactly that
 * reason: a stale node is honest rather than silently wrong.
 */
function ToolboxNodeImpl({
  panel, selected, onSelect, onFocus, onBeginDrag, onClose,
  readOnly = false, onBeginLink, linkTarget, onOpenFile
}: ToolboxNodeProps): JSX.Element {
  const { rect, z } = panel
  const id = rect.id
  const cwd = panel.source.cwd
  const result = useToolbox(id)
  // A refresh is a re-run of the effect below rather than a second read path,
  // so "read" and "re-read" cannot drift.
  const [refreshToken, setRefreshToken] = useState(0)

  const model = useMemo(
    // Keyed on the three INPUTS, never on a serialised signature of the
    // output — ReviewNode's own comment records what the signature version
    // cost. Canvas hands a new `panel` object on every drag frame, but
    // `source` and `title` ride by REFERENCE through setPanelRect's
    // `{ ...p, rect }`, and `result` is store state a drag does not touch.
    () => buildToolboxNodeModel({ source: panel.source, title: panel.title, result }),
    [panel.source, panel.title, result]
  )

  useEffect(() => {
    let live = true
    void window.canvas.toolbox
      .read({ panelId: id, cwd })
      .then((r) => {
        if (live) applyToolbox(id, r)
      })
      .catch(() => {
        // MANDATORY. An unhandled rejection leaves the node stuck on
        // "reading…" forever, with nothing in any log — the same permanent
        // in-flight state FileNode's own catch exists to prevent.
        if (live) applyToolbox(id, { kind: 'no-cwd' })
      })
    return () => {
      live = false
    }
  }, [id, cwd, refreshToken])

  return (
    <PanelFrame
      id={id}
      kind="toolbox"
      rect={rect}
      z={z}
      selected={selected}
      linkTarget={linkTarget}
      readOnly={readOnly}
      title={model.heading}
      onSelect={onSelect}
      onBeginDrag={onBeginDrag}
      onBeginLink={onBeginLink}
      close={readOnly ? null : { armed: false, title: 'Close this toolbox', armedText: '', onMouseDown: (event) => { event.stopPropagation(); event.preventDefault(); onClose(id) } }}
      chrome={<>
        <span className="pf__summary toolbox-node__summary" data-toolbox-summary>{model.summary}</span>
        <button
          type="button"
          className="toolbox-node__refresh icon-button"
          title="Read this directory's config again"
          onMouseDown={(event) => {
            // preventDefault keeps DOM focus off this button and on whatever
            // had it — shellControl's rule. stopPropagation is what stops the
            // header's own handler starting a DRAG from a click inside it.
            event.stopPropagation()
            event.preventDefault()
            setRefreshToken((n) => n + 1)
          }}
        >
          <Refresh />
        </button>
      </>}
    >


      <div
        className="pf__body pf__body--text toolbox-node__body"
        // The element that actually scrolls carries the marker, which is why
        // shouldYieldWheel needed no edit for this kind.
        data-scroll-host
        onMouseDown={(event) => {
          event.stopPropagation()
          onSelect(id)
          onFocus(id)
        }}
        // Every key, not only the ones handled: useViewport's keydown listener
        // is on `window`, above this in the bubble path.
        onKeyDown={(event) => event.stopPropagation()}
      >
        {/* M164. The path rule. */}
        <p className="toolbox-node__directory" data-toolbox-directory title={model.directory}>{displayPath(model.directory).short}</p>

        {model.stale && (
          // A fact about FILES, never a claim about the running agent, and
          // deliberately NOT a restart button: restartPanel exists, which is
          // what would make killing a working agent one click from an mtime.
          <p className="toolbox-node__stale" data-toolbox-stale>{model.staleNote}</p>
        )}

        {model.note !== undefined && (
          <p className="pf__note toolbox-node__note" data-toolbox-note>{model.note}</p>
        )}

        {model.groups.map((group) => (
          <section className="toolbox-node__group" key={group.kind} data-toolbox-group={group.kind}>
            <h4 className="toolbox-node__group-heading">
              {group.label} <span className="toolbox-node__count">{group.rows.length + group.more}</span>
            </h4>
            <ul className="toolbox-node__list">
              {group.rows.map((row) => (
                <li
                  className={`toolbox-node__row${row.muted ? ' toolbox-node__row--muted' : ''}`}
                  key={row.id}
                  data-toolbox-row={row.name}
                >
                  <span className="toolbox-node__name">{row.name}</span>
                  <span className="toolbox-node__scope">{row.scope}</span>
                  {row.state !== '' && <span className="toolbox-node__state">{row.state}</span>}
                  {row.detail !== '' && <span className="toolbox-node__detail">{row.detail}</span>}
                  {/* M140. The Open door: the row's own file in the file panel. A
                      deliberate edit of the file, never a one-click toggle — the
                      entry's argument for hooks, permissions and MCP servers. */}
                  <button type="button" className="rail-row__verb toolbox-node__open" data-toolbox-open={row.name}
                    title={`Open ${row.sourcePath} in a file panel`}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onOpenFile(row.sourcePath) }}>open</button>
                </li>
              ))}
            </ul>
            {group.more > 0 && (
              // COUNTED and reported, never a list that silently stops — the
              // rule REVIEW_FILE_CAP already states.
              <p className="pf__more toolbox-node__more">+{group.more} more</p>
            )}
          </section>
        ))}

        {model.permissions.length > 0 && (
          <section className="toolbox-node__group" data-toolbox-group="permissions">
            <h4 className="toolbox-node__group-heading">Permissions</h4>
            <ul className="toolbox-node__list">
              {/* Per FILE, never merged: this app cannot verify whether the CLI
                  unions allow-lists across the three settings files or takes
                  the highest-precedence one, and one "effective" list would be
                  a confident answer to a question nothing here can settle. */}
              {model.permissions.map((perm) => (
                <li className="toolbox-node__row" key={perm.path}>
                  <span className="toolbox-node__name">
                    {perm.path.slice(perm.path.lastIndexOf('/') + 1)}
                  </span>
                  <span className="toolbox-node__scope">{perm.scope}</span>
                  <span className="toolbox-node__detail">
                    allow {perm.allow} · deny {perm.deny} · ask {perm.ask}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {model.unresolved.length > 0 && (
          <section className="toolbox-node__group" data-toolbox-group="unresolved">
            <h4 className="toolbox-node__group-heading">Not readable here</h4>
            {/* Reported as NAMES rather than dropped, and never invented as
                rows pointing at files that do not exist. */}
            <ul className="toolbox-node__list">
              {model.unresolved.map((name) => (
                <li className="toolbox-node__row toolbox-node__row--muted" key={name}>
                  <span className="toolbox-node__name">{name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {model.readAt > 0 && (
          // Rendered rather than hidden: this is a PULL model with no watcher,
          // so saying when it last read is what makes a stale node honest.
          <p className="toolbox-node__read-at" data-toolbox-read-at>
            read {new Date(model.readAt).toLocaleTimeString()}
          </p>
        )}
      </div>

    </PanelFrame>
  )
}

export const ToolboxNode = memo(ToolboxNodeImpl)
