import type { PendingApproval, RailAttention } from './rail-sections'

/**
 * M308. THE DECISION INBOX — the Needs-you queue as decisions rather than a
 * list of names: each item says what is blocked and why, carries enough
 * context to decide, offers the verbs that actually resolve it, and is
 * ordered by what deciding it UNBLOCKS.
 *
 * THE QUEUE STAYS THE SOURCE OF TRUTH. The items are built from the same
 * phantom-filtered `RailAttention` rows (oldest first) and the same pending
 * requests every other surface answers; nothing here adds a state to a panel
 * or clears one. That is also why snoozing is a VIEW: `wants-you` is cleared
 * only by a person acting (M6c), so a snoozed item is filtered from this list
 * and still counted — "2 snoozed" — never made to disappear.
 *
 * ORDER. Most unblocked first, then longest waiting — and with nothing
 * downstream of anything, that IS the queue's own arrival order, so an inbox
 * with no hand-offs reads exactly as the queue did. "Unblocks" counts every
 * panel transitively downstream over links carrying an automation rule (a
 * hand-off that fires when this one finishes); a bare link records a relation
 * and blocks nothing, so it counts nothing.
 *
 * DUPLICATES. Two agents asking for the identical action (same tool, same
 * full action, same directory) are ONE decision with two members: the item
 * names both agents and offers "Allow all once", which answers each request
 * individually. A panel's own further requests are counted on its item
 * ("+2 more waiting") rather than hidden, which is what the rows did before.
 *
 * Pure: types only. `verify:rail inbox.1–.4`.
 */

export type InboxKind = 'permission' | 'question'

export interface InboxMember {
  panelId: string
  label: string
  requestId?: string
}

export interface InboxItem {
  /** Stable while the decision is the same one: a request id, or the panel for a question. */
  key: string
  kind: InboxKind
  /** The longest-waiting member — where a jump goes. */
  panelId: string
  label: string
  /** Everyone asking for THIS decision. One unless duplicates were grouped. */
  members: InboxMember[]
  approval?: PendingApproval
  /** The panel's own requests beyond the one shown. */
  moreFromPanel: number
  /** The task the asking panel belongs to, by title. */
  task?: string
  /** One line: what is blocked, in the product's words. */
  blocker: string
  /** Enough to decide without going there: a directory, a last line. */
  context?: string
  since: number
  unblocks: number
}

export interface InboxInput {
  now: number
  /** The phantom-filtered queue, oldest first (`buildAttentionRows`). */
  rows: readonly RailAttention[]
  /** Every pending request on this renderer, arrival order per panel. */
  approvals: readonly PendingApproval[]
  kindOf: (panelId: string) => 'chat' | 'terminal' | 'other'
  taskOf?: (panelId: string) => string | undefined
  /** Automation-carrying links, source → target. */
  handoffs?: readonly { from: string; to: string }[]
  /** When the renderer first saw each key waiting. Absent → `now`. */
  firstSeen?: ReadonlyMap<string, number>
  /** A terminal's last output line, or a chat's last words, when read. */
  lastLineOf?: (panelId: string) => string | undefined
  /** key → snoozed until (epoch ms). */
  snoozes?: ReadonlyMap<string, number>
}

export interface Inbox {
  items: InboxItem[]
  snoozed: Array<InboxItem & { until: number }>
}

/** Every panel reachable downstream of `id` over the hand-offs, not counting itself. */
export function downstreamOf(id: string, handoffs: readonly { from: string; to: string }[]): Set<string> {
  const out = new Map<string, string[]>()
  for (const e of handoffs) {
    const list = out.get(e.from)
    if (list === undefined) out.set(e.from, [e.to])
    else list.push(e.to)
  }
  const seen = new Set<string>()
  const stack = [...(out.get(id) ?? [])]
  while (stack.length > 0) {
    const next = stack.pop() as string
    if (next === id || seen.has(next)) continue
    seen.add(next)
    stack.push(...(out.get(next) ?? []))
  }
  return seen
}

/** What makes two requests the same decision: the tool, the full action, and where it would run. */
export function duplicateKey(a: PendingApproval): string {
  return `${a.toolName}\0${a.action ?? a.argument}\0${a.cwd ?? ''}`
}

export function inboxKeyOf(row: { id: string; approval?: PendingApproval }): string {
  return row.approval === undefined ? `q:${row.id}` : `p:${row.approval.requestId}`
}

