import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import {
  defaultSnapshot,
  defaultWorkspace,
  parseLayout,
  type CanvasState,
  type LayoutSnapshot,
  type RestoreSettings,
  type Workspace
} from '../shared/layout-schema'

/**
 * Owns layout.json.
 *
 * In MAIN rather than the renderer, and the deciding argument is the quit
 * flush. It has to happen at before-quit, main-side. If the renderer owned the
 * debounce, main would have to ask the renderer for a snapshot at exactly the
 * moment the renderer might already be destroyed — which is precisely the
 * failure window-lifecycle.ts exists to handle, where Cmd+R and Cmd+W tear
 * down the page without running any React cleanup. Holding the snapshot here
 * makes the flush a writeFileSync with nobody to ask.
 *
 * `filePath` is a parameter rather than an app.getPath('userData') call inside,
 * the same move session-registry.ts makes with its bridge and factory. It is
 * not ceremony: an electron import here would force verify:layout out of the
 * plain-node tier and into Electron-as-node, where every check costs a process
 * spawn and a native-module load.
 */

export const WRITE_DEBOUNCE_MS = 500

export type Cancel = () => void

export interface LayoutStoreDeps {
  filePath: string
  /**
   * Injected so verify:layout can drive the debounce explicitly instead of
   * waiting on a real clock — which would make the coalescing check both slow
   * and timing-flaky.
   */
  schedule?: (fn: () => void, ms: number) => Cancel
  onWarning?: (message: string) => void
}

export interface LayoutStore {
  /** Read and parse once at startup. Backs up a future-version file. */
  load(): void
  /** The resolved starting state for the renderer, restore settings applied. */
  initial(): CanvasState
  /** Merge a renderer snapshot into the active workspace and schedule a write. */
  save(incoming: CanvasState): void
  settings(): RestoreSettings
  setSetting(key: keyof RestoreSettings, value: boolean): void
  /** Return the active workspace to an empty canvas. */
  reset(): void
  /** Write now, synchronously. Never throws. */
  flushSync(): void
}

const defaultSchedule = (fn: () => void, ms: number): Cancel => {
  const handle = setTimeout(fn, ms)
  return () => clearTimeout(handle)
}

export function createLayoutStore(deps: LayoutStoreDeps): LayoutStore {
  const { filePath } = deps
  const schedule = deps.schedule ?? defaultSchedule
  const warn = deps.onWarning ?? ((m: string) => console.warn(`[layout] ${m}`))

  let snapshot: LayoutSnapshot = defaultSnapshot()
  let cancelPending: Cancel | null = null
  let dirty = false

  function activeWorkspace(): Workspace {
    const found = snapshot.workspaces.find((w) => w.id === snapshot.activeWorkspaceId)
    if (found) return found
    // parseLayout guarantees at least one workspace and a resolvable active id,
    // so this only fires for a snapshot built in code. Repair rather than
    // throw: there is no caller that can do anything useful with an exception.
    const fresh = defaultWorkspace()
    snapshot.workspaces = [fresh]
    snapshot.activeWorkspaceId = fresh.id
    return fresh
  }

  function writeNow(): void {
    // Never throws. flushSync's caller is app.on('before-quit'), where an
    // exception can wedge the quit itself; and a disk that cannot be written
    // is a reason to log, not a reason to refuse to run.
    try {
      const tmp = `${filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
      // rename is atomic on macOS. Writing in place would let a crash
      // mid-write leave a truncated file — parseLayout survives that, but it
      // survives it by discarding the whole canvas.
      renameSync(tmp, filePath)
      dirty = false
    } catch (error: unknown) {
      warn(`could not write ${filePath}: ${String(error)}`)
    }
  }

  function scheduleWrite(): void {
    dirty = true
    // Coalescing, not queueing. A drag sends ~60 snapshots a second; only the
    // newest matters, and re-arming would postpone the write for the whole
    // gesture rather than bounding it.
    if (cancelPending) return
    cancelPending = schedule(() => {
      cancelPending = null
      writeNow()
    }, WRITE_DEBOUNCE_MS)
  }

  return {
    load() {
      if (!existsSync(filePath)) return

      let raw: string
      try {
        raw = readFileSync(filePath, 'utf8')
      } catch (error: unknown) {
        warn(`could not read ${filePath}: ${String(error)}`)
        return
      }

      const { snapshot: parsed, warnings, futureVersion } = parseLayout(raw)
      for (const message of warnings) warn(message)

      if (futureVersion) {
        // Preserve it before the fallback's first write replaces it. Without
        // this, opening an old build once destroys a layout a newer build
        // authored, with no way back.
        try {
          renameSync(filePath, `${filePath}.bak`)
          warn(`preserved the newer layout file as ${filePath}.bak`)
        } catch (error: unknown) {
          warn(`could not back up ${filePath}: ${String(error)}`)
        }
      }

      snapshot = parsed
    },

    initial() {
      const w = activeWorkspace()
      const { layout, camera, focus } = snapshot.settings
      // Settings are applied HERE so the renderer never learns they exist —
      // the same shape as PanelSpec.command, where main resolves what only
      // main can know and the renderer consumes the answer.
      const panels = layout ? w.panels.map((p) => ({ ...p })) : []
      // With no panels there is nothing for a selection to name, so it goes
      // regardless of the focus setting.
      const keepSelection = layout && focus
      return {
        panels,
        camera: camera ? { ...w.camera } : { ...defaultWorkspace().camera },
        selectedId: keepSelection ? w.selectedId : null,
        focusedId: keepSelection ? w.focusedId : null
      }
    },

    save(incoming) {
      const w = activeWorkspace()
      // Only the four fields the renderer owns. `settings`, `id`, and `name`
      // are main's and must survive every merge — the renderer does not have
      // them and cannot send them back.
      w.panels = incoming.panels.map((p) => ({ ...p }))
      w.camera = { ...incoming.camera }
      w.selectedId = incoming.selectedId
      w.focusedId = incoming.focusedId
      scheduleWrite()
    },

    settings: () => ({ ...snapshot.settings }),

    setSetting(key, value) {
      snapshot.settings[key] = value
      scheduleWrite()
    },

    reset() {
      const w = activeWorkspace()
      const fresh = defaultWorkspace()
      w.panels = []
      w.camera = { ...fresh.camera }
      w.selectedId = null
      w.focusedId = null
      scheduleWrite()
    },

    flushSync() {
      if (cancelPending) {
        cancelPending()
        cancelPending = null
      }
      if (dirty) writeNow()
    }
  }
}
