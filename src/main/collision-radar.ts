import type { GitRunner } from './review-engine'
import { parseMergeTree, type RadarCollision, type RadarLane, type RadarReport } from '../shared/collision-radar'

/**
 * M479. The radar's scan: for every pair of lanes in ONE repository, the
 * files both changed, and — only when there is an overlap, since the trial
 * merge is the expensive call — git's trial merge of the two branches.
 *
 * Read-only by construction: `rev-parse`, `merge-base`, `diff --name-only`
 * and `merge-tree --write-tree` (which writes loose objects and nothing a
 * person sees). Injected runner, like lane-merge.ts, so `verify:review
 * radar.*` drives it against real fixture repositories in a temp folder.
 */

export interface RadarDeps {
  run: GitRunner
  /** The MAIN tree of the repository a path belongs to (`ReviewEngine.commonRootOf`). */
  commonRootOf: (path: string) => Promise<string>
  now?: () => number
}

interface LaneRead { id: string; root: string; branch: string; files: Set<string> }

const nulList = (s: string): string[] => s.split('\0').filter((p) => p !== '')

export function createCollisionRadar(deps: RadarDeps): (lanes: readonly RadarLane[]) => Promise<RadarReport> {
  const readLane = async (lane: RadarLane): Promise<LaneRead | { id: string; reason: string }> => {
    const branch = await deps.run(['-C', lane.path, 'rev-parse', '--abbrev-ref', 'HEAD'])
    if (branch.notFound) return { id: lane.id, reason: 'git was not found' }
    if (!branch.ok || branch.stdout.trim() === '' || branch.stdout.trim() === 'HEAD') return { id: lane.id, reason: 'the lane is not on a branch' }
    const root = await deps.commonRootOf(lane.path)
    // Main tree vs lane by git's own answer, never by comparing paths: on a Mac
    // a temp folder is /var/… while git answers /private/var/…, and a string
    // compare there called the main tree a lane.
    const dirs = await deps.run(['-C', lane.path, 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'])
    const [gitDir, commonDir] = dirs.stdout.split('\n').map((l) => l.trim())
    if (!dirs.ok || gitDir === undefined || commonDir === undefined || gitDir === '') return { id: lane.id, reason: 'the lane\'s repository could not be read' }
    if (gitDir === commonDir) return { id: lane.id, reason: 'this is the main tree, not a lane' }
    const main = await deps.run(['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'])
    if (!main.ok || main.stdout.trim() === '' || main.stdout.trim() === 'HEAD') return { id: lane.id, reason: 'the main tree is not on a branch' }
    const base = await deps.run(['-C', lane.path, 'merge-base', main.stdout.trim(), 'HEAD'])
    if (!base.ok) return { id: lane.id, reason: 'the lane shares no history with the main branch' }
    // Against the merge-base, from the WORKING TREE: committed and uncommitted
    // tracked edits both count, because an agent mid-task has not committed yet.
    const diff = await deps.run(['-C', lane.path, 'diff', '--name-only', '-z', base.stdout.trim()])
    if (!diff.ok) return { id: lane.id, reason: 'the lane\'s changes could not be listed' }
    return { id: lane.id, root, branch: branch.stdout.trim(), files: new Set(nulList(diff.stdout)) }
  }

  return async (lanes) => {
    const reads = await Promise.all(lanes.map(readLane))
    const ok = reads.filter((r): r is LaneRead => 'files' in r)
    const unread = reads.filter((r): r is { id: string; reason: string } => 'reason' in r)
    const collisions: RadarCollision[] = []
    for (let i = 0; i < ok.length; i++) {
      for (let j = i + 1; j < ok.length; j++) {
        const a = ok[i], b = ok[j]
        // Only siblings: two repositories never merge into each other, and
        // two panels in one lane are one lane.
        if (a.root !== b.root || a.branch === b.branch) continue
        const files = [...a.files].filter((f) => b.files.has(f)).sort()
        if (files.length === 0) continue
        const trial = await deps.run(['-C', a.root, 'merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', a.branch, b.branch])
        const parsed = trial.notFound ? { kind: 'error' as const } : parseMergeTree(trial.code, trial.stdout)
        collisions.push({ a: a.id, b: b.id, files, conflicts: parsed.kind === 'clean' ? [] : parsed.kind === 'conflicts' ? parsed.files : null })
      }
    }
    return { at: (deps.now ?? Date.now)(), collisions, unread }
  }
}
