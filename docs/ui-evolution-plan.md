# UI evolution plan (M279)

An audit of the renderer as it stands at `1d925fbe`, and the ordered plan for evolving it
toward the brief's direction: deep navy/charcoal surfaces, cyan and electric-blue
illumination, restrained violet and green accents, layered depth, thin borders, controlled
glow, high density without clutter. Updated as decisions change; the milestone's ledger is
[build-log/m279-ui-evolution.md](build-log/m279-ui-evolution.md).

**The reference image was not available.** `docs/design-reference.png` does not exist and
the attachment arrived as a placeholder file icon, so the direction was taken from the
brief's written language and from the app's own Obsidian brief
(`superpowers/specs/2026-09-05-design-brief-obsidian.md`), which it extends rather than
replaces.

## 1. What exists (audit)

### Shell

The app already has the brief's information architecture. `App.tsx` is a pass-through; the
`.shell` grid is returned by `Canvas.tsx` (`dock | navigator | canvas | context` under a
56px top bar, `styles.css` `.shell`). Concretely:

| Region | Component | Today |
|---|---|---|
| Top bar | `shell/TopBar.tsx` | product mark, Canvas/Orchestrate toggle, `+ Create`, workspace/task breadcrumb, Search (⌘K), View menu (theme, panes, merged view) |
| Left dock | `shell/Dock.tsx` | grouped icon column (Work / Content / Connections / System); labelled rail at the `wide` breakpoint; attention bell with count badge + popover; settings |
| Navigator | `shell/Navigator.tsx` | ONE pane at a time: panels, workspaces, files, vault, integrations, teammates, board, skills; fixed 300px |
| Center | `.canvas` or `.shell__orch` | the canvas, or the orchestration page (`shell.centerView`) |
| Inspector | `shell/Inspector.tsx` | tabs Detail / Work / Tools; resizable 220–480px (`shell.inspectorWidth`) |
| Bottom | none | zoom HUD pill, command pill and toasts float over the canvas |

Breakpoints (`compact < 1100 ≤ standard < 1600 ≤ wide`) are measured on `.shell`, never
the window; at compact both panes are transient drawers. All chrome state is persisted as
settings, not layout (`shell.*`, `files.treeOpen`, `appearance.theme`).

**Reuse:** all of it. Nothing here is replaced; the shell's contract is pinned by
`verify:styles shell.recommendations.1`, `dock.1`, `rail-w.1`, `compact.1` and by roughly
two hundred Electron-suite selectors.

### Tokens and theme

`styles.css` opens with three blocks: structure on bare `:root` (space, radii, type,
motion, the rim recipe), then colour in two blocks that must declare the same token set
(`theme.1`). Bare `:root` carries the light values; `:root[data-theme="dark"]` wins by
specificity. `useTheme.ts` stamps `data-theme` from `appearance.theme` (`system` follows
`prefers-color-scheme` live) and layers high-contrast overrides inline.

The dark theme is already an "Obsidian" material: blue-black ramp (`--s-0 #070910` →
`--s-5 #2c3344`), a cyan identity accent (`--iris #67e8f9`), Tokyo-Night agent hues, glass
fills over a blur with a four-level depth ramp (`--glass-0..3`), one resting shadow
(`--lift`), a lit top edge (`--edge-light`) and a responsive ground light (`.canvas__aura`,
answering `working` / `needs-you`).

**Constraints any restyle must satisfy** (all in `scripts/verify-styles.cjs`, text checks
over the stylesheet): no colour literal outside a theme block (1); every text token ≥4.5:1
on every ground and every accent ≥3:1 on `--s-1`/`--s-4`, per theme (11); no fractional
opacity (3); durations only as tokens (`motion.2`); no `@font-face` (`font.1`); the tone
block is the only place an agent hue is bound (`tone.1`); one resting shadow (`shadow.1`);
glass ramp monotonic (`depth.1`); a surface wears the rim OR the inset, never both
(`rim.1`).

**Reuse and extend:** the token system stays. The evolution is a re-valuation of the dark
block (recorded per token in the ledger, as product-rules requires) plus new NAMES declared
in both blocks.

### Primitives

`renderer/primitives/` holds headless Radix wrappers only (Menu, Popover, Dialog, Tooltip,
MotionSurface) — behaviour and a11y, never a look. The look lives in CSS classes:
`.icon-button`, `.is-primary`, `.badge`, `.status-dot[data-tone]`, `.command-pill`, and a
hand-rolled `role="tablist"` in the inspector. There is no Button, Tabs, Pill, StatusDot or
Surface primitive as a component.

### Canvas

