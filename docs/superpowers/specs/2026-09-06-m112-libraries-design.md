# M112 — the outside libraries: design

**Date:** 2026-09-06 · **Base:** `main` at `dc62cc8` (2.3.0) · **Branch:** `m112-libraries`

One milestone, five sections, one plan, executed test-first in the order written. Nothing
user-facing changes except two opt-in settings, so no version bump. Every section either adds a
check or records a decision by name; none adds a panel kind, a channel or a `BackendDef` field.

## What was measured before this was written (M0)

- The tree is clean `main`; the Obsidian run (M109–M111) has merged. No other session is in the
  checkout.
- `@doyensec/electronegativity` run by hand over `src/` with `-e 43.4.1`: **seven findings, all
  deliberate** (listed in §1). Run WITHOUT `-e` it printed `Couldn't detect Electron version,
  assuming v0.1.0` — every check then assumes 2018 defaults, silently. It did NOT flag
  `webviewTag: true` (`main/index.ts`), a blind spot recorded in §1. Runtime ~4s. It prints a
  benign `Could not retrieve updated translations` warning offline and still exits 0.
- `@xterm/addon-canvas`: last published 2024-07-14 (0.7.0); `addons/addon-canvas` no longer
  exists on xterm.js master. Abandoned upstream. `@xterm/addon-serialize` is 0.14.0 and current.
- `@sentry/electron` is 7.18.0. Its renderer SDK forwards events to MAIN over IPC
  (`IPCMode.Classic` rides Electron IPC; `IPCMode.Protocol` fetches `sentry-ipc://`, which the
  renderer CSP `default-src 'self'` would block with no error). With `contextIsolation: true`
  the preload must init too or errors there are lost.
- ACP: `@zed-industries/claude-code-acp` 0.16.2 is on npm and wraps the installed `claude`. The
  Act I spec's M0 line "No ACP-speaking CLI is installed" is therefore no longer true.
- `export:panel-text` today answers `{ kind: 'off' }` when `scrollback.persist` is off — an
  export refused for text on screen (`main/export.ts`, `deps.persistOn()` first).
- `layoutStore.load()` runs at `main/index.ts:943`, `createWindow()` at `:1560`: main knows every
  setting before the window exists.

---

## §1 · `verify:electron` — Electronegativity as a suite

### Why

Twenty-five suites and none reads the Electron security boundary the whole credential design
rests on: `contextIsolation`, `nodeIntegration`, `sandbox`, the CSP, the preload's exposure, the
`<webview>` guest's five properties. Each fails silently if regressed — the app keeps working, the
boundary is gone. The tool checks precisely that set, offline, in the plain-node tier.

### Shape

- devDependency `@doyensec/electronegativity` (it pulls eslint 7 — heavy, accepted, stated).
- `scripts/verify-electron.cjs`, plain node. Runs the package's CLI with `execFileSync` over
  `src/` with `-e <electron version parsed from package.json devDependencies>` and `-o` to
  `out/verify/electronegativity.csv`; parses the CSV; compares against `ACCEPTED`.
- `ACCEPTED`: a closed list of the seven findings, keyed by `(check, file relative to repo,
  sample substring)` — never a line number, which drifts. Each row carries ONE sentence saying
  why it is accepted. The seven:

