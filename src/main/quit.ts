/**
 * M38. What quitting does to the sessions — the one place the decision lives.
 *
 * Imports nothing, and takes its collaborators injected, because
 * `app.on('before-quit')` is unreachable from any suite: this is the only way
 * "quit keeps the agent" can be PROVEN rather than argued. verify:pty-manager
 * runs both arms against a real PtyManager on a real tmux server on the
 * verify socket (`keep-on-quit.1`/`.2`); main/index.ts's handler is a call to
 * this with the setting read at quit time.
 */
export interface QuitDeps {
  /** `session.keepOnQuit` AND a backend that has sessions to keep. */
  keep: boolean
  manager: { killAll(): void; detachAll(): void }
  backend: { shutdown(): void }
  /** The layout store's synchronous write. */
  flush: () => void
  /**
   * M71. The agent-session runtime, disposed in BOTH arms: a headless
   * `claude` process cannot be reattached after its parent dies, and what
   * survives it is the CLI's own transcript, which `--resume` reads — so the
   * keep-on-quit setting has nothing to keep here and is not consulted.
   * Optional so every existing caller and check is unchanged.
   */
  agents?: { disposeAll(): void }
}

/**
 * Two sequences, and the ORDER inside each is load-bearing.
 *
 * `end` (the default): killAll, flush, shutdown — M4c's sequence, unchanged.
 * Teardown FIRST because kill() -> dropBaseline/dropSession -> scheduleWrite
 * is a 500ms debounce on a process that is quitting: a flush before the
 * teardown loses every one of those writes, so memory says the baselines are
 * gone while layout.json says they are not, and layout.json wins at the next
 * launch.
 *
 * `keep`: detachAll, flush, and NO shutdown. The clients die, every tmux
 * session stays on the socket with the pane-died hook still pointing at the
 * per-install exit directory, and the next launch's boot reconciliation —
 * which already reattaches every session whose panel the layout knows —
 * brings the agents back. The flush stays AFTER the teardown here too, and
 * this arm has its own reason: the boot orphan-killer ends any session whose
 * panel the layout does not know, so a store write that had not landed
 * before the flush would be an agent killed at the next launch for not
 * having been written down yet. detachAll() schedules no writes today;
 * flushing after it keeps that true by construction rather than by
 * inspection.
 *
 * Each step is wrapped so a throw in one never skips the flush: an exception
 * in before-quit can wedge the quit before the window is allowed to close,
 * and losing the flush would also be the very bug the ordering fixes.
 * flushSync itself is safe to leave bare — writeNow catches its own errors.
 */
export function runQuit(deps: QuitDeps): void {
  try {
    if (deps.keep) deps.manager.detachAll()
    else deps.manager.killAll()
  } catch (error) {
    console.warn('[quit] session teardown failed', error)
  }
  try {
    deps.agents?.disposeAll()
  } catch (error) {
    console.warn('[quit] agent session teardown failed', error)
  }
  deps.flush()
  if (deps.keep) return
  try {
    deps.backend.shutdown()
  } catch (error) {
    console.warn('[tmux] shutdown failed', error)
  }
}
