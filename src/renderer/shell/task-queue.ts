import type { Inbox, InboxItem } from './decision-inbox'
import { downstreamOf } from './decision-inbox'
import type { ReviewHandoffState, ReviewStanding } from '@shared/review-readiness'
import type { Tone } from '@renderer/panels/panel-state'

/**
 * M318. THE TASK-CENTERED DECISION QUEUE — "What needs me, why, and what
 * happens after I respond?", answered per TASK rather than per panel.
 *
 * M308's inbox made each waiting panel a decision; with ten active tasks that
 * is still a list of agents, and the person has to reassemble which task each
 * belongs to, whether a failed check or a finished review elsewhere is part of
 * the same story, and what else waits behind it. This groups every kind of
 * decision a task can be waiting on under that task:
 *
 * - **permission** and **question** — the inbox's own items, untouched (the
 *   queue stays the source of truth; nothing here answers or clears one);
 * - **check** — the latest run of a command in the task failed and no later
 *   run of it passed (M306's witnessed rows, never an agent's claim);
 * - **review** — the agent finished with changes and the person has not
 *   reviewed THIS revision (`ReviewStanding`), the M307 "finished ≠ verified"
 *   line;
 * - **lost** — a permission or question that was waiting when the app last
 *   closed and did not come back (its session ended). Kept, because a
 *   decision a person never made must not disappear silently at a restart.
 *
 * Each group says WHY the task is stopped (one sentence, from its most
 * blocking decision), the NEXT step (a verb and where it goes), which other
 * tasks WAIT on it (over enabled hand-off links between the tasks' panels —
 * the same rule the inbox's "unblocks" counts), and what happens AFTER the
 * person responds. Order: an agent stopped mid-turn first (it can do nothing
 * until answered), then failures, then reviews; within a kind, more waiting
 * behind it first, then the longest waiting.
 *
 * INFORMATIONAL vs INTERVENTION. `classifyActivity` is the one place the
 * distinction is drawn for the activity feed: an entry is `intervene` only
 * when its tone is the needs-you tone (a state that stops until a person
 * acts) or a failure; everything else is information. A task that is simply
 * working is counted, never listed.
 *
 * Pure: types and one value import from a pure module. `verify:rail queue.*`.
 */

export type QueueKind = 'permission' | 'question' | 'check' | 'review' | 'lost'

export type QueueEvidence =
  | { kind: 'decision'; panelId: string; requestId?: string }
  | { kind: 'panel'; panelId: string }
  | { kind: 'output'; outputId: string; panelId: string }
  | { kind: 'review'; itemId: string }

export interface QueueDecision {
  /** Stable while it is the same decision — the inbox key, `check:<item>:<command>`, `review:<item>`, `lost:<key>`. */
  key: string
  kind: QueueKind
  /** One line, in the product's words. */
  text: string
  since: number
  evidence: QueueEvidence
  /** The inbox item, for permission and question — the Dock renders its verbs. */
  inbox?: InboxItem
}

export interface TaskGroup {
  /** Null for decisions from panels no task owns. */
  itemId: string | null
  title: string
  /** `blocked` — an agent is stopped on the person; `failed` — a check failed; `review` — finished, not reviewed; `lost` — only restart leftovers. */
  severity: 'blocked' | 'failed' | 'review' | 'lost'
  why: string
  next: { label: string; evidence: QueueEvidence }
  after: string
  decisions: QueueDecision[]
  /** Tasks that wait on this one, over hand-off links. */
  affects: { itemId: string; title: string }[]
  oldest: number
}

export interface TaskQueue {
  groups: TaskGroup[]
  /** Decisions across every group — what needs the person. */
  decisions: number
  /** Active tasks that need nothing — counted, not listed. */
  quiet: number
  headline: string
}

export interface QueueCheckRun {
  command: string
  panelId: string
  at: number
  exitCode: number | null
  outputId?: string
}

export interface QueueTaskInput {
  itemId: string
  title: string
  /** The task's member panels (M203's membership). */
  members: readonly string[]
  handoff?: { state: ReviewHandoffState; standing: ReviewStanding; files?: number }
  /** The task's witnessed command runs, any order. */
  runs?: readonly QueueCheckRun[]
}

