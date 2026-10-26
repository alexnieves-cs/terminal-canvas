import type { HandoffReply, ReviewOutcome, ReviewVerdict, SharedHandoff, SharedReview } from './canvas-ops'

/**
 * M581. THE MULTIPLAYER CANVAS'S POLICY — handoffs and the shared review
 * queue. Pure: the collab server's context (canvas-doc.ts opContext), main's
 * writes and a teammate's screen all read who holds an agent and where a
 * review stands from here, so the three can never disagree.
 *
 * A handoff settles by its replies alone, never by the maker's machine: the
 * usual handoff is "I'm leaving, take this", and an offer that waited for its
 * maker to come back online to close it would not be a handoff.
 *
 * - Named (`to` is a user id): that person's accept hands it; their decline
 *   ends it.
 * - Open (`to` is ''): the first accept hands it. Two truly concurrent
 *   accepts are broken by user id, the same answer on every peer — a tie
 *   broken by clock would not converge.
 * - Withdrawn by its maker: ended, untaken.
 */

export type HandoffState =
  | { state: 'open' }
  | { state: 'handed'; steward: string }
  | { state: 'declined' }
  | { state: 'withdrawn' }

export interface HandoffRead { handoff: SharedHandoff; replies: Readonly<Record<string, HandoffReply>>; withdrawn: boolean }

export function handoffState(h: Pick<SharedHandoff, 'to' | 'from'>, replies: Readonly<Record<string, HandoffReply>>, withdrawn: boolean): HandoffState {
  if (withdrawn) return { state: 'withdrawn' }
  if (h.to !== '') {
    const r = replies[h.to]
    return r === 'accept' ? { state: 'handed', steward: h.to } : r === 'decline' ? { state: 'declined' } : { state: 'open' }
  }
  const takers = Object.entries(replies).filter(([u, r]) => r === 'accept' && u !== h.from).map(([u]) => u).sort()
  return takers.length > 0 ? { state: 'handed', steward: takers[0] as string } : { state: 'open' }
}

/**
 * Who holds a panel's agent now: whoever took its highest-numbered handed
 * handoff, or its owner when none was. `n` is the chain's order, checked by
 * the server as each one opens, so a skewed clock cannot reorder it.
 */
export function stewardOf(panel: string, owner: string, reads: readonly HandoffRead[]): { steward: string; handed: number; open: HandoffRead | null } {
  let steward = owner, top = 0, handed = 0, topId = ''
  let open: HandoffRead | null = null
  for (const q of reads) {
    if (q.handoff.panel !== panel) continue
    const s = handoffState(q.handoff, q.replies, q.withdrawn)
    if (s.state === 'open') open = q
    if (s.state !== 'handed') continue
    handed += 1
    // Ties by id: the server lets only one handoff per number in, but a reader
    // must still answer the same on every peer whatever the map's order.
    if (q.handoff.n > top || (q.handoff.n === top && q.handoff.id < topId)) { top = q.handoff.n; topId = q.handoff.id; steward = s.steward }
  }
  return { steward, handed, open }
}

export interface ReviewRead {
  review: SharedReview
  claims: readonly string[]
  verdicts: Readonly<Record<string, ReviewVerdict>>
  closed?: ReviewOutcome
}

/**
 * Where a review stands. One "changes" decides it, whatever else was said —
 * the asks' rule: a person who says not yet is not outvoted by a second yes.
 * Otherwise one approve does.
 */
export function reviewDecision(verdicts: Readonly<Record<string, ReviewVerdict>>): 'open' | 'approved' | 'changes' {
  const all = Object.values(verdicts)
  if (all.includes('changes')) return 'changes'
  return all.includes('approve') ? 'approved' : 'open'
}

/** M582. A handoff as the person it is offered to sees it in Needs you. */
export interface HandoffRow {
  workspaceId: string
  handoffId: string
  /** The agent's placeholder on this canvas (its doc key): where a jump lands. */
  panelId: string
  panelTitle: string
  /** Who is handing it, by the name presence knows them by; null when they are not in the room. */
  fromName: string | null
  /** True when it names this person; false for an open offer to anyone. */
  named: boolean
  note: string
  scrubbed: number
  at: number
}

/**
 * Offers this person may take: open, not their own, and naming them or
 * nobody. A viewer is offered nothing (the caller leaves their workspaces
 * out) — the server would refuse their accept.
 */
export function handoffRows(
  workspaceId: string,
  reads: readonly HandoffRead[],
  panels: ReadonlyArray<{ id: string; title: string }>,
  me: string,
  nameOf: (userId: string) => string | null
): HandoffRow[] {
  const titles = new Map(panels.map((p) => [p.id, p.title]))
  return reads
    .filter((q) => titles.has(q.handoff.panel) && q.handoff.from !== me && (q.handoff.to === '' || q.handoff.to === me) &&
      q.replies[me] === undefined && handoffState(q.handoff, q.replies, q.withdrawn).state === 'open')
    .map((q) => ({
      workspaceId,
      handoffId: q.handoff.id,
      panelId: q.handoff.panel,
      panelTitle: titles.get(q.handoff.panel) ?? '',
      fromName: nameOf(q.handoff.from),
      named: q.handoff.to === me,
      note: q.handoff.note,
      scrubbed: q.handoff.scrubbed,
      at: q.handoff.at
    }))
    .sort((a, b) => Number(b.named) - Number(a.named) || a.at - b.at)
}

