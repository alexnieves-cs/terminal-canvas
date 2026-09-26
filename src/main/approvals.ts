import type { AttentionSink } from './pty-manager'
import { holdWords, type AgentSessionEvent } from '@shared/agent-session'
import { PLAN_TOOL } from '@shared/transcript'

/**
 * M76. MAIN OWNS PENDING, AND SAYS SO ONCE.
 *
 * A chat panel with a permission request nobody has answered is `needs
 * you` — the same word, on the same channel (`agent:state`, `wants-you`),
 * that the terminal detector uses, so every attention surface the renderer
 * already has (the store, the edge pips, Cmd+J, the popover, the workspace
 * counts, the palette's `state:` order) lights with no code of its own.
 *
 * The tracker is driven by the manager's own events and keeps one set of
 * pending request ids per panel. ENTRY — the set going from empty to
 * non-empty — is the only thing that notifies or beeps, exactly as
 * `PtyManager.syncAttention` does: a second request while one is pending
 * re-notifies nothing, and one answer of two clears nothing. The set going
 * empty emits `idle`. A dispose drops the panel and emits nothing: the
 * renderer clears its store at every panel-removing call site already, and
 * a state for a panel that is gone is the phantom `reachableQueue` exists
 * to filter.
 *
 * `agent:acknowledge` (focus) never reaches this: a chat's `needs you` is a
 * fact — a question with no answer — not a bell.
 *
 * M98. THE TRACKER OWNS GRANTS TOO, because it owns pending. `Allow for
 * session` is a grant keyed by session AND tool, held in a Map here and
 * written NOWHERE — not the layout, not the transcript log, not a store
 * (`grant.2` reads this file as text and fails on a filesystem import). A
 * grant that survived a relaunch would answer a question the user was never
 * shown in a session they may not remember granting; a grant that survives
 * an EXIT is right, because the conversation resumes (`--resume`) and the
 * tool is the same tool. Cleared on `disposed`, and by `revoke`. The
 * manager consults `granted` through its `preAnswer` dep BEFORE a request
 * is pending, so a granted tool never reaches this tracker's pending set
 * and never lights attention.
 *
 * M355. A HOLD IS A NEEDS-YOU TOO. An agent main holds at its spend or
 * context cap (M350) cannot go on until a person raises the cap or stops
 * it — the same fact as a question nobody answered. So the tracker keeps a
 * second set, held panels, read from the `meter` events that carry a hold,
 * and a panel needs you while it is in EITHER set: entry to the union says
 * `wants-you` once (and notifies, naming the cap); leaving both says `idle`;
 * an answered question on a held agent keeps it waiting. An exit or a
 * dispose drops the hold from the union — a stopped agent is not waiting on
 * anyone — though main's hold itself stays until a cap is raised.
 *
 * Plain node; `verify:agent-session approve.1–.3`, `grant.1–.2`, `hold.attention.1`, `plan.grant.1`.
 */

export interface ApprovalTrackerDeps {
  sink: AttentionSink
  emitState(id: string, state: 'wants-you' | 'idle'): void
  /** What the notification's body names the panel by — its directory. */
  label(id: string): string
}

export interface ApprovalTracker {
  apply(event: AgentSessionEvent): void
  /**
   * Say `wants-you` again for a panel still pending — for a renderer that
   * has just (re)loaded and rebuilt its stores from `agent:create`'s
   * snapshot: the card shows the question from the snapshot, but the
   * attention store hears only the entry edge, which happened before it
   * existed (M76's verifier). Emits nothing for a panel with nothing pending.
   */
  resync(id: string): void
  /** Panel ids with at least one pending request, in entry order. */
  pendingIds(): string[]
  /** M355. Panel ids main holds at a cap, in entry order. */
  heldIds(): string[]
  /** M98. Allow `toolName` for the rest of this session, without asking. */
  grant(id: string, toolName: string): void
  /** M98. Whether `toolName` is granted for `id` — what the manager's `preAnswer` asks. */
  granted(id: string, toolName: string): boolean
  /** M98. The granted tools, in grant order. Empty for an unknown id. */
  grantsOf(id: string): string[]
  /** M98. Drop every grant for `id`. */
  revoke(id: string): void
}

