import { panelState, type StateInput } from '@renderer/panels/panel-state'
import { SpawnSheet, type SpawnSheetModel } from './SpawnSheet'
import { StartWorkSheet, type StartWorkSheetModel } from './StartWorkSheet'
import { SetupSheet, type SetupSheetModel } from './SetupSheet'
import { useAgentState } from '@renderer/session/agent-state-store'
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
  holdOrder,
  seatSelection,
  splitHighlight,
  stepRunnable,
  type Command,
  type PaletteScope,
  type SectionId
} from './palette-model'
import { type ApprovalRow,
  buildCommands,
  type PaletteActions,
  type PanelRow,
  type PresetRow,
  type PromptRow
} from './commands'
import type { SettingRow, WorkspaceRow, WorktreeListRow, PanelSearchResult } from '@shared/ipc-contract'
import type { WorkSearchResult } from '@shared/work-search'
import type { CanvasGroup } from '@renderer/groups/groups'
import type { CredentialMeta } from '@shared/credential-schema'
import type { PaletteController } from './usePalette'
import { ChevronRight, Lock } from '@renderer/icons'
import { EmptyState } from '@renderer/shell/EmptyState'
import type { EnvReport } from '@shared/env-report'
import type { UpdateState } from '@renderer/session/update-store'
import { needsYouCount } from '@shared/attention-words'
import { useTeamAsks } from '@renderer/shell/useTeamAsks'

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
  /**
   * 'number' is 'text' with a parse and a range on the way out. It is not a
   * new focus story: it inherits all four of usePalette's rules by being the
   * same input, which is exactly why M5a's "a modal would fight xterm for
   * keyboard focus" objection does not apply. The Enter handler below needs
   * no branch for it — an empty field falls into the same "cancel" arm a
   * blank rename already takes, and the parse/range check belongs in the
   * submit callback, where the setting id and its bounds are in scope
   * (Canvas.tsx's beginEditSetting).
   */
  /**
   * 'secret' is 'text' with three differences, each against a specific
   * failure: it renders type="password", so a token is not on screen in an
   * app whose users screenshot and screen-share canvases; `initial` is
   * always '' so a secret field never pre-seeds; and unlike 'number' a
   * REFUSAL never re-seeds the typed value. 'number' re-seeds deliberately,
   * so the user can see and correct what they typed — but a secret field is
   * masked, so there is nothing to correct by reading, and re-seeding only
   * extends how long the plaintext lives in renderer state for no benefit.
   */
  /**
   * M65. 'sheet' renders SpawnSheet in place of the bar and the list: a form
   * with several fields rather than one input. `submit` is unused for it —
   * the sheet submits through its own model — and `label` is its heading.
   */
  /**
   * M197. 'start' is the second sheet: the same overlay, the same keyboard
   * rules, a different form. It is a KIND rather than a variant of 'sheet'
   * because the two answer different questions and share no field — folding
   * them would make every field of each optional on the other's model.
   */
  kind: 'text' | 'confirm' | 'number' | 'secret' | 'sheet' | 'start' | 'setup'
  label: string
  /**
   * M96. What Enter DOES in this mode, for the footer: `run` for the verb
   * line, where `save` would call closing a panel harmless. Absent is `save`.
   */
  verb?: string
  initial: string
  submit(value: string): void
  /**
   * Present when `label` is a REFUSAL, not a hint — e.g. "must be 250–60000,
   * got 50" after an out-of-range number edit. A placeholder cannot carry
   * this message: the re-prompt sets `initial` to the value the user just
   * typed (so they can see and correct it), and a placeholder only shows
   * when the field is EMPTY — which it never is on that path. Without a
   * separate rendered element the refusal is computed and then never shown,
   * which is worse than the silent close it replaced, because it looks like
   * the mode is broken rather than like nothing happened. Absent (the
   * ordinary case) leaves the label exactly where it already was: the
   * placeholder, which is genuinely a hint when the field starts non-empty
   * because it holds the CURRENT value, not a rejected one.
   */
  feedback?: true
  /**
   * M409 (C5). A standing line under the field: the grammar of the verb the
   * line was opened on. Not the placeholder, for `feedback`'s reason — the
   * field starts non-empty (prefilled with the verb), so a placeholder
   * would never be seen.
   */
  hint?: string
  /** M65. Present when kind is 'sheet'. */
  sheet?: SpawnSheetModel
  /** M197. Present when kind is 'start'. */
  start?: StartWorkSheetModel
  /** M312. Present when kind is 'setup': the repository setup sheet. */
  setup?: SetupSheetModel
}

