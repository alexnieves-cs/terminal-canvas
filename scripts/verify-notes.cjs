/* M250. Rich note editing and .docx import. Run with: npm run verify:notes

   Plain node. Every property here fails SILENTLY when broken: a save that
   rewrites a line the person never touched is a diff that looks like theirs;
   a raw block quietly re-serialized loses the construct with no error; a
   .docx import that touched the .docx, or overwrote a note, or dropped two
   comments without saying so, reads as a conversion that worked. So the
   round trip is compared as BUFFERS, the docx is compared byte for byte
   before and after, and the loss report is compared as numbers. */
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
const ready = ['src/shared/md-blocks.ts', 'src/shared/html-to-md.ts', 'src/shared/imported-note.ts', 'src/main/docx-import.ts'].every((f) => existsSync(join(root, f)))
let N = {}
if (ready) {
  mkdirSync(join(root, 'out/verify'), { recursive: true })
  // mammoth and jszip stay EXTERNAL: they are `dependencies`, resolved from
  // node_modules exactly as the main bundle resolves them (externalizeDepsPlugin).
  buildSync({ entryPoints: [join(__dirname, 'notes-entry.cjs')], outfile: join(root, 'out/verify/notes.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'node-pty', 'mammoth', 'jszip'], alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') } })
  N = require('../out/verify/notes.cjs')
}
const B = N.blocks ?? {}, H = N.html ?? {}, I = N.imported ?? {}, D = N.docx ?? {}
const buf = (s) => Buffer.from(s, 'utf8')
const roundTrip = (text) => { try { return B.serializeBlocks(B.parseBlocks(text)) } catch (e) { return `THREW ${e}` } }

