/**
 * The agent's toolbox: what extends the agent CLI running in one panel's cwd.
 *
 * Shared because main produces this and the renderer renders it. Deliberately
 * NOT folded into shared/file-panel.ts or shared/review.ts: all three are
 * unions of honest states, and that is the only thing they share — the same
 * rule FileResult's own header already states against ReviewResult.
 *
 * Everything here reads formats this repo does not own and cannot version, so
 * subagent-scan.ts's rule governs the whole file: **a surprise costs an ENTRY,
 * never a throw.** These readers run against whatever directory a user pointed
 * a panel at, which makes every count and every byte length an attacker-shaped
 * input in the ordinary case of "I opened a panel in a repo I just cloned".
 */

/**
 * `agent`, not `subagent`. M15 already owns that word: `SubagentRecord` is a
 * subagent that is RUNNING, read out of a live transcript. This is the
 * DEFINITION sitting in `.claude/agents/*.md`, which may never run at all. One
 * word for two things is how a renderer ends up painting a definition into a
 * live node's slot, and the directory on disk is called `agents`.
 */
/**
 * What a toolbox PANEL persists: the directory it answers for, and a label
 * snapshotted at mint time.
 *
 * Declared here beside the result types rather than in renderer/panels/panels.ts
 * for the reason `FileSource` lives in shared/file-panel.ts: `layout-schema.ts`
 * needs it to parse a record off disk, and `shared` must never import from
 * `renderer` — the dependency only points one way.
 */
export interface ToolboxSource {
  /**
   * The directory whose toolbox this is. UNEXPANDED — main expands it with
   * `resolveCwd`, the same expansion a spawn gets, so the toolbox and the
   * agent can never disagree about which directory they describe.
   */
  cwd: string
  /**
   * What to show before anything has been read, snapshotted at mint time.
   * `ReviewSubject.label`'s rule: re-deriving it from a live panel lookup is
   * exactly what would blank the heading at the moment the node outlives the
   * panel it was opened from.
   */
  label: string
}

export type ToolKind = 'skill' | 'command' | 'agent' | 'mcp' | 'hook'

/**
 * THREE scopes, not the backlog's two, and the third is forced by disk rather
 * than invented.
 *
 * `~/.claude.json`'s `projects[cwd].mcpServers` is a server configured for
 * exactly one directory and stored in the user's GLOBAL file — measured on
 * 2026-08-30 as `ios-simulator-mcp` under `/Users/alexnieves`. Calling that
 * `user` prints a source path that is right beside a scope that is wrong;
 * calling it `project` claims a file the repository does not contain and
 * cannot commit, which is the one fact a user needs before telling a teammate
 * to pull.
 */
export type ToolScope = 'user' | 'project' | 'local'

/**
 * Why this app cannot say whether something is active.
 *
 * Each arm is a different situation with a different remedy, which is the
 * whole reason `unknown` carries a reason at all rather than being a bare
 * arm — review-engine.ts's `not-a-repo` / `repo-unreadable` split, applied to
 * a field instead of to a result.
 */
export type ToolUnknownWhy =
  /** Named in an enable list AND a disable list. Disk contradicts itself. */
  | 'contradictory-config'
  /** The file that would decide exists and could not be read or parsed. */
  | 'settings-unreadable'
  /** Provided by a plugin this app does not enumerate. See `pluginsEnabled`. */
  | 'plugin-owned'

/**
 * Whether one entry is live for this cwd. FIVE arms, and collapsing any two is
 * a wrong answer rather than a simplification.
 *
 * `needs-approval` is KNOWN, not unknown, and it is the arm most likely to be
 * "simplified" away: a server declared in a project's `.mcp.json` and named in
 * neither `enabledMcpjsonServers` nor `disabledMcpjsonServers` is a definite
 * state with a definite meaning — the CLI asks at startup. Folding it into
 * `unknown` throws away the one arm whose remedy the user can actually act on.
 * Folding it into `active` is the confident wrong answer: it sends someone to
 * a panel whose agent will refuse.
 */
