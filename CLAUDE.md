# CLAUDE.md

An index, not an encyclopedia. Every rule in this repository exists because the obvious
version fails **silently** — a panel that renders nothing with no error, an exit code of `0`
printed as a failure, a diagram that quietly stopped matching the contract. The reasoning
lives in the docs below; this file says what they are and when to open them.

| Doc | Open it when |
|---|---|
| [README.md](README.md) | New here. Also the roadmap contract — modules are shaped for milestones that have not landed; don't "simplify" those away. |
| [docs/load-bearing.md](docs/load-bearing.md) (+ [-recovered](docs/load-bearing-recovered.md)) | Before changing any module. ~145KB of invariants; **grep it, never scroll it** — entries name their module in backticks, and are written from the CAUSE, so searching a symptom fails. |
| [docs/architecture-map.md](docs/architecture-map.md) | You need to know what a seam is and who owns it. Module-by-module. |
| [docs/product-rules.md](docs/product-rules.md) | You are touching UI, copy, tokens or goldens. The face/rest/path/metrics rules and what a restyle may not touch. |
| [docs/verify-suites.md](docs/verify-suites.md) + [table](docs/verify-suite-table.md) | Adding or debugging a check. Five rules that fail silently if unknown live in the first. |
| [docs/milestone-history.md](docs/milestone-history.md) | You need the run-by-run story. |
| [docs/product-development-guide-2026-09-08.md](docs/product-development-guide-2026-09-08.md) | The current run (D01–D20 → M193–M224); ledger: [m193-m224](docs/build-log/m193-m224-ledger.md). |
| [docs/ideas-backlog.md](docs/ideas-backlog.md) | Picking unscheduled work. |

## What this is

An Electron app for macOS: an infinite canvas of authored objects — agents, terminals, files,
previews, workflows, pictures and notes — each of which a person arranges, edits and keeps.
A terminal is ONE thing a panel can be. **This is 5.0 (M192); the v10 run opened at M193.**

The core job: move a meaningful task from intention to reviewed result while the person keeps
control and understanding. *A workspace holds your work; tasks connect agents, tools and
evidence; the canvas is where you see and act on those connections.*

Four rules the whole product rests on — the long form of each is in
[docs/product-rules.md](docs/product-rules.md):

- **An object is authored, not only started.** A note, a picture, a workflow and a region take
  the same selection, drag, resize, marks, grouping, undo, tiering and export rules as
  everything else, and each joins `isTerminalPanel`'s exclusion list rather than getting a
  partition of its own.
- **Four doors, and the fourth is real.** Every verb reaches a canvas gesture, a palette row,
  an agent line AND a workflow node (`V9_DOORS`, `verify:verbs closure.v9.1`). A door that is
  only declared is not a door.
- **What arrives from outside is inert until a person looks.** An imported canvas starts no
  process; imported action nodes are refused by name until read (`reviewed: false`); a fetch
  node GETs and refuses every write.
- **Nothing leaves without passing the gate.** `outward` and `redactSecrets` have a named,
  checked caller list; an export scrubs field by field and reports its count; pixels travel
  only when asked, and are never called redacted.

**Project, workspace and task do not merge** (there is still no project record in
`LayoutSnapshot`), and **a teammate is an identity, a chat is its conversation, a session is
its execution**. **A `note` is a Markdown FILE and nothing else is** — M187's sticky, text and
frame are *canvas objects*, never notes; nothing is renamed in code.

**Four density layers** decide WHERE a fact goes: *rest* (name, kind, one meaningful state —
never a zero-value statement), *contextual* (next action, blocker; opacity 0 → 1),
*inspector* (configuration, provenance, outcomes), *deep detail* (logs, metrics, history).

## Commands

```sh
npm run dev            # electron-vite dev (unsets ELECTRON_RUN_AS_NODE first)
npm run build          # typecheck + electron-vite build
npm run package        # electron-builder: the unsigned .app and .dmg, into release/
npm run typecheck      # both projects; or typecheck:node / typecheck:web
npm run verify         # every suite, then a build, then the suites that need the build
```

There is no unit-test runner and no linter: `npm run verify` is the whole verification story,
and it must be green before claiming work is done. None of the suites need a display; the
real-Electron ones open a window with `show: false`. There is no test-name filter — each runs
everything and exits non-zero on any failure. To add a check, append an `ok(...)` in the IIFE.

Not in `npm run verify`, all real Electron: `npm run shot` (23 PNGs of the real renderer for a
fresh-context critic), `verify:visual` (those scenes against committed goldens;
`UPDATE_GOLDENS=1` only after LOOKING), `verify:packaged` (a pre-release gate).

**Whether a bundle needs a `@shared`/`@renderer` esbuild alias is settled by deleting it and
building** — reading the imports and reasoning about which are `import type` has been wrong
repeatedly, because a value imported three hops down a re-export chain is easy to miss by eye.
The trap manifests as a HANG, not a red suite.

