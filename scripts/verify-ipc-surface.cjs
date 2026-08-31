/* Verifies that the IPC contract and the registered handlers agree.
   Run with: npm run verify:ipc

   src/shared/ipc-contract.ts claims to be the single source of truth. The
   compiler enforces that for preload (CanvasBridge), but nothing enforces it
   for main: a channel can be added to IPC and never handled, and the only
   symptom is a renderer promise that rejects at runtime. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
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

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

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
    removePrompt: () => false
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
    { read: () => ({ kind: 'no-cwd' }), size: () => 0, clear: () => {} }
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
  // M24 renamed `jira:list` to `work:list` and added NONE — a second work
  // provider is a parameter, not a channel. It is the sixth milestone to
  // reach this boundary and decline it, after M6d's attention set, M7's
  // waiting counts, M12's session:live, M15's subagent:state and M17's
  // usage:panel. Still 45.
  const EXPECTED_CHANNELS = 45
  ok(`1 every contract channel has a main-process handler (${channels.length} channels)`,
    missing.length === 0 && channels.length === EXPECTED_CHANNELS,
    missing.length ? `unhandled: ${missing.join(', ')}` : `count=${channels.length}`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
