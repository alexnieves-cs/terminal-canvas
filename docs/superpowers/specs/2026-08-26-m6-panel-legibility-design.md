# M6: Panel Legibility — Design

**Status:** approved, not yet implemented
**Predecessor:** `2026-08-26-m5c-packaging-design.md`

## Goal

Make a wall of panels tell you what it is doing.

The product claim this app has made since M3 is *more agents than you can
watch*. Everything through M5c serves the first half of that sentence — the
canvas holds more panels than a browser can afford live WebGL contexts for,
they survive a reload, they survive a relaunch, and they are one `Cmd+K` away.
Nothing yet serves the second half. Today twelve panels are twelve identical
rectangles: you cannot tell which one is working, which one finished ten
minutes ago, which one is blocked on a question it asked while off screen, or
even which one is which — the header prints `spec.command ?? 'login shell'`,
and the comment beside it admits that is a stand-in.

M6 closes that gap in four steps: give a panel an **identity** you chose and a
**label main can vouch for**, give the app a **place to put a toggle**, derive
an **agent state** from signals that already cross the wire, and **route that
state to a user who is not looking at the panel.**

The backlog states the constraint that makes the last step non-optional: *"a
status colour nobody sees is not a status system."* On an infinite canvas the
common case is that the panel is off screen. Shipping the glow without the
routing would ship the half you cannot see.

## Scope

In:

- **M6a — Identity.** `Panel.title`, set and renamed from the palette,
  persisted. And *honest chrome*: `pty:create`'s result widened to carry the
  command, cwd and backend main actually resolved, plus whether the session was
  reattached or freshly spawned.
- **M6b — Settings.** A declarative setting schema, persisted behind
  `LayoutStore`, surfaced as rows in the existing `Cmd+K` palette. The three
  `RestoreSettings` booleans migrate into it and the hand-built "Restore on
  launch" submenu is rebuilt from it.
- **M6c — Agent state.** A main-side detector over two signals — the terminal
  bell and PTY idleness — feeding a state machine whose output reaches the
  renderer on its own channel and renders as a border on the live panel *and*
  on the card.
- **M6d — Attention routing.** Viewport-edge indicators for off-screen panels
  that want you, a `Cmd`-gated key that flies the camera to the next one, an OS
  notification when the app is unfocused, a dock badge, and a sound.

Out, and deliberately so:

- **A preferences window.** M6b builds the schema and the store; the surface is
  the palette, which already has fuzzy search, ranked rows and disabled
  *reasons*. Backlog #11 asks for "one organised settings surface, with a search
  bar" — the search bar exists. A pane can be built later against the same
  schema without moving any state.
- **Transcript watching.** `~/.claude/projects/<slug>/*.jsonl` would give richer
  state than either signal here, and it is the machinery backlog #7 (subagents)
  and #19 (token cost) both need. It is also Claude-Code-specific, requires
  panel-to-session-file correlation, and moves agent output to a new reader —
  a backlog #31 disclosure surface owing its own answer. Not in M6.
