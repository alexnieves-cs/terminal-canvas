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
  // The startup splash's mode table and field math (splash.1, splash.2).
  ...require('../src/renderer/canvas/splash'),
  ...require('../src/renderer/panels/panels'),
  // M187. The note kind's pure rules travel with the panel factories they shape.
  ...require('../src/shared/notes'),
  /* M93. Annotation anchoring is pure geometry. */
  ...require('../src/shared/annotations'),
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
  ...require('../src/renderer/panels/history'),
  /* M78. The handoff table (shared, pure) and the join reducer. */
  ...require('../src/shared/handoff'),
  ...require('../src/renderer/canvas/handoff-rules'),
  /* M79. Runs: the component, the roots, the reducer, the cost. */
  ...require('../src/renderer/canvas/run-model'),
  ...require('../src/shared/runs'),
  /* M181. STARTER_OBJECTS is pure geometry (rects relative to the agent's).
     Required inside a try so this bundle still builds before the module
     exists and starter.plan.1 fails by name instead of aborting the suite. */
  ...((() => { try { return require('../src/shared/starter.ts') } catch { return {} } })()),
  /* M184. The run's outcome per block, pure over the run's own record. */
  ...((() => { try { return require('../src/shared/run-outcome.ts') } catch { return {} } })()),
  /* M230. Edge activity: the six states an edge can be in, as a pure reducer
     over signals that already exist on the wire. Inside a try like its two
     neighbours, so this bundle still builds before the module exists and the
     checks fail BY NAME instead of aborting the suite — a check that THROWS
     takes every check below it with it, and its RED is then not evidence. */
  ...((() => { try { return require('../src/shared/edge-activity.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/renderer/canvas/task-clusters.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/renderer/canvas/task-members.ts') } catch { return {} } })())
}
