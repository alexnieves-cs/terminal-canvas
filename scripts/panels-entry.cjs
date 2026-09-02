/* Bundle entry for verify-panels.cjs: re-exports the pty layer pieces that
   main/index.ts normally wires up at startup. verify-panels.cjs is its own
   Electron entry point (see the sibling verify-*.cjs scripts), so nothing
   else registers ipcMain handlers for it — without this, pty:create/pty:list
   have no handler and every renderer call against window.canvas.pty rejects. */
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

/* THE FENCE. pty-manager.ts's resolveProjectsRoot() reads
   TC_CLAUDE_PROJECTS, falling back to the real homedir()/.claude/projects
   in production — that fallback exists precisely so a developer's real
   installation needs no override. This harness is not a developer's real
   installation: verify-panels.cjs (and verify-canvas.cjs, which bundles
   this same file) constructs exactly ONE PtyManager, inside
   app.whenReady(), and resolveProjectsRoot() runs once, synchronously,
   inside that constructor's own field initializer
   (`subagentWatch = new SubagentWatch(createFsWatchDeps())`). So whatever
   this env var holds at that moment is baked in for the life of the run —
   there is no second chance to fence it once that line has executed.

   This module is required (via esbuild's bundled ENTRY_OUT) at the very
   top of verify-panels.cjs, long before app.whenReady() ever runs, which
   is what makes setting it here — at module load, not inside
   app.whenReady() — early enough. Left unset, PtyManager's subagent
   watcher polls the running developer's REAL ~/.claude/projects every 2s
   for the whole suite and attributes whatever real sessions it finds
   there to fixture panels that were never involved in them — the exact
   mistake M9a's git fixtures made against the developer's whole home
   directory (see CLAUDE.md's note on `verify:panels` 99-101 fencing its
   git runner to its own temp prefixes), caught only because it blew the
   suite's own watchdog rather than failing a check that pointed at the
   cause.

   Checks 118-120 read this SAME value back out of process.env — a single
   process, so the assignment is visible everywhere — and write their
   fixture session/transcript data into it, rather than minting a second
   root of their own that the already-constructed PtyManager could never
   see.

   Spaced, this repo's standing rule since the pane-died quoting bug: an
   unquoted downstream consumer (a shell `cd`, an argv built by
   concatenation rather than an array) would otherwise fail exactly as
   silently as that one did. */
/* M21's fence, and it exists for the identical reason the one below it does —
   which that comment records as a mistake this repo made once and paid a fix
   round for. `resolveToolboxHome()` falls back to the real homedir() in
   production, so unfenced this harness reads the RUNNING DEVELOPER's own
   ~/.claude on every toolbox read and attributes 22 real skills and 26 real
   plugins to a fixture panel — green on a machine with an empty home and red
   on one without, for a reason nothing in the suite explains. Set before
   anything constructs a PtyManager, because configStamps() is taken inside
   create(). */
if (!process.env.TC_TOOLBOX_HOME || process.env.TC_TOOLBOX_HOME.trim() === '') {
  process.env.TC_TOOLBOX_HOME = mkdtempSync(join(tmpdir(), 'tc toolbox home '))
}
if (!process.env.TC_CLAUDE_PROJECTS || process.env.TC_CLAUDE_PROJECTS.trim() === '') {
  process.env.TC_CLAUDE_PROJECTS = mkdtempSync(join(tmpdir(), 'tc claude projects '))
}

// M14 Task 5: registerIpcHandlers now takes a CredentialStore as its final
// positional parameter, so this harness needs one too or every credential:*
// handler throws the moment a check reaches it (Task 8). A fake, reversible
// crypto — the same one verify-credentials.cjs uses — and a scratch temp
// directory, so this suite never touches the real OS keychain or the real
// userData credentials.json.
const fakeCredentialCrypto = {
  available: () => true,
  encrypt: (s) => Buffer.from('enc:' + s, 'utf8'),
  decrypt: (b) => b.toString('utf8').replace(/^enc:/, '')
}
const credentialDir = mkdtempSync(join(tmpdir(), 'tc panels credentials '))
const credentialStore = require('../src/main/credential-store').createCredentialStore({
  filePath: join(credentialDir, 'credentials.json'),
  crypto: fakeCredentialCrypto
})

