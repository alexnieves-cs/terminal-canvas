/* Bundle entry for M701's local event log. The record format and its
   arithmetic (pure), the writer (node:fs and node:crypto only, no electron)
   and the settings schema the switch lives in. Plain-node tier. */
module.exports = {
  ...require('../src/shared/event-log'),
  ...require('../src/main/event-log'),
  ...require('../src/shared/settings-schema')
}
