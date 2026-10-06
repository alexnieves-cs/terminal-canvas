/* Lane F2 (M437). The shared model: attention queue, task regions, zoom
   tiers, canvas↔world space. Plain node. Ids stay scoped.

   rd-f2.0 stays: the seam (markers, contracts, ownership) is still the
   registration proof.

   Watched red before the modules existed: esbuild could not resolve
   src/shared/attention-queue.ts (and the other four), so the suite exited
   before any ok() and the process status was 1. Restored by writing the
   modules the checks call. */
'use strict'
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

const css = read('src/renderer/styles.css')
const contracts = read('src/shared/redesign-contracts.ts')
const own = JSON.parse(read('docs/redesign/ownership.json'))
const open = '/* ── rd:F2 ── */'
const close = '/* ── /rd:F2 ── */'
ok('rd-f2.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['F2']) && own.lanes['F2'].some((g) => g.endsWith('verify-rd-f2.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify', 'rd-f2.cjs')
buildSync({
  stdin: {
    contents: `
      export { buildQueue, next, prev, ATTENTION_VERB } from '../src/shared/attention-queue'
      export { canvasToFloor, floorToCanvas, viewportToCamera, cameraToViewport, TIER_PITCH, FLOOR_SCALE } from '../src/shared/world-space'
      export { REGION_PAD, REGION_GRID, REGION_RADIUS, buildRegions, regionLabel, hitTestRegions, moveRegion, regionsFromMemberships, regionIdForPanel, distinctFromClusterPad } from '../src/renderer/canvas/task-regions'
      export { tierFor, TIER_TARGET, TIER_AT, TIER_HYSTERESIS, cardIdsForTier, enterTier } from '../src/renderer/canvas/zoom-tier'
      export { CLUSTER_PAD } from '../src/renderer/canvas/task-clusters'
      export { panelState } from '../src/renderer/panels/panel-state'
      export { assignTiers, LIVE_BUDGET, LIVE_MIN_SCALE } from '../src/renderer/canvas/lod'
      export { stewardWorldEvents, stewardWorldTally } from './fixtures/rd-steward/world-sim'
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-f2-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: {
    '@shared': join(ROOT, 'src', 'shared'),
    '@renderer': join(ROOT, 'src', 'renderer')
  },
  logLevel: 'silent'
})
const M = require(OUT)

const running = { kind: 'running', pid: 1, command: '', cwd: '', reattached: false }

// ── queue ────────────────────────────────────────────────────────────────────

{
  const word = (agent) => M.panelState({ kind: 'terminal', status: running, dormant: false }, agent).word
  const needs = word('wants-you')
  const inputs = [
    { panelId: 'fail', taskId: 't', since: 1, sentence: M.panelState({ kind: 'terminal', status: { kind: 'exited', code: 1 }, dormant: false }, 'exited').word, surface: 'terminal', failed: true },
    { panelId: 'ask', taskId: 't', since: 50, sentence: needs, surface: 'chat', agent: 'wants-you' },
    { panelId: 'allow-new', taskId: 't', since: 40, sentence: needs, surface: 'chat', agent: 'wants-you', approvalId: 'req-new' },
    { panelId: 'shell', taskId: null, since: 10, sentence: needs, surface: 'terminal', shellPrompt: true },
    { panelId: 'allow-old', taskId: 't', since: 5, sentence: needs, surface: 'chat', agent: 'wants-you', approvalId: 'req-old' },
    { panelId: 'rec', taskId: null, since: 2, sentence: M.panelState({ kind: 'terminal', status: { kind: 'idle' }, dormant: true }, 'idle').word, surface: 'terminal', recovery: true }
  ]
  const queue = M.buildQueue(inputs)
  const ids = queue.map((item) => item.id)
  const again = M.buildQueue([...inputs].reverse()).map((item) => item.id)
  const withExtra = M.buildQueue([...inputs, { panelId: 'ask-2', taskId: 't', since: 3, sentence: needs, surface: 'chat', agent: 'wants-you' }]).map((item) => item.id)
  const relative = (list) => list.filter((id) => ids.includes(id))
  ok('rd-queue.order.1 approvals, then questions, then shell prompts, then failures, then recovery; oldest first inside a kind; reversing the input does not reshuffle',
    ids.join(',') === 'approval:req-old,approval:req-new,question:ask,shell-prompt:shell,failed:fail,recovery:rec' &&
    again.join(',') === ids.join(',') &&
    relative(withExtra).join(',') === ids.join(',') &&
    queue.every((item, i) => i === 0 || item.kind !== queue[i - 1].kind || item.since >= queue[i - 1].since),
    ids.join(','))

  const verbs = queue.map((item) => `${item.kind}:${item.verb}`).join(',')
  ok('rd-queue.verb.1 the primary verb is the kind\'s label and the sentence is the one handed in, which is panelState\'s word',
    verbs === 'approval:Allow,approval:Allow,question:Reply,shell-prompt:Open,failed:Triage,recovery:Review' &&
    queue.find((item) => item.panelId === 'fail').sentence === 'exited 1' &&
    queue.find((item) => item.panelId === 'ask').sentence === needs &&
    needs === 'needs you' &&
    queue.find((item) => item.panelId === 'rec').sentence === 'asleep' &&
    M.buildQueue([{ panelId: 'busy', taskId: null, since: 1, sentence: word('busy'), surface: 'terminal', agent: 'busy' }]).length === 0,
    verbs)

  const walk = queue
  const last = walk[walk.length - 1].id
  const first = walk[0].id
  ok('rd-queue.walk.1 next and prev wrap, a stale cursor restarts from the end the direction implies, and an empty queue steps nowhere',
    M.next(walk, null) === first &&
    M.prev(walk, null) === last &&
    M.next(walk, last) === first &&
    M.prev(walk, first) === last &&
    M.next(walk, 'gone') === first &&
    M.prev(walk, 'gone') === last &&
    M.next(walk, walk[1].id) === walk[2].id &&
    M.prev(walk, walk[1].id) === walk[0].id &&
    M.next([walk[0]], walk[0].id) === walk[0].id &&
    M.next([], null) === null && M.prev([], 'x') === null,
    'wrap')

  // One panel, two facts: the approval wins and the failure is not a second item.
  const both = M.buildQueue([{ panelId: 'p', taskId: null, since: 1, sentence: needs, surface: 'chat', agent: 'wants-you', approvalId: 'r', failed: true }])
  ok('rd-queue.one.1 a panel is one item, and an approval outranks a failure on the same panel',
    both.length === 1 && both[0].kind === 'approval' && both[0].id === 'approval:r',
    JSON.stringify(both))
}

// ── regions ──────────────────────────────────────────────────────────────────

{
  const members = [
    { panelId: 'a', agent: true, rect: { x: 100, y: 100, w: 200, h: 150 } },
    { panelId: 'b', agent: true, rect: { x: 400, y: 120, w: 180, h: 160 } },
    { panelId: 'note', agent: false, rect: { x: 340, y: 300, w: 80, h: 40 } }
  ]
  const [region] = M.buildRegions([{
    id: 'ledger', ticket: 'SW-412', title: 'Ledger CSV export',
    criteriaDone: 2, criteriaTotal: 4, members
  }])
  const onGrid = [region.bounds.x, region.bounds.y, region.bounds.x + region.bounds.w, region.bounds.y + region.bounds.h]
    .every((n) => n % M.REGION_GRID === 0)
  // Padded union: x 76..604, y 76..364, snapped outward onto 24.
  const contains = members.every((m) =>
    m.rect.x >= region.bounds.x + M.REGION_PAD - M.REGION_GRID &&
    m.rect.y >= region.bounds.y + M.REGION_PAD - M.REGION_GRID)
  ok('rd-region.bounds.1 the union plus 24px padding snaps outward onto the 24px grid, the radius is 20, and the label is the chip\'s sentence',
    M.REGION_PAD === 24 && M.REGION_GRID === 24 && M.REGION_RADIUS === 20 &&
    M.distinctFromClusterPad() === true && M.CLUSTER_PAD !== M.REGION_PAD &&
    region.agentCount === 2 && onGrid &&
    region.bounds.x === 72 && region.bounds.y === 72 &&
    region.bounds.w === 552 && region.bounds.h === 312 &&
    contains &&
    M.regionLabel(region) === 'Ledger CSV export · SW-412 · 2 agents · 2 of 4 criteria' &&
    M.regionLabel({ ...region, ticket: null, agentCount: 1, criteriaTotal: 0 }) === 'Ledger CSV export · 1 agent' &&
    M.buildRegions([{ id: 'empty', ticket: null, title: 'Empty', criteriaDone: 0, criteriaTotal: 0, members: [] }]).length === 0,
    JSON.stringify(region.bounds))

  const other = M.buildRegions([
    { id: 'left', ticket: null, title: 'Left', criteriaDone: 0, criteriaTotal: 0, members: [{ panelId: 'l', agent: true, rect: { x: 0, y: 0, w: 48, h: 48 } }] },
    { id: 'right', ticket: null, title: 'Right', criteriaDone: 0, criteriaTotal: 0, members: [{ panelId: 'r', agent: true, rect: { x: 0, y: 0, w: 48, h: 48 } }] }
  ])
  // Identical bounds: the later region wins. A point in the padding (outside
  // the 48px member) still hits. The right and bottom edges belong to no one.
  const padPoint = { x: other[0].bounds.x + 1, y: other[0].bounds.y + 1 }
  const outside = { x: other[0].bounds.x - 1, y: other[0].bounds.y }
  const edge = { x: other[0].bounds.x + other[0].bounds.w, y: other[0].bounds.y }
  ok('rd-region.hit.1 a point in the padding hits, the later region wins a tie, and the far edges are exclusive',
    M.hitTestRegions(other, padPoint) === 'right' &&
    M.hitTestRegions([other[0]], padPoint) === 'left' &&
    M.hitTestRegions(other, outside) === null &&
    M.hitTestRegions(other, edge) === null &&
    other[0].bounds.w > 48,
    M.hitTestRegions(other, padPoint))

  const moved = M.moveRegion(
    [{ id: 'a', x: 10, y: 20, w: 30, h: 40 }, { id: 'b', x: 50, y: 60, w: 70, h: 80 }],
    24, -48
  )
  const back = M.moveRegion(moved.rects, -24, 48)
  ok('rd-region.move.1 moving a region is one plan that translates every member and nothing else, and the inverse restores them',
    Array.isArray(moved.rects) && moved.rects.length === 2 &&
    moved.rects[0].x === 34 && moved.rects[0].y === -28 && moved.rects[0].w === 30 && moved.rects[0].h === 40 &&
    moved.rects[1].x === 74 && moved.rects[1].y === 12 && moved.rects[1].w === 70 &&
    back.rects[0].x === 10 && back.rects[0].y === 20 && back.rects[1].x === 50 && back.rects[1].y === 60,
    JSON.stringify(moved.rects))

  // Two panels touch. Only a membership puts them in one region. A panel
  // named by two tasks is not given a region by guessing.
  const panels = [
    { panelId: 'near', agent: true, rect: { x: 0, y: 0, w: 100, h: 80 } },
    { panelId: 'far', agent: true, rect: { x: 100, y: 0, w: 100, h: 80 } }
  ]
  const memberships = [
    { itemId: 'one', members: [{ panelId: 'near', reason: 'conversation' }], missing: [] },
    { itemId: 'two', members: [{ panelId: 'far', reason: 'conversation' }, { panelId: 'near', reason: 'linked' }], missing: [] }
  ]
  const meta = {
    one: { ticket: null, title: 'One', criteriaDone: 0, criteriaTotal: 0 },
    two: { ticket: 'SW-1', title: 'Two', criteriaDone: 0, criteriaTotal: 0 }
  }
  const built = M.regionsFromMemberships(memberships, panels, meta)
  ok('rd-region.member.1 a region is the membership, not the neighbours, and a panel in two tasks is not assigned by guessing',
    built.length === 2 &&
    built[0].id === 'one' && built[0].agentCount === 1 &&
    built[1].agentCount === 2 &&
    M.regionIdForPanel('far', memberships, built) === 'two' &&
    M.regionIdForPanel('near', memberships, built) === null &&
    M.regionLabel(built[0]) === 'One · 1 agent',
    built.map((r) => `${r.id}:${r.agentCount}`).join(','))
}

// ── zoom tiers ───────────────────────────────────────────────────────────────

{
  const at = (scale, prev) => M.tierFor(scale, prev)
  const band = (prev, scales) => scales.map((s) => at(s, prev)).join(',')
  ok('rd-tier.hysteresis.1 a scale inside 0.70±0.02 does not leave its tier, and the same holds at 0.25',
    band('work', [0.72, 0.70, 0.68]).split(',').every((t) => t === 'work') &&
    band('plan', [0.68, 0.70, 0.72]).split(',').every((t) => t === 'plan') &&
    at(0.66, 'work') === 'plan' && at(0.73, 'plan') === 'work' &&
    band('plan', [0.24, 0.25, 0.27]).split(',').every((t) => t === 'plan') &&
    band('map', [0.23, 0.25, 0.27]).split(',').every((t) => t === 'map') &&
    at(0.21, 'plan') === 'map' && at(0.28, 'map') === 'plan' &&
    at(0.70, undefined) === 'work' && at(0.699, undefined) === 'plan' &&
    at(0.25, undefined) === 'plan' && at(0.249, undefined) === 'map' &&
    M.TIER_AT.work === 0.70 && M.TIER_AT.plan === 0.25 && M.TIER_HYSTERESIS === 0.03,
    `work ${band('work', [0.72, 0.70, 0.68])} plan ${band('plan', [0.68, 0.70, 0.72])}`)

  // 0.60 is plan and still above LIVE_MIN_SCALE, so without cardIds the
  // focused panel would stay live. That is the rule this must not change.
  const ids = ['term', 'other']
  const entry = M.enterTier({ scale: 0.60, prev: 'work', focusedId: 'term', panelIds: ids })
  const rects = ids.map((id, i) => ({ id, x: i * 400, y: 0, w: 300, h: 200 }))
  const size = { width: 1440, height: 900 }
  const base = { rects, size, lastFocusedAt: {}, viewport: { x: 0, y: 0, scale: 0.60 } }
  const released = M.assignTiers({ ...base, focusedId: entry.releaseFocus ? null : 'term', cardIds: entry.cardIds })
  const stillFocused = M.assignTiers({ ...base, focusedId: 'term', cardIds: new Set() })
  const forcedWhileFocused = M.assignTiers({ ...base, focusedId: 'term', cardIds: entry.cardIds })
  const backToWork = M.enterTier({ scale: M.TIER_TARGET.work, prev: 'plan', focusedId: 'term', panelIds: ids })
  ok('rd-tier.card.1 entering plan releases focus and cards every panel through lod cardIds, so nothing live remains to take a keystroke',
    entry.tier === 'plan' && entry.releaseFocus === true &&
    entry.cardIds.has('term') && entry.cardIds.has('other') &&
    released.term === 'card' && released.other === 'card' &&
    stillFocused.term === 'live' &&
    forcedWhileFocused.term === 'card' &&
    backToWork.tier === 'work' && backToWork.releaseFocus === false && backToWork.cardIds.size === 0 &&
    M.cardIdsForTier('map', ids).size === 2 && M.cardIdsForTier('work', ids).size === 0 &&
    M.LIVE_BUDGET === 8 && M.LIVE_MIN_SCALE === 0.5,
    JSON.stringify({ entry: { tier: entry.tier, releaseFocus: entry.releaseFocus }, released, stillFocused }))

  const fromWork = M.tierFor(M.TIER_TARGET.plan, 'work')
  const fromMap = M.tierFor(M.TIER_TARGET.plan, 'map')
  ok('rd-tier.target.1 ⌘1/2/3 land inside the tier they name, from either neighbour',
    M.TIER_TARGET.work === 1 && M.TIER_TARGET.plan === 0.34 && M.TIER_TARGET.map === 0.18 &&
    M.tierFor(M.TIER_TARGET.work, 'plan') === 'work' &&
    fromWork === 'plan' && fromMap === 'plan' &&
    M.tierFor(M.TIER_TARGET.map, 'plan') === 'map' &&
    M.tierFor(M.TIER_TARGET.work, 'map') === 'work',
    `${fromWork}/${fromMap}`)
}

// ── world space ──────────────────────────────────────────────────────────────

{
  const mulberry = (seed) => () => {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rnd = mulberry(0xF2)
  const tiers = ['work', 'plan', 'map']
  let worst = 0
  let points = 0
  for (let i = 0; i < 1000; i++) {
    const p = { x: rnd() * 8000 - 2000, y: rnd() * 8000 - 2000 }
    const back = M.floorToCanvas(M.canvasToFloor(p))
    worst = Math.max(worst, Math.abs(back.x - p.x), Math.abs(back.y - p.y))
    const vp = { x: rnd() * 4000 - 1000, y: rnd() * 4000 - 1000, scale: 0.12 + rnd() * 2.4 }
    const size = { width: 640 + rnd() * 1600, height: 480 + rnd() * 1200 }
    const tier = tiers[i % 3]
    const pose = M.viewportToCamera(vp, size, tier)
    const vp2 = M.cameraToViewport(pose, size)
    const c1x = (size.width / 2 - vp.x) / vp.scale
    const c1y = (size.height / 2 - vp.y) / vp.scale
    const c2x = (size.width / 2 - vp2.x) / vp2.scale
    const c2y = (size.height / 2 - vp2.y) / vp2.scale
    worst = Math.max(worst, Math.abs(vp2.x - vp.x), Math.abs(vp2.y - vp.y), Math.abs(c1x - c2x), Math.abs(c1y - c2y), Math.abs(vp2.scale - vp.scale) * size.height)
    if (pose.pitch !== M.TIER_PITCH[tier]) worst = Infinity
    points += 1
  }
  const sample = { width: 1440, height: 900 }
  const distances = tiers.map((tier) => M.viewportToCamera({ x: 0, y: 0, scale: M.TIER_TARGET[tier] }, sample, tier).distance)
  ok('rd-space.round.1 a canvas point and a viewport survive a floor round trip within 1px, over 1,000 random points and viewports',
    points === 1000 && worst < 1 && Number.isFinite(worst) && M.FLOOR_SCALE === 100,
    `worst ${worst}`)
  ok('rd-space.pitch.1 work is the close pitch, plan the room, map near top-down, and the tier targets stand further back as the view rises',
    M.TIER_PITCH.work < M.TIER_PITCH.plan && M.TIER_PITCH.plan < M.TIER_PITCH.map &&
    M.TIER_PITCH.map > Math.PI / 3 && M.TIER_PITCH.map < Math.PI / 2 &&
    distances[0] < distances[1] && distances[1] < distances[2],
    distances.map((d) => d.toFixed(3)).join(','))
}

// ── one queue, named sites ───────────────────────────────────────────────────

{
  // The pill and the dock exist and belong to F3. The Sessions count lands
  // with L-D; F3 adds the Sessions host, which is not in the tree at F2.
  // This check names those sites and does not invent the missing file.
  // A site that already imports the hook must not also build a queue. A site
  // F3 has not wired yet must not have started a private one either. The
  // only buildQueue( calls under src/ are the function and the hook.
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  const walk = (rel) => {
    const { readdirSync, statSync } = require('node:fs')
    const abs = join(ROOT, rel)
    return readdirSync(abs).flatMap((name) => {
      const child = join(abs, name)
      if (statSync(child).isDirectory()) return walk(join(rel, name))
      return /\.tsx?$/.test(name) ? [join(rel, name)] : []
    })
  }
  const callers = walk('src').filter((rel) => /buildQueue\s*\(/.test(strip(read(rel) || '')))
  const sites = [
    ['src/renderer/canvas/CommandPill.tsx', 'pill'],
    ['src/renderer/shell/Dock.tsx', 'dock badge']
  ]
  const problems = []
  for (const [rel, role] of sites) {
    const text = read(rel)
    if (text === null) { problems.push(`${role} missing`); continue }
    const body = strip(text)
    if (/buildQueue\s*\(/.test(body) || /attention-queue/.test(body)) problems.push(`${role} builds a queue`)
    if (body.includes('useAttentionQueue') && /reachableQueue\s*\(/.test(body)) problems.push(`${role} imports the hook and still counts`)
  }
  const sessions = 'src/renderer/sessions/SessionsHost.tsx'
  if (read(sessions) !== null) {
    const body = strip(read(sessions))
    if (!body.includes('useAttentionQueue')) problems.push('SessionsHost does not import useAttentionQueue')
    if (/buildQueue\s*\(/.test(body)) problems.push('SessionsHost builds a queue')
  }
  const hook = read('src/renderer/session/useAttentionQueue.ts') || ''
  const hookOk = hook.includes('buildQueue') && hook.includes('useAttentionIds') &&
    hook.includes('getLiveSession') && hook.includes('useApprovals') && hook.includes('panelState')
  const onlyHook = callers.length === 2 && callers.every((rel) => rel.endsWith('attention-queue.ts') || rel.endsWith('useAttentionQueue.ts'))
  ok('rd-attn.one.1 the pill, the dock badge and the Sessions count share useAttentionQueue; none of them builds a queue, and the Sessions host is not invented',
    problems.length === 0 && hookOk && onlyHook,
    JSON.stringify({ problems, callers, sessionsHost: read(sessions) !== null }))
}

// ── steward fixture ──────────────────────────────────────────────────────────

{
  const workspace = JSON.parse(read('scripts/fixtures/rd-steward/workspace.json'))
  const regions = M.buildRegions(workspace.tasks.map((task) => ({
    id: task.id,
    ticket: task.ticket,
    title: task.title,
    criteriaDone: task.criteriaDone,
    criteriaTotal: task.criteriaTotal,
    members: task.panels.map((panel) => ({ panelId: panel.id, agent: panel.agent === true, rect: panel.rect }))
  })))
  const byId = new Map(regions.map((r) => [r.id, r]))
  const ledger = byId.get('ledger-csv')
  const events = M.stewardWorldEvents(workspace.tasks, 1_700_000_000_000)
  const tally = M.stewardWorldTally(events)
  const kinds = new Set(workspace.tasks.flatMap((task) => task.panels.map((panel) => panel.attention).filter(Boolean)))
  ok('rd-steward.1 five tasks from the mockups, the ledger chip, and a world feed with 3 waiting, 1 failed and 4 working',
    regions.length === 5 &&
    ledger !== undefined && M.regionLabel(ledger) === 'Ledger CSV export · SW-412 · 3 agents · 2 of 4 criteria' &&
    byId.get('plaid') !== undefined && M.regionLabel(byId.get('plaid')).startsWith('Plaid webhook retry · SW-398 · ') &&
    byId.get('infra') !== undefined && byId.get('infra').ticket === null &&
    byId.get('pricing') !== undefined &&
    byId.get('mobile') !== undefined && byId.get('mobile').ticket === 'SW-421' &&
    kinds.has('approval') && kinds.has('question') && kinds.has('shell-prompt') && kinds.has('failed') &&
    tally.waiting === 3 && tally.failed === 1 && tally.working === 4 &&
    events.every((event) => event.seq >= 1),
    JSON.stringify({ labels: regions.map((r) => M.regionLabel(r)), tally, kinds: [...kinds] }))
}

// ── live sessions and the steward loader ────────────────────────────────────

{
  const liveOut = join(ROOT, 'out', 'verify', 'rd-f2-live.cjs')
  buildSync({
    stdin: {
      contents: `
        export { subscribeLiveSessions, applyLiveSession, clearLiveSession } from '../src/renderer/session/live-session-store'
        export { parseLayout } from '../src/shared/layout-schema'
      `,
      resolveDir: __dirname,
      sourcefile: 'rd-f2-live.ts',
      loader: 'ts'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: liveOut,
    alias: {
      '@shared': join(ROOT, 'src', 'shared'),
      '@renderer': join(ROOT, 'src', 'renderer')
    },
    logLevel: 'silent'
  })
  const L = require(liveOut)
  let n = 0
  const off = L.subscribeLiveSessions(() => { n += 1 })
  L.applyLiveSession('p', '/a', 'ls')
  L.applyLiveSession('p', '/a', 'ls')
  L.applyLiveSession('p', '/b', 'ls')
  L.clearLiveSession('p')
  const during = n
  off()
  L.applyLiveSession('p', '/c', 'pwd')
  L.clearLiveSession('p')
  ok('rd-live.sub.1 subscribeLiveSessions fires when a cwd or command changes, not on a repeat, and not after unsubscribe',
    during === 3 && n === 3,
    JSON.stringify({ during, n }))

  const { readWorkspace, stewardLayout } = require('./fixtures/rd-steward/load.cjs')
  const workspace = readWorkspace(ROOT)
  const wanted = workspace.tasks.flatMap((task) => task.panels.map((panel) => panel.id))
  const parsed = L.parseLayout(JSON.stringify(stewardLayout(workspace, '/tmp/steward')))
  const got = new Set((parsed.snapshot.workspaces[0]?.panels ?? []).map((panel) => panel.id))
  const missing = wanted.filter((id) => !got.has(id))
  const dropped = parsed.warnings.filter((w) => /dropped a panel|dropped work item/.test(w))
  const indexSrc = read('src/main/index.ts') || ''
  const shotSrc = read('scripts/shot.cjs') || ''
  const hook = read('src/renderer/session/useAttentionQueue.ts') || ''
  ok('rd-steward.load.1 the shared loader keeps every fixture panel, and dev and shot both take TC_FIXTURE=rd-steward',
    missing.length === 0 && dropped.length === 0 && wanted.length === got.size &&
    /subscribeLiveSessions/.test(hook) &&
    /TC_FIXTURE === 'rd-steward'/.test(indexSrc) && /setPath\('userData'/.test(indexSrc) &&
    /!app\.isPackaged/.test(indexSrc) && /writeStewardLayout/.test(indexSrc) &&
    /TC_FIXTURE === 'rd-steward'/.test(shotSrc) && /writeStewardLayout/.test(shotSrc) &&
    /writeFixtureLayout\(\)/.test(shotSrc),
    JSON.stringify({ missing, dropped, wanted: wanted.length, got: got.size, warnings: parsed.warnings }))
}

// ── purity ───────────────────────────────────────────────────────────────────

{
  const shared = ['src/shared/attention-queue.ts', 'src/shared/world-space.ts']
  const leaks = shared.filter((rel) => /@renderer|renderer\//.test(read(rel) || ''))
  const lod = read('src/renderer/canvas/lod.ts') || ''
  ok('rd-f2.pure.1 the shared modules do not import the renderer, and lod.ts still has its budget, its scale floor and the focused-panel rule',
    leaks.length === 0 &&
    /export const LIVE_BUDGET = 8/.test(lod) &&
    /export const LIVE_MIN_SCALE = 0\.5/.test(lod) &&
    /keystrokes must never land in a card/.test(lod) &&
    /!dormant\.has\(focusedId\)/.test(lod),
    leaks.join(','))
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
