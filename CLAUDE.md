# CLAUDE.md

An index. Every rule in this repository exists because the obvious version fails
**silently**; the reasoning lives in the docs below, and this file says when to open them.

| Doc | Open it when |
|---|---|
| [README.md](README.md) | New here. Also the roadmap contract — modules are shaped for milestones that have not landed; don't "simplify" those away. |
| [docs/load-bearing.md](docs/load-bearing.md) (+ [-recovered](docs/load-bearing-recovered.md)) | Before changing any module. Both files are far too large to read whole; **search them, never scroll** — `npm run lb -- <module>` lists every entry naming it, as whole entries with a file:line. Entries are written from the CAUSE, so searching a symptom fails. |
| [docs/architecture-map.md](docs/architecture-map.md) | You need to know what a seam is and who owns it. Module-by-module. |
| [docs/product-rules.md](docs/product-rules.md) | You are touching UI, copy, tokens or goldens. The face/rest/path/metrics rules and what a restyle may not touch. |
| [docs/verify-suites.md](docs/verify-suites.md) + [table](docs/verify-suite-table.md) | Adding or debugging a check. Five rules that fail silently if unknown live in the first. |
| [docs/milestone-history.md](docs/milestone-history.md) | You need the run-by-run story. |
| `docs/build-log/*-ledger.md` | You need a run's state — the ledger, not memory, is the state. **More than one run is live, and they number apart:** v10 (D01–D20 → M193–M224, by the [product guide](docs/product-development-guide-2026-09-08.md)), ledger [m193-m224](docs/build-log/m193-m224-ledger.md); and v11 visual (M225–M243, by its [run prompt](docs/superpowers/specs/2026-09-09-v11-visual-run-prompt.md)), ledger [m225-m243](docs/build-log/m225-m243-ledger.md); and the M248–M250 integration (deck, command pill, rich notes and .docx import), ledger [m248-m250](docs/build-log/m248-m250-ledger.md). Work numbered past a ledger's range is logged per milestone beside them. `verify:meta ledger.1` goes red when a newer ledger lands without a link here. |
| [docs/ideas-backlog.md](docs/ideas-backlog.md) | Picking unscheduled work. Entries marked DONE or declined live in [-closed](docs/ideas-backlog-closed.md) under the same number. |

## What this is

An Electron app for macOS: an infinite canvas of authored objects — agents, terminals, files,
previews, workflows, pictures and notes — each of which a person arranges, edits and keeps.
A terminal is ONE thing a panel can be. **This is 5.0 (M192); the v10 run opened at M193.**

The core job: move a meaningful task from intention to reviewed result while the person keeps
control and understanding. *A workspace holds your work; tasks connect agents, tools and
evidence; the canvas is where you see and act on those connections.*

Four rules the whole product rests on — the long form of each is in
[docs/product-rules.md](docs/product-rules.md):

- **An object is authored, not only started.** A note, picture, workflow or region takes the
  same selection, drag, marks, undo, tiering and export rules as everything else, and joins
  `isTerminalPanel`'s exclusion list rather than getting a partition of its own.
- **Four doors, and the fourth is real.** Every verb reaches a canvas gesture, a palette row,
  an agent line AND a workflow node (`V9_DOORS`, `verify:verbs closure.v9.1`). A door that is
  only declared is not a door.
- **What arrives from outside is inert until a person looks.** An imported canvas starts no
  process; imported action nodes are refused by name until read (`reviewed: false`).
- **Nothing leaves without passing the gate.** `outward` and `redactSecrets` have a named,
  checked caller list; an export scrubs field by field and reports its count.

**Project, workspace and task do not merge** (there is still no project record in
`LayoutSnapshot`), and **a teammate is an identity, a chat is its conversation, a session is
its execution**. **A `note` is a Markdown FILE and nothing else is** — M187's sticky, text and
frame are *canvas objects*, never notes; nothing is renamed in code.

**The frame rule (M236).** A kind is **chromeless** — no header, content to the edge, controls
on hover over a scrim — when the object IS its content: a `terminal`, and a `note` in its text
and frame forms. Every other kind **keeps its header**, because each header carries a fact the
body does not repeat (a state word, a count, a path, an address). The test is not how much
chrome there is, it is *does removing this hide information*. The full list lives beside the
rules in `styles.css`; a rule that is silently per-kind is how the frame drifted before M47.
**A chromeless frame's chrome is ABSOLUTELY POSITIONED over the body, never a box that
collapses** — a collapsing box refits xterm and fires a SIGWINCH into the running agent on
every mouse-over, measured at 458→422→458px in M234, with no error and no red suite.

**Four density layers** decide WHERE a fact goes: *rest* (name, kind, one meaningful state —
never a zero-value statement), *contextual* (next action, blocker; opacity 0 → 1),
*inspector* (configuration, provenance, outcomes), *deep detail* (logs, metrics, history).

## Commands