export function buildInbox(input: InboxInput): Inbox {
  const handoffs = input.handoffs ?? []
  const byPanel = new Map<string, PendingApproval[]>()
  for (const a of input.approvals) {
    const list = byPanel.get(a.id)
    if (list === undefined) byPanel.set(a.id, [a])
    else list.push(a)
  }
  const built: InboxItem[] = []
  const groups = new Map<string, InboxItem>()
  input.rows.forEach((row) => {
    const key = inboxKeyOf(row)
    const since = input.firstSeen?.get(key) ?? input.now
    const task = input.taskOf?.(row.id)
    const unblocks = downstreamOf(row.id, handoffs).size
    const mine = byPanel.get(row.id) ?? []
    if (row.approval !== undefined) {
      const a = row.approval
      const dup = duplicateKey(a)
      const existing = groups.get(dup)
      if (existing !== undefined) {
        existing.members.push({ panelId: row.id, label: row.label, requestId: a.requestId })
        existing.unblocks += unblocks
        existing.moreFromPanel += Math.max(0, mine.length - 1)
        return
      }
      const item: InboxItem = {
        key, kind: 'permission', panelId: row.id, label: row.label,
        members: [{ panelId: row.id, label: row.label, requestId: a.requestId }],
        approval: a,
        moreFromPanel: Math.max(0, mine.length - 1),
        ...(task === undefined ? {} : { task }),
        blocker: `wants to use ${a.toolName}${a.argument === '' ? '' : ` — ${a.argument}`}`,
        ...(a.cwd === undefined ? {} : { context: a.cwd }),
        since, unblocks
      }
      groups.set(dup, item)
      built.push(item)
      return
    }
    const kind = input.kindOf(row.id)
    const last = input.lastLineOf?.(row.id)
    built.push({
      key, kind: 'question', panelId: row.id, label: row.label,
      members: [{ panelId: row.id, label: row.label }],
      moreFromPanel: 0,
      ...(task === undefined ? {} : { task }),
      blocker: kind === 'chat' ? 'is waiting for your reply' : kind === 'terminal' ? 'rang for you — it is waiting at its prompt' : 'is waiting for you',
      ...(last === undefined || last.trim() === '' ? {} : { context: last.trim() }),
      since, unblocks
    })
  })
  // Most unblocked, then longest waiting, then the queue's own order — a stable sort keeps the last.
  const ranked = built
    .map((item, index) => ({ item, index }))
    .sort((x, y) => y.item.unblocks - x.item.unblocks || x.item.since - y.item.since || x.index - y.index)
    .map((x) => x.item)
  const items: InboxItem[] = []
  const snoozed: Array<InboxItem & { until: number }> = []
  for (const item of ranked) {
    const until = input.snoozes?.get(item.key)
    if (until !== undefined && until > input.now) snoozed.push({ ...item, until })
    else items.push(item)
  }
  return { items, snoozed }
}

/** "4m", "2h", "just now" — how long a decision has waited, at rest-layer brevity. */
export function waitedWords(since: number, now: number): string {
  const s = Math.max(0, Math.floor((now - since) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`
}

/** The snooze choices, in minutes. Until a time, never "forever": a decision cannot be put off into silence. */
export const SNOOZE_CHOICES: readonly { minutes: number; label: string }[] = [
  { minutes: 15, label: '15 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' }
]

/**
 * M308. The order ⌘J and the pill's Jump walk: the inbox's rank, every member
 * of a grouped decision in turn, snoozed decisions skipped. An id in the
 * queue the inbox has not built yet (an arrival this very frame) is kept at
 * the end rather than dropped — a jump key that skips a waiting panel it
 * could reach is the dead key `reachableQueue` exists to prevent.
 */
export function jumpOrder(queue: readonly string[], inbox: Inbox | null): string[] {
  if (inbox === null) return [...queue]
  const inQueue = new Set(queue)
  const snoozed = new Set(inbox.snoozed.flatMap((i) => i.members.map((m) => m.panelId)))
  const out: string[] = []
  for (const item of inbox.items) for (const m of item.members) if (inQueue.has(m.panelId) && !out.includes(m.panelId)) out.push(m.panelId)
  for (const id of queue) if (!out.includes(id) && !snoozed.has(id)) out.push(id)
  return out
}
