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
  // (toPanels) from @renderer. @shared is the pre-emptive one here. This
  // comment used to add "unlike verify-rail.cjs's bundle, which carries the
  // alias only in case a future edit needs it" — false: verify-rail.cjs's
  // @renderer alias has been load-bearing since M9b, and verify-palette.cjs's
  // since M8d, both measured in M18. See CLAUDE.md's entry on "The plain-node
  // verify bundles now configure a @shared alias" for the corrected table and
  // for why the answer has to be measured by deleting the alias and building.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const R = require(OUT)

const { ok, results } = require('./lib/checks.cjs').createChecks()

const ws = (id, name, active, panels) => ({ id, name, active, panels })
// cwd and args are required on PersistedTerminalPanel (layout-schema.ts) —
// mergedLayout runs every workspace's panels through the real toPanels, not
// a stand-in, so a fixture missing them fails inside toPanels itself rather
// than exercising the lane placement these checks are actually about.
const p = (id, x, y, w = 720, h = 460) => ({ id, x, y, w, h, z: 1, cwd: '~', args: [] })

// 1. The whole point: two workspaces whose panels overlap by construction
//    (both laid out around the origin, months apart, by two cameras that
//    never knew about each other) must not overlap after placement. This is
//    the obstacle M7's own paragraph misnamed as LIVE_BUDGET. w2's panels sit
//    at NEGATIVE world coordinates on purpose — an entirely ordinary canvas
//    that has been panned left — so the claim is proven across the sign
//    boundary rather than only in the positive quadrant, where box.x is 0 and
//    the bounding-box subtraction that does the real work is a no-op.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', true, [p('n1', 0, 0), p('n2', 100, 100)]),
    ws('w2', 'School', false, [p('n3', -900, -50), p('n4', -800, 50)])
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
//    how many workspaces exist. Its lane's width is exactly LANE_MIN_WIDTH —
//    the exported constant this is the one place that names — because a
//    dropped clamp (`box?.w ?? 0` with nothing to floor it) leaves an empty
//    workspace's lane zero-wide, which is a lane that exists in the array and
//    is invisible on screen: the same silent vanishing this check exists to
//    catch, one layer deeper.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', true, [p('n1', 0, 0)]),
    ws('w2', 'Empty', false, [])
  ])
  const emptyLane = out.lanes.find((l) => l.workspaceId === 'w2')
  ok('4 an empty workspace still gets a lane, exactly LANE_MIN_WIDTH wide',
    out.lanes.length === 2 && emptyLane !== undefined && emptyLane.bounds.w === R.LANE_MIN_WIDTH,
    `lanes=${out.lanes.map((l) => l.workspaceId).join(',')} emptyWidth=${emptyLane?.bounds.w}`)
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
//    it names. TWO lanes, and the second is built from panels at NEGATIVE
//    source coordinates: with only one lane at cursorX 0, bounds.x is 0 and
//    box.x is 0 too, so `bounds.x = cursorX` and the `-box.x`/`-box.y`
//    normalisation are both no-ops and a dropped subtraction is invisible.
//    The second lane's cursorX is nonzero and its source box.x is negative,
//    which is what makes both facts load-bearing — every panel in EVERY
//    lane is checked, not just the first, since the bug this guards against
//    is specifically a LATER lane's panels landing in an EARLIER one's
//    bounds.
{
  const out = R.mergedLayout([
    ws('w1', 'Main', true, [p('n1', 0, 0), p('n2', 300, 200)]),
    ws('w2', 'School', false, [p('n3', -900, -400), p('n4', -700, -200)])
  ])
  const laneOf = { n1: 'w1', n2: 'w1', n3: 'w2', n4: 'w2' }
  const boundsById = Object.fromEntries(out.lanes.map((l) => [l.workspaceId, l.bounds]))
  const inside = (r, b) =>
    r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h
  ok('7 every panel sits inside its own lane\'s bounds, across a negative-coordinate lane too',
    out.panels.every((q) => inside(q.rect, boundsById[laneOf[q.rect.id]])),
    JSON.stringify(out.lanes.map((l) => l.bounds)))
}

/* ---- the marquee ---- */
const r = (id, x, y, w = 100, h = 100) => ({ id, x, y, w, h })

// 8. A drag normalises in every direction. Dragging up-and-left is as
//    ordinary as down-and-right, and a rect with negative width selects
//    nothing at all — a marquee that only worked one way would look like an
//    intermittently broken gesture rather than a missing normalisation.
{
  const a = R.marqueeRect({ x: 300, y: 300 }, { x: 100, y: 100 })
  ok('8 a marquee normalises whichever way it is dragged',
    a.x === 100 && a.y === 100 && a.w === 200 && a.h === 200, JSON.stringify(a))
}

// 9. Selection is by INTERSECTION, not containment. A marquee that required
//    full containment could never select a panel bigger than the visible
//    canvas, which at ordinary zoom levels is most of them — a gesture that
//    silently does nothing on the common case.
{
  const picked = R.marqueeSelection(r('m', 50, 50, 20, 20), [r('n1', 0, 0, 720, 460)])
  ok('9 a marquee selects on intersection, not containment',
    picked.join(',') === 'n1', picked.join(','))
}

// 10. A panel merely TOUCHING the marquee's edge is not selected. Zero-area
//     overlap is what a user gets when they drag a marquee up against a panel
//     deliberately to exclude it, and selecting it there makes the gesture
//     feel imprecise in exactly the situation precision was intended.
{
  const picked = R.marqueeSelection(r('m', 100, 0, 50, 50), [r('n1', 0, 0, 100, 100)])
  ok('10 an edge-touching panel is not selected', picked.length === 0, picked.join(','))
}

// 11. Nothing intersected is an EMPTY selection, not a null and not the
//     previous one. A drag on empty space is how a user clears a selection.
{
  ok('11 a marquee over nothing selects nothing',
    R.marqueeSelection(r('m', 5000, 5000, 10, 10), [r('n1', 0, 0)]).length === 0)
}

// 12. Order follows the panels array, so a selection is stable across
//     re-renders rather than reordering under the user between the marquee
//     and the command that acts on it.
{
  const picked = R.marqueeSelection(r('m', -10, -10, 5000, 5000),
    [r('n1', 0, 0), r('n2', 200, 0), r('n3', 400, 0)])
  ok('12 selection order follows the panel array', picked.join(',') === 'n1,n2,n3', picked.join(','))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