/** M582. A review in the team's queue, as a reviewer sees it. */
export interface ReviewRow {
  workspaceId: string
  reviewId: string
  panelId: string
  panelTitle: string
  ownerName: string | null
  title: string
  summary: string
  scrubbed: number
  at: number
  /** The names of the people already looking (presence's names; an unknown person is "a teammate"). */
  lookers: string[]
  /** This person said they are looking. */
  mine: boolean
}

/**
 * The queue: open reviews someone else posted that the verdicts have not
 * already decided and this person has not answered. A decided review leaves
 * before its poster closes it — the asks' reason: a verdict then changes
 * nothing.
 */
export function reviewRows(
  workspaceId: string,
  reads: readonly ReviewRead[],
  panels: ReadonlyArray<{ id: string; title: string }>,
  me: string,
  nameOf: (userId: string) => string | null
): ReviewRow[] {
  const titles = new Map(panels.map((p) => [p.id, p.title]))
  return reads
    .filter((q) => q.closed === undefined && q.review.owner !== me && q.verdicts[me] === undefined && reviewDecision(q.verdicts) === 'open')
    .map((q) => ({
      workspaceId,
      reviewId: q.review.id,
      panelId: q.review.panel,
      panelTitle: titles.get(q.review.panel) ?? '',
      ownerName: nameOf(q.review.owner),
      title: q.review.title,
      summary: q.review.summary,
      scrubbed: q.review.scrubbed,
      at: q.review.at,
      lookers: [...q.claims].sort().map((u) => (u === me ? 'you' : nameOf(u) ?? 'a teammate')),
      mine: q.claims.includes(me)
    }))
    // Unclaimed first, so a queue several people read spreads its work; then oldest.
    .sort((a, b) => Number(a.lookers.length > 0) - Number(b.lookers.length > 0) || a.at - b.at)
}

/** M583. The words beside a handoff row. A person is named only by the name presence knows them by. */
export function handoffWords(row: HandoffRow): { who: string; ask: string; scrubbed?: string } {
  const from = row.fromName ?? 'A teammate'
  return {
    who: `${from}'s agent${row.panelTitle === '' ? '' : ` · ${row.panelTitle}`}`,
    ask: row.named ? `${from} is handing it to you` : `${from} is handing it to anyone who can take it`,
    ...(row.scrubbed > 0 ? { scrubbed: `${row.scrubbed} secret${row.scrubbed === 1 ? '' : 's'} hidden before it left their machine` } : {})
  }
}

/** M583. The words beside a review row. */
export function reviewWords(row: ReviewRow): { who: string; looking: string; scrubbed?: string } {
  const owner = row.ownerName ?? 'A teammate'
  const looking = row.lookers.length === 0 ? 'nobody is looking yet'
    : row.lookers.length === 1 ? `${row.lookers[0]} ${row.lookers[0] === 'you' ? 'are' : 'is'} looking`
      : `${row.lookers.slice(0, -1).join(', ')} and ${row.lookers[row.lookers.length - 1]} are looking`
  return {
    who: `${owner} asks for a review${row.panelTitle === '' ? '' : ` · ${row.panelTitle}`}`,
    looking,
    ...(row.scrubbed > 0 ? { scrubbed: `${row.scrubbed} secret${row.scrubbed === 1 ? '' : 's'} hidden before it left their machine` } : {})
  }
}

/** M582. The owner's side: how their own review stands, for the line beside their panel. */
export function reviewStandingWords(q: ReviewRead, nameOf: (userId: string) => string | null): string {
  if (q.closed === 'withdrawn') return 'review withdrawn'
  const d = q.closed ?? reviewDecision(q.verdicts)
  const by = (v: ReviewVerdict): string => Object.entries(q.verdicts).filter(([, x]) => x === v).map(([u]) => nameOf(u) ?? 'a teammate').join(', ')
  if (d === 'approved') return `approved by ${by('approve')}`
  if (d === 'changes') return `changes asked by ${by('changes')}`
  return q.claims.length === 0 ? 'waiting for a reviewer' : `${q.claims.map((u) => nameOf(u) ?? 'a teammate').join(', ')} looking`
}

/**
 * M582. What the renderer may ask main to write. It names a workspace, an
 * object and a choice — never a person: the name every write is made in is
 * main's signed-in person, and the collab server checks it again. Ids,
 * the chain number, the time and the scrub are main's too.
 */
export type FlowRequest =
  | { kind: 'hand-off'; workspaceId: string; panelId: string; to: string; note: string }
  | { kind: 'take' | 'decline' | 'withdraw'; workspaceId: string; handoffId: string }
  | { kind: 'ask-review'; workspaceId: string; panelId: string; title: string; summary: string }
  | { kind: 'look' | 'approve' | 'request-changes' | 'withdraw-review' | 'settle-review'; workspaceId: string; reviewId: string }

