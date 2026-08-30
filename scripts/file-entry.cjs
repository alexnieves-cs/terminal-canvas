/* esbuild entry for verify:file. Re-exports the two main-side modules the
   suite drives. Mirrors scripts/rail-entry.cjs. */
module.exports = {
  ...require('../src/main/file-read.ts'),
  ...require('../src/main/file-watch.ts')
}
