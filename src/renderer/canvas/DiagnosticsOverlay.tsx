import { useEffect, useRef, useState, type JSX } from 'react'
import { buildDiagnosticsSnapshot, type DiagnosticsInput } from './diagnostics-model'
import type { DiagnosticsSnapshot } from '@shared/ipc-contract'
import { Close } from '@renderer/icons'

const DIAGNOSTICS_SAMPLE_MS = 2000

export interface DiagnosticsOverlayProps {
  open: boolean
  onClose: () => void
  /**
   * Everything the renderer already knows, read fresh on each tick — never
   * fed to `useSyncExternalStore` directly, per `registry.all()`'s own
   * caution. This overlay's own interval is the ONLY thing that reads it, and
   * it runs only while mounted, which is only while `open` — so this poll
   * costs nothing when the overlay is closed and never touches
   * `registry.version()`.
   */
  getRendererInput: () => Omit<DiagnosticsInput, 'ipcMessagesPerSecond'>
}

/**
 * Backlog #75: which invariant just broke, at a glance. Cmd-gated, rendered
 * only while open — unlike `CanvasHud`, which is an always-on status strip
 * with no toggle at all (see its own comment on why that is a DIFFERENT
 * design, not a lighter version of this one).
 */
export function DiagnosticsOverlay({ open, onClose, getRendererInput }: DiagnosticsOverlayProps): JSX.Element | null {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null)
  const [exportResult, setExportResult] = useState<string | null>(null)
  const exportingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const tick = (): void => {
      void window.canvas.diagnostics.sample().then((main) => {
        if (cancelled) return
        setSnapshot(buildDiagnosticsSnapshot({ ...getRendererInput(), ipcMessagesPerSecond: main.ipcMessagesPerSecond }))
      })
    }
    tick()
    const timer = window.setInterval(tick, DIAGNOSTICS_SAMPLE_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, getRendererInput])

  if (!open) return null

  const onExport = (): void => {
    if (!snapshot || exportingRef.current) return
    exportingRef.current = true
    setExportResult('writing…')
    void window.canvas.diagnostics.export(snapshot).then((result) => {
      exportingRef.current = false
      setExportResult(result.ok ? result.path : `refused: ${result.reason}`)
    })
  }

  return (
    <div className="diagnostics-overlay" data-screen-control="" data-diagnostics-overlay>
      <div className="diagnostics-overlay__header">
        <span>Diagnostics</span>
        <button type="button" className="diagnostics-overlay__close icon-button" onClick={onClose} aria-label="Close">
          <Close />
        </button>
      </div>
      {!snapshot ? (
        <div className="diagnostics-overlay__note">reading…</div>
      ) : (
        <>
          <div className="diagnostics-overlay__row">
            <span>backend</span>
            <span>{snapshot.backend ? `${snapshot.backend.kind} (${snapshot.backend.reason})` : '—'}</span>
          </div>
          <div className="diagnostics-overlay__row">
            <span>live / budget</span>
            <span>
              {snapshot.liveCount} / {snapshot.budget}
              {snapshot.heldCount > 0 ? ` · ${snapshot.heldCount} held` : ''}
            </span>
          </div>
          <div className="diagnostics-overlay__row">
            <span>ipc rate</span>
            <span>{snapshot.ipcMessagesPerSecond === null ? '—' : `${snapshot.ipcMessagesPerSecond}/s`}</span>
          </div>
          <table className="diagnostics-overlay__table">
            <thead>
              <tr>
                <th>panel</th>
                <th>tier</th>
                <th>dormant</th>
                <th>spawned</th>
                <th>status</th>
                <th>pid</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.tier}</td>
                  <td>{s.dormant ? 'yes' : ''}</td>
                  <td>{s.spawned ? 'yes' : ''}</td>
                  <td>{s.status}</td>
                  <td>{s.pid ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="diagnostics-overlay__footer">
            <button type="button" onClick={onExport}>
              Export diagnostics
            </button>
            {exportResult && <span className="diagnostics-overlay__export-result">{exportResult}</span>}
          </div>
        </>
      )}
    </div>
  )
}
