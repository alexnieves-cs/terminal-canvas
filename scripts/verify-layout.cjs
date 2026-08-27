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

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
