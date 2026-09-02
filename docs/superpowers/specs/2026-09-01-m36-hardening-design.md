# M36 — Hardening for 1.0: the defects a release must not carry

**Status:** designed 2026-09-01, first milestone of the 1.0 run
(`2026-09-01-v1-scope-decision.md`).
**Backlog entries:** #43 (Unicode 11 widths), #58 (backpressure), #77's two
code items, #12's duplicated result types.

## What this milestone is for

Five things that are wrong today, none of them a feature, each with a silent
failure attached. A 1.0 that ships known defects to make room for features has
its priorities inverted, and three of these get cheaper to fix the earlier
they land, because later milestones build on the modules they touch.

1. **`npm run verify` is red on `main`.** `verify:panels` 143 fails
   deterministically: check 142 leaves nineteen panels marquee-selected, and
   M26's rule that a press on an already-selected member keeps the selection
   (so a group drag can begin) means the card press in 143 no longer narrows
   the selection to itself. Both branches were green alone; the merge was
   never run. A red suite is not a baseline anything can be measured against.
2. **xterm measures character widths against Unicode 6.** `createTerminal`
   sets `allowProposedApi: true` and loads no `@xterm/addon-unicode11`, so
   every emoji status glyph and post-Unicode-6 box character an agent TUI
   draws is one column narrower than the shell believes it is. The frame
   drifts one column per wide glyph and the corruption compounds down the
   pane — a defect nobody has attributed, because it looks like the TUI's own
   fault.
3. **A runaway panel can lock the renderer.** `enqueue` pushes every read
   into an uncapped buffer and `flush` joins it every 16ms. Batching solved
   message COUNT and did nothing about message SIZE: `yes`, `find /`, or an
   agent `cat`ing a large file produces multi-megabyte strings crossing IPC
   every frame, and the UI stalls in exactly the way the batcher exists to
   prevent.
4. **Every terminal panel's memo is defeated by one inline arrow.**
   `Canvas.tsx` passes `onContextPasted={(id) => ...}` to every
   `TerminalPanel`, a new function identity on every Canvas render — and
   Canvas renders on every mousemove. `TerminalPanel` is `memo`'d, `version`
   exists so the memo can see a mutation, and M35's `onBeginLink`/`linkTarget`
   discipline all protect a memo that this one prop already breaks. The
   `LinkLayer`'s `onRemove` has the smaller version of the same problem: it is
   `paletteActions.removeLink`, whose identity changes whenever the palette's
   captured id does, so the layer re-renders on every palette open despite a
   comment claiming otherwise.
5. **Three Jira result types are declared twice.** `JiraListResult`,
   `JiraTransitionsResult` and `JiraWriteResult` exist in both
   `main/jira-client.ts` and `shared/ipc-contract.ts`; `ipcMain.handle` is
   not typed by the contract, so the copies drift with `tsc` silent, and the
   failure is a renderer reading `undefined` — an empty transition list,
   indistinguishable from a ticket with no legal moves.

## Decisions

- **Check 143 is repaired to test what its comment says.** Its claim is "a
  press on a card draws no marquee and selects the card". The selection is
  cleared with `clickEmptyCanvas` before the press, so the check no longer
  depends on a rule M26 replaced. It is not deleted and not weakened: the
  three clauses (no marquee mid-gesture, exactly one selected, it is the card)
  stay.
- **Unicode 11 is loaded in `createTerminal`, before `open()`.** The addon is
  `@xterm/addon-unicode11@0.8.0` (peer `@xterm/xterm ^5`). It goes where the
  `Terminal` is constructed — the one place — and `term.unicode.activeVersion`
  is set there, because changing the width table after the fact is a
  re-measure that would need the `refresh(0, rows - 1)` treatment
  `attachTerminal` already carries. Nothing about the grid changes: no
  `pty:resize`, no SIGWINCH, no refit.
- **The flush is capped by bytes, and the cap keeps the TAIL.** A constant
  `FLUSH_MAX_BYTES` (256 KiB — comfortably more than a full 16ms of a chatty
  TUI, comfortably less than what stalls a frame). When a session's pending
  bytes exceed it, whole chunks are dropped from the HEAD until it does not,
  and the number of dropped bytes accumulates on the session. The next flush
  prepends one marker line, `\r\n\x1b[0m[terminal-canvas: N KB of output elided]\r\n` (the SGR reset first, so a drop that landed mid-sequence cannot paint the notice in the agent's colours — added during implementation, recorded here 2026-09-01),
  and resets the count. Two properties are load-bearing and each is a
  separate check: the LAST bytes survive (the flush-before-exit rule exists
  so the error explaining an exit is not lost, and a head-preserving cap
  would drop exactly those), and the elision is TOLD to the user in the
  stream — a user debugging missing output otherwise has no way to learn
  bytes were dropped, the same silent failure every note in `CLAUDE.md` is
  written against. Whole chunks rather than bytes so a cut never lands inside
  a chunk; a chunk boundary is where node-pty already cuts. The cap is a
  constructor parameter with the constant as its default, so
  `verify:pty-manager` can force it low and make the elision deterministic
  rather than timing-dependent.
- **`onContextPasted` becomes a `useCallback` with an empty dependency list**
  (it closes over a setter only), and `LinkLayer` receives a `useCallback`
  wrapper keyed on nothing the palette changes. Both are pinned as SOURCE
  TEXT, because the failure has no runtime symptom — nothing throws, nothing
  looks wrong, the app just gets heavy while a panel is dragged.
- **The three Jira types are declared once, in the contract**, and
  `jira-client.ts` imports them with `import type`, which esbuild erases, so
  the plain-node `verify:jira` bundle is untouched. All three at once —
  fixing only the new pair recreates the asymmetry that produced this.
  Pinned as source text in `verify:jira`, since drift has no runtime symptom.

## What it must not break

- `pty.kill` keeps exactly two callers; the cap touches `enqueue`/`flush`
  only and never a lifecycle path.
- The flush-before-exit ordering: the cap runs inside `enqueue`, and the exit
  path's `flush` still sends whatever is pending, marker included.
- The bell scanner runs on every byte BEFORE buffering; elision drops bytes
  from the buffer only, never from the scan, so a bell in a dropped chunk was
  still counted.
- `createTerminal` still returns a detached terminal; the addon load is
  before `open()` and the check that `open()` is called once stays true.

## Verification

- `verify:panels` 143 green, with its three clauses intact.
- `verify:xterm` `unicode.1`: a terminal built by the real `createTerminal`
  reports `activeVersion === '11'` and a `😀` advances the cursor two cells
  (one under the v6 table — the discriminating clause).
- `verify:pty-manager` `backpressure.1`/`.2`: with a 4 KB cap and a process
  printing ~200 KB ending in a sentinel line, no `pty:data` payload exceeds
  the cap plus one marker, at least one payload carries the marker, and the
  sentinel survives in the last payload.
- `verify:panels` `memo-stable.1`: `Canvas.tsx` passes `onContextPasted` and
  `LinkLayer`'s `onRemove` as identifiers, never inline arrows or member
  reads of `paletteActions`.
- `verify:jira` `types.1`: `jira-client.ts` declares none of the three
  result types and imports them from the contract; the contract declares
  each exactly once.
