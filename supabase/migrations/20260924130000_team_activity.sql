-- The Team view: what a presence row says beyond online/away, and the
-- activity log a tile reads for someone who is not here now.
--
-- Same boundary as 20260924120000_accounts_orgs.sql: RLS, `to authenticated`
-- only, membership read through private.is_org_member. The rows are written
-- by the app's team-reporter (src/main/presence/team-reporter.ts), slowly and
-- on change; every text field was scrubbed by redactSecrets before it left
-- the machine, and is bounded here so a client that skipped that cannot fill
-- the table.

-- ── presence: where and on what ────────────────────────────────────────────

alter table public.presence
  -- The workspace observer mode attaches to: its Y.Doc is tc:workspace:<id>.
  add column workspace_id text check (char_length(workspace_id) <= 128),
  add column current_task text not null default '' check (char_length(current_task) <= 140),
  add column agent_status text not null default 'none'
    check (agent_status in ('none', 'idle', 'working', 'needs-you', 'error'));

-- An upsert (ON CONFLICT DO UPDATE) needs UPDATE on every column it sets.
grant update (workspace_id, current_task, agent_status) on public.presence to authenticated;

-- ── activity_log: append-only, one line per meaningful change ─────────────

create table public.activity_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('agent', 'task', 'presence')),
  summary text not null check (char_length(summary) between 1 and 200),
  created_at timestamptz not null default now(),
  -- Activity exists only inside a membership, and leaves with it.
  foreign key (org_id, user_id) references public.organization_members (org_id, user_id) on delete cascade
);
create index activity_log_org_recent on public.activity_log (org_id, created_at desc);

revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;
-- user_id and created_at are the DEFAULTS' alone: a client cannot write a
-- line as someone else, or backdate one.
grant insert (org_id, kind, summary) on public.activity_log to authenticated;

alter table public.activity_log enable row level security;

create policy activity_read on public.activity_log for select to authenticated
  using (private.is_org_member(org_id));
create policy activity_write on public.activity_log for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_org_member(org_id));
-- No update or delete policy: a log a member can rewrite is not a log.
