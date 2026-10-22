/**
 * M532 (G2) — answer from the phone. claude-remote-approver and Omnara let a
 * person approve a waiting agent from a push; M489's alerts were one-way, so
 * a question asked at 2am waited for the morning. This adds two buttons to
 * the ntfy alert, Allow once and Deny, and reads the answer back.
 *
 * The boundary is the ntfy topic: anyone who knows its name can read the
 * alert, and so can press its buttons. Everything here keeps what such a
 * person could do as small as the feature allows:
 *
 * - **Off unless the person turns it on** (`remote.phoneAnswers`), on top of
 *   alerts being on. Turned off, every live code is dropped at the next look.
 * - **A button carries a code and nothing else.** The reply is `allow <code>`
 *   or `deny <code>`; any other text on the answers topic is ignored, so no
 *   words from the phone ever reach an agent.
 * - **Each code answers ONE request, ONCE, as "allow once".** Never a session
 *   grant: that is a choice made at the card, reading the request (M98). The
 *   code is deleted before the answer is sent, so a replay finds nothing.
 * - **Codes expire** after `CODE_TTL_MS`, and at most `MAX_LIVE` are live.
 * - **Never a plan, never a credential ask.** A plan is approved by reading it
 *   (M358), and the broker's `tc-ext-` asks are never answered remotely — the
 *   MCP door's rule (control-wiring.ts).
 * - **The request must still be pending, unchanged,** when the answer
 *   arrives: same id, same tool, same input. An ACP agent's request ids are
 *   small integers that restart with its process, so after a restart a stale
 *   code could otherwise name a new, different request (the critic's first
 *   finding). One answered at the Mac meanwhile is left alone.
 * - **A long topic.** With answers on, a topic shorter than `MIN_TOPIC` is
 *   refused: a guessable topic would be an approval channel.
 * - **A bounded look.** One poll at a time, a timeout, and a byte cap the
 *   caller's reader enforces while streaming (stores.ts).
 *
 * Pure over injected deps (clock, code source, GET, the pending list and the
 * answer), so `verify:borrow phone.*` runs every arm under plain node.
 */
import { PLAN_TOOL } from '../shared/transcript'
import { NTFY_TOPIC, validServer, type PhoneAlertSettings } from './phone-alerts'

/** One ntfy "http" action button: the phone POSTs `body` to `url` when pressed. */
export interface NtfyAction {
  action: 'http'
  label: string
  url: string
  method: 'POST'
  body: string
  clear: true
}

export interface PendingAsk { requestId: string; toolName: string; input?: unknown }

export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_LIVE = 20
/** A code is 24 lowercase hex characters (96 bits): `randomBytes(12).toString('hex')`. */
export const CODE = /^[0-9a-f]{24}$/
const REPLY = /^(allow|deny) ([0-9a-f]{24})$/
/** The answers topic is the alert topic plus a suffix, clipped so it stays inside ntfy's 64. */
const SUFFIX = '-answers'
/** A poll reply larger than this is cut: a busy or hostile topic cannot make the Mac read megabytes. */
export const POLL_MAX_CHARS = 64 * 1024
/** With answers on, a topic must be at least this long: a short one can be guessed, and pressed. */
export const MIN_TOPIC = 20
export const POLL_TIMEOUT_MS = 8000

export function answersTopic(topic: string): string {
  return `${topic.slice(0, 64 - SUFFIX.length)}${SUFFIX}`
}

