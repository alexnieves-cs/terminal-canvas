# Architecture and documentation audit — 2026-09-10

## Decision summary

Terminal Canvas has strong foundational boundaries: source-import analysis found no cycles, and its
pure geometry, parsing, session-lifetime and IPC rules are unusually well documented and tested. The
next architectural risk is not a missing framework. It is a handful of orchestration roots that now
coordinate too many independent domains.

The recommended direction is incremental extraction around existing ownership. Do not introduce a
global state library, replace typed unions with untyped registries, or attempt one large rewrite.
Correct the development record first, then make each new feature enter through a domain seam rather
than enlarging a root module.

## Scope and evidence

This was a static audit of the current working tree: 327 production TypeScript/TSX/CSS files
(83,004 lines), 71 verification/support scripts (58,968 lines), project configuration, the IPC
surface, persistence path, renderer composition and Markdown hierarchy. Alias-aware import analysis
found no source cycles.

No verification command was run for this report, so this is not a green-build claim. The audit began
with M234–M236 work already uncommitted in CLAUDE.md, README.md,
docs/build-log/m225-m243-ledger.md, scripts/verify-panels-core.cjs,
src/renderer/styles.css, and two untracked M234 log files. Findings about that work are structural,
not a review of its implementation.

| Signal | Evidence | Meaning |
|---|---:|---|
| Source concentration | Largest 10 production files hold 27,718 lines (33.4% of source) | A third of the implementation has concentrated change coupling. |
| Canvas root | Canvas.tsx: 7,199 lines, 176 resolved imports, 155 callbacks | The principal renderer composition point owns too many domains. |
| Palette action root | usePaletteActions.ts: 2,388 lines; 97 named dependency entries | It is an indirect second Canvas root. **ADDRESSED:** split by domain into `canvas/palette-actions/` (8 slices); the file is now a 137-line composition root. The dependency bag is unchanged — it is the hook's contract with Canvas, and shrinking it is a separate question from where the verbs live. |
| Persistence root | layout-schema.ts: 2,288 lines; 41 exported functions | One safe parser now owns many record codecs. |
| IPC root | ipc-contract.ts: 1,858 lines and 67 importers | The contract is rightly central, but costly to evolve by hand. |
| Test concentration | Largest 10 scripts hold 37,445 lines (63.5% of scripts) | Good coverage is becoming difficult to navigate and extend safely. |
| CSS surface | styles.css: 5,039 lines and roughly 1,632 class-selector occurrences | Cascade order and test-selected aliases are now architecture. |
| Visual documentation | shot.cjs and visual goldens: 60 scenes; README claims 39 | An externally visible factual drift. |

The highest-concentration production modules are Canvas.tsx (7,199), styles.css (5,039),
palette/commands.ts (2,510), canvas/usePaletteActions.ts (2,388), main/index.ts (2,334),
shared/layout-schema.ts (2,288), shared/ipc-contract.ts (1,858), main/pty-manager.ts (1,541),
shell/inspector-fields.ts (1,420), shell/Inspector.tsx (1,141), panels/panels.ts (1,081), and
main/agent-session.ts (1,056).

## Priority 0 — correct the development record

### Product language no longer describes the product

package.json and the first paragraphs of README describe a canvas where every node is a live
terminal. panels.ts has sixteen panel predicates, including chat, file, review, workflow, browser,
image, note, work and integration objects. This is a public and contributor-facing model mismatch.

Update both descriptions to say that Terminal Canvas is an infinite canvas of authored work objects,
with live terminals and conversations as first-class objects. Keep the terminal heritage, but do not
make it the data-model definition.

### README has a stale visual-scene count

README says npm run shot renders thirty-nine scenes. scripts/shot.cjs defines sixty and
verify/visual/goldens contains sixty. Prefer “the current visual-scene set” unless the number is a
user-facing commitment; otherwise derive and pin it with a narrow metadata check.

### The product audit is duplicated

docs/product-development-guide-2026-09-08.md repeats the complete fourteen-section product audit
after its D01–D20 plan. A diff against docs/product-audit-2026-09-08.md shows the same body under a
different heading and introduction. The guide already links the audit, so these are competing copies.

Keep the dated product audit as evidence. Replace the repeated section in the development guide with
a short link saying that the audit is historical input and D01–D20 is the execution order. This
deletion removes drift without deleting history.

### The active work pointer is ambiguous

