/* Bundle entry: re-exports the contract and the registrar together so the
   test compares them as they actually ship. */
module.exports = {
  ...require('../src/shared/ipc-contract'),
  ...require('../src/main/ipc')
}
