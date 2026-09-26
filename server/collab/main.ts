/**
 * `npm run collab` — the collab server from the environment:
 *
 *   TC_SUPABASE_URL            https://<project>.supabase.co  (the app's own variable)
 *   TC_SUPABASE_ANON_KEY       the project's anon key          (the app's own variable)
 *   TC_COLLAB_PORT             default 1234
 *   TC_COLLAB_ADDRESS          default 127.0.0.1 — put TLS in front before binding wider:
 *                              the app refuses a non-local ws:// (presence-hub.ts
 *                              readPresenceConfig), and so should this.
 *   TC_COLLAB_DATABASE_URL     M346. A Postgres connection string for the `collab`
 *                              schema (supabase/migrations/20260926120000_collab_documents.sql).
 *                              Absent, rooms live only in memory, as before M346 —
 *                              said once at startup, never silently.
 *   TC_COLLAB_SNAPSHOT_MINUTES M346. The shortest time between two snapshots of a room.
 *                              Default 60.
 *
 * The connection string is the one server secret here. It lives in the VM's
 * env file (deploy/collab.env.example), readable by the service user alone,
 * and never reaches a client: the app ships the anon key, which the schema
 * refuses outright.
 */
import { Pool } from 'pg'
import { createCollabAuth } from './auth'
import { createLog } from './log'
import { createPgDocStore } from './persistence'
import { createCollabServer } from './server'

const log = createLog()
const url = process.env['TC_SUPABASE_URL']
const anonKey = process.env['TC_SUPABASE_ANON_KEY']
if (url === undefined || anonKey === undefined || url === '' || anonKey === '') {
  log('config.failed', { reason: 'set TC_SUPABASE_URL and TC_SUPABASE_ANON_KEY' })
  process.exit(2)
}
const port = Number(process.env['TC_COLLAB_PORT'] ?? '1234')
const address = process.env['TC_COLLAB_ADDRESS'] ?? '127.0.0.1'
const databaseUrl = process.env['TC_COLLAB_DATABASE_URL'] ?? ''
const snapshotMinutes = Number(process.env['TC_COLLAB_SNAPSHOT_MINUTES'] ?? '60')

const pool = databaseUrl === '' ? null : new Pool({ connectionString: databaseUrl, max: 4 })
pool?.on('error', (error) => log('db.pool_error', { error: error.message }))
const store = pool === null ? undefined : createPgDocStore((sql, params) => pool.query(sql, params))

const server = createCollabServer({
  authenticate: createCollabAuth({ supabaseUrl: url, anonKey, fetch: (u, init) => fetch(u, init) }),
  port,
  address,
  quiet: true,
  ...(store === undefined ? {} : { store }),
  snapshotEveryMs: (Number.isFinite(snapshotMinutes) && snapshotMinutes > 0 ? snapshotMinutes : 60) * 60 * 1000,
  log,
  onRefused: ({ documentName, userId, reason }) => log('update.refused', { room: documentName, user: userId, reason })
})
void server.listen().then(() => log('server.listening', { url: `ws://${address}:${port}`, persisted: store !== undefined }))
if (store === undefined) log('config.memory_only', { reason: 'TC_COLLAB_DATABASE_URL is not set — rooms are not kept across a restart' })

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    log('server.stopping', { signal: sig })
    // destroy() stores every loaded room before it lets go; the pool closes after.
    void server.destroy().then(() => pool?.end()).then(() => process.exit(0), () => process.exit(1))
  })
}
