import type { PersistedTeammate } from '@shared/teammates'
import { LINEUPS, LINEUP_IDS, lineupPlan } from '@shared/lineups'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { EFFORTS, PERMISSION_MODES, type AgentOptions, type Effort, type PermissionMode, AGENT_CAPABILITIES, AGENT_KINDS, type AgentKind } from '@shared/cost'
import type { SpawnResult } from '@shared/ipc-contract'
import { lineupWhatId, parseLineupWhatId, teammateOptions, teammateWhatId, parseTeammateWhatId, buildSpawnRequest, directorySuggestions, backendOptions, SUPERVISOR_WHAT_ID, WHAT_ID_BY_BACKEND, type SheetPreset, type SheetValues, type SheetWhat, backendOfWhatId, modelChoices, rowCapabilitySentence, PRESET_KIND_BY_BACKEND, parseEnvLines, CHAT_WHAT_ID } from './spawn-sheet'
import { type AgentBackend, BACKENDS } from '@shared/agent-backends'
import { shortPath } from './panel-name'
import type { PersistedTemplate } from '@shared/templates'
import { templateHoles } from './template-model'
import { TRIGGER_WORDS } from '@renderer/canvas/trigger-words'
import { KIND_EXPLANATIONS, engineDisplayName, lastUsedWords, runtimeDefaultsLine, type CreationKind } from '@shared/first-run'

/**
 * M65. THE SPAWN SHEET — where, what, how, in the palette's overlay.
 *
 * A form rather than a second single-field input mode: the three questions
 * are answered together, and a user who has typed a directory should not
 * lose it to choose a preset. It owns the keyboard the way the palette's
 * input does (usePalette's rules): a field in this form holds DOM focus
 * away from xterm, `Enter` anywhere submits, `Escape` cancels in one stage
 * (a sheet is not a scope), `Tab` moves between fields, and in the `where`
 * field `↑`/`↓` walk the suggestions and `Tab` or `Enter` accepts one.
 *
 * WHERE is first and holds focus on open, pre-filled and selected, so the
 * common case — start the default here — is one Enter (brief §6). The
 * critic's first render led with WHAT and read the mode fields as
 * "preset's": the preset's own values are now the placeholders.
 *
 * Nothing here spawns. Submit hands main a `SpawnRequest`; main resolves
 * the preset (an absent command stays absent), refuses a directory that is
 * not there — the reason is shown HERE, in the sheet, not in a dialog — and
 * sends the template back on the same channel the menu uses.
 */

export interface SpawnSheetModel {
  presets: readonly SheetPreset[]
  /** M80. Saved shapes of work, built-ins first; each with the reason it cannot run, when it cannot. */
  templates?: readonly { template: PersistedTemplate; refusal?: string }[]
  /** M80. The template the sheet opens on, when it was opened for one. */
  templateId?: string
  /** M80. Instantiate: the filled template, the sheet's answer in the sheet's own shape. */
  instantiate?(template: PersistedTemplate, values: Record<string, string>): Promise<SpawnResult>
  defaultPresetId: string
  /** The focused panel's live directory, when a terminal is focused. */
  focusedCwd?: string
  recents: readonly string[]
  panelDirs: readonly string[]
  submit(values: SheetValues): Promise<SpawnResult>
  /** M73. Whether claude was found — the chat arm is offered disabled by name otherwise. */
  claudeAvailable: boolean
  /** M100. The roster, for the `chat as <name>` rows. */
  teammates?: readonly PersistedTeammate[]
  /** M104. The ceiling as read live, for the lineup preview's queue line. */
  ceiling?: { maxConcurrent: number; liveAgents: number; queued?: number }
  /** M90. Whether codex was found — its chat arm is offered disabled by name otherwise. */
  codexAvailable: boolean
  /** M118. Availability by ROW, for every registered backend; the two booleans above stay for their older readers. */
  available?: Partial<Record<AgentBackend, boolean>>
  /** M99. The models live sessions have REPORTED — the model field's suggestions. Absent suggests nothing. */
  reportedModels?: readonly string[]
  /** M81. One supervisor per canvas: the row says so rather than vanishing. */
  hasSupervisor?: boolean
  /** M262. When each recent directory was last used (`spawn:recent-used`); a row with no entry says why it is offered instead. */
  recentUsed?: Readonly<Record<string, number>>
  /** M262. The task-first route: close this sheet and open Start work. Absent hides the switch. */
  startTask?(): void
  /** M403 (B8). The launcher's "Ask a question": a conversation with no folder. Absent with `askReason` shows it disabled by name. */
  askQuestion?(): void
  askReason?: string
}

