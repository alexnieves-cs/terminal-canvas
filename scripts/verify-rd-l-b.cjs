/* Lane L-B (M442, M443). Plain node. Ids stay scoped.

   rd-l-b.0 stays: the seam (markers, contracts, ownership) is still the
   registration proof.

   Watched red before the modules existed: esbuild could not resolve
   src/renderer/panels/header-rest.ts, so the suite exited before any ok()
   past the seam and the process status was 1. Restored by writing the
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
const open = '/* ── rd:L-B ── */'
const close = '/* ── /rd:L-B ── */'
ok('rd-l-b.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['L-B']) && own.lanes['L-B'].some((g) => g.endsWith('verify-rd-l-b.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const span = css.slice(css.indexOf(open), css.indexOf(close))
const canvas = read('src/renderer/canvas/Canvas.tsx') || ''
const commands = read('src/renderer/palette/commands.ts') || ''
const shortcuts = read('src/shared/shortcuts.ts') || ''
const cluster = read('src/renderer/canvas/TaskClusterLayer.tsx') || ''
const approvalUi = read('src/renderer/shell/ApprovalDetail.tsx') || ''
const guides = read('src/renderer/canvas/SnapGuides.tsx') || ''

const OUT = join(ROOT, 'out', 'verify', 'rd-l-b.cjs')
buildSync({
  stdin: {
    contents: `
      export { formatDuration, statePill, headerAllows } from '../src/renderer/panels/header-rest'
      export { allowPendingTarget, allowCommandId } from '../src/renderer/palette/commands/approval-row'
      export { regionLabel } from '../src/renderer/canvas/task-regions'
      export { sessionFacts, criteriaChecklist } from '../src/renderer/panels/session-facts'
      export { connectedSpawnMenu } from '../src/renderer/panels/connected-spawn'
      export { applyMakeTask } from '../src/renderer/panels/make-task'
      export { makePanel, PANEL_W, PANEL_H } from '../src/renderer/panels/panels'
      export { noteSpawnCursor, spawnCursor, spawnSize } from '../src/renderer/panels/spawn-cursor'
      export { smartSnap } from '../src/renderer/canvas/arrange'
      export { TIDY_GAP } from '../src/renderer/canvas/placement'
      export { taskMembership } from '../src/renderer/canvas/task-members'
      export { regionsFromMemberships } from '../src/renderer/canvas/task-regions'
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-l-b-entry.ts',
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

// ── header duration, never a metric ──────────────────────────────────────────

ok('rd-l-b.header.1 state pill is a duration',
  M.statePill('working', 12 * 60 * 1000) === 'working · 12m' &&
  M.headerAllows('working · 12m') === true &&
  M.headerAllows('working · $1.20') === false &&
  M.headerAllows('working · 400 tokens') === false,
  M.statePill('working', 12 * 60 * 1000))

ok('rd-l-b.wait.1 waiting duration',
  M.formatDuration(100000) === '1m 40s' &&
  /Allow/.test(approvalUi) && /View diff/.test(approvalUi) && /Deny/.test(approvalUi),
  M.formatDuration(100000))

// ── ⌘Y through the same door as the palette row ─────────────────────────────

{
  const selected = M.allowPendingTarget({
    selectionEmpty: false,
    selectedId: 'p1',
    approvals: [{ id: 'p1', requestId: 'r1' }, { id: 'p2', requestId: 'r2' }],
    queueHeadId: 'p2'
  })
  const head = M.allowPendingTarget({
    selectionEmpty: true,
    selectedId: null,
    approvals: [{ id: 'p2', requestId: 'r2' }],
    queueHeadId: 'p2'
  })
  const quiet = M.allowPendingTarget({
    selectionEmpty: false,
    selectedId: 'p9',
    approvals: [{ id: 'p2', requestId: 'r2' }],
    queueHeadId: 'p2'
  })
  const multi = M.allowPendingTarget({
    selectionEmpty: false,
    selectedId: null,
    approvals: [{ id: 'p2', requestId: 'r2' }],
    queueHeadId: 'p2'
  })
  ok('rd-l-b.allow.1 Cmd+Y uses answerApproval',
    selected !== null && selected.panelId === 'p1' && selected.requestId === 'r1' &&
    head !== null && head.panelId === 'p2' &&
    quiet === null && multi === null &&
    M.allowCommandId('p1', 'r1') === 'approval.allow.p1.r1' &&
    /id: `approval\.allow\.\$\{a\.id\}\.\$\{a\.requestId\}`/.test(commands) &&
    /run: \(\) => actions\.answerApproval\(a\.id, a\.requestId, true\)/.test(commands) &&
    /allowPendingTarget\(/.test(canvas) &&
    /answerApproval\(target\.panelId, target\.requestId, true\)/.test(canvas),
    JSON.stringify({ selected, head, quiet, multi }))
}

// ── task region chip ─────────────────────────────────────────────────────────

ok('rd-l-b.region.1 region chip',
  M.regionLabel({ title: 'Ledger CSV export', ticket: 'SW-412', agentCount: 3, criteriaDone: 2, criteriaTotal: 4 }) === 'Ledger CSV export · SW-412 · 3 agents · 2 of 4 criteria' &&
  M.regionLabel({ title: 'Solo', ticket: null, agentCount: 0, criteriaDone: 0, criteriaTotal: 0 }) === 'Solo' &&
  /regionLabel\(/.test(cluster) &&
  /1px dashed/.test(span) && /var\(--r-region\)/.test(span) && /padding:\s*var\(--sp-7\)/.test(span) && /--sp-7:\s*24px/.test(css),
  'chip, zero facts omitted, layer calls regionLabel')

// ── chromeless well does not change on header hover ──────────────────────────

{
  const chrome = css.match(/\.pf--kind-terminal:has\(\.panel__slot\) \.pf__chrome \{[^}]+\}/)
  const absolute = chrome !== null && /position:\s*absolute/.test(chrome[0])
  const touchesWell = /\.panel__slot|\.xterm\b|\.pf__body|\.pf__keep/.test(span)
  ok('rd-l-b.well.1 header hover changes the well by 0px',
    absolute && !touchesWell,
    touchesWell ? 'lane CSS names the well' : 'chromeless chrome stays absolute')
}

// ── wave-2 slots are mounts, not hooks ───────────────────────────────────────

ok('rd-l-b.slot.1 tier layer and recovery slot',
  /<TierLayer\b/.test(canvas) && /data-tier-layer/.test(cluster) && /data-recovery-slot/.test(canvas) &&
  /\.tier-layer\s*\{[^}]*position:\s*absolute/.test(span) &&
  /\.tier-layer\s*\{[^}]*width:\s*0/.test(span) &&
  /\.tier-layer\s*\{[^}]*height:\s*0/.test(span),
  'JSX mounts; tier layer is a zero-size absolute box')

// ── a handoff edge moves only while something crosses it ─────────────────────

{
  const firing = css.split('.link-layer__line[data-edge-activity="firing"] {')[1]?.split('}')[0] ?? ''
  ok('rd-l-b.handoff.1 firing is the only animated edge',
    /animation:\s*edge-current/.test(firing) &&
    !/\.link-layer__line\s*\{[^}]*animation/.test(css),
    'rest lines carry no animation')
}

// ── inspector session and criteria ───────────────────────────────────────────

{
  const facts = M.sessionFacts({ state: 'working', agent: 'Claude Code', folder: '~/ledger', branch: 'export', host: 'tmux · survives quit', usage: '$0.40' })
  const labels = facts.map((f) => f.label)
  const bare = M.sessionFacts({ state: 'idle' })
  const list = M.criteriaChecklist(['a', 'b', 'c', 'd'], ['a', 'b'])
  const inspector = read('src/renderer/shell/Inspector.tsx') || ''
  ok('rd-l-b.inspector.1 session facts and criteria',
    JSON.stringify(labels) === JSON.stringify(['State', 'Agent', 'Folder', 'Branch', 'Host', 'Usage']) &&
    bare.length === 1 && bare[0].label === 'State' &&
    list.label === '2 of 4' && list.rows.filter((r) => r.met).length === 2 &&
    /sessionFacts\(/.test(inspector) && /data-rd-primary/.test(inspector) &&
    !/data-inspector-action="review"/.test(span),
    JSON.stringify({ labels, criteria: list.label }))
}

// ── connected spawn ──────────────────────────────────────────────────────────

{
  const menu = M.connectedSpawnMenu('Claude', [{ id: 'plan', name: 'Plan' }])
  ok('rd-l-b.menu.1 connected spawn is a handoff on exit',
    menu.title === 'New object connected to Claude' &&
    menu.agents.map((row) => row.label).join(',') === 'Claude Code,Codex,Shell' &&
    menu.foot === 'Starts when Claude finishes, with its summary as input' &&
    menu.handoff.trigger === 'exit' && menu.handoff.kind === 'handoff' && menu.handoff.enabled === true &&
    /openConnectedSpawn\(/.test(canvas) &&
    /trigger: 'exit'/.test(canvas),
    menu.title)
}

// ── 24px gap, only when asked ────────────────────────────────────────────────

{
  const left = { id: 'l', x: 0, y: 0, w: 100, h: 100 }
  const near = { id: 'r', x: 140, y: 0, w: 100, h: 100 }
  const snapped = M.smartSnap(near, [left], 30, { spacing: true, grid: null, gapGrid: 24 })
  const plain = M.smartSnap(near, [left], 30, { spacing: true, grid: null })
  const far = M.smartSnap({ id: 'r', x: 400, y: 0, w: 100, h: 100 }, [left], 8, { spacing: true, grid: null, gapGrid: 24 })
  ok('rd-l-b.gap.1 gaps snap to 24 when the drag is close',
    snapped.rect.x === 124 && plain.rect.x === 140 && far.rect.x === 400 &&
    M.TIDY_GAP === 24 &&
    /s\.gap/.test(guides) &&
    /gapGrid: 24/.test(canvas) &&
    /smartSnap\(rect,/.test(canvas),
    JSON.stringify({ snapped: snapped.rect.x, plain: plain.rect.x, far: far.rect.x }))
}

// ── marquee toolbar and make-task ────────────────────────────────────────────

{
  const marquee = read('src/renderer/canvas/MarqueeLayer.tsx') || ''
  const a = M.makePanel('a', { x: 0, y: 0 }, 1)
  const b = M.makePanel('b', { x: 800, y: 0 }, 2)
  const made = M.applyMakeTask({ panels: [a, b], selectedIds: ['a', 'b'], cardId: 'card', itemId: 'item', now: 1, title: 'Ledger' })
  const membership = made === null ? null : M.taskMembership({ item: { id: 'item' }, panels: made.panels, cwdOf: () => undefined, runs: [] })
  const regions = made === null || membership === null ? [] : M.regionsFromMemberships(
    [membership],
    made.panels.map((panel) => ({ panelId: panel.rect.id, rect: panel.rect, agent: panel.kind === 'terminal' })),
    { item: { ticket: null, title: 'Ledger', criteriaDone: 0, criteriaTotal: 0 } }
  )
  const memberIds = membership === null ? [] : membership.members.map((member) => member.panelId).sort()
  ok('rd-l-b.marquee.1 toolbar and one task from the selection',
    /Align/.test(marquee) && /Tidy/.test(marquee) && /Make task/.test(marquee) && /Pause all/.test(marquee) &&
    /tidy-alias/.test(shortcuts) &&
    /applyMakeTask\(/.test(canvas) &&
    made !== null && made.item.id === 'item' && made.item.source === 'typed' &&
    memberIds.includes('a') && memberIds.includes('b') && memberIds.includes('card') &&
    regions.length === 1 &&
    M.applyMakeTask({ panels: [a], selectedIds: [], cardId: 'c', itemId: 'i', now: 1 }) === null,
    JSON.stringify(memberIds))
}

// ── cursor spawn ─────────────────────────────────────────────────────────────

{
  M.noteSpawnCursor(null)
  const absent = M.spawnCursor()
  M.noteSpawnCursor({ x: 12, y: 34 })
  const noted = M.spawnCursor()
  const sized = M.spawnSize([{ rect: { id: 'a', w: 400, h: 300 } }], new Set(['a']))
  const fallback = M.spawnSize([], new Set())
  ok('rd-l-b.cursor.1 spawn follows the cursor when one was recorded',
    absent === null && noted !== null && noted.x === 12 && noted.y === 34 &&
    sized.w === 400 && sized.h === 300 &&
    fallback.w === M.PANEL_W && fallback.h === M.PANEL_H &&
    /spawnCursor\(\)/.test(canvas) && /atCursor/.test(canvas),
    JSON.stringify({ absent, noted, sized, fallback }))
}

ok('rd-l-b.rest.1 the skill count and the auto dismiss stay at rest after the seam re-hides chrome verbs',
  span.indexOf('.pf__chrome .pf__trail, .pf__chrome .chat__auto-dismiss { opacity: 1; }') >
    span.lastIndexOf('.pf__chrome button, .pf__chrome .pf__verb'),
  'exemption follows the later opacity 0')

ok('rd-l-b.settle.1 settle overshoots and reduced motion drops it',
  /translateY\(-3px\)/.test(span) &&
  /prefers-reduced-motion:\s*reduce/.test(span) &&
  /animation:\s*none/.test(span) &&
  !/translateY\(-3px\)/.test((css.split('@keyframes panel-settle {')[1] ?? '').split('}')[0]),
  'overshoot lives in the lane span; the base keyframes do not')

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
