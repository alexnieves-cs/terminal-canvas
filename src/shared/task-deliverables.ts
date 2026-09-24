import { BACKENDS, BACKEND_IDS, type AgentBackend } from './agent-backends'
import type { EventRow, RunRow } from './run-ledger'
import { sameReviewIdentity, type ReviewIdentity } from './review-identity'
import type { PersistedWorkItem } from './work-items'
import type { IntegrationReceipt } from './integration'

/**
 * M320. A TASK'S DELIVERABLES — one dependable place to establish, long
 * after the fact, exactly what a task produced, where each thing came from,
 * and whether its evidence still applies.
 *
 * The pieces all existed, scattered by kind: a review mark on the card, the
 * paths it covered as a timeline row, check runs as their own output records
 * keyed by PANEL, captures only as an image panel's field (delete the panel,
 * lose the provenance), a merge on the card, a receipt in its own file. The
 * Artifacts tab listed one of those kinds. This module gathers them per task.
 *
 * Four rules, each a silent failure without it:
 *
 *  - **A live reference is not a captured version.** A path in the lane is
 *    whatever the file is NOW; the review saw a particular content, recorded
 *    as a digest when the row was written. They are shown as different
 *    things, and a file whose digest moved says `modified since review`
 *    rather than letting the reader assume the reviewed bytes are there.
 *  - **Missing, modified and superseded are three facts.** Missing: the thing
 *    is gone (file deleted, capture file pruned). Modified: it is there with
 *    other content. Superseded: a LATER deliverable of the same kind and
 *    subject replaced it (a newer check run of the same command, a newer
 *    review). `unknown` is its own answer — never "current" by default.
 *  - **Provenance outlives the panel.** Every producer is named from the live
 *    panel when it is open, and otherwise from what the row RECORDED when it
 *    was written (title, kind, backend) — "a closed panel" only when neither
 *    exists. A closed chat deletes its transcript; the fact that it produced
 *    something is kept here.
 *  - **Evidence applies to a revision.** A check or a review is `current`
 *    only when its recorded identity equals the lane's identity now; a
 *    different one is `stale`; none recorded is `unknown`.
 *
 * Pure; plain-node tier (`verify:review deliver.*`).
 */

export type DeliverableKind = 'file' | 'review' | 'check' | 'capture' | 'merge' | 'pr' | 'receipt' | 'conversation' | 'expected'

export type DeliverableStatus = 'current' | 'modified' | 'missing' | 'superseded' | 'stale' | 'unknown' | 'pending'

export interface Producer {
  panelId?: string
  /** The panel's title when it produced this — recorded, so a closed panel still has a name. */
  title?: string
  kind?: string
  backend?: AgentBackend
  /** The panel is no longer on the canvas. */
  closed: boolean
}

export interface Deliverable {
  /** Stable within one collection: kind + subject. */
  id: string
  kind: DeliverableKind
  /** One line, in the product's words. */
  title: string
  /** What it refers to: a path, a command, a capture URL, a sha, a PR URL. */
  subject: string
  /** `live` points at whatever is there now; `captured` names a version fixed when it was recorded. */
  reference: 'live' | 'captured' | 'record'
  producedBy: Producer
  /** The revision it concerned, when known. */
  revision?: ReviewIdentity
  /** A git sha, for a merge or a receipt. */
  sha?: string
  at: number
  status: DeliverableStatus
  /** Why the status is what it is — never empty for anything but `current`. */
  why: string
  /** The run (execution) the row belongs to. */
  runId?: string
  /** An output record to open (a check), or a capture id. */
  openId?: string
}

/** A check-output record as `task:evidence` summarises it — no output text crosses. */
export interface CheckSummary {
  runId: string
  panelId: string
  command: string
  exitCode: number | null
  endedAt: number
  tested?: ReviewIdentity
}

/** A file probed under the lane root: whether it exists, and its content digest now. */
export interface FileProbe {
  exists: boolean
  digest?: string
}

/** What a live panel is, for naming a producer. */
export interface LivePanel {
  id: string
  title?: string
  kind: string
  backend?: AgentBackend
}

/** A capture that still has an image panel on the canvas, keyed by capture id. */
export interface LiveCapture {
  id: string
  panelId: string
}

