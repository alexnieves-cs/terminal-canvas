/**
 * Main's cache of toolbox inventories, keyed by RESOLVED cwd.
 *
 * Keyed by cwd and never by panel id, which is the same fact `TOOLBOX_READ`'s
 * own comment states from the other side: twelve panels in one repository
 * share one answer, and keying by panel would parse the same 93 KB
 * `~/.claude.json` twelve times to produce twelve identical objects.
 *
 * Validation is a STAT SWEEP, never a re-read: roughly nine source stats plus
 * one per markdown file already seen, which is microseconds against four JSON
 * parses. `configStamps` is what makes that sound — see its own comment for
 * the subtlety that a directory's mtime does not move when a file inside a
 * subdirectory changes, which is why the vector reaches individual files.
 *
 * Plain node, like the two modules it composes: no electron, no node-pty.
 */

import {
  configStamps,
  readToolbox,
  stampsEqual,
  type ReadToolboxInput
} from './toolbox-read'
import type { ToolInventoryResult } from '../shared/toolbox'

/**
 * How many directories' inventories are held at once.
 *
 * A canvas that has cycled two hundred directories over a long session must
 * not hold two hundred inventories — the same bound `SUBAGENT_CAP` states for
 * a list that only ever grows. LRU by insertion order, which is what a `Map`
 * already gives.
 */
export const INVENTORY_CACHE_MAX = 32

interface CacheEntry {
  result: ToolInventoryResult
  stamps: Map<string, string>
}

export class ToolboxCache {
  private readonly entries = new Map<string, CacheEntry>()

  /**
   * The inventory for one cwd, re-read only when disk has actually moved.
   *
   * `spawnStamps` is deliberately NOT part of the cache key: it changes the
   * `freshness` arm and nothing else, so a cached inventory is reused and its
   * freshness recomputed rather than the whole read being repeated for two
   * panels that differ only in when they started.
   */
  read(input: ReadToolboxInput): ToolInventoryResult {
    if (input.cwd === '') return readToolbox(input)
    const now = configStamps(input.cwd, input.home)
    const hit = this.entries.get(input.cwd)
    if (hit !== undefined && stampsEqual(hit.stamps, now)) {
      // Re-touch so the LRU order reflects use rather than first read.
      this.entries.delete(input.cwd)
      this.entries.set(input.cwd, hit)
      if (input.spawnStamps === undefined) return hit.result
      // The cached ENTRIES are still correct; only the freshness verdict is
      // per-panel, so it is recomputed against the sweep already in hand
      // rather than by re-reading nine files.
      if (hit.result.kind === 'no-cwd') return hit.result
      const changed = [...now.keys()].filter((k) => input.spawnStamps?.get(k) !== now.get(k))
      const missing = [...input.spawnStamps.keys()].filter((k) => !now.has(k))
      const all = [...new Set([...changed, ...missing])].sort()
      return {
        kind: 'inventory',
        inventory: {
          ...hit.result.inventory,
          freshness:
            all.length === 0
              ? { kind: 'fresh' }
              : { kind: 'stale', changedPaths: all, since: Date.now() }
        }
      }
    }
    const result = readToolbox(input)
    this.entries.set(input.cwd, { result, stamps: now })
    while (this.entries.size > INVENTORY_CACHE_MAX) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return result
  }

  /** For verification only, the same escape hatch `FileWatchers.count` is. */
  size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }
}
