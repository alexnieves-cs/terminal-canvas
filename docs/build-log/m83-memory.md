# M83 — Memory

**Branch:** `m83-memory`. **Spec:** `docs/superpowers/specs/2026-09-04-m83-memory-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m83-memory.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** what a repository has already decided, tried and failed, kept as one
list that people and agents write to through the same door — so the next agent starts where
the last one stopped instead of re-deriving it.

## What landed

- `main/memory-store.ts`: one append-only JSONL per repository under `userData/memory`, named
  by the root's slug (the scrollback log's shape). `redactSecrets` on every write, with the
  entry carrying its own `redacted` count; named refusals for an unknown kind, empty text and
  a missing root; ring-trim at `MEMORY_MAX` (500); `list(root, limit)` newest first; a
  malformed line skipped and counted; a missing file EMPTY, never an error. `dir` and `now`
  injected — `verify:file memory.1` drives the real store under plain node.
- The control surface's sixth verb: `{ verb: 'memory', op: 'list' | 'add' }`, both doors,
  through the shared parser that still refuses `command`. `tc memory list` / `tc memory add
  --kind decided --text "…"`. `verify:control memory.1`. This is the FIRST control
  verb that writes, and it can write nothing but this store.
- The seventh panel kind: `panels.ts` (`MemoryPanel`, `isMemoryPanel`, and the clause added
  to `isTerminalPanel`'s positive partition), `layout-schema.ts`'s parser arm and its named
  drop, `MemoryNode.tsx` (three states, the add line, the refusal line, refresh), the rail
  and inspector words, `KindMemory` in the icon set.
- Two doors, each disabled by the same named reason rather than hidden: the palette's
  `Open memory…` row and the Files pane's memory control (`REASON_NO_REPO_MEMORY`).
- `memory:list` / `memory:add`, in `ipc-contract.ts` and BOTH diagrams; `verify:ipc` at 82.
- The chat's first-send context: `renderer/chat/memory-context.ts` (`MEMORY_CONTEXT_MAX` 20
  entries, 4 KB) carried ahead of the user's text on the FIRST message only, with the count
  stated above the composer before it is sent.
- `verify:panels memory.1`, `memory.2` and `memory.3`. A `memory` shot scene. Documents: the
  README row and diagram, CLAUDE.md's architecture note, diagram and suite counts,
  `docs/verify-suites.md`, four `docs/load-bearing.md` entries, the dead-end audit entry.

## Red first

- `verify:file memory.1` and `verify:control memory.1`: red at module scope, the store absent.
- `verify:panels memory.1`: red, then red twice more for harness reasons the suite's own
  rules already name — the kill recorder is `killedPanelIds`, the on-disk read has to go
  through `memoryStore.fileOf(root)` rather than a hand-built path, and `shellControl` runs
  on CLICK (its `onMouseDown` only `preventDefault`s), so a dispatched mousedown pressed
  nothing.
- `verify:panels memory.2` was written after the context landed and watched red by
  neutering `memoryContext` alone: the note stayed honest and the wire carried nothing,
  which is exactly the half the check exists for.

## Decisions taken while building, and why

- **Main resolves the repository root, once, for every door.** The node opens on a panel's
  directory, a chat holds its own `cwd`, and `tc memory add` runs wherever the agent's shell
  was — all usually below the root. See the load-bearing entry; the failure is several
  plausible non-empty lists that never see each other.
- **A directory outside a repository keeps its own path as the key** rather than being
  refused. The store's refusals are for an absent root.
- **Redaction on the way IN.** The file outlives the app; a token scrubbed only on read is a
  token on disk.
- **The note is keyed on the turn count**, so it makes its promise only about the message it
  is actually true of.

## What this milestone does not do, stated

- No editing or deleting an entry. The list is append-only, and the ring trim is the only
  thing that removes one.
- No search, no per-kind filter, no cross-repository view.
- The context is carried by the CHAT front-end only; a terminal panel running `claude`
  gets nothing automatically, and its agent reads the memory with `tc memory list`.

## The visual loop

**The critic** (briefs + PNGs, fresh context) and **the verifier** (spec + diff, fresh
context): see the triage below.

## Verification

`npm run verify` run alone after the verify tmux server was killed. `verify:file` 39/39,
`verify:control` 12/12, `verify:panels` 290/290, `verify:ipc` 82 channels, and the chain's
own exit code 0.

The `memory` scene was re-shot after the fixes and read: the count in the chrome row, the
left-truncated root, the mono entries, the caps kind labels, the kind-aware placeholder.

## Triage: the critic

**Accepted and fixed.** The chrome row had no fact where every other document kind states
one (now `3 remembered` / `nothing yet` / `…`, the three states). The repository line was
truncated from the RIGHT, cutting the only part that says which repository it is (now
left-truncated, `…/parent/repo`, with the full path as its title). The kind select read as a
filter under a list whose every row begins with a kind (the field's placeholder now names the
verb in the selected kind's words). The list was the app's only sans-face well (now mono, with
the kind labels dropped to the caps micro size). The hairline under the last row read as a
table that was cut off (now removed). The `memory` glyph was an empty rounded square (now the
three-line mark the extended brief specifies).

**Declined, with reasons.** *A coloured state edge and a distinct state word.* A memory node
is a document kind: it paints the neutral `kind` tone and states its kind, exactly as the
review, file, toolbox and Jira nodes do. Giving one document kind a state edge of its own
breaks the partition the whole vocabulary rests on. The repetition the critic read in the
status strip (`memory · repo` + `memory`) is the rail label beside the state word, and it is
the same on every document kind. *Trigger words on the two edges touching the node.* M78's
midpoint labels state a HANDOFF's rule; these are plain links, which have no trigger to
state, and inventing one would describe a rule that does not exist. *The chat's memory note
being off frame.* Real, and the scene's stated intent was the thing at fault: the chat in
that scene already has a history, so the note is correctly absent. The intent now says so.

## Triage: the verifier

Verdict: delivered with gaps. **Accepted and fixed, each with the check that now holds it:**

- **`tc memory` did not exist.** The spec promised it and `buildRequest` had four cases, so
  the milestone's whole "any agent in any panel" claim was unreachable; `verify:control
  memory.1` was green over it because it drives the parser and the handler, never the CLI.
  The CLI now has `memory list`, `memory add` and the `status` verb M81 also promised, with
  `--root` defaulting to the panel's own directory. `verify:control memory.2`.
- **The control door skipped the root resolution** its own comment claimed it did — an agent
  running `tc memory add` in a subdirectory wrote a file nobody else read. Both doors now go
  through `memoryRoot`.
- **The two doors were enabled from one panel and acted on another.** Watched RED: with a
  file panel selected the control lit and clicking it did nothing at all. `verify:panels
  memory.3`.
- **`slugOf` was not injective** — `/a/b` and `/a-b`, and any two paths differing past the
  120-character cut, shared one memory file. A hash suffix; `verify:file memory.2`.
- **The ring trim rewrote the live file and re-serialised only what parsed**, so a crash
  mid-write lost the memory and every skipped line was deleted permanently, taking the
  `skipped` count to 0 with it. Temp-and-rename over the newest RAW lines; `verify:file
  memory.2`.
- **The stated count and the sent block were read at different times.** The block is read
  once and held; the note states the count of the block it holds, and the send carries that
  block. A memory added after the note rendered does not ride along — asserted in
  `verify:panels memory.2`.
- **A second send before the first turn landed prepended the block twice**, the second time
  unannounced. A per-panel ref, set beside the send.
- **The byte bound counted UTF-16 units and could under-send silently.** `TextEncoder`, and
  the count returned from the block rather than taken from the entry list.
- **The node asked for 100 of a possible 500.** `MEMORY_MAX` moved into the shared contract,
  so the store's cap and the node's read limit are one number.
- **A non-positive limit answered an empty list** indistinguishable from a repository nobody
  has written about. Refused by name at the control door, clamped in the store.
- **The URL door's refusal of the writing verb was asserted nowhere.** `verify:control url.1`
  now pins it for `memory` and `status` both — this is the door an attacker can reach.

**Declined, with reasons.** *`ControlRequest.root` typed optional while `list` refuses its
absence.* The optionality is the WIRE's (the CLI fills it from the panel's directory, and a
line that omits it must parse before it can be refused); refusing it by name in the handler
is the same shape every other verb uses. *Concurrent writers.* Real, and out of scope: this
is one main process, appends are serialised, and the trim's read-modify-write window is a
known limit rather than a fixed bug — recorded here, not papered over. *Wider `redactSecrets`
coverage.* The scrubber is M39's and has its own checks; adding a second copy of them here
would pin the same rule twice.

**Found while fixing, and not from either review.** The harness's review fence returned a
partial `GitResult` (no `code`, no `stderr`), so `resolveRepo` reached
`firstLine(undefined)` and threw inside `captureBaseline`'s floating promise — an unhandled
rejection that aborted a baseline capture and printed a warning no assertion reads. It only
surfaced when a check spawned a panel outside the fences. The fence now returns the full
shape.
