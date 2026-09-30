/* verify:flowchart — the flowchart's PERSISTENCE and its panel verbs: a shape
   and a connector through parseLayout (shared/layout-schema) and the adapter's
   toPanels/fromPanels (renderer/panels/layout-adapt.ts), and the connector
   verbs in renderer/panels/panels.ts. Every property here fails SILENTLY: a
   connector held by a TERMINAL that the adapter forgets to copy is lost on
   the next relaunch with nothing said, a shape clamped to a terminal's 200x160
   floor turns every junction into a slab, a dangling arrow draws to nowhere,
   and a no-op verb that returns a NEW array writes a history entry that undo
   then has to step over. */
const assert = require('node:assert')

module.exports = async function (ok, F) {
  const L = F.layoutSchema ?? {}
  const A = F.adapt ?? {}
  const P = F.panels ?? {}
  const R = F.record ?? {}
  const missing = []
  for (const [area, mod, names] of [
    ['layoutSchema', L, ['parseLayout']],
    ['adapt', A, ['toPanels', 'fromPanels']],
    ['panels', P, ['removePanel', 'addConnector', 'removeConnector', 'patchConnector', 'connectorsOf', 'makeShapePanel', 'makePanel']]
  ]) for (const n of names) if (typeof mod[n] !== 'function') missing.push(`${area}.${n}`)
  if (R.SHAPE_MIN === undefined) missing.push('record.SHAPE_MIN')
  if (missing.length) {
    ok('flowchart.persist.0 the persistence modules export their API', false, `missing: ${missing.join(', ')}`)
    return
  }

  // ── Fixtures ───────────────────────────────────────────────────────────────
  const eq = (a, b) => { try { assert.deepStrictEqual(a, b); return true } catch { return false } }
  /* One check id, several named properties: a throw is a failure, not a crashed suite, and the failure names the ones that broke. */
  const group = (name, parts, detail) => {
    const failed = []
    for (const [label, test] of parts) {
      try { if (!test()) failed.push(label) } catch (error) { failed.push(`${label} (threw ${error && error.message})`) }
    }
    let more = ''
    if (failed.length > 0 && detail !== undefined) { try { more = ' — ' + (typeof detail === 'function' ? detail() : JSON.stringify(detail)) } catch { more = '' } }
    ok(name, failed.length === 0, failed.length === 0 ? undefined : `broken: ${failed.join('; ')}${more}`)
  }
  const file = (panels, over = {}) => JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{ id: 'w1', name: 'Canvas', panels, camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }],
    settings: { layout: true, camera: true, focus: true },
    ...over
  })
  const parse = (panels) => { const r = L.parseLayout(file(panels)); return { panels: r.snapshot.workspaces[0].panels, warnings: r.warnings } }
  const term = (id, over = {}) => ({ id, x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: ['-l'], ...over })
  const shp = (id, shape, over = {}) => ({ kind: 'shape', id, x: 100, y: 100, w: 160, h: 72, z: 2, shape, ...over })
  const strip = (p) => { const { kind, ...rest } = p; void kind; return rest }
  const byId = (panels, id) => panels.find((p) => (p.rect ? p.rect.id : p.id) === id)

  // ── 1. The round trip ──────────────────────────────────────────────────────
  const FULL_CONN = { id: 'cx1', to: 's2', from: 'e', toPort: 'w', route: 'curved', ends: 'both', label: 'yes', stroke: 'violet', dashed: true }
  const layout1 = [
    term('t1', { connectors: [FULL_CONN, { id: 'cx2', to: 't1x' }] }),
    term('t1x', { x: 800, z: 3 }),
    shp('s1', { form: 'decision', text: 'Ship it?\nyes / no', fill: 'blue', stroke: 'violet', ink: 'muted', step: { item: 'work1', step: 's3' } }, { connectors: [{ id: 'cx3', to: 't1', ends: 'none' }, { id: 'cx4', to: 's2', label: 'go', dashed: true }] }),
    shp('s2', { form: 'process', text: 'Do it' }, { x: 400 }),
    shp('s3', { form: 'junction', text: '' }, { x: 700, w: 28, h: 28 })
  ]
  const r1 = parse(layout1)
  const live1 = A.toPanels(r1.panels)
  const back1 = A.fromPanels(live1)
  const r1b = parse(back1)
  const s1 = byId(live1, 's1')
  group('flowchart.persist.1 a shape (every style field and a plan-step binding) and connectors held by a TERMINAL and by a shape survive parse → toPanels → fromPanels → parse exactly — the adapter is the door a schema-only check cannot see, and a connector it forgets is lost on the next relaunch with nothing said',
    [
      ['the file parses clean', () => r1.warnings.length === 0 && r1.panels.length === 5],
      ['the shape\'s form, text and every style field and its step binding', () => eq(byId(r1.panels, 's1').shape, { form: 'decision', text: 'Ship it?\nyes / no', fill: 'blue', stroke: 'violet', ink: 'muted', step: { item: 'work1', step: 's3' } })],
      ['a terminal\'s connector keeps every field', () => eq(byId(r1.panels, 't1').connectors, [FULL_CONN, { id: 'cx2', to: 't1x' }])],
      ['toPanels holds the shape as a shape and the terminal\'s connectors on the terminal', () => s1.kind === 'shape' && s1.shape.step.step === 's3' && byId(live1, 't1').connectors.length === 2 && byId(live1, 't1').kind === 'terminal'],
      ['fromPanels writes back what was read, panel for panel (only the explicit terminal kind is added)', () => eq(back1.map((p) => (p.kind === 'terminal' ? strip(p) : p)), r1.panels)],
      ['the file written back parses to the very same panels, clean', () => r1b.warnings.length === 0 && eq(r1b.panels, back1)],
      ['the live panel shares no array or record with the persisted one', () => s1.connectors !== r1.panels[2].connectors && s1.connectors[0] !== r1.panels[2].connectors[0] && s1.shape !== r1.panels[2].shape && s1.shape.step !== r1.panels[2].shape.step && byId(live1, 't1').connectors[0] !== r1.panels[0].connectors[0]],
      ['a bare shape stays bare: no style key, no step, no connectors key is written', () => { const bare = A.fromPanels(A.toPanels(parse([shp('b1', { form: 'process', text: 'x' })]).panels))[0]; return eq(Object.keys(bare.shape).sort(), ['form', 'text']) && !('connectors' in bare) }]
    ],
    () => JSON.stringify({ warnings: r1.warnings, keys: back1.map((p) => Object.keys(p).join(',')) }))

  // ── 2. The floor ───────────────────────────────────────────────────────────
  const r2 = parse([
    shp('tiny', { form: 'process', text: 'a' }, { w: 10, h: 8 }),
    shp('neg', { form: 'process', text: 'a' }, { w: -5, h: -5, x: 200 }),
    shp('mid', { form: 'process', text: 'a' }, { w: 100, h: 30, x: 400 }),
    shp('dot', { form: 'junction', text: '' }, { w: 28, h: 28, x: 600 }),
    term('term', { w: 50, h: 50, x: 800, z: 9 })
  ])
  const r2live = A.fromPanels(A.toPanels(r2.panels))
  const at = (id) => byId(r2.panels, id)
  const MIN = R.SHAPE_MIN
  group('flowchart.persist.2 a shape\'s w/h is clamped to SHAPE_MIN and no higher — not to the 200x160 panel floor, which is a terminal\'s (a 28-wide junction would silently become a slab); a terminal still clamps to 200x160; and the adapter does not move either',
    [
      ['a shape below the floor is raised to SHAPE_MIN', () => at('tiny').w === MIN.w && at('tiny').h === MIN.h && at('neg').w === MIN.w && at('neg').h === MIN.h],
      ['a shape between SHAPE_MIN and 200x160 is left alone', () => at('mid').w === 100 && at('mid').h === 30],
      ['a junction keeps its 28x28', () => at('dot').w === 28 && at('dot').h === 28],
      ['a terminal below the floor is raised to 200x160', () => at('term').w === 200 && at('term').h === 160],
      ['SHAPE_MIN is far below the terminal floor (else the check above proves nothing)', () => MIN.w < 200 && MIN.h < 160],
      ['toPanels/fromPanels leave the clamped sizes as they are', () => eq(r2live.map((p) => [p.id, p.w, p.h]), r2.panels.map((p) => [p.id, p.w, p.h]))]
    ],
    () => JSON.stringify(r2.panels.map((p) => [p.id, p.w, p.h])))

  // ── 3. Dangling connectors ─────────────────────────────────────────────────
  const r3 = parse([
    term('T', { connectors: [{ id: 'k1', to: 'S' }, { id: 'k2', to: 'ghost' }] }),
    shp('S', { form: 'process', text: 's' }, { connectors: [{ id: 'k3', to: 'T' }, { id: 'k4', to: 'gone1' }, { id: 'k5', to: 'H' }, { id: 'k6', to: 'gone2' }] }),
    shp('H', { form: 'hexagon', text: 'not a form' }),
    shp('Z', { form: 'process', text: 'z' }, { x: 500, connectors: [{ id: 'k7', to: 'nowhere' }] }),
    shp('Q', { form: 'process', text: 'q' }, { x: 900, connectors: [{ id: 'k8', to: 'S' }] })
  ])
  const cw = r3.warnings.filter((w) => /connector/.test(w))
  group('flowchart.persist.3 a connector whose target is not in the layout is dropped by the workspace pass WITH a warning naming the holder, and only it — including one aimed at a panel that was itself dropped in validation; a holder left with none has no connectors key at all',
    [
      ['the terminal keeps its connector to the shape and loses only the dangling one', () => eq(byId(r3.panels, 'T').connectors, [{ id: 'k1', to: 'S' }])],
      ['the shape keeps only the connector to the terminal (the dropped panel H counts as gone)', () => eq(byId(r3.panels, 'S').connectors, [{ id: 'k3', to: 'T' }])],
      ['a holder whose every connector dangled has no connectors key', () => byId(r3.panels, 'Z') !== undefined && !('connectors' in byId(r3.panels, 'Z'))],
      ['a healthy connector elsewhere is untouched', () => eq(byId(r3.panels, 'Q').connectors, [{ id: 'k8', to: 'S' }])],
      ['the dropped shape is gone', () => byId(r3.panels, 'H') === undefined && r3.panels.length === 4],
      ['a warning per holder names it and the count', () => cw.some((w) => /dropped 1 connector\(s\) on panel T/.test(w)) && cw.some((w) => /dropped 3 connector\(s\) on panel S/.test(w)) && cw.some((w) => /dropped 1 connector\(s\) on panel Z/.test(w))],
      ['no warning about the healthy holder', () => !cw.some((w) => /panel Q/.test(w))]
    ],
    () => JSON.stringify({ warnings: r3.warnings, panels: r3.panels.map((p) => [p.id, p.connectors]) }))

  // ── 4. An old layout ───────────────────────────────────────────────────────
  const old = [
    { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~/proj', command: 'claude', args: ['--x'], title: 'Agent', links: [{ to: 'n2', label: 'feeds' }, { to: 'nt1' }] },
    { id: 'n2', x: 800, y: 0, w: 720, h: 460, z: 2, cwd: '~', args: [], locked: true, pinned: true, fontSize: 12, links: [{ to: 'n1' }] },
    { kind: 'file', id: 'f1', x: 0, y: 500, w: 480, h: 360, z: 3, source: { path: '/tmp/a.md', prose: true } },
    { kind: 'note', id: 'nt1', x: 900, y: 500, w: 320, h: 220, z: 4, note: { form: 'sticky', text: 'hi', tint: 'yellow' }, links: [{ to: 'f1' }] },
    { kind: 'image', id: 'img1', x: 900, y: 800, w: 480, h: 360, z: 5, title: 'pic', image: { path: '/tmp/x.png' } },
    { kind: 'browser', id: 'b1', x: 0, y: 900, w: 640, h: 400, z: 6, url: 'http://localhost:3000' }
  ]
  const r4 = parse(old)
  const back4 = A.fromPanels(A.toPanels(r4.panels))
  group('flowchart.persist.4 a layout from before the flowchart (no shape kind, no connectors anywhere, links between panels) parses with ZERO warnings to the very same panels, and reads and writes back without gaining a connectors or shape key — every existing canvas must open as it was',
    [
      ['no warnings', () => r4.warnings.length === 0],
      ['the panels are exactly what was written (a terminal\'s kind stays absent)', () => eq(r4.panels, old)],
      ['no panel gained a connectors key', () => r4.panels.every((p) => !('connectors' in p))],
      ['the adapter round trip is the same panels again, writers emitting the explicit terminal kind', () => eq(back4.map((p) => (p.kind === 'terminal' ? strip(p) : p)), old)],
      ['and still no connectors or shape key anywhere in what it wrote', () => !/connectors|"shape"/.test(JSON.stringify(back4))],
      ['links survive both doors', () => eq(back4[0].links, old[0].links) && eq(back4[3].links, old[3].links)]
    ],
    () => JSON.stringify({ warnings: r4.warnings }))

  // ── 5. Malformed shapes ────────────────────────────────────────────────────
  const r5 = parse([
    shp('ok1', { form: 'process', text: 'fine' }),
    shp('bad1', { form: 'hexagon', text: 'x' }),
    shp('bad2', undefined),
    shp('bad3', 'process'),
    shp('half', { form: 'decision', text: 7, fill: 'magenta', stroke: 'violet', ink: 'loud', step: { item: '', step: 's1' } }, { x: 300 }),
    shp('step2', { form: 'process', text: 'a', step: 'nope' }, { x: 500 }),
    shp('step3', { form: 'process', text: 'a', step: { item: 'w', step: 3 } }, { x: 700 }),
    shp('good2', { form: 'io', text: 'kept', fill: 'green', step: { item: 'w9', step: 's2' } }, { x: 900 })
  ])
  const half = byId(r5.panels, 'half')
  group('flowchart.persist.5 a shape with an unknown form, no record or a non-record drops the PANEL by name (there is nothing to draw); a malformed style field, text or step binding costs THAT FIELD only, with a warning naming the panel — a shape does not vanish because one colour was mistyped',
    [
      ['the three unusable shapes are gone, the others survive', () => eq(r5.panels.map((p) => p.id), ['ok1', 'half', 'step2', 'step3', 'good2'])],
      ['each dropped panel is named, with the unknown form quoted', () => r5.warnings.some((w) => /shape panel bad1/.test(w) && /hexagon/.test(w) && /dropped/.test(w)) && r5.warnings.some((w) => /shape panel bad2/.test(w) && /dropped/.test(w)) && r5.warnings.some((w) => /shape panel bad3/.test(w) && /dropped/.test(w))],
      ['a wrong-typed text costs the text; the good stroke survives; the bad fill, ink and step cost only themselves', () => half.shape.form === 'decision' && half.shape.text === '' && half.shape.stroke === 'violet' && !('fill' in half.shape) && !('ink' in half.shape) && !('step' in half.shape)],
      ['those four field losses warn, naming the panel', () => r5.warnings.filter((w) => /shape panel half/.test(w)).length === 4],
      ['a malformed step (a non-record, a non-string step id) costs the binding only', () => !('step' in byId(r5.panels, 'step2').shape) && !('step' in byId(r5.panels, 'step3').shape) && byId(r5.panels, 'step2').shape.text === 'a' && r5.warnings.some((w) => /shape panel step2/.test(w)) && r5.warnings.some((w) => /shape panel step3/.test(w))],
      ['a healthy neighbour is untouched and silent', () => eq(byId(r5.panels, 'good2').shape, { form: 'io', text: 'kept', fill: 'green', step: { item: 'w9', step: 's2' } }) && !r5.warnings.some((w) => /ok1|good2/.test(w))],
      ['the surviving shapes keep their rects', () => eq(r5.panels.map((p) => p.x), [100, 300, 500, 700, 900])]
    ],
    () => JSON.stringify({ warnings: r5.warnings, ids: r5.panels.map((p) => p.id) }))

  // ── 6. removePanel, removeConnector, patchConnector ───────────────────────
  const mk = (id, x, kind = 'shape') => (kind === 'shape' ? P.makeShapePanel(id, { x, y: 0 }, 1, 'process', id) : P.makePanel(id, { x, y: 0 }, 1))
  const withC = (p, connectors, links) => ({ ...p, ...(connectors === undefined ? {} : { connectors }), ...(links === undefined ? {} : { links }) })
  const base6 = [
    mk('S', 0),
    withC(mk('A', 400), [{ id: 'a1', to: 'S' }, { id: 'a2', to: 'B', label: 'keep' }]),
    withC(mk('B', 800, 'terminal'), [{ id: 'b1', to: 'S' }], [{ to: 'S' }, { to: 'A', label: 'feeds' }]),
    withC(mk('C', 1200), [{ id: 'c1', to: 'S' }]),
    withC(mk('D', 1600), [{ id: 'd1', to: 'A' }], [{ to: 'A' }])
  ]
  const before6 = JSON.stringify(base6)
  const gone = P.removePanel(base6, 'S')
  const gA = byId(gone, 'A')
  const gB = byId(gone, 'B')
  group('flowchart.persist.6 removePanel of a shape prunes every connector pointing at it — on shapes AND terminals — and the links to it, in ONE call (one undo brings all back); a holder left with none loses the key rather than keeping []; a panel that referenced nothing removed is the SAME object; the input is not mutated',
    [
      ['the shape is gone', () => gone.length === 4 && byId(gone, 'S') === undefined],
      ['a shape keeps only the connector to something else', () => eq(gA.connectors, [{ id: 'a2', to: 'B', label: 'keep' }])],
      ['a terminal holding one loses the key, and its link to the shape with it, keeping the other link', () => !('connectors' in gB) && eq(gB.links, [{ to: 'A', label: 'feeds' }])],
      ['a shape whose only connector pointed there has no connectors key', () => !('connectors' in byId(gone, 'C'))],
      ['an unrelated holder is the same object (no churn)', () => byId(gone, 'D') === base6[4]],
      ['no connector anywhere still names the shape', () => gone.every((p) => (p.connectors ?? []).every((c) => c.to !== 'S') && (p.links ?? []).every((l) => l.to !== 'S'))],
      ['the input array and its panels were not mutated', () => JSON.stringify(base6) === before6]
    ])

  const noopRemove = P.removeConnector(base6, 'nope')
  const samePatch = P.patchConnector(base6, 'a2', { label: 'keep' })
  const unknownPatch = P.patchConnector(base6, 'nope', { label: 'x' })
  const undefPatch = P.patchConnector(base6, 'a1', { label: undefined, dashed: undefined })
  const emptyPatch = P.patchConnector(base6, 'a1', {})
  const selfRetarget = P.patchConnector(base6, 'a1', { to: 'A' })
  const missingRetarget = P.patchConnector(base6, 'a1', { to: 'nobody' })
  const labelled = P.patchConnector(base6, 'a2', { label: undefined, dashed: true })
  const a2 = byId(labelled, 'A').connectors.find((c) => c.id === 'a2')
  const removed = P.removeConnector(base6, 'a2')
  const removedLast = P.removeConnector(base6, 'c1')
  group('flowchart.persist.7 removeConnector / patchConnector return the SAME array when nothing changes (a no-op that returned a fresh array would write a history entry undo must step over), delete a key set to undefined rather than storing it (a stored undefined survives IPC and reads as present), and refuse a retarget to itself or to nothing',
    [
      ['removing an unknown connector is the same array', () => noopRemove === base6],
      ['patching an unknown connector is the same array', () => unknownPatch === base6],
      ['patching a field to the value it has is the same array', () => samePatch === base6],
      ['an empty patch, or undefined for keys the connector never had, is the same array', () => emptyPatch === base6 && undefPatch === base6],
      ['a retarget onto the holder itself or onto a missing panel is refused (same array)', () => selfRetarget === base6 && missingRetarget === base6],
      ['undefined deletes the key: the label is ABSENT, not undefined, and the other patched key is set', () => a2 !== undefined && !('label' in a2) && a2.dashed === true && Object.values(a2).every((v) => v !== undefined)],
      ['a real patch changes only its holder: everything else is the same object', () => labelled !== base6 && byId(labelled, 'S') === base6[0] && byId(labelled, 'C') === base6[3]],
      ['removing one of two leaves the other; removing the last deletes the key', () => eq(byId(removed, 'A').connectors, [{ id: 'a1', to: 'S' }]) && !('connectors' in byId(removedLast, 'C')) && byId(removedLast, 'A') === base6[1]],
      ['connectorsOf reads absent as none', () => eq(P.connectorsOf(base6[0]), []) && P.connectorsOf(base6[1]).length === 2]
    ])

  // ── 7. addConnector ────────────────────────────────────────────────────────
  const two = [mk('X', 0), mk('Y', 400, 'terminal')]
  const good = P.addConnector(two, 'X', { id: 'g1', to: 'Y', label: 'runs' })
  const goodTerm = P.addConnector(two, 'Y', { id: 'g2', to: 'X' })
  const twoBefore = JSON.stringify(two)
  group('flowchart.persist.8 addConnector refuses a self-connector, a missing target and a missing source by returning the SAME array (no history entry for a refused gesture); a valid one lands on its SOURCE — a shape or a terminal — leaving the input untouched',
    [
      ['a connector from a panel to itself is refused', () => P.addConnector(two, 'X', { id: 'g', to: 'X' }) === two],
      ['a missing target is refused', () => P.addConnector(two, 'X', { id: 'g', to: 'nobody' }) === two],
      ['a missing source is refused', () => P.addConnector(two, 'nobody', { id: 'g', to: 'Y' }) === two],
      ['a valid add is held by the source, shape or terminal, and only there', () => good !== two && eq(byId(good, 'X').connectors, [{ id: 'g1', to: 'Y', label: 'runs' }]) && !('connectors' in byId(good, 'Y')) && eq(byId(goodTerm, 'Y').connectors, [{ id: 'g2', to: 'X' }])],
      ['the untouched panel is the same object, the input unmodified', () => byId(good, 'Y') === two[1] && JSON.stringify(two) === twoBefore],
      ['a second connector is appended, the first kept', () => { const both = P.addConnector(good, 'X', { id: 'g3', to: 'Y' }); return eq(byId(both, 'X').connectors.map((c) => c.id), ['g1', 'g3']) }]
    ])

  // ── 8. A hostile connectors field, through the whole door ─────────────────
  const many = Array.from({ length: R.CONNECTORS_MAX + 6 }, (_, i) => ({ id: `m${i}`, to: 'T2' }))
  const r8 = parse([
    term('T2', { x: 900 }),
    term('T3', { connectors: 'not a list' }),
    shp('H1', { form: 'process', text: 'many' }, { connectors: many }),
    shp('H2', { form: 'process', text: 'mixed' }, { x: 300, connectors: [{ id: 'q1', to: 'H2' }, { id: 'q2', to: 'T2', route: 'zigzag', label: 'kept' }, { id: 'q2', to: 'T2' }, 'junk', { to: 'T2' }] })
  ])
  const h1 = byId(r8.panels, 'H1')
  const h2 = byId(r8.panels, 'H2')
  group('flowchart.persist.9 a hostile connectors field costs only itself through parseLayout: a non-list (on a terminal) is dropped with a warning and the terminal still parses with its cwd; more than CONNECTORS_MAX is capped, not looped; a self-connector, a repeated id, a junk entry and an id-less one are dropped by name while the good entry keeps its good fields',
    [
      ['the terminal survives a non-list connectors field, with no key', () => byId(r8.panels, 'T3') !== undefined && byId(r8.panels, 'T3').cwd === '~' && !('connectors' in byId(r8.panels, 'T3')) && r8.warnings.some((w) => /panel T3.*connectors is not a list/.test(w))],
      ['an over-long list is capped at CONNECTORS_MAX, and says so', () => h1.connectors.length === R.CONNECTORS_MAX && r8.warnings.some((w) => /panel H1.*more than/.test(w))],
      ['the mixed list keeps exactly the one good entry, without its bad route', () => eq(h2.connectors, [{ id: 'q2', to: 'T2', label: 'kept' }])],
      ['every dropped entry warns, naming the panel', () => r8.warnings.filter((w) => /panel H2/.test(w)).length >= 5]
    ],
    () => JSON.stringify({ warnings: r8.warnings }))

  // M389 (the lead, after the checks' own report): a connector id is unique in
  // the WORKSPACE — the views are keyed by it, and remove/patch act on the
  // first holder — so a second holder's copy (a hand-merged file) is dropped
  // by name, and addConnector refuses an id another panel holds.
  {
    const L = F.layoutSchema ?? {}
    const P = F.panels ?? {}
    const r = parse([
      shp('a', { form: 'process', text: 'A' }, { connectors: [{ id: 'cx1', to: 'b' }] }),
      shp('b', { form: 'process', text: 'B' }, { y: 300, connectors: [{ id: 'cx1', to: 'a' }] })
    ])
    const parsed = { warnings: r.warnings }
    const ids = r.panels.flatMap((p) => (p.connectors ?? []).map((c) => c.id))
    const warned = r.warnings.some((w) => /cx1/.test(w) && /already holds/.test(w))
    const panels = [P.makeShapePanel('x', { x: 0, y: 0 }, 1, 'process', 'X'), P.makeShapePanel('y', { x: 0, y: 200 }, 2, 'process', 'Y')]
    const first = P.addConnector(panels, 'x', { id: 'cx9', to: 'y' })
    const second = P.addConnector(first, 'y', { id: 'cx9', to: 'x' })
    ok('flowchart.persist.10 a connector id held by two panels loads ONCE (the second dropped by name), and addConnector refuses an id another panel already holds (same array back)',
      ids.length === 1 && warned && second === first, JSON.stringify({ ids, warnings: parsed.warnings }))
  }

  // M396. `iris` left the authored strokes (the selection and running hue,
  // painted on a shape's outline by M393). A layout written before — only on
  // this branch — still LOADS: the field costs itself, the shape and its
  // arrow keep everything else.
  {
    const r = parse([
      shp('old', { form: 'decision', text: 'Old', fill: 'blue', stroke: 'iris' }, { connectors: [{ id: 'cx5', to: 'next', stroke: 'iris', label: 'yes' }] }),
      shp('next', { form: 'process', text: 'Next' }, { y: 300 })
    ])
    const old = byId(r.panels, 'old')
    ok('flowchart.persist.11 a shape or connector saved with the retired iris stroke loads with that field dropped (a warning naming it) and every other field kept',
      old !== undefined && !('stroke' in old.shape) && old.shape.fill === 'blue' && old.shape.text === 'Old' &&
        old.connectors?.length === 1 && !('stroke' in old.connectors[0]) && old.connectors[0].label === 'yes' && r.warnings.some((w) => /shape panel old/.test(w) && /iris/.test(w)) && r.warnings.some((w) => /cx5/.test(w) && /stroke/.test(w)),
      JSON.stringify({ old, warnings: r.warnings }))
  }
}
