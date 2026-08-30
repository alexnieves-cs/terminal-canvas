/* Verifies the merged view's pure lane placement.
   Run with: npm run verify:merged

   Plain node, like verify:viewport and verify:rail: merged-layout.ts imports
   nothing from electron or node-pty and never touches the DOM, so the
   geometry most likely to be subtly wrong — and least pleasant to debug
   through a running WebGL canvas — sits in the fastest tier the repo has. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'merged.cjs')
buildSync({
  entryPoints: [join(__dirname, 'merged-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Required here, not pre-emptive: merged-layout.ts imports a real VALUE
  // (toPanels) from @renderer, unlike verify-rail.cjs's bundle, which carries
  // the alias only in case a future edit needs it. See CLAUDE.md's entry on
  // "The plain-node verify bundles now configure a @shared alias" for what
  // happens the day a bundle that needed no alias suddenly does.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const R = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const ws = (id, name, active, panels) => ({ id, name, active, panels })
// cwd and args are required on PersistedTerminalPanel (layout-schema.ts) —
// mergedLayout runs every workspace's panels through the real toPanels, not
// a stand-in, so a fixture missing them fails inside toPanels itself rather
// than exercising the lane placement these checks are actually about.
const p = (id, x, y, w = 720, h = 460) => ({ id, x, y, w, h, z: 1, cwd: '~', args: [] })

// 1. The whole point: two workspaces whose panels overlap by construction
//    (both laid out around the origin, months apart, by two cameras that
//    never knew about each other) must not overlap after placement. This is
//    the obstacle M7's own paragraph misnamed as LIVE_BUDGET.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', true, [p('n1', 0, 0), p('n2', 100, 100)]),
    ws('w2', 'School', false, [p('n3', 0, 0), p('n4', 100, 100)])
  ])
  const rect = (id) => out.panels.find((q) => q.rect.id === id).rect
  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  const cross = [['n1', 'n3'], ['n1', 'n4'], ['n2', 'n3'], ['n2', 'n4']]
  ok('1 panels from different workspaces never overlap',
    cross.every(([a, b]) => !overlaps(rect(a), rect(b))),
    JSON.stringify(cross.map(([a, b]) => [a, b, overlaps(rect(a), rect(b))])))
}

// 2. ...while each workspace's OWN arrangement survives intact. The
//    arrangement is the information worth preserving — a merged view that
//    re-flowed every panel into a grid would show the user a canvas they
//    have never seen. Asserted as a RELATIVE offset, which is the only thing
//    a lane translation may not change.
{
  const out = R.mergedLayout([ws('w2', 'School', false, [p('n3', 0, 0), p('n4', 250, 130)])])
  const a = out.panels.find((q) => q.rect.id === 'n3').rect
  const b = out.panels.find((q) => q.rect.id === 'n4').rect
  ok('2 a workspace\'s own relative geometry is preserved',
    b.x - a.x === 250 && b.y - a.y === 130, `${b.x - a.x},${b.y - a.y}`)
}

// 3. The active workspace's lane is FIRST, so toggling the mode does not
//    scroll the user away from the canvas they were looking at.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', false, [p('n1', 0, 0)]),
    ws('w2', 'School', true, [p('n3', 0, 0)])
  ])
  ok('3 the active workspace gets the first lane',
    out.lanes[0].workspaceId === 'w2' && out.lanes[0].active === true,
    out.lanes.map((l) => l.workspaceId).join(','))
}

// 4. An EMPTY workspace still gets a lane. It has no bounding box to derive
//    one from, so the obvious implementation drops it — and a workspace that
//    silently vanishes from the merged view reads as a workspace that was
//    deleted. It must disagree with neither the rail nor the palette about
//    how many workspaces exist.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', true, [p('n1', 0, 0)]),
    ws('w2', 'Empty', false, [])
  ])
  ok('4 an empty workspace still gets a lane',
    out.lanes.length === 2 && out.lanes.some((l) => l.workspaceId === 'w2'),
    out.lanes.map((l) => l.workspaceId).join(','))
}

// 5. Panels carry their REAL identity through. Only rect.x/rect.y are
//    synthetic — the id, spec, title and kind are the panel's own, which is
//    what lets the registry, agent state, edge pips, the rail and the
//    inspector all work on a foreign panel with no change at all.
{
  const out = R.mergedLayout([
    ws('w2', 'School', false, [{ ...p('n3', 0, 0), title: 'auth refactor' }])
  ])
  const panel = out.panels[0]
  ok('5 a merged panel keeps its real id, title and spec',
    panel.rect.id === 'n3' && panel.title === 'auth refactor' &&
    panel.spec !== undefined && panel.rect.w === 720,
    JSON.stringify({ id: panel.rect.id, title: panel.title }))
}

// 6. Purity and stability: the same input twice is byte-identical, and the
//    output depends on nothing but the input. A placement that consulted a
//    camera, a clock or a random seed would make lanes shuffle between
//    refetches, which reads as the canvas rearranging itself.
{
  const input = () => [
    ws('w1', 'Main', true, [p('n1', 0, 0)]),
    ws('w2', 'School', false, [p('n3', 30, 30)])
  ]
  ok('6 mergedLayout is pure — identical input, identical output',
    JSON.stringify(R.mergedLayout(input())) === JSON.stringify(R.mergedLayout(input())))
}

// 7. A lane's bounds CONTAIN every panel placed in it. The lane header and
//    any future lane chrome are drawn from bounds, so bounds that did not
//    contain the content would render a label floating away from the panels
//    it names.
{
  const out = R.mergedLayout([ws('w1', 'Main', true, [p('n1', 0, 0), p('n2', 300, 200)])])
  const lane = out.lanes[0]
  const inside = (r) =>
    r.x >= lane.bounds.x && r.y >= lane.bounds.y &&
    r.x + r.w <= lane.bounds.x + lane.bounds.w &&
    r.y + r.h <= lane.bounds.y + lane.bounds.h
  ok('7 every panel sits inside its own lane\'s bounds',
    out.panels.every((q) => inside(q.rect)),
    JSON.stringify(lane.bounds))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
