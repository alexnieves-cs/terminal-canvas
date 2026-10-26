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
- **M542** — dispatch and poll in main (`src/main/cloud-lanes.ts`): the GitHub
  calls go through the broker (the client never reads the token), each write on
  `outward`'s list with a critic, polling backed off and paused while the app
  is hidden.
- **M543** — the panel: a `cloud` lane card on the canvas showing the state word,
  the PR, its checks and the diff stat; opened from a task ("Send to cloud"), the
  palette, an agent line and a workflow node (the four doors).
- **M544** — review and merge from the canvas: the review layer reads the PR's
  diff, and Accept merges through the broker.
- **M545** — the morning queue ranks a ready cloud lane beside local lanes, and
  the collision radar trial-merges its head against local worktrees.

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

### J decisions

- **The code word is `vm`, the person's word is "sandboxed".** M120's `sandbox`
  (`main/sandbox.ts`) is a chat with no place, a folder on the Mac that still
  asks every permission; the two must never be read as one.
- **Claude Code only.** `vmAgentArgv` refuses any other binary by name: prompts
  off is claude's `--permission-mode bypassPermissions`, and no other backend's
  equivalent has been measured inside a VM.
- **The model's token is the one credential, by name.** A Mac's `claude` keeps
  its sign-in in the Keychain, which a VM must not read, so the lane forwards
  `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY`
  from the login env as `-e NAME`: the value never sits on an argv. With
  neither set, the spec is refused with that sentence.
- **Two mounts, never home.** The worktree at `/work` and an app-owned state
  folder at the agent's `~/.claude` (so a lane's later processes can resume its
  own conversation). A first spawn's `--resume` becomes `--session-id`, since
  the Mac's transcript is not in the VM. `--settings` is dropped: its hooks call
  `tc` over a socket that is not mounted, by design.
- **Egress through the app's proxy only.** `HTTPS_PROXY` points at a proxy main
  runs; the image's entry script (it holds `NET_ADMIN` for this alone) drops
  every other packet before it runs the agent as an unprivileged user. The
  decision is `vmEgressAllowed`: HTTPS (443) to a listed host or a strict
  subdomain of a `*.` entry; never an IP literal.
- **Runtime order:** Apple `container` (macOS 26, Apple silicon), then OrbStack,
  then Docker. With `orb` installed the docker CLI is OrbStack's, so only one
  row is usable for one engine. A runtime whose service was not asked or did not
  answer is never reported usable.

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

Decisions (lane N):

- **The renderer is not forked.** `vite.web.config.ts` builds `src/renderer`
  as it is, entered through `src/web/main.ts`, which installs the fake bridge
  first. The demo is what the app draws; nothing under `src/renderer` knows it
  is in a browser.
- **The fake is typed where it answers, and answers by declared shape
  elsewhere.** `src/web/fake-bridge.ts` checks each door it implements
  against `CanvasBridge`. Every other door is a Proxy (`stub-door.ts`) that
  answers in the return shape `scripts/lib/bridge-shapes.cjs` reads off the
  contract: `[]`, `null`, or the union's "not here" member. A plain-record
  read has no stand-in, so each is answered by hand (`demo.shapes.2`). The
  method's name decides only whether the visitor is told "in the app". A
  name-based guess blanked the page from the find box (the critic's finding).
- **The world is `world-sim` itself**, given scripts keyed by the cast's
  panel ids, so the World room, the panel state word and the terminal read one
  stream. Scripts open on the cast's frame (3 waiting, 1 failed, 4 working,
  `demo.world.1`), then work, wait for you, and finish.
- **The canvas is the rd-steward cast**, through a TS port of `load.cjs`
  (a browser cannot `node:fs`); `demo.layout.1` holds the two byte-equal.
- **Not an outward door.** The page is built in CI from fixture text only;
  nothing on a person's Mac reaches it, so it does not join `outward`'s list.
  Telemetry is pinned off (`demo.bridge.2`).
- **The browser half is a smoke test, not a suite.** `scripts/demo-smoke.cjs`
  needs a browser and `out/web`; pages.yml runs it on every PR and before each
  deploy, using the runner's Chrome through `playwright-core --no-save`, so
  the lock file does not change.
- **First visit skips setup.** The app's four-step setup names a workspace and
  probes a Mac; `src/web/first-visit.ts` stamps the version so a visitor lands
  on the canvas.

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
