# Lanes H–O — bold directions (M540–M579)

From the 2026-10-26 direction review ("Where Terminal Canvas goes next", a doc in
the project thread). Alex's answer: "do all of them". Seven lanes, one idea each,
run as streams under [RUN.md](RUN.md): the same ownership hook, the same
`st:<lane>` CSS fences, one ledger row per merged PR in
[m457-m509-ledger.md](../build-log/m457-m509-ledger.md).

This file is shared by every lane (it is in `shared_writable`). A lane edits only
its own section, and records each decision it makes there.

| Lane | Idea | Milestones | Suite | Size |
|---|---|---|---|---|
| H | Cloud lanes on the canvas | M540–M545 | `verify:cloud` | L |
| I | Tournament mode | M546–M549 | `verify:tournament` | M |
| J | Sandboxed lanes in a micro-VM | M550–M555 | `verify:vm` | L |
| K | Fork from any turn | M556–M560 | `verify:fork` | M–L |
| L | The night as a film | M561–M564 | `verify:film` | M |
| N | A live demo in the browser | M565–M569 | `verify:demo` | M |
| O | A harness that learns | M570–M579 | `verify:learn` | L–XL |

There is no lane M, so a lane id is never read as a milestone.

## Rules every lane here keeps

- **Set your lane first:** `echo H > .git/tc-lane`. A lane owns its
  `scripts/verify-<name>.cjs`; new source files nobody owns are open to all, so
  claim one in `ownership.json` in the same PR if a second lane starts editing it.
- **The suite key goes into `package.json` in the PR that writes the script**,
  never before: the runner derives its list from the keys, and a key with no
  script is red.
- **Plain-node first.** Each lane's core is a pure module driven by fixtures in
  its suite (the `verify-borrow.cjs` shape). Nothing in `npm run verify` calls
  the network, a cloud agent, a VM runtime or a real CLI.
- **Outward doors pass the gate.** Anything that leaves the Mac (a GitHub write,
  a published page, an exported film) goes through `outward`/`redactSecrets`,
  joins the caller list, and gets a fresh-context critic before merge.
- **Off by default** where the feature spends money, writes outside the app, or
  runs an agent without prompts. A Settings switch turns it on.
- **Never write goldens.** A lane that changes a scene asks for a shots gallery
  and waits for Alex to look.
- Threads may review and merge their own PRs once CI is green.

## H — Cloud lanes on the canvas (M540–M545)

A lane whose agent runs in the cloud and comes back as a pull request. The PR is
the interface every cloud agent already speaks, so a lane is "a PR I'm waiting
on" and a provider is a row in a table, not a code path.

- **M540** — scaffolding: lanes H–O in `ownership.json`, the `st:` fences,
  `streams.own.1` covers A–O, this file, the run book's rows.
- **M541** — the model (`src/shared/cloud-lane.ts`): a `CloudLane` record
  (repo, issue or branch, provider, PR number, state), the provider table (Copilot
  coding agent: assign the issue; Claude GitHub Action: an `@claude` comment), and
  a pure reducer from GitHub facts (issue, PR, check runs, reviews) to one lane
  state: `dispatched → working → pr-open → checks-running → ready | failed |
  needs-you | merged | closed`.
  *Built:* there is no separate `pr-open` word, since an open PR is either a
  draft (`working`), running checks or settled by them. The Copilot assignee
  login and the `@claude` mention are data, and they are manual-only facts,
  because the suite never calls GitHub.
- **M542** — dispatch and poll in main (`src/main/cloud-lanes.ts`): the GitHub
  calls go through the broker (the client never reads the token), each write on
  `outward`'s list with a critic, polling backed off and paused while the app
  is hidden.
- **M543** — the panel: a `cloud` lane card on the canvas showing the state word,
  the PR, its checks and the diff stat; opened from a task ("Send to cloud"), the
  palette, an agent line and a workflow node (the four doors).
  *Built:* no new panel kind. The lane shows on the task's own work card (a
  `cloud` row with the state word, its reason and the PR), because a second
  card for the same task would split its facts. `cloudDispatchFor` builds the
  one request every door sends; a teammate's plan cannot `cloud-send`.
- **M544** — review and merge from the canvas: the review layer reads the PR's
  diff, and Accept merges through the broker.
  *Built:* the card's PR link opens the PR's files on GitHub, and the card
  shows its size. Merge appears only on a ready lane; main re-reads the lane
  and merges only if it is ready now, pinned to the head its checks passed on
  (a later push makes GitHub refuse with 409), after an ask that lists the
  files. Reading a cloud PR inside the in-app review layer is not built: that
  layer reads a local worktree, and fetching the PR into one is M545's radar
  work, so it lands there or later.
