import type { AgentEvent, AgentEventPayloads, AgentEventType, AgentStatus, ToolCallPayload } from '@shared/world-events'

/**
 * SIMULATE_AGENTS=true: a scripted multi-agent session on a loop, so the world
 * view can be built against a realistic stream before real agents feed it.
 *
 * Dev instrumentation only. It spawns nothing, reads nothing and writes
 * nothing; every summary below is invented text. It exists in MAIN rather than
 * the renderer so the renderer's store is fed through the same bridge a real
 * source will use — a renderer-side fake would let the views grow a second way
 * in that the real feed never exercises.
 *
 * Every clock and timer is injected, so `verify:world` runs a whole loop in
 * fake time.
 */

type Body = { [T in AgentEventType]: { type: T; payload: AgentEventPayloads[T] } }[AgentEventType]

/**
 * One scripted beat: wait `after` ms (jittered), then emit. A tool `call` opens
 * a call under `key`; the matching `result` closes it, and its durationMs is the
 * time that really elapsed — so the numbers a view shows agree with the pacing.
 */
type Step =
  | { after: number; body: Body }
  | { after: number; call: string; tool: string; summary: string; detail?: string }
  | { after: number; result: string; failed?: boolean; detail?: string }

export interface SimAgent {
  agentId: string
  name: string
  script: readonly Step[]
}

const status = (after: number, s: AgentStatus): Step => ({ after, body: { type: 'status', payload: s } })
const thought = (after: number, text: string): Step => ({ after, body: { type: 'thought', payload: { text } } })
const message = (after: number, text: string): Step => ({ after, body: { type: 'message', payload: { text } } })
const error = (after: number, text: string): Step => ({ after, body: { type: 'error', payload: { message: text } } })
const call = (after: number, key: string, tool: string, summary: string, detail?: string): Step => ({ after, call: key, tool, summary, detail })
const result = (after: number, key: string, opts: { failed?: boolean; detail?: string } = {}): Step => ({ after, result: key, ...opts })

export const SIM_AGENTS: readonly SimAgent[] = [
  {
    agentId: 'sim-coder',
    name: 'Coder',
    script: [
      status(400, 'thinking'),
      thought(900, 'The session refresh lives in auth/session.ts — read it before touching the middleware.'),
      status(600, 'working'),
      call(300, 'read', 'Read', 'Read src/auth/session.ts'),
      result(500, 'read'),
      call(300, 'grep', 'Grep', 'Search "refreshToken(" across src/'),
      result(700, 'grep', { detail: '6 matches in 3 files' }),
      thought(1200, 'Expiry is compared in seconds on one side and ms on the other. Normalise to ms at the boundary.'),
      call(400, 'edit1', 'Edit', 'Edit src/auth/session.ts', '+14 −6: expiresAt kept in ms'),
      result(1600, 'edit1'),
      call(300, 'edit2', 'Edit', 'Edit src/middleware/require-auth.ts', '+3 −3'),
      result(1100, 'edit2'),
      message(500, 'Normalised token expiry to milliseconds in session.ts and the middleware.'),
      status(400, 'waiting_approval'),
      message(200, 'Run the auth migration against the dev database?'),
      status(4000, 'working'),
      call(300, 'mig', 'Bash', 'npm run db:migrate -- --env dev'),
      result(2600, 'mig', { detail: '1 migration applied' }),
      status(500, 'idle'),
      status(5000, 'thinking')
    ]
  },
  {
    agentId: 'sim-tester',
    name: 'Tester',
    script: [
      status(800, 'working'),
      call(400, 'unit', 'Bash', 'npm test -- auth', 'vitest run src/auth'),
      result(3800, 'unit', { failed: true, detail: '41 passed, 1 failed: session › refreshes before expiry' }),
      status(300, 'thinking'),
      thought(1400, 'The failing case mocks Date.now in seconds — that is the bug the coder is fixing, not a flaky test.'),
      status(500, 'working'),
      call(300, 'read', 'Read', 'Read src/auth/session.test.ts'),
      result(400, 'read'),
      call(2500, 'rerun', 'Bash', 'npm test -- auth', 'vitest run src/auth'),
      result(3200, 'rerun', { detail: '42 passed' }),
      call(400, 'e2e', 'Bash', 'npm run test:e2e -- login.spec.ts'),
      result(5200, 'e2e', { detail: '7 passed (12.4s)' }),
      message(300, 'Auth suite green: 42 unit, 7 e2e.'),
      status(400, 'idle'),
      status(6000, 'working')
    ]
  },
  {
    agentId: 'sim-researcher',
    name: 'Researcher',
    script: [
      status(600, 'thinking'),
      thought(1100, 'Need the current guidance on refresh-token rotation before we pick a lifetime.'),
      status(400, 'working'),
      call(300, 'search', 'WebSearch', 'Search "OAuth refresh token rotation best practice"'),
      result(1900, 'search', { detail: '10 results' }),
      call(500, 'rfc', 'WebFetch', 'Fetch datatracker.ietf.org — OAuth 2.0 Security BCP §4.14'),
      result(2300, 'rfc'),
      call(400, 'blog', 'WebFetch', 'Fetch auth0.com — Refresh Token Rotation'),
      result(2800, 'blog', { failed: true, detail: '429 Too Many Requests' }),
      // A failed TOOL is not an agent error — the tester's red run above stays
      // `working`. This one is: the agent stops on it before choosing to go on.
      error(200, 'Rate-limited by auth0.com (429); retry budget spent.'),
      status(2200, 'thinking'),
      thought(600, 'The BCP covers rotation anyway; drop that source.'),
      status(300, 'working'),
      call(400, 'owasp', 'WebFetch', 'Fetch cheatsheetseries.owasp.org — Session Management'),
      result(2100, 'owasp'),
      message(800, 'Rotate on every use, detect reuse, 14-day absolute lifetime. Sources: RFC 9700 §4.14, OWASP.'),
      status(400, 'idle'),
      status(7000, 'thinking')
    ]
  },
  {
    agentId: 'sim-idle',
    name: 'Reviewer',
    script: [
      status(1000, 'idle'),
      message(9000, 'Waiting for a diff to review.'),
      status(12000, 'idle')
    ]
  }
]

