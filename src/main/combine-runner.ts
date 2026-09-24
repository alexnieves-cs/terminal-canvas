import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { GitRunner } from './review-engine'
import { buildContentDiffArgs, buildFullStatusArgs, buildHeadArgs, buildMergeBaseArgs, buildUntrackedArgs } from './git-args'
import { worktreePath } from './worktree'
import { parseApplyConflicts, type CombineRunResult } from '../shared/combine'
import type { CombineInputsResult, LaneFingerprint } from '../shared/integration'

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

/** One lane as a combine reads it — its contribution, and the fingerprint of that contribution. */
type LaneRead =
  | { ok: true; fingerprint: LaneFingerprint; diff: string; untracked: string[] }
  | { ok: false; detail: string }

/**
 * M317. Read one lane's contribution onto `base`: the content diff since its
 * fork (committed + working) and its untracked files, and a fingerprint of
 * exactly those bytes — so a commit of the same content keeps the
 * fingerprint and a one-byte edit does not (integration.ts's rule 1).
 */
export async function readLane(git: GitRunner, lane: string, base: string): Promise<LaneRead> {
  const head = await git(buildHeadArgs(lane))
  if (!head.ok) return { ok: false, detail: firstLine(head.stderr) || 'git could not read the lane' }
  const fork = await git(buildMergeBaseArgs(lane, base))
  if (!fork.ok) return { ok: false, detail: 'no common history with the main tree' }
  const diff = await git(buildContentDiffArgs(lane, fork.stdout.trim()), { bytes: true })
  if (!diff.ok) return { ok: false, detail: firstLine(diff.stderr) || 'git could not read the lane' }
  const others = await git(buildUntrackedArgs(lane))
  const untracked = others.ok ? others.stdout.split('\0').filter((p) => p !== '').sort() : []
  const status = await git(buildFullStatusArgs(lane))
  // The digest is the RESULTING CONTENT of every path the lane changes — never
  // the diff text. A file the agent created is hashed as "untracked" before a
  // commit and as a hunk after it; hashing the diff would call a faithful
  // commit of the checked bytes stale. Path + bytes (or "deleted") is the same
  // either side of a commit.
  const names = await git(['-C', lane, 'diff', '--name-only', '-z', '--no-renames', fork.stdout.trim()])
  const paths = [...new Set([...(names.ok ? names.stdout.split('\0').filter((p) => p !== '') : []), ...untracked])].sort()
  const hash = createHash('sha256')
  for (const p of paths) {
    hash.update(`${p}\0`)
    // A symlink is its TARGET STRING (git's 120000 blob), never the file it points at.
    try { const at = join(lane, p); hash.update(lstatSync(at).isSymbolicLink() ? `\0link:${readlinkSync(at)}` : readFileSync(at)) } catch { hash.update('\0deleted') }
    hash.update('\0')
  }
  return {
    ok: true,
    diff: diff.stdout,
    untracked,
    fingerprint: { lane, head: head.stdout.trim(), digest: hash.digest('hex').slice(0, 16), dirty: !status.ok || status.stdout.trim() !== '' }
  }
}

/** Where a repository's one combine scratch lives — one per repository, reused run to run. */
export function combineScratchPath(worktreesDir: string, root: string): string {
  return worktreePath(worktreesDir, root, 'tc/combine')
}

export function createCombineRunner(deps: CombineRunnerDeps): {
  run: (req: CombineRequest) => Promise<CombineRunResult>
  inputs: (req: CombineRequest) => Promise<CombineInputsResult>
} {
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
    const inputs: LaneFingerprint[] = []
    const patchDir = mkdtempSync(join(tmpdir(), 'tc-combine-'))
    const stop = (lane: string, paths: string[], detail: string): CombineRunResult =>
      ({ kind: 'combined', path: scratch, base, applied, inputs, conflict: { lane, paths, detail } })
    try {
      for (const lane of req.lanes) {
        const read = await readLane(git, lane, base)
        if (!read.ok) return stop(lane, [], read.detail)
        inputs.push(read.fingerprint)
        if (read.diff.trim() !== '') {
          const file = join(patchDir, `${applied.length}.patch`)
          // latin1 in, latin1 out: the bytes git wrote, unchanged (binary hunks included).
          writeFileSync(file, read.diff, 'latin1')
          const put = await git(['-C', scratch, 'apply', '--3way', '--whitespace=nowarn', file])
          if (!put.ok) return stop(lane, parseApplyConflicts(`${put.stdout}\n${put.stderr}`), firstLine(put.stderr) || firstLine(put.stdout))
        }
        const fresh = read.untracked
        const clash = fresh.filter((p) => existsSync(join(scratch, p)))
        // Two lanes each CREATED the file: no merge base to three-way against.
        if (clash.length > 0) return stop(lane, clash, 'both lanes created these files')
        for (const p of fresh) {
          mkdirSync(dirname(join(scratch, p)), { recursive: true })
          // A symlink stays a symlink: copying through it would check a regular file git never tracked.
          const from = join(lane, p)
          if (lstatSync(from).isSymbolicLink()) symlinkSync(readlinkSync(from), join(scratch, p))
          else copyFileSync(from, join(scratch, p))
        }
        // Into the scratch index, so the next lane's --3way sees them as the tree it applies on.
        if (fresh.length > 0) await git(['-C', scratch, 'add', '--', ...fresh])
        applied.push(lane)
      }
      // M317. The combined tree's hash, taken BEFORE any check runs in the
      // scratch (a check's build output must not become part of what was
      // "checked"). Integrate compares the landed tree to this.
      await git(['-C', scratch, 'add', '-A'])
      const tree = await git(['-C', scratch, 'write-tree'])
      return { kind: 'combined', path: scratch, base, applied, inputs, conflict: null, ...(tree.ok ? { tree: tree.stdout.trim() } : {}) }
    } finally {
      rmSync(patchDir, { recursive: true, force: true })
    }
  }

  /** M317. Every lane's fingerprint NOW, against the main tree's HEAD now — the staleness read. Read-only. */
  const inputsOnce = async (root: string, lanes: string[]): Promise<CombineInputsResult> => {
    const head = await git(buildHeadArgs(root))
    if (head.notFound) return { kind: 'git-missing' }
    if (!head.ok) return { kind: 'unreadable', detail: firstLine(head.stderr) || 'git could not read HEAD' }
    const base = head.stdout.trim()
    const out: LaneFingerprint[] = []
    for (const lane of lanes) {
      const read = await readLane(git, lane, base)
      if (read.ok) out.push(read.fingerprint)
    }
    return { kind: 'inputs', root, base, lanes: out }
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
    },
    inputs: (req) => {
      if (typeof req?.root !== 'string' || !req.root.startsWith('/') || !Array.isArray(req.lanes)) {
        return Promise.resolve({ kind: 'unreadable', detail: 'a read names a repository and its lanes' } as CombineInputsResult)
      }
      const lanes = req.lanes.filter((l): l is string => typeof l === 'string' && l.startsWith('/'))
      return deps.commonRootOf(req.root).then((root) => inputsOnce(root, lanes))
    }
  }
}
