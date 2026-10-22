/**
 * M489 — phone alerts: when an agent starts waiting on a person and nobody is
 * at the Mac, a push through ntfy (https://ntfy.sh — open source, free hosted
 * or self-hosted), so the phone buzzes without an app of our own.
 *
 * This is the first door that sends canvas words OFF the machine to a server
 * this app does not run, and a topic is readable by anyone who guesses its
 * name. So the payload is as small as the job allows and is built in ONE
 * pure function every path goes through:
 *
 * - **The words pass `outward`** (the one gate) and then lose every path: a
 *   panel's label is often its directory, and a path names a person's
 *   machine and projects. What is left is a basename.
 * - **Nothing else rides.** No panel id, no command, no output tail — the
 *   label and the vocabulary's own "needs you" sentence (attention-words.ts).
 * - **Off unless a topic is set**, https only, the topic a closed pattern;
 *   throttled per panel and per hour, so a flapping agent cannot spam a phone.
 *
 * The decision (`decide`) is pure and the sender takes its clock, idle
 * reading and `fetch` as deps, so `verify:mcp push.*` runs both under plain
 * node. Electron is never imported here: `stores.ts` passes `powerMonitor`.
 */
import { outward } from '../shared/outward'
import { needsYouCount, needsYouNamed } from '../shared/attention-words'

export interface PhoneAlertSettings {
  /** The ntfy topic; empty means alerts are off. */
  topic: string
  /** The ntfy server; https only. */
  server: string
  /** How long the Mac must have had no input before a push is sent. 0: whenever the window is not focused. */
  idleMinutes: number
}

export interface PhonePayload {
  topic: string
  title: string
  message: string
  tags: string[]
  priority: number
  /** M532. Allow once / Deny buttons (phone-answers.ts); absent unless answers are on and the panel has an askable request. */
  actions?: Array<{ action: 'http'; label: string; url: string; method: 'POST'; body: string; clear: true }>
}

/** A topic is a name in a URL path: letters, digits, `-` and `_`, as ntfy itself allows. */
export const NTFY_TOPIC = /^[A-Za-z0-9_-]{1,64}$/

/** Per panel, at most one push in this window; across the app, at most `HOURLY_MAX` an hour. */
export const PER_PANEL_MS = 10 * 60 * 1000
export const HOURLY_MAX = 12
const TEXT_MAX = 120

