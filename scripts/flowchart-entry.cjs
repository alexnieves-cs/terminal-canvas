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
  /* The canvas-side pure modules the flowchart rides on: conversion, the
     in-app clipboard, the connector view cache, the keyboard helpers, the
     panel verbs and the persistence path. Each check file refuses by name
     when the key it needs is absent. */
  convert: require('../src/renderer/flowchart/flow-convert'),
  clipboard: require('../src/renderer/flowchart/object-clipboard'),
  connectorModel: require('../src/renderer/flowchart/connector-model'),
  shapeKeys: require('../src/renderer/canvas/useShapeKeys'),
  panels: require('../src/renderer/panels/panels'),
  adapt: require('../src/renderer/panels/layout-adapt'),
  layoutSchema: require('../src/shared/layout-schema'),
  recover: require('../src/renderer/panels/recover'),
  taskPlan: require('../src/shared/task-plan')
}
