import type { BrowserWindow } from 'electron'

/**
 * Ties a window's PTY CLIENTS to the lifetime of the renderer that asked for
 * them — and, since M4c, only the clients.
 *
 * The renderer kills its own PTY on React cleanup, but two everyday paths never
 * run that cleanup: Cmd+R (the View menu ships `reload`) and Cmd+W. Both
 * destroy the page without unmounting, so no `pty:kill` is sent.
 *
 * Before M4c the fix was to kill the process outright, and a reload gave you a
 * fresh shell. Now the callback DETACHES instead: the local handle dies, the
 * tmux session behind it keeps running, and the next page's `pty:create` hits
 * `new-session -A` and lands back in the same process.
 *
 * The stale-session problem this file was written for is unchanged and still
 * handled — main's session map is emptied, so the next `pty:create` finds no
 * conflict and never throws "already has a live PTY".
 */
export function attachPtyLifecycle(win: BrowserWindow, onRendererGone: () => void): void {
  // Fires before the replacement page loads, so the old page's sessions are
  // gone by the time the new one starts creating panels. Also fires for the
  // very first load, where there is nothing to kill and this is a no-op.
  //
  // Not `did-start-loading`: that fires only on the transition into loading,
  // so a reload issued while the page is still settling is silently missed.
  // `did-start-navigation` fires per navigation. Same-document navigations
  // (hash changes) keep the renderer alive, so they must not kill anything.
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) onRendererGone()
  })
  // A crashed or killed renderer never runs cleanup either.
  win.webContents.on('render-process-gone', onRendererGone)
  win.on('closed', onRendererGone)
}
