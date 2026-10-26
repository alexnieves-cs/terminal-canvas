import { useSyncExternalStore } from 'react'
import { EMPTY_TEAM_FLOW, type FlowRequest, type TeamFlowSnapshot } from '@shared/team-flow'

/**
 * M583. The team's handoffs and review queue for this person (M582's
 * `team:flow`), as one module store every surface reads — the Dock's
 * section and the palette's rows — so a press in one place is gone from the
 * other in the same frame. MAIN decides what is listed; this caches its push.
 * A row this renderer just acted on is hidden until the push confirms it
 * (useTeamAsks's reason: a second press must not land in the round trip's gap).
 */
let flow: TeamFlowSnapshot = EMPTY_TEAM_FLOW
let snapshot: TeamFlowSnapshot = EMPTY_TEAM_FLOW
const pressed = new Set<string>()
const listeners = new Set<() => void>()
let installed = false

function publish(): void {
  snapshot = {
    ...flow,
    handoffs: flow.handoffs.filter((r) => !pressed.has(`${r.workspaceId}/${r.handoffId}`)),
    reviews: flow.reviews.filter((r) => !pressed.has(`${r.workspaceId}/${r.reviewId}`)),
    mine: flow.mine.filter((r) => !pressed.has(`${r.workspaceId}/${r.id}`)),
    held: flow.held.filter((r) => !pressed.has(`${r.workspaceId}/${r.panelId}`))
  }
  for (const cb of listeners) cb()
}

function receive(next: TeamFlowSnapshot): void {
  flow = next
  pressed.clear()
  publish()
}

function install(): void {
  if (installed || typeof window === 'undefined' || window.canvas?.team?.onFlow === undefined) return
  installed = true
  window.canvas.team.onFlow(receive)
  void window.canvas.team.flow().then(receive, () => undefined)
}

export function useTeamFlow(): TeamFlowSnapshot {
  install()
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => snapshot,
    () => snapshot
  )
}

/** The row a request acts on, so it can be hidden while the write is in flight. */
function rowKey(req: FlowRequest): string {
  switch (req.kind) {
    case 'hand-off': case 'ask-review': return `${req.workspaceId}/${req.panelId}`
    case 'take': case 'decline': case 'withdraw': return `${req.workspaceId}/${req.handoffId}`
    default: return `${req.workspaceId}/${req.reviewId}`
  }
}

/**
 * One write as this person. Saying you are looking keeps the row (it is
 * still yours to judge); every other press hides it until main's push, and
 * brings it back if main refused. Resolves the refusal's reason, or null.
 */
export async function writeTeamFlow(req: FlowRequest): Promise<string | null> {
  const k = rowKey(req)
  const hide = req.kind !== 'look'
  if (hide) { pressed.add(k); publish() }
  const undo = (): void => { if (hide) { pressed.delete(k); publish() } }
  try {
    const verdict = await window.canvas.team.writeFlow(req)
    if (verdict.ok) return null
    undo()
    return verdict.reason
  } catch {
    undo()
    return 'that did not reach the app — try again'
  }
}
