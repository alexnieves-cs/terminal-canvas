/* Lane P (M580–M589) — the multiplayer canvas: HANDOFFS (an agent passed to a
   teammate, by name or to anyone, and who holds it now) and the SHARED REVIEW
   QUEUE (a result put in front of the team, claimed, judged, closed), both in
   the workspace Y.Doc the shared canvas already rides, judged per operation in
   the app AND in the collab server's hooks.
   Run with: npm run verify:multiplayer

   Plain node. REAL yjs throughout: three canvas-syncs (main's binding) over an
   in-process doc relay, and a REAL Hocuspocus server with REAL providers over a
   loopback socket — its onAuthenticate and beforeSync are the ones
   server/collab ships, with only the Supabase lookup stubbed (the
   verify:canvas-sync shape, which this file copies rather than imports so the
   two suites never share state).

   What this cannot see: a live two-Mac run, and the renderer drawing a row —
   a DOM fact for an Electron suite. */
'use strict'
const { buildSync } = require('esbuild')
const { mkdirSync, readFileSync } = require('node:fs')
const { createServer } = require('node:net')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
mkdirSync(join(root, 'out/verify'), { recursive: true })
buildSync({
  stdin: {
    contents: [
      "module.exports = {",
      "  ops: require('./src/shared/canvas-ops.ts'),",
      "  doc: require('./src/shared/canvas-doc.ts'),",
      "  flow: require('./src/shared/team-flow.ts'),",
      "  sync: require('./src/main/presence/canvas-sync.ts'),",
      "  auth: require('./server/collab/auth.ts'),",
      "  server: require('./server/collab/server.ts'),",
      "}"
    ].join('\n'),
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/multiplayer.cjs'),
  // Packages stay external so yjs is ONE instance across this file, the
  // bundle, the server and the provider (verify:canvas-sync's reason).
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', packages: 'external',
  alias: { '@shared': join(root, 'src/shared') }
})
const M = require('../out/verify/multiplayer.cjs')
const Y = require('yjs')
const { HocuspocusProvider } = require('@hocuspocus/provider')

const SHARE = '11111111-2222-4333-8444-555555555555'
const ORG = '99999999-8888-4777-8666-555555555555'
const UA = 'aaaaaaaa-0000-4000-8000-000000000001'
const UB = 'bbbbbbbb-0000-4000-8000-000000000002'
const UC = 'cccccccc-0000-4000-8000-000000000003'
const UV = 'dddddddd-0000-4000-8000-000000000004'
const NAMES = { [UA]: 'Ada', [UB]: 'Bea', [UC]: 'Cal' }
const nameOf = (_w, u) => NAMES[u] ?? null
const panel = (id, extra = {}) => ({ id, kind: 'chat', title: `agent ${id}`, x: 0, y: 0, w: 400, h: 300, z: 1, ...extra })
const settle = () => new Promise((r) => setTimeout(r, 0))

function machine({ host, userId, role, panels = [] }) {
  const ws = { panels: panels.map((p) => ({ ...p })), groups: [] }
  const share = { id: SHARE, orgId: ORG, role }
  const store = { crdt: null }
  let flowPushes = 0
  let clock = 1000
  const sync = M.sync.createCanvasSync({
    host: () => host,
    userId: () => userId,
    share: () => share,
    activeWorkspaceId: () => 'w1',
    local: () => ({ panels: ws.panels, groups: ws.groups }),
    loadState: () => store.crdt,
    saveState: (_id, bytes) => { store.crdt = bytes },
    applyToStore: () => {},
    emit: () => {},
    onFlow: () => { flowPushes++ },
    now: () => (clock += 10)
  })
  const doc = new Y.Doc()
  return { sync, doc, store, flowPushes: () => flowPushes, bind() { sync.bind('w1', doc) } }
}

/** Every doc joined like one Hocuspocus room: each update reaches all the others. */
function room(...docs) {
  for (const a of docs) for (const b of docs) if (a !== b) Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'relay')
  for (const a of docs) a.on('update', (u, origin) => { if (origin === 'relay') return; for (const b of docs) if (b !== a) Y.applyUpdate(b, u, 'relay') })
}

function freePort() {
  return new Promise((resolve) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) }) })
}
async function until(pred, ms = 3000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (pred()) return true; await new Promise((r) => setTimeout(r, 20)) }
  return pred()
}