export type ToolActive =
  | { kind: 'active' }
  /**
   * `by` is the ABSOLUTE PATH of the file that turned it off, never a
   * friendly name: "disabled by settings.local.json" is ambiguous across
   * three scopes, and the path is also the escape hatch — M16 ships a file
   * panel, so a path is one click from being read in full.
   */
  | { kind: 'disabled'; by: string }
  | { kind: 'needs-approval' }
  | { kind: 'unknown'; why: ToolUnknownWhy }

export interface ToolEntryBase {
  /**
   * Stable across reads and NEVER shown to the user.
   *
   * `JSON.stringify` of the coordinate tuple, the same collision-avoidance
   * `railSignature` already uses and for the identical reason: a hook matcher
   * is user-authored free text, so a `:`-joined id collides the first time
   * somebody writes a matcher containing a colon — one row silently replacing
   * another, for the users whose regex happens to contain the delimiter and
   * nobody else. Stable so a refresh does not remount every row and drop the
   * user's expanded selection.
   */
  id: string
  kind: ToolKind
  scope: ToolScope
  /**
   * The file this was read out of. ABSOLUTE, already `~`-expanded by main.
   *
   * Load-bearing beyond provenance: it is the escape hatch for every field the
   * projection refuses to carry (see `McpToolEntry` and `HookToolEntry`).
   * Anything dropped here is one click from being read in full, in a surface
   * the user deliberately opened, rather than a payload every panel on the
   * canvas holds.
   */
  sourcePath: string
  active: ToolActive
  /**
   * Other scopes that define something by this same name.
   *
   * NOT a shadowing claim, and that distinction is the design. This app cannot
   * verify how the CLI resolves a project skill named the same as a user
   * skill, and asserting a winner would produce a row confidently marked
   * inactive for an agent that can in fact use it. So it reports the LINKS,
   * not the answer — `buildLinkRows`' own rule — and prompts.ts's never-dedupe
   * rule holds: two `review` commands from two scopes are two rows.
   *
   * Always empty for hooks, which have no names to collide.
   */
  alsoDefinedIn: ToolScope[]
}

/** The three kinds that genuinely have a name and a sentence. */
export interface NamedToolEntry extends ToolEntryBase {
  kind: 'skill' | 'command' | 'agent'
  /** As the CLI invokes it: `paul:plan` for `commands/paul/plan.md`. */
  name: string
  /** `''` when the file has no frontmatter description. Capped at PARSE. */
  description: string
  /**
   * True when TOOL_DESCRIPTION_MAX actually cut it.
   *
   * subagent-scan.ts slices silently because a node's description is a
   * two-line LABEL. Here the description is the entire answer to "can this
   * agent do X", and a sentence that stops mid-word without saying so is a
   * list that lies about being complete — REVIEW_FILE_CAP's `+N more` rule,
   * applied to a string instead of to an array.
   */
  descriptionTruncated: boolean
  /** Skills only — a command and an agent are one file each. */
  resources?: SkillResources
  /**
   * M126. The plugin this skill shipped with, when it did. Absent for every
   * user/project skill — never written as `undefined` on a spread, the same
   * "absent unless set" rule every optional field in this module follows.
   */
  pluginId?: string
}

/**
 * A skill's bundled files — `references/`, `scripts/`, `assets/` — counted,
 * never listed. Capped HERE, at the read boundary, so every consumer inherits
 * the bound rather than the one that remembered it (this module's own rule).
 */
export const RESOURCES_MAX = 50

export type SkillResources =
  | { kind: 'none' }
  | { kind: 'some'; n: number }
  /**
   * The directory could not be listed. A `0` printed here is the confident
   * wrong answer `costOf`'s `undefined` already refuses to give: "this skill
   * ships nothing" and "we could not look" are different sentences and lead
   * the user to different fixes.
   */
  | { kind: 'unknown'; why: string }

export type McpTransport = 'stdio' | 'http' | 'sse' | 'unknown'

