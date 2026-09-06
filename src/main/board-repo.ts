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

/** `owner/repo#12` → `owner/repo`; a Jira key (`PROJ-12`) or anything else → null. */
export function repoOfKey(key: string): string | null {
  const m = /^([^/\s#]+\/[^/\s#]+)#\d+$/.exec(key)
  return m === null ? null : (m[1] as string)
}

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
