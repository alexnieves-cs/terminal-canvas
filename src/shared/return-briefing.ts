import type { TimelineEntry } from './run-ledger'

/**
 * M309. THE RETURN BRIEFING — on coming back, per task: what CHANGED, what
 * FINISHED, what needs a DECISION, and what to do NEXT — each line pointing
 * at the evidence behind it.
 *
 * Built only from records this app keeps (M300's durable timeline, M306's
 * check runs, the live decision inbox and the review handoff the card
 * already shows), measured from the moment the person was last here. No
 * sentence is written that a record did not produce — the Resume banner's
 * rule (`resume-summary.ts`), per task instead of for one — and a task with
 * nothing new since says exactly that, rather than being padded with its
 * whole history.
 *
 * "Finished" is a PROCESS ending: a command or watcher run, an agent
 * session. It never says the task is done or verified — that is M307's
 * judgment, and the next-action line is where the briefing points at it.
 *
 * Pure: types only. `verify:review brief.1–.3`.
 */

export type BriefEvidence =
  /** One check run's exact output (M306). */
  | { kind: 'output'; outputId: string; panelId: string }
  /** Go to the panel. */
  | { kind: 'panel'; panelId: string }
  /** Open the task's review. */
  | { kind: 'review'; itemId: string }
  /** Open the decision in the Needs-you inbox. */
  | { kind: 'decision'; panelId: string; requestId?: string }

export interface BriefLine {
  text: string
  at?: number
  tone?: 'failed' | 'passed' | 'neutral' | 'needs-you'
  evidence?: BriefEvidence
}

export interface TaskBriefing {
  itemId: string
  title: string
  changed: BriefLine[]
  finished: BriefLine[]
  decisions: BriefLine[]
  next: string
  /** Nothing since the person was last here. */
  quiet: boolean
}

export interface BriefingTaskInput {
  itemId: string
  title: string
  /** The task's member panels (M203's membership) — whose rows are this task's. */
  panelIds: readonly string[]
  /** The durable record for this task, newest first. */
  timeline: readonly TimelineEntry[]
  /** The review handoff the card shows, when it was read. */
  handoff?: { actionLabel: string; detail: string; state: string; files?: number }
  /** The verification word (M307), when known. */
  verification?: string
  /**
   * The lane conversation's LAST assistant turn, when the chat is open — an
   * agent replying is a thing that finished while the person was away. Its
   * words are an excerpt of the agent's own account, labelled as such.
   */
  lastReply?: { panelId: string; at: number; excerpt: string }
  /** The panel id → label, for sentences. */
  labelOf: (panelId: string) => string
}

export interface BriefingDecision {
  panelId: string
  requestId?: string
  label: string
  blocker: string
}

export interface ReturnBriefing {
  since: number
  tasks: TaskBriefing[]
  /** How many tasks had nothing new — named, not listed. */
  quietCount: number
  /** One sentence over all tasks. */
  headline: string
}

