import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { GithubPanel } from '@renderer/panels/panels'
import type { WorkItem } from '@shared/work-item'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { Refresh } from '@renderer/icons'
import { shellControl } from '@renderer/shell/shell-control'

/**
 * M88. THE GITHUB WORK NODE — Jira's shape reached by a second service: the
 * issues assigned to you and the pull requests waiting on your review, each
 * with a `Start session` that spawns an agent with the item as its opening
 * context through the ONE `spawnWorkItem` verb both work panels share.
 *
 * Three states, never two: loading, the reason (with `Connect GitHub…` when
 * the arm is no-credential — the same door the palette's row opens), and the
 * list, whose own empty arm says so. A `note` beside the list says when the
 * pull requests alone could not be read, so half an answer is not mistaken
 * for a whole one. Sessionless: no spec, no tier, no kill.
 */
export interface GithubNodeProps {
  panel: GithubPanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  onSpawn: (item: WorkItem) => void
  /** M113. Add to board — an upsert by the item's key. */
  onAddToBoard: (item: WorkItem) => void
  /** M113. Keys already on the board: the row reads `On board`, still pressable. */
  boardKeys?: ReadonlySet<string>
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
  onConnect: () => void
}

/** An item's KIND, from its state word — the one fact the row must say before the state (M88's critic). */
const isPullRequest = (item: WorkItem): boolean => item.state === 'pull request' || item.state === 'review requested'

export function GithubNode(props: GithubNodeProps): JSX.Element {
  const { panel } = props
  const [result, setResult] = useState<Awaited<ReturnType<typeof window.canvas.github.list>> | null>(null)
  // M113. `Added` for two seconds, per row — a useState, never a store: the
  // board's records are the source of truth and this is only the button's
  // own acknowledgement of a press.
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (added.size === 0) return
    const t = setTimeout(() => setAdded(new Set()), 2000)
    return () => clearTimeout(t)
  }, [added])
  const load = (): void => {
    setResult(null)
    void window.canvas.github.list(panel.rect.id).then(setResult).catch(() => setResult({ kind: 'unavailable', reason: 'GitHub could not be reached.' }))
  }
  useEffect(() => { load() }, [])
  return (
    <PanelFrame
      id={panel.rect.id}
      kind="github"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly ?? false}
      className="github-node"
      rootAttrs={{ 'data-github-node': '' }}
      title={panel.title ?? 'GitHub work'}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={props.readOnly === true ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) } }}
      chrome={<>
        {result !== null && result.kind === 'items' && (
          <span className="pf__summary github-node__summary" data-github-summary>{(() => {
            const prs = result.items.filter(isPullRequest).length
            const issues = result.items.length - prs
            if (result.items.length === 0) return 'nothing assigned'
            return [issues > 0 ? `${issues} issue${issues === 1 ? '' : 's'}` : null, prs > 0 ? `${prs} review${prs === 1 ? '' : 's'}` : null].filter((x) => x !== null).join(' · ')
          })()}</span>
        )}
        <button type="button" className="pf__control icon-button" data-github-refresh title="Read GitHub again" aria-label="Read GitHub again" {...shellControl(load)}><Refresh /></button>
      </>}
    >
      <div className="pf__body pf__body--text github-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
        {result === null ? (
          <p className="pf__note" data-github-arm="reading">reading GitHub…</p>
        ) : result.kind === 'items' ? (
          <>
            {/* Provenance, the memory node's own dim line: what this list is a list OF. */}
            <p className="github-node__scope">assigned to you · reviews requested of you</p>
            {result.note !== undefined && <p className="pf__note github-node__note" data-github-note>{result.note}</p>}
            {result.items.length === 0 ? (
              <p className="pf__note" data-github-arm="empty">nothing assigned to you, and no review waiting on you</p>
            ) : (
              <ul className="github-node__list">
                {result.items.map((item) => (
                  <li key={item.id} className="github-item" data-github-item={item.id}>
                    <div className="github-item__head">
                      <span className="github-item__id">{item.id}</span>
                      <span className="github-item__state">{isPullRequest(item) ? 'pull request' : 'issue'}{item.state !== null && item.state !== 'pull request' ? ` · ${item.state}` : ''}</span>
                    </div>
                    <p className="github-item__title">{item.title}</p>
                    {item.description !== '' && <p className="github-item__body">{item.description.split('\n')[0]}</p>}
                    <div className="github-item__verbs">
                      {/* DISABLED with its reason under the merged view, never removed. */}
                      <button type="button" className="pf__verb pf__verb--word" data-github-start disabled={props.readOnly === true}
                        title={props.readOnly === true ? 'leave merged view to start' : `Start an agent on ${item.id}`}
                        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); if (props.readOnly !== true) props.onSpawn(item) }}>Start session</button>
                      <button type="button" className="pf__verb pf__verb--word" data-work-add={item.id} disabled={props.readOnly === true}
                        title={props.readOnly === true ? 'leave merged view to add' : `Put ${item.id} on the board — a second press updates it`}
                        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); if (props.readOnly === true) return; props.onAddToBoard(item); setAdded((s) => new Set(s).add(item.id)) }}>{added.has(item.id) ? 'Added' : props.boardKeys?.has(item.id) ? 'On board' : 'Add to board'}</button>
                      <a className="github-item__link" href={item.url} data-github-link onMouseDown={(e) => e.stopPropagation()}
                        onAuxClick={(e) => { e.preventDefault() }}
                        onClick={(e) => { e.preventDefault(); void window.canvas.links.open({ panelId: panel.rect.id, target: item.url }) }}>Open on GitHub</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="pf__note github-node__note" data-github-arm={result.kind}>{result.reason}</p>
            {/* A rejected credential's fix is the same door: offer it. */}
            {(result.kind === 'no-credential' || result.kind === 'rejected') && (
              <button type="button" className="pf__verb pf__verb--word github-node__connect" data-github-connect
                title="Add a GitHub token (opens the palette's Credentials scope)"
                {...shellControl(props.onConnect)}>
                Connect GitHub…
              </button>
            )}
          </>
        )}
      </div>
    </PanelFrame>
  )
}
