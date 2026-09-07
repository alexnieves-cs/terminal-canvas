# Chat panels and app panels: findings

**Date:** 2026-09-07 · **Branch:** `m171-shell` · **Version on disk:** 4.0.0
**Companion:** `2026-09-07-chat-panels-and-app-panels.md` (the raw sourced research, ~40 cited URLs)

This report answers two questions asked together: "we have no Claude Code chat form" and
"the panels don't look like app panels." They have different answers. The first is false.
The second is true, and it is not the problem it looks like.

---

## 1. The premise check

### "We do not have Claude Code chat form as an option anywhere" — false

A `chat` panel kind has existed since M73 and was rebuilt to look like Claude Desktop in
M167–M170 (Act II of the in-flight v8 run). It is reachable through six doors:

| Door | Label the user sees | File |
|---|---|---|
| Palette | `New chat…` | `src/renderer/palette/commands.ts:1279` |
| Palette | `New chat (no folder) — <backend>` ×4 | `commands.ts:1299` |
| Palette | `Open as chat` (converts a live claude terminal) | `commands.ts:904` |
| Launcher | `Chat with Claude…` — hero card, middle of three | `src/renderer/canvas/Launcher.tsx:98` |
| Launcher | `Chat with Codex…`, `New chat (no folder)…` | `Launcher.tsx:140,146` |
| Spawn sheet (`⌘⇧N`) | `chat with <label>`, `chat as <teammate>`, `supervisor of this canvas` | `SpawnSheet.tsx:236-252` |

It renders as a conversation, not a terminal. `styles.css:3767` sets the transcript to
`var(--font-ui)`; `:3779` makes the user's turn a right-aligned `--bubble` at ≤75%; `:3780`
makes the assistant's unboxed prose at `--measure: 72ch`. Tool calls fold under a
`› 2 tools` disclosure. The composer is a rounded well with one filled Send. The committed
golden `verify/visual/goldens/chat.png` shows all of it.

**Why it may nonetheless feel absent — three real causes:**

1. **No native menu entry.** `src/main/menu.ts` has no chat item at all. File offers
   `New panel…`, which opens the sheet. Every other door is the palette or the launcher,
   both of which you only see if you already know to look.
2. **Silent disabling.** `claudeAvailable()` (`commands.ts:729`) needs a preset row with
   `agent === 'claude-code' && available`, sourced from main's login-shell PATH probe. If
   `claude` is not on the *login* PATH (not the interactive one), every chat door greys out
   with `REASON_NO_CLAUDE`. The doors stay visible with their reason — but a greyed row
   reads as "not built" to anyone who isn't looking for the tooltip.
3. **A stale backlog.** `docs/ideas-backlog.md:136` still says the chat panel is
   *"Still open… Next in the M71+ run."* That is four runs out of date and is the single
   most misleading sentence in the repo about current state. Fix this line.

### "The panels don't look like actual app panels" — true, and this is the real finding

There are **13 panel kinds**. Exactly one is an xterm; one is a `<webview>`; **eleven are
custom React DOM**. So the panels are not terminals. But look at `verify/visual/goldens/kinds.png`:
every kind is a flat white rectangle, hairline border, 13px title strip, text-in-a-box body.
They are typographically differentiated and structurally identical.

Two things are actually missing, and neither is "a chat UI":

- **No app chrome or app identity.** No per-kind toolbar, no accent, no icon-and-title
  treatment, no footer/status area. A panel's kind is legible only from its content.
- **Every panel is a document viewer.** Review, file, memory, toolbox, skill, work, jira,
  github — all read-mostly text. Nothing has the affordances of an *app*: an editable table,
  a form, a media surface, a manipulable graph, a drawing area. The one genuinely
  interactive kind is `browser`, and it is a webview escape hatch.

The correct framing of your ask: **the canvas has one host and thirteen hand-written guests.
There is no way for a fourteenth guest to arrive without a milestone.** That is the gap.

---

## 2. Claude Code's programmatic chat surfaces

There are exactly two supported doors. **There is no official "Claude Code UI" or webview
protocol** — the full documentation index at `code.claude.com/docs/llms.txt` has no such page.

| Door | What it is | License | Verdict here |
|---|---|---|---|
| `@anthropic-ai/claude-agent-sdk` 0.3.263 | TS SDK, streaming message types, `canUseTool` | **`SEE LICENSE IN README.md`** — Anthropic Commercial ToS, no SPDX | Do not bundle into the renderer |
| `claude -p --output-format stream-json --input-format stream-json` | Headless line protocol | n/a — you spawn a binary | **What this app already does** (`shared/transcript.ts`) |

Verified on this machine: `claude 2.1.263`, `codex-cli 0.153.4`, `copilot 1.0.83`.
Package facts verified via `npm view` on 2026-09-07.

**The rename is real and is a trap.** `@anthropic-ai/claude-code` still exists as *the CLI*.
So `npm i @anthropic-ai/claude-code` succeeds and then the import fails — you get the CLI,
not the SDK.

**Three SDK capabilities worth knowing even though you won't bundle it:**

