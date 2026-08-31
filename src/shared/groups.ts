/**
 * A named canvas region. Groups deliberately own panel IDS rather than panel
 * records: a panel remains an independent process and a React child in the
 * stable panel array, while the group supplies the spatial relationship.
 */
export const GROUP_COLOURS = ['blue', 'violet', 'green', 'amber', 'rose'] as const
export type GroupColour = (typeof GROUP_COLOURS)[number]

export interface PersistedGroup {
  id: string
  label: string
  colour: GroupColour
  panelIds: string[]
  collapsed?: boolean
}
