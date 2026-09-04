# M75 — The composer

**Status:** design, 2026-09-03. **Branch:** `m75-composer`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 3 (identity leads, paths from the left), 6 (every
control says what it is), 7 (three states), 9 (a disabled row names the fix); 2.0 principle
12 (the transcript is a well; the composer is a plain textarea).
**Thesis sentence:** the half of a chat panel that is not the transcript — what makes a
conversation node a place to *give an agent context*, not only to read what it said.

## What this milestone is for

M73's composer is a textarea and two verbs. Giving an agent context today means typing a
path by hand, opening a file panel beside it, or dropping an image on a terminal that can
only take its path. M75 makes the composer do four things: resolve `@` references against
the panel's directory with a completion list; take a dropped or pasted image as an image
block in the message (main reads the bytes; nothing is written to a temp directory) and a
dropped file as a reference; offer the project's `.claude/commands/*.md` and the saved
library as `/` commands; and fill a saved prompt's `{{holes}}` before insertion — backlog
#13's chat half, #27's placeholders, and the spine's composer bullet.

## Design

### The pure model — `renderer/chat/composer-model.ts` (verify:rail)

- `triggerAt(text, caret)` → `{ kind: 'file' | 'prompt'; query; start } | null`: a `@` or a
  `/` at the start of the text or after whitespace, with the caret inside the token, opens
  a completion; anywhere else (`a/b`, an email) does not.
- `applyCompletion(text, start, caret, replacement)` → the new text and caret.
- `placeholders(body)` → the unique `{{name}}` names in first-seen order (a name is
  `[A-Za-z0-9_-]+`; anything else is literal text). `fillPlaceholders(body, values)` →
  the body with every hole replaced; a hole with no value stays as typed, never blanked.
- `attachmentKind(path)` → `image` for `.png .jpg .jpeg .gif .webp`, else `file`;
  `imageMediaType(path)`.
- `fileCompletions(entries, query)` → the directory listing filtered by prefix, directories
  first, capped, each row saying whether it is a directory.

### The wire and the runtime

- `ContentBlock` gains `{ type: 'image'; mediaType; size }` — a PLACEHOLDER in the stored
  turn (the bytes never go into the transcript file), and `userMessageLine(text, images?)`
  encodes the message the CLI reads: a text block and `{ type: 'image', source: { type:
  'base64', media_type, data } }` blocks. `chatRows` renders an image block as a row
  naming its type and size.
- `AgentSessionManager.send(id, text, images?)` takes decoded attachments; the stored user
  turn carries the placeholders. `verify:agent-session attach.1`.
- `agent:send` gains `attachments?: Attachment[]` where an attachment is `{ kind: 'path';
  path }` (a dropped image — main reads it) or `{ kind: 'data'; mediaType; base64; name }`
  (a pasted clipboard image — the renderer already has the bytes). Main refuses by name: a
  path that is not an image (`only png, jpeg, gif and webp can be attached — a file is
  referenced by its path instead`), a file over the cap (`5 MB`), a missing file. The
  answer is `SendResult | { refused: string }`.
- `agent:clipboard-image` (main, `clipboard.readImage()`): the pasted image, when the menu's
  ⌘V carries no text; `null` when the clipboard holds none. The composer asks only when
  `edit:paste` arrives with empty text.

### The composer surface

- **References.** Typing `@` opens a completion list under the caret: `fs:list` of the
  panel's directory (or of the typed sub-path), filtered by the token, directories first
  with a trailing `/`, at most twelve rows plus `+N more`. Enter or Tab accepts; the inserted
  reference is the path relative to the panel's directory. Esc closes the list and nothing
  else. The list says `no matches in <dir>` rather than vanishing.
- **Drops.** A file dropped on a chat panel: an image becomes an attachment; anything else
  inserts `@<relative path>` at the caret. The canvas's drop handler gains the chat arm
  beside the terminal's (a chat is hit-tested the same way; the guard keeps cancelling).
  Attachments render as a dim mono line above the textarea (`image · name · 42 KB ·
  remove`; amended after the verifier: the size is known only for a pasted image, whose
  bytes the renderer holds — a dropped image's size would need a channel for a decoration,
  which is not worth one), and go with the next send.
- **Paste.** ⌘V with text inserts it (M73); ⌘V with no text asks main for a clipboard
  image and attaches it as `pasted image`.
- **Commands.** Typing `/` opens the prompt list: the panel directory's project prompts and
  the saved library, each row labelled by source. Picking a project prompt inserts its body
  verbatim (never expanded — M5b's decision, kept). Picking a saved prompt with holes opens
  the fill step in the same popup: one field per hole, Enter to insert the filled body.
- **The palette's prompt rows** (`Insert prompt…`) work for a captured chat panel — the body
  goes to that panel's composer through one `insertIntoComposer(id, text)` verb — and the
  fill step applies to a saved prompt with holes whether the target is a chat or a terminal
  (the palette's text-input mode, one hole per line, like the note's own prompt). That is
  backlog #27's placeholders landing for both front-ends at once.
- Every popup row is a labelled control; the textarea keeps `Send` and `Interrupt` as
  M73 left them; the disabled reasons are unchanged.

## What it must not break

- The drop guard keeps cancelling `dragover` and `drop` (`verify:canvas` 5/6).
- A project prompt is never written and never expanded.
- No bytes of an image reach the transcript file or the store: placeholders only.
- The composer's Cmd+Z limit stands (recorded in M73).

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| `a/b` or an email opening a completion | `verify:rail composer.1` |
| A hole with no value silently blanked; a project prompt expanded | `composer.2`, `verify:panels composer.3` |
| An image's bytes stored in the transcript | `verify:agent-session attach.1` |
| A non-image attached as an image, or a huge file read into memory | `verify:agent-session attach.2` (the pure cap and kind), main's refusals |
| The completion list vanishing on no match | `verify:panels composer.1` |
| A dropped image landing as a file panel instead of an attachment | `verify:panels composer.2` |

## Manual-only, added

- A real image reaching the real CLI (the wire is measured only against the fake runner;
  the CLI's acceptance of a base64 image block in stream-json input is the SDK's documented
  contract, not observed here).
- Clipboard image paste on a real keyboard (`clipboard.readImage()` is main's; no suite
  drives the menu).
