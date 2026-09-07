/**
 * M128. The only code in this repository that puts bytes into `~/.claude`.
 *
 * `docs/ideas-backlog.md` #26 deferred the editing half wholesale; spec §5.1
 * narrows that refusal rather than dropping it. A skill's `SKILL.md` is
 * writable because a skill is INVOKED DELIBERATELY. A hook is arbitrary code
 * that fires by itself, a permission grants without asking, an MCP server is
 * a process with its own reach, an agent's `tools:` line is a permission
 * surface wearing markdown's clothes and a slash command can carry shell —
 * so none of those are writable here, and this module enforces the line by
 * refusing any target whose basename is not `SKILL.md`.
 *
 * CONTAINMENT IS M100's `insidePlace`, REUSED. It already decides on the
 * REAL, normalised path with an injected `realpath`, and `..` walking out of
 * a prefix that looked right, a symlink inside the root pointing out, and a
 * relative path refused rather than resolved against a guess are each
 * already a check there (`verify:teammates places.1–.3`). A second
 * path-containment implementation is the duplicate this repository has
 * refused every time it has come up, and this one would be a security
 * boundary.
 *
 * Every dependency is INJECTED for the reason `credential-store.ts` injects
 * its crypto: every refusal path then runs under plain node in
 * `verify:toolbox`, including the ones that must never reach a real disk.
 * `trash` is `shell.trashItem` at runtime — this file never unlinks, and
 * `verify:toolbox edit.5g` pins that as source text, because the Finder is
 * the undo (spec §5.5: a file write is not history, and `Cmd+Z` never
 * reverts one).
 */

