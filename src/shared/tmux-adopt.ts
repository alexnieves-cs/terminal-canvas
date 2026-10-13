/**
 * The UX pass (notes/ux-proposals.md 5.5). ADOPT WHAT IS ALREADY RUNNING.
 *
 * A new person often already has `claude` or `codex` running in their own
 * tmux. The empty canvas offers to put those on screen. This is the pure
 * half: the one read-only tmux argv, the format it asks for, the parser, and
 * the argv a panel runs to attach. `verify:ux ux.adopt.*`.
 *
 * The rule tmux-args.ts records still holds for everything that WRITES: the
 * app's own server lives on its own socket and kill-server must never reach
 * the user's. This reads the user's default server with ONE subcommand,
 * `list-panes`, and an adopted panel is a tmux CLIENT attached to the user's
 * session. Closing that panel ends the client, never the session.
 */

export interface AdoptableSession {
  /** `session:window.pane`, the target `attach-session -t` takes. */
  target: string
  session: string
  /** Which agent the pane is running. */
  agent: 'claude' | 'codex'
  cwd: string
}

const SEP = '\t'

/** The format `list-panes -a -F` prints: one pane per line, tab-separated. */
export const ADOPT_FORMAT = ['#{session_name}', '#{window_index}', '#{pane_index}', '#{pane_current_command}', '#{pane_current_path}', '#{pane_start_command}'].join(SEP)

/** The only tmux argv this feature runs against the user's server. Read-only by construction. */
export const ADOPT_LIST_ARGS: readonly string[] = ['list-panes', '-a', '-F', ADOPT_FORMAT]

/** Which agent a pane's commands name, by the program's own name, or null. */
function agentOf(current: string, start: string): 'claude' | 'codex' | null {
  for (const text of [current, start]) {
    // The first word of a command line, as a basename: `/opt/homebrew/bin/claude --resume` → `claude`.
    const first = text.trim().replace(/^"|"$/g, '').split(/\s+/)[0] ?? ''
    const base = first.split('/').pop() ?? ''
    if (base === 'claude' || base === 'codex') return base
  }
  return null
}

/** Each pane running claude or codex, one row per SESSION (the first such pane in it). */
export function parseAdoptable(stdout: string): AdoptableSession[] {
  const out: AdoptableSession[] = []
  const seen = new Set<string>()
  for (const line of stdout.split('\n')) {
    const cols = line.split(SEP)
    if (cols.length < 5) continue
    const [session = '', win = '', pane = '', current = '', cwd = '', start = ''] = cols
    if (session === '' || seen.has(session)) continue
    const agent = agentOf(current, start)
    if (agent === null) continue
    seen.add(session)
    out.push({ target: `${session}:${win}.${pane}`, session, agent, cwd })
  }
  return out
}

/**
 * What an adopted panel runs. `env -u TMUX` first: the app's own panels may
 * run inside the app's tmux server, and tmux refuses to attach from inside a
 * session while $TMUX is set. `tmuxPath` is main's absolute path (a GUI
 * app's PATH has no Homebrew on it).
 */
export function adoptCommand(tmuxPath: string, target: string): { command: string; args: string[] } {
  return { command: '/usr/bin/env', args: ['-u', 'TMUX', tmuxPath, 'attach-session', '-t', target] }
}

/** The offer's sentence on the empty canvas. */
export function adoptSentence(rows: readonly AdoptableSession[]): string {
  const n = rows.length
  return n === 1
    ? `1 agent is already running in your tmux (${rows[0]!.agent} in ${rows[0]!.session}).`
    : `${n} agents are already running in your tmux.`
}
