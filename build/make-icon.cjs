/* The app icon, authored as code (M60): three terminal panels on a dark grid,
   drawn as raw RGBA and encoded as a PNG with zlib — no dependencies, so the
   icon is reproducible from source. `npm run icon` runs this, then sips and
   iconutil turn the PNG into build/icon.icns. */
const { deflateSync } = require('node:zlib')
const { writeFileSync } = require('node:fs')
const N = 1024
const px = Buffer.alloc(N * N * 4)
const set = (x, y, r, g, b, a = 255) => { const i = (y * N + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a }
const inRound = (x, y, x0, y0, w, h, rad) => {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false
  const cx = Math.max(x0 + rad, Math.min(x, x0 + w - rad)), cy = Math.max(y0 + rad, Math.min(y, y0 + h - rad))
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad
}
// Panels: (x, y, w, h, colour) in a 0..1024 frame — a canvas of three terminals.
const panels = [
  [140, 210, 470, 330, [247, 118, 142]],
  [470, 330, 420, 300, [122, 162, 247]],
  [230, 600, 380, 230, [158, 206, 106]]
]
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (!inRound(x, y, 0, 0, N, N, 230)) { set(x, y, 0, 0, 0, 0); continue }
  // ground: deep slate with a soft vignette
  const d = Math.hypot(x - 512, y - 512) / 724
  const g = Math.round(26 + 10 * (1 - d))
  set(x, y, g, g + 4, g + 12)
  if ((x % 64 === 0 || y % 64 === 0) && d < 0.98) set(x, y, g + 14, g + 18, g + 28)
}
for (const [x0, y0, w, h, c] of panels) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!inRound(x, y, x0, y0, w, h, 28)) continue
    const edge = x - x0 < 6 || y - y0 < 6 || x0 + w - x <= 6 || y0 + h - y <= 6
    if (edge) set(x, y, c[0], c[1], c[2])
    else if (y - y0 < 54) set(x, y, Math.round(c[0] * 0.35 + 20), Math.round(c[1] * 0.35 + 20), Math.round(c[2] * 0.35 + 26))
    else set(x, y, 18, 20, 28)
  }
  // a prompt block and a cursor line in each well
  for (let y = y0 + 90; y < y0 + 110; y++) for (let x = x0 + 40; x < x0 + 70; x++) set(x, y, c[0], c[1], c[2])
  for (let y = y0 + 92; y < y0 + 108; y++) for (let x = x0 + 90; x < x0 + Math.min(w - 40, 260); x++) set(x, y, 200, 205, 215)
}
// PNG encode
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]) }
const raw = Buffer.alloc((N * 4 + 1) * N)
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4) }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
writeFileSync(process.argv[2], png)
console.log(`wrote ${process.argv[2]} (${png.length} bytes)`)
