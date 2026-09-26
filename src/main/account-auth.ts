/**
 * The Terminal Canvas account's TRANSPORT: config, PKCE, the one-shot
 * loopback callback, and the Supabase Auth (GoTrue) and PostgREST calls.
 *
 * Why Supabase runs the GitHub OAuth app and this process does not: GitHub's
 * web flow needs the app's client SECRET to exchange a code, and a secret
 * shipped inside a desktop app is not a secret. Supabase also cannot mint a
 * session from a GitHub token (`signInWithIdToken` takes OIDC providers, and
 * GitHub is not one). So the flow is Supabase's own PKCE: this process holds a
 * one-time verifier, the browser does GitHub's consent, Supabase redirects to
 * the loopback with a code, and only the holder of the verifier can redeem it.
 * There is no device-flow fallback for the same reason — a device code yields
 * a GitHub token Supabase cannot turn into a session without a server.
 *
 * Plain fetch, no SDK: supabase-js would bring its own token storage and
 * refresh timers, and a session's secrets must live in the credential store
 * and nowhere else. No electron import: verify:account drives all of this
 * under plain node.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export interface AccountConfig {
  /** The project URL, no trailing slash. */
  url: string
  /** The project's anon (public) key — safe to ship, RLS is the boundary. */
  anonKey: string
  callbackPort: number
}

/** 47823 is arbitrary; it must match an entry in the project's Redirect URLs. */
export const DEFAULT_CALLBACK_PORT = 47823
export const CALLBACK_PATH = '/auth/callback'

export type ConfigRead = { kind: 'ok'; config: AccountConfig } | { kind: 'missing'; reason: string }

/**
 * Read at USE, never at module scope: a packaged app launched from Finder has
 * launchd's bare env, and the login-shell env only exists after the startup
 * probe (src/main/CLAUDE.md, rule 1). The caller passes both, process first.
 */
export function readAccountConfig(...envs: Array<Record<string, string | undefined>>): ConfigRead {
  const pick = (k: string): string | undefined => {
    for (const env of envs) { const v = env[k]; if (v !== undefined && v.trim() !== '') return v.trim() }
    return undefined
  }
  const url = pick('TC_SUPABASE_URL')
  const anonKey = pick('TC_SUPABASE_ANON_KEY')
  if (url === undefined || anonKey === undefined) {
    return { kind: 'missing', reason: 'accounts are not configured — set TC_SUPABASE_URL and TC_SUPABASE_ANON_KEY' }
  }
  let parsed: URL
  try { parsed = new URL(url) } catch { return { kind: 'missing', reason: 'TC_SUPABASE_URL is not a URL' } }
  // https, or plain http to this machine only (`supabase start`'s local stack).
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    return { kind: 'missing', reason: 'TC_SUPABASE_URL must be https (or http to 127.0.0.1 for a local stack)' }
  }
  const portRaw = pick('TC_AUTH_CALLBACK_PORT')
  const port = portRaw === undefined ? DEFAULT_CALLBACK_PORT : Number(portRaw)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { kind: 'missing', reason: 'TC_AUTH_CALLBACK_PORT must be a port number from 1024 to 65535' }
  }
  return { kind: 'ok', config: { url: parsed.origin, anonKey, callbackPort: port } }
}

const b64url = (buf: Buffer): string => buf.toString('base64url')

export interface Pkce { verifier: string; challenge: string }

/** RFC 7636 S256. 32 random bytes → a 43-character verifier. */
export function createPkce(random: (n: number) => Buffer = randomBytes): Pkce {
  const verifier = b64url(random(32))
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }
}

export function redirectUri(config: AccountConfig): string {
  return `http://127.0.0.1:${config.callbackPort}${CALLBACK_PATH}`
}

export function authorizeUrl(config: AccountConfig, pkce: Pkce): string {
  const q = new URLSearchParams({
    provider: 'github',
    redirect_to: redirectUri(config),
    code_challenge: pkce.challenge,
    code_challenge_method: 's256',
    // Identity only: this sign-in is who you are, not a GitHub API grant. The
    // repository verbs keep using the token pasted in ⌘K › Credentials.
    scopes: 'read:user'
  })
  return `${config.url}/auth/v1/authorize?${q.toString()}`
}