export interface McpToolEntry extends ToolEntryBase {
  kind: 'mcp'
  name: string
  transport: McpTransport
  /** The launcher only — `npx`, `node`, an absolute path. Never the argv. */
  command: string
  /**
   * How many argv entries. NEVER the argv itself.
   *
   * `npx -y @vendor/mcp --api-key=sk-...` is an ordinary configuration idiom,
   * so args are as secret-bearing as `env` with none of `env`'s key/value
   * structure to project safely. Any rule that carried "the safe args" would
   * be a heuristic, and a heuristic about secrets is how secrets leak. The
   * cost is real and is paid VISIBLY: the row says it is partial, and
   * `sourcePath` opens the file.
   */
  argCount: number
  /**
   * The KEY NAMES of the env block, sorted. NEVER the values.
   *
   * The key name is the useful fact ("this server wants GITHUB_TOKEN"); the
   * value is never useful in an inventory and is the documented home for an
   * MCP API key. The silent failure here is credential-store's `list()` bug
   * one hop away: `{ ...server }` carries `env` wholesale, everything keeps
   * working, no pixel is wrong, and the renderer — the process that also holds
   * every byte of agent output, an undo stack, a DOM and a serialisable app
   * state — is holding an API key.
   */
  envKeys: string[]
  /** Keys beyond MCP_ENV_KEYS_MAX. */
  envKeysOverflow: number
}

/**
 * A hook has no name and no description, and this arm is what that costs.
 *
 * Its identity is a COORDINATE — which event, which matcher, which slot — and
 * the row renders as one. Synthesising `name: 'PreToolUse #2'` is the fix that
 * breaks the feature: that is a coordinate wearing a name, and a fabricated
 * name in a searchable list starts matching queries it has no business
 * matching, the rule `Command.waiting` already states for a count.
 *
 * `index` is part of the identity because two textually identical hooks on one
 * event are two hooks that both run, and deduping them would report half the
 * work as all of it.
 */
export interface HookToolEntry extends ToolEntryBase {
  kind: 'hook'
  /** 'PreToolUse', 'SessionStart', … An event name, not free text. */
  event: string
  /** `''` means "every tool". User-authored regex, capped. */
  matcher: string
  matcherTruncated: boolean
  index: number
  /** 'command', or whatever the file said. */
  hookType: string
  /**
   * The program, PROJECTED — never the command string.
   *
   * The first whitespace-delimited token, plus the basename of the second when
   * it looks like a path: `node "/Users/me/.hooks/guard.js"` renders as
   * `node guard.js`. A hook command is free text the user typed, and
   * `curl -H "Authorization: Bearer sk-..."` is an entirely plausible hook —
   * truncating at 120 chars does not help, because a token in the first 120
   * chars still crosses. Deliberately does NOT parse the command to find and
   * stat the referenced script: that is exactly the clever parsing of a format
   * this repo does not own that subagent-scan.ts's header refuses.
   */
  program: string
  /** How long the real command string was, so no row ever looks whole. */
  commandChars: number
}

export type ToolEntry = NamedToolEntry | McpToolEntry | HookToolEntry

/**
 * What happened to ONE of the ~9 files or directories an inventory reads.
 *
 * This exists because without it every empty section has two causes and the
 * user cannot tell them apart — the failure `FileResult`'s `missing` arm
 * exists to prevent, one level up. "No skills" because `~/.claude/skills` was
 * read and was empty is a different sentence from "no skills" because it could
 * not be opened, and only one of them means the user should go and look.
 *
 * `absent` is the ORDINARY case and must warn nothing: most cwds have no
 * `.claude` at all, which is prompts.ts's stated reason for returning `[]`.
 */
export interface SourceRead {
  path: string
  scope: ToolScope
  what:
    | 'skills'
    | 'commands'
    | 'agents'
    | 'settings'
    | 'settings-local'
    | 'mcp-json'
    | 'claude-json'
  status: 'read' | 'absent' | 'too-large' | 'malformed' | 'unreadable'
  /** `too-large` only. */
  bytes?: number
  cap?: number
  /** `unreadable` only — an errno, never a stringified file body. */
  detail?: string
}

