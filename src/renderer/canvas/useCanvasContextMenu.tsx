import { useCallback, useState, type JSX, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import type { PanelMarks } from '@renderer/components/PanelFrame'
import type { PaletteActions } from '@renderer/palette/commands'
import { panelName } from '@renderer/palette/panel-name'
import { isTerminalPanel, type Panel } from '@renderer/panels/panels'
import type { Registry } from '@renderer/session/session-registry'
import { CanvasContextMenu, type ContextRow } from './CanvasContextMenu'
import { longAxisOf, panelVerbs, runPanelVerb, runSelectionVerb, selectionVerbs, type SelectionFacts } from './object-verbs'
import type { CanvasEditRoutes } from './useCanvasClipboard'
// The screen-space controls over the world, the menu itself among them (one selector, screen-controls.ts).
import { SCREEN_CONTROLS } from './screen-controls'

export interface CanvasContextMenuDeps {
  hostRef: RefObject<HTMLElement | null>
  panelsRef: RefObject<Panel[]>
  selectedIdsRef: RefObject<ReadonlySet<string>>
  /** The ⋯ menu's doors: the same object every frame reads, so both menus run one executor. */
  marksRef: RefObject<PanelMarks>
  paletteActionsRef: RefObject<PaletteActions | null>
  editRef: RefObject<CanvasEditRoutes>
  registry: Registry
  mergedRef: RefObject<boolean>
  /** Select and raise WITHOUT waking (selectAndRaise): inspecting a dormant panel must not start it. */
  selectPanel: (id: string) => void
  /** Give a panel the keyboard (Copy/Paste act on the focused panel), or take it from every panel (null). */
  focusPanel: (id: string | null) => void
}

type Target = { forId: string; at: { x: number; y: number }; heading?: string; rows: ContextRow[] }

/** Where a right-click is somebody else's: an editable field, Monaco, a surface serving its own edits. */
const EDIT_OWNERS = 'input, textarea, select, [contenteditable="true"], .monaco-editor, [data-edit-owner]'

/**
 * M408 (D1). The canvas's right-click: ONE `contextmenu` listener on the host,
 * in the BUBBLE phase, so xterm's own right-click handling (a word selected
 * under the press, macOS's `rightClickSelectsWord`) has run first and Copy can
 * see it. What the press landed on decides the rows:
 *
 *  - a panel: select it (Finder's rule — the menu is about what you pressed),
 *    then a terminal's Copy / Paste first (Terminal.app, iTerm2, Ghostty), then
 *    the ⋯ menu's own list (`panelVerbs`), then Close from the pill's list;
 *  - a panel inside a multi-selection: the pill's selection verbs, for all;
 *  - the ground: Paste (the canvas's own ⌘V arm: objects, Mermaid, a picture),
 *    New object… (the Create sheet, the HUD's door) and Fit.
 *
 * A terminal whose program asked for the mouse (tmux, vim — xterm marks it
 * `.enable-mouse-events`) keeps a plain right-click; ⌥-right-click opens the
 * menu there, as iTerm2 does.
 */
export function useCanvasContextMenu(deps: CanvasContextMenuDeps): { onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void; element: JSX.Element | null } {
  const { hostRef, panelsRef, selectedIdsRef, marksRef, paletteActionsRef, editRef, registry, mergedRef, selectPanel, focusPanel } = deps
  const [target, setTarget] = useState<Target | null>(null)
  const close = useCallback(() => setTarget(null), [])

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const el = event.target instanceof Element ? event.target : null
    const host = hostRef.current
    if (el === null || host === null) return
    const xterm = el.closest('.xterm')
    // xterm's own helper textarea is not an edit owner: its right-click handler
    // parks that textarea under the pointer, so the NEXT right-click there
    // targets it — and must still open the terminal's menu.
    if (el.closest(SCREEN_CONTROLS) !== null || (xterm === null && el.closest(EDIT_OWNERS) !== null)) return
    if (xterm !== null && xterm.classList.contains('enable-mouse-events') && !event.altKey) return
    event.preventDefault()
    const b = host.getBoundingClientRect()
    const at = { x: event.clientX - b.left, y: event.clientY - b.top }
    const actions = paletteActionsRef.current
    const marks = marksRef.current
    if (actions === null) return
    const panels = panelsRef.current ?? []
    const facts = (ids: readonly string[]): SelectionFacts => {
      const chosen = panels.filter((p) => ids.includes(p.rect.id))
      return { selectedIds: ids, shape: chosen.some((p) => p.kind === 'shape'), longAxis: longAxisOf(chosen.map((p) => p.rect)) }
    }
    const selRows = (f: SelectionFacts, only?: ReadonlySet<string>): ContextRow[] => selectionVerbs(f)
      .filter((v) => only === undefined || only.has(v.key))
      .map((v) => ({ id: `sel.${v.key}`, label: v.label, section: 'selection', ...(v.reason !== undefined ? { disabled: v.reason } : {}), run: () => runSelectionVerb(v.key, f, actions) }))
    const pasteFromClipboard = (): void => {
      // The clipboard's TEXT, read here because this door is not the menu
      // accelerator (which main hands the text). Empty or unreadable is the
      // handler's own no-text arm: a picture on the clipboard still lands.
      void navigator.clipboard.readText().catch(() => '').then((text) => editRef.current?.paste(text))
    }
    const panelEl = el.closest<HTMLElement>('[data-panel-id]')
    const id = panelEl?.dataset.panelId
    const panel = id === undefined ? undefined : panels.find((p) => p.rect.id === id)
    if (id === undefined || panel === undefined) {
      setTarget({
        forId: 'canvas', at,
        rows: [
          { id: 'edit.paste', label: 'Paste', title: 'Paste onto the canvas — copied objects, a Mermaid diagram, or a picture', section: 'edit', run: () => { focusPanel(null); pasteFromClipboard() } },
          { id: 'canvas.create', label: 'New object…', title: 'Open Create — a terminal, agent, note, picture…', section: 'create', ...(mergedRef.current ? { disabled: 'leave merged view to create an object' } : {}), run: () => actions.beginSpawnSheet() },
          ...selRows(facts([]))
        ]
      })
      return
    }
    const selected = selectedIdsRef.current ?? new Set<string>()
    if (selected.size > 1 && selected.has(id)) {
      setTarget({ forId: id, at, heading: `${selected.size} selected`, rows: selRows(facts([...selected])).filter((r) => r.id !== 'sel.fit') })
      return
    }
    selectPanel(id)
    const rows: ContextRow[] = []
    if (isTerminalPanel(panel)) {
      const chosen = registry.get(id)?.handle.getSelection() ?? ''
      rows.push(
        { id: 'edit.copy', label: 'Copy', section: 'edit', ...(chosen === '' ? { disabled: 'nothing is selected in this terminal' } : {}), run: () => { focusPanel(id); editRef.current?.copy() } },
        { id: 'edit.paste', label: 'Paste', title: 'Paste into this terminal (bracketed, like ⌘V)', section: 'edit', run: () => { focusPanel(id); pasteFromClipboard() } }
      )
    }
    const task = marks.task?.of(id)
    for (const v of panelVerbs({
      ...(task !== undefined ? { task } : {}),
      taskFocus: marks.task?.focus !== undefined,
      ...(marks.advanced !== undefined && !marks.readOnly ? { advanced: marks.advanced.of(id) } : {}),
      readOnly: marks.readOnly,
      framed: !marks.readOnly,
      maximised: marks.marks.get(id)?.maximised === true,
      palette: marks.more !== undefined
    })) {
      rows.push({ id: v.id, label: v.label, title: v.title, section: v.section, ...(v.disabled !== undefined ? { disabled: v.disabled } : {}), ...(v.benefit !== undefined ? { benefit: v.benefit } : {}), run: () => runPanelVerb(v.id, id, marks) })
    }
    rows.push(...selRows(facts([id]), new Set(['close'])).map((r) => ({ ...r, label: 'Close panel' })))
    setTarget({ forId: id, at, heading: panelName(panel), rows })
  }, [hostRef, panelsRef, selectedIdsRef, marksRef, paletteActionsRef, editRef, registry, mergedRef, selectPanel, focusPanel])

  const element = target === null ? null : (
    <CanvasContextMenu key={`${target.forId}:${target.at.x},${target.at.y}`} at={target.at} forId={target.forId}
      {...(target.heading !== undefined ? { heading: target.heading } : {})} rows={target.rows} onClose={close} />
  )
  return { onContextMenu, element }
}
