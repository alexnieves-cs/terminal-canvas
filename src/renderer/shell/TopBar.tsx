import type { JSX } from 'react'
import type { PresetRow } from '../palette/commands'
import { shellControl } from './shell-control'
import { Gear, Lanes, PanelRight, Search  } from '@renderer/icons'

export interface TopBarProps {
  presets: PresetRow[]
  /** M65. The button opens the spawn sheet; ⌘N (the menu's accelerator) stays the instant default. */
  onOpenSheet: () => void
  /** M66. The active workspace's name, for the merged toggle's "back to …". */
  workspaceName?: string
  onSearch: () => void
  onSettings: () => void
  /** Whether M14's merged view is currently showing. */
  merged: boolean
  onToggleMerged: () => void
  /** M46. The context pane is on screen (a column, or a Compact drawer). */
  contextOpen: boolean
  onToggleContext: () => void
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
  presets, onOpenSheet, onSearch, onSettings, merged, onToggleMerged, contextOpen, onToggleContext, workspaceName
}: TopBarProps): JSX.Element {
  // The default preset if it can actually run, otherwise the first that can.
  // Availability matters here for the same reason it does in the palette: an
  // unavailable preset spawns a panel that dies instantly with "command not
  // found", which reads as the button being broken rather than as claude not
  // being on PATH.
  const fallback = presets.find((p) => p.available)
  const preferred = presets.find((p) => p.isDefault && p.available) ?? fallback

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
      <span className="shell__mark" aria-hidden="true">terminal<span>.</span></span>

      <button
        type="button"
        className="shell__spawn"
        // M65. The button is the considered door (the sheet); ⌘N — the menu's
        // accelerator — stays the instant default. Never disabled: the sheet
        // can always take a typed command.
        title={preferred ? `New panel… (⌘⇧N) — ⌘N starts ${preferred.name} at once` : 'New panel… (⌘⇧N)'}
        {...shellControl(onOpenSheet)}
      >
        New panel… <kbd>⌘⇧N</kbd>
      </button>

      {/* M46: the zoom cluster moved to the canvas HUD — a VIEW control
          belongs with the view readout, in the corner that already holds
          one. */}

      {/* The merged view's discoverable door. `aria-pressed` and the --on
          modifier both carry the same fact, because the two audiences are
          different: a screen reader needs the state named, and the button has
          to LOOK held down or the only way to tell which mode you are in is
          to recognise the canvas. It is a toggle rather than an enter/leave
          pair for the reason PaletteActions.toggleMerged is one. */}
      <button
        type="button"
        className={`shell__merge${merged ? ' shell__merge--on' : ' icon-button'}`}
        aria-pressed={merged}
        aria-label={merged ? `back to ${workspaceName ?? 'this workspace'}` : 'Merged view: every workspace at once, read-only'}
        title={merged ? `back to ${workspaceName ?? 'this workspace'}` : 'Merged view: every workspace at once, read-only'}
        {...shellControl(onToggleMerged)}
      >
        <Lanes />
        {/* M66. While the mode is on, the BUTTON says so — the label is
            inside it, so the pressed control and the words are one thing and
            the door out is the thing that names the mode. The glyph alone
            read as a duplicate of the dock's Workspaces (M61's critic), and a
            label beside a bare glyph read as loose text (M66's critic). */}
        {merged && <span className="shell__merge-label" data-merge-label>merged view · read-only</span>}
      </button>

      <div className="shell__spacer" />

      <button type="button" className="shell__search" title="Search commands (⌘K)"
        {...shellControl(onSearch)}><Search /> Search <kbd>⌘K</kbd></button>
      <button type="button" className="shell__settings icon-button" title="Settings"
        aria-label="Settings" {...shellControl(onSettings)}><Gear /></button>
      {/* M46. The context pane's toggle lives here, not in the pane: when
          the pane is hidden there is no pane to hold it, and the old 22px
          strip was a column of nothing. aria-pressed names the state. */}
      <button type="button" className={`shell__inspector-toggle icon-button${contextOpen ? ' shell__inspector-toggle--on' : ''}`}
        title={contextOpen ? 'Hide the context pane (⇧⌘\\)' : 'Show the context pane (⇧⌘\\)'}
        aria-label={contextOpen ? 'Hide the context pane' : 'Show the context pane'}
        aria-pressed={contextOpen} {...shellControl(onToggleContext)}><PanelRight /></button>
    </header>
  )
}
