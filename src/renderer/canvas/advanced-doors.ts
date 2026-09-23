/**
 * Brief #19. THE ADVANCED FEATURES, WHERE THEY BECOME RELEVANT.
 *
 * Teammates, workflows, watchers, skills and reusable arrangements each had a
 * door in navigation (the Dock, the palette) and none where the need shows
 * up — on the panel a person is already looking at. This picks, from what is
 * true of ONE panel, which of the five are worth offering in its ⋯ menu, and
 * says each in terms of what it gives the person, not what it is.
 *
 * Offered only where it applies — an agent is offered a teammate, a panel in
 * a multi-session task its arrangement — and never more than three at once:
 * a menu that lists everything the product can do is navigation again.
 * Each door runs a verb the palette already holds (openTeammates,
 * beginWatcher, openToolbox, createObject, beginSaveTemplate), so this adds
 * no action — only the moment it is shown. Pure; `verify:palette advanced.1–.3`.
 */

export type AdvancedDoorId = 'teammate' | 'watcher' | 'skill' | 'arrangement' | 'workflow'

export interface AdvancedDoor {
  id: AdvancedDoorId
  label: string
  /** What the person gets, in one clause. */
  benefit: string
}

export interface AdvancedFacts {
  kind: string
  /** A chat, or a terminal started as an agent. */
  agentic: boolean
  /** The panel has a working directory a watcher could watch. */
  hasCwd: boolean
  /** A chat already speaking as a teammate. */
  teammate: boolean
  /** How many panels share this panel's one task; 0 when it is in none (or in several). */
  taskMembers: number
  /** A watcher already watches this directory. */
  watched: boolean
}

export const ADVANCED_DOOR_CAP = 3

export const ADVANCED_DOORS: Record<AdvancedDoorId, AdvancedDoor> = {
  teammate: { id: 'teammate', label: 'Make it a teammate…', benefit: 'keeps a brief and its own memory, so the next task starts where this one left off' },
  watcher: { id: 'watcher', label: 'Watch for changes…', benefit: 'reruns a check whenever files change, so the review always has a fresh result' },
  skill: { id: 'skill', label: 'Give it a skill…', benefit: 'packages instructions the agent loads only when they apply, instead of repeating them' },
  arrangement: { id: 'arrangement', label: 'Save this arrangement…', benefit: 'starts the same agents, folders and handoffs again in one step — nothing is sent until you start it' },
  workflow: { id: 'workflow', label: 'Automate with a workflow', benefit: 'turns steps you repeat into blocks you can run again, or on a trigger' }
}

export function advancedDoors(f: AdvancedFacts): AdvancedDoor[] {
  const out: AdvancedDoor[] = []
  // Order is relevance: the more specific the fact, the earlier the door.
  if (f.taskMembers >= 2) out.push(ADVANCED_DOORS.arrangement)
  if (f.kind === 'chat' && f.agentic && !f.teammate) out.push(ADVANCED_DOORS.teammate)
  if (f.hasCwd && (f.agentic || f.kind === 'terminal') && !f.watched) out.push(ADVANCED_DOORS.watcher)
  if (f.agentic) out.push(ADVANCED_DOORS.skill)
  if (f.kind === 'terminal' && !f.agentic) out.push(ADVANCED_DOORS.workflow)
  return out.slice(0, ADVANCED_DOOR_CAP)
}
