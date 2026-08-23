import type { BrowserWindow } from 'electron'

/**
 * Ties a window's PTYs to the lifetime of the renderer that asked for them.
 *
 * The renderer kills its own PTY on React cleanup, but there are two everyday
 * paths where that cleanup never runs: Cmd+R (the View menu ships `reload`)
 * and Cmd+W. Both destroy the page without unmounting, so no `pty:kill` is
 * sent. The next page then calls `pty:create` with the same panelId and hits
 * "already has a live PTY" — an unrecoverable dead panel — while the original
 * process runs on, orphaned.
 *
 * Killing on renderer teardown is the M1-sized fix: a reload gives you a fresh
 * shell. Surviving a reload instead of dying is M4's job, once tmux backs the
 * session and there is something worth reattaching to.
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
