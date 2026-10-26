import type { GitRunner } from './review-engine'
import { repoFromRemote } from './github-publish'
import { parseMergeTree, type RadarCollision, type RadarLane, type RadarReport } from '../shared/collision-radar'

/**
 * M545. THE COLLISION RADAR FOR A CLOUD LANE — its pull request's head, from
 * GitHub, against every local lane of the same repository: the files both
 * changed, and git's trial merge where they overlap (M479's two levels, for
 * the same reasons).
 *
 * The PR head is not on this Mac, so it is fetched first, into a hidden ref
 * `refs/tc/cloud/<lane id>` of the repository's main tree. That is the one
 * write here, and it is what makes the rest local: a fetch sends nothing but
 * the ref name (so nothing passes `outward`), the ref is outside every branch
 * a person sees, and each scan force-updates it so it never piles up. The
 * fetch never prompts (GIT_TERMINAL_PROMPT=0): a repository whose origin
 * needs a password the keychain does not have is unread, by name.
 *
 * A local lane's side is read as M479 reads it — committed and uncommitted
 * tracked edits from its working tree; the trial merge sees committed work
 * only, and the words say so (`radarWords`).
 */

export interface CloudRadarLane { id: string; repo: string; pr: number }

export interface CloudRadarDeps {
  run: GitRunner
  commonRootOf: (path: string) => Promise<string>
  now?: () => number
}

/** The hidden ref a cloud lane's PR head is fetched into. The id is LANE_ID-shaped. */
export const cloudRef = (laneId: string): string => `refs/tc/cloud/${laneId}`

const nulList = (s: string): string[] => s.split('\0').filter((p) => p !== '')
const NO_PROMPT = { env: { GIT_TERMINAL_PROMPT: '0' } }

export function createCloudRadar(deps: CloudRadarDeps): (cloud: readonly CloudRadarLane[], lanes: readonly RadarLane[]) => Promise<RadarReport> {
  return async (cloud, lanes) => {
    const unread: RadarReport['unread'] = []
    const collisions: RadarCollision[] = []
    const roots = new Map<string, { repo: string | null; main: string | null }>()
    const rootInfo = async (root: string): Promise<{ repo: string | null; main: string | null }> => {
      const known = roots.get(root)
      if (known !== undefined) return known
      const origin = await deps.run(['-C', root, 'remote', 'get-url', 'origin'])
      const main = await deps.run(['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'])
      const info = {
        repo: origin.ok ? repoFromRemote(origin.stdout.trim()) : null,
        main: main.ok && main.stdout.trim() !== '' && main.stdout.trim() !== 'HEAD' ? main.stdout.trim() : null
      }
      roots.set(root, info)
      return info
    }

    // Each local lane: its branch, its main tree, and its changed files.
    type Local = { id: string; root: string; branch: string; files: Set<string>; repo: string }
    const locals: Local[] = []
    for (const lane of lanes) {
      const branch = await deps.run(['-C', lane.path, 'rev-parse', '--abbrev-ref', 'HEAD'])
      if (branch.notFound) { unread.push({ id: lane.id, reason: 'git was not found' }); continue }
      if (!branch.ok || branch.stdout.trim() === '' || branch.stdout.trim() === 'HEAD') { unread.push({ id: lane.id, reason: 'the lane is not on a branch' }); continue }
      const root = await deps.commonRootOf(lane.path)
      const info = await rootInfo(root)
      // Only lanes some cloud lane could collide with are read further.
      if (info.repo === null || !cloud.some((c) => c.repo === info.repo)) continue
      if (info.main === null) { unread.push({ id: lane.id, reason: 'the main tree is not on a branch' }); continue }
      const base = await deps.run(['-C', lane.path, 'merge-base', info.main, 'HEAD'])
      if (!base.ok) { unread.push({ id: lane.id, reason: 'the lane shares no history with the main branch' }); continue }
      const diff = await deps.run(['-C', lane.path, 'diff', '--name-only', '-z', base.stdout.trim()])
      if (!diff.ok) { unread.push({ id: lane.id, reason: 'the lane\'s changes could not be listed' }); continue }
      locals.push({ id: lane.id, root, branch: branch.stdout.trim(), files: new Set(nulList(diff.stdout)), repo: info.repo })
    }

    for (const c of cloud) {
      const siblings = locals.filter((l) => l.repo === c.repo)
      if (siblings.length === 0) continue
      // Fetched once per main tree; lanes of one repository share it.
      const byRoot = new Map<string, Local[]>()
      for (const l of siblings) byRoot.set(l.root, [...(byRoot.get(l.root) ?? []), l])
      for (const [root, group] of byRoot) {
        const ref = cloudRef(c.id)
        const fetched = await deps.run(['-C', root, 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', 'origin', `+refs/pull/${c.pr}/head:${ref}`], NO_PROMPT)
        // git's own words are not repeated: a remote URL with a token in it is
        // exactly what a fetch error prints.
        if (!fetched.ok) { unread.push({ id: c.id, reason: `#${c.pr} could not be fetched from origin — check that this Mac can fetch from it` }); continue }
        const main = (await rootInfo(root)).main as string
        const base = await deps.run(['-C', root, 'merge-base', main, ref])
        if (!base.ok) { unread.push({ id: c.id, reason: `#${c.pr} shares no history with ${main}` }); continue }
        const diff = await deps.run(['-C', root, 'diff', '--name-only', '-z', base.stdout.trim(), ref])
        if (!diff.ok) { unread.push({ id: c.id, reason: `#${c.pr}'s changes could not be listed` }); continue }
        const theirs = new Set(nulList(diff.stdout))
        for (const l of group) {
          const files = [...theirs].filter((f) => l.files.has(f)).sort()
          if (files.length === 0) continue
          const trial = await deps.run(['-C', root, 'merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', l.branch, ref])
          const parsed = trial.notFound ? { kind: 'error' as const } : parseMergeTree(trial.code, trial.stdout)
          collisions.push({ a: c.id, b: l.id, files, conflicts: parsed.kind === 'clean' ? [] : parsed.kind === 'conflicts' ? parsed.files : null })
        }
      }
    }
    return { at: (deps.now ?? Date.now)(), collisions, unread }
  }
}