export type CallbackResult = { kind: 'code'; code: string } | { kind: 'error'; reason: string } | { kind: 'timeout' }

export interface CallbackServer {
  /** Resolves ONCE: the first request to the callback path, or the timeout. */
  result: Promise<CallbackResult>
  close(): void
}

const PAGE = (title: string, body: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:15px -apple-system,system-ui;margin:4em auto;max-width:28em;color:#222"><h1 style="font-size:18px">${title}</h1><p>${body}</p></body>`

/**
 * The one-shot loopback server. 127.0.0.1 only — never 0.0.0.0, so nothing on
 * the network can race the browser to the code. It answers the FIRST request
 * to the callback path and closes; any other path is a 404 and it keeps
 * waiting (a browser's /favicon.ico must not end the sign-in).
 *
 * Resolves `listen`'s failure as a rejection so the caller can name the port:
 * a fixed port is required because Supabase redirects only to URLs on its
 * allow-list, and a random port cannot be listed.
 */
export function startCallbackServer(port: number, timeoutMs: number): Promise<CallbackServer> {
  return new Promise((resolveServer, rejectServer) => {
    let settle: (r: CallbackResult) => void = () => {}
    const result = new Promise<CallbackResult>((r) => { settle = r })
    let done = false
    const finish = (r: CallbackResult): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      settle(r)
      // Let the page's bytes flush before the socket goes.
      setImmediate(() => server.close())
    }
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== CALLBACK_PATH || done) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
        return
      }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', connection: 'close' })
      if (code !== null && code !== '') {
        res.end(PAGE('Signed in', 'You can close this tab and return to Terminal Canvas.'))
        finish({ kind: 'code', code })
      } else {
        res.end(PAGE('Sign-in did not finish', 'Return to Terminal Canvas and try again.'))
        // GitHub's own words, capped: a denied consent reads "access_denied".
        finish({ kind: 'error', reason: (error ?? 'the callback carried no code').slice(0, 200) })
      }
    })
    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs)
    timer.unref?.()
    server.once('error', (e) => { clearTimeout(timer); rejectServer(e) })
    server.listen(port, '127.0.0.1', () => {
      resolveServer({ result, close: () => finish({ kind: 'timeout' }) })
    })
  })
}

/** The fetch this module needs — injected so verify:account records calls instead of making them. */
export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) =>
  Promise<{ status: number; text(): Promise<string> }>

/** What GoTrue's token endpoint answers, parsed and checked — secrets stay in main. */
export interface SupabaseSession {
  accessToken: string
  refreshToken: string
  /** Epoch seconds. */
  expiresAt: number
  userId: string
  githubId: string
  githubLogin: string
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {})

/**
 * The GitHub identity is read from `identities[provider=github]` first — that
 * row is written by GoTrue from GitHub's own answer — and `user_metadata`
 * second. A session with no GitHub id is REFUSED rather than stored under a
 * guessed key: the key is the only thing keeping two people's sessions apart.
 */
export function parseSession(raw: unknown, now: () => number): SupabaseSession | undefined {
  const r = rec(raw)
  const accessToken = str(r['access_token'])
  const refreshToken = str(r['refresh_token'])
  const user = rec(r['user'])
  const userId = str(user['id'])
  if (accessToken === undefined || refreshToken === undefined || userId === undefined) return undefined
  const identities = Array.isArray(user['identities']) ? user['identities'].map(rec) : []
  const gh = rec(identities.find((i) => i['provider'] === 'github')?.['identity_data'])
  const meta = rec(user['user_metadata'])
  const idRaw = gh['provider_id'] ?? gh['sub'] ?? meta['provider_id'] ?? meta['sub']
  const githubId = typeof idRaw === 'number' ? String(idRaw) : str(idRaw)
  if (githubId === undefined || !/^[1-9][0-9]{0,19}$/.test(githubId)) return undefined
  const githubLogin = str(gh['user_name']) ?? str(meta['user_name']) ?? str(meta['preferred_username']) ?? `github:${githubId}`
  const expiresAtRaw = r['expires_at']
  const expiresIn = r['expires_in']
  const expiresAt = typeof expiresAtRaw === 'number' ? expiresAtRaw
    : typeof expiresIn === 'number' ? Math.floor(now() / 1000) + expiresIn
    : Math.floor(now() / 1000) + 3600
  return { accessToken, refreshToken, expiresAt, userId, githubId, githubLogin }
}

