-- M387. Every shared action, on the record (server/collab/persistence.ts's audit store).
--
-- One row per discrete action a member took on a shared workspace — a panel
-- created, retitled or removed, a group set or removed, a file shared, a relay
-- session bound, a team ask opened, answered or closed — written by the collab
-- server AFTER its per-operation check accepted the change, with the user id
-- the connection AUTHENTICATED as (never a name a client sent). Moves and
-- typing are counted per connection and summarised when it closes ('edited'),
-- so a drag's sixty writes a second are one row, not sixty.
--
-- What a row holds is who, what kind, and which object: never a title, a
-- text's characters or a command. A room's content is the room's; this table
-- is the operator's compliance record.
--
-- The boundary is collab.documents': its own schema, every privilege revoked
-- from the roles PostgREST serves. Append-only by use: the server inserts and
-- reads, and nothing deletes — a compliance trail that trims itself is not one.

create table collab.audit (
  id bigint generated always as identity primary key,
  room text not null check (room ~ '^tc:workspace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  user_id text not null check (length(user_id) between 1 and 128),
  action text not null check (action in (
    'create', 'retitle', 'delete', 'group-set', 'group-delete', 'file-create', 'relay-bind',
    'ask-open', 'ask-answer', 'ask-close', 'edited'
  )),
  -- The object's doc key (`<host>_<local id>`), when the action has one.
  target text check (target is null or length(target) <= 200),
  -- A word, never content: an answer (allow/deny), an outcome, or the counts of an 'edited' summary.
  detail text check (detail is null or length(detail) <= 200),
  at timestamptz not null default now()
);
create index audit_by_room on collab.audit (room, at desc);

revoke all on all tables in schema collab from public, anon, authenticated;
revoke all on all sequences in schema collab from public, anon, authenticated;
