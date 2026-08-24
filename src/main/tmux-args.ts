/**
 * The pure half of the tmux backend: argv, config text, and output parsing.
 *
 * Deliberately free of node-pty, electron, and fs. node-pty is a native module
 * built against Electron's ABI and will not load under plain node, so anything
 * that imports it cannot be verified in the cheap plain-node tier. Keeping
 * these functions here is what lets verify:tmux assert the flags and the config
 * without a tmux server or an Electron runtime. Impure work belongs in
 * session-backend.ts.
 */

/**
 * A socket of our own. The app must never see, list, resize, or kill the
 * user's own tmux sessions — and shutdown() calls kill-server, which would
 * destroy their real work if it ever reached the default socket.
 */
export const TMUX_SOCKET = 'terminal-canvas'

/**
 * set-hook and #{pane_dead_status} both predate 3.0 comfortably; 3.0 is the
 * floor because it is old enough to be everywhere and new enough that we are
 * not guessing about behaviour we never tested.
 */
export const MIN_TMUX_MAJOR = 3

export interface TmuxVersion {
  major: number
  minor: number
  raw: string
}

export interface TmuxListEntry {
  panelId: string
  pid: number
  command: string
  cwd: string
}

/**
 * `tmux -V` prints things like "tmux 3.7c", "tmux 2.9a", and "tmux next-3.4".
 * Returns null rather than a guess when it cannot read the version: an
 * unreadable version must send us to the direct backend, and an optimistic
 * default would instead send us to a tmux we know nothing about.
 */
export function parseTmuxVersion(raw: string): TmuxVersion | null {
  const match = /(\d+)\.(\d+)/.exec(raw)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), raw: raw.trim() }
}

export function isSupportedTmuxVersion(v: TmuxVersion | null): boolean {
  if (!v) return false
  return v.major >= MIN_TMUX_MAJOR
}

/**
 * Safe to build by concatenation: ID_PATTERN in shared/layout-schema.ts
 * restricts a panel id to [A-Za-z0-9_-]+, which is exactly why that pattern
 * was chosen during M4b while it was still free rather than a migration of
 * everyone's saved file.
 */
export function exitFilePath(exitDir: string, panelId: string): string {
  return `${exitDir}/${panelId}.exit`
}

/**
 * The app's own tmux config. Passed with -f so a user's ~/.tmux.conf — custom
 * prefix, status line, plugins, mouse mode — cannot reshape a panel. Same class
 * of decision as shell-env.ts probing the login shell: take the user's
 * environment where it is the point, refuse it where it is not.
 *
 * Every line here fails SILENTLY if dropped. Do not trim this.
 */
export function buildTmuxConf(exitDir: string): string {
  return [
    // The canvas draws its own panel chrome; a tmux status line would eat a
    // row and read as a rendering bug.
    'set -g status off',
    // CRITICAL. Ctrl+B must reach the agent untouched. This is the same split
    // the app already draws twice: Cmd+C is ours and Ctrl+C is the PTY's,
    // Cmd+Z is ours and Ctrl+Z is the PTY's. A tmux prefix would be the first
    // bare control key the app ever stole, and useViewport.ts requires Cmd on
    // every canvas shortcut precisely because agent TUIs claim every bare key.
    'set -g prefix None',
    'set -g escape-time 0',
    // Matches the `name` pty-manager.ts already passes, so TERM is unchanged
    // from the agent's point of view.
    'set -g default-terminal "xterm-256color"',
    // Agent CLIs emit 24-bit colour and tmux downsamples to 256 without this.
    // The panel still WORKS; it just looks subtly wrong, with no error anywhere.
    'set -as terminal-features ",xterm-256color:RGB"',
    // Keeps the pane alive after its command exits so #{pane_dead_status} can
    // still be read. The hook below is what actually ends the session.
    'set -g remain-on-exit on',
    // The exit-code channel. These two commands run sequentially in one shell,
    // so the file is on disk BEFORE the session is killed — and killing the
    // session is what makes the client exit, which fires node-pty's onExit,
    // which is the callback PtyManager already uses to send pty:exit. Main
    // therefore reads the file in a handler it already has: no watcher, no
    // polling, no new IPC. Reversing these two is a race.
    `set-hook -g pane-died 'run-shell "echo #{pane_dead_status} > ${exitDir}/#{session_name}.exit; tmux kill-session -t #{session_name}"'`,
    // NOTE: `mouse` is deliberately absent, i.e. left off. `mouse on` makes
    // TMUX capture mouse reporting instead of passing it to the application,
    // which would silently defeat all of M4a's pointer correction from one
    // process further down. This is the mirror image of the :RGB line above.
    ''
  ].join('\n')
}

/**
 * The spawn argv. `new-session -A` attaches if the session exists and creates
 * it if it does not — which is the entire reload-survival feature, and why
 * pty:create keeps its exact current meaning and session-registry.ts needs no
 * change at all.
 */
export function buildTmuxArgs(o: {
  confPath: string
  panelId: string
  cols: number
  rows: number
  command: string
  args: string[]
}): string[] {
  return [
    '-L', TMUX_SOCKET,
    '-f', o.confPath,
    'new-session',
    '-A',
    '-s', o.panelId,
    // Preserves "fit before spawn": the renderer has already fitted, and
    // spawning at 80x24 then resizing makes agent TUIs draw their frame twice.
    // Only meaningful at creation; on reattach the client negotiates its own.
    '-x', String(o.cols),
    '-y', String(o.rows),
    // Everything after `--` is the command, so a command starting with `-` is
    // run rather than eaten as a tmux flag.
    '--',
    o.command,
    ...o.args
  ]
}

/** Tab-separated so a cwd containing spaces survives the split. */
const LIST_FORMAT =
  '#{session_name}\t#{pane_dead}\t#{pane_pid}\t#{pane_start_command}\t#{pane_current_path}'

export function buildListArgs(): string[] {
  return ['-L', TMUX_SOCKET, 'list-panes', '-a', '-F', LIST_FORMAT]
}

export function buildKillSessionArgs(panelId: string): string[] {
  return ['-L', TMUX_SOCKET, 'kill-session', '-t', panelId]
}

export function buildKillServerArgs(): string[] {
  return ['-L', TMUX_SOCKET, 'kill-server']
}

/**
 * Live sessions only.
 *
 * The #{pane_dead} filter is load-bearing and is the one place the
 * remain-on-exit decision leaks outside the exit path: a session whose command
 * has exited still EXISTS until the hook kills it, so an unfiltered list would
 * report a finished process as live. Boot reconciliation would then restore
 * that panel non-dormant, attach a client to a corpse, and show the user a
 * panel that can never produce another byte.
 *
 * Never throws. tmux prints nothing at all when no server is running, and that
 * is the normal first-run case rather than an error.
 */
export function parseListOutput(stdout: string): TmuxListEntry[] {
  const entries: TmuxListEntry[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [panelId, dead, pid, command, cwd] = line.split('\t')
    if (!panelId || dead === undefined) continue
    if (dead !== '0') continue
    entries.push({
      panelId,
      pid: Number(pid) || 0,
      command: command || '',
      cwd: cwd || ''
    })
  }
  return entries
}
