import { useEffect, useRef, useState, type JSX } from 'react'
import { outward } from '@shared/outward'
import { checkOutputDisplay, type CheckOutputRead } from '@shared/check-output'
import { displayPath } from '@shared/display-path'

/**
 * M306. ONE CHECK RUN, OPENED — its exact output beside the facts that make
 * it evidence: the command, the directory, when it ran and for how long, how
 * it ended, and which revision it tested.
 *
 * Every surface that shows a check outcome (Orchestrate's Checks tab, the
 * review node's task section, the return briefing) opens a run through THIS,
 * so the words for "no record" are said once. A record read is a pull by the
 * run's id; the id comes from the ledger row or the watcher's state, never
 * from a panel, so a later command in the same terminal cannot answer for
 * this one — the whole point, since the old fallback was the session's tail
 * NOW, which may be several commands later.
 *
 * The text passes `outward` like every other body this app renders from a
 * process — the stored record stays exact, the screen is redacted.
 */

type Read = { kind: 'loading' } | CheckOutputRead

export function useCheckOutput(outputId: string | undefined): Read | null {
  const [read, setRead] = useState<Read | null>(outputId === undefined ? null : { kind: 'loading' })
  useEffect(() => {
    if (outputId === undefined) { setRead(null); return }
    const door = window.canvas?.ledger?.output
    if (typeof door !== 'function') { setRead({ kind: 'unreadable', why: 'this build cannot read check output' }); return }
    let live = true
    setRead({ kind: 'loading' })
    void door(outputId).then(
      (got) => { if (live) setRead(got) },
      (e: unknown) => { if (live) setRead({ kind: 'unreadable', why: e instanceof Error ? e.message : 'the read failed' }) }
    )
    return () => { live = false }
  }, [outputId])
  return read
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`
  const m = Math.floor(s / 60)
  return `${m} min ${Math.round(s - m * 60)} s`
}

export function endedWords(exitCode: number | null, signal: string | null): string {
  if (signal === 'removed') return 'removed while running — no exit'
  if (signal !== null) return `stopped by ${signal}`
  if (exitCode === null) return 'ended with no exit code recorded'
  return `exit ${exitCode}`
}

export function CheckRunOutput({ outputId, subject, fallback }: {
  outputId: string | undefined
  /** Redaction's source label — the panel the run belongs to. */
  subject: string
  /** What to say when this run has no record (a pre-M306 row, an agent's own command). */
  fallback?: string
}): JSX.Element {
  const read = useCheckOutput(outputId)
  const preRef = useRef<HTMLPreElement | null>(null)
  const record = read?.kind === 'ok' ? read.record : null
  // The END is where a failing run says why: open scrolled there.
  useEffect(() => {
    const el = preRef.current
    if (el !== null && record !== null) el.scrollTop = el.scrollHeight
  }, [record])
  if (read === null) {
    return <p className="check-run__none" data-check-run="none">{fallback ?? 'This run has no output record — it predates output capture, or it ran inside an agent\'s own process.'}</p>
  }
  if (read.kind === 'loading') return <p className="check-run__none" data-check-run="loading">Reading the run's output…</p>
  if (read.kind === 'missing') return <p className="check-run__none" data-check-run="missing">This run's output is no longer kept — only the most recent runs are.</p>
  if (read.kind === 'unreadable') return <p className="check-run__none" data-check-run="unreadable">The run's output could not be read: {read.why}</p>
  const r = read.record
  const text = outward(checkOutputDisplay(r), subject).text
  return (
    <div className="check-run" data-check-run="ok" data-check-run-id={r.runId}>
      <dl className="check-run__facts">
        <dt>Command</dt><dd><code>{r.command}</code></dd>
        <dt>Directory</dt><dd title={r.cwd}>{displayPath(r.cwd).short}</dd>
        <dt>Ran</dt><dd>{new Date(r.startedAt).toLocaleString()} · {formatDuration(r.endedAt - r.startedAt)}</dd>
        <dt>Ended</dt><dd data-check-run-ended>{endedWords(r.exitCode, r.signal)}</dd>
        <dt>Tested</dt><dd>{r.tested === undefined ? 'revision not recorded' : `${r.tested.base.slice(0, 10)} · content ${r.tested.content.slice(0, 8)}`}</dd>
        <dt>Witness</dt><dd>{r.source === 'watcher' ? 'a watcher this canvas ran' : r.source === 'setup' ? 'the repository setup, preparing a lane' : 'a shell command this canvas watched exit'}</dd>
      </dl>
      <pre ref={preRef} className="check-run__log" aria-label="Check output" tabIndex={0}>{text === '' ? 'The run printed nothing.' : text}</pre>
      {r.elided > 0 && <p className="check-run__note">{r.elided.toLocaleString('en-US')} characters from the middle of the run were not kept; the start and the end are shown whole.</p>}
    </div>
  )
}
