/* verify:flowchart — the record (src/shared/flowchart.ts): the shape record
   and the connector list off disk. Absent is not malformed; a malformed field
   costs the field, never the object (docs/load-bearing.md:342). */
module.exports = async function (ok, F) {
  const R = F.record ?? {}
  if (typeof R.parseShapeRecord !== 'function' || typeof R.parseConnectors !== 'function') {
    ok('flowchart.record.0 the record module exports parseShapeRecord and parseConnectors', false, Object.keys(R).join(','))
    return
  }
  const w = []
  const bare = R.parseShapeRecord({ form: 'process' }, w, 'p1')
  ok('flowchart.record.1 a shape with only a form parses to that form and an empty label, and warns nothing',
    bare !== null && bare.form === 'process' && bare.text === '' && !('fill' in bare) && !('stroke' in bare) && !('ink' in bare) && w.length === 0, JSON.stringify({ bare, w }))

  const w2 = []
  const bad = R.parseShapeRecord({ form: 'decision', text: 7, fill: 'magenta', stroke: 'iris', ink: 'loud' }, w2, 'p2')
  ok('flowchart.record.2 a malformed text or style field costs THAT field and warns; the shape and its good fields survive',
    bad !== null && bad.form === 'decision' && bad.text === '' && bad.stroke === 'iris' && !('fill' in bad) && !('ink' in bad) && w2.length === 3, JSON.stringify({ bad, w2 }))

  const w3 = []
  const gone = [R.parseShapeRecord({ form: 'hexagon' }, w3, 'p3'), R.parseShapeRecord(undefined, w3, 'p4'), R.parseShapeRecord([], w3, 'p5')]
  ok('flowchart.record.3 an unknown form, a missing record and a non-record each drop the shape BY NAME (there is nothing to draw)',
    gone.every((g) => g === null) && w3.length === 3 && w3.every((m) => /p[345]/.test(m)), JSON.stringify(w3))

  const long = R.parseShapeRecord({ form: 'process', text: 'a\n'.repeat(20) + 'x'.repeat(900) }, [], 'p6')
  ok('flowchart.record.4 a label is capped at eight lines and SHAPE_MAX_CHARS, with no trailing whitespace',
    long !== null && long.text.split('\n').length <= 8 && long.text.length <= R.SHAPE_MAX_CHARS && !/\s$/.test(long.text), JSON.stringify(long && long.text.length))

  const w4 = []
  ok('flowchart.record.5 absent connectors are undefined and warn nothing — every panel ever written has none',
    R.parseConnectors(undefined, w4, 'a') === undefined && w4.length === 0)

  const w5 = []
  const cs = R.parseConnectors([
    { id: 'cx1', to: 'b' },
    { id: 'cx2', to: 'c', from: 'e', toPort: 'w', route: 'curved', ends: 'both', label: '  yes  ', stroke: 'violet', dashed: true },
    { id: 'cx3', to: 'c', route: 'zigzag', ends: 'sideways', from: 'up' },
    { id: 'cx1', to: 'd' },
    { id: 'cx4', to: 'a' },
    { to: 'e' },
    'nope'
  ], w5, 'a')
  ok('flowchart.record.6 each connector is judged alone: good fields kept, a malformed field costs the field, a duplicate id, a self-connector, an id-less entry and a non-record are dropped BY NAME',
    Array.isArray(cs) && cs.length === 3 && cs[0].id === 'cx1' && Object.keys(cs[0]).length === 2 &&
      cs[1].label === 'yes' && cs[1].from === 'e' && cs[1].toPort === 'w' && cs[1].route === 'curved' && cs[1].ends === 'both' && cs[1].stroke === 'violet' && cs[1].dashed === true &&
      cs[2].id === 'cx3' && !('route' in cs[2]) && !('ends' in cs[2]) && !('from' in cs[2]) && w5.length === 3 + 4, JSON.stringify({ cs, w5 }))

  const many = R.parseConnectors(Array.from({ length: R.CONNECTORS_MAX + 5 }, (_, i) => ({ id: `cx${i}`, to: `t${i}` })), [], 'a')
  ok('flowchart.record.7 a panel holds at most CONNECTORS_MAX connectors — a hostile file cannot make a render loop of a million paths',
    many.length === R.CONNECTORS_MAX)

  ok('flowchart.record.8 every form has a mint size at or above the resize floor, and a summary that is never empty',
    R.SHAPE_FORMS.every((f) => R.SHAPE_SIZE[f].w >= R.SHAPE_MIN.w && R.SHAPE_SIZE[f].h >= R.SHAPE_MIN.h && R.shapeSummary('', f).length > 0 && R.shapeSummary('  \n  ', f).startsWith('an empty')))
}