Layered so the math is testable: `viewport.ts` / `canvas-input.ts` / `lod.ts` (pure) →
`useViewport.ts` → `Canvas.tsx` (clipping host, ONE transformed `.world`, overlays outside
it). Pan/zoom writes one transform; no panel re-renders for a viewport change. Two ladders:
`lod.ts` is the WebGL/resource tier (`live | card`, budget 8); `card-detail.ts` is the
semantic zoom (`tail | summary | block | cluster`, with hysteresis). The ground is flat and
transparent (no dot grid, `ground.1`), lit by `.canvas__aura`.

The one frame is `components/PanelFrame.tsx` (`.pf`, with `.panel__*` aliases kept for
the checks). Fifteen kinds. Chromeless kinds (`terminal`, `note` text/frame) position
their chrome ABSOLUTELY over the body — never a collapsing box, which refits xterm and
sends SIGWINCH on every hover (M234).

Agent state on a node: a 3px left edge in the tone (`.panel.pf { border-left-color:
var(--tone) }`), a 1px pseudo-element outside that edge carrying a soft glow in
`--tone-dim` (`.pf::before`), the amber ring + two-breath pulse for `wants-you`, the
landing halo after an attention jump. Connections: `LinkLayer.tsx` (authored links, SVG,
one shared rAF), `AgentLinkLayer.tsx` (derived read/wrote/draft links), and
`shared/edge-activity.ts` — six edge states (`rest armed firing arrived waiting blocked`)
with a travelling packet. Execution indicators on connections exist.

### Agent state the backend exposes today

Two disjoint producers, two vocabularies, one renderer chokepoint:

| Fact | Source | Literal values |
|---|---|---|
| terminal agent state | `main/agent-state.ts` (BEL / OSC 133 scanner) over `agent:state` | `starting · busy · idle · wants-you · exited` |
| chat session status | `AgentSessionSnapshot.status` inside `agent:event` | `not-started · starting · ready · streaming · exited · disposed` |
| chat pending permissions | `snapshot.pending[]` (`toolName`, `input`) | count > 0 ⇒ `needs you` |
| chat approvals on `agent:state` | `main/approvals.ts` | only `wants-you` / `idle` |
| live tool call | a `tool_use` block in the chat's LIVE message (`chat-model.ts` rows with `live: true`) | derived per render, not a state |
| thinking | a `thinking` block in the live message | derived, not a state |
| exit | `status.kind === 'exited'` + `exitCode`; `result.ok` | — |
| usage / cost | `usage:panel`, `snapshot.usage`, `costUsd` | — |
| last line said | `session/last-line-store.ts` | — |
| where / what running | `session:live` (`cwd`, `currentCommand`, tmux only) | — |
| subagents | `subagent:state` (`running · done`) | — |
| pools | `pool:event` (`started queued finished refused stopped`) | — |
| edges | `shared/edge-activity.ts` | `rest armed firing arrived waiting blocked` |

The product vocabulary is `panels/panel-state.ts` (`Tone = kind asleep none starting
working needs-you idle exited`), and `verify:rail state.2` forbids a state word anywhere
else.

**Mapping the brief's eight states onto what exists:**

| Brief | Today | Gap |
|---|---|---|
| idle | `idle` (green) | none |
| active | `working` (blue) | none |
| thinking | — | **renderer-derivable** for chats (live `thinking` block, no live tool). Not knowable for a terminal agent. |
| executing | — | **renderer-derivable** for chats (live `tool_use` block → "Edit server.ts"). Not knowable for a terminal agent. |
| waiting | `needs-you` (amber) | none |
| blocked | edge state only | no per-agent blocked; a chat queued on the concurrency ceiling (`queuedReason: 'concurrency'`) is the nearest real fact |
| completed | `exited 0` — tone `exited` (red) | **backend has it; the vocabulary paints it red.** Kept as is this pass: retoning `exited 0` touches the closed tone set and five suites; recorded in the backlog. |
| failed | `exited N≠0`, `result.ok === false`, `turn-aborted` | none at the tone level |

What is missing in main and NOT invented here: a per-agent phase channel (thinking /
executing / tool name / file) — the renderer derives it from the transcript stream for
chats; a `blocked` agent state; a `completed` tone distinct from `exited`. Documented, left
for a backend milestone.

### Terminal, files, code

xterm 5.5 + fit + unicode11 + WebGL (`terminal/create-terminal.ts`), bound outside React's
lifecycle by `session/session-registry.ts`; PTY output is batched 16ms in main and written
straight into xterm. The dark xterm `background` must equal `--well` (`verify:panels
theme.1`). Files: `file/FileNode.tsx` draft surface is Monaco, lazily imported (one worker,
Monarch only) — **kept**; there is no plain highlighter and adding one is a second
tokenizer. The file tree (`shell/FileTree.tsx`) is a flat `rows.map` — not virtualized.
The only virtualized list is the sheet grid.

### Motion

CSS first: 34 keyframes, every duration a token, 22 reduced-motion blocks; `motion` (framer)
is confined to `MotionSurface` and the workflow island. Nothing animates forever except by
design (`pulse.1`, `edge.flow.css.1`).

