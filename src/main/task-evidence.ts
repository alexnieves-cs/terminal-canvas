import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { isAbsolute, join, normalize, relative } from 'node:path'
import { outward } from '@shared/outward'
import type { CheckOutputRead } from '@shared/check-output'
import type { IntegrationReceipt } from '@shared/integration'
import type { EventRow, RunRow, TimelineFilter, TimelineRead } from '@shared/run-ledger'
import type { CheckSummary, FileProbe, TaskEvidence, TaskEvidenceRequest, TaskExportResult, TaskIndexRow } from '@shared/task-deliverables'
export type { TaskEvidence, TaskEvidenceRequest, TaskExportResult, TaskIndexRow } from '@shared/task-deliverables'

/**
 * M320. MAIN'S HALF OF A TASK'S DELIVERABLES — the facts only main can read:
 * the ledger, the check-output store, the receipts, the lane's files and the
 * captures directory. The renderer holds the card and the live panels and
 * assembles the view with `collectDeliverables`; nothing here decides a
 * status.
 *
 * Three rules:
 *  - **Digests are main's.** An artifact row's per-path digests are computed
 *    HERE at append time from the row's `root`, never taken from the
 *    renderer, so "the reviewed content" is what was on disk when the review
 *    was recorded — not a claim.
 *  - **Paths stay inside their root.** A path that normalises outside the
 *    root is not read (and not digested): the row's paths cross the bridge.
 *  - **An export passes the outward gate.** The hand-off is task text read
 *    for another reader; it is scrubbed, and the count rides the answer.
 *
 * Injected fs and stores, so `verify:review deliver.*` drives it under plain
 * node against a tmpdir.
 */

export const DIGEST_MAX_BYTES = 8 * 1024 * 1024
export const DIGEST_MAX_PATHS = 200

export interface TaskEvidenceDeps {
  timeline(filter: TimelineFilter, limit: number): Promise<TimelineRead>
  checkOutput(runId: string): Promise<CheckOutputRead>
  receipts(): Promise<IntegrationReceipt[]>
  /** `userData/captures`. */
  capturesDir: string
  /** The save dialog; null when the person cancelled. */
  askPath(suggested: string): Promise<string | null>
  write(path: string, text: string): Promise<void>
}

/** A path under `root`, or null when it escapes it. */
export function underRoot(root: string, path: string): string | null {
  if (!isAbsolute(root)) return null
  const full = normalize(isAbsolute(path) ? path : join(root, path))
  const rel = relative(root, full)
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : full
}

/** The first 16 hex of a file's sha256 — the same width as a review identity's shortest use. Undefined when it cannot be read or is too large. */
export async function digestFile(full: string): Promise<string | undefined> {
  try {
    const st = await fs.stat(full)
    if (!st.isFile() || st.size > DIGEST_MAX_BYTES) return undefined
    return createHash('sha256').update(await fs.readFile(full)).digest('hex').slice(0, 16)
  } catch {
    return undefined
  }
}

/**
 * The row as it should land: an artifact row with a root and paths gains the
 * digest of each path main can read, bounded. Any other row passes through.
 */
export async function withDigests(row: EventRow): Promise<EventRow> {
  if (row.event !== 'artifact' || row.root === undefined || row.paths === undefined || row.paths.length === 0) return row
  const digests: Record<string, string> = {}
  for (const path of row.paths.slice(0, DIGEST_MAX_PATHS)) {
    const full = underRoot(row.root, path)
    if (full === null) continue
    const d = await digestFile(full)
    if (d !== undefined) digests[path] = d
  }
  return Object.keys(digests).length === 0 ? row : { ...row, digests }
}

/** Probe paths under a root now: exists, and the digest when readable. */
export async function probeFiles(root: string, paths: readonly string[]): Promise<Record<string, FileProbe>> {
  const out: Record<string, FileProbe> = {}
  for (const path of paths.slice(0, DIGEST_MAX_PATHS)) {
    const full = underRoot(root, path)
    if (full === null) continue
    try {
      await fs.access(full)
      const d = await digestFile(full)
      out[path] = { exists: true, ...(d === undefined ? {} : { digest: d }) }
    } catch {
      out[path] = { exists: false }
    }
  }
  return out
}




export const EVIDENCE_LIMIT = 400

const sanitize = (s: string): string => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'task'

