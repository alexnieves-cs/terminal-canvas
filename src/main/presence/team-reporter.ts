/**
 * The Team view's SERVER rows: this person's `presence` row and their
 * `activity_log` lines, written from the presence hub's own summary.
 *
 * Awareness already carries every live fact at cursor rate, but only to
 * people who share a room. The rows are how a teammate on another workspace
 * — or one who opens the Team view an hour later — learns who is around, what
 * they are on, and which workspace observer mode should attach to. So they
 * are written SLOWLY and on change, never at awareness rate:
 *
 *   - the presence row: when its facts change, and at least every
 *     REFRESH_MS so a stale `updated_at` means gone rather than quiet;
 *   - an activity line: when the agent status or the task changes, at most
 *     one per ACTIVITY_GAP_MS — a flapping agent is one line, not sixty.
 *
 * Text arrives already scrubbed (the hub's payloadOf passes redactSecrets).
 * No electron import; time and the timer are injected for verify:team.
 */
import { PRESENCE_HEARTBEAT_MS, PRESENCE_IDLE_MS } from '../../shared/presence'
import type { PresenceHub } from './presence-hub'
import type { TeamReport } from '../account-session'

const REFRESH_MS = 5 * 60_000
const ACTIVITY_GAP_MS = 60_000

export interface TeamReporterDeps {
  summary: PresenceHub['summary']
  report: (r: TeamReport) => Promise<{ ok: boolean; reason?: string }>
  now?: () => number
  setInterval?: (f: () => void, ms: number) => unknown
  clearInterval?: (h: unknown) => void
}

export interface TeamReporter {
  start(): void
  /** Marks this person offline on the way out; best effort, never awaited by the quit sequence. */
  stop(): Promise<void>
  /** One pass, for the heartbeat and for verify:team. */
  tick(): Promise<void>
}

const AGENT_WORD: Record<TeamReport['agentStatus'], string> = {
  none: '', idle: 'agents idle', working: 'agents working', 'needs-you': 'an agent needs them', error: 'an agent stopped'
}

export function createTeamReporter(deps: TeamReporterDeps): TeamReporter {
  const now = deps.now ?? Date.now
  const every = deps.setInterval ?? ((f, ms) => { const h = setInterval(f, ms); h.unref?.(); return h })
  const cancel = deps.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>))
  let beat: unknown = null
  let lastKey = ''
  let lastPostAt = 0
  let lastAgent: TeamReport['agentStatus'] | null = null
  let lastTask: string | null = null
  let lastActivityAt = -Infinity
  let busy = false
  let lastWorkspace: string | null = null

  const tick = async (): Promise<void> => {
    if (busy) return
    const s = deps.summary()
    if (s === null) return
    busy = true
    try {
      const t = now()
      const status = t - s.lastActivity >= PRESENCE_IDLE_MS ? 'away' as const : 'online' as const
      const key = [status, s.workspaceId, s.currentTask, s.agentStatus].join('\u0001')
      let activity: TeamReport['activity']
      if (t - lastActivityAt >= ACTIVITY_GAP_MS) {
        if (lastAgent !== null && s.agentStatus !== lastAgent && s.agentStatus !== 'none') {
          activity = { kind: 'agent', summary: s.statusLine || AGENT_WORD[s.agentStatus] }
        } else if (lastTask !== null && s.currentTask !== lastTask && s.currentTask !== '') {
          activity = { kind: 'task', summary: `on ${s.currentTask}` }
        }
      }
      if (key === lastKey && activity === undefined && t - lastPostAt < REFRESH_MS) return
      const r = await deps.report({ status, workspaceId: s.workspaceId, currentTask: s.currentTask, agentStatus: s.agentStatus, ...(activity === undefined ? {} : { activity }) })
      if (!r.ok) return
      lastKey = key
      lastPostAt = t
      lastWorkspace = s.workspaceId
      // The baselines advance only on a write that landed, so a failed post
      // is retried with its activity line rather than silently losing it.
      if (activity !== undefined) lastActivityAt = t
      if (activity?.kind === 'agent' || lastAgent === null) lastAgent = s.agentStatus
      if (activity?.kind === 'task' || lastTask === null) lastTask = s.currentTask
    } finally {
      busy = false
    }
  }

  return {
    tick,
    start() {
      if (beat !== null) return
      void tick().catch(() => {})
      beat = every(() => { void tick().catch(() => {}) }, PRESENCE_HEARTBEAT_MS)
    },
    async stop() {
      if (beat !== null) { cancel(beat); beat = null }
      if (lastPostAt === 0) return
      await deps.report({ status: 'offline', workspaceId: lastWorkspace, currentTask: '', agentStatus: 'none' }).catch(() => ({ ok: false }))
    }
  }
}
