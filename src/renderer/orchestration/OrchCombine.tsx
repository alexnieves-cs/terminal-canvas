import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { ReviewAcross } from '@shared/review'
import type { WatcherStateEvent } from '@shared/ipc-contract'
import { combineRunLine, planCombine, type CombineEdge, type CombineLane, type CombineRunResult } from '@shared/combine'
import { watcherArgv } from '@shared/task-flow'
import { displayPath } from '@shared/display-path'
import { CheckRunOutput } from '@renderer/checks/CheckRunOutput'
import { shellControl } from '@renderer/shell/shell-control'

/**
 * M311. COMBINE — whether the lanes of one repository are safe to put
 * together, before anyone merges.
 *
 * Four answers, in the order a person needs them:
 *  1. **Same-checkout contention** — two or more sessions writing ONE checkout
 *     (the review engine's `shared` arm). A hazard NOW, not at merge time: no
 *     integration order fixes it, so it is said first and in the warning tone.
 *  2. **Overlaps** — the same repo-relative file changed in separate lanes.
 *     Each checkout still has its own copy; the files meet at integration.
 *     Each is a review path (the file, which lanes) — not an alarm.
 *  3. **The proposed order** — `planCombine`: authored hand-offs first, lanes
 *     that meet nobody before lanes that do, smaller before larger. Every step
 *     says why it sits there.
 *  4. **The combined result** — "Combine" applies the lanes in that order into
 *     one scratch checkout (main's `combine:run`, which touches no lane), and
 *     "Run checks on the combined tree" runs a check THERE, as an ordinary
 *     watcher whose output is the M306 record. Two branches that each pass can
 *     still fail together; this is the only place that is found out.
 *
 * Its own file, not a body inside OrchWorkbench: the strip reaches only READ
 * doors (`workbench.1`), and this tab makes a scratch checkout and runs a
 * process. What it writes is named: the scratch path, and a watcher disposed
 * when the tab goes away.
 */
export interface OrchCombineProps {
  /** A repository root this page's tasks work in; null when no task has a lane. */
  root: string | null
  /** Authored hand-offs between panels; mapped to lanes through each section's panel. */
  edges: readonly { from: string; to: string }[]
  refresh: number
  onOpenPath?: (path: string) => void
}

type AcrossRead = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; across: ReviewAcross } | { kind: 'failed'; why: string }

