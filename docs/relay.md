# The pty relay

A terminal whose process runs on the team's relay VM (Oracle Always Free), not
on this Mac: several people attach to one pty, one of them types at a time, and
every hand-off is on disk.

```
renderer (xterm)  ⇄ IPC relay:* ⇄  main (relay-client.ts, holds token + socket)
                                       ⇅ wss://relay.example.com/relay  (Caddy TLS)
                                   VM: tc-relay (server/relay) ⇄ node-pty ⇄ program
```

| Piece | File |
|---|---|
| Wire protocol, both ends' parsers | `src/shared/relay-protocol.ts` |
| Registry, roles, control hand-off, backpressure, heartbeat, grace | `server/relay/relay.ts` |
| JWT check at the upgrade (ES256/RS256 via JWKS, optional HS256) | `server/relay/jwt.ts` |
| 1MB replay ring, addressed by stream offset | `server/relay/ring-buffer.ts` |
| Env + `programs.json` allowlist + pty env | `server/relay/config.ts` |
| Main's client (reconnect with `since`, input gate) | `src/main/relay/relay-client.ts`, `bootstrap/relay-wiring.ts` |
| xterm attachment + control strip | `src/renderer/relay/` |
| Deploy: systemd, Caddy, setup, env/program examples | `server/relay/deploy/` |
| Checks | `npm run verify:relay` |

## Decisions, and why

- **Main holds the socket, not the renderer.** The Supabase token never crosses
  the bridge (`account.ts`), the renderer's CSP would refuse the connect, and a
  reload must not drop control. On reload the renderer asks `relay:view` and main
  pushes a reset plus the whole ring.
- **The token rides the subprotocol list** (`tc-relay.v1`, `bearer.<jwt>`), not
  the URL (proxy logs) and not a header (WHATWG WebSocket cannot set one). The
  server never echoes the bearer entry back.
- **Verification is local** (JWKS, cached; a new `kid` refetches at most once a
  minute). A reconnect inside the grace must not wait on Supabase. The price is
  revocation: a signed-out token is valid to its `exp`, so the relay closes each
  socket at its token's `exp` (4401) and the client reconnects with a fresh one.
- **Control belongs to a PERSON, not a socket.** Two Macs of one person share a
  role. Grant needs the person to have asked and to be attached; the owner asking
  is a revoke; a guest releasing returns control to the owner.
- **Spawning is a list, attaching is the share.** `TC_RELAY_SPAWNERS` (user ids)
  may start sessions; empty means nobody, because a GitHub sign-in is not a
  reason to get a shell on the VM. Attaching a share-bound session asks Supabase
  `workspace_role` as the attaching person: editor/owner may request control,
  viewer only watches, anyone else is refused.
- **The client names a program, never a path.** `programs.json` maps names to
  file/argv/cwd/env; the pty gets a fixed base env plus the program's, never the
  relay's own (which holds `TC_RELAY_JWT_SECRET`).
- **Backpressure never lets one slow viewer slow the others.** Over 1MB unsent a
  client stops getting live bytes; under 64KB it gets the gap from the ring, or a
  `resync` + full replay if the gap was overwritten; over 8MB it is cut. Only when
  *every* client lags is the pty paused.
- **Heartbeat 20s, grace 60s.** A dropped controller keeps control for 60s and a
  reattach resumes from its byte offset with no terminal reset; after that a
  guest's control lapses to the owner (audited as `lapse`). Main also sends an
  app-level ping, because a WHATWG socket cannot see ws pings.
- **Audit**: one JSONL row per spawn, request, grant, deny, release, revoke,
  lapse, kill, exit and reap, written synchronously before anyone is told.

## Deploy (Oracle Always Free, Ubuntu)

1. Point a DNS name at the VM. In the VCN security list, open TCP 80 and 443.
2. `TC_RELAY_SSH=ubuntu@<ip> TC_RELAY_DOMAIN=relay.example.com npm run relay:deploy`
   builds `out/relay/main.cjs`, copies it and `server/relay/deploy/` over, and runs
   `setup.sh` there: Node 22, build tools (node-pty compiles **on the VM**, for its
   arch), Caddy, a `tc-relay` system user, the systemd unit, and the image's
   iptables REJECT rule opened for 80/443.
3. On the VM, edit `/etc/tc-relay/relay.env` (`TC_SUPABASE_URL`,
   `TC_SUPABASE_ANON_KEY`, `TC_RELAY_SPAWNERS`) and `/etc/tc-relay/programs.json`,
   then `sudo systemctl restart tc-relay`. `curl https://relay.example.com/healthz`
   answers `ok <sessions>`.
4. On each Mac: `TC_RELAY_URL=wss://relay.example.com/relay`.

Every shell on the relay runs as `tc-relay` inside the unit's sandbox
(`ProtectSystem=strict`, writable home and log only). Granting someone control of
`shell` is handing them that account — the allowlist decides what exists, the
owner decides who types.

## What is not verified

`verify:relay` drives the real ws server and main's client over loopback with a
fake pty and minted keys. A real node-pty + bash run was done by hand on macOS
(output, size, no `TC_*` in the pty env, audit file mode). Not yet exercised: the
VM itself, Caddy/TLS, Supabase's real JWKS and RLS answer, and the xterm strip in
a live window.

## The panel kind (M338)

`relay` is a canvas kind. Create it like any object — the create sheet's *Relay
terminal*, the palette's *New Relay terminal*, `tc plan create-relay [program]` or an
action node — with a program name from `programs.json` (default `shell`), or
`attach <session id>` to join one you may attach to. Creation asks `relay:list` first,
so a relay that is not set up is refused by name rather than left as a dead panel. In a
shared workspace the session is bound to the share, so members attach by their role.

**Attach from a teammate's placeholder (M343).** A shared workspace's relay panel
carries its minted session id and program name into the shared doc
(`relaySession`/`relayProgram`, flat fields written only by the panel's owner). On a
teammate's canvas its placeholder reads "*name*'s terminal on the team relay · *program*"
and offers **Attach**, which opens a relay panel beside the placeholder, recorded with
that session so a relaunch attaches again. Before M343 the placeholder carried no id,
and joining took `create-relay attach <id>` with an id learned some other way.

- **Persistence.** The record is `{ kind: 'relay', relay: { program, sessionId?, shareId? } }`
  and nothing else — no cwd, no spec. The first session id the relay mints is written
  back, so a relaunch ATTACHES; it never starts a second process. A bad program drops
  the panel; a bad session or share id costs only that field.
- **Not a terminal here.** It is on `isTerminalPanel`'s exclusion list: admitting it
  would hand the registry a panel with no spec and spawn a LOCAL shell.
- **The frame keeps its header** — it is the only place that says the terminal runs on
  the relay — and offers *New session* once the old one ended or the relay refused it.
- **Close detaches**; the relay reaps a session nobody is attached to. *End session* in
  the strip is the kill. A merged view never attaches.
- **⌘V / ⌘C** reach it through `useCanvasClipboard` (text only, through the input
  gate); it follows the app theme through `applyRelayTheme`.
- It does not travel in a portable export, and a teammate's placeholder of one carries no
  session id, so joining a teammate's relay session is `create-relay attach <id>`.
