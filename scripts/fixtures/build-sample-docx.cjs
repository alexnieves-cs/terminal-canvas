/* M250. Builds scripts/fixtures/sample.docx from hand-written OOXML parts.

   Run with: node scripts/fixtures/build-sample-docx.cjs [outfile]

   Why a builder rather than a file saved from Word: every construct the loss
   report counts has to be present on PURPOSE and in a known number — two
   comments, one insertion and one deletion, exactly one merged-cell table —
   and a document saved from an editor carries whatever else that editor felt
   like writing (rsids, settings, a theme, a second header), which would make
   `docx.loss.1`'s expected counts a description of Word rather than of the
   fixture. Every date is FIXED so the output rebuilds byte-identically
   (`verify:notes docx.fixture.1` compares a fresh build against the committed
   bytes): a fixture that changes on every run cannot be reviewed in a diff. */
const JSZip = require('jszip')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const DATE = new Date('2026-09-10T00:00:00Z')
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
// A 1x1 PNG — real magic number, so the asset store's `imageMediaType` takes it.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

const t = (text) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`
const p = (runs, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${runs}</w:p>`
const li = (text) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${t(text)}</w:p>`
const cell = (text, span) => `<w:tc><w:tcPr>${span ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr>${p(t(text))}</w:tc>`
const table = (rows) => `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>${rows.map((r) => `<w:tr>${r}</w:tr>`).join('')}</w:tbl>`
const image = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="Picture 1" descr="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9525" cy="9525"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`

const body = [
  p(t('Quarterly plan'), 'Heading1'),
  // Comment 0 spans "Intro".
  p(`<w:commentRangeStart w:id="0"/>${t('Intro')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>${t(' with ')}<w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r>${t(' and ')}<w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r>${t(' words.')}`),
  li('First item'),
  li('Second item'),
  // The tracked change: one deletion and one insertion, and comment 1 on the paragraph.
  p(`<w:commentRangeStart w:id="1"/>${t('Budget is ')}<w:del w:id="10" w:author="Ada" w:date="2026-09-01T00:00:00Z"><w:r><w:delText>ten</w:delText></w:r></w:del><w:ins w:id="11" w:author="Ada" w:date="2026-09-01T00:00:00Z">${t('twelve')}</w:ins>${t(' thousand.')}<w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r>`),
  p(`${t('See the ')}<w:hyperlink r:id="rId5">${t('site')}</w:hyperlink>${t('.')}`),
  table([cell('Name') + cell('Owner'), cell('Launch') + cell('Ada')]),
  p(t('Between tables.')),
  table([cell('Merged header', 2), cell('a') + cell('b')]),
  p(image)
].join('')

const parts = {
  '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>`,
  '_rels/.rels': `${XML}<Relationships xmlns="${REL.replace('/officeDocument/2006/relationships', '/package/2006/relationships')}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/_rels/document.xml.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="${R}/comments" Target="comments.xml"/><Relationship Id="rId4" Type="${R}/image" Target="media/image1.png"/><Relationship Id="rId5" Type="${R}/hyperlink" Target="https://example.com/" TargetMode="External"/></Relationships>`,
  'word/document.xml': `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}"><w:body>${body}<w:sectPr/></w:body></w:document>`,
  'word/styles.xml': `${XML}<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
  'word/numbering.xml': `${XML}<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  'word/comments.xml': `${XML}<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Ada" w:date="2026-09-01T00:00:00Z"><w:p><w:r><w:t>Tighten this.</w:t></w:r></w:p></w:comment><w:comment w:id="1" w:author="Grace" w:date="2026-09-01T00:00:00Z"><w:p><w:r><w:t>Confirm the number.</w:t></w:r></w:p></w:comment></w:comments>`
}

async function buildSampleDocx() {
  const zip = new JSZip()
  // `createFolders: false`: otherwise jszip adds `word/` and `_rels/` directory
  // entries stamped with the CURRENT time, and two builds differ at byte ~348.
  for (const [name, text] of Object.entries(parts)) zip.file(name, text, { date: DATE, createFolders: false })
  zip.file('word/media/image1.png', PNG, { date: DATE, binary: true, createFolders: false })
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' })
}

module.exports = { buildSampleDocx }

if (require.main === module) {
  const out = process.argv[2] || join(__dirname, 'sample.docx')
  buildSampleDocx().then((buf) => { writeFileSync(out, buf); console.log(`wrote ${out} (${buf.length} bytes)`) })
}
