import { memo, type JSX } from 'react'
import type { DockEntry, NavPaneId } from './nav-dock'
import { shellControl } from './shell-control'

export interface NavDockProps {
  entries: DockEntry[]
  onSelect: (id: NavPaneId) => void
}

/**
 * The icon column, and the only permanently resident navigation chrome besides
 * the top bar.
 *
 * Every button mounts shellControl(), whose onMouseDown: preventDefault is the
 * whole mechanism keeping DOM focus on the terminal. Without it the button
 * works and the next keystroke goes nowhere — and the failure is silent, which
 * is why verify:panels 75c drives a REAL sendInputEvent rather than a
 * dispatched MouseEvent: a synthetic event is isTrusted: false and moves no
 * focus whether or not preventDefault fires, so a dispatched check would pass
 * against the exact regression it exists to catch.
 *
 * memo'd, and `entries` is frozen on a signature by Canvas for the reason every
 * other row array in this directory is: Canvas re-renders on every mousemove
 * over the canvas (setCursor) and on every frame of a drag (setPanelRect), so
 * an unfrozen array defeats this memo outright and the symptom is invisible on
 * a four-panel canvas.
 *
 * The dock is rendered UNCONDITIONALLY and has no collapsed state of its own.
 * It is what SideRail's 22px strip and FileTree's were each standing in for —
 * "the only way back for a user who does not know the chord" — except that one
 * resident column answers for all four panes instead of each region owning a
 * sliver of width to hold its own way back.
 */
function NavDockImpl({ entries, onSelect }: NavDockProps): JSX.Element {
  return (
    <nav className="dock" aria-label="Navigator">
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          className={`dock__btn${e.active ? ' dock__btn--active' : ''}`}
          data-dock-id={e.id}
          // aria-pressed and the --active modifier carry the same fact for two
          // different audiences: a screen reader needs the state NAMED, and the
          // button has to LOOK held, or the only way to tell which pane is open
          // is to recognise its contents.
          aria-pressed={e.active}
          title={e.badge === undefined ? e.label : `${e.label} (${e.badge})`}
          // The badge is spelled out here rather than left as a bare number,
          // because "Attention, 2" read aloud is a coordinate and "2 waiting"
          // is the fact. The visible badge stays a NUMBER — see nav-dock.ts.
          aria-label={e.badge === undefined ? e.label : `${e.label}, ${e.badge} waiting`}
          {...shellControl(() => onSelect(e.id))}
        >
          <span className="dock__glyph" aria-hidden="true">
            {e.glyph}
          </span>
          {/*
            `!== undefined`, never a truthiness test. buildDock omits the key
            entirely for a zero count rather than storing 0, and a truthiness
            test would agree with it today by coincidence — so the two would
            still agree the day someone "simplified" the model to always assign,
            and the badge would then read "0" beside Attention: a claim that an
            agent is waiting, immediately contradicted by the number making it.
            verify:rail 111 pins the model's half; this is the render's.
          */}
          {e.badge !== undefined && (
            <span className="dock__badge" aria-hidden="true">
              {e.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}

export const NavDock = memo(NavDockImpl)
