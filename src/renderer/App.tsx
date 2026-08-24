import type { JSX } from 'react'
import type { CanvasState } from '@shared/layout-schema'
import { Canvas } from './canvas/Canvas'

/**
 * M4b: the starting canvas arrives from main rather than from a constant.
 * App stays a pass-through — it exists to own the outer layout, not state.
 */
export function App({ initial }: { initial: CanvasState }): JSX.Element {
  return (
    <div className="app">
      <Canvas initial={initial} />
    </div>
  )
}
