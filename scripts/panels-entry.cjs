/* Bundle entry for verify-panels.cjs: re-exports the pty layer pieces that
   main/index.ts normally wires up at startup. verify-panels.cjs is its own
   Electron entry point (see the sibling verify-*.cjs scripts), so nothing
   else registers ipcMain handlers for it — without this, pty:create/pty:list
   have no handler and every renderer call against window.canvas.pty rejects. */
module.exports = {
  registerIpcHandlers: require('../src/main/ipc').registerIpcHandlers,
  PtyManager: require('../src/main/pty-manager').PtyManager,
  resolveShellEnv: require('../src/main/shell-env').resolveShellEnv,
  createLayoutStore: require('../src/main/layout-store').createLayoutStore,
  // M4b: panels now come from layout:load instead of a hardcoded constant, so
  // this suite has to seed the store's file with SEED_PANELS itself before the
  // window loads, or it boots the one-panel first-run canvas instead of the
  // twelve-panel fixture its checks (1, 3, 15, ...) depend on.
  fromPanels: require('../src/renderer/panels/layout-adapt').fromPanels,
  SEED_PANELS: require('../src/renderer/panels/panels').SEED_PANELS,
  DEFAULT_CAMERA: require('../src/shared/layout-schema').DEFAULT_CAMERA
}
