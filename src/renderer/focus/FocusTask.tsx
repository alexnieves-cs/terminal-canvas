import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isBrowserPanel, isChatPanel, isTerminalPanel } from '@renderer/panels/panels'
import type { PersistedWorkItem } from '@shared/work-items'
import type { ReviewHandoff } from '@shared/review-readiness'
import type { DiffLine } from '@shared/review'
import type { CheckRecord } from '@shared/check-evidence'
import { checkWords } from '@shared/check-evidence'
import { checkOutputDisplay } from '@shared/check-output'
import { outward } from '@shared/outward'
import { displayPath } from '@shared/display-path'
import { BACKENDS, backendOf, type AgentBackend } from '@shared/agent-backends'
import { sendRefusalSentence } from '@shared/agent-session'
import { agentWorkingOf, commentAnchorOf, commentPlace, composeFollowUp, openComments, type ReviewComment } from '@shared/review-comments'
import { shellControl } from '@renderer/shell/shell-control'
import type { TaskGroup } from '@renderer/shell/task-queue'
import { ChatConversation } from '@renderer/chat/ChatConversation'
import { claimConversation } from '@renderer/chat/conversation-host'
import { insertIntoComposer, onChatTurnEnd } from '@renderer/chat/chat-store'
import { OrchWorkbench, type BenchSubject } from '@renderer/orchestration/OrchWorkbench'
import { useOrchOutput, useOrchWorktrees } from '@renderer/orchestration/OrchestrationView'
import { TaskReviewPanel } from '@renderer/review/TaskReviewPanel'
import type { ReviewTaskContext } from '@renderer/review/ReviewNode'
import { benchTabOf, clampSplit, focusHeaderOf, openingSide, sideLabel, FOCUS_SIDES, type FocusSide } from './focus-model'
import { readFocusPrefs, writeFocusPrefs } from './focus-prefs-store'

/**
 * M324. A TASK'S FOCUS VIEW — one task opened into a stable workspace.
 *
 * The CONVERSATION on one side: the same `ChatConversation` the canvas panel
 * renders (its queue, its approvals, its draft), claimed while this page is
 * open so the panel behind the page does not mount a second composer. The
 * EVIDENCE on the other: the Orchestrate workbench's own reads (Changes,
 * Checks, Output, Artifacts) bound to this task, the review node's own
 * review panel, and the task's bound preview when it has one. Nothing here
 * reads git or the ledger a second way — each side is a component that
 * already has one reader, handed this task as its subject.
 *
 * The HEADER keeps the task's title, repository, what is blocking it and
 * the next action on screen the whole time, in the queue's and the
 * handoff's own words (`focusHeaderOf`); the next action's press stays
 * inside the page — it opens the side or the conversation that answers it.
 *
 * THE LOOP THE PAGE EXISTS FOR — read a diff, comment on a line, send the
 * comments (or a failed check) as a correction, watch the next answer and
 * the next diff — never leaves it: a comment is written on the diff line
 * here, the follow-up lands in the conversation here, and a turn ending
 * re-reads the evidence here.
 *
 * It is a PAGE over the canvas (M268): the canvas stays mounted and its
 * camera is untouched, so Back returns to exactly the view that was left.
 * The split, the side, the open file and its scroll are remembered per task
 * (`focus-prefs-store.ts`).
 */

export interface FocusTaskProps {
  item: PersistedWorkItem
  panels: readonly Panel[]
  workItems: readonly PersistedWorkItem[]
  /** The task's member panels (M203's membership). */
  memberIds: readonly string[]
  /** The queue's group for this task, when it needs the person. */
  group?: TaskGroup
  handoff?: ReviewHandoff
  /** The review node's task context — the comment and follow-up doors. Absent for a task with no lane. */
  taskContext?: ReviewTaskContext
  backendAvailable(backend: AgentBackend): boolean
  teammateName(id: string | undefined): string | undefined
  taskHandoffOf(itemId: string): ReviewHandoff | undefined
  onRefreshTaskHandoffs(): void
  onPatchWorkItem(itemId: string, fields: Partial<PersistedWorkItem>): void
  onBack(): void
  /** Leave for the canvas and frame the task there. */
  onShowOnCanvas(itemId: string): void
  /** Leave for the canvas with a panel selected. */
  onJump(panelId: string): void
  /** Leave for the canvas and open a file there (the canvas's own file verb). */
  onOpenPath(path: string): void
  /** Open Start work for a task that has no conversation yet. */
  onStartWork(itemId: string): void
}

