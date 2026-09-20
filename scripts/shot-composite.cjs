/* The reference composite (M297). Plain node, no display, no dependency.

   The review gap this closes: Phase D's fresh-context critic judged the
   Orchestrate scene against the PREVIOUS GOLDEN and the legibility rules,
   never against the reference image, and accepted the loss of the hub, the
   connectors and the station names as "the stated design". M294 repaired the
   scene and its author judged their own work. Handing a critic the reference
   "as well" is a habit, and habits are what a fresh context does not have —
   so the harness hands them ONE image per scene: the reference(s) on the top
   row; beneath, the last committed golden (what the previous critic approved,
   so a regression against it is visible in the same glance) beside the fresh
   capture, each labelled in the image itself. A critic reading that image
   cannot skip the comparison.

   Image work: the repo's only PNG decoder is Electron's nativeImage, which
   needs a running Electron; this file must run under `node` after `npm run
   shot` so it can be re-run on an old shot dir. Node has zlib, and zlib is
   the whole of PNG's difficulty, so the codec below is ~80 lines: 8-bit
   RGB/RGBA, non-interlaced, the five scanline filters. Anything else
   (palette, 16-bit, interlaced) throws BY NAME rather than composing a wrong
   picture quietly — every PNG this repo ships or captures is in the covered
   set (checked: docs/design-reference.png and docs/design/*.png are 8-bit
   RGB; capturePage and nativeImage write 8-bit RGBA).

   CLI: node scripts/shot-composite.cjs [shotDir]   (default out/shots)
   reads <shotDir>/manifest.json and writes <scene>.vs-reference.png for every
   entry that names a `reference`. shot.cjs calls composeManifest itself after
   its scene loop, so a normal `npm run shot` already leaves the composites
   beside the captures. */
const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { join, isAbsolute } = require('node:path')
const zlib = require('node:zlib')

const ROOT = join(__dirname, '..')
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// ---- PNG decode → { width, height, data: RGBA Buffer } -------------------

function decodePNG(buf, name = 'png') {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error(`${name}: not a PNG`)
  let off = 8
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      depth = data[8]; colour = data[9]; interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (depth !== 8) throw new Error(`${name}: ${depth}-bit PNG — this codec reads 8-bit only`)
  if (colour !== 2 && colour !== 6) throw new Error(`${name}: colour type ${colour} — this codec reads RGB (2) and RGBA (6) only`)
  if (interlace !== 0) throw new Error(`${name}: interlaced PNG — this codec reads non-interlaced only`)
  const bpp = colour === 6 ? 4 : 3
  const stride = width * bpp
  const raw = zlib.inflateSync(Buffer.concat(idat))
  if (raw.length !== (stride + 1) * height) throw new Error(`${name}: inflated ${raw.length} bytes, expected ${(stride + 1) * height}`)
  const out = Buffer.alloc(width * height * 4)
  let prev = Buffer.alloc(stride)
  const line = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      let v = src[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`${name}: unknown scanline filter ${filter} on row ${y}`)
      line[i] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      out[o] = line[x * bpp]; out[o + 1] = line[x * bpp + 1]; out[o + 2] = line[x * bpp + 2]
      out[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255
    }
    line.copy(prev) // this row is the next row's "up" line
  }
  return { width, height, data: out }
}

