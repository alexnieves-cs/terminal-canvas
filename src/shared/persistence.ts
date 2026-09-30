/**
 * Brief #20. WHAT SURVIVES, IN WORDS A PERSON CAN ACT ON.
 *
 * Two questions a person asks about this app's persistence, and before this
 * module neither had an answer on screen:
 *
 * 1. **"I'm back — what is still running?"** On reopening, a restored panel
 *    was one of three different things wearing the same dormant card: a
 *    session that REATTACHED (tmux kept it), a session that was supposed to
 *    survive and did NOT (it ended while the app was closed), or a panel
 *    whose process stopped because quitting stops processes, which is the
 *    default and nobody's fault. The first is good news, the second is a
 *    problem worth keeping visible until it is dealt with, the third is a
 *    fact. One card for all three is the silent failure.
 * 2. **"If I close this, what happens to the work?"** Closing a panel,
 *    closing the window and quitting do three different things, and which
 *    thing depends on the backend and on `session.keepOnQuit`. The answer
 *    lived in comments in `quit.ts` and `window-lifecycle.ts`.
 *
 * The distinction in (1) needs a fact the renderer cannot reconstruct: WHICH
 * panels had a session when the window last went away. Main records it at
 * that moment (`main/last-exit.ts`), because a panel that was already dormant
 * before the quit and one that was running at the quit look identical the
 * next morning. Without the record this module makes no "ended" claim at all:
 * a missing record (a crash, a first launch) is silence, not a diagnosis.
 *
 * Pure: no DOM, no electron. `verify:layout persist.*`.
 */

import { mergedLine } from './review-readiness'

/** How the window last went away. A quit and a closed window stop different things. */
export type ExitHow = 'quit' | 'window'

/** Main's record of the moment the window last went away. */
export interface LastExit {
  /** Epoch ms. */
  at: number
  how: ExitHow
  /** Were the sessions KEPT (tmux + the setting, or a window close on tmux)? */
  kept: boolean
  /** Panel ids that had a live session at that moment. */
  running: string[]
}

/**
 * The file's reader. Absent is `null`; a malformed file is ALSO `null`, but
 * only after every field was checked — a record that half-parses would
 * report "ended" for panels it never listed, which is the one claim this
 * module must not make without evidence.
 */
export function parseLastExit(raw: unknown): LastExit | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null
  if (r.how !== 'quit' && r.how !== 'window') return null
  if (typeof r.kept !== 'boolean') return null
  if (!Array.isArray(r.running) || !r.running.every((id) => typeof id === 'string')) return null
  return { at: r.at, how: r.how, kept: r.kept, running: [...r.running] as string[] }
}

export interface ReopenPanel { id: string; label: string }

export interface ReopenInput {
  /** The RESTORED panels that run a process — terminals. Never a note. */
  panels: readonly ReopenPanel[]
  /** Main's answer at boot: which of them have a live session now. */
  live: ReadonlySet<string>
  lastExit: LastExit | null
  /** Recoverable problems found while restoring, in a person's words. */
  issues?: readonly string[]
}

export interface ReopenSummary {
  /** A session was still there, and the panel reattached to it. */
  reconnected: ReopenPanel[]
  /** It had a session, the session was meant to be kept, and it is gone. A problem. */
  ended: ReopenPanel[]
  /** It had a session, and closing stopped it — by design. Needs starting. */
  stopped: ReopenPanel[]
  /** It was not running when the window went away either. Nothing changed; not reported. */
  waiting: ReopenPanel[]
  issues: string[]
  lastExit: LastExit | null
}

/**
 * The partition, in one place. The ORDER of the arms is the rule: the live
 * session is asked about FIRST, so a record saying a panel was running can
 * never demote one that reattached.
 */
export function reopenSummary(input: ReopenInput): ReopenSummary {
  const out: ReopenSummary = { reconnected: [], ended: [], stopped: [], waiting: [], issues: [...(input.issues ?? [])], lastExit: input.lastExit }
  const wasRunning = new Set(input.lastExit?.running ?? [])
  for (const p of input.panels) {
    if (input.live.has(p.id)) out.reconnected.push(p)
    else if (input.lastExit !== null && wasRunning.has(p.id)) (input.lastExit.kept ? out.ended : out.stopped).push(p)
    else out.waiting.push(p)
  }
  return out
}