const LAST_LINES = 12

export function FocusTask(props: FocusTaskProps): JSX.Element {
  const { item, panels, workItems, memberIds } = props
  const itemId = item.id
  const chat = useMemo(() => {
    const p = item.panelId === undefined ? undefined : panels.find((x) => x.rect.id === item.panelId)
    return p !== undefined && isChatPanel(p) ? p : undefined
  }, [item.panelId, panels])
  const chatId = chat?.rect.id
  // One composer per chat: the canvas's panel stands aside while this page holds it.
  useEffect(() => (chatId === undefined ? undefined : claimConversation(chatId)), [chatId])

  const previews = useMemo(() => panels.filter(isBrowserPanel).filter((p) => memberIds.includes(p.rect.id) && p.url !== ''), [panels, memberIds])
  // `page`, not a field named for the binding: the page is the pane's address,
  // and this view never reads the binding itself (`verify:meta preview-readers.1`).
  const has = { page: previews.length > 0, review: props.taskContext !== undefined }
  const sides = FOCUS_SIDES.filter((s) => (s === 'preview' ? has.page : s === 'review' ? has.review : true))

  const [prefs, setPrefs] = useState(() => readFocusPrefs(itemId))
  const [side, setSideState] = useState<FocusSide>(() => openingSide(readFocusPrefs(itemId), has))
  // A task switched under a mounted page reads its OWN prefs.
  const shownItem = useRef(itemId)
  useEffect(() => {
    if (shownItem.current === itemId) return
    shownItem.current = itemId
    const next = readFocusPrefs(itemId)
    setPrefs(next)
    setSideState(openingSide(next, has))
  }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps
  const patch = useCallback((p: Parameters<typeof writeFocusPrefs>[1]): void => { setPrefs(writeFocusPrefs(itemId, p)) }, [itemId])
  const setSide = (s: FocusSide): void => { setSideState(s); patch({ side: s }) }

  // The evidence re-reads when the conversation's turn ends — the next result is inspected where it lands.
  const [refresh, setRefresh] = useState(0)
  useEffect(() => onChatTurnEnd((id) => { if (id === chatId || memberIds.includes(id)) setRefresh((n) => n + 1) }), [chatId, memberIds])

  const worktrees = useOrchWorktrees(workItems)
  const lane = item.worktreeId === undefined ? undefined : worktrees.find((w) => w.id === item.worktreeId)
  const subject: BenchSubject = {
    kind: 'task', itemId, title: item.title, memberIds,
    ...(lane === undefined ? {} : { lane: { id: lane.id, path: lane.path, root: lane.root, branch: lane.branch } }),
    ...(chatId === undefined ? {} : { chatId })
  }
  // Output: the task's terminal when it has one (a build, a server), its conversation otherwise.
  const terminal = panels.find((p) => memberIds.includes(p.rect.id) && isTerminalPanel(p))
  const outputId = terminal?.rect.id ?? chatId ?? null
  const outputLines = useOrchOutput(outputId, terminal !== undefined ? 'terminal' : 'chat', side === 'output')
  const outputPanel = outputId === null ? undefined : panels.find((p) => p.rect.id === outputId)

  const repository = lane !== undefined ? displayPath(lane.root).short : chat !== undefined ? displayPath(chat.chat.cwd).short : item.key ?? 'no repository yet'
  const header = focusHeaderOf({
    ...(props.group === undefined ? {} : { group: props.group }),
    ...(props.handoff === undefined ? {} : { handoff: props.handoff }),
    hasConversation: chat !== undefined
  })
  const composerRef = useRef<HTMLElement | null>(null)
  const goConversation = (): void => { composerRef.current?.querySelector<HTMLTextAreaElement>('[data-chat-input]')?.focus({ preventScroll: true }) }
  const go = (): void => {
    if (header.go === null) { if (chat === undefined) props.onStartWork(itemId); return }
    if (header.go.kind === 'conversation') goConversation()
    else setSide(header.go.side)
  }

  /* ── The split ── */
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; w: number; left: number } | null>(null)
  const [liveSplit, setLiveSplit] = useState<number | null>(null)
  const split = liveSplit ?? prefs.split
  const onSplitDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const body = bodyRef.current
    if (e.button !== 0 || body === null) return
    const r = body.getBoundingClientRect()
    drag.current = { x: e.clientX, w: r.width, left: r.left }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* a synthetic pointer */ }
    e.preventDefault()
  }
  const onSplitMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (d === null || d.w <= 0) return
    setLiveSplit(clampSplit((e.clientX - d.left) / d.w))
  }
  const onSplitUp = (): void => {
    if (drag.current === null) return
    drag.current = null
    if (liveSplit !== null) patch({ split: liveSplit })
    setLiveSplit(null)
  }

  /* ── Review comments on the diff ── */
  const ctx = props.taskContext
  const comments = item.comments ?? []
  const [picked, setPicked] = useState<{ path: string; side: 'new' | 'old'; line: number; quote: string } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const openFile = prefs.file
  const commented = useMemo(() => new Set(comments.filter((c) => c.path === openFile && c.resolved !== true).map((c) => `${c.side}:${c.line}`)), [comments, openFile])
  const pickLine = (path: string, line: DiffLine): void => {
    const anchor = commentAnchorOf(line)
    if (anchor === null) return
    setPicked({ path, ...anchor })
    setCommentText('')
    setNote(null)
  }
  const addComment = (): void => {
    if (picked === null || ctx?.onComments === undefined || commentText.trim() === '') return
    const c: ReviewComment = { id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, path: picked.path, side: picked.side, line: picked.line, quote: picked.quote, body: commentText.trim(), at: Date.now() }
    ctx.onComments(itemId, [...comments, c])
    setPicked(null)
    setCommentText('')
  }
  const unsent = openComments(comments).filter((c) => c.sentAt === undefined)
  const commentFollowUp = composeFollowUp({ title: item.title, ...(item.brief === undefined ? {} : { brief: item.brief }), comments: unsent, failing: [], unmet: [] })
  const sendComments = (): void => {
    if (chatId === undefined || commentFollowUp === '') return
    const ids = new Set(unsent.map((c) => c.id))
    void Promise.resolve(window.canvas.agentSession.send(chatId, commentFollowUp, [])).then((answer) => {
      const refused = sendRefusalSentence(answer)
      if (refused !== null) { setNote(refused); return }
      const now = Date.now()
      ctx?.onComments?.(itemId, comments.map((c) => (ids.has(c.id) ? { ...c, sentAt: now } : c)))
      setNote(answer === 'queued' ? 'Sent — it waits in the conversation\'s list until this turn ends' : 'Sent to the conversation — the comments stay open until you resolve them')
    })
  }
  const draftComments = (): void => {
    if (chatId === undefined || commentFollowUp === '') return
    insertIntoComposer(chatId, commentFollowUp, { focus: true })
  }

  /* ── A failed check's follow-up, into the composer beside it ── */
  const checkFollowUp = (c: CheckRecord): void => {
    if (chatId === undefined) { setNote('This task has no conversation to send the failure to'); return }
    const compose = (lastLines?: string[]): void => {
      const text = composeFollowUp({ title: item.title, comments: [], failing: [{ command: c.command, ended: checkWords(c), ...(lastLines === undefined ? {} : { lastLines }) }], unmet: [] })
      insertIntoComposer(chatId, text, { focus: true })
    }
    const door = window.canvas?.ledger?.output
    if (c.outputId === undefined || typeof door !== 'function') { compose(); return }
    void door(c.outputId).then((read) => {
      if (read.kind !== 'ok') { compose(); return }
      const text = outward(checkOutputDisplay(read.record), `panel ${c.panelId}`).text
      compose(text.split('\n').filter((l) => l.trim() !== '').slice(-LAST_LINES))
    }, () => compose())
  }

  // The review panel's two conversation doors stay IN the page: an insert into
  // the composer beside it, never a jump to the canvas.
  const reviewContext: ReviewTaskContext | undefined = ctx === undefined ? undefined : {
    ...ctx,
    onDraftFollowUp: (_id, text) => { if (chatId !== undefined) insertIntoComposer(chatId, text, { focus: true }) },
    onContinue: (_id, paths) => { if (chatId !== undefined) insertIntoComposer(chatId, paths.length === 0 ? 'I have looked at the lane and it holds no changes. ' : `I have reviewed these changes:\n${paths.slice(0, 10).map((p) => `- ${p}`).join('\n')}\n\n`, { focus: true }) }
  }
  // The checks the workbench read for this subject, kept for the review side
  // (the same read — the review never asks a second time).
  const [laneChecks, setLaneChecks] = useState<readonly CheckRecord[] | null>(null)
  const press = (run: () => void) => (e: ReactMouseEvent): void => { e.preventDefault(); e.stopPropagation(); run() }

  // Esc goes back — unless a text field has the keyboard (Esc there is the field's).
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Escape') return
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, select, [contenteditable="true"]') !== null) return
    e.preventDefault()
    props.onBack()
  }

  const backend = chat === undefined ? undefined : backendOf(chat.chat)
  const benchTab = benchTabOf(side)
  const [previewIndex, setPreviewIndex] = useState(0)
  const preview = previews[Math.min(previewIndex, previews.length - 1)]

  return (
    <div className="focus-view" data-focus-task={itemId} data-focus-side={side} onKeyDown={onKey} role="region" aria-label={`Focus: ${item.title}`}>
      <header className="focus__head">
        <button type="button" className="focus__back" data-focus-back title="Back to where you were (Esc)" {...shellControl(props.onBack)}>← Back</button>
        <div className="focus__id">
          <h1 className="focus__title" data-focus-title title={item.title}>{item.title}</h1>
          <span className="focus__repo" data-focus-repo title={lane?.path ?? chat?.chat.cwd}>{repository}{lane !== undefined ? ` · ${lane.branch}` : ''}{backend !== undefined ? ` · ${BACKENDS[backend].label}` : ''}</span>
        </div>
        <div className="focus__state">
          {header.blocker !== null && <p className="focus__blocker" data-focus-blocker role="status">{header.blocker}</p>}
          <button type="button" className="focus__next" data-focus-next disabled={header.go === null && chat !== undefined}
            title={header.go === null ? header.next : `${header.next} — here, without leaving this page`} {...shellControl(go)}>
            <span className="focus__next-label">Next</span> {header.next}
          </button>
        </div>
        <button type="button" className="pf__verb pf__verb--word" data-focus-show-canvas title="Leave this page and frame the task on the canvas" {...shellControl(() => props.onShowOnCanvas(itemId))}>Show on canvas</button>
      </header>

      <div className="focus__body" ref={bodyRef} style={{ gridTemplateColumns: `${(split * 100).toFixed(1)}% 8px minmax(0, 1fr)` }}>
        <section className="focus__conversation" data-focus-conversation={chatId ?? ''} ref={composerRef} aria-label="Conversation">
          {chat !== undefined && backend !== undefined ? (
            // Keyed by the chat: a task switched under a mounted page is a NEW
            // conversation, and its draft, attachments and queue edit must not
            // carry over (nor the old draft be written under the new id).
            <ChatConversation key={chat.rect.id} id={chat.rect.id} chat={chat.chat} backend={backend} claudeAvailable={props.backendAvailable(backend)}
              {...(props.teammateName(chat.chat.teammateId) === undefined ? {} : { teammateName: props.teammateName(chat.chat.teammateId) as string })}
              taskId={itemId} />
          ) : (
            <div className="focus__empty" data-focus-no-conversation>
              <p>{item.panelId !== undefined ? 'This task\'s conversation was closed.' : 'This task has no conversation yet.'}</p>
              <button type="button" className="pf__verb pf__verb--word" data-focus-start {...shellControl(() => props.onStartWork(itemId))}>{item.panelId !== undefined ? 'Continue in a new conversation…' : 'Start work…'}</button>
            </div>
          )}
        </section>
        <div className="focus__split" role="separator" aria-orientation="vertical" aria-label="Resize the conversation" data-focus-split={split}
          onPointerDown={onSplitDown} onPointerMove={onSplitMove} onPointerUp={onSplitUp} onPointerCancel={onSplitUp}
          onDoubleClick={() => patch({ split: 0.42 })} />
        <section className="focus__evidence" aria-label="Evidence">
          <div className="orch__tabs focus__tabs" role="tablist" aria-label="Evidence">
            {sides.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={side === s} data-focus-side-button={s}
                className={`orch__tab${side === s ? ' orch__tab--on' : ''}`} {...shellControl(() => setSide(s))}>
                {sideLabel(s)}{s === 'review' && unsent.length > 0 ? ` · ${unsent.length}` : ''}
              </button>
            ))}
          </div>
          <div className="focus__pane">
            {benchTab !== null ? (
              <OrchWorkbench
                subject={subject} current={subject} pinned={null} onPin={() => {}}
                tab={benchTab} onTab={() => {}} height={0} onHeight={() => {}} open onOpen={() => {}} reading
                panels={panels} workItems={workItems} worktrees={worktrees}
                taskHandoffOf={props.taskHandoffOf} onRefreshTaskHandoffs={props.onRefreshTaskHandoffs}
                onPatchWorkItem={props.onPatchWorkItem} onOpenPath={props.onOpenPath} onJump={props.onJump}
                output={{ panelId: outputId, title: outputPanel?.title ?? undefined, command: undefined, lines: outputLines }}
                refresh={refresh}
                onChecks={(_key, checks) => { if (checks !== null) setLaneChecks(checks) }}
                focus={{
                  ...(prefs.file === undefined ? {} : { file: prefs.file }),
                  ...(prefs.scroll === undefined ? {} : { scroll: prefs.scroll }),
                  onFile: (path) => { if (path !== prefs.file) patch({ file: path }) },
                  onScroll: (path, top) => patch({ file: path, scroll: top }),
                  ...(ctx?.onComments === undefined ? {} : { onLine: pickLine }),
                  commented,
                  ...(picked === null || picked.path !== openFile ? {} : { picked: `${picked.side}:${picked.line}` }),
                  onCheckFollowUp: checkFollowUp
                }} />
            ) : side === 'review' && reviewContext !== undefined ? (
              <div className="focus__review" data-focus-review>
                <TaskReviewPanel
                  itemId={itemId} title={item.title}
                  {...(item.brief === undefined ? {} : { brief: item.brief })}
                  {...(item.criteria === undefined ? {} : { criteria: item.criteria })}
                  {...(item.criteriaMet === undefined ? {} : { criteriaMet: item.criteriaMet })}
                  {...(item.comments === undefined ? {} : { comments: item.comments })}
                  standing={reviewContext.handoff.standing}
                  agentWorking={agentWorkingOf(reviewContext.handoff.state)}
                  checks={laneChecks}
                  readOnly={false}
                  chatOpen={chatId !== undefined}
                  press={press}
                  {...(reviewContext.onToggleCriterion === undefined ? {} : { onToggleCriterion: reviewContext.onToggleCriterion })}
                  {...(reviewContext.onComments === undefined ? {} : { onComments: reviewContext.onComments })}
                  {...(reviewContext.onSendFollowUp === undefined ? {} : { onSendFollowUp: reviewContext.onSendFollowUp })}
                  {...(reviewContext.onDraftFollowUp === undefined ? {} : { onDraftFollowUp: reviewContext.onDraftFollowUp })}
                  {...(reviewContext.onRunChecks === undefined ? {} : { onRunChecks: reviewContext.onRunChecks })}
                  {...(reviewContext.suggestCheck === undefined ? {} : { suggestCheck: reviewContext.suggestCheck })}
                  reviewedFiles={reviewContext.reviewed?.files} />
              </div>
            ) : side === 'preview' && preview !== undefined ? (
              <FocusPreview url={preview.url} title={preview.title ?? preview.url}
                others={previews.length > 1 ? previews.map((p, i) => ({ i, label: p.title ?? p.url })) : []} onPick={setPreviewIndex}
                onShow={() => props.onJump(preview.rect.id)} />
            ) : (
              <p className="orch__caption">Nothing to show on this side.</p>
            )}
          </div>
          {/* The comment bar: the line picked on the diff, the words, and the
              comments not yet sent — composed into ONE follow-up that goes to
              the conversation on the left (or into its composer, to edit). */}
          {side === 'changes' && ctx?.onComments !== undefined && (picked !== null || unsent.length > 0 || note !== null) && (
            <div className="focus__comments" data-focus-comments={unsent.length}>
              {picked !== null && (
                <div className="focus__comment-new" data-focus-comment-new={`${picked.path}:${picked.side}:${picked.line}`}>
                  <span className="focus__comment-place">Comment on <code>{commentPlace(picked)}</code>{picked.quote.trim() !== '' ? <> — <code className="focus__comment-quote">{picked.quote.trim().slice(0, 80)}</code></> : null}</span>
                  <textarea className="focus__comment-input" data-focus-comment-input data-edit-owner rows={2} value={commentText} autoFocus placeholder="What should change here?"
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addComment() } if (e.key === 'Escape') { e.preventDefault(); setPicked(null) } }} />
                  <span className="orch__roster-actions">
                    <button type="button" className="orch__mini" data-focus-comment-add disabled={commentText.trim() === ''} {...shellControl(addComment)}>Add comment</button>
                    <button type="button" className="orch__mini" {...shellControl(() => setPicked(null))}>Cancel</button>
                  </span>
                </div>
              )}
              {unsent.length > 0 && (
                <div className="focus__comment-send">
                  <span>{unsent.length} comment{unsent.length === 1 ? '' : 's'} not sent yet</span>
                  <button type="button" className="orch__mini" data-focus-comments-send disabled={chatId === undefined} title={chatId === undefined ? 'this task has no conversation' : 'Send the comments as one numbered follow-up to the conversation'} {...shellControl(sendComments)}>Send to the agent</button>
                  <button type="button" className="orch__mini" data-focus-comments-draft disabled={chatId === undefined} title="Put the follow-up in the composer to edit before sending" {...shellControl(draftComments)}>Edit first</button>
                </div>
              )}
              {note !== null && <p className="orch__caption" data-focus-comments-note role="status">{note}</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * The task's bound preview, as a SECOND guest on the preview's own partition
 * (the browser panel's, so its cookies are the same pane's). Created
 * imperatively for BrowserNode's reason — `<webview>` is not in React's
 * element table — and re-created only when the address changes. It reads
 * nothing out of the guest: reading a page is main's (`browser:read`), from
 * the panel on the canvas.
 */
function FocusPreview(p: { url: string; title: string; others: { i: number; label: string }[]; onPick: (i: number) => void; onShow: () => void }): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const guestRef = useRef<HTMLElement & { reload?: () => void } | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const el = document.createElement('webview') as HTMLElement & { reload?: () => void }
    el.className = 'focus__guest'
    el.setAttribute('partition', 'persist:tc-browser')
    el.setAttribute('src', p.url)
    host.appendChild(el)
    guestRef.current = el
    return () => { guestRef.current = null; el.remove() }
  }, [p.url])
  return (
    <div className="focus__preview" data-focus-preview={p.url}>
      <div className="focus__preview-bar">
        {p.others.length > 0 ? (
          <select className="orch__brief-input" aria-label="Which preview" onChange={(e) => p.onPick(Number(e.target.value))}>
            {p.others.map((o) => <option key={o.i} value={o.i}>{o.label}</option>)}
          </select>
        ) : <span className="orch__caption" title={p.url}>{p.title}</span>}
        <button type="button" className="orch__mini" data-focus-preview-reload {...shellControl(() => { try { guestRef.current?.reload?.() } catch { /* not attached yet */ } })}>Reload</button>
        <button type="button" className="orch__mini" {...shellControl(p.onShow)}>Open on canvas</button>
      </div>
      <div className="focus__preview-host" ref={hostRef} />
    </div>
  )
}
