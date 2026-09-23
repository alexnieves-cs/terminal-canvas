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

export type ReopenGroup = 'reconnected' | 'ended' | 'stopped' | 'issue'

export interface ReopenLine {
  group: ReopenGroup
  /** `problem` stays until resolved; `info` goes with "Got it". */
  tone: 'problem' | 'info'
  text: string
  /** The panels the line names, so each can be gone to or started. */
  panels: ReopenPanel[]
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
