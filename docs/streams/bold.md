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
| P | Multiplayer canvas (added 2026-10-26) | M580–M589 | `verify:multiplayer` | M–L |
| Q | The app, hosted (opens from any browser) | M590–M599 | `verify:host` | L |

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

Decisions (lane I):

- **An entrant is a chat session, by backend and model, not a terminal
  preset.** Only a chat has a turn end, a spend meter and M475's check gate;
  a terminal preset has none of the three, so "the check decides" could not
  hold for it. (2026-10-26, M546.)
- **The check is required.** A spec without one is refused by name: ranking
  N claimed dones by diff size is ranking by who did the least.
- **Eligibility before every metric.** Only `checked` with a non-empty, readable
  diff can win; then diff size 0.4, overlap with lanes outside the tournament
  0.3, cost 0.2, time 0.1, each min–max over the passing field, ties kept in
  the order given. Entrants never count overlap against each other.
- **An unreported cost is the middle of the field, never $0**, and a dollar
  budget over a backend that reports no cost is refused unless a time limit
  holds it.
- **Main runs, the renderer names and places** (M547–M548). The renderer
  mints each entrant's panel id and places the chats beside the card; main
  makes each worktree, creates each chat through the same door as
  `agent:create`, and starts each checked run. Entrants fork from the main
  tree, whatever folder of the repository the task's lane was in.
- **A tournament starts from a task that has a lane and a check.** The lane
  says which repository; a never-started task is refused by name rather than
  guessed into one. The default field is claude opus and sonnet plus every
  other agent found, up to four.
- **The bracket is a screen-space overlay, not a new panel kind** (M548): it
  holds no authored state, draws nothing until a tournament has run, and so
  changes no resting scene and no golden. Its colour is the entrant's tone
  through `[data-tone]`.
- **Pick keeps the winner and closes the other chats; it removes no
  worktree.** The winner becomes the task's lane (`panelId`, `worktreeId`),
  so Review, Open PR and the morning queue read it through their own doors.
  Losing branches may hold work a person wants; the Worktrees list removes a
  lane on purpose. Only a scored, eligible entrant can be picked.
- **The judge is advice, never a second scorer** (M549): a read-only (plan
  mode) claude chat at the main tree, shown only the passing entrants.
  Combine opens the task's Combine tab, which already checks a combined tree
  before anything lands, rather than growing a second merge path.
- **The door is the card's Swarm… menu**, not a new card button, so the
  card's resting face is unchanged.

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

