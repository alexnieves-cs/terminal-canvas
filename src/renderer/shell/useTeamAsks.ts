import { useSyncExternalStore } from 'react'
import type { TeamAskRow } from '@shared/team-asks'

/**
 * M378. The team's asks this person may answer (M377's `team:asks`), as one
 * module store every surface reads — the Dock's section, its badge and the
 * palette's rows — so an answer given in one place leaves every other in the
 * same frame. MAIN decides what is listed; this is a cache of its push, and
 * an ask this renderer just answered is hidden until the push confirms it
 * (#16's reason: a second press must not land in the round trip's gap).
 */
let rows: readonly TeamAskRow[] = []
let snapshot: readonly TeamAskRow[] = []
const answered = new Set<string>()
const listeners = new Set<() => void>()
let installed = false

const keyOf = (r: { workspaceId: string; askId: string }): string => `${r.workspaceId}/${r.askId}`

function publish(): void {
  snapshot = rows.filter((r) => !answered.has(keyOf(r)))
  for (const cb of listeners) cb()
}

function receive(next: readonly TeamAskRow[]): void {
  rows = next
  // An answer main has taken is gone from its list; forget the mark with it.
  const live = new Set(next.map(keyOf))
  for (const k of [...answered]) if (!live.has(k)) answered.delete(k)
  publish()
}

/** Wire the push once, and read the list once for a renderer that loaded after it. */
function install(): void {
  if (installed || typeof window === 'undefined' || window.canvas?.team?.onAsks === undefined) return
  installed = true
  window.canvas.team.onAsks(receive)
  void window.canvas.team.asks().then(receive, () => undefined)
}

export function useTeamAsks(): readonly TeamAskRow[] {
  install()
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => snapshot,
    () => snapshot
  )
}

/**
 * Answer one ask as this person: hidden at once, and brought back if main
 * refused it, so the row is never gone for an answer that did not land.
 * Resolves the refusal's reason, or null.
 */
export async function answerTeamAsk(row: Pick<TeamAskRow, 'workspaceId' | 'askId'>, answer: 'allow' | 'deny'): Promise<string | null> {
  const k = keyOf(row)
  answered.add(k)
  publish()
  try {
    const verdict = await window.canvas.team.answerAsk({ workspaceId: row.workspaceId, askId: row.askId, answer })
    if (verdict.ok) return null
    answered.delete(k)
    publish()
    return verdict.reason
  } catch {
    answered.delete(k)
    publish()
    return 'the answer did not reach the app — try again'
  }
}

