import type { TimelineEntry } from './run-ledger'
import { AUTO_VERDICT_WORDS, type AutoVerdict } from './auto'

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
  /**
   * M478. How the task's last auto run ended, from its chats' snapshots:
   * done with a verdict, or stuck because its check kept failing. Absent
   * when no auto run finished there.
   */
  auto?: { verdict: AutoVerdict; check?: string } | { stuck: 'check'; check?: string }
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
  /** M478. The morning queue: one list across tasks, in the order to work it. */
  queue: MorningItem[]
}

/**
 * M478. THE MORNING QUEUE — what a night of work left, as ONE list across
 * tasks in the order a person should work it: failed checks first (the work
 * is wrong and an agent can be sent back now), then decisions (an agent is
 * stopped on the person), then finished work to review — CHECKED work before
 * work with no auto run before work the agent only CLAIMED, and within each,
 * the fewest changed files first, so the cheapest review is always on top.
 *
 * Every item is a line the briefing already built or a fact the card already
 * shows; nothing here is invented. Pure. `verify:ux morning.*`.
 */
export type MorningKind = 'failed' | 'decision' | 'checked' | 'review' | 'claimed'

export interface MorningItem {
  kind: MorningKind
  itemId: string
  title: string
  text: string
  evidence?: BriefEvidence
  /** Changed files in the task's lane, when known — the review's cost. */
  files?: number
}

const MORNING_RANK: Record<MorningKind, number> = { failed: 0, decision: 1, checked: 2, review: 3, claimed: 4 }

export function morningQueue(tasks: readonly TaskBriefing[], inputs: readonly BriefingTaskInput[]): MorningItem[] {
  const out: MorningItem[] = []
  for (const t of tasks) {
    const input = inputs.find((i) => i.itemId === t.itemId)
    const files = input?.handoff?.files
    const auto = input?.auto
    // A check that failed overnight is said once per task, by its own line; a
    // run that gave up on its check says so even when no command row landed.
    const failedLines = t.finished.filter((l) => l.tone === 'failed')
    for (const l of failedLines) out.push({ kind: 'failed', itemId: t.itemId, title: t.title, text: l.text, ...(l.evidence === undefined ? {} : { evidence: l.evidence }) })
    if (failedLines.length === 0 && auto !== undefined && 'stuck' in auto) {
      out.push({ kind: 'failed', itemId: t.itemId, title: t.title, text: `${auto.check === undefined ? 'its check' : `\`${auto.check}\``} kept failing — the auto run gave up`, evidence: { kind: 'review', itemId: t.itemId } })
    }
    for (const l of t.decisions) out.push({ kind: 'decision', itemId: t.itemId, title: t.title, text: l.text, ...(l.evidence === undefined ? {} : { evidence: l.evidence }) })
    if (failedLines.length > 0 || (auto !== undefined && 'stuck' in auto)) continue
    const verdict = auto !== undefined && 'verdict' in auto ? auto.verdict : undefined
    const hasWork = files !== undefined && files > 0
    if (!hasWork && verdict === undefined) continue
    const kind: MorningKind = verdict === 'checked' ? 'checked' : verdict === 'claimed' ? 'claimed' : 'review'
    const what = hasWork ? `${plural(files as number, 'changed file')} to review` : 'finished — nothing changed in the lane'
    const how = kind === 'checked' ? ` · ${auto !== undefined && 'check' in auto && auto.check !== undefined ? `\`${auto.check}\` passed` : AUTO_VERDICT_WORDS.checked}`
      : kind === 'claimed' ? ` · ${AUTO_VERDICT_WORDS.claimed}, nothing checked it` : ''
    out.push({ kind, itemId: t.itemId, title: t.title, text: `${what}${how}`, evidence: { kind: 'review', itemId: t.itemId }, ...(files === undefined ? {} : { files }) })
  }
  // Stable within a rank (the briefing's own order), then cheapest first.
  return out
    .map((item, i) => ({ item, i }))
    .sort((a, b) => MORNING_RANK[a.item.kind] - MORNING_RANK[b.item.kind] || (a.item.files ?? Infinity) - (b.item.files ?? Infinity) || a.i - b.i)
    .map(({ item }) => item)
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
    headline: parts.length === 0 ? 'Nothing happened on your tasks while you were away.' : `${parts.join(' · ')}.`,
    queue: morningQueue(loud, tasks)
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
