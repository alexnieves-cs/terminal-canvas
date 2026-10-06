# Gate B — 3D World, hands-on

Tick this on a Mac, on `redesign/main` at tag `rd-world` (`109d7e6b`). The Linux shot host does not present the room (R-044, R-053). This list is the pass on a machine where WebGL does.

The mockups are `docs/redesign/mockups/10`–`14`. Judge the behaviours below. Two recorded disagreements stay out of the fail column: robot shells are one neutral, and identity is the chest light; the room is the night studio in both app themes. Sample names (Steward, SW-412, MK) live in the fixture. MK is not drawn unless a real teammate is watching.

## How to run

```sh
TC_FIXTURE=rd-steward npm run dev
```

The fixture writes a throwaway `userData` (the log line is `[fixture] TC_FIXTURE=rd-steward userData=…`) and a layout named Steward. Shells sleep. They do not launch Claude or Codex. The window needs to be at least 900px wide. Below that, World says the window is too narrow and mounts no room.

The cast is five tasks. Dev does not inject the `world` statuses. The shot scenes do, from `scripts/fixtures/rd-steward/world-sim.ts`. Where a step needs a waiting agent, a failed agent, or a shell prompt, use a live one in that state, or accept the shot's frame as the reference for what those statuses must look like.

| Task | Panels in the room | Status the shot injects |
|---|---|---|
| Ledger CSV export · SW-412 | Claude — ledger-export | working |
| | Codex — ledger-export | waiting, "wants to edit ledger.ts" |
| | vitest watch | idle |
| Plaid webhook retry · SW-398 | Claude — plaid-webhook | waiting, a question |
| | Codex — plaid-webhook | idle |
| Infra | shell — infra | waiting, a shell prompt |
| | Claude — infra | working |
| Steward web · pricing | Claude — pricing | working |
| | Codex — pricing | failed, "exited 1" |
| Steward mobile · onboarding crash · SW-421 | Codex — mobile | working |

Changes on Ledger CSV export is a review card, not an agent. The shot's tally is 3 waiting, 1 failed, 4 working.

**Tick.** Pass, fail, or gap. A gap tick means the result matched the known-gap line for that R number. Anything worse is a fail. Chords are the registry's: ⌘⇧W World, ⌘J / ⌘⇧J next and previous, ⌘Y Allow, ⌘↵ step in, ⌘Esc step out, ⌘1 / ⌘2 / ⌘3 Work / Plan / Map, ⌘0 fit.

The lens is the `2D | World` control at the canvas's top left. The top-bar World button is gone.

---

## 10 · Canvas → World

Mockup `10-world-transition.png`. The move is 1000ms, `easeInOutCubic`, one clock. The filmstrip marks are 0, 250, 500, 750, 1000 ms.

