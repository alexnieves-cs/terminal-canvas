/* Verifies the on-disk layout format and the store that owns it.
   Run with: npm run verify:layout

   Pure modules plus node:fs against a tmpdir — no Electron, no DOM, no built
   renderer. Every check here guards a failure that is SILENT in a running
   app: a corrupt file that opens a dead canvas, or two panels quietly sharing
   one session. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'layout.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'layout-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  alias: { '@shared': join(__dirname, '..', 'src', 'shared'), '@renderer': join(__dirname, '..', 'src', 'renderer') }
})
const L = require(OUT)

const { ok, results } = require('./lib/checks.cjs').createChecks()

/** A minimal valid panel, so each check can vary exactly one field. */
const panel = (over = {}) => ({
  id: 'p1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: ['-l'], ...over
})
const file = (over = {}) => JSON.stringify({
  version: 1,
  activeWorkspaceId: 'w1',
  workspaces: [{
    id: 'w1', name: 'Canvas', panels: [panel()],
    camera: { x: 10, y: 20, scale: 2 }, selectedId: null, focusedId: null
  }],
  settings: { layout: true, camera: true, focus: true },
  ...over
})
const active = (snap) => snap.workspaces.find((w) => w.id === snap.activeWorkspaceId)

// 1. A well-formed file round-trips with no warnings.
{
  const { snapshot, warnings } = L.parseLayout(file())
  const w = active(snapshot)
  ok('1 a valid file parses unchanged',
    warnings.length === 0 && w.panels.length === 1 && w.camera.scale === 2,
    `warnings=${warnings.length} panels=${w.panels.length}`)
}

// 2. Garbage never throws — it degrades to defaults.
{
  let threw = null
  let allDefault = true
  for (const raw of ['', '{', 'null', '[]', '"a string"', '{"version":1}']) {
    try {
      const { snapshot } = L.parseLayout(raw)
      if (!Array.isArray(snapshot.workspaces) || snapshot.workspaces.length === 0) allDefault = false
    } catch (e) { threw = `${raw}: ${e.message}` }
  }
  ok('2 unparseable input never throws and always yields a workspace',
    threw === null && allDefault, threw ?? 'ok')
}

// 3. scale <= 0 is replaced. screenToWorld divides by it: a zero would make
//    every coordinate Infinity and the canvas dead with no error anywhere.
{
  const bad = (scale) => active(L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [], camera: { x: 0, y: 0, scale },
      selectedId: null, focusedId: null }]
  })).snapshot).camera.scale
  ok('3 a corrupt scale is replaced with the default',
    bad(0) === L.DEFAULT_CAMERA.scale && bad(-2) === L.DEFAULT_CAMERA.scale &&
    bad(NaN) === L.DEFAULT_CAMERA.scale,
    `0=${bad(0)} -2=${bad(-2)} NaN=${bad(NaN)}`)
}

// 4. A panel with a non-finite coordinate is dropped, not rendered at left:NaN.
{
  const { snapshot, warnings } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas',
      panels: [panel(), panel({ id: 'p2', x: NaN })],
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  }))
  ok('4 a panel with a NaN coordinate is dropped and the rest survive',
    active(snapshot).panels.length === 1 && warnings.length === 1,
    `kept=${active(snapshot).panels.length} warnings=${warnings.length}`)
}

// 5. Undersized panels are clamped, not dropped: the geometry is recoverable
//    and losing the panel would be a worse answer than resizing it.
{
  const { snapshot } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [panel({ w: 10, h: 10 })],
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  }))
  const p = active(snapshot).panels[0]
  ok('5 an undersized panel is clamped to the minimums',
    p && p.w === L.MIN_PANEL_W && p.h === L.MIN_PANEL_H, `w=${p && p.w} h=${p && p.h}`)
}

// 6. THE IMPORTANT ONE. Duplicate ids are the only failure here with no
//    visible symptom: registry.ensure returns the EXISTING session, so two
//    panels render one handle.host, which can live in only one slot. This is
//    the bug M4a's nextIdRef was written to kill, arriving through a file.
{
  const { snapshot, warnings } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas',
      panels: [panel({ id: 'dup', x: 0 }), panel({ id: 'dup', x: 900 })],
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  }))
  const kept = active(snapshot).panels
  ok('6 a duplicate id keeps the first entry only',
    kept.length === 1 && kept[0].x === 0 && warnings.length === 1,
    `kept=${kept.length} x=${kept[0] && kept[0].x}`)
}

// 7. tmux rejects '.' and ':' in a session name, and PanelId becomes the
//    session name in M4c. Rejecting them now is free; migrating later is not.
{
  const ids = ['ok-1', 'ok_2', 'bad.id', 'bad:id', 'bad id', '']
  const { snapshot } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas',
      panels: ids.map((id, i) => panel({ id, x: i * 10 })),
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  }))
  const kept = active(snapshot).panels.map((p) => p.id)
  ok('7 ids unsafe as a tmux session name are rejected',
    kept.length === 2 && kept[0] === 'ok-1' && kept[1] === 'ok_2', kept.join(','))
}

// 8. A future version is not interpreted, and says so loudly enough that the
//    store knows to back the file up before replacing it.
{
  const { snapshot, futureVersion } = L.parseLayout(file({ version: 99 }))
  ok('8 a future version falls back and reports itself',
    futureVersion === true && active(snapshot).panels.length === 0,
    `futureVersion=${futureVersion} panels=${active(snapshot).panels.length}`)
}

// 9. An empty or unresolvable workspace list still yields a canvas to open.
{
  const empty = L.parseLayout(file({ workspaces: [] })).snapshot
  const missing = L.parseLayout(file({ activeWorkspaceId: 'nope' })).snapshot
  ok('9 an empty or unresolvable workspace list still yields one canvas',
    active(empty) !== undefined && active(missing) !== undefined &&
    missing.activeWorkspaceId === missing.workspaces[0].id,
    `empty=${!!active(empty)} missing=${!!active(missing)}`)
}

// 10. selectedId/focusedId must name a panel that survived validation, or a
//     dropped panel leaves focus pointing at nothing.
{
  const { snapshot } = L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [panel({ id: 'p1' })],
      camera: L.DEFAULT_CAMERA, selectedId: 'gone', focusedId: 'p1' }]
  }))
  const w = active(snapshot)
  ok('10 selection pointing at a dropped panel is cleared',
    w.selectedId === null && w.focusedId === 'p1',
    `selected=${w.selectedId} focused=${w.focusedId}`)
}

// 11. title is reserved for ideas-backlog item 6. Nothing writes it in M4b, so
//     both its presence and its absence have to be tolerated.
{
  const withTitle = active(L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [panel({ title: 'auth refactor' })],
      camera: L.DEFAULT_CAMERA, selectedId: null, focusedId: null }]
  })).snapshot).panels[0]
  const without = active(L.parseLayout(file()).snapshot).panels[0]
  ok('11 an optional title survives and its absence is tolerated',
    withTitle.title === 'auth refactor' && without.title === undefined,
    `with=${withTitle.title} without=${without.title}`)
}

// 12. Settings default to on and are coerced, so a hand-edited "true" string
//     cannot turn a boolean into something the menu renders as checked-ish.
{
  const missing = L.parseLayout(file({ settings: undefined })).snapshot.settings
  const junk = L.parseLayout(file({ settings: { layout: 'yes', camera: 0, focus: true } })).snapshot.settings
  ok('12 settings default to on and are coerced to real booleans',
    missing.layout === true && missing.camera === true && missing.focus === true &&
    junk.layout === true && junk.camera === true && junk.focus === true,
    JSON.stringify(junk))
}

// 13. A round trip must be lossless. Anything dropped here is a user's canvas
//     quietly degrading a little on every launch. fromPanels EMITS `kind`
//     explicitly (M9b) even though a reader tolerates its absence, so the
//     input fixture already carries it — a bare "input has no kind" fixture
//     would fail here for a reason that has nothing to do with loss.
{
  const persisted = [
    { id: 'a1', x: -40, y: 12.5, w: 720, h: 460, z: 3, kind: 'terminal', cwd: '/tmp', args: ['-l'] },
    { id: 'b2', x: 900, y: 0, w: 300, h: 200, z: 1, kind: 'terminal', cwd: '~', command: '/bin/bash', args: [] }
  ]
  const back = L.fromPanels(L.toPanels(persisted))
  ok('13 persisted -> Panel -> persisted is lossless',
    JSON.stringify(back) === JSON.stringify(persisted),
    JSON.stringify(back))
}

// 14. The nesting is the point: Panel keeps the id on rect and the command on
//     spec, and the file must not be shaped by either of those choices.
{
  const [p] = L.toPanels([{ id: 'a1', x: 1, y: 2, w: 720, h: 460, z: 7, cwd: '/x', args: ['-l'] }])
  ok('14 toPanels produces the nested in-memory shape',
    p.rect.id === 'a1' && p.rect.x === 1 && p.z === 7 &&
    p.spec.panelId === 'a1' && p.spec.cwd === '/x' && p.spec.command === undefined,
    JSON.stringify(p))
}

// 15. An absent command must stay ABSENT, never become the string "undefined"
//     or a renderer-invented default. Only main can name the login shell.
{
  const [p] = L.toPanels([{ id: 'a1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }])
  const [back] = L.fromPanels([p])
  ok('15 an absent command survives as absent, not as a default',
    !('command' in back) && p.spec.command === undefined,
    JSON.stringify(back))
}

const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')

const tmp = () => join(mkdtempSync(join(tmpdir(), 'tc-layout-')), 'layout.json')
/** A fake scheduler, so the debounce is driven explicitly instead of by a clock. */
const fakeClock = () => {
  const pending = []
  let total = 0
  return {
    schedule: (fn) => {
      total += 1
      pending.push(fn)
      return () => { const i = pending.indexOf(fn); if (i >= 0) pending.splice(i, 1) }
    },
    fire: () => { const run = pending.splice(0); for (const fn of run) fn() },
    count: () => pending.length,
    // Total ever scheduled, NOT decremented by cancellation — count() alone
    // cannot distinguish "returned early" from "cancelled the old one and
    // re-armed", since both leave pending.length at 1 after 60 saves.
    scheduled: () => total
  }
}
const CANVAS = {
  panels: [{ id: 'p1', x: 5, y: 6, w: 720, h: 460, z: 2, cwd: '~', args: ['-l'] }],
  groups: [],
  camera: { x: 1, y: 2, scale: 1.5 },
  selectedId: 'p1',
  focusedId: null
  ,
  // M56. The state shape gained bookmarks; a round trip carries the empty list.
  bookmarks: [],
  runs: []
}

// 16. A missing file is a first run, not an error.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  const state = store.initial()
  ok('16 a missing layout file yields an empty canvas',
    state.panels.length === 0 && state.camera.scale === L.DEFAULT_CAMERA.scale,
    JSON.stringify(state.camera))
}

// 17. A saved canvas comes back.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load(); a.save(CANVAS); a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('17 a saved canvas round-trips through the file',
    JSON.stringify(b.initial()) === JSON.stringify(CANVAS), JSON.stringify(b.initial()))
}

// 18. COALESCING. Sixty snapshots a second arrive during a drag; they must
//     collapse to one scheduled write, keeping the newest.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  for (let i = 0; i < 60; i += 1) store.save({ ...CANVAS, camera: { x: i, y: 0, scale: 1 } })
  const scheduled = clock.scheduled()
  clock.fire()
  const written = JSON.parse(readFileSync(path, 'utf8'))
  ok('18 sixty saves collapse to one write of the newest state',
    scheduled === 1 && written.workspaces[0].camera.x === 59,
    `scheduled=${scheduled} x=${written.workspaces[0].camera.x}`)
}

// 19. flushSync writes the newest state even with a write still pending, and
//     cancels the pending one rather than leaving it to fire after quit.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  store.save(CANVAS)
  store.flushSync()
  const written = JSON.parse(readFileSync(path, 'utf8'))
  ok('19 flushSync writes immediately and cancels the pending write',
    written.workspaces[0].panels.length === 1 && clock.count() === 0,
    `pending=${clock.count()}`)
}

// 20. flushSync must NEVER throw: it runs inside app.on('before-quit'), where
//     an exception can wedge the quit itself.
{
  const store = L.createLayoutStore({ filePath: '/proc/nonexistent-dir/layout.json' })
  let threw = null
  try { store.load(); store.save(CANVAS); store.flushSync() } catch (e) { threw = e.message }
  ok('20 an unwritable path never throws out of flushSync', threw === null, threw ?? 'ok')
}

// 21. No .tmp file is left behind. The write is tmp-then-rename so a crash
//     mid-write cannot truncate the real file.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load(); store.save(CANVAS); store.flushSync()
  ok('21 the atomic write leaves no .tmp file behind',
    existsSync(path) && !existsSync(path + '.tmp'))
}

// 22. Settings are preserved across a renderer merge. The renderer does not
//     have them and does not send them; main must not lose them.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.setSetting('camera', false)
  store.save(CANVAS)
  store.flushSync()
  const reopened = L.createLayoutStore({ filePath: path })
  reopened.load()
  ok('22 a renderer save preserves main-side settings',
    reopened.settings().camera === false && reopened.settings().layout === true,
    JSON.stringify(reopened.settings()))
}

// 23. Settings are APPLIED by initial(), so the renderer never learns they
//     exist. layout off implies no panels, which implies no selection.
{
  const path = tmp()
  const seed = L.createLayoutStore({ filePath: path })
  seed.load(); seed.save(CANVAS); seed.flushSync()

  const noCamera = L.createLayoutStore({ filePath: path })
  noCamera.load(); noCamera.setSetting('camera', false)
  const noLayout = L.createLayoutStore({ filePath: path })
  noLayout.load(); noLayout.setSetting('layout', false)
  const noFocus = L.createLayoutStore({ filePath: path })
  noFocus.load(); noFocus.setSetting('focus', false)

  ok('23 initial() applies each restore setting independently',
    noCamera.initial().camera.scale === L.DEFAULT_CAMERA.scale &&
    noCamera.initial().panels.length === 1 &&
    noLayout.initial().panels.length === 0 &&
    noLayout.initial().selectedId === null &&
    noFocus.initial().selectedId === null &&
    noFocus.initial().panels.length === 1,
    `cam=${noCamera.initial().camera.scale} lay=${noLayout.initial().panels.length}`)
}

// 24. A future-version file is BACKED UP before being replaced, or the
//     fallback's first write destroys a layout a newer build authored.
{
  const path = tmp()
  writeFileSync(path, JSON.stringify({ version: 99, workspaces: [] }))
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.save(CANVAS)
  store.flushSync()
  const backup = JSON.parse(readFileSync(path + '.bak', 'utf8'))
  ok('24 a future-version file is preserved as .bak before being replaced',
    backup.version === 99 && existsSync(path), `bak.version=${backup.version}`)
}

// 25. reset() empties the active workspace but keeps the settings and the
//     workspace identity — a reset is "clear this canvas", not "forget my
//     preferences", and the menu item that calls it is one click away from
//     the checkboxes it must not touch.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.setSetting('camera', false)
  store.save(CANVAS)
  store.reset()
  store.flushSync()
  const written = JSON.parse(readFileSync(path, 'utf8'))
  const w = written.workspaces[0]
  // M6b: `settings` is no longer written to disk at all (it is now a derived
  // view over `preferences` — see layout-store.ts's writeNow), so what
  // survives reset() is the `restore.camera` entry in the preferences map.
  ok('25 reset empties the canvas but preserves settings and workspace identity',
    w.panels.length === 0 && w.selectedId === null && w.focusedId === null &&
    w.id === L.DEFAULT_WORKSPACE_ID && written.preferences['restore.camera'] === false,
    JSON.stringify({ panels: w.panels.length, id: w.id, camera: written.preferences['restore.camera'] }))
}

// 26. THE CRITICAL ONE. Unchecking "Panel layout" must never destroy the
//     panels it declined to restore. save() used to overwrite w.panels
//     unconditionally: initial() hands the renderer nothing when layout is
//     off, the renderer boots its one first-run panel, and the very next
//     save (fired by the mount effect) replaced the stored twelve-panel
//     canvas with that lone panel — permanently, since the debounced write
//     lands with nothing to undo it. save() must leave w.panels untouched
//     whenever `layout` is off, exactly mirroring what initial() withheld.
{
  const path = tmp()
  const TWELVE = {
    panels: Array.from({ length: 12 }, (_, i) => ({
      id: `p${i + 1}`, x: i * 10, y: 0, w: 720, h: 460, z: i + 1, cwd: '~', args: []
    })),
    camera: { x: 1, y: 2, scale: 1 },
    selectedId: 'p1',
    focusedId: 'p1'
  }
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.save(TWELVE)
  store.flushSync()

  store.setSetting('layout', false)
  // The renderer's fresh-start save after unchecking the box: one panel, no
  // selection — the shape firstRunPanels() + the mount effect actually send.
  store.save({
    panels: [{ id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }],
    camera: { x: 0, y: 0, scale: 1 },
    selectedId: null,
    focusedId: null
  })
  store.flushSync()

  const onDisk = JSON.parse(readFileSync(path, 'utf8')).workspaces[0]
  ok('26 unchecking layout restore preserves the panels it declined to restore',
    onDisk.panels.length === 12 && onDisk.panels[0].id === 'p1',
    `panels=${onDisk.panels.length}`)
}

/* ---- M5a presets: format ---- */

/** A minimal valid preset, so each check can vary exactly one field. */
const preset = (over = {}) => ({ id: 'u1', name: 'Claude here', cwd: '/tmp', args: [], ...over })

{
  const w = []
  const got = L.parsePresets([preset(), 'not-an-object', preset({ id: 'u2' })], w)
  ok('27 parsePresets drops a non-object entry and keeps the rest',
    got.length === 2 && got[0].id === 'u1' && got[1].id === 'u2' && w.length === 1,
    `kept=${got.map((p) => p.id).join(',')} warnings=${w.length}`)
}

{
  const w = []
  const got = L.parsePresets([preset({ id: 'bad id!' }), preset({ id: 'u2' })], w)
  ok('28 parsePresets drops a preset whose id fails ID_PATTERN',
    got.length === 1 && got[0].id === 'u2' && w.length === 1,
    `kept=${got.map((p) => p.id).join(',')}`)
}

{
  const w = []
  const got = L.parsePresets([preset(), preset({ name: 'Second' })], w)
  ok('29 parsePresets drops a duplicate preset id',
    got.length === 1 && got[0].name === 'Claude here' && w.length === 1,
    `kept=${got.length}`)
}

{
  const w = []
  const got = L.parsePresets([preset({ args: ['-l', 7] }), preset({ id: 'u2' })], w)
  ok('30 parsePresets drops a preset whose args is not an array of strings',
    got.length === 1 && got[0].id === 'u2' && w.length === 1,
    `kept=${got.map((p) => p.id).join(',')}`)
}

{
  const w = []
  const got = L.parsePresets([preset({ w: 10, h: 10 })], w)
  ok('31 parsePresets clamps an undersized w/h instead of dropping the preset',
    got.length === 1 && got[0].w === L.MIN_PANEL_W && got[0].h === L.MIN_PANEL_H,
    `w=${got[0] && got[0].w} h=${got[0] && got[0].h}`)
}

{
  // A file written before M5a. Absent is not corruption.
  const { snapshot, warnings } = L.parseLayout(file())
  ok('32 a pre-M5a file with no presets key parses clean',
    Array.isArray(snapshot.presets) && snapshot.presets.length === 0 &&
      snapshot.defaultPresetId === L.DEFAULT_PRESET_ID &&
      warnings.length === 0,
    `presets=${snapshot.presets && snapshot.presets.length} default=${snapshot.defaultPresetId} warnings=${warnings.length}`)
}

{
  const raw = JSON.stringify({ ...JSON.parse(file()), defaultPresetId: 42 })
  const { snapshot } = L.parseLayout(raw)
  ok('33 an unusable defaultPresetId falls back to the shell built-in',
    snapshot.defaultPresetId === L.DEFAULT_PRESET_ID,
    `default=${snapshot.defaultPresetId}`)
}

{
  // THE check of this suite. A parser that "helpfully" resolves an absent
  // command makes every command-less preset spawn a hardcoded shell instead
  // of the user's own, and passes every other assertion here while doing it.
  const w = []
  const got = L.parsePresets([preset({ command: undefined })], w)
  const raw = JSON.stringify({ ...JSON.parse(file()), presets: [preset()] })
  const round = L.parseLayout(raw).snapshot.presets[0]
  ok('34 a preset with an absent command round-trips absent',
    !('command' in got[0]) && !('command' in round),
    `parsed=${JSON.stringify(got[0])} roundTripped=${JSON.stringify(round)}`)
}

{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.addPreset({ id: 'u1', name: 'Claude here', cwd: '/tmp', args: [] })
  store.flushSync()

  const onDisk = JSON.parse(readFileSync(path, 'utf8'))
  const reread = L.createLayoutStore({ filePath: path })
  reread.load()
  ok('35 addPreset writes through the existing coalesced atomic path and survives a reload',
    onDisk.presets.length === 1 && onDisk.presets[0].id === 'u1' &&
      !('command' in onDisk.presets[0]) &&
      reread.presets().length === 1 &&
      reread.defaultPresetId() === L.DEFAULT_PRESET_ID,
    `onDisk=${JSON.stringify(onDisk.presets)} reread=${reread.presets().length}`)
}

/* ---- M5a presets: main-side helpers ---- */

{
  const user = [{ id: 'u1', name: 'Mine', cwd: '/tmp', args: [] }]
  ok('36 resolveDefault falls back to the login shell for an id nothing owns',
    L.resolveDefault(user, 'u1').name === 'Mine' &&
      L.resolveDefault(user, 'nope').id === L.DEFAULT_PRESET_ID &&
      !('command' in L.resolveDefault([], L.DEFAULT_PRESET_ID)),
    `unknown -> ${L.resolveDefault(user, 'nope').id}`)
}

{
  const user = [{ id: 'u1', name: 'a', cwd: '/tmp', args: [] },
                { id: 'u3', name: 'b', cwd: '/tmp', args: [] }]
  // Names only the user half on purpose. mintPresetId also checks the
  // built-ins, but no minted id can reach them while built-in ids are
  // `shell`/`claude`/`codex` and minted ids are `u<n>` — so that half of the
  // guard is defensive and UNPROVABLE here. It becomes load-bearing, and this
  // check becomes insufficient, the day a built-in is named `u<n>`.
  ok('37 mintPresetId skips ids already taken by user presets',
    L.mintPresetId(user) === 'u2' && L.mintPresetId([]) === 'u1' &&
      !L.allPresets(user).some((p) => p.id === L.mintPresetId(user)),
    `minted=${L.mintPresetId(user)}`)
}

{
  const shellNamed = L.autoName({ cwd: '/Users/me/terminal-canvas', args: [] }, [])
  const first = L.autoName({ command: '/opt/homebrew/bin/claude', cwd: '/Users/me/api', args: [] }, [])
  const second = L.autoName(
    { command: 'claude', cwd: '/Users/me/api', args: [] },
    [{ id: 'u1', name: first, cwd: '/x', args: [] }]
  )
  ok('38 autoName uses basenames, says "login shell" for an absent command, and dedupes',
    first === 'claude — api' && second === 'claude — api 2' &&
      shellNamed === 'login shell — terminal-canvas',
    `first=${first} second=${second} shell=${shellNamed}`)
}

{
  const which = (cmd) => (cmd === 'claude' ? '/opt/homebrew/bin/claude' : null)
  const rows = L.resolveAvailability(L.BUILT_IN_PRESETS, which)
  const byId = Object.fromEntries(rows.map((r) => [r.preset.id, r.available]))
  ok('39 availability is per command, and a preset with no command is always available',
    byId.shell === true && byId.claude === true && byId.codex === false,
    JSON.stringify(byId))
}

{
  const missing = { preset: { id: 'codex', name: 'Codex', cwd: '~', command: 'codex', args: [] }, available: false }
  const present = { preset: { id: 'claude', name: 'Claude', cwd: '~', command: 'claude', args: [] }, available: true }
  ok('40 an unavailable preset says why in its own label',
    L.menuLabel(missing) === 'Codex — not found on PATH' && L.menuLabel(present) === 'Claude',
    `${L.menuLabel(missing)} | ${L.menuLabel(present)}`)
}

{
  // Present but unusable. Check 32 (absent parses clean) is the other half of
  // this pair: only one of the two may warn, and getting them backwards either
  // shouts at every pre-M5a file or loses every saved preset in silence.
  const w = []
  const got = L.parsePresets({}, w)
  const raw = JSON.stringify({ ...JSON.parse(file()), presets: {} })
  const round = L.parseLayout(raw)
  ok('41 a presets field that is present but not an array warns instead of vanishing',
    got.length === 0 && w.length === 1 &&
      round.snapshot.presets.length === 0 && round.warnings.length === 1,
    `warnings=${JSON.stringify(w)} fileWarnings=${JSON.stringify(round.warnings)}`)
}

/* ---- M5b: rename, delete, and re-default a preset ---- */

// 42. renamePreset renames the named preset and nothing else.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  store.addPreset({ id: 'u1', name: 'one', cwd: '~', args: [] })
  store.addPreset({ id: 'u2', name: 'two', cwd: '~', args: [] })
  const changed = store.renamePreset('u1', 'renamed')
  clock.fire()
  const presets = JSON.parse(readFileSync(path, 'utf8')).presets
  ok('42 renamePreset renames exactly one preset',
    changed === true && presets.length === 2 &&
      presets.find((p) => p.id === 'u1').name === 'renamed' &&
      presets.find((p) => p.id === 'u2').name === 'two',
    JSON.stringify(presets))
}

// 43. Renaming an id that is not there reports false and writes nothing. Main
//     needs the difference: reporting success for a vanished preset means the
//     palette shows a rename that did not happen.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  ok('43 renaming an unknown id reports false', store.renamePreset('nope', 'x') === false)
}

// 44. deletePreset removes only that preset and reports true.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  store.addPreset({ id: 'u1', name: 'one', cwd: '~', args: [] })
  store.addPreset({ id: 'u2', name: 'two', cwd: '~', args: [] })
  const changed = store.deletePreset('u1')
  clock.fire()
  const presets = JSON.parse(readFileSync(path, 'utf8')).presets
  ok('44 deletePreset removes exactly one preset',
    changed === true && presets.length === 1 && presets[0].id === 'u2',
    JSON.stringify(presets))
}

// 45. Deleting the DEFAULT preset falls the default back to the built-in
//     login shell id rather than leaving defaultPresetId naming a preset that
//     no longer exists. resolveDefault() in main/presets.ts would recover
//     anyway, but a stored id pointing at nothing is a fact on disk that
//     survives every future launch, and only this file can fix it at the
//     moment the preset goes away.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  store.addPreset({ id: 'u1', name: 'one', cwd: '~', args: [] })
  store.setDefaultPreset('u1')
  store.deletePreset('u1')
  clock.fire()
  const written = JSON.parse(readFileSync(path, 'utf8'))
  ok('45 deleting the default preset restores the built-in default',
    written.defaultPresetId === 'shell', written.defaultPresetId)
}

// 46. setDefaultPreset persists, and does NOT validate against the built-ins —
//     only main knows those (main/presets.ts's resolveDefault), exactly as
//     parseLayout only checks the FORMAT of defaultPresetId.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  store.setDefaultPreset('claude')
  clock.fire()
  const written = JSON.parse(readFileSync(path, 'utf8'))
  ok('46 setDefaultPreset persists a built-in id it cannot itself verify',
    written.defaultPresetId === 'claude', written.defaultPresetId)
}

/* ---- M5b: Prompt, parsePrompts, and the store that holds them ---- */

// 47. An absent prompts key is not corruption. Every file written before M5b
//     has none, and warning about those would make the first launch after an
//     upgrade shout about a file that is perfectly fine — the same trade
//     parsePresets makes (check 32).
{
  const warnings = []
  ok('47 an absent prompts key is silent',
    L.parsePrompts(undefined, warnings).length === 0 && warnings.length === 0)
}

// 48. PRESENT but unusable IS corruption, and says so. A hand-edited
//     `"prompts": {}` that silently emptied the list would leave the user with
//     no evidence beyond a shorter palette.
{
  const warnings = []
  ok('48 a non-array prompts field warns',
    L.parsePrompts({}, warnings).length === 0 && warnings.length === 1)
}

// 49. Bad entries are dropped INDIVIDUALLY. One malformed prompt costs that
//     prompt, not the file — the discipline every parser here follows.
{
  const warnings = []
  const out = L.parsePrompts(
    [
      { id: 'p1', name: 'good', body: 'hello' },
      { id: 'p2', name: 'no body' },
      { id: '', name: 'bad id', body: 'x' },
      { id: 'p3', name: 'also good', body: 'world' }
    ],
    warnings
  )
  ok('49 bad prompts are dropped one at a time',
    out.length === 2 && out[0].id === 'p1' && out[1].id === 'p3' && warnings.length === 2,
    JSON.stringify(warnings))
}

// 50. A duplicate id is dropped, for the reason duplicate PANEL ids are: the
//     palette keys rows by id, and two rows with one id is a React list that
//     renders one of them and loses the other with no error anywhere.
{
  const warnings = []
  const out = L.parsePrompts(
    [{ id: 'p1', name: 'a', body: 'x' }, { id: 'p1', name: 'b', body: 'y' }],
    warnings
  )
  ok('50 a duplicate prompt id is dropped', out.length === 1 && warnings.length === 1)
}

// 51. An EMPTY body is dropped rather than kept. A prompt that pastes nothing
//     is indistinguishable from a broken insert, and the palette would show it
//     as a perfectly ordinary row.
{
  const warnings = []
  ok('51 an empty body is not a prompt',
    L.parsePrompts([{ id: 'p1', name: 'x', body: '' }], warnings).length === 0)
}

// 52. The store round-trips prompts: add, delete, and the file agrees.
{
  const clock = fakeClock()
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path, schedule: clock.schedule })
  store.load()
  store.addPrompt({ id: 'p1', name: 'review', body: 'line one\nline two' })
  store.addPrompt({ id: 'p2', name: 'other', body: 'x' })
  const deleted = store.deletePrompt('p1')
  const missing = store.deletePrompt('nope')
  clock.fire()
  const prompts = JSON.parse(readFileSync(path, 'utf8')).prompts
  ok('52 prompts round-trip through the store',
    deleted === true && missing === false && prompts.length === 1 && prompts[0].id === 'p2',
    JSON.stringify(prompts))
}

// 53. Reads *.md from .claude/commands, names them by filename, and ignores
//     everything else in the directory.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc prompts '))   // spaced, on purpose
  mkdirSync(join(dir, '.claude', 'commands'), { recursive: true })
  writeFileSync(join(dir, '.claude', 'commands', 'review.md'), 'review this diff', 'utf8')
  writeFileSync(join(dir, '.claude', 'commands', 'notes.txt'), 'not a prompt', 'utf8')
  const out = L.readProjectPrompts(dir)
  ok('53 project prompts are the .md files, named by filename',
    out.length === 1 && out[0].name === 'review' && out[0].body === 'review this diff' &&
    out[0].source === 'project')
}

// 54. A missing directory is EMPTY, not an error. Most panels' cwds have no
//     .claude/commands, and a throw here would take the whole prompt list down
//     with it — the palette would show no saved prompts either.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc prompts '))
  ok('54 a missing .claude/commands is empty, not an error',
    L.readProjectPrompts(dir).length === 0)
}

// 55. The file count is capped. An unbounded read of whatever directory a user
//     pointed a panel at is a hazard, not a feature.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc prompts '))
  const commands = join(dir, '.claude', 'commands')
  mkdirSync(commands, { recursive: true })
  for (let i = 0; i < L.MAX_PROJECT_PROMPTS + 20; i += 1) {
    writeFileSync(join(commands, `p${i}.md`), 'body', 'utf8')
  }
  ok('55 the project prompt count is capped',
    L.readProjectPrompts(dir).length === L.MAX_PROJECT_PROMPTS)
}

// 56. An oversized file is skipped rather than truncated. Half a prompt pasted
//     into an agent is worse than none: it reads as a complete instruction.
{
  const dir = mkdtempSync(join(tmpdir(), 'tc prompts '))
  const commands = join(dir, '.claude', 'commands')
  mkdirSync(commands, { recursive: true })
  writeFileSync(join(commands, 'huge.md'), 'x'.repeat(L.MAX_PROMPT_BYTES + 1), 'utf8')
  writeFileSync(join(commands, 'fine.md'), 'ok', 'utf8')
  const out = L.readProjectPrompts(dir)
  ok('56 an oversized prompt file is skipped, not truncated',
    out.length === 1 && out[0].name === 'fine')
}

// 57. Same-named prompts from the two sources both survive the merge, with
//     distinct ids. Deduping by name is the quiet way to paste the wrong
//     project's context into an agent (ideas-backlog #27).
{
  const merged = L.mergePrompts(
    [{ id: 'p1', name: 'review', body: 'saved body' }],
    [{ id: 'proj:review', name: 'review', source: 'project', body: 'project body' }]
  )
  ok('57 same-named prompts from two sources both survive',
    merged.length === 2 && new Set(merged.map((p) => p.id)).size === 2 &&
    merged.filter((p) => p.source === 'project').length === 1)
}

// 58-60 — M6a. PersistedPanel.title has been PARSED since M4b and dropped on
//     the way out ever since: layout-adapt.fromPanels rebuilt the record field
//     by field and simply never mentioned it. A title would therefore survive
//     being typed, survive a save, and be gone after relaunch — the shape of
//     bug that reads as a working feature in review.
{
  const [panel] = L.toPanels([{
    id: 'p1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: ['-l'], title: 'auth refactor'
  }])
  ok('58 toPanels carries title in', panel.title === 'auth refactor')
}
{
  const [out] = L.fromPanels([{
    rect: { id: 'p1', x: 0, y: 0, w: 720, h: 460 },
    spec: { panelId: 'p1', cwd: '~', args: ['-l'] },
    z: 1,
    title: 'flaky test hunt'
  }])
  ok('59 fromPanels carries title out', out.title === 'flaky test hunt')
}
{
  // Absent must stay ABSENT, not become an explicit undefined. The same rule
  // `command` obeys two lines above it in the same function: a spread would
  // put `title: undefined` in layout.json, where `'title' in panel` reads true
  // and a later "does this panel have a name" test answers yes for a panel
  // with no name.
  const [out] = L.fromPanels([{
    rect: { id: 'p1', x: 0, y: 0, w: 720, h: 460 },
    spec: { panelId: 'p1', cwd: '~', args: ['-l'] },
    z: 1
  }])
  ok('60 an untitled panel writes no title key at all', !('title' in out))
}

// 61-64 — M6b. The schema is DATA, and these checks are what stop it drifting
//     from the code that consumes it. 61 pins the three ids main/menu.ts and
//     layout-store.ts both address by name; 62 is the rule that makes a
//     sparse map safe to store; 63 is what makes #11's synonym search
//     possible at all; 64 is the guard against a duplicate id, which would
//     make one row silently shadow another in the palette.
{
  const ids = L.SETTINGS.map((d) => d.id)
  ok('61 the schema declares the three restore settings by their exact ids',
    ids.includes('restore.layout') && ids.includes('restore.camera') &&
    ids.includes('restore.focus'), ids.join(','))
}
{
  // An id with no persisted entry resolves to the schema default. This is what
  // lets the stored map be SPARSE — only what the user actually changed —
  // rather than a full copy rewritten on every save.
  ok('62 an unset setting resolves to its schema default',
    L.resolveSetting({}, 'restore.layout') === true &&
    L.resolveSetting({ 'restore.layout': false }, 'restore.layout') === false)
}
{
  const ids = L.SETTINGS.map((d) => d.id)
  ok('63 setting ids are unique', new Set(ids).size === ids.length)
}
{
  // Every entry needs a non-empty label, description and keyword list. The
  // keywords are not decoration: they are the only reason a user typing
  // "panels" finds a setting labelled "Panel layout".
  const bad = L.SETTINGS.filter((d) =>
    !d.label || !d.description || !Array.isArray(d.keywords) || d.keywords.length === 0)
  ok('64 every setting carries a label, a description and at least one keyword',
    bad.length === 0, bad.map((d) => d.id).join(','))
}

{
  // telemetry.1 (M112). Two settings, neither a plan may write: a plan that
  // can switch telemetry on has the same shape as one that raises its own
  // ceiling. The DSN is text and empty; the dumps toggle is boolean and off.
  const dsn = L.SETTINGS.find((d) => d.id === 'telemetry.sentryDsn')
  const dumps = L.SETTINGS.find((d) => d.id === 'telemetry.nativeCrashes')
  ok('telemetry.1 telemetry.sentryDsn is text defaulting to empty and telemetry.nativeCrashes is boolean defaulting to false; neither is planWritable; both share TELEMETRY_CATEGORY',
    !!dsn && dsn.type === 'text' && dsn.default === '' && dsn.planWritable === undefined &&
      !!dumps && dumps.type === 'boolean' && dumps.default === false && dumps.planWritable === undefined &&
      typeof L.TELEMETRY_CATEGORY === 'string' && dsn.category === L.TELEMETRY_CATEGORY && dumps.category === L.TELEMETRY_CATEGORY,
    JSON.stringify({ dsn, dumps }))
}

