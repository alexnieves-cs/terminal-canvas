/**
 * Supabase access-token verification, LOCALLY, at the WebSocket upgrade.
 *
 * The collab server asks Supabase `/auth/v1/user` on every connect
 * (server/collab/auth.ts). The relay does not: a pty stream reconnects far
 * more often than a Y.Doc room (every Wi-Fi blip inside the 60s grace), and a
 * relay whose attach waits on a round trip to Supabase is a relay that is down
 * whenever Supabase is slow. So the signature is checked here, with no call
 * per connect:
 *
 *   ES256 / RS256  the project's signing keys, from
 *                  <TC_SUPABASE_URL>/auth/v1/.well-known/jwks.json — fetched
 *                  once, cached, re-fetched (at most once a minute) when a
 *                  token names a kid the cache lacks, which is a key rotation;
 *   HS256          the legacy shared secret (TC_RELAY_JWT_SECRET), only when
 *                  it is configured. Never both paths for one alg: an RS/ES
 *                  token is never checked against the HMAC secret, which is
 *                  the classic alg-confusion hole.
 *
 * What is refused, each by name: a malformed token, an alg we did not pin
 * (`none` included), a bad signature, exp in the past (30s skew), nbf in the
 * future, aud ≠ authenticated, iss ≠ <url>/auth/v1 when the url is known,
 * no `sub`. The cost of verifying locally is revocation: a signed-out token
 * stays valid to its exp (Supabase's default is an hour). The relay caps a
 * socket's life at the token's exp for that reason (relay.ts).
 *
 * node:crypto only — no jose, no jsonwebtoken on the VM.
 */
import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify, type KeyObject, type JsonWebKey } from 'node:crypto'

export interface VerifiedToken { userId: string; exp: number; raw: string }
export type VerifyResult = { ok: true; token: VerifiedToken } | { ok: false; reason: string }

export interface JwtVerifierConfig {
  /** https://<project>.supabase.co — the JWKS source and the expected issuer. */
  supabaseUrl?: string
  /** The legacy HS256 secret. Absent: HS256 tokens are refused. */
  hsSecret?: string
  /** Injected for verify:relay; production is global fetch. */
  fetchJwks?: () => Promise<{ keys: JsonWebKey[] }>
  now?: () => number
}

const SKEW_S = 30
const JWKS_REFETCH_MS = 60_000

const b64json = (part: string): unknown => {
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown } catch { return undefined }
}

export function createJwtVerifier(config: JwtVerifierConfig): (token: string) => Promise<VerifyResult> {
  const now = config.now ?? Date.now
  const base = config.supabaseUrl?.replace(/\/+$/, '')
  const issuer = base === undefined ? undefined : `${base}/auth/v1`
  const fetchJwks = config.fetchJwks ?? (base === undefined ? undefined : async () => {
    const r = await fetch(`${base}/auth/v1/.well-known/jwks.json`)
    if (!r.ok) throw new Error(`jwks ${r.status}`)
    return await r.json() as { keys: JsonWebKey[] }
  })
  const keys = new Map<string, { alg: string; key: KeyObject }>()
  let lastFetch = -Infinity
  let inFlight: Promise<void> | null = null

  const refresh = async (): Promise<void> => {
    if (fetchJwks === undefined || now() - lastFetch < JWKS_REFETCH_MS) return
    if (inFlight !== null) return inFlight
    lastFetch = now()
    inFlight = (async () => {
      try {
        const set = await fetchJwks()
        for (const jwk of Array.isArray(set.keys) ? set.keys : []) {
          const kid = (jwk as { kid?: unknown }).kid
          const alg = (jwk as { alg?: unknown }).alg
          if (typeof kid !== 'string' || (alg !== 'ES256' && alg !== 'RS256')) continue
          try { keys.set(kid, { alg, key: createPublicKey({ key: jwk, format: 'jwk' }) }) } catch { /* a key node cannot read is a key we never match */ }
        }
      } catch { /* unreachable: the cached keys stand, and an unknown kid is refused */ } finally { inFlight = null }
    })()
    return inFlight
  }

  return async (raw) => {
    if (typeof raw !== 'string' || raw.length > 8192) return { ok: false, reason: 'no token' }
    const parts = raw.split('.')
    if (parts.length !== 3) return { ok: false, reason: 'the token is malformed' }
    const [h, p, s] = parts as [string, string, string]
    const header = b64json(h) as { alg?: unknown; kid?: unknown } | undefined
    const payload = b64json(p) as Record<string, unknown> | undefined
    if (typeof header !== 'object' || header === null || typeof payload !== 'object' || payload === null) return { ok: false, reason: 'the token is malformed' }
    const signed = Buffer.from(`${h}.${p}`)
    const sig = Buffer.from(s, 'base64url')

    if (header.alg === 'HS256') {
      if (config.hsSecret === undefined || config.hsSecret === '') return { ok: false, reason: 'HS256 tokens are not accepted here' }
      const want = createHmac('sha256', config.hsSecret).update(signed).digest()
      if (want.length !== sig.length || !timingSafeEqual(want, sig)) return { ok: false, reason: 'the token signature is invalid' }
    } else if (header.alg === 'ES256' || header.alg === 'RS256') {
      if (typeof header.kid !== 'string') return { ok: false, reason: 'the token names no key' }
      if (!keys.has(header.kid)) await refresh()
      const k = keys.get(header.kid)
      // The key's own alg, never the header's: a header cannot move a token onto a different check.
      if (k === undefined || k.alg !== header.alg) return { ok: false, reason: 'the token was signed by an unknown key' }
      const good = k.alg === 'ES256'
        ? cryptoVerify('sha256', signed, { key: k.key, dsaEncoding: 'ieee-p1363' }, sig)
        : cryptoVerify('sha256', signed, k.key, sig)
      if (!good) return { ok: false, reason: 'the token signature is invalid' }
    } else {
      return { ok: false, reason: 'the token algorithm is not accepted' }
    }

    const t = Math.floor(now() / 1000)
    const exp = payload['exp']
    if (typeof exp !== 'number' || exp + SKEW_S < t) return { ok: false, reason: 'the token has expired' }
    const nbf = payload['nbf']
    if (typeof nbf === 'number' && nbf - SKEW_S > t) return { ok: false, reason: 'the token is not valid yet' }
    const aud = payload['aud']
    if (!(aud === 'authenticated' || (Array.isArray(aud) && aud.includes('authenticated')))) return { ok: false, reason: 'the token is not for a signed-in user' }
    if (issuer !== undefined && payload['iss'] !== issuer) return { ok: false, reason: 'the token was issued by another project' }
    const sub = payload['sub']
    if (typeof sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sub)) return { ok: false, reason: 'the token names no user' }
    return { ok: true, token: { userId: sub, exp, raw } }
  }
}
