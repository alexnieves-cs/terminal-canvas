/**
 * Pure git argv construction and output parsing.
 *
 * Imports NOTHING — not electron, not node-pty, not node:child_process — which
 * is what keeps it in the plain-node verify tier, the same line tmux-args.ts
 * draws against session-backend.ts. The module that actually spawns git is
 * git-runner.ts, and it is deliberately out of this file's reach.
 *
 * Every read is -z. Git's default output QUOTES and backslash-escapes paths
 * containing whitespace or non-ASCII bytes, and encodes a rename as a single
 * brace-infixed field. A line/tab parser is therefore correct for exactly the
 * repositories a developer tests against and wrong for the ones users have.
 * This repo has already paid full price for that class of bug once: the
 * unquoted pane-died redirect made EVERY panel report exit code 1, silently,
 * because every fixture used a space-free path.
 */

export interface NumstatEntry {
  path: string
  added: number
  removed: number
  /** Git writes `-` for both counts on a binary file. Not zero, and not NaN. */
  binary: boolean
  /** Present only for a rename; `path` is the destination. */
  renamedFrom?: string
}

export function buildRepoRootArgs(cwd: string): string[] {
  return ['-C', cwd, 'rev-parse', '--show-toplevel']
}

/**
 * `stash create`, never `stash push`. Create writes a commit object
 * representing the current dirty state and prints its sha, WITHOUT modifying
 * the working tree and WITHOUT adding to the stash list — verified against a
 * scratch repo before this was designed. `push` would do both and would be a
 * catastrophic thing to run underneath a working agent.
 *
 * On a CLEAN tree it prints nothing; the caller falls back to HEAD.
 */
export function buildBaselineArgs(root: string): string[] {
  return ['-C', root, 'stash', 'create']
}

export function buildHeadArgs(root: string): string[] {
  return ['-C', root, 'rev-parse', 'HEAD']
}

/**
 * The baseline commit is UNREFERENCED, so `git gc --prune=now` in that
 * repository destroys it. This is how the engine tells that apart from a
 * generic git failure and reports `baseline-lost` rather than falling back to
 * HEAD — which would silently start blaming the agent for changes that were
 * already there when it started.
 */
export function buildObjectExistsArgs(root: string, sha: string): string[] {
  return ['-C', root, 'cat-file', '-e', sha]
}

export function buildNumstatArgs(root: string, baseline: string): string[] {
  return ['-C', root, 'diff', '--numstat', '-z', baseline]
}

/**
 * Untracked files never appear in `git diff`, and the tempting fix —
 * `git add -N` — MUTATES THE INDEX of a repository an agent may be mid-commit
 * in. `ls-files --others` reads and changes nothing.
 */
export function buildUntrackedArgs(root: string): string[] {
  return ['-C', root, 'ls-files', '-z', '--others', '--exclude-standard']
}

/** Declared here, first called in M9b — the review node renders hunks. */
export function buildFileDiffArgs(root: string, baseline: string, path: string): string[] {
  return ['-C', root, 'diff', baseline, '--', path]
}

export function parseRepoRoot(stdout: string): string | null {
  const trimmed = stdout.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Git terminates every entry with NUL, including the last, so a plain split
 * produces one trailing '' — and filtering on emptiness drops it along with
 * any other empty field the split produces, not only that trailing one.
 */
export function parseNulList(stdout: string): string[] {
  return stdout.split('\0').filter((s) => s !== '')
}

export function parseNumstat(stdout: string): NumstatEntry[] {
  const records = stdout.split('\0')
  const out: NumstatEntry[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record === '') continue
    const tab = record.indexOf('\t')
    if (tab === -1) continue
    const second = record.indexOf('\t', tab + 1)
    if (second === -1) continue
    const addedRaw = record.slice(0, tab)
    const removedRaw = record.slice(tab + 1, second)
    const path = record.slice(second + 1)
    const binary = addedRaw === '-' && removedRaw === '-'
    const added = binary ? 0 : Number(addedRaw)
    const removed = binary ? 0 : Number(removedRaw)
    if (path === '') {
      // A RENAME. Under -z the path field is empty and the two names follow as
      // their own NUL-terminated records. Consuming both here is what stops
      // every subsequent entry being shifted by one.
      const from = records[i + 1]
      const to = records[i + 2]
      if (from === undefined || to === undefined) continue
      i += 2
      out.push({ path: to, added, removed, binary, renamedFrom: from })
      continue
    }
    out.push({ path, added, removed, binary })
  }
  return out
}