// 65-69 — M6b. The same ABSENT-vs-MALFORMED line parsePresets draws, and for
//     the same reason: a file with no preferences key is every file written
//     before M6b and is perfectly fine, while a present-but-wrong one is
//     corruption whose silent version is a preference the user set that
//     quietly stopped applying.
{
  const w = []
  ok('65 no preferences key at all is silent',
    Object.keys(L.parsePreferences(undefined, w)).length === 0 && w.length === 0,
    w.join('|'))
}
{
  const w = []
  L.parsePreferences([], w)
  ok('66 a preferences field that is not an object warns rather than vanishing',
    w.length === 1, w.join('|'))
}
{
  const w = []
  const out = L.parsePreferences({ 'restore.layout': false, 'nope.gone': true }, w)
  ok('67 an unknown setting id is dropped with a warning, and the rest survive',
    out['restore.layout'] === false && !('nope.gone' in out) && w.length === 1,
    JSON.stringify(out) + ' | ' + w.join('|'))
}
{
  const w = []
  const out = L.parsePreferences({ 'restore.layout': 'yes', 'restore.camera': false }, w)
  ok('68 a value of the wrong type is dropped with a warning, not coerced',
    !('restore.layout' in out) && out['restore.camera'] === false && w.length === 1,
    JSON.stringify(out) + ' | ' + w.join('|'))
}
{
  // The migration. A pre-M6b file has `settings` and no `preferences`, and its
  // three booleans must survive verbatim — an upgrade that silently reset a
  // user's restore preferences to the defaults would look exactly like the app
  // ignoring them.
  const snap = L.parseLayout(file({ settings: { layout: false, camera: true, focus: false } })).snapshot
  ok('69 a pre-M6b file migrates its restore settings into preferences',
    snap.preferences['restore.layout'] === false &&
    snap.preferences['restore.camera'] === true &&
    snap.preferences['restore.focus'] === false,
    JSON.stringify(snap.preferences))
}

// 70-73 — M6b. The store is the one place a setting is read or written, and
//     73 is the check that matters most: settings() and setSetting() are now a
//     typed VIEW over the preferences map rather than a second storage, so a
//     write through either API must be visible through the other. Two
//     storages that agree on the day they are written and drift later is the
//     exact failure this milestone exists to prevent.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  ok('70 an untouched store reports the schema defaults',
    store.getSetting('restore.layout') === true &&
    Object.keys(store.preferences()).length === 0,
    JSON.stringify(store.preferences()))
}
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.setPreference('restore.camera', false)
  store.save(CANVAS)
  store.flushSync()
  const reopened = L.createLayoutStore({ filePath: path })
  reopened.load()
  ok('71 a preference survives a write and a reopen',
    reopened.getSetting('restore.camera') === false &&
    reopened.getSetting('restore.layout') === true)
}
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setPreference('nope.gone', true)
  ok('72 setting an id the schema does not declare is refused',
    !('nope.gone' in store.preferences()))
}
{
  // The type union tracks `typeof`'s tags now ('enum' is gone), so this path
  // is genuinely reachable: a known id given a value of the wrong type must
  // still be refused, not merely an unknown id.
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setPreference('restore.layout', 'yes')
  ok('72b setting a known id with the wrong type is refused',
    !('restore.layout' in store.preferences()))
}
{
  // The view, both directions. This is the check that makes "one map, two
  // accessor shapes" a fact rather than a claim.
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setSetting('focus', false)
  const viaId = store.getSetting('restore.focus')
  store.setPreference('restore.layout', false)
  const viaTyped = store.settings().layout
  ok('73 settings() and setSetting() are a view over the same map, not a second store',
    viaId === false && viaTyped === false, `viaId=${viaId} viaTyped=${viaTyped}`)
}

// 74 — M6b. The Restore submenu is now DERIVED from this query rather than
//     hand-listed in menu.ts, which is the whole point: two lists of the same
//     three settings drift, and the drift shows up as a menu that silently
//     stops offering something the palette still offers.
{
  const restore = L.settingsInCategory(L.RESTORE_CATEGORY)
  ok('74 the Restore submenu query returns exactly the three restore settings',
    restore.length === 3 && restore.every((d) => d.id.startsWith('restore.')),
    restore.map((d) => d.id).join(','))
}

// 75-80 — M6c. The three agent-state settings the border-colour feature reads
//     later. Nothing consumes them yet; this is only the declaration and the
//     one new rule the number type needs that a boolean never did — a range.
{
  // 75. The three ids the detector and the renderer will both hardcode. An id
  //     is the persisted key, so a typo here is a silently lost preference
  //     with no migration.
  const ids = L.SETTINGS.map((d) => d.id)
  ok('75 the three agent settings are declared',
    ids.includes('agent.glow') && ids.includes('agent.bell') && ids.includes('agent.idleAfterMs'),
    ids.join(','))
}
{
  // 76. The threshold is a NUMBER setting, not a boolean smuggled in as one.
  const def = L.settingDef('agent.idleAfterMs')
  ok('76 idleAfterMs is a number setting',
    def.type === 'number' && typeof def.default === 'number', JSON.stringify(def))
}
{
  // 77. An unset threshold resolves to the schema default — the sparse-map
  //     rule. A full map written on save would freeze this number at whatever
  //     it was the first time the user launched, so tuning it later would
  //     reach nobody.
  const def = L.settingDef('agent.idleAfterMs')
  ok('77 an unset threshold resolves to the default',
    L.resolveSetting({}, 'agent.idleAfterMs') === def.default)
}
{
  // 78. setPreference refuses a wrong-typed value for the number setting, the
  //     same way check 72b covers the boolean case — by leaving the id absent
  //     from preferences() rather than by a return value, since setPreference
  //     returns void here just as it does for 72 and 72b.
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setPreference('agent.idleAfterMs', true)
  ok('78 a boolean is refused for a number setting',
    !('agent.idleAfterMs' in store.preferences()), JSON.stringify(store.preferences()))
}
{
  // 79. RANGE. A threshold of 0 makes every gap between tokens read as
  //     "finished" and the border strobes; one of an hour makes the signal
  //     arrive after you have already looked. Both are silent — the app
  //     works, it just never says anything useful — so the store refuses
  //     out-of-range values rather than storing them, while the bounds
  //     themselves are valid values and must be accepted.
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  const def = L.settingDef('agent.idleAfterMs')
  store.setPreference('agent.idleAfterMs', def.min - 1)
  const rejectedLow = !('agent.idleAfterMs' in store.preferences())
  store.setPreference('agent.idleAfterMs', def.max + 1)
  const rejectedHigh = !('agent.idleAfterMs' in store.preferences())
  store.setPreference('agent.idleAfterMs', def.min)
  const acceptedBound = store.preferences()['agent.idleAfterMs'] === def.min
  ok('79 out-of-range thresholds are refused, the bounds themselves are not',
    rejectedLow && rejectedHigh && acceptedBound,
    `rejectedLow=${rejectedLow} rejectedHigh=${rejectedHigh} acceptedBound=${acceptedBound}`)
}
{
  // 80. A number preference survives a write and a reopen, exactly as check
  //     71 proves for a boolean.
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  a.setPreference('agent.idleAfterMs', 2000)
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('80 a number preference round-trips', b.getSetting('agent.idleAfterMs') === 2000)
}
{
  // 80b. The LOAD path is a second door into the same preferences map, and it
  //      must refuse an out-of-range number the same way the write path
  //      (setPreference, check 79) does — a hand-edited or synced
  //      layout.json never goes through setPreference at all. Assert BOTH
  //      halves: a version that dropped the value silently, with no warning,
  //      would be a different bug wearing the same green check.
  const w = []
  const out = L.parsePreferences({ 'agent.idleAfterMs': 0 }, w)
  ok('80b an out-of-range number loaded from disk is dropped and warned, not carried into the map',
    !('agent.idleAfterMs' in out) && w.length === 1,
    JSON.stringify(out) + ' | ' + w.join('|'))
}

// 81. M6d's one setting. Declared like every other def — a label, a
//     description and keywords — and round-tripping through a write and a
//     reopen. The keywords matter as much as the toggle: ideas-backlog #11's
//     argument for a searchable settings surface is that a user who does not
//     know a feature's name can still find its switch, and "arrow" and
//     "off-screen" are what someone would actually type for this one.
{
  const def = L.settingDef('agent.edgeIndicators')
  const declared = def !== undefined && def.type === 'boolean' && def.default === true &&
    def.category === L.AGENT_CATEGORY &&
    typeof def.label === 'string' && def.label.length > 0 &&
    typeof def.description === 'string' && def.description.length > 0 &&
    Array.isArray(def.keywords) && def.keywords.length > 0
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  a.setPreference('agent.edgeIndicators', false)
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('81 agent.edgeIndicators is declared and round-trips',
    declared && b.getSetting('agent.edgeIndicators') === false,
    `declared=${declared} reopened=${b.getSetting('agent.edgeIndicators')}`)
}

// M7. Workspaces. The format has carried them since M4b (Workspace extends
// CanvasState, keyed by activeWorkspaceId) — these checks are about the STORE,
// which until now could only ever see one of them.

// 82. A fresh store answers one workspace, and it is the active one.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const ws = s.workspaces()
  ok('82 a fresh store has exactly one active workspace',
    ws.length === 1 && ws[0].active === true && ws[0].id === L.DEFAULT_WORKSPACE_ID,
    JSON.stringify(ws))
}

// 83. createWorkspace mints an ID_PATTERN-valid id, does NOT activate it, and
//     returns an id the list then contains. Not activating is the point: a
//     create that also switched would make "new workspace" a destination
//     change the user did not ask for, and Task 2 owns switching.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const id = s.createWorkspace('school')
  const ws = s.workspaces()
  const made = ws.find((w) => w.id === id)
  ok('83 createWorkspace mints a valid id and does not activate it',
    L.ID_PATTERN.test(id) && ws.length === 2 && made !== undefined &&
      made.name === 'school' && made.active === false &&
      made.panelIds.length === 0,
    `id=${id} ${JSON.stringify(ws)}`)
}

// 84. panelIds reports the workspace's own panels. This is what the renderer
//     intersects with attentionIds() — a wrong answer here is a waiting count
//     attributed to the wrong canvas.
{
  const path = tmp()
  writeFileSync(path, file(), 'utf8')
  const s = L.createLayoutStore({ filePath: path })
  s.load()
  const ws = s.workspaces()
  ok('84 panelIds reports the workspace’s own panels',
    ws.length === 1 && ws[0].panelIds.length === 1 && ws[0].panelIds[0] === 'p1',
    JSON.stringify(ws[0].panelIds))
}

// 85. Rename round-trips through a write and a reopen; an unknown id is false
//     and changes nothing — the same "false when the id names nothing" rule
//     renamePreset and deletePrompt already obey.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  const id = a.createWorkspace('school')
  const renamed = a.renameWorkspace(id, 'university')
  const missing = a.renameWorkspace('nope', 'x')
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  const found = b.workspaces().find((w) => w.id === id)
  ok('85 renameWorkspace round-trips, and an unknown id is false',
    renamed === true && missing === false && found !== undefined &&
      found.name === 'university',
    `renamed=${renamed} missing=${missing} name=${found && found.name}`)
}

// 86. Deleting a NON-active workspace removes it and leaves the active id
//     alone.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const id = s.createWorkspace('school')
  const gone = s.deleteWorkspace(id)
  const ws = s.workspaces()
  ok('86 deleting a non-active workspace leaves the active one alone',
    gone === true && ws.length === 1 &&
      ws[0].id === L.DEFAULT_WORKSPACE_ID && ws[0].active === true,
    JSON.stringify(ws))
}

// 87. Deleting the ACTIVE workspace activates a neighbour. Leaving
//     activeWorkspaceId naming a record that is gone would send
//     activeWorkspace() into its repair branch — a branch written for a
//     snapshot built in code and documented as unreachable from a parsed
//     file, which repairs by silently discarding whatever the caller thought
//     it was working with.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const other = s.createWorkspace('school')
  const gone = s.deleteWorkspace(L.DEFAULT_WORKSPACE_ID)
  const ws = s.workspaces()
  ok('87 deleting the active workspace activates a neighbour',
    gone === true && ws.length === 1 && ws[0].id === other && ws[0].active === true,
    JSON.stringify(ws))
}

// 88. NEVER ZERO WORKSPACES. parseLayout guarantees at least one ON LOAD, but
//     that is a read-path guarantee and deleteWorkspace is a write path that
//     did not exist when it was written. Deleting the last one installs a
//     fresh default and activates it — and it must survive a reopen, because
//     the failure this guards is a file with an empty workspaces array.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  const gone = a.deleteWorkspace(L.DEFAULT_WORKSPACE_ID)
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  const ws = b.workspaces()
  ok('88 deleting the last workspace installs a fresh one',
    gone === true && ws.length === 1 && ws[0].active === true &&
      ws[0].panelIds.length === 0,
    JSON.stringify(ws))
}

// 89. THE SAVE RACE. activate writes the OUTGOING state into the OLD record
//     before flipping the active id. save() merges into whatever is active AT
//     THE MOMENT IT RUNS, on a 500ms coalescing debounce — so a switch that
//     merely flips the id has a window in which workspace A's panels are
//     written into workspace B. The file stays well-formed. This is the whole
//     reason activate takes a parameter it looks like it should not need.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const other = s.createWorkspace('school')
  const outgoing = {
    panels: [panel({ id: 'a1' })],
    camera: { x: 7, y: 8, scale: 3 },
    selectedId: 'a1',
    focusedId: 'a1'
  }
  const res = s.activateWorkspace(other, outgoing)
  const ws = s.workspaces()
  const old = ws.find((w) => w.id === L.DEFAULT_WORKSPACE_ID)
  const now = ws.find((w) => w.id === other)
  ok('89 activate writes the outgoing state into the OLD record',
    res !== null && old !== undefined && old.panelIds.join() === 'a1' &&
      now !== undefined && now.active === true && now.panelIds.length === 0,
    `old=${old && old.panelIds.join()} new=${now && now.panelIds.join()}`)
}

// 90. activate returns the INCOMING workspace's own state, round-tripped
//     with the restore.* preferences NOT applied — a switch deliberately
//     ignores them, because they answer "what should the app show me when
//     it starts" and a switch is not a start (see check 94 and "A workspace
//     switch is a second boot, but not in preference semantics" in
//     CLAUDE.md). The fixture below is unaffected either way: it never
//     touches restore.*, so this check passes whether or not settings are
//     applied, and its real job is proving p1/its camera survive the round
//     trip at all, not exercising the settings path.
{
  const path = tmp()
  writeFileSync(path, file(), 'utf8')
  const s = L.createLayoutStore({ filePath: path })
  s.load()
  const other = s.createWorkspace('school')
  const empty = { panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }
  // Check 89 already proves `outgoing` is written into whichever workspace is
  // ACTIVE at the moment of the call (the one being left) — so leaving w1
  // with `empty` as outgoing would overwrite w1's own p1/camera with empty,
  // and the assertion below could never see p1 again on the way back. A real
  // switch-away passes whatever the renderer actually holds; here that is
  // w1's own unmodified canvas, so the write is a faithful no-op.
  const w1Now = { panels: [panel()], camera: { x: 10, y: 20, scale: 2 }, selectedId: null, focusedId: null }
  // Into the new one...
  s.activateWorkspace(other, w1Now)
  // ...and back, which must hand p1 (and its camera) straight back.
  const res = s.activateWorkspace(L.DEFAULT_WORKSPACE_ID, empty)
  ok('90 activate returns the incoming workspace’s own state',
    res !== null && res.state.panels.length === 1 && res.state.panels[0].id === 'p1' &&
      res.state.camera.x === 10 && res.state.camera.scale === 2,
    JSON.stringify(res && res.state.camera))
}

// 91. allPanelIds spans EVERY workspace, not the active one. nextIdRef seeds
//     from this, and PanelId doubles as the tmux session name — so a partial
//     view here is two panels naming one session, where the second to go live
//     attaches to the first one's process. This is the id-collision defect
//     M4a fixed by removing length-derived ids, resurrected through a door
//     M4a could not see.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const other = s.createWorkspace('school')
  const empty = { panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }
  s.activateWorkspace(other, {
    ...empty, panels: [panel({ id: 'n3' }), panel({ id: 'n7' })]
  })
  const res = s.activateWorkspace(other, { ...empty, panels: [panel({ id: 'n1' })] })
  const ids = res === null ? [] : [...res.allPanelIds].sort()
  ok('91 allPanelIds spans every workspace',
    ids.join() === 'n1,n3,n7', ids.join())
}

// 92. An unknown id returns null and changes NOTHING — in particular it must
//     not have written the outgoing state anywhere. A switch to a workspace
//     that is gone (a stale palette row, a second window) must be a no-op,
//     not a half-applied transaction.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  const res = s.activateWorkspace('nope', {
    panels: [panel({ id: 'zz' })],
    camera: { x: 1, y: 1, scale: 1 }, selectedId: null, focusedId: null
  })
  const ws = s.workspaces()
  ok('92 activating an unknown id is null and changes nothing',
    res === null && ws.length === 1 && ws[0].panelIds.length === 0,
    `res=${res} ${JSON.stringify(ws)}`)
}

// 93. The whole transaction survives a write and a reopen. 89 proves the
//     in-memory ordering; this proves it reached disk, which is where the
//     save race actually hurts.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  const other = a.createWorkspace('school')
  a.activateWorkspace(other, {
    panels: [panel({ id: 'a1' })],
    camera: { x: 5, y: 6, scale: 1 }, selectedId: null, focusedId: null
  })
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  const ws = b.workspaces()
  const old = ws.find((w) => w.id === L.DEFAULT_WORKSPACE_ID)
  const now = ws.find((w) => w.id === other)
  ok('93 the activate transaction survives a reopen',
    old !== undefined && old.panelIds.join() === 'a1' &&
      now !== undefined && now.active === true,
    JSON.stringify(ws))
}

// 94. A workspace switch must not obey restore.layout — that preference
//     answers "what should the app show at launch", not "at a switch". With
//     restore.layout OFF, activateWorkspace used to reuse the same doSave/
//     doInitial the launch path uses (with the settings applied), which meant
//     doSave skipped `w.panels = …` on the way OUT (the workspace being left
//     never records the panels it had — their tmux sessions orphan, reachable
//     from no workspace) and doInitial returned `panels: []` on the way IN
//     (the workspace being entered reads empty regardless of what it holds on
//     disk). Switch away from a workspace holding a panel, switch back, and
//     the panel must still be there.
{
  const s = L.createLayoutStore({ filePath: tmp() })
  s.load()
  s.setSetting('layout', false)
  const other = s.createWorkspace('school')
  const empty = { panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }
  // Leave w1 holding p1 (its own unmodified canvas, same fixture shape check
  // 90 uses) and switch into the new, empty workspace.
  const w1Now = { panels: [panel()], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }
  s.activateWorkspace(other, w1Now)
  // Switch back. If restore.layout were being consulted here, doSave would
  // have skipped writing p1 into w1's record on the way out, and doInitial
  // would hand back `panels: []` on the way in regardless.
  const res = s.activateWorkspace(L.DEFAULT_WORKSPACE_ID, empty)
  ok('94 a workspace switch ignores restore.layout — panels survive a round trip with it off',
    res !== null && res.state.panels.length === 1 && res.state.panels[0].id === 'p1',
    JSON.stringify(res && res.state.panels))
}

// 95. M8a's rail toggle. Declared like every other def and round-tripping
//     through a write and a reopen. The keywords carry more weight here than
//     usual: a user who wants the sidebar back has no vocabulary for "rail",
//     so "sidebar" and "panel list" have to be in the haystack or the switch
//     is reachable only by someone who already knows its name.
{
  const def = L.settingDef('shell.railOpen')
  const declared = def !== undefined && def.type === 'boolean' && def.default === true &&
    def.category === L.SHELL_CATEGORY &&
    typeof def.label === 'string' && def.label.length > 0 &&
    typeof def.description === 'string' && def.description.length > 0 &&
    Array.isArray(def.keywords) && def.keywords.includes('sidebar')
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  a.setPreference('shell.railOpen', false)
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('95 shell.railOpen is declared and round-trips',
    declared && b.getSetting('shell.railOpen') === false,
    `declared=${declared} reopened=${b.getSetting('shell.railOpen')}`)
}

// 96. The inspector toggle, and the half that is not a copy of 95: the two
//     ids are INDEPENDENT. One sparse map holds both, and writing one must
//     not disturb the other — a shared key, or a def whose id was pasted from
//     its neighbour, produces two switches that move together and looks like
//     a rendering bug rather than a schema one.
{
  const def = L.settingDef('shell.inspectorOpen')
  const declared = def !== undefined && def.type === 'boolean' && def.default === true &&
    def.category === L.SHELL_CATEGORY &&
    typeof def.label === 'string' && def.label.length > 0 &&
    typeof def.description === 'string' && def.description.length > 0 &&
    Array.isArray(def.keywords) && def.keywords.length > 0
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  a.setPreference('shell.inspectorOpen', false)
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('96 shell.inspectorOpen is declared, round-trips, and is independent of the rail',
    declared && b.getSetting('shell.inspectorOpen') === false &&
      b.getSetting('shell.railOpen') === true,
    `declared=${declared} inspector=${b.getSetting('shell.inspectorOpen')} rail=${b.getSetting('shell.railOpen')}`)
}

// 97. THE SHARED MINT. Both save surfaces — the menu's focused-panel path and
//     M8c's preset:save-panel invoke — go through this one function, so they
//     cannot disagree about what a saved preset is called or what id it gets.
//     Two copies would agree the day they were written and diverge the first
//     time one was edited, and the user's evidence would be two presets named
//     differently for the same panel depending on which surface saved it.
//
//     The absent-command clause is the one that matters most and is asserted
//     with `in`, not with a truthiness test: `command: undefined` is a
//     DIFFERENT fact from the key being absent, and it is the fact that
//     survives an IPC structured clone as `'command' in preset === true`.
//     Losing it makes every command-less preset spawn a hardcoded shell
//     instead of resolving the user's real login shell.
{
  const captured = { cwd: '/Users/x/proj', args: ['--foo'], w: 700, h: 400 }
  const p = L.presetFromCapture([], captured)
  const withCommand = L.presetFromCapture([p], { ...captured, command: '/opt/homebrew/bin/fish' })
  ok('97 presetFromCapture mints, names, and keeps an absent command absent',
    typeof p.id === 'string' && p.id.length > 0 &&
      p.id !== withCommand.id &&
      ('command' in p) === false &&
      withCommand.command === '/opt/homebrew/bin/fish' &&
      p.name.includes('login shell') && p.name.includes('proj') &&
      p.cwd === '/Users/x/proj' && p.args.length === 1 && p.args[0] === '--foo' &&
      p.w === 700 && p.h === 400,
    JSON.stringify([p, withCommand]))
}

// 98. A pre-M9a file has no `baselines` key at all. That warns NOTHING — it
//     is every file in existence — and resolves to an empty map. The
//     absent-versus-malformed line parsePresets already draws.
{
  const { snapshot, warnings } = L.parseLayout(JSON.stringify({ version: 1, workspaces: [] }))
  // Guarded on `!== undefined` rather than indexing straight into it: before
  // the field exists this line would THROW, aborting the run and taking
  // 99-103's RED with it, so the test-first step would prove nothing about
  // five of its six checks.
  ok('98 an absent baselines key warns nothing and resolves to an empty map', snapshot.baselines !== undefined &&
    Object.keys(snapshot.baselines).length === 0 &&
    !warnings.some((w) => w.includes('baseline')))
}

// 99. A present-but-malformed `baselines` WARNS rather than vanishing. A
//     silently dropped map is a user's whole review history disappearing with
//     nothing said.
{
  const { warnings } = L.parseLayout(JSON.stringify({ version: 1, baselines: [] }))
  ok('99 a malformed baselines key warns rather than vanishing', warnings.some((w) => w.includes('baseline')))
}

// 100. An entry missing `sha` is dropped INDIVIDUALLY; its neighbours survive.
{
  const { snapshot } = L.parseLayout(JSON.stringify({
    version: 1,
    baselines: { p1: { root: '/r', sha: 'a' }, p2: { root: '/r' } }
  }))
  ok('100 a baseline missing sha is dropped individually, its neighbours survive', snapshot.baselines.p1 !== undefined && snapshot.baselines.p2 === undefined)
}

// 101. A baseline survives a write and a reopen.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.setBaseline('p1', { root: '/r', sha: 'abc' })
  store.flushSync()
  const reopened = L.createLayoutStore({ filePath: path })
  reopened.load()
  const back = reopened.baseline('p1')
  ok('101 a baseline survives a write and a reopen', back !== undefined && back.sha === 'abc' && back.root === '/r')
}

// 102. baselinePeers counts OTHER panels in the same root and excludes the
//      asking panel. Counting itself would make every single-panel repo
//      report as shared, i.e. the feature would never once produce an
//      attributed answer.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setBaseline('p1', { root: '/r', sha: 'a' })
  store.setBaseline('p2', { root: '/r', sha: 'b' })
  store.setBaseline('p3', { root: '/other', sha: 'c' })
  ok('102 baselinePeers counts other panels in the root and excludes the asker', store.baselinePeers('/r', 'p1') === 1 && store.baselinePeers('/other', 'p3') === 0)
}

// 103b. baselineIds spans EVERY panel holding a baseline, across workspaces.
//       The startup sweep — which drops the baselines of panels whose session
//       did not survive a quit — enumerates through this, so a view narrowed
//       to the active workspace would leave a hidden workspace's panel diffed
//       against a snapshot from a previous day, which is the exact failure
//       that sweep exists to remove. Same reasoning as allPanelIds (check 91),
//       and the same reason `PanelId` is global rather than per-workspace.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setBaseline('p1', { root: '/r', sha: 'a' })
  store.setBaseline('p2', { root: '/other', sha: 'b' })
  const ids = typeof store.baselineIds === 'function' ? store.baselineIds().slice().sort() : null
  ok('103b baselineIds names every panel holding a baseline',
    ids !== null && JSON.stringify(ids) === JSON.stringify(['p1', 'p2']))
}

// 103. dropBaseline removes it. Without this the map grows for the life of
//      the install, and a recycled panel id inherits a dead panel's baseline
//      — which would attribute a fresh agent's first diff to a repository
//      state from weeks ago.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setBaseline('p1', { root: '/r', sha: 'a' })
  store.dropBaseline('p1')
  ok('103 dropBaseline removes it', store.baseline('p1') === undefined)
}

const SUBJECT = { subjectId: 'n4', repoRoot: '/tmp/repo', baselineSha: 'abc123', label: 'claude' }
const reviewPanelOnDisk = (id, over = {}) => ({
  id, x: 10, y: 20, w: 640, h: 520, z: 3, kind: 'review', subject: { ...SUBJECT }, ...over
})

// 104. The rule every other check in this block depends on: a panel with NO
//      `kind` key is a TERMINAL panel. Every layout.json in existence
//      predates the field, and parseLayout drops entries INDIVIDUALLY — so a
//      required `kind` would not fail loudly, it would silently empty every
//      saved canvas on first launch. The same trade `title` already makes.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main',
      panels: [{ id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }] }],
    activeWorkspaceId: 'w1'
  }))
  const p = out.snapshot.workspaces[0].panels[0]
  ok('104 a panel with no kind survives as a terminal panel',
    p !== undefined && p.kind === undefined && p.cwd === '~' &&
      L.toPanels([p])[0].kind === 'terminal')
}

// 105. A review panel round-trips through the format with all four subject
//      fields intact. baselineSha is the one that matters most: without it
//      the node cannot ask git anything at all, and a node that silently
//      lost it would render "not started" beside an agent that did an
//      hour's work — this milestone's headline silent failure, reached
//      through the format rather than through the engine.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [reviewPanelOnDisk('r1')] }],
    activeWorkspaceId: 'w1'
  }))
  const p = out.snapshot.workspaces[0].panels[0]
  ok('105 a review panel round-trips with its whole subject',
    p !== undefined && p.kind === 'review' && p.subject.subjectId === 'n4' &&
      p.subject.repoRoot === '/tmp/repo' && p.subject.baselineSha === 'abc123' &&
      p.subject.label === 'claude')
}

// 106. A malformed subject costs THAT panel, not the file — the rule this
//      whole parser is built on. Its neighbour must survive in the same
//      read, which is the half that fails if the review branch throws
//      instead of returning null.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      reviewPanelOnDisk('r1', { subject: { subjectId: 'n4' } }),
      { id: 'n9', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const ids = out.snapshot.workspaces[0].panels.map((p) => p.id)
  ok('106 a review panel with a broken subject is dropped alone',
    ids.length === 1 && ids[0] === 'n9' && out.warnings.length > 0)
}

// 107. THE ASYMMETRY. ABSENT means terminal (104); a PRESENT but unknown
//      kind is DROPPED, never defaulted. `"kind": "tree"` is a file written
//      by a later version of this app, and reading it as a terminal panel
//      would spawn a process for a node that never asked for one — with a
//      cwd and args it does not have. Dropping it costs one panel; guessing
//      costs a process.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main',
      panels: [{ id: 'x1', x: 0, y: 0, w: 640, h: 520, z: 1, kind: 'tree' }] }],
    activeWorkspaceId: 'w1'
  }))
  ok('107 an unknown kind is dropped, not defaulted to terminal',
    out.snapshot.workspaces[0].panels.length === 0 &&
      out.warnings.some((w) => w.includes('kind')))
}

// 108. The two kinds validate DIFFERENT fields, in both directions: a review
//      panel needs no cwd/args (it has no spec to build), and a terminal
//      panel still requires them. Asserting only the first half passes
//      against a parser that stopped validating cwd for everything.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      reviewPanelOnDisk('r1'),
      { id: 'n2', x: 0, y: 0, w: 720, h: 460, z: 1, args: [] }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const ids = out.snapshot.workspaces[0].panels.map((p) => p.id)
  ok('108 a review panel needs no cwd; a terminal panel still does',
    ids.length === 1 && ids[0] === 'r1')
}

// 108b. fromPanels writes a review panel back out with no cwd/args keys at
//       all, and toPanels(fromPanels(x)) is x. The absent-stays-absent rule
//       `command` and `title` already obey, applied to a whole branch:
//       writing `cwd: undefined` here would make the panel fail its own
//       parse on the next launch (check 108's terminal half), i.e. a canvas
//       that loses its review nodes on every relaunch.
{
  const node = L.makeReviewPanel
    ? L.makeReviewPanel('r1', { x: 0, y: 0 }, 3, { ...SUBJECT })
    : null
  const persisted = L.fromPanels([{ kind: 'review', rect: { id: 'r1', x: 10, y: 20, w: 640, h: 520 }, z: 3, subject: { ...SUBJECT } }])
  const back = L.toPanels(persisted)
  ok('108b a review panel survives fromPanels -> toPanels',
    node !== null && !('cwd' in persisted[0]) && !('args' in persisted[0]) &&
      back[0].kind === 'review' && back[0].subject.baselineSha === 'abc123' &&
      back[0].rect.x === 10)
}

/* ---- M14: reading every workspace, and moving panels between them ----
   Two new store verbs, no IPC and no UI yet — the renderer only ever holds
   the active workspace's array, so a merged cross-workspace view and a
   cross-workspace move both have to start in main, where every workspace's
   record already lives. Reuses this file's own helpers (tmp(), panel(),
   L.createLayoutStore) rather than inventing a second set, the same way
   checks 82-94 above already build workspace fixtures. */

// 129. mergedWorkspaces() spans EVERY workspace and carries WHOLE panels, not
//      the panelIds workspaces() carries. Both halves matter: a view that
//      could only see the active workspace would not be a merged view at
//      all, and ids alone cannot be laid out for display because they carry
//      no geometry — a lane needs a rect, not a name.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  const other = store.createWorkspace('School')
  const cam = { x: 0, y: 0, scale: 1 }
  store.save({ panels: [panel({ id: 'n1' })], camera: cam, selectedId: null, focusedId: null })
  store.activateWorkspace(other, { panels: [panel({ id: 'n1' })], camera: cam, selectedId: null, focusedId: null })
  store.save({ panels: [panel({ id: 'n2', x: 40, y: 40 })], camera: cam, selectedId: null, focusedId: null })
  const merged = store.mergedWorkspaces()
  ok('129 mergedWorkspaces spans every workspace, with whole panels',
    merged.length === 2 &&
      merged.every((w) => Array.isArray(w.panels)) &&
      merged.flatMap((w) => w.panels.map((p) => p.id)).sort().join(',') === 'n1,n2' &&
      merged.filter((w) => w.active).length === 1,
    JSON.stringify(merged.map((w) => [w.id, w.active, w.panels.map((p) => p.id)])))
}

// 130. The returned panels are COPIES, the same rule workspaces() and
//      presets() already obey. It is sharper here: the merged view's whole
//      job is to offset these rects into lanes for DISPLAY, and a shared
//      reference means that display-only offset is exactly the value the
//      next coalesced save serialises to disk — a well-formed layout.json
//      with the wrong rects in it, found launches later, with nothing
//      naming the view that caused it.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.save({ panels: [panel({ id: 'n1', x: 10, y: 20 })], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
  const merged = store.mergedWorkspaces()
  merged[0].panels[0].x = 99999
  ok('130 mergedWorkspaces hands back copies, not the live snapshot',
    store.mergedWorkspaces()[0].panels[0].x === 10,
    String(store.mergedWorkspaces()[0].panels[0].x))
}

// 131. The move itself: the panel leaves the source record and arrives in
//      the target. Asserted as BOTH halves in one read, because a move that
//      only ADDED to the target would duplicate a panel id across two
//      workspaces — and a duplicate PanelId is two panels sharing one tmux
//      session (PanelId doubles as the session name).
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  const target = store.createWorkspace('School')
  store.save({
    panels: [panel({ id: 'n1' }), panel({ id: 'n2', x: 40, y: 40 })],
    camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
  })
  const result = store.movePanels(['n2'], { workspaceId: target })
  const byId = Object.fromEntries(store.mergedWorkspaces().map((w) => [w.id, w.panels.map((p) => p.id)]))
  ok('131 a moved panel leaves the source AND arrives in the target',
    result !== null && result.workspaceId === target &&
      byId[L.DEFAULT_WORKSPACE_ID].join(',') === 'n1' && byId[target].join(',') === 'n2',
    JSON.stringify(byId))
}

// 132. The full set of panel ids, across every workspace, is UNCHANGED
//      across a move. The move mints no id and destroys none — it relocates
//      a record. The renderer seeds nextIdRef from exactly this set (via
//      ActivateResult.allPanelIds, main/index.ts's own internal
//      allPanelIds()), so a move that dropped an id from it would let a
//      later Cmd+N mint an id that is still live in another workspace, and
//      tmux's `new-session -A` would attach the new panel to the OLD
//      panel's process instead of starting its own.
//
//      store.allPanelIds() is not a public LayoutStore member — it exists
//      only as an internal closure surfaced through activateWorkspace's
//      return value — so this reads the same fact through mergedWorkspaces(),
//      which is public and spans every workspace by construction (check 109).
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  const target = store.createWorkspace('School')
  store.save({
    panels: [panel({ id: 'n1' }), panel({ id: 'n7', x: 40, y: 40 })],
    camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
  })
  const idsOf = () => store.mergedWorkspaces().flatMap((w) => w.panels.map((p) => p.id)).sort().join(',')
  const before = idsOf()
  store.movePanels(['n7'], { workspaceId: target })
  const after = idsOf()
  ok('132 the full panel id set is unchanged across a move',
    after === before, `${before} -> ${after}`)
}

// 133. An unknown target changes NOTHING and says so. A half-applied move —
//      panels removed from the source, never delivered anywhere — loses
//      them with no UI able to reach them again, exactly the orphan outcome
//      deleteWorkspace's own design already rejects (see
//      activateWorkspace's identical unknown-id branch, check 92 above).
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.save({ panels: [panel({ id: 'n1' })], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
  const result = store.movePanels(['n1'], { workspaceId: 'w-nope' })
  ok('133 an unknown target moves nothing and returns null',
    result === null && store.mergedWorkspaces()[0].panels.map((p) => p.id).join(',') === 'n1',
    JSON.stringify(store.mergedWorkspaces().map((w) => w.panels.map((p) => p.id))))
}

// 134. Moving to a NEW name mints exactly ONE workspace and puts both panels
//      in it. Exactly-one is half the check: minting once per panel is the
//      obvious loop bug, and it produces N single-panel workspaces that look
//      almost right in a rail — a user who asked to spin two panels into a
//      new lane instead gets two new lanes, each holding one.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.save({
    panels: [panel({ id: 'n1' }), panel({ id: 'n2', x: 40, y: 40 })],
    camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
  })
  const before = store.workspaces().length
  const result = store.movePanels(['n1', 'n2'], { newName: 'Spike' })
  const made = store.mergedWorkspaces().find((w) => w.name === 'Spike')
  ok('134 a move to a new name mints exactly one workspace holding both panels',
    result !== null && store.workspaces().length === before + 1 &&
      made !== undefined && made.panels.map((p) => p.id).sort().join(',') === 'n1,n2' &&
      made.active === false,
    JSON.stringify(store.workspaces().map((w) => w.name)))
}

// 135. An unknown panel id with a newName target creates NOTHING. This is
//      the fault a first draft of movePanels shipped: it minted the new
//      workspace before it knew whether anything was actually movable, so
//      a caller offering "Move to new workspace..." for a panel that was
//      closed between listing and confirming got told (correctly) that
//      nothing moved — while an empty workspace it never asked for sat on
//      disk and in the rail at the next launch, with nothing naming what
//      created it. workspaces().length is the whole check: a null result
//      alone would pass against exactly that regression.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.save({ panels: [panel({ id: 'n1' })], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
  const before = store.workspaces().length
  const result = store.movePanels(['nope'], { newName: 'Spike' })
  ok('135 an unknown id with a newName target creates no workspace',
    result === null && store.workspaces().length === before,
    `result=${JSON.stringify(result)} before=${before} after=${store.workspaces().length}`)
}

// ---------------------------------------------------------------------------
// M13. Links between panels, on disk. `link`, never `edge` — see panels.ts.

