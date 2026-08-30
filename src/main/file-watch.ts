import { watch, type FSWatcher } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname } from 'node:path'
import type { FileResult } from '@shared/file-panel'
import { readFile } from './file-read'

/**
 * How long to wait after a filesystem event before re-reading.
 *
 * Not politeness. One logical save emits SEVERAL fs.watch events — macOS
 * delivers 'rename' then 'change' for a temp-and-rename — and an agent writing
 * a large file in chunks emits one per chunk. Without a debounce that is one
 * full read and one IPC message per chunk.
 *
 * 100ms is comfortably above a burst and comfortably under the spec's
 * one-second bar, so it costs nothing a user can perceive.
 */
export const WATCH_DEBOUNCE_MS = 100

interface Entry {
  watcher: FSWatcher
  path: string
  base: string
  timer: NodeJS.Timeout | undefined
  hash: string
  onChange: (result: FileResult) => void
}

/**
 * One watch per open file panel, keyed by panel id.
 *
 * THE WATCH IS ON dirname(path), FILTERED TO basename(path) — never on the
 * file path itself, and this is the single most important line in the
 * milestone.
 *
 * Agents and editors do not write files in place. They write a temporary file
 * and rename() it over the target, which replaces the inode. `fs.watch(path)`
 * stays bound to the OLD inode: it fires once for the initial truncate, or not
 * at all, and then never again. The panel goes permanently stale showing
 * content from before the agent's first write, with no error anywhere — which
 * looks exactly like a watcher that was never wired up, so a fix would be
 * aimed at the wrong place entirely.
 *
 * Watching the directory survives the rename, and delivers deletion and
 * re-creation for free, which the `missing` arm needs anyway.
 *
 * node:fs's own `watch`, not chokidar: `dependencies` is one entry
 * ({"node-pty": "1.1.0"}) and a second runtime dependency would buy nothing
 * this design needs.
 */
export class FileWatchers {
  private readonly entries = new Map<string, Entry>()

  /**
   * Arm a watch AND return the first read.
   *
   * One call rather than two, so there is no window in which main is watching
   * and the renderer has nothing to render. It also seeds `hash`, which is
   * what makes the very first change event a real change rather than a
   * duplicate of the content the panel is already showing.
   */
  watch(panelId: string, path: string, onChange: (result: FileResult) => void): FileResult {
    // Re-arming at the same id replaces rather than stacks: a component that
    // remounts (a workspace switch back, a React re-key) must not leave the
    // previous FSWatcher alive with a stale callback.
    this.close(panelId)

    const result = readFile(path)
    const base = basename(path)
    let watcher: FSWatcher
    try {
      watcher = watch(dirname(path), { persistent: false }, (_event, changed) => {
        // `changed` is null on some platforms/events. Treating null as "might
        // be ours" is the safe direction: a spurious re-read is deduped by the
        // hash below and costs one bounded read, while ignoring it could miss
        // the only notification this file ever gets.
        if (changed !== null && changed !== base) return
        this.schedule(panelId)
      })
    } catch (error: unknown) {
      // An unwatchable directory is not a reason to have no panel. The read
      // above already succeeded or already has its own arm; the panel simply
      // will not update on its own, and its refresh control still works.
      console.warn(`[file-watch] could not watch ${dirname(path)}:`, error)
      return result
    }
    // persistent: false — a watcher must never hold the app open, the same
    // reason PtyManager unref()s its two ticks.
    this.entries.set(panelId, {
      watcher,
      path,
      base,
      timer: undefined,
      hash: hashOf(result),
      onChange
    })
    return result
  }

  private schedule(panelId: string): void {
    const entry = this.entries.get(panelId)
    if (entry === undefined) return
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = undefined
      // Re-read the map: close() may have run inside the debounce window, and
      // pushing to a closed panel's callback is a message about a panel the
      // renderer no longer has.
      const current = this.entries.get(panelId)
      if (current === undefined) return
      const result = readFile(current.path)
      const hash = hashOf(result)
      // The dedupe, and it is the design rather than an optimisation — the
      // rule applyEvent already follows for agent state. Undeduped this is a
      // message per filesystem event describing a fact that did not change,
      // and its failure is INVISIBLE: no pixel is wrong, it shows up as heat.
      if (hash === current.hash) return
      current.hash = hash
      current.onChange(result)
    }, WATCH_DEBOUNCE_MS)
  }

  close(panelId: string): void {
    const entry = this.entries.get(panelId)
    if (entry === undefined) return
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    entry.watcher.close()
    this.entries.delete(panelId)
  }

  /**
   * Every watch, gone.
   *
   * Called from renderer navigation and before-quit — the same two seams
   * window-lifecycle.ts already covers for PTYs. Without the first, every
   * Cmd+R leaks one FSWatcher per open file panel, forever, in a main process
   * the reload does not restart: the abandoned-handle bug window-lifecycle.ts
   * exists to fix, in a new resource.
   */
  closeAll(): void {
    for (const panelId of [...this.entries.keys()]) this.close(panelId)
  }

  /** For verification only — how many watches are armed. */
  count(): number {
    return this.entries.size
  }
}

/**
 * Hashed over the whole result MINUS `mtimeMs`, so a text file becoming
 * `missing` is a change (check 9) and so is a file crossing the byte cap — a
 * content-only hash would make both of those silent. `mtimeMs` is excluded
 * deliberately: it changes on every write regardless of content (rewriting
 * identical bytes still updates the filesystem's modification time), so
 * including it would defeat the dedupe entirely — every rewrite would look
 * like a change even when nothing the user would ever see actually moved.
 * Check 8 is the one that would notice.
 */
function hashOf(result: FileResult): string {
  const { mtimeMs: _mtimeMs, ...stable } = result as FileResult & { mtimeMs?: number }
  return createHash('sha1').update(JSON.stringify(stable)).digest('hex')
}
