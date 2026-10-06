import { useEffect, useState, useSyncExternalStore, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { JiraPanel } from '@renderer/panels/panels'
import type { WorkItem } from '@shared/work-item'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { JiraTicket } from '@renderer/jira/JiraTicket'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { Refresh } from '@renderer/icons'
import { ConnectionBanner } from '@renderer/components/ConnectionBanner'
import { useNow } from '@renderer/components/useNow'
import { syncWord } from '@renderer/shell/integration-model'
import { OfflineCachedMark } from '@renderer/panels/offline-mark'
import { recoveryOffline, subscribeRecovery } from '@renderer/panels/recovery-store'

export function JiraNode(props: { panel: JiraPanel; selected: boolean; onSelect(id: string, additive?: boolean): void; onFocus(id: string): void; onBeginDrag(state: DragState): void; onClose(id: string): void; onSpawn(item: WorkItem): void; onAddToBoard(item: WorkItem): void; boardKeys?: ReadonlySet<string>; focusedId: string | null; restoreFocus(id: string): void; readOnly?: boolean; onBeginLink(panelId: string, event: ReactMouseEvent): void; linkTarget: boolean; onConnect(): void }): JSX.Element {
  const { panel } = props
  const [result, setResult] = useState<Awaited<ReturnType<typeof window.canvas.jira.list>> | null>(null)
  // M259. When the list was read — the header says how fresh, and stale past ten minutes.
  const [readAt, setReadAt] = useState<number | undefined>(undefined)
  const now = useNow(readAt !== undefined)
  const fresh = syncWord(readAt, now)
  const offlineAt = useSyncExternalStore(subscribeRecovery, () => recoveryOffline('jira'), () => recoveryOffline('jira'))
  const load = (): void => { void window.canvas.jira.list().then((r) => { setResult(r); if (r.kind === 'items') setReadAt(Date.now()) }).catch(() => setResult({ kind: 'unavailable', reason: 'Jira could not be reached.' })) }
  useEffect(() => { load() }, [])
  return (
    <PanelFrame
      id={panel.rect.id}
      kind="jira"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly ?? false}
      className="jira-node"
      title={panel.title ?? 'Jira tickets'}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={props.readOnly === true ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) } }}
      chrome={<>{readAt !== undefined && result !== null && result.kind === 'items' && (
        <span className="pf__summary sync-word" data-sync-stale={fresh.stale ? 'true' : 'false'} data-jira-fresh title={fresh.stale ? 'These tickets may no longer match Jira — refresh to read them again' : 'When these tickets were read from Jira'}>{fresh.stale ? `${fresh.word} · may be stale` : fresh.word}</span>
      )}
      {offlineAt !== null && <OfflineCachedMark source="jira" lastUpdated={offlineAt} />}
      <button type="button" className="jira-node__refresh icon-button" title="Read Jira again" aria-label="Read Jira again" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); load() }}><Refresh /></button></>}
    >
    <div className="pf__body pf__body--text jira-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
      {result === null ? <p className="pf__note" data-jira-arm="reading">Loading Jira tickets…</p> : result.kind === 'items' ? result.items.length === 0 ? <p className="pf__note" data-jira-arm="empty">No tickets are assigned to you.</p> : result.items.map((item) => <JiraTicket
        key={item.id} item={item}
        focusedId={props.focusedId} restoreFocus={props.restoreFocus}
        onSpawn={props.onSpawn} onAddToBoard={props.onAddToBoard} boardKeys={props.boardKeys} onWritten={load}
      />) : (
        // M259. The same contained banner as GitHub's: a REJECTED token now
        // offers its fix too (it offered none before — the arms disagreed).
        <ConnectionBanner service="Jira" fault={result.kind} reason={result.reason}
          noteClass="jira-node__note" noteAttrs={{ 'data-jira-arm': result.kind }}
          connectClass="jira-node__connect" connectAttrs={{ 'data-jira-connect': '' }}
          onConnect={props.onConnect} onRetry={load} />
      )}
    </div>
    </PanelFrame>
  )
}
