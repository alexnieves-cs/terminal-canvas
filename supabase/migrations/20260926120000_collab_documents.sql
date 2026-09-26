-- M346. The collab server's rooms, kept (server/collab/persistence.ts).
--
-- One row per shared workspace's Y.Doc (its state as one Yjs update), and a
-- bounded history of snapshots per room. The collab server writes both over its
-- own connection string, held on the VM; nothing else does.
--
-- The boundary: a schema of its own, with EVERY privilege revoked from the
-- roles PostgREST serves (anon, authenticated). The app ships the anon key, and
-- a room's bytes are a whole canvas — they must not be one REST call away.
-- `npm run supabase:probe` does not list these tables for exactly that reason:
-- PostgREST does not expose the schema at all.

create schema if not exists collab;
revoke all on schema collab from public;
revoke all on schema collab from anon, authenticated;

create table collab.documents (
  -- A shared workspace's room: tc:workspace:<share uuid> (M333).
  name text primary key check (name ~ '^tc:workspace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  state bytea not null,
  bytes integer not null check (bytes >= 0),
  updated_at timestamptz not null default now()
);

create table collab.snapshots (
  id bigint generated always as identity primary key,
  name text not null references collab.documents (name) on delete cascade,
  state bytea not null,
  bytes integer not null check (bytes >= 0),
  reason text not null check (reason in ('interval', 'unload', 'manual')),
  taken_at timestamptz not null default now()
);
create index snapshots_by_room on collab.snapshots (name, taken_at desc);

revoke all on all tables in schema collab from public, anon, authenticated;
revoke all on all sequences in schema collab from public, anon, authenticated;
