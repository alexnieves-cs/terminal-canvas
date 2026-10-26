/**
 * M563 (lane L). A MINIMAL MP4 WRITER — one H.264 video track, no audio.
 *
 * The film is encoded by WebCodecs in the renderer, which hands back raw
 * H.264 access units in AVCC form and the `avcC` decoder record; an MP4 is
 * those samples plus an index. Written here rather than taken from a library
 * because the index for one track is a dozen fixed boxes, a dependency would
 * join the library layer's door table for that, and a pure writer can be
 * read back box by box by the plain-node suite.
 *
 * The `moov` goes BEFORE `mdat` (a "fast start" file), so a player can begin
 * without seeking to the end — the shape a README or a chat preview wants.
 * Everything lives in one chunk, so `stco` holds a single offset.
 *
 * Pure: bytes in, bytes out. `verify:film film.mux.*`.
 */

export interface Mp4Sample {
  data: Uint8Array
  /** In `timescale` units. */
  duration: number
  key: boolean
}

export interface Mp4Track {
  width: number
  height: number
  /** Units per second for every duration here. */
  timescale: number
  /** The AVCDecoderConfigurationRecord — WebCodecs' `decoderConfig.description`. */
  avcC: Uint8Array
  samples: readonly Mp4Sample[]
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
const u8 = (n: number): number[] => [n & 0xff]
const u16 = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff]
const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const zeros = (n: number): number[] => new Array<number>(n).fill(0)

type Part = number[] | Uint8Array

function concat(parts: readonly Part[]): Uint8Array {
  const size = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

function box(type: string, ...parts: Part[]): Uint8Array {
  const body = concat(parts)
  return concat([u32(body.length + 8), ascii(type), body])
}

const fullBox = (type: string, version: number, flags: number, ...parts: Part[]): Uint8Array =>
  box(type, [version, (flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff], ...parts)

/** The identity matrix, as every header that carries one writes it. */
const MATRIX = [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)]

function sampleTable(track: Mp4Track, chunkOffset: number): Uint8Array {
  const { samples } = track
  // stts is run-length: a constant frame rate is one entry.
  const runs: { count: number; delta: number }[] = []
  for (const s of samples) {
    const last = runs[runs.length - 1]
    if (last !== undefined && last.delta === s.duration) last.count += 1
    else runs.push({ count: 1, delta: s.duration })
  }
  const keys = samples.flatMap((s, i) => (s.key ? [i + 1] : []))
  const avc1 = box('avc1',
    zeros(6), u16(1), // reserved, data reference index
    zeros(16), // pre-defined and reserved
    u16(track.width), u16(track.height),
    u32(0x00480000), u32(0x00480000), // 72 dpi
    u32(0), u16(1), // reserved, one frame per sample
    zeros(32), // compressor name
    u16(0x0018), u16(0xffff), // depth, pre-defined
    box('avcC', track.avcC))
  return box('stbl',
    fullBox('stsd', 0, 0, u32(1), avc1),
    fullBox('stts', 0, 0, u32(runs.length), runs.flatMap((r) => [...u32(r.count), ...u32(r.delta)])),
    fullBox('stss', 0, 0, u32(keys.length), keys.flatMap(u32)),
    fullBox('stsc', 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
    fullBox('stsz', 0, 0, u32(0), u32(samples.length), samples.flatMap((s) => u32(s.data.length))),
    fullBox('stco', 0, 0, u32(1), u32(chunkOffset)))
}

function moov(track: Mp4Track, chunkOffset: number): Uint8Array {
  const duration = track.samples.reduce((n, s) => n + s.duration, 0)
  const mvhd = fullBox('mvhd', 0, 0,
    u32(0), u32(0), u32(track.timescale), u32(duration),
    u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2))
  const tkhd = fullBox('tkhd', 0, 0x000003,
    u32(0), u32(0), u32(1), u32(0), u32(duration),
    zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX,
    u32(track.width << 16), u32(track.height << 16))
  const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(track.timescale), u32(duration), u16(0x55c4), u16(0))
  const hdlr = fullBox('hdlr', 0, 0, u32(0), ascii('vide'), zeros(12), ascii('VideoHandler'), u8(0))
  const minf = box('minf',
    fullBox('vmhd', 0, 1, zeros(8)),
    box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
    sampleTable(track, chunkOffset))
  return box('moov', mvhd, box('trak', tkhd, box('mdia', mdhd, hdlr, minf)))
}

export function muxMp4(track: Mp4Track): Uint8Array {
  if (track.samples.length === 0) throw new Error('a film needs at least one frame')
  if (!track.samples[0]!.key) throw new Error('the first frame must be a key frame')
  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'))
  // The moov's size does not depend on the offset's VALUE, so measure it with
  // a placeholder, then write it for real with the offset it implies.
  const moovSize = moov(track, 0).length
  const offset = ftyp.length + moovSize + 8
  const mdat = box('mdat', ...track.samples.map((s) => s.data))
  return concat([ftyp, moov(track, offset), mdat])
}

/** A box tree read back, for the suite and for a sanity check before a write. */
export interface Mp4Box { type: string; start: number; size: number; children?: Mp4Box[] }

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf'])

export function readMp4Boxes(bytes: Uint8Array, start = 0, end = bytes.length): Mp4Box[] {
  const out: Mp4Box[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = start
  while (at + 8 <= end) {
    const size = view.getUint32(at)
    if (size < 8 || at + size > end) throw new Error(`a box at ${at} runs past its parent`)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    out.push({ type, start: at, size, ...(CONTAINERS.has(type) ? { children: readMp4Boxes(bytes, at + 8, at + size) } : {}) })
    at += size
  }
  if (at !== end) throw new Error('trailing bytes after the last box')
  return out
}
