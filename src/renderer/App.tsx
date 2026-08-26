import type { JSX } from 'react'
import type { CanvasState } from '@shared/layout-schema'
import type { PresetTemplate } from '@shared/ipc-contract'
import { Canvas } from './canvas/Canvas'

/**
 * M4b: the starting canvas arrives from main rather than from a constant.
 * App stays a pass-through — it exists to own the outer layout, not state.
 */
export function App({
  initial,
  liveSessionIds,
  defaultTemplate
}: {
  initial: CanvasState
  /** Panels that already have a process; see renderer/main.tsx for the rule. */
  liveSessionIds: Set<string>
  /** Cmd+N's template, caught at module scope; see renderer/main.tsx. */
  defaultTemplate?: PresetTemplate
}): JSX.Element {
  return (
    <div className="app">
      <Canvas
        initial={initial}
        liveSessionIds={liveSessionIds}
        defaultTemplate={defaultTemplate}
      />
    </div>
  )
}
