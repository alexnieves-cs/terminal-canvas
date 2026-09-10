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
{
  // M92. A locked member stays where it is under a group drag: the drag state
  // is built for the UNLOCKED members only, so the locked one neither moves
  // nor shears the others (each member still recomputes from its own origin).
  const withLock = panels.map((p) => (p.rect.id === 'n1' ? { ...p, locked: true } : p))
  const state = G.groupDragState(group, withLock, { x: 10, y: 20 })
  const moved = G.applyGroupDrag(withLock, state, { x: 180, y: -30 })
  const a = moved.find((p) => p.rect.id === 'n1').rect
  const b = moved.find((p) => p.rect.id === 'n2').rect
  ok('lock.1 a group drag skips a locked member and moves the rest by the same delta',
    a.x === withLock[0].rect.x && a.y === withLock[0].rect.y &&
      b.x - withLock[1].rect.x === 170 && b.y - withLock[1].rect.y === -50 &&
      state.members.length === 1 && G.lockedCount(group, withLock) === 1,
    JSON.stringify({ a, b, members: state.members.length }))
}

// M203 (D08) — task.members.* and task.show.target.1. A task's members are
// DERIVED from explicit facts, each carrying its reason, and position is never
// one of them: the `adj` terminal below touches the card and shares nothing
// with it, and it must stay out. The fixture holds one panel per reason, one
// decoy per rule (a sibling directory, a second-hop link), and a second card
// linked to the same note so overlap is exercised rather than asserted.
{
  const R = (id, x, y, w = 400, h = 240) => ({ id, x, y, w, h })
  const task = [
    { kind: 'work', rect: R('wk1', 0, 0, 640, 220), z: 1, work: { itemId: 'wi1' }, links: [{ to: 'n9' }] },
    { kind: 'chat', rect: R('c1', 700, 0), z: 2, chat: { cwd: '/lanes/one' } },
    { kind: 'terminal', rect: R('t1', 0, 600), z: 3 },
    { kind: 'terminal', rect: R('t2', 500, 600), z: 4 },
    { kind: 'terminal', rect: R('adj', 640, 0), z: 5 },
    { kind: 'review', rect: R('rv1', 1200, 0), z: 6, subject: { subjectId: 'c1', repoRoot: '/r', baselineSha: 'x', label: 'l', across: true, workItemId: 'wi1' } },
    { kind: 'file', rect: R('f1', 0, 1000), z: 7, source: { path: '/lanes/one/README.md' } },
    { kind: 'browser', rect: R('b1', 500, 1000), z: 8, url: 'http://localhost:3000/', preview: { root: '/lanes/one' } },
    { kind: 'note', rect: R('n9', 0, 1400), z: 9, links: [{ to: 'n10' }] },
    { kind: 'note', rect: R('n10', 500, 1400), z: 10 },
    { kind: 'terminal', rect: R('r1', 1000, 1400), z: 11 },
    { kind: 'work', rect: R('wk2', 3000, 0, 640, 220), z: 12, work: { itemId: 'wi2' }, links: [{ to: 'n9' }] },
    { kind: 'work', rect: R('wkX', 3000, 600, 640, 220), z: 13, work: { itemId: 'ghost' } }
  ]
  const cwds = { c1: '/lanes/one', t1: '/lanes/one/src', t2: '/lanes/one-2', adj: '/elsewhere', r1: '/elsewhere' }
  const cwdOf = (id) => cwds[id]
  const runs = [{ panelIds: ['c1', 'r1'] }]
  const wi1 = { id: 'wi1', panelId: 'c1', worktreeId: 'wt1' }
  const lane = { path: '/lanes/one', panelId: 'gone-origin' }
  let m1, m2, m3
  try {
    m1 = G.taskMembership({ item: wi1, panels: task, lane, cwdOf, runs })
    m2 = G.taskMembership({ item: { id: 'wi2' }, panels: task, cwdOf, runs })
    m3 = G.taskMembership({ item: { id: 'wi3', panelId: 'c-closed' }, panels: task, cwdOf, runs })
  } catch (e) { m1 = m2 = m3 = undefined; ok('task.members (threw)', false, String(e)) }
  const reasons = (m) => Object.fromEntries((m?.members ?? []).map((x) => [x.panelId, x.reason]))
  const got = reasons(m1)
  const want = { wk1: 'card', c1: 'conversation', rv1: 'review', t1: 'in-lane', f1: 'in-lane', b1: 'in-lane', n9: 'linked', r1: 'same-run' }
  ok('task.members.1 every explicit association lands with its own reason — card, conversation, review, a process/file/preview inside the lane, a link, a shared run — and a panel TOUCHING the card with no fact in common is not a member',
    m1 !== undefined && Object.entries(want).every(([id, r]) => got[id] === r) && got.adj === undefined,
    JSON.stringify(got))
  ok('task.members.2 a named member that is not on the canvas is MISSING with its reason, never a member — the closed conversation, and the lane origin the worktree record still names',
    m1 !== undefined && m3 !== undefined &&
      m1.missing.some((x) => x.panelId === 'gone-origin' && x.reason === 'lane-origin') &&
      m3.missing.some((x) => x.panelId === 'c-closed' && x.reason === 'conversation') &&
      m3.members.length === 0 && got['gone-origin'] === undefined,
    JSON.stringify({ m1: m1?.missing, m3 }))
  ok('task.members.3 links are ONE hop (the note linked from the linked note stays out) and a sibling directory (/lanes/one-2 beside /lanes/one) is not inside the lane',
    m1 !== undefined && got.n10 === undefined && got.t2 === undefined,
    JSON.stringify(got))
  ok('task.members.4 a panel is listed once, under its FIRST reason — the conversation also sits in the lane and stays `conversation`',
    m1 !== undefined && m1.members.filter((x) => x.panelId === 'c1').length === 1 &&
      new Set(m1.members.map((x) => x.panelId)).size === m1.members.length,
    JSON.stringify(m1?.members))
  let overlap
  try { overlap = G.tasksOfPanel('n9', [m1, m2]) } catch (e) { overlap = String(e) }
  ok('task.members.5 overlapping tasks: a note linked from two cards is a member of BOTH, and the reverse lookup answers both in order',
    Array.isArray(overlap) && overlap.join(',') === 'wi1,wi2',
    JSON.stringify(overlap))

  const titles = { wi1: 'Fix the flush gate', wi2: 'Ship the rail' }
  let arms
  try {
    const target = (id) => G.showTaskTarget(id, task, [m1, m2], titles)
    arms = { card: target('wk1'), member: target('t1'), both: target('n9'), none: target('adj'), ghost: target('wkX'), unknown: target('zzz') }
  } catch (e) { arms = String(e) }
  ok('task.show.target.1 the verb\'s decision: a card frames its task, a sole member frames the one task it is in, a member of two refuses NAMING both, a panel in no task and a card whose item left the board each refuse by name — and a frame carries only rects of panels on the canvas',
    typeof arms === 'object' &&
      arms.card.kind === 'frame' && arms.card.itemId === 'wi1' && arms.card.rects.length === m1.members.length &&
      arms.member.kind === 'frame' && arms.member.itemId === 'wi1' &&
      arms.both.kind === 'refused' && /Fix the flush gate/.test(arms.both.reason) && /Ship the rail/.test(arms.both.reason) &&
      arms.none.kind === 'refused' && /not part of any task/.test(arms.none.reason) &&
      arms.ghost.kind === 'refused' && /no longer on the board/.test(arms.ghost.reason) &&
      arms.unknown.kind === 'refused',
    JSON.stringify(arms))
}

