/* esbuild entry for verify:file. Spreads the shared type module directly —
   file-panel.ts is pure data (FileResult, the caps) with no reason to be
   re-exported through file-read.ts just so the fixture can reach it, the
   same shape layout-entry.cjs uses for shared/layout-schema and
   review-entry.cjs uses for main/git-args, main/review-engine and
   main/git-runner. Mirrors scripts/rail-entry.cjs for the two main-side
   modules the suite actually drives. */
module.exports = {
  ...require('../src/shared/file-panel'),
  ...require('../src/main/file-read.ts'),
  ...require('../src/main/file-watch.ts'),
  /* M22: the write verb, in this same plain-node tier for file-read.ts's own
     reason — node:fs is not what moves a module out of it. */
  ...require('../src/main/file-write.ts'),
  /* M27: the note's creation verb, same tier and same reason. */
  ...require('../src/main/file-create.ts'),
  /* M39: the per-panel append log, same tier and same reason. */
  ...require('../src/main/scrollback-log.ts')
}
