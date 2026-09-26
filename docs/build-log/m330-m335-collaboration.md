# M330–M335 — collaboration: accounts, presence, team view, shared canvas, shared text, pty relay

Built 2026-09-24 on local `main` and committed together. The six milestones stack in order.
Presence needs an account's token. The Team view and the shared canvas ride presence's
workspace Y.Doc. Shared text lives inside the shared canvas's doc. The relay reuses the
account and the share's roles.

The operator docs are [docs/accounts.md](../accounts.md), which covers M330–M334, and
[docs/relay.md](../relay.md), which covers M335. This log records what landed, what checks it,
the decisions a later session should not undo, and what is still owed.

Nothing here is required. With no `TC_SUPABASE_URL`, `TC_PRESENCE_URL` or `TC_RELAY_URL`, every
account, presence and relay door refuses by name, and the app behaves as it did at M329.

## M330 — Accounts: GitHub sign-in through Supabase, organizations, invites

**What landed.** Sign-in uses Supabase-managed PKCE with a loopback callback. The callback port
is fixed at 47823 and can be overridden with `TC_AUTH_CALLBACK_PORT`. The code exchange is a
plain `fetch` to `/auth/v1/token?grant_type=pkce`; the app does not use supabase-js. The session
is stored in the existing encrypted credential store under `supabase:github:<GitHub id>`. The
first sign-in creates a personal organization. Invites are one-time codes, and only the code's
sha256 is stored. `tc login`, `tc logout`, `tc invite` and `tc join` are added, and the `auth:*`
channels answer with who is signed in, never with a token.

**Key files.** `src/main/account-auth.ts`, `src/main/account-session.ts`,
`src/main/bootstrap/account-handlers.ts`, `src/shared/account.ts`, `src/shared/credential-schema.ts`
(`describeCredentialKey`), `src/main/credential-store.ts`, `src/cli/tc.ts`,
`src/main/control-{handler,protocol}.ts`, `supabase/migrations/20260924120000_accounts_orgs.sql`,
`scripts/account-entry.cjs`.

**Checks.** `verify:account` covers login, refresh, logout, PKCE, the loopback, the control
verbs, invite and join. `verify:meta readers.1` names `account-session.ts` as a plaintext reader.
`verify:electron`'s ACCEPTED list gains two `OPEN_EXTERNAL` rows for the authorize URL.

**Decisions, and why.**
- **The app does not register its own GitHub OAuth app, and there is no device flow.** The
  pasted spec asked for both, and neither can work. GitHub's code exchange needs the client
  secret, which a desktop app cannot keep. Supabase cannot mint a session from a GitHub token,
  because `signInWithIdToken` accepts OIDC providers only and GitHub is not one. If the callback
  port is busy, sign-in refuses and names the port.
- **The account key is declared by its shape, not listed in `SERVICES`.** The `credential:*`
  handlers filter account keys out, so the Settings credential list never shows or edits a
  session.
- **`account-session.ts` is the fourth module that reads plaintext.** No function in it returns
  a token (`login.3`).
- **For `tc login` and `tc join`, the socket proposes and the person confirms.** Any agent can
  reach the control socket, so both verbs open a dialog whose default is Cancel. The
  `terminal-canvas://` URL door refuses every account verb.
- **RLS is the boundary, because the anon key ships in the app.** Memberships and consumed
  invites are written only by `SECURITY DEFINER` functions. RLS was exercised with 28 checks on
  PGlite in a scratchpad. That harness is not in the repo, because it would need
  `@electric-sql/pglite`.

## M331 — Presence: awareness roster and live cursors

**What landed.** Main opens one Y.Doc per open workspace on a Hocuspocus server
(`TC_PRESENCE_URL`) and publishes Yjs awareness under `presence`. The payload carries the
person's identity and colour, the current panel, cursor, viewport, selection, mode, agent
status, status line and last activity. The renderer draws a roster strip at top centre and a
single screen-space 2D canvas for remote cursors and selections. `agentStatus` folds the
workspace's agents from main's `agent:event` fan-out, in the order needs-you > working > error >
idle.

