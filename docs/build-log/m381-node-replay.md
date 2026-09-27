# M381 — a node's replay: the files as they stood at any moment, from its transcript

**Verdict: shipped (the model; encryption at rest is M382, and the view with its compare
is M383).** Arc 2 asks for "encrypted session replay per node: rewind any node, compare
two nodes' runs side by side, virtual filesystem at any timestamp". The record already
exists: M73's durable transcript holds every turn with its time, every Write with its
whole content, every Edit with its two strings, and every tool's result. `replayAt(turns,
t)` reads a node back as it stood at `t`:
- the conversation up to then;
- each file the agent had changed by then;
- how many shell commands had run, since they may have changed files the replay cannot
  see.

`compareFrames` puts two nodes' frames side by side, file by file.

## What landed

- **`shared/replay.ts`** (new, pure):
  - `replayAt`;
  - `replayMoments`, the stops a scrubber moves between;
  - `compareFrames`;
  - `readBase`, a whole-file Read's text or nothing;
  - `READ_BASE_MAX_LINES`.

## Decisions, and why

- **Two states, never one.** A file is `exact` when the replay KNOWS its content:
  - a Write gave it whole;
  - a whole-file Read gave the base the later edits applied to;
  - a later whole Read refreshed it.

  It is `partial` when the agent edited a file the transcript never showed whole, or
  when an edit's old text was not in what the replay held, which means the file had
  moved under it. A partial file lists its edits and why. Inventing its content would
  be the plausible-wrong answer this repository refuses everywhere else.
- **A change counts from its RESULT, never its request.** An edit the person denied, an
  edit that failed, and one still waiting at `t` changed nothing (`replay.1`: the denied
  `const a = 9` is not in the frame).
- **What the replay cannot see is said.** A shell command can rewrite any file, so each
  frame counts the ones that had finished. A later whole Read of the file is the
  replay's one way to know it again.
- **A Read is a base only when it is WHOLE.** An offset or a limit is a slice, and a gap
  in the numbering is a slice. A result at the CLI's 2,000-line default may have been
  cut, so none of these is a base. Real Read results were read off a recorded
  transcript: `12\tline`, and the older `    12→line`. A reminder appended after the
  last numbered line ends the read.
- **Compare says "cannot tell".** `same` is null when either side is partial, true or
  false only when both are exact. A path only one side changed is false.
- **Built from the transcript, not a second recorder.** Nothing new is written while an
  agent runs. Every node with a transcript, including a chat restored from last week,
  has a replay already.

## Checks

- `verify:agent-session`:
  - `replay.1`:
    - before any result, nothing changed;
    - a whole Read is a base, an edit applies to it, and a Write is exact;
    - an edit with no base is partial, with its edit and why;
    - a denied edit changed nothing.
  - `replay.2`:
    - a shell run is counted;
    - an edit whose old text had moved makes the file partial, with the reason;
    - a later whole Read makes it exact again, and it keeps its count of changes;
    - the moments are the turns' times.
  - `replay.3`:
    - compare gives false for exact and different, null for partial on either side,
      and false for a path only one side changed;
    - a slice, a gap and a Read at the line limit are never a base.

  182/182.

No display changed, so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean and the plain suites this milestone reaches
are green (see Checks). The full `npm run verify` ran once for the chain M381–M384 and
M380 on the tree holding all five; its result is in M384's ledger.

## Owed

- **M382 (proposed): the replay encrypted at rest.** The transcript log becomes
  per-line ciphertext under a key the OS keychain holds (Electron `safeStorage`). A
  plaintext line from before is still read. Plain node is checked with an injected
  cipher.
- **M383 (proposed): the Replay view.** A chat's Replay:
  - a scrubber over `replayMoments`;
  - the conversation at that moment;
  - the files, exact or partial with the reason, and a file's content at that moment;
  - two nodes side by side through `compareFrames`.
  
  Its palette row and inspector button are a person's views, like `openBoard`. It gets
  a golden with a critic.
- **A terminal node's replay.** Its durable scrollback (M36) is output over time, not
  file operations. It is its own milestone.

Next: M382 (the replay record encrypted at rest).