## Architecture

Three processes, one shared contract. **The main process owns every PTY; the renderer never
spawns a process.** `src/shared/ipc-contract.ts` is the single source of truth for channels
and the `window.canvas` bridge type — add a channel there FIRST; `verify:ipc` fails if one has
no main-process handler. The diagram in [README.md](README.md) is pinned by `verify:meta` 19;
the channel list below is a copy pinned by `claude-md.1`, so edit both with the contract.

```
pty:create pty:write pty:resize pty:kill pty:list machine:sample layout:load layout:save
session:backend preset:list preset:rename preset:delete preset:set-default
preset:spawn-by-id preset:template preset:save-panel preset:set-worktree worktree:list
worktree:remove worktree:reveal scrollback:tail scrollback:clear scrollback:search
canvas:request-reset prompt:list prompt:save prompt:delete template:list template:save
template:delete vault:read snapshot:list snapshot:restore memory:list memory:add
watcher:create watcher:run watcher:stop watcher:dispose watcher:list settings:list
settings:set agent:acknowledge workspace:list workspace:activate workspace:create
workspace:rename workspace:delete workspace:merged workspace:move-panels review:panel
review:baseline review:at review:diff git:status review:across review:commit review:discard
credential:list credential:set credential:delete credential:verify jira:list github:list
broker:audit jira:transitions jira:comment jira:transition file:open file:read file:close
fs:list toolbox:read toolbox:permissions file:write file:create diagnostics:sample
diagnostics:export export:panel-text export:canvas-png env:report link:open ledger:list
ledger:usage spawn:sheet spawn:recent agent:create agent:send agent:interrupt agent:dispose
agent:answer agent:list agent:transcript agent:import agent:clipboard-image
attachment:clipboard-file agent:auto-start agent:auto-stop agent:grants agent:revoke-grants
agent:pool-start agent:pool-stop teammate:list teammate:save teammate:delete
teammate:choose-place routine:list routine:save routine:delete routine:run shelf:list
shelf:save plugin:details skill:write skill:create skill:rename skill:delete skill:trail
browser:read preview:discover preview:capture asset:put asset:choose node:fetch
portable:export portable:import board:lane board:lane-status board:open-pr board:comment-pr
board:repositories update:check image:read starter:prepare pty:data pty:exit edit:copy
edit:paste edit:undo edit:redo canvas:counts canvas:model canvas:reset preset:spawn
preset:default preset:capture agent:state attention:jump settings:changed spawn:open-sheet
agent:event watcher:state vault:changed session:live session:recover subagent:state
file:changed usage:panel routine:fire canvas:tidy canvas:feedback canvas:flip board:add
canvas:plan pool:mint pool:event
```

Direction is meaning, not convention. `preset:*` are main → renderer because the *menu* is
main's, while the palette is the renderer's, so its mutations are invokes. `preset:spawn-by-id`
and `canvas:request-reset` exist so the palette runs MAIN's code rather than a second copy —
only main resolves an absent `command` into the login shell, and only main owns the
confirmation dialog; a renderer-side reconstruction would drift silently. **There is no
`credential:get`, and the absence is the design**: plaintext exists in one process and crosses
the bridge in neither direction. `canvas:counts`, `canvas:model`, `board:add` and `pool:mint`
reverse direction — main asks, the renderer replies on an ephemeral channel declared nowhere,
because the renderer owns the workspace it renders; `verify:ipc` does not and should not cover
those.

The canvas is layered so the math is testable without a browser, and a layer may only import
downward: `viewport.ts` / `canvas-input.ts` / `lod.ts` (pure, plain node) → `useViewport.ts`
(the only place state and math meet; the setter stays private) → `Canvas.tsx` (clipping host,
one transformed world layer, the registry, tier assignment, the one Cmd+C/Cmd+V subscription).
`palette/` and `groups/` follow the same shape. The hooks split out of `Canvas.tsx` each
replace a CONTIGUOUS run of hook calls at exactly their old position — several refs are
created above a block and assigned below it, so re-ordering a call makes a ref read null for
the life of an effect, silently. Each takes one `Deps` object, destructures on entry, and
names the DESTRUCTURED members in dependency arrays — never `deps`, which the caller rebuilds
every render.

Everything else — what each module owns and what a change to it breaks — is
[docs/architecture-map.md](docs/architecture-map.md).

## The rules that generalise beyond one module

- **Two lifetimes, not one.** A panel's *session* (its xterm `Terminal` and PTY) is created
  once and disposed once in a module-level registry outside React; the React component is
  mounted and unmounted freely by tiering and owns nothing. Confusing the two kills a running
  agent with no error anywhere. `pty.kill` has exactly two renderer callers; a tier change
  must never reach either.
