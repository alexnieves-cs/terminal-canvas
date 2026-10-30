/**
 * M562–M563 (lane L). The night film's two doors in main: what the night
 * left on record, and writing the finished film to a file the person picks.
 *
 * The renderer draws and encodes (WebCodecs is a renderer API); main reads
 * the record and owns the save dialog, the same split as the canvas PNG.
 * The record is read here rather than through `ledger:timeline` because that
 * door is capped at 200 rows for the panes, and a night's record is longer.
 *
 * The bytes coming back are checked to BE a film before anything is written
 * — an MP4 box tree of the shape `mp4-mux.ts` writes, under a size cap — so
 * this door writes nothing but a film of that shape, under an .mp4 name. The words in
 * the frames were already scrubbed by `outward` when the script was built
 * (shared/night-film.ts); the count travels with the request and is
 * reported back with the path.
 *
 * Injected deps, plain-node tested by `verify:film film.door.*`.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { readMp4Boxes, type Mp4Box } from '../shared/mp4-mux'
import type { NightFilmExportRequest, NightFilmExportResult, NightFilmRecord, NightFilmRecordRequest } from '../shared/export'
import { RUN_LEDGER_MAX_LINES } from './run-ledger'
import type { TimelineEntry, TimelineFilter, TimelineRead } from '../shared/run-ledger'
import type { TonightStatus } from '../shared/tonight'
import { writeFileAtomic } from './atomic-file'

/** A minute of 720p at a few Mbit/s is ~30 MB; anything near this is not our film. */
export const NIGHT_FILM_MAX_BYTES = 128 * 1024 * 1024
/** A "night" longer than a day is a typo in a time, not a night. */
export const NIGHT_FILM_MAX_SPAN_MS = 24 * 60 * 60_000
/** The whole ledger at its own cap, so the script can tell which panels already existed. */
const RECORD_ROWS = RUN_LEDGER_MAX_LINES

export interface FilmDoorDeps {
  timeline: (filter: TimelineFilter, limit: number) => Promise<TimelineRead>
  tonight: () => TonightStatus | null
  askPath: (suggested: string) => Promise<string | null>
  write?: (path: string, data: Buffer) => void
  now?: () => Date
}

export interface FilmDoors {
  filmNight(req: NightFilmRecordRequest): Promise<NightFilmRecord>
  nightFilm(req: NightFilmExportRequest): Promise<NightFilmExportResult>
}

const atomicWrite = (path: string, data: Buffer): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileAtomic(path, data, { mode: 0o600 })
}

const day = (d: Date): string => d.toISOString().slice(0, 10)

const isTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/**
 * Whether `bytes` is exactly the shape `mp4-mux.ts` writes: ftyp → moov →
 * mdat, one video track whose sample entry is avc1, and an index that
 * accounts for every byte of mdat (the one chunk starts at its payload and
 * the sample sizes add up to it). A file that only LOOKS like an MP4 at the
 * top, with arbitrary bytes after its header, is not a film this app made.
 */
export function isFilmBytes(bytes: Uint8Array): boolean {
  try {
    const top = readMp4Boxes(bytes)
    if (top.map((b) => b.type).join() !== 'ftyp,moov,mdat') return false
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const kid = (b: Mp4Box | undefined, t: string): Mp4Box | undefined => b?.children?.find((c) => c.type === t)
    const mdia = kid(kid(top[1], 'trak'), 'mdia')
    const hdlr = mdia?.children?.find((c) => c.type === 'hdlr')
    const stbl = kid(kid(mdia, 'minf'), 'stbl')
    const box = (t: string): Mp4Box | undefined => stbl?.children?.find((c) => c.type === t)
    const stsd = box('stsd'), stsz = box('stsz'), stco = box('stco')
    if (hdlr === undefined || stsd === undefined || stsz === undefined || stco === undefined) return false
    const word = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4))
    if (word(hdlr.start + 16) !== 'vide' || word(stsd.start + 20) !== 'avc1') return false
    const mdat = top[2]!
    if (v.getUint32(stco.start + 12) !== 1 || v.getUint32(stco.start + 16) !== mdat.start + 8) return false
    if (v.getUint32(stsz.start + 12) !== 0) return false
    const count = v.getUint32(stsz.start + 16)
    if (stsz.size !== 20 + count * 4) return false
    let sum = 0
    for (let i = 0; i < count; i += 1) sum += v.getUint32(stsz.start + 20 + i * 4)
    return count > 0 && sum === mdat.size - 8
  } catch {
    return false
  }
}

export function createFilmDoors(deps: FilmDoorDeps): FilmDoors {
  const write = deps.write ?? atomicWrite
  const now = deps.now ?? (() => new Date())
  return {
    async filmNight(req) {
      if (typeof req !== 'object' || req === null || !isTime(req.from) || !isTime(req.to)) return { kind: 'refused', reason: 'the night has no start or end' }
      if (req.to <= req.from) return { kind: 'refused', reason: 'the night ends before it starts' }
      if (req.to - req.from > NIGHT_FILM_MAX_SPAN_MS) return { kind: 'refused', reason: 'a night is at most a day long' }
      let read: TimelineRead
      try {
        read = await deps.timeline({}, RECORD_ROWS)
      } catch (error: unknown) {
        return { kind: 'refused', reason: error instanceof Error ? error.message : String(error) }
      }
      // Only the night itself crosses the bridge: rows before it are reduced to
      // which panels they name, rows after it are the morning's, and tool rows
      // are never a shot. RECORD_ROWS is the ledger's own line cap, so the read
      // is the whole file, not its newest slice.
      const entries: TimelineEntry[] = []
      const seenBefore = new Set<string>()
      for (const e of read.entries) {
        if (e.kind === 'gap') continue
        const at = e.kind === 'command' ? e.row.endedAt : e.row.at
        const start = e.kind === 'command' ? e.row.startedAt : e.row.at
        if (start < req.from && e.row.panelId !== undefined) seenBefore.add(e.row.panelId)
        if (at < req.from || at > req.to) continue
        if (e.kind === 'event' && e.row.event === 'tool') continue
        entries.push(e)
      }
      return { kind: 'ok', entries, seenBefore: [...seenBefore], tonight: deps.tonight() }
    },
    async nightFilm(req) {
      const bytes = req?.bytes
      if (!(bytes instanceof Uint8Array) || bytes.length === 0) return { kind: 'failed', reason: 'there is no film to save' }
      if (bytes.length > NIGHT_FILM_MAX_BYTES) return { kind: 'failed', reason: 'the film is larger than a film of one night can be' }
      if (!isFilmBytes(bytes)) return { kind: 'failed', reason: 'that is not a film this app made' }
      // The renderer's count from the script; main cannot recount pixels, so it reports what it was told.
      const redacted = typeof req.redacted === 'number' && Number.isInteger(req.redacted) && req.redacted > 0 ? req.redacted : 0
      const seconds = typeof req.seconds === 'number' && Number.isFinite(req.seconds) && req.seconds > 0 ? Math.round(req.seconds) : 0
      const picked = await deps.askPath(`last-night-${day(now())}.mp4`)
      if (picked === null) return { kind: 'cancelled' }
      // The dialog's filter suggests .mp4; it does not enforce it.
      const path = /\.mp4$/i.test(picked) ? picked : `${picked}.mp4`
      try {
        write(path, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
      } catch (error: unknown) {
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
      return { kind: 'written', path, seconds, redacted }
    }
  }
}
