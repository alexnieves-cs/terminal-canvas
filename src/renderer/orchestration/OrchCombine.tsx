import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { ReviewAcross } from '@shared/review'
import type { WatcherStateEvent } from '@shared/ipc-contract'
import type { PersistedWorkItem } from '@shared/work-items'
import type { ReviewHandoff } from '@shared/review-readiness'
import { combineRunLine, planCombine, type CombineEdge, type CombineLane, type CombineRunResult } from '@shared/combine'
import {
  attributeCheckFailure, attributeConflict, integrationFixBrief, integrationGate, integrationStanding, receiptHeadline, staleWords,
  type FailureAttribution, type IntegrateLaneFacts, type IntegrationReceipt, type IntegrationStanding, type LaneFingerprint
} from '@shared/integration'
import { checkOutputDisplay } from '@shared/check-output'
import { watcherArgv } from '@shared/task-flow'
import { displayPath } from '@shared/display-path'
import { outward } from '@shared/outward'
import { CheckRunOutput } from '@renderer/checks/CheckRunOutput'
import { shellControl } from '@renderer/shell/shell-control'
import { recordOrchEvent } from './orch-record'

/**
 * M311 + M317. COMBINE — whether the lanes of one repository are safe to put
 * together, and then the whole way to putting them together.
 *
 * In the order a person needs it:
 *  1. **Same-checkout contention** — two or more sessions writing ONE checkout
 *     (the review engine's `shared` arm). A hazard NOW: said first, in the
 *     warning tone.
 *  2. **Overlaps** — the same repo-relative file changed in separate lanes.
 *  3. **Dependencies and the proposed order** — `planCombine`, each step with
 *     its task and why it sits there; authored hand-offs are listed as the
 *     dependencies they are.
 *  4. **The combined result** — applied into one scratch checkout (M311),
 *     checked there by an ordinary watcher (M306's record). M317: the result
 *     remembers what it combined (each lane's content fingerprint) and is
 *     re-read while this tab is open, so an edit in any input lane marks it
 *     OUT OF DATE rather than leaving a green check standing over new code.
 *  5. **A failure, traced** — a conflict or a failed combined check names the
 *     tasks and files involved (`integration.ts`), and the brief for the
 *     responsible agent is SHOWN WHOLE and sent only on a press, through the
 *     same door the follow-up composer uses (`onSend`). "Combine and check
 *     again" re-runs both steps once the agent has answered.
 *  6. **Integrate** — a gate listing every condition (combined clean, checked,
 *     nothing moved, each lane reviewed at this revision and committed), then
 *     main lands the lanes in the checked order, re-reading every witness
 *     first, and keeps a RECEIPT: what landed, the check that witnessed it,
 *     and whether the landed tree is byte-identical to the checked one.
 *
 * Its own file, not a body inside OrchWorkbench: the strip reaches only READ
 * doors (`workbench.1`), and this tab makes a scratch checkout, runs a
 * process, sends a message and merges. What it writes is named: the scratch
 * path, a watcher disposed with the tab, a sent brief, and the merges.
 */
export interface OrchCombineProps {
  /** A repository root this page's tasks work in; null when no task has a lane. */
  root: string | null
  /** Authored hand-offs between panels; mapped to lanes through each section's panel. */
  edges: readonly { from: string; to: string }[]
  refresh: number
  onOpenPath?: (path: string) => void
  /** M317. The tasks, so a lane is named by its task and carries its review standing. */
  workItems?: readonly PersistedWorkItem[]
  worktrees?: readonly { id: string; path: string }[]
  taskHandoffOf?: (itemId: string) => ReviewHandoff | undefined
  /** M317. The follow-up door (M299's `onSend`); resolves null when sent, else the reason. */
  onSend?: (panelId: string, text: string) => Promise<string | null>
  /** M317. What landing a task's lane records on it — Accept's own patch. */
  onPatchWorkItem?: (itemId: string, fields: Partial<PersistedWorkItem>) => void
  onRefreshTaskHandoffs?: () => void
}

type AcrossRead = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; across: ReviewAcross } | { kind: 'failed'; why: string }

/** How often an open Combine tab re-reads its input lanes. A pull, cheap (diffs of the lanes only). */
const STALE_POLL_MS = 5000
const TAIL_LINES = 30

