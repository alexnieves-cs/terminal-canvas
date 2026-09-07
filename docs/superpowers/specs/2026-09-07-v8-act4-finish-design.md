# v8 Act IV — the finish (M176–M179): design

Brief: `2026-09-07-m162-product-polish-brief.md` (Motion; Empty states; the five rules as the
audit's lens). Branch `m176-finish`.

## M176 — motion with intent

Five moments and no others, each on the two duration tokens: a panel spawning (`.pf__motion`
scale from `.98` with opacity, `--dur-2`, `--ease` — a keyframe run once on mount, the
`data-just-spawned` mark the canvas already stamps, or a class the frame adds for one
frame); the hover reveals (`--dur-1`: the chrome verbs, the rail's `start`, the dock's
label, the timestamp, the fence's Copy — all already on `--dur-1`); the needs-you pulse
(M109's finite breaths, unchanged); the palette opening (M109's rise, `--dur-2`); the
camera's flight (M56's curve, its own timing in `useViewport`, unchanged). Everything else
that animates or transitions is removed or moved onto a token. `prefers-reduced-motion`
removes every one (the global block already sets durations to `.01ms`; the check reads that
block exists and that no `transition`/`animation` outside it names a literal duration).

- **Check:** `verify:styles motion.2` — every `transition:` and `animation:` duration in the
  stylesheet is `var(--dur-1)` or `var(--dur-2)` (or `none`/`0s`), the spawn keyframe
  exists and scales from `.98`, and the reduced-motion block exists.
- Golden: none moves (a spawn animation ends before a capture; the harness settles).

## M177 — empty states as places

Every pane, panel kind and board column with nothing in it says what it is for and offers
one verb, in the UI face, centred, with the kind's glyph: the Panels pane (`no panels — ⌘N
to start one` stays for `empty.1`, with the hints beneath — M173), Workspaces (one
workspace, no runs, no snapshots), Files (no folder), Vault (no root), Integrations
(nothing connected), Teammates (none), Board (its four columns, M149 F.7's three states
kept), Skills (no shelf); the panel kinds: review (`clean` / `no repository`), file
(missing), toolbox (nothing found), memory (no memories), github/jira (not connected),
watcher (never ran), workflow (no runs), chat (`No turns yet…`), work (no items). One
component, `EmptyState` (`glyph`, `sentence`, `verb?`), so every empty state is the same
shape; the existing sentences are kept where a check reads them and restyled.

- **Check:** `verify:styles empty.1` — an `.empty-state` rule (centred, the UI face, the
  glyph slot) and no `*__empty` rule left setting its own face; `verify:rail empty.2` — the
  sentences as data (`EMPTY_STATES`), each ending with a verb where one exists, none a bare
  zero or ellipsis.

## M178 — the second full audit

`docs/ux-audit-4.1.md`: every golden walked on both themes with the brief's five rules as
the lens, the way M149 walked 4.0. Each finding FIXED (with the check that pins it),
DECLINED (with the rule it defers to) or OWED (with a backlog number). Fix what the walk
finds before closing the act; the goldens that change get their sentences.

## M179 — reconcile

`package.json` 4.1.0 (no seam changed: `ipc-contract.ts` is untouched by this run —
`verify:ipc` still pins 124 channels); README's status line, preamble and the M161–M179
rows as `✅ done`; `CLAUDE.md`'s preamble and load-bearing entries for the face rule, the
rest rule, the path rule, the metrics rule and the golden-sentence rule (the "What it is
supposed to be" section becomes "What it is", the rules as the standard kept); the brief's
"finished" pass (every principle implemented or struck); `docs/release-notes/4.1.0.md` with
the Gatekeeper sentence; the ledger's final evidence (`npm run verify`, `verify:packaged`,
`verify:visual`); `graphify update .`; the tag `v4.1.0`. Nothing pushed, no release.

## Declined

A spring or overshoot anywhere (the brief's ease is one curve). Animated empty-state
illustrations. Re-baselining a golden for a motion frame (captures settle first).