// 109. ABSENT is none, and that is the compatibility clause: every layout.json
//      ever written has no links key, so a reader that warned about the
//      absence would warn once per panel on every existing file. A PRESENT but
//      malformed links WARNS rather than vanishing silently — the line
//      parsePresets (41) and parseBaselines (99) already draw, and a silently
//      dropped field is a user's work gone with nothing said.
{
  const bare = L.parseLayout(file())
  const bad = L.parseLayout(file({
    workspaces: [{
      id: 'w1', name: 'Canvas', panels: [panel({ links: 'nope' })],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }]
  }))
  const only = (r) => active(r.snapshot).panels[0]
  ok('109 an absent links key warns nothing; a malformed one warns',
    only(bare).links === undefined && bare.warnings.length === 0 &&
    only(bad).links === undefined && bad.warnings.some((w) => /link/i.test(w)),
    `bare=${bare.warnings.length} bad=${JSON.stringify(bad.warnings)}`)
}

// 110. A malformed ENTRY is dropped individually and its neighbours survive —
//      the per-entry tolerance parseLayout already gives a malformed panel
//      (check 100 states it for baselines). One bad link costs that link, not
//      the panel's whole set.
//
//      A self-link and a duplicate are both refused at creation by addLink; a
//      hand-edited file is the OTHER door onto them, and each renders nothing
//      or renders twice, so both are dropped here too.
{
  const r = L.parseLayout(file({
    workspaces: [{
      id: 'w1', name: 'Canvas',
      panels: [
        panel({ id: 'a', links: [
          { to: 'b' }, { to: 42 }, 'nope', { to: 'a' }, { to: 'b' },
          { to: 'c', label: 'feeds' }
        ] }),
        panel({ id: 'b' }),
        panel({ id: 'c' })
      ],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }]
  }))
  const links = active(r.snapshot).panels[0].links
  ok('110 a malformed, self and duplicate link entry are each dropped alone',
    links.length === 2 && links[0].to === 'b' &&
    links[1].to === 'c' && links[1].label === 'feeds',
    JSON.stringify(links))
}

// 111. THE ONE WORTH KNOWING BY NUMBER. A link naming a panel that did not
//      SURVIVE validation is dropped, and parseWorkspace is the only place
//      that can do it — the only scope that knows the whole surviving set. It
//      already builds `seen` for exactly this shape of question (selectedId
//      and focusedId are filtered through it), so this is a second pass over a
//      set that already exists rather than new bookkeeping.
//
//      This is the ON-DISK half of the dangling-link stance; removePanel is
//      the in-memory half, and a canvas needs BOTH, because a file can be
//      hand-edited between two launches.
//
//      The surviving-link clause is the over-correction guard: dropping every
//      link because one target was bad empties the canvas silently, which is
//      the failure this whole stance exists to prevent wearing the other sign.
{
  const r = L.parseLayout(file({
    workspaces: [{
      id: 'w1', name: 'Canvas',
      panels: [
        panel({ id: 'a', links: [{ to: 'b' }, { to: 'ghost' }] }),
        panel({ id: 'b' }),
        // Dropped by parsePanel: no cwd. So `ghost` never reaches `seen`.
        { id: 'ghost', x: 0, y: 0, w: 720, h: 460, z: 3, args: [] }
      ],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }]
  }))
  const w = active(r.snapshot)
  ok('111 a link to a panel that did not survive validation is dropped',
    w.panels.length === 2 &&
    w.panels[0].links.length === 1 && w.panels[0].links[0].to === 'b',
    JSON.stringify(w.panels[0].links))
}

// 112. Links survive a write and a reopen through the real coalesced store,
//      label intact — check 101's round trip, for this field.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.save({
    panels: [
      panel({ id: 'a', links: [{ to: 'b', label: 'feeds' }] }),
      panel({ id: 'b' })
    ],
    camera: { x: 0, y: 0, scale: 1 },
    selectedId: null,
    focusedId: null
  })
  store.flushSync()
  const reopened = L.createLayoutStore({ filePath: path })
  reopened.load()
  const back = reopened.initial().panels.find((p) => p.id === 'a')
  ok('112 a link survives a write and a reopen',
    back !== undefined && back.links !== undefined && back.links.length === 1 &&
    back.links[0].to === 'b' && back.links[0].label === 'feeds',
    JSON.stringify(back && back.links))
}

// 113. The field survives layout-adapt's fromPanels/toPanels round trip, which
//      is the OTHER door onto this format and the one a schema-only check
//      cannot see — check 108b's argument, for links.
//
//      The absent-stays-ABSENT clause is the half that carries weight:
//      `links: undefined` is a different fact from the key being missing, and
//      an adapter that spread its input would write an explicit undefined onto
//      every panel that has no links. That is the rule `command` already obeys
//      here, and the reason it obeys it is that the difference SURVIVES an IPC
//      structured clone.
{
  const withLinks = [
    { kind: 'terminal', rect: { id: 'a', x: 1, y: 2, w: 720, h: 460 }, z: 1,
      spec: { panelId: 'a', cwd: '~', args: [] }, links: [{ to: 'b', label: 'feeds' }] },
    { kind: 'terminal', rect: { id: 'b', x: 3, y: 4, w: 720, h: 460 }, z: 2,
      spec: { panelId: 'b', cwd: '~', args: [] } }
  ]
  const persisted = L.fromPanels(withLinks)
  const back = L.toPanels(persisted)
  ok('113 links round-trip through layout-adapt, and absence stays absent',
    back[0].links.length === 1 && back[0].links[0].label === 'feeds' &&
    !('links' in back[1]) && !('links' in persisted[1]),
    JSON.stringify(persisted))
}

// 113b. A functional link survives both durable doors, while a hand-edited
// cycle is stripped before it can make two terminals restart one another.
{
  const r = L.parseLayout(file({
    workspaces: [{
      id: 'w1', name: 'Canvas',
      panels: [
        panel({ id: 'a', links: [{ to: 'b', automation: { kind: 'restart-on-exit', enabled: true } }] }),
        panel({ id: 'b', links: [{ to: 'a', automation: { kind: 'restart-on-exit', enabled: true } }] })
      ], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }]
  }))
  const links = active(r.snapshot).panels[0].links
  const other = active(r.snapshot).panels[1].links
  ok('113b restart-on-exit persists but a hand-edited cycle is dropped',
    [links[0].automation?.enabled === true, other[0].automation?.enabled === true]
      .filter(Boolean).length === 1 &&
    r.warnings.some((w) => /restart cycle/.test(w)),
    JSON.stringify({ links, other, warnings: r.warnings }))
}

// M41 — handoff edges: the second automation kind on the same link. Scoped ids.
const reviewOnDisk = (id, subjectId) => ({
  id, x: 0, y: 0, w: 640, h: 520, z: 1, kind: 'review',
  subject: { subjectId, repoRoot: '/r', baselineSha: 'abc', label: 'claude' }
})
const handoffLayout = (panels) => L.parseLayout(file({
  workspaces: [{ id: 'w1', name: 'Canvas', panels, camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }]
}))

// handoff.1. Both kinds parse and survive the durable door with their fields
//      intact: a handoff rule keeps its trigger (exit AND idle), and the
//      restart rule beside it is untouched — the union widened, nothing
//      narrowed.
{
  const r = handoffLayout([
    panel({ id: 'a', links: [{ to: 'b', label: 'feeds', automation: { kind: 'handoff', enabled: true, trigger: 'exit' } }] }),
    panel({ id: 'b', links: [{ to: 'c', automation: { kind: 'handoff', enabled: true, trigger: 'idle' } }] }),
    panel({ id: 'c', links: [{ to: 'd', automation: { kind: 'restart-on-exit', enabled: true } }] }),
    panel({ id: 'd' })
  ])
  const ps = active(r.snapshot).panels
  const ab = ps[0].links?.[0], bc = ps[1].links?.[0], cd = ps[2].links?.[0]
  ok('handoff.1 a handoff rule parses with its trigger (exit and idle) beside an untouched restart rule',
    ab?.automation?.kind === 'handoff' && ab.automation.enabled === true && ab.automation.trigger === 'exit' && ab.label === 'feeds' &&
      bc?.automation?.kind === 'handoff' && bc.automation.trigger === 'idle' &&
      cd?.automation?.kind === 'restart-on-exit' && cd.automation.enabled === true &&
      r.warnings.length === 0,
    JSON.stringify({ ab, bc, cd, warnings: r.warnings }))
}

// M82 — budget.1. The two ceilings are settings: numbers, defaulting to 0
//      (no ceiling), in the Agents category, and resolvable through the same
//      door every other setting uses.
{
  const defs = L.SETTINGS ?? []
  const maxc = defs.find((d) => d.id === 'agents.maxConcurrent')
  const budget = defs.find((d) => d.id === 'agents.budgetUsd')
  const windowPct = defs.find((d) => d.id === 'agents.budgetWindowPercent')
  ok('budget.1 agents.maxConcurrent and agents.budgetUsd are number settings defaulting to 0 — no ceiling — in the Agents category, each naming what 0 means',
    maxc && maxc.type === 'number' && maxc.default === 0 && /0 is no ceiling/.test(maxc.description) &&
      budget && budget.type === 'number' && budget.default === 0 && /0 is no ceiling/.test(budget.description) &&
      maxc.category === budget.category,
    JSON.stringify({ maxc, budget }))
  ok('budget-window.1 agents.budgetWindowPercent is a number setting defaulting to 0 — no ceiling — in the Agents category, for subscribers who stop at N% of the binding usage window',
    windowPct && windowPct.type === 'number' && windowPct.default === 0 && /0 is no ceiling/.test(windowPct.description) &&
      windowPct.min === 0 && windowPct.max === 100 && windowPct.category === budget.category &&
      /window|percent|%/.test(windowPct.description),
    JSON.stringify({ windowPct }))
}

// M80 — template.1. THE TEMPLATE RECORD, top level beside presets and
//      prompts: absent is every pre-M80 file (no warning); a template that is
//      not an object, has no usable id or name, or has no surviving node is
//      dropped by name; a node with an unusable key or kind is dropped and the
//      template kept; an edge naming a key that did not survive is dropped and
//      the template kept; the newest TEMPLATES_MAX kept.
{
  const node = (over = {}) => ({ key: 'a', kind: 'terminal', cwd: '~', dx: 0, dy: 0, ...over })
  const tpl = (over = {}) => ({ id: 't1', name: 'review this', nodes: [node(), node({ key: 'b', kind: 'chat' })], edges: [{ from: 'a', to: 'b', trigger: 'exit-ok' }], ...over })
  const withTemplates = (templates) => L.parseLayout(file(templates === undefined ? {} : { templates }))
  const absent = withTemplates(undefined)
  const r = withTemplates([
    tpl(),
    tpl({ id: 't2', name: 'dangling', nodes: [node(), node({ key: 'ghost', kind: 'nonsense' })], edges: [{ from: 'a', to: 'ghost', trigger: 'exit' }, { from: 'a', to: 'a', trigger: 'exit' }] }),
    tpl({ id: 't3', name: '' }),
    tpl({ id: 't5', name: 'bad trigger', edges: [{ from: 'a', to: 'b', trigger: 'whenever' }] }),
    tpl({ id: 't4', nodes: [] }),
    'nonsense'
  ])
  const many = withTemplates(Array.from({ length: (L.TEMPLATES_MAX ?? 30) + 4 }, (_, i) => tpl({ id: `m${i}`, name: `m ${i}` })))
  const kept = r.snapshot.templates ?? []
  ok('template.1 templates: absent is [] with no warning; a malformed one is dropped by name; a bad node is dropped and the template kept; an edge naming a dropped node goes and the template stays; the cap holds',
    Array.isArray(absent.snapshot.templates) && absent.snapshot.templates.length === 0 && absent.warnings.length === 0 &&
      kept.length === 3 && kept[2].id === 't5' && kept[2].edges.length === 0 && r.warnings.some((w) => /t5/.test(w) && /trigger/.test(w)) &&
      kept[0].id === 't1' && kept[0].nodes.length === 2 && kept[0].edges.length === 1 && kept[0].edges[0].trigger === 'exit-ok' &&
      kept[1].id === 't2' && kept[1].nodes.length === 1 && kept[1].edges.length === 1 && kept[1].edges[0].to === 'a' &&
      r.warnings.some((w) => /t3/.test(w)) && r.warnings.some((w) => /t4/.test(w)) && r.warnings.some((w) => /ghost/.test(w)) &&
      (many.snapshot.templates ?? []).length === (L.TEMPLATES_MAX ?? 30),
    JSON.stringify({ absent: absent.snapshot.templates, kept, warnings: r.warnings, many: (many.snapshot.templates ?? []).length }))
}

// M79 — run.1. THE RUN RECORD on the workspace, beside groups and bookmarks:
//      absent is every pre-M79 file (no warning); a malformed run is dropped
//      by name; an entry naming a missing panel is dropped and the run kept;
//      a run with no surviving panel is dropped; the newest RUNS_MAX kept.
{
  const runsLayout = (panels, runs) => L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels, camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null, ...(runs === undefined ? {} : { runs }) }]
  }))
  const good = { id: 'run-1', name: 'a → b · 10:00', panelIds: ['a', 'b'], edges: [{ from: 'a', to: 'b' }], startedAt: 1000, endedAt: 2000, entries: [{ panelId: 'a', startedAt: 1000, endedAt: 1500, outcome: 'exit 0' }, { panelId: 'b', startedAt: 1500 }, { panelId: 'ghost', startedAt: 1600 }], costUsd: 0.12 }
  const absent = runsLayout([panel({ id: 'a' })])
  const r = runsLayout([panel({ id: 'a' }), panel({ id: 'b' })], [
    good,
    { id: 'run-2', name: 'gone', panelIds: ['zz'], edges: [], startedAt: 1, entries: [] },
    { id: 'run-3', panelIds: ['a'], edges: [], startedAt: 1, entries: [] },
    { id: 'run-4', name: 'open', panelIds: ['a'], edges: [], startedAt: 5, entries: [{ panelId: 'a', startedAt: 5 }] },
    'nonsense'
  ])
  const many = runsLayout([panel({ id: 'a' })], Array.from({ length: L.RUNS_MAX + 5 }, (_, i) => ({ id: `r${i}`, name: `run ${i}`, panelIds: ['a'], edges: [], startedAt: i, entries: [] })))
  const ws = active(r.snapshot)
  const kept = ws.runs ?? []
  const absentRuns = active(absent.snapshot).runs ?? null
  const manyRuns = active(many.snapshot).runs ?? []
  ok('run.1 runs: absent is [] with no warning; a malformed run (no name, not an object) is dropped by name; a run with no surviving panel is dropped; a missing entry is pruned and the run kept with its fields; the newest RUNS_MAX are kept',
    Array.isArray(absentRuns) && absentRuns.length === 0 && absent.warnings.length === 0 &&
      kept.length === 2 && kept[0].id === 'run-1' && kept[0].name === good.name && kept[0].endedAt === 2000 && kept[0].costUsd === 0.12 && kept[0].edges.length === 1 &&
      kept[0].entries.length === 2 && kept[0].entries[0].outcome === 'exit 0' && kept[0].entries[1].endedAt === undefined && kept[1].id === 'run-4' && kept[1].endedAt === undefined &&
      r.warnings.some((w) => /run-2/.test(w)) && r.warnings.some((w) => /run-3/.test(w)) && r.warnings.some((w) => /ghost/.test(w)) &&
      manyRuns.length === L.RUNS_MAX && manyRuns[0]?.startedAt === L.RUNS_MAX + 4,
    JSON.stringify({ absent: absentRuns, kept, warnings: r.warnings, many: manyRuns.length }))
}

// M78 — graph.1. The three new triggers parse; an unknown one is still malformed.
{
  const r = handoffLayout([
    panel({ id: 'a', links: [{ to: 'b', automation: { kind: 'handoff', enabled: true, trigger: 'exit-ok' } }] }),
    panel({ id: 'b', links: [{ to: 'c', automation: { kind: 'handoff', enabled: true, trigger: 'exit-fail' } }] }),
    panel({ id: 'c', links: [{ to: 'd', automation: { kind: 'handoff', enabled: true, trigger: 'always' } }] }),
    panel({ id: 'd', links: [{ to: 'a', automation: { kind: 'handoff', enabled: true, trigger: 'sometimes' } }] })
  ])
  const ps = active(r.snapshot).panels
  ok('graph.1 exit-ok, exit-fail and always parse as handoff triggers; an unknown trigger drops the rule with a warning and keeps the link',
    ps[0].links?.[0]?.automation?.trigger === 'exit-ok' && ps[1].links?.[0]?.automation?.trigger === 'exit-fail' && ps[2].links?.[0]?.automation?.trigger === 'always' &&
      ps[3].links?.[0]?.to === 'a' && ps[3].links?.[0]?.automation === undefined && r.warnings.some((w) => /d -> a/.test(w) && /malformed/.test(w)),
    JSON.stringify({ links: ps.map((p) => p.links), warnings: r.warnings }))
}

// M78 — graph.2. A handoff between two chats survives the durable door; a
//      restart rule on a chat is dropped by name, the link kept.
{
  const chatOnDisk = (id, links) => ({ id, x: 0, y: 0, w: 400, h: 300, z: 1, kind: 'chat', chat: { cwd: '/r', sessionId: 'u-' + id }, ...(links ? { links } : {}) })
  const r = handoffLayout([
    chatOnDisk('a', [{ to: 'b', automation: { kind: 'handoff', enabled: true, trigger: 'idle' } }]),
    chatOnDisk('b', [{ to: 't', automation: { kind: 'restart-on-exit', enabled: true } }]),
    panel({ id: 't' })
  ])
  const ps = active(r.snapshot).panels
  ok('graph.2 a handoff between two chats parses; a restart rule on a chat is dropped by name and the link kept',
    ps[0].links?.[0]?.automation?.trigger === 'idle' && ps[1].links?.[0]?.to === 't' && ps[1].links?.[0]?.automation === undefined &&
      r.warnings.some((w) => /b -> t/.test(w) && /terminal panels/.test(w)),
    JSON.stringify({ links: ps.map((p) => p.links), warnings: r.warnings }))
}

// handoff.2. Malformed drops the AUTOMATION and keeps the LINK, with a
//      warning naming the link: an unknown trigger, a missing trigger, and a
//      handoff naming a sessionless endpoint (a review node cannot receive a
//      paste) each cost the rule and never the relation.
{
  const r = handoffLayout([
    panel({ id: 'a', links: [
      { to: 'b', label: 'x', automation: { kind: 'handoff', enabled: true, trigger: 'never' } },
      { to: 'c', automation: { kind: 'handoff', enabled: true } },
      { to: 'r1', automation: { kind: 'handoff', enabled: true, trigger: 'exit' } }
    ] }),
    panel({ id: 'b' }), panel({ id: 'c' }), reviewOnDisk('r1', 'b')
  ])
  const links = active(r.snapshot).panels[0].links ?? []
  ok('handoff.2 a malformed or sessionless handoff drops the automation, keeps the link, and warns by name',
    links.length === 3 && links.every((l) => l.automation === undefined) && links[0].label === 'x' &&
      r.warnings.filter((w) => /a -> b.*malformed/.test(w)).length === 1 &&
      r.warnings.filter((w) => /a -> c.*malformed/.test(w)).length === 1 &&
      r.warnings.some((w) => /a -> r1.*terminal( or chat)? panels/.test(w)),
    JSON.stringify({ links, warnings: r.warnings }))
}

// handoff.3. The cycle rule covers BOTH kinds together: a handoff a->b on
//      idle plus a restart b->a is an infinite ping-pong between two
//      interactive agents, and exactly one of the two survives the load with
//      a warning that says cycle. A DISABLED rule does not close a cycle.
{
  const r = handoffLayout([
    panel({ id: 'a', links: [{ to: 'b', automation: { kind: 'handoff', enabled: true, trigger: 'idle' } }] }),
    panel({ id: 'b', links: [{ to: 'a', automation: { kind: 'restart-on-exit', enabled: true } }] }),
    panel({ id: 'c', links: [{ to: 'd', automation: { kind: 'handoff', enabled: false, trigger: 'exit' } }] }),
    panel({ id: 'd', links: [{ to: 'c', automation: { kind: 'handoff', enabled: true, trigger: 'exit' } }] })
  ])
  const ps = active(r.snapshot).panels
  const survivingAB = [ps[0].links?.[0]?.automation?.enabled === true, ps[1].links?.[0]?.automation?.enabled === true].filter(Boolean).length
  ok('handoff.3 a mixed-kind cycle is stripped on load with a cycle warning; a disabled rule does not close one',
    survivingAB === 1 && r.warnings.filter((w) => /cycle/.test(w)).length === 1 &&
      ps[2].links?.[0]?.automation?.enabled === false && ps[3].links?.[0]?.automation?.enabled === true,
    JSON.stringify({ ps: ps.map((p) => p.links), warnings: r.warnings }))
}

const filePanelOnDisk = (id, over = {}) => ({
  id, x: 1, y: 2, w: 640, h: 520, z: 3, kind: 'file', source: { path: '/tmp/a b/c.txt' }, ...over
})

// M16 (originally numbered 109-112 under this branch's own M13, which
// collided with main's own DIFFERENT M13 — "links between panels", which
// independently claimed 109-113 in this file. See the milestone-wide
// renumbering commit for the full story.)
// 114 — a file panel round-trips with its whole source.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [filePanelOnDisk('f1')], camera: L.DEFAULT_CAMERA }],
    activeWorkspaceId: 'w1'
  }))
  const p = out.snapshot.workspaces[0].panels[0]
  ok('114 a file panel parses with its whole source',
    p !== undefined && p.kind === 'file' && p.source.path === '/tmp/a b/c.txt' && out.warnings.length === 0,
    JSON.stringify(p))
}
// 115 — a malformed source drops that panel ALONE, with a warning. The
// individual-drop rule parseLayout obeys everywhere else; its neighbour
// surviving is the half that says "alone".
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      filePanelOnDisk('f1', { source: { path: 42 } }),
      { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 2, cwd: '~', args: [] }
    ], camera: L.DEFAULT_CAMERA }],
    activeWorkspaceId: 'w1'
  }))
  const ids = out.snapshot.workspaces[0].panels.map((p) => p.id)
  ok('115 a malformed source drops that panel alone',
    ids.length === 1 && ids[0] === 'n1' && out.warnings.length === 1,
    `kept=${ids.join(',')} warnings=${out.warnings.length}`)
}
// 116 — the two rules that must NOT have moved. Absent kind is still terminal
// (every pre-M9b file), and a present unknown kind is still dropped. Adding an
// arm above the unknown-kind drop is exactly the edit that could break either.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] },
      { id: 'w2', kind: 'whiteboard', x: 0, y: 0, w: 720, h: 460, z: 2 }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  ok('116 absent kind is still terminal and an unknown kind is still dropped',
    panels.length === 1 && panels[0].kind === undefined
      && out.warnings.some((w) => w.includes('whiteboard')))
}
// 117 — the SAME union survives layout-adapt's round trip, the other door onto
// this format and the one a schema-only check cannot see. The fromPanels arm
// must write no cwd key AT ALL — `cwd: undefined` fails its own parse next
// launch, losing the panel on every relaunch, silently.
{
  const panels = L.toPanels([
    { id: 'f1', kind: 'file', x: 1, y: 2, w: 640, h: 520, z: 3, source: { path: '/tmp/x.txt' }, title: 'notes' }
  ])
  const back = L.fromPanels(panels)
  ok('117 a file panel survives toPanels/fromPanels with no cwd key',
    panels[0].kind === 'file' && panels[0].source.path === '/tmp/x.txt'
      && back[0].kind === 'file' && back[0].source.path === '/tmp/x.txt'
      && back[0].title === 'notes' && !('cwd' in back[0]) && !('args' in back[0]),
    JSON.stringify(back[0]))
}

// ---------------------------------------------------------------------------
// M17. A panel's pinned agent session id, on disk. A sibling of `baselines`,
// same shape and same reasoning: PanelId is global (it doubles as a tmux
// session name), so this map is keyed globally too rather than nested inside
// a workspace.

// 118. Absent warns NOTHING. Every layout.json written before M17 has no
//      sessions key, and shouting about those would make the first launch
//      after an upgrade complain about a file that is perfectly fine — the
//      line parsePresets, parsePreferences and parseBaselines all already draw.
{
  const warnings = []
  const out = L.parseSessions(undefined, warnings)
  ok('118 an absent sessions map warns nothing',
    Object.keys(out).length === 0 && warnings.length === 0,
    `warnings=${warnings.length}`)
}

// 119. Present but MALFORMED warns rather than vanishing silently. The rule
//      check 41 states for presets and 99 for baselines: a map dropped without
//      a word is every pinned panel's accounting gone with nothing said.
{
  const warnings = []
  L.parseSessions([], warnings)
  ok('119 a malformed sessions map warns', warnings.length === 1, warnings.join('; '))
}

// 120. A malformed ENTRY drops alone while its neighbour survives — the
//      individual-drop rule parseLayout obeys everywhere else. A non-string
//      session id is the reachable case: a hand-edited file, or a future
//      version writing an object here.
{
  const warnings = []
  const out = L.parseSessions({ n1: 'abc-123', n2: 42 }, warnings)
  ok('120 a malformed session entry drops alone',
    out.n1 === 'abc-123' && out.n2 === undefined && warnings.length === 1,
    JSON.stringify(out))
}

// 121. A session id survives a write and a reopen through the real coalesced
//      store. This is success criterion 2's storage half: without it a Cmd+R
//      reload re-mints, the new uuid names a transcript that does not exist,
//      and the panel's cost freezes with nothing in any log.
{
  const path = tmp()
  const a = L.createLayoutStore({ filePath: path })
  a.load()
  a.setSession('n1', 'abc-123')
  a.flushSync()
  const b = L.createLayoutStore({ filePath: path })
  b.load()
  ok('121 a session id survives a write and a reopen',
    b.session('n1') === 'abc-123', String(b.session('n1')))
}

// 122. dropSession removes it. The same recycled-id hazard dropBaseline
//      closes: a panel reusing a dead one's id must not inherit its session,
//      because --session-id naming an EXISTING session is a resume — that
//      panel would come back holding a stranger's conversation.
{
  const path = tmp()
  const s = L.createLayoutStore({ filePath: path })
  s.load()
  s.setSession('n1', 'abc-123')
  s.dropSession('n1')
  s.flushSync()
  const reopened = L.createLayoutStore({ filePath: path })
  reopened.load()
  ok('122 dropSession removes the pin', reopened.session('n1') === undefined,
    String(reopened.session('n1')))
}

// 123. `agent` round-trips through a preset, and an ABSENT agent writes no
//      key at all rather than a saved absent-marker. Absent is the ordinary
//      case — a login-shell preset is not a Claude Code preset — and the
//      `in` test is deliberate: `agent: undefined` is a DIFFERENT fact from
//      the key being missing, and it is the one that survives an IPC
//      structured clone. This is check 97's rule and the absent-command
//      rule, applied to a second optional field.
{
  const warnings = []
  const out = L.parsePresets(
    [{ id: 'p1', name: 'Claude', cwd: '~', args: [], agent: 'claude-code' },
     { id: 'p2', name: 'Shell', cwd: '~', args: [] }],
    warnings)
  ok('123 agent round-trips, and absent stays absent',
    out[0].agent === 'claude-code' && !('agent' in out[1]) && warnings.length === 0,
    `${out[0].agent} / ${'agent' in out[1]}`)
}

// 124. An UNKNOWN agent value is dropped with a warning rather than carried
//      forward. Check 107's asymmetry: a value written by a version that
//      knew an adapter this one does not must not be honoured, because
//      honouring it means passing a flag to a CLI that has never heard of
//      it — which fails the spawn outright rather than merely failing to
//      account.
{
  const warnings = []
  const out = L.parsePresets([{ id: 'p1', name: 'x', cwd: '~', args: [], agent: 'unknown-cli' }], warnings)
  ok('124 an unknown agent is dropped with a warning',
    !('agent' in out[0]) && warnings.length === 1, warnings.join('; '))
}

// ---------------------------------------------------------------------------
// Final review fix. PersistedTerminalPanel had no `agent` field at all: a
// preset's own agent round-tripped (123/124) while a PANEL's did not, so
// every restart dropped spec.agent off a restored panel, buildInspectorModel's
// `pinned` test went false, and the Cost section vanished — silently, and
// permanently, even though main's PtyManager kept accumulating and sending
// usage:panel for a session layout.json's own record no longer named.

// 125. A panel's `agent` round-trips through the schema parser with no
//      warning — the same absent-vs-malformed line 123 draws for a preset,
//      drawn here for the SECOND record type that carries the field.
{
  const { snapshot, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas',
      panels: [panel({ agent: 'claude-code' }), panel({ id: 'p2' })],
      camera: { x: 10, y: 20, scale: 2 }, selectedId: null, focusedId: null
    }],
    settings: { layout: true, camera: true, focus: true }
  }))
  const w = active(snapshot)
  const [p1, p2] = w.panels
  ok('125 a panel agent round-trips, and absent stays absent',
    p1.agent === 'claude-code' && !('agent' in p2) && warnings.length === 0,
    `${p1.agent} / ${'agent' in p2}`)
}

// 126. An unknown agent value on a PANEL is dropped with a warning rather
//      than carried into the map — 124's rule, on the record type that
//      actually reaches buildInspectorModel's `pinned` test.
{
  const { snapshot, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas',
      panels: [panel({ agent: 'codex-cli-but-misspelled' })],
      camera: { x: 10, y: 20, scale: 2 }, selectedId: null, focusedId: null
    }],
    settings: { layout: true, camera: true, focus: true }
  }))
  const w = active(snapshot)
  ok('126 an unknown panel agent is dropped with a warning',
    !('agent' in w.panels[0]) && warnings.length === 1, warnings.join('; '))
}

// 127. `spec.agent` survives a real write and a real reopen through
//      layout-adapt's fromPanels/toPanels round trip, which is the OTHER
//      door onto this field and the one a schema-only check (125) cannot
//      see — the exact gap this fix round found, since 123/124 only ever
//      exercised Preset.agent, never PanelSpec.agent.
{
  const [persisted] = L.fromPanels([{
    kind: 'terminal',
    rect: { id: 'p1', x: 0, y: 0, w: 720, h: 460 },
    spec: { panelId: 'p1', cwd: '~', args: ['-l'], agent: 'claude-code' },
    z: 1
  }])
  ok('127 fromPanels carries spec.agent out', persisted.agent === 'claude-code')
  const [back] = L.toPanels([persisted])
  ok('127b toPanels carries agent back into spec', back.spec.agent === 'claude-code')
}

// 128. An untitled — unpinned — panel writes no `agent` key at all, the same
//      rule check 60 states for `title`: a spread would put `agent: undefined`
//      in layout.json, where `'agent' in panel` reads true for a panel that
//      was never pinned to anything.
{
  const [out] = L.fromPanels([{
    kind: 'terminal',
    rect: { id: 'p1', x: 0, y: 0, w: 720, h: 460 },
    spec: { panelId: 'p1', cwd: '~', args: ['-l'] },
    z: 1
  }])
  ok('128 an unpinned panel writes no agent key at all', !('agent' in out))
// M20 checks 136-141: main/fs-tree.ts, joining this suite for the reason
// main/prompts.ts already did — it reads node:fs against a path passed in as a
// parameter, and it is `electron` and `node-pty` that move a module out of
// this tier, not the filesystem.
//
// Numbered M13 throughout design and implementation; renumbered to M20 on
// merge into main. Two collisions, not one: this branch and HEAD each
// numbered forward from check 108b independently, and HEAD's own history had
// already claimed the whole 109-135 range across several unrelated
// milestones (including a DIFFERENT M13, "links between panels") by the time
// these two branches met. 136 is the first number past HEAD's real maximum
// (135), re-derived from the merged file rather than assumed.
//
// The fixture directory carries a SPACE throughout. That is not decoration:
// the pane-died quoting bug shipped through eight task reviews because every
// fixture used a space-free path, and this repo now treats a space-free
// fixture as a fixture that cannot see a whole class of defect.
{
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, chmodSync, rmSync } =
    require('node:fs')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')

  const base = mkdtempSync(join(tmpdir(), 'tc files '))

  // 136. Directories first, then names, case-insensitively. readdir's order is
  // filesystem-dependent, and a list that reshuffles between launches is a
  // list you cannot learn — readProjectPrompts' own argument for its sort().
  {
    const d = join(base, 'sorted')
    mkdirSync(d)
    writeFileSync(join(d, 'Beta.txt'), 'x')
    writeFileSync(join(d, 'alpha.txt'), 'x')
    mkdirSync(join(d, 'zeta'))
    mkdirSync(join(d, 'Alpha'))
    const r = L.readDir(d, { showHidden: false })
    const names = r.kind === 'ok' ? r.entries.map((e) => e.name) : []
    ok('136 entries sort directories-first then name, case-insensitively',
      r.kind === 'ok' &&
      names.join(',') === 'Alpha,zeta,alpha.txt,Beta.txt',
      names.join(','))
  }

  // 137. BOTH directions. "Dotfiles are excluded" alone passes against a
  // reader that returns nothing at all, which is why the include half is
  // asserted in the same check rather than trusted to imply itself.
  {
    const d = join(base, 'hidden')
    mkdirSync(d)
    writeFileSync(join(d, '.env'), 'x')
    writeFileSync(join(d, 'visible.txt'), 'x')
    const off = L.readDir(d, { showHidden: false })
    const on = L.readDir(d, { showHidden: true })
    const offNames = off.kind === 'ok' ? off.entries.map((e) => e.name) : []
    const onNames = on.kind === 'ok' ? on.entries.map((e) => e.name) : []
    ok('137 dotfiles are hidden by default AND shown when asked for',
      offNames.join(',') === 'visible.txt' &&
      onNames.join(',') === '.env,visible.txt',
      `off=[${offNames}] on=[${onNames}]`)
  }

  // 138. `unreadable` is its own arm, not an empty `ok`. An empty-looking
  // directory the user has no permission to read is the case that must NOT
  // render like an empty one.
  //
  // SKIPPED LOUDLY, never silently, when the process can read a mode-000
  // directory anyway — root can, and CI sometimes runs as root. A skip that
  // prints nothing is a check that stops existing the day that happens.
  {
    const d = join(base, 'denied')
    mkdirSync(d)
    writeFileSync(join(d, 'secret.txt'), 'x')
    chmodSync(d, 0o000)
    let readable = false
    try { require('node:fs').readdirSync(d); readable = true } catch { readable = false }
    if (readable) {
      console.log('SKIP  138 unreadable — this process can read a mode-000 directory (root?)')
    } else {
      const r = L.readDir(d, { showHidden: false })
      ok('138 a permission-denied directory answers `unreadable` with a detail',
        r.kind === 'unreadable' && typeof r.detail === 'string' && r.detail.length > 0,
        r.kind === 'unreadable' ? r.detail : r.kind)
    }
    chmodSync(d, 0o700)
  }

  // 139. Two arms, not one. "That is a file" and "it moved" are two situations
  // with two different fixes, and collapsing them tells a user whose directory
  // was deleted that they clicked a file.
  {
    const f = join(base, 'a file.txt')
    writeFileSync(f, 'x')
    const asFile = L.readDir(f, { showHidden: false })
    const missing = L.readDir(join(base, 'no such dir'), { showHidden: false })
    ok('139 not-a-directory and gone are two arms, not one',
      asFile.kind === 'not-a-directory' && missing.kind === 'gone',
      `${asFile.kind} / ${missing.kind}`)
  }

  // 140. The cap REPORTS its remainder rather than the list silently ending.
  // The fixture is deliberately over the cap so the capped list and the full
  // one cannot coincide — a fixture at or under it passes against no cap at
  // all.
  {
    const d = join(base, 'many')
    mkdirSync(d)
    const n = L.MAX_DIR_ENTRIES + 7
    for (let i = 0; i < n; i++) writeFileSync(join(d, `f${String(i).padStart(5, '0')}.txt`), 'x')
    const r = L.readDir(d, { showHidden: false })
    ok('140 the cap truncates and REPORTS the remainder',
      r.kind === 'ok' && r.entries.length === L.MAX_DIR_ENTRIES && r.truncated === 7,
      r.kind === 'ok' ? `${r.entries.length} + ${r.truncated}` : r.kind)
  }

  // 141. A symlink is its own kind and is NEVER followed. Resolving one would
  // mean a stat per entry and a cycle to defend against; reporting it costs
  // neither. The second clause is the one with teeth: the lister returns ONE
  // level, so the symlink's target's contents must not appear.
  {
    const d = join(base, 'links')
    mkdirSync(d)
    mkdirSync(join(d, 'real'))
    writeFileSync(join(d, 'real', 'inside.txt'), 'x')
    symlinkSync(join(d, 'real'), join(d, 'link'))
    const r = L.readDir(d, { showHidden: false })
    const names = r.kind === 'ok' ? r.entries.map((e) => e.name) : []
    const link = r.kind === 'ok' ? r.entries.find((e) => e.name === 'link') : undefined
    ok('141 a symlinked directory is its own kind and is not descended',
      link !== undefined && link.kind === 'symlink' && !names.includes('inside.txt'),
      `${link ? link.kind : 'absent'} names=[${names}]`)
  }

  rmSync(base, { recursive: true, force: true })
}
}


// ======================= M21: the toolbox panel on disk ==================

