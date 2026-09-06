import { buildPlan, parsePlanLine, planIsDestructive, type PlanFacts } from './plan'

/**
 * M101. A ROUTINE is a scheduled run that starts a FRESH chat as a teammate:
 * a name, the teammate, an interval, the prompt it sends, and optionally a
 * verb line (M96's plan) it runs after — refused at SAVE time if that line
 * holds a destructive verb, against M96's table, because a routine runs
 * unattended and cannot confirm anything. That refusal is why `destructive`
 * is data on the table rather than a judgement at a call site.
 *
 * In-app only, said on the row: the app is not a daemon, and a tick that
 * would have fired while it was closed is recorded as MISSED with the time
 * (`missedAt`), never skipped silently — a silently skipped run is the same
 * defect as a row that disappears.
 *
 * The design rule, carried verbatim into every routine chat's system prompt:
 * routines gather, analyze, draft and prepare; irreversible actions stay
 * behind confirmation.
 */
export interface PersistedRoutine {
  id: string
  name: string
  teammateId: string
  everyMs: number
  prompt: string
  /** M96's verb line, run after the prompt is sent. Never destructive (refused at save). */
  plan?: string
  paused: boolean
  lastRun?: { at: number; outcome: 'started' | 'refused'; panelId?: string; error?: string }
  /** The tick that fell while the app was closed, when one did. Cleared by the next run. */
  missed?: { at: number }
}

export const ROUTINES_MAX = 50
/** The shortest honest interval: below this a routine is a busy loop with a chat. */
export const ROUTINE_MIN_MS = 60_000

export const ROUTINE_PROMPT = 'You are running as a scheduled routine with nobody watching. Routines gather, analyze, draft and prepare; irreversible actions stay behind confirmation — do not delete, force-push, publish, pay, or send anything outward. Leave what you prepared where a person will find it and say what you did.'

export const ROUTINE_LIMIT_WORD = 'runs while the app is open — not while it is closed'

export function carryRoutine(r: PersistedRoutine): PersistedRoutine {
  return {
    id: r.id,
    name: r.name,
    teammateId: r.teammateId,
    everyMs: r.everyMs,
    prompt: r.prompt,
    ...(r.plan === undefined ? {} : { plan: r.plan }),
    paused: r.paused,
    ...(r.lastRun === undefined ? {} : { lastRun: { at: r.lastRun.at, outcome: r.lastRun.outcome, ...(r.lastRun.panelId === undefined ? {} : { panelId: r.lastRun.panelId }), ...(r.lastRun.error === undefined ? {} : { error: r.lastRun.error }) } }),
    ...(r.missed === undefined ? {} : { missed: { at: r.missed.at } })
  }
}

/**
 * The save-time refusal, by name. A destructive verb in the plan line, a
 * teammate without the schedule permission, an interval under the floor, an
 * empty prompt — each its own sentence with its fix.
 */
export function routineRefusal(r: PersistedRoutine, teammate: { name: string; scheduling: boolean } | undefined, facts: PlanFacts = { panels: [] }): string | null {
  if (r.name.trim() === '') return 'a routine needs a name'
  if (teammate === undefined) return `no teammate is called ${r.teammateId} — pick one in the Teammates pane`
  if (!teammate.scheduling) return `${teammate.name} may not be scheduled — allow scheduling on the teammate first`
  if (!Number.isFinite(r.everyMs) || r.everyMs < ROUTINE_MIN_MS) return `the shortest interval is ${ROUTINE_MIN_MS / 60_000} minute${ROUTINE_MIN_MS === 60_000 ? '' : 's'}`
  if (r.prompt.trim() === '') return 'a routine needs a prompt — what the chat is asked each time'
  if (r.plan !== undefined && r.plan.trim() !== '') {
    const inputs = parsePlanLine(r.plan)
    for (const input of inputs) {
      const built = buildPlan([input], { panels: facts.panels.length === 0 ? [{ id: input.args[0] ?? 'x', kind: 'chat' }] : facts.panels, presets: undefined, templates: undefined, worktrees: undefined, workspaces: undefined })
      if (built.kind === 'refused') {
        // An unknown verb is refused as itself; a destructive one is the point.
        return `the plan line was refused — ${built.reason}`
      }
      if (planIsDestructive(built.plan)) return `${input.verb} is a destructive verb — a routine runs unattended and cannot confirm it; take it out of the plan line`
    }
  }
  return null
}

/** When the tick that was due fell while the app was closed — or null when the schedule is not behind. */
export function missedAt(r: PersistedRoutine, now: number): number | null {
  if (r.paused || r.lastRun === undefined) return null
  const due = r.lastRun.at + r.everyMs
  return due < now ? due : null
}

/** `every 10m` — the watcher's own phrase. */
export function everyWord(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  if (h > 0) return m === 0 ? `every ${h}h` : `every ${h}h ${m}m`
  if (m > 0) return s === 0 ? `every ${m}m` : `every ${m}m ${s}s`
  return `every ${s}s`
}
