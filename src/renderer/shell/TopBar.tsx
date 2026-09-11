import { useEffect, useRef, useState, type JSX } from 'react'
import type { PresetRow } from '../palette/commands'
import { shellControl } from './shell-control'
import { Check, ChevronDown, Lanes, PanelRight, Pin, ProductMark, Search } from '@renderer/icons'

export interface TopBarProps {
  presets: PresetRow[]
  /** M65. The button opens the spawn sheet; ⌘N (the menu's accelerator) stays the instant default. */
  onOpenSheet: () => void
  /** M66. The active workspace's name, for the merged toggle's "back to …". */
  workspaceName?: string
  onSearch: () => void
  /** M257. The selected object's one task, when its ownership is unambiguous. */
  taskName?: string
  theme: 'system' | 'light' | 'dark'
  onSetTheme: (theme: 'system' | 'light' | 'dark') => void
  /** Whether M14's merged view is currently showing. */
  merged: boolean
  onToggleMerged: () => void
  /** M46. The context pane is on screen (a column, or a Compact drawer). */
  contextOpen: boolean
  onToggleContext: () => void
  /** (this redesign) Keeps the inspector open through the Compact breakpoint's own auto-collapse (`shell.inspectorPinned`). */
  inspectorPinned: boolean
  onToggleInspectorPinned: () => void
}


/**
 * The visible verbs. Every one of them already existed as a chord or a palette
 * row; this bar is a second VIEW over them, which is why each handler is a
 * prop rather than an implementation.
 *
 * The spawn button routes through onSpawnPreset -> PaletteActions.spawnPreset
 * -> preset:spawn-by-id, i.e. main. That is not indirection for its own sake:
 * only main can resolve an ABSENT command into the user's login shell, so a
 * renderer-side spawn would launch a hardcoded shell for the built-in preset
 * and every user preset saved from a login-shell panel.
 *
 * Every control here mounts shellControl(), which preventDefaults its own
 * mousedown so DOM focus never leaves the terminal. A top bar that stole
 * focus would break the app's central promise — that bare keys reach the
 * agent — on the very first click, and silently: the button would work, and
 * the next keystroke would go nowhere.
 */
export function TopBar({
  presets, onOpenSheet, onSearch, merged, onToggleMerged, contextOpen, onToggleContext,
  workspaceName, taskName, theme, onSetTheme, inspectorPinned, onToggleInspectorPinned
}: TopBarProps): JSX.Element {
  // The default preset if it can actually run, otherwise the first that can.
  // Availability matters here for the same reason it does in the palette: an
  // unavailable preset spawns a panel that dies instantly with "command not
  // found", which reads as the button being broken rather than as claude not
  // being on PATH.
  const fallback = presets.find((p) => p.available)
  const preferred = presets.find((p) => p.isDefault && p.available) ?? fallback
  const [viewOpen, setViewOpen] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!viewOpen) return
    const close = (event: MouseEvent): void => {
      if (!viewRef.current?.contains(event.target as Node)) setViewOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [viewOpen])
  const chooseTheme = (value: 'system' | 'light' | 'dark'): void => {
    onSetTheme(value)
    setViewOpen(false)
  }

  return (
    <header className="shell__top" aria-label="Toolbar">
      {/*
        SPIKE. The bar was using roughly a quarter of its width — four small
        controls hard-left, two hard-right, and ~1000px of nothing between.
        This is the window's only fixed anchor and the one place display type
        costs nothing (it is inside the traffic-light clearance the bar now
        pays for itself, so it occupies space that was previously dead).
        aria-hidden: it is decoration, and the window already has a title.
      */}
      <span className="shell__mark" aria-hidden="true"><ProductMark /><span>canvas</span></span>

      <button
        type="button"
        className="shell__spawn"
        // M65. The button is the considered door (the sheet); ⌘N — the menu's
        // accelerator — stays the instant default. Never disabled: the sheet
        // can always take a typed command.
        title={preferred ? `Create… (⌘⇧N) — ⌘N starts ${preferred.name} at once` : 'Create… (⌘⇧N)'}
        {...shellControl(onOpenSheet)}
      >
        <span>+ Create</span> <kbd>⌘⇧N</kbd>
      </button>

      <div className="shell__workspace" title={taskName === undefined ? workspaceName : `${workspaceName} / ${taskName}`}>
        <span>{merged ? 'All workspaces' : (workspaceName ?? 'Workspace')}</span>
        {taskName !== undefined && <><span className="shell__breadcrumb-separator">/</span><span className="shell__task">{taskName}</span></>}
      </div>

      <button type="button" className="shell__search" title="Search panels, files, tasks, commands… (⌘K)"
        {...shellControl(onSearch)}><Search /><span>Search panels, files, tasks, commands…</span><kbd>⌘K</kbd></button>
      <div className="shell__view" ref={viewRef}>
        <button type="button" className="shell__view-trigger" aria-haspopup="menu" aria-expanded={viewOpen}
          {...shellControl(() => setViewOpen((open) => !open))}>View <ChevronDown /></button>
        <div className="shell__view-menu" role="menu" aria-label="View" hidden={!viewOpen}>
          <div className="shell__view-heading">Appearance</div>
          {(['system', 'light', 'dark'] as const).map((value) => (
            <button key={value} type="button" role="menuitemradio" aria-checked={theme === value}
              {...shellControl(() => chooseTheme(value))}><span className="shell__view-check">{theme === value && <Check />}</span>{value === 'system' ? 'System theme' : `${value[0]!.toUpperCase()}${value.slice(1)} theme`}</button>
          ))}
          <div className="shell__view-heading">Layout</div>
          <button type="button" role="menuitemcheckbox" aria-checked={contextOpen}
            className={`shell__inspector-toggle${contextOpen ? ' shell__inspector-toggle--on' : ''}`}
            {...shellControl(onToggleContext)}><span className="shell__view-check">{contextOpen && <Check />}</span><PanelRight /> Context pane <kbd>⇧⌘\\</kbd></button>
          {/* (this redesign) Pin the inspector open THROUGH the Compact
              breakpoint's own auto-collapse — a separate axis from
              contextOpen above (open/closed at all), the way
              `shell--inspector-pinned` is a separate class from
              `shell--inspector-collapsed` in the stylesheet. */}
          <button type="button" role="menuitemcheckbox" aria-checked={inspectorPinned}
            className={`shell__inspector-pin${inspectorPinned ? ' shell__inspector-pin--on' : ''}`}
            title={inspectorPinned ? 'Stop keeping the inspector open on a narrow window' : 'Keep the inspector open even when the window narrows'}
            {...shellControl(onToggleInspectorPinned)}><span className="shell__view-check">{inspectorPinned && <Check />}</span>{Pin} Pin inspector open</button>
          <button type="button" role="menuitemcheckbox" aria-checked={merged} aria-pressed={merged}
            className={`shell__merge${merged ? ' shell__merge--on' : ''}`}
            {...shellControl(onToggleMerged)}><span className="shell__view-check">{merged && <Check />}</span><Lanes /> Merged view</button>
        </div>
      </div>
    </header>
  )
}
