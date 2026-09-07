/* esbuild entry for verify:file. Spreads the shared type module directly —
   file-panel.ts is pure data (FileResult, the caps) with no reason to be
   re-exported through file-read.ts just so the fixture can reach it, the
   same shape layout-entry.cjs uses for shared/layout-schema and
   review-entry.cjs uses for main/git-args, main/review-engine and
   main/git-runner. Mirrors scripts/rail-entry.cjs for the two main-side
   modules the suite actually drives. */
module.exports = {
  /* M83. The project memory store: node:fs against an injected directory,
     the scrollback log's own shape, with the M39 scrubber on every write. */
  ...require('../src/main/memory-store'),
  /* M101. The routine runner over injected timers, and the record's own rules. */
  ...require('../src/main/routine-runner'),
  /* M107. The environment report: pure over injected facts. */
  ...require('../src/main/env-report'),
  ...require('../src/shared/routines'),
  ...require('../src/shared/file-panel'),
  ...require('../src/main/file-read.ts'),
  ...require('../src/main/file-watch.ts'),
  /* M22: the write verb, in this same plain-node tier for file-read.ts's own
     reason — node:fs is not what moves a module out of it. */
  ...require('../src/main/file-write.ts'),
  /* M27: the note's creation verb, same tier and same reason. */
  ...require('../src/main/file-create.ts'),
  /* M39: the per-panel append log, same tier and same reason. */
  ...require('../src/main/scrollback-log.ts'),
  /* M52: the run ledger, an append stream beside layout.json, same tier. */
  ...require('../src/main/run-ledger.ts'),
  ...require('../src/main/export.ts'),
  /* M84: the watcher's pure trigger vocabulary and its runner over an
     injected spawn — the agent runner's seam, one tier down. */
  /* M85. The vault: the link syntax and the index are pure; the read is a
     node:fs walk, the tier file-read.ts already sits in. */
  ...require('../src/shared/vault.ts'),
  ...require('../src/main/vault-read.ts'),
  ...require('../src/shared/watch-trigger.ts'),
  ...require('../src/main/watch-runner.ts'),
  ...require('../src/shared/redact.ts'),
  /* M103. The browser pane's read, over injected getUrl/evaluate: the scheme
     check and the cap and the outward gate, with no webview in earshot. */
  ...require('../src/shared/browser-panel.ts'),
  ...require('../src/main/browser-read.ts'),
  /* M112. Telemetry's decision and its scrubber: pure over injected paths. */
  ...require('../src/main/telemetry.ts'),
  /* M114. The lane: pure over injected origin/subdir readers, a fake gate and a fake worktree manager. */
  ...require('../src/main/board-repo.ts'),
  ...require('../src/main/board-lane.ts'),
  /* M125. The enabled plugins, over an injected one-shot runner. */
  ...require('../src/main/plugin-list.ts'),
  /* M129. The live skill trail: the pure scan/cap, and main's tail-from-a-
     byte-offset read over injected pinnedSession/resolveTranscript/readDelta. */
  ...require('../src/shared/skill-trail.ts'),
  ...require('../src/main/skill-trail-read.ts')
}
