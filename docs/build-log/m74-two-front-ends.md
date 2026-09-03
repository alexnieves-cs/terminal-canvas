# M74 — Same agent, two front-ends

**Branch:** `m74-two-front-ends`. **Spec:** `docs/superpowers/specs/2026-09-03-m74-two-front-ends-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m74-two-front-ends.md`. **Status:** finished 2026-09-03.

**Thesis sentence:** a terminal running `claude` and a chat panel are two front-ends on ONE
conversation, and a conversation moves between them — the strong version of backlog #8's
claim, and the one this run's brief called the strongest in Act I.

## Both directions work, and the measurement that says so

- **Terminal → chat.** The CLI's own transcript is the source. Measured on this machine's
  own 4,769-line session of this repository: the importer read 1,842 turns (961 user turns —
  three typed prompts and the rest tool results — and 881 assistant turns, merged from
  1,536 per-block records), skipped 121 meta records and no sidechain ones, hit no malformed
  line, and summed usage once per message id. `verify:panels front.1` drives the whole verb
  in the real renderer over the harness's fenced transcript store: the chat takes the
  terminal's rect and title, renders the tool row and the answer, reads `asleep`, and the
  terminal is gone; a live terminal is refused with `stop the terminal first — one front-end
  at a time` and nothing is minted.
- **Chat → terminal.** `claude --resume <id>` continues a conversation another process
  created: measured by resuming, headlessly, the session M71's hand run created
  (`231b45f5…`) and asking what word it had replied with — `pong`. `verify:panels front.2`
  drives the verb: a terminal spawns at the chat's rect with `--resume <its session id>`,
  `command: 'claude'`, the agent kind and the knobs; the pin EQUALS the resumed id
  (`resume-pin.1`), the chat is gone.
- **What stays manual.** The TUI's `--resume` of a session a headless process created, and
  the reverse, in the running app on a real keyboard. Both halves were measured here in
  headless mode; the interactive CLI takes the same flag.

## What landed

- `shared/transcript.ts`: a user record's STRING content is one text block (the CLI's file
  shape; the stream never produces it).
- `main/claude-transcript-import.ts`: pure over the file's text — sidechain and meta records
  skipped and counted, assistant records merged by message id with usage counted once,
  order kept, a garbage line costing itself; `meta.turns` = user text turns; no cost (the file
  carries none).
- `main/agent-args.ts`: no `--session-id` beside a `--resume`. `main/pty-manager.ts`: a
  resumed spec adopts the resumed id as its pin (guarded: `spec.args` may be absent — the
  harness omits it deliberately, and the first cut threw there and read as a hang).
- `agent:import` in the contract, both diagrams, preload (`agentSession.importSession`),
  `AgentHandlers` with its inert refusal, `main/index.ts` (the three named refusals: not
  pinned, live, no file yet). `verify:ipc` at 75.
- The renderer: `InspectorModel.frontEnd` (`open-as-chat` on a terminal, `open-in-terminal`
  on a chat, each with its reason; absent on every other kind); the action bar's button;
  `KindTerminal`; a chrome verb on the terminal (shown only for a claude session with no
  live process) and on the chat (disabled by name while answering or empty); palette rows
  `panel.open-as-chat` / `panel.open-in-terminal` with five named reasons; `PanelRow.busy`
  and `.turns`; `openAsChat` (main asked first; a refusal shown in the palette's line;
  the terminal leaves through the close path; the chat takes its rect, title and knobs) and
  `openInTerminal` (the chat leaves with its file; a terminal spawns focused at its rect)
  in `Canvas.tsx`, with `__m74OpenAsChat` / `__m74OpenInTerminal` hooks through refs.
- Checks: `verify:agent-session import.1–.3`, `args.5` (62/62); `verify:pty-manager
  resume-pin.1` (63/63); `verify:rail front.1` (145/145); `verify:palette front.1`
  (118/118); `verify:panels front.1–.2` (272/272). Documents: README row and diagram;
  CLAUDE.md architecture and diagram; suite counts; three `docs/load-bearing.md` entries;
  five dead-end audit rows.

