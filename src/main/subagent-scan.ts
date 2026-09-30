/**
 * The pure half of subagent detection: no fs, no electron, no node-pty, which
 * is what puts it in the plain-node verify tier beside git-args.ts.
 *
 * Everything here reads a format this repo does not own and cannot version.
 * The rule throughout is therefore that a surprise costs a NODE, never a
 * throw: this code runs per file, per panel, per 2s tick.
 */

/**
 * How much of a `description` is kept. Model-authored free text out of a file
 * this repo does not own and cannot bound: nothing in Claude Code's format
 * promises a short one, and the whole string is carried across IPC, held in
 * the renderer's store, AND re-serialised into the poll's dedupe key every 2s
 * for the life of the panel. An unbounded one is therefore not merely an ugly
 * node — it is a per-tick cost that grows with something a model decided, and
 * its failure is invisible: no pixel is wrong, it shows up as heat. Truncated
 * at the PARSE boundary rather than at render time, so the bound holds for
 * every consumer at once rather than for the one that remembered it. 200 is
 * comfortably more than the node's two rendered lines can show.
 */
export const DESCRIPTION_MAX = 200

export interface SubagentMeta {
  agentType: string
  description: string
  toolUseId: string
  spawnDepth: number
  model: string
}

/**
 * The project directory Claude Code derives from a cwd.
 *
 * INFERRED, not documented — read off 31 real directory names, every one of
 * which is consistent with "anything outside [A-Za-z0-9] becomes a dash".
 * `/repo/.claude/x` therefore yields `-repo--claude-x`: the double dash is the
 * dot AND the slash, and it is the case a `split('/').join('-')` gets wrong.
 *
 * None of those 31 samples contained an underscore or a space, so those two
 * are genuinely unknown. That is exactly why nothing trusts this answer — see
 * cwdOf: a claimed session is confirmed against its own recorded cwd, so a
 * wrong slug costs the feature rather than misattributing it.
 */
export function slugFor(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

/** A `.meta.json` sidecar, or null if it cannot be trusted. */
export function parseMeta(text: string): SubagentMeta | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  // toolUseId is REQUIRED and the others are not, because it is the only field
  // completion is keyed on: a record without it could never leave `running`,
  // and a node stuck running forever is worse than no node. The rest are
  // labels, and a missing label is a cosmetic gap.
  if (typeof o.toolUseId !== 'string' || o.toolUseId === '') return null
  return {
    agentType: typeof o.agentType === 'string' ? o.agentType : 'agent',
    description: typeof o.description === 'string' ? o.description.slice(0, DESCRIPTION_MAX) : '',
    toolUseId: o.toolUseId,
    spawnDepth: typeof o.spawnDepth === 'number' ? o.spawnDepth : 1,
    model: typeof o.model === 'string' ? o.model : ''
  }
  // Unknown extra fields are ignored by construction: this rebuilds the object
  // field by field rather than spreading, the same rule M5a's absent `command`
  // already forces on four other layers.
}

/**
 * The cwd a transcript line records. This is the CONFIRMATION that makes
 * slugFor's inferred mapping safe to be wrong about.
 */
export function cwdOf(firstLine: string): string | null {
  try {
    const o = JSON.parse(firstLine) as Record<string, unknown>
    return typeof o.cwd === 'string' ? o.cwd : null
  } catch {
    return null
  }
}

/**
 * Which session directory a panel claims: the most recent one created after
 * the panel spawned, or none.
 *
 * The post-spawn filter is not a tidiness rule. Without it a panel running a
 * plain shell in a directory somebody used yesterday adopts that session and
 * renders its finished subagents — a canvas confidently attributing a
 * stranger's work to a panel that has spawned nothing.
 */
export function chooseSession(
  dirs: ReadonlyArray<{ name: string; createdAt: number }>,
  spawnedAt: number
): string | null {
  let best: { name: string; createdAt: number } | null = null
  for (const d of dirs) {
    if (d.createdAt < spawnedAt) continue
    if (!best || d.createdAt > best.createdAt) best = d
  }
  return best ? best.name : null
}