- `listSessions()` / `getSessionMessages()` / `getSessionInfo()` — a *supported* replacement
  for M74's hand-rolled `~/.claude/projects/**/*.jsonl` glob, which is currently pinned on an
  undocumented filename rule. If you ever take the SDK dependency, this is the reason.
- `system/init.capabilities` is the documented feature-detection channel — use it instead of
  comparing version strings.
- `canUseTool` returns `{behavior:'allow', updatedInput, updatedPermissions}`, which is where
  approve-and-remember comes from. It **never fires for auto-approved tools**; a `PreToolUse`
  hook is the only way to see every call.

**Renderer detail that bites:** tool arguments stream as `input_json_delta.partial_json`
fragments you must accumulate yourself, and `stream_event`s are main-session only — subagent
text arrives only on complete messages carrying `parent_tool_use_id`.

---

## 3. ACP is the rendering contract you actually want

`zed-industries/agent-client-protocol` — 4,179★, **Apache-2.0**, schema v1.21.

This is the single highest-value finding in the report. ACP is not a transport; it is a
*specification of what an agent conversation looks like on screen*, which is precisely the
thing this app has been inventing per-backend across M90/M118/M119.

`session/update` notification kinds:

- `agent_message_chunk` — grouped by `messageId`, i.e. **your bubble-grouping rule is
  specified, not guessed**
- `agent_thought_chunk` — the `thought` toggle
- `tool_call` / `tool_call_update` — `ToolKind` is a **closed 9-value set** × 4 statuses.
  This is exactly M168's `toolVerb`/`toolState`, already standardised.
- `ToolCallContent` = `content` | **`diff`**(`path`, `oldText`, `newText`) | **`terminal`**(`terminalId`)
- `ToolCallLocation` = `{path, line}` — **the hook to drive a file panel from a chat panel.**
  A tool call that names a location can open or scroll panel #3. That is a canvas feature no
  single-window IDE can do as well, and you already have `shared/tool-index.ts` doing a
  weaker hand-rolled version of it.
- `plan` entries, and `session/request_permission`

**Two package moves to act on:**

| Was | Now | Note |
|---|---|---|
| `@zed-industries/agent-client-protocol` 0.4.5 | **`@agentclientprotocol/sdk` 1.4.0** | old one frozen since 2025-10-02; M119 points at the dead one |
| `@zed-industries/claude-code-acp` 0.16.2 | **`@agentclientprotocol/claude-agent-acp` 0.75.1** | Apache-2.0, updated 2026-09-05 |

Beware: bare `claude-code-acp` on npm is an unrelated dead third-party package.

**The licensing move this unlocks:** `claude-agent-acp` wraps the proprietary Agent SDK in a
**separate Apache-2.0 stdio process**. You get a full-fidelity Claude Code chat — diffs,
plans, permission requests, tool locations — and Anthropic's Commercial ToS attaches to a
subprocess you spawn, not to your renderer bundle. This is strictly better than either
current option, and it is the one dependency I'd argue is worth the rule-bend.

---

## 4. Open-source chat renderers — what is liftable

| Repo | ★ | License | Last push | What to lift |
|---|---|---|---|---|
| **`cline/cline`** | 67.6k | **Apache-2.0** | today | `apps/vscode/webview-ui/src/components/chat/`: `ChatView`, `ChatRow`, `MarkdownRow`, `DiffEditRow`, `CommandOutputRow`, `ExpandHandle`. **The best permissively-licensed row renderer that exists.** |
| **`siteboon/claudecodeui`** | 13.6k | **AGPL-3.0** ⚠️ | today | Richest Claude-specific renderer (`ToolRenderer`, `ToolDiffViewer`, `StreamingMarkdown`, `SubagentPanel`). Its `tools/README.md` documents a **config-driven tool-rendering architecture** — a table keyed by tool name instead of scattered conditionals. **Copy the idea; do not paste the code.** |
| `@agentclientprotocol/claude-agent-acp` | — | Apache-2.0 | 2026-09-05 | Use as-is, as a subprocess |

**Dead or closed — do not plan around these:**
`sugyan/claude-code-webui` **archived** 2026-05-29 · `RooCodeInc/Roo-Code` **archived** ·
`getAsterisk/claudia` dead since 2025-10 · `stravu/crystal` last push 2026-02-26 ·
`vibe-kanban` 2026-04-24 · **Conductor is closed-source, no repo** · `claude-squad` is a
Go/tmux TUI with nothing to lift.

---

## 5. Canvas / app-panel prior art — the mechanics

This section is about hosting arbitrary interactive apps in a transformed layer. Everything
here is a constraint you will hit.

- **tldraw is source-available, NOT MIT.** Its `LICENSE.md` obliges you *"not to use the
  Software in Production Environments"* without a license key. `npm view` confirms
  `SEE LICENSE IN LICENSE.md`. **Study it; do not depend on it.**
- **tldraw's culling model is the one to copy:** culled shapes get **`display:none`, they are
  not unmounted**, with a per-shape `canCull()` opt-out. This is the same insight as this
  repo's two-lifetimes rule, generalised beyond terminals — and it is exactly what a third-party
  app panel needs, because unmounting one destroys its state.
