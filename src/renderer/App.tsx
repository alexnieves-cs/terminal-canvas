import type { JSX } from 'react'
import type { CanvasState } from '@shared/layout-schema'
import type { PresetTemplate } from '@shared/ipc-contract'
import { Canvas } from './canvas/Canvas'

/**
 * M4b: the starting canvas arrives from main rather than from a constant.
 * App stays a pass-through.
 *
 * It no longer owns the outer layout, and this comment used to say it did.
 * Since M8a the frame — the `.shell` grid holding the top bar, the rail, the
 * canvas and the inspector — is what `Canvas.tsx` RETURNS, because every verb
 * the shell needs (`paletteActions`, `openPalette`, the camera verbs,
 * `presetRows`) is state that lives inside `Canvas`; an App-owned frame would
 * have meant lifting all of it up and making App a state owner. What is left
 * here is `.app` itself, which exists for its `padding: 38px 0 0` under the
 * traffic lights, and the props main resolved before the first render.
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