- **Live cwd polling (#41).** M6a surfaces the cwd main *resolved at spawn*,
  which is honest but not live. Polling `#{pane_current_path}` is a separate,
  tmux-only feature with its own dead-pane filtering requirement.
- **Restart-in-place (#29).** An exited panel will now say so more clearly. It
  still cannot be restarted, and adding the third `pty.kill` caller is a
  deliberate act that deserves its own milestone.
- **Semantic zoom (#22).** The glow renders on the card as it exists today. What
  a card *becomes* at far zoom is a separate rendering question.

## The central insight

**Every byte from every PTY in this app already passes through one function in
main.**

`pty-manager.ts:97` is `proc.onData((data) => this.enqueue(session, data))`.
Both of M6c's signals are derivable there and nowhere cheaper: a bell is a byte
in that stream, and idleness is the absence of calls to that function. Putting
the detector at that choke point is not merely convenient — it makes three
separate constraints correct *by construction* rather than by a guard someone
can later delete:

- **Dormancy.** Backlog #17 warns that "a restored canvas will draw twelve
  arrows for twelve processes that do not exist." A dormant panel has no entry
  in `PtyManager`'s map at all, so it cannot produce a state. The bug is
  unreachable, not defended against.
- **`registry.version()`.** Four separate backlog entries (#5, #17, #18, #41)
  independently arrived at the rule *this must not ride `version()`* — that
  counter deliberately ignores 16ms-batched PTY data so a chatty agent does not
  re-render the canvas at 60Hz. State that arrives on its own IPC event and
  lands in its own store has no counter to bump by accident.
- **The verify tier.** A detector that imports neither `electron` nor
  `node-pty` runs under plain node, like `tmux-args.ts` and `presets.ts` do. The
  state machine and the byte scanner — the two pieces most able to be subtly
  wrong — land in the cheapest, fastest suite the repo has.

The cost of that choice is one piece of real work, described in full below: the
bell cannot be found with `indexOf(0x07)`.

## What the signals actually are

Measured against the installed CLIs on 2026-08-26, rather than assumed:

| Signal | Available | Evidence |
|---|---|---|
| Terminal bell | yes | Claude Code 2.1.246 ships a `terminal_bell` notification channel (`preferredNotifChannel`); its bundle contains 56 escaped-`x07` and 10 escaped-`u0007` sites. |
| OSC 9 / 777 / 133 | **no** | Zero occurrences in the bundle. Nothing to listen to. |
| OSC 0 (set title) | marginal | 5 sites. Too thin to derive state from — but see the trap below, because it is what makes the bell hard to find. |
| PTY idleness | free | `pty-manager.ts` already batches every read at 16ms. |

Two honest preconditions follow, and both belong in the spec rather than in a
bug report later:

1. **The bell only rings if the user's CLI is configured to ring it.**
   `preferredNotifChannel` defaults to `auto`, which selects a channel from the
   terminal it detects. M6 owes a discoverable statement of this; the settings
   row that turns bell detection on is the cheapest place to say it.
2. **Idleness cannot distinguish "finished" from "asked a question".** Only the
   bell carries intent. That is precisely why M6d's notification is gated on
   the bell-derived state and not on idleness.

## Architecture

### M6a — Identity

**Panel names.** `Panel` gains `title?: string`.

The persisted half is already half-built, and the asymmetry is worth naming
because it currently reads like a working feature: `layout-schema.ts` **parses**
`title` (line 239) and `PersistedPanel` reserves it with a comment naming
backlog #6 — but `layout-adapt.ts`'s `fromPanels` **does not write it**. A title
set today would round-trip to nothing. M6a completes the write half.

`fromPanels` must add the field conditionally, field by field, the way it
already treats `command`:

```ts
...(panel.title === undefined ? {} : { title: panel.title })
```

Spreading a panel would put `title: undefined` into `layout.json`. This is the
same rule the absent-`command` note states at length, applied to a second
optional field — and it is a rule this file already obeys once, which makes the
second case easy to get wrong by not noticing there was a first.

Renaming reuses the palette's existing input mode — the one M5b built for
`preset:rename`, covered by `verify:panels` 38 and 38b — aimed at `capturedId`.
This works only because of palette rule 2: DOM focus moves to the input, but
`focusedId` is **captured, never cleared**, so the row knows which panel it is
about.

**Honest chrome.** `pty:create`'s *result* widens from `{ pid }` to:

```ts
interface PtyCreateResult {
  pid: number
  /** What main actually spawned. Never absent — this is the resolved answer. */
  command: string
  /** Expanded. `~` is main's to resolve. */
  cwd: string
  backend: 'tmux' | 'direct'
  /** True when this attached to a session that was already running. */
  reattached: boolean
}
```

`PanelStatus`'s `running` variant grows the same fields, landing at
`session-registry.ts:137`. The header renders
`title ?? status.command ?? spec.command ?? 'login shell'`.

**The rule this must not break.** The resolved command is a `PanelStatus` fact
and is **never written back into `PanelSpec`**. M5a's absent-`command` rule
survives four layers precisely because nothing ever fills the absence in; a
header that helpfully backfilled `spec.command` would make this a fifth place
absence can be lost, and every command-less preset — including the built-in
login shell — would start spawning a hardcoded shell instead of resolving the
user's actual one. The failure is total and silent.

`reattached` is new information the app has never had a way to say. M4c made
reattachment possible; since then a panel that recovered a surviving tmux
session has looked identical to one that just started.

### M6b — Settings

`src/shared/settings-schema.ts`, pure and plain-node:

```ts
export interface SettingDef {
  id: string                       // 'agent.glow'
  label: string
  description: string
  keywords: string[]               // synonyms: 'dark' finds 'theme'
  type: 'boolean' | 'enum' | 'number'
  default: SettingValue
  category: string
}
```

`parseSettings` follows the two rules `parseLayout` already established and
`parsePresets` already extended:

- **Never throw, drop entries individually.** One malformed setting costs that
  setting, not the file.
- **ABSENT is not MALFORMED.** No settings key at all is every pre-M6 file and
  warns nothing. A present-but-wrong-typed value warns rather than being
  silently coerced to the default — a silently-coerced toggle is a preference
  the user set, that stopped applying, with nothing anywhere saying why.

**Storage** is `layout.json` behind `LayoutStore`. This is not a new decision;
the existing note says a future settings surface "should reach for the same
mechanism — one file, behind `LayoutStore` — rather than inventing a second
store for a fourth toggle." M6 is that fourth toggle, five times over.

**Migration.** The three `RestoreSettings` booleans become schema entries
`restore.layout`, `restore.camera`, `restore.focus`. The legacy `settings` key
is still read and folded in, so an existing user's file keeps restoring exactly
as it did. `main/menu.ts`'s hand-built "Restore on launch" submenu is
**rebuilt from the schema**, so there is one source of truth rather than two
that can drift.

This migration is also the answer to the one real risk in scheduling M6b before
M6c: backlog #11 says build the schema when three or four toggles exist, and
M6b would otherwise be an abstraction with no customers. Migrating
`RestoreSettings` in gives it three real ones on day one.

**IPC.** Two invokes, `settings:list` and `settings:set` — renderer to main, the
same direction and for the same reason as M5b's preset mutations: main owns the
store, because `app.on('before-quit')` cannot ask a renderer that `Cmd+R` may
already have destroyed.

**Palette surfacing.** `PaletteContext` grows a `settings: SettingRow[]` field
and `buildCommands` emits a toggle row per setting. `Command` grows one optional
field:

```ts
/** Extra text the fuzzy matcher should see but the row should not show. */
searchText?: string
```

`palette-model.ts`'s `haystack` is `title + subtitle` today, and #11's keyword
synonyms have nowhere else to live. Widening the haystack is a small change with
a direct check.

### M6c — Agent state

`src/main/agent-state.ts` — pure, no `electron`, no `node-pty`. Two pieces.

**1. `scanForBell(state, chunk) -> { state, bells }`** — an *incremental*
parser that carries state across chunks. Two reasons it cannot be a plain
substring search for the BEL byte:

- **An OSC string is terminated by BEL.** `ESC ] 0 ; <title> BEL` sets the
  window title, and Claude Code emits exactly that. A naive scan reports a bell
  on every title change, producing a glow that flashes constantly for a reason
  no user could diagnose and no log would explain. The parser must skip
  `ESC ] ... (BEL | ST)` bodies, and `ESC P ... ST` for DCS.
- **A sequence can be split across chunks.** Output is flushed every 16ms; an
  OSC body straddling two flushes must not be re-entered as ordinary text, or a
  title containing a BEL-terminated tail rings once the boundary lands wrong.
  Hence state carried between calls rather than a per-chunk function.

**2. `nextState(prev, event, now) -> AgentState`** — the state machine:

```text
starting --first bytes--> busy
busy --no bytes for idleAfterMs--> idle
(busy | idle) --bell--> wants-you
wants-you --user input to this panel, or focus--> busy | idle
any --pty exit--> exited
```

`wants-you` is **sticky**, and its clearing rule is load-bearing: without one, a
bell from an hour ago still glows and the indicator set never empties. It is
cleared by the user acting on that panel — focusing it or typing into it — not
by time.

**Who clears it is not symmetric, and the asymmetry needs a channel.** Typing is
a fact main already holds: `pty:write` names the panel, so main clears
`wants-you` there with nothing new. **Focus is a renderer fact** — main has no
idea which panel `focusedId` names — so acknowledging by looking requires the
renderer to say so. That is one invoke, `agent:acknowledge`, sent when a panel
with a pending `wants-you` is focused. The alternative, clearing focus-side in
the renderer's store, would make the renderer a second author of a state main
owns, and the two would disagree the first time a notification fired against a
panel the user had already read.

**`exited` is the state machine's terminal state, not a second source of truth
about exit codes.** `PanelStatus.exited` remains authoritative for *how* a
process ended — the exit code, and the `pane-died` hook's recovery of it. The
agent state's `exited` exists only so the detector stops emitting and the panel
leaves the indicator set. Nothing should read an exit code off it.

**Wiring.** `enqueue` calls the scanner. Idleness needs a **separate slow tick**
(one per manager, not per session): the existing flush timer only runs *when
there is pending data*, so it structurally cannot observe the absence of data.

**IPC.** A new `IPC_EVENTS.AGENT_STATE`, main to renderer, carrying
`{ panelId, state }`, throttled. It belongs in `IPC_EVENTS` and not `IPC`
because it is fire-and-forget from main, like `PTY_DATA`.

**Renderer.** `src/renderer/session/agent-state-store.ts` — module-level, outside
React, like the registry. Panels subscribe **per id** through
`useSyncExternalStore`, so a state change re-renders one panel rather than the
canvas. This is `useRegistry.ts`'s pattern at finer granularity, and it exists
so that `registry.version()` is never involved.

**Rendering.** A border colour on `.panel` and on `.panel__card`. The card is
not an afterthought — it is the tier you are looking at when you have enough
panels for this feature to matter.

**The idleness threshold is not chosen here.** It is the one number in M6 that
can only be learned by measurement: too low and every pause between tokens reads
as "finished"; too high and the signal lands after you have already looked. The
implementation plan opens M6c with a measurement task against a real `claude`
session, and the result becomes an M6b setting rather than a compile-time
constant.

### M6d — Attention routing

**`viewport.ts` gains one pure verb:**

```ts
edgeIndicator(rect: Rect, viewport: Viewport, size: Size): { x: number; y: number; angle: number } | null
```

`null` for a rect already on screen; otherwise a point on the viewport edge and
a direction. Direction-to-an-off-screen-rect is exactly the arithmetic that file
exists to hold — pure, plain-node, and testable at `scale !== 1`, which is where
a component-side implementation would quietly be wrong.

**The pips are chrome**, a sibling of `.canvas`, outside the `.world` transform —
the same placement rule backlog #3's sidebar and #11's pane both record. Their
*positions* are world-space facts; their rendering is not.

**The jump key** is `Cmd`-gated, cycles the `wants-you` queue, and routes through
`goToPanel` — the verb M5b factored out of `onSelectPanel` specifically so that
navigating **cannot wake** a panel. A `wants-you` panel has a live PTY and so is
not dormant, but reusing the safe verb costs nothing and means a future change
to what `wants-you` includes cannot turn a keyboard tour into twelve spawns.

**The notification and the dock badge are emitted from main**, which already
holds the state because it produced it. No renderer round trip. The notification
fires only when the window is unfocused; the badge carries the count.

**Sound** plays renderer-side from a **bundled** asset — the renderer's CSP is
`default-src 'self'` and stays that way.

All five surfaces sit behind M6b settings.

**The indicator set derives from running sessions only.** A restored canvas has
dormant panels with no processes; they cannot want anything.

## Failure modes

Each of these fails silently in the absence of the stated countermeasure, which
is the standard this codebase holds a design to.

| Failure | Symptom | Countermeasure |
|---|---|---|
| BEL found inside an OSC body | The glow flashes on every window-title change; looks like a flickering bug with no cause | OSC/DCS-aware incremental scanner; a check that a title-set sequence produces **zero** bells |
| Sequence split across a 16ms flush | A bell is missed, or a title change rings, intermittently and unreproducibly | Scanner state carried across chunks; a check that feeds a sequence one byte at a time |
| `title` dropped on save | Renaming appears to work and is gone after relaunch | `fromPanels` writes it; a round-trip check |
| `title: undefined` spread into `layout.json` | The key exists holding `undefined`; an `in` test reads true | Conditional field-by-field rebuild, as `command` already does |
| Resolved command written into `spec.command` | Every command-less preset silently spawns a hardcoded shell instead of the login shell | Resolved values live on `PanelStatus` only; the existing `verify:layout` 34 / `verify:panels` 31 pair still guards the parse and spawn ends |
| Agent state bumps `registry.version()` | The canvas re-renders on agent output; the memo stops doing its job and pan/zoom degrades with panel count | Separate store, separate channel, per-panel subscription |
| `wants-you` never cleared | Pips accumulate; the jump key cycles panels that wanted you an hour ago | Cleared by focus or input on that panel |
| Idleness measured on the flush timer | Idle is never detected, because the timer does not run when there is no data | A separate slow tick, per manager |
| Indicators drawn for dormant panels | A freshly relaunched canvas shows arrows for processes that do not exist | State derives from `PtyManager`'s map, which has no dormant entries |
| Malformed setting silently coerced | A preference the user set stops applying, with nothing saying why | `parseSettings` warns on malformed and is silent only on absent |

## Verification

| Tier | Suite | New coverage |
|---|---|---|
| plain node | `verify:agent-state` **(new)** | the OSC trap (a title-set rings zero bells); a real BEL; a BEL split across chunks; a BEL inside an OSC body split across chunks; DCS bodies; every state-machine transition; the sticky-clear rule |
| plain node | `verify:viewport` | `edgeIndicator` off-screen in each direction, on-screen returning `null`, correctness at `scale !== 1` |
| plain node | `verify:layout` | `parseSettings` absent-vs-malformed; the `RestoreSettings` migration; `title` surviving a save/load round trip; `title: undefined` never reaching the file |
| plain node | `verify:palette` | settings rows and their disabled reasons; `searchText` keyword matching |
| real Electron | `verify:ipc` | every new channel has a handler — it fails until they do |
| real Electron | `verify:panels` | rename end to end; the glow reaching a **card**, not only a live panel; the jump key framing without waking; honest chrome showing a resolved command for a command-less panel |

`verify:agent-state` joins `npm run verify`. It has no native dependency, no DOM
and no `electron` import, so it belongs in the same tier as `verify:tmux` — and
needs the `@shared` alias in its esbuild config from the start, for the reason
`verify-palette.cjs` already records.

## Files

New:

- `src/shared/settings-schema.ts` — the schema, its defaults, `parseSettings`
- `src/main/agent-state.ts` — the BEL scanner and the state machine, both pure
- `src/renderer/session/agent-state-store.ts` — module-level store, per-id subscription
- `src/renderer/canvas/EdgeIndicators.tsx` — chrome, outside `.world`
- `scripts/verify-agent-state.cjs` — the new plain-node suite

Changed:

- `src/shared/ipc-contract.ts` — `SETTINGS_LIST`, `SETTINGS_SET`, `AGENT_ACKNOWLEDGE`, `AGENT_STATE`; widened `pty:create` result
- `src/shared/layout-schema.ts` — the settings block; `parseSettings` wired into `parseLayout`
- `src/shared/types.ts` — `PtyCreateResult`
- `src/main/pty-manager.ts` — scanner at `enqueue`; the idleness tick; the widened create result
- `src/main/ipc.ts` — the two settings handlers and the acknowledge handler
- `src/main/menu.ts` — "Restore on launch" rebuilt from the schema
- `src/main/index.ts` — `Notification`, dock badge
- `src/main/layout-store.ts` — settings accessors
- `src/renderer/panels/panels.ts` — `Panel.title`
- `src/renderer/panels/layout-adapt.ts` — carry `title` both ways
- `src/renderer/session/panel-session.ts` — widened `PanelStatus.running`
- `src/renderer/session/session-registry.ts` — store the widened status
- `src/renderer/components/TerminalPanel.tsx` — the header chain; the glow on panel and card
- `src/renderer/canvas/viewport.ts` — `edgeIndicator`
- `src/renderer/canvas/Canvas.tsx` — the agent-state subscription; the jump key; the pips
- `src/renderer/palette/commands.ts` — settings rows; rename-panel row
- `src/renderer/palette/palette-model.ts` — `Command.searchText` in the haystack
- `README.md`, `CLAUDE.md` — the milestone table and the new load-bearing details

## Success criteria

1. A panel can be renamed from `Cmd+K`, and the name survives a relaunch.
2. A panel whose command was absent shows what main actually spawned, and
   `layout.json` still records no command for it.
3. A panel that reattached to a surviving tmux session says so.
4. `claude` working in a panel shows a busy border; the same panel shows idle
   after it stops; ringing the bell shows wants-you.
5. Setting a window title produces **no** state change of any kind.
6. The glow is visible on a card, not only on a live panel.
7. An off-screen panel that wants you produces an edge indicator, and the
   `Cmd`-gated key flies the camera to it without waking anything.
8. With the app unfocused, a wants-you transition produces an OS notification, a
   dock badge count, and a sound — each independently switchable.
9. Every one of those switches is found by typing a *synonym* into `Cmd+K`.
10. `npm run verify` is green, including the new suite.
11. Panning a canvas of twelve panels with agents producing output is no slower
    than it was at M5c — the agent-state channel has not reintroduced the 60Hz
    cascade the memo exists to block.
