# Terminal Canvas: revamped UI/UX concept

This is a design concept only. Nothing here changes `alexnieves-cs/terminal-canvas` or any other repo.

## What Terminal Canvas is (sources)

- **Repo:** `github.com/alexnieves-cs/terminal-canvas` (author Alex Nieves, MIT). Its `package.json` says: *"An infinite-canvas workspace where every node is a live terminal running a coding agent CLI."* It is version 5.0.0 and built with Electron, electron-vite, node-pty and xterm.
- **`PRODUCT.md`** (repo root) lays out the core job: *move a meaningful task from intention to reviewed result while the person keeps control and understanding.* A workspace holds your work. Tasks connect agents, tools and evidence. The canvas is where you see and act on those connections. Panels can be agents (`claude`, `codex`), real PTY terminals, files, previews, workflows, notes and pictures.
- **Existing features this concept keeps:**
  - tmux-backed sessions that survive a reload or quit
  - per-panel agent state (busy, idle, needs attention, exited) shown on the panel edge
  - `⌘J` jumps to the next thing that needs you, and off-screen panels get edge pips
  - a review layer that diffs each panel against the snapshot from when its agent started
  - handoff edges between panels
  - the `⌘K` palette and the bottom command pill
  - an Orchestration center view (M268)
  - the dock, inspector and minimap
- **Existing design rules this concept follows:**
  - dark "Obsidian" material with a cyan accent and 12px corners
  - one filled primary control per surface
  - mono type only for code; sentences use the UI face
  - every canvas shortcut is `⌘`-gated
  - empty states say what the surface is for and offer one verb
  - no bare zeros
  - four density layers: rest, contextual, inspector, deep detail
- **Box copies used:** `/workspace/tc-survey/` holds the survey files (`package.json`, `docs__product-rules.md`, `shell__Dock.tsx`, `shared__empty-states.ts`, `docs__m268-orchestration.md`, `orch__model.ts`). There are also resume bullets in `/home/box/archive/resume-bullets/bullets.md`.

## The revamp in one line

**A calm canvas where only state is loud.** The chrome steps back. One state colour system (cyan working, amber needs you, green done, red failed, slate idle) shows the same way on every surface. Tasks are drawn as visible territories on the canvas. The canvas has three semantic zoom tiers, Work, Plan and Map, so it stays readable at any size.

### Key ideas
1. **Tasks are regions.** A task is a labelled, dashed territory that holds its agents, terminals, changes and notes. Its label shows the ticket, the agent count and acceptance-criteria progress, so "project, workspace and task do not merge" is visible on screen.
2. **Semantic zoom with three tiers.**
   - **Work** (≥70%): live terminals.
   - **Plan** (~25–70%): each panel becomes a card with one status sentence.
   - **Map** (<25%): task territories with state dots only.
   - `⌘1/2/3` jumps between tiers.
3. **One attention story.** The bottom pill, the dock badge, the Sessions tab count, panel glow, edge pips and minimap dots all describe the same queue. `⌘J` walks it.
4. **Spawn where you are.** You can double-click empty canvas, drag from a panel's port to make a connected handoff, or press `⌘N` / `⌘T`. New panels land at the cursor, sized like the last one you used.
5. **Sessions is a peer view, not a hidden pane.** `Canvas | Sessions | Review` sit in the title bar. Sessions is the triage table for many agents. It has an attention queue, grouping by task, bulk actions and a live tail with a reply box.
6. **Failure is a state, not a dead end.** Every error says what happened, what was kept, and offers one fix.

## Visual language

| Token | Value | Use |
|---|---|---|
| Ink / canvas | `#08090D` / `#0B0D12`, 24px dot grid `#1B202A` | chrome / canvas |
| Surface / raised | `#11141B` / `#161A23` / `#1C2130` | panels, headers, controls |
| Stroke | `rgba(255,255,255,.07)` / `.12` | hairlines |
| Text | `#E7EAF0` / muted `#8C94A5` / faint `#5B6375` | three text levels only |
| Accent = working | `#5BE1E6` cyan | brand, focus, working state |
| Needs you | `#F5B544` amber | glows (the only state that glows) |
| Done | `#5EDC9A` | |
| Failed | `#FF6B6B` | |
| External / Codex | `#A78BFA` | secondary tasks, external work |
| Smart guides | `#FF5FA2` | arrange-time only, never at rest |

