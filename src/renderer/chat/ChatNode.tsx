import { memo, useCallback, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { ChatPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { displayPath } from '@shared/display-path'
import type { ChatAttachment } from '@shared/agent-session'
import type { DirResult } from '@shared/fs-tree'
import type { ReviewDiff } from '@shared/review'
import { matchReviewPath } from '@shared/tool-index'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { BACKENDS, backendOf } from '@shared/agent-backends'
import { autoChipWords } from '@shared/auto'
import { chatHeaderLine, SANDBOX_HEADER } from '@renderer/shell/rail-rows'
import { panelState, autoTone } from '@renderer/panels/panel-state'
import { shellControl } from '@renderer/shell/shell-control'
import { takeInsert, useChat, dismissAuto } from './chat-store'
import { refreshChatGrants } from './useChatSessions'
import { MEMORY_CONTEXT_MAX, memoryContext, teammateMemoryRoot } from './memory-context'
import { chatRows, chatStateInput, composerState, toolArgument, DENY_MESSAGE, type ChatRow, type ChatGroup, toolArgumentIsCode, toolGroups, toolVerb, toolState, toolGroupLabel, composerRows, composerLive } from './chat-model'
import {
  applyCompletion, fileCompletions, fillPlaceholders, placeholders, triggerAt,
  type ComposerTrigger, type FileCompletionRow
} from './composer-model'
import { Markdown } from './Markdown'
import { TOOL_GLYPH, ToolOther, ChevronRight, ChevronDown, KIND_GLYPH } from '@renderer/icons'
import { EmptyState } from '@renderer/shell/EmptyState'
import { useTrailFor } from '@renderer/skills/skill-trail-store'

/**
 * M73. THE CHAT PANEL — a conversation with an agent, on the canvas, through
 * the one frame every kind renders through.
 *
 * Plain DOM: no xterm, no WebGL context, no PTY, never in LIVE_BUDGET —
 * `isTerminalPanel`'s sixth clause keeps Canvas.tsx's partition from ever
 * handing it to tiering. Its process is main's (AgentSessionManager, keyed
 * by this panel's id); this component reads the store's mirror and calls
 * the bridge, and owns nothing that outlives its mount.
 *
 * The body is the brief's principle 12: the transcript is a well and the
 * agent's own words are the loudest thing — no bubbles, the role a caps
 * label in the margin, tool calls one collapsed row each with the result
 * folded under, thinking dim and collapsed, the composer pinned below.
 *
 * The composer is the FIFTH text surface that takes DOM focus off xterm
 * (after the review draft, the file editor, the Jira comment and the
 * palette), and inherits the same two rules: `shellControl` on every
 * control so a click never moves focus, and Palette.tsx's shape for the
 * menu's Cmd+C/Cmd+V: those are the app menu's accelerators, so the browser
 * never delivers a native copy or paste to this textarea, and Canvas.tsx's
 * listener routes `edit:paste` to the focused TERMINAL — for a chat panel
 * that is nobody. The composer therefore subscribes itself and serves the
 * paste only while it holds DOM focus. Cmd+Z over the composer still reaches
 * applyHistory — the known limit CLAUDE.md records for the Jira draft.
 *
 * M75. The composer resolves `@` references against the panel's directory,
 * offers the project's and the saved prompts as `/` commands (a saved
 * prompt's `{{holes}}` filled in the same popup; a project prompt inserted
 * verbatim, never expanded), and carries dropped or pasted images as
 * attachments the next send takes. The pure rules live in composer-model.ts.
 */

export interface ChatNodeProps {
  panel: ChatPanel
  selected: boolean
  onSelect(id: string, additive?: boolean): void
  onFocus(id: string): void
  onBeginDrag(state: DragState): void
  onClose(id: string): void
  readOnly?: boolean
  onBeginLink(panelId: string, event: ReactMouseEvent): void
  linkTarget: boolean
  /** Whether `claude` was found on the login PATH — the composer's named reason otherwise. */
  claudeAvailable: boolean
  /** M74. Continue this conversation in a terminal (`claude --resume`). */
  onOpenInTerminal(id: string): void
  /** M97. Open the palette on this chat's Auto rows. */
  onOpenAuto?: (id: string) => void
  /** M100. The teammate this chat speaks as, by name — absent for a plain chat. */
  teammateName?: string
  /** D12: the dispatched task is provenance for an accepted decision, not its scope. */
  taskId?: string
}

const shortInput = toolArgument

function kb(size: number): string {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : size >= 1024 ? `${Math.round(size / 1024)} KB` : `${size} B`
}

/**
 * M77. What a tool row's `diff` verb shows: three named answers and the
 * hunks. `null` is "still reading" — a different sentence from every other
 * arm, and never collapsed into one of them.
 */
type ToolDiff =
  | null
  | { kind: 'no-baseline' }
  | { kind: 'unchanged' }
  | { kind: 'diff'; diff: ReviewDiff }

/** M167. The turn's time as a clock reading — hours and minutes, the day on the title. */
function clockOf(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const ToolRow = memo(function ToolRow({ row, panelId, reveal }: { row: Extract<ChatRow, { kind: 'tool' }>; panelId: string; reveal?: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diff, setDiff] = useState<ToolDiff>(null)
  const hasResult = row.result !== undefined
  // The file's diff against THIS chat's baseline: the baseline names the
  // root, the change list says whether the file changed at all (a Read
  // most often reads `unchanged`, which is the honest answer), and the diff
  // is the review node's own query. Stale answers guarded by `live`.
  useEffect(() => {
    if (!diffOpen || row.file === undefined) return
    let live = true
    const file = row.file
    setDiff(null)
    void (async () => {
      const baseline = await window.canvas.review.baseline(panelId)
      if (!live) return
      if (baseline === null) { setDiff({ kind: 'no-baseline' }); return }
      const result = await window.canvas.review.panel(panelId)
      if (!live) return
      // `changes` AND `shared` carry a file list — a repository several panels
      // share is the ordinary case for a chat beside a terminal (the scene found
      // it: the row said `could not be read` for a diff the node beside it showed).
      if (result.kind === 'clean') { setDiff({ kind: 'unchanged' }); return }
      if (result.kind !== 'changes' && result.kind !== 'shared') { setDiff(result.kind === 'never-started' || result.kind === 'not-a-repo' ? { kind: 'no-baseline' } : { kind: 'diff', diff: { kind: 'unavailable' } }); return }
      const rel = matchReviewPath(file, result.root, result.files.map((f) => f.path))
      const entry = rel === null ? undefined : result.files.find((f) => f.path === rel)
      if (entry === undefined) { setDiff({ kind: 'unchanged' }); return }
      const d = await window.canvas.review.diff({ repoRoot: result.root, baselineSha: baseline.sha, path: entry.path, untracked: entry.untracked })
      if (live) setDiff({ kind: 'diff', diff: d })
    })()
    return () => { live = false }
  }, [diffOpen, row.file, panelId])
  return (
    <div className={`chat__row chat__row--tool${row.result?.isError ? ' chat__row--tool-error' : ''}`} data-chat-row="tool" data-chat-tool={row.name}>
      {/* M168. ONE ROW: the family's glyph, the verb, the target under the path rule, a state pill. */}
      <span className="chat__tool-glyph" aria-hidden="true">{(() => { const G = TOOL_GLYPH[toolVerb(row.name)] ?? ToolOther; return <G /> })()}</span>
      <span className="chat__tool-name" title={row.name}>{toolVerb(row.name)}</span>
      <span className={`chat__tool-input${toolArgumentIsCode(row.input) ? ' chat__tool-input--code' : ''}`}>{shortInput(row.input)}</span>
      <span className="chat__tool-state" data-chat-tool-state={toolState(row)}>{toolState(row)}</span>
      {row.file !== undefined && (
        <button type="button" className="chat__tool-toggle" data-chat-tool-diff
          title={diffOpen ? 'Hide the diff' : `Show this file's diff against the chat's baseline`} aria-expanded={diffOpen}
          {...shellControl(() => { reveal?.(); setDiffOpen((v) => !v) })}>
          {diffOpen ? 'hide diff' : 'diff'}
        </button>
      )}
      {diffOpen && (
        <div className="chat__tool-diff" data-chat-tool-diff-body data-chat-tool-diff-state={diff === null ? 'reading' : diff.kind === 'diff' ? diff.diff.kind : diff.kind}>
          {diff === null ? <p className="review-node__hunk-note">reading…</p>
            : diff.kind === 'no-baseline' ? <p className="review-node__hunk-note">no baseline — this chat was created outside a repository, or before its agent ran</p>
            : diff.kind === 'unchanged' ? <p className="review-node__hunk-note">unchanged against the baseline</p>
            : diff.diff.kind === 'binary' ? <p className="review-node__hunk-note">binary file</p>
            : diff.diff.kind === 'unavailable' ? <p className="review-node__hunk-note">this diff could not be read</p>
            : <div className="review-node__hunks" data-review-node-hunks>
                {/* M178 (F.10): git's own header lines (`diff --git`, `index`, `---`, `+++`) say what the card's header already says — the hunk starts at the first `@@`. */}
{diff.diff.lines.filter((line) => line.kind !== 'meta').map((line, i) => <div className={`review-node__line review-node__line--${line.kind}`} key={i}>{line.text}</div>)}
                {diff.diff.truncated > 0 && <div className="review-node__hunk-note">+{diff.diff.truncated} more lines</div>}
              </div>}
        </div>
      )}
      {hasResult && (
        <button type="button" className="chat__tool-toggle" data-chat-tool-toggle
          title={open ? 'Hide the result' : 'Show the result'} aria-label={open ? 'Hide the result' : 'Show the result'}
          aria-expanded={open} {...shellControl(() => { reveal?.(); setOpen((v) => !v) })}>
          {open ? 'hide result' : 'show result'}
        </button>
      )}
      {open && row.result && (
        <>
          <pre className={`chat__tool-result${all ? ' chat__tool-result--all' : ''}`} data-chat-tool-result>{row.result.content === '' ? '(no output)' : row.result.content}</pre>
          {/* M168. The well is capped at twelve lines; `show all` lifts the cap. */}
          {row.result.content.split('\n').length > 12 && (
            <button type="button" className="chat__tool-toggle" data-chat-tool-all aria-expanded={all} title={all ? 'Cap the result at twelve lines' : 'Show the whole result'}
              {...shellControl(() => setAll((v) => !v))}>{all ? 'show less' : 'show all'}</button>
          )}
        </>
      )}
    </div>
  )
})

/**
 * M168. A GROUP of consecutive tool rows under one header, collapsed by
 * default. The rows stay MOUNTED (tools.1, tools.2 and front.1 count and
 * click them); collapsed rows are hidden by the group's class, and a verb on a
 * hidden row REVEALS the group before it acts, so a script's dispatched click
 * and a person's land on the same state.
 */
const ToolGroup = memo(function ToolGroup({ group, panelId }: { group: Extract<ChatGroup, { kind: 'tools' }>; panelId: string }): JSX.Element {
  // A group of ONE is a row with no header, rendered through the same
  // component so the row keeps its key — and its open diff — when a second
  // tool arrives and the run becomes a group (the Act II critic).
  const single = group.rows.length === 1
  const [open, setOpen] = useState(false)
  const reveal = useCallback(() => setOpen(true), [])
  const shown = single || open
  return (
    <div className={`chat__tools${shown ? '' : ' chat__tools--collapsed'}`} data-chat-tools={single ? undefined : group.rows.length} data-chat-tools-open={single ? undefined : open}>
      {!single && (
        <button type="button" className="chat__tools-head" data-chat-tools-toggle aria-expanded={open} title={open ? 'Fold these tool calls away' : 'Show each tool call'}
          {...shellControl(() => setOpen((v) => !v))}>
          <span className="chat__tools-chevron" aria-hidden="true">{open ? <ChevronDown /> : <ChevronRight />}</span>
          {toolGroupLabel(group)}
        </button>
      )}
      {group.rows.map((row) => <ToolRow key={row.id} row={row} panelId={panelId} reveal={reveal} />)}
    </div>
  )
})

const ThinkingRow = memo(function ThinkingRow({ row }: { row: Extract<ChatRow, { kind: 'thinking' }> }): JSX.Element {
  const [open, setOpen] = useState(false)
  const has = row.text.trim() !== ''
  return (
    <div className="chat__row chat__row--thinking" data-chat-row="thinking">
      <button type="button" className="chat__thinking-toggle" title={has ? (open ? 'Hide the thinking' : 'Show the thinking') : 'The model thought; the text was not shared'}
        aria-label={open ? 'Hide the thinking' : 'Show the thinking'} aria-expanded={open} disabled={!has} {...shellControl(() => setOpen((v) => !v))}>
        {row.live ? 'thinking…' : 'thought'}{has ? (open ? ' · hide' : ' · show') : ''}
      </button>
      {open && has && <pre className="chat__thinking-text">{row.text}</pre>}
    </div>
  )
})

/** An attachment as the composer holds it, before main resolves it. */
type PendingAttachment = { id: number; label: string; size?: number } & ChatAttachment

interface PromptRowLite { id: string; name: string; source: 'saved' | 'project'; body: string }

/** The popup's state: which trigger opened it, its rows, the highlighted row, and a fill step. */
interface Popup {
  trigger: ComposerTrigger
  files?: { dir: string; rows: FileCompletionRow[]; more: number; result: DirResult['kind'] | 'pending' }
  prompts?: PromptRowLite[]
  index: number
  fill?: { prompt: PromptRowLite; names: string[]; values: Record<string, string> }
}

export function ChatNode(props: ChatNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const chat = useChat(id)
  const snapshot = chat.snapshot
  const rows = useMemo(() => chatRows(chat.turns, chat.live), [chat.turns, chat.live])
  const hasHistory = chat.turns.length > 0
  const stateInput = chatStateInput(snapshot, hasHistory)
  const state = panelState({ kind: 'chat', status: undefined, dormant: false, ...(stateInput === undefined ? {} : { chat: stateInput }) }, undefined)
  // M90. The backend from the record (absent is claude); the snapshot's word
  // agrees once main answers. Every codex difference is a named reason.
  const backend = backendOf(props.panel.chat)
  // M169. The skills capsule's count: the trail's one door (M130).
  const trail = useTrailFor(id, 'chat')
  const trailCount = trail.kind === 'entries' ? trail.entries.length + trail.more : 0
  const composer = composerState(snapshot, props.claudeAvailable, backend)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [refusal, setRefusal] = useState<string | null>(null)
  const [popup, setPopup] = useState<Popup | null>(null)
  const [decision, setDecision] = useState<{ turnId: string; text: string } | null>(null)
  const [decisionResult, setDecisionResult] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const attachSeq = useRef(0)
  const popupSeq = useRef(0)

  const acceptDecision = (): void => {
    if (decision === null) return
    void window.canvas.memory.add({ root: panel.chat.cwd, kind: 'decided', text: decision.text,
      source: { conversationId: id, turnId: decision.turnId, ...(props.taskId === undefined ? {} : { taskId: props.taskId }) } }).then((answer) => {
      if (answer.ok === false) { setDecisionResult(answer.reason); return }
      setDecisionResult('remembered as a repository decision')
      setDecision(null)
    })
  }

  // Auto-scroll to the newest row unless the user has scrolled away; the
  // decision is read from the scroll position BEFORE the rows change, so a
  // person reading an earlier turn is not dragged to the bottom by a token.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (stickRef.current) el.scrollTop = el.scrollHeight
    // The pending count is a dependency too: the question block pinned under
    // the well shrinks it, and without this the newest line hid behind the
    // question the moment it mattered (M76's critic).
  }, [rows, snapshot?.pending.length])
  const onScroll = (): void => {
    const el = bodyRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const focusWhenEnabled = useRef(false)
  // Focus NOW, the caret on the next frame (the value it indexes into is the
  // one React is about to commit). M205: focusing inside the frame alone never
  // ran in a window that is not painting — a hidden window, the same trap
  // `applyStarter`'s placement comment records — so an outside insert (the
  // first start's empty one, the palette's prompt row) left the keyboard on
  // nothing. Focusing early is the same end state, reached without a frame.
  const placeCaret = (at: number): void => {
    // preventScroll is LOAD-BEARING: a plain focus() scrolls every scrollable
    // ancestor to reveal the element — `.canvas`, the clipping host, included
    // — and a scrolled host offsets every screen↔world conversion after it.
    // The first cut of this line put the whole canvas off its own geometry
    // (panels never framed, clicks landing elsewhere) in three Electron parts.
    textareaRef.current?.focus({ preventScroll: true })
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(at, at)
    })
  }

  /* Insert text at the caret, keeping the caret after it. */
  const insertAtCaret = useCallback((text: string): void => {
    const ta = textareaRef.current
    const start = ta?.selectionStart ?? ta?.value.length ?? 0
    const end = ta?.selectionEnd ?? start
    setDraft((d) => d.slice(0, start) + text + d.slice(end))
    placeCaret(start + text.length)
  }, [])

  const addAttachment = useCallback((attach: ChatAttachment, size?: number): void => {
    const label = attach.kind === 'path' ? attach.path.slice(attach.path.lastIndexOf('/') + 1) : attach.name
    setAttachments((current) => [...current, { id: ++attachSeq.current, label, ...(size === undefined ? {} : { size }), ...attach }])
    setRefusal(null)
  }, [])

  // M75. Requests from outside the component: the palette's prompt row and
  // a drop on the panel, through the store's insert bus.
  useEffect(() => {
    const insert = chat.insert
    if (!insert) return
    // M205. A DISABLED composer (a turn pending or streaming) cannot take
    // focus. When — and ONLY when — the insert asks for the keyboard (the
    // first start's, whose first message is in flight: `onboarding.intent.e2e.1`
    // measured BODY holding it), remember and honour it once sending
    // re-enables. Armed for every insert, a review's Continue took the
    // keyboard from the canvas when its turn ended (the M205 critic).
    if (insert.focus === true && textareaRef.current?.disabled === true) focusWhenEnabled.current = true
    if (insert.text !== undefined) insertAtCaret(insert.text)
    if (insert.attach !== undefined) addAttachment(insert.attach)
    takeInsert(id, insert.seq)
  }, [chat.insert, id, insertAtCaret, addAttachment])
  // M205. The deferred half of `placeCaret`: focus once sending re-enables,
  // and ONLY while the keyboard is on nothing — a person who clicked into
  // something else in the meantime has answered where their keyboard goes.
  useEffect(() => {
    if (!composer.send.enabled || !focusWhenEnabled.current) return
    focusWhenEnabled.current = false
    const active = document.activeElement
    if (active === null || active === document.body) textareaRef.current?.focus({ preventScroll: true })
  }, [composer.send.enabled])
  // M122. A search hit's flight: the stored turn's row scrolled into view by the turn's id (a row's id is its turn's).
  useEffect(() => {
    const target = chat.scrollTo
    if (target === undefined) return
    const turn = chat.turns[target.turnIndex]
    const el = turn === undefined ? null : bodyRef.current?.querySelector(`[data-chat-row-id="${turn.id}"]`) ?? null
    if (el !== null) el.scrollIntoView({ block: 'center' })
  }, [chat.scrollTo, chat.turns])

  // The menu's paste and copy, served only while this textarea is focused.
  // A paste with NO text asks main for a clipboard image (M75).
  useEffect(() => {
    const offPaste = window.canvas.edit.onPaste((text) => {
      const ta = textareaRef.current
      if (!ta || document.activeElement !== ta) return
      if (!text) {
        void window.canvas.agentSession.clipboardImage().then((image) => {
          if (image === null) return
          if ('refused' in image) { setRefusal(image.refused); return }
          addAttachment({ kind: 'data', mediaType: image.mediaType, base64: image.base64, name: 'pasted image' }, image.size)
        })
        return
      }
      const start = ta.selectionStart ?? ta.value.length
      const end = ta.selectionEnd ?? start
      setDraft((d) => d.slice(0, start) + text + d.slice(end))
    })
    const offCopy = window.canvas.edit.onCopy(() => {
      const ta = textareaRef.current
      if (!ta || document.activeElement !== ta) return
      const start = ta.selectionStart ?? 0
      const end = ta.selectionEnd ?? 0
      if (end > start) void navigator.clipboard.writeText(ta.value.slice(start, end))
    })
    return () => { offPaste(); offCopy() }
  }, [addAttachment])

  /* M75. The completion popup follows the caret: recomputed on every edit. */
  const refreshPopup = useCallback((text: string, caret: number): void => {
    const trigger = triggerAt(text, caret)
    if (trigger === null) { setPopup(null); return }
    const seq = ++popupSeq.current
    if (trigger.kind === 'file') {
      // `@src/ser` lists `src/` filtered by `ser`; `@ser` lists the panel's directory.
      const slash = trigger.query.lastIndexOf('/')
      const sub = slash < 0 ? '' : trigger.query.slice(0, slash + 1)
      const needle = slash < 0 ? trigger.query : trigger.query.slice(slash + 1)
      const dir = sub === '' ? panel.chat.cwd : (sub.startsWith('/') ? sub : `${panel.chat.cwd.replace(/\/+$/, '')}/${sub}`)
      // Three states: asked-but-unanswered renders `listing …`, never `no matches`.
      setPopup((current) => ({ trigger, index: 0, files: current?.files && current.files.dir === dir ? current.files : { dir, rows: [], more: 0, result: 'pending' } }))
      void window.canvas.files.list(dir).then((result) => {
        if (popupSeq.current !== seq) return
        const listed = result.kind === 'ok' ? fileCompletions(result.entries, needle) : { rows: [], more: 0 }
        setPopup({ trigger, index: 0, files: { dir, rows: listed.rows, more: listed.more, result: result.kind } })
      })
      return
    }
    setPopup({ trigger, index: 0, prompts: [] })
    void window.canvas.prompt.list(panel.chat.cwd).then((list) => {
      if (popupSeq.current !== seq) return
      const q = trigger.query.toLowerCase()
      const matching = list.filter((p) => p.name.toLowerCase().includes(q)).map((p) => ({ id: p.id, name: p.name, source: p.source, body: p.body }))
      setPopup({ trigger, index: 0, prompts: matching })
    })
  }, [panel.chat.cwd])

  const acceptFile = (row: FileCompletionRow): void => {
    if (!popup) return
    const q = popup.trigger.query
    const slash = q.lastIndexOf('/')
    const prefix = slash < 0 ? '' : q.slice(0, slash + 1)
    const ta = textareaRef.current
    const caret = ta?.selectionStart ?? draft.length
    const replacement = `@${prefix}${row.insert}${row.dir ? '' : ' '}`
    const next = applyCompletion(draft, popup.trigger.start, caret, replacement)
    setDraft(next.text)
    placeCaret(next.caret)
    // A directory keeps the list open one level down; a file closes it.
    if (row.dir) refreshPopup(next.text, next.caret)
    else setPopup(null)
  }

  const insertPromptBody = (body: string): void => {
    if (!popup) return
    const ta = textareaRef.current
    const caret = ta?.selectionStart ?? draft.length
    const next = applyCompletion(draft, popup.trigger.start, caret, body)
    setDraft(next.text)
    setPopup(null)
    placeCaret(next.caret)
  }
  const acceptPrompt = (prompt: PromptRowLite): void => {
    if (!popup) return
    // A project prompt is never expanded: its holes are the CLI's business.
    const names = prompt.source === 'saved' ? placeholders(prompt.body) : []
    if (names.length > 0) { setPopup({ ...popup, fill: { prompt, names, values: {} } }); return }
    insertPromptBody(prompt.body)
  }

  const send = (): void => {
    const text = draft.trim()
    if ((text === '' && attachments.length === 0) || !composer.send.enabled) return
    const outgoing: ChatAttachment[] = attachments.map((a) => (a.kind === 'path' ? { kind: 'path', path: a.path } : { kind: 'data', mediaType: a.mediaType, base64: a.base64, name: a.name }))
    setPopup(null)
    stickRef.current = true
    // Cleared NOW, restored on a refusal: text typed during the round trip
    // is kept either way (M75's verifier).
    const keptAttachments = attachments
    setDraft('')
    setAttachments([])
    setRefusal(null)
    // M83. The first message carries the repository's memories ahead of the
    // user's text — the same bound the note above the composer states.
    const carried = turnCount === 0 && !memorySentRef.current && memoryBlock !== null ? memoryBlock.text : ''
    if (carried !== '') { memorySentRef.current = true; setMemoryBlock(null) }
    void Promise.resolve(window.canvas.agentSession.send(id, `${carried}${text}`, outgoing)).then((answer) => {
      if (typeof answer === 'object' && answer !== null && 'refused' in answer) {
        setRefusal(answer.refused)
        setDraft((d) => (d === '' ? draft : d))
        setAttachments((current) => (current.length === 0 ? keptAttachments : current))
      }
    })
  }
  const interrupt = (): void => {
    if (!composer.interrupt.enabled) return
    void window.canvas.agentSession.interrupt(id)
  }
  // M98. `scope: 'session'` is the third verb: main grants the tool, then
  // answers through the same door. The scope is written only when given —
  // an `undefined` key would cross IPC as present. The mirror is refreshed
  // after, so the inspector's field reads the grant main now holds.
  const answer = (requestId: string, allow: boolean, scope?: 'session'): void => {
    void window.canvas.agentSession.answer({ id, requestId, answer: allow ? { allow: true } : { allow: false, message: DENY_MESSAGE }, ...(scope === undefined ? {} : { scope }) })
      .then(() => { if (scope !== undefined) refreshChatGrants(id) })
  }

  const alive = snapshot !== null && snapshot.pid !== undefined && snapshot.status !== 'exited' && snapshot.status !== 'disposed'
  // Counted from the TRANSCRIPT, never the snapshot: a restored panel's fresh
  // session reports zero turns while the file holds yesterday's, and a
  // resumed session's count would start again at one. A turn is a message
  // the user sent — the same thing the runtime's result count measures.
  const turnCount = chat.turns.filter((t) => t.role === 'user' && t.blocks.some((b) => b.type === 'text')).length
  const title = panel.title ?? `chat · ${(panel.chat.cwd.replace(/\/+$/, '').split('/').pop() || panel.chat.cwd)}`

  const popupRows = popup?.files?.rows.length ?? popup?.prompts?.length ?? 0
  const onComposerKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (popup !== null && popup.fill === undefined) {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setPopup({ ...popup, index: Math.min(Math.max(0, popupRows - 1), popup.index + 1) }); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setPopup({ ...popup, index: Math.max(0, popup.index - 1) }); return }
      if ((e.key === 'Enter' || e.key === 'Tab') && popupRows > 0) {
        e.preventDefault(); e.stopPropagation()
        if (popup.files) { const row = popup.files.rows[popup.index]; if (row) acceptFile(row) }
        else if (popup.prompts) { const p = popup.prompts[popup.index]; if (p) acceptPrompt(p) }
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPopup(null); return }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send() }
    // Bare keys belong to this textarea while it has focus; the canvas's
    // Cmd-gated shortcuts still apply above it.
    e.stopPropagation()
  }

  // M83. The repository's recent memories go with the FIRST message, and the
  // panel says so before it does — bounded, and nothing is sent that the user
  // cannot see first.
  // The block is READ ONCE and held: the note states the count of the block
  // it is holding, and the send carries that same block. Counting here and
  // re-reading at send time let the two disagree — a memory added between the
  // two reads went with the message the panel had already described (M83's
  // verifier), which is exactly the failure this note exists to prevent.
  const [memoryBlock, setMemoryBlock] = useState<{ text: string; count: number; repository?: string; unresolved?: string } | null>(null)
  // Whether THIS panel has already carried its memories. Turn counts arrive
  // back over `agent:event`, so two quick sends both see `turnCount === 0`
  // and the block would be prepended twice — the second time unannounced.
  // M107. The branch, from M86's git:status — asked once per directory.
  const [branch, setBranch] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void window.canvas.git.status(panel.chat.cwd).then((st) => { if (live) setBranch(st.kind === 'status' ? st.branch : null) }).catch(() => { if (live) setBranch(null) })
    return () => { live = false }
  }, [panel.chat.cwd])
  const memorySentRef = useRef(false)
  useEffect(() => {
    if (turnCount > 0 || memorySentRef.current) { setMemoryBlock(null); return }
    let live = true
    // M100. Both memories, both bounded, both stated: the repository's and,
    // for a teammate's chat, its own — two axes, never one list.
    const mate = panel.chat.teammateId
    void Promise.all([
      window.canvas.memory.list(panel.chat.cwd, MEMORY_CONTEXT_MAX),
      mate === undefined ? Promise.resolve(null) : window.canvas.memory.list(teammateMemoryRoot(mate), MEMORY_CONTEXT_MAX)
    ]).then(([repo, own]) => {
      if (!live) return
      const block = memoryContext(repo.entries, own === null ? undefined : { entries: own.entries, who: props.teammateName ?? mate ?? '' })
      // M196 (D04). The disclosure names WHICH repository. This chat's cwd is
      // often a worktree lane (M113's dispatch), so "this repository" was the
      // one word in the sentence a person could not check — and the repository
      // it means is not the folder the header shows. `repo.root` is the root
      // main actually read, so the note and the wire cannot disagree.
      // THREE states, not two (the critic found this collapsed). An
      // unresolved read means git declined and NOTHING was read — rendering
      // that as no note at all says "there is nothing to disclose", which is
      // the exact collapse this milestone closes one level up. The note is the
      // only place a person can see it, so it is the one place that must not
      // stay quiet.
      if (repo.unresolved !== undefined) { setMemoryBlock({ text: '', count: 0, unresolved: repo.unresolved }); return }
      setMemoryBlock(block.count === 0 ? null : { ...block, repository: repo.root })
    })
    return () => { live = false }
  }, [panel.chat.cwd, panel.chat.teammateId, props.teammateName, turnCount])

  const fillStep = popup?.fill
  const insertFilled = (): void => { if (fillStep) insertPromptBody(fillPlaceholders(fillStep.prompt.body, fillStep.values)) }

  return (
    <PanelFrame
      id={id}
      kind="chat"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly ?? false}
      className="chat-node"
      rootAttrs={{ 'data-chat-status': snapshot?.status ?? 'none', 'data-chat-pending': String(snapshot?.pending.length ?? 0), 'data-chat-turns': String(turnCount) }}
      title={title}
      state={state}
      // M76. The question at the SUMMARY tier too: the tool and its argument
      // in mono, Allow and Deny. The block tier is the tone alone — a
      // control smaller than a word is not a control.
      far={snapshot !== null && snapshot.pending.length > 0 ? (() => { const p = snapshot.pending[0]!; return (
        <div className="chat__far-approval" data-chat-far-approval={p.requestId} onMouseDown={(e) => e.stopPropagation()}>
          <span className={`chat__far-question${toolArgumentIsCode(p.input) ? ' chat__far-question--code' : ''}`}><span className="chat__tool-name">{p.toolName}</span> {toolArgument(p.input)}</span>
          <button type="button" className="chat__verb chat__verb--allow" data-chat-allow title={`Allow ${p.toolName}`} {...shellControl(() => answer(p.requestId, true))}>Allow</button>
          <button type="button" className="chat__verb chat__verb--allow" data-chat-allow-session title={`Allow ${p.toolName} for the rest of this session`} {...shellControl(() => answer(p.requestId, true, 'session'))}>Allow for session</button>
          <button type="button" className="chat__verb chat__verb--deny" data-chat-deny title={`Deny ${p.toolName}`} {...shellControl(() => answer(p.requestId, false))}>Deny</button>
        </div>) })() : undefined}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={props.readOnly === true ? null : {
        // Armed while a process is alive, like a running terminal: a
        // mis-click on a conversation mid-answer is a killed agent.
        armed: alive,
        title: alive ? 'Close (ends this agent)' : 'Close',
        armedText: 'end?',
        onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) }
      }}
      // The terminal's own pill, byte for byte (`badge pf__word`), so the two
      // front-ends render one state one way (principle 11). The turn count
      // left the chrome after M73's critic — two facts in one slot — and lives
      // in the inspector's Detail and on the root as data.
      chrome={<>
        {/* M90. Which CLI this panel talks to — a KIND fact, before the state pill, like the github card's. */}
        {/* M100. The identity leads the kind word: `ada · claude`. */}
        {props.teammateName !== undefined && <span className="pf__kind chat__teammate" data-chat-teammate title={`speaking as ${props.teammateName}`}>{props.teammateName}</span>}
        {/* M107. The header reads on from the mark: folder · branch · model — the
            engine is the kind word beside it (the M90 mark the checks pin), so
            it is not said twice. Every absent piece absent. */}
        <span className="pf__summary chat__header-line" data-chat-header title={chatHeaderLine({ cwd: panel.chat.cwd, ...(branch === null ? {} : { branch }), backend, ...(snapshot?.model === undefined ? {} : { model: snapshot.model }), ...(panel.chat.sandbox === true ? { sandbox: true } : {}) })}>{[panel.chat.sandbox === true ? SANDBOX_HEADER : (panel.chat.cwd.replace(/\/+$/, '').split('/').filter((p) => p !== '').slice(-1)[0] ?? '/'), branch ?? undefined, snapshot?.model].filter((p): p is string => typeof p === 'string' && p !== '').join(' · ')}</span>
        <span className="pf__kind chat__backend" data-chat-backend={backend} title={`a conversation with ${backend}`}>{backend}</span>
        <span className="badge pf__word" data-tone={state.tone} data-state-word data-chat-state title={`${turnCount} completed turn${turnCount === 1 ? '' : 's'}`}>{state.word}</span>
        {/* M97. The auto chip: a PROJECTION of main's count, beside the pill.
            A ring while running; `done` / `stuck — why` / `stopped` resolved,
            with a labelled dismiss. Never a decision — main stops the run. */}
        {snapshot?.auto !== undefined && (() => {
          const a = snapshot.auto
          return <span className={`badge pf__word chat__auto${a.state === 'running' ? ' chat__auto--running' : ''}`} data-chat-auto={a.state} data-tone={autoTone(a.state)} title={autoChipWords(a)}>
            {a.state === 'running' && <span className="chat__auto-ring" aria-hidden="true" />}
            {/* M121. The WORDS are the flex item that gives: text-overflow lives on a block, not on an inline-flex row's anonymous text. */}
            <span className="chat__auto-label">{autoChipWords(a)}</span>
            {a.state !== 'running' && props.readOnly !== true && <button type="button" className="pf__verb pf__verb--word chat__auto-dismiss" data-chat-auto-dismiss aria-label="Dismiss the auto result" title="Dismiss" {...shellControl(() => dismissAuto(id))}>dismiss</button>}
          </span>
        })()}
        {/* M97. The door to the Auto rows: opens the palette on them (the
            rename verb's idiom), so no second menu is grown. */}
        {props.readOnly !== true && snapshot?.auto?.state !== 'running' && (
          <button type="button" className="pf__verb pf__verb--word" data-chat-auto-open title="Run this chat on its own for a bounded number of turns — Complete, Harden, Review, or a task of yours" aria-label="Auto…"
            {...shellControl(() => props.onOpenAuto?.(id))}>auto</button>
        )}
        {/* M74. A LABELLED verb after the pill — the terminal's own row shape
            (`title · pill · controls`), and a word rather than the `>_` glyph
            the rail uses as a passive kind mark (M74's critic). Disabled by
            name while answering or empty, never hidden. */}
        {props.readOnly !== true && (() => {
          const busy = snapshot !== null && (snapshot.status === 'streaming' || snapshot.pending.length > 0)
          // M99. The door is the ROW's: a backend with no terminal door names why, from the registry.
          const reason = !BACKENDS[backend].terminalDoor ? BACKENDS[backend].reasons.noTerminal : busy ? 'the chat is still answering — interrupt it first' : turnCount === 0 ? 'send a message first — an empty chat has nothing to move' : null
          return <button type="button" className="pf__verb pf__verb--word" data-open-in-terminal disabled={reason !== null}
            title={reason ?? 'Open in a terminal — claude --resume this session'} aria-label="Open in terminal"
            {...shellControl(() => { if (reason === null) props.onOpenInTerminal(id) })}>to terminal</button>
        })()}
      </>}
    >
      <div className="pf__body chat__body" onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
        <div className="chat__transcript" data-chat-transcript data-scroll-host ref={bodyRef} onScroll={onScroll}>
          {/* M177. The empty state's one shape; the not-found arm stays a note — it is a fact about the machine, not a place. */}
          {rows.length === 0 && chat.refusal === null && (props.claudeAvailable
            ? <div className="chat__empty"><EmptyState id="chat" glyph={<KIND_GLYPH.chat />} fill={{ backend }} attrs={{ 'data-chat-empty': '' }} /></div>
            : <p className="pf__note chat__empty" data-chat-empty>{`${backend} was not found on the login PATH, so this panel cannot start.`}</p>)}
          {toolGroups(rows).map((row) => {
            switch (row.kind) {
              case 'tools':
                return <ToolGroup key={row.id} group={row} panelId={id} />
              case 'user':
                /* M167. A BUBBLE: the role stays as the row's accessible name (clipped, never a column); the time reveals on hover. */
                return <div key={row.id} className="chat__row chat__row--user" data-chat-row="user" data-chat-row-id={row.id}><span className="chat__role">you</span><pre className="chat__text">{row.text}</pre>{row.at !== undefined && <span className="chat__when" title={new Date(row.at).toLocaleString()}>{clockOf(row.at)}</span>}</div>
              case 'text':
                /* M167. Unboxed PROSE at the measure, rendered from the markdown tree; `data-chat-assistant-text` stays on the element whose textContent is the answer (chat.2, chat.3). */
                return <div key={row.id} className={`chat__row chat__row--assistant${row.live ? ' chat__row--live' : ''}`} data-chat-row="assistant" data-chat-row-id={row.id}><span className="chat__role">claude</span><div className="chat__text chat__prose" data-chat-assistant-text><Markdown text={row.text} /></div>{row.at !== undefined && <span className="chat__when" title={new Date(row.at).toLocaleString()}>{clockOf(row.at)}</span>}{!row.live && props.readOnly !== true && <button type="button" className="pf__verb pf__verb--word chat__remember" data-chat-remember title="Show this answer and its repository-memory scope before saving it as a decision" {...shellControl(() => { setDecision({ turnId: row.turnId, text: row.text }); setDecisionResult(null) })}>remember</button>}</div>
              case 'thinking':
                return <ThinkingRow key={row.id} row={row} />
              case 'tool':
                return <ToolGroup key={`tools:${row.id}`} group={{ kind: 'tools', id: `tools:${row.id}`, rows: [row] }} panelId={id} />
              case 'image':
                return <div key={row.id} className="chat__row chat__row--user" data-chat-row="image"><span className="chat__role">you</span><span className="chat__image">image · {row.mediaType.replace('image/', '')} · {kb(row.size)}</span></div>
              default:
                return <div key={row.id} className="chat__row chat__row--unknown" data-chat-row="unknown"><span className="chat__role">claude</span><span className="pf__note">a {row.kindName} block this version cannot render</span></div>
            }
          })}
          {snapshot !== null && snapshot.queued > 0 && (
            <p className="pf__note chat__queued" data-chat-queued>{snapshot.queued} message{snapshot.queued === 1 ? '' : 's'} waiting {snapshot.queuedReason === 'concurrency' ? 'for a free agent — this canvas has a ceiling on how many work at once' : 'for this turn to end'}</p>
          )}
          {snapshot?.status === 'exited' && (
            <p className="pf__note chat__exited" data-chat-exited>
              claude exited{typeof snapshot.exitCode === 'number' ? ` with ${snapshot.exitCode}` : ''}{snapshot.exitSignal ? ` (${snapshot.exitSignal})` : ''} — the next message resumes the conversation
            </p>
          )}
          {decision !== null && (
            <section className="chat__decision" data-chat-decision aria-label="Remember decision">
              <p className="pf__note">Remember this exact answer as a decision in this conversation’s repository memory?</p>
              <pre className="chat__decision-text">{decision.text}</pre>
              <p className="pf__note">Scope: repository memory{props.taskId === undefined ? '' : ' · linked to this task'}. It will be redacted before saving.</p>
              <button type="button" className="pf__verb pf__verb--word" data-chat-decision-confirm {...shellControl(acceptDecision)}>Remember decision</button>
              <button type="button" className="pf__verb pf__verb--word" data-chat-decision-cancel {...shellControl(() => setDecision(null))}>Cancel</button>
            </section>
          )}
          {decisionResult !== null && <p className="pf__note" data-chat-decision-result>{decisionResult}</p>}
        </div>
        {/* M76. The question lives BETWEEN the well and the composer, never
            inside the scroll host: a block at the bottom of a long transcript
            was scrolled out of view the moment it mattered (the approval
            scene). */}
        {/* M169. THE COMPOSER: a rounded well anchored to the panel's bottom. The
            chips above the text state the model, the skills seen and the attach
            door; Send is the one filled control and Interrupt takes its place
            while a turn runs (`--live`; the button stays in the DOM for codex.1);
            an approval is a sentence and two buttons in the same well (M76's
            "between the well and the composer" rule still holds — the question
            is never inside the scroll host). */}
        {/* `--live` is composerLive — the ONE predicate composerState reads, so Send is never hidden while it is enabled (the Act II critic). */}
        <div className={`chat__composer${composerLive(snapshot) ? ' chat__composer--live' : ''}`} data-chat-composer>
        {snapshot !== null && snapshot.pending.length > 0 && <div className="chat__questions" data-chat-questions>
          {snapshot.pending.map((p) => (
            <div key={p.requestId} className="chat__permission" data-chat-permission={p.requestId} role="group" aria-label={`${p.toolName} asks for permission`}>
              {/* M169. A SENTENCE and two buttons (the brief, Codex): the tool and
                  its argument are the sentence's object; the role stays as the
                  group's accessible name. */}
              <span className="chat__role">asks</span>
              <p className="chat__permission-sentence">{BACKENDS[backend].label} wants to run <span className="chat__tool-name">{p.toolName}</span>{' '}<span className={`chat__tool-input${toolArgumentIsCode(p.input) ? ' chat__tool-input--code' : ''}`}>{shortInput(p.input)}</span> — allow it?</p>
              <div className="chat__permission-verbs">
                <button type="button" className="chat__verb chat__verb--allow" data-chat-allow title="Allow this tool call" {...shellControl(() => answer(p.requestId, true))}>Allow</button>
                {/* M98. The third verb, between the two: allow, and stop asking for this tool until the panel closes. */}
                <button type="button" className="chat__verb chat__verb--allow" data-chat-allow-session title={`Allow ${p.toolName} for the rest of this session — it will not ask again`} {...shellControl(() => answer(p.requestId, true, 'session'))}>Allow for session</button>
                <button type="button" className="chat__verb chat__verb--deny" data-chat-deny title="Deny this tool call" {...shellControl(() => answer(p.requestId, false))}>Deny</button>
              </div>
            </div>
          ))}
        </div>}
          {chat.refusal !== null ? (
            <p className="pf__note chat__refusal" data-chat-refusal role="alert">{chat.refusal}</p>
          ) : (
            <>
              {chat.granted !== undefined && chat.granted.length > 0 && (
                <p className="pf__note chat__grant-note" data-chat-grant-note>{chat.granted[chat.granted.length - 1]} ran under a session grant{chat.granted.length > 1 ? ` · ${chat.granted.length} calls this session` : ''} — revoke in the pane's Detail</p>
              )}
              {memoryBlock !== null && turnCount === 0 && memoryBlock.unresolved !== undefined && (
                <p className="pf__note chat__memory-note" data-chat-memory-unresolved>no memories can go with this message — {memoryBlock.unresolved}</p>
              )}
              {memoryBlock !== null && turnCount === 0 && memoryBlock.unresolved === undefined && (
                <p className="pf__note chat__memory-note" data-chat-memory-note>{memoryBlock.count} memor{memoryBlock.count === 1 ? 'y' : 'ies'} from {memoryBlock.repository === undefined ? 'this repository' : displayPath(memoryBlock.repository, memoryBlock.repository).short} will go with your first message</p>
              )}
              {attachments.length > 0 && (
                <div className="chat__attachments" data-chat-attachments>
                  {/* A dim mono line in the well's own idiom, not a bordered pill
                      (M75's critic): `name · size · remove`, the verb a word. */}
                  {attachments.map((a) => (
                    <span key={a.id} className="chat__chip" data-chat-attachment={a.label}>
                      <span className="chat__chip-label">image · {a.label}{a.size !== undefined ? ` · ${kb(a.size)}` : ''}</span>
                      <button type="button" className="chat__chip-remove" title={`Remove ${a.label} from the next message`} aria-label={`Remove ${a.label}`}
                        {...shellControl(() => setAttachments((current) => current.filter((x) => x.id !== a.id)))}>remove</button>
                    </span>
                  ))}
                </div>
              )}
              {popup !== null && (
                <div className="chat__popup" data-chat-popup={popup.trigger.kind} role="listbox" aria-label={popup.trigger.kind === 'file' ? 'Files' : 'Prompts'}>
                  {fillStep !== undefined ? (
                    <div className="chat__fill" data-chat-fill>
                      <div className="chat__popup-note">{fillStep.prompt.name} — fill its holes, then insert</div>
                      {fillStep.names.map((name) => (
                        <label key={name} className="chat__fill-field">
                          <span className="chat__fill-name">{`{{${name}}}`}</span>
                          <input className="chat__fill-input" data-chat-fill-input={name} value={fillStep.values[name] ?? ''} placeholder="a value"
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); insertFilled() } if (e.key === 'Escape') { e.preventDefault(); setPopup(null) } }}
                            onChange={(e) => setPopup({ ...popup, fill: { ...fillStep, values: { ...fillStep.values, [name]: e.target.value } } })} />
                        </label>
                      ))}
                      <div className="chat__verbs">
                        <button type="button" className="chat__verb" data-chat-fill-insert title="Insert the filled prompt" {...shellControl(insertFilled)}>Insert</button>
                        <button type="button" className="chat__verb" title="Close without inserting" {...shellControl(() => setPopup(null))}>Cancel</button>
                      </div>
                    </div>
                  ) : popup.files !== undefined ? (
                    popup.files.rows.length === 0 ? (
                      <div className="chat__popup-note" data-chat-popup-empty>
                        {popup.files.result === 'pending' ? `listing ${popup.files.dir} …` : popup.files.result === 'ok' ? `no matches in ${popup.files.dir}` : popup.files.result === 'gone' ? `${popup.files.dir} is not there` : popup.files.result === 'not-a-directory' ? `${popup.files.dir} is a file` : `${popup.files.dir} could not be read`}
                      </div>
                    ) : (
                      <>
                        {/* A caps header names the list and counts it (principle 6, 7);
                            the matched prefix is marked in each row (the palette's rule). */}
                        <div className="chat__popup-head" data-chat-popup-head>files in {popup.files.dir.split('/').filter(Boolean).pop() ?? '/'} · {popup.files.rows.length + popup.files.more}</div>
                        {popup.files.rows.map((row, i) => {
                          const needle = popup.trigger.query.slice(popup.trigger.query.lastIndexOf('/') + 1)
                          const hit = needle.length > 0 && row.label.toLowerCase().startsWith(needle.toLowerCase())
                          return (
                            <button key={row.label} type="button" role="option" aria-selected={i === popup.index} className={`chat__popup-row${i === popup.index ? ' chat__popup-row--on' : ''}`} data-chat-completion={row.label}
                              title={row.dir ? `Descend into ${row.label}` : `Reference ${row.label}`} {...shellControl(() => acceptFile(row))}>
                              <span className="chat__popup-label">{hit ? <><mark className="chat__popup-match">{row.label.slice(0, needle.length)}</mark>{row.label.slice(needle.length)}</> : row.label}</span>
                              <span className="chat__popup-source">{row.dir ? 'directory' : 'file'}</span>
                            </button>
                          )
                        })}
                        {popup.files.more > 0 && <div className="chat__popup-note">+{popup.files.more} more — keep typing</div>}
                      </>
                    )
                  ) : (
                    (popup.prompts?.length ?? 0) === 0 ? (
                      <div className="chat__popup-note" data-chat-popup-empty>no prompts match — save one with ⌘K, or add .claude/commands/*.md to this directory</div>
                    ) : (
                      <>
                      <div className="chat__popup-head" data-chat-popup-head>prompts · {popup.prompts?.length ?? 0}</div>
                      {popup.prompts?.map((p, i) => (
                        <button key={p.id} type="button" role="option" aria-selected={i === popup.index} className={`chat__popup-row${i === popup.index ? ' chat__popup-row--on' : ''}`} data-chat-prompt={p.id}
                          title={p.source === 'project' ? `Insert ${p.name} as written (a project prompt is never expanded)` : `Insert ${p.name}`} {...shellControl(() => acceptPrompt(p))}>
                          <span className="chat__popup-label">/{p.name}</span>
                          <span className="chat__popup-source">{p.source}</span>
                        </button>
                      ))}
                      </>
                    )
                  )}
                </div>
              )}
              <div className="chat__chips" data-chat-chips>
                <span className="chat__chip chat__chip--quiet" data-chat-chip="model" title="The model this conversation runs on">{snapshot?.model ?? backend}</span>
                {trailCount > 0 && <span className="chat__chip chat__chip--quiet" data-chat-chip="skills" title="Skills this agent has used">{trailCount} {trailCount === 1 ? 'skill' : 'skills'}</span>}
                <button type="button" className="chat__chip chat__chip--quiet chat__chip--verb" data-chat-chip="attach" title="Attach a file from this repository (@ in the message)" aria-label="Attach a file"
                  {...shellControl(() => { const next = draft === '' || /\s$/.test(draft) ? `${draft}@` : `${draft} @`; setDraft(next); refreshPopup(next, next.length); textareaRef.current?.focus() })}>@ attach</button>
              </div>
              <textarea
                ref={textareaRef}
                className="chat__input"
                data-chat-input
                value={draft}
                placeholder={composer.send.enabled ? `Message ${backend}…` : composer.send.reason}
                disabled={!composer.send.enabled}
                title={composer.send.enabled ? 'Your next message' : composer.send.reason}
                spellCheck={false}
                rows={composerRows(draft)}
                onChange={(e) => { setDraft(e.target.value); setRefusal(null); refreshPopup(e.target.value, e.target.selectionStart ?? e.target.value.length) }}
                // Stopped (a click into a text field must not start a drag)
                // AND focused: the palette captures focusedId at open, so a
                // click here that left the chat unfocused sent Insert prompt
                // to whichever terminal was focused before (composer.4).
                onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}
                onKeyDown={onComposerKey}
              />
              {refusal !== null && <p className="pf__note chat__refusal" data-chat-send-refusal role="alert">{refusal}</p>}
              <div className="chat__verbs">
                <button type="button" className="chat__verb chat__verb--send" data-chat-send disabled={!composer.send.enabled || (draft.trim() === '' && attachments.length === 0)}
                  title={composer.send.enabled ? 'Send — ⌘↩ sends' : composer.send.reason} aria-label="Send" {...shellControl(send)}>Send</button>
                <button type="button" className="chat__verb chat__verb--interrupt" data-chat-interrupt disabled={!composer.interrupt.enabled}
                  title={composer.interrupt.enabled ? 'Interrupt the answer in flight' : composer.interrupt.reason} aria-label="Interrupt" {...shellControl(interrupt)}>Interrupt</button>
              </div>
            </>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
