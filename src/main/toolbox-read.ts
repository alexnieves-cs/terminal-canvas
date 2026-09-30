/**
 * The real-filesystem half of the agent toolbox.
 *
 * Imports node:fs and stays in the plain-node verify tier for the same reason
 * main/prompts.ts does: it is `electron` and `node-pty` that move a module out
 * of that tier, not the filesystem. The cwd and the home directory both arrive
 * ALREADY EXPANDED — resolving `~` is main's job, the split prompts.ts's own
 * header states.
 *
 * `home` is a parameter rather than a `homedir()` call, and not for
 * testability alone: a suite that read the running developer's real
 * `~/.claude` would depend on state this repo does not own, which is the rule
 * M9a's git fence and M15's projects-root fence each cost a fix round to
 * learn. Making it a parameter means the fence cannot be forgotten.
 *
 * Nothing here throws. A per-source failure is a `SourceRead`, so an inventory
 * always answers with whatever it did manage to read — the opposite of
 * readFile's single-result shape, deliberately, because readFile has one input
 * and this has nine.
 */

import { readdirSync, readFileSync, statSync, openSync, readSync, closeSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PluginRecord } from './plugin-list'
import { isHomeDir } from './home-dir'
import {
  AGENTS_MAX,
  CLAUDE_JSON_MAX_BYTES,
  COMMAND_NAMESPACES_MAX,
  COMMANDS_MAX,
  ENTRIES_MAX,
  MARKDOWN_HEAD_BYTES,
  MCP_MAX,
  PLUGINS_MAX,
  RESOURCES_MAX,
  SETTINGS_MAX_BYTES,
  SKILLS_MAX,
  TOOL_NAME_MAX,
  UNRESOLVED_MAX,
  type ConfigFreshness,
  type McpToolEntry,
  type NamedToolEntry,
  type PermissionCounts,
  type SkillResources,
  type SourceRead,
  type ToolActive,
  type ToolEntry,
  type ToolInventory,
  type ToolInventoryResult,
  type ToolOverflow,
  type ToolScope,
  type UnresolvedToggles
} from '../shared/toolbox'
import {
  capDescription,
  commandName,
  countHooks,
  entryId,
  errDetail,
  mcpDirectActive,
  mcpJsonActive,
  parseEnabledPlugins,
  parseFrontmatter,
  parseHooks,
  parsePermissionCounts,
  parsePermissionRules,
  projectMcpServer,
  readClaudeJson,
  skillOverrideOff,
  unresolvableOverrides
} from './toolbox-scan'

/* --------------------------------------------------------- primitives -- */

/**
 * The first `max` bytes of a file, never the whole thing.
 *
 * A HEAD read, unlike prompts.ts's whole-file read, because the inventory
 * needs the frontmatter and nothing else — prompts.ts reads bodies because the
 * palette pastes them. The same `readHead` shape subagent-watch.ts already
 * established for a file whose size is not this app's to bound.
 */
function readHead(path: string, max: number): string | null {
  let fd: number | undefined
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.allocUnsafe(max)
    const n = readSync(fd, buf, 0, max, 0)
    return buf.subarray(0, n).toString('utf8')
  } catch {
    return null
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // The read has already answered; a failed close cannot un-answer it.
      }
    }
  }
}

interface JsonRead {
  status: SourceRead['status']
  value: unknown
  bytes?: number
  detail?: string
}

/**
 * A capped JSON read. BYTES REFUSE — a partial parse of a config file is a
 * different config file, so nothing here truncates a byte stream.
 */
