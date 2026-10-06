import { Fragment, memo, useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore, type JSX, type MouseEvent } from 'react'
import { attentionLine, subscribeAttentionLine } from '@shared/attention-line'
import type { AgentState } from '@shared/types'
import type { AgentStatus } from '@shared/world-events'
import { agentWord, type Tone } from '@renderer/panels/panel-state'
import { flatTerraceLayout, panelsInRegion, urgentFace, type FlatTerracePlace, type WorldBox } from '@renderer/sessions/sessions-model'
import { getAgent, useAgent, useAgentIds, useReplayAt, worldNow } from './agent-world-store'
import { ACTIVITY_VERB, activityOf } from './world-activity'
import { useWorldActions, useWorldContext } from './world-context-store'
import { badgeFor, factParts } from './world-facts'
import { robotTint } from './world-palette'
import { useRoster } from './world-roster'
import { cardTitle, recentTools } from './world-scene'
import { hasArrival, isRepeatClick, OPEN_HINT, openableFrom, selectAgent, selectedAgent, takeArrival, useSelectedAgent } from './world-select'
import { boxFromStyle, terraceSignFromChip } from './world-structure'
import type { CameraApi } from './world-set'
import { WorldChrome } from './WorldChrome'
import { ACTIVITY_ICON, headlineOf, RequestBlock } from './WorldCardBody'

/**
 * The room with no WebGL (M431): the same agents, the same words and the same
 * doors as the 3D room, laid out as a grid of tiles — Orchestrate's flat SVG
 * bodies (M293) are the precedent. What a machine that gives no context (or
 * took the room's away) gets instead of a note and nothing else.
 *
 * Plain DOM, and it imports NO three.js, fiber or drei — directly or through
 * WorldCard (whose request block and lead it shares via `WorldCardBody`): it
 * is reached through its own pure-annotated `lazy()` in WorldStage, and the
 * whole point is that a machine that cannot draw the room never fetches the
 * scene's chunk (`verify:world world.flat.*`).
 *
 * Each tile is a card held open: the badge, the lead, what it said, the facts,
 * a waiting agent's request with Approve / Deny / Open, its last tool calls.
 * Every control reaches the room's existing doors (`worldActions()`), so a
 * person does nothing here that the 3D room would not let them do, and
 * nothing it would that they cannot.
 *
 * The chrome is the room's own (`WorldChrome flat`): the Ask pill, replay and
 * the away tour, teammates, the requests count, the legend — everything but
 * the camera's buttons. Those that MOVE the camera (a tour's beat, following
 * a teammate) reach this file's `CameraApi`, which scrolls a tile into view;
 * there is no zoom.
 */

/** The clock-driven parts of a tile (the "quiet" badge, a failed call's minute) are re-asked this often, as the 3D card does. */
const TICK_MS = 1000

/**
 * The feed's status, said with the canvas's word. The default covers a live
 * run: `agentWord` spells it, so this file does not.
 */
function feedFace(status: AgentStatus): { tone: Tone; word: string } {
  const agent: AgentState = status === 'waiting_approval' ? 'wants-you' : status === 'error' ? 'exited' : status === 'idle' ? 'idle' : 'busy'
  return agentWord(agent)
}

interface PlacedTerrace extends FlatTerracePlace {
  label: string
  members: string[]
}

/** The canvas regions, fitted into the plan. The canvas stays mounted under the room, so the boxes are the ones the 3D terraces stand on. */
function readTerraces(host: HTMLElement): PlacedTerrace[] {
  const panels: WorldBox[] = []
  for (const el of document.querySelectorAll<HTMLElement>('.panel[data-panel-id]')) {
    const id = el.getAttribute('data-panel-id')
    if (id === null) continue
    const box = boxFromStyle(id, el.style.left, el.style.top, el.style.width, el.style.height)
    if (box !== null) panels.push(box)
  }
  const regions: WorldBox[] = []
  const labels = new Map<string, string>()
  for (const el of document.querySelectorAll<HTMLElement>('[data-task-region]')) {
    const id = el.getAttribute('data-task-region')
    if (id === null) continue
    const box = boxFromStyle(id, el.style.left, el.style.top, el.style.width, el.style.height)
    if (box === null) continue
    regions.push(box)
    labels.set(id, terraceSignFromChip(el.querySelector('.task-region__chip')?.textContent ?? id))
  }
  const rect = host.getBoundingClientRect()
  return flatTerraceLayout(regions, { w: rect.width, h: rect.height }).map((place) => {
    const region = regions.find((item) => item.id === place.id)
    return {
      ...place,
      label: labels.get(place.id) ?? place.id,
      members: region === undefined ? [] : panelsInRegion(region, panels)
    }
  })
}

