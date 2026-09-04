/**
 * M54 — `tc`, the command line. Pure over an injected `connect`, so its exit
 * codes and argv parsing run under plain node in verify:control; tc-main.ts
 * is the four-line entry that supplies the real socket.
 *
 *   tc open [--preset <name|id>] [--cwd <dir>]
 *   tc list | tc focus <id> | tc ping | tc status
 *   tc memory list [--root <dir>] [--limit <n>]
 *   tc memory add --kind <decided|tried|failed|note> --text "…" [--root <dir>]
 *
 * Exit 0 on ok, 1 on a refusal (the app answered no), 2 when nothing is
 * listening — three answers, because "the app said no" and "there is no
 * app" need different fixes, and a script has to be able to tell them apart
 * without parsing prose. The reply is printed as JSON for the same reason.
 */
export type Connect = (socketPath: string, line: string) => Promise<string>

export interface CliIo {
  stdout: (s: string) => void
  stderr: (s: string) => void
}

export const USAGE = [
  'usage: tc open [--preset <name|id>] [--cwd <dir>]',
  '       tc list',
  '       tc focus <panel-id>',
  '       tc ping',
  '       tc status',
  '       tc memory list [--root <dir>] [--limit <n>]',
  '       tc memory add --kind <decided|tried|failed|note> --text <text> [--root <dir>]',
  '',
  'A memory is kept per repository. --root defaults to the panel\'s own directory',
  '(TC_PANEL_CWD, set inside every panel), resolved to its repository by the app.',
  '',
  'Talks to the running Terminal Canvas over TC_CONTROL_SOCKET (set inside every panel),',
  'or the packaged and dev default socket paths in that order.'
].join('\n')

/** The socket to try: the env var first, then each default that exists. */
export function socketCandidates(env: Record<string, string | undefined>): string[] {
  const out: string[] = []
  const fromEnv = env['TC_CONTROL_SOCKET']
  if (fromEnv !== undefined && fromEnv !== '') out.push(fromEnv)
  const home = env['HOME']
  if (home !== undefined && home !== '') {
    out.push(`${home}/Library/Application Support/Terminal Canvas/control.sock`)
    out.push(`${home}/Library/Application Support/terminal-canvas/control.sock`)
  }
  return out
}

export function buildRequest(argv: readonly string[], env: Record<string, string | undefined> = {}): { kind: 'ok'; line: string } | { kind: 'usage'; error?: string } {
  const [verb, ...rest] = argv
  switch (verb) {
    case 'open': {
      const fields: Record<string, string> = { verb: 'open' }
      for (let i = 0; i < rest.length; i += 1) {
        const flag = rest[i]!
        const value = rest[i + 1]
        if ((flag === '--preset' || flag === '--cwd') && value !== undefined) {
          fields[flag.slice(2)] = value
          i += 1
        } else {
          return { kind: 'usage', error: `unexpected argument ${flag}` }
        }
      }
      return { kind: 'ok', line: JSON.stringify(fields) }
    }
    // M83. The memory verb, and the only CLI verb that writes. Its flags are
    // parsed here rather than passed through, so a typo is a usage error with
    // an exit code rather than a refusal from the app that reads like the
    // memory itself was rejected.
    case 'memory': {
      const [op, ...flags] = rest
      if (op !== 'list' && op !== 'add') return { kind: 'usage', error: 'memory takes list or add' }
      const fields: Record<string, string | number> = { verb: 'memory', op }
      for (let i = 0; i < flags.length; i += 1) {
        const flag = flags[i]!
        const value = flags[i + 1]
        if (value === undefined) return { kind: 'usage', error: `${flag} needs a value` }
        if (flag === '--root' || flag === '--kind' || flag === '--text') { fields[flag.slice(2)] = value; i += 1; continue }
        if (flag === '--limit') {
          const n = Number(value)
          if (!Number.isInteger(n) || n < 1) return { kind: 'usage', error: `--limit takes a whole number of at least 1, not ${value}` }
          fields.limit = n; i += 1; continue
        }
        return { kind: 'usage', error: `unexpected argument ${flag}` }
      }
      // The panel's own directory is the default subject, which is what makes
      // `tc memory add --kind decided --text "…"` work with no --root at all.
      if (fields.root === undefined) {
        const cwd = env['TC_PANEL_CWD'] ?? env['PWD']
        if (cwd !== undefined && cwd !== '') fields.root = cwd
      }
      if (op === 'add') {
        if (fields.kind === undefined) return { kind: 'usage', error: 'memory add needs --kind (decided, tried, failed or note)' }
        if (fields.text === undefined) return { kind: 'usage', error: 'memory add needs --text' }
      }
      return { kind: 'ok', line: JSON.stringify(fields) }
    }
    case 'list':
    case 'status':
    case 'ping':
      return rest.length === 0 ? { kind: 'ok', line: JSON.stringify({ verb }) } : { kind: 'usage', error: `${verb} takes no arguments` }
    case 'focus':
      return rest.length === 1 ? { kind: 'ok', line: JSON.stringify({ verb: 'focus', id: rest[0] }) } : { kind: 'usage', error: 'focus takes exactly one panel id' }
    default:
      return { kind: 'usage' }
  }
}

const notRunning = (error: unknown): boolean => {
  const code = (error as { code?: string }).code
  return code === 'ECONNREFUSED' || code === 'ENOENT' || code === 'ENOTSOCK'
}

export async function runCli(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  connect: Connect,
  io: CliIo
): Promise<number> {
  const built = buildRequest(argv, env)
  if (built.kind === 'usage') {
    if (built.error !== undefined) io.stderr(`tc: ${built.error}\n`)
    io.stderr(`${USAGE}\n`)
    return 1
  }
  const candidates = socketCandidates(env)
  if (candidates.length === 0) {
    io.stderr('tc: no socket path — set TC_CONTROL_SOCKET\n')
    return 2
  }
  let lastError: unknown = null
  for (const path of candidates) {
    try {
      const raw = await connect(path, `${built.line}\n`)
      const reply = JSON.parse(raw.trim()) as { ok?: boolean }
      io.stdout(`${JSON.stringify(reply)}\n`)
      return reply.ok === true ? 0 : 1
    } catch (error: unknown) {
      lastError = error
      if (!notRunning(error)) break
    }
  }
  if (notRunning(lastError)) {
    io.stderr('tc: Terminal Canvas is not running (no control socket answered)\n')
    return 2
  }
  io.stderr(`tc: ${String(lastError)}\n`)
  return 2
}
