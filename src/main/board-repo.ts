/**
 * M114. WHERE A WORK ITEM'S REPOSITORY LIVES, under a teammate's places.
 *
 * A GitHub item names its repository (`owner/repo#N`); a teammate names
 * folders it may touch. Dispatch needs the one clone of that repository the
 * teammate is allowed into, and neither record says which — so this looks,
 * in MAIN (only main can read a remote url), at each place and its immediate
 * children, and matches the origin url normalised to `owner/repo`. Immediate
 * children and no deeper: a place is typically `~/work` holding many clones,
 * and a walk past one level turns a dispatch into a filesystem crawl.
 *
 * Pure over two injected readers (`originOf`, `subdirs`), so
 * `verify:file lane.1` drives it with a table under plain node.
 */

export interface RepoLookupDeps {
  /** `git -C <dir> remote get-url origin`'s answer, or null when the dir is no repository or has no origin. */
  originOf: (dir: string) => string | null
  /** The immediate child directories of a dir (absolute); [] when unreadable. */
  subdirs: (dir: string) => string[]
}

export { repoOfKey } from '../shared/work-items'

/**
 * `git@github.com:Acme/Canvas.git`, `https://github.com/acme/canvas`,
 * `ssh://git@github.com/acme/canvas.git` → `acme/canvas`. Lower-cased,
 * because GitHub's names are case-insensitive and an origin typed by hand
 * keeps whatever case the user typed.
 */
export function normaliseOrigin(url: string): string | null {
  const trimmed = url.trim().replace(/\.git$/i, '').replace(/\/+$/, '')
  const m = /[:/]([^/:]+\/[^/:]+)$/.exec(trimmed)
  return m === null ? null : (m[1] as string).toLowerCase()
}

/** The first directory — a place itself, then its immediate children, in place order — whose origin names `repo`. */
export function findRepoUnderPlaces(repo: string, places: readonly string[], deps: RepoLookupDeps): string | null {
  const want = repo.toLowerCase()
  const matches = (dir: string): boolean => {
    const origin = deps.originOf(dir)
    return origin !== null && normaliseOrigin(origin) === want
  }
  for (const place of places) {
    if (matches(place)) return place
    for (const child of deps.subdirs(place)) if (matches(child)) return child
  }
  return null
}

/**
 * M197. The newest kept is not the rule here — a place with more clones than
 * this is a folder of archives, and the flow's field is a choice, not a
 * history. Truncated rather than refused: a start that could have happened
 * must not fail over a folder's size.
 */
export const REPO_LIST_MAX = 60

export interface RepoListDeps extends RepoLookupDeps {
  /** true when `dir` is itself the ROOT of a git worktree — not merely a directory inside one. */
  isRepoRoot: (dir: string) => boolean
}

/**
 * M197 (D05). EVERY repository under a teammate's places, for the start
 * flow's repository field — the same bounded one-level walk
 * `findRepoUnderPlaces` makes, asked for all of them rather than the first
 * match, so the two answers can never disagree about what is reachable.
 *
 * A repository with NO origin is kept with `repo: null`. It is still a
 * repository to work in, and dropping it would make a local-only checkout
 * invisible with nothing on screen to say why — the failure this repo's
 * "a row that disappears is indistinguishable from a feature that was never
 * built" rule exists for. `originOf` answers null for a non-repository AND
 * for a repository with no origin, which is why `isRepoRoot` is a SECOND
 * reader rather than a widening of the first: two facts, two questions.
 */
export function repositoriesUnderPlaces(places: readonly string[], deps: RepoListDeps): { path: string; repo: string | null }[] {
  const out: { path: string; repo: string | null }[] = []
  const seen = new Set<string>()
  const consider = (dir: string): void => {
    if (out.length >= REPO_LIST_MAX || seen.has(dir) || !deps.isRepoRoot(dir)) return
    seen.add(dir)
    const origin = deps.originOf(dir)
    out.push({ path: dir, repo: origin === null ? null : normaliseOrigin(origin) })
  }
  for (const place of places) {
    if (out.length >= REPO_LIST_MAX) break
    consider(place)
    for (const child of deps.subdirs(place)) {
      if (out.length >= REPO_LIST_MAX) break
      consider(child)
    }
  }
  return out
}

/**
 * M197. The `board:repositories` arm decision, HERE rather than inline in
 * `main/index.ts`, because no suite bundles `index.ts` — the extraction is
 * what makes the door checkable (M196's own lesson, reached again).
 *
 * Three arms and not two. An unknown teammate is refused by name; a teammate
 * with NO PLACES is `no-places`, whose fix is a folder and a grant; a real
 * answer whose list is EMPTY means the places hold no repository, whose fix
 * is a clone. Collapsing the last two tells the user the wrong fix, which is
 * the whole reason this repository writes three-state results.
 */
export function repositoriesAnswer(
  mate: { name: string; places: readonly string[] } | undefined,
  deps: RepoListDeps
): { kind: 'repos'; repos: { path: string; repo: string | null }[] } | { kind: 'no-places'; reason: string } | { kind: 'refused'; reason: string } {
  if (mate === undefined) return { kind: 'refused', reason: 'no teammate is called that — it may have been deleted; open the Teammates pane' }
  if (mate.places.length === 0) return { kind: 'no-places', reason: `${mate.name} has no places — add a folder in the Teammates pane before it can work anywhere` }
  return { kind: 'repos', repos: repositoriesUnderPlaces(mate.places, deps) }
}