// M204 (D08) — arrange.1–.3. ARRANGE THIS TASK: the task's own panels are
// compacted in reading order (M50's tidy), and the arrangement never lands on
// a panel OUTSIDE the task. The obstacle `o1` sits exactly where plain
// compaction would put the second member, so a plan that only tidied — the
// obvious version — overlaps it and goes red here.
{
  const R = (id, x, y, w = 400, h = 240) => ({ id, x, y, w, h })
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const P = (rect, extra = {}) => ({ kind: 'terminal', rect, z: 1, ...extra })
  let plan, spread
  try {
    spread = [P(R('m1', 0, 0)), P(R('m2', 2000, 40)), P(R('m3', 900, 1800)), P(R('o1', 424, 0)), P(R('lk', 3000, 3000), { locked: true })]
    plan = G.arrangePlan({ memberIds: ['m1', 'm2', 'm3', 'lk'], panels: spread, followers: [] })
  } catch (e) { plan = String(e) }
  const moved = typeof plan === 'object' && plan.kind === 'arrange' ? plan.rects : []
  const at = (id) => moved.find((r) => r.id === id)
  ok('arrange.1 a task\'s panels are compacted in reading order, never onto a panel outside the task, and a LOCKED member is neither moved nor overlapped',
    typeof plan === 'object' && plan.kind === 'arrange' && at('lk') === undefined && moved.length === 3 &&
      moved.every((r) => !hits(r, spread[3].rect) && !hits(r, spread[4].rect)) &&
      // compacted: the block is smaller than the spread it came from
      Math.max(...moved.map((r) => r.x + r.w)) - Math.min(...moved.map((r) => r.x)) < 2400 &&
      // reading order kept: m1 before m2 on the first row, m3 below them
      at('m1').x < at('m2').x && at('m3').y > at('m1').y &&
      // no two moved rects overlap each other
      moved.every((a, i) => moved.every((b, j) => i === j || !hits(a, b))),
    JSON.stringify(plan))
  let withCard
  try {
    const panels = [P(R('c1', 0, 0)), { kind: 'work', rect: R('wk', 424, 0, 640, 220), z: 2, work: { itemId: 'wi' } }, P(R('t1', 3000, 0)), P(R('o2', 1100, 0))]
    withCard = { panels, plan: G.arrangePlan({ memberIds: ['c1', 'wk', 't1'], panels, followers: [{ id: 'wk', leaderId: 'c1', dx: 424, dy: 0 }] }) }
  } catch (e) { withCard = String(e) }
  const wp = typeof withCard === 'object' && withCard.plan.kind === 'arrange' ? withCard.plan : null
  const c1 = wp && wp.rects.find((r) => r.id === 'c1')
  const t1 = wp && wp.rects.find((r) => r.id === 't1')
  const cardAt = c1 && { x: c1.x + 424, y: c1.y, w: 640, h: 220 }
  ok('arrange.2 a dispatched card FOLLOWS its conversation — it is never written, its anchor keeps its offset — and neither the card nor any member lands on a panel outside the task',
    wp !== null && wp.rects.every((r) => r.id !== 'wk') && c1 && t1 && cardAt &&
      !hits(cardAt, withCard.panels[3].rect) && !hits(t1, withCard.panels[3].rect) && !hits(t1, cardAt) && !hits(c1, withCard.panels[3].rect),
    JSON.stringify(withCard))
  let refusals
  try {
    const locked = [P(R('a', 0, 0), { locked: true }), P(R('b', 900, 0), { locked: true })]
    refusals = { allLocked: G.arrangePlan({ memberIds: ['a', 'b'], panels: locked, followers: [] }), none: G.arrangePlan({ memberIds: [], panels: locked, followers: [] }) }
  } catch (e) { refusals = String(e) }
  ok('arrange.3 a task with nothing it may move is REFUSED by name — every member locked, or no member at all — rather than answering `ran` over a no-op',
    typeof refusals === 'object' && refusals.allLocked.kind === 'refused' && /locked/.test(refusals.allLocked.reason) &&
      refusals.none.kind === 'refused' && refusals.none.reason.length > 10,
    JSON.stringify(refusals))
}

