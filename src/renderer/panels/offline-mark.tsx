import type { JSX } from 'react'
import { offlineLine } from '@shared/exit-explain'

/**
 * M447. The cached-data mark for a provider that did not answer.
 * GitHub and Jira panels are not this lane's files. They render this when
 * the request that names them lands. The 09 surface renders it until then.
 */
export function OfflineCachedMark({ lastUpdated, source }: { lastUpdated: string; source: 'github' | 'jira' }): JSX.Element {
  return (
    <p className="recovery-offline" data-recovery-offline={source} data-tone="idle">
      {offlineLine(lastUpdated)}
    </p>
  )
}
