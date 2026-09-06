import type { JSX } from 'react'
import type { PresetRow } from '@renderer/palette/commands'
import { REASON_NOT_ON_PATH } from '@renderer/palette/commands'
import type { EnvReport } from '@shared/env-report'
import { shellControl } from '@renderer/shell/shell-control'
import { probeOutcome } from '@shared/env-report'

export interface LauncherProps {
  presets: PresetRow[]
  report: EnvReport | null
  /** M107. Ask the login shell again; absent hides the control (a fixture). */
  onCheckAgain?: () => void
  onSpawnPreset: (id: string) => void
  /** M65. The fifth line: choose where and what. */
  onOpenSheet: () => void
  onOpenFile: () => void
  onNewNote: () => void
  /** A note is saved in a panel's directory; with no panel there is none. */
  noteReason: string | null
  /** M73. A chat with claude. */
  onNewChat: () => void
  /** Null when claude is on the login PATH; otherwise the reason. */
  chatReason: string | null
  /** M91. The codex door: its reason when the CLI is absent. */
  onNewCodexChat: () => void
  codexReason: string | null
  /** M120. The third door: a chat with no folder, in the app's own sandbox on the row's read-only mode. */
  onNewSandboxChat: () => void
  sandboxReason: string | null
}

/**
 * M48. The first-run launcher: not a tour, a card made of the REAL verbs.
 *
 * Rendered by Canvas when the active workspace holds no panels — a fresh
 * install, a reset, and an emptied workspace, which all want the same thing —
 * and never keyed on "nothing running": a restored canvas has no output and
 * no processes until its panels are woken, and a launcher keyed on activity
 * would appear on top of a perfectly good workspace.
 *
 * Every control calls the palette's own action, so a panel minted here is
 * indistinguishable from one minted by ⌘N. A hardcoded first-run panel is
 * SEED_PANELS with a nicer name and diverges from whatever placement and
 * presets decide later. A preset whose command is not on PATH is present and
 * DISABLED with its reason, and one line says what to install: the card is
 * also the answer to "why does Claude not appear".
 *
 * Inside .canvas and outside .world, so it never scales with the camera.
 */
const INSTALL: Record<string, string> = {
  claude: 'install the Claude Code CLI so `claude` is on your PATH',
  codex: 'install the Codex CLI so `codex` is on your PATH'
}

