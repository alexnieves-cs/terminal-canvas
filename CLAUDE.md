> **What this file is.** An engineering decisions log, kept alongside the code
> it explains. It is named `CLAUDE.md` because Claude Code loads it
> automatically, but nothing in it is addressed only to a machine: nearly every
> entry records a load-bearing invariant and the *silent* failure that would
> follow from undoing it — a panel that renders nothing with no error, an exit
> code of `0` printed as a failure, a diagram that quietly stopped matching the
> contract. If you are wondering why some line in this repository is written so
> strangely, the answer is almost certainly here, and it is almost always
> "because the obvious version fails without saying anything".
>
> New to the project? Start with [README.md](README.md); come here when you need
> to change something and want to know what it is holding up. The
> `## Load-bearing details` section is the heart of it.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron app for macOS: an infinite canvas where every node is a live terminal panel
running a coding-agent CLI. **M1 through M9c have landed** — the PTY layer, the canvas, their
merge, persistence and tmux-backed session survival (M4), presets (M5a), the Cmd+K command
palette (M5b), and electron-builder packaging into a real, launchable `.app` (M5c). The three that shaped the architecture are worth keeping in mind: M1 is the PTY layer, M2 is the
canvas and its coordinate math — deliberately built apart so that a blank panel had exactly
one possible cause in each. M3 merges them: `Canvas.tsx` now renders real terminal panels
instead of M2's placeholder rectangles, with level-of-detail tiering and viewport culling so
the canvas can hold more panels than the browser can afford live WebGL contexts for.

The milestone table in `README.md` is the roadmap contract — several modules are
deliberately shaped for a milestone that has not landed yet, and the code comments say so.
Don't "simplify" those away.

## Commands

```sh
npm run dev            # electron-vite dev (unsets ELECTRON_RUN_AS_NODE first)
npm run build          # typecheck + electron-vite build
npm run package         # electron-builder: the unsigned .app and .dmg, into release/
npm run typecheck      # both projects; or typecheck:node / typecheck:web individually
npm run verify         # every suite below, then a build, then the suites that need the build
```

There is no unit-test runner and no linter. `npm run verify` is the whole verification
story — it chains typecheck and build in the middle — and it must be green before claiming
work is done.

**A note on check numbering before the table below.** Check ids in this repo are not
sequential across history: many were assigned as "the next global integer" by independent
branches that never saw each other, so merges have repeatedly collided (the same milestone
number claimed four times over, seven-plus "renumber" commits). That process detail isn't
repeated per suite below — see `## Conventions` for the actual rule now in force (new checks
take a scoped string id, e.g. `kind-tail.1`, never the next integer). What follows names each
suite's real coverage and calls out only the handful of checks that teach something a future
engineer could get wrong; for the full blow-by-blow of any suite, read that suite's own
`scripts/verify-*.cjs` — the comments live there too.

