# Terminal Canvas v9, resumed: finish the product, in goal mode, on Fable 5.1

**How to run this.** Open a fresh Claude Code session in `~/Documents/terminal-canvas` on
Fable 5.1, type `/goal`, and paste this entire document as the goal description. Nobody is at
the keyboard afterwards. Every decision a prior run would have asked a person is a recorded
default in the documents named below; where two designs are defensible, pick one, write the
reason in the build log, and move. The evaluator cannot tell "deliberating" from "stuck", and
only one earns its turns.

This session picks up a run that GPT-6 Astra started in Codex CLI on 2026-09-08 and could not
finish because its usage window ran out. You are continuing that run, not starting a new one.
Its authority, plan, brief and state already exist and you inherit all of them:

- **The authority** is `docs/superpowers/specs/2026-09-07-v9-finish-prompt.md`. Every rule in
  it binds you exactly as it bound Astra: the seven capabilities and Act VIII, the four doors
  rule, full UI and UX authority to a premium production standard bounded by the brief, the
  DOM aliases and the golden sentence, the instruction priority, the minimality rule, the
  blocked-by-a-person and blocked-by-reality rules, and the list of things never to do. Read
  it first and in full. Where it says "Codex", "subagent" or "`/model xhigh`", read the
  Claude Code equivalent: the Agent tool with a fresh context, and your own judgement about
  when to think longer.
- **The plan** is `docs/superpowers/specs/2026-09-07-v9-plan.md`: M180 through M200 across
  eight acts with a doors column per milestone, one branch per act, the seams decided, the
  dependencies expected, and the list of what a person will owe. It was approved with `go`.
  Do not re-plan it. Amend a row only when the work proves it wrong, and record the
  amendment in the ledger.
- **The brief** is `docs/superpowers/specs/2026-09-07-v9-design-brief.md`, the 5.0 design
  brief. Its principles govern every new or touched surface; a principle you retire is struck
  with a reason, never deleted.
- **The state** is `docs/build-log/m180-m200-ledger.md`. It is the resumable state of the
  run and the first thing you read after the authority. Its last section, "Act I — started",
  says exactly what M180 has proven, what was attempted and abandoned, and what remains. The
  four evidence notes beside it (`m180-control-evidence.md`, `m180-readiness-evidence.md`,
  `v9-m180-baseline-paste-image.md`, `v9-m180-product-annotation-diagnosis.md`) carry the
  commands and tallies. Raw logs are under `out/v9-evidence/`, which is gitignored.

## The goal condition — what the evaluator is actually checking

After every turn a small fast model reads the transcript and asks whether this is true yet.
Keep it true-or-false; it is the stop condition from the authority, restated:

> `main` is at 5.0.0, tagged locally as `v5.0.0`, clean, with `npm run verify` printing every
> suite's tally at exit 0, `npm run verify:visual` green over goldens that each changed on
> purpose with a critic's sentence in the ledger, and `npm run verify:packaged` green, all
> three pasted in the final message. `release/` holds a `.dmg` that opens on a Mac that has
> never seen this repository; `README.md` states the Gatekeeper right-click step and
> `docs/getting-started.md` exists. Every act from I to VIII in the plan is closed: a spec, a
> plan, red-first checks watched failing, a fresh-context critic AND a fresh-context verifier
> per milestone, a build log per act, a ledger line per milestone with its evidence, and no
> owed item silently dropped. Every capability in the authority's "What to build" is shipped
> through all four doors or struck in the ledger with a reason. The 5.0 brief is finished
> with every principle implemented or struck. Nothing was pushed to `origin`, no GitHub
> release was created, nothing outside this repository was modified. The final message
> states, per act, what shipped, what was declined and why, what a person still owes, and
> whether `main` is shippable right now.

If a suite is red, if a claim has no command and exit code beside it, if a golden changed
without a critic sentence, or if an act was entered and left half-built, the condition is
**not** met — keep working. If everything reachable is done, report and stop; padding is as
much a failure as quitting early.

## Where Astra stopped, and your first hour

