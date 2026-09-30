import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * M398. Whether a directory IS the home directory, however it is spelled.
 *
 * Two consumers ask, and both were first written as a string compare that the
 * real spellings of home walk straight past: the toolbox fence (`toolboxCwd`,
 * where a miss reads the developer's real `~/.claude` under a harness fence)
 * and the subagent card (`pty-manager`'s `pollLive`, where a miss draws "N
 * panels share this repository" about a folder that is not one). The
 * spellings that missed: a symlinked home (tmux reports the REALPATH, so a
 * `HOME=/Users/me` whose `/Users/me` is a link answers with the target), a
 * case variant (APFS is case-insensitive by default, so `/users/ME` is the
 * same folder on darwin), and `/.` or `..` segments.
 *
 * `resolve()` flattens the segments; the realpath of HOME is compared as well
 * as HOME itself, and cached per home string, because `pollLive` asks every
 * tick and a home's realpath does not move under a running app. The CWD is
 * NOT realpath'd here: the per-tick caller hands it tmux's answer, already a
 * realpath, and the toolbox caller realpaths its own once per read. A
 * relative path is never home: nothing resolves it against the right folder.
 */
const realHomes = new Map<string, string>()

function realHomeOf(home: string): string {
  const cached = realHomes.get(home)
  if (cached !== undefined) return cached
  try {
    const real = realpathSync(home)
    realHomes.set(home, real)
    return real
  } catch {
    // Not cached: a home that does not exist yet (a harness fence created a
    // moment later) is asked again rather than pinned to its unresolved form.
    return resolve(home)
  }
}

export function isHomeDir(
  cwd: string,
  home: string,
  foldCase: boolean = process.platform === 'darwin'
): boolean {
  const spelled = cwd.trim()
  if (spelled === '~' || spelled === '~/') return true
  if (!spelled.startsWith('/') || home === '') return false
  const norm = (p: string): string => {
    const r = resolve(p)
    return foldCase ? r.toLowerCase() : r
  }
  const target = norm(spelled)
  return target === norm(home) || target === norm(realHomeOf(home))
}
