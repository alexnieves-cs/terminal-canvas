/* esbuild entry for the layout suite. The schema is pure and the store takes
   its file path as a parameter, so neither needs Electron or a DOM — which is
   what keeps this suite in the cheap plain-node tier. */
module.exports = {
  /* M93. The snapshot ring: injected dir/now, plain node. */
  ...require('../src/main/layout-snapshots'),
  ...require('../src/shared/annotations'),
  /* M113. The board's record: pure data and rules. */
  ...require('../src/shared/work-items'),
  /* M120. The chat record's marks (dispatch, sandbox) and their carry. */
  ...require('../src/shared/chat-panel'),
  ...require('../src/shared/layout-schema'),
  /* M131. The three workflow node kinds: pure parse over a raw node object. */
  ...require('../src/shared/workflow-nodes'),
  /* M132. The workflow panel's DIAGRAM: pure over the template record — no
     DOM, no React, no node — so the projection, the Runs filter and the
     watcher a trigger becomes are all checked in this cheap tier, beside
     the schema they project. Only "Run reaches M80's instantiation" needs a
     real renderer, and that lives in verify:panels. */
  ...require('../src/renderer/workflow/workflow-diagram'),
  /* M84's trigger words, so workflow.panel.1d can assert the round-tripped
     trigger still reads in the ONE vocabulary rather than restating it. */
  ...require('../src/shared/watch-trigger'),
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
