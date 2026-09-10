/* M248. The deck's pure modules, bundled once for verify:deck. No electron, no
   React: deck-pdf.ts takes its BrowserWindow as an injected `render`. */
module.exports = {
  draft: require('../src/shared/draft-review'),
  deck: require('../src/shared/deck'),
  session: require('../src/shared/deck-session'),
  md: require('../src/shared/markdown'),
  pdf: require('../src/main/deck-pdf'),
  portable: require('../src/shared/portable'),
  layout: require('../src/shared/layout-schema'),
  adapt: require('../src/renderer/panels/layout-adapt'),
  panels: require('../src/renderer/panels/panels'),
  file: { ...require('../src/main/file-read'), ...require('../src/main/file-write') }
}
