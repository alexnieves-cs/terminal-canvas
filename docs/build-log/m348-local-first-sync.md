# M348 — local-first: an offline edit is kept, survives a crash, reaches the room, and is SAID to be waiting

**Verdict: shipped.** Arc 1.2. The prompt asked for y-indexeddb offline queueing. That is
the wrong layer here: a shared workspace's Y.Doc lives in MAIN, not the renderer, and
y-indexeddb is a browser IndexedDB persistence. What the doc needed was measured first.

- **Durability was already there.** Main writes the doc's bytes into `layout.json` on
  every change: `canvas-sync.ts persist` → `layout-store setSharedState`, with the store's
  500 ms debounced atomic write. The provider sends what the server lacks when it
  reconnects.
- **Nothing proved it end to end.** The new `offline.1` does, with real providers and a
  real persisted server.
- **Nothing SAID it.** An offline shared workspace looked exactly like a connected one,
  and silence while offline reads as "saved for everyone". That is fixed: a chip under
  the roster strip says `Offline — 3 changes waiting to sync`, `Reconnecting…` or
  `Syncing 2 changes…`, and says nothing at rest.

Built 2026-09-26 on local `main` on top of M346–M347.

## What landed

- **The roster carries the room's unacknowledged changes** (`shared/presence.ts`
  `PresenceRoster.unsynced`). They come from the provider's own count
  (`presence-provider.ts`, `onUnsyncedChanges`) through the hub (`presence-hub.ts`,
  `onUnsynced` on its `connect`), which re-emits the roster only when the count changes.
  The field is absent at zero.
- **`syncLine(roster, shared)`**: the one line a SHARED workspace shows. An unshared
  workspace's room is presence only, so it has nothing to sync and says nothing.
  - connected and caught up → nothing;
  - connected with changes in flight → `Syncing N changes…`;
  - connecting → `Reconnecting…` or `Reconnecting — N changes waiting`;
  - disconnected → `Offline — N changes waiting to sync`, or `Offline — changes sync when
    the server is back`;
  - presence off → `Not syncing — <reason>`.
- **`presence/SyncChip.tsx`**. It renders under the roster strip, inside one new
  top-centre column (`.presence-top`) that takes the strip's old place exactly, so the
  strip does not move. It is amber when offline or off. It re-renders only when its line
  changes, never at the roster's 15 Hz cursor rate.

## Decisions, and why

- **No second persistence layer.** The doc is persisted where it lives. The 500 ms debounce
  is the whole crash window, and it is the same window every other layout change has. A
  per-keystroke flush of `layout.json` during shared typing would trade disk churn for
  half a second.
- **The chip says "waiting", never "unsaved" or "lost".** The changes are kept (main) and
  will be sent (the provider). Words that alarm about a state that is safe would teach a
  person to ignore the chip when it matters.
- **Only a shared workspace gets it.** It is told `shared` by the canvas (the shared view
  exists), because an unshared room going offline changes nothing the person relies on.

## Checks

- `verify:canvas-sync` **offline.1** (75/75), end to end: real `HocuspocusProvider`s, a
  real Hocuspocus server with M346's store (PGlite), and main's own canvas-sync on both
  machines.
  1. The server goes away.
  2. The owner moves a panel; the provider counts it (`queued: 1`), and main has already
     kept it (`keptOffline: 777`).
  3. The owner's app "crashes" and relaunches from those bytes (`relaunched: 777`).
  4. The server comes back on the same store, and the teammate ends with the move.
- `offline.2`: the returning edit is stored by the server too, so someone arriving later
  is served it with the owner gone.
- `verify:presence` (29/29):
  - `sync.roster.1`: the count rides the roster, is re-emitted only on a change, and is
    absent at zero;
  - `sync.roster.2`: while the room is not connected, every peer is reported `live: false`.
    A teammate last seen before the drop is not shown as live beside the word "Offline";
  - `sync.line.1`: the nine-row table of lines, including silence when caught up and
    for an unshared workspace;
  - `sync.wire.1`: the provider reports, and the canvas passes `shared`.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 850.7s: 58/61 suites, and
