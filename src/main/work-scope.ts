import { laneOfPath, normaliseScopePath, type LaneRecord, type WorkScope } from '../shared/work-scope'
import type { RepoAnswer } from './review-engine'

/**
 * M196 (D04). THE ONE PLACE THAT ANSWERS "which repository, and which lane".
 *
 * It lives in main because main owns git and owns the worktree records, and
 * because a renderer-side resolver would be a second author of the fact —
 * M83's rule for the memory root, which is exactly what this generalises.
 *
 * Every dependency is injected, so `verify:review` drives all seven arms under
 * plain node against the fake `GitRunner` that suite already has. Nothing here
 * spawns, reads a credential or touches a place: resolution is INSPECTION, and
 * the guide's rule is that inspection is never permission.
 */
export interface ScopeResolverDeps {
  resolveRepo: (cwd: string) => Promise<RepoAnswer>
  /** `--git-common-dir`'s answer: the main tree of whatever this is inside. */
  commonRootOf: (root: string) => Promise<string>
  /** The app's own lanes. Authoritative for the ones it minted, and the ONLY source of a branch. */
  worktrees: () => readonly LaneRecord[]
}

export interface ScopeResolver {
  resolve(cwd: string): Promise<WorkScope>
}

export function createScopeResolver(deps: ScopeResolverDeps): ScopeResolver {
  const resolve = async (cwd: string): Promise<WorkScope> => {
    const path = normaliseScopePath(cwd)
    // A relative path is refused rather than resolved against a guess
    // (`places.ts`'s rule). It is `unavailable` and not `no-repository`:
    // "this is not in a repository" would be a claim about a directory we
    // never identified.
    if (path === null) return { kind: 'unavailable', cwd, reason: cwd.trim() === '' ? 'no directory was given' : `${cwd} is not an absolute path` }

    const answer = await deps.resolveRepo(path)
    if (answer.kind === 'not-a-repo') return { kind: 'no-repository', cwd: path }
    // The arm `memoryRoot` used to spend. git DECLINING — missing, refusing an
    // unowned checkout, a cwd that vanished under a running panel — is not
    // "this directory is its own subject"; it is a different fact with a
    // different fix, and collapsing it wrote a transient failure's memories to
    // a stray file with nothing on screen to say so.
    if (answer.kind === 'unreadable') return { kind: 'unavailable', cwd: path, reason: answer.detail }

    // git's toplevel. Inside a linked worktree this is the LANE — measured,
    // from the lane and from a subdirectory of it — which is the whole reason
    // this module exists.
    const toplevel = normaliseScopePath(answer.root) ?? answer.root

    // The RECORD first. It is authoritative for the lanes this app minted and
    // it is the only thing that knows the branch; git would answer the parent
    // correctly but namelessly.
    const record = laneOfPath(path, deps.worktrees())
    if (record !== undefined) {
      const repository = normaliseScopePath(record.root) ?? record.root
      const lanePath = normaliseScopePath(record.path) ?? record.path
      // TWO guards, and the second was missing in the first cut (the critic
      // found it). A record whose root IS the toplevel is not a lane of
      // anything — a stale record pointing at the repository itself would put
      // a lane line on an ordinary panel. And the record applies only when
      // git's toplevel IS the lane: a NESTED repository inside a lane (a
      // submodule, or a dependency an agent cloned into it) has its own
      // toplevel, and matching on the cwd alone handed it the lane's parent
      // repository — so its memories landed in another project's file, while
      // the identical nested repository under the MAIN worktree correctly got
      // its own. Answering one question two ways depending on the lane is the
      // discrepancy this milestone exists to remove.
      if (repository !== toplevel && lanePath === toplevel) {
        return {
          kind: 'repository',
          cwd: path,
          repository,
          lane: {
            path: lanePath,
            ...(record.branch === undefined ? {} : { branch: record.branch }),
            ...(record.id === undefined ? {} : { worktreeId: record.id })
          }
        }
      }
    }

    // git second, and this arm is what makes an EXTERNALLY created worktree
    // resolve at all: it has no record of ours, so without this every consumer
    // treats it as its own repository. `parseCommonRoot` answers the input
    // root for anything that does not end in `/.git`, which correctly declines
    // a submodule (`.git/modules/x`) rather than inventing a parent for it —
    // the fall-through below is then the right answer, not a missed one.
    const common = normaliseScopePath(await deps.commonRootOf(toplevel)) ?? toplevel
    return common === toplevel
      // The toplevel IS the main tree: an ordinary repository, and it gets no
      // lane. This is the answer for most panels and it must stay this quiet.
      ? { kind: 'repository', cwd: path, repository: toplevel }
      : { kind: 'repository', cwd: path, repository: common, lane: { path: toplevel } }
  }
  return { resolve }
}

/**
 * M83, rewritten at M196. WHICH REPOSITORY REMEMBERS THIS.
 *
 * M83's rule stands and is the reason this is one function: a chat's cwd is
 * usually a subdirectory, and keying memory by whatever each door happened to
 * hold gives one repository several memories that never see each other, every
 * one of them reading as a plausible non-empty list.
 *
 * D04 found the rule had a hole its own shape. `rev-parse --show-toplevel`
 * inside a worktree lane answers the LANE, so a DISPATCHED teammate's
 * `tc memory add`, its first-send context and a memory node opened on its
 * folder all keyed a file under `userData/worktrees/…` — separate from the
 * repository's, and orphaned the moment `worktree:remove` deleted the lane.
 * The scope resolver translates it, exactly as `placesGate` and
 * `repoRootForBrief` already did for their own questions.
 *
 * A lane is a place work HAPPENS, not a subject that remembers: repository
 * memory is repository-wide. Teammate memory stays its own store behind the
 * `teammate:` prefix, and D04 invents no third, task-scoped one.
 *
 * `unavailable` is REFUSED rather than written somewhere. It used to fall
 * through to "use the path", which spends the three arms `resolveRepo` was
 * built with: a transient git failure then wrote to a slug nothing would ever
 * read again, and said nothing.
 */
export type MemoryScopeAnswer =
  | { ok: true; root: string; scope: { repository: string; lane?: string; laneBranch?: string } | undefined }
  | { ok: false; reason: string }

export function createMemoryScope(resolver: ScopeResolver): (path: string) => Promise<MemoryScopeAnswer> {
  return async (path: string): Promise<MemoryScopeAnswer> => {
    if (path === '') return { ok: false, reason: 'a memory needs a repository' }
    const scope = await resolver.resolve(path)
    if (scope.kind === 'unavailable') return { ok: false, reason: `the repository could not be resolved — ${scope.reason}` }
    // A directory git does not own keeps its own path as the key rather than
    // being refused: the store's named refusals are for an ABSENT root, not for
    // a directory outside a repository (M83's rule, unchanged).
    if (scope.kind === 'no-repository') return { ok: true, root: scope.cwd, scope: undefined }
    return {
      ok: true,
      root: scope.repository,
      scope: {
        repository: scope.repository,
        ...(scope.lane === undefined ? {} : { lane: scope.lane.path, ...(scope.lane.branch === undefined ? {} : { laneBranch: scope.lane.branch }) })
      }
    }
  }
}
