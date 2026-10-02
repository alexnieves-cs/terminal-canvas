# M421–M427 — the World view, from a diorama of workers to a live map of the work

The brief (2026-10-02, the user's): make the 3D world view *ahead* in what people will want to
see and do. The answer given before this run: stop chasing the cortxos reference on looks, and
make every object in the room a fact about the work. Seven milestones, each a local commit on
`main`, unpushed. `verify:world` 138 → 189.

| M | Commit | What landed |
|---|---|---|
| M421 | `fd6f356d` | The data layer: a file tool's `path` in the feed (relative to the agent's folder, scrubbed at the producer), `world-activity.ts` (what the hands are on), `world-context-store.ts` + `useWorldContextPublisher` (tasks and plans, waiting requests, handoffs, peers — and the room's action doors). |
| M422 | `0651b4f6` | Act from the room: a waiting agent's card is its request (Approve / Deny / Open through Canvas's `answerRequest`), the table turns amber, the Ask pill SENDS to a picked robot or the only chat agent, a pose per activity. |
| M423 | `fc03c0f2` | Structure: agents grouped by task on tinted terraces, a tile per file in play, an amber conflict when two agents write one file, the plan on the whiteboard, sub-agents orbiting their parent, handoff arcs. The decorative cubes and "DESK 01" are retired. |
| M424 | `cc2e7512` | Cards lead with the fact a person would act on; the four density layers follow distance; the request count moved to the overlay; the fps readout hidden; desks lowered. |
| M425 | `1349d2d4` | Time: a journal by arrival, a scrubber over the last hour, "While you were away" with a camera tour. |
| M426 | `22bff03a` | The shared room: teammates' initials on the agent they look at, a strip with follow, `mode: 'world'` and the picked robot reported as the current panel. |
| M427 | (this commit) | Shipping it: the dev gates are gone, the built renderer was measured under `file://`, an automatic bloom-off for a starved GPU, `orch-zoom.3` reads the real entry. |

## Departures from what was proposed, and why

- **"Ask → real dispatch behind `outward`" was wrong.** `outward` gates text LEAVING the app; the
  composer sends a person's own words to their own agent without it (`ChatConversation.tsx`). The
  room's send is the composer's door, unscrubbed, like it. A terminal agent takes no message from
  the room: its input is a PTY, and a stray Enter from across the room runs a command.
- **The table sign moved off the table.** A sign over the decision table sat on the waiting robots'
  own request cards (they stand round it); the count is a top-centre button in the overlay, and a
  press picks the agent that has waited longest.
- **The decorative cubes are gone, not kept "when there are no files".** An empty sky is the honest
  one; a cube with nothing behind it is the thing this run exists to end.
- **The error bee's `.glb` stayed.** The plan was to make it procedural if `file://` could not load
  it. Measured in the built renderer (`electron-vite preview`, `file:///…/out/renderer/index.html`):
  `fetch('./models/quaternius-platformer/Bee.glb')` → 200, 185 648 bytes, no CSP refusal in the log.
  Then in the PACKAGED app (`npm run verify:packaged`, 12/12, unsigned `--dir` build), launched with a
  debugging port: the page is `…/Contents/Resources/app.asar/out/renderer/index.html`, the same
  fetch from inside the asar → 200, 185 648 bytes, and the top bar's toggle opens a live room.
- **Base-M1 fps is still unmeasured** — there is no base M1 here. The answer to it is the
  governor: at the pixel ratio's floor and still under 40 fps for `STARVED_WINDOWS`, the bloom goes
  for the session (`setBloomOn(false, false)`, never stored).

## Traps, each found by running the real window

1. **Fold the journal by ARRIVAL, not by `ts`.** The first cut stopped the fold at the first event
   stamped after the moment; one early-stamped arrival from another clock held back everything
   after it (it happened in `verify:world`, whose earlier checks run on fake clocks). The past room
   is what the room showed, when — `JournalEntry.at`, monotonic in the store.
2. **The canvas re-publishes the context on its own renders.** A context injected from DevTools
   (an approval, a task) is overwritten on the next canvas render; inject and act in one evaluation.
3. **`data-tone` is reserved on the world tag** (`world.tone.2` pins that nothing paints from it);
   the headline's tone is `data-lead`.
4. **A pure-module edit re-creates the store under HMR**, and the new copy is never connected to
   the feed: the room shows "No live agents" while DevTools' import still reaches the old one with
   live agents. Restart dev after editing a pure world module (M416 recorded the same trap).
5. **`orch-zoom.3` read every `index-*.js` as the first chunk.** Once the world ships, rollup
   factors three into a shared lazy chunk named after three's own `index`; the check now reads the
   entry `index.html` loads and follows its static imports.
6. **A card that moves cannot be clicked from a measurement taken a frame earlier**: the CDP driver
   measures and clicks in one step (`clicksel`).

## Owed

- `verify:visual`: the top bar now carries the "World view" button in the built renderer every
  scene is shot from, so every golden with a top bar will differ — on purpose. Look, then
  `UPDATE_GOLDENS=1`; do not blind-update.
- A fresh-context critic of the new room against `cortxos-1`.
- A real agent's file paths and plan in the room (the run used the simulator and injected
  contexts); a real teammate in the shared room (no second account here).