export interface WorldSimDeps {
  emit(events: AgentEvent[]): void
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  /** In [0, 1). Jitter only — the script's ORDER never varies. */
  random(): number
}

export interface WorldSim {
  stop(): void
}

/** ±20% on every wait, so four agents on fixed scripts do not tick in lockstep. */
const JITTER = 0.2

export function startWorldSimulation(deps: WorldSimDeps, agents: readonly SimAgent[] = SIM_AGENTS): WorldSim {
  const handles = new Set<unknown>()
  let stopped = false

  for (const agent of agents) {
    let seq = 0
    let index = 0
    let loop = 0
    const open = new Map<string, { callId: string; tool: string; summary: string; detail?: string; startedAt: number }>()

    const emit = (body: Body): void => {
      // The spread loses the pairing between `type` and `payload`; Body
      // guarantees it, so the cast restores what the union already proved.
      deps.emit([{ agentId: agent.agentId, name: agent.name, seq: seq++, ts: deps.now(), ...body } as AgentEvent])
    }

    const fire = (step: Step): void => {
      if ('body' in step) return emit(step.body)
      if ('call' in step) {
        const callId = `${agent.agentId}:${loop}:${step.call}`
        open.set(step.call, { callId, tool: step.tool, summary: step.summary, detail: step.detail, startedAt: deps.now() })
        const payload: ToolCallPayload = { tool: step.tool, summary: step.summary, status: 'started', callId }
        if (step.detail !== undefined) payload.detail = step.detail
        return emit({ type: 'tool_call', payload })
      }
      const started = open.get(step.result)
      // A result with no open call is a script bug; skipping it keeps the
      // stream honest rather than emitting a result for nothing.
      if (!started) return
      open.delete(step.result)
      const payload: ToolCallPayload = {
        tool: started.tool,
        summary: started.summary,
        status: step.failed ? 'failed' : 'done',
        durationMs: deps.now() - started.startedAt,
        callId: started.callId
      }
      const detail = step.detail ?? started.detail
      if (detail !== undefined) payload.detail = detail
      emit({ type: 'tool_result', payload })
    }

    const schedule = (): void => {
      if (stopped || agent.script.length === 0) return
      const step = agent.script[index]
      const wait = Math.max(0, Math.round(step.after * (1 - JITTER + 2 * JITTER * deps.random())))
      const handle = deps.setTimeout(() => {
        handles.delete(handle)
        if (stopped) return
        fire(step)
        index++
        if (index === agent.script.length) {
          index = 0
          loop++
        }
        schedule()
      }, wait)
      handles.add(handle)
    }
    schedule()
  }

  return {
    stop() {
      stopped = true
      for (const handle of handles) deps.clearTimeout(handle)
      handles.clear()
    }
  }
}