**Key files.** `src/main/presence/{presence-hub,presence-provider}.ts`,
`src/main/bootstrap/presence-wiring.ts`, `src/shared/presence.ts`, `src/renderer/presence/`
(`presence-store`, `PresenceLayer`, `presence-paint`, `RosterStrip`, `usePresenceReport`),
`src/main/bootstrap/agent-runtime.ts` (the fan-out feed). Channels: `presence:local`,
`presence:rosters` and `presence:remote`.

**Checks.** `verify:presence` runs two real hubs over real Awareness instances in-process. It
covers payload, heartbeat, idle, offline, clock skew, doc naming and agent folding.

**Decisions, and why.**
- **Two send rates.** The full payload goes out every 30 s as the heartbeat. Cursor, viewport,
  selection and agent status also go out as they change, at up to 15 Hz, so a remote cursor
  moves live instead of lagging up to 30 s.
- **Idle and offline are judged on the receiver's clock.** A peer is idle after 5 min with no
  change to `lastActivity` and is dropped 15 min after its last heartbeat. Judging on the
  receiver means a sender's skewed clock cannot keep it alive.
- **The handshake token is the Supabase access token, refreshed on every (re)connect.** It is a
  new token exit (`presenceIdentity`), and it stays in main.
- **The doc name.** A shared workspace uses `tc:workspace:<share uuid>`, set by M333. An
  unshared workspace keeps its local id and gets presence only.

## M332 — Team view: tiles, read-only observer, follow

**What landed.** Team is a third center view beside Canvas and Orchestrate. It shows one tile
per organization member: health, current task, agents and last activity. Opening a tile
observes that member's canvas read-only, and **F** follows their viewport. The view is not
persisted: relaunching into observer mode would attach to someone's workspace without being
asked.

**Key files.** `src/renderer/team/{TeamView.tsx,team-store.ts}`, `src/main/presence/team-reporter.ts`,
`src/shared/team.ts`, `src/renderer/shell/{TopBar.tsx,useShellChrome.ts}`,
`supabase/migrations/20260924130000_team_activity.sql`. Channels: `team:list`, `team:observe`
and `team:observed`.

**Checks.** `verify:team` covers tiles, health, report, snapshot, observe, readonly and follow.
`verify:verbs gate.2` names `main/presence/presence-hub.ts` as a `redactSecrets` caller.

**Decisions, and why.**
- **The canvas snapshot rides the workspace Y.Doc, not awareness.** It is stored in map `team`
  under `snapshot:<userId>`. Awareness re-sends a client's whole state at cursor rate, so a
  snapshot there would be re-sent at 15 Hz. The snapshot is published only while a live peer is
  observing, and it is deleted when the last observer leaves.
- **The snapshot is scrubbed field by field before it leaves.** A task title and the panel titles
  are scrubbed, and the count is reported on the snapshot. The observer's status line shows that
  count, which is the same shape as the portable export.
- **The activity row is written PATCH then INSERT, never as an upsert.** PostgREST's
  merge-duplicates would need UPDATE permission on the key columns.
- **Fixed on the way.** `presenceTask` called `taskMemberships` inside its temporal dead zone.
  That crashed the canvas whenever a panel was focused, and it was the cause of the
  `verify:panels:core` 6 red.

## M333 — Shared canvas: workspace shares, a per-field CRDT, roles, `server/collab`

**What landed.** A workspace can be shared into an organization. Shares are stored in
`workspace_shares` and `workspace_members`, with roles owner, editor and viewer. A shared
workspace's canvas lives in the same Y.Doc that presence uses:

- `canvas:panels` holds one field map per panel;
- `canvas:groups` holds one field map per group.

A move or resize is written through as it happens. Everything else reaches the doc through a
diff on `layout:save`. A teammate's panels appear as inert placeholder cards. Agent activity is
drawn in its owner's colour: main stamps `owner` on every `agent:state` and `agent:event`.
`npm run collab` runs the server: Hocuspocus 4.7 plus `onAuthenticate` and `beforeSync`.

