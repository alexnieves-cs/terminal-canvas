import type { JSX } from 'react'
import { Canvas } from './canvas/Canvas'

/**
 * M3: real terminals on the canvas. The M2 regression — placeholder rectangles
 * instead of a live terminal — ends here; Canvas owns the panels now.
 */
export function App(): JSX.Element {
  return (
    <div className="app">
      <Canvas />
    </div>
  )
}
