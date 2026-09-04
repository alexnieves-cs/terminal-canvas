# M83 — Memory

**Status:** design, 2026-09-04. **Branch:** `m83-memory`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 7 (three states), 9 (a row names the fix); 2.0
principles 10 (three natures, one canvas), 11 (one vocabulary), 12 (a record is a fact).
**Thesis sentence:** what this repository has already decided, tried and failed — written
where every agent in every panel can read it, and where a person can read it too.

## What this milestone is for

Each agent on the canvas starts from nothing. What was decided last week, what was tried and
did not work, which approach was abandoned and why — none of it survives a panel's close, and
a new chat asks the same questions again. M83 adds a PROJECT-SCOPED memory: an append-only
store keyed by repository root, written and read through control verbs so any agent in any
panel can use it, rendered on the canvas as a document node, and carried into a chat's first
message as context.

## Design

### The store (`main/memory-store.ts`; verify:file)

- One append-only JSONL per repository under `userData/memory/<slug>.jsonl`, where the slug
  is the repository root with its separators replaced (the scrollback log's own shape, one
  file per subject).
- An entry is `{ kind: 'decided' | 'tried' | 'failed' | 'note', text, panelId?, at }`. An
  unusable kind is refused BY NAME, never coerced; empty text is refused.
- **Every write passes `redactSecrets`** — the scrubber M39's export already uses — and the
  setting's description says so. What is redacted is replaced with its own marker, never
  dropped silently, so a person reading the file can see something was removed.
- `MEMORY_MAX` (500) entries per repository, ring-trimmed on write like the scrollback log;
  `list(root, limit)` returns the newest first; a repository with no file is EMPTY, never an
  error. A malformed line is skipped and counted, never fatal — the parser rule.

### The verbs (`control-protocol.ts`, `control-handler.ts`; verify:control)

- `{ verb: 'memory', op: 'list', root?, limit? }` and `{ verb: 'memory', op: 'add', root,
  kind, text, panelId? }`. `add` is the first control verb that WRITES, and it writes only
  into this store: it cannot spawn, focus or run anything, and a `command` key is refused as
  everywhere. `list` answers `{ ok: true, memory: { root, entries, skipped } }`.
- `tc memory list` / `tc memory add --kind decided --text "…"` through the same CLI.

### The panel (`memory` — the seventh kind)

- A DOCUMENT kind, sessionless: it never reaches `assignTiers`, `registry.ensure` or the live
  budget, exactly as the review/file/toolbox/Jira kinds do not. Its source is
  `{ root }`; its body is the entries newest first, each `kind · text · time`, with an
  `Add…` line that writes through the same verb main uses. Its far tiers render through
  `PanelFrame` like every other kind, with `memory` as the summary word.
- The Files pane gains a `Memory` door for the selected panel's repository, and the palette a
  `Open memory…` row disabled by name outside a repository.

### The context (`useChatSessions.ts`, `chat-store.ts`)

- A chat panel's FIRST send carries the repository's recent entries ahead of the user's text,
  bounded (`MEMORY_CONTEXT_MAX` = 20 entries, 4 KB) and STATED in the panel: a line above the
  composer says `20 memories from this repository will go with your first message`, with the
  bound named. Nothing is sent that the user cannot see first.

## What it must not break

- `verify:panels 94`'s dispose-site count and the sessionless-kind rules (a memory panel
  sends no `pty.kill`).
- The control surface's refusals; the socket stays 0600.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A secret written into the store; a malformed kind coerced; a missing file erroring | `verify:file memory.1` |
| The cap dropping the newest; a malformed line killing the read | `verify:file memory.1` |
| `memory add` accepting a command; `list` for a root with no file erroring | `verify:control memory.1` |
| The node reaching tiering, or its close sending a kill | `verify:panels memory.1` |
| The first send carrying memories the panel never said it would | `verify:panels memory.1` |

## Manual-only, added

- A real agent calling `tc memory add` from inside a panel.
