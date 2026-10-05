import { Fragment, memo, useReducer, useRef, type JSX, type MutableRefObject, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { Group } from 'three'
import { KindBrowser, People, ToolEdit, ToolRead, ToolRun, ToolSearch } from '@renderer/icons'
import type { CapHold } from '@shared/agent-session'
import { getAgent, getAgentIds, replayAt, useAgent, useReplayAt, worldNow } from './agent-world-store'
import { ACTIVITY_VERB, activityOf, type Activity } from './world-activity'
import { getWorldContext, useWorldActions, useWorldContext } from './world-context-store'
import { badgeFor, factParts } from './world-facts'
import { cardTitle, isLiveStatus, recentTools, type BadgeKind } from './world-scene'
import { cardHeadline, cardTier, conflictPartners, type CardTier, type Headline } from './world-structure'
import { useSelectedAgent } from './world-select'
import { cardScale } from './world-perf'
import { cardStand, cardTiltDeg } from './world-transition'

/**
 * What floats over a robot (M415): a white NAME PILL above its head, and —
 * for the nearest few — a frosted-glass HOLOGRAM CARD beside it with what it
 * is on (`cardTitle`), a status badge (`cardBadge`) and its latest tool calls
 * (`recentTools`).
 *
 * DOM, not textures, so both are crisp at any zoom, selectable, and read by
 * assistive tech (the canvas itself is opaque to it). ONE `Html` per robot
 * carries both, so a card costs no second projected element. It re-renders
 * when ITS agent's record changes and for no one else's — `useAgent` is a
 * per-agent subscription — and it is a child of the robot's group, so it
 * follows the robot without a position of its own. Not `transform` mode: the
 * card always faces the camera.
 *
 * `pointerEvents="none"`: a card over a drag must not eat the drag that orbits
 * the camera.
 *
 * `portal` is load-bearing and fails SILENTLY: without it drei mounts the card
 * in the canvas's parent, then MOVES it to the event-connected element once
 * R3F connects events — which is a new effect target, so the first Html to
 * mount unmounts its React root from inside a layout-effect cleanup. React 19
 * defers that unmount until the render ends, and it then empties the root the
 * re-run effect just built: that agent's card is a blank wrapper, for good,
 * with only a console warning ("synchronously unmount a root"). A card layer
 * of our own is a target that never changes. The layer also keeps the cards
 * clipped to the view and under the page's own buttons.
 *
 * Written from the frame loop, never React state (a render 60 times a second):
 *
 *   - the STAND-UP as its robot arrives: the tag fades in and the card lies
 *     back (rotateX, hinged on its bottom edge) at the start of the robot's
 *     pop and faces the camera at the end — `--world-tilt` and opacity, only
 *     while they change, so a tag at rest costs nothing;
 *   - the REACH: how far right of the robot's axis the card starts, in pixels,
 *     from the robot's distance — a fixed offset would bury the card in the
 *     robot when zoomed in and leave it adrift when zoomed out. Written only
 *     when it moves by a whole pixel;
 *   - the SCALE (M417, `cardScale`): from the same pixels-per-unit, so a far
 *     card shrinks with its robot instead of hanging over the room at full
 *     size. On a frame around the card, scaled from its top-left corner — the
 *     corner nearest the robot's crown — so the card's own hinge (its bottom
 *     edge, for the stand-up) is untouched;
 *   - QUIET, which arrives with the clock and not with an event: the badge is
 *     re-asked once a second, and the tag re-renders only when its kind flips.
 *
 * **Only the nearest few agents get the card** (`cardTiers`, world-perf.ts);
 * the rest wear the pill alone, whose dot carries the state. A card is a live
 * React tree over a 3D point, so a room of forty agents would be forty, and
 * the ones too far to read were never legible anyway.
 *
 * What it paints is the feed's own text, which the producer scrubs
 * (`shared/world-feed.ts`): the renderer has no second gate to put here.
 */

/** World units from the robot's axis to the card's left edge: half a robot's width and a gap. */
const REACH_UNITS = 0.62
const REACH_GAP_PX = 8

/** The pill's glyph for what the hands are on (M422) — the reference's pill carries an icon; ours says the work. */
const ACTIVITY_ICON: Partial<Record<Activity, (props: { size?: number }) => JSX.Element>> = {
  read: ToolRead, search: ToolSearch, edit: ToolEdit, test: ToolRun, shell: ToolRun, web: KindBrowser, delegate: People
}

/**
 * A waiting agent's card is the REQUEST (M422): what it wants to do, and the
 * three verbs — the same answer door the chat card uses, and the jump to the
 * panel for anything the room cannot answer (a terminal's prompt, a question
 * with options). The only controls in the card layer, so the only things in
 * it that take the pointer; everything else stays deaf to it, or a card over
 * a drag would eat the orbit.
 */
/** The live agents' records — what a card's conflict line is read against. */
function liveRecords(): NonNullable<ReturnType<typeof getAgent>>[] {
  return getAgentIds().map((id) => getAgent(id)).filter((r): r is NonNullable<typeof r> => r !== undefined && isLiveStatus(r.status))
}

/** The card's lead (M424): `cardHeadline` over this record, the context's request, a cap's hold (M428) and the room's conflicts. */
function headlineOf(record: NonNullable<ReturnType<typeof getAgent>>, approval: { toolName: string } | undefined, words: string, now: number, held: CapHold | undefined): Headline {
  return cardHeadline(record, {
    ...(approval === undefined ? {} : { approval }),
    ...(held === undefined ? {} : { held }),
    partners: conflictPartners(liveRecords(), record.agentId, now),
    partnerName: (id) => getAgent(id)?.name ?? id,
    now,
    activity: activityOf(record, now),
    words
  })
}

function RequestBlock({ agentId }: { agentId: string }): JSX.Element {
  const ctx = useWorldContext()
  const actions = useWorldActions()
  // M425: a request in the PAST room is history — it may have been answered since — so it has no verbs.
  const past = useReplayAt() !== null
  const asked = past ? undefined : ctx.approvals.find((a) => a.agentId === agentId)
  return (
    <div className="world-card__request" data-world-request>
      {asked !== undefined ? (
        <p className="world-card__ask"><span className="world-card__tool">{asked.toolName}</span>{asked.argument}</p>
      ) : (
        <p className="world-card__ask world-card__ask--open">{past ? 'Was waiting on you here' : 'Waiting on you in its panel'}</p>
      )}
      <div className="world-card__actions" role="group" aria-label="Answer the request">
        {asked !== undefined && actions !== null ? (
          <>
            <button type="button" className="world-card__act world-card__act--go" onClick={() => actions.answer(agentId, asked.requestId, true)} data-world-answer="allow">Approve</button>
            <button type="button" className="world-card__act" onClick={() => actions.answer(agentId, asked.requestId, false)} data-world-answer="deny">Deny</button>
          </>
        ) : null}
        {past ? null : <button type="button" className="world-card__act" onClick={() => actions?.open(agentId)} disabled={actions === null} data-world-answer="open">Open</button>}
      </div>
    </div>
  )
}
export const WorldCard = memo(function WorldCard({ agentId, y, layer, pop, compact }: { agentId: string; y: number; layer: RefObject<HTMLElement | null>; pop: MutableRefObject<number>; compact: boolean }): JSX.Element | null {
  const record = useAgent(agentId)
  const anchor = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const point = useRef<Group>(null)
  const written = useRef(-1)
  const reach = useRef(-1)
  const scaled = useRef(-1)
  const askedAt = useRef(-Infinity)
  const shown = useRef<BadgeKind | null>(null)
  const doing = useRef<Activity | null>(null)
  const led = useRef<string | null>(null)
  const tier = useRef<CardTier | null>(null)
  const ctx = useWorldContext()
  const picked = useSelectedAgent() === agentId
  const past = useReplayAt() !== null
  // The last title the agent gave in its own words. The ring is fifty events,
  // and a long run of tool calls pushes the last thought out of it; the card
  // keeps saying what the agent is on rather than dropping back to its name.
  const said = useRef<string | null>(null)
  const [, recheck] = useReducer((n: number) => n + 1, 0)
  const camera = useThree((s) => s.camera)
  const height = useThree((s) => s.size.height)

  useFrame((state) => {
    const tag = anchor.current
    if (!tag) return
    const stand = cardStand(pop.current)
    if (stand !== written.current) {
      written.current = stand
      tag.style.opacity = String(Math.min(1, stand * 2))
      card.current?.style.setProperty('--world-tilt', `${cardTiltDeg(stand).toFixed(2)}deg`)
    }
    const at = point.current?.matrixWorld.elements
    if (card.current && at) {
      const dist = Math.hypot(camera.position.x - at[12]!, camera.position.y - at[13]!, camera.position.z - at[14]!)
      const fov = 'fov' in camera ? (camera.fov as number) : 40
      const perUnit = height / (2 * Math.tan((fov * Math.PI) / 360) * Math.max(dist, 0.1))
      const px = Math.round(REACH_UNITS * perUnit + REACH_GAP_PX)
      if (px !== reach.current) {
        reach.current = px
        tag.style.setProperty('--world-reach', `${px}px`)
      }
      // Hundredths: a finer step would restyle the card every frame of an orbit for no visible change.
      // M424: the density layer, written straight onto the tag — CSS shows what the layer holds.
      const nextTier = cardTier(perUnit, tier.current)
      if (nextTier !== tier.current) {
        tier.current = nextTier
        tag.dataset.tier = nextTier
      }
      const k = Math.round(cardScale(perUnit) * 100) / 100
      if (k !== scaled.current) {
        scaled.current = k
        tag.style.setProperty('--world-scale', String(k))
      }
    }
    const t = state.clock.elapsedTime
    if (t - askedAt.current >= 1) {
      askedAt.current = t
      const rec = getAgent(agentId)
      const n = worldNow()
      // The same hold the render read (M428) — a badge asked without it would differ from the shown one every second, forever.
      const hold = replayAt() === null ? getWorldContext().facts[agentId]?.held : undefined
      if (rec && (badgeFor(rec, n, hold !== undefined).kind !== shown.current || activityOf(rec, n) !== doing.current || headlineOf(rec, undefined, said.current ?? rec.name, n, hold).text !== led.current)) recheck()
    }
  })

  if (!record || !layer.current) return null
  // M428: the work's own facts — present-day values, so the past room (a
  // replay) has none: today's spend under last hour's robot would read as
  // what it had spent then. RequestBlock hides its verbs for the same reason.
  const facts = past ? undefined : ctx.facts[agentId]
  const held = facts?.held
  const badge = badgeFor(record, worldNow(), held !== undefined)
  shown.current = badge.kind
  const activity = activityOf(record, worldNow())
  doing.current = activity
  const verb = ACTIVITY_VERB[activity]
  const Icon = ACTIVITY_ICON[activity]
  // A request is never a dot: whoever is waiting on a person gets the whole card, and so does the robot a person picked.
  const waiting = record.status === 'waiting_approval'
  const full = !compact || waiting || picked
  const tools = full && !waiting ? recentTools(record) : []
  const latest = cardTitle(record)
  if (latest !== record.name) said.current = latest
  const words = said.current ?? latest
  const approval = ctx.approvals.find((a) => a.agentId === agentId)
  const watchers = ctx.peers.filter((p) => p.panelId === agentId)
  const headline = headlineOf(record, approval, words, worldNow(), held)
  led.current = headlineOf(record, undefined, words, worldNow(), held).text
  // The INSPECTOR layer (M428): model · spend · context · branch · teammate · queue.
  // On the full card only, and CSS shows it only up close or on the picked robot.
  const parts = full ? factParts(facts, record.name) : []
  return (
    <group ref={point} position={[0, y, 0]}>
      <Html zIndexRange={[20, 0]} pointerEvents="none" portal={layer as RefObject<HTMLElement>}>
        <div ref={anchor} className="world-tag" style={{ opacity: 0 }} data-status={record.status} data-badge={badge.kind} data-activity={activity} data-picked={picked ? '' : undefined} role="group" aria-label={`${record.name}: ${verb ?? badge.word}`}>
          <div className="world-pill" aria-hidden="true">
            <span className="world-dot" />
            <span className="world-pill__name">{record.name}</span>
            {verb !== null ? <span className="world-pill__act">{Icon !== undefined ? <Icon size={11} /> : null}{verb}</span> : null}
            {/* M426: the teammates looking at this agent right now, by their own colour and initials. */}
            {watchers.length > 0 ? (
              <span className="world-pill__peers">
                {watchers.slice(0, 3).map((p) => <span key={p.userId} className="world-peer" style={{ background: p.color }} title={`${p.name} is looking at this agent`}>{p.initials}</span>)}
              </span>
            ) : null}
          </div>
          {/* The contextual layer (M424): one line, the fact a person would act on. CSS shows it only mid-distance. */}
          {!full ? <p className="world-chip" data-lead={headline.tone}>{headline.text}</p> : null}
          {!full ? null : (
            <div className="world-card-frame">
              <div ref={card} className="world-card">
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
              </div>
            </div>
          )}
        </div>
      </Html>
    </group>
  )
})
