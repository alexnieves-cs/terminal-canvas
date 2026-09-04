# M75 — The composer

**Branch:** `m75-composer`. **Spec:** `docs/superpowers/specs/2026-09-03-m75-composer-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m75-composer.md`. **Status:** finished 2026-09-03.

**Thesis sentence:** the half of a chat node that gives an agent context — a reference, an
image, a prompt — which is what makes a conversation node a place to work in rather than
a place to read.

## What landed

- `renderer/chat/composer-model.ts` (pure): `triggerAt` (a `@` or `/` only at a token start
  with the caret inside it), `applyCompletion`, `placeholders` / `fillPlaceholders` (a hole
  with no value stays as typed), `attachmentKind` / `imageMediaType`, `fileCompletions`
  (prefix, directories first with a trailing slash, alphabetical within, capped with a
  remainder). `verify:rail composer.1–.4` (150/150).
- `shared/transcript.ts`: an `image` `ContentBlock` — a placeholder of type and size —
  and `userMessageLine(text, images)` encoding base64 image blocks after the text; the
  CLI's echoed image block parsed to its placeholder. `AgentSessionManager.send(id, text,
  images)`; a queued send keeps its images. `verify:agent-session attach.1` (the base64 is
  asserted ABSENT from the stored turn), `attach.2` over `main/attachments.ts` (an image
  under the cap decodes; a non-image, an oversize path or data, a missing file refused by
  name). 65/65.
- IPC: `agent:send` takes `attachments` and answers `SendResult | { refused }`;
  `agent:clipboard-image` (main's `clipboard.readImage()`); both diagrams; `verify:ipc` at 76.
- The composer (`ChatNode.tsx`): the `@` list from `fs:list` of the panel's directory or the
  typed sub-path (a directory keeps the list open one level down; a file closes it; no
  match says `no matches in <dir>`, a missing directory says so); the `/` list from
  `prompt:list(cwd)` labelled by source, a saved prompt's holes filled in the popup, a
  project prompt inserted verbatim; attachment chips with a labelled remove; a paste with
  no text asks main for the clipboard image; a refused send names the attachment and keeps
  the draft; Arrow/Enter/Tab/Escape inside the popup, ⌘↩ sends.
- `chat-store.ts`'s insert bus (`insertIntoComposer`, `attachToComposer`, `takeInsert`);
  the canvas's drop verb gains the chat arm (an image attaches, a file becomes a `@`
  reference relative to the panel's directory); the palette's `Insert prompt…` row delivers
  to a chat's composer or a terminal's paste, and fills a SAVED prompt's holes first through
  the palette's text line for either front-end (backlog #27, landed for both).
- `verify:panels composer.1–.4` (276/276): the list, the insertion and the empty state; a
  png dropped through the real drop verb becoming a chip and a base64 block on the wire with
  only a placeholder in the file, a text file becoming a reference; the `/` list with a
  project and a saved prompt, the fill step, and a project prompt's `{{target}}` intact;
  the palette's `Insert prompt…` row filling a two-hole saved prompt through two text lines
  in a row and delivering to the captured chat's composer.
- A `composer` shot scene. Documents: README row; CLAUDE.md architecture note and diagram;
  suite counts; three `docs/load-bearing.md` entries; this log.

## Red first

- `verify:rail composer.*` and `verify:agent-session attach.*`: red at module scope (the
  two modules absent); `composer.4` then red alone on entry order (directories were listed
  in entry order; the check wants alphabetical within each group) — fixed in the model.
- `verify:panels`: `composer.1` red on my own wrong expectation (`src/` does not start with
  `ser`); `composer.3` THREW (`Illegal invocation` — the value setter called on a missing
  fill input) and took the block's other two checks down with it, the harness doc's rule
  in action; the check now guards the setter and prints the popup's state, which showed the
  real cause: the harness fences project prompts to known directories and stubs the
  bridge's save, so the block joins the fence and saves through the store. 275/275.

## Decisions taken while building, and why

- **Attachments resolve in main and a refusal refuses the send whole.** The renderer has no
  `fs`; and a message that went with one image missing would read as sent and be wrong.
- **Placeholders only in the transcript.** A screenshot is a megabyte; the transcript file
  and the store hold `{ type: 'image', mediaType, size }` and the CLI's own file has the
  bytes if anyone needs them.
- **A project prompt is never expanded** (M5b's decision, kept): the fill step is the saved
  library's; and it lands for terminals too, through the palette's text line — #27 whole.
- **The `@` list descends on a directory and closes on a file.** A file reference is done;
  a directory is a question.
- **No shadow on the popup.** It is inside the panel, not over the canvas (principle 4);
  `verify:styles shadow.1` said so before the critic could.
- **The chip's remove is the icon set's `Close`**, not a `×` — `verify:styles icons.1`.

## What this milestone does not do, stated

- The CLI's `initialize` answer (its own slash commands) is not read: the `/` list is the
  project's and the saved library's, which is what the spine asked for; the CLI's built-ins
  (`/compact`, …) typed into the composer go to the CLI as text, which handles them as it
  does in a terminal — not measured.
- `@` references are text the agent reads as a path hint; the CLI's own `@`-mention
  semantics in headless input are not relied on.
- A real image reaching the real CLI, and the clipboard paste on a real keyboard: on the
  manual-only list.

## The visual loop

**The critic** (briefs + the `composer` PNG, fresh context). Accepted: the completion popup
had no header saying WHAT was listed (now `FILES IN <dir> · N`, with hairline rows and the
matched prefix marked); the attachment chip read as a button (now a dim mono line, `image ·
name · size · remove`, the verb a text control); the placeholder was a sentence (now `your
next message (⌘↩ sends)`); a tool row's argument was the whole path (now `toolArgument`
keeps the last two segments, `…/src/server.ts`). Declined: a shadow under the popup
(principle 4, and `verify:styles shadow.1` would have said so); a send button inside the
textarea (every control stays named, outside the field).

**The verifier** (spec + diff, fresh context): "delivered with gaps". Accepted and fixed:
an image-only send carried an empty text block (`userMessageLine` omits it; `attach.1b`);
the `@` list said `no matches` while the listing was in flight (a `pending` state renders
`listing <dir> …` — three states); a hole typed into and cleared inserted `''`
(`fillPlaceholders` treats an empty value as absent; `composer.2`); the draft was cleared
only when the send resolved (cleared now, restored on refusal); the clipboard image crossed
the bridge uncapped (main refuses above the cap, by name); a dead guard in `triggerAt`
removed; the base64 size ignored padding. **The palette's multi-hole chain was UNVERIFIED
and broken**: `Palette.tsx` closes before calling submit, so the second hole's mode was set
on a closed palette and wiped — `composer.4` was written red, the chain now reopens the
palette for every hole, and writing the check found a second defect: a click into the
composer's own textarea never focused the chat, so the palette captured whichever terminal
was focused before. Both fixed. Declined with reasons: the dropped chip's size (the renderer
has no filesystem; a channel for a decoration is not worth one — spec amended, the size is
a pasted image's); `attach.2` cannot distinguish stat-first from read-then-check (a sparse
fixture would; recorded as a limit rather than built).

## Verification

Run alone, after the tmux verify server was killed: `npm run verify` green end to end —
`verify:rail` 150/150, `verify:agent-session` 65/65, `verify:styles` 22/22, `verify:ipc`
76 channels, `verify:panels` 276/276 (the composer block's four checks among them). The
`composer` scene re-shot after the fixes and read: the header, the marked prefix, the
attachment line, the placeholder.
