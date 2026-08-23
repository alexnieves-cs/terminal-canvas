import type { JSX } from 'react'
import { Canvas } from './canvas/Canvas'
import { PLACEHOLDER_PANELS } from './canvas/placeholder-panels'

/**
 * M2 scope: the canvas and its coordinate math, with dumb rectangles instead
 * of terminals.
 *
 * TerminalPanel is intentionally not mounted for this milestone. M1 proved the
 * PTY path with no transform math so a blank panel had one possible cause;
 * this is the mirror image. M3 reunites them, and verify:pty* remains the
 * proof that the PTY layer still works meanwhile.
 */
export function App(): JSX.Element {
  return (
    <div className="app">
      <Canvas rects={PLACEHOLDER_PANELS} />
    </div>
  )
}