| check | file | sample | why accepted |
|---|---|---|---|
| `CSP_GLOBAL_CHECK` | `src/renderer/index.html` | `style-src 'self' 'unsafe-inline'` | xterm sets inline styles on its layers; scripts stay `'self'` |
| `SANDBOX_JS_CHECK` | `src/main/index.ts` | `sandbox: false` | the preload needs `require('electron')` for `contextBridge`; node-pty stays in main |
| `PRELOAD_JS_CHECK` | `src/main/index.ts` | `preload: join(__dirname` | the one bridge; `verify:ipc` pins its channels |
| `AUXCLICK_JS_CHECK` | `src/main/index.ts` | `new BrowserWindow(` | the renderer is `file:` and never navigates (`drop-guard.ts`); middle-click has no target |
| `OPEN_EXTERNAL_JS_CHECK` | `src/main/index.ts` | `void shell.openExternal(url)` | the `link:open` door: main decides, after `resolveOpen` |
| `OPEN_EXTERNAL_JS_CHECK` | `src/main/index.ts` | `await shell.openExternal(r.url)` | the browser pane's `Open in browser`, url from the guest's own `getURL()` |
| `PROTOCOL_HANDLER_JS_CHECK` | `src/main/index.ts` | `app.setAsDefaultProtocolClient(CONTROL_SCHEME)` | the `tc://` URL door, restricted to `open` (M54) |

### Checks (scoped ids)

- `eneg.1` — the CLI ran, exited 0, its argv carried `-e <the electron version in package.json>`,
  and its output does NOT contain `assuming v0.1.0` (the detection failure has no other symptom,
  and a suite that only asserted its own argv would prove nothing about what the tool assumed).
- `eneg.2` — no finding outside `ACCEPTED`. The failure detail prints the check, the file, the
  sample and the wiki URL.
- `eneg.3` — every `ACCEPTED` row still fires. A row that stopped firing means the code moved or
  changed and the sentence beside it now describes nothing; the fix is editing the list, by hand.
- `eneg.4` — the blind spot: `webviewTag: true` exists in `main/index.ts` and the `will-attach-webview`
  handler beside it deletes `preload`, disables `nodeIntegration`, and sets `contextIsolation`
  (read as text, comment-stripped, the way meta 20/21 read). The tool did not see the guest at all.

### Wiring

`package.json` script + the `verify` chain string (meta 19 fails otherwise); the CLAUDE.md suite
table row; the `docs/verify-suites.md` row (with the blind spot and the `-e` rule); CI unchanged
(it runs `npm run verify`). `graphify update .` after.

---

## §2 · `@xterm/addon-serialize` — export from the live buffer; canvas addon declined

### The defect

`export:panel-text` reads only the durable log. With `scrollback.persist` off it answers `off`
and the user is refused an export of the text in front of them. The live xterm buffer is the
honest second source, and serialize is the correct primitive for it (VT sequences from the
parsed grid, not a second copy of every byte).

### Shape

- `SessionHandle.serialize(): string | null` in `session/panel-session.ts` — `null` when no
  Terminal exists yet (a never-spawned card has no buffer). `session-factory.ts` loads
  `SerializeAddon` in `ensure()` beside Unicode11; `serialize()` returns
  `addon.serialize({ scrollback: <all> })`.
- The bridge method becomes `export.panelText(request: { panelId; buffer?: string })`. SAME
  channel (`export:panel-text`), richer argument — no diagram change, no channel-count change,
  `verify:ipc` untouched. The renderer's caller (`usePaletteActions`' export verb) includes
  `handle.serialize()` when the panel is spawned and live.
