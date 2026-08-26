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
//     quietly degrading a little on every launch.
{
  const persisted = [
    { id: 'a1', x: -40, y: 12.5, w: 720, h: 460, z: 3, cwd: '/tmp', args: ['-l'] },
    { id: 'b2', x: 900, y: 0, w: 300, h: 200, z: 1, cwd: '~', command: '/bin/bash', args: [] }
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
  ok('25 reset empties the canvas but preserves settings and workspace identity',
    w.panels.length === 0 && w.selectedId === null && w.focusedId === null &&
    w.id === L.DEFAULT_WORKSPACE_ID && written.settings.camera === false,
    JSON.stringify({ panels: w.panels.length, id: w.id, camera: written.settings.camera }))
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

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
