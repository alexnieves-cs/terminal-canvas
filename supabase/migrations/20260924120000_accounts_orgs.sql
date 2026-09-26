-- The Terminal Canvas account: users, organizations, membership, invites, presence.
--
-- THE BOUNDARY IS RLS. The app ships the anon key, so every table here is
-- reachable by any signed-in user through PostgREST, and a policy is the only
-- thing between one organization's rows and another's. Three rules follow:
--
--   1. Every policy is `to authenticated`; anon has no policy and no grant.
--   2. Membership is read through SECURITY DEFINER helpers in `private`, never
--      by a policy on organization_members selecting from organization_members
--      (that recurses, and Postgres answers it with an error, not a denial).
--      `private` is not in PostgREST's exposed schemas, so the helpers are
--      callable by policies and not by clients.
--   3. Rows that grant access — a membership, a consumed invite — are written
--      ONLY by the SECURITY DEFINER functions at the bottom. There is no
--      insert policy on organization_members, so no client can add itself.
--
-- An invite's code never reaches this database: the app stores and compares
-- sha256(code) only (src/main/account-auth.ts).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ── tables ──────────────────────────────────────────────────────────────────

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  github_id bigint unique,
  github_login text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_by uuid references public.users (id) on delete set null,
  -- The one organization ensure_personal_org() makes per user.
  personal boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index organizations_one_personal on public.organizations (created_by) where personal;

create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user on public.organization_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Never 'owner': ownership is not something a code can hand out.
  role text not null check (role in ('admin', 'member')),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null default auth.uid() references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references public.users (id) on delete set null,
  used_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);
create index invites_org on public.invites (org_id);

create table public.presence (
  org_id uuid not null,
  user_id uuid not null,
  status text not null default 'online' check (status in ('online', 'away', 'offline')),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id),
  -- Presence exists only inside a membership, and leaves with it.
  foreign key (org_id, user_id) references public.organization_members (org_id, user_id) on delete cascade
);

-- ── membership helpers (rule 2) ─────────────────────────────────────────────

create function private.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  )
$$;

create function private.org_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m
  where m.org_id = p_org and m.user_id = (select auth.uid())
$$;

create function private.shares_org(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  )
$$;

revoke all on function private.is_org_member(uuid), private.org_role(uuid), private.shares_org(uuid) from public;
grant execute on function private.is_org_member(uuid), private.org_role(uuid), private.shares_org(uuid) to authenticated;

-- ── grants: anon gets nothing; authenticated gets only what a policy can use ─

revoke all on public.users, public.organizations, public.organization_members, public.invites, public.presence from anon, authenticated;

grant select on public.users to authenticated;
grant select, delete on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;
grant select, delete on public.organization_members to authenticated;
-- code_hash is writable and never readable: an admin listing invites sees
-- who and when, not a value that could be replayed against invite_preview.
grant select (id, org_id, role, created_by, created_at, expires_at, used_by, used_at) on public.invites to authenticated;
grant insert (org_id, role, code_hash, expires_at) on public.invites to authenticated;
grant delete on public.invites to authenticated;
grant select, insert, delete on public.presence to authenticated;
grant update (status, updated_at) on public.presence to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invites enable row level security;
alter table public.presence enable row level security;

-- users: yourself, and people you share an organization with. Written only by
-- the auth trigger below, so a client cannot claim another GitHub id.
create policy users_read on public.users for select to authenticated
  using (id = (select auth.uid()) or private.shares_org(id));

-- organizations: members read; the owner renames or deletes.
create policy orgs_read on public.organizations for select to authenticated
  using (private.is_org_member(id));
create policy orgs_rename on public.organizations for update to authenticated
  using (private.org_role(id) = 'owner') with check (private.org_role(id) = 'owner');
create policy orgs_delete on public.organizations for delete to authenticated
  using (private.org_role(id) = 'owner');

-- organization_members: members read their own organizations' rosters. No
-- insert or update policy (rule 3). An owner row is never deleted here — an
-- organization is not left ownerless by a client; members may leave; an owner
-- removes anyone else; an admin removes members.
create policy members_read on public.organization_members for select to authenticated
  using (private.is_org_member(org_id));
create policy members_remove on public.organization_members for delete to authenticated
  using (
    role <> 'owner' and (
      user_id = (select auth.uid())
      or private.org_role(org_id) = 'owner'
      or (private.org_role(org_id) = 'admin' and role = 'member')
    )
  );

