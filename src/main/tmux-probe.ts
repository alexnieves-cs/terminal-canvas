import { execFile } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDirectBackend, createTmuxBackend, type SessionBackend } from './session-backend'
import { whichFromEnv } from './shell-env'
import { buildTmuxConf, isSupportedTmuxVersion, parseTmuxVersion } from './tmux-args'

/**
 * Which backend, and why. The `reason` is user-facing when kind is 'direct' —
 * the HUD shows it — so it must name the actual cause rather than say
 * "unavailable".
 */
export interface BackendChoice {
  kind: 'tmux' | 'direct'
  reason: string
  tmuxPath: string | null
}

/**
 * Pure, so verify:tmux can cover every branch without a tmux on the machine.
 *
 * Everything unusable degrades to 'direct' rather than throwing: a missing
 * optional dependency must cost one feature, not the app. The one rule is that
 * uncertainty degrades — an unreadable version is treated as unusable, never as
 * good enough, because the alternative is running against a tmux whose hook
 * behaviour we have never tested and discovering it through a hung panel.
 */
export function chooseBackend(i: {
  tmuxPath: string | null
  versionOutput: string | null
}): BackendChoice {
  if (!i.tmuxPath) {
    return {
      kind: 'direct',
      reason: 'tmux not found on the login shell PATH',
      tmuxPath: null
    }
  }
  const version = parseTmuxVersion(i.versionOutput ?? '')
  if (!version) {
    return {
      kind: 'direct',
      reason: `tmux at ${i.tmuxPath} did not report a readable version`,
      tmuxPath: null
    }
  }
  if (!isSupportedTmuxVersion(version)) {
    return {
      kind: 'direct',
      reason: `tmux ${version.major}.${version.minor} is older than the required 3.0`,
      tmuxPath: null
    }
  }
  return { kind: 'tmux', reason: `tmux ${version.raw}`, tmuxPath: i.tmuxPath }
}

function tmuxVersionOutput(tmuxPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(tmuxPath, ['-V'], { timeout: 5000 }, (error, stdout) => {
      resolve(error && !stdout ? null : stdout)
    })
  })
}

/**
 * Run once at startup, next to resolveShellEnv() and for the same reason: the
 * answer cannot change during a run, and every panel needs it.
 *
 * Uses whichFromEnv against the LOGIN env, not process.env. A macOS GUI app is
 * launched by launchd with a bare PATH, so /opt/homebrew/bin/tmux is not on it
 * — the identical defect that makes `claude` "command not found" inside the
 * app. Resolving by absolute path here is what stops M4c inheriting it.
 */
export async function probeTmux(
  env: Record<string, string>,
  userDataDir: string
): Promise<SessionBackend> {
  const found = whichFromEnv('tmux', env)
  const versionOutput = found ? await tmuxVersionOutput(found) : null
  const choice = chooseBackend({ tmuxPath: found, versionOutput })

  if (choice.kind === 'direct' || !choice.tmuxPath) {
    // Loud on purpose, in the same voice shell-env.ts uses for its own
    // fallback. A silent degradation here means the user learns their agent
    // did not survive the reload by losing work.
    console.warn(
      `[tmux] ${choice.reason}. Panels will spawn directly, and their processes ` +
        `will NOT survive a reload (Cmd+R / Cmd+W). Install tmux 3.0+ to enable ` +
        `session persistence.`
    )
    return createDirectBackend(choice.reason)
  }

  // Per-run directory: the hook writes exit codes here and nothing in it
  // outlives the app. Cleared on the way in as well as on shutdown, so a hard
  // crash cannot leave a stale code to be read as a fresh one.
  const exitDir = join(userDataDir, 'tmux-exits')
  rmSync(exitDir, { recursive: true, force: true })
  mkdirSync(exitDir, { recursive: true })

  // Generated rather than shipped: the pane-died hook embeds exitDir, which is
  // unknowable until app.getPath('userData') can be called.
  const confPath = join(userDataDir, 'tmux.conf')
  writeFileSync(confPath, buildTmuxConf(exitDir))

  console.log(`[tmux] ${choice.reason} at ${choice.tmuxPath}; sessions will survive a reload`)
  return createTmuxBackend({
    tmuxPath: choice.tmuxPath,
    exitDir,
    confPath,
    reason: choice.reason
  })
}
