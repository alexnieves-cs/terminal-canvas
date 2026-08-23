import type { JSX } from 'react'
import { TerminalPanel } from './components/TerminalPanel'

/**
 * M1 scope: exactly one hardcoded panel. No canvas, no panel list, no
 * persistence. The point is to prove the PTY path end to end before any
 * transform math exists to confuse the diagnosis.
 */
export function App(): JSX.Element {
  return (
    <div className="app">
      <TerminalPanel
        panelId="m1-panel"
        cwd="~"
        command={SHELL_COMMAND}
        args={[]}
        title="shell"
      />
    </div>
  )
}

// $SHELL itself, not tmux. tmux backing arrives in M4; keeping it out of M1
// means a PTY bug cannot hide behind a tmux bug.
const SHELL_COMMAND = '/bin/zsh'