## Red first

- `import.1–.3`, `args.5`: red at module scope (importer absent); `args.5` then
  fault-injected alone (the `!resumes` clause removed → red) since the module-scope red is
  not evidence for one check.
- `resume-pin.1`: written before the adopt block; passes only with it (the pin otherwise a
  fresh uuid).
- `verify:rail front.1`, `verify:palette front.1`: red on no `frontEnd` / no rows.
- `verify:panels`: the first run hung at module scope — `spec.args.indexOf` on a harness
  spawn with no `args` (the harness omits it on purpose, as `agentArgs`'s comment records);
  guarded, then 272/272. After the verifier's additions `front.1` went red again with the
  imported chat's composer disabled: the claude-kind preset the chat block had seeded did
  not survive into this block (the renderer's rows listed every built-in unavailable and no
  `chat-claude`), so `claudeAvailable` was false. The block now seeds its own preset before
  its reload, and the check prints the preset rows and the composer's state when it fails,
  so the next such red diagnoses itself. 272/272 again.

## Decisions taken while building, and why

- **One front-end at a time, by REMOVING the panel the conversation came from.** Two
  processes on one session id would fork the CLI's transcript silently. Removing rather
  than keeping an "asleep" twin is what makes the rule structural: there is never a second
  panel on the id to send from.
- **Main is asked first on `Open as chat`.** The three refusals are main's facts (the pin,
  the live process, the file); the renderer mints nothing until main has written the turns.
- **The pin follows the resume.** See the load-bearing entry; the alternative (a fresh pin
  beside `--resume`) is a CLI refusal and a cost readout of the wrong file.
- **The chat's app-side file is dropped on `Open in terminal`.** The CLI's transcript is
  the durable one; `Open as chat` re-imports. Keeping a stale copy would render an older
  conversation than the terminal then held.
- **`meta.costUsd` is absent on an import.** The file carries token usage per message but
  no dollar figure; the inspector prices the tokens with the same table as every chat.
- **Chrome verb on the terminal only when it can apply.** A control that cannot work is the
  rule's other failure; the palette row and the action bar carry the named refusal instead.

## What this milestone does not do, stated

- Import while the terminal is live (by design). Copy a conversation (by design).
- The `isSidechain` subagent turns are not rendered anywhere in the chat (M15's subagent
  nodes remain the terminal's surface; a chat panel's subagents are a later question).
