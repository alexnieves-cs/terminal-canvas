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
import { resolveSetting, settingDef, type SettingValue } from '../shared/settings-schema'
import type { WorkspaceRow } from '../shared/ipc-contract'

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
  /**
   * Everything the user has changed, keyed by SettingDef.id. Copied out, like
   * settings() and presets(), so a caller cannot mutate the snapshot the store
   * is about to serialise and have the write silently disagree with it.
   */
  preferences(): Record<string, SettingValue>
  /** Resolved: the persisted value if there is one, else the schema default. */
  getSetting(id: string): SettingValue
  setPreference(id: string, value: SettingValue): void
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
  /** Every workspace, with the active one flagged. Copied out, like presets(). */
  workspaces(): WorkspaceRow[]
  /**
   * Mint one and return its id. Does NOT activate it: a create that also
   * switched would move the user somewhere they did not ask to go, and
   * switching is a transaction with its own rules (see activateWorkspace).
   */
  createWorkspace(name: string): string
  /** False when the id names nothing, like renamePreset. */
  renameWorkspace(id: string, name: string): boolean
  /**
   * False when the id names nothing. Deleting the ACTIVE workspace activates
   * a neighbour, and deleting the LAST one installs a fresh default — there
   * is never zero workspaces, which parseLayout guarantees only on load.
   *
   * NOTE: this removes the RECORD. The panels' sessions belong to the
   * renderer's registry and are disposed there, before this is called.
   */
  deleteWorkspace(id: string): boolean
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

  // Ids are `w<n>` above the current maximum, the same shape parseWorkspace's
  // own fallback already assumes (`w${index + 1}`). Derived from the existing
  // ids rather than from the count, so deleting w2 out of [w1, w2, w3] cannot
  // mint a second w3.
  function nextWorkspaceId(): string {
    const max = snapshot.workspaces.reduce((n, w) => {
      const match = /^w(\d+)$/.exec(w.id)
      return match ? Math.max(n, Number(match[1])) : n
    }, 0)
    return `w${max + 1}`
  }

  function writeNow(): void {
    // Never throws. flushSync's caller is app.on('before-quit'), where an
    // exception can wedge the quit itself; and a disk that cannot be written
    // is a reason to log, not a reason to refuse to run.
    try {
      const tmp = `${filePath}.tmp`
      // `settings` is deliberately NOT written any more: it is a derived view
      // of three preferences entries, and writing both would create exactly
      // the second storage this milestone removed. parseLayout still reads it,
      // so a pre-M6b file migrates on first load — but once this app has
      // written the file, `preferences` is the only record.
      const { settings: _settings, ...onDisk } = snapshot
      writeFileSync(tmp, JSON.stringify(onDisk, null, 2), 'utf8')
      // rename is atomic on macOS. Writing in place would let a crash
      // mid-write leave a truncated file — parseLayout survives that, but it
      // survives it by discarding the whole canvas.
      renameSync(tmp, filePath)
      dirty = false
    } catch (error: unknown) {
      warn(`could not write ${filePath}: ${String(error)}`)
    }
  }

  // The single place that resolves the three restore.* entries, so initial(),
  // save() and the settings() view can never read them out of step with each
  // other or with setSetting/setPreference, which both write straight into
  // snapshot.preferences.
  function resolvedSettings(): RestoreSettings {
    return {
      layout: resolveSetting(snapshot.preferences, 'restore.layout') as boolean,
      camera: resolveSetting(snapshot.preferences, 'restore.camera') as boolean,
      focus: resolveSetting(snapshot.preferences, 'restore.focus') as boolean
    }
  }

  // Shared by setPreference and setSetting, so neither can write an id the
  // schema does not declare or a value of the wrong type — either would be an
  // entry parsePreferences drops on the very next load: a setting that
  // appears to take and is gone after a relaunch.
  function writePreference(id: string, value: SettingValue): void {
    const def = settingDef(id)
    if (def === undefined) return
    if (typeof value !== def.type) return
    // Range, for the reason SettingDef.min/max records: both ends of the
    // idleness threshold fail silently, so a value outside them is refused
    // here rather than stored and puzzled over later.
    if (def.type === 'number' && typeof value === 'number') {
      if (def.min !== undefined && value < def.min) return
      if (def.max !== undefined && value > def.max) return
    }
    snapshot.preferences[id] = value
    scheduleWrite()
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
      const { layout, camera, focus } = resolvedSettings()
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
      const { layout, camera, focus } = resolvedSettings()
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

    // The typed view of the three `restore.*` schema entries. It stays because
    // initial()'s restore logic is written in terms of RestoreSettings and
    // rewriting that buys nothing — but it is a VIEW, not a second storage:
    // both members go through the same preferences map, so a write through
    // either API is visible through the other (verify:layout 73).
    settings: resolvedSettings,

    setSetting(key, value) {
      // Routed through the same guard setPreference uses, rather than writing
      // snapshot.preferences directly — see writePreference's comment.
      writePreference(`restore.${key}`, value)
    },

    preferences: () => ({ ...snapshot.preferences }),

    getSetting: (id) => resolveSetting(snapshot.preferences, id),

    setPreference: writePreference,

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

    workspaces: () =>
      snapshot.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        // Copied out for the reason presets() copies: a caller must not be
        // able to mutate the snapshot the store is about to serialise.
        panelIds: w.panels.map((p) => p.id),
        active: w.id === snapshot.activeWorkspaceId
      })),

    createWorkspace(name) {
      const id = nextWorkspaceId()
      // Built field by field off defaultWorkspace() rather than spread with an
      // override, so a future field added to Workspace gets its default here
      // instead of silently arriving as undefined.
      snapshot.workspaces = [...snapshot.workspaces, { ...defaultWorkspace(), id, name }]
      scheduleWrite()
      return id
    },

    renameWorkspace(id, name) {
      const found = snapshot.workspaces.find((w) => w.id === id)
      if (!found) return false
      snapshot.workspaces = snapshot.workspaces.map((w) =>
        w.id === id ? { ...w, name } : w
      )
      scheduleWrite()
      return true
    },

    deleteWorkspace(id) {
      const before = snapshot.workspaces.length
      snapshot.workspaces = snapshot.workspaces.filter((w) => w.id !== id)
      if (snapshot.workspaces.length === before) return false
      // NEVER ZERO. parseLayout guarantees at least one workspace on LOAD, but
      // that is the read path; this is a write path that did not exist when it
      // was written. With an empty array, activeWorkspace()'s repair branch —
      // documented as unreachable from a parsed file — fires on the next save
      // and repairs by discarding whatever the caller had.
      if (snapshot.workspaces.length === 0) {
        snapshot.workspaces = [defaultWorkspace()]
      }
      // An activeWorkspaceId naming a record that is gone is the same class of
      // fact-on-disk-that-outlives-this-run as a defaultPresetId naming a
      // deleted preset: recoverable at read time, but only HERE is the moment
      // the workspace goes away visible.
      if (snapshot.activeWorkspaceId === id) {
        snapshot.activeWorkspaceId = snapshot.workspaces[0].id
      }
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
