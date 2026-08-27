/* Bundle entry for the canvas math tests. Pure TypeScript modules with no
   native dependencies, so the suite runs under plain node. */
module.exports = {
  ...require('../src/renderer/canvas/viewport'),
  ...require('../src/renderer/canvas/canvas-input'),
  ...require('../src/renderer/canvas/lod'),
  ...require('../src/renderer/canvas/panel-interaction'),
  ...require('../src/renderer/canvas/pointer-correct'),
  ...require('../src/renderer/canvas/attention'),
  ...require('../src/renderer/panels/panels'),
  ...require('../src/renderer/panels/history')
}
