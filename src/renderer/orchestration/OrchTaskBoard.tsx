import { useState, type JSX } from 'react'
import { shellControl } from '@renderer/shell/shell-control'
import { ApprovalDetail } from '@renderer/shell/ApprovalDetail'
import type { PendingApproval } from '@renderer/shell/rail-sections'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@renderer/primitives'
import type { BoardAction, BoardRow, BoardSide, TaskBoard } from './orch-task-board'

/**
 * M325. The task list Orchestrate opens on — `orch-task-board.ts` decides
 * the groups, the sentences and the one action per row; this renders them.
 *
 * A row's TITLE opens the task's workspace (the focus view), which is where a
 * task is worked on. Its ONE action is the primary control on the row; every
 * secondary operation (the canvas, the scene, Mark done) is in the row's ⋯
 * menu, so a crowded board still reads as one decision per row.
 *
 * Two responses fit inside a row and are answered there, without opening the
 * canvas or the task: a PERMISSION (the same `ApprovalDetail` the Dock and
 * the queue show, through the one approval executor) and a QUESTION (a reply
 * sent through the chat composer's own send door). Everything else opens the
 * task on the side that answers it.
 */
export interface OrchTaskBoardProps {
  board: TaskBoard
  approvalOf: (panelId: string, requestId: string) => PendingApproval | undefined
  onOpen: (itemId: string, side?: BoardSide) => void
  onStart?: (itemId: string) => void
  onJump: (panelId: string) => void
  onShowOnCanvas: (itemId: string) => void
  onShowInScene: (itemId: string) => void
  onMarkDone?: (itemId: string) => void
  onAnswer?: (panelId: string, requestId: string, allow: boolean, scope?: 'session') => void
  /** The composer's own send door; resolves to a refusal sentence, or null when sent. */
  onSend?: (panelId: string, text: string) => Promise<string | null>
}

