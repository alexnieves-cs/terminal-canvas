import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import { checklistSummary, parseChecklist, type ChecklistView, type ChecklistRun, type ChecklistEdit } from '@shared/checklist'
import { createChecklistSession } from '@shared/checklist-session'
import { sendRefusalSentence } from '@shared/agent-session'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { applyFileResult, useFileResult } from '@renderer/session/file-store'
import { getChat, useChat } from '@renderer/chat/chat-store'
import { registerChecklist, type ChecklistController } from './checklist-controllers'
import type { FileNodeProps } from './FileNode'
import type { CreationResult } from '@shared/verb-table'

function RunWord({ run, exists }: { run: ChecklistRun; exists: boolean }): JSX.Element {
  const chat = useChat(run.panelId)
  const snapshot = chat.snapshot
  const word = !exists ? 'conversation closed' : !snapshot ? 'unavailable' : snapshot.turns >= run.turn
    ? 'turn ended' : snapshot.pending.length ? 'needs review' : snapshot.status
  return <span className="checklist-node__run" title={`Conversation ${run.panelId} · sent ${new Date(run.sentAt).toLocaleString()}`}>{word}</span>
}

export function ChecklistNode(props: FileNodeProps & {
  agents: { id: string; label: string }[]
  onView: (id: string, view: ChecklistView) => void
}): JSX.Element {
  const { panel, agents, onView, readOnly = false } = props
  const id = panel.rect.id, path = panel.source.path
  const viewRef = useRef(onView); viewRef.current = onView
  const alive = useRef(true), busyHand = useRef(false)
  const readOnlyRef = useRef(readOnly); readOnlyRef.current = readOnly
  const agentsRef = useRef(agents); agentsRef.current = agents
  const session = useMemo(() => createChecklistSession(panel.source.checklist ?? {}, {
    read: () => window.canvas.file.read({ panelId: id, path }),
    write: (content, baseMtimeMs) => window.canvas.file.write({ path, content, baseMtimeMs }),
    changed: (view) => { if (alive.current) viewRef.current(id, view) }
  }), [id, path])
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot)
  const observed = useFileResult(id)
  const [text, setText] = useState(''), [agent, setAgent] = useState(''), [message, setMessage] = useState(''), [sending, setSending] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), drag = useRef<number | null>(null)
  const accepted = state.view.accepted
  const parsed = parseChecklist(accepted)
  const items = parsed.kind === 'document' ? parsed.items : []
  const disk = state.disk
  const pending = disk?.kind === 'text' && disk.content !== accepted
  const editable = !readOnly && !state.busy && !sending && accepted !== undefined && disk?.kind === 'text' && !disk.truncatedLines && !pending
  const reason = readOnly ? 'leave merged view to edit' : state.busy || sending ? 'waiting for the current operation' : pending || accepted === undefined ? 'review the file before editing' : disk?.kind !== 'text' || disk.truncatedLines ? 'the complete file is not readable' : undefined
  useEffect(() => {
    alive.current = true
    void session.refresh()
    return () => { alive.current = false; void window.canvas.file.close(id) }
  }, [session, id])
  useEffect(() => { if (observed) session.observe(observed) }, [session, observed])
  // Publish reads locally as well as through the watcher, so the ordinary file surfaces
  // and checklist agree even when the watcher dedupes a byte-identical write.
  useEffect(() => { if (state.disk) applyFileResult(id, state.disk) }, [id, state.disk])

  const controller = useMemo<ChecklistController>(() => ({
    edit: async (operation, value) => {
      if (readOnlyRef.current || busyHand.current || !alive.current) return { kind: 'refused', reason: 'this checklist is read-only or busy' }
      let success = false
      if (operation === 'undo') success = await session.undo()
      else if (operation === 'redo') success = await session.redo()
      else {
        const numbers = (value ?? '').trim().split(/\s+/).map(Number)
        let edit: ChecklistEdit
        if (operation === 'add') edit = { type: 'add', text: value ?? '' }
        else if ((operation === 'toggle' || operation === 'delete') && /^\d+$/.test(value ?? '')) edit = { type: operation, line: Number(value) }
        else if (operation === 'move' && /^\d+\s+\d+$/.test(value ?? '')) edit = { type: 'move', line: numbers[0], to: numbers[1] }
        else return { kind: 'refused', reason: 'use add <text>, toggle <line>, delete <line>, move <line> <destination>, undo or redo; lines are zero-based' }
        success = await session.edit(edit)
      }
      return success ? { kind: 'ran' } : { kind: 'refused', reason: session.snapshot().error ?? 'nothing to undo or redo' }
    },
    hand: async (line, target) => {
      if (readOnlyRef.current || busyHand.current || session.snapshot().busy || !alive.current) return { kind: 'refused', reason: 'this checklist is read-only or busy' }
      busyHand.current = true; setSending(true)
      try {
        await session.refresh()
        const current = session.snapshot(), doc = parseChecklist(current.view.accepted)
        if (!alive.current || current.disk?.kind !== 'text' || current.disk.truncatedLines || current.disk.content !== current.view.accepted || doc.kind !== 'document') return { kind: 'refused', reason: 'review the current file before handing off work' }
        const item = doc.items.find((i) => i.line === line), snapshot = getChat(target).snapshot
        if (!item || !item.text.trim()) return { kind: 'refused', reason: 'choose a nonempty task' }
        if (!agentsRef.current.some((a) => a.id === target) || !snapshot) return { kind: 'refused', reason: 'choose an open agent or teammate conversation' }
        if (!['not-started', 'ready', 'exited'].includes(snapshot.status) || snapshot.pending.length) return { kind: 'refused', reason: 'that conversation is busy or waiting for approval — wait for it to finish' }
        const answer = await window.canvas.agentSession.send(target, item.text)
        const refusal = sendRefusalSentence(answer)
        if (refusal) return { kind: 'refused', reason: refusal }
        session.link(line, { panelId: target, sentAt: Date.now(), turn: snapshot.turns + 1, text: item.text })
        return { kind: 'ran', note: answer === 'queued' ? 'queued' : 'sent' }
      } catch (error) { return { kind: 'refused', reason: String(error) } }
      finally { busyHand.current = false; if (alive.current) setSending(false) }
    }
  }), [session])
  useEffect(() => registerChecklist(id, controller), [id, controller])
  const report = (result: CreationResult): void => { if (alive.current) setMessage(result.kind === 'refused' ? result.reason : result.note ?? '') }
  const edit = (operation: string, value?: string): void => { void controller.edit(operation, value).then(report) }
  useEffect(() => {
    const focused = (): boolean => body.current?.contains(document.activeElement) === true
    const offUndo = window.canvas.edit.onUndo(() => { if (focused() && document.activeElement !== input.current) void controller.edit('undo').then(report) })
    const offRedo = window.canvas.edit.onRedo(() => { if (focused() && document.activeElement !== input.current) void controller.edit('redo').then(report) })
    const offPaste = window.canvas.edit.onPaste((clip) => {
      const el = input.current
      if (el && document.activeElement === el) setText(el.value.slice(0, el.selectionStart ?? 0) + clip.replace(/[\r\n]+/g, ' ') + el.value.slice(el.selectionEnd ?? 0))
    })
    const offCopy = window.canvas.edit.onCopy(() => {
      const el = input.current
      if (el && document.activeElement === el) void navigator.clipboard.writeText(el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0))
    })
    return () => { offUndo(); offRedo(); offPaste(); offCopy() }
  }, [controller])
  return <PanelFrame id={id} kind="file" kindWord="checklist" rect={panel.rect} z={panel.z} selected={props.selected}
    className="checklist-node" rootAttrs={{ 'data-checklist': '' }} title={panel.title ?? path.split('/').pop() ?? 'Checklist'}
    readOnly={readOnly} linkTarget={props.linkTarget} onSelect={props.onSelect} onBeginDrag={props.onBeginDrag} onBeginLink={props.onBeginLink}
    close={readOnly ? null : { armed: false, armedText: 'close?', title: 'Close checklist', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) } }}
    chrome={<span className="pf__summary" data-checklist-summary>{accepted === undefined ? '' : checklistSummary(accepted)}</span>}>
    <div ref={body} className="checklist-node__body" data-checklist-body tabIndex={0} onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }} onKeyDown={(e) => {
      e.stopPropagation()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.target !== input.current) { e.preventDefault(); edit(e.shiftKey ? 'redo' : 'undo') }
    }}>
      {(pending || accepted === undefined) && disk?.kind === 'text' && <section className="checklist-node__review">
        <p>{accepted === undefined ? 'Read this checklist before editing or sending work.' : 'The file changed outside this checklist. Review the draft.'}</p>
        <button type="button" onClick={() => setReviewOpen(!reviewOpen)}>{reviewOpen ? 'Hide draft' : 'Review draft'}</button>
        {reviewOpen && <><pre data-checklist-draft>{disk.content}</pre><button type="button" disabled={readOnly || state.busy || !!disk.truncatedLines} onClick={() => { void session.accept().then((ok) => { if (ok) setReviewOpen(false) }) }}>Accept reviewed draft</button></>}
      </section>}
      {disk === undefined ? <p>Reading checklist…</p> : disk.kind !== 'text' ? <p role="status">{disk.kind === 'unreadable' ? disk.detail : `File ${disk.kind} — restore the Markdown file, then refresh.`}</p> : disk.truncatedLines > 0 ? <p>File exceeds the viewing limit; editing is disabled.</p> : null}
      {/* M256. Completion as a PROGRESSION: a bar and the count it fills to,
          above the list it measures. Absent with no items — "0 of 0" is a
          zero-value statement. */}
      {items.length > 0 && (() => {
        const done = items.filter((i) => i.checked).length
        return <div className="checklist-node__progress" data-checklist-progress={`${done}/${items.length}`} data-complete={done === items.length ? '' : undefined}>
          <div className="checklist-node__progress-track" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
            <span className="checklist-node__progress-fill" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <span className="checklist-node__progress-word">{done === items.length ? 'All done' : `${done} of ${items.length} done`}</span>
        </div>
      })()}
      {parsed.kind === 'document' && parsed.malformed.length > 0 && <p>{parsed.malformed.length} task-like line(s) could not be read; their text is preserved.</p>}
      <ul className="checklist-node__items">
        {items.map((item, index) => <li key={item.line} data-checklist-line={item.line} data-checked={item.checked ? '' : undefined} draggable={editable} onDragStart={(e) => { e.stopPropagation(); drag.current = item.line; e.dataTransfer.setData('application/x-checklist-item', `${id}:${item.line}`) }} onDragEnd={() => { drag.current = null }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (editable && drag.current !== null && e.dataTransfer.getData('application/x-checklist-item') === `${id}:${drag.current}`) edit('move', `${drag.current} ${item.line}`); drag.current = null }}>
          <label><input type="checkbox" checked={item.checked} disabled={!editable} title={reason} onChange={() => edit('toggle', String(item.line))} /><span>{item.text || 'Untitled task'}</span></label>
          {state.view.runs?.[item.line] && <RunWord run={state.view.runs[item.line]} exists={agents.some((a) => a.id === state.view.runs![item.line].panelId)} />}
          <div className="checklist-node__actions">
            <button type="button" aria-label={`Move ${item.text} up`} disabled={!editable || index === 0} onClick={() => edit('move', `${item.line} ${items[index - 1].line}`)}>Up</button>
            <button type="button" aria-label={`Move ${item.text} down`} disabled={!editable || index === items.length - 1} onClick={() => edit('move', `${item.line} ${items[index + 1].line}`)}>Down</button>
            <button type="button" disabled={!editable || !agent} title={reason ?? (!agent ? 'choose an agent conversation below' : undefined)} onClick={() => { void controller.hand(item.line, agent).then(report) }}>Hand to agent</button>
            <button type="button" aria-label={`Delete ${item.text}`} disabled={!editable} title={reason} onClick={() => edit('delete', String(item.line))}>Delete</button>
          </div>
        </li>)}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); if (editable) void controller.edit('add', text).then((r) => { report(r); if (r.kind === 'ran') setText('') }) }}>
        <input ref={input} aria-label="New checklist item" placeholder="Add a task" value={text} disabled={!editable} title={reason} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={!editable || !text.trim()} title={reason ?? (!text.trim() ? 'write a task first' : undefined)}>Add</button>
      </form>
      <div className="checklist-node__tools">
        <select aria-label="Agent for checklist item" value={agent} onChange={(e) => setAgent(e.target.value)} disabled={readOnly || sending}>
          <option value="">{agents.length ? 'Choose agent…' : 'Open an agent conversation first'}</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <button type="button" disabled={!editable || !state.undo} title={reason ?? (!state.undo ? 'nothing to undo' : undefined)} onClick={() => edit('undo')}>Undo</button>
        <button type="button" disabled={!editable || !state.redo} title={reason ?? (!state.redo ? 'nothing to redo' : undefined)} onClick={() => edit('redo')}>Redo</button>
        <button type="button" disabled={state.busy} onClick={() => { void session.refresh() }}>Refresh</button>
      </div>
      {(message || state.error) && <p role="status">{message || state.error}</p>}
    </div>
  </PanelFrame>
}
