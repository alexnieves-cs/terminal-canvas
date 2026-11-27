# M699: the fleet wall

One page that shows every agent on the canvas at once: who needs you, what the canvas has cost
and how that grew, which files the agents touched, and how each agent's state moved. It also
draws the same window as a 24-second film. This is the open "history" half of backlog #19
(tokens and dollars over time), plus the wall that sits around it.

Built on the `fleet-wall` branch off `release-7.0`. It has not been merged or pushed.

## What a person sees

- **Doors.** It has three ways in: View ▸ **Fleet wall** (`data-view-fleet`), the palette row
  **Show Fleet wall** (`canvas.fleet`) and `#/fleet` on load. It is a center view, `'fleet'`,
  that is never stored. Like Team and Lessons, a relaunch never opens on it, and a settings
  re-read never pulls a person out of it.
- **Header.** The count of agents in each state (needs you first), the window (5 min,
  15 min or 1 hour, clipped to the first event the store holds) and **Export time-lapse**.
- **Totals.** Agents, tokens on this canvas, spend on this canvas and files touched. The spend
  total is unknown ("not priced") when any model is missing from the price table, as it is
  everywhere else in the app.
- **Agent cards.** One per agent, in `statePriority` order. Each card shows its state word, its
  last line, its spend and tokens in the window with a sparkline, its tool calls and the files
  it edited. Clicking a card shows that panel on the canvas. An agent whose transcript this app
  does not account for (Codex, a shell) says "no usage reported", never a zero.
- **Spend over time.** A stacked area chart, one band per agent, all in the one money accent
  (`--violet`), with direct labels at the right edge. Agents on an unpriced model are counted in
  tokens and named in a note under the chart.
- **Files touched.** A two-level squarified treemap (Bruls et al.): folder, then file. Each
  square is sized by touches, shaded by heat, and labelled with its touches and edits. A file is
  counted when a call starts, from the feed's `path` (M421), or from Codex's `apply_patch`
  summary (`Update|Add|Delete <path>`). No other shell line is parsed for a path.
- **State over time.** One lane per agent. Each lane is coloured by state through the same
  `[data-tone]` tokens as the status dot, with a tick per tool call (edit, read, run, failed).

## Files

| File | What it is |
| --- | --- |
| `src/renderer/fleet/fleet-model.ts` | Pure. `spendOverTime`, `stateLanes`, `toolTicks`, `filesTouched`, `squarify`, `fileTreemap`, `fleetTiles`, `wordCounts`, `fleetWindow`. Statuses go through `statusAfter`, the store's own reducer. |
| `src/renderer/fleet/FleetWall.tsx` | The page. Reads `useAgentIds`/`getAgent`/`getJournal` and `useUsageHistory`, re-reads once a second while showing, and is unmounted on every other page. |
| `src/renderer/fleet/fleet-film.ts` | Pure. `lapseScript` scrubs every word once through `outward(…, 'fleet time-lapse')` and counts what it redacted. `lapseFrame(script, i)` is the frame model. |
| `src/renderer/fleet/fleet-paint.ts` | Draws a lapse frame on an `OffscreenCanvas`. Reads only the frame, its script, the state palette and the model's formatters. |
| `src/renderer/fleet/fleet-export.ts` | Checks the codec, reads the journal and history once, encodes through `encodeFrames` and saves through the night film's export door with `film: 'fleet'`. |
| `src/renderer/session/usage-store.ts` | Keeps a usage history per panel (720 points, one hour), immutable, with its own listener set, so a history subscriber never re-renders on every usage tick. |
| `src/renderer/film/film-encode.ts` | `encodeFilm` is now a wrapper over the exported `encodeFrames`. Same codecs, bitrate, key spacing and queue bound. Its imports are unchanged (`film.wire.1`). |
| `src/shared/export.ts`, `src/main/film-export.ts` | `NightFilmExportRequest.film?: 'night' \| 'fleet'`. The save dialog suggests `fleet-wall-<day>.mp4` for a fleet film. |
| `src/web/fake-bridge.ts`, `src/web/demo-script.ts` | The demo's Claude agents report a growing `PanelUsage` (demo figures, sized like real turns). Codex agents report none, which is the app's own truth. The scripts touch a few more files. A film made in the browser downloads. |

## Checks

`verify:film` gained four scoped checks:

- `film.fleet.1`: spend starts at the window's baseline, only climbs, sums its lines, and keeps
  an unpriced model in tokens only.
- `film.fleet.2`: files come from a path or an `apply_patch` summary, a result is not a second
  touch, and the treemap tiles every file inside its box with no overlap.
- `film.fleet.3`: a token planted in a tool summary, a path, an agent name and a message
  reaches no frame of the time-lapse, and the gate counts it.
- `film.fleet.4`: the page, View row, palette row and save name are wired, and the painter
  imports no live store.

The page and the painter were checked by running them. The web demo was built, the wall was
shot in light and dark, a live recording was taken, and **Export time-lapse** was pressed in
headless Electron. That export wrote a 24-second, 1280×720 H.264 MP4 (720 frames at 30 fps).

## Not done

- A per-workspace wall. The stores hold the canvas on screen, and the canvas-wide figure is the
  one a person acts on (the same call as #19's note).
- Usage history that survives a relaunch. The history lives in memory for an hour. The ledger's
  closed-panel usage rows (M142) are still the week's record.
