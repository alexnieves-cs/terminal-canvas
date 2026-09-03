# M73 — The chat panel

**Status:** design, 2026-09-03. **Branch:** `m73-chat-panel`. **Kind:** feature + surface.
**Briefs built against:** 1.x brief principles 1 (one vocabulary), 3 (identity leads), 6
(every control says what it is), 7 (three states), 8 (the chrome does not compete with the
well); 2.0 brief principles 10 (three natures), 11 (the same vocabulary whoever produced it),
12 (the transcript is a well).
**Thesis sentence:** the first node on the canvas that is a conversation and not a terminal —
the sixth arm of the `Panel` union over M71's runtime — which is the sentence the run exists
to make true.

## What this milestone is for

M71 built a main-process conversation with the installed `claude` and nothing can see it.
M73 puts it on the canvas: a panel kind whose body is a transcript, whose composer sends a
turn, whose interrupt interrupts, whose state reads in the one vocabulary every other surface
uses, and whose transcript is a FILE this app writes — so a restored panel renders yesterday's
turns with no process and the first send continues the same conversation.

## What it must not break

- **`LIVE_BUDGET` and `registry.ensure` never see it.** A chat panel is plain DOM, no WebGL
  context, no PTY. `isTerminalPanel` gains a sixth clause and `verify:viewport 90b/92` are
  restated for six kinds; `Canvas.tsx`'s partition keeps it structural. A `pty.kill` is
  never sent for a chat id (the 103/110/111 shape, `verify:panels chat.4`).
- **`registry.version()` carries nothing new.** Chat state lives in its own module-level
  store, subscribed per panel id, snapshot objects cached, cleared at every panel-removing
  site — the rule every store since M12 obeys.
- **Absent / malformed / unknown on disk.** `kind: 'chat'` with a `chat` record; a
  malformed record drops the panel with a warning; an absent optional field stays absent
  through `layout-adapt.ts` and the palette's copy sites (`usePaletteActions` rename
  rebuilds a panel field-by-field — the chat arm is added there, or rename silently strips
  the record).
- **Two lifetimes, still.** Main owns the session (the process); the renderer owns the
  panel (the rect). Closing the panel disposes the session; the session is never disposed
  because a component unmounted.
- **The CSP.** No `fetch`, no remote asset; every byte comes over the bridge.

## Design

### The data

- `shared/chat-panel.ts`: `ChatSource { cwd: string; sessionId: string; agentOptions?:
  AgentOptions }`; `parseChatSource(raw, id, warnings)` lives beside its siblings in
  `layout-schema.ts` (amended: it reuses `parseAgentOptions`, which is private there). `sessionId` is the CLI session
  UUID, minted by the RENDERER at panel creation (`crypto.randomUUID`, available there) so
  the panel record is complete before any invoke resolves; the manager pins it. Absent
  `agentOptions` stays absent.
- `renderer/panels/panels.ts`: `ChatPanel extends PanelBase { kind: 'chat'; chat: ChatSource
  }`, `isChatPanel`, `isTerminalPanel` extended, `makeChatPanel(id, centre, z, source)`
  (the contract every constructor obeys: exact centring, the source copied not shared, no
  `panelId` stamped into it).
- `shared/layout-schema.ts`: `PersistedChatPanel { kind: 'chat'; chat: ChatSource }`, a
  `parsePanel` arm, `layout-adapt.ts` both directions.
- `panel-state.ts`: `StateKind` gains `chat`; `StateInput` gains an optional `chat: {
  status: AgentSessionStatus; pending: number; exitCode?: number | null }`. The chat arm,
  tested in this order: a pending permission is `needs you` (amber) whatever the process is
  doing; `streaming` is `working`; `starting` is `starting`; `ready` is `idle`; `exited` is
  `exited N`; `not-started`/`disposed`/absent is `not started`. No new word, no new tone.

### The runtime's second half

