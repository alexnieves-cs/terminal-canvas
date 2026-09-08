import type { JSX } from 'react'
import type { PresetRow } from '@renderer/palette/commands'
import { REASON_NOT_ON_PATH } from '@renderer/palette/commands'
import type { EnvReport } from '@shared/env-report'
import { shellControl } from '@renderer/shell/shell-control'
import { probeOutcome } from '@shared/env-report'
import type { UpdateState } from '@renderer/session/update-store'
import { displayPath } from '@shared/display-path'
import { TMUX_HINT } from './hints'
import { onboardingReadiness } from '@shared/onboarding'

export interface LauncherProps {
  presets: PresetRow[]
  report: EnvReport | null
  /** M107. Ask the login shell again; absent hides the control (a fixture). */
  onCheckAgain?: () => void
  onOpenSetup?: (url: string) => void
  /**
   * M181. The primary's door. On a FIRST RUN (no starter record on the
   * workspace) it lays the starter canvas out around the conversation; on a
   * returning canvas it mints the chat alone. Absent (a fixture): the
   * primary falls back to onNewChat / onNewCodexChat.
   */
  onStart?: (engine: 'claude' | 'codex') => void
  starterFirstRun?: boolean
  /** M181. The `Starter canvas…` prompt line; its reason when every key is applied. Absent hides the line. */
  onOpenStarter?: () => void
  starterReason?: string | null
  /** M173. The tmux notice as a first-run banner: the backend's reason, or null once seen or when tmux is there. */
  tmux?: string | null
  onDismissTmux?: () => void
  /** M174. The last folders panels were started in (`spawn:recent`), newest first; a chip opens the sheet, which lists them. Absent or empty: no row. */
  recents?: string[]
  /** M174. A recents chip opens the sheet SEEDED with its folder (the Act III critic: a chip that names a folder and opens a sheet on another lies). */
  onOpenRecent?: (dir: string) => void
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
  /** M123. The last update check (update-store.ts); the footer gains a line only on `newer`. Absent in a fixture. */
  update?: UpdateState | null
  /** M123. Open the release page through main's link door; absent hides the verb. */
  onOpenRelease?: (url: string) => void
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

export function Launcher({ presets, report, tmux, onDismissTmux, recents, onOpenRecent, onSpawnPreset, onOpenSheet, onOpenFile, onNewNote, noteReason, onNewChat, chatReason, onNewCodexChat, codexReason, onNewSandboxChat, sandboxReason, onCheckAgain, onOpenSetup, onStart, starterFirstRun, onOpenStarter, starterReason, update, onOpenRelease }: LauncherProps): JSX.Element {
  // M180. ONE start. Readiness (the env report's fresh probe) is the one
  // source of truth for the primary: the preset rows' cached `which` and the
  // report disagreed after Check again (the critic), and the mint itself is
  // refused by name in main when the binary is really gone.
  const readiness = onboardingReadiness(report)
  const engine = readiness.preferred
  const engineName = engine === 'claude' ? 'Claude' : 'Codex'
  const startReason = engine === undefined ? 'Install Claude Code or Codex, then Check again' : null
  const unanswered = readiness.rows.some((row) => row.discovery === 'unknown')
  const firstRun = starterFirstRun === true && onStart !== undefined
  return (
    // M65 (brief §5, The launcher): not a modal — a panel-shaped card in the
    // frame family, a chrome row and a well, its verbs as prompt lines.
    <div className="launcher pf" data-launcher data-tone="none" role="region" aria-label="Get started">
      {/* M111. No chrome row: the wordmark in the hero below is the name, and a
          second "terminal canvas" above it read as a caption to itself. */}
      <div className="launcher__well">
        {tmux !== undefined && tmux !== null && (
          <p className="launcher__banner" data-launcher-tmux role="status" title={tmux}>
            {TMUX_HINT.text}
            <button type="button" className="pf__verb pf__verb--word launcher__banner-dismiss" data-launcher-tmux-dismiss title="Dismiss this notice" {...shellControl(() => onDismissTmux?.())}>Got it</button>
          </p>
        )}
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
      {/* M180. THE ONE START (the 5.0 brief, First launch): a filled primary
          — the surface's one, through `.is-primary` — then one sentence per
          engine, `Setup guide` only where a person is needed, and Check
          again beside the rows it serves. Installed never means signed in:
          the row says so, and the first message is what checks it. */}
      <div className="launcher__onboarding" data-onboarding>
        <button type="button" className="launcher__verb launcher__start is-primary" data-onboarding-start data-onboarding-starter={firstRun ? 'first-run' : 'chat'}
          disabled={startReason !== null} title={startReason ?? `Start with ${engineName}`}
          {...shellControl(() => { if (startReason === null && engine !== undefined) { if (onStart !== undefined) onStart(engine); else if (engine === 'claude') onNewChat(); else onNewCodexChat() } })}>
          <span className="launcher__verb-name">Start a conversation</span>
          {/* M181. On a first run the hint says what else the click lays out, so five objects are not a surprise. */}
          <span className="launcher__verb-hint">{engine === undefined ? (unanswered ? 'Discovery has not answered yet — Check again asks the login shell once more' : 'Install Claude Code or Codex below, then Check again — no terminal knowledge needed') : firstRun ? `With ${engineName} · opens your canvas with a captioned example of each kind beside it` : `With ${engineName} · write your first message in plain language`}</span>
        </button>
        <div className="launcher__readiness" aria-label="Conversation engines">
          {readiness.rows.map((row) => <div key={row.backend} className="launcher__engine" data-onboarding-engine={row.backend} data-discovery={row.discovery}>
            <span>{row.sentence}</span>
            {row.discovery !== 'installed' && (
              <button type="button" className="pf__verb pf__verb--word" disabled={onOpenSetup === undefined}
                title={onOpenSetup === undefined ? 'Setup links are unavailable in this view' : row.setupUrl}
                {...shellControl(() => onOpenSetup?.(row.setupUrl))}>Setup guide</button>
            )}
          </div>)}
          {onCheckAgain !== undefined && (
            <div className="launcher__engine launcher__engine--check">
              <span>{unanswered ? 'The login shell did not answer in time — a slow ~/.zshrc; put PATH in ~/.zprofile.' : 'Installed something? Ask the login shell again.'}</span>
              <button type="button" className="pf__verb pf__verb--word launcher__check" data-launcher-check-again title="Ask the login shell again and report what it finds" {...shellControl(onCheckAgain)}>Check again</button>
            </div>
          )}
        </div>
      </div>
      {/* M180. The Chat with Claude card steps down to a prompt line while the
          primary above it is live (two doors to one chat read as two things);
          it stays a card, with its alias, when the primary is disabled. */}
      <div className="launcher__doors">
        <button type="button" className="launcher__verb launcher__verb--door launcher__verb--sheet" data-launcher-sheet title="New panel… (⌘⇧N)" {...shellControl(onOpenSheet)}>
          <span className="launcher__verb-name">New panel…</span>
          <span className="launcher__verb-hint">a directory, a preset or a command, the agent's mode</span>
        </button>
        {startReason !== null && (
          <button type="button" className="launcher__verb launcher__verb--door" data-launcher-new-chat disabled={chatReason !== null}
            title={chatReason === null ? 'A chat with claude, in your home directory' : chatReason} {...shellControl(() => { if (chatReason === null) onNewChat() })}>
            <span className="launcher__verb-name">Chat with Claude…</span>
            <span className="launcher__verb-hint">{chatReason === null ? 'a conversation panel — the same agent, no terminal' : chatReason}</span>
          </button>
        )}
        <button type="button" className="launcher__verb launcher__verb--door" data-launcher-open-file title="Open a file as a panel" {...shellControl(onOpenFile)}>
          <span className="launcher__verb-name">Open a file…</span>
          <span className="launcher__verb-hint">a file panel, editable</span>
        </button>
      </div>
      {/* M174. RECENTS: the last folders as chips, newest first; a chip opens the
          sheet (whose WHERE field lists them) — the launcher mints nothing itself. */}
      {recents !== undefined && recents.length > 0 && (
        <div className="launcher__recents" data-launcher-recents>
          <span className="launcher__recents-label">Recent</span>
          {recents.slice(0, 5).map((dir) => (
            <button key={dir} type="button" className="launcher__recent" data-launcher-recent={dir} title={`New panel in ${dir}`} {...shellControl(() => (onOpenRecent ?? onOpenSheet)(dir))}>{displayPath(dir).short}</button>
          ))}
        </div>
      )}
      <div className="launcher__verbs">
        {/* M181. The starter as a prompt line for a RETURNING empty canvas (on a first run the primary is that door — two doors to one thing on one screen, the critic); disabled by name once every key is applied or with no engine. */}
        {onOpenStarter !== undefined && !firstRun && (
          <button type="button" className="launcher__verb" data-launcher-starter disabled={(starterReason ?? null) !== null}
            title={starterReason ?? 'Your agent and one captioned example of each kind of object'} {...shellControl(() => { if ((starterReason ?? null) === null) onOpenStarter() })}>
            <span className="launcher__verb-name">Starter canvas…</span>
            <span className="launcher__verb-hint">{starterReason ?? 'your agent and one captioned example of each kind of object'}</span>
          </button>
        )}
        {startReason === null && (
          <button type="button" className="launcher__verb" data-launcher-new-chat disabled={chatReason !== null}
            title={chatReason === null ? 'A chat with claude, in your home directory' : chatReason} {...shellControl(() => { if (chatReason === null) onNewChat() })}>
            <span className="launcher__verb-name">Chat with Claude…</span>
            <span className="launcher__verb-hint">{chatReason === null ? 'a conversation panel — the same agent, no terminal' : chatReason}</span>
          </button>
        )}
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
              title={p.available ? `Start ${p.name} in ${p.cwd ?? p.subtitle.replace(/^.*— /, '')}` : `${REASON_NOT_ON_PATH}${install ? ` — ${install}` : ''}`}
              {...shellControl(() => { if (p.available) onSpawnPreset(p.id) })}
            >
              {/* M91. A verb reads as an invitation, not a preset's name: `Start Claude…`
                  says what the click does where `Claude` only says what it is. */}
              <span className="launcher__verb-name">Start {p.name}…</span>
              {/* M174. The face rule: the COMMAND alone is mono; the name and the hint are sentences. */}
              {p.command !== undefined && <span className="launcher__verb-command">{p.command}</span>}
              {/* The path rule: the directory's short form at rest, the full path on the button's title (above). */}
              <span className="launcher__verb-hint">{p.available ? `in ${p.cwd === undefined ? p.subtitle.replace(/^.*— /, '') : displayPath(p.cwd).short}` : `${REASON_NOT_ON_PATH}${install ? ` — ${install}` : ''}`}</span>
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
            {/* M174. ONE calm sentence. M180: the readiness rows above now say
                found / not found / unanswered per engine, so the probe's own
                sentence rides the TITLE and the line points at the full report
                — the same fact twice on one card was the critic's finding. */}
            <span data-tone={outcome.kind === 'found' ? 'idle' : outcome.kind === 'no-answer' ? 'needs-you' : 'exited'} title={outcome.sentence}>{outcome.kind === 'no-answer' ? 'The shell did not answer' : outcome.kind === 'found' ? 'Discovery done' : 'Some engines are missing'}</span>
            {' — '}<span className="launcher__env-hint">the full report is Environment… in ⌘K</span>
          </p>
        )
      })()}
      {/* M123. A second footer line ONLY when the last check said `newer`:
          `current` and `could-not-check` say nothing here (the environment
          rows carry them), because a launcher that reported "up to date" on
          every fresh install would be a line nobody reads. A NOTICE — the
          verb opens the release page through main's link door; nothing is
          downloaded or installed (auto-swap is declined by name for an
          unsigned build). */}
      {update !== undefined && update !== null && update.result !== null && update.result.kind === 'newer' && (() => {
        const url = update.result.url
        return (
          <p className="launcher__env" data-launcher-update data-launcher-update-version={update.result.version}>
            <span data-tone="needs-you">{update.result.version} is out</span>
            {' — '}<span className="launcher__env-hint">the app does not install it — download from the release page</span>
            {onOpenRelease !== undefined && (
              <button type="button" className="pf__verb pf__verb--word launcher__check" data-launcher-open-release title={url} {...shellControl(() => onOpenRelease(url))}>Open release</button>
            )}
          </p>
        )
      })()}
      </div>
    </div>
  )
}