// 142 — a toolbox panel round-trips with its WHOLE source. The `cwd` is the
// field that carries the milestone: a source that came back without it is a
// node that can never ask its question again, which is check 105's argument
// for a review subject's sha reaching a fifth kind.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 't1', kind: 'toolbox', x: 1, y: 2, w: 560, h: 620, z: 3,
        source: { cwd: '/Users/me/repo', label: 'repo' }, title: 'auth toolbox' }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const p0 = out.snapshot.workspaces[0].panels[0]
  ok('142 a toolbox panel round-trips with its whole source',
    // No warning ABOUT THIS PANEL, rather than no warnings at all: this
    // fixture carries no camera, so parseLayout legitimately reports one.
    !out.warnings.some((w) => w.includes('t1')) && p0.kind === 'toolbox'
      && p0.source.cwd === '/Users/me/repo' && p0.source.label === 'repo'
      && p0.title === 'auth toolbox',
    JSON.stringify(p0))
}
// 143 — a toolbox panel whose source is malformed is dropped ALONE, the
// individual-drop rule parseLayout obeys everywhere else. The neighbour
// surviving is the half that proves "alone": a parser that threw, or that
// dropped the workspace, would satisfy "the bad one is gone" perfectly.
//
// The second clause is the label DEFAULT: a source with a usable cwd and no
// label is NOT dropped — it falls back to the cwd, because the label is a
// display convenience and the cwd is the fact, and dropping a whole node for a
// missing convenience is the over-correction this check exists to refuse.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 't1', kind: 'toolbox', x: 0, y: 0, w: 560, h: 620, z: 1, source: { label: 'no cwd' } },
      { id: 't2', kind: 'toolbox', x: 0, y: 0, w: 560, h: 620, z: 2, source: { cwd: '/r' } },
      { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 3, cwd: '~', args: [] }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  ok('143 a malformed toolbox source is dropped alone, and an absent label defaults to the cwd',
    panels.length === 2
      && panels[0].id === 't2' && panels[0].source.label === '/r'
      && panels[1].id === 'n1'
      && out.warnings.some((w) => w.includes('t1')),
    `${panels.map((p) => p.id).join(',')} warnings=${out.warnings.length}`)
}
// 144 is check 117's argument applied to a FIFTH kind: the same union has to
// survive layout-adapt's round trip, which is the OTHER door onto this format
// and the one a schema-only check cannot see. The fromPanels arm must write no
// cwd and no args keys AT ALL — `cwd: undefined` fails the terminal branch's
// own check on the next launch, losing the panel on every relaunch, silently.
//
// Note which `cwd` this is about: a toolbox panel HAS a cwd, inside `source`,
// and that is a different field with a different meaning from the terminal
// record's own top-level one. Writing the source's cwd to the top level would
// parse back as a TERMINAL panel and spawn a process.
{
  const panels = L.toPanels([
    { id: 't1', kind: 'toolbox', x: 1, y: 2, w: 560, h: 620, z: 3,
      source: { cwd: '/Users/me/repo', label: 'repo' }, title: 'tools' }
  ])
  const back = L.fromPanels(panels)
  ok('144 a toolbox panel survives toPanels/fromPanels with no top-level cwd key',
    panels[0].kind === 'toolbox' && panels[0].source.cwd === '/Users/me/repo'
      && back[0].kind === 'toolbox' && back[0].source.cwd === '/Users/me/repo'
      && back[0].source.label === 'repo' && back[0].title === 'tools'
      && !('cwd' in back[0]) && !('args' in back[0]),
    JSON.stringify(back[0]))
}

// ---------------------------------------------------------------------------
// M23 — the agent options a panel and a preset carry (ideas-backlog #8 part 1).
//
// These mirror the `agent` quartet at 125-128 exactly, because the failure
// shape is identical: an optional key rebuilt field-by-field at nine separate
// sites, every one of which can drop it silently with `tsc` saying nothing.
// The record is ONE key rather than three so there are nine such sites and not
// twenty-seven; these checks are what stop that key going missing at any of
// them.
// ---------------------------------------------------------------------------

// 145. The whole record survives fromPanels -> parseLayout. The ROUND TRIP is
//      the subject rather than the parse alone: layout-adapt.ts is the OTHER
//      door onto this format, and a schema-only check cannot see it — the
//      argument check 108b already makes for the panel union, and the exact
//      gap M17's fix round found when 123/124 covered Preset.agent and nothing
//      covered PanelSpec.agent.
{
  const [persisted] = L.fromPanels([{
    kind: 'terminal',
    rect: { id: 'p1', x: 0, y: 0, w: 720, h: 460 },
    spec: {
      panelId: 'p1', cwd: '~', args: [], command: 'claude', agent: 'claude-code',
      agentOptions: { permissionMode: 'plan', effort: 'high', model: 'opus' }
    },
    z: 1
  }])
  const { snapshot, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas', panels: [persisted],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }]
  }))
  const [back] = L.toPanels(active(snapshot).panels)
  const o = back && back.spec.agentOptions
  ok('145 a panel agentOptions record round-trips whole',
    o !== undefined && o.permissionMode === 'plan' && o.effort === 'high' &&
      o.model === 'opus' && warnings.length === 0,
    JSON.stringify({ persisted: persisted.agentOptions, back: o, warnings }))
}

// 146. An unknown permissionMode drops THAT FIELD — not the panel, and not the
//      sibling knob beside it. Dropping the field fails SAFE, which is the
//      whole reason mode is a closed union while `model` is not: the CLI's own
//      default is more restrictive than any value we failed to recognise, so a
//      drop can only ever tighten. The `effort` clause is what stops this
//      passing against an implementation that threw the record away wholesale.
{
  const { snapshot, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas',
      panels: [panel({
        command: 'claude',
        agentOptions: { permissionMode: 'yolo', effort: 'high' }
      })],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }]
  }))
  const w = active(snapshot)
  const o = w.panels[0] && w.panels[0].agentOptions
  ok('146 an unknown permissionMode drops that field alone, with a warning',
    w.panels.length === 1 && o !== undefined &&
      !('permissionMode' in o) && o.effort === 'high' &&
      warnings.some((x) => x.includes('permissionMode')),
    JSON.stringify({ panels: w.panels.length, opts: o, warnings }))
}

// 147. The SAME guard in parsePreset. Two parsers that agree on the day they
//      are written is exactly what this file's shape invites getting half
//      right — the copy-paste-one-of-two — and it is why parseAgentOptions is
//      one shared function rather than a block pasted into each.
{
  const { snapshot, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas', panels: [panel()],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }],
    presets: [{
      id: 'a', name: 'A', cwd: '~', args: [], command: 'claude',
      agentOptions: { permissionMode: 'plan', effort: 'nope' }
    }]
  }))
  const o = snapshot.presets[0] && snapshot.presets[0].agentOptions
  ok('147 parsePreset applies the same per-field guard',
    o !== undefined && o.permissionMode === 'plan' && !('effort' in o) &&
      warnings.some((x) => x.includes('effort')),
    JSON.stringify({ opts: o, warnings }))
}

// 148. The model guard — the only check here about a shared artifact being
//      HOSTILE rather than merely stale. There is no shell anywhere on this
//      path (args reach node-pty as an argv array, and tmux execs the
//      multi-argument new-session form directly rather than through `sh -c`),
//      so the surface is `claude`'s OWN parser: a value of
//      `--dangerously-skip-permissions` is read as a FLAG rather than as
//      --model's operand, and layout.json and presets are both shareable.
//      The leading-`-` rejection therefore earns its own distinct warning, so
//      an attempt is visible in a log rather than merged into "malformed".
{
  const preset = (model) => JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas', panels: [panel()],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }],
    presets: [{ id: 'a', name: 'A', cwd: '~', args: [], agentOptions: { model } }]
  })
  const modelOf = (r) => {
    const o = r.snapshot.presets[0] && r.snapshot.presets[0].agentOptions
    return o && o.model
  }
  const good = L.parseLayout(preset('claude-fable-5'))
  const flag = L.parseLayout(preset('--dangerously-skip-permissions'))
  const space = L.parseLayout(preset('a b'))
  const long = L.parseLayout(preset('x'.repeat(200)))
  ok('148 the model guard takes a real id and refuses a flag, a space and 200 chars',
    modelOf(good) === 'claude-fable-5' && good.warnings.length === 0 &&
      modelOf(flag) === undefined &&
      flag.warnings.some((w) => w.toLowerCase().includes('flag')) &&
      modelOf(space) === undefined &&
      modelOf(long) === undefined,
    JSON.stringify({
      good: modelOf(good), flagW: flag.warnings,
      space: modelOf(space), long: modelOf(long)
    }))
}

// 149. templateOf and presetFromCapture preserve ABSENCE, asserted with `in`
//      rather than with a truthiness or an undefined test — check 97's rule
//      for `command`, applied to the record beside it. `agentOptions:
//      undefined` is a DIFFERENT fact from the key being absent, and it is the
//      one that survives an IPC structured clone, where `'agentOptions' in
//      template` then reads true for a preset that never carried one.
{
  const bare = L.templateOf({ id: 'a', name: 'A', cwd: '~', args: [] })
  const withOpts = L.templateOf({
    id: 'b', name: 'B', cwd: '~', args: [], command: 'claude',
    agentOptions: { permissionMode: 'plan' }
  })
  const capBare = L.presetFromCapture([], { cwd: '/Users/x/proj', args: [], w: 720, h: 460 })
  const capOpts = L.presetFromCapture([], {
    cwd: '/Users/x/proj', args: [], w: 720, h: 460, command: 'claude',
    agentOptions: { effort: 'max' }
  })
  ok('149 templateOf and presetFromCapture keep an absent agentOptions absent',
    !('agentOptions' in bare) &&
      withOpts.agentOptions !== undefined &&
      withOpts.agentOptions.permissionMode === 'plan' &&
      !('agentOptions' in capBare) &&
      capOpts.agentOptions !== undefined && capOpts.agentOptions.effort === 'max',
    JSON.stringify({ bare, withOpts, capBare, capOpts }))
}

// 150. Codex controls share the one persisted envelope, but its safety
// options are independently validated before they can reach its CLI.
{
  const warnings = []
  const out = L.parsePresets([{
    id: 'codex-safe', name: 'Codex', cwd: '~', args: [], agent: 'codex',
    agentOptions: { sandbox: 'workspace-write', approvalPolicy: 'on-request', model: 'gpt-5.6' }
  }], warnings)
  const options = out[0] && out[0].agentOptions
  ok('150 Codex sandbox and approval options round-trip with the Codex agent',
    out[0].agent === 'codex' && options !== undefined &&
      options.sandbox === 'workspace-write' && options.approvalPolicy === 'on-request' &&
      options.model === 'gpt-5.6' && warnings.length === 0,
    JSON.stringify({ agent: out[0].agent, options, warnings }))
}

// M37 — a git worktree per panel. Scoped ids, per the convention.
//
// worktree.1. The flag on a PRESET: absent stays absent (asserted with `in`,
//      never a truthiness test — `worktree: undefined` survives IPC and reads
//      as present), `true` survives, a present `false` is normalised to absent
//      (a well-formed "no" is not worth a warning), and anything else drops the
//      FIELD with a warning naming the preset, never the preset.
{
  const warnings = []
  const out = L.parsePresets([
    { id: 'a', name: 'A', cwd: '~', args: [] },
    { id: 'b', name: 'B', cwd: '~', args: [], worktree: true },
    { id: 'c', name: 'C', cwd: '~', args: [], worktree: false },
    { id: 'd', name: 'D', cwd: '~', args: [], worktree: 'yes' }
  ], warnings)
  ok('worktree.1 a preset\'s worktree flag: absent, true, false-normalised, malformed-dropped',
    out.length === 4 && !('worktree' in out[0]) && out[1].worktree === true &&
      !('worktree' in out[2]) && !('worktree' in out[3]) &&
      warnings.some((w) => w.includes('d') && w.includes('worktree')),
    JSON.stringify({ out, warnings }))
}

// worktree.2. The SAME four cases through parsePanel, because two parsers for
//      one format agree on the day they are written and drift the first time
//      only one is edited — the gap M17's fix round found for `agent`.
{
  const { snapshot, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas',
      panels: [
        panel({ id: 'p1' }),
        panel({ id: 'p2', worktree: true }),
        panel({ id: 'p3', worktree: false }),
        panel({ id: 'p4', worktree: 1 })
      ],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }]
  }))
  const ps = active(snapshot).panels
  ok('worktree.2 a panel\'s worktree flag: absent, true, false-normalised, malformed-dropped',
    ps.length === 4 && !('worktree' in ps[0]) && ps[1].worktree === true &&
      !('worktree' in ps[2]) && !('worktree' in ps[3]) &&
      warnings.some((w) => w.includes('p4') && w.includes('worktree')),
    JSON.stringify({ ps, warnings }))
}

// worktree.3. The record list: absent on every file written before M37 and
//      read as [] with NO warning; a non-array warns and yields []; one
//      malformed entry (no branch) costs that entry and not its sibling.
{
  const w0 = []
  const absent = typeof L.parseWorktrees === 'function' ? L.parseWorktrees(undefined, w0) : null
  const w1 = []
  const notArray = typeof L.parseWorktrees === 'function' ? L.parseWorktrees({ a: 1 }, w1) : null
  const w2 = []
  const good = { id: 'wt1', root: '/r', path: '/ud/worktrees/r-abc/tc-n1-20260901-1200', branch: 'tc/n1-20260901-1200', createdAt: 1, panelId: 'n1' }
  const mixed = typeof L.parseWorktrees === 'function'
    ? L.parseWorktrees([good, { id: 'wt2', root: '/r', path: '/p', createdAt: 1, panelId: 'n2' }], w2)
    : null
  ok('worktree.3 parseWorktrees: absent is [] silently, a non-array warns, one bad entry costs one entry',
    Array.isArray(absent) && absent.length === 0 && w0.length === 0 &&
      Array.isArray(notArray) && notArray.length === 0 && w1.length === 1 &&
      Array.isArray(mixed) && mixed.length === 1 && mixed[0].id === 'wt1' && mixed[0].panelId === 'n1' &&
      w2.length === 1,
    JSON.stringify({ absent, w0, notArray, w1, mixed, w2 }))
}

// worktree.4. Round trip: a snapshot carrying all three (a worktree preset, a
//      worktree panel, one record) survives serialise + parseLayout intact.
{
  const rec = { id: 'wt1', root: '/r', path: '/ud/worktrees/r-abc/tc-n1-20260901-1200', branch: 'tc/n1-20260901-1200', createdAt: 5, panelId: 'p1' }
  const first = L.parseLayout(JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas', panels: [panel({ worktree: true })],
      camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null
    }],
    presets: [{ id: 'u1', name: 'U', cwd: '~', args: [], worktree: true }],
    worktrees: [rec]
  }))
  const again = L.parseLayout(JSON.stringify(first.snapshot))
  const s2 = again.snapshot
  ok('worktree.4 a worktree preset, panel and record round-trip through the file',
    active(s2).panels[0].worktree === true && s2.presets[0].worktree === true &&
      Array.isArray(s2.worktrees) && s2.worktrees.length === 1 &&
      JSON.stringify(s2.worktrees[0]) === JSON.stringify(rec) && again.warnings.length === 0,
    JSON.stringify({ panel: active(s2).panels[0], preset: s2.presets[0], worktrees: s2.worktrees, warnings: again.warnings }))
}

// worktree.5. The store: add, find BY PANEL AND ROOT (a recycled id in a
//      different repository must never be spawned into a stranger's branch),
//      drop — and every write schedules a save.
{
  const clock = fakeClock()
  const store = L.createLayoutStore({ filePath: tmp(), schedule: clock.schedule })
  store.load()
  const rec = { id: 'wt1', root: '/r', path: '/p', branch: 'tc/n1-20260901-1200', createdAt: 1, panelId: 'n1' }
  const has = typeof store.addWorktree === 'function'
  if (has) store.addWorktree(rec)
  const found = has ? store.worktreeForPanel('n1', '/r') : undefined
  const other = has ? store.worktreeForPanel('n1', '/elsewhere') : 'unset'
  const listed = has ? store.worktrees() : []
  if (has) store.dropWorktree('wt1')
  const after = has ? store.worktrees() : ['unset']
  ok('worktree.5 the store adds, finds by panel AND root, lists, drops, and schedules a write each time',
    has && found !== undefined && found.id === 'wt1' && other === undefined &&
      listed.length === 1 && after.length === 0 && clock.scheduled() >= 1,
    JSON.stringify({ has, found, other, listed: listed.length, after: after.length, scheduled: has ? clock.scheduled() : null }))
}

// worktree.6. setPresetWorktree: a user preset takes the flag and drops it
//      again to ABSENT (never `false` on disk); a built-in id returns false and
//      writes nothing, because built-ins are code and never on disk.
{
  const clock = fakeClock()
  const store = L.createLayoutStore({ filePath: tmp(), schedule: clock.schedule })
  store.load()
  store.addPreset({ id: 'u1', name: 'U', cwd: '~', args: [] })
  const has = typeof store.setPresetWorktree === 'function'
  const on = has ? store.setPresetWorktree('u1', true) : null
  const flagged = store.presets().find((p) => p.id === 'u1')
  const off = has ? store.setPresetWorktree('u1', false) : null
  const cleared = store.presets().find((p) => p.id === 'u1')
  const scheduledBefore = clock.scheduled()
  const builtIn = has ? store.setPresetWorktree('claude', true) : null
  ok('worktree.6 setPresetWorktree flags a user preset, clears to absent, and refuses a built-in',
    on === true && flagged && flagged.worktree === true && off === true && cleared && !('worktree' in cleared) &&
      builtIn === false && clock.scheduled() === scheduledBefore,
    JSON.stringify({ on, flagged, off, cleared, builtIn }))
}

// worktree.7. The two main-side copy sites: templateOf (preset -> the
//      template Cmd+N receives) and presetFromCapture (a captured panel -> a
//      preset). Each carries `true` and keeps absence ABSENT, tested with
//      `in` — a spread here would write `worktree: undefined`, which survives
//      IPC and reads as present.
{
  const t1 = L.templateOf({ cwd: '~', args: [] })
  const t2 = L.templateOf({ cwd: '~', args: [], worktree: true })
  const c1 = L.presetFromCapture([], { cwd: '/x', args: [], w: 720, h: 460 })
  const c2 = L.presetFromCapture([], { cwd: '/x', args: [], w: 720, h: 460, worktree: true })
  ok('worktree.7 templateOf and presetFromCapture carry the flag and keep absence absent',
    !('worktree' in t1) && t2.worktree === true && !('worktree' in c1) && c2.worktree === true,
    JSON.stringify({ t1, t2, c1, c2 }))
}

// worktree.8. The renderer-side copy sites, both directions: a persisted panel
//      with the flag becomes a Panel whose spec carries it, and back.
{
  const persisted = [
    { ...panel({ id: 'p1' }) },
    { ...panel({ id: 'p2' }), worktree: true }
  ]
  const panels = L.toPanels(persisted)
  const back = L.fromPanels(panels)
  ok('worktree.8 toPanels/fromPanels carry the flag both ways and keep absence absent',
    panels.length === 2 && !('worktree' in panels[0].spec) && panels[1].spec.worktree === true &&
      !('worktree' in back[0]) && back[1].worktree === true,
    JSON.stringify({ specs: panels.map((p) => p.spec), back }))
}

// worktree.9. presetRows carries the flag to the palette's PresetListRow, so
//      the toggle row can name its current state; absent stays absent.
{
  const rows = L.presetRows([
    { preset: { id: 'a', name: 'A', cwd: '~', args: [] }, available: true },
    { preset: { id: 'b', name: 'B', cwd: '~', args: [], worktree: true }, available: true }
  ], 'a')
  ok('worktree.9 presetRows carries the worktree flag to the palette row',
    rows.length === 2 && !('worktree' in rows[0]) && rows[1].worktree === true,
    JSON.stringify(rows))
}

// worktree.10. A built-in preset that spawns claude in a fresh worktree, so
//      the feature has a door without a preset editor. Built-ins are code, so
//      allPresets([]) is where it must appear.
{
  const found = L.allPresets([]).find((p) => p.id === 'claude-worktree')
  ok('worktree.10 the claude-worktree built-in exists, runs claude, and asks for a worktree',
    found !== undefined && found.command === 'claude' && found.agent === 'claude-code' && found.worktree === true,
    JSON.stringify(found))
}

// M38 — keep-on-quit.1. The setting exists in the one schema, is a boolean,
//      and ships OFF: a person who quits an app expects its processes to stop,
//      and the author who wants the opposite is one palette row away. The
//      category is the exported constant so the menu and the palette cannot
//      drift on a typo.
{
  const def = L.settingDef('session.keepOnQuit')
  ok('keep-on-quit.1 session.keepOnQuit is a boolean setting, off by default, in the Sessions category',
    def !== undefined && def.type === 'boolean' && def.default === false &&
      typeof L.SESSION_CATEGORY === 'string' && def.category === L.SESSION_CATEGORY &&
      L.resolveSetting({}, 'session.keepOnQuit') === false && /tmux/i.test(def.description),
    JSON.stringify(def))
}

// M39 — scrollback.1. The persistence switch: a boolean in the Sessions
//      category, ON by default (a restored panel that shows nothing is the
//      failure the whole milestone exists for), whose description names the
//      cap and the reason to turn it off — agents print secrets.
{
  const def = L.settingDef('scrollback.persist')
  ok('scrollback.1 scrollback.persist is a boolean setting, on by default, naming the cap and the secrets caveat',
    def !== undefined && def.type === 'boolean' && def.default === true && def.category === L.SESSION_CATEGORY &&
      /MB/.test(def.description) && /secret/i.test(def.description),
    JSON.stringify(def))
}

// M43 — attention.1. The two "reach me outside the window" settings, in the
//      Agent state category. notify defaults ON (an OS notification for a
//      panel that wants you while the window is behind another is the whole
//      point); sound defaults OFF (a beep on every turn is a lot, and it is
//      one row away). Both booleans, both resolving to their default off an
//      empty prefs object.
{
  const notify = L.settingDef('attention.notify')
  const sound = L.settingDef('attention.sound')
  ok('attention.1 attention.notify (on) and attention.sound (off) are booleans in the Agent state category',
    notify !== undefined && notify.type === 'boolean' && notify.default === true && notify.category === L.AGENT_CATEGORY &&
      sound !== undefined && sound.type === 'boolean' && sound.default === false && sound.category === L.AGENT_CATEGORY &&
      L.resolveSetting({}, 'attention.notify') === true && L.resolveSetting({}, 'attention.sound') === false,
    JSON.stringify({ notify, sound }))
}

// M44 — keyboard.1. The screen-reader setting: a boolean, OFF by default
//      (xterm's screen-reader mode maintains a live DOM mirror of the buffer,
//      expensive precisely because everything else here avoids DOM text under
//      WebGL), in its own Accessibility category so the menu and palette
//      cannot drift on a typo.
{
  const def = L.settingDef('accessibility.screenReaderMode')
  ok('keyboard.1 accessibility.screenReaderMode is a boolean, off by default, in the Accessibility category',
    def !== undefined && def.type === 'boolean' && def.default === false &&
      typeof L.ACCESSIBILITY_CATEGORY === 'string' && def.category === L.ACCESSIBILITY_CATEGORY &&
      L.resolveSetting({}, 'accessibility.screenReaderMode') === false,
    JSON.stringify(def))
}

// M45 — theme.1. The schema's first ENUM: `appearance.theme` is one of
//      system | light | dark, default `system`, and parsePreferences REJECTS
//      a value outside the set exactly as it rejects an out-of-range number —
//      dropped with a warning, never coerced. The M23-era 'enum' member was
//      removed as a customer-free abstraction; this is its customer. A
//      stray value that survived here would reach useTheme, which would stamp
//      `data-theme="blue"`, matching no block, and the app would render bare
//      :root's light values while the row said "blue".
{
  const def = L.settingDef('appearance.theme')
  const w = []
  const good = L.parsePreferences({ 'appearance.theme': 'dark' }, w)
  const bad = L.parsePreferences({ 'appearance.theme': 'blue' }, w)
  const wrongType = L.parsePreferences({ 'appearance.theme': true }, w)
  ok('theme.1 appearance.theme is an enum of system|light|dark, default system, and a stray value is dropped with a warning',
    def !== undefined && def.type === 'enum' &&
      JSON.stringify(def.values) === JSON.stringify(['system', 'light', 'dark']) &&
      def.default === 'system' && L.resolveSetting({}, 'appearance.theme') === 'system' &&
      good['appearance.theme'] === 'dark' &&
      bad['appearance.theme'] === undefined && wrongType['appearance.theme'] === undefined &&
      w.length === 2 && w.every((m) => /appearance\.theme/.test(m)),
    JSON.stringify({ def, good, bad, wrongType, w }))
}

// M46 — shell.1. The dock's navigator and the context pane's tab are enum
//      settings — through M45's 'enum', so a stray value is dropped with a
//      warning on both doors — in the Shell category beside the two booleans
//      that already live there. `files.treeOpen` stays a boolean: the Files
//      pane is the tree's own toggle, so the palette row it already mints
//      keeps meaning what it says.
{
  const nav = L.settingDef('shell.navigator')
  const tab = L.settingDef('shell.contextTab')
  const w = []
  const stray = L.parsePreferences({ 'shell.navigator': 'minimap', 'shell.contextTab': 'work' }, w)
  // M85 added `vault` as the navigator's fourth pane; the check follows the
  // schema rather than pinning a list the app has outgrown.
  // M116 added `board` as the seventh; M127 `skills` as the eighth.
  // M279 added `activity` as the context pane's fourth tab.
  ok('shell.1 shell.navigator (panels|workspaces|vault|integrations|teammates|board|skills, default panels) and shell.contextTab (detail|work|tools|activity, default detail) are enums in the Shell category',
    nav !== undefined && nav.type === 'enum' && JSON.stringify(nav.values) === JSON.stringify(['panels', 'workspaces', 'vault', 'integrations', 'teammates', 'board', 'skills']) &&
      nav.default === 'panels' && nav.category === L.SHELL_CATEGORY &&
      tab !== undefined && tab.type === 'enum' && JSON.stringify(tab.values) === JSON.stringify(['detail', 'work', 'tools', 'activity']) &&
      tab.default === 'detail' && tab.category === L.SHELL_CATEGORY &&
      stray['shell.navigator'] === undefined && stray['shell.contextTab'] === 'work' && w.length === 1,
    JSON.stringify({ nav, tab, stray, w }))
}

// M85 — text.1. `vault.root` is the app's first TEXT setting. Absent is the
//      default (''), a string is kept as typed, and a PRESENT non-string is
//      dropped by name rather than coerced — the first text setting was
//      refused at both doors because each compared typeof against the type's
//      NAME, and nothing said so until a real-Electron check did.
{
  const def = L.settingDef('vault.root')
  const w = []
  const kept = L.parsePreferences({ 'vault.root': '/Users/me/notes' }, w)
  const w2 = []
  const bad = L.parsePreferences({ 'vault.root': 42 }, w2)
  const w3 = []
  const absent = L.parsePreferences({}, w3)
  ok('text.1 vault.root is a text setting in the Files category: a string is kept, a number is dropped by name, and absence warns nothing',
    def !== undefined && def.type === 'text' && def.default === '' && def.category === L.FILES_CATEGORY &&
      kept['vault.root'] === '/Users/me/notes' && w.length === 0 &&
      bad['vault.root'] === undefined && w2.length === 1 && /vault\.root/.test(w2[0]) &&
      absent['vault.root'] === undefined && w3.length === 0,
    JSON.stringify({ def, kept, w, bad, w2, absent, w3 }))
}

// M86 — across.1. A review node's `across` flag round-trips as a literal
//      `true`, stays ABSENT on a node that never had it (every pre-M86 file —
//      a spread that wrote `across: undefined` would read as present at every
//      `'across' in subject` site), and a present non-`true` value drops the
//      FLAG by name and keeps the node: a review that lost its flag is an
//      ordinary review of the same subject, a smaller wrong than a node gone.
{
  const subject = { subjectId: 'n1', repoRoot: '/r', baselineSha: 'abc', label: 'agent' }
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'r1', kind: 'review', x: 0, y: 0, w: 480, h: 320, z: 1, subject: { ...subject, across: true } },
      { id: 'r2', kind: 'review', x: 0, y: 0, w: 480, h: 320, z: 2, subject },
      { id: 'r3', kind: 'review', x: 0, y: 0, w: 480, h: 320, z: 3, subject: { ...subject, across: 'yes' } }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  ok('across.1 a review subject\'s across flag round-trips as true, stays absent on a node without it, and a malformed value drops the flag by name while keeping the node',
    panels.length === 3 &&
      panels[0].subject.across === true &&
      !('across' in panels[1].subject) &&
      !('across' in panels[2].subject) && out.warnings.some((w) => /r3/.test(w) && /across/.test(w)),
    JSON.stringify({ subjects: panels.map((p) => p.subject), warnings: out.warnings }))
}

// M201 (D07) — review.task.1. THE TASK A REVIEW BELONGS TO. Provenance only:
//      it grants nothing and changes no query, so an unusable value costs the
//      FIELD and never the node — a review that lost the name of its task
//      still reviews the right diff, because `repoRoot` and `across` are what
//      decide that. Absence is how a review opened by any other door says it
//      has no task; an empty string would read as a task whose id is blank.
{
  const subject = { subjectId: 'n1', repoRoot: '/r', baselineSha: 'abc', label: 'agent' }
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'r1', kind: 'review', x: 0, y: 0, w: 480, h: 320, z: 1, subject: { ...subject, across: true, workItemId: 'wk7' } },
      { id: 'r2', kind: 'review', x: 0, y: 0, w: 480, h: 320, z: 2, subject },
      { id: 'r3', kind: 'review', x: 0, y: 0, w: 480, h: 320, z: 3, subject: { ...subject, workItemId: 42 } },
      { id: 'r4', kind: 'review', x: 0, y: 0, w: 480, h: 320, z: 4, subject: { ...subject, across: 'yes', workItemId: 'wk9' } }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  ok('review.task.1 a review subject carries its work item id when present, keeps it ABSENT on every node opened outside a task, drops an unusable id by name while keeping the node, and keeps the id even when the across flag beside it is dropped',
    panels.length === 4 &&
      panels[0].subject.workItemId === 'wk7' && panels[0].subject.across === true &&
      !('workItemId' in panels[1].subject) &&
      !('workItemId' in panels[2].subject) && out.warnings.some((w) => /r3/.test(w) && /work item id/.test(w)) &&
      // The two fields are independent: a malformed `across` returns early,
      // and that early return must still carry the task.
      panels[3].subject.workItemId === 'wk9' && !('across' in panels[3].subject),
    JSON.stringify({ subjects: panels.map((p) => p.subject), warnings: out.warnings }))
}

// M48 — firstrun.1. `hints.seen` is a LIST setting — the second customer of
//      a non-boolean type after M45's enum: a string list, default empty,
//      persisted as the user's gestures are first seen, and a non-list (or a
//      list holding a non-string) is dropped with a warning on the load door
//      exactly as a stray enum value is. It is not a user-facing toggle, so
//      the palette mints no row for it.
{
  const def = L.settingDef('hints.seen')
  const w = []
  const good = L.parsePreferences({ 'hints.seen': ['pan', 'zoom'] }, w)
  const bad = L.parsePreferences({ 'hints.seen': 'pan' }, w)
  const mixed = L.parsePreferences({ 'hints.seen': ['pan', 3] }, w)
  ok('firstrun.1 hints.seen is a string-list setting, default empty, and a non-list is dropped with a warning',
    def !== undefined && def.type === 'list' && JSON.stringify(def.default) === '[]' &&
      JSON.stringify(L.resolveSetting({}, 'hints.seen')) === '[]' &&
      JSON.stringify(good['hints.seen']) === JSON.stringify(['pan', 'zoom']) &&
      bad['hints.seen'] === undefined && mixed['hints.seen'] === undefined && w.length === 2,
    JSON.stringify({ def, good, bad, mixed, w }))
}

// M49 — type.1. terminal.fontSize is a bounded number setting (9–24, default
//      13, in the Terminal category), and a terminal panel's `fontSize` is an
//      OPTIONAL persisted field exactly as `title` is: absent stays absent,
//      present-but-out-of-range is dropped with a warning and the panel
//      survives without it (a per-entry failure costs the field, never the
//      panel).
{
  const def = L.settingDef('terminal.fontSize')
  const w = []
  const parsed = L.parseLayout(file({ workspaces: [{
    id: 'w1', name: 'Canvas', camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
    panels: [
      { id: 'a', x: 0, y: 0, w: 100, h: 100, z: 1, cwd: '~', args: [], fontSize: 16 },
      { id: 'b', x: 0, y: 0, w: 100, h: 100, z: 1, cwd: '~', args: [] },
      { id: 'c', x: 0, y: 0, w: 100, h: 100, z: 1, cwd: '~', args: [], fontSize: 99 }
    ]
  }] }))
  const all = parsed.snapshot.workspaces.flatMap((ws) => ws.panels)
  const a = all.find((p) => p.id === 'a')
  const b = all.find((p) => p.id === 'b')
  const c = all.find((p) => p.id === 'c')
  ok('type.1 terminal.fontSize is bounded 9–24 default 13, and a panel fontSize override parses, keeps absence absent, and is dropped with a warning out of range',
    def !== undefined && def.type === 'number' && def.default === 13 && def.min === 9 && def.max === 24 && typeof L.TERMINAL_CATEGORY === 'string' && def.category === L.TERMINAL_CATEGORY &&
      a !== undefined && a.fontSize === 16 && b !== undefined && !('fontSize' in b) &&
      c !== undefined && !('fontSize' in c) && parsed.warnings.some((m) => /fontSize/.test(m)),
    JSON.stringify({ def, a, b, c, warnings: parsed.warnings, w }))
}

// M50 — placement.1. Snapping is a setting, on by default: a user aligning
//      by eye against a snap is fighting the app.
{
  const def = L.settingDef('placement.snap')
  ok('placement.1 placement.snap is a boolean, on by default, in the Shell category',
    def !== undefined && def.type === 'boolean' && def.default === true && def.category === L.SHELL_CATEGORY &&
      L.resolveSetting({}, 'placement.snap') === true,
    JSON.stringify(def))
}

console.log('\n' + '='.repeat(60))
// M56 — bookmark.1. `bookmarks` on a workspace: ABSENT on every file written
//      before M56 and must warn nothing; a malformed entry costs that entry
//      with a warning, never the list; a good one round-trips with its
//      camera parsed by the same rule the workspace camera uses (a zero
//      scale is unusable, not cosmetic).
{
  const absent = L.parseLayout(file())
  const ws = active(absent.snapshot)
  const mixed = L.parseLayout(file({ workspaces: [{
    id: 'w1', name: 'Canvas', panels: [panel()], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
    bookmarks: [
      { id: 'b1', name: 'Inbox', camera: { x: -100, y: -50, scale: 0.5 } },
      { id: 'b2', name: 'Broken', camera: { x: 0, y: 0, scale: 0 } },
      { id: 7, name: 'NotAnId', camera: { x: 0, y: 0, scale: 1 } },
      'junk'
    ]
  }] }))
  const mws = active(mixed.snapshot)
  const kept = mws.bookmarks
  ok('bookmark.1 absent bookmarks parse as [] silently; malformed entries are dropped with a warning and the good one round-trips',
    Array.isArray(ws.bookmarks) && ws.bookmarks.length === 0 && absent.warnings.length === 0 &&
      Array.isArray(kept) && kept.length === 1 && kept[0].id === 'b1' && kept[0].name === 'Inbox' && kept[0].camera.scale === 0.5 &&
      mixed.warnings.some((w) => /bookmark/i.test(w)),
    JSON.stringify({ absent: ws.bookmarks, absentWarnings: absent.warnings, kept, warnings: mixed.warnings }))
}

// M65 — recent.1. RECENT DIRECTORIES: main records every spawn's cwd, the
//     spawn sheet offers them. Absent is every file written before M65 and
//     must warn nothing; a non-array warns and is dropped; a non-string entry
//     costs that entry; the list is deduplicated, most recent first, capped at
//     twelve — a spawn sheet with a scrolling list of forty temp directories
//     is the failure the cap exists for.
{
  const parse = typeof L.parseRecentDirectories === 'function' ? L.parseRecentDirectories : () => undefined
  const w1 = [], w2 = [], w3 = []
  const absent = parse(undefined, w1)
  const bad = parse('nope', w2)
  const mixed = parse(['/a', 42, '/b', '/a', '', '/c', '/d', '/e', '/f', '/g', '/h', '/i', '/j', '/k', '/l', '/m'], w3)
  ok('recent.1 absent recent directories parse as [] silently; malformed entries are dropped with a warning; deduplicated and capped at twelve',
    Array.isArray(absent) && absent.length === 0 && w1.length === 0 &&
      Array.isArray(bad) && bad.length === 0 && w2.length === 1 &&
      Array.isArray(mixed) && mixed.length === 12 && mixed[0] === '/a' && mixed[1] === '/b' && !mixed.includes('') && w3.length >= 2,
    JSON.stringify({ absent, w1, bad, w2, mixed, w3 }))
  const store = L.createLayoutStore ? L.createLayoutStore({ filePath: require('node:path').join(require('node:os').tmpdir(), `tc-recent-${Date.now()}.json`) }) : null
  if (store && typeof store.addRecentDirectory === 'function') {
    store.load()
    for (const d of ['/one', '/two', '/one', '/three']) store.addRecentDirectory(d)
    const list = store.recentDirectories()
    ok('recent.2 addRecentDirectory puts the newest first and keeps one copy of a repeat', JSON.stringify(list) === JSON.stringify(['/three', '/one', '/two']), JSON.stringify(list))
    // M262 — recent.3. The times ride BESIDE the list: a re-add re-stamps, and
    // only directories still on the list answer (one past the cap has no row).
    store.addRecentDirectory('/one', 5000)
    const used = typeof store.recentDirectoryUsed === 'function' ? store.recentDirectoryUsed() : null
    ok('recent.3 recentDirectoryUsed stamps each add and answers only for directories still on the list',
      used !== null && used['/one'] === 5000 && typeof used['/three'] === 'number' && Object.keys(used).every((d) => store.recentDirectories().includes(d)), JSON.stringify(used))
  } else {
    ok('recent.2 addRecentDirectory puts the newest first and keeps one copy of a repeat', false, 'store has no addRecentDirectory')
  }
}

