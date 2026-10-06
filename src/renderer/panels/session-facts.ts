/**
 * M442. The inspector's Session block and the task's criteria, as data.
 * Spend lives here (D3). A header never receives these rows.
 */

export interface SessionFact { label: string; value: string }

export function sessionFacts(input: {
  state: string
  agent?: string
  folder?: string
  branch?: string
  host?: string
  usage?: string
}): SessionFact[] {
  const rows: SessionFact[] = [{ label: 'State', value: input.state }]
  if (input.agent !== undefined && input.agent !== '') rows.push({ label: 'Agent', value: input.agent })
  if (input.folder !== undefined && input.folder !== '') rows.push({ label: 'Folder', value: input.folder })
  if (input.branch !== undefined && input.branch !== '') rows.push({ label: 'Branch', value: input.branch })
  if (input.host !== undefined && input.host !== '') rows.push({ label: 'Host', value: input.host })
  if (input.usage !== undefined && input.usage !== '') rows.push({ label: 'Usage', value: input.usage })
  return rows
}

export interface CriteriaRow { label: string; met: boolean }

/** "2 of 4" counts the criteria the item already marks met. An empty list is "0 of 0". */
export function criteriaChecklist(criteria: readonly string[], met: readonly string[]): { label: string; rows: CriteriaRow[] } {
  const done = new Set(met)
  const rows = criteria.map((label) => ({ label, met: done.has(label) }))
  const n = rows.filter((row) => row.met).length
  return { label: `${n} of ${criteria.length}`, rows }
}