- **Type:** Geist for UI and Geist Mono for terminal cells, code and paths. In the real app, SF Pro and SF Mono would take these roles, following the existing face rule. Scale: 11 / 12.5 / 13 / 14 / 20–22 / 28–30.
- **Spacing:** 4px base. Panel gaps snap to 24px (the grid pitch). Panel padding is 10–12px. Region padding is 24px.
- **Shape:** 12px panels, 8px controls, 20px regions, full-round pills.
- **Elevation:** one resting shadow. Selection is a 2px cyan ring plus a 6px halo. Needs-you is an amber edge plus a soft glow.
- **Motion (spec):**
  - camera flights take 220ms with ease-out
  - panels settle with a slight overshoot
  - the working dot breathes
  - reduced motion collapses flights to a single frame

## Flow and screens

| # | File | Screen | What it shows |
|---|---|---|---|
| 1 | `01-splash.png` | Launch / restore | Brand mark and the line "Every agent, in its place." An honest restore checklist (workspace, layout, reattaching tmux 3 of 5, agent check). A ghosted canvas behind it. A hint to hold ⌥ to skip reattaching. |
| 2 | `02-onboarding.png` | First run: agents | Step 2 of 4 (Workspace → Agents → Sessions → First task). Agents are found on PATH and toggled. Missing tools offer their install command. A live preview teaches the state colours before first use. |
| 3 | `03-empty-state.png` | Empty canvas | Says what the canvas is for, with one primary verb: describe a task and start it. There are also quick spawns, three starter layouts, a ghost drop target and navigation hints. The minimap reads "Nothing placed yet". |
| 4 | `04-main-workspace.png` | Main workspace (Work tier) | A task region with Claude (selected), Codex (needs you, inline Allow/Diff/Deny), a test watcher fed by a handoff edge, and a Changes review card. A second task peeks in below, and an off-screen pip points to infra. The inspector shows the session, task criteria and one primary action. The zoom HUD, minimap and attention pill are also on screen. |
| 5 | `05-create-arrange.png` | Create and arrange | Dragging from Claude's port opens a spawn menu for a connected object that starts on finish. Smart guides show 24px gaps while dragging. A marquee selection brings up a toolbar: Align, Tidy, Make task (`⌘G`), Pause all. The note says double-click places a new panel at the cursor. |
| 6 | `06-navigate-palette.png` | Navigate: Plan tier + `⌘K` | Zoomed out to 34%. Panels become status cards and five task territories show up. The palette is grouped (panels & tasks, commands, files) with fly-to and fit-task actions and kind filters. The Work/Plan/Map tier switch and minimap sit with the zoom HUD. |
| 7 | `07-sessions.png` | Multi-session management | The Sessions view has an attention queue (approve, triage a failure), a table grouped by task with activity sparklines, run time, cost and last line, a 3-row bulk bar, and a detail pane with live tail, reply box, persistence and change stats. |
| 8 | `08-settings-keyboard.png` | Settings: Keyboard | The `⌘`-gated shortcut map (create, sessions, navigate, mouse). It flags a conflict with an agent's own `⌘K`, proposes a focus-lock answer, and shows a shortcut being re-recorded inline. |
| 9 | `09-error-disconnected.png` | Error and disconnected | A tmux host-loss banner (paused, not lost, with auto-retry). A crashed session (exit 137) explains itself with one fix. Panels that are reattaching show skeletons. GitHub data is marked offline/cached. An offline toast appears, and the pill switches to "2 sessions need recovery". |

## Key interactions and shortcuts
- `⌘N` default agent · `⌘T` shell · `⌘⇧N` choose what to spawn · double-click canvas to spawn at the cursor · drag from a port to spawn a connected handoff
- `⌘K` find or run anything · `⌘J` next that needs you · `⌘Y` allow pending request · `⌘.` pause/resume
- `⌘0` fit all · `⌘⇧0` fit task · `⌘1/2/3` Work/Plan/Map · `⌘` + arrows move between panels · `⌘↵` / `⌘Esc` step in/out · Space+drag pan · `⌘`+scroll or pinch to zoom at the cursor
- `⌘G` make task from selection · `⌘⇧T` tidy · `⌘⇧S` sessions view · `⌘⇧L` focus lock (the terminal gets every key)

