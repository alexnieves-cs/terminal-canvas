import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import {
  DEFAULT_PRESET_ID,
  defaultSnapshot,
  defaultWorkspace,
  parseLayout,
  type CanvasState,
  type LayoutSnapshot,
  type Preset,
  type Prompt,
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
  /** User-created presets only; the built-ins live in main/presets.ts. */
  presets(): Preset[]
  /** Append one and schedule a write. Ids are minted by the caller. */
  addPreset(preset: Preset): void
  /** Rename one user preset. False when the id names nothing. */
  renamePreset(id: string, name: string): boolean
  /**
   * Remove one user preset. False when the id names nothing — including every
   * built-in id, which is not this file's data to remove.
   */
  deletePreset(id: string): boolean
  /** What Cmd+N spawns. Not validated here: only main knows the built-ins. */
  setDefaultPreset(id: string): void
  /** What Cmd+N spawns. May name a built-in, so main resolves it, not this. */
  defaultPresetId(): string
  /** The SAVED prompts only. Project prompts are read live; see main/prompts.ts. */
  prompts(): Prompt[]
  addPrompt(prompt: Prompt): void
  /** False when the id names nothing — including any project prompt id. */
  deletePrompt(id: string): boolean
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
      const { layout, camera, focus } = snapshot.settings
      // Symmetric with initial(): a restore setting that is OFF means "start
      // fresh each launch", not "discard on launch". initial() already hands
      // the renderer nothing for that field, so the renderer's snapshot never
      // reflects the stored value — writing it back unconditionally would let
      // an unrelated save (any panel move, any camera pan) overwrite real data
      // with whatever the fresh-start renderer invented instead. Leaving the
      // field untouched freezes the stored value at whatever it was when the
      // setting was last on; re-checking the box gives it back. Preserving is
      // strictly better than destroying, and it is the only reading under
      // which "restore on launch" is not secretly "discard on launch".
      if (layout) w.panels = incoming.panels.map((p) => ({ ...p }))
      // selectedId/focusedId name panels, so they ride with `layout` (whether
      // there is anything to select) as well as `focus` (whether selection
      // itself restores) — either OFF is a reason to leave them alone.
      if (layout && focus) {
        w.selectedId = incoming.selectedId
        w.focusedId = incoming.focusedId
      }
      if (camera) w.camera = { ...incoming.camera }
      scheduleWrite()
    },

    settings: () => ({ ...snapshot.settings }),

    setSetting(key, value) {
      snapshot.settings[key] = value
      scheduleWrite()
    },

    // Copied out, like settings(), so a caller cannot mutate the snapshot the
    // store is about to serialise and have the write silently disagree with
    // what addPreset scheduled.
    presets: () => snapshot.presets.map((p) => ({ ...p })),

    addPreset(preset) {
      snapshot.presets = [...snapshot.presets, { ...preset }]
      scheduleWrite()
    },

    renamePreset(id, name) {
      const found = snapshot.presets.find((p) => p.id === id)
      if (!found) return false
      snapshot.presets = snapshot.presets.map((p) => (p.id === id ? { ...p, name } : p))
      scheduleWrite()
      return true
    },

    deletePreset(id) {
      const before = snapshot.presets.length
      snapshot.presets = snapshot.presets.filter((p) => p.id !== id)
      if (snapshot.presets.length === before) return false
      // A defaultPresetId naming a preset that no longer exists is a fact on
      // disk that outlives this run. resolveDefault() recovers at read time,
      // but only here is the moment the preset goes away visible.
      if (snapshot.defaultPresetId === id) snapshot.defaultPresetId = DEFAULT_PRESET_ID
      scheduleWrite()
      return true
    },

    setDefaultPreset(id) {
      snapshot.defaultPresetId = id
      scheduleWrite()
    },

    defaultPresetId: () => snapshot.defaultPresetId,

    // Copied out for the same reason presets() copies: a caller must not be
    // able to mutate the snapshot the store is about to serialise.
    prompts: () => snapshot.prompts.map((p) => ({ ...p })),

    addPrompt(prompt) {
      snapshot.prompts = [...snapshot.prompts, { ...prompt }]
      scheduleWrite()
    },

    deletePrompt(id) {
      const before = snapshot.prompts.length
      snapshot.prompts = snapshot.prompts.filter((p) => p.id !== id)
      if (snapshot.prompts.length === before) return false
      scheduleWrite()
      return true
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
