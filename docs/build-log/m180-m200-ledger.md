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

`verify:packaged` failed the same way with `out/cache/npm/_logs` created beforehand
(`act1-packaged-2.log`): the npm child electron-builder spawns rotates and reopens its debug
log under `npm_config_cache` and finds no directory at open time. Decision: `verify:packaged`
runs with npm's DEFAULT cache (`npm_config_cache` unset) and every other local variable kept;
the packaged app and its scratch user-data directory are the suite's own temp paths either
way, and nothing else in the run reads the npm cache. Recorded for the next session.

`verify:packaged` with the default npm cache then BUILT the bundle but the app exited 1
before `--version` (3/12, `act1-packaged-3.log` to `-5.log`). Diagnosis, in order: not the
signature (re-signed ad hoc, same exit); not the Electron binary (electron-builder's own
download and `node_modules/electron/dist` through `electronDist` both failed, the second
falling through to Electron's usage screen — that guess was reverted); the ASAR. The builder
packed `out/**`, which in 4.1 held the three bundles and now also holds this run's npm cache,
fixed home, tmux sockets and evidence logs: a 206 MB archive with a socket inside, whose
`package.json` read back as bytes. FIXED in `build/builder-config.cjs`: the three bundles by
name (`out/main/**`, `out/preload/**`, `out/renderer/**`); `verify:package` 13/13. The
packaged app is 55 MB and `npm run verify:packaged` is 12/12, exit 0
(`out/v9-evidence/act1-packaged-6.log`, `.exit`). Every temporary directory this run keeps
under `out/` was invisible to the chain and to the goldens and visible only to the packager.

## Act I — closed

`3bf4bc5`: `npm run verify` exit 0 (38 suites, `act1-verify-3.log`), `npm run verify:visual`
exit 0 58/58 (`act1-visual-2.log`), `npm run verify:packaged` exit 0 12/12
(`act1-packaged-6.log`). Build log `docs/build-log/m180-m181-act1-onboarding.md`. Closed at
2026-09-08 07:41 UTC, ~3.4 h since the resume. Merged to `main` with `--no-ff`; nothing pushed.

## Act II — the editable workflow graph

Branch `v9-act2-workflow` from `main` at `50cf9f6`. Started 2026-09-08 ~08:05 UTC.

## M182 — one template, two editors: the shared operations

Spec `docs/superpowers/specs/2026-09-08-m182-template-editing.md`, plan
`docs/superpowers/plans/2026-09-08-m182-template-editing.md`.

Rule amendment, recorded before the check changed: M133's "the live canvas is the editor; the
diagram is a projection; Save is disabled with `REASON_NO_EDITOR`" is struck by the 5.0 brief's
first amendment. The diagram now draws the DRAFT and edits it; Save on the diagram is M184's
(the verb stays disabled with its sentence until then); the canvas binding is the other
editor of the same record. No M133 check was weakened: `workflow.panel.1a–d` still compare
the diagram against the record it projects, which is now the draft when one exists.

Decisions. Every mutation is a pure function in `shared/template-edit.ts` answering a fresh
record or a refusal by name; keys are minted from `nextKey` and never reused (a run's node
mapping, M184, names keys); a cycle is refused with the word, M78's rule from the record's
side. The record's `revision` is the store's alone — a save with a matching expectation
writes revision + 1, a mismatch writes nothing and hands the standing record back as `stale`,
no expectation is M80's unconditional door, still bumped; absent on a pre-M182 file and never
normalised in. The draft lives in a per-template mirror (`template-draft-store.ts`, the M105
shape) with one door, `applyDraftOp`; the diagram is `buildDiagram(draft)`. The canvas
binding is `templateBinding { templateId, key }` on every panel an instantiation mints, a
fifth mark carried by `carryMarks`; `Save selection as template` over panels bound to one
template, under that template's own name, UPDATES the record with the revision it was read
at. The label a block shows is the node's title when it has one.

Red first. The pure checks were delegated (`docs/build-log/m182-pure-red-evidence.md`):
`verify:layout` 238/245 exit 1 (`edit.1–.6`, `store.edit.1`), every pre-existing check
green; 245/245 after the module, the fields, the binding and the store. The product checks
`workflow.edit.1` (a real drag on a block moves the draft, the panel reads dirty, the record
on disk is unchanged, Delete removes the selected block) and `workflow.edit.2` (the agent door
runs set / add / a refused remove / a refused cycle over the same draft) ran red against the
Act I build — 63/65, exit 1 (`out/v9-evidence/m182-product-red.log`) — and green after the
renderer: 65/65, exit 0 (`m182-product-green.log`).

Doors. Canvas: a drag on a diagram block (move), Delete on the selected block (remove); add,
set, connect and disconnect by gesture are M183's library, inspector and port drag, and the
`V9_DOORS` rows say so by name — until then the palette's text modes are their canvas-side
door. Palette: six `workflow.*` rows over the selected workflow panel, each a text mode that
runs the same plan line the agent door takes. Agent: `workflow-add/-move/-set/-remove/-edge/
-unedge` through M180's door; `closure.v9.1` binds every row and line. Workflow: the M189
omission. No golden changes: the workflow scene's panel is at rest with no block selected.

### M182 — the critic's findings and what was done with each

Thirteen findings from the fresh-context critic (the working tree against `50cf9f6`), by number:

1. The binding's Update rewrote the record wholesale: pools became chats, unselected nodes
   vanished. FIXED: `updateBoundTemplate` runs `moveNode` per bound panel and `configureNode`
   only for a terminal or chat's captured fields, refuses a key the record lacks or two panels
   on one key, and leaves unselected nodes alone; product `workflow.edit.3` proves the pool
   node survives with its fields.
2. A second Update was always stale (the rows were read at mount). FIXED: `reloadTemplates`
   after every save; `workflow.edit.3` updates twice (revision 1, then 2) and then proves a
   bumped record is refused as stale with the record kept.
3. Update fired on an exact retyped name. FIXED: the text mode prefills the bound template's
   name and its label says "Enter updates … (revision N); another name saves a copy".
4. Update discarded a dirty diagram draft. FIXED: refused by name while the draft is dirty.
5. `clearDraft` had no caller; a draft outlived a deleted template. FIXED: cleared at the
   delete site, and `applyDraftOp` refuses when the record is gone. Spec amendment: a draft
   outlives its PANEL (closing the diagram is not discarding an edit) until Save, reload or
   the record's deletion; recorded here.
6. `validateNode` accepted what `parseTemplates` drops (an empty list, prompt, target).
   FIXED: the three rules mirrored; `workflow-add` still mints those kinds with empty fields
   — DECLINED as a placeholder: an empty `list` is refused by `addNode` now, so the agent
   door refuses `workflow-add … pool` until M183's library supplies a default the parser
   accepts (recorded for M183).
7. `w`/`h` missing from the field table. FIXED.
8. Four `V9_DOORS` canvas strings were palette rows wearing a label. FIXED: an owed door is
   `{ reason, due }` data and `closure.v9.1` accepts a gesture string or an owed object with
   a due milestone — the debt a later check can retire (M183 retires these four).
9. The Delete capture kept a stale selection and ignored `<select>`. FIXED: the selection
   clears on deselect and when the key leaves the draft; `SELECT` ignored; the event is
   stopped only when a remove happened.
10. A deleted record with a stale expectation was resurrected. FIXED: `stale` with the reason
    and no `current`.
11. `REASON_NO_EDITOR` was false. FIXED: the draft-kept sentence naming M184.
12. `nextNodeKey` trusted `nextKey` under a higher present key. FIXED: the larger of the two.
13. Small: `fieldsOf` unread until M183 (kept — M183 is next and reads it); `args` cannot
    carry a quoted argument through the text mode (DECLINED, recorded); the diagram
    re-normalises to its minimum on release so moving the leftmost block shifts the others
    (DECLINED here, recorded for M183 with the golden change it needs).

After the fixes: typecheck 0; `verify:verbs` 22/22, `verify:layout` 245/245, `verify:palette`
143/143; product part 66/66, exit 0 (`out/v9-evidence/m182-product-green-2.log`), with
`workflow.edit.3` the Update round trip the plan promised. The chain reruns on this tree below.

### M182 — the chain, green, and the verifier

`npm run verify` on the fixed tree exited 0, 38 suites (`out/v9-evidence/m182-verify-chain-2.log`,
`.exit`); the earlier chain on the pre-fix tree also exited 0 (`m182-verify-chain.log`). The
fresh-context verifier confirmed typecheck 0, the six plain tallies, the red evidence, the
green logs, all twelve FIXED dispositions by line, no weakened assertion, no golden change,
no new channel. Its notes, answered: `workflow.edit.3` was written with the critic's fixes and
was never seen red — it pins the round trip the plan promised, and this sentence is its
record; the delegated red-evidence file's two premises (the spec "not in the worktree", the
`nextKey` arm) are out of date after the fixes and are left as the writer wrote them, this
line being the correction; `closure.v9.1` accepts any `M\d+` as an owed door's due and its
title still says "a canvas gesture" — M183 retires the four owed doors and renames the title
then; the `workflow` scene's intent prose still quoted M133's struck sentence — rewritten
(prose in the manifest, no pixel). `feat(m182)` follows.

