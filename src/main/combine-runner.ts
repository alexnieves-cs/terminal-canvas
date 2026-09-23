import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { GitRunner } from './review-engine'
import { buildContentDiffArgs, buildHeadArgs, buildMergeBaseArgs, buildUntrackedArgs } from './git-args'
import { worktreePath } from './worktree'
import { parseApplyConflicts, type CombineRunResult } from '../shared/combine'

/**
 * M311. THE COMBINED TREE — two lanes that pass apart can fail together, and
 * this is where that is found out before a person merges anything.
 *
 * A scratch checkout (detached at the main tree's HEAD, beside the lanes under
 * `worktreesDir`, never inside the repository — worktree.ts's reason) takes
 * each lane's changes IN THE PROPOSED ORDER: the lane's content diff since its
 * fork, applied with `git apply --3way`, then its untracked files copied in.
 * A lane's working changes count, not only its commits, because an agent's
 * lane is usually uncommitted when a person asks "do these combine?".
 *
 * What this never does: touch a lane (every read is `diff`/`ls-files`, the
 * review engine's read-only argv), touch the main tree's branch or index, or
 * run a check itself. The check is the caller's — a watcher in the scratch
 * path, so its output is the same witnessed record every other check keeps
 * (M306) instead of a second capture path here.
 */
export interface CombineRunnerDeps {
  run: GitRunner
  /** The main tree of whatever was asked from (review engine's `commonRootOf`). */
  commonRootOf: (path: string) => Promise<string>
  worktreesDir: string
}

export interface CombineRequest {
  root: string
  /** Lane checkout paths, in the order they should land. */
  lanes: string[]
}

const firstLine = (s: string): string => s.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''

/** Where a repository's one combine scratch lives — one per repository, reused run to run. */
export function combineScratchPath(worktreesDir: string, root: string): string {
  return worktreePath(worktreesDir, root, 'tc/combine')
}

export function createCombineRunner(deps: CombineRunnerDeps): { run: (req: CombineRequest) => Promise<CombineRunResult> } {
  const git = deps.run
  // Two runs for one repository at once would apply into the same scratch;
  // the second waits for the first rather than interleaving patches.
  const chains = new Map<string, Promise<unknown>>()

  const runOnce = async (root: string, req: CombineRequest): Promise<CombineRunResult> => {
    const head = await git(buildHeadArgs(root))
    if (head.notFound) return { kind: 'git-missing' }
    if (!head.ok) return { kind: 'unreadable', detail: firstLine(head.stderr) || 'git could not read HEAD' }
    const base = head.stdout.trim()
    const scratch = combineScratchPath(deps.worktreesDir, root)

    // A fresh scratch every run: a previous run's half-applied conflict must
    // never leak into this one. `remove --force` answers for a registered
    // tree; the rm and `prune` answer for a directory someone deleted by hand.
    if (existsSync(scratch)) await git(['-C', root, 'worktree', 'remove', '--force', scratch])
    rmSync(scratch, { recursive: true, force: true })
    await git(['-C', root, 'worktree', 'prune'])
    mkdirSync(dirname(scratch), { recursive: true })
    const added = await git(['-C', root, 'worktree', 'add', '--detach', scratch, base])
    if (!added.ok) return { kind: 'unreadable', detail: firstLine(added.stderr) || 'git could not create the combine checkout' }

    const applied: string[] = []
    const patchDir = mkdtempSync(join(tmpdir(), 'tc-combine-'))
    try {
      for (const lane of req.lanes) {
        const fork = await git(buildMergeBaseArgs(lane, base))
        if (!fork.ok) {
          return { kind: 'combined', path: scratch, base, applied, conflict: { lane, paths: [], detail: 'no common history with the main tree' } }
        }
        const diff = await git(buildContentDiffArgs(lane, fork.stdout.trim()), { bytes: true })
        if (!diff.ok) return { kind: 'combined', path: scratch, base, applied, conflict: { lane, paths: [], detail: firstLine(diff.stderr) || 'git could not read the lane' } }
        if (diff.stdout.trim() !== '') {
          const file = join(patchDir, `${applied.length}.patch`)
          // latin1 in, latin1 out: the bytes git wrote, unchanged (binary hunks included).
          writeFileSync(file, diff.stdout, 'latin1')
          const put = await git(['-C', scratch, 'apply', '--3way', '--whitespace=nowarn', file])
          if (!put.ok) {
            return { kind: 'combined', path: scratch, base, applied, conflict: { lane, paths: parseApplyConflicts(`${put.stdout}\n${put.stderr}`), detail: firstLine(put.stderr) || firstLine(put.stdout) } }
          }
        }
        const others = await git(buildUntrackedArgs(lane))
        const fresh = others.ok ? others.stdout.split('\0').filter((p) => p !== '') : []
        const clash = fresh.filter((p) => existsSync(join(scratch, p)))
        if (clash.length > 0) {
          // Two lanes each CREATED the file: no merge base to three-way against.
          return { kind: 'combined', path: scratch, base, applied, conflict: { lane, paths: clash, detail: 'both lanes created these files' } }
        }
        for (const p of fresh) {
          mkdirSync(dirname(join(scratch, p)), { recursive: true })
          copyFileSync(join(lane, p), join(scratch, p))
        }
        // Into the scratch index, so the next lane's --3way sees them as the tree it applies on.
        if (fresh.length > 0) await git(['-C', scratch, 'add', '--', ...fresh])
        applied.push(lane)
      }
      return { kind: 'combined', path: scratch, base, applied, conflict: null }
    } finally {
      rmSync(patchDir, { recursive: true, force: true })
    }
  }

  return {
    run: (req) => {
      if (typeof req?.root !== 'string' || !req.root.startsWith('/') || !Array.isArray(req.lanes)) {
        return Promise.resolve({ kind: 'unreadable', detail: 'a combine names a repository and its lanes' } as CombineRunResult)
      }
      const lanes = req.lanes.filter((l): l is string => typeof l === 'string' && l.startsWith('/'))
      // Serialised by the RESOLVED main tree: asked from a lane and from the
      // root, two runs are the same scratch and must not interleave (the critic).
      return deps.commonRootOf(req.root).then((root) => {
        const prior = chains.get(root) ?? Promise.resolve()
        const next = prior.catch(() => undefined).then(() => runOnce(root, { root, lanes }))
        chains.set(root, next)
        return next
      })
    }
  }
}
