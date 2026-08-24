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

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
