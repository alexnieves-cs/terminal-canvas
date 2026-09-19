import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isWatcherPanel } from '@renderer/panels/panels'
import { getWatch } from '@renderer/watcher/watcher-store'
import { useChat } from '@renderer/chat/chat-store'
import { shellControl } from '@renderer/shell/shell-control'
import { EmptyState } from '@renderer/shell/EmptyState'
import { KindFile } from '@renderer/icons'
import { outward } from '@shared/outward'
import { displayPath } from '@shared/display-path'
import type { PersistedWorkItem } from '@shared/work-items'
import type { ReviewDiff, ReviewFile, ReviewResult, ReviewSection } from '@shared/review'
import type { ReviewIdentity } from '@shared/review-identity'
import { laneSection, type ReviewHandoff } from '@shared/review-readiness'
import {
  bindCheckFreshness, checkEvidence, checkWords, checksFromLedger, checksFromWatchers, claimsFromTranscript,
  type CheckEvidence, type CheckRecord
} from '@shared/check-evidence'
import { WORKBENCH_TABS, clampWorkbenchHeight, type WorkbenchTab } from '@shared/orchestrate-prefs'
import type { WorktreeListRow } from '@shared/ipc-contract'
import { orchLogsCoverage } from './orchestration-model'

/**
 * M287. THE WORKBENCH — Orchestrate's bottom strip: Changes · Checks · Output,
 * bound to the selection or pinned to a named subject, resizable by its top
 * edge, its height and tab persisted per workspace by the view that owns it.
 *
 * THREE TABS, NOT FIVE. Artifacts and Timeline are Phase E's and are not
 * stubbed as empty tabs here: an empty tab is a promise the page cannot keep,
 * and `verify:orchestration workbench.1` pins the list to these three.
 *
 * TWO KINDS OF SUBJECT, TWO READS. A SESSION subject reads `review.panel`
 * (its own baseline) — Phase A's read, moved down here. A TASK subject with a
 * lane reads `review.across` and picks its lane's section with `laneSection`
 * — the SAME read `useTaskHandoffs` judges the card by — so the identity this
 * strip shows and the identity the canvas's card recorded are one
 * computation's answers, never two. The freshness line and Mark reviewed use
 * the canvas's handoff (`taskHandoffOf`) outright, for the reason
 * `ReviewTaskContext.paths` gives: a second signature is a second author.
 *
 * NOTHING HERE WRITES THE TREE. Commit and discard stay on the review node
 * ("Review on canvas"); the one mutation this strip makes is the person's
 * mark, through `onPatchWorkItem`. The brief is READ here and edited in the
 * inspector; neither launches anything.
 *
 * EVERY UNAVAILABLE FACT IS A SENTENCE: a non-git folder, a lane that has not
 * started, a missing baseline, a ledger nobody could read, a session with no
 * mark to be fresh about. An empty box would be a claim of "nothing".
 */

export type BenchSubject =
  | { kind: 'session'; id: string; title: string }
  | { kind: 'task'; itemId: string; title: string; lane?: { id: string; path: string; root: string; branch: string }; chatId?: string; memberIds: readonly string[] }

export function benchSubjectKey(s: BenchSubject | null): string {
  if (s === null) return ''
  return s.kind === 'session' ? `session:${s.id}` : `task:${s.itemId}:${s.lane?.id ?? ''}`
}

