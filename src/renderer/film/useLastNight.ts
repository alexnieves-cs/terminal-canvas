import { useCallback, useEffect, useRef, useState } from 'react'
import { setLastNightRunner } from './last-night-door'
import { notifyDone, notifyFailed } from '@renderer/shell/toast'
import { lastNightWords, makeLastNightFilm, type LastNightDeps } from './last-night'

/**
 * M564. The "Last night" button's state: null while idle, else how far the
 * film has rendered (0 → 1). Deps are read at press time through a ref, so
 * the film is of the canvas as it stands when the person asks.
 */
export function useLastNight(deps: Omit<LastNightDeps, 'onProgress'>): { progress: number | null; run: () => void } {
  const [progress, setProgress] = useState<number | null>(null)
  const depsRef = useRef(deps)
  depsRef.current = deps
  const run = useCallback(() => {
    setProgress(0)
    void makeLastNightFilm({ ...depsRef.current, onProgress: setProgress }).then((r) => {
      setProgress(null)
      const words = lastNightWords(r)
      if (words === null) return
      if (words.ok) notifyDone(words.sentence, words.detail)
      else notifyFailed(words.sentence, words.detail)
    })
  }, [])
  // M607. The palette's row reaches the same run while this hook is mounted.
  useEffect(() => { setLastNightRunner(run); return () => setLastNightRunner(null) }, [run])
  return { progress, run }
}
