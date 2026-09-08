# Terminal Canvas v9 — ledger, M180–M200

This ledger is the resumable state of the 4.1.0 to 5.0.0 run. Authority:
`docs/superpowers/specs/2026-09-07-v9-finish-prompt.md`. Plan:
`docs/superpowers/specs/2026-09-07-v9-plan.md`. Design brief:
`docs/superpowers/specs/2026-09-07-v9-design-brief.md`. Append evidence and decisions;
never convert an unobserved result into a pass.

## Act 0 — preparation

Started reading at 2026-09-08 03:45:54 UTC (2026-09-07 23:45:54 America/New_York).
The checkout was clean on `main`, commit `b8ca12861b1a4f8c81c93762356efb09e526a075`,
package version 4.1.0. This is newer than the local 4.1 release because it includes the v9
prompt and repository instructions. No implementation is authorized to start until `go`.
The 24-hour implementation clock has not started.

Read AGENTS.md, CLAUDE.md in full, README’s milestone table, the M161–M179 ledger, both
dated design briefs, the ideas backlog, the manual-only sections of load-bearing.md and
verify-suites.md. The backlog contains historical statements superseded by later milestones;
the current code and later decisions govern. Viewed the launcher, kinds-dark and workflow
goldens as representative composition evidence; this is not the all-golden Act VIII audit.

A read-only delegated seam review (`act0_seams`) confirmed the need for explicit template
editing bindings, main-owned workflow execution through the existing broker, a separate app
extension registry and a project watcher that sees unopened files. The plan incorporates
those findings. The review ran no verification and changed no files.

The frontend skill at
`/Users/alexnieves/.codex/skills/frontend-skill/SKILL.md` was read for app composition. Its
app guidance supports the plan. The generic line “Ship at least 2-3 intentional motions for
visually led work” is satisfied by existing arrival/reveal/camera motion; it does not authorize
a new animation system over the repository’s finite-motion rule. “No cards by default” is
superseded where canvas objects and the existing Obsidian frame are the requested product.
No permission flow or dependency follows from that skill.

The parent tool session exposes no `/model` control. No parent effort change has been
claimed; Act 0’s independent planning review will request xhigh explicitly. The run must
continue to distinguish requested settings from settings it can actually change.

### Baseline command

The first `npm run verify` attempt ran against unchanged source and checks. The full output is
`out/v9-evidence/act0-verify.log`; the wrapper records the actual exit code in
`out/v9-evidence/act0-verify.exit`. The following environment keeps transient work local:
`TMPDIR` and `TMUX_TMPDIR` point to `out/t`, `CFFIXED_USER_HOME` to `out/h`, npm and Electron
caches to `out/cache`, and `TC_VERIFY_SUFFIX=v9` isolates suite sockets. `GIT_CEILING_DIRECTORIES`
points to `out/t` so fixture directories intended to be outside a git repository do not
inherit this checkout. `/usr/bin/sandbox-exec` denies filesystem writes outside this
repository except device files. HOME is unchanged. No assertion is skipped or changed.

The results of both attempts appear below. Visual and packaged commands are not
claimed from the inherited ledger. They are owed at every implementation act close; Act 0
requires this baseline chain and the two planning documents, without changing a golden.

### Planned rule amendments, not yet applied

The 5.0 brief strikes the M133 read-only diagram restriction, the equally weighted launcher
cards, the inspector’s fixed arrangement and pointer-only exclusions for new data verbs.
Each implementing milestone must record the exact old rule, reason and changed check here
before altering it. No check has changed in Act 0. No golden has changed, and no remote or
product action has been performed.

### Resume point

Act 0 documents and baseline evidence are prepared, with the red baseline and unavailable
optional planning review reported below. Present M180–M200 and the exact sentence
“Type go to start, or anything else to amend.” Stop there. On `go`, record
the actual timestamp and deadline before creating `v9-act1-onboarding`. On an amendment,
update the plan and brief and present the pause again. Implementation acts I–VIII are pending.

### Baseline environment correction

The first `npm run verify` attempt exited 133. Every suite through `verify:pty-manager`
printed its passing tally, but `verify:window` could not start Chromium’s GPU/network
sandbox inside the outer `sandbox-exec` profile: “sandbox initialization failed: Operation
not permitted.” This is not a green baseline, nor evidence of a product regression. The
failure log and exit file above are retained.

A Foundation path probe, run with `CFFIXED_USER_HOME=out/h` and a repository-local Swift
module cache, returned application support and caches beneath this repository (exit 0).
The second baseline attempt uses the same local directory/cache/socket environment without
the incompatible outer sandbox. Electron’s own sandbox and all assertions remain unchanged.
Its output is `out/v9-evidence/act0-verify-local.log`, and its exit code will be in
`out/v9-evidence/act0-verify-local.exit`. No parent HOME override was used.