- [ ] **⌘⇧W in, and the two views meet.**
  1. On the canvas, pan until **Ledger CSV export** fills the view. Note which region sits under the centre.
  2. Press ⌘⇧W. (The lens's World segment does the same thing.)
  3. Watch the second the chip is up.
  4. When the chip hides, look at which terrace is in front of the camera.
  - **Expected.** The chip reads `Entering World · Esc cancel`, with a bar that fills. The filmstrip sits on the move. World is pressed on the lens. The plan tilts back onto the floor, terraces rise out of it, and robots pop nearest-first. After it settles, the terrace in front of you is the region you had framed. A jump to an empty origin, or a terrace that is a different task, is a fail. The hand-off the code checks is 2px at 1440×900; by eye the framed task and the terrace are the same place. Terminals keep running: a shell's sleep is still the same process when you return.

- [ ] **⌘⇧W out, same spot.**
  1. In the room, orbit until a different terrace (Infra, or pricing) is centred.
  2. Press ⌘⇧W, or click **Back to 2D** on the camera panel, or click **2D** on the lens.
  3. Wait until the canvas is still.
  - **Expected.** The move runs back over the same second. When it settles, the canvas is framing the spot the orbit was on. The region under the 2D centre is the terrace you were looking at. The world layer is gone. The lens shows 2D pressed.

- [ ] **Esc mid-move reverses the move.**
  1. From the canvas, press ⌘⇧W.
  2. While the chip is still up, press Esc.
  - **Expected.** The move turns around from the moment you press, at the same speed. A reverse from halfway takes about half a second. You land on the canvas you left. The chip and the filmstrip go with the layer. Esc after the room has settled leaves the world too, unless a robot is in focus (that Esc is screen 12).

- [ ] **Reduced motion is the 120ms cross-fade.**
  1. Turn on Reduce motion: System Settings → Accessibility → Display. The room reads `prefers-reduced-motion` live, including a change while it is open.
  2. Press ⌘⇧W in, then out.
  3. Turn Reduce motion off and enter once more.
  - **Expected.** With it on, the swap is a cross-fade of about 120ms. The plan does not tilt, terraces do not rise, and robots do not pop. With it off, the full second and the tilt return. The 120ms fade is short; missing Esc inside it is the duration, and the full-motion second is the cancel to judge.

---

## 11 · The World, Plan tier

Mockup `11-world-main.png`. Press ⌘2 if the camera panel's Plan row is not already pressed.

- [ ] **Five terraces sit on the five regions.**
  1. Enter with ⌘⇧W and press **Fit room** (camera panel, or ⌘0) so the whole floor is in frame.
  2. Read the terrace signs against the 2D region chips. Leave with ⌘⇧W and compare.
  - **Expected.** One terrace per task, in the same arrangement as the canvas. A sign keeps the chip's title, its ticket, and criteria as `n/n` (Ledger CSV export reads with SW-412 and `2/4`). Desks stand on agent panels. A panel that is not an agent is a console. Dragging the canvas, then re-entering, shows the new boxes: the room reads positions when it opens.

- [ ] **State colours match 2D.**
  1. On the canvas, note each panel's tone word (the state dot and the word beside the name).
  2. Enter the room and find that agent's robot.
  3. For the shot's frame, the cast table above is the assignment: four working, three waiting, one failed (Codex — pricing), two idle.
  - **Expected.** The same tone as the 2D panel, on the eyes, the antenna, the floor ring, and the desk screen.
    - Working is cyan, and the eyes breathe. Reduce motion holds that breath still.
    - Needs you is amber.
    - Done is green.
    - Failed is red. The robot slumps and stays in the room. A red pill uses the feed's own words.
    - Idle is slate.
    - The shell is one warm neutral. A chest light is identity. A dim trim is the room, and it stays dim. Judge state on the eyes, the antenna, the floor ring, and the desk screen.

- [ ] **Amber is the only beacon.**
  1. With at least one agent waiting on you, and one working, look across the room from the Plan view.
  - **Expected.** A vertical amber column rises only from a waiting agent. A working, done, failed, or idle robot has a ring and eyes in its own colour, and no column. Three waiting agents in the shot's frame means three columns. A second colour as a column is a fail.

- [ ] **The shared chrome is the canvas's.**
  1. With the queue non-empty, read the bottom pill, the minimap, and the Work / Plan / Map switch.
  2. Leave the room and read the same three on the canvas.
  - **Expected.** They are the canvas components, revealed over the room. The pill is the canvas sentence: `N agents need you`, the first item's line, `Go ⌘J`, `+ New ⌘N`. An empty queue leaves the pill quiet. The minimap draws the camera wedge and hides the 2D view rectangle. Work / Plan / Map is the canvas HUD. The room's own ask pill, legend, and fit button stay in the DOM and are clipped out of sight. **Known gap R-052:** Follow is not on that HUD. It lives on the camera panel (screen 14).

- [ ] **Dragging a terrace moves the 2D region, one undo.**
  1. Enter the room and drag the Ledger CSV export terrace to a new spot.
  2. Leave with ⌘⇧W and look at that region.
  3. Press ⌘Z.
  - **Expected.** The terrace drag is the same region move as on the canvas. The region has moved when you return, and one ⌘Z puts it back.

- [ ] **Twenty agents stay inside the frame budget.**
  1. The fixture holds 10 agent panels. Add agents until the room shows 20 (further panels on the canvas, then re-enter).
  2. View → Toggle Developer Tools. In the console, `localStorage.setItem('tc.world.stats','1')`, then reload and enter the room.
  3. Orbit for several seconds and read the stats line (`fps`, draw calls, the quality tier, the pixel ratio).
  - **Expected.** The room keeps every robot and its state. Full cards stay at three; a waiting or picked agent keeps a card past that budget. The stats line holds at or above 40 fps, or the tier steps (`full`, then `lean`, then `flat`) after a sustained drop, and the robots are still there. WebGL contexts stay at one for the room plus at most eight live terminals. A fan, a frozen frame, or robots vanishing as the count hits 20 is a fail.

---

## 12 · Focus and act

Mockup `12-world-focus.png`. A click picks the robot, which opens the close-up. A live pending request is required for Approve; the fixture's sleeping shells have none. Codex — ledger-export is the shot's pending edit (`wants to edit ledger.ts`).

- [ ] **Click focuses, and the sheet is the close-up.**
  1. In the room, click a robot once. A drag that starts on it is an orbit and picks nothing.
  2. Read the breadcrumb and the sheet.
  3. Press Esc.
  4. Click the robot again, then press ⌘Esc.
  5. Click it again, then press ⌘↵. (Double-click does this open too.)
  - **Expected.** The camera glides in and Follow is on. The breadcrumb reads `World › <task> › <agent> · Esc`. The sheet is the 400px dialog: Request (the question, a folded diff, Approve ⌘Y filled when a request is pending, Deny, Full diff), What it's doing (step words with tones), the fact line (model, context, branch, spend against cap — omitted when the agent has no meter), a reply composer, and Open in Canvas ⌘↵ plus Sessions. With nothing pending, Open in Canvas is the filled control. Esc steps back to the room (Fit) and stays in World. ⌘Esc returns to Plan. ⌘↵ leaves the room and lands the 2D camera on that panel, selected. Sessions switches to the Sessions segment.

- [ ] **Approve with ⌘Y shows in the 2D history.**
  1. Focus a chat agent that is waiting on a permission. Press ⌘Y. Also try the sheet's Approve button on a second request, if you have one.
  2. Leave the room (⌘⇧W, or Open in Canvas).
  3. In the dock's queue for that task, expand **Answered in this task**. On the task's focus page the same list is **Answered · N**.
  - **Expected.** The approval is sent immediately. The row the palette writes (`Allowed <tool> — <argument>`) is in **Answered in this task** after you return. A chat answer that is not from the room does not gain that row from this path. A short acknowledgment can still flash. ⌘Y sends the answer. The sheet's Approve button is the control that also raises the toast in screen 13.

- [ ] **Reply follows the kind of session.**
  1. Focus a chat agent. Type in the reply box and send.
  2. Focus a plain shell (vitest watch, or shell — infra when it is not the console card in screen 13).
  3. Focus an agent that is a terminal with a reply, if you have one.
  - **Expected.** A chat's composer is open and Send delivers. A plain shell's Reply box is disabled, and its placeholder reads `answer in its terminal`. An agent terminal's reply can be sent from the sheet: it is pasted and then submitted. The shell console card in screen 13 still has no reply field.

---

## 13 · Attention flight

Mockup `13-world-attention.png`. The room steps the same queue the pill publishes. With an empty queue the strip is absent and ⌘J does nothing.

- [ ] **⌘J picks the same next item.**
  1. On the canvas, with two or more items that need you, press ⌘J and note which panel becomes current.
  2. Press ⌘J once more and note the second panel.
  3. Press ⌘⇧W, then ⌘J. Read the strip and which robot the camera sits on.
  4. Press ⌘J again, then ⌘⇧J.
  - **Expected.** Inside the room, ⌘J walks the pill's queue in order and ⌘⇧J walks back. One press is handled once. The strip reads `NEEDS YOU · n of N`, with a done chip, an amber current chip, and a hollow next chip, plus the ⌘J and ⌘⇧J marks. The world and the canvas share one cursor. After a jump on the canvas, the first ⌘J in the room continues from that cursor and lands on the same panel the next canvas ⌘J would have.

- [ ] **The flight is visible, and reduced motion cuts it.**
  1. With Reduce motion off, press ⌘J between two waiting agents and watch the floor.
  2. Turn Reduce motion on and press ⌘J again.
  - **Expected.** Off: an amber dotted arc runs along the floor to the next agent, and the camera follows it (about 600–1200ms). On: the camera cuts, and the arc is not drawn.

- [ ] **The shell console card has no reply field.**
  1. Walk with ⌘J until the current item is a shell prompt (the shot's is shell — infra, "Do you want to perform these actions?").
  2. Read the card at the lower right.
  - **Expected.** The card is titled as a shell console. It shows the prompt, the command, and the sentence `A shell prompt is answered in its terminal, never from the room.` The buttons are Open in Canvas ⌘↵, Snooze 10m, and Next. A textarea or a Reply field on this card is a fail. Next walks the queue the same way ⌘J does. Snooze 10m hides that prompt from the world's walk and from the canvas jump. The inbox's own Snooze menu is still 15 min, 1 hour and 4 hours.

- [ ] **D9 Undo.**
  1. Focus a chat with a pending edit and click **Approve** on the sheet. That click raises the toast. ⌘Y sends the answer on its own.
  2. Read the toast the moment it appears.
  3. If you have a panel whose review discard is ready (a root, a baseline, a subject, and at least one path), approve that one too.
  - **Expected.** The sentence is `Approved <agent>'s edit to <file>`, immediately. There is no hold. D9 Option B: when review discard can revert that panel, the toast's action is Undo, and Undo discards the review. When that offer is absent, including an across review, the action is View diff. A live Approve passes the real offer. Nothing un-tells an agent that already received yes.

---

## 14 · Overview, camera, and time

Mockup `14-world-overview.png`. The camera panel is the lower-left group labelled Camera.

- [ ] **The camera panel matches its chords.**
  1. Read every row.
  2. Drag to orbit, Shift-drag to pan, scroll to zoom on the cursor. A pinch is a wheel with ctrl held.
  3. Press ⌘1, ⌘2, ⌘3, and click Work, Plan, Map.
  4. Click **Follow picked** with a robot selected. Press F.
  - **Expected.** Orbit, pan, and zoom-to-cursor behave as the rows say, and the floor point under the cursor stays put while you zoom. ⌘1 is close (the focus distance), ⌘2 is the room, ⌘3 is near top-down and Map is pressed. The rows show the registry chords, including ⌘0 on Fit room, ⌘⇧W on Back to 2D, and F on Follow picked. F follows the picked robot. ⌘F remains Search. **Known gap R-052:** the bottom Work / Plan / Map switch has no Follow beside it.

- [ ] **Fit room is centred.**
  1. Orbit and pan until the floor sits in a corner of the window.
  2. Click **Fit room**, or press ⌘0.
  - **Expected.** The glide frames the terrace bounds in the centre of the view. A fit that aims at the origin and leaves the tasks off to one side is the old "Fit room sits off-centre" miss, and it is a fail.

- [ ] **Map tier is the floor plan.**
  1. Press ⌘3.
  - **Expected.** The camera pitches toward top-down. The terraces read as the canvas layout. You can still tell working, waiting, failed, and idle apart by ring colour. Amber is still the only column.

- [ ] **Replay disables the verbs and says why.**
  1. Click **Replay · last hour** so the scrubber opens. If the journal is empty, generate a little live activity first (a status change) and reopen.
  2. Drag the scrubber off Live, onto an earlier moment.
  3. Look at the scrubber, then at a robot's card.
  4. Click **Live**.
  - **Expected.** The scrubber title is `Replay · last hour`. Ticks use the state colours (working cyan, needs-you amber, done green, failed red, idle slate). Off Live, the scrubber says `past room — go Live to act`, and Ask, Open, and Approve on that bar are disabled with that sentence as their reason. The card keeps Approve, Deny, and Open visible, disabled, with the same sentence. Time controls (play, the range, Live) stay usable. Live returns the room to now and the verbs work again.

- [ ] **While you were away.**
  1. With events in the last hour, read the card on the right.
  2. Click **Tour the changes · 40s**. With Reduce motion on, start the tour again.
  3. Dismiss, then stop a tour midway.
  - **Expected.** The card lists real feed events and offers `Tour the changes · 40s` and Dismiss. The tour flies between beats. With Reduce motion on, it cuts. A teammate's initials appear on the agent they are watching. The mockup's MK is sample copy; an empty peer list with nobody watching is a pass.

---

## Flat room · WebGL off

The fallback is the existing flat room, extended. It is what you get when the probe says there is no WebGL context, or when a context is lost and does not return within two seconds.

- [ ] **A Mac that presents WebGL shows the 3D room.** **Known gap R-044 / R-053** on the Linux shot host only.
  1. On this Mac, press ⌘⇧W and wait out the move.
  - **Expected.** The night room is on screen: terraces, robots, the camera panel. The flat-room banner stays hidden. **R-044** is the Linux shot host blocklisting WebGL. **R-053** is that host answering the probe yes while the world canvas reads back blank, so the capture is an empty light field and the flat room stays unmounted. On this Mac the night room is the pass. A blank field here, with World pressed and no banner, is a new bug.

- [ ] **The flat room appears when WebGL is off.**
  1. Quit the world (⌘⇧W) so the next open probes again.
  2. View → Toggle Developer Tools. Before entering, stub the probe:

     ```js
     const orig = HTMLCanvasElement.prototype.getContext
     HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
       if (type === 'webgl' || type === 'webgl2') return null
       return orig.call(this, type, ...rest)
     }
     ```

  3. Press ⌘⇧W.
  4. Read the banner, the terrace labels, and one tile. Click **Open in Canvas** on a tile. Click **Back to canvas**.
  5. Restore `getContext` (`HTMLCanvasElement.prototype.getContext = orig`) and enter again to confirm the 3D room returns.
  - **Expected.** The banner reads: `The world view needs WebGL, which this machine is not providing right now. The room is shown flat: every agent at work, and everything the room lets you do.` **Back to canvas** is on the banner. Terraces and tiles use the same task names and the same state words as the 2D panels, through the tone tokens (cyan working, amber needs you, green done, red failed, slate idle). A waiting tile's open button says **Open in Canvas**. The attention line, when the queue is non-empty, is the pill's sentence. The 2D canvas stays mounted underneath: leaving does not kill the shells. A lost context that never returns uses this same room, with **Try again** beside Back to canvas.

---

## Doors

Both directions. Each door also has a palette row (`View in World`).

- [ ] **View in World, from a panel.**
  1. On the canvas, select **Codex — ledger-export** (or any agent panel).
  2. Open the panel's ⋯ menu and click **View in World**. A panel inside a task lists it twice: once for the task (`Open the World on this task, with this panel picked`) and once for the panel (`Open the World on this panel`). Try each on two panels.
  3. Return with ⌘⇧W. Press ⌘K, run **View in World**.
  - **Expected.** The room opens on that floor point with that agent picked. The task row frames the terrace and picks the panel you started from. The panel row frames that panel. The palette row is the same verb (`world.view`).

- [ ] **Show in World, from Sessions.**
  1. Click **Sessions** in the centre nav.
  2. Hover a row until **Show in World** appears, and click it.
  - **Expected.** You land in the room on that session's floor point, with its agent picked. The button is quiet until hover, focus, or keyboard focus on the row.

- [ ] **Open in Canvas, the way back.**
  1. From the room, pick a robot and press ⌘↵, or double-click it, or click **Open in Canvas** on the focus sheet.
  - **Expected.** The reverse move runs. The 2D camera lands on that panel and the panel is selected. A shell prompt's **Open in Canvas** does the same, and does not type into the terminal.

- [ ] **Orchestrate's View in World still lands.**
  1. Open Orchestrate from the View menu row **Orchestrate**, or ⌘K → **Show Orchestrate**, on a focused island that has members.
  2. Click **View in World**.
  - **Expected.** The room opens framed on that island's agents.

---

## Must fix before release

The eight items below landed on `rd/fix-must`. R-044 and R-053 stay with the Linux shot host; a Mac that presents WebGL does not show that blank field. R-052 (Follow on the shared tier switch) and R-082 stay open.

- **R-051** — done, `4587d7cf`. Dragging a terrace commits `moveRegion` as one undo, and the 2D region moves with it.
- **R-070** — done, `f4bb5dff`. Approve in the room writes the task history row (`Allowed <tool> — <argument>`). A chat answer does not.
- **R-094** — done, `4c0882fd`. Live Approve offers Undo when review discard can revert that panel. Otherwise View diff.
- **R-091** — done, `4fc157d6`. ⌘J in the World and on the canvas share one cursor.
- **R-063** — done, `2c8e2d35`. In a past room the card keeps Approve, Deny, and Open, disabled, with `past room — go Live to act`.
- **R-071** — done, `a968d951`. An agent terminal's reply can be sent from the focus sheet. A plain shell stays closed.
- **R-061** — done, `31fbafed`. Follow picked is F. ⌘F remains Search.
- **R-093** — done, `da29d8cf`. Snooze 10m hides a shell prompt from the world's walk and from the canvas jump.
