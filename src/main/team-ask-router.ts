import { randomBytes } from 'node:crypto'
import { redactSecrets } from '../shared/redact'
import { docKey, localIdOf } from '../shared/canvas-doc'
import type { AskOutcome, CanvasOp, SharedAsk, Verdict } from '../shared/canvas-ops'
import type { readSharedAsks } from '../shared/canvas-doc'
import type { EventRow } from '../shared/run-ledger'
import type { PermissionAnswer } from '../shared/transcript'
import { PLAN_TOOL } from '../shared/transcript'
import { approvalsNeeded, askDecision, teamAskAction } from '../shared/team-asks'

/**
 * M376. THE OWNER'S SIDE OF THE TEAM QUEUE (M375 is the record). On the
 * machine that runs an agent, with `agents.teamAsks` on and the agent's
 * canvas shared, each permission request the CLI asks is ALSO written to the
 * workspace doc as a team ask. Main reads the answers, decides with
 * `askDecision`, and answers through `answerPermission` — the one door; a
 * teammate never writes to the agent's process.
 *
 * - The summary leaves this machine for a server, so it is scrubbed here and
 *   the count rides the ask (`redactSecrets`' named callers, deliberately).
 * - The owner answering on this machine is ONE person's answer: it is
 *   written to the doc in their name and counted with everyone else's. Past
 *   the spend line (two needed) the owner's allow alone does not decide it,
 *   and the request stays pending until a second person allows.
 * - What stays here and is never routed: a plan (it is read, not run), a
 *   question main asked itself (`tc-ext-*`: a credential write is the
 *   credential owner's), and any request a teammate could not read whole
 *   (`teamAskAction`).
 * - A request that ends any other way (the session exits, the CLI drops it,
 *   a grant answered it) closes its ask as `withdrawn`, so nobody answers a
 *   question that is no longer asked. An open ask of this machine's that no
 *   pending request backs (a relaunch) is withdrawn the first time it is seen.
 *
 * Plain node over injected doors: `verify:canvas-sync team.*` drives it
 * against a real canvas-sync and doc.
 */

type AskRead = ReturnType<typeof readSharedAsks>[number]
type AskOp = Extract<CanvasOp, { kind: 'ask-open' | 'ask-answer' | 'ask-close' }>

export interface TeamAskRouterDeps {
  enabled: () => boolean
  escalateAtUsd: () => number | undefined
  host: () => string
  userId: () => string | null
  /** canvas-sync's doors (M376). */
  workspaceOfPanel: (panelId: string) => string | null
  asks: (workspaceId: string) => AskRead[] | null
  writeAsk: (workspaceId: string, op: AskOp) => Verdict
  /** The agent's own spend so far (its meter), when known. */
  spentOf: (panelId: string) => number | undefined
  /** The manager's one door. False when the request is no longer pending. */
  answer: (panelId: string, requestId: string, answer: PermissionAnswer) => boolean
  /** A decision reached through the team, onto the record (ledger, then audit). */
  record?: (row: EventRow) => void
  now?: () => number
  mintId?: () => string
}

export interface TeamAskRouter {
  /** Every agent event, from agent-runtime's one fan-out. */
  agentEvent(event: { id: string; type: string; [k: string]: unknown }): void
  /** canvas-sync's `onAsks`: a peer answered, or the doc loaded. */
  asksChanged(workspaceId: string): void
  /**
   * The person at THIS machine answered a routed request. `'waiting'` when it
   * was one allow of two and the request stays pending; `'decided'` when it
   * decided the ask (the caller does NOT answer the process again — this
   * did); `'not-routed'` when the request has no ask and the caller answers
   * it as it always has.
   */
  localAnswer(panelId: string, requestId: string, answer: PermissionAnswer): 'waiting' | 'decided' | 'not-routed'
  /** Test and status: the asks this machine opened and still waits on. */
  open(): Array<{ askId: string; workspaceId: string; panelId: string; requestId: string }>
}

interface Routed { askId: string; workspaceId: string; panelId: string; requestId: string; tool: string; action: string; need: 1 | 2 }

const OUTCOME_OF = { allowed: true, denied: false } as const

