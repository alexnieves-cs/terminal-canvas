/**
 * M346. The collab server's persistence: each shared room's Y.Doc state in
 * Postgres, plus a bounded history of snapshots.
 *
 * Before M346 a room lived only in the server's memory. It survived a restart
 * only because the members' apps re-seeded it from their own copies (main keeps
 * the doc's bytes in layout.json). A room whose members were all offline when
 * the server restarted came back empty, and a second teammate joining it saw
 * nothing until the first one returned. Now the server keeps the room itself.
 *
 * The store speaks one function, `query(sql, params)`, shaped like both
 * node-postgres's `Pool#query` and PGlite's `query` (each answers `{ rows }`).
 * verify:canvas-sync drives it on PGlite with this module's own SQL, so the
 * statements that run in production are the ones the checks ran.
 *
 * What is persisted is the ROOM, not a person's data. The same bytes already
 * cross the wire to every member, scrubbed at the source (canvas-sync.ts writes
 * titles through redactSecrets; no command, cwd or transcript is in the doc).
 * The table lives in its own schema, `collab`, with every privilege revoked
 * from the anon and authenticated roles: the app's anon key can never read a
 * room's bytes out of PostgREST. Only the collab server's own connection
 * string, held on the VM, reaches it.
 */

export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>

export type SnapshotReason = 'interval' | 'unload' | 'manual'

export interface SnapshotRow { id: number; name: string; takenAt: string; bytes: number; reason: SnapshotReason }

export interface DocStore {
  /** The room's last stored state, or null when it has never been stored. */
  load(name: string): Promise<Uint8Array | null>
  /** Replace the room's stored state (one row per room). */
  store(name: string, state: Uint8Array): Promise<void>
  /** Keep a copy of the state as it is now, and prune the room's history to `keep`. */
  snapshot(name: string, state: Uint8Array, reason: SnapshotReason): Promise<void>
  /** The room's snapshots, newest first. */
  snapshots(name: string): Promise<SnapshotRow[]>
  /** One snapshot's bytes, for `collab:backup --restore`. */
  snapshotState(id: number): Promise<{ name: string; state: Uint8Array } | null>
  /** When the room last took a snapshot (ms since epoch), or null. */
  lastSnapshotAt(name: string): Promise<number | null>
  /** Every stored room, for the backup job. */
  rooms(): Promise<Array<{ name: string; bytes: number; updatedAt: string }>>
}

/**
 * Which rooms are kept: a shared workspace's, named by its share's uuid
 * (M333). An UNSHARED workspace's room is presence only — the canvas maps are
 * nobody's there (canvas-ops.ts, role null) — so it has nothing to keep.
 */
export const PERSISTED_ROOM = /^tc:workspace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** How many snapshots a room keeps: two days of hourly ones. */
export const SNAPSHOT_KEEP = 48

const bytesOf = (v: unknown): Uint8Array => {
  if (v instanceof Uint8Array) return v
  // node-postgres returns Buffer (a Uint8Array); a hex string is PostgREST's
  // and some drivers' text form of bytea.
  if (typeof v === 'string' && v.startsWith('\\x')) return Uint8Array.from(Buffer.from(v.slice(2), 'hex'))
  throw new Error('collab: a stored state was not bytes')
}

export function createPgDocStore(query: Query, opts: { keep?: number } = {}): DocStore {
  const keep = opts.keep ?? SNAPSHOT_KEEP
  return {
    async load(name) {
      const r = await query('select state from collab.documents where name = $1', [name])
      const row = r.rows[0]
      return row === undefined ? null : bytesOf(row['state'])
    },
    async store(name, state) {
      await query(
        `insert into collab.documents (name, state, bytes, updated_at) values ($1, $2, $3, now())
         on conflict (name) do update set state = excluded.state, bytes = excluded.bytes, updated_at = now()`,
        [name, state, state.byteLength]
      )
    },
    async snapshot(name, state, reason) {
      await query('insert into collab.snapshots (name, state, bytes, reason) values ($1, $2, $3, $4)', [name, state, state.byteLength, reason])
      // Pruned in the same breath, so a room's history is bounded by
      // construction rather than by a job someone has to remember to run.
      await query(
        `delete from collab.snapshots where name = $1 and id not in
           (select id from collab.snapshots where name = $1 order by taken_at desc, id desc limit $2)`,
        [name, keep]
      )
    },
    async snapshots(name) {
      const r = await query('select id, name, taken_at, bytes, reason from collab.snapshots where name = $1 order by taken_at desc, id desc', [name])
      return r.rows.map((row) => ({
        id: Number(row['id']), name: String(row['name']), takenAt: new Date(row['taken_at'] as string).toISOString(),
        bytes: Number(row['bytes']), reason: row['reason'] as SnapshotReason
      }))
    },
    async snapshotState(id) {
      const r = await query('select name, state from collab.snapshots where id = $1', [id])
      const row = r.rows[0]
      return row === undefined ? null : { name: String(row['name']), state: bytesOf(row['state']) }
    },
    async lastSnapshotAt(name) {
      const r = await query('select max(taken_at) as at from collab.snapshots where name = $1', [name])
      const at = r.rows[0]?.['at']
      return at === null || at === undefined ? null : new Date(at as string).getTime()
    },
    async rooms() {
      const r = await query('select name, bytes, updated_at from collab.documents order by name')
      return r.rows.map((row) => ({ name: String(row['name']), bytes: Number(row['bytes']), updatedAt: new Date(row['updated_at'] as string).toISOString() }))
    }
  }
}
