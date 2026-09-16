import { join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createPlacesGate, fsRealpath, type PlacesGate } from '../places'
import { createMemoryScope, createScopeResolver } from '../work-scope'
import { laneOfPath } from '../../shared/work-scope'
import type { Stores } from './stores'

/**
 * The authority boundary, wired once: which directories a teammate may touch,
 * and what repository a path belongs to. Main's, never the renderer's — a UI
 * affordance is not an authority boundary — and shared by every door that
 * resolves a cwd (`agent:create`, `preset:spawn`, the board's lane, the skill
 * writers) so there is exactly one answer to judge against.
 */
export interface Places {
  /** THE ONE ANSWER to "is this path in a lane, and of what". */
  laneRootOf(path: string): string | undefined
  gate: PlacesGate
  /** The origin url one level under a place, or null — spawned only for directories that look like roots. */
  originOfDir(dir: string): string | null
  subdirsOf(dir: string): string[]
  isRepoRootDir(dir: string): boolean
  memoryScope: ReturnType<typeof createMemoryScope>
}

export function createPlaces(stores: Stores): Places {
  const { layoutStore, reviewEngine } = stores

  /**
   * M196 (D04). THE ONE ANSWER to "is this path in a lane, and of what".
   *
   * All three wiring sites used to inline `w.path === path` — EXACT equality —
   * so a cwd one directory inside a lane translated nowhere and was judged as
   * its own repository, while the renderer answered the same question with a
   * segment prefix (`Canvas.tsx`'s project-skill refusal). Two authors of one
   * fact, disagreeing only below a lane root, which is where a teammate's shell
   * actually stands.
   *
   * The subject it translates to is the lane RECORD's own `root` — the
   * repository the lane was cut from — and `insidePlace` then judges that root
   * exactly as it judges the lane root today. A teammate whose places do not
   * hold that repository is refused before and after.
   *
   * **It matches on the REAL path, and that is a security line rather than a
   * tidiness one.** `PlacesGate.check` REPLACES the candidate with this answer
   * and never judges the candidate itself, so whatever this matches is what the
   * gate stops looking at. Under the exact equality this replaces, only a lane
   * root could take that substitution and a lane root has no symlink component
   * by construction; with containment the whole subtree can, so a symlink
   * created INSIDE a lane — `ln -s /etc evil`, which an agent working in the
   * lane can do — would otherwise be translated to the repository, found inside
   * a place, and allowed. That is exactly the escape `shared/places.ts`'s own
   * header and `verify:teammates places.2` exist to fence, and containment
   * would have unfenced it below a lane. A path that cannot be resolved is
   * matched as written, which fails CLOSED: no translation, and `insidePlace`
   * then judges the raw path and refuses it.
   */
  const laneRootOf = (path: string): string | undefined => {
    const real = (p: string): string => { try { return fsRealpath(p) } catch { return p } }
    return laneOfPath(real(path), layoutStore.worktrees().map((w) => ({ ...w, path: real(w.path) })))?.root
  }

  // M100. THE PLACES GATE: asked before any spawn resolves a cwd and before a
  // file verb answers for a request that names a teammate.
  const gate = createPlacesGate({
    realpath: fsRealpath,
    teammate: (id) => layoutStore.teammates().find((t) => t.id === id),
    // M114. A lane under userData/worktrees is judged by the repository it forks.
    worktreeRootOf: (path) => laneRootOf(path)
  })

  // M114. The lane a dispatch mints: the repository under the teammate's places
  // (origin read by git, one level deep), the gate on its root, the worktree.
  const originOfDir = (dir: string): string | null => { try { return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || null } catch { return null } }
  const subdirsOf = (dir: string): string[] => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => join(dir, d.name)) } catch { return [] } }

  /**
   * M197. Is this directory a repository ROOT? `.git` as a DIRECTORY is a main
   * worktree and as a FILE is a linked one — both are roots to work in. This
   * is deliberately not a `git` call: the lister asks it of every immediate
   * child of every place, and a subprocess each would turn a ~/work of sixty
   * clones into sixty spawns before a single row is drawn. `originOf` is
   * spawned only for the directories that pass it.
   */
  const isRepoRootDir = (dir: string): boolean => { try { return existsSync(join(dir, '.git')) } catch { return false } }

  /**
   * M196 (D04). THE SCOPE RESOLVER, wired once. `worktrees()` is the record
   * list; `commonRootOf` is git's own answer for a worktree the app never made.
   *
   * M83. The ROOT is resolved HERE, in one place, for every door — the node,
   * the chat's first-send context and the control verb. A chat panel's cwd is
   * often a subdirectory, and keying its memory by that cwd would give the
   * same repository two memories that never see each other, with nothing on
   * screen saying so.
   */
  const scopeResolver = createScopeResolver({
    resolveRepo: (cwd) => reviewEngine.resolveRepo(cwd),
    commonRootOf: (root) => reviewEngine.commonRootOf(root),
    worktrees: () => layoutStore.worktrees()
  })

  return { laneRootOf, gate, originOfDir, subdirsOf, isRepoRootDir, memoryScope: createMemoryScope(scopeResolver) }
}

/**
 * M100. A teammate's memory is its own file, addressed by a `teammate:` key
 * rather than a path. The prefix is checked at BOTH doors (the IPC one and the
 * control one) before the scope resolver is asked, because a resolver handed
 * `teammate:t-3` would try to resolve it as a directory and answer with a
 * confident empty list against a stray key.
 */
export const TEAMMATE_ROOT = 'teammate:'

export function teammateSlug(stores: Stores, root: string): string {
  const id = root.slice(TEAMMATE_ROOT.length)
  return stores.layoutStore.teammates().find((t) => t.id === id)?.memory ?? id
}
