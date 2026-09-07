# Act III — the shelf and the shape that runs (M126–M133)

> Renumbered M126–M133 on 2026-09-07: Act II's ship took M125 (README's row) after this document was written.

Branch `m125-skills`, base `main@2d088e2` (Act I merged). Two tracks on one branch; checks
written first and COMMITTED BEFORE their implementation, Act II's rule. Track B is a
fresh-context subagent in a worktree off M126's schema commit.

**Numbering.** M117–M121 are Act II (engines), in flight on `m117-engines` as this is
written. M122 is free, M123 is cited by Act I §0 (signing), M124 is Act I's owed outward
hand check. This act therefore starts at M126 rather than at the next integer, and the gap
is deliberate: two acts running at once must not collide on a number, which is the same
reason `## Conventions` made check ids scoped strings.

## 0. Act 0's answers, which this spec cites

Five measurements, taken on this machine before a line of this spec was written.

1. **A skill invocation is a structured record, not screen text.** Across 4,644 transcripts
   under `~/.claude/projects`, **221 files** carry
   `{"type":"tool_use","name":"Skill","input":{"skill":"<name>","args"?:"<text>"}}`, in
   order, one line per record. The trail (§6) is therefore a READ. The alternative —
   scanning the PTY byte stream for `Skill(name)` as the CLI paints it — is a parser for a
   format this repo does not own and cannot version, which `parseFrontmatter`'s own comment
   refuses in the same words.
2. **The seam to reach it already exists and is already injected.**
   `PtyManager` takes `resolveTranscript(sessionId): string | undefined` with a
   `realResolveTranscript` default (`src/main/pty-manager.ts`), built for M74's
   `Open as chat` and injected precisely so a suite can substitute a fake without a real
   `~/.claude/projects`. The panel's session id is pinned at spawn and re-adopted on
   `--resume`. §6 adds no new path to the CLI's transcript; it reuses this one.
3. **The name in a trail record carries NO scope.** The CLI writes
   `"skill":"superpowers:using-git-worktrees"` — a plugin prefix when there is one, and a
   bare name otherwise. Nothing in the record says `user` or `project`. §2.1 and §6.3 are
   both consequences of this measurement, and neither may guess.
4. **`claude plugin list --json` answers the plugin question the backlog declined.**
   26 entries in **0.38s**, each `{id, version, scope, enabled, installPath, installedAt,
   lastUpdated}`; 13 enabled on this machine. `docs/ideas-backlog.md` #26 declined plugin
   skills because `~/.claude/plugins` is *663 MB containing 700 `SKILL.md` files*.
   `installPath` bounds the walk to the enabled plugins' own directories, and `enabled` is
   the CLI's answer rather than this app's inference from `enabledPlugins`.
5. **`claude plugin details <name>` carries the inventory and a token cost, and has no
   `--json`.** It prints `Skills (14)  brainstorming, …`, `Always-on: ~688 tok`, and a
   per-component `always-on / on-invoke` table — as a human-formatted table. §4 item 6 renders it
   VERBATIM and parses none of it, for measurement 1's reason.

## 1. What Act III is for

Two subsystems, one thesis: **the canvas already knows what an agent did; it should also
know what an agent can do.**

The first half is the shelf — the skills, agents and commands installed on this machine,
organised by use case, expandable, and (the part that only a canvas can do) *visible beside
the session that used them, in the order they were used*. The second half is the shape that
runs — M80's templates grown three block types, drawn as a diagram, and startable.

Both halves are mostly assembly. `toolbox-read.ts` already walks `skills/`, `commands/` and
`agents/` across three scopes with caps applied at the read boundary; `templates.ts` is
already nodes plus edges plus `{{parameters}}`; `handoffFires` is already the only thing
that decides whether an edge fires; `joinAdvance` already delivers payloads in panel order;
M82 already enforces a live concurrency ceiling with a queue that names its reason; M97 is
already an agent loop whose stop main enforces. The genuinely new engine in this act is the
POOL (§8.1), and it is the one thing to defer if the act runs long.

