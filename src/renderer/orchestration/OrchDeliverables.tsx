import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isChatPanel } from '@renderer/panels/panels'
import { shellControl } from '@renderer/shell/shell-control'
import { displayPath } from '@shared/display-path'
import type { PersistedWorkItem } from '@shared/work-items'
import type { ReviewIdentity } from '@shared/review-identity'
import {
  collectDeliverables, deliverablesAccount, producerWord, taskHandoffMarkdown,
  type Deliverable, type DeliverableStatus, type LivePanel, type TaskEvidence
} from '@shared/task-deliverables'
import { createSubjectGate } from './orch-subject-gate'
import { compareRecipeRuns, lastSuccessfulRun, recipeOutcome } from '@shared/recipe-portability'

/**
 * M320. THE TASK'S DELIVERABLES — what it produced, where each thing came
 * from, and whether its evidence still applies, read from the durable record
 * rather than from whatever panels happen to be open. The model is
 * `shared/task-deliverables.ts`; this renders its answer and decides nothing.
 *
 * Every status is a WORD beside the row (current · modified since review ·
 * evidence for an older revision · missing · superseded · unknown), never
 * colour alone, and every non-current one says why.
 */

export interface DeliverablesSubject {
  itemId: string
  title: string
  lane?: { path: string }
  chatId?: string
  memberIds: readonly string[]
}

type Read =
  | { kind: 'idle' }
  | { kind: 'loading'; key: string }
  | { kind: 'unwired'; key: string }
  | { kind: 'read'; key: string; evidence: TaskEvidence; identities: Map<string, ReviewIdentity | null> }

const STATUS_WORD: Record<DeliverableStatus, string> = {
  current: 'current',
  modified: 'modified since review',
  missing: 'missing',
  superseded: 'superseded',
  stale: 'older revision',
  unknown: 'unknown',
  pending: 'expected'
}

const KIND_WORD: Record<Deliverable['kind'], string> = {
  file: 'file', review: 'review', check: 'check', capture: 'capture', merge: 'merge', pr: 'pull request', receipt: 'integration', conversation: 'conversation', expected: 'expected'
}

