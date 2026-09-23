import { useEffect, useState } from 'react'

/**
 * Backlog #86. The repository root a directory is inside, resolved ONCE in main
 * (the review engine's resolveRepo) and cached per directory for the life of
 * the renderer, so every file or toolbox header over the same folder asks git
 * once. `undefined` until main answers and when it is not a repository —
 * `displayPath`'s own fallback, the last two segments, is the honest reading.
 */
const cache = new Map<string, Promise<string | null>>()

export function useRepoRoot(dir: string | undefined): string | undefined {
  const [root, setRoot] = useState<string | undefined>(undefined)
  useEffect(() => {
    setRoot(undefined)
    const git = typeof window === 'undefined' ? undefined : window.canvas?.git
    if (dir === undefined || dir === '' || git?.root === undefined) return
    let answer = cache.get(dir)
    if (answer === undefined) {
      answer = git.root(dir).catch(() => null)
      cache.set(dir, answer)
    }
    let live = true
    void answer.then((r) => { if (live) setRoot(r ?? undefined) })
    return () => { live = false }
  }, [dir])
  return root
}