export function OrchCombine({ root, edges, refresh, onOpenPath, workItems = [], worktrees = [], taskHandoffOf, onSend, onPatchWorkItem, onRefreshTaskHandoffs }: OrchCombineProps): JSX.Element {
  const [read, setRead] = useState<AcrossRead>({ kind: 'idle' })
  const [run, setRun] = useState<CombineRunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkDraft, setCheckDraft] = useState('')
  const [check, setCheck] = useState<WatcherStateEvent | null>(null)
  const [checkCommand, setCheckCommand] = useState<string | null>(null)
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const [now, setNow] = useState<{ standing: IntegrationStanding; lanes: LaneFingerprint[] } | null>(null)
  const [failText, setFailText] = useState<string | null>(null)
  const [sendTo, setSendTo] = useState<string | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const [sendNote, setSendNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [integrating, setIntegrating] = useState(false)
  const [integrateNote, setIntegrateNote] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<IntegrationReceipt[]>([])
  const [receiptOpen, setReceiptOpen] = useState<string | null>(null)
  const watcherRef = useRef<string | null>(null)
  const recheckRef = useRef(false)

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

  const loadReceipts = useCallback(() => {
    if (root === null || typeof window.canvas?.combine?.receipts !== 'function') return
    void window.canvas.combine.receipts(root).then((r) => setReceipts(r), () => {})
  }, [root])
  useEffect(() => { loadReceipts() }, [loadReceipts, refresh])

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

  // M317. A lane is named by its TASK when one owns it — by the worktree
  // record, else the conversation the section belongs to.
  const taskOfLane = useCallback((lane: string, panelId?: string): PersistedWorkItem | undefined => {
    const wt = worktrees.find((w) => w.path === lane)
    return (wt === undefined ? undefined : workItems.find((i) => i.worktreeId === wt.id)) ??
      (panelId === undefined ? undefined : workItems.find((i) => i.panelId === panelId))
  }, [worktrees, workItems])

  const lanes: CombineLane[] = useMemo(() => sections
    .filter((s) => s.path !== mainTree && (s.result.kind === 'changes' || s.result.kind === 'shared'))
    .map((s) => {
      const r = s.result as Extract<typeof s.result, { kind: 'changes' | 'shared' }>
      const task = taskOfLane(s.path, s.panelId)
      return { id: s.path, label: task?.title ?? s.label, branch: s.branch, ...(s.panelId === undefined ? {} : { panelId: s.panelId }), files: r.files.map((f) => f.path), added: r.files.reduce((n, f) => n + f.added, 0), removed: r.files.reduce((n, f) => n + f.removed, 0) }
    }), [sections, mainTree, taskOfLane])
  const laneOfPanel = new Map(lanes.filter((l) => l.panelId !== undefined).map((l) => [l.panelId as string, l.id]))
  const laneEdges: CombineEdge[] = edges.flatMap((e) => {
    const from = laneOfPanel.get(e.from), to = laneOfPanel.get(e.to)
    return from !== undefined && to !== undefined && from !== to ? [{ from, to }] : []
  })
  const plan = planCombine(lanes, laneEdges)
  const labelOf = (id: string): string => lanes.find((l) => l.id === id)?.label ?? displayPath(id).short
  const branchOf = (id: string): string => lanes.find((l) => l.id === id)?.branch ?? ''
  // Same-checkout contention: the review engine's `shared` arm — several sessions, one checkout.
  const contended = sections.filter((s) => s.result.kind === 'shared')
  const mainDirty = sections.find((s) => s.path === mainTree && s.result.kind === 'changes')

  const combined = run?.kind === 'combined' ? run : null
  const clean = combined !== null && combined.conflict === null
  const checkDone = check !== null && check.status !== 'running' && check.status !== 'not-started'
  const checkPassed = checkDone && check.status === 'passed'
  const checkFailed = checkDone && check.status !== 'passed'

  // M317. STALENESS — re-read the input lanes while a result stands.
  const witnessedKey = combined === null ? '' : `${combined.base}|${(combined.inputs ?? []).map((i) => `${i.lane}:${i.digest}`).join(',')}`
  useEffect(() => {
    setNow(null)
    if (combined === null || combined.inputs === undefined || root === null || typeof window.canvas?.combine?.inputs !== 'function') return
    let live = true
    const witnessed = { base: combined.base, inputs: combined.inputs }
    const lanesToRead = combined.inputs.map((i) => i.lane)
    const poll = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void window.canvas.combine.inputs({ root, lanes: lanesToRead }).then((r) => {
        if (live && r.kind === 'inputs') setNow({ standing: integrationStanding(witnessed, r), lanes: r.lanes })
      }, () => {})
    }
    poll()
    const t = setInterval(poll, STALE_POLL_MS)
    return () => { live = false; clearInterval(t) }
  }, [witnessedKey, root]) // eslint-disable-line react-hooks/exhaustive-deps
  const stale = now !== null && now.standing.kind === 'stale'

  // M317. A failed combined check's own output, read once, scrubbed at the read.
  useEffect(() => {
    setFailText(null)
    if (!checkFailed || check?.outputId === undefined || typeof window.canvas?.ledger?.output !== 'function') return
    let live = true
    void window.canvas.ledger.output(check.outputId).then((r) => {
      if (live && r.kind === 'ok') setFailText(outward(checkOutputDisplay(r.record), 'the combined tree').text)
    }, () => {})
    return () => { live = false }
  }, [checkFailed, check?.outputId])

  const attribution: FailureAttribution | null = useMemo(() => {
    if (combined === null) return null
    if (combined.conflict !== null) return attributeConflict(plan, combined.conflict, combined.applied)
    if (checkFailed && failText !== null) return attributeCheckFailure(plan, combined.applied, failText, combined.path)
    if (checkFailed) return attributeCheckFailure(plan, combined.applied, check?.tail ?? '', combined.path)
    return null
  }, [combined, checkFailed, failText, plan.lanes, plan.overlaps]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSendTo(null); setBriefOpen(false); setSendNote(null) }, [attribution?.responsible, attribution?.kind])

  const combine = (then?: () => void): void => {
    if (root === null || busy || plan.order.length < 2) return
    setBusy(true); setRun(null); setCheck(null); setCheckNote(null); setIntegrateNote(null); setConfirming(false)
    void window.canvas.combine.run({ root, lanes: plan.order.map((s) => s.id) }).then(
      (r) => { setBusy(false); setRun(r); if (r.kind === 'combined' && r.conflict === null) then?.() },
      (e: unknown) => { setBusy(false); setRun({ kind: 'unreadable', detail: e instanceof Error ? e.message : String(e) }) }
    )
  }

  const runCheck = async (at?: CombineRunResult): Promise<void> => {
    const target = at ?? run
    if (target === null || target.kind !== 'combined' || target.conflict !== null) return
    const argv = watcherArgv(checkDraft)
    if (argv === null) { setCheckNote('type the command that runs the checks'); return }
    if (watcherRef.current !== null) await window.canvas.watcher.dispose(watcherRef.current).catch(() => {})
    const id = `combine-${Date.now().toString(36)}`
    watcherRef.current = id
    setCheck(null)
    const made = await window.canvas.watcher.create({ id, cwd: target.path, command: argv.command, args: argv.args, trigger: { kind: 'path', path: target.path }, armed: false })
    if (!made.ok) { setCheckNote(made.reason); watcherRef.current = null; return }
    setCheckNote(null)
    setCheckCommand(checkDraft.trim())
    void window.canvas.watcher.run(id)
  }

  // "Combine and check again": the second step runs on the run the first produced.
  useEffect(() => {
    if (!recheckRef.current || run === null) return
    recheckRef.current = false
    if (run.kind === 'combined' && run.conflict === null && checkDraft.trim() !== '') void runCheck(run)
  }, [run]) // eslint-disable-line react-hooks/exhaustive-deps
  const recheck = (): void => { recheckRef.current = true; combine() }

  // ── The brief back to the responsible agent ────────────────────────────────
  const target = sendTo ?? attribution?.responsible ?? null
  const targetTask = target === null ? undefined : taskOfLane(target, lanes.find((l) => l.id === target)?.panelId)
  const targetChat = targetTask?.panelId ?? lanes.find((l) => l.id === target)?.panelId
  const tail = failText === null ? check?.tail ?? '' : failText.split('\n').slice(-TAIL_LINES).join('\n')
  const brief = attribution === null || target === null || combined === null ? '' : integrationFixBrief({
    attribution, to: target, labelOf, base: combined.base,
    ...(attribution.kind === 'check' ? { command: checkCommand ?? checkDraft.trim(), exitCode: check?.exitCode ?? null, tail: outward(tail, 'the combined tree').text } : {})
  })
  const send = (): void => {
    if (onSend === undefined || targetChat === undefined || brief === '' || target === null) return
    setSendNote('Sending…')
    void onSend(targetChat, brief).then((why) => {
      if (why !== null) { setSendNote(`Not sent — ${why}`); return }
      setSendNote(`Sent to ${labelOf(target)}. When it has answered, press “Combine and check again”.`)
      setBriefOpen(false)
      void recordOrchEvent({
        runId: `integration:${combined?.base.slice(0, 12) ?? ''}`, event: 'dispatch', source: 'person',
        title: `Integration ${attribution?.kind === 'conflict' ? 'conflict' : 'failure'} sent back to the agent`,
        detail: attribution?.summary ?? '', panelId: targetChat, key: 'integration-fix',
        ...(targetTask === undefined ? {} : { itemId: targetTask.id }),
        ...(attribution === null ? {} : { paths: attribution.paths })
      })
    }, (e: unknown) => setSendNote(`Not sent — ${e instanceof Error ? e.message : String(e)}`))
  }

  // ── The gate, and integrate ────────────────────────────────────────────────
  const laneFacts: IntegrateLaneFacts[] = combined === null ? [] : combined.applied.map((lane) => {
    const task = taskOfLane(lane, lanes.find((l) => l.id === lane)?.panelId)
    const standing = task === undefined ? undefined : taskHandoffOf?.(task.id)?.standing
    const fp = now?.lanes.find((l) => l.lane === lane) ?? combined.inputs?.find((l) => l.lane === lane)
    return { lane, label: labelOf(lane), review: task === undefined ? 'no-task' : standing ?? 'none', dirty: fp?.dirty ?? true }
  })
  const gate = integrationGate({
    lanes: laneFacts,
    combined: combined === null ? 'none' : combined.conflict === null ? 'clean' : 'conflict',
    check: check === null ? 'none' : check.status === 'running' || check.status === 'not-started' ? 'running' : check.status === 'passed' ? 'passed' : 'failed',
    standing: now?.standing ?? null
  })
  const integrate = (): void => {
    if (combined === null || combined.tree === undefined || combined.inputs === undefined || root === null || check?.outputId === undefined || !gate.ready) return
    setIntegrating(true); setIntegrateNote(null)
    const inputs = combined.inputs
    void window.canvas.combine.integrate({
      root, base: combined.base, tree: combined.tree,
      check: { command: checkCommand ?? checkDraft.trim(), outputId: check.outputId },
      reviewed: laneFacts.filter((l) => l.review === 'current').map((l) => l.lane),
      lanes: combined.applied.map((lane) => {
        const task = taskOfLane(lane, lanes.find((l) => l.id === lane)?.panelId)
        return {
          lane, label: labelOf(lane), digest: inputs.find((i) => i.lane === lane)?.digest ?? '',
          ...(task === undefined ? {} : { itemId: task.id, title: task.title })
        }
      })
    }).then((r) => {
      setIntegrating(false); setConfirming(false)
      if (r.kind === 'refused') { setIntegrateNote(r.reason); return }
      if (r.kind === 'stale') { setIntegrateNote(staleWords({ kind: 'stale', changed: r.changed, missing: [], mainMoved: r.mainMoved }, labelOf)); return }
      const receipt = r.receipt
      setReceiptOpen(receipt.id)
      setIntegrateNote(null)
      // Each landed task records the landing the way Accept does (M315); its
      // timeline row is main's to write (main saw the merge — integrator.ts).
      for (const l of receipt.lanes) {
        if (l.outcome !== 'merged' || l.itemId === undefined) continue
        onPatchWorkItem?.(l.itemId, { state: 'done', merged: { into: receipt.into, sha: l.sha ?? receipt.after, at: receipt.at } })
      }
      loadReceipts()
      onRefreshTaskHandoffs?.()
    }, (e: unknown) => { setIntegrating(false); setIntegrateNote(e instanceof Error ? e.message : String(e)) })
  }

  if (root === null) {
    return <p className="orch__review-words" data-orch-combine="no-root">No task on this page has a lane yet. Combine compares the worktrees of one repository once two tasks are working in it.</p>
  }
  const latest = receipts.find((r) => r.id === receiptOpen) ?? null
  return (
    <div className="orch__combine" data-orch-combine={read.kind}>
      {read.kind === 'loading' && <p className="orch__caption" role="status">Reading every lane of {displayPath(root).short}…</p>}
      {read.kind === 'failed' && <p className="orch__review-words">Could not read the lanes: {read.why}</p>}
      {read.kind === 'ok' && read.across.kind !== 'across' && (
        <p className="orch__review-words">{read.across.kind === 'git-missing' ? 'git is not installed, so the lanes cannot be compared.' : `git could not read the repository: ${read.across.detail}`}</p>
      )}
      {latest !== null && <ReceiptCard receipt={latest} onClose={() => setReceiptOpen(null)} />}
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
              {laneEdges.length > 0 && (
                <p className="orch__caption" data-orch-combine-deps={laneEdges.length}>
                  Depends on: {laneEdges.map((e) => `${labelOf(e.to)} waits on ${labelOf(e.from)}`).join(' · ')}
                </p>
              )}
              <ol className="orch__combine-order">
                {plan.order.map((s) => (
                  <li key={s.id} data-orch-combine-step={s.label}>
                    <strong>{s.label}</strong>{branchOf(s.id) !== '' && <code className="orch__combine-branch"> {branchOf(s.id)}</code>} <span className="orch__activity-detail">— {s.reason}{s.meets.length > 0 ? `; meets earlier lanes in ${s.meets.join(', ')}` : ''}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {mainDirty !== undefined && (
            <p className="orch__caption" data-orch-combine-main-dirty>The main tree has its own uncommitted changes; a combine starts from its last commit and leaves them out.</p>
          )}

          {plan.order.length >= 2 && (
            <div className="orch__combine-block" data-orch-combine-run={run?.kind ?? 'none'} data-orch-combine-stale={stale || undefined}>
              <span className="orch__label">The combined result</span>
              <div className="orch__combine-verbs">
                <button type="button" className="orch__mini" data-orch-combine-go disabled={busy}
                  title="Apply every lane, in the order above, into one scratch checkout beside the lanes — no lane and no branch is touched"
                  {...shellControl(() => combine())}>{busy ? 'Combining…' : run === null ? 'Combine in a scratch checkout' : 'Combine again'}</button>
                {run !== null && checkDraft.trim() !== '' && (
                  <button type="button" className="orch__mini" data-orch-combine-recheck disabled={busy || check?.status === 'running'}
                    title="Combine every lane again as it is now, then run the same check on the new combined tree"
                    {...shellControl(recheck)}>Combine and check again</button>
                )}
              </div>
              {stale && now !== null && (
                <p className="orch__review-words" data-tone="needs-you" data-orch-combine-stale-line>{staleWords(now.standing, labelOf)}</p>
              )}
              {run !== null && <p className="orch__review-words" data-orch-combine-line data-tone={clean ? 'idle' : 'needs-you'}>{combineRunLine(run, labelOf)}</p>}
              {combined !== null && combined.conflict !== null && combined.conflict.detail !== '' && (
                <p className="orch__caption">git said: {combined.conflict.detail}</p>
              )}
              {clean && combined !== null && (
                <div className="orch__combine-check" data-orch-combine-check={check?.status ?? 'none'}>
                  <input className="task-review__run-input" data-orch-combine-command value={checkDraft} spellCheck={false}
                    aria-label="Command that checks the combined tree" placeholder="npm test"
                    onChange={(e) => setCheckDraft(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); void runCheck() } }} />
                  <button type="button" className="orch__mini" data-orch-combine-check-go disabled={checkDraft.trim() === '' || check?.status === 'running'}
                    {...shellControl(() => { void runCheck() })}>{check?.status === 'running' ? 'Checking…' : 'Run checks on the combined tree'}</button>
                  {checkNote !== null && <p className="orch__caption" role="status">{checkNote}</p>}
                  {checkDone && check !== null && (
                    <>
                      <p className="orch__review-words" data-tone={checkPassed && !stale ? 'idle' : 'needs-you'} data-orch-combine-check-word={check.status}>
                        {checkPassed
                          ? `Passed on the combined tree (${combined.applied.length} lanes on ${combined.base.slice(0, 7)})${stale ? ' — but a lane has changed since, so this no longer speaks for them' : ' — these lanes are safe to integrate in this order'}.`
                          : `Failed on the combined tree${check.exitCode === null || check.exitCode === undefined ? '' : ` (exit ${check.exitCode})`} — the lanes may each pass alone; this failure is what they do together.`}
                      </p>
                      <CheckRunOutput outputId={check.outputId} subject="the combined tree" fallback="This run has no output record." />
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {attribution !== null && combined !== null && (
            <div className="orch__combine-block" data-orch-combine-failure={attribution.kind} data-orch-combine-unattributed={attribution.unattributed || undefined}>
              <span className="orch__label orch__label--warn">{attribution.kind === 'conflict' ? 'Where they conflict' : 'Where it fails'}</span>
              <p className="orch__review-words" data-orch-combine-attribution>{attribution.summary}</p>
              <ul className="orch__review-files" aria-label="Tasks in this failure">
                {attribution.participants.map((p) => (
                  <li key={p.lane} data-orch-combine-participant={p.role}>
                    <span className="orch__activity-row orch__check-row">
                      <strong className="orch__activity-title">{p.label}</strong>
                      <span className="orch__activity-detail">{p.role === 'responsible' ? (attribution.unattributed ? 'suggested to fix it' : 'fixes it') : p.role === 'met' ? 'meets it' : 'in the combination'}</span>
                      {p.paths.length > 0 && onOpenPath !== undefined && (
                        <span className="orch__combine-opens">
                          {p.paths.map((f) => (
                            <button key={f} type="button" className="orch__mini" title={`open ${p.label}'s copy of ${f}`}
                              {...shellControl(() => onOpenPath(`${p.lane}/${f}`))}>{f}</button>
                          ))}
                        </span>
                      )}
                      {p.paths.length > 0 && onOpenPath === undefined && <code className="orch__activity-detail">{p.paths.join(', ')}</code>}
                    </span>
                  </li>
                ))}
              </ul>
              {onSend !== undefined && (
                <div className="orch__combine-send" data-orch-combine-send>
                  <label className="orch__caption">
                    Send it back to{' '}
                    <select className="orch__combine-select" data-orch-combine-send-to value={target ?? ''} onChange={(e) => { setSendTo(e.target.value); setSendNote(null) }}>
                      {attribution.participants.map((p) => <option key={p.lane} value={p.lane}>{p.label}</option>)}
                    </select>
                  </label>
                  {targetChat === undefined
                    ? <span className="orch__caption" data-orch-combine-send-none>{labelOf(target ?? '')} has no conversation here to send to — open its lane and fix it there.</span>
                    : <button type="button" className="orch__mini" data-orch-combine-brief={briefOpen ? 'open' : 'closed'} {...shellControl(() => setBriefOpen(!briefOpen))}>{briefOpen ? 'Hide the message' : 'Show the message…'}</button>}
                </div>
              )}
              {briefOpen && targetChat !== undefined && (
                <div className="orch__combine-brief">
                  <pre className="orch__combine-brief-text" data-orch-combine-brief-text>{brief}</pre>
                  <button type="button" className="orch__mini" data-orch-combine-send-go {...shellControl(send)}>Send to {labelOf(target ?? '')}'s agent</button>
                </div>
              )}
              {sendNote !== null && <p className="orch__caption" role="status" data-orch-combine-send-note>{sendNote}</p>}
            </div>
          )}

          {clean && checkPassed && (
            <div className="orch__combine-block" data-orch-combine-integrate={gate.ready ? 'ready' : 'blocked'}>
              <span className="orch__label">Integrate</span>
              <ul className="orch__combine-gate" aria-label="Before the lanes land">
                {gate.items.map((g) => <li key={g.text} data-orch-combine-gate={g.holds ? 'holds' : 'missing'}>{g.holds ? '✓' : '·'} {g.text}</li>)}
              </ul>
              <div className="orch__combine-verbs">
                {!confirming
                  ? <button type="button" className="orch__mini" data-orch-combine-integrate-go disabled={!gate.ready || integrating}
                    title={gate.ready ? 'Merge each lane, in the order above, into the main tree\'s branch' : 'every condition above must hold first'}
                    {...shellControl(() => setConfirming(true))}>Integrate {combined?.applied.length ?? 0} lanes…</button>
                  : <>
                    <span className="orch__caption" data-orch-combine-confirm>Merge {combined?.applied.map(labelOf).join(', then ')} into the main tree's branch, in that order? Each is a merge commit; the lanes stay until you remove them.</span>
                    <button type="button" className="orch__mini" data-orch-combine-integrate-confirm disabled={integrating} {...shellControl(integrate)}>{integrating ? 'Integrating…' : 'Merge them'}</button>
                    <button type="button" className="orch__mini" disabled={integrating} {...shellControl(() => setConfirming(false))}>Cancel</button>
                  </>}
              </div>
              {integrateNote !== null && <p className="orch__review-words" data-tone="needs-you" role="status" data-orch-combine-integrate-note>{integrateNote}</p>}
            </div>
          )}

          {receipts.length > 0 && (
            <div className="orch__combine-block" data-orch-combine-receipts={receipts.length}>
              <span className="orch__label">Receipts — what landed, and what witnessed it</span>
              <ul className="orch__review-files">
                {receipts.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button type="button" className="orch__activity-row orch__check-row orch__combine-receipt-row" data-orch-combine-receipt={r.id} title="Open this integration's receipt"
                      {...shellControl(() => setReceiptOpen(receiptOpen === r.id ? null : r.id))}>
                      <span className="orch__activity-title">{new Date(r.at).toLocaleString()}</span>
                      <span className="orch__activity-detail">{receiptHeadline(r)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** M317. The receipt: each lane that landed (its task, branch, commits, the resulting sha, whether it was reviewed), the check that witnessed it, and the tree comparison. */
function ReceiptCard({ receipt, onClose }: { receipt: IntegrationReceipt; onClose: () => void }): JSX.Element {
  const [showOutput, setShowOutput] = useState(false)
  const witness = receipt.checks[0]
  return (
    <div className="orch__combine-receipt" data-orch-combine-receipt-card={receipt.complete ? 'complete' : 'partial'} data-tone={receipt.complete && receipt.tree.identical ? 'idle' : 'needs-you'}>
      <div className="orch__combine-receipt-head">
        <span className="orch__label">Integration receipt</span>
        <button type="button" className="orch__mini" {...shellControl(onClose)}>Close</button>
      </div>
      <p className="orch__review-words" data-orch-combine-receipt-headline>{receiptHeadline(receipt)}</p>
      <ol className="orch__combine-order">
        {receipt.lanes.map((l) => (
          <li key={l.lane} data-orch-combine-receipt-lane={l.outcome}>
            <strong>{l.title ?? l.label}</strong> <code>{l.branch}</code>{' '}
            <span className="orch__activity-detail">
              — {l.outcome === 'merged' ? `landed, ${l.commits} commit${l.commits === 1 ? '' : 's'} → ${(l.sha ?? '').slice(0, 7)}` : l.outcome === 'not-reached' ? 'not reached' : `${l.outcome}: ${l.detail ?? ''}`}
              {' · '}{l.reviewed ? 'reviewed at this revision' : 'no review recorded'}
            </span>
          </li>
        ))}
      </ol>
      {witness !== undefined && (
        <p className="orch__caption" data-orch-combine-receipt-witness>
          Witnessed by <code>{witness.command}</code> — {witness.exitCode === 0 ? 'passed' : `exit ${witness.exitCode ?? '?'}`} on {witness.where} ({receipt.base.slice(0, 7)} + {receipt.lanes.length} lanes, tree {receipt.tree.checked.slice(0, 7)}).{' '}
          {receipt.tree.identical ? `The landed tree is the same tree (${receipt.tree.landed.slice(0, 7)}).` : `The landed tree is ${receipt.tree.landed.slice(0, 7) || 'unknown'} — not the checked one; run the checks on ${receipt.into}.`}
          {' '}<button type="button" className="orch__mini" {...shellControl(() => setShowOutput(!showOutput))}>{showOutput ? 'Hide output' : 'Its output'}</button>
        </p>
      )}
      {showOutput && witness !== undefined && <CheckRunOutput outputId={witness.outputId} subject="the combined tree" fallback="This run's output record has been pruned." />}
    </div>
  )
}