The README milestone table records M234–M236 as v11 work immediately before a heading called
“What’s next — the v10 run (D01–D20).” The v10 guide remains useful as a long-range product program,
but should not look like the current act.

Add one maintained current-work pointer near the milestone table: active branch/act, active spec,
active plan, active ledger and next decision. Keep the v10 guide explicitly labeled as the long-range
roadmap. Do not move the milestone table or IPC diagram; verify:meta treats them as contracts.

## Priority 1 — reduce orchestration roots

### Make Canvas.tsx a composition surface again

Canvas.tsx owns panel history and selection, registry/tier coordination, workspace switching, palette
actions, work-item dispatch, review, workflow, previews, files, vault, assets, notes, browser state,
watcher state, keyboard actions and render dispatch for every panel kind. The module should remain
the place where canvas-level dependencies meet, but not the implementation site for every canvas
feature.

Extract contiguous hook blocks at their existing positions, preserving the rule in CLAUDE.md about
hook ordering. A safe ownership split is:

| Controller | Owns | Must not own |
|---|---|---|
| useCanvasPanels | panel array, selection, history, groups, marks, panel mutation helpers | PTY or chat session lifetime |
| useCanvasSessions | registry wiring, tiers and ephemeral store cleanup | persisted geometry and workspace records |
| useCanvasWork | work items, lanes, Start work and review handoff | generic panel construction |
| useCanvasArtifacts | files, vault, preview, browser, image, note and portable-file verbs | shell navigation state |
| CanvasWorld | panel-kind render dispatch, layers and gesture attachment | durable policy and IPC decisions |

Each controller needs a narrow port, not a copied version of the entire Canvas dependency list. The
module-level registry must remain outside React; this refactor must not give a component ownership of
xterm or PTYs.

### Split palette actions and rows by domain

usePaletteActions.ts has a 97-entry callback bag and commands.ts builds the entire command surface in
one 2,510-line module. Add domain producers such as palette/actions/panels, palette/actions/work,
palette/actions/artifacts and palette/actions/settings, then compose their results into the existing
PaletteActions facade. Split command producers similarly, with buildCommands retaining the current
section and row order.

This is the recommended first code extraction. It has a strong plain-node verification seam and
reduces pressure on Canvas without changing a user journey.

### Create a panel-kind seam without weakening typed safety

panels.ts combines the model union, factories, predicates, links, geometry, marks and copy behavior.
Canvas.tsx, layout-schema.ts and inspector-fields.ts then repeat panel-kind branching. Adding a kind
currently requires coordinated edits across several high-risk files.

First split panels.ts mechanically into panel-types, panel-factories, panel-guards, panel-links and
panel-marks, retaining panels.ts as a compatibility re-export. Then consider a typed
PanelKindDefinition only for common facts: kind, constructor, codec, inspector projection and renderer
selection. Keep exhaustive switches where lifecycle differs, especially terminal versus sessionless
panels. Do not introduce an untyped registry: unknown persisted data must stay unknown, not become a
terminal by accident.

### Divide persistence by codec, not by store

layout-schema.ts correctly keeps absent, malformed and unknown values distinct, but it now parses
panels, workspaces, preferences, baselines, sessions, worktrees, templates, teammates, routines,
annotations, runs, groups and bookmarks. Extract pure codecs into shared/layout-codecs by record
family and pass one warning collector explicitly so wording and ordering remain deterministic.

Keep parseLayout and serialiseLayout as the public authority. Keep LayoutStore as the one snapshot
owner: its coalesced write and workspace-switch transaction are the very operations that must not be
split into independent stores. Only then extract pure snapshot mutation groups from layout-store.ts.

### Narrow main boot and IPC registration

main/index.ts has 91 resolved imports and builds both the runtime graph and feature wiring.
main/ipc.ts registers 134 handlers in one operation. Both are appropriate composition points, but
feature work now requires editing broad dependency lists and long handler runs.

Reduce index.ts to service construction, window/application lifecycle and shutdown. Introduce a
small MainServices assembly and capability registrars for persistence/workspaces, sessions/agents,
files/artifacts, integrations, and review/work. registerIpcHandlers remains the stable facade that
calls those registrars and provides one cleanup path.

Keep src/shared/ipc-contract.ts authoritative. It may later re-export capability-oriented type maps,
but IPC, IPC_EVENTS and CanvasBridge should remain available from that entrypoint. Do not create a
generic “invoke arbitrary channel” bridge; explicit preload capabilities are a security boundary.

## Priority 2 — maintain feature edges

