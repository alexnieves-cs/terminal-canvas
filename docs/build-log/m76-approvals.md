# M76 — Approvals as a canvas affordance

**Branch:** `m76-approvals`. **Spec:** `docs/superpowers/specs/2026-09-03-m76-approvals-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m76-approvals.md`. **Status:** finished 2026-09-03.

**Thesis sentence:** the first thing the canvas lets a person DO for an agent without going
to it — answer the question it is asking, from wherever they are.

## What landed

- `main/approvals.ts`: `createApprovalTracker` (the manager's permission events → one pending
  set per panel → `agent:state` `wants-you` on entry and `idle` on empty, the M43 sink driven
  on ENTRY only, a dispose dropping the panel silently) and `createAttentionUnion` (one dock
  badge, two authors, one writer: PtyManager's child and the tracker's child, the real badge
  the SUM). `AttentionSink.notify` gains an optional body so a chat's toast is titled with the
  tool and names the panel beneath. Wired in `main/index.ts` beside the transcript writer.
  `verify:agent-session approve.1–.4` (69/69).
- `chat-store.ts` `useApprovals()`: every pending request across every chat, rebuilt on
  MEMBERSHIP change only; `rail-sections.ts` `PendingApproval` and a third argument to
  `buildAttentionRows`; `inspector-fields.ts` `ChatInspectorInput.approval` → the model.
  `verify:rail approve.1–.3` (153/153).
- `commands.ts`: `Allow <tool> · <panel>` / `Deny <tool> · <panel>` per request, `approval.none`
  disabled with `REASON_NO_APPROVALS` when nothing pends; `answerApproval` is the ONE verb every
  surface calls. `verify:palette approve.1` (119/119).
- The surfaces: `Dock.tsx` popover rows with the argument in mono and `Allow <tool>` / `Deny`
  after `jump` (a terminal's row unchanged); `Inspector.tsx` action bar leading with Allow and
  Deny on a chat, disabled by name at rest; `PanelFrame` `far` slot and the chat's summary-tier
  question; the palette rows. Every one clears through main's `permission-answered` event.
- `verify:panels approve.1–.2` (278/278): the fake runner answers an `ask:` message with a
  permission request; the pill, the rail row and the dock badge read it; the popover's Allow
  answers on the wire without moving the camera and every surface clears; the palette's Deny
  puts `denied from the canvas` on the wire; the pane's Allow leads, answers, and reads
  `nothing is waiting for an answer` after.
- An `approval` shot scene. README row; CLAUDE.md note and counts; verify-suites counts; three
  `docs/load-bearing.md` entries and one manual-only bullet; this log.

## Red first

- `verify:agent-session approve.*`: red at module scope (the module absent). `verify:rail
  approve.1–.2` and `verify:palette approve.1`: red against the missing field, argument and
  rows; `approve.2` then red on my own wrong assertion (the model carries the state INPUT, not
  the word — `panelState(...)` gives the word).
- `verify:panels approve.1–.2` were written AFTER the surfaces and proven by fault injection:
  with the tracker's `apply` commented out in the harness, approve.1 goes red on the badge and
  the rail word while the card (which reads the snapshot) still says `needs you` — exactly the
  two-authors split the first load-bearing entry describes.

## Decisions taken while building, and why

- **Main emits `wants-you` on the terminal's channel** rather than the renderer deriving a
  second attention set from the chat store: one author, and every M43 surface for free.
- **Entry-only notification**, the `syncAttention` rule, so a busy agent's second question does
  not toast while the first waits.
- **The badge union** rather than teaching PtyManager about agents: PtyManager is untouched and
  its 62 checks run against the same interface.
- **No new channel and no new setting.** `agent:answer` and `agent:state` are reused; the two
  attention toggles govern both natures (principle 11).
- **A terminal's row keeps only `jump`.** Nothing in this app can answer a question typed into
  a PTY on the user's behalf; the spec says so rather than pretending.
- **The palette rows carry the rail's label** (`chat · api`), not the internal `panelLabel`
  (`chat: /path (id)`) — noticed in approve.2's own detail output.

## What this milestone does not do, stated

- A permission request from a TERMINAL panel's agent is invisible to this app (it is text on
  a PTY); the terminal's `wants-you` stays a bell with a `jump`.
- The notification's click frames the panel; it does not answer. Answering from a toast
  would need the notification's actions API, which macOS gates behind signing.

## The visual loop

**Before any critic**, the first `approval` scene showed two defects: the card's question block
sat at the bottom of the scroll host and was scrolled out of view the moment it mattered, and
the popover row's label and `jump` collapsed beside the new verbs (a flex row, not wrapped).
Fixed: the questions live BETWEEN the well and the composer, and the row wraps.

**The critic** (briefs + the PNG, fresh context). Accepted: the card's request rendered in the
transcript's own tool-row idiom (`ASKS · Bash · npm test …` in mono, then the verbs) so the
card, the popover and the pane show one line — which also removed the sentence `claude asks
to run Read`; the well re-sticks when a question arrives so the newest assistant line is not
swallowed; the scene opens the context pane so the third surface is in the picture. Declined
with reasons: the dock badge is already `--amber` (the critic read it as red at that size);
the chat rail row's kind glyph in the dot column is M73's ruling (the word carries the tone);
`to terminal` in the chrome and the red armed close are M74's and M47's rulings, out of this
scope; the popover's shadow is M46's; `jump` as a text verb beside boxed Allow/Deny stands —
navigation and action are two registers, and the critic's own alternative (all links) would
make Allow the same weight as a jump. Both verbs now name the tool.

**The verifier** (spec + diff, fresh context): "delivered with gaps". Accepted and fixed: a
reloaded renderer lost the attention set for a still-pending question (`agent:create` now
re-syncs the tracker; `approve.4`); the exit ordering was asserted, not checked (`approve.4`
drives the REAL manager: dropped-then-exited, `idle` emitted); the deny message lived in two
places (`DENY_MESSAGE`); focusing the chat was never shown NOT to clear its `needs you`
(`approve.2` reads the badge after the focus click); the popover's Deny was not named
(`Deny Bash`); the composer's new arm and the pinned block were outside the spec (spec
amended; `verify:rail approve.3`). Declined with reasons: `approval.none` hidden at rest is
the credential rows' shape and the spec is amended to say so; the summary tier's verbs have
no automated reachability check — the summary carries no `pointer-events: none` and the
verbs stop their own mousedown, but driving the camera below `SUMMARY_ENTER` in the harness
is a scene, not a check, and is recorded as manual-only; the palette label going stale on a
rename while a request pends is accepted (the row re-labels on the next membership change).

## Verification

Run alone, after the tmux verify server was killed: `npm run verify` green end to end —
`verify:agent-session` 69/69, `verify:rail` 153/153, `verify:palette` 119/119,
`verify:styles` 22/22, `verify:ipc` 76 channels, `verify:panels` 278/278. Fault injection:
with the harness's tracker call commented out, `approve.1` and `approve.2` both went red
(badge, popover row, wire) while the pill still read `needs you` from the snapshot — the
two-authors split the first load-bearing entry describes, seen once on purpose. The `approval`
scene re-shot three times and read.
