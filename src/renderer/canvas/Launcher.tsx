import type { JSX } from 'react'
import type { PresetRow } from '@renderer/palette/commands'
import { REASON_NOT_ON_PATH } from '@renderer/palette/commands'
import type { EnvReport } from '@shared/env-report'
import { shellControl } from '@renderer/shell/shell-control'

export interface LauncherProps {
  presets: PresetRow[]
  report: EnvReport | null
  onSpawnPreset: (id: string) => void
  /** M65. The fifth line: choose where and what. */
  onOpenSheet: () => void
  onOpenFile: () => void
  onNewNote: () => void
  /** A note is saved in a panel's directory; with no panel there is none. */
  noteReason: string | null
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

export function Launcher({ presets, report, onSpawnPreset, onOpenSheet, onOpenFile, onNewNote, noteReason }: LauncherProps): JSX.Element {
  const found = report ? report.clis.filter((c) => c.path !== null).map((c) => c.name) : []
  const missing = report ? report.clis.filter((c) => c.path === null).map((c) => c.name) : []
  return (
    // M65 (brief §5, The launcher): not a modal — a panel-shaped card in the
    // frame family, a chrome row and a well, its verbs as prompt lines.
    <div className="launcher pf" data-launcher data-tone="none" role="region" aria-label="Get started">
      <div className="launcher__chrome pf__chrome">
        <span className="launcher__title">terminal canvas</span>
      </div>
      <div className="launcher__well">
      <div className="launcher__verbs">
        {/* The considered door first: `claude` at `~` is almost never the
            right place, and the line that asks where should lead. */}
        <button type="button" className="launcher__verb launcher__verb--sheet" data-launcher-sheet title="New panel… (⌘⇧N)" {...shellControl(onOpenSheet)}>
          <span className="launcher__verb-name">New panel…</span>
          <span className="launcher__verb-hint">a directory, a preset or a command, the agent's mode</span>
        </button>
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
              title={p.available ? `New ${p.name} panel` : `${REASON_NOT_ON_PATH}${install ? ` — ${install}` : ''}`}
              {...shellControl(() => { if (p.available) onSpawnPreset(p.id) })}
            >
              <span className="launcher__verb-name">{p.name}</span>
              <span className="launcher__verb-hint">{p.available ? `in ${p.subtitle.replace(/^.*— /, '')}` : `${REASON_NOT_ON_PATH}${install ? ` — ${install}` : ''}`}</span>
            </button>
          )
        })}
        <button type="button" className="launcher__verb" data-launcher-open-file title="Open a file as a panel" {...shellControl(onOpenFile)}>
          <span className="launcher__verb-name">Open a file…</span>
          <span className="launcher__verb-hint">a file panel, editable</span>
        </button>
        {/* On an empty canvas "select a panel first" names an impossible fix;
            the launcher's own reason says what to do here. */}
        <button type="button" className="launcher__verb" data-launcher-new-note disabled={noteReason !== null}
          title={noteReason === null ? 'A note, saved beside the selected panel' : 'start a panel first — a note is saved in its directory'} {...shellControl(() => { if (noteReason === null) onNewNote() })}>
          <span className="launcher__verb-name">New note…</span>
          <span className="launcher__verb-hint">{noteReason === null ? 'a note panel' : 'start a panel first — a note is saved in its directory'}</span>
        </button>
      </div>
      {report !== null && (
        <p className="launcher__env" data-launcher-env>
          {found.length > 0 ? `found: ${found.join(', ')}` : 'found: nothing'}
          {missing.length > 0 ? ` · not found: ${missing.join(', ')}` : ''}
          {' — '}<span className="launcher__env-hint">Environment… in ⌘K</span>
        </p>
      )}
      </div>
    </div>
  )
}
