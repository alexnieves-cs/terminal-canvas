# Accounts: sign in with GitHub, organizations, invites

Terminal Canvas can sign a person in to a **Supabase** project through GitHub, and
use that account to create and join organizations. Nothing here is required. With no
configuration, every account door refuses by name and the rest of the app is unchanged.

## How sign-in works, and why this way

```
tc login / auth:login ─► main: PKCE verifier + one-shot server on 127.0.0.1:<port>
                         └► browser: <project>/auth/v1/authorize?provider=github&code_challenge=…
                              └► GitHub consent ─► Supabase ─► http://127.0.0.1:<port>/auth/callback?code=…
main: POST /auth/v1/token?grant_type=pkce {auth_code, code_verifier} ─► session
      └► credential store, key supabase:github:<GitHub user id>, safeStorage-encrypted
```

- **Supabase holds the GitHub OAuth app, not Terminal Canvas.** GitHub's web flow needs
  the client secret to exchange a code, and a desktop app can't keep a secret. PKCE
  means only the process holding the verifier can redeem the code.
- **There is no device-flow fallback.** A device code yields a *GitHub* token, and
  Supabase can't turn a GitHub token into a session (`signInWithIdToken` only takes
  OIDC providers, and GitHub isn't one). A fallback would need a server-side function
  holding a service key. If the callback port is busy, sign-in refuses and names the port.
- **Tokens never leave main.** `auth:*` and the `tc` verbs return metadata only.
  `account-session.ts` is the fourth module allowed to read the store's plaintext
  (`verify:meta readers.1`).
- **From a terminal, a person confirms.** Any agent can reach the control socket, so
  `tc login` and `tc join` show a Cancel-default dialog before they act. The URL door
  (`terminal-canvas://`) refuses every account verb.

## Setup

1. In the Supabase dashboard: **Authentication › Providers › GitHub**, enable it, and
   enter a GitHub OAuth App's client id and secret. The OAuth App's callback URL is
   `https://<project>.supabase.co/auth/v1/callback`.
2. **Authentication › URL Configuration › Redirect URLs**: add
   `http://127.0.0.1:47823/auth/callback` (or your `TC_AUTH_CALLBACK_PORT`).
3. Apply `supabase/migrations/20260924120000_accounts_orgs.sql`, with
   `supabase db push` or by pasting it into the SQL editor.
4. Set the following in the environment the app starts from. A packaged app also reads
   your login shell's environment.

   | Variable | Value |
   |---|---|
   | `TC_SUPABASE_URL` | `https://<project>.supabase.co` |
   | `TC_SUPABASE_ANON_KEY` | the project's anon (public) key |
   | `TC_AUTH_CALLBACK_PORT` | optional; default `47823` |

## Verbs

```
tc login                                  # dialog, then browser; first sign-in makes a personal org
tc logout [--user <github-id>]            # this Mac only (scope=local); all accounts if none named
tc invite --role member|admin [--org <id>]  # prints the code once; only sha256(code) is stored
tc join <tcinv_…>                         # previews the org, dialog, then joins
tc accounts                               # the accounts on this Mac, the active one first
tc use <github-login>                     # dialog, then that account is the one every door acts as
```

### In the app (M336)

The top bar's last control is the account menu: the active account's initials, or
**Sign in** when accounts are configured and nobody is. With accounts unconfigured and
nobody signed in it is absent, and the palette's *Account: sign in with GitHub…* row
names the missing variables. The menu lists every account signed in on this Mac as a
radio set — the checked one is **active**: presence, sharing and the relay act as it.
The choice is kept in `userData/account-active` (a GitHub id, not a secret); signing in
makes the new account active, and signing out the active one hands it to the newest.
Main tells the renderer on every change (`auth:changed`, metadata only) and restarts
presence as the new person.

## The schema's boundary

RLS is the boundary, because the anon key ships in the app. The migration's header
states the three rules. Membership and consumed invites are written only by
`ensure_personal_org`, `accept_invite` and the auth trigger (`SECURITY DEFINER`). No
client can insert a membership, read another organization's rows, read an invite's
hash, or invite an owner. Only an owner can invite an admin.
`verify:account` covers the app side under plain node. The SQL was exercised
against PGlite (Postgres in WASM, with a stubbed `auth` schema).

**The live project, from outside (M342).** `npm run supabase:probe` reads the project
named by `TC_SUPABASE_URL` with the app's own anon key. It checks two things:
- every table and RPC the three migrations create exists;
- the anon key (the one that ships) can read, write and call nothing: each answers
  `42501 permission denied`, which is not the same answer as "not in the schema cache".

