/**
 * M120. THE SANDBOX CWD — where a chat with NO place lives. A chat resolves
 * a cwd on every create, and before this milestone every cwd was a folder
 * the user chose (or the home fallback, which is a folder the user did not
 * choose and is why the Places gate runs BEFORE resolveCwd). A chat that is
 * not about a repository has nowhere honest to live, so it gets the app's
 * own folder: `userData/sandbox/<id>` — never a place, never home. The
 * Places gate is bypassed BY CONSTRUCTION here, not by an exception: the
 * folder is the app's, and `sandboxTeammateRefusal` refuses a teammate
 * beside it (a teammate has places; a sandbox has none).
 *
 * Made on create and removed on DISPOSE, not on exit: a chat whose process
 * exits and resumes keeps whatever it wrote. The id must be a plain path
 * segment — a `../` in an id would be a folder outside the sandbox root, and
 * an id is minted by the renderer, so it is checked here rather than trusted.
 *
 * Pure over injected `mkdir`/`rm`, so `verify:file sandbox.1` drives both
 * arms under plain node.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export interface SandboxFs {
  mkdir(path: string): void
  rm(path: string): void
}

export type SandboxCwd = { kind: 'cwd'; path: string } | { kind: 'refused'; reason: string }

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function resolveSandboxCwd(userData: string, id: string, fs: SandboxFs): SandboxCwd {
  if (!SEGMENT.test(id)) return { kind: 'refused', reason: `a sandbox id must be a plain name — ${JSON.stringify(id)} is not` }
  const path = join(userData, 'sandbox', id)
  try {
    fs.mkdir(path)
  } catch (error) {
    return { kind: 'refused', reason: `could not make ${path}: ${String(error)}` }
  }
  return { kind: 'cwd', path }
}

/** Removes the folder if the id could have named one; a never-made folder is a no-op, never an error. */
export function disposeSandbox(userData: string, id: string, fs: SandboxFs): void {
  if (!SEGMENT.test(id)) return
  try { fs.rm(join(userData, 'sandbox', id)) } catch { /* already gone */ }
}

/** The real filesystem — the only non-pure lines in this module. */
export const realSandboxFs: SandboxFs = {
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  rm: (path) => rmSync(path, { recursive: true, force: true })
}
