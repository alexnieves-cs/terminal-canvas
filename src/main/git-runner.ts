import { execFile } from 'node:child_process'
import type { GitResult, GitRunner } from './review-engine'

/**
 * The one impure half of the review engine, kept in its own module for the
 * reason session-backend.ts is kept out of tmux-args.ts's reach: everything
 * else in this feature then stays in the plain-node verify tier.
 *
 * ASYNC execFile, never execFileSync. TmuxBackend uses sync calls and is
 * right to — they are tiny and bounded. `git diff` on a large repository is
 * neither, and a synchronous call in main blocks every panel's 16ms PTY
 * flush, every IPC reply, and the entire UI.
 */
export function createGitRunner(): GitRunner {
  return (args: string[]) =>
    new Promise<GitResult>((resolve) => {
      execFile(
        'git',
        args,
        // A diff can legitimately be large. The default 1MB cap would reject
        // it as an error, which would read as baseline-lost — a wrong answer
        // produced by a buffer size.
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        (error, stdout) => {
          const notFound =
            error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
          resolve({ stdout: stdout ?? '', ok: error === null, notFound })
        }
      )
    })
}
