import { useEffect, useState, useSyncExternalStore, type FormEvent, type JSX } from 'react'
import { shortcutById } from '@shared/shortcuts'
import { useAgent, useReplayAt } from './agent-world-store'
import { factParts } from './world-facts'
import { askChip } from './world-structure'
import { useWorldActions, useWorldContext, type WorldActions } from './world-context-store'
import {
  agentShort, attentionSnapshot, emitApproved, fileOf, SHELL_ROOM_SENTENCE, shellFromItem,
  showShell, snoozePanel, subscribeFlight, walkAttention, type ShellCard
} from './world-flight'
import {
  diffPreview, focusPrimary, focusQuestion, focusSteps, replyControl, replyRoute,
  useFocusPreview, useFocusedAgent, type ReplyRoute
} from './world-select'

/**
 * The close-up (M452), screen 12. Plain DOM on purpose: it sits over the room
 * and must not join the three importer set (`world.door.1`). Approve, Deny
 * and Reply call the doors Canvas registered on the room — the same answer,
 * send and open the card already uses — and never the session bridge themselves.
 *
 * One filled control. A pending request fills Approve; with nothing pending,
 * Open in Canvas fills, so the surface still has a primary.
 */

function Kbd({ chord }: { chord: string | undefined }): JSX.Element | null {
  if (chord === undefined || chord === '') return null
  return <kbd>{chord}</kbd>
}

/**
 * A shell prompt (M453). The same sheet, and not a reply: the command runs
 * in its terminal. Next is the queue walk. Snooze hides this id for ten minutes.
 */
function ShellConsoleCard({ card, actions, past }: { card: ShellCard; actions: WorldActions | null; past: boolean }): JSX.Element {
  const stepInChord = shortcutById('step-in')?.chord
  const openable = actions !== null && actions.canOpen(card.agentId) && !past
  return (
    <aside className="world-focus" role="dialog" aria-modal="false" aria-label="Shell console" data-world-focus-sheet data-world-shell-card>
      <header className="world-focus__shell-head">
        <span className="world-focus__mark" data-tone="needs-you" aria-hidden="true" />
        <h2 className="world-focus__question">{card.title}</h2>
        {card.place !== '' ? <span className="world-focus__shell-place">{card.place}</span> : null}
        <span className="world-focus__shell-kind">Shell console</span>
      </header>
      {card.prompt !== '' ? <p className="world-focus__shell-prompt">{card.prompt}</p> : null}
      {card.command !== '' ? (
        <pre className="world-focus__shell-command"><code>{card.command}</code></pre>
      ) : null}
      <p className="world-focus__shell-note">{SHELL_ROOM_SENTENCE}</p>
      <div className="world-focus__foot">
        <button
          type="button"
          className="world-focus__act"
          data-primary=""
          data-world-focus-open
          disabled={!openable}
          onClick={() => actions?.open(card.agentId)}
        >
          Open in Canvas <Kbd chord={stepInChord} />
        </button>
        <button
          type="button"
          className="world-focus__act"
          data-world-shell-snooze
          onClick={() => snoozePanel(card.agentId, Date.now())}
        >
          Snooze 10m
        </button>
        <button
          type="button"
          className="world-focus__act"
          data-world-shell-next
          onClick={() => {
            const step = walkAttention(1)
            if (step === null) return
            const item = attentionSnapshot().items.find((row) => row.panelId === step.id)
            if (item?.kind === 'shell-prompt') showShell(shellFromItem(item, card.place))
            else showShell(null)
          }}
        >
          Next</button>
      </div>
    </aside>
  )
}

