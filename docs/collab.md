# The collab server — operating it

`server/collab` is the Hocuspocus server behind presence, the shared canvas and shared
text (M331–M334). This page is for the person who runs it. [accounts.md](accounts.md) says
what the rooms carry and who may write them; [relay.md](relay.md) is the relay's own page.
Both servers run on the same VM, behind the same Caddy.

## What runs where

| Piece | Where | What it is |
|---|---|---|
| `tc-collab.service` | `/opt/tc-collab/main.cjs` | The server, on `127.0.0.1:1234`, `Restart=always` |
| `tc-collab-backup.timer` | daily 03:17 (±10 min) | `backup.cjs dump /var/backups/tc-collab --keep 14` |
| `tc-collab-health.timer` | every minute | `health.cjs`: probe `/healthz`, read the error events, alert |
| Caddy | `:443` | TLS (its own Let's Encrypt), `wss://<name>/collab` → `127.0.0.1:1234` |
| Postgres | Supabase, schema `collab` | `documents` (one row per shared room), `snapshots` (bounded history) |

The app connects with `TC_PRESENCE_URL=wss://<name>/collab`.

## Deploy

```sh
TC_RELAY_SSH=ubuntu@<vm ip> TC_RELAY_DOMAIN=<name> npm run collab:deploy
```

`deploy.sh` builds the three bundles (`scripts/collab-server.cjs --build-only`) and copies
them, the units and the VM's one Caddyfile (the relay's, which routes `/collab` too). Then
it runs `setup.sh` on the VM. `setup.sh` is idempotent: re-running it upgrades the
bundles and keeps `/etc/tc-collab/collab.env`. `TC_COLLAB_SSH` and `TC_COLLAB_DOMAIN`
point it at a VM of its own.

Then edit `/etc/tc-collab/collab.env` (0640, root:tc-collab) and run
`sudo systemctl restart tc-collab`. Every variable is in `collab.env.example` with its
reason.

## The database

Apply `supabase/migrations/20260926120000_collab_documents.sql`, then
`supabase/migrations/20260927120000_collab_audit.sql` (the Supabase SQL editor, or
`supabase db push` with the CLI linked). The first creates schema `collab` with every
privilege revoked from `anon` and `authenticated`, so PostgREST cannot serve it and the
anon key the app ships can never read a room. The second adds `collab.audit`, the
trail of every shared action (M387), in the same closed schema.

Give the server a role of its own rather than the `postgres` password:

```sql
create role tc_collab login password '<generate one>';
grant usage on schema collab to tc_collab;
grant select, insert, update, delete on collab.documents, collab.snapshots to tc_collab;
-- M387. The trail is append-only IN FACT, not only by use: its writer cannot edit or delete a row.
grant select, insert on collab.audit to tc_collab;
grant usage on all sequences in schema collab to tc_collab;
```

`TC_COLLAB_DATABASE_URL` is then that role's connection string. Use the pooler's session
mode on port 5432, since the server holds a small pool of its own (max 4). With the
variable empty the server still runs, keeps rooms in memory only, and says so once at
startup (`config.memory_only`).

## What is kept, and for how long

- **A shared room's state**, one row per room (`tc:workspace:<share uuid>`). It is stored
  as it changes: Hocuspocus's debounce (2 s, at most 10 s), and once more as the room
  unloads. The table refuses any other name, so an unshared workspace's presence-only
  room is never kept.
- **Snapshots**: one per room per `TC_COLLAB_SNAPSHOT_MINUTES` (60), with the newest 48
  kept (two days), pruned as each is taken.
- **Backups**: `/var/backups/tc-collab/collab-<utc>.jsonl.gz`, 0600 in a 0700 directory,
  with the newest 14 kept. A dump holds whole canvases. Copying one off the VM is your
  decision, the same as copying the database.

## Restore

```sh
# As the service user, with its env file sourced (0640 root:tc-collab, so it may read it):
sudo -u tc-collab bash -c 'set -a; . /etc/tc-collab/collab.env; exec node /opt/tc-collab/backup.cjs list /var/backups/tc-collab/collab-<utc>.jsonl.gz'
sudo -u tc-collab bash -c 'set -a; . /etc/tc-collab/collab.env; exec node /opt/tc-collab/backup.cjs restore /var/backups/tc-collab/collab-<utc>.jsonl.gz [--room tc:workspace:<uuid>] [--force]'
```

**A restore is for a room the SERVER lost** (a wiped database, a corrupted row). It is not
undo. A shared room is a CRDT, and any member whose app still holds newer state merges it
forward again the moment they connect. That is why `restore` skips a room that still
exists unless you pass `--force`, and says so. Restart `tc-collab` after a restore so no
loaded room is still holding the old state in memory.

## Health, logs and alerts

- `curl -s http://127.0.0.1:1234/healthz` (or `https://<name>/collab/healthz` from outside)
  answers `{ ok, rooms, connections, uptimeS, persisted }`: counts, never a room name.
- The log is one JSON object per event: `journalctl -u tc-collab -o cat | jq`. The events
  are:
  - `server.listening`, `server.stopping`;
  - `room.new`, `room.loaded`, `room.snapshot`;
  - `room.store_failed` (error);
  - `update.refused` (warn, with the role table's reason);
  - `db.pool_error` (error), `config.failed` / `config.memory_only`.

  Content is never logged.
- `tc-collab-health.timer` alerts `TC_ALERT_WEBHOOK` (Slack reads `text`, Discord reads
  `content`, ntfy takes the body):
  - **DOWN** after 3 failed probes in a row, said once per outage;
  - **recovered** once when it ends;
  - **error events** (any `"level":"error"` line) at most once per 30 minutes, with the
    count and the kinds.

  A failed backup posts its own alert.
