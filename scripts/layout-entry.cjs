/* esbuild entry for the layout suite. The schema is pure and the store takes
   its file path as a parameter, so neither needs Electron or a DOM — which is
   what keeps this suite in the cheap plain-node tier. */
module.exports = {
  ...require('../src/shared/layout-schema'),
  /* M6b: the settings schema is pure data with no imports at all, so it costs
     this tier nothing and gets covered by the suite that already owns the
     on-disk format it is stored in. */
  ...require('../src/shared/settings-schema'),
  ...require('../src/shared/panel-geometry'),
  ...require('../src/renderer/panels/layout-adapt'),
  /* M9b: panels.ts is type-only imports plus pure data/functions (makePanel,
     makeReviewPanel, cascadeCentre, ...) — no DOM, no electron — so it costs
     this tier nothing and check 108b needs makeReviewPanel from it. */
  ...require('../src/renderer/panels/panels'),
  ...require('../src/main/layout-store'),
  /* M5a: the preset helpers are pure — availability takes an injected `which`
     rather than importing shell-env — so they belong in this cheap tier
     rather than forcing a new Electron suite. */
  ...require('../src/main/presets'),
  /* M5b: prompts.ts reads .claude/commands with node:fs against a cwd passed
     in as a parameter — same shape as layout-store.ts's file path — so it
     stays in this tier despite touching the filesystem. */
  ...require('../src/main/prompts'),
  /* M20: fs-tree.ts reads one directory with node:fs against a path passed in
     as a parameter — the same shape as prompts.ts above, and it stays in this
     tier for the same reason: it is `electron` and `node-pty` that move a
     module out of the plain-node tier, not the filesystem. Numbered M13
     during its own design and implementation; renumbered on merge — a
     different, unrelated milestone had already claimed M13. */
  ...require('../src/main/fs-tree'),
  /* M65. The spawn sheet's resolver: pure over an injected directory test. */
  ...require('../src/main/spawn-request')
}
