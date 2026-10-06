import type { JSX } from 'react'
import { shortcutById } from '@shared/shortcuts'
import { setWorldOn } from './world-toggle'
import { warmWorldView } from './WorldStage'

/**
 * The 2D | World segmented control at the canvas's top left (M449).
 * ⌘⇧W is the registry's `world` chord, not a second list. The class
 * `shell__world-toggle` stays so a selector that still names the old
 * top-bar button keeps finding a control; removing that button is R-042.
 */
export function WorldLens({ on }: { on: boolean }): JSX.Element {
  const chord = shortcutById('world')?.chord ?? '⌘⇧W'
  return (
    <div
      className="world-lens shell__world-toggle"
      role="group"
      aria-label="Canvas lens"
      data-world-lens
      // Shots and the old top-bar selector click this node. A click on a
      // segment is that segment's; a click on the group itself enters World.
      onClick={(event) => { if (event.target === event.currentTarget) setWorldOn(true) }}
    >
      <button type="button" aria-pressed={!on} aria-label="2D canvas" onClick={() => setWorldOn(false)}>2D</button>
      <button type="button" aria-pressed={on} title={`World (${chord})`} onPointerEnter={() => warmWorldView()} onFocus={() => warmWorldView()} onClick={() => setWorldOn(true)}>
        World <kbd>{chord}</kbd>
      </button>
    </div>
  )
}