- **Absent vs. malformed vs. unknown, in every parser.** An ABSENT key is every pre-existing
  file and must warn nothing; a PRESENT-but-malformed value warns and is dropped, never
  coerced; a per-entry failure costs that entry, never the collection. An absent optional
  field must stay absent through every copy site — spreading writes `key: undefined`, which
  survives IPC and reads as present.
- **Three-state results, never two.** "Nothing to show", "asked but unanswered" and "a real
  answer" are three renderings; collapsing any two tells the user the wrong fix.
- **A row that disappears is indistinguishable from a feature that was never built.** Every
  administrative affordance is disabled with a distinct, named reason rather than removed.
- **`registry.version()` carries tier/status/focus/exit and nothing higher-frequency.** Every
  module-level store added since is subscribed per panel id, caches its snapshot object, and
  is cleared at every panel-removing call site.
- **No renderer `process.env`.** electron-vite compiles it to a literal `{}`, so the fallback
  is the only branch that ever runs.
- **Known manual-only verifications.** A green `npm run verify` is silent on roughly a dozen
  facts confirmed once by hand against a real machine, CLI or signed build — listed at the end
  of [docs/load-bearing.md](docs/load-bearing.md). Treat green as green, not as proof of those.

## Gotchas

- **`Cannot read properties of undefined (reading 'whenReady')`** — your shell exports
  `ELECTRON_RUN_AS_NODE=1` (VS Code's extension host does). `dev`/`start` unset it; you only
  hit this invoking `electron-vite` directly. **`Error: Electron uninstall`** — run
  `node node_modules/electron/install.js`.
- The renderer has a strict CSP (`default-src 'self'`): no CDN scripts, no remote assets.
  `tsconfig.node.json` / `tsconfig.web.json` set `noUnusedLocals`/`noUnusedParameters` —
  prefix intentionally-unused params with `_`.
- A trackpad pinch arrives as a wheel event with **`ctrlKey: true`** and no key held — the only
  signal separating pinch from scroll. `deltaMode` is not always pixels: trackpads report `0`,
  mouse wheels report lines (`1`) and need roughly a 16x multiplier.
- **A drag delta is `screenToWorld(p₂) − screenToWorld(p₁)`, never `screenToWorld(p₂ − p₁)`** —
  the latter subtracts a translation that should have cancelled, so the panel drifts off the
  cursor whenever the viewport isn't at the origin (`verify:viewport` 27).
- **`applyDrag` recomputes from the gesture's ORIGIN rect every frame, never from the previous
  frame's result.** Accumulating deltas drifts and breaks outright on a mid-drag zoom. Both
  bugs are caller-side. `verify:panels` check 10 is the discriminator, and its own header
  records the limit: a variant advancing both origin fields together is indistinguishable by
  any assertion on the final rect — don't rediscover that by tightening the check.
- **A dispatched event on `.panel__slot` never reaches xterm's listeners** — xterm binds on
  `.xterm`, one level below the slot, and capture does not visit a target's descendants.
  Dispatch on `.xterm-screen`, the node a real cursor would be over.
- **Jira ticket context is `paste()`, never `write()`.** Raw writes submit every newline
  separately, firing fragments at the agent before the description arrives.
- **`Cmd+V`/`Cmd+C`/`Cmd+Z` over an open text draft still reach the focused TERMINAL** — a
  paste aimed at a comment box goes into the running agent, and `Cmd+Z` can dispose a session.
  Documented, not fixed; both obvious fixes are blocked (see `docs/load-bearing.md`). A new
  text surface inherits it and must subscribe to `edit:copy`/`edit:paste` itself, as
  `Palette.tsx` does.

## Working on this repo

Milestones follow a fixed shape: a design spec in `docs/superpowers/specs/`, then a plan in
`docs/superpowers/plans/`, then tasks executed test-first — checks written and *watched
failing* against a non-existent module before it is implemented. M2 and M3 are worked examples.
Every milestone ends with a fresh-context critic and a ledger line carrying its evidence.

- Commits: conventional format scoped by milestone — `feat(m3): …`, `fix(m3): …`.
- Comments explain *why*. Match that density; a non-obvious line without a reason attached
  will be "fixed" by someone later.
- **A new verify check takes a SCOPED id, never the next global integer.** Write
  `ok('kind-tail.1 …')`, not `ok('186 …')`. Nothing parses the string, and it removes the one
  thing that has forced seven-plus `renumber` commits: two branches both appending from their
  own view of the last number. Existing numeric ids stay as they are; `verify:meta` 22 fails
  the build if two COMPUTED checks in one suite share an id.
- **Don't restate a count in prose in more than one place.** Record the rule, not the tally
  (`verify:meta` 23). Where a count must be written down, `verify:meta` is where it gets
  pinned so it cannot drift silently.
- **A golden changes on purpose or not at all.** A restyle regenerates its scenes, and each
  changed scene gets a critic's sentence in the ledger before `UPDATE_GOLDENS=1` writes it. A
  blind re-baseline is a regression that cannot be seen.
