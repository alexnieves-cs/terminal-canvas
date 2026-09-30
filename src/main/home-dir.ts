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

/**
 * M403 (the boundary critic). Whether a PLACE is everything the person owns:
 * home or the filesystem root, judged on the place's REALPATH. `isHomeDir`
 * alone does not resolve the cwd (see above), so a link `/tmp/h → $HOME`
 * walked past the first work form's home refusal and a mint granted all of
 * home. `.native` so the answer carries the disk's own case; a folder that
 * does not exist is judged as spelled (nothing to follow).
 */
export function wholeMachinePlace(
  place: string,
  home: string,
  realpath: (p: string) => string = realpathSync.native
): 'home' | 'root' | null {
  if (!place.startsWith('/')) return isHomeDir(place, home) ? 'home' : null
  let real: string | undefined
  try { real = realpath(place) } catch { real = undefined }
  const judged = real ?? resolve(place)
  if (judged === '/' || resolve(place) === '/') return 'root'
  return isHomeDir(judged, home) || isHomeDir(place, home) ? 'home' : null
}

/**
 * The two facts `git:status` adds for a task's mint (M403): the realpath the
 * grant is made on, and whether that realpath is home. Here, not inline in
 * the handler, so a plain-node check can hand it a fake home.
 */
export function statusPlaceFacts(root: string, home: string): { real?: string; home?: true } {
  let real: string | undefined
  try { real = realpathSync(root) } catch { real = undefined }
  return { ...(real === undefined ? {} : { real }), ...(wholeMachinePlace(root, home) === 'home' ? { home: true as const } : {}) }
}

/**
 * main's refusal of a teammate save that ADDS home or `/` as a place (M403).
 * main is the authority: the renderer's form refuses first, but `teammate:save`
 * takes any absolute folder from any caller. Only places the stored record
 * does not already hold are judged — a layout saved before this rule may hold
 * home, and it still loads (the parser is unchanged) and still re-saves (a
 * rename must not throw on a place the person granted earlier). Removing it is
 * the person's, in the Teammates pane.
 */
export function teammatePlaceRefusal(
  next: { places: readonly string[] },
  prev: { places: readonly string[] } | undefined,
  home: string,
  realpath?: (p: string) => string
): string | null {
  const held = new Set(prev?.places ?? [])
  for (const place of next.places) {
    if (held.has(place)) continue
    const whole = wholeMachinePlace(place, home, realpath)
    if (whole === 'home') return `${place} is your home folder — a teammate would be granted everything in it; choose a project folder`
    if (whole === 'root') return `${place} is the filesystem root — a teammate would be granted the whole disk; choose a project folder`
  }
  return null
}