every red is either the baseline or load.
- `verify:panels:agents`: `template.1` and `detail.1`, the baseline.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`, the baseline.
- `verify:panels:kinds`: a watchdog timeout under the tier's load. Rerun alone, it was
  green in 50.0s of its 60 s (the flake rule).

The plain tier, including `verify:presence` 29/29, `verify:canvas-sync` 75/75 and
`verify:meta`, was green in wave 1. `verify:visual` is hand-run: 71/72, with `starter`
red as before.

## Goldens

Three scenes changed on purpose. Each was judged by a fresh-context critic before
`UPDATE_GOLDENS=1` wrote it, and the run wrote exactly those three (`starter` stays red
on purpose, as before).

- **`shared-offline`** (new). The first critic sent it back: the chip sat on the relay
  panel's border. The scene was recomposed (a pan of 80 and a placeholder of 160, so the
  chip has clear ground). The second round's notes became product rules:
  - a teammate shown live beside "Offline" is a lie, so the hub now reports every peer
    not live while the room is down (`sync.roster.2`);
  - an away tile that looked like a live one is now drawn with a dashed, desaturated
    border, and its agent dot is hidden.

  The final critic: "Matches intent: one amber-outlined chip reading `Offline — 3 changes
  waiting to sync` sits centred 4px under the roster strip. sam's roster tile is dimmed to
  a grey 'S' inside a dashed pink outline, and there is no sam cursor anywhere on the
  canvas (I measured: no cursor or label pixels). sam's two dashed pink placeholders
  (relay · shell with Attach, and tests — api) are at exactly the same position as in the
  share-members candidate (top at 640px, bottom at 799px), the relay · shell panel is
  still live and selected, `+ Create` is present, and no text says changes are lost."
- **`shared-canvas`**, recomposed with the same fixture: "Matches intent: the roster
  strip shows one magenta "S" avatar above the owner's selected `relay · shell` terminal,
  and sam's magenta cursor with a `sam` tag sits in the body of the right-hand
  placeholder. Beneath it are two dashed, pink-tinted placeholders, each with a magenta
  dot and a `sam` tag in the header. The first, `relay · shell`, reads "sam's terminal on
  the team relay · shell." and has an Attach button. The second, `tests — api`, reads
  "Terminal on sam's machine — nothing runs here." There is no sync chip, and nothing is
  clipped or overlapping."
- **`share-members`**. The critic said: "DEFECT: The dialog itself is unchanged.
  `"api" is shared`, the owner line, ada-lovelace (you) Owner, sam Editor, lin Viewer,
  octocat Not in and the focus-ringed Done are identical in both shots... more than a pan
  changed behind the scrim: sam's two placeholders shrank from about 189px to about 159px
  tall, and sam's cursor did not move with the canvas..."

  **Recorded disagreement:** these are the deliberate fixture changes the three scenes
  share, and they were not declared to this critic. The pan is 80, the placeholder height
  160, and the cursor sits at y+130, so the chip has clear ground and nothing touches the
  bottom pill. What the scene is FOR, the dialog, is unchanged, and the critic confirms
  that. The scene also closes through Done now, because the harness's `press('Escape')`
  never reaches Radix (Owed).

## Owed

- **The Electron check of the chip in a real renderer is its scene** (`shared-offline`).
  No panels part mounts a shared workspace with a live provider.
- **The shot harness's `press` dispatches on `window`.** Radix listens for Escape on the
  document, so `press('Escape')` never closes a Radix dialog. `share-members` now closes
  through Done. A `press` that dispatches on the document would be truer, but every
  scene's goldens would need re-judging, so it is recorded, not changed.

Next: M349 (Arc 2.1 — agents as roster citizens: an agent on a shared canvas is a who,
with its owner's colour and attribution, in the roster and on the Team view).
