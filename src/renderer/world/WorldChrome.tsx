import { useEffect, useMemo, useRef, useState, type FormEvent, type JSX, type KeyboardEvent, type RefObject } from 'react'
import { KindChat, Minus, Plus, Send } from '@renderer/icons'
import { getAgent, postTeamAsk, replayAt, useAgentIds, useReplayAt } from './agent-world-store'
import { useWorldActions, worldActions } from './world-context-store'
import { askTarget, CONTROL_SELECTOR, enterOpens, FIELD_SELECTOR, openableFrom, OVERLAY_SELECTOR, selectAgent, selectedAgent, useSelectedAgent } from './world-select'
import { isWorldOn } from './world-toggle'
import { useRoster, useWaiting } from './world-roster'
import { WorldPeers } from './WorldPeers'
import { WorldTime } from './WorldTime'
import { ASK_MAX, askText, legendEntries, type CameraApi } from './world-set'

/**
 * The overlay chrome over the 3D room (M416), after the reference's layout:
 * "Fit room" and the zoom pair bottom-left, the "Ask your team" pill
 * bottom-centre, and a status legend along the bottom edge — a dot in each
 * live agent's colour and its name.
 *
 * Plain DOM, and it imports NO three.js: it is rendered by the lazily-loaded
 * WorldView but is not part of the three importer set (`verify:world
 * world.door.1`), so nothing here may start to. The camera is reached through
 * the `CameraApi` WorldView fills in; the roster is the live agents the store
 * says.
 *
 * The pill SENDS (M422). It was a board post with no agent behind it (M416),
 * honest but a dead end; now it is addressed — to the robot a person picked,
 * or the only live agent that can take a message, or whoever the "To" picker
 * names — and it goes through Canvas's own send door (`worldActions().send`,
 * the composer's `agentSession.send`). What came back is said beside the
 * field: sent, or the refusal's own sentence with the draft kept. A sent
 * request is also written on the board (`postTeamAsk`), so the room keeps a
 * line of what was asked of whom. A terminal agent takes no message from
 * here — its input is a PTY, and typing into one from across the room is how
 * a stray Enter runs a command — so the picker names chat agents only.
 *
 * Escape inside the field clears and leaves it (WorldStage ignores an Escape
 * that lands in an input, on purpose, so this one does not also drop the
 * person out of the view).
 */

/** How long the "Sent" line stays. */
const POSTED_MS = 2600