export function createTaskEvidence(deps: TaskEvidenceDeps) {
  return {
    async evidence(req: TaskEvidenceRequest): Promise<TaskEvidence> {
      // Two reads, because the two kinds are keyed differently: the task's
      // EVENTS by item — every one, whichever panel wrote it, so a row from a
      // panel closed since still comes home — and the check runs, which are
      // command rows keyed by PANEL and carry no item at all.
      const byItem = await deps.timeline({ itemId: req.itemId }, EVIDENCE_LIMIT)
      const byPanel = req.panelIds.length === 0 ? { entries: [], reachedStart: true } : await deps.timeline({ panelIds: req.panelIds }, EVIDENCE_LIMIT)
      const events: EventRow[] = []
      const commands: RunRow[] = []
      for (const e of byItem.entries) if (e.kind === 'event') events.push(e.row)
      for (const e of byPanel.entries) if (e.kind === 'command') commands.push(e.row)
      const read = { reachedStart: byItem.reachedStart && byPanel.reachedStart }
      const outputIds = new Set<string>()
      for (const c of commands) if (c.outputId !== undefined) outputIds.add(c.outputId)
      for (const r of events) if (r.event === 'check' && r.key !== undefined && /^(setup-)?output:/.test(r.key)) outputIds.add(r.key.replace(/^(setup-)?output:/, ''))
      const checks: Record<string, CheckSummary | null> = {}
      for (const id of outputIds) {
        const got = await deps.checkOutput(id).catch(() => ({ kind: 'unreadable' as const, why: 'unreadable' }))
        // Only the facts — the output text stays in its store, opened by id.
        checks[id] = got.kind === 'ok'
          ? { runId: got.record.runId, panelId: got.record.panelId, command: got.record.command, exitCode: got.record.exitCode, endedAt: got.record.endedAt, ...(got.record.tested === undefined ? {} : { tested: got.record.tested }) }
          : got.kind === 'missing' ? null : null
      }
      const paths = [...new Set(events.flatMap((r) => (r.event === 'artifact' ? r.paths ?? [] : [])))]
      const root = req.root ?? events.find((r) => r.root !== undefined)?.root
      const files = root === undefined ? {} : await probeFiles(root, paths)
      const receipts = (await deps.receipts().catch(() => [])).filter((rc) => rc.lanes.some((l) => l.itemId === req.itemId))
      const captureIds = events.flatMap((r) => (r.key?.startsWith('capture:') === true ? [r.key.slice('capture:'.length)] : []))
      const captures: string[] = []
      for (const id of captureIds) {
        // A capture id is a file NAME main minted; anything with a separator is not one.
        if (/[/\\]/.test(id) || id.startsWith('.')) continue
        try { await fs.access(join(deps.capturesDir, id)); captures.push(id) } catch { /* gone */ }
      }
      return { events, commands, checks, files, receipts, captures, reachedStart: read.reachedStart }
    },

    /**
     * What search can match per task beyond its card: the check commands its
     * rows recorded, the paths its reviews covered, its captures' titles.
     * References only, bounded by the ledger read.
     */
    async index(): Promise<TaskIndexRow[]> {
      const read = await deps.timeline({}, 2000)
      const out: TaskIndexRow[] = []
      const seen = new Set<string>()
      const add = (row: TaskIndexRow): void => {
        const k = `${row.itemId}\u0000${row.field}\u0000${row.text}`
        if (seen.has(k)) return
        seen.add(k)
        out.push(row)
      }
      for (const e of read.entries) {
        if (e.kind !== 'event' || e.row.itemId === undefined) continue
        const r = e.row
        if (r.event === 'check') add({ itemId: r.itemId!, field: 'check', text: r.detail === undefined ? r.title : `${r.title} — ${r.detail.split('\n')[0]}` })
        if (r.event === 'artifact' && r.key?.startsWith('capture:') === true) add({ itemId: r.itemId!, field: 'capture', text: r.detail ?? r.title })
        else if (r.event === 'artifact') for (const p of r.paths ?? []) add({ itemId: r.itemId!, field: 'deliverable', text: p })
      }
      return out
    },

    async exportHandoff(req: { itemId: string; title: string; markdown: string }): Promise<TaskExportResult> {
      if (typeof req.markdown !== 'string' || req.markdown.trim() === '') return { kind: 'failed', reason: 'there is nothing to export' }
      // The ONE outward gate, as every export takes it.
      const { text, redacted } = outward(req.markdown, `task ${req.itemId}`)
      const path = await deps.askPath(`${sanitize(req.title)}-handoff.md`)
      if (path === null) return { kind: 'cancelled' }
      try {
        await deps.write(path, text)
      } catch (error: unknown) {
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
      return { kind: 'written', path, redacted }
    }
  }
}

export type TaskEvidenceDoors = ReturnType<typeof createTaskEvidence>

/**
 * M320–M321. The task doors as `registerIpcHandlers` takes them — one
 * collaborator, appended last. `preflight` (M321) is optional so a harness
 * that wires only the evidence still compiles.
 */
export interface TaskHandlers {
  evidence(req: TaskEvidenceRequest): Promise<TaskEvidence>
  index(): Promise<TaskIndexRow[]>
  exportHandoff(req: { itemId: string; title: string; markdown: string }): Promise<TaskExportResult>
}

/** Inert: nothing recorded (and says it could not reach the start), every export refused by name. */
export const INERT_TASKS: TaskHandlers = {
  evidence: async () => ({ events: [], commands: [], checks: {}, files: {}, receipts: [], captures: [], reachedStart: false }),
  index: async () => [],
  exportHandoff: async () => ({ kind: 'failed', reason: 'task export is not wired' })
}