**Two milestones carry real risk and neither is the pool.** M129 is the first code in this
repository that writes into `~/.claude`, and its two failure modes (§5.2, §5.4) both end
with a user's own file quietly meaning something else while the panel says the save
succeeded. M130's trail reads a record shape nothing versions. Both are specced from the
failure rather than from the feature.

## 2. M126 — the skill identity, its resources, and the shelf

### 2.1 The key

```ts
/** A stringified coordinate, entryId()'s own shape. NEVER a bare name. */
export type SkillKey = string          // `${scope}:${name}`
export function skillKey(scope: ToolScope, name: string): SkillKey
```

M21 measured that two scopes can define one name and **refused to name a winner**, recording
the link in `alsoDefinedIn`. A shelf keyed by bare name would silently pick one of them, and
the user would see a skill sitting in a column while the agent used a different file of the
same name. The scope is therefore part of the identity everywhere the shelf, the pane and
the panel address a skill.

`sourcePath` is NOT the key. A skill whose file moved but kept its name and scope keeps its
shelf slot; a key made of an absolute path would drop it silently on any reorganisation.

### 2.2 Resources

`toolbox-read.ts` opens only `SKILL.md` today. It gains a count of the files beside it,
capped by `RESOURCES_MAX`, applied **at the read boundary** — the module's stated rule, so
every consumer inherits the bound instead of the one that remembered it.

Three states, never two:

| state | meaning | rendering |
|---|---|---|
| `{ kind: 'none' }` | the directory holds only `SKILL.md` | *no resources* |
| `{ kind: 'some', n }` | `n` files beside it, `n <= RESOURCES_MAX` | `n resources` |
| `{ kind: 'unknown', why }` | the directory could not be listed | *could not read this folder* |

A `0` printed where the truth is "unreadable" is the confident wrong answer `costOf`'s
`undefined` already refuses to give.

### 2.3 Plugin skills, through the CLI's own answer

