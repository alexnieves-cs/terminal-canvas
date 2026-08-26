# M5c: Packaging — Design

**Status:** approved, not yet implemented
**Predecessor:** `2026-08-25-m5b-command-palette-design.md`

## Goal

Turn the repo into a `.app` that opens by double-click.

Everything through M5b runs exactly one way: `npm run dev`, under
`electron-vite`, from a terminal. That is not a distribution gap so much as a
**verification** gap, and the distinction is the whole reason this milestone is
architectural rather than a config file. Two of the load-bearing workarounds in
this codebase exist specifically for conditions that `npm run dev` cannot
produce:

- `shell-env.ts` opens with "macOS GUI apps are launched by launchd, so they
  inherit a bare PATH and no dotfile exports." Under `npm run dev` the app
  inherits the *developer's* terminal environment, where `claude` is already on
  `PATH`. The bare-PATH branch that module exists to handle has therefore never
  actually been taken.
- `tmux-probe.ts` resolves tmux by absolute path for the same reason, and says
  so: "the same defect `shell-env.ts` exists for."

Both are written correctly. Neither has ever been *observed* working, because
the failure they prevent has never been reachable. Packaging is what makes it
reachable — and a check that launches the packaged binary with a stripped `PATH`
is what makes it observed.

The third condition packaging introduces is new rather than latent: `asar`.
`node-pty` is a native module, and a `.node` binary cannot be `require`d out of
an asar archive. Get that wrong and the app launches, renders the canvas, shows
its first panel, and dies at the first `pty:create` — the exact shape of silent,
late failure the rest of this codebase is organised against.

## Scope

In:

- `electron-builder`, producing an unsigned `Terminal Canvas.app` and a `.dmg`
  for `arm64`.
- **App identity**: an `appId` and a `productName`, and the `userData`
  isolation that follows from them.
- **Socket isolation**: a packaged app and a dev app must not be able to destroy
  each other's agents.
- **`asarUnpack` for `node-pty`**, and a check that would fail if it stopped
  matching.
- **Two verification tiers**: a fast plain-node suite over the config builder
  that joins `npm run verify`, and a slow suite that really packages and really
  launches, deliberately outside that chain.
- One startup diagnostic line in main, because an external process has no other
  way to observe either failure above.

Out, and deliberately so:

- **Code signing and notarization.** Decided explicitly: the target is a local
  unsigned build. Signing costs $99/yr, and — more to the point here — it makes
  the build non-hermetic, dependent on keychain state and network access, and
  gives it a secrets story. None of that buys anything for a build that only has
  to open on the machine that made it. Another Mac will see Gatekeeper's
  unidentified-developer block; that is the known and accepted cost.
- **Auto-update.** This is not merely unscheduled, it is architecturally
  blocked, and ideas-backlog #74 records why: an in-app update restarts the app,
  `before-quit` calls `shutdown()`, and `shutdown()` is `kill-server` on the
  private socket. A "restart to update" prompt would destroy every running
  agent — the exact outcome M4c exists to prevent. That wants deciding before
  the first update ships, not inside a packaging milestone.
- **Universal / `x64` builds, and CI.** Both are a flag and a longer build once
  there is a second machine to run on. Neither changes a design decision here.
- **A custom `.icns`.** An asset decision, not a packaging one. electron-builder
  builds without one, and choosing an app icon is a design pass that should not
  be acquired as a side effect of "make it package". Recorded in the backlog.

## The central insight

**A packaging config is normally a static blob, and this repo has no way to test
a blob.**

Every quality claim in this codebase rests on `npm run verify`, and the pattern
that makes each suite possible is the same one, applied five times: put the pure
part in its own module that computes a value from plain data, and keep the
impure part — the thing that spawns, or touches Electron — somewhere else.
`tmux-args.ts` builds argv and config text while `session-backend.ts` does the
spawning. `layout-store.ts` takes its file path as a constructor argument rather
than calling `app.getPath`. `presets.ts` takes `which` as a parameter rather
than importing `shell-env.ts`. `commands.ts` takes rows and a captured id rather
than the registry.

A `"build"` key in `package.json`, or an `electron-builder.yml`, has no pure
part to extract, because it has no *function* in it. Any check written against
one would read JSON and compare it to itself.

So the config is a **function**: `buildConfig(opts)` returns the object
electron-builder consumes. That is what lets a plain-node suite assert
"`node-pty` is unpacked from the asar" as a property of a computation, in the
cheapest tier this repo has.

## Architecture

### Where the config lives

```
build/builder-config.cjs        pure: opts in, electron-builder config object out.
                                No imports, no fs, no electron. Plain CJS.
electron-builder.config.cjs     three lines: require the builder, call it, export.
scripts/verify-package.cjs      requires build/builder-config.cjs directly.
scripts/verify-packaged.cjs     packages for real, launches the binary for real.
```

