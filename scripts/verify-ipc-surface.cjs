/* Verifies that the IPC contract and the registered handlers agree.
   Run with: npm run verify:ipc

   src/shared/ipc-contract.ts claims to be the single source of truth. The
   compiler enforces that for preload (CanvasBridge), but nothing enforces it
   for main: a channel can be added to IPC and never handled, and the only
   symptom is a renderer promise that rejects at runtime. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { app, ipcMain } = require('electron')

const OUT = join(__dirname, '..', 'out', 'verify', 'ipc-surface.cjs')
buildSync({
  entryPoints: [join(__dirname, 'ipc-surface-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron'],
  // M17: main/ipc.ts now imports main/file-write.ts (for the file:write
  // handler), which imports FILE_MAX_BYTES — a real VALUE — from
  // @shared/file-panel. This bundle resolved no alias before that import
  // reached it, the same gap CLAUDE.md records for verify-panels.cjs and
  // verify-canvas.cjs: each esbuild call site needs its own alias, and this
  // one had never needed it until now.
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const { IPC, registerIpcHandlers } = require(OUT)

const { ok, results } = require('./lib/checks.cjs').createChecks()

/**
 * ipcMain has no public "is this channel handled" query, but handle() throws
 * on a second registration for the same channel. That throw IS the assertion.
 */
function isHandled(channel) {
  try {
    ipcMain.handle(channel, () => {})
    ipcMain.removeHandler(channel)
    return false
  } catch {
    return true
  }
}

app.on('window-all-closed', () => {})

const SCRIPT_NAME = 'verify-ipc-surface.cjs'