**Key files.** `src/shared/canvas-ops.ts` (the role table and ops, the renderer's only
vocabulary), `src/shared/canvas-doc.ts` (yjs, used in main and the server only),
`src/main/presence/canvas-sync.ts`, `src/main/layout-store.ts`,
`src/shared/layout-schema/{types,workspaces}.ts` (`WorkspaceShare`, `Workspace.crdt`),
`src/renderer/canvas/{panel-interaction,usePanelDrag}.ts` (`CanvasWriteThrough`),
`src/renderer/shared-canvas/`, `src/main/pty-manager.ts` and `agent-runtime.ts` (owner
stamping), `server/collab/`, `scripts/collab-server.cjs`,
`supabase/migrations/20260924140000_workspace_shares.sql`. Channels: `canvas:op`,
`canvas:shared-view`, `canvas:shared`, `workspace:share`, `workspace:shares`,
`workspace:open-share` and `workspace:share-member`.

**Checks.** `verify:canvas-sync` covers the binding with two machines over a relay, the schema,
the store and the auth lookup. It also runs a real Hocuspocus server with real providers on
loopback; only Supabase is stubbed. `cs.door.1` pins that no renderer file outside the
shared-text door imports yjs or `canvas-doc`. `verify:verbs gate.2` names `canvas-sync.ts` as a
`redactSecrets` caller, because a panel title is scrubbed as it is written into the doc.

**Decisions, and why.**
- **The doc is a map of field maps.** Each field is its own last-writer-wins register, so one
  person's move and another's concurrent resize of the same panel both survive.
- **Removal is a tombstone, never a delete.** A root-level delete races a concurrent write into
  the same panel and lets a re-seeding peer bring it back. The server refuses both root deletes
  and un-deletes.
- **Keys are prefixed with the host: `<host>_<localId>`.** Panel ids like `n3` are minted per
  machine. The host part is a random install id stored in `userData/canvas-host-id`.
- **The write-back guard is a view `seq` plus `sharedAck` on `layout:save`.** Without it, the
  renderer's lag writes a peer's move back over itself. The ack is render-scoped **state**, not a
  ref: a save effect from an earlier commit must carry that commit's ack.
- **`LayoutStore` stays the one persistence choke point.** A peer's change is written to the
  store first and then pushed to the renderer. The doc's bytes ride the same atomic
  `layout.json` write.
- **Roles are one table enforced in three places:** the renderer (a gesture never starts), main
  (every op before it is written) and the server.
- **`beforeSync` skips read-only connections.** Hocuspocus calls `beforeSync` before its own
  read-only check. Without the skip, a viewer's stray write would close the viewer's whole
  connection. A refused write on a writable connection closes the connection rather than
  dropping the update, because a dropped update leaves that client's doc diverged for good.
- **Only geometry, kind, a scrubbed title and the owner cross over.** No command, cwd or
  transcript does. A placeholder starts nothing. A peer removing your panel takes it off the
  shared canvas only; it keeps running on your machine.

## M334 — Shared text: y-monaco on a main-gated renderer replica

**What landed.** Each shared file panel gets one Y.Text in `canvas:files`, keyed by the file
**panel's** doc key, so two panels on one path keep two drafts (CodeEditor's existing rule). The
editor binds through y-monaco. Remote carets are painted as Monaco content widgets from the
presence roster. A teammate's placeholder offers "Edit shared draft", which has no save.

**Key files.** `src/renderer/shared-text/{replica,binding,target,text-cursor}.ts`,
`src/renderer/file/{CodeEditor,FileNode}.tsx`, `src/main/presence/canvas-sync.ts`
(`textOpen`, `textUpdate`, `emitText`), `src/shared/canvas-ops.ts` (`file-create`, `text-edit`,
`SHARED_TEXT_MAX`). Channels: `text:open`, `text:close`, `text:update` and `text:remote`.

**Checks.** `verify:canvas-sync`'s `text.*` checks and `srv.text.*`. `text.door.1` and
`text.door.2` pin the importer set and the lazy `import()`. `src/renderer/CLAUDE.md` gains the
yjs + y-monaco row in its library-door table.

**Decisions, and why.**
- **This is a gated exception to "the renderer never holds the doc".** y-monaco needs the Y.Text
  in the editor's process, and the user asked for y-monaco explicitly. The renderer therefore
  holds a replica only while a shared editor is open. Main re-judges every replica update the
  way the server does:
  - it refuses anything that is not a text op;
  - it refuses an update whose dependencies it lacks, because that update would sit pending and
    unjudged;
  - a refusal ends the replica, and the replica re-opens.
- **Carets ride presence, never the doc.** `textCursor` holds base64 Yjs relative positions.
  Carets are painted from the roster rather than through y-monaco's awareness path, because
  awareness lives in main.
