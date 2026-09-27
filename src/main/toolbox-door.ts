import { statSync } from 'node:fs'
import { expandTilde } from './pty-manager'
import type { ToolboxCache } from './toolbox-cache'
import type { PluginListResult } from './plugin-list'
import type { ToolboxReadRequest } from '../shared/ipc-contract'
import type { ToolInventoryResult } from '../shared/toolbox'

/**
 * M366. MAIN'S ONE TOOLBOX READ, lifted out of the `toolbox:read` handler's
 * closure so `tc toolbox` asks the same question through the same rules.
 * A second copy would be a second directory rule, and M194 found a third
 * hand-written one disagreeing silently. `ipc.ts` and the control wiring each
 * build one over main's ONE `ToolboxCache`, so N askers of one directory
 * still read it once.
 *
 * Plain node (no electron), so `verify:control` drives it against real
 * directories.
 */
export interface ToolboxDoorDeps {
  cache: ToolboxCache
  /** Read at use, never captured: the toolbox's home can be redirected. */
  home: () => string
  /** The panel's spawn-time config stamps, when anything knows them. */
  stampsFor: (panelId: string) => Map<string, string> | undefined
  /** Asked only on a cache miss (`ToolboxCache.read`'s rule). */
  listPlugins: () => Promise<PluginListResult>
}

export function createToolboxDoor(deps: ToolboxDoorDeps): (req: ToolboxReadRequest) => Promise<ToolInventoryResult> {
  return async (req) => {
    // M194. Inspection must never borrow the spawn resolver's home fallback:
    // a deleted project would otherwise display HOME's tools as its own.
    if (req.cwd === '') return { kind: 'no-cwd' }
    const cwd = expandTilde(req.cwd)
    // Three facts, three sentences. An earlier round of this had two, and the
    // one that named non-existence was the arm that never saw it: `statSync`
    // THROWS on a missing path, so a deleted project always lands in the
    // catch. Each of these has a different fix, which is why they are not
    // merged (the DirResult union's own rule, `shared/fs-tree.ts`).
    if (!cwd.startsWith('/')) return { kind: 'unavailable', reason: `the working directory is not an absolute path (${req.cwd})` }
    try {
      if (!statSync(cwd).isDirectory()) return { kind: 'unavailable', reason: 'that path is a file, not a directory' }
    } catch {
      return { kind: 'unavailable', reason: 'the directory is no longer there — it may have been moved or deleted' }
    }
    return deps.cache.read(
      { cwd, home: deps.home(), spawnStamps: deps.stampsFor(req.panelId) },
      // Passed as a RESOLVER, never pre-awaited here: the cache asks this
      // only on an actual miss, so N toolbox panels sharing one cwd spawn
      // `claude plugin list --json` once, not once per panel. `unknown`
      // reads as no plugins, never as an error surfaced here — the pane
      // already has a place for "the CLI didn't answer" one level up (the
      // ordinary env-report three-state rule), and a toolbox read has no
      // slot to carry a second one through.
      async () => {
        const pluginsResult = await deps.listPlugins()
        return pluginsResult.kind === 'ok' ? pluginsResult.plugins : undefined
      }
    )
  }
}