- **The VM wraps the runner, not the manager.** `vm-lanes.ts` turns a
  sandboxed panel's spawn into `container run …` through the same real runner,
  keyed on the `TC_PANEL_ID` every chat process already carries (M102), so the
  manager (lane C's) is unchanged. The VM client's env holds PATH, HOME and the
  token only, never the app's socket or a panel token.
- **The check runs in the VM too**, in a second fresh VM named `…-check`: a check
  is code the agent may have written with prompts off, and running it on the Mac
  would hand the Mac exactly what the VM keeps off it.

- **Off by default twice.** The `vm.lanes` setting (never `planWritable`)
  must be on AND the task must ask. Tonight takes it per task (`sandboxed: true`
  in the batch) or for the whole night (`tonight sandboxed`); auto mode has one
  extra palette row, present only while the setting is on, so no default
  surface or golden changes.
- **Entering stops the Mac process and waits for its exit**; a Tonight batch
  holds its lanes until the batch ends (a task paused by a usage limit resumes
  as a new auto run, which must start in the same VM); an auto run's lane
  leaves when the run resolves, and the chat's next message runs on the Mac with
  its prompts again.
- **One proxy per place a VM reaches the Mac**, started on the first sandboxed
  run: the vmnet bridge's `.1` for Apple's runtime, loopback (reached as
  `host.docker.internal`) for Docker and OrbStack. Lanes are told apart by Basic
  proxy credentials, a fresh 48-hex secret per lane; every CONNECT is logged,
  allowed or refused, to `userData/vm-lanes/egress.jsonl`.
- **The VM's egress is not an `outward` door**: `outward`/`redactSecrets` gate
  TEXT the app sends; this is the agent's own traffic, gated by host instead. It
  got a fresh-context critic as a boundary.
- **The critic's findings, fixed before merge.** The worktree's `.git`, `.claude`,
  `.mcp.json` and `.gitmodules` are re-mounted read-only (a VM-written
  `core.fsmonitor` or hook would run on the Mac at the app's next git call); the
  chat folder is `realpath`ed and the home check is normalised and case-folded; a
  `,` `"` or `=` in a path is refused (it would inject `--mount` options); the
  image's lock is named as `--entrypoint`; IPv6 fails closed too; a chat with a
  live Mac auto run is refused before anything is killed; lane ids carry a hash
  of the whole panel id. Residual, by design: an allowed host is still a way out
  for what the agent reads, and the setting's copy says so.
- **Morning-queue label: a request, not an edit.** The queue (`task-queue.ts`)
  is lane C's; the chat header and Tonight's status rows carry `sandboxed` now, and
  `requests.md` asks for the queue's row.

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

**Built (one PR, M556–M560).** Suite `verify:fork`, plain node against a real
temporary repository. Decisions:

- **A turn is a prompt.** Turn N is "after the agent answered the Nth message a
  person typed", counted from the durable transcript (`promptCount`), not from the
  process's result count, which restarts with the process. The UI says *message
  N*, because Replay's own counter counts both sides.
- **Off by default** (`agents.turnSnapshots`, "Snapshot each agent turn"): a
  snapshot writes objects and a ref into the person's repository.
- **Capture** (`src/main/turn-forks.ts`, called from the agent fan-out in
  `bootstrap/agent-runtime.ts` on each `result`): `git add -A` into a *copy* of
  the index, `write-tree`, `commit-tree` as "Terminal Canvas", `update-ref
  refs/tc/turns/<panel>/<n>`. Plumbing on purpose: the person's commit hooks must
  not run on a snapshot. An unchanged tree reuses the previous commit. Captures
  per panel are serialised.
- **The conversation is copied and cut, not `--fork-session`.** That flag forks at
  the end of a session, and claude finds a session by its cwd's project folder,
  which a fork in a new worktree does not share. Main cuts claude's JSONL before
  prompt N+1, re-addresses every record (new `sessionId`, the fork's `cwd`) and
  writes it under `~/.claude/projects/<slug of the fork's cwd>/`. A backend row
  without `forksTurns` (every one but claude) forks the files only and says so.
- **Two doors:** Replay's "Branch from here" (reached from the inspector's
  "Replay this conversation…" and its palette row), and "fork from here" on an
  answer's hover in the chat itself (the UI audit's ask: a door where people
  already are). The verb is
  `canvas/useForkVerb.ts`; it places the fork beside the original and switches the
  sheet to compare the two (M559), with a "branched from … after message N"
  caption. No palette, agent-line or workflow door yet: each needs a turn picked,
  which only the sheet and the transcript show.
- **Pruning (M560):** capturing turn n deletes every snapshot past n (a recycled
  id or a cleared chat) and the oldest past 50; closing a chat deletes all of
  its snapshots. Fork worktrees are ordinary worktree records, removed the usual
  way.
- **Manual-only:** that claude resumes the cut copy from the fork's folder is
  left to a hand check, not CI; it is listed in `docs/load-bearing.md` as not
  yet confirmed, with the steps.

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

**Decisions (lane L, 2026-10-26):**

- **Drawn, not captured.** The plan said the World's replay drives the camera and
  frames are captured. The World's journal holds one hour and a night is eight, and
  a capture of the canvas is pixels the gate cannot scrub (the PNG door's exception,
  `docs/load-bearing.md`, does not cover a second binary export). So the film is a
  schematic of the canvas drawn from the script: the panels at their canvas
  positions, coloured by the one state palette, a camera that pushes in on each
  shot. Every word in it passed `outward` when the script was built.
- **Encoded in the app, no ffmpeg.** WebCodecs (H.264, VideoToolbox on a Mac) in
  the renderer, and a small MP4 writer of our own (`src/shared/mp4-mux.ts`) rather
  than a library; a minute renders in about ten seconds.
- **Where the night comes from.** The run ledger (main reads it through
  `film:night`, since `ledger:timeline` is capped at 200 rows) and the Tonight
  batch. The window is the batch when one ran, else the absence, else twelve hours.
- **The README clip** is `docs/assets/night-film.gif`, the app's own film code run on
  a labelled sample night by `scripts/film-sample.cjs`. It replaces `tour.gif` (a
  slideshow of the mockups); the still mockups below it stay until real shots
  replace them.
- **Suite:** `verify:film` (`film.script.*`, `film.frame.*`, `film.window.1`,
  `film.mux.*`, `film.door.*`, `film.wire.1`).

## N — A live demo in the browser (M565–M569)

- **M565** — a web build target of the renderer with the `window.canvas` bridge
  stubbed by a typed fake.
- **M566** — `world-sim` feeds the fake, so scripted agents work, wait and finish.
- **M567** — terminals show recorded sessions (no shell in a browser), and every
  door that would spawn or write says "in the app".
- **M568** — a Pages workflow publishes it on merge to main.
- **M569** — the README links it.

## Q — The app, hosted (M590–M599)

Alex's ask (2026-10-26): the whole app in the cloud, opened from any browser,
no Mac needed. Lane N's demo is the renderer on a fake bridge; this lane is
the renderer on the REAL one. [docs/hosted.md](../hosted.md) is the long form.

- **M590** — the host: `src/main/index.ts` bundled with `electron` aliased to
  `src/host/electron-shim.ts`, a hub that is `ipcMain` and `webContents.send`
  over one WebSocket, and the tagged-JSON wire.
- **M591** — the tab: the app's own preload, its `electron` import aliased to
  the socket; dialogs, menu keys, paste and the lost-connection notice.
- **M592** — the gate: a token, a cookie, an Origin check, back-off.
- **M593** — dialogs and links asked of the person in the tab.
- **M594** — the image (`deploy/host/Dockerfile`) and `host.yml`: a browser
  against a host on Linux and against the image, on every PR.

Decisions (lane Q):

- **Main runs unedited, on a stand-in for Electron, not a port.** 24 files
  in `src/main` import 17 Electron names; a shim of that surface is ~400
  lines, and a rewrite of main would be a second main to keep in step. A
  name the shim lacks is a load error on the host, and `host.shim.1`
  inventories every import on every run. (2026-10-26, M590.)
- **The tab runs the preload, not a second bridge.** Aliasing the preload's
  three desktop imports (`electron`, `os`, Sentry's hook) makes every door
  the preload's own line, so the hosted bridge cannot drift from the app's
  (`host.preload.1`). Lane N's fake bridge stays the demo's; nothing is shared
  but the renderer.
- **One live tab.** Main has one window. A newer tab takes over and main sees
  a navigation and a load, a Cmd+R in the app's terms, so tmux keeps every
  shell (`host.hub.3`). Teammates share through the collab server (lane P),
  never through one host.
- **No token, no listening.** Off loopback the host refuses to start, and the
  gate listens before main loads (`host.gate.1`, `host.boot.1`). The image
  never carries a token (`host.docker.1`).
- **Edit keys are the tab's.** Main's Edit menu reads main's clipboard,
  which on a host is the server's; the tab emits `edit:*` itself and pastes
  from the browser's paste event. Other menu keys are matched in the tab and
  run on the host (`host.shim.3`, `host.keys.1`).
- **Not an outward door.** Nothing leaves the person's machine: the page
  and the host are theirs, and the gate is in front of both. The app's own
  outward doors run on the host exactly as on the Mac, through `outward`.
- **Booting main is host.yml's, not verify's.** The Mac runner's node-pty is
  built for Electron's ABI; `verify:host` drives the hub, gate and shim in
  plain node, and `host.yml` boots the real main on Linux with a browser.

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

### O — decisions

- **Two signals, both a person's act.** A discard (per file: the app has no
  per-hunk discard, so "hunk" is the file's changed lines) and a review comment
  once SENT to the agent. A drafted comment is not a verdict yet, and an
  agent's proposed comment (M360) is never a lesson, kept or not.
- **A discard is captured in main, around the one discarder** (`withLessonCapture`
  in `bootstrap/stores.ts`), not at the renderer's five discard doors. The diff
  is read before the discard and the lesson recorded only for paths reported
  gone. Capture failures are swallowed: a lesson never costs the discard.
- **A comment is harvested from the work items** (`sentAt` is the one fact
  every sender writes), offered to main once per launch; main keeps one per id.
  The renderer can record comments only; discard lessons are main's alone.
- **Lessons are keyed by the main tree** (`commonRootOf`), so a lane's lessons
  outlive its worktree. One JSONL per repository under `userData/lessons/`,
  every text field scrubbed, the signature rebuilt from the scrubbed excerpt.
- **The signature** is the excerpt's distinctive identifiers (keywords and
  the scrubber's placeholder dropped), never the person's words. Recurrence
  (M573) is containment: the share of the lesson's signature the replay repeats.
- **The page reads what is there.** Show Lessons lists the lessons for the
  folders the canvas's panels sit in. Reading spends nothing, so the page is
  always on; the agent steps (propose, prove) get the off-by-default switch.
- **The proposer is M252's run** (`claude -p --tools "" --json-schema`), plus
  `--strict-mcp-config` so no MCP server loads: the input is agent-written,
  and an allowed MCP tool would be a door out. That the flag pair leaves the
  run with no tools at all is a manual-only check against the real CLI.
- **`learn.agents`** (Agent state, off, not plan-writable) gates every agent
  step, read at the press; one draft at a time, held until a killed run exits.
- **Scrub, then cut.** Lessons are read whole (64 KB of lines) and scrubbed
  before the 40-line excerpt is cut, and a private key with no END line is
  dropped from its BEGIN. The critic found the first cut kept parts of keys.
- **A rule is a plain sentence.** Invisible characters (controls, format,
  tag block, bidi), HTML comments and Markdown structure are refused, so what
  the page shows is what an agent reads.
- **The proof replays, it does not argue.** A detached `proof-*` worktree
  at the newest lesson's baseline (no branch; removed with `--force` on every
  way out, a crash's leftovers swept at the next replay, never at boot: main
  builds the runner before the single-instance lock). The rule is written,
  the saved setup run, and that tree recorded with `write-tree`; the judge
  diffs the agent's work against IT, so a lockfile `npm install` rewrote, or
  the rule itself, is never mistaken for the replay's work. The diff is
  `diff-index` with CONTENT_DIFF_CONFIG's pins and `--no-renames`; file names
  come from `--name-status -z`. The critic found the first version counted
  both, and read `i/` prefixes under a person's `diff.mnemonicPrefix`.
- **Verdicts, in order:** no-change, recurred (a deletion lesson recurs as a
  deletion), the rule's own file edited (void), no-check, check-failed,
  holds. A replay that touched none of the lessons' files still holds (the
  rule may be "leave that file alone"), and its line says so.