/**
 * Which panels may be attributed at all, given every panel's slug at once.
 *
 * A fact about the CANVAS, not about the filesystem, which is why it is a
 * separate function from chooseSession and takes the whole map: a per-panel
 * signature could not express it. Two panels in one repository is the ordinary
 * case in this app, and nothing on disk can tell "both are running claude"
 * from "one is running a shell" — a shell leaves no trace to rule it out. So
 * the strict direction is the correct one: refuse both.
 *
 * A null slug is a panel with no directory to resolve. It contributes nothing
 * and must not make its neighbours ambiguous, or one shell panel would
 * disable the feature for the whole canvas. **No production caller passes one
 * today** — `SubagentWatch.poll` always calls `slugFor`, which never answers
 * null for any string — and that is stated here rather than left to be
 * rediscovered, because this repo's own rule is that a branch defended only
 * by a check gets read as dead code and deleted. It stays because
 * `string | null` is the honest type for "which directory does this panel
 * resolve to", and a future caller (a panel with no cwd at all) would
 * otherwise reach a function narrowed to assume one. `verify:subagent` 12 no
 * longer exercises it either: its fixture is three DISTINCT non-null slugs,
 * so the over-correction guard it exists for is proven without resting on
 * this arm.
 *
 * `SubagentWatch.poll` does not call this function — it inlines the identical
 * `sharing === 1` test directly against `slugSharing`'s own map, so the
 * refusal actually enforced on a running canvas lives there, not here. This
 * is kept anyway as the rule's pure, checked STATEMENT: the one place the
 * whole-canvas ambiguity refusal is expressed as a total function, provable
 * by `verify:subagent` 11/12/12b with no `SubagentWatch` and no filesystem in
 * earshot. This repo's own rule is that a branch defended only by a check
 * reads as dead code to the next person who greps for callers and finds
 * none — this paragraph is what stops that read.
 */
export function attributable(slugs: ReadonlyMap<string, string | null>): Set<string> {
  const sharing = slugSharing(slugs)
  const allowed = new Set<string>()
  for (const [panelId, n] of sharing) {
    if (n === 1) allowed.add(panelId)
  }
  return allowed
}

/**
 * How many panels share each panel's slug, itself included — so 1 means "this
 * panel is alone in its repository" and anything higher is the refusal above.
 *
 * The ONE derivation of that count, which `attributable` is written in terms
 * of rather than beside: the renderer's ambiguity line names the number to
 * the user ("3 panels share this repository"), and a second count computed
 * for the message would agree with the refusal the day it was written and
 * drift the first time one of them was wrong — a sentence on screen stating a
 * number no log explains, the rule `waitingCount` already states for the rail.
 *
 * A null slug maps to 0 rather than being omitted, so a caller can tell "no
 * directory to resolve" from "alone in its repository" without a second
 * lookup.
 */
export function slugSharing(slugs: ReadonlyMap<string, string | null>): Map<string, number> {
  const count = new Map<string, number>()
  for (const slug of slugs.values()) {
    if (slug === null) continue
    count.set(slug, (count.get(slug) ?? 0) + 1)
  }
  const sharing = new Map<string, number>()
  for (const [panelId, slug] of slugs) {
    sharing.set(panelId, slug === null ? 0 : (count.get(slug) ?? 0))
  }
  return sharing
}

/**
 * Which of `ids` appear as a COMPLETED tool_result in this chunk.
 *
 * The `tool_result` test is the whole function. Each toolUseId appears twice
 * in a parent transcript — as the tool_use that spawned the subagent and as
 * the tool_result that ended it — so a scan for the bare id marks every
 * subagent finished the instant it starts, and no node is ever seen running.
 */
export function scanForResults(chunk: string, ids: ReadonlySet<string>): Set<string> {
  const done = new Set<string>()
  if (ids.size === 0) return done
  for (const id of ids) {
    // Matched as a tool_use_id VALUE rather than by parsing every line: a
    // chunk is up to a tick's worth of appended transcript and may end
    // mid-line, so JSON.parse per line would drop the tail. The quoted-key
    // form is what keeps this from matching the spawning tool_use, whose id
    // sits under "id" instead.
    if (chunk.includes(`"tool_use_id":"${id}"`)) done.add(id)
  }
  return done
}

