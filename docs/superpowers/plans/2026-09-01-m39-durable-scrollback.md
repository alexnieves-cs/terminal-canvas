# M39 — Durable scrollback: implementation plan

Spec: `../specs/2026-09-01-m39-durable-scrollback-design.md`. Seven tasks,
check-first.

## Task 1 — The pure text helpers (`verify:usage`)

Checks `ansi.1` (SGR, CSI cursor moves and an OSC title stripped; the text
between them kept; a bare BEL removed) and `redact.1–.3` (an AWS key, a
GitHub `ghp_` token, an `sk-` key, a bearer header, a JWT and a private-key
block each replaced by `[redacted <kind>]` with the count equal to the
matches; ordinary text with a hex sha and a UUID untouched, count 0; the
placeholder never contains any character of the original token). RED. Then
`shared/ansi.ts` and `shared/redact.ts`; both join `usage-entry.cjs`.

## Task 2 — The log against real disk (`verify:file`)

Checks `scrollback.1–.5` per the spec's Verification, against a temp
directory with a space in its name. RED (no `createScrollbackLog`). Then
`main/scrollback-log.ts`: `append` (per-panel promise queue, `appendFile`),
`tail(panelId, lines)` (read the last 64 KiB, strip, last N non-empty lines),
`drop`, `clearAll`, `totalBytes`, and the ring trim at a line boundary via
temp-and-rename. Joins `file-entry.cjs`.

## Task 3 — The sink in the flush (`verify:pty-manager`)

Checks `scrollback.1–.3` with a recording sink injected as a new trailing
constructor parameter (`ScrollbackSink`: `append(panelId, data)`,
`drop(panelId)`, `enabled()`). RED. Then the parameter, one `append` in
`flush()` after the marker is prepended, one `drop` in `kill()`, and the
`enabled()` gate.

## Task 4 — The setting and the two channels (`verify:layout`, `verify:ipc`, `verify:meta`)

`scrollback.persist` (boolean, default `true`, Sessions category) —
`verify:layout` `scrollback.1` RED then green. `scrollback:tail` and
`scrollback:clear` in the contract, handlers, preload, `EXPECTED_CHANNELS`
58, both diagrams.

## Task 5 — The dormant card (`verify:panels`)

Check `scrollback.1` per the spec: print a sentinel, reload on the direct
backend, the dormant card shows it. RED. Then `session/scrollback-store.ts`
(fetch on first subscribe, per panel id, never through `registry.version()`),
`PanelCard`'s dormant branch, and `Canvas.tsx` clearing the store entry at
every panel-removing site (the rule every store obeys).

## Task 6 — The palette verb (`verify:palette`)

Check: a `scrollback.clear` row in the Canvas group, destructive, hidden at
rest, running `beginClearScrollback`. RED. Then the row and the confirm-gated
action.

## Task 7 — Close

`main/index.ts` constructs the log under `userData/scrollback` and hands it
to `PtyManager` and the handlers; `docs/load-bearing.md` (the append stream
is not the layout store's pattern; the drop-on-kill rule; the scrubber's
customer is M48); README bullet; backlog #30 → gone, #31 rewritten down to
"applied by M48", #53 rewritten down; suite counts; build log; `npm run
verify`; merge.
