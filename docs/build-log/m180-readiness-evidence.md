# M180 readiness — delegated red-first evidence

2026-09-08. Owned changes: `scripts/verify-onboarding.cjs` and this evidence file.
The checks were written from the v9 plan and design brief, the existing `EnvReport`
shape, and the backend registry, before the corresponding implementation. No source,
package scripts or goldens were edited by this check writer.

The agreed pure API is `onboardingReadiness(report, preferred?)` from
`src/shared/onboarding.ts`. Its rows name `backend`, `discovery`, `authentication`,
`sentence` and `setupUrl`; its optional `preferred` is an installed first-launch
engine. M180's direct first-launch rows are Claude and Codex. Copilot/ACP do not
become available merely because a caller names them. Installation never establishes
authentication, even when the environment report includes authentication key names.

## Pure red

Exact command, from the repository root:

```sh
node scripts/verify-onboarding.cjs
```

Exit **1**, tally **0/12 passed**. Every independent `onboarding.1` through
`onboarding.12` printed `FAIL` with `src/shared/onboarding.ts does not exist`.
The suite catches the missing-module case and reports each case, so an uncaught
exception did not prevent later checks from executing. The parent received this
result before adding the pure implementation.

The checks cover: no report; installed versus authenticated; Git without an agent;
timed-out discovery; an older report whose shell did not answer; an omitted CLI
row versus explicit null; installed preference; missing preference fallback;
unsupported preference; replacing a missing report with an installed result while
leaving both inputs untouched; documentation-only setup data; and a bundled import
boundary limited to shared modules with no external imports.

## Launcher red

After the parent implemented the pure model, two additional static markup checks
were written against the unchanged Launcher. Exact command:

```sh
node scripts/verify-onboarding.cjs
```

Exit **1**, tally **12/14 passed**. All twelve pure checks passed.
`onboarding.markup.1` failed because the rendered `data-onboarding-start` button
was absent (`start: null`), while the old Claude door was disabled with its named
reason and the old Codex door remained enabled. `onboarding.markup.2` failed
because installed/sign-in readiness copy was absent. This result was sent to the
parent before Launcher implementation began.

The markup check renders the real Launcher through `react-dom/server`. It does
not claim that a click creates a conversation or that a message reaches an agent;
those require the real renderer's separate start/send check. No shell probe,
vendor CLI, authentication flow, network request or executable installer ran.
The suite's generated bundles are under repository-local `out/verify/`; the
commands neither require a temporary directory nor write a package cache.

Full-chain, visual and packaged verification remain the parent run's obligations.
