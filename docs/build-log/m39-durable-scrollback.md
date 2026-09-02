# M39 — Durable scrollback

**Summary:** one append per flush into `<userData>/scrollback/<panelId>.log`
through a per-panel queue with a 2 MiB ring trim; on by default with
`scrollback.persist`; a dormant card shows its log's tail above "click to
start"; `stripAnsi` and `redactSecrets` written as shared modules for the
tail, search and export.
**Status:** finished (2026-09-01). Spec
`docs/superpowers/specs/2026-09-01-m39-durable-scrollback-design.md`, plan
`docs/superpowers/plans/2026-09-01-m39-durable-scrollback.md`.

## What was learned

- **The ring's bound is 1.25× the cap, not the cap.** My first assertion
  demanded the cap at every instant, which only a per-append rewrite could
  satisfy — the exact cost the append-stream design refuses. The check now
  states the real property and says why.
- **A tail window that starts mid-file can start mid-CHARACTER.** Decoding
  from there yields U+FFFD, which a card would render as a real glyph the
  agent never printed. The tail skips to the first newline in its window,
  or strips orphaned continuation bytes when there is none; `scrollback.5`
  reads with a deliberately small window so the case is actually reached.
- **The sink checks were written and implemented in consecutive edits**
  while an Electron suite held the machine; their red was observed
  afterwards by stashing the sink hunk (`appends=0 sends=1`). The
  negative-property check (`.3`, nothing appended while disabled) passes
  without the feature by construction, like `backpressure.2`; its value is
  as the twin of `.1`.
- **The verifier's one M37 gap (a hand-deleted worktree directory) was
  pinned here** as `verify:review` `worktree.10`, since this branch was
  already open.

## Evidence

- Red then green: `verify:usage` `ansi.1`, `redact.1–.3`; `verify:file`
  `scrollback.1–.5`; `verify:layout` `scrollback.1`; `verify:palette`
  `scrollback.1`; `verify:pty-manager` `scrollback.1–.3`; `verify:ipc` 58.
- `verify:panels` `scrollback.1` (end to end): red against the pre-M39
  renderer build (`logged=true restored=true dormant=true card=false`), then
  green after the store and card landed (`card="SCROLLBACK-SENTINEL-4471click
  to start"`), 205/205.
- The M38 verifier's notes landed here too: six stale "before-quit calls
  shutdown()" comments corrected, and `keep-on-quit.3` (a throwing teardown
  still flushes) added.
- `npm run verify`: see the merge commit.
