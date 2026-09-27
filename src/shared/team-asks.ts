import type { AskAnswer, AskOutcome } from './canvas-ops'

/**
 * M375. THE TEAM QUEUE'S POLICY — Arc 2's multi-human approval with a spend
 * threshold. Pure: the owner's main decides with it, and a teammate's
 * screen says the same count with it ("1 of 2 allowed").
 *
 * - An ask needs ONE allow, or TWO distinct people's allows once the asking
 *   agent's spend has reached the threshold (`agents.teamEscalateUsd`). The
 *   second is the escalation: spend past a line the team drew is not one
 *   person's call.
 * - A single deny decides it, whatever the count: a person who says no to
 *   a command on a shared canvas is not outvoted.
 * - The owner answering on their own machine is one person like any other,
 *   and is written to the doc in their name, so the count is one count.
 */

/** Where a summary is cut before it leaves the machine: enough to judge a command, never a transcript. */
export const TEAM_ASK_SUMMARY_MAX = 300

/** How many distinct allows decide an ask: 2 at or past the threshold, else 1. No threshold, no escalation. */
export function approvalsNeeded(spentUsd: number | undefined, escalateAtUsd: number | undefined): 1 | 2 {
  if (escalateAtUsd === undefined || !Number.isFinite(escalateAtUsd) || escalateAtUsd <= 0) return 1
  return spentUsd !== undefined && spentUsd >= escalateAtUsd ? 2 : 1
}

/** What the answers so far decide: open until `need` distinct people allow, denied at the first deny. */
export function askDecision(need: 1 | 2, answers: Readonly<Record<string, AskAnswer>>): 'open' | Exclude<AskOutcome, 'withdrawn'> {
  const all = Object.values(answers)
  if (all.includes('deny')) return 'denied'
  return all.filter((a) => a === 'allow').length >= need ? 'allowed' : 'open'
}

/** The count as a person reads it beside an open ask. */
export function askProgressWords(need: 1 | 2, answers: Readonly<Record<string, AskAnswer>>): string {
  const allows = Object.values(answers).filter((a) => a === 'allow').length
  if (need === 1) return allows === 0 ? 'waiting for one person' : 'allowed'
  return `${Math.min(allows, 2)} of 2 allowed — spend past the team's line needs two people`
}

/**
 * M376. What a teammate would be allowing, or why it is answered here only.
 * A teammate approves what they can READ WHOLE: one line — a command, a URL,
 * a path, a pattern — that fits the cap, with nothing else in the request
 * beside it. An Edit's diff or a Write's content is exactly what a person
 * must see before allowing it (the approval detail's rule, #17), and it is
 * not sent to a server to be shown, so those stay on this machine. A cut
 * command is never sent either: the tail a reviewer needs (`&& rm -rf …`)
 * is the part a cut hides. Not scrubbed here — main scrubs it on its way
 * out, where the count is kept.
 */
const PRIMARY_KEYS = ['command', 'url', 'pattern', 'file_path', 'path', 'notebook_path', 'query'] as const
/** Keys a request may carry beside its one line without hiding anything the line does not say. */
const BESIDE = new Set(['description', 'timeout', 'run_in_background'])

export function teamAskAction(input: Readonly<Record<string, unknown>>): { action: string } | { local: string } {
  const key = PRIMARY_KEYS.find((k) => typeof input[k] === 'string')
  if (key === undefined) return { local: 'it is not a single command, address or path' }
  const extra = Object.keys(input).filter((k) => k !== key && !BESIDE.has(k) && input[k] !== undefined && input[k] !== '')
  if (extra.length > 0) return { local: `it carries ${extra.join(', ')} beside its ${key}, which a teammate would not see` }
  const action = (input[key] as string).trim()
  if (action === '') return { local: `its ${key} is empty` }
  if (/[\r\n]/.test(action)) return { local: `its ${key} is more than one line` }
  if (action.length > TEAM_ASK_SUMMARY_MAX) return { local: `its ${key} is longer than a teammate is shown (${TEAM_ASK_SUMMARY_MAX} characters)` }
  return { action }
}

/**
 * M377. One team ask as a TEAMMATE's Needs you lists it: someone else's
 * agent, the ask still open, and not yet answered by this person. The
 * asker's own asks never appear here — on their machine the request is the
 * ordinary permission row, answered through the ordinary door (M376 writes
 * that answer to the doc for them).
 */
export interface TeamAskRow {
  workspaceId: string
  askId: string
  /** The asking agent's placeholder on this canvas (its doc key): where a jump lands. */
  panelId: string
  /** Its title as the doc holds it (scrubbed on the owner's machine), or '' when that panel is gone. */
  panelTitle: string
  /** Whose agent, by the name presence knows them by; null when they are not in the room. */
  ownerName: string | null
  tool: string
  summary: string
  scrubbed: number
  need: 1 | 2
  /** Allows so far, from anyone — the progress a second approver needs to see. */
  allows: number
  at: number
}

export function teammateAskRows(
  workspaceId: string,
  reads: ReadonlyArray<{ ask: import('./canvas-ops').SharedAsk; answers: Readonly<Record<string, AskAnswer>>; closed?: AskOutcome }>,
  panels: ReadonlyArray<{ id: string; title: string }>,
  me: string,
  nameOf: (userId: string) => string | null
): TeamAskRow[] {
  const titles = new Map(panels.map((p) => [p.id, p.title]))
  return reads
    .filter((q) => q.closed === undefined && q.ask.owner !== me && q.answers[me] === undefined && askDecision(q.ask.need, q.answers) === 'open')
    .map((q) => ({
      workspaceId,
      askId: q.ask.id,
      panelId: q.ask.panel,
      panelTitle: titles.get(q.ask.panel) ?? '',
      ownerName: nameOf(q.ask.owner),
      tool: q.ask.tool,
      summary: q.ask.summary,
      scrubbed: q.ask.scrubbed,
      need: q.ask.need,
      allows: Object.values(q.answers).filter((a) => a === 'allow').length,
      at: q.ask.at
    }))
    .sort((a, b) => a.at - b.at)
}

/**
 * M378. A team ask's words in a teammate's Needs you: whose agent, what it
 * would run, and how far the answers have got. The owner is named only by
 * the name presence knows them by — never their user id, never a guess.
 */
export function teamAskWords(row: TeamAskRow): { who: string; action: string; progress: string; scrubbed?: string } {
  const owner = row.ownerName ?? 'A teammate'
  const progress = row.need === 1
    ? 'one person\'s allow decides it'
    : `${Math.min(row.allows, 2)} of 2 allowed — spend past the team's line needs two people`
  return {
    who: `${owner}'s agent${row.panelTitle === '' ? '' : ` · ${row.panelTitle}`}`,
    action: `${row.tool} — ${row.summary}`,
    progress,
    ...(row.scrubbed > 0 ? { scrubbed: `${row.scrubbed} secret${row.scrubbed === 1 ? '' : 's'} hidden before it left their machine` } : {})
  }
}