function samePlaces(a: readonly PlacedTerrace[], b: readonly PlacedTerrace[]): boolean {
  if (a.length !== b.length) return false
  return a.every((place, i) => {
    const other = b[i]
    return other !== undefined && place.id === other.id && place.left === other.left && place.top === other.top &&
      place.width === other.width && place.height === other.height && place.label === other.label &&
      place.members.join() === other.members.join()
  })
}

/** The member the terrace wears: the queue's own order, via `urgentFace`. */
function terraceFace(members: readonly string[]): { tone: Tone; word: string } | null {
  const faces: { tone: Tone; word: string }[] = []
  for (const id of members) {
    const record = getAgent(id)
    if (record !== undefined) faces.push(feedFace(record.status))
  }
  return urgentFace(faces)
}

export function WorldFlat(): JSX.Element {
  const roster = useRoster()
  // R-083. The pill publishes this sentence. The room does not import the pill, and it does not keep a second queue.
  const line = useSyncExternalStore(subscribeAttentionLine, attentionLine, attentionLine)
  // First-seen order: a tile's swatch is the colour its robot would have been.
  const order = useAgentIds()
  const picked = useSelectedAgent()
  // M425: the past room is a replay — re-rendered as the scrubber moves (and worldNow with it).
  useReplayAt()
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const timer = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const tiles = useRef(new Map<string, HTMLElement>())
  const grid = useRef<HTMLUListElement>(null)
  const plan = useRef<HTMLDivElement>(null)
  const [places, setPlaces] = useState<PlacedTerrace[]>([])
  const camera = useRef<CameraApi | null>(null)
  useEffect(() => {
    camera.current = {
      fit: () => grid.current?.scrollTo({ top: 0 }),
      // The flat room has no depth to move through; the chrome hides the zoom pair, and a stray call is nothing.
      zoom: () => undefined,
      focus: (agentId) => {
        const tile = tiles.current.get(agentId)
        if (tile === undefined) return false
        tile.scrollIntoView({ block: 'nearest' })
        return true
      },
      // M434: no floor to map — the chrome draws no minimap over the flat room — and nothing to centre on.
      plan: () => null,
      centre: () => undefined,
      // No orbit to glide. The 3D rig is the one that frames a pose.
      apply: () => undefined
    }
    return () => { camera.current = null }
  }, [])

  // The same two pick rules as the 3D room (WorldView, M429): a pick is of an agent IN the room, and a closed room keeps none.
  useEffect(() => {
    const id = selectedAgent()
    if (id !== null && !roster.some((a) => a.agentId === id)) selectAgent(null)
  }, [roster])
  useEffect(() => () => selectAgent(null), [])
  // A pick made elsewhere (the requests count, the Ask pill's "To" picker) is brought into view, as the 3D camera would glide to it.
  useEffect(() => {
    if (picked !== null) tiles.current.get(picked)?.scrollIntoView({ block: 'nearest' })
  }, [picked])
  // The same arrival the 3D rig takes. One of the two rooms is mounted, so this is the flat room's take.
  useEffect(() => {
    if (!hasArrival()) return
    const id = takeArrival((agentId) => roster.some((a) => a.agentId === agentId), worldNow())
    if (id === null) return
    selectAgent(id)
    tiles.current.get(id)?.scrollIntoView({ block: 'nearest' })
  }, [roster])
  useEffect(() => {
    const host = plan.current
    if (host === null) return
    const measure = (): void => {
      const next = readTerraces(host)
      setPlaces((prev) => samePlaces(prev, next) ? prev : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [roster])

  const now = worldNow()
  return (
    <div className="world-flat" data-world-flat>
      {line !== '' ? <p className="world-flat__pill" data-world-flat-pill>{line}</p> : null}
      <div ref={plan} className="world-flat__plan" aria-label="Tasks in the room">
        {places.map((place) => {
          const face = terraceFace(place.members)
          const waiting = place.members.find((id) => getAgent(id)?.status === 'waiting_approval')
          return (
            <article
              key={place.id}
              className="world-flat__terrace"
              data-world-flat-terrace={place.id}
              data-tone={face === null ? undefined : face.tone}
              style={{ left: place.left, top: place.top, width: place.width, height: place.height }}
            >
              <span className="world-flat__terrace-label">{place.label}</span>
              {face !== null ? <span className="world-flat__terrace-word">{face.word}</span> : null}
              {waiting !== undefined ? <RequestBlock agentId={waiting} /> : null}
            </article>
          )
        })}
      </div>
      <ul ref={grid} className="world-flat__grid" aria-label="Agents in the room">
        {roster.map((a) => (
          <FlatTile
            key={a.agentId}
            agentId={a.agentId}
            color={robotTint(a.agentId, order)}
            picked={picked === a.agentId}
            now={now}
            tiles={tiles.current}
          />
        ))}
      </ul>
      <WorldChrome camera={camera} flat />
    </div>
  )
}

const FlatTile = memo(function FlatTile({ agentId, color, picked, now, tiles }: { agentId: string; color: string; picked: boolean; now: number; tiles: Map<string, HTMLElement> }): JSX.Element | null {
  const record = useAgent(agentId)
  // Stable, so the memo holds: the room's CameraApi finds a tile by id through this map.
  const register = useCallback((el: HTMLElement | null) => { if (el === null) tiles.delete(agentId); else tiles.set(agentId, el) }, [tiles, agentId])
  const ctx = useWorldContext()
  const actions = useWorldActions()
  const past = useReplayAt() !== null
  if (record === undefined) return null
  // Present-day facts only (M428): the past room has none, as the 3D card.
  const facts = past ? undefined : ctx.facts[agentId]
  const held = facts?.held
  const badge = badgeFor(record, now, held !== undefined)
  const activity = activityOf(record, now)
  const verb = ACTIVITY_VERB[activity]
  const Icon = ACTIVITY_ICON[activity]
  const waiting = record.status === 'waiting_approval'
  const words = cardTitle(record)
  const approval = ctx.approvals.find((a) => a.agentId === agentId)
  const headline = headlineOf(record, approval, words, now, held)
  const parts = factParts(facts, record.name)
  const tools = waiting ? [] : recentTools(record)
  const watchers = ctx.peers.filter((p) => p.panelId === agentId)
  const openable = openableFrom(agentId, past, actions)
  const face = feedFace(record.status)

  // A click picks (and a second lets go), as a robot's does; a double-click opens its panel — and its second click must not undo the pick (M429).
  // Enter or Space on the focused tile is a click with detail 0 — and the chrome's window Enter stands
  // aside on a focused control (`enterOpens`) — so on a PICKED tile it is the tile's own "pick and press
  // Enter": it opens, as the hint says, rather than letting the pick go.
  const onClick = (event: MouseEvent): void => {
    if (isRepeatClick(event.detail)) return
    if (event.detail === 0 && picked && openable) { actions!.open(agentId); return }
    selectAgent(picked ? null : agentId)
  }
  const onDoubleClick = (): void => {
    if (!openableFrom(agentId, past, actions)) return
    selectAgent(agentId)
    actions!.open(agentId)
  }

  return (
    <li ref={register} className="world-flat__tile" data-badge={badge.kind} data-status={record.status} data-activity={activity} data-tone={face.tone} data-picked={picked ? '' : undefined} data-world-flat-tile={agentId}>
      <button
        type="button"
        className="world-flat__pick"
        aria-pressed={picked}
        aria-label={`${record.name}: ${verb ?? badge.word}${openable ? `. ${OPEN_HINT}` : ''}`}
        title={openable ? OPEN_HINT : undefined}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <span className="world-flat__swatch" style={{ background: color }} aria-hidden="true" />
        <span className="world-flat__name">{record.name}</span>
        {verb !== null ? <span className="world-pill__act">{Icon !== undefined ? <Icon size={11} /> : null}{verb}</span> : null}
        {watchers.length > 0 ? (
          <span className="world-pill__peers">
            {watchers.slice(0, 3).map((p) => <span key={p.userId} className="world-peer" style={{ background: p.color }} title={`${p.name} is looking at this agent`}>{p.initials}</span>)}
          </span>
        ) : null}
      </button>
      <p className="world-card__title" data-lead={headline.tone}>{headline.text}</p>
      {headline.tone !== 'said' && words !== record.name ? <p className="world-card__said">{words}</p> : null}
      <p className="world-card__badge">{badge.word}</p>
      {parts.length > 0 ? (
        <p className="world-card__facts" data-world-facts>
          {parts.map((part, i) => <Fragment key={part.key}>{i > 0 ? ' · ' : null}<span data-fact={part.key}>{part.text}</span></Fragment>)}
        </p>
      ) : null}
      {waiting ? <RequestBlock agentId={agentId} /> : null}
      {tools.length > 0 ? (
        <ul className="world-card__tools">
          {tools.map((line) => (
            <li key={line.key} data-state={line.state}>
              <span className="world-card__tool">{line.tool}</span>
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}
      {/* The way to the panel, on the picked tile, as on the picked robot's card — a waiting tile's request has its own Open. */}
      {picked && !waiting && openable ? (
        <div className="world-card__actions" role="group" aria-label="Its panel">
          <button type="button" className="world-card__act" onClick={() => actions?.open(agentId)} title={OPEN_HINT} data-world-open>Open in Canvas</button>
        </div>
      ) : null}
    </li>
  )
})
