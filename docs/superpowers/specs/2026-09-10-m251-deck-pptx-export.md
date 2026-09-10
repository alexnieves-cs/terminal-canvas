# M251 — a Markdown deck, exported to .pptx

## Why
A person drafts a talk where they already write — a Markdown file on the canvas — and needs it
in the format the room uses. The export is an OUTWARD door, so it passes the gate, and it must
never quietly differ from the file: what a slide cannot hold is named, not dropped.

## What a deck is
A **view of a file panel** (`FileSource.deck?: true`), never a new kind — the reason `prose` is
not one: a note is a Markdown FILE, and so is a deck. `true` or ABSENT; a malformed value warns
and drops the field, keeping the panel (`parseFileSource`). It travels in a portable file field
by field, beside `prose`.

Syntax (`shared/deck.ts`), the one people already write:
- a line that is exactly `---` outside a code fence starts a slide;
- the first heading is the **title**; a second heading is reported, not guessed at;
- `-`/`*`/`+`/`1.` items are **bullets**, nesting by two spaces, numbering kept;
- `![alt](path)` on its own line is a **picture**, resolved against the deck's folder;
- everything after a line starting `Note:` is the **speaker notes**;
- plain lines are body paragraphs, inline marks stripped.

Unmappable, and reported with its slide: a table, a code block, raw HTML, an extra heading, a
remote picture — and, decided at export time, a picture path that is missing, too large, or
**not an image by its magic number** (M181's `readImage`).

## The export (main)
`main/deck-export.ts`, injected (dialog, reads, write) and plain-node tested with the real
pptxgenjs@4.0.1. Main reads the file itself — the renderer hands over a PATH, never text.
Every string entering the file is scrubbed **field by field** with `redactSecrets` and counted;
pictures travel as bytes and are never called redacted. The file is added to `gate.2`'s named
caller list. Result: `written | cancelled | empty | failed`; `empty` never opens the dialog.
The sentence: `Exported N slides to … · K secrets scrubbed · M things not exported: <names>.`

## Four doors
`export-deck <panel>` — not destructive (no path argument; the dialog names the file).
Canvas: *Export to PowerPoint…* in the ⋯ menu of a Markdown file panel, beside *Show as a
deck* / *Show as a file*. Palette: `deck.export`, disabled by name without a file selection.
Agent: `tc plan export-deck f1`. Workflow: an action node whose line is `export-deck f1`.

## Checks
`verify:deck` (new, plain node): parse arms, bullets and numbering, notes, fence-safe split,
the named unmapped list; a real .pptx unzipped — four slides, notes word for word, one embedded
picture and none for the impostor, the planted token nowhere, count 1 in the sentence; cancel,
missing, empty; the layout flag's three states. `verify:verbs gate.2` names the seventh caller;
`closure.v9.1` covers the verb; `verify:ipc` re-pinned to 135.
