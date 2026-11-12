# M685: Relay terminals removed

Alex chose to delete the hidden features for good (Sheets, Jira and Relay) on 2026-11-11.
M683 and M684 took out Jira and Sheets ([their log](m683-m684-cut-jira-sheets.md)). Relay
shared the multiplayer server, the shared canvas ops and presence, so it came out on its own.

## Gone

- The relay server (`server/relay/`, `scripts/relay-server.cjs`, `npm run relay` and
  `relay:deploy`) and its doc, `docs/relay.md`.
- Main's client and wiring (`src/main/relay/`, `bootstrap/relay-wiring.ts`), the nine
  `relay:*` invoke channels, the two `relay:*` events and the bridge's `relay` member.
- The renderer panel (`src/renderer/relay/`), `RelayPanel` and its persisted shape,
  `shared/relay-protocol.ts`, the glyph, kind word, rail row and styles.
- `object.create.relay`, `labs.relay` and its settings key, and `verify:relay`.
- In the shared canvas: the `relay-bind` op, its role-table row, and the `relaySession` /
  `relayProgram` panel fields. The placeholder layer's Attach button went with them.
- The `relay` shot scene and its golden. `shared-canvas` now shows two of sam's terminal
  placeholders centred on the canvas, and `team-ask`'s second row is a `lint — web` agent.

## Kept on purpose

- **`registerIpcHandlers`'s slot.** The parameter list is positional (`src/main/CLAUDE.md`
  rule 3), so the relay's slot stays as `_retiredRelay: undefined`. Removing it would
  re-bind the flowchart and World doors in every harness that builds the call.
- **`'relay-bind'` in the collab server's `AUDIT_ACTIONS`.** The database's check constraint
  names it and old audit rows carry it. Nothing writes it any more.
- **`TC_RELAY_SSH` / `TC_RELAY_DOMAIN`.** `collab:deploy` still reads them as fallbacks, so
  a VM set up before this keeps deploying. Its Caddyfile now comes from
  `server/collab/deploy/` and routes only `/collab`.

## Checks

- `verify:layout relay.retired.1`: a saved relay panel is dropped by id with an
  unrecognised-kind warning, and the terminal beside it still loads.
- `verify:canvas-sync cs.relay.retired.1`: a `relaySession` written onto a panel reads as an
  unrecognised change and is refused. `cs.relay.1`–`.5` and `srv.relay.1` went with the op.
  `ops.deploy.1` reads the collab Caddyfile.
- `verify:ipc 1`: 222 channels, down from 231.
- `verify:demo demo.shapes.*` probes `sharedCanvas.shares` as its refusal-shaped door now.

## Goldens

`relay` is deleted. `shared-canvas`, `shared-offline` and `team-ask` change. They are
re-taken on the Mac runner after the gallery has been looked at.
