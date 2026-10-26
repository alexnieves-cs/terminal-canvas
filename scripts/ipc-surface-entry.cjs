/* Bundle entry: re-exports the contract and the registrar together so the
   test compares them as they actually ship. */
module.exports = {
  ...require('../src/shared/ipc-contract'),
  ...require('../src/main/ipc'),
  // Installed from main/index.ts, not from registerIpcHandlers.
  ...require('../src/main/tmux-adopt'),
  // M543. Installed from main/index.ts beside tmux:adopt, for the same reason.
  ...require('../src/main/bootstrap/cloud-wiring')
}