export function createApprovalTracker(deps: ApprovalTrackerDeps): ApprovalTracker {
  const pending = new Map<string, Set<string>>()
  // M98. Insertion-ordered per session, so the inspector lists grants in
  // the order they were given.
  const grants = new Map<string, Set<string>>()
  // M355. Held at a cap, in entry order; the hold's words for the notification.
  const held = new Set<string>()
  const waiting = (id: string): boolean => pending.has(id) || held.has(id)
  const waitingCount = (): number => { let n = held.size; for (const id of pending.keys()) if (!held.has(id)) n++; return n }
  const badge = (): void => { deps.sink.badge(waitingCount()) }
  /** Entry to needs-you: the ONE place that says it, notifies and beeps. */
  const enter = (id: string, what: string): void => {
    deps.emitState(id, 'wants-you')
    badge()
    if (!deps.sink.windowFocused() && deps.sink.notifyEnabled()) {
      deps.sink.notify(id, what, waitingCount(), `${deps.label(id)} needs you`)
    }
    if (deps.sink.soundEnabled()) deps.sink.beep()
  }
  return {
    apply(event) {
      switch (event.type) {
        case 'permission-request': {
          const set = pending.get(event.id)
          if (set) { set.add(event.requestId); return }
          const was = waiting(event.id)
          pending.set(event.id, new Set([event.requestId]))
          if (was) { badge(); return }
          enter(event.id, `claude asks to run ${event.toolName}`)
          return
        }
        case 'permission-answered':
        case 'permission-dropped': {
          const set = pending.get(event.id)
          if (!set) return
          set.delete(event.requestId)
          if (set.size > 0) return
          pending.delete(event.id)
          // M355. A held agent is still waiting once its question is answered.
          if (!held.has(event.id)) deps.emitState(event.id, 'idle')
          badge()
          return
        }
        case 'meter': {
          const hold = event.meter.held
          if (hold !== undefined && !held.has(event.id)) {
            const was = waiting(event.id)
            held.add(event.id)
            if (was) { badge(); return }
            enter(event.id, `claude ${holdWords(hold)}`)
            return
          }
          if (hold === undefined && held.delete(event.id)) {
            if (!pending.has(event.id)) deps.emitState(event.id, 'idle')
            badge()
          }
          return
        }
        case 'status': {
          if (event.status !== 'disposed' && event.status !== 'exited') return
          // M98. Grants outlive an exit (the conversation resumes) and die
          // with the session; pending dies with either.
          if (event.status === 'disposed') grants.delete(event.id)
          const hadHold = held.delete(event.id)
          const hadPending = pending.delete(event.id)
          if (!hadHold && !hadPending) return
          // M355. An exit keeps the panel on the canvas. A question is dropped
          // before it (and that said idle); nothing drops a hold first, so
          // the exit says it, or the panel stays a phantom needs-you. A
          // dispose removes the panel, and says nothing (above).
          if (event.status === 'exited' && hadHold) deps.emitState(event.id, 'idle')
          badge()
          return
        }
        default:
          return
      }
    },
    resync(id) { if (waiting(id)) deps.emitState(id, 'wants-you') },
    pendingIds: () => [...pending.keys()],
    heldIds: () => [...held],
    grant(id, toolName) {
      // M358. A plan is approved each time it is presented. A session grant
      // for ExitPlanMode would pre-answer every later plan unread, and the
      // manager's preAnswer would never even let it reach a person.
      if (toolName === PLAN_TOOL) return
      const set = grants.get(id)
      if (set) { set.add(toolName); return }
      grants.set(id, new Set([toolName]))
    },
    granted: (id, toolName) => grants.get(id)?.has(toolName) ?? false,
    grantsOf: (id) => [...(grants.get(id) ?? [])],
    revoke(id) { grants.delete(id) }
  }
}

/**
 * ONE BADGE, TWO AUTHORS, ONE WRITER. PtyManager sets the dock badge from
 * its own waiting set and the tracker above from its own; each writing the
 * real badge would leave it reading whichever spoke last. Each child records
 * its own count and the real badge gets the SUM; everything else passes
 * straight through, so PtyManager is handed a child and is otherwise
 * untouched.
 */
export function createAttentionUnion(sink: AttentionSink): { forPty: AttentionSink; forAgents: AttentionSink } {
  const counts = { pty: 0, agents: 0 }
  const child = (key: keyof typeof counts): AttentionSink => ({
    notify: (id, label, count, body) => sink.notify(id, label, count, body),
    badge: (n) => { counts[key] = n; sink.badge(counts.pty + counts.agents) },
    beep: () => sink.beep(),
    windowFocused: () => sink.windowFocused(),
    notifyEnabled: () => sink.notifyEnabled(),
    soundEnabled: () => sink.soundEnabled()
  })
  return { forPty: child('pty'), forAgents: child('agents') }
}
