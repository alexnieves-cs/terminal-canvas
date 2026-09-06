/**
 * M104. A LINEUP is the shape of a multi-agent launch, previewed BEFORE
 * anything is minted: how many sessions open, each seat's role and kind,
 * which seats get a worktree lane, and how many agents will queue behind
 * `agents.maxConcurrent` — read live, so the user learns the launch would
 * exceed the ceiling before half of it queues (M82's ceiling story).
 *
 * Seats that are not agents: a plain shell with a command, or a browser at a
 * url (M103). Launched into worktrees, ONLY agent seats get a lane — a
 * browser or a shell in a worktree points at a directory the dev server was
 * never started in, and that failure is silent. `verify:palette lineup.1`.
 *
 * Pure: no DOM, no node.
 */
export type SeatKind = 'agent' | 'shell' | 'browser'

export interface Seat {
  role: string
  kind: SeatKind
  /** A shell seat's command; absent is the login shell. */
  command?: string
  /** A browser seat's page. */
  url?: string
  /** An agent seat's first message, inserted into its composer (never sent). */
  message?: string
}

export interface Lineup {
  id: 'solo' | 'pair' | 'workbench' | 'swarm'
  label: string
  hint: string
  seats: readonly Seat[]
}

export const LINEUPS: Readonly<Record<Lineup['id'], Lineup>> = {
  solo: { id: 'solo', label: 'Solo', hint: 'one agent in the directory', seats: [{ role: 'worker', kind: 'agent' }] },
  pair: { id: 'pair', label: 'Pair', hint: 'an agent and a shell beside it', seats: [{ role: 'worker', kind: 'agent' }, { role: 'shell', kind: 'shell' }] },
  workbench: {
    id: 'workbench', label: 'Workbench', hint: 'an agent, a shell, and a browser at localhost:3000',
    seats: [{ role: 'worker', kind: 'agent' }, { role: 'dev server', kind: 'shell' }, { role: 'preview', kind: 'browser', url: 'http://localhost:3000/' }]
  },
  swarm: {
    id: 'swarm', label: 'Swarm', hint: 'three agents in their own worktrees, and a shell',
    seats: [{ role: 'worker a', kind: 'agent' }, { role: 'worker b', kind: 'agent' }, { role: 'worker c', kind: 'agent' }, { role: 'shell', kind: 'shell' }]
  }
}

export const LINEUP_IDS: readonly Lineup['id'][] = ['solo', 'pair', 'workbench', 'swarm']

export interface PlannedSeat extends Seat {
  /** True when this seat gets its own worktree — agent seats only, and only when asked. */
  lane: boolean
  cwd: string
}

export interface LineupPlan {
  seats: PlannedSeat[]
  /** Every seat is a session (a browser is a guest process too). */
  sessions: number
  agents: number
  /** How many agent seats would queue behind the ceiling, given the live count. */
  queued: number
  /** The sentence the sheet shows, or '' when nothing queues. */
  ceilingLine: string
}

/**
 * M121. `queued` is the sends ALREADY WAITING behind the ceiling (the chat
 * store's queued count, summed): they take room before a new seat does,
 * so a preview that counted the live agents alone said one would queue
 * when two would. Absent is none — every pre-M121 caller.
 */
export function lineupPlan(lineup: Lineup, input: { cwd: string; worktrees: boolean; maxConcurrent: number; liveAgents: number; queued?: number }): LineupPlan {
  const seats: PlannedSeat[] = lineup.seats.map((s) => ({ ...s, lane: input.worktrees && s.kind === 'agent', cwd: input.cwd }))
  const agents = seats.filter((s) => s.kind === 'agent').length
  const waiting = Math.max(0, input.queued ?? 0)
  const room = input.maxConcurrent <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, input.maxConcurrent - input.liveAgents - waiting)
  const queued = Number.isFinite(room) ? Math.max(0, agents - room) : 0
  const ceilingLine = queued === 0 ? '' : `${queued} of these ${agents} agents will queue behind the ceiling of ${input.maxConcurrent} (${input.liveAgents} live now${waiting > 0 ? `, ${waiting} already waiting` : ''}) — raise agents.maxConcurrent, or launch fewer`
  return { seats, sessions: seats.length, agents, queued, ceilingLine }
}
