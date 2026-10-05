import { agentWord } from '@renderer/panels/panel-state'
import { BACKENDS, DEFAULT_BACKEND, type AgentBackend } from '@shared/agent-backends'
import { contextUsedPct, holdWords, type CapHold, type NodeMeter } from '@shared/agent-session'
import type { AgentRecord, AgentStatus } from '@shared/world-events'
import type { WorldAgentFacts } from './world-context-store'
import { cardBadge, isLiveStatus, type Badge } from './world-scene'

/**
 * The work's own facts in the room (M428), as rules with no React and no
 * three.js in them, so `verify:world` runs every one in plain node: what the
 * publisher keeps of an agent's meter, model, branch, teammate and queue
 * (`agentFacts`), how the card says them (`factParts`), how a cap's hold leads
 * the card (`holdLead`) and paints its dot (`badgeFor`), and why a held agent
 * keeps its desk (`inRoom`).
 *
 * It imports the app's SHARED vocabulary and nothing of the canvas's own
 * (`verify:world world.facts.door.1`): the hold is `holdWords` — the decision
 * queue's sentence — and the context figure is `contextUsedPct`, the Work tab's
 * Window rule, so the room says a hold and a burn-down the way the rest of the
 * app does. Money is `$x.xx`, the idiom every surface writes inline.
 *
 * The facts are the INSPECTOR layer (configuration, provenance, outcomes): the
 * full card up close and the picked robot's card. A hold is the exception — a
 * blocker, so CONTEXTUAL: it takes the card's lead and the mid-distance chip.
 * Nothing here reaches the pill (rest): see `factParts`.
 */

/** What the publisher reads off a chat's snapshot and a panel's record. Every field may be absent. */
export interface FactsInput {
  model?: string
  backend?: AgentBackend
  meter?: NodeMeter
  queued?: number
  branch?: string
  owner?: string
}

const cents = (usd: number): number => Math.round(usd * 100) / 100
const thousands = (tokens: number): number => Math.round(tokens / 1000)
const said = (s: string | undefined): string | undefined => {
  const t = s?.trim()
  return t === undefined || t === '' ? undefined : t
}

/**
 * The facts the card can say, at the precision it says them, or null when
 * nothing knows anything. Rounded HERE, not at the card, so the context
 * store's by-value dedupe sees a change only when the card would: a meter
 * that ticks a tenth of a cent re-renders nobody.
 *
 * What is dropped, on purpose:
 * - a spend that rounds to $0.00 — "not reported yet" is never "$0.00", and a
 *   priced $0.004 is the same nothing at the card's precision;
 * - the default backend — every claude agent saying "claude" is a zero-value
 *   statement (`carryBackend`'s own rule: the default stays absent);
 * - a context percentage without a measured window — a guessed window is the
 *   confident wrong answer (M380). With a context CAP and no window, the
 *   tokens against the cap are said instead, because that is the figure the
 *   cap will hold on;
 * - an empty queue, a blank model, branch or teammate name.
 */
export function agentFacts(input: FactsInput): WorldAgentFacts | null {
  const out: WorldAgentFacts = {}
  const model = said(input.model)
  if (model !== undefined) out.model = model
  if (input.backend !== undefined && input.backend !== DEFAULT_BACKEND) out.backend = BACKENDS[input.backend].label
  const m = input.meter
  if (m?.spentUsd !== undefined && cents(m.spentUsd) > 0) out.spentUsd = cents(m.spentUsd)
  if (m?.caps !== undefined && m.caps.usd > 0) out.capUsd = cents(m.caps.usd)
  if (m?.context !== undefined && m.window !== undefined && m.window > 0) out.contextPct = contextUsedPct(m.context, m.window)
  else if (m?.context !== undefined && m.caps !== undefined && m.caps.context > 0) {
    out.contextK = thousands(m.context)
    out.capContextK = thousands(m.caps.context)
  }
  if (m?.held !== undefined) out.held = { ...m.held }
  const branch = said(input.branch)
  if (branch !== undefined) out.branch = branch
  const owner = said(input.owner)
  if (owner !== undefined) out.owner = owner
  if (input.queued !== undefined && input.queued > 0) out.queued = input.queued
  return Object.keys(out).length === 0 ? null : out
}

