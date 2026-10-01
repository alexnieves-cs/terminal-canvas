import { IPC_EVENTS } from '../../shared/ipc-contract'
import { startWorldSimulation, type WorldSim } from '../world-sim'
import { liveContents, readyContents, type MainState } from './context'

/**
 * `SIMULATE_AGENTS=true npm run dev`: the scripted session in world-sim.ts,
 * pushed on WORLD_EVENTS. Unset, nothing is built and nothing ticks — the
 * returned stop() is a no-op.
 *
 * Read from main's OWN `process.env`, never `state.loginEnv`: this is a flag
 * on the dev launch, not something the user's login shell should be able to
 * switch on in a packaged build. Pushes go through `readyContents` (rule 1:
 * the window is read at use) — a simulated tick is background news and must
 * not reopen a closed window, and one sent mid-load is simply dropped; the
 * script loops, so the store fills on the next beat.
 */
export function startWorldSimWiring(state: MainState): WorldSim {
  if (process.env.SIMULATE_AGENTS !== 'true') return { stop() {} }
  console.log('[world] SIMULATE_AGENTS=true: emitting a scripted agent session')
  let sim: WorldSim | null = null
  let stopped = false
  const start = (): void => {
    if (stopped || sim) return
    sim = startWorldSimulation({
      emit: (events) => { readyContents(state)?.send(IPC_EVENTS.WORLD_EVENTS, events) },
      now: Date.now,
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      random: Math.random
    })
  }
  // Started on the first load, not at once: every agent opens its script with
  // a status, and a beat sent while the page loads is dropped, so an early
  // start showed each agent as `idle` mid-task until its next status beat.
  const wc = liveContents(state)
  if (wc?.isLoading()) wc.once('did-finish-load', start)
  else start()
  return {
    stop() {
      stopped = true
      sim?.stop()
    }
  }
}
