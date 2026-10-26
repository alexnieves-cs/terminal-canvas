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
 * this door cannot be used to drop an arbitrary file on disk. The words in
 * the frames were already scrubbed by `outward` when the script was built
 * (shared/night-film.ts); the count travels with the request and is
 * reported back with the path.
 *
 * Injected deps, plain-node tested by `verify:film film.door.*`.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { readMp4Boxes } from '../shared/mp4-mux'
import type { NightFilmExportRequest, NightFilmExportResult, NightFilmRecord, NightFilmRecordRequest } from '../shared/export'
import type { TimelineFilter, TimelineRead } from '../shared/run-ledger'
import type { TonightStatus } from '../shared/tonight'

/** A minute of 720p at a few Mbit/s is ~30 MB; anything near this is not our film. */
export const NIGHT_FILM_MAX_BYTES = 128 * 1024 * 1024
/** A "night" longer than a day is a typo in a time, not a night. */
export const NIGHT_FILM_MAX_SPAN_MS = 24 * 60 * 60_000
/** The whole ledger at its own cap, so the script can tell which panels already existed. */
const RECORD_ROWS = 2000

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
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data, { mode: 0o600 })
  renameSync(tmp, path)
}

const day = (d: Date): string => d.toISOString().slice(0, 10)

const isTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/** Whether `bytes` is a top-level ftyp → moov → mdat file, the only shape the muxer writes. */
export function isFilmBytes(bytes: Uint8Array): boolean {
  try {
    const top = readMp4Boxes(bytes).map((b) => b.type)
    return top.length === 3 && top[0] === 'ftyp' && top[1] === 'moov' && top[2] === 'mdat'
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
      // Rows after the night are the morning's, not the film's.
      const entries = read.entries.filter((e) => (e.kind === 'command' ? e.row.endedAt : e.row.at) <= req.to)
      return { kind: 'ok', entries, tonight: deps.tonight() }
    },
    async nightFilm(req) {
      const bytes = req?.bytes
      if (!(bytes instanceof Uint8Array) || bytes.length === 0) return { kind: 'failed', reason: 'there is no film to save' }
      if (bytes.length > NIGHT_FILM_MAX_BYTES) return { kind: 'failed', reason: 'the film is larger than a film of one night can be' }
      if (!isFilmBytes(bytes)) return { kind: 'failed', reason: 'that is not a film this app made' }
      const redacted = typeof req.redacted === 'number' && Number.isInteger(req.redacted) && req.redacted > 0 ? req.redacted : 0
      const seconds = typeof req.seconds === 'number' && Number.isFinite(req.seconds) && req.seconds > 0 ? Math.round(req.seconds) : 0
      const path = await deps.askPath(`last-night-${day(now())}.mp4`)
      if (path === null) return { kind: 'cancelled' }
      try {
        write(path, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
      } catch (error: unknown) {
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
      return { kind: 'written', path, seconds, redacted }
    }
  }
}