export interface CollectInput {
  item: PersistedWorkItem
  /** The task's timeline rows (any order). */
  events: readonly EventRow[]
  /** The task's panels' command rows — a check run is one with an `outputId`. */
  commands?: readonly RunRow[]
  /** Check-output summaries by output id; `null` = main looked and the record is gone; absent = not looked up. */
  checks: Readonly<Record<string, CheckSummary | null>>
  /** Files probed now, by the path the rows name. */
  files: Readonly<Record<string, FileProbe>>
  /** Integration receipts that include this task. */
  receipts: readonly IntegrationReceipt[]
  panels: readonly LivePanel[]
  /** Capture ids whose image file main still holds; absent = not probed (status unknown). */
  capturesOnDisk?: ReadonlySet<string>
  /**
   * The lane's content identity NOW, per base sha a piece of evidence was
   * taken against (an identity is only comparable at its own base): null =
   * the lane is gone or unreadable; a base absent from the map = not read.
   */
  identities?: ReadonlyMap<string, ReviewIdentity | null>
}

/** EventRow's optional producer, parsed field-level (M320). */
export function parseProducer(raw: unknown): { title: string; kind: string; backend?: AgentBackend } | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || r.title === '' || typeof r.kind !== 'string' || r.kind === '') return undefined
  return { title: r.title.slice(0, 200), kind: r.kind.slice(0, 40), ...(BACKEND_IDS.includes(r.backend as AgentBackend) ? { backend: r.backend as AgentBackend } : {}) }
}

/** EventRow's optional per-path digests (M320): a malformed entry costs itself. */
export function parseDigests(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (k !== '' && typeof v === 'string' && /^[0-9a-f]{8,64}$/.test(v)) out[k] = v
  return Object.keys(out).length === 0 ? undefined : out
}

function producerOf(panelId: string | undefined, recorded: EventRow['producer'], panels: readonly LivePanel[]): Producer {
  const live = panelId === undefined ? undefined : panels.find((p) => p.id === panelId)
  if (live !== undefined) {
    return { panelId: live.id, kind: live.kind, closed: false,
      ...(live.title === undefined ? {} : { title: live.title }),
      ...(live.backend === undefined ? recorded?.backend === undefined ? {} : { backend: recorded.backend } : { backend: live.backend }) }
  }
  return {
    ...(panelId === undefined ? {} : { panelId }),
    ...(recorded === undefined ? {} : { title: recorded.title, kind: recorded.kind, ...(recorded.backend === undefined ? {} : { backend: recorded.backend }) }),
    closed: panelId !== undefined
  }
}

/** The one phrase for who produced something. */
export function producerWord(p: Producer): string {
  const who = p.title ?? (p.kind === undefined ? undefined : `a ${p.kind}`)
  const on = p.backend === undefined ? '' : ` on ${BACKENDS[p.backend].label}`
  if (who === undefined) return p.panelId === undefined ? 'the person' : 'a closed panel'
  return `${who}${on}${p.closed ? ' (closed)' : ''}`
}

function revisionStatus(tested: ReviewIdentity | undefined, identities: ReadonlyMap<string, ReviewIdentity | null> | undefined): { status: DeliverableStatus; why: string } {
  if (tested === undefined) return { status: 'unknown', why: 'no revision was recorded with it' }
  const now = identities?.get(tested.base)
  if (now === undefined) return { status: 'unknown', why: 'the lane\'s current revision was not read' }
  if (now === null) return { status: 'unknown', why: 'the lane is gone — its revision cannot be compared' }
  return sameReviewIdentity(tested, now) ? { status: 'current', why: '' } : { status: 'stale', why: 'the lane has changed since' }
}

/**
 * Every deliverable of one task, newest first, each with its status and why.
 * A later row of the same kind and subject supersedes an earlier one — the
 * earlier one is KEPT (it happened) and says what replaced it.
 */