### Dependencies

Installed and reused: react 19, xterm, monaco, @xyflow/react + zustand (workflow island),
three + R3F (orchestration island, lazy), motion, sonner, recharts, four Radix packages,
zod. **No new dependency is needed.** React Flow was evaluated against the canvas and
declined: the canvas's one-transform model, tiering and pointer correction are the product;
React Flow would be a second camera. Three/R3F stays where it is (the diorama); the canvas
gains depth through the token ramp, not through 3D. A virtualization library was declined
for one flat list; a windowed slice is twenty lines.

## 2. What the new design needs that does not exist

1. A dark palette that reads navy rather than black, with cyan illumination that carries
   meaning (working, selection, arrival) and a restrained violet for the workflow /
   orchestration family. New names: `--violet`, `--violet-dim`, `--tone-glow`,
   `--glow-iris`, `--glow-blue`.
2. A small set of styled primitives components can compose: segmented control, pill, tabs,
   status dot, activity row — as CSS classes with matching React components for the new
   surfaces.
3. Live system status in the top bar (agents working / needing you), from the summary
   the inspector already computes.
4. A per-object **Activity** feed in the inspector, from the ring buffer the orchestration
   page already fills — with its producer lifted to the canvas level so the feed exists
   before the orchestration page is ever opened.
5. A chat node that says WHAT it is doing while working (`working · Edit server.ts`), from
   the live message's blocks.
6. A resizable navigator (`shell.navWidth`), mirroring the inspector's handle.
7. A windowed file tree for large directories.

## 3. Ordered implementation plan

Each step: typecheck + build, `npm run affected`, commit. Electron suites at the gates.

1. **Tokens.** Re-value the dark block (navy ramp, cyan/blue illumination, violet accent);
   add `--violet` / `--violet-dim` to both blocks and to the contrast check's accent list;
   add the tone-glow ramp in the tone block; update `terminal/themes.ts` dark `background`
   to the new `--well`; add `--violet` to the chart token allowlist. Verify: `verify:styles`,
   `verify:chart-series`.
2. **Primitives.** `.seg`, `.pill`, `.tabs`/`.tab`, `.activity-row` CSS; React `Pill`,
   `StatusDot`, `SegmentedControl`, `Tabs` in `renderer/primitives/` (styled, unlike the
   headless Radix set — documented in the barrel).
3. **App shell.** Top bar: segmented Canvas/Orchestrate, a real search field, a live status
   cluster (`LiveStatus`), tighter density. Dock: active tile illumination. Inspector: tab
   strip on the primitive. Verify: `verify:styles`, `panels:shell`.
4. **Navigation.** Resizable navigator (`shell.navWidth`, 300–480, persisted), handle on the
   pane's right edge. Verify: `verify:layout shell.1`.
5. **Canvas + nodes.** Glow ramp per tone on the state edge; selection ring on
   `--glow-iris`; far-tier illumination; link strokes and packets on the new blues; the
   workflow block and orchestration on violet. Verify: `verify:styles`, `panels:core`.
6. **Agent state.** `chat-model.ts` `chatPhase()` → the chat's chrome pill reads
   `working · <tool> <file>` / `thinking`; the inspector detail shows the phase; the
   activity feed records tool phases. Verify: `verify:rail` (state.2), `panels:agents`.
7. **Inspector Activity.** `canvas/useActivityFeed.ts` (producer, always mounted),
   `shell/InspectorActivity.tsx`, fourth tab `activity` in `ContextTab`, the settings enum
   and `verify:layout shell.1`. Verify: `verify:layout`, `verify:orchestration`.
8. **Terminal.** xterm theme aligned with the new well/cursor/selection; chromeless scrim
   on the new material. Verify: `panels:core theme.1`.
9. **Files.** Windowed `FileTree` rows above a threshold. Verify: `verify:file`,
   `panels:kinds`.
10. **Motion.** Glow transitions on tone changes; activity row arrival; all on tokens and
    reduced-motion safe.
11. **Polish + goldens.** `npm run shot`, look at every changed scene, write the critic's
    sentences in the ledger, then `UPDATE_GOLDENS=1 npm run verify:visual`. Link the ledger
    from CLAUDE.md (`verify:meta ledger.1`).

## 4. Decisions log

- 2026-09-16 — no reference image; direction taken from the brief's words.
- 2026-09-16 — `exited 0` stays red this pass (closed tone set); backlog entry written.
- 2026-09-16 — no new dependency; React Flow / R3F not adopted for the canvas.
- 2026-09-16 — two status pills met a long breadcrumb at 1440px; the pill's word hides
  below 1600px (the count is the fact, the word is on the title).
- 2026-09-16 — the inspector's tab set grows to four; `verify:panels:agents ctx.1` and
  `verify:layout shell.1` were extended rather than worked around.
- 2026-09-16 — the `exited 0` tone is backlog #90.
