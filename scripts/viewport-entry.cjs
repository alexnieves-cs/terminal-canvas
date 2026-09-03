/* Bundle entry for the canvas math tests. Pure TypeScript modules with no
   native dependencies, so the suite runs under plain node. */
module.exports = {
  ...require('../src/renderer/canvas/viewport'),
  ...require('../src/renderer/canvas/canvas-input'),
  ...require('../src/renderer/canvas/lod'),
  ...require('../src/renderer/canvas/spatial-order'),
  ...require('../src/renderer/canvas/panel-interaction'),
  ...require('../src/renderer/canvas/pointer-correct'),
  ...require('../src/renderer/canvas/attention'),
  ...require('../src/renderer/panels/panels'),
  // M49. toPanels/fromPanels: the sixth absent-stays-absent copy site.
  ...require('../src/renderer/panels/layout-adapt'),
  // M50. Snapping and tidy: pure rect math over applyDrag's output.
  ...require('../src/renderer/canvas/placement'),
  ...require('../src/renderer/panels/recover'),
  ...require('../src/renderer/canvas/flight'),
  ...require('../src/renderer/canvas/card-detail'),
  // M69. The minimap's projection, its inverse, the centred camera.
  ...require('../src/renderer/canvas/minimap'),
  // M51. The link scanner, shared and pure.
  ...require('../src/shared/link-scan'),
  /* M13: the link geometry. Pure — its only value import is linksOf from
     panels.ts, which is already in this bundle — so it belongs in the cheapest
     tier beside viewport.ts and lod.ts. Note that this import is what forced
     verify-viewport.cjs's esbuild config to resolve @renderer as well as
     @shared: every other cross-boundary import here is `import type`. */
  ...require('../src/renderer/canvas/link-geometry'),
  ...require('../src/renderer/panels/history')
}
