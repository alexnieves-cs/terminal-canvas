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
  defaultTemplate,
  allPanelIds
}: {
  initial: CanvasState
  /** Panels that already have a process; see renderer/main.tsx for the rule. */
  liveSessionIds: Set<string>
  /** Cmd+N's template, caught at module scope; see renderer/main.tsx. */
  defaultTemplate?: PresetTemplate
  /** Every panel id in every workspace; see renderer/main.tsx and Canvas.tsx. */
  allPanelIds: readonly string[]
}): JSX.Element {
  return (
    <div className="app">
      <Canvas
        initial={initial}
        liveSessionIds={liveSessionIds}
        defaultTemplate={defaultTemplate}
        allPanelIds={allPanelIds}
      />
    </div>
  )
}
