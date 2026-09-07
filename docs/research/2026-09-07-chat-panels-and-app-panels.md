# Chat panels and app panels: primary-source research

Compiled 2026-09-07 for terminal-canvas. Every claim below carries the URL of the
source that owns it. Where a fact was read off a live API (`gh api repos/...`,
`npm view`) rather than a page, the figure is stamped **as of 2026-09-07** and the
command is named so it can be re-run.

---

## 1. Claude Code's programmatic chat surfaces

### What Anthropic actually ships

There are exactly **two** supported ways for a third-party app to drive a Claude Code
*conversation* without a PTY, and they are the same thing at two levels of wrapping:

| Surface | Package / command | Version (2026-09-07) | License |
|---|---|---|---|
| TypeScript Agent SDK | `@anthropic-ai/claude-agent-sdk` | `0.3.263`, published 2026-09-06 (`npm view`) | `SEE LICENSE IN README.md` — **not OSS** |
| Python Agent SDK | `claude-agent-sdk` | — | same terms |
| Headless CLI | `claude -p --output-format stream-json` | CLI `@anthropic-ai/claude-code` `2.1.263` (`npm view`) | same terms |

The SDK repo is <https://github.com/anthropics/claude-agent-sdk-typescript> (1,735 stars,
pushed 2026-09-06, **no SPDX license** detected by the GitHub API — `gh api repos/anthropics/claude-agent-sdk-typescript`).
Its README states the terms verbatim: *"Use of this SDK is governed by Anthropic's
Commercial Terms of Service, including when you use it to power products and services
that you make available to your own customers and end users, except to the extent a
specific component or dependency is covered by a different license as indicated in that
component's LICENSE file."*
(<https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/README.md>)