-- invites: owners and admins of THAT organization create, list and revoke.
-- Only an owner may invite an admin. Accepting is accept_invite()'s alone.
create policy invites_read on public.invites for select to authenticated
  using (private.org_role(org_id) in ('owner', 'admin'));
create policy invites_create on public.invites for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.org_role(org_id) in ('owner', 'admin')
    and (role = 'member' or private.org_role(org_id) = 'owner')
    and expires_at > now()
  );
create policy invites_revoke on public.invites for delete to authenticated
  using (private.org_role(org_id) in ('owner', 'admin'));

-- presence: members see their organizations' presence; you write only your own.
create policy presence_read on public.presence for select to authenticated
  using (private.is_org_member(org_id));
create policy presence_write on public.presence for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_org_member(org_id));
create policy presence_update on public.presence for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy presence_delete on public.presence for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── the users row, from GoTrue's own record of the GitHub identity ──────────

create function private.sync_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  gh text := new.raw_user_meta_data ->> 'provider_id';
begin
  insert into public.users (id, github_id, github_login)
  values (
    new.id,
    -- A non-numeric id is stored as NULL rather than failing the sign-up.
    case when gh ~ '^[0-9]{1,19}$' then gh::bigint end,
    new.raw_user_meta_data ->> 'user_name'
  )
  on conflict (id) do update
    set github_id = excluded.github_id, github_login = excluded.github_login;
  return new;
end
$$;

create trigger on_auth_user_sync
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.sync_user();

-- ── the only writers of access (rule 3) ─────────────────────────────────────

-- The caller's personal organization, created on first call. Idempotent.
create function public.ensure_personal_org() returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org public.organizations;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  -- A user created before this migration has no row from the trigger yet.
  insert into public.users (id, github_id, github_login)
    select u.id,
           case when u.raw_user_meta_data ->> 'provider_id' ~ '^[0-9]{1,19}$' then (u.raw_user_meta_data ->> 'provider_id')::bigint end,
           u.raw_user_meta_data ->> 'user_name'
    from auth.users u where u.id = uid
  on conflict (id) do nothing;

  insert into public.organizations (name, created_by, personal)
    select coalesce(nullif(u.github_login, ''), 'Personal'), uid, true
    from public.users u where u.id = uid
  on conflict (created_by) where personal do nothing;

  select * into org from public.organizations o where o.created_by = uid and o.personal;
  insert into public.organization_members (org_id, user_id, role)
    values (org.id, uid, 'owner')
  on conflict (org_id, user_id) do nothing;
  return json_build_object('id', org.id, 'name', org.name);
end
$$;

-- What an invite would do, before a person agrees to it. Returns NULL for a
-- code that is unknown, used or expired — one answer for all three, so the
-- function cannot be used to learn which hashes once existed.
create function public.invite_preview(p_code_hash text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  result json;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select json_build_object('org_name', o.name, 'role', i.role) into result
  from public.invites i join public.organizations o on o.id = i.org_id
  where i.code_hash = p_code_hash and i.used_at is null and i.expires_at > now();
  return result;
end
$$;

-- Consumes the invite and adds the membership in one statement's worth of
-- locking: the UPDATE ... WHERE used_at IS NULL is what makes a code single-use
-- under two simultaneous joins.
create function public.accept_invite(p_code_hash text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_org uuid;
  v_role text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if exists (
    select 1 from public.invites i join public.organization_members m on m.org_id = i.org_id
    where i.code_hash = p_code_hash and m.user_id = uid
  ) then
    -- Checked BEFORE consuming, so a member who clicks a teammate's code does
    -- not burn it.
    raise exception 'you are already a member of this organization' using errcode = '23505';
  end if;
  update public.invites
    set used_by = uid, used_at = now()
    where code_hash = p_code_hash and used_at is null and expires_at > now()
    returning org_id, role into v_org, v_role;
  if v_org is null then return null; end if;
  insert into public.organization_members (org_id, user_id, role) values (v_org, uid, v_role);
  return json_build_object('org_id', v_org, 'org_name', (select name from public.organizations where id = v_org), 'role', v_role);
end
$$;

revoke all on function public.ensure_personal_org(), public.invite_preview(text), public.accept_invite(text) from public, anon;
grant execute on function public.ensure_personal_org(), public.invite_preview(text), public.accept_invite(text) to authenticated;