| Script | Runtime | Covers |
|---|---|---|
| `verify:meta` | plain node | 23 checks against the repo's own release hygiene, read as values off disk: LICENSE, `package.json`'s engine floor/repository/`private`, no tracked `.claude/` file, the README's required headings, the IPC diagram against the real contract, the CI workflow + badge, CONTRIBUTING naming the verify command, SECURITY existing, and every verify suite wired into the chain. All of this fails SILENTLY and LATE — a stale architecture diagram passes every typecheck. The diagram check is scoped to the diagram's own fenced code block rather than the whole README, because a plain substring search over the whole file is satisfied by a channel name appearing in any paragraph. Checks 20–21 pin the credential IPC boundary as SOURCE TEXT rather than behaviour, because neither rule has a runtime symptom when broken: 20 asserts the `CREDENTIAL_*` channel set is exactly `{list, set, delete, verify}` — an ALLOWLIST, not a test for the string `credential:get`, so a sibling added as `CREDENTIAL_REVEAL` doesn't sail through — plus no `cipher` field anywhere `CredentialMeta` or the IPC handler could hide one. 21 asserts none of `shell-env.ts`, `pty-manager.ts` or `session-backend.ts` import the credential store (directly, or one hop through `credential-verify.ts`), and no handler destructures/aliases the store's `read()`. Both are comment-stripped regex checks with documented blind spots: neither follows a SECOND hop of indirection (a rebound identifier, or some other module importing the store), and the import-side offender list is a hardcoded snapshot of "the modules that build a process environment" as of M14 — a future fourth such module is unchecked until someone adds it. Checks 22–23 (added by an M27 audit) guard the document itself: 22 fails the build if two COMPUTED checks in any suite ever share an id (the fix for the renumbering collisions above — discriminated by the pass *argument*, since a guard/skip branch legitimately reusing its own id passes a literal `true`/`false` rather than a computed expression); 23 fails if any module-level store comment in this file claims a hand-counted ordinal (see "Don't restate a count in prose" in Conventions). |
| `verify:viewport` | plain node | ~93 checks over pure canvas/panel geometry: `viewport.ts` (pan/zoom/clamp), `lod.ts` (tiering), `panel-interaction.ts`/`panels.ts` (drag/z math), `pointer-correct.ts`, the undo `history.ts` stack, dormancy-outranks-focus, the `makePanel`/`makeFilePanel`/`makeReviewPanel`/`makeToolboxPanel` construction contracts, `centreOn`/`restoreCamera`/`cascadeCentre` framing math, `edgeIndicator`/`linkAnchors` off-screen and link geometry, and the panel-kind partition predicates (`isReviewPanel`, `isTerminalPanel`, etc.) across five kinds. A few checks worth knowing by number: **54** pins `CASCADE_EPSILON < CASCADE_STEP` as a relation — inverted, every *first* `Cmd+N` press walks the whole cascade lattice and lands 384px off centre, a bug that would surface elsewhere as "spawn centring is broken" with nothing pointing at the epsilon. **65** is the only check that separates a screen-space visibility test from a world-space one for edge pips — a rect that reads off-screen in world units can be squarely on screen once zoom is applied. **74** is the absent-`kind` case: a panel with no `kind` key (every file written before M9b) must still read as a terminal, or a whole saved canvas silently renders as inert review nodes. **76** pins `makeReviewPanel` must NOT overwrite `subject.subjectId` with the node's own minted id — every other constructor in the file stamps its id into the object, so this is a one-line copy-paste that makes a node review itself forever, reporting "no changes" beside a panel that plainly has some. **84** is the only check that separates a ray CLIP (`edgeIndicator`/`linkAnchors`) from a per-axis CLAMP — the clamp corners every diagonal into the same point and still renders *a* pip/line, so the fixture is deliberately a shallow diagonal where clip and clamp disagree; confirmed by fault injection (the clamp turns 84 alone red). **85** is coincident centres answering `null` rather than normalising a zero-length vector into `NaN`, which would take a whole SVG layer's paint down with it — not just one link. **90b/92** assert `isTerminalPanel` as a POSITIVE partition (never `!isReviewPanel`) across four/five panel kinds in one read, because a helper that gets any ONE kind backwards still looks correct against the others — this is what fails the instant a new kind is added and the negation isn't updated to exclude it (fault-injected: dropping the toolbox clause turns 92 alone red). |
| `verify:merged` | plain node | 12 checks against two pure modules — `merged-layout.ts`'s lane placement and `marquee.ts`'s arithmetic — because every workspace lays its panels out in the SAME world space, so two workspaces' panels overlap by construction and a merged view needs somewhere to put them that isn't on top of each other. **1** is the check the module exists for: two workspaces whose panels coincide at the origin must not overlap after placement. **4** is the one worth knowing: an EMPTY workspace still gets a lane, because a workspace that silently vanishes from the merged view reads as a workspace that was deleted. **5** pins that only `rect.x`/`rect.y` are synthetic — id, spec, title, kind are the panel's own, which is what lets every existing consumer (registry, rail, inspector, pips) work on a foreign panel with zero code of its own. Checks 1, 4 and 7 all passed against a broken module for a while because every early fixture was anchored at `(0,0)` — a workspace panned to negative coordinates is what actually separates a missing width clamp from a missing bounding-box normalisation, so the fixtures now include one. **9** is the marquee's load-bearing rule: selection is INTERSECTION, never containment, because a marquee requiring full containment could never select a panel larger than the visible canvas (the common case at ordinary zoom) — a design decision, not a bug, but one that reads as "the drag does nothing" if inverted. **10** is the mirrored boundary: strict inequalities, so a panel merely touching the band's edge is excluded (dragging a band up against a panel to deliberately leave it out is a real gesture). **12** pins selection order follows the PANEL ARRAY, never the sweep direction. |
| `verify:registry` | plain node | 31 assertions against `session-registry.ts`'s lifecycle (create/attach/detach/dispose, dormant attach/wake, closing a never-spawned panel, restart-in-place) using a fake bridge and fake terminal factory. **22** is the one worth knowing by number: `dispose` must RESOLVE only after main has confirmed the kill — the fake `kill` is made deliberately slow so the check can tell "the promise resolved" apart from "the kill actually finished"; without it, a `dispose` that fires the kill and returns immediately looks identical. **24/25** pin `bumpVersion()` and `touch()` doing exactly one thing each and nothing else: `bumpVersion` must re-render without touching focus (a version bump implemented as `focus()` would move the keyboard, which a shell control must never do), and `touch()` must advance the eviction-order timestamp (`lastFocusedAt`) without setting the `focused` flag — the clause that discriminates is a LIVE session staying unfocused, since `focus(id)` would satisfy every other clause. M25 adds check 8b: functional exit observers fire only after the registry marks the source exited, and unsubscribe cleanly. |
| `verify:layout` | plain node | ~154 checks (several lettered sub-checks) against `shared/layout-schema.ts`'s on-disk format and `layout-store.ts`'s coalescing/atomic-write/settings resolution — covering presets, prompts, per-panel settings (`agent.idleAfterMs`, `agent.edgeIndicators`, `shell.railOpen`/`inspectorOpen`), workspace CRUD and the switch transaction, baselines, the panel-kind union (terminal/review/file/toolbox — five arms on disk, each with its own absent-vs-malformed and round-trip checks), links, sessions ids, `agent` fields on both panels and presets, the merged-view store members, the file-tree reader, and the toolbox/agent-knob fields. The standing rule threaded through nearly all of it: **`parseLayout` never throws and drops entries individually** (see the Load-bearing entry below) — every one of these format additions re-proves that rule for its own field (absent key = pre-existing files, warns nothing; present-but-malformed = warns and is dropped; one bad entry costs that entry, not the file). A few checks worth knowing individually: **89** is the workspace-switch save race — `activateWorkspace` writes the OUTGOING canvas into the OLD workspace record *before* flipping the active id, because flipping first would let the next coalesced save land on the wrong record with nothing in any log pointing at the switch that caused it. **94** is the interaction between that transaction and `restore.layout`: a switch must ignore that preference (it answers "what to show at launch", not "at a switch"), or a workspace switched away from and back to reads empty while its panels sit un-recorded on disk. **97** is `presetFromCapture`'s absent-`command` guard using `in` rather than a truthiness test, because `command: undefined` is a different, IPC-survivable fact from the key being absent (see "An absent `command` must stay absent" below) — a mint that spread its input would make every command-less preset spawn a hardcoded shell. **102** is `baselinePeers`, and the load-bearing clause is that it excludes the ASKING panel from its own peer count — counting itself would make every single-panel repository read as "shared" and the feature would never once produce an attributed answer. **107/116/143** are the same asymmetry restated for three different panel-kind unions: an UNKNOWN `kind` string is dropped with a warning, never defaulted to `terminal` — absent means terminal because absent is every pre-union file, but a *present* unknown kind was written by a version that knows something this one doesn't, and guessing terminal spawns a process for a panel whose author never asked for one. **111** is `parseWorkspace`'s link-validity check deriving the surviving panel set from `panels`, never from the parser's internal `seen` set — `seen` looks like "panels that survived" and isn't: it is populated to reject duplicate ids, before the checks (like a missing `cwd`) that can still drop a panel, so reusing it lets a link name a panel that didn't actually survive. **136–141** are the file-tree reader's four-arm result union (`ok`/`unreadable`/`not-a-directory`/`gone`) never collapsing to a null, a truncation cap that reports a count rather than silently ending, and a symlink reported as its own kind and never descended. **146–149** mirror the `agent` field's per-parser guards (an unknown `permissionMode` drops only that field and keeps its sibling `effort`; an out-of-range or hijacked `--model`-as-flag value earns its own warning; absence is asserted with `in`, never an `undefined` test). |
| `verify:credentials` | plain node | 15 checks against `shared/credential-schema.ts` and `main/credential-store.ts`, driven with a FAKE crypto and a temp file (the store takes crypto and file path as injected dependencies, the same trade `layout-store.ts` and `review-engine.ts` make, which is what keeps the encrypted-store format and its refusal path out of the Electron tier entirely). **4** is the check the whole IPC boundary rests on: `list()` exposes no `cipher` and no `token`, asserted on the returned object's own KEYS rather than a value — a spread that carried ciphertext straight through would satisfy any value-phrased assertion. **6** is "refuses, never falls back": with the OS keychain unavailable, `set()` fails AND writes no file — the no-file half is what matters, since a plaintext fallback is invisible at every surface the user can see (see "The store refuses rather than falling back to plaintext" below). **7/7b** are the log half of the same rule: neither a refusal's reason nor a warning may ever contain the submitted token, checked on both the ordinary refusal path (which short-circuits before `encrypt` runs) and on an `encrypt` that THROWS while holding the plaintext (which must become a scrubbed refusal, not a propagating error whose message quotes the token). |
| `verify:palette` | plain node | ~87 checks (lettered sub-checks) against `fuzzy.ts`'s matching, `palette-model.ts`'s section-first filter/sort/tie-stability, and `commands.ts`'s list construction — including disabled *reasons* staying visible rather than the row disappearing (a built-in refusing rename, an unavailable preset, a prompt insert with no captured panel, a project prompt refusing deletion, restart/review/link/toolbox rows disabled with distinct named reasons, credential and settings rows generated from schema). The standing rule this whole suite polices, restated across every drill-in scope: **a row that disappears is indistinguishable from a feature that was never built** — every administrative row (rename/delete/make-default, restart, review, link, toolbox permission-mode) is `hiddenAtRest` rather than absent, findable by typing its keyword, never removed. A few checks worth knowing: **30** derives its expectation from `SECTIONS` itself and runs it through `filterCommands`, rather than restating the section order by hand — construction order stopped meaning "the grouping" the day sorting became section-first (see "Sections are data" below). **65c** pins that a scope's DOOR row, if present but DISABLED, is not what `doorIndex` returns — asserting both halves in one condition, since asserting only "-1" would pass against an implementation that simply can't find the row at all. **66b/68/77/82/84** are the running theme of this suite for process-verb rows (Restart, review, link, toolbox mode, permission mode): each must be DISABLED with a DISTINCT, exported-constant reason rather than absent when its precondition fails ("never started" vs "no focus" vs "needs a second panel" vs "no baseline"), because collapsing two different problems into one message tells the user the wrong fix. **79** is the move-to-workspace rows: an EMPTY marquee selection leaves them visible and disabled naming the marquee, rather than removing them, because the marquee has no other affordance anywhere and a row that vanishes when nothing is selected removes the only way to learn the gesture exists. |
| `verify:rail` | plain node | ~115 checks (lettered sub-checks) against `renderer/shell/rail-rows.ts`, `inspector-fields.ts`, `rail-sections.ts`, `review-node-model.ts`, `file-node-model.ts`, `toolbox-node-model.ts` and `link-geometry.ts` — the honest-chain label resolution, the rail's frozen-array signature, the inspector's read/write model for every panel kind, and the pure link/pip geometry. Two facts worth knowing precisely: **7** pins that an exit code of `0` renders as `exited 0` — a truthiness test on `code` prints the wrong tail for the single most common exit there is. **10–14** are the rail's 60Hz defence: moving every rect must leave the row array's identity byte-identical (so `Canvas.tsx` can freeze it on a signature), while a title/status/wake change must each independently MOVE it — **14** specifically pins that a user's own title cannot forge a field boundary and freeze the rail on stale rows, which is why the signature is `JSON.stringify` over the rows rather than a separator-joined string a label is free to contain. This same signature-must-move-on-every-real-change / must-not-move-on-cosmetic-change pattern recurs for every model in this suite (`inspectorSignature`, `reviewSignature`, `toolboxSignature`, `treeSignature` in the file-tree model) — each is its own check because each model picked up a new field at a different milestone that a naive hash (e.g. hashing only ids, or only one of several inputs) would miss. The three-state "don't collapse two different absences into one" rule recurs per section too: `not-a-repo` (ordinary, most panels) is HIDDEN in the 260px inspector pane but RENDERED as a note in a review NODE (which the user deliberately opened — a panel rendering nothing looks broken); `repo-unreadable` (the git binary declined to open, e.g. the macOS Command Line Tools stub) is its own third arm, distinct from both; the Cost/Toolbox sections apply the identical three-way split (no pin = nothing to show; pinned-but-unanswered = a note; an actual answer = figures). A few specific checks worth knowing: **35/73** pin that a link/attention row names the OTHER panel by its TITLE via the honest chain, not by re-deriving from `spec.command` — a re-derivation says `/bin/zsh` beside a Panels row that says the panel's real title. **57** is the review node's commit verb: its `paths` come from the RESULT's full file list, never the display-capped rows, because deriving a write from what's on screen silently drops every file past the cap. **60** is the only check in the review suite that knows about git rename detection — `git mv old new` is one numstat entry carrying both names, and a naive commit set built from `path` alone stages the rename while HEAD's own `old` survives into the new tree, resurrecting a file the agent deleted. **84** is `toolbox-node-model`'s knobs check: the panel's SPAWNED session spec is what's displayed, never the (possibly stale) panel spec, with a fixture that deliberately makes the two disagree so the check can tell them apart. `kind-tail.1`/`kind-tail.2` are the newest checks and use scoped ids on purpose (see Conventions) — they assert every sessionless kind's rail tail and inspector `kind` field in ONE read across the whole kind list, because a new kind (Jira was found missing from three of these sites at once, one of them silently inherited from `toolbox`) is legal in every branch and `tsc` can't see a copy-paste that reports the wrong kind name. |
| `verify:review` | plain node | ~76 checks: `git-args.ts` argv/parsing, `review-engine.ts`'s `resolveRepo`/`captureBaseline` against a fake `GitRunner`, the engine's eight result arms (`never-started`, `not-a-repo`, `repo-unreadable`, `clean`, `changes`, `shared`, `baseline-lost`, `git-missing`), then a REAL git repository in a spaced temp directory, `baseline-capture.ts`'s once-only guard, and the cross-relaunch sweep. This module is the canonical instance of the three-state result rule the rest of the codebase repeats (see `verify:rail` above and the Load-bearing entry on `baselineOf`). Checks worth knowing: **16b/17** are a pair that must be read together — a FAILED `git stash create` must store NO baseline (17 is the over-correction guard: a clean tree legitimately produces no sha either, so the fix must not break that case). **19b/19c** are git's own production reachability: the runner refuses to spawn when git can't be resolved on the login PATH rather than trying the bare name against launchd's PATH, and a hung git process is TIMED OUT rather than left pending forever (with a lower bound on the timeout, since the pre-fix runner ignored its own timeout parameter entirely and still looked fine against a fast-exiting fixture). **31/32** are the baseline-capture design's core guarantee: `stash create` must leave the working tree and stash list untouched (32 is what makes 31 meaningful — a file already dirty before the baseline must report zero added lines for that dirt, or the numstat is comparing against the wrong reference and double-counts the user's own edits as the agent's). **45/46** are `reviewAt` answering from the baseline alone, never `baselineOf` — a review node must survive its subject panel closing, and excludes its own subject from the shared-repo peer count. **51** is the write verb's headline decision: commit via porcelain `git commit -m`, never the `write-tree`/`commit-tree`/`update-ref` recipe, because `commit-tree` runs NO HOOKS and would silently deliver `--no-verify` behaviour. **60/64** are the reconcile step's two directions: a failed reconcile must still report `committed` (the irreversible commit already happened), and a second `--force-remove` call handles files the commit DELETED, which the `--cacheinfo` restage can't reach (measured as `AD <path>` without it — a re-added file the commit just deleted). **65/67** are the concurrent-commit guard: HEAD is read twice, immediately before `read-tree` and immediately before `commit`, and 67 fires a REAL concurrent commit inside that exact window against real git and confirms the other committer's work survives in the committed tree, not just the working tree. Checks 99–101/113–115/etc. that need real git all SKIP LOUDLY (never silently) on a machine with none. |
| `verify:subagent` | plain node | 27 checks (one lettered sub-check) against `subagent-scan.ts`'s pure functions and `subagent-watch.ts`'s state machine driven with a fake filesystem — Claude Code project-directory slug mapping, `.meta.json` tolerance, post-spawn session-directory filtering, and the completion scanner. Checks worth knowing: **12/12b** are the over-correction guard for "ambiguous repo sharing is refused" — an `attributable` that refuses EVERYTHING would pass a naive "some panels are refused" check, so 12 asserts the POSITIVE directly (a single panel in a repository IS attributed), and 12b is the shared count the refusal and the user-facing message both derive from, so they can't drift apart. **13/14** are the completion scanner's one load-bearing distinction: a `tool_use` carrying a `toolUseId` is NOT a completion (the identical id appears twice in a real transcript — once spawning, once ending — so matching the bare id marks every subagent finished the instant it starts); only a `tool_result` completes its own id. **16/21** are the dedupe in the two arms that can each hide the other's regression: an unchanged claimed session reports nothing twice, and an unbroken ambiguous pair reports ONCE rather than every 2s tick (ambiguity is a steady, long-lived state — an undeduped implementation would re-announce it forever, invisible as anything but CPU heat). **22** is `clearDedupe()` vs `clear()` — a full `clear()` would also drop the session claim, and a reattach's later `spawnedAt` would then reject the very session directory that's correct, silently. **23** is the re-claim: a panel that `cd`s to a different repository must re-derive its claim rather than keep rendering the first repository's subagents forever. **24/25** are the record-list and description-length caps reporting their overflow count rather than silently truncating. |
| `verify:file` | plain node | 19 checks (one lettered sub-check) against `main/file-read.ts`'s five-arm read and `main/file-watch.ts`'s directory watcher, in a fixture directory with a SPACE in it (this repo's costliest silent bug, the `pane-died` redirect, shipped through eight reviews on a space-free fixture). **7/7.0** are the check this whole milestone exists for: the watch survives an ATOMIC rename (temp file written, then renamed over the target) — the exact case a bare `fs.watch(path)` misses, since the inode it pinned is gone the instant the rename lands, leaving a panel permanently stale with no error anywhere; `7.0` additionally pins that `watch()` returns the FIRST read rather than merely arming a watcher, so there's no window where main is watching and the renderer has nothing to show. **8** is the content dedupe — rewriting a file with identical bytes pushes no event, a rule stated and tested over "several debounce periods" specifically because a too-short sample stays green against an undeduped implementation. **10** proves `closeAll()` by writing AFTER the close and observing nothing arrive, never by reading an internal count — a count that reads zero while the underlying `FSWatcher` is still alive is exactly the leak being guarded against. **12** is the write verb's whole reason to exist: a stale-mtime save is refused AND writes nothing — asserting only the refusal passes against an implementation that refuses the caller and destroys the file anyway. **15** is the litter check (no stray `.tc-*.tmp` survives either path) with an honest limitation recorded in its own comment: it cannot prove the `finally { rmSync(tmp) }` cleanup block itself ever runs, only that neither path it drives depends on it. **17** is the symlink save case, where two clauses (content lands at the real target; the path is still a symlink afterward) don't discriminate independently — without `realpathSync`, both fail together, since a wrong destination fails the content read too. |
| `verify:toolbox` | plain node | 43 checks against `main/toolbox-scan.ts`'s pure parsers and `main/toolbox-read.ts`'s real-filesystem reader, in a fixture tree that is spaced AND synthesised (never the developer's real `~/.claude`, for the same reason the git and subagent fixtures are fenced). **11/12** are the check the whole milestone's privacy boundary rests on, `verify:credentials` 4's shape reached a second time: an MCP server's `env` block or an inline `--api-key=` arg must never cross the IPC boundary, asserted on the returned object's KEYS (11) with an over-correction guard proving the launcher/arg-count/env-key-*names* still survive (12) — 11 alone is satisfied by a projection that returns nothing at all. **15/16** are the same rule for a hook: only the PROGRAM crosses, with a real command length reported, and the second token is shown only when it's plainly a path (never a flag) — because a rule that tried to *recognise* a secret is a rule that can't be written correctly. **22** is the allowlist for `~/.claude.json`'s four safe fields, and its justification is a measurement rather than a principle: `projects[*].history` (the user's own past prompts) was observed present on one machine and absent on another, so a denylist is silently wrong on whichever machine it wasn't tested against. **36** is the one number in this repo that must not be copied elsewhere: `MAX_PROMPT_BYTES` (64KB) would put `~/.claude/settings.json` within ~1.4KB of being refused on a real machine, so the toolbox cap is deliberately 1MB, and the check pins the RELATION rather than the number so a future edit that lowers it fails for the right reason. **39/40** are the cache-invalidation trap: a directory's mtime does NOT move when a file inside a SUBDIRECTORY changes, so stamping only directories yields a cache correct for every ADDED skill and permanently stale for every EDITED one — 39 alone passes against a map holding the path with a constant value; 40 is what actually exercises an edit. Checks 11, 15 and 22 were each independently fault-injected (spreading the raw server, returning the whole hook command, passing the project record through) and each caught. |
| `verify:usage` | plain node | 21 checks: `usage-parse.ts`'s JSONL parser, `pricing.ts`'s four-class price table, and `usage-accumulator.ts`'s per-panel accumulator. **2/3** are one check in two halves: a chunk ending mid-record must return no entry and carry the fragment forward (2), and that carry must complete on the next chunk landing EXACTLY once (3) — 2 alone passes against an implementation that never consumes the fragment (silently losing the turn later), 3 alone passes against one that double-counts it. **10** is the whole four-token-class model's reason to exist: a cache READ must cost less than the same count of FRESH input — its own fixture (cache dominating input by ~60,000x) is satisfied just as well by a price table with the two rates TRANSPOSED, since it only proves a cache-heavy total costs *something*. **11** is `costOf`'s asymmetry: an UNKNOWN model returns `undefined`, never `0` — a zero renders a confident "$0.00" beside a visibly-working agent. **18** is the dedupe nothing else in the repo could catch: a read that adds nothing must return `undefined` rather than a fresh, equal object, or the Cost section re-announces an unchanged total every tick (invisible as anything but heat). **19** is `resetIfShrunk`: a transcript that SHRANK (truncated or replaced) resets the panel's whole state rather than reading from a stale offset into garbage. |
| `verify:tmux` | plain node | 29 checks (one lettered sub-check): `tmux-args.ts` argv/config/version/list parsing, `tmux-probe.ts`'s backend selection, the quoting of the `pane-died` exit-code redirect against a SPACED `exitDir` (18 — this repo's costliest silent bug, see the Load-bearing entry), and exact-match `=` on every kill-session target (19 — without it, panel `n1`'s probe reads `n12` as its own surviving session). Socket-resolution checks (20–25) pin dev vs. packaged landing on different sockets, an explicit override beating both, and a blank override falling back to the default rather than leaking through to tmux's own default socket. **28** is the newest and the one worth knowing: an older FIVE-column `list-panes` line (from a tmux server a previous build left running) still yields an entry rather than being dropped — a running server ignores a new client's config, so a widened output format has to tolerate the old shape from a stale server, or a cosmetic gap turns into boot-reconciliation reading a panel as dead. |
| `verify:agent-state` | plain node | 25 checks (one lettered sub-check): `scanForBell`'s escape-sequence scanner and `nextState`'s state machine. The two that matter most: **2/3** pin that a BEL- or ST-terminated OSC window-title change rings ZERO bells — a bare `indexOf(0x07)` would paint every title change as an attention-worthy bell. **6–8** pin the scanner across a SPLIT chunk (an OSC or bare BEL straddling two 16ms flushes), which is the whole reason scanner state is carried between calls rather than reset per call. **16–19** pin `wants-you` as STICKY once entered (a bell from busy or idle both land there; further output and even an hour of idle ticks do not clear it) and **23/24** pin `exited` as terminal and unconditional, overriding even a mid-`wants-you` panel the instant its PTY exits. |
| `verify:styles` | plain node | 11 checks against `src/renderer/styles.css`, read as TEXT rather than parsed (a CSS library would be the heaviest dependency in the cheapest tier this repo has, and the facts under test — a hardcoded colour, a fractional opacity, an undeclared token — are lexical, not cascade, facts). 1 is no hardcoded colour outside a theme block (hex/`rgb()`/`rgba()`/`hsl()`) with a two-entry explicit allowlist for translucent whites that must composite over whatever the active theme's ground is — the hex-only first draft of this check passed green with eight surviving `rgba()` near-duplicates of already-declared tokens, which is why it greps *notation* rather than value. 2–8 assert every `var(--token)` is declared, no fractional `opacity`, no literal type/radius/spacing scale values, and a structural/colour split between bare `:root` and `[data-theme]` blocks. 9/10 assert a `prefers-reduced-motion` block and at least one `:focus-visible` rule exist. **11 is the only check that COMPUTES rather than greps**: it recovers every theme colour and measures real WCAG contrast for text against every surface it can land on, so a contrast claim in a commit message can't go stale silently. Its own header comment records exactly what it can't see (only `px` units, only `padding`/`margin`/`gap`, a limited token-name regex) — read that before trusting a green run as proof the app looks right; there is no visual regression test in this repo, and that's a stated position, not an omission. |
| `verify:package` | plain node | 10 checks against `build/builder-config.cjs`'s returned value (a *function*, not a static JSON blob, which is what lets a check assert properties of a computation): `node-pty` unpacked from the asar with a depth-independent pattern, asar actually on, the `files` globs, app identity/output dir, code-signing explicitly *decided* rather than merely unmentioned, and the build architecture being a parameter rather than a hardcoded constant. |
| `verify:packaged` | real Electron, **not in `npm run verify`** | 11 checks: packages with `electron-builder --dir` and launches the produced binary with a stripped PATH, a throwaway `--user-data-dir`, and a scratch tmux socket. Confirms the app survives startup with `node-pty` loading from inside the asar, recovers a PATH launchd never gave it, uses the scratch socket and the throwaway user-data-dir for real (not falling back to the real one), and actually spawns a PTY. **10/11 are the single-instance lock pair**, the only tier that can hold them because it needs two real app PROCESSES: 10's discriminating clause is the ABSENCE of a `[startup] packaged=` line from the losing instance — a loser that fully booted (ran the shell probe, started a tmux client, wrote the store) and only THEN quit satisfies "it exited" while having already done every destructive thing the lock exists to prevent (watched RED before the fix: the loser printed its own summary and never exited at all). 11 is the opposite failure mode — a gate written backwards, where the ARRIVING instance takes over and the INCUMBENT quits, satisfies 10 completely; what separates them is checking the incumbent's PTY pid is still alive, since it's the running agent a user loses, not the window. Kept out of the default chain because it rebuilds native modules and reaches electron-builder's cache (minutes, plus network); run it before cutting a release. |
| `verify:pty` | Electron as node | 10 checks: `node-pty` behaviour end to end. Deliberately duplicates `shell-env.ts`'s probe and `pty-manager.ts`'s batching by hand so it can test them without Electron's app lifecycle — mirror any behaviour change in both places. |
| `verify:pty-manager` | Electron as node | 43 checks (several lettered sub-checks) against the real `PtyManager` on both the direct backend and a real `TmuxBackend` on a throwaway socket: session creation, detach/reattach at the same pid, cross-manager list, exit-code fidelity, destroying a session this manager never spawned, a prefix-colliding kill target leaving the wrong session alone, reload-survival (`reattached: false` then `true`), the agent-state wiring reaching real `IPC.AGENT_STATE` events, the baseline-capture once-only guard and its mirror on kill, session-pin persistence, the usage-tick dedupe and its real-file shrink/multibyte-split fix, and pure `agentArgs` argv building. Checks worth knowing individually: **17** is the dedupe count that separates a de-duped implementation from a naive one — its fixture prints forty lines with a real gap between each specifically so a burst produces ONE `busy` event under the real implementation and forty-two under a naive one (deleting the dedupe was confirmed to make this check pass against a *single-printf* fixture, which is why the multi-line fixture is load-bearing and must not be shrunk). **20** is `kill()`'s mirror of `detachAll()`'s reload survival: the pane pid is the ONLY observable that separates "the process was demoted" from "it was disposed and silently respawned" — every count and list-based check stays green against that regression. **21/22/22b** are the once-only baseline-capture guard (a second `create()` at the same panel id — exactly what a reload does under tmux, reattaching to a session that may have run for an hour — must not recapture and reset the baseline to "now") and its mirror on kill (dropping the baseline so a recycled id can't inherit a dead panel's snapshot), including the no-local-session branch. **23/24** are the live-cwd poll's dedupe, counted rather than merely asserted absent, over a window spanning several ticks (a too-short window stays green against an undeduped implementation) — 24 is `detachAll()`'s own half of the same clear, since a reload leaves the manager's map intact and a reattach at an unchanged cwd would otherwise never re-announce it. **29** is the usage-tick's real bug catch: a shrunk/replaced transcript was read at the STALE offset FIRST (short-circuiting to empty) and only THEN reset, silently skipping the whole replacement file forever with no correction ever sent — reproduced against a real truncated file, not a unit-level `resetIfShrunk` call, because that function alone already had a passing check and didn't catch this. **31** is the multibyte split: decoding independent byte ranges directly turns a UTF-8 codepoint straddling a read boundary into a replacement character on BOTH sides — reproduced against a real file whose split point is the file's own size at the first poll, so no timing guess is needed. All tmux-block checks skip loudly (never silently) on a machine with no tmux binary. |
| `verify:window` | real Electron | 4 checks: renderer teardown reaches the PTY layer. |
| `verify:ipc` | real Electron | 1 check: every INVOKE channel in `Object.values(IPC)` has a main-process handler — 45 channels as of the newest milestone that added one (`file:write`); a **send**-direction event (`session:live`, `subagent:state`, `usage:panel`, `canvas:counts`'s reply, etc.) deliberately does NOT move this count, since nobody is required to `ipcMain.handle` a message main only sends — see "`session:live` is an `IPC_EVENTS` member" below for why that boundary keeps getting reached and declined rather than crossed. |
| `verify:canvas` | real Electron | 6 checks: real input into the built renderer. |
| `verify:xterm` | real Electron | 6 checks: an xterm `Terminal` survives its host being detached and reattached — this is a spike proving the M3 eviction design's core assumption (a terminal keeps accepting writes while off-DOM and repaints on reattach), not a regression suite for one module. It runs a DOM-renderer control terminal alongside the WebGL one under test, because `.xterm-rows` stays empty under WebGL even when healthy — DOM text content is not a valid repaint signal there. |
| `verify:panels` | real Electron | ~185 checks (many lettered sub-checks): the single largest suite, driving a real renderer end to end against `out/renderer/index.html` through a hand-wired Electron entry point (`scripts/panels-entry.cjs`) that stands in for `main/index.ts`'s own `registerIpcHandlers` wiring, reaching the registry through eight narrow `window.__m4a*` test hooks `Canvas.tsx` installs. It covers, across every milestone: tiering/drag/resize/wheel-ownership/close/z-order/id-uniqueness, dormant restore and wake, layout persistence, undo/redo, boot reconciliation, presets end to end, the command palette (open/focus/drill-in/confirm/hover/auto-repeat), the header's honest-chain label resolution, the cascade spawn, settings, agent-state (bell/OSC-title/acknowledge), attention pips and the nav grid, workspace switching and merge, the shell frame (rail/inspector/tree collapse), the inspector and restart-in-place, the Changes/review-node/link/file-panel/subagent-node/toolbox-node features end to end against real git and real fixtures, the credential boundary, the cost readout, the marquee/move/merged-view/workspace-chords, and the editable file panel's compare-and-swap save. A representative set of checks worth knowing by number, because each is the ONE check that would catch a specific regression nothing else in the repo can see: **10** dispatches a zoom mid-drag specifically to separate a correct recompute-from-origin drag implementation from one that accumulates screen-space deltas (see Gotchas). **32** is the only preset check that sends nothing itself — it seeds a non-shell `defaultPresetId` on disk and reads the template back out of a real `did-finish-load` push, proving the module-scope subscription design (see "The default preset is caught at module scope" below) rather than driving the channel by hand, which is precisely how the feature could stay inert while every hand-driven check passed. **49d/49e** pin "popping a drill-in returns the selection to its door" from both the arrow-key path and the top-bar-gear path (which entered the scope with no door ever traversed, so an implementation that merely remembered "the row I entered from" fails 49e alone). **72c** is a mouse/keyboard interaction with no equivalent anywhere else: a second `mousemove` at IDENTICAL coordinates (which Blink re-dispatches after a scroll to refresh `:hover`) must move nothing, or an ArrowDown that scrolls the list hovers whichever row slid under a stationary cursor and drags the selection back. **83** proves a bell reaches the TARGET rail row's dot and no other, with a non-vacuity clause that at least one OTHER row is carrying a real (non-degenerate) agent state — but its own comment records what it can't prove: individual per-row subscription vs. one list-level read passed down (see the Load-bearing entry on rail-row subscription). **90/92** are the inspector's save-panel action driven with `selectedId` and `focusedId` DELIBERATELY DIFFERENT — the exact defect `preset:save-panel` exists to fix, since a click that only *selects* a rail row is the common case that a focus-based capture gets wrong — and restart-in-place's pid-changed-and-wants-you-cleared assertion read in one go, since each half alone passes against a different real bug. **94** regex-counts `registry.dispose` call sites in `Canvas.tsx` (currently five: close, undo/redo, reset, workspace-delete, restart) and `pty.kill` callers inside `session-registry.ts` (exactly two) directly from source text, because no runtime behaviour can observe a caller *count* — see "Undo removing a panel must dispose its session" below. **100b** is the stale-render fix: selecting a new panel must not show the PREVIOUS panel's Changes summary during the async gap before the new query resolves — a rewrite that only cleared the summary on select-to-null let a real IPC round trip render panel A's data under panel B's heading. **103/110/111/136/137/164/165** are the same non-vacuity shape repeated for every sessionless panel kind (review node, file panel, toolbox node): closing one must send NO `pty.kill` for its id (proven against a shadowed kill-recorder, since a kill aimed at a session-less id is silently swallowed at every layer below the IPC door and every renderer-visible fact stays identical without the kind guard), while a REAL terminal panel closed in the same window IS recorded, so the check can't pass by recording nothing at all. **110** specifically is proven only by fault injection (pointing a review node's query at `review:panel(subjectId)` instead of `review:at(baseline)` turns it red while an otherwise-identical check with the subject still alive stays green) because it can't be watched failing against otherwise-correct code. **145/148** are the same pid-preservation argument (checks 20, 64, 95 above) reached by two more doors: moving panels between workspaces must not dispose-and-respawn, and entering the merged view must spawn NOTHING for foreign panels — 148 was only caught by measurement (an ordering fix moved `setMergedData` below its `pty.list()` await) and its session count is deliberately scoped to the two foreign ids under test rather than the whole canvas, because an unrelated in-flight spawn elsewhere makes a whole-canvas count flaky. **151** reads geometry read-only from the STORE side after a flush while still merged (no rect drifted, no id was added to any workspace) — its first form only checked ids already present and missed its own headline failure (a save effect writing the *displayed*, lane-shifted panels back to disk). **157** is the file-tree click-to-paste path, and the only check in the whole file-tree milestone that CANNOT be written with a dispatched event: a synthetic `MouseEvent` never moves DOM focus regardless of whether `preventDefault()` fires, so this uses a real `sendInputEvent` to prove DOM focus stays on the previously-focused panel while the path still reaches its PTY (fault-injected: deleting the row's `preventDefault` turns this red, and 75c beside it). **172** is the newest and highest-value: the agent-knobs template-to-spec copy is field-by-field in `Canvas.tsx`, so a dropped key is legal TypeScript and produces a panel with no knobs indistinguishable from a user who asked for none — watched RED doing exactly that; it asserts two independent components (the chip and the inspector row) rendering the same `session.spec`, rather than widening a test hook to carry the answer. The suite's own watchdog is 300,000ms, raised from 120,000ms once measured runtime (from ~175 to ~185 checks added across several near-simultaneous branches) exceeded the old bound — a watchdog that can't be met reports a hang that isn't there and destroys the real results, which is strictly worse than no watchdog; whoever next finds themselves raising it a third time should split the suite instead of raising it again. |

None need a display; the real-Electron ones open a window with `show: false`. There is no
test-name filter in any of them — each runs everything and exits non-zero on any failure.
To add a check, append an `ok(...)` assertion in the IIFE.

**A check that THROWS aborts the run, so every check written after it never executes — and
its RED is therefore not evidence.** These are single scripts with no per-check isolation:
`ok(...)` records a failure and carries on, but an uncaught exception — calling an export the
module does not have yet, indexing a `querySelector` that returned `null` — ends the process
where it stands, and every assertion below it is simply never reached. `verify:panels` softens
that only at the reporting end — its body is wrapped in a `try` that records an
`infrastructure` failure and still prints a summary — and everything after the throw is lost
there too. When writing checks test-first, note which checks a throw prevented from running
and confirm their RED **separately** — a suite total that drops by four proves nothing about
which four. And prefer guarding a call that may not exist (`if (row) row.run()`) over making
it bare, which is exactly why `verify:palette` 66 is written the way it is: an absent row would
otherwise have taken 66b's RED down with it.

**Why the Electron binary and not `node`.** `node-pty` is a native module compiled against
Electron's ABI by the `postinstall` `electron-rebuild`, so it will not load under system
Node. `verify:pty` and `verify:pty-manager` therefore run under Electron with
`ELECTRON_RUN_AS_NODE=1`; `verify:window`, `verify:ipc`, `verify:canvas`, `verify:xterm`, and
`verify:panels` need the real app lifecycle and `unset` it instead. Every other suite listed
above as "plain node" gets there the same way: the module under test either imports neither
`electron` nor `node-pty` at all (`main/git-args.ts`, `build/builder-config.cjs`), or it takes
its Electron-touching dependency as an INJECTED parameter rather than importing it directly —
`session-registry.ts` takes its IPC bridge and terminal factory, `layout-store.ts` takes its
filesystem paths, `tmux-args.ts`/`session-backend.ts` split the pure argv builders from the
module that actually shells out to tmux, `review-engine.ts` takes a `GitRunner`, `credential-store.ts`
takes its crypto and file path, `main/presets.ts`'s `resolveAvailability` takes `which` rather
than importing `shell-env.ts`. Touching disk directly (`main/prompts.ts`, `main/file-read.ts`,
`main/file-watch.ts`) does NOT disqualify a module from this tier — only importing `electron`
or `node-pty` does. The palette's three pure modules (`fuzzy.ts`, `palette-model.ts`,
`commands.ts`) hold no reference to the registry, viewport or React, which is what lets
`verify:palette` assert on *disabled reasons* rather than rendered DOM.

**`verify:pty` duplicates production code on purpose.** It re-implements `shell-env.ts`'s
probe and `pty-manager.ts`'s batching by hand so it can test them without Electron's app
lifecycle. If you change either module's behaviour, mirror it there. (`verify:pty-manager`
drives the real module and does not duplicate anything.)

**`verify:canvas` and `verify:panels` are the suites that consume the build.** Both load
`out/renderer/index.html` in a hidden window, which is why `npm run verify` runs `build`
before them — run either alone against a stale `out/` and you are testing the previous
commit. `verify:panels` is also its own Electron entry point (not `out/main/index.js`), so
`scripts/panels-entry.cjs` hand-wires `resolveShellEnv` + `registerIpcHandlers` + a
`PtyManager` to fix that, the same pattern `verify-ipc-surface.cjs` and
`verify-window-lifecycle.cjs` use. The other Electron suites esbuild their own entry from
source into `out/verify/`, so they are always current without a build step.

