import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The one-shot armed state behind "link this panel to…" (backlog #24, M13).
 *
 * ONE-SHOT is the safety property rather than a simplification: the first
 * mousedown anywhere on the canvas resolves it either way, so unlike a
 * persistent mode — backlog #21's broadcast input, whose entire warning is
 * about a mode you can forget you are in — there is no state to be left
 * stranded in. That, plus the banner Canvas renders while `from` is set, is
 * success criterion 6: there is no state in which this is armed and invisible.
 *
 * Escape cancels, and it is the ONE place this milestone claims a bare key.
 * The rule everywhere else is that a bare keystroke must always reach the PTY,
 * and every existing exception is a modal surface that is visibly present: the
 * palette swallows every key while it is open, and useNavGrid claims bare
 * Escape and bare arrows while its overlay is up. An armed link mode is the
 * same shape — visible, one key, one shot.
 *
 * blur disarms too, for useNavGrid's reason: Cmd+Tab away and back must not
 * leave a canvas armed, because the banner is the only evidence the mode
 * exists and the user has by then stopped looking at it.
 */
export interface LinkMode {
  /** The source panel's id while armed; null otherwise. */
  from: string | null
  arm: (id: string) => void
  disarm: () => void
  /**
   * Referentially STABLE, and reads a ref rather than state, so it can sit in
   * a listener's dep array without tearing that listener down on every arm and
   * disarm — the constraint usePalette.isOpen, shouldYieldWheel and
   * NavGridController.isOpen all already record.
   */
  isArmed: () => boolean
}

export function useLinkMode(): LinkMode {
  const [from, setFrom] = useState<string | null>(null)
  const fromRef = useRef<string | null>(from)
  fromRef.current = from

  const arm = useCallback((id: string) => setFrom(id), [])
  const disarm = useCallback(() => setFrom(null), [])
  const isArmed = useCallback(() => fromRef.current !== null, [])

  useEffect(() => {
    // Nothing is listening while disarmed, which is what keeps this from
    // being a bare-Escape handler that is always installed: the app's rule is
    // that a bare key reaches the agent, and the exception exists only for as
    // long as the banner is on screen saying so.
    if (from === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Stopped as well as handled. The canvas is armed, so this Escape is
      // ours — leaving it to propagate would ALSO send it to the focused
      // agent's PTY, where Escape is very much a meaningful key.
      event.preventDefault()
      event.stopPropagation()
      setFrom(null)
    }
    const onBlur = (): void => setFrom(null)
    // Capture phase, so it beats the palette's and xterm's own handlers to the
    // key the same way useNavGrid's does.
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('blur', onBlur)
    }
  }, [from])

  return { from, arm, disarm, isArmed }
}