- **The replay agent can edit and nothing else.** `--tools Read,Edit,Write,Glob,Grep`
  (so no shell exists for anyone's allow rule to open — `acceptEdits` alone
  was not enough), `disableAllHooks`, `--strict-mcp-config`, 40 turns, 20
  minutes, killed on quit (and the check aborted). The rule is never written
  through a symlink: a linked CLAUDE.md or `.claude/skills` would land it in
  the person's real file. The worktree's `.git` link is read before the agent
  and the run is void if it changed (Write could point it at the person's
  repository, and `add -A` would stage there). The rule's file is staged with
  `-f`, because `.claude/` is often gitignored.
- **The check runs what the tree holds.** An agent that rewrote `package.json`
  or the test config can make its own check pass; a "holds" that changed one
  of the check's usual files says so by name, for the person to read before
  Accept. Restoring them would also undo a task that legitimately adds a
  dependency, so it is a sentence, not a refusal.
- **Accept is the one write into the repository, and it is fenced.** Only a
  draft whose proof holds for its exact text, checked again as the agent's
  answer was. A CLAUDE.md line lives in one `<!-- tc:learned -->` block the
  app rewrites from its own record and never edits outside; a skill is a new
  `.claude/skills/<name>/SKILL.md`, created exclusively (`wx`), never over a
  file. Never through a symlink; a write the library cannot record is undone;
  temp file and rename. A proof stands for the rule's text AND its kind, name
  and description (the description decides when a skill loads).