/**
 * M398 (A3). Whether a PTY session is one the subagent watcher should look at.
 *
 * Only a CLAUDE CODE session has a `~/.claude/projects` directory to claim, so
 * only one is fed to the watcher. Before this every PTY was, login shells
 * included, and three plain shells opened in `~` shared one slug: each drew
 * "3 panels share this repository…" over its neighbours' titles, a sentence
 * about subagents on panels that had never run an agent.
 *
 * Any one of four facts makes a session an agent's, because each is the only
 * one some real way of starting `claude` leaves behind: the spawn spec's
 * `agent` (a Claude Code preset), the spawned command's own name, tmux's
 * `pane_current_command` (typed into a shell, tmux backend), and the OSC 133
 * command in flight (typed into a shell with integration, either backend —
 * the direct backend reports no current command at all). A first word is
 * compared by BASENAME, so `/opt/homebrew/bin/claude` and `claude --resume x`
 * both count and `claude-helper` does not. See `isClaudeProcessName` for
 * tmux's measured answer and `launchesClaude` for wrappers and npx.
 */
export function isClaudeSession(session: {
  agent?: string
  command: string
  currentCommand?: string
  runCommand?: string
}): boolean {
  if (session.agent === 'claude-code') return true
  return (
    launchesClaude(session.command) ||
    launchesClaude(session.runCommand) ||
    (session.currentCommand !== undefined && isClaudeProcessName(session.currentCommand))
  )
}

/**
 * M398. tmux's `pane_current_command` for a running Claude Code, MEASURED
 * (tmux 3.7c, native install 2.1.285, 2026-09-30): `2.1.285`, not `claude`.
 * The native installer's `~/.local/bin/claude` is a symlink to
 * `~/.local/share/claude/versions/<version>`, and tmux reports the kernel's
 * process name, which is the EXECUTABLE's basename — the same `2.1.285` that
 * `ps -o ucomm` shows, while argv[0] stays `claude`. Measured the same typed
 * into zsh and as the pane's own command. So a version-shaped name counts,
 * alongside `claude` itself (an npm or Homebrew install, whose executable is
 * named that). A version-shaped name is not proof, only the best signal tmux
 * gives without a `ps` per pane per tick; the watcher's confirmation read
 * (the transcript's own cwd) is still what makes a claim safe.
 */
export function isClaudeProcessName(name: string): boolean {
  const base = name.trim().slice(name.trim().lastIndexOf('/') + 1)
  return base === 'claude' || /^\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.-]*)?$/.test(base)
}

/**
 * Words that run the NEXT word as the program, skipped (with their flags and
 * `VAR=value` assignments) before the command's name is read, so
 * `env FOO=1 claude`, `npx -y @anthropic-ai/claude-code` and `exec claude`
 * count. A wrapper script under another name still does not, and cannot:
 * nothing in its command line says what it runs.
 */
const LAUNCH_WRAPPERS = new Set(['env', 'exec', 'command', 'nohup', 'time', 'caffeinate', 'npx', 'bunx', 'pnpx', 'dlx'])

/** A command line whose program is Claude Code: by name, by the native install's path, or by npm package. */
export function launchesClaude(line: string | undefined): boolean {
  if (line === undefined) return false
  const words = line.trim().split(/\s+/)
  let i = 0
  while (i < words.length) {
    const word = words[i]
    const base = word.slice(word.lastIndexOf('/') + 1)
    // `pnpm dlx` / `yarn dlx`: the package manager, then `dlx`, then the package.
    const isDlxHost = (base === 'pnpm' || base === 'yarn') && words[i + 1] === 'dlx'
    if (LAUNCH_WRAPPERS.has(base) || isDlxHost || /^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || (i > 0 && word.startsWith('-'))) {
      i += 1
      continue
    }
    break
  }
  const program = words[i] ?? ''
  const base = program.slice(program.lastIndexOf('/') + 1)
  return (
    base === 'claude' ||
    program.includes('/claude/versions/') ||
    /^@anthropic-ai\/claude-code(?:@\S*)?$/.test(program)
  )
}
