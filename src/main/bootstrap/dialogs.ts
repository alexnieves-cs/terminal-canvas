import { join } from 'node:path'
import { BrowserWindow, app, dialog } from 'electron'
import type { MainState } from './context'

/**
 * The system's own file dialogs, in one place because ten call sites had
 * grown their own copy of the same five lines and they had already drifted:
 * some named a title, some did not; some filtered by extension, some did not.
 *
 * WHETHER A DIALOG HAS A PARENT IS A REAL DIFFERENCE, not a detail to
 * normalise away, so it stays the caller's choice and this module never
 * decides it. A parented dialog is a SHEET — attached to the window, modal to
 * it alone, and impossible to lose behind the app. A parentless one is
 * app-modal and floats free, which is right when there is no window (darwin
 * keeps the app running with every window closed, so a menu item is still
 * clickable) and wrong when there is: an export sheet that detaches itself
 * from the canvas it is exporting looks like a different app's dialog.
 *
 * Callers that must REFUSE rather than ask parentlessly — the ones whose
 * answer feeds a record the renderer built, where "there is no window to ask"
 * is a named refusal the pane shows — call `liveWindow` first and never reach
 * these with a null.
 */
export interface FileDialogOptions {
  title?: string
  /** The name the sheet opens on, resolved under ~/Downloads by `inDownloads`. */
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

/**
 * The window a dialog may be parented to, or null. Destroyed is checked as
 * well as absent: `window` is nulled on the `closed` event, but a dialog
 * opened from a menu item during teardown can still see the object with its
 * native side already gone, and parenting to it throws.
 */
export function liveWindow(state: MainState): BrowserWindow | null {
  const win = state.window
  return win !== null && !win.isDestroyed() ? win : null
}

/** A suggested filename under the user's Downloads folder. */
export function inDownloads(suggested: string): string {
  return join(app.getPath('downloads'), suggested)
}

/** A save sheet. Null is a cancel OR a dialog the user dismissed — one answer, because they are one act. */
export async function askSave(parent: BrowserWindow | null, options: FileDialogOptions): Promise<string | null> {
  const answer = parent === null ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(parent, options)
  return answer.canceled || answer.filePath === undefined || answer.filePath === '' ? null : answer.filePath
}

/** An open sheet for ONE file. `properties` is fixed: nothing in this app opens many at once. */
export async function askOpenFile(parent: BrowserWindow | null, options: FileDialogOptions): Promise<string | null> {
  const full = { ...options, properties: ['openFile' as const] }
  const answer = parent === null ? await dialog.showOpenDialog(full) : await dialog.showOpenDialog(parent, full)
  return answer.canceled || answer.filePaths[0] === undefined ? null : answer.filePaths[0]
}

/**
 * An open sheet for a DIRECTORY, with `createDirectory` so a person can make
 * the folder they are about to grant rather than leaving to make it first.
 * The answer is absolute and real, which is the only kind a place record keeps.
 */
export async function askOpenDirectory(parent: BrowserWindow | null, options: FileDialogOptions): Promise<string | null> {
  const full = { ...options, properties: ['openDirectory' as const, 'createDirectory' as const] }
  const answer = parent === null ? await dialog.showOpenDialog(full) : await dialog.showOpenDialog(parent, full)
  return answer.canceled || answer.filePaths[0] === undefined ? null : answer.filePaths[0]
}

/**
 * A two-button confirmation, ALWAYS defaulting to Cancel.
 *
 * `defaultId`/`cancelId` are both 0 on purpose and this helper does not let a
 * caller change them: Return dismisses and Escape dismisses, so neither key
 * can complete an act the dialog exists to slow down. The confirming button
 * is named for the verb it performs — "Reset Canvas", "Publish release" —
 * because a generic Are-you-sure trains people to click through the one that
 * mattered.
 */
export async function confirm(
  parent: BrowserWindow | null,
  ask: { message: string; detail?: string; verb: string; type?: 'warning' | 'question' }
): Promise<boolean> {
  const options = {
    type: ask.type ?? 'question',
    message: ask.message,
    ...(ask.detail === undefined ? {} : { detail: ask.detail }),
    buttons: ['Cancel', ask.verb],
    noLink: true,
    defaultId: 0,
    cancelId: 0
  }
  const answer = parent === null ? await dialog.showMessageBox(options) : await dialog.showMessageBox(parent, options)
  return answer.response === 1
}