`main/plugin-list.ts` runs `claude plugin list --json` through the injected process seam
(`agent-runner.ts`'s shape, so the whole module runs under plain node), and yields the
enabled plugins' `installPath`s. `toolbox-read.ts` then walks **those directories only**,
attributing each skill to its plugin id.

Constraints, each with a silent failure behind it:

- **Only `enabled` plugins are walked.** A disabled plugin's skills are not available to any
  agent, and listing them would answer "what can this agent do" with a lie.
- **The walk is bounded by `installPath`**, never by a recursive descent from
  `~/.claude/plugins` — measurement 4's 663 MB.
- **`SKILLS_MAX` is the total across every source**, not per source. Three scopes plus 13
  plugins must not multiply the cap.
- **A CLI that is absent, errors, or times out yields `unknown`, never an empty list.** The
  disk scan still returns its own scopes; the plugin section says it could not be read. This
  is the same three-state rule, applied to a subprocess.

### 2.4 The shelf record

```ts
export interface ShelfColumn { id: string; title: string; keys: SkillKey[] }
export interface Shelf { columns: ShelfColumn[] }
```

**Top level in the layout**, beside `presets`, `prompts` and `templates` — a shelf is a way
of working, not a canvas, which is M80's own argument for templates. Absent on disk when
empty (the store deletes the key, M93's rule for annotations). Carried by `carryShelf` at
every by-name copy site.

**Not in history.** `Cmd+Z` undoes panels, never a shelf — M113's ruling for work items,
for the same reason: a record is not layout, and an undo that silently reorganised a
library would be indistinguishable from the library breaking.

### 2.5 Derived default, placed override, and the provenance word

A skill's column is resolved in one function:

```ts
placement(key): { columnId: string; why: 'placed' | 'by-plugin' | 'by-scope' }
```

- **`placed`** — the user dropped it there. Always wins.
- **`by-plugin`** — the derived default. Measured on this machine, installed skills are
  *already* namespaced by use case: `superpowers:*`, `document-skills:*`,
  `mattpocock-skills:*`, `claude-security:*`, `feature-dev:*`. The columns the screenshot
  asks for exist on disk already.
- **`by-scope`** — for a skill with no plugin prefix.

**`why` is rendered as a word on every card.** Two authorities for one position is the
failure this design was warned about — a skill appearing in a column nobody put it in, with
no way to tell why — and the fix is the repo's standing one: make the state visible rather
than collapsing it. The pane can filter to `placed` only.

**`Ungrouped` is a real column and cannot be deleted or emptied by filtering.** A skill that
silently vanishes from the shelf is indistinguishable from a skill that was never installed.

**A key whose skill is gone keeps its slot** and renders `not installed here`. The shelf is
the user's arrangement; it does not get to be edited by a `git pull`.

### 2.6 Checks (`verify:toolbox skill.1`, `verify:layout shelf.1–.4`, `verify:palette shelf.1`, `verify:file plugins.1`)

- `skill.1` — resources counted at the boundary; capped; an unlistable directory yields
  `unknown` and never `0`; `SKILLS_MAX` is the total across scopes AND plugins.
- `shelf.1` absent key = every pre-M126 file, no warning. `shelf.2` malformed column dropped
  by name, the shelf kept. `shelf.3` `carryShelf` writes the required keys and no
  `undefined`. `shelf.4` empty shelf absent on disk.
- `palette shelf.1` — `by-plugin` derivation from the prefix; `placed` outranks derived;
  `why` is returned, not inferred by the caller; a gone skill keeps its slot.
- `verify:file plugins.1` — `plugin-list.ts` over a FAKE runner: the recorded JSON parsed,
  only `enabled` paths returned, a non-zero exit and a timeout each yielding `unknown`.

## 3. M127 — the Skills pane

`shell.navigator` gains `skills`. Columns of cards, horizontally scrolling, each card a
rectangle carrying name, description, the provenance word, the resource count and the
plugin id when there is one.

- **Three kind tabs — Skills / Agents / Commands.** `toolbox-read` already walks all three
  directories; the extra two tabs cost a filter.
- **Search reuses `palette/fuzzy.ts` unchanged.** A second matcher would drift from the
  palette's in exactly the cases nobody tests.
- **Filters:** scope, and `placed` vs derived.
- **A drag between columns writes the override.** A drag ONTO the canvas opens the skill's
  panel at the drop point, carrying the pane's own MIME and nothing else — M114's rule for
  the board's drops.
- **A search matching nothing says so.** An empty pane and "no skill matches `xyz`" are
  different renderings; the first reads as a broken pane.

Checks: `verify:rail skills.1` — the three tabs over one inventory, `Ungrouped` present and
refusing deletion by name, the no-match sentence, the filter's arms.

## 4. M128 — the `skill` panel kind (the thirteenth)

Sessionless like `jira`, `github` and `work`; through `PanelFrame`; one appended arm per
fan-out file.

```ts
{ kind: 'skill', skill: { scope: ToolScope, name: string } }
```

**That is the whole record.** No description, no body, no resource count, no token figure is
copied onto the panel: a copy is a second author that goes stale silently, and M116 already
ruled this for the work card (`work: { itemId }`, the record on the workspace). Everything
else is read live from `ToolboxCache`.

The body carries, each a three-state result:

1. Frontmatter — name, description.
2. The `SKILL.md` text, capped.
3. Resources (§2.2).
4. `alsoDefinedIn`, when another scope defines the name — stating the link and naming no
   winner, M21's refusal reused rather than re-decided.
5. **Which open panels can see this skill.** `docs/ideas-backlog.md` #26 calls the
   cross-panel answer *"the entry's whole original argument, and still the best reason for
   any of this"*, and it is cheap here: `ToolboxCache` is keyed by resolved cwd, so twelve
   panels in one repository cost one parse.
6. **`claude plugin details <id>`, rendered VERBATIM** for a plugin skill — its inventory
   and its projected token cost, as text, parsed nowhere (measurement 5). A refresh control
   and a `readAt`, M21's own answer to staleness.

### 4.1 Three doors, no writes

- **`Start a chat with this skill`** — mints a chat and **INSERTS** the skill's name into the
  composer. Inserted, never sent: this is the user's next move, not a hand-off, which is
  M80's rule for a template's chat message rather than M114's for a dispatch.
- **`Open folder`** — `shell.showItemInFolder` on the `sourcePath` every entry already
  carries, the door already wired for worktrees.
- **`Help me write`** — mint a chat in the skill's own directory whose first message names
  the file. This survives M129's editor rather than being replaced by it: an agent drafting
  prose in place is a different act from a person typing it, and the screenshot has both.

Checks: `verify:panels skill.1` — the panel opens from three doors, the record holds two
fields and no copy, the five body sections' three states, the `alsoDefinedIn` refusal, the
verbatim block parsed nowhere.

## 5. M129 — the editor

M128 reads. This writes, and it is the only milestone in this act that puts bytes into
`~/.claude`. `docs/ideas-backlog.md` #26 deferred the editing half; §5.1 is where that
refusal is narrowed rather than dropped, and §5.2 and §5.4 are the two ways a naive editor
destroys a user's file while reporting success.

### 5.1 The line: skills yes, everything else no

**Writable:** a skill's `SKILL.md` — its body always, its metadata under §5.2's condition.

**Not writable, each deferred by name with its reason on the disabled control:**

| refused | why |
|---|---|
| hooks, permissions, MCP servers, `settings.json`, `.mcp.json`, `.claude.json` | #26's stated reason, unchanged: a hook is arbitrary code that fires automatically, a permission grants without asking, an MCP server is a process with its own reach. **A skill is invoked deliberately.** That is the line, and it is the whole of it. |
| agents (`agents/*.md`) | an agent's `tools:` line is a permission surface wearing markdown's clothes |
| commands (`commands/*.md`) | a slash command can carry shell |
| anything under a plugin's `installPath` | `claude plugin install` owns those directories; a write there is discarded by the next update with no symptom. Refused **naming the plugin**, because "your edit will vanish on upgrade" is the useful sentence |

**Containment is M100's `insidePlace`, reused rather than rewritten.** It already decides on
the REAL, normalised path with an injected `realpath` — `..` walking out, a symlink pointing
out, and a relative path refused rather than resolved against a root are each already a
check (`verify:teammates places.1–.3`). The skills roots are the prefixes. A second
path-containment implementation is exactly the duplicate this repository has refused every
time it has come up, and this one would be a security boundary.

### 5.2 The frontmatter round-trip, and why Save never re-serialises

`parseFrontmatter` is **deliberately a small grammar**: a `key: value` line, optionally
quoted, and `null` for anything else — block scalars, anchors, multi-line folds — because a
real YAML parser would be a second runtime dependency and a parser differential against the
CLI. Its own comment says so.

That refusal has a consequence the read half never had to face. **If Save re-serialised the
frontmatter from what the grammar parsed, every field the grammar could not read would be
deleted** — silently, in the user's own file, with the panel showing a successful save. The
file would still load; it would just quietly mean something else.

So the editor **never re-serialises the block**:

- The body below the closing fence is replaced wholesale.
- Inside the fence, only the specific `key: value` LINES the grammar understood are
  rewritten, in place. **Every other line is preserved byte for byte**, including comments,
  blank lines and ordering.
- If the block contains a line the grammar did not understand, the metadata fields render
  **read-only with a named reason** and the body stays editable — the three-state rule
  applied to editability, rather than a disabled Save that explains nothing.

`verify:toolbox edit.1` plants a `SKILL.md` whose frontmatter carries a block scalar, an
anchor and a comment, saves a changed description and a changed body, and asserts all three
survive byte for byte.

### 5.3 The writes

- **Atomic, always:** temp file in the SAME directory, then `renameSync` — `layout-store.ts`,
  `credential-store.ts` and `diagnostics-export.ts`'s shared rule. A partial `SKILL.md` is a
  skill the CLI will half-load.
- **Delete is `shell.trashItem`, never an unlink**, and it trashes the skill's DIRECTORY, so
  its resources go with it — which is why the confirm names the resource count (§2.2) rather
  than asking about "a skill". Recoverable by construction; the Finder is the undo.
- **Rename moves the directory and refuses a collision** rather than overwriting. The shelf
  key is `scope:name` (§2.1), so a rename changes it: `renameInShelf` carries the slot, and
  a rename that could not be carried leaves the old key in place rendering `not installed
  here` rather than dropping the column entry.
- **New scaffolds `<root>/<name>/SKILL.md`** with a frontmatter stub, refusing an existing
  name by that name.
- `skill:write` / `skill:create` / `skill:rename` / `skill:delete` are four new invokes;
  `verify:ipc`'s `EXPECTED_CHANNELS` is re-derived, the pin being deliberate.

### 5.4 The stale write

**An agent editing `SKILL.md` while the panel has it open is the ordinary case in this
application, not an edge case** — it is what `Help me write` does. A blind Save destroys the
agent's edit with no symptom on either side.

So every write carries the `mtime` and `size` the panel READ, main compares before the
temp file is written, and a mismatch is a **named refusal that keeps the user's text**:
*this file changed on disk since you opened it — reload to see it; your edit is still here.*
M21's stat-sweep already computes exactly this stamp for its `stale` freshness arm, so the
value exists and only the comparison is new.

Never last-write-wins. Never a merge — this app has no merge and inventing one here would be
a second author of a file two things are already editing.

### 5.5 A file write is not history

`Cmd+Z` never reverts one. The shelf's rule (§2.4) for a stronger reason: undo can remove a
panel and dispose a session, and a keystroke aimed at a text field must not additionally
revert a file on disk. The trash (§5.3) is the recovery path, and the editor says so.

This inherits the open `Cmd+C`/`Cmd+V`/`Cmd+Z` hazard `CLAUDE.md` already records for
`ReviewNode`'s commit draft, `FileNode`'s editor and `JiraTicket`'s comment box: a draft open
in a panel does not own the clipboard verbs. **The editor is the FIFTH such surface**, it is
the one where a stray `Cmd+Z` is most expensive, and it takes `Palette.tsx`'s shape — its own
`edit:copy` / `edit:paste` subscriptions serving its own input — which covers two of the
three. The `edit:undo` half stays open and is stated here rather than discovered later.

### 5.6 Checks

`verify:toolbox edit.1` (§5.2's byte-for-byte round trip), `edit.2` (atomic write; no
partial file after a failed rename), `edit.3` (the containment refusals over a fake
`realpath`: `..`, a symlink out, a relative path, a plugin `installPath` naming its plugin),
`edit.4` (the stale-write refusal keeps the text and names the fix), `edit.5` (rename
collision refused; `renameInShelf` carries the slot; delete trashes the directory) — all in
`verify:toolbox`'s existing fixture tree, which is already spaced and syntactically hostile.
`verify:panels editor.1` — the metadata fields read-only with their reason for an
ungrammatical block, the body still editable, Save disabled with a named reason and never
silently.

## 6. M130 — the live skill trail

The act's centre. **What skills a session used, in the order it used them, beside the panel
that used them.**

### 6.1 Two sources, one shape

```ts
export interface TrailEntry { at: number; name: string; args?: string }
export type Trail =
  | { kind: 'entries'; entries: TrailEntry[]; more: number }
  | { kind: 'none' }
  | { kind: 'unreadable'; why: TrailUnreadable }
```

- **A chat panel** — M71's stream already delivers `tool_use`; the trail is a filter over
  events already in memory. No IO.
- **A terminal panel running `claude`** — `resolveTranscript(pinnedSession(panelId))` names
  the file (measurement 2) and main tails it **from a byte offset**, the way
  `scrollback-log.ts` appends rather than rewrites. Structured JSONL, never the byte stream.
- **codex, another backend, a terminal running no agent, or a session whose transcript
  cannot be resolved** — `unreadable` with a named reason. *"No skills used"* and *"we
  cannot see this session's skills"* are different renderings, and printing the first for
  the second tells the user their agent did nothing.

`TRAIL_MAX` newest, with `more` counting what was dropped — a 200-skill session must not
paint 200 cards, and a silent truncation is a lie about the order.

### 6.2 Derived, anchored, and stored nowhere

**The transcript is the author.** The trail is re-derived and never persisted, the way M79
derives run frames (`run:<id>`, derived read-only group frames, never groups) and M114
re-derives the work card's rect every render and never writes it back.

The cards are **not in the panel array.** Consequences, each of which is why:

- Forty skill uses cost zero LOD budget and zero panel records — M3's whole reason for
  tiering is that live WebGL contexts are the scarce resource.
- Closing the terminal takes its trail with it, correctly and with no pruning pass.
- `Cmd+Z` cannot orphan one, because there is nothing in history to undo.
- A carded or far-tier panel paints no trail; the trail is culled with its host.

**The one stored fact is the collapse:** `skillTrail?: 'collapsed'` on the panel record,
absent by default, carried by M92's existing `carryMarks`. A layout mark like `pinned` — so
"collapse it back so it is no longer visible" survives a relaunch, which a view state
(M106's `flipped`) would not.

Collapsed, the panel's chrome shows one capsule — `7 skills` — because a control that
disappears when it is off is indistinguishable from a feature that was never built.

### 6.3 Resolving a trail entry to the shelf

Measurement 3: the record carries no scope. So an entry resolves BY NAME against the
inventory, and there are exactly three outcomes:

| outcome | card |
|---|---|
| one match | the skill's own name, description and column; clicking opens its M128 panel |
| several scopes define the name | the name, and *defined in N scopes* — **no winner picked**, M21's refusal |
| no match | the name, and *not installed here* — which is itself the useful answer after a session used a plugin skill this project cannot see |

### 6.4 Geometry

A **lane** beside the panel — a single column at a fixed offset, ordered top to bottom —
rather than a free cluster. M114's anchored card had exactly one card to place; a cluster of
forty has no natural resting shape, and the `shot` scene is how this gets judged.

The expand is a **finite** transition (M111's pulse rule), and blur is not paid here: the
trail exists at the near tiers only, which `blur.1` already constrains.

### 6.5 Checks

- `verify:file trail.1` — over a **recorded fixture JSONL**, the way the four recorded
  `claude` streams and Act II's copilot/ACP fixtures already work: the parse, the byte-offset
  resume across two appends, `TRAIL_MAX` with `more`, a truncated final line ignored until
  complete, a codex panel's named refusal, an unresolvable transcript's named refusal.
- `verify:panels trail.1` — the cards anchored to their host and re-derived on its move, the
  order matching the transcript, the collapse mark surviving a reload, the capsule's words,
  no trail at the card tier, and **no trail entry in the panel array**.

## 7. M131 — assignments

A shelf column, or a single skill, attaches to a teammate.

M100 already establishes that **main appends the brief from its own roster on every spawn**.
An assignment rides that one append — never a second path, and never a renderer-side copy of
the brief, which would drift in exactly the cases nobody tests.

**The claim is precise: the skills are NAMED to the agent.** The app does not load, install
or activate anything. Saying otherwise would be the same overclaim `agent-session.ts`
refuses when it declines to report a cost codex never gave.

One real refusal: a **project**-scoped skill assigned to a teammate whose places do not
contain that repository is not visible to that teammate, and says so by name with the fix —
`insidePlace`'s own shape, and M114's rule that a refusal must not name a path nobody should
add.

Checks: `verify:teammates assign.1` — the brief append happens once and in main; the
project-scope refusal names the repository and not the worktree; an assignment to an unknown
teammate refused; a column assignment carrying every present key and no `undefined`.

## 8. M132 — the workflow blocks (Track B)

`TemplateNode.kind` gains three arms. **Every pre-M132 template file must load unchanged**,
and `layout-schema.ts`'s existing arm — an unusable node kind drops the node and takes its
edges with it, the template kept — stays exactly as it is for whatever comes after these
three.

### 8.1 `pool` — the one new engine

```ts
{ kind: 'pool', width: number, list: string, prompt: string }
```

N chat workers over a shared list, each pulling the next item until the list is empty.

**The list is a FILE**, as the screenshot shows (`scan-state/assignments.txt`). A shared work
list needs exactly one authority, and a file on disk is one both the app and the agents can
see, that neither has to invent, and that survives a relaunch. An in-memory list would make
the app the authority over work the agents are doing, which is the "two authors" failure this
repo has refused at `groupRect`, at the work card's rect and at the diagnostics bundle.

**Width is bounded by M82's `agents.maxConcurrent`, READ LIVE on every send.** A pool of 12
under a ceiling of 4 runs 4 and queues 8 with `reason: 'concurrency'` — M82 built that exact
queue, and the panel already says which queue it is in. The pool does not get its own
ceiling, its own queue, or its own opinion about concurrency.

**M82's budget applies unchanged, and this paragraph exists because a pool is the single
fastest way to spend money in this application.** A crossing interrupts every turn in flight
and says so once, latched until the ceiling is raised. Nothing in §7 relaxes it.

A worker that finishes pulls again: M97's loop shape — **main enforces the stop, the
renderer's chip is a projection that can never move it** — widened from one agent to N.

### 8.2 `orchestrator`

A chat spawned with an appended system prompt. M81's supervisor mechanism reused verbatim,
**including the reason it rides every spawn**: the CLI keeps no record of
`--append-system-prompt`, so a resumed orchestrator without it would quietly stop being one.

### 8.3 `collect`

The join. `joinAdvance` already starts a target once, when the last expected source arrives,
**with payloads in panel order** — which is the screenshot's `OUTPUTS IN ORDER → FINDINGS`.
A collect node is a join whose target is a file or a chat. `handoffFires` is unchanged; a
collect adds no trigger.

Checks: `verify:layout workflow.1–.3` (the three kinds parse; a pre-M132 template loads
untouched; an unknown kind drops the node and its edges, the template kept),
`verify:agent-session pool.1` (width against the ceiling read live, the queue's reason, the
budget stop interrupting rather than killing, an empty list ending the pool, a list that
cannot be read refusing by name before a worker is minted).

## 9. M133 — the `workflow` panel (the fourteenth) and triggers

```ts
{ kind: 'workflow', workflow: { templateId: string } }
```

**Definition** tab draws the block diagram as SVG, a sibling layer the way
`AnnotationLayer.tsx` is a sibling of the link layer. **Runs** tab is M79's records filtered
to this template — that data has existed since M79 and needs no new store. Header: the
template's name, `N blocks`, Run, Triggers, Save, Delete, Build with AI.

**The live canvas remains the editor, and the template remains the truth.** The diagram is a
PROJECTION of the record; running mints real panels through M80's existing instantiation.
There is no second coordinate system, no second selection model and no second undo — which
is also why `@xyflow/react` is declined in §10 rather than adopted.

**Triggers** reuse `shared/watch-trigger.ts` unchanged (`path`, `git-ref`, `timer`, `panel`)
with main's existing arming. A workflow trigger is a watcher whose command is "instantiate
this template"; a second scheduler is what M101's routine runner already warned against.

**Build with AI** mints a chat whose first message names the template file and its schema —
no new IPC, no new writer, no new trust boundary. §4.1's door, pointed at a template.

Checks: `verify:panels workflow.1` — the diagram matching the record's nodes and edges, the
block count, Runs filtered to this template, a trigger round-tripping, Run reaching M80's
instantiation and not a second copy of it. `shot` scenes `skills`, `trail`, `workflow`.

## 10. Tracks

| Track | Milestones | Where |
|---|---|---|
| A | M126 → M127 → M128 → M129 → M130 → M131 | this session; sequential, each on the record before it |
| B | M132 → M133 | fresh-context subagent, worktree off M126's schema commit |

Track B touches `templates.ts`, `layout-schema.ts`'s template parser, `handoff`/`runs` and
one new panel kind; Track A touches `toolbox-*`, the shelf, two panel kinds and the trail.
They meet only at `layout-schema.ts` and the panel-kind fan-out, which is where Act I's merge
lesson applies: **run every plain-node suite a merge touched**, because a keep-both
resolution of two blocks appended at one marker dropped a closing brace and read as
`Unexpected end of input`.

**If the act runs long, M133 is the one to defer.** The blocks are useful without the panel;
the panel is useless without the blocks.

## 11. Declared non-goals

- **Writing anything but a skill.** M129 narrows #26's refusal to exactly one file type and
  leaves the rest of it standing: no hook, permission, MCP server, settings file, agent or
  command is written by this app. §5.1 is the table and the reason for each.
- **Import and Sync.** A marketplace fetch is `claude plugin install`'s, and the app does not
  reimplement it; the chat door runs it in the directory the user is looking at.
- **Merging a concurrent edit.** §5.4 refuses and keeps your text. This app has no merge, and
  inventing one at a two-writer boundary is how the file gets silently wrong.
- **Parsing `claude plugin details`.** Verbatim or nothing, until it grows `--json`
  (measurement 5).
- **`@xyflow/react` / React Flow.** A second canvas with its own pan, zoom, selection and
  undo — the thing §9 exists to avoid.
- **`js-yaml`.** The documented parser-differential refusal in `toolbox-scan.ts`.
- **`fuse.js`, `chokidar`, `react-window`.** `fuzzy.ts`, `FileWatchers`/`fs.watch`, and the
  pane's own culling already do these, each already under a plain-node suite.
- **`dagre` — recorded as a candidate, not adopted.** ~30 KB, pure, no DOM, so it would fit
  the plain-node verify tier if the diagram ever needs auto-layout. It does not now, because
  template nodes carry authored `dx`/`dy`.
- **A skill that this app "activates."** §7's claim is that skills are named to an agent.
- **The disabled plugins' skills.** §2.3.

## 12. What green will not prove

- **That the trail matches what the agent actually did.** Every check drives a recorded
  fixture JSONL. The record shape is measured (measurement 1) but not versioned by anything;
  a change to how the CLI writes a `Skill` tool_use reads as an empty trail, not an error.
  **One hand check is owed:** run a real `claude` in a real terminal panel, invoke two
  skills, and confirm the lane shows both in order.
- **That `claude plugin list --json` is stable.** Measured once, on one machine, on one
  version. The `unknown` arm is what protects the pane; the shape is not pinned by anything
  but §2.6's fixture.
- **That a pool of N is safe against a real budget.** `pool.1` drives the fake runner and a
  fake limits dep. A pool that spends real money against a real ceiling is a second owed hand
  check, and it should be run with `agents.budgetUsd` set deliberately low.
- **That a saved `SKILL.md` still loads in the CLI.** `edit.1` proves the bytes round-trip;
  it does not prove the CLI accepts the result, because no suite in this repository runs a
  skill. **One hand check is owed:** edit a real skill's description and body, save, and
  invoke it from a real session.
- **That `shell.trashItem` behaves on this machine.** It is Electron's, unreachable from
  plain node, and `verify:toolbox` drives an injected `trash` dep. Manual-only, once.
- **That the token figures in §4's verbatim block are right.** They are the CLI's estimates,
  rendered as the CLI printed them, and the panel says so.
