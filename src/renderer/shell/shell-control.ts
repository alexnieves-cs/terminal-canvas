import type { MouseEvent as ReactMouseEvent } from 'react'

/**
 * The handler pair EVERY shell control mounts.
 *
 * `preventDefault()` on mousedown is the whole mechanism, and it is doing
 * something subtler than it looks: it stops the browser moving DOM focus to
 * the button at all, so focus never leaves xterm's hidden textarea and there
 * is nothing to restore afterwards. The alternative — let focus move, then
 * blur back — has a window between the two where a keystroke goes nowhere,
 * and it fails silently exactly the way an unrestored palette close does
 * (see usePalette's rule 4).
 *
 * This also protects `focusedId`, which is NOT merely a highlight: assignTiers
 * pins the focused panel live, and it is what Cmd+C/Cmd+V and every
 * capturedId-gated palette row act on.
 *
 * stopPropagation is deliberately NOT called on mousedown: the palette's
 * outside-click dismissal is a CAPTURE listener on .shell, so it has already
 * run by the time this fires — and a shell click should dismiss an open
 * palette (check 73).
 */
export function shellControl(run: () => void): {
  onMouseDown: (event: ReactMouseEvent) => void
  onClick: (event: ReactMouseEvent) => void
} {
  return {
    onMouseDown: (event) => event.preventDefault(),
    onClick: (event) => {
      event.preventDefault()
      run()
    }
  }
}
