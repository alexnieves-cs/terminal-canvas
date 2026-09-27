/* The shared canvas: panels as a Y.Map of field maps in the workspace Y.Doc,
   tombstone deletes, groups, the renderer's write-back guard, roles enforced
   per operation in the app AND in the collab server's hooks.
   Run with: npm run verify:canvas-sync

   Plain node. REAL yjs throughout: two canvas-syncs (main's binding) over an
   in-process doc relay for the binding checks, and a REAL Hocuspocus server
   with REAL providers over a loopback socket for the server checks — its
   onAuthenticate and beforeSync are the ones server/collab ships, with only
   the Supabase lookup stubbed.

   What this cannot see: a live Supabase project (the migration's RLS and
   the workspace_role rpc), and the renderer applying a view — a DOM fact for
   an Electron suite, which none pins yet. */
'use strict'
const { buildSync } = require('esbuild')
const { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, rmSync } = require('node:fs')
const { createServer } = require('node:net')
const { tmpdir } = require('node:os')
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
      "  sync: require('./src/main/presence/canvas-sync.ts'),",
      "  presence: require('./src/shared/presence.ts'),",
      "  schema: require('./src/shared/layout-schema.ts'),",
      "  store: require('./src/main/layout-store.ts'),",
      "  auth: require('./server/collab/auth.ts'),",
      "  server: require('./server/collab/server.ts'),",
      "  value: require('./src/renderer/shared-text/value.ts'),",
      "  persistence: require('./server/collab/persistence.ts'),",
      "  log: require('./server/collab/log.ts'),",
      "  backup: require('./server/collab/backup.ts'),",
      "  health: require('./server/collab/health.ts'),",
      "  asks: require('./src/shared/team-asks.ts'),",
      "  router: require('./src/main/team-ask-router.ts'),",
      "}"
    ].join('\n'),
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/canvas-sync.cjs'),
  // Packages stay external so yjs is ONE instance across this file, the
  // bundle, the server and the provider — two copies would compare types
  // by identity and disagree.
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', packages: 'external',
  alias: { '@shared': join(root, 'src/shared') }
})
const M = require('../out/verify/canvas-sync.cjs')
const Y = require('yjs')
const { HocuspocusProvider } = require('@hocuspocus/provider')

const SHARE = '11111111-2222-4333-8444-555555555555'
const ORG = '99999999-8888-4777-8666-555555555555'
const UA = 'aaaaaaaa-0000-4000-8000-000000000001'
const UB = 'bbbbbbbb-0000-4000-8000-000000000002'
const UV = 'cccccccc-0000-4000-8000-000000000003'
const tick = () => new Promise((r) => setTimeout(r, 0))
const panel = (id, x, extra = {}) => ({ id, kind: 'terminal', title: `t ${id}`, x, y: 0, w: 400, h: 300, z: 1, ...extra })

/** One machine: a layout-store stand-in, a canvas-sync, a doc. */
function machine({ host, userId, role, panels = [], crdt = null, extra = {} }) {
  const ws = { panels: panels.map((p) => ({ ...p })), groups: [] }
  const share = { id: SHARE, orgId: ORG, role }
  const views = []
  const textSinks = []
  const store = { crdt }
  const sync = M.sync.createCanvasSync({
    host: () => host,
    userId: () => userId,
    share: () => share,
    activeWorkspaceId: () => 'w1',
    local: () => ({ panels: ws.panels, groups: ws.groups }),
    loadState: () => store.crdt,
    saveState: (_id, bytes) => { store.crdt = bytes },
    applyToStore: (_id, change) => {
      const by = new Map(change.rects.map((r) => [r.id, r]))
      ws.panels = ws.panels.map((p) => (by.has(p.id) ? { ...p, ...by.get(p.id) } : p))
      if (change.groups !== undefined) ws.groups = change.groups.map((g) => ({ ...g, panelIds: [...g.panelIds] }))
    },
    emit: (v) => views.push(v),
    emitText: (push) => { for (const sink of textSinks) sink(push) },
    ...extra
  })
  const doc = new Y.Doc()
  return { ws, share, views, textSinks, store, sync, doc, host, userId, view: () => views[views.length - 1] ?? null, bind() { this.unbind = sync.bind('w1', doc) } }
}

/** Two docs joined like a Hocuspocus room: every update reaches the other, and `cut` partitions them. */
function relay(a, b) {
  const link = { up: true, queue: [] }
  const wire = (from, to) => from.on('update', (u, origin) => {
    if (origin === 'relay') return
    if (link.up) Y.applyUpdate(to, u, 'relay'); else link.queue.push(() => Y.applyUpdate(to, u, 'relay'))
  })
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'relay')
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b), 'relay')
  wire(a, b); wire(b, a)
  return { cut() { link.up = false }, heal() { link.up = true; for (const f of link.queue.splice(0)) f() } }
}

/**
 * The renderer's replica (renderer/shared-text/replica.ts), minus the IPC: the
 * state text:open answers, every local update through text:update, and every
 * text:remote push applied back. `resets` counts the pushes that discard it.
 */
function replicaOf(m) {
  const got = m.sync.textOpen('w1')
  if (got === null) return null
  const doc = new Y.Doc()
  Y.applyUpdate(doc, got.state, 'main')
  const r = { doc, got, verdicts: [], resets: 0, files: () => doc.getMap(M.ops.CANVAS_FILES) }
  doc.on('update', (u, origin) => { if (origin !== 'main') r.verdicts.push(m.sync.textUpdate('w1', u)) })
  m.textSinks.push((push) => { if (push.kind === 'update') Y.applyUpdate(doc, push.update, 'main'); else r.resets += 1 })
  return r
}
const lastVerdict = (r) => r.verdicts[r.verdicts.length - 1]
const textOf = (doc, key) => M.doc.sharedText(doc, key)?.toString()

const live = (doc) => M.doc.readSharedPanels(doc).live
const liveKeys = (doc) => live(doc).map((p) => p.id).sort()
const field = (doc, key, f) => doc.getMap(M.doc.CANVAS_PANELS).get(key)?.get(f)

function freePort() {
  return new Promise((resolve) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) }) })
}
async function until(pred, ms = 3000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (pred()) return true; await new Promise((r) => setTimeout(r, 20)) }
  return pred()
}

