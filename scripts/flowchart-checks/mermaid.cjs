/* verify:flowchart — Mermaid in and out (src/shared/flowchart-mermaid.ts). The
   text is UNTRUSTED (an agent may have written it), so every property here is
   one that fails SILENTLY: a dropped `click` that was not counted, a shape
   that quietly became a process, a label that lost its quote, a round trip
   that turned `#35;` into `#`, a 200KB line that hangs the renderer. None of
   those throws; each reads as an import that worked. */
module.exports = async function (ok, F) {
  const M = F.mermaid ?? {}
  const API = ['parseMermaid', 'serializeMermaid', 'mermaidImportSentence', 'looksLikeMermaid', 'mermaidIds']
  if (API.some((k) => typeof M[k] !== 'function')) {
    ok('flowchart.mermaid.0 the mermaid module exports parseMermaid, serializeMermaid, mermaidImportSentence, looksLikeMermaid and mermaidIds', false, Object.keys(M).join(','))
    return
  }
  const R = F.record ?? {}
  const EMPTY = { direction: 'TB', nodes: [], edges: [], groups: [] }
  /* A refusal becomes an empty ok-shaped result carrying `refusedBecause`, so a
     check that expected an import fails on its own condition instead of throwing
     and taking the whole area with it. */
  const P = (text) => {
    const r = M.parseMermaid(text)
    return r.kind === 'ok' ? r : { kind: 'refused', reason: r.reason, graph: EMPTY, dropped: [], approximated: [] }
  }
  const HEAD = 'flowchart TD\n'
  const ids = (g) => g.nodes.map((n) => n.id)
  const node = (g, id) => g.nodes.find((n) => n.id === id)
  const show = (v) => JSON.stringify(v)
  const edgeKey = (e) => `${e.from}>${e.to}|${e.label ?? ''}|${e.ends}|${e.dashed ? 'dashed' : 'solid'}`

  // ── shapes ────────────────────────────────────────────────────────────────
  const BRACKET = [
    ['A[t]', 'process', 't', 0], ['A(t)', 'terminator', 't', 0], ['A([t])', 'terminator', 't', 0], ['A((t))', 'terminator', 't', 0],
    ['A(( ))', 'junction', '', 0], ['A((""))', 'junction', '', 0], ['A(((t)))', 'terminator', 't', 1], ['A{t}', 'decision', 't', 0],
    ['A{{t}}', 'process', 't', 1], ['A[/t/]', 'io', 't', 0], ['A[\\t\\]', 'io', 't', 0], ['A[/t\\]', 'process', 't', 1],
    ['A[\\t/]', 'process', 't', 1], ['A[[t]]', 'subprocess', 't', 0], ['A[(t)]', 'document', 't', 1], ['A>t]', 'process', 't', 1],
    ['A["quoted ] text"]', 'process', 'quoted ] text', 0], ['A[ spaced ]', 'process', 'spaced', 0]
  ]
  const bad1 = BRACKET.filter(([src, form, text, approx]) => {
    const r = P(HEAD + src)
    const n = r.graph.nodes[0]
    return !(r.kind === 'ok' && r.graph.nodes.length === 1 && n.id === 'A' && n.form === form && n.text === text &&
      n.w === R.SHAPE_SIZE[form].w && n.h === R.SHAPE_SIZE[form].h && r.approximated.length === approx && r.dropped.length === 0)
  }).map(([src]) => src)
  ok('flowchart.mermaid.1 every bracket shape maps to its form (and takes its size from SHAPE_SIZE), and a shape that loses meaning is recorded as approximated — a hexagon that silently became a process draws a diagram that lies about its decisions',
    bad1.length === 0, bad1.join(' '))

  const V11 = [
    [['rect', 'proc', 'process', 'rounded', 'event'], 'process', 0], [['stadium', 'terminal', 'pill'], 'terminator', 0], [['circle', 'circ'], 'terminator', 0],
    [['sm-circ', 'small-circle', 'start', 'stop', 'junction', 'f-circ', 'filled-circle'], 'junction', 0], [['diam', 'decision', 'diamond', 'question'], 'decision', 0],
    [['lean-r', 'lean-right', 'in-out', 'lean-l', 'lean-left', 'out-in'], 'io', 0], [['subproc', 'subprocess', 'subroutine', 'fr-rect', 'framed-rectangle'], 'subprocess', 0],
    [['doc', 'document', 'docs', 'documents', 'st-doc'], 'document', 0], [['cyl', 'database', 'db'], 'document', 1], [['text'], 'text', 0], [['hex', 'hexagon', 'prepare'], 'process', 1]
  ]
  const bad2 = []
  for (const [names, form, approx] of V11) {
    for (const name of names) {
      // A junction shape carries no label of its own; every other shape wears the label it was given.
      const variants = form === 'junction'
        ? [`A@{ shape: ${name} }`, `A@{shape:${name}}`, `A@{ shape: "${name}" }`]
        : [`A@{ shape: ${name}, label: "lab" }`, `A@{ label: "lab", shape: ${name} }`, `A@{shape:${name},label:lab}`]
      for (const v of variants) {
        const r = P(HEAD + v)
        const n = r.graph.nodes[0]
        if (!(r.kind === 'ok' && n && n.form === form && n.text === (form === 'junction' ? '' : 'lab') && r.approximated.length === approx && r.dropped.length === 0)) bad2.push(v)
      }
    }
  }
  const odd = P(HEAD + 'A@{ shape: zigzag-thing, label: "z" }')
  const noLabel = P(HEAD + 'A@{ shape: rect }\nB@{ shape: circle }\nC@{ shape: circle, label: "" }\nD@{ shape: text }')
  const props = P(HEAD + 'e1@{ animate: true }\nA --> B')
  ok('flowchart.mermaid.2 every Mermaid v11 @{ shape: … } name maps to its form in any key order with quoted or bare values; an unknown name is a process whose note NAMES it; an unlabelled circle wears its id and an empty one is a junction; an edge-property block is not a node',
    bad2.length === 0 && odd.graph.nodes[0].form === 'process' && odd.approximated.length === 1 && odd.approximated[0].reason.includes('zigzag-thing') &&
      show(noLabel.graph.nodes.map((n) => [n.form, n.text])) === show([['process', 'A'], ['terminator', 'B'], ['junction', ''], ['text', 'D']]) &&
      props.dropped.length === 1 && props.dropped[0].line === 2 && !ids(props.graph).includes('e1'),
    show({ bad2, odd: odd.approximated, noLabel: noLabel.graph.nodes, props: props.dropped }))

  const bare = P(HEAD + 'A --> B\nA[Shaped]\nA\nB{Q}\nB{Q}\nB[Other]')
  const a = node(bare.graph, 'A')
  const b = node(bare.graph, 'B')
  const twice = P(HEAD + 'X[one]\nX[two]\nX[one]')
  const order = P(HEAD + 'Z --> Y\nY[late]\nZ')
  ok('flowchart.mermaid.3 a node referenced bare wears its id; the FIRST declaration with a shape wins even after bare mentions, a bare mention never resets it, and only a DIFFERENT redeclaration is recorded ("declared twice") — a later line must not silently redraw a decision as a box',
    a.form === 'process' && a.text === 'Shaped' && b.form === 'decision' && b.text === 'Q' && bare.approximated.length === 1 && /twice/.test(bare.approximated[0].reason) && bare.approximated[0].line === 7 &&
      twice.graph.nodes.length === 1 && twice.graph.nodes[0].text === 'one' && twice.approximated.length === 1 &&
      show(ids(order.graph)) === show(['Z', 'Y']) && node(order.graph, 'Y').text === 'late',
    show({ bare: bare.graph.nodes, approx: bare.approximated, twice: twice.approximated, order: order.graph.nodes }))

  // ── what is never imported ────────────────────────────────────────────────
  const smuggle = P(HEAD + 'A[Start] --> B\nclick A callback "tip"\nclick B href "javascript:alert(1)" _blank\nB --> C')
  const smuggled = show(smuggle.graph)
  ok('flowchart.mermaid.4 a click directive is dropped and COUNTED, never kept — an agent’s diagram cannot smuggle a callback or a javascript: link',
    smuggle.dropped.length === 2 && smuggle.dropped[0].line === 3 && smuggle.dropped[1].line === 4 && smuggle.dropped.every((d) => /^click/.test(d.text) && /click/.test(d.reason)) &&
      !/callback|javascript|href|alert/.test(smuggled) && smuggle.graph.edges.length === 2 && smuggle.graph.nodes.length === 3,
    show(smuggle.dropped))

  const DIRECTIVES = ['style A fill:#f9f,stroke:#333', 'classDef big fill:#f96', 'class A big', 'linkStyle 0 stroke:red', 'callback A "fn"', 'accTitle: A title', 'accDescr: a description',
    'href A "http://x"', 'call fn()', 'CLASSDEF Loud fill:red', 'Style B fill:red']
  const dr = P(HEAD + 'A --> B\n' + DIRECTIVES.join('\n') + '\nsubgraph s\n direction LR\n C\nend')
  const dropsByLine = dr.dropped.map((d) => d.line)
  const accBlock = P(HEAD + 'A\naccDescr {\n  A --> Z\n  hidden shape\n}\nB')
  ok('flowchart.mermaid.5 style, classDef, class, linkStyle, callback, accTitle, accDescr (one line and a block), href, call and direction are each dropped and counted with their own line number, in any letter case, and never reach the graph — including the shapes hiding inside an accDescr block',
    dr.dropped.length === DIRECTIVES.length + 1 && dr.dropped.every((d) => d.reason !== 'not understood') && dropsByLine.join() === Array.from({ length: DIRECTIVES.length }, (_, i) => i + 3).concat([DIRECTIVES.length + 4]).join() &&
      show(ids(dr.graph)) === show(['A', 'B', 'C']) && dr.graph.edges.length === 1 &&
      show(ids(accBlock.graph)) === show(['A', 'B']) && accBlock.dropped.length === 4 && accBlock.dropped[0].line === 3,
    show({ dropsByLine, ids: ids(dr.graph), acc: accBlock.dropped }))

  const cls = P(HEAD + 'A[Start]:::hot --> B:::cold\nC:::x')
  ok('flowchart.mermaid.6 a :::className is stripped from the node and counted as a drop ("class styling is not imported"), and the node and its edge still import',
    show(ids(cls.graph)) === show(['A', 'B', 'C']) && node(cls.graph, 'A').text === 'Start' && cls.graph.edges.length === 1 &&
      cls.dropped.length === 3 && cls.dropped.every((d) => d.reason === 'class styling is not imported') && cls.dropped[0].line === 2 && cls.dropped[2].line === 3,
    show(cls.dropped))

  const junk = P(HEAD + 'A --> B\n  this is not mermaid at all  \n-->\nA[unclosed\n' + 'C'.repeat(150) + '(((\nD; E[ok]; ][')
  const longLine = P(HEAD + 'A\n' + 'x'.repeat(11000) + '\nB')
  ok('flowchart.mermaid.7 a line that parses as nothing is dropped as "not understood" with its line number and its text trimmed and capped at 120; one bad statement never costs the good statements beside it; a statement over 10,000 characters is dropped, not read',
    junk.dropped.length >= 5 && junk.dropped[0].line === 3 && junk.dropped[0].text === 'this is not mermaid at all' && junk.dropped.every((d) => /not understood/.test(d.reason) && d.text.length <= 120) &&
      junk.dropped.some((d) => d.text.length === 120) && show(ids(junk.graph)) === show(['A', 'B', 'D', 'E']) && node(junk.graph, 'E').text === 'ok' &&
      show(ids(longLine.graph)) === show(['A', 'B']) && longLine.dropped.length === 1 && longLine.dropped[0].line === 3 && /10,000/.test(longLine.dropped[0].reason) && longLine.dropped[0].text.length === 120,
    show({ junk: junk.dropped.map((d) => [d.line, d.text.length, d.reason.slice(0, 20)]), long: longLine.dropped.map((d) => [d.line, d.text.length, d.reason]) }))

  // ── labels ────────────────────────────────────────────────────────────────
  const LABELS = [
    ['A["plain quoted"]', 'plain quoted', 0], ['A["`markdown *text*`"]', 'markdown *text*', 0], ['A["one<br>two<br/>three<br />four<BR>five"]', 'one\ntwo\nthree\nfour\nfive', 0],
    ['A["say #quot;hi#quot; #amp; #lt;b#gt; #35;1 #65;#x42;"]', 'say "hi" & <b> #1 AB', 0], ['A[say #quot;hi#quot;]', 'say "hi"', 0],
    ['A["<b>bold</b> and <i>it</i>"]', 'bold and it', 1], ['A["#lt;script#gt;alert(1)#lt;/script#gt;"]', '<script>alert(1)</script>', 0], ['A["a; b"]', 'a; b', 0],
    ['A["a %% b"]', 'a %% b', 0], ['A["unknown #nope; entity #99999999999;"]', 'unknown #nope; entity #99999999999;', 0], ['A["ctrl #0;#7; ok"]', 'ctrl #0;#7; ok', 0],
    ['A["' + 'w'.repeat(700) + '"]', 'w'.repeat(500), 0], ['A["l1<br>l2<br>l3<br>l4<br>l5<br>l6<br>l7<br>l8<br>l9<br>l10"]', 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8', 0],
    ['A["x < y and y > z"]', 'x < y and y > z', 0]
  ]
  const bad7 = LABELS.filter(([src, text, approx]) => {
    const r = P(HEAD + src)
    return !(r.kind === 'ok' && r.graph.nodes.length === 1 && r.graph.nodes[0].text === text && r.approximated.length === approx && r.dropped.length === 0)
  }).map(([src]) => src.slice(0, 50))
  const tags2 = P(HEAD + 'A["<b>x</b> <i>y</i> <span class=z>w</span>"]')
  ok('flowchart.mermaid.8 labels decode as Mermaid does — quotes and markdown backticks off, <br> variants to newlines, #name; and #NNN; entities decoded once and in one pass, tags stripped BEFORE entities (so #lt;b#gt; stays literal text, never becomes a tag), other HTML stripped and recorded once per label, capped at 500 characters and eight lines',
    bad7.length === 0 && tags2.graph.nodes[0].text === 'x y w' && tags2.approximated.length === 1, show({ bad7, tags2: tags2.approximated }))

  // ── connectors ────────────────────────────────────────────────────────────
  const OPS = [
    ['-->', 'end', 0, 0], ['---', 'none', 0, 0], ['<-->', 'both', 0, 0], ['-.->', 'end', 1, 0], ['-.-', 'none', 1, 0], ['==>', 'end', 0, 1], ['===', 'none', 0, 1],
    ['--o', 'end', 0, 1], ['--x', 'end', 0, 1], ['o--o', 'both', 0, 1], ['x--x', 'both', 0, 1], ['--->', 'end', 0, 0], ['---->', 'end', 0, 0], ['-..->', 'end', 1, 0],
    ['====>', 'end', 0, 1], ['<-.->', 'both', 1, 0], ['<==>', 'both', 0, 1], ['-...-', 'none', 1, 0], ['----', 'none', 0, 0]
  ]
  const bad8 = []
  for (const [op, ends, dashed, approx] of OPS) {
    for (const src of [`A ${op} B`, `A${op}B`].filter((s) => !/[ox]$/.test(op) || s.includes(' '))) {
      const r = P(HEAD + src)
      const e = r.graph.edges[0]
      if (!(r.kind === 'ok' && r.graph.edges.length === 1 && e.from === 'A' && e.to === 'B' && e.ends === ends && !!e.dashed === !!dashed && r.approximated.length === approx && r.dropped.length === 0 && r.graph.nodes.length === 2)) bad8.push(src)
    }
  }
  const invisible = P(HEAD + 'A ~~~ B')
  ok('flowchart.mermaid.9 every arrow kind maps to ends and dashed (longer variants are the same kind), thick lines and circle/cross heads are recorded as approximated, and an invisible link is a counted drop with no edge — a connector that lost its arrowhead must not look like the diagram said so',
    bad8.length === 0 && invisible.graph.edges.length === 0 && invisible.graph.nodes.length === 2 && invisible.dropped.length === 1, show({ bad8, inv: invisible.dropped }))

  const LABELLED = [
    ['A -->|yes| B', 'yes', 'end', false, 0], ['A -- yes --> B', 'yes', 'end', false, 0], ['A -. yes .-> B', 'yes', 'end', true, 0], ['A == yes ==> B', 'yes', 'end', false, 1],
    ['A ---|yes| B', 'yes', 'none', false, 0], ['A -.-|yes| B', 'yes', 'none', true, 0], ['A -- yes --- B', 'yes', 'none', false, 0], ['A -- "a --> b" --> B', 'a --> b', 'end', false, 0],
    ['A -->|"a|b"| B', 'a|b', 'end', false, 0], ['A -- well-formed --> B', 'well-formed', 'end', false, 0], ['A -->|  padded  | B', 'padded', 'end', false, 0],
    ['A -->|a#quot;b#quot; #lt;c#gt;| B', 'a"b" <c>', 'end', false, 0], ['A -- e.g. this. --> B', 'e.g. this.', 'end', false, 0], ['A -->|"x;y"| B', 'x;y', 'end', false, 0],
    ['A <-->|both| B', 'both', 'both', false, 0], ['A -- "quoted" -.- B', undefined, 'end', false, 0]
  ]
  const bad9 = LABELLED.filter(([src, label, ends, dashed, approx]) => {
    const r = P(HEAD + src)
    const e = r.graph.edges[0]
    // The last row is the malformed one: not an arrow the importer reads, so it must be a counted drop.
    if (label === undefined) return !(r.graph.edges.length === 0 && r.dropped.length === 1)
    return !(r.kind === 'ok' && r.graph.edges.length === 1 && e.label === label && e.ends === ends && !!e.dashed === dashed && r.approximated.length === approx && r.dropped.length === 0)
  }).map(([src]) => src)
  const longLabel = P(HEAD + 'A -->|' + 'w'.repeat(300) + '| B').graph.edges[0]
  const emptyLabel = P(HEAD + 'A -->|| B').graph.edges[0]
  ok('flowchart.mermaid.10 every edge-label syntax reads (|t|, -- t -->, -. t .->, == t ==>, ---|t|), quoted labels may hold the terminator characters, entities decode, a label is trimmed and capped at CONNECTOR_LABEL_MAX and an empty one is no label — a connector that lost its "yes"/"no" reads as an unlabelled decision',
    bad9.length === 0 && longLabel.label.length === R.CONNECTOR_LABEL_MAX && !('label' in emptyLabel), show({ bad9, long: longLabel.label.length, emptyLabel }))

  const chain = P(HEAD + 'A --> B --> C\nD & E --> F & G\nH --> I & J --> K\nL e1@--> M\nN e2@==> O')
  ok('flowchart.mermaid.11 a chain makes one edge per hop, A & B --> C & D makes the four-edge cross product in order, a fan in the middle of a chain multiplies both hops, and a v11 edge id (e1@-->) is stripped, never made a node',
    show(chain.graph.edges.map((e) => `${e.from}>${e.to}`)) === show(['A>B', 'B>C', 'D>F', 'D>G', 'E>F', 'E>G', 'H>I', 'H>J', 'I>K', 'J>K', 'L>M', 'N>O']) &&
      show(ids(chain.graph)) === show(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']) && chain.dropped.length === 0 && chain.approximated.length === 1,
    show({ edges: chain.graph.edges.map((e) => `${e.from}>${e.to}`), ids: ids(chain.graph), dropped: chain.dropped }))

  // ── subgraphs ─────────────────────────────────────────────────────────────
  const sg = P(HEAD + 'A\nsubgraph one [First "group"]\n B --> C\nend\nsubgraph two["Second"]\n D\nend\nsubgraph "Quoted title"\n E\nend\nsubgraph Words without id\n F\nend\nsubgraph bare\n G\nend\nA --> B')
  const groupsOf = (r) => r.graph.groups.map((g) => `${g.id}:${g.label}:${g.nodes.join(',')}`)
  ok('flowchart.mermaid.12 every subgraph form (id [title], id["title"], "title", bare words, bare id) becomes a group with its members; a node belongs to the group it was FIRST mentioned in, and an edge outside a subgraph never moves it',
    show(groupsOf(sg)) === show(['one:First "group":B,C', 'two:Second:D', 'sg1:Quoted title:E', 'sg2:Words without id:F', 'bare:bare:G']) && sg.dropped.length === 0 && sg.approximated.length === 0 && show(ids(sg.graph)) === show(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
    show(groupsOf(sg)))

  const nest = P(HEAD + 'subgraph outer\n A\n subgraph inner\n  B\n  A\n end\n C\nend\nsubgraph open\n D\n direction LR\n')
  const unclosed = nest.approximated
  ok('flowchart.mermaid.13 nested subgraphs are flattened to the innermost group and recorded as approximated; an unclosed subgraph closes at the end of the text and says so; direction inside a subgraph is a counted drop — nesting that vanished without a word looks like a diagram with no structure',
    show(groupsOf(nest)) === show(['outer:outer:A,C', 'inner:inner:B', 'open:open:D']) && unclosed.length === 2 && /nested/.test(unclosed[0].reason) && unclosed[0].line === 4 && /never closed/.test(unclosed[1].reason) && unclosed[1].line === 10 &&
      nest.dropped.length === 1 && nest.dropped[0].line === 12 && /direction/.test(nest.dropped[0].reason),
    show({ groups: groupsOf(nest), approx: unclosed, dropped: nest.dropped }))

  const toGroup = P(HEAD + 'A --> later\nsubgraph early [E]\n B\nend\nsubgraph later [L]\n C\nend\nA --> early\nearly --> later\nB --> C\nA --> B')
  ok('flowchart.mermaid.14 an edge to a subgraph (declared before OR after the edge) is dropped with a reason and never becomes a phantom node named after the group; the other edges import',
    show(ids(toGroup.graph)) === show(['A', 'B', 'C']) && show(toGroup.graph.edges.map((e) => `${e.from}>${e.to}`)) === show(['B>C', 'A>B']) && toGroup.dropped.length === 3 && toGroup.dropped.every((d) => /subgraph/.test(d.reason)),
    show({ ids: ids(toGroup.graph), dropped: toGroup.dropped }))

  // ── the text around the statements ────────────────────────────────────────
  const around = P('\r\n%% a comment first\r\n---\r\ntitle: "  Quoted \\"Title\\" "\r\nconfig:\r\n  theme: dark\r\n---\r\n%%{init: {"theme":"dark"}}%%\r\ngraph RL;\r\nA[x] --> B; C --> D %% trailing comment\r\n%% whole line\r\nE\r\nclick A x\r\n')
  ok('flowchart.mermaid.15 blank lines, %% comments (never counted) and a front-matter block may precede the header, the front-matter title is kept, ; and newlines both end a statement, CRLF works, and a dropped line keeps its true 1-based line number',
    around.kind === 'ok' && around.title === 'Quoted "Title"' && around.graph.direction === 'RL' && show(ids(around.graph)) === show(['A', 'B', 'C', 'D', 'E']) &&
      around.graph.edges.length === 2 && around.dropped.length === 1 && around.dropped[0].line === 13,
    show({ title: around.title, dir: around.graph.direction, ids: ids(around.graph), dropped: around.dropped }))

  const dirs = ['flowchart', 'flowchart TD', 'flowchart TB', 'graph BT', 'graph LR;', 'flowchart RL', 'graph TD; A --> B'].map((h) => P(h + '\nA --> B').graph.direction)
  const sameLine = P('graph TD; A --> B; B --> C')
  ok('flowchart.mermaid.16 the header sets the direction (TD is TB, none is TB) and statements may follow it on the same line',
    show(dirs) === show(['TB', 'TB', 'TB', 'BT', 'LR', 'RL', 'TB']) && sameLine.graph.edges.length === 2, show({ dirs, same: sameLine.graph.edges.length }))

  // ── refusals and bounds ───────────────────────────────────────────────────
  const REFUSE = [['sequenceDiagram\n  A->>B: hi', /sequenceDiagram/], ['classDiagram\n  A <|-- B', /classDiagram/], ['pie title x\n "a": 1', /pie/], ['stateDiagram-v2\n [*] --> A', /stateDiagram-v2/],
    ['', /empty/], ['   \n\n  \n', /empty/], ['%% only a comment', /empty/], ['Hello there, this is prose.', /not a flowchart/], ['---\ntitle: never closed\nflowchart TD', /front matter/], ['graphviz {}', /not a flowchart/]]
  const badRefuse = REFUSE.filter(([text, re]) => { const r = M.parseMermaid(text); return !(r.kind === 'refused' && re.test(r.reason) && r.reason.length > 8 && !('graph' in r)) }).map(([t]) => t.slice(0, 20))
  ok('flowchart.mermaid.17 anything that is not a flowchart — another diagram type, empty, only comments, prose, an unclosed front matter — is refused with a sentence that names what it is, never an empty graph that reads as a successful import',
    badRefuse.length === 0 && M.parseMermaid(HEAD).kind === 'ok', show(badRefuse))

  const many = (n, make) => HEAD + Array.from({ length: n }, (_, i) => make(i)).join('\n')
  const r500 = M.parseMermaid(many(500, (i) => `n${i}`))
  const r501 = M.parseMermaid(many(501, (i) => `n${i}`))
  const e1500 = M.parseMermaid(HEAD + 'A\n' + Array.from({ length: 1500 }, () => 'A --> A').join('\n'))
  const e1501 = M.parseMermaid(HEAD + 'A\n' + Array.from({ length: 1501 }, () => 'A --> A').join('\n'))
  const tooBig = M.parseMermaid(HEAD + 'A[' + 'x'.repeat(200000) + ']')
  const t0 = performance.now()
  const fan = M.parseMermaid(HEAD + Array.from({ length: 200 }, (_, i) => `a${i}`).join(' & ') + ' --> ' + Array.from({ length: 200 }, (_, i) => `b${i}`).join(' & '))
  const fanMs = performance.now() - t0
  ok('flowchart.mermaid.18 the bounds hold exactly: 200,000 characters, 500 shapes and 1,500 connectors import, one more of any is REFUSED with a reason; an a1 & … --> b1 & … fan is refused BEFORE its cross product is built — a hostile file cannot make the canvas render a hundred thousand paths',
    r500.kind === 'ok' && r500.graph.nodes.length === 500 && r501.kind === 'refused' && /500/.test(r501.reason) && e1500.kind === 'ok' && e1500.graph.edges.length === 1500 && e1501.kind === 'refused' && /1500/.test(e1501.reason) &&
      tooBig.kind === 'refused' && /200,000/.test(tooBig.reason) && fan.kind === 'refused' && /1500/.test(fan.reason) && fanMs < 300,
    show({ r501: r501.reason, e1501: e1501.reason, big: tooBig.reason, fan: fan.reason, fanMs }))

  const pathological = {
    'an unclosed shape 190,000 characters long': HEAD + 'A[' + 'x'.repeat(190000),
    'a line of 50,000 dashes': HEAD + 'A ' + '-'.repeat(50000) + ' B',
    '20 statements of 9,900 [ each': HEAD + Array.from({ length: 20 }, () => 'A' + '['.repeat(9900)).join('\n'),
    '20 label-form arrows that never end': HEAD + Array.from({ length: 20 }, () => 'A --' + ' x'.repeat(4900)).join('\n'),
    '20 statements of 4,900 "<a" tags': HEAD + Array.from({ length: 20 }, () => 'A["' + '<a'.repeat(4900) + '"]').join('\n'),
    '20 statements of hash and ampersand runs': HEAD + Array.from({ length: 20 }, () => 'A["' + '#a&'.repeat(3200) + '"]').join('\n'),
    '20 statements of & fans': HEAD + Array.from({ length: 20 }, () => 'A' + ' & A'.repeat(2400)).join('\n'),
    '20 statements of unclosed quotes and pipes': HEAD + Array.from({ length: 20 }, () => 'A -->|"' + '|"'.repeat(4900)).join('\n'),
    '20 statements of dotted runs': HEAD + Array.from({ length: 20 }, () => 'A -' + '.'.repeat(9900)).join('\n')
  }
  const slow = []
  for (const [name, text] of Object.entries(pathological)) {
    const t1 = performance.now()
    const r = M.parseMermaid(text)
    const ms = performance.now() - t1
    if (!(ms < 300 && text.length <= 200000 && (r.kind === 'ok' || r.kind === 'refused'))) slow.push(`${name}: ${ms.toFixed(0)}ms`)
  }
  ok('flowchart.mermaid.19 a pathological input of up to 200KB — an unclosed shape, a 50,000-dash line, thousands of brackets, unterminated label arrows, tag and entity runs, & fans, unbalanced quotes — is answered in under 300ms: the reader is one left-to-right pass, not a backtracking regex, so a hostile paste cannot hang the renderer',
    slow.length === 0, slow.join('; '))

  // ── serializing ───────────────────────────────────────────────────────────
  const N = (id, form, text) => ({ id, form, text, w: R.SHAPE_SIZE[form].w, h: R.SHAPE_SIZE[form].h })
  const hostile = { direction: 'LR', nodes: [N('end', 'process', 'a'), N('class', 'process', 'b'), N('3rd', 'process', 'c'), N('a b', 'process', 'd'), N('n1', 'process', 'e'), N('ok_1', 'process', 'f'), N('CLASSDEF', 'process', 'g'), N('ünï', 'process', 'h'), N('', 'process', 'i'), N('ok_1', 'process', 'dup')], edges: [] }
  const idMap = M.mermaidIds(hostile)
  const written = hostile.nodes.map((n) => idMap.get(n.id))
  const safe = /^[A-Za-z][A-Za-z0-9_]*$/
  const KEY = ['end', 'subgraph', 'graph', 'flowchart', 'click', 'style', 'class', 'classdef', 'linkstyle', 'direction', 'default']
  ok('flowchart.mermaid.20 ids are made safe on the way out — a keyword (end, class, CLASSDEF…), a leading digit, a space, a non-ASCII or empty id becomes n1, n2… in node order; a safe id is kept, a minted id never collides with a kept one, the same graph always writes the same ids, and the written text re-imports with those exact ids',
    show(written.slice(0, 9)) === show(['n2', 'n3', 'n4', 'n5', 'n1', 'ok_1', 'n6', 'n7', 'n8']) && written.every((w) => safe.test(w) && !KEY.includes(w.toLowerCase())) && idMap.size === 9 &&
      M.serializeMermaid(hostile) === M.serializeMermaid(JSON.parse(JSON.stringify(hostile))) &&
      show(ids(P(M.serializeMermaid(hostile)).graph)) === show(['n2', 'n3', 'n4', 'n5', 'n1', 'ok_1', 'n6', 'n7', 'n8']),
    show(written))

  const tiny = {
    direction: 'BT',
    nodes: [N('a', 'process', 'Step'), N('b', 'terminator', 'Go'), N('c', 'decision', 'Ok?'), N('d', 'io', 'In'), N('e', 'subprocess', 'Sub'), N('f', 'document', 'Doc'), N('g', 'junction', ''), N('h', 'text', 'Note')],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', ends: 'none' }, { from: 'c', to: 'd', ends: 'both', label: 'yes' }, { from: 'd', to: 'e', ends: 'end', dashed: true }, { from: 'e', to: 'f', ends: 'none', dashed: true },
      { from: 'f', to: 'g', ends: 'start', label: 'back' }, { from: 'g', to: 'h', ends: 'both', dashed: true }],
    groups: [{ id: 'grp', label: 'The "group"', nodes: ['c', 'd'] }]
  }
  const text = M.serializeMermaid(tiny, { title: 'My "chart"' })
  const lines = text.split('\n').map((l) => l.trim())
  const EXPECT = ['---', 'title: "My \\"chart\\""', '---', 'flowchart BT', 'a["Step"]', 'b(["Go"])', 'subgraph grp ["The #quot;group#quot;"]', 'c{"Ok?"}', 'd[/"In"/]', 'end', 'e[["Sub"]]', 'f@{ shape: doc, label: "Doc" }', 'g(( ))', 'h@{ shape: text, label: "Note" }',
    'a --> b', 'b --- c', 'c <-->|"yes"| d', 'd -.-> e', 'e -.- f', 'g -->|"back"| f', 'g <-.-> h']
  ok('flowchart.mermaid.21 the written text is exact: front-matter title, header direction, one declaration per node per form (documents and text in the v11 form, an unlabelled junction as a bare circle), nodes declared once inside their group, then edges — ends none/both/dashed as their operators, and ends "start" as the REVERSED arrow because Mermaid has no single reversed head',
    show(lines) === show(EXPECT), lines.join(' ⏎ '))

  const NASTY = ['a"b', 'x < y > z <b>t</b>', 'two\nlines\rthree', '# and #35; and #quot; and #1 and #a;', '`code`', '`', '<br> is text here', '%% ; | & [] {} ()', '\\ / \\']
  const nasty = { direction: 'TB', nodes: NASTY.map((t, i) => N(`n${i}`, i % 2 ? 'process' : 'decision', t)), edges: NASTY.map((t, i) => ({ from: 'n0', to: `n${i}`, label: t.trim() })) }
  const nastyText = M.serializeMermaid(nasty)
  const rawAngles = nastyText.replace(/<br\/>|-->/g, '').match(/[<>]/g)
  const nastyLines = nastyText.split('\n')
  const nastyOut = P(nastyText)
  ok('flowchart.mermaid.22 text is encoded so nothing can break out of its quotes or turn into markup — " becomes #quot;, a newline <br/>, and never a raw < or > except that <br/>; # is escaped as #35; only where it would otherwise read as an entity ("#1" stays "#1"); a backtick-wrapped label is not turned into a markdown string on the way back',
    rawAngles === null && nastyLines.every((l) => (l.match(/"/g) || []).length % 2 === 0) && nastyText.includes('#35;35;') && nastyText.includes('#1 and') && !nastyText.includes('#35;1') && nastyText.includes('#lt;b#gt;') && nastyText.includes('#quot;') &&
      nastyOut.kind === 'ok' && nastyOut.dropped.length === 0 && nastyOut.approximated.length === 0 &&
      show(nastyOut.graph.nodes.map((n) => n.text)) === show(NASTY.map((t) => R.normaliseShapeText(t.replace(/\r\n?/g, '\n')))) &&
      show(nastyOut.graph.edges.map((e) => e.label)) === show(NASTY.map((t) => t.trim().replace(/\r\n?/g, '\n'))),
    show({ text: nastyText.slice(0, 400), out: nastyOut.graph.nodes.map((n) => n.text) }))

  // ── the round trip ────────────────────────────────────────────────────────
  /* parse(serialize(g)) must give g back: same shapes (form, text), same edges
     (from, to, label, ends, dashed — a 'start' arrow as the reversed 'end'), same
     groups, and NOTHING dropped or approximated. Returns the list of what differs. */
  const roundTripProblems = (g, title) => {
    const written = M.serializeMermaid(g, title === undefined ? undefined : { title })
    const r = M.parseMermaid(written)
    if (r.kind !== 'ok') return [`refused: ${r.reason}`]
    const problems = []
    if (r.dropped.length) problems.push(`dropped ${show(r.dropped[0])}`)
    if (r.approximated.length) problems.push(`approximated ${show(r.approximated[0])}`)
    if (r.graph.direction !== g.direction) problems.push(`direction ${r.graph.direction}`)
    if (title !== undefined && r.title !== title) problems.push(`title ${show(r.title)}`)
    const map = M.mermaidIds(g)
    const seen = new Set()
    const uniq = g.nodes.filter((n) => !seen.has(n.id) && seen.add(n.id))
    if (r.graph.nodes.length !== uniq.length) problems.push(`node count ${r.graph.nodes.length} vs ${uniq.length}`)
    for (const n of uniq) {
      const back = r.graph.nodes.find((p) => p.id === map.get(n.id))
      if (!back || back.form !== n.form || back.text !== n.text || back.w !== n.w || back.h !== n.h) problems.push(`node ${show(n.id)} ${show(n.text)} came back ${show(back)}`)
    }
    const want = g.edges.filter((e) => map.has(e.from) && map.has(e.to)).map((e) => {
      const rev = e.ends === 'start'
      return edgeKey({ from: map.get(rev ? e.to : e.from), to: map.get(rev ? e.from : e.to), label: e.label && e.label.trim() !== '' ? e.label : undefined, ends: rev ? 'end' : e.ends ?? 'end', dashed: e.dashed })
    })
    const got = r.graph.edges.map(edgeKey)
    if (show(want) !== show(got)) problems.push(`edges differ: ${show(want.filter((w, i) => w !== got[i]).slice(0, 2))} vs ${show(got.filter((w, i) => w !== want[i]).slice(0, 2))}`)
    // A node in two groups is declared once, in the first: the second group keeps only what the first did not claim.
    const claimed = new Set()
    const wantGroups = (g.groups ?? []).map((gr) => {
      const members = gr.nodes.filter((id) => map.has(id) && !claimed.has(id))
      members.forEach((id) => claimed.add(id))
      return `${gr.label}|${members.map((id) => map.get(id)).sort().join(',')}`
    }).sort()
    const gotGroups = r.graph.groups.map((gr) => `${gr.label}|${[...gr.nodes].sort().join(',')}`).sort()
    if (show(wantGroups) !== show(gotGroups)) problems.push(`groups differ: ${show(wantGroups)} vs ${show(gotGroups)}`)
    // A second write of what was read is the same text: the ids are stable, so a diagram can be re-exported forever without drifting.
    if (M.serializeMermaid(r.graph, title === undefined ? undefined : { title }) !== written) problems.push('a second serialization differs from the first')
    return problems
  }

  const FORMS = R.SHAPE_FORMS
  const ENDS = R.ENDS
  const WEIRD = ['Plain step', 'say "hi" twice', 'two\nlines', 'three\nlines\nhere', 'hash #1 and #35; and #quot; and #', '<b>bold</b> & <br> literal', 'semi; colon: pipe | [x] (y) {z}', '%% not a comment', 'héllo → ünï ✓', '`code`', '#', 'a#', '#quot', 'ends with backslash \\', '/slashes/ and \\back\\', '', 'x'.repeat(200), ' leading space', 'end', 'A --> B', 'click A callback']
  const POOL = ['start', 'end', 'Step 2', '3rd', 'a-b', 'class', 'n1', 'ok_1', 'ünï', 'default']
  const big = { direction: 'TB', nodes: [], edges: [], groups: [] }
  let k = 0
  for (const form of FORMS) {
    for (const t of WEIRD) {
      const id = k < POOL.length ? POOL[k] : `k${k}`
      big.nodes.push(N(id, form, form === 'junction' && t !== 'end' && k % 2 ? '' : R.normaliseShapeText(t)))
      k++
    }
  }
  const EDGE_LABELS = [undefined, 'yes', 'has "quote"', 'two\nlines', 'a|b', 'x #35; y', 'lt<gt>&', '-->', '`tick`', 'semi;colon']
  big.nodes.forEach((n, i) => {
    big.edges.push({ from: n.id, to: big.nodes[(i * 7 + 3) % big.nodes.length].id, ends: ENDS[i % ENDS.length], ...(i % 3 === 0 ? { dashed: true } : {}), ...(EDGE_LABELS[i % EDGE_LABELS.length] ? { label: EDGE_LABELS[i % EDGE_LABELS.length] } : {}) })
  })
  const gid = (i) => big.nodes[i].id
  big.groups = [
    { id: 'phase1', label: 'Phase "one"', nodes: Array.from({ length: 11 }, (_, i) => gid(10 + i)) },
    { id: 'end', label: 'Ünï <b> & #35;', nodes: Array.from({ length: 11 }, (_, i) => gid(40 + i)) },
    { id: 'has space', label: 'two\nlines', nodes: Array.from({ length: 11 }, (_, i) => gid(90 + i)) },
    { id: 'empty', label: '', nodes: [] }
  ]
  const bigProblems = []
  for (const direction of ['TB', 'BT', 'LR', 'RL']) bigProblems.push(...roundTripProblems({ ...big, direction }, direction === 'LR' ? 'A "titled" \\ chart' : undefined).map((p) => `${direction}: ${p}`))
  const allEnds = new Set(big.edges.map((e) => e.ends))
  ok('flowchart.mermaid.23 the round trip holds over every form, every ends value (start as the reversed end), dashed, labels with quotes / newlines / # / < / | / ;, keyword and spaced ids, groups (a keyword group id, a two-line label, an empty group) and a title: parse(serialize(g)) is ok with ZERO drops and ZERO approximations and gives the same shapes, connectors and groups — and a second serialization is byte-identical',
    bigProblems.length === 0 && big.nodes.length === FORMS.length * WEIRD.length && allEnds.size === 4 && FORMS.every((f) => big.nodes.some((n) => n.form === f)), bigProblems.slice(0, 4).join(' | '))

  // A fixed seed: a failure names a graph, and the same graph fails again.
  let seed = 0x2545f491
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
  const ALPHABET = ['a', 'B', '7', ' ', ' ', '"', '<', '>', '#', ';', '|', '&', '%', '\n', '[', ']', '(', ')', '{', '}', '\\', '/', '`', '-', '.', 'é', '→', 'x', 'q', ':', '=', '~', '@']
  const word = (max) => Array.from({ length: Math.floor(rnd() * max) }, () => pick(ALPHABET)).join('')
  const randomProblems = []
  for (let gi = 0; gi < 60 && randomProblems.length < 4; gi++) {
    const count = 1 + Math.floor(rnd() * 25)
    const g = { direction: pick(['TB', 'BT', 'LR', 'RL']), nodes: [], edges: [], groups: [] }
    for (let i = 0; i < count; i++) g.nodes.push(N(rnd() < 0.5 ? `id${i}` : `${word(6)}${i}`, pick(FORMS), R.normaliseShapeText(word(30))))
    for (let i = 0; i < Math.floor(rnd() * 40); i++) g.edges.push({ from: pick(g.nodes).id, to: pick(g.nodes).id, ends: pick(ENDS), ...(rnd() < 0.4 ? { dashed: true } : {}), ...(rnd() < 0.5 ? (() => { const l = word(20).trim().slice(0, R.CONNECTOR_LABEL_MAX); return l ? { label: l } : {} })() : {}) })
    const groupCount = Math.floor(rnd() * 4)
    for (let i = 0; i < groupCount; i++) g.groups.push({ id: rnd() < 0.5 ? `grp${i}` : word(5) + i, label: word(15).trim(), nodes: g.nodes.filter(() => rnd() < 0.3).map((n) => n.id) })
    for (const p of roundTripProblems(g, rnd() < 0.3 ? word(20).replace(/\s+/g, ' ').trim() || undefined : undefined)) randomProblems.push(`graph ${gi}: ${p}`)
  }
  ok('flowchart.mermaid.24 the round trip holds for 60 seeded random graphs whose ids, labels, group labels and titles are built from the characters that break parsers ( " < > # ; | & % [ ] ( ) { } \\ / ` - . @ ~ = and newlines) — a label that can break out of its quotes fails here with the graph that did it',
    randomProblems.length === 0, randomProblems.slice(0, 3).join(' | '))

  // ── the paste sniff and the sentence ──────────────────────────────────────
  const YES = ['flowchart TD\nA-->B', 'graph LR', 'flowchart', 'graph', '  \n%% c\n\nflowchart TD', '---\ntitle: x\n---\ngraph TD\nA-->B', 'graph TD; A --> B', 'flowchart\tLR', '\r\nflowchart TD\r\n']
  const NO = ['', '   ', 'sequenceDiagram\nA->>B: hi', 'hello graph', 'graphic design notes', 'flowcharts are nice', 'Graphviz digraph {}', '{"flowchart": 1}', 'A --> B', '---\ntitle: x\n---\nsequenceDiagram', '---\nnever closed\nflowchart TD', '# flowchart', 'pie\n "a": 1']
  const badYes = YES.filter((t) => M.looksLikeMermaid(t) !== true)
  const badNo = NO.filter((t) => M.looksLikeMermaid(t) !== false)
  const agree = YES.concat(NO).every((t) => M.looksLikeMermaid(t) === (M.parseMermaid(t).kind === 'ok'))
  ok('flowchart.mermaid.25 the paste sniff says yes to a flowchart or graph header (after blanks, comments and front matter) and no to prose, other diagrams, "graphic" and "flowcharts", and it never disagrees with what parseMermaid accepts — a sniff that said yes to something the parser then refuses would eat the user’s paste',
    badYes.length === 0 && badNo.length === 0 && agree && M.looksLikeMermaid(undefined) === false && M.looksLikeMermaid(null) === false, show({ badYes, badNo, agree }))

  const sentence = (text) => { const r = M.parseMermaid(text); return r.kind === 'ok' ? M.mermaidImportSentence(r) : `refused: ${r.reason}` }
  const sBig = M.mermaidImportSentence(P(HEAD + Array.from({ length: 12 }, (_, i) => `n${i} --> n${i + 1}`).join('\n') + '\nn0 --> n12\nn1 --> n12\nclick n0 cb\nstyle n1 fill:red\nA{{hex}}'))
  const sOne = sentence(HEAD + 'A\nstyle A fill:red')
  const sPlain = sentence(HEAD + 'A --> B')
  const sEmpty = sentence(HEAD)
  const sOnlyDrops = sentence(HEAD + 'click A cb')
  const sManyKinds = sentence(HEAD + 'A\nstyle A x\nclassDef b x\nclass A b\nlinkStyle 0 x\nclick A cb\nA -- "q" --> ')
  const sConnector = sentence(HEAD + 'A ==> B')
  ok('flowchart.mermaid.26 the import sentence reads "12 shapes · 14 connectors · 2 lines left out (click, style) · 1 shape approximated": singular and plural are right, a part with a zero count is left out (never a bare zero), the dropped kinds are named, and an empty diagram says so',
    sBig === '14 shapes · 14 connectors · 2 lines left out (click, style) · 1 shape approximated' && sOne === '1 shape · 1 line left out (style)' && sPlain === '2 shapes · 1 connector' && sEmpty === 'an empty flowchart' &&
      sOnlyDrops === '1 line left out (click)' && /^1 shape · 6 lines left out \(style, classDef, class, linkStyle, …\)$/.test(sManyKinds) && sConnector === '2 shapes · 1 connector · 1 connector approximated' && !/\b0\b/.test([sBig, sOne, sPlain, sEmpty, sOnlyDrops, sManyKinds, sConnector].join(' ')),
    show({ sBig, sOne, sPlain, sEmpty, sOnlyDrops, sManyKinds, sConnector }))

  // ── hostile names ─────────────────────────────────────────────────────────
  const poison = P(HEAD + '__proto__ --> constructor\nconstructor --> toString\nhasOwnProperty[__proto__]\nsubgraph __proto__x\n valueOf\nend')
  const poisonOut = M.serializeMermaid(poison.graph)
  ok('flowchart.mermaid.27 ids named like Object.prototype members (__proto__, constructor, toString, hasOwnProperty, valueOf) are ordinary nodes — an agent cannot pick an id that corrupts the importer’s tables or vanishes from the result',
    show(ids(poison.graph)) === show(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) && poison.graph.edges.length === 2 && node(poison.graph, 'hasOwnProperty').text === '__proto__' && poison.graph.groups[0].nodes.join() === 'valueOf' &&
      Object.getPrototypeOf(poison.graph) === Object.prototype && ({}).polluted === undefined && P(poisonOut).graph.nodes.length === 5,
    show({ ids: ids(poison.graph), out: poisonOut }))
}