function readJsonCapped(path: string, cap: number): JsonRead {
  let bytes: number
  try {
    const st = statSync(path)
    if (!st.isFile()) return { status: 'unreadable', value: null, detail: 'not a regular file' }
    bytes = st.size
  } catch (error) {
    const code = errDetail(error)
    // Absent is the ORDINARY case and must warn nothing: most cwds have no
    // .claude at all — prompts.ts's stated reason for returning [].
    if (code === 'ENOENT') return { status: 'absent', value: null }
    return { status: 'unreadable', value: null, detail: code }
  }
  if (bytes > cap) return { status: 'too-large', value: null, bytes }
  try {
    return { status: 'read', value: JSON.parse(readFileSync(path, 'utf8')) as unknown, bytes }
  } catch (error) {
    // Another program writes these files while this one reads them, so
    // catching one mid-write is ordinary rather than exotic.
    return { status: 'malformed', value: null, bytes, detail: errDetail(error) }
  }
}

function listDir(path: string): { status: SourceRead['status']; names: string[]; detail?: string } {
  try {
    return { status: 'read', names: readdirSync(path).sort() }
  } catch (error) {
    const code = errDetail(error)
    if (code === 'ENOENT' || code === 'ENOTDIR') return { status: 'absent', names: [] }
    return { status: 'unreadable', names: [], detail: code }
  }
}

/**
 * Files beside SKILL.md, counted at the boundary and capped.
 *
 * Recurses one level only — deep enough for `references/foo.md`, shallow
 * enough that a skill that vendored a node_modules cannot turn a pane read
 * into a filesystem crawl. A depth this app cannot bound is a hang, not a
 * slow read.
 */
function countResources(skillDir: string): SkillResources {
  const listed = listDir(skillDir)
  if (listed.status !== 'read') return { kind: 'unknown', why: listed.detail ?? 'could not list' }
  let n = 0
  for (const entry of listed.names) {
    if (entry === 'SKILL.md') continue
    if (n >= RESOURCES_MAX) break
    const child = join(skillDir, entry)
    const sub = listDir(child)
    // A directory contributes its children; an unreadable one contributes
    // itself, so the count never silently shrinks.
    n += sub.status === 'read' ? Math.min(sub.names.length, RESOURCES_MAX - n) : 1
  }
  if (n === 0) return { kind: 'none' }
  return { kind: 'some', n: Math.min(n, RESOURCES_MAX) }
}

/* ------------------------------------------------------------ readers -- */

function readNamed(
  path: string,
  kind: 'skill' | 'command' | 'agent',
  name: string,
  scope: ToolScope,
  active: ToolActive,
  pluginId?: string
): NamedToolEntry | null {
  const head = readHead(path, MARKDOWN_HEAD_BYTES)
  if (head === null) return null
  const fm = parseFrontmatter(head)
  // The FILE's own name wins over a frontmatter `name` for skills and
  // commands: the directory or filename is what the CLI resolves, so a
  // frontmatter name that disagreed would put a row on screen naming something
  // the user cannot invoke.
  const { description, descriptionTruncated } = capDescription(fm.description)
  return {
    id: entryId([kind, scope, path]),
    kind,
    scope,
    sourcePath: path,
    active,
    alsoDefinedIn: [],
    name: name.slice(0, TOOL_NAME_MAX),
    description,
    descriptionTruncated,
    // Absent unless set — never `pluginId: undefined` on a spread, the rule
    // this module's own header states for every optional field.
    ...(pluginId !== undefined ? { pluginId } : {})
  }
}

/**
 * The running count of skills already accepted across every source read so
 * far this call — user, project, and every enabled plugin. `SKILLS_MAX` is
 * the TOTAL, not a per-source allowance, so this is threaded through rather
 * than each call starting its own `out.length` back at zero: three scopes
 * plus thirteen plugins must not multiply the cap.
 */
interface SkillBudget {
  used: number
}

