import { request } from 'node:https'
import type { CredentialMeta } from '../shared/credential-schema'
import type { CredentialStore } from './credential-store'

/**
 * 15s, and the ceiling matters for the reason GIT_TIMEOUT_MS's does: neither
 * caller has anyone to time it out on its behalf, so a call with no ceiling is
 * an invoke whose reply simply never arrives and a UI that waits forever.
 */
export const VERIFY_TIMEOUT_MS = 15000

/**
 * `GET /user` is a small JSON payload; a well-above-it ceiling is the same
 * "a call with no ceiling is a promise that never resolves" reasoning
 * VERIFY_TIMEOUT_MS carries, aimed at the BODY rather than the clock — a
 * response that never stops sending data would otherwise buffer forever in
 * this process with no timer anywhere to catch it.
 */
const MAX_BODY_BYTES = 1024 * 1024

export type Fetcher = (
  url: string,
  token: string,
  timeoutMs: number
) => Promise<{ status: number; body: string }>

export interface VerifyDeps {
  store: CredentialStore
  fetcher: Fetcher
}

export type VerifyResult = { ok: true; meta: CredentialMeta } | { ok: false; reason: string }

const USER_URL = 'https://api.github.com/user'

/**
 * The only place a stored secret is used, and it is used to make a REQUEST —
 * never returned as a value. What crosses back is what GitHub said.
 */
export async function verifyCredential(deps: VerifyDeps, service: string): Promise<VerifyResult> {
  if (service !== 'github') return { ok: false, reason: `cannot verify ${service}` }
  const token = deps.store.read(service)
  // Refuse before making a request rather than sending `undefined` upstream.
  if (token === undefined) return { ok: false, reason: 'no stored credential to verify' }

  let res: { status: number; body: string }
  try {
    res = await deps.fetcher(USER_URL, token, VERIFY_TIMEOUT_MS)
  } catch {
    // The message is OURS, never the thrown one: a network error can quote the
    // request it was making, and this request carries an Authorization header.
    return { ok: false, reason: 'the request to GitHub failed' }
  }

  if (res.status === 401 || res.status === 403) {
    // M89. The durable mark the Integrations page reads; a success clears it.
    // Only a 401: a 403 is a rate limit or an SSO organisation with a token
    // that is fine, and marking it would send the user to replace a working
    // token (M89's verifier).
    if (res.status === 401) deps.store.markRejected(service)
    return { ok: false, reason: 'GitHub rejected the token — it may be revoked or lack scope' }
  }
  if (res.status !== 200) {
    return { ok: false, reason: `GitHub answered ${res.status}` }
  }

  let login: unknown
  try {
    login = (JSON.parse(res.body) as { login?: unknown }).login
  } catch {
    return { ok: false, reason: 'GitHub returned a response this app could not read' }
  }
  if (typeof login !== 'string' || login.length === 0) {
    return { ok: false, reason: 'GitHub returned no account name' }
  }

  // Only `login`. The rest of GET /user is profile data this app has no use
  // for, and storing it wholesale would put personal data in a file whose
  // stated purpose is one token.
  deps.store.setLabel(service, login)
  const meta = deps.store.list().find((m) => m.service === service)
  return meta ? { ok: true, meta } : { ok: false, reason: 'the credential vanished mid-verify' }
}

/** node:https rather than a dependency — see the plan's global constraints. */
/**
 * M87. The broker's real fetcher: any method, any headers, a body, a
 * timeout. Beside the verifier's for the same reason that one is here — a
 * network call belongs to main and to no suite.
 */
export function createHttpsBrokerFetcher(): (req: { url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number }) => Promise<{ status: number; body: string }> {
  return (req) => new Promise((resolve, reject) => {
    const { request } = require('node:https') as typeof import('node:https')
    // A DEADLINE for the whole call, not node's socket-inactivity timeout: a
    // server sending a byte every 29 seconds would otherwise hold a call
    // open forever (M87's verifier).
    const deadline = setTimeout(() => { r.destroy(new Error('the request timed out')) }, req.timeoutMs)
    const r = request(req.url, { method: req.method, headers: { ...req.headers, ...(req.body === undefined ? {} : { 'content-length': String(Buffer.byteLength(req.body)) }) } }, (res) => {
      const chunks: Buffer[] = []
      let total = 0
      res.on('data', (c: Buffer) => {
        total += c.length
        chunks.push(c)
        // Past twice the cap, stop READING rather than only stop keeping.
        if (total > MAX_BODY_BYTES * 2) { res.destroy(); clearTimeout(deadline); resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }) }
      })
      res.on('end', () => { clearTimeout(deadline); resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }) })
    })
    r.on('error', (error) => { clearTimeout(deadline); reject(error) })
    if (req.body !== undefined) r.write(req.body)
    r.end()
  })
}

export function createHttpsFetcher(): Fetcher {
  return (url, token, timeoutMs) =>
    new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'terminal-canvas'
          },
          timeout: timeoutMs
        },
        (res) => {
          let body = ''
          let bytes = 0
          res.setEncoding('utf8')
          res.on('data', (c: string) => {
            bytes += Buffer.byteLength(c, 'utf8')
            if (bytes > MAX_BODY_BYTES) {
              res.destroy(new Error('response too large'))
              return
            }
            body += c
          })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
          res.on('error', reject)
        }
      )
      req.on('timeout', () => {
        req.destroy(new Error('timeout'))
      })
      req.on('error', reject)
      req.end()
    })
}
