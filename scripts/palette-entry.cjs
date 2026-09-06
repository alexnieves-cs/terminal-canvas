/* Bundle entry for the palette's pure modules. No DOM, no React, no native
   dependency, so the suite runs under plain node — the same tier as
   viewport-entry.cjs. Palette.tsx and usePalette.ts are deliberately absent:
   they are the React layer, and pulling them in would drag react into a
   bundle that exists precisely to avoid needing a renderer. */
module.exports = {
  /* M89. The one not-connected sentence, so the check can compare bytes. */
  ...require('../src/shared/credential-schema'),
  ...require('../src/renderer/palette/fuzzy'),
  ...require('../src/renderer/palette/palette-model'),
  ...require('../src/renderer/palette/commands'),
  /* M65. The spawn sheet's model — pure. */
  ...require('../src/renderer/palette/spawn-sheet'),
  /* M80. The template model: holes, fill, placement, the named refusal. */
  ...require('../src/renderer/palette/template-model'),
  /* M104. The lineups and their preview plan — pure. */
  ...require('../src/shared/lineups'),
  /* M66. The settings definitions, for the voice check. */
  ...require('../src/shared/settings-schema')
}
