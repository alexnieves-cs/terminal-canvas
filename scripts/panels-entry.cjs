/* Bundle entry for verify-panels.cjs: re-exports the pty layer pieces that
   main/index.ts normally wires up at startup. verify-panels.cjs is its own
   Electron entry point (see the sibling verify-*.cjs scripts), so nothing
   else registers ipcMain handlers for it — without this, pty:create/pty:list
   have no handler and every renderer call against window.canvas.pty rejects. */
module.exports = {
  registerIpcHandlers: require('../src/main/ipc').registerIpcHandlers,
  PtyManager: require('../src/main/pty-manager').PtyManager,
  createDirectBackend: require('../src/main/session-backend').createDirectBackend,
  // Check 26 swaps the manager onto a REAL tmux backend (its own socket) and
  // reloads the renderer: reload survival is a tmux property, so a direct
  // backend cannot express it at all.
  createTmuxBackend: require('../src/main/session-backend').createTmuxBackend,
  buildTmuxConf: require('../src/main/tmux-args').buildTmuxConf,
  // The same listener main/index.ts installs. Check 26 needs a renderer
  // teardown to reach the real detachAll(), not a lambda written here that
  // could drift from what production does.
  attachPtyLifecycle: require('../src/main/window-lifecycle').attachPtyLifecycle,
  resolveShellEnv: require('../src/main/shell-env').resolveShellEnv,
  // Git is resolved by ABSOLUTE path from the login env, exactly as
  // main/index.ts does — see git-runner.ts. A harness that spawned the
  // bare name would be testing a code path production no longer has.
  whichFromEnv: require('../src/main/shell-env').whichFromEnv,
  // Re-exported whole (not just createLayoutStore) so Task 8's check can build
  // a store, hand it to registerIpcHandlers, and later call flushSync() on the
  // SAME instance to force its 500ms-debounced write deterministically.
  ...require('../src/main/layout-store'),
  // M4b: panels now come from layout:load instead of a hardcoded constant, so
  // this suite has to seed the store's file with SEED_PANELS itself before the
  // window loads, or it boots the one-panel first-run canvas instead of the
  // twelve-panel fixture its checks (1, 3, 15, ...) depend on.
  fromPanels: require('../src/renderer/panels/layout-adapt').fromPanels,
  SEED_PANELS: require('../src/renderer/panels/panels').SEED_PANELS,
  /* Check 51 reads the cascade step from the source of truth rather than
     restating 48 here: a literal in the harness would keep passing against a
     changed constant, i.e. the suite would agree with itself while the app
     did something else. Same rule as SEED_PANELS/DEFAULT_CAMERA above. */
  CASCADE_STEP: require('../src/renderer/panels/panels').CASCADE_STEP,
  DEFAULT_CAMERA: require('../src/shared/layout-schema').DEFAULT_CAMERA,
  /* Check 32 installs the SAME did-finish-load push production installs, so
     it can prove the renderer is listening at the moment main really sends —
     a send hand-written here would prove the harness right and leave the app
     inert, which is the defect that check exists for. */
  pushDefaultPreset: require('../src/main/presets').pushDefaultPreset,
  /* Check 38 drives a rename all the way from the palette to the store and
     back out through preset:list, so its PaletteHandlers (named
     PresetHandlers until M5b's prompt channels joined the same interface)
     cannot be the stub the other checks were happy with: list has to answer
     with the real rows main would build, or the palette has no user preset
     to rename. */
  allPresets: require('../src/main/presets').allPresets,
  resolveAvailability: require('../src/main/presets').resolveAvailability,
  presetRows: require('../src/main/presets').presetRows,
  /* Check 90's palette.savePanel handler mints through the SAME function
     main/index.ts's does — a lambda here that rebuilt the preset by hand
     would prove the harness right and leave production's shared mint
     unexercised end to end. */
  presetFromCapture: require('../src/main/presets').presetFromCapture,
  /* Check 40a drives preset:spawn-by-id end to end, and the harness answers
     that invoke the way main/index.ts's onSpawnPreset does: resolve the id,
     then push the SAME template a menu pick would. templateOf is what makes
     the two paths one path rather than two that can drift. */
  templateOf: require('../src/main/presets').templateOf,
  /* Check 40's prompt list comes from the real merge, so the rows the palette
     renders are the rows main would build — not a shape invented here, and
     check 43 needs the PROJECT half of that list too: readProjectPrompts +
     resolveCwd are the two lines main/index.ts's listPrompts is made of, and
     until check 43 nothing anywhere exercised them together. A regression in
     that pair (the wrong cwd, an unexpanded '~', a swapped source label)
     produces FEWER rows, which reads exactly like "this project has no
     commands" — the silent shape this suite exists for. */
  mergePrompts: require('../src/main/prompts').mergePrompts,
  readProjectPrompts: require('../src/main/prompts').readProjectPrompts,
  resolveCwd: require('../src/main/pty-manager').resolveCwd,
  /* Check 30 drives the capture round trip through the SAME helper main uses,
     rather than a lambda here that could drift from production. */
  requestFromRenderer: require('../src/main/ipc').requestFromRenderer,
  IPC_EVENTS: require('../src/shared/ipc-contract').IPC_EVENTS,
  /* Task 9's end-to-end review:panel check needs registerIpcHandlers wired to
     a REAL engine over a REAL git runner — a stub here would prove nothing
     past the preload, the same reasoning every other real export in this file
     already states. The harness builds the engine itself (verify-panels.cjs),
     since createReviewEngine's baselineOf/peersInRepo deps close over that
     file's own LayoutStore instance; only the two constructors are exported. */
  createReviewEngine: require('../src/main/review-engine').createReviewEngine,
  createGitRunner: require('../src/main/git-runner').createGitRunner,
  /* Check 99-101's baselines are captured at spawn, not invented in the
     harness: PtyManager's captureBaseline/dropBaseline hooks default to
     no-ops (see pty-manager.ts's constructor comment — "the verify harnesses
     construct this manager directly and must keep compiling"), so without
     this export every review:panel query in this suite would answer
     never-started forever, on a correctly-wired engine. main/index.ts's own
     baselineCapture is built from this same constructor over the same
     layoutStore the harness already owns; only the constructor is exported,
     the same trade createReviewEngine/createGitRunner already make. */
  createBaselineCapture: require('../src/main/baseline-capture').createBaselineCapture,
  /* Task 8's checks 113-115 drive the write verb end to end and need
     registerIpcHandlers wired to a REAL committer over a REAL git runner —
     the same reasoning createReviewEngine/createGitRunner above already
     state, and the same trade: only the constructor is exported, and the
     harness builds the committer itself so its tempIndexPath/removeTempIndex
     deps can close over that file's own scratch directory. */
  createReviewCommitter: require('../src/main/review-commit').createReviewCommitter
}
