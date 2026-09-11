import { useEffect, useState } from 'react'

/**
 * M259. A clock for relative words (`updated 3m ago`): re-renders its caller
 * every `everyMs` while `active`, and not at all otherwise — a panel with
 * nothing to age holds no timer. The words are minutes-grained, so a
 * 30-second tick is as fresh as they can read.
 */
export function useNow(active: boolean, everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(t)
  }, [active, everyMs])
  return now
}