// M204 (D08, the critic) — arrange.4. A member the CALLER holds in place (a
// collapsed group's) is an obstacle, never moved, never covered; and a lane
// record that names no origin panel reports NOTHING missing — the '' fallback
// once reported a panel with no id as gone.
{
  const R = (id, x, y, w = 400, h = 240) => ({ id, x, y, w, h })
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const P = (rect) => ({ kind: 'terminal', rect, z: 1 })
  let plan, noOrigin
  try {
    const panels = [P(R('f1', 0, 0)), P(R('f2', 2000, 0)), P(R('f3', 424, 0))]
    plan = { panels, plan: G.arrangePlan({ memberIds: ['f1', 'f2', 'f3'], panels, followers: [], fixedIds: new Set(['f3']) }) }
    noOrigin = G.taskMembership({ item: { id: 'x' }, panels: [], lane: { path: '/l' }, cwdOf: () => undefined, runs: [] })
  } catch (e) { plan = String(e) }
  const moved = typeof plan === 'object' && plan.plan.kind === 'arrange' ? plan.plan.rects : null
  ok('arrange.4 a member held in place by the caller (a folded group\'s) is neither moved nor covered, and a lane record naming no origin reports nothing missing',
    moved !== null && moved.every((r) => r.id !== 'f3') && moved.every((r) => !hits(r, plan.panels[2].rect)) &&
      noOrigin && noOrigin.missing.length === 0,
    JSON.stringify({ plan, noOrigin }))
}

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exit(1)
