# Synthesis: what would make an engineer want this on a Tuesday

Written 2026-09-06, from three uncontaminated lenses in this directory:

| Lens | Standing | Could read |
|---|---|---|
| [lens1-outsider-walkthrough.md](lens1-outsider-walkthrough.md) | product design; a stranger with 20 minutes | README + `out/shots/*.png` only. **Forbidden** CLAUDE.md, specs, build logs, `src/` |
| [lens2-daily-path.md](lens2-daily-path.md) | senior SWE + market, web-armed | everything, plus live competitive search |
| [lens3-adoption-blockers.md](lens3-adoption-blockers.md) | senior SWE, shipping | everything, including `gh` against the real repo |

The lenses were designed to disagree, and they did. This document does the arbitration
they cannot: it names one retention thesis and lets that thesis **kill** findings, rather
than merging three lists into a longer list. A merged list would become a second
`ideas-backlog.md`, which is the failure this exercise exists to avoid.

---

## The retention thesis

> **terminal-canvas is the place where agent work you started keeps running, and is
> still there — with receipts — when you come back.**

Two lenses arrived at this from opposite directions, which is the strongest signal the
research produced.

Lens 2 reached it by elimination. The canvas is not a differentiator any more: two
competitors ship the same infinite-canvas-of-agent-terminals pitch, Claude Code shipped
worktree isolation in Feb 2026 and an Agent View in May, and the four biggest vendors each
had the canvas available as a design choice and all four shipped a *list*. What is left
that nobody else has is (a) the typed, **triggered, joinable** handoff edge with runs,
receipts and in-process ceilings, and (b) the fact that this app is a **place** — dormant
panels with recorded tails, durable scrollback, worktrees outliving panels, review
baselines that still answer after the agent is dead.

Lens 1 reached it by falling over. The stranger's single loudest complaint —
`no tmux — sessions end on reload`, present in the status bar of all twenty screenshots
it opened — is a *durability* complaint. The persona's own words are that it "reads as
data loss." The one string the product repeats most often tells the user the opposite of
the thesis.

Note what the thesis is **not**: it is not "run many agents at once." Lens 2's most
uncomfortable finding is that published guidance caps useful parallelism at 2–3 agents
because the ceiling is *merge* cost, not *visibility* cost — and a canvas does not lower
merge cost. Parallelism is the demo. Durability is the reason to come back tomorrow.

---

## What the thesis kills

Held against the thesis, these are parity or museum work. Freeze them; do not extend
them; do not spend a milestone explaining them better.

- **The per-vendor engine race** (M117–M121 in flight). Ship ACP once and stop. Warp wired
  four CLIs in April; this is a treadmill with no finish line, and each engine is a new
  stream format to chase forever.
- **Jira, GitHub work items, the browser guest, toolbox, machine cost, minimap, subagent
  nodes, vault/annotations.** Lens 2 names a free MIT competitor that does the notes half
  better and has a mobile app. None of these are why anyone stays.
- **New panel kinds.** Twelve is already past the point where Lens 1 counted ~35–40
  non-derivable nouns, **11 required for one task**.

This is the arbitration Lens 1 and Lens 2 could not make between them: Lens 1 wanted the
vocabulary *explained*, Lens 2 wanted it *deleted*. The thesis says **cut first, then
explain what survives** — explaining a museum is a milestone spent making the wrong thing
learnable.

---

## Ranked work

Ranked by users-eliminated × cheapness, which is Lens 3's ordering, with the thesis
breaking ties.

### Tier 0 — days, and everything else is downstream

1. **Publish the repo and cut a release.** `gh repo view` → `isPrivate: true`; `gh release
   list` is empty; `README.md:199` links a 404. Eliminates 100% of prospective users.
   Newest local `.dmg` is 2.0.0 and `release/` is gitignored.
2. **Put pictures in the README.** 981 lines, zero images, for a *canvas* app — while
   `npm run shot` already renders 39 PNGs into gitignored `out/`, six of which
   `README.md:146-179` describes *in prose*. An hour.
3. **Ship universal, not arm64-only.** `builder-config.cjs:27` defaults arm64;
   `verify-package.cjs:112-118` already proves `arch` is a working parameter. One line;
   unblocks every Intel Mac.
4. **Default a spend ceiling.** `agents.maxConcurrent` and `agents.budgetUsd` both default
   to `0` = unlimited (`settings-schema.ts:150-169`), while teammate `places` correctly
   default to deny-everything. Enforcement is built and tested; only the default is wrong.
   A stranger's first runaway agent is an unbounded bill.