- **The markers are whole lines outside fenced code, exactly one pair.** A
  CLAUDE.md that documents the block in inline code or an example is not the
  block (the critic's first finding: everything between two mentions was
  replaced). Two blocks are refused, so a retired rule cannot live on in the
  copy not rewritten. The block takes the file's line endings, and retire
  takes back exactly the separator accept added.
- **An unreadable rule record blocks the block.** The block is rebuilt from
  the records, so while any stored rule cannot be parsed, Accept and Retire
  refuse and name the file; the unread record is carried through every write.
  A read that fails for any reason but ENOENT is an error, never "no file".
- **Accept and Retire are a person's press, on the Lessons page only** — a
  deliberate exception to the four doors: a palette row would be a fifth way
  to the same button, but an agent line or a workflow node would let an agent
  write a standing rule for agents, which is the one thing this lane forbids.
- **Not defended:** a hostile process swapping a symlink into the main tree
  between the `lstat` and the write. Accept runs in the person's own checkout
  at their press; the replay, where an agent IS the threat, is guarded.
- **Retire keeps the row.** The line leaves the block (the last one takes the
  block, and a file that held nothing else); a skill is removed only while
  its hash matches what was written; a block someone removed by hand is not
  put back. The retired rule stays in the library, struck through, with why.
## P — Multiplayer canvas (M580–M589)