- Main's arm order in `createExporters.panelText`:
  1. persistence on → the log (durable, longer than the 10 000-row buffer). Empty log AND a buffer
     supplied → the buffer (a panel spawned after the log was cleared).
  2. persistence off → the buffer when supplied.
  3. nothing from either → `empty`.
  4. persistence off AND no buffer → `off`, its sentence naming the fix (turn persistence on, or
     export a live panel).
  Every source passes `stripAnsi` then the ONE outward gate, unchanged. The result's `source:
  'log' | 'buffer'` is added so the palette's feedback can say which.

### Checks

- `verify:file export.4` (plain node, beside the existing `export.1–.3`): the four arms over a
  fake log and a supplied buffer; a token planted in the buffer is gone from the written text and
  the note names the panel; the log is preferred when both exist.
- `verify:panels export.1` (real renderer): persistence off, a live panel prints a token, the
  export verb runs, the result is `written` with `source: 'buffer'` and the token redacted.
- `verify:xterm serialize.1`: a Terminal with rows written, detached and re-attached, serializes
  the same rows — proven as an EQUALITY of the three readings, through the real `SessionHandle`.
- `verify:xterm serialize.2` (round 2): a 400-character run auto-wrapped across ~10 rows in a
  narrow real terminal is reunited unbroken.
- `verify:file export.6` (round 2): a secret split mid-token across a real CR/LF is redacted
  WHOLE, AND ordinary multi-line text whose boundaries abut on word characters keeps every
  break — the second arm is what a blanket join fails.

### Amended 2026-09-06 (review round 2): the serialize addon is declined too

`@xterm/addon-serialize` was implemented, measured and REMOVED. Two reasons, both found by
building it:

1. **Its wrap reconstruction leaked a secret.** The addon renders a display wrap as a hard
   `\r\n`, which split a planted token across a line; `redactSecrets` is line-oriented, so it
   scrubbed only the row carrying the prefix and 54 characters of the token reached a real
   exported file. The log path is immune (a wrap leaves no byte in the PTY stream), so the
   addon made the new source strictly leakier than the one it supplements.
2. **Its one advantage is discarded a moment later.** `main/export.ts` calls `stripAnsi` on the
   text before the gate, so the VT sequences and styling the addon exists to reproduce are
   thrown away in the next statement.

`SessionHandle.serialize()` now reads the buffer directly (`translateToString(true)` per row,
the shape `tail()` already uses) and joins a row to the previous one with NO separator when
`line.isWrapped` is true **or** the previous row's trimmed length exactly equals `term.cols`.
The second clause is not belt-and-braces: `isWrapped` ALONE was proven insufficient against a
real `/bin/zsh -l` at the harness's own 93x23 — zsh's line editor redraws a too-long TYPED
command with its own cursor-positioning escapes rather than relying on terminal auto-wrap, so
xterm never marks the continuation row. Shell OUTPUT wrapping is marked correctly, and a plain
`/bin/sh` echo did not reproduce it, which is why only the real login shell surfaced it. The
accepted cost is one false join when ordinary output ends exactly at the current width; the
decision reads a single buffer row and never accumulated output, so it cannot cascade.

The method keeps its name and its `string | null` tri-state (null before a Terminal exists),
which main's `off` vs `empty` arms depend on. `verify:xterm serialize.2` proves a 400-character
run auto-wrapped across ~10 real rows is reunited unbroken.

### Canvas addon — declined by name

`@xterm/addon-canvas` is abandoned upstream (M0). `create-terminal.ts`'s WebGL → DOM fallback is
the supported degradation path, and the LOD budget has exactly two renderers to reason about.
The spike the research proposed is not run; this paragraph is its answer.

---

## §3 · Sentry, opt-in, DSN in settings, default OFF

### Posture

Nothing leaves the machine until the user pastes a DSN for a project THEY own. Native crash dumps
are a second, separate decision, off by default, because a dump is process memory and can carry
what a terminal showed or a token main held during a verify. This is the credential store's
posture (refuse rather than fall back) reaching telemetry.

### Settings (`shared/settings-schema.ts`)

New `TELEMETRY_CATEGORY = 'Privacy & telemetry'`. Neither setting is `planWritable` — a plan
must not be able to switch telemetry on, the same rule as the ceilings.

- `telemetry.sentryDsn` · `text` · default `''` · label `Sentry DSN` · description: "send crash
  reports and errors to a Sentry project you own — nothing is sent until a DSN is here; takes
  effect on next launch".
- `telemetry.nativeCrashes` · `boolean` · default `false` · label `Include native crash dumps` ·
  description: "a dump is process memory and can contain what a terminal showed or a token this
  app held — off unless you accept that".

### Main (`main/telemetry.ts`, pure; `main/index.ts` wires it)

- `telemetryPlan(read: (id) => SettingValue)`: `{ on: false, reason: 'no-dsn' }` |
  `{ on: false, reason: 'malformed-dsn' }` (not `https://…@…/…`) | `{ on: true, dsn,
  nativeCrashes }`.
- `scrubEvent(event)`: the `beforeSend`. Builds a NEW event field-by-field from an allowlist —
  `event_id`, `timestamp`, `level`, `release`, `environment`, `contexts.os`/`app` (name, version),
  `exception.values[].{type, value, stacktrace.frames[].{function, lineno, colno, filename}}` with
  every occurrence of the userData path and the home directory replaced by `<userData>` /
  `<home>`. NO `breadcrumbs`, `request`, `user`, `extra`, `tags` from the SDK's defaults, and the
  `value` string passes `redactSecrets`. Never a spread: a field the SDK adds later cannot leak
  through it (M91's rule, third data source).
- Init in `main/index.ts` AFTER `layoutStore.load()` and BEFORE `createWindow()`, with
  `sendDefaultPii: false`, `defaultIntegrations: false` plus the explicit list (onUncaughtException,
  onUnhandledRejection, functionToString, linkedErrors, electronMinidump ONLY when
  `nativeCrashes`), `beforeSend: scrubEvent`, `beforeBreadcrumb: () => null`. The ~100 ms of boot
  before the store loads is uncovered — the trade for reading the setting from the store.
- `@sentry/electron` is a runtime `dependencies` entry (externalized in main by
  `externalizeDepsPlugin`, bundled into the renderer by vite). No native module.

### Renderer and preload — zero new channels

- Main passes `--tc-telemetry=1` via `webPreferences.additionalArguments` when the plan is on.
- The preload reads `process.argv`, exposes `canvas.telemetry: { enabled: boolean }` on the
  bridge (a FIELD, not a channel), and when enabled inits `@sentry/electron/renderer` with
  `ipcMode: IPCMode.Classic` (rides IPC — the CSP needs no change; Protocol mode would be blocked
  silently), `defaultIntegrations: false`, `beforeBreadcrumb: () => null`.
- `renderer/main.tsx` inits the same way before React mounts, gated on the bridge field. Nothing
  is installed when off: no console patching, no global handlers.

### Checks

- `verify:layout telemetry.1` — both settings exist with the stated types and defaults; neither
  is `planWritable`; the category is named once.
- `verify:file telemetry.2` — the plan's three arms; `scrubEvent` over a fixture event stuffed with
  breadcrumbs, a `request`, a `user`, a token in the exception value and the home path in a
  frame: asserted on the OUTPUT's KEYS (no `breadcrumbs`, `request`, `user`, `extra`) and the
  token and path gone.
- `verify:meta readers.1` unchanged and re-read: the credential store's readers are still exactly
  three (`main/telemetry.ts` is not one). New `telemetry.3` in meta: no `@sentry` import in
  `shell-env.ts`, `pty-manager.ts`, `credential-store.ts`, `scrollback-log.ts`.
- `verify:electron` baseline unchanged (Sentry adds no anti-pattern).
- `verify:panels` boots with no DSN (default) — a check that `canvas.telemetry.enabled === false`
  in the harness, and the renderer defines no `__SENTRY__` global.
- No suite sends anything: the DSN is empty everywhere in the chain.

---

## §4 · ACP against `BACKENDS` — the diff

### Output

`docs/acp-registry-diff.md`; the Act I spec's "ACP, declined by name" amended in place with a
dated note; CLAUDE.md's M99 bullet gains one sentence. **No new `BackendDef` field**: each
dimension is recorded with the consumer that would want it, per the customer-free-abstraction
rule (M23-spec §9.1). A field lands when an `acp` row does.

### The diff

| ACP | `BACKENDS` today | Finding |
|---|---|---|
| `session/load` | `resumes` | same fact |
| `session/cancel` | `interrupts` | same fact |
| `session/request_permission` with `allow_once / allow_always / reject_once / reject_always` | `asksPermission` (one kind); M98's grant is `allow_always` | a `permissionKinds` dimension — consumer: the approval card's verbs |
| `ToolCallKind`: `read / edit / delete / move / search / execute / think / fetch / other` | — | **the data M102 wanted** ("read-only methods, data not a path heuristic") — `toolKinds`, consumer exists today (`main/broker.ts`'s read-only gate) but only an ACP stream carries it |
| `session/set_mode` | — | no consumer |
| `session/update: plan` | — | M97's chip could project it; consumer only with an ACP row |
| `elicitation/create` | — | structured questions, the approvals' third shape; no consumer |
| `terminal/*`, `fs/*` (client-side — the AGENT asks the HOST) | — | the inversion: this canvas as an ACP CLIENT whose panels are the agent's terminals. A milestone; recorded as one |
| prompt content blocks incl. image | `images` | same fact |
| `initialize` capability negotiation | the table itself | ACP negotiates at runtime what `BACKENDS` declares statically; an `acp` row's capabilities would be FILLED from `initialize`, not written by hand |

### Premise correction

"No ACP-speaking CLI is on this machine" is no longer true: `npx @zed-industries/claude-code-acp`
(0.16.2) speaks ACP over stdio around the installed `claude`. The "what it would take" paragraph
is re-costed: three recorded streams (`initialize → session/new → session/prompt` with a tool
call, a `request_permission`, a `session/load`) into `scripts/fixtures/agent-session/acp/`, a
JSON-RPC layer over the manager's line seam (bidirectional — the host ANSWERS a request by id),
an `acp` row with `adoptsThreadId: true`, `asksPermission: true`, capabilities filled from
`initialize`. Still declined for THIS milestone; the cost is now measurable and written down.

---

## §5 · tldraw camera API against `viewport.ts`

### Output

`docs/canvas-camera-comparison.md` and two entries in `docs/ideas-backlog.md`. No adoption —
live WebGL xterm nodes cannot be canvas-drawn shapes, and React Flow's DOM ceiling is the problem
`lod.ts` already solves for this case.

### Findings recorded

- `viewport.ts` and tldraw's `Editor` agree on the primitives: `screenToWorld`/`screenToPage`,
  `worldToScreen`/`pageToScreen`, `zoomAt`/`zoomIn(point)`, `panBy`, `centreOn`/`centerOnPoint`,
  `fitTo`/`zoomToBounds`, `clampScale`/camera constraints. The delta rule this repo pins
  (`screenToWorld(p₂) − screenToWorld(p₁)`) is the same rule `Editor.screenToPage` callers obey.
- **`getDebouncedZoomLevel()` / `getEfficientZoomLevel()`** — a zoom that lags during motion so
  shapes do not re-render per frame. `lod.ts` solves the same problem with hysteresis at the
  tier boundary; `useRailModels` with signatures. Backlog: a debounced scale for the tier pass
  during a pinch.
- **`getCameraState(): 'idle' | 'moving'`** — one signal. Backlog: pause `machine:sample` polling
  and rail rebuilds while moving.
- `slideCamera` (inertia) — declined; a trackpad already supplies inertia at the OS.

---

## What the milestone must not break

The credential store's three readers; `registry.version()` carrying nothing new; the outward gate
as the ONE exit; the renderer CSP unchanged; the channel count (107) unchanged; `verify:meta 19`
(every suite wired); `usePaletteActions` as one `useMemo`.

## Order

§1 → §2 → §3 → §4 → §5. Verify serially after each section (one `npm run verify` at a time),
one commit per section, spec and plan committed first. CLAUDE.md, `docs/verify-suites.md`,
`docs/load-bearing.md` (new entries: the ACCEPTED baseline's two-way rule; export's arm order;
`scrubEvent` as an allowlist; the additionalArguments gate) and the README milestone table row
for M112 land with the section that earns them. `graphify update .` before the merge.
