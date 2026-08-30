# M21: The agent's toolbox — Design

**Status:** designed and implemented on `worktree-m20-toolbox`.

**Number:** M21, and it was **M20 until the moment before it was committed** —
which is worth recording rather than tidying away, because it is this repo's
renumbering convention paying out in real time. M17 was claimed three times over
on branches that never saw each other, M18 by workspace extras, M19 by Jira
context; `main` was at M19 when this branch was cut and had claimed **M20 for
"the file tree"** by the time the work was green, roughly four hours later. The
rule is the one the milestone table already states: **the block that reaches
`main` first keeps its number, and the branch arriving later renumbers itself** —
never the one already there, which other documents may already be citing. If
`main` has taken M21 as well by the time this merges, renumber again on the same
rule.

**Predecessor by DEPENDENCY:** M16 (file panels), not M19. This milestone reuses
M16's *shape* — a shared union-of-honest-states result, a never-throwing reader,
a per-panel store, a pure view model, a node component — and touches none of
M19's Jira machinery. It also inherits M14's boundary rule wholesale; see
"The projection" below.

**Backlog entry:** #26, "The agent's toolbox". The entry's own sequencing note
(item 31) says to ship the **read-only inventory** first, "after #3 or #14 tier
1, because it is the same watched-directory machinery and should not invent a
second copy of it". Both preconditions were met by M16. The **editing** half is
explicitly out of scope and stays in the backlog: "Ship the browser, then decide
about the editor."

**Adjacent entries this touches without shipping:** #18 (a per-panel cost
readout should count a panel's MCP servers as children of its PTY — this
milestone tells you how many there are and nothing about what they cost), #11
(the settings surface owns *this app's* settings; this owns *the agents'*
capabilities — different data, different owner, different blast radius), #31
(the secrets rule, which this milestone is the second implementation of).

---

## Goal

Select a panel and see what the agent running in it can actually do: its
skills, its slash commands, its subagents, its MCP servers, its hooks, and how
many permission rules govern it. Open that as a node on the canvas beside the
agent it describes, which keeps answering after that panel is closed.

The entry's own argument for why this canvas is an unusually good home for it
is not "because it's a nice UI": these extensions resolve **per project**, so
the same `claude` binary in two panels has two different sets active, and every
existing tool shows one scope at a time because you are in one directory. A
canvas holds twelve panels in twelve directories at once and each panel already
knows its cwd.

**M21 ships the per-panel read.** The cross-panel question — "which of my
twelve agents can do X" — is the entry's differentiating claim and is the
natural next milestone; it needs a per-cwd cache across N panels, which this
milestone's reader is the input to.

---

## The data source, measured rather than assumed

Read off this machine on 2026-08-30. Several of these measurements changed the
design, and the ones that did are called out.

```
~/.claude/settings.json        64,152 bytes
  keys: skillListingBudgetFraction, env, permissions, model, hooks, statusLine,
        enabledPlugins, extraKnownMarketplaces, effortLevel, modelSettings, …
  hooks: { SessionStart, SessionEnd, Stop, PermissionRequest, Notification,
           UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure,
           SubagentStart, SubagentStop, TeammateIdle, TaskCompleted }
         each an ARRAY of { matcher, hooks: [{ type, command }] }
  permissions: { allow: [628 rules], additionalDirectories: [...] }
  enabledPlugins: 26 entries
  env: { CLAUDE_CODE_ATTRIBUTION_HEADER: … }

~/.claude.json                 93,611 bytes
  mcpServers: { XcodeBuildMCP: { args, command, env, type }, railway: {…} }
  projects: 12 entries keyed by ABSOLUTE CWD, each with
    allowedTools, disabledMcpjsonServers, enabledMcpjsonServers, mcpServers,
    enabledMcpServers, disabledMcpServers, hasTrustDialogAccepted, lastCost, …
  /Users/alexnieves.mcpServers contains ios-simulator-mcp
  Steward's entry names enabledMcpServers:["computer-use"] and
    disabledMcpServers:["claude.ai Higgsfield"] — servers in NO readable map

~/.claude/skills/<name>/SKILL.md   YAML frontmatter: name, description
  22 user skills; longest description measured at 952 chars
~/.claude/commands/*.md AND ~/.claude/commands/<ns>/*.md
  28 user commands, 27 of them namespaced; paul/plan.md carries name: paul:plan
~/.claude/plugins                 663 MB, 700 SKILL.md files under cache/
<repo>/.claude/settings.local.json  { permissions:[718 rules], skillOverrides, … }
  26 skillOverrides keys, every one namespaced (paul:add-phase)
```