/**
 * Permission rule COUNTS, per file, never merged across files.
 *
 * This app cannot verify whether the CLI unions allow-lists across the three
 * settings files or takes the highest-precedence one, so a single "effective"
 * list would be a confident answer to a question nothing here can settle. Per
 * file, attributed, always — which also happens to solve the size problem:
 * nothing is merged, so nothing is deduped, which is prompts.ts's rule anyway.
 *
 * The rules THEMSELVES ride a second, explicitly-requested invoke. Measured
 * 2026-08-30: 628 rules in one file and 718 in another, two orders of
 * magnitude more than every other kind combined — roughly 240 KB per panel per
 * read for data almost nobody expands. That is `review:diff`'s exact shape
 * ("one file's hunks, pull-only, one file at a time").
 */
export interface PermissionCounts {
  path: string
  scope: ToolScope
  allow: number
  deny: number
  ask: number
  additionalDirectories: number
}

/**
 * Toggles naming things this app cannot see.
 *
 * Measured, not hypothetical: `disabledMcpServers` names `claude.ai Higgsfield`,
 * which appears in no `mcpServers` map on this machine, and 26 `skillOverrides`
 * key on namespaced plugin ids like `paul:add-phase` that no filesystem skill
 * directory yields.
 *
 * Reported as NAMES rather than dropped, and never invented as entries with a
 * fabricated `sourcePath`: "6 skills are turned off that this app did not read"
 * is true and actionable; a row pointing at a file that does not exist is not.
 */
export interface UnresolvedToggles {
  skillOverridesOff: string[]
  mcpEnabled: string[]
  mcpDisabled: string[]
}

export interface ToolOverflow {
  skills: number
  commands: number
  agents: number
  mcp: number
  hooks: number
  /** Entries dropped by ENTRIES_MAX after every per-kind cap was satisfied. */
  total: number
}

/**
 * Whether disk has moved since this panel's agent started.
 *
 * THREE arms, not a boolean, and the third is genuinely reachable rather than
 * defensive — RepoAnswer's rule again.
 *
 * The WORDING is the design. `stale` says "config on disk has changed since
 * this panel started", never "this agent is missing skill X". Two reasons it
 * must not say the stronger thing: an mtime bump with no semantic change (a
 * formatter, an editor's save-on-focus-loss) would report stale when nothing
 * moved, and some config genuinely IS re-read mid-session. A fact about FILES
 * is defensible; a claim about a running process is not, and the backlog's own
 * constraint is that a UI which silently fails to apply something is worse
 * than no UI.
 */
export type ConfigFreshness =
  /** Nothing under this cwd's config sources has changed since the agent started. */
  | { kind: 'fresh' }
  /** A config file this panel's agent reads has been WRITTEN since it started. */
  | { kind: 'stale'; changedPaths: string[]; since: number }
  /**
   * No spawn stamp to compare against. Reachable two ordinary ways: this panel
   * has never spawned, or it reattached to a tmux session after a full app
   * relaunch, where the in-memory stamp is empty by construction — the same
   * limitation `firstSpawnedAt` already records for `chooseSession`.
   */
  | { kind: 'unknown' }

export interface ToolInventory {
  /** The cwd this answers for, already `~`-expanded. Panels in one repo share one. */
  cwd: string
  /**
   * When main actually read disk. Rendered, never hidden.
   *
   * This is what makes a pull-model node HONEST rather than merely stale: the
   * same discipline that makes M17's dollar figure name whose price it is.
   */
  readAt: number
  entries: ToolEntry[]
  permissions: PermissionCounts[]
  sources: SourceRead[]
  /** Ids of enabled plugins — the one cheap plugin fact. */
  pluginsEnabled: string[]
  pluginsDisabledCount: number
  unresolved: UnresolvedToggles
  overflow: ToolOverflow
  freshness: ConfigFreshness
}

