import type { JSX } from 'react'
import type { PresetRow } from '../palette/commands'
import { shellControl } from './shell-control'

export interface TopBarProps {
  presets: PresetRow[]
  scale: number
  onSpawnPreset: (id: string) => void
  onZoomBy: (factor: number) => void
  onFit: () => void
  onSearch: () => void
  onSettings: () => void
}

/**
 * The step the +/- buttons take. Restated here rather than imported because
 * useViewport's KEYBOARD_ZOOM_STEP is module-private; if a later task exports
 * it, import it and delete this constant. What must NOT be restated is the
 * zoom itself — the buttons call onZoomBy, i.e. useViewport's named verb, so
 * Cmd+= and + are provably the same gesture rather than two copies of the
 * same arithmetic.
 */
const ZOOM_STEP = 1.2

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
  presets, scale, onSpawnPreset, onZoomBy, onFit, onSearch, onSettings
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
        disabled={preferred === undefined}
        title={preferred ? `New ${preferred.name} panel (⌘N)` : 'No preset is available'}
        {...shellControl(() => { if (preferred) onSpawnPreset(preferred.id) })}
      >
        + New panel
      </button>

      <div className="shell__zoom" role="group" aria-label="Zoom">
        <button type="button" className="shell__zoom-out" title="Zoom out (⌘−)"
          aria-label="Zoom out" {...shellControl(() => onZoomBy(1 / ZOOM_STEP))}>−</button>
        <span className="shell__zoom-readout">{Math.round(scale * 100)}%</span>
        <button type="button" className="shell__zoom-in" title="Zoom in (⌘=)"
          aria-label="Zoom in" {...shellControl(() => onZoomBy(ZOOM_STEP))}>+</button>
        <button type="button" className="shell__fit" title="Fit everything (⌘1)"
          {...shellControl(onFit)}>Fit</button>
      </div>

      <div className="shell__spacer" />

      <button type="button" className="shell__search" title="Search commands (⌘K)"
        {...shellControl(onSearch)}>Search ⌘K</button>
      <button type="button" className="shell__settings" title="Settings"
        aria-label="Settings" {...shellControl(onSettings)}>⚙</button>
    </header>
  )
}
