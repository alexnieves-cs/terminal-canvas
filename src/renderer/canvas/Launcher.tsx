import { useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { PresetRow } from '@renderer/palette/commands'
import { REASON_NOT_ON_PATH } from '@renderer/palette/commands'
import type { EnvReport } from '@shared/env-report'
import { shellControl } from '@renderer/shell/shell-control'
import { probeOutcome } from '@shared/env-report'
import type { UpdateState } from '@renderer/session/update-store'
import { displayPath } from '@shared/display-path'
import { TMUX_HINT } from './hints'
import { firstWorkPlan, onboardingReadiness, LANE_ENGINE, type FirstWorkContext, type FirstWorkOutcome, type FirstWorkRequest } from '@shared/onboarding'

export interface LauncherProps {
  presets: PresetRow[]
  report: EnvReport | null
  /** M107. Ask the login shell again; absent hides the control (a fixture). */
  onCheckAgain?: () => void
  onOpenSetup?: (url: string) => void
  /**
   * M205 (D09). THE PRIMARY: a sentence and a folder, run through D05's Start
   * work. Absent (a fixture): the primary is present and disabled by name.
   */
  onStartWork?: (req: FirstWorkRequest) => Promise<FirstWorkOutcome>
  /** M205. The ONE alternative: a conversation with no folder, the sentence already in its composer. */
  onAsk?: (intention: string) => void
  /** M205. After `not-a-repository`: a conversation in THAT folder, the sentence inserted, never sent. */
  onChatHere?: (req: FirstWorkRequest) => void
  /** M205. The folder dialog (`teammate:choose-place`); absent hides Choose…. */
  onChooseFolder?: () => Promise<string | null>
  /** M205. The roster, so the summary can say whether a teammate is reused or minted before either happens. */
  teammates?: FirstWorkContext['teammates']
  /** M190. Import a canvas… — absent hides the line (a fixture). */
  onImportCanvas?: () => void
  /** M181. The `Starter canvas…` line; its reason when every key is applied. Absent hides the line. */
  onOpenStarter?: () => void
  starterReason?: string | null
  /** M173. The tmux notice as a first-run banner: the backend's reason, or null once seen or when tmux is there. */
  tmux?: string | null
  onDismissTmux?: () => void
  /** M174. The last folders panels were started in (`spawn:recent`), newest first. M205: a chip FILLS the folder field. */
  recents?: string[]
  onSpawnPreset: (id: string) => void
  /** M65. Choose where and what. */
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
 * M205 (D09). INTENT FIRST. The card asks what the person wants to work on
 * and in which repository, and its primary is D05's Start work — so a new
 * person starts through the same path a returning one does. One clear
 * alternative (a conversation with no folder), and every other door under
 * ONE closed disclosure, each still present and disabled by name where it
 * cannot run: a row that vanished would read as a feature never built. The
 * five start-a-chat-or-shell rows were five because each names a REAL
 * distinction (D01 §4); asking for the folder and the intention first is what
 * stops most of them being a choice at this moment, not deleting them.
 *
 * The starter is an OPTIONAL line inside the disclosure and the primary never
 * lays it out: before M205 the only way a new person reached a conversation
 * also minted five objects, which made the tour the definition of a workspace.
 *
 * Inside .canvas and outside .world, so it never scales with the camera.
 */
const INSTALL: Record<string, string> = {
  claude: 'install the Claude Code CLI so `claude` is on your PATH',
  codex: 'install the Codex CLI so `codex` is on your PATH'
}

export function Launcher({ presets, onImportCanvas, report, tmux, onDismissTmux, recents, onSpawnPreset, onOpenSheet, onOpenFile, onNewNote, noteReason, onNewChat, chatReason, onNewCodexChat, codexReason, onCheckAgain, onOpenSetup, onStartWork, onAsk, onChatHere, onChooseFolder, teammates, onOpenStarter, starterReason, update, onOpenRelease }: LauncherProps): JSX.Element {
  const readiness = onboardingReadiness(report)
  const unanswered = readiness.rows.some((row) => row.discovery === 'unknown')
  const [intention, setIntention] = useState('')
  const [folder, setFolder] = useState('')
  const [busy, setBusy] = useState(false)
  // The answer of the LAST press, cleared by any edit: a refusal that outlived
  // the input it was about would describe a start nobody is asking for.
  const [answer, setAnswer] = useState<Exclude<FirstWorkOutcome, { kind: 'started' }> | null>(null)
  const intentRef = useRef<HTMLTextAreaElement | null>(null)
  const folderRef = useRef<HTMLInputElement | null>(null)

  const plan = firstWorkPlan({ intention, folder }, { teammates: teammates ?? [], readiness })
  const startReason = onStartWork === undefined ? 'Start work is unavailable in this view' : plan.kind === 'refused' ? plan.reason : null
  const askReason = onAsk === undefined ? 'a conversation is unavailable in this view'
    : readiness.preferred === undefined ? (unanswered ? 'discovery has not answered yet — Check again' : 'install Claude Code or Codex, then Check again') : null
  // Readiness ONLY AS NEEDED (guide step 2): with no engine, every row and
  // Check again; with one, its own line — and Claude's row whenever Claude is
  // not the one found, because Start work needs it. The three discovery
  // states stay three; a row not shown here is in Environment… (⌘K).
  const shownRows = readiness.rows.filter((row) => readiness.preferred === undefined || row.backend === readiness.preferred || row.backend === LANE_ENGINE)
  const needsCheck = shownRows.some((row) => row.discovery !== 'installed')

  // preventScroll: the launcher sits inside `.canvas`, the clipping host, and
  // a plain focus() may scroll it — offsetting the camera's geometry.
  useEffect(() => { intentRef.current?.focus({ preventScroll: true }) }, [])

  // Cmd+V / Cmd+C are the app menu's accelerators (main/menu.ts): the page is
  // never handed a native paste, and on an empty canvas no panel has the
  // keyboard to take one. A text surface serves itself (CLAUDE.md, Gotchas;
  // Palette.tsx is the precedent). A pasted folder path is the likeliest
  // paste on this card, so without this the folder field is type-only.
  useEffect(() => {
    const edit = typeof window === 'undefined' ? undefined : window.canvas?.edit
    if (edit === undefined) return
    const target = (): { el: HTMLTextAreaElement | HTMLInputElement; set: (v: string) => void } | null => {
      const active = document.activeElement
      if (active !== null && active === intentRef.current) return { el: intentRef.current, set: setIntention }
      if (active !== null && active === folderRef.current) return { el: folderRef.current, set: setFolder }
      return null
    }
    const offPaste = edit.onPaste((text) => {
      const t = target()
      if (t === null || !text) return
      const { selectionStart: start, selectionEnd: end, value } = t.el
      t.set(start === null || end === null ? value + text : value.slice(0, start) + text + value.slice(end))
      setAnswer(null)
      // The caret after the paste, once React has committed the new value.
      const at = (start ?? value.length) + text.length
      const el = t.el
      requestAnimationFrame(() => { if (document.activeElement === el) el.setSelectionRange(at, at) })
    })
    const offCopy = edit.onCopy(() => {
      const t = target()
      if (t === null) return
      const { selectionStart: start, selectionEnd: end } = t.el
      if (start === null || end === null || start === end) return
      void navigator.clipboard.writeText(t.el.value.slice(start, end))
    })
    return () => { offPaste(); offCopy() }
  }, [])

  const start = (): void => {
    if (busy || startReason !== null || onStartWork === undefined) return
    setBusy(true); setAnswer(null)
    void onStartWork({ intention, folder }).then((result) => {
      setBusy(false)
      if (result.kind !== 'started') setAnswer(result)
    }).catch((e: unknown) => {
      setBusy(false)
      setAnswer({ kind: 'refused', reason: e instanceof Error ? e.message : 'the start did not answer' })
    })
  }
  // Enter starts from either FIELD; Shift+Enter is a new line in the sentence.
  // Only from a field: the handler sits on the form, and Enter on a focused
  // button (Ask, Choose…, a chip) is that button's own click — the first cut
  // ran Start work instead, minting a grant for a person who asked for the
  // no-folder door (the M205 critic).
  const onKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.target !== intentRef.current && event.target !== folderRef.current) return
    event.preventDefault(); start()
  }
  const edited = (set: (v: string) => void) => (value: string): void => { set(value); setAnswer(null) }

  return (
    // M65 (brief §5, The launcher): not a modal — a panel-shaped card in the
    // frame family, a chrome row and a well, its verbs as prompt lines.
    <div className="launcher pf" data-launcher data-tone="none" role="region" aria-label="Get started">
      <div className="launcher__well">
        {tmux !== undefined && tmux !== null && (
          <p className="launcher__banner" data-launcher-tmux role="status" title={tmux}>
            {TMUX_HINT.text}
            <button type="button" className="pf__verb pf__verb--word launcher__banner-dismiss" data-launcher-tmux-dismiss title="Dismiss this notice" {...shellControl(() => onDismissTmux?.())}>Got it</button>
          </p>
        )}
      <div className="launcher__hero" aria-hidden="true">
        <span className="launcher__wordmark">terminal canvas</span>
        <span className="launcher__tagline">every agent on one canvas, one person at the desk</span>
      </div>
      <div className="launcher__onboarding launcher__intent" data-onboarding role="form" aria-label="Start work" onKeyDown={onKey}>
        <label className="launcher__field">
          <span className="launcher__label">What do you want to work on?</span>
          <textarea ref={intentRef} className="launcher__input launcher__input--sentence" data-onboarding-intent rows={2} value={intention} spellCheck
            placeholder="In plain language — for example, make the login test stop failing on CI"
            onChange={(e) => edited(setIntention)(e.target.value)} />
        </label>
        <label className="launcher__field">
          <span className="launcher__label">In which repository?</span>
          <span className="launcher__folder-row">
            <input ref={folderRef} className="launcher__input launcher__input--path" data-onboarding-folder value={folder} spellCheck={false}
              placeholder="/Users/you/code/project" onChange={(e) => edited(setFolder)(e.target.value)} />
            {onChooseFolder !== undefined && (
              <button type="button" className="pf__verb pf__verb--word" data-onboarding-choose title="Choose a folder with the system dialog"
                {...shellControl(() => { void onChooseFolder().then((dir) => { if (dir !== null) edited(setFolder)(dir) }) })}>Choose…</button>
            )}
          </span>
        </label>
        {/* M174/M205. The last folders as chips; a chip FILLS the field — the
            launcher mints nothing on a click that only answers a question. */}
        {recents !== undefined && recents.length > 0 && (
          <div className="launcher__recents" data-launcher-recents>
            <span className="launcher__recents-label">Recent</span>
            {recents.slice(0, 5).map((dir) => (
              <button key={dir} type="button" className="launcher__recent" data-launcher-recent={dir} aria-pressed={folder === dir} title={`Work in ${dir}`}
                {...shellControl(() => edited(setFolder)(dir))}>{displayPath(dir).short}</button>
            ))}
          </div>
        )}
        {/* What will happen — the grant included — before anything does; or the
            one thing still missing. One sentence, never a list of three. */}
        <p className="launcher__summary" data-onboarding-summary={plan.kind === 'start' ? 'start' : plan.field} title={plan.kind === 'start' ? plan.folder : undefined}>
          {plan.kind === 'start' ? plan.summary : plan.reason}
        </p>
        {answer !== null && (
          <p className="launcher__refusal" data-onboarding-refusal={answer.kind} role="alert">
            {answer.reason}
            {answer.kind === 'not-a-repository' && onChatHere !== undefined && (
              <button type="button" className="pf__verb pf__verb--word launcher__check" data-onboarding-chat-here
                title="A conversation in this folder, your sentence in its composer — nothing is sent"
                {...shellControl(() => onChatHere({ intention, folder }))}>Chat in this folder instead</button>
            )}
          </p>
        )}
        <div className="launcher__actions">
          <button type="button" className="launcher__verb launcher__start is-primary" data-onboarding-start
            disabled={startReason !== null || busy} title={startReason ?? (plan.kind === 'start' ? plan.summary : '')}
            {...shellControl(start)}>
            <span className="launcher__verb-name">{busy ? 'Making the lane…' : 'Start work'}</span>
          </button>
          <button type="button" className="launcher__verb launcher__ask" data-onboarding-ask disabled={askReason !== null}
            title={askReason ?? 'A conversation with no folder — read-only, nothing to write to. Your sentence goes in its composer.'}
            {...shellControl(() => { if (askReason === null) onAsk?.(intention) })}>
            <span className="launcher__verb-name">Ask without a folder</span>
          </button>
        </div>
        <div className="launcher__readiness" aria-label="Conversation engines">
          {shownRows.map((row) => <div key={row.backend} className="launcher__engine" data-onboarding-engine={row.backend} data-discovery={row.discovery}>
            <span>{row.sentence}</span>
            {row.discovery !== 'installed' && (
              <button type="button" className="pf__verb pf__verb--word" disabled={onOpenSetup === undefined}
                title={onOpenSetup === undefined ? 'Setup links are unavailable in this view' : row.setupUrl}
                {...shellControl(() => onOpenSetup?.(row.setupUrl))}>Setup guide</button>
            )}
          </div>)}
          {onCheckAgain !== undefined && needsCheck && (
            <div className="launcher__engine launcher__engine--check">
              <span>{unanswered ? 'The login shell did not answer in time — a slow ~/.zshrc; put PATH in ~/.zprofile.' : 'Installed something? Ask the login shell again.'}</span>
              <button type="button" className="pf__verb pf__verb--word launcher__check" data-launcher-check-again title="Ask the login shell again and report what it finds" {...shellControl(onCheckAgain)}>Check again</button>
            </div>
          )}
        </div>
      </div>
      {/* M205. EVERY OTHER DOOR, one closed disclosure: progressive, never
          removed. A native <details> so the keyboard reaches its summary and
          the rows inside stay in the DOM for the reach checks. */}
      <details className="launcher__more" data-launcher-more>
        <summary className="launcher__more-toggle" data-launcher-more-toggle>More ways to start</summary>
      <div className="launcher__doors">
        <button type="button" className="launcher__verb launcher__verb--door launcher__verb--sheet" data-launcher-sheet title="New panel… (⌘⇧N)" {...shellControl(onOpenSheet)}>
          <span className="launcher__verb-name">New panel…</span>
          <span className="launcher__verb-hint">a directory, a preset or a command, the agent's mode</span>
        </button>
        <button type="button" className="launcher__verb launcher__verb--door" data-launcher-open-file title="Open a file as a panel" {...shellControl(onOpenFile)}>
          <span className="launcher__verb-name">Open a file…</span>
          <span className="launcher__verb-hint">a file panel, editable</span>
        </button>
      </div>
      <div className="launcher__verbs">
        {/* M181/M205. The starter as an OPTIONAL learning path — disabled by name once every key is applied or with no engine. */}
        {onOpenStarter !== undefined && (
          <button type="button" className="launcher__verb" data-launcher-starter disabled={(starterReason ?? null) !== null}
            title={starterReason ?? 'Your agent and one captioned example of each kind of object'} {...shellControl(() => { if ((starterReason ?? null) === null) onOpenStarter() })}>
            <span className="launcher__verb-name">Starter canvas…</span>
            <span className="launcher__verb-hint">{starterReason ?? 'optional — an agent and a captioned example of each kind of object'}</span>
          </button>
        )}
        {/* M190. Import is here because an EMPTY canvas is exactly where a
            person arrives with someone else's file; it starts nothing. */}
        {onImportCanvas !== undefined && (
          <button type="button" className="launcher__verb" data-launcher-import
            title="Read a canvas file into a new workspace; nothing in it is started"
            {...shellControl(() => { void onImportCanvas() })}>
            <span className="launcher__verb-name">Import a canvas…</span>
            <span className="launcher__verb-hint">a file someone exported — into a new workspace, with nothing started</span>
          </button>
        )}
        <button type="button" className="launcher__verb" data-launcher-new-chat disabled={chatReason !== null}
          title={chatReason === null ? 'A chat with claude, in your home directory' : chatReason} {...shellControl(() => { if (chatReason === null) onNewChat() })}>
          <span className="launcher__verb-name">Chat with Claude…</span>
          <span className="launcher__verb-hint">{chatReason === null ? 'a conversation in your home folder — no task, no branch' : chatReason}</span>
        </button>
        {/* M90/M91. The second backend's door, beside the first, disabled by name. */}
        <button type="button" className="launcher__verb" data-launcher-new-codex disabled={codexReason !== null}
          title={codexReason === null ? 'A chat with codex, in your home directory' : codexReason} {...shellControl(() => { if (codexReason === null) onNewCodexChat() })}>
          <span className="launcher__verb-name">Chat with Codex…</span>
          <span className="launcher__verb-hint">{codexReason === null ? 'a conversation with Codex in your home folder' : codexReason}</span>
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
              title={p.available ? `Start ${p.name} in ${p.cwd ?? p.subtitle.replace(/^.*— /, '')}` : `${REASON_NOT_ON_PATH}${install ? ` — ${install}` : ''}`}
              {...shellControl(() => { if (p.available) onSpawnPreset(p.id) })}
            >
              {/* M91. A verb reads as an invitation, not a preset's name. */}
              <span className="launcher__verb-name">Start {p.name}…</span>
              {/* M174. The face rule: the COMMAND alone is mono; the name and the hint are sentences. */}
              {p.command !== undefined && <span className="launcher__verb-command">{p.command}</span>}
              {/* The path rule: the directory's short form at rest, the full path on the button's title (above). */}
              <span className="launcher__verb-hint">{p.available ? `in ${p.cwd === undefined ? p.subtitle.replace(/^.*— /, '') : displayPath(p.cwd).short}` : `${REASON_NOT_ON_PATH}${install ? ` — ${install}` : ''}`}</span>
            </button>
          )
        })}
        {/* On an empty canvas "select a panel first" names an impossible fix;
            the launcher's own reason says what to do here. */}
        <button type="button" className="launcher__verb" data-launcher-new-note disabled={noteReason !== null}
          title={noteReason === null ? 'A note, saved beside the selected panel' : 'start a panel first — a note is saved in its directory'} {...shellControl(() => { if (noteReason === null) onNewNote() })}>
          <span className="launcher__verb-name">New note…</span>
          <span className="launcher__verb-hint">{noteReason === null ? 'a note panel' : 'start a panel first — a note is saved in its directory'}</span>
        </button>
      </div>
      </details>
      {report !== null && (() => {
        // M107. THREE STATES: found, not found, and "the shell didn't answer" —
        // the last with its fix and a way to ask again, never read as not installed.
        const outcome = probeOutcome(report)
        return (
          <p className="launcher__env" data-launcher-env data-launcher-env-kind={outcome.kind}>
            <span data-tone={outcome.kind === 'found' ? 'idle' : outcome.kind === 'no-answer' ? 'needs-you' : 'exited'} title={outcome.sentence}>{outcome.kind === 'no-answer' ? 'The shell did not answer' : outcome.kind === 'found' ? 'Discovery done' : 'Some engines are missing'}</span>
            {' — '}<span className="launcher__env-hint">the full report is Environment… in ⌘K</span>
          </p>
        )
      })()}
      {/* M123. A second footer line ONLY when the last check said `newer`. A
          NOTICE — the verb opens the release page through main's link door;
          nothing is downloaded or installed. */}
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