/**
 * The result. NEVER throws, and there is deliberately no `unreadable` arm at
 * this level: a per-source failure is a `SourceRead`, so the inventory always
 * answers with whatever it did manage to read. That is the opposite of
 * `readFile`'s shape, on purpose — `readFile` has one input and this has nine.
 *
 * `no-cwd` is not a degenerate inventory. A review node, a file panel and a
 * Jira panel have no directory at all, and the section must render NOTHING for
 * them — `buildUsageFields`' `hidden` arm, for its stated reason: "0 skills"
 * beside a panel that is not an agent is the confident wrong answer that
 * trains a user to stop believing the section.
 */
export type ToolInventoryResult =
  | { kind: 'inventory'; inventory: ToolInventory }
  | { kind: 'no-cwd' }

/* ------------------------------------------------------------------ caps --
 * One rule, from file-panel.ts's two-cap comment: BYTES REFUSE, COUNTS
 * TRUNCATE AND REPORT, STRINGS TRUNCATE AND FLAG. A partial parse of a config
 * file is a different config file, so nothing here truncates a byte stream.
 */

/**
 * `settings.json`, `settings.local.json`, `.mcp.json`, per scope.
 *
 * **Measured 2026-08-30: `~/.claude/settings.json` is 64,152 bytes.**
 * `MAX_PROMPT_BYTES` is 65,536, so copying prompts.ts's cap would put the
 * single most important file in this feature 1,384 bytes from being refused —
 * and the refusal would look exactly like "you have no hooks and no
 * permissions". This is the one cap in the repo that must NOT be inherited.
 */
export const SETTINGS_MAX_BYTES = 1 * 1024 * 1024

/**
 * `~/.claude.json`. Measured 93,611 bytes, and it grows with project count and
 * feature caches.
 *
 * Larger than FILE_MAX_BYTES (2 MB) on purpose: that cap bounds a file the
 * user pointed at and can choose differently, while this one is unavoidable —
 * there is nowhere else MCP config lives — so refusing costs the entire MCP
 * section rather than one panel.
 */
export const CLAUDE_JSON_MAX_BYTES = 8 * 1024 * 1024

/**
 * Per `SKILL.md` / command `.md` / agent `.md`. A HEAD read, never a
 * whole-file read: the inventory needs the frontmatter and nothing else,
 * unlike prompts.ts, which reads whole bodies because the palette pastes them.
 */
export const MARKDOWN_HEAD_BYTES = 16 * 1024

/**
 * The `---`…`---` block inside that head. Frontmatter longer than this yields
 * `description: ''` — a surprise costs a FIELD here rather than the entry,
 * because the directory's existence is already an established fact.
 */
export const FRONTMATTER_MAX_BYTES = 8 * 1024

export const SKILLS_MAX = 200
export const COMMANDS_MAX = 200
export const COMMAND_NAMESPACES_MAX = 32
export const AGENTS_MAX = 100
export const MCP_MAX = 100
export const MCP_ENV_KEYS_MAX = 32
export const HOOKS_MAX = 200
export const PLUGINS_MAX = 200
export const UNRESOLVED_MAX = 100

/**
 * The global backstop. Every per-kind cap can be individually satisfied and
 * still sum to thousands across three scopes, so this is the one number that
 * cannot be routed around — `SUBAGENT_CAP`'s role, at a larger scale.
 */
export const ENTRIES_MAX = 600

/**
 * Declared HERE and deliberately not imported from subagent-scan.ts, even
 * though both are 200: two readers of two formats this repo does not own,
 * sharing one constant, means a change forced by one format silently retunes
 * the other — the coupling `FileResult`'s own header refused against
 * `ReviewResult`.
 *
 * Measured longest description on this machine: 952 chars. Truncation here is
 * real rather than theoretical, which is why it is flagged.
 */
export const TOOL_DESCRIPTION_MAX = 200
export const TOOL_NAME_MAX = 120
export const HOOK_MATCHER_CHARS = 80
export const HOOK_PROGRAM_CHARS = 120
export const PERMISSION_RULE_CHARS = 200
export const PERMISSION_RULES_MAX = 400
/** review-engine.ts's number, for review-engine.ts's reason. */
export const DETAIL_MAX = 200