/** Characters that look like a path separator and are not one: folded before the cut. */
const SLASH_LOOKALIKES = /[\u2044\u2215\u29f8\uff0f]/g
/** Where a path starts: `/`, `~/`, `./`, `../` or `C:\`, at the start of the text or after a space or an opening quote. */
const PATH_START = /(?:^|(?<=[\s"'(\[<]))(?:~|\.{1,2}|[A-Za-z]:)?[/\\]/

/**
 * Canvas words made fit for a phone. The order is the point (the critic's two
 * findings): controls and invisible format characters go FIRST, so nothing
 * the scrubber should match is split by one; `outward` runs; every path is
 * cut; `outward` runs AGAIN on what the cut left, in case a cut made a token
 * shape whole; then clip. The counts are summed.
 *
 * The cut: from the first place a path starts to the LAST separator in the
 * text goes, so a path with spaces in it (`/Users/John Smith/acme/repo`)
 * leaves only `repo`; then any word still holding a separator, a URL's
 * `://` or a `user@host` keeps only what follows its last one, so a
 * relative path, a URL and a credential in a connection string all go.
 */
export function phoneText(text: string): { text: string; redacted: number } {
  const clean = text
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(SLASH_LOOKALIKES, '/')
    .replace(/\s+/g, ' ')
    .trim()
  const first = outward(clean, 'phone alert')
  let cut = first.text
  const start = cut.search(PATH_START)
  if (start !== -1) {
    const last = Math.max(cut.lastIndexOf('/'), cut.lastIndexOf('\\'))
    cut = cut.slice(0, start) + cut.slice(last + 1)
  }
  cut = cut
    .split(' ')
    .map((w) => {
      const afterSep = /[/\\]/.test(w) ? (w.split(/[/\\]+/).filter((p) => p !== '' && p !== '~' && p !== '.' && p !== '..').pop() ?? '') : w
      return afterSep.includes('@') ? afterSep.slice(afterSep.lastIndexOf('@') + 1) : afterSep
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const second = outward(cut, 'phone alert')
  const clipped = second.text.length > TEXT_MAX ? `${second.text.slice(0, TEXT_MAX - 1)}…` : second.text
  return { text: clipped, redacted: first.redacted + second.redacted }
}

/**
 * The one payload builder: what an ntfy publish carries, and nothing else.
 * The same two strings the Mac's own notification shows (stores.ts): a chat's
 * request is `claude asks to run Bash` over `<panel> needs you`. A terminal's
 * label is its COMMAND line, which can carry arguments (a connection string, a
 * flag with a key in it), so only its first word's basename rides: `claude`.
 */
export function phonePayload(topic: string, label: string, body?: string): PhonePayload {
  if (body === undefined) {
    const program = phoneText(label.trim().split(/\s+/)[0] ?? '').text
    return { topic, title: 'Terminal Canvas', message: needsYouNamed(program || 'An agent'), tags: ['bell'], priority: 4 }
  }
  const name = phoneText(label).text || 'An agent'
  return { topic, title: name, message: phoneText(body).text || needsYouNamed(name), tags: ['bell'], priority: 4 }
}

export function validServer(server: string): URL | null {
  let url: URL
  try { url = new URL(server) } catch { return null }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return null
  return url
}

export type AlertDecision =
  | { kind: 'send'; payload: PhonePayload; url: string }
  | { kind: 'skip'; reason: 'off' | 'bad-topic' | 'bad-server' | 'not-idle' | 'throttled' }

/** Idle long enough. A non-finite setting falls back to the default rather than failing open. */
export function isAway(idleSeconds: number, idleMinutes: number): boolean {
  const minutes = Number.isFinite(idleMinutes) ? Math.max(0, idleMinutes) : 3
  return idleSeconds >= minutes * 60
}

/** Pure: whether this entry to needs-you becomes a push, given what was sent before. */
export function decide(input: {
  settings: PhoneAlertSettings
  label: string
  body?: string
  panelId: string
  idleSeconds: number
  now: number
  sent: ReadonlyArray<{ panelId: string; at: number }>
}): AlertDecision {
  const { settings, now, sent } = input
  if (settings.topic.trim() === '') return { kind: 'skip', reason: 'off' }
  if (!NTFY_TOPIC.test(settings.topic)) return { kind: 'skip', reason: 'bad-topic' }
  const server = validServer(settings.server)
  if (server === null) return { kind: 'skip', reason: 'bad-server' }
  if (!isAway(input.idleSeconds, settings.idleMinutes)) return { kind: 'skip', reason: 'not-idle' }
  if (sent.some((s) => s.panelId === input.panelId && now - s.at < PER_PANEL_MS)) return { kind: 'skip', reason: 'throttled' }
  if (sent.filter((s) => now - s.at < 60 * 60 * 1000).length >= HOURLY_MAX) return { kind: 'skip', reason: 'throttled' }
  // ntfy's JSON publish goes to the server ROOT with the topic in the body.
  const root = server.href.endsWith('/') ? server.href : `${server.href}/`
  return { kind: 'send', payload: phonePayload(settings.topic, input.label, input.body), url: root }
}

/** `redirect: 'error'`: a 30x would resend the body wherever it points, plain http included. */
export type Post = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; redirect: 'error' }) => Promise<{ ok: boolean; status: number }>

/** The test push: at most one a minute, and it counts toward the hourly cap — any process can ask for one. */
export const TEST_GAP_MS = 60 * 1000

export interface PhoneAlerts {
  /** An item entered needs-you. Resolves with what happened, for the log and the checks. */
  entered(panelId: string, label: string, body?: string): Promise<AlertDecision['kind'] | Extract<AlertDecision, { kind: 'skip' }>['reason'] | 'failed'>
  /** A test push, past the idle rule; rate-limited, since the socket that asks is any process's. */
  test(): Promise<{ ok: true } | { ok: false; reason: string }>
  /**
   * The waiting count (the dock badge's) and a periodic look: a person who
   * walked away with this window in front, or left after an agent asked, is
   * still away — the entry-time push missed them, so this sends ONE summary
   * per waiting spell once the Mac goes idle.
   */
  waiting(count: number): void
  tick(): Promise<'send' | 'skip' | 'failed'>
}

export function createPhoneAlerts(deps: {
  settings: () => PhoneAlertSettings
  /** Seconds since the last keyboard or mouse input on this Mac. */
  idleSeconds: () => number
  post: Post
  now?: () => number
  log?: (line: string) => void
  /** M532. Buttons for this panel's push, minted only once a push is really going out. */
  actions?: (panelId: string) => NonNullable<PhonePayload['actions']>
}): PhoneAlerts {
  const now = deps.now ?? Date.now
  const sent: Array<{ panelId: string; at: number }> = []
  const send = async (url: string, payload: PhonePayload): Promise<boolean> => {
    try {
      const r = await deps.post(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error' })
      if (!r.ok) deps.log?.(`[phone] ntfy answered ${r.status}`)
      return r.ok
    } catch (error: unknown) {
      // The error's NAME only: its message can carry the URL, and a server
      // configured with a path could carry the topic in it.
      deps.log?.(`[phone] push failed: ${error instanceof Error ? error.name : 'error'}`)
      return false
    }
  }
  const hourly = (at: number): number => sent.filter((x) => at - x.at < 60 * 60 * 1000).length
  let waitingCount = 0
  /** True once this waiting spell (count went above 0) has reached the phone. */
  let spellPushed = false
  let lastTest = -Infinity
  return {
    async entered(panelId, label, body) {
      const at = now()
      const d = decide({ settings: deps.settings(), label, ...(body === undefined ? {} : { body }), panelId, idleSeconds: deps.idleSeconds(), now: at, sent })
      if (d.kind === 'skip') return d.reason
      // Recorded before the send, so two entries in one tick cannot both pass.
      sent.push({ panelId, at })
      spellPushed = true
      while (sent.length > 0 && at - sent[0]!.at > 60 * 60 * 1000) sent.shift()
      const actions = deps.actions?.(panelId) ?? []
      return (await send(d.url, actions.length === 0 ? d.payload : { ...d.payload, actions })) ? 'send' : 'failed'
    },
    waiting(count) {
      // A spell ends when nothing waits; the next one may push again.
      if (count <= 0) spellPushed = false
      waitingCount = Math.max(0, count)
    },
    async tick() {
      if (waitingCount === 0 || spellPushed) return 'skip'
      const at = now()
      const s = deps.settings()
      if (s.topic.trim() === '' || !NTFY_TOPIC.test(s.topic)) return 'skip'
      const server = validServer(s.server)
      if (server === null || !isAway(deps.idleSeconds(), s.idleMinutes) || hourly(at) >= HOURLY_MAX) return 'skip'
      spellPushed = true
      sent.push({ panelId: '*summary', at })
      const root = server.href.endsWith('/') ? server.href : `${server.href}/`
      return (await send(root, { topic: s.topic, title: 'Terminal Canvas', message: needsYouCount(waitingCount), tags: ['bell'], priority: 4 })) ? 'send' : 'failed'
    },
    async test() {
      const at = now()
      if (at - lastTest < TEST_GAP_MS) return { ok: false, reason: 'a test push was sent less than a minute ago' }
      if (hourly(at) >= HOURLY_MAX) return { ok: false, reason: `the hourly limit of ${HOURLY_MAX} pushes is reached — try again later` }
      const s = deps.settings()
      if (s.topic.trim() === '') return { ok: false, reason: 'no ntfy topic is set — Settings ▸ Privacy & export ▸ Phone alerts: ntfy topic' }
      if (!NTFY_TOPIC.test(s.topic)) return { ok: false, reason: 'the topic may use only letters, digits, - and _' }
      const server = validServer(s.server)
      if (server === null) return { ok: false, reason: 'the ntfy server must be an https:// address with no user, query or fragment' }
      const root = server.href.endsWith('/') ? server.href : `${server.href}/`
      lastTest = at
      sent.push({ panelId: '*test', at })
      const ok = await send(root, { topic: s.topic, title: 'Terminal Canvas', message: 'Phone alerts work. You will hear from this topic when an agent is waiting on you and you are away from your Mac.', tags: ['white_check_mark'], priority: 3 })
      return ok ? { ok: true } : { ok: false, reason: 'ntfy did not accept the push — check the server and your network' }
    }
  }
}