**`verify:panels` reaches the registry through eight narrow `window.__m4a*` hooks
(`__m4aScale`, `__m4aWrite`, `__m4aSelection`, `__m4aCellToScreen`, `__m4aGrid`,
`__m4aViewport`, `__m4aScrollY`, `__m4aSessions`) installed by `Canvas.tsx`.** The registry is a
module-level closure by design (see "Two lifetimes, not one" below), and `executeJavaScript`
has no other route into it. Keep the set narrow and named by what each one answers — the
alternative is exposing the registry itself and letting the suite drift into testing internals
instead of behaviour.

**Path aliases (`verify-*.cjs` esbuild configs).** Every plain-node verify bundle that imports
a real VALUE (not just a type) across the `@shared`/`@renderer` boundary needs that alias wired
into its own esbuild config — the electron.vite config and tsconfigs wiring it up elsewhere
doesn't help these hand-rolled bundles. This has broken silently, repeatedly, in exactly one
shape: a module that used to export only `import type`s (invisible to esbuild) starts exporting
a real value, and the bundle that imports it stops resolving — with the failure mode being a
**hang**, not a red suite, when the bundle in question is `verify:panels`' or `verify:canvas`'s
own main-process entry point (`buildSync` throwing at module scope, before any window exists,
which Electron's uncaught-exception handling turns into something CI has to time out rather
than fail). The fix is always the same two lines (the `@shared`/`@renderer` alias added to that
one `buildSync` call), and it does not transfer between bundles — each `buildSync` call is its
own esbuild invocation with its own config, so a fix to one does not cover a sibling that
reuses the same source file through a *different* entry point. **The only reliable way to know
whether a given bundle needs an alias is to delete it and build** — reading the imports and
reasoning about which are `import type` has been wrong repeatedly, because a re-export chain or
a value imported three hops down a bundle is easy to miss by eye.

## Architecture

Three processes, one shared contract. **The main process owns every PTY; the renderer never
spawns a process.**

```
renderer --invoke--> pty:create / pty:write / pty:resize / pty:kill / pty:list --> main
renderer --invoke--> layout:load / layout:save                                 --> main
renderer --invoke--> session:backend                                          --> main
renderer --invoke--> preset:list / preset:rename / preset:delete               --> main
renderer --invoke--> preset:set-default / preset:spawn-by-id                   --> main
renderer --invoke--> preset:save-panel                                         --> main
renderer --invoke--> prompt:list / prompt:save / prompt:delete                 --> main
renderer --invoke--> settings:list / settings:set                              --> main
renderer --invoke--> canvas:request-reset                                      --> main
renderer --invoke--> agent:acknowledge                                         --> main
renderer --invoke--> workspace:list / workspace:create / workspace:rename      --> main
renderer --invoke--> workspace:delete / workspace:activate                     --> main
renderer --invoke--> workspace:merged / workspace:move-panels                  --> main
renderer --invoke--> review:panel / review:baseline / review:at / review:diff  --> main
renderer --invoke--> review:commit                                             --> main
renderer --invoke--> credential:list / credential:set / credential:delete      --> main
renderer --invoke--> credential:verify                                         --> main
renderer --invoke--> file:open / file:read / file:close                       --> main
renderer --invoke--> toolbox:read / toolbox:permissions                       --> main
renderer <--send---  pty:data (batched ~16ms) / pty:exit                       <-- main
main     --send-->   edit:copy / edit:paste / edit:undo / edit:redo            --> renderer
main     --send-->   canvas:counts / canvas:reset                              --> renderer
main     --send-->   preset:spawn / preset:default / preset:capture            --> renderer
main     --send-->   agent:state                                               --> renderer
main     --send-->   session:live                                              --> renderer
main     --send-->   subagent:state                                             --> renderer
main     --send-->   file:changed                                              --> renderer
main     --send-->   usage:panel                                               --> renderer
```

The nine invokes M5b added all point the same way, and the direction is the point: M5a's
preset channels are main -> renderer because the *menu* is main's, while the palette is the
renderer's, so its mutations are invokes. Two of them exist purely so the palette runs main's
code rather than a second copy — `preset:spawn-by-id`, because only main can resolve an
*absent* `command` into the user's login shell (see "An absent `command` must stay absent"
below), and `canvas:request-reset`, because main owns the confirmation dialog and the counts
request. A renderer-side reconstruction of either would drift from the menu path silently, and
the two paths would then disagree only in the cases nobody tests.

The four `credential:*` invokes M14 added are the only ones on that list defined as much by
what they do NOT carry, and the absence is the milestone: there is no `credential:get`.
`credential:list` returns metadata (service, label, timestamps), `credential:set` and
`credential:delete` return a result, and `credential:verify` sends the token to GitHub and
hands back what GitHub said — so the plaintext exists in exactly one process and crosses the
bridge in neither direction. See "There is no `credential:get`, and its absence is the design"
below for why that claim is pinned as source text rather than as behaviour.

`canvas:counts` reverses the usual direction: main sends it and the renderer replies, on an
ephemeral `canvas:counts:reply:<timestamp>` channel invented per call in `main/ipc.ts` and
never declared in `ipc-contract.ts` — which is why `verify:ipc`'s "every channel has a handler"
check does not, and should not, cover it.

- `src/shared/ipc-contract.ts` — single source of truth for channels and the
  `window.canvas` bridge type. Imported by all three processes; add a channel here first.
  `verify:ipc` fails if a channel there has no main-process handler.
- `src/main/pty-manager.ts` — owns the `Map<PanelId, Session>`. All PTY lifecycle.
- `src/main/window-lifecycle.ts` — detaches (not kills) a window's sessions when its renderer
  navigates or closes, so their tmux sessions survive; see "One operation became three" below.
- `src/main/credential-store.ts` — the encrypted-at-rest credential store, over its own
  `userData/credentials.json`. Takes its crypto and its file path as injected dependencies
  (`credential-crypto.ts` is the `safeStorage` adapter), so the whole store — the refusal path
  included — runs under plain node in `verify:credentials`. Its `read()` is the one function
  in the app that returns a plaintext token, is main-internal by construction, and has exactly
  one caller: `credential-verify.ts`.
- `src/main/prompts.ts` — reads `.claude/commands/*.md` under a panel's cwd and merges them
  with the saved store. Read-only, capped, and plain-node testable; see "Project prompts are
  read, never written" below.
- `src/preload/index.ts` — `contextBridge` exposes `window.canvas`. Every `on*` subscribe
  returns its own unsubscribe so React effects can clean up without stacking listeners.
- `src/renderer/session/session-registry.ts` — owns every panel's **session** (its xterm
  `Terminal` and its PTY) for the lifetime of the renderer, in a module-level registry outside
  React. Created once, disposed once. `pty.kill` has exactly two callers in the renderer —
  `disposeAll` and `dispose(id)` (explicit panel close) — and a tier
  change must never reach either. Since M4c `disposeAll` has no production call site at all:
  renderer teardown is main's (see "No `beforeunload` teardown" below).
- `src/renderer/components/TerminalPanel.tsx` — the **view**: one panel's React component,
  mounted and unmounted freely by tiering, owning nothing. It renders whichever `SessionHandle`
  the registry hands it and calls back into the registry (`attachSlot`/`detachSlot`) around its
  own mount lifecycle.
- `src/renderer/canvas/lod.ts` — pure tier-assignment function; decides which panels' sessions
  are attached (`live`) vs. carded, based on viewport, focus, and budget.
- `src/renderer/terminal/create-terminal.ts` — the only place a `Terminal` is constructed, and
  it returns one **detached**. `src/renderer/terminal/session-factory.ts` implements
  `SessionHandle` over `attachTerminal`/`detachTerminal` from the same module, and is what the
  registry's session-factory dependency actually is at runtime.

The session/view split is the milestone's whole point: in M1, "this component is unmounting"
and "this panel is going away" were the same statement. Culling makes them different
statements, and `session-registry.ts` is where that difference lives.

The canvas is layered so that the math is testable without a browser, and each layer may
only import downward:

```
src/renderer/canvas/
  viewport.ts       pure math — no DOM, no React imports. Enforced by review and by the
                    fact that verify:viewport runs it under plain node.
  canvas-input.ts   platform events -> pan/zoom intents — no React. Takes a plain
                    {deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey}, not a
                    WheelEvent, so it stays a pure function.
  lod.ts            pure tier assignment — no DOM, no React. Bundled alongside viewport.ts
                    into the plain-node verify:viewport target.
  useViewport.ts    React state + listener wiring — the only place the two meet. The
                    setter stays private on purpose: nothing outside should move the camera.
  Canvas.tsx        clipping host + the single transformed world layer; owns the registry,
                    the tier-assignment effect, and the one Cmd+C/Cmd+V subscription
  CanvasHud.tsx     zoom % and world-space cursor — the fastest way to see the math misbehave

src/renderer/palette/
  fuzzy.ts          pure subsequence match + score + match positions — no DOM, no React
  palette-model.ts  SECTIONS (ordered data, not a union), the Command shape, section-first
                    filter/sort, bestMatchIndex, splitHighlight, runnable-row stepping
  commands.ts       pure list construction: rows in, Command[] with disabled reasons out.
                    Takes preset/prompt/panel rows and a captured id as plain data, so the
                    whole command surface is testable without mounting anything.
  usePalette.ts     open/close state, the Cmd+K toggle, and the captured focus id — the
                    hook that decides who owns the keyboard (see below)
  Palette.tsx       the overlay: the input, the scope chip, the sectioned rows, the footer,
                    confirm mode, its own edit:copy/edit:paste subscriptions, and the
                    mousedown guard that keeps the canvas out

src/renderer/session/
  panel-session.ts      the PanelSession/SessionHandle/SessionFactory interfaces — what the
                        registry needs from a terminal, with nothing xterm-specific in it
  session-registry.ts   the registry itself (see above)
  useRegistry.ts        useSyncExternalStore glue so React re-renders on registry.version()
  file-store.ts         another module-level store, subscribed per panel id like agent state
                        and live sessions — main's answer to "what does this file say now",
                        never a second author of it

src/renderer/file/
  file-node-model.ts    pure view-model construction: a FileResult in, a heading/directory/
                        numbered lines/note out. Bundled into the plain-node verify:rail
                        target alongside inspector-fields.ts and rail-sections.ts, the same
                        precedent review-node-model.ts already set for a sessionless kind.
  FileNode.tsx          the component: an EDITABLE (M22), live-watched file on the canvas
                        — no PanelSession, no xterm, no process. Owns the draft, the
                        compare-and-swap token, and both halves of the truncation gate
```

`@shared/*` and `@renderer/*` path aliases are declared in **both** `electron.vite.config.ts`
and the tsconfigs — adding one means editing both.

## Load-bearing details

Each of these exists because the naive version fails *silently*. Don't undo them.

> **How to read this section.** An entry is a paragraph whose first sentence is
> **bold** and normally names its own files in backticks; sub-points inside one
> entry are bold too. Entries are in rough milestone order, not subsystem order.
>
> **So search it, don't scroll it, and search for the FILE rather than the
> symptom.** Nearly every entry names its own module, so `grep -n 'pty-manager'`
> or `grep -n 'session-registry'` over this file is the reliable way in; the
> subsystem keyword clusters worth knowing are `pty-manager`/`tmux`/`shell-env`,
> `Canvas.tsx`/`viewport`/`lod`, `panels.ts`/panel kinds, `palette`,
> `layout-store`/`layout-schema`, `review-`/`git-`, `rail-`/`inspector-`,
> `credential`, `file-`, `toolbox`, `usage`/`pricing`, `subagent`, and
> `-store.ts`. Searching the SYMPTOM ("panel is blank") mostly fails, because
> the entries are written from the cause. Where one entry restates a rule
> another already states in full, it says so and cross-references rather than
> re-deriving the "why" — search the cross-referenced name if you land on the
> short version first.

