# M346 — the collab server keeps its rooms

**Verdict: shipped.** The first milestone of Arc 1 (making the collaboration layer
production-grade). Until now `server/collab` kept every room in memory only. A room
survived a server restart only because its members' apps re-seeded it from their own
copies, so a teammate who joined a restarted server while the owner was offline saw an
EMPTY canvas. Shared rooms are now stored in Postgres as they change, loaded before
anyone syncs, and snapshotted with a bounded history. The server also gains a
`GET /healthz` and structured JSON logs. `npm run collab` could not start at all since
M333, and it runs again (see below). Built 2026-09-26 on local `main` on top of M345.

## What landed

- **`server/collab/persistence.ts`**. A `DocStore` over one `query(sql, params)` function,
  shaped like both node-postgres's `Pool#query` and PGlite's `query`, so production and
  the checks run the same SQL:
  - `load` / `store`: one row per room, an upsert;
  - `snapshot`: the insert and the prune in the same breath, so a room's history is
    bounded (48 by default, two days hourly) by construction, not by a job someone has
    to remember;
  - `snapshots` / `snapshotState`: the history, and one snapshot's bytes;
  - `lastSnapshotAt` / `rooms`.

  Only a SHARE's room is kept (`PERSISTED_ROOM`: `tc:workspace:<uuid>`). An unshared
  workspace's room is presence only, and the canvas maps there belong to nobody.
- **`supabase/migrations/20260926120000_collab_documents.sql`**: `collab.documents` and
  `collab.snapshots` in a schema of their own. Every privilege is revoked from `public`,
  `anon` and `authenticated`, the roles PostgREST serves. The app ships the anon key, and
  a room's bytes are a whole canvas, so they must not be one REST call away. The
  table's CHECK refuses any name that is not a share's.
- **`server/collab/server.ts`**:
  - `onLoadDocument` applies the stored state before anyone syncs, and clears any Team
    view snapshots, which are published only while someone watches (nobody does after a
    restart);
  - `onStoreDocument` (Hocuspocus's debounce, and once more on unload) stores the state
    and takes an interval snapshot;
  - a failed store is logged and never thrown, because a save failure must not close a
    room people are working in;
  - `onRequest` answers `GET /healthz` with `{ ok, rooms, connections, uptimeS,
    persisted }`: counts, never a room name.
- **`server/collab/log.ts`**: one JSON object per event on stdout, with a level derived from
  the event name (`*failed*`/`*error*` → error, `*refused*`/`*denied*` → warn), so an alert
  matches an event rather than a phrase. Content is never logged: room names, user ids,
  sizes, timings and error messages only.
- **`server/collab/main.ts`**:
  - reads `TC_COLLAB_DATABASE_URL` (a node-postgres pool, max 4) and
    `TC_COLLAB_SNAPSHOT_MINUTES` (default 60);
  - with no database, logs `config.memory_only` once at startup, never silently;
  - on SIGTERM, `destroy()` stores every loaded room before the pool closes.
- **`npm run collab` runs again** (`scripts/collab-server.cjs`). Hocuspocus 4's bundled
  crossws calls `createRequire(import.meta.url)`, which esbuild's CJS output leaves
  undefined, so the server threw at LOAD from M333 on. Nobody saw it: `verify:canvas-sync`
  keeps packages external and never bundles the server. A banner now gives
  `import.meta.url` a real file URL. `pg-native` (node-postgres's optional binding) is
  external.

## Decisions, and why

- **Postgres through a connection string held on the VM, not PostgREST with a service
  key.** A service key in the collab server could read or write every table in the
  project. The `collab` schema's connection can reach that schema alone if the operator
  gives it a role of its own (M347's operator doc describes one). The app's anon key
  cannot see the schema at all.
- **Snapshots are for recovery and inspection, and restoring one is not "undo".** A
  CRDT restored to an older state is merged back up by any client still holding newer
  state. A snapshot restores a room the SERVER lost (a wiped database, a corrupted row),
  not one a person wants rewound. Per-node rewind is Arc 2's, on the node's own history.
- **Store failures are logged, not thrown.** Throwing from `onStoreDocument` would close
  the room for everyone. The next change stores it again, and the log line is what an
  alert watches (M347).
- **PGlite as a dev dependency** (`@electric-sql/pglite`, 0.5.8). The M330 ledger left
  the RLS harness uncommitted because it would have needed this. Here it lets the
  migration and the store's SQL run on real Postgres semantics inside `npm run verify`,
  with no Docker and no network. `pg` and `@types/pg` are dev dependencies too: the
  server is bundled by esbuild, and nothing in the Electron app imports them.

## Checks

`verify:canvas-sync` (68/68), new:
- `persist.schema.1`: the migration runs on PGlite, and neither `anon` nor `authenticated`
  has usage on the schema or any privilege on either table.
- `persist.store.1`: load null → store → replace → `rooms()`.
- `persist.snap.1`: five snapshots with a bound of three leave three, newest first, and
  one reads back by id.
- `persist.name.1`: the table refuses a non-share name (`documents_name_check`).
- `persist.room.1`: two REAL Hocuspocus servers over one store. The owner writes a panel
  on the first; it is stored; the first server is destroyed; a teammate joins the second
  with the owner gone and receives the panel.
- `persist.room.2`: the presence-only room is not written.
- `persist.team.1`: a Team snapshot does not survive the restart.
- `persist.snap.2`: the server snapshots on its interval.
- `persist.health.1`: `/healthz` answers counts and no room name.
- `persist.log.1`: `room.loaded` is logged by name, size and time, never by content.

Hand-run on 2026-09-26, against a throwaway local `postgres:16-alpine` in Docker, since
the live project's database credentials are not on this Mac:
- the migration applies with `ON_ERROR_STOP`;
- through node-postgres's `Pool`, a state round-trips byte for byte and comes back a
  `Uint8Array` (pg's `Buffer`), four snapshots under a bound of two leave two with the
  newest readable, and `anon` has no select while `authenticated` has no usage;
- the real bundle (`npm run collab` with `TC_COLLAB_DATABASE_URL`) logs
  `server.listening … persisted:true`, answers
  `{"ok":true,"rooms":0,"connections":0,"uptimeS":0,"persisted":true}` on `/healthz`, and
  on SIGTERM logs `server.stopping` and exits 0;
- with no configuration it refuses by name
  (`{"level":"error","event":"config.failed",…}`, exit 2).

The container was stopped (`--rm`) afterwards.

## Gate

`npm run verify` (2026-09-26, 717.0s) over M346's tree: 59/61, with only the baseline reds
(`panels:agents` `template.1`, `detail.1`; `panels:product` 112/120, with `starter.1` and
the seven `workflow.*`). `verify:canvas-sync` is 68/68. M347 is stacked on it and committed
with it; the combined tree's gate is in M347's ledger.

## Owed

- **Applying the migration to the live project.** Pre-authorized, but there are no
  database credentials on this Mac: the anon key cannot run DDL. It needs a person with
  the project's database password or the Supabase CLI linked.
- **M347**: the operations around it. A deploy for the collab server beside the relay
  (Caddy TLS, a systemd unit and env file), a backup job with retention, and an uptime
  timer that alerts on `/healthz` failures and `*failed` log events.
- **Arc 1.2** (local-first reliability): the app's side of an outage.

Next: M347 (collab operations: TLS through Caddy, the systemd unit, a backup timer with
retention, an uptime timer with an alert webhook).