;(async () => {
  // ── notes.deps ────────────────────────────────────────────────────────
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  ok('notes.deps.1 mammoth and jszip are runtime dependencies pinned to an EXACT version, never a range',
    /^\d+\.\d+\.\d+$/.test(pkg.dependencies?.mammoth ?? '') && /^\d+\.\d+\.\d+$/.test(pkg.dependencies?.jszip ?? ''), JSON.stringify(pkg.dependencies))

  // ── notes.roundtrip ───────────────────────────────────────────────────
  // The corpus as committed, plus a CRLF and a no-final-newline variant of
  // every file made HERE, so git's line-ending handling cannot hide a
  // regression by normalizing the fixture on checkout.
  const corpusDir = join(__dirname, 'fixtures/md-corpus')
  const corpus = readdirSync(corpusDir).filter((f) => f.endsWith('.md')).flatMap((f) => {
    const text = readFileSync(join(corpusDir, f), 'utf8')
    return [[f, text], [`${f} (crlf)`, text.replace(/\r?\n/g, '\r\n')], [`${f} (no final newline)`, text.replace(/\n+$/, '')], [`${f} (mixed)`, text.replace(/\n/g, (m, i) => (i % 3 ? '\n' : '\r\n'))]]
  })
  corpus.push(['empty', ''], ['only blanks', '\n\n  \n'], ['lone cr', 'a\rb\n'])
  const broken = corpus.filter(([, text]) => !buf(roundTrip(text)).equals(buf(text))).map(([name]) => name)
  ok('notes.roundtrip.1 parse then serialize with no edits is BYTE-identical for the whole corpus and its CRLF, mixed and no-final-newline variants',
    ready && corpus.length >= 12 && broken.length === 0, `broken: ${broken.join(', ')}`)
  const tiles = corpus.every(([, text]) => { const bs = ready ? B.parseBlocks(text) : []; let at = 0; for (const b of bs) { if (b.start !== at || b.end < b.start || text.slice(b.start, b.end) !== b.source) return false; at = b.end } return at === text.length })
  ok('notes.roundtrip.2 the blocks TILE the file: contiguous source spans, each span is the block\'s source, nothing between them', ready && tiles)

  const doc = '# Title\r\n\r\nFirst   paragraph *keeps*  spacing.\r\n\r\n* star one\r\n* star two\r\n\r\nLast line with trailing   \r\n'
  const blocks = ready ? B.parseBlocks(doc) : []
  const paraIndex = blocks.findIndex((b) => b.kind === 'paragraph')
  const edited = ready ? B.editBlock(doc, paraIndex, { text: 'Replaced words.' }) : undefined
  const para = blocks[paraIndex]
  ok('notes.roundtrip.3 editing ONE block changes only that block\'s bytes — every byte before and after it is identical, and it keeps its own CRLF',
    edited?.kind === 'edited' && buf(edited.text.slice(0, para.start)).equals(buf(doc.slice(0, para.start))) &&
      edited.text.slice(para.start).startsWith('Replaced words.\r\n') &&
      buf(edited.text.slice(para.start + 'Replaced words.\r\n'.length)).equals(buf(doc.slice(para.end))), JSON.stringify(edited))
  const listIndex = blocks.findIndex((b) => b.kind === 'list')
  const listEdit = ready ? B.editBlock(doc, listIndex, { items: [{ text: 'star one' }, { text: 'star two' }, { text: 'star three' }] }) : undefined
  ok('notes.list.1 a list keeps its own marker (`*` stays `*`) and line ending when an item is added',
    blocks[listIndex]?.model?.items?.length === 2 && listEdit?.kind === 'edited' && listEdit.text.includes('* star one\r\n* star two\r\n* star three\r\n'), JSON.stringify(listEdit))
  const tasks = ready ? B.parseBlocks('- [ ] one\n- [x] two\n') : []
  ok('notes.list.2 task items parse as checked/unchecked, and toggling one rewrites only its box',
    tasks[0]?.model?.items?.[1]?.checked === true && B.editBlock?.('- [ ] one\n- [x] two\n', 0, { items: [{ text: 'one', checked: true }, { text: 'two', checked: true }] })?.text === '- [x] one\n- [x] two\n')

  // ── notes.raw ─────────────────────────────────────────────────────────
  const namesOf = (text) => ready ? B.parseBlocks(text).filter((b) => b.kind === 'raw').map((b) => b.name) : []
  const odd = namesOf(readFileSync(join(corpusDir, 'oddities.md'), 'utf8'))
  const html = namesOf(readFileSync(join(corpusDir, 'html.md'), 'utf8'))
  const refs = namesOf(readFileSync(join(corpusDir, 'references.md'), 'utf8'))
  const want = { odd: ['front matter', 'setext heading', 'indented code', 'thematic break', 'nested list', 'block quote'], html: ['HTML block'], refs: ['reference link definition', 'footnote'] }
  ok('notes.raw.1 every construct the rich editor does not model is a RAW block flagged BY NAME — front matter, setext, indented code, thematic break, nested list, block quote, HTML, reference definition, footnote',
    want.odd.every((n) => odd.includes(n)) && want.html.every((n) => html.includes(n)) && want.refs.every((n) => refs.includes(n)), JSON.stringify({ odd, html, refs }))
  const htmlDoc = readFileSync(join(corpusDir, 'html.md'), 'utf8')
  const hb = ready ? B.parseBlocks(htmlDoc) : []
  const rawAt = hb.findIndex((b) => b.kind === 'raw'), inlineAt = hb.findIndex((b) => b.kind === 'paragraph' && b.source.includes('<span'))
  const rawRefused = ready ? B.editBlock(htmlDoc, rawAt, { text: 'x' }) : undefined
  const inlineRefused = ready ? B.editBlock(htmlDoc, inlineAt, { text: 'Inline html in a paragraph.' }) : undefined
  ok('notes.raw.2 a raw block is never rewritten by a rich edit, and a paragraph holding inline HTML is refused "can\'t edit inline HTML in rich mode" — the draft unchanged either way',
    rawRefused?.kind === 'refused' && /HTML block/.test(rawRefused.reason) && B.blockRefusal?.(hb[inlineAt]) === "can't edit inline HTML in rich mode" && inlineRefused?.kind === 'refused' && /inline HTML/.test(inlineRefused.reason),
    JSON.stringify({ rawRefused, inlineRefused }))
  const src = ready ? B.replaceBlockSource(htmlDoc, rawAt, '<div>mine</div>\n') : undefined
  ok('notes.raw.3 editing a raw block AS SOURCE writes exactly the typed bytes and nothing else', src?.kind === 'edited' && src.text === htmlDoc.slice(0, hb[rawAt]?.start) + '<div>mine</div>\n' + htmlDoc.slice(hb[rawAt]?.end))

  // ── notes.edit ────────────────────────────────────────────────────────
  const small = 'Para.\n\nNext.\n'
  const refusals = ready ? [
    B.editBlock(small, 0, { text: '# now a heading' }),
    B.editBlock(small, 0, { text: 'one\n\ntwo' }),
    B.editBlock(small, 0, { text: 'a <b>tag</b>' }),
    B.editBlock('- a\n', 0, { items: [{ text: 'a\n  - nested' }] })
  ] : []
  ok('notes.edit.1 an edit whose bytes would not read back as the same block — a paragraph becoming a heading, a blank line splitting it, inline HTML, a list item growing a nested list — is REFUSED with a reason',
    refusals.length === 4 && refusals.every((r) => r.kind === 'refused' && typeof r.reason === 'string' && r.reason.length > 10), JSON.stringify(refusals))
  const head = ready ? B.editBlock('#  Old  #\n\nx\n', 0, { level: 2, text: 'New' }) : undefined
  const img = ready ? B.parseBlocks('![a b](<my pics/x.png>)\n')[0] : undefined
  const ins = ready ? B.insertBlockAfter(small, 0, '![](</a b/c.png>)') : undefined
  ok('notes.edit.2 a heading re-serializes from its model; an image with an angle-bracket path parses as an image; an inserted block lands after its anchor, separated by a blank line',
    head?.kind === 'edited' && head.text === '## New\n\nx\n' && img?.kind === 'image' && img.model.src === 'my pics/x.png' && img.model.alt === 'a b' &&
      ins?.kind === 'edited' && ins.text === 'Para.\n\n![](</a b/c.png>)\n\nNext.\n', JSON.stringify({ head, img, ins }))

  // ── notes.table ───────────────────────────────────────────────────────
  const tableDoc = readFileSync(join(corpusDir, 'tables.md'), 'utf8')
  const tb = ready ? B.parseBlocks(tableDoc) : []
  const ti = tb.findIndex((b) => b.kind === 'table'), t = tb[ti]
  const cellEdit = ready ? B.editBlock(tableDoc, ti, { header: t.model.header, rows: [['a | pipe', '10'], t.model.rows[1]] }) : undefined
  const colEdit = ready ? B.editBlock(tableDoc, ti, { header: [...t.model.header, 'Note'], rows: t.model.rows.map((r) => [...r, '']) }) : undefined
  const notTable = tb.filter((b) => b.kind === 'table').length
  ok('notes.table.1 a GFM table parses its cells (an escaped \\| is one cell); a cell edit keeps the delimiter row verbatim and re-escapes the pipe; a new column writes a new delimiter row; pipes without a delimiter row are not a table',
    t?.model?.header?.join(',') === 'Name,Value' && t.model.rows[0][0] === 'a | pipe' && cellEdit?.kind === 'edited' && cellEdit.text.includes('| :--- | ---: |\n| a \\| pipe | 10 |\n') &&
      colEdit?.kind === 'edited' && colEdit.text.includes('| Name | Value | Note |\n| :--- | ---: | --- |\n') && notTable === 2, JSON.stringify({ t, cellEdit, colEdit, notTable }))
  const block0 = ready ? B.parseBlocks('Para\n')[0] : undefined
  ok('notes.edit.3 renderBlock answers the bytes a model WOULD write — what a refused edit reopens as source, so typing is never lost',
    ready && B.renderBlock(block0, { text: 'a <b>x</b>' }, 'Para\n') === 'a <b>x</b>\n' && B.renderBlock(tb[ti], { header: ['H', 'V', 'N'], rows: [] }, tableDoc) === '| H | V | N |\n| :--- | ---: | --- |\n')

  // ── html ──────────────────────────────────────────────────────────────
  const md = ready ? H.htmlToMarkdown('<h2>A &amp; B</h2><p>x * y_z <strong>b</strong> <em>i</em> <a href="https://e.com/a b">l</a><br />next</p><ol><li>one<ul><li>deep</li></ul></li><li>two</li></ol><table><tr><td colspan="2"><p>m</p></td></tr><tr><td>p|q</td><td></td></tr></table><p>&lt;tag&gt; #not</p>') : ''
  ok('html.1 mammoth\'s vocabulary maps to Markdown: entities decoded, markup characters escaped, a nested list indented under its item, a colspan filled with empty cells, a pipe in a cell escaped, a <br> a hard break',
    md === '## A & B\n\nx \\* y\\_z **b** *i* [l](<https://e.com/a b>)\\\nnext\n\n1. one\n   - deep\n2. two\n\n| m |  |\n| --- | --- |\n| p\\|q |  |\n\n\\<tag\\> #not\n', JSON.stringify(md))

  const md2 = ready ? H.htmlToMarkdown('<h1>Item #</h1><p>a<br/>---</p><p>b<br/># c</p><p><strong>x </strong>y ~~z~~ &amp;copy;</p>') : ''
  ok('html.2 constructs that would change meaning are escaped: a trailing # on a heading, a line after a hard break that would start a setext underline or heading, emphasis edge spaces moved outside, ~ and an entity-looking &',
    md2 === '# Item \\#\n\na\\\n\\---\n\nb\\\n\\# c\n\n**x** y \\~\\~z\\~\\~ \\&copy;\n', JSON.stringify(md2))

  // ── notes.gate ────────────────────────────────────────────────────────
  const view = { from: '/docs/Plan.docx', dropped: 'Dropped: 2 comments' }
  ok('notes.gate.1 the imported-note record keeps the absent / malformed / view arms; unknown keys are ignored, a non-true `reviewed` is malformed',
    I.parseImportedNote?.(undefined)?.kind === 'absent' && I.parseImportedNote?.('x')?.kind === 'malformed' && I.parseImportedNote?.({ from: 5 })?.kind === 'malformed' &&
      I.parseImportedNote?.({ ...view, reviewed: 'yes' })?.kind === 'malformed' && I.parseImportedNote?.({ ...view, future: 1 })?.kind === 'view' && !('future' in (I.parseImportedNote?.({ ...view, future: 1 })?.view ?? { future: 1 })))
  const reason = I.importedNoteReason?.({ path: '/n.md', prose: true, imported: view })
  ok('notes.gate.2 an unreviewed imported note answers the gate sentence; a reviewed one and an ordinary note answer nothing',
    reason === 'Read this imported note before editing or sending it' && I.importedNoteReason?.({ path: '/n.md', prose: true, imported: { ...view, reviewed: true } }) === undefined && I.importedNoteReason?.({ path: '/n.md' }) === undefined)
  const fileSource = { path: '/docs/Plan.md', prose: true, imported: { ...view, reviewed: true } }
  const made = N.panels?.makeFilePanel?.('f1', { x: 0, y: 0 }, 1, fileSource)
  const plain = N.panels?.makeFilePanel?.('f2', { x: 0, y: 0 }, 1, { path: '/a.md' })
  const round = made ? N.adapt.toPanels(N.adapt.fromPanels([made]))[0] : undefined
  const warnings = []
  const parsedBad = N.layout?.parseFileSource?.({ path: '/a.md', imported: 7 }, 'f9', warnings)
  ok('notes.gate.3 the record survives makeFilePanel and both layout adapters, is absent (not undefined) on an ordinary file, and a malformed one on disk is dropped with a warning while the panel is kept',
    JSON.stringify(round?.source?.imported) === JSON.stringify(fileSource.imported) && plain && !('imported' in plain.source) &&
      parsedBad?.path === '/a.md' && !('imported' in parsedBad) && warnings.some((w) => /imported/.test(w)), JSON.stringify({ round: round?.source, parsedBad, warnings }))
  const portable = made && N.buildPortable ? N.buildPortable({ workspaceName: 'w', panels: [N.adapt.fromPanels([made])[0]], templates: [], app: '5.0.0', now: 1 }) : undefined
  const exported = portable?.workspace?.panels?.[0]?.source?.imported
  const hostile = portable ? { ...portable, workspace: { ...portable.workspace, panels: [{ ...portable.workspace.panels[0], source: { ...portable.workspace.panels[0].source, imported: { ...view, reviewed: true } } }] } } : undefined
  const remapped = hostile ? N.remapPortable(hostile, (prefix) => prefix + 'new').workspace.panels[0].source.imported : undefined
  ok('notes.gate.4 a portable export carries the import record WITHOUT `reviewed`, and a hostile portable file claiming `reviewed` is stripped on import — another machine\'s person has not read it',
    exported !== undefined && exported.reviewed === undefined && remapped !== undefined && remapped.reviewed === undefined && typeof remapped.dropped === 'string', JSON.stringify({ exported, remapped }))

  // ── docx ──────────────────────────────────────────────────────────────
  const fixture = join(__dirname, 'fixtures/sample.docx')
  const rebuilt = await require('./fixtures/build-sample-docx.cjs').buildSampleDocx()
  ok('docx.fixture.1 the committed sample.docx is exactly what its builder writes — the fixture is reviewable as source', rebuilt.equals(readFileSync(fixture)))

  const report = ready ? await D.analyzeDocx(readFileSync(fixture)) : undefined
  ok('docx.loss.1 the loss report counts the fixture\'s constructs BY NAME: 2 comments, 2 tracked changes (one w:ins, one w:del), 1 merged-cell table, and nothing else',
    report !== undefined && report.comments === 2 && report.trackedChanges === 2 && report.complexTables === 1 && report.textBoxes === 0 && report.footnotes === 0 && report.headersFooters === 0 && report.imagesNotKept === 0,
    JSON.stringify(report))
  ok('docx.loss.2 the report reads as one sentence that names and counts, never states a zero, and says so when nothing was dropped',
    I.lossSentence?.(report ?? {}) === 'Dropped: 2 comments, 2 tracked changes (shown as accepted), 1 merged-cell table' &&
      I.lossSentence?.({ comments: 1, trackedChanges: 0, complexTables: 0, textBoxes: 0, footnotes: 0, headersFooters: 0, imagesNotKept: 0, messages: [] }) === 'Dropped: 1 comment' &&
      I.lossSentence?.({ comments: 0, trackedChanges: 0, complexTables: 0, textBoxes: 0, footnotes: 0, headersFooters: 0, imagesNotKept: 0, messages: [] }) === '')

  // A fixture directory with a SPACE in it — this repo's costliest silent bug class.
  mkdirSync(join(root, 'out/verify'), { recursive: true })
  const dir = mkdtempSync(join(root, 'out/verify/notes docx '))
  try {
    const docxPath = join(dir, 'Quarterly Plan.docx')
    writeFileSync(docxPath, readFileSync(fixture))
    const before = readFileSync(docxPath), beforeMtime = statSync(docxPath).mtimeMs
    const assetDir = join(dir, 'assets')
    const deps = { putAsset: (bytes) => N.putAsset({ dir: assetDir, bytes }), createFile: (r, name, seed) => N.createFile(r, name, seed) }
    const result = ready ? await D.importDocx({ path: docxPath }, deps) : undefined
    const assets = existsSync(assetDir) ? readdirSync(assetDir) : []
    const assetPath = assets.length ? join(assetDir, assets[0]) : '(none)'
    const expected = `# Quarterly plan\n\nIntro with **bold** and *italic* words.\n\n- First item\n- Second item\n\nBudget is twelve thousand.\n\nSee the [site](https://example.com/).\n\n| Name | Owner |\n| --- | --- |\n| Launch | Ada |\n\nBetween tables.\n\n| Merged header |  |\n| --- | --- |\n| a | b |\n\n![Logo](<${assetPath}>)\n`
    const written = result?.kind === 'imported' && existsSync(result.path) ? readFileSync(result.path, 'utf8') : ''
    ok('docx.convert.1 the fixture converts to the expected Markdown — heading, emphasis, list, the inserted text, a link, both tables as pipe tables, the picture — in a NEW file beside the docx',
      result?.kind === 'imported' && result.path === join(dir, 'Quarterly Plan.md') && written === expected, JSON.stringify({ result, written }))
    ok('docx.asset.1 the picture is stored ONCE in the asset store under its content address, and the note references the stored path',
      assets.length === 1 && /^[0-9a-f]{64}\.png$/.test(assets[0]) && written.includes(assetPath) && result?.images === 1, JSON.stringify(assets))
    ok('docx.readonly.1 the import never modifies the docx — its bytes and its mtime are identical after',
      readFileSync(docxPath).equals(before) && statSync(docxPath).mtimeMs === beforeMtime)
    writeFileSync(join(dir, 'Quarterly Plan.md'), 'MINE\n')
    const second = ready ? await D.importDocx({ path: docxPath }, deps) : undefined
    mkdirSync(join(dir, 'notes'), { recursive: true }); writeFileSync(join(dir, 'notes', 'Quarterly Plan.md'), 'ALSO MINE\n')
    const third = ready ? await D.importDocx({ path: docxPath }, deps) : undefined
    ok('docx.create.1 an existing note is never overwritten: the second import lands in notes/ beside it, the third answers `exists` by path, and both existing files are untouched',
      second?.kind === 'imported' && second.path === join(dir, 'notes', 'Quarterly Plan.md') && third?.kind === 'exists' && third.path === join(dir, 'notes', 'Quarterly Plan.md') &&
        readFileSync(join(dir, 'Quarterly Plan.md'), 'utf8') === 'MINE\n' && readFileSync(join(dir, 'notes', 'Quarterly Plan.md'), 'utf8') === 'ALSO MINE\n', JSON.stringify({ second, third }))
    writeFileSync(join(dir, 'fake.docx'), 'not a zip')
    const refused = ready ? await Promise.all([
      D.importDocx({ path: 'relative.docx' }, deps), D.importDocx({ path: join(dir, 'x.pdf') }, deps), D.importDocx({ path: join(dir, 'missing.docx') }, deps),
      D.importDocx({ path: join(dir, 'fake.docx') }, deps), D.importDocx({ path: docxPath }, { ...deps, maxBytes: 10 })
    ]) : []
    ok('docx.refuse.1 a relative path, a non-.docx, a missing file, a file that is not a Word document and one over the cap are each REFUSED with its own reason, and nothing is written',
      refused.length === 5 && refused.every((r) => r.kind === 'refused') && new Set(refused.map((r) => r.reason)).size === 5 && !existsSync(join(dir, 'fake.md')), JSON.stringify(refused))
    const bomb = ready ? await D.importDocx({ path: docxPath }, { ...deps, maxInflatedBytes: 100 }) : undefined
    ok('docx.refuse.2 a package that INFLATES past the cap is refused by name before mammoth unpacks it — the compressed-size cap alone lets a small zip bomb exhaust main',
      bomb?.kind === 'refused' && /expands to/.test(bomb.reason), JSON.stringify(bomb))
  } finally { rmSync(dir, { recursive: true, force: true }) }

  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((error) => { console.error(error); process.exitCode = 1 })
