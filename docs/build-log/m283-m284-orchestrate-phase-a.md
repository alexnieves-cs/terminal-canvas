# M283–M284 — Orchestrate Phase A (useful vertical slice)

The state of this run lives here, not in any session's memory. Spec:
[docs/orchestrate-reference-plan.md](../orchestrate-reference-plan.md) (Phase A row of
"Ordered delivery plan"); run prompt:
[2026-09-18-orchestrate-phase-a-run-prompt.md](../superpowers/specs/2026-09-18-orchestrate-phase-a-run-prompt.md).

- Branch `m283-orchestrate-phase-a`, worktree `../tc-orch-phase-a`, off main `f37b2b91`.
- Numbering: `M283`/`M284` were free (no hit in `docs/` outside the run prompt, none in
  `git log --all`) on 2026-09-18.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main (the splash's
  `suppressOrchestrationOnBoot`) are NOT on this branch**, by the user's choice (asked
  2026-09-18): the worktree is off committed main, those edits stay untouched in main's tree.
  Merging this branch into main needs them committed or set aside first — that is the user's
  call, not this run's.
- The spec, the run prompt and `docs/design/` are UNTRACKED in main's tree (the user's), so they
  are not on this branch; the links above resolve in main's checkout. This run does not commit them.

## Goal

Orchestrate is a separate page reached by an explicit Canvas / Orchestrate choice. The Canvas
stays mounted and unchanged behind it, and one real task can be delegated or opened, inspected
live, have its pending permission request answered, have its changes reviewed, and be jumped
back to on the Canvas.

## Exit criterion (stop here)

From the plan: *delegate or open one task, inspect live work, answer a real pending request,
review changes and return to an unchanged Canvas.* Shown by driving the real app, with what
was seen recorded below; then `npm run verify`, every red reported.

## M283 — Canvas / Orchestrate page boundary