export interface SpawnSheetProps {
  model: SpawnSheetModel
  onDone(): void
  onCancel(): void
}

const COMMAND = '__command__'
/** M80. A template's own value in the `what` select. */
const TEMPLATE_PREFIX = '__tpl__'

export function SpawnSheet({ model, onDone, onCancel }: SpawnSheetProps): JSX.Element {
  const firstAvailable = model.presets.find((p) => p.id === model.defaultPresetId && p.available !== false) ?? model.presets.find((p) => p.available !== false)
  const [whatId, setWhatId] = useState<string>(model.templateId !== undefined ? `${TEMPLATE_PREFIX}${model.templateId}` : (firstAvailable?.id ?? COMMAND))
  const [command, setCommand] = useState('')
  const preset = model.presets.find((p) => p.id === whatId)
  const [cwd, setCwd] = useState(model.focusedCwd ?? preset?.cwd ?? '')
  const [cwdTouched, setCwdTouched] = useState(false)
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<PermissionMode | ''>('')
  const [effort, setEffort] = useState<Effort | ''>('')
  const [modelName, setModelName] = useState('')
  // M104. Worktrees ASKED for a lineup: only agent seats get a lane (lineupPlan's rule).
  const [worktree, setWorktree] = useState(false)
  /** M147. `KEY=value` lines; parsed on submit, shown while typing. */
  const [envText, setEnvText] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  // M80. The chosen template and its parameters — ONE FIELD PER PARAMETER,
  // the composer's fill step (the sheet is a form; a form asks its fields
  // together). Its own state so switching `what` away keeps nothing.
  const [holeValues, setHoleValues] = useState<Record<string, string>>({})
  const templates = model.templates ?? []
  const chosenTemplate = templates.find((t) => `${TEMPLATE_PREFIX}${t.template.id}` === whatId)
  const holes = chosenTemplate === undefined ? [] : templateHoles(chosenTemplate.template)
  const [highlight, setHighlight] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const whereRef = useRef<HTMLInputElement | null>(null)

  // WHERE takes focus on mount, its default selected: Enter starts the
  // default preset here, typing replaces the directory. The sheet is now
  // what holds the keyboard away from xterm, as the palette's input did.
  useEffect(() => { whereRef.current?.focus(); whereRef.current?.select() }, [])

  // Choosing a preset re-seeds `where` with the preset's own directory
  // unless the user has typed one: a directory typed by hand outranks a
  // preset's default, but a preset's default outranks an untouched field.
  useEffect(() => {
    if (cwdTouched) return
    setCwd(model.focusedCwd ?? preset?.cwd ?? '')
  }, [whatId, cwdTouched, model.focusedCwd, preset?.cwd])

  const suggestions = useMemo(
    () => directorySuggestions({ typed: cwd, touched: cwdTouched, focusedCwd: model.focusedCwd, recents: model.recents, panelDirs: model.panelDirs }),
    [cwd, cwdTouched, model.focusedCwd, model.recents, model.panelDirs]
  )

  const values = (): SheetValues => {
    const teammateId = parseTeammateWhatId(whatId)
    const lineupId = parseLineupWhatId(whatId)
    const what: SheetWhat = whatId === COMMAND ? { kind: 'command', command } : lineupId !== null ? { kind: 'lineup', id: lineupId } : teammateId !== null ? { kind: 'teammate', id: teammateId } : whatId === SUPERVISOR_WHAT_ID ? { kind: 'supervisor' } : backendOfWhatId(whatId) !== undefined ? { kind: 'chat', ...(backendOfWhatId(whatId) === 'claude' ? {} : { backend: backendOfWhatId(whatId) }) } : { kind: 'preset', id: whatId }
    const agentOptions: AgentOptions = {}
    if (mode !== '') agentOptions.permissionMode = mode
    if (effort !== '') agentOptions.effort = effort
    if (modelName.trim() !== '') agentOptions.model = modelName.trim()
    const parsedEnv = parseEnvLines(envText)
    return { what, cwd, title, agentOptions, ...(lineupId !== null && worktree ? { worktree: true } : {}), ...(parsedEnv.env === undefined ? {} : { env: parsedEnv.env }) }
  }

  const submit = (): void => {
    // M80. A template makes several panels; the sheet's other fields do not
    // apply to it, and its own refusal (a missing preset, no claude) is the
    // one shown.
    if (chosenTemplate !== undefined) {
      if (chosenTemplate.refusal !== undefined) { setRefusal(chosenTemplate.refusal); return }
      const missing = holes.find((h) => (holeValues[h] ?? '').trim() === '')
      if (missing !== undefined) { setRefusal(`fill in ${missing}`); return }
      const filled: Record<string, string> = {}
      for (const h of holes) filled[h] = (holeValues[h] ?? '').trim()
      void (model.instantiate?.(chosenTemplate.template, filled) ?? Promise.resolve<SpawnResult>({ kind: 'refused', reason: 'templates cannot be started here' })).then((result) => {
        if (result.kind === 'refused') { setRefusal(result.reason); return }
        onDone()
      })
      return
    }
    const v = values()
    if (v.what.kind === 'command' && v.what.command.trim() === '') { setRefusal('type a command, or choose a preset'); return }
    if (v.cwd.trim() === '') { setRefusal('choose a directory'); return }
    void model.submit(v).then((result) => {
      if (result.kind === 'refused') { setRefusal(result.reason); return }
      onDone()
    })
  }

  // Handled ONCE: a field's own handler (the where field's) calls this and
  // the event then bubbles to the form's, so it is stopped here — the first
  // run spawned two panels per Enter.
  const onKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); return }
    // M262. Enter on a focused BUTTON is that button's own click — Cancel,
    // a Task | Panel tab. Before the footer had buttons every focusable was a
    // field; now Enter-anywhere would make a panel from Cancel (the
    // launcher's M205 critic, met again).
    if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') return
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); submit() }
  }

  const accept = (i: number): void => {
    const s = suggestions[i]
    if (s === undefined) return
    setCwd(s.dir); setCwdTouched(true); setHighlight(-1); setShowSuggestions(false)
  }
  const onWhereKey = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault(); setShowSuggestions(true); setHighlight((h) => Math.min(suggestions.length - 1, h + 1)); return
    }
    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault(); setHighlight((h) => Math.max(-1, h - 1)); return
    }
    if (event.key === 'Tab' && highlight >= 0) { accept(highlight); return }
    // A highlighted suggestion is what Enter means here; with none, Enter starts.
    if (event.key === 'Enter' && highlight >= 0) { event.preventDefault(); event.stopPropagation(); accept(highlight); return }
    onKey(event)
  }

  // M73. A chat is an agent panel: the how fields apply, with the CLI's own
  // defaults as the placeholders.
  const isSupervisor = whatId === SUPERVISOR_WHAT_ID
  const isChat = backendOfWhatId(whatId) !== undefined || isSupervisor
  const isAgent = preset?.agent !== undefined || isChat
  const own = preset?.agentOptions ?? {}
  const creationKind: CreationKind = chosenTemplate !== undefined ? 'template'
    : parseLineupWhatId(whatId) !== null ? 'lineup'
      : isSupervisor ? 'supervisor'
        : isChat || parseTeammateWhatId(whatId) !== null ? 'chat'
          : preset?.agent !== undefined ? 'agent' : 'terminal'
  const request = buildSpawnRequest(values(), model.presets)
  // M80. The shape, not only its arithmetic (the critic): the kinds it will
  // make and the trigger word its edge carries, in the edge's own vocabulary.
  const templateShape = chosenTemplate === undefined ? '' : (() => {
    const t = chosenTemplate.template
    const kinds = t.nodes.map((n) => n.kind).join(' + ')
    const edges = t.edges.map((e) => TRIGGER_WORDS[e.trigger])
    return `${kinds}${edges.length === 0 ? '' : ` · ${[...new Set(edges)].join(', ')}`}`
  })()
  // The template's NAME is already the `what` row's value; the preview says
  // what it makes, which is the thing the row cannot.
  const what = chosenTemplate !== undefined ? templateShape
    : isSupervisor ? `a supervisor: a chat that reads this canvas with \`tc status\` and answers in the canvas's own words · one per canvas — ${model.hasSupervisor === true ? 'this canvas already has one' : 'this canvas has none yet'} · it starts asleep and reads the canvas on your first send`
    : parseLineupWhatId(whatId) !== null ? `lineup: ${LINEUPS[parseLineupWhatId(whatId) as keyof typeof LINEUPS].label}` : isChat ? `chat with ${BACKENDS[backendOfWhatId(whatId) ?? 'claude'].label} — ${rowCapabilitySentence(backendOfWhatId(whatId) ?? 'claude')}` : request.command !== undefined ? `sh -lc ${request.command}` : (preset?.name ?? '')

  return (
    <div className="sheet" data-spawn-sheet role="form" aria-label="New panel" onKeyDown={onKey}>
      <SheetHeader current="panel" onTask={model.startTask}
        {...(model.askQuestion === undefined && model.askReason === undefined ? {} : { ask: { ...(model.askReason === undefined ? {} : { reason: model.askReason }), run: () => { model.askQuestion?.(); onDone() } } })} />

      {chosenTemplate === undefined && (
      <label className="sheet__field sheet__field--where">
        <span className="sheet__label">Folder</span>
        <input ref={whereRef} className="sheet__input sheet__input--mono" data-sheet-where value={cwd} placeholder="a directory" spellCheck={false}
          onChange={(e) => { setCwd(e.target.value); setCwdTouched(true); setShowSuggestions(true); setHighlight(-1); setRefusal(null) }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={onWhereKey} />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="sheet__suggestions" role="listbox" aria-label="Directories" data-sheet-suggestions>
            {suggestions.map((s, i) => (
              <li key={s.dir} role="option" aria-selected={i === highlight}
                className={`sheet__suggestion${i === highlight ? ' sheet__suggestion--on' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); accept(i) }}>
                {/* M191 (the golden audit, second half, 8). TWO segments, not
                    three: a macOS temp directory's middle segment is a
                    32-character machine id, and at three the row printed it
                    at full width beside a sibling that had been shortened.
                    The path rule's own answer is the last two segments; the
                    whole path stays on the title. */}
                {/* M262. The repository's NAME leads — the thing a person
                    recognises — then the short path, then when it was last
                    used (or, with no recorded time, why it is offered). */}
                <span className="sheet__suggestion-name">{s.dir.replace(/\/+$/, '').split('/').pop() || s.dir}</span>
                <span className="sheet__suggestion-path" title={s.dir}>{shortPath(s.dir, 2)}</span>
                <span className="sheet__suggestion-why" data-sheet-suggestion-when={model.recentUsed?.[s.dir] === undefined ? undefined : ''}>{model.recentUsed?.[s.dir] === undefined ? s.why : lastUsedWords(model.recentUsed[s.dir], Date.now())}</span>
              </li>
            ))}
          </ul>
        )}
      </label>
      )}

      <label className="sheet__field">
        <span className="sheet__label">Agent</span>
        <select className="sheet__select sheet__select--mono" data-sheet-what value={whatId} onChange={(e) => { setWhatId(e.target.value); setRefusal(null) }}>
          {model.presets.map((p) => (
            <option key={p.id} value={p.id} disabled={p.available === false}>{p.name}{p.available === false ? ' — not on PATH' : ''}</option>
          ))}
          <option value={COMMAND}>type a command…</option>
          {/* M73. The conversation arm, disabled by name when claude is absent. */}
          {/* M90/M99. One conversation row per registered backend, from the
              registry's order, disabled by name when its CLI is absent. The
              codex row keeps its `data-sheet-codex` mark (`verify:panels codex.1`). */}
          {backendOptions(model.available ?? { claude: model.claudeAvailable, codex: model.codexAvailable }).map((row) => (
            <option key={row.id} value={WHAT_ID_BY_BACKEND[row.id]} disabled={row.disabled} data-sheet-backend={row.id} data-sheet-codex={row.id === BACKENDS.codex.id ? '' : undefined}>{row.label}</option>
          ))}
          {/* M104. The lineups: a shape of seats, previewed below before anything is minted. */}
          {LINEUP_IDS.map((id) => (
            <option key={id} value={lineupWhatId(id)} data-sheet-lineup={id} disabled={!Object.values(model.available ?? { claude: model.claudeAvailable, codex: model.codexAvailable }).some(Boolean)}>lineup: {LINEUPS[id].label} — {LINEUPS[id].hint}{!model.claudeAvailable && !model.codexAvailable ? ' — no agent CLI on the PATH' : ''}</option>
          ))}
          {/* M100. One `chat as <name>` per teammate, disabled by name with no places. */}
          {teammateOptions(model.teammates ?? [], model.claudeAvailable).map((row) => (
            <option key={row.id} value={teammateWhatId(row.id)} disabled={row.disabled} data-sheet-teammate={row.id} title={row.reason}>{row.label}</option>
          ))}
          {/* M81. One per canvas, disabled by name when there already is one. */}
          <option value={SUPERVISOR_WHAT_ID} disabled={!model.claudeAvailable || model.hasSupervisor === true}>
            supervisor of this canvas{!model.claudeAvailable ? ' — not on PATH' : model.hasSupervisor === true ? ' — this canvas already has one' : ''}
          </option>
          {/* M80. Templates, disabled by name when one cannot be started. */}
          {templates.map((t) => (
            <option key={t.template.id} value={`${TEMPLATE_PREFIX}${t.template.id}`} disabled={t.refusal !== undefined}>
              {t.template.name}{t.refusal === undefined ? '' : ` — ${t.refusal}`}
            </option>
          ))}
        </select>
      </label>
      {/* M262. What this KIND is, said at the moment of choosing it. */}
      <p className="sheet__explain" data-sheet-kind={creationKind}>{KIND_EXPLANATIONS[creationKind]}</p>

      {/* M80. One field per parameter: the composer's fill step, in a form. */}
      {chosenTemplate !== undefined && holes.map((hole) => (
        <label className="sheet__field sheet__field--hole" key={hole}>
          <span className="sheet__label sheet__label--hole">{hole}</span>
          <input className="sheet__input sheet__input--mono" data-sheet-hole={hole} value={holeValues[hole] ?? ''}
            placeholder={hole === 'repository' ? 'a directory' : `a value for ${hole}`} spellCheck={false}
            onChange={(e) => { setHoleValues((v) => ({ ...v, [hole]: e.target.value })); setRefusal(null) }} />
        </label>
      ))}

      {whatId === COMMAND && (
        <label className="sheet__field">
          <span className="sheet__label">Command</span>
          <input className="sheet__input sheet__input--mono" data-sheet-command value={command} placeholder="npm test"
            spellCheck={false} onChange={(e) => { setCommand(e.target.value); setRefusal(null) }} />
        </label>
      )}

      {chosenTemplate === undefined && (
      <label className="sheet__field">
        <span className="sheet__label">Name</span>
        <input className="sheet__input" data-sheet-title value={title} placeholder={isSupervisor ? 'supervisor' : whatId === COMMAND ? (command.trim() || 'the command') : 'optional'} onChange={(e) => setTitle(e.target.value)} />
      </label>
      )}

      {(whatId === COMMAND || (parseLineupWhatId(whatId) === null && parseTeammateWhatId(whatId) === null && whatId !== CHAT_WHAT_ID && whatId !== SUPERVISOR_WHAT_ID && !isChat)) && (
        // M147. Environment overrides for a preset or a command panel: one
        // KEY=value per line, merged over the preset's own and the login env in
        // MAIN. A line it cannot read is named beneath, never guessed at.
        // M262. Under ADVANCED: environment overrides are the rare case, and a
        // KEY=value box at rest made every panel look like it needed one. Open
        // by itself when it already holds something, so nothing is hidden
        // that would change what starts.
        <details className="sheet__advanced" data-sheet-advanced open={envText.trim() !== '' ? true : undefined}>
          <summary className="sheet__advanced-toggle">Advanced</summary>
          <label className="sheet__field sheet__field--env">
            <span className="sheet__label">Environment</span>
            <textarea className="sheet__input sheet__input--mono" data-sheet-env rows={2} value={envText} placeholder="KEY=value, one per line (optional)" onChange={(e) => setEnvText(e.target.value)} />
            {parseEnvLines(envText).bad.length > 0 && <span className="sheet__hint" data-sheet-env-bad>{`not KEY=value: ${parseEnvLines(envText).bad.join(', ')}`}</span>}
          </label>
        </details>
      )}
      {parseLineupWhatId(whatId) !== null && (
        <label className="sheet__field sheet__field--how">
          <span className="sheet__label">Lanes</span>
          {/* M315. The checkbox and its words are ONE flex child: `.sheet__how > *` grows
              every child, so a bare checkbox took the row and pushed its words to the far edge. */}
          <span className="sheet__how"><span className="sheet__check"><input type="checkbox" data-sheet-worktree checked={worktree} onChange={(e) => setWorktree(e.target.checked)} /> agents in their own worktrees</span></span>
        </label>
      )}
      {isAgent && (
        <div className="sheet__field sheet__field--how">
          <span className="sheet__label">Runtime</span>
          <div className="sheet__how">
            {/* M118. A knob the row's CLI has no flag for is DISABLED with the reason, never a control that silently does nothing. */}
            {(() => { const presetKind = preset?.agent; const kind: AgentKind = backendOfWhatId(whatId) !== undefined ? PRESET_KIND_BY_BACKEND[backendOfWhatId(whatId) as AgentBackend] : (presetKind !== undefined && (AGENT_KINDS as readonly string[]).includes(presetKind) ? presetKind as AgentKind : 'claude-code'); const flags = AGENT_CAPABILITIES[kind].flags; const label = BACKENDS[backendOfWhatId(whatId) ?? 'claude'].label; return (<>
            {/* M262. THE DEFAULTS, SAID — what starts if nothing here is touched,
                then what each knob changes. The line re-reads the knobs, so it
                is also the summary once they are set. */}
            <span className="sheet__defaults" data-sheet-defaults>{runtimeDefaultsLine(engineDisplayName(backendOfWhatId(whatId) ?? kind, preset?.name), { effort: effort === '' ? own.effort : effort, model: modelName === '' ? own.model : modelName, mode: mode === '' ? own.permissionMode : mode, hasEffort: flags.effort !== undefined, hasMode: flags.permissionMode !== undefined })}</span>
            <select className="sheet__select" data-sheet-mode value={mode} aria-label="permission mode" disabled={flags.permissionMode === undefined} title={flags.permissionMode === undefined ? `${label} has no permission mode flag` : undefined} onChange={(e) => setMode(e.target.value as PermissionMode | '')}>
              <option value="">{flags.permissionMode === undefined ? 'no mode flag' : `${own.permissionMode ?? 'default'} mode`}</option>
              {flags.permissionMode !== undefined && PERMISSION_MODES.map((m) => <option key={m} value={m}>{m} mode</option>)}
            </select>
            <select className="sheet__select" data-sheet-effort value={effort} aria-label="effort" disabled={flags.effort === undefined} title={flags.effort === undefined ? `${label} has no effort flag` : undefined} onChange={(e) => setEffort(e.target.value as Effort | '')}>
              <option value="">{flags.effort === undefined ? 'no effort flag' : `${own.effort ?? 'default'} effort`}</option>
              {flags.effort !== undefined && EFFORTS.map((m) => <option key={m} value={m}>{m} effort</option>)}
            </select>
            </>) })()}
            {/* M120. A closed list where the row has one (copilot names its models), free text otherwise. */}
            {(() => { const choices = backendOfWhatId(whatId) === undefined ? null : modelChoices(backendOfWhatId(whatId) as AgentBackend); return choices === null ? (
              <input className="sheet__input sheet__input--mono" data-sheet-model list="sheet-reported-models" value={modelName} placeholder={own.model ?? 'default model'} aria-label="model" spellCheck={false} onChange={(e) => setModelName(e.target.value)} />
            ) : (
              <select className="sheet__input sheet__input--mono" data-sheet-model data-sheet-model-list value={modelName} aria-label="model" onChange={(e) => setModelName(e.target.value)}>
                <option value="">auto (the CLI's default)</option>
                {choices.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) })()}
            {/* M99. Suggestions are what live sessions REPORTED, never a vendor list (a fixed list rots the day a model ships). */}
            <datalist id="sheet-reported-models" data-sheet-reported-models>
              {(model.reportedModels ?? []).map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>
        </div>
      )}

      <div className="sheet__foot">
        <span className="sheet__preview" data-sheet-preview>{what}{chosenTemplate !== undefined || !request.cwd ? '' : ` · ${shortPath(request.cwd, 3)}`}</span>
        {/* M104. THE LINEUP PREVIEW: every seat, its kind and lane, the session
            count, and — against the live ceiling — how many will queue, said
            BEFORE Enter mints anything. */}
        {(() => {
          const lid = parseLineupWhatId(whatId)
          if (lid === null) return null
          const plan = lineupPlan(LINEUPS[lid], { cwd: cwd.trim() === '' ? '~' : cwd.trim(), worktrees: request.worktree === true, maxConcurrent: model.ceiling?.maxConcurrent ?? 0, liveAgents: model.ceiling?.liveAgents ?? 0, queued: model.ceiling?.queued ?? 0 })
          return (
            <div className="sheet__lineup" data-sheet-lineup-preview>
              <div className="sheet__lineup-line">{plan.sessions} session{plan.sessions === 1 ? '' : 's'} will open · {plan.agents} agent{plan.agents === 1 ? '' : 's'}</div>
              <ul className="sheet__lineup-seats">
                {plan.seats.map((seat, i) => (
                  <li key={i} data-sheet-seat={seat.kind}>{seat.role} · {seat.kind}{seat.url !== undefined ? ` · ${seat.url}` : ''}{seat.lane ? ' · in a worktree' : seat.kind !== 'agent' && request.worktree === true ? ' · in the checkout' : ''}</li>
                ))}
              </ul>
              {plan.ceilingLine !== '' && <div className="sheet__lineup-ceiling" data-sheet-lineup-ceiling data-tone="needs-you">{plan.ceilingLine}</div>}
            </div>
          )
        })()}
        {refusal !== null && <span className="sheet__refusal" data-sheet-refusal role="alert">{refusal}</span>}
        {/* M80. The commit verb says what it will MAKE for a template: `start`
            is the state machine's word for one panel (the critic), and a
            template lays down a shape. */}
        {/* M262. EXPLICIT VERBS: a filled primary that says what it makes and
            a Cancel beside it. The keys stay, smaller — Enter is still the
            fast path, but no longer the only visible way to submit. */}
        <div className="sheet__actions">
          <span className="sheet__keys">↵ · esc · ⌘N starts the default without asking</span>
          <button type="button" className="sheet__button" data-sheet-cancel
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => { e.preventDefault(); onCancel() }}>Cancel</button>
          <button type="button" className="sheet__button is-primary" data-sheet-submit
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => { e.preventDefault(); submit() }}>{chosenTemplate === undefined ? 'Create panel' : `Create ${chosenTemplate.template.nodes.length} panels`}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * M262. ONE CREATION SURFACE, TWO ROUTES. Start work and New panel share a
 * header: `Task` first — the primary route, a task with an agent and a
 * repository — and `Panel` second, the expert route to one raw panel. Each
 * side is still its own sheet (its own model and keyboard rules); the switch
 * closes one and opens the other through the palette's own verbs, so neither
 * learns the other's fields.
 */
export function SheetHeader({ current, onTask, onPanel, ask }: { current: 'task' | 'panel'; onTask?: () => void; onPanel?: () => void; ask?: { run: () => void; reason?: string } }): JSX.Element {
  const other = current === 'task' ? onPanel : onTask
  return (
    <div className="sheet__head">
      <div className="sheet__title">{current === 'task' ? 'New task' : 'New panel'}</div>
      {/* M403 (B8). "Ask a question" under the launcher's own words, beside
          Task | Panel — not a third tab: it does not change this sheet, it
          opens a conversation with no folder and closes it. Disabled by name
          when no engine was found, never hidden. */}
      {ask !== undefined && (
        <button type="button" className="pf__verb pf__verb--word sheet__ask" data-sheet-ask disabled={ask.reason !== undefined}
          title={ask.reason ?? 'A conversation with no folder — read-only, nothing to write to'}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
          onClick={(e) => { e.preventDefault(); if (ask.reason === undefined) ask.run() }}>Ask a question</button>
      )}
      {other !== undefined && (
        <div className="sheet__switch" role="tablist" aria-label="What to create" data-sheet-switch>
          {(['task', 'panel'] as const).map((side) => (
            <button key={side} type="button" role="tab" aria-selected={side === current} className="sheet__switch-tab" data-sheet-switch-to={side}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onClick={(e) => { e.preventDefault(); if (side !== current) other() }}>
              {side === 'task' ? 'Task' : 'Panel'}
              <span className="sheet__switch-hint">{side === 'task' ? 'an agent on a repository' : 'expert — one raw panel'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * M443. "New object connected to <source>". Rendered by the canvas when a
 * port drag ends on empty ground. It does not spawn: the canvas arms the
 * handoff and calls onSpawn.
 */
export function ConnectedSpawnMenu({
  title, agents, presets, foot, onAgent, onPreset, onClose, style
}: {
  title: string
  agents: readonly { id: string; label: string; chord: string }[]
  presets: readonly { id: string; name: string }[]
  foot: string
  onAgent: (id: 'claude' | 'codex' | 'shell') => void
  onPreset: (id: string) => void
  onClose: () => void
  style?: CSSProperties
}): JSX.Element {
  return (
    <div className="connected-spawn" data-connected-spawn="" data-screen-control="" role="dialog" aria-label={title} style={style} onMouseDown={(event) => event.stopPropagation()}>
      <div className="connected-spawn__title">{title}</div>
      <button type="button" className="connected-spawn__close" aria-label="Close" onClick={onClose}>Close</button>
      <div className="connected-spawn__group">Agents</div>
      {agents.map((agent) => (
        <button key={agent.id} type="button" className="connected-spawn__row" data-connected-agent={agent.id} onClick={() => onAgent(agent.id as 'claude' | 'codex' | 'shell')}>
          {agent.label}{agent.chord === '' ? '' : ` ${agent.chord}`}
        </button>
      ))}
      {presets.length > 0 && <div className="connected-spawn__group">Presets</div>}
      {presets.map((preset) => (
        <button key={preset.id} type="button" className="connected-spawn__row" data-connected-preset={preset.id} onClick={() => onPreset(preset.id)}>{preset.name}</button>
      ))}
      <p className="connected-spawn__foot">{foot}</p>
    </div>
  )
}