export function WorldChrome({ camera }: { camera: RefObject<CameraApi | null> }): JSX.Element {
  const roster = useRoster()
  // The first-seen order the robots take their colours from, so a dot is its robot's shell.
  const order = useAgentIds()
  const legend = useMemo(() => legendEntries(roster, order), [roster, order])
  const picked = useSelectedAgent()
  const actions = useWorldActions()
  const sendable = useMemo(() => roster.filter((a) => actions?.canSend(a.agentId) ?? false), [roster, actions])
  const target = askTarget(picked, roster.map((a) => a.agentId), (id) => actions?.canSend(id) ?? false)
  const targetName = roster.find((a) => a.agentId === target)?.name ?? null
  const [draft, setDraft] = useState('')
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const timer = useRef<number | null>(null)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  const say = (next: { ok: boolean; text: string }): void => {
    setSaid(next)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSaid(null), next.ok ? POSTED_MS : POSTED_MS * 2)
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const text = askText(draft)
    if (text === null || target === null || actions === null || sending || past) return
    const name = targetName ?? target
    setSending(true)
    void actions.send(target, text).then((refusal) => {
      setSending(false)
      if (refusal !== null) { say({ ok: false, text: `Not sent to ${name}: ${refusal}` }); return }
      postTeamAsk(`${name}: ${text}`)
      setDraft('')
      say({ ok: true, text: `Sent to ${name}` })
    })
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    setDraft('')
    field.current?.blur()
  }
  // M429. Enter opens the PICKED robot's panel — the keyboard's door to what a
  // double-click does, through the same `open` and the same gate
  // (`openableFrom`). Never Enter that belongs elsewhere (`enterOpens`): in a
  // field (the Ask pill sends on Enter), on a focused button (its own
  // activation — the card's Approve is a button), in an open menu or dialog,
  // a chord, an IME composing, a held key repeating. Read from the stores at
  // the keypress, so the listener is made once; and only while the room is
  // ON, since the chrome is still mounted during the move back.
  useEffect(() => {
    const onEnter = (event: globalThis.KeyboardEvent): void => {
      const el = event.target instanceof HTMLElement ? event.target : null
      const facts = {
        key: event.key,
        repeat: event.repeat,
        modified: event.metaKey || event.ctrlKey || event.altKey || event.shiftKey,
        composing: event.isComposing,
        inField: el?.closest(FIELD_SELECTOR) != null,
        onControl: el?.closest(CONTROL_SELECTOR) != null,
        overlayOpen: document.querySelector(OVERLAY_SELECTOR) !== null
      }
      if (!enterOpens(facts) || !isWorldOn()) return
      const id = selectedAgent()
      const door = worldActions()
      if (!openableFrom(id, replayAt() !== null, door)) return
      event.preventDefault()
      door!.open(id)
    }
    window.addEventListener('keydown', onEnter)
    return () => window.removeEventListener('keydown', onEnter)
  }, [])
  // M422/M424: the decision table's count, over the room — a sign in the scene sat on the waiting
  // robots' own cards. A press picks the agent that has waited longest, so its request card stands full.
  const waiting = useWaiting()
  const firstName = waiting.length > 0 ? (getAgent(waiting[0]!)?.name ?? waiting[0]!) : null
  // M425: the past room takes no messages — the agent it shows may be somewhere else by now.
  const past = useReplayAt() !== null
  const placeholder = past ? 'Back to Live to ask' : sendable.length === 0 ? 'No agent here takes a message' : targetName !== null ? `Ask ${targetName}` : 'Ask your team'

  return (
    <div className="world-chrome" data-world-chrome>
      <WorldTime camera={camera} />
      <WorldPeers camera={camera} />
      <div className="world-tools" role="group" aria-label="Camera">
        <button type="button" className="world-tools__fit" onClick={() => camera.current?.fit()} data-world-fit>Fit room</button>
        <button type="button" className="world-tools__step" aria-label="Zoom out" title="Zoom out" onClick={() => camera.current?.zoom(-1)} data-world-zoom="out"><Minus size={14} /></button>
        <button type="button" className="world-tools__step" aria-label="Zoom in" title="Zoom in" onClick={() => camera.current?.zoom(1)} data-world-zoom="in"><Plus size={14} /></button>
      </div>

      <form className="world-ask" onSubmit={submit} data-world-ask data-sending={sending ? '' : undefined}>
        <span className="world-ask__icon" aria-hidden="true"><KindChat size={16} /></span>
        <input
          ref={field}
          className="world-ask__field"
          type="text"
          value={draft}
          maxLength={ASK_MAX}
          placeholder={placeholder}
          aria-label="Ask your team"
          autoComplete="off"
          spellCheck={false}
          disabled={sendable.length === 0 || past}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKey}
        />
        {/* Who it goes to — the picked robot, set from here too. One control, so the addressee is never a guess. */}
        <select
          className="world-ask__to"
          aria-label="Send to"
          value={target ?? ''}
          disabled={sendable.length === 0}
          onChange={(event) => selectAgent(event.target.value === '' ? null : event.target.value)}
          data-world-ask-to
        >
          {target === null ? <option value="">To…</option> : null}
          {sendable.map((a) => <option key={a.agentId} value={a.agentId}>To {a.name}</option>)}
        </select>
        <button type="submit" className="world-ask__send" aria-label={targetName !== null ? `Send to ${targetName}` : 'Send'} title={targetName !== null ? `Send to ${targetName}` : 'Pick who to ask'} disabled={draft.trim() === '' || target === null || sending}><Send size={14} /></button>
        <span className={`world-ask__posted${said !== null && !said.ok ? ' world-ask__posted--refused' : ''}`} role="status" aria-live="polite">{said?.text ?? ''}</span>
      </form>

 {waiting.length > 0 ? (
        <button type="button" className="world-requests" onClick={() => selectAgent(waiting[0]!)} data-world-requests>
          <strong>{waiting.length === 1 ? '1 request' : `${waiting.length} requests`}</strong>
          <span>{waiting.length === 1 ? `${firstName} is waiting on you` : `${firstName} has waited longest`}</span>
        </button>
      ) : null}

      <ul className="world-legend" aria-label="Live agents" data-world-legend>
        {legend.shown.length === 0 ? <li className="world-legend__none">No live agents</li> : null}
        {legend.shown.map((entry) => (
          <li key={entry.agentId} className="world-legend__item">
            <span className="world-legend__dot" style={{ background: entry.color }} aria-hidden="true" />
            <span className="world-legend__name">{entry.name}</span>
          </li>
        ))}
        {legend.more > 0 ? <li className="world-legend__more">+{legend.more} more</li> : null}
      </ul>
    </div>
  )
}
