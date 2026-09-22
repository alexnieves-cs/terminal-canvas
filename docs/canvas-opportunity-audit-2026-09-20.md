# Terminal Canvas — real-user readiness report

**Assessment date:** 2026-09-20  
**Verdict:** **not ready for a broad real-user release.** The product has a substantial,
documented feature set and a previously verified 5.0.0 build, but the current tree lacks a
fresh release gate, its visual regression gate is knowingly red, and its distribution path is
explicitly unsigned. These are release-readiness issues, not reasons to discard the existing
product or finish the entire roadmap first.

This is a read-only audit. I did not run Electron, package a build, or change product code. The
working tree was already dirty when the audit began, so historic green evidence is not evidence
for the current checkout.

## Executive summary — do these first

1. **Make the macOS distribution trustworthy.** Acquire the Apple Developer signing/notarization
   capability, sign and notarize the release artefact, and test install/update on a clean second
   Mac. The present configuration deliberately sets `identity: null`; asking users to bypass
   Gatekeeper is not an acceptable broad-release installation flow.
2. **Restore a clean, current release gate.** Resolve the four visual failures (especially the
   unclassified `starter` difference), then run and record the full verify, visual, and packaged
   gates serially on the exact release commit. Do not write a golden until the change has been
   reviewed and classified.
3. **Run a small external beta/acceptance program.** Exercise the unautomatable paths with real
   people, machines, CLIs, credentials, and a throwaway GitHub repository. Prioritize first-run,
   Codex-only onboarding, real agent permissions, safe credential storage, notifications,
   dev-preview, drag/drop, and the outbound PR path. Convert reproducible findings into targeted
   checks where practical.

## Release blockers

### P0 — Signed and notarized distribution is absent

- **What is confirmed:** The release is macOS/Apple-Silicon only and unsigned. The public README
  instructs a user to override Gatekeeper; the builder configuration explicitly disables a
  signing identity. The historic 5.0.0 DMG is likewise unsigned.
- **Why it blocks real users:** Gatekeeper presents a security warning before the first launch.
  More importantly, the documented credential boundary relies on macOS `safeStorage`, whose
  actual protection is expressly weaker/unverified for the app's unsigned identity. A coding
  agent application that can run arbitrary user commands must earn, rather than ask users to
  bypass, the operating system's trust signal.
- **What it takes:** A release-engineering milestone: Apple Developer enrollment, Developer ID
  signing, hardened runtime/entitlements review, notarization and stapling, CI or a controlled
  release machine, plus clean-machine installation and upgrade tests. Retain the unsigned local
  developer build if useful; it must not be the public artefact.
- **What could break:** native `node-pty` packaging, the `terminal-canvas://` protocol handler,
  existing user-data separation, and Keychain access. Test on both a clean account and an upgrade
  from the current unsigned build.
- **Evidence:** [README.md:11](../README.md:11),
  [build/builder-config.cjs:102](../build/builder-config.cjs:102),
  [docs/load-bearing.md:2330](load-bearing.md:2330),
  [docs/build-log/m180-m200-ledger.md:1634](build-log/m180-m200-ledger.md:1634).

### P0 — There is no clean release-quality verification result for this checkout

- **What is confirmed:** A previous clean 5.0.0 commit passed the full, visual, and packaged
  gates. That result is historical. The current audit started on a dirty tree; the most recent
  Orchestrate close only ran `npm run affected`, which is explicitly not the gate, and recorded
  known failures in the agents and product panel suites.
- **Why it blocks real users:** A release candidate cannot inherit a green result from an earlier
  commit, particularly after Canvas/Orchestrate changes. The repository deliberately excludes
  visual and packaged verification from `npm run verify`, so a basic green run alone is not a
  release claim.
- **What it takes:** Freeze a candidate commit, run `npm run verify`, `npm run verify:visual`, and
  `npm run verify:packaged` serially on an otherwise idle machine, retain logs, and triage every
  failure. Re-run any Electron failure alone before classifying it as a product defect or a load
  problem.
- **What could break:** tests share Electron/tmux timing constraints; parallel Electron runs have
  documented false failures. This is a release procedure and evidence gap, not an invitation to
  weaken the gate.