Plain CJS rather than TypeScript, and this is a deliberate exception to a
TypeScript-first repo. electron-builder loads its config file itself, at build
time, in a process this repo does not control and cannot put esbuild in front
of. A `.ts` config would need a bundling step whose only consumer is the
bundling step. The `scripts/` directory is already entirely plain CJS for
adjacent reasons, so this is in-idiom rather than a new precedent — and the
payoff is that `verify-package.cjs` needs **no esbuild entry at all**, unlike
every other plain-node suite in the repo, because there is nothing to resolve.

### App identity, and the state that follows from it

```
appId:       com.alexnieves.terminal-canvas
productName: Terminal Canvas
```

`productName` is not cosmetic here. `app.getPath('userData')` derives from the
app's name, so:

| | dev (`npm run dev`) | packaged |
|---|---|---|
| `userData` | `~/Library/Application Support/terminal-canvas` | `~/Library/Application Support/Terminal Canvas` |
| `layout.json` | dev's panels, presets, prompts | its own |
| `tmux-exits/` | dev's | its own |

The consequence is that **the packaged app opens on `firstRunPanels()` — one
centred placeholder — rather than on the dev canvas.** That is correct and
intended, not a migration bug: the two builds are separate installations of the
same program, and silently sharing a layout file between a build under active
development and one being used for work is the more surprising of the two
behaviours. It is written down here because the first person to open the
packaged app will otherwise read an empty canvas as data loss.

Note that `exitDir` isolation comes free with this, since `tmux-args.ts` already
places it under `userData`.

### Socket isolation, and why it is not a config value

`TMUX_SOCKET` is a hardcoded `'terminal-canvas'` and does **not** vary with
`productName`. So without a change, a dev app and a packaged app share one tmux
server — and `before-quit` calls `shutdown()`, which is `kill-server`. Quitting
either one destroys the other's running agents. This is ideas-backlog #49's
socket-naming question arriving for real, because M5c is the first thing that
makes two simultaneous instances plausible.

The fix is a pure resolver in `tmux-args.ts`, alongside the constant rather than
replacing it:

```ts
resolveSocket({ packaged, override }): TmuxSocket
```

- `TMUX_SOCKET` stays `'terminal-canvas'` and stays the default of every argv
  builder. `verify:tmux` check 9 — "list, kill-session, kill-server, and the
  hook all target the private socket" — therefore keeps passing **unchanged and
  unweakened**. This milestone adds checks; it does not relax one.
- Packaged resolves to `'terminal-canvas-app'`.
- `override` comes from `TC_TMUX_SOCKET` in the environment, honoured *only* by
  this resolver. It is a developer flag: no UI, no persistence, no settings
  entry. It exists because `verify:packaged` launches a real packaged binary,
  and a smoke run must not be able to leave sessions on — or `kill-server` —
  the socket a real packaged app uses. That is the same rule as "the verify
  suites must never touch the production socket," applied one level up, and it
  is the same shape as the defaulted-socket parameter those builders already
  carry.

`main/index.ts` calls it once, with `app.isPackaged`, and threads the result
through `probeTmux` and the backend on the parameter that already exists for
exactly this purpose. **The builder config never mentions tmux.** Naming the
packaged socket in `build/builder-config.cjs` would put the same string in two
files that can drift, and socket naming stays owned by `tmux-args.ts` and
verified by `verify:tmux`.

### Native module survival

```
asar:       true
asarUnpack: ['**/node_modules/node-pty/**']
files:      out/** plus runtime deps; excludes src, scripts, docs, *.tsbuildinfo
directories.output: 'release'      (already gitignored)
npmRebuild: default (on)
```

`npmRebuild` is left on deliberately rather than disabled in favour of the
existing `postinstall` `electron-rebuild`. The postinstall builds against the
`electron` devDependency; electron-builder rebuilds against the Electron it is
actually packaging. Those are the same version today and there is no reason to
make correctness depend on their staying that way.

### Targets and signing

```
mac.target: ['dir', 'dmg']
arch:       arm64
identity:   null
```

`dir` is the plain `.app`, which is what `verify:packaged` launches; `dmg` is
the artifact worth keeping. `arm64` only, because the accepted audience is one
Apple Silicon machine; widening to universal is a flag and a longer build, not a
design change.

`identity: null` is *explicit* rather than merely omitted, and the distinction
matters: omitted, electron-builder may discover a signing identity in the
developer's keychain and produce a differently-signed app on a different
machine. Explicit null is what makes the build hermetic.

**Named risk, to be settled empirically in the first task rather than asserted
from memory:** Apple Silicon refuses to execute a binary carrying no signature
at all, so whether `identity: null` leaves electron-builder's ad-hoc signing
fallback in place is a question about a specific version's behaviour. If the
produced binary will not launch, the answer is an explicit ad-hoc identity,
which is still offline, still free, and still unsigned in the Gatekeeper sense.
`verify:packaged` launching the binary is precisely the check that catches this,
which is why that suite is written before the config is tuned.

