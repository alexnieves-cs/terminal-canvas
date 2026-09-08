# Terminal Canvas v9: finish the product. A prompt for GPT-6 Astra in Codex CLI.

Launch from a clean `main` at 4.1.0 in `~/Documents/terminal-canvas`:

```sh
codex -m gpt-6-astra -s danger-full-access -a never "$(cat docs/superpowers/specs/2026-09-07-v9-finish-prompt.md)"
```

## GOAL

Take this Electron app from 4.1.0 to a 5.0.0 that real users can install and do real work
in, and produce the DMG. "Real users" are a small group of software engineers and vibe
coders who will receive the DMG by hand. "Finished" means the canvas reads as one product in
the family of Orca, n8n and BridgeMind One: a freeform canvas where an agent, a terminal, a
file, a live preview, a workflow, an image and a note are equal objects; a workflow graph
with a real node library and an inspector that edits a node; one native window with a rail
of named places and agents as first-class objects. The Orca shape is the spine. The other two
are features inside it, and both already exist here as seeds you deepen rather than rebuild.

You should infer the user's intent and task scope from this document and the repository.
Your job is to bias towards action and carry the user's intended task to completion. When
this document says "make", "build", "ship" or "finish", treat it as an instruction to do the
work and take action.

## THE RULES THAT MUST NOT BE BROKEN

These come first because they are absolute. Never push to `origin`. Never create a GitHub
release or any remote object. Never modify anything outside `~/Documents/terminal-canvas`
except Codex's own state under `~/.codex`. Never use a credential you find on disk for
anything but the app's own recorded paths. Never weaken, skip or delete a check to make a
suite green. Never rewrite a visual golden without a critic's written sentence for that
scene. Never add a styling dependency (no Tailwind, no component library, no icon font).
Never claim a verification you did not run; every claim of green carries the command and its
exit code.

## CONTEXT

This is the tenth run on this codebase. The previous nine, M1 through M179, are recorded in
`docs/build-log/`, the milestone table in `README.md`, and `CLAUDE.md`. They made the canvas
trustworthy, wide, capable and, at 4.1.0, calm. None made it a product a stranger can install
and use. Read these before your first change, in this order: `AGENTS.md` (short, Codex
facing), `CLAUDE.md` in full (the engineering decisions log; every entry names an invariant
and the silent failure that follows from undoing it), `README.md`'s milestone table, the
4.1 ledger at `docs/build-log/m161-m179-ledger.md`, the two design briefs under
`docs/superpowers/specs/` dated 2026-09-05 and 2026-09-07, `docs/ideas-backlog.md`, and the
manual-only list at the end of `docs/load-bearing.md`. Grep `docs/load-bearing.md` and
`docs/load-bearing-recovered.md` by module name before changing any module. Read
`docs/verify-suites.md` before adding or debugging a check.

The repository already answers nearly every question about itself. Reach for the web only
for a third-party API's current shape (Slack, GitHub, an npm package). Do not search to
confirm what the repository states.

Verification is `npm run verify`, which chains every plain-node suite, the typecheck, the
build and the real-Electron suites and prints a tally per suite. `npm run verify:visual`
(goldens) and `npm run verify:packaged` (the packaged binary) sit outside that chain and are
owed at every act close. There is no unit-test runner and no linter.

The user is on a ChatGPT Plus login. The meter is a usage window, not dollars.

## INSTRUCTION PRIORITY

When sources conflict, this is the order of authority.

1. This document.
2. `AGENTS.md`.
3. `CLAUDE.md`, the design briefs, `docs/load-bearing.md` and `docs/verify-suites.md`.
4. Any skill, plugin instruction or other contextual file.

The user's instructions take precedence over guidelines provided in a skill. If explicit
user instructions conflict with a skill's instructions, prioritize the user's instructions.
If a skill causes you to ask for permission or confirmation, pause, leave requested work
unfinished, or diverge from the user's intent, name and link to the exact SKILL.md file you
read in the build log, quote the line, and continue under this document.

Rules at level 3 are binding until you strike one. To strike a rule, write the rule, the
reason and the check you changed in this run's ledger. Do not expect to strike the DOM
aliases the checks select on, `.pf__body` never transformed, xterm's cell metrics, the PTY
flush gate, the credential store's three readers, or the broker's audit.

## AUTONOMY

Nobody is at the keyboard after the one pause described under OUTPUT. Make every decision
yourself. Where two designs are defensible, pick one, write the reason in the build log, and
move on. Do not stop because a decision is ambiguous. Before asking the user clarifying
questions, complete the work that is already authorized from context and necessary to make
the proposed action concrete and reviewable; in this run that means there are no clarifying
questions after `go`, only recorded decisions.