export function collectDeliverables(input: CollectInput): Deliverable[] {
  const { item, panels } = input
  const out: Deliverable[] = []
  const rows = [...input.events].filter((r) => r.itemId === undefined || r.itemId === item.id).sort((a, b) => b.at - a.at)

  // Files — the review rows' paths, newest mark first. The newest mention of
  // a path is its deliverable; an older mention is superseded by it.
  const seenPath = new Map<string, number>()
  for (const r of rows) {
    if (r.event !== 'artifact' || r.paths === undefined) continue
    for (const path of r.paths) {
      const producer = producerOf(r.panelId, r.producer, panels)
      const recorded = r.digests?.[path]
      const probe = input.files[path]
      const newer = seenPath.get(path)
      let status: DeliverableStatus
      let why: string
      if (newer !== undefined) { status = 'superseded'; why = `a later review (${new Date(newer).toISOString().slice(0, 16).replace('T', ' ')}) covers this file again` }
      else if (probe === undefined) { status = 'unknown'; why = 'the file was not probed' }
      else if (!probe.exists) { status = 'missing'; why = 'the file is no longer in the lane' }
      else if (recorded === undefined) { status = 'unknown'; why = 'no content digest was recorded when it was reviewed — the file is there, whether it changed is not known' }
      else if (probe.digest !== recorded) { status = 'modified'; why = 'the file changed after it was reviewed — the reviewed content is not what is there now' }
      else { status = 'current'; why = '' }
      if (newer === undefined) seenPath.set(path, r.at)
      out.push({
        id: `file:${path}:${r.at}`, kind: 'file', title: path, subject: path,
        // A digest makes it a CAPTURED version; without one it is only a live reference.
        reference: recorded === undefined ? 'live' : 'captured',
        producedBy: producer, at: r.at, status, why, runId: r.runId,
        ...(r.tested === undefined ? {} : { revision: r.tested })
      })
    }
  }

  // Captures — an artifact row keyed `capture:<id>`.
  for (const r of rows) {
    if (r.event !== 'artifact' || r.key === undefined || !r.key.startsWith('capture:')) continue
    const id = r.key.slice('capture:'.length)
    const onDisk = input.capturesOnDisk
    const status: DeliverableStatus = onDisk === undefined ? 'unknown' : onDisk.has(id) ? 'current' : 'missing'
    out.push({
      id: `capture:${id}`, kind: 'capture', title: r.title, subject: r.detail ?? id, reference: 'captured',
      producedBy: producerOf(r.panelId, r.producer, panels), at: r.at, status,
      why: status === 'missing' ? 'the captured image file is gone' : status === 'unknown' ? 'the image file was not probed' : '',
      runId: r.runId, openId: id
    })
  }

  // Checks — the task's panels' command rows that kept an output record
  // (M306), and the check EVENTS (a failed preparation, an integration's
  // witness) that name one by key. The newest run of a command supersedes
  // the older ones; an older run is kept, because it happened.
  interface CheckCandidate { at: number; command: string; outputId?: string; panelId?: string; exitCode?: number | null; tested?: ReviewIdentity; runId?: string; producer?: EventRow['producer'] }
  const candidates: CheckCandidate[] = []
  for (const c of input.commands ?? []) {
    if (c.outputId === undefined) continue
    candidates.push({ at: c.endedAt, command: c.command, outputId: c.outputId, panelId: c.panelId, exitCode: c.exitCode, ...(c.tested === undefined ? {} : { tested: c.tested }) })
  }
  for (const r of rows) {
    if (r.event !== 'check') continue
    const outputId = r.key !== undefined && /^(setup-)?output:/.test(r.key) ? r.key.replace(/^(setup-)?output:/, '') : undefined
    if (outputId !== undefined && candidates.some((c) => c.outputId === outputId)) continue
    const summary = outputId === undefined ? undefined : input.checks[outputId] ?? undefined
    candidates.push({
      at: r.at, command: summary?.command ?? r.title, runId: r.runId,
      ...(outputId === undefined ? {} : { outputId }),
      ...(r.panelId === undefined ? {} : { panelId: r.panelId }),
      ...(r.tested === undefined ? {} : { tested: r.tested }),
      ...(r.producer === undefined ? {} : { producer: r.producer })
    })
  }
  candidates.sort((a, b) => b.at - a.at)
  const seenCommand = new Set<string>()
  for (const c of candidates) {
    const summary = c.outputId === undefined ? undefined : input.checks[c.outputId] ?? undefined
    const exit = summary?.exitCode ?? c.exitCode
    const tested = summary?.tested ?? c.tested
    let status: DeliverableStatus
    let why: string
    if (seenCommand.has(c.command)) { status = 'superseded'; why = 'a later run of the same command replaced it' }
    else if (c.outputId !== undefined && input.checks[c.outputId] === null) { status = 'missing'; why = 'its output record was pruned (the store keeps the newest runs)' }
    else ({ status, why } = revisionStatus(tested, input.identities))
    seenCommand.add(c.command)
    out.push({
      id: `check:${c.outputId ?? c.at}`, kind: 'check',
      title: `${exit === undefined ? '' : exit === 0 ? 'Passed: ' : `Failed (${exit === null ? 'signal' : `exit ${exit}`}): `}${c.command}`,
      subject: c.command, reference: 'record', producedBy: producerOf(summary?.panelId ?? c.panelId, c.producer, panels), at: c.at, status, why,
      ...(c.runId === undefined ? {} : { runId: c.runId }),
      ...(tested === undefined ? {} : { revision: tested }),
      ...(c.outputId === undefined ? {} : { openId: c.outputId })
    })
  }

  // The review mark on the card — the one the review standing reads.
  if (item.reviewed !== undefined) {
    const s = revisionStatus(item.reviewed.identity, input.identities)
    out.push({
      id: 'review', kind: 'review', title: `Reviewed ${item.reviewed.files} changed file${item.reviewed.files === 1 ? '' : 's'}`,
      subject: item.title, reference: 'record', producedBy: { closed: false }, at: item.reviewed.at, ...s,
      ...(item.reviewed.identity === undefined ? {} : { revision: item.reviewed.identity })
    })
  }
  if (item.pr !== undefined) {
    out.push({ id: 'pr', kind: 'pr', title: `Pull request #${item.pr.number}`, subject: item.pr.url, reference: 'live', producedBy: { closed: false }, at: item.updatedAt, status: 'unknown', why: 'its state lives on GitHub' })
  }
  if (item.merged !== undefined) {
    out.push({ id: `merge:${item.merged.sha}`, kind: 'merge', title: `Merged into ${item.merged.into}`, subject: item.merged.sha, sha: item.merged.sha, reference: 'record', producedBy: { closed: false }, at: item.merged.at, status: 'current', why: '' })
  }
  for (const rc of input.receipts) {
    const lane = rc.lanes.find((l) => l.itemId === item.id)
    if (lane === undefined) continue
    out.push({
      id: `receipt:${rc.id}`, kind: 'receipt', title: `Integrated — ${lane.outcome}${lane.sha === undefined ? '' : ` at ${lane.sha.slice(0, 7)}`}`,
      subject: rc.into, ...(lane.sha === undefined ? {} : { sha: lane.sha }), reference: 'record', producedBy: { closed: false }, at: rc.at,
      status: lane.outcome === 'merged' ? 'current' : 'unknown', why: lane.outcome === 'merged' ? '' : lane.detail ?? `the lane was ${lane.outcome}`
    })
  }

  // The conversation that did the work — named even when the panel is closed.
  const dispatch = rows.filter((r) => r.event === 'dispatch').pop()
  if (dispatch !== undefined || item.panelId !== undefined) {
    const panelId = item.panelId ?? dispatch?.panelId
    const producer = producerOf(panelId, dispatch?.producer, panels)
    out.push({
      id: 'conversation', kind: 'conversation', title: `The conversation — ${producerWord(producer)}`, subject: panelId ?? '',
      reference: 'live', producedBy: producer, at: dispatch?.at ?? item.createdAt,
      status: producer.closed ? 'missing' : 'current', why: producer.closed ? 'the chat was closed and its transcript with it — the rows above are what remains' : ''
    })
  }

  // What the person said they expected back, and whether anything answers it.
  for (const d of item.deliverables ?? []) {
    out.push({ id: `expected:${d}`, kind: 'expected', title: d, subject: d, reference: 'record', producedBy: { closed: false }, at: item.createdAt, status: 'pending', why: 'expected — confirm it against the evidence above' })
  }
  return out.sort((a, b) => (a.kind === 'expected' ? 1 : 0) - (b.kind === 'expected' ? 1 : 0) || b.at - a.at)
}