export function OrchTaskBoard(props: OrchTaskBoardProps): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  const total = props.board.groups.reduce((n, g) => n + g.rows.length, 0)
  return (
    <div className="tboard" data-board role="region" aria-label="Tasks">
      {total === 0 && (
        <p className="tboard__empty" data-board-empty>No tasks yet. Start one with + New task, ⌘K or a board card, and each task appears here with what it needs from you.</p>
      )}
      {props.board.groups.map((g) => {
        if (g.rows.length === 0) return null
        // Completed is history: counted, and listed only on request.
        const folded = g.id === 'done' && !doneOpen
        return (
          <section key={g.id} className="tboard__group" data-board-group={g.id} aria-label={g.label}>
            <h2 className="tboard__group-head">
              {g.id === 'done' ? (
                <button type="button" className="tboard__fold" aria-expanded={!folded} data-board-done-toggle {...shellControl(() => setDoneOpen(!doneOpen))}>
                  {g.label} <span className="tboard__count">{g.rows.length}</span> <span aria-hidden="true">{folded ? '▸' : '▾'}</span>
                </button>
              ) : (
                <>{g.label} <span className="tboard__count">{g.rows.length}</span></>
              )}
            </h2>
            {!folded && (
              <ul className="tboard__rows">
                {g.rows.map((row) => (
                  <BoardRowView key={row.key} row={row} expanded={open === row.key} onExpand={(v) => setOpen(v ? row.key : null)} {...props} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function BoardRowView(p: OrchTaskBoardProps & { row: BoardRow; expanded: boolean; onExpand: (v: boolean) => void }): JSX.Element {
  const { row } = p
  const [menuOpen, setMenuOpen] = useState(false)
  const openRow = (side?: BoardSide): void => {
    if (row.itemId !== null) p.onOpen(row.itemId, side)
    else if (row.action.kind === 'jump' && row.action.panelId !== '') p.onJump(row.action.panelId)
  }
  const act = (a: BoardAction): void => {
    if (a.kind === 'answer' || a.kind === 'reply') { p.onExpand(!p.expanded); return }
    if (a.kind === 'open') { openRow(a.side); return }
    if (a.kind === 'start') { if (row.itemId !== null) p.onStart?.(row.itemId); return }
    if (a.panelId !== '') p.onJump(a.panelId)
  }
  const approval = row.action.kind === 'answer' ? p.approvalOf(row.action.panelId, row.action.requestId) : undefined
  const actionable = row.action.kind !== 'answer' || (approval !== undefined && p.onAnswer !== undefined)
  return (
    <li className="tboard__row" data-board-row={row.key} data-board-row-group={row.group} data-board-action={row.action.kind}>
      <button type="button" className="tboard__main" data-board-open title={row.itemId === null ? 'Open on canvas' : 'Open this task\'s workspace'} {...shellControl(() => openRow())}>
        <span className="tboard__title">{row.title}</span>
        <span className="tboard__status" data-board-status>{row.status}</span>
        {row.plan !== undefined && <span className="tboard__plan" data-board-plan>{row.plan}</span>}
      </button>
      <span className="tboard__agents" data-board-agents={row.agents.length}>
        {row.agents.map((a) => (
          <span key={a.id} className="tboard__agent" title={`${a.title} — ${a.word ?? a.state}`}>
            <span className="status-dot" data-tone={a.tone} aria-hidden="true" />{a.title}
          </span>
        ))}
        {row.idle > 0 && <span className="tboard__idle" data-board-idle={row.idle}>{row.agents.length === 0 ? `${row.idle} idle` : `+${row.idle} idle`}</span>}
        {row.agents.length === 0 && row.idle === 0 && <span className="tboard__idle">No agent</span>}
      </span>
      <span className="tboard__checks" data-board-checks={row.checks.failed > 0 ? 'failed' : row.checks.passed > 0 ? 'passed' : 'none'}>{row.checks.text}</span>
      <span className="tboard__act">
        <button type="button" className="tboard__primary" data-board-primary={row.action.kind} aria-expanded={row.action.kind === 'answer' || row.action.kind === 'reply' ? p.expanded : undefined}
          disabled={!actionable || (row.action.kind === 'start' && p.onStart === undefined) || (row.action.kind === 'reply' && p.onSend === undefined)}
          title={!actionable ? 'This request is no longer waiting' : undefined}
          {...shellControl(() => act(row.action))}>{row.action.label}{row.more > 0 ? ` (+${row.more})` : ''}</button>
        <Menu open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuTrigger className="tboard__more" aria-label={`More for ${row.title}`} data-board-more>⋯</MenuTrigger>
          <MenuContent>
            <div className="tboard__menu" role="menu">
              {row.itemId !== null && <MenuItem className="tboard__menu-item" data-board-menu="open" onSelect={() => openRow()}>Open workspace</MenuItem>}
              {row.itemId !== null && <MenuItem className="tboard__menu-item" data-board-menu="canvas" onSelect={() => p.onShowOnCanvas(row.itemId as string)}>Show on canvas</MenuItem>}
              {row.itemId !== null && <MenuItem className="tboard__menu-item" data-board-menu="scene" onSelect={() => p.onShowInScene(row.itemId as string)}>Show in scene</MenuItem>}
              {row.itemId === null && row.action.kind === 'jump' && <MenuItem className="tboard__menu-item" onSelect={() => { if (row.action.kind === 'jump') p.onJump(row.action.panelId) }}>Open on canvas</MenuItem>}
              {row.itemId !== null && row.group !== 'done' && p.onMarkDone !== undefined && (
                <MenuItem className="tboard__menu-item" data-board-menu="done" onSelect={() => p.onMarkDone?.(row.itemId as string)}>Mark done</MenuItem>
              )}
            </div>
          </MenuContent>
        </Menu>
      </span>
      {p.expanded && row.action.kind === 'answer' && approval !== undefined && p.onAnswer !== undefined && (
        <div className="tboard__respond" data-board-respond="answer">
          <ApprovalDetail approval={approval} agent={row.agents.find((a) => a.id === approval.id)?.title ?? 'The agent'}
            {...(row.itemId === null ? {} : { task: row.title })}
            onAnswer={(allow, scope) => { p.onAnswer?.(approval.id, approval.requestId, allow, scope); p.onExpand(false) }} />
        </div>
      )}
      {p.expanded && row.action.kind === 'reply' && p.onSend !== undefined && (
        <BoardReply panelId={row.action.panelId} onSend={p.onSend} onDone={() => p.onExpand(false)} />
      )}
    </li>
  )
}

/** A reply to an agent's question, through the composer's one send door. */
function BoardReply({ panelId, onSend, onDone }: { panelId: string; onSend: (panelId: string, text: string) => Promise<string | null>; onDone: () => void }): JSX.Element {
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const send = (): void => {
    const t = text.trim()
    if (t === '' || busy) return
    setBusy(true)
    void onSend(panelId, t).then((refused) => {
      setBusy(false)
      if (refused !== null) { setNote(refused); return }
      setText('')
      onDone()
    }, (e: unknown) => { setBusy(false); setNote(String(e)) })
  }
  return (
    <div className="tboard__respond" data-board-respond="reply">
      <textarea className="tboard__reply" data-board-reply data-edit-owner rows={2} value={text} autoFocus placeholder="Your reply — sent to the agent as its next message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send() } if (e.key === 'Escape') { e.preventDefault(); onDone() } }} />
      <span className="tboard__respond-verbs">
        <button type="button" className="tboard__primary" data-board-reply-send disabled={text.trim() === '' || busy} {...shellControl(send)}>{busy ? 'Sending…' : 'Send reply'}</button>
        <button type="button" className="tboard__secondary" {...shellControl(onDone)}>Cancel</button>
        {note !== null && <span className="tboard__note" role="status">{note}</span>}
      </span>
    </div>
  )
}
