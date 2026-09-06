import type { CredentialStore } from './credential-store'
import { parseJiraCredential } from './jira-client'
import { NOT_CONNECTED_CODE, notConnectedReason } from '../shared/credential-schema'

/**
 * M87. THE BROKER — an agent in a panel calls a service this app holds a
 * credential for, without ever seeing the credential.
 *
 * The token is read HERE, attached to the request, and appears nowhere else:
 * not in the reply, not in the audit row, not in a refusal's text. This is
 * the credential store's LAST reader (`verify:meta readers.1` pins the set),
 * and the whole module runs under plain node in `verify:credentials
 * broker.1` over a fake fetcher — the real HTTPS one is never bundled.
 *
 * The service table is CLOSED, the path is checked BEFORE the token is
 * touched, and every call — a refusal included — is one audit row of
 * metadata, because an agent's attempt is what the audit is for.
 */

export const BROKER_BODY_MAX = 1024 * 1024
export const BROKER_TIMEOUT_MS = 30_000
/** A path longer than this is not an API path; it is an attempt to fill the audit. */
export const BROKER_PATH_MAX = 2048
/** Calls in flight at once, per broker: past this a call is refused by name rather than queued. */
export const BROKER_IN_FLIGHT_MAX = 8

export interface BrokerRequest {
  service: string
  method: string
  path: string
  body?: string
  panelId?: string
  /** M102. The teammate spending: its grant is checked BEFORE the credential is read, and a write asks first. */
  teammateId?: string
  /** M102. What the caller says the call costs (credits, dollars, a quota) — shown on the card as said, `unknown` when absent. */
  cost?: string
}

/**
 * M102. READ-ONLY methods run uninterrupted; anything else is a WRITE and
 * asks first. Data, not a heuristic on the path: a `GET` that mutates is a
 * service's bug, a `POST` that only reads still spends the user's standing,
 * and the method is the one thing every REST service agrees on.
 */
export const READ_ONLY_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

export const NOT_GRANTED_CODE = 'not-granted'
export const NOT_ANSWERED_CODE = 'not-answered'

/** M102. What the spend card names: service, account, action, target, cost. */
export interface SpendApproval {
  teammateId: string
  service: string
  method: string
  path: string
  /** The connected account's label (`credential:list`'s), never the token. */
  account: string
  cost: string
}

export type BrokerAnswer =
  | { ok: true; status: number; body: string; truncated: boolean }
  /** `code` sorts a refusal without reading its sentence: `not-connected` is the one a caller acts on. */
  | { ok: false; reason: string; code?: string }

export interface BrokerFetchRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  timeoutMs: number
}

export type BrokerFetcher = (req: BrokerFetchRequest) => Promise<{ status: number; body: string }>

/** Metadata only — never a body, never a token. */
export interface BrokerAuditRow {
  at: number
  service: string
  method: string
  path: string
  /** 0 for a call that never reached the service, with `reason` beside it. */
  status: number
  bytes: number
  panelId?: string
  reason?: string
  /** M102. Which teammate spent, when one did. */
  teammateId?: string
}

export interface BrokerDeps {
  store: Pick<CredentialStore, 'read' | 'markRejected'>
  fetcher: BrokerFetcher
  audit: { append(row: BrokerAuditRow): void }
  now?: () => number
  /**
   * M102. The services a teammate may spend, or undefined for a teammate the
   * roster does not hold. Absent (every pre-M102 caller and every check) means
   * no teammate scoping: a request naming a teammate is then refused, because
   * a grant nobody can answer for is not a grant.
   */
  services?: (teammateId: string) => readonly string[] | undefined
  /**
   * M102. Ask before a WRITE. Resolves the user's answer; absent means every
   * write by a teammate is refused by name (`not-answered`), never performed.
   */
  approve?: (req: SpendApproval) => Promise<boolean>
  /** M102. The connected account's label for the card, from the store's METADATA. */
  account?: (service: string) => string | undefined
}