// M65 — spawn.1. THE RESOLVER main and the harness both run. An absent
//     command stays absent; a typed command is `/bin/sh -lc` titled with
//     itself; agent options merge only onto an agent preset; a FILE is
//     refused like a missing path (existsSync passed it and the panel died
//     at spawn); the reason names the typed path.
{
  const resolve = typeof L.resolveSpawnRequest === 'function' ? L.resolveSpawnRequest : () => null
  const presets = [{ id: 'shell', name: 'Login shell', cwd: '~', args: [] }, { id: 'claude', name: 'Claude', cwd: '~', command: 'claude', args: [], agent: 'claude-code', agentOptions: { effort: 'high' } }]
  const fs = { expand: (p) => p.replace(/^~/, '/home/me'), isDirectory: (p) => p === '/home/me' || p === '/work' }
  const a = resolve({ presetId: 'shell', cwd: '~' }, presets, fs)
  const b = resolve({ presetId: 'claude', cwd: '/work', agentOptions: { permissionMode: 'plan' }, title: 'api' }, presets, fs)
  const c = resolve({ command: 'npm test', cwd: '/work' }, presets, fs)
  const d = resolve({ presetId: 'shell', cwd: '/work/file.txt' }, presets, fs)
  const e = resolve({ presetId: 'gone', cwd: '/work' }, presets, fs)
  ok('spawn.1 resolveSpawnRequest keeps an absent command absent, merges agent options onto an agent preset only, wraps a typed command as a titled task, and refuses a file or a missing preset with a reason',
    a && a.kind === 'spawned' && !('command' in a.template) && a.template.cwd === '/home/me' && a.template.focus === true &&
      b && b.kind === 'spawned' && b.template.agentOptions && b.template.agentOptions.permissionMode === 'plan' && b.template.agentOptions.effort === 'high' && b.template.title === 'api' &&
      c && c.kind === 'spawned' && c.template.command === '/bin/sh' && c.template.args[0] === '-lc' && c.template.args[1] === 'npm test' && c.template.title === 'npm test' &&
      d && d.kind === 'refused' && /file\.txt/.test(d.reason) && e && e.kind === 'refused',
    JSON.stringify({ a, b, c, d, e }))
}

// ======================= M73: the chat panel on disk ====================
// chat.1 — a chat panel round-trips with its WHOLE `chat` record: the
// directory, the CLI session id the renderer minted, and the agent knobs —
// and an ABSENT agentOptions stays absent (a spread that wrote
// `agentOptions: undefined` reads as present after IPC, the trap every copy
// site in this repo already names).
{
  const out = L.parseLayout(JSON.stringify({
    version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [
      { id: 'c1', kind: 'chat', x: 1, y: 2, w: 560, h: 620, z: 3, title: 'api chat',
        chat: { cwd: '/Users/me/repo', sessionId: '11111111-1111-4111-8111-111111111111', agentOptions: { model: 'opus', effort: 'high' } } },
      { id: 'c2', kind: 'chat', x: 1, y: 2, w: 560, h: 620, z: 4, chat: { cwd: '~', sessionId: 'u-2' } }
    ] }]
  }))
  // Guarded reads: a parser that drops both panels (the red state) must
  // print this check RED rather than throw and take every check below it.
  const ws = out.snapshot.workspaces[0]
  const p0 = (ws && ws.panels[0]) || {}
  const p1 = (ws && ws.panels[1]) || {}
  ok('chat.1 a chat panel round-trips with its whole chat record, and an absent agentOptions stays absent',
    ws !== undefined && ws.panels.length === 2 && !out.warnings.some((w) => /c1|c2/.test(w)) &&
      p0.kind === 'chat' && p0.chat && p0.chat.cwd === '/Users/me/repo' && p0.chat.sessionId === '11111111-1111-4111-8111-111111111111' &&
      p0.chat.agentOptions && p0.chat.agentOptions.model === 'opus' && p0.chat.agentOptions.effort === 'high' && p0.title === 'api chat' &&
      !('cwd' in p0) && !('args' in p0) &&
      p1.kind === 'chat' && p1.chat && p1.chat.cwd === '~' && !('agentOptions' in p1.chat),
    JSON.stringify({ warnings: out.warnings, p0, p1 }))
}

// chat.2 — a malformed chat record drops that panel ALONE (parseLayout's
// individual-drop rule, reached by a sixth kind), a sibling survives, and an
// unknown agent knob costs the FIELD, never the panel (parseAgentOptions is
// reused, not re-implemented — two parsers for one shape drift).
{
  const out = L.parseLayout(JSON.stringify({
    version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [
      { id: 'c1', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 1, chat: { cwd: '/r' } },
      { id: 'c2', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 2, chat: { cwd: 7, sessionId: 'u' } },
      { id: 'c3', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 3 },
      { id: 'c4', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 4, chat: { cwd: '/r', sessionId: 'u-4', agentOptions: { permissionMode: 'yolo', model: 'opus' } } }
    ] }]
  }))
  const ws = out.snapshot.workspaces[0]
  const ids = ws ? ws.panels.map((p) => p.id) : []
  const c4 = ws && ws.panels.find((p) => p.id === 'c4')
  ok('chat.2 a chat record missing its session id, with a non-string cwd, or absent entirely drops that panel alone; an unknown knob drops only the knob',
    ids.join(',') === 'c4' && out.warnings.filter((w) => /c1|c2|c3/.test(w)).length === 3 &&
      c4 !== undefined && c4.chat && c4.chat.agentOptions !== undefined && !('permissionMode' in c4.chat.agentOptions) &&
      c4.chat.agentOptions.model === 'opus',
    JSON.stringify({ ids, warnings: out.warnings }))
}

// chat.3 — toPanels/fromPanels carry the record both ways with no top-level
// cwd/args keys (a chat panel HAS a cwd, inside `chat`, and a top-level one
// would make it look like a terminal to any reader that keys on that field),
// and hand back a record that is not the same reference.
{
  const toPanels = typeof L.toPanels === 'function' ? L.toPanels : () => []
  const fromPanels = typeof L.fromPanels === 'function' ? L.fromPanels : () => []
  const persisted = [{ id: 'c1', kind: 'chat', x: 1, y: 2, w: 560, h: 620, z: 3, title: 'chat', chat: { cwd: '/Users/me/repo', sessionId: 'u-1' } }]
  // Try/catch so the red state (an adapter with no chat arm reading a
  // terminal's absent `args`) prints RED here rather than aborting the suite.
  let panels = [], back = []
  try { panels = toPanels(persisted); back = fromPanels(panels) } catch (error) { panels = []; back = [] }
  const p = panels[0] || {}
  const b = back[0] || {}
  ok('chat.3 a chat panel survives toPanels/fromPanels with its record, no top-level cwd or args, and no shared reference',
    panels.length === 1 && p.kind === 'chat' && p.chat && p.chat.cwd === '/Users/me/repo' && p.chat.sessionId === 'u-1' &&
      p.chat !== persisted[0].chat && !('agentOptions' in p.chat) &&
      back.length === 1 && b.kind === 'chat' && b.chat && b.chat.cwd === '/Users/me/repo' && b.chat.sessionId === 'u-1' &&
      b.title === 'chat' && !('cwd' in b) && !('args' in b) && b.chat !== p.chat,
    JSON.stringify({ panels, back }))
}

// ======================= M84: the watcher on disk ========================
// watch.1 — a watcher panel round-trips with its WHOLE record: the command,
// its args, the cwd its runs happen in and the TRIGGER. The trigger is the
// field that carries the milestone: a watcher restored without one is a node
// that will never run again, and it looks identical to one whose trigger has
// simply not fired yet — the same argument check 105 makes for a review
// subject's sha and 142 makes for a toolbox source's cwd.
//
// The second half is the individual-drop rule: an unusable trigger kind, a
// timer below the floor, a missing command — each drops ITS OWN panel by name
// while the neighbours survive. A watcher whose trigger kind is from a LATER
// version of this app must drop rather than be coerced into a timer, because
// a coerced watcher runs a real command on a schedule nobody asked for.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'wa', kind: 'watcher', x: 1, y: 2, w: 520, h: 360, z: 3, title: 'tests',
        watch: { cwd: '/Users/me/repo', command: 'npm', args: ['test'], trigger: { kind: 'path', path: '/Users/me/repo/src' } } }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const p0 = out.snapshot.workspaces[0].panels[0]
  const back = L.fromPanels ? null : null
  ok('watch.1 a watcher panel round-trips with its command, args, cwd and trigger',
    !out.warnings.some((w) => w.includes('wa')) && p0.kind === 'watcher' &&
      p0.watch.cwd === '/Users/me/repo' && p0.watch.command === 'npm' &&
      Array.isArray(p0.watch.args) && p0.watch.args[0] === 'test' &&
      p0.watch.trigger.kind === 'path' && p0.watch.trigger.path === '/Users/me/repo/src' &&
      p0.title === 'tests' && !('cwd' in p0) && !('args' in p0),
    JSON.stringify({ p0, back }))
}
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'bad-kind', kind: 'watcher', x: 0, y: 0, w: 520, h: 360, z: 1,
        watch: { cwd: '/r', command: 'npm', args: [], trigger: { kind: 'moon-phase' } } },
      { id: 'bad-timer', kind: 'watcher', x: 0, y: 0, w: 520, h: 360, z: 2,
        watch: { cwd: '/r', command: 'npm', args: [], trigger: { kind: 'timer', everyMs: 5 } } },
      { id: 'no-command', kind: 'watcher', x: 0, y: 0, w: 520, h: 360, z: 3,
        watch: { cwd: '/r', args: [], trigger: { kind: 'git-ref', root: '/r' } } },
      { id: 'good', kind: 'watcher', x: 0, y: 0, w: 520, h: 360, z: 4,
        watch: { cwd: '/r', command: 'make', armed: false, trigger: { kind: 'panel', sourceId: 'n1', on: 'exit-ok' } } },
      { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 5, cwd: '~', args: [] }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  const named = (id) => out.warnings.some((w) => w.includes(id))
  ok('watch.2 an unusable trigger kind, a timer below the floor and a missing command each drop their own watcher by name; absent args default to none, and the neighbours survive',
    panels.length === 2 && panels[0].id === 'good' && panels[1].id === 'n1' &&
      Array.isArray(panels[0].watch.args) && panels[0].watch.args.length === 0 &&
      // `armed: false` is carried; ABSENT stays absent on the watcher that
      // never said it — the field's absence already means armed, and writing
      // it back would make every file differ from the one before it.
      panels[0].watch.armed === false && !('armed' in out.snapshot.workspaces[0].panels[1]) &&
      panels[0].watch.trigger.kind === 'panel' && panels[0].watch.trigger.on === 'exit-ok' &&
      named('bad-kind') && named('bad-timer') && named('no-command'),
    JSON.stringify({ ids: panels.map((p) => p.id), warnings: out.warnings }))
}

{
  // M90. The backend on a chat record: codex round-trips, absent stays ABSENT
  // (never `backend: undefined`, which survives IPC and reads as present), an
  // unknown value warns and drops to claude, the panel kept.
  const out = L.parseLayout(JSON.stringify({
    version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [
      { id: 'c1', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 1, chat: { cwd: '/r', sessionId: 'thread-1', backend: 'codex' } },
      { id: 'c2', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 2, chat: { cwd: '/r', sessionId: 'u-2' } },
      { id: 'c3', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 3, chat: { cwd: '/r', sessionId: 'u-3', backend: 'gemini' } },
      { id: 'c4', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 4, chat: { cwd: '/r', sessionId: 'u-4', backend: 'claude' } }
    ] }]
  }))
  const ws = out.snapshot.workspaces[0]
  const by = (id) => (ws && ws.panels.find((p) => p.id === id)) || {}
  ok('codex.1 a chat record\'s backend: codex round-trips, an absent backend stays absent, an unknown backend warns by name and the panel keeps claude, and an explicit claude is stored as absent',
    ws !== undefined && ws.panels.length === 4 &&
      by('c1').chat && by('c1').chat.backend === 'codex' &&
      by('c2').chat && !('backend' in by('c2').chat) &&
      by('c3').chat && !('backend' in by('c3').chat) && out.warnings.some((w) => /c3/.test(w) && /gemini/.test(w)) &&
      by('c4').chat && !('backend' in by('c4').chat) && !out.warnings.some((w) => /c1|c2|c4/.test(w)),
    JSON.stringify({ warnings: out.warnings, c1: by('c1').chat, c2: by('c2').chat, c3: by('c3').chat, c4: by('c4').chat }))
}

{
  // M92. Lock, pin and maximise are layout facts on the panel record: absent
  // is every pre-M92 file and stays absent; `true` round-trips; a present
  // value that is not `true` (or a restore rect that is not four finite
  // numbers) warns by panel id and is dropped, the panel kept.
  const out = L.parseLayout(JSON.stringify({
    version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [
      { id: 'n1', x: 0, y: 0, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [], locked: true, pinned: true, maximised: { restore: { x: 5, y: 6, w: 300, h: 200 } } },
      { id: 'n2', x: 0, y: 0, w: 520, h: 340, z: 2, cwd: '~', command: 'sh', args: [] },
      { id: 'n3', x: 0, y: 0, w: 520, h: 340, z: 3, cwd: '~', command: 'sh', args: [], locked: 'yes', pinned: 1, maximised: { restore: { x: 'a' } } },
      { id: 'n4', x: 0, y: 0, w: 520, h: 340, z: 4, cwd: '~', command: 'sh', args: [], locked: false, pinned: false }
    ] }]
  }))
  const ws = out.snapshot.workspaces[0]
  const by = (id) => (ws && ws.panels.find((p) => p.id === id)) || {}
  const n1 = by('n1'), n2 = by('n2'), n3 = by('n3'), n4 = by('n4')
  ok('lockpin.1 locked, pinned and a maximised restore rect round-trip; absent stays absent; a malformed value warns by id and is dropped with the panel kept; an explicit false is stored as absent',
    ws !== undefined && ws.panels.length === 4 &&
      n1.locked === true && n1.pinned === true && n1.maximised && n1.maximised.restore.x === 5 && n1.maximised.restore.h === 200 &&
      !('locked' in n2) && !('pinned' in n2) && !('maximised' in n2) &&
      !('locked' in n3) && !('pinned' in n3) && !('maximised' in n3) && out.warnings.filter((w) => /n3/.test(w)).length >= 1 &&
      !('locked' in n4) && !('pinned' in n4) && !out.warnings.some((w) => /n1|n2|n4/.test(w)),
    JSON.stringify({ warnings: out.warnings, n1, n3 }))
}

{
  // M130. `skillTrail` is the ONE stored fact about the trail — a layout mark
  // like `pinned`, not a view state like M106's flip, so "collapse it back so
  // it is no longer visible" survives a relaunch. The value is CLOSED: only
  // the word `collapsed` means anything, so anything else is a malformed
  // value, warned by id and dropped with the panel kept.
  const out = L.parseLayout(JSON.stringify({
    version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [
      { id: 't1', x: 0, y: 0, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [], skillTrail: 'collapsed' },
      { id: 't2', x: 0, y: 0, w: 520, h: 340, z: 2, cwd: '~', command: 'sh', args: [] },
      { id: 't3', x: 0, y: 0, w: 520, h: 340, z: 3, cwd: '~', command: 'sh', args: [], skillTrail: 'banana' }
    ] }]
  }))
  const ws = out.snapshot.workspaces[0]
  const by = (id) => (ws && ws.panels.find((p) => p.id === id)) || {}
  const t1 = by('t1'), t2 = by('t2'), t3 = by('t3')
  ok('trail.mark.1 skillTrail: collapsed round-trips, absent stays absent, and any other value warns by panel id and is dropped with the panel kept',
    ws !== undefined && ws.panels.length === 3 &&
      t1.skillTrail === 'collapsed' &&
      !('skillTrail' in t2) &&
      !('skillTrail' in t3) && out.warnings.filter((w) => /t3/.test(w)).length >= 1 &&
      !out.warnings.some((w) => /t1|t2/.test(w)),
    JSON.stringify({ warnings: out.warnings, t1, t2, t3 }))
}

{
  // M93. SNAPSHOTS are a side effect of a SAVE: the ring keeps the newest
  // SNAPSHOT_MAX, trims oldest-first, coalesces within SNAPSHOT_MIN_MS (the
  // first record always lands), writes temp-and-rename, and a list reads
  // metadata newest first. Driven with an injected directory and clock.
  const { mkdtempSync, readdirSync, readFileSync: rf } = require('node:fs')
  const { tmpdir } = require('node:os')
  const dir = join(mkdtempSync(join(tmpdir(), 'tc layout snaps ')), 'layout-snapshots')
  let now = 1_000_000
  const snaps = L.createLayoutSnapshots({ dir, now: () => now, max: 3, minMs: 60_000 })
  const layoutBytes = (n) => JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w' + n, camera: { x: 0, y: 0, scale: 1 }, panels: Array.from({ length: n }, (_, i) => ({ id: 'n' + i, x: 0, y: 0, w: 520, h: 340, z: i + 1, cwd: '~', command: 'sh', args: [] })) }] })
  const first = snaps.record(layoutBytes(1))
  now += 1000
  const tooSoon = snaps.record(layoutBytes(2))
  now += 60_000
  const second = snaps.record(layoutBytes(3))
  now += 60_000
  const third = snaps.record(layoutBytes(4))
  now += 60_000
  const fourth = snaps.record(layoutBytes(5))
  const files = readdirSync(dir).sort()
  const listed = snaps.list()
  ok('snap.1 the ring records the first save, coalesces a save inside the window, keeps the newest max files oldest-trimmed, lists newest first with panel and workspace counts, and leaves no temp file',
    first === true && tooSoon === false && second === true && third === true && fourth === true &&
      files.length === 3 && files.every((f) => f.endsWith('.json')) &&
      listed.length === 3 && listed[0].panels === 5 && listed[2].panels === 3 && listed[0].at > listed[1].at && listed[0].workspaces === 1 && listed[0].bytes > 0 &&
      JSON.parse(rf(join(dir, files[files.length - 1]), 'utf8')).workspaces[0].name === 'w5',
    JSON.stringify({ first, tooSoon, second, third, fourth, files, listed }))
  const read = snaps.read(listed[1].at)
  const missing = snaps.read(42)
  ok('snap.1.b a snapshot reads back through the ONE layout parser; a missing stamp answers null rather than throwing',
    read !== null && read.snapshot.workspaces[0].panels.length === 4 && missing === null,
    JSON.stringify({ read: read && read.snapshot.workspaces[0].panels.length, missing }))
}

{
  // M93. RESTORE mints a NEW workspace from a snapshot's active workspace,
  // never touching the current one, with every panel id re-minted so a
  // restored panel cannot collide with a live one; a malformed snapshot is
  // refused by name.
  const current = { version: 1, activeWorkspaceId: 'a', workspaces: [
    { id: 'a', name: 'main', camera: { x: 0, y: 0, scale: 1 }, panels: [{ id: 'n1', x: 0, y: 0, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [] }] }
  ] }
  const snapshot = { version: 1, activeWorkspaceId: 'b', workspaces: [
    { id: 'zzz', name: 'other', camera: { x: 0, y: 0, scale: 1 }, panels: [] },
    { id: 'b', name: 'main', camera: { x: 5, y: 6, scale: 0.5 }, panels: [
      { id: 'n1', x: 10, y: 10, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [], links: [{ to: 'n2' }] },
      { id: 'n2', x: 900, y: 10, w: 520, h: 340, z: 2, cwd: '~', command: 'sh', args: [], links: [{ to: 'elsewhere' }] }
    ], groups: [{ id: 'g1', label: 'pair', colour: 'blue', panelIds: ['n1', 'n2'] }] }
  ] }
  const out = L.restoreFromSnapshot(L.parseLayout(JSON.stringify(current)).snapshot, JSON.stringify(snapshot), 1_700_000_000_000, (n) => 'r' + n, 7)
  const bad = L.restoreFromSnapshot(L.parseLayout(JSON.stringify(current)).snapshot, '{not json', 1, (n) => 'r' + n)
  const ws = out.kind === 'restored' ? out.layout.workspaces : []
  const added = ws.find((w) => w.id !== 'a')
  ok('snap.2 restore adds ONE workspace (the snapshot\'s active one) beside the current, names it by the source and the time, re-mints every panel id past the renderer\'s hint with links and groups following (a link to a panel outside the workspace is already gone — the ONE parser drops it before the restore sees it, so dropped counts nothing here), activates it, leaves the current workspace byte-identical, and refuses a malformed snapshot by name',
    out.kind === 'restored' && ws.length === 2 && added !== undefined && /main/.test(added.name) && out.layout.activeWorkspaceId === added.id &&
      added.panels.length === 2 && added.panels.every((p) => /^r\d+$/.test(p.id)) && added.panels[0].links[0].to === added.panels[1].id &&
      added.panels.map((p) => Number(p.id.slice(1))).every((n) => n >= 7) && (added.panels[1].links === undefined || added.panels[1].links.length === 0) && out.dropped === 0 &&
      added.groups[0].panelIds.join(',') === added.panels.map((p) => p.id).join(',') && added.camera.scale === 0.5 &&
      JSON.stringify(ws.find((w) => w.id === 'a')) === JSON.stringify(L.parseLayout(JSON.stringify(current)).snapshot.workspaces[0]) &&
      bad.kind === 'refused' && /snapshot/.test(bad.reason),
    JSON.stringify({ kind: out.kind, added: added && { id: added.id, name: added.name, panels: added.panels.map((p) => p.id), groups: added.groups }, bad }))
}

{
  // M93. ANNOTATIONS on the workspace record: absent is every pre-M93 file;
  // a malformed entry is dropped by name; a panel-anchored note whose panel
  // is gone is dropped and the rest kept; the cap keeps the newest.
  const many = Array.from({ length: 205 }, (_, i) => ({ id: 'a' + i, text: 't' + i, anchor: { kind: 'world', x: i, y: 0 } }))
  const out = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [
    { id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [{ id: 'n1', x: 0, y: 0, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [] }],
      annotations: [
        { id: 'a1', text: 'hello', anchor: { kind: 'world', x: 10, y: 20 } },
        { id: 'a2', text: 'on n1', anchor: { kind: 'panel', panelId: 'n1', dx: 5, dy: -30 } },
        { id: 'a3', text: 'orphan', anchor: { kind: 'panel', panelId: 'gone', dx: 0, dy: 0 } },
        { id: 'a4', text: 7, anchor: { kind: 'world', x: 0, y: 0 } },
        { id: 'a5', text: 'bad anchor', anchor: { kind: 'moon' } },
        'not an object'
      ] },
    { id: 'v', name: 'v', camera: { x: 0, y: 0, scale: 1 }, panels: [] },
    { id: 'u', name: 'u', camera: { x: 0, y: 0, scale: 1 }, panels: [], annotations: many }
  ] }))
  const w = out.snapshot.workspaces[0], v = out.snapshot.workspaces[1], u = out.snapshot.workspaces[2]
  ok('annot.1 annotations round-trip (world and panel anchors), an orphaned panel anchor / a non-string text / an unknown anchor / a non-object are each dropped by name with the rest kept, an absent list stays absent, and the cap keeps the newest 200',
    w.annotations.length === 2 && w.annotations[0].id === 'a1' && w.annotations[1].anchor.kind === 'panel' && w.annotations[1].anchor.dy === -30 &&
      out.warnings.filter((m) => /a3|a4|a5|annotation/.test(m)).length >= 3 &&
      !('annotations' in v) && u.annotations.length === 200 && u.annotations[0].id === 'a5' && u.annotations[199].id === 'a204',
    JSON.stringify({ w: w.annotations, v: Object.keys(v), u: u.annotations && [u.annotations.length, u.annotations[0].id], warnings: out.warnings }))
}

// M155 — ink.1. INK on the annotation record: `ink` is absent on every M93
// label (absent stays absent through a re-serialise), a valid ink annotation
// keeps its points and width, and a malformed `ink` (not an array, a point
// that is not two finite numbers, a width that is not positive) drops THAT
// annotation by name and keeps its neighbours.
{
  const out = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [
    { id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [{ id: 'n1', x: 0, y: 0, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [] }],
      annotations: [
        { id: 'l1', text: 'a label', anchor: { kind: 'world', x: 1, y: 2 } },
        { id: 'k1', text: '', anchor: { kind: 'panel', panelId: 'n1', dx: 5, dy: 6 }, ink: { points: [[0, 0], [10, 4], [20, 0]], width: 3 } },
        { id: 'k2', text: '', anchor: { kind: 'world', x: 0, y: 0 }, ink: { points: 'no', width: 3 } },
        { id: 'k3', text: '', anchor: { kind: 'world', x: 0, y: 0 }, ink: { points: [[0, 0], [1, 'x']], width: 3 } },
        { id: 'k4', text: '', anchor: { kind: 'world', x: 0, y: 0 }, ink: { points: [[0, 0], [1, 1]], width: 0 } },
        { id: 'k5', text: '', anchor: { kind: 'world', x: 0, y: 0 }, ink: { points: Array.from({ length: 2001 }, (_, i) => [i, 0]), width: 1 } },
        { id: 'l2', text: 'after', anchor: { kind: 'world', x: 3, y: 4 } }
      ] } ] }))
  const a = out.snapshot.workspaces[0].annotations ?? []
  const ids = a.map((x) => x.id).join(',')
  const k1 = a.find((x) => x.id === 'k1')
  const again = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [{ id: 'n1', x: 0, y: 0, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [] }], annotations: a }] })).snapshot.workspaces[0].annotations
  ok('ink.1 an ink annotation keeps its points and width, a label keeps NO ink key, and a malformed or over-cap ink drops that annotation by name with the rest kept',
    ids === 'l1,k1,l2' && k1 !== undefined && k1.ink.width === 3 && k1.ink.points.length === 3 && k1.ink.points[1][0] === 10 &&
      !('ink' in a[0]) && !('ink' in a[2]) && out.warnings.filter((w) => /dropped annotation k[2345]/.test(w)).length === 4 &&
      JSON.stringify(again) === JSON.stringify(a),
    JSON.stringify({ ids, k1, warnings: out.warnings }))
}

// M100 — teammate.1/.2. THE TEAMMATE RECORD on disk, with the record rules:
// absent is every pre-existing file (no warning), a malformed record is
// dropped BY NAME and the rest survive, an absent optional stays absent, and
// a chat's `teammateId` rides its record and stays absent when absent.
{
  const good = { id: 't1', name: 'ada', brief: 'be brief', places: ['/home/u/work/api'], services: ['github'], skills: [], memory: 't1', chats: ['c1'], messaging: true, scheduling: false }
  const out = L.parseLayout(JSON.stringify({
    version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [
      { id: 'c1', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 1, chat: { cwd: '/r', sessionId: 'u-1', teammateId: 't1' } },
      { id: 'c2', kind: 'chat', x: 0, y: 0, w: 560, h: 620, z: 2, chat: { cwd: '/r', sessionId: 'u-2' } }
    ] }],
    teammates: [
      good,
      { id: 't2', name: 'bo', brief: '', places: 'not-a-list', services: [], skills: [], memory: 't2', chats: [], messaging: false, scheduling: false },
      { id: 't3', name: '', brief: '', places: [], services: [], skills: [], memory: 't3', chats: [], messaging: false, scheduling: false },
      { id: 't1', name: 'dup', brief: '', places: [], services: [], skills: [], memory: 'x', chats: [], messaging: false, scheduling: false },
      { id: 't4', name: 'cy', brief: 'x', places: ['relative/path', '/ok'], services: [], skills: [], memory: 't4', chats: [], messaging: 'yes', scheduling: true }
    ]
  }))
  // Guarded: before the record exists the field is absent, and a throw here would abort the suite.
  const ts = Array.isArray(out.snapshot.teammates) ? out.snapshot.teammates : []
  const by = (id) => ts.find((t) => t.id === id)
  const named = (s) => out.warnings.some((w) => w.includes(s))
  const ws = out.snapshot.workspaces[0]
  const chat = (id) => (ws && ws.panels.find((p) => p.id === id)) || {}
  ok('teammate.1 a good record round-trips whole; a places field that is not a list drops the record by id; an empty name drops it; a duplicate id drops the later one; a relative place is dropped from an otherwise good record (the teammate kept) and a non-boolean flag falls to false; a chat\'s teammateId rides and an absent one stays absent',
    ts.length === 2 && JSON.stringify(by('t1')) === JSON.stringify(good) &&
      named('t2') && named('t3') && by('t4') !== undefined && by('t4').places.join() === '/ok' && by('t4').messaging === false && by('t4').scheduling === true && named('relative/path') &&
      chat('c1').chat && chat('c1').chat.teammateId === 't1' && chat('c2').chat && !('teammateId' in chat('c2').chat),
    JSON.stringify({ ts, warnings: out.warnings }))
  const absent = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [] }] }))
  const notList = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [] }], teammates: 'nope' }))
  ok('teammate.2 an absent teammates field is every pre-existing file: empty and NO warning; a non-array field is replaced with a warning; the cap holds',
    Array.isArray(absent.snapshot.teammates) && absent.snapshot.teammates.length === 0 && absent.warnings.length === 0 &&
      Array.isArray(notList.snapshot.teammates) && notList.snapshot.teammates.length === 0 && notList.warnings.some((w) => /teammates/.test(w)) && L.TEAMMATES_MAX > 0,
    JSON.stringify({ absentWarnings: absent.warnings, notListWarnings: notList.warnings }))
}

// M101 — routine.1. THE ROUTINE RECORD: round-trip whole; absent optionals
// absent; an interval under the floor drops the record by id; no teammate
// drops it; `lastRun` and `missed` rebuilt by name; absent field = no warning.
{
  const good = { id: 'r1', name: 'nightly', teammateId: 't1', everyMs: 600000, prompt: 'summarise', plan: 'focus n1', paused: false, lastRun: { at: 5, outcome: 'started', panelId: 'c9' }, missed: { at: 4 } }
  const out = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [] }], routines: [
    good,
    { id: 'r2', name: 'fast', teammateId: 't1', everyMs: 1000, prompt: 'x', paused: false },
    { id: 'r3', name: 'orphan', everyMs: 600000, prompt: 'x', paused: false },
    { id: 'r4', name: 'bare', teammateId: 't1', everyMs: 600000, prompt: 'x', paused: 'yes', lastRun: { at: 'now', outcome: 'started' } }
  ] }))
  const rs = Array.isArray(out.snapshot.routines) ? out.snapshot.routines : []
  const by = (id) => rs.find((r) => r.id === id)
  const named = (t) => out.warnings.some((w) => w.includes(t))
  const absent = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [] }] }))
  ok('routine.1 a good routine round-trips whole; an interval under the floor and a missing teammate each drop the record by id; a bare record keeps no plan, no lastRun (a malformed one is dropped, not coerced) and no missed; paused falls to false; an absent routines field warns nothing',
    rs.length === 2 && JSON.stringify(Object.fromEntries(Object.entries(by('r1') || {}).sort())) === JSON.stringify(Object.fromEntries(Object.entries(good).sort())) && named('r2') && named('r3') &&
      by('r4') !== undefined && !('plan' in by('r4')) && !('lastRun' in by('r4')) && !('missed' in by('r4')) && by('r4').paused === false &&
      Array.isArray(absent.snapshot.routines) && absent.snapshot.routines.length === 0 && absent.warnings.length === 0 && L.ROUTINES_MAX > 0,
    JSON.stringify({ rs, warnings: out.warnings }))
}

// M103 — browser.1. THE ELEVENTH KIND ON DISK. A browser panel is `kind:
// 'browser'` plus a `url` and nothing else — no cwd and no args, like every
// sessionless kind, so a reader keyed on the top-level cwd cannot mistake it
// for a terminal. A url that is not http(s) is MALFORMED, not a different
// kind of page: `file:` would hand the guest the user's disk and `data:` a
// page nobody can name, so the panel is dropped by id with a warning and the
// neighbours survive. An absent title stays absent (the record rule).
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'b1', kind: 'browser', x: 1, y: 2, w: 640, h: 480, z: 3, url: 'http://localhost:3000/' },
      { id: 'b2', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 4, url: 'file:///etc/passwd' },
      { id: 'b3', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 5, title: 'docs', url: 'https://example.com/docs' },
      { id: 'b4', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 6 },
      { id: 'b5', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 7, url: 'javascript:alert(1)' },
      { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 8, cwd: '~', args: [] }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  const named = (id) => out.warnings.some((w) => w.includes(id))
  const b1 = panels.find((p) => p.id === 'b1'), b3 = panels.find((p) => p.id === 'b3')
  ok('browser.1 a browser panel round-trips as kind + url with no cwd/args and an absent title kept absent; a file:, a javascript: and a missing url each drop their own panel by name; the neighbours survive',
    panels.length === 3 && panels.map((p) => p.id).join(',') === 'b1,b3,n1' &&
      b1 && b1.kind === 'browser' && b1.url === 'http://localhost:3000/' && !('title' in b1) && !('cwd' in b1) && !('args' in b1) &&
      b3 && b3.title === 'docs' && b3.url === 'https://example.com/docs' &&
      named('b2') && named('b4') && named('b5') && !named('b1') && !named('b3'),
    JSON.stringify({ ids: panels.map((p) => p.id), b1, warnings: out.warnings }))
}

// M185 — preview.device.1. THE NAMED DEVICE WIDTH ON DISK. Absent is every
// pre-M185 browser record and warns nothing, and serialises back to NO key —
// a written `"device": null` would claim a width the person never picked. A
// present value that is not one of the four names costs the FIELD with a
// warning naming the panel and the four names, never the panel: a preview
// that vanished because a width was misspelled is a worse answer than one at
// full width, and it would read as a panel the app deleted.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'd1', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 1, url: 'http://127.0.0.1:5173/' },
      { id: 'd2', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 2, url: 'http://127.0.0.1:5173/', device: 'phone' },
      { id: 'd3', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 3, url: 'http://127.0.0.1:5173/', device: 'watch' },
      { id: 'd4', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 4, url: 'http://127.0.0.1:5173/', device: 390 }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  const by = (id) => panels.find((p) => p.id === id)
  const text = L.serialiseLayout({ ...out.snapshot })
  const round = L.parseLayout(text).snapshot.workspaces[0].panels.find((p) => p.id === 'd2')
  const named = (id) => out.warnings.some((w) => w.includes(id) && w.includes('device'))
  ok('preview.device.1 a browser panel\'s device: absent stays absent and serialises to no key; one of the four names round-trips; a name that is not one of them and a number each cost the FIELD with a warning naming the panel and the four names, and their panels survive at full width',
    panels.length === 4 &&
      by('d1') && !('device' in by('d1')) && !/"device"/.test(text.split('"d1"')[1].split('}')[0] || '') &&
      by('d2') && by('d2').device === 'phone' && round && round.device === 'phone' &&
      by('d3') && !('device' in by('d3')) && named('d3') && out.warnings.some((w) => w.includes('d3') && w.includes('phone, tablet, laptop, full')) &&
      by('d4') && !('device' in by('d4')) && named('d4') &&
      !named('d1') && !named('d2'),
    JSON.stringify({ ids: panels.map((p) => p.id), d1: by('d1'), d2: by('d2'), d3: by('d3'), d4: by('d4'), warnings: out.warnings }))
}