export function OrchCombine({ root, edges, refresh, onOpenPath }: OrchCombineProps): JSX.Element {
  const [read, setRead] = useState<AcrossRead>({ kind: 'idle' })
  const [run, setRun] = useState<CombineRunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkDraft, setCheckDraft] = useState('')
  const [check, setCheck] = useState<WatcherStateEvent | null>(null)
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const watcherRef = useRef<string | null>(null)

  useEffect(() => {
    if (root === null || typeof window.canvas?.review?.across !== 'function') { setRead({ kind: 'idle' }); return }
    let live = true
    setRead({ kind: 'loading' })
    void window.canvas.review.across(root).then(
      (across) => { if (live) setRead({ kind: 'ok', across }) },
      (e: unknown) => { if (live) setRead({ kind: 'failed', why: e instanceof Error ? e.message : String(e) }) }
    )
    return () => { live = false }
  }, [root, refresh])

  // The combined check's watcher is this tab's; it goes when the tab does.
  useEffect(() => () => { if (watcherRef.current !== null) void window.canvas.watcher.dispose(watcherRef.current).catch(() => {}) }, [])
  useEffect(() => window.canvas.watcher.onState((ev) => { if (ev.id === watcherRef.current) setCheck(ev) }), [])

  // The repository's own checks as the starting command, when a setup is saved.
  useEffect(() => {
    if (root === null) return
    let live = true
    void window.canvas.setup.read(root).then((r) => {
      if (live && r.kind === 'saved' && r.setup.checks.length > 0) setCheckDraft((cur) => (cur === '' ? r.setup.checks.join(' && ') : cur))
    }, () => {})
    return () => { live = false }
  }, [root])

  const sections = read.kind === 'ok' && read.across.kind === 'across' ? read.across.sections : []
  const mainTree = read.kind === 'ok' && read.across.kind === 'across' ? read.across.root : null
  const lanes: CombineLane[] = useMemo(() => sections
    .filter((s) => s.path !== mainTree && (s.result.kind === 'changes' || s.result.kind === 'shared'))
    .map((s) => {
      const r = s.result as Extract<typeof s.result, { kind: 'changes' | 'shared' }>
      return { id: s.path, label: s.label, branch: s.branch, ...(s.panelId === undefined ? {} : { panelId: s.panelId }), files: r.files.map((f) => f.path), added: r.files.reduce((n, f) => n + f.added, 0), removed: r.files.reduce((n, f) => n + f.removed, 0) }
    }), [sections, mainTree])
  const laneOfPanel = new Map(lanes.filter((l) => l.panelId !== undefined).map((l) => [l.panelId as string, l.id]))
  const laneEdges: CombineEdge[] = edges.flatMap((e) => {
    const from = laneOfPanel.get(e.from), to = laneOfPanel.get(e.to)
    return from !== undefined && to !== undefined ? [{ from, to }] : []
  })
  const plan = planCombine(lanes, laneEdges)
  const labelOf = (id: string): string => lanes.find((l) => l.id === id)?.label ?? displayPath(id).short
  // Same-checkout contention: the review engine's `shared` arm — several sessions, one checkout.
  const contended = sections.filter((s) => s.result.kind === 'shared')
  const mainDirty = sections.find((s) => s.path === mainTree && s.result.kind === 'changes')

  const combine = (): void => {
    if (root === null || busy || plan.order.length < 2) return
    setBusy(true); setRun(null); setCheck(null); setCheckNote(null)
    void window.canvas.combine.run({ root, lanes: plan.order.map((s) => s.id) }).then(
      (r) => { setBusy(false); setRun(r) },
      (e: unknown) => { setBusy(false); setRun({ kind: 'unreadable', detail: e instanceof Error ? e.message : String(e) }) }
    )
  }

  const runCheck = async (): Promise<void> => {
    if (run === null || run.kind !== 'combined' || run.conflict !== null) return
    const argv = watcherArgv(checkDraft)
    if (argv === null) { setCheckNote('type the command that runs the checks'); return }
    if (watcherRef.current !== null) await window.canvas.watcher.dispose(watcherRef.current).catch(() => {})
    const id = `combine-${Date.now().toString(36)}`
    watcherRef.current = id
    setCheck(null)
    const made = await window.canvas.watcher.create({ id, cwd: run.path, command: argv.command, args: argv.args, trigger: { kind: 'path', path: run.path }, armed: false })
    if (!made.ok) { setCheckNote(made.reason); watcherRef.current = null; return }
    setCheckNote(null)
    void window.canvas.watcher.run(id)
  }

  if (root === null) {
    return <p className="orch__review-words" data-orch-combine="no-root">No task on this page has a lane yet. Combine compares the worktrees of one repository once two tasks are working in it.</p>
  }
  return (
    <div className="orch__combine" data-orch-combine={read.kind}>
      {read.kind === 'loading' && <p className="orch__caption" role="status">Reading every lane of {displayPath(root).short}…</p>}
      {read.kind === 'failed' && <p className="orch__review-words">Could not read the lanes: {read.why}</p>}
      {read.kind === 'ok' && read.across.kind !== 'across' && (
        <p className="orch__review-words">{read.across.kind === 'git-missing' ? 'git is not installed, so the lanes cannot be compared.' : `git could not read the repository: ${read.across.detail}`}</p>
      )}
      {read.kind === 'ok' && read.across.kind === 'across' && (
        <>
          <p className="orch__bench-fresh" data-orch-combine-summary>{plan.summary}</p>

          {contended.length > 0 && (
            <div className="orch__combine-block" data-orch-combine-contention={contended.length}>
              <span className="orch__label orch__label--warn">Shared checkout — contention now</span>
              {contended.map((s) => {
                const r = s.result as Extract<typeof s.result, { kind: 'shared' }>
                return (
                  <p key={s.path} className="orch__review-words" data-tone="needs-you">
                    {r.panelCount} sessions are writing <code>{displayPath(s.path).short}</code> — one checkout, so each sees the other's half-finished edits and no diff can be attributed. Give each its own lane (Start work makes one) before combining; {r.files.length} {r.files.length === 1 ? 'file is' : 'files are'} changed there.
                  </p>
                )
              })}
            </div>
          )}

          {plan.overlaps.length > 0 && (
            <div className="orch__combine-block" data-orch-combine-overlaps={plan.overlaps.length}>
              <span className="orch__label">Changed in more than one lane — separate checkouts, they meet at integration</span>
              <ul className="orch__review-files" aria-label="Overlapping files">
                {plan.overlaps.map((o) => (
                  <li key={o.path} data-orch-combine-overlap={o.path}>
                    <span className="orch__activity-row orch__check-row">
                      <code className="orch__activity-title">{o.path}</code>
                      <span className="orch__activity-detail">{o.lanes.map(labelOf).join(' · ')}</span>
                      {onOpenPath !== undefined && (
                        <span className="orch__combine-opens">
                          {o.lanes.map((l) => (
                            <button key={l} type="button" className="orch__mini" title={`open ${labelOf(l)}'s copy of ${o.path}`}
                              {...shellControl(() => onOpenPath(`${l}/${o.path}`))}>{labelOf(l)}</button>
                          ))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.order.length > 0 && (
            <div className="orch__combine-block" data-orch-combine-order={plan.order.length}>
              <span className="orch__label">Proposed integration order{plan.cycle.length > 0 ? ' — the hand-off links form a loop' : ''}</span>
              <ol className="orch__combine-order">
                {plan.order.map((s) => (
                  <li key={s.id} data-orch-combine-step={s.label}>
                    <strong>{s.label}</strong> <span className="orch__activity-detail">— {s.reason}{s.meets.length > 0 ? `; meets earlier lanes in ${s.meets.join(', ')}` : ''}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {mainDirty !== undefined && (
            <p className="orch__caption" data-orch-combine-main-dirty>The main tree has its own uncommitted changes; a combine starts from its last commit and leaves them out.</p>
          )}

          {plan.order.length >= 2 && (
            <div className="orch__combine-block" data-orch-combine-run={run?.kind ?? 'none'}>
              <span className="orch__label">The combined result</span>
              <div className="orch__combine-verbs">
                <button type="button" className="orch__mini" data-orch-combine-go disabled={busy}
                  title="Apply every lane, in the order above, into one scratch checkout beside the lanes — no lane and no branch is touched"
                  {...shellControl(combine)}>{busy ? 'Combining…' : run === null ? 'Combine in a scratch checkout' : 'Combine again'}</button>
              </div>
              {run !== null && <p className="orch__review-words" data-orch-combine-line data-tone={run.kind === 'combined' && run.conflict === null ? 'idle' : 'needs-you'}>{combineRunLine(run, labelOf)}</p>}
              {run?.kind === 'combined' && run.conflict !== null && run.conflict.detail !== '' && (
                <p className="orch__caption">git said: {run.conflict.detail}</p>
              )}
              {run?.kind === 'combined' && run.conflict === null && (
                <div className="orch__combine-check" data-orch-combine-check={check?.status ?? 'none'}>
                  <input className="task-review__run-input" data-orch-combine-command value={checkDraft} spellCheck={false}
                    aria-label="Command that checks the combined tree" placeholder="npm test"
                    onChange={(e) => setCheckDraft(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); void runCheck() } }} />
                  <button type="button" className="orch__mini" data-orch-combine-check-go disabled={checkDraft.trim() === '' || check?.status === 'running'}
                    {...shellControl(() => { void runCheck() })}>{check?.status === 'running' ? 'Checking…' : 'Run checks on the combined tree'}</button>
                  {checkNote !== null && <p className="orch__caption" role="status">{checkNote}</p>}
                  {check !== null && check.status !== 'running' && check.status !== 'not-started' && (
                    <>
                      <p className="orch__review-words" data-tone={check.status === 'passed' ? 'idle' : 'needs-you'} data-orch-combine-check-word={check.status}>
                        {check.status === 'passed'
                          ? `Passed on the combined tree (${run.applied.length} lanes on ${run.base.slice(0, 7)}) — these lanes are safe to integrate in this order.`
                          : `Failed on the combined tree${check.exitCode === null || check.exitCode === undefined ? '' : ` (exit ${check.exitCode})`} — the lanes may each pass alone; this failure is what they do together.`}
                      </p>
                      <CheckRunOutput outputId={check.outputId} subject="the combined tree" fallback="This run has no output record." />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
