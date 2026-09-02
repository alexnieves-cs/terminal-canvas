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
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const L = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

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
      r.warnings.some((w) => /a -> r1.*terminal panels/.test(w)),
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

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