function readSkills(
  root: string,
  scope: ToolScope,
  overrides: unknown,
  overrideSource: string,
  sources: SourceRead[],
  overflow: ToolOverflow,
  budget: SkillBudget,
  pluginId?: string
): NamedToolEntry[] {
  const dir = join(root, 'skills')
  const listed = listDir(dir)
  sources.push({ path: dir, scope, what: 'skills', status: listed.status, detail: listed.detail })
  const out: NamedToolEntry[] = []
  for (const name of listed.names) {
    if (budget.used >= SKILLS_MAX) {
      overflow.skills += 1
      continue
    }
    const file = join(dir, name, 'SKILL.md')
    const off = skillOverrideOff(name, overrides)
    const entry = readNamed(
      file,
      'skill',
      name,
      scope,
      off ? { kind: 'disabled', by: overrideSource } : { kind: 'active' },
      pluginId
    )
    // One unreadable skill costs that skill — parseLayout's individual-drop
    // rule, which this whole module inherits.
    if (entry !== null) {
      entry.resources = countResources(join(dir, name))
      out.push(entry)
      budget.used += 1
    }
  }
  return out
}

function readCommands(
  root: string,
  scope: ToolScope,
  sources: SourceRead[],
  overflow: ToolOverflow
): NamedToolEntry[] {
  const dir = join(root, 'commands')
  const listed = listDir(dir)
  sources.push({ path: dir, scope, what: 'commands', status: listed.status, detail: listed.detail })
  const out: NamedToolEntry[] = []
  let namespaces = 0
  for (const entryName of listed.names) {
    if (out.length >= COMMANDS_MAX) {
      overflow.commands += 1
      continue
    }
    const full = join(dir, entryName)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (!isDir) {
      const name = commandName([entryName])
      if (name === null) continue
      const e = readNamed(full, 'command', name, scope, { kind: 'active' })
      if (e !== null) out.push(e)
      continue
    }
    // TWO levels, never recursive. prompts.ts's one-level rule would miss 27
    // of this machine's 28 user commands; an unbounded walk over a directory
    // this app does not control is the promise nobody here has made.
    if (namespaces >= COMMAND_NAMESPACES_MAX) {
      overflow.commands += 1
      continue
    }
    namespaces += 1
    const inner = listDir(full)
    for (const leaf of inner.names) {
      if (out.length >= COMMANDS_MAX) {
        overflow.commands += 1
        continue
      }
      const name = commandName([entryName, leaf])
      if (name === null) continue
      const e = readNamed(join(full, leaf), 'command', name, scope, { kind: 'active' })
      if (e !== null) out.push(e)
    }
  }
  return out
}

function readAgents(
  root: string,
  scope: ToolScope,
  sources: SourceRead[],
  overflow: ToolOverflow
): NamedToolEntry[] {
  const dir = join(root, 'agents')
  const listed = listDir(dir)
  sources.push({ path: dir, scope, what: 'agents', status: listed.status, detail: listed.detail })
  const out: NamedToolEntry[] = []
  for (const leaf of listed.names) {
    if (out.length >= AGENTS_MAX) {
      overflow.agents += 1
      continue
    }
    if (!leaf.endsWith('.md')) continue
    const e = readNamed(join(dir, leaf), 'agent', leaf.slice(0, -3), scope, { kind: 'active' })
    if (e !== null) out.push(e)
  }
  return out
}

/* ------------------------------------------------------------- paths -- */

/**
 * The home directory the toolbox reads from.
 *
 * `TC_TOOLBOX_HOME` is a fence with no UI, the same shape `TC_CLAUDE_PROJECTS`
 * and `TC_TMUX_SOCKET` already are, and it exists for the reason M15's own
 * fence had to be moved to module scope: without it every verify suite that
 * spawns a panel reads the RUNNING DEVELOPER's real `~/.claude`, attributes
 * whatever it finds to a fixture panel, and fails for a reason nothing in the
 * suite explains — on a machine with a populated home and nowhere else.
 *
 * A blank or whitespace value falls back to the real home, the `TC_TMUX_SOCKET=`
 * trap `resolveSocket` already documents.
 */
export function resolveToolboxHome(): string {
  const override = process.env.TC_TOOLBOX_HOME
  return override !== undefined && override.trim() !== '' ? override : homedir()
}

