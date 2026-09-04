# M77 — Tool calls as inspectable objects

**Status:** design, 2026-09-03. **Branch:** `m77-tool-objects`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 3 (identity leads), 7 (three states), 9 (a disabled
row names the fix); 2.0 principles 10 (three natures, one canvas — a conversation's edits are
the same edits a terminal's are), 12 (the transcript is a well: a tool row is a fact, and a
fact can be opened), 13 (an edge says what it does).
**Thesis sentence:** a tool call is not a line in a log — it is a thing that happened to a
file, and the canvas already knows how to show what happened to a file.

## What this milestone is for

A chat panel's agent edits files exactly as a terminal's does, and today the app cannot say
so: the context pane's Changes section skips every non-terminal kind, `Open review` is
disabled for a chat by the terminal's own reason, and a `tool_use` row in the transcript is
text. M77 joins the conversation to the review machinery M9 built: a chat panel captures a
baseline when its runtime is created, so Changes and a review node answer for it; a tool row
whose input names a file opens that file's diff against the baseline in place; and a review
node whose subject is a chat lists, on each file, the tool calls that touched it.

## Design

### The pure index — `shared/tool-index.ts` (verify:review)

- `toolFilePath(input)`: the file a tool's input names — `file_path`, `path` or
  `notebook_path` when it is a string — else `null`. `Bash` names nothing.
- `indexToolFiles(turns)`: every `tool_use` block that names a file, in transcript order, as
  `{ path, turnId, toolUseId, toolName, at }`. A `Read` IS a touch: the row says what the
  agent did to the file, and reading it is one of those things. `touchesByPath(touches,
  repoRoot, rows)`: grouped by path RELATIVE to the repository root (a tool's path is
  absolute; a review row's is relative). Amended after the first panels run: git reports the
  root's REAL path (`/private/var/…`) while an agent's cwd is the logical one (`/var/…`), so
  `matchReviewPath` also accepts the longest known row the path ends with — gated on the
  directory the row hangs from ending with the root's own last segment, so another
  repository's `src/a.ts` is never counted (the verifier's case). Null when nothing matches.

### The baseline (main)

- `agent:create` calls the same `captureBaseline(panelId, cwd)` PtyManager calls, keyed by
  the chat's panel id, so `review:panel`, `review:baseline` and `review:at` answer for a chat
  with no change to the engine. The once-only guard is the store's, so a relaunch that
  re-creates the chat does not recapture.
- A chat's baseline SURVIVES a relaunch: the conversation resumes (`--resume`) rather than
  starting over, so its starting point is still the right thing to diff against. The startup
  sweep that drops baselines whose tmux session did not survive counts every saved chat
  panel as surviving. A close (`agent:dispose` with `drop`) drops the baseline.

### The surfaces

- **Changes in the context pane** for a chat, through the same `review:panel` query with the
  same three states; the section re-asks once the runtime has a process, as it does for a
  terminal that is starting. `Open review` is gated on `reviewable` — a terminal's is
  `restartable`; a chat's is "its agent has run" (a turn completed or a process alive) — and
  disabled by name otherwise: `send a message first — a chat has no baseline until its
  agent runs`. The palette's `Open review` row gates on the same field.
- **A review node of a chat.** `openReview` accepts a chat subject; the node is minted as
  for a terminal, with the rail's label. Each file row whose path a tool call touched carries
  `· N tool calls`, and the expanded row lists them above the hunks: `Edit · 14:02`, in
  transcript order, from the durable transcript through the chat store (the node re-renders
  as turns land).
- **A tool row that names a file** (`Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, any
  tool whose input carries a path) gains a `diff` verb after `show result`. It opens, in
  place, that file's diff against the chat's baseline: `reading…`, then the hunks in the
  review node's own line classes, or one of three named answers — `unchanged against the
  baseline` (the file is not in the panel's change list), `no baseline` (the chat was created
  outside a repository, or before its agent ran), `this diff could not be read`. A `Read`
  row's `diff` most often says `unchanged`, which is the honest answer and not an error.

## What it must not break

- `verify:panels 112`: a review NODE is still skipped by the Changes section.
- The terminal's baseline lifecycle (`verify:review` 35–37, `verify:pty-manager`).
- `verify:panels 94`: no new `registry.dispose` caller.
- No new channel: `review:*` and the chat store are reused. No new setting.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A `Bash` command mentioning a path indexed as a touch; a relative path mismatching the review row | `verify:review tools.1` |
| A review row's tool-call count from another file; a chat row without its file | `verify:rail tools.1` |
| `Open review` disabled on a chat by the terminal's reason, or enabled before a baseline can exist | `verify:rail tools.2`, `verify:palette tools.1` |
| A chat created in a repository answering `never-started` to Changes; a relaunch losing the baseline | `verify:panels tools.1` |
| A tool row's `diff` showing another file, or `unchanged` for a changed file | `verify:panels tools.2` |

## Known limits, stated

- A chat created OUTSIDE a repository has no baseline record; `reviewable` says its agent has
  run, the Changes section's first arm says the directory is not a repository, and the
  palette's `Open review` runs and mints nothing — the terminal's own behaviour in `~`.
- An imported conversation (M74) is reviewable from its history, and its baseline is the
  repository at IMPORT time: the history's own edits predate it and read `unchanged`.
- The relaunch-survival rule is main's startup wiring; no harness boots it.

## Manual-only, added

- A real `claude` editing a real file and the row's `diff` showing it (the runtime is the
  fake runner in every suite; the transcript is seeded).
