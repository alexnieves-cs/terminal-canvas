/* M619. Split out of OrchestrationView.tsx: the page's reads (live sessions,
   last seen, a selected panel's output, worktrees, WebGL), each its own hook. */
import { webglAvailable } from '@renderer/webgl-probe'
import { useEffect, useState } from 'react'
import { lastAssistantText } from '@renderer/chat/chat-store'
import { outward } from '@shared/outward'
import { useLastLine } from '@renderer/session/last-line-store'
import { type OrchRosterRow } from './orchestration-model'
import type { WorktreeListRow } from '@shared/ipc-contract'


/** M294. A platform's label plate: its backing width, height and the gap above the diamond's top tip. */

/**
 * M301. RECONCILIATION, asked of MAIN and not inferred here.
 *
 * `agentSession.list()` is the agent runtime's own answer to "which sessions
 * exist", the same shape of question the orphan sweep asks the terminal
 * backend at launch. It is asked once when the page mounts and again on every
 * refresh tick, which is when the page's other reads happen too.
 *
 * `null` while the first answer is outstanding, and that is not "none": a
 * `null` reconciliation leaves every panel's state exactly as it was before
 * M301, so the page never flashes a wall of `unknown` in the moment between
 * mounting and hearing back. A read that FAILS also leaves it null — a door
 * that could not answer is not a door that answered "nothing".
 */
export interface OrchSessionFact {
  /** The runtime holds a session record for this panel. */
  live: boolean
  /** A process is up right now. An idle resumable chat is live and not running. */
  running: boolean
  exit?: { code?: number | null; signal?: string }
}

/**
 * MEASURED, M301, and it changed the design: for this runtime a chat's
 * PROCESS EXITING IS NOT THE CONVERSATION ENDING. The agent process exits
 * between turns and `--resume` brings it back, so `status: 'exited'` is the
 * ordinary state of an idle chat. A first version read liveness off that
 * status and made every idle agent on the page say `no session`;
 * `orch-task.2` caught it.
 *
 * So liveness is: the runtime holds a session record for this panel and has
 * not DISPOSED it. Two facts, both measured — a relaunch leaves an empty
 * runtime, and a dispose leaves a record marked `disposed`, and the page must
 * reach the same verdict either way. (A second measurement: dispose does not
 * remove the row from `list()` within a process, so membership alone is not
 * enough. The status is the discriminator, as it was for the process.)
 *
 * The status is also read for WORDS: an ended process's exit code and signal
 * are what let the card say a session stopped on its own rather than being
 * stopped by something else, without ever calling it a crash.
 */
export const RUNNING_STATUSES: readonly string[] = ['starting', 'ready', 'streaming']
/** The runtime tore this session down. Gone, exactly as a relaunch leaves it gone. */
export const GONE_STATUSES: readonly string[] = ['disposed']

export function useLiveSessions(refresh: number): ReadonlyMap<string, OrchSessionFact> | null {
  const [live, setLive] = useState<ReadonlyMap<string, OrchSessionFact> | null>(null)
  useEffect(() => {
    if (typeof window.canvas?.agentSession?.list !== 'function') return
    let alive = true
    // MEASURED, and it is why terminals are here at all: a restored CHAT
    // auto-creates its runtime session, so a chat's conversation is never
    // "gone" and its reconciliation is only ever about whether a process is
    // up. A restored agentic TERMINAL has no such resume — main either has a
    // PTY for it or does not — so that is where "this panel had a session and
    // has none now" is a real state, and where the page said `idle` about it.
    const ptys = typeof window.canvas?.pty?.list === 'function' ? window.canvas.pty.list().catch(() => []) : Promise.resolve([])
    void Promise.all([window.canvas.agentSession.list(), ptys]).then(
      ([rows, sessions]) => {
        if (!alive) return
        const map = new Map<string, OrchSessionFact>()
        for (const s of sessions) map.set(s.panelId, { live: true, running: true })
        for (const r of rows) {
          // Listed at all = the runtime holds this session. `running` is the
          // narrower fact of a process being up right now, which an idle
          // resumable chat does not have and does not need.
          map.set(r.id, {
            live: !GONE_STATUSES.includes(r.status),
            running: RUNNING_STATUSES.includes(r.status),
            ...(RUNNING_STATUSES.includes(r.status) ? {} : { exit: { ...(r.exitCode === undefined ? {} : { code: r.exitCode }), ...(r.exitSignal === undefined ? {} : { signal: r.exitSignal }) } })
          })
        }
        setLive(map)
      },
      () => { if (alive) setLive(null) }
    )
    return () => { alive = false }
  }, [refresh])
  return live
}

