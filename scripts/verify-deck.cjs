/* Verifies M251: a Markdown deck and its .pptx export.
   Run with: npm run verify:deck

   Plain node. The export runs the REAL pptxgenjs and the check unzips what
   it wrote, because the facts a person cannot see go wrong are all inside
   the zip: a slide that went missing, notes that did not travel, a token
   that did. The temp directory has a space in it, the verify:file rule. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
const OUT = join(root, 'out', 'verify', 'deck.cjs')
mkdirSync(join(root, 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'deck-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: { '@shared': join(root, 'src', 'shared') }
})
const D = require(OUT)

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'deck', 'demo.deck.md'), 'utf8')
const TOKEN = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'
// A real 1x1 PNG: the picture must be decided by its first bytes, never by `.png`.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

;(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tc deck '))
  try {
    // --- the parse -------------------------------------------------------
    const parsed = D.parseDeck?.(FIXTURE)
    const slides = parsed?.kind === 'deck' ? parsed.slides : []
    ok('deck.parse.1 absent, malformed and a deck stay three answers; the fixture is four slides with their headings as titles',
      D.parseDeck?.(undefined)?.kind === 'absent' && D.parseDeck?.(42)?.kind === 'malformed' && parsed?.kind === 'deck' &&
        JSON.stringify(slides.map((s) => s.title)) === JSON.stringify(['Launch plan', 'The numbers', 'Risks', 'Close']),
      JSON.stringify(slides.map((s) => s.title)))
    ok('deck.parse.2 lists become bullets with their nesting level and numbering; inline marks are stripped from body text',
      JSON.stringify(slides[0]?.bullets.map((b) => b.level)) === JSON.stringify([0, 0, 1]) && slides[0]?.bullets[2]?.text === 'straight to PowerPoint' &&
        slides[3]?.bullets.every((b) => b.numbered) && slides[3]?.bullets.length === 2 &&
        slides[1]?.body[0] === 'Revenue grew twelve percent.',
      JSON.stringify({ b0: slides[0]?.bullets, b3: slides[3]?.bullets, body: slides[1]?.body }))
    ok('deck.parse.3 speaker notes are everything after a Note: line, on exactly the two slides that have one; a --- inside a code fence does not split a slide',
      slides.length === 4 && slides[0]?.notes === 'Open with why this matters.' &&
        slides[1]?.notes === 'Say where the chart came from.\nIt is the quarterly board pack.' &&
        slides[2]?.notes === undefined && slides[3]?.notes === undefined,
      JSON.stringify(slides.map((s) => s.notes)))
    ok('deck.parse.4 what a slide cannot hold is NAMED with its slide, never dropped: the table on 3 and the code block on 4',
      JSON.stringify(parsed?.unmapped) === JSON.stringify([{ slide: 3, what: 'table' }, { slide: 4, what: 'code block' }]) &&
        slides[1]?.images[0]?.src === 'chart.png' && slides[1]?.images[0]?.alt === 'Growth chart',
      JSON.stringify({ unmapped: parsed?.unmapped, images: slides[1]?.images }))

    // --- the export ------------------------------------------------------
    const deckPath = join(dir, 'demo.deck.md')
    writeFileSync(deckPath, FIXTURE)
    writeFileSync(join(dir, 'chart.png'), PNG)
    writeFileSync(join(dir, 'not-a-picture.png'), `AWS_SECRET=${TOKEN}\n`)
    const can = typeof D.createDeckExporter === 'function'
    const writes = []
    const asked = []
    const mk = (answer) => D.createDeckExporter({
      askPath: async (suggested) => { asked.push(suggested); return answer },
      write: (p, data) => { writes.push(p); writeFileSync(p, data) }
    })
    const out = join(dir, 'demo.pptx')
    const r = can ? await mk(out).exportDeck({ path: deckPath }) : null
    let entries = {}
    if (existsSync(out)) {
      const JSZip = require('jszip')
      const zip = await JSZip.loadAsync(readFileSync(out))
      for (const name of Object.keys(zip.files)) if (!zip.files[name].dir) entries[name] = /\.xml$/.test(name) ? await zip.files[name].async('string') : '(binary)'
    }
    const slideXml = Object.keys(entries).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    const notesXml = Object.keys(entries).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).map((n) => entries[n]).join('\n')
    const media = Object.keys(entries).filter((n) => /^ppt\/media\//.test(n))
    ok('deck-export.1 the fixture deck exports as a real .pptx with exactly four slides, and the result says four slides and two with notes',
      can && r?.kind === 'written' && r.path === out && r.slides === 4 && r.notes === 2 && slideXml.length === 4,
      can ? JSON.stringify({ r, slideXml }) : 'createDeckExporter is not exported')
    ok('deck-export.2 each speaker note travels into the notes pages, word for word',
      notesXml.includes('Open with why this matters.') && notesXml.includes('Say where the chart came from.') && notesXml.includes('It is the quarterly board pack.'),
      notesXml.slice(0, 200))
    const anyToken = Object.values(entries).some((x) => x.includes(TOKEN))
    ok('deck-export.3 the export is scrubbed field by field — the planted token is in no part of the file — and the count is reported, once, in the sentence',
      can && r?.redacted === 1 && Object.keys(entries).length > 0 && !anyToken &&
        /1 secret scrubbed/.test(D.deckExportSentence?.(r) ?? ''),
      JSON.stringify({ redacted: r?.redacted, anyToken, sentence: D.deckExportSentence?.(r) }))
    ok('deck-export.4 the picture is embedded and the file that only CLAIMS to be one is not; all three things left out are counted and named in the sentence',
      media.length === 1 && r?.unmapped?.count === 3 &&
        JSON.stringify(r.unmapped.names) === JSON.stringify(['table on slide 3', 'code block on slide 4', 'not-a-picture.png (not an image) on slide 4']) &&
        /3 things not exported: table on slide 3, code block on slide 4, not-a-picture\.png \(not an image\) on slide 4/.test(D.deckExportSentence?.(r) ?? ''),
      JSON.stringify({ media, unmapped: r?.unmapped, sentence: D.deckExportSentence?.(r) }))

    const before = writes.length
    const rc = can ? await mk(null).exportDeck({ path: deckPath }) : null
    const rm = can ? await mk(join(dir, 'x.pptx')).exportDeck({ path: join(dir, 'nope.deck.md') }) : null
    writeFileSync(join(dir, 'blank.deck.md'), '\n---\n\n---\n')
    const askedBefore = asked.length
    const rb = can ? await mk(join(dir, 'blank.pptx')).exportDeck({ path: join(dir, 'blank.deck.md') }) : null
    ok('deck-export.5 a cancel writes nothing; a missing deck fails naming its file; a deck with no content is `empty` and never opens the dialog',
      can && rc?.kind === 'cancelled' && writes.length === before && rm?.kind === 'failed' && /nope\.deck\.md/.test(rm.reason) &&
        rb?.kind === 'empty' && asked.length === askedBefore && !existsSync(join(dir, 'blank.pptx')),
      JSON.stringify({ rc, rm, rb }))
    ok('deck-export.6 the dialog suggests the deck\'s own name with .pptx, and every write lands where the person chose',
      asked[0] === 'demo.pptx' && writes.every((p) => p === out), JSON.stringify({ asked, writes }))

    // --- the flag on the file panel ---------------------------------------
    const snap = (source) => ({ version: 1, activeWorkspaceId: 'w1', workspaces: [{ id: 'w1', name: 'Canvas', panels: [{ id: 'f1', kind: 'file', x: 0, y: 0, w: 400, h: 300, z: 1, source }] }] })
    // Found by id rather than by path into the snapshot, so where panels sit
    // (top level or per workspace) is not this check's business.
    const findPanel = (x) => {
      if (!x || typeof x !== 'object') return undefined
      if (x.id === 'f1' && x.kind === 'file') return x
      for (const v of Object.values(x)) { const hit = findPanel(v); if (hit) return hit }
      return undefined
    }
    const flag = (source) => { const p = D.parseLayout(JSON.stringify(snap(source))); return { source: findPanel(p.snapshot)?.source, warnings: p.warnings.filter((w) => /f1/.test(w)) } }
    const on = flag({ path: '/d/a.deck.md', deck: true })
    const absent = flag({ path: '/d/a.md' })
    const bad = flag({ path: '/d/a.md', deck: 'yes' })
    ok('deck.layout.1 `deck` is exactly true or absent: absent warns nothing, a malformed value warns and drops the FIELD but keeps the panel',
      on.source?.deck === true && absent.source && !('deck' in absent.source) && absent.warnings.length === 0 &&
        bad.source?.path === '/d/a.md' && !('deck' in bad.source) && bad.warnings.some((w) => /deck/.test(w)),
      JSON.stringify({ on, absent, bad }))
  } finally { rmSync(dir, { recursive: true, force: true }) }
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
})().catch((error) => { console.error(error); process.exit(1) })
