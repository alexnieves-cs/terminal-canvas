# Terminal Canvas: the parallel roadmap to a finished product

Read on 2026-10-21 at `main` @ `a7cf981` (after PRs #26 to #29). This builds on two
earlier notes (a repo tour and a UX proposal list, kept in the owner's project files) and
does not repeat them. Run book: [RUN.md](RUN.md).

## The recommendation in one paragraph

Run **one setup PR, then five streams at once**, in three waves. Two streams finish the
product you already have (**A: trust the gate**, **B: ship 6.0**). Two make it outrageously
useful (**C: hand off a night of work and trust the result**, **D: reach it from anywhere**).
One keeps it clean while the others add to it (**E: cut and untangle**). A, B, C and D can
all start on day one because they touch different parts of the code. E starts with
decisions, not code, so it doesn't collide with anyone. If you only staff two streams, staff
**B and C**: B puts an installable 6.0 in your hands, and C is the feature no other agent app
has.

## What changed since the repo tour

- **CI is green and trusted.** The blocking `verify` job passes on the Mac runner (run 141 on
  `main`). Seven Electron suites still run in the non-blocking known-red job.
- **Most of the UX proposals shipped in #26**: the first-run fixes, ready-to-review, "review
  and accept", answering from Plan and Map, ⌘N as New task, one set of words, a menu-bar
  count (`src/main/menu-bar.ts`), a system-wide New task hotkey, paste-to-start, one
  welcome-back card and tmux adoption.
- **Still open from the tour:** no DMG or GitHub release, 18 shot scenes without goldens and
  77 stale goldens, the six fix-list rows (`docs/redesign/fix-list.md`), the Follow control
  (R-052), command panels (#55), the memory cap (#64), and all nine bigger bets.
- **Still true in the code:** auto mode ends when the agent prints `AUTO-DONE`
  (`src/shared/auto.ts:35`). There is no `powerSaveBlocker`, no `git merge-tree` and no MCP
  server anywhere in `src/`. `Canvas.tsx` is 10,695 lines and `OrchestrationView.tsx` is 3,695.
- **The lane machinery from the redesign still works.** `.claude/hooks/guard-paths.sh` limits
  each `RD_LANE` to its globs in `docs/redesign/ownership.json`. That's exactly what parallel
  streams need, so the setup PR reuses it instead of inventing something new.

## The shape

| Wave | When | A: Gate | B: Ship | C: Autonomy | D: Reach | E: Clean |
|---|---|---|---|---|---|---|
| 0 | Day 1 | **S0: run scaffolding** (one PR, blocks nothing for long) | | | | |
| 1 | Weeks 1–2 | Harden the 7 suites | Release workflow, shots on CI, fix-list | Check-gated "done" | `tc mcp` server | Cut list, Follow, small fixes |
| 2 | Weeks 3–4 | Visual check becomes blocking | Goldens, v6.0.0 on GitHub | Tonight batches | Phone alerts | Canvas.tsx split |
| 3 | Weeks 5+ | Flake budget, perf budget | Auto-update, 6.1 | Morning queue, collision radar | Remote lanes (optional) | Memory cap, command panels |

Hard dependencies are few and named:

- **B's goldens need A's harness** for `verify:visual` on CI (A1, then B3).
- **C2 (Tonight) needs C1** (check-gated done). An unattended night is only useful if
  "done" was checked by something other than the agent.
- **C3 (morning queue) needs C1 and C2**, because it ranks their results.
- **D2 (phone alerts) reads the attention queue** that already exists. It doesn't wait on C,
  but it gets much more useful once C2 runs work overnight.
- **E's Canvas.tsx split must land in short, separate PRs** so it never holds a long-lived
  branch against the hottest file. Everyone else rebases onto each split as it lands.

---

## S0. Run scaffolding (one PR, day 1)

**Goal:** make five streams safe to run side by side, using the tools the repo already has.

**Areas:** `docs/redesign/ownership.json` (or a new `docs/run-7/ownership.json` the hook
reads), `CLAUDE.md`, `docs/build-log/`, `.claude/hooks/guard-paths.sh`.

**The PR:**
- Define lanes `A`–`E` with file ownership (table under "Collision map" below), and mark
  the hot shared files as "append-only, small PRs".
- Add a ledger, `docs/build-log/m457-m4xx-ledger.md`, and link it from `CLAUDE.md` (or
  `verify:meta ledger.1` goes red).
- Retire the redesign's "you are in ONE lane" text in `CLAUDE.md`, pointing it at the new run.
- Give each stream its milestone range so commits don't collide (`m457–m469` A,
  `m470–m489` B, and so on).

**Done when:** `verify:meta` is green with the new ledger linked, and a test edit outside a
lane's globs is refused by the hook.

---

## A. Trust the gate

**Goal:** every suite blocks. Today seven Electron suites can fail without anyone noticing,
which is the same "red is normal" trap the repo tour warned about, just smaller.

**Areas:** `scripts/verify-panels-*.cjs`, `scripts/verify-all.cjs`, `.github/workflows/verify.yml`,
`scripts/verify-visual.cjs`, `scripts/shot.cjs`.

**Runs alongside:** everything. It only touches verification scripts and CI.

**First PRs (one suite per PR, so each one leaves `KNOWN_RED` on its own):**

| PR | What | Size | Done check |
|---|---|---|---|
| A1 | `panels:shell`, `kinds`, `orchestrate`, `flowchart`: replace the fixed `settle()` waits behind 111b/discard.1, link-draw.5, orch-bench.5 and flowchart.perf.2 with waits on a real condition, and give perf.2 a runner-scaled budget | S each | Suite passes 5 of 5 runs in a temporary matrix workflow (the triage trick from #29), then leaves `KNOWN_RED` |
| A2 | `panels:core`: check 57 (focus) and `prompt.builtin.1` | S | Same |
| A3 | `panels:agents`: the 7 checks listed in memory | M | Same |
| A4 | `panels:product`: find the watchdog hang (print the tail at 18 minutes, as the triage job did) | M | Same, and `headroom.1` stays under 90% |
| A5 | Run `verify:visual` on CI as a non-blocking job that uploads diffs | S | Job uploads one PNG per scene as an artifact |
| A6 | When B3 has written goldens, `verify:visual` becomes blocking | S | `HAND_RUN` in `verify-all.cjs` loses `verify:visual`; `verify:meta` 19 updated |

**Done when:** the `verify-electron-known-red` job is deleted (its own comment says to do this
when the list is empty), `verify:visual` blocks, and `main` has five green runs in a row.

**Never:** skip, quarantine or loosen a check to get there. A timing check gets a real
condition or a runner-scaled budget, not a bigger fixed sleep.

---

## B. Ship 6.0

**Goal:** a DMG you can download from a GitHub release and install, with goldens that match
what you looked at. This is also how "a Mac pass" stops needing your Mac.

**Areas:** `.github/workflows/` (new `release.yml`, `shots.yml`), `build/builder-config.cjs`,
`scripts/shot-scenes/`, `verify/visual/goldens/`, `docs/redesign/fix-list.md`.

**Depends on:** A5 for the CI visual job. Nothing else.

**First PRs:**

| PR | What | Size | Done check |
|---|---|---|---|
| B1 | `shots.yml`: on demand, run `npm run shot` on `macos-latest` and publish every PNG to a private gallery page you can open on your phone | S | A run produces one image per declared scene, including the 18 `rd-*` scenes |
| B2 | The fix-list rows that are code: drive the `rd-arrange` drag, guides and marquee; fix the three scenes that capture light; the six typeface and wording rows | M | The B1 gallery shows each fixed scene; `verify:rd-l-b` and `face.1` green |
| B3 | Goldens: after you have looked at the B1 gallery, a `workflow_dispatch` job runs `UPDATE_GOLDENS=1` on the runner and opens a PR with the new goldens and one critic sentence per scene in the ledger | S | `visual.1` green (declared = goldens); you approved the gallery first |
| B4 | `release.yml`: on a `v*` tag, build arm64 (and x64 if you want Intel), run `verify:packaged`, attach the DMG and checksums to a GitHub release | M | A test tag produces a release with a DMG that `verify:packaged` passed |
| B5 | Tag `v6.0.0` | XS | Release exists; install notes in the release body |
| B6 | Turn on auto-update (`update:check` already exists) against GitHub releases | M | A 6.0.1 test release is offered to a 6.0.0 install (checked on the runner) |

**Decision for you:** code signing and notarization need an Apple Developer account
($99 a year). Without it the DMG still works, but macOS asks you to right-click Open the
first time, and auto-update is less smooth. I'd ship 6.0.0 unsigned now and sign at 6.1.

**Done when:** `v6.0.0` is a GitHub release with a DMG, every scene has a golden you looked
at, and `verify:packaged` runs in the release job.

---

## C. Hand off a night of work and trust the result

**Goal:** the headline feature. You queue tasks in the evening, each one finishes only when
a real check passes, the Mac stays awake, usage limits pause work instead of killing it,
and the morning shows you what to review first. This is bets 3, 1 and 2 from the tour, in
that order, because each needs the one before.

**Areas:** `src/shared/auto.ts`, `src/main/agent-session.ts`, `src/main/pool-runner.ts`,
`src/main/routine-runner.ts`, `src/main/job-store.ts`, `src/shared/check-output.ts`,
`check-evidence.ts`, `rate-limit.ts`, `return-briefing.ts`, `src/renderer/shell/task-queue.ts`.

**Runs alongside:** A, B and D. It shares only `ipc-contract.ts` with D (append-only).

| PR | What | Size | Done check |
|---|---|---|---|
| C1a | **Check-gated done, the model.** A task's recipe names a check (`npm test`, a build, any command). Auto mode treats `AUTO-DONE` as "ready to check", runs the check, and only then calls the task done. A failed check sends its output back as the next turn, up to a limit. | M | New plain-node suite `verify:auto` with scoped ids (`auto.check.1`…): marker without a passing check never reads as done |
| C1b | Check-gated done, the surface: the task card shows "checked" vs "agent says done", and the review queue sorts by it | S | `verify:ux` checks for the two states |
| C2a | **Tonight, the plan.** A batch of tasks with a budget each, scheduled against your usage windows (`rate-limit.ts`), and a `powerSaveBlocker` held only while a batch runs | M | `verify:auto tonight.*`: a limit pauses and resumes, it never stops; the blocker is released on every exit path |
| C2b | Tonight, the door: a "Run tonight" row in New task and the palette, plus `tc tonight` (four doors) | S | `verify:verbs closure.v9.1` green with the new verb |
| C3 | **Morning queue.** One list across tasks: failed checks, decisions, then passed work, cheapest to review first, inside the existing welcome-back card | M | `verify:ux morning.*` ordering checks on fixtures |
| C4 | **Collision radar.** Trial-merge sibling worktrees with `git merge-tree --write-tree` while they run, and flag overlapping files on both cards | M | `verify:review radar.*` against fixture repos |

**Done when:** a batch of three fixture tasks runs unattended on the CI runner, one fails its
check and is retried with the output, one hits a fake usage limit and resumes, and the
morning queue lists them in the right order.

---

## D. Reach it from anywhere

**Goal:** you and your other agents can drive the canvas without sitting at it. Bet 4 (the
canvas as an MCP server) first, because it is mostly wiring existing verbs to a new door,
then bet 7 (needs-you on your phone).

**Areas:** `src/cli/tc.ts`, `src/main/control-server.ts`, `control-protocol.ts`,
`control-handler.ts`, `src/main/menu-bar.ts`, `server/relay/`, `src/main/presence/`.

**Free tools:** the MCP TypeScript SDK (`@modelcontextprotocol/sdk`, MIT) for the server, and
[ntfy](https://ntfy.sh) (open source, free hosted or self-hosted) for phone pushes without
writing an iOS app.

| PR | What | Size | Done check |
|---|---|---|---|
| D1 | **`tc mcp`**: a stdio MCP server that speaks to the running app over the existing control socket. Tools: list panels and their state, spawn a task, send to an agent, read the attention queue, open review. Same caps as the socket; secrets go through `redactSecrets` | M | New plain-node suite `verify:mcp`: an SDK client lists tools and calls each against a fake control server; `verify:control` green |
| D2 | **Write tools behind the gate**: answer an approval, accept a review. Each refused unless the app's setting allows it, and logged in the decision audit | S | `verify:mcp gate.*`: a write with the setting off is refused by name |
| D3 | **Phone alerts**: when an item enters needs-you and the Mac is idle, send a push through ntfy with the agent's name and question (scrubbed by `outward`), with a link back | M | `verify:mcp push.*` or a new plain-node check: the payload passes `outward`, carries no path or token shape |
| D4 | Read-only phone view of the queue through the existing relay (backlog #40) | L | `verify:relay` green with a new read-only view check |
| D5 | Optional, much later: lanes that keep running on your own VM (bet 8) | XL | Its own plan |

**Done when:** Claude Code (or any MCP client) can be pointed at `tc mcp` and run a task end
to end on your canvas, and your phone buzzes when an agent asks you something.

**Rule to keep:** an MCP write is an outward-facing verb. It goes on the named caller list
for `outward` and is reviewed by a fresh-context critic before merge, per `CLAUDE.md`.

---

## E. Cut and untangle

**Goal:** keep the product focused and the code workable while A to D add to it. The app has
World, Orchestrate, decks, sheets, flowcharts, chat, relay, teams and more. Some earn their
place and some don't, and the biggest file is 10.7k lines.

**Areas:** decisions first; then `src/renderer/canvas/Canvas.tsx`,
`src/renderer/orchestration/`, `src/renderer/canvas/CanvasHud.tsx`, `src/main/pty-manager.ts`.

| PR | What | Size | Done check |
|---|---|---|---|
| E1 | **Cut list** (a doc, not code): for each surface, keep, hide behind a setting, or remove, with the reason. I draft it from the code and the ledgers; you decide | S | You've picked |
| E2 | Apply the "hide" decisions behind settings (no deletions without your yes) | S–M | Relevant suites green with the surface off and on |
| E3 | **Follow** beside Work / Plan / Map (R-052) | S | `verify:rd-w2` (or the HUD's suite) gains a `follow.*` check |
| E4 | **Split `Canvas.tsx`** into hooks and child components, one seam per PR (overlays, keyboard, empty states, spawn, review), with no behaviour change | 5–8 × S | `npm run verify` fully green on each; `Canvas.tsx` under 4k lines at the end |
| E5 | **Ration terminal memory** (#64): trim scrollback for panels you haven't looked at, keep the last screen on the card | M | New `verify:pty-manager mem.*` checks |
| E6 | **Command panels** (#55): `> npm test` in ⌘K opens a throwaway panel that shows the real exit code | M | `verify:palette cmd.*` and an Electron check |

**Done when:** every surface has a recorded decision, `Canvas.tsx` is a composition file
rather than the whole app, and memory stays flat over a long session on the runner.

---

## Collision map

These files are touched by several streams. Rules: keep PRs small, add rather than rewrite,
and rebase onto `main` before each push.

| File | Who touches it | Rule |
|---|---|---|
| `src/renderer/canvas/Canvas.tsx` | E4, plus small hooks from C and D | E4 lands first in small PRs; others add one import and one line |
| `src/shared/ipc-contract.ts` and the channel list in `CLAUDE.md` | C, D | Append in your stream's own block; `verify:ipc` checks it |
| `src/renderer/styles.css` | B2, C1b, E3 | Each stream writes inside its own marked block, as in the redesign |
| `package.json` `verify:*` keys | A, C, D | Add one key per new suite; the runner picks it up |
| `.github/workflows/` | A, B | A owns `verify.yml`; B owns `release.yml` and `shots.yml` |

## What needs you

1. **Pick the plan.** The default is all five streams, with B and C first if you'd rather staff two.
2. **Look at the shots** once B1 publishes them (from your phone is fine). Goldens don't get
   written until you have.
3. **Signing:** ship 6.0.0 unsigned now, and decide on the $99 Apple account before 6.1.
4. **The cut list** (E1), when it's ready.

Nothing here runs on your Mac. Every check above runs on GitHub's macOS runners.

## Not recommended (still)

More agents per screen, a multiplayer layer, more object kinds, and a general plugin API
without a real user for it. The MCP server (D1) covers most of what a plugin API would
have offered.