export interface DeliverablesAccount {
  total: number
  byStatus: Partial<Record<DeliverableStatus, number>>
  /** One sentence for the tab's head. */
  line: string
}

export function deliverablesAccount(list: readonly Deliverable[]): DeliverablesAccount {
  const produced = list.filter((d) => d.kind !== 'expected')
  const byStatus: Partial<Record<DeliverableStatus, number>> = {}
  for (const d of produced) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1
  if (produced.length === 0) return { total: 0, byStatus, line: 'nothing recorded for this task yet' }
  const parts = [`${produced.length} recorded`]
  const say: [DeliverableStatus, string][] = [['current', 'current'], ['modified', 'modified since review'], ['stale', 'evidence for an older revision'], ['missing', 'missing'], ['superseded', 'superseded'], ['unknown', 'unknown']]
  for (const [s, w] of say) if ((byStatus[s] ?? 0) > 0) parts.push(`${byStatus[s]} ${w}`)
  return { total: produced.length, byStatus, line: parts.join(' · ') }
}

/**
 * A concise task hand-off: what was asked, what was produced, and the
 * evidence with whether it still applies. Markdown, for a person or another
 * agent. The caller passes it through the outward gate before it leaves.
 */
export function taskHandoffMarkdown(item: PersistedWorkItem, list: readonly Deliverable[], at: number): string {
  const lines: string[] = [`# ${item.title}`, '']
  const facts = [item.key, item.url, `state: ${item.state}`, item.backend === undefined ? undefined : `backend: ${BACKENDS[item.backend].label}`].filter((x): x is string => x !== undefined)
  lines.push(facts.join(' · '), `Exported ${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC.`)
  if (item.brief !== undefined) lines.push('', '## Outcome asked for', item.brief)
  if (item.criteria !== undefined && item.criteria.length > 0) {
    const met = new Set(item.criteriaMet ?? [])
    lines.push('', '## Done when', ...item.criteria.map((c) => `- [${met.has(c) ? 'x' : ' '}] ${c}`))
  }
  const account = deliverablesAccount(list)
  lines.push('', '## What it produced', account.line)
  const group = (kinds: DeliverableKind[], heading: string): void => {
    const rows = list.filter((d) => kinds.includes(d.kind))
    if (rows.length === 0) return
    lines.push('', `### ${heading}`)
    for (const d of rows) {
      const rev = d.revision === undefined ? '' : ` @ ${d.revision.base.slice(0, 7)}`
      lines.push(`- ${d.title}${rev} — ${d.status}${d.why === '' ? '' : ` (${d.why})`} · ${producerWord(d.producedBy)}`)
    }
  }
  group(['merge', 'receipt', 'pr'], 'Landed')
  group(['review', 'check'], 'Verification')
  group(['file', 'capture'], 'Files and captures')
  group(['conversation'], 'Where it came from')
  const expected = list.filter((d) => d.kind === 'expected')
  if (expected.length > 0) lines.push('', '### Expected back', ...expected.map((d) => `- ${d.title}`))
  const open = (item.comments ?? []).filter((c) => c.resolved !== true)
  if (open.length > 0) lines.push('', '## Open review comments', ...open.slice(0, 20).map((c) => `- ${c.path}:${c.line} — ${c.body.split('\n')[0]}`))
  if (item.note !== undefined) lines.push('', `Note: ${item.note}`)
  return lines.join('\n') + '\n'
}

/* ── M320. What main's task doors answer (main/task-evidence.ts) ─────────── */

export interface TaskEvidenceRequest {
  itemId: string
  /** The task's panels — command rows are keyed by panel, not by task. */
  panelIds: readonly string[]
  /** The lane's root, for probing files. Absent: files are not probed. */
  root?: string
}

export interface TaskEvidence {
  events: EventRow[]
  commands: RunRow[]
  checks: Record<string, CheckSummary | null>
  files: Record<string, FileProbe>
  receipts: IntegrationReceipt[]
  /** Capture ids (file names) still on disk, among those the rows name. */
  captures: string[]
  /** The read reached the beginning of the record (the M300 rule). */
  reachedStart: boolean
}

export interface TaskIndexRow {
  itemId: string
  field: 'check' | 'deliverable' | 'capture'
  text: string
}

export type TaskExportResult =
  | { kind: 'written'; path: string; redacted: number }
  | { kind: 'cancelled' }
  | { kind: 'failed'; reason: string }