You may add a dependency with a written reason in the plan and the ledger. Prefer none,
prefer small. Run `npm run verify:electron` after any native module.

When something needs a person (an Apple signing identity, a Slack workspace token, a Jira
tenant, a second Mac), build the feature against a fake as this repository does everywhere,
record the hand check as owed in the ledger, and continue. Never pretend it was checked.

When something you cannot fix is real (a suite red at your baseline, a dependency that will
not build on this machine, a design that contradicts the load-bearing file in a way you
cannot resolve), write what you tried in the build log, ship the smallest version of the
milestone that works without it, and move on after two attempts at `xhigh` reasoning.

Make the targeted change, not the comprehensive one. Avoid unrelated cleanup and unnecessary
complexity. Preserve unrelated code. A milestone touching forty files where eight would do is
a finding the critic raises and you fix.

After a successful irreversible action (a merge to `main`, a golden written, a tag), do not
repeat it unless you first verify that it did not already succeed.

## TOOLS AND DELEGATION

If at any point you can parallelize work by delegating tasks to another agent, you should do
so using collaboration tools if it could save time or improve quality. In this run,
delegation is required at these points, not optional. For every milestone, after the
implementation is green, spawn two subagents with fresh context and no memory of your
reasoning: a critic, who reads the diff and any changed goldens cold and returns one sentence
per changed scene plus a ranked list of findings including over-engineering; and a verifier,
who runs the commands and confirms every claim with an exit code. Fix or decline each finding
by name in the ledger. Also delegate the red-first check writing for modules that are
independent of each other, and the getting-started guide and the audit walk in Act VIII.
Messages that you send to other agents and your final answer may be read by a human, so
ensure they are legible.

Run at `high` reasoning effort. Switch to `xhigh` with `/model` for the Act 0 plan, for any
change to a seam (`src/shared/ipc-contract.ts`, `src/shared/layout-schema.ts`,
`src/main/agent-session.ts`, the template-node union), and for a debugging loop that has
failed twice. Switch back after.

## WHAT TO BUILD

Seven capabilities, each an act, in this order, milestones numbered from M180. You choose the
milestone split within an act during Act 0. Each act ends with a build log, a merge to
`main`, and the three verification commands green.

Act I, onboarding. A first run that takes a person who has never seen the app from launch to
a working agent conversation in under two minutes with no terminal knowledge: which CLIs are
installed (the M107 env report already knows), one click or one plain sentence to get what is
missing, a starter canvas showing one of each object kind with a caption, and the M170 agent
card as the first thing they talk to.

Act II, the editable workflow graph. The M133 workflow panel draws a saved template as a
projection. Make it an editor: drag a node from a library, wire an edge, edit a node's
configuration in the inspector, run it, watch the run on the same diagram, save it back as
the template. The live canvas stays a valid editor of the same record and the two views never
disagree.

Act III, the preview panel. A live app preview beside the code in the M103 browser guest:
auto-discovered from the project (a port a panel's process opened, or a `dev` script in
`package.json`), reloading on the M84 watcher's file change, with a device-width preset and a
screenshot verb an agent can be asked for.

Act IV, the media and design layer. Beyond M155's ink: images (dropped, pasted, or an agent's
screenshot), sticky notes, frames that name a region, and freeform text, all as canvas
objects with the M92 marks and the M93 record rules, equal to a panel in tiering, selection,
grouping, undo and export.

Act V, the node library and integrations. Real workflow node kinds with the n8n posture: HTTP
request, webhook in, cron, GitHub through the M87 broker, Slack, email, a shell step, a
transform step, an agent step, and one documented way to add another. Each node has a schema
the inspector renders from, a test-this-node verb, and an example. Credentials stay behind
the M14 store and the M87 broker with the M102 approval on writes.

Act VI, sharing and export. A canvas or a workflow as one portable file another person can
open, with the record rules (absent, malformed, unknown), the M39 redaction on anything that
leaves, import through the launcher and the `tc` CLI, and the existing exports kept.

Act VII, the extension surface. A documented way to add a node kind or a panel kind without
editing this repository: what a plugin is, where it lives, what it may declare, what it may
never do (the M103 guest hardening and the M112 Electronegativity list are the floor), and
one example plugin built and shipped under `docs/`.

Act VIII, the finish. A feedback door (a menu item that opens a GitHub issue in the browser
prefilled from the M91 diagnostics bundle, scrubbed by its type as that bundle already is),
the DMG through `npm run package`, `docs/getting-started.md`, the third UX audit walked over
every golden, the reconcile to 5.0.0, and this run's ledger closed.