// ---- PNG encode from RGB ----------------------------------------------------

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePNG({ width, height, data }) {
  // data is RGBA; write RGB (the composite has no transparency) with filter 0.
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, o = y * (stride + 1) + 1 + x * 3
      raw[o] = data[i]; raw[o + 1] = data[i + 1]; raw[o + 2] = data[i + 2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}

// ---- Compositing --------------------------------------------------------------

// Box-filter resample to a target height (area average, so a 3072-wide
// reference does not alias into moiré when it lands at 900 wide). Alpha is
// composited over the panel's dark ground first, so a capture with a
// transparent corner does not read as a black hole.
function scaleTo(img, targetH, ground) {
  const scale = targetH / img.height
  const targetW = Math.max(1, Math.round(img.width * scale))
  const out = Buffer.alloc(targetW * targetH * 4)
  for (let ty = 0; ty < targetH; ty++) {
    const y0 = Math.floor(ty / scale), y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((ty + 1) / scale)))
    for (let tx = 0; tx < targetW; tx++) {
      const x0 = Math.floor(tx / scale), x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((tx + 1) / scale)))
      let r = 0, g = 0, b = 0, n = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4, a = img.data[i + 3] / 255
        r += img.data[i] * a + ground[0] * (1 - a)
        g += img.data[i + 1] * a + ground[1] * (1 - a)
        b += img.data[i + 2] * a + ground[2] * (1 - a)
        n++
      }
      const o = (ty * targetW + tx) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255
    }
  }
  return { width: targetW, height: targetH, data: out }
}

// A 5x7 bitmap face for the panel labels — the one thing a composite must
// carry that a bare paste cannot: which panel is which. Uppercase, digits,
// and the few marks the labels use; an unknown glyph paints as a box so a
// typo is visible rather than blank.
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ':': ['00000', '00100', '00000', '00000', '00000', '00100', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000']
}
const BOX = ['11111', '10001', '10001', '10001', '10001', '10001', '11111']

function drawText(canvas, x, y, text, rgb, px = 3) {
  let cx = x
  for (const ch of String(text).toUpperCase()) {
    const g = GLYPHS[ch] || BOX
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (g[r][c] !== '1') continue
      for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
        const X = cx + c * px + dx, Y = y + r * px + dy
        if (X < 0 || Y < 0 || X >= canvas.width || Y >= canvas.height) continue
        const o = (Y * canvas.width + X) * 4
        canvas.data[o] = rgb[0]; canvas.data[o + 1] = rgb[1]; canvas.data[o + 2] = rgb[2]; canvas.data[o + 3] = 255
      }
    }
    cx += 6 * px
  }
}

function fill(canvas, x, y, w, h, rgb) {
  for (let Y = Math.max(0, y); Y < Math.min(canvas.height, y + h); Y++) for (let X = Math.max(0, x); X < Math.min(canvas.width, x + w); X++) {
    const o = (Y * canvas.width + X) * 4
    canvas.data[o] = rgb[0]; canvas.data[o + 1] = rgb[1]; canvas.data[o + 2] = rgb[2]; canvas.data[o + 3] = 255
  }
}

function blit(canvas, img, x, y) {
  for (let r = 0; r < img.height; r++) {
    const Y = y + r
    if (Y < 0 || Y >= canvas.height) continue
    img.data.copy(canvas.data, (Y * canvas.width + x) * 4, (r * img.width) * 4, (r * img.width + img.width) * 4)
  }
}

const GROUND = [18, 20, 26]
const INK = [236, 238, 244]
const DIM = [120, 126, 140]
const PANEL_H = 560   // every panel is scaled to this height; widths follow their aspect
const GAP = 24
const LABEL_H = 44

/** Compose labelled panels into one RGB PNG buffer: `rows` is an array of
 *  rows, each an array of `{ label, image: {width,height,data} | null, note? }`.
 *  A null image (a golden that does not exist yet) paints its label over an
 *  empty well saying so, so the composite's shape is the same whether or not
 *  a scene has a golden, and the absence is visible rather than skipped.
 *  Rows rather than one strip because two references beside a golden and a
 *  capture is ~3600 px wide, and a critic's image reader downsamples that to
 *  where a label is no longer a word. */