`package.json` lists the scripts; what it cannot tell you: **`npm run verify` is the whole
verification story** — there is no unit-test runner and no linter — and it must be green
before claiming work is done. It is `scripts/verify-all.cjs`, which **DERIVES** its suite
list from package.json's `verify:*` keys rather than enumerating one, so a new suite runs by
being written; `verify:packaged` and `verify:visual` are the only exclusions and they are
named in the runner's `HAND_RUN` (`verify:meta` 19 pins all of that, and that `verify` still
points at the runner). Three waves: the plain-node tier **concurrently**, then `npm run build`,
then the Electron tier **serially** — the build is early so a type error costs seconds
instead of minutes, but still ahead of `verify:canvas`/`xterm`/`panels`, the only suites that
read `out/renderer`. No suite needs a display, and each exits non-zero on any failure; to add
a check, append an `ok(...)` in the IIFE. `TC_ONLY=<id>` narrows what a suite *reports*, never
what it runs (checks share state in-process; a filter matching nothing is red).
`TC_VERIFY_ELECTRON_JOBS=N` runs the Electron tier N-wide — measured NOT yet reliable (fixed
`settle()` windows overrun under contention), so never the gate. A panels part's `headroom.1` goes red at 90% of its watchdog — re-pin it then, not after a
hang. All three in [docs/verify-suites.md](docs/verify-suites.md). **Never add a suite
to the `verify` script** — there is no list there to add it to. `npm run dev` unsets
`ELECTRON_RUN_AS_NODE` first. **Between gates, `npm run affected`** runs only the suites the
branch's changes reach — derived from each suite's script, entries and `src`'s import graph, a
changed file no suite reads printed as UNMAPPED — and says on every run that it is not the
gate; `--list` shows the selection without running it.

Outside the chain, all real Electron: `npm run shot` (23 PNGs of the real renderer for a
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
diagnostics:export export:panel-text export:canvas-png export:deck-pdf env:report link:open ledger:list
ledger:usage spawn:sheet spawn:recent agent:create agent:send agent:interrupt agent:dispose
agent:answer agent:list agent:transcript agent:import agent:clipboard-image
attachment:clipboard-file agent:auto-start agent:auto-stop agent:grants agent:revoke-grants
agent:pool-start agent:pool-stop teammate:list teammate:save teammate:delete
teammate:choose-place routine:list routine:save routine:delete routine:run shelf:list
shelf:save plugin:details skill:write skill:create skill:rename skill:delete skill:trail
browser:read preview:discover preview:capture asset:put asset:choose node:fetch
portable:export portable:import board:lane board:lane-status board:open-pr board:comment-pr
board:repositories update:check image:read starter:prepare docx:import pty:data pty:exit edit:copy
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
- The renderer's CSP is `default-src 'self'`: no CDN scripts, no remote assets, and an
  iframe is refused — a browser pane is a `<webview>` guest for that reason.
- A trackpad pinch arrives as a wheel event with **`ctrlKey: true`** and no key held — the only
  signal separating pinch from scroll. `deltaMode` is not always pixels: trackpads report `0`,
  mouse wheels report lines (`1`) and need roughly a 16x multiplier.
- **A drag delta is `screenToWorld(p₂) − screenToWorld(p₁)`, never `screenToWorld(p₂ − p₁)`** —
  the latter subtracts a translation that should have cancelled, so the panel drifts off the
  cursor whenever the viewport isn't at the origin (`verify:viewport` 27).
- **`applyDrag` recomputes from the gesture's ORIGIN rect every frame, never from the previous
  frame's result.** Accumulating deltas drifts and breaks outright on a mid-drag zoom; both
  bugs are caller-side. `verify:panels` check 10 is the discriminator, and its header records
  the limit — don't rediscover it by tightening the check.
- **A dispatched event on `.panel__slot` never reaches xterm's listeners** — xterm binds on
  `.xterm`, one level below the slot, and capture does not visit a target's descendants.
  Dispatch on `.xterm-screen`, the node a real cursor would be over.
- **Jira ticket context is `paste()`, never `write()`.** Raw writes submit every newline
  separately, firing fragments at the agent before the description arrives.
- **`Cmd+V`/`Cmd+C`/`Cmd+Z` over an open text draft still reach the focused TERMINAL** — a
  paste aimed at a comment box goes into the running agent, and `Cmd+Z` can dispose a session.
  Documented, not fixed (`docs/load-bearing.md`). A new text surface inherits it and must
  subscribe to `edit:copy`/`edit:paste` itself, as `Palette.tsx` does.

## Working on this repo

Milestones follow a fixed shape: a design spec in `docs/superpowers/specs/`, then a plan in
`docs/superpowers/plans/`, then tasks executed test-first — checks written and *watched
failing* against a non-existent module before it is implemented. M2 and M3 are worked examples.
Every milestone ends with a fresh-context critic and a ledger line carrying its evidence.

- Commits: conventional format scoped by milestone — `feat(m3): …`, `fix(m3): …`.
- Comments explain *why*. Match that density; a non-obvious line without a reason attached
  will be "fixed" by someone later.
- **A new verify check takes a SCOPED id, never the next global integer.** Write
  `ok('kind-tail.1 …')`, not `ok('186 …')` — nothing parses the string, and it ends the
  seven-plus `renumber` commits two branches appending from their own view of the last number
  have forced. Existing numeric ids stay; `verify:meta` 22 fails a collision.
- **Don't restate a count in prose in more than one place.** Record the rule, not the tally
  (`verify:meta` 23). Where a count must be written down, `verify:meta` is where it gets
  pinned so it cannot drift silently.
- **A golden changes on purpose or not at all.** A restyle regenerates its scenes, and each
  changed scene gets a critic's sentence in the ledger before `UPDATE_GOLDENS=1` writes it. A
  blind re-baseline is a regression that cannot be seen.