It also confirms the GitHub provider is on. With `TC_PROBE_ACCESS_TOKEN` (a signed-in
person's access token, copied by that person from their own session) it also reads as
that person:
- their organizations come back;
- someone else's organization reads as nothing;
- `workspace_role` for a share they are not in answers null.

The probe never writes a row. Its only writes are empty inserts the grants must refuse.
The first run (2026-09-26) passed 37/37 anonymous checks. The `member.*` checks are
still owed a real sign-in.

## Presence

With an account signed in and `TC_PRESENCE_URL` set (`wss://…`, or `ws://127.0.0.1:…`
for a local server), main opens **one Y.Doc per open workspace**, named
`tc:workspace:<share id>` for a shared workspace and `tc:workspace:<workspace id>`
otherwise, on that Hocuspocus server, and publishes Yjs awareness
under the `presence` field: `{userId, displayName, initials, color, currentPanelId,
cursor, viewport, selection, mode, agentStatus, statusLine, lastActivity}`
(`src/shared/presence.ts`).

- **Handshake token** is the Supabase access token, refreshed for each (re)connect
  (`account-session.ts` `presenceIdentity`). The collab server's `onAuthenticate`
  checks it (below). It never reaches the renderer.
- **Rates.** The whole payload is re-sent every 30 s (the heartbeat). Cursor, viewport,
  selection and agent status are also sent **as they change**, at up to 15 Hz, so
  remote cursors move live rather than lagging up to 30 s behind.
- **Idle / offline** are judged on the *receiver's* clock: a peer is idle after 5 min
  with no change to its `lastActivity`, and dropped 15 min after its last heartbeat.
  A peer that disconnects stays in the roster, marked away, until that 15 min passes.
- **agentStatus** folds the workspace's agents from the `agent:event` fan-out:
  needs-you > working > error > idle.
- The renderer shows a roster strip (top centre) and paints remote selections and
  cursors on one screen-space 2D canvas at no more than 15 Hz. A remote update
  repaints only that canvas.

`verify:presence` runs two real hubs over real Awareness instances in-process.

## The shared canvas

A workspace can be **shared** into an organization. Its canvas then lives in the same
workspace Y.Doc that presence rides, so teammates see each other's panels and moves.
It needs presence to be on (signed in, with `TC_PRESENCE_URL` set). Without presence
there is no room: the share is still recorded, and the canvas stays local until
presence starts.

```
canvas:panels  Y.Map< <host>_<panel id>, Y.Map<field, value> >   kind title owner host x y w h z [shape] [connectors] [deleted]
canvas:groups  Y.Map< <host>_<group id>, Y.Map<field, value> >   label colour panelIds [collapsed] [deleted]
```

- **A map of field maps.** Each field is its own last-writer-wins register, so one
  person's move and another's concurrent resize of the same panel both survive.
- **Tombstones, never deletes.** Closing a panel sets `deleted: true`, and that is
  permanent. A root-level delete would race a concurrent write into the same panel and
  let a re-seeding peer bring it back. The server refuses a root delete or an un-delete.
- **Keys are host-prefixed.** Panel and group ids are minted per machine (`n3`, `g2`),
  so two Macs mint the same ids. The prefix is a random install id kept in
  `userData/canvas-host-id`.
- **Other people's panels are inert placeholders.** Only geometry, kind, a scrubbed
  title and the owner cross over, plus, for a relay panel (M343), its relay session's
  id and program NAME. No command, cwd or transcript does. A placeholder starts
  nothing, and it is a card, not a panel. A relay placeholder offers **Attach**, the
  person's click, which opens a relay panel on their own canvas joined to that session.
  The id grants nothing by itself: the relay admits an attach by the share's role,
  checked on its side against the person's token. Only the panel's owner may bind or
  re-point the id (`relay-bind` in the role table).
- **Flowcharts cross as content (M392).** A shape panel's record (`shape`) and any
  panel's arrows (`connectors`) are JSON strings in the panel's field map, capped at
  2 KB and 16 KB. Past the cap a field is not written, and main's log says so. The
  words are scrubbed where they leave, like a title. A shape's title is its label's
  first line, so a client that does not draw shapes still names the placeholder. An
  arrow's target is a doc key, and an arrow to a panel that is not in the doc is
  dropped on read. A teammate's shape draws as the real shape, read-only: no handles,
  no ports, no label editing. A small mark in the owner's colour shows whose it is.
  An editor can move it. A shape record is a form, words and three style words, and
  an arrow is a line with a label. Neither can carry anything that runs. Malformed
  content costs that field and never the panel.
- **A peer removing your panel** takes it off the *shared* canvas only. It keeps
  running here.

### How a local change reaches the doc

The renderer never holds the doc. `src/shared/canvas-ops.ts` is its whole vocabulary.

| Path | What | Where |
|---|---|---|
| Gesture write-through | A move or resize, sent as it happens. A role that may not arrange never starts the gesture. | `usePanelDrag` → `CanvasWriteThrough` (`panel-interaction.ts`) → `canvas:op` |
| `layout:save` diff | Everything else: spawn, close, tidy, undo, groups. | `canvas-sync.ts` `saved()` → `diffLocal` |

**LayoutStore is still the one persistence choke point.** A peer's change is written to
the store first, whichever workspace is on screen, and then pushed to the renderer as a
`canvas:shared` view. The doc's own bytes (`Workspace.crdt`) ride the same atomic
`layout.json` write as the panels, so on relaunch the doc is the truth for geometry.

**The write-back guard (`seq` / `sharedAck`).** Every peer change is stamped with a
rising seq. Every `layout:save` carries the seq of the view that render's state came
from. If a peer changed a field and the renderer has not acked that change yet, the
diff skips the field. Without this, the renderer's lag writes a peer's move back over
itself.

### Roles

Roles are per share (`workspace_members`: `owner` | `editor` | `viewer`), not per org.
There is one table (`authorizeCanvasOp`), and three places enforce it: the renderer
(the gesture does not start), main (every op before it is written), and the server.

|  | move | create | rename | remove | groups | shape / arrows |
|---|---|---|---|---|---|---|
| owner | any | own name | own | any | yes | own |
| editor | any | own name | own | own | yes | own |
| viewer | – | – | – | – | – | – |

A shape's words and a panel's arrows (`panel-content`, M392) follow the rename rule for
the rename rule's reason. The machine that runs the panel rewrites them from its own
layout on every save, so a second author's edit would be undone a moment later.

### The collab server (`npm run collab`)

`server/collab` is Hocuspocus 4.7 plus two hooks. It needs `TC_SUPABASE_URL` and
`TC_SUPABASE_ANON_KEY`, and optionally `TC_COLLAB_PORT` (1234) and `TC_COLLAB_ADDRESS`
(127.0.0.1; put TLS in front before binding wider). It holds no service key.

- **`onAuthenticate`**: `GET /auth/v1/user` with the connecting person's token, then
  `rpc/workspace_role` as that person. A non-member is denied, and a viewer's
  connection is marked read-only: its doc writes are dropped, and its cursor still
  flows. An unshared `tc:workspace:<local id>` room admits any signed-in person with
  role null, so it serves presence only.
- **`beforeSync`**: every sync-step-2 or update from a writable connection is applied
  to a throwaway copy of the doc and read back as ops (`canvas-doc.ts`
  `inspectUpdate`). Each op goes through the same table. One refusal closes the
  connection before anything applies. Closing, not dropping, is deliberate: a dropped
  update would leave that client's doc diverged for good.

### Setup

Apply `supabase/migrations/20260924140000_workspace_shares.sql`. Its RPCs are
`create_workspace_share`, `workspace_role` and `set_workspace_member` (owner only,
editor/viewer/none, members of the share's org only). The app's doors are
`workspace:share` (the active workspace), `workspace:shares`, `workspace:open-share` and
`workspace:share-member`, plus `workspace:share-members` (M337: the share's org with
each person's role, for the owner's picker).

**In the app (M337)**, the account menu's *Share this workspace…* and *Open a shared
workspace…* open the share dialog. Sharing, opening and every role change is a click in
that dialog. The verbs `share-workspace`, `open-share` and `share-role` take all four
doors (the account menu, the palette, `tc plan …`, a workflow action node), and every
one of them only OPENS the dialog, prefilled — an agent proposes, the person commits.

**From a terminal:**

```
tc shares                                          # the shared workspaces you are in
tc share [--org <org-id>]                          # dialog NAMING the org, then share the active workspace
tc open-share <share-id>                           # dialog, then add it here as a workspace
tc share-role <share-id> <login|user-id> <editor|viewer|none>   # dialog naming the share, then set
```

Each dialog names what it acts on (the organization, the shared workspace), because the
id a terminal passes need not be the one on screen. An unknown id is refused before any
dialog.

`verify:canvas-sync` covers the binding with two machines over a relay, the schema, the
store, the auth lookup, and a **real Hocuspocus server with real providers** on
loopback. Only Supabase is stubbed. The migration is applied on the live project, and
its tables and RPCs refuse the anon key there (`npm run supabase:probe`, M342). Its
authenticated paths have not been driven live.