export interface Broker {
  call(req: BrokerRequest): Promise<BrokerAnswer>
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

export { notConnectedReason }

/**
 * What a service's request looks like once the credential is in hand. The
 * table is closed on purpose: an open one would let `tc api anything` reach
 * an arbitrary host with a real token attached.
 */
function resolve(service: string, secret: string, path: string): { url: string; origin: string; prefix: string; headers: Record<string, string>; secrets: string[] } | { refused: string } {
  if (service === 'github') {
    return { url: `https://api.github.com${path}`, origin: 'https://api.github.com', prefix: '/', headers: { authorization: `Bearer ${secret}`, accept: 'application/vnd.github+json', 'user-agent': 'terminal-canvas', 'content-type': 'application/json' }, secrets: [secret] }
  }
  if (service === 'jira') {
    const cred = parseJiraCredential(secret)
    if (cred === null) return { refused: 'the jira credential is not usable — set it again in ⌘K › Credentials' }
    const basic = Buffer.from(`${cred.email}:${cred.token}`).toString('base64')
    let origin: string
    try { origin = new URL(cred.site).origin } catch { return { refused: 'the jira credential names no usable site — set it again in ⌘K › Credentials' } }
    return { url: `${origin}/rest/api/3${path}`, origin, prefix: '/rest/api/3/', headers: { authorization: `Basic ${basic}`, accept: 'application/json', 'content-type': 'application/json' }, secrets: [secret, cred.token, `${cred.email}:${cred.token}`, basic] }
  }
  return { refused: `unknown service ${JSON.stringify(service)} — the broker knows github and jira` }
}

/**
 * The URL as the wire will see it: percent-encoded dots (`%2e%2e`) are a
 * double-dot segment to the WHATWG parser `node:https` uses, so a string
 * check on the INPUT path lets `/%2e%2e/%2e%2e/rest/api/2/…` walk out from
 * under the Jira prefix with basic auth attached (M87's verifier). The
 * NORMALISED origin and pathname are what get checked, and the normalised
 * path is what the audit records.
 */
function normalise(url: string, origin: string, prefix: string): { url: string; path: string } | { refused: string } {
  let parsed: URL
  try { parsed = new URL(url) } catch { return { refused: 'the path does not form a valid URL' } }
  if (parsed.origin !== origin) return { refused: 'the path must stay on the service\u2019s own host' }
  if (parsed.username !== '' || parsed.password !== '') return { refused: 'the path must not carry credentials' }
  const pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`
  if (!pathname.startsWith(prefix)) return { refused: `the path must stay under ${prefix.replace(/\/$/, '') || '/'}` }
  return { url: parsed.toString(), path: `${parsed.pathname}${parsed.search}` }
}

/** Every derived form of the secret, every occurrence — not `replace`, which takes the first. */
function scrub(text: string, secrets: readonly string[]): string {
  let out = text
  for (const s of secrets) if (s !== '') out = out.split(s).join('[redacted]')
  return out
}

/** Checked BEFORE the token is read: nothing here has seen a secret. */
function checkPath(path: string): string | null {
  if (typeof path !== 'string' || !path.startsWith('/')) return 'the path must start with /'
  if (path.length > BROKER_PATH_MAX) return `the path is over ${BROKER_PATH_MAX} characters`
  if (path.startsWith('//')) return 'the path must not start with //'
  if (/:\/\//.test(path)) return 'the path must not carry a scheme'
  if (/[\u0000-\u001f\u007f]/.test(path)) return 'the path must not carry control characters'
  // Encoded dots are never a real API path segment; they are how `..` is
  // smuggled past a string check into the URL parser (M87's verifier). The
  // normalised-URL check below is the backstop; this names the trick.
  if (/%2e/i.test(path)) return 'the path must not carry encoded dots'
  if (path.split(/[?#]/)[0]!.split('/').some((seg) => seg === '..')) return 'the path must not contain ..'
  return null
}

export function createBroker(deps: BrokerDeps): Broker {
  const now = deps.now ?? (() => Date.now())
  let inFlight = 0
  const record = (req: BrokerRequest, status: number, bytes: number, reason?: string): void => {
    deps.audit.append({
      at: now(), service: req.service, method: req.method, path: req.path, status, bytes,
      ...(req.panelId === undefined ? {} : { panelId: req.panelId }),
      ...(req.teammateId === undefined ? {} : { teammateId: req.teammateId }),
      ...(reason === undefined ? {} : { reason })
    })
  }
  const refuse = (req: BrokerRequest, reason: string, code?: string): BrokerAnswer => {
    record(req, 0, 0, reason)
    return { ok: false, reason, ...(code === undefined ? {} : { code }) }
  }
  return {
    async call(req) {
      if (typeof req.service !== 'string' || req.service.length > 32 || typeof req.method !== 'string' || req.method.length > 16) return refuse({ ...req, service: String(req.service).slice(0, 32), method: String(req.method).slice(0, 16), path: String(req.path).slice(0, 64) }, 'the service or the method is not a name the broker knows')
      const method = String(req.method ?? '').toUpperCase()
      if (!METHODS.has(method)) return refuse(req, `${JSON.stringify(req.method)} is not a method the broker performs — GET, POST, PUT, PATCH or DELETE`)
      const pathProblem = checkPath(req.path)
      if (pathProblem !== null) return refuse(req, pathProblem)
      if (req.body !== undefined && Buffer.byteLength(req.body) > BROKER_BODY_MAX) return refuse(req, `the body is over the ${BROKER_BODY_MAX / 1024 / 1024} MB cap`)
      if (req.service !== 'github' && req.service !== 'jira') return refuse(req, `unknown service ${JSON.stringify(req.service)} — the broker knows github and jira`)
      // M102. The grant, BEFORE the credential is read: a refused teammate
      // never causes a read, so the store's readers stay what they are and
      // the audit shows the attempt with no token behind it.
      if (req.teammateId !== undefined) {
        const granted = deps.services?.(req.teammateId)
        if (granted === undefined) return refuse(req, `no teammate is called ${req.teammateId}, or this window scopes no services — open the Teammates pane`, NOT_GRANTED_CODE)
        if (!granted.includes(req.service)) return refuse(req, `${req.service} is not granted to this teammate — grant ${req.service} to it in the Teammates pane`, NOT_GRANTED_CODE)
      }
      const secret = deps.store.read(req.service)
      if (secret === undefined) return refuse(req, notConnectedReason(req.service), NOT_CONNECTED_CODE)
      const resolved = resolve(req.service, secret, req.path)
      if ('refused' in resolved) return refuse(req, resolved.refused)
      const normalised = normalise(resolved.url, resolved.origin, resolved.prefix)
      if ('refused' in normalised) return refuse(req, normalised.refused)
      // The audit records the path AS THE WIRE SEES IT, so a page listing the
      // rows shows what was asked, not how it was spelled.
      // Scrubbed of every derived form of the secret: the path is the agent's
      // own text, and an agent that put a token in a query string would
      // otherwise write it into the audit (M89's verifier).
      const asked = { ...req, path: scrub(normalised.path, resolved.secrets) }
      // M102. A write asks first, by NAME: service, account, action, target,
      // cost. Read-only methods run uninterrupted (the table above). The
      // answer comes through M98's door, `Allow for session` included.
      if (req.teammateId !== undefined && !READ_ONLY_METHODS.has(method)) {
        const allowed = deps.approve === undefined ? false : await deps.approve({ teammateId: req.teammateId, service: req.service, method, path: asked.path, account: deps.account?.(req.service) ?? req.service, cost: req.cost ?? 'unknown' })
        if (!allowed) return refuse(asked, `${method} ${asked.path} on ${req.service} was not allowed — a write through the broker asks first, on the teammate's chat`, NOT_ANSWERED_CODE)
      }
      if (inFlight >= BROKER_IN_FLIGHT_MAX) return refuse(asked, `${BROKER_IN_FLIGHT_MAX} calls are already in flight — wait for one to finish`)
      inFlight += 1
      let answer: { status: number; body: string }
      try {
        answer = await deps.fetcher({ url: normalised.url, method, headers: resolved.headers, ...(req.body === undefined ? {} : { body: req.body }), timeoutMs: BROKER_TIMEOUT_MS })
      } catch (error) {
        // The fetcher's own error, scrubbed of EVERY derived form of the
        // secret, every occurrence — a URL with a token in it, a header
        // echoed back, the basic-auth blob.
        const text = scrub(String(error instanceof Error ? error.message : error), resolved.secrets)
        return refuse(asked, `the request failed — ${text}`)
      } finally {
        inFlight -= 1
      }
      // Bytes, not UTF-16 units, and cut on a character boundary.
      const raw = Buffer.from(answer.body, 'utf8')
      const truncated = raw.length > BROKER_BODY_MAX
      const body = truncated ? raw.subarray(0, BROKER_BODY_MAX).toString('utf8').replace(/\uFFFD$/, '') : answer.body
      // A 401 seen HERE marks the credential rejected — the one place every
      // service call passes, so the Integrations page and a work panel cannot
      // show two states for one token.
      if (answer.status === 401) deps.store.markRejected(req.service)
      record(asked, answer.status, Buffer.byteLength(body))
      return { ok: true, status: answer.status, body: scrub(body, resolved.secrets), truncated }
    }
  }
}