You are on branch `v9-act1-onboarding`, checked out from `main` at `b8ca128` (4.1.0 plus the
v9 prompt and `AGENTS.md`). Nothing from the run has been committed. The working tree holds
Act 0's three documents, M180's spec and plan, the ledger and four evidence notes, a new
`src/shared/onboarding.ts` and `scripts/verify-onboarding.cjs` wired into the chain, and
edits across twenty-one tracked files (the launcher's one primary conversation action, the
bounded `plan` control verb through `control-protocol.ts`, `control-handler.ts`, the
preload and `canvas:plan`, the verb table's door metadata, the paste-image check's repair,
the product suite's annotation poll and its new `onboarding.start.1` and `onboarding.agent.1`
checks, and the README's in-progress M180 row). Confirm all of this with `git status` and
`git diff --stat` before believing it.

Do these in order before any new work:

1. **Make the state durable.** Run `npm run typecheck`. Then commit what exists in scoped
   conventional commits on this branch, preserving Astra's evidence notes verbatim: the Act 0
   documents as `docs(v9)`, the check files and their evidence as `check(m180)`, the source
   as `feat(m180)`. Stage exact paths. Do not squash, reword or tidy Astra's prose. An
   unattended session that crashes with a dirty tree loses the run.
2. **Record the resume in the ledger.** Append a section "Act I — resumed on Fable 5.1" with
   the timestamp, the branch, the commits you just made, and the sentence that the 24-hour
   wall-clock ceiling restarts from this resume because Astra's clock was stopped by a usage
   window and not by work. Astra's original deadline (2026-09-09 04:03:59 UTC) is historical.
3. **Re-establish the environment.** Astra ran every command with a repository-local
   environment so nothing was written outside the repo, and that choice is what exposed the
   `paste.image.1` wrapping bug:
   ```sh
   TMPDIR="$PWD/out/t" TMUX_TMPDIR="$PWD/out/t" CFFIXED_USER_HOME="$PWD/out/h" \
   npm_config_cache="$PWD/out/cache/npm" GIT_CEILING_DIRECTORIES="$PWD/out/t" TC_VERIFY_SUFFIX=v9 \
   npm run <script>
   ```
   Keep using it so results stay comparable with the recorded evidence. Before any
   real-Electron suite, kill a verify tmux server left from a previous run (the suffix names
   it), and never run two Electron suites at once.
4. **Rebuild from current source** (`npm run build`) before any product-suite run, visual
   capture or green claim. Astra's last experiment built an old-launcher variant into `out/`
   for a red-first check and never finished the run; source was never overwritten, but the
   built output may be stale.

Then finish M180. What the ledger says remains: run the real onboarding journey check
(`verify:panels:product` `onboarding.start.1` and `onboarding.agent.1`) and record it; the
old-launcher red for `onboarding.start.1` is owed once through the corrected renderer-only
build Astra left under `out/v9-evidence/build-old-launcher.cjs`, or declined by name with the
reason if that build cannot be made to apply; the four-door metadata and any agent transport
check still open; the visual capture of the changed launcher scene with the critic's sentence
before its golden is written; the full `npm run verify` chain; then M180's fresh-context
critic and verifier, their findings fixed or declined by name in the ledger, and the
`feat(m180)` closing commit. `verify:meta` was 37/38 because the README row was missing; the
row now exists and says in progress. Turn it to done when M180 closes.

After M180, M181 closes Act I: the captioned starter canvas. Act I's merge to `main` needs
`npm run verify`, `npm run verify:visual` and `npm run verify:packaged` each green with
tallies in the act's build log, then a `--no-ff` merge. Then Acts II through VIII as the plan
lays them out.

## How to work in this session

The method is the one nine Claude runs refined and Astra kept, and the superpowers skills
carry it: brainstorming is done (the spec exists per milestone; write the next one before its
code), `writing-plans` for each milestone's plan, `test-driven-development` for red-first
checks watched failing, `subagent-driven-development` and the Agent tool for the critic and
verifier with a fresh context and none of your reasoning (give them the diff, the spec, the
plan, the relevant rules and the evidence paths), `verification-before-completion` before
every green claim, `using-git-worktrees` only if you need isolation for a delegated check
writer. Delegate red-first check writing for independent modules and, in Act VIII, the
getting-started guide and the audit walk, as the plan says. Only one agent runs Electron at
a time.

Make the targeted change, not the comprehensive one. The repository answers questions about
itself: `CLAUDE.md`, `docs/load-bearing.md` by grep, `docs/verify-suites.md`, the build logs.
The web is for a third-party API's current shape only.

When a rate limit or usage window stops this session too, the ledger is the state; the next
session resumes by reading it, the same way you are now. Write to the ledger as you go, not
at the end of a milestone, so an interruption costs an hour and not a day.

Commits are conventional and scoped by milestone. One branch per act, merged to `main` with a
merge commit when the act's build log is written and the three commands are green. Tag
`v5.0.0` locally at the end only. Never push. Never create a remote object. Never modify
anything outside this repository. Never weaken a check. Never re-baseline a golden blind.
Never add a styling dependency. Never claim a verification you did not run.

## The final message

In this order: whether the goal condition is met and which parts are not; the pasted tallies
and exit codes of the three commands; per act, what shipped, what was declined and why, and
the hours spent; the owed list, every hand check a person must do with its command or step;
the DMG's path and size and the one sentence a stranger needs to open it; and whether `main`
is shippable right now, in one sentence. Written for a person who did not watch the run, in
plain prose, active voice, no filler.