**Five facts in there decide most of this design.**

**`~/.claude/settings.json` is 1,384 bytes from `MAX_PROMPT_BYTES`.** That cap
is `64 * 1024` = 65,536; the file is 64,152. Copying `prompts.ts`'s cap — the
obvious move, since it is this repo's existing reader of a directory it does not
own — would put the single most important file in this feature within a rounding
error of being refused, and **the refusal looks exactly like "you have no hooks
and no permissions"**. `SETTINGS_MAX_BYTES` is 1 MB. This is the one cap in the
repo that must not be inherited.

**Permissions are two orders of magnitude larger than everything else.** 628
rules in one file and 718 in another, against 22 skills, 28 commands and ~26
hooks. Carrying the rule strings on every selection change would be roughly
240 KB per panel per read for data almost nobody expands, so the inventory
carries **counts** and the rules ride a second, explicitly-requested invoke —
`review:diff`'s pull-only, one-file-at-a-time shape, for `review:diff`'s reason.

**`projects[*].history` was present on one machine and absent on another.** The
design brief was written against a machine where `~/.claude.json` carried the
user's own past prompts under each project; the union of all 32 keys across all
12 projects on the implementing machine contains no `history` at all. **That
disagreement is the strongest argument in the milestone for an allowlist**: a
denylist written against either machine is silently wrong on the other, and the
failure is invisible, because the payload merely gets bigger. Four paths are
read out of that file and nothing else.

**MCP has three scopes, not two.** `~/.claude.json`'s
`projects[cwd].mcpServers` is a server configured for exactly one directory and
stored in the user's **global** file. Calling that `user` prints a source path
beside a scope that is wrong; calling it `project` claims a file the repository
does not contain and cannot commit, which is the one fact a user needs before
telling a teammate to pull. It is `local`.

**Commands are namespaced two levels deep.** `prompts.ts`'s one-level rule would
have missed 27 of this machine's 28 user commands. The naming rule is confirmed
rather than inferred: `commands/paul/plan.md` carries `name: paul:plan` in its
own frontmatter.

---

## The projection: what crosses IPC, and why it is an allowlist

Three of the files above carry secrets or private data — MCP `env` blocks are
the documented home for API keys, `settings.json` has its own `env`, and hook
`command` strings are free text a user typed. So **the reader is a projector,
not a passthrough**, which is M14's boundary restated for a second data source:
`credential:list` returns metadata with no `cipher` and no `token`, and that
absence is pinned as *source text* precisely because it has **no runtime symptom
when broken**. Ship a passthrough here and the app works exactly as it does
now, plus a renderer that holds the user's API keys.

| Field | Crosses? | Form |
|---|---|---|
| MCP `env` values | **No** | key names only, sorted, capped |
| MCP `args` | **No** | `argCount` only |
| MCP `command` | Yes | verbatim — a launcher name, not a payload |
| `settings.json` `env` | **Not read at all** | — |
| hook `command` | **Reduced** | `program` + `commandChars` |
| hook event / matcher / type | Yes | verbatim, matcher capped |
| `~/.claude.json` outside 4 paths | **Not read at all** | — |
| permission rule strings | Yes, on a **second** invoke | verbatim, capped per rule |

