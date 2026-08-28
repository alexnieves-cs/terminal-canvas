import { execFile } from 'node:child_process'
import type { GitResult, GitRunner } from './review-engine'

/**
 * How long a single git call may take before it is killed. Deliberately
 * generous: `git diff --numstat` over a very large repository with a cold
 * page cache is seconds, not milliseconds, and a ceiling that can fire on a
 * legitimately slow diff would report `baseline-lost` for a repository that
 * is perfectly fine — a confident wrong answer produced by a stopwatch, which
 * is the same class of failure as the maxBuffer note below. Thirty seconds is
 * far above any real diff this app will ask for and far below "forever",
 * which is what the calls had before: `index.lock` contention, a credential
 * prompt on a private remote, or a stalled network filesystem all block
 * indefinitely, and neither of this feature's two callers has anyone to time
 * it out — the capture is fire-and-forget, and the read is an invoke whose
 * reply simply never arrives.
 */
export const GIT_TIMEOUT_MS = 30_000

export interface GitRunnerDeps {
  /**
   * The ABSOLUTE path to git, resolved from the login environment, or null if
   * it could not be found there. A getter rather than a value for the reason
   * PtyManager's getBackend/getTarget are getters: this runner is constructed
   * at module scope, long before resolveShellEnv() has run at whenReady.
   */
  gitPath: () => string | null
  /**
   * The login environment. launchd hands a GUI app a bare one, so git spawned
   * with it cannot find HOME's config or its own helper subcommands reliably.
   */
  env: () => Record<string, string>
  /** Overridable only so verify:review 19c can drive a real timeout. */
  timeoutMs?: () => number
}

/**
 * The one impure half of the review engine, kept in its own module for the
 * reason session-backend.ts is kept out of tmux-args.ts's reach: everything
 * else in this feature then stays in the plain-node verify tier. Its
 * dependencies are INJECTED rather than imported — it must not reach for
 * shell-env.ts itself, which would drag the resolution (and a real login
 * shell probe) into that tier.
 *
 * ASYNC execFile, never execFileSync. TmuxBackend uses sync calls and is
 * right to — they are tiny and bounded. `git diff` on a large repository is
 * neither, and a synchronous call in main blocks every panel's 16ms PTY
 * flush, every IPC reply, and the entire UI.
 */
export function createGitRunner(deps: GitRunnerDeps): GitRunner {
  // One log, once, the tmux-probe.ts treatment the spec asks for. Not per
  // call: `gitMissing` is sticky in review-engine.ts precisely because git
  // does not appear mid-session, and a line per selection change would bury
  // the one that matters.
  let warned = false

  return (args: string[]) =>
    new Promise<GitResult>((resolve) => {
      const bin = deps.gitPath()
      if (bin === null) {
        if (!warned) {
          warned = true
          console.warn(
            '[review] git NOT FOUND on the resolved login PATH — the Changes ' +
              'section will report that git is missing rather than guessing. ' +
              'macOS launches GUI apps with a bare PATH, so a git installed ' +
              'only under /opt/homebrew/bin is invisible unless the login ' +
              'shell exported it.'
          )
        }
        // The same fact an ENOENT would have produced, reached before a
        // process is ever launched. Spawning the bare name `git` here instead
        // is the defect shell-env.ts and tmux-probe.ts exist to prevent.
        resolve({ stdout: '', ok: false, notFound: true })
        return
      }
      const env = deps.env()
      execFile(
        bin,
        args,
        {
          encoding: 'utf8',
          // A diff can legitimately be large. The default 1MB cap would reject
          // it as an error, which would read as baseline-lost — a wrong answer
          // produced by a buffer size.
          maxBuffer: 64 * 1024 * 1024,
          timeout: deps.timeoutMs?.() ?? GIT_TIMEOUT_MS,
          // Only when there is one: an empty object would STRIP the
          // environment rather than inherit it, taking HOME and git's own
          // config with it. Empty is the pre-whenReady state, which no
          // production call can reach.
          ...(Object.keys(env).length > 0 ? { env } : {})
        },
        (error, stdout) => {
          const notFound =
            error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
          resolve({ stdout: stdout ?? '', ok: error === null, notFound })
        }
      )
    })
}
