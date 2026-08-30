# M15: Token and dollar accounting per panel — Design

**Status:** designed, not yet implemented.
**Number:** M15, not M14. M14 is claimed by an in-flight branch
(`worktree-m14-workspace-extras`, backlog #2). The number records claim order,
not a build order.
**Predecessor by DEPENDENCY:** M12 (live cwd). Not because this milestone reads
a live cwd — it deliberately does not, see "Why the transcript path is globbed"
— but because M12 established the exact shape this milestone reuses three
times: a slow second tick in `PtyManager`, a dedupe on change, and a
module-level renderer store subscribed per panel id. Where this spec says "the
M12 shape", that is the reference.
**Backlog entry:** #19, and only the part of it this milestone commits to. #19
also asks for history and retention; that is explicitly out (see "Out,
deliberately"), and the entry should be **rewritten down to the open half**
when this lands rather than deleted, the rule the backlog's own preamble
states.
**Adjacent entries this touches without shipping:** #7 (subagent
visualisation) shares this milestone's data source and is named in #19 as the
argument for building the watcher once; #46 (a run ledger) owns the retention
question this spec declines; #8 (per-model configuration) owns the per-vendor
flag detail this spec introduces one instance of.

## Goal

Make "what is this canvas costing me" a question the app can answer, per panel,
while the agents are still running.

The product encourages the one thing that scales cost linearly — more agents at
once — and says nothing at all about it. "Twelve agents running" is a very
different sentence depending on whether it is two dollars or two hundred, and
today the app cannot tell the user which.

## The data source, measured rather than assumed

Claude Code writes a JSONL transcript per session under
`~/.claude/projects/<slug>/<sessionId>.jsonl`. Every `assistant` record carries,
at the top level, `cwd`, `sessionId`, `timestamp`, `isSidechain`, and a
`message` holding `model` and a `usage` object. A record read off this machine
on 2026-08-30:

```
model  claude-opus-5
usage  input_tokens: 2, cache_creation_input_tokens: 1491,
       cache_read_input_tokens: 120118, output_tokens: 1095,
       output_tokens_details: { thinking_tokens: 0 }
```

Three facts in that one record decide most of this design.

**The four token classes are not two.** `input_tokens` is 2. The real input is
121,609 tokens, of which 120,118 were cache reads. Cache reads are priced at
roughly a tenth of fresh input, and cache writes above it. An accounting model
that adds `input_tokens + output_tokens` — the obvious one, and the one every
naive implementation reaches for — is wrong by more than an order of magnitude
on exactly the long-lived sessions this app exists to run. The model carries
four numbers or it is not worth shipping.

**The file is append-only and grows without bound.** 262 lines for one ordinary
session. Re-reading it per tick is quadratic in session length, on the main
thread, for a number that changes once per agent turn. The reader tails.

**`isSidechain` marks subagent turns.** They are in the same file and they spend
real money, so they count — but a panel whose number is large because it
dispatched twelve subagents is a different situation from one that is large
because the user talked to it for an hour, and the pane should be able to say
which.

## Scope

In:

- **A pinned session id per panel.** A preset declares itself a Claude Code
  preset; main mints a UUID for a panel spawned from one, passes
  `--session-id <uuid>`, and **persists it** in `layout.json`.
- **A main-side usage poller.** A slow tick that tails each pinned transcript
  from a stored byte offset, accumulates per-panel totals, and emits on change.
- **A pure parser and a pure pricing table**, both plain-node testable.
- **A renderer store**, `usage-store.ts`, subscribed per panel id.
- **An inspector Cost section** for the selected panel: tokens as the primary
  figure, dollars labelled as list-price equivalent.

Out, deliberately:

- **History and retention.** #19 asks "is this a live readout, a history, or
  both" and this milestone answers *live readout*. "What did this canvas cost me
  last week" is a storage-and-retention feature with a real design question of
  its own, and #46 (a run ledger) already owns it. Shipping a half-considered
  ledger here would be the third store #19's own constraint warns against.
- **A second CLI adapter.** The accounting model is vendor-neutral by shape —
  `TokenTotals` names no vendor — but no `codex` adapter is written. #19's own
  constraint: *do not build the abstraction until a second CLI actually wants
  it.* One adapter, and a type that will not have to change to admit a second.
- **Rail and card readouts.** The inspector alone. A number on every card is a
  render path on the 60Hz side of this app, competing with the agent-state glow
  for the same chrome, and it can be added later against a store that already
  exists.
- **Budgets, alerts, or any rate limiting.** Reporting only. Nothing in this
  milestone stops or throttles a panel.
- **Retroactive attribution.** A panel spawned before this milestone, or from a
  preset that does not declare an agent, or a `claude` the user typed into a
  login shell by hand, has no pinned session and reports **nothing**. See "Zero
  and unmeasured are different facts".

## The four decisions

### 1. Pinned at spawn, declared on the preset

`Preset` gains an optional `agent?: 'claude-code'`. Only a preset that declares
it gets a session id and a flag. The built-in Claude preset declares it; a login
shell does not.

The alternative was sniffing — appending the flag whenever the resolved
`argv[0]` basename is `claude`. It needs no configuration and works for a
hand-written preset, and it was rejected because it **silently rewrites a
command the user typed**. This codebase already refuses that class of move:
`resolveCommand` fills in an *absent* command and never edits a present one, and
the whole of "An absent `command` must stay absent through four layers" exists
because a command travelling through this app must arrive as the user wrote it.
A declared field is also where #8 will want it when per-model configuration
lands.

**The cost is real and must be paid in four places, in two directions.**
Forward, a spawn carries it `Preset` → `PresetTemplate` → `PanelSpec`. Backward,
saving a panel as a preset carries it `CapturedPanel` → `Preset`, or a preset
saved from a Claude panel comes back not being one. Every one of those hops
rebuilds its object **field by field rather than spreading** — that
is not a style preference, it is the mechanism that keeps an absent `command`
absent across an IPC structured clone. So adding a field means editing four
rebuild sites, and a missed one drops the field silently: the panel spawns, the
agent runs, and it simply never gets a session id, which reads as "the cost
feature does not work for this preset" and points nowhere near the omission.
The plan must name all four sites explicitly.

### 2. The session id is persisted, never re-minted

This is the decision most likely to be undone by someone simplifying, so it is
stated with its failure attached.

`PtyManager.create` runs again for **every** panel on a `Cmd+R` reload. Under
tmux, `new-session -A` reattaches rather than creating — the command is not
re-run, and the agent keeps its original session id. A freshly minted uuid on
that second `create` would therefore name a transcript that does not exist,
while the real one went on growing, and the panel's cost would freeze at
whatever it was before the reload with nothing in any log. This is
`reattached`'s whole story ("`reattached` costs a probe because `-A` erased the
question") arriving through a new door.

So `layout.json` gains a `sessions: Record<PanelId, string>` map, a **sibling of
`workspaces`** keyed by panel id globally — the shape `baselines` already has,
for the identical reason (`PanelId` is global, not per-workspace). `create`
reads it and mints only when it is absent.

Deriving the id deterministically from the panel id was considered instead, and
rejected: panel ids **are** recycled (`onReset` installs `firstRunPanels()`,
whose id is the constant `FIRST_RUN_ID`), so a derived id would hand a fresh
panel the session id of a dead one — and `--session-id` naming an existing
session is a *resume*, so that panel would come back holding a stranger's
conversation. Persist-and-drop has no such case.

`PtyManager.kill` drops the entry, beside the `dropBaseline` call already there,
for exactly the reason that call exists: the map must not grow for the life of
the install, and a recycled id must not inherit a dead panel's session.

### 3. The transcript path is globbed once, then cached

`resolveTranscript(sessionId)` globs `~/.claude/projects/*/<sessionId>.jsonl`
and caches the hit. It does **not** reconstruct the path from the panel's cwd.

The filename is the session id, and a session id is unique — so the glob needs
no knowledge of Claude Code's directory-slug rule, which is undocumented (it is
some substitution of `/` and spaces for `-`; a directory containing a dot or a
non-ASCII character is unverified), belongs to another program, and can change
in a release with nothing here to notice. It is also immune to a panel that
`cd`s: the transcript stays where it was created, so a cwd-derived path would go
stale exactly as #41 describes, in a milestone that is not about cwd at all.

