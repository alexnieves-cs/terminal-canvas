/**
 * M54 — `tc`, the command line. Pure over an injected `connect`, so its exit
 * codes and argv parsing run under plain node in verify:control; tc-main.ts
 * is the four-line entry that supplies the real socket.
 *
 *   tc open [--preset <name|id>] [--cwd <dir>]
 *   tc list | tc focus <id> | tc ping | tc status
 *   tc memory list [--root <dir>] [--limit <n>]
 *   tc memory add --kind <decided|tried|failed|note> --text "…" [--root <dir>]
 *   tc api <github|jira> <METHOD> </path> [body-json] [--panel <id>]
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
  '       tc board add <title…> | tc board done <id>',
  '       tc list',
  '       tc focus <panel-id>',
  '       tc ping',
  '       tc status',
  '       tc memory list [--root <dir>] [--limit <n>]',
  '       tc memory add --kind <decided|tried|failed|note> --text <text> [--root <dir>]',
  '       tc api <github|jira> <METHOD> </path> [body-json] [--panel <id>]',
  '',
  'api exits 1 when the service answered 4xx or 5xx, so a script can test $? — the reply',
  'carries the status and body either way.',
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
    case 'board': {
      // M113. `board add <title words…>` joins the rest as the title — a title
      // is prose, and quoting it is the shell's job, not the user's memory.
      const [op, ...words] = rest
      if (op !== 'add' && op !== 'done') return { kind: 'usage', error: 'board takes add or done' }
      if (op === 'add') {
        const title = words.join(' ').trim()
        if (title === '') return { kind: 'usage', error: 'board add needs a title' }
        return { kind: 'ok', line: JSON.stringify({ verb: 'board', op: 'add', title }) }
      }
      const id = words[0]
      if (id === undefined || id === '' || words.length > 1) return { kind: 'usage', error: 'board done takes one item id' }
      return { kind: 'ok', line: JSON.stringify({ verb: 'board', op: 'done', id }) }
    }
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
    // M87. The broker. Four positional arguments and an optional body, no
    // flags: an agent types this from memory, and a shape with nothing to
    // misspell is the one it gets right. The panel rides from TC_PANEL_ID,
    // set inside every panel, so the audit row names who asked.
    case 'api': {
      // `--panel <id>` anywhere in the arguments; the rest are positional.
      const positional: string[] = []
      let panelFlag: string | undefined
      for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i]!
        if (arg === '--panel') {
          const value = rest[i + 1]
          if (value === undefined || value === '') return { kind: 'usage', error: '--panel needs a panel id' }
          panelFlag = value; i += 1; continue
        }
        positional.push(arg)
      }
      const [service, method, path, body, ...extra] = positional
      if (service === undefined || method === undefined || path === undefined) return { kind: 'usage', error: 'api needs a service, a method and a path' }
      if (extra.length > 0) return { kind: 'usage', error: `unexpected argument ${extra[0]}` }
      // A body must already be JSON: the services take nothing else, and a
      // malformed one is a usage error here rather than a 400 from the wire
      // that reads as the service's fault.
      if (body !== undefined) { try { JSON.parse(body) } catch { return { kind: 'usage', error: 'the body must be JSON' } } }
      const fields: Record<string, string> = { verb: 'api', service, method: method.toUpperCase(), path }
      if (body !== undefined) fields.body = body
      const panelId = panelFlag ?? env['TC_PANEL_ID']
      if (panelId !== undefined && panelId !== '') fields.panelId = panelId
      // M102. The session's token, when this shell is a panel's: main trusts it
      // over any panelId, so an agent cannot borrow another panel's teammate.
      const token = env['TC_PANEL_TOKEN']
      if (token !== undefined && token !== '') fields.token = token
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
      const reply = JSON.parse(raw.trim()) as { ok?: boolean; status?: number }
      io.stdout(`${JSON.stringify(reply)}\n`)
      // A served 4xx/5xx is `ok: true` on the wire (the broker did its job) and
      // exit 1 here: an agent testing $? must not read GitHub's refusal as
      // success (M87's verifier).
      if (reply.ok === true && typeof reply.status === 'number' && reply.status >= 400) return 1
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