**Dropping MCP `args` is the call most likely to be argued with, and it is the
right security trade rather than obviously the right product one.**
`npx -y @vendor/mcp --api-key=sk-…` is an ordinary configuration idiom, so args
are as secret-bearing as `env` with none of `env`'s key/value structure to
project safely; any rule that carried "the safe args" would be a heuristic, and
a heuristic about secrets is how secrets leak. The cost is real — the UI cannot
say which npm package a server is — and it is **paid visibly**: the row says
`npx · 3 args`, and `sourcePath` is one click from opening the file. If that
proves wrong in use, the honest widening is a separate, explicitly-invoked
`toolbox:mcp-detail`, never a wider default payload.

**Permission rules are the one place free text is knowingly carried**, and the
exposure is measured rather than theoretical: a real rule in Steward's own
settings is
`Bash(curl -s "http://localhost:8000/api/v1/merchants/nearby?lat=…&lon=…")`. A
redacted allowlist cannot answer the only question it exists to answer. It is
recorded as an accepted exposure, and it is why those strings ride a separate
invoke rather than the payload every selection change fetches.

---

## Three answers, never two

`review-engine.ts`'s rule, and it governs three separate places here.

**Per source.** `SourceRead.status` is `read | absent | too-large | malformed |
unreadable`. "No skills" because the directory was read and was empty is a
different sentence from "no skills" because it could not be opened, and only one
of them means the user should go and look. `absent` is the ordinary case — most
cwds have no `.claude` — and must warn nothing, which is `prompts.ts`'s own
stated reason for returning `[]`.

**Per entry.** `ToolActive` has five arms: `active`, `disabled` (naming the
FILE that decided, by absolute path), `needs-approval`, and `unknown` carrying
one of three reasons. `needs-approval` is KNOWN, not unknown, and is the arm
most likely to be "simplified" away: a `.mcp.json` server named in neither the
enabled nor the disabled list is a definite state with a definite meaning — the
CLI asks at startup. Folding it into `active` sends someone to a panel whose
agent will refuse; folding it into `unknown` throws away the one arm whose
remedy the user can act on.

**Per section.** `buildToolboxFields` renders nothing for a panel with no
directory, a note for a read that has not answered yet, and rows for an actual
inventory — `buildUsageFields`' rule, and M9a's `not-a-repo`/`never-started`
split, reaching a fourth section.

---

## Pull, not push — and why FileWatchers is the wrong tool here

M16's `FileWatchers` is keyed by **panel id**, which is exactly right for a file
panel (one panel, one path) and exactly wrong for this. Half of this feature's
sources — `~/.claude/settings.json`, `~/.claude.json`, `~/.claude/skills`,
`~/.claude/commands` — are shared by **every panel on the canvas**, so twelve
panels would arm twelve watchers on the same four paths and emit twelve reads
and twelve IPC messages for one save. Doing it properly needs a **path-keyed,
refcounted** registry, which is a different class of machinery and its own
milestone.

So: an on-demand invoke, with a main-side cache keyed by **resolved cwd** and
validated by a stat sweep. Twelve panels in one repository share one answer
rather than parsing the same 93 KB file twelve times.

**The stat vector reaches individual files, not only directories**, and that is
the subtlety worth writing down: a directory's mtime does **not** change when a
file inside a subdirectory changes, so editing `~/.claude/skills/foo/SKILL.md`
leaves `~/.claude/skills` untouched. Stamping only the directories yields a
cache that is correct for every ADDED skill and permanently stale for every
EDITED one, with nothing on screen wrong.

The node renders `readAt`. That is what makes a pull model honest rather than
merely stale — the same discipline that makes M17's dollar figure name whose
price it is.

---

## Stale config, and why the stamp is captured at spawn

