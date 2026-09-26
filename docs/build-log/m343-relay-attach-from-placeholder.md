# M343 — a teammate's relay placeholder offers Attach

**Verdict: shipped.** Closes the M336–M338 owed item "A teammate's relay placeholder
offering Attach". A relay panel in a shared workspace now carries its session id and
program name into the shared doc. On a teammate's canvas, its placeholder says where the
terminal runs and offers **Attach**, which opens a relay panel on the teammate's own
canvas joined to that session. Only the panel's owner can bind or re-point the id, and
the role table enforces that in the renderer's peers, in main and on the collab server.
Built 2026-09-26 on local `main` on top of M342.

## What landed

- **The shape** (`src/shared/canvas-ops.ts`). `SharedPanel.relay?: SharedRelay`
  (`{ session, program }`). A new op, `relay-bind`, sets the pair or clears it (null), and
  a new column in the role table allows it on your OWN panel only.
- **The doc** (`src/shared/canvas-doc.ts`):
  - the pair is two flat fields, `relaySession` and `relayProgram`, each its own
    last-writer-wins register, like every other field;
  - `panelOf` reads them through `relayOf`: both present and well-formed on a `relay`
    panel, or both absent, and anything else makes the panel malformed;
  - `applyCanvasOp` writes them on `create` and on `relay-bind`;
  - `inspectUpdate` reads a change to either field as ONE `relay-bind`, judged on the
    pair as it stands after the change. Half a pair, a malformed id, or a session on a
    panel of another kind comes back `unknown`, which is always refused;
  - `diffLocal` emits the pair on create, and a `relay-bind` when the relay mints a new
    session or one ends.
- **Main** (`presence-wiring.ts`). The local panels canvas-sync diffs carry a relay panel's
  recorded `sessionId` and `program`, and nothing else of the record (no `shareId`).
- **The renderer** (`SharedPlaceholderLayer.tsx`, `Canvas.tsx`). A relay placeholder no
  longer says "Relay terminal on *name*'s machine — nothing runs here", which was false:
  it runs on the team relay. It reads "*name*'s terminal on the team relay · *program*",
  or "no session yet". With a session, it offers **Attach**, which opens a relay panel 40px
  right of the placeholder with `{ program, sessionId, shareId: the active workspace's
  share }` through the same `openRelayPanel` every relay door uses.

## Decisions, and why

- **The session id may cross; it grants nothing.** Attaching is decided by the relay
  (M335): the token's user, the session's share, and `workspace_role` asked as that
  person. A teammate who could not attach before cannot attach now. The id is not
  terminal bytes, so this is not a new disclosure surface, and no scrubber applies.
  `shareId` does NOT cross: the attaching side supplies its own active share.
- **Only the panel's owner binds it** (`relay-bind`, owner of the panel, any writing
  role). The session is minted for the machine that runs the panel. A second author
  could point everyone's Attach at a session of their choosing, which the role table
  exists to prevent. `srv.relay.1` shows the real server closing an editor who tries.
- **Attach is a new panel, not the placeholder turned live.** The placeholder stays the
  owner's card. The person's attach is their own panel, beside it, recorded with the
  session so a relaunch attaches again (M338's rule), and on the shared canvas it shows
  up as their own relay card.
- **The share dialog's copy is unchanged.** It says what does NOT leave the Mac ("No
  command, folder or transcript"), and that is still true. A relay session is not this
  Mac's data. `docs/accounts.md` names the new field where it lists what crosses.

## Checks

`verify:canvas-sync` 58/58:
- `cs.relay.1`: the role table — own panel only, never a viewer or an unshared room.
- `cs.relay.2`: diffLocal creates with the pair; a new session is ONE bind, an ended one
  unbinds, and an unchanged one writes nothing. The pair is read back.
- `cs.relay.3`: inspectUpdate reads a bind with its owner, and half a pair, a bad id, or a
  session on a terminal comes back unknown.
- `cs.relay.4`: two machines. A teammate's view carries the placeholder with its session,
  and no command or cwd.
- `cs.relay.5` (source text): the placeholder's Attach is the person's click, and it opens
  a relay panel with the session.
- `srv.relay.1`: through the real Hocuspocus server. The owner's bind reaches an editor,
  and the editor re-pointing it is refused, closed, and never lands.

## Gate

`npm run verify` (2026-09-26, 797.9s, load average about 12 on 8 cores): 59/61. Two
reds were the documented load flakes:
- `verify:panels:agents` hit its 116 s watchdog;
- `verify:panels:product` had `onboarding.start.1` red, plus its 230 s watchdog.

Rerun alone, each part was at baseline: agents 80/82 (`template.1`, `detail.1`) and
product 109/118 (`starter.1`, the six `workflow.*`, `reach.1`). Every other suite passed,
and `verify:canvas-sync` is 58/58.

`verify:visual` was not re-run. No scene draws a shared placeholder, so this milestone
changes no pixel the harness can see (see Owed).

## Owed

- **No golden shows a relay placeholder.** The shot harness has no shared workspace with a
  teammate's panels. That lands with M345's shared-workspace harness, alongside the
  Members view and the account menu click-through.

Next: M344 (names from the presence roster in the relay strip, instead of 8-character
ids).
