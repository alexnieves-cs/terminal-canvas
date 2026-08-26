import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import { filterCommands, firstRunnable, stepRunnable, type Command } from './palette-model'
import {
  buildCommands,
  type PaletteActions,
  type PanelRow,
  type PresetRow,
  type PromptRow
} from './commands'
import type { PaletteController } from './usePalette'

/**
 * The overlay. Rendered as a sibling of `.world`, NEVER inside it: a scale()
 * ancestor would shrink the palette at low zoom and would place it in the
 * coordinate space pointer-correct.ts rewrites, so every click in it would be
 * re-dispatched with coordinates meant for a terminal cell grid.
 */

/** Rename and save-prompt both need a name. The palette is already a text field. */
export interface InputMode {
  label: string
  initial: string
  submit(value: string): void
}

export interface PaletteProps {
  controller: PaletteController
  actions: PaletteActions
  presets: PresetRow[]
  prompts: PromptRow[]
  panels: PanelRow[]
  hasSelection: boolean
  /** Set by beginRenamePreset / beginSavePrompt; null is command mode. */
  inputMode: InputMode | null
}

export function Palette(props: PaletteProps): JSX.Element {
  const { controller, inputMode } = props
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo(
    () =>
      buildCommands({
        presets: props.presets,
        prompts: props.prompts,
        panels: props.panels,
        capturedId: controller.capturedId,
        hasSelection: props.hasSelection,
        actions: props.actions
      }),
    [props.presets, props.prompts, props.panels, controller.capturedId, props.hasSelection, props.actions]
  )
  const rows = useMemo(() => filterCommands(commands, query), [commands, query])

  // Rule 1: opening focuses the input. This is what takes the keyboard off
  // xterm — nothing else in this component does it, and without it the user's
  // typing goes to the agent while the palette sits there looking ready.
  useEffect(() => {
    inputRef.current?.focus()
  }, [inputMode])

  // The list shrinks under the selection on every keystroke; re-seat it on a
  // row that can actually be run rather than leaving Enter pointed at a
  // disabled command or past the end.
  useEffect(() => {
    setIndex(firstRunnable(rows))
  }, [rows])

  // Cmd+C / Cmd+V are the app menu's accelerators (main/menu.ts), so they take
  // priority over the page: the browser never delivers a native copy or paste
  // to this input, and Canvas.tsx's listeners stand down while the palette is
  // open rather than firing them at a terminal the user is not looking at.
  // Which leaves nobody to serve the text field unless it serves itself.
  // verify:panels 35 is the paste half.
  useEffect(() => {
    const offPaste = window.canvas.edit.onPaste((text) => {
      if (!text) return
      const input = inputRef.current
      const start = input?.selectionStart ?? null
      const end = input?.selectionEnd ?? null
      // Insert at the caret when there is one. A controlled input whose value
      // was just replaced reports null selection offsets in some states, and
      // appending is a better answer there than dropping the paste.
      setQuery((q) =>
        start === null || end === null ? q + text : q.slice(0, start) + text + q.slice(end)
      )
    })
    const offCopy = window.canvas.edit.onCopy(() => {
      const input = inputRef.current
      if (!input) return
      // NOT window.getSelection(): a selection inside an <input> is not part
      // of the document selection in Chromium, so that reads as empty here.
      const { selectionStart: start, selectionEnd: end } = input
      if (start === null || end === null || start === end) return
      void navigator.clipboard.writeText(input.value.slice(start, end))
    })
    return () => {
      offPaste()
      offCopy()
    }
  }, [])

  const runSelected = (): void => {
    const row: Command | undefined = index >= 0 ? rows[index] : undefined
    if (!row || row.disabledReason !== undefined) return
    // Close FIRST: the command may focus a panel or open a dialog, and
    // restoring focus afterwards would steal it straight back.
    controller.closePalette()
    row.run()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        controller.closePalette()
        break
      case 'ArrowDown':
        event.preventDefault()
        setIndex((i) => stepRunnable(rows, i, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setIndex((i) => stepRunnable(rows, i, -1))
        break
      case 'Enter':
        event.preventDefault()
        if (inputMode) {
          const value = query.trim()
          controller.closePalette()
          // An empty name is a cancel, not a rename to "".
          if (value) inputMode.submit(value)
        } else {
          runSelected()
        }
        break
      default:
        break
    }
  }

  useEffect(() => {
    setQuery(inputMode ? inputMode.initial : '')
  }, [inputMode])

  return (
    <div
      className="palette"
      role="dialog"
      aria-label="Command palette"
      // The palette mounts INSIDE .canvas, whose onMouseDown is the background
      // handler — so without this every mousedown in here (a row pick, a click
      // into the input to place a caret) reads as a click on the canvas
      // background, and that handler does three things, all wrong from here:
      // it clears focusedId (unpinning the live panel, leaving menu Cmd+C/V
      // with no target, and disabling every capturedId-gated row on the NEXT
      // Cmd+K — including the prompt rows), it hit-tests the click's WORLD
      // point and selects whatever panel happens to lie under the overlay, and
      // through onSelectPanel that WAKES a dormant panel — spawning a process
      // from a palette click, which is the one thing the dormancy rule exists
      // to prevent. Bubble phase, so the rows' own handlers below still run
      // first, and no preventDefault, so the input still places its caret.
      // verify:panels 41.
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        className="palette__input"
        value={query}
        placeholder={inputMode ? inputMode.label : 'Type a command…'}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      {!inputMode && (
        <ul className="palette__list">
          {rows.map((row, i) => (
            <li
              key={row.id}
              className={[
                'palette__row',
                i === index ? 'palette__row--selected' : '',
                row.disabledReason ? 'palette__row--disabled' : ''
              ].join(' ')}
              // onMouseDown, not onClick: it keeps DOM focus in the input,
              // where a click would blur it first — and the input's focus is
              // rule 1, the only thing holding the keyboard away from xterm.
              onMouseDown={(e: MouseEvent<HTMLLIElement>) => {
                e.preventDefault()
                if (row.disabledReason) return
                controller.closePalette()
                row.run()
              }}
            >
              <span className="palette__group">{row.group}</span>
              <span className="palette__title">{row.title}</span>
              {/* Says WHY it is disabled. A greyed-out row with no reason is a
                  bug report — the same rule menuLabel() states for the menu. */}
              <span className="palette__hint">{row.disabledReason ?? row.subtitle ?? ''}</span>
            </li>
          ))}
          {rows.length === 0 && <li className="palette__empty">No matching command</li>}
        </ul>
      )}
    </div>
  )
}