The cost is one directory scan per session, once. A session whose file has not
appeared yet (the agent has started and not yet answered) simply resolves to
nothing this tick and is retried; that is the ordinary state for the first few
seconds of every panel, not an error.

### 4. Tokens are the figure; dollars are labelled

Token counts are the primary reading. A dollar figure is shown beside them and
is **explicitly labelled as API list price**, because Claude Code on a Max or
Pro subscription bills nothing per token — the money a subscription user is
shown is a notional equivalent, not a charge, and presenting it as a charge
would be the pane confidently stating a number that is wrong for a large share
of the people reading it.

This is "The inspector shows the links, not the answer" applied to a second
pair: the pane's job is to let the user see what the figure is made of, not to
collapse it into one authoritative-looking number.

`pricing.ts` carries a rate per model for each of the four token classes, with
an **"as of" date in a comment beside the table** — a price table with no date
is a table nobody can tell is stale. An unknown model id yields tokens with **no
dollar figure at all**, never a zero: a new model shipping while this table is
old must read as "not priced here", not as "free".

## Architecture

```
main                                            renderer
────                                            ────────
LayoutStore.sessions{}  ──┐
                          ├─> PtyManager.create ──> --session-id <uuid>
Preset.agent ─────────────┘

usage-watcher (tick)
  resolveTranscript(id) ──glob once──> path
  readChunk(path, offset) ──────────> bytes
  parseUsageChunk(bytes, remainder) ─> deltas + remainder   [pure]
  accumulate ──> PanelUsage
  dedupe on change ──> IPC usage:panel ──────────────────>  usage-store.ts
                                                              (per-panel
pricing.ts  costOf(totals, model) [pure]                       subscription)
                                                                   │
                                                            inspector-fields.ts
                                                              buildUsageFields
                                                                   │
                                                              Inspector Cost
```

