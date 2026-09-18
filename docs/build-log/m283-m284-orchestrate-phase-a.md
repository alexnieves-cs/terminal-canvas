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
      memory — camera, mode, lens, side tab, selection survive the toggle; nothing the canvas owns
      reads or writes it.
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
      Rendered as the scene's task card, which now SELECTS the task (was: jumped to canvas).
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

_(pending)_

## Gate

_(pending — `npm run verify`, every red listed and attributed)_

## Found / deferred

Out of scope for Phase A by the run prompt, logged here if the run is tempted: resizable
workbench tabs, Checks, brief editing, review-identity hardening, multiple islands,
dependency lens, Start task dialog, minimap, semantic zoom.
