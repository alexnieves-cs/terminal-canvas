import { useCallback, useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import type { JobAccount, RecoveryChoice } from '@shared/job-journal'
import type { InterruptedRun } from '@renderer/canvas/run-model'
import { RecoveryHost } from '@renderer/panels/RecoveryHost'
import { getRecoveryView, recoveryVisible, subscribeRecovery } from '@renderer/panels/recovery-store'
import { shellControl } from './shell-control'

/**
 * M316. "UNFINISHED WORK" — the task-level half of what the Reopened notice
 * does for terminals. A restored panel says whether its PROCESS came back;
 * this says whether the JOB did: which items finished (and on what evidence),
 * which were mid-turn and may have changed files, which never started, and
 * what each recovery choice will run — before it runs anything.
 *
 * Three rules, from `shared/job-journal.ts`:
 *
 * - **A choice is a sentence first.** Every verb says how many items it will
 *   run, and "finished items are not run again" is main's answer, not a
 *   promise the button makes.
 * - **An item that may have changed files is retried only when named.** Its
 *   row carries a checkbox; the plain Retry covers only items that never
 *   reached a worker.
 * - **It stays until dealt with.** A job leaves the list when it is
 *   continued to completion, reconnected, or abandoned — never on a timer.
 *
 * Main's answer is read at mount and after every choice; a harness mount (no
 * journal, no interrupted run) renders nothing, so no golden moves.
 */
export interface JobRecoveryModel {
  jobs: JobAccount[]
  runs: InterruptedRun[]
  sentence: string | null
  choose: (jobId: string, choice: RecoveryChoice, items?: number[]) => void
  continueRun: (runId: string) => void
  leaveRun: (runId: string) => void
  /** Clear the last answer once everything is dealt with. */
  dismiss: () => void
  /** M447. The 09 surface has something to say. The job list may still be empty. */
  surface: boolean
}

export function useJobRecovery(deps: { runs: InterruptedRun[]; continueRun: (runId: string) => string }): JobRecoveryModel | null {
  const view = useSyncExternalStore(subscribeRecovery, getRecoveryView, getRecoveryView)
  const { runs, continueRun } = deps
  const [jobs, setJobs] = useState<JobAccount[]>([])
  const [sentence, setSentence] = useState<string | null>(null)
  const [leftRuns, setLeftRuns] = useState<ReadonlySet<string>>(() => new Set())
  // A job a choice was ACCEPTED for is dealt with here: a continued job is
  // live again and its block's Runs tab is where it is watched, so listing it
  // as "running in the background" beside the button that just started it
  // would be this notice reporting its own action back as news.
  const [handled, setHandled] = useState<ReadonlySet<string>>(() => new Set())
  const refresh = useCallback(() => {
    const door = window.canvas?.session?.jobs
    if (typeof door !== 'function') return
    door().then(setJobs, () => { /* no answer, no claim */ })
  }, [])
  useEffect(refresh, [refresh])
  const choose = useCallback((jobId: string, choice: RecoveryChoice, items?: number[]) => {
    const door = window.canvas?.session?.recoverJob
    if (typeof door !== 'function') return
    void door({ jobId, choice, ...(items === undefined ? {} : { items }) }).then((r) => {
      setSentence(r.kind === 'ok' ? r.sentence : r.reason)
      if (r.kind === 'ok') setHandled((cur) => new Set([...cur, jobId]))
      refresh()
    }, (error: unknown) => setSentence(error instanceof Error ? error.message : String(error)))
  }, [refresh])
  const visibleRuns = runs.filter((r) => !leftRuns.has(r.id))
  const visibleJobs = jobs.filter((j) => !handled.has(j.id))
  const leave = (runId: string): void => setLeftRuns((cur) => new Set([...cur, runId]))
  const surface = recoveryVisible(view)
  if (visibleJobs.length === 0 && visibleRuns.length === 0 && sentence === null && !surface) return null
  return {
    jobs: visibleJobs,
    runs: visibleRuns,
    sentence,
    choose,
    continueRun: (runId) => { setSentence(continueRun(runId)); leave(runId) },
    leaveRun: leave,
    dismiss: () => setSentence(null),
    surface
  }
}

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

function JobRow({ job, choose }: { job: JobAccount; choose: JobRecoveryModel['choose'] }): JSX.Element {
  const [named, setNamed] = useState<ReadonlySet<number>>(() => new Set())
  const attention = job.items.filter((i) => i.status === 'needs-you' || i.status === 'safe-retry')
  const toggle = (index: number): void => setNamed((cur) => { const next = new Set(cur); if (next.has(index)) next.delete(index); else next.add(index); return next })
  const problem = job.counts['needs-you'] > 0 || job.state === 'interrupted' || job.state === 'refused'
  return (
    <li className="reopen-notice__line" data-job-recovery-job={job.id} data-job-state={job.state} data-reopen-problem={problem ? 'true' : undefined}>
      {job.lines.map((line) => <span key={line} className="reopen-notice__text">{line}</span>)}
      {attention.length > 0 && (
        <ul className="job-recovery__items">
          {attention.map((i) => (
            <li key={i.index} className="job-recovery__item" data-job-item={i.index} data-job-item-status={i.status}>
              {i.status === 'needs-you'
                ? (
                  <label className="job-recovery__pick">
                    <input type="checkbox" checked={named.has(i.index)} onChange={() => toggle(i.index)} data-job-item-pick={i.index} />
                    <span>{i.item}</span>
                  </label>
                )
                : <span>{i.item}</span>}
              <span className="job-recovery__note"> — {i.note}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="reopen-notice__verbs">
        {job.choices.includes('reconnect') && (
          <button type="button" className="rail-row__verb" data-job-choice="reconnect" title="Show where it is — it kept running" {...shellControl(() => choose(job.id, 'reconnect'))}>reconnect</button>
        )}
        {job.choices.includes('continue') && (
          <button type="button" className="rail-row__verb" data-job-choice="continue" title="Run the items that never started; nothing that finished runs again" {...shellControl(() => choose(job.id, 'continue'))}>
            continue {count(job.counts.pending, 'item')}
          </button>
        )}
        {job.choices.includes('retry') && job.counts['safe-retry'] > 0 && named.size === 0 && (
          <button type="button" className="rail-row__verb" data-job-choice="retry" title="Retry the items that never reached a worker" {...shellControl(() => choose(job.id, 'retry'))}>
            retry {count(job.counts['safe-retry'], 'item')}
          </button>
        )}
        {job.choices.includes('retry') && named.size > 0 && (
          <button type="button" className="rail-row__verb" data-job-choice="retry-named" title="Run the ticked items again — you looked at what they changed" {...shellControl(() => choose(job.id, 'retry', [...named]))}>
            retry {count(named.size, 'ticked item')}
          </button>
        )}
        {job.choices.includes('abandon') && (
          <button type="button" className="rail-row__verb" data-job-choice="abandon" title="Leave it as it is — nothing runs, the record stays" {...shellControl(() => choose(job.id, 'abandon'))}>abandon</button>
        )}
      </span>
    </li>
  )
}

export function JobRecoveryNotice({ model }: { model: JobRecoveryModel }): JSX.Element {
  const jobs = model.jobs.length > 0 || model.runs.length > 0 || model.sentence !== null
  return (
    <>
      {model.surface ? <RecoveryHost /> : null}
      {jobs ? <JobRecoveryList model={model} /> : null}
    </>
  )
}

function JobRecoveryList({ model }: { model: JobRecoveryModel }): JSX.Element {
  return (
    <aside className="reopen-notice" data-job-recovery role="status" aria-label="Unfinished work">
      <span className="reopen-notice__kicker">Unfinished work</span>
      <ul className="reopen-notice__lines">
        {model.jobs.map((job) => <JobRow key={job.id} job={job} choose={model.choose} />)}
        {model.runs.map((run) => (
          <li key={run.id} className="reopen-notice__line" data-job-recovery-run={run.id} data-reopen-problem="true">
            <span className="reopen-notice__text">{run.line}</span>
            <span className="reopen-notice__verbs">
              <button type="button" className="rail-row__verb" data-run-continue={run.id} title="Restart only the steps that were cut off; finished steps do not run again" {...shellControl(() => model.continueRun(run.id))}>continue</button>
              <button type="button" className="rail-row__verb" data-run-leave={run.id} title="Leave this run as it ended" {...shellControl(() => model.leaveRun(run.id))}>leave</button>
            </span>
          </li>
        ))}
      </ul>
      {model.sentence !== null && <p className="reopen-notice__facts" data-job-recovery-sentence>{model.sentence}</p>}
      {model.sentence !== null && model.jobs.length === 0 && model.runs.length === 0 && (
        <button type="button" className="reopen-notice__ack" data-job-recovery-ack {...shellControl(model.dismiss)}>Got it</button>
      )}
    </aside>
  )
}