- **React Flow's `onlyRenderVisibleElements` unmounts and loses node state** (issues #4378,
  #4516, #5487) and has no `canCull()` equivalent. Do not adopt its culling model.
- **Reparenting an iframe destroys the child navigable *by spec*** (WHATWG HTML). This is
  why `display:none` culling is mandatory rather than merely preferable for heterogeneous panels.
- **Electron has deprecated `<webview>`**, and it has open unfixed transform bugs
  (electron#3749 double-scaling, #5968 boundingClientRect sizing). **This is a live risk to
  M103's `BrowserNode`** and should be tracked as such — it is the app's only webview.
- **Chromium caps 16 active WebGL contexts per renderer process**, with no plan to raise it
  (issues.chromium.org/40543269). This independently validates the existing `LIVE_BUDGET`.
- Worth adopting as vocabulary: React Flow's `nodrag` / `nowheel` / `nopan` class
  conventions, and tldraw's `markEventAsHandled` (they **deleted** `stopEventPropagation`
  deliberately, PR #6733 — event stopping in a canvas breaks sibling gestures).

---

## 6. Chat-UI libraries under the no-styling-dependency rule

`CLAUDE.md` forbids Tailwind, component libraries and icon fonts. Sorted by whether that rule
survives.

**Usable as real dependencies** (no CSS framework, CSP-clean, render through your own classes):

| Package | Size | License | Note |
|---|---|---|---|
| `react-markdown` + `remark-gfm` | 34 KB gzip | MIT | Renders through your own class map. Would replace `shared/markdown.ts`'s closed grammar — only worth it if you need tables/footnotes. |
| `shiki` 4.4.3 | — | MIT | **Only** via `createHighlighterCore` + `shiki/engine/javascript` — no WASM, no CDN, CSP-clean. The default full bundle is 1.2 MB gzip; never import that. |
| `diff` (jsdiff) 9.0.0 | 7.9 KB | BSD-3-Clause | Zero deps. |
| `remend` | — | Apache-2.0 | Streamdown's self-healing-markdown algorithm (closing unbalanced fences mid-stream) without the Tailwind wrapper. |

**Reference only — read the source, take the idea:**
`@assistant-ui/react` (MIT and headless, but 193 KB + Radix + zustand, and its runtime wants
to own the conversation — yours is owned by `AgentSessionManager`) · `@shadcn/react`'s
`message-scroller` — **read its scroll-anchoring logic**, which is the genuinely hard part of
a chat panel · AI Elements' `Tool` component.

**Avoid outright:** AI Elements, streamdown, `@llamaindex/chat-ui` (all hard-require Tailwind
+ shadcn CSS vars) · Monaco `DiffEditor` (97.9 MB) · `prismjs` (stagnant).

---

## 7. What this means for terminal-canvas

Ordered by value, with the honest cost.

1. **Fix the discoverability of a feature you already shipped.** A native `File ▸ New chat`
   menu item, and fix `ideas-backlog.md:136`. Near-zero cost. This alone resolves the first
   half of the question.
2. **Adopt ACP as the internal chat contract** and migrate M119 to
   `@agentclientprotocol/sdk` 1.4.0 + `@agentclientprotocol/claude-agent-acp` 0.75.1. You
   stop hand-rolling per-backend transcript shapes, you gain diffs / plans / tool locations
   for free, and the proprietary SDK stays in a subprocess. This is the highest-leverage
   item in the report.
3. **Wire `ToolCallLocation` → panel focus.** A tool call that touches a file opens or
   scrolls the file panel. This is the canvas doing something a single-window IDE structurally
   cannot, and it is the strongest argument for the whole product thesis.
4. **Give panels app chrome.** A per-kind accent, an optional toolbar row and footer slot in
   `PanelFrame`. Purely visual, touches one component, and is what actually closes the "these
   don't look like apps" complaint. Note this collides with the in-flight Act IV (M176–M179),
   which is already specced for motion, empty states and a second audit — so it belongs
   *after* that lands or *inside* its scope, not beside it.
5. **The structural item: a panel-kind plugin seam.** Today a fourteenth kind requires editing
   the `Panel` union, `Canvas.tsx`, the rail, the inspector, the palette and the layout schema.
   Nothing here is hard; it is just not *open*. Until it is, "more apps on the canvas" means
   "more milestones," and that is the actual ceiling on the idea. Copy tldraw's
   `display:none` + `canCull()` model rather than React Flow's unmounting one.

## 8. Caveats on this report

- Everything about the repo is read from source on branch `m171-shell` at HEAD, plus the
  committed goldens. I did not run the app.
- License and version facts were re-verified directly with `npm view` on 2026-09-07; star
  counts and last-push dates come from the research agent's fetches and are not independently
  re-checked.
- The AGPL status of `siteboon/claudecodeui` is the one finding where being wrong is
  expensive. Confirm it against the repo's own LICENSE file before anyone reads that code.
