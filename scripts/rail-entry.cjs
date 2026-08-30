/* Bundle entry for the shell's and the canvas's pure view models. No React,
   no DOM, no native dependencies, so the suite runs under plain node — the
   cheapest tier this repo has. M8c's inspector rows and M8d's workspace and
   attention rows both joined this entry rather than getting suites of their
   own. */
module.exports = {
  ...require('../src/renderer/shell/rail-rows'),
  ...require('../src/renderer/shell/inspector-fields'),
  ...require('../src/renderer/shell/rail-sections'),
  /* M9b: the review node's model is a canvas module rather than a shell one,
     and it joins this bundle anyway for the reason M8c's inspector fields and
     M8d's rail sections both did — it is pure (no React, no DOM, type-only
     imports), and a suite of its own would re-prove the same esbuild wiring
     for one file. */
  ...require('../src/renderer/review/review-node-model'),
  /* M11: the nav grid's cell arithmetic. A canvas module joining this bundle
     for the same reason review-node-model.ts did — pure, type-only imports,
     and a suite of its own would re-prove this esbuild wiring for one file. */
  ...require('../src/renderer/navgrid/nav-grid')
}