export interface OrchWorkbenchProps {
  subject: BenchSubject | null
  /** The subject the SELECTION names now, for the "bound to / pinned to" line and the pin button. */
  current: BenchSubject | null
  pinned: BenchSubject | null
  onPin: (s: BenchSubject | null) => void
  tab: WorkbenchTab
  onTab: (t: WorkbenchTab) => void
  height: number
  onHeight: (h: number) => void
  panels: readonly Panel[]
  workItems: readonly PersistedWorkItem[]
  worktrees: readonly WorktreeListRow[]
  taskHandoffOf?: (itemId: string) => ReviewHandoff | undefined
  onRefreshTaskHandoffs?: () => void
  onPatchWorkItem?: (itemId: string, fields: Partial<PersistedWorkItem>) => void
  onReviewOnCanvas?: (panelId: string) => void
  onJump: (id: string) => void
  onShowCanvas?: () => void
  /** Phase A's output mirror, owned by the view (it also feeds the scene's terminal card). */
  output: { panelId: string | null; title: string | undefined; command: string | undefined; lines: readonly string[] }
  /** Bumped by the view when a chat turn ends, so reads refresh without a watch. */
  refresh: number
}

/* ── Changes ─────────────────────────────────────────────────────────────── */

type ChangesRead =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'no-lane' }
  | { kind: 'lane-missing' }
  | { kind: 'result'; result: ReviewResult; repoRoot: string; base: string | undefined; sectionNote?: string }

type DiffRead =
  | { kind: 'none' }
  | { kind: 'loading'; key: string }
  | { kind: 'no-base'; key: string }
  | { kind: 'diff'; key: string; diff: ReviewDiff }

/**
 * The subject's changes, tagged with the subject they were asked for and
 * dropped if it moved meanwhile — rapid selection must never put one task's
 * diff under another's name (Phase A's rule, kept).
 */
function useChanges(subject: BenchSubject | null, active: boolean, refresh: number): { read: ChangesRead; diff: DiffRead; openFile: (f: ReviewFile) => void } {
  const [read, setRead] = useState<ChangesRead>({ kind: 'idle' })
  const [diff, setDiff] = useState<DiffRead>({ kind: 'none' })
  const key = benchSubjectKey(subject)
  const keyRef = useRef(key)
  keyRef.current = key
  const readRef = useRef(read)
  readRef.current = read
  useEffect(() => {
    setDiff({ kind: 'none' })
    if (!active || subject === null || typeof window.canvas?.review?.panel !== 'function') { setRead({ kind: 'idle' }); return }
    let live = true
    const asked = key
    setRead({ kind: 'loading' })
    const land = (r: ChangesRead): void => { if (live && keyRef.current === asked) setRead(r) }
    if (subject.kind === 'session') {
      void Promise.all([window.canvas.review.panel(subject.id), window.canvas.review.baseline(subject.id)]).then(
        ([result, baseline]) => land({ kind: 'result', result, repoRoot: result.kind === 'changes' || result.kind === 'shared' || result.kind === 'clean' ? result.root : '', base: baseline?.sha }),
        () => land({ kind: 'result', result: { kind: 'repo-unreadable', detail: 'the review could not be read' }, repoRoot: '', base: undefined })
      )
    } else if (subject.lane === undefined) {
      land({ kind: 'no-lane' })
    } else {
      const lane = subject.lane
      void window.canvas.review.across(lane.root).then(
        (across) => {
          if (across.kind === 'git-missing') { land({ kind: 'result', result: { kind: 'git-missing' }, repoRoot: lane.path, base: undefined }); return }
          if (across.kind === 'unreadable') { land({ kind: 'result', result: { kind: 'repo-unreadable', detail: across.detail }, repoRoot: lane.path, base: undefined }); return }
          const section: ReviewSection | undefined = laneSection(across.sections, lane.path)
          if (section === undefined) { land({ kind: 'lane-missing' }); return }
          const r = section.result
          const base = r.kind === 'changes' || r.kind === 'shared' || r.kind === 'clean' ? r.identity?.base : undefined
          land({ kind: 'result', result: r, repoRoot: section.path, base, ...(section.note === undefined ? {} : { sectionNote: section.note }) })
        },
        () => land({ kind: 'result', result: { kind: 'repo-unreadable', detail: 'the lane could not be read' }, repoRoot: lane.path, base: undefined })
      )
    }
    return () => { live = false }
  }, [key, active, refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const openFile = useCallback((f: ReviewFile): void => {
    const asked = keyRef.current
    const r = readRef.current
    if (r.kind !== 'result') return
    const dkey = `${asked}:${f.path}`
    // A lane section carries its fork point only inside its identity: with no
    // identity there is no sha to diff against, and that is said, not guessed.
    if (r.base === undefined) { setDiff({ kind: 'no-base', key: dkey }); return }
    setDiff({ kind: 'loading', key: dkey })
    void window.canvas.review.diff({ repoRoot: r.repoRoot, baselineSha: r.base, path: f.path, untracked: f.untracked }).then(
      (d) => { if (keyRef.current === asked) setDiff({ kind: 'diff', key: dkey, diff: d }) },
      () => { if (keyRef.current === asked) setDiff({ kind: 'diff', key: dkey, diff: { kind: 'unavailable' } }) }
    )
  }, [])
  return { read, diff, openFile }
}

/** Every arm named, none rendered as an error it is not (Phase A's words, kept). */
function changesWords(result: ReviewResult, subject: BenchSubject): string {
  const since = subject.kind === 'session' ? 'since this session started' : 'since the lane forked from the main tree'
  if (result.kind === 'changes') return `${result.files.length} changed file${result.files.length === 1 ? '' : 's'} · +${result.added} −${result.removed} ${since}`
  if (result.kind === 'shared') return `${result.files.length} changed file${result.files.length === 1 ? '' : 's'} in a repository ${result.panelCount} sessions share — authorship is ambiguous, so none is attributed to this one`
  if (result.kind === 'clean') return `No changes ${since}`
  if (result.kind === 'never-started') return 'This session has not run yet, so it has no baseline to review against'
  if (result.kind === 'not-a-repo') return 'Not in a git repository — there is no diff to review, and no revision to bind a check to'
  if (result.kind === 'git-missing') return 'git is not available, so changes cannot be read'
  if (result.kind === 'baseline-lost') return 'The starting point of this review is gone from the repository'
  return `git could not read the repository: ${result.detail}`
}

/** A flat path list as a tree: directories once, files under them, sorted. */
function fileTree(files: readonly ReviewFile[]): { dir: string; files: ReviewFile[] }[] {
  const byDir = new Map<string, ReviewFile[]>()
  for (const f of files) {
    const i = f.path.lastIndexOf('/')
    const dir = i === -1 ? '' : f.path.slice(0, i)
    const list = byDir.get(dir) ?? []
    list.push(f)
    byDir.set(dir, list)
  }
  return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, list]) => ({ dir, files: list.sort((a, b) => a.path.localeCompare(b.path)) }))
}