### Put inspector projections beside their panel kinds

inspector-fields.ts is a 1,420-line pure projection with twenty-four exported functions; Inspector.tsx
is another 1,141 lines and also hosts workflow-node editing. Keep the shared inspector shell, link
model, summary and signature central. Extract per-kind field builders next to their panel domain and
compose them through one buildInspectorModel. Split Inspector.tsx into its panel shell, link/
automation sections, run section and workflow-node editor. Preserve model keys and DOM aliases.

### Treat PTY and agent managers as late, characterized extractions

PtyManager and AgentSessionManager are large state machines with timers, processes and termination
ordering. Size alone is not a defect. The viable seams are operational: command/cwd resolution and
filesystem adapters; output/scrollback accounting; polling; backend protocol adaptation; permission
handling; auto-run policy; and batched event emission. Extract only a seam that existing injected
dependency suites can characterize. Keep one manager as lifecycle owner and one explicit shutdown
path.

### Split CSS by cascade layer

Keep styles.css as the sole imported entrypoint and split it in deterministic order: tokens/reset,
panel frame and aliases, canvas layers, shell/palette/inspector, then leaf feature styles. Extract
leaf sections first and update verify-styles intentionally. Use existing native CSS/bundler behavior;
add no styling dependency. Never rename .panel__*, *-node__* or .pf__body, and do not move overrides
without visual evidence because order is behavior.

### Improve test extensibility without making it less real

Seventeen verification scripts exceed 1,000 lines; the five panel suites contain more than 21,000
lines. They deliberately share a real renderer and ordered state, so splitting them into independent
unit tests would lose valuable coverage. Instead extract fixture builders, DOM readers, cleanup guards
and assertion helpers into the harness layer. Preserve the top-level ordered journeys and their
tallies. Reusable try/finally helpers for swapped handlers and fixture cleanup would reduce the risk
that one thrown check poisons later cases.

Do not add arbitrary maximum-line-count checks. They reward cosmetic fragmentation. A structural check
is justified only when an extracted boundary protects a silent failure the current suites cannot see.

## Documentation system changes

The repository retains valuable history but is hard to enter: docs/build-log has 117 Markdown files,
docs/superpowers/plans has 130, and docs/superpowers/specs has 148. Retain those records; improve
navigation by separating current truth from historical evidence.

Add a small docs/current-state.md and link it from README, CONTRIBUTING and docs/build-log/README.md.
It should list only the current release, branch/act, active spec/plan/ledger, next decision, and links
to the product contract, architecture, verification and user guide. Give it a dated update rule so it
does not become another stale roadmap.

| Category | Role | Recommended action |
|---|---|---|
| README, CLAUDE, architecture-map, verify-suites | Current contract | Keep concise, linked and actively reconciled. |
| docs/current-state.md | Current navigation | Add; make it the first destination after AGENTS.md. |
| getting-started, CONTRIBUTING, SECURITY | Human runbooks | Update when behavior or contribution entrypoints change. |
| build logs, plans, specs | Decision history | Retain; do not delete for tidiness. |
| dated audits and research | Evidence | Retain once, link to it, and state its checkout/date scope. |
| load-bearing-recovered.md | Recovered historical constraints | Retain, but add a clear historical-status banner and link to the active counterpart. |

CONTRIBUTING should also point a returning contributor to current-state, architecture-map and the
module-specific load-bearing search requirement. It explains verification well but not how to find the
current owner and decision record for a change.

## Suggested execution order

1. Land the documentation corrections and current-work pointer.
2. Freeze root growth: new work enters through a domain controller or command producer rather than a
   new unrelated block in Canvas, usePaletteActions, commands or main/index.
3. Extract palette actions and rows first.
4. Extract panel model submodules and per-kind inspector builders, retaining facades.
5. Extract layout codecs, then main-service and IPC registrars.
6. Split CSS leaf sections and test helpers alongside the product work they support.
7. Reassess PTY and agent managers only after the earlier roots are smaller.

## Explicit non-recommendations

- Do not introduce Redux, Zustand, a generic event bus or a service locator.
- Do not replace the typed panel union or IPC allowlist with dynamic registries.
- Do not split every large file by line count; transaction and lifecycle owners should stay cohesive.
- Do not delete historical plans, specs or logs as cleanup; remove duplicated current guidance only.
- Do not perform one large refactor. Each extraction should be behavior-preserving, independently
  verified, and recorded with its load-bearing constraints.