export interface PaletteProps {
  controller: PaletteController
  actions: PaletteActions
  presets: PresetRow[]
  prompts: PromptRow[]
  panels: PanelRow[]
  settings: SettingRow[]
  workspaces: WorkspaceRow[]
  /** Metadata only — see PaletteContext.credentials in commands.ts. */
  credentials: readonly CredentialMeta[]
  /** M37. See PaletteContext.worktrees. */
  worktrees: readonly WorktreeListRow[]
  /** M48. See PaletteContext.envReport. */
  envReport: EnvReport | null
  /** M181. See PaletteContext.starterReason. */
  starterReason?: string | null
  /** M182. See PaletteContext.workflowTemplateOf. */
  workflowTemplateOf?: (panelId: string) => string | undefined
  /** M123. See PaletteContext.update. Absent in a fixture: the rows read `not checked`. */
  update?: UpdateState | null
  /** M49. See PaletteContext.globalFontSize. */
  globalFontSize: number
  /** M56. This workspace's bookmarks and the trail's two ends. */
  bookmarks: readonly { id: string; name: string }[]
  cameraTrail: { back: boolean; forward: boolean }
  /** M409. Whether the canvas history has a step each way — the Undo/Redo rows' reasons. */
  canUndo?: boolean
  canRedo?: boolean
  /** M409. A view (Orchestrate) covers the canvas the Undo row would rewind. */
  canvasCovered?: boolean
  /** Panel ids currently in wants-you, from the renderer's own attention set. */
  attentionIds: readonly string[]
  /** M92. How many panels are pinned — the pin row's refusal reads it. */
  pinnedCount?: number
  /** M100. How many teammates the roster holds. */
  teammateCount?: number
  /** M80. Saved shapes of work, for the New-from rows. */
  templates: readonly { id: string; name: string; nodes: number; edges: number; refusal?: string }[]
  /** M76. Every pending permission request, for the Allow/Deny rows. */
  approvals: readonly ApprovalRow[]
  hasSelection: boolean
  /** M27. Where a new note would be saved; null disables the row. */
  noteRoot: string | null
  /** The rubber-band selection, as ids — what the move rows act on. */
  selectedIds: string[]
  /** M61. The canvas's groups, for the Card/Expand and Remove rows. */
  groups: readonly CanvasGroup[]
  /** Whether the merged view is open; the move rows refuse there. */
  merged: boolean
  broadcastReady: boolean
  broadcastActive: boolean
  /** Set by beginRenamePreset / beginSavePrompt / the deletes; null is command mode. */
  inputMode: InputMode | null
  /** M42. Hits from main for the current search query; null before the first answer. */
  searchResults: PanelSearchResult | null
  /** D13. See the context's own. */
  workSearch?: WorkSearchResult | null
  /** M42. scrollback.persist — decides the "search is off" empty state. */
  scrollbackEnabled: boolean
  /** M42. Called with the live query WHILE the scope is `search`, so Canvas can ask main. */
  onSearchQuery: (query: string) => void
  /** M365. The capability scope's answers (null before the first), and the query reported while that scope is open. */
  capability?: { panelId: string; label: string; answer: import('@shared/toolbox-query').CapabilityAnswer }[] | null
  onCapabilityQuery?: (query: string) => void
}

const SCOPE_LABEL: Record<PaletteScope, string> = {
  presets: 'Presets',
  prompts: 'Prompts',
  settings: 'Settings',
  workspaces: 'Workspaces',
  credentials: 'Credentials',
  worktrees: 'Worktrees',
  'agent-mode': 'Permission mode',
  search: 'Search',
  environment: 'Environment',
  capability: 'Which agents can'
}