/** A decision that was waiting when the app last closed (decision memory). */
export interface RememberedDecision {
  key: string
  kind: 'permission' | 'question'
  itemId: string | null
  label: string
  text: string
  since: number
  panelId: string
}

export interface QueueInput {
  now: number
  tasks: readonly QueueTaskInput[]
  inbox: Inbox
  /** Enabled hand-off links between panels, source → target. */
  handoffs?: readonly { from: string; to: string }[]
  /** Restart leftovers not live now (`lostDecisions`). */
  lost?: readonly RememberedDecision[]
  labelOf?: (panelId: string) => string
}

const SEVERITY_RANK: Record<TaskGroup['severity'], number> = { blocked: 0, failed: 1, review: 2, lost: 3 }

/**
 * Is this command a CHECK — something whose failure is a decision — rather
 * than any shell command a person typed (a mistyped `git sttus` is not)?
 * A watcher's run always is; otherwise the task's own declared checks, or a
 * command that names a test, lint, type or build tool.
 */
export function isCheckCommand(command: string, opts: { watcher?: boolean; declared?: readonly string[] } = {}): boolean {
  if (opts.watcher === true) return true
  const c = command.trim()
  if ((opts.declared ?? []).some((d) => d.trim() === c || c.includes(d.trim()))) return true
  return /(^|[\s/])(test|tests|lint|typecheck|tsc|verify|check|pytest|jest|vitest|mocha|eslint|ruff|mypy|clippy|rspec|phpunit)(\b|:)|\b(cargo|go|swift|mvn|gradle|dotnet|npm|pnpm|yarn|bun|make)\s+(run\s+)?(test|lint|check|build|typecheck|verify)\b/.test(c)
}

/** Latest run per command; failing when the latest exited non-zero (a signal is a failure — M84). */
export function failingChecks(runs: readonly QueueCheckRun[]): QueueCheckRun[] {
  const latest = new Map<string, QueueCheckRun>()
  for (const r of runs) {
    const cur = latest.get(r.command)
    if (cur === undefined || r.at > cur.at) latest.set(r.command, r)
  }
  return [...latest.values()].filter((r) => r.exitCode !== 0).sort((a, b) => a.at - b.at)
}

function decisionFromInbox(item: InboxItem): QueueDecision {
  const who = item.members.length > 1 ? `${item.label} + ${item.members.length - 1} more` : item.label
  return {
    key: item.key, kind: item.kind, text: `${who} ${item.blocker}`, since: item.since, inbox: item,
    evidence: { kind: 'decision', panelId: item.panelId, ...(item.approval === undefined ? {} : { requestId: item.approval.requestId }) }
  }
}

function describe(group: { title: string; decisions: QueueDecision[]; affects: { title: string }[] }): Pick<TaskGroup, 'severity' | 'why' | 'next' | 'after'> {
  const d = group.decisions
  const first = (k: QueueKind): QueueDecision | undefined => d.find((x) => x.kind === k)
  const waiters = group.affects.length === 0 ? '' : ` ${group.affects.map((a) => a.title).join(', ')} ${group.affects.length === 1 ? 'waits' : 'wait'} on this task and can go on once it finishes.`
  const perm = first('permission'), q = first('question'), check = first('check'), review = first('review'), lost = first('lost')
  if (perm !== undefined) {
    const a = perm.inbox?.approval
    return {
      severity: 'blocked',
      why: `Stopped — ${perm.inbox?.label ?? 'an agent'} needs your permission to use ${a?.toolName ?? 'a tool'}${d.length > 1 ? `, and ${d.length - 1} more ${d.length === 2 ? 'thing needs' : 'things need'} you here` : ''}.`,
      next: { label: `Answer ${a?.toolName ?? 'the'} request`, evidence: perm.evidence },
      after: `Allow and the agent carries on with its turn; deny and it is told no and chooses another way.${waiters}`
    }
  }
  if (q !== undefined) {
    return {
      severity: 'blocked',
      why: `Stopped — ${q.text}.`,
      next: { label: `Reply to ${q.inbox?.label ?? 'the agent'}`, evidence: q.evidence },
      after: `Your reply starts its next turn.${waiters}`
    }
  }
  if (check !== undefined) {
    const n = d.filter((x) => x.kind === 'check').length
    return {
      severity: 'failed',
      why: `${n === 1 ? 'A check' : `${n} checks`} failed — ${check.text}. Nothing is verified until ${n === 1 ? 'it passes' : 'they pass'}.`,
      next: { label: 'Open the failing output', evidence: check.evidence },
      after: `Send the failure to the agent from the review; once a re-run passes, the task can be verified.${waiters}`
    }
  }
  if (review !== undefined) {
    return {
      severity: 'review',
      why: `Waiting for your review — ${review.text}.`,
      next: { label: 'Review the changes', evidence: review.evidence },
      after: `Accept lands it; comments go back to the agent as one follow-up.${waiters}`
    }
  }
  return {
    severity: 'lost',
    why: `A decision from before the restart did not come back — ${lost?.text ?? 'its session ended'}.`,
    next: { label: 'Go to it', evidence: lost?.evidence ?? { kind: 'panel', panelId: '' } },
    after: 'Continue the task and the agent asks again; nothing was allowed on your behalf.'
  }
}