/**
 * M398 (A2). The directory a toolbox read treats as the panel's `cwd`, with
 * `~` meaning the TOOLBOX home rather than the process's.
 *
 * `resolveToolboxHome` fenced only the USER arm. An agent whose cwd is home
 * (every `~` preset, and the starter's chat) reads its PROJECT arm from
 * `join(cwd, '.claude')`, which is home's `.claude` again, and under a fence
 * that was the real one: the `starter` golden printed the developer's own
 * skills, hooks and "628 allow" rules, the leak the fence was written to stop,
 * through the arm it did not cover. So `~`, `~/…` and the real home itself all
 * land on the toolbox home. Unfenced (production) the toolbox home IS the real
 * home and every answer here is `expandTilde`'s, unchanged. A folder UNDER the
 * real home is left alone: it is a real project, and no harness scene sits in
 * one.
 */
export function toolboxCwd(cwd: string, home: string, realHome: string = homedir()): string {
  if (cwd === '~' || cwd === '~/') return home
  if (cwd.startsWith('~/')) return join(home, cwd.slice(2))
  // Every other spelling of the real home lands on the toolbox home too: a
  // symlink to it, a case variant (darwin) and `/.` or `..` segments each
  // walked past the first draft's string compare and read the real
  // `~/.claude` under a fence. See isHomeDir (home-dir.ts). The cwd is
  // realpath'd here, once per read, because a link TO home is a spelling
  // isHomeDir does not resolve on its own.
  if (isHomeDir(cwd, realHome)) return home
  try {
    if (isHomeDir(realpathSync(cwd), realHome)) return home
  } catch {
    // A missing directory is not home; the door says it is gone.
  }
  return cwd
}

export interface ToolboxPaths {
  userRoot: string
  projectRoot: string
  claudeJson: string
  userSettings: string
  projectSettings: string
  projectSettingsLocal: string
  projectMcpJson: string
}

export function toolboxPaths(cwd: string, home: string): ToolboxPaths {
  const userRoot = join(home, '.claude')
  const projectRoot = join(cwd, '.claude')
  return {
    userRoot,
    projectRoot,
    claudeJson: join(home, '.claude.json'),
    userSettings: join(userRoot, 'settings.json'),
    projectSettings: join(projectRoot, 'settings.json'),
    projectSettingsLocal: join(projectRoot, 'settings.local.json'),
    projectMcpJson: join(cwd, '.mcp.json')
  }
}

/**
 * The stat vector the cache validates against and `freshness` compares.
 *
 * BOTH the parent directories AND the individual files, and the second half is
 * the subtle one: a directory's mtime does NOT change when a file inside a
 * subdirectory changes, so editing `~/.claude/skills/foo/SKILL.md` leaves
 * `~/.claude/skills` untouched. Stamping only the directories yields a cache
 * that is correct for every ADDED skill and permanently stale for every EDITED
 * one, with nothing on screen wrong.
 */
export function configStamps(cwd: string, home: string): Map<string, string> {
  const paths = toolboxPaths(cwd, home)
  const stamps = new Map<string, string>()
  const stamp = (path: string): void => {
    try {
      const st = statSync(path)
      stamps.set(path, `${st.mtimeMs}:${st.size}`)
    } catch {
      // An absent source is stamped too: its APPEARANCE must invalidate the
      // cache, so absent and present have to be distinguishable values rather
      // than a present key and a missing one.
      stamps.set(path, 'absent')
    }
  }
  for (const path of [
    paths.claudeJson,
    paths.userSettings,
    paths.projectSettings,
    paths.projectSettingsLocal,
    paths.projectMcpJson
  ]) {
    stamp(path)
  }
  for (const root of [paths.userRoot, paths.projectRoot]) {
    for (const sub of ['skills', 'commands', 'agents']) {
      const dir = join(root, sub)
      stamp(dir)
      const listed = listDir(dir)
      for (const name of listed.names.slice(0, SKILLS_MAX)) {
        const child = join(dir, name)
        stamp(child)
        // One level further for skills, because a skill's CONTENT lives in
        // SKILL.md and its directory's mtime does not move when that file is
        // edited — which is this function's whole reason for existing.
        if (sub === 'skills') stamp(join(child, 'SKILL.md'))
      }
    }
  }
  return stamps
}