export type FactKey = 'model' | 'backend' | 'spend' | 'context' | 'branch' | 'owner' | 'queued'

export interface FactPart {
  key: FactKey
  text: string
}

/**
 * The card's fact line, in reading order: what it is (model · backend), what
 * it has cost and how full it is (spend · context), where and as whom it works
 * (branch · teammate), and what waits on it (queued). The hold is NOT a part:
 * it is the card's lead (`holdLead`), and saying it twice would bury the rest.
 *
 * `name` is the agent's own name on the pill: a teammate whose name the agent
 * already goes by ("Reviewer · api") is not said again.
 *
 * None of these belongs on the PILL. The pill is the rest layer — a name and
 * one meaningful state — read from across the room; a branch or a queue
 * length is not a state (it changes nothing about whether a person should walk
 * over), and a hold, the one fact here that IS, already turns the dot amber
 * (`badgeFor`).
 */
export function factParts(facts: WorldAgentFacts | undefined, name = ''): FactPart[] {
  if (facts === undefined) return []
  const parts: FactPart[] = []
  if (facts.model !== undefined) parts.push({ key: 'model', text: facts.model })
  if (facts.backend !== undefined) parts.push({ key: 'backend', text: facts.backend })
  if (facts.spentUsd !== undefined) {
    parts.push({ key: 'spend', text: facts.capUsd !== undefined ? `$${facts.spentUsd.toFixed(2)} of $${facts.capUsd.toFixed(2)}` : `$${facts.spentUsd.toFixed(2)}` })
  }
  if (facts.contextPct !== undefined) parts.push({ key: 'context', text: `${facts.contextPct}% context` })
  else if (facts.contextK !== undefined && facts.capContextK !== undefined) parts.push({ key: 'context', text: `${facts.contextK}k of ${facts.capContextK}k context` })
  if (facts.branch !== undefined) parts.push({ key: 'branch', text: `on ${facts.branch}` })
  if (facts.owner !== undefined && !name.toLowerCase().includes(facts.owner.toLowerCase())) parts.push({ key: 'owner', text: `as ${facts.owner}` })
  if (facts.queued !== undefined) parts.push({ key: 'queued', text: `${facts.queued} queued` })
  return parts
}

/** The parts as one line — the card's aria text and `verify:world`'s reading of it. */
export function factLine(facts: WorldAgentFacts | undefined, name = ''): string {
  return factParts(facts, name).map((p) => p.text).join(' · ')
}

/**
 * A hold as the card's LEAD: the decision queue's own sentence (`holdWords`,
 * which is written to follow the agent's name — "api is held at its $2.00
 * spend cap ($2.10 reported)"), standing on its own under the name the pill
 * already says: "Held at its $2.00 spend cap ($2.10 reported)". The words are
 * holdWords' — only the leading "is " goes — so a change of wording there is a
 * change here.
 */
export function holdLead(hold: CapHold): string {
  const words = holdWords(hold)
  return words.startsWith('is ') ? `${words.charAt(3).toUpperCase()}${words.slice(4)}` : words
}

/**
 * The card's badge with a hold folded in. A held agent is a needs-you — main's
 * tracker says `wants-you` for it and the decision queue lists it — but its
 * feed status is idle (its turn ended; main serves it nothing more), so
 * `cardBadge` alone paints it grey. The badge takes the needs-you hue and word
 * the rest of the app uses (`agentWord`), which also keeps its card standing
 * at any distance, as a request's does.
 */
export function badgeFor(record: Pick<AgentRecord, 'status' | 'events' | 'lastTs'>, now: number, held: boolean): Badge {
  return held ? { kind: 'wants-you', word: agentWord('wants-you').word } : cardBadge(record, now)
}

/**
 * Whether an agent has a desk in the room. The room is for work happening now
 * — working, thinking, or waiting on a person (`isLiveStatus`) — and a hold IS
 * waiting on a person, but the feed calls a held agent idle, so without this
 * a hold would leave the room the moment it began and its lead would never be
 * seen. Not in the past room: the hold is a present-day fact, and the past
 * room shows who was at work then, by the feed alone.
 */
export function inRoom(status: AgentStatus, held: boolean, past: boolean): boolean {
  return isLiveStatus(status) || (held && !past)
}
