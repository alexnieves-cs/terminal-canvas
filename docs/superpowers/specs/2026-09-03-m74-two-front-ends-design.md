# M74 — Same agent, two front-ends

**Status:** design, 2026-09-03. **Branch:** `m74-two-front-ends`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 6 (every control says what it is), 7 (three states),
9 (a disabled row names the fix); 2.0 principles 10 (natures), 11 (the same vocabulary
whoever produced it). **Thesis sentence:** the strong claim — a terminal running `claude` and
a chat panel are two front-ends on ONE conversation, and a conversation can move between them.

## What this milestone is for

M73 made a conversation a node. M74 makes it the SAME conversation the terminal has: a
terminal panel pinned to a Claude session (M17's `--session-id`) can be opened as a chat, its
turns so far rendered from the CLI's own transcript and its next turn sent to the same
session; and a chat panel can be opened in a terminal, with `claude --resume <id>` picking
up where the composer left off. If either direction turns out impossible, this document says
which and why rather than faking it.

## The facts measured before designing

- **The CLI's transcript** (`~/.claude/projects/<slug>/<uuid>.jsonl`, measured on a 4,769-line
  session of this repository's own run, 2026-09-03): `assistant` records carry the SAME
  `message` shape the stream does (one per content block, merged by `message.id`, `usage`
  repeated); `user` records carry `message.content` as either a block list (`text`,
  `tool_result`) or a bare STRING (a typed prompt, or a meta record such as an image note
  flagged `isMeta: true`); `isSidechain: true` marks a subagent's records, which are not
  this conversation's turns; every other type (`attachment`, `last-prompt`, `atis-latch`,
  `ai-title`, `bridge-session`, `queue-operation`, `file-history-*`, `system`) is ignored.
  `shared/transcript.ts`'s `parseStreamLine` already reads the two record types; the string
  form of user content is the one addition.
- **`--resume <id>`** continues a conversation from that file in a fresh process (M71).
  A terminal and a headless process on the same id at the same time would both append to one
  file: never allowed here — one front-end at a time.
- **A terminal's pinned session id** is main's (`layoutStore.session(panelId)`, set by
  `PtyManager.create` for an agent-kind spec); the renderer never sees it, and a login-shell
  panel where `claude` was typed by hand has none (M17's un-pinned rule).

## Design

### Terminal → chat: `Open as chat`

- **Precondition, named.** The terminal's process is not live (`ptyManager` does not list
  the id): exited, or restored dormant. A live terminal's verb is disabled with `stop the
  terminal first — one front-end at a time`. A panel with no pinned session is refused with
  `that terminal was not started as a claude session` (a hand-typed `claude` cannot be
  followed; M17's rule). A session the CLI has not written yet is refused with `claude has
  not written a transcript for that session yet`.
- **The import.** `agent:import { fromPanelId, toPanelId }` (main): the pinned id, the live
  check, `resolveTranscript`, then `main/claude-transcript-import.ts` — pure over lines:
  skip sidechain and meta records, string content → a text block, merge assistant records
  by message id, keep order — writes the turns into the app's transcript log under the NEW
  panel id with a `meta` line (usage summed from the assistant records' per-message usage,
  counted once per message id; turns = user text turns; no cost — the CLI reports none in
  the file), and answers `{ kind: 'imported', sessionId, turns }` or a refusal by name.
- **The renderer.** Asks `agent:import` FIRST (a refusal is shown by name, nothing minted),
  then mints a chat panel at the terminal's rect with that `sessionId`, then removes the
  terminal panel through the ordinary close path (its session is dead; the close sends the
  kill an exited panel gets). `ensureChatSession` then creates the session with that id and
  `transcriptExists` answers true: the first send says `--resume`.
- **Three ways.** A `chat` glyph button in the terminal's chrome (shown only when the verb
  can apply — never a control that cannot work), the context pane's action bar, the palette
  row `Open as chat` (disabled by name otherwise).

### Chat → terminal: `Open in terminal`

- **Precondition, named.** The chat has no turn in flight (`interrupt it first`). A chat with
  no turns yet has nothing to move: refused with `send a message first`.
- **The move.** The chat's session is disposed WITH its file (the CLI's transcript is the
  durable one; reopening as chat re-imports it), the panel removed, and a terminal panel
  spawned at the chat's rect through the ordinary create path with `command: 'claude'`,
  `args: ['--resume', sessionId]`, `agent: 'claude-code'`, the chat's knobs, its title, and
  focus — so it is live before the hand leaves the keyboard.
- **The pin follows the resume.** `agentArgs` skips `--session-id` when the args already
  carry `--resume` (a resume names the session; pinning a second id beside it is a
  contradiction the CLI would refuse), and `PtyManager.create` ADOPTS the resumed id as the
  panel's pinned session, so M17's cost accounting reads the right transcript and a later
  `Open as chat` finds it. `verify:agent-session args.5`, `verify:pty-manager resume-pin.1`.
- **Three ways.** A `>_` glyph button in the chat's chrome, the action bar, the palette row.

### What the round trip does NOT do

- Two front-ends at once. The verbs move a conversation; they never copy it.
- Import a running terminal's transcript mid-session (the live precondition).
- Carry cost across: the CLI's file has token usage per message but no dollar figure; the
  imported `meta` carries usage and turns, and the inspector prices the tokens as it does
  for every chat.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A subagent's turns imported as the conversation's | `verify:agent-session import.1` |
| A typed prompt (string content) dropped as an empty turn | `import.1` |
| Assistant records repeated per block counted as N turns / usage summed N times | `import.2` |
| A garbage line costing the import | `import.3` |
| `--session-id` appended beside `--resume` | `args.5` |
| The resumed terminal pinned to a fresh id, so cost reads the wrong file | `verify:pty-manager resume-pin.1` |
| A live terminal opened as chat (two front-ends) | `verify:panels front.1` (refused by name) |
| The imported chat rendering nothing / the terminal surviving | `front.1` |
| Chat → terminal spawning without `--resume` or losing the knobs | `front.2` |
| The verbs absent when they cannot apply (a row that disappears) | `verify:palette front.1`, `verify:rail front.1` |

## Manual-only, added

- The real round trip against the real CLI: a terminal running `claude` opened as chat and
  continued; a chat opened in a terminal and continued. Only the import half can be driven
  offline (against a fixture transcript); `--resume` in the TUI of a session a headless
  process created, and vice versa, is measured once by hand in the build log.
