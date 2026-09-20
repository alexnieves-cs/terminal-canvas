import { execFile } from 'node:child_process'
import type { GitResult, GitRunner, GitRunOptions } from './review-engine'

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

  return (args: string[], opts?: GitRunOptions) =>
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
        resolve({ stdout: '', ok: false, notFound: true, code: -1, stderr: '' })
        return
      }

      const base = deps.env()
      const overlay = opts?.env
      // Three cases, and the middle one is the trap. With no overlay the old
      // rule stands: pass the login env only when there IS one, since an empty
      // object STRIPS the environment rather than inheriting it, taking HOME
      // and git's own config with it. With an overlay we must always pass an
      // env — so when the login env is empty (the pre-whenReady state, which
      // no production call reaches) we inherit process.env explicitly rather
      // than handing git a one-key environment.
      const env = overlay === undefined
        ? (Object.keys(base).length > 0 ? base : undefined)
        : {
            ...(Object.keys(base).length > 0
              ? base
              : (process.env as Record<string, string>)),
            ...overlay
          }

      execFile(
        bin,
        args,
        {
          // M285. `bytes` reads latin1 (byte-preserving) for the content hash.
          encoding: opts?.bytes === true ? 'latin1' : 'utf8',
          // A diff can legitimately be large. The default 1MB cap would reject
          // it as an error, which would read as baseline-lost — a wrong answer
          // produced by a buffer size.
          maxBuffer: 64 * 1024 * 1024,
          timeout: deps.timeoutMs?.() ?? GIT_TIMEOUT_MS,
          ...(env !== undefined ? { env } : {})
        },
        (error, stdout, stderr) => {
          const err = error as (NodeJS.ErrnoException & { code?: number | string }) | null
          const notFound = err !== null && err.code === 'ENOENT'
          resolve({
            stdout: stdout ?? '',
            ok: error === null,
            notFound,
            // execFile puts the EXIT STATUS in `code` for a normal non-zero
            // exit and an ERRNO STRING there for a spawn failure — the same
            // field, two types. -1 for anything that is not a number, so a
            // caller comparing against 128 can never accidentally match
            // 'ENOENT'.
            code: typeof err?.code === 'number' ? err.code : error === null ? 0 : -1,
            stderr: stderr ?? ''
          })
        }
      )
    })
}
