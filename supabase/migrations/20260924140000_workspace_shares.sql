-- Shared workspaces: a room two people's per-machine workspaces meet in, and
-- each person's ROLE in it (owner / editor / viewer).
--
-- Why a table of its own and not the org role: a workspace id is minted per
-- machine (`w3`), so two people's copies can only share a Yjs doc if they
-- agree on a name — the share's uuid is that name (`tc:workspace:<uuid>`).
-- And the role is per canvas: an org admin may be a viewer of someone's
-- canvas, and a member may own their own.
--
-- The accounts migration's three rules hold here unchanged:
--   1. every policy is `to authenticated`; anon gets nothing;
--   2. membership is read through SECURITY DEFINER helpers in `private`, never
--      by a policy selecting from the table it protects;
--   3. rows that GRANT access — a share, a membership — are written ONLY by the
--      SECURITY DEFINER functions below. No insert/update policy exists.
--
-- The collab server (server/collab) asks `workspace_role` with the
-- connecting person's own token on every handshake, so the answer is RLS's,
-- not a service key's.

create table public.workspace_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index workspace_shares_org on public.workspace_shares (org_id);

create table public.workspace_members (
  share_id uuid not null references public.workspace_shares (id) on delete cascade,
  org_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (share_id, user_id),
  -- A share member is an org member, and leaves with the org.
  foreign key (org_id, user_id) references public.organization_members (org_id, user_id) on delete cascade
);
create index workspace_members_user on public.workspace_members (user_id);
-- One owner per share: the delete right on everyone's panels is not shared out.
create unique index workspace_members_one_owner on public.workspace_members (share_id) where role = 'owner';

-- ── helpers (rule 2) ────────────────────────────────────────────────────────

create function private.share_role(p_share uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m
  where m.share_id = p_share and m.user_id = (select auth.uid())
$$;

revoke all on function private.share_role(uuid) from public;
grant execute on function private.share_role(uuid) to authenticated;

-- ── grants and RLS ──────────────────────────────────────────────────────────

revoke all on public.workspace_shares, public.workspace_members from anon, authenticated;
grant select on public.workspace_shares to authenticated;
grant update (name) on public.workspace_shares to authenticated;
grant delete on public.workspace_shares to authenticated;
grant select on public.workspace_members to authenticated;
grant delete on public.workspace_members to authenticated;

alter table public.workspace_shares enable row level security;
alter table public.workspace_members enable row level security;

create policy shares_read on public.workspace_shares for select to authenticated
  using (private.share_role(id) is not null);
create policy shares_rename on public.workspace_shares for update to authenticated
  using (private.share_role(id) = 'owner') with check (private.share_role(id) = 'owner');
create policy shares_delete on public.workspace_shares for delete to authenticated
  using (private.share_role(id) = 'owner');

-- Members see who else is in a share they are in. The owner row is never
-- deleted by a client (a share is not left ownerless); anyone may leave; the
-- owner removes anyone else.
create policy share_members_read on public.workspace_members for select to authenticated
  using (private.share_role(share_id) is not null);
create policy share_members_remove on public.workspace_members for delete to authenticated
  using (
    role <> 'owner' and (
      user_id = (select auth.uid())
      or private.share_role(share_id) = 'owner'
    )
  );

-- ── the writers (rule 3) ────────────────────────────────────────────────────

-- Share a workspace into an org you belong to; you are its owner.
create function public.create_workspace_share(p_org uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  share uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = me) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;
  insert into public.workspace_shares (org_id, name, created_by)
  values (p_org, left(coalesce(nullif(trim(p_name), ''), 'Canvas'), 100), me)
  returning id into share;
  insert into public.workspace_members (share_id, org_id, user_id, role) values (share, p_org, me, 'owner');
  return share;
end
$$;

-- The caller's role in a share, or null. What the collab server's
-- onAuthenticate asks, as the connecting person.
create function public.workspace_role(p_share uuid) returns text
language sql stable security definer set search_path = '' as $$
  select private.share_role(p_share)
$$;

-- The owner sets a member's role (editor or viewer), or removes them with
-- null. Ownership is not handed out here, and the target must already be in
-- the share's organization — a share does not reach outside its org.
create function public.set_workspace_member(p_share uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if private.share_role(p_share) is distinct from 'owner' then
    raise exception 'only the workspace owner changes roles' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'the owner''s own role is not changed here' using errcode = '42501';
  end if;
  select s.org_id into org from public.workspace_shares s where s.id = p_share;
  if p_role is null then
    delete from public.workspace_members where share_id = p_share and user_id = p_user;
    return;
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'a role is editor or viewer' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organization_members m where m.org_id = org and m.user_id = p_user) then
    raise exception 'that person is not in this workspace''s organization' using errcode = '42501';
  end if;
  insert into public.workspace_members (share_id, org_id, user_id, role) values (p_share, org, p_user, p_role)
  on conflict (share_id, user_id) do update set role = excluded.role;
end
$$;

revoke all on function public.create_workspace_share(uuid, text), public.workspace_role(uuid), public.set_workspace_member(uuid, uuid, text) from public, anon;
grant execute on function public.create_workspace_share(uuid, text), public.workspace_role(uuid), public.set_workspace_member(uuid, uuid, text) to authenticated;
