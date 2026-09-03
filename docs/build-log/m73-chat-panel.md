# M73 — The chat panel

**Branch:** `m73-chat-panel`. **Spec:** `docs/superpowers/specs/2026-09-03-m73-chat-panel-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m73-chat-panel.md`. **Status:** finished 2026-09-03.

**Thesis sentence:** the first node on the canvas that is a conversation and not a terminal —
the sentence "every node on this canvas is a terminal" is false from this milestone on.

## What landed

- **The data.** `shared/chat-panel.ts` (`ChatSource`: cwd, the CLI session id the RENDERER
  mints, optional knobs); the `chat` arms in `layout-schema.ts` (`parseChatSource` reusing
  `parseAgentOptions`, so an unknown knob costs the knob and never the panel),
  `layout-adapt.ts` (one `copyChatSource` for both directions), `panels.ts` (`ChatPanel`,
  `isChatPanel`, `isTerminalPanel`'s sixth clause, `makeChatPanel`), `panel-state.ts`
  (`StateKind` `chat`, `ChatStateInput`, the chat arm — pending → `needs you`, streaming →
  `working`, `starting`, ready → `idle`, `exited N` / `exited`, else `not started`; no new
  word, no new tone).
- **The runtime's second half.** `AgentSessionSpec.sessionId` (a fresh id to pin, distinct
  from `resume`), `AgentSessionDeps.transcriptExists` (the first spawn pins or resumes by
  the CLI's own transcript, decided at spawn, never persisted), `main/agent-transcript-log.ts`
  (an append stream per panel; the last line per turn id wins in first-seen order; a torn
  tail costs itself), a `dequeued` event. The public runtime types moved to
  `shared/agent-session.ts`.
- **IPC.** Seven `agent:*` invokes and the `agent:event` send in the contract and both
  diagrams; preload `window.canvas.agentSession` (the bridge's existing `agent` section is
  agent STATE — kept; the two are different facts); `ipc.ts`'s trailing
  `agents: AgentHandlers` with `INERT_AGENTS`; `main/index.ts` builds the handlers (create
  refuses BY NAME: no such directory, claude not found), the log under
  `userData/agent-transcripts`, and one subscription that writes the log and forwards every
  event. `verify:ipc` expects 74.
- **The renderer.** `chat/chat-model.ts` (rows; the live-block merge so a token never
  renders twice; the composer's arms and their reasons; the state input), `chat/chat-store.ts`
  (per-id, cached snapshots, `applyChatEvent`), `chat/useChatSessions.ts`
  (`ensureChatSession` once per id; `disposeChat` explicit), `chat/ChatNode.tsx` through
  `PanelFrame` — which gained a `state` prop so a process kind that is not a terminal paints
  its state on the dot, the pill, the far tiers and the edge. Copy sites threaded:
  `canvas-constants`, `panel-name`, `rail-rows`, `inspector-fields` (`KIND_NOUN`, a chat arm
  with a trailing `ChatInspectorInput`), `icons` (`KindChat`), `PanelFrame` (`KIND_WORD`),
  `commands.ts` (`PanelRow.kind`, the `New chat…` row, `REASON_NO_CLAUDE`,
  `claudeAvailable(presets)`), `usePaletteActions` (the rename arm, `beginNewChat`, the
  sheet's chat submit, workspace delete disposing every doomed id's chat), `Canvas.tsx` (the
  render arm, `useChatSessions`, `beginNewChat`, disposal beside the sessionless clears at
  close/undo/reset, the Launcher's props, the `__m73Chat` hook through a ref), `Launcher.tsx`
  (`Chat with claude…`), `SpawnSheet.tsx`/`spawn-sheet.ts` (`{ kind: 'chat' }`, `CHAT_WHAT_ID`,
  the how fields apply), `RailPanelRow` (subscribes to its chat mirror), `useRailModels`
  (the inspector's chat input), the styles.
- **The harness.** `verify:panels chat.1–.5` over a REAL `AgentSessionManager` and a FAKE
  runner replaying M71's `turn.jsonl` in two chunks; `npm run shot` gained a `chat` scene and
  a chat panel with a seeded transcript in the `kinds` fixture.
- **Documents.** README row and diagram; CLAUDE.md architecture note, diagram and suite
  counts; `docs/verify-suites.md`; four `docs/load-bearing.md` entries; the dead-end audit's
  `REASON_NO_CLAUDE` row; this log.

## Red first

- `verify:layout chat.1–.3`: red on `unrecognised kind "chat"` (chat.3 guarded with a
  try/catch so the adapter's throw printed RED by name rather than aborting the suite).
- `verify:viewport 92` (widened to six) and `chat.1`: red on no constructor.
- `verify:agent-session session.exists`, `log.1–.3`: red at module scope (log module absent),
  then per check as the modules landed — 58/58.
- `verify:rail`: red at module scope (chat-model absent), then `state.chat` red on a signal
  exit spelled `exited ?` (fixed: `exited`) and `state.2` red on the inspector's model field
  placeholder `not started` (a state word outside the vocabulary module — fixed: `none yet`).
  143/143.
- `verify:palette chat.1`: red on no row; 117/117.
- `verify:panels`: the first run threw at module scope (a missing comma in the kit's
  destructure — the hang the harness doc warns about, found by reading the log's stack);
  then 266/269 with the composer disabled (`claudeAvailable` false in a harness with no
  `claude` on its PATH — the check now seeds a claude-kind preset over `/bin/sh` through the
  real availability path); then 267/269 with the restored turn count reading `0 turns` (the
  fresh session's zero won over the file — the chrome now counts turns from the transcript);
  then 268/269 with the rail row absent (the dock was on another pane — the check selects
  Panels through the real dock button); then 269/269, and 270/270 with `chat.5` after the verifier.

## The visual loop

`npm run shot`: 26 scenes, none failed. My own look: the chat panel reads as a transcript in
the terminal's frame family — caps role labels, the collapsed `Read` tool row with `show
result`, the answer in mono with no bubble, `1 turn · not started` in the chrome, the
composer pinned with `Send` and `Interrupt` labelled. One defect found by eye: in the `kinds`
scene the chat panel overflowed the viewport's right edge; the fixture row was tightened
(Jira 300 wide, chat 340 at x 770) and the scene re-shot with all seven kinds in view.

### The critic (both briefs and four PNGs, nothing else)

Ten findings. Accepted, and fixed in this milestone:

1. **No state edge on the chat panel at any zoom** (findings 1 and 10). The panel with a
   visible transcript and no process read `not started` (tone `none`, a plain hairline).
   Accepted with a different remedy than the critic's: a conversation with turns and no
   process is `asleep` — the restored terminal's word for the same fact, dashed grey, and it
   resumes on your gesture (a send) — and only a never-used chat is `not started`. The 2.0
   brief's principle 10 is amended, dated, in place: the pill carries ONE fact, the state
   word; the turn count is the inspector's. `verify:rail state.chat` gained the history arms.
2. **The state dot in the kind-glyph slot, no chat glyph** (finding 2). Accepted: the frame
   shows the kind glyph on the left like every other kind; the state rides the edge, the far
   tiers and the terminal's own pill (`badge pf__word`, byte for byte), on the right.
3. **The pill reading two facts** (finding 3). Accepted: the turn count left the chrome (it
   is `data-chat-turns` on the root and the inspector's Detail).
4. **The tool row's path truncated from the right** (finding 4). Accepted: `toolArgument`
   shortens a path from the LEFT through `shortPath` (`…/repo/src/server.ts`), a command from
   the right; the `show result` toggle sits on the same line. `verify:rail chat-model.5`.
5. **The composer boxed with a resize grip** (finding 5). Accepted: no box, no grip; the
   hairline above is the boundary.
6. **`Interrupt` indistinguishable from enabled** (finding 7). Accepted: a disabled verb loses
   its fill and its strong border as well as its ink.

Declined, with the reason:

- **The user turn not visible in the scene** (finding 6): the transcript is scrolled to the
  newest row by design (principle 10's "always scrolled to the newest turn unless the user
  scrolled away"); the scene's answer is long enough to push the user turn above the fold.
- **The rail's chat row has no dot and no `start` verb** (finding 8): M63 decided the rail's
  left column is the kind glyph for every non-terminal kind and the dot is a terminal's
  (`docs/build-log/m63-state-vocabulary.md`); the row's WORD carries the tone, and it now
  reads `asleep`/`idle`/`working` like a terminal's. A `start` verb for a chat would have to
  be a send, and the rail has no composer; the row frames the panel, whose composer is the
  start gesture.
- **The selected rail row truncating `claude — api (2)`** (finding 9): the 260px rail's
  truncation is pre-existing and is the first item on M91's small-things list (a wider rail
  is a frame decision); not this milestone's.

### The verifier (the spec and the diff, nothing else)

Verdict: delivered with gaps. Accepted and fixed:

- **The composer did not subscribe to `edit:copy`/`edit:paste`** — the spec's own rule, and
  the first cut argued against it on exactly the failure the rule guards (the menu's ⌘V
  arrives as IPC, the canvas routes it to the focused terminal, a chat id has none, the
  textarea watches nothing happen). It now serves both while it holds DOM focus, Palette.tsx's
  shape; `verify:panels chat.5` sends `edit:paste` with the composer focused.
- **The minimap did not read chat state through the store**: its block now subscribes to the
  chat mirror as the rail row does.
- **A `block-start` with no message in flight synthesised an empty message id** that could
  never be deduped: dropped instead.
- **`ensureChatSession`'s `.catch` could re-seed a disposed id**: guarded like its resolve arms.
- **`chatIds()` was a dead export** inviting the list-diff the spec forbids: removed.
- **The log's reader admitted a block with no `type`** (rendering "a undefined block"):
  filtered.
- **Undo/redo dropped the file** where the spec names only an explicit close: the history
  path now disposes with `drop: false`, so a redone panel renders its transcript; close,
  reset and workspace delete still drop.
- **The inspector ignored the file's `meta`** for a restored panel: it reads the recorded
  usage, cost and turn count until this launch's session has priced a turn.
- The stale "67" in `verify-ipc-surface.cjs`'s comment.

Declined or amended in the spec:

- **`verify:viewport 90b` not restated**: 92 is the six-kind read (every kind in one
  assertion); 90b stays the historical two-kind check. The spec now says so.
- **`parseChatSource` in `layout-schema.ts` rather than `shared/chat-panel.ts`**: it reuses
  `parseAgentOptions`, private to the schema module. The spec is amended.
- **The palette row id `panel.new-chat`** (the spec said `chat.new`): it sits beside
  `panel.new-note` and takes its family's prefix. The spec is amended.
- **Main's absent-CLI refusal unchecked by the harness**: the harness stands in for
  `main/index.ts` and cannot drive that line; the renderer's gate (`claudeAvailable`) is
  `verify:palette chat.1`, and the two gates derive from the same probe (`whichFromEnv` on
  the login PATH). Recorded, not pinned.
- `block.id || id` and the rename arm's shared `p.chat` reference: the toolbox arm's own
  shape; nothing mutates a record after the mint.

## Decisions taken while building, and why

- **The CLI session id is minted by the renderer** so the panel record is complete before
  any invoke resolves; `agent:create` is asked FIRST so a refusal mints no panel.
- **Disposal is explicit**, never a diff of the visible list: a workspace switch changes the
  list and must not kill a conversation. `disposeChat` sits beside every `registry.dispose`
  and is not one; `verify:panels` 94's count is unchanged.
- **The turn count is counted from the transcript**, not the snapshot: a restored panel's
  fresh session says zero while the file holds yesterday's, and a resumed session would
  start at one again.
- **The rail row subscribes to its own chat mirror** (the agent-state pattern) so a delta
  re-renders one row and never rides the rail signature.
- **The inspector prices chat tokens with the terminal's table** (principle 11) and shows the
  CLI's own dollar figure as a Detail field labelled as its claim.
- **The bridge section is `agentSession`**, because `agent` already meant agent STATE.
- **The composer refuses a send mid-turn by name** although the runtime would queue it: a
  composer that accepts input while the answer streams is the one that sends a half-typed
  line. The queue stays for the runtime's other callers.
- **`--bare` is still not passed** (M71's decision): same agent, same hooks, same skills.

## What this milestone does not do, stated

- The composer's references, drops, slash commands and placeholders (M75); approvals on the
  popover, palette and notification (M76) — M73 answers a permission inline only; `Open as
  chat` (M74); a chat panel's review baseline (M77); a Codex backend (M90).
- The inspector's Cost section for a RESTORED chat panel reads from the live snapshot only,
  so it shows nothing until the first turn of the launch; the file's `meta` line carries the
  last figures and is not yet read there. Recorded for M74/M77 to take.
- Cmd+Z over the composer reaches `applyHistory`, the fourth-text-surface limit CLAUDE.md
  records for the Jira draft, now the fifth surface. Not fixed, for the reasons recorded
  there.
- Against the real CLI in the running app: not exercised in `npm run verify`; on the
  manual-only list.

## Verification

- `npm run verify`, alone, the verify tmux server killed first, after every critic and
  verifier fix: exit 0, every suite green — `verify:agent-session` 58/58, `verify:layout`
  185/185, `verify:viewport` 124/124, `verify:rail` 144/144, `verify:palette` 117/117,
  `verify:ipc` 1/1 at 74 channels, `verify:panels` 270/270. The first chain run stopped at
  `verify:styles` 6 on a literal `padding-top: 2px` in the chat's role label (now `--sp-1`);
  rerun from the start.
- `npm run shot`: 26 scenes, none failed; `chat.png` and `kinds.png` looked at after the
  fixes — the dashed asleep edge, the kind glyph, the terminal's pill, the left-shortened
  tool path on one line, the plain composer.
- `npm run typecheck`: clean, both projects.
