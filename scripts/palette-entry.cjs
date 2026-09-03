/* Bundle entry for the palette's pure modules. No DOM, no React, no native
   dependency, so the suite runs under plain node — the same tier as
   viewport-entry.cjs. Palette.tsx and usePalette.ts are deliberately absent:
   they are the React layer, and pulling them in would drag react into a
   bundle that exists precisely to avoid needing a renderer. */
module.exports = {
  ...require('../src/renderer/palette/fuzzy'),
  ...require('../src/renderer/palette/palette-model'),
  ...require('../src/renderer/palette/commands'),
  /* M65. The spawn sheet's model — pure. */
  ...require('../src/renderer/palette/spawn-sheet')
}
