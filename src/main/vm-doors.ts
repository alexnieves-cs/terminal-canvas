import type { AgentSessionEvent, AgentSessionSnapshot } from '../shared/agent-session'
import type { TonightStatus } from '../shared/tonight'
import type { VmLanes } from './vm-lanes'

/**
 * M553 (lane J). THE DOORS INTO A SANDBOXED LANE — what Tonight and auto
 * mode call to run a task "sandboxed, prompts off", and the rule for when a
 * panel leaves its VM.
 *
 * OFF BY DEFAULT TWICE. The `vm.lanes` setting must be on, and the task must
 * ask (`sandboxed: true`); the switch alone sandboxes nothing.
 *
 * ENTERING kills the chat's live Mac process first and waits for its exit:
 * the next spawn is the one the lane wraps, and a send written to a process
 * that is still dying would go to the Mac's claude with prompts on, or to
 * nothing. The session (its transcript and panel) is kept — `terminate`, not
 * `dispose`.
 *
 * LEAVING, by who entered:
 * - an auto run's lane leaves when that run resolves (done, stuck, stopped);
 * - a Tonight batch HOLDS its lanes until the batch itself ends, because a
 *   task paused by a usage limit resumes later as a NEW auto run, and that
 *   run must start in the same VM, not on the Mac.
 * Either way the VM is stopped and the chat's next message runs on the Mac
 * again with its prompts, so a sandboxed run never leaves a chat sandboxed
 * by accident.
 *
 * The result still passes the check gate (the check runs in its own VM,
 * `vm-lanes.ts`) and lands in the same morning queue: nothing here decides
 * done.
 */

export interface VmDoorsDeps {
  lanes: Pick<VmLanes, 'enter' | 'leave' | 'has'>
  agents: {
    get(id: string): AgentSessionSnapshot | undefined
    terminate(id: string): boolean
    subscribe(cb: (event: AgentSessionEvent) => void): () => void
  }
  enabled(): boolean
  /**
   * Make the lane enterable: a fresh runtime probe and the proxy listening
   * where that runtime's VMs reach it. Async, so `lanes.enter` stays sync.
   */
  prepare?(): Promise<VmDoorResult>
  /** How long to wait for a killed Mac process to exit. */
  exitWaitMs?: number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

export type VmDoorResult = { kind: 'ok' } | { kind: 'refused'; reason: string }

export interface VmDoors {
  /** Before an auto run: the lane leaves when the run resolves. */
  enterForAuto(panelId: string): Promise<VmDoorResult>
  /** Before a Tonight batch: every listed panel, held until `tonightEnded`. Refused whole if any one is. */
  enterForTonight(panelIds: readonly string[]): Promise<VmDoorResult>
  /** The runner's status; a finished batch releases what it held. */
  tonightStatus(status: TonightStatus): void
  /** Release every lane a batch held — its end, or a start the runner refused after the lanes were entered. */
  releaseTonight(): void
  dispose(): void
}

const LIVE = new Set(['starting', 'ready', 'streaming'])
export const VM_OFF_REASON = 'sandboxed lanes are off — turn on Sandboxed lanes in settings first'

export function createVmDoors(deps: VmDoorsDeps): VmDoors {
  const autoHeld = new Set<string>()
  const tonightHeld = new Set<string>()
  const waitMs = deps.exitWaitMs ?? 10_000

  const leave = (id: string): void => {
    if (autoHeld.has(id) || tonightHeld.has(id)) return
    if (!deps.lanes.has(id)) return
    // The VM's process first, so the session reads exited and its next send spawns on the Mac.
    deps.agents.terminate(id)
    deps.lanes.leave(id)
  }

  const unsubscribe = deps.agents.subscribe((e) => {
    if (e.type !== 'auto' || e.state === 'running' || !autoHeld.has(e.id)) return
    autoHeld.delete(e.id)
    leave(e.id)
  })

  /** Kill the Mac's process and wait for its exit; resolves false on a timeout. */
  const quiet = (id: string): Promise<boolean> => {
    const snap = deps.agents.get(id)
    if (snap === undefined) return Promise.resolve(false)
    if (!LIVE.has(snap.status)) return Promise.resolve(true)
    return new Promise((resolve) => {
      let done = false
      let timer: unknown = null
      const off = deps.agents.subscribe((e) => {
        if (done || e.id !== id || e.type !== 'status' || LIVE.has(e.status)) return
        done = true
        off()
        if (timer !== null) deps.clearTimer(timer)
        resolve(true)
      })
      timer = deps.setTimer(() => { if (done) return; done = true; off(); resolve(false) }, waitMs)
      if (!deps.agents.terminate(id)) { done = true; off(); deps.clearTimer(timer); resolve(true) }
    })
  }

  const enterOne = async (id: string): Promise<VmDoorResult> => {
    const snap = deps.agents.get(id)
    if (snap === undefined) return { kind: 'refused', reason: 'no such chat' }
    if (snap.backend !== 'claude') return { kind: 'refused', reason: 'a sandboxed lane runs Claude Code only' }
    if (deps.lanes.has(id)) return { kind: 'ok' }
    // A run already going on the Mac is not moved mid-turn: its next turn
    // would spawn in the VM with prompts off, a run nobody asked to sandbox.
    if (snap.auto?.state === 'running') return { kind: 'refused', reason: `an auto run is already running here (${snap.auto.mode}) — stop it first` }
    const ready = await (deps.prepare?.() ?? Promise.resolve<VmDoorResult>({ kind: 'ok' }))
    if (ready.kind === 'refused') return ready
    const entered = deps.lanes.enter(id, snap.cwd)
    if (entered.kind === 'refused') return entered
    if (!(await quiet(id))) {
      deps.lanes.leave(id)
      return { kind: 'refused', reason: 'the chat\'s process did not stop in time, so the run was not moved into a VM' }
    }
    return { kind: 'ok' }
  }

  return {
    async enterForAuto(panelId) {
      if (!deps.enabled()) return { kind: 'refused', reason: VM_OFF_REASON }
      const r = await enterOne(panelId)
      if (r.kind === 'ok') autoHeld.add(panelId)
      return r
    },
    async enterForTonight(panelIds) {
      if (!deps.enabled()) return { kind: 'refused', reason: VM_OFF_REASON }
      const done: string[] = []
      for (const id of panelIds) {
        const r = await enterOne(id)
        if (r.kind === 'refused') {
          // All or none: a batch that silently ran some tasks on the Mac with
          // prompts on, having been asked for VMs, is the failure to avoid.
          for (const d of done) { tonightHeld.delete(d); leave(d) }
          return { kind: 'refused', reason: r.reason }
        }
        tonightHeld.add(id)
        done.push(id)
      }
      return { kind: 'ok' }
    },
    tonightStatus(status) {
      if (status.state === 'done' || status.state === 'stopped') this.releaseTonight()
    },
    releaseTonight() {
      const held = [...tonightHeld]
      tonightHeld.clear()
      for (const id of held) leave(id)
    },
    dispose() {
      unsubscribe()
      autoHeld.clear()
      tonightHeld.clear()
    }
  }
}