### Modules

**`shared/cost.ts`** — the vendor-neutral model.

```ts
export interface TokenTotals {
  input: number        // fresh, uncached input
  output: number
  cacheWrite: number   // cache_creation_input_tokens
  cacheRead: number    // cache_read_input_tokens
}

export interface PanelUsage {
  totals: TokenTotals
  byModel: Record<string, TokenTotals>
  turns: number
  subagentTurns: number   // of `turns`, how many were isSidechain
}
```

No vendor word appears in the type. `byModel` is what makes a mixed-model
session pricable at all, and it is why the accumulator cannot keep one flat
total.

**`main/usage-parse.ts`** — pure. `parseUsageChunk(text, carry)` returns
`{ entries, carry }`. Plain-node tier: it imports nothing.

**`main/pricing.ts`** — pure. Rates per model per class, `costOf(totals, model)`
returning `number | undefined`. Imports nothing, like `git-args.ts`.

**`main/usage-watcher.ts`** — the tick, the offsets, the carry buffer, the
dedupe. Takes its filesystem reach as **injected deps** (`resolveTranscript`,
`readChunk`), the trade `review-engine.ts` makes with `GitRunner` and
`layout-store.ts` makes with its paths — so the accumulator is exercised in the
plain-node tier and only the thin real-fs implementation is not.

**`renderer/session/usage-store.ts`** — module-level, subscribed per panel id,
over a cached snapshot array, and it **must never bump `registry.version()`**.
This is now the fourth entry in that rule's list (agent state, live session,
links, usage), and the reason is sharpest here: a fact that changes on every
agent turn riding the memo counter re-renders every panel on every other
panel's turn.

**`shell/inspector-fields.ts`** — `buildUsageFields`, hidden when there is no
answer, beside the existing review fields.

## Load-bearing details

Each of these fails silently. Each belongs in `CLAUDE.md` when this lands.

**The carry buffer is the parser's whole correctness.** A tick can land while
Claude Code is mid-write, so the last line of a chunk routinely arrives without
its terminating newline. Parsing it yields a JSON error; *dropping* it loses
that turn's tokens **permanently** — the offset has already advanced past those
bytes and nothing will ever read them again. So the parser returns the
unconsumed tail and the watcher stores it, prepending on the next read. The
failure of getting this wrong is a number that is quietly and unrecoverably low,
by an amount proportional to how busy the agent is, which is the worst possible
direction for this feature.

**The offset is per panel and only ever advances.** A file that has *shrunk*
since the last read is not a file we can tail — it has been truncated or
replaced — so the offset resets to zero and the totals are recomputed from the
whole file. Blindly reading from a stale offset past the new end yields garbage
or nothing at all, with no error.

**Zero and unmeasured are different facts.** A panel with no pinned session
renders **no Cost section at all**, never `$0.00`. `$0.00` beside a visibly
working agent is a confident wrong answer and trains the user to disbelieve the
section — the same standard M9a's `not-a-repo` arm sets, and the same reason
`never-started` and `not-a-repo` had to become two answers rather than one.
There are three distinguishable states and the pane must not collapse them: **no
pinned session** (nothing rendered), **pinned but no transcript yet** (a brief
"waiting" note, true for the first seconds of every panel), and **totals**.

**`inspectorSignature` must move on a usage change.** `Canvas` freezes the
inspector model on that signature, so a live value the signature does not cover
renders once and never updates again — stuck at whatever it was when the panel
was selected, with nothing throwing. This is M12's check 63 exactly, and it is
the single most likely regression in this milestone, because usage is the newest
field and the signature is the easiest thing to forget.

