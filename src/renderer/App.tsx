import type { JSX } from 'react'
import type { CanvasState } from '@shared/layout-schema'
import { Canvas } from './canvas/Canvas'

/**
 * M4b: the starting canvas arrives from main rather than from a constant.
 * App stays a pass-through — it exists to own the outer layout, not state.
 */
export function App({
  initial,
  liveSessionIds
}: {
  initial: CanvasState
  /** Panels that already have a process; see renderer/main.tsx for the rule. */
  liveSessionIds: Set<string>
}): JSX.Element {
  return (
    <div className="app">
      <Canvas initial={initial} liveSessionIds={liveSessionIds} />
    </div>
  )
}