export type ReopenGroup = 'reconnected' | 'ended' | 'stopped' | 'issue' | 'task'

export interface ReopenLine {
  group: ReopenGroup
  /** `problem` stays until resolved; `info` goes with "Got it". */
  tone: 'problem' | 'info'
  text: string
  /** The panels the line names, so each can be gone to or started. */
  panels: ReopenPanel[]
  /** M401 (B7). A `task` line's outcome; absent on every terminal line. */
  outcome?: ReopenTaskOutcome
}

function names(list: readonly ReopenPanel[]): string {
  if (list.length === 1) return list[0]!.label
  if (list.length === 2) return `${list[0]!.label} and ${list[1]!.label}`
  return `${list.length} terminals`
}

/**
 * The sentences, and nothing a reader would have to decode. A reconnected
 * line with no record behind it (a reload) still says what it is — the tmux
 * session was there — without claiming when anything happened.
 */
export function reopenLines(s: Pick<ReopenSummary, 'reconnected' | 'ended' | 'stopped' | 'issues' | 'lastExit'>): ReopenLine[] {
  const lines: ReopenLine[] = []
  const window = s.lastExit?.how === 'window'
  if (s.ended.length > 0) {
    const verb = s.ended.length === 1 ? 'ended' : 'all ended'
    lines.push({
      group: 'ended',
      tone: 'problem',
      text: `${names(s.ended)} ${verb} while the ${window ? 'window' : 'app'} was closed, though ${s.ended.length === 1 ? 'it was' : 'they were'} set to keep running — start again or leave stopped`,
      panels: [...s.ended]
    })
  }
  for (const issue of s.issues) lines.push({ group: 'issue', tone: 'problem', text: issue, panels: [] })
  if (s.reconnected.length > 0) {
    lines.push({
      group: 'reconnected',
      tone: 'info',
      text: `${names(s.reconnected)} reconnected — ${s.reconnected.length === 1 ? 'it' : 'they'} kept running while the ${window ? 'window' : 'app'} was closed`,
      panels: [...s.reconnected]
    })
  }
  if (s.stopped.length > 0) {
    lines.push({
      group: 'stopped',
      tone: 'info',
      text: `${names(s.stopped)} stopped when ${window ? 'the window closed' : 'you quit'} — click ${s.stopped.length === 1 ? 'it' : 'one'} to start it again`,
      panels: [...s.stopped]
    })
  }
  return lines
}

/**
 * M401 (B7). THE RETURN, FOR TASK-SHAPED WORK. The lines above speak about
 * terminal PTYs only — main's record lists pty ids — so a person whose work
 * was a chat and a review came back to nothing. A task needs no new record:
 * its work item, its handoff and whether its conversation is on the canvas
 * already say which of three things it is.
 *
 * - `finished` — accepted (merged). Nothing to do but look.
 * - `needs-you` — its lane is ready to review, or it is blocked on an answer.
 * - `asleep` — its conversation is on the canvas with no process (a chat's
 *   process always ends with the app); it picks up on the next message.
 *
 * The panel named is the one "Show" goes to. Each line is `info`: this is
 * news, and "Got it" clears it; the task keeps its own state on its card.
 */
export type ReopenTaskOutcome = 'finished' | 'needs-you' | 'asleep'

export interface ReopenTask extends ReopenPanel {
  outcome: ReopenTaskOutcome
  /** What a lone line adds after the outcome — "merged into main as abc1234", "ready to review". */
  detail?: string
}

/**
 * The handoff state a task came back in, as one of the three outcomes; null
 * says nothing (never started, lane gone). `asleep` needs the conversation on
 * the canvas — without it there is nothing to wake, and the task's card
 * already says what it is.
 */
export function reopenTaskOutcome(state: string | undefined, merged: boolean, conversationOpen = true): ReopenTaskOutcome | null {
  if (merged || state === 'accepted') return 'finished'
  if (state === 'ready' || state === 'shared' || state === 'blocked') return 'needs-you'
  if ((state === 'working' || state === 'empty') && conversationOpen) return 'asleep'
  return null
}

