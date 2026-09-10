/* Pure group geometry and persistence helpers, bundled for plain-node checks. */
module.exports = {
  ...require('../src/renderer/groups/groups'),
  ...require('../src/renderer/panels/panels'),
  ...require('../src/renderer/canvas/lod'),
  // M203 (D08). Task membership is membership, like a group's: derived, never owned.
  ...require('../src/renderer/canvas/task-members'),
  ...require('../src/shared/layout-schema')
}
