import { useEffect, useMemo, useRef, useState, type FormEvent, type JSX, type KeyboardEvent, type RefObject } from 'react'
import { KindChat, Minus, Plus, Send } from '@renderer/icons'
import { postTeamAsk, useAgentIds } from './agent-world-store'
import { useRoster } from './world-roster'
import { ASK_MAX, legendEntries, type CameraApi } from './world-set'

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
 * says; the pill's one write is `postTeamAsk`.
 *
 * The pill POSTS TO THE BOARD. There was no existing "ask the team" command to
 * wire it to (the app's team-ask queue is an agent asking people, the other
 * way), so a request is a `message` event in the world's store and the
 * whiteboard shows it. It dispatches to no running agent, and the hint beside
 * the field says so, because a field that looks like it sends and does not is
 * the worse kind of dead control.
 *
 * Escape inside the field clears and leaves it (WorldStage ignores an Escape
 * that lands in an input, on purpose, so this one does not also drop the
 * person out of the view).
 */

/** How long the "Posted" line stays. */
const POSTED_MS = 2600

export function WorldChrome({ camera }: { camera: RefObject<CameraApi | null> }): JSX.Element {
  const roster = useRoster()
  // The first-seen order the robots take their colours from, so a dot is its robot's shell.
  const order = useAgentIds()
  const legend = useMemo(() => legendEntries(roster, order), [roster, order])
  const [draft, setDraft] = useState('')
  const [posted, setPosted] = useState(false)
  const timer = useRef<number | null>(null)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!postTeamAsk(draft)) return
    setDraft('')
    setPosted(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPosted(false), POSTED_MS)
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    setDraft('')
    field.current?.blur()
  }

  return (
    <div className="world-chrome" data-world-chrome>
      <div className="world-tools" role="group" aria-label="Camera">
        <button type="button" className="world-tools__fit" onClick={() => camera.current?.fit()} data-world-fit>Fit room</button>
        <button type="button" className="world-tools__step" aria-label="Zoom out" title="Zoom out" onClick={() => camera.current?.zoom(-1)} data-world-zoom="out"><Minus size={14} /></button>
        <button type="button" className="world-tools__step" aria-label="Zoom in" title="Zoom in" onClick={() => camera.current?.zoom(1)} data-world-zoom="in"><Plus size={14} /></button>
      </div>

      <form className="world-ask" onSubmit={submit} data-world-ask>
        <span className="world-ask__icon" aria-hidden="true"><KindChat size={16} /></span>
        <input
          ref={field}
          className="world-ask__field"
          type="text"
          value={draft}
          maxLength={ASK_MAX}
          placeholder="Ask your team"
          aria-label="Ask your team"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKey}
        />
        <span className="world-ask__hint" aria-hidden="true">Posts to the board</span>
        <button type="submit" className="world-ask__send" aria-label="Post to the board" title="Post to the board" disabled={draft.trim() === ''}><Send size={14} /></button>
        <span className="world-ask__posted" role="status" aria-live="polite">{posted ? 'Posted to the board' : ''}</span>
      </form>

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
