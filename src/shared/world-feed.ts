import type { AgentSessionEvent } from './agent-session'
import type { AgentKind } from './cost'
import { redactSecrets } from './redact'
import type { ContentBlock } from './transcript'
import type { AgentState } from './types'
import { statusAfter, type AgentEvent, type AgentEventPayloads, type AgentEventType, type AgentStatus, type ToolCallPayload } from './world-events'

/**
 * The REAL feed for the world view: what the agent runtime already says
 * (`AgentSessionEvent`, and a terminal agent's `agent:state`), folded into the
 * flat `AgentEvent` stream the store reads — the same contract the simulator
 * speaks, so the views cannot tell the two apart.
 *
 * Observation only. Nothing here is called BY an agent and nothing here calls
 * one: main hands each event it was already fanning out to `session()` and
 * carries on, so the order, the timing and the content of what the runtime does
 * are untouched. A thrown error here is the wiring's to catch
 * (`bootstrap/world-feed-wiring.ts`), never the runtime's to see.
 *
 * Plain functions over plain data, no electron and no timers, so `verify:world`
 * drives a whole session through it in plain node.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **Every word that reaches a card is scrubbed HERE, before it is clipped.**
 *     The card paints the feed's text as it comes, and the renderer has no second
 *     gate to put in front of it (the M412 note on `WorldCard`). Scrubbing after
 *     the clip would let a token cut in half by the clip slip past the pattern;
 *     before it, the pattern sees the whole token and the clip only ever shortens
 *     the placeholder. `gate.2` names this file as a `redactSecrets` caller.
 * (2) **`seq` never goes backwards, not even across a dispose.** The store drops
 *     any event at or below the last seq it holds for that id, so a tracker that
 *     was forgotten and re-made at 0 would be silent for ever. A disposed agent
 *     keeps its counter and loses everything else.
 * (3) **A `turn` event carries the WHOLE turn, again, each time a block is added**
 *     (the manager re-emits `{...last, blocks}` as the CLI streams one record per
 *     content block). The tracker remembers how many blocks of each turn it has
 *     already said and speaks only the new ones; without that every block would
 *     arrive once per later block, and a thought would be repeated on the card.
 * (4) **A `status` word comes from `block-start` as well as from `status`.** The
 *     session's own status is `streaming` for the whole turn, which cannot tell a
 *     thinking agent from one that is typing; the first block of each kind can.
 * (5) **A permission outranks everything until it is answered.** While one is
 *     pending a `streaming` status or a new block must NOT flip the agent back to
 *     working — the same rule the presence hub applies to the roster.
 */

export interface WorldFeedDeps {
  emit(events: AgentEvent[]): void
  now(): number
  /** Where every agent's `seq` starts. A rebuilt feed must start above the one it replaces (the store drops anything at or below its own). Default 0. */
  seqStart?: number
  /** What the agent is called on its card: a chat's folder, a terminal agent's CLI. `hint` is the CLI's own name, for a terminal. */
  label(agentId: string, hint?: string): string
}

export interface WorldFeed {
  /** One event from the agent runtime's fan-out. */
  session(event: AgentSessionEvent): void
  /** One `agent:state` from the PTY manager; `agent` is the spawn's CLI (undefined for a plain shell, which is not an agent). */
  terminal(update: { panelId: string; state: AgentState }, agent: AgentKind | undefined): void
  /** Says every known agent's status again, so a view that just (re)loaded is not empty. */
  resend(): void
}

type Body = { [T in AgentEventType]: { type: T; payload: AgentEventPayloads[T] } }[AgentEventType]

interface OpenCall {
  tool: string
  summary: string
  startedAt: number
}

interface Tracked {
  seq: number
  /** The last status this tracker published (an `error` event counts), or null before the first. */
  status: AgentStatus | null
  pending: Set<string>
  /** Turn id → how many of its blocks have been spoken. */
  turns: Map<string, number>
  /** Tool-use id → the call, until its result arrives. */
  calls: Map<string, OpenCall>
}