**The rename is real and already done.** `@anthropic-ai/claude-code` → `@anthropic-ai/claude-agent-sdk`
(TS) and `claude-code-sdk` → `claude-agent-sdk` (Python); Python's `ClaudeCodeOptions`
became `ClaudeAgentOptions`. `@anthropic-ai/claude-code` **still exists on npm as the CLI**,
so an install succeeds and the import fails — a real trap.
(<https://code.claude.com/docs/en/agent-sdk/migration-guide>)

### The streaming message contract (this is your renderer's input)

`query({ prompt, options })` returns a `Query` that `extends AsyncGenerator<SDKMessage, void>`.
The union members named in the reference are `SDKAssistantMessage`, `SDKUserMessage`,
`SDKResultMessage`, `SDKSystemMessage`, `SDKPartialAssistantMessage`, plus
`SDKCompactBoundaryMessage` and hook messages (`SDKHookStartedMessage` etc.).
(<https://code.claude.com/docs/en/agent-sdk/typescript>)

Token-level streaming is opt-in via `includePartialMessages: true`, which yields
`SDKPartialAssistantMessage` with `type: 'stream_event'`:

```ts
type SDKPartialAssistantMessage = {
  type: "stream_event";
  event: BetaRawMessageStreamEvent; // raw Claude API event
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
  ttft_ms?: number; // only on message_start
};
```

The raw events are the ordinary Claude API stream events: `message_start`,
`content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`,
`message_stop`. **Text arrives as `delta.type === 'text_delta'`; tool arguments arrive as
`delta.type === 'input_json_delta'` with `partial_json` you must accumulate yourself** —
the SDK does not accumulate for you. The documented message order is: stream events for
a text block, then stream events for a `tool_use` block, then the complete
`AssistantMessage`, then the tool runs, then more events, then `ResultMessage`.
(<https://code.claude.com/docs/en/agent-sdk/streaming-output>)

Two limits worth knowing before you design the panel:

- **Stream events are main-session only.** Token deltas from subagents are not forwarded;
  to attribute output to a subagent you must use the *complete* messages, which carry
  `parent_tool_use_id`. (<https://code.claude.com/docs/en/agent-sdk/streaming-output>)
- **Structured output never streams** — it appears only on the final
  `ResultMessage.structured_output`. (same page)

### Permissions / tool callbacks

`canUseTool` is the host's approval hook:

```ts
type CanUseTool = (request: ToolUsePermissionRequest,
                   options: { signal: AbortSignal }) => Promise<PermissionResult>;
```
(<https://code.claude.com/docs/en/agent-sdk/typescript>)

In practice the callback takes `(toolName, input, { signal, suggestions })` and returns
either `{ behavior: "allow", updatedInput, updatedPermissions? }` or
`{ behavior: "deny", message }`. Five UI affordances fall directly out of that shape:
approve, approve-with-modified-input, **approve-and-remember** (echo back a
`PermissionUpdate` from `suggestions` whose `destination` is `localSettings`), reject with
a reason Claude sees, and suggest-an-alternative.
(<https://code.claude.com/docs/en/agent-sdk/user-input>)

Three sharp edges the docs call out explicitly:

1. **`canUseTool` never fires for auto-approved tools.** An allow rule or a mode like
   `acceptEdits`/`bypassPermissions` resolves the call before the callback is consulted.
   For logic that must see *every* call, use a `PreToolUse` hook.
2. **The callback can stay pending indefinitely** — execution is paused until it returns.
   For approvals that may outlive the process, use a `PreToolUse` hook returning the
   `defer` decision instead.
3. `AskUserQuestion` arrives through the *same* callback with `toolName === "AskUserQuestion"`,
   carrying a `questions[]` array (`question`, `header` ≤12 chars, 2–4 `options` of
   `{label, description}`, `multiSelect`). You answer by returning
   `{ behavior: "allow", updatedInput: { questions, answers } }` where `answers` maps
   question text → chosen label. TypeScript can additionally request HTML/markdown option
   `preview`s via `toolConfig.askUserQuestion.previewFormat`. Limits: 1–4 questions,
   2–4 options each, and **not available in subagents**.
   (<https://code.claude.com/docs/en/agent-sdk/user-input>)

### Sessions / resume

- Options are `continue: true` (most recent session in cwd), `resume: <id>`,
  `forkSession: true` (branch a copy; original untouched), `persistSession: false`
  (in-memory only, TS only).
- The id is on `SDKResultMessage.session_id`, and in TypeScript also on the init
  `SystemMessage` directly.
- Transcripts live at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, where
  `<encoded-cwd>` is the absolute cwd with every non-alphanumeric character replaced by
  `-`; names over 200 chars are truncated with a hash appended. `CLAUDE_CONFIG_DIR` and
  `CLAUDE_CODE_PROJECT_DIR_NAME` relocate/rename it.
- **`listSessions()`, `getSessionMessages()`, `getSessionInfo()`, `renameSession()`,
  `tagSession()`** are exported — that is a supported session-picker/transcript-viewer API,
  which is better than terminal-canvas's current M74 glob of the CLI's own JSONL.
- The experimental **V2 session API (`createSession()` with `send`/`stream`) was removed
  in TS SDK 0.3.142** — do not build on it.
  (<https://code.claude.com/docs/en/agent-sdk/sessions>)

### The headless CLI protocol

`--output-format` takes `text` | `json` | `stream-json`. **`stream-json` requires `--verbose`**,
and token-level deltas additionally require `--include-partial-messages`:

```
claude -p "Explain recursion" --output-format stream-json --verbose --include-partial-messages
```

Notable facts for a host: the last line is always a `result` message; `system/init` is the
first event (unless plugin-install or hook events precede it) and carries `model`, `tools`,
`mcp_servers`, `plugins`, `plugin_errors`, `mcp_server_errors`, and an optional
**`capabilities` array of protocol-behaviour strings (e.g. `interrupt_receipt_v1`) meant for
feature-detection instead of version comparison**; `system/api_retry` events report retries;
subagent messages carry `parent_tool_use_id` and their *text* is only forwarded with
`--forward-subagent-text`. `--permission-prompts none` turns off waiting on a permission host.
Piped stdin is capped at 10 MB. SIGTERM exits 143 and leaves the turn unfinished; SIGINT or
the SDK's `interrupt()` ends the turn cleanly. `--bare` skips discovery of hooks/skills/
commands/subagents/plugins/MCP/CLAUDE.md and is "recommended for scripted and SDK calls".
(<https://code.claude.com/docs/en/headless>)

### Is there an official "Claude Code UI" / webview protocol?

**No.** The full documentation index at <https://code.claude.com/docs/llms.txt> lists pages
for the CLI, VS Code, JetBrains, Desktop, web/mobile, MCP, hooks, channels, plugins and the
Agent SDK — and **no page describing an IDE-extension or webview wire protocol for
third-party UIs**. The VS Code page (<https://code.claude.com/docs/en/vs-code>) documents the
extension as a product, not as an embeddable protocol. The supported answer to "render a
Claude Code chat in my app" is the Agent SDK or `claude -p --output-format stream-json`.

There *is* one adjacent documented protocol — **channels**, an MCP-server contract for
pushing events *into* a running session — but it is an input path, not a rendering contract.
(<https://code.claude.com/docs/en/channels-reference>)

> **What this means for terminal-canvas.** M71's `AgentSessionManager` already speaks the
> `claude -p --input-format stream-json` door, so the chat panel does not need a new
> transport — it needs `--include-partial-messages` for token-level streaming, and it should
> feature-detect off `system/init.capabilities` rather than the CLI version string. The
> SDK's `listSessions()`/`getSessionMessages()` would replace M74's hand-rolled transcript
> glob. Two caveats: the SDK is **proprietary** (Anthropic Commercial ToS), so adding it as a
> dependency is a licensing decision, not just a `package.json` line; and the CLI door you
> already have avoids that entirely.

---

## 2. ACP — the Agent Client Protocol

**This is the closest thing in existence to a *rendering contract* for the UI you want**, and
terminal-canvas already has an ACP client (M119, `src/shared/acp-transcript.ts`).

| Fact | Value | Source |
|---|---|---|
| Repo | `zed-industries/agent-client-protocol` — **4,179 stars**, pushed 2026-09-07, Apache-2.0 | `gh api repos/zed-industries/agent-client-protocol` |
| Latest schema tag | `schema-v1.21.0`, with `schema-v2.0.0-alpha.3` in flight | `gh api repos/.../releases` |
| TS SDK (current) | `@agentclientprotocol/sdk` **1.4.0**, published 2026-08-20, Apache-2.0 | `npm view @agentclientprotocol/sdk` |
| TS SDK (old name) | `@zed-industries/agent-client-protocol` frozen at 0.4.5 (2025-10-02) — **stale, migrate** | `npm view @zed-industries/agent-client-protocol time` |
| Transport | JSON-RPC 2.0, methods + notifications, over stdio | <https://agentclientprotocol.com/protocol/overview> |

### The rendering surface

`session/update` notifications are the whole conversation-rendering vocabulary:
`agent_message_chunk`, `agent_thought_chunk`, `user_message_chunk`, `tool_call`,
`tool_call_update`, `plan`, plus `available_commands_update`, `current_mode_update` and
`config_option_update`. Chunks carry a `messageId`; *"Chunks with the same `messageId`
belong to the same message; a changed `messageId` indicates a new message"* — that is your
bubble-grouping rule, given to you.
(<https://agentclientprotocol.com/protocol/prompt-turn>)

Tool calls are specified precisely enough to render without inventing anything:

- **`ToolKind`**: `read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`,
  `other` (default) — nine icons, closed set.
- **`ToolCallStatus`**: `pending`, `in_progress`, `completed`, `failed` — four states.
- **`ToolCallContent`** variants: a **content** block (text/image/resource), a **diff**
  (`path`, `newText`, optional `oldText` — absent for new files), or a **terminal**
  (`terminalId` referencing a live embedded terminal).
- **`ToolCallLocation`**: `path` (absolute, required) + optional `line` (1-based) — this is
  what drives "follow the agent" cursor-jumping.
- `rawInput` / `rawOutput` carry the untouched tool payload for a "show raw" disclosure.
  (<https://agentclientprotocol.com/protocol/tool-calls>)

Permission requests are `session/request_permission` with a `toolCall` and `options`, where
each option has one of four `kind`s — `allow_once`, `allow_always`, `reject_once`,
`reject_always` — *specifically so the client can style them*. Plan entries carry content,
priority (high/medium/low) and status. Session modes (`session/set_mode`,
`current_mode_update`) model plan-vs-implement.
(<https://agentclientprotocol.com/protocol/tool-calls>, <https://agentclientprotocol.com/protocol/prompt-turn>,
<https://agentclientprotocol.com/protocol/session-modes>)

Client-side methods the *host* implements: `fs/read_text_file`, `fs/write_text_file`, and
terminal embedding via `terminal/create`, `terminal/output`, `terminal/wait_for_exit`,
`terminal/kill`, `terminal/release`. **All paths MUST be absolute; line numbers are 1-based.**
(<https://agentclientprotocol.com/protocol/overview>, <https://agentclientprotocol.com/protocol/schema>)

### Who speaks it

The registry at <https://agentclientprotocol.com/get-started/agents> lists ~40 agents,
including **Claude Agent (`claude-agent-acp`)**, **Gemini CLI (`gemini-cli`)**,
**Codex CLI (`codex-acp`)**, **GitHub Copilot (`copilot-cli`)**, Cline, Cursor, OpenCode,
OpenHands, Goose, Docker cagent, Factory Droid, Kimi CLI, Qwen Code, Mistral Vibe, Junie.

The Claude adapter **moved twice** and this matters:

| Package | Version | Last publish | Status |
|---|---|---|---|
| `claude-code-acp` (carlrannaberg) | 0.1.1 | 2025-09-03 | unrelated third party, dead |
| `@zed-industries/claude-code-acp` | 0.16.2 | 2026-03-26 | superseded |
| **`@agentclientprotocol/claude-agent-acp`** | **0.75.1** | **2026-09-05** | **current**, Apache-2.0 |

(`npm view` on each; repo `zed-industries/claude-code-acp` → 2,503 stars, pushed 2026-09-07,
Apache-2.0, now mirrored at `agentclientprotocol/claude-agent-acp`.)

Its README enumerates what it already translates: context mentions and images, tool calls
with permission requests, following and edit review, TODO lists and nested subagent
transcripts, interactive and background terminals, custom slash commands, client MCP servers.
(<https://github.com/zed-industries/claude-code-acp/blob/main/README.md>)

> **What this means for terminal-canvas.** ACP gives you the panel's data model for free and
> it is Apache-2.0, unlike the Anthropic SDK. `ToolKind` × `ToolCallStatus` is exactly the
> "one collapsed row (verb, target, state)" the project's own chat rule asks for; `diff`
> content is the code-diff renderer's input; `ToolCallLocation` is the hook that lets a chat
> panel drive a *file* panel on the same canvas. Because `@agentclientprotocol/claude-agent-acp`
> is an ordinary stdio process wrapping the Claude Agent SDK, you get a Claude Code chat
> **without linking Anthropic's proprietary SDK into your bundle** — the ToS attaches to that
> process, not to your renderer. The immediate action items are: migrate M119 off
> `@zed-industries/agent-client-protocol` (frozen ~11 months) to `@agentclientprotocol/sdk`
> 1.4.0, and re-point the adapter name to `@agentclientprotocol/claude-agent-acp`.

---

## 3. Open-source repos that already render a Claude Code chat UI

All figures read from the GitHub API on **2026-09-07** (`gh api repos/OWNER/NAME`).

| Repo | Stars | Last push | License | Transport | Liftable? |
|---|---:|---|---|---|---|
| [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui) | 13,609 | 2026-09-07 | **AGPL-3.0-or-later** | `@anthropic-ai/claude-agent-sdk` in-process + `node-pty` + WS | **The renderer components — but AGPL** |
| [sugyan/claude-code-webui](https://github.com/sugyan/claude-code-webui) | 1,140 | **2026-05-29** | MIT | `claude -p --output-format stream-json` over HTTP/SSE | **ARCHIVED** — read-only reference |
| [zed-industries/claude-code-acp](https://github.com/zed-industries/claude-code-acp) | 2,503 | 2026-09-07 | Apache-2.0 | Agent SDK → ACP over stdio | **The transport wrapper. Use as-is.** |
| [zed-industries/zed](https://github.com/zed-industries/zed) (agent panel) | 89,900 | 2026-09-07 | GPL/AGPL/Apache mix (`NOASSERTION`) | ACP | Rust/GPUI — **design reference only** |
| [cline/cline](https://github.com/cline/cline) | 67,643 | 2026-09-07 | Apache-2.0 | own provider layer; VS Code webview + protobuf | **Best permissively-licensed renderer** |
| [Kilo-Org/kilocode](https://github.com/Kilo-Org/kilocode) | 27,218 | 2026-09-07 | MIT | Cline/Roo fork | MIT fork of the same renderer |
| [RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code) | 24,305 | 2026-05-15 | Apache-2.0 | — | **ARCHIVED 2026** |
| [sst/opencode](https://github.com/sst/opencode) | 205,672 | 2026-09-07 | MIT | own server + ACP | TUI-first; `packages/app`,`console`,`desktop` exist |
| [stravu/crystal](https://github.com/stravu/crystal) | 3,115 | **2026-02-26** | MIT | Electron + Claude/Codex CLIs | **Effectively dead** (renamed "Nimbalyst"); Electron worktree UX is the value |
| [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) | 28,032 | **2026-04-24** | Apache-2.0 | Rust server + agent CLIs | Stale ~4.5 months; board model, not chat |
| [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) | 8,442 | 2026-08-20 | AGPL-3.0 | Go TUI over tmux | **Nothing** — terminal multiplexer, not a chat UI |
| [slopus/happy](https://github.com/slopus/happy) | 23,691 | 2026-09-07 | MIT | own encrypted relay + `happy-cli` | React Native; `happy-wire` protocol is the interesting part |
| [getAsterisk/claudia](https://github.com/getAsterisk/claudia) | 22,395 | **2025-10-16** | AGPL-3.0 | Tauri | **Dead ~11 months** |
| Conductor (conductor.build) | — | — | **closed source** | — | Nothing; no repo exists (GitHub search returns only unrelated 1–4-star projects) |

### What is concretely liftable

**`siteboon/claudecodeui` — the most complete Claude-Code chat renderer in the open, and
the license is the catch.** Its `package.json` declares `"license": "AGPL-3.0-or-later"` and
depends directly on `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`, `@xterm/xterm`,
`node-pty`, `react-markdown`, `tailwindcss`, `lucide-react`, and ships an `electron/` folder
— it is structurally the same app as terminal-canvas minus the canvas
(`gh api repos/siteboon/claudecodeui/contents/package.json`). The directory that matters is
[`src/modules/chat/`](https://github.com/siteboon/claudecodeui/tree/main/src/modules/chat):

- `transcript/`: `ChatMessagesPane.tsx`, `LazyMessageRow.tsx`, `StreamingMarkdown.tsx`,
  `MessageComponent.tsx`, `Reasoning.tsx`, `ToolGroupContainer.tsx`
- `tools/`: `ToolRenderer.tsx`, `ToolDiffViewer.tsx`, `ToolStatusBadge.tsx`,
  `OneLineDisplay.tsx`, `CollapsibleDisplay.tsx`, `PlanDisplay.tsx`, `SubagentPanel.tsx`,
  `configs/toolConfigs.ts`

Its [`tools/README.md`](https://github.com/siteboon/claudecodeui/blob/main/src/modules/chat/tools/README.md)
states the architecture in one paragraph and it is worth copying as a *design*: *"Config-driven
architecture for rendering tool executions in chat. All tool display behavior is defined in
`toolConfigs.ts` — no scattered conditionals. Two base display patterns: **OneLineDisplay**
for compact tools, **CollapsibleDisplay** for tools with expandable content."* `OneLineDisplay`
is used by Bash/Read/Grep/Glob/TodoRead/Task*, `CollapsibleDisplay` by Edit/Write/ApplyPatch/
TodoWrite/ExitPlanMode/Default, with content renderers for diff, markdown, file list, todo
list, task list and plain text.

**AGPL-3.0 is viral across the network boundary.** Copying these components into
terminal-canvas would put terminal-canvas under AGPL. Treat this repo as *architecture to
read*, not code to paste, unless the project deliberately relicenses.

**`cline/cline` — the same job under Apache-2.0.** `apps/vscode/LICENSE` is the Apache
License 2.0 (`gh api .../contents/apps/vscode/LICENSE`). The renderer lives at
[`apps/vscode/webview-ui/src/components/chat/`](https://github.com/cline/cline/tree/main/apps/vscode/webview-ui/src/components/chat)
and contains `ChatView.tsx`, `ChatRow.tsx`, `MarkdownRow.tsx`, `DiffEditRow.tsx`,
`CommandOutputRow.tsx`, `CompactionRow.tsx`, `ExpandHandle.tsx`, `OptionsButtons.tsx`,
`ErrorRow.tsx`, `HookMessage.tsx`, `BrowserSessionRow.tsx`. This is a *row-per-event* chat
model with error boundaries and Storybook stories — the closest permissively-licensed match
to the "one collapsed row (verb, target, state)" rule, and it is pushed daily.
`Kilo-Org/kilocode` (MIT, 27,218 stars, pushed 2026-09-07) is a downstream fork of the same
lineage if MIT is preferable to Apache-2.0.

**`sugyan/claude-code-webui` — the cleanest *transport* example, but archived.** GitHub
reports `archived: true`, last push 2026-05-29. Its value is that it proves the thin path:
a backend that shells out to `claude -p --output-format stream-json` and streams NDJSON to
a React frontend whose entire renderer is
[`frontend/src/components/messages/`](https://github.com/sugyan/claude-code-webui/tree/main/frontend/src/components)
— `MessageContainer.tsx` and `CollapsibleDetails.tsx`, i.e. two files. Read it for the shape;
do not depend on it.

**Zed's agent panel** is the reference *implementation of the ACP client role*, but it is
Rust/GPUI (`crates/agent_ui`, `crates/agent_servers`, `crates/agent`) and the repo's license
is `NOASSERTION` (a GPL/AGPL/Apache mix). Nothing to lift into a React app except the
interaction design — which is exactly what the ACP spec already encodes.

**Nothing to lift** from `claude-squad` (Go TUI over tmux — the problem terminal-canvas has
already solved), `vibe-kanban` (a board over agent CLIs, last push 2026-04-24), `claudia`
(dead since 2025-10-16), or Conductor (closed-source macOS app; no public repo).

> **What this means for terminal-canvas.** The Apache-2.0 pair is the practical answer:
> `@agentclientprotocol/claude-agent-acp` for transport, `cline/cline`'s `webview-ui/.../chat/`
> for the row-renderer shape. Read `siteboon/claudecodeui`'s `tools/README.md` and
> `toolConfigs.ts` for the config-driven tool-display table — a table of
> `{tool → display pattern, icon, primary field, action}` is exactly the closed-set discipline
> this repo already applies to `verb-table.ts` and `BACKENDS`, and it maps 1:1 onto ACP's
> `ToolKind` × `ToolCallStatus`. Do **not** copy AGPL source.

---

## 4. Canvas / app-panel prior art

### tldraw — the closest match, and the license is a blocker

A shape is a `ShapeUtil` subclass implementing `getDefaultProps`, `getGeometry`, `component`,
`getIndicatorPath`; `component(shape)` returns arbitrary JSX inside `<HTMLContainer>` (or
`<SVGContainer>`), and `static props` runs schema validation — without it *"`props` accepts any
JSON value and typos or stale data pass through unchecked"*
(<https://tldraw.dev/docs/shapes>).

**Culling is the load-bearing detail, and tldraw gets it right.** `Editor.getNotVisibleShapes()`
returns shapes whose page bounds miss the viewport; `getCulledShapes()` subtracts selected and
editing shapes. **Culled shapes stay in the DOM and receive `display: none` — they are not
unmounted**, and `ShapeUtil.canCull()` returns `false` to opt out entirely
(<https://tldraw.dev/sdk-features/culling>). That preserves iframe navigables, xterm buffers,
sockets and React state.

**Interaction is modal.** For the built-in embed shape: *"Clicking an embed selects the shape
rather than interacting with the content"*; double-click or Enter enters editing mode, and
*"In editing mode, pointer events pass through to the iframe"*
(<https://tldraw.dev/sdk-features/embed-shape>). Embeds are sandboxed (scripts/forms allowed;
downloads, modals, top-level navigation blocked), and GitHub Gist uses `srcDoc` rather than
`src` specifically to block JSONP attacks.

**Use `markEventAsHandled`, not `stopPropagation`.** tldraw deleted `stopEventPropagation` on
purpose in <https://github.com/tldraw/tldraw/pull/6733> — a blanket `.stopPropagation()`
*"can impact non-tldraw event handlers set up elsewhere"*, whereas `markEventAsHandled` stops
tldraw only. See <https://tldraw.dev/examples/event-blocker>.

**Zoom-invariant chrome** is the `components` prop: `OnTheCanvas` renders in page space
(scales with zoom, moves on pan), `InFrontOfTheCanvas` in screen space (follows the page,
stays the same size), with `editor.pageToViewport()` to convert
(<https://tldraw.dev/examples/things-on-the-canvas>).

**License: tldraw is NOT MIT and NOT open source.** `LICENSE.md` is a bespoke tldraw, Inc.
licence: you may use it in Development Environments and modify/bundle it, but you agree
*"Not to use the Software in Production Environments"* and *"Not to disable, change, or
interfere with the Software's License Key enforcement"*
(<https://github.com/tldraw/tldraw/blob/main/LICENSE.md>). Production needs a key; under a
hobby licence *"the 'made with tldraw' watermark must be shown on the canvas"* and the SDK
*"will not work in production without a valid license key"*
(<https://tldraw.dev/community/license>). GitHub reports `NOASSERTION`. Current version
`tldraw` 5.4.0 (`npm view tldraw`); repo 50,190 stars, pushed 2026-09-07.

### React Flow / xyflow (MIT, 38,294 stars, pushed 2026-09-05)

The utility-class vocabulary is the well-designed part
(<https://reactflow.dev/learn/customization/utility-classes>,
<https://reactflow.dev/api-reference/react-flow>):

| Class | Prop | Effect |
|---|---|---|
| `nodrag` | `noDragClassName` | element does not initiate node drag |
| `nowheel` | `noWheelClassName` | disables canvas pan/zoom on wheel so inner `overflow:auto` scrolls |
| `nopan` | `noPanClassName` | click-drag on element does not pan the viewport |

Z-order is `zIndexMode` (`auto`/`basic`/`manual`) plus `elevateNodesOnSelect`/`elevateEdgesOnSelect`.

**`onlyRenderVisibleElements` is the trap.** The API reference says it "might improve
performance… but also adds an overhead", and it works by **unmounting** off-screen nodes:
node state is lost on pan-away-and-back (<https://github.com/xyflow/xyflow/issues/4378>),
edges to off-screen nodes fail to render when nodes have explicit width/height
(<https://github.com/xyflow/xyflow/issues/4516>, <https://github.com/xyflow/xyflow/issues/4329>),
and there is an open request for a per-node opt-out
(<https://github.com/xyflow/xyflow/issues/5487>) — React Flow has **no equivalent of tldraw's
`canCull()`**. The performance guide is mostly React hygiene and notes that "Complex CSS
styles, particularly those involving animations, shadows, or gradients, can significantly
impact performance" (<https://reactflow.dev/learn/advanced-use/performance>). Virtualization
is also defeated by zoom-out — at low zoom everything is visible, which is why semantic
zoom/LOD is the real mitigation.

### Products

| Product | Shipping? | Interactive apps in world space? | Public technical docs |
|---|---|---|---|
| **Excalidraw** (MIT, 131,341 stars, pushed 2026-09-07) | Yes | Yes, but **allowlisted**: `validateEmbeddable` hardcodes regexes for YouTube, Vimeo, Figma, GH Gist, MS Forms, X, val.town, Giphy, Reddit, Google Drive ([embeddable.ts](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/embeddable.ts)); every embed is `MarkRequired<IframeData, "sandbox">` — sandbox is non-optional *by type* | [embedding guide](https://excalidraw-excalidraw.mintlify.app/guides/embedding) |
| **Figma / FigJam widgets** | Yes | **No arbitrary DOM.** Widget render code "runs synchronously", depends only on widget state, and "won't be able to read and access data outside of the particular widget's state"; iframes are for *async* work, not canvas rendering (<https://developers.figma.com/docs/widgets/how-widgets-run>) | Yes, plus the [plugin sandbox post-mortem](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/) |
| **Muse → Allume** | Renamed; v4.0 on Mac/iPad/iPhone (<https://allume.com/>) | No — static cards; the site explicitly rejects "endless canvas zooming" | Design memos only (<https://museapp.com/memos/2020-12-infinite-canvas/>) |
| **Kosmik** | **Wound down** — "you can't sign-up anymore… you can still download Kosmik and access your account to export your workspace and data" | Had a real in-canvas browser ([TechCrunch](https://techcrunch.com/2023/12/21/meet-kosmik-a-visual-canvas-with-an-in-built-pdf-reader-and-a-web-browser/)) | **None** — closed source |
| **Heptabase** | Yes, closed source | Card-in-card embeds by link; no evidence of arbitrary live iframes | [wiki](https://wiki.heptabase.com/version-one), product-level only |
| **Flowith** | Yes | Nodes are prompts/model outputs, not hosted apps (<https://flowith.io/blog/canvas-evolved-habitat/>) | None; marketing only |
| **Napkin** | Yes | No — text→diagram, not an app canvas | n/a |

Blunt read: **nobody in the knowledge-tool space publishes how they do this.** The only prior
art with real documentation is tldraw, and secondarily Excalidraw's allowlist. Kosmik is the
one product that did what terminal-canvas wants, and it is essentially dead.

### Failure modes, with spec/bug evidence

**iframe re-mount on DOM reparent is a spec guarantee, not a bug.** WHATWG HTML: the `iframe`
removing steps are to *"destroy a child navigable"*, and this happens *"without any `unload`
events firing (the element's content document is destroyed, not unloaded)"*; reinsertion must
*"Create a new child navigable"* and reprocess attributes
(<https://html.spec.whatwg.org/multipage/iframe-embed-object.html>). So any virtualization
that unmounts — and any React reconciliation that moves a node between parents — reloads the
embedded app. There is no workaround short of never removing the element, which is exactly why
tldraw culls with `display: none`.

**Electron `<webview>` under transforms is broken and deprecated.** Electron's own docs say the
webview tag *"is based on Chromium's webview which is undergoing dramatic architectural changes
that impact the stability of webviews, including rendering, navigation, and event routing"* and
recommend iframe or BrowserView instead
(<https://github.com/electron/electron/blob/main/docs/api/webview-tag.md>). Concrete transform
bugs: `transform: scale(0.3)` yields 0.09× double-scaled content
(<https://github.com/electron/electron/issues/3749>,
<https://github.com/electron/electron/issues/4562>); a 3D-transformed webview *"resizes to the
boundingClientRect, not the true size of the element"*
(<https://github.com/electron/electron/issues/5968>); window resize desyncs scaled content
(<https://github.com/electron/electron/issues/7777>). **This bears directly on M103's
`BrowserNode`, which is a `<webview>` in the transformed world layer.**

**Blur under transform.** Rasterization happens at the layer's own scale: *"Blurred content is
a webkit specific side effect that occurs when a GPU promoted element is rendered on a
non-integer boundary"* (<https://keithclark.co.uk/articles/gpu-text-rendering-in-webkit/>).
CSSWG has an open, unresolved request to let authors specify raster scale for transformed
content (<https://lists.w3.org/Archives/Public/public-css-archive/2016Jun/0357.html>, still
under discussion in <https://lists.w3.org/Archives/Public/public-css-archive/2023Feb/0370.html>).
Practical rule: scale the *layout* (font-size, width), don't `transform: scale()` text you
want crisp.

**Scroll capture.** React Flow's `nowheel` exists because of a long tail of reports:
scrollable custom nodes not scrolling (<https://github.com/xyflow/xyflow/issues/2215>),
scrollbars dead to the mouse (<https://github.com/xyflow/xyflow/issues/2229>), `<select>` not
scrolling (<https://github.com/xyflow/xyflow/issues/4882>).

**Embed race conditions.** tldraw <https://github.com/tldraw/tldraw/issues/5003>: custom embeds
render on first paste but come back blank after reload, fixing themselves only on resize — a
shape-util instantiation-ordering bug. Also
<https://github.com/tldraw/tldraw/issues/1864> (embedded iframe steals focus on load) and
<https://github.com/tldraw/tldraw/issues/4359>.

### The hard ceiling on live panels

Chromium caps **active WebGL contexts per renderer process at 16 on desktop, 8 on Android**;
exceeding it forcibly loses the oldest context with the console warning *"Too many active WebGL
contexts. The oldest context will be lost."* The `--max-active-webgl-contexts` flag makes it
configurable, but the Chromium graphics team stated there are **no plans to raise the default**
(<https://issues.chromium.org/issues/40543269>;
<https://groups.google.com/a/chromium.org/g/graphics-dev/c/fmNedEEAYpA>; reproduced in
<https://github.com/openlayers/openlayers/issues/16118> and
<https://github.com/pixijs/pixijs/issues/8215>). Because it is **per renderer process**, one
Electron window shares one budget across every xterm WebGL addon on the canvas. The documented
escape hatch is one off-screen WebGL canvas blitted into many 2D canvases.

> **What this means for terminal-canvas.** Four things.
> (1) M3's tiering already *is* tldraw's model — extend `display: none`-style culling with a
> per-kind `canCull()` opt-out to every heterogeneous panel, because unmounting a chat or
> browser panel destroys its navigable *by spec*.
> (2) Adopt the modal interaction gate (select → double-click to interact) plus React Flow's
> `nodrag`/`nowheel`/`nopan` class vocabulary; those three conventions pre-empt a whole class
> of bug reports and cost nothing.
> (3) M103's `<webview>` in the transformed layer is standing on documented, unfixed Electron
> transform bugs. Either keep the guest in screen space positioned against a world-derived
> rect, or accept card-only rendering at non-1.0 zoom.
> (4) **Do not depend on tldraw.** Its licence prohibits production use without a paid key,
> which is a commercial conversation, not a `package.json` line. Study the API; ship your own.
> This also reinforces M144's `--chrome-scale` decision: drive size by layout, not by
> `transform: scale()`, for anything a human reads.

---

## 5. Chat-UI component libraries

**The one fact that decides most of this:** nearly every "AI chat UI kit" in 2026 is a
shadcn/ui derivative, which means Tailwind is not a theming preference but the *delivery
mechanism* — the components ship as class strings that do nothing until a Tailwind build
scans them. terminal-canvas's ban on Tailwind therefore disqualifies the entire *styled* tier,
and the useful question becomes which projects have a genuinely headless layer underneath.

### Component kits

| Package | Stars | Last commit | License | React-only | Tailwind? | Component lib? | Weight | Verdict |
|---|---:|---|---|---|---|---|---|---|
| [`ai-elements`](https://www.npmjs.com/package/ai-elements) | (CLI shim) | 2026-05-18 | Apache-2.0 | yes | **required** (TW4) | **required** (shadcn) | 8.5 KB (it's a `bin`) | **REFERENCE ONLY** |
| [`ai`](https://www.npmjs.com/package/ai) / [`@ai-sdk/react`](https://www.npmjs.com/package/@ai-sdk/react) | 26,629 | 2026-09-07 | Apache-2.0 | yes | no | no | 7.0 MB / 312 KB unpacked | **AVOID** — duplicates `AgentSessionManager` |
| [`@assistant-ui/react`](https://www.npmjs.com/package/@assistant-ui/react) | 12,042 | 2026-09-07 | MIT | yes | **no** | pulls Radix + zustand | 193 KB gzip | **REFERENCE ONLY** |
| [`@shadcn/react`](https://www.npmjs.com/package/@shadcn/react) | 123,305 | 2026-09-06 | MIT | React ≥19 | **no** | no | tiny | **REFERENCE ONLY** |
| [`@llamaindex/chat-ui`](https://www.npmjs.com/package/@llamaindex/chat-ui) | 594 | **2025-12-16** | MIT | yes | **required** | Radix + MDXEditor + CodeMirror | 1.8 MB unpacked | **AVOID** — stale 9 months |

**AI Elements is not a runtime library.** `ai-elements` is 8.5 KB unpacked with a `bin` entry
— a CLI shim. Install is `npx ai-elements@latest add message`; components land as source in
`@/components/ai-elements/`. Documented prerequisites are explicit: *"Node.js 18 or later,
React 19, Next.js 14+, AI SDK installed and configured, shadcn/ui initialized, Tailwind CSS 4"*
(<https://elements.ai-sdk.dev/setup>); the overview states it is *"Built on shadcn/ui
conventions"* (<https://elements.ai-sdk.dev/overview>). Its `Tool` component is worth reading
for the collapsed tool row; its implementation is unusable here.

**assistant-ui is the architecturally relevant one.** `@assistant-ui/react` 0.15.18, MIT,
12,042 stars, pushed 2026-09-07. Peers are React/react-dom only; runtime deps are `radix-ui`,
`zustand`, `zod`, `assistant-stream`, `@assistant-ui/core`, `react-textarea-autosize`
(<https://www.npmjs.com/package/@assistant-ui/react>) — **no Tailwind in the dependency graph**.
The README states the two-tier split: *"Composable primitives: build any chat UX from `Thread`,
`Message`, `Composer`, `ThreadList`, `ActionBar`… Style every pixel yourself, or start from a
polished shadcn/ui theme that the CLI copies into your project"*
(<https://github.com/assistant-ui/assistant-ui/blob/main/README.md>). The styled tier is opt-in
(`@assistant-ui/styles`), so you simply don't install it. The cost is 193 KB gzip
(<https://bundlephobia.com/package/@assistant-ui/react>) plus `zustand` and `radix-ui`, and its
runtime wants to *own* the conversation — which collides with `AgentSessionManager`.

**shadcn shipped real chat blocks in June 2026** — `MessageScroller`, `Message`, `Bubble`,
`Attachment`, `Marker`, plus `scroll-fade` and `shimmer` utilities
(<https://ui.shadcn.com/docs/changelog/2026-06-chat-components>). Those are Tailwind-bound. The
new thing is `@shadcn/react` 0.3.1, MIT, described on npm as *"Unstyled components for React"*,
peer React ≥19 only (<https://www.npmjs.com/package/@shadcn/react>): the scroll logic lives
there and the registry components wrap it with styles. `message-scroller` — anchored turns,
streamed replies, jump-to-message — is the single hardest behaviour in a chat panel and is
available Tailwind-free, though at v0.3.1 it is young.

**LlamaIndex chat-ui is out on two counts**: 594 stars, last commit 2025-12-16, and the README
requires a Tailwind `@source '../node_modules/@llamaindex/chat-ui/**/*.{ts,tsx}'` directive
(<https://github.com/run-llama/chat-ui/blob/main/README.md>).

### Streaming markdown and highlighting

| Package | Stars | Last commit | License | Tailwind? | Weight | Verdict |
|---|---:|---|---|---|---|---|
| [`streamdown`](https://github.com/vercel/streamdown) | 5,594 | 2026-09-07 | Apache-2.0 | **required** | 147 KB gzip | **REFERENCE ONLY** |
| [`remend`](https://www.npmjs.com/package/remend) | (streamdown's own dep) | — | Apache-2.0 | no | small | **USABLE AS DEP** |
| [`react-markdown`](https://github.com/remarkjs/react-markdown) | 15,876 | 2026-09-01 | MIT | no | 34 KB gzip | **USABLE AS DEP** |
| [`remark-gfm`](https://www.npmjs.com/package/remark-gfm) | — | — | MIT | no | 22 KB unpacked | **USABLE AS DEP** |
| [`shiki`](https://github.com/shikijs/shiki) core + JS engine | 13,782 | 2026-08-10 | MIT | no | 56 KB gzip core, 10.7 KB engine | **USABLE AS DEP** |
| [`highlight.js`](https://www.npmjs.com/package/highlight.js) | — | 2026-08-12 | BSD-3-Clause | no (ships CSS themes) | 5.5 MB unpacked | **REFERENCE ONLY** |
| [`prismjs`](https://www.npmjs.com/package/prismjs) | — | 2025-03-10 | MIT | no | 2.0 MB unpacked | **AVOID** — stagnant |

Streamdown solves a real problem — *"when you tokenize and stream it, new challenges arise…
seamless formatting even with incomplete or unterminated Markdown blocks"* — but the same
README tells you to add `@source "../node_modules/streamdown/dist/*.js"` to Tailwind and warns
its components *"are built using shadcn/ui's design system and rely on CSS custom properties…
Without these variables defined, components may render with missing backgrounds, borders, or
incorrect spacing"* (<https://github.com/vercel/streamdown/blob/main/README.md>). The escape
hatch is its own dependency, **`remend`** 1.3.1, Apache-2.0 — *"Self-healing markdown.
Intelligently parses and styles incomplete Markdown blocks"*
(<https://www.npmjs.com/package/remend>): the streaming-completion algorithm without the
Tailwind wrapper.

**Shiki under `default-src 'self'`.** The default engine compiles Oniguruma to WASM. Shiki
documents an alternative that *"uses JavaScript's native `RegExp`"* by transpiling patterns,
*"best when running in the browser and in cases when you want to control the bundle size"*,
with all built-in languages supported since 3.9.1, and `createJavaScriptRawEngine()` skipping
transpilation entirely (<https://shiki.style/guide/regex-engines>). With `createHighlighterCore`
and hand-picked themes/languages (<https://shiki.style/guide/bundles>) there is **no WASM fetch
and no CDN** — clean under the repo's CSP. The full bundle is *"6.4 MB minified, 1.2 MB
gzip"*; never import it.

### Diff renderers

| Package | Stars | Last commit | License | React-only | Own CSS file? | Build/WASM/worker | Weight | Verdict |
|---|---:|---|---|---|---|---|---|---|
| [`react-diff-view`](https://github.com/otakustay/react-diff-view) | 1,012 | 2026-03-30 | MIT | yes | **yes** (`react-diff-view/style/index.css`) | no | 23 KB gzip | **USABLE AS DEP** |
| [`diff2html`](https://github.com/rtfpessoa/diff2html) | 3,407 | 2026-05-08 | MIT | **no** — HTML strings | yes | no | 13 KB gzip | **AVOID for a React panel** |
| [`monaco-editor`](https://github.com/microsoft/monaco-editor) DiffEditor | 46,689 | 2026-09-03 | MIT | no | yes | **yes** — per-bundler worker wiring ([ESM docs](https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md)) | **97.9 MB unpacked** | **AVOID** |
| [`@git-diff-view/react`](https://github.com/MrWangJustToDo/git-diff-view) | 738 | 2026-08-13 | MIT | yes | yes | no | 1.3 MB; drags `highlight.js` + `lowlight` | **REFERENCE ONLY** |
| [`diff` (jsdiff)](https://github.com/kpdecker/jsdiff) | 9,205 | 2026-08-24 | BSD-3-Clause | n/a | none | no | **7.9 KB gzip, zero deps** | **USABLE AS DEP** |

Note the distinction the project's own rule implies: **a plain CSS file is not a "styling
dependency" in the sense CLAUDE.md forbids** (that clause names Tailwind, component libraries
and icon fonts). `react-diff-view`'s `style/index.css` is a legitimate cost; Tailwind is not.

> **What this means for terminal-canvas.** Depend on four small, unstyled things:
> `react-markdown` + `remark-gfm` (34 KB gzip; its `components` map lets every element take a
> `.pf__*`-style class), `shiki` via `createHighlighterCore` with `shiki/engine/javascript` and
> hand-picked grammars (no WASM, no CDN — CSP-clean), and `diff` (jsdiff, 7.9 KB, zero deps)
> for hunk computation. Add `remend` only if streaming-markdown flicker proves real in practice.
> Prefer **your own diff renderer over jsdiff** to `react-diff-view` — M9c already renders a
> review surface, and the face/rest/path rules would fight an imported GitHub theme — keeping
> `react-diff-view` as the fallback if hunk folding and word-level intra-line diff turn out
> harder than expected.
> Reimplement by reading, not installing: `@shadcn/react`'s `message-scroller` for scroll
> anchoring during streaming (the hardest behaviour); `@assistant-ui/react`'s primitive
> decomposition (`Thread`/`Message`/`Composer`/`ActionBar`) as the naming and composition
> model — MIT and headless, so reading is cheap and depending is not; AI Elements' `Tool`
> component for the collapsed row.

---

## Cross-cutting conclusion

1. **Transport:** you already have the `claude -p --input-format stream-json` door (M71/M90)
   and an ACP client (M119). Add `--include-partial-messages` for token streaming; migrate the
   ACP client to `@agentclientprotocol/sdk` 1.4.0 and point the Claude adapter at
   `@agentclientprotocol/claude-agent-acp` 0.75.1. Both are Apache-2.0; the Anthropic SDK is not.
2. **Data model:** ACP's `SessionUpdate` × `ToolKind` × `ToolCallStatus` × `ToolCallContent`
   is the closed-set rendering contract this project's conventions already favour, and it maps
   onto the Claude stream-json events without loss.
3. **Renderer:** read `cline/cline`'s `webview-ui/.../chat/` (Apache-2.0) for row shapes and
   `siteboon/claudecodeui`'s `tools/README.md` (AGPL — read only) for the config-driven
   tool-display table. Build the components yourself with `react-markdown` + fine-grained
   `shiki` + `diff`.
4. **Canvas:** tldraw's `display:none` culling with a `canCull()` opt-out, its modal
   select-then-interact gate, React Flow's `nodrag`/`nowheel`/`nopan` classes, and
   `markEventAsHandled` over `stopPropagation`. Do not add tldraw as a dependency. Re-examine
   M103's `<webview>` in the transformed layer against Electron's own deprecation notice.