5. **Reframe `no tmux — sessions end on reload`.** The most-repeated string in the product
   states data loss, permanently, with no fix — directly above a codex line that does
   offer one. Give it the fix, or demote it from persistent chrome.
6. **Open the repository door on the launcher.** Every enabled launcher row points at `~`.
   The user's task starts in a repo; the app starts in their home directory.

### Tier 1 — the thesis, and the only new building worth doing

7. **The resumption surface.** A morning "since you were last here" view: what ran, what
   finished, what is waiting on you, what changed on disk, what it cost. Lens 2's judgment
   is that **every ingredient exists and none are assembled** — dormant tails, durable
   scrollback, the run ledger, review baselines, usage. This is the daily reason to open
   an app whose headline capability is weekly. Highest-leverage item in the research.
8. **Make the graph runnable headless.** `tc run <template>` over the existing `runPlan`.
   This is the hedge against the top competitive risk (Anthropic extending Agent View into
   a dispatcher): it repositions the product as a *runtime with a UI* rather than a canvas,
   and a runtime survives someone else shipping a better canvas.
9. **Surface the trigger graph as the product.** It is the one difference in kind and it is
   currently one bullet among forty — reachable, per Lens 1, only via a `LANES` checkbox
   inside a thing called `lineup: Workbench`. Rename off the metaphor-from-nowhere;
   put joins and receipts on the first screen.

### Tier 2 — correctness found in passing, cheap, do while nearby

10. `copilot` missing from `REPORTED_CLIS` (`env-report.ts:8`) → users see "3 of 3 found"
    beside dead doors.
11. A timed-out login shell renders as "not found on PATH — install the Claude Code CLI" —
    the exact failure `env-report.ts:38-39` was written to prevent. M107's "discovery
    explains itself" otherwise holds.
12. Broker writes prompt only when `teammateId !== undefined` (`broker.ts:229`), so an
    ordinary panel's `tc api … DELETE` spends the real token unprompted.
13. `SECURITY.md:53-56`'s "first and only outbound network call" is now false (Sentry,
    broker). Telemetry is exemplary but documented only in a milestone-table row.
14. `npm run verify` hardcodes `Electron.app/Contents/MacOS/Electron` in 7 scripts, so the
    project's one stated contributor gate is unsatisfiable on Linux.
15. Palette ranks fuzzy path matches above real commands (`palette-query.png`: typing
    `group` surfaces `/private/var/folders/…` above the three group commands).
16. The fixture canvas occludes itself; frameless subagent cards read as render bugs; the
    minimap covers buttons. The author's own curated demo is messier than the tmux grid it
    replaces.

### Tier 3 — real money, real time, not yet

17. **Signing + notarization** ($99/yr). `identity: null` (`builder-config.cjs:101`) means
    macOS 15+ says *"damaged"*, not the friendly dialog. Gates a real auto-update channel
    and the `safeStorage` caveat the project already admits against itself
    (`SECURITY.md:80-90`). Do it when Tier 0 proves anyone wants the app.
18. **An update path.** No `electron-updater`, no version check anywhere. Because the app
    parses other vendors' CLI stream formats, a stale install is on a clock.
19. **Linux/Windows, teams, import.** Everything lives under `userData`; templates,
    lineups and routines are unshareable; there is no import door. Real work, wrong month.

---

## The beachhead

Not "every software engineer." Lens 2's answer, which the thesis endorses: **the
agent-harness builder** — the person whose work product *is* multi-agent pipelines. They
need the graph, the templates, the joins, the receipts and the `tc` control socket, which
is the app's most under-marketed asset. Vibe Kanban's shutdown in April left this exact
group stranded.

"Every engineer" is the wrong target and pursuing it is what produced the parity museum
in the first place. The beachhead is the group for whom this is *already* the best tool
in the world, today, unchanged.

---

## What this research cannot tell you

No arrangement of agents validates a want. These three lenses generate hypotheses and
clear blockers; only people confirm demand. The outstanding item that nothing here
substitutes for is **five engineers, thirty minutes each, watched rather than surveyed** —
and Tier 0 is the precondition for it, because today they cannot install the app.

Two honesty notes on the evidence itself:

- Lens 2's competitor names, versions and dates come from live web search by a subagent.
  Sources and check-dates are in its report. Verify the two direct competitors and the
  Claude Code version claims before betting a milestone on the strategic read.
- Lens 3 verified code and docs, not a real install. The Gatekeeper wording and current
  macOS behavior are from knowledge, not tested on this machine.
- Lens 1's quit points are measured against one persona: a staff engineer who already runs
  `claude` in tmux with worktrees. That baseline was chosen, not given. A persona without
  a tmux habit shrinks finding #5 and grows finding #6.