Config is read at CLI **startup**, so a panel running since before a `.claude/`
edit loaded different config than what is on disk. `ConfigFreshness` has three
arms — `fresh`, `stale` (naming the changed paths), `unknown` — and **the
wording is the design**: it says "config on disk has changed since this panel
started", never "your agent is missing X". An mtime bump with no semantic change
(a formatter, an editor's save-on-focus-loss) would otherwise read as the
stronger claim, and some config genuinely is re-read mid-session. A fact about
files is defensible; a claim about a running process is not.

It is recorded at spawn because it **cannot be recovered afterwards** —
`spawnedAt`'s own documented precedent — and it follows `firstSpawnedAt`'s
reattach rule exactly: a reattached session's agent has been running since
before this attach, so restamping would clear the flag on every `Cmd+R` while
the stale agent kept running.

The backlog entry worried that a config UI would be the feature that quietly
introduced restart-in-place. It no longer has to: M8c shipped `restartPanel`.
**This milestone deliberately does not offer restart from this surface anyway** —
that would make killing a working agent one click from an mtime.

---

## Out, deliberately

- **Editing anything.** No toggles, no writes. The entry's own ruling.
- **The cross-panel answer.** M21b: a palette scope where typing a capability
  name says which panels have it. This milestone's reader is its input.
- **Plugins as entries.** `~/.claude/plugins` is 663 MB and 700 `SKILL.md`
  files; walking it is a different milestone. `enabledPlugins` is read for the
  one cheap fact — which ids are on — and it is what every
  `unknown/plugin-owned` arm points at.
- **Codex or any second vendor.** The entry says not to build the adapter until
  one actually wants it.
- **A merged "effective" permissions list.** This app cannot verify whether the
  CLI unions allow-lists across the three settings files or takes the
  highest-precedence one, so one merged list would be a confident answer to a
  question nothing here can settle. Per file, attributed, always.
- **A shadowing claim.** A project skill named the same as a user skill produces
  two rows, both active, each naming the other's scope in `alsoDefinedIn`. This
  app cannot verify how the CLI resolves that collision, and asserting a winner
  would mark a row inactive for an agent that can in fact use it.

---

## What this milestone does NOT prove

Two things, in the shape this repo already records for `verify:panels` 32 and
the auto-repeat checks.

**Claude Code's real resolution order is INFERRED**, from the files on one
machine on one day, exactly as `slugFor` was inferred from 31 directory names.
Where the inference could be wrong the arm reads `unknown` rather than guessing:
a confidently wrong "this skill is active here" is worse than an honest "cannot
tell". Three specific unknowns are recorded rather than papered over — whether
`permissions.allow` unions or overrides across the three settings files, whether
a project skill shadows a same-named user one, and whether the newer
`enabledMcpServers` pair outranks `enabledMcpjsonServers` when both name one
server.

**The projection is proven against fixtures, not against a real
`~/.claude.json`.** `verify:toolbox` builds its own tree — it must, because a
suite that read the running developer's home would depend on state this repo
does not own, the rule M9a's git fence and M15's projects-root fence each cost a
fix round to learn. Confirm once by hand against a real file with a populated
MCP `env`.

---

## Verification

`npm run verify` must be green. New: `verify:toolbox`, 43 checks over the pure
scanner and the real-filesystem reader, in a fixture tree whose path contains a
space. Extended: `verify:rail` (+12, both view models), `verify:viewport` (+2,
the constructor and the five-way partition), `verify:layout` (+3, the schema arm
and the adapter round trip), `verify:ipc` (`EXPECTED_CHANNELS` 41 → 43).

Three checks were **fault-injected** rather than merely written: the projection
(spread the raw MCP server — check 11 goes red, 12 stays green), the node's own
model (make its `no-cwd` arm behave like the pane's — `verify:rail` 90 alone
goes red), and the partition test (drop the toolbox clause from
`isTerminalPanel` — `verify:viewport` 92 alone goes red).
