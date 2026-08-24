import * as pty from 'node-pty'
import type { PanelId, PanelSpec, PtyCreateResult } from '../shared/types'

/**
 * How a panel's process comes into existence, and who can answer questions
 * about it afterwards.
 *
 * Injected into PtyManager the same way session-registry.ts injects its bridge
 * and terminal factory, and for the same reason: the decision becomes
 * assertable without a real runtime. PtyManager keeps everything it already
 * owns — the session map, the 16ms batcher, the resize economy, the
 * exit-eviction guard — and none of it knows which backend produced the handle.
 */
export interface SessionBackend {
  readonly kind: 'tmux' | 'direct'
  /** Why we are on this backend. Surfaced to the user when kind is 'direct'. */
  readonly reason: string

  spawn(
    spec: PanelSpec,
    command: string,
    cwd: string,
    env: Record<string, string>
  ): pty.IPty

  /**
   * Live sessions from the backend's OWN view of the world, or null when it has
   * none independent of PtyManager's map.
   *
   * Only the tmux backend can know about sessions the map has forgotten — that
   * is the entire point of it. DirectBackend returns null and PtyManager falls
   * back to listing its map, which is exactly pre-M4c behaviour.
   */
  list(): PtyCreateResult[] | null

  /**
   * The command's real exit code, or null when the backend cannot know it.
   *
   * Both nulls in this interface mean the same thing and are worth reading
   * together: THIS BACKEND CANNOT KNOW, so fall back to what the app did before
   * M4c. That is what makes DirectBackend a restoration rather than a rewrite.
   */
  exitCodeFor(panelId: PanelId): number | null

  /** Destroy one session for good. Called when the user closes a panel. */
  destroy(panelId: PanelId): void

  /** Tear down everything this backend owns. Called on before-quit. */
  shutdown(): void
}

/**
 * Pre-M4c behaviour, moved rather than rewritten. A missing tmux must degrade
 * one feature, not the app, and the surest way to guarantee that is for the
 * fallback path to BE the code that was already proven.
 */
export function createDirectBackend(reason: string): SessionBackend {
  return {
    kind: 'direct',
    reason,
    spawn(spec, command, cwd, env) {
      return pty.spawn(command, spec.args, {
        name: 'xterm-256color',
        // Spawn at the size the renderer already fitted to. Spawning at the
        // 80x24 default and resizing afterwards makes agent TUIs draw their
        // frame twice and sometimes leave artifacts.
        cols: spec.cols,
        rows: spec.rows,
        cwd,
        env
      })
    },
    // See the interface: null means "ask the manager", not "nothing is running".
    list: () => null,
    exitCodeFor: () => null,
    // The process IS the session here, so PtyManager's own kill is the whole
    // story and there is nothing extra to destroy or shut down.
    destroy: () => {},
    shutdown: () => {}
  }
}