export function WorldFocusSheet(): JSX.Element | null {
  const id = useFocusedAgent()
  const preview = useFocusPreview()
  const ctx = useWorldContext()
  const actions = useWorldActions()
  const past = useReplayAt() !== null
  const record = useAgent(id ?? '')
  const [draft, setDraft] = useState('')
  const [full, setFull] = useState(false)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const snap = useSyncExternalStore(subscribeFlight, attentionSnapshot, attentionSnapshot)
  useEffect(() => {
    if (id !== null && snap.fullDiff === id) setFull(true)
  }, [id, snap.fullDiff])

  if (id === null) return null
  const shell = snap.shell !== null && snap.shell.agentId === id ? snap.shell : null
  if (shell !== null) return <ShellConsoleCard card={shell} actions={actions} past={past} />
  const task = ctx.tasks.find((item) => item.members.includes(id))
  const live = past ? undefined : ctx.approvals.find((item) => item.agentId === id)
  const shown = preview !== null && preview.agentId === id ? preview : null
  const asked = focusQuestion(shown, id, live, record === undefined ? null : askChip(record))
  const pending = asked.requestId !== null
  const primary = focusPrimary(pending)
  const allowChord = shortcutById('allow')?.chord
  const stepInChord = shortcutById('step-in')?.chord
  const steps = focusSteps(shown, id, task?.steps ?? [])
  const facts = past ? undefined : (preview !== null && preview.agentId === id ? preview.facts : ctx.facts[id])
  const parts = factParts(facts, record?.name ?? '')
  const route: ReplyRoute = replyRoute({ canSend: actions?.canSend(id) ?? false, agentTerminal: actions?.agentTerminal(id) ?? false })
  const reply = replyControl(route, actions !== null)
  const openable = actions !== null && actions.canOpen(id) && !past

  const answer = (allow: boolean): void => {
    if (asked.requestId === null || actions === null || past) return
    // D9. The approval goes out now. The toast cannot un-tell an agent that already received y.
    const discard = actions.answer(id, asked.requestId, allow)
    if (!allow) return
    emitApproved({
      agent: agentShort(record?.name ?? ''),
      file: fileOf(asked.question, asked.diff),
      panelId: id,
      discard
    })
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const text = draft.trim()
    if (!reply.enabled || text === '' || actions === null || sending || past) return
    if (route === 'send') {
      setSending(true)
      void actions.send(id, text).then((refusal) => {
        setSending(false)
        if (refusal !== null) { setNote(refusal); return }
        setDraft('')
        setNote(null)
      })
      return
    }
    if (route === 'paste') {
      setSending(true)
      void actions.pasteReply(id, text).then((refusal) => {
        setSending(false)
        if (refusal !== null) { setNote(refusal); return }
        setDraft('')
        setNote(null)
      })
    }
  }

  return (
    <aside className="world-focus" role="dialog" aria-modal="false" aria-label="Focus" data-world-focus-sheet data-primary={primary}>
      {asked.question !== '' || asked.diff !== '' || pending ? (
        <section className="world-focus__section" aria-label="Request">
          <h2 className="world-focus__label">Request</h2>
          {asked.question !== '' ? <p className="world-focus__question">{asked.question}</p> : null}
          {asked.diff !== '' ? (
            <pre className="world-focus__diff" data-world-focus-diff={full ? 'full' : 'folded'}><code>{diffPreview(asked.diff, full)}</code></pre>
          ) : null}
          {pending ? (
            <div className="world-focus__verbs" role="group" aria-label="Answer the request">
              <button type="button" className="world-focus__act" data-primary={primary === 'approve' ? '' : undefined} data-world-focus-approve onClick={() => answer(true)}>
                Approve <Kbd chord={allowChord} />
              </button>
              <button type="button" className="world-focus__act" onClick={() => answer(false)} data-world-focus-deny>Deny</button>
              <button type="button" className="world-focus__act" aria-expanded={full} onClick={() => setFull((open) => !open)} data-world-focus-diff-toggle>
                {full ? 'Hide diff' : 'Full diff'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {steps.length > 0 ? (
        <section className="world-focus__section" aria-label="What it's doing">
          <h2 className="world-focus__label">What it's doing</h2>
          <ol className="world-focus__steps">
            {steps.map((step) => (
              <li key={step.id} className="world-focus__step" data-tone={step.tone}>
                <span className="world-focus__mark" aria-hidden="true" />
                <span className="world-focus__step-title">{step.title}</span>
                <span className="world-focus__step-word">{step.word}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {parts.length > 0 ? (
        <p className="world-focus__facts" data-world-focus-facts>
          {parts.map((part, index) => (
            <span key={part.key}>{index > 0 ? ' · ' : null}<span data-fact={part.key}>{part.text}</span></span>
          ))}
        </p>
      ) : null}

      <form className="world-focus__reply" onSubmit={submit} data-world-focus-reply={reply.enabled ? 'open' : 'closed'}>
        <textarea
          className="world-focus__composer"
          value={draft}
          rows={3}
          placeholder={reply.enabled ? 'Reply' : reply.reason ?? ''}
          aria-label="Reply"
          disabled={!reply.enabled || past}
          title={reply.reason ?? undefined}
          data-edit-owner=""
          onChange={(event) => setDraft(event.target.value)}
        />
        {reply.reason !== null ? <p className="world-focus__reason">{reply.reason}</p> : null}
        {note !== null ? <p className="world-focus__note" role="status">{note}</p> : null}
        <button type="submit" disabled={!reply.enabled || draft.trim() === '' || sending || past}>Send</button>
      </form>

      <div className="world-focus__foot">
        <button
          type="button"
          className="world-focus__act"
          data-primary={primary === 'open' ? '' : undefined}
          data-world-focus-open
          disabled={!openable}
          onClick={() => actions?.open(id)}
        >
          Open in Canvas <Kbd chord={stepInChord} />
        </button>
        <button
          type="button"
          className="world-focus__act world-focus__act--quiet"
          onClick={() => document.querySelector<HTMLButtonElement>('[data-seg="sessions"]')?.click()}
          data-world-focus-sessions
        >
          Sessions
        </button>
      </div>
    </aside>
  )
}
