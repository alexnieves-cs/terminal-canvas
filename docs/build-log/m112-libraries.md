# M112 — The outside libraries: build log

Branch `m112-libraries`, base `main@dc62cc8` (2.3.0). Five sections (§1–§5 of the spec,
`docs/superpowers/specs/2026-09-06-m112-libraries-design.md`), one task each plus this
closing records task, executed serially with `npm run verify` run after every section.

## §1 — `verify:electron`

`@doyensec/electronegativity` added as a devDependency and wired as a twenty-sixth suite,
`scripts/verify-electron.cjs`. Twenty-five-plus suites had never once read the Electron
security boundary the credential design rests on — `contextIsolation`, `nodeIntegration`,
`sandbox`, the CSP, the preload's exposure, the `<webview>` guest's hardening — and every one
of those regresses silently: the app keeps working, the boundary is gone. The tool runs over
`src/` with `-e <the electron version in package.json>` (without it the tool assumes v0.1.0's
defaults, silently — `eneg.1` greps its own output for the absence of that fallback string
rather than trusting a 0 exit code either way proves nothing about). Its `ACCEPTED` list is a
closed, two-way baseline of seven findings keyed by `(check, file, sample substring)`, never a
line number: a new finding fails (`eneg.2`), and a row that stopped firing fails too
(`eneg.3`) — the second half is the one that gets "fixed" quietly, when someone tidies a
literal into a variable and the sentence beside the row goes on describing code that no
longer exists. `eneg.4` pins the tool's own blind spot as text: it never inspects
`will-attach-webview` or a webview tag at all, so the browser pane's hardening (M103) is
invisible to its SARIF and has to be read from `main/index.ts` as comment-stripped source,
the way `verify:meta` 20/21 already read the credential boundary.

