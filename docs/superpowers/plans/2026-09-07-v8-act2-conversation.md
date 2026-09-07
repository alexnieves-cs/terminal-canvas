# v8 Act II — plan (M167–M170)

Branch `m167-conversation` from `main` after Act I's merge. Spec:
`docs/superpowers/specs/2026-09-07-v8-act2-conversation-design.md`. Red first per
milestone; goldens sentenced; reviews and the fix wave at the act's close.

## M167 — turns
1. Red: `verify:rail md.1` (the markdown grammar over a stub module), `verify:styles
   turns.1` (`.chat__row--user` on `--bubble` at `max-width: 75%`, `.chat__row--assistant`
   at `--measure`, `.chat__role` clipped, `.chat__when` at opacity 0 revealed on hover).
2. `shared/markdown.ts`: `parseMarkdown(text) → Block[]` (heading, paragraph, list, code,
   with inline runs: text, code, bold, italic, link). `renderer/chat/Markdown.tsx` maps the
   tree to elements; a `Copy` verb per fence through `edit:copy`'s door (the clipboard
   bridge the palette uses).
3. `ChatNode.tsx`: the user row a bubble; the assistant row `<Markdown>` inside the element
   that carries `data-chat-assistant-text` (its `textContent` is still the plain text); the
   `.chat__when` span; the live caret.
4. Goldens: chat, composer, auto, tool-objects, approval, verbs, supervisor, and every scene
   with a chat in view.

## M168 — tool rows
1. Red: `verify:rail chat-model.7` (`toolGroups`), `verify:styles tools.1` (the row's
   glyph slot, the pill, the 12-line well), agents `tools.3` (a grouped header collapsed by
   default; a dispatched click on a hidden row's diff verb expands the group and opens the
   diff).
2. `icons.tsx` + five tool glyphs; `chat-model.ts` `toolGroups`, `toolVerb(name)`,
   `toolState(row)`; `ChatNode.tsx` the `ToolGroup` component around consecutive rows.
3. Goldens.

## M169 — the composer
1. Red: `verify:styles composer.1` (the well's radius, inset shadow, the iris focus ring;
   `[data-chat-interrupt]` hidden-by-class at rest), `verify:rail composer-rows.1`.
2. `ChatNode.tsx`: the chips row, the growing textarea, Send/Interrupt swap, approvals in
   the well; `composerRows` pure.
3. Goldens.

## M170 — the agent card when it is a terminal
1. Red: `verify:rail header.3` (`agentHeader`), agents `agent-card.1` (a claude terminal's
   header carries the chat glyph and a summary line).
2. `TerminalPanel.tsx`: the summary line and glyph for an agent terminal; `PanelFrame`
   takes a `glyph` override.
3. Goldens: teammate, trail, attention, kinds.

## Close
`npm run verify` with tallies; the critic and the verifier; the fix wave; the build log
`docs/build-log/m167-m170-act2-conversation.md`; merge to `main`; README rows.