One rule spans every act. Every user-facing verb you add or touch exists through four doors:
a canvas gesture, a palette row, a workflow node kind, and something an agent can be asked to
do through `src/shared/verb-table.ts`. An omission is written in the ledger with its reason,
and a check in the style of `verify:verbs closure.1` turns a missing door into a red check
rather than a forgotten one.

## OUTPUT

Act 0 comes before any code. Run `npm run verify` once and record the green baseline with
its tallies. Write `docs/superpowers/specs/2026-09-07-v9-plan.md` holding the act and
milestone table from M180 onward with one line per milestone naming what it ships and which
doors it touches, the dependencies you expect to add and why, and the items you already know
a person will owe. Write `docs/superpowers/specs/2026-09-07-v9-design-brief.md`, the 5.0
brief: the Obsidian material survives (dark flagship, cyan accent, glass over blur, 12px
corners, system SF, `--font-mono` only for code, one primary control per surface, one resting
shadow), and Orca and n8n contribute canvas objects as equals, an inspector that edits a
node's configuration, and a library you drag from; a 4.1 principle you retire is struck
through with a reason, never deleted. Then print the milestone table and the sentence "Type
go to start, or anything else to amend." and wait. On `go`, begin Act I and do not wait for a
person again. Anything typed other than `go` is an amendment; fold it into the plan and
continue.

Each milestone keeps the shape nine runs refined: a spec in `docs/superpowers/specs/`, a plan
in `docs/superpowers/plans/`, checks written first and watched failing against the module
that does not exist yet, the implementation, the critic and verifier, a ledger line with its
evidence. Commits are conventional and scoped by milestone (`feat(m181): …`). One branch per
act (`v9-act1-onboarding` and so on), merged to `main` with a merge commit when the act's
build log is written and the chain is green. Tag `v5.0.0` locally at the end only.

Write the build logs, the ledger and the final message in clear, concise paragraphs, each
developing one main idea, in plain language and active voice. Use lists only when the
information is parallel or easier to compare, and tables only where a count matters. Avoid
slop words and phrases like "delve", "leverage", "it's worth noting", "importantly", "In
short:", "Bottom line:", "This isn't about X, it's about Y", and summary closing statements.

The final message, in this order: whether the stop condition is met and which parts are
not; the pasted tallies and exit codes of `npm run verify`, `npm run verify:visual` and
`npm run verify:packaged`; per act, what shipped, what was declined and why, and the hours
spent; the owed list, every hand check a person must do with its command or step; the DMG's
path and size and the one sentence a stranger needs to open it; and whether `main` is
shippable right now, in one sentence. Write it for a person who did not watch the run.

## VERIFICATION

Match verification to risk. Do not write tests for reversible, low-impact changes that mirror
the implementation. If you do choose to verify your work with tests, make sure that the tests
are meaningful and necessary to verify implementation. A new check pins a property that fails
silently without it, in the style `docs/verify-suites.md` describes, with a scoped string id
(`ok('preview.1 …')`) and never the next integer. A change to a seam, to the credential path,
to the broker or to anything that leaves the app gets the full chain plus a check of its
own; a restyle gets its goldens regenerated through `npm run verify:visual`, each changed
scene given the critic's sentence in the ledger before `UPDATE_GOLDENS=1` writes it. Rerun a
suite only when new failures or unresolved issues justify it. Before every merge to `main`
and before the final message, the three commands run and their exit codes are recorded.

## STOP CONDITION

Read this before you stop, every time you consider stopping. Stop when all of the following
are true: `main` is at 5.0.0, tagged locally, clean; `npm run verify` prints every suite's
tally at exit 0; `npm run verify:visual` is green over goldens that each changed on purpose
with a critic's sentence; `npm run verify:packaged` is green; `release/` holds a `.dmg` and
`README.md` states the Gatekeeper right-click step and `docs/getting-started.md` exists;
every act is closed with its spec, plan, red-first checks, critic, verifier, build log and
ledger lines; every capability above is shipped through all four doors or struck in the
ledger with a reason; the 5.0 design brief is finished with every principle implemented or
struck; nothing was pushed, released or modified outside the repository; and the final
message has been written in the order above.

Also stop at 24 hours of wall clock from `go`. Then finish the milestone in flight if it is
under an hour from green, otherwise leave its branch unmerged with a clear note, and write
the final message with "not met" stated plainly beside every part of the stop condition
that is not.

When a rate limit or usage window stops you, wait for it and resume from the ledger; the
ledger is the state of the run, and a resumed session begins by reading it. At each act
boundary write the wall clock spent so far in the act's build log.

If everything reachable is done, report and stop. Do not continue working merely to add
milestones, checks or polish beyond the stop condition.