- **Evidence:** [docs/build-log/m180-m200-ledger.md:1583](build-log/m180-m200-ledger.md:1583),
  [docs/build-log/m180-m200-ledger.md:1626](build-log/m180-m200-ledger.md:1626),
  [docs/build-log/m299-orchestrate-chrome.md:108](build-log/m299-orchestrate-chrome.md:108),
  [scripts/verify-all.cjs:1](../scripts/verify-all.cjs:1).

### P0 — Visual regressions are knowingly unresolved

- **What is confirmed:** `verify:visual` was recorded failing four scenes on 2026-09-20:
  `starter` plus all three Orchestrate scenes. The `starter` failure has an unclassified,
  potentially functional difference: its context pane is absent in the fresh capture. The three
  Orchestrate baselines were written after a critic review, but their recorded divergences remain
  work for the next scene pass.
- **Why it blocks real users:** The golden policy exists to stop silent UI regressions. The
  `starter` screen is a first-run surface, so an unexplained missing context pane is release
  relevant. The issue must be classified as intended default behavior or fixed; it cannot be
  rebaselined blindly.
- **What it takes:** Reproduce `starter` reliably first, decide whether the absent panel is a
  regression, then fix or deliberately change it with a critic sentence before updating only the
  justified goldens. Resolve or explicitly scope the remaining Orchestrate visual defects.
- **What could break:** first-run discoverability, shell responsive layout, scene legibility and
  the screenshot harness itself. Goldens must change on purpose, not merely to turn a test green.
- **Evidence:** [docs/build-log/m299-orchestrate-chrome.md:131](build-log/m299-orchestrate-chrome.md:131),
  [docs/build-log/m299-orchestrate-chrome.md:159](build-log/m299-orchestrate-chrome.md:159),
  [docs/product-rules.md:52](product-rules.md:52).

## Must complete before expanding beyond a controlled beta

### P1 — Core first-run and agent journeys need real-world acceptance testing

- **What is confirmed:** The project itself lists a beginner first-run trial, real local preview,
  dark-palette runtime inspection, and clean-machine Gatekeeper test as owed. The more recent
  intent-led onboarding work also leaves the core success criterion—starting meaningful work
  without terminal knowledge—unmeasured by a person.
- **Why it matters:** This product is most valuable when it turns intent into reviewed work. A
  technically correct launcher can still fail if installation, authentication, wording, or
  recovery confuses a first-time user.
- **What it takes:** Script 5–10 representative beta sessions, observe without coaching, record
  time-to-first-success and every refusal/dead-end, and fix the highest-frequency blockers.
  Include a machine with no compatible CLI, a machine with only Codex, and a repository with a
  dev server.
- **What could break:** onboarding's no-mint-before-validation rule, path grants, composer focus,
  and first-run layout. Pair fixes with existing gates and visual review.
- **Evidence:** [docs/build-log/m180-m200-ledger.md:1597](build-log/m180-m200-ledger.md:1597),
  [docs/build-log/m205-d09-intent-led-onboarding.md:173](build-log/m205-d09-intent-led-onboarding.md:173).

### P1 — Codex-only users cannot start the primary folder-based workflow

- **What is confirmed:** The intent-led onboarding ledger says a Codex-only machine cannot use
  **Start work** because the teammate backend is Claude, and its Codex chat opens in home rather
  than in the selected folder.
- **Why it matters:** README positions Codex as a supported agent CLI. For users who have Codex
  but not Claude, the primary onboarding promise does not lead to a repository-based task.
- **What it takes:** One focused milestone to make backend choice/capability resolution flow
  through first-work creation, preserve the existing refusal behavior where a capability is
  absent, and exercise both CLI-only configurations.
- **What could break:** dispatch idempotency, worktree creation, agent-session adapter rules and
  permission mode argument construction.
- **Evidence:** [README.md:7](../README.md:7),
  [docs/build-log/m205-d09-intent-led-onboarding.md:181](build-log/m205-d09-intent-led-onboarding.md:181).

### P1 — Security- and integration-critical paths are only faked or manually checked once