const MAX_LINES = 6

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function briefTask(t: BriefingTaskInput, since: number, decisions: readonly BriefingDecision[]): TaskBriefing {
  const changed: BriefLine[] = []
  const finished: BriefLine[] = []
  const members = new Set(t.panelIds)
  for (const entry of t.timeline) {
    if (entry.kind === 'command') {
      const r = entry.row
      if (r.endedAt < since || !members.has(r.panelId)) continue
      const failed = r.exitCode !== 0
      finished.push({
        text: `\`${r.command}\` ${r.exitCode === null ? 'ended with no exit code' : `exited ${r.exitCode}`} in ${t.labelOf(r.panelId)}`,
        at: r.endedAt,
        tone: failed ? 'failed' : 'passed',
        evidence: r.outputId !== undefined ? { kind: 'output', outputId: r.outputId, panelId: r.panelId } : { kind: 'panel', panelId: r.panelId }
      })
    } else if (entry.kind === 'event') {
      const e = entry.row
      if (e.at < since) continue
      const where = e.panelId === undefined ? undefined : { kind: 'panel' as const, panelId: e.panelId }
      if (e.event === 'artifact') {
        changed.push({ text: `${e.title}${e.paths !== undefined && e.paths.length > 0 ? ` — ${plural(e.paths.length, 'file')}` : ''}`, at: e.at, tone: 'neutral', evidence: { kind: 'review', itemId: t.itemId } })
      } else if (e.event === 'session' || e.event === 'check') {
        finished.push({ text: e.title, at: e.at, tone: 'neutral', ...(where === undefined ? {} : { evidence: where }) })
      } else {
        // dispatch, handoff, permission, tool: what HAPPENED, said by its writer.
        changed.push({ text: e.title, at: e.at, tone: 'neutral', ...(where === undefined ? {} : { evidence: where }) })
      }
    }
  }
  if (t.lastReply !== undefined && t.lastReply.at >= since) {
    finished.push({
      text: `the agent replied${t.lastReply.excerpt === '' ? '' : ` — “${t.lastReply.excerpt}”`}`,
      at: t.lastReply.at, tone: 'neutral', evidence: { kind: 'panel', panelId: t.lastReply.panelId }
    })
  }
  // The lane's current diff is a fact NOW, not an event since — said as such,
  // and only when the record shows something happened (otherwise a quiet task
  // would be made loud by a diff that was there when the person left).
  if (t.handoff?.files !== undefined && t.handoff.files > 0 && (changed.length > 0 || finished.length > 0)) {
    changed.push({ text: `the lane now holds ${plural(t.handoff.files, 'changed file')}`, tone: 'neutral', evidence: { kind: 'review', itemId: t.itemId } })
  }
  const mine = decisions.filter((d) => members.has(d.panelId))
  const decisionLines: BriefLine[] = mine.map((d) => ({
    text: `${d.label} ${d.blocker}`,
    tone: 'needs-you',
    evidence: { kind: 'decision', panelId: d.panelId, ...(d.requestId === undefined ? {} : { requestId: d.requestId }) }
  }))
  // NEXT: a waiting decision first (nothing moves until it is answered), then
  // a failed check, then the review handoff's own action, then verification.
  const failedCount = finished.filter((l) => l.tone === 'failed').length
  const next = decisionLines.length > 0
    ? `Answer ${decisionLines.length === 1 ? 'the decision' : `the ${decisionLines.length} decisions`} below — the task waits on ${decisionLines.length === 1 ? 'it' : 'them'}`
    : failedCount > 0
      ? `Open the failed check${failedCount === 1 ? '' : 's'} and send the agent a follow-up from the review`
      : t.handoff !== undefined && t.handoff.actionLabel.trim() !== ''
        ? `${t.handoff.actionLabel}${t.verification !== undefined ? ` — ${t.verification}` : ''}`
        : t.verification ?? 'Nothing is waiting on you here'
  const byTime = (a: BriefLine, b: BriefLine): number => (b.at ?? 0) - (a.at ?? 0)
  return {
    itemId: t.itemId,
    title: t.title,
    changed: changed.sort(byTime).slice(0, MAX_LINES),
    // Failures lead: a failed check is the finished thing a person came back for.
    finished: finished.sort((a, b) => (a.tone === 'failed' ? 0 : 1) - (b.tone === 'failed' ? 0 : 1) || byTime(a, b)).slice(0, MAX_LINES),
    decisions: decisionLines,
    next,
    quiet: changed.length === 0 && finished.length === 0 && decisionLines.length === 0
  }
}

export function buildReturnBriefing(since: number, tasks: readonly BriefingTaskInput[], decisions: readonly BriefingDecision[]): ReturnBriefing {
  const all = tasks.map((t) => briefTask(t, since, decisions))
  const loud = all.filter((t) => !t.quiet)
  // Decisions first, then failures, then anything else that moved.
  const rank = (t: TaskBriefing): number => (t.decisions.length > 0 ? 0 : t.finished.some((l) => l.tone === 'failed') ? 1 : 2)
  loud.sort((a, b) => rank(a) - rank(b))
  const nDecisions = loud.reduce((n, t) => n + t.decisions.length, 0)
  const nFinished = loud.reduce((n, t) => n + t.finished.length, 0)
  const nFailed = loud.reduce((n, t) => n + t.finished.filter((l) => l.tone === 'failed').length, 0)
  const parts: string[] = []
  if (nDecisions > 0) parts.push(`${plural(nDecisions, 'decision')} waiting on you`)
  // "finished", not "runs finished": an agent's reply is a finished thing and not a run.
  if (nFinished > 0) parts.push(`${nFinished} finished${nFailed > 0 ? ` (${nFailed} failed)` : ''}`)
  const moved = loud.filter((t) => t.changed.length > 0).length
  if (moved > 0) parts.push(`${plural(moved, 'task')} changed`)
  return {
    since,
    tasks: loud,
    quietCount: all.length - loud.length,
    headline: parts.length === 0 ? 'Nothing happened on your tasks while you were away.' : `${parts.join(' · ')}.`
  }
}

/** "2 h ago", "yesterday 17:40" — when the person was last here, for the card's title. */
export function sinceWords(since: number, now: number): string {
  const m = Math.round((now - since) / 60_000)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = new Date(since)
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