export function Launcher({ presets, report, onSpawnPreset, onOpenSheet, onOpenFile, onNewNote, noteReason, onNewChat, chatReason, onNewCodexChat, codexReason, onNewSandboxChat, sandboxReason, onCheckAgain }: LauncherProps): JSX.Element {
  return (
    // M65 (brief §5, The launcher): not a modal — a panel-shaped card in the
    // frame family, a chrome row and a well, its verbs as prompt lines.
    <div className="launcher pf" data-launcher data-tone="none" role="region" aria-label="Get started">
      {/* M111. No chrome row: the wordmark in the hero below is the name, and a
          second "terminal canvas" above it read as a caption to itself. */}
      <div className="launcher__well">
      {/* M111. The one place the app is allowed a moment: the wordmark over a
          light drawn from the aura tokens, and THREE DOORS as cards — the
          considered door first (`claude` at `~` is almost never the right
          place), the conversation, a file. Every door keeps .launcher__verb
          and its data-launcher-* attribute: the checks count verbs and read
          preset names, door or not. */}
      <div className="launcher__hero" aria-hidden="true">
        <span className="launcher__wordmark">terminal canvas</span>
        <span className="launcher__tagline">every agent on one canvas, one person at the desk</span>
      </div>
      <div className="launcher__doors">
        <button type="button" className="launcher__verb launcher__verb--door launcher__verb--sheet" data-launcher-sheet title="New panel… (⌘⇧N)" {...shellControl(onOpenSheet)}>
          <span className="launcher__verb-name">New panel…</span>
          <span className="launcher__verb-hint">a directory, a preset or a command, the agent's mode</span>
        </button>
        <button type="button" className="launcher__verb launcher__verb--door" data-launcher-new-chat disabled={chatReason !== null}
          title={chatReason === null ? 'A chat with claude, in your home directory' : chatReason} {...shellControl(() => { if (chatReason === null) onNewChat() })}>
          <span className="launcher__verb-name">Chat with Claude…</span>
          <span className="launcher__verb-hint">{chatReason === null ? 'a conversation panel — the same agent, no terminal' : chatReason}</span>
        </button>
        <button type="button" className="launcher__verb launcher__verb--door" data-launcher-open-file title="Open a file as a panel" {...shellControl(onOpenFile)}>
          <span className="launcher__verb-name">Open a file…</span>
          <span className="launcher__verb-hint">a file panel, editable</span>
        </button>
      </div>
      <div className="launcher__verbs">
        {presets.map((p) => {
          const cli = p.subtitle.split(' ')[0]
          const install = p.available ? undefined : (INSTALL[cli] ?? INSTALL[p.name.toLowerCase().split(' ')[0]])
          return (
            <button
              key={p.id}
              type="button"
              className="launcher__verb"
              data-launcher-preset={p.id}
              disabled={!p.available}
              title={p.available ? `Start ${p.name} ${p.subtitle.replace(/^.*— /, 'in ')}` : `${REASON_NOT_ON_PATH}${install ? ` — ${install}` : ''}`}
              {...shellControl(() => { if (p.available) onSpawnPreset(p.id) })}
            >
              {/* M91. A verb reads as an invitation, not a preset's name: `Start Claude…`
                  says what the click does where `Claude` only says what it is. */}
              <span className="launcher__verb-name">Start {p.name}…</span>
              <span className="launcher__verb-hint">{p.available ? `in ${p.subtitle.replace(/^.*— /, '')}` : `${REASON_NOT_ON_PATH}${install ? ` — ${install}` : ''}`}</span>
            </button>
          )
        })}
        {/* M90/M91. The second backend's door, beside the first, disabled by name. */}
        <button type="button" className="launcher__verb" data-launcher-new-codex disabled={codexReason !== null}
          title={codexReason === null ? 'A chat with codex, in your home directory' : codexReason} {...shellControl(() => { if (codexReason === null) onNewCodexChat() })}>
          <span className="launcher__verb-name">Chat with Codex…</span>
          <span className="launcher__verb-hint">{codexReason === null ? 'a conversation panel — codex, one process per turn' : codexReason}</span>
        </button>
        {/* M120. The third conversation door: no folder at all — the app's own sandbox, read-only tools. */}
        <button type="button" className="launcher__verb" data-launcher-new-sandbox disabled={sandboxReason !== null}
          title={sandboxReason === null ? 'A chat with claude in a folder of the app\'s own, on plan mode — no repository, no edits' : sandboxReason} {...shellControl(() => { if (sandboxReason === null) onNewSandboxChat() })}>
          <span className="launcher__verb-name">New chat (no folder)…</span>
          <span className="launcher__verb-hint">{sandboxReason === null ? 'a conversation not about a repository — read-only, nowhere to write' : sandboxReason}</span>
        </button>
        {/* On an empty canvas "select a panel first" names an impossible fix;
            the launcher's own reason says what to do here. */}
        <button type="button" className="launcher__verb" data-launcher-new-note disabled={noteReason !== null}
          title={noteReason === null ? 'A note, saved beside the selected panel' : 'start a panel first — a note is saved in its directory'} {...shellControl(() => { if (noteReason === null) onNewNote() })}>
          <span className="launcher__verb-name">New note…</span>
          <span className="launcher__verb-hint">{noteReason === null ? 'a note panel' : 'start a panel first — a note is saved in its directory'}</span>
        </button>
      </div>
      {report !== null && (() => {
        // M107. THREE STATES: found, not found, and "the shell didn't answer" —
        // the last with its fix and a way to ask again, never read as not installed.
        const outcome = probeOutcome(report)
        return (
          <p className="launcher__env" data-launcher-env data-launcher-env-kind={outcome.kind}>
            <span data-tone={outcome.kind === 'found' ? 'idle' : outcome.kind === 'no-answer' ? 'needs-you' : 'exited'}>{outcome.sentence}</span>
            {' — '}<span className="launcher__env-hint">Environment… in ⌘K</span>
            {onCheckAgain !== undefined && (
              <button type="button" className="pf__verb pf__verb--word launcher__check" data-launcher-check-again title="Ask the login shell again and report what it finds" {...shellControl(onCheckAgain)}>Check again</button>
            )}
          </p>
        )
      })()}
      </div>
    </div>
  )
}
