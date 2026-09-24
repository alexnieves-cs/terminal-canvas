import { retainedRefsWord, type RetainedOutcome } from './retained-outcomes'
import { redactSecrets } from './redact'
import type { PersistedWorkItem } from './work-items'

/**
 * D13. The second half of Find in panels: the MEANING of the work, not only
 * its output — tasks (title, key, brief, description, criteria, note) and the
 * retained outcomes D11 keeps after a lane is tidied away. Pure and
 * renderer-side, deliberately: both records are the active workspace's own
 * layout state, already in memory, so asking main would be a round trip for
 * a fact the renderer holds — and it keeps the scope honest by construction,
 * because another workspace's tasks are simply not in this list.
 *
 * Three rules, the panel search's own:
 *   - every line that leaves is REDACTED and the count is carried — a brief
 *     can hold a pasted token as easily as a terminal can;
 *   - the cap is STATED (`capped`), never silent;
 *   - a hit is a REFERENCE: it names the card to frame when there is one and
 *     says so when there is not. Opening a hit never wakes or reopens a
 *     session — a retained outcome's lane is gone and stays gone.
 */

export interface WorkSearchHit {
  source: 'task' | 'retained'
  itemId: string
  /** Retained hits only: the record, so two outcomes of one task are two rows. */
  outcomeId?: string
  title: string
  /** Which field matched, in words: `brief`, `title`, `outcome`… */
  field: string
  line: string
  /** The task's card on this canvas, when it is here. Absent = no card to frame. */
  cardPanelId?: string
}

export interface WorkSearchResult {
  hits: WorkSearchHit[]
  capped: boolean
  cap: number
  redacted: number
  searched: { tasks: number; retained: number }
}

export const WORK_SEARCH_CAP = 30

/**
 * M320. What a task's RECORD holds beyond its card, per task: the check
 * commands it ran, the paths its reviews covered, its captures — main's
 * `task:evidence-index`, references only. Optional: absent is D13's search.
 */
export interface WorkEvidenceRow {
  itemId: string
  field: 'check' | 'deliverable' | 'capture'
  text: string
}

export function searchWork(
  query: string,
  items: readonly PersistedWorkItem[],
  retained: readonly RetainedOutcome[],
  cardOf: (itemId: string) => string | undefined,
  cap: number = WORK_SEARCH_CAP,
  evidence: readonly WorkEvidenceRow[] = []
): WorkSearchResult {
  const q = query.trim().toLowerCase()
  const result: WorkSearchResult = { hits: [], capped: false, cap, redacted: 0, searched: { tasks: items.length, retained: retained.length } }
  if (q === '') return result
  const push = (hit: WorkSearchHit): boolean => {
    if (result.hits.length >= cap) { result.capped = true; return false }
    const r = redactSecrets(hit.line)
    const t = redactSecrets(hit.title)
    result.redacted += r.count + t.count
    result.hits.push({ ...hit, line: r.text, title: t.text })
    return true
  }
  // First matching line of a field, trimmed — the row shows WHY it matched.
  const lineOf = (text: string | undefined): string | undefined =>
    text?.split('\n').map((l) => l.trim()).find((l) => l !== '' && l.toLowerCase().includes(q))
  for (const item of items) {
    const card = cardOf(item.id)
    const fields: [string, string | undefined][] = [
      ['title', item.title], ['key', item.key], ['brief', item.brief], ['description', item.description],
      ['criteria', item.criteria?.join('\n')], ['note', item.note],
      // M320. The rest of what a task SAYS: its review comments (path and
      // text), the checks that decide done, and what it is expected to hand
      // back — then what its record holds (the commands it ran, the files its
      // reviews covered, its captures).
      ['review comment', item.comments?.map((c) => `${c.path}:${c.line} ${c.body}`).join('\n')],
      ['check', item.checks?.join('\n')],
      ['deliverable', item.deliverables?.join('\n')],
      ['check run', evidence.filter((e) => e.itemId === item.id && e.field === 'check').map((e) => e.text).join('\n')],
      ['produced', evidence.filter((e) => e.itemId === item.id && e.field !== 'check').map((e) => e.text).join('\n')]
    ]
    // One row per task: the first field that matches is the reason, so a task
    // whose title and brief both hold the word is not listed twice.
    for (const [field, text] of fields) {
      const line = lineOf(text)
      if (line === undefined) continue
      if (!push({ source: 'task', itemId: item.id, title: item.title, field, line, ...(card === undefined ? {} : { cardPanelId: card }) })) return result
      break
    }
  }
  for (const outcome of retained) {
    const refs = outcome.refs === undefined ? '' : retainedRefsWord(outcome.refs)
    const line = lineOf(outcome.title) ?? lineOf(refs) ?? (outcome.execution.includes(q) ? outcome.execution : undefined)
    if (line === undefined) continue
    const card = cardOf(outcome.itemId)
    if (!push({ source: 'retained', itemId: outcome.itemId, outcomeId: outcome.id, title: outcome.title, field: 'outcome',
      line: `${outcome.execution.replace('-', ' ')} · ${line}`, ...(card === undefined ? {} : { cardPanelId: card }) })) return result
  }
  return result
}