// M195 (D03) — browser.preview.1. THE PREVIEW'S SOURCE ON DISK. The binding
// is what makes a browser pane a preview OF something, and it is the one fact
// about it that cannot be reconstructed: the url is `http://127.0.0.1:5173/`
// and nothing on disk relates that to a project. Absent is every pre-M195
// record and warns nothing (and serialises back to NO key). A malformed
// binding costs the FIELD and never the panel — `preview.device.1`'s rule, for
// its reason: a preview that vanished because its source was misspelled reads
// as a panel the app deleted. `root` must be ABSOLUTE, because a relative one
// would be resolved against a root nobody chose (`shared/places.ts`), and
// `sourcePanelId` is optional provenance whose malformation costs that KEY
// alone — the folder is the half that does the work.
// WRAPPED, because a reparse that lost its workspace would otherwise abort the
// ~250 checks below this one rather than fail this one (`docs/verify-suites.md`
// rule 1).
{
  const NAME = 'browser.preview.1 a browser panel\'s preview binding: absent stays absent and serialises to no key; a root and its source panel round-trip with the root normalised; a non-object, a null, an array, a non-string root, a relative root, an empty root and a `~` root each cost the FIELD with a warning naming the panel, and their panels survive unbound; a malformed or empty sourcePanelId costs that KEY alone and the root is kept'
  try {
    const out = L.parseLayout(JSON.stringify({
      workspaces: [{ id: 'w1', name: 'Main', panels: [
        { id: 'q1', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 1, url: 'http://127.0.0.1:5173/' },
        { id: 'q2', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 2, url: 'http://127.0.0.1:5173/', preview: { root: '/w/api', sourcePanelId: 'p1' } },
        { id: 'q3', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 3, url: 'http://127.0.0.1:5173/', preview: { root: '/w/api/' } },
        { id: 'q4', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 4, url: 'http://127.0.0.1:5173/', preview: { root: 'w/api' } },
        { id: 'q5', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 5, url: 'http://127.0.0.1:5173/', preview: { root: 42 } },
        { id: 'q6', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 6, url: 'http://127.0.0.1:5173/', preview: 'the api' },
        { id: 'q7', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 7, url: 'http://127.0.0.1:5173/', preview: { root: '/w/api', sourcePanelId: 7 } },
        { id: 'q8', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 8, url: 'http://127.0.0.1:5173/', preview: null },
        { id: 'q9', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 9, url: 'http://127.0.0.1:5173/', preview: [] },
        { id: 'q10', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 10, url: 'http://127.0.0.1:5173/', preview: { root: '' } },
        { id: 'q11', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 11, url: 'http://127.0.0.1:5173/', preview: { root: '~/work' } },
        { id: 'q12', kind: 'browser', x: 0, y: 0, w: 640, h: 480, z: 12, url: 'http://127.0.0.1:5173/', preview: { root: '/w/api', sourcePanelId: '' } }
      ] }],
      activeWorkspaceId: 'w1'
    }))
    const panels = out.snapshot.workspaces[0].panels
    const by = (id) => panels.find((p) => p.id === id)
    const text = L.serialiseLayout({ ...out.snapshot })
    const reparsed = L.parseLayout(text).snapshot.workspaces[0]
    const round = reparsed === undefined ? undefined : reparsed.panels.find((p) => p.id === 'q2')
    // `panel <id>:`, not a bare `includes(id)`: with twelve panels the bare
    // form makes `named('q1')` true because q10, q11 and q12's own warnings
    // contain the substring — which reported this check's negative arm as
    // broken while every arm was in fact correct.
    const named = (id) => out.warnings.some((w) => w.includes(`panel ${id}:`) && w.includes('preview'))
    const fieldGone = ['q4', 'q5', 'q6', 'q8', 'q9', 'q10', 'q11']
    const keyGone = ['q7', 'q12']
    ok(NAME,
      panels.length === 12 &&
        by('q1') && !('preview' in by('q1')) && !/"preview"/.test(text.split('"q1"')[1].split('}')[0] || '') &&
        by('q2') && by('q2').preview && by('q2').preview.root === '/w/api' && by('q2').preview.sourcePanelId === 'p1' &&
        round && round.preview && round.preview.root === '/w/api' && round.preview.sourcePanelId === 'p1' &&
        by('q3') && by('q3').preview && by('q3').preview.root === '/w/api' && !('sourcePanelId' in by('q3').preview) &&
        fieldGone.every((id) => by(id) && !('preview' in by(id)) && named(id)) &&
        keyGone.every((id) => by(id) && by(id).preview && by(id).preview.root === '/w/api' && !('sourcePanelId' in by(id).preview) && named(id)) &&
        !named('q1') && !named('q2') && !named('q3'),
      JSON.stringify({ previews: panels.map((p) => ({ id: p.id, preview: p.preview })), fieldGone: fieldGone.filter((id) => !(by(id) && !('preview' in by(id)) && named(id))), keyGone: keyGone.filter((id) => !(by(id) && by(id).preview && !('sourcePanelId' in by(id).preview) && named(id))), warnings: out.warnings }))
  } catch (e) {
    ok(NAME, false, 'threw: ' + String(e && e.message || e))
  }
}

// D12 — artifact.provenance.1. A title is mutable presentation; source is a
// separate optional record. Old images retain no invented source, a capture
// keeps its stable id/URL through serialisation, and a malformed or unknown
// source costs itself rather than the picture.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'old', kind: 'image', x: 0, y: 0, w: 480, h: 360, z: 1, title: 'renamed', image: { path: '/w/old.png' } },
      { id: 'cap', kind: 'image', x: 0, y: 0, w: 480, h: 360, z: 2, title: 'anything now', image: { path: '/w/capture.png', artifact: { kind: 'capture', id: '2026-page.png', url: 'http://localhost:5173/a', capturedAt: 42 } } },
      { id: 'bad', kind: 'image', x: 0, y: 0, w: 480, h: 360, z: 3, image: { path: '/w/bad.png', artifact: { kind: 'future', value: 'x' } } }
    ] }], activeWorkspaceId: 'w1'
  }))
  const by = (id) => out.snapshot.workspaces[0].panels.find((p) => p.id === id)
  const round = L.parseLayout(L.serialiseLayout(out.snapshot)).snapshot.workspaces[0].panels.find((p) => p.id === 'cap')
  ok('artifact.provenance.1 image artifact provenance: absent old images stay absent; a renamed capture retains its capture id, URL and time through a round-trip; malformed or unknown provenance is warned and dropped while its image remains',
    by('old') && !('artifact' in by('old').image) &&
      by('cap')?.image.artifact?.kind === 'capture' && by('cap').image.artifact.id === '2026-page.png' && by('cap').title === 'anything now' &&
      round?.image.artifact?.kind === 'capture' && round.image.artifact.url === 'http://localhost:5173/a' &&
      by('bad') && !('artifact' in by('bad').image) && out.warnings.some((w) => w.includes('bad') && w.includes('artifact')),
    JSON.stringify({ panels: out.snapshot.workspaces[0].panels, warnings: out.warnings }))
}

// M186 — image.asset.1. THE ASSET IDENTITY ON DISK. `image.asset` is a
// sha-256 of the picture's own bytes: absent on every pre-M186 record and on
// any picture the person pointed at in place (and it serialises to NO key),
// present when this app holds the bytes. A malformed id costs the FIELD with
// a warning naming the panel — never the panel, because the path still paints
// and a picture that vanished for a misspelled id reads as a deletion the app
// performed. The PATH keeps its own rule: absent or relative still drops the
// panel, because a picture with no file is a different failure entirely.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'i1', kind: 'image', x: 0, y: 0, w: 480, h: 360, z: 1, image: { path: '/w/one.png' } },
      { id: 'i2', kind: 'image', x: 0, y: 0, w: 480, h: 360, z: 2, image: { path: '/w/two.png', asset: 'a'.repeat(64) } },
      { id: 'i3', kind: 'image', x: 0, y: 0, w: 480, h: 360, z: 3, image: { path: '/w/three.png', asset: 'NOT-A-DIGEST' } },
      { id: 'i4', kind: 'image', x: 0, y: 0, w: 480, h: 360, z: 4, image: { path: '/w/four.png', asset: 42 } },
      { id: 'i5', kind: 'image', x: 0, y: 0, w: 480, h: 360, z: 5, image: { path: 'relative.png', asset: 'a'.repeat(64) } }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  const by = (id) => panels.find((p) => p.id === id)
  const text = L.serialiseLayout({ ...out.snapshot })
  const round = L.parseLayout(text).snapshot.workspaces[0].panels.find((p) => p.id === 'i2')
  ok('image.asset.1 image.asset: absent stays absent and serialises to no key; a 64-hex digest round-trips; a non-digest string and a number each cost the FIELD with a warning naming the panel while the picture is kept; a relative path still drops the whole panel',
    panels.map((p) => p.id).join(',') === 'i1,i2,i3,i4' &&
      by('i1') && !('asset' in by('i1').image) &&
      by('i2') && by('i2').image.asset === 'a'.repeat(64) && round && round.image.asset === 'a'.repeat(64) &&
      by('i3') && !('asset' in by('i3').image) && by('i3').image.path === '/w/three.png' && out.warnings.some((w) => w.includes('i3') && w.includes('asset')) &&
      by('i4') && !('asset' in by('i4').image) && out.warnings.some((w) => w.includes('i4') && w.includes('asset')) &&
      out.warnings.some((w) => w.includes('i5') && w.includes('absolute')) &&
      !/"asset"/.test(text.split('"i1"')[1].split('}')[0] || ''),
    JSON.stringify({ ids: panels.map((p) => p.id), i1: by('i1'), i2: by('i2'), i3: by('i3'), i4: by('i4'), warnings: out.warnings }))
}

// M187 — note.1. THE NOTE RECORD ON DISK. `form` is REQUIRED and a value
// outside the three drops the PANEL by name: a note whose form the app
// invented would paint as something the person did not draw. An absent `text`
// is an EMPTY note (a person makes one and types later), not a malformed
// record; a non-string text keeps the note empty WITH a warning, because the
// note is the object and its words are a field. A tint belongs to the sticky
// alone: on another form, or outside the four names, it is dropped with a
// warning and the note is kept — an untinted note is still the note that was
// written, and dropping the panel over a colour would read as a deletion.
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [
      { id: 'n1', kind: 'note', x: 0, y: 0, w: 320, h: 220, z: 1, note: { form: 'sticky', text: 'buy milk', tint: 'blue' } },
      { id: 'n2', kind: 'note', x: 0, y: 0, w: 320, h: 220, z: 2, note: { form: 'text' } },
      { id: 'n3', kind: 'note', x: 0, y: 0, w: 720, h: 480, z: 3, note: { form: 'frame', text: 'release work', tint: 'green' } },
      { id: 'n4', kind: 'note', x: 0, y: 0, w: 320, h: 220, z: 4, note: { form: 'sticky', text: 'ok', tint: 'chartreuse' } },
      { id: 'n5', kind: 'note', x: 0, y: 0, w: 320, h: 220, z: 5, note: { form: 'postit', text: 'no' } },
      { id: 'n6', kind: 'note', x: 0, y: 0, w: 320, h: 220, z: 6 },
      { id: 'n7', kind: 'note', x: 0, y: 0, w: 320, h: 220, z: 7, note: { form: 'sticky', text: 42 } }
    ] }],
    activeWorkspaceId: 'w1'
  }))
  const panels = out.snapshot.workspaces[0].panels
  const by = (id) => panels.find((p) => p.id === id)
  const text = L.serialiseLayout({ ...out.snapshot })
  const round = L.parseLayout(text).snapshot.workspaces[0].panels.find((p) => p.id === 'n1')
  const warns = (id, word) => out.warnings.some((w) => w.includes(id) && w.includes(word))
  ok('note.1 a note round-trips as form + text (+ a sticky\'s tint); an absent text is an empty note and a non-string text keeps the note empty with a warning; a tint outside the four names, and a tint on a form that is not sticky, are each dropped with a warning and the note kept; an unknown form and a missing note object each drop their own panel by name',
    panels.map((p) => p.id).join(',') === 'n1,n2,n3,n4,n7' &&
      by('n1').note.form === 'sticky' && by('n1').note.text === 'buy milk' && by('n1').note.tint === 'blue' &&
      round && round.note.tint === 'blue' && round.note.text === 'buy milk' &&
      by('n2').note.text === '' && !('tint' in by('n2').note) &&
      by('n3').note.form === 'frame' && !('tint' in by('n3').note) && warns('n3', 'sticky') &&
      by('n4') && !('tint' in by('n4').note) && warns('n4', 'tint') &&
      by('n7') && by('n7').note.text === '' && warns('n7', 'text') &&
      warns('n5', 'form') && warns('n6', 'form'),
    JSON.stringify({ ids: panels.map((p) => p.id), n1: by('n1'), n2: by('n2'), n3: by('n3'), n4: by('n4'), n7: by('n7'), warnings: out.warnings }))
}

// M190 — template.reviewed.1. THE UNREAD MARK. `reviewed: false` says a
// template arrived from somebody else's file and no person has read its
// action nodes — which run verb lines, so an imported template is code
// somebody else wrote. Absent means reviewed (every template this canvas made
// itself, and every pre-M190 record); anything present that is not a boolean
// costs the FIELD and is treated as UNREVIEWED, which is the safe direction:
// an unreadable mark must never read as "a person has checked this".
{
  const out = L.parseLayout(JSON.stringify({
    workspaces: [{ id: 'w1', name: 'Main', panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }],
    activeWorkspaceId: 'w1',
    templates: [
      { id: 'mine', name: 'mine', nodes: [{ key: 'n1', kind: 'terminal', cwd: '~', dx: 0, dy: 0 }], edges: [] },
      { id: 'theirs', name: 'theirs', nodes: [{ key: 'n1', kind: 'action', line: 'note-add sticky', cwd: '~', dx: 0, dy: 0 }], edges: [], reviewed: false },
      { id: 'read', name: 'read', nodes: [{ key: 'n1', kind: 'terminal', cwd: '~', dx: 0, dy: 0 }], edges: [], reviewed: true },
      { id: 'odd', name: 'odd', nodes: [{ key: 'n1', kind: 'terminal', cwd: '~', dx: 0, dy: 0 }], edges: [], reviewed: 'yes' }
    ]
  }))
  const by = (id) => (out.snapshot.templates ?? []).find((t) => t.id === id)
  const text = L.serialiseLayout({ ...out.snapshot })
  const round = L.parseLayout(text).snapshot.templates.find((t) => t.id === 'theirs')
  ok('template.reviewed.1 a template\'s reviewed mark: absent stays absent (and serialises to no key), false round-trips, true is normalised to absent, and a value that is not a boolean costs the field and is treated as UNREVIEWED with a warning naming the template',
    by('mine') && !('reviewed' in by('mine')) &&
      by('theirs') && by('theirs').reviewed === false && round && round.reviewed === false &&
      by('read') && !('reviewed' in by('read')) &&
      by('odd') && by('odd').reviewed === false && out.warnings.some((w) => w.includes('odd') && w.includes('reviewed')) &&
      !/"reviewed"/.test(text.split('"mine"')[1].split('}')[0] || ''),
    JSON.stringify({ mine: by('mine'), theirs: by('theirs'), read: by('read'), odd: by('odd'), warnings: out.warnings }))
}

// M113 — work.1..3. THE WORK ITEM RECORD. Absent is every pre-M113 file; a
// malformed entry is dropped by name; the cap keeps the newest; the dedupe is
// by key and never resets a working item; every absent optional stays absent
// through the carry. The four state words are DATA here, never a provider's
// string — a board whose column a drag can set is a board that lies.
{
  const W = L
  const good = { id: 'wi1', source: 'github', key: 'acme/canvas#7', title: 'Fix the thing', url: 'https://github.com/acme/canvas/issues/7', state: 'todo', createdAt: 5, updatedAt: 10 }
  let absent, replaced, dropped, capped
  const warnings = [], w2 = [], w3 = []
  try {
    absent = W.parseWorkItems(undefined, warnings)
    replaced = W.parseWorkItems('nope', w2)
    dropped = W.parseWorkItems([good, { ...good, id: 'x', state: 'doing' }, { ...good, id: 'y', source: 'trello' }, { ...good, id: 'z', pr: { number: 'four', url: 'u' } }, { ...good, id: 'ok', pr: { number: 4, url: 'u' } }, 'junk'], w3)
    const many = Array.from({ length: W.WORK_ITEMS_MAX + 5 }, (_, i) => ({ ...good, id: `m${i}`, key: `k#${i}`, updatedAt: i }))
    capped = W.parseWorkItems(many, [])
    ok('work.1 an absent workItems field is undefined with no warning; a non-array is replaced with one warning; an unknown state, an unknown source, a pr with a non-numeric number and a non-object entry each drop their own entry by name and the rest survive; the cap keeps the newest by updatedAt',
      absent === undefined && warnings.length === 0 && Array.isArray(replaced) && replaced.length === 0 && w2.length === 1
        && dropped.map((i) => i.id).join(',') === 'wi1,ok' && w3.length === 4 && w3.every((t) => /dropped work item/.test(t))
        && capped.length === W.WORK_ITEMS_MAX && capped[0].id === `m${W.WORK_ITEMS_MAX + 4}`,
      JSON.stringify({ absent, replaced, w2, ids: dropped && dropped.map((i) => i.id), w3, cappedFirst: capped && capped[0] && capped[0].id }))
  } catch (e) { ok('work.1 (threw)', false, String(e)) }
  try {
    const one = W.upsertWorkItem([], { ...good }, 100)
    const again = W.upsertWorkItem(one.map((i) => ({ ...i, state: 'working', panelId: 'n9' })), { ...good, title: 'Fix the thing (edited)', remoteState: 'open' }, 200)
    const typedA = W.upsertWorkItem([], { id: 't1', source: 'typed', title: 'same', state: 'todo' }, 1)
    const typedB = W.upsertWorkItem(typedA, { id: 't2', source: 'typed', title: 'same', state: 'todo' }, 2)
    ok('work.2 upsert by key updates title/remoteState/updatedAt and keeps state, panelId and createdAt — adding twice never duplicates and never resets a working item; two typed items with one title are two items',
      one.length === 1 && one[0].createdAt === 100 && again.length === 1 && again[0].title === 'Fix the thing (edited)' && again[0].state === 'working' && again[0].panelId === 'n9' && again[0].createdAt === 100 && again[0].updatedAt === 200 && again[0].remoteState === 'open' && typedB.length === 2,
      JSON.stringify({ one, again, typedB }))
  } catch (e) { ok('work.2 (threw)', false, String(e)) }
  try {
    const bare = { id: 'b', source: 'typed', title: 'bare', state: 'todo', createdAt: 1, updatedAt: 1 }
    const carried = W.carryWorkItem(bare)
    const full = { ...bare, key: 'K', url: 'u', description: 'd', remoteState: 'r', teammateId: 't', panelId: 'p', worktreeId: 'w', pr: { number: 1, url: 'pu' }, note: 'n', anchor: { panelId: 'p', dx: 1, dy: 2 } }
    const carriedFull = W.carryWorkItem(full)
    ok('work.3 carryWorkItem writes exactly the six required keys for a bare item and every present optional for a full one, never an undefined key, with pr and anchor as fresh objects',
      Object.keys(carried).sort().join(',') === 'createdAt,id,source,state,title,updatedAt' && JSON.stringify(carriedFull) === JSON.stringify(full) && carriedFull.pr !== full.pr && carriedFull.anchor !== full.anchor,
      JSON.stringify({ keys: Object.keys(carried), carriedFull }))
  } catch (e) { ok('work.3 (threw)', false, String(e)) }
  // The workspace: absent stays absent ON DISK, and a list round-trips.
  try {
    const parsedAbsent = W.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [], camera: { x: 0, y: 0, scale: 1 } }], activeWorkspaceId: 'w1' }))
    const parsedWith = W.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [], camera: { x: 0, y: 0, scale: 1 }, workItems: [good, 'junk'] }], activeWorkspaceId: 'w1' }))
    const wsA = parsedAbsent.snapshot.workspaces[0], wsB = parsedWith.snapshot.workspaces[0]
    ok('work.1.b the workspace parse keeps workItems ABSENT for a pre-M113 file and carries a list through the ONE parser with the junk entry dropped by name',
      !('workItems' in wsA) && Array.isArray(wsB.workItems) && wsB.workItems.length === 1 && wsB.workItems[0].key === 'acme/canvas#7' && parsedWith.warnings.some((t) => /dropped work item/.test(t)),
      JSON.stringify({ wsAKeys: Object.keys(wsA), wsB: wsB.workItems, warnings: parsedWith.warnings }))
  } catch (e) { ok('work.1.b (threw)', false, String(e)) }
  // M201 (D07). THE RECORDED REVIEW. It is the USER's fact, not the
  // provider's, so a re-add from GitHub must not erase it — re-reading an
  // issue says nothing about whether anybody looked at the lane. A malformed
  // mark costs the FIELD (the anchor's precedent): a card that lost the
  // memory of being reviewed is still a card, and the safe direction is also
  // the honest one, since no mark reads as `none` and OFFERS a review rather
  // than claiming one happened.
  try {
    const base = { id: 'r1', source: 'github', key: 'acme/canvas#9', title: 't', state: 'todo', createdAt: 1, updatedAt: 1 }
    const mark = { at: 99, signature: 'deadbeef', files: 3 }
    const carried = W.carryWorkItem({ ...base, reviewed: mark })
    const bare = W.carryWorkItem(base)
    const upserted = W.upsertWorkItem([W.carryWorkItem({ ...base, reviewed: mark })], { ...base, title: 'renamed upstream', remoteState: 'closed' }, 500)
    const parsed = W.parseWorkItems([
      { ...base, id: 'good', reviewed: mark },
      { ...base, id: 'bad-mark', reviewed: { at: 'soon', signature: 5 } },
      { ...base, id: 'no-mark' }
    ], [])
    const good = parsed.find((i) => i.id === 'good')
    const badMark = parsed.find((i) => i.id === 'bad-mark')
    const roundTrip = W.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [], camera: { x: 0, y: 0, scale: 1 }, workItems: [{ ...base, reviewed: mark }] }], activeWorkspaceId: 'w1' }))
    ok('work.readiness.1 the recorded review is absent on every pre-M201 item and stays absent through carryWorkItem; it survives a provider re-add, because re-reading an issue says nothing about whether anybody reviewed the lane; and a malformed mark costs the FIELD and not the entry',
      !('reviewed' in bare) &&
        JSON.stringify(carried.reviewed) === JSON.stringify(mark) && carried.reviewed !== mark &&
        upserted.length === 1 && upserted[0].title === 'renamed upstream' && JSON.stringify(upserted[0].reviewed) === JSON.stringify(mark) &&
        parsed.length === 3 &&
        JSON.stringify(good.reviewed) === JSON.stringify(mark) &&
        badMark !== undefined && !('reviewed' in badMark) &&
        JSON.stringify(roundTrip.snapshot.workspaces[0].workItems[0].reviewed) === JSON.stringify(mark),
      JSON.stringify({ bareKeys: Object.keys(bare), carried: carried.reviewed, upserted: upserted[0] && upserted[0].reviewed, parsedIds: parsed.map((i) => i.id), badMark, roundTrip: roundTrip.snapshot.workspaces[0].workItems[0] }))
  } catch (e) { ok('work.readiness.1 (threw)', false, String(e)) }
  // M285. The mark's CONTENT identity: a pre-M285 record parses exactly as
  // before (no identity key, and none invented), a well-formed identity
  // round-trips through the parser and carryWorkItem as a fresh object, and
  // a malformed identity costs the IDENTITY and keeps the mark — the field
  // rule applied one level down.
  try {
    const base = { id: 'r1', source: 'github', key: 'acme/canvas#9', title: 't', state: 'todo', createdAt: 1, updatedAt: 1 }
    const identity = { base: 'abc123', content: 'f'.repeat(32) }
    const withId = { at: 99, signature: 'deadbeef', files: 3, identity }
    const parsed = W.parseWorkItems([
      { ...base, id: 'old', reviewed: { at: 99, signature: 'deadbeef', files: 3 } },
      { ...base, id: 'new', reviewed: withId },
      { ...base, id: 'bad-id', reviewed: { at: 99, signature: 'deadbeef', files: 3, identity: { base: 'abc', content: 'short' } } }
    ], [])
    const byId = (id) => parsed.find((i) => i.id === id)
    const carried = W.carryWorkItem({ ...base, reviewed: withId })
    const roundTrip = W.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [], camera: { x: 0, y: 0, scale: 1 }, workItems: [{ ...base, reviewed: withId }] }], activeWorkspaceId: 'w1' }))
    ok('work.review-id.1 a pre-M285 mark parses without an identity and none is invented; a well-formed identity round-trips as a fresh object; a malformed identity costs the identity and keeps the mark',
      parsed.length === 3 &&
        byId('old').reviewed !== undefined && !('identity' in byId('old').reviewed) &&
        JSON.stringify(byId('new').reviewed.identity) === JSON.stringify(identity) &&
        byId('bad-id').reviewed !== undefined && byId('bad-id').reviewed.files === 3 && !('identity' in byId('bad-id').reviewed) &&
        JSON.stringify(carried.reviewed.identity) === JSON.stringify(identity) && carried.reviewed.identity !== identity &&
        JSON.stringify(roundTrip.snapshot.workspaces[0].workItems[0].reviewed.identity) === JSON.stringify(identity),
      JSON.stringify({ old: byId('old'), neu: byId('new'), bad: byId('bad-id'), carried: carried.reviewed }))
  } catch (e) { ok('work.review-id.1 (threw)', false, String(e)) }
}

// M209 (D11). Retained outcomes are task history, not a second run parser:
// closing the last panel must preserve a bounded, honest fact while a bad
// historical row cannot prevent the workspace opening.
{
  const good = { id: 'outcome_wi1_10', itemId: 'wi1', title: 'Keep meaning', state: 'review', capturedAt: 10, execution: 'completed', sourcePanelId: 'chat1', runId: 'run1' }
  const warnings = [], malformedWarnings = []
  const absent = L.parseRetainedOutcomes(undefined, warnings)
  const malformed = L.parseRetainedOutcomes([good, { ...good, id: 'bad', execution: 'success' }, 'junk'], malformedWarnings)
  const many = L.parseRetainedOutcomes(Array.from({ length: L.RETAINED_OUTCOMES_MAX + 2 }, (_, i) => ({ ...good, id: `o${i}`, capturedAt: i })), [])
  const withRecord = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w1', workspaces: [{ id: 'w1', name: 'a', panels: [], camera: { x: 0, y: 0, scale: 1 }, retainedOutcomes: [good] }] }))
  const old = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w1', workspaces: [{ id: 'w1', name: 'a', panels: [], camera: { x: 0, y: 0, scale: 1 } }] }))
  const item = { id: 'wi1', source: 'typed', title: 'Keep meaning', state: 'working', panelId: 'chat1', createdAt: 1, updatedAt: 2 }
  const captured = L.retainOutcome(item, [{ id: 'run1', name: 'r', panelIds: ['chat1'], edges: [], startedAt: 1, endedAt: 2, entries: [{ panelId: 'chat1', startedAt: 1, endedAt: 2, outcome: 'exit 0' }] }], 10)
  ok('outcome.retained.1 absent retained history stays absent and warns nothing; malformed and unknown execution rows drop individually; the newest bounded records survive; a historical source panel may be missing from the current workspace; and capture reads a completed run without recreating any panel',
    absent === undefined && warnings.length === 0 && malformed.length === 1 && malformedWarnings.length === 2 &&
      many.length === L.RETAINED_OUTCOMES_MAX && many[0].id === `o${L.RETAINED_OUTCOMES_MAX + 1}` &&
      !('retainedOutcomes' in old.snapshot.workspaces[0]) && withRecord.snapshot.workspaces[0].retainedOutcomes?.[0].sourcePanelId === 'chat1' &&
      captured?.execution === 'completed' && captured.runId === 'run1' && captured.sourcePanelId === 'chat1' &&
      L.retainedNextAction({ ...good, state: 'done' }).includes('review'),
    JSON.stringify({ absent, malformed, malformedWarnings, cap: many.length, old: Object.keys(old.snapshot.workspaces[0]), captured }))
}

// M115 — work.4. THE PR DOOR'S REFUSALS, as data. `prRefusal` is the ONE
// function every Open PR button and the palette row read, so the five arms
// are named once: no lane, nothing ahead, a source with no repository, GitHub
// not connected (the credential rows' own sentence), the teammate lacking
// the github service. And a `pr` field survives the carry.
{
  const W = L
  const base = { id: 'w', source: 'github', key: 'acme/canvas#1', title: 't', state: 'todo', createdAt: 1, updatedAt: 1, teammateId: 't1', panelId: 'c1', worktreeId: 'wt1' }
  const mate = { id: 't1', name: 'ada', brief: '', places: ['/r'], services: ['github'], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: false }
  let okArm, noLane, zero, jira, notConnected, noService, carried
  try {
    const lane = { kind: 'lane', base: 'main', ahead: 2, behind: 0 }
    okArm = W.prRefusal(base, lane, true, mate)
    noLane = W.prRefusal({ ...base, panelId: undefined, worktreeId: undefined }, undefined, true, mate)
    zero = W.prRefusal(base, { ...lane, ahead: 0 }, true, mate)
    jira = W.prRefusal({ ...base, source: 'jira', key: 'PROJ-1' }, lane, true, mate)
    notConnected = W.prRefusal(base, lane, false, mate)
    noService = W.prRefusal(base, lane, true, { ...mate, services: [] })
    carried = W.carryWorkItem({ ...base, pr: { number: 4, url: 'https://github.com/acme/canvas/pull/4' } })
  } catch (e) { okArm = String(e) }
  ok('work.4 prRefusal answers null when a lane is ahead, GitHub is connected and the teammate may spend github; and names no lane, nothing ahead of the base, a source with no repository, not connected (the credential rows\' sentence) and a teammate without the github service each by its own sentence; a pr field is carried',
    okArm === null && typeof noLane === 'string' && /lane/.test(noLane) && typeof zero === 'string' && /ahead|commits/.test(zero) && /main/.test(zero) &&
      typeof jira === 'string' && /jira/.test(jira) && typeof notConnected === 'string' && /github token/.test(notConnected) &&
      typeof noService === 'string' && /ada/.test(noService) && /github/.test(noService) && /Teammates pane/.test(noService) &&
      carried && carried.pr && carried.pr.number === 4,
    JSON.stringify({ okArm, noLane, zero, jira, notConnected, noService, pr: carried && carried.pr }))
}

// M116 — work.5. THE TWELFTH KIND ON DISK. A work card is `kind: 'work'`
// plus `work: { itemId }` and nothing else — no cwd and no args, like every
// sessionless kind, so the terminal reader cannot mistake it for a process.
// The itemId is the card's ONLY identity (the record it renders lives on the
// workspace's workItems list, never on the panel), so a missing or non-string
// one is a malformed panel dropped BY NAME with the neighbours kept — a card
// that names no item would sit on the canvas saying `no longer on the board`
// about an item that never existed. An absent title stays absent.
{
  try {
    const out = L.parseLayout(JSON.stringify({
      workspaces: [{ id: 'w1', name: 'Main', panels: [
        { id: 'k1', kind: 'work', x: 1, y: 2, w: 640, h: 180, z: 3, work: { itemId: 'wi-7' } },
        { id: 'k2', kind: 'work', x: 0, y: 0, w: 640, h: 180, z: 4, work: { itemId: 7 } },
        { id: 'k3', kind: 'work', x: 0, y: 0, w: 640, h: 180, z: 5, title: 'Fix the thing', work: { itemId: 'wi-8' } },
        { id: 'k4', kind: 'work', x: 0, y: 0, w: 640, h: 180, z: 6 },
        { id: 'k5', kind: 'work', x: 0, y: 0, w: 640, h: 180, z: 7, work: { itemId: '' } },
        { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 8, cwd: '~', args: [] }
      ] }],
      activeWorkspaceId: 'w1'
    }))
    const panels = out.snapshot.workspaces[0].panels
    const named = (id) => out.warnings.some((w) => w.includes(id))
    const k1 = panels.find((p) => p.id === 'k1'), k3 = panels.find((p) => p.id === 'k3')
    ok('work.5 a work panel round-trips as kind + work.itemId with no cwd/args and an absent title kept absent; a numeric, an empty and a missing itemId each drop their own panel by name; the neighbours survive',
      panels.length === 3 && panels.map((p) => p.id).join(',') === 'k1,k3,n1' &&
        k1 && k1.kind === 'work' && k1.work && k1.work.itemId === 'wi-7' && Object.keys(k1.work).length === 1 && !('title' in k1) && !('cwd' in k1) && !('args' in k1) &&
        k3 && k3.title === 'Fix the thing' && k3.work.itemId === 'wi-8' &&
        named('k2') && named('k4') && named('k5') && !named('k1') && !named('k3'),
      JSON.stringify({ ids: panels.map((p) => p.id), k1, warnings: out.warnings }))
  } catch (e) { ok('work.5 (threw)', false, String(e)) }
}

/* ---- M126: the shelf on disk ---- */
try {
  const w = []
  const bare = L.parseLayout(JSON.stringify({ version: 1, workspaces: [] }))
  ok('shelf.disk.1 a pre-M126 file parses with an empty shelf and no warning',
     bare.snapshot.shelf.columns.length === 0 && !bare.warnings.some((x) => /shelf/i.test(x)),
     bare.warnings.join('|'))
  const round = JSON.parse(L.serialiseLayout({
    ...bare.snapshot, shelf: { columns: [{ id: 'c', title: 'mobile', keys: ['["user","swiftui"]'] }] }
  }))
  ok('shelf.disk.2 a shelf round-trips', round.shelf.columns[0].title === 'mobile',
     JSON.stringify(round.shelf))
  const empty = JSON.parse(L.serialiseLayout(bare.snapshot))
  ok('shelf.disk.3 an EMPTY shelf is absent on disk, never written as []',
     !('shelf' in empty), Object.keys(empty).join(','))
} catch (e) { ok('shelf.disk.1 (threw)', false, String(e)) }

// M128 — skill.panel.disk.1. THE THIRTEENTH KIND ON DISK. A skill panel is
// `kind: 'skill'` plus `skill: { scope, name }` and NOTHING else — no
// description, no body, no resource count, no token figure: a copy is a
// second author that goes stale silently (M116's rule for the work card,
// reached again). Sessionless, so no cwd and no args. Both fields are the
// panel's whole identity, so a bad scope, a bad name or a missing record
// drops that PANEL by name with its neighbours kept; an absent title stays
// absent; and a pre-M128 file — one with no skill panel in it at all — parses
// with no warning naming a skill.
{
  try {
    const out = L.parseLayout(JSON.stringify({
      workspaces: [{ id: 'w1', name: 'Main', panels: [
        { id: 's1', kind: 'skill', x: 1, y: 2, w: 640, h: 520, z: 3, skill: { scope: 'user', name: 'brainstorming' } },
        { id: 's2', kind: 'skill', x: 0, y: 0, w: 640, h: 520, z: 4, skill: { scope: 'wherever', name: 'brainstorming' } },
        { id: 's3', kind: 'skill', x: 0, y: 0, w: 640, h: 520, z: 5, title: 'skill · tdd', skill: { scope: 'project', name: 'tdd' } },
        { id: 's4', kind: 'skill', x: 0, y: 0, w: 640, h: 520, z: 6 },
        { id: 's5', kind: 'skill', x: 0, y: 0, w: 640, h: 520, z: 7, skill: { scope: 'user', name: '' } },
        { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 8, cwd: '~', args: [] }
      ] }],
      activeWorkspaceId: 'w1'
    }))
    const panels = out.snapshot.workspaces[0].panels
    const named = (id) => out.warnings.some((w) => w.includes(id))
    const s1 = panels.find((p) => p.id === 's1'), s3 = panels.find((p) => p.id === 's3')
    // ABSENT, not malformed: a file written before this milestone has no
    // skill panel and must warn nothing at all.
    const pre = L.parseLayout(JSON.stringify({ workspaces: [{ id: 'w1', name: 'Main', panels: [{ id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }] }], activeWorkspaceId: 'w1' }))
    ok('skill.panel.disk.1 a skill panel round-trips as kind + skill.{scope,name} with no cwd/args and an absent title kept absent; a bad scope, an empty name and a missing record each drop their own panel by name; the neighbours survive; a pre-M128 file warns nothing',
      panels.length === 3 && panels.map((p) => p.id).join(',') === 's1,s3,n1' &&
        s1 && s1.kind === 'skill' && s1.skill && s1.skill.scope === 'user' && s1.skill.name === 'brainstorming' &&
        Object.keys(s1.skill).sort().join(',') === 'name,scope' &&
        !('title' in s1) && !('cwd' in s1) && !('args' in s1) &&
        s3 && s3.title === 'skill · tdd' && s3.skill.scope === 'project' && s3.skill.name === 'tdd' &&
        named('s2') && named('s4') && named('s5') && !named('s1') && !named('s3') &&
        !pre.warnings.some((w) => /skill/i.test(w)),
      JSON.stringify({ ids: panels.map((p) => p.id), s1, warnings: out.warnings, pre: pre.warnings }))
  } catch (e) { ok('skill.panel.disk.1 (threw)', false, String(e)) }
}
// M120 — chat.sandbox.1. The sandbox mark on a chat's record: `sandbox: true`
// round-trips through the ONE parser and `carryChatMarks` carries it beside
// `dispatch`; absent stays absent.
{
  let stored, carried, bare, threw = null
  try {
    const out = L.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [{ id: 'c1', kind: 'chat', x: 0, y: 0, w: 560, h: 360, z: 1, chat: { cwd: '/s/c1', sessionId: 'u-1', sandbox: true } }, { id: 'c2', kind: 'chat', x: 0, y: 0, w: 560, h: 360, z: 2, chat: { cwd: '/w', sessionId: 'u-2' } }], camera: { x: 0, y: 0, scale: 1 } }], activeWorkspaceId: 'w1' }))
    stored = out.snapshot.workspaces[0].panels.map((p) => p.chat)
    carried = L.carryChatMarks({ sandbox: true, dispatch: true })
    bare = L.carryChatMarks({})
  } catch (e) { threw = String(e) }
  ok('chat.sandbox.1 a chat record\'s sandbox mark round-trips, a plain chat gains no key, and carryChatMarks carries sandbox beside dispatch and writes nothing for an absent one',
    threw === null && stored && stored[0].sandbox === true && !('sandbox' in stored[1]) && carried && carried.sandbox === true && carried.dispatch === true && Object.keys(bare).length === 0,
    JSON.stringify({ threw, stored, carried, bare }))
}

// M138 — chat.orchestrator.1. An orchestrator block's chat keeps its PROMPT
// across a relaunch on its record (`orchestrator: string`), the way a
// supervisor keeps its flag: the CLI keeps no record of --append-system-prompt,
// so a resumed spawn without it stops being an orchestrator. A present
// non-string warns and is dropped (the chat kept); absent stays absent;
// `carryChatMarks` carries it beside dispatch/sandbox/routine.
{
  let stored, warnings, carried, bare, threw = null
  try {
    const panel = (id, extra) => ({ id, kind: 'chat', x: 0, y: 0, w: 560, h: 360, z: 1, chat: { cwd: '/w', sessionId: 's-' + id, ...extra } })
    const out = L.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [panel('c1', { orchestrator: 'You run the workers.' }), panel('c2', {}), panel('c3', { orchestrator: 7 })], camera: { x: 0, y: 0, scale: 1 } }] }))
    stored = out.snapshot.workspaces[0].panels.map((p) => p.chat)
    warnings = out.warnings
    carried = L.carryChatMarks({ orchestrator: 'You run the workers.', dispatch: true })
    bare = L.carryChatMarks({})
  } catch (e) { threw = String(e) }
  ok('chat.orchestrator.1 a chat record\'s orchestrator prompt round-trips, a non-string warns and is dropped with the chat kept, absent stays absent, and carryChatMarks carries it',
    threw === null && stored && stored.length === 3 && stored[0].orchestrator === 'You run the workers.' && !('orchestrator' in stored[1]) && !('orchestrator' in stored[2]) &&
      warnings.some((w) => /c3.*orchestrator/.test(w)) && carried && carried.orchestrator === 'You run the workers.' && carried.dispatch === true && Object.keys(bare).length === 0,
    JSON.stringify({ threw, stored, warnings, carried, bare }))
}

