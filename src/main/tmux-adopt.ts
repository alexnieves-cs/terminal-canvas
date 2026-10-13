import { execFile } from 'node:child_process'
import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc-contract'
import { ADOPT_LIST_ARGS, parseAdoptable, type AdoptableSession } from '../shared/tmux-adopt'
import { whichFromEnv } from './shell-env'

/**
 * The UX pass (5.5). The impure half of `shared/tmux-adopt.ts`: run its one
 * read-only argv against the person's DEFAULT tmux server (no `-L`, on
 * purpose — that is where their own sessions are) and parse the answer.
 *
 * Nothing here takes a subcommand from outside: the argv is the shared
 * constant, so this door cannot be turned into kill-server. No server running
 * is an empty answer, not an error. `loginEnv` is read at USE (main's rule
 * 1): the probe fills it after this is installed.
 */
export function listAdoptable(tmuxPath: string): Promise<AdoptableSession[]> {
  return new Promise((resolve) => {
    execFile(tmuxPath, [...ADOPT_LIST_ARGS], { timeout: 5000 }, (error, stdout) => {
      resolve(error ? [] : parseAdoptable(String(stdout)))
    })
  })
}

export function installTmuxAdopt(loginEnv: () => Record<string, string>): void {
  ipcMain.handle(IPC.TMUX_ADOPTABLE, async () => {
    const tmuxPath = whichFromEnv('tmux', loginEnv())
    return { tmuxPath, sessions: tmuxPath === null ? [] : await listAdoptable(tmuxPath) }
  })
}
