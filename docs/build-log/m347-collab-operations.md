# M347 — collab operations: TLS, a hardened unit, backups with retention, an uptime watcher that alerts

**Verdict: shipped, not deployed.** Everything the collab server needs to run unattended
on the team's VM beside the relay is built and checked:
- Caddy's automatic TLS on `/collab`;
- a `Restart=always` systemd unit;
- a daily backup with retention and a restore that refuses to clobber;
- a once-a-minute health step that alerts a webhook on an outage, a recovery and error
  events;
- `docs/collab.md`, the operator's page.

It is not deployed: there is no VM address or SSH access on this Mac
(`TC_RELAY_SSH`/`TC_RELAY_DOMAIN`), the same blocker as the relay's. Built 2026-09-26 on
local `main`, stacked on M346 and committed with it.

## What landed

- **`server/collab/backup.ts`** (pure over a `DocStore`) **and `backup-main.ts`** (the CLI).
  `dump <dir> [--keep N]` writes `collab-<utc>.jsonl.gz` (0600): a header, every room's
  state, then every snapshot. It prunes to the newest N (14). `restore <file> [--room R]
  [--force]` puts rooms back; `list <file>` reads one. A failure exits 1, logs
  `backup.failed`, and posts the alert webhook.
- **`server/collab/health.ts`** (pure) **and `health-main.ts`** (the step). It probes
  `GET /healthz` on loopback, reads the server's error events from journald since the
  last step, saves its state, and posts each alert.
- **`server/collab/deploy/`**:
  - `tc-collab.service`: `Restart=always`, its own user, `NoNewPrivileges`,
    `ProtectSystem=strict`, `ProtectHome`;
  - `tc-collab-backup.{service,timer}`: daily at 03:17 with up to 10 min of jitter,
    `Persistent=true`, writing only its backup directory;
  - `tc-collab-health.{service,timer}`: every minute, as `tc-collab` with the
    `systemd-journal` group, not root;
  - `collab.env.example`, where every variable carries its reason;
  - `setup.sh`: idempotent, backup directory 0700, env file 0640;
  - `deploy.sh`: `npm run collab:deploy`, which uses the relay's VM and domain by
    default.
- **The VM's one Caddyfile** (`server/relay/deploy/Caddyfile`) now routes
  `handle_path /collab*` to `127.0.0.1:1234` beside the relay's `/relay` and `/healthz`.
  Caddy's own ACME issues and renews the certificate. Both deploys install this one file,
  so neither overwrites the other's route.
- **`scripts/collab-server.cjs`** builds three bundles (`main`, `backup`, `health`), with
  `--build-only` for the deploy. There is also `npm run collab:backup`.

## Decisions, and why

- **Alerting rules that do not page wrongly** (the header of `health.ts`):
  - DOWN after three failed probes in a row, because a `Restart=always` restart misses
    one or two, and paging on every deploy teaches people to mute the channel;
  - DOWN is said once per outage and RECOVERED once, never a page a minute;
  - error events alert at most once per 30 minutes with the count and the kinds, because
    a store failing on every change of a busy room is one problem, not five hundred.
- **A webhook, not a paid service.** `TC_ALERT_WEBHOOK` is any Slack, Discord or ntfy URL:
  the body carries `text` (Slack) and `content` (Discord), and ntfy takes the body
  whole. The prompt allows no paid services, and a webhook is free on all three.
- **Backups on the VM, in node, not `pg_dump`.** They read through the same `DocStore` the
  server writes with, so `verify:canvas-sync` checks dump and restore on real Postgres
  semantics (PGlite). They need no `postgresql-client` on the VM, which Supabase's pooler
  version would also have to match. A dump is scoped to the `collab` schema's two
  tables. The database itself is Supabase's to back up.
- **A restore refuses a room that exists** unless `--force`. A shared room is a CRDT: any
  member still holding newer state merges it forward again on connect, so a restore is
  for a room the server LOST, not an undo (`docs/collab.md`, "Restore").
- **The health step runs as `tc-collab` in the `systemd-journal` group, not as root.** It
  needs to read one unit's journal and write one state file.

## Checks

`verify:canvas-sync` (73/73), new:
- `ops.backup.1`: a dump has its header, every room and its snapshots. Restoring after
  the rows are deleted brings the canvas back. A second restore SKIPS the existing room,
  `--force` replaces it, and a headerless file is refused before anything is written.
- `ops.health.1`: an outage walked step by step. Two failures say nothing, the third says
  DOWN, the fourth says nothing again, recovery is said once, and the next healthy step
  is quiet.
- `ops.health.2`: error events. The first minute's three alert with their kinds, the
  10-minute one is quiet, and the 31-minute one alerts. Only JSON `error` lines count,
  and the body carries `text` and `content`.
- `ops.deploy.1`: drift, DERIVED from the code:
  - every `TC_*` variable the three entry points read is in the env example;
  - `setup.sh` installs every unit and timer in `deploy/`;
  - the Caddyfile routes `/collab` to the loopback port;
  - the unit's `Restart=always`, user and `NoNewPrivileges`, and the health unit's user
    and group, are in place;
  - the backup directory is 0700.
- `ops.bundle.1`: the three bundles build as `deploy.sh` builds them and LOAD. The server
  exits 2 with `config.failed`, and the backup exits 1 with `backup.failed` naming the
  variable, each as a JSON line. This is the check that would have caught M333's
  `import.meta.url` break.

## Gate

Committed with M346. The full `npm run verify` ran over M346's tree (717.0s, 59/61, baseline
reds only). M347 adds only `server/collab/`, scripts, docs and two npm scripts: nothing the
Electron tier bundles or reads. On the combined tree the plain tier passes 48/48,
`verify:canvas-sync` is 73/73, and typecheck is clean.

## Owed — blockers for a person

- **Deploy it.** It needs `TC_RELAY_SSH=ubuntu@<vm ip> TC_RELAY_DOMAIN=<name>` (a VM
  and a DNS name) → `npm run collab:deploy`, and the same for `relay:deploy`.
- **The `collab` migration on the live project and its role** (`docs/collab.md`, "The
  database"). It needs the project's database password or a linked Supabase CLI.
- **An alert webhook URL** (`TC_ALERT_WEBHOOK`) for the VM's env file.

Next: M348 (Arc 1.2 — local-first: the app's shared doc survives a crash while offline,
and its queued changes are visible, not silent).