- **What is confirmed:** Automated verification intentionally remains offline and uses fakes for
  several external boundaries. Outstanding/one-time checks include OS notifications, Keychain
  protection, real CLI argument behavior and permission enforcement, real GitHub token rejection,
  real push/PR/comment behavior, update-feed behavior, native dialogs/protocol registration, and
  Sentry delivery/redaction.
- **Why it matters:** These are exactly the paths that carry credentials, run agents, write to
  GitHub, notify a user, or report a failure. A green suite proves the app's controlled behavior,
  not the external system's live contract.
- **What it takes:** A release checklist with isolated test accounts, a throwaway repository,
  revoked/under-scoped credential cases, and explicit pass/fail evidence. Make live probes opt-in
  and never run them as part of the normal offline suite.
- **What could break:** user credentials, accidental remote writes, paid agent usage and privacy.
  Keep outward tests fenced to disposable resources and require human confirmation.
- **Evidence:** [docs/load-bearing.md:2301](load-bearing.md:2301),
  [docs/load-bearing.md:4113](load-bearing.md:4113),
  [docs/load-bearing.md:4130](load-bearing.md:4130).

## Important product work, but not a prerequisite for an initial release

### P2 — Finish the post-D10 core-job roadmap deliberately

The project has correctly separated "not yet built" from "not releasable." D11 and D13–D20
remain unscheduled, including retained outcomes/resume, broader reader coverage, saving an
arrangement/workflow, integration depth, and collaboration/conflict handling. These capabilities
would materially deepen the core job, but an initial solo, local macOS release does not need all
of them. Choose them based on beta evidence rather than treating their absence as a release bug.

The exception is D13's reader-failure/honest-coverage work: it is designed to be pulled forward
if a beta journey is blocked, and should be prioritized if users encounter an unavailable result
presented as an empty one.

**Evidence:** [docs/build-log/m193-m224-ledger.md:56](build-log/m193-m224-ledger.md:56),
[docs/build-log/m193-m224-ledger.md:67](build-log/m193-m224-ledger.md:67).

### P2 — Resolve known Canvas presentation debt when it affects beta usability

Backlog #86 needs an authoritative repository root propagated from main to file/toolbox models;
#88 covers deterministic screenshot time/PTY output, edge-label inset, and remaining bespoke
empty states. These are real, bounded defects/debt, but neither should delay signing and a clean
release gate unless beta users hit it in the first-run or review journey.

**Evidence:** [docs/build-log/m206-m208-d10-hierarchy.md:35](build-log/m206-m208-d10-hierarchy.md:35).

## Explicitly not required for this release

- Completing every unstarted roadmap phase (D11–D20). They are planned improvements, not an
  implicit claim that 5.0 has no usable release boundary.
- Cross-platform support. macOS-only and Apple Silicon are documented product limits; state them
  accurately in release channels rather than promising Windows/Linux support.
- Multi-user shared canvas, service-node breadth, arbitrary shell/transform workflow nodes, or an
  extension registry. The release notes correctly reject shipping these without an adequate trust
  and verification design.

**Evidence:** [README.md:11](../README.md:11),
[docs/release-notes/5.0.0.md:47](release-notes/5.0.0.md:47),
[docs/build-log/m193-m224-ledger.md:75](build-log/m193-m224-ledger.md:75).

## Recommended release sequence

1. Resolve the current visual/functional gate failures and freeze a release candidate.
2. Sign, notarize, staple, and package it; validate install, URL scheme, migration, and Keychain
   behavior on clean and upgrade machines.
3. Run the three automated gates serially and archive their outputs against the candidate SHA.
4. Run the external-beta checklist against real CLIs and disposable credentials/repositories.
5. Ship a limited macOS/Apple-Silicon beta with an explicit support and rollback channel; promote
   only after the beta's P0/P1 findings are closed or consciously accepted with user-visible
   limitations.

## Scope and limitations

I read the repository index, README, product rules, architecture map, release configuration,
current and historic ledgers, the manual-only verification register, release notes, verification
runner, and the current working-tree status. I did **not** perform an exhaustive line-by-line code
review, execute the application, inspect every backlog item or closed-backlog decision, run a
build/test/package command, or contact external services. Consequently this report is a
release-readiness triage based on repository evidence, not an independent security audit or a
substitute for hands-on beta testing.
