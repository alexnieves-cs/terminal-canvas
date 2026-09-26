/**
 * The relay process on the VM: `node main.cjs` under systemd (deploy/). Reads
 * the environment and programs.json (config.ts), wires node-pty, the local JWT
 * check, the share-role RPC and the JSONL audit file into relay.ts, listens.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import * as pty from 'node-pty'
import { createJwtVerifier } from './jwt'
import { createRelay, type ShareRole } from './relay'
import { parsePrograms, ptyEnv, readRelayConfig } from './config'

const fail = (msg: string): never => { console.error(`tc-relay: ${msg}`); process.exit(2) }

const cfg = readRelayConfig(process.env)
if ('error' in cfg) fail(cfg.error)
const config = cfg as Exclude<typeof cfg, { error: string }>

let programsText = ''
try { programsText = readFileSync(config.programsPath, 'utf8') } catch { fail(`cannot read ${config.programsPath}`) }
const parsed = parsePrograms(programsText)
if ('error' in parsed) fail(parsed.error as string)
const programs = parsed as Exclude<typeof parsed, { error: string }>

try { mkdirSync(dirname(config.auditPath), { recursive: true }) } catch { /* the append names the problem */ }

/** workspace_role, asked AS the person — the same RPC server/collab/auth.ts uses, RLS answering. */
const shareRole = async (token: string, shareId: string): Promise<ShareRole | null> => {
  if (config.supabaseUrl === undefined || config.anonKey === undefined) return null
  try {
    const r = await fetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/workspace_role`, {
      method: 'POST',
      headers: { apikey: config.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_share: shareId })
    })
    if (r.status !== 200) return null
    const v = await r.json() as unknown
    return v === 'owner' || v === 'editor' || v === 'viewer' ? v : null
  } catch {
    return null
  }
}

const relay = createRelay({
  verify: createJwtVerifier({
    ...(config.supabaseUrl === undefined ? {} : { supabaseUrl: config.supabaseUrl }),
    ...(config.hsSecret === undefined ? {} : { hsSecret: config.hsSecret })
  }),
  shareRole,
  programs,
  maySpawn: (userId) => config.spawners.has(userId),
  spawn: (spec, { cols, rows }) => pty.spawn(spec.file, spec.args, {
    name: 'xterm-256color', cols, rows, cwd: spec.cwd ?? '/', env: ptyEnv(spec),
    // Bytes, not strings: a UTF-8 sequence split across two reads must reach
    // the ring and the clients whole, and only xterm.js decodes.
    encoding: null
  }) as unknown as ReturnType<Parameters<typeof createRelay>[0]['spawn']>,
  // Synchronous on purpose: a control transfer is on disk before anyone is told of it.
  audit: (row) => appendFileSync(config.auditPath, JSON.stringify(row) + '\n', { mode: 0o640 }),
  log: (line) => console.log(`tc-relay: ${line}`)
})

void relay.listen(config.port, config.address).then((port) => {
  console.log(`tc-relay: listening on ${config.address}:${port}/relay — programs: ${Object.keys(programs).join(', ')}; ${config.spawners.size} may spawn`)
  if (config.spawners.size === 0) console.warn('tc-relay: TC_RELAY_SPAWNERS is empty — nobody can start a session')
})
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void relay.close().then(() => process.exit(0)) })
