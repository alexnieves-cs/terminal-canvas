/* verify:flowchart — the canvas side of the flowchart: canvas ⇄ graph
   conversion (renderer/flowchart/flow-convert.ts), sketch → plan, the in-app
   object clipboard (object-clipboard.ts), the connector view cache
   (connector-model.ts) and the keyboard helpers (canvas/useShapeKeys.ts).
   Every property here fails SILENTLY when broken: a converted chart whose
   connector points at the OLD id still draws nothing and errors nowhere, a
   plan whose loop-back arrow made two steps wait on each other still renders,
   a paste whose connectors point back at the ORIGINALS still looks like a
   paste until the original is deleted, a view cache that never invalidates
   still draws — through a shape that moved. */
const assert = require('node:assert')

module.exports = async function (ok, F) {
  const R = F.record ?? {}
  const C = F.convert ?? {}
  const K = F.clipboard ?? {}
  const M = F.connectorModel ?? {}
  const S = F.shapeKeys ?? {}
  const P = F.panels ?? {}
  const missing = []
  for (const [area, mod, names] of [
    ['convert', C, ['graphToPanels', 'panelsToGraph', 'flowDirectionOf', 'chartToPlan', 'svgModelOf']],
    ['clipboard', K, ['collectCopy', 'placeCopies', 'holdCopy', 'heldCopyFor', 'clipboardMarker', 'COPYABLE']],
    ['connectorModel', M, ['buildConnectorViews']],
    ['shapeKeys', S, ['flowPort', 'nextStepPoint']],
    ['panels', P, ['makePanel', 'makeNotePanel', 'makeImagePanel', 'patchConnector']],
    ['record', R, ['nextStepForm']]
  ]) for (const n of names) if (typeof mod[n] !== 'function') missing.push(`${area}.${n}`)
  if (R.SHAPE_SIZE === undefined) missing.push('record.SHAPE_SIZE')
  if (typeof F.mermaid?.parseMermaid !== 'function' || typeof F.mermaid?.serializeMermaid !== 'function') missing.push('mermaid.parseMermaid/serializeMermaid')
  if (typeof F.taskPlan?.planProblems !== 'function') missing.push('taskPlan.planProblems')
  if (missing.length) {
    ok('flowchart.convert.0 the canvas-side modules export their API', false, `missing: ${missing.join(', ')}`)
    return
  }

  // ── Fixtures ───────────────────────────────────────────────────────────────
  const SIZE = R.SHAPE_SIZE
  let zNext = 1
  const chk = (name, pass, detail) => ok(name, !!pass, pass ? undefined : (typeof detail === 'function' ? detail() : typeof detail === 'string' ? detail : JSON.stringify(detail)))
  /* One check id, several named properties: each is a thunk (a throw is a failure, not a crashed suite) and the failure names the ones that broke. */
  const group = (name, parts, detail) => {
    const failed = []
    for (const [label, test] of parts) {
      try { if (!test()) failed.push(label) } catch (error) { failed.push(`${label} (threw ${error && error.message})`) }
    }
    let more = ''
    if (failed.length > 0 && detail !== undefined) { try { more = ' — ' + (typeof detail === 'function' ? detail() : JSON.stringify(detail)) } catch { more = '' } }
    ok(name, failed.length === 0, failed.length === 0 ? undefined : `broken: ${failed.join('; ')}${more}`)
  }
  const eq = (a, b) => { try { assert.deepStrictEqual(a, b); return true } catch { return false } }
  const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const rectOf = (p) => ({ x: p.rect.x, y: p.rect.y, w: p.rect.w, h: p.rect.h })
  const anyOverlap = (rects) => { for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i], rects[j])) return `${i}/${j}`; return null }
  const connector = (id, to, more = {}) => ({ id, to, ...more })
  /* A shape panel at a top-left, its form's mint size unless told otherwise. */
  const shape = (id, form, text, x, y, connectors, extra = {}) => ({
    kind: 'shape',
    rect: { id, x, y, w: extra.w ?? SIZE[form].w, h: extra.h ?? SIZE[form].h },
    z: extra.z ?? zNext++,
    shape: { form, text, ...(extra.shape ?? {}) },
    ...(connectors === undefined ? {} : { connectors }),
    ...(extra.panel ?? {})
  })
  /* A terminal: a live object a connector may point at or come from. */
  const terminal = (id, x, y, connectors) => {
    const t = P.makePanel(id, { x: 0, y: 0 }, zNext++)
    return { ...t, rect: { id, x, y, w: t.rect.w, h: t.rect.h }, ...(connectors === undefined ? {} : { connectors }) }
  }
  const node = (id, form, text) => ({ id, form, text, w: SIZE[form].w, h: SIZE[form].h })
  const counter = (from = 0) => { const c = { n: from, mint: () => ++c.n }; return c }
  const byText = (panels) => new Map(panels.map((p) => [p.shape.text, p]))


  // ── 1–3. graphToPanels ─────────────────────────────────────────────────────
  const G1 = {
    direction: 'TB',
    nodes: [node('a', 'process', 'Fetch'), node('b', 'decision', 'ok?'), node('c', 'terminator', 'Done'), node('d', 'process', 'Retry'), node('e', 'io', 'Lonely'), node('x', 'process', 'X'), node('y', 'process', 'Y')],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c', label: 'yes', ends: 'both' },
      { from: 'b', to: 'd', label: 'no', dashed: true, route: 'curved', ends: 'none' },
      { from: 'x', to: 'y', ends: 'start' },
      { from: 'a', to: 'a' },
      { from: 'a', to: 'nowhere' },
      { from: 'a', to: 'e', route: 'orthogonal', ends: 'end', label: '', dashed: false }
    ],
    groups: [
      { id: 'g1', label: 'Loop', nodes: ['b', 'd'] },
      { id: 'g2', label: 'Empty', nodes: [] },
      { id: 'g3', label: 'Ghost', nodes: ['zz'] },
      { id: 'g4', label: 'Mixed', nodes: ['a', 'zz'] }
    ]
  }
  const c1 = counter(40)
  const origin = { x: 1000, y: 500 }
  const out1 = C.graphToPanels(G1, c1.mint, origin, 10)
  const ids1 = out1.panels.map((p) => p.rect.id)
  const cids1 = out1.panels.flatMap((p) => (p.connectors ?? []).map((c) => c.id))
  const allIds1 = [...ids1, ...cids1]
  const rects1 = out1.panels.map(rectOf)
  const validEdges = 5 // a→b, b→c, b→d, x→y, a→e: the self-loop and the unknown target are not connectors
  const chain = (dir) => ({ direction: dir, nodes: [node('p', 'process', 'P'), node('q', 'process', 'Q'), node('r', 'process', 'R')], edges: [{ from: 'p', to: 'q' }, { from: 'q', to: 'r' }] })
  const lay = (dir) => C.graphToPanels(chain(dir), counter().mint, { x: 0, y: 0 }, 0).panels
  const [lrP, lrQ, lrR] = lay('LR')
  const [tbP, tbQ, tbR] = lay('TB')
  const [btP, , btR] = lay('BT')
  const [rlP, , rlR] = lay('RL')
  group('flowchart.convert.1 graphToPanels mints every id from the caller\'s counter (sh… shapes, cx… connectors: none invented, none wasted), lays the shapes out without overlap at the origin with the graph\'s own sizes and direction, and stacks them from zBase — a shape placed on another, or an id the counter did not issue, still draws',
    [
      ['a shape and a connector per node and valid edge', () => out1.panels.length === G1.nodes.length && cids1.length === validEdges],
      ['ids carry the canvas\'s own prefixes', () => ids1.every((id) => /^sh\d+$/.test(id)) && cids1.every((id) => /^cx\d+$/.test(id))],
      ['every id came from the counter, once each', () => new Set(allIds1).size === allIds1.length && allIds1.length === c1.n - 40 && allIds1.every((id) => Number(id.replace(/\D+/g, '')) > 40 && Number(id.replace(/\D+/g, '')) <= c1.n)],
      ['no two shapes overlap', () => anyOverlap(rects1) === null],
      ['form, label and size are the graph\'s; z runs from zBase in order', () => out1.panels.every((p, i) => p.kind === 'shape' && p.rect.w === G1.nodes[i].w && p.rect.h === G1.nodes[i].h && p.shape.form === G1.nodes[i].form && p.shape.text === G1.nodes[i].text && p.z === 10 + i)],
      ['top-left at the origin, and the reported extent is the real one', () => close(Math.min(...rects1.map((r) => r.x)), origin.x) && close(Math.min(...rects1.map((r) => r.y)), origin.y) && close(Math.max(...rects1.map((r) => r.x + r.w)) - origin.x, out1.width) && close(Math.max(...rects1.map((r) => r.y + r.h)) - origin.y, out1.height)],
      ['the graph\'s own direction: LR along x, TB down y, BT up y, RL back along x', () => lrP.rect.x < lrQ.rect.x && lrQ.rect.x < lrR.rect.x && tbP.rect.y < tbQ.rect.y && tbQ.rect.y < tbR.rect.y && btP.rect.y > btR.rect.y && rlP.rect.x > rlR.rect.x]
    ],
    () => JSON.stringify({ ids1, cids1, minted: c1.n - 40, overlap: anyOverlap(rects1), width: out1.width, height: out1.height }))

  const holderOf = (oldId) => out1.panels[G1.nodes.findIndex((n) => n.id === oldId)]
  const newId = (oldId) => holderOf(oldId).rect.id
  const conn = (from, to) => (holderOf(from).connectors ?? []).find((c) => c.to === newId(to))
  // A hub with more outgoing edges than one shape may hold (CONNECTORS_MAX): whatever the importer does with the surplus, a shape must never be handed a list the next load would cut.
  const hubGraph = { direction: 'TB', nodes: [node('h', 'process', 'Hub'), ...Array.from({ length: R.CONNECTORS_MAX + 6 }, (_, i) => node(`n${i}`, 'process', `N${i}`))], edges: Array.from({ length: R.CONNECTORS_MAX + 6 }, (_, i) => ({ from: 'h', to: `n${i}` })) }
  const hubOut = C.graphToPanels(hubGraph, counter().mint, { x: 0, y: 0 }, 0)
  const cAB = conn('a', 'b')
  const cBC = conn('b', 'c')
  const cBD = conn('b', 'd')
  const cAE = conn('a', 'e')
  const cYX = conn('y', 'x')
  group('flowchart.convert.2 graphToPanels holds each connector on its edge\'s SOURCE, targeting the NEW ids; labels, dashes, routes and both/none ends are kept, the defaults (end, orthogonal, empty label, not dashed) are ABSENT keys, and a \'start\' end becomes the edge reversed — a connector aimed at the graph\'s old id draws nothing and errors nowhere',
    [
      ['a plain edge is {id, to} and nothing else', () => eq(Object.keys(cAB).sort(), ['id', 'to'])],
      ['label and both-ends kept', () => cBC.label === 'yes' && cBC.ends === 'both' && !('dashed' in cBC) && !('route' in cBC)],
      ['label, dash, curve and no-ends kept', () => cBD.label === 'no' && cBD.dashed === true && cBD.route === 'curved' && cBD.ends === 'none'],
      ['explicit defaults are dropped, not stored', () => eq(Object.keys(cAE).sort(), ['id', 'to'])],
      ['a start-ended edge x→y is held by y, pointing at x, with no ends key', () => cYX !== undefined && !('ends' in cYX) && conn('x', 'y') === undefined],
      ['a self-loop and an edge to an unknown node made nothing', () => (holderOf('a').connectors ?? []).length === 2],
      ['every target is one of the new shapes, never the holder itself', () => out1.panels.every((p) => (p.connectors ?? []).every((c) => ids1.includes(c.to) && c.to !== p.rect.id))],
      ['no shape is handed more connectors than a load keeps (a hub with too many outgoing edges)', () => hubOut.panels.every((p) => (p.connectors ?? []).length <= R.CONNECTORS_MAX)],
      ['inert by construction: a form and a label, no field that could carry an action', () => out1.panels.every((p) => eq(Object.keys(p.shape).sort(), ['form', 'text']))]
    ],
    () => JSON.stringify({ cAB, cBC, cBD, cAE, cYX }))

  const gr = out1.groups
  const loop = gr.find((g) => g.label === 'Loop')
  const mixed = gr.find((g) => g.label === 'Mixed')
  group('flowchart.convert.3 subgraphs become groups by the NEW ids (never the graph\'s own), a member the graph does not have is filtered out, and a group left with no members is dropped — a group naming ids that are not on the canvas selects nothing',
    [
      ['exactly the two non-empty groups', () => gr.length === 2],
      ['Loop holds the new ids of b and d', () => eq([...loop.ids].sort(), [newId('b'), newId('d')].sort())],
      ['Mixed keeps its known member only', () => eq(mixed.ids, [newId('a')])],
      ['every id is a panel that was made', () => gr.every((g) => g.ids.every((id) => ids1.includes(id)))],
      ['the empty and the all-unknown group are gone', () => !gr.some((g) => g.label === 'Empty' || g.label === 'Ghost')]
    ],
    () => JSON.stringify({ gr, ids1 }))

  // ── 4–6. panelsToGraph ─────────────────────────────────────────────────────
  zNext = 1
  const T1 = terminal('T1', 900, 200)
  const P4 = [
    shape('s3', 'terminator', 'End', 0, 400),
    shape('s2', 'decision', 'ok?', 0, 200, [connector('k2', 's3', { label: 'yes' }), connector('k3', 'T1'), connector('k4', 's1', { ends: 'both', dashed: true, route: 'curved' })]),
    shape('s1', 'process', 'Start here', 300, 0, [connector('k1', 's2')]),
    { ...T1, connectors: [connector('k5', 's3')] }
  ]
  const all4 = C.panelsToGraph(P4, new Set())
  const sel4 = C.panelsToGraph(P4, new Set(['s1', 's2']))
  const edgeOf = (g, from, to) => g.edges.find((e) => e.from === from && e.to === to)
  group('flowchart.convert.4 panelsToGraph reads every shape when the set is empty and only the selected ones otherwise, in READING order (top to bottom, then left to right), carries labels/dashes/routes/ends, and COUNTS every connector it cannot say — to a terminal, held by one, or out of the selection — an export that drops silently reads as a whole one',
    [
      ['reading order, not storage order', () => eq(all4.graph.nodes.map((n) => n.id), ['s1', 's2', 's3'])],
      ['nodes carry text and a real size', () => all4.graph.nodes.every((n) => n.w > 0 && n.h > 0 && typeof n.text === 'string')],
      ['three shape-to-shape edges', () => all4.graph.edges.length === 3],
      ['the terminal is not in the graph, and neither is any edge to or from it', () => !all4.graph.nodes.some((n) => n.id === 'T1') && !all4.graph.edges.some((e) => e.from === 'T1' || e.to === 'T1')],
      ['both connectors that touch the terminal are counted', () => all4.leftOut === 2],
      ['label and default ends carried', () => edgeOf(all4.graph, 's2', 's3').label === 'yes' && edgeOf(all4.graph, 's2', 's3').ends === 'end'],
      ['dash, curve and both-ends carried', () => { const e = edgeOf(all4.graph, 's2', 's1'); return e.dashed === true && e.route === 'curved' && e.ends === 'both' }],
      ['a selection keeps only its shapes and the edges between them', () => eq(sel4.graph.nodes.map((n) => n.id), ['s1', 's2']) && eq(sel4.graph.edges.map((e) => `${e.from}>${e.to}`).sort(), ['s1>s2', 's2>s1'])],
      ['a selection counts what could not come along (k2 to s3 and k3 to the terminal); k5 touches neither end and is not its business', () => sel4.leftOut === 2],
      ['selecting only s3 counts k2 and k5, which both arrive from outside', () => C.panelsToGraph(P4, new Set(['s3'])).leftOut === 2],
      ['a selection of a live object alone is an empty graph', () => C.panelsToGraph(P4, new Set(['T1'])).graph.nodes.length === 0]
    ],
    () => JSON.stringify({ all4, sel4 }))

  const shapesAt = (pts, edges) => pts.map(([x, y], i) => shape(`d${i}`, 'process', `D${i}`, x, y, edges.filter(([a]) => a === i).map(([, b], j) => connector(`dk${i}_${j}`, `d${b}`))))
  const dirOf = (pts, edges) => C.panelsToGraph(shapesAt(pts, edges), new Set()).graph.direction
  const dirs = [
    dirOf([[0, 0], [300, 20], [600, -10]], [[0, 1], [1, 2]]),
    dirOf([[600, 0], [300, 10], [0, 0]], [[0, 1], [1, 2]]),
    dirOf([[0, 0], [10, 200], [-5, 420]], [[0, 1], [1, 2]]),
    dirOf([[0, 420], [5, 200], [0, 0]], [[0, 1], [1, 2]])
  ]
  group('flowchart.convert.5 the direction of a drawn chart is INFERRED from its arrows: left→right gives LR, right→left RL, top→bottom TB, bottom→top BT, a wiggle does not outvote the flow, and no arrows at all is TB — a chart exported as the wrong direction re-imports rotated',
    [
      ['left to right is LR', () => dirs[0] === 'LR'],
      ['right to left is RL', () => dirs[1] === 'RL'],
      ['top to bottom is TB', () => dirs[2] === 'TB'],
      ['bottom to top is BT', () => dirs[3] === 'BT'],
      ['no arrows is TB', () => dirOf([[0, 0], [300, 0]], []) === 'TB' && C.flowDirectionOf([], []) === 'TB']
    ],
    () => JSON.stringify(dirs))

  // Round trip: canvas → graph → Mermaid text → graph → canvas.
  zNext = 1
  const RT = [
    shape('a', 'terminator', 'Start', 0, 0, [connector('c1', 'b')]),
    shape('b', 'process', 'Fetch\nthe data', 0, 150, [connector('c2', 'c', { label: 'ok' })]),
    shape('c', 'decision', 'Valid?', 0, 300, [connector('c3', 'd', { label: 'yes' }), connector('c4', 'e', { label: 'no', dashed: true })]),
    shape('d', 'io', 'Write out', 0, 500, [connector('c5', 'f')]),
    shape('e', 'subprocess', 'Retry (3x)', 300, 500, [connector('c6', 'b', { ends: 'both' })]),
    shape('f', 'document', 'Report', 0, 650, [connector('c7', 'g', { ends: 'none' })]),
    shape('g', 'junction', '', 0, 780),
    shape('h', 'text', 'a note', 300, 780)
  ]
  const g6 = C.panelsToGraph(RT, new Set())
  const text6 = F.mermaid.serializeMermaid(g6.graph)
  const parsed6 = F.mermaid.parseMermaid(text6)
  const back6 = parsed6.kind === 'ok' ? C.graphToPanels(parsed6.graph, counter().mint, { x: 0, y: 0 }, 0) : null
  const sig = (panels) => panels.map((p) => `${p.shape.form}|${p.shape.text}`).sort()
  const labels = (panels) => panels.flatMap((p) => (p.connectors ?? []).map((c) => `${c.label ?? ''}|${c.dashed === true}|${c.ends ?? 'end'}`)).sort()
  const edgeCount = (panels) => panels.reduce((n, p) => n + (p.connectors ?? []).length, 0)
  group('flowchart.convert.6 a chart survives canvas → Mermaid → canvas: every form and label (the junction and the bare text label included), the edge count, and each edge\'s label / dash / arrowheads come back, with nothing left out or overlapping',
    [
      ['the Mermaid the chart wrote parses', () => parsed6.kind === 'ok' && parsed6.dropped.length === 0],
      ['nothing was left out on the way out', () => g6.leftOut === 0],
      ['same forms and labels', () => eq(sig(back6.panels), sig(RT))],
      ['same number of edges', () => edgeCount(back6.panels) === edgeCount(RT)],
      ['same labels, dashes and arrowheads', () => eq(labels(back6.panels), labels(RT))],
      ['laid out without overlap', () => anyOverlap(back6.panels.map(rectOf)) === null]
    ],
    () => JSON.stringify({ kind: parsed6.kind, reason: parsed6.reason, sigBack: back6 && sig(back6.panels), labelsBack: back6 && labels(back6.panels), labelsIn: labels(RT) }))

  // ── 7–9. chartToPlan ───────────────────────────────────────────────────────
  zNext = 1
  const CH = [
    shape('t0', 'terminator', 'Start', 0, 0, [connector('k1', 'a')]),
    shape('a', 'process', 'Write tests', 0, 100, [connector('k2', 'j')]),
    shape('j', 'junction', '', 0, 200, [connector('k3', 'b')]),
    shape('b', 'process', 'Implement', 0, 300, [connector('k4', 'e1')]),
    shape('e1', 'process', '   ', 0, 400, [connector('k5', 'd')]),
    shape('d', 'decision', 'Green?', 0, 500, [connector('k6', 't1', { label: 'yes' }), connector('k7', 'a', { label: 'retry' })]),
    shape('t1', 'terminator', 'End', 0, 600),
    shape('n1', 'text', 'Note: flaky', 300, 0)
  ]
  const scopeAll = (panels) => new Set(panels.map((p) => p.rect.id))
  const plan7 = C.chartToPlan(CH, scopeAll(CH), 1234)
  const shuffled = C.chartToPlan([...CH].reverse(), scopeAll(CH), 1234)
  const steps7 = plan7.kind === 'ok' ? plan7.plan.steps : []
  const problems7 = plan7.kind === 'ok' ? F.taskPlan.planProblems(plan7.plan) : ['no plan']
  const cyclic = F.taskPlan.planProblems({ createdAt: 0, steps: [
    { id: 'a', title: 'A', kind: 'agent', role: 'x', dependsOn: ['b'], expected: 'x' },
    { id: 'b', title: 'B', kind: 'agent', role: 'x', dependsOn: ['a'], expected: 'x' }] })
  group('flowchart.convert.7 chartToPlan: process/decision shapes become agent/review steps in the order the connectors say from the start (whatever order the panels are stored in); a start/end, a junction, a bare label and an EMPTY label are skipped; a dependency passes THROUGH a skipped node; and a loop-back arrow (retry) does not make steps wait on each other — a plan with a cycle renders and never becomes ready',
    [
      ['a plan was made', () => plan7.kind === 'ok' && plan7.plan.createdAt === 1234],
      ['steps are the labelled process/decision shapes, in chain order', () => eq(steps7.map((s) => s.title), ['Write tests', 'Implement', 'Green?'])],
      ['process is an agent step, a decision a review step, ids s1..', () => eq(steps7.map((s) => s.kind), ['agent', 'agent', 'review']) && eq(steps7.map((s) => s.id), ['s1', 's2', 's3'])],
      ['Start → Write tests → junction → Implement: Implement waits on Write tests', () => eq(steps7[1].dependsOn, ['s1'])],
      ['Implement → (empty label) → Green?: the decision waits on Implement', () => eq(steps7[2].dependsOn, ['s2'])],
      ['the retry arrow adds no dependency: the first step waits on nothing and every dependency is EARLIER', () => eq(steps7[0].dependsOn, []) && steps7.every((s, i) => s.dependsOn.every((d) => { const at = steps7.findIndex((t) => t.id === d); return at >= 0 && at < i }))],
      ['planProblems finds no cycle, and no problem at all', () => !problems7.some((p) => /wait on each other/.test(p)) && problems7.length === 0],
      ['(not vacuous) planProblems does name a hand-made cycle', () => cyclic.some((p) => /wait on each other/.test(p))],
      ['every step says what done means and who does it', () => steps7.every((s) => typeof s.expected === 'string' && s.expected.trim() !== '' && typeof s.role === 'string' && s.role !== '')],
      ['storage order does not change the plan', () => shuffled.kind === 'ok' && eq(shuffled.plan.steps.map((s) => [s.title, s.dependsOn]), steps7.map((s) => [s.title, s.dependsOn]))]
    ],
    () => JSON.stringify({ steps7, problems7, shuffled: shuffled.kind }))

  const chainOf = (forms) => forms.map((form, i) => shape(`c${i}`, form, `Step ${i + 1}`, 0, i * 120, i < forms.length - 1 ? [connector(`ck${i}`, `c${i + 1}`)] : undefined))
  const many13 = chainOf(Array(13).fill('process'))
  const many12 = chainOf(Array(12).fill('process'))
  const refused13 = C.chartToPlan(many13, scopeAll(many13), 1)
  const ok12 = C.chartToPlan(many12, scopeAll(many12), 1)
  const unlabelled = [shape('u1', 'terminator', 'Start', 0, 0, [connector('uk', 'u2')]), shape('u2', 'process', '  \n ', 0, 100, [connector('uk2', 'u3')]), shape('u3', 'junction', '', 0, 200), shape('u4', 'text', 'just words', 300, 0)]
  const refusedNone = C.chartToPlan(unlabelled, scopeAll(unlabelled), 1)
  const refusedEmpty = C.chartToPlan(many12, new Set(), 1)
  const refusedLive = C.chartToPlan([terminal('T9', 0, 0)], new Set(['T9']), 1)
  const scoped = C.chartToPlan(many12, new Set(['c0', 'c1', 'c2']), 1)
  group('flowchart.convert.8 chartToPlan refuses BY REASON, never with a truncated or empty plan: more than PLAN_STEPS_MAX steps names the count, a chart with no labelled step says so, an empty selection or a live object says to select a shape; exactly the maximum is accepted; a selection plans only its own steps',
    [
      ['13 steps is refused with 13 and 12 in the reason', () => refused13.kind === 'refused' && /13/.test(refused13.reason) && /12/.test(refused13.reason)],
      ['exactly 12 steps is a clean plan', () => ok12.kind === 'ok' && ok12.plan.steps.length === 12 && F.taskPlan.planProblems(ok12.plan).length === 0],
      ['no labelled step is refused by name', () => refusedNone.kind === 'refused' && /no labelled step/.test(refusedNone.reason)],
      ['an empty selection is refused', () => refusedEmpty.kind === 'refused' && /select a shape/.test(refusedEmpty.reason)],
      ['a live object is not a chart', () => refusedLive.kind === 'refused' && /select a shape/.test(refusedLive.reason)],
      ['a selection plans only its own steps, its first waiting on nothing outside it', () => scoped.kind === 'ok' && eq(scoped.plan.steps.map((s) => s.title), ['Step 1', 'Step 2', 'Step 3']) && eq(scoped.plan.steps[2].dependsOn, ['s2'])]
    ],
    () => JSON.stringify({ refused13, refusedNone, refusedEmpty, refusedLive, ok12: ok12.kind, scoped: scoped.kind === 'ok' ? scoped.plan.steps.map((s) => s.title) : scoped }))

  const FORMS5 = ['process', 'subprocess', 'io', 'document', 'decision']
  const forms5 = chainOf(FORMS5)
  const plan9 = C.chartToPlan(forms5, scopeAll(forms5), 1)
  const start9 = [shape('sa', 'terminator', 'Begin\nsecond line', 0, 0, [connector('sk', 'sb')]), shape('sb', 'process', 'Do the\nthing', 0, 100)]
  const titled = C.chartToPlan(start9, scopeAll(start9), 1)
  group('flowchart.convert.9 chartToPlan: every step-making form (process, subprocess, input/output, document, decision) maps to its step id in stepOf and nothing else does — the id the chart\'s shapes are bound to; the decision is a review step a person answers; the brief lists the steps in order; a multi-line label is one line; the title is start — first step',
    [
      ['stepOf maps each of the five step shapes to its step id', () => plan9.kind === 'ok' && plan9.stepOf.size === 5 && FORMS5.every((_, i) => plan9.stepOf.get(`c${i}`) === `s${i + 1}`)],
      ['skipped shapes are absent from stepOf', () => plan7.stepOf.size === 3 && !plan7.stepOf.has('t0') && !plan7.stepOf.has('j') && !plan7.stepOf.has('e1') && !plan7.stepOf.has('n1')],
      ['four agent steps and one review step, the review\'s role a person', () => eq(plan9.plan.steps.map((s) => s.kind), ['agent', 'agent', 'agent', 'agent', 'review']) && plan9.plan.steps[4].role === 'you'],
      ['a chain depends step to step', () => eq(plan9.plan.steps.map((s) => s.dependsOn), [[], ['s1'], ['s2'], ['s3'], ['s4']])],
      ['the brief lists the steps in order, the decision as a decision', () => eq(plan9.brief.split('\n'), ['Work drawn as a chart on the canvas. The steps, in order:', '1. Step 1', '2. Step 2', '3. Step 3', '4. Step 4', '5. Decide: Step 5'])],
      ['a multi-line label is one line; the title is "start — first step" on its first line', () => titled.kind === 'ok' && titled.plan.steps[0].title === 'Do the thing' && titled.title === 'Begin — Do the']
    ],
    () => JSON.stringify({ plan9: plan9.kind === 'ok' ? { stepOf: [...plan9.stepOf], brief: plan9.brief } : plan9, titled: titled.kind === 'ok' ? titled.title : titled }))

  // ── 10. svgModelOf ─────────────────────────────────────────────────────────
  zNext = 1
  const TT = terminal('TT', 500, 200, [connector('m1', 's1')])
  const P10 = [
    shape('s1', 'process', 'One', 0, 0, [connector('m2', 's3'), connector('m3', 's2'), connector('m9', 'ghost')]),
    shape('s2', 'process', 'Two', 0, 200),
    shape('s3', 'process', 'Three', 0, 400, [connector('m4', 'TT')]),
    shape('s4', 'text', 'a label', 300, 100),
    TT,
    shape('s8', 'process', 'Far', 5000, 5000, [connector('m5', 's9')]),
    shape('s9', 'process', 'Far too', 5300, 5000)
  ]
  const name10 = (p) => `name:${p.rect.id}`
  const model = C.svgModelOf(P10, new Set(['s1', 's2', 's3', 's4']), name10)
  const partial = C.svgModelOf(P10, new Set(['s1']), name10)
  const everything = C.svgModelOf(P10, new Set(), name10)
  const boxOf = (id) => rectOf(P10.find((p) => p.rect.id === id))
  const cm = (id) => model.connectors.find((c) => c.connector.id === id)
  group('flowchart.convert.10 svgModelOf: a scope draws the connectors touching it (not the far chart\'s, not one to a panel that is gone) and the live panels those reach — once each, with the caller\'s title; each connector\'s obstacles are the other shapes, never its own two ends and never a bare text label; an empty scope is every shape',
    [
      ['the scoped shapes, in panel order', () => eq(model.shapes.map((s) => s.id), ['s1', 's2', 's3', 's4'])],
      ['the four connectors touching the scope, not m5 (far chart) or m9 (target gone)', () => eq(model.connectors.map((c) => c.connector.id).sort(), ['m1', 'm2', 'm3', 'm4'])],
      ['the terminal appears once, titled by the caller, at its box', () => model.panels.length === 1 && model.panels[0].title === 'name:TT' && eq(model.panels[0].box, boxOf('TT'))],
      ['obstacles exclude each connector\'s own ends', () => eq(cm('m2').obstacles, [boxOf('s2')]) && eq(cm('m3').obstacles, [boxOf('s3')]) && eq(cm('m1').obstacles, [boxOf('s2'), boxOf('s3')]) && eq(cm('m4').obstacles, [boxOf('s1'), boxOf('s2')])],
      ['boxes and forms follow the ends (a live end has no form)', () => cm('m2').fromForm === 'process' && cm('m1').fromForm === null && cm('m4').toForm === null && eq(cm('m2').fromBox, boxOf('s1'))],
      ['one shape still draws every connector that touches it, both ways', () => eq(partial.shapes.map((s) => s.id), ['s1']) && eq(partial.connectors.map((c) => c.connector.id).sort(), ['m1', 'm2', 'm3']) && partial.panels.length === 1],
      ['an empty scope is every shape, the far chart included', () => everything.shapes.length === 6 && everything.connectors.some((c) => c.connector.id === 'm5')]
    ],
    () => JSON.stringify({ shapes: model.shapes.map((s) => s.id), connectors: model.connectors.map((c) => [c.connector.id, c.obstacles.length]), panels: model.panels }))

  // ── 11–13. The object clipboard ────────────────────────────────────────────
  zNext = 1
  const note = P.makeNotePanel('nt1', { x: 700, y: 100 }, 4, 'sticky', 'A sticky', 'yellow')
  const image = { ...P.makeImagePanel('img1', { x: 900, y: 100 }, 2, '/tmp/pic.png', 'pic'), links: [{ to: 'sh1' }] }
  const term = terminal('t1', 0, 900, [connector('cx9', 'sh1')])
  const S1 = shape('sh1', 'process', 'Alpha', 0, 0, [connector('cx1', 'sh2', { label: 'go' }), connector('cx2', 't1'), connector('cx3', 'nt1'), connector('cx4', 'gone')], {
    z: 7,
    shape: { fill: 'blue', stroke: 'iris', step: { item: 'w1', step: 's1' } },
    panel: { links: [{ to: 'sh2' }], locked: true, pinned: true, templateBinding: { templateId: 'tpl', key: 'k' }, maximised: { restore: { id: 'sh1', x: 0, y: 0, w: 10, h: 10 } } }
  })
  const S2 = shape('sh2', 'decision', 'Beta', 300, 0, undefined, { z: 1 })
  const S3 = shape('sh3', 'process', 'Gamma', 0, 300, [connector('cx5', 't1')], { z: 3 })
  const world = [S1, S2, S3, note, image, term]
  const before = JSON.stringify(world)
  const picked = K.collectCopy(world, new Set(['sh1', 'sh2', 'sh3', 'nt1', 'img1', 't1']))
  const pick = (id) => picked.find((p) => p.rect.id === id)
  const p1 = pick('sh1')
  // Edit the copy hard, then look at the original.
  p1.shape.text = 'mutated'
  p1.connectors[0].label = 'mutated'
  p1.rect.x = -999
  const untouched = JSON.stringify(world) === before
  group('flowchart.convert.11 collectCopy takes only shapes, notes and pictures (a terminal in the selection is NOT copied — a copy would be a process nobody asked for), keeps a connector only when its target is copied too, strips what belongs to the original\'s place (links, locked, pinned, maximised, template binding, a shape\'s plan-step binding), and shares no object with the original',
    [
      ['shapes, the note and the picture, not the terminal', () => eq(picked.map((p) => p.rect.id), ['sh1', 'sh2', 'sh3', 'nt1', 'img1']) && K.COPYABLE(S1) && K.COPYABLE(note) && K.COPYABLE(image) && !K.COPYABLE(term)],
      ['sh1 keeps cx1 (sh2) and cx3 (the note) — not cx2 (the terminal, not copied) nor cx4 (gone)', () => eq(p1.connectors.map((c) => c.id), ['cx1', 'cx3'])],
      ['a copy left with no connector has NO connectors key (sh3 pointed only at the terminal)', () => !('connectors' in pick('sh3')) && !('connectors' in pick('sh2'))],
      ['links, locked, pinned, maximised and the template binding are stripped; the picture\'s links too', () => !('links' in p1) && !('locked' in p1) && !('pinned' in p1) && !('maximised' in p1) && !('templateBinding' in p1) && !('links' in pick('img1'))],
      ['a copy of a step\'s shape is not that step; its look survives', () => !('step' in p1.shape) && p1.shape.fill === 'blue' && p1.shape.stroke === 'iris']
    ].concat([
      ['(after editing the copy) the original shape, its connectors, links and step binding are exactly as they were', () => untouched && S1.shape.step.item === 'w1' && S1.links.length === 1 && S1.connectors.length === 4 && S1.locked === true]
    ]),
    () => JSON.stringify({ ids: picked.map((p) => p.rect.id) }))

  const fresh = K.collectCopy(world, new Set(['sh1', 'sh2', 'sh3', 'nt1', 'img1']))
  const freshBefore = JSON.stringify(fresh)
  const c12 = counter(100)
  const placed = K.placeCopies(fresh, c12.mint, 30, -20, 50)
  const again = K.placeCopies(fresh, c12.mint, 60, 0, 60)
  const oldIds = new Set(world.map((p) => p.rect.id))
  const oldCids = new Set(world.flatMap((p) => (p.connectors ?? []).map((c) => c.id)))
  const copyOf = (id, from = placed) => from.panels[fresh.findIndex((p) => p.rect.id === id)]
  const cs1 = copyOf('sh1').connectors ?? []
  const cidsOf = (r) => r.panels.flatMap((q) => (q.connectors ?? []).map((c) => c.id))
  group('flowchart.convert.12 placeCopies re-mints EVERY object id (sh/nt/img prefixes) and every connector id, renames each connector\'s target to the COPY, offsets every copy by the same amount, stacks them from zBase in their ORIGINAL relative order, and two pastes of one held copy are independent — a connector left pointing at the original still draws, until the original is deleted',
    [
      ['five copies, ids returned in order, none an existing id', () => placed.panels.length === 5 && eq(placed.ids, placed.panels.map((p) => p.rect.id)) && placed.ids.every((id) => !oldIds.has(id)) && new Set(placed.ids).size === 5],
      ['prefixes: sh, nt, img', () => /^sh\d+$/.test(copyOf('sh1').rect.id) && /^sh\d+$/.test(copyOf('sh2').rect.id) && /^nt\d+$/.test(copyOf('nt1').rect.id) && /^img\d+$/.test(copyOf('img1').rect.id)],
      ['connector ids are new, cx-prefixed, from the counter', () => cs1.length === 2 && cs1.every((c) => /^cx\d+$/.test(c.id) && !oldCids.has(c.id) && Number(c.id.slice(2)) > 100)],
      ['each connector\'s target is the COPY (sh2\', nt1\'), never an original', () => cs1[0].to === copyOf('sh2').rect.id && cs1[1].to === copyOf('nt1').rect.id && cs1.every((c) => !oldIds.has(c.to) && placed.ids.includes(c.to)) && cs1[0].label === 'go'],
      ['no connector in the paste points outside the paste', () => placed.panels.every((p) => (p.connectors ?? []).every((c) => placed.ids.includes(c.to)))],
      ['offset by (30, -20), size untouched', () => placed.panels.every((p, i) => p.rect.x === fresh[i].rect.x + 30 && p.rect.y === fresh[i].rect.y - 20 && p.rect.w === fresh[i].rect.w && p.rect.h === fresh[i].rect.h)],
      ['z from zBase in original order: sh2(1) < img1(2) < sh3(3) < nt1(4) < sh1(7) become 50..54', () => [['sh2', 50], ['img1', 51], ['sh3', 52], ['nt1', 53], ['sh1', 54]].every(([id, z]) => copyOf(id).z === z)],
      ['the input copies were not consumed or mutated', () => JSON.stringify(fresh) === freshBefore],
      ['a second paste has disjoint ids and shares no object with the first', () => again.ids.every((id) => !placed.ids.includes(id) && !oldIds.has(id)) && again.panels.every((p, i) => p.rect !== placed.panels[i].rect && (p.kind !== 'shape' || p.shape !== placed.panels[i].shape)) && cidsOf(again).every((id) => !cidsOf(placed).includes(id))]
    ],
    () => JSON.stringify({ ids: placed.ids, cs1, z: placed.panels.map((p) => [p.rect.id, p.z]) }))

  const marker = K.clipboardMarker(3, 123456)
  const secret = shape('sh70', 'process', 'SECRET-LABEL-xyz', 0, 0)
  K.holdCopy([secret], marker)
  const held = K.heldCopyFor(marker)
  const heldOthers = [undefined, '', 'some other text', `${marker} and more`, marker.slice(0, -1), marker.toUpperCase()].map((t) => K.heldCopyFor(t))
  const marker2 = K.clipboardMarker(1, 99)
  K.holdCopy([secret], marker2)
  const retired = K.heldCopyFor(marker) === null && K.heldCopyFor(marker2) !== null
  const m1 = K.clipboardMarker(1, 35)
  const m2 = K.clipboardMarker(2, 35)
  group('flowchart.convert.13 the in-app clipboard: heldCopyFor returns the held copy only while the clipboard text IS the marker (anything else the person copied since, or nothing, returns null; a newer copy retires the older marker), and the marker is content-free — a count and a nonce, no label, text or id — singular for one',
    [
      ['the marker returns the held copy', () => held !== null && held[0] === secret],
      ['other text, nothing, a longer, shorter or re-cased marker return nothing', () => heldOthers.every((x) => x === null)],
      ['a newer copy retires the older marker', () => retired],
      ['content-free', () => !marker.includes('SECRET') && !marker.includes('Alpha') && !/sh\d|nt\d|cx\d/.test(marker)],
      ['reads singular for one, plural otherwise', () => /^1 object from terminal canvas · [0-9a-z]+$/.test(m1) && /^2 objects from terminal canvas · [0-9a-z]+$/.test(m2)],
      ['two copies of the same size differ (a stale marker cannot pass for a fresh one)', () => K.clipboardMarker(2, 1) !== K.clipboardMarker(2, 2)]
    ],
    () => JSON.stringify({ marker, marker2, m1, m2 }))

  // ── 14–15. The connector view cache ────────────────────────────────────────
  zNext = 1
  const A = shape('A', 'process', 'A', 0, 0, [connector('cx1', 'B'), connector('cx2', 'C', { from: 'n', toPort: 'n' }), connector('cx8', 'ghost')])
  const B = shape('B', 'process', 'B', 0, 300)
  const Cc = shape('C', 'process', 'C', 500, 300)
  const D = shape('D', 'process', 'D', 1500, 1500, [connector('cx3', 'E')])
  const E = shape('E', 'process', 'E', 1900, 1500)
  const Fz = shape('F', 'process', 'F', 3000, 0)
  const panels14 = [A, B, Cc, D, E, Fz]
  const PORTS = ['n', 'e', 's', 'w']
  const v1 = M.buildConnectorViews(panels14, new Map())
  const v2 = M.buildConnectorViews(panels14, v1)
  const movedF = panels14.map((p) => (p.rect.id === 'F' ? { ...p, rect: { ...p.rect, x: p.rect.x + 400, y: p.rect.y + 400 } } : p))
  const v4 = M.buildConnectorViews(movedF, v1)
  group('flowchart.convert.14 buildConnectorViews makes one view per connector whose target exists (a dangling one has none), keeps a fixed port and picks an absent one from the geometry (B below A: out of A\'s south into B\'s north), and CACHES: the same panels and the previous map return the SAME view objects, as does moving a shape no connector touches or passes near — routing is the expensive part of a 200-shape drag',
    [
      ['three views, none for the dangling connector', () => v1.size === 3 && eq([...v1.keys()].sort(), ['cx1', 'cx2', 'cx3']) && !v1.has('cx8')],
      ['ports picked from the geometry', () => v1.get('cx1').fromPort === 's' && v1.get('cx1').toPort === 'n' && v1.get('cx1').from === 'A' && v1.get('cx1').to === 'B'],
      ['a fixed port is kept', () => v1.get('cx2').fromPort === 'n' && v1.get('cx2').toPort === 'n'],
      ['every view is complete: valid ports, a routed path, its key and record', () => [...v1.values()].every((v) => PORTS.includes(v.fromPort) && PORTS.includes(v.toPort) && v.path != null && typeof v.key === 'string' && v.connector !== undefined)],
      ['same panels + previous map: every view is the SAME object', () => v2.size === 3 && [...v2.keys()].every((id) => v2.get(id) === v1.get(id))],
      ['a far shape moves: every view is the SAME object', () => v4.size === 3 && [...v4.keys()].every((id) => v4.get(id) === v1.get(id))]
    ],
    () => JSON.stringify({ repeat: [...v2.keys()].map((id) => v2.get(id) === v1.get(id)), farMove: [...v4.keys()].map((id) => v4.get(id) === v1.get(id)) }))

  const movedB = panels14.map((p) => (p.rect.id === 'B' ? { ...p, rect: { ...p.rect, x: p.rect.x + 40 } } : p))
  const v3 = M.buildConnectorViews(movedB, v1)
  const relabelled = M.buildConnectorViews(P.patchConnector(panels14, 'cx3', { label: 'later' }), v1)
  group('flowchart.convert.15 the view cache MISSES where it must: after B moves, the connector touching B and the one whose route passes B are re-routed (a stale path would be drawn through the moved shape) while the far D→E view is the same object; a connector edited without its geometry changing (a label) gets a fresh view holding the NEW record but the SAME routed path',
    [
      ['A→B (touches B) is a new view with a new key and a moved path', () => v3.get('cx1') !== v1.get('cx1') && v3.get('cx1').key !== v1.get('cx1').key && !eq(v3.get('cx1').path, v1.get('cx1').path)],
      ['A→C (B sits in its span) is re-routed', () => v3.get('cx2') !== v1.get('cx2')],
      ['D→E (far away) is the same view', () => v3.get('cx3') === v1.get('cx3')],
      ['a relabelled connector: new view, new record', () => relabelled.get('cx3') !== v1.get('cx3') && relabelled.get('cx3').connector.label === 'later'],
      ['a relabelled connector: the route is NOT recomputed', () => relabelled.get('cx3').path === v1.get('cx3').path],
      ['the others are untouched', () => relabelled.get('cx1') === v1.get('cx1') && relabelled.get('cx2') === v1.get('cx2')]
    ],
    () => JSON.stringify({ cx1: v3.get('cx1') === v1.get('cx1'), cx2: v3.get('cx2') === v1.get('cx2'), cx3: v3.get('cx3') === v1.get('cx3') }))

  // ── 16–17. The keyboard's pure helpers ────────────────────────────────────
  zNext = 1
  const above = [shape('U', 'process', 'U', 0, 0, [connector('f1', 'V')]), shape('V', 'process', 'V', 0, 200)]
  const leftOf = [shape('L', 'process', 'L', 0, 0, [connector('f2', 'M')]), shape('M', 'process', 'M', 300, 0)]
  const belowIn = [shape('W', 'process', 'W', 0, 300, [connector('f3', 'X')]), shape('X', 'process', 'X', 0, 0)]
  const rightIn = [shape('Y', 'process', 'Y', 400, 0, [connector('f4', 'Z')]), shape('Z', 'process', 'Z', 0, 0)]
  const outRight = [shape('O', 'process', 'O', 0, 0, [connector('f5', 'Q')]), shape('Q', 'process', 'Q', 400, 0)]
  const outDown = [shape('O', 'process', 'O', 0, 0, [connector('f6', 'Q')]), shape('Q', 'process', 'Q', 0, 300)]
  const outUp = [shape('O', 'process', 'O', 0, 300, [connector('f7', 'Q')]), shape('Q', 'process', 'Q', 0, 0)]
  const both = [shape('L', 'process', 'L', 0, 0, [connector('f8', 'M')]), shape('M', 'process', 'M', 300, 0, [connector('f9', 'N')]), shape('N', 'process', 'N', 300, 300)]
  const lone = [shape('S', 'process', 'S', 0, 0)]
  group('flowchart.convert.16 flowPort follows the way the chart already flows through a shape: an incoming line from above gives south, from the left east, from below north, from the right west; with none, its first outgoing line\'s way (right east, down south, up north); incoming wins over outgoing; nothing, or an unknown id, is south — Tab would otherwise grow the next step against the chart\'s grain',
    [
      ['from above: south', () => S.flowPort(above, 'V') === 's'],
      ['from the left: east', () => S.flowPort(leftOf, 'M') === 'e'],
      ['from below: north', () => S.flowPort(belowIn, 'X') === 'n'],
      ['from the right: west', () => S.flowPort(rightIn, 'Z') === 'w'],
      ['no incoming, an outgoing to the right: east', () => S.flowPort(outRight, 'O') === 'e'],
      ['no incoming, an outgoing below: south; above: north', () => S.flowPort(outDown, 'O') === 's' && S.flowPort(outUp, 'O') === 'n'],
      ['incoming from the left beats outgoing downward', () => S.flowPort(both, 'M') === 'e'],
      ['a lone shape, or an unknown id: south', () => S.flowPort(lone, 'S') === 's' && S.flowPort(lone, 'nobody') === 's']
    ])

  // Where a next step lands, as the rect it occupies: the returned point is the new shape's NEAR edge (useConnectors.extend centres it out from there).
  const NORMAL = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } }
  const rectAt = (d, port, form) => {
    const sz = SIZE[form]
    const n = NORMAL[port]
    return { x: d.x + n.x * sz.w / 2 - sz.w / 2, y: d.y + n.y * sz.h / 2 - sz.h / 2, w: sz.w, h: sz.h }
  }
  const stack = (port) => {
    let live = [shape('root', 'process', 'root', 1000, 1000), shape('other', 'process', 'other', 1300, 1300)]
    const rects = []
    const points = []
    for (let i = 0; i < 6; i++) {
      const d = S.nextStepPoint(live, live[0], port, 'process')
      const r = rectAt(d, port, 'process')
      rects.push({ r, hit: live.some((q) => overlap(r, rectOf(q))) })
      points.push(d)
      live = [...live, shape(`child${i}`, 'process', '', r.x, r.y)]
    }
    return { rects, points }
  }
  const stacks = Object.fromEntries(PORTS.map((p) => [p, stack(p)]))
  // The first step off a port lands one rank gap (64) beyond its midpoint.
  const firstDrop = { s: { x: 1080, y: 1072 + 64 }, n: { x: 1080, y: 1000 - 64 }, e: { x: 1160 + 64, y: 1036 }, w: { x: 1000 - 64, y: 1036 } }
  group('flowchart.convert.17 nextStepPoint: the first step off a port lands one rank gap beyond it, and each further step from the SAME port slides BESIDE the earlier ones — six in a row from every side, none overlapping the source, an earlier child or any other object (a second Tab that lands on the first child looks like nothing happened)',
    PORTS.flatMap((p) => [
      [`${p}: the first step is one rank gap beyond the port`, () => eq(stacks[p].points[0], firstDrop[p])],
      [`${p}: six steps, none overlapping anything, all at distinct points`, () => stacks[p].rects.every((x) => !x.hit) && new Set(stacks[p].points.map((d) => `${d.x},${d.y}`)).size === 6]
    ]),
    () => JSON.stringify(Object.fromEntries(Object.entries(stacks).map(([p, s]) => [p, s.rects.map((x) => (x.hit ? 'HIT' : 'ok')).join(',')]))))

  const expected = { process: 'process', decision: 'process', terminator: 'process', io: 'process', document: 'process', subprocess: 'process', junction: 'process', text: 'process' }
  group('flowchart.convert.18 nextStepForm: the next step pulled off ANY shape (or a live object, null) is a plain PROCESS — two diamonds in a row, a start after a start, is almost never meant',
    [
      ...Object.entries(expected).map(([form, next]) => [`${form} → ${next}`, () => R.nextStepForm(form) === next]),
      ['null → process', () => R.nextStepForm(null) === 'process']
    ])

  // M391 (the lead, after the checks' own report): a hub with more lines than
  // one panel may hold (CONNECTORS_MAX) hands the overflow to each TARGET,
  // drawn the same way — never a silent truncation.
  {
    const M = F.mermaid ?? {}
    const C = F.convert ?? {}
    const R2 = F.record ?? {}
    const text = 'flowchart TB\n' + Array.from({ length: 70 }, (_, i) => `hub --> n${i}`).join('\n')
    const parsed = typeof M.parseMermaid === 'function' ? M.parseMermaid(text) : null
    let n = 0
    const out = parsed && parsed.kind === 'ok' && typeof C.graphToPanels === 'function' ? C.graphToPanels(parsed.graph, () => ++n, { x: 0, y: 0 }, 1) : null
    const all = out === null ? [] : out.panels.flatMap((p) => (p.connectors ?? []).map((c) => ({ holder: p.rect.id, ...c })))
    const hub = out === null ? undefined : out.panels.find((p) => p.shape.text === 'hub')
    const byHub = all.filter((c) => c.holder === hub?.rect.id)
    const byTargets = all.filter((c) => c.holder !== hub?.rect.id)
    ok('flowchart.convert.19 a hub with 70 lines out keeps ALL 70: the hub holds CONNECTORS_MAX, the rest are held by their targets pointing back with the arrowhead at the holder (`start`), so every arrow still points away from the hub; nothing is dropped',
      out !== null && all.length === 70 && byHub.length === R2.CONNECTORS_MAX && byTargets.length === 70 - R2.CONNECTORS_MAX && byTargets.every((c) => c.to === hub.rect.id && c.ends === 'start') && out.dropped === 0,
      JSON.stringify({ all: all.length, hub: byHub.length, targets: byTargets.length, dropped: out && out.dropped }))
  }
}