function compose(title, rows) {
  const scaledRows = rows.map((row) => row.map((p) => ({ ...p, image: p.image ? scaleTo(p.image, PANEL_H, GROUND) : null })))
  const rowWidths = scaledRows.map((row) => row.map((p) => (p.image ? p.image.width : Math.round(PANEL_H * 1.5))))
  const width = Math.max(...rowWidths.map((ws) => GAP + ws.reduce((a, w) => a + w + GAP, 0)))
  const rowH = LABEL_H + PANEL_H + LABEL_H
  const height = LABEL_H + rows.length * (rowH + GAP)
  const canvas = { width, height, data: Buffer.alloc(width * height * 4) }
  fill(canvas, 0, 0, width, height, GROUND)
  drawText(canvas, GAP, 14, title, INK, 2)
  let n = 0
  scaledRows.forEach((row, ri) => {
    let x = GAP
    const y = LABEL_H + ri * (rowH + GAP) + LABEL_H
    row.forEach((p, i) => {
      n++
      drawText(canvas, x, y - 22, `${n}  ${p.label}`, INK, 2)
      if (p.image) blit(canvas, p.image, x, y)
      else {
        fill(canvas, x, y, rowWidths[ri][i], PANEL_H, [30, 32, 40])
        drawText(canvas, x + 20, y + PANEL_H / 2 - 10, 'NO IMAGE', DIM, 3)
      }
      if (p.note) drawText(canvas, x, y + PANEL_H + 12, p.note, DIM, 2)
      x += rowWidths[ri][i] + GAP
    })
  })
  return encodePNG(canvas)
}

const resolve = (p, from) => (isAbsolute(p) ? p : existsSync(join(from, p)) ? join(from, p) : join(ROOT, p))
const load = (p, from) => (p && existsSync(resolve(p, from)) ? decodePNG(readFileSync(resolve(p, from)), p) : null)

/** For every manifest entry with a `reference`, write
 *  <shotDir>/<scene>.vs-reference.png: reference(s) | golden | fresh capture.
 *  Returns the paths written. Pure file work; safe to call from inside the
 *  Electron harness or from the CLI on an old shot dir. */
function composeManifest(shotDir, manifest = JSON.parse(readFileSync(join(shotDir, 'manifest.json'), 'utf8'))) {
  const written = []
  for (const entry of manifest) {
    if (!entry.reference || entry.failed) continue
    const scene = entry.file.replace(/\.png$/, '')
    const refs = Array.isArray(entry.reference) ? entry.reference : [entry.reference]
    const references = refs.map((r) => ({ label: `REFERENCE: ${r.replace(/^docs\//, '')}`, image: load(r, ROOT), note: 'THE ART DIRECTION. NOT EVERY FEATURE IS TO BE COPIED - SEE THE BRIEF' }))
    const goldenPath = join(ROOT, 'verify', 'visual', 'goldens', `${scene}.png`)
    const judged = [
      { label: 'LAST GOLDEN (WHAT THE PREVIOUS CRITIC ACCEPTED)', image: load(goldenPath, ROOT), note: existsSync(goldenPath) ? 'VERIFY/VISUAL/GOLDENS' : 'NO GOLDEN COMMITTED FOR THIS SCENE YET' },
      { label: 'CURRENT CAPTURE (JUDGE THIS ONE)', image: load(join(shotDir, entry.file), shotDir), note: `OUT/SHOTS/${entry.file}` }
    ]
    const outPath = join(shotDir, `${scene}.vs-reference.png`)
    writeFileSync(outPath, compose(`${scene} - REFERENCE (ROW 1) VS CURRENT (ROW 2)`, [references, judged]))
    written.push(outPath)
  }
  return written
}

module.exports = { decodePNG, encodePNG, compose, composeManifest }

if (require.main === module) {
  const dir = process.argv[2] ? resolve(process.argv[2], process.cwd()) : join(ROOT, 'out', 'shots')
  const written = composeManifest(dir)
  if (written.length === 0) { console.log(`no manifest entry in ${dir} names a reference`); process.exit(1) }
  for (const w of written) console.log(`wrote ${w}`)
}