- [x] Explicit Canvas / Orchestrate navigation choice — ALREADY EXISTED (M268 TopBar segmented
      `Canvas | Orchestrate`, M279 primitive; the Dock's Orchestrate button). Reused, not rebuilt.
- [x] Canvas host mounted while covered (M268 already), now `inert` — out of the tab order and
      deaf to clicks and keys. The focused element inside it is BLURRED explicitly in a layout
      effect: Chromium's inert focus fixup is lazy, and until it runs the terminal's textarea still
      takes a trusted keystroke.
- [x] `Cmd+V/C/Z` reach no hidden terminal: they are menu IPC (no renderer keydown), so `inert`
      cannot stop them — `shouldIgnoreKeys` now reads `canvasCoveredRef` first. The nav grid is
      disabled over Orchestrate (it mounts inside the covered host and its release switches workspace).
- [x] Return restores focus to the element that had it inside the host, only when nothing else took
      focus meanwhile; an explicit "Open on canvas" clears it first (else typing lands in the OLD
      terminal while the jump selected another object).
- [x] Palette over Orchestrate: it mounts inside the covered host (opacity 0 — an invisible field
      eating keystrokes on main today), so opening it (Cmd+K, the top bar's search) returns to Canvas.
- [x] Orchestrate prefs independent: `orchestration/orchestration-prefs.ts`, module-level and in
      memory — camera, mode, lens and side tab survive the toggle; nothing the canvas owns reads or
      writes it. The SELECTION is deliberately not kept: a first cut kept it, and the golden critic
      saw it re-aim the pool, the commands and the feed at a session the user had left — the plan's
      stale-target hazard.
- [x] Hidden side regions: under Orchestrate the navigator, file tree and canvas inspector are
      ZERO-WIDTH columns (never display:none), so Tab walked into the hidden inspector, whose primary
      action is a terminal's Restart — found by orch-page.4, fixed by making those roots inert too.
- [x] Checks: `verify:panels:shell orch-page.1–.6` (Electron, trusted input, ptyManager write/resize
      spies); `verify:orchestration orch-page.src.1` pins the three lines by text.

Harness lessons (M283), each measured, each cost a run:
- A hidden harness window gets NO focus/blur events until `wc.focus()` — `activeElement` still moves,
  so a check reads "focused" while every focusin listener stays silent. The focus-restore record
  read null until the check focused the page the way its sibling checks do.
- The canvas host node is re-created while Canvas stays mounted; a listener bound to it once goes
  stale. The record is kept by DOCUMENT focusin/focusout, tested against `hostRef` at event time.
- A Radix focus scope on Orchestrate returns focus to a body-level `data-radix-focus-guard` in its
  UNMOUNT (passive) cleanup, after any layout effect: the restore runs in a zero-delay timeout
  (a hidden window throttles frames, so not rAF).

## M284 — One real task island

- [x] Task island (`orchestration/orchestration-island.ts`, pure): the canvas's focused task (first
      `working`, else `review` — the same pick as `taskMemberIds`), labelled goal · repository ·
      own-worktree branch or a SAID shared directory; with no such task, the first agent session.
      Rendered as the scene's task card, which now SELECTS the task (was: jumped to canvas): one
      line `Task · <stage> · N sessions`, the goal, the mono repository line — no stage bars (the
      stage is the word), so the card is no taller than the one it replaced and never covers the
      ring's back cubes or their needs-you beacons. In the List it leads the table instead of floating.
- [x] Inspector (side column): identity, state, next action for the selected session, or for the
      task when nothing is selected. Next action reads recorded state only; idle = review, never done.
- [x] Needs attention: `useApprovals()` rows keyed by `(panel id, requestId)`, answered through
      `paletteActions.answerApproval` (the Dock/palette/inspector executor); a row leaves when the
      store drops the request (answered anywhere); a local sent-set plus main's own
      `answerPermission` guard make a double click one wire answer.
- [x] Output: the existing `useOrchOutput` (scrollback:tail / lastAssistantText, through outward),
      tab relabelled Output. No PTY resize, no watch.
- [x] Review tab: `review.panel` / `review.baseline` / `review.diff` for the selected subject (the
      task's lane chat when the task is inspected), answers tagged by subject and dropped if the
      selection moved; `shared` says authorship is ambiguous. Read-only; commit/discard stay on the
      review node ("Review on canvas" → `openReview`).
- [x] Open on canvas: the inspector's labelled button; Enter now INSPECTS (focuses that button)
      instead of jumping.
- [x] List lens (Scene | List, kept in the prefs): every roster object, island members first and
      marked, rows are buttons; Arrow keys move selection and, in the List, focus.
- Checks: `verify:orchestration orch-island.1–.3, orch-attn.1, orch.gate.3`;
  `verify:panels:agents orch-task.1–.7` (real fake-runner chat, real git repo, answers read off the wire).

## Exit demo (what was seen driving the real app)

Driven 2026-09-18 through the real built renderer and main's real IPC handlers (the panels
harness: real `AgentSessionManager`, real git, real review engine), with the one disclosed fake —
the agent CLI is the harness's recorded-turn runner, so no model was called. The window was
captured at each step (`TC_DEMO_SHOTS=<dir>`, opt-in, read by no check) and LOOKED at. A hidden
window's `capturePage` can return the last PAINTED frame, one step behind the DOM (the step-2
capture showed the Scene lens after the List was chosen) — where a capture and a check disagree,
the check's DOM read is the fact recorded here:

