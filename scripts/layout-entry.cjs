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
  ...require('../src/main/layout-store'),
  /* M5a: the preset helpers are pure — availability takes an injected `which`
     rather than importing shell-env — so they belong in this cheap tier
     rather than forcing a new Electron suite. */
  ...require('../src/main/presets'),
  /* M5b: prompts.ts reads .claude/commands with node:fs against a cwd passed
     in as a parameter — same shape as layout-store.ts's file path — so it
     stays in this tier despite touching the filesystem. */
  ...require('../src/main/prompts')
}
