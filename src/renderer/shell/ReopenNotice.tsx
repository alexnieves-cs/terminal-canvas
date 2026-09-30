import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  lifecycleFacts, reopenLines, reopenSummary, reopenTaskLines,
  type LastExit, type LifecycleFacts, type ReopenLine, type ReopenPanel, type ReopenTask
} from '@shared/persistence'
import { bootIssues } from '@renderer/session/boot-issues'
import { shellControl } from './shell-control'

/**
 * Brief #20. "REOPENED" — what came back running, what came back stopped,
 * and what was lost, told once on return and kept until dealt with.
 *
 * The rule the brief sets, and why each half is here:
 *
 * - **Three answers, never one card.** A reattached session, a kept session
 *   that died while the app was closed, and a process the quit stopped by
 *   design are different facts (shared/persistence.ts). They get different
 *   lines, and only the second is worded as a problem.
 * - **A recoverable problem stays until it is resolved.** An `ended` line
 *   leaves only when its panels are started again, left stopped on purpose,
 *   or closed — "Got it" clears the informational lines and the boot issues
 *   (which can only be acknowledged) but never an ended session. A toast was
 *   the rejected shape: five seconds onto a fact that is still true.
 * - **Say what leaving does.** The footer is `lifecycleFacts` — the one copy
 *   of what closing the window and quitting do to execution, under the
 *   CURRENT setting, read live so a toggle from the palette re-words it.
 *
 * Shown only when main recorded the window going away, or a restore failed:
 * a harness mount (and a reload, which is not a return) has no record, so
 * nothing here moves a checked pixel.
 */
export interface ReopenDeps {
  /** The restored terminals, fixed at mount. */
  restored: readonly ReopenPanel[]
  /** Main's live-session answer at boot. */
  liveAtBoot: ReadonlySet<string>
  /** Panel ids on the canvas now — a closed panel resolves its line. */
  present: ReadonlySet<string>
  /** Panels still waiting to be started — a started panel resolves its line. */
  dormant: ReadonlySet<string>
  backend: 'tmux' | 'direct' | null
  /**
   * M401 (B7). The tasks that existed before this launch, each with the panel
   * "Show" goes to and its outcome. LIVE, not fixed at mount: a task's
   * outcome needs its lane read, which lands after boot, so the line appears
   * (or changes) when that read does. Optional so an older caller keeps the
   * terminal-only notice.
   */
  tasks?: readonly ReopenTask[]
}

export interface ReopenModel {
  lines: ReopenLine[]
  facts: LifecycleFacts
  /** Any line "Got it" would clear. */
  acknowledgeable: boolean
  acknowledge: () => void
  /** Resolve an ended line without starting it: the person chose to leave it stopped. */
  leave: (ids: readonly string[]) => void
}

export function useReopenNotice(deps: ReopenDeps): ReopenModel | null {
  const { restored, liveAtBoot, present, dormant, backend, tasks } = deps
  // `undefined` while main is being asked; `null` is main's answer "no record".
  const [lastExit, setLastExit] = useState<LastExit | null | undefined>(undefined)
  useEffect(() => {
    const door = window.canvas?.session?.lastExit
    if (typeof door !== 'function') { setLastExit(null); return }
    let live = true
    door().then((r) => { if (live) setLastExit(r) }, () => { if (live) setLastExit(null) })
    return () => { live = false }
  }, [])
  const [keepOnQuit, setKeepOnQuit] = useState(false)
  useEffect(() => {
    const settings = window.canvas?.settings
    if (settings === undefined) return
    const read = (): void => {
      void settings.list().then((rows) => {
        setKeepOnQuit(rows.find((r) => r.id === 'session.keepOnQuit')?.value === true)
      }).catch(() => { /* the default stands */ })
    }
    read()
    return settings.onChanged(read)
  }, [])
  const [acknowledged, setAcknowledged] = useState(false)
  const [left, setLeft] = useState<ReadonlySet<string>>(() => new Set())
  const issues = bootIssues()
  const summary = useMemo(
    () => (lastExit === undefined ? null : reopenSummary({ panels: restored, live: liveAtBoot, lastExit, issues })),
    [lastExit, restored, liveAtBoot, issues]
  )
  return useMemo(() => {
    if (summary === null) return null
    if (summary.lastExit === null && summary.issues.length === 0) return null
    const stillStopped = (p: ReopenPanel): boolean => present.has(p.id) && dormant.has(p.id) && !left.has(p.id)
    const all = reopenLines({
      reconnected: summary.reconnected.filter((p) => present.has(p.id)),
      ended: summary.ended.filter(stillStopped),
      stopped: summary.stopped.filter(stillStopped),
      issues: summary.issues,
      lastExit: summary.lastExit
    })
    // M401 (B7). Task lines follow the terminal ones, and only for a task
    // whose panel is still here — "Show" must land on something.
    all.push(...reopenTaskLines((tasks ?? []).filter((t) => present.has(t.id))))
    const lines = acknowledged ? all.filter((l) => l.group === 'ended') : all
    if (lines.length === 0) return null
    return {
      lines,
      facts: lifecycleFacts({ backend, keepOnQuit }),
      acknowledgeable: lines.some((l) => l.group !== 'ended'),
      acknowledge: () => setAcknowledged(true),
      leave: (ids) => setLeft((cur) => { const next = new Set(cur); for (const id of ids) next.add(id); return next })
    }
  }, [summary, present, dormant, left, acknowledged, backend, keepOnQuit, tasks])
}