/** The line's added words for a lone task: where a finished one went, or why one needs you. */
export function reopenTaskDetail(outcome: ReopenTaskOutcome, facts: { merged?: { into: string; sha: string }; state?: string; word?: string }): string | undefined {
  if (outcome === 'finished') return facts.merged === undefined ? undefined : mergedLine(facts.merged)
  if (outcome === 'needs-you') return facts.state === 'blocked' ? 'it is waiting on an answer' : facts.word
  return undefined
}

function taskNames(list: readonly ReopenPanel[]): string {
  if (list.length === 1) return `“${list[0]!.label}”`
  if (list.length === 2) return `“${list[0]!.label}” and “${list[1]!.label}”`
  return `${list.length} tasks`
}

/** One line per outcome, the terminal lines' grouping: needs you first, then finished, then asleep. */
export function reopenTaskLines(tasks: readonly ReopenTask[]): ReopenLine[] {
  const lines: ReopenLine[] = []
  const of = (o: ReopenTaskOutcome): ReopenTask[] => tasks.filter((t) => t.outcome === o)
  const one = (list: readonly ReopenTask[]): string => (list.length === 1 && list[0]!.detail !== undefined && list[0]!.detail !== '' ? ` — ${list[0]!.detail}` : '')
  const needs = of('needs-you'), done = of('finished'), asleep = of('asleep')
  if (needs.length > 0) lines.push({ group: 'task', outcome: 'needs-you', tone: 'info', text: `${taskNames(needs)} ${needs.length === 1 ? 'needs' : 'need'} you${one(needs)}`, panels: needs.map(({ id, label }) => ({ id, label })) })
  if (done.length > 0) lines.push({ group: 'task', outcome: 'finished', tone: 'info', text: `${taskNames(done)} finished${one(done)}`, panels: done.map(({ id, label }) => ({ id, label })) })
  if (asleep.length > 0) lines.push({ group: 'task', outcome: 'asleep', tone: 'info', text: `${taskNames(asleep)} ${asleep.length === 1 ? 'is' : 'are'} asleep — ${asleep.length === 1 ? 'it picks' : 'each picks'} up on your next message`, panels: asleep.map(({ id, label }) => ({ id, label })) })
  return lines
}

export interface LifecycleInput {
  /** The session backend, or null before main has answered. */
  backend: 'tmux' | 'direct' | null
  /** `session.keepOnQuit`. */
  keepOnQuit: boolean
}

export interface LifecycleFacts {
  closePanel: string
  closeWindow: string
  quit: string
}

/**
 * What each way of leaving does to execution — ONE copy, read by every
 * surface that says it. The sentences follow `main/quit.ts` and
 * `main/window-lifecycle.ts`, and when those change, these do.
 *
 * Chats are named in the quit sentence because they behave differently from
 * terminals on BOTH arms: their process ends with the app either way, and
 * the conversation resumes on the next message (M71's `--resume`).
 */
export function lifecycleFacts(input: LifecycleInput): LifecycleFacts {
  const closePanel = CLOSE_PANEL_FACT
  if (input.backend === null) return { closePanel, closeWindow: '', quit: '' }
  const tmux = input.backend === 'tmux'
  const closeWindow = tmux
    ? 'Closing the window keeps terminals running; reopening reconnects them.'
    : 'Closing the window ends every terminal’s process — keeping them needs tmux.'
  const chats = 'Chats stop and resume on your next message.'
  const quit = input.keepOnQuit && tmux
    ? `Quitting keeps terminals running, and the next launch reconnects them. ${chats}`
    : input.keepOnQuit
      ? `Quitting ends every terminal — keeping them needs tmux. ${chats}`
      : `Quitting ends every terminal; they come back stopped, ready to start. ${chats}`
  return { closePanel, closeWindow, quit }
}

/** Closing ONE panel, on any backend: the process ends and undo does not bring it back. */
export const CLOSE_PANEL_FACT = 'Closing a terminal ends its process; undo brings the panel back stopped, not the process.'