function stamp(at: number): string {
  return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** The check commands a deliverables list shows passing / failing on its newest run of each. */
function checkTally(list: readonly Deliverable[]): { passed: string[]; failed: string[] } {
  const newest = list.filter((d) => d.kind === 'check' && d.status !== 'superseded')
  return {
    passed: newest.filter((d) => d.title.startsWith('Passed: ')).map((d) => d.subject),
    failed: newest.filter((d) => d.title.startsWith('Failed ')).map((d) => d.subject)
  }
}

export function OrchDeliverables({ subject, item, workItems = [], panels, refresh, onOpenPath }: {
  subject: DeliverablesSubject
  item: PersistedWorkItem | undefined
  /** M321. Every task on the board — where the last successful run of the same recipe is found. */
  workItems?: readonly PersistedWorkItem[]
  panels: readonly Panel[]
  refresh: number
  onOpenPath?: (path: string) => void
}): JSX.Element {
  const [read, setRead] = useState<Read>({ kind: 'idle' })
  const [exported, setExported] = useState<string | null>(null)
  // M321. The last SUCCESSFUL run of this task's recipe, and its evidence —
  // read once per task so a reuse can be set beside the run it reused.
  const previous = item === undefined ? undefined : lastSuccessfulRun(workItems, item)
  const [prevEvidence, setPrevEvidence] = useState<{ id: string; evidence: TaskEvidence | null } | null>(null)
  useEffect(() => {
    if (previous === undefined || typeof window.canvas?.tasks?.evidence !== 'function') return
    let live = true
    const id = previous.id
    void window.canvas.tasks.evidence({ itemId: id, panelIds: previous.panelId === undefined ? [] : [previous.panelId] })
      .then((e) => { if (live) setPrevEvidence({ id, evidence: e }) }, () => { if (live) setPrevEvidence({ id, evidence: null }) })
    return () => { live = false }
  }, [previous?.id, refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const gate = useRef(createSubjectGate()).current
  const panelIds = useMemo(() => [...new Set([...subject.memberIds, ...(subject.chatId === undefined ? [] : [subject.chatId]), ...(item?.panelId === undefined ? [] : [item.panelId])])], [subject.memberIds, subject.chatId, item?.panelId])
  const key = `${subject.itemId}:${subject.lane?.path ?? ''}:${panelIds.join(' ')}`
  useEffect(() => {
    gate.move(key)
    if (typeof window.canvas?.tasks?.evidence !== 'function') { setRead({ kind: 'unwired', key }); return }
    let live = true
    const ticket = gate.ask(key)
    setRead({ kind: 'loading', key })
    void (async () => {
      const evidence = await window.canvas.tasks.evidence({ itemId: subject.itemId, panelIds, ...(subject.lane === undefined ? {} : { root: subject.lane.path }) })
      // The lane's identity NOW, at every base a piece of evidence was taken
      // against — an identity only compares at its own base. No lane: null,
      // which the model reads as "cannot be compared", never "current".
      const bases = new Set<string>()
      if (item?.reviewed?.identity !== undefined) bases.add(item.reviewed.identity.base)
      for (const c of Object.values(evidence.checks)) if (c?.tested !== undefined) bases.add(c.tested.base)
      for (const c of evidence.commands) if (c.tested !== undefined) bases.add(c.tested.base)
      const identities = new Map<string, ReviewIdentity | null>()
      for (const base of bases) {
        if (subject.lane === undefined) { identities.set(base, null); continue }
        identities.set(base, await window.canvas.review.identity({ root: subject.lane.path, base }).catch(() => null))
      }
      if (live && gate.lands(ticket)) setRead({ kind: 'read', key, evidence, identities })
    })().catch(() => { if (live && gate.lands(ticket)) setRead({ kind: 'unwired', key }) })
    return () => { live = false }
  }, [key, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const livePanels = useMemo((): LivePanel[] => panels.map((p) => ({
    id: p.rect.id, kind: p.kind,
    ...(p.title === undefined ? {} : { title: p.title }),
    ...(isChatPanel(p) && p.chat.backend !== undefined ? { backend: p.chat.backend } : {})
  })), [panels])

  if (item === undefined) return <p className="orch__caption" data-orch-deliverables="no-task">This task is no longer on the board, so its deliverables cannot be gathered here.</p>
  if (read.kind === 'idle' || read.kind === 'loading') return <p className="orch__caption" role="status">Gathering the task's deliverables…</p>
  if (read.kind === 'unwired') return <p className="orch__review-words" data-orch-deliverables="unwired">The task's record could not be read in this build — this is not a claim that it produced nothing.</p>

  const list = collectDeliverables({
    item, events: read.evidence.events, commands: read.evidence.commands, checks: read.evidence.checks,
    files: read.evidence.files, receipts: read.evidence.receipts, panels: livePanels,
    capturesOnDisk: new Set(read.evidence.captures), identities: read.identities
  })
  const account = deliverablesAccount(list)
  // M321. This run beside the last success of the same recipe, fact by fact.
  const comparison = (() => {
    if (previous === undefined) return null
    const pe = prevEvidence !== null && prevEvidence.id === previous.id ? prevEvidence.evidence : undefined
    const prevList = pe === undefined || pe === null ? undefined : collectDeliverables({ item: previous, events: pe.events, commands: pe.commands, checks: pe.checks, files: pe.files, receipts: pe.receipts, panels: livePanels })
    return compareRecipeRuns(
      { item, outcome: recipeOutcome(item, checkTally(list)) },
      { item: previous, outcome: recipeOutcome(previous, prevList === undefined ? undefined : checkTally(prevList)) }
    )
  })()
  const doExport = (): void => {
    setExported('exporting…')
    const markdown = taskHandoffMarkdown(item, list, Date.now())
    void window.canvas.tasks.exportHandoff({ itemId: item.id, title: item.title, markdown }).then((r) => {
      setExported(r.kind === 'written' ? `Written to ${displayPath(r.path).short}${r.redacted > 0 ? ` · ${r.redacted} secret${r.redacted === 1 ? '' : 's'} redacted` : ''}` : r.kind === 'cancelled' ? null : `Not exported — ${r.reason}`)
    }, () => setExported('Not exported — the export did not answer'))
  }
  return (
    <section className="orch__deliverables" data-orch-deliverables={list.length} aria-label="Deliverables">
      <div className="orch__section-head">
        <div className="orch__section-title">Deliverables</div>
        <span className="orch__roster-actions">
          <button type="button" className="orch__mini" data-orch-deliverables-export {...shellControl(doExport)}>Export hand-off…</button>
        </span>
      </div>
      <p className="orch__caption" data-orch-deliverables-account>
        {account.line}. A file is a <strong>live reference</strong> (read as it is now) unless a review captured its content — then a change since is named.
        {read.evidence.reachedStart ? '' : ' The record held more than one read covers, so older entries may be missing here.'}
      </p>
      {exported !== null && <p className="orch__caption" data-orch-deliverables-exported role="status">{exported}</p>}
      {comparison !== null && previous !== undefined && (
        <details className="orch__brief" data-orch-deliverables-compare={previous.id} open>
          <summary className="orch__brief-summary">Compared with the last successful run of this recipe — “{previous.title}”</summary>
          <ul className="orch__control-notes">{comparison.map((line) => <li key={line} className="orch__caption">{line}</li>)}</ul>
        </details>
      )}
      <ul className="orch__review-files" aria-label="Deliverables">
        {list.map((d) => (
          <li key={d.id} data-orch-deliverable={d.kind} data-orch-deliverable-status={d.status}>
            <button type="button" className="orch__activity-row orch__check-row"
              disabled={!(d.kind === 'file' && onOpenPath !== undefined && d.status !== 'missing')}
              title={d.why === '' ? d.subject : `${d.subject} — ${d.why}`}
              {...shellControl(() => { if (d.kind === 'file' && d.status !== 'missing') onOpenPath?.(d.subject) })}>
              <span className="orch__check-outcome" data-outcome={d.status === 'current' ? 'passed' : d.status === 'missing' || d.status === 'modified' ? 'failed' : 'unknown'}>{KIND_WORD[d.kind]}</span>
              <span className="orch__activity-title">{d.kind === 'file' ? <code>{displayPath(d.title).short}</code> : d.title}</span>
              <span className="orch__activity-detail">
                {STATUS_WORD[d.status]}{d.kind === 'file' ? ` · ${d.reference === 'captured' ? 'captured version' : 'live reference'}` : ''}
                {d.why === '' ? '' : ` — ${d.why}`}
                {d.kind === 'expected' ? '' : ` · ${producerWord(d.producedBy)} · ${stamp(d.at)}`}
                {d.revision === undefined ? '' : ` · at ${d.revision.base.slice(0, 7)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
