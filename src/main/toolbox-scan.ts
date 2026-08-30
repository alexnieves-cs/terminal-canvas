/**
 * The pure half of the agent toolbox: no fs, no electron, no node-pty, which
 * is what puts it in the plain-node verify tier beside git-args.ts and
 * subagent-scan.ts.
 *
 * Everything here parses a format this repo does not own and cannot version.
 * The rule throughout is therefore subagent-scan.ts's: **a surprise costs an
 * ENTRY, never a throw** — and every cap is applied at THIS boundary rather
 * than at render time, so every consumer inherits the bound instead of the one
 * that remembered it.
 *
 * The projection rules live here too, and they are the reason this file exists
 * as a separate module at all: `toolbox-read.ts` decides WHICH files to open,
 * this decides WHAT is allowed out of them, and only the second question has a
 * security answer. See `projectMcpServer` and `hookProgram`.
 */

import {
  DETAIL_MAX,
  FRONTMATTER_MAX_BYTES,
  HOOK_MATCHER_CHARS,
  HOOK_PROGRAM_CHARS,
  HOOKS_MAX,
  MCP_ENV_KEYS_MAX,
  PERMISSION_RULE_CHARS,
  TOOL_DESCRIPTION_MAX,
  TOOL_NAME_MAX,
  type HookToolEntry,
  type McpToolEntry,
  type McpTransport,
  type PermissionCounts,
  type ToolActive,
  type ToolScope
} from '../shared/toolbox'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isStr(v: unknown): v is string {
  return typeof v === 'string'
}

/** Every id in this module is a stringified coordinate. See ToolEntryBase.id. */
export function entryId(parts: readonly (string | number)[]): string {
  return JSON.stringify(parts)
}

/* --------------------------------------------------------- frontmatter -- */

export interface Frontmatter {
  name: string | null
  description: string | null
}

/**
 * The `---` block at the top of a SKILL.md / command / agent file.
 *
 * HAND-ROLLED, and that is a decision rather than laziness: `dependencies` is
 * `{"node-pty": "1.1.0"}` and file-watch.ts already recorded this repo's
 * refusal to add a second runtime dependency. A real YAML parser would also
 * introduce a PARSER DIFFERENTIAL — this app rendering what `yaml` says while
 * the CLI renders what its own parser says — which is a worse failure than not
 * reading a field, because it is invisible.
 *
 * So the grammar is deliberately small: a `key: value` line, optionally
 * single- or double-quoted. Anything it does not understand (block scalars,
 * anchors, multi-line folds) yields `null` rather than a guess, and the caller
 * turns that into `''`. Measured on this machine, every real description is a
 * single line, sometimes double-quoted.
 */
