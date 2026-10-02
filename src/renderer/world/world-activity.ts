import type { AgentEvent, AgentRecord, AgentStatus } from '@shared/world-events'
import { QUIET_MS, TYPING_STALE_MS } from './world-scene'

/**
 * What KIND of work an agent is doing right now (M421), read off its event
 * ring and nothing else, so the robot's motion and the pill's glyph are a
 * function of the same store everything else in the room reads.
 *
 * The status says whether an agent is busy; the open tool call says what it is
 * busy WITH. A person glancing at the room wants the second: "three agents
 * working" is the rail's line, "one reading, one editing, one waiting on a test
 * run" is the reason to have a room at all.
 *
 * Plain functions, no three.js and no React, so `verify:world` runs every rule.
 * No state word is spelled here (`verify:rail state.2`): the words below are
 * the room's own verbs, not panel states.
 */

export type Activity =
  | 'read'      // Read, a notebook read
  | 'search'    // Grep, Glob, LS
  | 'edit'      // Edit, Write, MultiEdit, NotebookEdit
  | 'test'      // a shell command that runs a test or verify suite
  | 'shell'     // any other shell command
  | 'web'       // WebSearch, WebFetch
  | 'delegate'  // Task / Agent: a sub-agent is out on its behalf
  | 'think'     // thinking, or working between calls
  | 'talk'      // just said something
  | 'wait'      // waiting on a person
  | 'stuck'     // stopped on an error
  | 'quiet'     // live, but nothing for QUIET_MS
  | 'rest'      // idle

const READS: ReadonlySet<string> = new Set(['Read', 'NotebookRead'])
const SEARCHES: ReadonlySet<string> = new Set(['Grep', 'Glob', 'LS'])
const EDITS: ReadonlySet<string> = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const WEB: ReadonlySet<string> = new Set(['WebSearch', 'WebFetch'])
const DELEGATES: ReadonlySet<string> = new Set(['Task', 'Agent'])
const SHELLS: ReadonlySet<string> = new Set(['Bash', 'BashOutput', 'Shell', 'shell', 'exec_command'])

/**
 * A shell line that runs tests. Word-bounded so `contest.sh` is not a test, and
 * broad on purpose — every runner this repo's agents meet (`npm test`, `npm run
 * verify:*`, vitest, jest, pytest, `go test`, `cargo test`, playwright, e2e).
 */
const TEST_LINE = /(?:^|[\s/:;&|(])(?:test|tests|verify(?::[\w-]+)?|vitest|jest|pytest|mocha|playwright|spec|e2e|test:[\w-]+|go test|cargo test|rspec)(?=$|[\s:;&|)\-.])/i

export function toolActivity(tool: string, summary: string): Activity {
  if (READS.has(tool)) return 'read'
  if (SEARCHES.has(tool)) return 'search'
  if (EDITS.has(tool)) return 'edit'
  if (WEB.has(tool)) return 'web'
  if (DELEGATES.has(tool)) return 'delegate'
  if (SHELLS.has(tool)) return TEST_LINE.test(summary) ? 'test' : 'shell'
  // A tool this does not know (an MCP tool, a future one) is work, not a guess.
  return 'shell'
}

export interface OpenCall {
  key: string
  tool: string
  summary: string
  path?: string
  at: number
}

/**
 * The calls opened and not yet answered, oldest first — `isTyping`'s pairing
 * rule (by callId, else the latest open call), kept as the calls themselves so
 * the activity, the sub-agents and the file lines read one answer. A call older
 * than `TYPING_STALE_MS` is dropped: a source that never sends a result would
 * otherwise hold it open for ever.
 */
export function openCalls(events: readonly AgentEvent[], now: number): OpenCall[] {
  const open = new Map<string, OpenCall>()
  for (const event of events) {
    if (event.type === 'tool_call' && event.payload.status === 'started') {
      const key = event.payload.callId ?? `anon:${event.seq}`
      open.set(key, { key, tool: event.payload.tool, summary: event.payload.summary, path: event.payload.path, at: event.ts })
    } else if (event.type === 'tool_result') {
      const id = event.payload.callId
      if (id !== undefined) open.delete(id)
      else {
        const last = [...open.keys()].pop()
        if (last !== undefined) open.delete(last)
      }
    }
  }
  // A delegated sub-task can outlive the typing cap by far; it is a sub-agent's
  // whole run, and its result is the one event that ends it.
  return [...open.values()].filter((c) => DELEGATES.has(c.tool) || now - c.at < TYPING_STALE_MS)
}

/** How long a just-sent message keeps the robot "talking". */
export const TALK_MS = 4000

const BY_STATUS: Readonly<Record<AgentStatus, Activity | null>> = {
  working: null, thinking: 'think', waiting_approval: 'wait', error: 'stuck', idle: 'rest'
}

/**
 * The one activity a robot shows. A pending request and an error outrank any
 * open call (the person's part comes first); thinking is thinking; while
 * working, the NEWEST open call that is not a delegation says what the hands
 * are on (a sub-agent working for it is shown by the sub-agent), then a
 * delegation, then a message just sent, then quiet after `QUIET_MS` of nothing.
 */
export function activityOf(record: Pick<AgentRecord, 'status' | 'events' | 'lastTs'>, now: number): Activity {
  const fixed = BY_STATUS[record.status]
  if (fixed !== null) return fixed
  const calls = openCalls(record.events, now)
  const hands = [...calls].reverse().find((c) => !DELEGATES.has(c.tool))
  if (hands !== undefined) return toolActivity(hands.tool, hands.summary)
  if (calls.length > 0) return 'delegate'
  const last = record.events[record.events.length - 1]
  if (last !== undefined && last.type === 'message' && now - last.ts < TALK_MS) return 'talk'
  if (now - record.lastTs > QUIET_MS) return 'quiet'
  return 'think'
}

/**
 * The verb the pill and the card say for an activity — a room verb, never a
 * panel state word. Null where the badge already says it (waiting, stopped,
 * idle) so the pill does not repeat the badge.
 */
export const ACTIVITY_VERB: Readonly<Record<Activity, string | null>> = {
  read: 'Reading', search: 'Searching', edit: 'Editing', test: 'Testing', shell: 'Running',
  web: 'Browsing', delegate: 'Delegating', think: 'Thinking', talk: 'Replying',
  wait: null, stuck: null, quiet: null, rest: null
}

/** The sub-agents an agent has out right now — its open delegations, oldest first. */
export function openDelegations(record: Pick<AgentRecord, 'events'>, now: number): OpenCall[] {
  return openCalls(record.events, now).filter((c) => DELEGATES.has(c.tool))
}

export function isDelegateTool(tool: string): boolean {
  return DELEGATES.has(tool)
}

export function isEditTool(tool: string): boolean {
  return EDITS.has(tool)
}
