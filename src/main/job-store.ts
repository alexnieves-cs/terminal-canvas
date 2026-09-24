import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { JOBS_MAX, markInterrupted, parseJournal, type JobRecord } from '../shared/job-journal'

/**
 * M316. The job journal on disk — `userData/jobs.json`, one file, every job
 * the pool caller has run, newest first.
 *
 * Three rules, each with a quiet failure:
 *
 * - **Write-through, temp-and-rename, on every transition.** The journal
 *   exists for the crash, and a crash does not wait for a debounce: an
 *   attempt journalled `running` a second before the app died is the whole
 *   point. A pool moves a handful of items a minute, so a synchronous write
 *   per transition costs nothing a person can feel; `layout-store.ts`'s
 *   rename makes a torn write impossible rather than merely unlikely.
 * - **A saved `running` is converted AT CONSTRUCTION.** This store is built
 *   once per process, before any pool can start, so every `running` in the
 *   file belongs to a process that is gone. Left `running`, the next
 *   launch would show a live job nothing is driving — the exact lie the
 *   reopen notice was built to stop telling about terminals.
 * - **Settled jobs are trimmed first.** Past `JOBS_MAX`, the oldest FINISHED
 *   job goes before any job that still needs a person; an unresolved job is
 *   never dropped to make room for a newer done one.
 */
export interface JobStore {
  all(): JobRecord[]
  get(id: string): JobRecord | undefined
  /** Insert or replace, and write. */
  put(job: JobRecord): void
  /** Read-modify-write one job; undefined when there is none. */
  update(id: string, f: (job: JobRecord) => JobRecord): JobRecord | undefined
}

const SETTLED: ReadonlySet<JobRecord['state']> = new Set(['done', 'abandoned'])

export function trimJobs(jobs: readonly JobRecord[], max = JOBS_MAX): JobRecord[] {
  if (jobs.length <= max) return [...jobs]
  const out = [...jobs]
  // Newest first, so the oldest settled job is the LAST settled one.
  for (let i = out.length - 1; i >= 0 && out.length > max; i--) if (SETTLED.has(out[i]!.state)) out.splice(i, 1)
  return out.slice(0, max)
}

export function createJobStore(opts: { file: string; now?: () => number }): JobStore {
  const now = opts.now ?? Date.now
  let jobs: JobRecord[] = []
  try {
    jobs = parseJournal(JSON.parse(readFileSync(opts.file, 'utf8')))
  } catch { /* absent or unreadable: an empty journal, never a throw at boot */ }
  const write = (): void => {
    const tmp = `${opts.file}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify({ version: 1, jobs }))
      renameSync(tmp, opts.file)
    } catch (error) {
      console.warn('[jobs] could not write the job journal', error)
    }
  }
  const at = now()
  let converted = false
  jobs = jobs.map((j) => {
    if (j.state !== 'running') return j
    converted = true
    return markInterrupted(j, 'restart', at)
  })
  if (converted) write()
  return {
    all: () => jobs.map((j) => j),
    get: (id) => jobs.find((j) => j.id === id),
    put(job) {
      jobs = trimJobs([job, ...jobs.filter((j) => j.id !== job.id)])
      write()
    },
    update(id, f) {
      const cur = jobs.find((j) => j.id === id)
      if (cur === undefined) return undefined
      const next = f(cur)
      jobs = jobs.map((j) => (j.id === id ? next : j))
      write()
      return next
    }
  }
}
