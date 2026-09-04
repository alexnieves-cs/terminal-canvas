# M77 — Tool calls as inspectable objects

**Branch:** `m77-tool-objects`. **Spec:** `docs/superpowers/specs/2026-09-03-m77-tool-objects-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m77-tool-objects.md`. **Status:** finished 2026-09-03.

**Thesis sentence:** a tool call is a thing that happened to a file, and the canvas already
knows how to show what happened to a file.

## What landed

- `shared/tool-index.ts` (pure): `toolFilePath`, `indexToolFiles`, `relativeToRoot`,
  `matchReviewPath`, `touchesByPath`. `verify:review tools.1` (95/95).
- Main: `agent:create` fires `captureBaseline(panelId, cwd)`; `agent:dispose` with `drop` drops
  it; the startup sweep counts every saved chat as surviving.
- The pure models: a chat tool row carries `file`; a review row carries `touches`; the
  inspector model and the palette row carry `reviewable` + `reviewReason` per kind
  (`REASON_CHAT_NO_BASELINE`). `verify:rail tools.1–.2` (155/155), `verify:palette tools.1`
  (120/120).
- The surfaces: the Changes section answers for a chat (the sessionless gate excludes chats;
  `selectedSpawned` reads the chat store); `Open review` in the pane and the palette gate on
  `reviewable`; `openReview` accepts a chat subject; the review node reads the subject chat's
  turns through the store and shows `· N tool calls` on a row and the list when expanded; a
  tool row naming a file gains `diff`, a three-state body in the review node's line idiom.
- `verify:panels tools.1–.2` (280/280): a chat restored in a real repository with a seeded
  transcript; the baseline lands before the harness edits the file; Changes lists it; the
  node's row counts and lists the Edit; the Edit row's `diff` shows the added line, the Read
  row's says unchanged.
- A `tool-objects` shot scene. README row; CLAUDE.md note and counts; verify-suites counts;
  three `docs/load-bearing.md` entries; this log.

## Red first

- `verify:review tools.1`: red at module scope (the module absent). `verify:rail tools.1–.2`,
  `verify:palette tools.1`: red on the missing fields.
- `verify:panels tools.1–.2` red on their first run against the finished surfaces — for a
  reason the checks were written to find and I had not predicted: git reports the repo root's
  REAL path and the tool's `file_path` is the logical one, so no touch matched and the Edit
  row's `diff` said `unchanged` (a confident wrong answer). `matchReviewPath` and its case in
  `tools.1` came from that.

## Decisions taken while building, and why

- **One capture path.** `agent:create` calls the terminal's `captureBaseline`; the store's
  once-only guard and the epoch poisoning come for free.
- **A chat's baseline survives a relaunch**, the opposite of the terminal's rule, because a
  chat resumes the same conversation.
- **Touches read from the chat store in the node itself** (`useChat(subjectId)`), so the node
  re-renders as turns land and Canvas gains no per-panel hook.
- **`unchanged` is an answer**: a `Read` row's `diff` most often says so, and that is true.
- **`reviewable` is per kind with its own reason**, not a chat forced through `restartable`.

## What this milestone does not do, stated

- A tool call on a file outside the repository has no diff to show; the row says `unchanged`
  when the change list has no row for it, which is the change list's answer, not the file's.
- The relaunch-survival rule is main-only wiring; no harness boots main's startup sweep.

## The visual loop

**Before any critic**, the first `tool-objects` scene showed the chat's row saying `this diff
could not be read` beside a node showing the diff: `review:panel` answers `shared` when several
panels share the repository, and the row handled only `changes`. Fixed (and `clean` mapped to
`unchanged`). The touch list rendered beside the row rather than under it (moved after the
discard control so the row's wrap places it), and the scene leaked state from the scenes
before it (reordered ahead of them).

**The critic** (briefs + the PNG, fresh context). Accepted: the node's shared-repository
sentence contradicted the counts beneath it (`git changes are unattributed; tool calls are
this chat's own`, `verify:rail tools.1`); the touch list was a second shape (`Tool · time`) —
now the chat's own `Tool · input · time`; the row control gained a name; the scene shows the
chat's Changes in the pane. Declined as prior milestones' designs outside this scope, recorded
for the backlog: the review node's missing pill and its full-width root path (M9c/M69), the
git plumbing lines above `@@` and content-width bands (M9c), `Restart`/`Save as preset` on a
document node's bar (M68), the refresh glyph without text, the selection hue check.

**The verifier** (spec + diff, fresh context): "delivered with gaps". Accepted and fixed:
the suffix rule could count another repository's `src/a.ts` (gated on the root's last
segment; a wrong-match fixture in `verify:review tools.1`); two definitions of "has run"
(`chatHasRun`, one helper for the pane and the palette); the harness's dispose did not drop
the baseline (it does, and `tools.2` asserts the record is gone after close); the panels
fixture had no Bash row (it has one, asserted verb-less); the diff body's state collapsed
`binary`/`unavailable` into `diff` (distinct now). Recorded as limits in the spec: a chat
outside a repository, an imported conversation's baseline, the relaunch sweep being main-only
wiring, a `Read` counted as a touch by design. Declined: a review node moved to another
workspace shows no counts (the chat store is per renderer; the node re-reads when the chat
is mounted), and `useChat` on a terminal subject creates no store entry (it reads through
`getChat`'s empty default).

## Verification

Run alone, after the tmux verify server was killed: `npm run verify` green end to end —
`verify:review` 95/95, `verify:rail` 155/155, `verify:palette` 120/120, `verify:panels`
280/280. The `tool-objects` scene re-shot five times and read.