// M147 — preset.env.1 / preset.env.2 (backlog #34). A preset and a persisted
// terminal panel carry `env`, a string→string map merged over the login
// environment at spawn (`buildPtyEnv`, which existed; the FIELD did not — the
// schema's own comment called the omission silent). Absent stays absent;
// present-but-malformed (not a record, or a value that is not a string) drops
// the WHOLE map with a warning, never a partial one — one bad value beside
// good ones would spawn an environment nobody wrote. `carry` writes no key
// for an absent map.
{
  const w = []
  const withEnv = L.parsePresets([preset({ env: { FOO: 'bar', PATH_EXTRA: '/opt/x' } })], w)
  const badValue = L.parsePresets([preset({ id: 'u2', env: { FOO: 1 } })], w)
  const notRecord = L.parsePresets([preset({ id: 'u3', env: 'FOO=bar' })], w)
  const absent = L.parsePresets([preset({ id: 'u4' })], [])
  ok('preset.env.1 parsePresets carries a string map as env, drops a malformed map whole with a warning (the preset kept), and writes no env key when absent',
    withEnv.length === 1 && withEnv[0].env && withEnv[0].env.FOO === 'bar' && withEnv[0].env.PATH_EXTRA === '/opt/x' &&
      badValue.length === 1 && !('env' in badValue[0]) && notRecord.length === 1 && !('env' in notRecord[0]) &&
      w.filter((x) => /env/.test(x)).length === 2 && absent.length === 1 && !('env' in absent[0]),
    JSON.stringify({ withEnv: withEnv[0] && withEnv[0].env, warnings: w }))
}
{
  const out = L.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [
    { id: 'e1', x: 0, y: 0, w: 320, h: 200, z: 1, cwd: '~', args: [], env: { FOO: 'bar' } },
    { id: 'e2', x: 0, y: 0, w: 320, h: 200, z: 2, cwd: '~', args: [] },
    { id: 'e3', x: 0, y: 0, w: 320, h: 200, z: 3, cwd: '~', args: [], env: { FOO: 2 } }
  ], camera: { x: 0, y: 0, scale: 1 } }] }))
  const panels = out.snapshot.workspaces[0].panels
  ok('preset.env.2 a terminal panel\'s env round-trips through parseLayout, an absent env stays absent, and a malformed one is dropped whole with a warning while the panel survives',
    panels.length === 3 && panels[0].env && panels[0].env.FOO === 'bar' && !('env' in panels[1]) && !('env' in panels[2]) &&
      out.warnings.some((x) => /e3.*env/.test(x)),
    JSON.stringify({ panels: panels.map((p) => [p.id, p.env]), warnings: out.warnings }))
}

// M122 — search.active.1. THE HANDLER'S SOURCE OF PANELS. `initial()` applies
// `restore.layout` and answers no panels with it off; a search built over it
// went quiet with nothing to say why. The active row of `mergedWorkspaces()`
// carries every panel whatever the setting says — pinned here as the store's
// fact, and both handler sites are read as text for the same call.
{
  let listed = null, viaInitial = null, sites = null, threw = null
  try {
    const dir = mkdtempSync(join(tmpdir(), 'tc layout search-active '))
    const store = L.createLayoutStore({ path: join(dir, 'layout.json') })
    store.save({ panels: [{ id: 'sa1', kind: 'terminal', x: 0, y: 0, w: 10, h: 10, z: 1, cwd: '~', command: '/bin/sh', args: [] }], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null })
    store.setSetting('restore.layout', false)
    listed = (store.mergedWorkspaces().find((w) => w.active) || { panels: [] }).panels.map((p) => p.id)
    viaInitial = store.initial().panels.map((p) => p.id)
    // M278. The sites are FOUND, not named. This pinned `index.ts` by filename
    // until the composition-root split moved the panel handler into
    // `bootstrap/`, and a filename pin fails the same way in both directions:
    // red when the code merely moved, and silent the day a THIRD handler reads
    // the restore-gated `initial()` instead. Walking src/main asserts the rule
    // as written — every site that makes this call makes it on the active row —
    // and the file list is reported so a move is visible rather than guessed at.
    const root = join(__dirname, '..', 'src', 'main')
    const { readdirSync } = require('node:fs')
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : (/\.ts$/.test(e.name) ? [join(d, e.name)] : []))
    sites = walk(root)
      .filter((f) => /mergedWorkspaces\(\)\.find\(\(w\) => w\.active\)/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1))
      .sort()
  } catch (e) { threw = String(e) }
  ok('search.active.1 the active merged row lists the panel with restore.layout off (initial() is the restore-gated read, never the search\'s), and the search handler sites — found by walking src/main, not named — are the ipc door and the panel handler',
    threw === null && Array.isArray(listed) && listed.includes('sa1') && Array.isArray(viaInitial) &&
      Array.isArray(sites) && sites.length === 2 && sites.includes('ipc.ts') && sites.some((f) => f.startsWith('bootstrap/')),
    JSON.stringify({ threw, listed, viaInitial, sites }))
}

// M132 — workflow.1. Three new template node kinds: pool, orchestrator,
//      collect — each an arm on TemplateNode, parsed by parseWorkflowNode and
//      routed through layout-schema:1359's existing unknown-kind arm, which
//      stays exactly as it is for whatever comes after these three.
try {
  const node = (over = {}) => ({ key: 'a', kind: 'terminal', cwd: '~', dx: 0, dy: 0, ...over })
  const pool = (over = {}) => ({ key: 'p', kind: 'pool', cwd: '~', dx: 0, dy: 0, width: 4, list: '/tmp/list.txt', prompt: 'do it', ...over })
  const orch = (over = {}) => ({ key: 'o', kind: 'orchestrator', cwd: '~', dx: 0, dy: 0, prompt: 'lead', ...over })
  const coll = (over = {}) => ({ key: 'c', kind: 'collect', cwd: '~', dx: 0, dy: 0, target: '/tmp/out.txt', ...over })

  const parsed = L.parseLayout(file({ templates: [
    { id: 't1', name: 'workflow', nodes: [pool(), orch(), coll()], edges: [] }
  ] }))
  const t1 = (parsed.snapshot.templates ?? [])[0]
  ok('workflow.1a the three kinds parse', !!t1 && t1.nodes.length === 3 && parsed.warnings.length === 0,
     JSON.stringify({ t1, warnings: parsed.warnings }))

  // A pre-M132 template file (terminal/chat only) loads byte-identical.
  const preM131 = [{ id: 't0', name: 'old', nodes: [node(), node({ key: 'b', kind: 'chat' })], edges: [{ from: 'a', to: 'b', trigger: 'exit-ok' }] }]
  // The expectation is written BY HAND from the pre-M132 parser's own output
  // shape (833cec7^ `parseTemplates`: id, name, [description], nodes, edges;
  // a node as key, kind, cwd, dx, dy and then only the optional fields it
  // carried). Comparing the new parser against itself — which this check did
  // until the fix wave — proves nothing at all: both sides move together.
  const PRE_M131_EXPECTED = '[{"id":"t0","name":"old","nodes":[{"key":"a","kind":"terminal","cwd":"~","dx":0,"dy":0},{"key":"b","kind":"chat","cwd":"~","dx":0,"dy":0}],"edges":[{"from":"a","to":"b","trigger":"exit-ok"}]}]'
  const w = []
  const after0 = L.parseTemplates(preM131, w)
  ok('workflow.1b a pre-M132 template file loads UNTOUCHED',
     JSON.stringify(after0) === PRE_M131_EXPECTED && w.length === 0,
     `every existing template must survive this change silently — ${JSON.stringify(after0)}`)

  // An unknown kind drops the node AND its edges naming it; the template stays.
  const w2 = []
  const after = L.parseTemplates([
    { id: 't2', name: 'ghost', nodes: [node(), node({ key: 'x', kind: 'nonsense' })], edges: [{ from: 'a', to: 'x', trigger: 'exit' }] }
  ], w2)
  ok("workflow.1c an unknown kind drops the node AND its edges, the template kept",
     after.length === 1 && after[0].nodes.length === 1 && after[0].edges.length === 0 &&
       w2.some((x) => /x/.test(x) && /kind/.test(x)) && w2.some((x) => /edge/.test(x)),
     JSON.stringify({ after, w2 }))

  // A pool width below 1 is dropped, never coerced to 1.
  const w3 = []
  const droppedWidth = L.parseTemplates([{ id: 't3', name: 'bad width', nodes: [node(), pool({ width: 0 })], edges: [] }], w3)
  ok('workflow.1d a pool width below 1 is dropped, never coerced to 1',
     droppedWidth.length === 1 && droppedWidth[0].nodes.length === 1 && droppedWidth[0].nodes[0].kind === 'terminal' &&
       w3.some((x) => /width/.test(x)),
     JSON.stringify({ droppedWidth, w3 }))

  ok('workflow.1e blockCount counts nodes, matching the header readout', L.blockCount(t1) === 3, JSON.stringify(t1))

  // Fix wave — workflow.1f. A PRESENT-but-not-a-string cwd is dropped by
  // name, matching the terminal arm's own `isStr(n.cwd)` rule; it is never
  // coerced with String(), which turned `{}` into the directory
  // "[object Object]" and 42 into "42" and said nothing.
  const w4 = []
  const badCwd = L.parseTemplates([{ id: 't4', name: 'bad cwd', nodes: [node(), pool({ key: 'p', cwd: 42 })], edges: [] }], w4)
  ok('workflow.1f a present non-string cwd on a workflow node is dropped by name, never coerced',
     badCwd.length === 1 && badCwd[0].nodes.length === 1 && badCwd[0].nodes[0].kind === 'terminal' &&
       w4.some((x) => /cwd/.test(x)),
     JSON.stringify({ badCwd, w4 }))
} catch (e) {
  ok('workflow.1 (threw)', false, String(e && e.stack || e))
}

// M133 — workflow.panel.1a–d, the PURE half of the workflow panel: the
//      diagram as a projection of the record, the header's block count, the
//      Runs filter, and a trigger round-tripping through watch-trigger.ts.
//      1e (Run reaching M80's instantiation exactly once) needs the real
//      renderer and lives in verify-panels.cjs.
//
//      Every check here is wrapped: a THROWN check aborts the file and every
//      check below it never runs, so its silence would read as green.
try {
  const pool = (over = {}) => ({ key: 'p', kind: 'pool', cwd: '~', dx: -260, dy: 0, width: 4, list: '/tmp/list.txt', prompt: 'do it', ...over })
  const orch = (over = {}) => ({ key: 'o', kind: 'orchestrator', cwd: '~', dx: 0, dy: -140, prompt: 'lead', ...over })
  const coll = (over = {}) => ({ key: 'c', kind: 'collect', cwd: '~', dx: 260, dy: 0, target: '/tmp/out.txt', ...over })
  const chat = { key: 'r', kind: 'chat', cwd: '~', dx: 0, dy: 180, message: 'review' }
  const t = {
    id: 'tw', name: 'a workflow', nodes: [pool(), orch(), coll(), chat],
    edges: [{ from: 'p', to: 'c', trigger: 'exit-ok' }, { from: 'o', to: 'r', trigger: 'idle' }]
  }

  const d = L.buildDiagram(t)
  ok('workflow.panel.1a the diagram matches the RECORD, not a second layout',
     d.blocks.map((b) => b.key).join(',') === t.nodes.map((n) => n.key).join(',') &&
       d.edges.map((e) => `${e.from}>${e.to}`).join(',') === 'p>c,o>r' &&
       d.edges.every((e, i) => e.trigger === ['exit-ok', 'idle'][i]) &&
       d.blocks.every((b) => !/›/.test(b.sublabel)),
     'a projection — the live canvas is the editor and the template is the truth')

  ok('workflow.panel.1b the header block count equals blockCount()',
     d.blocks.length === L.blockCount(t) && d.width > 0 && d.height > 0,
     JSON.stringify({ blocks: d.blocks.length, count: L.blockCount(t) }))

  const runs = [
    { id: 'r1', name: 'run 1', panelIds: ['n1'], edges: [], startedAt: 1, entries: [], templateId: 'tw' },
    { id: 'r2', name: 'run 2', panelIds: ['n2'], edges: [], startedAt: 2, entries: [] },
    { id: 'r3', name: 'run 3', panelIds: ['n3'], edges: [], startedAt: 3, entries: [], templateId: 'other' }
  ]
  const mine = L.runsForTemplate(runs, 'tw')
  ok('workflow.panel.1c Runs shows only THIS template runs',
     mine.length === 1 && mine.every((r) => r.templateId === 'tw'),
     JSON.stringify(mine.map((r) => r.id)))

  // A trigger is a WATCHER's, unchanged: the same union, the same words, and
  // it survives the layout's own round trip. Not a second scheduler.
  const watch = L.workflowWatch('tw', '~', { kind: 'git-ref', root: '/tmp/repo' })
  const roundW = []
  const round = L.parseLayout(L.serialiseLayout(L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [{ id: 'p1', x: 0, y: 0, w: 460, h: 220, z: 1, kind: 'watcher', watch }], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }]
  })).snapshot), roundW)
  const saved = round.snapshot.workspaces[0].panels[0]
  const savedTrigger = saved && saved.watch && saved.watch.trigger
  ok('workflow.panel.1d a trigger round-trips through watch-trigger.ts unchanged',
     !!savedTrigger && savedTrigger.kind === 'git-ref' && savedTrigger.root === '/tmp/repo' &&
       saved.watch.templateId === 'tw' && L.triggerWord(savedTrigger) === 'when the branch moves',
     `a workflow trigger is a watcher; not a second scheduler — ${JSON.stringify({ saved, roundW })}`)
} catch (e) {
  ok('workflow.panel.1 (threw)', false, String(e && e.stack || e))
}

// M137 — runs.templateId.1. `parseRuns` dropped a malformed `templateId`
// SILENTLY, where its sibling `parseWatch` warns for the same field: a run
// whose workflow mark was a number on disk lost its attribution with no line
// anywhere, and the Runs tab's "unattributed" arm then read as truth about
// the run rather than about the file. The record rules: absent warns
// nothing, present-but-malformed warns and is dropped, the run kept.
{
  const base = (templateId) => JSON.stringify({ version: 1, workspaces: [{ id: 'w1', panels: [{ id: 'p1', x: 0, y: 0, w: 320, h: 200, z: 1, cwd: '~', args: [] }], camera: { x: 0, y: 0, scale: 1 },
    runs: [{ id: 'r1', name: 'a run', panelIds: ['p1'], startedAt: 1, entries: [], ...(templateId === undefined ? {} : { templateId }) }] }] })
  const absent = L.parseLayout(base(undefined))
  const bad = L.parseLayout(base(5))
  const good = L.parseLayout(base('t1'))
  const runsOf = (r) => (r.snapshot.workspaces[0] || { runs: [] }).runs
  ok('runs.templateId.1 a malformed templateId on a run warns and is dropped with the run kept; absent warns nothing; a string is carried',
    !absent.warnings.some((w) => /templateId/.test(w)) && runsOf(absent).length === 1 && !('templateId' in runsOf(absent)[0]) &&
      bad.warnings.some((w) => /run r1.*templateId/.test(w)) && runsOf(bad).length === 1 && !('templateId' in runsOf(bad)[0]) &&
      runsOf(good).length === 1 && runsOf(good)[0].templateId === 't1',
    JSON.stringify({ absent: absent.warnings, bad: bad.warnings, good: runsOf(good)[0] }))
}

// M149 — preset.env.3 (the Act II critic). The FILE's env keys obey the
// SHEET's rule: a key with whitespace or `=` drops the map whole with a
// warning — `parseEnvLines` refused such a line, and `parseEnvMap` had let a
// hand-edited `"A B": "1"` through to the process unwarned.
{
  const w = []
  const spaced = L.parseEnvMap({ 'A B': '1', OK: '2' }, 'p', w)
  const eq = L.parseEnvMap({ 'A=B': '1' }, 'p', w)
  const fine = L.parseEnvMap({ A_B: '1' }, 'p', w)
  ok('preset.env.3 parseEnvMap drops a map whole for a key with whitespace or `=`, with a warning each, and keeps a plain key',
    spaced === undefined && eq === undefined && fine !== undefined && fine.A_B === '1' && w.length === 2 && w.every((x) => /malformed env map/.test(x)),
    JSON.stringify({ spaced, eq, fine, w }))
}

// M181 — starter.1–.3, image.record.1. THE STARTER RECORD and THE IMAGE
// PANEL on disk. Every check below is guarded on the module's presence so a
// missing `src/shared/starter.ts` fails BY NAME rather than throwing and
// taking every later check with it (the verify-suites rule).
const STARTER_MISSING = 'src/shared/starter.ts does not exist'
const hasStarter = typeof L.parseStarter === 'function' && typeof L.starterKeysToApply === 'function' && typeof L.carryStarter === 'function' && Array.isArray(L.STARTER_OBJECTS)

// starter.1 — parseStarter's arms: absent is every pre-M181 file and warns
// NOTHING; a non-object, a bad version or a non-array keys warns ONCE and is
// dropped; a non-string key costs that entry, never the record; the result
// is a fresh copy (mutating it must not reach the input — a shared array
// would let a later `keys.push` rewrite the record the parser was handed).
{
  if (!hasStarter) ok('starter.1 parseStarter: absent warns nothing; a non-object / bad version / non-array keys warns once and is dropped; a non-string key is dropped with the rest kept; the result is a copy', false, STARTER_MISSING)
  else {
    const w0 = []; const absent = L.parseStarter(undefined, w0)
    const bad = ['a string', 7, null, [], { version: 'x', keys: [] }, { version: -1, keys: [] }, { version: 1.5, keys: [] }, { version: 1, keys: 'agent' }, { version: 1 }]
    const badOut = bad.map((raw) => { const w = []; return { r: L.parseStarter(raw, w), n: w.length } })
    const input = { version: 1, keys: ['agent', 3, 'terminal', null, 'note'] }
    const w1 = []; const mixed = L.parseStarter(input, w1)
    // Read the parsed values BEFORE the mutation below: the copy test writes
    // into the result on purpose, and the first cut asserted the pre-mutation
    // values after it (the M181 green run found the check, not the parser).
    const parsedVersion = mixed?.version
    const parsedKeys = mixed?.keys.join(',')
    let copy = false
    if (mixed) { mixed.keys.push('zzz'); mixed.version = 99; copy = input.keys.length === 5 && input.version === 1 && !input.keys.includes('zzz') }
    ok('starter.1 parseStarter: absent warns nothing; a non-object / bad version / non-array keys warns once and is dropped; a non-string key is dropped with the rest kept; the result is a copy',
      absent === undefined && w0.length === 0 &&
        badOut.every((o) => o.r === undefined && o.n === 1) &&
        mixed !== undefined && parsedVersion === 1 && parsedKeys === 'agent,terminal,note' && copy,
      JSON.stringify({ absent, w0, badOut, mixed, w1, copy }))
  }
}

// starter.2 — the workspace round trip. A pre-M181 file has no `starter`
// key, and it must have none after a parse AND after serialiseLayout: a
// written `"starter":{"version":1,"keys":[]}` would be a record claiming the
// starter was applied to a canvas it never touched. A present record
// survives both directions; a malformed one drops by name with the
// workspace kept.
{
  const ws = (over) => ({ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [], ...over })
  const doc = (w) => JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [w] })
  const plain = L.parseLayout(doc(ws({})))
  const pw = plain.snapshot.workspaces[0]
  const plainText = L.serialiseLayout({ ...plain.snapshot })
  const present = L.parseLayout(doc(ws({ starter: { version: 1, keys: ['agent', 'note'] } })))
  const prw = present.snapshot.workspaces[0]
  const again = L.parseLayout(L.serialiseLayout({ ...present.snapshot })).snapshot.workspaces[0]
  const mal = L.parseLayout(doc(ws({ starter: { version: 'one', keys: [] } })))
  const mw = mal.snapshot.workspaces[0]
  ok('starter.2 a workspace with no starter has none after parse and none in serialiseLayout\'s text; a present record survives parse → serialise → parse; a malformed one drops by name with the workspace kept',
    hasStarter && pw !== undefined && !('starter' in pw) && !/"starter"/.test(plainText) && plain.warnings.length === 0 &&
      prw !== undefined && prw.starter !== undefined && prw.starter.version === 1 && prw.starter.keys.join(',') === 'agent,note' && present.warnings.length === 0 &&
      again !== undefined && again.starter !== undefined && again.starter.keys.join(',') === 'agent,note' &&
      mw !== undefined && !('starter' in mw) && mal.warnings.some((m) => /starter/.test(m)),
    hasStarter ? JSON.stringify({ pw: Object.keys(pw || {}), plainHasKey: /"starter"/.test(plainText), prw: prw && prw.starter, again: again && again.starter, mw: Object.keys(mw || {}), warnings: [plain.warnings, present.warnings, mal.warnings] }) : STARTER_MISSING)
}

// starter.3 — starterKeysToApply is `agent` first then every manifest key,
// MINUS what the record already holds (a key applied once is never minted
// again, whether its object is still there or was closed on purpose); an
// unknown key in the record is ignored. carryStarter keeps absent ABSENT —
// a spread would write `starter: undefined`, which survives IPC and reads as
// present at every `in` test — and returns a copy when present.
{
  if (!hasStarter) ok('starter.3 starterKeysToApply: agent first then the manifest keys minus the record\'s, all five for no record, [] for a full record, an unknown key ignored; carryStarter keeps absent absent and copies a present record', false, STARTER_MISSING)
  else {
    const all = L.starterKeysToApply(undefined)
    const manifestKeys = L.STARTER_OBJECTS.map((o) => o.key)
    const full = L.starterKeysToApply({ version: 1, keys: [L.AGENT_KEY, ...manifestKeys] })
    const some = L.starterKeysToApply({ version: 1, keys: [L.AGENT_KEY, 'note', 'not-a-key'] })
    const empty = L.starterKeysToApply({ version: 1, keys: [] })
    const carriedAbsent = L.carryStarter({})
    const rec = { version: 1, keys: ['agent'] }
    const carried = L.carryStarter({ starter: rec })
    ok('starter.3 starterKeysToApply: agent first then the manifest keys minus the record\'s, all five for no record, [] for a full record, an unknown key ignored; carryStarter keeps absent absent and copies a present record',
      L.AGENT_KEY === 'agent' && all.length === 5 && all[0] === 'agent' && all.slice(1).join(',') === manifestKeys.join(',') &&
        full.length === 0 && empty.join(',') === all.join(',') &&
        some.join(',') === manifestKeys.filter((k) => k !== 'note').join(',') &&
        !('starter' in carriedAbsent) &&
        carried.starter !== undefined && carried.starter !== rec && carried.starter.keys !== rec.keys && carried.starter.keys.join(',') === 'agent' && carried.starter.version === 1,
      JSON.stringify({ all, full, some, empty, carriedAbsent: Object.keys(carriedAbsent), carried }))
  }
}

// image.record.1 — the fifteenth kind on disk: `kind: 'image'` with an
// ABSOLUTE `image.path` survives; a missing `image`, a non-string path or a
// RELATIVE path drops the PANEL by name (a picture panel naming no file
// would sit on the canvas saying `missing` about a file the record never
// named; a relative path names a different file from every cwd), and the
// other panels in the same array survive.
{
  const img = (id, image) => ({ id, kind: 'image', x: 0, y: 0, w: 400, h: 300, z: 1, ...(image === undefined ? {} : { image }) })
  const out = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: [
    { id: 'n1', x: 0, y: 0, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [] },
    img('i1', { path: '/tmp/welcome.png' }),
    img('i2'),
    img('i3', { path: 7 }),
    img('i4', { path: 'relative/welcome.png' }),
    { id: 'n2', x: 0, y: 0, w: 520, h: 340, z: 2, cwd: '~', command: 'sh', args: [] }
  ] }] }))
  const ps = out.snapshot.workspaces[0].panels
  const ids = ps.map((p) => p.id).join(',')
  const i1 = ps.find((p) => p.id === 'i1')
  const again = L.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w', workspaces: [{ id: 'w', name: 'w', camera: { x: 0, y: 0, scale: 1 }, panels: ps }] })).snapshot.workspaces[0].panels
  ok('image.record.1 an image panel with an absolute image.path survives parse and re-parse; a missing image, a non-string path or a relative path drops that panel by id with the rest kept',
    ids === 'n1,i1,n2' && i1 !== undefined && i1.kind === 'image' && i1.image.path === '/tmp/welcome.png' &&
      ['i2', 'i3', 'i4'].every((id) => out.warnings.some((m) => m.includes(id))) &&
      again.map((p) => p.id).join(',') === 'n1,i1,n2' && again[1].image.path === '/tmp/welcome.png',
    JSON.stringify({ ids, i1, warnings: out.warnings }))
}

// M182 — edit.1–.6, store.edit.1. TEMPLATE EDITING as pure verbs over the
// record (`src/shared/template-edit.ts`), the record's `revision`/`nextKey`
// fields, a panel's `templateBinding`, and the store's compare-and-swap
// save. The edit.1–.4 checks are guarded on the module's presence so a
// missing module fails BY NAME rather than throwing and taking every later
// check with it (the verify-suites rule). Every verb answers an EditResult
// (`ok` with a fresh template, or `refused` with a reason) and never throws;
// `call` below folds an unexpected throw into a refusal-shaped object so
// the assertion still reads.
const EDIT_MISSING = 'src/shared/template-edit.ts does not exist'
const hasEdit = ['nextNodeKey', 'addNode', 'moveNode', 'configureNode', 'removeNode', 'addEdge', 'removeEdge'].every((f) => typeof L[f] === 'function')
const call = (f, ...args) => { try { return L[f](...args) } catch (e) { return { kind: 'threw', reason: e.message } } }
const refusedNaming = (r, word) => Boolean(r) && r.kind === 'refused' && typeof r.reason === 'string' && r.reason.includes(word)
const tplNode = (key, over = {}) => ({ key, kind: 'terminal', cwd: '~', dx: 0, dy: 0, ...over })
const tpl = (nodes, edges = [], over = {}) => ({ id: 'e1', name: 'edit me', nodes, edges, ...over })

// edit.1 — nextNodeKey and addNode. A key is `n<N>` where N is one past the
// highest key EVER minted: derived from the highest `n<digits>` present when
// a pre-M182 record carries no `nextKey`, read from `nextKey` when it does;
// a removed node's key is never reused (an edge or a binding saved elsewhere
// could still name it). addNode never mutates its input, refuses a
// terminal/chat with no cwd naming `cwd`, and a pool whose width is outside
// 1..POOL_WIDTH_MAX or not an integer naming `width`.
{
  const ID = 'edit.1 nextNodeKey is one past the highest n<digits> key (or nextKey when present, n1 for none); addNode mints it, advances nextKey, never reuses a removed key, leaves the input untouched, and refuses an empty cwd and a bad pool width by name'
  if (!hasEdit) ok(ID, false, EDIT_MISSING)
  else {
    const base = tpl([tplNode('n1'), tplNode('n3', { kind: 'chat' }), tplNode('custom')])
    const k0 = call('nextNodeKey', base)
    const k1 = call('nextNodeKey', tpl([tplNode('n1')], [], { nextKey: 7 }))
    const k2 = call('nextNodeKey', tpl([]))
    const before = JSON.stringify(base)
    const added = call('addNode', base, { kind: 'chat', cwd: '/repo', dx: 10, dy: 20, title: 'reviewer' })
    const untouched = JSON.stringify(base) === before
    const addedKey = added.kind === 'ok' ? added.template.nodes[added.template.nodes.length - 1].key : undefined
    const removed = added.kind === 'ok' ? call('removeNode', added.template, addedKey) : added
    const again = removed.kind === 'ok' ? call('addNode', removed.template, { kind: 'terminal', cwd: '/repo', dx: 0, dy: 0 }) : removed
    const againKey = again.kind === 'ok' ? again.template.nodes[again.template.nodes.length - 1].key : undefined
    const noCwd = call('addNode', base, { kind: 'chat', cwd: '', dx: 0, dy: 0 })
    const wide = call('addNode', base, { kind: 'pool', width: (L.POOL_WIDTH_MAX ?? 24) + 1, list: '/l', prompt: 'p', cwd: '/repo', dx: 0, dy: 0 })
    const zero = call('addNode', base, { kind: 'pool', width: 0, list: '/l', prompt: 'p', cwd: '/repo', dx: 0, dy: 0 })
    const frac = call('addNode', base, { kind: 'pool', width: 1.5, list: '/l', prompt: 'p', cwd: '/repo', dx: 0, dy: 0 })
    const pool = call('addNode', base, { kind: 'pool', width: 3, list: '/l', prompt: 'p', cwd: '/repo', dx: 0, dy: 0 })
    ok(ID,
      k0 === 'n4' && k1 === 'n7' && k2 === 'n1' &&
        added.kind === 'ok' && added.template !== base && added.template.nodes.length === 4 && addedKey === 'n4' && added.template.nextKey === 5 && untouched &&
        removed.kind === 'ok' && removed.template.nodes.length === 3 &&
        again.kind === 'ok' && againKey === 'n5' && again.template.nextKey === 6 &&
        refusedNaming(noCwd, 'cwd') && refusedNaming(wide, 'width') && refusedNaming(zero, 'width') && refusedNaming(frac, 'width') &&
        pool.kind === 'ok' && pool.template.nodes[3].kind === 'pool' && pool.template.nodes[3].width === 3,
      JSON.stringify({ k0, k1, k2, added, untouched, addedKey, againKey, again, noCwd, wide, zero, frac, pool }))
  }
}

// edit.2 — moveNode sets dx/dy as ABSOLUTE offsets (a second move replaces,
// never adds), refuses a key the template does not hold naming the key,
// refuses a non-finite number, and leaves the input untouched.
{
  const ID = 'edit.2 moveNode sets absolute dx/dy (a second move replaces), refuses a missing key by name and a non-finite offset, and leaves the input untouched'
  if (!hasEdit) ok(ID, false, EDIT_MISSING)
  else {
    const base = tpl([tplNode('n1'), tplNode('n2', { dx: 5, dy: 5 })])
    const before = JSON.stringify(base)
    const once = call('moveNode', base, 'n2', 100, -40)
    const twice = once.kind === 'ok' ? call('moveNode', once.template, 'n2', 10, 10) : once
    const n2 = (r) => (r.kind === 'ok' ? r.template.nodes.find((n) => n.key === 'n2') : undefined)
    const other = once.kind === 'ok' ? once.template.nodes.find((n) => n.key === 'n1') : undefined
    const missing = call('moveNode', base, 'n9', 0, 0)
    const nan = call('moveNode', base, 'n1', NaN, 0)
    const inf = call('moveNode', base, 'n1', 0, Infinity)
    ok(ID,
      once.kind === 'ok' && n2(once).dx === 100 && n2(once).dy === -40 && other.dx === 0 && other.dy === 0 &&
        twice.kind === 'ok' && n2(twice).dx === 10 && n2(twice).dy === 10 &&
        refusedNaming(missing, 'n9') && nan.kind === 'refused' && inf.kind === 'refused' &&
        JSON.stringify(base) === before,
      JSON.stringify({ once, twice, missing, nan, inf }))
  }
}

// edit.3 — configureNode patches ONLY the fields the node's kind has:
// terminal/chat `cwd`/`title`/`command`/`args`/`presetId`/`message`; pool
// `width`/`list`/`prompt`/`cwd`; orchestrator `prompt`/`cwd`; collect
// `target`/`cwd`. A field the kind does not have and a value of the wrong
// type are each refused NAMING the field; `kind` and `key` are never
// patchable; `width` is re-validated as addNode does and a terminal/chat
// `cwd` may not become empty.
{
  const ID = 'edit.3 configureNode patches the kind\'s own fields only; an unknown field, a wrong type, `kind` and `key` are refused naming the field; width and a terminal cwd are re-validated'
  if (!hasEdit) ok(ID, false, EDIT_MISSING)
  else {
    const base = tpl([
      tplNode('n1'), tplNode('n2', { kind: 'chat' }),
      { key: 'n3', kind: 'pool', width: 2, list: '/l', prompt: 'p', cwd: '/r', dx: 0, dy: 0 },
      { key: 'n4', kind: 'orchestrator', prompt: 'o', cwd: '/r', dx: 0, dy: 0 },
      { key: 'n5', kind: 'collect', target: 'n3', cwd: '/r', dx: 0, dy: 0 }
    ])
    const find = (r, key) => (r.kind === 'ok' ? r.template.nodes.find((n) => n.key === key) : undefined)
    const term = call('configureNode', base, 'n1', { cwd: '/x', title: 'T', command: '/bin/sh', args: ['-lc', 'ls'], presetId: 'ps', message: 'hi' })
    const t = find(term, 'n1')
    const termOk = term.kind === 'ok' && t.cwd === '/x' && t.title === 'T' && t.command === '/bin/sh' && t.args.join(' ') === '-lc ls' && t.presetId === 'ps' && t.message === 'hi' && t.kind === 'terminal' && t.key === 'n1' && t.dx === 0
    const chat = call('configureNode', base, 'n2', { message: 'first' })
    const chatOk = chat.kind === 'ok' && find(chat, 'n2').message === 'first'
    const termWidth = call('configureNode', base, 'n1', { width: 3 })
    const termTitleNum = call('configureNode', base, 'n1', { title: 7 })
    const termArgsMixed = call('configureNode', base, 'n1', { args: ['a', 1] })
    const kind = call('configureNode', base, 'n1', { kind: 'chat' })
    const key = call('configureNode', base, 'n1', { key: 'n9' })
    const emptyCwd = call('configureNode', base, 'n2', { cwd: '' })
    const pool = call('configureNode', base, 'n3', { width: 4, list: '/m', prompt: 'q', cwd: '/s' })
    const p = find(pool, 'n3')
    const poolOk = pool.kind === 'ok' && p.width === 4 && p.list === '/m' && p.prompt === 'q' && p.cwd === '/s'
    const poolWide = call('configureNode', base, 'n3', { width: (L.POOL_WIDTH_MAX ?? 24) + 1 })
    const poolFrac = call('configureNode', base, 'n3', { width: 2.5 })
    const poolTitle = call('configureNode', base, 'n3', { title: 'x' })
    const orch = call('configureNode', base, 'n4', { prompt: 'new', cwd: '/o' })
    const orchOk = orch.kind === 'ok' && find(orch, 'n4').prompt === 'new' && find(orch, 'n4').cwd === '/o'
    const orchList = call('configureNode', base, 'n4', { list: '/l' })
    const coll = call('configureNode', base, 'n5', { target: '/out.md' })
    const collOk = coll.kind === 'ok' && find(coll, 'n5').target === '/out.md'
    const collPrompt = call('configureNode', base, 'n5', { prompt: 'p' })
    const missing = call('configureNode', base, 'n9', { title: 'x' })
    ok(ID,
      termOk && chatOk &&
        refusedNaming(termWidth, 'width') && refusedNaming(termTitleNum, 'title') && refusedNaming(termArgsMixed, 'args') &&
        refusedNaming(kind, 'kind') && refusedNaming(key, 'key') && refusedNaming(emptyCwd, 'cwd') &&
        poolOk && refusedNaming(poolWide, 'width') && refusedNaming(poolFrac, 'width') && refusedNaming(poolTitle, 'title') &&
        orchOk && refusedNaming(orchList, 'list') &&
        collOk && refusedNaming(collPrompt, 'prompt') &&
        refusedNaming(missing, 'n9'),
      JSON.stringify({ term, chat, termWidth, termTitleNum, termArgsMixed, kind, key, emptyCwd, pool, poolWide, poolFrac, poolTitle, orch, orchList, coll, collPrompt, missing }))
  }
}

// edit.4 — removeNode takes every edge naming the node with it (an edge
// with one end missing is a broken template, parseTemplates' own rule);
// addEdge refuses a missing end naming it, a self-edge, a duplicate pair
// under any trigger, and an edge that would close a directed CYCLE with the
// word `cycle` (a 3-node chain a→b→c, closed by c→a) — the same refusal
// `setLinkAutomation` makes on the live canvas; a forward edge a→c is
// appended; removeEdge drops it and refuses one that is not there.
{
  const ID = 'edit.4 removeNode drops the node\'s edges; addEdge refuses a missing end by name, a self-edge, a duplicate pair and a cycle (naming `cycle`), and appends an acyclic edge; removeEdge drops a present edge and refuses a missing one'
  if (!hasEdit) ok(ID, false, EDIT_MISSING)
  else {
    const chain = tpl([tplNode('a'), tplNode('b'), tplNode('c')], [{ from: 'a', to: 'b', trigger: 'exit' }, { from: 'b', to: 'c', trigger: 'idle' }])
    const before = JSON.stringify(chain)
    const gone = call('removeNode', chain, 'b')
    const goneOk = gone.kind === 'ok' && gone.template.nodes.map((n) => n.key).join(',') === 'a,c' && gone.template.edges.length === 0
    const missingNode = call('removeNode', chain, 'zz')
    const badFrom = call('addEdge', chain, 'zz', 'a', 'exit')
    const badTo = call('addEdge', chain, 'a', 'yy', 'exit')
    const self = call('addEdge', chain, 'a', 'a', 'exit')
    const dup = call('addEdge', chain, 'a', 'b', 'always')
    const cycle = call('addEdge', chain, 'c', 'a', 'exit-ok')
    const forward = call('addEdge', chain, 'a', 'c', 'exit-ok')
    const forwardOk = forward.kind === 'ok' && forward.template.edges.length === 3 && forward.template.edges[2].from === 'a' && forward.template.edges[2].to === 'c' && forward.template.edges[2].trigger === 'exit-ok'
    const dropped = forward.kind === 'ok' ? call('removeEdge', forward.template, 'a', 'c') : forward
    const droppedOk = dropped.kind === 'ok' && dropped.template.edges.length === 2 && !dropped.template.edges.some((e) => e.from === 'a' && e.to === 'c')
    const missingEdge = call('removeEdge', chain, 'c', 'a')
    ok(ID,
      goneOk && refusedNaming(missingNode, 'zz') &&
        refusedNaming(badFrom, 'zz') && refusedNaming(badTo, 'yy') && self.kind === 'refused' && dup.kind === 'refused' &&
        refusedNaming(cycle, 'cycle') && forwardOk && droppedOk && missingEdge.kind === 'refused' &&
        JSON.stringify(chain) === before,
      JSON.stringify({ gone, missingNode, badFrom, badTo, self, dup, cycle, forward, dropped, missingEdge }))
  }
}

