import type { AttentionSink } from './pty-manager'
import type { AgentSessionEvent } from '@shared/agent-session'

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
 * Plain node; `verify:agent-session approve.1–.3`.
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
}

export function createApprovalTracker(deps: ApprovalTrackerDeps): ApprovalTracker {
  const pending = new Map<string, Set<string>>()
  const badge = (): void => { deps.sink.badge(pending.size) }
  return {
    apply(event) {
      switch (event.type) {
        case 'permission-request': {
          const set = pending.get(event.id)
          if (set) { set.add(event.requestId); return }
          pending.set(event.id, new Set([event.requestId]))
          deps.emitState(event.id, 'wants-you')
          badge()
          if (!deps.sink.windowFocused() && deps.sink.notifyEnabled()) {
            deps.sink.notify(event.id, `claude asks to run ${event.toolName}`, pending.size, `${deps.label(event.id)} needs you`)
          }
          if (deps.sink.soundEnabled()) deps.sink.beep()
          return
        }
        case 'permission-answered':
        case 'permission-dropped': {
          const set = pending.get(event.id)
          if (!set) return
          set.delete(event.requestId)
          if (set.size > 0) return
          pending.delete(event.id)
          deps.emitState(event.id, 'idle')
          badge()
          return
        }
        case 'status': {
          if (event.status !== 'disposed' && event.status !== 'exited') return
          if (!pending.delete(event.id)) return
          badge()
          return
        }
        default:
          return
      }
    },
    resync(id) { if (pending.has(id)) deps.emitState(id, 'wants-you') },
    pendingIds: () => [...pending.keys()]
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
