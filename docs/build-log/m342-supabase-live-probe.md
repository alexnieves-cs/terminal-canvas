# M342 — the live Supabase project, probed from outside

**Verdict: shipped, partly blocked.** The live project (`TC_SUPABASE_URL`) has all three
M330–M333 migrations applied, and the app's shipped anon key can read, write and call
nothing there: `npm run supabase:probe`, 37/37 on 2026-09-26. That closes the "none of the
three migrations has been applied" half of the M330–M335 owed item, and it exercises the
anon side of the RLS/grant boundary on the real Postgres, not PGlite. The **authenticated**
half still needs a real GitHub sign-in by a person. The probe carries those checks
(`member.*`) and runs them the moment it is handed a session token. Built on local
`main` on top of M341.

## What landed

`scripts/supabase-probe.cjs` (`npm run supabase:probe`) runs three groups of checks:
- **schema.\*** — each of the 8 tables (`users`, `organizations`,
  `organization_members`, `invites`, `presence`, `activity_log`, `workspace_shares`,
  `workspace_members`) and each of the 6 RPCs (`ensure_personal_org`, `invite_preview`,
  `accept_invite`, `create_workspace_share`, `workspace_role`, `set_workspace_member`,
  called with their real argument names) EXISTS. PostgREST's `PGRST205`/`PGRST202` ("not
  in the schema cache") is told apart from a refusal.
- **anon.\*** — every table refuses the anon key's select and insert, and every RPC
  refuses its execute, each with `42501 permission denied`.
- **auth.1** — the GitHub provider is enabled.

With `TC_PROBE_ACCESS_TOKEN`, it adds **member.1–4**:
- the token is a live session;
- a person reads their own organizations;
- another organization reads as nothing;
- `workspace_role` answers null for a share they are not in.

`docs/accounts.md` records how to run it and what the first run found.

## Decisions, and why

- **An npm script, not a `verify:*` suite.** It reaches a deployment over the network.
  `verify:meta 19` pins the two hand-run exclusions (`verify:packaged`, `verify:visual`)
  by name, and a probe of a live project is not a check of the repository, so it does
  not become a third.
- **It never writes a row.** Its only writes are empty `POST {}`s, which the grants
  refuse before a row could be built. A probe that left rows in a live project would
  change the thing it measures.
- **A refusal is judged by code, not by status alone.** The probe requires `401/403` with
  `42501` (or `PGRST301`) or "permission denied" in the message. A 404 or
  `PGRST202` would mean the object is MISSING, which is a different failure from an open
  door and is reported as `schema.*`.
- **Migrations were not re-applied.** The prompt pre-authorizes applying them, but they are
  already there (schema.* 14/14). Re-running DDL on a live project would do nothing at
  best, and could damage it at worst.

## Checks

`npm run supabase:probe` (live, 2026-09-26): **37/37**. Gate: this milestone changes no
`src`. `npm run affected` maps package.json to every suite, because every suite reads it.
The change there is one added script that no suite invokes. The plain tier passes 48/48,
including `verify:meta` with this README row. The Electron tier was not re-run for it:
the last full `npm run verify` is M341's on the same `src`, an hour earlier (59/61,
baseline reds only).

## Owed — blockers for a person

- **A real sign-in** (`tc login` or the account menu's Sign in). It needs a person at a
  browser completing GitHub OAuth. Then run
  `TC_PROBE_ACCESS_TOKEN=<that session's access token> npm run supabase:probe` for
  `member.1–4`. The app deliberately never displays a token (M330), so the person
  copies it from a session they own.
- **The live two-machine run** (presence, shared canvas, shared text). It needs two
  signed-in people or Macs and a collab server reachable by both, which means the
  deployment below.
- **A collab and relay deployment.** No VM address or SSH config exists on this Mac
  (`TC_RELAY_SSH`, `TC_RELAY_DOMAIN`), so the documented `npm run relay:deploy` cannot
  run.

Next: M343 (a teammate's relay placeholder offers Attach: the session id crosses the
shared doc, bound only by its panel's owner).