const sectionLabel = (id: SectionId): string =>
  SECTIONS.find((s) => s.id === id)?.label ?? id

export function Palette(props: PaletteProps): JSX.Element {
  const { controller, inputMode } = props
  const [query, setQuery] = useState('')
  // M399 (A6). The selection is a ROW, not a slot: the id of the command
  // Enter will run. `index` is derived from it on every render, so there is
  // no frame in which a re-ranked list leaves the highlight — and Enter — on
  // whatever row slid into the old position. (It was an index, re-pointed by
  // an effect after the render that moved the rows.)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The order a person is arrowing through, held until the query or the
  // scope changes (palette-model's holdOrder). Set on the first navigation.
  const [held, setHeld] = useState<{ key: string; order: string[] } | null>(null)
  // Which drill-in is open. Read from the controller, NOT from local state:
  // M8a's top bar opens the palette directly into the settings scope, and the
  // scope has exactly one authority (usePalette). Keeping a copy here would
  // make this component a second author of it — the drift this milestone's
  // architecture exists to avoid. The controller clears it on both exits, so
  // the "a scope never outlives its overlay" guarantee this used to get for
  // free from unmounting still holds.
  const scope = controller.scope
  const setScope = controller.setScope
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLLIElement>(null)
  // The last position a REAL mouse move reported. Blink re-dispatches a
  // mousemove at the UNCHANGED cursor position after a scroll, to refresh
  // :hover state — so an ArrowDown that scrolls the list would otherwise
  // "hover" whichever row slid under a stationary cursor and snatch the
  // selection straight back, making the arrow keys useless the moment the
  // pointer happens to be resting over the list. Identical coordinates mean
  // the pointer did not move and the event is not the user's.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  // Set by the hover handler and consumed by the scroll effect below. A row
  // under the cursor is by definition already on screen; scrolling it FULLY
  // into view would shift every other row out from under the pointer, which
  // is the same feedback loop from the other direction.
  const pointerSelectRef = useRef(false)

  // M379. The team's asks, from the one store the Dock reads too.
  const teamAsks = useTeamAsks()
  const commands = useMemo(
    () =>
      buildCommands({
        presets: props.presets,
        prompts: props.prompts,
        panels: props.panels,
        settings: props.settings,
        workspaces: props.workspaces,
        credentials: props.credentials,
        worktrees: props.worktrees,
        envReport: props.envReport,
        starterReason: props.starterReason ?? null,
        ...(props.workflowTemplateOf === undefined ? {} : { workflowTemplateOf: props.workflowTemplateOf }),
        update: props.update ?? null,
        globalFontSize: props.globalFontSize,
        bookmarks: props.bookmarks,
        cameraTrail: props.cameraTrail,
        ...(props.canUndo === undefined ? {} : { canUndo: props.canUndo }),
        ...(props.canRedo === undefined ? {} : { canRedo: props.canRedo }),
        draftHeld: controller.capturedDraft,
        ...(props.canvasCovered === undefined ? {} : { canvasCovered: props.canvasCovered }),
        noteRoot: props.noteRoot,
        // M83. The memory row's subject is the captured panel's DIRECTORY;
        // main resolves it to the repository. Without this the row was
        // disabled for every panel — its reason is real, but it was never
        // true of a panel that has one.
        ...(props.noteRoot === null ? {} : { memoryRoot: props.noteRoot }),
        attentionIds: props.attentionIds,
        ...(props.pinnedCount === undefined ? {} : { pinnedCount: props.pinnedCount }),
        templates: props.templates,
        ...(props.teammateCount === undefined ? {} : { teammateCount: props.teammateCount }),
        approvals: props.approvals,
        teamAsks,
        capturedId: controller.capturedId,
        hasSelection: props.hasSelection,
        selectedIds: props.selectedIds,
        groups: props.groups,
        merged: props.merged,
        broadcastReady: props.broadcastReady,
        broadcastActive: props.broadcastActive,
        // M42. The query is the search TERM only inside the search scope; the
        // "no matches" row names it, so it must be the palette's own query.
        searchQuery: scope === 'search' ? query : '',
        searchResults: props.searchResults,
        ...(props.workSearch === undefined ? {} : { workSearch: props.workSearch }),
        // M365. The query is the capability NAME only inside its scope.
        capabilityQuery: scope === 'capability' ? query : '',
        ...(scope === 'capability' && props.capability !== undefined ? { capability: props.capability } : {}),
        scrollbackEnabled: props.scrollbackEnabled,
        actions: props.actions
      }),
    [props.presets, props.prompts, props.panels, props.settings, props.workspaces, props.bookmarks, props.cameraTrail, props.canUndo, props.canRedo, controller.capturedDraft, props.canvasCovered,
     props.credentials, props.worktrees, props.envReport, props.update, props.globalFontSize, props.attentionIds, props.approvals, teamAsks, props.templates, controller.capturedId, props.hasSelection,
     props.selectedIds, props.merged, props.actions,
     query, scope, props.searchResults, props.workSearch, props.scrollbackEnabled, props.capability]
  )
  const ranked = useMemo(() => filterCommands(commands, query, scope), [commands, query, scope])
  const holdKey = `${scope ?? ''}\u0000${query}`
  const rows = useMemo(() => (held !== null && held.key === holdKey ? holdOrder(ranked, held.order) : ranked), [ranked, held, holdKey])
  // Before the effect below has seated a selection (the first render), the
  // best match is what is shown selected — the same seat that effect picks.
  const found = selectedId === null ? -1 : rows.findIndex((r) => r.id === selectedId)
  const index = found >= 0 ? found : selectedId === null ? bestMatchIndex(rows, query) : -1
  // Navigation freezes the order it is navigating: arrows and hover both
  // call this before they move the selection.
  const holdRows = (): void => {
    if (held === null || held.key !== holdKey) setHeld({ key: holdKey, order: rows.map((r) => r.id) })
  }

  // M42. Report the live query to Canvas WHILE the search scope is open, so it
  // can debounce and ask main. Cleared (empty) when the scope leaves search,
  // so Canvas drops its results and the row set collapses to nothing.
  const onSearchQuery = props.onSearchQuery
  useEffect(() => {
    if (scope === 'search') onSearchQuery(query)
    // The DESTRUCTURED callback, not `props`: Canvas rebuilds `props` every
    // render, and depending on it refires this effect (and re-arms the
    // debounce) on every Canvas render while the scope is search — the exact
    // trap CLAUDE.md names for the Canvas split-out hooks. onSearchQuery is a
    // stable useCallback, so this fires only on a real scope/query change.
  }, [scope, query, onSearchQuery])
  // M365. The capability scope reports its query the same way; '' on leaving it, so Canvas drops its answers.
  const onCapabilityQuery = props.onCapabilityQuery
  useEffect(() => {
    onCapabilityQuery?.(scope === 'capability' ? query : '')
  }, [scope, query, onCapabilityQuery])

  // Rule 1: opening focuses the input. This is what takes the keyboard off
  // xterm — nothing else in this component does it, and without it the user's
  // typing goes to the agent while the palette sits there looking ready.
  useEffect(() => {
    inputRef.current?.focus()
  }, [inputMode])

  // What the selection was pointing AT last render, so the effect below can
  // follow the command rather than the slot it happened to occupy.
  const prevQueryRef = useRef(query)
  // M409. Set when the seat effect RE-SEATS (a query or scope change, or the
  // first seat), read once by the scroll effect. Starts true: opening is the
  // first seat.
  const reseatedRef = useRef(true)
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
  // POPPING a scope is the one re-seat that does not want bestMatchIndex. The
  // selection returns to the door it came in through instead — see doorIndex.
  // Without it a drill-in is a one-way trip: the query is empty on the way out
  // (runRow cleared it going in), every score ties at 0, and bestMatchIndex
  // degenerates to firstRunnable, dropping the user at the top of the Panels
  // section with no idea what moved them. Three things about this branch read
  // as bugs unless they are written down:
  //
  //   - `scope === null` is technically redundant, since doors carry no
  //     `scope` of their own and so are filtered out of every scoped list
  //     (verify:palette 49) — a scope-to-scope move would find nothing anyway.
  //     Kept because it states the DIRECTION this branch is for.
  //   - A pop with a live query is deliberately a no-op here. Escape and
  //     ArrowLeft both leave the query alone, so typing "del" inside Presets
  //     and escaping finds no door (doorIndex returns -1, since that door
  //     cannot match "del") and falls through to bestMatchIndex — correctly:
  //     a query the user is still holding is a stronger statement of intent
  //     than the door they left. Backspace is gated on an empty query and so
  //     always gets the door.
  //   - It also fires, inertly, on the input-mode round trip: Canvas.tsx's
  //     beginRenamePreset and friends call closePalette() then openPalette()
  //     inside one handler, which batches to "still open, scope now null"
  //     with no unmount. Nothing reads the index there — the list is not
  //     rendered while inputMode is set, selectedRef is null so the scroll
  //     effect no-ops, and Enter branches to inputMode.submit before runRow
  //     is reachable.
  useEffect(() => {
    const reseat = prevQueryRef.current !== query || prevScopeRef.current !== scope
    // Read BEFORE the ref is overwritten below: this is the scope being left.
    const leaving = prevScopeRef.current
    prevQueryRef.current = query
    prevScopeRef.current = scope
    // A new query or scope is a new list: the held order is spent, so the
    // same query typed again later is ranked afresh rather than frozen stale.
    if (reseat) { setHeld(null); reseatedRef.current = true }
    setSelectedId((current) => seatSelection({ rows, query, scope, leaving, reseat, current }))
  }, [rows, query, scope])

  // Keep the selected row on screen. .palette__list is max-height: 46vh with
  // overflow-y: auto, and the list is long by construction, so ArrowDown walks
  // straight past the bottom of the visible window and Enter runs a command the
  // user cannot see. 'nearest' so a selection already in view does not scroll
  // at all — and .palette__row carries a scroll-margin-top matching the sticky
  // header's height, or 'nearest' parks the row UNDER a header it considers
  // perfectly visible.
  //
  // Except when the pointer is what moved the selection: see pointerSelectRef.
  // M64. A NEW QUERY starts at the top. Without this the list keeps the
  // scroll offset of the previous query, and the first — best — match sits
  // hidden under the sticky section header (M61's critic, finding 7).
  const listRef = useRef<HTMLUListElement | null>(null)
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [query])
  useEffect(() => {
    if (pointerSelectRef.current) {
      pointerSelectRef.current = false
      return
    }
    const list = listRef.current
    const row = selectedRef.current
    // M409 (C5). A SEAT, not a step: the palette opened (or the query or
    // scope changed) and the selection landed on its best row. 'nearest'
    // parked that row at the BOTTOM edge, so the list opened scrolled to a
    // fractional offset with its top row cut in half under the sticky header
    // (measured on a fresh profile: scrollTop 223.5, the selection 19th). A
    // seated row inside the first screen leaves the list at its top; one
    // further down is brought to the top, under its own section header.
    if (reseatedRef.current && list !== null && row !== null) {
      reseatedRef.current = false
      const bottom = row.getBoundingClientRect().bottom - list.getBoundingClientRect().top + list.scrollTop
      if (bottom <= list.clientHeight) list.scrollTop = 0
      else row.scrollIntoView({ block: 'start' })
      return
    }
    row?.scrollIntoView({ block: 'nearest' })
  }, [index, rows])

  // The bottom fade is a claim ("there is more below") that has to stay
  // true: toggled on scroll and on every row-set change, not painted
  // unconditionally, or a short list that already fits reads as truncated.
  useEffect(() => {
    const el = listRef.current
    if (el === null) return
    const update = (): void => {
      const more = el.scrollHeight - el.scrollTop - el.clientHeight > 1
      el.toggleAttribute('data-more-below', more)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
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
        // M399 (A7): the scope the palette OPENED into (the ⚙'s Settings,
        // ⌘F's Search) has no root behind it the person ever saw — Escape
        // there closes, as it does at the root. A door walked through pops.
        if (!inputMode && scope !== null && scope !== controller.entryScope) setScope(null)
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
        holdRows()
        setSelectedId(rows[stepRunnable(rows, index, 1)]?.id ?? null)
        break
      case 'ArrowUp':
        event.preventDefault()
        holdRows()
        setSelectedId(rows[stepRunnable(rows, index, -1)]?.id ?? null)
        break
      // ArrowRight/ArrowLeft are the horizontal spelling of Enter-on-a-door
      // and Escape-in-a-scope: right opens the drill-in under the selection,
      // left comes back. Both are CARET-GATED, and that gate is the load-
      // bearing half rather than a nicety — .palette__input is the only text
      // field in this app the user cannot tab out of (Tab is an exit; see
      // above), so arrows that always navigated would leave a typed query
      // permanently uneditable, with no other key able to move the caret back
      // into it. Same boundary rule Backspace above already obeys, expressed
      // as a caret position instead of an empty string because there IS a
      // sensible mid-query press here.
      //
      // A non-collapsed selection (start !== end) is a user selecting text,
      // never navigating, so it fails the gate at both ends. Falling through
      // without preventDefault is what hands the keypress back to the browser
      // as ordinary caret movement.
      case 'ArrowRight': {
        if (inputMode) break
        const { selectionStart: start, selectionEnd: end } = event.currentTarget
        if (start === null || start !== end || start !== query.length) break
        const row = index >= 0 ? rows[index] : undefined
        // Deliberately only a door. ArrowRight never RUNS a row: Enter stays
        // the single key that does that, so a stray arrow press can neither
        // spawn a panel nor reach a destructive row's confirm. runRow already
        // knows what opening a door means (set the scope, clear the query it
        // was found with) and is reused rather than re-implemented here.
        if (row?.entersScope && row.disabledReason === undefined) {
          event.preventDefault()
          runRow(row)
        }
        break
      }
      case 'ArrowLeft': {
        if (inputMode || scope === null) break
        const { selectionStart: start, selectionEnd: end } = event.currentTarget
        if (start !== 0 || end !== 0) break
        event.preventDefault()
        // The query is left alone, unlike entering a door above. Popping is
        // an undo of the scope, not of what the user has typed since — and
        // at caret 0 with text in the field they are still editing it.
        setScope(null)
        break
      }
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
  const sheet = inputMode?.kind === 'sheet' ? inputMode.sheet ?? null : null
  const startSheet = inputMode?.kind === 'start' ? inputMode.start ?? null : null
  const setupSheet = inputMode?.kind === 'setup' ? inputMode.setup ?? null : null
  const footer = inputMode
    ? confirming
      ? '↵ confirm · esc cancel'
      : `↵ ${inputMode.verb ?? 'save'} · esc cancel`
    // The footer is the palette's only affordance list, so a shortcut absent
    // from it is a shortcut nobody finds — the same reasoning hiddenAtRest
    // obeys for rows. Which arrow is named depends on which one is reachable
    // from here: there is nothing to go back to at the top level, and no door
    // to open inside a scope (every row there is a leaf).
    : scope
      ? '↑↓ move · ↵ go to · ← back · esc close'
      : '↑↓ move · → open · ↵ run · esc close'

  return (
    <div
      className="palette"
      data-screen-control=""
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
      {setupSheet !== null ? (
        <SetupSheet model={setupSheet} onDone={() => controller.closePalette()} onCancel={() => controller.closePalette()} />
      ) : startSheet !== null ? (
        // M197. The start sheet owns the keyboard the way the spawn sheet
        // does: its first unanswered field takes focus on mount.
        <StartWorkSheet model={startSheet} onDone={() => controller.closePalette()} onCancel={() => controller.closePalette()} />
      ) : sheet !== null ? (
        // M65. The sheet owns the keyboard the way the input does: its first
        // field takes focus on mount, so the ghost input is not needed.
        <SpawnSheet model={sheet} onDone={() => controller.closePalette()} onCancel={() => controller.closePalette()} />
      ) : confirming ? (
        <input
          ref={inputRef}
          // Kept in the document, invisible, because it is what holds DOM
          // focus away from xterm — the same job xterm's own hidden textarea
          // does. display:none would make it unfocusable and hand the
          // keyboard back to the agent with a destructive question on screen.
          className="palette__input palette__input--ghost"
          role="combobox"
          aria-expanded
          aria-controls="palette-listbox"
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
            role="combobox"
            aria-expanded
            aria-controls="palette-listbox"
            aria-activedescendant={rows[index] ? `palette-row-${rows[index].id}` : undefined}
            // 'secret' is the only kind that renders as a password field —
            // see InputMode.kind's own doc comment above. Every other kind,
            // command mode included, is ordinary text: nothing else in this
            // app has a reason to mask what the user is typing.
            type={inputMode?.kind === 'secret' ? 'password' : 'text'}
            value={query}
            placeholder={
              inputMode
                ? inputMode.label
                : scope === 'search'
                  // M399 (A9): `Search ${label}` read "Search search…". What
                  // the scope reads, instead of its own name twice.
                  ? 'Search terminal output, chats and tasks…'
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

      {/* A refusal (out-of-range number edit) is not covered by `confirming`
          above — it stays in the ordinary bar, with the bad value still in
          the field, so it needs its OWN visible line for the same reason a
          confirm question does: read the `feedback` doc comment on
          InputMode for why the placeholder this mode also sets can never be
          the thing that shows this text. */}
      {inputMode?.feedback && <div className="palette__number-error">{inputMode.label}</div>}
      {inputMode?.hint !== undefined && <div className="palette__line-hint">{inputMode.hint}</div>}

      {/* M44. A listbox for a screen reader: each runnable row is an option,
          and the input points at the selected one via aria-activedescendant. */}
      {!inputMode && (
        <ul id="palette-listbox" className="palette__list" role="listbox" aria-label="Commands" ref={listRef}>
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
                {header && <li className="palette__section" role="presentation">{sectionLabel(row.group)}</li>}
                <li
                  ref={i === index ? selectedRef : null}
                  // M42. The command id, so a check (and only a check) can find
                  // one specific row without matching on its user-facing text.
                  data-command-id={row.id}
                  data-group={row.group}
                  // M44. Listbox option; a stable DOM id so the input's
                  // aria-activedescendant can name the selected row.
                  id={`palette-row-${row.id}`}
                  role="option"
                  aria-selected={i === index}
                  aria-disabled={row.disabledReason ? true : undefined}
                  className={[
                    'palette__row',
                    i === index ? 'palette__row--selected' : '',
                    row.disabledReason ? 'palette__row--disabled' : '',
                    row.destructive ? 'palette__row--destructive' : '',
                    row.mono ? 'palette__row--mono' : ''
                  ].filter(Boolean).join(' ')}
                  // onMouseDown, not onClick: it keeps DOM focus in the input,
                  // where a click would blur it first — and the input's focus
                  // is rule 1, the only thing holding the keyboard away from
                  // xterm.
                  onMouseDown={(e: MouseEvent<HTMLLIElement>) => {
                    e.preventDefault()
                    runRow(row)
                  }}
                  // Hovering moves the SELECTION rather than painting a second,
                  // parallel highlight: .palette__row--selected is the only
                  // thing telling the user what Enter will run, and two of them
                  // on screen at once is a question, not an answer. Disabled
                  // rows are skipped for the same reason stepRunnable skips
                  // them — a selection Enter cannot act on is a dead key.
                  //
                  // onMouseMove, not onMouseEnter: the synthetic post-scroll
                  // move fires either way, and only comparing coordinates can
                  // tell it apart from a real one. See lastPointerRef.
                  onMouseMove={(e: MouseEvent<HTMLLIElement>) => {
                    const last = lastPointerRef.current
                    if (last && last.x === e.clientX && last.y === e.clientY) return
                    lastPointerRef.current = { x: e.clientX, y: e.clientY }
                    if (row.disabledReason !== undefined || i === index) return
                    pointerSelectRef.current = true
                    holdRows()
                    setSelectedId(row.id)
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
                    {/* Composed here, not baked into row.title: the count is
                        transient state (agents finish, it changes), and
                        row.title feeds haystack() unconditionally — see
                        Command.waiting's doc comment in palette-model.ts. */}
                    {row.waiting !== undefined && row.waiting > 0 && ` · ${needsYouCount(row.waiting)}`}
                  </span>
                  {/* Says WHY it is disabled. A greyed-out row with no reason
                      is a bug report — the same rule menuLabel() states for
                      the menu. It replaces the subtitle rather than joining
                      it: the reason is the more urgent of the two. */}
                  {/* M64. The state word, live and in its tone, its own column. */}
                  {row.state !== undefined && <LiveStateWord id={row.state.id} input={row.state.input} />}
                  {/* M64. A search hit's line is terminal output: the term is
                      marked in it, the way the title's match is. */}
                  <span className="palette__hint">
                    {/* M399 (A9): an INFORMATION row (the search's "searched 1
                        terminal and 0 chats", a cap, a redaction count) is
                        disabled with its own title as the reason, so Enter
                        skips it — and that printed the same sentence twice. */}
                    {row.disabledReason !== undefined
                      ? (row.disabledReason === row.title ? null : <>{Lock}{row.disabledReason}</>)
                      : (scope === 'search' && row.subtitle !== undefined
                          ? splitHighlight(row.subtitle, query).map((seg, si) => seg.hit ? <mark key={si} className="palette__hit">{seg.text}</mark> : <span key={si}>{seg.text}</span>)
                          : (row.subtitle ?? ''))}
                  </span>
                  {row.entersScope && <span className="palette__chevron"><ChevronRight /></span>}
                  {row.shortcut && <kbd className="palette__kbd">{row.shortcut}</kbd>}
                </li>
              </Fragment>
            )
          })}
          {/* M399 (A9): ⌘F opens the search scope with nothing typed, and
              "No matching command" answered a search nobody had made. */}
          {rows.length === 0 && <li className="palette__empty">{scope === 'search' && query.trim() === '' ? <EmptyState id="palette-search" /> : <EmptyState id="palette" />}</li>}
        </ul>
      )}

      {/* M65. The sheet carries its own keys line; the overlay's footer would
          say "save · cancel" under a form whose verb is "start". */}
      {/* M197. A SHEET owns its own foot, and both of them do: the palette's
          footer under the start sheet printed `↵ start · esc cancel` directly
          beneath the sheet's own `↵ start · esc close`, two answers to one
          question, differing only in the last word. Caught by the golden —
          both checks over this surface read values, and a doubled line is not
          a value. */}
      {sheet === null && startSheet === null && setupSheet === null && <div className="palette__footer">{footer}</div>}
    </div>
  )
}

/**
 * M64. A Go-to row's state word, from the one vocabulary, subscribed per
 * panel so it is live while the palette is open — the rows themselves are
 * frozen on open by design, and a frozen word read `working` beside a rail
 * that said `idle` in M64's first render.
 */
function LiveStateWord({ id, input }: { id: string; input: StateInput }): JSX.Element {
  const shown = panelState(input, useAgentState(id))
  // A sessionless kind has no state: its column stays empty (the kind is
  // the rail glyph's to say, not this slot's).
  // M175. The state a DOT a person reads; the word stays in the DOM (clipped) for data-state-word and the row's title.
  return <>{shown.tone !== 'kind' && <span className="palette__state-dot" data-tone={shown.tone} title={shown.word} aria-hidden="true" />}<span className="palette__state" data-tone={shown.tone} data-state-word>{shown.tone === 'kind' ? '' : shown.word}</span></>
}
