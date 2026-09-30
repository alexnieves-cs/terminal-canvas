/* verify:flowchart — the flowchart's two file doors (src/main/flowchart-files.ts):
   `export:flowchart`, a diagram's TEXT out through the outward gate, and
   `flowchart:read`, a Mermaid file in. Every property here fails SILENTLY when
   broken: an export that wrote the raw text instead of the gate's still says
   "written", an SVG that slipped a data: URI through is a second binary export
   the gate cannot read, a read that accepted a 40 MB file still returns text,
   and two refusals with one sentence tell a person nothing about which of the
   two things to fix.

   Driven with fake dialogs and an in-memory fs (the deps are injected), then
   once against the real fs and the real default deps in a scratch directory. */
const { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

// Built by concatenation so no scanner reads this file as holding a token.
const TOKEN = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789'
const MERMAID = 'flowchart TD\n  A["Start"] --> B["Done"]\n'
/** A two-step graph as the renderer's `panelsToGraph` sends it — the Mermaid export's request. */
const GRAPH = (a = 'Start', b = 'Done', extra = {}) => ({ direction: 'TB', nodes: [{ id: 'sh1', form: 'terminator', text: a, w: 0, h: 0 }, { id: 'sh2', form: 'process', text: b, w: 0, h: 0 }], edges: [{ from: 'sh1', to: 'sh2', ...(extra.label === undefined ? {} : { label: extra.label }) }], ...(extra.groups === undefined ? {} : { groups: extra.groups }) })
/** What main should write for GRAPH(a, b): main's own ids, the shared serializer. */
const expectMermaid = (F, a, b, extra = {}) => F.mermaid.serializeMermaid({ direction: 'TB', nodes: [{ id: 'n1', form: 'terminator', text: a, w: 0, h: 0 }, { id: 'n2', form: 'process', text: b, w: 0, h: 0 }], edges: [{ from: 'n1', to: 'n2', ...(extra.label === undefined ? {} : { label: extra.label }) }], ...(extra.groups === undefined ? {} : { groups: extra.groups }) })
/** A theme's colours as the renderer reads them (`themeColours`). */
const COLOURS = {
  fill: { plain: '#f6f7fa', none: 'none', yellow: '#fbf3d5', blue: '#e2ecf9', green: '#e0f0e4', pink: 'rgba(249, 228, 236, .9)' },
  stroke: { line: '#b5bcc7', ink: '#3f4552', iris: '#0b7f97', violet: 'rgb(106, 79, 196)', none: 'none' },
  ink: { fg: '#1b1e26', muted: '#5b6271' },
  background: '#fafafa',
  line: '#444444'
}
/** A two-shape chart with a labelled arrow and a live object — every place words sit in an SVG. */
const MODEL = (words = {}) => ({
  shapes: [
    { id: 'a', box: { x: 0, y: 0, w: 160, h: 72 }, shape: { form: 'process', text: words.a ?? 'Start' } },
    { id: 'b', box: { x: 0, y: 200, w: 160, h: 90 }, shape: { form: 'decision', text: words.b ?? 'Done?' } }
  ],
  connectors: [{ fromBox: { x: 0, y: 0, w: 160, h: 72 }, fromForm: 'process', toBox: { x: 0, y: 200, w: 160, h: 90 }, toForm: 'decision', connector: { id: 'cx1', to: 'b', ...(words.label === undefined ? {} : { label: words.label }) }, points: [{ x: 80, y: 72 }, { x: 80, y: 200 }] }],
  panels: words.panel === undefined ? [] : [{ box: { x: 400, y: 0, w: 300, h: 200 }, title: words.panel }]
})

/** Fake dialogs, write and fs. `over.savePath: null` is a cancelled sheet; absent is "/out/<suggested name>". */
function build(over = {}) {
  const log = { saves: [], writes: [], opens: 0, reads: [] }
  const files = new Map(Object.entries(over.files ?? {}))
  const dirs = new Set(over.dirs ?? [])
  const sizes = over.sizes ?? {}
  const deps = {
    askSave: async (ask) => {
      log.saves.push(ask)
      if (over.saveThrows) throw new Error('no window')
      return 'savePath' in over ? over.savePath : `/out/${ask.suggestedName}`
    },
    askOpen: async () => {
      log.opens += 1
      if (over.openThrows) throw new Error('no window')
      return 'openPath' in over ? over.openPath : null
    },
    write: (path, data) => {
      if (over.writeThrows) throw new Error('EACCES: permission denied')
      log.writes.push([path, data])
    },
    stat: (path) => {
      if (dirs.has(path)) return { isFile: () => false, isDirectory: () => true, size: 0 }
      if (files.has(path)) return { isFile: () => true, isDirectory: () => false, size: sizes[path] ?? Buffer.byteLength(files.get(path)) }
      throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${path}'`), { code: 'ENOENT' })
    },
    // A link is modelled by `over.links`; everything else is its own real path.
    realpath: (path) => (over.links ?? {})[path] ?? path,
    readText: (path) => {
      log.reads.push(path)
      if (over.readThrows) throw new Error('EIO: i/o error')
      return files.get(path)
    }
  }
  return { deps, log }
}

module.exports = async function (ok, F) {
  const M = F.files ?? {}
  const has = typeof M.exportFlowchart === 'function' && typeof M.readFlowchart === 'function' && typeof M.createFlowchartFiles === 'function'
  ok('flowchart.files.1 the module exports exportFlowchart, readFlowchart and createFlowchartFiles, and createFlowchartFiles builds both doors over one set of deps', has && await (async () => {
    const both = build({ files: { '/w/a.mmd': MERMAID } })
    const doors = M.createFlowchartFiles(both.deps)
    const inn = await doors.read({ path: '/w/a.mmd' })
    const out = await doors.export({ format: 'mermaid', graph: GRAPH(), suggestedName: 'via doors' })
    return inn.kind === 'ok' && out.kind === 'written' && both.log.writes.length === 1
  })(), `exports: ${Object.keys(M).join(',')}`)
  if (!has) return
  const exp = (req, over) => { const b = build(over); return M.exportFlowchart(req, b.deps).then((result) => ({ result, ...b })) }
  const read = (req, over) => { const b = build(over); return M.readFlowchart(req, b.deps).then((result) => ({ result, ...b })) }

  // ---- export: the gate ----
  {
    const { result, log } = await exp({ format: 'mermaid', graph: GRAPH(`key ${TOKEN}`, 'Done'), suggestedName: 'Order flow' })
    const written = log.writes[0]?.[1] ?? ''
    const clean = await exp({ format: 'mermaid', graph: GRAPH(), suggestedName: 'clean' })
    ok('flowchart.files.2 an exported Mermaid file is BUILT IN MAIN from the graph with every word SCRUBBED — the token is gone, its placeholder and the rest of the diagram are there, and the answer counts it; a diagram with nothing to scrub is written as the serializer writes it with redacted: 0',
      result.kind === 'written' && result.path === '/out/Order flow.mmd' && result.redacted === 1 &&
        log.writes.length === 1 && !written.includes(TOKEN) && written === expectMermaid(F, 'key [redacted github token]', 'Done') &&
        clean.result.kind === 'written' && clean.result.redacted === 0 && clean.log.writes[0][1] === expectMermaid(F, 'Start', 'Done'),
      JSON.stringify({ result, written }))

    const seen = []
    const b = build()
    const gated = await M.exportFlowchart({ format: 'mermaid', graph: GRAPH('Start', 'Done', { label: 'yes', groups: [{ id: 'grp', label: 'lane', nodes: ['sh1'] }] }), suggestedName: 'x' }, { ...b.deps, outward: (t, source) => { seen.push([t, source]); return { text: `GATE(${t})`, redacted: 7 } } })
    const w3 = b.log.writes[0]?.[1] ?? ''
    ok('flowchart.files.3 each WORD crosses the outward gate whole, one call per word (the two shapes, the arrow\'s label, the group\'s name), named with a source; what is written holds what the gate returned for each and never a raw word; the count is the gate\'s sum',
      JSON.stringify(seen.map((x) => x[0]).sort()) === JSON.stringify(['Done', 'Start', 'lane', 'yes']) && seen.every((x) => /flowchart/.test(x[1])) &&
        b.log.writes.length === 1 && ['GATE(Start)', 'GATE(Done)', 'GATE(yes)', 'GATE(lane)'].every((g) => w3.includes(g)) && !/"Start"|"Done"/.test(w3) &&
        gated.kind === 'written' && gated.redacted === 28,
      JSON.stringify({ seen, w3, gated }))
  }

  // ---- export: cancel, failure, malformed, size ----
  {
    const cancelled = await exp({ format: 'mermaid', graph: GRAPH(), suggestedName: 'x' }, { savePath: null })
    const failed = await exp({ format: 'mermaid', graph: GRAPH(), suggestedName: 'x' }, { writeThrows: true })
    const sheet = await exp({ format: 'mermaid', graph: GRAPH(), suggestedName: 'x' }, { saveThrows: true })
    ok('flowchart.files.4 a cancelled save sheet writes nothing and answers cancelled; a failed write and a sheet that cannot open each answer a refusal with their own sentence — the door never rejects',
      cancelled.result.kind === 'cancelled' && cancelled.log.writes.length === 0 && cancelled.log.saves.length === 1 &&
        failed.result.kind === 'refused' && /could not be written/.test(failed.result.reason) && /another folder/.test(failed.result.reason) &&
        sheet.result.kind === 'refused' && /sheet/.test(sheet.result.reason) && failed.result.reason !== sheet.result.reason,
      JSON.stringify([cancelled.result, failed.result, sheet.result]))

    const bad = await Promise.all([
      exp(undefined), exp({ format: 'png', graph: GRAPH(), suggestedName: 'x' }), exp({ format: 'mermaid', text: MERMAID, suggestedName: 'x' }),
      exp({ format: 'mermaid', graph: { direction: 'TB', nodes: [{ id: 'a', form: 'hexagon', text: 'x' }], edges: [] }, suggestedName: 'x' }),
      exp({ format: 'mermaid', graph: GRAPH('x'.repeat(2_000_001)), suggestedName: 'big' })
    ])
    const reasons = bad.map((r) => r.result.reason)
    const at = await exp({ format: 'mermaid', graph: GRAPH('x'.repeat(1_999_900), 'y'), suggestedName: 'edge' })
    ok('flowchart.files.5 a malformed request (no request or an unknown format; Mermaid TEXT from the renderer, no longer accepted; a graph with no readable shape) and words over 2,000,000 characters are each refused by their own sentence before any sheet opens or byte is written; just under 2,000,000 is written',
      bad.every((r) => r.result.kind === 'refused' && r.log.saves.length === 0 && r.log.writes.length === 0) &&
        /mermaid or svg/.test(reasons[0]) && reasons[0] === reasons[1] && /empty/.test(reasons[2]) && /empty/.test(reasons[3]) && /million/.test(reasons[4]) &&
        at.result.kind === 'written' && at.log.writes.length === 1,
      JSON.stringify(reasons))
  }

  // ---- export: an SVG never carries active content ----
  // Since the boundary fix the SVG is BUILT in main, so these markers are a
  // tripwire on main's own output: checked on the shared scanner directly.
  {
    const R = F.svg ?? {}
    const scan = (F.filesShared ?? {}).svgActiveContent
    const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${inner}</svg>`
    const cases = {
      '<script': svg('<script>alert(1)</script>'),
      '<foreignObject': svg('<foreignObject width="5" height="5"><div>x</div></foreignObject>'),
      'javascript:': svg('<a style="x" id="javascript:void(0)"><rect/></a>'),
      'href=': svg('<a href="https://example.com"><rect/></a>'),
      'xlink:href': svg('<use xlink:href="#a"/>'),
      'data:': svg('<rect style="fill:red" id="data:x"/>'),
      'an on…= event handler': svg('<rect onload="alert(1)"/>'),
      '<image': svg('<image width="1" height="1"/>'),
      '<style': svg('<style>rect{fill:red}</style>'),
      'url(': svg('<rect fill="url(https://example.com/x)"/>'),
      '<set': svg('<set attributeName="href" to="x"/>'),
      '<animate': svg('<animate attributeName="x" to="1"/>'),
      '@import': svg('<rect id="@import"/>')
    }
    const named = typeof scan === 'function' ? Object.fromEntries(Object.entries(cases).map(([marker, text]) => [marker, scan(text)])) : null
    ok('flowchart.files.6 the SVG tripwire names each active marker — <script, <foreignObject, javascript:, href=, xlink:href, data:, an event handler, <image, and (the boundary critic\'s holes) <style, url(, <set, <animate, @import',
      named !== null && Object.entries(named).every(([marker, got]) => got === marker), JSON.stringify(named))

    const shouted = typeof scan === 'function' ? [svg('<SCRIPT>1</SCRIPT>'), svg('<ForeignObject/>'), svg('<a HREF = "x"/>'), svg('<STYLE>x</STYLE>'), svg('<rect fill="URL (x)"/>'), svg('<a id="JavaScript:1"/>')].map(scan) : []
    const words = typeof scan === 'function' ? scan(svg('<text x="2" y="5">see url(x), &lt;script&gt;, href= and onload= and @import</text>')) : 'missing'
    ok('flowchart.files.7 the tripwire is case-insensitive, and it reads MARKUP only — a label that says url(, <script>, href=, onload= or @import in its words is text and passes',
      shouted.length === 6 && shouted.every((m) => m !== null) && words === null, JSON.stringify({ shouted, words }))
    void R
  }

  // ---- export: the file name ----
  {
    const name = async (suggestedName, format = 'mermaid') => (await exp(format === 'svg' ? { format, model: MODEL(), colours: COLOURS, suggestedName } : { format, graph: GRAPH(), suggestedName })).log.saves[0]?.suggestedName
    const got = {
      plain: await name('Order flow'),
      svg: await name('Order flow', 'svg'),
      hasExt: await name('Order flow.mmd'),
      otherExt: await name('Order flow.mmd', 'svg'),
      path: await name('../../etc/passwd'),
      hostile: await name('a/b\\c: d?.mmd', 'svg'),
      empty: await name(''),
      dots: await name('....'),
      missing: await name(undefined),
      long: await name('n'.repeat(200))
    }
    ok('flowchart.files.8 the sheet opens on the suggested name made safe and given the format\'s own extension — .mmd or .svg, a path or dotfile or empty suggestion reduced to a plain name, never longer than 80 characters before the extension',
      got.plain === 'Order flow.mmd' && got.svg === 'Order flow.svg' && got.hasExt === 'Order flow.mmd' && got.otherExt === 'Order flow.svg' &&
        got.path === 'passwd.mmd' && got.hostile === 'c d.svg' && got.empty === 'flowchart.mmd' && got.dots === 'flowchart.mmd' &&
        got.missing === 'flowchart.mmd' && got.long === `${'n'.repeat(80)}.mmd`, JSON.stringify(got))
  }

  // ---- read: refusals ----
  {
    const over = {
      files: { '/w/a.mmd': MERMAID, '/w/pic.png': 'x', '/w/big.mmd': 'x', '/w/broken.mmd': MERMAID },
      dirs: ['/w/folder.mmd'],
      sizes: { '/w/big.mmd': 200_001 }
    }
    const arms = { relative: 'flow.mmd', extension: '/w/pic.png', missing: '/w/none.mmd', directory: '/w/folder.mmd', big: '/w/big.mmd' }
    const got = {}
    for (const [arm, path] of Object.entries(arms)) got[arm] = await read({ path }, over)
    const unreadable = await read({ path: '/w/broken.mmd' }, { ...over, readThrows: true })
    const notText = await read({ path: 5 }, over)
    const reasons = [...Object.values(got), unreadable, notText].map((g) => g.result.reason)
    const fixes = { relative: /absolute/, extension: /not a Mermaid file/, missing: /no file at/, directory: /folder/, big: /KB/ }
    ok('flowchart.files.9 a relative path, a wrong extension, a missing file, a directory, an over-size file, an unreadable file and a non-text path are each refused with their OWN sentence naming the fix, and every refusal before the read reads nothing',
      Object.entries(got).every(([arm, g]) => g.result.kind === 'refused' && fixes[arm].test(g.result.reason) && g.log.reads.length === 0) &&
        unreadable.result.kind === 'refused' && /could not be read/.test(unreadable.result.reason) && notText.result.kind === 'refused' && notText.log.reads.length === 0 &&
        new Set(reasons).size === reasons.length && got.relative.log.opens === 0 && notText.log.opens === 0, JSON.stringify(reasons))
  }

  // ---- read: the good paths ----
  {
    const files = { '/w/order flow.mmd': MERMAID, '/w/A.MERMAID': 'graph LR\nA-->B\n', '/w/notes.md': '# n\n', '/w/x.txt': 'flowchart TD\n', '/w/edge.mmd': 'x', '/w/bom.mmd': `﻿${MERMAID}` }
    const good = await read({ path: '/w/order flow.mmd' }, { files })
    const upper = await read({ path: '/w/A.MERMAID' }, { files })
    const exts = await Promise.all(['/w/notes.md', '/w/x.txt'].map((path) => read({ path }, { files })))
    const edge = await read({ path: '/w/edge.mmd' }, { files, sizes: { '/w/edge.mmd': 200_000 } })
    const bom = await read({ path: '/w/bom.mmd' }, { files })
    ok('flowchart.files.10 a good file answers its text, its basename WITHOUT the extension and its path; .mmd .mermaid .md .txt are accepted in any case, exactly 200,000 bytes is read, and a leading BOM is dropped',
      good.result.kind === 'ok' && good.result.text === MERMAID && good.result.name === 'order flow' && good.result.path === '/w/order flow.mmd' &&
        upper.result.kind === 'ok' && upper.result.name === 'A' && upper.result.text === 'graph LR\nA-->B\n' &&
        exts.every((e) => e.result.kind === 'ok') && exts[0].result.name === 'notes' && exts[1].result.name === 'x' &&
        edge.result.kind === 'ok' && bom.result.kind === 'ok' && bom.result.text === MERMAID,
      JSON.stringify({ good: good.result, upper: upper.result, edge: edge.result.kind, bom: bom.result.kind }))
  }

  // ---- read: the chooser ----
  {
    const files = { '/w/picked.mmd': MERMAID, '/w/picked.png': 'x' }
    const picked = await read(undefined, { files, openPath: '/w/picked.mmd' })
    const blank = await read({ path: '  ' }, { files, openPath: '/w/picked.mmd' })
    const cancelled = await read({}, { files, openPath: null })
    const wrong = await read({}, { files, openPath: '/w/picked.png' })
    const noSheet = await read({}, { files, openThrows: true })
    const named = await read({ path: '/w/picked.mmd' }, { files, openPath: '/w/other.mmd' })
    ok('flowchart.files.11 no path (or a blank one) opens the chooser and reads what it picked; a cancelled chooser answers cancelled and reads nothing; a picked file is held to the same rules; a chooser that cannot open is a refusal; a NAMED path never opens the chooser',
      picked.result.kind === 'ok' && picked.result.name === 'picked' && picked.log.opens === 1 &&
        blank.result.kind === 'ok' && blank.log.opens === 1 &&
        cancelled.result.kind === 'cancelled' && cancelled.log.opens === 1 && cancelled.log.reads.length === 0 &&
        wrong.result.kind === 'refused' && /not a Mermaid file/.test(wrong.result.reason) &&
        noSheet.result.kind === 'refused' && /sheet/.test(noSheet.result.reason) &&
        named.result.kind === 'ok' && named.log.opens === 0,
      JSON.stringify([picked.result.kind, blank.result.kind, cancelled.result, wrong.result, noSheet.result, named.result.kind]))
  }

  // ---- the real fs, the real default write and stat ----
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc-flowchart-files-'))
    try {
      const target = join(dir, 'nested', 'out.mmd')
      const deps = { askSave: async () => target, askOpen: async () => null }
      const wrote = await M.exportFlowchart({ format: 'mermaid', graph: GRAPH(TOKEN, 'B'), suggestedName: 'out' }, deps)
      const onDisk = existsSync(target) ? readFileSync(target, 'utf8') : ''
      const mode = existsSync(target) ? statSync(target).mode & 0o777 : -1
      const leftovers = readdirSync(join(dir, 'nested')).filter((n) => n.endsWith('.tmp'))
      const back = await M.readFlowchart({ path: target }, deps)
      const bigPath = join(dir, 'big.mmd')
      writeFileSync(bigPath, 'x'.repeat(200_001))
      const big = await M.readFlowchart({ path: bigPath }, deps)
      const missing = await M.readFlowchart({ path: join(dir, 'nothing.mmd') }, deps)
      const asDir = join(dir, 'a-folder.mmd')
      mkdirSync(asDir)
      const dirRead = await M.readFlowchart({ path: asDir }, deps)
      ok('flowchart.files.12 against the real fs: the export creates its folder, writes atomically at mode 0600 with no .tmp left, the file holds the scrubbed text, and reading it back answers that text; a real over-size file, a real missing file and a real directory are each refused',
        wrote.kind === 'written' && wrote.redacted === 1 && !onDisk.includes(TOKEN) && onDisk.includes('[redacted github token]') && mode === 0o600 && leftovers.length === 0 &&
          back.kind === 'ok' && back.text === onDisk && back.name === 'out' &&
          big.kind === 'refused' && /KB/.test(big.reason) && missing.kind === 'refused' && /no file at/.test(missing.reason) &&
          dirRead.kind === 'refused' && /folder/.test(dirRead.reason),
        JSON.stringify({ wrote, mode: mode.toString(8), leftovers, back: back.kind, big, missing, dirRead }))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  // ---- the boundary fix: the SVG is built in MAIN, every label scrubbed WHOLE ----
  {
    const long = `deploy with key ${TOKEN} then check the build`
    const svgOut = await exp({ format: 'svg', model: MODEL({ a: long, label: `via ${TOKEN}`, panel: `term ${TOKEN}` }), colours: COLOURS, suggestedName: 'flow' })
    const written = svgOut.log.writes[0]?.[1] ?? ''
    const pieces = []
    for (let i = 0; i + 12 <= TOKEN.length; i++) if (written.includes(TOKEN.slice(i, i + 12))) pieces.push(TOKEN.slice(i, i + 12))
    ok('flowchart.files.13 an SVG is BUILT IN MAIN from the model: a token in a shape\'s words (long enough to wrap), in an arrow\'s label and in a live object\'s title leaves in NO piece — no 12 characters of it — and the count is every label that held one',
      svgOut.result.kind === 'written' && svgOut.result.path === '/out/flow.svg' && /^<svg/.test(written.trim()) && pieces.length === 0 &&
        svgOut.result.redacted >= 3 && written.includes('[redacted') && written.includes('Done?'),
      JSON.stringify({ result: svgOut.result, pieces: pieces.slice(0, 3) }))

    const seen = []
    const b = build()
    await M.exportFlowchart({ format: 'svg', model: MODEL({ label: 'yes' }), colours: COLOURS, suggestedName: 'x' }, { ...b.deps, outward: (t, source) => { seen.push([t, source]); return { text: t, redacted: 0 } } })
    const text = b.log.writes[0]?.[1] ?? ''
    ok('flowchart.files.14 the gate reads each label WHOLE, one call per label (Start, Done?, yes), never the built markup — and what is written is the builder\'s own SVG, which trips none of its own markers',
      JSON.stringify(seen.map((x) => x[0]).sort()) === JSON.stringify(['Done?', 'Start', 'yes']) && seen.every((x) => /flowchart/.test(x[1])) &&
        (F.filesShared ?? {}).svgActiveContent?.(text) === null,
      JSON.stringify({ seen }))

    const hostileColour = await exp({ format: 'svg', model: MODEL(), colours: { ...COLOURS, background: '#fff" onload="alert(1)' }, suggestedName: 'x' })
    const fetchColour = await exp({ format: 'svg', model: MODEL(), colours: { ...COLOURS, stroke: { ...COLOURS.stroke, iris: 'url(https://example.com/x)' } }, suggestedName: 'x' })
    const missingColour = await exp({ format: 'svg', model: MODEL(), colours: { ...COLOURS, ink: { fg: '#000' } }, suggestedName: 'x' })
    const empty = await exp({ format: 'svg', model: { shapes: [], connectors: [] }, colours: COLOURS, suggestedName: 'x' })
    const noModel = await exp({ format: 'svg', text: '<svg/>', suggestedName: 'x' })
    const junk = await exp({ format: 'svg', model: { shapes: [{ id: 'z', box: { x: 'no' }, shape: { form: 'process', text: 'x' } }, { id: 'q', box: { x: 0, y: 0, w: 10, h: 10 }, shape: { form: 'weird', text: 'x' } }, ...MODEL().shapes], connectors: [{ connector: { id: 'cx', to: 'b' } }] }, colours: COLOURS, suggestedName: 'x' })
    ok('flowchart.files.15 a colour that is not a literal colour (an attribute break, a url(), a missing key) refuses the export; an empty or absent model refuses; SVG TEXT from the renderer is no longer accepted; a malformed shape or connector costs only itself — each refusal before the sheet opens',
      [hostileColour, fetchColour, missingColour].every((r) => r.result.kind === 'refused' && /colours/.test(r.result.reason) && r.log.saves.length === 0) &&
        empty.result.kind === 'refused' && /empty/.test(empty.result.reason) && noModel.result.kind === 'refused' && noModel.log.saves.length === 0 &&
        junk.result.kind === 'written' && !(junk.log.writes[0]?.[1] ?? '').includes('weird'),
      JSON.stringify([hostileColour.result, fetchColour.result, missingColour.result, empty.result, noModel.result, junk.result]))
  }

  // ---- the boundary fix: a named path is followed to its REAL file first ----
  {
    const over = {
      files: { '/home/.ssh/config': 'Host secret\n  IdentityFile ~/.ssh/id', '/w/real.mmd': MERMAID, '/w/grow.mmd': 'x'.repeat(200_001) },
      links: { '/w/flow.mmd': '/home/.ssh/config', '/w/alias.mmd': '/w/real.mmd' },
      sizes: { '/w/grow.mmd': 10 }
    }
    const linked = await read({ path: '/w/flow.mmd' }, over)
    const alias = await read({ path: '/w/alias.mmd' }, over)
    const grew = await read({ path: '/w/grow.mmd' }, over)
    ok('flowchart.files.16 a .mmd name LINKED to a file that is not Mermaid is refused by its own sentence and reads nothing; a link to a real .mmd reads the real file; a file that grew past the cap between the stat and the read is refused',
      linked.result.kind === 'refused' && /links to/.test(linked.result.reason) && linked.log.reads.length === 0 && !linked.result.reason.includes('secret') &&
        alias.result.kind === 'ok' && alias.result.text === MERMAID && alias.log.reads[0] === '/w/real.mmd' &&
        grew.result.kind === 'refused' && /KB/.test(grew.result.reason),
      JSON.stringify([linked.result, alias.result.kind, grew.result]))
  }

  // ---- the boundary confirm: main never ROUTES; it draws the points it is sent ----
  {
    const G = F.geometry ?? {}
    const box = (i) => ({ x: (i % 50) * 220, y: Math.floor(i / 50) * 160, w: 160, h: 72 })
    const bigShapes = Array.from({ length: 2000 }, (_, i) => ({ id: `s${i}`, box: box(i), shape: { form: 'process', text: `step ${i}` } }))
    const everyBox = bigShapes.map((x) => x.box)
    const bigConnectors = Array.from({ length: 6000 }, (_, i) => ({ fromBox: box(i % 2000), fromForm: 'process', toBox: box((i * 7 + 1) % 2000), toForm: 'process', connector: { id: `c${i}`, to: `s${(i * 7 + 1) % 2000}` }, points: [{ x: 1, y: 2 }, { x: 1, y: 50 }, { x: 90, y: 50 }], obstacles: everyBox }))
    const t0 = process.hrtime.bigint()
    const huge = await exp({ format: 'svg', model: { shapes: bigShapes, connectors: bigConnectors, panels: [] }, colours: COLOURS, suggestedName: 'huge' })
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    const one = await exp({ format: 'svg', model: { ...MODEL(), connectors: [{ ...MODEL().connectors[0], points: [{ x: 80, y: 72 }, { x: 80, y: 136 }, { x: 40, y: 136 }, { x: 40, y: 200 }] }] }, colours: COLOURS, suggestedName: 'one' })
    const want = typeof G.pathFromPoints === 'function' ? G.pathFromPoints([{ x: 80, y: 72 }, { x: 80, y: 136 }, { x: 40, y: 136 }, { x: 40, y: 200 }], 'orthogonal', 'end', { from: 's', to: 'n' }).d : '(no pathFromPoints)'
    const badPoints = await Promise.all([
      [{ x: 0, y: 0 }], Array.from({ length: 65 }, (_, i) => ({ x: i, y: 0 })), [{ x: 0, y: 0 }, { x: NaN, y: 1 }], [{ x: 0, y: 0 }, { x: '1', y: 1 }], 'M 0 0 L 9 9'
    ].map((points) => exp({ format: 'svg', model: { ...MODEL(), connectors: [{ ...MODEL().connectors[0], points }] }, colours: COLOURS, suggestedName: 'bad' })))
    const curved3 = await exp({ format: 'svg', model: { ...MODEL(), connectors: [{ ...MODEL().connectors[0], connector: { id: 'cx1', to: 'b', route: 'curved' }, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }] }, colours: COLOURS, suggestedName: 'bad' })
    const lineCount = (r) => ((r.log.writes[0]?.[1] ?? '').match(/class="connector"|<path[^>]*marker|stroke-linecap/g) ?? []).length
    ok('flowchart.files.17 main never routes: 2,000 shapes and 6,000 connectors, each sent with every shape as an "obstacle", export in under 2.5s (an A* per connector took minutes); a route is drawn exactly as the points it was sent; a malformed point list (one point, 65, a NaN, a string, a path string, a curve that is not four) costs only that line',
      huge.result.kind === 'written' && ms < 2500 && (one.log.writes[0]?.[1] ?? '').includes(want) &&
        [...badPoints, curved3].every((r) => r.result.kind === 'written' && !(r.log.writes[0]?.[1] ?? '').includes('M 0 0 L 9 9')) &&
        [...badPoints, curved3].every((r) => lineCount(r) === lineCount(badPoints[0])),
      JSON.stringify({ ms: Math.round(ms), huge: huge.result.kind, drawn: (one.log.writes[0]?.[1] ?? '').includes(want) }))
  }

  // ---- the boundary confirm: the Mermaid door splits no word before the gate; nothing is cut before it ----
  {
    const bearer = 'Bearer ' + 'abcdefghijklmnopqrstuvwxyz0123'
    const wrapped = await exp({ format: 'mermaid', graph: GRAPH('Call with', bearer.replace(' ', '\n')), suggestedName: 'x' })
    const w = wrapped.log.writes[0]?.[1] ?? ''
    ok('flowchart.files.18 a label holding "Bearer\\n<token>" is scrubbed on the MERMAID door too — the gate reads the label before the serializer turns its newline into <br/> — and the count says so',
      wrapped.result.kind === 'written' && wrapped.result.redacted === 1 && !w.includes('abcdefghijklmnopqrstuvwxyz0123'), JSON.stringify({ result: wrapped.result, w }))

    const title = 'w'.repeat(480) + ` ${TOKEN} ` + 'z'.repeat(100)
    const text = 'x '.repeat(245) + TOKEN
    const cut = await exp({ format: 'svg', model: MODEL({ a: text, panel: title }), colours: COLOURS, suggestedName: 'cut' })
    const cw = cut.log.writes[0]?.[1] ?? ''
    const frag = TOKEN.slice(0, 8)
    ok('flowchart.files.19 nothing is CUT before it is scrubbed: a token straddling a live object\'s 500-character title limit and one straddling a shape\'s 500-character label limit leave no fragment (the scrub runs on the whole string, the cut after it), and both are counted',
      cut.result.kind === 'written' && cut.result.redacted === 2 && !cw.includes(frag), JSON.stringify({ result: cut.result, frag: cw.includes(frag) }))
  }

  // ---- the boundary confirm: the real read is one descriptor, bounded ----
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc-flowchart-read-'))
    try {
      const deps = { askSave: async () => null, askOpen: async () => null }
      const fifo = join(dir, 'pipe.mmd')
      execFileSync('mkfifo', [fifo])
      const t0 = process.hrtime.bigint()
      const pipe = await M.readFlowchart({ path: fifo }, deps)
      const pipeMs = Number(process.hrtime.bigint() - t0) / 1e6
      const zero = join(dir, 'zero.mmd')
      symlinkSync('/dev/zero', zero)
      const z = await M.readFlowchart({ path: zero }, deps)
      const good = join(dir, 'real.mmd')
      writeFileSync(good, MERMAID)
      const alias = join(dir, 'alias.mmd')
      symlinkSync(good, alias)
      const a = await M.readFlowchart({ path: alias }, deps)
      ok('flowchart.files.20 against the real fs: a FIFO named .mmd is refused at once (no writer, no hang), a .mmd linked to /dev/zero is refused by its real name, and a .mmd linked to a real Mermaid file reads that file',
        pipe.kind === 'refused' && /not a regular file/.test(pipe.reason) && pipeMs < 1000 &&
          z.kind === 'refused' && /links to/.test(z.reason) && a.kind === 'ok' && a.text === MERMAID,
        JSON.stringify({ pipe, pipeMs: Math.round(pipeMs), z, a: a.kind }))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}