export function parseFrontmatter(head: string): Frontmatter {
  const empty: Frontmatter = { name: null, description: null }
  if (!head.startsWith('---')) return empty
  // The opening fence must be its own line, or `---foo` at the top of a plain
  // markdown file would open a block that never closes and swallow the file.
  const afterOpen = head.indexOf('\n')
  if (afterOpen === -1) return empty
  if (head.slice(0, afterOpen).trim() !== '---') return empty

  const close = head.indexOf('\n---', afterOpen)
  if (close === -1) return empty
  const body = head.slice(afterOpen + 1, close)
  // Bounded before it is walked: the head read is already capped, but a
  // pathological single-line frontmatter inside it is still unbounded work.
  if (body.length > FRONTMATTER_MAX_BYTES) return empty

  const out: Frontmatter = { name: null, description: null }
  for (const line of body.split('\n')) {
    // A nested mapping (`  key: v`) belongs to something this parser does not
    // model, so an indented line is skipped rather than read as top-level.
    if (line.startsWith(' ') || line.startsWith('\t') || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    if (key !== 'name' && key !== 'description') continue
    let value = line.slice(colon + 1).trim()
    // A block scalar is a promise about the NEXT lines, which this parser does
    // not read — answering `''` is the honest outcome, never the indicator.
    if (value === '>' || value === '|' || value === '>-' || value === '|-') continue
    if (value.length >= 2) {
      const q = value[0]
      if ((q === '"' || q === "'") && value.endsWith(q)) value = value.slice(1, -1)
    }
    if (value === '') continue
    if (key === 'name') out.name = value.slice(0, TOOL_NAME_MAX)
    else out.description = value
  }
  return out
}

/** Applies TOOL_DESCRIPTION_MAX and reports whether it actually cut. */
export function capDescription(raw: string | null): {
  description: string
  descriptionTruncated: boolean
} {
  if (raw === null) return { description: '', descriptionTruncated: false }
  if (raw.length <= TOOL_DESCRIPTION_MAX) {
    return { description: raw, descriptionTruncated: false }
  }
  return { description: raw.slice(0, TOOL_DESCRIPTION_MAX), descriptionTruncated: true }
}

/**
 * The name the CLI invokes a command by.
 *
 * `commands/paul/plan.md` is `paul:plan`, CONFIRMED against that file's own
 * frontmatter (`name: paul:plan`) rather than inferred. Two levels, never
 * recursive: prompts.ts's one-level rule would have missed 27 of this
 * machine's 28 user commands, and an unbounded walk over a directory this app
 * does not control is a bigger promise than any milestone here has made.
 */
export function commandName(segments: readonly string[]): string | null {
  if (segments.length === 0 || segments.length > 2) return null
  const last = segments[segments.length - 1]
  if (last === undefined || !last.endsWith('.md')) return null
  const base = last.slice(0, -3)
  if (base === '') return null
  const name = segments.length === 2 ? `${segments[0]}:${base}` : base
  return name.slice(0, TOOL_NAME_MAX)
}

/* ---------------------------------------------------------------- mcp -- */

function transportOf(raw: Record<string, unknown>): McpTransport {
  const t = raw.type
  if (t === 'stdio' || t === 'http' || t === 'sse') return t
  // Absent `type` with a `command` is the stdio default the CLI documents.
  if (t === undefined && isStr(raw.command)) return 'stdio'
  return 'unknown'
}

/**
 * One MCP server, PROJECTED.
 *
 * Rebuilt field by field and never spread, which is this repo's rule in four
 * other places (`parseMeta`, `pollLive`'s record map, M5a's absent `command`,
 * `credential-store`'s `list`) and is load-bearing here for the sharpest
 * reason of the five: a spread carries `env` and `args` wholesale, everything
 * keeps working, and the renderer holds an API key. There is no runtime
 * symptom, which is why `verify:meta` pins this as source text.
 */
export function projectMcpServer(
  name: string,
  raw: unknown,
  scope: ToolScope,
  sourcePath: string,
  active: ToolActive
): McpToolEntry | null {
  if (!isRecord(raw)) return null
  const command = isStr(raw.command) ? raw.command : ''
  // An http/sse server legitimately has no command; a stdio one with neither a
  // command nor a url is a record that can never launch anything, and a row
  // for it would claim a capability that does not exist.
  const url = isStr(raw.url) ? raw.url : ''
  if (command === '' && url === '') return null

  const args = Array.isArray(raw.args) ? raw.args : []
  const envKeysAll = isRecord(raw.env) ? Object.keys(raw.env).sort() : []

  return {
    id: entryId(['mcp', scope, sourcePath, name]),
    kind: 'mcp',
    scope,
    sourcePath,
    active,
    alsoDefinedIn: [],
    name: name.slice(0, TOOL_NAME_MAX),
    transport: transportOf(raw),
    // The LAUNCHER only. `npx` and `node` are programs, not payloads.
    command: command.slice(0, HOOK_PROGRAM_CHARS),
    argCount: args.length,
    envKeys: envKeysAll.slice(0, MCP_ENV_KEYS_MAX),
    envKeysOverflow: Math.max(0, envKeysAll.length - MCP_ENV_KEYS_MAX)
  }
}

/**
 * Whether an MCP server declared in a project's `.mcp.json` is live here.
 *
 * The `json` in `enabledMcpjsonServers` is the FILE: this pair governs
 * `.mcp.json` servers and nothing else. Named in neither list is
 * `needs-approval`, its own arm — see ToolActive for why that must not be
 * folded into either neighbour.
 */
export function mcpJsonActive(
  name: string,
  enabled: readonly string[],
  disabled: readonly string[],
  claudeJsonPath: string
): ToolActive {
  const on = enabled.includes(name)
  const off = disabled.includes(name)
  if (on && off) return { kind: 'unknown', why: 'contradictory-config' }
  if (off) return { kind: 'disabled', by: claudeJsonPath }
  if (on) return { kind: 'active' }
  return { kind: 'needs-approval' }
}

/**
 * Whether a user- or local-scope MCP server is live here.
 *
 * A DIFFERENT, newer pair from the `…McpjsonServers` one above, and the
 * measurement is what separates them: on this machine `enabledMcpServers` and
 * `disabledMcpServers` name `computer-use` and `claude.ai Higgsfield`, which
 * appear in no `mcpServers` map anywhere — they govern connector- and
 * plugin-provided servers this app cannot enumerate. So a name here that
 * matches a server we read decides it; a name that does not is reported as
 * unresolved rather than invented as an entry.
 *
 * Absent from both lists is `active`, not `needs-approval`: a server the user
 * configured themselves in their own file needs no approval prompt.
 */
export function mcpDirectActive(
  name: string,
  enabled: readonly string[],
  disabled: readonly string[],
  claudeJsonPath: string
): ToolActive {
  const on = enabled.includes(name)
  const off = disabled.includes(name)
  if (on && off) return { kind: 'unknown', why: 'contradictory-config' }
  if (off) return { kind: 'disabled', by: claudeJsonPath }
  return { kind: 'active' }
}

/**
 * The ONLY four paths read out of `~/.claude.json`.
 *
 * An ALLOWLIST, never a denylist, and the argument is a measurement rather
 * than a principle: `projects[*].history` — the user's own past prompts — was
 * observed present on one machine and absent across all 12 projects on
 * another. A denylist written against either is silently wrong on the other,
 * and the failure is invisible, because the payload merely gets bigger. This
 * file has 87 other top-level keys (`oauthAccount`, `userID`, `machineID`, …)
 * and eleven other project entries; `projects[otherCwd]` is never touched at
 * all, because the user's whole working layout is not a fact about one panel.
 */
export interface ClaudeJsonView {
  userServers: Record<string, unknown>
  localServers: Record<string, unknown>
  enabledMcpjson: string[]
  disabledMcpjson: string[]
  enabledMcp: string[]
  disabledMcp: string[]
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(isStr) : []
}

export function readClaudeJson(raw: unknown, cwd: string): ClaudeJsonView {
  const empty: ClaudeJsonView = {
    userServers: {},
    localServers: {},
    enabledMcpjson: [],
    disabledMcpjson: [],
    enabledMcp: [],
    disabledMcp: []
  }
  if (!isRecord(raw)) return empty
  const projects = isRecord(raw.projects) ? raw.projects : {}
  const mine = isRecord(projects[cwd]) ? (projects[cwd] as Record<string, unknown>) : {}
  return {
    userServers: isRecord(raw.mcpServers) ? raw.mcpServers : {},
    localServers: isRecord(mine.mcpServers) ? mine.mcpServers : {},
    enabledMcpjson: strArray(mine.enabledMcpjsonServers),
    disabledMcpjson: strArray(mine.disabledMcpjsonServers),
    enabledMcp: strArray(mine.enabledMcpServers),
    disabledMcp: strArray(mine.disabledMcpServers)
  }
}

/* -------------------------------------------------------------- hooks -- */

/**
 * The program a hook runs, projected out of its command string.
 *
 * See HookToolEntry.program for why the command itself never crosses.
 */
export function hookProgram(command: string): string {
  const tokens = command.trim().split(/\s+/).filter((t) => t !== '')
  if (tokens.length === 0) return ''
  const strip = (t: string): string => t.replace(/^["']/, '').replace(/["']$/, '')
  const first = strip(tokens[0] ?? '')
  const head = first.includes('/') ? (first.split('/').pop() ?? first) : first
  const second = tokens[1] === undefined ? '' : strip(tokens[1])
  // A second token is shown only when it is plainly a PATH, never when it is a
  // flag or a bare argument — `--api-key=sk-…` is a token like any other, and
  // the rule that keeps it out has to be about shape rather than about
  // recognising a secret.
  if (second.includes('/') && !second.startsWith('-')) {
    const base = second.split('/').pop() ?? ''
    if (base !== '') return `${head} ${base}`.slice(0, HOOK_PROGRAM_CHARS)
  }
  return head.slice(0, HOOK_PROGRAM_CHARS)
}

/**
 * Every hook configured in one settings file.
 *
 * The restraint that matters is in the WORDING a caller may use with this:
 * these are hooks CONFIGURED, never hooks that FIRE. Whether project hooks add
 * to or replace user hooks for the same event is something this app does not
 * know, and a merged count would be a claim about the CLI's behaviour rather
 * than about files.
 */
export function parseHooks(
  settings: unknown,
  scope: ToolScope,
  sourcePath: string
): HookToolEntry[] {
  if (!isRecord(settings)) return []
  const hooks = settings.hooks
  if (!isRecord(hooks)) return []
  const out: HookToolEntry[] = []
  for (const event of Object.keys(hooks).sort()) {
    const groups = hooks[event]
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (!isRecord(group)) continue
      const rawMatcher = isStr(group.matcher) ? group.matcher : ''
      const matcher = rawMatcher.slice(0, HOOK_MATCHER_CHARS)
      const list = Array.isArray(group.hooks) ? group.hooks : []
      for (let i = 0; i < list.length; i += 1) {
        if (out.length >= HOOKS_MAX) return out
        const h = list[i]
        if (!isRecord(h)) continue
        const command = isStr(h.command) ? h.command : ''
        out.push({
          // The matcher is IN the id and is user text, which is exactly why
          // the id is a JSON tuple rather than a joined string.
          id: entryId(['hook', scope, sourcePath, event, rawMatcher, i]),
          kind: 'hook',
          scope,
          sourcePath,
          active: { kind: 'active' },
          alsoDefinedIn: [],
          event,
          matcher,
          matcherTruncated: rawMatcher.length > HOOK_MATCHER_CHARS,
          index: i,
          hookType: isStr(h.type) ? h.type : '',
          program: hookProgram(command),
          commandChars: command.length
        })
      }
    }
  }
  return out
}

/**
 * How many hooks a settings file CONFIGURES, ignoring HOOKS_MAX.
 *
 * Exists so the reader can report an overflow as a real difference rather than
 * as the length of an already-capped array. A list that silently stops is
 * indistinguishable from a file that configured fewer hooks, which is the
 * `+N more` rule REVIEW_FILE_CAP already states, reached through a second
 * reader.
 */
export function countHooks(settings: unknown): number {
  if (!isRecord(settings)) return 0
  const hooks = settings.hooks
  if (!isRecord(hooks)) return 0
  let n = 0
  for (const event of Object.keys(hooks)) {
    const groups = hooks[event]
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (!isRecord(group)) continue
      if (Array.isArray(group.hooks)) n += group.hooks.filter(isRecord).length
    }
  }
  return n
}

/* -------------------------------------------------------- permissions -- */

export function parsePermissionCounts(
  settings: unknown,
  scope: ToolScope,
  path: string
): PermissionCounts | null {
  if (!isRecord(settings)) return null
  const p = settings.permissions
  if (!isRecord(p)) return null
  const n = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
  return {
    path,
    scope,
    allow: n(p.allow),
    deny: n(p.deny),
    ask: n(p.ask),
    additionalDirectories: n(p.additionalDirectories)
  }
}

/** The rules themselves, for the second, explicitly-requested invoke. */
export function parsePermissionRules(
  settings: unknown,
  bucket: 'allow' | 'deny' | 'ask'
): { rules: string[]; total: number } {
  if (!isRecord(settings)) return { rules: [], total: 0 }
  const p = settings.permissions
  if (!isRecord(p)) return { rules: [], total: 0 }
  const all = Array.isArray(p[bucket]) ? (p[bucket] as unknown[]).filter(isStr) : []
  return {
    rules: all.map((r) => r.slice(0, PERMISSION_RULE_CHARS)),
    // The TRUE total, never the length of the capped array — so a count on
    // screen is always the real count even when the list is cut.
    total: all.length
  }
}

/* ------------------------------------------------------------- skills -- */

/**
 * Whether a filesystem skill is turned off by a `skillOverrides` map.
 *
 * The matching rule is measured rather than assumed: every override key on
 * this machine is namespaced (`paul:add-phase`), and a filesystem skill yields
 * a bare directory name (`graphify`). So a key containing `:` is a plugin
 * skill BY CONSTRUCTION and can never match a directory this app read — it
 * belongs in `unresolved`, never as a fabricated entry pointing at a file that
 * does not exist.
 */
export function skillOverrideOff(name: string, overrides: unknown): boolean {
  if (!isRecord(overrides)) return false
  return overrides[name] === 'off' || overrides[name] === false
}

/** Override keys that can never name a filesystem skill. See above. */
export function unresolvableOverrides(overrides: unknown): string[] {
  if (!isRecord(overrides)) return []
  return Object.keys(overrides)
    .filter((k) => k.includes(':'))
    .filter((k) => overrides[k] === 'off' || overrides[k] === false)
    .sort()
}

/* ------------------------------------------------------------ plugins -- */

export function parseEnabledPlugins(settings: unknown): {
  enabled: string[]
  disabledCount: number
} {
  if (!isRecord(settings)) return { enabled: [], disabledCount: 0 }
  const p = settings.enabledPlugins
  if (!isRecord(p)) return { enabled: [], disabledCount: 0 }
  const enabled: string[] = []
  let disabledCount = 0
  for (const key of Object.keys(p).sort()) {
    if (p[key] === true) enabled.push(key)
    else disabledCount += 1
  }
  return { enabled, disabledCount }
}

/* -------------------------------------------------------------- misc -- */

/** An errno, never a stringified file body. See SourceRead.detail. */
export function errDetail(error: unknown): string {
  const code = isRecord(error) && isStr(error.code) ? error.code : ''
  if (code !== '') return code
  return String(error).slice(0, DETAIL_MAX)
}
