import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { userInfo } from 'node:os'

/**
 * macOS GUI apps are launched by launchd, not by a login shell, so they inherit
 * a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin) and none of the user's dotfile
 * exports. That is why `claude` and `codex` resolve fine in Terminal.app but
 * come back "command not found" inside an Electron app.
 *
 * Fix: ask the real login shell what its environment looks like, once, at
 * startup, and use that for every PTY we spawn.
 */

const DELIMITER = '__TERMINAL_CANVAS_ENV__'
const TIMEOUT_MS = 5000

let cached: Record<string, string> | null = null

/** Vars that describe the probe shell itself and would mislead a child process. */
const DROP = new Set(['_', 'SHLVL', 'PWD', 'OLDPWD', 'TMPDIR__PROBE'])

function parseEnvBlock(stdout: string): Record<string, string> {
  const start = stdout.indexOf(DELIMITER)
  const end = stdout.lastIndexOf(DELIMITER)
  if (start === -1 || end === -1 || start === end) return {}

  const block = stdout.slice(start + DELIMITER.length, end)
  const env: Record<string, string> = {}
  let currentKey: string | null = null

  // `env` output is KEY=VALUE per line, but values may themselves contain
  // newlines. Any line without a leading KEY= is a continuation of the previous.
  for (const line of block.split('\n')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (match) {
      currentKey = match[1]
      env[currentKey] = match[2]
    } else if (currentKey !== null) {
      env[currentKey] += `\n${line}`
    }
  }

  for (const key of DROP) delete env[key]
  return env
}

function runLoginShell(shell: string): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    // -i (interactive) is what makes zsh read .zshrc, where most PATH edits live.
    // -l (login) picks up .zprofile / .zlogin. -c runs our probe and exits.
    const command = `echo ${DELIMITER}; env; echo ${DELIMITER}`

    execFile(
      shell,
      ['-ilc', command],
      {
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          // Stop oh-my-zsh / nvm style startup prompts from blocking the probe.
          DISABLE_AUTO_UPDATE: 'true',
          TERM: 'dumb'
        }
      },
      (error, stdout) => {
        const parsed = parseEnvBlock(stdout)
        // A non-zero exit is common (a noisy rc file), but if we still got a
        // valid delimited block with a PATH, the probe succeeded.
        if (parsed.PATH) return resolve(parsed)
        reject(error ?? new Error('login shell produced no PATH'))
      }
    )
  })
}

/**
 * Resolve the login-shell environment once and cache it.
 * Safe to await repeatedly; only the first call spawns a shell.
 */
/**
 * M48. What the probe found, for the environment report. Recorded beside the
 * cache rather than re-derived: the failure used to be swallowed into a
 * process.env fallback with a console.error nobody sees, and the user-visible
 * consequence was "command not found" in every panel with no explanation.
 */
let outcome: { path: string; ok: boolean; reason?: string } = { path: '', ok: true }
export function shellProbeOutcome(): { path: string; ok: boolean; reason?: string } {
  return { ...outcome }
}

/** M107. What the probe DID: the shells asked, and whether the shell answered at all. */
let probed: { shells: string[]; timedOut: boolean } = { shells: [], timedOut: false }
export function shellProbeFacts(): { shells: string[]; timedOut: boolean } {
  return { shells: [...probed.shells], timedOut: probed.timedOut }
}

/**
 * M107. `Check again`: ask the shell once more, into a LOCAL, and replace the
 * cached answer only when the probe succeeds. Clearing the cache first was
 * wrong twice over: a failed re-probe (the case Check again exists for) wrote
 * `process.env` — launchd's bare PATH — over the login environment every
 * later PTY reads, and a create racing the empty cache ran a second login
 * shell. `probed`/`outcome` always report the latest probe.
 */
export async function reprobeShellEnv(): Promise<Record<string, string>> {
  const before = cached
  cached = null
  const next = await probe()
  if (!outcome.ok && before) cached = before
  return cached ?? next
}

export async function resolveShellEnv(): Promise<Record<string, string>> {
  if (cached) return cached
  return probe()
}

async function probe(): Promise<Record<string, string>> {

  const shell = process.env.SHELL || userInfo().shell || '/bin/zsh'
  probed = { shells: [shell], timedOut: false }

  try {
    const resolved = await runLoginShell(shell)
    cached = resolved
    outcome = { path: shell, ok: true }
    console.log(
      `[shell-env] resolved from ${shell}: ${Object.keys(resolved).length} vars, ` +
        `PATH has ${resolved.PATH.split(':').length} entries`
    )
  } catch (error) {
    // Loud on purpose. A silent fallback here is exactly how you end up
    // debugging "claude: command not found" for an hour.
    console.error(
      `[shell-env] FAILED to resolve login environment from ${shell}. ` +
        `CLIs installed via dotfile PATH edits (claude, codex, nvm shims) will ` +
        `NOT be found. Falling back to process.env.`,
      error
    )
    cached = { ...process.env } as Record<string, string>
    // A killed probe (the timeout) is "the shell didn't answer" — a slow or
    // prompting rc file — and must never read as "not installed" downstream.
    const killed = typeof error === 'object' && error !== null && ((error as { killed?: boolean }).killed === true || (error as { signal?: string }).signal === 'SIGTERM')
    probed = { shells: [shell], timedOut: killed }
    outcome = { path: shell, ok: false, reason: killed ? `the login shell ${shell} did not answer within ${TIMEOUT_MS / 1000}s` : error instanceof Error ? error.message : String(error) }
  }

  return cached
}

/**
 * Build the env for a specific PTY: login shell env, then our terminal
 * declarations, then any per-panel overrides.
 */
export function buildPtyEnv(
  base: Record<string, string>,
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    ...base,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...overrides
  }
}

/** Diagnostic used by the startup log to prove the PATH fix worked. */
export function whichFromEnv(binary: string, env: Record<string, string>): string | null {
  const path = env.PATH
  if (!path) return null
  for (const dir of path.split(':')) {
    if (!dir) continue
    const candidate = `${dir}/${binary}`
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}