export function buildTaskQueue(input: QueueInput): TaskQueue {
  const handoffs = input.handoffs ?? []
  const ownerOf = new Map<string, string>()
  for (const t of input.tasks) for (const m of t.members) if (!ownerOf.has(m)) ownerOf.set(m, t.itemId)
  const byTask = new Map<string | null, QueueDecision[]>()
  const push = (itemId: string | null, d: QueueDecision): void => {
    const list = byTask.get(itemId)
    if (list === undefined) byTask.set(itemId, [d])
    else list.push(d)
  }
  // A grouped inbox item lands under the task of its FIRST member; its other
  // askers are named on the row (the inbox's own rule: one decision).
  for (const item of input.inbox.items) push(ownerOf.get(item.panelId) ?? null, decisionFromInbox(item))
  for (const t of input.tasks) {
    for (const r of failingChecks(t.runs ?? [])) {
      const where = input.labelOf?.(r.panelId)
      push(t.itemId, {
        key: `check:${t.itemId}:${r.command}`, kind: 'check', since: r.at,
        text: `\`${r.command}\` ${r.exitCode === null ? 'ended without an exit code' : `exited ${r.exitCode}`}${where === undefined ? '' : ` in ${where}`}`,
        evidence: r.outputId !== undefined ? { kind: 'output', outputId: r.outputId, panelId: r.panelId } : { kind: 'panel', panelId: r.panelId }
      })
    }
    const h = t.handoff
    if (h !== undefined && h.state === 'ready' && h.standing !== 'current') {
      const files = h.files === undefined ? '' : ` (${h.files} file${h.files === 1 ? '' : 's'})`
      push(t.itemId, {
        key: `review:${t.itemId}`, kind: 'review', since: 0, evidence: { kind: 'review', itemId: t.itemId },
        text: h.standing === 'stale' ? `the changes moved since your review${files}` : `the agent finished with changes${files} and nothing is verified yet`
      })
    }
  }
  const liveKeys = new Set([...byTask.values()].flat().map((d) => d.key))
  for (const l of input.lost ?? []) {
    if (liveKeys.has(l.key)) continue
    push(l.itemId !== null && input.tasks.some((t) => t.itemId === l.itemId) ? l.itemId : null, {
      key: `lost:${l.key}`, kind: 'lost', since: l.since, evidence: { kind: 'panel', panelId: l.panelId },
      text: `${l.label} ${l.text} — its session ended before you answered`
    })
  }

  // Which tasks wait on which: any member of B downstream of any member of A.
  const affectsOf = (itemId: string): { itemId: string; title: string }[] => {
    const task = input.tasks.find((t) => t.itemId === itemId)
    if (task === undefined) return []
    const down = new Set<string>()
    for (const m of task.members) for (const d of downstreamOf(m, handoffs)) down.add(d)
    return input.tasks.filter((t) => t.itemId !== itemId && t.members.some((m) => down.has(m))).map((t) => ({ itemId: t.itemId, title: t.title }))
  }

  const kindRank: Record<QueueKind, number> = { permission: 0, question: 1, check: 2, review: 3, lost: 4 }
  const groups: TaskGroup[] = [...byTask.entries()].map(([itemId, decisions]) => {
    decisions.sort((a, b) => kindRank[a.kind] - kindRank[b.kind] || a.since - b.since)
    const title = itemId === null ? 'Not in a task' : input.tasks.find((t) => t.itemId === itemId)?.title ?? 'A task'
    const affects = itemId === null ? [] : affectsOf(itemId)
    const told = describe({ title, decisions, affects })
    const timed = decisions.filter((d) => d.since > 0).map((d) => d.since)
    return { itemId, title, decisions, affects, ...told, oldest: timed.length === 0 ? input.now : Math.min(...timed) }
  })
  groups.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.affects.length - a.affects.length || a.oldest - b.oldest || (a.itemId === null ? 1 : 0) - (b.itemId === null ? 1 : 0))

  const decisions = groups.reduce((n, g) => n + g.decisions.length, 0)
  const loud = new Set(groups.map((g) => g.itemId))
  const quiet = input.tasks.filter((t) => !loud.has(t.itemId)).length
  const blocked = groups.filter((g) => g.severity === 'blocked').length
  const parts: string[] = []
  if (blocked > 0) parts.push(`${blocked} stopped on you`)
  const failed = groups.filter((g) => g.severity === 'failed').length
  if (failed > 0) parts.push(`${failed} with a failed check`)
  const review = groups.filter((g) => g.severity === 'review').length
  if (review > 0) parts.push(`${review} to review`)
  const headline = groups.length === 0
    ? (quiet > 0 ? `Nothing needs you — ${quiet} task${quiet === 1 ? ' is' : 's are'} working or done.` : 'Nothing needs you.')
    : `${parts.join(' · ')}${quiet > 0 ? ` — ${quiet} other${quiet === 1 ? '' : 's'} need nothing` : ''}.`
  return { groups, decisions, quiet, headline }
}

