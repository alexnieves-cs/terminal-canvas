# Load-bearing details, recovered from the M24 draft

> **What this file is.** On 2026-09-05 (M91) the archived M24-era extraction of the
> load-bearing section (`origin/archive/m24-github-work-panel`, `docs/load-bearing-details.md`)
> was diffed against `docs/load-bearing.md` on `main` by paragraph similarity. 192 entries in
> the draft had no counterpart on main — not reworded, ABSENT — and every symbol they name in
> backticks still exists in `src/`, `scripts/` or `build/`. They are folded back HERE, verbatim,
> rather than into the main file, because the check that admitted them was **symbol presence,
> not a line-by-line re-verification**: an entry below names a module that still exists and a
> rule that was true at M24, and M25–M90 may have changed the rule while keeping the name. Read
> each as "this was load-bearing once and nothing obviously removed it"; before relying on one,
> `grep` the module it names. An entry found false belongs deleted, not corrected here.
>
> The 27 entries the draft carried whose named symbols are GONE are listed at the end, by
> lead and missing symbol, so the loss is recorded rather than silent.

**...which is why pointer coordinates needed correcting, not just gating.** The same
blindness means `getBoundingClientRect()` is transform-aware while
`dimensions.css.cell.width` is not, so under `scale(k)` every click lands on a cell off by a
factor of `k`. M3 gated body clicks to a band near 1:1 rather than fix the arithmetic; M4a
fixes it instead (see "Pointer coordinates are corrected, not gated" above) by intercepting
and re-dispatching mouse events with rewritten `clientX`/`clientY` before they reach xterm.

**`nextIdRef` seeds from the restored ids (`Canvas.tsx`).** Initialising it to `1` collides
with a restored `n5` after five `Cmd+N` presses on the previous run — the same id-collision
defect M4a fixed by replacing length-derived ids, resurrected through a different door if the
counter doesn't take the restored state into account.

