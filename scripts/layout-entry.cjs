/* esbuild entry for the layout suite. The schema is pure and the store takes
   its file path as a parameter, so neither needs Electron or a DOM — which is
   what keeps this suite in the cheap plain-node tier. */
module.exports = {
  ...require('../src/shared/layout-schema'),
  ...require('../src/shared/panel-geometry'),
  ...require('../src/renderer/panels/layout-adapt'),
  ...require('../src/main/layout-store')
}
