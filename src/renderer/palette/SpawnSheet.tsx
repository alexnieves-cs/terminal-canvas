import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { EFFORTS, PERMISSION_MODES, type AgentOptions, type Effort, type PermissionMode } from '@shared/cost'
import type { SpawnResult } from '@shared/ipc-contract'
import { buildSpawnRequest, directorySuggestions, CHAT_WHAT_ID, type SheetPreset, type SheetValues, type SheetWhat } from './spawn-sheet'
import { shortPath } from './panel-name'

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
  defaultPresetId: string
  /** The focused panel's live directory, when a terminal is focused. */
  focusedCwd?: string
  recents: readonly string[]
  panelDirs: readonly string[]
  submit(values: SheetValues): Promise<SpawnResult>
  /** M73. Whether claude was found — the chat arm is offered disabled by name otherwise. */
  claudeAvailable: boolean
}

export interface SpawnSheetProps {
  model: SpawnSheetModel
  onDone(): void
  onCancel(): void
}

const COMMAND = '__command__'

export function SpawnSheet({ model, onDone, onCancel }: SpawnSheetProps): JSX.Element {
  const firstAvailable = model.presets.find((p) => p.id === model.defaultPresetId && p.available !== false) ?? model.presets.find((p) => p.available !== false)
  const [whatId, setWhatId] = useState<string>(firstAvailable?.id ?? COMMAND)
  const [command, setCommand] = useState('')
  const preset = model.presets.find((p) => p.id === whatId)
  const [cwd, setCwd] = useState(model.focusedCwd ?? preset?.cwd ?? '')
  const [cwdTouched, setCwdTouched] = useState(false)
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<PermissionMode | ''>('')
  const [effort, setEffort] = useState<Effort | ''>('')
  const [modelName, setModelName] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
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
    const what: SheetWhat = whatId === COMMAND ? { kind: 'command', command } : whatId === CHAT_WHAT_ID ? { kind: 'chat' } : { kind: 'preset', id: whatId }
    const agentOptions: AgentOptions = {}
    if (mode !== '') agentOptions.permissionMode = mode
    if (effort !== '') agentOptions.effort = effort
    if (modelName.trim() !== '') agentOptions.model = modelName.trim()
    return { what, cwd, title, agentOptions }
  }

  const submit = (): void => {
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
  const isChat = whatId === CHAT_WHAT_ID
  const isAgent = preset?.agent !== undefined || isChat
  const own = preset?.agentOptions ?? {}
  const request = buildSpawnRequest(values(), model.presets)
  const what = isChat ? 'chat with claude' : request.command !== undefined ? `sh -lc ${request.command}` : (preset?.name ?? '')

  return (
    <div className="sheet" data-spawn-sheet role="form" aria-label="New panel" onKeyDown={onKey}>
      <div className="sheet__title">New panel…</div>

      <label className="sheet__field sheet__field--where">
        <span className="sheet__label">where</span>
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
                <span className="sheet__suggestion-path" title={s.dir}>{shortPath(s.dir, 3)}</span>
                <span className="sheet__suggestion-why">{s.why}</span>
              </li>
            ))}
          </ul>
        )}
      </label>

      <label className="sheet__field">
        <span className="sheet__label">what</span>
        <select className="sheet__select sheet__select--mono" data-sheet-what value={whatId} onChange={(e) => { setWhatId(e.target.value); setRefusal(null) }}>
          {model.presets.map((p) => (
            <option key={p.id} value={p.id} disabled={p.available === false}>{p.name}{p.available === false ? ' — not on PATH' : ''}</option>
          ))}
          <option value={COMMAND}>type a command…</option>
          {/* M73. The conversation arm, disabled by name when claude is absent. */}
          <option value={CHAT_WHAT_ID} disabled={!model.claudeAvailable}>chat with claude{model.claudeAvailable ? '' : ' — not on PATH'}</option>
        </select>
      </label>

      {whatId === COMMAND && (
        <label className="sheet__field">
          <span className="sheet__label">command</span>
          <input className="sheet__input sheet__input--mono" data-sheet-command value={command} placeholder="npm test"
            spellCheck={false} onChange={(e) => { setCommand(e.target.value); setRefusal(null) }} />
        </label>
      )}

      <label className="sheet__field">
        <span className="sheet__label">title</span>
        <input className="sheet__input" data-sheet-title value={title} placeholder={whatId === COMMAND ? (command.trim() || 'the command') : 'optional'} onChange={(e) => setTitle(e.target.value)} />
      </label>

      {isAgent && (
        <div className="sheet__field sheet__field--how">
          <span className="sheet__label">how</span>
          <div className="sheet__how">
            <select className="sheet__select" data-sheet-mode value={mode} aria-label="permission mode" onChange={(e) => setMode(e.target.value as PermissionMode | '')}>
              <option value="">{own.permissionMode ?? 'default'} mode</option>
              {PERMISSION_MODES.map((m) => <option key={m} value={m}>{m} mode</option>)}
            </select>
            <select className="sheet__select" data-sheet-effort value={effort} aria-label="effort" onChange={(e) => setEffort(e.target.value as Effort | '')}>
              <option value="">{own.effort ?? 'default'} effort</option>
              {EFFORTS.map((m) => <option key={m} value={m}>{m} effort</option>)}
            </select>
            <input className="sheet__input sheet__input--mono" data-sheet-model value={modelName} placeholder={own.model ?? 'default model'} aria-label="model" spellCheck={false} onChange={(e) => setModelName(e.target.value)} />
          </div>
        </div>
      )}

      <div className="sheet__foot">
        <span className="sheet__preview" data-sheet-preview>{what} · {request.cwd ? shortPath(request.cwd, 3) : '—'}</span>
        {refusal !== null && <span className="sheet__refusal" data-sheet-refusal role="alert">{refusal}</span>}
        <span className="sheet__keys">↵ start · esc close · ⌘N starts the default without asking</span>
      </div>
    </div>
  )
}
