import type { JSX } from 'react'

/*
 * MarqueeLayer.tsx, not Marquee.tsx — the one name this file cannot have.
 * `marquee.ts` beside it holds the gesture's arithmetic, and macOS's
 * filesystem is case-insensitive: with both present, `import './Marquee'`
 * resolves to the .ts module (TS prefers .ts to .tsx and matches the name
 * case-insensitively), so the component silently disappears and tsc reports
 * "differs only in casing" rather than anything about this file's contents.
 * The COMPONENT is still `Marquee`; only the file is renamed.
 */

/** A rect in CANVAS-HOST-LOCAL screen pixels, not world units. */
export interface MarqueeScreenRect {
  x: number
  y: number
  w: number
  h: number
}

export interface MarqueeProps {
  /** The band being dragged, or null when no marquee is in progress. */
  rect: MarqueeScreenRect | null
  /** M443. How many panels are selected. Two or more shows the toolbar. */
  selectionCount?: number
  onAlign?: () => void
  onTidy?: () => void
  onMakeTask?: () => void
  onPauseAll?: () => void
}

/**
 * The rubber band itself.
 *
 * CHROME, deliberately outside `.world` — the same place, and for the same
 * reason, EdgeIndicators sits. The band's GEOMETRY is derived from world
 * points (marqueeRect works in world units, so the selection it drives is
 * correct at any zoom), but its RENDERING is a screen-space fact: it has to
 * sit under the pointer, at the pointer's own size, for as long as the button
 * is down. Inside the transform it would be scaled by `viewport.scale` a
 * SECOND time — once by the caller converting the world rect to screen, once
 * by the ancestor — so at any zoom but 1:1 the band would drift away from the
 * cursor that is drawing it, and the panels it visibly covers would stop being
 * the panels it selects.
 *
 * pointer-events: none in the stylesheet, for EdgeIndicators' reason plus one
 * of its own: the band is under the cursor for the whole gesture, so a
 * hit-testable band would swallow the very mousemoves that size it.
 *
 * Renders NOTHING at rest. Unlike the pip layer — which keeps an empty host
 * mounted because a ResizeObserver has to have something to measure — there is
 * nothing here to observe, and a permanently mounted zero-size div would be a
 * DOM node every check that counts elements has to know to exclude.
 */
export function Marquee({ rect, selectionCount = 0, onAlign, onTidy, onMakeTask, onPauseAll }: MarqueeProps): JSX.Element | null {
  const band = rect === null ? null : (
    <div
      className="canvas-marquee"
      data-screen-control=""
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    />
  )
  const bar = selectionCount < 2 ? null : (
    <div className="marquee-toolbar" data-marquee-toolbar="" data-screen-control="" role="toolbar" aria-label="Selection" onMouseDown={(event) => event.stopPropagation()}>
      <span className="marquee-toolbar__count">{selectionCount} selected</span>
      <button type="button" data-marquee-align onClick={onAlign}>Align</button>
      <button type="button" data-marquee-tidy onClick={onTidy}>Tidy ⌘⇧T</button>
      <button type="button" data-marquee-task onClick={onMakeTask}>Make task ⌘G</button>
      <button type="button" data-marquee-pause onClick={onPauseAll}>Pause all</button>
    </div>
  )
  if (band === null && bar === null) return null
  return <>{band}{bar}</>
}
