import { basename, join } from 'node:path'

/**
 * M52. OSC 133 shell integration, decided by the RESOLVED shell of a panel
 * whose `command` was absent — a login shell. Main is the only party that
 * knows which shell it resolved, so injection is main's; an agent CLI panel
 * is not a prompt loop and is never decorated.
 *
 * PURE: returns the env and args to spawn with and the rc files to write
 * (PtyManager writes them, idempotently, under userData). verify:tmux
 * shell-integration.1.
 *
 * zsh: ZDOTDIR is pointed at our directory, whose .zshenv/.zprofile/.zshrc/
 * .zlogin source the USER'S own from the original ZDOTDIR (else $HOME) FIRST,
 * then .zshrc adds precmd/preexec hooks. bash: --rcfile with a file that
 * sources ~/.bashrc first, then sets PROMPT_COMMAND and a DEBUG trap. The
 * marks are the standard four — A prompt start, B prompt end, C command
 * start, D;exit command end — with the command line percent-encoded on C,
 * which the standard does not carry and the ledger needs.
 */
export interface ShellIntegrationInput {
  command: string
  /** True when PanelSpec.command was absent — the panel is a login shell. */
  absentCommand: boolean
  /** Absent for a seed or programmatic spec — treated as `[]`, never spread bare. */
  args?: string[]
  env: Record<string, string>
  /** userData/shell-integration */
  dir: string
}

export interface ShellIntegration {
  env: Record<string, string>
  args: string[]
  files: Array<{ path: string; content: string }>
  shell: 'zsh' | 'bash' | null
}

// A mark with a payload passes the value as a printf ARGUMENT: inside the
// single-quoted format string a `$name` would be the literal text, which is
// what the first cut of this file emitted (watched: `133;D;$__ec`).
const MARK = (kind: string, arg?: string): string =>
  arg === undefined ? `printf '\\033]133;${kind}\\a'` : `printf '\\033]133;${kind};%s\\a' "${arg}"`

const ZSH_HOOKS = `
# --- terminal-canvas shell integration (OSC 133) ---
autoload -Uz add-zsh-hook 2>/dev/null
__tc_precmd() { local __ec=$?; if [[ -n "$__tc_running" ]]; then ${MARK('D', '$__ec')}; unset __tc_running; fi; ${MARK('A')}; }
__tc_preexec() { local __cmd="$1"; local __enc="$(printf '%s' "$__cmd" | od -An -tx1 -v | tr -d ' \\n' | sed 's/\\(..\\)/%\\1/g')"; __tc_running=1; ${MARK('C', '$__enc')}; }
add-zsh-hook precmd __tc_precmd 2>/dev/null
add-zsh-hook preexec __tc_preexec 2>/dev/null
PS1="%{$(printf '\\033]133;B\\a')%}$PS1"
`

const BASH_HOOKS = `
# --- terminal-canvas shell integration (OSC 133) ---
__tc_enc() { printf '%s' "$1" | od -An -tx1 -v | tr -d ' \\n' | sed 's/\\(..\\)/%\\1/g'; }
__tc_prompt() { local __ec=$?; if [[ -n "$__tc_running" ]]; then ${MARK('D', '$__ec')}; unset __tc_running; fi; ${MARK('A')}; }
__tc_debug() { [[ -n "$COMP_LINE" ]] && return; [[ "$BASH_COMMAND" == "__tc_prompt" ]] && return; [[ -n "$__tc_running" ]] && return; __tc_running=1; ${MARK('C', '$(__tc_enc "$BASH_COMMAND")')}; }
PROMPT_COMMAND="__tc_prompt\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
trap '__tc_debug' DEBUG
PS1="\\[$(printf '\\033]133;B\\a')\\]$PS1"
`

function zshFiles(dir: string): Array<{ path: string; content: string }> {
  const zdir = join(dir, 'zsh')
  // Each file sources the user's own from the ORIGINAL ZDOTDIR (else $HOME),
  // exported by main as TC_ORIG_ZDOTDIR, so nothing of theirs is skipped.
  const source = (name: string): string => `[[ -r "$TC_ORIG_ZDOTDIR/${name}" ]] && source "$TC_ORIG_ZDOTDIR/${name}"\n`
  return [
    { path: join(zdir, '.zshenv'), content: source('.zshenv') },
    { path: join(zdir, '.zprofile'), content: source('.zprofile') },
    { path: join(zdir, '.zshrc'), content: source('.zshrc') + ZSH_HOOKS },
    { path: join(zdir, '.zlogin'), content: source('.zlogin') }
  ]
}

function bashFiles(dir: string): Array<{ path: string; content: string }> {
  return [{ path: join(dir, 'bash', 'bashrc'), content: `[[ -r "$HOME/.bashrc" ]] && source "$HOME/.bashrc"\n` + BASH_HOOKS }]
}

export function shellIntegrationFor(i: ShellIntegrationInput): ShellIntegration {
  const none: ShellIntegration = { env: { ...i.env }, args: [...(i.args ?? [])], files: [], shell: null }
  if (!i.absentCommand) return none
  const name = basename(i.command)
  if (name === 'zsh') {
    const files = zshFiles(i.dir)
    return {
      env: { ...i.env, TC_ORIG_ZDOTDIR: i.env['ZDOTDIR'] ?? i.env['HOME'] ?? '', ZDOTDIR: join(i.dir, 'zsh') },
      args: [...(i.args ?? [])],
      files,
      shell: 'zsh'
    }
  }
  if (name === 'bash') {
    const files = bashFiles(i.dir)
    return { env: { ...i.env }, args: ['--rcfile', files[0]!.path, ...(i.args ?? [])], files, shell: 'bash' }
  }
  return none
}
