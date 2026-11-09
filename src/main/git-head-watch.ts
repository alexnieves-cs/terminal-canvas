import { readFileSync, statSync, watch as fsWatch, type FSWatcher } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * M660. "When the branch moves" for a watcher: the commit HEAD names, not the
 * text of `.git/HEAD`.
 *
 * The first version watched `.git/HEAD` as a file and fired when its content
 * changed. That file is `ref: refs/heads/main` before a commit and after it —
 * a commit moves the ref HEAD points at, never HEAD — so the trigger fired on
 * a checkout and never on the commit it was named for. A linked worktree
 * failed outright: its `.git` is a FILE pointing elsewhere, so `.git/HEAD`
 * did not exist and the watcher was refused as "nothing to watch".
 *
 * So this resolves HEAD to a commit (a loose ref, then packed-refs, in the
 * worktree's own git dir and then the common one) and fires when THAT
 * changes. It reads files rather than running git: it runs on every change
 * under the git dir, and a process per event would be the cost of the watch.
 *
 * Imports node built-ins only; plain-node checked in verify:file.
 */

export interface GitDirs {
  /** The worktree's own git dir: where HEAD lives. */
  gitDir: string
  /** Where the shared refs live; the same as gitDir outside a linked worktree. */
  commonDir: string
}

/** The git dirs of a working tree root, or null when it is not one. */
export function gitDirsOf(root: string): GitDirs | null {
  const dotGit = join(root, '.git')
  let gitDir: string
  try {
    if (statSync(dotGit).isDirectory()) gitDir = dotGit
    else {
      // A linked worktree or a submodule: `.git` is a file, `gitdir: <path>`.
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, 'utf8'))
      if (m === null) return null
      gitDir = isAbsolute(m[1]!) ? m[1]! : resolve(root, m[1]!)
    }
  } catch {
    return null
  }
  let commonDir = gitDir
  try {
    const common = readFileSync(join(gitDir, 'commondir'), 'utf8').trim()
    if (common !== '') commonDir = isAbsolute(common) ? common : resolve(gitDir, common)
  } catch { /* not a linked worktree: the git dir holds its own refs */ }
  return { gitDir, commonDir }
}

const SHA = /^[0-9a-f]{40,64}$/

function readRef(dirs: GitDirs, ref: string): string | null {
  for (const dir of dirs.gitDir === dirs.commonDir ? [dirs.gitDir] : [dirs.gitDir, dirs.commonDir]) {
    try {
      const text = readFileSync(join(dir, ref), 'utf8').trim()
      if (SHA.test(text)) return text
    } catch { /* not loose here */ }
  }
  try {
    for (const line of readFileSync(join(dirs.commonDir, 'packed-refs'), 'utf8').split('\n')) {
      const [sha, name] = line.trim().split(' ')
      if (name === ref && sha !== undefined && SHA.test(sha)) return sha
    }
  } catch { /* no packed refs */ }
  return null
}

/**
 * The commit HEAD names, or a stand-in that still changes when HEAD does: an
 * unborn branch has no commit yet, and is answered by its ref name so the
 * first commit on it reads as a move. Null when HEAD cannot be read at all.
 */
export function headCommit(dirs: GitDirs): string | null {
  let head: string
  try { head = readFileSync(join(dirs.gitDir, 'HEAD'), 'utf8').trim() } catch { return null }
  if (SHA.test(head)) return head
  const m = /^ref:\s*(\S+)$/.exec(head)
  if (m === null) return null
  return readRef(dirs, m[1]!) ?? `unborn:${m[1]}`
}

export interface GitHeadWatch {
  close(): void
}

export interface GitHeadWatchDeps {
  watch?: (dir: string, onEvent: () => void) => FSWatcher
  debounceMs?: number
}

/**
 * Calls `onMove` each time the commit HEAD names changes. Null when `root`
 * is not a git working tree. Watches the common git dir recursively, which
 * holds the worktree's own git dir too (`worktrees/<name>`), so one watcher
 * sees HEAD, the loose ref and packed-refs wherever they live; events are
 * debounced and compared, so object writes and lock files cost a read.
 */
export function watchGitHead(root: string, onMove: () => void, onError: (error: Error) => void, deps: GitHeadWatchDeps = {}): GitHeadWatch | null {
  const dirs = gitDirsOf(root)
  if (dirs === null) return null
  let last = headCommit(dirs)
  if (last === null) return null
  const debounceMs = deps.debounceMs ?? 150
  let timer: NodeJS.Timeout | undefined
  const check = (): void => {
    timer = undefined
    const now = headCommit(dirs)
    // A read that lands mid-update (a ref briefly absent) is not a move.
    if (now === null || now === last) return
    last = now
    onMove()
  }
  const onEvent = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(check, debounceMs)
  }
  const watcher = (deps.watch ?? ((dir, cb) => fsWatch(dir, { persistent: false, recursive: true }, cb)))(dirs.commonDir, onEvent)
  watcher.on('error', (error: Error) => onError(error))
  return {
    close() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      watcher.close()
    }
  }
}