module.exports = {
  credentialStore,
  // Task 8's check is the first thing that ever writes through this store, so
  // this directory is empty on every run before it. Once it isn't,
  // 'enc:' + token is a trivially reversible fixture token left behind in the
  // OS temp directory forever unless something rmSyncs it — the same
  // obligation verify-credentials.cjs discharges for its own scratch dir.
  // Exported rather than removed here, because this module has no run-end
  // hook of its own; verify-panels.cjs already owns exactly this cleanup
  // shape for its other fixture directories (crepo/repo/notRepo) and is
  // where the credential check itself runs.
  credentialDir,
  registerIpcHandlers: require('../src/main/ipc').registerIpcHandlers,
  PtyManager: require('../src/main/pty-manager').PtyManager,
  // registerIpcHandlers' two trailing M16 parameters need a real watcher
  // manager and a window getter, the same shape ptyManager/mainWindow already
  // take in main/index.ts.
  FileWatchers: require('../src/main/file-watch').FileWatchers,
  ToolboxCache: require('../src/main/toolbox-cache').ToolboxCache,
  /* Check 140 has to push a file PAST the render cap, and it reads the cap
     from the source of truth rather than restating 10000 in the harness: a
     literal here would keep passing against a changed constant, i.e. the
     suite would agree with itself while the app truncated somewhere else —
     the same rule CASCADE_STEP/SEED_PANELS below already state. */
  FILE_MAX_LINES: require('../src/shared/file-panel').FILE_MAX_LINES,
  createDirectBackend: require('../src/main/session-backend').createDirectBackend,
  /* M52: the run ledger, for a scratch file the harness owns. */
  createRunLedger: require('../src/main/run-ledger').createRunLedger,
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
  // Check 174's own reason: window.canvas.jira is deep-frozen by
  // contextBridge (Electron's own protection against exactly this kind of
  // tampering), so the check cannot fake it from the renderer's main world —
  // a plain assignment there silently no-ops. It fakes the MAIN-side handler
  // instead, via ipcMain.removeHandler/ipcMain.handle in verify-panels.cjs,
  // and needs the real channel names to do it rather than restating them.
  IPC: require('../src/shared/ipc-contract').IPC,
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
  createReviewCommitter: require('../src/main/review-commit').createReviewCommitter,
  createReviewDiscarder: require('../src/main/review-discard').createReviewDiscarder,
  createControlServer: require('../src/main/control-server').createControlServer,
  createControlHandler: require('../src/main/control-handler').createControlHandler,
  /* M37. The worktree manager, for the same reason createReviewEngine is
     exported rather than stubbed: worktree.1 spawns a panel through
     preset:spawn-by-id and reads the branch back out of the inspector, and
     a PtyManager whose worktreeFor is the inert default would REFUSE every
     request — a green check against that would prove the refusal arm renders
     and nothing about the feature. The harness builds it over its own git
     runner, review engine and layout store, exactly as main/index.ts does. */
  createWorktreeManager: require('../src/main/worktree-manager').createWorktreeManager,
  /* M39. The durable log, over a scratch directory the harness owns, so
     scrollback.1 can reload the renderer on the direct backend and read a
     dead panel's last lines back off the card. Same reasoning as the two
     constructors above: an inert sink would prove the card renders nothing,
     which is what it renders today. */
  createScrollbackLog: require('../src/main/scrollback-log').createScrollbackLog,
  /* Task 10's checks 130-132 need PtyManager's usage-tick machinery reading
     a real path off real disk — the readFrom half is generic delta-file
     reading with no ~/.claude/projects anywhere in it (only resolveTranscript
     touches that directory, by globbing it), so it is safe to reuse verbatim
     rather than reimplement: the harness supplies its OWN fenced
     resolveTranscript (never this module's), and the only path readFrom is
     ever called with is the harness's own fixture file. */
  readFrom: require('../src/main/transcript-reader').readFrom
}