## Rationale
- **Attention is the scarce resource.** With 5–10 agents running, the question that matters is "who needs me?" Amber is the only colour that glows, and every surface shares one queue, so you never scan terminals to find it.
- **Space should mean something.** Task regions make placement carry meaning: what is near each other belongs together. Semantic zoom keeps a big canvas readable without a separate dashboard. The canvas *is* the dashboard at the Plan and Map tiers.
- **Two views for two kinds of work.** The Canvas is for authoring and understanding. Sessions is for fast triage across everything. Both read the same state, and each jumps to the other.
- **Trust comes from honest states.** Restore progress, paused-not-lost sessions, crash explanations and stale-data labels all keep the person in control, which is the product's core principle.

## Rebuilding the mockups
`python3 s0N.py` writes `0N-*.html`, then `./shot.sh` renders every HTML file to a 1440×900 PNG with headless Chrome. All screens share `style.css` and `common.py` (icons and chrome).

---

## Addendum: the 3D World view

### What it is today (sources: `alexnieves-cs/terminal-canvas`)
- **Code.** `src/renderer/world/*` (about 40 files: `WorldView`, `WorldStage`, `WorldRobot`, `WorldCard`, `WorldPlatform`, `WorldMinimap`, `WorldFlat`, `world-transition.ts`, and others). It is built on three.js, @react-three/fiber and drei. The live feed comes from `src/main/world-feed-link.ts` and `src/shared/world-feed.ts`, and `scripts/verify-world.cjs` holds its checks.
- **Build logs.** `docs/build-log/m412-world-scene.md` through `m432-m434-world-crosslink.md`.
- **The room.** A "World view" button in the Canvas page's top bar swaps the 2D canvas for a 3D room. The canvas stays mounted underneath, so terminals keep running. The swap is a ~1000 ms easeInOutCubic camera move with a pull-back from the canvas and a high, wide dolly into the room (M413).
  - Each live agent (working, thinking, waiting for approval) gets a glossy primitive robot at its own desk, coloured by `colorOf(agentId)` (M412, M415).
  - A waiting agent walks to a meeting table that turns amber.
  - The nearest six robots get a frosted white glass card (title, badge, last four tool calls). Every robot gets a name pill.
- **The set (M416).** A high-key light studio: a pale slab with a glowing cyan trim, a black table, a whiteboard, stools, and an "Ask your team" pill. It no longer follows the app's dark theme.
- **M421–M427, "a live map of the work".**
  - You can Approve, Deny or Open from a robot's card.
  - Agents are grouped by task on tinted terraces. Files in play appear as tiles, with an amber conflict when two agents write one file.
  - The plan shows on the whiteboard. Sub-agents orbit their parent, and handoff arcs connect agents.
  - Cards follow the four density layers by distance.
  - There is a replay scrubber over the last hour and a "While you were away" camera tour.
  - Teammates' initials appear on the agent they are watching.
- **M428–M434.**
  - Per-agent facts: model, spend and cap, context %, branch, queue, hold.
  - Double-click or Enter opens the agent's panel on the canvas.
  - A flat no-WebGL fallback room.
  - "View in World" / "View in Orchestrate" cross-links.
  - Instanced desks, level of detail, and a minimap.
- **Known gaps the build logs record.**
  - The world's badge colours disagree with the canvas: WORKING is green and QUIET is red in the world, while green means idle/done on the canvas (M415).
  - The light studio breaks from the dark app.
  - Waiting robots leave their task to gather at a central table.
  - An errored agent leaves the room.
  - Six full cards crowd the wide shot.
  - "Fit room" sits off-centre.
  - There are no golden screenshots.

### The revamp in one line
**The World is the canvas, stood up.** It is a 3D lens on the same layout, not a separate place. Task regions become terraces at the same coordinates. Panels become desks (agents) or consoles (plain shells). The state colours, zoom tiers, attention queue and title-bar nav stay exactly the same in 2D and 3D.

