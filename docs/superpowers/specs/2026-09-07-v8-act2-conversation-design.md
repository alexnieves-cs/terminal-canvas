# v8 Act II — the conversation (M167–M170): design

Brief: `2026-09-07-m162-product-polish-brief.md` (the Claude desktop app's register; finding
7). Branch `m167-conversation`. The chat panel is the one that most needs to look like the
thing it is. Every `data-chat-*` hook and every `chat__*` class a check reads stays
(`docs/build-log/m161-m179-ledger.md` lists them under Act 0's map); the material changes.

## M167 — turns

- The `YOU` / `CLAUDE` caps labels go: `.chat__role` stays in the DOM (a check reads the
  row's shape through it) but is visually hidden (`position: absolute; clip`), an
  accessible name, not a column. The row grid (`52px 1fr`) becomes a single column.
- The user's turn: a soft filled bubble on `--bubble`, `--r-lg`, aligned right, `max-width:
  75%`, the UI face at `--t-base`. The assistant's turn: unboxed prose at `--measure`, the
  UI face at `--t-base` / `--lh-body`, left-aligned.
- Timestamps on hover: a `.chat__when` in `--t-xs` at opacity 0, revealed on the row's
  `:hover` (the rest rule); the turn's time is the transcript record's `at` when it has one
  and absent otherwise (absent stays absent — no `undefined` in a string).
- Markdown, rendered by `shared/markdown.ts` — a small pure renderer over a closed grammar:
  headings (`#`–`###`), paragraphs, unordered and ordered lists, `**bold**`, `*italic*`,
  inline `` `code` ``, fenced code blocks (mono, a `Copy` verb per block that writes the
  fence's text to the clipboard through the ordinary `edit:copy` door), links rendered as
  text with the URL on `title` (never navigable from a transcript — `link:open` is a verb,
  not a click on prose). Anything outside the grammar is a paragraph. No dependency: the
  renderer is plain-node checked (`verify:rail md.1`), and its output is React elements
  built from the parsed tree — never `innerHTML`.
- Streaming: the live block ends in a soft caret (`.chat__row--live::after`, the existing
  `▍` softened to a `--fg-3` block with a slow blink under `prefers-reduced-motion: no
  blink`); no spinner anywhere.
- `[data-chat-assistant-text]` stays on the assistant's rendered text element and its
  `textContent` stays the plain text a check reads (`chat.2`, `chat.3`).

## M168 — tool rows

- One collapsed row per tool call: the tool's glyph (`icons.tsx` gains `ToolRead`,
  `ToolEdit`, `ToolRun`, `ToolSearch`, `ToolOther` — five, by the tool's name family), the
  VERB (`Read`, `Edit`, `Run`, `Search`, or the tool's own name), the target under the path
  rule (`displayPath` of the file path against the chat's cwd; a command as typed, cut from
  the right), and a state pill (`running` · `done` · `error`). The `TOOL` `::before` label
  goes. `[data-chat-row="tool"]`, `[data-chat-tool]`, `[data-chat-tool-diff]`,
  `[data-chat-tool-toggle]`, `[data-chat-tool-result]` stay.
- Click expands the result in a scrolling well capped at 12 lines (`max-height: calc(12 *
  var(--lh-body) * var(--t-sm))`) with a `show all` verb that lifts the cap; the diff verb
  stays as it is (M77's twin).
- Consecutive tool rows GROUP under one header — `worked for 2m · 6 tools` — collapsed by
  default. The rows stay MOUNTED in the DOM (`tools.1`, `tools.2`, `front.1` count and click
  them): the group is a `<details>`-shaped section whose rows are `hidden` while collapsed…
  no — `hidden` elements cannot be clicked by `elementFromPoint`, and `tools.2` clicks
  `[data-chat-tool-diff]` by dispatch, which works on a hidden element but the diff body it
  opens must be visible for `.review-node__line--add` to be counted (a `querySelectorAll`,
  which sees hidden nodes too). Decision: rows stay in the DOM and collapsed rows are
  `hidden`; a dispatched click on a hidden row's verb EXPANDS the group first (the handler
  opens the group), so a person and a script land on the same state. The duration is the
  span between the first and last tool's records (`at`); without stamps the header says
  `6 tools`.
- `chat-model.ts` gains `toolGroups(rows)`: pure, plain-node checked (`verify:rail
  chat-model.7`): consecutive `tool` rows fold into `{ kind: 'tools', rows, elapsedMs? }`
  and a single tool row stays a row (no header for one).

## M169 — the composer

- A rounded well anchored to the panel's bottom: `--r-lg`, a hairline, an inner shadow
  (`inset 0 1px 2px var(--bezel)`), the iris ring on focus. The textarea grows from 2 to 6
  lines (`rows` computed from the draft's newlines, capped; `field-sizing: content` where
  the engine has it, the count as the fallback) — pure: `composerRows(text)`.
- One filled `Send` (`.chat__verb--send.is-primary`, unchanged name — `primary.1`) at the
  right of the well. `Interrupt` (`[data-chat-interrupt]`) is PRESENT always (`codex.1`
  reads its `disabled` and `title` on an idle codex chat) and VISIBLE only while a turn
  runs, where it takes Send's place: at rest it is `hidden`-by-class (opacity 0, no
  pointer events, out of the layout flow) — the check reads attributes, a person sees one
  control. Never a fractional opacity.
- The chips above the text: the model row (`snapshot.model`, or the backend's word), the
  skills capsule (the trail's count, when a trail exists), the attach affordance (a
  paperclip icon that opens the file door M75 already has), each a quiet `.chat__chip`.
- Approvals render inside the well: one sentence (`Claude wants to run npm test — allow
  it?`) and two buttons (`Allow`, `Deny`), with `Allow for session` a third quiet verb
  (M98) — `[data-chat-allow]`, `[data-chat-allow-session]`, `[data-chat-deny]` stay;
  `data-chat-pending` on the root stays.
- The composer's placeholder becomes `Message Claude…` (or the backend's name); the `⌘↩
  sends` hint moves to the Send button's `title`.

## M170 — the agent card when it is a terminal

A `claude` / `codex` / `copilot` TERMINAL panel (`session.spec.agent` set) gets a header
identical to the chat kind's: the kind glyph is the chat's, the summary line is
`chatHeaderLine` over the panel's cwd, branch and engine (the same function, imported —
`chatHeaderLine` was already the chat's title; the visible text now comes from it too, the
drift point the Act 0 map named), the state word from the agent-state machine (already the
pill). The terminal cells are the body. A plain shell keeps the terminal glyph. Pure:
`agentHeader(spec, branch)` in `rail-rows.ts` beside `chatHeaderLine`, checked in
`verify:rail header.3`.

## Goldens

`chat`, `composer`, `tool-objects`, `approval`, `auto`, `teammate`, `trail`, `attention`,
`chat-copilot`, `supervisor`, and every scene with a chat or an agent terminal in view.
The `chat` and `auto` scene intents in `shot.cjs` are rewritten (they describe the 4.0
shape).

## Declined

A second markdown renderer for the review's hunks (M165's card keeps M9's renderer).
Avatars. A model PICKER in the composer (the sheet chooses the model; the chip states it).
Tables and images in the markdown grammar (a table is rendered as its source in a code
block; an image reference as its alt text — both said in the renderer's comment).