import { renameSync, writeFileSync, statSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { insidePlace, normalisePath, type Realpath } from '../shared/places'
import { staleRefusal, type ReadStamp, type SkillWriteResult } from '../shared/skill-edit'

export type { SkillWriteResult }

export interface SkillWriteDeps {
  realpath: Realpath
  /** `~/.claude/skills` and `<repo>/.claude/skills` — the only writable prefixes. */
  skillRoots: readonly string[]
  /** The ENABLED plugins, as `listPlugins` answered. A target under one is refused by NAME. */
  pluginPaths: readonly { id: string; installPath: string }[]
  /** `shell.trashItem` at runtime; a recorder in the suite. */
  trash: (path: string) => Promise<void>
  /**
   * The atomic step, injectable ONLY so `verify:toolbox edit.2` can fail it:
   * a failed rename is the one road to the half-written state this module
   * exists to make unreachable, and there is no other way to drive it.
   */
  rename?: ((from: string, to: string) => void) | undefined
}

const SKILL_FILE = 'SKILL.md'

/** The frontmatter a new skill starts with — the two fields every reader asks for. */
export function skillStub(name: string): string {
  return `---\nname: ${name}\ndescription: \n---\n\n`
}

/**
 * The gate every writer passes, in the order the refusals must be READ in.
 *
 * The plugin arm runs BEFORE containment deliberately: a plugin's skills
 * folder is not under `~/.claude/skills`, so the generic containment refusal
 * would fire first and tell the user the wrong thing — "outside every
 * writable folder" instead of "`superpowers` owns this folder and your edit
 * will vanish on the next upgrade", which is the useful sentence.
 */
function absoluteOrPlugin(candidate: string, deps: SkillWriteDeps): string | null {
  const norm = normalisePath(candidate)
  if (norm === null) {
    return `${candidate} is not an absolute path — a skill is written by its own full path, never resolved against a root this app would have to guess`
  }
  for (const plugin of deps.pluginPaths) {
    if (insidePlace(norm, [plugin.installPath], deps.realpath)) {
      return `${plugin.id} owns this folder; claude plugin install will discard the edit on the next upgrade`
    }
  }
  return null
}

function gate(candidate: string, deps: SkillWriteDeps): string | null {
  const early = absoluteOrPlugin(candidate, deps)
  if (early !== null) return early
  const norm = normalisePath(candidate) as string
  if (!insidePlace(norm, deps.skillRoots, deps.realpath)) {
    return `${norm} is outside every skills folder this app may write — only ~/.claude/skills and a repository's own .claude/skills are writable`
  }
  return null
}

/**
 * Atomic, always: a temp file in the SAME directory (a cross-device rename is
 * not atomic and is not a rename), then `renameSync` —
 * `layout-store.ts`/`credential-store.ts`/`diagnostics-export.ts`'s shared
 * rule. A partial `SKILL.md` is a skill the CLI will half-load.
 */
function atomicWrite(path: string, text: string, deps: SkillWriteDeps): string | null {
  const tmp = join(dirname(path), `.${basename(path)}.tc-${process.pid}-${Date.now()}.tmp`)
  try {
    writeFileSync(tmp, text)
  } catch (error) {
    // Nothing to clean: the temp file is what failed to appear.
    return String(error)
  }
  try {
    ;(deps.rename ?? renameSync)(tmp, path)
    return null
  } catch (error) {
    // rmSync, never an unlink — see this module's header. The temp file must
    // not be left beside the user's file looking like a stray half-skill.
    try {
      rmSync(tmp, { force: true })
    } catch {
      // Best effort: the answer below is already `failed`, and a temp file we
      // could not remove does not change the fix.
    }
    return String(error)
  }
}

function stampOf(path: string): ReadStamp {
  const st = statSync(path)
  return { mtimeMs: st.mtimeMs, size: st.size }
}

/**
 * Write one `SKILL.md`, refusing the stale case by name.
 *
 * `stamp` is what the panel READ. An agent editing this very file while the
 * panel holds it open is the ordinary case here, not an edge case, and a
 * blind write destroys the agent's edit with no symptom on either side.
 */
export async function writeSkill(
  path: string,
  text: string,
  stamp: ReadStamp,
  deps: SkillWriteDeps
): Promise<SkillWriteResult> {
  if (basename(path) !== SKILL_FILE) {
    return {
      kind: 'refused',
      why: `only a skill's ${SKILL_FILE} is writable — agents, commands, hooks, permissions and MCP servers are read here and written by the CLI`
    }
  }
  const refusal = gate(path, deps)
  if (refusal !== null) return { kind: 'refused', why: refusal }
  let current: ReadStamp
  try {
    current = stampOf(path)
  } catch (error) {
    return { kind: 'failed', why: `the file could not be read before writing — ${String(error)}` }
  }
  if (current.mtimeMs !== stamp.mtimeMs || current.size !== stamp.size) {
    // The refusal keeps the user's text on screen; the renderer never clears
    // its draft on a refusal. Never last-write-wins, never a merge.
    return { kind: 'refused', why: staleRefusal() }
  }
  const failed = atomicWrite(path, text, deps)
  if (failed !== null) return { kind: 'failed', why: failed }
  try {
    // The NEW stamp, answered so the panel's next save is not instantly stale
    // against its own write — the one way this refusal could become a trap.
    return { kind: 'written', stamp: stampOf(path) }
  } catch (error) {
    return { kind: 'failed', why: `the write landed but could not be re-stat'd — ${String(error)}` }
  }
}

/** Scaffold `<root>/<name>/SKILL.md`, refusing an existing name BY THAT NAME. */
export async function createSkill(
  root: string,
  name: string,
  deps: SkillWriteDeps
): Promise<SkillWriteResult> {
  if (name === '' || name.includes('/') || name === '.' || name === '..') {
    return { kind: 'refused', why: `${name === '' ? '(no name)' : name} is not a skill name — a skill is one folder, so its name carries no separator` }
  }
  // A FIRST-EVER skill. `~/.claude/skills` does not exist on a machine that
  // has never had one, `realpath` throws for it, and `insidePlace` answers
  // false for a path with no real form — so without this the containment
  // sentence refuses the one case this feature exists for, and blames the
  // user's path for it. Only the ROOT is created, never a deeper chain: the
  // root is a name this app derived itself, and creating anything past it
  // would be creating a directory the caller named.
  //
  // Ordered AFTER the plugin arm below would be wrong (nothing here is under
  // a plugin) but before the containment gate is essential: the gate is what
  // needs the directory to exist.
  const early = absoluteOrPlugin(root, deps)
  if (early !== null) return { kind: 'refused', why: early }
  try {
    readdirSync(root)
  } catch {
    try {
      mkdirSync(root, { recursive: true })
    } catch (error) {
      return { kind: 'failed', why: `the skills folder could not be created — ${String(error)}` }
    }
  }
  // The ROOT is what is gated, not the target: the target does not exist yet,
  // and `insidePlace` answers false for a path with no real form (nothing to
  // grant). A root that passes bounds every child it can hold.
  const refusal = gate(root, deps)
  if (refusal !== null) return { kind: 'refused', why: refusal }
  const dir = join(root, name)
  try {
    readdirSync(dir)
    return { kind: 'refused', why: `a skill named ${name} already exists there — new refuses rather than overwriting it` }
  } catch {
    // ENOENT is the ordinary case: the name is free.
  }
  try {
    mkdirSync(dir, { recursive: true })
  } catch (error) {
    return { kind: 'failed', why: String(error) }
  }
  const file = join(dir, SKILL_FILE)
  const failed = atomicWrite(file, skillStub(name), deps)
  if (failed !== null) return { kind: 'failed', why: failed }
  return { kind: 'created', path: file }
}

/**
 * Move the skill's DIRECTORY, refusing a collision rather than overwriting.
 *
 * The shelf key is `scope:name` (`shared/skills.ts`), so a rename changes it:
 * the renderer carries the slot with `renameInShelf` and saves the shelf. A
 * rename that could not be carried leaves the OLD key in place, rendering
 * `not installed here` — a column entry that silently vanished would be
 * indistinguishable from a skill that was never installed.
 */
export async function renameSkill(
  from: string,
  to: string,
  deps: SkillWriteDeps
): Promise<SkillWriteResult> {
  for (const candidate of [from, dirname(to)]) {
    const refusal = gate(candidate, deps)
    if (refusal !== null) return { kind: 'refused', why: refusal }
  }
  try {
    readdirSync(to)
    return { kind: 'refused', why: `a skill named ${basename(to)} already exists in that folder — rename refuses rather than overwriting it` }
  } catch {
    // Free.
  }
  try {
    ;(deps.rename ?? renameSync)(from, to)
  } catch (error) {
    return { kind: 'failed', why: String(error) }
  }
  return { kind: 'renamed', path: to }
}

/**
 * Trash the skill's DIRECTORY, so its bundled resources go with it — which is
 * why the confirm names the resource count (§2.2) rather than asking about
 * "a skill". Recoverable by construction; the Finder is the undo.
 */
export async function deleteSkill(dir: string, deps: SkillWriteDeps): Promise<SkillWriteResult> {
  const refusal = gate(dir, deps)
  if (refusal !== null) return { kind: 'refused', why: refusal }
  // CONTAINMENT IS NOT ENOUGH HERE, and this is the one writer where that
  // matters. `insidePlace` answers TRUE for `real === place` (a place holds
  // itself), so the gate alone lets a caller trash `~/.claude/skills`
  // ITSELF — every skill the user has, in one call, answering `deleted`
  // exactly as a single skill would, with the Finder as the only clue. A
  // skill is one folder DIRECTLY under a root, holding a `SKILL.md`, and
  // both halves are checked: the parent must BE a root (never merely inside
  // one, which a `references/` subfolder also is), and the folder must
  // actually be a skill.
  const norm = normalisePath(dir) as string
  const real = (p: string): string | null => {
    try {
      return deps.realpath(p)
    } catch {
      return null
    }
  }
  const parent = real(dirname(norm))
  const isRootChild = parent !== null && deps.skillRoots.some((r) => real(r) === parent)
  if (!isRootChild) {
    return {
      kind: 'refused',
      why: `${norm} is not a skill folder — a skill is one folder directly inside ~/.claude/skills or a repository's .claude/skills, and the root itself is never deleted`
    }
  }
  try {
    if (!readdirSync(norm).includes(SKILL_FILE)) {
      return { kind: 'refused', why: `${norm} holds no ${SKILL_FILE}, so it is not a skill this app may trash` }
    }
  } catch (error) {
    return { kind: 'failed', why: `the skill folder could not be read before deleting — ${String(error)}` }
  }
  try {
    await deps.trash(dir)
  } catch (error) {
    return { kind: 'failed', why: String(error) }
  }
  return { kind: 'deleted' }
}

/**
 * The four writers as the IPC layer's handlers, with every dependency
 * resolved in MAIN and none of them nameable by the renderer.
 *
 * The renderer names a PATH; the roots are derived here from the asking
 * panel's own cwd and the home the toolbox reads. That asymmetry is the
 * whole containment story: a renderer that could name a root could widen
 * one, and a widened root is a security boundary that fails silently.
 */
export function skillWriteHandlers(deps: {
  resolveCwd: (cwd: string) => string
  home: () => string
  realpath: Realpath
  plugins: () => Promise<readonly { id: string; installPath: string }[]>
  trash: (path: string) => Promise<void>
}): {
  write(req: { cwd: string; path: string; text: string; stamp: ReadStamp }): Promise<SkillWriteResult>
  create(req: { cwd: string; scope: 'user' | 'project'; name: string }): Promise<SkillWriteResult>
  rename(req: { cwd: string; dir: string; name: string }): Promise<SkillWriteResult>
  remove(req: { cwd: string; dir: string }): Promise<SkillWriteResult>
} {
  const rootsOf = (cwd: string): { user: string; project: string } => {
    const home = deps.home()
    return {
      user: join(home, '.claude', 'skills'),
      // An empty cwd is a panel with no directory: the project root then
      // resolves to nothing writable rather than to the process's own cwd,
      // which is the app bundle.
      project: cwd === '' ? '' : join(deps.resolveCwd(cwd), '.claude', 'skills')
    }
  }
  const depsFor = async (cwd: string): Promise<SkillWriteDeps> => {
    const roots = rootsOf(cwd)
    return {
      realpath: deps.realpath,
      skillRoots: [roots.user, roots.project].filter((r) => r !== ''),
      pluginPaths: await deps.plugins(),
      trash: deps.trash
    }
  }
  return {
    write: async (req) => writeSkill(req.path, req.text, req.stamp, await depsFor(req.cwd)),
    create: async (req) => {
      const roots = rootsOf(req.cwd)
      const root = req.scope === 'user' ? roots.user : roots.project
      if (root === '') {
        return { kind: 'refused', why: 'this panel has no directory, so there is no project .claude/skills to write into' }
      }
      return createSkill(root, req.name, await depsFor(req.cwd))
    },
    rename: async (req) => {
      // The same name rule `createSkill` states: a skill is one folder, so
      // its name carries no separator. Checked here because `renameSkill`
      // gates the DESTINATION's parent, which a `../` name would leave
      // looking perfectly contained.
      if (req.name === '' || req.name.includes('/') || req.name === '.' || req.name === '..') {
        return { kind: 'refused', why: `${req.name === '' ? '(no name)' : req.name} is not a skill name — a skill is one folder, so its name carries no separator` }
      }
      return renameSkill(req.dir, join(dirname(req.dir), req.name), await depsFor(req.cwd))
    },
    remove: async (req) => deleteSkill(req.dir, await depsFor(req.cwd))
  }
}
