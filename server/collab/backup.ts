/**
 * M347. Backups of the collab server's rooms, as JSON lines, and the restore
 * that reads them back — pure over a DocStore (persistence.ts), so
 * verify:canvas-sync runs both on PGlite. `backup-main.ts` is the CLI the VM's
 * daily timer runs (deploy/tc-collab-backup.timer).
 *
 * A dump is one header line, then one line per room (its stored state), then
 * — with `snapshots` — one per snapshot. States are base64. A dump carries the
 * whole canvas of every shared room, so it is written 0600 into a 0700
 * directory on the VM (backup-main.ts) and never leaves it on its own: copying
 * it off the machine is the operator's decision, the same as the database.
 *
 * WHAT A RESTORE IS FOR. A room the SERVER lost — a wiped database, a
 * corrupted row. It is not "undo": a CRDT set back to an older state is merged
 * forward again by any member whose app still holds newer state. So a restore
 * REFUSES a room that exists unless forced, and says which it skipped.
 */
import type { DocStore, SnapshotReason } from './persistence'

export const BACKUP_VERSION = 1

export type BackupLine =
  | { kind: 'header'; version: number; takenAt: string; rooms: number }
  | { kind: 'room'; name: string; updatedAt: string; state: string }
  | { kind: 'snapshot'; name: string; takenAt: string; reason: SnapshotReason; state: string }

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')
const fromB64 = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, 'base64'))

export interface DumpResult { rooms: number; snapshots: number; bytes: number }

/** Every room (and, with `snapshots`, each room's history) as JSON lines through `write`. */
export async function dumpRooms(store: DocStore, write: (line: string) => void, opts: { snapshots?: boolean; now?: () => Date } = {}): Promise<DumpResult> {
  const rooms = await store.rooms()
  write(JSON.stringify({ kind: 'header', version: BACKUP_VERSION, takenAt: (opts.now ?? (() => new Date()))().toISOString(), rooms: rooms.length } satisfies BackupLine))
  let bytes = 0, snapshots = 0
  for (const room of rooms) {
    const state = await store.load(room.name)
    if (state === null) continue
    bytes += state.byteLength
    write(JSON.stringify({ kind: 'room', name: room.name, updatedAt: room.updatedAt, state: b64(state) } satisfies BackupLine))
    if (opts.snapshots !== true) continue
    for (const snap of await store.snapshots(room.name)) {
      const s = await store.snapshotState(snap.id)
      if (s === null) continue
      snapshots += 1
      write(JSON.stringify({ kind: 'snapshot', name: room.name, takenAt: snap.takenAt, reason: snap.reason, state: b64(s.state) } satisfies BackupLine))
    }
  }
  return { rooms: rooms.length, snapshots, bytes }
}

export interface RestoreResult { restored: string[]; skipped: Array<{ name: string; why: string }> }

/**
 * Put rooms back from a dump's lines. `room` restricts it to one room; a room
 * the store already has is SKIPPED unless `force` (see the header for why).
 * A malformed dump is refused before anything is written.
 */
export async function restoreRooms(store: DocStore, lines: Iterable<string>, opts: { room?: string; force?: boolean } = {}): Promise<RestoreResult> {
  const parsed: BackupLine[] = []
  for (const raw of lines) {
    if (raw.trim() === '') continue
    const line = JSON.parse(raw) as BackupLine
    parsed.push(line)
  }
  const header = parsed[0]
  if (header === undefined || header.kind !== 'header' || header.version !== BACKUP_VERSION) {
    throw new Error(`not a collab backup (version ${BACKUP_VERSION}): the first line is not its header`)
  }
  const out: RestoreResult = { restored: [], skipped: [] }
  for (const line of parsed) {
    if (line.kind !== 'room') continue
    if (opts.room !== undefined && line.name !== opts.room) continue
    if (opts.force !== true && (await store.load(line.name)) !== null) {
      out.skipped.push({ name: line.name, why: 'the room exists — a restore is for a room the server lost; pass --force to replace it' })
      continue
    }
    await store.store(line.name, fromB64(line.state))
    out.restored.push(line.name)
  }
  return out
}