## M183 — the library, the wire and the inspector

Spec `docs/superpowers/specs/2026-09-08-m183-library-wiring-inspector.md`, plan
`docs/superpowers/plans/2026-09-08-m183-library-wiring-inspector.md`.

Decisions. The library is a TABLE (`shared/template-library.ts`): one entry per node kind
with a glyph, a name, one sentence and an example; `defaultNodeOf` is the node `addNode`
accepts (placeholders the parser keeps — an empty list, prompt or target is dropped at the
next launch, so the defaults name a file the person replaces in the inspector; this retires
M182's finding 6); `placementFor` is the keyboard Add's landing point, to the right of the
rightmost block, never over one. The selection (a block key, or an edge as `from>to`) is a
FACT of the draft store, so the panel, the inspector and the palette rows agree. The port is
a dot on a block's right edge; a wire is a real pointer gesture committed on release as one
`addEdge` with `exit`, the trigger changed in the inspector; a refusal is one sentence under
the verbs for a moment. The inspector's node editor renders the selected block's fields from
`fieldsOf(kind)` (the validator's own table) as real inputs that commit on Enter or blur
through `applyDraftOp`; a refusal keeps the typed value and shows the reason beside the field.
The SVG carries DROP ROOM (one block and a gap beyond the diagram's extent) so a drop or a
wire past the last block lands inside it. The four owed canvas doors of M182 are retired to
gesture strings.

Red first. The pure checks were delegated (`docs/build-log/m183-pure-red-evidence.md`):
`verify:layout` 245/247 exit 1 (`library.1–.2`), 247/247 after the module. The three
real-renderer checks ran red against the M182 build — 66/69, exit 1
(`out/v9-evidence/m183-product-red.log`) — and green after the renderer: 69/69, exit 0
(`m183-product-green-7.log`, 99.0 s wall; the watchdog re-measured to 124 s).

What the real renderer taught, each fixed at its cause and recorded: the SVG beside the
library was a shrinkable flex item and collapsed to ~110 px, so every drop and wire mapped to
its left edge (`flex: 0 0 auto`); the diagram was exactly its content's size, so a drop to
the right of the rightmost block fell outside it (the drop room); a `gap: 2px` literal broke
the scale rule (`--sp-1`); the inspector's inputs, unstyled, overflowed the 260 px pane
(a block field the pane's width in its hairline material); and the context pane in the
harness sits CLOSED just past a 1400-wide window's edge, so the check opens it through the
top bar's own toggle before reading the fields — a hidden input can neither be hit nor
focused, which was every "active: false" the probe showed.

Doors. Canvas: the library drag and its Add control (`workflow-add`), the port drag
(`workflow-edge`), Delete on a selected edge (`workflow-unedge`), the inspector's fields
(`workflow-set`) — the four `V9_DOORS` rows now name these gestures and `closure.v9.1`'s
title names the owed arm it still accepts. Palette and agent: M182's. Workflow: the M189
omission. Scenes: `workflow-edit` (new) and `workflow` (ports and room at rest), sentences
before the goldens below.

Visual, M183. The first comparison (`out/v9-evidence/m183-visual-compare.log`) changed
`workflow` (3.2 %: the ports and the drop room), `wide` (3.3 %: the panel is in that frame,
and the scene after `workflow-edit` inherited its selection) and `workflow-edit` was
MISSING — and the first `workflow-edit` capture had no node editor in it, because the shot
harness keeps the context pane closed. The scene now opens the pane through the top bar's own
toggle, selects the Detail tab, shoots, restores the tab it found (the active tab is a
persisted setting — the second comparison, `-2.log`, showed four later scenes at 0.6–1 %
with the inspector on Detail instead of Tools) and closes the pane, then deselects the block
and the panel. Two harness lessons for the memory: a scene that touches a persisted setting
puts it back, and a scene that selects deselects.

### M183 — the critic's findings and what was done with each

The fresh-context critic REFUSED the first `workflow` and `workflow-edit` captures and
returned twenty-two findings. The refusal was right and its cause was a product defect, not a
scene: a 180 px library column beside a 640 px panel left half the diagram past the frame's
edge at rest, with two blocks cut mid-word. By number:

1, 2. The library is now a DISCLOSURE (`Add node…` beside the tabs, closed at rest, the
   diagram whole again), and the column scrolls in place when open rather than sharing the
   diagram's scroll region.
3. The entry glyph is gone: `KIND_GLYPH` has no `terminal` key and the code was substituting
   the chat's mark for it — no glyph beats the wrong one.
4. The pool default taught `{{item}}`, which nothing substitutes (`pool-caller.ts` appends
   the item instead). FIXED: `work on the item below`.
5. The wire preview lit a cycle as ALLOWED and the release refused it. FIXED: the preview
   asks `edgeWouldCycle`, the same rule `addEdge` applies.
6. The drop maths restated `DIAGRAM_PAD`, `BLOCK_W` and `BLOCK_H` as literals. FIXED.
7. The node editor scraped the template id out of a display field. FIXED: `templateId` is a
   typed member of the workflow inspector model.
8. A refusal could be lost when the selection changed on blur. FIXED: the drafts and reasons
   reset on the template only, and a keystroke clears its own field's reason.
9. The labels were codes (`PRESETID`, `W`, `H`) and four inputs were empty boxes. FIXED: a
   label map (folder, title, command, arguments, preset, first message, workers, list file,
   prompt, target) and `w`/`h` dropped from the rendered set — the diagram's drag owns the
   geometry; the agent verb keeps the fields.
10. The `cwd` field showed a truncated `/private/var/folders/…`. FIXED as far as the path rule
    allows an EDITABLE field: the whole value rides the input's `title`.
11. `workflow.lib.1` asserted Add's presence, not its placement. FIXED.
12. The selection outlived the panel. FIXED: cleared on unmount.
13. Two screen→world conversions in one file. RECORDED as a follow-up (both correct today;
    `beginBlockDrag`'s camera-scale division is the one M184 should fold into `toSvg`).
14. Changing a trigger was unedge-then-re-add — two operations, one of which could refuse and
    leave the edge gone. FIXED: `retriggerEdge`, one pure op in place.
15. Debug scaffolding inside a check. FIXED: the probe is gone.
16. The cycle reason carried `→`, which `icons.1` bans in renderer text and which now reaches
    the screen. FIXED: `to`.
17. Examples were English set in mono. FIXED: a command or a file name each.
18. A press that never moved said "drop a node onto the diagram". FIXED: silent; only a real
    drag landing off the diagram says anything.
19. The node heading was the key (`TERMINAL · N1`). FIXED: the node's title when it has one.
20. The refusal line pushed the diagram down and showed on the Runs tab. FIXED: inside the
    definition pane.
21. The watchdog rested on one sample. FIXED: two green runs (99.0 s, 98.7 s), 1.25× the
    slower.
22. `args` cannot carry an argument with a space. RECORDED as inherited from M182's text mode.

The scene itself took four corrections, each a harness lesson: it presses the panel's header
first (the pane names the SELECTED panel), then opens the library, THEN presses the block — a
point computed before the disclosure shifts the diagram lands on the wrong block — and it
puts the library, the context tab and the pane back afterwards. Product part 69/69 exit 0
after every fix (`out/v9-evidence/m183-product-green-9.log`).

### M183 — the critic's sentences, before the goldens

`workflow-edit` (new): *The workflow panel as an editor at the wide breakpoint: `Add node…`
open beside the tabs with the library column scrolling in place (Terminal, Chat, Pool
visible, no glyph), a port on every block, `scan` selected with the accent stroke, and the
context pane on Detail naming the node `TERMINAL · SCAN` over its own fields in words —
FOLDER, TITLE, COMMAND, ARGUMENTS, PRESET, FIRST MESSAGE — with dx/dy/w/h gone and a Done
verb.* Accepted.

`workflow`: *The panel at rest with the library closed: the diagram is whole again, all four
blocks and their full sublabels in frame, each carrying the port a wire starts from, and
`Add node…` at the head of the tab row as the way in.* Accepted — "the resting state is now
strictly better than the pre-M183 golden".

`wide`: *The same panel inside the wide frame, library closed, diagram whole, ports at rest;
the change is entirely inherited from `workflow`.* Accepted.

Two further fixes were made after those sentences and before the goldens were written, both
presentational and both the critic's: the disclosure is `aria-expanded` and set apart from
the two tabs it neighbours (it read as a third tab), and the node editor is its own section
with a hairline and a heading at the surface's weight, so the pane reads "this node" then
"this panel". `UPDATE_GOLDENS=1 npm run verify:visual` then wrote `workflow`, `wide` and the
new `workflow-edit`, 58/58 exit 0 (`out/v9-evidence/m183-visual-update.log`), and the written
`workflow-edit` golden was read back.

Four things the critic left open, recorded rather than fixed: with the library OPEN two
sublabels are still clipped at this panel width and two of five kinds sit below the fold (the
closed state is whole, which is the resting one); `beginBlockDrag` still divides by the camera
scale where the library and wire use `toSvg` (both correct today — M184 folds them);
`args` cannot carry an argument with a space (inherited from M182's text mode); and a
full-width sublabel (`COLLECT - JOINS RESULTS`) sits flush with its block's right edge because
SVG text does not clip — `sublabelOf`'s own comment already records the rule.

### M183 — the verifier, and what its nine discrepancies cost

The fresh-context verifier confirmed typecheck 0, all seven plain tallies, the red evidence,
the golden set and their sentence order, every FIXED disposition by line, no weakened
assertion, no dependency, no renamed alias, the channel pin. Its nine discrepancies, each
answered rather than argued:

1, 2. The green product log had no `.exit` file, and — the one that mattered — the product
   part had NOT been re-run after the two presentational fixes made before the goldens. Both
   answered by running it again on the current tree: 69/69, exit 0, 98.5 s wall
   (`out/v9-evidence/m183-product-green-10.log`, `.exit`).
3. Two of the five library examples were English set in mono. FIXED: the example is in the
   UI face — a slot that mixes a command and a sentence is prose in mono either way.
4. Finding 16's rationale overstated `icons.1` (which bans a symbol as a CONTROL's text).
   Recorded: the fix stands on its own — a reason that reaches the screen reads as words.
5. `template-library.ts` restates `BLOCK_W`/`BLOCK_H` because `shared/` may not import
   `renderer/`. Recorded in the file, with the note that `library.2` reads both copies so a
   drift goes red.
6. A stale CSS comment still described the removed glyph. FIXED.
7. The last debug residue in `workflow.inspect.1`. FIXED.
8. The refusal still pushed the diagram down when it fired. FIXED: out of the flow, over the
   pane's top-right corner.
9. The chain it saw mid-run has since finished, exit 0.

The visual suite then tripped its own 209 s watchdog on an update run: the workflow editor's
scene made 58 scenes take 174.1 s and 176.4 s wall, so the ceiling is re-measured to 221 s
(1.25× the slower, the M135 rule) with the M160 figures it replaces named beside it. The
golden rewrite after the face fix compared EQUAL — the example's face change sits under both
budgets — so the three goldens written above still describe the surface, and no fourth write
was needed (`m183-visual-update-3.log`, 58/58, exit 0).

### M183 — the chain, green

Under the amended environment `npm run verify` exited 0 (`out/v9-evidence/m183-verify-chain-3.log`, `.exit`), every suite printing its tally:

| Suite | Tally |
|---|---|
| `verify:onboarding` | 14/14 passed |
| `verify:meta` | 38/38 passed |
| `verify:styles` | 56/56 checks passed |
| `verify:viewport` | 139/139 passed |
| `verify:groups` | 6/6 passed |
| `verify:merged` | 12/12 passed |
| `verify:registry` | 38/38 passed |
| `verify:layout` | 247/247 passed |
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
| `verify:panels:product` | 69/69 passed |

## M184 — Save, Run and Stop on the diagram

Spec `docs/superpowers/specs/2026-09-08-m184-save-run-stop.md`, plan
`docs/superpowers/plans/2026-09-08-m184-save-run-stop.md`. This closes Act II: the diagram is
an editor that can save what it edits, run what it shows, and say what a run did.

Decisions. Save hands the store the revision the DRAFT WAS READ AT, so a record saved by
anyone else in between is refused as stale with the draft kept and two verbs beside the
reason — Reload (take the record) and Save a copy (a new id at revision 0, which is also a
built-in's only save, M80's rule). Run runs the DRAFT when there is one: what the person sees
is what starts. A run records `definition` — the template as it was at that instant, its
revision, nodes and edges — and `mapping`, node key → the panel id the instantiation minted,
filtered to the panels the run actually holds; both absent on every pre-M184 run, both
dropped BY FIELD when malformed (a run is history and history is not dropped for a bad
annotation), and the definition's nodes go through `parseTemplates`' own rules so a snapshot
can never hold a shape the app cannot draw. `shared/run-outcome.ts` reads the entries through
the mapping into one word per block — queued, working, finished, failed — and the diagram
wears the selected run's words in the state vocabulary's tones. Because the words come from
the SNAPSHOT, an edit after a run never moves them.

Red first. The pure checks were delegated (`docs/build-log/m184-pure-red-evidence.md`):
`verify:layout` 245/246 and `verify:viewport` 139/140, exit 1 each, red on `run.def.1` and
`run.outcome.1`; 248/248 and 140/140 after the parser and the module. One correction to the
delegated check, recorded as a fixture repair and not a weakening: its pool node in the run's
definition carried no `width` and no `cwd`, which `parseWorkflowNode` refuses — the fixture
was wrong, not the rule, and the assertion set is unchanged. The real-renderer check
`workflow.save.1` ran red against the M183 build (69/70, exit 1,
`out/v9-evidence/m184-product-red.log`) and green after: 70/70, exit 0, 99.9 s wall
(`m184-product-green.log`).

Doors. Canvas: Save (enabled while dirty, otherwise disabled with "nothing to save — the
diagram matches the template"), Run and Stop on the panel, and a run row in the Runs tab that
selects its outcome onto the diagram. Palette: `workflow.save`, `workflow.run`,
`workflow.stop`. Agent: `workflow-save`, `workflow-run`, `workflow-stop` through M180's door
(`workflow-run` got its own `runWorkflowNow` member — mapping it to the excluded
`openWorkflow` would have put one member on both lists, which `closure.1` refuses). Workflow:
the M189 omission. No golden changed: the outcome tones appear only while a run is selected,
and the panel at rest is M183's.

## Plan amendment — the remaining acts, consolidated

Recorded 2026-09-08 ~13:00 UTC, about 8.5 hours into the resumed run with ~15.5 hours of the
ceiling left. Four milestones (M180–M184, one of them Astra's start) have taken that time,
and sixteen remain in the plan. The v9 plan says a row may be amended when the work proves it
wrong, with the amendment recorded here; this is that record.

What changes: the milestone BOUNDARIES, never the capabilities. Each act keeps its spec, its
red-first checks, its critic and verifier, its build log and its ledger lines; what folds is
the per-milestone overhead where two rows describe one seam. The authority's stop condition
asks that every capability be shipped through the four doors OR struck with a reason — that
rule is untouched, and the strikes are named below rather than discovered at the end.

| Act | Now | Was |
|---|---|---|
| III | M185 — the preview panel: discovery from an owned port or a dev script, the reload watch, the device widths and the real screenshot | M185 + M186 |
| IV | M186 — images and their app-owned assets (drop, paste, screenshot); M187 — sticky notes, free text and named frames | M187 + M188 |
| V | M188 — the node schema registry and a bounded main-owned executor with HTTP, shell, transform and agent steps, each with an example and Test this node | M189 + M190 |
| V | M189 — GitHub through the existing broker as a node kind; **struck**: Slack and email nodes, the loopback webhook and the cron trigger | M191 + M192 |
| VI | M190 — the portable file: export with the redaction and the pixel rule, import as an inert workspace | M193 + M194 |
| VII | M191 — the extension registry and the shipped example plugin with its guide | M195 + M196 |
| VIII | M192 — the feedback door and `docs/getting-started.md`; M193 — the third UX audit over every golden; M194 — 5.0.0, the DMG, the release notes and this ledger closed | M197 + M198 + M199 + M200 |

The strikes in Act V, each with its reason, so the final message does not have to discover
them: **Slack and email nodes** need a workspace token, a sender domain and a real
destination to prove anything, and the plan's own owed-work table already says a person must
supply all three — shipping an unexercised adapter would be the "pretend it was checked"
this run refuses. **The loopback webhook** needs an armed local listener whose lifetime
crosses a relaunch, and **cron** needs real elapsed minutes and a sleep/wake to prove a
missed run; both are hand checks by construction and neither is reachable inside the
remaining clock. GitHub stays because its broker path, its audit and its approval already
exist and are already exercised by fakes. Each strike is repeated in the final message.

### M184 — the fresh-context critic and verifier, and what was done about it

One agent ran both roles with no history of this session. It re-ran every pure suite and read
the red and green logs: `typecheck` 0, `verify:layout` 248/248, `verify:viewport` 140/140,
`verify:verbs` 22/22, `verify:palette` 143/143, `verify:styles` 56/56, `verify:meta` 38/38, the
red log one named failure with no throw and every check below it still executed, no golden
touched, no dependency added, no alias renamed. It then criticised the milestone in fifteen
ranked findings. Fourteen were fixed; the disposition of each is below, and the two the fix
changed elsewhere carry the check that now pins them.

| # | The finding | Disposition |
|---|---|---|
| 1 | `runWorkflowNow`'s adapter read `runWorkflow`'s answer backwards — `undefined` is SUCCESS there and a sentence is the refusal — so the agent door reported a refusal for every run that started and `ran` for every one that did not, with no check on it | Fixed (`usePaletteActions.ts`), and pinned by a new check, `workflow.door.1`, driven through `tc plan` against a template that is saved and bindable and cannot run — a name `buildPlan` cannot bind is refused before the adapter is reached and would pass whichever way round it read its answer |
| 2 | The diagram drew the live draft's BLOCKS while wearing the selected run's WORDS, so a node deleted after a run vanished from that run's view and a node added rendered `queued` in a run that never held it | Fixed: `drawn` is the run's `definition` while a run is selected, the live template otherwise |
| 3 | Stop read pool keys off the record, interrupted no chat at all and never looked at a run, so a workflow of three chats mid-turn answered `no pool is running` | Fixed: the subject is the selected run (every open run of the template when none is selected), its pools stopped and its chats interrupted, both counts named; the reason is now `nothing of this workflow is running` and the panel's own Stop goes through the same door (`onStopRun`) |
| 4 | `Save a copy` dropped the draft with no rebind, so on a built-in's only save path the edits left the screen with no message and the copy holding them had no panel open on it | Fixed: the panel is rebound to the copy in one history entry before the draft is dropped, and the verb answers with the copy's name |
| 5 | A run of a DIRTY draft recorded the record's revision, so two runs of two shapes both printed `revision 3` | Fixed: `-1` is the unsaved mark, kept by the parser (below `-1` is still malformed) and rendered `unsaved` |
| 6 | `snapshotRef` was keyed by TEMPLATE id, so a run opened by panels of an earlier instantiation read the latest snapshot and the mapping filter then pruned the whole foreign mapping to `{}` — every block `queued` for work that ran | Fixed: the snapshot is stored per MINTED PANEL id beside `originRef`, on the same key, read from the same panel the template mark came from |
| 7 | `skipped — …`, which `useHandoff` writes onto the target of a fork that did NOT fire, classified as `failed` — a node that never ran painted red, and the ordinary case for every `exit-ok`/`exit-fail` fork | Fixed: `skipped` and `stopped` are their own words with their own dim tone |
| 8 | A sealed run showed a started-and-never-ended entry as `working` for ever | Fixed: on a run with `endedAt` that entry is `unknown`, rendered `no outcome` |
| 9 | `workflow.save.1`'s `atRest` term was `false === false` — both branches of its ternary were `''`, so the spec's own sentence was asserted nowhere and the term passed in the red run too | Fixed: the check reads the verb's `title` AND the on-screen reason line, and asserts the sentence in both |
| 10 | The Runs tab showed a revision only on the run already selected | Fixed: every row reads its own `definition.revision` |
| 11 | `queued` conflated a key never instantiated, a key mapped into another run and a key waiting its turn | Fixed: a key with no mapping is `absent` (`not run`) on a dashed block |
| 12 | The outcome word REPLACED the block's sublabel, so the run view was less legible about the shape than the rest view | Fixed: the sublabel stays and the word is right-aligned beside it |
| 13 | `parseRuns` passed a throwaway array to `parseTemplates`, so a snapshot that silently lost a node reported nothing | Fixed: the template parser's own warnings are forwarded prefixed `run <id>: ` |
| 14 | `mapping` survived a dropped definition and kept keys the definition does not hold | Fixed: dropped with the definition, pruned to the definition's keys with a warning |
| 15 | Seven smaller things | Six fixed: the reversed-copy `find`, the hardcoded `--blue`/`--green`/`--red` (the block now stamps `data-tone` through `outcomeTone` and the wire's target/refusal rules moved after it so a drag still wins), the run selection pointing at nothing, the stale strip outliving its reason, a built-in's copy gated on `dirty`, and the missing copy door (a `workflow-copy` verb, a `Workflow: save a copy` palette row and its `V9_DOORS` entry). `STALE_VERBS` is now RENDERED in the strip rather than deleted |
| 15b | `wants-you` is unreachable — nothing writes a pending question onto a run entry | DECLINED as a removal, recorded instead: the member stays with the reason in the module's own comment and in the check's name, because `RunEntry` gaining a pending question is a milestone away and a vocabulary with a hole in it is the thing that gets filled wrong |

Evidence for the fixes: `verify:layout` 248/248 (`run.def.1` extended with the unsaved mark,
the forwarded warning and the pruned mapping), `verify:viewport` 140/140 (`run.outcome.1`
extended with `absent`, `skipped`, `stopped` and the open/sealed pair), `verify:verbs` 22/22,
`verify:palette` 143/143, `verify:styles` 56/56, `verify:meta` 38/38, `npm run typecheck` 0.
`workflow.door.1` was watched failing against the pre-fix adapter — 70/71, that check the only
failure (`out/v9-evidence/m184b-door-red.log`, exit 1) — and passes with it
(`m184b-product.log`, 71/71, exit 0, 101.5 s wall against a 124 s watchdog).

### Act II — the goldens that changed, and the sentence for each

`npm run verify:visual` after M184 exited 1 at 54/59. Five scenes changed; each was looked at
(fresh and diff, `out/visual/`) before a golden was written, and each changed for the same two
product reasons: the M183 line that promised saving "arrives with M184" is gone because it has
arrived, and Stop's disabled reason names the workflow rather than the pool because the
workflow — its chats included — is what Stop now acts on.

- **workflow** — The resting panel drops one disabled sentence and renames another, so Save now
  says only that the diagram matches the template and Stop says nothing of this workflow is
  running; the diagram rises by that one line (16 px) and nothing else on the page moves.
- **workflow-edit** — The same two lines, in the maximised editor: the library column and the
  diagram both rise one line together, so the pointer mapping the scene exists to show is
  unchanged, and the library, the inspector and the rail are untouched.
- **wide** — The same panel at the wide breakpoint with the context pane resident, the same
  one-line rise; the pane's own fields do not move, which is the point of keeping this scene.
- **palette-query** — The canvas section gained M184's copy door (`Workflow: save a copy`), so
  the scrolled list moves by exactly one row: the panels row leaves the top of the window and
  `Workflow: run` comes into view above `Clear scrollback logs`. No row changed its words.
- **starter** — The workflow example wears the same two changes, and a built-in's `Save a copy`
  is now a live verb rather than a greyed one — it is the only save a built-in has, and gating
  it on an edit made the primary path unreachable from the example a beginner is looking at.

## M185 — the preview reads as the app beside its code (Act III.1)

Spec `docs/superpowers/specs/2026-09-08-m185-preview.md`. This milestone is the plan's M185 and
M186 rows together, under the recorded plan amendment: discovery, device widths and capture are
one surface and splitting them would have shipped a preview that could not be looked at.

**What shipped.** `shared/preview.ts` (the named widths, `parseListeningPorts` over lsof's
field form, `parseDevScripts` over a package.json text, `discoveryOf`'s three states and one
sentence each, `captureRefusal`); `main/preview-discover.ts`, which asks ONE `lsof` over the
pids the renderer already holds and reads ONE `package.json`, and runs nothing else;
`main/preview-capture.ts`, which checks the scheme on the guest's LIVE url, refuses an empty
image by name and writes one PNG under `userData/captures` with the page named on the result;
`device` on the browser record (absent is full width, malformed costs the field); the pane's own
controls (four width chips, Capture, Find the project, a Retry on the failure line and the
discovery list with Start dev); a coalesced 300 ms reload on `file:changed` that reloads the
guest it already has rather than rebuilding it; and four verbs, four palette rows and four
`V9_DOORS` entries.

**Decisions.**
- *Discovery's subject is a running terminal or chat, not the browser pane.* The pane knows a
  url and nothing about a project; the panel with a directory and a process tree is the only
  thing on the canvas that knows what is being built. No subject is a refusal that names what
  to select.
- *`full` is the ABSENT default.* Choosing it REMOVES the key rather than writing
  `device: 'full'`, so the record, the parser and the node keep one spelling of the default.
- *The width is a LAYOUT, never a transform.* A scaled guest reports the pane's viewport to the
  page and every media query then answers for the wrong device — the check asserts the computed
  transform is `none` beside the 390 px.
- *A capture is an ordinary image object.* It moves, groups, exports and deletes like every
  other picture and its title names the page, so provenance is on screen rather than in a log.
- *A dev script is offered, never run by discovery.* Starting it is its own verb and it goes
  through the ordinary spawn door, so the server is a panel a person can see and stop.

**Red first.** `preview.1` was watched failing with `preview.ts` and `preview-discover.ts`
absent (85/86, `out/v9-evidence/m185-file-red.log`, exit 1); `preview.capture.1` was watched
failing with `preview-capture.ts` moved out of the tree (86/87,
`out/v9-evidence/m185-capture-red.log`, exit 1); `preview.device.1` was watched failing with
its parser arm removed (248/249, `out/v9-evidence/m185-layout-red.log`, exit 1). `preview.1`
in the product part was red twice against real defects it found: a chip that pressed nothing
(the verb read the selection through a ref React had not written yet — the pane is now NAMED by
its own control) and a harness with the inert preview handlers (now wired to the same
discoverer and capture production uses).

**Green.** `verify:file` 87/87, `verify:layout` 249/249, `verify:verbs` 22/22,
`verify:palette` 143/143, `verify:styles` 56/56, `verify:meta` 38/38, `verify:viewport`
140/140, `npm run typecheck` 0, `verify:panels:product` 72/72 at 103.3 s
(`out/v9-evidence/m185-product.log`, exit 0). The product watchdog is re-measured at 130000 ms
(1.25× the slower of two green runs, 101.5 s and 103.3 s).

**One rule changed.** `closure.v9.1` compared each verb's owed workflow door to the literal
`M189`. The plan amendment moved the executor to M188, so a truthful record turned the suite
red: the check now reads the due as data (`/^M\d+$/`), the same shape its canvas arm already
used, and every v9 row's due is M188.