**Undo removing a panel must dispose its session.** `registry.dispose` has **five call sites
in `Canvas.tsx`** — the close button (`onClosePanel`), undo/redo removing a panel
(`applyHistory`), the reset handler (`onReset`, dropping every panel at once), workspace
delete since M7 (dropping one doomed workspace's panels), and restart in place since M8c
(`restartPanel`, ending one panel's session so a fresh one can take its id). This is a
count worth re-deriving from the code rather than trusting a stale number: it was two until
the reset handler arrived in a later task and this line did not get updated alongside it — the
exact failure this note exists to prevent happening again. None of the five adds a caller of
`pty.kill`: `dispose(id)` and `disposeAll()` remain the only two inside `session-registry.ts`,
and routing all five through `dispose()` rather than calling `pty.kill` directly is exactly
what keeps that count true. Without the undo/redo call site, `Cmd+N` then `Cmd+Z` leaked a live
process with no panel left to close it. Re-derived again at the end of M5b (`grep -n
"registry.dispose" src/renderer/canvas/Canvas.tsx`): still three at the time. The palette's "Reset canvas…"
row added no fourth — it invokes `canvas:request-reset` and main answers with the same
`canvas:reset` event the menu item sends, so it lands in `onReset`, the call site that already
existed. Re-derived again for M7 (same grep, current lines 330, 602, 997, 1825): now four, and
the fourth one is deliberately not a fifth `pty.kill` caller either, for a reason worth stating
plainly because it is easy to get backwards — a workspace's record is about to be deleted
entirely, so a surviving session there is one no UI can ever reach or stop again (there is no
"recover an orphan session" feature — `docs/ideas-backlog.md` #61 — to fall back on), which
makes disposing the RIGHT call even though "demote, not dispose" is the rule for every other
workspace-switch path in this milestone. Re-derived again for M8b (same grep, current lines
340, 614, 1031, 1904): still four, unmoved in count — the panel outline reads panels and status
through `railRows`/`useAgentState`, never through the registry, so it added no fifth call site
of its own; only the LINE NUMBERS drifted, from earlier tasks' insertions above them in the
file. Re-derived again for M8c (same grep — and this time **without** quoting the line
numbers, because the M8c re-derivation above went stale inside the very commit that recorded
it: a comment grew by three lines above them before the commit closed. The grep is the durable
half; the numbers were never anything but a snapshot, in the one paragraph in this file whose
entire subject is a number going stale): now
**five**, and the fifth is restart in place. It is deliberately not a third `pty.kill` caller,
for the reason that makes restart work at all: restart is dispose-then-`ensure` at ONE id, so
it needs precisely what `dispose(id)` already does — end the process, tear down the local
handle and delete the map entry, and hand back the kill's promise so the respawn can be
ordered behind it (see "`dispose(id)` returns its kill" below). Reaching `pty.kill` directly
would skip the local teardown, leave a disposed `SessionHandle` in the map for the new session
to collide with, and make the two-caller count re-derivable from two places instead of one.
`verify:panels` 94 now pins BOTH numbers by reading the source text, precisely because this
line is the one that has already gone stale once.

**M16 is the day the claim above about `verify:panels` needing no alias turned out to be only
half true, and it broke as a HANG rather than a failure.** `verify:panels` is its own Electron
entry point, not `out/main/index.js` (see "`verify:canvas` and `verify:panels` are the suites
that consume the build" below) — `scripts/panels-entry.cjs` hand-wires `registerIpcHandlers`
and friends through its OWN esbuild bundle, `scripts/verify-panels.cjs`'s `ENTRY_OUT` build,
which is main-process code and has nothing to do with the already-built renderer the paragraph
above is about. That bundle carried NO alias at all, and got away with it the identical way
every other plain-node bundle in this section did — every `main/*` import from `@shared` was an
`import type`, erased before bundling — right up until `main/file-read.ts` imported real VALUES
from `@shared/file-panel` (`FILE_MAX_BYTES` and its siblings) to build this milestone's channels.
The failure shape is worse than a red suite: `buildSync` is the FIRST executable statement in
this harness, so the bundle failing to resolve throws at MODULE SCOPE, before any window — or
even this harness's own setup code — exists at all; there is nothing to "wait" on. What turns
that into a silent hang rather than a printed error is Electron's own handling of an uncaught
main-process exception, not the harness. A suite that goes from green to HANGING, with no
failure printed anywhere, is a worse failure than one that goes red, because
CI has to time it out rather than fail it. The fix is the same two aliases every other bundle in
this section carries, added to `panels-entry.cjs`'s own `buildSync` call.

**`verify-canvas.cjs` is the THIRD bundle to hit this exact gap, fixed the same way, in the same
milestone.** `verify-viewport.cjs` was the first to need the alias pre-emptively (see above);
`verify-panels.cjs`'s `ENTRY_OUT` build was the second, and the paragraph immediately above
records it. `scripts/verify-canvas.cjs` bundles `panels-entry.cjs` a SECOND time, through its
own, separate `buildSync` call (`ENTRY_OUT = .../canvas-entry.cjs`) — it is a different harness
file with a different reason to exist (`verify:canvas` drives the real canvas in a real
renderer; `verify-panels.cjs` drives panel lifecycle), so it wires up its own copy of the same
`registerIpcHandlers`-plus-`PtyManager` scaffolding rather than importing the other harness's.
That copy carried no alias either, for the identical reason: every `main/*` import from
`@shared` was an `import type` until `main/file-read.ts` imported real VALUES from
`@shared/file-panel`. The failure was the same HANG shape described above — `verify:canvas`
printed the `esbuild` resolution error to stdout but the Electron process did not exit on its
own, so a corrected re-run needed the stuck process killed by pid first. The fix is the
identical two aliases, added to `verify-canvas.cjs`'s own `buildSync` call. The lesson this
third occurrence adds to the first two: a fix applied to ONE bundle that reuses
`panels-entry.cjs` does not cover every bundle that reuses it — each `buildSync` call is its own
esbuild invocation with its own config, so the alias has to be added at every call site
separately, and a later reader should grep for `panels-entry.cjs` across `scripts/` before
assuming this gap is closed everywhere.

**`scripts/verify-ipc-surface.cjs` is the FOURTH bundle to hit this exact gap, in M22.**
It does not reuse `panels-entry.cjs` at all — it bundles `main/ipc.ts` directly, through its
own `buildSync` call — so the first three fixes (`verify-viewport.cjs`, `verify-panels.cjs`'s
`ENTRY_OUT` build, `verify-canvas.cjs`) covered none of it, exactly as each of those three
covered none of the others. It carried no alias for the identical reason the first three
did not: every `main/*` import from `@shared` was `import type` until `main/ipc.ts` reached
`main/file-write.ts`, which imports `FILE_MAX_BYTES` — a real VALUE — from
`@shared/file-panel`. The lesson the third occurrence already drew held exactly: a fix
applied to one bundle does not cover a bundle that does not reuse it, and this is the
instance that proves the grep-every-`buildSync`-site rule was not academic — this one is
not even findable by grepping for `panels-entry.cjs`, because it bundles its own entry from
`main/ipc.ts` directly, so the search has to be "every `buildSync` call in `scripts/`", not
"every file that imports the harness".

**`RestoreSettings` lives in `layout.json`, not a second store.** The renderer never learns the
settings exist as a distinct concept; main applies them in `LayoutStore.initial()` and hands
the renderer an already-resolved starting state. A future settings surface should reach for
the same mechanism — one file, behind `LayoutStore` — rather than inventing a second store for
a fourth toggle.

**One operation became three (`window-lifecycle.ts`, `pty-manager.ts`,
`main/index.ts`).** Before M4c a single `killAll()` served every teardown path,
because under `node-pty` those paths genuinely meant the same thing. Under tmux
they do not: a renderer teardown calls **`detachAll()`** (local handles die, tmux
sessions live), closing a panel calls **`kill(id)`** which also calls
`backend.destroy(id)` (the session dies), and `before-quit` calls
**`shutdown()`** (`kill-server` on our private socket). Reverting
`attachPtyLifecycle`'s callback to `killAll` keeps every check in
`verify:window` green while silently restoring the M3 behaviour M4c exists to
remove — which is why `verify:pty-manager` check 12 asserts the reattached pid
is the *same* pid.

**Dormancy is about spawning, not attaching (`renderer/main.tsx`).** A panel
with a live tmux session has nothing to spawn, so M4b's "restored panels are
dormant" rule does not apply to it — it reattaches like any M3 panel and
`LIVE_BUDGET` still caps how many at once. A panel with no live session still
restores dormant. `lod.ts` is untouched: a reattachable panel is not dormant and
never consults "dormancy outranks focus". A failed `pty:list` degrades to the
empty set, which restores everything dormant — the safe direction, because it
spawns nothing.

**...and two concurrent verify runs must not touch each other's
(`scripts/verify-socket.cjs`, `TC_VERIFY_SUFFIX`).** The rule below keeps the
suites off the app's socket; nothing kept them off EACH OTHER's. `VERIFY_SOCKET`
and `PANELS_SOCKET` were module constants with no override, and both suites end
in `shutdown()` — `kill-server` — so two checkouts running `npm run verify` at
the same moment kill each other's sessions mid-run. That is #49 one layer down,
and CLAUDE.md already named the cause in the app's own case: "`TMUX_SOCKET`
being a module constant is what makes both true."

**Measured, both directions.** A canary session was left on the default socket
and the suite run twice: with `TC_VERIFY_SUFFIX` set it survived and the suite
was 28/28; without, it was destroyed. That control run also failed CHECK 14
(`reported=0` instead of 7), which is the OTHER hazard this file records under
check 20's obligation, reproduced by accident: `-f <conf>` applies only when a
client STARTS a server and is ignored against one already running, so the
canary's config-less server had no `pane-died` hook and the exit code fell
through to the client's. A stale server does not merely cost you sessions — it
makes one specific check lie.

**The verify suites must never touch the production socket.** Every argv
builder in `tmux-args.ts` takes the socket as a *defaulted* parameter for this
reason alone; `TMUX_SOCKET` stays the production value and `verify:tmux` 9 still
pins that default. `verify:pty-manager` runs on `terminal-canvas-verify`,
because its check 15 calls `shutdown()` — `kill-server` — and running
`npm run verify` with the app open used to destroy every agent in the live
instance.

**An absent `command` must stay absent through four layers (`shared/layout-schema.ts`'s
`parsePresets`, `main/presets.ts`'s `templateOf`, the `PRESET_SPAWN`/`PRESET_DEFAULT` payloads,
and `Canvas.tsx`'s `onSpawn`/`onCapture`).** Each of the four rebuilds its object field by
field rather than spreading, because spreading a preset would carry `command: undefined`
across the IPC structured clone, where `'command' in template` then reads **true** — the
field exists, it just holds `undefined`, and that is a different fact than the field being
absent. The failure is total and silent: every command-less preset (the built-in login shell,
and any user preset saved from a login-shell panel) would spawn a hardcoded shell instead of
resolving the user's actual login shell the way `resolveCommand` does. `verify:layout` 34 and
`verify:panels` 31 are the two halves — one on the parse side, one end-to-end through a real
spawn. The module-scope cache in `renderer/main.tsx` is deliberately NOT a fifth rebuild: it
stores and passes the received template BY REFERENCE, so there is nothing there to get wrong.
Writing `{...defaultTemplate}` at that hop would make it a fifth place that can lose absence.

**Navigating must not wake (`Canvas.tsx`'s `goToPanel`).** Waking hangs off *selection* —
`onSelectPanel` clears the dormant id and calls `registry.wake` — so the obvious implementation,
reuse `onSelectPanel`, would spawn an agent as a side effect of NAVIGATING. On a restored
twelve-panel canvas that is twelve CLIs launched by a keyboard tour, the exact failure M4b's
dormancy rule exists to prevent. `goToPanel` calls `centreOn` and then `selectAndRaise` — the
select-and-raise half of `onSelectPanel`, factored out precisely so the switcher can have it
without `registry.wake`. Raising is deliberate and is not a wake: a raise is a `z` change and
nothing more, and without it a framed panel can land *underneath* an overlapping one, showing
none of the selection ring this command's only feedback consists of. Dormancy is left alone, and
the card still says "click to start" and still means it. `verify:panels` 39, which asserts WHERE
the camera landed (recomputed from `centreOn`'s own arithmetic), not merely that it moved — a
switcher that framed the wrong panel also moves the camera.

**Three ways out of the palette, and the third one must not restore focus (`Canvas.tsx`'s
`onMouseDownCapture`, `usePalette.ts`'s `dismissPalette`).** A click outside the overlay closes
it. Without that, one click reaches the state rule 1 exists to prevent: `.palette` is a 680px
box at `top: 12%`, not a full-viewport scrim, so the click lands on a panel or the background,
the input is blurred, xterm's textarea has DOM focus — and the overlay is still on screen
looking ready to take a query while every bare key goes to the agent. `Escape` cannot even undo
it, because the key now reaches the PTY rather than the palette's `onKeyDown`. Two details are
load-bearing. It is a **capture-phase** listener on the canvas host, not the background
`onMouseDown`: every panel handler `stopPropagation`s its own mousedown, so a close written into
the background handler would fire for background clicks *only* and leave the panel case — the
common one — broken; the containment test is an explicit `closest('.palette')`, because the
`.palette` root's own bubble-phase `stopPropagation` (see the note above) cannot stop a listener
on an ancestor that has already run. And it calls `dismissPalette()`, which closes **without**
`restoreFocus(capturedId)`: the click itself is the focus gesture — it is about to focus the
panel it hit, or release focus entirely on the background — so restoring would either yank the
keyboard back to the panel the user just clicked away from, or leave xterm focused while
`focusedId` is null. Nothing prevented, nothing stopped: the click still selects and focuses
what it landed on. `verify:panels` 42 asserts both halves.

**Hover is the fourth way the selection moves, and it needs two guards to keep
the sentence above true (`Palette.tsx`'s `lastPointerRef`/`pointerSelectRef`).**
Hovering a row sets the same `index` the arrow keys set, rather than painting a
parallel `--hover` class: `.palette__row--selected` is the only thing telling
the user what `Enter` will run, and two highlights on screen at once is a
question rather than an answer. That makes the pointer a first-class way to move
the selection — which is fine, a hover IS the user moving it — but it closes a
loop with `scrollIntoView` that fails in both directions and is silent in both:

**`centreOn` is the third narrow camera verb (`useViewport.ts`).** The `setViewport` setter
stays private — nothing outside should move the camera — so anything that needs to asks by
name: `resetViewport` (Cmd+0's INITIAL), `worldCentre` (a read, for menu-driven spawns), and
now `centreOn(rect)` for the panel switcher. Exposing the setter instead would make every
future caller a camera owner, and the coordinate math would stop being something
`verify:viewport` can pin. `centreOn` deliberately does not change the scale (`verify:viewport`
49–50): zooming to frame a panel would reflow nothing (the world transform is scale-blind to
xterm — see "One transform, not N layouts") but would throw away the zoom level the user chose,
and `Cmd+1` already exists for "fit everything". M7 adds a **fourth** narrow verb,
`restoreCamera(camera)`, for a workspace switch — and it is the one exception to "deliberately
does not change the scale": a workspace's saved zoom level is part of what it means to come back
to it, so `restoreCamera` sets `x`, `y` AND `scale` exactly (`verify:viewport` 73). Like
`resetViewport` and `centreOn`, it must stay a `useCallback` for the identical reason the next
entry gives.

**`resetViewport` must stay a `useCallback` (`useViewport.ts`).** Referential stability here is
load-bearing, not tidiness. A fresh arrow per render propagates straight through `Canvas.tsx`'s
`useMemo([resetViewport, ...])` for `paletteActions`, into `Palette.tsx`'s `commands` memo,
whose `[rows]` effect **re-seats the selected row**. `Canvas` re-renders on every mousemove over
`.canvas` (`setCursor`), so an unstable identity means: arrow down three times, nudge the mouse,
press Enter — and the wrong command runs. Nothing throws, nothing logs, and the selection looks
correct in a screenshot. `centreOn` and, since M7, `restoreCamera` both sit in the same dep
arrays for the same reason — `restoreCamera` is one of `switchWorkspace`'s own dependencies.

**`verify:panels` check 39 seeds its own dormant panel with its own reload, deliberately
outside the `if (!TMUX)` branch.** It needs a never-spawned, still-dormant panel alive at the
end of the run, and nothing in the boot layout can be it (check 23's reset collapses the canvas
to one fresh panel). The obvious economy — reuse check 26's reload — makes check 39 hard-fail on
every machine with no tmux binary, because check 26 and its reload skip together there, for a
reason that has nothing to do with the command palette. A panel with no live session restores
dormant under either backend ("Dormancy is about spawning, not attaching"), so check 39's reload
needs nothing check 26 set up and is run unconditionally.

**The packaging config is a function, not a blob (`build/builder-config.cjs`).** A `"build"`
key in `package.json` or an `electron-builder.yml` has no *function* in it, so any check
written against one reads JSON and compares it to itself. `buildConfig(opts)` returns the
config, which is what lets `verify:package` assert "`node-pty` is unpacked" as a property of a
computation in the cheapest tier the repo has. It is plain CJS in a TypeScript-first repo on
purpose: electron-builder loads it itself, at build time, in a process nothing here can put
esbuild in front of — and the payoff is that `verify-package.cjs` is the one plain-node suite
needing no esbuild entry, because the module is import-free. Keep it import-free; requiring
anything from `src/` drags the TypeScript build into the config load.

**`asarUnpack` is the difference between an app and a demo (`build/builder-config.cjs`).**
`node-pty` is a native module, and a `.node` binary cannot be `require`d out of an asar
archive. Get it wrong and the app launches, renders the canvas, shows its first panel, and
dies at the first `pty:create` — the latest and quietest failure this codebase can produce.
The pattern is anchored `**/node_modules/node-pty/**` rather than at the root so it keeps
matching if npm hoists `node-pty` to a nested depth; a root-anchored pattern stops matching
silently, months later, with no code change to blame. `verify:package` 1–2 pin both halves and
`verify:packaged` 9 is the end-to-end proof.

**A packaged build must not share a tmux server with a dev build (`tmux-args.ts`'s
`resolveSocket`, `main/index.ts`).** `before-quit` calls `shutdown()`, which is `kill-server`
on the private socket, so a shared socket means quitting either build destroys the other's
running agents — the exact outcome M4c exists to prevent, arriving through a door M4c could
not see, because nothing before M5c made two simultaneous instances plausible. `TMUX_SOCKET`
stays `'terminal-canvas'` and stays every builder's default, so `verify:tmux` check 9 is
untouched; packaged resolves to `'terminal-canvas-app'`. The `TC_TMUX_SOCKET` override is a
developer flag with no UI, and `verify:packaged` is why it exists. **A blank override must be
treated as unset** (`verify:tmux` 23): `TC_TMUX_SOCKET=` in a shell is `''`, and tmux given an
empty `-L` does not error — it falls back to the *default* socket, i.e. the user's own tmux
server, which `shutdown()` would then `kill-server`. M5c also moved `start-server`'s argv out
of `tmux-probe.ts` and into `buildStartServerArgs`: it was the one tmux argv in the codebase
built by hand, which is exactly why check 9's list of socket-targeting argvs never mentioned
it.

**...and two copies of ONE build must not either — one instance owns the socket and
the store (`main/index.ts`'s `hasInstanceLock`).** `resolveSocket` separates dev from
packaged; nothing separated a build from ITSELF until this fix. Two copies share one
`userData` directory, so one store's coalesced write lands on top of the other's, and
they resolve the same socket, so `before-quit`'s `shutdown()` — `kill-server` — destroys
the OTHER instance's running agents with nothing said anywhere. It is the hazard "the
verify suites must never touch the production socket" already records, with the fix
applied on the harness's side and not on the app's, and it was reachable by
double-clicking the dock icon: `window-all-closed` deliberately does not quit on darwin,
so an instance whose window is closed is still an instance and still holds the socket.

**The baseline is captured once, and `reattached` is why (`pty-manager.ts`'s
`create`, `main/baseline-capture.ts`).** `captureBaseline` fires from inside
`create()`, gated on `capturedBaselineIds` — an in-memory `Set` that survives a
`Cmd+R` reload but not an app relaunch — for the identical reason
`buildHasSessionArgs` has to ask `has-session` *before* the spawn: `-A` makes
create and reattach the same call, so `create()` runs again for every panel on
a reload whether or not anything actually respawned. Under tmux, that second
call REATTACHES to a session that may have been working for an hour, and an
ungated `captureBaseline` there would reset the baseline to "now" — the pane
would then report "no changes" for an agent that had rewritten half the
repository, silently, with the only evidence being a diff that never shows up.
The in-memory guard is deliberately not the only one: `baseline-capture.ts`'s
own `deps.baselineOf(panelId) !== undefined` check is a SECOND, independent
door that answers a different question (a persisted record already exists,
regardless of which `PtyManager` instance is asking), which is what makes the
baseline survive an app relaunch even though `capturedBaselineIds` itself does
not.

**...but "once" means once per SESSION, and a relaunch is a new session
(`main/index.ts`'s startup sweep, `baseline-capture.ts`'s `staleBaselineIds`).**
The two guards above answer "has this panel already been captured", and until
M9a's final fix wave the persistent half answered it for too long. Quitting
runs `shutdown()` — `kill-server` on the private socket — so at the next launch
NOTHING survives and the user's first click starts a genuinely new agent, while
`layout.json` still holds the baseline from the previous run. `capture()`
early-returned on it, and the panel was diffed against a snapshot from a
previous day: every edit the user made by hand in between attributed to the
agent, which is success criterion 1 failing for the second and every later
session of a panel, and makes `review.ts`'s "a panel's *session-start*
snapshot" and `IPC.REVIEW_PANEL`'s "since its session started" both untrue
after the first quit. The sweep runs once at `whenReady`, alongside the orphan
reconcile that already calls `ptyManager.list()` — which asks the BACKEND, so
it reports sessions this run never spawned — and drops the baseline of every
panel with no surviving session. **The `Cmd+R` guarantee is untouched, and
must stay so**: that is `capturedBaselineIds`, in memory, in a process the
reload does not restart; the sweep runs in a fresh main process whose copy of
that set is empty by construction, so the two cannot collide. Both directions
are pinned (`verify:review` 37/37b), because a sweep that dropped too much
would delete the baseline of every panel whose tmux session outlived a crash —
recapturing against a tree the agent has already rewritten, which is the exact
"no changes" failure this whole milestone turns on.

**git is resolved by absolute path from the login env, exactly like tmux
(`main/index.ts`'s `gitPath`, `git-runner.ts`).** `createGitRunner` spawned the
bare name `git` until M9a's final fix wave, against whatever PATH launchd
handed the app — the identical defect `shell-env.ts` and `tmux-probe.ts` exist
to prevent, and the app already computed the right answer for its startup
diagnostic (`whichFromEnv('git', env)`) and threw it away. The consequence was
the worst available one for this milestone: on a machine whose git lives only
under `/opt/homebrew/bin`, the spawn ENOENT'd or resolved a different binary,
`resolveRepo` returned null, and the Changes section **silently rendered
nothing** for a genuine repository — the same shape as the ordinary
`not-a-repo` case and therefore invisible as a bug, while `git-missing`, the
arm designed for exactly "no git on the resolved PATH", never fired at all in
production. It was asserted only against fakes handing back `notFound: true`;
`verify:review` 19b is its first production-path evidence. The runner takes
`gitPath` and `env` as GETTERS for the reason `PtyManager`'s `getBackend` is
one — it is constructed at module scope, long before `resolveShellEnv()` runs
at `whenReady` — and it must never import `shell-env.ts` itself, which would
drag a real login-shell probe into the plain-node verify tier. When git cannot
be resolved it logs ONCE, loudly, the `tmux-probe.ts` treatment the spec asked
for and which did not exist anywhere in the feature.

**Every git call has a timeout, and the review fires on `idle` alone
(`git-runner.ts`'s `GIT_TIMEOUT_MS`, `Canvas.tsx`'s `idleArrivals`).** Two
halves of one bound. The effect depended on `selectedAgentState` wholesale, so
`starting`, `busy`, `idle`, `wants-you` and `exited` each re-fired it at up to
four git spawns apiece, with no cache and no debounce, while the spec and
`IPC.REVIEW_PANEL`'s own comment both name exactly one useful signal: the
transition TO `idle`, i.e. "this agent stopped producing output". It is a
COUNTER of idle arrivals rather than a derived `state === 'idle'` boolean,
because a boolean changes on the way OUT of idle too — a firing with nothing
new to read — and the counter only advances within one panel's own selection,
since a selection change has already re-fired the effect by id.
`GIT_TIMEOUT_MS` is 30s: far above any real `git diff --numstat` this app will
ask for, and far below "forever", which is what the calls had. A ceiling that
could fire on a legitimately slow diff would report `baseline-lost` for a
repository that is perfectly fine — a confident wrong answer produced by a
stopwatch. Neither caller has anyone to time it out on its behalf: the capture
is fire-and-forget and the read is an invoke whose reply simply never arrives.
`verify:review` 19c, whose LOWER time bound is the half that discriminates.

**Auto-repeat is one gesture, not fifteen (`useViewport.ts`'s `REPEATABLE_KEYS`,
`usePalette.ts`).** Holding a key does not produce one keydown; the OS emits the real
press and then an auto-repeat stream at roughly 15/sec, and every one of them arrives
as an ordinary `keydown`. Nothing in this codebase consulted `event.repeat` until this
fix, so holding `Cmd+N` spawned a panel — and, once it went live, a PTY — per repeat:
two seconds of a held chord was thirty agents and a canvas well past `LIVE_BUDGET`,
i.e. a WebGL context count against a browser cap near sixteen, which
`create-terminal.ts`'s `webglDisabled` makes permanent for the run. `Cmd+K` had the
same gap with a louder symptom, because it TOGGLES: a held chord flickered the overlay
at the repeat rate and re-ran `openPalette`'s `setCapturedId(focusedIdRef.current)` on
every flip, so which panel the palette's rows acted on depended on whether the user
released on an odd or an even repeat.

**Sections are data, and section-first sorting is why the grouping is real
(`palette-model.ts`'s `SECTIONS` and `filterCommands`).** Until M6p the palette
sorted `(b.score - a.score) || (a.order - b.order)`, and `commands.ts`'s header
comment called construction order "the grouping" on the strength of that stable
tiebreak. It was not. Score won OUTRIGHT, so construction order survived only
for the EMPTY query — one keystroke interleaved the groups, and "Delete preset
Claude" could sit directly above "New panel from Claude" with nothing but a
repeated 68px uppercase chip to tell them apart. `filterCommands` now sorts by
`SECTIONS` index first, then score, then construction order, which is what lets
the rendered headers be true while the user types and makes a destructive row
structurally incapable of leapfrogging its benign sibling. Two consequences
worth not undoing. **`SECTIONS` is an ordered array rather than a union**: the
old closed `CommandGroup` hardcoded its order in the type AND in `verify:palette`
check 30, which is why M6b's plan needed a written section explaining that adding
one section meant editing both — appending an object literal is the whole
operation now, and check 30 derives its expectation from `SECTIONS` rather than
restating it. And **the selection seeds from `bestMatchIndex`, not
`firstRunnable`**: with rows ordered by section, "the first runnable row" is the
top of Panels no matter what was typed, so `Enter` would run something unrelated
to the query. `bestMatchIndex` ignores sections and picks the best-scoring
RUNNABLE row — runnable being the half that matters, since a best match parked on
a disabled row makes `Enter` a silent no-op. For an empty query every score ties
at 0 and it degenerates to exactly `firstRunnable`, so one function serves both
states.

**Changing `SECTIONS` means running `verify:panels` too, not just
`verify:palette`.** `verify:panels` check 48 restates `SECTIONS`' order as its
own hardcoded `ORDER` array, in the same fixed-list-that-must-move-with-the-
source-of-truth shape check 30 above was rewritten to stop doing — kept
restated rather than importing `palette-model.ts` because this suite loads
the BUILT renderer rather than bundling it, and reaching the real `SECTIONS`
value here would mean adding plumbing. M7's Task 4 added `'workspace'` to
`SECTIONS` and ran only `verify:palette`, which is a plain-node suite with no
`ORDER` array to go stale — it stayed green while `verify:panels` 48 sat red
for two whole tasks with nobody noticing, because nothing prompted running
the Electron tier for a change that "was just a palette thing." The
staleness compounded: `'Settings'` had ALSO been missing from `ORDER` since
M6b, silently harmless until then only because every settings row is
`hiddenAtRest` and nothing unconditional renders that header at rest — M7's
new always-visible "New workspace…" row (no `hiddenAtRest`) was what finally
made a missing header observable. **The rule going forward: a task that edits
`SECTIONS` runs `verify:panels`, not only `verify:palette`, before calling
itself done** — the two suites check the same fact from different processes
and only one of them can see the DOM.

**`searchText` leads the haystack, and the order is load-bearing
(`palette-model.ts`'s `haystack`).** M6p retitled two row kinds to the bare noun
the section header no longer needs repeated — `New panel from Claude` became
`Claude`, `Insert prompt: review` became `review` — and `searchText` is where the
dropped words went so the old phrasing still finds them. It must come **first**.
`fuzzyMatch` is a single ordered subsequence over one concatenated string, so
with the title spliced in front, typing "new panel from claude" consumes "new
panel from" out of the trailing terms and then has to find "claude" AFTER it,
which is not there — the row stays in the list and silently stops answering the
query `searchText` exists to answer. This was caught by `verify:panels` 40a going
red, not by reasoning, and `verify:palette` 41b is the check that pins it. The
cost is a few points of `fuzzy.ts`'s earliness bonus on the title, which only
reorders rows within a section.

**The drill-in arrows are caret-gated, and the gate is the load-bearing half
(`Palette.tsx`'s `ArrowRight`/`ArrowLeft` cases).** They are the horizontal
spelling of the two moves above — right opens the door under the selection
(through `runRow`, so there is still exactly one place that decides what
opening a door means), left pops back — and both act only from the boundary of
the query: right from the caret at the END, left from position 0, and neither
from a non-collapsed selection, which is a user selecting text rather than
navigating. Removing the gate looks like a simplification and is not:
`.palette__input` is the only text field in this app the user cannot tab out
of (`Tab` is an exit, see "Who owns the keyboard"), so arrows that always
navigated would leave a typed query permanently uneditable, with no key left
that can move the caret back into it. It is the same boundary rule `Backspace`
already obeys one line up, expressed as a caret position instead of an empty
string because — unlike Backspace — there IS a sensible mid-query press to
defer to. ArrowRight also never RUNS a row, only opens a door: `Enter` stays
the single key that runs things, so a stray arrow can neither spawn a panel
nor reach a destructive row's confirm. `verify:panels` 49b and 49c, and 49b
alone would pass against the ungated version.

**Popping a drill-in returns the selection to its door
(`palette-model.ts`'s `doorIndex`, `Palette.tsx`'s re-seat effect).** Coming
back out of a scope was a one-way trip: the re-seat effect treats a scope
change as a reason to re-seed from `bestMatchIndex`, and it cannot tell
entering from leaving, because both are `prevScopeRef.current !== scope`. A
pop leaves an EMPTY query behind — `runRow` cleared it on the way in — so
every fuzzy score ties at 0, `bestMatchIndex` degenerates to `firstRunnable`,
and the highlight lands on the first row of the first section. The user walks
through `Manage settings…`, presses `ArrowLeft`, and is somewhere in Panels
with `Enter` pointed at a command they never chose: the exact defect "The
palette's selection moves only when the user moves it" exists to prevent,
arriving through a fourth door that entry did not list.

**A destructive row is marked AND gated, and the gate is `InputMode`
(`commands.ts`'s `destructive`, `Canvas.tsx`'s `deletePreset`/`deletePrompt`).**
Neither half replaces the other: a red row still runs on one `Enter`, and an
unmarked confirm is a question the user did not expect to be asked. The gate
reuses input mode rather than adding a dialog, and that is not a shortcut — M5a
deferred preset editing entirely because "building a preset-manager dialog now
would be the first modal in this app, and it would collide with xterm's keyboard
focus". Input mode is that problem already solved, so a confirm inherits all four
of `usePalette`'s focus rules. It follows `beginRenamePreset`'s two-step shape
including the reopen that looks redundant and is not. `verify:panels` 50 asserts
the cancel by reading `preset.list()` back, not by reading the overlay: a confirm
step that confirms unconditionally is invisible.

**Sticky headers oblige `scroll-margin-top` (`styles.css`).**
`.palette__section` is `position: sticky`, and `.palette__row` carries
`scroll-margin-top: 28px` to match its rendered height. The two MUST agree.
`scrollIntoView({ block: 'nearest' })` considers a row visible when it is inside
the scrollport — including when a sticky header is painted on top of it — so
without the margin, arrowing into a new section parks the selected row
UNDERNEATH its own header, which looks exactly like the selection jumping off
screen. No check can catch this: a synthetic `WheelEvent` performs no default
scroll in Chromium, the same limit `verify:panels` 47 documents. It was verified
by hand.

**Confirm mode keeps an invisible input, and it must stay focusable
(`Palette.tsx`, `.palette__input--ghost`).** There is no text to edit, but the
field is still what holds DOM focus away from xterm — the same job xterm's own
hidden textarea does. So it is positioned off-view at `opacity: 0` rather than
removed: `display: none` or `visibility: hidden` would make it unfocusable and
hand the keyboard straight back to the agent with a destructive question on
screen and no key able to answer it.

**Cmd+N cascades, and the test is CENTRES, not overlap (`panels/panels.ts`'s
`cascadeCentre`, `Canvas.tsx`'s `onSpawn`).** Every path that makes a panel — `Cmd+N`, the
Presets menu, the palette's `preset:spawn-by-id` — funnels through `onSpawn`, which handed
the camera's world centre straight to `makePanel`. So N presses at an unmoved camera produced
N **byte-identical rects**, and the failure is total and silent: the canvas looks like it
holds one panel, the buried ones cannot be closed because their close buttons are underneath,
and each still holds a WebGL context and a `LIVE_BUDGET` slot. The HUD count is the only
evidence they exist. `cascadeCentre` returns the requested centre unless a panel is ALREADY
centred there, and otherwise steps down-and-right until it finds a free slot.

**Sparse, and that is what lets a default change later.** An id absent from
`preferences` means "still at the schema default", not "unset". A full map
written on every save would freeze every default at whatever it was the first
time a user launched the app, so changing one later would reach nobody.
`resolveSetting` is the only way to read a value, and `parsePreferences` drops
an unknown id or a wrong-typed value with a WARNING rather than coercing it —
a silently-coerced toggle is a preference the user set that stopped applying,
with nothing anywhere saying why (`verify:layout` 67-68).

**The Restore submenu is derived, not listed (`main/menu.ts`) — and no check in
`npm run verify` proves it stays that way.** The submenu maps over
`settingsInCategory(RESTORE_CATEGORY)` rather than a hand-written list —
`RESTORE_CATEGORY` is one exported constant in `settings-schema.ts`, used as
every `SettingDef`'s own `category`, as the menu's query argument, and as the
submenu's rendered `label`, so the four copies of `'Restore on launch'` cannot
drift apart by a typo — and `SETTINGS_SET`'s handler calls `rebuildMenu()` so a
palette toggle redraws the checkbox instead of the two surfaces disagreeing
until the next unrelated rebuild. `verify:layout` 74 asserts
`settingsInCategory(RESTORE_CATEGORY)` returns the three `restore.*` ids — a
fact about the pure schema function ALONE. It never touches `menu.ts`, and
**nothing in `npm run verify` calls `buildAppMenu` at all**, because `menu.ts`
imports `electron` and no Electron-tier suite drives it:
`verify:panels`' own harness (`scripts/verify-panels.cjs`) builds no menu and
passes `rebuildMenu` as a no-op precisely because this harness has none to
rebuild. So 74/74 would pass identically against a `menu.ts` that reverted to
a hand-written list of the same three settings and never called the query at
all — the exact drift this entry's first paragraph claims is prevented. That
claim is true of the code as written today; it is **unverified by any
automated check**, and closing the gap needs a new Electron-tier suite that
actually constructs a menu and reads its items, which M6b did not scope. Do
not read `74/74` as proof the menu is still derived — see `verify:panels` 32's
note on what it deliberately sends nothing to prove, and the auto-repeat note
on what its checks cannot show, for the same shape of gap elsewhere in this
file.

**`SettingDef['type']` tracks only what `typeof` can actually return
(`shared/settings-schema.ts`).** An earlier draft added `'enum'` to the union
with no enum-typed setting to back it; it was removed rather than given a
type-mapping layer, since a customer-free abstraction is exactly what
`ideas-backlog.md` #11 warns against.

**`starting` is sent directly, and the killed exit is not sent at all
(`pty-manager.ts`'s `create` and `onExit`).** Two exceptions to "applyEvent
sends on a change", and each exists because the general rule gets that one case
exactly backwards. `initialDetector` is BORN in `starting`, so nothing ever
*enters* it and a change-gated send would never emit it — the state would be
designed, styled (`.panel--agent-starting`, `.panel__card--agent-starting`),
documented in the README, and unreachable on the wire, which is the whole
window that matters: a real `claude` takes seconds to boot and that silence is
exactly when a user wants to see something happening. `create` therefore sends
it directly, once, after the session is in the map. At the other end, the
`exit` event's SEND obeys the same `session.killed` guard `PTY_EXIT` does: an
exit we asked for lands milliseconds after `kill()` returned, by which time the
renderer has already run `clearAgentState(id)` at its dispose site, so an
unguarded `'exited'` RE-ADDS the entry after the cleanup — the map then grows
for the life of the renderer and a recycled id inherits a dead panel's border,
the failure `clearAgentState`'s own comment claims to prevent. The recycled id
is reachable: `onReset` disposes everything and installs `firstRunPanels()`,
whose id is the constant `FIRST_RUN_ID`. Only the send is guarded — the
TRANSITION still runs (`applyEvent`'s `mute` parameter, whose one caller this
is), because `onExit`'s closure keeps the session object alive after the map
entry is gone and a detector stranded in `busy` there could still emit for a
panel nobody can see; `'exited'` being terminal is what makes that safe.

**`exited` here is not an exit code (`main/agent-state.ts`'s `Detector`,
`PanelStatus.exited`).** The detector's `exited` state exists for exactly one
reason: to stop emitting further `busy`/`idle`/`wants-you` transitions once a
process is gone, because a dying process's last bytes arrive AFTER `onExit` is
already known — the same ordering `pty-manager.ts`'s flush-before-exit comment
already documents — and a detector that revived on those trailing bytes would
leave a dead panel glowing `busy` for the rest of the run. It carries no number
and answers no question about SUCCESS or FAILURE; `PanelStatus.exited` (the
real exit code, surfaced through `pty:exit`) stays the sole authority on that,
unchanged by this milestone. Treating the detector's `exited` as a substitute
for the real exit code would be reading a boolean where a number belongs.

**`agent.idleAfterMs` is bounded, and both ends fail silently
(`shared/settings-schema.ts`, `LayoutStore`/`parsePreferences`).** The bound
(`min: 250, max: 60000`) is enforced on **two** independent doors into the same
map, not one: the write path (`setSetting`/`setPreference`, which refuses an
out-of-range number the same way it refuses a wrong-typed one — see "One map,
and a typed view over it" above) and the load path (`parsePreferences`, which
drops an out-of-range value read from a hand-edited `layout.json` with a
warning rather than silently clamping or carrying it into the map). Only
enforcing the write path leaves the load path as a second, unguarded door: a
value edited directly into the file bypasses `setSetting` entirely, and without
the load-side check it would sit in the resolved map as a value the schema
itself says is invalid, changing timing behaviour with nothing in any log to
explain why panels are suddenly idle after 3 seconds or never idle at all. Both
failure directions are silent on their own — a rejected write just looks like
nothing happened, and a silently-clamped load looks like the user's own number
took effect when a different one did — which is why `verify:layout` pins both
ends separately (78–79 on the write path, 80b on the load path) rather than
trusting one to imply the other.

**The two ticks stay separate timers.** `IDLE_TICK_MS` is 500 and
`LIVE_TICK_MS` is 2000; they share a lifetime (armed on the first session,
stopped at every site that empties the map) and an `unref()`, and they look
enough alike that merging them reads as a tidy-up. It is not one. The idle tick
is the only thing that can observe the ABSENCE of output — it is what turns
`busy` into `idle` — so its period IS the resolution of M6c's threshold: merged
onto a 2s interval, idleness detection becomes four times coarser everywhere,
silently, while `agent.idleAfterMs` goes on reading whatever the user set.

**The dedupe is the design, not an optimisation.** Main holds the last
`cwd`/`currentCommand` pair per panel and sends `session:live` only on a change
— the rule `applyEvent` already follows for agent state, for the reason stated
there. Undeduped, this is thirty messages a minute per panel describing a fact
that changes when a human types `cd`. Its failure is INVISIBLE: no pixel is
wrong, it shows up as heat. `verify:pty-manager` 23 is the only thing that would
ever notice, and its window deliberately spans several ticks, because an
undeduped implementation emits once per tick and a single-tick sample sees one
message either way. The dedupe key is joined with a NUL rather than a space: a
path may contain a space, so `('/a b', 'sh')` and `('/a', 'b sh')` would collide
into one key and silently suppress a panel's updates — for the users whose
directories contain the delimiter and nobody else, the same collision
`railSignature` avoids with `JSON.stringify`.

**`detachAll()` clears `lastLive` too, and that is the subtle half.** `kill()`
clearing it is obvious — the panel is gone. `detachAll()` is the `Cmd+R` reload
path, where main's `PtyManager` SURVIVES and so do the tmux sessions: without
the clear, every reattached panel is deduped against a value from before the
reload while the renderer's store is empty because the page is new, so
`pollLive` never sends. The result is every unmoved panel showing its spawn-time
cwd after a reload — DURABLY, not for a tick, because the next send waits on a
change that may never come. `lastLive` is supposed to be cleared alongside the
session and both teardown paths have to do it. Found in review, not in writing.

**Display renders nothing without a live answer; consumers fall back to the
spawn cwd.** The two rules disagree on purpose, and both halves are
load-bearing. A spawn value under a live label is indistinguishable from a
correct one, which is worse than an absent row — #41's own constraint — so
`buildInspectorModel` pushes the `live-cwd`/`live-command` fields only when it
has an answer, and pushes them BESIDE the spawn `cwd` rather than over it, which
is "the inspector shows the links, not the answer" applied to a second pair. A
consumer is asking a different question: project-prompt reading and preset
capture each need A directory, neither makes a claim about it, and the spawn cwd
is exactly what they used before this milestone — so the fallback is never worse
than not shipping. See "M20 adds a fourth consumer, and it obeys the identical
fallback" below for the file tree's own instance of this rule. **Both preset save surfaces read it**, the menu's `onCapture`
and the inspector's `savePanelAsPreset`, for the reason `presetFromCapture`
already exists one layer down: a user must not end up with two
differently-directoried presets for one panel depending on which surface saved
it. Only one of the two was changed in the first cut and review caught it. The
final fix wave found the coverage claim itself was wrong: `verify:panels` 90
drives `preset:save-panel`, the INSPECTOR's own save action, and says nothing
about the MENU's `onCapture` — the surface the first cut actually missed,
reached through `IPC_EVENTS.PRESET_CAPTURE` and exercised by check 30, which
drove that channel with no live answer forced to exist and so would have
passed identically against a reverted line. Check 30 now sends a synthetic
`session:live` for the panel about to be captured — the same route 90 uses
for the inspector path — before reading `PRESET_CAPTURE` back, so the two
checks together are what the sentence above claims: `verify:panels` 90 for
`savePanelAsPreset`, `verify:panels` 30 for `onCapture`.

**M20 adds a fourth consumer, and it obeys the identical fallback.**
`Canvas.tsx`'s `treeRoot` is `selectedLive?.cwd ?? selectedPanel.spec.cwd` —
the file tree needs A directory to root itself on and makes no present-tense
claim about it, exactly like project-prompt reading and preset capture before
it, so falling back to the spawn cwd when no live answer has landed yet is
never worse than the tree not opening at all. It differs from the other three
in WHICH panel it reads: it roots on the SELECTED panel rather than the
focused one (see "The tree roots on the SELECTED panel and pastes into the
FOCUSED one" below), so it is `selectedLive`, not `liveSessionFor(focusedId)`,
that the fallback sits behind.

**`session:live` is an `IPC_EVENTS` member, so `verify:ipc` stays at 31.** That
suite asserts over `Object.values(IPC)` — the INVOKE channels, each of which
must have an `ipcMain.handle` — and a main-to-renderer send is handled by nobody
and counted by nothing. This is the SECOND time the same wrong number has been
reachable: M6d hit the identical boundary, added no invoke, and its own entry
above records the count staying at 20. An earlier draft of M12's spec said "31
to 32", and a task written from it would have failed the suite by "fixing" a
correct count.

**The poller is armed off the session map, and that is a limit rather than a
bug.** `pollLive` skips any entry whose panel this manager holds no local
session for, and the tick itself starts with the first session and stops at
every site that empties the map — the idle tick's lifetime exactly. So a panel
whose tmux session survived a reload but which this renderer never promoted has
no live answer even though tmux could give one. Widening the arming condition is
the fix and it is deliberately not taken, because the map is also what stops a
subprocess spawning every two seconds for the life of an app whose canvas is
empty. Between ticks the answer is up to two seconds stale, which is fine for a
label and would not be for anything that navigates or writes — a second reason
review stays out of this milestone.

**A stated cost, accepted rather than fixed: `pollLive` blocks main's event
loop.** `getBackend().list()` is an `execFileSync` on the tmux backend, so this
is a SYNCHRONOUS subprocess on the main thread every two seconds for the life of
the app. The spec framed the cost as "one subprocess per tick" and never
addressed the synchronicity; it was accepted, for two reasons.
`SessionBackend.list()` is synchronous by contract, and the app ALREADY calls it
synchronously on every `pty:list` invoke — at boot and at every reload — so this
adds a periodic instance of an existing operation rather than a new class of
one; and making it asynchronous ripples out through `PtyManager.list()`, the
`pty:list` handler and boot reconciliation. If that judgment is wrong the cost
is real and is worth naming: a few milliseconds of main-thread stall every two
seconds, and against a WEDGED tmux server up to the backend's timeout,
repeatedly — during which main can neither flush PTY data nor answer an IPC
call. If it is ever observed, the fix is an asynchronous `list()`, and that is a
milestone of its own rather than a patch here.

**One cosmetic consequence, worth knowing before it is read as a bug.** A preset
saved from a panel now carries whatever tmux reports, which on macOS temp paths
is the RESOLVED spelling (`/private/var/…`) even for a panel that never moved.
Production prompt reading follows symlinks, so nothing behaves differently and
real-world cwds are already canonical — but a FIXTURE comparing an unresolved
path against a saved one will disagree for this reason and no other, which is
why `verify:panels`' prompt fence carries both spellings of each directory.

**The pips are outside `.world`, and measure themselves
(`EdgeIndicators.tsx`).** "One transform, not N layouts" (above) already
established why panels never reflow under zoom; the same transform would be
exactly wrong for an edge indicator, whose entire job is to stay pinned to the
viewport's physical edge regardless of pan or zoom. Mounting `EdgeIndicators`
inside `.world` would make every pip zoom and pan away with the panel it
points at — the opposite of an off-screen indicator. It is chrome, a sibling
of `.world`, and it owns its own `ResizeObserver` rather than reading a size
out of `Canvas` state: `Canvas` holds no window size today because every
existing consumer measures at event time, and adding one to satisfy this layer
would re-render every panel on every resize frame — the 60Hz cascade
`TerminalPanel`'s `memo` and `version()` both exist to block. The observer
therefore lives in the layer that alone needs the number, and a resize
re-renders only the pips.

**`edgeIndicator` clips a ray, it does not clamp two axes (`viewport.ts`).**
The shorthand that looks equivalent — clamp `dx` to the box's half-width and
`dy` to its half-height independently — corners every diagonal: a panel
anywhere in the upper-right quadrant clamps to the same top-right corner
regardless of whether it is barely northeast or almost due east, so direction
stops carrying information while every pip still renders and still looks
functional. The actual computation finds the smaller of the two per-axis
parametric crossings (`tx`, `ty`) and scales the whole ray by that one `t`,
which is what keeps the pip's angle equal to the true bearing at every point
except the corners themselves. `verify:viewport` 62 is the check that fails
against the clamp shorthand; `verify:panels` 58 is the same property end to
end, and it asserts the pip's exact position for the same reason — a check
that only asked "does a pip render" cannot distinguish the two
implementations, since the clamp shorthand still renders one.

**Partially visible counts as visible (`viewport.ts`'s `edgeIndicator`).** The
overlap test that gates the whole function returns `null` — no pip — the
moment any part of the panel's rect intersects the viewport, not only when the
whole rect fits inside it. A pip aimed at a panel the user can already see,
even at its edge, is a false alarm on the one surface in this app whose entire
value proposition is being believed on sight; a user who learns the arrows lie
stops glancing at them. `verify:viewport` 57 pins a panel straddling the
boundary getting no pip, distinct from 56's fully-on-screen case and from the
fully-off-screen cases 58–61 pin the geometry of.

**`Cmd+J` is not in `REPEATABLE_KEYS`.** See "Auto-repeat is one gesture, not
fifteen" above — the same reasoning applies here: a held `Cmd+J` would step the
attention cursor through the whole waiting queue at the OS repeat rate rather
than moving once per press, landing wherever the repeat stream happened to
stop rather than where the user meant to look.

**A workspace switch is a second boot (`Canvas.tsx`'s `switchWorkspace`).**
Everything derived from the starting state is RE-DERIVED, never carried: the
id counter (seeded from `ActivateResult.allPanelIds`, which spans every
workspace — see "Panel ids are global, not per-workspace" below), the undo
stack (cleared outright — see below), the camera, and the selection. What is
deliberately NOT touched is the registry — unmounting the outgoing panels
calls `detachSlot`, which disposes the WebGL addon and pulls the host out of
the DOM while the `PanelSession`, its PTY and its tmux session stay exactly
where they are. This is "two lifetimes, not one" (above) paying out at the
scale of a whole canvas instead of one culled panel, and it is why
`switchWorkspace` contains no `registry.dispose` call anywhere — `verify:panels`
64 is the check that fails first if one creeps in, and it is the one no
cheaper tier can catch, because only a real registry holding a real pid can
tell a demoted session apart from a respawned one that merely looks the same.

**A workspace switch is a second boot, but not in preference semantics
(`main/layout-store.ts`'s `doSave`/`doInitial`, `activateWorkspace`).** "A
workspace switch is a second boot" (above) is true of ORDERING — awaiting
`pty.list()` before committing panels mirrors `boot()` exactly — but it does
not extend to the three `restore.*` preferences. Those answer "what should
the app show me when it STARTS" (`restore.layout`'s own schema description
says so), and a switch is not a start. The first cut of `activateWorkspace`
called the same `doSave`/`doInitial` the launch path calls, restore settings
and all, which meant `restore.layout` set to OFF turned Cmd+K workspace
switching into a silent canvas shredder: `doSave` skipped `w.panels = …` on
the way OUT, so the workspace being left never recorded the panels it had —
their tmux sessions kept running, reachable from no workspace, the exact
orphan outcome the delete design rejects — and `doInitial` returned
`panels: []` on the way IN, so the workspace being entered read empty
regardless of what it held on disk. Both functions now take an
`applyRestoreSettings` flag, defaulting to `true` so the public `save()`/
`initial()` members and every existing caller are unaffected; `activateWorkspace`
passes `false` to both, so the write and the read agree — passing it to only
one would either lose data on the way out or land on an empty canvas whose
panels are sitting untouched on disk. `verify:layout` 94 is the check: with
`restore.layout` off, a workspace switched away from and back to still hands
its panels back.

**Deleting a workspace must switch away BEFORE it removes (`Canvas.tsx`'s
`deleteWorkspace`).** See "`activateWorkspace` takes the outgoing canvas"
above for the mechanism this collides with if the order is reversed: main's
`remove()` reassigns `activeWorkspaceId` to a neighbour the moment the doomed
record is gone, so an `activate()` call issued after `remove()` would write
the doomed workspace's own stale panels — captured before its sessions were
even disposed — into whatever main just made active, resurrecting a disposed
panel's id on a workspace the user never touched. The only-workspace case gets
the identical treatment rather than a special one: a fresh replacement
workspace is minted and switched to FIRST, exactly as though it were a
neighbour that already existed, rather than letting main's own `remove()`
install its fresh default and switching to that afterward — which is the same
mistake with the neighbour missing instead of merely stale. `verify:panels` 71
is the check that drives this branch, and it is only reachable by first
deleting every OTHER workspace through the same gated action — there is no
shortcut into "exactly one workspace left" that does not also exercise checks
69/70's confirm gate along the way.

**The shell insets the canvas, and that is only safe because nothing measures
the window (`Canvas.tsx`, `styles.css`'s `.shell`).** `useViewport`,
`Canvas.tsx` and `EdgeIndicators` all read `getBoundingClientRect()` on the
`.canvas` host at event time, and the pip layer carries its own
`ResizeObserver` precisely so `Canvas` need hold no size at all — which is why
making the canvas a grid cell several hundred pixels narrower than the window
required no coordinate change anywhere. A future `window.innerWidth` read
breaks that silently and in the direction hardest to notice: pips would aim at
the window's edge while the canvas ended 240px earlier, and every world point
the HUD reported would be off by the rail's width, with nothing throwing.
`verify:panels` 72 is the check, and the clause that discriminates is the exact
inset identity, not the loose bounds beside it — see the verify table above for
why every looser clause survives the `min-width: auto` regression.

**Two second-order effects, and the M8a review found the first draft of this
entry wrong about BOTH of them, in opposite directions.** Correcting the
record, because the wrong versions each invite a different bad "fix".

**M20 puts a fourth button on the same limitation, and it is still not
fixed.** The file tree is a fourth region competing for the canvas's width —
`Cmd+B` and `.shell__tree-toggle` narrow it exactly the way `Cmd+\` narrows
the rail — and the tiering effect is exactly as blind to it as it was to the
first three: opening or closing the tree still re-runs no tiering, so a panel
that has just been pushed outside the narrower cull region stays `live` and
one that has just been revealed stays a card, until the next pan, zoom, focus
change or panel edit. `verify:panels` 125 is this limitation's third
near-tautological witness (after 73 and 75): it re-asserts the exact
four-column inset with the tree OPEN and confirms the panel under it is still
promoted, but — like 74's own comment already says of the rail — that is
because nothing today makes the tree's open state a re-tiering trigger, not
because the trigger was built and tested. The fix, if it ever lands, is one
`ResizeObserver` (or a canvas-host-width read folded into the tiering effect's
own dependency list) that every one of these four buttons — rail, inspector,
tree, and whatever region comes next — would then share.

**The palette's outside-click exit is mounted on `.shell`, not `.canvas`
(`Canvas.tsx`'s `onMouseDownCapture`).** M8a made the top bar, the rail and the
inspector SIBLINGS of `.canvas`, so a listener on the canvas host never sees a
click on a shell control — the overlay would stay up, looking ready to take a
query, with DOM focus on a button and every bare key reaching the agent, and
`Escape` could not undo it because the key no longer reaches the palette's own
`onKeyDown`. That is precisely the fourth, un-audited exit "Three ways out of
the palette" exists to remove, reopened by a layout change rather than by a
keyboard one. The capture phase and the explicit `closest('.palette')`
containment test are unchanged and still load-bearing for the same reasons
recorded there — `.palette`'s own bubble-phase `stopPropagation` cannot stop an
ancestor's capture listener that has already run. `verify:panels` 42 pins the
canvas case; 73 pins the shell one, and both must stay green.

**Agent state reaches a rail row by the row's own subscription, and no check in
`npm run verify` proves it stays that way (`shell/RailPanelRow.tsx`).** Each row
calls `useAgentState(row.id)` itself. `agent-state-store.ts` subscribes PER
PANEL ID precisely so a change for `n3` notifies only whatever asked about `n3`;
a list that subscribed once and passed each state down as a prop would re-render
every row on every panel's bell — the fan-out that module exists to refuse,
arriving through a door it could not see. It is also why agent state is
deliberately ABSENT from `RailRow` and therefore from `railSignature`: putting
it there would rebuild the whole rows array on a bell instead of re-rendering
one row.

**`closePanel` and `startPanel` are actions members with no palette rows
(`palette/commands.ts`).** The shell reaches the app only through the actions
object (the spec's rule 1), so a rail that closed over `registry.dispose` or
`registry.wake` directly would be a second implementation of a verb that
already has an authority — and `pty.kill`'s two-caller count inside
`session-registry.ts` would stop being re-derivable from one place.
`closePanel` is the `onClosePanel` the panel's own `×` already uses, which is
why M8b added no fifth `registry.dispose` call site. They deliberately emit no
`Command` rows, which is the one place M8b declines something the shell/palette
symmetry would hand it for free: both verbs already have a gesture (the panel's
own `×`; clicking the card that says "click to start"), and M6p sized the
resting list to roughly eight rows on purpose. `savePanelAsPreset` joined them in
M8c on the same terms — the Presets menu already covers the focused-panel case —
while `restartPanel` is the verb that DOES earn a row, because it has no other
gesture anywhere at all.

**The attention section takes the built rows, not the panels
(`shell/rail-sections.ts`'s `buildAttentionRows`).** Filtering the queue down
to ids that have a `RailRow` IS `reachableQueue`'s phantom filter, and reading
the label off that same row is what stops the Panels and Attention sections
rendering two different names for one panel. One lookup, both guarantees. The
alternative — take `panels`, re-derive the label — would make this a FOURTH
reader of M6a's honest chain, beside the panel header, `railLabel` and
`inspector-fields.ts`'s deliberately identical copy, and `verify:rail` 35 pins
what that costs with a TITLED fixture: a re-derivation from `spec.command`
says `/bin/zsh` in Attention while the Panels row says `auth refactor`. It
iterates the QUEUE and looks rows up, never the reverse: the reverse renders
the canvas's order instead of entry order and looks entirely correct until two
agents ring in the wrong sequence, which is a bug that never reproduces on
demand. Every row is `wants-you` by construction, so no row carries agent
state and none subscribes — `RailPanelRow`'s per-id subscription answers a
question this section already knows the answer to.

**The attention section is scoped to the ACTIVE workspace, deliberately
(`Canvas.tsx`'s `railAttention`).** A row's whole job is to navigate, and
`centreOn` can only frame a rect on this canvas — a row for a hidden
workspace's panel would either go nowhere or smuggle in a second switching
path, and the spec rejects both. The scoping is structural rather than a
filter: `buildAttentionRows` is handed `railBuilt`, which is built from
`panels`, which is only ever the active workspace's own. A waiting panel in a
hidden workspace surfaces as the waiting COUNT on its workspace row instead.
The two sections divide one question between them — *who is waiting here* and
*where else is anyone waiting* — and the obvious "fix", one flat
cross-workspace queue, breaks the click. `verify:panels` 96 is the check that
pins the hidden half.

**`dispose(id)` returns its kill, and restart is the only caller that cares
(`session-registry.ts`, `Canvas.tsx`'s `restartPanel`).** `dispose` is `async`
and returns the promise `bridge.pty.kill(id)` handed it rather than discarding
it, so `restartPanel` can await the DESTROY before it re-`ensure`s. Under tmux
that ordering is the entire verb: `new-session -A` attaches if the session
exists and creates it only if it does not, so a `create` that overtakes its
`kill` reattaches to the very session the restart meant to replace — the panel
blinks, the same process comes back, and nothing in any log says the verb did
not happen. It is the same `-A` ambiguity "`reattached` costs a probe" above
describes, met from the other side of the flag.

**`bumpVersion()` exists because `ensure()` deliberately does not bump
(`session-registry.ts`, `Canvas.tsx`'s `restartPanel`).** `ensure` is normally
called from the tiering memo — during render — where notifying a
`useSyncExternalStore` subscriber makes React warn, so it creates the session
and stays silent; every pre-M8c caller is already inside a render that is about
to commit anyway. `restartPanel` calls it from an EVENT HANDLER, a tick after
its own `await`, where nothing else re-renders: the new `SessionHandle`'s host
is never mounted into a slot, the tiering effect never re-runs, and the panel
shows literally nothing, with no error anywhere. `dispose` does bump, but that
bump is a tick stale by the time the kill resolves. The obvious alternative,
`focus(id)`, also bumps — and is the wrong answer for a reason nothing about
rendering would reveal: it moves the keyboard, which a shell control must never
do (see "A shell control never takes DOM focus"). `verify:registry` 24 asserts
both halves in one read — the version advanced and exactly one listener fired,
AND the session's focused flag and its focus timestamp are untouched — because
a `bumpVersion` implemented as `focus()` satisfies the first half perfectly.
M8c's final review added a THIRD member of the same family, `touch(id)` — see
the restart entry immediately below for what separates the three, and
`verify:registry` 25 for the check that pins its own "and nothing else".

**Restart kills unconditionally and respawns only on PROMOTION, and
`registry.touch` closes half of that gap (`Canvas.tsx`'s `restartPanel`,
`session-registry.ts`'s `touch`).** This is the most surprising fact about the
verb, so it goes first rather than buried in the `clearAgentState` argument
below. `attachSlot` is the ONLY caller of `spawn()`, and it runs from
`TerminalPanel`'s slot effect, which is gated on the panel being `live`. Nothing
in `restartPanel` puts it there. So the kill always lands and the respawn is
conditional on tiering — and when tiering says no, the user sees the agent die,
no new one start, the panel become a card, and the Restart control immediately
grey out reading "*X* has not started yet": the button denying that the thing
they just did ever happened. It is recoverable by clicking the panel, and
nothing on screen says so.

**The budget half is fixed.** `assignTiers` fills its `LIVE_BUDGET` slots in
`lastFocusedAt` order and `ensure` mints the new session at `0`, so a restarted
panel joined at the BACK of the eviction queue — the first candidate denied a
slot. `registry.touch(id)` stamps `lastFocusedAt` and bumps, and **does nothing
else**; `restartPanel` calls it after the re-`ensure` so the new session wins a
slot instead of losing one. It is deliberately not `focus(id)`, which also bumps
and stamps but additionally calls `handle.focus()` — a shell control must never
move the keyboard (see "A shell control never takes DOM focus"), and that
failure is silent. Three near-identical registry members now sit side by side
and the distinction is the point: `bumpVersion` says "re-render", `touch` says
"this session is recently WANTED", `focus` says "the keyboard is here now".
Restart needs the first two and must not have the third. `verify:registry` 25.

**The off-screen half is a known limitation, not an oversight.** `assignTiers`
also culls by viewport, so restarting a panel the camera has left still kills
without respawning until the user pans back. `touch` cannot reach it and should
not try: fixing it means either restart moving the camera — a verb about a
process silently becoming a verb about the viewport — or the registry spawning
outside `attachSlot`, which breaks "fit before spawn" (there is no laid-out node
to measure) and "lazy spawn" together. Left as-is, deliberately.

**A third residue, unfixed: palette-driven restart leaves DOM focus on
`<body>`.** `runRow` closes the palette before running a command, which calls
`restoreFocus(capturedId)` -> `handle.focus()` on the very handle restart is
about to dispose; `attachSlot` does not focus on the way back in. So after
restarting the focused panel from the palette, the next keystroke goes nowhere
until the user clicks the panel — the same silent failure `usePalette`'s rule 4
exists to prevent. This is not a `shellControl` violation; `shellControl` is
correct here. It also **cannot be fixed at the call site**: the session is
re-`ensure`d at tier `card`, and `focus(id)` only calls `handle.focus()` on a
LIVE session, so a call there would stamp, bump and move no keyboard at all — a
line that reads as a fix and is not one. The new handle cannot take focus until
React mounts its slot and `attachSlot` opens it, which is at minimum a render
away and (per the paragraph above) not guaranteed to happen at all. Landing it
needs the REGISTRY to own a one-shot "focus on next attach" consumed inside
`attachSlot`, which is a design decision for a later milestone.

**`clearAgentState` first.** Agent state survives a panel's closure by design —
main sends the transition and the renderer's store keeps it until something
clears it — so a panel restarted out of `wants-you` would otherwise keep its
amber border: a fresh agent wearing a dead one's question, which neither focus
nor a write will clear, because acknowledgement says nothing about the PREVIOUS
process. What makes this worth recording is the shape of its failure, which two
people found from opposite ends, and neither half alone is the interesting
answer. The review's version: deleting the line leaves the SETTLED state
identical, because main's `create` sends `starting` directly at spawn (see
"`starting` is sent directly") and re-seeds the store entry a moment later — so
`verify:panels` 92 stayed green under injection and had to grow a clause reading
`data-agent-state` IMMEDIATELY after the click, with nothing awaited in between.
The implementer's version goes further, and it is why the line is not merely
cosmetic: `ensure(dormant: false)` does not GUARANTEE a spawn. A restarted panel
over `LIVE_BUDGET`, or one panned off screen, is tiered to a card and never
promoted — so `starting` never arrives at all, and the stale `wants-you`
persists **indefinitely** rather than for a transient window, on exactly the
panels the attention routing exists for.

**The panel is RE-CHECKED after the await, never captured across it.** The gap
is a real IPC round trip and the panel can be closed inside it — the `×` and the
rail's close control are both one click away — and re-`ensure`ing a closed panel
mints a session no UI can ever reach or stop again, the orphan `dispose`'s own
comment exists to prevent, arriving through a new door.

**`dormant: false` explicitly, never inherited**: a dormant re-ensure leaves the
panel refusing to spawn, which on screen is indistinguishable from a restart
that did nothing. The `await` and the `bumpVersion` each have their own entry
above. Restart pushes NO history entry — the panel array does not change, so
there is no gesture to undo — and asks for NO confirm: the process it ends is
precisely the one the user asked to replace, so a confirm would be a question
about the thing they just said; the control's `title` carries the warning
instead. Double-firing is safe by construction rather than by a guard: a second
call finds `registry.get(id)` undefined after the first dispose, fails the
`isRestartable` gate and returns.

**A review node never reaches `assignTiers` or `registry.ensure`, and that is
structural rather than a rule (`Canvas.tsx`'s partition).** The obvious
implementation is a guard — teach `assignTiers` to skip a kind, teach `ensure`
to refuse one — and it fails the way every "everyone remembers to check"
invariant fails: the tiering memo, the dormancy effect, the `pty.list`
reconcile, the eviction pass and `restartPanel` would each need the same clause,
and the one that got missed would mint a `PanelSession` for a panel with no
terminal in it. Instead `Canvas.tsx` partitions `panels` ONCE, and everything
downstream of tiering is handed the terminal-only array; a review node is simply
not in the input. There is therefore no code path from a node to a WebGL
context, a PTY, or a `LIVE_BUDGET` slot, and the claim is checkable rather than
argued: `verify:panels` 103 reads `__m4aSessions` for the node's id and compares
the `.xterm` count against the count from BEFORE the node existed — the second
clause is what rejects an implementation that quietly demoted some other panel
to pay for the node. The cost of the partition is that anything genuinely
common to both kinds must be written against `Panel`, not against the terminal
array; that is the trade, and it is the right way round, because forgetting a
kind check is silent while a type error is not.

**A review node asks by BASELINE, not by panel id, and that single decision is
what the node is for (`shared/review.ts`'s `ReviewSubject`, `IPC.REVIEW_AT`,
`ReviewNode.tsx`).** Main drops a panel's baseline the instant its session is
killed — `PtyManager.kill` calls `dropBaseline`, deliberately, so a recycled id
can never inherit a dead panel's snapshot. A node that asked
`review:panel(subjectId)` would therefore work perfectly for as long as its
subject was open and go blank the moment the subject was closed: at exactly the
moment a review of FINISHED work is most useful, and with no error anywhere,
because `never-started` is a legitimate answer that renders as an ordinary
empty state. So the node stores the repository root, the baseline sha and a
snapshotted label, and `reviewAt(baseline, subjectId)` never consults
`baselineOf` at all (`verify:review` 45). The subject id survives only for the
things that are still about the panel — excluding it from the shared-repo peer
count (46), and re-reading when its agent goes idle — never for the lookup.

**`commit-tree` runs no hooks, and never touching the index is its own silent
failure (`main/review-commit.ts`, `main/git-args.ts`).** M9c turns a node's
answer into a commit, and both halves of how it does that are corrections to
the obvious version, each measured against real git rather than reasoned about.

**The reconcile is the second correction, and "never touch the user's index" is
what it corrects.** Leaving the real index alone sounds like the safe answer and
is a silent failure of its own: once HEAD moves and the index does not, the
index still describes the previous tree, so the agent's own `git status` reports
a phantom `D` for every file added and `MM` for every file modified — and an
agent reading that will set about "fixing" a repository that is fine. The
reconcile stages **by blob sha** (`--cacheinfo`, from the entries read back
AFTER the commit, since a hook is allowed to have changed them) rather than by
re-reading the working tree, so an agent editing the file in the interval cannot
have its newer content staged behind its back; and **per path** rather than
wholesale, so the user's own unrelated staged entries survive. `verify:review`
62 and 63 are the two measurements, and 62 compares the index as BYTES rather
than through `git status` for the reason stated in the table above.

**The reconcile has TWO calls, and the second one is the deletions.** `ls-files
--stage` prints nothing at all for a path the commit removed, so the requested
paths ABSENT from that read-back are exactly the deleted set — and `--cacheinfo`
has no entry to stage for them, leaving the real index's pre-commit entry
untouched. Measured, that reads as `AD <path>`: the file staged as NEW in a
repository whose HEAD just deleted it. It is the same phantom the paragraph
above describes, wearing the opposite sign, and worse in one respect — an agent
reading `AD` does not merely get confused, it re-adds the file it just deleted.
So a second `update-index --force-remove -- <deleted>` runs against the REAL
index (no scratch env, like its neighbour), with the same non-fatal treatment:
a failure logs once and the result stays `committed`. **The trade it accepts,
chosen rather than missed:** if the user had independently staged one of those
paths, `--force-remove` discards that staging — and unlike the `--cacheinfo`
half there is no per-path blob to restore it to, because the commit is the
reason the path has none. The `AD` state is strictly worse than a lost `git
add`, so the removal wins; `buildForceRemoveArgs`' own comment records the same
ruling beside the code. `verify:review` 64, and check 63's fixture now deletes
a file for it.

**A failure after the commit lands is not a failed commit.** The sha read-back
and the reconcile both run after the irreversible half, and neither can
downgrade the result: a `failed` reported there tells a user their work was not
committed while it demonstrably was, and the next thing they do is commit it
again. A reconcile that fails is logged loudly, once, naming `git reset` as the
fix, and swallowed. `verify:review` 60.

**`review:commit` is addressed by repository ROOT, never by panel id**, for the
reason `review:at` is: a node outlives its subject, and main drops a panel's
baseline the moment its session is killed. The verb is offered BY ARM — enabled
for `changes`, **present-but-disabled with its reason on screen** for `shared`
(a commit there would bundle another agent's work under this node's message,
and a hidden control makes "not supported here" indistinguishable from "not
built yet"), and absent for every arm with nothing to commit. The `paths` come
from the RESULT's full file list, never from the node's display-capped rows —
`verify:rail` 57, and the failure it prevents is a commit that looks complete
and is not. They also carry **both sides of a rename**: numstat does rename
detection by default, so `git mv old new` is one entry with `path: new` and
`renamedFrom: old`, and a set built from `path` alone stages the addition while
HEAD's own `old` — seeded into the scratch index by `read-tree` — survives into
the new tree. Verified against real git: the commit resurrects a file the agent
deleted while the node says "1 file changed". `buildStageArgs`' `--remove`
already stages the deletion once the path is in the set; the missing half was
the path. The RENDERED list deliberately does not grow the same way — one
`git mv` is one row and two committed paths, which is the display-versus-commit
split stated from the other side. `verify:rail` 60.

**On success the node's own baseline advances (`Canvas.tsx`'s
`onReviewCommitted`).** A node diffs the working tree against
`subject.baselineSha`, and committing does not change the working tree — so
without the advance the node reports the same files after a commit as before
it, permanently, and a second press re-commits content already in history. It
pushes NO undo entry: `Cmd+Z` cannot undo a commit, and an undo that restored
the old baseline would put the node back to reporting work that is now in
history, which is an undo stack lying about what it can reverse. The panel array
still changes, so the existing `layout.save` effect persists the new sha with no
extra plumbing. The SUBJECT panel's baseline in main is deliberately left alone
— a node can outlive its subject, so reaching into that panel's state is only
sometimes possible at all.

**The message input `stopPropagation()`s on EVERY key, not only the two it
handles (`ReviewNode.tsx`).** `useViewport`'s keydown listener is on `window`,
above the component's root container in the bubble path, so without it a `Cmd+N`
typed into a commit message spawns a panel behind the node and a `Cmd+K` opens
the palette over it — this is rule 3 of "Who owns the keyboard" reached by
containment instead of by a flag. Enter commits, Escape cancels, and every
REFUSED Enter sets a visible outcome: an empty message, and a `model.commit.kind`
that flipped underneath an open input (the node re-read and the changes are gone)
both say why. Only an IN-FLIGHT press returns silently, because the button is
already disabled and reads "committing…", so the screen has already answered.

**Both exits restore focus, and no check can observe that.** The input is
`autoFocus`ed, so it is the second surface in this app that takes DOM focus off
xterm — which makes it heir to rule 4 of "Who owns the keyboard": an unmounting
input's blur leaves focus on `<body>`, where every subsequent keystroke goes
nowhere at all. It is worse here than in the palette, because the commit
button's `preventDefault` correctly leaves `focusedId` alone, so the app goes on
believing a terminal panel is focused while the keyboard reaches nothing. Escape
and a successful commit therefore both close through one `closeDraft`, which
calls `Canvas`'s own `restoreFocus` on the id captured when the draft OPENED —
captured rather than read at close time, for the reason `usePalette` captures
rather than clears. **Nothing in `npm run verify` can see this**: the panels
suite drives the input with a dispatched `KeyboardEvent`, and DOM focus after an
unmount is a browser default action an untrusted event never performs — the same
limit `verify:panels` 47 and 75c each record from their own side. Delete the
`restoreFocus` call and every suite stays green. Re-pressing the control while a
draft is open also no longer wipes it (`setDraft((d) => d ?? '')`): the press is
far more plausibly a mis-aim than a request to start over, on the one verb in
this app where the typed text is the point.

**What M9c did NOT solve, kept honest.** Three things, each a deliberate stop
— a fourth, the concurrent-commit race, WAS since solved and its entry below
now records the fix rather than the gap.

**Paste into the commit input is not wired.** `Cmd+V` is a main-process menu
accelerator (`main/menu.ts`) reaching `Canvas`'s `edit:paste` subscription, which
acts on the FOCUSED PANEL's `SessionHandle` — and a review node has none, so the
event lands nowhere at all. This is the identical gap `Palette.tsx` closed with
its own `edit:copy`/`edit:paste` subscriptions (see "`edit:paste` is guarded,
`edit:copy` is redirected"); M9c does not, because a commit message is short and
typed. The fix, if it is ever wanted, is the palette's, and it is a copy of a
solution that already exists rather than a new one.

**No amend, no branch, no remote, and no per-file selection.** The commit stages
every file the result reports, onto the current HEAD of the repository the node
already names.

**A concurrent agent commit is refused, not reverted — and this entry used to
say the opposite (`review-commit.ts`'s two HEAD reads).** The scratch index is
seeded from HEAD at T0 and the commit parents on HEAD at T2, so anything
committed in between was undone for every file outside our path set: no
conflict, no warning, an ordinary-looking commit that rolled its predecessor
back. Git has that race for any two committers, but this app's premise is an
autonomous agent working in the same checkout, so the other committer is the
ordinary case here rather than an exotic one — and the window is not
milliseconds, it is the entire duration of the `pre-commit` hook, legitimately
thirty seconds on a real project.

**Unborn repositories are unreachable rather than handled.** `read-tree HEAD`
fails in a repository with no commits — but `captureBaseline` cannot store a
baseline there either, so a node in one never reaches the `changes` arm and
never offers the verb. The arm is unreachable by construction, not defended, and
a future change that gave such a repository a baseline would reach it.

**`onClosePanel` branches on the kind before it disposes, and so do the three
loops (`Canvas.tsx`).** A review node owns no `PanelSession`, and
`registry.dispose(id)` sends `pty.kill` even for an id this renderer holds no
local session for — see "`dispose(id)` sends `pty.kill` even when this renderer
holds no local session for that id" above, which is the entry this one inherits.
So routing a node through dispose sends a `tmux kill-session` named after a
panel that never had one and calls `dropBaseline` on that id, which is harmless
only until an id is recycled. Four surfaces remove a panel and all four now
branch: `onClosePanel` early-returns into a drop-and-commit, and `applyHistory`,
`resetCanvas` and `deleteWorkspace` skip a node in their dispose loops. The
guards are on the loop's ITERATION rather than on the call, which is not
stylistic: `verify:panels` 94 counts `registry.dispose` occurrences in this file
(five) and `pty.kill` callers in `session-registry.ts` (two) by regex over the
source, comments included, so a guard written as a second call site would move a
number that is deliberately hard to move. `deleteWorkspace`'s guard is the one
with a stated limit: main's workspace rows carry ids and no kind, so it can only
recognise nodes in the ACTIVE workspace, whose panel objects this renderer
holds; deleting a HIDDEN workspace containing a node still sends that stray
kill, and closing it means teaching `WORKSPACE_LIST` to carry a kind, which this
milestone did not scope.

**Rule 3 of `shouldYieldWheel` is attribute-driven (`Canvas.tsx`,
`[data-scroll-host]`).** The rule used to be "a wheel over the FOCUSED panel
scrolls that terminal", and the terminal was implicit — the only thing a panel
could contain. With two kinds it has to be a question, and the tempting spelling
is a branch in the predicate: `if (isReviewPanel(panel)) …`. That makes the
predicate a place that must be edited every time a kind is added, and it makes
it consult the panel MODEL to answer a question about the DOM — which is wrong
even today, since the scrollable region inside a node is one element among
several, and a wheel over the node's header is not a wheel over its diff.
Instead each kind RENDERS the marker or does not, on the element that actually
scrolls: a live terminal's slot carries it, a review node's diff body carries
it, and `shouldYieldWheel` asks `panel.querySelector('[data-scroll-host]')`. The
old test was `.panel__slot`, which is this same question asked in terminal-only
vocabulary — and it was already subtly wrong for a reason that has nothing to do
with review nodes: a restored `focusedId` can name a panel `lod.ts` still
refuses to promote (dormancy outranks focus), and a CARD has no xterm to hand
the event to, so yielding there meant the wheel reached nothing at all and the
app read as frozen. A kind that owns no scrollable region says so by rendering
no marker, which is the right default: the wheel goes to the camera, which is
what every part of the canvas that is not scrollable already does. `verify:panels` 105 pins both halves on the node —
uncancelled over its body, and the camera unmoved — the same pair check 47
already pins for the palette.

**The node's model is a second reader of `ReviewResult`, deliberately, and it
differs on exactly one decision (`renderer/review/review-node-model.ts` versus
`shell/inspector-fields.ts`'s `buildReviewFields`).** This repo's usual rule is
the opposite one — see "One predicate for 'running'" and "One waiting count, and
the rail is a view over it" — so the divergence needs a reason, and it is
`hidden`. The inspector's Changes section is a strip inside a 260px column that
must VANISH when it has nothing worth saying: `not-a-repo` is the answer for
most panels, and rendering "this is not a repository" for every one of them is a
permanent blank gap in the one pane that is supposed to be free of noise. A
review node is a panel the user deliberately opened, placed and dragged; a panel
that renders nothing at all is indistinguishable from a broken one, and the user
has no way to ask why. So the node always renders something — a heading, a
summary, and a note for the arms the pane hides — and it makes the same call for
an in-flight query, where the pane shows nothing and the node says it is
reading. `verify:rail` 49 is the check that separates the two, and it is the
only one that could: it asserts `not-a-repo` HIDDEN in the pane and RENDERED in
the node, so an implementation that "simplified" the node into a call to
`buildReviewFields` turns it red while every other rail check stays green
(confirmed by injection). The rest of the two models genuinely agrees, and where
it agrees it agrees by calling the same things — the honest chain for the
heading, `parseDiffLines` for the hunks — so the divergence is one decision
rather than a second implementation.

**`makeReviewPanel` must not force the minted id into `subject.subjectId`
(`panels/panels.ts`).** Every other constructor in this module takes an id and
stamps it into the object it builds, so writing `subject: { ...subject,
subjectId: id }` here is one line, reads as consistency, and is catastrophic in
the quietest possible way: the node's subject becomes ITSELF. It then asks main
to diff a panel that never spawned, gets `never-started` forever, and renders a
perfectly well-formed empty state beside a panel that plainly has changes —
which reads as "the review feature does not work" rather than as a wrong id, and
points nowhere near this line. `subjectId` is the id of the panel being
reviewed and the minted id is the id of the node doing the reviewing; they are
two different things that happen to have the same type, which is exactly the
condition under which a copy-paste is invisible. `verify:viewport` 76 exists for
this one line and for nothing else.

**Panel ids are one sequence with two prefixes, seeded in TWO places
(`Canvas.tsx`'s `nextIdRef`, `openReview`).** A review node's id is minted from
the SAME counter a terminal panel's is — `r${nextIdRef.current++}` beside
`n${nextIdRef.current++}` — because `PanelId` doubles as a tmux session name and
"Panel ids are global, not per-workspace" (above) already turns on nothing else
being able to mint a colliding one. The prefix is not decoration: it is what
tells a reader of `layout.json`, or of a `tmux list-sessions`, which panels can
possibly own a session at all. The hazard is not `n` versus `r` — `n6` and `r6`
are different strings and cannot collide as session names — it is **r versus r
after a reseed**. Both seeding sites (boot, and every `switchWorkspace`) recover
the counter by scanning existing ids, and a regex that reads only `^n(\d+)$` is
blind to every persisted node: it recomputes an n-max that a saved `r7` had no
part in, and the next review gesture mints `r7` a SECOND time — a literal
duplicate panel id, which React keys collide on today and which `parseLayout`
drops silently at the next load. So both seeds read `^[nr](\d+)$`, and both have
to, because a workspace switch is where a reseed most plausibly gets forgotten.
`verify:panels` 107 is built exactly against this: it seeds a node whose number
is the very id a narrow reseed would hand out next, reloads so the reseed
actually runs, then opens a review through the real gesture and asserts the
minted id collides with nothing any workspace already holds. Its own comment
records that its first form — comparing bare numbers across prefixes — flagged
`n34`/`r34` as a defect and passed identically under either regex. **It is
tmux-gated**, and skipped LOUDLY where there is no tmux binary: the check needs
the seeded node's SUBJECT to survive `wc.reload()` so the real gesture has
something to open a review on, and session survival across a reload is a tmux
property — the direct backend kills the process outright. So on a tmux-free
machine the r-versus-r collision claim above is argued rather than proven, the
same honesty this file already applies to M6a's `reattached` criterion at
`verify:panels` 91 and to every check in `verify:pty-manager`'s tmux block.

**The eighth arm: `repo-unreadable`, and the Command Line Tools stub is the
ORDINARY case (`main/review-engine.ts`'s `RepoAnswer`).** `rev-parse
--show-toplevel` outside a repository exits 128 and says "not a git repository",
and M9a treated every failure of that call as that answer. Both halves of the
test are required and the wrong one to drop is the message: git exits 128 for
plenty of other fatals, so status alone folds "there is no repository here" —
which must stay quiet, because it is the answer for most panels — together with
"there IS a repository and git declined to open it", which must not. The second
class is not exotic. The macOS Command Line Tools stub at `/usr/bin/git` exists,
spawns, and exits non-zero on everything until the tools are actually installed;
`safe.directory` refuses an unowned checkout; a `.git` can be unreadable; a cwd
can vanish under a running panel. Under M9a every one of them rendered as
silence — the same shape as the ordinary case — so the Changes section simply
was not there, and a missing feature is the hardest failure to report, because
nothing looks wrong. The arm carries a DETAIL (git's own first line) rather than
a generic phrase, since the four causes have four different fixes and only git
knows which one happened. `verify:review` 38–41; `verify:rail` 46 pins that the
node renders a note for it and 47 pins that `not-a-repo` is still hidden, which
is what makes the distinction a distinction rather than a rewrite.

**A review node needs no signature; the rail does (`ReviewNode.tsx`'s `useMemo`,
versus `railSignature`).** Both modules face the same-looking problem — a
60Hz-changing input feeding something expensive to rebuild — and they need
opposite answers, which is why an earlier draft of the node copied the rail's
solution and made things worse. `buildRailRows` is fed `panels.map(...)`: a
freshly-allocated array of freshly-allocated objects on every render, so NO
identity there is stable and only the CONTENT can be compared, which is what
`railSignature` is for. The node's inputs are already identity-stable across the
volatile change: `setPanelRect` rebuilds a panel as `{ ...p, rect }`, so
`subject` and `panel.title` are carried by reference, and `result`/`expandedPath`
are the component's own state, which a drag does not touch. React's dependency
comparison therefore answers the question for free. The draft that froze the
node on a `JSON.stringify` signature over its model AND its diff serialised up
to `DIFF_MAX_LINES` (600) line objects on every frame of a drag — imposing the
exact 60Hz cost the memo existed to prevent, to avoid one object allocation.
Recorded because the two modules will keep looking like the same problem to
whoever reads them next.

**`openReview` re-reads its subject after the await, and the reachable failure
is not the obvious one (`Canvas.tsx`).** `window.canvas.review.baseline(id)` is
a real IPC round trip, and the obvious hazard — the panel was closed in the gap
— is already covered by the null check, because closing a panel drops its
baseline in main and the reply comes back null. The one that gets through is a
WORKSPACE SWITCH landing in the same gap. A switch DEMOTES rather than disposes
(see "A workspace switch is a second boot"), so the subject's session is
untouched, its baseline is untouched, and the reply is a perfectly valid
non-null baseline — for a panel that is no longer in this canvas. Minting from
the captured `subject` would then place a node by a rect that only meant
something in the workspace the user just left, carrying a `subjectId` nothing
here answers to, into the workspace they just arrived in. So the panel is looked
up AGAIN after the await and the mint is abandoned if it is gone. This is the
same shape as `restartPanel`'s re-check across its own await, and the same
lesson: the null reply is the failure that occurs to you, and it is not the one
left over.

**What M9b did NOT solve, kept honest.** Four things, each a deliberate stop
rather than an oversight.

**There is no file watcher, and adding one is declined rather than pending.**
The node re-reads on two signals — its subject's agent going idle, and its own
refresh control — and on nothing else. Pull, not push: the spec declines the
watcher explicitly (`docs/ideas-backlog.md` #19), and the reason is that the
signal worth reacting to is "an agent finished a turn", not "a byte changed on
disk". A watcher over a repository this app does not own would fire on every
build artifact, every editor save and every `git` command run in a terminal
elsewhere, and each firing is up to four git subprocesses per open node. A
change made outside a panel needs the refresh click, and that is the intended
behaviour.

**An untracked file's diff costs a second git call.** `git diff` against the
baseline does not describe a file git has never seen, so `fileDiff` falls back
to `--no-index` against `/dev/null` for a row flagged `untracked`. The trap
there is the exit status: `--no-index` exits **1 when it finds differences**,
which is success and is the only outcome that matters, so an implementation
treating non-zero as failure renders "this diff could not be read" for every new
file an agent writes — which is most of what an agent writes. `verify:review`
48.

**`#41`'s live-cwd limitation is unchanged.** A panel's repository is resolved
from the cwd it was SPAWNED in, so a panel that `cd`s out of that repository
mid-session is still reviewed against the first one. The baseline is a sha in
the first repository and nothing re-resolves it, so the answer is stale rather
than wrong-looking. Fixing it means reading a running process's live cwd, which
is the backlog item's whole subject.

**Survival across a full app QUIT is unproven.** `verify:panels` 109 proves a
node survives a renderer RELOAD, which is a different event. On a real quit and
relaunch, main's startup sweep drops the baselines of panels whose session did
not survive — including the node's SUBJECT — so `review:panel` would answer
`never-started` for that panel, while the node keeps working because it holds
its own root and sha and asks `review:at`. That is the design working as
intended, and it rests on one fact nothing here checks: the `git stash create`
object the sha names is unreferenced, so it survives until `git gc` decides
otherwise. Nothing in this repo observes that boundary, and a node whose object
has been collected renders the `baseline-lost` arm — the summary a user reads
as "unattributable" — rather than a wrong one. No
check covers it; do not read 109 as though one did.

**The nav grid is the first held-modifier state in this app, and `blur` is
what makes it dismissable (`navgrid/useNavGrid.ts`).** Every keyboard path in
this codebase before M11 is `keydown`-only: a chord fires once, on the
down-stroke, and that is the whole event. `Cmd+G` breaks that shape on
purpose — the grid stays revealed for as long as `Cmd` stays down, so "is a
key still held" has to be tracked as real state for the first time, and it is
state whose failure mode is a stuck modal rather than a missed keystroke.
`useNavGrid` is therefore this app's first `keyup` and first `blur` listener;
every gesture before it needed only the down-stroke.

**The commit test is `event.key === 'Meta'` on `keyup`, deliberately not
`!event.metaKey`.** The obvious spelling asks whether the modifier bitfield
has already cleared by the time the keyup for `Meta` itself arrives, and that
question was probed and found unanswerable by anything this repo can run:
`sendInputEvent` reports back exactly the `modifiers` array it is handed —
`['meta']` yields `metaKey: true`, `[]` yields `metaKey: false` — so a check
written against the bitfield only proves the harness echoes its own input,
never what a real keyup carries. `key === 'Meta'` is correct under either
reading of that bitfield and covers `MetaLeft` and `MetaRight` alike, which is
robustness against an unknown rather than a bet on how it resolves.

**`blur` is required, not defensive.** `Cmd+Tab` is the ORDINARY way to lose
this, not an exotic one: the user holds `Cmd`, taps `Tab`, macOS switches
applications, and the `keyup` for `Cmd` is delivered to the OTHER
application — never to this one. A `keyup`-only design leaves the overlay on
screen forever, over a canvas whose own shortcuts have already stood down,
with no key left that dismisses it and no recovery short of `Cmd+R`. This is
success criterion 4, and it is the one failure in this milestone that is
unrecoverable rather than merely wrong — every other exit is merely wrong if
it breaks. Confirmed by fault injection: deleting the `blur` listener leaves
`verify:panels` 118–120 and 122 green and 121 alone red, reporting
`open true -> true` — the overlay genuinely stuck, exactly as this paragraph
predicts.

**...and the four menu accelerators stand down on the SAME predicate, because
nothing else can reach them.** `Cmd+C`/`Cmd+V`/`Cmd+Z`/`Cmd+Shift+Z` are
main-process menu accelerators delivered as `edit:*` IPC events — they never
pass through a renderer keydown at all, so neither the grid's capture-phase
`stopPropagation` nor `shouldIgnoreKeys`-in-`useViewport` touches them, and
until M11's fix wave all four guarded on `palette.isOpen()` alone. Revealing
the grid means the user is **already holding `Cmd`**, which makes these the
most plausible stray chords in the whole app rather than exotic ones, and
`Cmd+Z` is the expensive one: it runs `applyHistory`, which removes a panel
and calls `registry.dispose(id)` — killing a running agent behind an opaque
overlay with nothing on screen changing to explain it, and the workspace
switch on release then carries the evidence away. `Cmd+V` is `verify:panels`
35's failure verbatim with a different overlay in front of it. All four now
call `shouldIgnoreKeys()`, which collapses three copies of "who owns the
keyboard" into the one predicate this file already uses for the wheel.
`verify:panels` 123.

**Cell 8 is always `More…`, never conditional on a ninth workspace
existing.** `verify:palette` 31's rule, stated there for a disabled row,
applies here unchanged: a cell that appears only sometimes is a cell whose
position is not stable, and the escape hatch to a workspace past cell 7 is
the one cell that must never be missing. Making it conditional would also
break success criterion 2 by a side door — an eighth workspace arriving would
flip cell 8 from `More…` to a real workspace mid-use, displacing muscle
memory for the one cell that was supposed to be the constant.

**Releasing on the already-active cell must never call `switchWorkspace`.**
That function is a transaction — it writes the outgoing canvas into the OLD
workspace's record before flipping `activeWorkspaceId` (see "`activateWorkspace`
takes the outgoing canvas" above) — so invoking it for a same-id "switch"
re-renders the whole canvas, re-seeds the id counter and clears the undo
stack in order to arrive exactly where it already was. **No check in
`npm run verify` covers this guard.** Nothing renderer-visible distinguishes a
same-id switch from a genuine no-op, so it was verified once with a
throwaway `switchWorkspace` call counter that never entered the committed
suite — zero calls with the guard in place, one without — and that
measurement is not repeatable by anyone who did not run it themselves.

**The one unverified link: a physically released `Cmd` has never been proven
to emit a `keyup` with `key === 'Meta'` while an Electron window has focus.**
Every keyup and blur `verify:panels` 118–122 exercises is dispatched or
`sendInputEvent`-driven, which proves what `useNavGrid`'s handlers DO and
nothing about what macOS actually DELIVERS — the same shape of gap this file
already records for `verify:panels` 32 (the default-preset push) and for the
auto-repeat checks (what `repeat: true` proves versus who actually sets the
flag). It needs a hand on a real keyboard once, and it must not be written
down as checked until somebody has done it.

**The code says `link`, and `edge` already means something else
(`renderer/canvas/link-geometry.ts`, `LinkLayer.tsx`, `PanelLink` in
`panels.ts`).** Backlog #24 calls these edges. Nothing in the source does, and
the rename is deliberate rather than taste: `EdgeIndicators.tsx` and
`viewport.ts`'s `edgeIndicator` — both in `renderer/canvas/`, the same
directory — already mean the off-screen attention pip. A second, unrelated
"edge" concept there makes every future `grep -rn edge src/` ambiguous between
two features that have nothing to do with each other, and the two are most
confusable exactly where they are most different: one is INSIDE `.world` so it
pans and zooms with the panels, the other is a SIBLING of `.world` precisely so
it cannot. The one place the word survives is the palette row's `searchText`,
which carries `edge` on purpose so a user who thinks in #24's noun still finds
the row — user-facing search text, never a symbol.

**`removePanel` prunes incoming links, so a close and its links are ONE undo
entry (`panels.ts`).** Outgoing links leave with the panel holding them, for
free; incoming ones are what the prune is for, and they are #24's named failure
— "dangling edges are the standard failure of every graph UI that stored ids
without deciding this". The prune lives inside `removePanel` rather than at its
call sites, and that placement is the whole mechanism: both callers are the two
branches of `onClosePanel`, and both are already inside a `setPanels` updater
whose result goes straight to `commitHistory`, so the panel and its links leave
in one committed gesture and one `Cmd+Z` brings back both. A prune written at
the call sites would be two places to get right, and the one that got missed
would leave a link pointing at nothing with no error anywhere. `verify:viewport`
80 pins it, and its second clause is the over-correction guard — stripping
every link from every survivor satisfies "the dangling one is gone" while
silently emptying the canvas on any close. `verify:panels` 128 is the end-to-end
half, and its ONE-PRESS clause is the whole check: a prune committed separately
satisfies "the link came back" after two presses and looks correct everywhere
else, while the user's second press undoes something unrelated.

**...and `parseWorkspace` prunes again on the way in from disk, from `panels`
and NOT from `seen` (`shared/layout-schema.ts`).** A canvas needs both halves,
because a file can be hand-edited between two launches. The subtlety cost a red
check to find and is worth not rediscovering: `seen` LOOKS like the surviving
set and is not one. `parsePanel` calls `seen.add(id)` immediately after the
COORDINATE check and before the `cwd` and `args` checks, because its job is
rejecting a duplicate id rather than recording a success — so a panel dropped
for a missing `cwd` is still in `seen`, and a link naming it would resolve to a
panel that is not on the canvas, which is precisely the dangling link the pass
exists to remove. Reusing `seen` makes the pass agree with itself and do
nothing. The spec and the plan for this milestone both said to reuse it; both
were wrong. `verify:layout` 111. (The same subtlety applies to `pick` one line
below, which does filter through `seen`: a `selectedId` naming a panel dropped
for a bad cwd survives as a selection of a panel that is not there. It is
harmless — `assignTiers` simply finds no such panel — and it predates this
milestone, so it is left alone rather than changed underneath the checks that
cover it.)

**`linkAnchors` clips a ray; it does not clamp two axes
(`link-geometry.ts`).** The same rule this file already records for
`edgeIndicator` one file over, and it fails the same silent way: clamping `dx`
to the half-width and `dy` to the half-height independently sends every
diagonal to a corner, so links leave and enter panels at the same four points
regardless of the true bearing — and still render, and still look like a
working feature. Taking the SMALLER of the two per-axis parametric crossings
and scaling the whole ray by that one `t` is what keeps the exit on the
bearing. The anchors are on the two rects' BORDERS rather than their centres,
because a line drawn to a centre disappears under the panel it points at and
the arrowhead is the only thing carrying direction. Coincident centres answer
`null`: there is no direction to draw, and normalising a zero-length vector is
how a `NaN` reaches a transform and takes the WHOLE layer's paint with it —
every link gone, not only that one, with nothing thrown. `verify:viewport` 84 is
the only check that separates the clip from the clamp, and its fixture is a
deliberately SHALLOW diagonal for that reason: at 45 degrees both
implementations answer the corner and the check would prove nothing. Confirmed
by fault injection — substituting the clamp turns 84 alone red (exit `50,50`
instead of `50,12.5`) while 83 and 85–88 all stay green.

**That the layer paints at all was verified by PIXELS, and the first two
answers were both wrong.** No DOM assertion can see it: clipping changes
neither geometry nor layout, so `getBoundingClientRect` reports a perfect line
for a layer that draws nothing. A throwaway Electron probe against the real
built renderer settled it (line pixel `[24,28,42]` against a ground of
`[8,9,16]`), and the route there is the transferable part. The FIRST run
reported failure and was sampling a point covered by a PANEL — reading the
panel's body colour, which is the layer behaving correctly at `z-index: 0`. A
synthetic reproduction then reported that an inline svg under a transformed
parent never paints, which the real app flatly contradicts: the artificial page
was a worse instrument than the thing itself. What kept it honest was an
INSTRUMENT CHECK — a plain sized `<div>` in the same capture — which proved
`capturePage` worked before any conclusion was drawn about the svg. The general
rule, and this repo has no visual regression test to fall back on: when a
measurement says a feature is broken, verify the instrument before changing the
feature.

**The completing click is intercepted in the CAPTURE phase, or it wakes a panel
(`Canvas.tsx`'s `onLinkModeMouseDownCapture`, `useLinkMode.ts`).** Creating a
link is a one-shot armed mode: a palette row and an inspector button set the
source, and the next mousedown anywhere on `.canvas` resolves it either way.
Capture phase is load-bearing twice. Every panel's own chrome handler
`stopPropagation`s its mousedown, so a listener on the background `onMouseDown`
never sees a click on a PANEL — which is every click that can complete a link.
And letting one through reaches `onSelectPanel`, which clears the dormant id
and calls `registry.wake`: completing a link onto a dormant panel would SPAWN
AN AGENT, which on a restored canvas is one agent CLI per link the user draws,
and is exactly the accident the dormancy rule exists to prevent.
`verify:panels` 126 is the check, and its no-session clause is what separates it
from a check that only asserts a link appeared. It hit-tests the WORLD point
rather than reading `event.target`, so a click on a panel's chrome, its card
and its terminal body all mean the same thing, and it reuses `hitOrder` rather
than a second sort. `addLink` returns the SAME array when it refuses a
duplicate, and the commit is conditional on identity: a history entry for a
gesture that changed nothing is one wasted `Cmd+Z`, and the rule is one entry
per COMMITTED gesture.

**ONE-SHOT is the safety property, and `Escape` is the one bare key this
milestone claims (`useLinkMode.ts`).** The first mousedown resolves the mode
either way, so unlike #21's broadcast input — whose entire warning is about a
mode you can forget you are in — there is no state to be stranded in. That,
plus a banner naming the source panel, is what makes the mode never invisible.
The `Escape` listener is installed only WHILE armed, so the app's "a bare
keystroke must always reach the PTY" rule holds at every other moment and the
exception exists for exactly as long as the banner is on screen saying so; it
`stopPropagation`s, because an `Escape` that also reached the focused agent
would be a very meaningful key there. `blur` disarms too, for `useNavGrid`'s
reason: `Cmd+Tab` away must not leave a canvas armed when the banner is the
only evidence the mode exists. The banner names its source through `railLabel`,
the honest chain's existing reader, rather than becoming a fifth re-derivation
that would say `/bin/zsh` where every other surface says the panel's title.

**M13 added no IPC channel: `verify:ipc` stays at 31.** Links ride inside
`CanvasState`, exactly as `panels` does, through the existing `layout:load`,
`layout:save` and `workspace:activate`, so `README.md`'s channel list needs no
edit and `verify:meta` 14 stays green without one. This is the third time this
file records the same boundary being reached and declined — M6d's attention set
and M7's workspace waiting counts are the other two — and the tempting wrong
conclusion is the same each time: "links are a new kind of thing, so they need
a channel". They are a new kind of thing that the renderer already has all the
data for, and a channel would make main a second author of a fact this side
derives correctly.

**A credential never reaches a PTY, and that is stricter than `shell-env.ts` on
purpose (`main/credential-store.ts`, `main/shell-env.ts`).** This is the entry a
future reader is most likely to "fix" for consistency, and undoing it deletes
the milestone in one line, so the axis has to be written down rather than
inferred. `shell-env.ts` captures the user's entire login environment once at
startup and **every PTY inherits it** — that is not an oversight this milestone
tightens, it is load-bearing and must stay: it is how `claude` finds its API key
(see "Login-shell PATH" above). So agents in this app already receive secrets,
and M14 does not change that by a byte. The distinction is **not the secrets'
sensitivity, it is whose decision it was.** The environment is the *user's own*
pre-existing configuration, exported by their own dotfiles, which the agent
needs in order to function at all; withholding it breaks the app's premise. A
credential in this store is one **this app obtained**, through a UI this app
built, for a purpose this app performs — so handing it to an agent would be a
choice the app makes gratuitously, on the user's behalf, for no functional gain.
The asymmetry is therefore the design and not an inconsistency in it. It matters
here more than it would in most apps for a reason specific to this one: this is
an app whose entire purpose is running arbitrary LLM-driven CLIs as the user, so
a token that reaches a panel reaches a process that can `curl` anywhere, read
any file, and print anything into a scrollback that backlog #30, #16, #39 and
#28 all propose moving somewhere else. There is no meaningful least-privilege
story for a secret handed to an agent; the only durable control is whether it is
handed over at all. **Nothing about this has a runtime symptom when broken** —
an env-building module that imported the store would make the app work exactly
as it does now, better in fact, which is why the rule is pinned as SOURCE TEXT
by `verify:meta` 21 rather than as behaviour, and why the offender list there
names `credential-(store|verify|crypto)` as an alternation: reaching the store
by way of `credential-verify.ts` is the identical violation wearing an extra
hop.

**Both halves are pinned as SOURCE TEXT, and that is forced rather than
fastidious: neither has any runtime symptom when broken.** Add
`credential:get`, and nothing fails — the app works exactly as it did, plus one
channel nobody calls yet, and the renderer simply holds a secret it should never
have had. No check that observes behaviour can see that, because there is no
behaviour to observe. This is the second instance in this repo of the form
`verify:panels` 94 established for the `dispose` call-site count, and it is here
for that entry's own reason: prose has already lost an invariant of exactly this
shape in this file once, going stale inside the very commit that recorded it.
`verify:meta` 20 asserts the `CREDENTIAL_*` key set is EXACTLY {list, set,
delete, verify} — an allowlist, not a test for the string `credential:get`,
because testing that spelling pins the spelling and not the rule, and a sibling
added as `CREDENTIAL_REVEAL` sails past it — plus no `cipher` field in `ipc.ts`
or in `credential-schema.ts`, which is where `CredentialMeta` is declared and
therefore where a plaintext field would really be added. `verify:meta` 21 is
rule 2 above.

**Two limits those two checks carry, recorded here as well as in their own
comments so a green run is not over-read.** 21 does not follow a SECOND hop of
indirection on either half. On the read half: rebinding `credentialStore` to a
new identifier and then destructuring or calling through THAT is unchecked —
the direct call and the one-level destructuring alias are what it sees. On the
import half: it greps each offender file's OWN source for the three
credential-adjacent filenames, so an offender that imports some OTHER,
non-credential module which itself imports `credential-store.ts` contains none
of those three names and is invisible to the regex — a genuine second hop
through an intermediate module is unchecked, same as the read half's rebinding
case. And its three-file offender list (`shell-env.ts`, `pty-manager.ts`,
`session-backend.ts`) is a HARDCODED SNAPSHOT of "the modules that build a
process environment" as of M14, not a derived fact, so a fourth such module
added later is unchecked **by construction** until somebody adds it to that
array. None of these are a defect in the checks; all are the honest boundary of
what a regex over source text can claim, the same shape this file already
records for `verify:panels` 32 and for the auto-repeat checks.

**What M14 does NOT prove, and must not be read as proving.** Two things, both
outside the reach of every suite in this repo, both needing a hand on a real
machine once. One of them has since been done and is recorded below; the other
has not. **`safeStorage`'s actual protection is an OS property** — on macOS
a Keychain ACL bound to the app — and no check here observes it.
`verify:credentials` drives the store against an INJECTED fake crypto, which is
what keeps a file format and a refusal path in the cheapest verify tier at all;
what it proves is that the store calls its crypto, and refuses when the crypto
says it is unavailable. It says nothing whatever about whether another binary
on the machine could read the key back out, which is the thing a user actually
cares about — and the ACL that binding rests on is keyed to the app's CODE
IDENTITY, which `build/builder-config.cjs`'s `identity: null` means this app's
own beta builds do not have; the hand-check named above must be performed
against a SIGNED build if one is ever cut, or it is measuring a weaker binding
than a released app would ship with (see SECURITY.md's "Releases are
unsigned"). **And the real network request is exercised by no automated
suite.** `verify:credentials` 11–14 drive `verifyCredential` against a fake
fetcher, and `verify:panels` 130 probes `verify()`'s refusal deliberately
BEFORE any credential exists — reaching the "no stored credential to verify"
early return with zero network traffic, because `npm run verify` is this repo's
one green-or-not signal and must stay fast and offline (the same rule that keeps
`verify:packaged` out of the default chain, and the same rule as "the verify
suites must never touch the production socket"). So the one line this milestone
actually crossed — main now makes an outbound request — is the one line nothing
automated watches, and that is a deliberate standing gap rather than a missing
check: closing it in the suite would put a network dependency on the repo's one
green-or-not signal.

**That request was therefore verified BY HAND, once, on 2026-08-30, against the
dev build — and this paragraph is the record, in the shape this file already
keeps for the `isAutoRepeat` probe and the link layer's pixel probe.** A real
classic PAT, scopeless, was pasted through the palette's own `secret` input mode
and `credential:verify` was run from the palette row. **The evidence is the
LABEL, not the absence of an error**, and that is the whole reason this
measurement means anything: `CredentialMeta.label` starts as the service's own
declared label (`GitHub`) and is overwritten only on the success path with the
`login` GitHub itself returned — a value NOTHING local can derive from the token
string, so an implementation that faked a success, or never left the machine,
leaves the default in place and is distinguishable on sight. Observed: the row
title moved from `Verify GitHub (GitHub)` to the account's own login, and
`verifiedAt` was written. The storage half was read off disk in the same pass,
since a hand-check that is already at the keyboard should spend its one trip:
`credentials.json` at mode 600, a `cipher` field present, NO `token` key at all,
and zero plaintext PAT patterns in the file — `verify:credentials` 4's claim
observed against a real `safeStorage` rather than the injected fake.

**What that hand-check does NOT extend to, so a later reader does not over-read
it.** It was one SUCCESS. The rejection path — a revoked or under-scoped token
producing "GitHub rejected the token", the single most useful thing this verb
reports — is still exercised only against the fake fetcher, and its live
behaviour is unobserved. It says nothing whatever about the `safeStorage`
binding described above, which remains the unproven half and needs a SIGNED
build to be worth measuring at all. And it is a fact about one machine on one
day: it does not become a property of the code, which is precisely why it is
written down here rather than counted as coverage.

**The subagent poll rides the live tick, and sits outside its backend gate
(`pty-manager.ts`'s `pollLive`).** Not a third timer. `CLAUDE.md`'s rule that
the idle tick and the live tick stay separate is about the 500ms idle tick's
RESOLUTION — merging it into the 2s live tick would coarsen `agent.idleAfterMs`
by four times, silently, for every panel. Nothing like that is at stake for
subagent detection: it is the same cadence class as the live cwd poll, and its
per-tick cost is a `readdir` of a directory that is usually empty, beside the
`execFileSync` the live tick already pays. So `pollLive`'s old shape —
`if (!entries) return` wrapping the whole method — became `if (entries) { …
live loop … }` around only the live-cwd half, with the subagent poll running
UNCONDITIONALLY after it, never inside that guard. The reason is the same
"safe direction" argument reworded for a gate instead of a mapping: the
subagent half reads the filesystem, not tmux, so a direct-backend panel has a
real Claude Code session running just the same as a tmux-backed one, and gating
it on `backend.list()` — which answers `null` on the direct backend BY
CONTRACT — would silently disable this entire milestone on a real, supported,
production configuration (see "The probe checks that the SERVER starts").
`verify:pty-manager` 25 is the check that a panel with no Claude Code session
directory produces nothing across several ticks; nothing in that check or
`verify:subagent` requires tmux, which is the point being pinned. Also not a
file watcher: `subagents/` does not exist until the first subagent spawns, so
`fs.watch` would mean watching the PARENT directory and re-arming the watch
every time — machinery built to catch a signal a 2s poll already delivers on
the scale a human reads a node appearing at all.

**A fifth store, and the fifth time the `registry.version()` rule is recorded
(`renderer/session/subagent-store.ts`).** Module-level, subscribed PER PANEL
ID, over a CACHED snapshot — cloned from `live-session-store.ts` on all three
counts. It must never bump `registry.version()`, which deliberately moves only
on tier/status/focus/exit: a fact that changes when a model decides to fan out
would re-render every panel on every OTHER panel's fan-out, the identical 60Hz
cascade `agent-state-store.ts` and `live-session-store.ts` already exist to
keep off `TerminalPanel`'s `memo`. The cached snapshot is not an optimisation
either — `useSyncExternalStore` compares snapshots by reference, so a getter
that built `{ records, ambiguous }` fresh on every call would make React
believe the store changes on every render, and it loops. The store's own
dedupe (`applySubagents`, comparing serialized records before replacing the
stored object) is a SECOND dedupe layered on main's: main's stops the message
crossing the process boundary at all; this one stops a re-render if a message
ever arrives unchanged anyway — a reload, a future snapshot-on-load, a second
sender — which is what lets the hook hand React a stable reference across a
no-op update. And it needs the same clear every prior store needed: cleared
alongside `clearAgentState`/`clearLiveSession` at all four of `Canvas.tsx`'s
panel-removing sites, or the map grows for the life of the renderer and a
RECYCLED panel id inherits a dead panel's subagents — and again at RESTART IN
PLACE, which is a fifth call site and not a fifth panel-removing one. The
reason there is different and worth keeping distinct: the panel survives a
restart, so nothing is leaking, but the process it describes does not, and a
fresh agent must not inherit the dead one's node list — a column of `done`
nodes belonging to a conversation that no longer exists, beside an agent that
has spawned nothing. Counted from the source rather than from memory: five
`clearSubagents` calls, four of them panel-removing (`applyHistory`,
`resetCanvas`, `onClosePanel`, `deleteWorkspace`).

**The limit that leaves, stated rather than hidden: a SECOND `claude` in one
panel is never claimed.** The re-claim above keys on the slug, so a panel that
stays in the same repository is not re-examined — and the ordinary way that
happens is a user whose `claude` exits and who simply runs `claude` again in
the same shell. The PTY never died, so no `drop()` ran; the claim is still the
old session's; and the new session's directory is never looked for. On screen
the panel's nodes sit there `done` forever while a live agent fans out beside
them, with nothing saying why. It is left because the fix is not a patch: it
needs a periodic re-`chooseSession` for an already-claimed panel, which means
deciding when a NEWER session directory outranks a confirmed claim — and
getting that wrong in the other direction is worse, since a claim that keeps
jumping to whatever directory is newest is exactly how a panel adopts a
neighbour's conversation. The safe direction is unchanged meanwhile: stale
nodes rather than someone else's. Closing a panel, restarting it, or moving it
to another repository all re-claim correctly today; only "run `claude` twice in
one shell" does not.

**The record list is capped, and the remainder is NAMED (`SUBAGENT_CAP`,
`DESCRIPTION_MAX`).** Nothing removes a record once added — a finished
subagent stays on the canvas as a `done` node — so the list only ever grows,
for the life of the panel, and its length is not this app's to choose: it is
however wide a model decided to fan out. Three costs ride on it and every one
is invisible on screen: `SubagentLayer` stacks the nodes in one column at
`NODE_H + NODE_GAP` each (100 subagents is a 6,400px ribbon painted over
whatever the user placed to the right of that panel), the whole list is
re-serialised into the poll's dedupe key on EVERY 2s tick, and the whole list
crosses IPC on every change. This repo caps everywhere it reads something it
does not own for exactly this reason — `REVIEW_FILE_CAP`, prompts at 100 files
and 64KB — and the same rule applies to the remainder: it is COUNTED and
reported as `+N more`, never silently dropped, because a column that just
stops is indistinguishable from an agent that stopped spawning, which is a
wrong answer where a cap is only a bounded one. `DESCRIPTION_MAX` is the same
bound on the one free-text field, applied in `parseMeta` — at the PARSE
boundary, so every consumer inherits it rather than the one that remembered
to. The overflow count rides INSIDE the dedupe key rather than beside it: on
the tick a panel crosses the cap the records array is already full and
byte-identical, so a key that ignored the count would freeze `+N more` at the
first number it ever showed. `verify:subagent` 24 and 25.

**`detachAll()` forgets the dedupe, not the claim
(`pty-manager.ts`'s `detachAll`, `subagent-watch.ts`'s
`SubagentWatch.clearDedupe`/`clear`).** `detachAll()` calls
`subagentWatch.clearDedupe()`, never `.clear()`. It is the `Cmd+R` reload
path, where main's `PtyManager` and the tmux sessions it holds both SURVIVE —
only the renderer's store is empty, because the page is new — so what needs
forgetting is exactly what `lastLive.clear()` two lines up already forgets for
`session:live`: the dedupe key that would otherwise compare the next real poll
against a pre-reload value and stay silent forever. A full `.clear()` here
would go further and drop the CLAIM too — the session directory this panel has
already confirmed, and the byte offset into its parent transcript — forcing
the next poll to re-derive both from scratch against the reattaching
`create()` call's new, later `spawnedAt`. `chooseSession` only accepts a
session directory created ON OR AFTER `spawnedAt`, so the real one, predating
the reload, would no longer qualify — the panel's subagents would vanish at
the first `Cmd+R` and never return, the identical failure `firstSpawnedAt`
(above) exists to prevent, reached through the sibling function instead.
`verify:subagent` 22 is the check, and it is deliberately not satisfied by a
bare "did something come back": it drives the second poll with a LATER
`spawnedAt`, exactly what a reattach produces, so a `clear()` mislabelled as
`clearDedupe()` is caught rather than accidentally passing — with the claim
gone, `chooseSession` rejects the now-too-old directory against the newer
timestamp and the panel reports NOTHING, while a real `clearDedupe()` reuses
the untouched claim and the later `spawnedAt` changes nothing about its
answer. This was a real defect once, not a hypothetical: this suite's own
task instructions specified a plain `clear()` here by mistake, and check 22 is
what would have caught it.

**The watch is on the DIRECTORY, filtered to the basename — never on the file
itself, and this is the single most important line in M16
(`main/file-watch.ts`'s `FileWatchers`; this milestone was built and reviewed
as "M13" and renumbered on merge — see the milestone-wide renumbering
commit).** Agents and editors do not write
files in place: they write a temporary file and `rename()` it over the
target, which replaces the inode. `fs.watch(path)` stays bound to the OLD
inode — it fires once for the initial truncate, or not at all, and then
never again. The panel goes permanently stale, showing content from before
the agent's first write, with no error anywhere — which looks exactly like a
watcher that was never wired up, so a fix aimed at "the watcher isn't firing"
would look in the wrong file entirely and find nothing wrong with it.
Watching the directory survives the rename, and it delivers deletion and
re-creation for free, which the `missing` arm needs regardless. `verify:file`
7 is the only check in the repo that fails against the naive `fs.watch(path)`
version, and its own comment says so: it drives the atomic write (a temp
file, then a rename over the target) that is what an agent or an editor
actually does, not a plain overwrite, which a file-scoped watch would
happily survive and which would make the check pass against the very
implementation it exists to reject.

**A save is a compare-and-swap, and the refusal writes NOTHING
(`main/file-write.ts`).** M16 built the file panel read-only specifically so
it would not have to answer #14's own open question — who wins when the agent
and the user edit the same file at once. M22 answers it: a write carries the
`mtimeMs` its draft was seeded from, and main refuses outright if the disk has
moved since. The token costs nothing to obtain, because `file-read.ts` already
stamps `mtimeMs` AFTER its read completes, deliberately, so it describes the
content actually in hand rather than whatever was on disk when the read
started.

**The no-write half of the refusal is the whole thing**, and it is what
`verify:file` 12 asserts alongside the arm: an implementation that refused the
caller and wrote the file anyway satisfies every assertion phrased about the
RESULT, and destroys an agent's work silently. `verify:credentials` 6 states
the identical rule for the credential store's plaintext refusal, and for the
identical reason — a refusal that is not observed at the filesystem is not a
refusal.

**`verify:file` 18 is the over-correction guard and is not a formality.** A
CAS written backwards refuses every save there is, which is a feature that
never works rather than one that works and is unsafe — and it would pass check
12 perfectly. This is the shape `verify:review` 37b already states for the
baseline sweep.

**Three mechanics of the write are each defended by their own check, because
each fails silently.** The temp-and-rename is what stops an agent reading a
torn file mid-save (and it is the exact code path `FileWatchers` was built to
survive, so every save now exercises it); `realpathSync` is what stops the
rename replacing a SYMLINK with a regular file, leaving the user's link gone
and the real target untouched; and the mode copy is what stops every save
stripping the executable bit off a script, a loss discovered days later by
something that failed to run. All three are CHARACTERISATION checks in
`verify:pty-manager` 20's sense — they passed on first write and earn their
place by fault injection (`verify:file` 15, 16, 17), not by ever having failed
on their own.

**A truncated file is READ-ONLY, and the gate is enforced in TWO places
because one was not enough (`file-node-model.ts`'s `editable`,
`FileNode.tsx`'s reseed effect and `save`).** This entry said flatly that a
truncated file "stays read-only" for the whole of M22, and at the SAVE
boundary that was untrue — the final whole-branch review found it, and no
per-task review could have, because the hole lives at a seam between two
tasks that were each correct on their own.

**So the truncated result is now a CONFLICT in the reseed effect (never a
reseed), and `save()` refuses outright when `model.editable` is false.**
Neither half alone is sufficient and the save-time guard is the one a future
reader will be tempted to remove as redundant with the button's own
`disabled` — it is not, and the reseed door is exactly why: a draft opened on
an editable file can arrive at an uneditable one without the button ever
being pressed again. The refusal is VISIBLE (it sets the save error, carrying
the model's own per-arm `editableNote`) rather than a silent return, because
a Save button that does nothing is its own defect. The conflict's wording is
its own sentence rather than the generic "this file changed on disk", which
here would be actively misleading — it invites the user to press Save again,
which is the write the gate exists to stop.

**`verify:panels` 140 is what pins it, and it is the only check anywhere that
knows the save path consults `editable` at all.** `verify:rail` 81 proves the
MODEL computes the flag and says nothing about whether anyone obeys it. 140
drives the sequence above end to end and asserts the claim ON DISK — the panel
is precisely what would lie about it, since a clobbered file renders as a
perfectly ordinary 10,000-line view. Its two other clauses are non-vacuity
guards and both were earned: the banner clause rejects a panel that never
received the push, and the save-error clause rejects a Cmd+S that never
reached this panel's textarea — which is not hypothetical, because check 139
above deliberately leaves ITS panel in edit mode with a banner up, so the
first draft of 140 used unscoped `document.querySelector` calls, typed into
139's textarea, and passed while exercising nothing. Every query in it is
scoped to the newest file panel for that reason. Watched RED against the
unfixed code and GREEN after, with the disk line count as the discriminator.

**A dirty draft is armed against the two gestures that destroy it, and the
`×`'s own comment was stale (`FileNode.tsx`).** The close `×` and a bare
`Escape` in the textarea both discarded typed, unsaved work outright, and
neither consulted `dirty` — the value this milestone spent a fix round making
visible as a marker precisely so the user would be TOLD there is unsaved work,
and could then lose it to one mis-aimed click. Both now follow
`TerminalPanel`'s existing one-click arming pattern rather than reaching for a
modal (this app has exactly one modal-shaped surface, the palette's confirm
mode, and "a dialog on every close trains you to click through the one that
mattered"). Two separate arming states, because they are two different losses:
the `×` takes the whole panel, `Escape` takes only the draft. A CLEAN draft
still leaves on one press — making the ordinary exit ask twice is how a
confirmation stops being read — which is the same split `TerminalPanel` draws
between an exited panel and a running one. The `×`'s comment claimed there was
"nothing to kill here" and that "the same gesture reopens the file": true while
this panel was read-only, false the moment it grew an editor, since reopening
brings back what is on DISK rather than what was typed. The `Escape` arming
renders a visible line, because a first press that silently does nothing reads
as a broken editor — worse than the discard it prevents.

**A workspace switch still takes an unsaved draft with it, and that is NOT
solved.** The draft lives in component state and a switch unmounts the panel
(demote, not dispose — see "A workspace switch is a second boot"), so there is
no gesture to arm and nothing on screen to warn against: the canvas simply
changes and the typing is gone. Arming cannot reach it, because the switch is
not a gesture aimed at this panel; fixing it means either lifting the draft out
of the component into something that survives an unmount — which puts
un-persisted user text into a store whose whole stated rule is that it is a
cache of main's answer — or teaching `switchWorkspace` to interrogate every
mounted panel for unsaved state before it commits, which is a Canvas-level
transaction this milestone did not scope. Recorded here rather than discovered
later. The same is true of a `Cmd+R` reload, for the same reason and with the
same absence of a fix.

**`FileWriteResult.mtimeMs` must be ADOPTED, or the next save reports a
conflict that never happened (`FileNode.tsx`'s `lastWriteRef`).** The field was
returned by `writeFile` and consumed by nobody. Save content byte-identical to
what is already on disk — revert an edit, or simply press Save twice — and the
rename still advances the file's mtime, but `file-watch.ts`'s dedupe hash
deliberately EXCLUDES `mtimeMs`, so the re-read hashes identically and **no
push is sent**: the store keeps the pre-save mtime, the next ✎ seeds
`baseMtimeMs` from it, and the next save is refused with "this file changed on
disk since it was opened here" — a confident claim about another writer who
does not exist, offering the user only "discard mine" or "Overwrite theirs".
The watcher structurally cannot supply the value, and that is the point: the
dedupe is correct and is not being changed for this. So the component adopts
the returned mtime, keyed on the CONTENT it wrote so the record invalidates
itself — a genuine third-party write does push, does change `result.content`,
the comparison fails, and seeding falls back to the store's own mtime so the
CAS still refuses. It is a REF rather than only state because it has to outlive
`closeDraft()`: it is the NEXT draft's seed that was wrong. It lives in the
component and not in `file-store.ts` on that store's own rule — writing a bare
token in would mean either synthesising a `text` result (inventing `lines` and
`truncatedLines`, which main alone computes) or teaching the store a second,
partial shape, and both make it an author rather than a cache. The one case the
content key cannot separate is a third party writing bytes IDENTICAL to ours,
where no push arrives either; there the next save refuses as stale, which is
the conservative direction and involves no content difference anyway. **No
automated check covers this**: reproducing it needs a save whose content
matches disk, and the suite's fixtures all change the bytes.

**What M22 did NOT solve, kept honest.** The CAS window is not zero — `statSync`
and the `rename` are two syscalls and a write landing between them is not
caught; closing that needs file locking, which is not portable, against a
window of microseconds. Nothing merges: the choice is reload-and-lose-mine or
overwrite-theirs, because a three-way merge needs a common ancestor this design
does not keep. Encoding is UTF-8 always, inherited from M16's reader — a file
in another encoding already displays as mojibake, and what M22 adds is that
saving makes that corruption permanent. And **both edit-mode exits restore
focus, which no automated check can observe**: DOM focus after an unmount is a
browser default action an untrusted event never performs, the same limit this
file already records for `ReviewNode`'s `closeDraft`.

**One panel kind, two providers, and the result is grouped rather than the item
tagged (`shared/work-item.ts`, `main/github-client.ts`).** M24 is the app's
SECOND tier-2 integration, and it is cheap for one reason worth stating plainly
because it is the whole argument for building integrations in this order:
**M14 already paid for the trust boundary.** The credential store, the refusal
path, the four `credential:*` invokes that return no secret, and the absence of
`credential:get` are all inherited rather than reinvented — this is the first
integration in the app that walks into an existing boundary instead of drawing
one. `verify:meta` 20 and 21 police it as source text, and neither of them
needed an edit.

**Any failed query fails the WHOLE load.** Two questions, one answer: a run
where the first query succeeded and the second returned 500 renders ONE group,
and a user looking at it has no way to know the other query failed — they read
the gap as "nothing is waiting on me". A partial answer presented as a complete
one is the confident-wrong-answer failure this repo refuses everywhere.

**`author:@me` is deliberately not a third query.** Your own open PR is either
assigned to you — the first query — or it is waiting on somebody else, which
makes it their work item and not yours. A third query would add a third failure
path in order to restate a set we mostly already have.

**`isTerminalPanel` had to become a positive partition test the moment a
third kind arrived, and the reason is the DANGEROUS direction a negation gets
wrong (`renderer/panels/panels.ts`).** Until M16 (built and reviewed as "M13"; renumbered on merge — see the
milestone-wide renumbering commit), `Canvas.tsx` spelled "is a
terminal panel" as `!isReviewPanel(p)`, and that was correct with exactly one
non-terminal kind — a negation of the ONLY other possibility is the same
fact as a positive test. With a file panel added, `!isReviewPanel` answers
`true` for it: a file panel has no review subject, so it satisfies the
negation perfectly, lands in `terminalPanels`, reaches `assignTiers` and
`registry.ensure` with no `spec`, and mints a `PanelSession` for a `<pre>` —
burning a `LIVE_BUDGET` slot and a WebGL context on a panel that owns no
process and will error the instant anything reads its absent spec. The fix
is `isTerminalPanel(panel) = !isReviewPanel(panel) && !isFilePanel(panel)` —
still a negation, deliberately, because absence of `kind` must keep meaning
terminal (every `layout.json` written before M9b has no `kind` key at all),
but now a negation of every KNOWN non-terminal kind rather than of the one
kind that used to be the only alternative. `verify:viewport` `80b` is the
check, and it asserts all four shapes in one read — a terminal, a file
panel, a review panel, and a bare kind-less object — because a helper that
got any ONE of the four backwards still looks correct against the other
three. The rule for whoever adds a FOURTH kind is spelled out at the
function's own definition: it is one line to edit, and skipping it repeats
this exact defect through a new door.

**The panel-kind checklist has a measured miss rate, and `KIND_NOUN` is the first
site where tsc enforces it instead of a comment (`shell/rail-rows.ts`'s `railTail`,
`shell/inspector-fields.ts`'s `KIND_NOUN`, `shell/Inspector.tsx`).** Adding a panel
kind means editing roughly two dozen sites across fourteen files, and every one of
them is a hand-maintained if-chain or negation that fails SILENTLY when missed. The
M27 audit measured what that costs: `jira`, the kind added most recently and written
most tersely, was **already wrong at three of them**, and following the fix through
found a fourth that had been wrong since `toolbox` landed.

**Panel ids are one sequence with THREE prefixes now, seeded in the same two
places `nrf` needed after M9b's `r` (`Canvas.tsx`'s `nextIdRef`,
`switchWorkspace`).** `PanelId` doubles as a tmux session name (see "Panel
ids are global, not per-workspace" above), so nothing else may mint an id a
file panel already claims, even though a file panel owns no session to
collide over — the counter is ONE sequence across three kinds specifically
so a bug in a future kind cannot reintroduce the M4a id-collision defect
through the one door that looks safest, "this kind has no process, so its
ids don't matter." A file panel mints `f${nextIdRef.current++}`, beside
`n${...}` for a terminal and `r${...}` for a review node. Both places that
recover the counter from existing ids — the boot-time seed and
`switchWorkspace`'s re-seed on every switch — read `/^[nr](\d+)$/` until this
milestone, and a regex blind to the `f` prefix is blind in the QUIET
direction: it recomputes a max that ignores every persisted file panel, so
the next `Cmd+N`-shaped mint can hand out an id a file panel already owns,
which collides as a genuine duplicate panel id — the same failure
`nextIdRef`'s own comment already documents for the `r` prefix reaching this
door one milestone early. Both sites now read `/^[nrf](\d+)$/`, verified by
grep to be the only two id-scanning regex sites in the file, with zero
survivors of the old two-letter pattern.

**`file-store.ts` is another module-level store, and it must never bump
`registry.version()` — the same rule this file has now stated four times
(`renderer/session/file-store.ts`).** `agent-state-store.ts` and
`live-session-store.ts` both established why: `TerminalPanel`'s `memo` is
gated on `registry.version()`, which deliberately moves only on
tier/status/focus/exit, and anything higher-frequency riding that counter
re-renders every panel on the canvas on every OTHER panel's change — the
60Hz cascade `version()` exists to block. A file's content is the most acute
case yet: it can change several times a second while an agent writes in
chunks, far faster than a bell or a `cd`, so a store that rode `version()`
would turn one agent's fast write loop into a full-canvas re-render storm.
`file-store.ts` is therefore subscribed PER PANEL ID exactly like its two
predecessors, holds a cache of main's answer and never a second author of
it, and its snapshot is the STORED object rather than one built per call —
`useSyncExternalStore` compares by identity, and a fresh object on every read
would make React believe the store changes every render and loop, the same
trap `attentionSnapshot` and `useLiveSession` both already avoid.

**`FileWatchers` has exactly two teardown seams, and they are the same two
`window-lifecycle.ts` already established for a PTY (`main/file-watch.ts`'s
`closeAll()`, `main/index.ts`).** A renderer navigation (`Cmd+R`/`Cmd+W`) does
not run React cleanup, so nothing renderer-side ever calls `file:close` on
its way out — main has to act unprompted, the identical shape as an
abandoned PTY handle. Without a `closeAll()` wired into the same
`did-start-navigation` hook that detaches PTY sessions, every `Cmd+R` leaks
one live `FSWatcher` per open file panel, and it leaks into a MAIN PROCESS
the reload does not restart — the watcher count only grows for the life of
the app, holding callbacks that reference a renderer contents object the
reload has already destroyed. `before-quit` needs the identical call for the
identical reason `shutdown()` exists there: a watcher is a live OS resource,
and quitting without releasing it is relying on the OS to clean up after a
crash rather than an orderly exit. `verify:file` 10 is the unit-level pin
(`closeAll()` really disarms, asserted by writing after the close and
observing nothing arrive, never by reading the internal count alone — a
count that reads zero while the `FSWatcher` stayed alive is exactly the leak
being guarded against), and `main/index.ts`'s two call sites are the same
two lines `fileWatchers.closeAll()` appears on, next to `window-lifecycle.ts`'s
existing PTY teardown and `before-quit`'s existing `shutdown()`.

**`webUtils.getPathForFile` is the only way to resolve a dropped file's path,
because Electron 43 REMOVED `File.path` from the renderer
(`src/preload/index.ts`, `Canvas.tsx`'s `onDrop`).** Reading `file.path` on
the `File` object a drop event hands over used to work and now silently
returns `undefined` — a property that does not exist reads as `undefined`
exactly like a property that is legitimately absent, so there is no
distinguishing failure to notice. The mint is skipped, the drop looks like it
did nothing at all, and nothing throws anywhere: the worst-shaped kind of
regression, because it looks identical to a user simply missing the target
when they dropped. `webUtils.getPathForFile(file)`, exposed through the
preload bridge as `window.canvas.file.pathForFile`, is the supported
replacement — it has to cross the bridge because `webUtils` is a main-process
(technically preload-privileged) API, not something the renderer's sandboxed
context can reach directly. There is no automated check for the real
gesture: a Finder drag cannot be synthesised, because `dataTransfer.files` on
a dispatched event carries no OS-backed `File` for `getPathForFile` to
resolve anything from — the same shape of gap this file already records for
`verify:panels` 32 and the auto-repeat checks. `verify:panels` 134 drives the
mint through the SAME `openFilePanel` function the drop handler calls, via a
test hook (`window.__m13Open`), which proves the rest of the pipeline and
proves nothing about the drop itself; the drop must be verified by hand once
and not read as checked until somebody has.

**The inspector's file arm ships two fields, not the design spec's original
six.** The design spec proposed path, directory, size, line count,
last-modified and current state; the implementation plan and the shipped
`buildInspectorModel` narrowed that to `file` and `directory`. This was a
deliberate scope decision made when the plan was written, not an oversight —
a future reader comparing the spec to the code should not mistake the smaller
field set for a missed requirement.

**The merged view has no writer, and that is why geometry is read-only (`Canvas.tsx`'s
save effect, `LayoutStore.mergedWorkspaces()`).** There is exactly one channel into this
feature — `workspace:merged`, a READ — and `panels` remains the only array `layout.save`
ever writes. That asymmetry is the mechanism, not a scope decision made twice: a lane
offset exists for one render, so a merged panel's `rect` is SYNTHETIC while its id, spec,
title and kind are the panel's own (which is what lets the registry, agent state, the edge
pips, the rail and the inspector all work on a foreign panel with no code of their own).
Persisting one of those rects produces a perfectly well-formed `layout.json` holding
display offsets, discovered launches later as every workspace's panels having drifted a
lane's width sideways, with nothing to blame — the file is valid, the schema accepted it,
and the code that wrote it is the ordinary save path. Three things hold the line. The store
hands back COPIES rather than the live snapshot (`verify:layout` 130, and its shallowness
is stated there rather than hidden). The drag, resize, close and marquee gestures are all
gated on `mergedRef`, and the MOVE verb refuses on it too rather than only its palette rows
going disabled — a disabled row is an affordance, and the verb has to be the authority.
And the save effect, while merged, feeds on a `preMergeRef` snapshot for the camera and the
selection, because capture-and-restore alone is not enough: `before-quit` flushes the last
save, so a quit taken WHILE merged has no next save to correct it and would open the next
launch onto empty lane-space with a foreign `selectedId`. `verify:panels` 150 reads the
screen and 151 reads the STORE, and 151's ADDED-id and workspace-appeared clauses are the
check — its first form iterated only ids already present and was blind to its own headline
failure.

**...and the refetch is keyed on WHICH WORKSPACES EXIST, not only on this canvas's panel
count (`Canvas.tsx`'s `workspaceListSignature`).** The paragraph above turns on nothing
being able to reach `registry.ensure` for a panel this canvas should not spawn, and the
refetch effect keyed on `[merged, panels.length, resolveDormant]` left one door open — the
worst thing in the branch. A workspace MUTATION changes no panel on this canvas, so
deleting a NON-ACTIVE workspace while merged fired nothing at all: its lane kept rendering
panels whose sessions had just been disposed, and a lane on screen is CLICKABLE, because
`hitOrder` is built from `displayPanels`. Clicking a ghost runs `onSelectPanel`, which
clears dormancy and calls `registry.ensure` — which MINTS A FRESH SESSION for an id no
workspace holds any more — tiering promotes it and `attachSlot` spawns: an agent under a
deleted workspace's panel id, reachable from no UI ever again, from one click. That is the
"no path may spawn a process without a user gesture" rule broken through a door no
per-task review could see, and the click that reaches it is not even a gesture aimed at
starting anything. Create and rename leave the same lane stale, cosmetically.

**A move touches no session and pushes no history — and the second half is the one the
plan got wrong (`Canvas.tsx`'s `movePanelsToWorkspace`).** The first half is the easy one
to state and the easy one to check: moving panels between workspaces is a records
operation, so the move loop contains no `registry.dispose` and the panel's pid is unchanged
on the other side. `registry.dispose`'s five call sites in `Canvas.tsx` and `pty.kill`'s two
callers in `session-registry.ts` are both UNMOVED by this milestone, which `verify:panels`
94 pins by reading the source text; fault injection put a `dispose` into the move loop and
ONLY `verify:panels` 145 (`n106: -> MISSING`) and 94 (`disposes=6`) went red, with every
other check in the suite green — which is the whole argument for 145 existing.

**The workspace chords match `event.code`, never `event.key` (`useViewport.ts`).** Shift
REWRITES the printed character: `Cmd+Shift+]` arrives as `key === '}'` and `Cmd+Shift+[` as
`'{'`, exactly as `Cmd+Shift+\` arrives as `'|'` — the rule `useShellChrome.ts` already
obeys and `verify:panels` 80 already pins. So a `key === ']'` test is dead on arrival, and
that is the HARMLESS failure: no such key is ever delivered under Shift, so it never works
for anybody and someone notices immediately. The failure worth guarding is `key === '}'`,
which is correct on the US layout of whoever wrote it and silently dead on every layout
that prints `}` somewhere else — a chord that works perfectly for its author and does
nothing at all for a German or French user, with nothing in any log. The three chords sit
ABOVE the general auto-repeat bail rather than in the switch below, so each can
`preventDefault` BEFORE declining a repeat: the modifier checks above reject chords that are
NOT ours, while the repeat bail rejects one that IS ours and which we are declining to act
on, so the tail of a held chord must still be swallowed rather than leaking to the focused
agent's PTY (the ordering `usePalette.ts` already uses). `verify:panels` 152 holds the rule
in a CHECK rather than in this comment, and only because it sends a THIRD press —
`{ key: '*', code: 'BracketRight' }`, which is how a German layout delivers that physical
key. The implementer's own report recorded the gap as unclosable on the grounds that no
synthetic event can reproduce another layout; that reasoning was wrong and the review
corrected it in the check's favour — the harness constructs the event and can supply any
`key` it likes. Injected, a `key === '}'` implementation passes both US presses and fails
only the foreign-layout clause.

**A move captures `focusedId` BEFORE its await, and that is a live instance of the rule the
marquee entry argues (`Canvas.tsx`'s `movePanelsToWorkspace`).** The id is read out of the
closure rather than out of `focusedIdRef` after the `await`, so focus moving onto one of the
moved panels DURING the IPC round trip leaves `focusedId` naming a panel this canvas no
longer holds — and `assignTiers` pins the focused panel live unconditionally, so that is a
`LIVE_BUDGET` slot and a WebGL context held for the rest of the run, by a panel with no rect
and no row anywhere on screen. It is exactly the failure "The marquee starts only where
`hitTest` finds nothing" makes its centrepiece, two entries up, reached through a door that
entry does not cover; recording the rule and omitting a live breach of it would be worse
than recording neither. The window is one IPC round trip and needs the user to click into a
moving panel inside it, so it is narrow rather than impossible. `restartPanel` and
`openReview` both already re-read across their own awaits for the same class of reason (see
"`openReview` re-reads its subject after the await"), and the fix here is the same shape: read
`focusedIdRef.current` after the await rather than the closure's copy. Left for a scoped
follow-up rather than taken in a documentation task. A second, smaller residual sits beside
it: `dormantIds` is not pruned of the moved ids either, which is harmless today but is state
naming panels this canvas does not hold.

**What M18 did NOT solve, kept honest.** Four things, each a deliberate stop rather than an
oversight. **A selection cannot span workspaces, but that is structural rather than
asserted.** The marquee is gated off in the merged view and there is no other way to build
a multi-selection, so the property holds — but `workspace:move-panels` takes a list of ids
and does not assume it, so a future caller could violate it and no check would say so.
**Nothing reads `REASON_MERGED_READ_ONLY`.** The constant is exported and nothing imports
it, so neither half of the merged-mode gate on the move verb is exercised by anything. It
is a coverage gap rather than a defect. Its own comment used to claim a check compared
against it, which was false in the tense it was written in; it now says what is true — the
export is what makes writing that check a one-line import rather than a temptation to paste
the sentence. **Clicking a
foreign panel raises it and pushes a NO-OP undo entry.** `selectAndRaise` computes
`alreadyTop` from `panels`, which does not contain a foreign id, so `raisePanel` returns a
fresh identical array and `commitHistory` pushes an entry every time — after leaving the
merged view, several `Cmd+Z` presses do nothing at all. **Entering the view relocates the
ACTIVE workspace's panels to lane coordinates without moving the camera**, so the user's own
panels appear to jump. That is `mergedLayout`'s given behaviour and the spec's "no merged-view
camera of its own" was never given a check; a framing transition on entry is worth its own
task rather than a line here.

**The session id is persisted, never re-minted (`pty-manager.ts`'s `create`,
`layout-store.ts`'s `setSession`/`session`/`dropSession`).** `create()` runs
again on EVERY reload — main's `PtyManager` is a module-scope singleton that
survives a renderer reload untouched — and under tmux `new-session -A`
reattaches rather than creating, so the agent process is not re-run at all; a
fresh `randomUUID()` on that second call would pass `--session-id` to nobody,
because the flag only matters at the ONE moment the process actually starts.
The mint is therefore READ-then-mint: `pinnedSession(panelId)` is consulted
first, and only an absent answer mints and stores one. Get this backwards and
the failure is total and silent — a re-minted id names a transcript file that
does not exist, the agent's REAL transcript goes on growing under its original
name, and the panel's cost freezes at whatever it read before the reload,
forever, with nothing in any log. Deriving the id from the panel id instead —
tempting, since `PanelId` is already the tmux session name — is worse for a
reason `--session-id`'s own semantics create: passing an EXISTING session id
is a RESUME, not a fresh start, and panel ids are recycled (`onReset` installs
`firstRunPanels()` at the constant `FIRST_RUN_ID`), so a panel reusing a dead
one's id would resume a stranger's conversation rather than starting its own.
`verify:pty-manager` 28 is the reused-mint half, driven through a real
`create()` called twice at one id; `verify:layout` 121 is the storage half —
the pin surviving a write and a reopen through the real coalesced store — and
122 is `dropSession`, the same recycled-id hazard `dropBaseline` and
`clearLiveSession` each close on their own doors.

**`detachAll()` clears the cached transcript path and NOT the totals
(`pty-manager.ts`).** A `Cmd+R` reload detaches the local tmux client but the
session — and the agent inside it — keeps running and keeps writing to the
same transcript file, so the accumulated totals and the byte offset are still
correct: re-reading from zero would double-count every turn already folded in
before the reload. The cached PATH is dropped anyway, because it is cheap to
re-resolve on the next poll and is the one thing here that COULD actually be
stale (a rotated transcript, however unlikely) — clearing it costs one extra
`readdirSync` glob, keeping it risks a silent misattribution. This is the
`lastLive`/pin pair's mirror image, and each is wrong in the OTHER direction
if swapped: `lastLive` (the live-cwd cache) is cleared here because the local
value goes stale across a detach while the pin survives because the tmux
session and its id both survive — see "The session id is persisted" above.
Clearing the pin here would re-mint on the next `create()` for the reason
already stated; NOT clearing the transcript path risks nothing catastrophic,
only a stale re-read that a later poll self-corrects — which is exactly why
it is the one dropped for tidiness rather than kept for correctness.

**Zero and unmeasured are different facts (`shell/inspector-fields.ts`'s
`buildUsageFields`).** THREE states, not two, mirroring M9a's
`not-a-repo`/`never-started` split in a second section. No pin renders
NOTHING — a login shell can never have a cost, and "$0.00" beside one is a
confident wrong answer for a panel this feature will never account for.
Pinned but nothing read yet renders a NOTE, because that is the true state of
every panel for the first seconds of its life and an empty section there
reads as broken rather than as "give it a moment". Only actual totals render
figures. Collapsing the first two into one "hidden" state would mean a
newly-spawned Claude Code panel shows nothing at all where a login shell also
shows nothing at all — two different facts wearing one signal, the exact
failure `baselineOf(panelId) === undefined` was caught wearing before M9a's
final review split it. `verify:rail` 81 asserts all three arms in one read.

**`usage:panel` is an `IPC_EVENTS` send, so `verify:ipc` stays at 38.** The
poller has no reply to wait for and no caller to answer — main reads a
transcript on its own tick and fans the result out — so `usage:panel` needs no
`ipcMain.handle`, and `verify:ipc`'s "every channel has a handler" check does
not, and should not, cover it. This is the **fourth** time this exact boundary
has been recorded, and worth naming plainly because the temptation is the
same each time: M6d's attention set could have been a query main answers and
instead is derived entirely from `agent:state` messages the renderer already
has; M12's `session:live` is the direct precedent for this one — a send,
counted by nothing, for a fact only main can observe; M15's `subagent:state`
is the same shape again, unmoved for the same reason; and M17 repeats it a
third time rather than inventing a query. An earlier spec for one of those
milestones stated the wrong post-milestone channel count, which is why this
file states the reasoning rather than only the number.

**The transcript path is globbed, not rebuilt (`transcript-reader.ts`'s
`resolveTranscript`).** The filename under `~/.claude/projects/*/` IS the
session id (`<uuid>.jsonl`) and a session id is unique, so finding it needs no
knowledge of Claude Code's own directory-slug rule — an undocumented detail of
another program's layout that can change in a point release with nothing here
to notice. It is also immune to ideas-backlog #41's live-cwd problem by
construction: a cwd-derived path goes stale the moment a panel `cd`s, exactly
as review's baseline resolution does today, but the transcript file stays
wherever Claude Code created it regardless of where the panel's shell wanders
afterward, so a glob keyed on the id alone never needs a live cwd to stay
correct.

**A third tick, not a merge (`pty-manager.ts`'s `USAGE_TICK_MS`).**
`IDLE_TICK_MS` (500ms) is not a cost to amortise, it is the RESOLUTION of
M6c's `agent.idleAfterMs` threshold — folding a transcript read onto it would
put disk IO on the 500ms path for a number that changes once per agent turn,
and folding the usage read onto the IDLE tick's own period the other way
would make idleness detection four times coarser, silently, while the setting
went on reading whatever the user set. `LIVE_TICK_MS` (2000ms) happens to
share USAGE_TICK_MS's period, which makes it the more tempting merge — but a
`tmux list-panes` subprocess and a local file read are unrelated cadences that
would be coupled for no benefit; they merely coincide today, and a future
change to either has no reason to keep them in step. Three ticks, one manager,
each owning a cadence nothing else may borrow.

**The one unverified link: `--session-id <uuid>` causing Claude Code to write
`<uuid>.jsonl` has never been proven by anything repeatable.** It is verified
by observation on one machine, on one version of Claude Code, on 2026-08-30 —
the same standing this file already gives `verify:panels` 32's default-preset
push, the auto-repeat checks' `isAutoRepeat` modifier, and M11's `keyup`/`Meta`
link. No check in `npm run verify` spawns a real `claude` process; `verify:usage`
drives the parser and the accumulator against a hand-built fixture line, and
`verify:pty-manager` 28–31 drive the pin and the tick against a fake transcript
this harness writes itself. If a future Claude Code release changes that
filename rule — namespaces it under the directory slug instead, adds a suffix,
stops honouring the flag at all — every one of those suites stays green, and
the feature goes on reading `resolveTranscript` returning `undefined` forever:
not an error, not a warning, just a Cost section that never leaves its "waiting
for the first turn" note for any panel, on any machine, from that release
onward. It needs a hand on a real `claude` invocation once, watched writing to
`~/.claude/projects/*/<uuid>.jsonl`, and must not be read as checked until
somebody has done it.

**Every file row mounts `shellControl`, and here that is not a convention
(`shell/FileTree.tsx`).** Every clickable control in the shell mounts
`shellControl(...)` — the rail rows, the zoom cluster, the rail's own workspace
verbs — and until this milestone that was a consistency rule: losing it made a
control merely bad, since DOM focus moving off the running panel meant the
next keystroke went nowhere until the user clicked back in (see "A shell
control never takes DOM focus" above). A file row is the first control in this
app where losing it is FATAL rather than merely bad, because the row's entire
job is to act on the panel the click is about to unfocus: a directory row
toggles, and a file row calls `insertPath`, which reads `focusedIdRef.current`
and pastes into whatever panel DOM focus names at that instant. A row that
stole focus to itself would read its own click back as the paste target — a
panel with no PTY at all — and the symptom is "clicking a file does nothing",
with no error anywhere to point at the missing `preventDefault`.
`verify:panels` **157** is the check, and it is the only one in this milestone
that cannot be written with a dispatched event, for check 75c's reason: a
synthetic `MouseEvent` is `isTrusted: false` and Blink runs no default focus
action for one, so a dispatched version of this check would pass identically
against the very regression it exists to catch. Confirmed by fault injection:
deleting `shell-control.ts`'s `onMouseDown: preventDefault` line turns 157 red
— and takes the pre-existing check 75c down with it, since both controls
depend on the identical guard.

**A filename is a wider door than a title
(`shell/file-tree-model.ts`'s `treeSignature`).** `railSignature`'s own entry
states the rule this one inherits: `JSON.stringify` over the rows, never a
separator-joined concatenation, because a label free to contain the separator
can forge a field boundary and collapse two different lists into one string,
freezing whichever memo is keyed on it. A filename is the SAME hazard through
a WIDER door. A panel's title is USER text — the person using this app has to
type it themselves, into a rename prompt this app controls. A filename is
AGENT text — written by whatever CLI is running in the panel, into a directory
this app does not own, with no rename prompt and no typing required from the
person looking at the tree. `verify:rail` **91** is the check the whole claim
rests on, and its fixture is a genuine multi-row collision constructed by
hand rather than argued: one tree with a single row named `a|0|file;b` and a
second tree with two ordinary rows named `a` and `b` produce byte-identical
output under the naive scheme
`` rows.map(r => `${r.name}|${r.depth}|${r.kind}`).join(';') `` — a filename an
agent can write with nothing more exotic than a semicolon and a pipe. A
single-row fixture cannot exercise this at all, because one row's name
differing from another's produces distinct output under nearly any scheme,
safe or not; it took a second row for the collision to become real.
`JSON.stringify` tells the two trees apart where the naive join does not, and
`treeSignature` is what `Canvas.tsx` freezes `treeRows` on — without it, an
expand or a re-root reconciles nothing and the tree renders whatever it
rendered first, forever.

**Its failure has no runtime symptom, which is why it is written as a rebuild
rather than defended by a check alone.** Write `{ ...raw }` in
`projectMcpServer` and the app works exactly as it does now — better, in fact,
since the row would carry more — and the renderer, the process that also holds
every byte of agent output, an undo stack, a DOM and a serialisable app state,
is quietly holding an API key. That is `credential-store`'s `list()` bug one
hop away, and it is why every one of these functions rebuilds its object FIELD
BY FIELD and never spreads: the same rule `parseMeta`, `pollLive`'s record map
and M5a's absent `command` already obey, here for the sharpest reason of the
four. `verify:toolbox` 11 asserts on the returned object's own KEYS rather than
on a value, because a spread that carried the secret through satisfies any
assertion phrased about the value; 12 is its over-correction guard, since 11
alone is satisfied by a projection that returned nothing.

**`readClaudeJson` is an ALLOWLIST of four paths, and the argument is a
measurement rather than a principle (`main/toolbox-scan.ts`).**
`~/.claude.json` is 93 KB with 87 top-level keys and one entry per project. The
four paths read are the global `mcpServers`, this cwd's own `mcpServers`, and
this cwd's two toggle pairs. Nothing else — not `oauthAccount`, not `userID`,
and emphatically not `projects[otherCwd]`, which is the user's whole working
layout and is not a fact about one panel.

**`SETTINGS_MAX_BYTES` is 1 MB and must never be `MAX_PROMPT_BYTES`
(`shared/toolbox.ts`).** Measured 2026-08-30: `~/.claude/settings.json` is
**64,152 bytes**, and `MAX_PROMPT_BYTES` is 65,536. Reusing `prompts.ts`'s cap
here — the obvious move, since that is this repo's existing reader of a
directory it does not own — would put the single most important file in this
feature 1,384 bytes from being refused, on a file that grows every time the
user grants a permission. And the refusal is not loud: it reads exactly like
"you have no hooks and no permissions". This is the one cap in the repo that is
deliberately NOT inherited from its obvious neighbour, and `verify:toolbox` 36
pins the relation rather than the number, so a future edit that lowered it goes
red for the right reason.

**Pull, not push — and `FileWatchers` was the wrong tool rather than merely
unbuilt (`IPC.TOOLBOX_READ`, `main/toolbox-cache.ts`).** M16's `FileWatchers`
is keyed by PANEL ID, which is exactly right for a file panel (one panel, one
path) and exactly wrong here: half of this feature's sources —
`~/.claude/settings.json`, `~/.claude.json`, `~/.claude/skills`,
`~/.claude/commands` — are shared by EVERY panel on the canvas, so twelve
panels would arm twelve watchers on the same four paths and emit twelve reads
and twelve IPC messages for one save. Doing it properly needs a PATH-keyed,
refcounted registry, which is a different class of machinery and its own
milestone. So there is no `toolbox:changed` event and no watcher at all — the
node re-reads on mount and on its own refresh control, exactly as a review node
does, and backlog #19 already declined a watcher there for a related reason.

**What makes that honest rather than merely stale is `readAt`, and it is
RENDERED.** A pull model that did not say when it last looked would be a node
confidently showing a config that changed an hour ago. The same discipline that
makes M17's dollar figure name whose price it is.

**The cache is keyed by RESOLVED CWD, never by panel id
(`main/toolbox-cache.ts`).** Twelve panels in one repository share one answer,
and keying by panel would parse the same 93 KB `~/.claude.json` twelve times to
produce twelve identical objects. `spawnStamps` is deliberately NOT part of the
key: it changes the `freshness` arm and nothing else, so a cached inventory is
reused and its freshness recomputed against the stat sweep already in hand.

**The WORDING of the `stale` arm is the design, and it is what stops this being
a wrong answer.** It says "config on disk has changed since this panel
started", naming the files, and never "your agent is missing X". Two reasons it
must not say the stronger thing: an mtime bump with no semantic change (a
formatter, an editor's save-on-focus-loss) would report stale when nothing
moved, and some config genuinely IS re-read mid-session. A fact about FILES is
defensible; a claim about a running process is not. **And it offers no restart
button.** The backlog entry worried that a config UI would be the feature that
quietly introduced restart-in-place; M8c shipped `restartPanel` for its own
reasons, so the worry no longer applies — but offering it *here* would make
killing a working agent one click away from an mtime, which is why the
freshness arm states a fact and stops.

**`isTerminalPanel` gained its FOURTH negation, and M19's Jira panel had
already broken the id-prefix rule this milestone had to fix
(`renderer/panels/panels.ts`, `Canvas.tsx`'s `nextIdRef`).** The partition line
is now `!isReviewPanel && !isFilePanel && !isWorkPanel && !isToolboxPanel`, and
the failure a missed clause produces is unchanged from M16's own entry: a
toolbox panel satisfying the negation lands in `assignTiers` and
`registry.ensure` with no spec, minting a `PanelSession` and burning a
`LIVE_BUDGET` slot and a WebGL context on a `<div>` that owns no process.
`verify:viewport` 92 asserts FIVE panels in one read — a terminal, a bare
kind-less pre-M9b object, a file panel, a review panel and a toolbox panel —
because a helper that got any ONE of them backwards still looks correct against
the other four, and the two that must read TRUE are as load-bearing as the
three that must read false. Fault-injected: dropping the toolbox clause turns
92 alone red.

**The id-prefix half is a bug M21 found rather than one it introduced.** A
toolbox panel mints `t${n}` off the one shared counter, and the two sites that
recover that counter from existing ids had to widen their regex — but they read
`/^[nrf](\d+)$/`, and **M19's Jira panel had already been minting `j${n}` into
a counter blind to it.** A regex blind to a prefix is blind in the QUIET
direction: it recomputes a max that ignores every persisted panel of that kind,
so the next mint can hand out an id one of them already owns, which collides as
a genuine duplicate panel id — React keys collide on it today and `parseLayout`
drops it silently at the next load. Both sites now read `/^[nrfjt](\d+)$/`,
which closes M19's gap and M21's in one edit. `PanelId` doubles as a tmux
session name, which is why this counter is ONE sequence across five kinds even
though three of them own no session: so a bug in a future kind cannot
reintroduce the M4a id-collision defect through the door that looks safest,
"this kind has no process, so its ids don't matter."

**M24 widens it again to `/^[nrfjtw](\d+)$/`, and the `j` is the half worth
knowing about.** A work panel mints `w${n}`, so `w` has to join. But `j` must
stay in that class FOREVER even though nothing mints a `j` id any more: every
`layout.json` written between M19 and M24 holds Jira panels with `j`-prefixed
ids, and `parsePanel` migrates their KIND without renaming them — an id is
also a tmux session name, so rewriting one on load would be a rename with no
way to tell what it used to be. A seed regex that dropped the retired prefix
would recompute a max blind to every one of those panels and hand out a
duplicate at the next mint, which is the same QUIET failure this entry already
records twice. **The rule for whoever retires a prefix: a prefix that has ever
been persisted is never removed from the seed's character class, only from the
mint.**

**The toolbox node is a SECOND reader of `ToolInventoryResult`, and it differs
on exactly one decision (`renderer/toolbox/toolbox-node-model.ts` versus
`buildToolboxFields`).** This repo's usual rule is the opposite one — see "One
predicate for 'running'" and "One waiting count" — so the divergence needs a
reason, and it is the same one `review-node-model.ts` already records against
`buildReviewFields`. The pane is a strip inside a 260px column that must VANISH
when it has nothing to say; a node is a panel the user deliberately opened,
placed and dragged, and one that renders nothing at all is indistinguishable
from a broken one. So `no-cwd` is HIDDEN in the pane and RENDERED in the node,
and `verify:rail` 97 is the only check that separates the two — fault-injected
by making the node's arm behave like the pane's, which turns 90 alone red.

**A hook row renders a COORDINATE, never a synthesised name
(`toolbox-node-model.ts`).** A hook has no name and no description — its
identity is which event, which matcher, which slot — and the tempting fix is to
render `PreToolUse #2`. That is a coordinate wearing a name, and a fabricated
name in a searchable list starts matching queries it has no business matching,
which is the rule `Command.waiting` already states for a count. `verify:rail` 100 pins that a matcherless hook renders its EVENT and nothing invented.

**`toolbox-store.ts` is another module-level store, and the rule is unchanged
for the sixth time.** Module-level, subscribed PER PANEL ID, over a cached
snapshot, and it **must never bump `registry.version()`** — the counter
`TerminalPanel`'s `memo` is gated on, which deliberately moves only on
tier/status/focus/exit. A toolbox answer is LOWER-frequency than any of its
five predecessors, which is exactly why the temptation to "just" reuse the
counter is strongest here and would be no less wrong: riding it re-renders
every panel on the canvas on every OTHER panel's change. It is cleared at all
five of `Canvas.tsx`'s panel-removing sites, beside `clearFileResult`, or the
map grows for the life of the renderer and a recycled panel id inherits a dead
node's inventory.

**A toggle naming something this app never read is reported as a NAME, never
invented as a row.** Measured: `disabledMcpServers` names a connector that
appears in no `mcpServers` map anywhere on the machine, and 26 `skillOverrides`
keys are namespaced plugin ids (`paul:add-phase`) that no filesystem skill
directory can yield. "6 skills are turned off that this app did not read" is
true and actionable; a row pointing at a file that does not exist is not.

**Frontmatter is hand-rolled, and a real YAML parser is refused twice over
(`toolbox-scan.ts`'s `parseFrontmatter`).** `dependencies` is
`{"node-pty": "1.1.0"}`, and `file-watch.ts` already recorded this repo's
refusal to add a second runtime dependency — but the sharper reason is a PARSER
DIFFERENTIAL: this app rendering what `yaml` says while the CLI renders what
its own parser says is a worse failure than not reading a field, because it is
invisible. So the grammar is deliberately small, and anything it does not
understand (a block scalar, an anchor, a multi-line fold) yields `''` rather
than a guess. `verify:toolbox` 3 pins that `description: >` answers null rather
than the indicator, and 4 pins that an unclosed fence does not swallow the
file.

**Commands are namespaced TWO levels, and `prompts.ts`'s one-level rule would
have missed 27 of 28.** Measured on this machine: 28 user commands, 27 of them
under a namespace directory, and `commands/paul/plan.md` carries
`name: paul:plan` in its own frontmatter — so the naming rule is confirmed
against the format rather than inferred from it. Two levels is a deliberate
widening of prompts.ts's rule and stops there: an unbounded walk over a
directory this app does not control is a bigger promise than any milestone here
has made.

**The agent knobs are ONE record, and the count of copy sites is why
(`shared/cost.ts`'s `AgentOptions`, and the nine places that rebuild a spec).**
M20 adds a permission mode, an effort tier and a model to a panel. Three
optional fields would be three conditional copies at each of the nine sites
that rebuild a spec or a preset field-by-field — `parsePanel`, `parsePreset`,
`templateOf`, `presetFromCapture`, `toPanels`, `fromPanels`, `Canvas.tsx`'s
template->spec and spec->`CapturedPanel`, and the `pty.create` payload —
twenty-seven places for an optional key to vanish, and `tsc` says nothing at
any of them because every one is legally optional. One record makes it nine,
and the absent-vs-`undefined` trap `presets.ts` already warns about has to be
got right once instead of nine times. **`templateOf` proved the point while
this was being written**: it declares its parameter as an inline structural
type rather than as `Preset`, so it is a TENTH site, and it surfaced only
because the new field is READ there rather than spread.

**Mode and effort are closed unions; `model` is an open string, and the
asymmetry is principled rather than inconsistent (`MODEL_PATTERN`).** Dropping
an unrecognised mode falls back to the CLI's own default, which is MORE
restrictive, never less — so a drop can only tighten, and a permission value
carried through verbatim because we did not recognise it is the one failure
this feature cannot accept. A closed model list, by contrast, rots the day a
model ships, and `pricing.ts` already sets this repo's posture for a model it
does not recognise (answer undefined, never a plausible wrong number).

**`agentArgs` is pure, and it is a FAITHFUL extraction — the copy was a
regression (`main/agent-args.ts`).** It is its own module for the reason
`tmux-args.ts` is: an argv builder importing neither `node-pty` nor `electron`
is checkable with no real `claude` on PATH, and a check that shelled out to
one would skip on every machine without it and quietly stop existing. Two
rules it inherits from the `--session-id` block it grew out of: it is **gated
on `spec.agent`, never on the knob** (appending a flag to a command the user
typed is the move `resolveCommand` deliberately refuses, so a knob on a
login-shell panel emits nothing at all), and **a user-supplied flag wins per
flag** (`claude` rejects a duplicated flag outright rather than ignoring it,
so a second `--permission-mode` does not override anything, it stops the panel
starting).

**No per-agent capability table, and the trigger for building one is written
down (`AGENT_FLAGS`).** `AgentKind` has one member, so a table would have one
row, one consumer, and would still leave exactly the one `spec.agent === 'claude-code'`
branch it claims to remove — the customer-free abstraction `AgentKind`'s own
comment declines by name, and the same one `ideas-backlog.md` #11 warns about
and `SettingDef['type']`'s deleted `'enum'` member already records. **Build it
when the second `AgentKind` lands, and not before.** `AGENT_FLAGS` is typed
with a `-?` mapped type so a knob added to `AgentOptions` without a flag
spelling is a compile error rather than a silent no-op.

**Only `permissionMode` reaches the chrome.** Effort and model change what an
agent costs and how well it does; a permission mode changes what it is allowed
to DO to the user's machine, and `bypassPermissions` on a panel scrolled off
screen is the one fact a canvas built to hold unattended panels must never
make somebody hunt for. An absent knob renders NOTHING rather than the word
"default" — the Cost section's own three-state rule, and the reason a login
shell shows nothing here instead of a confident nothing-in-particular. The
built-in preset is `plan` and **never** `bypassPermissions`: a built-in ships
to everyone and is the one a new user is most likely to try, so the one that
comes in the box is the one that CANNOT write.

**One row per VALUE, not a `SettingDef`.** A multi-valued choice expressed as
N command rows inside a palette scope needs no `SettingDef['type'] = 'enum'`,
so that deliberate deletion stays deleted. These are per-PANEL anyway, so a
global setting would have been the wrong shape even if the type existed.
`PanelRow.agent` is REQUIRED rather than optional for the reason
`PanelRow.restartable` states one field up, and it paid for itself
immediately: making it required turned "every mode row is silently
always-disabled" into two compile errors at the one place that builds the
rows. `verify:palette` 81-82, and 82 pins THREE distinct blocked reasons
rather than two collapsed — the third is this verb's own, since `agentArgs` is
gated on `spec.agent` and a mode row on a login shell would promise a flag
emitted nowhere.

**M20 added no IPC channel: `verify:ipc` stays at 41.** The knobs ride inside
`PresetTemplate` and `CanvasState` exactly as `agent` does. This is the fifth
time this boundary has been reached and declined (M6d's attention set, M7's
waiting counts, M12's `session:live`, M15's `subagent:state`), and it is worth
naming because the temptation recurs: a per-panel agent setting sounds like
something main should own, and main already receives everything it needs
inside a payload that was crossing anyway.

**One consequence to know before it reads as a bug.** Choosing a `--model`
outside `MODEL_RATES` makes M17's Cost section go quiet — correct, since
`costOf` answers undefined rather than a plausible wrong number, but
surprising, because the user's own choice is what silenced it.

**The flag list is measured, and no suite checks it.** `--permission-mode`,
`--effort` and `--model`, and their accepted values, were read off
`claude --help` on 2026-08-30 on one machine on one CLI version. `pty-manager`
refuses to append a flag to a command the user typed precisely because a flag
the CLI has never heard of fails the spawn OUTRIGHT rather than being ignored
— so a release that renames a mode turns every panel using it into a panel
that will not start, and every suite here stays green, because they all drive
`agentArgs` against a fixture rather than a real `claude`. This has the same
standing as M17's `--session-id` filename rule and `verify:panels` 32's
default-preset push: it needs a hand on a real invocation once, and must not
be read as checked until somebody has done it.

## Draft entries whose named symbols no longer exist

Not folded: each names a module, channel or field that M25–M90 renamed or removed. The lead is kept so a reader who remembers the rule can find its successor in the main file.

- The plain-node verify bundles now configure a `@shared` alias
(`verify-viewport.cjs`, `verify-registry.cjs`, ` — names verify-registry.cjs, verify-file.cjs, verify-merged.cjs
- Hidden at rest is two rules, and shipping one is the bug
(`Command.hiddenAtRest`). — names Command.hiddenAtRest
- Escape is two-stage, and the drill-in is declarative (`Palette.tsx`). — names Command.entersScope
- Under tmux, `PtyManager` never sees the agent's own OSC title, and the trap is
unreachable there (`main/agent- — names bell-action, visual-bell, set-titles
- The agent-state channel must never bump `registry.version()`
(`renderer/session/agent-state-store.ts`). — names IPC.AGENT_STATE
- M6d added no IPC channel (`agent-state-store.ts`). — names agent:state-snapshot
- A dispatched `MouseEvent` cannot test focus behaviour. — names webContents.sendInputEvent
- `refused` and `failed` split POSITIONALLY, not by reading git's text. — names hook-failed
- The overlay takes no DOM focus, so it claims keys in the capture phase
instead. — names AT_TARGET
- The inspector is the only surface that acts on a link, and its incoming rows
address the OTHER panel as `from` — names InspectorModel.links
- `LinkSegment.key` carries both ids AND their order, space-joined
(`link-geometry.ts`). — names LinkSegment.key
- A claim follows the panel's slug, and nothing else re-derives it
(`subagent-watch.ts`'s `PanelState.slug`). — names PanelState.slug
- The ambiguity line's count is derived, never the literal `2`
(`subagent-scan.ts`'s `slugSharing`, `SubagentUpd — names SubagentUpdate.sharing
- M22 was built and reviewed as "M17", and renumbered on merge — names m17
- A truncated file is READ-ONLY, and the pencil says so rather than vanishing
(`file-node-model.ts`'s `editable` — names FileResult.content
- `WorkItem`'s six fields SURVIVED a second provider unchanged — names WorkListResult
- A panel cannot switch provider. — names WorkPanel.provider, WorkNode
- The 403 split is not defensive, it is the only thing separating two different
fixes. — names x-ratelimit-remaining, WorkResponse, verify:work
- M24 added no IPC channel: `verify:ipc` stays at 45. — names work:list
- What no suite here proves, and must not be read as proven. — names work:list, verify:work
- The M24 hand-check is OUTSTANDING as of 2026-08-30, and must not be read as
done. — names work:list
- Four token classes, never two (`shared/cost.ts`'s `TokenTotals`). — names PanelUsage.byModel
- The carry buffer is the parser's whole correctness (`usage-parse.ts`'s
`ParsedChunk.carry`). — names ParsedChunk.carry
- Dropping MCP `args` entirely is the right SECURITY trade and possibly the
wrong PRODUCT one, and that is recor — names toolbox:mcp-detail
- Three answers, never two, in three separate places (`shared/toolbox.ts`). — names SourceRead.status
- `configStampedAt` is captured at SPAWN because it cannot be recovered
afterwards (`pty-manager.ts`). — names configStampedAt
- Three resolution unknowns are answered `unknown` rather than guessed, and
that is the milestone's whole honest — names permissions.allow