export function createTeamAskRouter(deps: TeamAskRouterDeps): TeamAskRouter {
  const now = deps.now ?? Date.now
  const mint = deps.mintId ?? (() => `q${randomBytes(6).toString('hex')}`)
  const routed = new Map<string, Routed>()
  const keyOf = (panelId: string, requestId: string): string => `${panelId}\u0000${requestId}`

  const close = (r: Routed, outcome: AskOutcome): void => {
    routed.delete(keyOf(r.panelId, r.requestId))
    deps.writeAsk(r.workspaceId, { kind: 'ask-close', askId: r.askId, outcome })
  }

  const recordTeam = (r: Routed, allow: boolean, by: readonly string[]): void => {
    const who = by.length === 1 ? 'a teammate' : `${by.length} people`
    deps.record?.({
      kind: 'event', runId: `team-${r.askId}`, at: now(), event: 'permission', source: 'person', panelId: r.panelId,
      title: `${allow ? 'Allowed' : 'Denied'} ${r.tool} — ${r.action}, by ${who} on the team`,
      detail: `ask ${r.askId} · ${by.map((u) => `user ${u}`).join(', ')}`
    })
  }

  /**
   * Decide one routed ask from the doc's answers, if they decide it. `mine`
   * is the answer the person at THIS machine just gave: when they alone
   * decide it, the process hears their own words (a deny's message), not a
   * sentence of ours.
   */
  const decide = (r: Routed, read: AskRead, mine?: PermissionAnswer): void => {
    const key = keyOf(r.panelId, r.requestId)
    if (read.closed !== undefined) { routed.delete(key); return }
    const verdict = askDecision(r.need, read.answers)
    if (verdict === 'open') return
    const allow = OUTCOME_OF[verdict]
    const deciders = Object.entries(read.answers).filter(([, a]) => a === (allow ? 'allow' : 'deny')).map(([u]) => u)
    const me = deps.userId()
    const onlyMe = deciders.length > 0 && deciders.every((u) => u === me)
    // Untracked BEFORE the process is answered: the manager's own
    // `permission-answered` for this very answer must not read as "answered
    // by something else" and withdraw the ask this decision is closing.
    routed.delete(key)
    const answer: PermissionAnswer = onlyMe && mine !== undefined ? mine
      : allow ? { allow: true } : { allow: false, message: 'A teammate denied this on the shared canvas.' }
    const answered = deps.answer(r.panelId, r.requestId, answer)
    deps.writeAsk(r.workspaceId, { kind: 'ask-close', askId: r.askId, outcome: answered ? verdict : 'withdrawn' })
    // A decision only the owner made is already on the record through the
    // renderer's own permission row; a teammate's is recorded here.
    if (answered && !onlyMe) recordTeam(r, allow, deciders)
  }

  const open = (event: { id: string; requestId: string; toolName: string; input: Record<string, unknown> }): void => {
    if (!deps.enabled()) return
    const me = deps.userId()
    if (me === null) return
    if (event.toolName === PLAN_TOOL || event.requestId.startsWith('tc-ext-')) return
    const workspaceId = deps.workspaceOfPanel(event.id)
    if (workspaceId === null) return
    const what = teamAskAction(event.input)
    if ('local' in what) return
    const scrubbed = redactSecrets(what.action)
    const spent = deps.spentOf(event.id)
    const host = deps.host()
    const ask: SharedAsk = {
      id: docKey(host, mint()),
      panel: docKey(host, event.id),
      owner: me,
      tool: event.toolName.slice(0, 80),
      summary: scrubbed.text,
      scrubbed: scrubbed.count,
      at: now(),
      need: approvalsNeeded(spent, deps.escalateAtUsd()),
      ...(spent === undefined ? {} : { spentUsd: spent })
    }
    if (!deps.writeAsk(workspaceId, { kind: 'ask-open', ask }).ok) return
    routed.set(keyOf(event.id, event.requestId), { askId: ask.id, workspaceId, panelId: event.id, requestId: event.requestId, tool: ask.tool, action: ask.summary, need: ask.need })
  }

  const withdrawAllOf = (panelId: string): void => {
    for (const r of [...routed.values()]) if (r.panelId === panelId) close(r, 'withdrawn')
  }

  return {
    agentEvent(event) {
      if (event.type === 'permission-request') {
        const { requestId, toolName, input } = event as unknown as { requestId: string; toolName: string; input: Record<string, unknown> }
        if (typeof requestId === 'string' && typeof toolName === 'string') open({ id: event.id, requestId, toolName, input: input ?? {} })
        return
      }
      if (event.type === 'permission-answered' || event.type === 'permission-dropped') {
        // Answered by anything but this router (a grant, the owner's own
        // path for an unrouted answer) or gone: nobody should answer it now.
        const r = routed.get(keyOf(event.id, String(event['requestId'])))
        if (r !== undefined) close(r, 'withdrawn')
        return
      }
      if (event.type === 'status' && (event['status'] === 'exited' || event['status'] === 'disposed')) withdrawAllOf(event.id)
    },

    asksChanged(workspaceId) {
      const reads = deps.asks(workspaceId)
      if (reads === null) return
      const host = deps.host()
      const me = deps.userId()
      const byId = new Map(reads.map((q) => [q.ask.id, q]))
      for (const r of [...routed.values()]) {
        if (r.workspaceId !== workspaceId) continue
        const read = byId.get(r.askId)
        if (read !== undefined) decide(r, read)
      }
      // An open ask this machine minted that nothing here waits on — the app
      // restarted, and the request died with its process.
      const mine = new Set([...routed.values()].map((r) => r.askId))
      for (const q of reads) {
        if (q.closed !== undefined || q.ask.owner !== me || localIdOf(host, q.ask.id) === null || mine.has(q.ask.id)) continue
        deps.writeAsk(workspaceId, { kind: 'ask-close', askId: q.ask.id, outcome: 'withdrawn' })
      }
    },

    localAnswer(panelId, requestId, answer) {
      const r = routed.get(keyOf(panelId, requestId))
      const me = deps.userId()
      if (r === undefined || me === null) return 'not-routed'
      deps.writeAsk(r.workspaceId, { kind: 'ask-answer', askId: r.askId, by: me, answer: answer.allow ? 'allow' : 'deny' })
      const read = deps.asks(r.workspaceId)?.find((q) => q.ask.id === r.askId)
      if (read === undefined) {
        // The doc lost it (unbound mid-answer): answer as if never routed.
        routed.delete(keyOf(panelId, requestId))
        return 'not-routed'
      }
      decide(r, read, answer)
      return routed.has(keyOf(panelId, requestId)) ? 'waiting' : 'decided'
    },

    open() {
      return [...routed.values()].map(({ askId, workspaceId, panelId, requestId }) => ({ askId, workspaceId, panelId, requestId }))
    }
  }
}
