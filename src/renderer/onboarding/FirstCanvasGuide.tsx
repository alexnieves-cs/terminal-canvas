import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import { GUIDE_STEPS, guideBody, guideView, type GuideSignals } from '@shared/first-canvas-guide'
import { shortcutById } from '@shared/shortcuts'
import { hostedWords } from '@shared/hosted-keys'
import { isHosted } from '@renderer/hosted'
import { endGuide, guideStepIndex, setGuideStep, subscribeGuide } from './guide-store'

/**
 * M644. The guided first canvas: three moves, one small card, never modal
 * (shared/first-canvas-guide.ts has the rules). It watches for each move and
 * ticks it; Next is always there, and Skip ends it for good.
 *
 * `hidden` is for the moments something else owns the screen (the first-run
 * card, the merged view): the tour keeps its place and comes back.
 */
export function FirstCanvasGuide({ panelCount, reviewOpen, hidden = false }: {
  panelCount: number
  reviewOpen: boolean
  hidden?: boolean
}): JSX.Element | null {
  const index = useSyncExternalStore(subscribeGuide, guideStepIndex, guideStepIndex)
  const running = index !== null
  // Sticky for the life of the tour: opening Review and coming back must not untick it.
  const [jumped, setJumped] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  useEffect(() => { if (running && reviewOpen) setReviewed(true) }, [running, reviewOpen])
  useEffect(() => {
    if (!running) return
    // Capture, and never prevented: the canvas's own handler still makes the
    // jump. This only notices that the chord was pressed.
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'j') setJumped(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [running])

  if (index === null || hidden) return null
  const signals: GuideSignals = { hasPanel: panelCount > 0, jumped, reviewed }
  const view = guideView(index, signals)
  if (view === null) return null
  const chordOf = (id: string): string | undefined => {
    const chord = shortcutById(id)?.chord
    return chord === undefined ? undefined : isHosted() ? hostedWords(chord) : chord
  }
  const advance = (): void => { if (view.last) endGuide(); else setGuideStep(index + 1) }
  return (
    <aside className="guide" data-guide="" data-guide-step={view.step.id} data-guide-done={view.done ? 'true' : 'false'} data-screen-control="" aria-label="First canvas tour"
      // The canvas under it must not read a press on the card as a marquee or a deselect.
      onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <header className="guide__head">
        <ol className="guide__dots" aria-hidden="true">
          {GUIDE_STEPS.map((step, i) => <li key={step.id} data-on={i === index ? 'true' : 'false'} data-past={i < index ? 'true' : 'false'} />)}
        </ol>
        <span className="guide__count">{view.at} of {view.of}</span>
        <button type="button" className="guide__skip" data-guide-skip="" onClick={endGuide}>Skip tour</button>
      </header>
      <h2 className="guide__title">{view.step.title}</h2>
      {/* One live region for the step: the tick is announced when the move is seen. */}
      <p className="guide__body" role="status">{view.done ? view.step.done : guideBody(view.step, chordOf)}</p>
      <footer className="guide__foot">
        <span className="guide__tick" data-done={view.done ? 'true' : 'false'}>{view.done ? 'Done' : 'Waiting for you to try it'}</span>
        <button type="button" className="guide__next" data-guide-next="" title={view.last ? 'Finish the tour' : 'Go to the next step'} data-primary={view.done ? 'true' : 'false'} onClick={advance}>{view.advance}</button>
      </footer>
    </aside>
  )
}
