import { muxMp4, type Mp4Sample } from '@shared/mp4-mux'
import { FILM_SIZE, filmFrame, filmFrameCount, type FilmScript } from '@shared/night-film'
import { paintFilmFrame, type FilmContext } from './film-paint'

/**
 * M562–M563 (lane L). Draws every frame of a script offscreen and encodes
 * them to H.264 with WebCodecs, then writes the MP4 with `mp4-mux.ts`.
 *
 * Offscreen and from the script, never a capture of the window: the frames
 * hold only words that passed `outward` (see night-film.ts), and the person
 * keeps using the canvas while a minute of film renders in a few seconds.
 * WebCodecs uses the Mac's hardware encoder where it has one; nothing here
 * spawns a process or needs ffmpeg.
 */

/** High profile, level 4.0 (1280x720 at 30 fps), then Baseline 3.1 for a build that lacks High. */
const CODECS = ['avc1.640028', 'avc1.42001f']
const BITRATE = 4_000_000
/** A key frame every two seconds, so a player can seek. */
const KEY_EVERY_S = 2
/** Frames the encoder may hold before drawing waits for it. */
const QUEUE_MAX = 8

export interface FilmEncodeResult { bytes: Uint8Array; frames: number; seconds: number; codec: string }

export interface FilmEncodeOptions {
  onProgress?: (done: number, total: number) => void
  clock?: (ms: number) => string
}

/**
 * A yield that is not throttled: setTimeout(0) is clamped to a second while
 * the window is in the background, which would stretch a ten-second render
 * to minutes for a person who switched apps while it ran.
 */
const yieldToUi = (): Promise<void> => new Promise((resolve) => {
  const ch = new MessageChannel()
  ch.port1.onmessage = () => { ch.port1.close(); resolve() }
  ch.port2.postMessage(null)
})
/** An encoder that holds frames this long without returning one has stalled. */
const STALL_MS = 30_000

/** The first H.264 config this build can encode, or null when it can encode none. */
export async function filmCodec(): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  for (const codec of CODECS) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: FILM_SIZE.w, height: FILM_SIZE.h, bitrate: BITRATE, framerate: 30, avc: { format: 'avc' } })
      if (r.supported === true) return codec
    } catch { /* an unknown codec string throws on some builds; try the next */ }
  }
  return null
}

export async function encodeFilm(script: FilmScript, opts: FilmEncodeOptions = {}): Promise<FilmEncodeResult> {
  return encodeFrames({
    width: FILM_SIZE.w,
    height: FILM_SIZE.h,
    fps: script.fps,
    total: filmFrameCount(script),
    paint: (ctx, i) => paintFilmFrame(ctx as unknown as FilmContext, filmFrame(script, (i * 1000) / script.fps, opts.clock), script),
    onProgress: opts.onProgress
  })
}

/**
 * M699. The encoder loop on its own, for a second film drawn from its own
 * script (the fleet wall's time-lapse). The night film is the first caller and
 * still the reference: same codecs, bitrate, key spacing and queue bound, so
 * the two films cannot diverge into two encoders. The painter draws frame `i`
 * on a canvas this function owns; every word it draws is the caller's to have
 * passed `outward` first (night-film.ts and fleet-film.ts both do).
 */
export interface FrameEncodeJob {
  width: number
  height: number
  fps: number
  total: number
  paint: (ctx: OffscreenCanvasRenderingContext2D, index: number) => void
  onProgress?: (done: number, total: number) => void
}

export async function encodeFrames(job: FrameEncodeJob): Promise<FilmEncodeResult> {
  const codec = await filmCodec()
  if (codec === null) throw new Error('this build cannot encode H.264 video')
  const canvas = new OffscreenCanvas(job.width, job.height)
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2D canvas to draw the film on')
  const total = job.total
  const frameUs = 1_000_000 / job.fps
  const samples: Mp4Sample[] = []
  let avcC: Uint8Array | null = null
  let failure: Error | null = null
  let lastTs = -Infinity
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const desc = meta?.decoderConfig?.description
      if (avcC === null && desc !== undefined) {
        // A copy, whichever shape the build hands back: the encoder may reuse its buffer.
        avcC = ArrayBuffer.isView(desc) ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength).slice() : new Uint8Array(desc).slice()
      }
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      // Durations in the MP4's own timescale (fps × 1000 per second): one frame is 1000.
      // The MP4 has no composition offsets (ctts), so samples must arrive in
      // presentation order; an encoder that reorders (B-frames) is refused by
      // name rather than written as a film that stutters.
      if (chunk.timestamp < lastTs) failure = new Error('the encoder reordered frames, which this film writer cannot store')
      lastTs = chunk.timestamp
      samples.push({ data, duration: 1000, key: chunk.type === 'key' })
    },
    error: (e) => { failure = e instanceof Error ? e : new Error(String(e)) }
  })
  encoder.configure({ codec, width: job.width, height: job.height, bitrate: BITRATE, framerate: job.fps, avc: { format: 'avc' } })
  try {
    for (let i = 0; i < total; i += 1) {
      if (failure !== null) throw failure
      job.paint(ctx, i)
      const video = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) })
      encoder.encode(video, { keyFrame: i % (job.fps * KEY_EVERY_S) === 0 })
      video.close()
      const waitFrom = performance.now()
      while (encoder.encodeQueueSize > QUEUE_MAX) {
        if (failure !== null) throw failure
        if (performance.now() - waitFrom > STALL_MS) throw new Error('the video encoder stopped responding')
        await yieldToUi()
      }
      if (i % job.fps === 0) { job.onProgress?.(i, total); await yieldToUi() }
    }
    await encoder.flush()
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
  if (failure !== null) throw failure
  if (avcC === null) throw new Error('the encoder gave no decoder record')
  job.onProgress?.(total, total)
  return { bytes: muxMp4({ width: job.width, height: job.height, timescale: job.fps * 1000, avcC, samples }), frames: samples.length, seconds: samples.length / job.fps, codec }
}