/** What the card has room for. Wider than a card shows; the card clamps by CSS. */
export const WORLD_TEXT_MAX = 280
export const WORLD_SUMMARY_MAX = 110
export const WORLD_DETAIL_MAX = 120
/** Turns and open calls a tracker remembers; the oldest go first. */
const REMEMBER = 64
/** What is scrubbed is at most this long, so a pasted file in a result is not run through every pattern. */
const SCRUB_WINDOW = 2000

/** Scrub, then collapse whitespace, then clip — in that order (see (1)). Empty in, empty out. */
export function worldText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  const scrubbed = redactSecrets(raw.slice(0, SCRUB_WINDOW)).text.replace(/\s+/g, ' ').trim()
  return scrubbed.length > max ? `${scrubbed.slice(0, max - 1).trimEnd()}…` : scrubbed
}

/** The last two segments of a path — enough to know the file, short enough to read. */
function shortPath(path: string): string {
  const parts = path.split('/').filter((p) => p !== '')
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`
}

const FILE_TOOLS: ReadonlySet<string> = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function field(input: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = input[key]
    if (typeof v === 'string' && v !== '') return v
  }
  return ''
}

/**
 * One line a person can read at a glance: `Edit …/auth/session.ts`, not the
 * arguments. A tool this does not know is its bare name — never a guess at its
 * input, which could be anything.
 */
export function toolSummary(name: string, input: Record<string, unknown>): string {
  let line = name
  if (FILE_TOOLS.has(name)) {
    const path = field(input, 'file_path', 'notebook_path', 'path')
    if (path !== '') line = `${name} ${shortPath(path)}`
  } else if (name === 'Bash') {
    const command = field(input, 'command')
    if (command !== '') line = command
  } else if (name === 'Grep' || name === 'WebSearch') {
    const query = field(input, 'pattern', 'query')
    if (query !== '') line = `Search "${query}"`
  } else if (name === 'Glob') {
    const pattern = field(input, 'pattern')
    if (pattern !== '') line = `Find ${pattern}`
  } else if (name === 'WebFetch') {
    const url = field(input, 'url')
    if (url !== '') line = `Fetch ${url.replace(/^https?:\/\//, '').split(/[/?#]/)[0] ?? url}`
  } else if (name === 'Task' || name === 'Agent') {
    const description = field(input, 'description')
    if (description !== '') line = description
  }
  return worldText(line, WORLD_SUMMARY_MAX) || name
}

/**
 * The status a terminal agent's detector state is. `starting` is `idle`: a CLI
 * that is still booting is not doing anything yet, and the room is for work
 * that is happening (`isLiveStatus`), so it takes a desk when it first works.
 */
const TERMINAL_STATUS: Readonly<Record<AgentState, AgentStatus>> = {
  starting: 'idle', busy: 'working', idle: 'idle', 'wants-you': 'waiting_approval', exited: 'idle'
}

export function createWorldFeed(deps: WorldFeedDeps): WorldFeed {
  const tracked = new Map<string, Tracked>()

  const track = (id: string): Tracked => {
    let t = tracked.get(id)
    if (!t) {
      t = { seq: deps.seqStart ?? 0, status: null, pending: new Set(), turns: new Map(), calls: new Map() }
      tracked.set(id, t)
    }
    return t
  }

  const push = (id: string, t: Tracked, body: Body, hint?: string): void => {
    const event = { agentId: id, name: deps.label(id, hint), seq: t.seq++, ts: deps.now(), ...body } as AgentEvent
    t.status = statusAfter(event) ?? t.status
    deps.emit([event])
  }

  const setStatus = (id: string, t: Tracked, next: AgentStatus, hint?: string): void => {
    if (t.status === next) return
    push(id, t, { type: 'status', payload: next }, hint)
  }

  const remember = <V>(map: Map<string, V>, key: string, value: V): void => {
    map.set(key, value)
    if (map.size > REMEMBER) map.delete(map.keys().next().value as string)
  }

  const speak = (id: string, t: Tracked, role: 'user' | 'assistant', block: ContentBlock): void => {
    if (role === 'assistant') {
      if (block.type === 'thinking') {
        const text = worldText(block.text, WORLD_TEXT_MAX)
        if (text !== '') push(id, t, { type: 'thought', payload: { text } })
      } else if (block.type === 'text') {
        const text = worldText(block.text, WORLD_TEXT_MAX)
        if (text !== '') push(id, t, { type: 'message', payload: { text } })
      } else if (block.type === 'tool_use') {
        const summary = toolSummary(block.name, block.input)
        remember(t.calls, block.id, { tool: block.name, summary, startedAt: deps.now() })
        push(id, t, { type: 'tool_call', payload: { tool: block.name, summary, status: 'started', callId: block.id } })
      }
      return
    }
    if (block.type !== 'tool_result') return
    const call = t.calls.get(block.toolUseId)
    // A result for a call from before the app looked has no summary to show.
    if (!call) return
    t.calls.delete(block.toolUseId)
    const payload: ToolCallPayload = {
      tool: call.tool,
      summary: call.summary,
      status: block.isError ? 'failed' : 'done',
      durationMs: Math.max(0, deps.now() - call.startedAt),
      callId: block.toolUseId
    }
    // Only a FAILURE says why: a success's content is a file, a listing, a
    // diff — everything the card should not be carrying.
    if (block.isError) {
      const detail = worldText(String(block.content ?? '').split('\n').find((line) => line.trim() !== ''), WORLD_DETAIL_MAX)
      if (detail !== '') payload.detail = detail
    }
    push(id, t, { type: 'tool_result', payload })
  }

  return {
    session(event) {
      const id = event.id
      switch (event.type) {
        case 'status': {
          const t = track(id)
          if (event.status === 'disposed') {
            setStatus(id, t, 'idle')
            t.pending.clear()
            t.turns.clear()
            t.calls.clear()
            return
          }
          if (event.status === 'exited') {
            t.pending.clear()
            t.calls.clear()
            if (typeof event.exitCode === 'number' && event.exitCode !== 0) {
              push(id, t, { type: 'error', payload: { message: `The agent process exited (code ${event.exitCode}).` } })
            } else setStatus(id, t, 'idle')
            return
          }
          if (t.pending.size > 0) return
          setStatus(id, t, event.status === 'starting' || event.status === 'streaming' ? 'working' : 'idle')
          return
        }
        case 'block-start': {
          const t = track(id)
          if (t.pending.size > 0) return
          setStatus(id, t, event.block.type === 'thinking' ? 'thinking' : 'working')
          return
        }
        case 'turn': {
          const t = track(id)
          const { turn } = event
          const done = t.turns.get(turn.id) ?? 0
          if (turn.blocks.length <= done) return
          remember(t.turns, turn.id, turn.blocks.length)
          for (const block of turn.blocks.slice(done)) speak(id, t, turn.role, block)
          return
        }
        case 'permission-request': {
          const t = track(id)
          t.pending.add(event.requestId)
          setStatus(id, t, 'waiting_approval')
          const text = worldText(`Needs your approval: ${event.toolName}`, WORLD_TEXT_MAX)
          push(id, t, { type: 'message', payload: { text } })
          return
        }
        case 'permission-answered':
        case 'permission-dropped':
        case 'permission-auto-allowed': {
          const t = tracked.get(id)
          if (!t) return
          t.pending.delete(event.requestId)
          if (t.pending.size === 0 && t.status === 'waiting_approval') setStatus(id, t, 'working')
          return
        }
        case 'result': {
          // An interrupt is a person's choice, not a failure.
          if (event.ok || event.interrupted) return
          const t = track(id)
          push(id, t, { type: 'error', payload: { message: worldText(event.error ?? event.subtype, WORLD_TEXT_MAX) || 'The turn failed.' } })
          return
        }
        default:
          return
      }
    },

    terminal(update, agent) {
      if (agent === undefined) return
      const t = track(update.panelId)
      setStatus(update.panelId, t, TERMINAL_STATUS[update.state], agent)
    },

    resend() {
      for (const [id, t] of tracked) {
        if (t.status !== null) push(id, t, { type: 'status', payload: t.status })
      }
    }
  }
}
