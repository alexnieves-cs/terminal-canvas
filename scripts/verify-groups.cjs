/* Run with: npm run verify:groups
   Groups are pure membership + geometry: this pins the two failure modes that
   would otherwise look fine until a drag or relaunch — accumulated movement
   shearing members apart, and a collapse killing a live terminal. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const OUT = join(__dirname, '..', 'out', 'verify', 'groups.cjs')
buildSync({
  entryPoints: [join(__dirname, 'groups-entry.cjs')], outfile: OUT,
  bundle: true, platform: 'node', format: 'cjs',
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const G = require(OUT)
const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ` — ${detail}` : ''}`)
}
const panels = [
  G.makePanel('n1', { x: 100, y: 100 }, 2),
  G.makePanel('n2', { x: 500, y: 250 }, 4),
  G.makePanel('n3', { x: 1500, y: 100 }, 1)
]
const group = { id: 'g1', label: 'auth refactor', colour: 'blue', panelIds: ['n1', 'n2'] }

{
  const rect = G.groupRect(group, panels)
  ok('1 a group bounds every member with a labelled header margin',
    rect !== null && rect.x < panels[0].rect.x && rect.y < panels[0].rect.y &&
      rect.x + rect.w > panels[1].rect.x + panels[1].rect.w,
    JSON.stringify(rect))
}
{
  const state = G.groupDragState(group, panels, { x: 10, y: 20 })
  const moved = G.applyGroupDrag(panels, state, { x: 180, y: -30 })
  const a = moved.find((p) => p.rect.id === 'n1').rect
  const b = moved.find((p) => p.rect.id === 'n2').rect
  ok('2 a group drag applies the same origin delta to every member',
    a.x - panels[0].rect.x === 170 && a.y - panels[0].rect.y === -50 &&
      b.x - panels[1].rect.x === 170 && b.y - panels[1].rect.y === -50,
    `${a.x - panels[0].rect.x},${a.y - panels[0].rect.y}; ${b.x - panels[1].rect.x},${b.y - panels[1].rect.y}`)
}
{
  const raised = G.raiseGroup(panels, group)
  ok('3 raising a group rewrites member z values without reordering the panel array',
    raised.map((p) => p.rect.id).join(',') === 'n1,n2,n3' &&
      raised[0].z > panels[2].z && raised[1].z > raised[0].z,
    `${raised.map((p) => `${p.rect.id}:${p.z}`).join(',')}`)
}
{
  const tiers = G.assignTiers({
    rects: panels.map((p) => p.rect), viewport: { x: 0, y: 0, scale: 1 },
    size: { width: 3000, height: 1600 }, focusedId: 'n1', lastFocusedAt: {},
    cardIds: new Set(['n1', 'n2'])
  })
  ok('4 collapse forces cards even for a focused member, without removing it',
    tiers.n1 === 'card' && tiers.n2 === 'card' && tiers.n3 === 'live', JSON.stringify(tiers))
}
{
  const parsed = G.parseLayout(JSON.stringify({ version: 1, activeWorkspaceId: 'w1', workspaces: [{
    id: 'w1', name: 'Canvas', camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
    panels: [{ id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] }, { id: 'n2', x: 800, y: 0, w: 720, h: 460, z: 2, cwd: '~', args: [] }],
    groups: [{ id: 'g1', label: 'auth', colour: 'green', panelIds: ['n1', 'gone', 'n1'], collapsed: true }]
  }] }))
  const restored = parsed.snapshot.workspaces[0].groups[0]
  ok('5 persistence keeps a valid group while pruning missing and duplicate members',
    restored.label === 'auth' && restored.collapsed === true && restored.panelIds.join(',') === 'n1',
    JSON.stringify(restored))
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exit(1)