- **The disk stays the owner's.** A peer's edits arrive as the owner's dirty draft. The owner's
  Escape-discard reverts the shared text to disk.

## M335 — pty relay: `server/relay`, main's client, the renderer's xterm

**What landed.** A terminal whose process runs on the team's relay VM. Several people can attach
to one pty, one of them types at a time, and every hand-off is audited. The pieces are the wire
protocol, a server with a replay ring, control hand-off, backpressure, heartbeat and grace, a
JWT check at the upgrade, main's reconnecting client, an xterm attachment with a control strip,
and deploy scripts for systemd and Caddy.

**Key files.** `src/shared/relay-protocol.ts`, `server/relay/` (`relay`, `jwt`, `ring-buffer`,
`config`, `main`, `deploy/`), `src/main/relay/relay-client.ts`, `src/main/bootstrap/relay-wiring.ts`,
`src/renderer/relay/`, `scripts/relay-server.cjs`. Channels: `relay:*`. `registerIpcHandlers`
gains a last positional `relay` parameter.

**Checks.** `verify:relay` drives the real ws server and main's client over loopback with a fake
pty and minted ES256 and HS256 keys. It was stable over 10+ runs. A real node-pty + bash run was
done by hand on macOS.

**Decisions, and why.** [docs/relay.md](../relay.md) has the full list. The ones a later session
is most likely to undo:
- **Main holds the socket and the token, not the renderer.** The token never crosses the bridge,
  the CSP would refuse the connection, and a reload must not drop control.
- **The token rides the subprotocol list** (`tc-relay.v1`, `bearer.<jwt>`), not the URL, where
  proxy logs would capture it, and not a header, which a WHATWG WebSocket cannot set. The JWT is
  verified locally against the JWKS, refetched at most once a minute. Each socket is closed at
  its token's `exp` (4401).
- **Spawning is an allowlist.** `TC_RELAY_SPAWNERS` lists user ids, and an empty list means
  nobody. Without it, any GitHub sign-in would get a shell on the VM. Attaching is decided by
  the share: the owner, or a member via `workspace_role`. A viewer can watch but cannot request
  control.
- **Backpressure tests assert byte-exact screens after the last resync.** They never assert "no
  pause" or "no resync". The test client shares the server's event loop, so even a "fast"
  reader can lag.
- **node-pty 1.1.0's macOS prebuild ships `spawn-helper` without its execute bit,** so under
  plain node it fails with "posix_spawnp failed". Linux is unaffected, and `setup.sh` runs
  `chmod` anyway.

## Owed

- **Real Supabase.** None of the three migrations (`accounts_orgs`, `team_activity`,
  `workspace_shares`) has been applied to a live project. The `team_activity` RLS is untested,
  and the other RLS was exercised only on PGlite. No real sign-in has been done.
- **A live two-machine run** of presence, the shared canvas and shared text.
- **UI:**
  - sign-in and an account picker for choosing the active account among several;
  - share, open share and set role, which today exist as the bridge only, with no UI and no `tc`
    verb;
  - `RelayTerminal` as a canvas panel kind (four doors, persistence, goldens). Nothing opens
    one yet.
- **Electron DOM checks and goldens** for the roster strip, the cursor layer, the Team view, the
  placeholder card (and the owner-coloured working tone), and the carets and placeholder draft.
- **Deploying the relay** to the Oracle VM (`TC_RELAY_SSH=… TC_RELAY_DOMAIN=… npm run
  relay:deploy`). No VM address or SSH config exists on this Mac.
- **Shared text gaps:**
  - Rich-mode notes are not live-bound. The owner's dirty Rich edits win once when they return
    to Source.
  - The conflict action "Reload (discard mine)" does not revert the shared text.

## Gate (2026-09-25)

Plain tier: typecheck clean.

| Suite | Result |
|---|---|
| `verify:account` | 44/44 |
| `verify:presence` | 25/25 |
| `verify:team` | 30/30 |
| `verify:canvas-sync` | 47/47 |
| `verify:relay` | 52/52 |
| `verify:meta` | green with this log's README rows |
| `verify:ipc` | green |
| `verify:verbs` | 29/29 |

Not run: the Electron tier and `verify:visual`, so no goldens were written.