**Login-shell PATH (`src/main/shell-env.ts`).** macOS GUI apps are launched by launchd, so
they inherit a bare PATH and no dotfile exports — `claude`/`codex` work in Terminal but are
"command not found" in the app. We probe `$SHELL -ilc env` once at startup (`-i` is what
makes zsh read `.zshrc`) and use that env for every PTY. A non-zero exit from the probe is
normal; success is judged by whether a `PATH` came back. The fallback logs loudly on purpose.
`tmux` (`tmux-probe.ts`) and `git` (`main/index.ts`'s `gitPath`) are resolved by absolute path
from this same login env, for the identical reason and after it: spawning either by bare name
against launchd's bare PATH silently fails or resolves the wrong binary, and both are logged
loudly, once, when unresolved — a git-dependent feature (the Changes section) used to render as
the ordinary, silent `not-a-repo` case rather than the actual `git-missing` arm when this
resolution was missing, which is worse than an error because it looks like most panels.

**The renderer has no `process.env` (`shared/types.ts`, `main/pty-manager.ts`,
`renderer/panels/panels.ts`).** electron-vite compiles `process.env` in the renderer bundle
down to a literal `{}`, so `process.env.SHELL ?? '/bin/zsh'` there is not a lookup with a
fallback — the fallback is the *only* branch that ever runs, and a bash or fish user silently
gets zsh while the code reads as though it asked. `PanelSpec.command` is therefore **optional**:
absent means "the user's login shell", and main resolves it from the env it already probed
(`resolveCommand`, same fallback chain as `shell-env.ts`). `panels.ts` omits it; anything in
the renderer that displays `spec.command` needs a label for the absent case, because only main
knows the answer. Never reintroduce a `process.env` read on the renderer side.

**Output batching (`pty-manager.ts`, `FLUSH_INTERVAL_MS = 16`).** One IPC message per PTY
read floods the renderer's event loop and locks the UI — an agent TUI repainting emits
thousands of reads/sec. Measured: 33,198 reads → 105 messages. The pending buffer is flushed
*before* `pty:exit` is announced, or the last lines (usually the error explaining the exit)
are dropped.

**Renderers die; sessions do not (`window-lifecycle.ts`).** Cmd+R and Cmd+W destroy the page
without running React cleanup, so the renderer never sends `pty:kill`. Something main-side
still has to act, or the abandoned handle survives and the next `pty:create` throws "already
has a live PTY" — a dead panel with no recovery short of quitting. Since M4c that action is
`detachAll()`, not `killAll()`: the local handle (a tmux *client*) dies and the tmux
*session* keeps running the agent. `pty:list` is the channel the fresh renderer reconciles
against — it asks the backend first, so it sees sessions this run has never spawned and
restores those panels non-dormant. Without tmux the app degrades to the old behaviour and the
processes really do die; see "One operation became three" below.

**Cmd+C / Cmd+V (`src/main/menu.ts`).** The stock `'copy'`/`'paste'` menu roles drive
`document.execCommand`, but xterm's selection under the WebGL renderer is not a DOM
selection — the role copies nothing or the wrong thing. We keep the accelerators but forward
to the renderer, which asks xterm directly. **Ctrl+C is deliberately untouched** and flows to
the PTY as SIGINT. This is **one subscription in `Canvas.tsx`**, not a per-panel one: it reads
whichever session is currently focused (via a ref mirroring `focusedId`) and calls
`getSelection()`/`paste()` on that session's `SessionHandle` — a per-panel subscription would
mean every panel but the focused one receives and discards the event.

**Two lifetimes, not one (`session/session-registry.ts`).** A panel's session — its
`Terminal` and its PTY — is created once and disposed once, in a module-level registry outside
React. The React panel (`TerminalPanel.tsx`) is mounted and unmounted freely by tiering and
owns nothing. Confusing "this component is unmounting" with "this panel is going away" kills a
running agent with no error anywhere. `pty.kill` has exactly two callers, both inside
`session-registry.ts` — `disposeAll` (no production caller since M4c) and `dispose(id)` — but
**a tier change must never reach either one.** Neither caller is guarded on whether the session
has ever spawned: main's `PtyManager.kill` reaches `backend.destroy(panelId)` even for an id it
has no local session for, because under tmux a never-spawned panel can still own a surviving
session (off-screen or over `LIVE_BUDGET`), and skipping the kill there would leak it forever.
`dispose(id)` has five call sites in `Canvas.tsx` — close button, undo/redo removing a panel,
canvas reset, workspace delete, and restart-in-place — and every one keeps the `pty.kill` count
at two precisely by routing through `dispose(id)` instead of calling it directly; re-derive
this count from source (`grep -n "registry.dispose" Canvas.tsx` / count `pty.kill` callers in
`session-registry.ts`) rather than trusting a stale number here — `verify:panels` 94 pins both
counts by reading the source text for exactly this reason. `dispose(id)` itself also sends
`pty.kill` even when this renderer holds no LOCAL session for that id — the identical shape one
door further out, needed because a hidden workspace's panel is absent from a fresh reload's
registry (`sessions.get(id)` is `undefined`) even though its tmux session may still be alive;
skipping the call there once meant deleting a hidden workspace disposed nothing and its
sessions ran forever, unreachable, burning tokens with no UI able to stop them.

**Lazy spawn (`session-registry.ts`).** A PTY is created when its panel first goes live, not
at startup — "fit before spawn" (below) needs real cols/rows from an attached, laid-out node,
and a twelve-panel restored canvas must not launch twelve agents on boot. `LIVE_BUDGET` (8)
caps how many are live at once regardless of panel count, enforced in TWO places: `assignTiers`
never promotes more than the budget, and `Canvas.tsx` re-checks it when applying the tier map,
because a held-back demotion (below) is a live panel `assignTiers` did not count — without the
second check, panning past twelve panels left all twelve live for the gesture's duration, a
WebGL-context count against a browser cap that is permanent for the run once exceeded
(`create-terminal.ts` sets `webglDisabled`).

**Promote now, demote later (`Canvas.tsx`, `DEMOTE_DELAY_MS = 250`).** Promotion to `live` is
applied immediately; a demotion to `card` is held for 250ms and re-applied only if still true
after the delay — without it, a panel sitting at the viewport edge destroys and recreates a
WebGL context every frame while panning. The release timer is armed against a **ref**, never
re-armed in an effect cleanup keyed on `viewport` (which changes every wheel event) — a cleanup
there would let a continuous pan restart the clock forever and nothing would ever demote. The
hold also yields to the budget: when live-plus-held would exceed `LIVE_BUDGET`, the oldest
holds release immediately.

**Focus is released on a background click (`Canvas.tsx`).** `assignTiers` pins the focused
panel live unconditionally, so an id that is never cleared holds a WebGL context and a budget
slot forever, and keeps routing `Cmd+C` to a panel whose textarea the browser blurred long ago.
Background `onMouseDown` clears `focusedId` alongside `selectedId` — this is also what lets a
panel the user typed into ever demote.

**Pointer coordinates are corrected, not gated (`components/xterm-pointer.ts`,
`canvas/pointer-correct.ts`).** xterm computes a cell from `(clientX - rect.left) /
dimensions.css.cell.width` — `rect.left` is transform-aware (screen px) and `cell.width` is
transform-blind (CSS px), so under `scale(k)` xterm reports a column `k` times off. Rather than
gating clicks to a narrow scale band, `installPointerCorrection` is a **capture-phase listener
on `document`** (xterm binds its own drag listeners to the document once a gesture starts, so a
panel-scoped listener would correct mousedown and then miss every subsequent move) that pins
the target slot at mousedown and re-dispatches a corrected synthetic event. Three fields on the
synthetic event are each individually load-bearing and fail silently if dropped: `detail`
(click count — drop it and double/triple-click select stops working), `buttons` (drop it and
every corrected move reads as a hover, so selection never extends), and the modifier flags. A
`WeakSet` marks synthetic events to stop the capture listener recursing on its own re-dispatch.
At `scale === 1` the interceptor returns before doing any work. **Known limit**: correction is
anchored to the slot pinned at mousedown, so a hover `mousemove` with no prior in-slot mousedown
is uncorrected — a mouse-reporting TUI still sees `k`-times-wrong coordinates on hover.

**`version` exists only so `memo` can see a mutation (`TerminalPanel.tsx`,
`session-registry.ts`).** `TerminalPanel` is wrapped in `memo`, and the registry mutates a
`PanelSession` **in place** — `registry.get(id)` returns the same object reference forever, so
`session` alone is always "equal" by shallow comparison no matter how its tier/status/spawned
fields flip underneath it. `Canvas.tsx` passes `registry.version()` down purely so the shallow
compare has something that changes: without it, promoting a panel never re-renders it and no
PTY is ever spawned. `version` bumps only on tier/status/focus/exit — never on 16ms-batched PTY
data, never on pointer moves — which is what keeps the memo blocking the 60Hz pan/zoom cascade
from reaching every panel. This is the FIRST of several module-level stores in this codebase
that must never ride this counter for a higher-frequency fact; see "One counter, many stores
that must stay off it" below for the canonical statement and every instance.

**One transform, not N layouts (`Canvas.tsx`).** A single `.world` element carries
`translate(...) scale(...)`; panels are positioned once in world coordinates and never
recomputed per frame. This is not only performance: a CSS `scale()` on an ancestor is invisible
to `getComputedStyle`/`ResizeObserver`, which xterm's `FitAddon` consults — zooming *cannot*
change a panel's cols/rows this way. The same blindness is why pointer coordinates need
correcting rather than gating (above): `getBoundingClientRect()` is transform-aware while
`dimensions.css.cell.width` is not, so a click under `scale(k)` lands on a cell off by `k`.

**`passive: false` on the wheel listener (`useViewport.ts`).** Chromium treats ctrl+wheel as
its own page-zoom gesture; without `preventDefault()` a pinch zooms the whole UI. React's
`onWheel` prop may attach passively (where `preventDefault()` silently does nothing), hence a
manual `addEventListener('wheel', handler, { passive: false })` in an effect, plus
`setVisualZoomLevelLimits(1, 1)` in `src/main/index.ts` as a second line of defence.

**Clamp scale before deriving translation (`zoomAt`).** Deriving the translation from a
*requested* scale while applying a *clamped* one makes the canvas drift sideways while
appearing frozen — visible only while holding a pinch at the limit. `verify:viewport` 3.

**Cmd is required for every canvas shortcut (`useViewport.ts`).** Agent TUIs claim
essentially every bare key, so a bare keystroke must always reach the PTY. Trackpad gestures
are safe to claim because terminals don't use them.

**No `StrictMode` (`src/renderer/main.tsx`).** Double-invoked effects would spawn a PTY, kill
it, and spawn it again on every mount. Intentional; leave it off while the PTY lifecycle is
still being proven. (This is also why `Canvas.tsx`'s history-committing updaters, which call
`setState` from inside another updater, are safe — StrictMode would double-invoke them.)

**Fit before spawn (`session-registry.ts`'s `attachSlot`/`spawn`).** `attachSlot` calls
`session.handle.attach()` — which opens the terminal against its now-mounted host and fits it
— before `spawn()` reads real `cols`/`rows` and passes them to `pty:create`. Spawning at 80x24
and resizing after makes agent TUIs draw their frame twice and leave artifacts.

**`externalizeDepsPlugin` (`electron.vite.config.ts`).** Keeps `node-pty` out of the bundle
so its native `.node` binary is `require`d from `node_modules`. Anything with a native
binding belongs in `dependencies`, not `devDependencies`.

**`term.open()` runs at most once, ever (`create-terminal.ts`).** `TerminalHandles.opened`
guards it: xterm's `open()` is not repeatable, and everything a terminal has drawn lives inside
the `Terminal` instance, not the host `div`. `detachTerminal` disposes the WebGL addon and
removes the host from the document but never touches the `Terminal`; `attachTerminal` on
re-attach loads a fresh `WebglAddon`, fits, and calls `term.refresh(0, rows - 1)` — `verify:xterm`
proved a fresh WebGL context does not repaint on its own after re-attach, so that refresh call
is load-bearing, not a defensive extra.

**Resize commits on release, not live (`Canvas.tsx`'s `onCommit`, `registry.refit`).** The
panel's box follows the cursor every frame during a resize drag, but `refit()` — which fits
the terminal and fires `pty:resize` — runs exactly once, on mouseup. A full-screen agent TUI
repaints its entire frame on every SIGWINCH; resizing live would mean ~sixty repaints a second
at intermediate sizes the user never meant to keep. `verify:panels` 11.

**Stacking is `Panel.z`, never array order (`panels/panels.ts`, `Canvas.tsx`).** React
reconciles a reordered keyed list by remove-then-insert, which would momentarily detach the
subtree holding a live terminal's host and its WebGL context. `raisePanel` only ever changes
`z`; `Canvas.tsx` sorts by `z` before `hitTest`, so paint order and pick order still agree.
`verify:panels` 16.

**Wheel ownership is decided in one predicate, in the capture phase (`useViewport.ts`,
`Canvas.tsx`'s `shouldYieldWheel`).** `shouldYieldWheel` is the SOLE authority — never
post-filtered by an AND in the caller, which can only ever *narrow* what the predicate says.
Rules, in order: **(1)** the palette owns every wheel over `.palette` (see "Scrolling the
palette is a yield" below), and the nav grid owns every wheel over itself the same way. **(2)**
otherwise a zoom gesture (`ctrlKey` trackpad pinch, or `metaKey` mouse wheel) is always the
camera's, covering the focused panel too — `Cmd` is the modifier every other canvas shortcut
requires, so it can't be the one input the canvas defers on. **(3)** otherwise a wheel over the
element carrying `data-scroll-host` (a live terminal's slot, a review node's diff body, a file
panel's body) scrolls that region; everything else pans the camera — see "Rule 3 is
attribute-driven" below for why this is a DOM marker rather than a branch on panel kind. The
listener is capture-phase, `{ passive: false }`, on the canvas host — xterm's own wheel handler
is bound on a descendant and runs first in the target phase, so a bubble-phase listener would
already be too late; the shipped listener calls neither `preventDefault` nor `stopPropagation`
over the scroll-host case (so xterm sees the untouched event) and both otherwise (so xterm's
target-phase listener never runs at all). `verify:panels` 12 asserts all three halves in one
fixture. Reverting to a bubble-phase listener reintroduces double-handling (both the terminal
and the camera react to one wheel).

**Rule 3 of `shouldYieldWheel` is attribute-driven, not a branch on panel kind.** With a single
panel kind, "wheel over the focused panel scrolls it" was implicit; with five kinds the
predicate would otherwise need an `if (isReviewPanel(panel)) …` for every one, which is wrong
twice over — it has to be edited every time a kind is added, and it consults the panel MODEL to
answer a DOM question the model can't fully answer anyway (a review node's header isn't
scrollable even though its body is). Instead each kind's component renders `[data-scroll-host]`
on the element that actually scrolls, or renders no marker at all if it owns none, and
`shouldYieldWheel` just asks `panel.querySelector('[data-scroll-host]')`. A dormant/carded panel
correctly renders no marker (a card has no xterm to hand the event to), which is also why the
old `.panel__slot`-based test was subtly wrong even before other kinds existed.

**Backlog #68's drag-pan lives inside `useViewport.ts`, next to the wheel listener's own pan
logic, and never inside `Canvas.tsx` — the same "arbitrated in one place" rule the wheel
predicate above states.** `beginPanDrag(originScreen)` is a sixth narrow verb (the setter
stays private, as every entry on this camera already says); its document-level
`mousemove`/`mouseup` effect mirrors `usePanelDrag.ts`'s shape exactly — origin captured once,
recomputed from that fixed origin every frame, a `buttons === 0` mid-gesture end for a missed
mouseup — and calls the same `panBy(vp, dx, dy)` the wheel path already uses, screen-pixel
deltas needing no scale correction because `.world`'s translate sits outside its scale.

**Middle-drag is claimed in the CAPTURE phase, composed with `onLinkModeMouseDownCapture`,
because no panel chrome handler in this codebase checks `event.button`.** Every panel's own
mousedown handler (chrome drag, resize, close) fires on ANY button today, so an unguarded
middle-press over a panel's chrome would start a *panel* drag via `usePanelDrag` rather than a
camera pan — the identical class of gap `useLinkMode`'s own capture-phase listener exists to
close for the completing click of a link. `onCanvasMouseDownCapture` therefore checks
`onLinkModeMouseDownCapture(event)` FIRST — never a second, competing `onMouseDownCapture`
prop, since React allows exactly one per element — and only then `event.button === 1`, gated on
the palette and the nav grid (mirroring `shouldYieldWheel`'s rules 0-1, both of which already
stand every other canvas gesture down while open). No `merged` gate, matching the wheel's own
rules: panning the lane-space camera is harmless read-only navigation.

**Space-drag is gated on `document.activeElement`, never on reconstructing `focusedId` /
`palette.isOpen()` / draft-element checks by hand (`useSpaceHeld.ts`).** Space is a bare key
that belongs to whatever agent is running in a focused panel — "Cmd is required for every
canvas shortcut" names the identical hazard — so a naive global claim would swallow a literal
space keystroke meant for `vim`/`claude`. The backlog's own "nothing focused" is most precisely
the DOM's own answer: when nothing legitimately wants a keystroke, `document.activeElement` is
`document.body`. That ONE test subsumes four app-level facts a hand-built equivalent would need
to get right separately — no panel focused (xterm's hidden textarea isn't active), the palette
closed (its input isn't active), and no open review/file draft (their textareas aren't active)
— the same DOM-truth-over-app-state instinct `xterm-pointer.ts`'s `.panel__slot` test and
`useNavGrid`'s `.review-node__commit-form, .file-node__editor` test both already use. When
something IS focused, the keydown handler does nothing at all — no `preventDefault`, no state
change — so the keystroke flows exactly as if the hook did not exist.

It arms ONLY inside the marquee's own background-press branch of `onMouseDown` (`hitTest`
found nothing, `!palette.isOpen() && !merged`) — never a second branch, never capture phase —
so space-drag and the marquee are two interpretations of the identical "background press"
moment, never both: `if (spaceHeld.isHeld()) beginPanDrag(...) else beginMarquee(world)`. This
is deliberately narrower than a Figma-style "space pans anywhere, even over a panel": the
backlog's own text says "over the background," and a press that lands on a panel already goes
through `onSelectPanel` in the `if (hit)` branch above, untouched. `verify:panels` 174-177: 174
and 175 pin the middle-drag delta over background and over a live panel's chrome (the panel's
own screen rect must shift by EXACTLY the camera's delta, proving it was panned and not
dragged); 176 pins space-drag panning when nothing is focused; 177 pins that the identical
gesture over a PANEL does not pan at all.

**Dormancy outranks focus (`lod.ts`).** `assignTiers` pins the focused panel live
unconditionally, so restoring focus onto a restored panel would spawn a process at boot,
contradicting "dormant until clicked" before the user ever touches the canvas. `attachSlot`
carries a second, deliberate dormancy guard on top of the tiering rule, so "no process starts by
itself" doesn't rest on one pure function alone — `verify:viewport` 46–47 and `verify:registry`
16 cover the two layers separately. Dormancy is about SPAWNING, not attaching: a panel with a
live tmux session has nothing to spawn, so it reattaches like any panel and `LIVE_BUDGET` still
caps concurrency; a failed `pty:list` degrades to the empty set, which restores everything
dormant — the safe direction, since it spawns nothing.

**The store is main's because the quit flush cannot ask a dead renderer
(`main/layout-store.ts`).** `app.on('before-quit')` is main-side; if the renderer owned the
debounce, main would have to ask a renderer that Cmd+R/Cmd+W may already have destroyed.
`flushSync` must never throw, because an exception there can wedge the quit before the window
is allowed to close.

**`parseLayout` never throws and drops entries individually (`shared/layout-schema.ts`).** One
malformed panel costs that panel, not the whole file. **This is the canonical statement of the
absent-vs-malformed rule this schema — and nearly every parser added after it — draws
throughout the file: an ABSENT key is every pre-existing file and must warn nothing; a
PRESENT-but-malformed value warns and is dropped (never silently coerced); and a per-entry
failure (one bad panel, one bad preset, one bad link) costs only that entry, never the whole
collection.** `parsePresets`/`parsePreferences`/`parseBaselines`/`parseSessions`/the panel-kind
union/the `agent` field/`main/toolbox-scan.ts`'s `SourceRead`/`main/fs-tree.ts`'s `DirResult`
all restate this same three-way split for their own format; where one of those has something
genuinely different to say (a specific number, a specific asymmetry) it's called out below
under its own name, but the underlying rule is this one. **Duplicate ids are the one failure
with no visible symptom**: `registry.ensure` returns the existing session for a repeated id, so
two panels in `layout.json` silently render as one, because `handle.host` can live in exactly
one DOM slot.

**`nextIdRef` seeds from every kind's ids, across every workspace (`Canvas.tsx`).**
Initialising the id counter to `1` collides with a restored `n5` after five `Cmd+N` presses on
a previous run. This has recurred repeatedly as the app grew more kinds and more workspaces,
each time through a door the previous fix didn't close: the counter recovers its seed by
scanning existing ids with a regex, and that regex has to list EVERY live kind prefix
(`n`/`r`/`f`/`j`/`t` as of the newest kind) or it silently ignores every panel of the kind it
forgot — recomputing a max blind to persisted `r7`s, say, and then minting a literal duplicate
`r7`, which React keys collide on and `parseLayout` drops silently at the next load. It also has
to run at BOTH seed sites — boot, and every `switchWorkspace` — because `PanelId` doubles as a
tmux session name (see "Panel ids are global, not per-workspace" below) and a workspace switch
can reveal ids a narrower, single-workspace scan would never have seen. When adding a sixth
kind: widen the regex at both sites, or the id-collision defect resurfaces through the same
door.

**One history entry per committed gesture (`Canvas.tsx`).** A drag calls `setPanels` roughly
sixty times as the pointer moves; pushing an undo entry there makes one drag take sixty
`Cmd+Z` presses to unwind. History is pushed once, on commit, not per intermediate update.

**Undo removing a panel must dispose its session, and the call-site count only moves by
addition (`Canvas.tsx`, `session-registry.ts`).** `registry.dispose` has five call sites in
`Canvas.tsx` today — close button, undo/redo removing a panel, canvas reset, workspace delete,
and restart-in-place — and adding a new one that forgets to route through `dispose()` (calling
`pty.kill` directly, say) breaks the two-caller invariant `session-registry.ts` depends on.
Re-derive the count from `grep -n "registry.dispose" Canvas.tsx` rather than trusting a number
written down here — this file has gone stale on this exact count before, inside the very commit
that recorded it, which is why `verify:panels` 94 pins both counts by reading source text
instead. Workspace delete disposes rather than demotes (the one workspace-switch path where
that's correct) because a doomed workspace's record is about to be deleted entirely — a
surviving session there is one no UI can ever reach or stop again.

**`dispose(id)` sends `pty.kill` even when this renderer holds no local session for that id —
see "Two lifetimes, not one" above**, which states this rule and its consequence in full.

**No `beforeunload` teardown (`Canvas.tsx`).** The renderer deliberately does NOT dispose its
sessions on unload; re-adding that listener silently deletes M4c's headline feature (session
survival across a reload). `disposeAll()` would send `pty:kill` for every panel and WIN the race
against `window-lifecycle.ts`'s `did-start-navigation` `detachAll()`, because `beforeunload`
runs first — every unit-level check stayed green while a reload destroyed the user's agents,
which is why `verify:panels` 26 (a real renderer reload) is the check that actually catches a
regressed listener; `verify:pty-manager` 12 and `verify:window` 4 each drive only one half.

**`Cmd+Z` is claimed, `Ctrl+Z` is not (`src/main/menu.ts`).** The same split as `Cmd+C`/`Ctrl+C`.
The stock `'undo'`/`'redo'` menu roles drive `document.execCommand` against whatever DOM element
happens to be focused, not the canvas's own history stack. `Ctrl+Z` reaches the PTY untouched
and still suspends the foreground process as SIGTSTP.

**The tmux client's exit code is always 1 (`session-backend.ts`, `tmux-args.ts`).** Measured:
an inner command exiting 0 and one exiting 42 both produce client exit 1. `remain-on-exit on`
plus a `pane-died` hook recovers the real `#{pane_dead_status}`; the hook writes the file
*before* `kill-session`, and killing the session is what makes the client exit, so by the time
`node-pty`'s `onExit` fires the file is already on disk. Reversing the two hook commands races
and reports the wrong code intermittently.

**`parseListOutput` must filter `#{pane_dead}`.** `remain-on-exit on` means a session whose
command exited still *exists* until the hook kills it — an unfiltered list reports a finished
process as live, boot reconciliation restores that panel non-dormant, and the user gets a panel
attached to a corpse that can never produce another byte.

**tmux is resolved by absolute path from the login env (`tmux-probe.ts`)** — see "Login-shell
PATH" above, which now states this rule (and git's identical one) in one place.

**The probe checks that the SERVER starts, not just that a binary exists (`tmux-probe.ts`).**
`tmux -V` proves a version, not a working server — an unwritable `TMUX_TMPDIR`, a
socket-directory permission problem, or a stale socket owned by someone else would leave `kind`
at `'tmux'` while every panel's client dies instantly, with nothing in the HUD. `probeTmux`
therefore writes the config and runs `start-server -f <conf>` on the private socket before
committing to that backend; a failure falls back to `DirectBackend` with a named reason.

**The bundled tmux config is generated, not shipped (`tmux-args.ts`'s `buildTmuxConf`).** It
embeds `exitDir` (a per-run path under `userData`, unknowable until the app is running). Every
line fails *silently* if changed: `prefix None` is what keeps `Ctrl+B` reaching the agent (the
same split as `Ctrl+C`/`Ctrl+Z`), `terminal-features ",xterm-256color:RGB"` stops 24-bit output
being downsampled to 256 colours, and `mouse` must stay **off** — `mouse on` makes tmux capture
mouse reporting instead of passing it through, silently defeating all of M4a's pointer
correction one process further down.

**The `pane-died` hook's redirect target must stay quoted (`buildTmuxConf`) — this repo's
single costliest silent bug.** `exitDir` (under `app.getPath('userData')`) always contains a
space on macOS (`~/Library/Application Support/…`). Unquoted, the shell splits it: the exit
code lands in a junk file, `exitCodeFor()` finds nothing, and *every* panel reports
`[process exited with code 1]` regardless of the real exit code — while the session still dies
normally, so nothing else looks wrong. It shipped through eight task reviews because every
fixture used a space-free path. Both `verify:tmux` and `verify:pty-manager` now deliberately
use a spaced fixture directory for this reason, and it is why the file-panel/toolbox/subagent
fixtures added later all copied the same habit — treat a spaced fixture path as load-bearing
test infrastructure, not incidental.

**Two concurrent verify runs, and packaged vs. dev, and two copies of one build, must each get
their own tmux socket (`tmux-args.ts`'s `resolveSocket`, `scripts/verify-socket.cjs`,
`main/index.ts`).** Every argv builder takes the socket as a *defaulted* parameter so
production always resolves `'terminal-canvas'` while `verify:pty-manager` runs on
`'terminal-canvas-verify'` (its own `shutdown()` — `kill-server` — must never touch a real
instance's agents). Two simultaneous `npm run verify` runs (ordinary once git worktrees made it
common) would otherwise kill each other's sessions mid-run via that same `shutdown()`; a
`TC_VERIFY_SUFFIX` env var appends a sanitised (`[A-Za-z0-9_-]` only, since a socket name is a
filename) suffix per run. Separately, a packaged build resolves a DIFFERENT socket
(`'terminal-canvas-app'`) than dev, so quitting one build can't `kill-server` the other's
agents; a blank `TC_TMUX_SOCKET` override must be treated as *unset* rather than an empty `-L`
(which falls back to tmux's OWN default socket — the user's regular tmux server, which
`shutdown()` would then destroy). Separately again, two copies of the SAME build share a
`userData` directory and would resolve the same socket — `app.requestSingleInstanceLock()` at
module scope with two early-return guards (inside `whenReady` and inside `second-instance`,
never a conditional *registration*) refuses a second launch outright, because `app.quit()`
still runs the ready/quit handlers, so a losing instance that got even one line into `whenReady`
would start a tmux client on the winner's socket and flush an empty store over the winner's
`layout.json`. Dev-plus-packaged is not blocked by this (different `app.getName()`, different
`userData`, different socket already) — only two copies of one build are, which is the only
destructive pairing.

**Every check appended to `verify:pty-manager`'s tmux block must leave that block ending in a
definite `kill-server`, and this has been forgotten once already.** A leftover server from a
prior run keeps its OLD `pane-died` hook wired to a now-deleted `exitDir`, and `-f <conf>` is
silently ignored against a server that's already running — a check reading the exit code from
that hook's file (like `verify:tmux` 18) then falls through to the client's own (wrong) exit
code, in a LATER run, for a reason that has nothing to do with the code it's testing. Re-running
usually hides it, since the closing `shutdown()` restarts things clean.

**`reattached` costs a probe because `-A` erased the question (`tmux-args.ts`'s
`buildHasSessionArgs`, `pty-manager.ts`'s `create`).** `new-session -A` attaches if the session
exists and creates it otherwise — create and reattach are the same call, so telling them apart
in the UI means asking `has-session` **before** the spawn, not after (after, `-A` has already
created the session and the answer is always `true`). The exact-match `=` on the probed target
is the same rule every kill target obeys — without it, panel `n1` reports a surviving session
whenever `n12` is running. This fact sat unread in `PanelStatus` for two milestones before the
inspector became its first reader (`buildInspectorModel`'s `reattached` badge, `verify:rail`
24) — `TerminalPanel.tsx`'s own header never displays it, and `verify:panels` 91 is the only
place a real tmux session surviving a real reload is observed with the badge on screen, needing
tmux to run at all.

**The baseline is captured once per SESSION, not once ever, and `reattached` is why
(`pty-manager.ts`'s `create`, `main/baseline-capture.ts`).** `captureBaseline` fires from inside
`create()`, gated on an in-memory `capturedBaselineIds` set — because `-A` makes create and
reattach the same call, `create()` runs again on every reload whether or not anything actually
respawned, and under tmux that second call REATTACHES to a session that may have run for an
hour. An ungated recapture there would silently reset the baseline to "now", so the pane would
report "no changes" for an agent that had rewritten half the repository. A SECOND, independent
guard (`deps.baselineOf(panelId) !== undefined`, a persisted record) is what makes the baseline
survive an app RELAUNCH even though the in-memory set does not — and that persisted record has
its own resolution trap: `baselineOf === undefined` used to mean one thing and is actually two —
"never spawned" and "spawned into a non-repo cwd, so nothing was ever stored" — with the latter
permanently misreported as "no session yet" for the rest of that panel's life. `notARepo(panelId)`
(a second membership-only set, optional and defaulted `false` for backward compatibility with
every fixture built before it) is what lets `review()` tell the two apart. **A relaunch is a
NEW session, and "once" therefore also needs a startup sweep**: quitting runs `shutdown()`
(kill-server), so at the next launch nothing survives, yet `layout.json` still holds the
previous baseline — without a sweep dropping the baseline of every panel whose session did not
survive, every panel would be diffed against a stale, previous-session snapshot forever. That
sweep must NOT touch the in-memory `Cmd+R` guarantee (a fresh main process's copy of
`capturedBaselineIds` is empty by construction, so the two can't collide), and `before-quit`
must tear down (dropping baselines) BEFORE it flushes the store, wrapped in a `try` so a throw
there can't also lose the flush — flushing first would lose every dropped-baseline write on a
process that's about to exit.

**An absent `command` must stay absent through four layers (`shared/layout-schema.ts`'s
`parsePresets`, `main/presets.ts`'s `templateOf`, the `PRESET_SPAWN`/`PRESET_DEFAULT` payloads,
and `Canvas.tsx`'s `onSpawn`/`onCapture`).** Each rebuilds its object field by field rather
than spreading, because spreading carries `command: undefined` across the IPC structured clone
— where `'command' in template` then reads **true**, a different fact from the key being
absent. The failure is total and silent: every command-less preset (the built-in login shell,
and any user preset saved from one) would spawn a hardcoded shell instead of the user's actual
one. `verify:layout` 34, `verify:panels` 31.

**`Cmd+N` stays a renderer keybinding, not a menu accelerator (`useViewport.ts`).** Moving it
to `main/menu.ts` would be architecturally tidier but breaks every `verify:panels` check that
dispatches a synthetic `KeyboardEvent` on `window` to drive it, since a main-process accelerator
never receives that. Main instead pushes the default preset template over `PRESET_DEFAULT` at
every `did-finish-load` (including a reload's), which is what stops a reload silently reverting
`Cmd+N` to a login shell.

**The default preset is caught at module scope, not in an effect (`renderer/main.tsx`).** Main
sends `PRESET_DEFAULT` from the page's load event, but `boot()` awaits TWO IPC round trips
before its first `render()` — a subscription inside a `Canvas.tsx` effect would be at least two
macrotask hops too late, the push landing with no listener and being dropped. The subscription
therefore runs at module scope, ahead of `boot()`'s first `await` (an ordering guarantee, not a
narrower race), and seeds `defaultTemplateRef` as a prop. `Canvas` keeps its OWN `onDefault`
subscription too, for the re-push case — the two cover different moments and neither is
redundant. The failure this prevents is completely silent: `defaultTemplateRef` staying
`undefined` falls through to a hardcoded shell template that is byte-identical to the shipped
default, so only a user who changed `defaultPresetId` would ever see `Cmd+N` silently ignore
it. `verify:panels` 32 is deliberately the one preset check that sends nothing itself — every
other check drives the channel by hand, which is precisely how this could stay inert while the
suite stayed green.

**Built-in presets are code, not data (`main/presets.ts`'s `BUILT_IN_PRESETS`).** Persisting
them into `layout.json` means deleting one resurrects it on the next launch with no
explanation, and grows a file rewritten in full on every coalesced save for no benefit.

**Who owns the keyboard (`palette/usePalette.ts`, `Canvas.tsx`).** The palette is the first
surface that must *swallow* bare keys — the inverse of "a bare keystroke must always reach the
PTY" above. Four rules, each silently broken if any one is missing: **(1)** opening focuses the
input (xterm reads only its own hidden textarea, so moving DOM focus is what stops typing
reaching the agent). **(2)** DOM focus is not app focus: `focusedId` is CAPTURED, never cleared
— clearing it would demote the panel, lose the `Cmd+C` target, and disable every
`capturedId`-gated row. **(3)** canvas shortcuts (keyboard AND wheel, via `shouldYieldWheel`
rule 1) stand down via `isOpen()`, a `useCallback` reading a ref rather than state so it can sit
in dependency arrays without tearing listeners down on every open/close. **(4)** closing calls
`restoreFocus(capturedId)` — nothing else gives the keyboard back, since an unmounted input's
blur leaves focus on `<body>` and every keystroke goes nowhere. There are exactly **three ways
out**: `Escape`, `Enter` on a runnable row, and a click outside — `Tab` is folded into the same
`switch` as `Escape` rather than left to the browser's default focus walk (which could land on
xterm's own tabbable helper textarea and leave the overlay up with the keyboard on the agent).
`Cmd+K` itself excludes `shiftKey` explicitly, because `Cmd+Shift+K` is a distinct shortcut in
every editor a user might have open and arrives with the same `key === 'K'`.

**`edit:paste` is guarded, `edit:copy` is redirected, and the palette owns its own subscriptions
(`Palette.tsx`, `Canvas.tsx`).** `Cmd+C`/`Cmd+V` are main-process menu accelerators, so the
browser never delivers a *native* paste to the palette's `<input>` — a guard against the canvas
handling them isn't enough, since nobody would then be serving the input either. `Palette.tsx`
subscribes to the same two events and inserts at the caret. The copy half is asymmetric because
a selection inside an `<input>` is not part of `window.getSelection()` in Chromium — the palette
reads `selectionStart`/`selectionEnd` off the input instead.

**A prompt insert is `paste()`, never `write()` (`Canvas.tsx`'s `insertPrompt`).** `term.paste`
wraps the payload in bracketed-paste markers and normalises LF to CR, delivering a multi-line
prompt as ONE input; a raw write submits every newline separately, firing incomplete fragments.
Every prompt worth saving is multi-line, so this affects the whole feature. `verify:panels` 40
is the only check that can tell the two apart, since its fixture panel deliberately enables
bracketed paste itself.

**Navigating must not wake (`Canvas.tsx`'s `goToPanel`).** Waking hangs off *selection*
(`onSelectPanel` clears the dormant id and calls `registry.wake`), so reusing it for the
switcher would spawn an agent as a side effect of navigating — on a restored twelve-panel canvas
that's twelve CLIs launched by a keyboard tour. `goToPanel` factors out just the select-and-raise
half. This rule recurs for every later navigation surface that lists panels (rail rows, the nav
grid, links) — see "The rail navigates; only the start control wakes" below for the rail's own
instance, which states the same split for a second surface.

**The palette swallows its own mousedowns (`Palette.tsx`).** The overlay mounts INSIDE
`.canvas`, whose background `onMouseDown` clears `focusedId`, hit-tests the click's world point,
and (via `onSelectPanel`) WAKES whatever panel lies underneath — so without a bubble-phase
`stopPropagation` (no `preventDefault`, so the input can still place a caret) on `.palette`'s
root, clicking into the palette's own text field spawns a process. The nav grid's overlay
inherited this same trap when it shipped, needing the identical one-line fix
(`onMouseDownCapture` on the grid's root — see the nav grid entry below).

**Scrolling the palette is a yield, not a scroll handler (`Canvas.tsx`'s `shouldYieldWheel` rule
1).** `.palette__list` has always been `overflow-y: auto` — what stopped it scrolling was
`useViewport`'s capture-phase wheel listener seeing the wheel FIRST and calling
`preventDefault()` on the ancestor `.canvas` before the browser's default scroll ever ran. The
fix is subtractive (rule 1 returns `true` and `useViewport` touches nothing), and **no
`onWheel` handler in `Palette.tsx` would help** — a bubble-phase handler there runs after the
capture listener has already cancelled the event. `verify:panels` 47 asserts CANCELLATION, not
`scrollTop`, because a synthetic `WheelEvent` performs no real scroll in Chromium even against
correct code.

**Three ways out of the palette, and the third must not restore focus (`Canvas.tsx`'s
`onMouseDownCapture`, `usePalette.ts`'s `dismissPalette`).** A click outside closes the overlay
— without it, one click leaves the overlay on screen with the input blurred and every key
reaching the agent, and `Escape` can't even undo it since the key no longer reaches the
palette's own handler. This listener is capture-phase on the canvas host (every panel's own
handler `stopPropagation`s its mousedown, so a background-only listener would miss the common
case) with an explicit `closest('.palette')` containment test, and it calls `dismissPalette()`
WITHOUT `restoreFocus` — the click itself is the focus gesture, so restoring would yank the
keyboard back to whatever the user just clicked away from.

**The palette's selection moves only when the user moves it (`Palette.tsx`, `Canvas.tsx`'s
`panelRows`).** Three routes silently re-seated it and all three look correct in a screenshot
(the highlight is just somewhere the user doesn't expect, and `Enter` runs the wrong command):
re-seeding on every `rows` identity change (fixed to re-seed only on a query/scope change, and
to fall back to `bestMatchIndex` — the top-scoring RUNNABLE row, never `firstRunnable`, which
would ignore the query the instant rows became section-ordered — rather than `firstRunnable`
when the selected command becomes unrunnable); `panelRows` tracking the panels array (a fresh
identity on every drag frame) rather than being keyed on `palette.open` and read out of a ref;
and `resetViewport`/`centreOn`/`restoreCamera` not being stable `useCallback`s (an unstable
identity propagates into `Palette.tsx`'s `commands` memo, whose `[rows]` effect re-seats the
selection on every unrelated re-render, e.g. a mousemove over the canvas). The selected row also
carries a ref and `scrollIntoView({ block: 'nearest' })`, because the list is long by
construction (four rows per preset, one per panel, two per prompt).

**Hover is a fourth way the selection moves, and needs two guards to keep the rule above true
(`Palette.tsx`'s `lastPointerRef`/`pointerSelectRef`).** Hovering a row sets the same `index`
the arrow keys set (one highlight, not two). Two failure directions, both silent: a
pointer-driven index change must suppress its own `scrollIntoView` (a partly-visible row at the
list edge would otherwise scroll itself into view and shift every other row out from under a
cursor that never moved), and a keyboard-driven scroll must NOT re-trigger hover — Blink
re-dispatches a `mousemove` at the UNCHANGED cursor position after a scroll to refresh `:hover`,
so an ArrowDown that scrolls the list would otherwise "hover" whichever row slid underneath and
drag the selection straight back. `lastPointerRef` compares raw coordinates against the previous
move and ignores an identical pair — the only thing separating the synthetic re-dispatch from a
real one. Disabled rows take no hover, matching `stepRunnable`'s rule for the arrow keys.
`verify:panels` 72c is the only one of the three hover checks that has ever caught anything (72
and 72b pass even with no coordinate guard at all).

**Project prompts are read, never written (`main/prompts.ts`).** `.claude/commands/*.md` under
a panel's cwd belongs to the repository (version-controlled with the project, usable in a plain
terminal) — writing it would mean authoring a file someone will commit as a side effect of
"save", so `prompt:save` always writes the app's own store and `prompt:delete` returns `false`
for a project id. Four limits protect a directory this app doesn't own: at most 100 files, at
most 64KB each (skipped, never truncated — half a prompt read as a whole instruction is worse
than a missing one), one level deep, and a missing/unreadable directory is the empty list rather
than an error (most cwds have none, and throwing would take the saved prompts down with them).
Same-named prompts from the two sources are never deduped — they stay two rows, each labelled
with its source, because pasting the wrong project's context into an agent is silent and
expensive.

**`centreOn`/`restoreCamera` are narrow camera verbs; the setter stays private
(`useViewport.ts`).** Anything that needs to move the camera asks by name (`resetViewport`,
`worldCentre`, `centreOn(rect)`, and M7's `restoreCamera(camera)`) rather than being handed the
setter, which is what keeps the coordinate math something `verify:viewport` can pin purely.
`centreOn` deliberately does not change scale (framing a panel shouldn't discard the user's
chosen zoom); `restoreCamera` is the one exception, setting `x`/`y` AND `scale` exactly, because
a workspace's saved zoom level is part of what it means to come back to it.

**`Cmd+N` cascades, and the test is CENTRES, not overlap (`panels/panels.ts`'s
`cascadeCentre`, `Canvas.tsx`'s `onSpawn`).** Every panel-minting path funnels through
`onSpawn`, which used to hand the camera's world centre straight to `makePanel` — N presses at
an unmoved camera produced N byte-identical rects, invisible and total: the canvas looks like
one panel, the buried ones can't be closed, and each still holds a budget slot.
`cascadeCentre` returns the requested centre unless a panel is ALREADY centred there, otherwise
stepping down-and-right until it finds a free slot. Five details are load-bearing: it compares
panel CENTRES, never rect overlap (overlap is the NORMAL state of a working canvas, so an
overlap rule would step nearly every press away from where the user is looking); the epsilon
is half a pixel, not a "looks stacked" radius, because every real coincidence this app produces
is EXACT; the step is in WORLD units, never divided by scale, so the cascade stays visually
constant at every zoom; it runs inside the `setPanels` updater on `current`, never a ref, so two
spawns batched into one tick each see the previous one's array; and it WRAPS at
`CASCADE_MAX_STEPS` rather than marching a panel outside the cull region, where it would never
promote and `Cmd+N` would appear to do nothing.

**The header's honest chain, and the backfill that must never happen (`TerminalPanel.tsx`).**
The label is `title ?? status.command ?? spec.command ?? 'login shell'`. The resolved command
(from `pty:create`'s reply) is **never copied back into `PanelSpec`** — doing so would make it a
fifth place M5a's absent-`command` rule can be lost, and every command-less preset would spawn a
hardcoded shell instead of the user's real one. The rail row (`railLabel`), the inspector's
heading, and the Attention section's rows are all later readers of this SAME chain rather than
independent re-derivations — a re-derivation from `spec.command` alone says `/bin/zsh` beside a
row that correctly says the panel's real title; `verify:rail` 35/73 pin this for the rail. The
inspector additionally renders the resolved command and the SPEC's own answer as two SEPARATE
fields (see "The inspector shows the links, not the answer" below) — a backfill would make those
two fields falsely agree.

**One map, and a typed view over it (`shared/settings-schema.ts`, `main/layout-store.ts`).**
Settings live in ONE sparse `preferences` map in `layout.json`, keyed by `SettingDef.id`.
`LayoutStore.settings()`/`setSetting()` are a VIEW over that same map, not a second storage —
`verify:layout` 73 asserts this by writing through one accessor and reading through the other,
because two storages that agree the day they're written and drift later is exactly the failure
this arrangement removes. Sparse matters: an id absent from the map means "still at the schema
default", which is what lets a default change reach users later rather than freezing at
whatever it was the day they first launched. `parsePreferences` drops an unknown id or a
wrong-typed value with a WARNING rather than coercing it, the same absent-vs-malformed rule
`parseLayout` states in full above.

**Settings are a drill-in, not a flat list (`palette/palette-model.ts`'s `SECTIONS`).** A
setting is `{ id: 'setting', label: 'Settings' }` inserted into `SECTIONS` (ordered data, not a
closed union — appending a section is one object literal), with every boolean row
`hiddenAtRest: true` behind an always-visible `manage.settings` door. This isn't polish: three
more un-hidden rows the day a milestone adds them is the same "silently missing feature" trap
`hiddenAtRest` exists to prevent for presets and prompts. Typing a setting's keyword still
surfaces it at rest, so the hiding is honest rather than a second way to lose a row.
`SettingDef['type']` deliberately tracks only what `typeof` can return (an earlier `'enum'`
member with no enum-typed setting to back it was removed as a customer-free abstraction).
The `main/menu.ts` Restore submenu is DERIVED from `settingsInCategory(RESTORE_CATEGORY)` rather
than hand-listed, so the label and the query can't drift by typo — but nothing in `npm run
verify` constructs a real menu and reads its items, so this derivation is checked only at the
schema level (`verify:layout` 74), not at the menu; see the consolidated manual-verification
list near the end of this section.

**A title is not a bell (`main/agent-state.ts`'s `scanForBell`).** Claude Code sets its window
title with `ESC ] 0 ; <title> BEL` — the terminator is a literal BEL, not a distinct one — so a
naive `indexOf(0x07)` rings a bell on every title change, tracking UI state rather than a need
for attention. `scanForBell` is a small state machine over the escape grammar (`text`/`esc`/
`osc`/`osc-esc`/`dcs`/`dcs-esc`) so a BEL inside an OSC or DCS body is consumed as that string's
terminator. Scanner state is carried BETWEEN calls, never reset per chunk, because output is
flushed roughly every 16ms and an OSC body routinely straddles two flushes — a per-chunk
scanner would re-enter the tail of a split title as ordinary text and ring intermittently, only
under load. **Under tmux this whole trap is unreachable**: `node-pty` spawns a tmux CLIENT, not
the agent, so the bytes reaching the scanner are tmux's redraw, not the agent's stream verbatim
— tmux consumes the agent's OSC title itself (this config sets no `set-titles`) and never
re-emits one, while a pane BELL is passed through unchanged. That asymmetry is why a
tmux-backed fixture can't prove the title scanner works at all; `verify:panels` deliberately
swaps to the DIRECT backend for its bell/title checks (54–57) for this reason, and the scanner
still earns its place because the direct backend is a real, shipped fallback (used whenever
tmux is absent, too old, or its own server fails to start).

**`wants-you` is sticky, and who clears it is asymmetric (`main/agent-state.ts`'s `nextState`,
`IPC.AGENT_ACKNOWLEDGE`).** A TUI typically rings its bell and THEN prints its question, so a
naive "output clears wants-you" rule would clear it milliseconds after setting it. It survives
further output and is cleared only by `acknowledge`. Typing into the panel is a fact MAIN
already holds (via `pty:write`) and clears it there for free; focus is a RENDERER fact main
can't see on its own, so the renderer tells main via `agent:acknowledge` rather than clearing a
local copy — a local clear would make the renderer a second, driftable author of a state main
owns. *(No fault-injection seam in `npm run verify` proves main is the sole author rather than
an implementation that also clears a renderer-local copy that happens to agree — see the
consolidated list near the end of this section.)*

**The jump key does not acknowledge, and `wants-you` outranks selection (`Canvas.tsx`'s
`onJumpAttention`, `styles.css`).** `Cmd+J` is `centreOn` + `selectAndRaise` and nothing else —
no wake, no focus, no acknowledge — so a landed-on panel stays in `wants-you`, and
`.panel--selected.panel--agent-wants-you` paints amber rather than letting `.panel--selected`'s
usual blue win, or the jump would hide the very border it exists to draw attention to.
`verify:panels` 62 reads the rendered border COLOUR rather than the underlying state, because
main can hold `wants-you` correctly while the screen shows the wrong colour.

**`starting` is sent directly, and a killed exit is not sent at all (`pty-manager.ts`'s `create`
and `onExit`).** Two exceptions to "send only on a state CHANGE": `starting` is the detector's
BORN state, so nothing ever *enters* it and a change-gated send would never emit it during the
seconds a real `claude` takes to boot — `create` sends it directly, once. And an exit WE asked
for (`session.killed`) must not send `'exited'`, because it lands after the renderer has already
run its own cleanup at the dispose site — an unguarded send re-adds the map entry, growing it
for the renderer's life and letting a recycled id inherit a dead panel's border.

**The idleness tick is a second, independent timer (`pty-manager.ts`'s `IDLE_TICK_MS`).** The
existing flush timer only runs while there's PTY data pending, so it can never observe the
ABSENCE of output — an agent that goes quiet produces nothing to flush. A separate 500ms
interval, independent of any panel's traffic, is the only way "busy" ever becomes "idle" without
a human doing something; `unref()`'d so it can't hold a plain-node verify process open.

**One counter, many stores that must stay off it — the `registry.version()` rule, stated once.**
`TerminalPanel`'s `memo` is gated on `registry.version()`, which bumps ONLY on tier/status/
focus/exit (see "`version` exists only so `memo` can see a mutation" above) — riding it with
anything higher-frequency re-renders every panel on the canvas on every OTHER panel's unrelated
change, the exact 60Hz cascade the counter exists to block. Every module-level store added after
it — `agent-state-store.ts` (per-bell), `live-session-store.ts` (per-2s-tick cwd/command),
`subagent-store.ts` (per-fan-out), `file-store.ts` (per-write), `toolbox-store.ts` (per-config
read) — is subscribed **per panel id**, not globally, holds a CACHED snapshot object rather than
building one fresh per call (`useSyncExternalStore` compares by reference; a fresh object every
read makes React believe the store changes every render and loops), and is cleared at every one
of `Canvas.tsx`'s panel-removing call sites (plus, for the subagent and usage stores, at
restart-in-place too — a restarted panel is the same panel with a new process, so it must not
inherit the dead one's fan-out or transcript state) or a recycled panel id inherits a dead
panel's data.

**The glow reaches the card, not just the border (`styles.css`'s `.panel__card--agent-*`).**
`LIVE_BUDGET` caps live panels at 8 regardless of canvas size, so most of what a "what needs me"
scan is for is sitting in a CARD. `TerminalPanel.tsx` renders the card variant from the same
`data-agent-state` the live variant reads, so a bell on a demoted panel is exactly as visible.

**`exited` (the detector state) is not an exit code (`main/agent-state.ts`'s `Detector`).** It
exists only to stop further transitions once a process is gone — a dying process's last bytes
arrive AFTER `onExit` fires — and carries no success/failure information; `PanelStatus.exited`
(the real exit code, from `pty:exit`) is the sole authority on that.

**`agent.idleAfterMs` is bounded on TWO independent doors (`shared/settings-schema.ts`,
`LayoutStore`/`parsePreferences`).** The write path (`setSetting`) refuses an out-of-range
number; the LOAD path (`parsePreferences`) independently drops an out-of-range value read from a
hand-edited `layout.json` rather than clamping or carrying it — only guarding the write path
leaves a hand-edited file as an unguarded second door that silently changes idle-detection
timing with nothing in any log. The shipped default (1500ms) is a provisional stand-in, not a
measured value — a planned measurement of real turn-boundary gaps was never run.

**Five milestones have reached the "should this be a new IPC channel" boundary and declined it
(`agent-state-store.ts` and friends).** The attention set (M6d), workspace waiting counts (M7),
live cwd/`session:live` (M12), `subagent:state` (M15), `usage:panel` (M17) each sound like a
query main should answer, and each time the renderer already had everything it needed from
messages already crossing for another reason — a second channel would make main a second,
driftable author of a fact the renderer can derive correctly on its own. `session:live`,
`subagent:state`, `usage:panel` and `agent:state` are all `IPC_EVENTS` **sends**, which is why
`verify:ipc`'s channel count does not move for any of them — that suite counts INVOKE channels
(each needing an `ipcMain.handle`), and a send is handled by nobody and counted by nothing.

**The attention set is a second subscription, not a second store (`agent-state-store.ts`).** A
naive "who wants me" implementation has every panel subscribe to every OTHER panel's state just
to filter for `wants-you` — the exact fan-out `version()` exists to keep off per-panel
subscriptions. `syncAttention` instead maintains one membership-only `Set`, notifying only when
a panel enters or leaves it, and `useAttentionIds` reads a CACHED array rebuilt exactly once per
real membership change (never fresh per read, for the `useSyncExternalStore` reference-identity
reason above). One pre-existing, non-M7 consequence: waiting counts do not survive a reload,
since nothing re-emits the current state of every session to a freshly loaded renderer.

**Live cwd is a poll, a dedupe, and a third store (`pty-manager.ts`'s `LIVE_TICK_MS`/`pollLive`,
`renderer/session/live-session-store.ts`).** `PanelSpec.cwd`/`PtyCreateResult.cwd` both freeze
at spawn time, so the inspector's cwd was confidently wrong for any panel that later `cd`'d.
`buildListArgs` already asks tmux for EVERY session at once, so a poll costs one subprocess per
tick regardless of canvas size, riding a NEW `#{pane_current_command}` column onto an answer
that was already coming. Four rules, each silently wrong if inverted: the poll runs on its OWN
500ms/2000ms-separate timer from the idle tick (merging them would coarsen `agent.idleAfterMs`
detection four times over, silently); the dedupe (last cwd/command pair per panel, keyed with a
NUL separator so a path containing a space can't collide two different pairs into one key) is
the design, not an optimisation — undeduped this is thirty messages a minute per panel
describing a fact that changes when a human types `cd`, and the failure shows up only as CPU
heat, never a wrong pixel; `detachAll()` must clear the cached dedupe value too, or a reload
compares the next real poll against a stale pre-reload value and never sends again; and DISPLAY
renders nothing without a live answer while CONSUMERS (project-prompt reading, preset capture,
M20's file-tree root) fall back to the spawn cwd, because a spawn value under a present-tense
label is a confident wrong answer while a fallback for a consumer asking "a" directory (not "the
current" one) is never worse than not shipping. One deliberate exception: the switcher's own row
text (`panelLabel`) still reads `spec.cwd` and always will, because "where this panel started"
makes no present-tense claim to go stale.

**A workspace switch is a second boot, but the undo stack and dormancy calculation must not lag
behind it (`Canvas.tsx`'s `switchWorkspace`).** Everything derived from starting state is
RE-DERIVED (id counter, camera, selection); the undo stack is CLEARED outright, for the same
reason a workspace MOVE clears it too (see below) — applying a stale history entry from before
the switch would `dispose` a session that now belongs to a different, no-longer-active
workspace. `pty.list()` must be AWAITED and `dormantIds` computed in the SAME synchronous batch
as `setPanels`, never corrected a render later — the tiering memo's `registry.ensure` early-returns
for a session that already exists, so a late `dormantIds` correction can never undo a session
already minted non-dormant; the registry's own guard then agrees for the wrong reason and
`attachSlot` spawns. This produced up to `LIVE_BUDGET` agent CLIs launched by a bare workspace
switch with no user gesture, and every check that only switches between ALREADY-rendered
workspaces (with an already-settled session for every panel) is blind to it — hence a dedicated
fixture (`verify:panels` 68) built specifically against a workspace this renderer has never
rendered before. **The registry itself is deliberately NOT disposed on switch** — unmounting
calls `detachSlot` (tears down the WebGL host) while the `PanelSession`/PTY/tmux session stay
exactly where they are, which is "two lifetimes, not one" paying out at canvas scale;
`switchWorkspace` contains no `registry.dispose` call anywhere.

**`activateWorkspace` takes the outgoing canvas, and that parameter IS the mechanism
(`main/layout-store.ts`).** `save()` merges into whichever workspace is active WHEN IT RUNS, on
a 500ms debounce — a switch that merely flipped `activeWorkspaceId` would let the next coalesced
save land on the WRONG workspace's on-disk record, well-formed and silently wrong.
`activateWorkspace(id, outgoing)` writes `outgoing` into the OLD record BEFORE flipping the
active id, closing the window entirely. The identical hazard recurs one layer up in
`Canvas.tsx`'s workspace delete (`switchWorkspace` must run BEFORE `workspace.remove`, never
after — main's `remove()` reassigns `activeWorkspaceId` to a neighbour the instant the record is
gone, so an activate afterward would write the doomed workspace's stale panels into whatever
main just made active) and in the only-workspace-left case (a fresh replacement is created and
switched to FIRST, exactly as if it were a pre-existing neighbour). It does NOT apply
`restore.*` settings on either side of the transaction (`applyRestoreSettings: false`) — those
answer "what to show at launch", not "at a switch": applying them made `restore.layout` OFF
silently discard a workspace's panels on the way out and read empty on the way back in, when
main and the renderer both had the real state the whole time.

**Panel ids are global, not per-workspace (`Canvas.tsx`'s `nextIdRef`, `main/layout-store.ts`'s
`allPanelIds`).** `PanelId` doubles as the tmux session name, so two panels in two different
workspaces minting the same id would make the second one attach to the FIRST's tmux session
instead of starting its own — both panels showing one agent's output, with nothing visibly
wrong. `nextIdRef` seeds from `allPanelIds()` (every workspace, not only the active one) at
BOTH boot and every `switchWorkspace`, because a workspace can be switched TO while some OTHER,
hidden workspace holds a higher id.

**The shell insets the canvas, and that's only safe because nothing measures the window
(`Canvas.tsx`, `styles.css`'s `.shell`).** `useViewport`/`Canvas.tsx`/`EdgeIndicators` all read
`getBoundingClientRect()` on the `.canvas` host at event time, and the pip layer carries its own
`ResizeObserver` precisely so `Canvas` needs no window-size state at all — a future
`window.innerWidth` read breaks that silently, aiming pips at the window's edge while the canvas
ends short of it. `verify:panels` 73 pins the exact inset identity (not a loose bound) because a
missing `min-width: 0` on the canvas grid cell would let the canvas overflow while
`getBoundingClientRect` still reports plausible widths for everything. **A known, deliberately
unfixed limitation, now with four buttons on it (rail, inspector, file tree, and whatever comes
next)**: nothing observes the canvas host's SIZE, so opening/closing any of these regions
re-tiers NOTHING — a panel just pushed outside the narrower cull region stays live and one just
revealed stays a card until the next pan/zoom/focus change. This is pre-existing (a window
resize has always had this effect); these buttons just make it reachable in one click. The fix,
if ever taken, is one shared `ResizeObserver` (or a canvas-width dependency on the tiering
effect) that all of them would use — don't add a `ResizeObserver` "on the way past" to just one.

**A shell control never takes DOM focus (`shell/shell-control.ts`).** Every button on the bar
and every region toggle mounts `shellControl()`, whose `onMouseDown` calls `preventDefault()` so
focus never leaves xterm's hidden textarea — the alternative (let focus move, then blur back)
has a window where a keystroke goes nowhere. `focusedId` is never cleared by a shell click
either, since `assignTiers` pins the focused panel live and a clear would demote it and strand
the clipboard from a click on a zoom stepper. `stopPropagation` is deliberately NOT called on
mousedown, because a shell click legitimately SHOULD dismiss an open palette (whose own
outside-click listener has already run by then).

**A boolean `SettingDef` mints a palette row nobody wrote, so whatever renders it must
re-read on a signal, not read once at mount (`shell/useShellChrome.ts`).** `shell.railOpen`/
`shell.inspectorOpen` are ordinary booleans, so main's `settings:list` auto-generates a palette
row for each — running that row writes through `settings:set` without touching the shell
directly, so a renderer that read its copy once at mount would persist the write and never
visibly move. `useShellChrome` takes a `settingsSignal` and re-reads on it — the general rule for
anything that renders a setting.

**The rail is always MOUNTED, so its rows are frozen on a signature, not a memo key
(`shell/rail-rows.ts`, `Canvas.tsx`'s `railRows`).** Collapsing the rail is a CSS class
(`.shell--rail-collapsed`, `display: none` on the list) — `Canvas.tsx` renders `<SideRail>`
unconditionally, so every row stays mounted and reconciled while invisible, and a memo keyed on
`chrome.railOpen` would be keyed on a value that changes nothing about what React has to build.
Rows rebuild on every render (cheap) and their ARRAY IDENTITY is frozen on `railSignature`
(`JSON.stringify` over the rows, never a separator-joined string a user's own title is free to
contain and use to forge a field boundary — `verify:rail` 14). Every model in this codebase that
a component freezes on a signature (`inspectorSignature`, `reviewSignature`, `toolboxSignature`,
`treeSignature`) follows this identical shape: byte-identical on a high-frequency, cosmetically
irrelevant change (every frame of a drag) and definitely different on each real field's own
change, independently.

**The rail navigates; only the start control wakes (`shell/RailPanelRow.tsx`).** A row's body
calls `goToPanel(id)` (frame/select/raise) and never `onSelectPanel` (which also clears
dormancy and wakes) — the same split "Navigating must not wake" states above, reached a second
time. The wake is reachable only through an explicit start control on dormant rows.

**`closePanel`/`startPanel` are palette `actions` members with no palette rows of their own
(`palette/commands.ts`).** The shell reaches the app only through the `actions` object, so a
rail that closed over `registry.dispose`/`registry.wake` directly would be a second
implementation of a verb that already has one authority. They emit no `Command` rows because
both verbs already have a gesture on screen (the panel's own `×`; the "click to start" card).

**One waiting count, and the rail is a view over it (`shell/rail-sections.ts`'s
`waitingCount`).** Computed once and called by both the rail and the palette, rather than each
computing its own expression that could silently drift. The INTERSECTION (this workspace's own
panel ids ∩ the attention set) is what does the real work — a global count reads as "every
workspace is waiting for you", and an id from some other workspace or a phantom (a `wants-you`
panel that's since been closed) must contribute nothing.

**The attention section takes the already-BUILT rail rows, not the raw panel list
(`shell/rail-sections.ts`'s `buildAttentionRows`).** Filtering the queue down to ids that have a
rail row IS the phantom-panel filter, and reading the label off that same row is what stops the
Panels and Attention sections naming one panel differently. It iterates the QUEUE and looks rows
up, never the reverse (which would render canvas order instead of arrival order). It is also
scoped to the ACTIVE workspace only, structurally — a waiting panel elsewhere surfaces only as
the waiting COUNT on its own workspace's rail row.

**The inspector shows the links, not the answer (`shell/inspector-fields.ts`,
`shell/Inspector.tsx`).** The panel header/rail row collapse to ONE label; the inspector
deliberately does NOT — the resolved `command` and the spec's own `asked for` are two SEPARATE
fields, because "why does this say login shell" is answerable only when the user can see both
that the spec asked for nothing AND that main resolved `/bin/zsh`. A merged field would render
something plausible and unanswerable. `cwd` gets the same live/spawn split once a live answer
exists, gated on `isRunning(status)` so an exited panel doesn't go on showing a stale
present-tense value forever.

**One predicate for "running" (`shell/inspector-fields.ts`'s `isRunning`).** `starting` counts
— a panel whose `pty:create` hasn't resolved yet is emphatically a process the user started.
This ONE function is shared by the inspector's summary AND `canvas:counts` (the number main's
own reset-confirmation dialog names before destroying everything) — two independent
derivations of "how many agents are running" would drift the first time one is wrong, at
exactly the moment a spawn is in flight.

**`dispose(id)` returns its kill, and `bumpVersion`/`touch` exist because `ensure()`
deliberately does not (`session-registry.ts`, `Canvas.tsx`'s `restartPanel`).** `dispose` is
`async` and hands back the kill promise so `restartPanel` can await the DESTROY before
re-`ensure`ing — under tmux, `new-session -A` reattaches rather than creates, so a `create` that
overtakes its own `kill` would reattach to the very session the restart meant to replace. This
ordering holds TODAY only because every real link in the chain happens to be synchronous, not by
design — the moment any link becomes asynchronous, the race is live and nothing in this repo's
suites would see it. `ensure()` is normally called from a render and stays silent on purpose;
`restartPanel` calls it from an event handler a tick later, so it must call `bumpVersion()`
itself or the new session's host never mounts. `touch(id)` stamps the eviction-order timestamp
WITHOUT calling `focus()` — a restarted panel joins `assignTiers`' eviction order at the back
otherwise (`ensure` mints at timestamp `0`), and using `focus()` instead would move the
keyboard, which a shell control must never do.

**Restart is dispose-then-ensure at one id, and `clearAgentState` runs FIRST (`Canvas.tsx`'s
`restartPanel`).** Sequence: clear agent state, await dispose, RE-CHECK the panel still exists
(it may have been closed during the await), `ensure(..., { dormant: false })` (explicit, never
inherited), `touch`, `bumpVersion`. **Restart kills unconditionally but only respawns on
PROMOTION**: a restarted panel over-budget or off-screen shows the process die, nothing take its
place, and the Restart control immediately grey out denying it happened — recoverable by
clicking the panel, with nothing on screen saying so.

**Three surfaces close a panel and only one arms a confirm, deliberately (`TerminalPanel.tsx`'s
`handleClose`, the rail's close control, the inspector's "Close panel").** The panel's own `×`
asks once for a running process because it sits where a mis-click while dragging/resizing is
easy; the rail row and inspector button close outright because both act on a panel the user has
already deliberately selected and aimed at a labelled control.

**`kind` is optional on disk, absent means terminal, and a present-but-unknown kind is DROPPED,
never guessed (`shared/layout-schema.ts`, `renderer/panels/panels.ts`'s `isReviewPanel` etc).**
The two halves answer different questions: absent is every file written before the panel-kind
union existed, so a required discriminator would drop every panel in every pre-existing file. A
PRESENT unknown kind (e.g. `"whiteboard"`) was written by a version that knows something this
one doesn't, and guessing `terminal` would spawn a PROCESS in a cwd its author never chose —
dropped with a warning instead, the same individual-drop rule `parseLayout` already states.
Runtime kind tests are POSITIVE everywhere (`isReviewPanel(p)`, never `!isTerminalPanel(p)`),
and `isTerminalPanel` is itself a negation of every KNOWN non-terminal kind (currently
review/file/jira/toolbox) rather than of "the one other kind there used to be" — adding a sixth
kind means widening this negation, or that kind silently falls through and mints a `PanelSession`
for something with no spec (`verify:viewport` 90b/92 pin this across four and five kinds).

**A sessionless panel kind never reaches `assignTiers` or `registry.ensure`, structurally
(`Canvas.tsx`'s partition).** Rather than teaching every consumer (tiering, dormancy, boot
reconcile, eviction, restart) its own guard for each new kind, `Canvas.tsx` partitions `panels`
ONCE into a terminal-only array, and everything downstream of tiering is handed that array — a
sessionless kind is simply not in the input. Closing one must also send NO `pty.kill` for its
id: `Canvas.tsx`'s four panel-removing loops and restart-in-place all branch on kind BEFORE
disposing, which has no positive symptom to notice if missed (a kill aimed at a session-less id
is silently swallowed at every layer below the IPC door), so the corresponding
`verify:panels` checks shadow `PtyManager.kill` and assert the node's id is NOT among the
recorded calls while a REAL terminal panel closed in the same window IS.

**`makeReviewPanel`/`makeToolboxPanel` must not force the minted id into their own `source`
object's identity field (`panels/panels.ts`).** Every OTHER constructor stamps its minted id
into the object it builds, so copying that pattern here (`subject: { ...subject, subjectId: id }`)
is a one-line change that reads as consistency and is catastrophic: it makes a review node's
subject ITSELF, so it asks main to diff a panel that never spawned, gets `never-started`
forever, and renders a well-formed empty state beside a panel that plainly has changes.

**A review node asks by BASELINE, never by panel id (`shared/review.ts`'s `ReviewSubject`,
`IPC.REVIEW_AT`).** Main drops a panel's baseline the instant its session is killed, so a node
querying `review:panel(subjectId)` would work only while its subject stayed open — going blank
at exactly the moment reviewing FINISHED work is most useful. The node instead stores the
repository root, the captured baseline sha, and a snapshotted label; the subject id survives
only for things still genuinely about the panel (excluding it from the shared-repo peer count,
re-reading when its agent goes idle), never for the lookup. This can only be PROVEN by fault
injection (pointing the query at the panel-id form) rather than watched failing against
otherwise-correct code, since with the subject still alive both forms answer identically.

**Commit is porcelain `git commit -m` through a scratch index, never `write-tree`/`commit-tree`/
`update-ref`, and a reconcile step is what stops the user's own index lying afterward
(`main/review-commit.ts`, `main/git-args.ts`).** `commit-tree` runs NO HOOKS, silently
delivering `--no-verify` behaviour the design forbids — porcelain `git commit` under a per-call
`GIT_INDEX_FILE` scratch index (seeded from HEAD via `read-tree`, removed in a `finally`) honours
real hooks. Once HEAD moves and the REAL index doesn't, `git status` in the agent's own shell
reports phantom `D`/`MM` entries — so a fifth call, `update-index --cacheinfo` per committed
path (staged by BLOB SHA read back after the commit, never a wholesale restage that would
clobber the user's own unrelated staged files), reconciles exactly the committed paths. A
SECOND reconcile call, `--force-remove` for paths the commit DELETED, closes the sharper version
of the same phantom (`AD`, staged-as-new for a file the commit just deleted, which an agent
reading it would re-add). A failure AFTER the irreversible commit must never downgrade the
result away from `committed`. Rename detection means committed `paths` must include BOTH sides
of a `git mv`, or HEAD's own old name survives and resurrects a deleted file. HEAD is read
TWICE — before `read-tree` and again immediately before the commit — because the window between
is the ENTIRE duration of a possibly-slow `pre-commit` hook, and a second committer landing in
it must cause `head-moved`, not a silent erasure of their work.

**The nav grid claims `keydown` in the capture phase on `window`, which is invisible to any
input's own bubble-phase self-defense (`navgrid/useNavGrid.ts`).** A review node's commit-message
field and a file panel's editor each `stopPropagation()` every key in the BUBBLE phase to keep
`Cmd+N`/`Cmd+K` from firing while typing — which works against `usePalette`/`useViewport` (also
bubble-phase on `window`) and does nothing against the nav grid's capture-phase listener, which
has already run by the time bubble phase starts. Unguarded, `Cmd+G` typed into an open draft
reveals the grid, the grid's open-branch `default:` arm then swallows every further keystroke,
and releasing `Cmd` switches workspace and unmounts the draft unsaved. The guard has to test the
event's TARGET (`closest('.review-node__commit-form')` / `.file-node__editor`), never
`document.activeElement` — xterm's own helper is itself a `<textarea>`, so an activeElement test
would disable `Cmd+G` over every ordinary terminal panel too.

**The nav grid is this app's first HELD-modifier state, and `blur` is what makes it dismissable
(`navgrid/useNavGrid.ts`).** Every other keyboard path fires once on the down-stroke; `Cmd+G`
stays revealed for as long as `Cmd` stays down, so "is a key still held" is real state for the
first time, with a stuck-modal failure mode rather than a missed keystroke. The commit test is
`event.key === 'Meta'` on `keyup`, deliberately not `!event.metaKey` — the latter's behaviour
against a real physical keyup could not be verified by anything this repo can run (a
synthetic `sendInputEvent` only ever echoes back the modifiers it was handed), so the more
robust test was chosen. **`blur` is required, not defensive**: `Cmd+Tab` is the ORDINARY way to
lose this, not exotic — the user holds `Cmd`, taps `Tab`, macOS switches applications, and the
`keyup` for `Cmd` is delivered to the OTHER application, never this one. A `keyup`-only design
leaves the overlay stuck on screen forever with no key left to dismiss it and no recovery short
of `Cmd+R` (confirmed by fault injection: deleting the `blur` listener leaves every other nav-grid
check green and this one alone red, reporting the overlay genuinely stuck). The overlay takes no
DOM focus (inheriting `usePalette`'s `restoreFocus` would fire mid-workspace-switch), so xterm
still holds focus while it's open — every claimed key must `stopPropagation()` in the capture
phase or a bare arrow reaches the running agent. The four `edit:*` menu accelerators
(`Cmd+C`/`V`/`Z`/`Shift+Z`) are IPC events that never pass through a renderer keydown at all, so
neither the grid's capture listener nor `useViewport`'s guard touches them on their own — they
each independently check `navGrid.isOpen` (alongside `palette.isOpen`) or a held `Cmd+Z` behind
the overlay would silently `dispose` a panel with nothing on screen changing to explain it, and
the workspace switch on release then carries the evidence away. Cell 8 is unconditionally
"More…", never conditional on a ninth workspace existing, for the same reason a disabled
palette row must stay visible (see `verify:palette`'s table entry above): a cell whose position
moves the day it's first needed defeats the muscle memory the whole gesture exists for.
*(The already-active-workspace guard — releasing with no arrow pressed must not call
`switchWorkspace` at all — and the real-hardware `keyup`/`Meta` link are both unverified by any
check in `npm run verify`; see the consolidated list near the end of this section.)*

**Links are adjacency stored on the SOURCE panel (`PanelBase.links`), not a top-level
collection, because of `History<Panel[]>` (`panels.ts`).** `Canvas.tsx`'s undo stack is typed
over the panel array alone; a second top-level `links` collection would force
`History<{ panels, links }>` and a rewrite of the two functions in this file that already carry
the loudest caveat here (`commitHistory`/`applyHistory`, which call `setState` from inside an
updater and are safe only because this app runs without `StrictMode`). Storing a link on its
source panel means undo/redo need zero changes to either function, and persistence is one
optional field beside `title`. The relation is DIRECTED (arrowhead at `to`), so the source is a
real owner rather than an arbitrary choice; the cost, accepted rather than hidden, is that "what
points at this panel" is an O(n) scan and the render layer flattens adjacency every drag frame —
both bounded by `LIVE_BUDGET` already.

**`removePanel` prunes INCOMING links so a close and its links are ONE undo entry
(`panels.ts`).** Outgoing links leave for free with their panel; incoming ones (#24's named
"dangling edge" failure) are what the prune removes, inside `removePanel` itself rather than at
its call sites — both callers are already inside a `setPanels` updater feeding one
`commitHistory`, so the panel and its links leave together and one `Cmd+Z` restores both. The
over-correction guard matters here too: stripping every link from every survivor would satisfy
"the dangling one is gone" while silently emptying the canvas on any close.
`parseWorkspace` prunes AGAIN on load, deriving the surviving panel set from `panels` and NOT
from the parser's internal `seen` set — `seen` looks like the surviving set and isn't, since it's
populated to reject duplicate ids BEFORE the checks (like a missing `cwd`) that can still drop a
panel, so reusing it lets a link name a panel that didn't actually survive.

**The link layer is inside `.world`, beneath the panels, ZERO-SIZED with `overflow: visible`,
and deaf to the pointer (`LinkLayer.tsx`).** Inside `.world` so it pans/zooms/clips with the
panels for free (the opposite of `EdgeIndicators`, a sibling of `.world` because a
viewport-pinned pip must NOT zoom away). Zero-sized because `.world` is a positioning origin with
no width/height and world coordinates are freely negative — a percentage size would clip every
link out of existence with correct-looking geometry still in the DOM. `pointer-events: none` on
the whole layer is what stops a link swallowing a click meant for a panel or the background (which
clears `focusedId`). That the layer actually PAINTS was verified with a real pixel probe against
the built renderer, not a DOM assertion — clipping changes neither geometry nor layout, so
`getBoundingClientRect` reports a correct rect for a layer that draws nothing; if you need to
re-verify SVG paint under a transformed ancestor, verify the capture INSTRUMENT itself first
(a plain sized `<div>` alongside the real element) before trusting a "broken" result, since an
artificial reproduction of this exact scenario once reported the opposite of what the real app
does.

**The completing click for a link is intercepted in the CAPTURE phase, or it wakes a panel
(`Canvas.tsx`'s `onLinkModeMouseDownCapture`).** Every panel's chrome `stopPropagation`s its own
mousedown, so a bubble-phase listener never sees a click on a panel — which is every click that
can complete a link — and letting one through reaches `onSelectPanel`, which wakes a dormant
panel: completing a link would spawn an agent as a side effect of drawing an arrow. The mode is
ONE-SHOT (the next mousedown anywhere resolves it either way) and `Escape`/`blur` both disarm it,
so unlike a stateful mode there's no way to be stranded in it — the only affordance is a banner
naming the source panel via the honest chain (never a re-derivation from `spec.command`).

**There is deliberately no link SELECTION on the canvas; the inspector is the only surface that
acts on one (`Inspector.tsx`, `buildLinkRows`).** Hit-testing a hairline at `MIN_SCALE` (0.1) is
a sub-pixel target that would exist in code and not on screen, and selecting one would force the
link layer to take pointer events, undoing the guarantee above. Incoming rows list the OTHER
panel as `from` — reversed, the remove/relabel controls on an incoming row silently do nothing,
because the mutator looks for a link on a panel that doesn't hold it.

**A credential never reaches a PTY, and that's STRICTER than `shell-env.ts` on purpose
(`main/credential-store.ts`, `main/shell-env.ts`).** This is the entry most likely to be "fixed"
for consistency, and undoing it deletes the milestone in one line. `shell-env.ts` already hands
every PTY the user's ENTIRE login environment (how `claude` finds its own API key) — that stays,
because it's the user's own pre-existing configuration. The axis isn't sensitivity, it's WHOSE
DECISION it was: a credential in this store is one this app obtained, through a UI this app
built, for a purpose this app performs, so handing it to an agent would be a choice made
gratuitously on the user's behalf. This has NO runtime symptom when broken, which is why
`verify:meta` 21 pins it as SOURCE TEXT: none of `shell-env.ts`/`pty-manager.ts`/
`session-backend.ts` may import the credential store, directly or through
`credential-verify.ts`.

**The store refuses rather than falling back to plaintext (`main/credential-store.ts`'s
`set`).** With the OS keychain unavailable, `set()` fails with a stated reason and writes
NOTHING. A plaintext fallback would be the worst option available, because it's
indistinguishable from success at every surface the user can see (the credential lists, verify
works and returns the account login). A refusal is visible at the moment it happens and
recoverable. Log lines defend the identical rule from a second angle: neither a refusal reason
nor a warning may ever quote the submitted token, even when `encrypt` itself THROWS while
holding the plaintext.

**`credentials.json` is its own file, not a key in `layout.json` (`main/index.ts`).** Reusing
`LayoutStore` breaks three of its own deliberate properties: its 500ms debounce would write a
secret repeatedly at an arbitrary moment rather than once at a moment the user can point to;
hand-editing `layout.json` is a documented SUPPORTED path, so the file people are invited to
paste into an issue must not contain a credential; and a future-version file is copied to
`.bak` rather than dropped on load — correct for a canvas, wrong for a secret.

**There is no `credential:get`, and its absence is the design (`shared/ipc-contract.ts`).**
`credential:list` returns metadata only; the store's `read()` is main-internal with exactly one
caller, `credential-verify.ts`, which uses the secret to make a request and never returns it.
This has no runtime symptom — adding the channel breaks nothing observable, it just puts the
plaintext in the renderer. `verify:meta` 20 pins the `CREDENTIAL_*` channel set as an ALLOWLIST
plus no `cipher` field anywhere `CredentialMeta` is declared.

**Subagent nodes are derived, not a `Panel` kind (`subagent-scan.ts`, `subagent-watch.ts`,
`SubagentLayer.tsx`).** `Panel` is the PERSISTED type with four separate contracts (a
`layout-schema` arm, `layout.save` writing it, `nextIdRef` minting it collision-free, and every
panel-removing surface learning to skip it) — a third kind fighting that contract would need a
fifth signature nowhere near those four (tiering/`registry.ensure` would need to learn a node
holds no PTY). Subagent nodes instead never enter `panels` at all: they're a sibling layer
inside `.world`, rebuilt every launch from the watcher, with no id prefix and no schema arm —
there's no code path from a subagent record to `registry.ensure` to forget to guard, which
`verify:panels` 132 confirms by reading the registry's session COUNT unchanged before and after
a fan-out renders. Cost, accepted rather than hidden: a node can't be dragged, closed, or
selected on its own, and doesn't appear in the rail.

**The slug is a hint; a confirmation read is what makes it safe (`subagent-scan.ts`'s
`slugFor`/`cwdOf`).** Claude Code's own project-directory-slug mapping (replace every character
outside `[A-Za-z0-9]` with `-`) is UNDOCUMENTED and inferred from real directory names that
happened not to contain an underscore or space — a genuine unknown. Nothing trusts the guess: a
claimed session directory is confirmed by reading its OWN transcript's recorded cwd against the
panel's actual cwd, and a mismatch is never claimed however well the slug matched — converting
an undocumented mapping from a CORRECTNESS risk into an AVAILABILITY one (a wrong slug degrades
to no nodes, indistinguishable from "no session yet", the safe direction).

**The subagent poll rides the live-cwd tick, deliberately outside its tmux gate
(`pty-manager.ts`'s `pollLive`).** Not a third timer (merging it with the 500ms idle tick would
coarsen `agent.idleAfterMs` detection). It reads the FILESYSTEM, not tmux, so it must run
UNCONDITIONALLY rather than only when `backend.list()` answers non-null — gating it on tmux
would silently disable this whole feature on the direct backend, a real, shipped, production
configuration.

**A claim follows the panel's SLUG and is re-derived every tick, not made once and trusted
forever (`subagent-watch.ts`'s `PanelState.slug`).** `attributable` recomputes from the live cwd
every tick, but the underlying claim (session directory, byte offset) was made once — so a
panel that `cd`s into a different repository kept rendering the FIRST repository's subagents
forever, a confident WRONG attribution rather than an absent one. `PanelState` now carries the
slug it was claimed from and re-claims on a mismatch. **A known, unfixed limit**: a SECOND
`claude` run in the same shell (same slug, so no re-claim trigger) is never picked up — the
panel's nodes sit `done` forever beside a live agent fanning out beside them. Fixing this would
need re-`chooseSession` on an already-claimed panel, which risks a claim that keeps jumping to
whatever session is newest (adopting a neighbour's conversation) — left alone on purpose.

**`spawnedAt` is the session's, not the client's (`pty-manager.ts`'s `firstSpawnedAt`).** A
REATTACHED session reuses the `spawnedAt` this manager already recorded, because `new-session
-A` makes "this client just attached" and "this process just started" the same call — a
reattached session's Claude Code directory was necessarily created BEFORE this attach.
Without reuse, `chooseSession`'s post-spawn filter (`createdAt >= spawnedAt`) rejects the
panel's own valid session directory the moment `Date.now()` is used instead, and a panel's
subagent nodes vanish at the first `Cmd+R` forever. **Known limit**: after a full app relaunch
(not a reload) this manager holds no prior value, so a session predating the relaunch becomes
permanently unclaimable for that panel — the safe direction (no nodes) either way.

**`detachAll()` forgets the dedupe key, never the claim itself (`pty-manager.ts`,
`subagent-watch.ts`'s `clearDedupe`/`clear`).** A reload's `detachAll()` calls `clearDedupe()`,
never `.clear()` — a full clear would also drop the confirmed session directory and byte offset,
forcing a re-derivation against the reattaching `create()` call's newer `spawnedAt`, which would
then reject the real (older) session directory. This was a real defect once, not hypothetical.

**The record list and the ambiguity count are both CAPPED and the overflow is NAMED, never
silently dropped (`SUBAGENT_CAP`, `DESCRIPTION_MAX`, `slugSharing`).** Nothing removes a record
once added, so the list only grows for a panel's life — capped, with the remainder reported as
`+N more`, the same rule `REVIEW_FILE_CAP` and the prompt-reading caps already state. The
ambiguity sentence's count (`"N panels share this repository"`) is the SAME number `attributable`
refuses on, computed once (`slugSharing`) rather than twice, so the refusal and the sentence
can't drift apart.

**A failed confirmation is remembered; a malformed `.meta.json` deliberately is not
(`subagent-watch.ts`'s `failedClaims`, `ingestMeta`).** A repeated confirmation failure used to
re-derive the same session directory and re-read the same (growing) parent transcript every 2s
forever, getting nowhere — reachable because `slugFor` maps `/` and `-` alike, so two
differently-named directories can share a slug. It's now remembered, keyed on the session
directory judged against, so a genuinely new session is still claimable. A malformed
`.meta.json`, by contrast, is retried rather than remembered — Claude Code writes those sidecars
WHILE this app is listing the directory, so a mid-write parse failure is a race to retry, not a
permanently bad file.

**The file watch is on the DIRECTORY, filtered to the basename — never on the file itself, and
this is the single most important line in the file-panel milestone (`main/file-watch.ts`'s
`FileWatchers`).** Agents and editors write a temp file and `rename()` it over the target,
replacing the inode — `fs.watch(path)` stays bound to the OLD inode and fires once for the
initial truncate or not at all, leaving a panel permanently stale with no error anywhere,
indistinguishable from a watcher that was never wired up. Watching the directory survives the
rename and delivers deletion/re-creation for free.

**A truncated file is READ-ONLY, enforced at TWO doors, because one wasn't enough
(`file-node-model.ts`'s `editable`, `FileNode.tsx`).** `FileResult.content` is capped while
`lines` reports the real count, so saving an edited truncated buffer would delete everything past
the cap while reporting success. The button-disable gate alone missed a second door: the
reseed effect's only conflict test was "not text", and a truncated result IS text — so an
untouched draft could silently reseed itself INTO a truncated state (e.g. an agent appends
40,000 lines while the draft sits open) and then save over the truncated view. The reseed effect
now treats truncation as a CONFLICT (never a silent reseed), and `save()` independently refuses
when `model.editable` is false — neither alone is sufficient, since a draft can arrive at
"now truncated" without the Edit button ever being pressed again.

**The draft lives in the component; `file-store.ts` stays a cache of main's answer, never a
second author (`FileNode.tsx`).** Watcher pushes keep landing while a draft is open; the
component decides not to reseed from them when DIRTY (an untouched draft reseeds freely — a
panel that went stale the moment you opened it to edit is a worse read view — a dirty one raises
a banner instead). The close `×` and a bare `Escape` in the textarea are both armed (one press
shows a warning line, a second press discards) rather than discarding unsaved text outright on
one press, matching `TerminalPanel`'s existing arming pattern rather than a modal.

**`FileWriteResult.mtimeMs` must be ADOPTED after a save, or the very next save reports a
conflict that never happened (`FileNode.tsx`'s `lastWriteRef`).** `file-watch.ts`'s dedupe hash
deliberately excludes `mtimeMs`, so saving byte-identical content (or reverting an edit) still
advances the file's mtime on disk without the watcher sending a push — the store keeps the
pre-save mtime, the next edit seeds `baseMtimeMs` from it, and the compare-and-swap then refuses
a legitimate save with "this file changed on disk" for a writer that doesn't exist. The
component adopts the returned mtime itself, keyed on the CONTENT it wrote so a genuine
third-party write (which changes the content) still invalidates the record correctly.
**Known, unfixed gap**: a workspace switch or reload still silently drops an unsaved draft with
no warning, because the draft lives in component state and a switch unmounts the panel with no
gesture to arm against.

**The toolbox reader is a PROJECTOR, not a passthrough — M14's credential-boundary rule reaching
a second data source (`main/toolbox-scan.ts`).** MCP server `env` blocks, `settings.json`'s
`env`, and free-text hook `command` strings can all carry secrets, so every function here
rebuilds its object field by field (never spreads): an MCP server's `env` values never cross,
`args` are reduced to a COUNT, a hook's command is reduced to its PROGRAM plus a real length —
this has no runtime symptom when broken (a spread would just work, and work with more detail),
which is why it's checked on the returned object's own KEYS (`verify:toolbox` 11/12). Dropping
MCP args entirely is a real UI cost (can't say which npm package a server is) accepted because
any rule that tried to RECOGNISE a secret in an arg string is a rule that can't be written
correctly. `readClaudeJson` reads exactly four allowlisted fields out of `~/.claude.json` (never
a denylist) because `projects[*].history` — the user's own past prompts — was observed present
on one real machine and absent on another; a denylist tuned against either is silently wrong on
the other.

**There is no `toolbox:changed` push, deliberately (pull, not push).** Half this feature's
sources (`settings.json`, `~/.claude.json`, `skills/`, `commands/`) are shared by every panel on
the canvas, so a panel-keyed watcher (the shape `FileWatchers` already uses for file panels)
would arm twelve watchers on the same four paths for twelve panels. Instead a node re-reads on
mount and on its own refresh control, and `readAt` is RENDERED — a pull model that didn't say
when it last looked would be a node confidently showing a config that changed an hour ago.

**`configStamps` stamps individual FILES, not only directories (`main/toolbox-read.ts`).** A
directory's mtime does NOT move when a file inside a SUBDIRECTORY changes — editing
`~/.claude/skills/foo/SKILL.md` leaves `~/.claude/skills` untouched, so a stamp vector holding
only directories is correct for every ADDED skill and permanently stale for every EDITED one,
with nothing on screen wrong. `configStampedAt` is captured at PANEL SPAWN (config is read at CLI
startup) and follows the same reattach rule `firstSpawnedAt` does — restamping on every `Cmd+R`
would clear the staleness flag on a genuinely stale, still-running agent.

**The toolbox node's model differs from the pane's on exactly one decision — the same split
`review-node-model.ts` already makes against `buildReviewFields` (`toolbox-node-model.ts`).**
`no-cwd` is HIDDEN in the 260px pane (which must vanish when it has nothing to say) and RENDERED
in the node (which the user deliberately opened — a node rendering nothing is indistinguishable
from broken). A hook row renders a COORDINATE (its event + matcher + slot), never a synthesised
name like `PreToolUse #2` — a fabricated name in a searchable list starts matching queries it has
no business matching.

**The agent knobs are ONE record (`shared/cost.ts`'s `AgentOptions`), not several optional
fields (`shared/toolbox.ts` and friends).** A permission mode, an effort tier and a model touch
NINE separate places that rebuild a spec or preset field-by-field
(`parsePanel`/`parsePreset`/`templateOf`/`presetFromCapture`/`toPanels`/`fromPanels`/two spots in
`Canvas.tsx`/the `pty.create` payload) — three OPTIONAL fields would be three conditional copies
at each site, and `tsc` sees nothing wrong at any of them since every one is legally optional.
One record and one shared `parseAgentOptions` (called by both the panel and preset parsers, never
pasted twice) makes it nine failure points instead of twenty-seven. Mode and effort are CLOSED
unions (an unrecognised value drops, falling back to the CLI's own — more restrictive — default);
`model` is deliberately an OPEN string with only a leading-alphanumeric-anchor guard, because a
closed model list rots the day a new model ships, and the guard exists only because `claude`'s
own arg parser reads a value starting with `--` as a FLAG rather than as `--model`'s operand
(shareable artifacts like `layout.json` and presets make this reachable, not shell injection,
which is unreachable — args cross as an argv array, never through a shell).

**The display reads `session.spec`, never `panel.spec` — safe only because the ONE way to change
a knob is a compound restart gesture (`inspector-fields.ts`, `Canvas.tsx`'s
`restartPanelWithMode`).** `registry.ensure` returns an existing session unchanged, so
`session.spec` is what most recently reached `pty.create`, while `panel.spec` is merely what the
canvas holds — reading the panel could claim a permission mode the running agent isn't actually
in, a confident wrong answer about a permission boundary. A "requested vs. running" split with a
durable record was designed and REJECTED: under tmux a reload's `create()` reconstructs rather
than observes the running argv, so that field would have lied in exactly the case it existed
for. Because restarting is the only mutation path and a restart always re-reads the argv, the
session's spec and the running process cannot disagree without a bare (non-restart) "edit this
panel's mode" ever being added — which would break this silently and is exactly what
`verify:rail`'s fixture (built with the two specs deliberately disagreeing) is pinned against.
Only `permissionMode` reaches the chrome (never effort/model) — a `bypassPermissions` panel
scrolled off screen is the one fact a canvas built for unattended agents must never make someone
hunt for; the built-in preset is `plan`, never `bypassPermissions`, since the one that ships to
everyone must be the one that can't write.

**The merged view's obstacle is COORDINATES, not `LIVE_BUDGET` (`renderer/canvas/merged-layout.ts`).**
An earlier design doc blamed the global WebGL-context budget for why a merged view couldn't
work; that was simply wrong — `assignTiers` spends the same eight slots whether the canvas holds
one workspace or four. The real obstacle is that every workspace lays its panels out in the SAME
world space around wherever ITS OWN camera has been, so two workspaces' panels overlap by
construction, and `cascadeCentre` can't help (it only separates a NEW panel from a coincident one
within one array). The fix is per-workspace LANE translation on the way to the screen.

**The merged view has no writer, and that's why its geometry is read-only (`Canvas.tsx`'s save
effect, `LayoutStore.mergedWorkspaces()`).** There is exactly one channel into this feature
(`workspace:merged`, a READ) and `panels` remains the only array `layout.save` ever writes — a
merged panel's `rect` is SYNTHETIC (a lane offset for one render) while its id/spec/title/kind
are the panel's own, unchanged copies. Persisting a synthetic rect would write a display offset
into `layout.json` as though it were real geometry, discovered launches later as every
workspace's panels having drifted a lane's width sideways. Drag/resize/close/marquee are all
gated on "merged" refusing outright, not merely a disabled palette row — the verb itself must be
the authority, since a disabled row is only an affordance.

**Entering the merged view resolves dormancy BEFORE it commits — the single most dangerous line
in this feature, and "a workspace switch is a second boot" reached a third door (`Canvas.tsx`'s
`toggleMerged`).** `pty.list()` is awaited BEFORE the merged array and its `dormantIds` commit,
in the same synchronous batch — the identical reasoning as the workspace-switch entry above, at a
worse scale: a merged view can spawn agents in EVERY workspace at once from a bare view toggle,
with no gesture aimed at any specific panel. This was only caught by MEASUREMENT (moving the
commit above the await reproduced it exactly, sessions count jumping and foreign panels reading
`dormant:false spawned:true`), not by argument. Leaving the view re-derives the active
workspace's dormant set from a FRESH `pty.list()` rather than carrying the merged one back.
Clicking a foreign panel's "click to start" card DOES still wake it deliberately — geometry is
read-only, processes are not, and one deliberate click differs from an unattended mass spawn.

**The merge/panel-count refetch is keyed on WHICH WORKSPACES EXIST, not only on this canvas's
panel count (`Canvas.tsx`'s `workspaceListSignature`).** A workspace MUTATION (delete, rename,
create) changes no panel on this canvas, so a refetch effect keyed only on `panels.length` missed
it entirely — deleting a NON-active workspace while merged left its lane rendering panels whose
sessions had just been disposed, and that lane is CLICKABLE: clicking a ghost runs
`onSelectPanel`, which mints a FRESH session for an id no workspace owns any more, reachable from
no UI ever again. The signature is a STRING derived from the workspace rows (id/name/active),
deliberately not the array itself (a fresh identity on every reload proves nothing moved) and
deliberately not the rail's OWN `workspaceSignature` (which also folds in waiting counts and
would refire on every bell).

**A move touches no session and pushes no history, and the history-clearing half is the one the
original design got wrong (`Canvas.tsx`'s `movePanelsToWorkspace`).** No session/registry call in
the move loop, confirmed by the same `pty.kill`-caller-count regex the rest of the file relies
on. "Push no undo entry" is necessary and NOT sufficient: leaving the PRE-move history intact
meant one `Cmd+Z` after a move stepped back to a state that still listed the moved panel and
DISPOSED it — an agent now belonging to another workspace, killed by an undo in the workspace it
just left. The fix is to CLEAR the history stack on a move, the identical ruling a workspace
switch already makes for the identical reason. **Known, accepted cost**: this also makes every
EARLIER gesture in the canvas un-undoable after a move, with no inverse gesture short of moving
the panels back by hand.

**The marquee starts only where `hitTest` finds nothing, never merely "the background handler
ran" (`Canvas.tsx`'s `onMouseDown`).** A CARDED (demoted) panel has no chrome handler of its own,
so its press falls through to the background path exactly like empty space — and once
`LIVE_BUDGET` is spent, cards are most of the canvas. Arming the marquee unconditionally in the
background handler would rubber-band every time a user clicks a card, which is the ordinary
case, not an edge one — the guard has to be inside the miss branch of the hit test. It's also
gated off entirely while merged (a band swept across lanes would hand a multi-workspace
selection to a move verb that can't act on it) and ends any in-progress band the instant the
merged view is entered, via a ref-published `endMarquee` rather than merely gating `onMove`
(which would leave the gesture's document-level listeners running past the point they mean
anything).

**Workspace-switch chords match `event.code`, never `event.key` (`useViewport.ts`).** Shift
rewrites the printed character (`Cmd+Shift+]` arrives as `key === '}'`), so a `key`-based test
works perfectly for whoever wrote it and is silently dead for anyone on a different keyboard
layout, where that physical key prints something else under Shift — a failure with no error and
no complaint from the person it fails for, since it simply never worked for them.

**`switchWorkspace` leaves the merged view FIRST, at the source, not in the chord handler
(`Canvas.tsx`).** `workspace.activate` has exactly one call site reached from four different UI
surfaces (rail row, palette row, a test hook, delete-active) — a guard placed in the newest
chord handler alone would leave the other three able to switch away from an open merged view
without clearing it, and every subsequent save would then write the PREVIOUS workspace's
pre-merge camera/selection into the INCOMING workspace's on-disk record.

**One in-flight flag covers BOTH async workspace transitions — switch and merge-toggle — because
either can interleave with the other or with itself (`Canvas.tsx`'s `transitionRef`).** Both are
multi-await sequences (an IPC round trip plus, for a switch, a captured `outgoing` snapshot), and
two overlapping transitions can each write a different workspace's stale panel array into the
wrong on-disk record, or leave `merged` true while `preMergeRef` describes a workspace that's no
longer active. A second transition attempt while one is in flight is REFUSED outright, never
queued (a queued switch would land on a canvas the user has since left) — set synchronously at
entry, released in a `finally` positioned so a throw from the state-writing code can't leave it
permanently stuck (a stuck flag would silently disable both workspace chords for the rest of the
run, which is worse than the corruption it prevents). `deleteWorkspace` is the one caller that
must treat a refused switch as an ABORT rather than proceeding to remove the workspace anyway —
proceeding would remove the still-active record without ever having left it.

**The inspector's Save reads what's DISPLAYED, not what's stored, and this is the one place the
read-only/write-only split runs the other way (`Canvas.tsx`'s `savePanelAsPreset`).** Everything
that acts on what's SAVED reads the stored panel array; everything that acts on what's DISPLAYED
reads the merged/lane-shifted one — Save was on the wrong side of that split, so saving a preset
from a foreign panel while merged silently found nothing and did nothing, an affordance that
lied rather than one that was disabled with a reason. It now reads the displayed array, because
a preset is a pure READ (it writes no workspace record, moves no session, and the panel's own
`w`/`h` are unaffected by a lane offset) — unlike dragging a foreign panel, which remains
refused.

**A move captures `focusedId` BEFORE its own IPC await — a live, unfixed instance of the trap the
marquee entry above exists to prevent (`Canvas.tsx`'s `movePanelsToWorkspace`).** If focus moves
onto one of the panels being moved DURING the round trip, `focusedId` is left naming a panel this
canvas no longer holds — held live by `assignTiers` forever, with no rect and no row anywhere on
screen to reveal it. The fix (re-read `focusedIdRef.current` after the await, the same pattern
`restartPanel` and `openReview` already use across their own awaits) has not been applied; this
is recorded here as a known, narrow-window gap rather than a shipped fix.

**No file contents ever cross the `fs:list` IPC boundary (`main/fs-tree.ts`, `shared/fs-tree.ts`).**
`readDir` answers names and kinds only — there is no `fs:read` channel and none is planned,
deliberately: a preview of file contents would be a second, silent disclosure channel for
whatever an agent just wrote to disk (this repo's standing rule that any feature moving
terminal bytes off the panel is a disclosure surface).

**Every file-tree row mounts `shellControl`, and here losing it is FATAL, not merely bad
(`shell/FileTree.tsx`).** A file row's whole job is to paste its path into whatever panel DOM
focus currently names — a row that stole focus to itself would read its own click back as the
paste target (a panel with no PTY at all), and the symptom ("clicking a file does nothing") has
no error to point at the missing `preventDefault`. This is the one control in the app where the
`shellControl` convention is load-bearing rather than merely consistent; `verify:panels` 157 is
the only check in this feature that CANNOT be written with a dispatched event, since a synthetic
`MouseEvent` never moves DOM focus regardless of whether `preventDefault()` ran.

**A filename is a wider door than a title (`shell/file-tree-model.ts`'s `treeSignature`).** The
rail's own `JSON.stringify`-over-separator-join rule (see the rail-signature entry above) matters
MORE here: a panel's title is USER text (typed into a rename prompt this app controls), while a
filename is AGENT text (written by whatever CLI is running, into a directory this app doesn't
own, with no rename prompt required) — a wider, easier-to-hit door to the same field-boundary
collision.

**The tree roots on the SELECTED panel and pastes into the FOCUSED one, deliberately different
panels (`Canvas.tsx`'s `treeRoot`/`insertPath`).** A rail-row click selects without focusing (see
"The rail navigates" above), so a user routinely has one panel selected (browsing) and a
different one focused (holding DOM focus, the `Cmd+C`/paste target) — the tree roots on
SELECTED (browsing shouldn't require re-focusing its terminal) while a paste has to land where a
keystroke would, which is FOCUSED. This split makes the relative-vs-absolute path decision a real
question: a relative path is only guaranteed correct when the paste target and the tree's root
happen to be the SAME panel, so `insertPath` resolves absolute in every other case — a
naive always-relative version is silently wrong (and never errors) the moment the two diverge.

**Known manual-only verifications, not covered by any automated check.** Each of these was
confirmed once, by hand, against a real machine/keyboard/CLI/build rather than by anything
`npm run verify` re-runs — treat a green suite as silent on each of them, not as proof:

- **Auto-repeat guards** (`verify:panels` 7b/33b/75b/153 and siblings) prove only that the code
  *reads* `event.repeat`; that a physically held `Cmd`-modified key actually sets that flag on
  macOS/Electron was confirmed once via a throwaway `sendInputEvent` probe using the
  `isAutoRepeat` MODIFIER STRING (not a top-level field, which is silently ignored).
- **The nav grid's `Cmd+Tab` dismissal** (`useNavGrid.ts`) relies on a physically released `Cmd`
  emitting a `keyup` with `key === 'Meta'` while the window has focus — unverified beyond
  argument, since a synthetic `sendInputEvent` only ever echoes the modifiers it's handed.
- **The nav grid's already-active-workspace guard** (a release with no arrow pressed must not
  call `switchWorkspace`) was verified once with a throwaway call counter never checked into
  any suite; nothing renderer-visible distinguishes a same-id switch from a true no-op.
- **`safeStorage`'s actual OS-level protection** (a Keychain ACL bound to the app's code
  identity) is unobserved by `verify:credentials`, which drives the store against an injected
  fake crypto — and this app's own unsigned beta builds (`identity: null`) bind that ACL more
  weakly than a signed release would; re-verify against a signed build before trusting it.
- **A real GitHub PAT verify** was confirmed once by hand against a real token: the row's title
  moved from the default label to the account's real login, and `credentials.json` on disk held
  a `cipher` field, no `token` key, and zero plaintext token patterns. The REJECTION path (a
  revoked/under-scoped token) has only ever been exercised against a fake fetcher.
  `verify:panels` 130 deliberately makes NO real network request, by probing `verify()` before
  any credential is stored (hitting an early guard) — `npm run verify` must stay offline.
- **`webUtils.getPathForFile` resolving a Finder drag's real path** cannot be exercised by any
  synthetic `dataTransfer` (which carries no OS-backed `File`); `verify:panels` 134 drives the
  same mint function through a test hook instead, which proves the rest of the pipeline and
  nothing about the drop gesture itself.
- **The `--session-id <uuid>` flag causing Claude Code to name its transcript `<uuid>.jsonl`**
  is an assumption about another program's undocumented behaviour, observed once on one Claude
  Code version. No suite spawns a real `claude`; a future release changing this makes the whole
  Cost feature go silently and permanently quiet (never an error) with every suite still green.
- **The exact flag spellings for `--permission-mode`/`--effort`/`--model` and their accepted
  values** were read off `claude --help` once, on one CLI version. `agentArgs` never appends a
  flag to a user-typed command (see "An absent `command` must stay absent"), but a future CLI
  rename of an accepted value turns every panel using that mode into one that fails to spawn,
  with every suite here still green, since none of them spawn a real `claude`.
- **A dispatched `KeyboardEvent`/`MouseEvent` never proves what a REAL keypress or Finder
  interaction does, only what the handler under test does** — this shows up repeatedly (nav
  grid keyups, palette focus-restore after close, `ReviewNode`/`FileNode` draft-close focus
  restore, `shellControl`'s focus-preservation): a synthetic event is `isTrusted: false` and
  Blink performs no default action for one, so any check built from `dispatchEvent` can at best
  show the guard reads the right flag, never that the platform sets it the way assumed.
- **Whether a rail row's agent-state glow comes from that row's own per-id subscription (the
  design) or from one list-level read passed down** — both paint identical DOM, and no test in
  this repo can tell them apart without adding an impure render-counting side effect to
  production code, which was deliberately declined.

**A note is a file panel in PROSE mode, and refusing a sixth `kind` is the
whole of M27's design (`shared/file-panel.ts`'s `FileSource.prose`).** Every
panel kind this app had was a read-out of something the machine already knows —
a diff, a file, a config, a ticket, a process. A note is the first that is a
place the user puts thought, and the temptation is to make it a kind. It is not
one, because a note is not a different sort of THING from a file panel: same
`FileSource`, same `file:read`/`file:write`/`file:close`/`file:changed`, same
directory watcher, same compare-and-swap M22 hardened. What differs is how it
is painted and that it opens in edit mode, and both are display facts.

The ceremony that buys is worth listing, because each line of it is a silent
failure this file already records: `isTerminalPanel` would gain a sixth
negation (miss it and a note gets a `PanelSession`, a `LIVE_BUDGET` slot and a
WebGL context for a `<div>`), BOTH `nextIdRef` regexes would need a sixth
prefix (miss one and duplicate panel ids are dropped silently at the next
load), five `registry.dispose` guards would need a sixth arm, and three store
clears a sixth site. All of them are already correct for `kind: 'file'` and
none of them moves. `verify:panels` 94's two source-text counts — five
disposes, two `pty.kill` callers — are UNCHANGED by this milestone, which is
the fact to check before "fixing" that number.

**The rail still says `note`, through a DISPLAY kind rather than the union's**
(`rail-rows.ts`'s `RailTailKind = Panel['kind'] | 'note'`). The tail is the one
place the distinction is worth making to a user — the rail is how a panel is
found again — and deriving it in `buildRailRows`, which holds the panel, rather
than inside `railTail`, which is handed a bare kind, is what keeps every other
caller of `railTail` untouched. Build it as a kind the day notes diverge for
real (markdown rendering, backlinks, an index); not before, which is
`AgentKind`'s own rule and `ideas-backlog.md` #11's.

**`prose` is `true` or ABSENT, never `false`, at five copy sites.** The
absent-stays-absent rule `command`, `title` and `agent` each already record,
reaching a fourth field: `parseFileSource`, `toPanels`, `fromPanels`,
`makeFilePanel` and `Canvas.tsx`'s `openFilePanel` all copy it CONDITIONALLY.
A spread writes `prose: undefined` into `layout.json`, where `'prose' in
source` reads TRUE for a file panel that was never a note. `parseFileSource`
accepts only an exact `true` and drops anything else — dropping the FIELD and
keeping the PANEL, which is the toolbox `label` precedent rather than its own
all-or-drop `path` rule: a path is the fact a file panel is made of, a note
flag is a display convenience, and losing the panel over one trades a wrong
view for no view at all. `verify:layout` 150-152, `verify:viewport` 93.

**`createFile` uses `wx`, and that is not a stylistic preference
(`main/file-create.ts`).** `writeFileSync(target, seed, { flag: 'wx' })` asks
the kernel to create-or-fail atomically. The obvious `existsSync` check
followed by a write is a TOCTOU, and in THIS app the racing writer is an
autonomous agent working in the same directory — so the race is the ordinary
case rather than an exotic one, the same reasoning `review-commit.ts`'s
HEAD-moved guard already records. `verify:file` 20 is the check, and its
second clause is the whole of it: the existing file's BYTES are unchanged.
Asserting only the refusal passes against an implementation that refused the
caller and clobbered the file anyway, which is `verify:file` 12's own rule for
the write path and `verify:credentials` 6's for the credential store.

**An existing name RE-PROMPTS rather than opening the file.** "Create" and
"open" are different acts, and silently turning one into the other is how a
user ends up appending to work they did not know was there. `exists` is its
own arm rather than a `failed` for the same reason `refused` and `failed` are
split in `review-commit.ts`: the fix is to rename, not to go and look at the
filesystem. The re-prompt reaches the user through `InputMode.feedback`,
and `beginNewNote`'s `prompt` MUST call `palette.openPalette()` alongside
`setInputMode` — Palette.tsx closes the overlay before calling submit, so a
mode set on a closed palette is wiped by Canvas's own clear-on-close effect.
That is the pairing `beginRenamePreset`, `deletePreset` and `beginEditSetting`
all already make, and it was watched failing here: `verify:panels` 176
reported the palette back in command mode, so a duplicate name silently did
nothing at all.

**`noteRoot` is deliberately NOT `treeRoot` (`Canvas.tsx`).** The tree roots
on a terminal panel's cwd or a review node's repo root and answers null for a
file panel, which is right for browsing a project. It is wrong for notes for a
reason that only appears in use: creating a note SELECTS it, so the very next
New note row would be disabled by the note just made, and a second note would
need the user to go back and re-select a terminal. `noteRoot` therefore falls
back to a selected FILE panel's own containing directory. The tree is left
alone rather than widened, because re-rooting it on a file panel is a change
to M20's behaviour this milestone has no business making on the way past.
Found by `verify:panels` 176 failing with the row DISABLED, not by reading the
code — and the same fact is what makes that check re-select the terminal panel
before its duplicate attempt, since otherwise the same relative name resolves
under `notes/` and is a perfectly legitimate create.

**A note auto-enters edit mode exactly ONCE (`FileNode.tsx`'s
`autoEditedRef`).** Not on every render where `draft === null`: re-entering
there would make Escape appear to do nothing, since the effect would reopen
the draft the user had just discarded. It is gated on `model.editable` for the
same reason the save path is — a truncated or non-text note must not open an
editor whose save the gate will then refuse — so such a note opens as a read
view, which is the honest answer rather than a degradation. M22's truncation
gate is inherited UNCHANGED: `prose` is a rendering fact and `editable` is a
safety one, and treating "notes are for writing" as a reason to bypass the
gate would let a save delete every line past `FILE_MAX_LINES` while reporting
success. `verify:rail` 111.

**The editor keeps the `.file-node__editor` class, and that is load-bearing.**
`useNavGrid`'s target test names that class, so a note inherits the guard with
no edit. A new `.note-node__editor` would have silently reopened the
documented failure: `Cmd+G` typed into a draft reveals the grid, the open
branch's `default:` arm swallows every further keystroke, and releasing `Cmd`
switches workspace and unmounts the panel with the draft unsaved.

**No markdown rendering, and the refusal is the same one `parseFrontmatter`
already makes.** A renderer means a new runtime dependency this repo declines,
or a hand-rolled parser whose failure mode is a PARSER DIFFERENTIAL — this app
rendering what its own parser says while the user's real markdown tool says
something else, which is invisible rather than merely wrong. The value here is
the place to write, not the formatting.

**M27 adds ONE invoke: `file:create`, 46 -> 47.** Deliberately not a flag on
`file:write`: a write is a compare-and-swap against a file that EXISTS and a
create is refused precisely BECAUSE one does, so sharing a door would turn
`baseMtimeMs: null` — the deliberate force-overwrite a user reaches only after
seeing a conflict — into an accidental create. Note that `EXPECTED_CHANNELS`
read 46 before this milestone while the `verify:ipc` row of the table above
said 45: the SCRIPT is the authority, and the prose had already gone stale.

**`verify:file` checks 7 and 9 were flaky before M27 touched them, MEASURED at
5 failures in 20 runs on unmodified main.** `fs.watch` arms asynchronously on
macOS, so `watch()` returns before FSEvents is delivering and a rename or an
`rmSync` issued on the very next synchronous line can land unobserved —
nothing about `FileWatchers` is wrong. A fixed sleep is what this repo refuses
everywhere else, so both now RE-DRIVE the real gesture until it is observed;
each iteration is a genuine atomic write or a genuine delete, so what is
asserted is unchanged, and the naive `fs.watch(path)` implementation check 7
exists to reject still fails because no repetition rescues a watch bound to a
dead inode. 0 failures in 20 runs after. **Checks 8 and 10 carry the same race
and are NOT fixed**: both are NEGATIVE assertions, so the race makes them pass
for the wrong reason rather than fail, and closing that means proving the
watcher is live with a probe write and asserting a delta — a larger edit to
checks whose subject M27 does not touch. Recorded in both checks' own comments.

**What M27 did NOT solve, kept honest.** No markdown rendering, no note index,
no backlinks, no search. A workspace switch or a `Cmd+R` reload still takes an
unsaved draft with it — M22 records that limitation, and a note auto-entering
edit mode makes it MORE reachable rather than less, so it is restated here
rather than left as M22's footnote. And a note with no panel selected is
unreachable: the row is present and disabled with its own reason rather than
falling back to `$HOME`, because a note dropped in the home directory is not a
note about anything.

## Gotchas

- **Jira ticket context is `paste()`, never `write()` (`TerminalPanel.tsx`).** A ticket
  description is agent context, not a credential, so it may cross to a session; but it is
  usually multi-paragraph. Raw writes submit every newline separately, firing incomplete
  fragments into the agent before the description arrives. The terminal's `paste()` is the
  bracketed-paste path and is the only acceptable handoff.

- **`Cannot read properties of undefined (reading 'whenReady')`** — your shell exports
  `ELECTRON_RUN_AS_NODE=1` (VS Code's extension host does this), so the Electron binary boots
  as plain Node. `dev`/`start` already `unset` it; you only hit this invoking `electron-vite`
  directly.
- **`Error: Electron uninstall`** — the binary download didn't run:
  `node node_modules/electron/install.js`.
- The renderer has a strict CSP in `src/renderer/index.html` (`default-src 'self'`). No CDN
  scripts, no remote assets.
- `tsconfig.node.json` / `tsconfig.web.json` both set `noUnusedLocals` and
  `noUnusedParameters` — prefix intentionally-unused params with `_`.
- A trackpad pinch arrives as a wheel event with **`ctrlKey: true`** and no key held. It is a
  WebKit convention Chromium adopted, and it is the only signal separating pinch from scroll.
- `deltaMode` is not always pixels: trackpads report `0`, mouse wheels report lines (`1`) and
  need roughly a 16x multiplier before the deltas are comparable.
- **A drag delta is `screenToWorld(p₂) − screenToWorld(p₁)`, never
  `screenToWorld(p₂ − p₁)`.** `screenToWorld` subtracts the viewport translation before
  dividing by scale; applying it to a delta subtracts a translation that should have
  cancelled, so the panel drifts off the cursor as soon as the viewport isn't at the origin.
  `verify:viewport` check 27 exists for this.
- **`applyDrag` (`panel-interaction.ts`) recomputes from the gesture's origin rect every
  frame, never from the previous frame's result.** Accumulating per-frame deltas drifts (each
  frame rounds, and at `scale: 0.1` one rounding is worth ten world units) and breaks outright
  if the user zooms mid-drag, since earlier deltas were measured under a transform that no
  longer applies. `applyDrag` itself only ever receives two already-resolved *world* points,
  so neither bug is reachable from inside the function — both are caller-side mistakes.
  `verify:viewport` checks 27 and 28 pin real properties of `applyDrag` (drag distance scales
  as `1/k`; the function is stateless) but are not what would catch either regression; the
  actual discriminator is `verify:panels` check 10, which dispatches a zoom mid-drag
  specifically to separate a correct recompute-from-origin implementation from one that
  accumulates screen-space deltas. A variant that instead advances *both* the drag state's
  origin fields together every frame is mathematically identical to the origin-based
  implementation and cannot be told apart by any assertion on the final rect — check 10's own
  header records that limit; don't rediscover it by trying to tighten the check.
- **A dispatched event on `.panel__slot` never reaches xterm's listeners.** `.panel__slot`
  only wraps the terminal's host div; xterm binds both its selection mousedown
  (`addDisposableDomListener(this.element, "mousedown", ...)`) and its mouse-reporting
  handlers (`bindMouse()`: `const t = this.element`) on `.xterm` — one level *below* the slot,
  not on `.xterm-screen`, which supplies only the rect the coordinates are measured against.
  Capture-toward-target traversal does not visit a target's own descendants, so an
  `executeJavaScript` check that dispatches on `.panel__slot` to verify "does xterm see this"
  will pass or fail for the wrong reason no matter what the guard under test actually does.
  Dispatch on `.xterm-screen` — a descendant of `.xterm`, so `.xterm`'s listeners are on its
  propagation path, and the same node a real cursor over the rendered terminal would be over.
  This cost two fix rounds in `verify-panels.cjs` during M4a.

## Working on this repo

Milestones follow a fixed shape: a design spec in `docs/superpowers/specs/`, then an
implementation plan in `docs/superpowers/plans/`, then tasks executed test-first — failing
checks written and *watched failing* against a non-existent module before it is implemented.
M2 and M3 are both worked examples of this. Follow it when starting the next unscheduled
milestone — see `docs/ideas-backlog.md` for candidates.

## Conventions

- Commits: conventional format scoped by milestone, e.g. `feat(m3): ...`, `fix(m3): ...`.
- Comments in this codebase explain *why*, especially for the workarounds above. Match that
  density; a non-obvious line without a reason attached will be "fixed" by someone later.
- **A new verify check takes a SCOPED id, never the next global integer.** Write
  `ok('kind-tail.1 …')`, not `ok('186 …')`. `ok()`'s first argument is free text and
  nothing parses it (`results.push({ n, pass, detail })`), so this costs nothing at
  runtime and removes the one thing that has forced seven-plus `renumber` commits in
  this repository's history: two branches that never saw each other both appending
  from their own view of the last number, both correct, colliding on merge. "M13" was
  claimed four separate times. A scope name describes the SUBJECT, so two branches
  picking the same one are working on the same thing and would have conflicted anyway.
  Existing numeric ids stay exactly as they are — hundreds of them are cited above —
  and `verify:meta` 22 fails the build if two COMPUTED checks in one suite ever share
  an id. (A guard or skip branch reusing its own check's id is fine and is not
  flagged: only one of the two ever runs, and it is told apart by passing a literal
  `true`/`false` where a real assertion passes a computed expression.)
- **Don't restate a count in prose in more than one place.** `verify:meta` 23 exists
  because seven module-level stores each numbered themselves by hand and the numbers
  read third, FIFTH, FOURTH, FOURTH, —, SIXTH; two files claimed the same ordinal and
  this file repeated two of the wrong ones. Record the rule, not the tally. Where a
  count genuinely has to be written down, `verify:meta` is where it gets pinned so it
  cannot drift silently — that is what rules 19 and 22 already do.
