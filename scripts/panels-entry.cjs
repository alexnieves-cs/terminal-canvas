/* Bundle entry for verify-panels.cjs: re-exports the pty layer pieces that
   main/index.ts normally wires up at startup. verify-panels.cjs is its own
   Electron entry point (see the sibling verify-*.cjs scripts), so nothing
   else registers ipcMain handlers for it — without this, pty:create/pty:list
   have no handler and every renderer call against window.canvas.pty rejects. */
module.exports = {
  registerIpcHandlers: require('../src/main/ipc').registerIpcHandlers,
  PtyManager: require('../src/main/pty-manager').PtyManager,
  resolveShellEnv: require('../src/main/shell-env').resolveShellEnv,
  createLayoutStore: require('../src/main/layout-store').createLayoutStore
}
