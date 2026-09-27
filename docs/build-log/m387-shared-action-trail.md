# M387 — every shared action on the record, at the server

**Verdict: shipped (the trail and its store; applying the migration to the live project,
and deploying the server that writes it, wait on the run's standing blocker, a VM).**
Arc 4 asks for "a compliance audit trail of every shared action". M369, M371 and M373
put a person's decisions on the record: permissions, plans, reviews, caps, shares. A
member's action on a SHARED canvas was on no record at all:
- a panel created, retitled or removed;
- a group set;
- a file shared;
- a relay session bound;
- a team ask opened, answered or closed.

Only the collab server knows who took each action. It is the one party that judges every
write against the user the connection AUTHENTICATED as (`beforeSync`,
`authorizeCanvasOp`).

Now, once an update passes that check, the server writes one row per discrete action to
`collab.audit`. A row holds the room, that authenticated user id, the action, the
object's doc key, and a word (an answer, an outcome, a panel's kind). Moves and typing
are counted per connection and written as ONE `edited` summary when it closes. A refused
update applies nothing, and it is nowhere in the trail.

## What landed

- **`supabase/migrations/20260927120000_collab_audit.sql`**: `collab.audit` in the
  collab schema, with every privilege revoked from `anon` and `authenticated`, the
  action a checked set, and the words bounded. It is append-only by use.
- **`createPgAuditStore(query)`** (`server/collab/persistence.ts`): `record` and `list`
  (newest first), with `AUDIT_ACTIONS`. It is the same one-function `query` shape as
  the room store, so PGlite in the checks runs the production SQL.
- **`server/collab/server.ts`**:
  - the `audit` option;
  - `beforeSync` collects the accepted ops and records them only after the WHOLE
    update passed;
  - `onDisconnect` writes a connection's `edited` summary;
  - `auditEntryOf(room, userId, op)`, one op as a row.
- **`server/collab/main.ts`**: the audit store over the same pool as the rooms.
- **`docs/collab.md`** and **`collab.env.example`**: apply the second migration, and grant
  the server's role `select, insert` only on the trail.

## Decisions, and why

- **At the server, from the authenticated user.** A client could write any name into a
  record of its own. The server's `ctx.userId` is Supabase's answer for the token (M330).
  It is the same identity every write is already judged by, so the trail and the
  authorisation cannot disagree about who did something.
- **Only after the whole update passed.** `beforeSync` throws on the first refused op
  and Hocuspocus applies none of the update. Recording op by op as each was judged would
  put accepted-then-discarded actions on the record.
- **Never content.** A row carries no title, no text and no command. A room's content
  is the room's. The trail is who did what to which object: the operator's compliance
  record, which a subpoena, an incident or a curious owner can read without reading the
  canvas. `audit.server.1` checks that a panel's title is in no row.
- **Moves and typing are summarised, not listed.** A drag writes about sixty times a
  second, and a paragraph of typing is hundreds of updates. One row per connection
  ("moves 2 · text edits 0") says who arranged and who edited without burying the
  actions that matter.
- **Nothing deletes, and the writer cannot.** The rooms' snapshots are pruned (M346). A
  compliance trail that trims itself is not one, so the table only grows. At a few
  hundred bytes a row it outlasts any plausible team. `docs/collab.md`'s grant for the
  server's own role is `select, insert` on `collab.audit` and nothing more, so even the
  server's credentials cannot edit or delete a row.
- **The team ask's own trail is here too.** M376 records a teammate's decision on the
  OWNER's ledger. This records every answer at the server, including answers that never
  decided anything (the first of two).

## Checks

- `verify:canvas-sync`:
  - `audit.schema.1`: the migration runs on real Postgres (PGlite) after the room
    migration; `anon` and `authenticated` can neither read nor insert; an action
    outside the set is refused by the table's check.
  - `audit.server.1`, through a real Hocuspocus server with the store:
    - the owner creates a panel and opens an ask, the editor answers and moves the
      panel twice, the editor's delete of the owner's panel is refused, and the owner
      closes the ask and deletes the panel;
    - the trail reads create, ask-open, ask-answer, ask-close, delete, each in the
      authenticated user's name and in order;
    - one `edited` summary for the editor with "moves 2";
    - the refused delete is nowhere, and no row holds the panel's title.

  86/86. `ops.deploy.1` and `ops.bundle.1` (the collab bundles build and load as deployed) stay green.

No display changed, so `verify:visual` was not run.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran 59/61 suites in 783.5s, and
every red is the baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: its watchdog fired under load (the change touches no
  Electron-tier code). Rerun alone at load 10.3, it is 112/120: the baseline `starter.1`
  and seven `workflow.*`, inside its watchdog.

## Owed

- **Apply the migration to the live project** alongside the collab server's first
  deploy. The deploy is the run's standing blocker (a VM, `TC_RELAY_SSH` and
  `TC_RELAY_DOMAIN`). Until a server runs against it, the table would stay empty.
- **A reader for the owner.** Today the trail is read with SQL on the VM. A `tc`
  verb, or a panel for a workspace's owner, needs a server endpoint gated by the share's
  owner role. That is its own milestone.

Next: the final report.
