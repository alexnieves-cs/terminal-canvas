# Terminal Canvas — the v9 run: finish it, on GPT-6 Astra in Codex CLI

**How to run this.** In `~/Documents/terminal-canvas`, on a clean `main` at 4.1.0, launch:

```sh
codex -m gpt-6-astra -s danger-full-access -a never "$(cat docs/superpowers/specs/2026-09-07-v9-finish-prompt.md)"
```

Read `AGENTS.md` first; it is short and it points at `CLAUDE.md`, which is the law of this
repository. Then write the act plan described in Act 0 and stop for one word. After the
person types `go`, nobody is at the keyboard. Anything they type other than `go` is an
amendment to the plan; fold it in and continue without asking again.

This is the tenth run on this codebase. M1 to M179 are in `docs/build-log/`, README's
milestone table and `CLAUDE.md`. Nine runs made the canvas trustworthy, wide, capable and,
as of 4.1.0, calm. **None of them made it a product a stranger could install and use to do
real work.** That is this run's one job: 5.0.0, a DMG in `release/`, and a canvas where a
software engineer or a vibe coder can arrange agents, code, previews, workflows, media and
integrations as equals and get anything they can think of done through more than one door.

## Goal

Make this application finished and ready for real users, where "finished" means the canvas
reads as one product in the family of Orca (a freeform creative canvas where every object is a
peer), n8n (a workflow graph with a real node library and an inspector that edits a node), and
BridgeMind One (one native window, a rail of named places, agents as first-class objects). The
spine is the Orca shape: a freeform canvas where an agent, a terminal, a file, a preview, a
workflow, an image and a note all sit as equals. The n8n shape and the BridgeMind shape are
features inside it, and both already exist here as seeds (the M133 workflow panel is a
projection of a saved template; the M171 rail is a list of places). Deepen them; never
rebuild one as the spine.

Infer intent and scope from this document and the repository. Bias towards action and carry
the task to completion. Before anything that would need a person, complete every piece of the
work that is already authorized here and make the blocked piece concrete and reviewable.

## The done condition

Read this before you stop, every time you consider stopping. Keep it true-or-false:

> `main` is at 5.0.0, tagged locally, clean, with `npm run verify` printing every suite's
> tally at exit 0, `npm run verify:visual` green over goldens that each changed on purpose with
> a critic's sentence in the ledger, and `npm run verify:packaged` green, all three pasted in
> the final message. `npm run package` has produced a `.dmg` under `release/` that opens on a
> Mac that has never seen this repository, with the Gatekeeper right-click step written in
> `README.md` and a one-page install-and-first-use guide at `docs/getting-started.md`. Every
> act below is fully closed: a spec, a plan, red-first checks, a fresh-context critic AND a
> fresh-context verifier per milestone as subagents, a build log per act, a ledger line per
> milestone with its evidence, and no owed item silently dropped. Every capability in "What
> finished contains" is either shipped through all four doors or struck through in the ledger
> with a reason. The 5.0 design brief is finished and every one of its principles is either
> implemented or struck with a reason. Nothing was pushed to `origin`, no GitHub release was
> created, nothing outside this repository was modified. The final message states, per act,
> what shipped, what was declined and why, what a person still owes, and whether `main` is
> shippable right now.

If a suite is red, if a claim has no command and exit code beside it, if a golden changed
without a sentence, or if an act was entered and left half-built, the condition is not met.
Keep working. If everything reachable is done, report and stop; padding is as much a failure
as quitting early. Do not stop because a decision is ambiguous: where two designs are
defensible, pick one, write the reason in the build log, and move.

## What finished contains

Seven capabilities, in this order. Each is a named act with its own milestones, numbered from
M180. An act may hold two to five milestones; you decide the split in Act 0.

1. **Onboarding (Act I).** A first run that takes a person who has never seen this app from
   launch to a working agent conversation in under two minutes, with no terminal knowledge
   required: which CLIs are installed (the M107 env report already knows), one click to
   install what is missing or a plain sentence about how, a starter canvas that shows one of
   each object kind with a caption, and the M170 agent card as the first thing they talk to.
   Everything after this act is judged by a stranger's first five minutes.
2. **The editable workflow graph (Act II).** M133 draws a saved template as a projection. Make
   the workflow panel an editor: drag a node from a library, wire an edge, edit a node's
   configuration in the inspector, run it, watch the run on the same diagram, save it back as
   the template. The live canvas stays a valid editor of the same record; the two views never
   disagree, and `verify:rail`'s workflow checks say so.