/** The order keyboard traversal walks: group by group, decision by decision. */
export function traversalOrder(q: TaskQueue): string[] {
  return q.groups.flatMap((g) => g.decisions.map((d) => d.key))
}

/** One step of the cursor, wrapping; a key no longer in the queue restarts at the top. */
export function stepCursor(order: readonly string[], current: string | null, delta: 1 | -1): string | null {
  if (order.length === 0) return null
  const i = current === null ? -1 : order.indexOf(current)
  if (i === -1) return delta === 1 ? order[0] : order[order.length - 1]
  return order[(i + delta + order.length) % order.length]
}

/* ── Decision memory (restart) ───────────────────────────────────────────── */

/**
 * What to remember for the next launch: every permission and question
 * waiting now, keeping the first-seen time a decision already had. Pure; the
 * hook writes it to storage.
 */
export function rememberDecisions(prev: readonly RememberedDecision[], inbox: Inbox, ownerOf: (panelId: string) => string | null, liveThisSession: ReadonlySet<string>): RememberedDecision[] {
  const out = new Map<string, RememberedDecision>()
  // Carry what was remembered and never came live this session — still unresolved.
  for (const p of prev) if (!liveThisSession.has(p.key)) out.set(p.key, p)
  for (const item of [...inbox.items, ...inbox.snoozed]) {
    const before = prev.find((p) => p.key === item.key)
    out.set(item.key, {
      key: item.key, kind: item.kind, itemId: ownerOf(item.panelId), label: item.label, panelId: item.panelId,
      text: item.blocker, since: before?.since ?? item.since
    })
  }
  return [...out.values()]
}

/** Parse the stored memory; a malformed entry costs itself. */
export function parseRemembered(raw: unknown): RememberedDecision[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r): RememberedDecision[] => {
    if (typeof r !== 'object' || r === null) return []
    const o = r as Record<string, unknown>
    if (typeof o.key !== 'string' || (o.kind !== 'permission' && o.kind !== 'question') || typeof o.label !== 'string' || typeof o.text !== 'string' || typeof o.since !== 'number' || typeof o.panelId !== 'string') return []
    return [{ key: o.key, kind: o.kind, itemId: typeof o.itemId === 'string' ? o.itemId : null, label: o.label, text: o.text, since: o.since, panelId: o.panelId }]
  })
}

/* ── Information vs intervention ─────────────────────────────────────────── */

/**
 * An activity entry needs a person when it is a state that stops until one
 * acts (the needs-you tone) or its producer marked it so (a failed check);
 * everything else — working, finished a turn, went idle — is information.
 */
export function classifyActivity(e: { tone: Tone | string; intervene?: boolean }): 'intervene' | 'info' {
  return e.intervene === true || e.tone === 'needs-you' ? 'intervene' : 'info'
}
