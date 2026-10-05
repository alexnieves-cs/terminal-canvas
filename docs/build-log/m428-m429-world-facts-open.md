# M428–M429 — the work's own facts in the room, and from a robot to its panel

Two milestones on the World view M421–M427 built (`m421-m427-world-ahead.md`). Built in a git
worktree branched off local `main` at `8010b3b4`, committed on its branch, not merged, not pushed.
`verify:world` 189 → 210. Nothing here launched Electron: the worktree's `node_modules` is a symlink
to the main checkout's, so every check is `npm run typecheck` and the plain-node suites — the room
itself has NOT been looked at. See **Owed**.

| M | Commit | What landed |
|---|---|---|
| M428 | `74447ae6` | `WorldContext.facts` — per agent: model, backend (non-default only), spend and its cap, context % of a measured window (or tokens against a context cap), a cap's hold, worktree branch, teammate, queue — derived by `useWorldContextPublisher` from the chat store's snapshot and the panel's record, shaped by the new pure `world-facts.ts`. The facts are the inspector layer (full card up close, or the picked robot); a hold leads the card second (after a request) in warn amber, rides the mid-distance chip, turns the dot to needs-you and keeps the agent's desk. None of it in the past room. `contextUsedPct` moved to `shared/agent-session.ts` (the Work tab's Window line reads it too); the rail and the room share one `teammateNameOf`; task lanes carry their branch. |
| M429 | `2586969a` | A double-click on a robot opens its panel through the room's `open` door; Enter opens the picked robot (never in a field, on a focused button, in a menu/dialog, as a chord, mid-IME or on repeat); the picked robot's card has an "Open panel" button. `WorldActions.canOpen` (Canvas: `jumpAnywhere`'s own two cases) hides every Open affordance for an agent with no panel and the door refuses one before closing the room. One pure gate, `openableFrom`, for all three. Hint: the robot's hover tooltip, the tag's aria-label, the button's title. |
| — | (docs commit) | This log, README rows M428/M429, three load-bearing entries, `world-facts` named among the pure modules in `src/renderer/CLAUDE.md`. |

## Departures from the brief, and why

- **A held agent keeps its desk (not asked for).** Reading `main/agent-session.ts`: main sets the
  hold when a turn's result crosses the cap, the session goes `ready`, and the queue is not served —
  so the feed says `idle`, and `isLiveStatus` takes the robot out of the room the moment it is held.
  Without a roster change the hold lead (item 4) would essentially never be visible. The roster now
  filters through `inRoom(status, held, past)` = live, or held in the live room, and subscribes to the
  context store as well as the feed. A changed existing check: `world.live.2` reads `inRoom`.
- **A hold paints the dot needs-you (amber) and says the needs-you word** (`badgeFor`). Main's tracker
  says `wants-you` for a hold and the decision queue lists it; the feed's idle would paint it grey —
  a rest layer saying the wrong one state. Consequence: a non-compact held card keeps its frame at the
  rest tier, like a request's (`.world-tag[data-tier="rest"]:not([data-badge="wants-you"])…`). A
  compact held robot still shows only the chip mid-distance and the dot far off — the hold is NOT
  forced to a full card the way a request is.
- **The hold is second in `cardHeadline`'s order**, after a request and ahead of a stop, a failure, a
  conflict and a silence: while held, main serves the agent nothing, so a stop or failure under it is
  history and the next send would be refused regardless. A request still comes first: it names the one
  thing to answer.
- **`windowWords` lives in `shell/inspector-fields.ts`, which the new module may not import** (the
  door the brief asked for). Its percent rule moved to `shared/agent-session.ts` as `contextUsedPct`
  and both read it; `holdWords` was already shared. Money has no shared formatter anywhere — every
  surface writes `$${x.toFixed(2)}` inline — so the room does the same.
- **Facts are stored at the card's precision** (cents, whole percent, thousands), not raw, so the
  context store's JSON dedupe drops a meter tick no card would show (`world.facts.13`).
- **Small wording rules the brief left open:** the backend is said only when it is not the default
  (`carryBackend`'s rule — "claude" on every card is a zero-value statement); with a context cap but
  no measured window the line says `84k of 150k context`; the teammate is omitted when the agent's
  name already contains it (the rail's chat label is `Teammate · place`); branch reads `on <branch>`,
  teammate `as <name>`.
- **Pill (item 5): no.** Argued in `factParts`' comment: the pill is rest — a name and one state read
  from across the room; a branch or queue length is not a state, and the hold (the one fact that is)
  already turns the dot amber.
- **Canvas DOES re-render on a meter today** (it calls `useChatsVersion()` twice, ~L2480 and ~L4180,
  for the rail), so the render-effect alone would have stayed current. The publisher subscribes per
  chat (`subscribeChat`) while the room is on anyway, so the room does not depend on an unrelated
  reader in Canvas staying there.
- **Double-click and Enter do nothing in the past room**, like the Open button the brief asked to hide
  there — one gate for all three. A double-click in the past room still picks.
- **Open affordances are omitted, not disabled**, for an agent with no panel — including the existing
  request card's Open (`world.replay.6`'s regex updated for its new `canOpen` gate).
- **The hint is the canvas element's `title`** set on hover over a robot, plus the tag's aria-label
  and the button's title. A `title` on the tag would never show: the card layer is
  `pointer-events: none`.
- **The double-click re-picks** (`selectAgent(agentId)`) before it opens, so a double-click on an
  already-picked robot (click 1 un-picks, click 2 is skipped as a repeat) ends picked either way.

## Traps found

1. **A hold leaves the room** (above): the feed's status for a held chat agent is idle. Found by
   reading main, not by running it — confirm live (Owed 2).
2. **`open` closed the room for a jump that lands nowhere.** `jumpAnywhere` returns silently for an
   id that is neither on this canvas nor in another workspace's `panelIds`, so the request card's
   Open on a simulated agent closed the room onto an unchanged canvas. The door now asks `canJump`
   first.
3. **A double-click is click, click, dblclick.** Without `isRepeatClick(nativeEvent.detail)` the second
   click toggled the first one's pick off before the open.
4. **The card's once-a-second re-check must ask the badge and headline with the SAME hold the render
   used**, read from `getWorldContext()` behind `replayAt() === null`; asked without it, the badge kind
   differs from the shown one every second and the card re-renders forever.
5. **A chat agent's branch is the task lane's, from the handoff hook's records** — `taskLaneOf`
   dropped the record's `branch`, and the palette's `worktreeRows` is empty until ⌘K opens
   (`task.show.1`'s trap). `laneOf` now carries `branch`; Canvas matches `panel.chat.cwd` with
   `laneOfPath`. A chat started by hand in a worktree folder that is not a task lane gets no branch.
6. **Harness:** this worktree's sandbox refuses compound shell commands (a heredoc piped into python,
   a loop over `npm run $s`); edits went through scratchpad scripts and the suites through a node
   runner that spawns each `node scripts/verify-*.cjs` directly.

## Checks

- `npm run typecheck`: clean.
- `npm run verify:world`: 210/210 (189 at `8010b3b4`; `world.facts.1`–`.13`, `world.facts.door.1`,
  `world.open.1`–`.7`; `world.live.2` and `world.replay.6` re-pinned to the new code).
- Every plain-node suite `npm run affected -- --list` selected (40, `verify:electron` excluded): green
  but `verify:first-run`'s `revamp.create.1`, which is red at `8010b3b4` too (run in a detached
  checkout of the branch point) — not this branch's.
- NOT run: anything Electron (`verify:canvas`, `verify:xterm`, `verify:panels:*`, `verify:ipc`,
  `verify:electron`, `verify:visual`, `npm run build`).

## Owed — live checks that need a person or a CDP drive

None of these was seen. Each needs `npm run dev` from a real checkout (not this worktree's symlinked
`node_modules`), the World view toggle in the top bar, and a window wide enough for the room.

1. **Facts on a card.** Start a chat agent, send it a message, open the room while it works, zoom to a
   robot (or click it): the full card shows e.g. `claude-…-model · $0.12 · 34% context` under the
   badge; orbit away to the mid tier — the facts go, the chip shows the lead. A codex/copilot agent
   shows its backend label. Check the line wraps inside the 204px card without overflow and that the
   card's height growth does not push it off the top of the view.
2. **A hold.** Cap one agent low — palette `cap-agent 0.01usd` on a chat (or Settings
   `agents.nodeCapUsd = 0.01`), or a context cap `cap-agent 10k` — and send it one message. When the
   turn ends: the robot must STAY in the room (the new `inRoom`), its dot amber, its card's lead
   `HELD AT ITS $0.01 SPEND CAP ($0.0x REPORTED)` in amber, the chip saying the same mid-distance; the
   decision queue's "Allow more" releases it and the lead goes. Then open Replay and scrub back: the
   past room must show no facts, no hold lead, and the held robot only where the feed had it live.
3. **Branch.** Board → Start work on a task (its chat runs in a lane): the chat's card says
   `on <lane branch>`. A terminal spawned from a preset with a worktree: `on <branch>`. A worktree
   REFUSAL must say nothing.
4. **Teammate and queue.** Start a chat as a teammate whose name is not in the chat's title → `as
   <name>`; send three messages fast while a turn runs → `2 queued`, which disappears when drained.
5. **Live freshness.** With the room open and a chat streaming, watch the spend tick up on the card
   without moving the camera (the per-chat subscription path).
6. **Double-click.** On an unpicked robot: one click picks (card goes full), the double-click opens —
   check that there is no visible pick → un-pick → pick flicker, the room plays its leave and the
   canvas lands on the panel. Drag-orbit starting on a robot then double-click-drag: nothing opens.
   Double-click on empty floor: nothing (and no un-pick from the `dblclick`).
7. **Enter.** Pick a robot, press Enter → opens. With the Ask field focused, Enter sends and does NOT
   open. After pressing "Fit room" (focus on that button), click a robot and press Enter — whether
   focus left the button decides whether Enter opens or re-fits; if OrbitControls keeps focus where it
   was, record it (Enter would then press the button, by design of the guard).
8. **No panel to land on.** `SIMULATE_AGENTS=true npm run dev`: a simulated robot has no Open on its
   picked card or its request card, a double-click only picks, Enter does nothing, the hover shows no
   tooltip, and the room never closes onto an unchanged canvas. A real agent in ANOTHER workspace:
   Open switches workspace and lands.
9. **Hover hint.** Rest the pointer on a robot ~1s: the native tooltip reads "Double-click, or pick and
   press Enter, to open its panel"; moving off clears it.
10. `verify:visual`: no world scene is in `shot.cjs`, so no golden should move; the Electron tier
    (`verify:panels:*`) reads `Canvas.tsx` and should be run once before merging.

## Review round (fresh-context reviewer, merged on `m428-m430-world`)

- **A stale pick opened a robot no one could see.** `selected` was never cleared when its agent left
  the roster or the room closed, so Enter opened a sunk robot's panel — and after a double-click left
  for a panel, the next open's first Enter went straight back. WorldView now lets a departed pick go and
  clears it on unmount; the Enter door also asks the roster at the keypress. `world.open.8`.
- **"0% context", "0k of 150k" and "$x of $0.00" could reach a card** — zero-value statements. Omitted
  like the spend's. `world.facts.zero.1`.
- **A robot that sank under a resting pointer left its hint and cursor on the canvas.** fiber's
  `removeInteractivity` drops the object from its hovered set with no pointerout (read in 9.8.1's
  source). The robot clears them on unmount if it set them; a robot mid-leave sets no hint. `world.open.9`.
- Not taken: the context fan-out (bounded — only a visible fact republishes) and the hold/idle order
  flicker (unconfirmed which IPC lands first; the leave path stands the robot back up) — both for the live run.
