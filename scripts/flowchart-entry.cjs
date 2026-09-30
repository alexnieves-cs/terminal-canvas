/* M388. The flowchart's pure modules, bundled for verify:flowchart. A module
   that does not exist yet is simply absent from the bundle's exports; each
   check file refuses by name when the functions it needs are missing, so a
   half-built branch is red, never vacuously green. */
module.exports = {
  record: require('../src/shared/flowchart'),
  mermaid: require('../src/shared/flowchart-mermaid'),
  layout: require('../src/shared/flowchart-layout'),
  geometry: require('../src/shared/flowchart-geometry'),
  svg: require('../src/shared/flowchart-svg'),
  arrange: require('../src/renderer/canvas/arrange'),
  files: require('../src/main/flowchart-files'),
  // M392. A teammate's flowchart as the canvas draws it, and the router it feeds.
  shared: require('../src/renderer/flowchart/shared-shapes'),
  connectors: require('../src/renderer/flowchart/connector-model')
}
