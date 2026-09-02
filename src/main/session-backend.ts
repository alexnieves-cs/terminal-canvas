import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, unlinkSync } from 'node:fs'
import * as pty from 'node-pty'
import type { PanelId, PanelSpec, PtyCreateResult } from '../shared/types'
import {
  buildHasSessionArgs,
  buildKillServerArgs,
  buildKillSessionArgs,
  buildListArgs,
  buildTmuxArgs,
  exitFilePath,
  parseListOutput,
  TMUX_SOCKET,
  type TmuxSocket
} from './tmux-args'

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
   * Is there already a live session for this panel? Asked before spawn, not
   * after: `new-session -A` would have created it by then and the answer would
   * be true unconditionally.
   */
  hasSession(panelId: PanelId): boolean

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

  /**
   * Tear down everything this backend owns. Called on before-quit's END arm
   * only (main/quit.ts): with `session.keepOnQuit` on, quitting detaches and
   * the server deliberately outlives the app.
   */
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
    // No sessions outlive this process, so nothing can ever be reattached to.
    // Answering false is honest rather than a degradation — the same posture
    // as list() returning null here.
    hasSession: () => false,
    exitCodeFor: () => null,
    // The process IS the session here, so PtyManager's own kill is the whole
    // story and there is nothing extra to destroy or shut down.
    destroy: () => {},
    shutdown: () => {}
  }
}

/**
 * Sessions that outlive the renderer.
 *
 * The whole feature is one flag: `new-session -A` attaches if the session
 * exists and creates it if it does not, so create and reattach are the same
 * call. pty:create keeps its exact meaning and session-registry.ts never
 * learns reattachment exists — it did, however, have to stop skipping
 * pty:kill for a never-spawned panel, which under tmux can still own a live
 * session. See kill() in pty-manager.ts.
 *
 * `socket` defaults to the production socket and exists so a verify suite can
 * run the real backend — shutdown() and all — against a throwaway server
 * instead of the one a running app is using.
 */
export function createTmuxBackend(o: {
  tmuxPath: string
  exitDir: string
  confPath: string
  reason: string
  socket?: TmuxSocket
}): SessionBackend {
  const socket = o.socket ?? TMUX_SOCKET
  /**
   * Every tmux invocation that is NOT the panel's own client. Failure is
   * routine rather than exceptional — `list-panes` with no server running exits
   * non-zero, and that is the normal first-run state — so this returns '' and
   * lets the caller decide, instead of throwing into a quit handler.
   */
  const cli = (args: string[]): string => {
    try {
      return execFileSync(o.tmuxPath, args, { encoding: 'utf8', timeout: 5000 })
    } catch {
      return ''
    }
  }

  return {
    kind: 'tmux',
    reason: o.reason,

    spawn(spec, command, cwd, env) {
      // node-pty still owns the transport; what it spawns is a tmux CLIENT
      // rather than the command itself. That is what preserves the entire
      // existing data path — raw bytes, the 16ms batcher, resize, pointer
      // correction — unchanged from M3.
      return pty.spawn(
        o.tmuxPath,
        buildTmuxArgs({
          confPath: o.confPath,
          panelId: spec.panelId,
          cols: spec.cols,
          rows: spec.rows,
          command,
          args: spec.args,
          socket
        }),
        {
          name: 'xterm-256color',
          cols: spec.cols,
          rows: spec.rows,
          cwd,
          env
        }
      )
    },

    list(): PtyCreateResult[] {
      // parseListOutput drops dead panes. See its comment: under
      // remain-on-exit on, a finished session still exists until the hook
      // kills it, and reporting it live would attach a client to a corpse.
      return parseListOutput(cli(buildListArgs(socket))).map((e) => ({
        panelId: e.panelId,
        pid: e.pid,
        command: e.command,
        cwd: e.cwd,
        // Anything list() can see outlived whatever destroyed the last
        // renderer, so from the next renderer's point of view every one of
        // these is a reattach by definition.
        reattached: true,
        currentCommand: e.currentCommand
      }))
    },

    hasSession(panelId: PanelId): boolean {
      // `cli` swallows a non-zero exit and returns '' — which is exactly what
      // has-session does when the session is absent, and also what it does
      // when no server is running at all. Both mean "nothing to reattach to",
      // so the empty string is the correct negative and needs no special case.
      // execFileSync throws on non-zero, so a bare success is the only path
      // that returns a non-throwing result; we distinguish on that.
      try {
        execFileSync(o.tmuxPath, buildHasSessionArgs(panelId, socket), {
          encoding: 'utf8',
          timeout: 5000,
          stdio: 'ignore'
        })
        return true
      } catch {
        return false
      }
    },

    exitCodeFor(panelId: PanelId): number | null {
      // Written by the pane-died hook BEFORE it killed the session, so by the
      // time node-pty's onExit brought us here the file is already on disk.
      const path = exitFilePath(o.exitDir, panelId)
      let raw: string
      try {
        raw = readFileSync(path, 'utf8').trim()
      } catch {
        // Missing or unreadable: fall back to the client's code via `?? `.
        // A wrong-but-present number beats a crash in an exit handler.
        return null
      }
      // Number('') is 0, not NaN. A file that exists but is empty (a
      // truncated write, a hook that ran the echo but not yet the redirect's
      // flush) must not be read as a clean exit — `real ?? exitCode` would
      // then report a crashed process as exit 0, the exact failure this hook
      // exists to prevent. Reject before Number() ever sees it.
      if (raw === '') return null
      const code = Number(raw)
      if (!Number.isInteger(code)) return null
      // Unlink is deliberately its own try/catch, separate from the parse
      // above: if the read succeeded but the unlink throws (a race, a
      // permission blip), that must not discard the exit code we already
      // parsed correctly. A leftover file in a per-run temp dir is a
      // triviality (shutdown() rm -rf's the whole directory anyway); a
      // discarded real exit code is not.
      try {
        unlinkSync(path)
      } catch {
        /* leftover file is not worth losing the code we already have */
      }
      return code
    },

    destroy(panelId: PanelId): void {
      cli(buildKillSessionArgs(panelId, socket))
    },

    shutdown(): void {
      cli(buildKillServerArgs(socket))
      // Per-run directory; nothing in it outlives the app.
      try {
        rmSync(o.exitDir, { recursive: true, force: true })
      } catch {
        /* a leftover temp dir is not worth failing a quit over */
      }
    }
  }
}
