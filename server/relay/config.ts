/**
 * The relay's configuration: the environment, and the program allowlist file.
 * Pure — takes the env and the file's text — so verify:relay pins every
 * refusal without a VM.
 *
 *   TC_SUPABASE_URL        https://<project>.supabase.co — JWKS, issuer, share roles
 *   TC_SUPABASE_ANON_KEY   for the share-role RPC; absent: only an owner can attach
 *   TC_RELAY_JWT_SECRET    optional legacy HS256 secret
 *   TC_RELAY_SPAWNERS      comma-separated Supabase user ids allowed to START a
 *                          session; absent or empty: nobody may (attach is still
 *                          open to a share's members)
 *   TC_RELAY_PORT          default 7681
 *   TC_RELAY_ADDRESS       default 127.0.0.1 — TLS terminates in the proxy in front
 *                          (deploy/Caddyfile); the app refuses a non-local ws://
 *   TC_RELAY_PROGRAMS      default /etc/tc-relay/programs.json
 *   TC_RELAY_AUDIT         default /var/log/tc-relay/audit.jsonl
 *
 * programs.json maps a NAME to what runs:
 *   { "shell": { "file": "/bin/bash", "args": ["-l"], "cwd": "/home/tc-relay/work" } }
 * The client only ever sends the name. A pty gets THIS env and nothing of the
 * relay's own — the relay's env holds TC_RELAY_JWT_SECRET, and a `printenv` in
 * a shared shell would hand it to every viewer.
 */
import type { ProgramSpec } from './relay'

export interface RelayConfig {
  supabaseUrl?: string
  anonKey?: string
  hsSecret?: string
  port: number
  address: string
  programsPath: string
  auditPath: string
  spawners: ReadonlySet<string>
}

export function readRelayConfig(env: Record<string, string | undefined>): RelayConfig | { error: string } {
  const val = (k: string): string | undefined => { const v = env[k]?.trim(); return v === undefined || v === '' ? undefined : v }
  const supabaseUrl = val('TC_SUPABASE_URL')
  const hsSecret = val('TC_RELAY_JWT_SECRET')
  if (supabaseUrl === undefined && hsSecret === undefined) return { error: 'set TC_SUPABASE_URL (or TC_RELAY_JWT_SECRET) — no token could be verified' }
  if (supabaseUrl !== undefined && !/^https:\/\/[^/]+/.test(supabaseUrl) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(supabaseUrl)) {
    return { error: 'TC_SUPABASE_URL must be https' }
  }
  const port = Number(val('TC_RELAY_PORT') ?? '7681')
  if (!Number.isInteger(port) || port < 0 || port > 65535) return { error: 'TC_RELAY_PORT is not a port' }
  return {
    ...(supabaseUrl === undefined ? {} : { supabaseUrl }),
    ...(val('TC_SUPABASE_ANON_KEY') === undefined ? {} : { anonKey: val('TC_SUPABASE_ANON_KEY')! }),
    ...(hsSecret === undefined ? {} : { hsSecret }),
    port,
    address: val('TC_RELAY_ADDRESS') ?? '127.0.0.1',
    programsPath: val('TC_RELAY_PROGRAMS') ?? '/etc/tc-relay/programs.json',
    auditPath: val('TC_RELAY_AUDIT') ?? '/var/log/tc-relay/audit.jsonl',
    spawners: new Set((val('TC_RELAY_SPAWNERS') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)))
  }
}

const NAME = /^[a-z][a-z0-9-]{0,31}$/
const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/

export function parsePrograms(text: string): Record<string, ProgramSpec> | { error: string } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { error: 'programs.json is not JSON' } }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: 'programs.json must be an object of name → program' }
  const out: Record<string, ProgramSpec> = Object.create(null) as Record<string, ProgramSpec>
  for (const [name, v] of Object.entries(raw)) {
    if (!NAME.test(name)) return { error: `"${name}" is not a program name (a-z, 0-9, -)` }
    if (typeof v !== 'object' || v === null) return { error: `${name}: not an object` }
    const p = v as Record<string, unknown>
    if (typeof p['file'] !== 'string' || !p['file'].startsWith('/')) return { error: `${name}: "file" must be an absolute path` }
    const args = p['args'] ?? []
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) return { error: `${name}: "args" must be strings` }
    if (p['cwd'] !== undefined && (typeof p['cwd'] !== 'string' || !p['cwd'].startsWith('/'))) return { error: `${name}: "cwd" must be an absolute path` }
    const env = p['env'] ?? {}
    if (typeof env !== 'object' || env === null || !Object.entries(env).every(([k, x]) => ENV_KEY.test(k) && typeof x === 'string')) {
      return { error: `${name}: "env" must map NAMES to strings` }
    }
    out[name] = { file: p['file'], args: args as string[], ...(typeof p['cwd'] === 'string' ? { cwd: p['cwd'] } : {}), env: env as Record<string, string> }
  }
  if (Object.keys(out).length === 0) return { error: 'programs.json allows nothing' }
  return out
}

/** The whole env a pty starts with: a fixed base, then the program's own. Never the relay's. */
export function ptyEnv(spec: ProgramSpec): Record<string, string> {
  return {
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: 'C.UTF-8',
    ...(spec.cwd === undefined ? {} : { HOME: spec.cwd }),
    ...spec.env
  }
}