- A move is two undo steps (the verifier's finding, declined above): `Cmd+Z` removes the
  panel the move created, a second `Cmd+Z` restores the one it came from.

## The visual loop

`npm run shot`: 26 scenes, none failed (after a first run that started from the wrong
directory and did nothing — the log said so). My own look: the chat's chrome carries its
verb after the pill; the dormant `tests` card, marked a claude session in the fixture,
shows NO verb, because M63's card tier hides every chrome control — its verb is the palette
row and the action bar, and the chrome verb appears on the live and exited tiers.

### The critic (both briefs and four PNGs, nothing else)

Thirteen findings. Accepted and fixed:

1. **The `>_` glyph reused as a verb** (finding 1, the critic's first of three): the rail
   uses that glyph as a passive kind mark, so a button made of it says nothing. Both chrome
   verbs are now labelled words — `to terminal` on a chat, `to chat` on a terminal.
2. **A control inside the state half of the row** (finding 3): the verb now sits AFTER the
   pill, the terminal row's own `title · pill · controls` shape.
3. **`Interrupt` indistinguishable when disabled** (finding 8, M73's finding 7 again): a
   disabled verb is dashed as well as dimmer.
4. **The tool row cutting the file name** (finding 10's chat half): the argument wraps
   instead of ellipsising, so the name principle 3 protects survives.
5. **The composer's chat-app placeholder** (finding 12): `your next message — ⌘↩ sends`.
6. **The scene intent said `not started`** (finding 5): it says `asleep`, which M73's
   amendment to principle 10 made the word for a restored conversation.

Declined, with the reason:

- **The `tests` control not visible; the minimap over the card** (finding 2): the dormant
  card tier hides every chrome control by M63's design, so there is no control to show; the
  verb is the palette row and the action bar there. The minimap occluding what is under it
  was declined in M69 (an overlay, like the HUD).
- **The chat keeps a kind glyph the terminal lacks** (finding 4): M73's critic asked for the
  glyph in place of a state dot, and principle 10 says the frame carries the nature — a chat
  is not a terminal and should not pretend to be one. The STATE half of principle 11 is what
  the two front-ends share, and the critic records that it passes.
- **`Open as chat` disabled with no visible reason** (finding 7): the action bar's reason is
  its hover title, the M68 convention every disabled action there follows; the palette row
  shows the same sentence inline.
- **The bare `1` in a note's chrome, the rail truncating `claude — api (2)`, bodies leading
  with the temp path, `click to start`, icon-only refresh** (findings 6, 9, 10's other half,
  11, 13): pre-existing, not this milestone's; the rail width and the identity line are on
  M91's list, `click to start` was declined in M66–M69 with reasons.

### The verifier (the spec and the diff, nothing else)

Verdict: delivered with gaps. Accepted and fixed:

- **`openInTerminal` enforced no precondition itself** — only its three doors did. The verb
  now refuses BY NAME a chat with a turn in flight or a permission waiting, and an empty
  one; `busy` everywhere (the row, the model, the chrome) now includes a pending permission.
- **The palette gated on any agent kind** where main and the inspector require claude:
  `PanelRow.claude`, and a Codex terminal's row is refused by name.
- **Imported turns stamped `at: 0`**: the file's own timestamps are read.
- **`front.2` did not cover the knobs**: the fixture terminal carries `effort: high` and the
  round trip is asserted to keep it.
- **"The first send says `--resume`" was pinned by no check**: the harness's manager now
  answers `transcriptExists` from the fenced store, and `front.1` sends into the imported
  chat and reads `--resume <the pinned id>` off the fake runner's argv, then `idle`.
- **Undoing `Open in terminal` restored an emptied chat**: the move keeps the app-side file
  (`drop: false`), so a restored chat renders; the CLI's transcript is authoritative anyway.

Declined, with the reason:

- **The move is two undo steps** (defect 2): making it one would need the source panel's
  session disposed outside the ordinary close path — a sixth `registry.dispose` call site,
  which `verify:panels` 94 counts and this repository has held at five since M8c. Recorded
  as a limit in the spec's "does not do" list: `Cmd+Z` after a move first removes the new
  panel, then restores the old one.
- **`resume-pin.1`'s argv half is vacuous** without a spawned-argv recorder in that harness
  (defect noted): the pin half is the check's subject; the argv rule is `args.5`'s, which
  was fault-injected.
- The refusal sentence on a chat for `Open as chat` (defect 6): cosmetic; the row names the
  kind that can.

## Verification

- `npm run verify`, alone, the verify tmux server killed first, after every critic and
  verifier fix: exit 0, every suite green — `verify:agent-session` 62/62, `verify:pty-manager`
  63/63, `verify:rail` 145/145, `verify:palette` 118/118, `verify:ipc` 1/1 at 75 channels,
  `verify:panels` 272/272.
- `npm run shot`: 26 scenes, none failed; `chat.png` looked at after the fixes — `● asleep ·
  to terminal` in the chrome, dashed disabled verbs, the tool row's path wrapped with its
  file name intact.
- By hand, once: the importer over this machine's own 4,769-line transcript (1,842 turns,
  121 meta records skipped, none malformed) and a headless `claude -p --resume` of the
  session M71's hand run created (`pong`). The interactive round trip stays manual-only.
- `npm run typecheck`: clean, both projects.
