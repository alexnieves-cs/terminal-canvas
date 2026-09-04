import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * M85. Reading a vault: every `.md` under a root, in MAIN, because the
 * renderer has no `fs` — the rule `file-read.ts` and `toolbox-read.ts`
 * already state, reached by a third reader.
 *
 * Both caps are REPORTED. A vault of nine hundred notes that silently showed
 * five hundred would be a pane telling the user their writing is smaller than
 * it is; `skipped` is what the pane says out loud.
 *
 * Plain node against a real fixture tree; `verify:file vault.2`.
 */

export const VAULT_MAX_FILES = 500
export const VAULT_MAX_BYTES = 256 * 1024

export interface VaultNote {
  /** Relative to the root, POSIX-separated: `meetings/2026-09-04.md`. */
  path: string
  /** The first `# heading`, else the basename without its extension. */
  title: string
  body: string
  /** Last modified, so the pane can list newest first without a second stat. */
  at: number
}

export interface VaultRead {
  root: string
  notes: VaultNote[]
  /** Notes the caps dropped — reported, never silent. */
  skipped: number
  /** Why there is nothing, when there is nothing: the third state. */
  reason?: string
}

/** The first ATX heading, which is what a person calls the note. */
function titleOf(path: string, body: string): string {
  for (const line of body.split('\n', 40)) {
    const m = /^#{1,6}\s+(.*\S)\s*$/.exec(line)
    if (m !== null) return m[1] as string
  }
  const base = path.slice(path.lastIndexOf('/') + 1)
  return base.replace(/\.md$/i, '')
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.trash'])

export function readVault(root: string, options: { maxFiles?: number; maxBytes?: number } = {}): VaultRead {
  const maxFiles = options.maxFiles ?? VAULT_MAX_FILES
  const maxBytes = options.maxBytes ?? VAULT_MAX_BYTES
  let isDir = false
  try { isDir = statSync(root).isDirectory() } catch { isDir = false }
  if (!isDir) return { root, notes: [], skipped: 0, reason: `there is no vault at ${root} — choose a folder that exists` }

  const notes: VaultNote[] = []
  let skipped = 0
  const walk = (dir: string, prefix: string): void => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      // A directory that cannot be read costs ITS OWN entries, never the
      // walk: the per-entry failure rule every reader here obeys.
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) { walk(join(dir, entry.name), rel); continue }
      if (!/\.md$/i.test(entry.name)) continue
      if (notes.length >= maxFiles) { skipped += 1; continue }
      const full = join(dir, entry.name)
      let body = ''
      let at = 0
      try {
        const stat = statSync(full)
        at = stat.mtimeMs
        if (stat.size > maxBytes) { skipped += 1; continue }
        body = readFileSync(full, 'utf8')
      } catch {
        skipped += 1
        continue
      }
      notes.push({ path: rel, title: titleOf(rel, body), body, at })
    }
  }
  walk(root, '')
  return { root, notes, skipped }
}