The fresh-context xhigh planning review was requested as `act0_plan_review`; the service
returned a usage-limit error with a reset at 2026-09-08 00:31 America/New_York. No review
findings were returned, so none are claimed. The earlier independent seam review completed.
Useful local Act 0 work continues while the optional planning review is unavailable; required
milestone critic/verifier reviews have not begun. The user’s “continue where you left off”
resumes Act 0 and does not replace the explicit pre-implementation `go` pause.

### Baseline result and plan corrections

The repository-local `npm run verify` attempt exited 1. It reached `verify:panels:core`,
which printed 77/78 passed. `paste.image.1` failed because `echoedPath` was false; the PNG
was written, bracketed input was present, and the following text paste succeeded. The check
looks for `attachments` and `.png` separately in visible terminal rows. A path wrapping over
a row boundary is a plausible explanation, not yet a proven cause. No assertion, fixture,
timeout or source was changed. The later panel suites were not reached by this chain; separate
diagnostic runs below do not turn this command into an exit-0 baseline.

Local plan review found a real four-door gap: the current verb table feeds the palette's
plan runner, while the control protocol exposes no corresponding agent plan operation.
M180 now explicitly owns a bounded agent bridge and door-closure metadata. Workflow support
for its new actions is a recorded temporary omission until the M189 adapter, avoiding a
second executor in onboarding. The plan also explicitly delegates the M197 guide and M198
audit walk. These are planning corrections, not implementation or verification claims.

Actual tallies from `out/v9-evidence/act0-verify-local.log` (whole command exit 1):

| Suite | Printed tally |
|---|---|
| `verify:meta` | 38/38 passed |
| `verify:styles` | 56/56 checks passed |
| `verify:viewport` | 137/137 passed |
| `verify:groups` | 6/6 passed |
| `verify:merged` | 12/12 passed |
| `verify:registry` | 38/38 passed |
| `verify:layout` | 234/234 passed |
| `verify:credentials` | 18/18 passed |
| `verify:jira` | 15/15 passed |
| `verify:github` | 7/7 passed |
| `verify:palette` | 143/143 checks passed |
| `verify:rail` | 194/194 passed |
| `verify:review` | 98/98 passed |
| `verify:subagent` | 27/27 passed |
| `verify:file` | 83/83 passed |
| `verify:toolbox` | 103/103 passed |
| `verify:usage` | 26/26 passed |
| `verify:machine-cost` | 7/7 passed |
| `verify:tmux` | 35/35 passed |
| `verify:agent-state` | 27/27 passed |
| `verify:agent-session` | 141/141 passed |
| `verify:verbs` | 14/14 passed |
| `verify:teammates` | 25/25 passed |
| `verify:electron` | 4/4 passed |
| `verify:control` | 15/15 passed |
| `verify:package` | 13/13 passed |
| `verify:pty` | 10/10 passed |
| `verify:pty-manager` | 63/63 passed |
| `verify:window` | 4/4 passed |
| `verify:ipc` | 1/1 passed |
| `verify:canvas` | 6/6 passed |
| `verify:xterm` | 11/11 passed |
| `verify:panels:core` | 77/78 passed |

The chained build completed before canvas verification. The chain did not reach
`verify:panels:shell`, `verify:panels:kinds`, `verify:panels:agents` or
`verify:panels:product`. Visual and packaged verification have not run in Act 0.

The separate diagnostic `npm run verify:panels:shell` printed 96/96 passed and exited 0,
using the same repository-local environment. Evidence is in
`out/v9-evidence/act0-panels-shell.log` and `act0-panels-shell.exit`. It does not repair the
failed chain. The green-baseline requirement is not met; M180 must diagnose and repair the
image-paste failure before claiming implementation green. Preserve the test's requirement
that the actual written path reaches the PTY; do not weaken it to file existence alone.
No implementation, suite or golden has changed. Only the plan, brief and this ledger are
untracked additions on `main`; no commit, merge, tag, push or remote object was created.

## Act I — started

The user said `go`. The implementation clock starts at 2026-09-08 04:03:59 UTC
(00:03:59 America/New_York); the 24-hour deadline is 2026-09-09 04:03:59 UTC.
Act I uses `v9-act1-onboarding`. Begin M180 with baseline diagnosis, onboarding and the
bounded agent verb bridge. The earlier pause and pending-clock statements are historical.

M180 red-first readiness evidence is in `m180-readiness-evidence.md`: pure 0/12 exit 1,
then static launcher 12/14 exit 1. After implementation,
`node scripts/verify-onboarding.cjs` printed 14/14 passed, exit 0. This verifies discovery
and markup, not a real conversation. The launcher now prioritizes one conversation action
and retains the existing aliases. Rule amendment: retire three equally weighted primary
launcher doors because a beginner needs one start; the new markup checks and forthcoming
renderer journey check cover availability. No golden has been written.

The baseline repair is documented in `v9-m180-baseline-paste-image.md`: original assertion
77/78 exit 1, repaired exact-path PTY-log assertion 78/78 exit 0. Control checks in
`m180-control-evidence.md` ran red at 16/25 exit 1 and then green at 25/25 exit 0 after
parser/handler changes (`node scripts/verify-control.cjs`). They caught an existing URL
query override; URL queries can no longer replace the open-only verb. The shared agent
plan guard ran red through `npm run verify:verbs`, 14/17 exit 1, before implementation.

