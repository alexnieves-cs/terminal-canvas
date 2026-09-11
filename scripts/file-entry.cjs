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
  /* M126. The enabled plugins, over an injected one-shot runner. */
  ...require('../src/main/plugin-list.ts'),
  /* M130. The live skill trail: the pure scan/cap, and main's tail-from-a-
     byte-offset read over injected pinnedSession/resolveTranscript/readDelta. */
  ...require('../src/shared/skill-trail.ts'),
  ...require('../src/main/skill-trail-read.ts'),
  /* M120. The sandbox cwd, pure over injected mkdir/rm. */
  ...require('../src/main/sandbox.ts'),
  /* M122. Find in panels: pure over the two logs' readers; the transcript log is bundled for the fixture. */
  ...require('../src/main/panel-search.ts'),
  ...require('../src/main/agent-transcript-log.ts'),
  /* M123. The update check, pure over an injected fetcher — no https here;
     the real fetcher lives in main/index.ts, which no suite bundles. */
  ...require('../src/main/update-check.ts'),
  /* M145. The clipboard-image file: pure over an injected directory and clock; the real
     clipboard read lives in main/index.ts, which no suite bundles. Absent until it lands. */
  ...((() => { try { return require('../src/main/clipboard-file.ts') } catch { return {} } })()),
  /* M181. The image read (magic number, cap, three named arms) and the
     starter's two files, both node:fs against a path passed in — the tier
     file-read.ts sits in. Absent until they land, the clipboard-file shape. */
  ...((() => { try { return require('../src/main/image-read.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/main/starter-prepare.ts') } catch { return {} } })()),
  /* M196. The scope policy's pure half — preview.ts delegates its two path
     helpers to it, so this must be present for those to resolve. */
  ...((() => { try { return require('../src/shared/work-scope.ts') } catch { return {} } })()),
  /* M196. The scope resolver and the memory door built on it, so the store's
     KEY can be driven end to end against the real JSONL beside it. */
  ...((() => { try { return require('../src/main/work-scope.ts') } catch { return {} } })()),
  // M185. The preview's pure rules and main's discoverer, which executes nothing.
  ...((() => { try { return require('../src/shared/preview.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/main/preview-discover.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/main/preview-capture.ts') } catch { return {} } })()),
  // M186. The asset store's pure rules and the store itself.
  ...((() => { try { return require('../src/shared/assets.ts') } catch { return {} } })()),
  ...((() => { try { return require('../src/main/asset-store.ts') } catch { return {} } })()),
  // M188. The http node's one request, over an injected fetcher.
  ...((() => { try { return require('../src/main/node-run.ts') } catch { return {} } })()),
  // M189. The portable file: both halves, pure.
  ...((() => { try { return require('../src/shared/portable.ts') } catch { return {} } })()),
  // M190. The feedback draft this app never submits.
  ...((() => { try { return require('../src/shared/feedback.ts') } catch { return {} } })()),
  // M251. The pack file: a discipline's library objects, read before added.
  ...((() => { try { return require('../src/shared/pack.ts') } catch { return {} } })())
}