Reviewed once (1 Important, 2 Minor: an unguarded SARIF parse that could abort the suite, the
CSP finding's "why" sentence, lockfile churn) and landed clean after one fix round.

## §2 — Export from the live buffer; `@xterm/addon-serialize` declined

The defect: `export:panel-text` answers `off` whenever `scrollback.persist` is off, refusing
an export of text plainly on screen, even though the xterm buffer holding it is right there.
`@xterm/addon-serialize` was implemented as the fix, measured, and then **removed** — the
addon renders a display wrap as a hard `\r\n`, which split a planted secret across two lines;
`redactSecrets` is line-oriented, so it scrubbed only the half carrying the prefix and 54
characters of a real token reached a written file in review. Its other advantage (VT fidelity)
is thrown away a statement later by `main/export.ts`'s own `stripAnsi` call, so the addon was
strictly leakier than the log it supplemented for no fidelity actually kept.

`SessionHandle.serialize()` instead reads the buffer directly and joins a row to the one before
it with no separator when `line.isWrapped` **or** the previous row's trimmed length equals
`term.cols`. The second clause is required, not defensive: `isWrapped` alone was disproved
against a real `/bin/zsh -l` at 93×23 — zsh's line editor redraws a too-long typed command with
its own cursor-positioning escapes instead of relying on terminal auto-wrap, so xterm never
marks the continuation row, and a plain `/bin/sh` echo did not reproduce it. Main's export arm
order became log → buffer → empty → off (off now means persistence off **and** no buffer
came), with a `source: 'log' | 'buffer'` field on the result so a user comparing the file to
the screen can see which source answered.

Two critical findings in review, both fixed: a plan defect of mine that left the palette's
export row closed behind `REASON_SCROLLBACK_OFF` even after the feature shipped a second
source (extended into `commands.ts`), and — in the first attempted fix for the wrap leak — a
`closeWrapGaps` pass that deleted `\r\n` between any two token-alphabet characters, merging
ordinary multi-line command output by default. The addon-removal design above is what survived
two review rounds; `@xterm/addon-canvas` was separately declined by name as abandoned upstream,
leaving exactly two renderers (WebGL, DOM) for the LOD budget to reason about.

## §3 — Sentry, opt-in

Nothing leaves the machine until a user pastes a DSN for a project they own.
`telemetry.sentryDsn` (text, default empty) and `telemetry.nativeCrashes` (boolean, default
false — a minidump is process memory and can hold what a terminal showed) are neither
`planWritable`, the same rule as the two ceilings. `main/telemetry.ts`'s `scrubEvent` is an
allowlist copy, never a spread, naming every field it keeps and replacing every occurrence of
the userData path and the home directory with `<userData>`/`<home>`; breadcrumbs are dropped
whole. Main inits after the settings store loads and before the window exists, gated on the
plan; the renderer learns the decision through an argv flag (`--tc-telemetry=1`) lifted by the
preload into a bridge field (`canvas.telemetry.enabled`) — no new IPC channel, no CSP change.

Review found one Critical: the renderer's Sentry transport (`IPCMode.Classic`) depends on the
preload calling `hookupIpc()` to expose `window.__SENTRY_IPC__`, and nothing did — main's
`defaultIntegrations: false` had also dropped the SDK's own preload-injection integration, so
the renderer silently fell back to fetching `sentry-ipc://`, which the CSP refuses with a
swallowed `.catch` and no error anywhere. Fixed: the preload now imports `hookupIpc` from the
non-side-effecting `@sentry/electron/preload-namespaced` entry (never the plain `/preload`,
which runs unconditionally at import) and calls it inside the telemetry gate; the renderer's
own `init()` names `globalHandlersIntegration` explicitly, since `defaultIntegrations: false`
with no explicit list installs nothing at all. `verify:meta telemetry.5` pins the transport's
wiring as text — the hand check itself (a real DSN, a thrown error, an arriving Sentry event)
stays owed; no Sentry project was available during this run.

## §4 — ACP against `BACKENDS`

`docs/acp-registry-diff.md` re-reads the Act I "declined by name" premise against a table of
ACP's methods versus `BACKENDS`' current shape; the Act I spec and CLAUDE.md's M99 entry are
amended in place with a dated note. No `BackendDef` field added — the customer-free-abstraction
rule (M23-spec §9.1) says a field lands only when an `acp` row does, and none does this
milestone.

## §5 — tldraw's camera API against `viewport.ts`

`docs/canvas-camera-comparison.md`: `viewport.ts` and tldraw's `Editor` already agree on the
core primitives (`screenToWorld`/`worldToScreen`, `zoomAt`, `panBy`, `centreOn`, `clampScale`).
No adoption — live WebGL xterm nodes cannot become canvas-drawn shapes, and tldraw's DOM
ceiling is the exact problem `lod.ts` already solves for this app's case. Two backlog ideas
recorded in `docs/ideas-backlog.md`: a debounced zoom level for the tier pass during a pinch,
and a `moving`/`idle` camera signal to pause `machine:sample` polling and rail rebuilds while
the camera is in motion. `slideCamera` (inertia) declined — a trackpad already supplies it at
the OS.

## The records (this task)

Every suite re-run and its own final line read rather than trusted from the spec: `verify:meta`
33/33, `verify:layout` 205/205, `verify:palette` 133/133, `verify:file` 52/52, `verify:xterm`
9/9, `verify:panels` 309/309, `verify:electron` 4/4 (new). CLAUDE.md's suite table and
`docs/verify-suites.md` carry the real counts and the new `verify:electron` row (with the
`-e` rule and the webview blind spot named); the README gained the M112 row after M111 with no
version bump (this milestone ships no version change); `docs/load-bearing.md` gained four
entries (the `ACCEPTED` list's two-way rule, export's arm order, `scrubEvent` as an allowlist
copy, telemetry's argv-flag-plus-bridge-field wiring) and the owed Sentry hand check on the
manual-only list. The supply-chain fact this run's own review round misattributed twice is
recorded here too: `npm audit`'s critical `tar` finding and high `@mapbox/node-pre-gyp` finding
both trace to `@doyensec/electronegativity` (confirmed by `npm ls @mapbox/node-pre-gyp` naming
electronegativity as the only path to it) — `@sentry/electron` contributes neither. Both are
devDependencies only, never shipped, and the tool parses this repository's own source rather
than extracting an untrusted archive, so the CVEs are accepted as not reachable through this
suite's use of the package; `docs/verify-suites.md`'s `verify:electron` row states the two
exits (an `overrides` pin, or dropping the suite) as revisitable.

## The graph and the chain

`graphify update .` run after the last edit. `npm run verify` green end to end on the branch
tip; every suite's count is the one stated above, read from its own output rather than assumed.
No push; merge is the user's call.