export type AuthCall<T> = { ok: true; value: T } | { ok: false; status: number; reason: string }

/**
 * GoTrue/PostgREST's error body as a short reason. Never the request — a
 * request here carries a token or a verifier — and capped, because a proxy's
 * HTML error page is not a sentence.
 */
function reasonOf(status: number, text: string): string {
  let msg: string | undefined
  try {
    const j = rec(JSON.parse(text))
    msg = str(j['error_description']) ?? str(j['msg']) ?? str(j['message']) ?? str(j['error'])
  } catch { /* not JSON */ }
  return `${status}${msg === undefined ? '' : ` ${msg.slice(0, 200)}`}`
}

async function call(fetch: Fetch, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<AuthCall<unknown>> {
  let res: { status: number; text(): Promise<string> }
  try {
    res = await fetch(url, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  } catch {
    // Unbound on purpose, credential-store.ts's reason: a network error's
    // message can quote the request line, and this request carries a secret.
    return { ok: false, status: 0, reason: 'could not reach the account server' }
  }
  const text = await res.text().catch(() => '')
  if (res.status < 200 || res.status >= 300) return { ok: false, status: res.status, reason: reasonOf(res.status, text) }
  if (text === '') return { ok: true, value: null }
  try { return { ok: true, value: JSON.parse(text) as unknown } } catch { return { ok: false, status: res.status, reason: 'the account server answered something that is not JSON' } }
}

export function createAuthClient(config: AccountConfig, fetch: Fetch, now: () => number = Date.now) {
  const base = { apikey: config.anonKey }
  const withSession = (accessToken: string): Record<string, string> => ({ ...base, authorization: `Bearer ${accessToken}` })
  const sessionFrom = (r: AuthCall<unknown>): AuthCall<SupabaseSession> => {
    if (!r.ok) return r
    const s = parseSession(r.value, now)
    return s === undefined ? { ok: false, status: 200, reason: 'the account server answered without a GitHub identity' } : { ok: true, value: s }
  }
  return {
    /** Redeems the loopback's code. Only the holder of the verifier can. */
    exchange: async (code: string, verifier: string) =>
      sessionFrom(await call(fetch, `${config.url}/auth/v1/token?grant_type=pkce`, 'POST', base, { auth_code: code, code_verifier: verifier })),
    refresh: async (refreshToken: string) =>
      sessionFrom(await call(fetch, `${config.url}/auth/v1/token?grant_type=refresh_token`, 'POST', base, { refresh_token: refreshToken })),
    /** `scope=local`: this device's session only, never the person's others. */
    signOut: (accessToken: string) => call(fetch, `${config.url}/auth/v1/logout?scope=local`, 'POST', withSession(accessToken)),
    /** A PostgREST read or write, as the signed-in user — RLS decides what it may touch. */
    rest: (accessToken: string, method: string, path: string, body?: unknown, prefer?: string) =>
      call(fetch, `${config.url}/rest/v1/${path}`, method, { ...withSession(accessToken), ...(prefer === undefined ? {} : { prefer }) }, body),
    rpc: (accessToken: string, fn: string, args: Record<string, unknown>) =>
      call(fetch, `${config.url}/rest/v1/rpc/${fn}`, 'POST', withSession(accessToken), args)
  }
}

export type AuthClient = ReturnType<typeof createAuthClient>

/**
 * An invite code: 20 CSPRNG bytes, base64url, behind a prefix a person can
 * recognise in a chat log. Only `sha256(code)` is ever written anywhere.
 */
export function createInviteCode(random: (n: number) => Buffer = randomBytes): { code: string; hash: string } {
  const code = `tcinv_${b64url(random(20))}`
  return { code, hash: hashInviteCode(code) }
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

export const INVITE_CODE = /^tcinv_[A-Za-z0-9_-]{27}$/