The real onboarding journey check has been delegated and written in the product suite, but
its agent hit a usage limit before running the planned old-Launcher red/current green pair.
The service reported retry at 5:05 AM without a timezone. No journey pass or red is claimed.
Parent continues reachable implementation; no critic/verifier has approved M180 yet. Current
remaining work includes agent transport integration checks, four-door metadata, actual
onboarding input, visual capture/critic, full chain, and all milestone reviews. No commit or
golden update has occurred. The user's `continue` preserves this active scope and clock.

`npm run verify:verbs` passed 19/19, exit 0 after the guard, redacted summaries and door
metadata were implemented. `npm run typecheck` exited 0. Targeted `verify:styles` passed
56/56, exit 0, and `verify:palette` passed 143/143, exit 0. `verify:meta` was 37/38, exit 1
because the new M180 build logs needed a README milestone row; that row now explicitly says
in progress, not done. These are targeted results, not the full acceptance chain.

Two attempted old-launcher builds did not replace the module: electron-vite serializes its
inline configuration through JSON, dropping plugin functions. Both ensuing product runs
therefore exercised the current launcher, whose onboarding click/type/send assertion passed;
both whole suites exited 1 at 21/24 because annotation/history then failed and aborted later
checks. No red-first claim is made for those attempts. A corrected renderer-only Vite build
appends the plugin after config resolution and asserts exactly one old-module replacement;
that build exited 0. The old-launcher product run is pending. Source was never overwritten
for this experiment; rebuild current source before any green claim or visual capture.

## Act I — resumed on Fable 5.1

Resumed at 2026-09-08 04:36 UTC (00:36 America/New_York) on `v9-act1-onboarding`, in a
Claude Code goal-mode session on Fable 5.1, following
`docs/superpowers/specs/2026-09-08-v9-resume-prompt-fable.md`. Astra's clock was stopped by a
usage window and not by work, so the 24-hour wall-clock ceiling restarts from this resume:
the deadline is now 2026-09-09 04:36 UTC. Astra's original deadline (2026-09-09 04:03:59 UTC)
is historical.

`npm run typecheck` exited 0 (`out/v9-evidence/m180-typecheck-resume.log`). The working tree
Astra left was committed verbatim in four scoped commits, exact paths staged, no prose
changed: `a240470 docs(v9)` (the plan, the brief, this ledger), `e7e737f docs(m180)` (the
spec and plan), `cd60d53 check(m180)` (the five check files, the four evidence notes,
`docs/verify-suites.md`, `package.json`), `b8cd4b3 feat(m180)` (sixteen source and doc
files). The tree was clean after the fourth.

