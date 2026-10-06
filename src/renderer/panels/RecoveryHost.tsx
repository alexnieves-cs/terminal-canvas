import { useEffect, useRef, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useSyncExternalStore } from 'react'
import { restartKeepsPanel } from '@shared/exit-explain'
import { notify } from '@renderer/shell/toast'
import { shellControl } from '@renderer/shell/shell-control'
import { OfflineCachedMark } from './offline-mark'
import { applyRecovery, getRecoveryView, recoveryVisible, subscribeRecovery, takeOfflineToast, toastRevision } from './recovery-store'

/**
 * M447. Screen 09, mounted from the recovery slot L-B left (the unfinished
 * work notice already renders inside it). The banner is the host. A crash
 * card is one restart. A reattaching panel is skeleton rows, never an empty
 * well. Outstanding recovery stays here; the toast is only the offline
 * transition, which has already finished. Each verb carries aria-label
 * because labels.1 does not read a `{view.reconnect}` child as text.
 */
export function RecoveryHost(): JSX.Element | null {
  const view = useSyncExternalStore(subscribeRecovery, getRecoveryView, getRecoveryView)
  const rev = useSyncExternalStore(subscribeRecovery, toastRevision, toastRevision)
  const seen = useRef(0)
  useEffect(() => {
    if (rev === seen.current) return
    seen.current = rev
    const pending = takeOfflineToast()
    if (pending !== null) notify(pending)
  }, [rev])
  useEffect(() => {
    if (view.crashes.length === 0) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.key !== 'Enter' || event.shiftKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      event.preventDefault()
      restart(view.crashes[0].panelId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view.crashes])
  if (!recoveryVisible(view)) return null
  return (
    <div className="recovery-host" data-recovery-host="" data-tone="needs-you">
      {view.banner !== null && (
        <section className="recovery-banner" role="status" data-recovery-banner="">
          <p className="recovery-banner__copy">{view.banner}</p>
          <div className="recovery-banner__verbs">
            {view.retry !== null && <span className="recovery-banner__retry" data-recovery-retry="">{view.retry}</span>}
            <button type="button" className="pf__verb pf__verb--word" data-recovery-reconnect="" aria-label={view.reconnect} {...shellControl(() => applyRecovery({ type: 'reconnect', at: Date.now() }))}>{view.reconnect}</button>
            <button type="button" className="pf__verb pf__verb--word" data-recovery-details="" aria-label={view.details} {...shellControl(() => applyRecovery({ type: 'toggle-details' }))}>{view.details}</button>
          </div>
          {view.detailsOpen && (
            <ul className="recovery-banner__list" data-recovery-detail="">
              {view.showDetails.map((pane) => (
                <li key={pane.panelId} data-recovery-pane={pane.panelId}>{pane.panelId}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {view.bootIssue !== null && <p className="recovery-boot" data-boot-issue="" role="alert">{view.bootIssue}</p>}
      <div className="recovery-frames">
        {view.paused.filter((frame) => !terminalPaints(frame.panelId)).map((frame) => (
          <article key={frame.panelId} className="recovery-frame" data-recovery-frame="paused" data-keys-blocked="" data-tone="needs-you">
            <p className="recovery-frame__line">{frame.line}</p>
            <p className="recovery-frame__keys">{frame.keys}</p>
          </article>
        ))}
        {view.reattaching.filter((frame) => !terminalPaints(frame.panelId)).map((frame) => (
          <article key={frame.panelId} className="recovery-frame" data-recovery-frame="reattaching" data-recovery-skeleton="" data-tone="starting" aria-busy="true">
            <span className="recovery-skeleton" />
            <span className="recovery-skeleton" />
            <span className="recovery-skeleton" />
          </article>
        ))}
        {view.crashes.map((frame) => (
          <article key={frame.panelId} className="recovery-frame recovery-frame--crash" data-recovery-frame="crashed" data-tone="exited" onKeyDown={(event) => onCrashKey(event, frame.panelId)}>
            <h2 className="recovery-frame__title">{frame.title}</h2>
            <p className="recovery-frame__explain">{frame.explain}</p>
            <p className="recovery-frame__kept">{frame.kept}</p>
            {frame.prompt !== null && <p className="recovery-frame__prompt" data-recovery-prompt="">{frame.prompt}</p>}
            <div className="recovery-frame__verbs">
              <button type="button" className="pf__verb pf__verb--word recovery-frame__primary" data-recovery-restart={frame.panelId} aria-label={frame.restart} {...shellControl(() => restart(frame.panelId))}>{frame.restart}</button>
              <button type="button" className="pf__verb pf__verb--word" data-recovery-log={frame.panelId} aria-label={frame.log} {...shellControl(() => readLog(frame.panelId))}>{frame.log}</button>
            </div>
          </article>
        ))}
        {view.offline.map((frame) => (
          <OfflineCachedMark key={frame.source} source={frame.source} lastUpdated={lastUpdatedOf(frame.line)} />
        ))}
      </div>
    </div>
  )
}

/** A terminal with this id paints its own paused or reattaching frame. The overlay stays for a catalog id that is not a panel. */
function terminalPaints(panelId: string): boolean {
  if (typeof document === 'undefined') return false
  return document.querySelector(`[data-panel-id="${CSS.escape(panelId)}"][data-panel-kind="terminal"]`) !== null
}

function lastUpdatedOf(line: string): string {
  const mark = 'last updated '
  const at = line.lastIndexOf(mark)
  return at === -1 ? line : line.slice(at + mark.length)
}

function restart(panelId: string): void {
  const kept = restartKeepsPanel(panelId)
  applyRecovery({ type: 'restart', panelId: kept })
  const door = (window as unknown as { __rdLF?: { onRestart?: (id: string) => void } }).__rdLF
  door?.onRestart?.(kept)
}

function readLog(panelId: string): void {
  const door = (window as unknown as { __rdLF?: { onReadLog?: (id: string) => void } }).__rdLF
  door?.onReadLog?.(panelId)
}

function onCrashKey(event: ReactKeyboardEvent, panelId: string): void {
  if (!event.metaKey || event.key !== 'Enter') return
  event.preventDefault()
  restart(panelId)
}