const FLOW_ID = /^[A-Za-z0-9_-]{1,160}$/
const FLOW_WS = /^[A-Za-z0-9_-]{1,64}$/
/** A Supabase user id, or '' for an open offer. */
const FLOW_USER = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i

/** The body of `team:flow-write`, shape-checked; undefined refuses. Text is bounded here and scrubbed in main. */
export function parseFlowRequest(raw: unknown): FlowRequest | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const ws = r['workspaceId'], kind = r['kind']
  if (typeof ws !== 'string' || !FLOW_WS.test(ws)) return undefined
  const id = (k: string): string | undefined => { const v = r[k]; return typeof v === 'string' && FLOW_ID.test(v) ? v : undefined }
  const text = (k: string, max: number): string | undefined => { const v = r[k]; return typeof v === 'string' && v.length <= max ? v : undefined }
  switch (kind) {
    case 'hand-off': {
      const panelId = id('panelId'), to = r['to'], note = text('note', 600)
      if (panelId === undefined || typeof to !== 'string' || !FLOW_USER.test(to) || note === undefined) return undefined
      return { kind, workspaceId: ws, panelId, to: to.toLowerCase(), note }
    }
    case 'take': case 'decline': case 'withdraw': {
      const handoffId = id('handoffId')
      return handoffId === undefined ? undefined : { kind, workspaceId: ws, handoffId }
    }
    case 'ask-review': {
      const panelId = id('panelId'), title = text('title', 160), summary = text('summary', 600)
      if (panelId === undefined || title === undefined || summary === undefined || title.trim() === '') return undefined
      return { kind, workspaceId: ws, panelId, title, summary }
    }
    case 'look': case 'approve': case 'request-changes': case 'withdraw-review': case 'settle-review': {
      const reviewId = id('reviewId')
      return reviewId === undefined ? undefined : { kind, workspaceId: ws, reviewId }
    }
    default: return undefined
  }
}

/** M582. The person's own side: an offer of theirs nobody has taken yet, or a review of theirs still in the queue. */
export interface FlowMineRow {
  workspaceId: string
  kind: 'handoff' | 'review'
  id: string
  panelId: string
  panelTitle: string
  /** One line: "waiting for Bea", "Cal is looking", "approved by Dee". */
  standing: string
  /** A review the verdicts have decided, for its poster to close (Done). */
  decided?: 'approved' | 'changes'
}

/** `team:flow`: everything the person's Needs you shows from the team's handoffs and review queue. */
export interface TeamFlowSnapshot {
  handoffs: HandoffRow[]
  reviews: ReviewRow[]
  mine: FlowMineRow[]
  /** Panels (doc keys, and this machine's own local ids) handed to someone, by that person's name — the "with Bea" line. */
  stewards: Array<{ workspaceId: string; panelId: string; name: string; you: boolean }>
  /**
   * M583. The agents this person may hand on or put up for review now: they
   * hold it, may edit the workspace, and no handoff of it is waiting — the
   * palette's "Hand off" and "Ask the team to review" rows, one per panel.
   */
  held: Array<{ workspaceId: string; panelId: string; title: string }>
  /** M583. The people in each shared room now, by presence's name — whom a handoff can name. Never this person. */
  teammates: Array<{ workspaceId: string; userId: string; name: string }>
}

export const EMPTY_TEAM_FLOW: TeamFlowSnapshot = { handoffs: [], reviews: [], mine: [], stewards: [], held: [], teammates: [] }

/** M582. The person's open offers and their reviews' standing (a closed review leaves; a decided one stays until it is closed). */
export function mineRows(
  workspaceId: string,
  handoffs: readonly HandoffRead[],
  reviews: readonly ReviewRead[],
  panels: ReadonlyArray<{ id: string; title: string }>,
  me: string,
  nameOf: (userId: string) => string | null
): FlowMineRow[] {
  const titles = new Map(panels.map((p) => [p.id, p.title]))
  const out: FlowMineRow[] = []
  for (const q of handoffs) {
    if (q.handoff.from !== me || !titles.has(q.handoff.panel) || handoffState(q.handoff, q.replies, q.withdrawn).state !== 'open') continue
    const standing = q.handoff.to === '' ? 'offered to anyone' : `waiting for ${nameOf(q.handoff.to) ?? 'a teammate'}`
    out.push({ workspaceId, kind: 'handoff', id: q.handoff.id, panelId: q.handoff.panel, panelTitle: titles.get(q.handoff.panel) ?? '', standing })
  }
  for (const q of reviews) {
    if (q.review.owner !== me || q.closed !== undefined) continue
    const d = reviewDecision(q.verdicts)
    out.push({ workspaceId, kind: 'review', id: q.review.id, panelId: q.review.panel, panelTitle: titles.get(q.review.panel) ?? q.review.title, standing: reviewStandingWords(q, nameOf), ...(d === 'open' ? {} : { decided: d }) })
  }
  return out
}
