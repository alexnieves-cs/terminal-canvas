/* Pure group geometry and persistence helpers, bundled for plain-node checks. */
module.exports = {
  ...require('../src/renderer/groups/groups'),
  ...require('../src/renderer/panels/panels'),
  ...require('../src/renderer/canvas/lod'),
  ...require('../src/shared/layout-schema')
}