Added 2026-10-26 from the second direction list (Alex: "do 2 and 1"; #1 is this
lane, #2 is lane Q, the hosted web version). The shared canvas itself already
exists (M330–M348: accounts, presence and cursors, the per-field CRDT, roles,
shared text, the relay, the collab server), and so does the team's approval
queue (M375–M379). What a team still could not do on it was pass work to each
other or review each other's results. This lane adds those two, in the same
workspace Y.Doc, judged by the same one table in three places (renderer, main,
server).

- **M581 — the record and its rules** (`shared/canvas-ops.ts`, `shared/canvas-doc.ts`,
  `shared/team-flow.ts`). Two new maps, `canvas:handoffs` and `canvas:reviews`,
  field map per object, one field per person, each written once.
- **M582 — main** (`main/presence/canvas-sync.ts` `teamFlow`/`writeFlow`,
  `bootstrap/presence-wiring.ts` `createTeamFlowDoors`) and the doors
  `team:flow`, `team:flow-write`, `team:flow-changed`.
- **M583 — the screens**: Needs you's "Handed to you", "Review queue" and
  "Waiting on your team" (`renderer/team-flow/`), and palette rows to hand off,
  offer to anyone, ask for a review, take, approve and ask for changes.

### P decisions

- **A handoff moves responsibility, never a process.** An agent runs on one
  Mac; what passes is who holds it (its *steward*): whose questions and review
  it is. The panel's owner is its first steward. Moving the process is the
  relay's job (M335) and is not reinvented here.
- **A handoff settles by its replies, without its maker's machine.** "I'm
  leaving, take this" is the common case, so an offer that waited for its maker
  to come back online to close it would not be a handoff. Named: that person's
  accept hands it, their decline ends it. Open to anyone: the first accept.
- **The chain is ordered by the server, never by a clock.** Each handoff
  carries `n`, its place in the panel's chain; the server checks it against
  the handoffs already handed, and only the current steward may open the next,
  one at a time. The steward is the taker of the highest `n`.
- **Nobody reviews their own result.** The poster cannot claim or judge their
  own review: the point is a second pair of eyes. One "changes" decides it over
  any approvals (the asks' rule); otherwise one approval. The queue hides a
  review as soon as it is decided, and its poster closes it with Done — only as
  withdrawn or as the verdicts decided, never "approved" on their own word. It
  is not closed automatically: a close one tick after the first verdict would
  refuse a second reviewer's verdict in flight.
- **One handoff per panel per update.** Each is judged against the chain as it
  stood, so the server refuses a second in the same update, and `stewardOf`
  breaks a tie by id so every reader agrees.
- **Names are main's.** `team:flow-write` names a workspace, an object and a
  choice, never a person; main writes the signed-in person, and the server
  checks that against the connection. Words leave scrubbed and counted
  (`redactSecrets` in canvas-sync, an existing caller).
- **Between people only.** `teamFlow` is excluded from the verb table with its
  reason: a plan or a workflow node that handed its own agent on, or approved
  a review, would undo the person the queue asks for. The doors are the
  Dock's rows and the palette.
- **No new audit words yet.** The compliance trail's actions are pinned by a
  migration's CHECK, and `server/` is lane D's: handoffs and reviews are not
  rows on the trail until that request lands (`docs/streams/requests.md`).