### Principles
1. **One spatial truth.** The 2D canvas positions become floor coordinates (canvas px ÷ 100). Moving a task in either view moves it in both. `⌘⇧W` toggles 2D ↔ World, and the camera lands on the same spot in both directions.
2. **One colour system.** Cyan is working, amber needs you, green done, red failed, slate idle, the same as every 2D surface. The robot shells are neutral. Agent identity shows only as a small chest light, and state lives in the eyes, the antenna, the floor ring and the desk screen. This reverses M415's green-means-working.
3. **A dark night studio** that matches the app's Obsidian ink. The terrace trims are dim neutral, so only state glows. Amber is the only colour that casts a vertical beacon, visible from anywhere in the room.
4. **Agents stay at their task.** A waiting agent raises an arm and its beacon lights up. It does not walk to a central table, so where it stands still tells you which task it belongs to.
5. **Robots are teammates, consoles are sessions.** Chat agents can be replied to from the room. A shell prompt (for example a terraform apply) is answered only in its terminal. This keeps the existing rule that a stray Enter from across the room must never run a command.
6. **The same zoom tiers.** `⌘1` Work is close up, with the focus sheet. `⌘2` Plan is the room. `⌘3` Map is the near top-down floor plan. The density layers follow: pills at rest, an ask chip in context, the focus sheet as the inspector, and replay/log as deep detail. Only picked or waiting agents get more than a pill, which fixes the six-card clutter.

### World screens
| # | File | Screen | What it shows |
|---|---|---|---|
| 10 | `10-world-transition.png` | Canvas → World (550 / 1000 ms) | The 2D plan tilts back into the floor while terraces rise and robots pop up nearest-first. The cancel chip, the `2D | World` lens and a filmstrip (0 ms canvas → 1000 ms room) explain the move. Reduced motion uses a 120 ms cross-fade. |
| 11 | `11-world-main.png` | The World (Plan tier) | Five task terraces at their canvas positions. Robots and consoles show state rings, eyes and screens. Amber beacons rise from three waiting agents, and the failed Codex slumps with a red ring. Handoff arcs, file tiles, the plan whiteboard and orbiting sub-agents are visible. The bottom pill (`3 need you · Go ⌘J · Ask an agent ⌘L`) and the 2D minimap with the camera wedge are shared with the canvas. |
| 12 | `12-world-focus.png` | Focus and act | Picking Codex glides the camera in and turns on Follow. A breadcrumb shows `World › Ledger CSV export › Codex · Esc`. An inline ask chip has Approve `⌘Y`. A 400px focus sheet holds the diff, Approve/Deny/Full diff, what the agent is doing, facts (model, context, branch, spend vs cap), a reply composer, and **Open in Canvas `⌘↵`** / Sessions. |
| 13 | `13-world-attention.png` | Attention flight (`⌘J`) | After approving Codex (with Undo), `⌘J` flies a visible amber path to the next waiting agent. A queue strip shows `Needs you · 2 of 3` (done ✓ / current / next) with `⌘J` / `⌘⇧J`. The terraform shell's card says it must be answered in its terminal and offers Open in Canvas. |
| 14 | `14-world-overview.png` | Overview, camera and time | Map tier near top-down: the floor plan is the canvas layout. The panel lists the camera controls (orbit, pan, zoom to cursor, `⌘1/2/3`, `⌘0` fit, `F` follow, `⌘⇧W` back to 2D at the same spot). There is a replay scrubber with state-coloured event ticks (past rooms are read-only), "While you were away" with a 40 s tour, and a teammate (MK) watching an agent. |

### Ties back to 2D
- **Same layout.** Terraces are the canvas regions, and desks and consoles sit at their panels' positions.
- **Same chrome.** The `Canvas | Sessions | Review` nav, dock badge, attention pill, minimap, `⌘K` palette and `⌘J` queue all stay. The World is a lens inside Canvas, not a fourth tab.
- **Doors both ways.** Open in Canvas (`⌘↵`, or double-click a robot) lands the 2D camera on that panel with it selected. "View in World" from any panel or task does the reverse. Sessions rows offer "Show in World".
- **Fallback.** Without WebGL, the existing flat tile room keeps the same words and doors.

### How the World mockups were made
These are real WebGL renders: three.js 0.170 (`vendor/`) running in headless Chrome with SwiftShader, served over `http://localhost:8765`.
- `world.js` builds the scene: terraces, procedural robots, desks and consoles, beacons, arcs, a flight path and the floor texture.
- DOM overlays (pills, cards, HUD) are placed by projecting 3D anchors to screen space.
- Run `python3 s1N.py` to write each page, then `./wshot.sh <file>.html` to render it.
- `plantex.png` is the 2D plan used as the floor texture in the transition.
