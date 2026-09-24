import {
  abandonJob, jobAccount, needsAccount, reconcileJob, recoveryPlan,
  type JobAccount, type JobRecord, type RepoMark, type RecoveryChoice
} from '../shared/job-journal'
import type { PoolCaller } from './pool-caller'
import type { JobStore } from './job-store'

/**
 * M316. `job:list` and `job:recover` — the recovery surface's two doors, pure
 * over what main already owns: the journal, the pool caller (whether a job is
 * live in THIS process), the chats' durable transcripts (whether a worker
 * finished a turn the journal never heard about), and git (what the
 * repository looks like now against the job's start).
 *
 * The order in `list` is the reconcile rule: live facts first, the file
 * second. A job live in this process — a closed and reopened window, a
 * reload — is `reconnect`, never "interrupted"; a job whose worker's
 * transcript shows a finished turn is upgraded and WRITTEN BACK, so the
 * account a person reads twice says the same thing twice.
 */
export interface JobHandlers {
  list(): Promise<JobAccount[]>
  recover(req: { jobId: string; choice: RecoveryChoice; items?: number[] }): Promise<JobRecoverResult>
}

export type JobRecoverResult = { kind: 'ok'; sentence: string } | { kind: 'refused'; reason: string }

export interface JobRecoveryDeps {
  store: JobStore
  pool: () => PoolCaller | null
  transcript: (workerId: string) => { turns: number; costUsd?: number } | null
  /** The repository under `cwd` now; null when it is not one or git is absent. */
  repoNow: (cwd: string) => Promise<RepoMark | null>
  now?: () => number
}

export const INERT_JOBS: JobHandlers = {
  list: async () => [],
  recover: async () => ({ kind: 'refused', reason: 'job recovery is not wired' })
}

export function createJobHandlers(deps: JobRecoveryDeps): JobHandlers {
  const now = deps.now ?? Date.now
  const liveSet = (): Set<string> => deps.pool()?.liveJobs() ?? new Set()

  const reconciled = (job: JobRecord, live: boolean): JobRecord => {
    const next = reconcileJob(job, { live, transcript: deps.transcript, now: now() })
    if (next !== job) deps.store.put(next)
    return next
  }

  return {
    async list() {
      const live = liveSet()
      const out: JobAccount[] = []
      for (const job of deps.store.all()) {
        const isLive = live.has(job.id)
        const current = reconciled(job, isLive)
        if (!needsAccount(current, isLive)) continue
        const repo = current.repoAtStart === undefined ? null : await deps.repoNow(current.node.cwd).catch(() => null)
        out.push(jobAccount(current, isLive, repo))
      }
      return out
    },
    async recover(req) {
      const job = deps.store.get(req.jobId)
      if (job === undefined) return { kind: 'refused', reason: 'that job is no longer recorded' }
      const live = liveSet().has(job.id)
      if (req.choice === 'reconnect') {
        if (!live) return { kind: 'refused', reason: `${job.key} is not running any more — continue or retry it instead` }
        return deps.pool()?.replay(job.id) === true
          ? { kind: 'ok', sentence: `${job.key} reconnected — its rows show where it is` }
          : { kind: 'refused', reason: `${job.key} could not be reconnected` }
      }
      if (req.choice === 'abandon') {
        // Abandon touches no process and deletes no record: it is a person
        // saying "leave it", and the job's history stays readable.
        if (live) return { kind: 'refused', reason: `${job.key} is still running — stop it first` }
        deps.store.update(job.id, (j) => abandonJob(j, now()))
        return { kind: 'ok', sentence: `${job.key} left as it is` }
      }
      const current = reconciled(job, live)
      const plan = recoveryPlan(current, live, req.choice, req.items)
      if (plan.kind === 'refused') return plan
      const pool = deps.pool()
      if (pool === null) return { kind: 'refused', reason: 'the agent runtime has not started yet' }
      const started = pool.resume(job.id, plan.indices)
      if (started.kind === 'refused') return started
      const n = plan.indices.length
      return { kind: 'ok', sentence: `${job.key}: ${req.choice === 'continue' ? 'continuing' : 'retrying'} ${n} item${n === 1 ? '' : 's'}; finished items are not run again` }
    }
  }
}