- **M545** — the morning queue ranks a ready cloud lane beside local lanes, and
  the collision radar trial-merges its head against local worktrees.
  *Built:* the queue's module is stream C's, so cloud items are built in
  `cloud-lane.ts` and merged in by the queue's own order, which
  `verify:cloud morning.1` reads from its source. The radar fetches the PR head
  into a hidden ref, `refs/tc/cloud/<lane>`, in the repository's main tree.
  That is the one write: a fetch sends nothing but the ref name, it never
  prompts, and git's own error text is not repeated, because a remote URL with
  a token in it is what a fetch error prints.

Lane H is complete at M545. The real-GitHub facts (Copilot's assignee login
and branch prefix, the Claude Action's `claude/` branches) stay manual-only.

## I — Tournament mode (M546–M549)

One task, N agents, each in its own worktree; the task's check decides.

- **M546** — the model: a `Tournament` (task, entrants by preset, check, budget
  each) and a pure scorer over entrant outcomes (check pass, diff size, cost,
  time, overlap with other lanes). A failed check never wins on cost.
- **M547** — the runner: spawn entrants through the existing worktree and preset
  paths, run the check per worktree when each finishes, stop any entrant over
  budget.
- **M548** — the bracket on the canvas: entrants side by side with pass or fail,
  diff stat, cost and time; Pick winner accepts one lane and discards the rest.
- **M549** — the judge: an optional agent writes a short comparison of the
  passing entrants; `combine` can take the best parts.

## J — Sandboxed lanes in a micro-VM (M550–M555)

A Tonight lane can run its agent inside a throwaway Linux VM, so it can run with
prompts off without touching the Mac.

- **M550** — the runtime probe: Apple's `container` CLI (macOS 26, Apple
  silicon), then Docker or OrbStack, as optional tools in the environment report.
- **M551** — the sandbox spec, pure: only the lane's worktree mounted
  read-write, no home folder, no credentials, a network allowlist, CPU and memory
  caps, and the argument builder for each runtime.
- **M552** — the runner: start, attach the PTY, stop and clean up on every way a
  lane ends; a sandboxed lane is labelled as such everywhere it shows.
- **M553** — Tonight and auto mode can pick "sandboxed, prompts off" per task,
  off by default; the result still passes the check gate and the morning queue.
- **M554–M555** — the network allowlist and egress log, and a Mac check recipe.
  CI's macOS runners most likely cannot run nested VMs, so the suite fakes the
  runtime and the real-Mac check is listed as manual-only in
  `docs/load-bearing.md`.

## K — Fork from any turn (M556–M560)

- **M556** — a snapshot per turn: at each turn boundary, the lane's tree is
  written as a commit under a hidden ref (`refs/tc/turns/<panel>/<n>`), never
  touching the branch, the index or the stash.
- **M557** — the fork: a new worktree at turn N's snapshot, and the conversation
  resumed from that turn (Claude Code `--resume` with `--fork-session`; a
  backend without it forks the tree only, and says so).
- **M558** — Replay's "Branch from here", and the fork placed beside the original.
- **M559** — compare: Replay's compare view shows the original and the fork.
- **M560** — pruning: snapshot refs are bounded and removed with the panel.

## L — The night as a film (M561–M564)

- **M561** — the script, pure: from the night's event log and run ledger, a list
  of shots (panels appearing, state changes, attention, the morning queue) on a
  fixed 60-second timeline.
- **M562** — rendering: the World's replay drives the camera through the script
  and frames are captured offscreen.
- **M563** — encoding to MP4 through the export gate (text in frames is scrubbed
  before capture; the gate reports its count).
- **M564** — a "Last night" button on the morning queue, and a generated clip for
  the README in place of the mockups.

## N — A live demo in the browser (M565–M569)

- **M565** — a web build target of the renderer with the `window.canvas` bridge
  stubbed by a typed fake.
- **M566** — `world-sim` feeds the fake, so scripted agents work, wait and finish.
- **M567** — terminals show recorded sessions (no shell in a browser), and every
  door that would spawn or write says "in the app".
- **M568** — a Pages workflow publishes it on merge to main.
- **M569** — the README links it.

## O — A harness that learns (M570–M579)

- **M570** — the signal: a discarded hunk or a review comment becomes a lesson
  record (what was wrong, where, which task).
- **M571–M572** — a proposal: an agent turns related lessons into a CLAUDE.md
  line or a skill, shown as a draft, never written on its own.
- **M573–M575** — the proof: replay the earlier task with the proposal applied
  and keep the proposal only when the mistake does not recur and the check still
  passes.
- **M576–M579** — the library: accepted rules, where each came from, and a way
  to retire one.
