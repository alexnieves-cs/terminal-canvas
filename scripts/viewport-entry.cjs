/* Bundle entry for the canvas math tests. Pure TypeScript modules with no
   native dependencies, so the suite runs under plain node. */
module.exports = {
  ...require('../src/renderer/canvas/viewport'),
  ...require('../src/renderer/canvas/canvas-input'),
  ...require('../src/renderer/canvas/lod')
}