/** Past this many panels a line offers one "Start all" instead of a button each. */
const START_EACH_MAX = 3

export function ReopenNotice({ model, onStart, onGo }: {
  model: ReopenModel
  /** Frame the panel and start it — the same wake a click on its card does. */
  onStart: (id: string) => void
  onGo: (id: string) => void
}): JSX.Element {
  const { lines, facts } = model
  return (
    <aside className="reopen-notice" data-reopen-notice role="status" aria-label="Reopened">
      <span className="reopen-notice__kicker">Reopened</span>
      <ul className="reopen-notice__lines">
        {lines.map((l) => (
          <li key={l.group + l.text} className="reopen-notice__line" data-reopen-group={l.group} data-reopen-task={l.outcome} data-reopen-problem={l.tone === 'problem' ? 'true' : undefined}>
            <span className="reopen-notice__text">{l.text}</span>
            {l.group === 'ended' && (
              <span className="reopen-notice__verbs">
                {l.panels.length <= START_EACH_MAX
                  ? l.panels.map((p) => (
                    <button key={p.id} type="button" className="rail-row__verb" data-reopen-start={p.id} title={`Start ${p.label} again`} {...shellControl(() => onStart(p.id))}>
                      start {l.panels.length === 1 ? 'again' : p.label}
                    </button>
                  ))
                  : (
                    <button type="button" className="rail-row__verb" data-reopen-start="all" title="Start every one of these again" {...shellControl(() => { for (const p of l.panels) onStart(p.id) })}>
                      start all
                    </button>
                  )}
                <button type="button" className="rail-row__verb" data-reopen-leave title="Leave these stopped — this line goes away" {...shellControl(() => model.leave(l.panels.map((p) => p.id)))}>
                  leave stopped
                </button>
              </span>
            )}
            {l.group === 'task' && l.panels.length <= START_EACH_MAX && (
              <span className="reopen-notice__verbs">
                {l.panels.map((p) => (
                  <button key={p.id} type="button" className="rail-row__verb" data-reopen-show={p.id} title={`Show “${p.label}”`} {...shellControl(() => onGo(p.id))}>
                    {l.panels.length === 1 ? 'show' : `show ${p.label}`}
                  </button>
                ))}
              </span>
            )}
            {l.group === 'reconnected' && l.panels.length === 1 && (
              <button type="button" className="rail-row__verb" title={`Go to ${l.panels[0]!.label}`} {...shellControl(() => onGo(l.panels[0]!.id))}>go</button>
            )}
          </li>
        ))}
      </ul>
      {(facts.quit !== '' || facts.closeWindow !== '') && (
        <p className="reopen-notice__facts" data-reopen-facts>{facts.closeWindow} {facts.quit}</p>
      )}
      {model.acknowledgeable && (
        <button type="button" className="reopen-notice__ack" data-reopen-ack title="Clear what is only news; anything that ended stays until it is dealt with" {...shellControl(model.acknowledge)}>
          Got it
        </button>
      )}
    </aside>
  )
}