**The tick is a third timer, not a merge into either existing one.**
`IDLE_TICK_MS` is 500 and is the *resolution* of M6c's idleness threshold;
`LIVE_TICK_MS` is 2000. Merging usage into the idle tick would put a file read
on the 500ms path for a number that changes once a turn; merging it into the
live tick couples two unrelated cadences. It arms and tears down on the same
sites the other two do, and it is `unref()`d so it cannot hold a plain-node
process open.

**The dedupe key is joined with NUL.** The same collision `live-session-store`
avoids: a model id is not free of every separator, and a key that can collide
silently suppresses a panel's updates for some users and nobody else.

## Success criteria

1. A panel spawned from the built-in Claude preset reports real token totals in
   the inspector while its agent works, and the totals rise as it works.
2. Those totals **survive a `Cmd+R` reload** with the same pinned session — the
   criterion decision 2 exists for, and the one no unit tier can observe.
3. A panel with no pinned session renders no Cost section, rather than zeros.
4. Cache reads are counted and priced as their own class; a session whose input
   is overwhelmingly cache does not report a fresh-input cost.
5. Subagent turns are counted and reported separately from ordinary turns.
6. A dollar figure never appears unlabelled, and never appears at all for a
   model the price table does not know.
7. Selecting between two panels never shows one panel's number under the
   other's heading, and never freezes on a stale one.

## Verification

A new plain-node suite, **`verify:usage`**, added to the `npm run verify` chain
and to the tables in `README.md` and `CLAUDE.md`:

- The parser: a well-formed chunk; a chunk ending **mid-record** returning a
  carry and no entry; that carry **completing** on the next chunk and yielding
  the entry exactly once (the pair is the check — either half alone passes
  against an implementation that drops or double-counts); a non-`assistant`
  record contributing nothing; a malformed line skipped without taking the rest
  of the chunk with it.
- The pricing: four classes priced separately, asserted with a fixture where
  cache read dominates so an `input+output` implementation is **numerically
  distinguishable**; an unknown model yielding `undefined` rather than `0`.
- The accumulator: totals per model; `subagentTurns` counted from `isSidechain`
  and included in `turns`; the offset reset when a file shrinks; the dedupe
  emitting **once** for an unchanged read (a window spanning several ticks, for
  M12 check 23's reason — a single-tick sample cannot tell a deduped
  implementation from an undeduped one).

Additions to existing suites:

- **`verify:layout`** — the `sessions` map: absent warns nothing (every file
  written before this milestone), present-but-malformed **warns** rather than
  vanishing, a malformed entry drops alone, round-trip through a real write and
  reopen, and `dropSession` closing the recycled-id hazard.
- **`verify:rail`** — the usage fields for each of the three states, and
  `inspectorSignature` **moving** on a usage change while staying byte-identical
  on a rect change.
- **`verify:ipc`** — the channel count. Note before writing it: `usage:panel` is
  a main→renderer **send**, so it is an `IPC_EVENTS` member handled by nobody
  and **the invoke count does not move**. This has been got wrong twice already
  (M6d and M12 both record it); the number changes only if an invoke is added.
- **`verify:pty-manager`** — the pinned id persisted on first create and
  **reused** on a second create at the same panel id, which is success criterion
  2's mechanism; and dropped on `kill`.
- **`verify:panels`** — end to end in a real renderer against a **synthesised
  transcript** written by the harness, fenced to its own temp directory the way
  the git and prompt fences already are: the number on screen for the selected
  panel, and no Cost section for a panel with no pinned session. Written as one
  positive read pairing "which panel is selected" with "what the section says",
  for check 100b's reason.

**What none of it can see**, stated plainly so a green run is not read as more
than it is: no check spawns a real `claude`, so the claim that
`--session-id <uuid>` causes Claude Code to write `<uuid>.jsonl` is verified by
observation on one machine on one version, not by anything repeatable. If that
flag's behaviour changes, every suite here stays green and the feature reports
nothing for every panel. That link needs a hand on a real agent once, and it
must not be written down as checked until somebody has done it.

## What this does not solve

- **A panel that is not a pinned Claude Code panel is invisible to it.** A
  `claude` typed by hand into a login shell spends real money and reports
  nothing. That is the accepted cost of refusing to rewrite a user's command;
  the cwd-matching fallback that would cover it is a guess whenever two panels
  share a directory, and this app's standing answer to that ambiguity is to say
  so rather than attribute confidently.
- **No history.** Close the panel and the number is gone.
- **Nothing is per-workspace or canvas-wide.** The store makes both cheap to add
  later; neither is in this milestone.