;(async () => {
  // ── M581: the role table ────────────────────────────────────────────────
  {
    const A = M.ops.authorizeCanvasOp
    const h = (over = {}) => ({ id: 'ha_h1', panel: 'ha_c1', from: UA, to: UB, note: 'tests are flaky on CI, rerun twice', scrubbed: 0, at: 1, n: 1, ...over })
    const held = { userId: UA, panelOwner: UA, panelSteward: UA, panelHandoffOpen: false, panelHanded: 0 }
    const verdicts = {
      open: A('editor', { kind: 'handoff-open', handoff: h() }, held),
      openViewer: A('viewer', { kind: 'handoff-open', handoff: h() }, held),
      openOthersName: A('owner', { kind: 'handoff-open', handoff: h({ from: UB }) }, held),
      openNotHolder: A('owner', { kind: 'handoff-open', handoff: h() }, { ...held, panelSteward: UB }),
      openTwice: A('owner', { kind: 'handoff-open', handoff: h() }, { ...held, panelHandoffOpen: true }),
      openWrongN: A('owner', { kind: 'handoff-open', handoff: h({ n: 3 }) }, held),
      openToSelf: A('owner', { kind: 'handoff-open', handoff: h({ to: UA }) }, held),
      openLong: A('owner', { kind: 'handoff-open', handoff: h({ note: 'x'.repeat(M.ops.HANDOFF_NOTE_MAX + 1) }) }, held),
      openGone: A('owner', { kind: 'handoff-open', handoff: h() }, { userId: UA, panelOwner: null, panelSteward: null }),
      take: A('editor', { kind: 'handoff-reply', handoffId: 'ha_h1', by: UB, reply: 'accept' }, { userId: UB, panelOwner: null, handoff: { from: UA, to: UB, settled: false } }),
      takeOthers: A('editor', { kind: 'handoff-reply', handoffId: 'ha_h1', by: UC, reply: 'accept' }, { userId: UC, panelOwner: null, handoff: { from: UA, to: UB, settled: false } }),
      takeOpen: A('editor', { kind: 'handoff-reply', handoffId: 'ha_h1', by: UC, reply: 'accept' }, { userId: UC, panelOwner: null, handoff: { from: UA, to: '', settled: false } }),
      takeAsSomeone: A('editor', { kind: 'handoff-reply', handoffId: 'ha_h1', by: UB, reply: 'accept' }, { userId: UC, panelOwner: null, handoff: { from: UA, to: '', settled: false } }),
      takeOwn: A('owner', { kind: 'handoff-reply', handoffId: 'ha_h1', by: UA, reply: 'accept' }, { userId: UA, panelOwner: null, handoff: { from: UA, to: '', settled: false } }),
      takeSettled: A('editor', { kind: 'handoff-reply', handoffId: 'ha_h1', by: UB, reply: 'accept' }, { userId: UB, panelOwner: null, handoff: { from: UA, to: UB, settled: true } }),
      takeNone: A('editor', { kind: 'handoff-reply', handoffId: 'ha_h9', by: UB, reply: 'accept' }, { userId: UB, panelOwner: null, handoff: null }),
      withdraw: A('owner', { kind: 'handoff-withdraw', handoffId: 'ha_h1' }, { userId: UA, panelOwner: null, handoff: { from: UA, to: UB, settled: false } }),
      withdrawOthers: A('editor', { kind: 'handoff-withdraw', handoffId: 'ha_h1' }, { userId: UB, panelOwner: null, handoff: { from: UA, to: UB, settled: false } }),
      withdrawTaken: A('owner', { kind: 'handoff-withdraw', handoffId: 'ha_h1' }, { userId: UA, panelOwner: null, handoff: { from: UA, to: UB, settled: true } })
    }
    const want = { open: true, take: true, takeOpen: true, withdraw: true }
    const wrong = Object.entries(verdicts).filter(([k, v]) => v.ok !== (want[k] === true)).map(([k]) => k)
    ok('mp.auth.1 handoffs: made by the agent\'s holder in their own name, one at a time, in chain order, to someone else, with a bounded note; taken by the person it names (anyone but its maker when open), in their own name, while unsettled; withdrawn by its maker while untaken; a viewer does none of it',
      wrong.length === 0 && /holds an agent now/.test(verdicts.openNotHolder.reason) && /number 1/.test(verdicts.openWrongN.reason) && /someone else/.test(verdicts.takeOthers.reason),
      JSON.stringify({ wrong, reasons: Object.fromEntries(Object.entries(verdicts).filter(([, v]) => !v.ok).map(([k, v]) => [k, v.reason])) }))

    const r = (over = {}) => ({ id: 'ha_r1', panel: 'ha_c1', owner: UA, title: 'api: retry on 429', summary: '3 files, +40 −12 · check passed', scrubbed: 0, at: 1, ...over })
    const rv = {
      post: A('editor', { kind: 'review-open', review: r() }, { ...held, review: null }),
      postNotHolder: A('editor', { kind: 'review-open', review: r() }, { ...held, panelSteward: UB, review: null }),
      postOthersName: A('editor', { kind: 'review-open', review: r({ owner: UB }) }, { ...held, review: null }),
      postViewer: A('viewer', { kind: 'review-open', review: r() }, { ...held, review: null }),
      postLong: A('owner', { kind: 'review-open', review: r({ summary: 'x'.repeat(M.ops.REVIEW_SUMMARY_MAX + 1) }) }, { ...held, review: null }),
      look: A('editor', { kind: 'review-claim', reviewId: 'ha_r1', by: UB }, { userId: UB, panelOwner: null, review: { owner: UA, closed: false } }),
      lookOwn: A('owner', { kind: 'review-claim', reviewId: 'ha_r1', by: UA }, { userId: UA, panelOwner: null, review: { owner: UA, closed: false } }),
      approve: A('editor', { kind: 'review-verdict', reviewId: 'ha_r1', by: UB, verdict: 'approve' }, { userId: UB, panelOwner: null, review: { owner: UA, closed: false } }),
      approveOwn: A('owner', { kind: 'review-verdict', reviewId: 'ha_r1', by: UA, verdict: 'approve' }, { userId: UA, panelOwner: null, review: { owner: UA, closed: false } }),
      approveAs: A('editor', { kind: 'review-verdict', reviewId: 'ha_r1', by: UC, verdict: 'approve' }, { userId: UB, panelOwner: null, review: { owner: UA, closed: false } }),
      approveClosed: A('editor', { kind: 'review-verdict', reviewId: 'ha_r1', by: UB, verdict: 'approve' }, { userId: UB, panelOwner: null, review: { owner: UA, closed: true } }),
      approveViewer: A('viewer', { kind: 'review-verdict', reviewId: 'ha_r1', by: UV, verdict: 'approve' }, { userId: UV, panelOwner: null, review: { owner: UA, closed: false } }),
      close: A('owner', { kind: 'review-close', reviewId: 'ha_r1', outcome: 'approved' }, { userId: UA, panelOwner: null, review: { owner: UA, closed: false, decision: 'approved' } }),
      closeWithdraw: A('owner', { kind: 'review-close', reviewId: 'ha_r1', outcome: 'withdrawn' }, { userId: UA, panelOwner: null, review: { owner: UA, closed: false, decision: 'open' } }),
      closeSelfApproved: A('owner', { kind: 'review-close', reviewId: 'ha_r1', outcome: 'approved' }, { userId: UA, panelOwner: null, review: { owner: UA, closed: false, decision: 'open' } }),
      closeOverChanges: A('owner', { kind: 'review-close', reviewId: 'ha_r1', outcome: 'approved' }, { userId: UA, panelOwner: null, review: { owner: UA, closed: false, decision: 'changes' } }),
      closeOthers: A('editor', { kind: 'review-close', reviewId: 'ha_r1', outcome: 'approved' }, { userId: UB, panelOwner: null, review: { owner: UA, closed: false } }),
      closeTwice: A('owner', { kind: 'review-close', reviewId: 'ha_r1', outcome: 'approved' }, { userId: UA, panelOwner: null, review: { owner: UA, closed: true } })
    }
    const rwant = { post: true, look: true, approve: true, close: true, closeWithdraw: true }
    const rwrong = Object.entries(rv).filter(([k, v]) => v.ok !== (rwant[k] === true)).map(([k]) => k)
    ok('mp.auth.2 the review queue: posted by the agent\'s holder in their own name, bounded; claimed and judged by anyone else, in their own name, while open — never by its poster; closed by its poster once, only as withdrawn or as the verdicts decided (never "approved" with no approval, or over a request for changes); a viewer does none of it',
      rwrong.length === 0 && /own result/.test(rv.approveOwn.reason) && /nobody has judged/.test(rv.closeSelfApproved.reason) && /decided changes/.test(rv.closeOverChanges.reason),
      JSON.stringify({ rwrong }))
  }

  // ── M581: where a handoff and a review stand ────────────────────────────
  {
    const S = M.flow.handoffState
    const named = { from: UA, to: UB }, open = { from: UA, to: '' }
    const states = [
      S(named, {}, false).state, S(named, { [UB]: 'accept' }, false), S(named, { [UB]: 'decline' }, false).state,
      S(named, { [UC]: 'accept' }, false).state, S(named, { [UB]: 'accept' }, true).state,
      S(open, { [UC]: 'decline' }, false).state, S(open, { [UC]: 'accept', [UB]: 'accept' }, false), S(open, { [UA]: 'accept' }, false).state
    ]
    const hr = (id, n, to, replies, panel = 'ha_c1') => ({ handoff: { id, panel, from: UA, to, note: '', scrubbed: 0, at: 100 - n, n }, replies, withdrawn: false })
    // The chain is ordered by n, never by `at`: h2's clock ran slow.
    const chain = M.flow.stewardOf('ha_c1', UA, [hr('h1', 1, UB, { [UB]: 'accept' }), hr('h2', 2, UC, { [UC]: 'accept' }), hr('h9', 1, UB, { [UB]: 'accept' }, 'ha_other')])
    const none = M.flow.stewardOf('ha_c1', UA, [hr('h1', 1, UB, {})])
    // Two of one number (the server lets one in; a reader still agrees): the lower id wins, whatever the order.
    const tieA = M.flow.stewardOf('ha_c1', UA, [hr('hb', 1, UC, { [UC]: 'accept' }), hr('ha', 1, UB, { [UB]: 'accept' })]).steward
    const tieB = M.flow.stewardOf('ha_c1', UA, [hr('ha', 1, UB, { [UB]: 'accept' }), hr('hb', 1, UC, { [UC]: 'accept' })]).steward
    const D = M.flow.reviewDecision
    ok('mp.state.1 a named handoff is handed by its person\'s accept and ended by their decline (no one else\'s reply counts); an open one by the first accept, ties broken by user id, never its maker\'s; a withdrawal ends it; the holder follows the chain by number, not clock; one "changes" decides a review over any approvals',
      states[0] === 'open' && states[1].state === 'handed' && states[1].steward === UB && states[2] === 'declined' && states[3] === 'open' && states[4] === 'withdrawn' &&
        states[5] === 'open' && states[6].steward === UB && states[7] === 'open' &&
        chain.steward === UC && chain.handed === 2 && chain.open === null && none.steward === UA && none.open !== null && tieA === UB && tieB === UB &&
        D({}) === 'open' && D({ [UB]: 'approve' }) === 'approved' && D({ [UB]: 'approve', [UC]: 'changes' }) === 'changes',
      JSON.stringify({ states, chain: { s: chain.steward, h: chain.handed } }))
  }

  // ── M581: a raw update read back as the ops it makes ─────────────────────
  {
    const doc = new Y.Doc()
    M.doc.applyCanvasOp(doc, { kind: 'create', panel: { id: 'ha_c1', kind: 'chat', title: 'api', owner: UA, host: 'ha', x: 0, y: 0, w: 1, h: 1, z: 1 } }, 'seed')
    const kinds = (fn) => {
      const other = new Y.Doc()
      Y.applyUpdate(other, Y.encodeStateAsUpdate(doc))
      const sv = Y.encodeStateVector(other)
      fn(other)
      return M.doc.inspectUpdate(doc, Y.encodeStateAsUpdate(other, sv)).map((x) => x.op.kind === 'unknown' ? `unknown:${x.op.detail}` : x.op.kind)
    }
    const h = { id: 'ha_h1', panel: 'ha_c1', from: UA, to: UB, note: 'n', scrubbed: 0, at: 1, n: 1 }
    const opened = kinds((d) => M.doc.applyCanvasOp(d, { kind: 'handoff-open', handoff: h }, 'x'))
    const ctxOpen = M.doc.inspectUpdate(doc, (() => { const o = new Y.Doc(); Y.applyUpdate(o, Y.encodeStateAsUpdate(doc)); const sv = Y.encodeStateVector(o); M.doc.applyCanvasOp(o, { kind: 'handoff-open', handoff: h }, 'x'); return Y.encodeStateAsUpdate(o, sv) })())[0]?.ctx
    M.doc.applyCanvasOp(doc, { kind: 'handoff-open', handoff: h }, 'seed')
    const reply = kinds((d) => M.doc.applyCanvasOp(d, { kind: 'handoff-reply', handoffId: 'ha_h1', by: UB, reply: 'accept' }, 'x'))
    const withdraw = kinds((d) => M.doc.applyCanvasOp(d, { kind: 'handoff-withdraw', handoffId: 'ha_h1' }, 'x'))
    const doubled = kinds((d) => { M.doc.applyCanvasOp(d, { kind: 'handoff-open', handoff: { ...h, id: 'ha_hx' } }, 'x'); M.doc.applyCanvasOp(d, { kind: 'handoff-open', handoff: { ...h, id: 'ha_hy', to: UC } }, 'x') })
    const rewrite = kinds((d) => d.getMap(M.ops.CANVAS_HANDOFFS).get('ha_h1').set('to', UC))
    const bornTaken = kinds((d) => { const fm = new Y.Map(); for (const [k, v] of Object.entries({ ...h, id: undefined, n: 1 })) if (v !== undefined) fm.set(k, v); fm.set('reply:' + UB, 'accept'); d.getMap(M.ops.CANVAS_HANDOFFS).set('ha_h2', fm) })
    M.doc.applyCanvasOp(doc, { kind: 'handoff-reply', handoffId: 'ha_h1', by: UB, reply: 'accept' }, 'seed')
    const replyAgain = kinds((d) => d.getMap(M.ops.CANVAS_HANDOFFS).get('ha_h1').set('reply:' + UB, 'decline'))
    const r = { id: 'ha_r1', panel: 'ha_c1', owner: UB, title: 't', summary: 's', scrubbed: 0, at: 1 }
    const rOpen = kinds((d) => M.doc.applyCanvasOp(d, { kind: 'review-open', review: r }, 'x'))
    M.doc.applyCanvasOp(doc, { kind: 'review-open', review: r }, 'seed')
    const rAll = kinds((d) => { M.doc.applyCanvasOp(d, { kind: 'review-claim', reviewId: 'ha_r1', by: UA }, 'x'); M.doc.applyCanvasOp(d, { kind: 'review-verdict', reviewId: 'ha_r1', by: UA, verdict: 'approve' }, 'x') })
    const rClose = kinds((d) => M.doc.applyCanvasOp(d, { kind: 'review-close', reviewId: 'ha_r1', outcome: 'approved' }, 'x'))
    const rJunk = kinds((d) => d.getMap(M.ops.CANVAS_REVIEWS).get('ha_r1').set('verdict:' + UA, 'lgtm'))
    ok('mp.inspect.1 the server\'s read-back: handoff open / reply / withdraw and review open / claim / verdict / close come back as themselves, a handoff-open with the holder chain as it stood; a rewritten field, a second reply, a handoff born already taken, a second handoff of one panel in the same update and a verdict that is not one are unknown',
      opened.join() === 'handoff-open' && doubled.filter((k) => k === 'handoff-open').length === 1 && doubled.some((k) => /second handoff/.test(k)) && ctxOpen?.panelSteward === UA && ctxOpen?.panelHanded === 0 && ctxOpen?.panelHandoffOpen === false &&
        reply.join() === 'handoff-reply' && withdraw.join() === 'handoff-withdraw' && /^unknown:.*rewritten/.test(rewrite.join()) &&
        /^unknown:.*malformed/.test(bornTaken.join()) && /^unknown:.*rewritten/.test(replyAgain.join()) &&
        rOpen.join() === 'review-open' && rAll.slice().sort().join() === 'review-claim,review-verdict' && rClose.join() === 'review-close' && /^unknown:/.test(rJunk.join()),
      JSON.stringify({ opened, doubled, ctxOpen, reply, withdraw, rewrite, bornTaken, replyAgain, rOpen, rAll, rClose, rJunk }))
  }

  // ── M582: three machines — a handoff, scrubbed, taken, handed on ─────────
  {
    const A = machine({ host: 'hosta1', userId: UA, role: 'owner', panels: [panel('c1', { title: 'api agent' })] })
    const B = machine({ host: 'hostb1', userId: UB, role: 'editor' })
    const V = machine({ host: 'hostv1', userId: UV, role: 'viewer' })
    A.bind(); B.bind(); V.bind(); room(A.doc, B.doc, V.doc)
    A.sync.saved(undefined)
    const secret = 'ghp_' + 'a'.repeat(36)
    const heldBefore = A.sync.teamFlow(nameOf).held
    const made = A.sync.writeFlow({ kind: 'hand-off', workspaceId: 'w1', panelId: 'c1', to: UB, note: `going home — token is ${secret}, rerun the e2e` })
    await settle()
    const onB = B.sync.teamFlow(nameOf)
    const onV = V.sync.teamFlow(nameOf)
    const mineA = A.sync.teamFlow(nameOf).mine
    const twice = A.sync.writeFlow({ kind: 'hand-off', workspaceId: 'w1', panelId: 'c1', to: '', note: '' })
    const row = onB.handoffs[0]
    const took = B.sync.writeFlow({ kind: 'take', workspaceId: 'w1', handoffId: row?.handoffId ?? '' })
    await settle()
    const afterA = A.sync.teamFlow(nameOf), afterB = B.sync.teamFlow(nameOf)
    const ownerAgain = A.sync.writeFlow({ kind: 'hand-off', workspaceId: 'w1', panelId: 'c1', to: UB, note: 'mine?' })
    const onward = B.sync.writeFlow({ kind: 'hand-off', workspaceId: 'w1', panelId: 'hosta1_c1', to: '', note: 'back to whoever' })
    await settle()
    const backToA = A.sync.teamFlow(nameOf).handoffs
    ok('mp.flow.1 A hands its agent to B: the note is scrubbed on A and counted, B is offered it by name with A\'s name, a viewer is offered nothing, A sees it waiting and cannot offer it twice; B takes it and both canvases say who holds it; A no longer can hand it, B can — and an open offer back reaches A by A\'s own local panel id',
      made.ok === true && onB.handoffs.length === 1 && row.named === true && row.fromName === 'Ada' && row.panelId === 'hosta1_c1' && row.panelTitle === 'api agent' &&
        !row.note.includes(secret) && row.scrubbed === 1 && onV.handoffs.length === 0 &&
        mineA.length === 1 && mineA[0].standing === 'waiting for Bea' && mineA[0].panelId === 'c1' && twice.ok === false && /already has a handoff/.test(twice.reason) &&
        took.ok === true && afterB.handoffs.length === 0 && afterA.mine.length === 0 &&
        afterA.stewards.some((s) => s.panelId === 'c1' && s.name === 'Bea' && !s.you) && afterB.stewards.some((s) => s.panelId === 'hosta1_c1' && s.you) &&
        ownerAgain.ok === false && /holds an agent now/.test(ownerAgain.reason) && onward.ok === true &&
        backToA.length === 1 && backToA[0].panelId === 'c1' && backToA[0].named === false && A.flowPushes() > 0 &&
        heldBefore.some((h) => h.panelId === 'c1') && afterA.held.length === 0 && afterB.held.some((h) => h.panelId === 'hosta1_c1') && V.sync.teamFlow(nameOf).held.length === 0,
      JSON.stringify({ made, row, onV: onV.handoffs.length, mineA, twice, took, stewards: afterA.stewards, ownerAgain, onward, backToA }))

    const declinedFlow = (() => {
      const C = machine({ host: 'hostc1', userId: UC, role: 'owner', panels: [panel('c9')] })
      const D = machine({ host: 'hostd1', userId: UB, role: 'editor' })
      C.bind(); D.bind(); room(C.doc, D.doc); C.sync.saved(undefined)
      C.sync.writeFlow({ kind: 'hand-off', workspaceId: 'w1', panelId: 'c9', to: UB, note: '' })
      const id = D.sync.teamFlow(nameOf).handoffs[0]?.handoffId
      const no = D.sync.writeFlow({ kind: 'decline', workspaceId: 'w1', handoffId: id })
      const again = C.sync.writeFlow({ kind: 'hand-off', workspaceId: 'w1', panelId: 'c9', to: '', note: '' })
      const id2 = C.sync.teamFlow(nameOf).mine[0]?.id
      const back = C.sync.writeFlow({ kind: 'withdraw', workspaceId: 'w1', handoffId: id2 })
      return { no, again, back, left: D.sync.teamFlow(nameOf).handoffs.length, mine: C.sync.teamFlow(nameOf).mine.length }
    })()
    ok('mp.flow.2 a declined handoff ends and the holder may offer again; a withdrawn offer leaves every queue',
      declinedFlow.no.ok && declinedFlow.again.ok && declinedFlow.back.ok && declinedFlow.left === 0 && declinedFlow.mine === 0, JSON.stringify(declinedFlow))

    // ── M582: the review queue, over the same three machines ───────────────
    const posted = B.sync.writeFlow({ kind: 'ask-review', workspaceId: 'w1', panelId: 'hosta1_c1', title: 'api: retry on 429', summary: `3 files, +40 −12 · check passed · ${secret}` })
    await settle()
    const q = A.sync.teamFlow(nameOf).reviews
    const own = B.sync.writeFlow({ kind: 'approve', workspaceId: 'w1', reviewId: q[0]?.reviewId ?? '' })
    const looked = A.sync.writeFlow({ kind: 'look', workspaceId: 'w1', reviewId: q[0]?.reviewId ?? '' })
    await settle()
    const lookingB = B.sync.teamFlow(nameOf).mine.find((m) => m.kind === 'review')
    const lookingA = A.sync.teamFlow(nameOf).reviews[0]
    const viewerSaid = V.sync.writeFlow({ kind: 'approve', workspaceId: 'w1', reviewId: q[0]?.reviewId ?? '' })
    const approved = A.sync.writeFlow({ kind: 'approve', workspaceId: 'w1', reviewId: q[0]?.reviewId ?? '' })
    await settle()
    const notYet = M.doc.readSharedReviews(A.doc)[0]?.closed
    const mineDecided = B.sync.teamFlow(nameOf).mine.find((m) => m.kind === 'review')
    const done = B.sync.writeFlow({ kind: 'settle-review', workspaceId: 'w1', reviewId: q[0]?.reviewId ?? '' })
    await settle()
    const closed = M.doc.readSharedReviews(A.doc)[0]
    ok('mp.review.1 B, who holds the agent now, puts it in the review queue (scrubbed); A sees it with B\'s name; B cannot approve their own; A says they are looking and B sees "Ada looking"; a viewer\'s verdict is refused; A approves and it leaves A\'s queue; nothing closes it behind a second reviewer\'s back — B sees it decided and Done closes it as approved',
      posted.ok === true && q.length === 1 && q[0].ownerName === 'Bea' && q[0].scrubbed === 1 && !q[0].summary.includes(secret) && q[0].panelId === 'c1' &&
        own.ok === false && /own result/.test(own.reason) && looked.ok === true && lookingB?.standing === 'Ada looking' && lookingA?.mine === true && lookingA?.lookers.join() === 'you' &&
        viewerSaid.ok === false && approved.ok === true && A.sync.teamFlow(nameOf).reviews.length === 0 &&
        notYet === undefined && mineDecided?.decided === 'approved' && done.ok === true && closed?.closed === 'approved' && B.sync.teamFlow(nameOf).mine.every((m) => m.kind !== 'review'),
      JSON.stringify({ posted, q, own, lookingB, lookingA, viewerSaid, approved, closed }))
  }

  // ── M582: the request the renderer may send ─────────────────────────────
  {
    const P = M.flow.parseFlowRequest
    const good = [
      P({ kind: 'hand-off', workspaceId: 'w1', panelId: 'c1', to: UB.toUpperCase(), note: 'hi' }),
      P({ kind: 'hand-off', workspaceId: 'w1', panelId: 'hosta1_c1', to: '', note: '' }),
      P({ kind: 'take', workspaceId: 'w1', handoffId: 'hosta1_h1' }),
      P({ kind: 'ask-review', workspaceId: 'w1', panelId: 'c1', title: 'x', summary: '' }),
      P({ kind: 'request-changes', workspaceId: 'w1', reviewId: 'hosta1_r1' })
    ]
    const bad = [
      P({ kind: 'hand-off', workspaceId: 'w1', panelId: 'c1', to: 'Bea', note: '' }),
      P({ kind: 'hand-off', workspaceId: 'w1', panelId: '../x', to: '', note: '' }),
      P({ kind: 'hand-off', workspaceId: 'w1', panelId: 'c1', to: '', note: 'x'.repeat(601) }),
      P({ kind: 'ask-review', workspaceId: 'w1', panelId: 'c1', title: '  ', summary: '' }),
      P({ kind: 'take', workspaceId: 'w1', handoffId: 'h1', by: UA }) === undefined ? undefined : 'carried-by',
      P({ kind: 'merge', workspaceId: 'w1' }), P(null), P({ kind: 'take', handoffId: 'h1' })
    ]
    ok('mp.parse.1 team:flow-write\'s body names a workspace, an object and a choice: a user id or \'\' for an offer (lower-cased), bounded words, safe ids; anything else refuses, and a "by" the renderer adds is never carried',
      good.every((g) => g !== undefined) && good[0].to === UB && bad.slice(0, 4).every((b) => b === undefined) && bad[4] === 'carried-by' && !('by' in (P({ kind: 'take', workspaceId: 'w1', handoffId: 'h1', by: UA }) ?? {})) &&
        bad.slice(5).every((b) => b === undefined),
      JSON.stringify({ good, bad }))
  }

  // ── M581: the real server — onAuthenticate + beforeSync over a socket ────
  {
    const port = await freePort()
    const people = { towner: { userId: UA, role: 'owner' }, teditor: { userId: UB, role: 'editor' }, tviewer: { userId: UV, role: 'viewer' } }
    const refusals = []
    const server = M.server.createCollabServer({
      port, address: '127.0.0.1', quiet: true,
      authenticate: async (token, documentName) => {
        const p = people[token]
        if (p === undefined) throw new M.auth.Refused('you are not a member of this workspace')
        return { ...p, shareId: SHARE, documentName }
      },
      onRefused: (e) => refusals.push(e)
    })
    await server.listen()
    const url = `ws://127.0.0.1:${port}`
    const name = `tc:workspace:${SHARE}`
    const providers = []
    const join = (token) => {
      const doc = new Y.Doc()
      const st = { synced: false, closed: 0 }
      const p = new HocuspocusProvider({ url, name, document: doc, token, onSynced: () => { st.synced = true }, onClose: () => { st.closed += 1 } })
      providers.push(p)
      return { doc, st, p }
    }
    const hOf = (doc, id) => M.doc.readSharedHandoffs(doc).find((q) => q.handoff.id === id)
    const rOf = (doc, id) => M.doc.readSharedReviews(doc).find((q) => q.review.id === id)
    try {
      const owner = join('towner')
      await until(() => owner.st.synced)
      M.doc.applyCanvasOp(owner.doc, { kind: 'create', panel: { id: 'hosta1_c1', kind: 'chat', title: 'api', owner: UA, host: 'hosta1', x: 0, y: 0, w: 400, h: 300, z: 1 } }, 'test')
      const editor = join('teditor'), viewer = join('tviewer')
      await until(() => editor.st.synced && viewer.st.synced && M.doc.readSharedPanels(editor.doc).live.length === 1)

      // An editor handing an agent they do not hold is refused and closed.
      const sneaky = join('teditor')
      await until(() => sneaky.st.synced)
      M.doc.applyCanvasOp(sneaky.doc, { kind: 'handoff-open', handoff: { id: 'hostb1_h0', panel: 'hosta1_c1', from: UB, to: '', note: '', scrubbed: 0, at: 1, n: 1 } }, 'test')
      await until(() => sneaky.st.closed > 0, 2000)

      M.doc.applyCanvasOp(owner.doc, { kind: 'handoff-open', handoff: { id: 'hosta1_h1', panel: 'hosta1_c1', from: UA, to: UB, note: 'yours', scrubbed: 0, at: 1, n: 1 } }, 'test')
      await until(() => hOf(editor.doc, 'hosta1_h1') !== undefined && hOf(viewer.doc, 'hosta1_h1') !== undefined)
      M.doc.applyCanvasOp(viewer.doc, { kind: 'handoff-reply', handoffId: 'hosta1_h1', by: UV, reply: 'accept' }, 'test')
      await new Promise((r) => setTimeout(r, 250))
      const viewerDropped = hOf(owner.doc, 'hosta1_h1')?.replies[UV] === undefined && viewer.st.closed === 0
      M.doc.applyCanvasOp(editor.doc, { kind: 'handoff-reply', handoffId: 'hosta1_h1', by: UB, reply: 'accept' }, 'test')
      await until(() => hOf(owner.doc, 'hosta1_h1')?.replies[UB] === 'accept')
      const held = M.doc.panelSteward(owner.doc, 'hosta1_c1')?.steward

      // Now B holds it: the owner can no longer hand it on; B's review is accepted.
      const ownerLate = join('towner')
      await until(() => ownerLate.st.synced && hOf(ownerLate.doc, 'hosta1_h1')?.replies[UB] === 'accept')
      M.doc.applyCanvasOp(ownerLate.doc, { kind: 'handoff-open', handoff: { id: 'hosta1_h2', panel: 'hosta1_c1', from: UA, to: UB, note: '', scrubbed: 0, at: 2, n: 2 } }, 'test')
      await until(() => ownerLate.st.closed > 0, 2000)
      M.doc.applyCanvasOp(editor.doc, { kind: 'review-open', review: { id: 'hostb1_r1', panel: 'hosta1_c1', owner: UB, title: 'api', summary: 'check passed', scrubbed: 0, at: 3 } }, 'test')
      await until(() => rOf(owner.doc, 'hostb1_r1') !== undefined)
      // The poster approving their own is refused and closed; the owner's verdict reaches the poster.
      const self = join('teditor')
      await until(() => self.st.synced && rOf(self.doc, 'hostb1_r1') !== undefined)
      M.doc.applyCanvasOp(self.doc, { kind: 'review-verdict', reviewId: 'hostb1_r1', by: UB, verdict: 'approve' }, 'test')
      await until(() => self.st.closed > 0, 2000)
      M.doc.applyCanvasOp(owner.doc, { kind: 'review-verdict', reviewId: 'hostb1_r1', by: UA, verdict: 'changes' }, 'test')
      await until(() => rOf(editor.doc, 'hostb1_r1')?.verdicts[UA] === 'changes')
      ok('srv.mp.1 through the real server: an editor handing an agent they do not hold is refused and closed; the owner\'s handoff reaches everyone; a viewer\'s take is dropped and they stay connected; the named editor\'s take reaches the owner and makes them its holder; the owner handing it again after is refused; the holder\'s review is accepted, its poster\'s own verdict is refused, and a teammate\'s verdict reaches the poster',
        sneaky.st.closed > 0 && hOf(owner.doc, 'hostb1_h0') === undefined && viewerDropped && held === UB &&
          ownerLate.st.closed > 0 && hOf(owner.doc, 'hosta1_h2') === undefined &&
          self.st.closed > 0 && rOf(owner.doc, 'hostb1_r1')?.verdicts[UB] === undefined && rOf(editor.doc, 'hostb1_r1')?.verdicts[UA] === 'changes',
        JSON.stringify({ sneaky: sneaky.st, viewerDropped, held, ownerLate: ownerLate.st, self: self.st, refusals: refusals.map((r) => r.reason) }))
    } finally {
      for (const p of providers) p.destroy()
      await server.destroy()
    }
  }

  // ── M582: the doors exist end to end ────────────────────────────────────
  {
    const read = (p) => readFileSync(join(root, p), 'utf8')
    const contract = read('src/shared/ipc-contract.ts'), preload = read('src/preload/index.ts'), ipc = read('src/main/ipc.ts'), wiring = read('src/main/bootstrap/presence-wiring.ts')
    ok('mp.doors.1 team:flow / team:flow-write / team:flow-changed are declared, bridged, handled with the body shape-checked, inert without sharing, and written in main\'s signed-in name',
      /TEAM_FLOW: 'team:flow'/.test(contract) && /TEAM_FLOW_WRITE: 'team:flow-write'/.test(contract) && /TEAM_FLOW_CHANGED: 'team:flow-changed'/.test(contract) &&
        /writeFlow: \(req\) => ipcRenderer\.invoke\(IPC\.TEAM_FLOW_WRITE/.test(preload) &&
        /parseFlowRequest\(raw\)/.test(ipc) && /writeTeamFlow: \(\) => \(\{ ok: false/.test(ipc) &&
        /currentUserId\(\) === null\) return \{ ok: false, reason: 'sign in to work with your team' \}/.test(wiring))
  }

  // ── M583: the screens read the one store ─────────────────────────────────
  {
    const read = (p) => readFileSync(join(root, p), 'utf8')
    const dock = read('src/renderer/shell/Dock.tsx'), section = read('src/renderer/team-flow/TeamFlowSection.tsx'), cmds = require('./lib/palette-src.cjs').paletteSource(), verbs = read('src/shared/verb-table.ts')
    ok('mp.ui.1 Needs you mounts the section (handed to you, the review queue, waiting on your team) and speaks its count; the palette mints hand-off, offer-to-anyone, ask-for-review, take, approve and ask-for-changes rows from the same store; teamFlow is excluded from the verb table with its reason',
      /<TeamFlowSection onGoToPanel=\{onGoToPanel\}/.test(dock) && /flow\.handoffs\.length \+ flow\.reviews\.length/.test(dock) &&
        ['data-team-handoffs-title', 'data-team-reviews-title', 'data-team-mine-title', "data-team-handoff-verb=\"take\"", "data-team-review-verb=\"approve\""].every((k) => section.includes(k)) &&
        ['team.handoff.', '.anyone`', 'team.review.ask.', 'team.take.', 'team.review.approve.', 'team.review.changes.'].every((k) => cmds.includes(k)) &&
        /teamFlow: 'a handoff and a review are between people/.test(verbs))
  }

  {
    const read = (p) => readFileSync(join(root, p), 'utf8')
    const dock = read('src/renderer/shell/Dock.tsx'), gestures = read('src/renderer/canvas/usePanelGestures.ts'), store = read('src/renderer/team-flow/useTeamFlow.ts')
    ok('mp.attn.1 a handoff to this person joins the attention cycle: ⌘J and the pill\'s Jump walk withHandoffs(attentionIds()), which appends handed panels not already queued; the bell counts each handed panel the queue does not already hold',
      (gestures.match(/reachableQueue\(withHandoffs\(attentionIds\(\)\), known\)/g) || []).length === 2 &&
        /export function withHandoffs[\s\S]*?!seen\.has\(id\)/.test(store) &&
        /const badgeCount = attentionQueue\.length \+ handedOnly/.test(dock) && /!queuedPanels\.has\(id\)/.test(dock))
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) { console.log('FAILED: ' + failed.map((r) => r.name).join(', ')); process.exit(1) }
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
