import type { EventRow, OrchEventKind } from './run-ledger'

/**
 * M369. THE DECISION AUDIT — "who decided what, when", in one place that
 * outlives the run ledger's trim.
 *
 * The run ledger records a PERSON's decisions beside every tool call and
 * shell command (`EventRow.source: 'person'`), and it keeps its newest 2000
 * lines: a busy afternoon of agents trims the morning's decisions away. The
 * task history (M318) keeps twelve per task. Nothing answered, across the
 * canvas and across weeks, which requests a person allowed, which plans they
 * approved, which reviews they marked, which caps they raised.
 *
 * This is that record: every person-sourced event row, mirrored by MAIN at
 * the moment it lands in the ledger (the one writer), into its own
 * append-only file with a far larger cap. Decisions only — never an agent's
 * rows, never tool output. A row's words are the ledger row's title and
 * detail, SCRUBBED on the way to disk and the count kept on the row, because
 * a permission record can quote the command it allowed.
 *
 * Pure: the row, its projection from a ledger row, and its parser.
 * `verify:decision-audit` (in `verify:agent-session`'s bundle).
 */

export const DECISION_AUDIT_MAX = 20000
export const DECISION_TEXT_MAX = 300

export interface DecisionRow {
  at: number
  /** The ledger's own kind for what was decided: permission, dispatch, check (a review mark), handoff… */
  event: OrchEventKind
  /** The decision in the record's words, scrubbed. */
  title: string
  detail?: string
  itemId?: string
  panelId?: string
  /** Secrets scrubbed from this row's words on the way to disk. Absent is none. */
  scrubbed?: number
}

const clip = (s: string): string => (s.length > DECISION_TEXT_MAX ? `${s.slice(0, DECISION_TEXT_MAX - 1)}…` : s)

/**
 * A ledger row as a decision, or null for anything a person did not decide.
 * The words are clipped here and scrubbed by the store, which owns the count.
 */
export function decisionOf(row: EventRow): Omit<DecisionRow, 'scrubbed'> | null {
  if (row.source !== 'person') return null
  return {
    at: row.at, event: row.event, title: clip(row.title),
    ...(row.detail === undefined || row.detail === '' ? {} : { detail: clip(row.detail) }),
    ...(row.itemId === undefined ? {} : { itemId: row.itemId }),
    ...(row.panelId === undefined ? {} : { panelId: row.panelId })
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v !== ''

/** Field-level: a malformed line costs itself; an unknown optional field is dropped, never the row. */
export function parseDecisionRow(raw: unknown): DecisionRow | null {
  if (!isRecord(raw) || typeof raw.at !== 'number' || !Number.isFinite(raw.at) || !isStr(raw.event) || !isStr(raw.title)) return null
  return {
    at: raw.at, event: raw.event as OrchEventKind, title: raw.title,
    ...(isStr(raw.detail) ? { detail: raw.detail } : {}),
    ...(isStr(raw.itemId) ? { itemId: raw.itemId } : {}),
    ...(isStr(raw.panelId) ? { panelId: raw.panelId } : {}),
    ...(typeof raw.scrubbed === 'number' && Number.isInteger(raw.scrubbed) && raw.scrubbed > 0 ? { scrubbed: raw.scrubbed } : {})
  }
}

/**
 * M371. The words of the two decisions that recorded nothing before: a cap
 * set on an agent (the `cap-agent` verb's own note), and a proposed review
 * comment kept or discarded. One builder each, so the ledger, the task's
 * history and this audit say them the same way.
 */
export function capDecisionTitle(agent: string, note: string, byPerson: boolean): string {
  return `${byPerson ? 'Set' : 'An agent set'} ${agent}'s own caps — ${note}`
}

export function proposalDecisionTitle(keep: boolean, proposer: string, place: string): string {
  return `${keep ? 'Kept' : 'Discarded'} ${proposer}'s proposed comment on ${place}`
}

/**
 * M373. A workspace share decision: a canvas shared with an organization,
 * a shared workspace opened here, or a person's role in one set or removed.
 * These are made in MAIN (the share doors), behind a person's dialog or the
 * `tc` door's Cancel-default confirm, so main writes the row itself. The
 * ids ride the detail, because a title is prose and the ids are the facts.
 * `permission`: of the ledger's kinds, a share is a decision about who may
 * see or change something. The run id is the share's, so every decision
 * about one shared workspace reads back together.
 */
export type ShareDecision =
  | { kind: 'share'; shareId: string; workspace: string; org: string }
  | { kind: 'open'; shareId: string; workspace: string; role: string }
  | { kind: 'role'; shareId: string; workspace: string; who: string; userId: string; role: string | null }

export function shareDecisionRow(d: ShareDecision, at: number): EventRow {
  const title = d.kind === 'share'
    ? `Shared “${d.workspace}” with ${d.org}`
    : d.kind === 'open'
      ? `Opened the shared workspace “${d.workspace}” here, as ${d.role}`
      : d.role === null
        ? `Removed ${d.who} from “${d.workspace}”`
        : `Made ${d.who} ${d.role} of “${d.workspace}”`
  const detail = d.kind === 'role' ? `share ${d.shareId} · user ${d.userId}` : `share ${d.shareId}`
  return { kind: 'event', runId: `share-${d.shareId}`, at, event: 'permission', source: 'person', title, detail }
}