1. **Delegate / open one task** — a chat started in a fresh git repository; on Orchestrate the
   island card read `SESSION · NO TASK YET`, the chat's name, and `<repo folder> · shared
   directory` (no worktree, said rather than hidden), floating over the diorama beside the ring.
2. **Inspect live work** — selecting the chat in the List marked the row, the scene's roster row
   and filled the inspector: name, `idle`, `chat · c1 · in <task>`, `Next: Review its changes`,
   Open on canvas / Review changes.
3. **Answer a real pending request** — `ask:` raised a real `can_use_tool` request; Needs
   attention showed `wants to use Bash · ls -la` with Allow / Deny, the inspector flipped to
   `Next: Answer the Bash request`. Allow (clicked twice) put exactly ONE `control_response` for
   that request id on the process's stdin; the row left; the page stayed on Orchestrate. A second
   request answered from the Dock's popover left Orchestrate's queue the same way.
4. **Review changes** — the Review tab read `1 changed file · +1 −0 since this session started`,
   listed `app.txt`, and its diff showed `+changed by the task` in green.
5. **Return to an unchanged Canvas** — `orch-page.2` measured viewport `{x:120,y:120,scale:1}`,
   every panel's rect, the unsaved Monaco draft (`unsaved draft line`, dirty), the sessions and the
   terminal's `93×25` identical before and after, with zero pty resizes and zero pty writes while
   Orchestrate was up; the before/after captures show the same frame (the terminal's state word
   moved `working → idle` as it settled, a live value). The next keystroke reached the terminal.
   Open on canvas switched page and selected the chat (`panel--selected`).

## Gate

`npm run verify` on 4754f739 (2026-09-18 01:56–02:05, no foreign Electron at start): **52/54
suites**. Every red is pre-existing and attributed by id, none is this run's:

- `verify:panels:agents` 88/89 — `detail.1` (recorded at `docs/build-log/m275-swarm-presets.md:107`).
- `verify:panels:product` 109/117 — `workflow.edit.1`, `workflow.edit.2`, `workflow.lib.1`,
  `workflow.wire.1`, `workflow.inspect.1`, `workflow.save.1`, `workflow.panel.1e`, `reach.1`
  (the identical tally and ids recorded at `docs/build-log/m277-libraries.md:78`).

All 19 new checks passed inside that chained run (`orch-page.1–.6`, `orch-page.src.1`,
`orch-task.1–.7`, `orch-island.1–.3`, `orch-attn.1`, `orch.gate.3`). `panels:shell` headroom 81–85%,
`panels:agents` 84–86% of their watchdogs — under the 90% line, not re-pinned.

`verify:visual` (hand-run): 62/66. `orchestration`, `orchestration-dark`, `orchestration-working`
moved on purpose (this run's side column, lens toggle and island card) — see Goldens below.
`starter` (24%, "the arrangement is not on screen") is pre-existing and NOT this run's: recorded at
`docs/build-log/m279-ui-evolution.md:176` and `m282-orchestration-jump-cards.md:74`; its golden is
left alone.

### Goldens

Written by COPYING the three accepted fresh captures, never `UPDATE_GOLDENS=1` (which writes every
changed scene and would have re-baselined the pre-existing `starter` red). A fresh-context critic
looked at golden, fresh and diff for each scene, four rounds:

- Rounds 1–3 REJECTED `orchestration-working`: first because a persisted selection changed the pool,
  command row, terminal card and feed (fixed: selection not kept); then twice because the taller
  island card hid the orange needs-you beacon above the `tests` cube (fixed: stage bars removed,
  spacing tightened — island bottom back at the old card's y≈330).
- Round 4, the critic's sentences, verbatim: **orchestration** — "ACCEPT — only the intended column,
  toggle and three-row island differ, and the island ends at about the old card's edge."
  **orchestration-dark** — "ACCEPT — same intended differences, all readable in dark, and nothing
  overlaps the scene." **orchestration-working** — "ACCEPT — the needs-you beacon at about (887, 340)
  is visible again, the island ends at about y 331, and nothing is selected automatically."

Harness finding, not fixed here: `verify:visual`'s 221 s watchdog tripped on EVERY first run after a
fresh `npm run build` (3 of 3) and on no warm rerun (3 of 3), under heavy memory pressure (~110 MB
free, load ~7) — the cold lazy chunks (three.js, Monaco) off disk. Recorded, not re-pinned: it is
not this run's watchdog, and a warm rerun is the honest reading.

`verify:panels:agents` WATCHDOG_MS re-pinned 113000 → 135000: M284's orch-task block made
`headroom.1` red at 108.0 s of 113 s (runs 94.0–108.0 s that day); 1.25× the slower. 92.8 s of
135 s (69%) after.

## Found / deferred

Out of scope for Phase A by the run prompt, logged here if the run is tempted: resizable
workbench tabs, Checks, brief editing, review-identity hardening, multiple islands,
dependency lens, Start task dialog, minimap, semantic zoom.

Deferred, found while building (not Phase A):
- Orchestrate's own text fields (the agent search) cannot take a menu paste: `Cmd+V` is menu IPC and
  only surfaces that subscribe to `edit:paste` receive it. Pre-existing; a later composer inherits it.
- The island is not yet a 3D platform in the R3F scene — it is the scene's task card over the
  existing framed membership ring. Layered platforms are Phase D.
- Review is read-only here; commit/discard stay on the review node ("Review on canvas").
- Orchestrate prefs are in memory: they survive the page toggle, not a relaunch.
- The palette over Orchestrate returns to Canvas rather than opening in place; an Orchestrate search
  is the plan's header "Search", not built.
- Collapsed canvas side regions are still focusable on the CANVAS page when the user hides them
  (zero-width columns, pre-existing); this run made them inert only under Orchestrate.