/**
 * M301. WHEN THE RECORD LAST SAW EACH PANEL — one read, not one per panel.
 *
 * "Unknown since some time" is the kind of sentence that makes a reader
 * distrust a whole page, so a reconciled panel says WHEN it was last seen
 * wherever the record can tell us. The durable record is asked once, with an
 * empty filter, and the newest row per panel is the answer; a panel the
 * record has never held simply has no date, which `standingOf` words as its
 * own arm rather than inventing one.
 *
 * `null` while the read is outstanding or after it failed, and that is not an
 * empty map: an empty map would say "the record knows nothing about any of
 * these", which is a claim, and a failed read is not entitled to make it.
 */
export const LAST_SEEN_ROWS = 200

export function useLastSeen(refresh: number): ReadonlyMap<string, number> | null {
  const [seen, setSeen] = useState<ReadonlyMap<string, number> | null>(null)
  useEffect(() => {
    if (typeof window.canvas?.ledger?.timeline !== 'function') return
    let alive = true
    void window.canvas.ledger.timeline({}, LAST_SEEN_ROWS).then(
      (read) => {
        if (!alive) return
        const map = new Map<string, number>()
        // Newest first, so the FIRST sighting of a panel is its latest.
        for (const e of read.entries) {
          if (e.kind === 'gap') continue
          const id = e.kind === 'command' ? e.row.panelId : e.row.panelId
          const at = e.kind === 'command' ? e.row.endedAt : e.row.at
          if (id !== undefined && !map.has(id)) map.set(id, at)
        }
        setSeen(map)
      },
      () => { if (alive) setSeen(null) }
    )
    return () => { alive = false }
  }, [refresh])
  return seen
}


/** The scratch-context probe, shared with the World view's stage since M430 (`renderer/webgl-probe.ts`). */
export function orchWebglAvailable(): boolean {
  return webglAvailable()
}

export function useOrchOutput(panelId: string | null, kind: OrchRosterRow['kind'] | undefined, active: boolean): string[] {
  const [lines, setLines] = useState<string[]>([])
  const lastLine = useLastLine(panelId ?? '')
  useEffect(() => {
    if (!active || panelId === null) return
    let cancelled = false
    const pull = (): void => {
      if (kind === 'chat') {
        const raw = lastAssistantText(panelId)
        const text = raw === '' ? '' : outward(raw, `panel ${panelId}`).text
        if (!cancelled) setLines(text === '' ? (lastLine.line === '' ? [] : [lastLine.line]) : text.split('\n').slice(-28))
        return
      }
      if (typeof window.canvas?.scrollback?.tail !== 'function') {
        if (!cancelled) setLines(lastLine.line === '' ? [] : [lastLine.line])
        return
      }
      void window.canvas.scrollback.tail({ panelId, lines: 28 }).then(
        (got) => {
          if (cancelled) return
          setLines(got.length === 0 ? got : outward(got.join('\n'), `panel ${panelId}`).text.split('\n'))
        },
        () => { if (!cancelled) setLines([]) }
      )
    }
    pull()
    const timer = window.setInterval(pull, 2000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [panelId, kind, active, lastLine.line])
  return lines
}

/**
 * M284. The worktree record the task island reads its branch from. A READ of main's
 * list, refetched when the board changes (a dispatch mints a lane), never a watch.
 */
export function useOrchWorktrees(signal: unknown): readonly WorktreeListRow[] {
  const [rows, setRows] = useState<readonly WorktreeListRow[]>([])
  useEffect(() => {
    if (typeof window.canvas?.worktree?.list !== 'function') return
    let live = true
    void window.canvas.worktree.list().then((got) => { if (live) setRows(got) }, () => { if (live) setRows([]) })
    return () => { live = false }
  }, [signal])
  return rows
}

