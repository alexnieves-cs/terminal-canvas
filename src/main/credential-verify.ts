import { request } from 'node:https'
import type { CredentialMeta } from '../shared/credential-schema'
import type { CredentialStore } from './credential-store'

/**
 * 15s, and the ceiling matters for the reason GIT_TIMEOUT_MS's does: neither
 * caller has anyone to time it out on its behalf, so a call with no ceiling is
 * an invoke whose reply simply never arrives and a UI that waits forever.
 */
export const VERIFY_TIMEOUT_MS = 15000

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
          res.setEncoding('utf8')
          res.on('data', (c: string) => {
            body += c
          })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        }
      )
      req.on('timeout', () => {
        req.destroy(new Error('timeout'))
      })
      req.on('error', reject)
      req.end()
    })
}