export function stampsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) if (b.get(key) !== value) return false
  return true
}

/** Which stamped paths differ. Names `changedPaths` on a `stale` freshness. */
export function changedSince(before: Map<string, string>, now: Map<string, string>): string[] {
  const changed: string[] = []
  for (const [key, value] of now) if (before.get(key) !== value) changed.push(key)
  for (const key of before.keys()) if (!now.has(key)) changed.push(key)
  return [...new Set(changed)].sort()
}

/* ----------------------------------------------------------- the read -- */

export interface ReadToolboxInput {
  cwd: string
  home: string
  /**
   * The stat vector taken when this panel's agent SPAWNED, when anything knows
   * one. Absent yields `{ kind: 'unknown' }` rather than a guess — see
   * ConfigFreshness for the two ordinary ways that happens.
   */
  spawnStamps?: Map<string, string> | undefined
  /**
   * M126. The enabled plugins, as `listPlugins` (main's own caller) answered
   * — this module never spawns the CLI itself. Absent reads exactly as
   * before this milestone: no plugin skills, same as `[]`.
   */
  plugins?: PluginRecord[] | undefined
}

export function readToolbox(input: ReadToolboxInput): ToolInventoryResult {
  const { cwd, home } = input
  if (cwd === '') return { kind: 'no-cwd' }
  const paths = toolboxPaths(cwd, home)

  const sources: SourceRead[] = []
  const overflow: ToolOverflow = { skills: 0, commands: 0, agents: 0, mcp: 0, hooks: 0, total: 0 }

  const pushJson = (
    path: string,
    scope: ToolScope,
    what: SourceRead['what'],
    cap: number
  ): unknown => {
    const read = readJsonCapped(path, cap)
    sources.push({
      path,
      scope,
      what,
      status: read.status,
      ...(read.status === 'too-large' ? { bytes: read.bytes, cap } : {}),
      ...(read.detail !== undefined ? { detail: read.detail } : {})
    })
    return read.value
  }

  const userSettings = pushJson(paths.userSettings, 'user', 'settings', SETTINGS_MAX_BYTES)
  const projSettings = pushJson(paths.projectSettings, 'project', 'settings', SETTINGS_MAX_BYTES)
  const projLocal = pushJson(
    paths.projectSettingsLocal,
    'project',
    'settings-local',
    SETTINGS_MAX_BYTES
  )
  const mcpJson = pushJson(paths.projectMcpJson, 'project', 'mcp-json', SETTINGS_MAX_BYTES)

  const claudeJsonRead = readJsonCapped(paths.claudeJson, CLAUDE_JSON_MAX_BYTES)
  sources.push({
    path: paths.claudeJson,
    scope: 'user',
    what: 'claude-json',
    status: claudeJsonRead.status,
    ...(claudeJsonRead.status === 'too-large'
      ? { bytes: claudeJsonRead.bytes, cap: CLAUDE_JSON_MAX_BYTES }
      : {}),
    ...(claudeJsonRead.detail !== undefined ? { detail: claudeJsonRead.detail } : {})
  })
  const claude = readClaudeJson(claudeJsonRead.value, cwd)

  // Every MCP gate lives in ~/.claude.json. Without it, `active` would be a
  // guess wearing a fact's clothes — parseMeta's "a surprise costs a node"
  // applied one level down, to the FIELD rather than the row, because the
  // row's existence is still perfectly well known.
  const gatesUnknown = claudeJsonRead.status !== 'read' && claudeJsonRead.status !== 'absent'

  /* ---- skills, commands, agents ---- */

  const overridesOf = (settings: unknown): unknown =>
    typeof settings === 'object' && settings !== null
      ? (settings as Record<string, unknown>).skillOverrides
      : undefined

  // Project-local beats project, which beats user — the merge order this app
  // READS but does not own. What it deliberately never does is compute an
  // "effective" merged config; see `permissions` below for why.
  const localOverrides = overridesOf(projLocal)
  const projectOverrides = localOverrides ?? overridesOf(projSettings)
  const projectOverrideSource =
    localOverrides !== undefined ? paths.projectSettingsLocal : paths.projectSettings

  // Shared across user, project AND every enabled plugin — SKILLS_MAX is the
  // total, never a per-source allowance (see SkillBudget's own comment).
  const skillBudget: SkillBudget = { used: 0 }

  const entries: ToolEntry[] = []
  entries.push(
    ...readSkills(
      paths.userRoot,
      'user',
      overridesOf(userSettings),
      paths.userSettings,
      sources,
      overflow,
      skillBudget
    )
  )
  entries.push(...readCommands(paths.userRoot, 'user', sources, overflow))
  entries.push(...readAgents(paths.userRoot, 'user', sources, overflow))
  entries.push(
    ...readSkills(
      paths.projectRoot,
      'project',
      projectOverrides,
      projectOverrideSource,
      sources,
      overflow,
      skillBudget
    )
  )
  entries.push(...readCommands(paths.projectRoot, 'project', sources, overflow))
  entries.push(...readAgents(paths.projectRoot, 'project', sources, overflow))

  /* ---- M126: each enabled plugin's own skills, bounded to its installPath -- */
  for (const plugin of input.plugins ?? []) {
    entries.push(
      ...readSkills(
        plugin.installPath,
        'user',
        undefined,
        paths.userSettings,
        sources,
        overflow,
        skillBudget,
        plugin.id
      )
    )
  }

  /* ---- mcp: three sources, two independent gate pairs ---- */

  const mcp: McpToolEntry[] = []
  const addServers = (
    map: Record<string, unknown>,
    scope: ToolScope,
    sourcePath: string,
    resolve: (name: string) => ToolActive
  ): void => {
    for (const name of Object.keys(map).sort()) {
      if (mcp.length >= MCP_MAX) {
        overflow.mcp += 1
        continue
      }
      const active: ToolActive = gatesUnknown
        ? { kind: 'unknown', why: 'settings-unreadable' }
        : resolve(name)
      const entry = projectMcpServer(name, map[name], scope, sourcePath, active)
      if (entry !== null) mcp.push(entry)
    }
  }

  addServers(claude.userServers, 'user', paths.claudeJson, (name) =>
    mcpDirectActive(name, claude.enabledMcp, claude.disabledMcp, paths.claudeJson)
  )
  addServers(claude.localServers, 'local', paths.claudeJson, (name) =>
    mcpDirectActive(name, claude.enabledMcp, claude.disabledMcp, paths.claudeJson)
  )

  const mcpJsonRecord =
    typeof mcpJson === 'object' && mcpJson !== null
      ? (mcpJson as Record<string, unknown>)
      : {}
  const mcpJsonServers =
    typeof mcpJsonRecord.mcpServers === 'object' && mcpJsonRecord.mcpServers !== null
      ? (mcpJsonRecord.mcpServers as Record<string, unknown>)
      : {}
  addServers(mcpJsonServers, 'project', paths.projectMcpJson, (name) =>
    mcpJsonActive(name, claude.enabledMcpjson, claude.disabledMcpjson, paths.claudeJson)
  )
  entries.push(...mcp)

  /* ---- hooks ---- */

  const hookSources = [
    [userSettings, 'user', paths.userSettings],
    [projSettings, 'project', paths.projectSettings],
    [projLocal, 'project', paths.projectSettingsLocal]
  ] as const
  for (const [settings, scope, path] of hookSources) {
    const read = parseHooks(settings, scope, path)
    // The overflow is the difference against a COUNT of what is configured,
    // never against the returned array's own length — a list that silently
    // stops is indistinguishable from a file that configured fewer hooks,
    // which is REVIEW_FILE_CAP's `+N more` rule applied to a second reader.
    overflow.hooks += Math.max(0, countHooks(settings) - read.length)
    entries.push(...read)
  }

  /* ---- alsoDefinedIn ---- */

  // Reports the LINKS, never a shadowing claim: this app cannot verify how the
  // CLI resolves a project skill named the same as a user skill, and asserting
  // a winner would mark a row inactive for an agent that can in fact use it.
  const byName = new Map<string, Set<ToolScope>>()
  for (const entry of entries) {
    if (entry.kind === 'hook') continue
    const key = `${entry.kind} ${entry.name}`
    const set = byName.get(key) ?? new Set<ToolScope>()
    set.add(entry.scope)
    byName.set(key, set)
  }
  for (const entry of entries) {
    if (entry.kind === 'hook') continue
    const set = byName.get(`${entry.kind} ${entry.name}`)
    if (set === undefined) continue
    entry.alsoDefinedIn = [...set].filter((scope) => scope !== entry.scope).sort()
  }

  /* ---- the global backstop ---- */

  // Every per-kind cap can be individually satisfied and still sum to
  // thousands across three scopes, so this is the one number nothing routes
  // around — SUBAGENT_CAP's role, at a larger scale.
  if (entries.length > ENTRIES_MAX) {
    overflow.total = entries.length - ENTRIES_MAX
    entries.length = ENTRIES_MAX
  }

  /* ---- permissions, plugins, unresolved ---- */

  const permissions: PermissionCounts[] = []
  for (const [settings, scope, path] of hookSources) {
    const counts = parsePermissionCounts(settings, scope, path)
    if (counts !== null) permissions.push(counts)
  }

  const plugins = parseEnabledPlugins(userSettings)

  const knownMcpNames = new Set(mcp.map((server) => server.name))
  const unresolved: UnresolvedToggles = {
    skillOverridesOff: [
      ...unresolvableOverrides(overridesOf(userSettings)),
      ...unresolvableOverrides(projectOverrides)
    ].slice(0, UNRESOLVED_MAX),
    // A name in a toggle list matching nothing this app read is reported as a
    // NAME, never invented as an entry with a fabricated sourcePath: "6 skills
    // are turned off that this app did not read" is true and actionable; a row
    // pointing at a file that does not exist is not.
    mcpEnabled: [...claude.enabledMcp, ...claude.enabledMcpjson]
      .filter((name) => !knownMcpNames.has(name))
      .slice(0, UNRESOLVED_MAX),
    mcpDisabled: [...claude.disabledMcp, ...claude.disabledMcpjson]
      .filter((name) => !knownMcpNames.has(name))
      .slice(0, UNRESOLVED_MAX)
  }

  /* ---- freshness ---- */

  let freshness: ConfigFreshness = { kind: 'unknown' }
  if (input.spawnStamps !== undefined) {
    const changed = changedSince(input.spawnStamps, configStamps(cwd, home))
    freshness =
      changed.length === 0
        ? { kind: 'fresh' }
        : { kind: 'stale', changedPaths: changed.slice(0, UNRESOLVED_MAX), since: Date.now() }
  }

  const inventory: ToolInventory = {
    cwd,
    readAt: Date.now(),
    entries,
    permissions,
    sources,
    pluginsEnabled: plugins.enabled.slice(0, PLUGINS_MAX),
    pluginsDisabledCount: plugins.disabledCount,
    unresolved,
    overflow,
    freshness
  }
  return { kind: 'inventory', inventory }
}

/**
 * One settings file's permission RULES, for the second, explicitly-requested
 * invoke. `review:diff`'s shape — pull-only, one file at a time — and the
 * reason is a measurement: 628 rules in one file and 718 in another, roughly
 * 240 KB per panel per read for data almost nobody expands.
 */
export function readPermissionRules(
  path: string,
  bucket: 'allow' | 'deny' | 'ask'
): { rules: string[]; total: number; status: SourceRead['status'] } {
  const read = readJsonCapped(path, SETTINGS_MAX_BYTES)
  if (read.status !== 'read') return { rules: [], total: 0, status: read.status }
  return { ...parsePermissionRules(read.value, bucket), status: 'read' }
}