app.whenReady().then(() => {
  const stub = {
    create: async () => ({}),
    write: () => true,
    resize: () => {},
    kill: () => {},
    list: () => [],
    acknowledge: () => {},
    killAll: () => {}
  }
  // Minimal LayoutStore shape — this suite only needs the handlers to
  // register, not real persistence behaviour (that's verify:layout's job).
  const layoutStoreStub = {
    load: () => {},
    initial: () => ({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }),
    save: () => {},
    settings: () => ({ layout: true, camera: true, focus: true }),
    setSetting: () => {},
    reset: () => {},
    flushSync: () => {},
    renamePreset: () => false,
    deletePreset: () => false,
    setDefaultPreset: () => {},
    prompts: () => [],
    addPrompt: () => {},
    deletePrompt: () => false
  }
  const presetsStub = {
    list: () => [],
    rename: () => false,
    remove: () => false,
    setDefault: () => {},
    spawn: () => {},
    requestReset: () => {},
    listPrompts: () => [],
    savePrompt: () => {},
    removePrompt: () => false,
    setWorktree: () => false
  }
  // Never invoked here — this suite only asserts every channel is REGISTERED,
  // never drives review:panel — but registerIpcHandlers' body reaches into it
  // to build the handler closure, so it has to be a real object rather than
  // undefined.
  const reviewEngineStub = {
    resolveRepo: async () => null,
    captureBaseline: async () => null,
    review: async () => ({ kind: 'not-a-repo' }),
    reviewAt: async () => ({ kind: 'not-a-repo' }),
    fileDiff: async () => ({ hunks: [] })
  }
  // Never invoked here either, for the identical reason reviewEngineStub is
  // not: this suite only asserts REGISTRATION, never drives review:commit.
  const reviewCommitStub = async () => ({ kind: 'nothing-to-commit' })
  // Never invoked here either — registration only. A real store would be
  // just as harmless, but a stub keeps this suite from touching a file at
  // all, the same posture every other stub above takes.
  const credentialStoreStub = {
    list: () => [],
    set: () => ({ ok: false, reason: 'stub' }),
    delete: () => false,
    read: () => undefined,
    setLabel: () => {}
  }
  // Never invoked here either — this suite only asserts REGISTRATION, never
  // drives file:read/file:close — but registerIpcHandlers' body reaches into
  // it to build the handler closures.
  const fileWatchersStub = {
    watch: () => ({ kind: 'missing' }),
    close: () => {},
    closeAll: () => {},
    count: () => 0
  }
  registerIpcHandlers(
    stub,
    layoutStoreStub,
    () => ({ kind: 'direct', reason: 'verify: direct', hasSession: () => false }),
    presetsStub,
    () => {},
    reviewEngineStub,
    reviewCommitStub,
    credentialStoreStub,
    fileWatchersStub,
    () => null,
    // M21's inventory cache. A stub, like every other collaborator here: this
    // check is about the DOOR existing, not about what is behind it.
    { read: () => ({ kind: 'no-cwd' }), size: () => 0, clear: () => {} },
    // Backlog #75's export directory. Never invoked here either — this suite
    // only asserts REGISTRATION, never drives diagnostics:export.
    join(tmpdir(), 'tc-verify-ipc-diagnostics')
  )

  const channels = Object.values(IPC)
  const missing = channels.filter((c) => !isHandled(c))
  // 42, not 43. file:changed is an IPC_EVENTS member — a main-to-renderer send,
  // handled by nobody — and this suite asserts over Object.values(IPC), the
  // invoke channels. M6d and M12 each reached this same off-by-one; CLAUDE.md
  // records both. M14 Task 5 took the surface to 35 (four credential:* channels,
  // none of which returns a secret). Four milestones then built on that 35
  // from branches that never saw each other: the file panel's three invokes
  // (file:open/file:read/file:close), the workspace extras' two
  // (workspace:merged, workspace:move-panels), M19's jira:list, and M20's
  // fs:list — one directory's entries for the file tree (numbered M13
  // throughout its own design and implementation; renumbered to M20 on
  // merge, since a different, unrelated milestone had already claimed M13).
  // 35 + 3 + 2 + 1 + 1 = 42.
  // 44 = 42 after M20, plus M21's two toolbox invokes. Deliberately NOT a
  // third: there is no `toolbox:changed` event at all — this feature is PULL,
  // because half its sources are shared by every panel on the canvas and a
  // panel-keyed watcher would arm twelve of them on the same four paths. See
  // IPC.TOOLBOX_READ's own comment. This number was 43 on the M21 branch,
  // computed against a base that predated fs:list; the merge is what makes
  // it 44, which is the arithmetic both copies of this count must agree on.
  // 45 = 44 plus M22's file:write — the editable file panel's one new invoke,
  // which carries the mtime a draft was seeded from so main can REFUSE a save
  // whose view of the file is stale rather than destroy the newer bytes.
  // M22 was built and reviewed as "M17" and renumbered on merge, since main
  // had already claimed M17 (the Jira canvas context, and a separate
  // M15 -> M17 renumber before that) by the time it landed. That makes it the
  // fourth milestone in this file's own history to be renumbered at a merge.
  // 46 = M23's machine:sample process-tree readout. It is an invoke rather
  // than an event because the renderer owns the deliberately slow polling
  // cadence; main returns one ps snapshot for every requested panel PID.
  // 48 = 46 plus backlog #75's two diagnostics channels (diagnostics:sample,
  // diagnostics:export) — main's own IPC send rate, and the atomic write of
  // the renderer's already-scrubbed bundle. Both are pull-only invokes, the
  // same shape machine:sample already established.
  // 49 = 48 plus M27's file:create. Deliberately not a flag on file:write: a
  // write is a compare-and-swap against a file that EXISTS and a create is
  // refused precisely BECAUSE one does. This count was left at 48 when M27
  // merged, so main carried a RED verify:ipc until the M24 merge below
  // recomputed it — the fifth time this file's own arithmetic has gone stale
  // at a merge, and the reason the number lives here and not only in prose.
  // 52 = 49 plus M24's three: jira:transitions (the legal next states for one
  // issue, its own channel rather than a field on jira:list — see
  // IPC.JIRA_TRANSITIONS' own comment) and the two Jira writes, jira:comment
  // and jira:transition. Both sides of that merge independently declared 48
  // from different additions (main: machine:sample + two diagnostics; M24:
  // the three Jira channels), so the literal agreed while the arithmetic
  // did not — git reported no conflict on the number itself, only on the
  // comments above it. Recompute from Object.values(IPC), never by adding
  // your own branch's delta to whatever this line last said.
  // 56 = 52 plus M37's four: preset:set-worktree (flag a user preset), and
  // worktree:list / worktree:remove / worktree:reveal. The worktree handlers
  // are an OPTIONAL trailing parameter with an inert default, which is why
  // this harness passes nothing for them and every one of the four still has
  // a handler: an install with no worktrees lists nothing and answers unknown.
  // 59 = 56 plus M39's two (scrollback:tail, scrollback:clear) plus M42's
  // scrollback:search. All three ride the same optional-trailing-parameter
  // shape the worktree handlers do; search's id list is main's own.
  // 60 = 59 plus M48's env:report, the environment report — an optional
  // trailing parameter with an inert default, like the worktree and
  // scrollback handlers before it.
  // 61 = 60 plus M51's link:open, an optional trailing parameter with an
  // inert default like env:report before it.
  // 62 = 61 plus M52's ledger:list, inert by default like link:open.
  // 67 = 65 plus M65's spawn:sheet and spawn:recent — the spawn sheet's
  // request (main resolves the template, refuses a missing directory) and
  // the recent-directories read.
  // M73 added the seven agent:* invokes (67 -> 74); M74 agent:import (75).
  // M75 agent:clipboard-image (76).
  // M76-M80 the approval, tool, run and template verbs; M81 preset:template;
  // M83 memory:list and memory:add (82). M84 the five watcher:* verbs (87) —
  // create/run/stop/dispose/list, the runtime a watcher node addresses.
  // M85 vault:read (88). M86 git:status and review:across (90).
  // M88 github:list (91).
  // M89 broker:audit (92).
  // M93 snapshot:list and snapshot:restore (94).
  // M97 agent:auto-start / agent:auto-stop (96).
  // M98 agent:grants and agent:revoke-grants (98) — session grants read and dropped.
  // M100 teammate:list / teammate:save / teammate:delete / teammate:choose-place (102).
  // M101 routine:list / routine:save / routine:delete / routine:run (106).
  // M103 browser:read (107) — the browser pane's text, read in main and passed outward.
  // M113–M115 board:lane / board:lane-status / board:open-pr /
  // board:comment-pr (111) — the dispatch into a lane and the two outward
  // halves behind the broker's spend card.
  // M123 update:check (112) — the update notice's one GET, three states, nothing installed.
  // M127 shelf:list / shelf:save (114) — the Skills pane's arrangement, a
  // TOP-LEVEL record read and written whole rather than through layout:save.
  // M128 plugin:details (115) — `claude plugin details <id>` as TEXT,
  // rendered verbatim and parsed nowhere.
  // M129 skill:write / skill:create / skill:rename / skill:delete (119) —
  // the only channels in the contract that put bytes into ~/.claude.
  // M130 skill:trail (120) — a terminal panel's live skill trail, tailed
  // from the CLI's own transcript at a byte offset.
  // M138 agent:pool-start / agent:pool-stop (122) — the pool's production
  // caller: main reads the list and drives the engine, the renderer mints
  // each worker on request (`pool:mint`, an ephemeral reply like board:add).
  // M145 attachment:clipboard-file (123) — a clipboard image as a file under
  // userData/attachments, so a terminal can be handed its path.
  // M142 ledger:usage (124) — this week's usage rows from the run ledger,
  // folded and priced in the renderer.
  // M181 image:read (125) — an image panel's bytes as a data URL, by magic
  // number under the cap; starter:prepare (126) — the starter's two files
  // under userData/starter, written once.
  // M185 preview:discover (127) — what project a panel is pointed at and
  // whether anything of it is listening; preview:capture (128) — a real
  // picture of a guest, written under userData/captures.
  // M186 asset:put (129) — bytes into the content-addressed asset store;
  // asset:choose (130) — the system's own file chooser, for Replace.
  // M188 node:fetch (131) — a fetch node's one GET, capped and gated in main.
  // M189 portable:export (132) / portable:import (133) — one portable canvas
  // file written and read by main; what to make of a parse is the renderer's.
  // M250 docx:import (134) — a .docx converted in main into a NEW note beside it.
  // M248 export:deck-pdf (135) — a deck printed to PDF by a hidden, script-less window in main.
  const EXPECTED_CHANNELS = 136
  ok(`1 every contract channel has a main-process handler (${channels.length} channels)`,
    missing.length === 0 && channels.length === EXPECTED_CHANNELS,
    missing.length ? `unhandled: ${missing.join(', ')}` : `count=${channels.length}`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
}).catch((error) => {
  // A THROW IN A REAL-ELECTRON HARNESS HANGS WITHOUT THIS. `app.whenReady()
  // .then(async () => ...)` with no catch turns any throw into an unhandled
  // rejection: nothing calls app.exit, the hidden window stays open, and the
  // suite reads as a suite that is still running. CLAUDE.md names that shape
  // directly — "the trap manifests as a HANG, not a red suite" — and a chain
  // of ~40 suites that stops dead with no message is the most expensive
  // failure this harness can produce, because it does not even say which
  // suite stopped. Print the error, name the script, exit non-zero.
  console.log(`\n${SCRIPT_NAME} threw before it could report: ${(error && error.stack) || error}`)
  app.exit(1)
})
