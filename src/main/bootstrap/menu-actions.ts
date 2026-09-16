import { dialog } from 'electron'
import { buildAppMenu } from '../menu'
import { requestCanvasCounts, requestFromRenderer } from '../ipc'
import { allPresets, presetFromCapture, pushDefaultPreset, resolveAvailability, templateOf, unreviewedPresetReason } from '../presets'
import { IPC_EVENTS, type CapturedPanel } from '../../shared/ipc-contract'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * The application menu and the four acts reachable only from it.
 *
 * These are mutually recursive by nature — the menu is rebuilt by the acts it
 * launches — so they are made together in one closure rather than exported as
 * free functions taking each other. `rebuildMenu` in particular is passed to
 * `registerIpcHandlers` as its own positional collaborator, so it must be one
 * stable reference for the life of the process, not a fresh arrow per call.
 */
export interface MenuActions {
  rebuildMenu(): void
  /** The three things every preset change has to do. */
  afterPresetChange(): void
  onSpawnPreset(id: string): string | null
  confirmReset(): Promise<void>
}

export function createMenuActions(
  state: MainState,
  stores: Stores,
  which: (command: string) => string | null
): MenuActions {
  const { layoutStore, layoutSnapshots } = stores

  /**
   * Reset is the only action in the app Cmd+Z cannot take back, which is exactly
   * why it is the only one that asks. The message NAMES what is about to be lost
   * — a generic "Are you sure?" trains people to click through the one that
   * mattered, and closing seven idle panels is not the same act as closing seven
   * running agents.
   */
  const confirmReset = async (): Promise<void> => {
    const window = state.window
    if (!window) return
    const { panels, running } = await requestCanvasCounts(window.webContents)
    const detail =
      running > 0
        ? `${panels} panel${panels === 1 ? '' : 's'} will be closed, including ${running} running process${running === 1 ? '' : 'es'}. This cannot be undone.`
        : `${panels} panel${panels === 1 ? '' : 's'} will be closed. This cannot be undone.`
    // M93. Reset stays final, and the dialog says where the past is kept.
    const kept = layoutSnapshots.list().length
    const detailWithHistory = kept > 0 ? `${detail} ${kept} snapshot${kept === 1 ? '' : 's'} of earlier saves exist — restore one from the Workspaces pane.` : detail

    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message: 'Reset this canvas?',
      detail: detailWithHistory,
      buttons: ['Cancel', 'Reset Canvas'],
      // Cancel is the default, so Return dismisses rather than destroys.
      defaultId: 0,
      cancelId: 0
    })
    if (response !== 1) return

    layoutStore.reset()
    layoutStore.flushSync()
    window.webContents.send(IPC_EVENTS.CANVAS_RESET)
  }

  /**
   * Spawn from a preset, by id. NAMED rather than inlined into the menu's
   * options, because the palette picks presets too (PRESET_SPAWN_BY_ID) and the
   * two picks have to be the identical code — a second copy is a second place
   * for "which preset does this id mean" to answer differently.
   */
  const onSpawnPreset = (id: string): string | null => {
    const user = layoutStore.presets()
    const found = allPresets(user).find((p) => p.id === id)
    if (!found) {
      // Never substitute a different preset: spawning the wrong program in
      // the wrong directory is worse than spawning nothing.
      console.warn(`[presets] a pick named ${id}, which no longer exists`)
      return 'that preset no longer exists'
    }
    // M253. A pack's preset is a stranger's command until a person reads it.
    const unread = unreviewedPresetReason(found)
    if (unread !== null) return unread
    state.window?.webContents.send(IPC_EVENTS.PRESET_SPAWN, templateOf(found))
    return null
  }

  const savePresetFromFocusedPanel = async (): Promise<void> => {
    const wc = state.window?.webContents
    // A windowless app with a live menu bar is ORDINARY on darwin, not a
    // can't-happen: window-all-closed deliberately does not quit there, so
    // Cmd+W leaves this menu item clickable with nobody to ask. Returning
    // silently is the same posture confirmReset takes above — there is no
    // panel to save and no window to put a dialog over, so the only honest
    // answer is to do nothing.
    if (!wc) return
    const captured = await requestFromRenderer<CapturedPanel | null>(
      wc,
      IPC_EVENTS.PRESET_CAPTURE,
      null
    )
    if (!captured) {
      // Loud, not silent: a menu item that does nothing is indistinguishable
      // from a broken one.
      await dialog.showMessageBox({
        type: 'info',
        message: 'Focus a panel first',
        detail: 'Click into the panel you want to save, then try again.'
      })
      return
    }
    const preset = presetFromCapture(layoutStore.presets(), captured)
    layoutStore.addPreset(preset)
    rebuildMenu()
  }

  function rebuildMenu(): void {
    buildAppMenu({
      settingValue: (id) => layoutStore.getSetting(id),
      onToggleSetting: (id, value) => {
        layoutStore.setPreference(id, value)
        // M45. The menu is main's, so the renderer never sees this write
        // unless told — and a theme radio that applies on the next Cmd+K is
        // a picker that appears to do nothing.
        state.window?.webContents.send(IPC_EVENTS.SETTINGS_CHANGED, id)
      },
      onReset: () => {
        void confirmReset()
      },
      presets: resolveAvailability(allPresets(layoutStore.presets()), which),
      onSpawnPreset,
      // M65. The sheet is the renderer's; the menu only asks for it.
      onOpenSheet: () => { state.window?.webContents.send(IPC_EVENTS.SPAWN_OPEN_SHEET) },
      onTidy: () => { state.window?.webContents.send(IPC_EVENTS.CANVAS_TIDY) },
      onFeedback: () => { state.window?.webContents.send(IPC_EVENTS.CANVAS_FEEDBACK) },
      onFlip: () => { state.window?.webContents.send(IPC_EVENTS.CANVAS_FLIP) },
      onSavePreset: () => {
        void savePresetFromFocusedPanel()
      }
    })
  }

  /**
   * The three things every preset change has to do. Deleting the default one
   * changes what Cmd+N spawns, and the renderer only learns that from a
   * PRESET_DEFAULT push — without it the old template stays in defaultTemplateRef
   * and Cmd+N keeps spawning a preset the user just deleted.
   */
  const afterPresetChange = (): void => {
    rebuildMenu()
    if (state.window) pushDefaultPreset(state.window.webContents, layoutStore)
  }

  return { rebuildMenu, afterPresetChange, onSpawnPreset, confirmReset }
}
