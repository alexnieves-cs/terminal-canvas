/* esbuild entry for verify:deck (M246). The deck's pure parse and main's
   exporter over an injected save dialog — pptxgenjs is plain JS, so the real
   library writes a real .pptx in the plain-node tier. Absent until they land,
   the clipboard-file shape, so a missing module reads red rather than crashing. */
module.exports = {
  ...((() => { try { return require('../src/shared/deck.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/main/deck-export.ts') } catch { return {} } })()),
  ...require('../src/shared/layout-schema.ts'),
  ...require('../src/shared/portable.ts')
}
