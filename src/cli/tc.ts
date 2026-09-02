/**
 * M54 — `tc`, the command line. Pure over an injected `connect`, so its exit
 * codes and argv parsing run under plain node in verify:control; tc-main.ts
 * is the four-line entry that supplies the real socket.
 *
 *   tc open [--preset <name|id>] [--cwd <dir>]
 *   tc list | tc focus <id> | tc ping
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

export function buildRequest(argv: readonly string[]): { kind: 'ok'; line: string } | { kind: 'usage'; error?: string } {
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
    case 'list':
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
  const built = buildRequest(argv)
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
