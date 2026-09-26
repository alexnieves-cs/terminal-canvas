import { useEffect, useState } from 'react'
import { latestRoster, onRoster } from './presence-store'

/**
 * Display names from a workspace's presence roster, by user id — so a surface
 * names a person rather than a uuid. Re-renders only when the set of names
 * actually changes, not on every 15 Hz cursor report.
 *
 * Moved here from SharedPlaceholderLayer (M333) in M344, when the relay
 * strip needed the same names.
 */
export function useRosterNames(workspaceId: string | undefined): ReadonlyMap<string, string> {
  const read = (): Map<string, string> => new Map((latestRoster(workspaceId)?.peers ?? []).map((p) => [p.presence.userId, p.presence.displayName]))
  const [names, setNames] = useState(read)
  useEffect(() => {
    let key = ''
    const take = (): void => {
      const next = read()
      const k = [...next].join('|')
      if (k !== key) { key = k; setNames(next) }
    }
    take()
    return onRoster((r) => { if (r.workspaceId === workspaceId) take() })
    // `read` closes over workspaceId only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])
  return names
}
