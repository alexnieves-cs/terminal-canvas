# Canvas opportunity audit — prompt for a second model (GPT-6 Astra / Codex CLI)

Hand the model the repository and paste everything below the line. It produces a **proposal
document**, not code.

---

You are auditing the **Canvas page** of Terminal Canvas, an Electron app for macOS, and
proposing what to develop next on it. Your output is a written proposal. **Write no
implementation code, change no files except the one report you are asked to produce, and run
no build, no suite and no Electron.** Read-only commands (`git log`, `rg`, `cat`, `npm run lb`)
are fine.

## Orient yourself first, in this order

1. `CLAUDE.md` — the index. It says which doc answers which question, and it carries the four
   product rules, the frame rule, the four density layers and the architecture seams. Treat it
   as binding.
2. `README.md` — the roadmap contract. Modules are deliberately shaped for milestones that
   have not landed. Do **not** propose "simplifying" those away.
3. `docs/product-rules.md` — the face/rest/path/metrics rules and what a restyle may not touch.
4. `docs/architecture-map.md` — what a seam is and who owns it.
5. `docs/ideas-backlog.md` and `docs/ideas-backlog-closed.md` — **read both before proposing
   anything.** The closed file holds entries already DONE or **declined**, under the same
   number. Re-proposing a declined idea without engaging its stated reason is the single most
   likely way for this report to be worthless.
6. `docs/milestone-history.md` for the run-by-run story, and `docs/build-log/` for what recent
   runs actually left behind — each ledger's **Found / deferred** section is a list of real,
   already-diagnosed gaps.
7. `npm run lb -- <module>` for any module you intend to discuss. `docs/load-bearing.md` is far
   too large to read whole. **Search it, never scroll.** Entries are written from the CAUSE, so
   searching a symptom fails.

## Scope

**In scope: the Canvas page.** The infinite canvas of authored objects — agents, terminals,
files, previews, workflows, pictures, notes, stickies, text, frames, regions — and the surfaces
that serve it: `src/renderer/canvas/`, `palette/`, `groups/`, `panels/`, `shell/`, `note/`,
`file/`, `review/`, `chat/`, `terminal/`, `workflow/`, `navgrid/`, `primitives/`, `browser/`,
`work/`, `session/`, `memory/`, plus the main process behind them. (`orchestration/` is the
Orchestrate page — out of scope, below.)

**Out of scope: the Orchestrate page.** It has its own live plan
(`docs/orchestrate-reference-plan.md`) with phases A–F, three merged and two in flight. Do not
propose work there. Where Canvas and Orchestrate meet, say so and stay on the Canvas side.
Note that **Canvas and Orchestrate are deliberately separate pages** and must not be merged.

Also off the table, because they are settled decisions and not oversights:
- Project, workspace and task do not merge; a teammate is an identity, a chat is its
  conversation, a session is its execution.
- A `note` is a Markdown file and nothing else is.
- There is no `credential:get`; plaintext crosses the bridge in neither direction.
- The canvas PNG export is the one door with no scrub gate, and that does not generalise.

## What I want you to find

Rank what you find by whether it makes the core job better: *move a meaningful task from
intention to reviewed result while the person keeps control and understanding.*

Look for all of these, and label which kind each finding is:

1. **Dead or unreachable controls** — a verb with a door that does not work, a control that is
   mouse-only, a surface that cannot receive `Cmd+V`/`Cmd+C` because it never subscribed to
   `edit:paste`/`edit:copy`. This class has bitten this repo repeatedly; treat it as likely,
   not hypothetical.
2. **Broken door closure** — the product rule is that every verb reaches a canvas gesture, a
   palette row, an agent line **and** a workflow node (`V9_DOORS`, `verify:verbs closure.v9.1`).
   Find verbs whose fourth door is declared but not real.
3. **Density-layer violations** — a fact at the wrong layer: configuration shouting at rest, a
   blocker buried in deep detail, a zero-value statement occupying the rest layer.
4. **Unfinished seams** — something a past run deferred, whose cost has since grown. The
   ledgers' deferred sections are your source; say which ledger and which line.
5. **Missing capability** — something a person plainly needs on Canvas that does not exist.
   Argue from the core job, not from what other products have.
6. **Silent failure risk** — a place where the obvious implementation would fail with no error
   and no red suite. This repo's whole documentation style exists because of this class.

For each finding give: **what**, **where** (`file:line`), **why it matters** to the core job,
**what it would take** (rough size: patch / one milestone / multi-milestone run), **what could
break**, and **evidence** — the file, the ledger line or the doc entry you read. An assertion
with no evidence line is worse than nothing here.

## Rules for the report itself

- **Verify before asserting.** If you claim a control is dead, name the handler that is missing
  or the listener that never fires. If you claim something is absent, say where you looked.
- **Separate what you confirmed from what you suspect.** Two lists. Do not blur them.
- Do not propose deleting a broad rule, weakening a check, or "simplifying" a module that
  README says is shaped for a milestone that has not landed.
- Do not restate a count in prose (this repo has a check for that); record the rule, not the
  tally.
- Assume `npm run verify` is the whole verification story: no unit-test runner and no linter.
  A proposal that assumes a test framework exists is not actionable here.
- Where a proposal would touch a golden screenshot, say so — a golden changes on purpose or
  not at all.

## Output

Write **one file**: `docs/canvas-opportunity-audit-2026-09-20.md`, structured as:

1. **Summary** — the three things you would do first, and why those three.
2. **Confirmed findings** — ranked, in the per-finding format above.
3. **Suspected, needs a look** — same format, with what would confirm each.
4. **Explicitly considered and rejected** — ideas you weighed and dropped, with the reason.
   Include anything you found already declined in `ideas-backlog-closed.md` that you think
   deserves revisiting, and engage the original reason directly.
5. **What I did not read** — the parts of the codebase you did not cover, so the gaps in this
   audit are visible rather than implied.

Be concrete and be honest about uncertainty. A short report of things you actually verified is
far more useful than a long one built on plausible guesses.
