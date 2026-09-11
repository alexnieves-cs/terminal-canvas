/* esbuild entry for verify:deck-export (M251). The .pptx mapping over M248's
   deck, and main's exporter over an injected save dialog — pptxgenjs is plain
   JS, so the real library writes a real .pptx in the plain-node tier. Absent
   until they land, the clipboard-file shape, so a missing module reads red
   rather than crashing. Named apart from M248's `deck-entry.cjs`, whose suite
   owns the deck model itself. */
module.exports = {
  ...((() => { try { return require('../src/shared/deck-pptx.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/main/deck-export.ts') } catch { return {} } })())
}
