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