3. **The preview panel (Act III).** A live app preview beside the code: a dev server's
   localhost rendered in the M103 browser guest, auto-discovered from the project (a port a
   panel's process opened, or a `dev` script in `package.json`), reloading on the M84 watcher's
   file change, with a device-width preset and a screenshot verb an agent can be asked for.
   This is the vibe coder's loop: ask, watch it change, ask again.
4. **The media and design layer (Act IV).** Beyond M155's ink: images (dropped, pasted, or an
   agent's screenshot) as canvas objects, sticky notes, frames that name a region, freeform
   text, all with the M92 marks and the M93 annotation record rules, all as equals of a panel
   in tiering, selection, grouping, undo and export.
5. **The node library and integrations (Act V).** A real library of workflow node kinds with
   the n8n posture: HTTP request, webhook in, cron, GitHub (through the M87 broker, never the
   credential store), Slack, email, a shell step, a transform step, an agent step, and one
   documented way to add another. Each node has a schema the inspector renders from, a
   built-in test-this-node verb, and an example. Credentials stay behind the M14 store and the
   M87 broker with the M102 approval on writes.
6. **Sharing and export (Act VI).** A canvas or a workflow as a file another person can open:
   one portable format with the record rules (absent, malformed, unknown), the M39 redaction
   applied to anything that leaves, import through the launcher and the `tc` CLI, and the
   existing PNG and text exports kept.
7. **The extension surface (Act VII).** A documented way for a user to add a node kind or a
   panel kind without editing this repository: what a plugin is, where it lives, what it may
   declare, what it may never do (the M103 guest's hardening and the M112 Electronegativity
   list are the floor), and one example plugin built and shipped in `docs/`.

Then **Act VIII, the finish**: the feedback door (a menu item that opens a GitHub issue in the
browser, prefilled from the M91 diagnostics bundle, scrubbed by its type as that bundle
already is), the DMG, the getting-started guide, the third UX audit walked over every golden,
the reconcile to 5.0.0, and this run's ledger closed.

## The four doors rule

Every user-facing verb this run adds or touches exists through all four doors, or the
omission is written in the ledger with the reason: a **canvas gesture**, a **palette row**, a
**workflow node kind** (so anything a person can do, a workflow can do), and a **thing an agent
can be asked to do** (through M96's verb table, so a chat can run it as a plan). This is the
property that makes the app n8n-like without cloning n8n. `verify:verbs closure.1` already
fails for a verb that is on neither list; extend the same idea so a verb missing a door is a
red check, not a forgotten one.

## Act 0: the plan, and the one pause

Before touching code: read `AGENTS.md`, `CLAUDE.md`, `README.md`'s milestone table, the
4.1 ledger (`docs/build-log/m161-m179-ledger.md`), the Obsidian brief and the 4.1 product
brief, `docs/ideas-backlog.md`, and the end of `docs/load-bearing.md` (the manual-only list).
Run `npm run verify` once and record the green baseline with its tallies. Then write:

- `docs/superpowers/specs/2026-09-07-v9-plan.md`: the act and milestone table (M180
  onward), one line each with what it ships and which door it touches; the 5.0 design brief's
  outline; the dependencies you expect to add and why; the items you already know a person
  will owe (a signing identity, a Slack app, a Jira tenant); and the quota strategy below.
- `docs/superpowers/specs/2026-09-07-v9-design-brief.md`: the 5.0 brief. The Obsidian
  material survives (dark flagship, cyan accent, glass, 12px corners, SF, one primary control
  per surface, one resting shadow, `--font-mono` only for code). Add what Orca and n8n
  contribute: canvas objects as equals, an inspector that edits a node's configuration, a
  library you drag from. Any 4.1 principle you retire is struck through with a reason, never
  deleted. A golden still changes only with a critic's sentence.

Print the plan's table and the sentence "Type go to start, or anything else to amend." Wait.
On `go`, begin Act I and do not pause again for a person until the done condition is met or
the ceiling below is reached.

## How to work

**The shape of a milestone**, which nine runs have refined and which you keep: a spec in
`docs/superpowers/specs/`, a plan in `docs/superpowers/plans/`, checks written first and
watched failing against the module that does not exist yet, the implementation, then two
subagents with fresh context and no memory of your reasoning: a **critic** who reads the
diff and the goldens cold and writes one sentence per changed scene and a list of findings,
and a **verifier** who runs the commands and confirms every claim with an exit code. Their
findings are fixed or declined by name in the ledger. Delegate whenever a task can run in
parallel without shared state: the critic and verifier always, red-first check writing for
independent modules often. Messages to subagents and your final answer will be read by a
person; keep them legible.

**Minimality.** Make the targeted change, not the comprehensive one. Avoid unrelated cleanup
and unnecessary complexity. A milestone that touches forty files where eight would do is a
finding the critic should raise. Do not write tests for reversible, low-impact changes that
mirror the implementation; every check you add pins a property that fails silently without
it, in the style `docs/verify-suites.md` describes, with a scoped string id, never the next
integer.

**Research.** The repository already holds the answers to nearly every question about itself:
`docs/load-bearing.md` and `docs/load-bearing-recovered.md` by grep, `docs/verify-suites.md`,
the build logs. Read those before the web. Reach for the web only for a third-party API's
current shape (Slack, GitHub, an npm package), never to confirm what the repository states.

**Reasoning effort.** Run at `high`. Raise to `xhigh` with `/model` for the Act 0 plan, for
any change to a seam (`ipc-contract.ts`, `layout-schema.ts`, `agent-session.ts`, the
template-node union), and for a debugging loop that has failed twice. Drop back after.

**Branches.** One branch per act (`v9-act1-onboarding` and so on), merged to `main` with a
merge commit when the act's build log is written and the chain is green. Tag `v5.0.0` only at
the end. Commits are conventional and scoped by milestone (`feat(m181): …`). Never push.

**Rules may be struck, never ignored.** Every rule in `CLAUDE.md`, the briefs and the
load-bearing files is binding until you strike it in the ledger with the reason and the
check you changed. The DOM aliases roughly two hundred checks select on, `.pf__body` never
transformed, xterm's cell metrics, the PTY flush gate, the credential store's three readers
and the broker's audit are the ones you should expect never to strike.

**Dependencies.** You may add one with a written reason in the plan and the ledger. Prefer
none; prefer small; never a styling dependency (no Tailwind, no component library, no icon
font; `icons.tsx` grows). Run `verify:electron` after any native module.

**When blocked by something only a person can do** (a signing identity, a Slack workspace
token, a Jira tenant, a second Mac): build the feature against a fake as the repository
already does everywhere, record the hand check as owed in the ledger's owed list, and continue.
Never stop for it, never pretend it was checked.

**When something you cannot fix is real**: a suite red at your baseline, a dependency that
will not build on this machine, a design that contradicts the load-bearing file in a way you
cannot resolve. Write it in the build log with what you tried, pick the smallest version of
the milestone that ships without it, and move on. Do not loop on it past two attempts at
`xhigh`.

## Ceiling and quota

The person is on a ChatGPT Plus login, so the meter is a usage window, not dollars. The
ceiling is **24 hours of wall clock from `go`**, or the done condition, whichever comes
first. When a rate limit or quota window stops you, wait for it and resume where the ledger
says you were; the ledger is the state, and a resumed session starts by reading it. At each
act boundary write the wall-clock spent so far in the act's build log. At the ceiling, finish
the milestone in flight if it is under an hour from green, otherwise leave the branch
unmerged with a clear note, and write the final message as if done, with "not met" stated
plainly beside every part of the done condition that is not.

## What you must never do

Push to `origin`. Create a GitHub release or any remote object. Modify anything outside
`~/Documents/terminal-canvas` other than the ordinary `~/.codex` state. Use a credential you
find on disk for anything but the app's own recorded paths (the M87 broker's audit row is
the proof). Weaken or delete a check to make a suite green. Re-baseline a golden blind. Add a
styling dependency. Claim a verification you did not run.

## The final message

In this order, in plain prose with a short table where a count matters:

1. Whether the done condition is met, and which parts are not.
2. The three command outputs pasted: `npm run verify` tallies and exit code,
   `npm run verify:visual`, `npm run verify:packaged`.
3. Per act: what shipped, what was declined and why, hours spent.
4. The owed list: every hand check a person must do, with the command or step.
5. The DMG's path and size, and the sentence a stranger needs to open it.
6. Whether `main` is shippable right now, in one sentence.

Write it for a person who did not watch the run. Concise paragraphs, plain language, active
voice. No lists where prose reads better, no filler.