## Verification

Two tiers, and the split is the point.

### `verify:package` — plain node, joins `npm run verify`

`require`s `build/builder-config.cjs` and asserts on the returned object:

- `asarUnpack` matches `node-pty`, **and would still match if npm hoisted it to
  a different depth** — this is the assertion that matters most, because a
  silent miss produces an app that launches, renders, and dies at the first
  `pty:create`.
- `files` includes `out` and excludes `src`, `scripts`, and `docs`.
- `appId`, `productName`, and `directories.output` are what the identity section
  above says.
- `identity` is explicitly `null`, not absent — an assertion about a *key's
  presence*, because absent and null are different facts here in exactly the way
  `parsePresets` distinguishes ABSENT from MALFORMED.
- `mac.target` and the architecture.

It is fast, offline, and has no native dependency, so it belongs in the default
chain beside `verify:layout` and `verify:tmux`.

### `verify:packaged` — real build, real launch, NOT in the default chain

Runs `electron-builder --dir`, then launches the produced binary directly, with
three deliberate distortions:

1. **A stripped `PATH`** (`/usr/bin:/bin`), emulating launchd. This is the only
   way the `shell-env.ts` branch that module exists for is ever taken.
2. **A throwaway `--user-data-dir`**, so the suite cannot read or write the real
   `layout.json`. Same rule as the production socket.
3. **`TC_TMUX_SOCKET` pointed at a scratch socket**, so the run cannot touch the
   packaged app's sessions.

It asserts, from the app's own stdout, that the login-shell probe recovered a
real `PATH`, which backend was chosen and why, and that a PTY actually spawned —
the last being the end-to-end proof that `node-pty` loaded out of the unpacked
asar. A fresh `userData` gives `firstRunPanels()`, one panel, which goes live
and spawns, so the proof needs no synthetic input.

The spawn half needs **no new code at all**: `PtyManager.create` has logged
`[pty] spawned <command> pid=<n> panel=<id> ...` since M1. Greping a line that
already exists is strictly better than adding one for a check, because a
regression that stops PTYs spawning then fails here whether or not anyone
remembers this suite exists.

It is kept out of `npm run verify` because it packages and rebuilds native
modules, which takes minutes and reaches the network through electron-builder's
cache. Making the repo's one green-or-not signal slow and network-dependent
would cost more than the check is worth on every run. It is the **pre-release
gate**, and `CLAUDE.md`'s suite table will say so with that reason attached,
because a suite that is not in the chain is a suite that silently stops being
run.

### The one piece of production code the checks require

A startup diagnostic in `main/index.ts`: **one line**, naming the build kind,
the resolved `userData`, the socket, the chosen backend and its reason, and the
resolved `PATH`. An external process observing
a packaged app has no other channel — there is no IPC to a test harness, no
custom entry point (`verify:panels`' `scripts/panels-entry.cjs` trick is
unavailable, because a packaged app runs its own `main`), and no renderer hook.

This is in keeping with what the codebase already does rather than a concession
to testing: `shell-env.ts`'s "the fallback logs loudly on purpose", and
`tmux-probe.ts`'s fallback reason, both exist so a degraded run says why. This
adds the same for the successful run, which is the case nobody could previously
distinguish from a broken one.

## Files

New:

```
build/builder-config.cjs
electron-builder.config.cjs
scripts/verify-package.cjs
scripts/verify-packaged.cjs
```

Changed: `src/main/tmux-args.ts` (`resolveSocket`, `TMUX_SOCKET_PACKAGED`, and
`buildStartServerArgs` — the one tmux argv still built by hand, inline in
`tmux-probe.ts`, and therefore the one check 9's socket assertion cannot see),
`src/main/index.ts` (resolve the socket from `app.isPackaged`; the startup
diagnostic), `src/main/tmux-probe.ts` (accept the resolved socket rather than
closing over the constant, and pass it to `createTmuxBackend`),
`scripts/verify-tmux.cjs` (checks for the resolver and for `start-server`;
check 9 untouched), `package.json` (`electron-builder` devDependency,
`package` / `verify:package` / `verify:packaged` scripts, the `verify` chain),
`README.md`, `CLAUDE.md`, `docs/ideas-backlog.md` (the icon note).

## Success criteria

1. `npm run package` produces `Terminal Canvas.app` and a `.dmg` under
   `release/`, on a machine with no signing identity and no network beyond
   electron-builder's own cache.
2. The packaged app, launched by double-click, opens a window, finds `claude`
   and `tmux` on a PATH launchd never gave it, and spawns a working PTY in its
   first panel.
3. A dev app and the packaged app can run at once; quitting either leaves the
   other's agents alive.
4. `npm run verify` is green, including the new `verify:package`, and
   `verify:tmux` check 9 still passes unmodified.
5. `npm run verify:packaged` is green, and `CLAUDE.md` records that it is not in
   the default chain and why.