/** `text()` must stop reading at `POLL_MAX_CHARS`; `signal` aborts a stalled server. */
export type Get = (url: string, init: { method: 'GET'; redirect: 'error'; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export type AnswerOutcome = 'answered' | 'waiting' | 'gone'

export interface PhoneAnswersDeps {
  settings: () => PhoneAlertSettings & { answers: boolean }
  now: () => number
  /** A fresh code; checked against `CODE`, so a bad source mints nothing. */
  code: () => string
  get: Get
  /** The panel's unanswered permission requests, oldest first. */
  pending: (panelId: string) => PendingAsk[]
  /** Answers through the person's own path; `allow` is always allow-once. */
  answer: (panelId: string, requestId: string, allow: boolean, toolName: string) => AnswerOutcome
  /** The decision record: who answered what, from where. */
  record?: (row: { panelId: string; requestId: string; toolName: string; allow: boolean; outcome: Exclude<AnswerOutcome, 'gone'> }) => void
  log?: (line: string) => void
}

export interface PhoneAnswers {
  /** The two buttons for this panel's oldest askable request, or none. */
  actionsFor(panelId: string): NtfyAction[]
  /** Read the answers topic once and apply what matches. Resolves with what was answered. */
  poll(): Promise<Array<{ panelId: string; requestId: string; allow: boolean; outcome: AnswerOutcome }>>
  /** Codes still live, for the checks and the interval (no poll while none). */
  live(): number
}

interface Live { panelId: string; requestId: string; toolName: string; input: string; expires: number }

/** A request's identity beyond its id: a restarted agent can reuse the id for something else. */
const inputKey = (input: unknown): string => { try { return JSON.stringify(input ?? null) } catch { return '' } }

/** Whether a request may be answered from a phone at all. */
export function askable(ask: PendingAsk): boolean {
  return ask.toolName !== PLAN_TOOL && !ask.requestId.startsWith('tc-ext-')
}

export function createPhoneAnswers(deps: PhoneAnswersDeps): PhoneAnswers {
  const codes = new Map<string, Live>()
  /** ntfy's `since`: the last message id read, or the time the oldest live code was minted. */
  let sinceId: string | null = null
  let mintedFrom = Infinity
  let inFlight = false
  const on = (): { root: string; topic: string } | null => {
    const s = deps.settings()
    if (!s.answers || !NTFY_TOPIC.test(s.topic) || s.topic.length < MIN_TOPIC) return null
    const server = validServer(s.server)
    if (server === null) return null
    return { root: server.href.endsWith('/') ? server.href : `${server.href}/`, topic: s.topic }
  }
  const sweep = (at: number): void => {
    for (const [code, entry] of codes) if (entry.expires <= at) codes.delete(code)
    if (codes.size === 0) { sinceId = null; mintedFrom = Infinity }
  }
  type Done = Array<{ panelId: string; requestId: string; allow: boolean; outcome: AnswerOutcome }>
  const read = async (where: { root: string; topic: string }): Promise<Done> => {
    // ntfy takes a message id or a unix time in seconds; a few seconds early covers clock skew.
    const since = sinceId ?? String(Math.max(0, Math.floor(mintedFrom / 1000) - 5))
    let body: string
    try {
      const r = await deps.get(`${where.root}${answersTopic(where.topic)}/json?poll=1&since=${encodeURIComponent(since)}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })
      if (!r.ok) { deps.log?.(`[phone] answers poll answered ${r.status}`); return [] }
      body = (await r.text()).slice(0, POLL_MAX_CHARS)
    } catch (error: unknown) {
      // The NAME only: the message can carry the URL, which carries the topic.
      deps.log?.(`[phone] answers poll failed: ${error instanceof Error ? error.name : 'error'}`)
      return []
    }
    const done: Done = []
    for (const line of body.split('\n')) {
      let msg: unknown
      try { msg = JSON.parse(line) } catch { continue }
      if (typeof msg !== 'object' || msg === null) continue
      const m = msg as { id?: unknown; event?: unknown; message?: unknown }
      if (typeof m.id === 'string' && /^[A-Za-z0-9]{1,32}$/.test(m.id)) sinceId = m.id
      if (m.event !== 'message' || typeof m.message !== 'string') continue
      const match = REPLY.exec(m.message.trim())
      if (match === null) continue
      const entry = codes.get(match[2]!)
      if (entry === undefined) continue
      // Spent BEFORE the answer, so a second press (or a replay) finds nothing.
      codes.delete(match[2]!)
      if (entry.expires <= deps.now()) continue
      const allow = match[1] === 'allow'
      const still = deps.pending(entry.panelId).some((p) => p.requestId === entry.requestId && p.toolName === entry.toolName && inputKey(p.input) === entry.input)
      const outcome: AnswerOutcome = still ? deps.answer(entry.panelId, entry.requestId, allow, entry.toolName) : 'gone'
      if (outcome !== 'gone') deps.record?.({ panelId: entry.panelId, requestId: entry.requestId, toolName: entry.toolName, allow, outcome })
      done.push({ panelId: entry.panelId, requestId: entry.requestId, allow, outcome })
    }
    sweep(deps.now())
    return done
  }
  return {
    actionsFor(panelId) {
      const where = on()
      if (where === null) { codes.clear(); return [] }
      const at = deps.now()
      sweep(at)
      const ask = deps.pending(panelId).find(askable)
      if (ask === undefined || codes.size >= MAX_LIVE) return []
      const code = deps.code()
      if (!CODE.test(code) || codes.has(code)) return []
      codes.set(code, { panelId, requestId: ask.requestId, toolName: ask.toolName, input: inputKey(ask.input), expires: at + CODE_TTL_MS })
      mintedFrom = Math.min(mintedFrom, at)
      const url = `${where.root}${answersTopic(where.topic)}`
      return [
        { action: 'http', label: 'Allow once', url, method: 'POST', body: `allow ${code}`, clear: true },
        { action: 'http', label: 'Deny', url, method: 'POST', body: `deny ${code}`, clear: true }
      ]
    },
    async poll() {
      const where = on()
      if (where === null) { codes.clear(); sinceId = null; mintedFrom = Infinity; return [] }
      sweep(deps.now())
      if (codes.size === 0 || inFlight) return []
      inFlight = true
      try { return await read(where) } finally { inFlight = false }
    },
    live: () => codes.size
  }
}
