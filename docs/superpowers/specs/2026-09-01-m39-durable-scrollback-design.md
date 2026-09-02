# M39 — Durable scrollback

**Status:** designed 2026-09-01. Required for 1.0 by the scope amendment
(`2026-09-01-v1-scope-decision.md` §7, feature 4 — the gate search and the
handoff edges both stand on).
**Backlog entries:** #30 (durable scrollback), #31 (the secrets rule — the
scrubber lands here, its first customer in M48), #53 (the card's tail, the
dormant half).

## What this milestone is for

M4b made the canvas restore what was there last time, and the backlog's
closing section states the consequence nobody designed for: a restored
panel's xterm buffer is EMPTY. `tail()` returns nothing, so every panel on a
freshly relaunched canvas is a card reading "click to start" with no trace of
what its agent said yesterday, and anything that reads terminal content —
search, an export, a handoff — reads nothing at all on exactly the run where
the user most wants it. The session log the app already batches through one
choke point every 16 ms is never written anywhere.

## Decisions

### 1. One append per flush, main-side, in the flush

`pty-manager.ts`'s `flush()` already coalesces thousands of reads into one
send per 16 ms; the log write is ONE append beside that send, of the same
string — the elision marker included, because the log records what the
renderer was shown. Writing per read is the flood the batcher exists to
prevent; writing from the renderer means the bytes cross IPC before being
written back down to the same disk. The log is injected into `PtyManager`
(a `ScrollbackSink`), so `verify:pty-manager` observes appends through a
recorder and never touches a real file, and the real file half is proven in
`verify:file` against a temp directory.

### 2. An append stream, not `layout-store.ts`'s pattern

`main/scrollback-log.ts` keeps one file per panel, `<userData>/scrollback/
<panelId>.log`, appended asynchronously through a per-panel promise queue so
order is preserved and the 16 ms path never blocks on disk. The layout
store's write-temp-then-rename is right for a few kilobytes of state twice a
minute and wrong for a byte stream from twelve processes — copying it here
would rewrite the whole log every 16 ms. This is the app's third
"state that survives a relaunch" and it is legitimately a different shape;
the module says so where a reader will look.

### 3. Retention is the feature: a ring, a cap, a switch, a verb

- **A byte cap per panel** (`SCROLLBACK_MAX_BYTES`, 2 MiB). When a file
  passes 1.25× the cap, the queue trims it to its last cap bytes at a line
  boundary — read the tail, write a temp file, rename. Unbounded is not a
  v1 with a to-do; it is a disk-full bug with a delay fuse.
- **A setting, on by default:** `scrollback.persist` in the Sessions
  category. Its description says the two things a user needs: that recent
  output is kept on disk (up to the cap per panel) so a restored panel can
  show it and search can find it, and that agents print secrets — which is
  the honest reason the switch exists. Off means no appends and the tail
  answers nothing; existing files are left until cleared.
- **A verb:** "Clear scrollback logs" in the palette, destructive and
  confirm-gated, over `scrollback:clear`.
- **A closed panel's log is dropped** in `kill()`, beside the baseline and
  the session pin: the panel is gone, search over closed panels is not a
  1.0 promise, and this is what keeps the directory bounded by the canvas.
  Restart-in-place therefore starts a fresh log, which matches the fresh
  process.

### 4. The dormant card shows its tail

`PanelCard` today branches on `session.spawned`: a spawned panel shows
`handle.tail(6)`, a dormant one "click to start". A dormant panel now asks
main once for `scrollback:tail` (the last 6 non-empty lines, ANSI-stripped
main-side) and shows them above "click to start", through a per-panel store
(`scrollback-store.ts`) that fetches on first subscribe and never bumps
`registry.version()`. A dormant panel with no log (persistence off, or a
panel that never spawned) shows exactly what it shows today. This is the
half of #53 the log makes free; the `serialize`/`capture-pane` sources it
proposed are not built.

### 5. The scrubber is written here, and applied nowhere yet

`shared/redact.ts` exports `redactSecrets(text)`: a pattern-based scrubber
for the well-known shapes — AWS access keys, GitHub tokens, `sk-`-prefixed
API keys, Slack tokens, bearer headers, JWTs, private-key blocks — returning
the text with each match replaced by a labelled placeholder and a count.
It is written in this milestone because #31's rule is that the answer must
exist BEFORE a feature moves a byte off the panel, and M39 is the first that
does; it is applied by nothing in this milestone because the log stays local
and #31's own guidance is redact what leaves the machine, mark what stays,
and never touch the live terminal. M48's export and the diagnostics bundle
are its customers. Detection is heuristic and fails toward the user: a
placeholder names what it replaced, and nothing is dropped silently.

`shared/ansi.ts` exports `stripAnsi(text)`, which the tail uses and which
search will use; it lives in `shared/` because the renderer's card and
main's tail both need one answer.

## What it must not break

- **`registry.version()` carries nothing higher-frequency than it does
  today**; the card's tail rides its own per-panel store.
- **The flush-before-exit ordering**: the last flush's append lands before
  the exit is announced, so the error explaining an exit is in the log.
- **The bell scan and the byte cap** in `enqueue` are untouched; the log
  sees the flushed string after both.
- **Nothing in the renderer touches `fs`**: two invokes, both main's.
- **`pty.kill` keeps two callers; `registry.dispose` five sites.**

## Verification

- `verify:pty-manager` `scrollback.1`: with a recording sink, a process that
  prints three lines yields appends whose concatenation contains all three
  and whose count equals the number of `pty:data` sends; `.2`: the sink's
  `drop` is called on `kill()`; `.3`: with the sink reporting disabled, no
  append is made.
- `verify:file` `scrollback.1–.5`: append then tail returns the last N
  non-empty stripped lines; the tail of a missing panel is `[]`; a file
  pushed past 1.25× the cap is trimmed to ≤ the cap at a line boundary and
  the newest bytes survive; `drop` removes one file and `clearAll` the
  directory's files; two interleaved appends to one panel land in order.
- `verify:usage` `ansi.1`, `redact.1–.3`: SGR and OSC stripped, text kept;
  each token shape replaced with a placeholder naming its kind and counted;
  ordinary text untouched with count 0.
- `verify:layout` `scrollback.1`: the setting, boolean, default `true`.
- `verify:panels` `scrollback.1`: a panel prints a sentinel line, the
  renderer reloads on the DIRECT backend (so the process dies and the panel
  restores dormant), and the dormant card shows the sentinel.
- `verify:ipc` 58; `verify:meta` 14 against both diagrams.