/* ── Checks ──────────────────────────────────────────────────────────────── */

const LEDGER_ROWS_PER_PANEL = 50

function useChecks(subject: BenchSubject | null, active: boolean, panels: readonly Panel[], worktrees: readonly WorktreeListRow[], refresh: number): {
  evidence: CheckEvidence | null
  identities: ReadonlyMap<string, ReviewIdentity | undefined>
} {
  const [rows, setRows] = useState<{ key: string; rows: import('@shared/run-ledger').RunRow[]; unreadable: boolean; panels: number } | null>(null)
  const [identities, setIdentities] = useState<Map<string, ReviewIdentity | undefined>>(() => new Map())
  const key = benchSubjectKey(subject)
  const ledgerIds = useMemo(() => {
    if (subject === null) return []
    if (subject.kind === 'session') return [subject.id]
    return [...new Set([...subject.memberIds, ...(subject.chatId === undefined ? [] : [subject.chatId])])]
  }, [subject])
  const idsKey = ledgerIds.join(' ')
  useEffect(() => {
    if (!active || subject === null) { setRows(null); return }
    let live = true
    const asked = key
    if (ledgerIds.length === 0 || typeof window.canvas?.ledger?.list !== 'function') { setRows({ key: asked, rows: [], unreadable: false, panels: 0 }); return }
    void Promise.allSettled(ledgerIds.map((id) => window.canvas.ledger.list(id, LEDGER_ROWS_PER_PANEL))).then((settled) => {
      if (!live) return
      setRows({ key: asked, rows: settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])), unreadable: settled.some((r) => r.status === 'rejected'), panels: ledgerIds.length })
    })
    return () => { live = false }
  }, [key, idsKey, active, refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const chat = useChat(subject === null ? '' : subject.kind === 'session' ? subject.id : subject.chatId ?? '')
  const lanePath = subject === null ? undefined : subject.kind === 'task' ? subject.lane?.path : undefined
  const worktreeOf = useCallback((cwd: string): string | undefined => {
    let best: WorktreeListRow | undefined
    for (const w of worktrees) if ((cwd === w.path || cwd.startsWith(`${w.path}/`)) && (best === undefined || w.path.length > best.path.length)) best = w
    return best?.branch
  }, [worktrees])
  const raw = useMemo<CheckRecord[]>(() => {
    if (subject === null || rows === null || rows.key !== key) return []
    const ledger = checksFromLedger(rows.rows, lanePath, worktreeOf)
    const watchers = checksFromWatchers(panels.filter(isWatcherPanel).map((p) => {
      const w = getWatch(p.rect.id)
      return { id: p.rect.id, cwd: p.watch.cwd, command: p.watch.command, args: p.watch.args, status: w.status, exitCode: w.exitCode, signal: w.signal, startedAt: w.startedAt, endedAt: w.endedAt, tested: w.tested }
    }), lanePath ?? (subject.kind === 'task' ? undefined : undefined), worktreeOf)
    // A session subject's watchers are the ones in ITS directory — a watcher
    // elsewhere on the canvas is somebody else's check.
    return [...ledger, ...(subject.kind === 'session' ? watchers.filter((w) => rows.rows.some((r) => r.cwd === w.context.cwd)) : watchers)]
  }, [subject, rows, key, lanePath, worktreeOf, panels, refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  // The identity NOW for every base a record tested, asked of main once per base.
  const bases = useMemo(() => [...new Set(raw.filter((c) => c.tested !== undefined).map((c) => `${c.context.cwd}\0${c.tested?.base ?? ''}`))], [raw])
  const basesKey = bases.join('\n')
  useEffect(() => {
    if (bases.length === 0 || typeof window.canvas?.review?.identity !== 'function') { setIdentities(new Map()); return }
    let live = true
    void Promise.all(bases.map(async (b) => {
      const [cwd, base] = b.split('\0') as [string, string]
      try { return [base, (await window.canvas.review.identity({ root: cwd, base })) ?? undefined] as const } catch { return [base, undefined] as const }
    })).then((pairs) => { if (live) setIdentities(new Map(pairs)) })
    return () => { live = false }
  }, [basesKey, refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const evidence = useMemo<CheckEvidence | null>(() => {
    if (subject === null || rows === null || rows.key !== key) return null
    const bound = bindCheckFreshness(raw, (base) => (identities.has(base) ? identities.get(base) : null))
    const claims = claimsFromTranscript(chat.turns)
    return checkEvidence(bound, claims, { ledgerRead: !rows.unreadable, ledgerPanels: rows.panels, transcriptRead: chat.turns.length > 0 || (subject.kind === 'session' ? true : subject.chatId !== undefined) })
  }, [subject, rows, key, raw, identities, chat.turns])
  return { evidence, identities }
}

function CheckOutput({ record }: { record: CheckRecord }): JSX.Element {
  const [tail, setTail] = useState<string[] | null>(null)
  useEffect(() => {
    if (record.source === 'watcher') { setTail(getWatch(record.panelId).tail.split('\n').slice(-40)); return }
    if (typeof window.canvas?.scrollback?.tail !== 'function') { setTail([]); return }
    let live = true
    void window.canvas.scrollback.tail({ panelId: record.panelId, lines: 40 }).then((got) => { if (live) setTail(got) }, () => { if (live) setTail([]) })
    return () => { live = false }
  }, [record.key, record.source, record.panelId])
  const text = tail === null ? null : outward(tail.join('\n'), `panel ${record.panelId}`).text
  return (
    <div className="orch__check-detail" data-orch-check-detail={record.key}>
      <dl className="orch__check-facts">
        <dt>Command</dt><dd><code>{record.command}</code></dd>
        <dt>Context</dt><dd>{displayPath(record.context.cwd).short}{record.context.worktree !== undefined ? ` · worktree ${record.context.worktree}` : ' · shared directory'}</dd>
        <dt>Outcome</dt><dd>{checkWords(record)}{record.note !== undefined ? ` — ${record.note}` : ''}</dd>
        <dt>Tested</dt><dd>{record.tested === undefined ? 'revision not recorded' : `${record.tested.base.slice(0, 10)} · content ${record.tested.content.slice(0, 8)}`}</dd>
        <dt>Witness</dt><dd>{record.source === 'watcher' ? 'a watcher this canvas ran' : 'a command this canvas watched exit'}</dd>
      </dl>
      <p className="orch__caption">{record.source === 'watcher' ? 'The run\'s output, its last lines:' : 'The ledger keeps no output bytes; this is the session\'s scrollback tail now, which may be later than the command:'}</p>
      <pre className="orch__term-log orch__term-log--check" aria-label="Check output">{text === null ? 'Reading output…' : text === '' ? 'No output was captured.' : text}</pre>
    </div>
  )
}

/* ── The strip ───────────────────────────────────────────────────────────── */

export function OrchWorkbench(props: OrchWorkbenchProps): JSX.Element {
  const { subject, current, pinned, onPin, tab, onTab, height, onHeight, panels, workItems, worktrees, taskHandoffOf, onRefreshTaskHandoffs, onPatchWorkItem, onReviewOnCanvas, onJump, onShowCanvas, output, refresh } = props
  const [localRefresh, setLocalRefresh] = useState(0)
  const changes = useChanges(subject, tab === 'changes', refresh + localRefresh)
  const checks = useChecks(subject, tab === 'checks', panels, worktrees, refresh + localRefresh)
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null)

  // The top edge drags. Height is measured from the strip's bottom, so dragging
  // UP grows it; pointer capture keeps the gesture when the cursor leaves the
  // 6px handle, and the value is clamped by the same rule the parser applies.
  const drag = useRef<{ y: number; h: number } | null>(null)
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    drag.current = { y: e.clientY, h: height }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current === null) return
    onHeight(clampWorkbenchHeight(drag.current.h + (drag.current.y - e.clientY)))
  }
  const onHandleUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current === null) return
    drag.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
  }

  const item = subject?.kind === 'task' ? workItems.find((w) => w.id === subject.itemId) : undefined
  const handoff = subject?.kind === 'task' && taskHandoffOf !== undefined ? taskHandoffOf(subject.itemId) : undefined
  const subjectGone = pinned !== null && (pinned.kind === 'session' ? !panels.some((p) => p.rect.id === pinned.id) : !workItems.some((w) => w.id === pinned.itemId))
  const boundLine = pinned !== null
    ? `Pinned to ${pinned.title}${subjectGone ? ' — which is no longer on this canvas' : ''}`
    : current !== null ? `Bound to the selection · ${current.title}` : 'Bound to the selection · nothing selected'

  /** M285's freshness, in words, from the canvas's own handoff. */
  const freshness = ((): { word: string; standing: string } | null => {
    if (subject === null || subject.kind !== 'task') return null
    if (subject.lane === undefined) return { standing: 'no-lane', word: 'No review mark can be kept until the task has a lane' }
    if (handoff === undefined) return { standing: 'unread', word: 'Freshness not read yet — the canvas has not judged this lane' }
    const files = item?.reviewed?.files
    switch (handoff.standing) {
      case 'none': return { standing: 'none', word: 'Not reviewed yet' }
      case 'current': return { standing: 'current', word: `Reviewed · current — you read ${files ?? 0} file${files === 1 ? '' : 's'} and the content has not moved since` }
      case 'stale': return { standing: 'stale', word: `Reviewed · stale — the content has moved since you read ${files ?? 0} file${files === 1 ? '' : 's'}` }
      default: return { standing: 'unknown', word: 'Reviewed once · freshness unknown — that mark predates content identity; mark again to make it checkable' }
    }
  })()
  const canMark = subject?.kind === 'task' && handoff !== undefined && handoff.changes !== undefined && (handoff.state === 'ready' || handoff.state === 'shared') && onPatchWorkItem !== undefined
  const mark = (): void => {
    if (!canMark || subject === null || subject.kind !== 'task' || handoff?.changes === undefined || onPatchWorkItem === undefined) return
    const c = handoff.changes
    onPatchWorkItem(subject.itemId, { reviewed: { at: Date.now(), signature: c.signature, files: c.files, ...(c.identity === undefined ? {} : { identity: c.identity }) } })
    onRefreshTaskHandoffs?.()
    setLocalRefresh((n) => n + 1)
  }

  const reviewOnCanvasId = subject === null ? null : subject.kind === 'session' ? subject.id : subject.chatId ?? null
  const dataSubject = subject === null ? '' : subject.kind === 'session' ? subject.id : subject.chatId ?? subject.itemId

  return (
    <section className="orch__bench" data-orch-workbench data-orch-bench-tab={tab} data-orch-bench-subject={benchSubjectKey(subject)} style={{ height: `${height}px` }} aria-label="Workbench">
      <div className="orch__bench-handle" role="separator" aria-orientation="horizontal" aria-label="Resize the workbench" data-orch-bench-handle
        onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
        onDoubleClick={() => onHeight(clampWorkbenchHeight(240))} />
      <div className="orch__bench-head">
        <div className="orch__tabs orch__tabs--bench" role="tablist" aria-label="Workbench tabs">
          {WORKBENCH_TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} data-orch-bench-tab-button={t}
              className={`orch__tab${tab === t ? ' orch__tab--on' : ''}`} {...shellControl(() => onTab(t))}>
              {t === 'changes' ? 'Changes' : t === 'checks' ? 'Checks' : 'Output'}
            </button>
          ))}
        </div>
        <span className="orch__caption orch__bench-bound" data-orch-bench-bound={pinned !== null ? 'pinned' : 'selection'}>{boundLine}</span>
        <span className="orch__bench-actions">
          {pinned !== null
            ? <button type="button" className="orch__mini" data-orch-bench-pin="off" {...shellControl(() => onPin(null))}>Unpin</button>
            : <button type="button" className="orch__mini" data-orch-bench-pin="on" disabled={current === null} title={current === null ? 'select a session or the task to pin' : `keep the workbench on ${current.title} while you look around`} {...shellControl(() => { if (current !== null) onPin(current) })}>Pin</button>}
          <button type="button" className="orch__mini" data-orch-bench-refresh {...shellControl(() => { setLocalRefresh((n) => n + 1); onRefreshTaskHandoffs?.() })}>Refresh</button>
        </span>
      </div>

      <div className="orch__bench-body" data-orch-density="detail">
        {subject === null ? (
          <p className="orch__caption">Select a chat or terminal session, or the task, to fill the workbench.</p>
        ) : tab === 'changes' ? (
          <div className="orch__bench-changes" data-orch-review={dataSubject}>
            <div className="orch__bench-col orch__bench-col--files">
              {freshness !== null && (
                <p className="orch__bench-fresh" data-orch-fresh={freshness.standing}>{freshness.word}</p>
              )}
              {changes.read.kind === 'loading' && <p className="orch__caption" role="status">Reading changes…</p>}
              {changes.read.kind === 'no-lane' && <p className="orch__review-words" data-orch-review-kind="no-lane">This task has no lane yet — nothing has been started, so there is no diff to show.</p>}
              {changes.read.kind === 'lane-missing' && <p className="orch__review-words" data-orch-review-kind="lane-missing">The task's worktree is not listed by git any more — it was removed outside this app.</p>}
              {changes.read.kind === 'result' && (
                <>
                  <p className="orch__review-words" data-orch-review-kind={changes.read.result.kind}>{changesWords(changes.read.result, subject)}{changes.read.sectionNote !== undefined ? ` — ${changes.read.sectionNote}` : ''}</p>
                  {(changes.read.result.kind === 'changes' || changes.read.result.kind === 'shared') && (
                    <ul className="orch__review-files orch__bench-tree" aria-label="Changed files">
                      {fileTree(changes.read.result.files).map(({ dir, files }) => (
                        <li key={dir === '' ? '.' : dir} className="orch__bench-dir">
                          {dir !== '' && <span className="orch__bench-dirname">{dir}/</span>}
                          <ul>
                            {files.map((f) => (
                              <li key={f.path}>
                                <button type="button" className={`orch__activity-row${changes.diff.kind !== 'none' && changes.diff.key === `${benchSubjectKey(subject)}:${f.path}` ? ' orch__roster-row--on' : ''}`}
                                  data-orch-review-file={f.path} {...shellControl(() => changes.openFile(f))}>
                                  <span className="orch__roster-kind" aria-hidden="true"><KindFile /></span>
                                  <span className="orch__activity-title">{f.path.slice(dir === '' ? 0 : dir.length + 1)}</span>
                                  <span className="orch__activity-detail">{f.binary ? 'binary' : f.untracked ? 'new file' : `+${f.added} −${f.removed}`}{f.renamedFrom !== undefined ? ` · was ${f.renamedFrom}` : ''}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <div className="orch__roster-actions">
                {canMark && <button type="button" className="orch__mini" data-orch-bench-mark {...shellControl(mark)}>{item?.reviewed === undefined ? 'Mark reviewed' : 'Mark reviewed again'}</button>}
                {onReviewOnCanvas !== undefined && reviewOnCanvasId !== null && (
                  <button type="button" className="orch__mini" data-orch-review-canvas {...shellControl(() => onReviewOnCanvas(reviewOnCanvasId))}>Review on canvas</button>
                )}
              </div>
            </div>
            <div className="orch__bench-col orch__bench-col--diff">
              {changes.diff.kind === 'none' && changes.read.kind === 'result' && (changes.read.result.kind === 'changes' || changes.read.result.kind === 'shared') && <p className="orch__caption">Choose a file to read its diff.</p>}
              {changes.diff.kind === 'loading' && <p className="orch__caption" role="status">Reading the diff…</p>}
              {changes.diff.kind === 'no-base' && <p className="orch__caption">No revision to diff against — the review's starting point could not be read.</p>}
              {changes.diff.kind === 'diff' && (
                changes.diff.diff.kind === 'diff' ? (
                  <pre className="orch__diff orch__diff--bench" data-orch-diff aria-label="Diff">
                    {changes.diff.diff.lines.map((line, i) => (
                      <span key={i} className={`orch__diff-line orch__diff-line--${line.kind}`}>{outward(line.text, `panel ${dataSubject}`).text}{'\n'}</span>
                    ))}
                    {changes.diff.diff.truncated > 0 && <span className="orch__diff-line orch__diff-line--meta">{`… ${changes.diff.diff.truncated} more lines — open the review on canvas for the whole diff`}</span>}
                  </pre>
                ) : <p className="orch__caption">{changes.diff.diff.kind === 'binary' ? 'A binary file — no text diff to show.' : 'The diff could not be read.'}</p>
              )}
            </div>
            <div className="orch__bench-col orch__bench-col--brief" data-orch-bench-brief>
              <div className="orch__section-title">Brief</div>
              {subject.kind !== 'task' ? (
                <p className="orch__caption">A session has no brief — a brief belongs to a task.</p>
              ) : (
                <>
                  <p className="orch__bench-brief-text">{item?.brief !== undefined && item.brief !== '' ? item.brief : 'No brief yet — write one in the inspector.'}</p>
                  <div className="orch__section-title">Acceptance criteria</div>
                  {item?.criteria !== undefined && item.criteria.length > 0
                    ? <ol className="orch__bench-criteria">{item.criteria.map((c, i) => <li key={i}>{c}</li>)}</ol>
                    : <p className="orch__caption">None written yet.</p>}
                </>
              )}
            </div>
          </div>
        ) : tab === 'checks' ? (
          <div className="orch__bench-checks" data-orch-checks={dataSubject}>
            {checks.evidence === null ? (
              <p className="orch__caption" role="status">Reading checks…</p>
            ) : (
              <>
                {checks.evidence.unavailable !== undefined && (
                  <ul className="orch__bench-unavailable" data-orch-checks-unavailable>
                    {checks.evidence.unavailable.map((s, i) => <li key={i} className="orch__caption">{s}</li>)}
                  </ul>
                )}
                {checks.evidence.checks.length > 0 && (
                  <ul className="orch__review-files" aria-label="Checks">
                    {checks.evidence.checks.map((c) => (
                      <li key={c.key} data-orch-check={c.key} data-orch-check-outcome={c.outcome}>
                        <button type="button" className={`orch__activity-row orch__check-row${expandedCheck === c.key ? ' orch__roster-row--on' : ''}`}
                          aria-expanded={expandedCheck === c.key} {...shellControl(() => setExpandedCheck((cur) => (cur === c.key ? null : c.key)))}>
                          <span className="orch__check-outcome" data-outcome={c.outcome}>{checkWords(c)}</span>
                          <span className="orch__activity-title"><code>{c.command}</code></span>
                          <span className="orch__activity-detail">{c.source === 'watcher' ? 'watcher' : 'this canvas ran it'} · {displayPath(c.context.cwd).short}{c.context.worktree !== undefined ? ` · ${c.context.worktree}` : ''}{c.note !== undefined ? ` · ${c.note}` : ''}</span>
                        </button>
                        {expandedCheck === c.key && <CheckOutput record={c} />}
                      </li>
                    ))}
                  </ul>
                )}
                {checks.evidence.claims.length > 0 && (
                  <>
                    <div className="orch__section-title">Claims — the agent's own account, not checks this canvas ran</div>
                    <ul className="orch__review-files" aria-label="Agent claims" data-orch-claims>
                      {checks.evidence.claims.map((cl, i) => (
                        <li key={`${cl.command}:${cl.at}:${i}`} className="orch__activity-row orch__check-row orch__check-row--claim" data-orch-claim={cl.claimed} title={cl.source}>
                          <span className="orch__check-outcome" data-outcome="claim">claim · {cl.claimed === 'ok' ? 'reported ok' : cl.claimed === 'error' ? 'reported an error' : 'unanswered'}</span>
                          <span className="orch__activity-title"><code>{cl.command}</code></span>
                          <span className="orch__activity-detail">the agent asked for this; its CLI's word, not a result</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="orch__term-tab">
            <p className="orch__caption">{orchLogsCoverage()}</p>
            {output.panelId === null ? (
              <EmptyState id="orch-terminal" onVerb={onShowCanvas} />
            ) : (
              <>
                <button type="button" className="orch__term-card" {...shellControl(() => { if (output.panelId !== null) onJump(output.panelId) })}>
                  <span className="orch__float-title">{output.title}</span>
                  {output.command !== undefined && output.command !== '' && <code className="orch__float-code">{output.command}</code>}
                  <span className="orch__task-jump">Jump to panel</span>
                </button>
                <pre className="orch__term-log" aria-label="Scrollback tail">
                  {output.lines.length === 0 ? 'No recorded output yet for this panel.' : output.lines.join('\n')}
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