;(async () => {
  // ── the role table ──────────────────────────────────────────────────────
  {
    const { authorizeCanvasOp: a } = M.ops
    const rect = { kind: 'rect', panelId: 'h_n1', fields: { x: 1 } }
    const del = { kind: 'delete', panelId: 'h_n1' }
    const mine = { userId: UA, panelOwner: UA }, theirs = { userId: UB, panelOwner: UA }
    const create = (owner) => ({ kind: 'create', panel: { id: 'h_n9', kind: 'terminal', title: '', owner, host: 'h', x: 0, y: 0, w: 1, h: 1, z: 1 } })
    ok('cs.table.1 owner: moves, deletes anyone\'s panel; editor: moves anyone\'s, deletes only their own, renames only their own',
      a('owner', rect, theirs).ok && a('owner', del, theirs).ok && a('editor', rect, theirs).ok && !a('editor', del, theirs).ok &&
      a('editor', del, mine).ok && !a('editor', { kind: 'retitle', panelId: 'h_n1', title: 'x' }, theirs).ok)
    ok('cs.table.2 viewer: nothing; an unshared room: nothing but one\'s own Team snapshot',
      !a('viewer', rect, mine).ok && /viewer/.test(a('viewer', rect, mine).reason) && !a(null, rect, mine).ok &&
      a(null, { kind: 'team-snapshot', key: `snapshot:${UA}` }, { userId: UA, panelOwner: null }).ok &&
      !a(null, { kind: 'team-snapshot', key: `snapshot:${UB}` }, { userId: UA, panelOwner: null }).ok)
    ok('cs.table.3 a panel is created only in the creator\'s own name, and never over an existing or deleted id; unknown is always refused',
      a('editor', create(UB), { userId: UB, panelOwner: null }).ok && !a('editor', create(UA), { userId: UB, panelOwner: null }).ok &&
      !a('owner', create(UA), { userId: UA, panelOwner: null, panelDeleted: true }).ok &&
      !a('owner', { kind: 'unknown', detail: 'x' }, mine).ok)
    const p = M.ops.parseRendererOp
    ok('cs.parse.1 the renderer may send a rect or a delete — nothing else, no other field, no non-finite number',
      p({ kind: 'rect', panelId: 'n1', fields: { x: 1, z: 2 } })?.kind === 'rect' && p({ kind: 'delete', panelId: 'h_n1' })?.kind === 'delete' &&
      p({ kind: 'create', panelId: 'n1' }) === undefined && p({ kind: 'rect', panelId: 'n1', fields: { owner: 1 } }) === undefined &&
      p({ kind: 'rect', panelId: 'n1', fields: { x: Infinity } }) === undefined && p({ kind: 'rect', panelId: '../x', fields: { x: 1 } }) === undefined &&
      p({ kind: 'rect', panelId: 'n1', fields: {} }) === undefined)
  }

  // ── two machines on one shared canvas ───────────────────────────────────
  const A = machine({ host: 'hosta1', userId: UA, role: 'owner', panels: [panel('n1', 0), panel('n2', 50)] })
  const B = machine({ host: 'hostb1', userId: UB, role: 'editor', panels: [panel('n1', 500)] })
  A.bind(); B.bind()
  const net = relay(A.doc, B.doc)
  await tick()
  ok('cs.create.1 each machine seeds its own panels under its host prefix: two local `n1`s stay two panels',
    JSON.stringify(liveKeys(A.doc)) === JSON.stringify(['hosta1_n1', 'hosta1_n2', 'hostb1_n1']) &&
    JSON.stringify(liveKeys(A.doc)) === JSON.stringify(liveKeys(B.doc)), JSON.stringify(liveKeys(A.doc)))
  B.sync.activated(); A.sync.activated(); await tick()
  ok('cs.view.1 a teammate\'s panels are placeholders, owned and hosted elsewhere; our own are not',
    JSON.stringify(B.view().placeholders.map((p) => p.id).sort()) === JSON.stringify(['hosta1_n1', 'hosta1_n2']) &&
    B.view().placeholders.every((p) => p.owner === UA && p.host === 'hosta1') &&
    JSON.stringify(A.view().placeholders.map((p) => p.id)) === JSON.stringify(['hostb1_n1']) && A.view().role === 'owner')

  // B (editor) drags A's placeholder: the write-through op.
  const beforeSeq = A.view().seq
  const moved = B.sync.op({ kind: 'rect', panelId: 'hosta1_n1', fields: { x: 100, y: 40 } })
  await tick()
  ok('cs.move.1 an editor\'s drag of a teammate\'s panel lands in the owner\'s LAYOUT STORE and in a view to their renderer',
    moved.ok && A.ws.panels.find((p) => p.id === 'n1').x === 100 && A.ws.panels.find((p) => p.id === 'n1').y === 40 &&
    A.view().seq > beforeSeq && A.view().rects.some((r) => r.id === 'n1' && r.x === 100),
    JSON.stringify({ moved, view: A.view() }))

  // The write-back trap: A's renderer had not applied that view when it saved.
  A.ws.panels = A.ws.panels.map((p) => (p.id === 'n1' ? { ...p, x: 0, y: 0 } : p))
  A.sync.saved(beforeSeq)
  await tick()
  ok('cs.stale.1 a save carrying an ack OLDER than a peer\'s change does not write the renderer\'s stale rect back over it',
    field(A.doc, 'hosta1_n1', 'x') === 100 && field(B.doc, 'hosta1_n1', 'x') === 100, String(field(A.doc, 'hosta1_n1', 'x')))
  // Its renderer applies the view, acks, and then moves the panel itself.
  A.ws.panels = A.ws.panels.map((p) => (p.id === 'n1' ? { ...p, x: 100, y: 40 } : p))
  A.sync.saved(A.view().seq)
  A.ws.panels = A.ws.panels.map((p) => (p.id === 'n1' ? { ...p, x: 300 } : p))
  A.sync.saved(A.view().seq)
  await tick()
  ok('cs.stale.2 once acked, a local edit writes through, and the teammate\'s placeholder follows',
    field(A.doc, 'hosta1_n1', 'x') === 300 && B.view().placeholders.find((p) => p.id === 'hosta1_n1')?.x === 300)

  // Per-field last-writer-wins: A moves n2 while B resizes it, partitioned.
  net.cut()
  A.ws.panels = A.ws.panels.map((p) => (p.id === 'n2' ? { ...p, x: 10 } : p))
  A.sync.saved(A.view().seq)
  B.sync.op({ kind: 'rect', panelId: 'hosta1_n2', fields: { w: 900 } })
  net.heal(); await tick()
  ok('cs.lww.1 a concurrent move and resize of ONE panel both survive — x and w are separate registers',
    field(A.doc, 'hosta1_n2', 'x') === 10 && field(A.doc, 'hosta1_n2', 'w') === 900 &&
    field(B.doc, 'hosta1_n2', 'x') === 10 && field(B.doc, 'hosta1_n2', 'w') === 900 &&
    A.ws.panels.find((p) => p.id === 'n2').w === 900)

  // A closes n2 while B, partitioned, is still moving it.
  net.cut()
  A.ws.panels = A.ws.panels.filter((p) => p.id !== 'n2')
  A.sync.saved(A.view().seq)
  B.sync.op({ kind: 'rect', panelId: 'hosta1_n2', fields: { y: 777 } })
  net.heal(); await tick()
  const tombA = M.doc.readSharedPanels(A.doc).tombstones, tombB = M.doc.readSharedPanels(B.doc).tombstones
  ok('cs.delete.1 closing a panel is a TOMBSTONE, and a concurrent move of it does not bring it back on either side',
    tombA.has('hosta1_n2') && tombB.has('hosta1_n2') && !liveKeys(B.doc).includes('hosta1_n2') &&
    A.doc.getMap(M.doc.CANVAS_PANELS).has('hosta1_n2') && !B.view().placeholders.some((p) => p.id === 'hosta1_n2'))
  // The layout still has no n2; a later save must not re-create it.
  A.sync.saved(A.view().seq); await tick()
  ok('cs.delete.2 a tombstone stays one: the next save neither re-creates nor un-deletes it',
    M.doc.readSharedPanels(A.doc).tombstones.has('hosta1_n2') && field(A.doc, 'hosta1_n2', 'deleted') === true)

  const refused = B.sync.op({ kind: 'delete', panelId: 'hosta1_n1' })
  ok('cs.delete.3 an editor removing the OWNER\'s panel is refused by name, and nothing is written',
    !refused.ok && /own/.test(refused.reason) && liveKeys(A.doc).includes('hosta1_n1'), JSON.stringify(refused))

  const removed = A.sync.op({ kind: 'delete', panelId: 'hostb1_n1' })
  await tick()
  B.sync.saved(B.view().seq); await tick()
  ok('cs.delete.4 the workspace owner removes an editor\'s panel from the SHARED canvas; it keeps running on its own machine, and its saves do not resurrect it',
    removed.ok && B.ws.panels.some((p) => p.id === 'n1') && M.doc.readSharedPanels(B.doc).tombstones.has('hostb1_n1') &&
    !A.view().placeholders.some((p) => p.id === 'hostb1_n1'))

  // Groups, as a Y.Map of field maps too.
  A.ws.groups = [{ id: 'g1', label: 'Build', colour: 'blue', panelIds: ['n1'] }]
  A.sync.saved(A.view().seq); await tick()
  const bg = B.view().groups
  ok('cs.group.1 a group made on one machine reaches the other as a group of that machine\'s panels, in its store and its view',
    Array.isArray(bg) && bg.length === 1 && bg[0].id === 'hosta1_g1' && JSON.stringify(bg[0].panelIds) === JSON.stringify(['hosta1_n1']) &&
    B.ws.groups.length === 1 && B.ws.groups[0].id === 'hosta1_g1', JSON.stringify({ bg, store: B.ws.groups }))
  B.sync.saved(B.view().seq); await tick()
  const groupOps = A.doc.getMap(M.doc.CANVAS_GROUPS).get('hosta1_g1').get('label')
  B.ws.groups = []
  B.sync.saved(B.view().seq); await tick()
  ok('cs.group.2 echoing a received group writes nothing; removing it (after acking it) tombstones it for everyone',
    groupOps === 'Build' && M.doc.readSharedGroups(A.doc).length === 0 && A.doc.getMap(M.doc.CANVAS_GROUPS).get('hosta1_g1').get('deleted') === true)

  // A viewer arranges nothing.
  B.ws.panels.push(panel('n5', 20))
  B.sync.saved(B.view().seq); await tick()
  B.share.role = 'viewer'
  const vOp = B.sync.op({ kind: 'rect', panelId: 'hosta1_n1', fields: { x: 1 } })
  B.ws.panels = B.ws.panels.map((p) => (p.id === 'n5' ? { ...p, x: 777 } : p))
  B.sync.saved(B.view().seq); await tick()
  ok('cs.viewer.1 a viewer\'s gesture op is refused; its local move is not written, is put back in its store, and is sent back as a view rect',
    !vOp.ok && /viewer/.test(vOp.reason) && field(A.doc, 'hostb1_n5', 'x') === 20 && B.ws.panels.find((p) => p.id === 'n5').x === 20 &&
    B.view().rects.some((r) => r.id === 'n5' && r.x === 20), JSON.stringify({ vOp, x: field(A.doc, 'hostb1_n5', 'x'), view: B.view() }))
  B.share.role = 'editor'

  // A relaunch: the doc's bytes come back from the store beside a stale layout.
  const keysBefore = A.doc.getMap(M.doc.CANVAS_PANELS).size
  const A2 = machine({ host: 'hosta1', userId: UA, role: 'owner', panels: [panel('n1', 5)], crdt: A.store.crdt })
  A2.bind(); await tick()
  ok('cs.persist.1 on a relaunch the persisted doc is the truth for geometry: the store takes the doc\'s rect, and nothing is re-created',
    A.store.crdt instanceof Uint8Array && A2.ws.panels[0].x === 300 && A2.doc.getMap(M.doc.CANVAS_PANELS).size === keysBefore &&
    M.doc.readSharedPanels(A2.doc).tombstones.has('hosta1_n2'), JSON.stringify({ x: A2.ws.panels[0].x, size: A2.doc.getMap(M.doc.CANVAS_PANELS).size, keysBefore }))
  A2.unbind()

  // ── the server's reading of a raw update ────────────────────────────────
  {
    const base = new Y.Doc()
    Y.applyUpdate(base, Y.encodeStateAsUpdate(A.doc))
    const kinds = (mutate) => {
      const c = new Y.Doc()
      Y.applyUpdate(c, Y.encodeStateAsUpdate(base))
      const sv = Y.encodeStateVector(c)
      mutate(c)
      return M.doc.inspectUpdate(base, Y.encodeStateAsUpdate(c, sv))
    }
    const moveOp = kinds((c) => c.getMap(M.doc.CANVAS_PANELS).get('hosta1_n1').set('x', 1))
    const delOp = kinds((c) => c.getMap(M.doc.CANVAS_PANELS).get('hosta1_n1').set('deleted', true))
    const rootDel = kinds((c) => c.getMap(M.doc.CANVAS_PANELS).delete('hosta1_n1'))
    const undel = kinds((c) => c.getMap(M.doc.CANVAS_PANELS).get('hosta1_n2').set('deleted', false))
    const reown = kinds((c) => c.getMap(M.doc.CANVAS_PANELS).get('hosta1_n1').set('owner', UB))
    const newRoot = kinds((c) => c.getMap('evil').set('k', 1))
    const created = kinds((c) => { const fm = new Y.Map(); c.getMap(M.doc.CANVAS_PANELS).set('hostb1_n9', fm); for (const [k, v] of Object.entries({ kind: 'terminal', title: '', owner: UB, host: 'hostb1', x: 0, y: 0, w: 1, h: 1, z: 1 })) fm.set(k, v) })
    ok('cs.inspect.1 an update reads back as the ops it performs, with the panel\'s owner as it stood BEFORE the update',
      moveOp.length === 1 && moveOp[0].op.kind === 'rect' && moveOp[0].op.fields.x === 1 && moveOp[0].ctx.panelOwner === UA &&
      delOp.length === 1 && delOp[0].op.kind === 'delete' && delOp[0].ctx.panelOwner === UA &&
      created.length === 1 && created[0].op.kind === 'create' && created[0].op.panel.owner === UB, JSON.stringify({ moveOp, delOp, created }))
    ok('cs.inspect.2 a root-level delete, an un-delete, an owner rewrite and a new root type each read back as unknown',
      [rootDel, undel, reown, newRoot].every((r) => r.length > 0 && r.every((x) => x.op.kind === 'unknown')), JSON.stringify({ rootDel, undel, reown, newRoot }))
  }

  // ── layout schema and store ─────────────────────────────────────────────
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc-canvas-sync-'))
    try {
      const raw = { version: 1, activeWorkspaceId: 'w1', workspaces: [
        { id: 'w1', name: 'A', panels: [], share: { id: SHARE, orgId: ORG, role: 'editor' }, crdt: 'AAEC' },
        { id: 'w2', name: 'B', panels: [], share: { id: 'nope', orgId: ORG, role: 'editor' }, crdt: 'AAEC' },
        { id: 'w3', name: 'C', panels: [], crdt: 'AAEC' }
      ] }
      const parsed = M.schema.parseLayout(JSON.stringify(raw))
      const snap = parsed.snapshot ?? parsed
      const w = (id) => snap.workspaces.find((x) => x.id === id)
      ok('cs.schema.1 a share and its doc round-trip; a malformed share is dropped WITH its doc; a doc with no share is dropped by name',
        w('w1')?.share?.role === 'editor' && w('w1')?.crdt === 'AAEC' && w('w2')?.share === undefined && w('w2')?.crdt === undefined &&
        w('w3')?.crdt === undefined && (parsed.warnings ?? []).some((m) => /not shared/.test(m)), JSON.stringify({ w1: w('w1'), w2: w('w2'), w3: w('w3'), warnings: parsed.warnings }))
      let pending = null
      const store = M.store.createLayoutStore({ filePath: join(dir, 'layout.json'), schedule: (fn) => { pending = fn; return () => { pending = null } } })
      store.load()
      const id = store.activeWorkspaceId()
      store.save({ panels: [{ id: 'n1', x: 0, y: 0, w: 400, h: 300, z: 1, kind: 'terminal', command: 'zsh', cwd: '/tmp', args: [] }], groups: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null, bookmarks: [], runs: [] })
      store.setWorkspaceShare(id, { id: SHARE, orgId: ORG, role: 'owner' })
      store.setSharedState(id, new Uint8Array([1, 2, 3]))
      store.applySharedLayout(id, { rects: [{ id: 'n1', x: 9, y: 8, w: 500, h: 310, z: 4 }], groups: [{ id: 'hostb1_g1', label: 'G', colour: 'green', panelIds: ['n1'] }, { id: 'x', label: 'bad', colour: 'plaid', panelIds: [] }] })
      if (pending) pending()
      const disk = JSON.parse(readFileSync(join(dir, 'layout.json'), 'utf8'))
      const dw = disk.workspaces.find((x) => x.id === id)
      ok('cs.store.1 the layout store is the choke point: a share, the doc\'s bytes and a peer\'s rect and groups all reach layout.json in one write',
        dw.share?.id === SHARE && dw.crdt === Buffer.from([1, 2, 3]).toString('base64') && dw.panels[0].x === 9 && dw.panels[0].z === 4 &&
        dw.groups.length === 1 && dw.groups[0].id === 'hostb1_g1' && Array.from(store.sharedState(id)).join() === '1,2,3', JSON.stringify(dw))
      store.setWorkspaceShare(id, null)
      ok('cs.store.2 unsharing drops the share and its doc together', store.workspaceShare(id) === undefined && store.sharedState(id) === null)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // ── M343: a relay panel's session crosses, so a teammate can Attach ─────
  {
    const a = M.ops.authorizeCanvasOp
    const bind = { kind: 'relay-bind', panelId: 'hosta1_r1', relay: { session: 'S'.repeat(20), program: 'shell' } }
    ok('cs.relay.1 a relay session is bound only by its panel\'s owner: not by an editor on someone else\'s panel, a viewer, an unshared room, or on no panel',
      a('editor', bind, { userId: UA, panelOwner: UA }).ok && a('owner', { ...bind, relay: null }, { userId: UA, panelOwner: UA }).ok &&
      !a('owner', bind, { userId: UB, panelOwner: UA }).ok && !a('editor', bind, { userId: UB, panelOwner: UA }).ok &&
      !a('viewer', bind, { userId: UA, panelOwner: UA }).ok && !a(null, bind, { userId: UA, panelOwner: UA }).ok && !a('owner', bind, { userId: UA, panelOwner: null }).ok)

    const doc = new Y.Doc()
    const S1 = 'sess_' + 'a'.repeat(16), S2 = 'sess_' + 'b'.repeat(16)
    const rp = (relay) => ({ id: 'r1', kind: 'relay', title: 'relay · shell', x: 0, y: 0, w: 720, h: 460, z: 1, ...(relay === undefined ? {} : { relay }) })
    const created = M.doc.diffLocal(doc, { panels: [rp({ session: S1, program: 'shell' })], groups: [] }, { userId: UA, host: 'hosta1' }, () => false, (t) => t)
    for (const op of created) M.doc.applyCanvasOp(doc, op, 'test')
    const read1 = M.doc.readSharedPanels(doc).live.find((x) => x.id === 'hosta1_r1')
    const rebind = M.doc.diffLocal(doc, { panels: [rp({ session: S2, program: 'shell' })], groups: [] }, { userId: UA, host: 'hosta1' }, () => false, (t) => t)
    const unbind = M.doc.diffLocal(doc, { panels: [rp(undefined)], groups: [] }, { userId: UA, host: 'hosta1' }, () => false, (t) => t)
    const same = M.doc.diffLocal(doc, { panels: [rp({ session: S1, program: 'shell' })], groups: [] }, { userId: UA, host: 'hosta1' }, () => false, (t) => t)
    ok('cs.relay.2 a relay panel\'s session goes into the doc on create and is read back; a new session is ONE relay-bind, an ended one unbinds, an unchanged one writes nothing',
      created.length === 1 && created[0].kind === 'create' && read1?.relay?.session === S1 && read1.relay.program === 'shell' &&
      rebind.length === 1 && rebind[0].kind === 'relay-bind' && rebind[0].relay.session === S2 &&
      unbind.length === 1 && unbind[0].kind === 'relay-bind' && unbind[0].relay === null && same.length === 0,
      JSON.stringify({ created, read1, rebind, unbind, same }))

    const probe = (mutate) => { const d = new Y.Doc(); Y.applyUpdate(d, Y.encodeStateAsUpdate(doc)); const sv0 = Y.encodeStateVector(d); mutate(d); return M.doc.inspectUpdate(doc, Y.encodeStateAsUpdate(d, sv0)) }
    const good = probe((d) => d.transact(() => { const fm = d.getMap(M.doc.CANVAS_PANELS).get('hosta1_r1'); fm.set('relaySession', S2) }))
    const half = probe((d) => d.transact(() => { d.getMap(M.doc.CANVAS_PANELS).get('hosta1_r1').delete('relayProgram') }))
    const badId = probe((d) => d.transact(() => { d.getMap(M.doc.CANVAS_PANELS).get('hosta1_r1').set('relaySession', '../etc') }))
    M.doc.applyCanvasOp(doc, { kind: 'create', panel: { id: 'hosta1_n9', kind: 'terminal', title: 't', owner: UA, host: 'hosta1', x: 0, y: 0, w: 1, h: 1, z: 1 } }, 'test')
    const onTerminal = probe((d) => d.transact(() => { const fm = d.getMap(M.doc.CANVAS_PANELS).get('hosta1_n9'); fm.set('relaySession', S1); fm.set('relayProgram', 'shell') }))
    ok('cs.relay.3 inspectUpdate reads a relay session change as relay-bind with the panel\'s owner; half a pair, a malformed id, or a session on a terminal is unknown',
      good.length === 1 && good[0].op.kind === 'relay-bind' && good[0].op.relay.session === S2 && good[0].ctx.panelOwner === UA &&
      half.some((x) => x.op.kind === 'unknown') && badId.some((x) => x.op.kind === 'unknown') && onTerminal.some((x) => x.op.kind === 'unknown'),
      JSON.stringify({ good, half, badId, onTerminal }))

    const RA = machine({ host: 'hosta1', userId: UA, role: 'owner', panels: [{ ...panel('r1', 0), kind: 'relay', relay: { session: S1, program: 'shell' } }] })
    const RB = machine({ host: 'hostb1', userId: UB, role: 'editor' })
    RA.bind(); RB.bind(); relay(RA.doc, RB.doc)
    await tick()
    RB.sync.activated(); await tick()
    const seen = (RB.view()?.placeholders ?? []).find((x) => x.id === 'hosta1_r1')
    ok('cs.relay.4 a teammate\'s view carries the relay placeholder with its session and program — and nothing else of the panel',
      seen?.relay?.session === S1 && seen.relay.program === 'shell' && !('command' in seen) && !('cwd' in seen), JSON.stringify(seen))
    RA.unbind(); RB.unbind()

    const layer = readFileSync(join(root, 'src/renderer/shared-canvas/SharedPlaceholderLayer.tsx'), 'utf8')
    const canvas = readFileSync(join(root, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
    ok('cs.relay.5 a relay placeholder with a session offers Attach (the person\'s click), which opens a relay panel HERE attached to that session',
      /data-shared-relay-attach/.test(layer) && /onClick=\{\(\) => props\.onAttachRelay\?\.\(p\)\}/.test(layer) &&
      /onAttachRelay=\{\(p\) => \{ if \(p\.relay !== undefined\) openRelayPanel\(\{ program: p\.relay\.program, sessionId: p\.relay\.session/.test(canvas))
  }

  // ── the renderer never holds the doc ────────────────────────────────────
  {
    const files = []
    const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p) } }
    walk(join(root, 'src/renderer'))
    const rel = (f) => f.slice(root.length + 1)
    const bad = files.filter((f) => /from ['"](y-protocols[^'"]*|@hocuspocus\/[^'"]+|@shared\/canvas-doc|[./]+\/shared\/canvas-doc)['"]/.test(readFileSync(f, 'utf8'))).map(rel)
    ok('cs.door.1 no renderer module imports y-protocols, Hocuspocus or canvas-doc: the renderer speaks canvas-ops and main holds the doc', bad.length === 0, JSON.stringify(bad))
    // Shared text's one exception (canvas-sync.ts's header): y-monaco needs a
    // Y.Text in the editor's own process, so a REPLICA lives here, gated by main.
    // M339 adds value.ts (Rich mode's binding: yjs only, reached only through binding.ts).
    const DOOR = ['src/renderer/shared-text/binding.ts', 'src/renderer/shared-text/replica.ts', 'src/renderer/shared-text/value.ts']
    const yjsUsers = files.filter((f) => /from ['"](yjs|y-monaco)['"]/.test(readFileSync(f, 'utf8'))).map(rel).sort()
    ok('text.door.1 yjs and y-monaco are imported in the renderer by shared-text/binding.ts, replica.ts and value.ts only', JSON.stringify(yjsUsers) === JSON.stringify(DOOR), JSON.stringify(yjsUsers))
    // Statically reached, the replica would pull yjs + y-monaco into whatever
    // chunk reached it — Canvas.tsx's first chunk, through FileNode.
    const staticReach = files.filter((f) => !DOOR.includes(rel(f)) && /from ['"][./]+(shared-text\/)?(binding|replica|value)['"]/.test(readFileSync(f, 'utf8'))).map(rel)
    // The two lazy doors: CodeEditor (Source mode) and useSharedValue (M339, Rich mode).
    const lazyFrom = files.filter((f) => /import\(['"][./]+(shared-text\/)?binding['"]\)/.test(readFileSync(f, 'utf8'))).map(rel).sort()
    const lazy = JSON.stringify(lazyFrom) === JSON.stringify(['src/renderer/file/CodeEditor.tsx', 'src/renderer/shared-text/useSharedValue.ts'])
    ok('text.door.2 the shared-text chunk is reached only by lazy import() from CodeEditor and useSharedValue, never statically', staticReach.length === 0 && lazy, JSON.stringify({ staticReach, lazyFrom }))
  }

  // ── shared text: one Y.Text per shared file, gated per update ───────────
  {
    const { authorizeCanvasOp: a } = M.ops
    const fc = { kind: 'file-create', fileKey: 'h_n1' }, te = { kind: 'text-edit', fileKey: 'h_n1' }
    ok('text.table.1 a file is shared by its panel\'s owner only, once; owner and editor type into it; a viewer, an unshared room, a tombstone and an unshared file refuse',
      a('editor', fc, { userId: UA, panelOwner: UA, fileExists: false }).ok && !a('owner', fc, { userId: UB, panelOwner: UA, fileExists: false }).ok &&
      !a('owner', fc, { userId: UA, panelOwner: UA, fileExists: true }).ok &&
      a('owner', te, { userId: UA, panelOwner: UB, fileExists: true }).ok && a('editor', te, { userId: UB, panelOwner: UA, fileExists: true }).ok &&
      !a('viewer', te, { userId: UV, panelOwner: UA, fileExists: true }).ok && !a(null, te, { userId: UA, panelOwner: UA, fileExists: true }).ok &&
      !a('editor', te, { userId: UB, panelOwner: null, panelDeleted: true, fileExists: true }).ok && !a('editor', te, { userId: UB, panelOwner: UA, fileExists: false }).ok)

    const file = (id, x) => panel(id, x, { kind: 'file', title: 'notes.md' })
    const TA = machine({ host: 'hosta1', userId: UA, role: 'owner', panels: [file('n1', 0), file('n2', 50)] })
    const TB = machine({ host: 'hostb1', userId: UB, role: 'editor', panels: [file('n1', 500)] })
    const TV = machine({ host: 'hostv1', userId: UV, role: 'viewer' })
    TA.bind(); TB.bind(); TV.bind()
    relay(TA.doc, TB.doc); relay(TA.doc, TV.doc)
    await tick()
    ok('text.open.1 text:open answers the host id, the role and the doc\'s state; an unbound workspace answers null',
      TA.sync.textOpen('w1')?.host === 'hosta1' && TB.sync.textOpen('w1')?.role === 'editor' && TA.sync.textOpen('nope') === null)

    const RA = replicaOf(TA), RB = replicaOf(TB), RV = replicaOf(TV)
    // What binding.ts does for its own panel: the text created and seeded in one transaction.
    RA.doc.transact(() => { const t = new Y.Text(); RA.files().set('hosta1_n1', t); t.insert(0, 'hello world') })
    await tick()
    ok('text.create.1 the owner\'s replica shares its file: main accepts it, the room gets one Y.Text with the seed, and a teammate\'s view lists it',
      lastVerdict(RA)?.ok === true && textOf(TA.doc, 'hosta1_n1') === 'hello world' && textOf(TB.doc, 'hosta1_n1') === 'hello world' &&
      (TB.view()?.files ?? []).includes('hosta1_n1') && !(TA.view()?.files ?? []).includes('hosta1_n1'), JSON.stringify({ v: RA.verdicts, files: TB.view()?.files }))

    await tick()
    const tb = RB.files().get('hosta1_n1')
    tb.insert(0, 'B: ')
    // At the end of the owner's OWN copy: the index a person there would see.
    const ta = RA.files().get('hosta1_n1')
    ta.insert(ta.length, '!')
    await tick()
    ok('text.edit.1 an editor types into the owner\'s file and the owner types at once: both land, every doc and both replicas converge',
      lastVerdict(RB)?.ok === true && textOf(TA.doc, 'hosta1_n1') === 'B: hello world!' && textOf(TB.doc, 'hosta1_n1') === 'B: hello world!' &&
      RA.files().get('hosta1_n1').toString() === 'B: hello world!' && tb.toString() === 'B: hello world!',
      JSON.stringify({ a: textOf(TA.doc, 'hosta1_n1'), b: textOf(TB.doc, 'hosta1_n1'), ra: RA.files().get('hosta1_n1')?.toString(), rb: tb.toString() }))
    ok('text.persist.1 a teammate\'s typing is persisted with the layout on the owner\'s machine (the doc blob), not only held in memory',
      (() => { const d = new Y.Doc(); Y.applyUpdate(d, TA.store.crdt); return textOf(d, 'hosta1_n1') === 'B: hello world!' })())

    // A caret is awareness, and a RELATIVE position: typed in front of, it stays on its character.
    const at = Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(tb, 3))
    const caret = { file: 'hosta1_n1', anchor: Buffer.from(at).toString('base64'), head: Buffer.from(at).toString('base64') }
    RA.files().get('hosta1_n1').insert(0, '>> ')
    await tick()
    const abs = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(Buffer.from(caret.head, 'base64')), RA.doc)
    const parsed = M.presence.parsePresence({ userId: UB, displayName: 'B', textCursor: caret })
    ok('text.caret.1 a caret rides awareness as base64 relative positions, parses bounded, and still names its character after text is inserted before it',
      abs?.index === 6 && abs.type === RA.files().get('hosta1_n1') && parsed?.textCursor?.file === 'hosta1_n1' &&
      M.presence.parsePresence({ userId: UB, displayName: 'B', textCursor: { ...caret, head: 'x'.repeat(400) } })?.textCursor === null &&
      M.presence.parsePresence({ userId: UB, displayName: 'B', textCursor: { ...caret, file: '../x' } })?.textCursor === null &&
      ![...TA.doc.share.keys()].some((k) => /cursor|selection|awareness/.test(k)), JSON.stringify({ abs: abs?.index, keys: [...TA.doc.share.keys()] }))

    // M339. Rich mode's value binding (shared-text/value.ts) over the same replicas.
    {
      const seen = []
      const vA = M.value.bindValue(RA.files().get('hosta1_n1'), (t) => seen.push(t), false)
      RB.files().get('hosta1_n1').insert(0, '# ')
      await tick()
      const peer = seen.slice()
      seen.length = 0
      const base = RA.files().get('hosta1_n1').toString()
      vA.push(`${base} (done)`)
      await tick()
      ok('text.value.1 a Rich draft bound to the shared text: a teammate\'s change arrives as the whole text, and a Rich commit reaches every doc without echoing back',
        peer.length === 1 && peer[0] === base && base.startsWith('# ') && seen.length === 0 && lastVerdict(RA)?.ok === true &&
        textOf(TB.doc, 'hosta1_n1') === `${base} (done)`, JSON.stringify({ peer, seen, base, b: textOf(TB.doc, 'hosta1_n1') }))
      // Concurrent: the teammate types at the front while the owner's commit
      // changes the end. A whole-text replace would drop one of them.
      const now = RA.files().get('hosta1_n1').toString()
      RB.files().get('hosta1_n1').insert(0, 'X')
      // The harness relays synchronously, so X is ALREADY in RA's text: the
      // commit below was computed on `now`, which is stale — the real race.
      const stale = RA.files().get('hosta1_n1').toString() !== now
      seen.length = 0
      vA.push(now.replace('(done)', '(really done)'), now)
      await tick()
      const merged = textOf(TA.doc, 'hosta1_n1')
      ok('text.value.2 a Rich commit computed on a text a teammate has since changed is REBASED: their keystroke elsewhere survives, and the draft is told the merged text',
        stale && merged === `X${now.replace('(done)', '(really done)')}` && RB.files().get('hosta1_n1').toString() === merged && seen.at(-1) === merged,
        JSON.stringify({ stale, merged, seen }))
      seen.length = 0
      vA.revert('from disk')
      await tick()
      ok('text.value.3 the owner\'s Reload/discard puts the shared text back to the disk text for everyone, and the bound draft is told',
        textOf(TA.doc, 'hosta1_n1') === 'from disk' && textOf(TB.doc, 'hosta1_n1') === 'from disk' && seen.at(-1) === 'from disk', JSON.stringify({ seen, a: textOf(TA.doc, 'hosta1_n1') }))
      vA.dispose()
      seen.length = 0
      RB.files().get('hosta1_n1').insert(0, 'late ')
      await tick()
      const RV2 = replicaOf(TV)
      const vV = M.value.bindValue(RV2.files().get('hosta1_n1'), () => {}, true)
      vV.push('viewer wrote this')
      await tick()
      ok('text.value.4 a disposed binding hears nothing more, and a viewer\'s Rich push is dropped before it reaches main',
        seen.length === 0 && RV2.verdicts.length === 0 && textOf(TA.doc, 'hosta1_n1') === 'late from disk', JSON.stringify({ seen, v: RV2.verdicts, a: textOf(TA.doc, 'hosta1_n1') }))
      vV.dispose()
      // The FileNode side, read as text (no harness here mounts a shared note):
      // Rich pushes through the binding, the owner-wins-once rule reads the
      // unsynced flag rather than `dirty`, and Reload reverts before closing.
      const fileNode = readFileSync(join(root, 'src/renderer/file/FileNode.tsx'), 'utf8')
      ok('text.value.5 FileNode binds Rich mode (useSharedValue + push on commit), both bindings prefer the local draft only when it holds unsynced typing, and Reload (discard mine) reverts the shared text',
        /useSharedValue\(/.test(fileNode) && /onChange=\{\(text\) => \{ const base = richBaseRef\.current \?\? text; richBaseRef\.current = text; editDraft\(text\); pushShared\(text, base\) \}\}/.test(fileNode) &&
        (fileNode.match(/preferLocal: \(\) => unsyncedRef\.current/g) ?? []).length === 2 && !/preferLocal: \(\) => dirtyRef/.test(fileNode) &&
        /data-file-node-reload[\s\S]{0,900}sharedRevertRef\.current\?\.\([\s\S]{0,120}closeDraft\(\)/.test(fileNode))
    }

    RV.files().get('hosta1_n1').insert(0, 'V')
    ok('text.viewer.1 a viewer\'s replica edit is refused in main and never reaches the doc', lastVerdict(RV)?.ok === false && /viewer/.test(lastVerdict(RV).reason) &&
      !textOf(TA.doc, 'hosta1_n1').startsWith('V') && !textOf(TV.doc, 'hosta1_n1').startsWith('V'), JSON.stringify(RV.verdicts))
    const after = TV.sync.textUpdate('w1', Y.encodeStateAsUpdate(new Y.Doc()))
    ok('text.reset.1 a refusal ends that replica: main takes nothing more from it until it re-opens', after.ok === false && /no shared doc open/.test(after.reason) && TV.sync.textOpen('w1') !== null)

    const RB2 = replicaOf(TB)
    RB2.doc.transact(() => { const t = new Y.Text(); RB2.files().set('hosta1_n2', t); t.insert(0, 'mine now') })
    const RB3 = replicaOf(TB)
    RB3.doc.getMap(M.doc.CANVAS_PANELS).get('hosta1_n1').set('x', 7)
    ok('text.refuse.1 a replica may not share a teammate\'s file, nor move a panel: the canvas maps have their own gated doors',
      /whose panel/.test(RB2.verdicts[0]?.reason ?? '') && textOf(TA.doc, 'hosta1_n2') === undefined &&
      /shared text only/.test(RB3.verdicts[0]?.reason ?? '') && field(TA.doc, 'hosta1_n1', 'x') === 0, JSON.stringify({ b2: RB2.verdicts, b3: RB3.verdicts }))

    // An update that builds on history main lacks: made on a doc main never saw.
    const RB4 = replicaOf(TB)
    const ghost = new Y.Doc()
    Y.applyUpdate(ghost, Y.encodeStateAsUpdate(RB4.doc))
    const gt = ghost.getMap(M.ops.CANVAS_FILES).get('hosta1_n1')
    gt.insert(0, 'a')
    const sv = Y.encodeStateVector(ghost)
    gt.insert(0, 'b')
    const pending = TB.sync.textUpdate('w1', Y.encodeStateAsUpdate(ghost, sv))
    ok('text.pending.1 an update missing the history it builds on is refused before it can sit PENDING and integrate later, unjudged',
      pending.ok === false && /history/.test(pending.reason) && !textOf(TB.doc, 'hosta1_n1').startsWith('b'), JSON.stringify(pending))

    const replaced = new Y.Doc()
    Y.applyUpdate(replaced, Y.encodeStateAsUpdate(TA.doc))
    const probe = (mutate) => { const d = new Y.Doc(); Y.applyUpdate(d, Y.encodeStateAsUpdate(TA.doc)); const sv0 = Y.encodeStateVector(d); mutate(d); return M.doc.inspectUpdate(TA.doc, Y.encodeStateAsUpdate(d, sv0)) }
    const swap = probe((d) => d.getMap(M.ops.CANVAS_FILES).set('hosta1_n1', new Y.Text('gone')))
    const big = probe((d) => d.getMap(M.ops.CANVAS_FILES).get('hosta1_n1').insert(0, 'x'.repeat(M.ops.SHARED_TEXT_MAX)))
    const edit = probe((d) => d.getMap(M.ops.CANVAS_FILES).get('hosta1_n1').insert(0, 'ok'))
    ok('text.inspect.1 inspectUpdate reads a file\'s text replaced and a text past SHARED_TEXT_MAX as unknown; an ordinary insert as one text-edit',
      swap.some((x) => x.op.kind === 'unknown' && /replaced/.test(x.op.detail)) && big.some((x) => x.op.kind === 'unknown' && /limit/.test(x.op.detail)) &&
      edit.length === 1 && edit[0].op.kind === 'text-edit' && edit[0].ctx.fileExists === true, JSON.stringify({ swap, big: big.map((x) => x.op), edit }))

    const RB5 = replicaOf(TB)
    const u = TB.unbind; u()
    ok('text.reset.2 the room closing tells an open replica to reset (re-open from the new doc)', RB5.resets >= 1)
  }

  // ── collab auth (onAuthenticate's lookup) ───────────────────────────────
  {
    const calls = []
    const fetch = async (url, init) => {
      calls.push(url)
      const token = init.headers.authorization.replace('Bearer ', '')
      if (url.endsWith('/auth/v1/user')) return token === 'dead' ? { status: 401, text: async () => '{}' } : { status: 200, text: async () => JSON.stringify({ id: token === 'tb' ? UB : UA }) }
      if (url.endsWith('/rest/v1/rpc/workspace_role')) return { status: 200, text: async () => (token === 'tb' ? 'null' : '"editor"') }
      return { status: 404, text: async () => '' }
    }
    const auth = M.auth.createCollabAuth({ supabaseUrl: 'https://p.example', anonKey: 'anon', fetch })
    const reason = async (p) => { try { await p; return null } catch (e) { return e.reason ?? String(e) } }
    const shared = await auth('ta', `tc:workspace:${SHARE}`)
    const local = await auth('ta', 'tc:workspace:w3')
    ok('cs.auth.1 a shared room\'s role is the share\'s, asked as the person; an unshared room is presence-only (role null)',
      shared.role === 'editor' && shared.userId === UA && shared.shareId === SHARE && local.role === null && local.shareId === null)
    ok('cs.auth.2 a dead token, a non-member and a room that is not ours are each refused by name',
      /not valid/.test(await reason(auth('dead', `tc:workspace:${SHARE}`))) &&
      /not a member/.test(await reason(auth('tb', `tc:workspace:${SHARE}`))) &&
      /not a Terminal Canvas room/.test(await reason(auth('ta', 'other:doc'))))
  }

  // ── M375: the team ask queue — the policy, the table, the reader ──────────
  {
    const P = M.asks
    const need = [P.approvalsNeeded(undefined, 5), P.approvalsNeeded(4.99, 5), P.approvalsNeeded(5, 5), P.approvalsNeeded(9, undefined), P.approvalsNeeded(9, 0)]
    const dec = [P.askDecision(1, {}), P.askDecision(1, { a: 'allow' }), P.askDecision(2, { a: 'allow' }), P.askDecision(2, { a: 'allow', b: 'allow' }), P.askDecision(2, { a: 'allow', b: 'deny' })]
    ok('ask.policy.1 an ask needs one allow, or two distinct people\'s once the agent\'s spend reaches the team\'s line; one deny decides it; the count reads as words',
      need.join(',') === '1,1,2,1,1' && dec.join(',') === 'open,allowed,open,allowed,denied' &&
        P.askProgressWords(2, { a: 'allow' }) === '1 of 2 allowed — spend past the team\'s line needs two people' && P.askProgressWords(1, {}) === 'waiting for one person',
      JSON.stringify({ need, dec }))

    const a = M.ops.authorizeCanvasOp
    const ask = { id: 'hosta1_q1', panel: 'hosta1_n1', owner: UA, tool: 'Bash', summary: 'npm test', scrubbed: 0, at: 1, need: 1 }
    const open = (role, userId, panelOwner, over = {}) => a(role, { kind: 'ask-open', ask: { ...ask, ...over } }, { userId, panelOwner, askOwner: null })
    const answer = (role, userId, by, ctx = {}) => a(role, { kind: 'ask-answer', askId: 'hosta1_q1', by, answer: 'allow' }, { userId, panelOwner: null, askOwner: UA, askClosed: false, ...ctx })
    const close = (role, userId, ctx = {}) => a(role, { kind: 'ask-close', askId: 'hosta1_q1', outcome: 'allowed' }, { userId, panelOwner: null, askOwner: UA, askClosed: false, ...ctx })
    const t = {
      ownerOpens: open('owner', UA, UA).ok,
      editorOpensOwn: open('editor', UB, UB, { owner: UB }).ok,
      forAnothersAgent: open('editor', UB, UA, { owner: UB }),
      inAnothersName: open('editor', UB, UB),
      viewerOpens: open('viewer', UV, UV, { owner: UV }).ok,
      editorAnswers: answer('editor', UB, UB).ok,
      ownerAnswers: answer('owner', UA, UA).ok,
      answersForAnother: answer('editor', UB, UA),
      viewerAnswers: answer('viewer', UV, UV).ok,
      afterClose: answer('editor', UB, UB, { askClosed: true }),
      noSuchAsk: answer('editor', UB, UB, { askOwner: null }),
      ownerCloses: close('owner', UA).ok,
      editorCloses: close('editor', UB),
      reclose: close('owner', UA, { askClosed: true })
    }
    ok('ask.auth.1 the table: an ask is opened for your own agent in your own name, answered in your own name while open, closed once by its owner; a viewer does none of it',
      t.ownerOpens && t.editorOpensOwn && /your own agent/.test(t.forAnothersAgent.reason ?? '') && /asker's name/.test(t.inAnothersName.reason ?? '') && !t.viewerOpens &&
        t.editorAnswers && t.ownerAnswers && /own name/.test(t.answersForAnother.reason ?? '') && !t.viewerAnswers &&
        /already decided/.test(t.afterClose.reason ?? '') && /no ask/.test(t.noSuchAsk.reason ?? '') &&
        t.ownerCloses && /only the person whose agent asked/.test(t.editorCloses.reason ?? '') && /already decided/.test(t.reclose.reason ?? ''),
      JSON.stringify(t))

    const base = new Y.Doc()
    M.doc.applyCanvasOp(base, { kind: 'create', panel: { id: 'hosta1_n1', kind: 'chat', title: 'agent', owner: UA, host: 'hosta1', x: 0, y: 0, w: 400, h: 300, z: 1 } }, 'test')
    const probe = (mutate) => { const d = new Y.Doc(); Y.applyUpdate(d, Y.encodeStateAsUpdate(base)); const sv0 = Y.encodeStateVector(d); mutate(d); return M.doc.inspectUpdate(base, Y.encodeStateAsUpdate(d, sv0)) }
    const opened = probe((d) => M.doc.applyCanvasOp(d, { kind: 'ask-open', ask }, 'test'))
    M.doc.applyCanvasOp(base, { kind: 'ask-open', ask }, 'test')
    const answered = probe((d) => M.doc.applyCanvasOp(d, { kind: 'ask-answer', askId: 'hosta1_q1', by: UB, answer: 'deny' }, 'test'))
    const closed = probe((d) => M.doc.applyCanvasOp(d, { kind: 'ask-close', askId: 'hosta1_q1', outcome: 'denied' }, 'test'))
    const stray = probe((d) => d.getMap(M.ops.CANVAS_ASKS).get('hosta1_q1').set('tool', 'Write'))
    const malformed = probe((d) => { const fm = new Y.Map(); for (const [k, v] of Object.entries({ panel: 'hosta1_n1', owner: UA, tool: 'Bash', summary: 's', scrubbed: 0, at: 1, need: 1, ['answer:' + UA]: 'allow' })) fm.set(k, v); d.getMap(M.ops.CANVAS_ASKS).set('hosta1_q2', fm) })
    M.doc.applyCanvasOp(base, { kind: 'ask-answer', askId: 'hosta1_q1', by: UB, answer: 'allow' }, 'test')
    const rewritten = probe((d) => d.getMap(M.ops.CANVAS_ASKS).get('hosta1_q1').set('answer:' + UB, 'deny'))
    const read = M.doc.readSharedAsks(base)
    ok('ask.inspect.1 inspectUpdate reads an ask opened (with its panel\'s owner), an answer by the field\'s person, and a close; a rewritten answer, a rewritten field and an ask created with an answer inside are unknown',
      opened.length === 1 && opened[0].op.kind === 'ask-open' && opened[0].ctx.panelOwner === UA &&
        answered.length === 1 && answered[0].op.kind === 'ask-answer' && answered[0].op.by === UB && answered[0].op.answer === 'deny' && answered[0].ctx.askOwner === UA &&
        closed.length === 1 && closed[0].op.kind === 'ask-close' && closed[0].op.outcome === 'denied' &&
        stray[0]?.op.kind === 'unknown' && malformed[0]?.op.kind === 'unknown' && rewritten[0]?.op.kind === 'unknown' &&
        read.length === 1 && read[0].answers[UB] === 'allow' && read[0].closed === undefined,
      JSON.stringify({ opened, answered, closed, stray, malformed, rewritten, read }))
  }

  // ── M376: the owner's machine routes, reads and decides ──────────────────
  //     A real owner canvas-sync (A) and a teammate's (B), relayed like a
  //     room; a stand-in agent manager whose `answer` is the one door.
  {
    let router = null
    const A = machine({ host: 'hosta1', userId: UA, role: 'owner', panels: [panel('c1', 0, { kind: 'chat' })], extra: { onAsks: (w) => router?.asksChanged(w) } })
    const B = machine({ host: 'hostb1', userId: UB, role: 'editor' })
    A.bind(); B.bind(); relay(A.doc, B.doc)
    let enabled = true, spent = 1
    const pending = new Set(), answered = [], records = []
    let n = 0
    const deps = {
      enabled: () => enabled, escalateAtUsd: () => 5, host: () => 'hosta1', userId: () => UA,
      workspaceOfPanel: (id) => A.sync.workspaceOfPanel(id), asks: (w) => A.sync.asks(w), writeAsk: (w, op) => A.sync.writeAsk(w, op),
      spentOf: () => spent,
      answer: (panelId, requestId, answer) => {
        answered.push({ requestId, answer })
        const had = pending.delete(requestId)
        // The manager's own event for this very answer, as agent-runtime fans it out.
        if (had) router.agentEvent({ id: panelId, type: 'permission-answered', requestId, allow: answer.allow })
        return had
      },
      record: (row) => records.push(row), mintId: () => `q${++n}`
    }
    router = M.router.createTeamAskRouter(deps)
    const ask = (requestId, input, toolName = 'Bash') => { pending.add(requestId); router.agentEvent({ id: 'c1', type: 'permission-request', requestId, toolName, input }) }
    const onB = (id) => M.doc.readSharedAsks(B.doc).find((q) => q.ask.id === id)
    const answerB = (id, answer) => B.sync.writeAsk('w1', { kind: 'ask-answer', askId: id, by: UB, answer })

    // One allow decides a request under the line; the summary crossed scrubbed.
    ask('r1', { command: 'curl -H "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789" https://api.github.com/user', description: 'who am I' })
    const r1 = onB('hosta1_q1')
    answerB('hosta1_q1', 'allow')
    const r1After = onB('hosta1_q1')
    ok('team.route.1 a request on a shared canvas reaches a teammate as an ask, its one line scrubbed with the count; the teammate\'s allow answers the process through the one door, closes the ask as allowed, and is on the record as the team\'s',
      r1 !== undefined && r1.ask.panel === 'hosta1_c1' && r1.ask.need === 1 && r1.ask.scrubbed === 1 && !/ghp_/.test(r1.ask.summary) && /api\.github\.com/.test(r1.ask.summary) &&
        answered.some((a) => a.requestId === 'r1' && a.answer.allow === true) && r1After?.closed === 'allowed' &&
        records.length === 1 && /^Allowed Bash — curl .*, by a teammate on the team$/.test(records[0].title) && records[0].source === 'person' && records[0].panelId === 'c1',
      JSON.stringify({ r1, r1After, answered, records }))

    // Past the line: the owner's own allow is one of two, and the request waits.
    spent = 6
    ask('r2', { command: 'npm publish' })
    const waiting = router.localAnswer('c1', 'r2', { allow: true })
    const beforeSecond = answered.some((a) => a.requestId === 'r2')
    const r2Mid = onB('hosta1_q2')
    answerB('hosta1_q2', 'allow')
    const r2After = onB('hosta1_q2')
    // One deny decides, whatever the count.
    ask('r3', { command: 'rm -rf build' })
    answerB('hosta1_q3', 'deny')
    const r3 = answered.find((a) => a.requestId === 'r3')
    ok('team.route.2 past the spend line an ask needs two people: the owner\'s own allow is one (the request waits, unanswered), a teammate\'s is the second; a single deny decides at once, in the team\'s words',
      waiting === 'waiting' && !beforeSecond && r2Mid?.ask.need === 2 && r2Mid?.answers[UA] === 'allow' && r2After?.closed === 'allowed' &&
        answered.some((a) => a.requestId === 'r2' && a.answer.allow === true) && /by 2 people on the team/.test(records[1]?.title ?? '') &&
        r3?.answer.allow === false && /A teammate denied/.test(r3.answer.message) && onB('hosta1_q3')?.closed === 'denied',
      JSON.stringify({ waiting, r2Mid, r2After, r3, records: records.map((r) => r.title) }))

    // What never leaves: a Write's content, a plan, main's own question, anything with routing off.
    const before = router.open().length
    ask('r4', { file_path: '/repo/a.ts', content: 'secret stuff' }, 'Write')
    ask('r5', { plan: '# Plan' }, 'ExitPlanMode')
    ask('tc-ext-1', { command: 'POST /repos' })
    enabled = false
    ask('r6', { command: 'ls' })
    enabled = true
    const notRouted = router.open().length === before && M.doc.readSharedAsks(B.doc).length === 3
    // A request that ends another way withdraws its ask; so does a relaunch.
    ask('r7', { command: 'make' })
    router.agentEvent({ id: 'c1', type: 'permission-dropped', requestId: 'r7' })
    ask('r8', { command: 'make test' })
    const fresh = M.router.createTeamAskRouter(deps)
    fresh.asksChanged('w1')
    // The owner alone deciding keeps their own words.
    spent = 1
    ask('r9', { command: 'git push' })
    const decided = router.localAnswer('c1', 'r9', { allow: false, message: 'not from this branch' })
    ok('team.route.3 a Write\'s content, a plan, main\'s own credential question and a request with routing off stay here; a dropped request and a relaunch withdraw their asks; the owner deciding alone answers in their own words',
      notRouted && onB('hosta1_q4')?.closed === 'withdrawn' && onB('hosta1_q5')?.closed === 'withdrawn' &&
        decided === 'decided' && answered.find((a) => a.requestId === 'r9')?.answer.message === 'not from this branch' && onB('hosta1_q6')?.closed === 'denied' &&
        records.length === 3 && /^Denied Bash — rm -rf build, by a teammate/.test(records[2].title),
      JSON.stringify({ asks: M.doc.readSharedAsks(B.doc).map((q) => [q.ask.id, q.ask.summary, q.closed]), records: records.length }))
  }

  // ── the real server: onAuthenticate + beforeSync over a socket ──────────
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
      const st = { synced: false, denied: null, closed: 0 }
      const p = new HocuspocusProvider({
        url, name, document: doc, token,
        onSynced: () => { st.synced = true },
        onAuthenticationFailed: ({ reason }) => { st.denied = reason },
        onClose: () => { st.closed += 1 }
      })
      providers.push(p)
      return { doc, st, p }
    }
    try {
      const owner = join('towner')
      await until(() => owner.st.synced)
      M.doc.applyCanvasOp(owner.doc, { kind: 'create', panel: { id: 'hosta1_n1', kind: 'terminal', title: 'build', owner: UA, host: 'hosta1', x: 0, y: 0, w: 400, h: 300, z: 1 } }, 'test')
      const editor = join('teditor'), viewer = join('tviewer'), stranger = join('tnobody')
      await until(() => editor.st.synced && viewer.st.synced && stranger.st.denied !== null)
      await until(() => live(editor.doc).length === 1 && live(viewer.doc).length === 1)
      ok('srv.auth.1 onAuthenticate: members join and receive the canvas; a non-member is denied with the reason',
        live(editor.doc).length === 1 && live(viewer.doc).length === 1 && /not a member/.test(stranger.st.denied ?? ''), JSON.stringify(stranger.st))

      viewer.doc.getMap(M.doc.CANVAS_PANELS).get('hosta1_n1').set('x', 999)
      await new Promise((r) => setTimeout(r, 300))
      ok('srv.viewer.1 a viewer\'s connection is read-only: its write never reaches the room, and it stays connected (awareness keeps flowing)',
        field(owner.doc, 'hosta1_n1', 'x') === 0 && field(editor.doc, 'hosta1_n1', 'x') === 0 && viewer.st.closed === 0 && !refusals.some((r) => r.userId === UV),
        JSON.stringify({ closed: viewer.st.closed, refusals }))

      M.doc.applyCanvasOp(editor.doc, { kind: 'rect', panelId: 'hosta1_n1', fields: { x: 120 } }, 'test')
      await until(() => field(owner.doc, 'hosta1_n1', 'x') === 120)
      ok('srv.editor.1 beforeSync lets an editor\'s move of the owner\'s panel through', field(owner.doc, 'hosta1_n1', 'x') === 120)

      const closedBefore = editor.st.closed
      editor.doc.getMap(M.doc.CANVAS_PANELS).get('hosta1_n1').set('deleted', true)
      await until(() => editor.st.closed > closedBefore)
      await new Promise((r) => setTimeout(r, 200))
      ok('srv.editor.2 beforeSync refuses an editor deleting the owner\'s panel: the connection closes and the room never sees the tombstone',
        editor.st.closed > closedBefore && field(owner.doc, 'hosta1_n1', 'deleted') === undefined &&
        refusals.some((r) => r.userId === UB && /own/.test(r.reason)), JSON.stringify({ closed: editor.st.closed, refusals }))

      M.doc.applyCanvasOp(owner.doc, { kind: 'create', panel: { id: 'hosta1_n5', kind: 'file', title: 'a.md', owner: UA, host: 'hosta1', x: 0, y: 0, w: 400, h: 300, z: 1 } }, 'test')
      owner.doc.transact(() => { const t = new Y.Text(); owner.doc.getMap(M.ops.CANVAS_FILES).set('hosta1_n5', t); t.insert(0, 'seed') })
      const ed2 = join('teditor')
      await until(() => ed2.st.synced && M.doc.sharedText(ed2.doc, 'hosta1_n5')?.toString() === 'seed')
      M.doc.sharedText(ed2.doc, 'hosta1_n5').insert(4, ' + B')
      await until(() => M.doc.sharedText(owner.doc, 'hosta1_n5')?.toString() === 'seed + B')
      ok('srv.text.1 the owner shares a file and an editor types into it: both pass beforeSync', M.doc.sharedText(owner.doc, 'hosta1_n5')?.toString() === 'seed + B' && ed2.st.closed === 0)
      const ed2Closed = ed2.st.closed
      ed2.doc.transact(() => { const t = new Y.Text(); ed2.doc.getMap(M.ops.CANVAS_FILES).set('hosta1_n1', t); t.insert(0, 'not yours') })
      await until(() => ed2.st.closed > ed2Closed, 2000)
      ok('srv.text.2 an editor sharing the owner\'s file is refused by beforeSync: closed, and the room never sees the text',
        ed2.st.closed > ed2Closed && M.doc.sharedText(owner.doc, 'hosta1_n1') === undefined, JSON.stringify(refusals.slice(-1)))

      const owner2 = new Y.Doc()
      owner2.getMap('evil').set('k', 1)
      const bad = join('towner')
      Y.applyUpdate(bad.doc, Y.encodeStateAsUpdate(owner2))
      await until(() => bad.st.closed > 0, 2000)
      ok('srv.unknown.1 even the owner cannot write outside the canvas maps: a new root type is refused and closes the connection',
        bad.st.closed > 0 && !owner.doc.share.has('evil'))

      // M343. Through the real server: the owner binds their relay panel's
      // session; an editor re-pointing it is refused and closed.
      const RS = 'sess_' + 'c'.repeat(16)
      M.doc.applyCanvasOp(owner.doc, { kind: 'create', panel: { id: 'hosta1_r2', kind: 'relay', title: 'relay · shell', owner: UA, host: 'hosta1', x: 0, y: 0, w: 720, h: 460, z: 1 } }, 'test')
      M.doc.applyCanvasOp(owner.doc, { kind: 'relay-bind', panelId: 'hosta1_r2', relay: { session: RS, program: 'shell' } }, 'test')
      const ed3 = join('teditor')
      await until(() => ed3.st.synced && live(ed3.doc).find((x) => x.id === 'hosta1_r2')?.relay?.session === RS)
      const ed3Closed = ed3.st.closed
      ed3.doc.getMap(M.doc.CANVAS_PANELS).get('hosta1_r2').set('relaySession', 'sess_' + 'd'.repeat(16))
      await until(() => ed3.st.closed > ed3Closed, 2000)
      ok('srv.relay.1 the owner\'s relay session reaches an editor through beforeSync; the editor re-pointing it is refused, closed, and the room keeps the owner\'s',
        ed3.st.closed > ed3Closed && field(owner.doc, 'hosta1_r2', 'relaySession') === RS && refusals.some((r) => r.userId === UB && /relay session/.test(r.reason)),
        JSON.stringify(refusals.slice(-1)))

      // M375. The team queue through the real server: the owner opens an ask
      // for their own agent; an editor's answer in their OWN name reaches
      // the owner; the same editor answering in the owner's name is refused
      // and closed; a viewer's answer is dropped; the owner closes it.
      M.doc.applyCanvasOp(owner.doc, { kind: 'create', panel: { id: 'hosta1_c1', kind: 'chat', title: 'agent', owner: UA, host: 'hosta1', x: 0, y: 0, w: 400, h: 300, z: 1 } }, 'test')
      M.doc.applyCanvasOp(owner.doc, { kind: 'ask-open', ask: { id: 'hosta1_q9', panel: 'hosta1_c1', owner: UA, tool: 'Bash', summary: 'npm test', scrubbed: 0, at: 5, need: 2, spentUsd: 6 } }, 'test')
      const ed4 = join('teditor'), vw4 = join('tviewer')
      const askOn = (doc) => M.doc.readSharedAsks(doc).find((q) => q.ask.id === 'hosta1_q9')
      await until(() => ed4.st.synced && vw4.st.synced && askOn(ed4.doc) !== undefined && askOn(vw4.doc) !== undefined)
      M.doc.applyCanvasOp(ed4.doc, { kind: 'ask-answer', askId: 'hosta1_q9', by: UB, answer: 'allow' }, 'test')
      await until(() => askOn(owner.doc)?.answers[UB] === 'allow')
      vw4.doc.getMap(M.ops.CANVAS_ASKS).get('hosta1_q9').set('answer:' + UV, 'allow')
      const ed5 = join('teditor')
      await until(() => ed5.st.synced && askOn(ed5.doc) !== undefined)
      const ed5Closed = ed5.st.closed
      ed5.doc.getMap(M.ops.CANVAS_ASKS).get('hosta1_q9').set('answer:' + UA, 'allow')
      await until(() => ed5.st.closed > ed5Closed, 2000)
      await new Promise((r) => setTimeout(r, 200))
      M.doc.applyCanvasOp(owner.doc, { kind: 'ask-close', askId: 'hosta1_q9', outcome: 'withdrawn' }, 'test')
      await until(() => askOn(ed4.doc)?.closed === 'withdrawn')
      const seen = askOn(owner.doc)
      ok('srv.ask.1 the team queue through the real server: an editor\'s answer in their own name reaches the owner; answering in the owner\'s name is refused and closed; a viewer\'s answer is dropped; the owner\'s close reaches the editor',
        seen?.answers[UB] === 'allow' && seen?.answers[UA] === undefined && seen?.answers[UV] === undefined && ed5.st.closed > ed5Closed &&
          refusals.some((r) => r.userId === UB && /own name/.test(r.reason)) && askOn(ed4.doc)?.closed === 'withdrawn' && M.asks.askDecision(seen.ask.need, seen.answers) === 'open',
        JSON.stringify({ seen, refusals: refusals.slice(-2) }))
    } finally {
      for (const p of providers) p.destroy()
      await server.destroy()
    }
  }

  // ── M346: the collab server keeps its rooms (persistence.ts, on PGlite) ──
  // The migration and the store's own SQL run on real Postgres (PGlite, in
  // process); two real Hocuspocus servers share one store across a restart.
  {
    const { PGlite } = require('@electric-sql/pglite')
    const pg = new PGlite()
    // The roles PostgREST serves exist on every Supabase project; the migration revokes from them by name.
    await pg.exec('create role anon; create role authenticated;')
    await pg.exec(readFileSync(join(root, 'supabase/migrations/20260926120000_collab_documents.sql'), 'utf8'))
    const query = (text, params) => pg.query(text, params)
    const priv = async (role, obj, what) => (await pg.query(`select has_table_privilege('${role}', '${obj}', '${what}') as ok`)).rows[0].ok
    const schemaUse = async (role) => (await pg.query(`select has_schema_privilege('${role}', 'collab', 'usage') as ok`)).rows[0].ok
    const leaks = []
    for (const role of ['anon', 'authenticated']) {
      if (await schemaUse(role)) leaks.push(`${role} usage`)
      for (const t of ['collab.documents', 'collab.snapshots']) for (const w of ['select', 'insert', 'update', 'delete']) if (await priv(role, t, w)) leaks.push(`${role} ${w} ${t}`)
    }
    ok('persist.schema.1 the migration runs on real Postgres, and the roles PostgREST serves (anon — the key the app ships — and authenticated) get NOTHING in the collab schema', leaks.length === 0, JSON.stringify(leaks))

    const store = M.persistence.createPgDocStore(query, { keep: 3 })
    const ROOM = `tc:workspace:${SHARE}`
    const before = await store.load(ROOM)
    await store.store(ROOM, new Uint8Array([1, 2, 3]))
    await store.store(ROOM, new Uint8Array([4, 5]))
    const after = await store.load(ROOM)
    const rooms = await store.rooms()
    ok('persist.store.1 a room loads null until stored; a store replaces its one row; rooms() lists it with its size',
      before === null && after !== null && Array.from(after).join() === '4,5' && rooms.length === 1 && rooms[0].name === ROOM && rooms[0].bytes === 2, JSON.stringify({ before, after: after && Array.from(after), rooms }))
    for (let i = 0; i < 5; i++) await store.snapshot(ROOM, new Uint8Array([i]), i === 4 ? 'manual' : 'interval')
    const snaps = await store.snapshots(ROOM)
    const newest = snaps[0] === undefined ? null : await store.snapshotState(snaps[0].id)
    ok('persist.snap.1 snapshots are kept newest first and PRUNED to the room\'s bound as they are taken; one reads back by id with its room',
      snaps.length === 3 && snaps[0].reason === 'manual' && newest !== null && Array.from(newest.state).join() === '4' && newest.name === ROOM &&
      (await store.lastSnapshotAt(ROOM)) !== null, JSON.stringify(snaps))
    let refusedName = null
    try { await store.store('tc:workspace:w1', new Uint8Array([1])) } catch (e) { refusedName = String(e.message || e) }
    ok('persist.name.1 the table itself refuses a room that is not a share\'s (an unshared workspace\'s presence room is never kept)', refusedName !== null && /check/i.test(refusedName), refusedName)

    // Two real servers over the one store: the first keeps the room, the
    // second — the owner offline — serves it to a teammate who arrives later.
    const people = { towner: { userId: UA, role: 'owner' }, teditor: { userId: UB, role: 'editor' } }
    const logs = []
    const mk = (port) => M.server.createCollabServer({
      port, address: '127.0.0.1', quiet: true, store, snapshotEveryMs: 0, debounceMs: 40,
      log: M.log.createLog((line) => logs.push(JSON.parse(line))),
      authenticate: async (token, documentName) => { const p = people[token]; if (p === undefined) throw new M.auth.Refused('no'); return { ...p, shareId: SHARE, documentName } }
    })
    const connect = (port, token, name = ROOM) => {
      const doc = new Y.Doc()
      const st = { synced: false }
      const p = new HocuspocusProvider({ url: `ws://127.0.0.1:${port}`, name, document: doc, token, onSynced: () => { st.synced = true } })
      return { doc, st, p }
    }
    await pg.query('delete from collab.documents')
    const port1 = await freePort()
    const s1 = mk(port1)
    await s1.listen()
    const owner = connect(port1, 'towner')
    await until(() => owner.st.synced)
    M.doc.applyCanvasOp(owner.doc, { kind: 'create', panel: { id: 'hosta1_p1', kind: 'terminal', title: 'kept', owner: UA, host: 'hosta1', x: 10, y: 20, w: 400, h: 300, z: 1 } }, 'test')
    owner.doc.getMap('team').set(`snapshot:${UA}`, { stale: true })
    // Also a presence-only room, which must not be kept.
    const local = connect(port1, 'towner', 'tc:workspace:w1')
    await until(() => local.st.synced)
    // An ASYNC predicate: `until` would read its promise as truthy and pass at once.
    const untilAsync = async (pred, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await pred()) return true; await new Promise((r) => setTimeout(r, 25)) } return pred() }
    const stored = await untilAsync(async () => { const b = await store.load(ROOM); if (b === null) return false; const d = new Y.Doc(); Y.applyUpdate(d, b); return live(d).some((p) => p.id === 'hosta1_p1') }, 4000)
    owner.p.destroy(); local.p.destroy()
    await s1.destroy()
    const port2 = await freePort()
    const s2 = mk(port2)
    await s2.listen()
    const teammate = connect(port2, 'teditor')
    const served = await until(() => teammate.st.synced && live(teammate.doc).some((p) => p.id === 'hosta1_p1' && p.title === 'kept'), 4000)
    ok('persist.room.1 a shared room survives its server: stored as it changes, loaded before anyone syncs — a teammate joining the restarted server, with the owner offline, gets the canvas',
      stored === true && served === true, JSON.stringify({ stored, served, keys: live(teammate.doc).map((p) => p.id) }))
    const rooms2 = (await store.rooms()).map((r) => r.name)
    ok('persist.room.2 only a share\'s room is written; the presence-only room is not', JSON.stringify(rooms2) === JSON.stringify([ROOM]), JSON.stringify(rooms2))
    ok('persist.team.1 a Team view snapshot does not outlive the restart (it is published only while someone watches, and after a restart nobody does)',
      teammate.doc.getMap('team').size === 0, JSON.stringify([...teammate.doc.getMap('team').keys()]))
    const snaps2 = await store.snapshots(ROOM)
    ok('persist.snap.2 the server snapshots a stored room on its interval (zero here: every store)', snaps2.length >= 1 && snaps2.every((x) => x.reason === 'interval'), JSON.stringify(snaps2.map((x) => x.reason)))
    const health = await (await fetch(`http://127.0.0.1:${port2}/healthz`)).json()
    ok('persist.health.1 GET /healthz answers the counts an uptime check needs — and no room name', health.ok === true && health.rooms >= 1 && health.connections >= 1 && health.persisted === true &&
      typeof health.uptimeS === 'number' && !JSON.stringify(health).includes('workspace'), JSON.stringify(health))
    const loaded = logs.find((l) => l.event === 'room.loaded')
    ok('persist.log.1 the log is one JSON object per event — a room loaded is logged by name, size and time, never by content',
      loaded !== undefined && loaded.room === ROOM && typeof loaded.bytes === 'number' && typeof loaded.ms === 'number' && typeof loaded.ts === 'string' && loaded.level === 'info' &&
      !logs.some((l) => JSON.stringify(l).includes('kept')), JSON.stringify(logs.slice(0, 6)))
    teammate.p.destroy()
    await s2.destroy()

    // ── M347: backups and restores over the same store ────────────────────
    const lines = []
    const dumped = await M.backup.dumpRooms(store, (l) => lines.push(l), { snapshots: true })
    const header = JSON.parse(lines[0])
    const hasContent = lines.slice(1).every((l) => { const o = JSON.parse(l); return typeof o.state === 'string' && o.state.length > 0 })
    await pg.query('delete from collab.documents')
    const r1 = await M.backup.restoreRooms(store, lines)
    const back = await store.load(ROOM)
    const d = new Y.Doc(); if (back !== null) Y.applyUpdate(d, back)
    const r2 = await M.backup.restoreRooms(store, lines)
    const r3 = await M.backup.restoreRooms(store, lines, { force: true, room: ROOM })
    let bad = null
    try { await M.backup.restoreRooms(store, ['{"kind":"room","name":"x","state":""}']) } catch (e) { bad = String(e.message || e) }
    ok('ops.backup.1 a dump is a header then every room (and its snapshots); restoring it after the rows are gone brings the canvas back, a SECOND restore skips the room that exists (a restore is for a room the server lost), --force replaces it, and a file without the header is refused before anything is written',
      header.kind === 'header' && header.rooms === 1 && dumped.rooms === 1 && dumped.snapshots >= 1 && hasContent &&
      JSON.stringify(r1.restored) === JSON.stringify([ROOM]) && live(d).some((p) => p.id === 'hosta1_p1') &&
      r2.restored.length === 0 && r2.skipped.length === 1 && /--force/.test(r2.skipped[0].why) &&
      JSON.stringify(r3.restored) === JSON.stringify([ROOM]) && bad !== null && /header/.test(bad), JSON.stringify({ header, dumped, r1, r2, r3, bad }))
    await pg.close()
  }

  // ── M348: local-first — an offline edit survives a crash and reaches the room ──
  // Real providers, a real (persisted) server, main's own canvas-sync on each
  // machine. The server goes away; the owner moves a panel offline (the
  // provider counts it unacknowledged); the owner's app "crashes" and relaunches
  // from the bytes main kept (layout.json's crdt); the server comes back on the
  // same store; the teammate ends with the move. Nothing was lost, and nothing
  // needed a second persistence layer: the doc lives in main, so y-indexeddb
  // (a renderer's IndexedDB) would be the wrong layer.
  {
    const { PGlite } = require('@electric-sql/pglite')
    const pg = new PGlite()
    await pg.exec('create role anon; create role authenticated;')
    await pg.exec(readFileSync(join(root, 'supabase/migrations/20260926120000_collab_documents.sql'), 'utf8'))
    const store = M.persistence.createPgDocStore((t, p) => pg.query(t, p))
    const people = { towner: { userId: UA, role: 'owner' }, teditor: { userId: UB, role: 'editor' } }
    const serve = async (port) => {
      const srv = M.server.createCollabServer({ port, address: '127.0.0.1', quiet: true, store, snapshotEveryMs: 60 * 60 * 1000, debounceMs: 40,
        authenticate: async (token, documentName) => { const x = people[token]; if (x === undefined) throw new M.auth.Refused('no'); return { ...x, shareId: SHARE, documentName } } })
      await srv.listen()
      return srv
    }
    const attach = (m, port, token) => {
      const st = { synced: false, unsynced: 0 }
      const p = new HocuspocusProvider({ url: `ws://127.0.0.1:${port}`, name: `tc:workspace:${SHARE}`, document: m.doc, token,
        onSynced: () => { st.synced = true }, onUnsyncedChanges: ({ number }) => { st.unsynced = number } })
      return { p, st }
    }
    const port1 = await freePort()
    let srv = await serve(port1)
    const A = machine({ host: 'hosta1', userId: UA, role: 'owner', panels: [panel('n1', 0)] })
    const B = machine({ host: 'hostb1', userId: UB, role: 'editor' })
    A.bind(); B.bind()
    const pa = attach(A, port1, 'towner'), pb = attach(B, port1, 'teditor')
    const joined = await until(() => pa.st.synced && pb.st.synced && field(B.doc, 'hosta1_n1', 'x') === 0, 5000)
    // The server goes away (a deploy, a crash) — the providers retry quietly.
    await srv.destroy()
    await new Promise((r) => setTimeout(r, 150))
    A.ws.panels = A.ws.panels.map((q) => (q.id === 'n1' ? { ...q, x: 777 } : q))
    A.sync.saved(A.view()?.seq ?? 0)
    await tick()
    const queued = pa.st.unsynced
    const keptOffline = (() => { const d = new Y.Doc(); if (A.store.crdt) Y.applyUpdate(d, A.store.crdt); return field(d, 'hosta1_n1', 'x') })()
    // The owner's app dies; it relaunches from what main kept.
    pa.p.destroy(); A.unbind()
    const A2 = machine({ host: 'hosta1', userId: UA, role: 'owner', panels: A.ws.panels, crdt: A.store.crdt })
    A2.bind()
    const relaunched = field(A2.doc, 'hosta1_n1', 'x')
    // The server comes back on the same store; everyone reconnects.
    pb.p.destroy()
    const port2 = await freePort()
    srv = await serve(port2)
    const pa2 = attach(A2, port2, 'towner'), pb2 = attach(B, port2, 'teditor')
    const reached = await until(() => pa2.st.synced && pb2.st.synced && field(B.doc, 'hosta1_n1', 'x') === 777, 6000)
    const stored = await (async () => { const b = await store.load(`tc:workspace:${SHARE}`); if (b === null) return null; const d = new Y.Doc(); Y.applyUpdate(d, b); return field(d, 'hosta1_n1', 'x') })()
    ok('offline.1 an edit made while the server is gone is counted as waiting, kept by main as it happens, survives the app crashing and relaunching, and reaches the teammate — and the room\'s store — when the server is back',
      joined === true && queued > 0 && keptOffline === 777 && relaunched === 777 && reached === true,
      JSON.stringify({ joined, queued, keptOffline, relaunched, reached, bx: field(B.doc, 'hosta1_n1', 'x') }))
    await new Promise((r) => setTimeout(r, 200))
    const storedLater = await (async () => { const b = await store.load(`tc:workspace:${SHARE}`); if (b === null) return null; const d = new Y.Doc(); Y.applyUpdate(d, b); return field(d, 'hosta1_n1', 'x') })()
    ok('offline.2 the returning edit is stored by the server too, so a third person arriving later is served it without the owner online', storedLater === 777, JSON.stringify({ stored, storedLater }))
    pa2.p.destroy(); pb2.p.destroy(); A2.unbind(); B.unbind()
    await srv.destroy()
    await pg.close()
  }

  // ── M347: the uptime watcher's rules, walked through an outage ──────────
  {
    const H = M.health
    let st = H.HEALTH_START
    const said = []
    const step = (ok, errors = [], now = 0) => { const r = H.healthStep(st, now, { ok, detail: ok ? '1 rooms' : 'ECONNREFUSED' }, errors); st = r.state; said.push(r.alerts) }
    step(false); step(false); step(false, [], 1); step(false, [], 2); step(true, [], 3); step(true, [], 4)
    ok('ops.health.1 DOWN only after three failed probes in a row, said once per outage, RECOVERED said once — a restart\'s one or two missed probes page nobody',
      said[0].length === 0 && said[1].length === 0 && said[2].length === 1 && /DOWN/.test(said[2][0]) && said[3].length === 0 &&
      said[4].length === 1 && /recovered/.test(said[4][0]) && said[5].length === 0, JSON.stringify(said))
    st = H.HEALTH_START; said.length = 0
    step(true, ['room.store_failed', 'room.store_failed', 'db.pool_error'], 0)
    step(true, ['room.store_failed'], 10 * 60 * 1000)
    step(true, ['room.store_failed'], 31 * 60 * 1000)
    const events = H.errorEventsIn(['{"level":"error","event":"room.store_failed"}', '{"level":"info","event":"room.loaded"}', 'Started tc-collab.service.', '{"level":"warn","event":"update.refused"}'])
    const body = JSON.parse(H.alertBody('collab DOWN', 'vm1'))
    ok('ops.health.2 error events alert with their count and kinds at most once per 30 minutes; only JSON `error` lines are events; an alert body carries both Slack\'s `text` and Discord\'s `content`',
      said[0].length === 1 && /3 error events: db.pool_error, room.store_failed/.test(said[0][0]) && said[1].length === 0 && said[2].length === 1 &&
      JSON.stringify(events) === JSON.stringify(['room.store_failed']) && body.text === body.content && /tc-collab vm1/.test(body.text), JSON.stringify({ said, events, body }))
  }

  // ── M347: the deploy files agree with the code they deploy ──────────────
  {
    const deploy = join(root, 'server/collab/deploy')
    const read = (f) => readFileSync(join(deploy, f), 'utf8')
    // Every TC_* variable the three entry points read is in the env example.
    const used = new Set()
    for (const f of ['main.ts', 'backup-main.ts', 'health-main.ts']) for (const m of readFileSync(join(root, 'server/collab', f), 'utf8').matchAll(/process\.env\['(TC_[A-Z_]+)'\]/g)) used.add(m[1])
    used.delete('TC_HEALTH_STATE') // set by the health unit itself (Environment=), not the operator
    const example = read('collab.env.example')
    const missing = [...used].filter((v) => !new RegExp(`^${v}=`, 'm').test(example))
    const units = readdirSync(deploy).filter((f) => /\.(service|timer)$/.test(f))
    const setup = read('setup.sh')
    const notInstalled = units.filter((u) => !setup.includes(u))
    const caddy = readFileSync(join(root, 'server/relay/deploy/Caddyfile'), 'utf8')
    const server = read('tc-collab.service'), health = read('tc-collab-health.service')
    ok('ops.deploy.1 the deploy agrees with the code: every TC_* variable the collab entry points read is in collab.env.example, setup.sh installs every unit and timer in deploy/, the VM\'s one Caddyfile routes /collab to the server\'s loopback port, the server restarts ALWAYS as its own user, and the health step reads the journal by group, not as root',
      missing.length === 0 && used.size >= 6 && units.length === 5 && notInstalled.length === 0 &&
      /handle_path \/collab\* \{\s*reverse_proxy 127\.0\.0\.1:1234/.test(caddy) && /^TC_COLLAB_ADDRESS=127\.0\.0\.1$/m.test(example) &&
      /^Restart=always$/m.test(server) && /^User=tc-collab$/m.test(server) && /^NoNewPrivileges=true$/m.test(server) &&
      /^User=tc-collab$/m.test(health) && /^SupplementaryGroups=systemd-journal$/m.test(health) && /install -d -m 0700 -o tc-collab -g tc-collab \/var\/backups\/tc-collab/.test(setup),
      JSON.stringify({ used: [...used], missing, units, notInstalled }))
    // The bundles the deploy copies: built exactly as deploy.sh builds them,
    // then LOADED. `npm run collab` threw at load from M333 to M346 and no
    // check could see it, because nothing here ever bundled the server.
    const { spawnSync } = require('node:child_process')
    const built = spawnSync(process.execPath, [join(root, 'scripts/collab-server.cjs'), '--build-only'], { encoding: 'utf8', timeout: 60000 })
    const env = { ...process.env }; delete env.TC_SUPABASE_URL; delete env.TC_SUPABASE_ANON_KEY; delete env.TC_COLLAB_DATABASE_URL
    const run = (f, args = []) => spawnSync(process.execPath, [join(root, 'out/collab', f), ...args], { encoding: 'utf8', env, timeout: 20000 })
    const m = run('main.cjs'), b = run('backup.cjs', ['dump', '/nonexistent'])
    const lastJson = (out) => { try { return JSON.parse(out.trim().split('\n').pop()) } catch { return null } }
    const mLine = lastJson(m.stdout), bLine = lastJson(b.stdout)
    ok('ops.bundle.1 the three collab bundles build as the deploy builds them and LOAD: the server refuses a missing config by name (exit 2), the backup refuses a missing database by name (exit 1) — each as a JSON log line',
      built.status === 0 && m.status === 2 && mLine?.event === 'config.failed' && b.status === 1 && bLine?.event === 'backup.failed' && /TC_COLLAB_DATABASE_URL/.test(bLine?.error ?? ''),
      JSON.stringify({ built: built.status, builtErr: (built.stderr || '').slice(0, 200), m: [m.status, (m.stderr || '').slice(0, 300)], mLine, b: [b.status, (b.stderr || '').slice(0, 300)], bLine }))
  }

  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((e) => { console.log(`verify-canvas-sync threw: ${e && e.stack}`); process.exitCode = 1 })
