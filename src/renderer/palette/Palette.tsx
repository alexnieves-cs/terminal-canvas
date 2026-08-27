import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import {
  SECTIONS,
  bestMatchIndex,
  filterCommands,
  splitHighlight,
  stepRunnable,
  type Command,
  type PaletteScope,
  type SectionId
} from './palette-model'
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

/**
 * Rename, save-prompt and delete-confirm all borrow the palette's own text
 * field. `kind` is which of the two shapes it takes.
 *
 * 'confirm' exists so a destructive row can be gated without this app growing
 * its first modal — the collision M5a deferred preset editing over, because a
 * modal would fight xterm for keyboard focus. Input mode already solved that,
 * and a confirm inherits all four of usePalette's focus rules by reusing it.
 */
export interface InputMode {
  kind: 'text' | 'confirm'
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
  /** Set by beginRenamePreset / beginSavePrompt / the deletes; null is command mode. */
  inputMode: InputMode | null
}

const SCOPE_LABEL: Record<PaletteScope, string> = {
  presets: 'Presets',
  prompts: 'Prompts'
}

const sectionLabel = (id: SectionId): string =>
  SECTIONS.find((s) => s.id === id)?.label ?? id

export function Palette(props: PaletteProps): JSX.Element {
  const { controller, inputMode } = props
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  // Which drill-in is open. Local state and nothing more: the component
  // unmounts when the palette closes (Canvas.tsx renders it conditionally), so
  // a scope can never outlive the overlay it was entered from.
  const [scope, setScope] = useState<PaletteScope | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLLIElement>(null)

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
  const rows = useMemo(() => filterCommands(commands, query, scope), [commands, query, scope])

  // Rule 1: opening focuses the input. This is what takes the keyboard off
  // xterm — nothing else in this component does it, and without it the user's
  // typing goes to the agent while the palette sits there looking ready.
  useEffect(() => {
    inputRef.current?.focus()
  }, [inputMode])

  // What the selection was pointing AT last render, so the effect below can
  // follow the command rather than the slot it happened to occupy.
  const prevRowsRef = useRef<Command[]>(rows)
  const prevQueryRef = useRef(query)
  const prevScopeRef = useRef(scope)

  // The list shrinks under the selection on every keystroke; re-seat it on a
  // row that can actually be run rather than leaving Enter pointed at a
  // disabled command or past the end.
  //
  // Only a QUERY or SCOPE change re-seats, though. `rows` also changes identity
  // when a list ARRIVES: preset:list and prompt:list are invokes that resolve
  // after the palette has opened, and reading .claude/commands off a cold disk
  // is slow enough for the user to have arrowed down first. Re-seating there
  // moves the highlight back to the top with no visible cause and Enter then
  // runs a command they did not choose — the same silent-selection-move class
  // as the resetViewport defect. So on any other change the selection follows
  // its command by id (rows may have grown ABOVE it, which is exactly what an
  // arriving list does), and only falls back when that command is gone or has
  // become unrunnable.
  //
  // The fallback is bestMatchIndex, not firstRunnable. Rows are ordered by
  // SECTION now, so "the first runnable row" is the top of the Panels section
  // regardless of what the user typed — the selection has to be seeded by
  // SCORE or every search lands the highlight somewhere unrelated. For an
  // empty query every score ties at 0 and this degenerates to exactly
  // firstRunnable, so the resting list still selects its first usable row.
  useEffect(() => {
    const reseat = prevQueryRef.current !== query || prevScopeRef.current !== scope
    const previous = prevRowsRef.current
    prevQueryRef.current = query
    prevScopeRef.current = scope
    prevRowsRef.current = rows
    setIndex((i) => {
      if (reseat) return bestMatchIndex(rows, query)
      const selectedId = i >= 0 ? previous[i]?.id : undefined
      const moved = selectedId === undefined ? -1 : rows.findIndex((r) => r.id === selectedId)
      return moved >= 0 && rows[moved].disabledReason === undefined ? moved : bestMatchIndex(rows, query)
    })
  }, [rows, query, scope])

  // Keep the selected row on screen. .palette__list is max-height: 46vh with
  // overflow-y: auto, and the list is long by construction, so ArrowDown walks
  // straight past the bottom of the visible window and Enter runs a command the
  // user cannot see. 'nearest' so a selection already in view does not scroll
  // at all — and .palette__row carries a scroll-margin-top matching the sticky
  // header's height, or 'nearest' parks the row UNDER a header it considers
  // perfectly visible.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [index, rows])

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

  /**
   * Run a row, or enter its drill-in.
   *
   * `entersScope` is read BEFORE anything else, and that ordering is the whole
   * reason it is a field rather than a callback: the normal path closes the
   * palette FIRST (a command may focus a panel or open a dialog, and restoring
   * focus afterwards would steal it straight back), so a row that wanted to
   * keep the overlay up could not say so from inside run().
   */
  const runRow = (row: Command | undefined): void => {
    if (!row || row.disabledReason !== undefined) return
    if (row.entersScope) {
      setScope(row.entersScope)
      // The query that found the door is not a query about what is behind it.
      setQuery('')
      return
    }
    controller.closePalette()
    row.run()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      // Tab is an exit, not a focus move. role="dialog" with exactly one
      // focusable element means the browser's default Tab walks DOM focus
      // onward — plausibly straight into xterm's tabbable helper textarea —
      // leaving the overlay up with the keyboard back on the agent, which is
      // the same lingering-overlay state an unhandled outside click produced
      // (Canvas.tsx's onMouseDownCapture). It is a key people press
      // reflexively in a text field, so it gets an answer rather than a
      // default: close, exactly as Escape does at the top level.
      case 'Tab':
        event.preventDefault()
        controller.closePalette()
        break
      // Escape is TWO-STAGE. Inside a drill-in it pops back to the top level
      // and the palette stays open; only at the top level does it close.
      // The alternative — Escape always closing — makes the drill-in a trap
      // the user can only leave by reopening the palette and losing the
      // captured panel, and it would be the one place in this overlay where
      // going back and giving up are the same key.
      //
      // Input mode is deliberately NOT a third stage: closing clears it
      // (Canvas.tsx's `if (!palette.open) setInputMode(null)`), which is what
      // makes Escape a real cancel for a rename and for a delete alike.
      case 'Escape':
        event.preventDefault()
        if (!inputMode && scope !== null) setScope(null)
        else controller.closePalette()
        break
      // Backspace past the start of an empty query pops the scope, the way the
      // same key removes a token in every search field people already use.
      // Only when the query is empty, or it would eat a character the user
      // meant to delete.
      case 'Backspace':
        if (!inputMode && scope !== null && query === '') {
          event.preventDefault()
          setScope(null)
        }
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
          // In text mode an empty name is a cancel, not a rename to "". In
          // confirm mode there is no name to be empty — the keypress IS the
          // answer, and the value is ignored.
          if (inputMode.kind === 'confirm') inputMode.submit('')
          else if (value) inputMode.submit(value)
        } else {
          runRow(index >= 0 ? rows[index] : undefined)
        }
        break
      default:
        break
    }
  }

  useEffect(() => {
    setQuery(inputMode ? inputMode.initial : '')
  }, [inputMode])

  const confirming = inputMode?.kind === 'confirm'
  const footer = inputMode
    ? confirming
      ? '↵ confirm · esc cancel'
      : '↵ save · esc cancel'
    : `↑↓ move · ↵ run · esc ${scope ? 'back' : 'close'}`

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
      {/* In confirm mode there is no bar at all — no query to type and no
          scope to display, because the question has already narrowed things
          to one preset. Rendering the bar anyway left the scope chip stranded
          above a border with an empty field beside it, which reads as a
          half-drawn overlay rather than as a question. */}
      {confirming ? (
        <input
          ref={inputRef}
          // Kept in the document, invisible, because it is what holds DOM
          // focus away from xterm — the same job xterm's own hidden textarea
          // does. display:none would make it unfocusable and hand the
          // keyboard back to the agent with a destructive question on screen.
          className="palette__input palette__input--ghost"
          value=""
          readOnly
          onChange={() => {}}
          onKeyDown={onKeyDown}
        />
      ) : (
        <div className="palette__bar">
          {scope !== null && <span className="palette__scope">{SCOPE_LABEL[scope]}</span>}
          <input
            ref={inputRef}
            className="palette__input"
            value={query}
            placeholder={
              inputMode
                ? inputMode.label
                : scope
                  ? `Search ${SCOPE_LABEL[scope].toLowerCase()}…`
                  : 'Type a command…'
            }
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
          />
        </div>
      )}

      {confirming && <div className="palette__confirm">{inputMode.label}</div>}

      {!inputMode && (
        <ul className="palette__list">
          {rows.map((row, i) => {
            // A header whenever the section changes. Sections are contiguous
            // because filterCommands sorts by section first, so one pass over
            // the flat array is enough — and the flat array stays flat, which
            // is what lets stepRunnable keep walking it without knowing that
            // headers exist at all.
            const header = i === 0 || rows[i - 1].group !== row.group
            return (
              // A Fragment, not a wrapper element: <ul> may only contain <li>,
              // and a <div> here would be invalid markup that browsers silently
              // reparent — which moves the rows out from under .palette__list's
              // own scroll container.
              <Fragment key={row.id}>
                {header && <li className="palette__section">{sectionLabel(row.group)}</li>}
                <li
                  ref={i === index ? selectedRef : null}
                  className={[
                    'palette__row',
                    i === index ? 'palette__row--selected' : '',
                    row.disabledReason ? 'palette__row--disabled' : '',
                    row.destructive ? 'palette__row--destructive' : ''
                  ].filter(Boolean).join(' ')}
                  // onMouseDown, not onClick: it keeps DOM focus in the input,
                  // where a click would blur it first — and the input's focus
                  // is rule 1, the only thing holding the keyboard away from
                  // xterm.
                  onMouseDown={(e: MouseEvent<HTMLLIElement>) => {
                    e.preventDefault()
                    runRow(row)
                  }}
                >
                  <span className="palette__title">
                    {/* Finally spends what fuzzy.ts has computed and thrown
                        away on every keystroke since M5b. Matched against the
                        TITLE alone: a row found through its subtitle or its
                        searchText has nothing in its title to point at, and a
                        highlight invented there would be a lie. */}
                    {splitHighlight(row.title, query).map((seg, si) =>
                      seg.hit
                        ? <mark key={si} className="palette__hit">{seg.text}</mark>
                        : <span key={si}>{seg.text}</span>
                    )}
                  </span>
                  {/* Says WHY it is disabled. A greyed-out row with no reason
                      is a bug report — the same rule menuLabel() states for
                      the menu. It replaces the subtitle rather than joining
                      it: the reason is the more urgent of the two. */}
                  <span className="palette__hint">{row.disabledReason ?? row.subtitle ?? ''}</span>
                  {row.entersScope && <span className="palette__chevron">›</span>}
                  {row.shortcut && <kbd className="palette__kbd">{row.shortcut}</kbd>}
                </li>
              </Fragment>
            )
          })}
          {rows.length === 0 && <li className="palette__empty">No matching command</li>}
        </ul>
      )}

      <div className="palette__footer">{footer}</div>
    </div>
  )
}