Two items the "Act I — started" section lists as pending were already answered by logs
Astra wrote before the window closed, and this session records them from those logs rather
than claiming to have run them: `out/v9-evidence/m180-onboarding-ui-proven-old.log` is the
old-launcher red for `onboarding.start.1` (59/60, exit 1 in `.exit`, only that check red,
through `build-old-launcher.cjs`'s renderer-only build with exactly one module replacement);
`out/v9-evidence/m180-annotation-product-green.log` (00:25, after the 00:22 rebuild from
current source, which postdates every source edit) prints 61/61 with `onboarding.start.1`
and `onboarding.agent.1` both PASS. No `.exit` file was written for the green run, so the
full chain below is what proves it in this session.

`npm run build` from current source exited 0 (`out/v9-evidence/m180-build-resume.log`).
`npm run verify:visual` in comparison mode under the repository-local environment exited 1
at 53/57 (`out/v9-evidence/m180-visual-compare.log`): `launcher` at 14.562 % of pixels (the
intended M180 change), and `chat-copilot`, `supervisor` and `inspector-detail` each on ONE
32 px tile. Reading the three diff images: every red tile is the fixture path painted in the
spawn sheet's WHERE field or the inspector's CWD (`…/out/t/tc shot fixtures golden/repo`
under the local `TMPDIR`, where the 4.1 goldens were painted under the system temp
directory), plus a pid and a port. Decision: the visual suite runs with the system `TMPDIR`
(the other local variables kept), because the goldens paint the fixture path and
re-baselining three scenes for a path-text reason is exactly the blind change the golden
sentence rule forbids. The verify chain keeps the local `TMPDIR`; it paints nothing.
With the system `TMPDIR`, `npm run verify:visual` exited 1 at 56/57 with `launcher` the only
red (`out/v9-evidence/m180-visual-compare-systmp.log`): the three tile reds were the path
text, as diagnosed. The launcher's golden waits for the critic's sentence.

### M180 — the critic's findings and what was done with each

The fresh-context critic (Agent tool, cold: the diff, the spec, the plan, the brief's
First launch, `CLAUDE.md`'s rules, the two launcher images) returned thirteen ranked findings
and refused the first launcher capture as a draft. Each, by number:

1. The agent door could answer a terminal agent's permission prompt (`submit` against a
   panel in `wants-you` accepts the menu's default Yes). FIXED: `agentDoorRefusal` in
   `shared/plan.ts`; the renderer's facts now carry the agent state word; `agent-door.5`.
2. `plan` carried no caller identity, so a place-bounded teammate escaped M100's places
   through `new-chat`. FIXED: the token rides as the `api` arm's does; the handler resolves
   the panel and its teammate; a teammate caller is refused the session-opening and
   setting verbs by name; `plan.handler.4`, `agent-door.6`.
3. The generic verb hover repainted the primary grey under white ink. FIXED with 4.
4. The primary dodged `primary.1` and `--on-iris`. FIXED: `.launcher__start` is an
   `.is-primary` site; the check names it.
5. Two sentences said "Codex is missing"; `Setup guide` sat beside an installed engine;
   Check again was far from the rows it serves. FIXED: the guide only where discovery is
   not `installed`, Check again in the readiness block, the footer a pointer at the full
   report with the probe sentence on its title.
6. Presets' cached `which` and the fresh report could disagree after Check again. FIXED:
   the primary gates on readiness alone; main still refuses a missing binary by name.
7. `closure.v9.1` pinned declarations. FIXED: it reads `commands.ts` for the palette row and
   binds the agent line through `buildPlan`.
8. Hint copy named a control that did not exist. FIXED.
9. The 30 s timeout said "no canvas answered" while the plan kept running. FIXED: a distinct
   "still running" refusal from `main/index.ts`.
10. A third palette row minted the same chat. FIXED: dropped; `V9_DOORS.new-chat.palette`
    names `panel.new-chat`.
11. A separate `verify:onboarding` suite for a small module. DECLINED for M180 (it exists,
    it is green, and removing it is churn); M181 adds no suite of its own.
12. The launcher scrolled at 1440x865. FIXED through 5 and the chat card's demotion to a
    prompt line while the primary is live (alias kept; the doors grid follows the count).
13. `onboarding.agent.1` bypasses the socket and handler. RECORDED: it drives the
    renderer's door through `requestFromRendererWith`; `plan.handler.*` drive the handler
    over a fake bridge; no check runs `tc` → socket → handler → renderer end to end. The
    `tc plan` round trip over a real socket is an owed hand check below.

Two owed hand checks the critic asked to be named: the timed launch-to-first-answer trial
on a fresh profile, and the install/sign-in path on a machine without a CLI; both are in the
plan's "Known work a person will owe" table and are restated in the Act I build log.

After the fixes: `npm run typecheck` exit 0; `verify:verbs` 22/22, `verify:control` 26/26,
`verify:styles` 56/56, `verify:onboarding` 14/14, `verify:palette` 143/143, `verify:meta`
38/38, each exit 0 (`out/v9-evidence/m180-fix-*.log`); `npm run build` exit 0; the visual
comparison under the system `TMPDIR` 56/57 with `launcher` the only red at 16.064 %
(`m180-visual-compare-2.log`).

The first full `npm run verify` after the fixes exited 1 at `verify:agent-session
registry.1` (140/141; `out/v9-evidence/m180-verify-chain.log`): M99's rule that no consumer
compares a `backend` field to a literal engine name, which Astra's `shared/onboarding.ts`
and the `new-chat` arm both did. FIXED: `FIRST_LAUNCH_ENGINES` is a table keyed by backend
(name and setup link), `isFirstLaunchBackend` a membership test; a third first-launch engine
is a third row. `verify:onboarding` 14/14 and `verify:agent-session` 141/141 after it.

The critic's second pass ACCEPTED the launcher. Its sentence, recorded before the golden is
written: *The launcher now leads with one filled "Start a conversation · With Claude" primary
through `.is-primary`, followed by a divided readiness list (one sentence per engine, Setup
guide only where Codex is missing, Check again on its own row beside the rows it serves), a
two-card door row (New panel, Open a file) with Chat with Claude… stepped down to the first
prompt line, and a footer reduced to a pointer at the full report — this is the intended M180
amendment, the earlier duplicate copy and the installed-row verb are gone, and it reads as a
finished premium first-run surface; accepted.* The scene's intent string is unchanged.

Three new findings from that pass. `facts()` read the agent state twice per panel: FIXED,
bound once. Caller identity is opt-in (a teammate's chat could run `env -u TC_PANEL_TOKEN tc
plan new-chat` and pass as the person's shell): DECLINED, with the same standing as the `api`
arm it copies — the socket is the user's own (0600) and a teammate's shell command runs under
the CLI's permission system, which M100 names as the line the app does not police; the door
bounds what the app does for a cooperative teammate, and refusing every tokenless plan while
a teammate exists would refuse the person's own shell. `send` to a chat in `wants-you` is
admitted on purpose: a chat's approval is answered only through `agent:answer`, never by a
message. The launcher card at 1440x865 fits with the tmux banner dismissed and scrolls on a
~800 px content area; M181 adds nothing to this card.

### The verification environment, amended

The second full chain (`out/v9-evidence/m180-verify-chain-2.log`) exited 1 at
`verify:panels:agents handoff.1` (79/80): the target's PTY log never showed the pasted token
while the source ran and the row counted its lines. Alone under the same repository-local
environment the agents part failed `handoff.2` instead (79/80) and the product part failed
`onboarding.start.1` with `sent: false` (60/61) — three different checks on three paths M180
did not touch (`m180-panels-agents-rerun.log`, `m180-panels-product-rerun.log`). Under the
system `TMPDIR`, with every other local variable kept, both parts were green alone: agents
80/80, product 61/61, exit 0 each (`m180-panels-agents-systmp.log`,
`m180-panels-product-systmp.log`).

Decision, recorded rather than argued further: the repository-local `TMPDIR` is what reached
the real-Electron suites — the 4.1 harness and its watchdogs were measured under the system
temp directory, its fixture paths are short and carry no space, and the `paste.image.1`
diagnosis had already shown a long local path changing what a terminal check observes — so
from here every command that opens Electron (`npm run verify`, `verify:visual`,
`verify:packaged`, `shot`) runs under the system `TMPDIR` with `TMUX_TMPDIR`,
`CFFIXED_USER_HOME`, `npm_config_cache`, `GIT_CEILING_DIRECTORIES` and `TC_VERIFY_SUFFIX=v9`
still repository-local. What that gives up: the suites' temp fixtures land under
`/var/folders`, as they did in every earlier run. What it keeps: comparability with the
goldens and the measured watchdogs. The agents part had not run at all in this run before
these attempts (the Act 0 chain stopped at core), so this is the first evidence for it.

### M180 — the chain, green

Under the amended environment `npm run verify` exited 0 (`out/v9-evidence/m180-verify-chain-3.log`, `.exit`), every suite printing its tally:

| Suite | Tally |
|---|---|
| `verify:onboarding` | 14/14 passed |
| `verify:meta` | 38/38 passed |
| `verify:styles` | 56/56 checks passed |
| `verify:viewport` | 137/137 passed |
| `verify:groups` | 6/6 passed |
| `verify:merged` | 12/12 passed |
| `verify:registry` | 38/38 passed |
| `verify:layout` | 234/234 passed |
| `verify:credentials` | 18/18 passed |
| `verify:jira` | 15/15 passed |
| `verify:github` | 7/7 passed |
| `verify:palette` | 143/143 checks passed |
| `verify:rail` | 194/194 passed |
| `verify:review` | 98/98 passed |
| `verify:subagent` | 27/27 passed |
| `verify:file` | 83/83 passed |
| `verify:toolbox` | 103/103 passed |
| `verify:usage` | 26/26 passed |
| `verify:machine-cost` | 7/7 passed |
| `verify:tmux` | 35/35 passed |
| `verify:agent-state` | 27/27 passed |
| `verify:agent-session` | 141/141 passed |
| `verify:verbs` | 22/22 passed |
| `verify:teammates` | 25/25 passed |
| `verify:electron` | 4/4 passed |
| `verify:control` | 26/26 passed |
| `verify:package` | 13/13 passed |
| `verify:pty` | 10/10 passed |
| `verify:pty-manager` | 63/63 passed |
| `verify:window` | 4/4 passed |
| `verify:ipc` | 1/1 passed |
| `verify:canvas` | 6/6 passed |
| `verify:xterm` | 11/11 passed |
| `verify:panels:core` | 78/78 passed |
| `verify:panels:shell` | 96/96 passed |
| `verify:panels:kinds` | 49/49 passed |
| `verify:panels:agents` | 80/80 passed |
| `verify:panels:product` | 61/61 passed |

`UPDATE_GOLDENS=1 npm run verify:visual` then wrote the launcher's golden over the same
build, exit 0, 56/56 with `launcher golden written` (`out/v9-evidence/m180-visual-update.log`,
`.exit`); the sentence above is its record. No other golden changed.

### M180 — the verifier

The fresh-context verifier (Agent tool, cold: the staged diff, the spec, the ledger's M180
sections, the rules, the evidence paths; no Electron — the golden write owned the slot) ran
the seven plain-node suites on the staged tree under a `--keep-index` stash and confirmed
every tally (onboarding 14/14, verbs 22/22, control 26/26, styles 56/56, palette 143/143,
meta 38/38, agent-session 141/141, exit 0 each) and the chain-3 log (38 tally lines, no
FAIL, three build steps, exit file 0). It read the plan door's five properties in the source
and found each holding; every `data-launcher-*` alias present at `29831fa` still renders;
`.pf__body` untouched; no dependency added. Typecheck under the stash failed only inside
the untracked M181 files, as expected.

Its discrepancies, each answered: the chain-3 run and the golden write were not yet in the
ledger — they are now (above). The control 16/25 red run has no log on disk, only Astra's
prose in `m180-control-evidence.md`; recorded as such, not re-run (the parser and handler
have since changed twice and the green is the evidence that stands). `agent-door.5` and
`agent-door.6` named `interrupt` and settings without exercising them — FIXED: both checks
now run `interrupt ag1` against the waiting panel and `set-setting` for the teammate
caller, refused before any step; `verify:verbs` 22/22 exit 0 after
(`out/v9-evidence/m180-fix-verbs-2.log`). Its stash pop conflicted on one import line in
`ipc-contract.ts` (an M181 edit beside an M180 one); resolved by keeping both, the index reset
and re-staged to the M180 set, the stash dropped.

## M181 — the captioned starter canvas

Spec `docs/superpowers/specs/2026-09-08-m181-starter-canvas.md`, plan
`docs/superpowers/plans/2026-09-08-m181-starter-canvas.md`. Started 2026-09-08 ~05:20 UTC
on `v9-act1-onboarding` after M180's close at `be586dc`.

Decisions recorded. The starter is DATA (`shared/starter.ts`): a manifest of four examples
placed relative to the agent, and a workspace record of the keys ever applied, absent on
every pre-M181 file and on a canvas the starter never touched, a reset clearing it. The
image kind is the minimal foundation Act IV extends: an absolute path on the record, the
bytes read in main by magic number under a 5 MB cap (`image:read`), painted as a data URL
under the CSP's `img-src data:`, four arms. The starter's picture and note are written once
under `userData/starter` (`starter:prepare`, never overwriting the person's note); the PNG
is 612 bytes inlined in `main/starter-prepare.ts` rather than a packaged resource. The
preview object is NOT in the manifest: a browser panel needs an http(s) page and the starter
has no project to preview — M185 adds it under the same idempotent record. On a first run
the launcher's primary lays the starter out around the conversation and its hint says so;
a returning canvas mints the chat alone; without a discovered engine the starter is refused
by name so the readiness screen stays in front. The examples spawn nothing: the chat on its
first send, the terminal a dormant card, the workflow a projection, the note and the image
files.

Red first. The pure checks were delegated to a fresh-context writer in an isolated worktree
(`docs/build-log/m181-pure-red-evidence.md`): `verify:layout` 234/238 exit 1
(`starter.1–.3`, `image.record.1`), `verify:viewport` 137/139 exit 1 (`starter.plan.1`,
`image.kind.1`), `verify:file` 83/85 exit 1 (`image.1`, `starter.prepare.1`), every
pre-existing check green. Green after the pure modules: layout 238/238, viewport 139/139,
file 85/85, exit 0 each (`out/v9-evidence/m181-pure-green-*.log`) — after one fix to the
delegated `starter.1` check itself, which mutated the parsed record and then asserted the
pre-mutation values (recorded here; the parser was right). The real-renderer checks
`starter.1` and `image.1` in the product part ran RED against the M180 build before the
renderer changed (`out/v9-evidence/m181-product-red.log`, exit 1): `primary: false` (no
`data-onboarding-starter`), `painted: false`, `gone: false`; the two checks' waits then
tripped the part's 98 s watchdog, which is re-measured below once green (M135's rule, 1.25×
a measured green run). Plain-node after the implementation: onboarding 14/14, verbs 22/22,
palette 143/143, meta 38/38, styles 56/56, layout 238/238, viewport 139/139, file 85/85,
rail 194/194, agent-session 141/141, control 26/26, electron 4/4, exit 0 each
(`out/v9-evidence/m181-plain-*.log`).

Doors. Canvas: the primary on a first run and the `Starter canvas…` prompt line (disabled
by name once every key is applied). Palette: `starter.open`. Agent: `tc plan starter`.
Workflow: the M189 omission, in `V9_DOORS` (`closure.v9.1` binds all three). Two IPC
channels (`image:read`, `starter:prepare`) in the contract, both diagrams and
`verify:ipc`'s pin (126).

Green, with what the real renderer taught. The first `npm run verify` with M181 exited 1 at
`verify:panels:product onboarding.start.1` (62/63; `starter.1` and `image.1` PASS,
`out/v9-evidence/m181-verify-chain.log`): on a first run the primary now lays the starter out
too, and the manifest's image sat at dy 520 under a 620-tall chat, so the Examples group's
frame spanned the composer and swallowed the click on Send; the check's `noTerminal` also saw
the dormant terminal card. FIXED: the examples are ONE column beside the agent (440 wide, 40 px
between rows for the captions; the group never encloses the chat), and the check asserts no
LIVE terminal (`.xterm`), which is the property. Two flake shapes followed, each run to its
cause: `sent: false` with an empty composer — `insertText` landed before the click's focus
under the starter's render burst; the check now waits for the composer to HOLD focus (a real
condition). And `openedId: false` — `applyStarter` read the async env report through a
closure the palette memo captured while it was still null and refused for "no engine" while
the launcher beside it showed the primary enabled; FIXED with a ref read at call time, the
memo dep added, and `applyStarter` now says each decision on the renderer console (the check
records it). The chat wait is 8 s (one slow run beside the known `browser.1` flake). Product
part alone after: 63/63 exit 0 three times in a row (82.1–82.4 s wall,
`m181-product-green-{3,5,6}.log`, `m181-product-diag.log`); the watchdog re-measured to
105 s (1.25× the slower of 82.3 / 82.4 / 83.7 s). `browser.1` failed once in a slow run
(`m181-product-green-4.log`), the flake `terminal-canvas-v8-run` memory already names.

Visual. The first comparison (`m181-visual-compare.log`) showed six scenes: `launcher` (the
first-run hint and the `Starter canvas…` line), `starter` MISSING, and four sheet/palette
scenes at 1.1–1.7 % — the `starter` scene ran second, on the empty store, and the chat it
minted left main-side state (the recent folders the sheet's WHERE field lists) for every
later scene. Moved LAST over a canvas the kit empties for it (`k.emptyCanvas`): the three
sheet scenes returned under budget (`m181-visual-compare-2.log`, 55/58). `palette-query`
stays changed on purpose — the new `Open the starter canvas` row matches the query. The
first starter capture put the chat on the view's right edge with the column off screen
under the minimap (minted at the view centre); a pan alone left the column under the
inspector, which opens on the selected chat, so `applyStarter` FITS the arrangement (M146's
fit knows the visible viewport). Spec amendment, recorded: the spec's "examples inside the
working view's right edge at 100 %" is struck — with the inspector open the visible canvas
at 1440 is ~835 px and the agent plus a column is ~1080, so the first view lands at ~65 %
and one pinch returns the agent to working size; the alternative, hiding the inspector or
shrinking the examples below legibility, costs more than the zoom.

### M181 — the critic's findings and what was done with each

The fresh-context critic (the working tree against `be586dc`, the spec, plan, brief, rules,
three captures) refused the first starter capture and returned fourteen findings. By number:

1. The examples were placed relative to a GUESSED origin: `applyStarter` read `panelsRef`
   synchronously after `await beginNewChat`, whose `setPanels` was only queued. Two fixes
   were tried and each found wanting by the critic (a `requestAnimationFrame` wait never
   fired in the shot harness's hidden window and left the chat alone; a timer flush is not a
   commit guarantee). FIXED wait-free: `beginNewChat` takes an exact `at` point, the starter
   passes the view's centre and derives the chat's rect from it and `CHAT_W`/`CHAT_H`; the
   settle-refusal arm is gone; product `starter.1` asserts zero overlap between the chat and
   every example.
2. The camera fits at ~65 % rather than the spec's 100 %. DECLINED with the spec amendment
   above (the inspector open on the selected chat leaves ~835 px; the alternatives cost more).
3. The workflow example clipped at 160 tall. FIXED: 440x260, the image below it.
4. Refusals were silent. FIXED: the launcher line and the palette row are disabled by name
   (every key applied; no engine; a canvas with panels and no record); runtime refusals stay
   on the console and the door's reply.
5. A refusal after the chat was minted left no record. FIXED: the chat's key is recorded first.
6. The palette and agent doors could lay the column over a person's canvas. FIXED: refused
   by name when the canvas has panels and no starter record.
7. `m181-pure-red-evidence.md` was cited but missing (the worktree's untracked file was not in
   its diff). FIXED: copied verbatim.
8. Stale ledger prose. FIXED above.
9. The dormant terminal example says "nothing recorded before the last quit" though it never
   ran. DECLINED: telling a never-run card from one that quit with nothing needs main to say
   whether a scrollback file exists, an M39 arm; recorded for the backlog.
10. The image record holds an arbitrary absolute path and `image:read` reads it. RECORDED as
    M187's debt (asset identity); today the file panel already reads arbitrary paths, the
    parser and the handler refuse a relative one, and the data URL is bounded by the 5 MB cap.
11. The `Starter canvas…` line duplicated the primary on a first run. FIXED: the line renders
    only on a returning empty canvas.
12. The note opens as a raw mono editor with a path line (M27's rule for a note outside a
    vault). RECORDED for M188.
13. The rail said `image · an image`. FIXED: the title alone when set, the file panel's rule.
14. Annotation ids invented a third scheme. FIXED: the door's own sequence. The `console.info`
    lines stay (the journey check reads them); the 612-byte inlined PNG stays.

Two further findings from its second pass: the settle-refusal arm was a bad user path
(gone with 1) and the shot scene captured on a timeout — FIXED: the scene throws when the
five kinds are not on screen, so a blind update cannot write the chat alone as the golden.

### M181 — the critic's sentences, before the goldens

`starter` (new scene): *the conversation sits at working size on the left with its composer
clear, and to its right an `EXAMPLES · 4` frame holds one column — dormant terminal, note,
workflow (verb strip, tabs and the two-block diagram now visible), image with real pixels —
each with its one-sentence caption beneath, no rect touching the chat, the group never
enclosing it, nothing running, launcher gone, camera fitted at 65 % per the recorded
amendment; the residuals are the workflow card's clipped top verb strip and the terminal
card's "before the last quit" sentence, both recorded, neither a reason to withhold the
golden.* Accepted.

`launcher` (the golden deleted so the under-budget hint change is written on purpose): *the
first-run hint alone now reads "With Claude · opens your canvas with a captioned example of
each kind beside it" and the prompt line's removal on a first run makes the card cleaner,
not different; accepted.*

`palette-query`: *a new `Open the starter canvas` row appears under CANVAS for the query
"group" by the same loose subsequence match that already admits `Flip terminals`; nothing
else moved; accepted.*

Two notes from its last pass, recorded: the chat's `no skills` trail capsule overhangs the
Examples frame's edge (a derived lane painting into another group's region; for M188's
frames), and the chat header's `auto` / `to terminal` verbs are the selected panel's focus
reveal, which the golden pins as the selected state.

### M181 — the chain, green, and the verifier

Under the amended environment `npm run verify` exited 0 (`out/v9-evidence/m181-verify-chain-2.log`, `.exit`), every suite printing its tally:

| Suite | Tally |
|---|---|
| `verify:onboarding` | 14/14 passed |
| `verify:meta` | 38/38 passed |
| `verify:styles` | 56/56 checks passed |
| `verify:viewport` | 139/139 passed |
| `verify:groups` | 6/6 passed |
| `verify:merged` | 12/12 passed |
| `verify:registry` | 38/38 passed |
| `verify:layout` | 238/238 passed |
| `verify:credentials` | 18/18 passed |
| `verify:jira` | 15/15 passed |
| `verify:github` | 7/7 passed |
| `verify:palette` | 143/143 checks passed |
| `verify:rail` | 194/194 passed |
| `verify:review` | 98/98 passed |
| `verify:subagent` | 27/27 passed |
| `verify:file` | 85/85 passed |
| `verify:toolbox` | 103/103 passed |
| `verify:usage` | 26/26 passed |
| `verify:machine-cost` | 7/7 passed |
| `verify:tmux` | 35/35 passed |
| `verify:agent-state` | 27/27 passed |
| `verify:agent-session` | 141/141 passed |
| `verify:verbs` | 22/22 passed |
| `verify:teammates` | 25/25 passed |
| `verify:electron` | 4/4 passed |
| `verify:control` | 26/26 passed |
| `verify:package` | 13/13 passed |
| `verify:pty` | 10/10 passed |
| `verify:pty-manager` | 63/63 passed |
| `verify:window` | 4/4 passed |
| `verify:ipc` | 1/1 passed |
| `verify:canvas` | 6/6 passed |
| `verify:xterm` | 11/11 passed |
| `verify:panels:core` | 78/78 passed |
| `verify:panels:shell` | 96/96 passed |
| `verify:panels:kinds` | 49/49 passed |
| `verify:panels:agents` | 80/80 passed |
| `verify:panels:product` | 63/63 passed |

`UPDATE_GOLDENS=1 npm run verify:visual` wrote the three goldens named in the sentences
above and nothing else — 57/57, exit 0 (`out/v9-evidence/m181-visual-update.log`, `.exit`);
`verify:meta visual.1` 38/38 after it. This is the evidence line the sentences precede.

The fresh-context verifier (the working tree against `be586dc`; plain node only while the
chain held the Electron slot) confirmed typecheck 0 and the eleven plain tallies, the red
evidence (the eight pure ids match the three suites; the product red log with `starter.1`,
`image.1` and the watchdog), the green logs, the golden set, no weakened assertion, every
record and security property by line, the doors, the diagrams and pins, and the rules. Its
five discrepancies, answered: `m181-product-green-8.log` has no `.exit` file — its tally line
(63/63) and wall time are the evidence, and the chain above supersedes it; the watchdog's
note had drawn its slowest figure from a failing run — corrected to green walls only (82.1,
82.3, 82.4, 82.9 s → 104 s), a change of one second that the chain above ran under;
`onboarding.agent.1` failed in the two runs where `onboarding.start.1`'s chat never appeared
(it closes that chat), the stale-closure cause fixed above; the README row is now done; the
narrowed `noTerminal` predicate is the milestone's own change and is documented in the check.

### Act I — the close, first attempt

On `efb810a` the three commands ran in sequence (`out/v9-evidence/act1-*.log`, `.exit`):
`npm run verify` exit 0 (38 suites, `act1-verify.log`); `npm run verify:visual` exit 1 at
57/58 — the `starter` scene threw its own guard, "the arrangement is not on screen
(file,image,terminal,workflow)": four examples and NO conversation; `npm run verify:packaged`
exit 1 at 0/1 — electron-builder's `npx` tried to write its debug log under the
repository-local npm cache (`out/cache/npm/_logs/…`, ENOENT).

The visual red is a real race the loud scene guard caught (the critic's point about the
guard, vindicated within the hour): `applyStarter` built the examples' array from
`panelsRef.current` and committed it as a VALUE while `beginNewChat`'s own `setPanels` was
still queued, so the later value replaced the array without the chat — the product harness
and every earlier capture had a commit land in the gap. FIXED: a functional update over
`current`, which is how every other mint in `Canvas.tsx` commits. The packaged red is the
environment: `mkdir -p out/cache/npm/_logs` and the same command again; recorded so the next
session creates it before `verify:packaged`. Both are rerun below on the fixed head.
