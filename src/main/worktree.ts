/**
 * M37. The pure half of "a git worktree per panel": how a worktree is NAMED
 * and WHERE it lives. Imports nothing, for git-args.ts's reason — this is
 * what keeps it in the plain-node verify tier (verify:review). The module
 * that runs git is worktree-manager.ts, deliberately out of this file's
 * reach.
 */

/**
 * `tc/<panelId>-<yyyymmdd-HHMM>`. The panel id is what makes the branch
 * legible in `git branch` beside the canvas; the minute stamp is what keeps a
 * recycled panel id from colliding with the branch a previous panel left
 * behind — `worktree add -b` refuses an existing branch, so without the stamp
 * the second panel ever to take an id could never get a worktree at all.
 * Local time, because the user reads the stamp beside their own clock.
 */
export function worktreeBranch(panelId: string, now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}`
  return `tc/${panelId}-${stamp}`
}

/**
 * A short, stable hash of the repository root, so two repositories that
 * share a basename (`~/work/api` and `~/scratch/api`) get different parents
 * under the app's directory rather than one's worktrees landing inside the
 * other's. Not cryptographic and not meant to be: it disambiguates, and a
 * collision costs a shared parent directory, never a shared worktree.
 */
function rootTag(root: string): string {
  let h = 5381
  for (let i = 0; i < root.length; i += 1) h = ((h * 33) ^ root.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0').slice(0, 6)
}

/**
 * `<worktreesDir>/<basename(root)>-<tag>/<branch with '/' as '-'>`.
 *
 * OUTSIDE the repository, always. Inside it, the worktree would be untracked
 * files in the main checkout's own `git status`, and the review engine's
 * `ls-files --others` would list a sibling agent's whole worktree as THIS
 * agent's new files. The leaf has no `/` because a branch name does and a
 * path component cannot.
 */
export function worktreePath(worktreesDir: string, root: string, branch: string): string {
  const base = root.replace(/\/+$/, '').split('/').pop() || 'repo'
  const leaf = branch.replace(/\//g, '-')
  return `${worktreesDir}/${base}-${rootTag(root)}/${leaf}`
}