- `AgentSessionSpec` gains `sessionId?: string` (a fresh id to pin, distinct from `resume`).
  Whether the first spawn says `--session-id` or `--resume` is decided by an injected
  `transcriptExists(sessionId)` (the CLI's own file under `~/.claude/projects`, found by
  M17's `resolveTranscript`) — so a restored panel that has had a turn resumes, one that
  never did pins, and nothing about it is persisted or guessed. `verify:agent-session
  session.exists` drives both arms.
- `main/agent-transcript-log.ts`: one append-only file per PANEL id under
  `userData/agent-transcripts/`, written from the manager's events by `main/index.ts`: a
  `turn` line per `turn` event (a merged turn is re-written whole; the reader keeps the
  last line per turn id) and a `meta` line per `result` (usage, cost, turns). `read(id)`
  returns turns in order and the last meta; `drop(id)` removes the file. Append stream, not
  `layout-store.ts`'s rename — the scrollback log's reason. Dropped on an explicit close,
  never at quit.
- IPC (contract first, both diagrams): invokes `agent:create` (spec → snapshot, or a
  refusal naming a missing directory or an absent CLI), `agent:send`, `agent:interrupt`,
  `agent:dispose` (`{ id, drop }`), `agent:answer`, `agent:list`, `agent:transcript`
  (`{ turns, snapshot }`); one send `agent:event`. `registerIpcHandlers` takes a trailing
  `agents` collaborator with an inert default that refuses by name (`the agent runtime is
  not available`), the `export` precedent.
- The event fan-out is main's subscription, batched already by the manager; the renderer
  never polls.

### The renderer

- `chat/chat-store.ts` — per-panel `{ snapshot, turns, live }`, `subscribe(id)`, cached
  snapshots, `applyEvent`, `seed(id, turns, snapshot)`, `clear(id)`. `live` is the block(s)
  of the message in flight built from `block-start` and `block-delta`; when the `turn` for
  that message arrives, live blocks with an index below the stored turn's block count are
  dropped, so a token never renders twice.
- `chat/chat-model.ts` — pure: turns plus live → rows (`user`, `assistant-text`,
  `thinking`, `tool` with its result folded under it by `toolUseId`, `unknown` with its
  kind, `live-text`, `live-tool`), the state input, the composer's enabled arms and each
  disabled reason (`the agent is still answering — interrupt it, or wait`; `claude was not
  found on the login PATH`). `verify:rail` checks it.
- `chat/useChatSessions.ts` — on mount and whenever the panel list changes: `agent:create`
  once per chat panel id (idempotent in main; a renderer reload finds the session still
  there) and `agent:transcript` once to seed the store; the `agent:event` subscription
  routed into the store. Disposal is EXPLICIT at the panel-removing sites (close, undo/redo,
  reset, workspace delete) through one `disposeChat(id)`, never by diffing the visible
  list — a workspace switch changes the list and must not kill a conversation, exactly as
  the registry keeps a switched-away terminal alive.
- `chat/ChatNode.tsx` through `PanelFrame`: title (the user's title, else `chat ·
  <directory basename>`), the pill from `panelState`, a dim turn count in the chrome; the
  body per principle 12 — no bubbles, role in the caps margin, assistant text in mono at
  `--t-md`, tool rows collapsed with a control that says `show result`, thinking dim and
  collapsed; the composer pinned at the bottom: a mono textarea, `Send` (⌘↩ too) and
  `Interrupt`, each labelled, each disabled with its reason; a pending permission renders
  the question inline with `Allow`/`Deny` (M76 puts it on the other surfaces). The
  transcript auto-scrolls to the newest row unless the user has scrolled up. Cmd+C/Cmd+V
  inside the composer follow the fourth-text-surface rule the Jira draft records: the
  composer subscribes to `edit:copy`/`edit:paste` itself, and `Cmd+Z` over it is the known
  limit, restated in the spec, not fixed.
- Rail, inspector, icons, frame: the kind glyph (`…` in a line), `KIND_WORD.chat = 'chat'`,
  the rail label, the inspector's `chat` model with the usage from the snapshot (four
  classes and the CLI's own dollar figure shown as the cost, labelled `reported by claude`),
  the Detail tab's `directory` and `session` fields.
- Starting one: the palette row `New chat…` (`panel.new-chat`, beside `panel.new-note`, disabled by name when `claude` is
  absent: `REASON_NO_CLAUDE`), the launcher's `> chat with claude` line, and the spawn
  sheet's `what` gaining `chat` (directory, title, mode/effort/model apply; the sheet
  resolves it renderer-side and `agent:create` refuses a missing directory by name). Every
  verb three ways.
- Closing one: the frame's armed close (a chat with a process in flight arms like a
  running terminal); the palette's close row; disposal through `disposeChat`.

### The far view and the minimap

A chat panel's summary tier is `edge · title · state word` like a terminal's, and its block
tier a block in its state tone — because it is a process node (principle 10), not a
document. The minimap reads the same state through the store.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A chat panel landing in tiering with no spec | `verify:viewport 92` (six kinds in one read; 90b stays the historical two-kind check) |
| The chat record lost through a copy site | `verify:layout chat.1–.3` (parse, round trip, rename copy) |
| A restored panel rendering nothing | `verify:panels chat.3` (restore reads the file) |
| Close sending `pty.kill` for a chat id | `verify:panels chat.4` |
| A token rendered twice (live and stored) | `verify:rail chat-model.2` |
| The composer enabled during a turn, or with no CLI | `verify:rail chat-model.3`, `verify:palette chat.1` |
| The first spawn saying `--resume` for a never-run session | `verify:agent-session session.exists` |
| The transcript file losing a merged turn | `verify:agent-session log.1–.3` |
| A chat panel invisible to the state vocabulary | `verify:rail state.chat` |

## What this milestone deliberately does not ship

- The composer's references, drops, slash commands and placeholders (M75).
- Approvals on the card, popover, palette and notification (M76); M73 answers a pending
  request inline only.
- `Open as chat` / `Open in terminal` (M74).
- A Codex backend (M90).
- A chat panel's review baseline (M77).

## Manual-only, added

- The chat panel against the real CLI in the running app: a send that streams, an
  interrupt, a permission answered inline, a relaunch that renders the file and resumes.
  `verify:panels` drives the real renderer over a FAKE runner replaying M71's fixtures.