// edit.5 — the record's two new fields through parseTemplates: `revision`
// and `nextKey` ABSENT stay absent (a pre-M182 file must not read back as
// `revision: 0` — that is a claim about a save that never happened; the
// store's compare-and-swap treats absent as 0 on its own); a present
// integer ≥ 0 is carried; a non-integer, negative or non-number value drops
// THAT template with a warning naming its id, the rest kept.
{
  const node = (key = 'a') => ({ key, kind: 'terminal', cwd: '~', dx: 0, dy: 0 })
  const t = (id, over = {}) => ({ id, name: id, nodes: [node()], edges: [], ...over })
  const r = L.parseLayout(file({ templates: [
    t('plain'),
    t('rev', { revision: 3, nextKey: 5 }),
    t('zero', { revision: 0, nextKey: 1 }),
    t('frac', { revision: 1.5 }),
    t('neg', { revision: -1 }),
    t('revstr', { revision: '2' }),
    t('nkfrac', { nextKey: 2.5 }),
    t('nkneg', { nextKey: -3 }),
    t('nkstr', { nextKey: 'n4' }),
    t('last')
  ] }))
  const kept = r.snapshot.templates ?? []
  const byId = (id) => kept.find((x) => x.id === id)
  const plain = byId('plain'), rev = byId('rev'), zero = byId('zero')
  const dropped = ['frac', 'neg', 'revstr', 'nkfrac', 'nkneg', 'nkstr']
  ok('edit.5 parseTemplates: revision and nextKey absent stay absent; integers ≥ 0 are carried; a non-integer, negative or non-number value drops that template by id with the rest kept',
    kept.map((x) => x.id).join(',') === 'plain,rev,zero,last' &&
      plain !== undefined && !('revision' in plain) && !('nextKey' in plain) &&
      rev !== undefined && rev.revision === 3 && rev.nextKey === 5 &&
      zero !== undefined && zero.revision === 0 && zero.nextKey === 1 &&
      dropped.every((id) => byId(id) === undefined && r.warnings.some((m) => m.includes(id))),
    JSON.stringify({ ids: kept.map((x) => x.id), plain, rev, zero, warnings: r.warnings }))
}

// edit.6 — a panel's `templateBinding` ({ templateId, key }, both non-empty
// strings) on disk and through the renderer's copies: parseLayout keeps a
// good one, DROPS only the binding for a malformed one (a missing key, an
// empty string, a non-object, a non-string) with a warning naming the PANEL
// id — the panel survives — and keeps absent absent; carryMarks carries it
// as a COPY and keeps absent absent (`'templateBinding' in carryMarks(p)`
// is false — a spread would write `templateBinding: undefined`, which
// survives IPC and reads as present at every `in` test); fromPanels/
// toPanels round-trip it, copying rather than sharing the object.
{
  const p = (id, over = {}) => ({ id, x: 0, y: 0, w: 520, h: 340, z: 1, cwd: '~', command: 'sh', args: [], ...over })
  const good = { templateId: 't1', key: 'n2' }
  const r = L.parseLayout(file({ workspaces: [{ id: 'w1', name: 'Canvas', camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null, panels: [
    p('b0'),
    p('b1', { templateBinding: good }),
    p('b2', { templateBinding: { templateId: 't1' } }),
    p('b3', { templateBinding: { templateId: '', key: 'n1' } }),
    p('b4', { templateBinding: 'n1' }),
    p('b5', { templateBinding: { templateId: 't1', key: 4 } })
  ] }] }))
  const ps = active(r.snapshot).panels
  const byId = (id) => ps.find((x) => x.id === id)
  const parseOk = ps.map((x) => x.id).join(',') === 'b0,b1,b2,b3,b4,b5' &&
    !('templateBinding' in byId('b0')) &&
    byId('b1').templateBinding !== undefined && byId('b1').templateBinding.templateId === 't1' && byId('b1').templateBinding.key === 'n2' &&
    ['b2', 'b3', 'b4', 'b5'].every((id) => !('templateBinding' in byId(id)) && r.warnings.some((m) => m.includes(id)))
  // carryMarks over a live Panel.
  const live = L.makePanel('live', { x: 0, y: 0 }, 1)
  const bare = L.carryMarks(live)
  const bound = { ...live, templateBinding: { templateId: 't1', key: 'n3' } }
  const carried = L.carryMarks(bound)
  const carryOk = !('templateBinding' in bare) &&
    carried.templateBinding !== undefined && carried.templateBinding !== bound.templateBinding &&
    carried.templateBinding.templateId === 't1' && carried.templateBinding.key === 'n3'
  // The adapter's two directions.
  const up = L.toPanels([p('a0'), p('a1', { templateBinding: good })])
  const down = L.fromPanels(up)
  const adaptOk = up.length === 2 && !('templateBinding' in up[0]) &&
    up[1].templateBinding !== undefined && up[1].templateBinding.templateId === 't1' && up[1].templateBinding.key === 'n2' && up[1].templateBinding !== good &&
    !('templateBinding' in down[0]) && down[1].templateBinding !== undefined && down[1].templateBinding.templateId === 't1' && down[1].templateBinding.key === 'n2'
  ok('edit.6 templateBinding: parseLayout keeps a good one, drops only a malformed one with a warning naming the panel (the panel kept), keeps absent absent; carryMarks copies it and keeps absent absent; toPanels/fromPanels round-trip it',
    parseOk && carryOk && adaptOk,
    JSON.stringify({ parseOk, ids: ps.map((x) => x.id), b1: byId('b1') && byId('b1').templateBinding, b2keys: Object.keys(byId('b2') || {}), warnings: r.warnings, carryOk, bare: Object.keys(bare), carried, adaptOk, up1: up[1] && up[1].templateBinding, down1: down[1] && down[1].templateBinding }))
}

// store.edit.1 — saveTemplate's compare-and-swap over the REAL store in a
// temp file. A NEW record saved with no expectation gets `revision: 0`; an
// expectation equal to the record's revision writes revision + 1 and
// answers `saved`; a different expectation writes NOTHING and answers
// `stale` with the current record (the editor re-reads and re-applies,
// never overwrites a save it did not see); an EXISTING record saved with no
// expectation is an unconditional overwrite whose revision is bumped. The
// disk is re-read after flushSync so the stale arm is proven against the
// file and not the in-memory snapshot.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.save(CANVAS)
  const t = (name, over = {}) => ({ id: 'cas', name, nodes: [{ key: 'n1', kind: 'terminal', cwd: '~', dx: 0, dy: 0 }], edges: [], ...over })
  const attempt = (...args) => { try { return store.saveTemplate(...args) } catch (e) { return { kind: 'threw', reason: e.message } } }
  const fresh = attempt(t('first'))
  const matched = attempt(t('second'), 0)
  const stale = attempt(t('stale write'), 0)
  store.flushSync()
  const onDisk = (L.parseLayout(readFileSync(path, 'utf8')).snapshot.templates ?? []).find((x) => x.id === 'cas')
  const inMemory = store.templates().find((x) => x.id === 'cas')
  const forced = attempt(t('forced'))
  store.flushSync()
  const afterForce = (L.parseLayout(readFileSync(path, 'utf8')).snapshot.templates ?? []).find((x) => x.id === 'cas')
  ok('store.edit.1 saveTemplate: a new record answers saved with revision 0; a matching expectation writes revision + 1; a mismatched one answers stale with the current record and writes nothing (re-read from disk); no expectation on an existing record overwrites and bumps',
    Boolean(fresh) && fresh.kind === 'saved' && fresh.template.revision === 0 && fresh.template.name === 'first' &&
      Boolean(matched) && matched.kind === 'saved' && matched.template.revision === 1 && matched.template.name === 'second' &&
      Boolean(stale) && stale.kind === 'stale' && stale.current !== undefined && stale.current.revision === 1 && stale.current.name === 'second' && typeof stale.reason === 'string' && stale.reason.length > 0 &&
      onDisk !== undefined && onDisk.revision === 1 && onDisk.name === 'second' &&
      inMemory !== undefined && inMemory.revision === 1 && inMemory.name === 'second' &&
      Boolean(forced) && forced.kind === 'saved' && forced.template.revision === 2 && forced.template.name === 'forced' &&
      afterForce !== undefined && afterForce.revision === 2 && afterForce.name === 'forced',
    JSON.stringify({ fresh, matched, stale, onDisk, inMemory, forced, afterForce }))
}

// M183 — library.1–.2. THE NODE LIBRARY (`src/shared/template-library.ts`):
// the pure table the workflow panel's library column, the inspector and the
// validator share. Guarded on the module's presence the way edit.1–.4 are,
// so a missing module fails BY NAME rather than throwing and taking the
// checks below it with it.
const LIB_MISSING = 'src/shared/template-library.ts does not exist'
const hasLibrary = Array.isArray(L.LIBRARY) && typeof L.defaultNodeOf === 'function' && typeof L.placementFor === 'function' && typeof L.LIBRARY_GAP === 'number'
const LIBRARY_KINDS = ['terminal', 'chat', 'pool', 'orchestrator', 'collect', 'action', 'http']

// library.1 — LIBRARY holds exactly one entry per kind, in the kind order
// the diagram draws, and each entry is something a person can READ: a
// non-empty name no other entry shares, one sentence (ends in `.`, at most
// 90 characters — the column is narrow) and an example line (at most 60).
// defaultNodeOf(kind) is what the library's drop and `Add` apply, so
// addNode must ACCEPT it for every kind — a default the validator refuses
// is a library entry that can never be added, with nothing on screen to say
// why; terminal/chat carry `cwd: '~'`, pool carries `width: 2`, offsets are
// 0. An unknown kind is a programmer error (the table is closed; user input
// never reaches it) and THROWS a TypeError naming the kind rather than
// answering a node of no kind.
{
  const ID = 'library.1 LIBRARY: one entry per kind in order (terminal, chat, pool, orchestrator, collect, action, http), distinct non-empty names, a sentence ending in . of ≤ 90 chars, an example of ≤ 60 chars; defaultNodeOf(kind) is accepted by addNode for every kind (cwd ~ on terminal/chat, width 2 on pool, dx/dy 0); an unknown kind throws a TypeError naming it'
  if (!hasLibrary || typeof L.addNode !== 'function') ok(ID, false, hasLibrary ? 'addNode (template-edit.ts) is missing' : LIB_MISSING)
  else {
    const kinds = L.LIBRARY.map((e) => e.kind)
    const orderOk = JSON.stringify(kinds) === JSON.stringify(LIBRARY_KINDS)
    const names = L.LIBRARY.map((e) => e.name)
    const namesOk = names.every((n) => typeof n === 'string' && n.trim().length > 0) && new Set(names).size === names.length
    const sentencesOk = L.LIBRARY.every((e) => typeof e.sentence === 'string' && e.sentence.trim().length > 1 && e.sentence.endsWith('.') && e.sentence.length <= 90)
    const examplesOk = L.LIBRARY.every((e) => typeof e.example === 'string' && e.example.trim().length > 0 && e.example.length <= 60)
    const empty = { id: 't', name: 't', nodes: [], edges: [] }
    const defaults = {}
    const accepted = {}
    for (const kind of LIBRARY_KINDS) {
      try {
        const d = L.defaultNodeOf(kind)
        defaults[kind] = d
        const r = L.addNode(empty, d)
        accepted[kind] = r
      } catch (e) { accepted[kind] = { kind: 'threw', reason: e.message } }
    }
    const acceptedOk = LIBRARY_KINDS.every((k) => accepted[k] && accepted[k].kind === 'ok' && accepted[k].template.nodes.length === 1 && accepted[k].template.nodes[0].kind === k)
    const shapeOk = LIBRARY_KINDS.every((k) => defaults[k] && defaults[k].kind === k && !('key' in defaults[k]) && defaults[k].dx === 0 && defaults[k].dy === 0) &&
      defaults.terminal && defaults.terminal.cwd === '~' && defaults.chat && defaults.chat.cwd === '~' && defaults.pool && defaults.pool.width === 2
    let unknown
    try { unknown = { returned: L.defaultNodeOf('widget') } } catch (e) { unknown = { threw: e instanceof TypeError, message: e.message } }
    const unknownOk = unknown.threw === true && typeof unknown.message === 'string' && unknown.message.includes('widget')
    ok(ID, orderOk && namesOk && sentencesOk && examplesOk && acceptedOk && shapeOk && unknownOk,
      JSON.stringify({ kinds, names, orderOk, namesOk, sentencesOk, examplesOk, acceptedOk, shapeOk, unknownOk, defaults, accepted, unknown, library: L.LIBRARY }))
  }
}

// library.2 — placementFor is where `Add` (the keyboard door) puts a new
// block: a template with no nodes answers the origin; otherwise one GAP
// (LIBRARY_GAP = 40) to the right of the RIGHTMOST block's right edge
// (max over dx + BLOCK_W), at the TOPMOST block's dy. The property the
// gesture depends on is that the point never lands ON an existing block —
// asserted geometrically against every node's rect, with three blocks that
// overlap each other so a "rightmost by dx" or "last node" reading would
// land inside one. BLOCK_W/BLOCK_H are the diagram's own constants (already
// in this bundle through workflow-diagram.ts), never restated here.
{
  const ID = 'library.2 placementFor: no nodes → {0,0}; nodes at (0,0), (100,20), (150,-10) → dx = 150 + BLOCK_W + LIBRARY_GAP (358), dy = -10, overlapping no block\'s rect; one node at (0,0) → {BLOCK_W + LIBRARY_GAP (208), 0}; LIBRARY_GAP is 40'
  if (!hasLibrary || typeof L.BLOCK_W !== 'number' || typeof L.BLOCK_H !== 'number') ok(ID, false, hasLibrary ? 'BLOCK_W/BLOCK_H (workflow-diagram.ts) are missing from the bundle' : LIB_MISSING)
  else {
    const W = L.BLOCK_W; const H = L.BLOCK_H
    const node = (key, dx, dy) => ({ key, kind: 'terminal', cwd: '~', dx, dy })
    const t = (nodes) => ({ id: 'p', name: 'place', nodes, edges: [] })
    const call = (tpl) => { try { return L.placementFor(tpl) } catch (e) { return { threw: e.message } } }
    const none = call(t([]))
    const three = call(t([node('n1', 0, 0), node('n2', 100, 20), node('n3', 150, -10)]))
    const one = call(t([node('n1', 0, 0)]))
    const overlaps = (p, n) => p.dx < n.dx + W && p.dx + W > n.dx && p.dy < n.dy + H && p.dy + H > n.dy
    const threeNodes = [node('n1', 0, 0), node('n2', 100, 20), node('n3', 150, -10)]
    const noOverlap = three && typeof three.dx === 'number' && threeNodes.every((n) => !overlaps(three, n))
    ok(ID,
      L.LIBRARY_GAP === 40 &&
        Boolean(none) && none.dx === 0 && none.dy === 0 &&
        Boolean(three) && three.dx === 150 + W + 40 && three.dx === 358 && three.dy === -10 && noOverlap &&
        Boolean(one) && one.dx === W + 40 && one.dx === 208 && one.dy === 0,
      JSON.stringify({ gap: L.LIBRARY_GAP, W, H, none, three, one, noOverlap }))
  }
}

// M184 — run.def.1. THE RUN'S SNAPSHOT. A run gains `definition` (the
//      template as it was at the run's start: id, revision, nodes, edges) and
//      `mapping` (node key → panel id). Both ABSENT on every pre-M184 run and
//      never normalised in — and absent after serialiseLayout too, because a
//      written `"definition"` would claim a snapshot the run never took. A
//      malformed one drops the FIELD with a warning naming the run, never the
//      run: the run's entries and cost are still true even when its snapshot
//      is not. Nodes and edges are parsed by the TEMPLATE parser's rules (one
//      grammar, so a node that would not load as a template cannot load as a
//      snapshot either), a bad node dropped and the definition kept.
{
  const runsLayout = (runs) => L.parseLayout(file({
    workspaces: [{ id: 'w1', name: 'Canvas', panels: [panel({ id: 'a' }), panel({ id: 'b' }), panel({ id: 'c' })], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null, runs }]
  }))
  const base = (id, over = {}) => ({ id, name: `run ${id}`, panelIds: ['a', 'b', 'c'], edges: [], startedAt: 1000, entries: [{ panelId: 'a', startedAt: 1000, endedAt: 1500, outcome: 'exit 0' }], templateId: 't1', ...over })
  const goodDef = {
    templateId: 't1', revision: 2,
    nodes: [
      { key: 'n1', kind: 'terminal', cwd: '~', command: '/bin/sh', args: ['-lc', 'true'], title: 'one', dx: -200, dy: 0 },
      { key: 'n2', kind: 'chat', cwd: '~', message: 'hello', dx: 200, dy: 0 },
      // A pool needs its `width` and `cwd` too: `parseWorkflowNode` is what a
      // snapshot's nodes go through, and a pool without them is a shape the app
      // cannot draw (the fixture, not the rule, was wrong — M184).
      { key: 'n3', kind: 'pool', width: 4, cwd: '~', list: '/tmp/list.txt', prompt: 'do the item', dx: 0, dy: 200 }
    ],
    edges: [{ from: 'n1', to: 'n2', trigger: 'idle' }, { from: 'n2', to: 'n3', trigger: 'exit-ok' }]
  }
  const goodMap = { n1: 'a', n2: 'b', n3: 'c' }
  const r = runsLayout([
    base('plain'),
    base('good', { definition: goodDef, mapping: goodMap }),
    base('badrev', { definition: { ...goodDef, revision: 1.5 }, mapping: goodMap }),
    base('badnodes', { definition: { ...goodDef, nodes: [goodDef.nodes[0], { key: 'n2', kind: 'nope', cwd: '~' }, { key: '', kind: 'terminal', cwd: '~' }] }, mapping: goodMap }),
    base('badmapentry', { definition: goodDef, mapping: { n1: 'a', n2: 7, n3: 'c' } }),
    base('badmap', { definition: goodDef, mapping: 'n1=a' }),
    // M184 (the critic, 5). `-1` is the UNSAVED mark and is kept; anything
    // below it is malformed.
    base('unsaved', { definition: { ...goodDef, revision: -1 }, mapping: goodMap }),
    base('badneg', { definition: { ...goodDef, revision: -2 }, mapping: goodMap })
  ])
  const runs = active(r.snapshot).runs ?? []
  const byId = (id) => runs.find((x) => x.id === id)
  const plain = byId('plain'), good = byId('good'), badrev = byId('badrev'), badnodes = byId('badnodes'), badmapentry = byId('badmapentry'), badmap = byId('badmap')
  const unsaved = byId('unsaved'), badneg = byId('badneg')
  // The pre-M184 shape written back: no key at all — not `null`, not `{}`.
  const plainOnly = runsLayout([base('plain')])
  const plainText = L.serialiseLayout({ ...plainOnly.snapshot })
  // The round trip: parse → serialise → parse carries both fields intact.
  const round = active(L.parseLayout(L.serialiseLayout({ ...runsLayout([base('good', { definition: goodDef, mapping: goodMap })]).snapshot })).snapshot).runs ?? []
  const roundGood = round.find((x) => x.id === 'good')
  const sameDef = (d) => d !== undefined && d !== null && d.templateId === 't1' && d.revision === 2 &&
    Array.isArray(d.nodes) && d.nodes.length === 3 && d.nodes.map((n) => n.key).join(',') === 'n1,n2,n3' &&
    d.nodes[0].kind === 'terminal' && d.nodes[0].command === '/bin/sh' && Array.isArray(d.nodes[0].args) && d.nodes[0].args.join(' ') === '-lc true' && d.nodes[0].dx === -200 &&
    d.nodes[1].kind === 'chat' && d.nodes[1].message === 'hello' && d.nodes[2].kind === 'pool' &&
    Array.isArray(d.edges) && d.edges.length === 2 && d.edges[0].from === 'n1' && d.edges[0].to === 'n2' && d.edges[0].trigger === 'idle' && d.edges[1].trigger === 'exit-ok'
  const sameMap = (m) => m !== undefined && m !== null && JSON.stringify(m) === JSON.stringify(goodMap)
  const warnsFor = (id, field) => r.warnings.some((w) => w.includes(`run ${id}`) && w.includes(field))
  ok('run.def.1 parseRuns: definition and mapping absent stay absent (and serialise to no key); a good pair round-trips through serialiseLayout; a definition with a fractional or below -1 revision drops the FIELD with a warning naming the run and the run survives, and revision -1 (the unsaved mark) is kept; a node the template parser would drop is dropped, the definition kept (its edge with it) and the parser\'s OWN warning forwarded under the run; a mapping entry that is not a string is dropped; a mapping that is not an object is dropped whole with a warning; a mapping outlives neither a dropped definition nor a key the snapshot does not hold',
    runs.length === 8 &&
      plain !== undefined && !('definition' in plain) && !('mapping' in plain) && !/"definition"|"mapping"/.test(plainText) &&
      good !== undefined && sameDef(good.definition) && sameMap(good.mapping) &&
      roundGood !== undefined && sameDef(roundGood.definition) && sameMap(roundGood.mapping) &&
      badrev !== undefined && !('definition' in badrev) && !('mapping' in badrev) && badrev.entries.length === 1 && badrev.templateId === 't1' && warnsFor('badrev', 'definition') &&
      badneg !== undefined && !('definition' in badneg) && !('mapping' in badneg) && warnsFor('badneg', 'definition') &&
      unsaved !== undefined && unsaved.definition !== undefined && unsaved.definition.revision === -1 && sameMap(unsaved.mapping) &&
      badnodes !== undefined && badnodes.definition !== undefined && badnodes.definition.nodes.length === 1 && badnodes.definition.nodes[0].key === 'n1' && badnodes.definition.edges.length === 0 && badnodes.definition.revision === 2 &&
      JSON.stringify(badnodes.mapping) === JSON.stringify({ n1: 'a' }) && warnsFor('badnodes', 'mapping named keys') && r.warnings.some((w) => w.startsWith('run badnodes: ') && /node/i.test(w) && !/mapping/.test(w)) &&
      badmapentry !== undefined && badmapentry.mapping !== undefined && JSON.stringify(badmapentry.mapping) === JSON.stringify({ n1: 'a', n3: 'c' }) && sameDef(badmapentry.definition) &&
      badmap !== undefined && !('mapping' in badmap) && sameDef(badmap.definition) && warnsFor('badmap', 'mapping'),
    JSON.stringify({ ids: runs.map((x) => x.id), plain, good, badrev, badneg, unsaved, badnodes, badmapentry, badmap, plainHasKey: /"definition"|"mapping"/.test(plainText), warnings: r.warnings }))
}

// M253 — preset.reviewed.1. AN IMPORTED PRESET IS A STRANGER'S COMMAND, so it
//      carries M190's mark. Absent means reviewed (every preset this machine
//      saved, and every pre-M253 file) and stays ABSENT — never `reviewed:
//      undefined`, which survives IPC and reads as present. `false` is kept.
//      A non-boolean is malformed and costs the FIELD, failing SAFE: the
//      preset is kept and read as unreviewed, and the warning names it.
{
  const w = []
  const base = { cwd: '/w', args: [] }
  const got = L.parsePresets([{ ...base, id: 'plain' }, { ...base, id: 'stranger', reviewed: false }, { ...base, id: 'odd', reviewed: 'yes' }, { ...base, id: 'read', reviewed: true }], w)
  const by = (id) => got.find((p) => p.id === id)
  ok('preset.reviewed.1 parsePresets: an absent reviewed stays absent (no key), false is kept, a non-boolean keeps the preset as unreviewed and warns naming it, and true reads as reviewed with no key',
    got.length === 4 && !('reviewed' in by('plain')) && by('stranger').reviewed === false &&
      by('odd').reviewed === false && w.some((x) => /odd/.test(x) && /reviewed/.test(x)) &&
      !('reviewed' in by('read')) && w.length === 1,
    JSON.stringify({ got, w }))
}

// M253 (the critic, 2) — preset.reviewed.2. CMD+N NEVER RESOLVES AN UNREAD
//      PACK PRESET. Cmd+N spawns from a template main pushed AHEAD of time,
//      so no spawn-time refusal is on its path; the guard has to be in
//      resolveDefault itself. A default naming an unread preset falls back to
//      the first built-in; the same preset once read is honoured. Written
//      after the fix (the critic found the door), so not watched red.
{
  const unread = { id: 'u9', name: 'from a pack', cwd: '/w', args: [], command: 'gh', reviewed: false }
  const read = { id: 'u9', name: 'from a pack', cwd: '/w', args: [], command: 'gh' }
  const whenUnread = L.resolveDefault([unread], 'u9')
  const whenRead = L.resolveDefault([read], 'u9')
  ok('preset.reviewed.2 resolveDefault never answers an unread pack preset — it falls back to the first built-in — and answers the same preset once it is read',
    whenUnread.id !== 'u9' && whenUnread.id === L.BUILT_IN_PRESETS[0].id && whenRead.id === 'u9',
    JSON.stringify({ whenUnread: whenUnread.id, whenRead: whenRead.id }))
}

// M259 — wfx.*. The workflow editor's PURE graph reading (workflow-graph.ts):
//      which blocks sit upstream and downstream of a selection, what is
//      incomplete on the graph, the arrangement Auto layout commits, the
//      curve an edge is drawn on, and the run timeline mapped back to blocks.
//      Written before the module existed and watched red.
try {
  const n = (key, kind, dx, dy, over = {}) => ({ key, kind, cwd: '~', dx, dy, ...over })
  const t = {
    id: 'wx', name: 'graph', nodes: [
      n('a', 'terminal', 0, 0), n('b', 'chat', 300, 0), n('c', 'collect', 600, 0, { target: 'out.md' }),
      n('d', 'terminal', 300, 200), n('e', 'http', 0, 400, { url: '', method: 'POST' })
    ],
    edges: [{ from: 'a', to: 'b', trigger: 'exit' }, { from: 'b', to: 'c', trigger: 'idle' }, { from: 'a', to: 'd', trigger: 'exit-ok' }]
  }
  const hood = L.neighbourhood(t.edges, 'b')
  ok('wfx.path.1 a selection lights its whole upstream and downstream, and the edges on those paths only',
    hood.up.join(',') === 'a' && hood.down.join(',') === 'c' && hood.edges.slice().sort().join(',') === 'a>b,b>c',
    JSON.stringify(hood))

  const issues = L.diagramIssues(t)
  ok('wfx.issue.1 an unconnected block, an empty required field and a write method are each named on the block they belong to; a complete block has none',
    (issues.e ?? []).some((s) => /not connected/.test(s)) && (issues.e ?? []).some((s) => /address/.test(s)) &&
      (issues.e ?? []).some((s) => /GET/.test(s)) && issues.a === undefined && issues.b === undefined && issues.c === undefined,
    JSON.stringify(issues))
  const lonelyCollect = L.diagramIssues({ ...t, nodes: [n('a', 'terminal', 0, 0), n('c', 'collect', 300, 0, { target: 'x' })], edges: [{ from: 'c', to: 'a', trigger: 'exit' }] })
  ok('wfx.issue.2 a collect block nothing hands off to says it collects nothing; a single block is never called unconnected',
    (lonelyCollect.c ?? []).some((s) => /collects nothing/.test(s)) &&
      L.diagramIssues({ ...t, nodes: [n('a', 'terminal', 0, 0)], edges: [] }).a === undefined,
    JSON.stringify(lonelyCollect))

  const h = L.autoLayout(t, 'horizontal')
  const at = Object.fromEntries(h.map((m) => [m.key, m]))
  const v = L.autoLayout(t, 'vertical')
  const vat = Object.fromEntries(v.map((m) => [m.key, m]))
  ok('wfx.layout.1 Auto layout ranks by longest path — horizontal steps right per rank, vertical steps down — and never stacks two blocks on one spot',
    h.length === 5 && at.a.dx < at.b.dx && at.b.dx < at.c.dx && at.b.dx === at.d.dx && at.b.dy !== at.d.dy &&
      vat.a.dy < vat.b.dy && vat.b.dy < vat.c.dy && vat.b.dy === vat.d.dy &&
      new Set(h.map((m) => `${m.dx},${m.dy}`)).size === 5 && new Set(v.map((m) => `${m.dx},${m.dy}`)).size === 5,
    JSON.stringify({ h, v }))

  const A = { x: 0, y: 0, w: 168, h: 64 }, B = { x: 400, y: 0, w: 168, h: 64 }, C = { x: 0, y: 300, w: 168, h: 64 }
  const right = L.edgeGeometry(A, B), down = L.edgeGeometry(A, C)
  ok('wfx.edge.1 an edge leaves and enters on the facing borders — sideways for a block beside, top and bottom for a block below — and its label sits ON the curve',
    right.x1 === 168 && right.x2 === 400 && right.y1 === 32 && right.mx === 284 && right.my === 32 && /^M /.test(right.d) && / C /.test(right.d) &&
      down.y1 === 64 && down.y2 === 300 && down.x1 === 84 && down.mx === 84,
    JSON.stringify({ right, down }))

  const run = {
    id: 'r1', name: 'graph', panelIds: ['pa', 'pb', 'pd'], edges: [], startedAt: 1000, endedAt: 9000,
    entries: [{ panelId: 'pa', startedAt: 1000, endedAt: 3000, outcome: 'exit 0' }, { panelId: 'pb', startedAt: 3000, endedAt: 8000, outcome: 'a turn' }, { panelId: 'pd', startedAt: 3200 }],
    definition: { templateId: 'wx', revision: 1, nodes: t.nodes, edges: t.edges }, mapping: { a: 'pa', b: 'pb', d: 'pd', c: 'pc' }
  }
  const tl = L.runTimeline(run)
  ok('wfx.timeline.1 the run timeline is one row per block that started, in start order, with its offset and span, read back to the block key',
    tl.map((r) => r.key).join(',') === 'a,b,d' && tl[0].offset === 0 && tl[0].span === 2000 && tl[1].offset === 2000 && tl[2].span === undefined && tl.every((r) => typeof r.outcome === 'string' || r.outcome === undefined),
    JSON.stringify(tl))
  const walk = L.completedWalk(t.edges, new Set(['a', 'b']))
  ok('wfx.walk.1 the traveling highlight walks ONLY edges whose both ends completed, in path order, each step one rank later',
    walk.map((w) => w.edge).join(',') === 'a>b' && walk[0].step === 0 &&
      L.completedWalk(t.edges, new Set(['a', 'b', 'c'])).map((w) => `${w.edge}@${w.step}`).join(',') === 'a>b@0,b>c@1',
    JSON.stringify(walk))
} catch (e) {
  ok('wfx (threw)', false, String(e && e.stack || e))
}

// M287 — orchestrate.1 / work.brief.1. THE ORCHESTRATE RECORD and THE BRIEF.
// Both are workspace records with the record rules: absent stays absent (no
// key invented, none written for nothing), a malformed field costs the field,
// a well-formed one round-trips through the ONE parser as a fresh object.
{
  try {
    const w = []
    const absent = L.parseOrchestrate(undefined, w)
    const empty = L.parseOrchestrate({}, w)
    const notObj = L.parseOrchestrate('yes', w)
    const full = L.parseOrchestrate({ workbench: { height: 300, tab: 'checks' }, lens: 'list', mode: 'pipeline', sideTab: 'files', camera: { x: 1, y: 2, k: 1.5 } }, [])
    const badBench = []
    const halfBad = L.parseOrchestrate({ workbench: { height: 'tall', tab: 'checks' }, lens: 'list' }, badBench)
    const unknownTab = L.parseOrchestrate({ workbench: { height: 300, tab: 'artifacts' } }, [])
    const clamped = L.parseOrchestrate({ workbench: { height: 5, tab: 'output' } }, [])
    const clampedHigh = L.parseOrchestrate({ workbench: { height: 99999, tab: 'output' } }, [])
    const badCamera = L.parseOrchestrate({ lens: 'scene', camera: { x: 0, y: 0, k: 0 } }, [])
    const carried = L.carryOrchestrate(full)
    const parsedAbsent = L.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [], camera: { x: 0, y: 0, scale: 1 } }], activeWorkspaceId: 'w1' }))
    const parsedWith = L.parseLayout(JSON.stringify({ version: 1, workspaces: [{ id: 'w1', name: 'a', panels: [], camera: { x: 0, y: 0, scale: 1 }, orchestrate: { workbench: { height: 300, tab: 'checks' } } }], activeWorkspaceId: 'w1' }))
    ok('orchestrate.1 the record is absent for a pre-M287 file and for an empty object, dropped by name when not an object; each field parses on its own (a malformed workbench costs the workbench and keeps the lens; an unknown tab — artifacts — is not a tab; the height is clamped to the workbench\'s range; a zero-scale camera is dropped); carry is a fresh object; the workspace parser keeps it absent or carries it through',
      absent === undefined && empty === undefined && notObj === undefined && w.some((t) => /orchestrate record/.test(t)) &&
        JSON.stringify(full) === JSON.stringify({ workbench: { height: 300, tab: 'checks' }, lens: 'list', mode: 'pipeline', sideTab: 'files', camera: { x: 1, y: 2, k: 1.5 } }) &&
        JSON.stringify(halfBad) === JSON.stringify({ lens: 'list' }) && badBench.some((t) => /workbench/.test(t)) &&
        unknownTab === undefined &&
        clamped.workbench.height === L.WORKBENCH_MIN_HEIGHT && clampedHigh.workbench.height === L.WORKBENCH_MAX_HEIGHT &&
        JSON.stringify(badCamera) === JSON.stringify({ lens: 'scene' }) &&
        JSON.stringify(carried) === JSON.stringify(full) && carried !== full && carried.workbench !== full.workbench &&
        L.sameOrchestrate(full, carried) && !L.sameOrchestrate(full, halfBad) && L.sameOrchestrate(undefined, undefined) &&
        !('orchestrate' in parsedAbsent.snapshot.workspaces[0]) &&
        JSON.stringify(parsedWith.snapshot.workspaces[0].orchestrate) === JSON.stringify({ workbench: { height: 300, tab: 'checks' } }),
      JSON.stringify({ w, full, halfBad, badBench, unknownTab, clamped, clampedHigh, badCamera, wsA: Object.keys(parsedAbsent.snapshot.workspaces[0]), wsB: parsedWith.snapshot.workspaces[0].orchestrate }))
  } catch (e) { ok('orchestrate.1 (threw)', false, String(e)) }
  try {
    const base = { id: 'r1', source: 'github', key: 'acme/canvas#9', title: 't', state: 'todo', createdAt: 1, updatedAt: 1 }
    const parsed = L.parseWorkItems([
      { ...base, id: 'old' },
      { ...base, id: 'both', brief: 'make it fast', criteria: ['p95 under 100ms', '', 'no new deps'] },
      { ...base, id: 'bad', brief: 42, criteria: ['ok', 7] },
      { ...base, id: 'empty', brief: '', criteria: [] }
    ], [])
    const by = (id) => parsed.find((i) => i.id === id)
    const carried = L.carryWorkItem({ ...base, brief: 'b', criteria: ['c1', 'c2'] })
    const upserted = L.upsertWorkItem([L.carryWorkItem({ ...base, brief: 'keep me', criteria: ['and me'] })], { ...base, title: 'renamed upstream' }, 500)
    ok('work.brief.1 brief and criteria are absent on a pre-M287 item and stay absent; strings and a string list round-trip with empty criteria filtered; a non-string brief or a mixed list costs the field and keeps the card; an empty brief is not written; a provider re-add keeps both, because they are the person\'s',
      parsed.length === 4 &&
        !('brief' in by('old')) && !('criteria' in by('old')) &&
        by('both').brief === 'make it fast' && JSON.stringify(by('both').criteria) === JSON.stringify(['p95 under 100ms', 'no new deps']) &&
        !('brief' in by('bad')) && !('criteria' in by('bad')) && by('bad').title === 't' &&
        !('brief' in by('empty')) && !('criteria' in by('empty')) &&
        carried.brief === 'b' && JSON.stringify(carried.criteria) === JSON.stringify(['c1', 'c2']) &&
        upserted[0].title === 'renamed upstream' && upserted[0].brief === 'keep me' && JSON.stringify(upserted[0].criteria) === JSON.stringify(['and me']),
      JSON.stringify({ old: by('old'), both: by('both'), bad: by('bad'), empty: by('empty'), carried, upserted }))
  } catch (e) { ok('work.brief.1 (threw)', false, String(e)) }
}

const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
