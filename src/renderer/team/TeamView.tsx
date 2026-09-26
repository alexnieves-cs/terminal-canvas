/**
 * The Team view: one tile per organization member, and observer mode behind
 * each tile. A center view like OrchestrationView — it shares that overlay
 * cell over the still-mounted canvas — but it shows PEOPLE, not this
 * machine's agents, so it reads nothing from the canvas and owns no verb on
 * it.
 *
 * Tiles merge three sources (shared/team.ts's buildTeamTiles): the Yjs
 * rosters main already pushes, and the org's presence rows and activity log
 * through `team:list`. Rosters arrive at cursor rate; the grid re-renders only
 * when a fact a tile SHOWS changed (the RosterStrip rule).
 *
 * Observer mode is READ-ONLY by construction: main joins the member's
 * workspace doc and writes nothing to it, and this pane paints their
 * published snapshot with no verb on any panel — there is nothing to click
 * but the camera. Follow mode (F) locks that camera to their cursor.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type PointerEvent as ReactPointerEvent } from 'react'
import {
  buildTeamTiles, followViewport, formatActiveAgo,
  type FollowViewport, type TeamListResult, type TeamSnapshot, type TeamTile
} from '@shared/team'
import type { AgentPresenceStatus, PresenceRoster } from '@shared/presence'
import { allRosters, onRoster } from '../presence/presence-store'
import { TONE } from '../presence/RosterStrip'
import { observe, useObserved, type ObservedView } from './team-store'
import { ChevronLeft } from '../icons'

const AGENT_WORD: Record<AgentPresenceStatus, string> = {
  none: 'no agents', idle: 'agents idle', working: 'agents working', 'needs-you': 'needs someone', error: 'agent stopped'
}
const HEALTH_WORD: Record<TeamTile['health'], string> = {
  healthy: 'active', waiting: 'waiting on someone', failing: 'something stopped', away: 'away', offline: 'offline'
}

/** Server rows are re-read on this beat; awareness updates the live facts in between. */
const TEAM_REFRESH_MS = 30_000
/** Rosters are folded into tiles at most this often — a tile's age is minutes, not frames. */
const ROSTER_FOLD_MS = 1_000

/** Keys this view answers only when the event is not typing somewhere (orchKeysShouldHandle's exclusions). */
function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (el === null || typeof el.closest !== 'function') return false
  return el.closest('input, textarea, select, [contenteditable="true"], .xterm') !== null
}

export function TeamView(): JSX.Element {
  const [list, setList] = useState<TeamListResult | null>(null)
  const [orgId, setOrgId] = useState<string | undefined>(undefined)
  const [rosters, setRosters] = useState<readonly PresenceRoster[]>(() => allRosters())
  const [now, setNow] = useState(() => Date.now())
  const [observing, setObserving] = useState<TeamTile | null>(null)

  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.team.list(orgId).then((r) => { if (live) { setList(r); setNow(Date.now()) } }, () => {})
    }
    read()
    const h = setInterval(read, TEAM_REFRESH_MS)
    return () => { live = false; clearInterval(h) }
  }, [orgId])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = onRoster(() => {
      if (timer !== null) return
      timer = setTimeout(() => { timer = null; setRosters(allRosters()); setNow(Date.now()) }, ROSTER_FOLD_MS)
    })
    return () => { off(); if (timer !== null) clearTimeout(timer) }
  }, [])

  // Leaving the view — or the app switching page — detaches, so we are never
  // still shown as watching someone after we stopped looking.
  useEffect(() => () => observe(null), [])

  const ok = list?.kind === 'ok' ? list : null
  const tiles = useMemo(() => buildTeamTiles({
    me: ok?.me ?? null,
    members: ok?.members ?? [], presence: ok?.presence ?? [], activity: ok?.activity ?? [],
    rosters, now
  }), [ok, rosters, now])

  const enter = useCallback((tile: TeamTile): void => {
    if (tile.workspaceId === null) return
    setObserving(tile)
    observe({ workspaceId: tile.workspaceId, userId: tile.userId })
  }, [])
  const leave = useCallback((): void => { setObserving(null); observe(null) }, [])

  if (observing !== null) return <ObserverPane tile={observing} onLeave={leave} />

  const refusal = list !== null && list.kind !== 'ok' ? list.reason : null
  return (
    <section className="team" data-team-view aria-label="Team">
      <header className="team__head">
        <h2 className="team__title">Team</h2>
        {ok !== null && ok.orgs.length > 1 ? (
          <select className="team__org" aria-label="Organization" value={ok.org.id} onChange={(e) => setOrgId(e.target.value)}>
            {ok.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : ok !== null ? <span className="team__org-name">{ok.org.name}</span> : null}
        {/* Why the rows are missing, beside the tiles awareness still makes —
            presence works without the account server, and so does this view. */}
        {refusal !== null && <span className="team__note" data-team-refusal>{refusal}</span>}
      </header>
      {tiles.length === 0 ? (
        <p className="team__empty" data-team-empty>
          {list === null ? 'Reading your team…' : ok !== null ? 'Nobody else is in this organization yet. `tc invite` makes a code to share.' : 'No teammates are on a shared workspace right now.'}
        </p>
      ) : (
        <ul className="team__grid" aria-label="Members">
          {tiles.map((t) => <li key={t.userId}><Tile tile={t} onOpen={enter} /></li>)}
        </ul>
      )}
    </section>
  )
}

const Tile = memo(function Tile({ tile, onOpen }: { tile: TeamTile; onOpen: (t: TeamTile) => void }): JSX.Element {
  const age = formatActiveAgo(tile.activeAgoMs)
  const attachable = tile.workspaceId !== null && tile.health !== 'offline'
  const why = tile.workspaceId === null
    ? `${tile.name} has not been on a workspace since signing in, so there is nothing to observe`
    : tile.health === 'offline' ? `${tile.name} is offline` : `Observe ${tile.name}'s canvas, read-only`
  const tone = TONE[tile.agentStatus]
  return (
    <button
      type="button"
      className="team-tile"
      data-team-tile={tile.userId}
      data-health={tile.health}
      data-live={tile.live ? 'true' : undefined}
      style={{ '--peer': tile.color } as CSSProperties}
      disabled={!attachable}
      title={why}
      aria-label={[tile.name, HEALTH_WORD[tile.health], tile.currentTask || null, age || null].filter((x) => x !== null).join(', ')}
      onClick={() => onOpen(tile)}
    >
      <span className="team-tile__avatar" aria-hidden="true">{tile.initials}</span>
      <span className="team-tile__body">
        <span className="team-tile__name">
          {tile.name}
          {tile.role !== null && tile.role !== 'member' && <span className="team-tile__role">{tile.role}</span>}
        </span>
        {/* The task, else what they last did — never a "no task" line (the
            rest layer carries no zero-value statement). */}
        {tile.currentTask !== ''
          ? <span className="team-tile__task" data-team-task>{tile.currentTask}</span>
          : tile.lastActivity !== '' ? <span className="team-tile__task team-tile__task--past">{tile.lastActivity}</span> : null}
        <span className="team-tile__meta">
          {tone !== undefined && (
            <span className="team-tile__agent" data-team-agent={tile.agentStatus}>
              <span className="team-tile__dot" data-tone={tone} aria-hidden="true" />
              {AGENT_WORD[tile.agentStatus]}
            </span>
          )}
          {/* The rail's colour is the health; its word is printed only where
              the agent word does not already say it (away, offline) — "agents
              working · active" and "needs someone · waiting on someone" were
              each one fact twice. The accessible name always carries it. */}
          {(tile.health === 'away' || tile.health === 'offline') && <span className="team-tile__health" data-team-health={tile.health}>{HEALTH_WORD[tile.health]}</span>}
          {age !== '' && <span className="team-tile__age">{age}</span>}
        </span>
      </span>
    </button>
  )
})

// ── observer mode ──────────────────────────────────────────────────────────

const MIN_SCALE = 0.05
const MAX_SCALE = 2
const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

function fitSnapshot(snap: TeamSnapshot, box: { w: number; h: number }): FollowViewport {
  if (snap.panels.length === 0) return { x: box.w / 2, y: box.h / 2, scale: 1 }
  const minX = Math.min(...snap.panels.map((p) => p.x)), minY = Math.min(...snap.panels.map((p) => p.y))
  const maxX = Math.max(...snap.panels.map((p) => p.x + p.w)), maxY = Math.max(...snap.panels.map((p) => p.y + p.h))
  const pad = 48
  const scale = clampScale(Math.min((box.w - pad * 2) / Math.max(1, maxX - minX), (box.h - pad * 2) / Math.max(1, maxY - minY), 1))
  return { x: (box.w - (maxX - minX) * scale) / 2 - minX * scale, y: (box.h - (maxY - minY) * scale) / 2 - minY * scale, scale }
}

function ObserverPane({ tile, onLeave }: { tile: TeamTile; onLeave: () => void }): JSX.Element {
  const observed = useObserved()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ w: 800, h: 600 })
  const [vp, setVp] = useState<FollowViewport | null>(null)
  const [following, setFollowing] = useState(false)
  const followingRef = useRef(following)
  followingRef.current = following

  useLayoutEffect(() => {
    const el = boxRef.current
    if (el === null) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const snap = observed?.snapshot ?? null
  const peer = observed?.peer ?? null
  // Fit once, on the first snapshot: after that the camera is the person's
  // (or follow's), and a re-fit on every publish would yank it away.
  useEffect(() => { if (vp === null && snap !== null) setVp(fitSnapshot(snap, box)) }, [snap, box, vp])

  // Follow: the camera IS their cursor while on; manual pan and zoom are
  // locked out (below), so the banner's claim is literally true.
  const cursor = peer?.presence.cursor ?? null
  const theirViewport = peer?.presence.viewport ?? null
  useEffect(() => {
    if (!following) return
    const next = followViewport({ cursor, viewport: theirViewport }, box, vp?.scale ?? 1)
    if (next !== null) setVp(next)
    // vp.scale is read, not depended on: follow keeps the scale it started at.
  }, [following, cursor?.x, cursor?.y, theirViewport?.x, theirViewport?.y, theirViewport?.scale, box])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) return
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault(); e.stopPropagation()
        setFollowing((f) => !f)
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        // Escape unwinds one level: follow first, then observer mode.
        if (followingRef.current) setFollowing(false)
        else onLeave()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onLeave])

  const drag = useRef<{ x: number; y: number; vp: FollowViewport } | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (followingRef.current || vp === null || e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, vp }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (d === null) return
    // From the gesture's ORIGIN every frame, never the previous frame (the applyDrag rule).
    setVp({ ...d.vp, x: d.vp.x + e.clientX - d.x, y: d.vp.y + e.clientY - d.y })
  }
  const onPointerUp = (): void => { drag.current = null }

  // Non-passive, so a pinch can preventDefault the page zoom.
  useEffect(() => {
    const el = boxRef.current
    if (el === null) return
    const wheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (followingRef.current) return
      // Lines, not pixels, from a mouse wheel (CLAUDE.md's deltaMode gotcha).
      const k = e.deltaMode === 1 ? 16 : 1
      setVp((cur) => {
        if (cur === null) return cur
        // A pinch is a wheel with ctrlKey and no key held — the only signal.
        if (e.ctrlKey) {
          const r = el.getBoundingClientRect()
          const ax = e.clientX - r.left, ay = e.clientY - r.top
          const scale = clampScale(cur.scale * Math.exp(-e.deltaY * k * 0.01))
          const f = scale / cur.scale
          return { x: ax - (ax - cur.x) * f, y: ay - (ay - cur.y) * f, scale }
        }
        return { ...cur, x: cur.x - e.deltaX * k, y: cur.y - e.deltaY * k }
      })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const name = peer?.presence.displayName ?? tile.name
  const color = peer?.presence.color ?? tile.color
  const selection = new Set(peer?.presence.selection ?? [])
  const focused = peer?.presence.currentPanelId ?? null

  return (
    <section className="team team--observing" data-team-observer={tile.userId} aria-label={`Observing ${name}`} style={{ '--peer': color } as CSSProperties}>
      <header className="team__head">
        <button type="button" className="team__back" onClick={onLeave} title="Back to the team (Esc)"><ChevronLeft /> Team</button>
        <span className="team-tile__avatar team-tile__avatar--sm" aria-hidden="true">{tile.initials}</span>
        <h2 className="team__title">Observing {name}</h2>
        <span className="team__chip" data-team-readonly>read-only</span>
        <ObserverStatus observed={observed} name={name} />
        <button
          type="button"
          className="team__follow"
          aria-pressed={following}
          data-team-follow={following ? 'on' : 'off'}
          disabled={peer === null}
          title={peer === null ? `${name} is not on this workspace right now` : following ? 'Stop following (F or Esc)' : `Lock the view to ${name}'s cursor (F)`}
          onClick={() => setFollowing((f) => !f)}
        >
          {following ? 'Following' : 'Follow'} <kbd>F</kbd>
        </button>
      </header>
      <div
        ref={boxRef}
        className={`team__surface${following ? ' team__surface--locked' : ''}`}
        data-team-surface
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {following && (
          <div className="team__banner" role="status" data-team-follow-banner>
            {cursor !== null
              ? <>Following <strong>{name}</strong>’s cursor — press F or Esc to stop</>
              : theirViewport !== null
                ? <><strong>{name}</strong>’s cursor is off their canvas — holding on their view · F or Esc to stop</>
                : <>Waiting for <strong>{name}</strong>’s cursor · F or Esc to stop</>}
          </div>
        )}
        {vp !== null && snap !== null && (
          <div className="team__world" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})` }}>
            <svg className="team__edges" aria-hidden="true">
              {snap.edges.map((e) => {
                const a = snap.panels.find((p) => p.id === e.from), b = snap.panels.find((p) => p.id === e.to)
                if (a === undefined || b === undefined) return null
                return <line key={`${e.from}:${e.to}`} x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={b.x + b.w / 2} y2={b.y + b.h / 2} />
              })}
            </svg>
            {snap.panels.map((p) => (
              <div
                key={p.id}
                className="team__panel"
                data-team-panel={p.id}
                data-peer-selected={selection.has(p.id) ? 'true' : undefined}
                data-peer-focused={focused === p.id ? 'true' : undefined}
                style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
              >
                <span className="team__panel-kind">{p.kind}</span>
                {p.title !== '' && <span className="team__panel-title">{p.title}</span>}
                {p.state !== '' && <span className="team__panel-state">{p.state}</span>}
              </div>
            ))}
            {cursor !== null && (
              <div className="team__cursor" data-team-cursor style={{ left: cursor.x, top: cursor.y, transform: `scale(${1 / vp.scale})` }}>
                <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path d="M1 1 L1 15 L5 11 L8 17 L10 16 L7 10 L13 10 Z" /></svg>
                <span className="team__cursor-name">{name}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/** The one line that says what this pane is showing, and how fresh it is. */
function ObserverStatus({ observed, name }: { observed: ObservedView | null; name: string }): JSX.Element {
  const [, tick] = useState(0)
  useEffect(() => { const h = setInterval(() => tick((n) => n + 1), 5_000); return () => clearInterval(h) }, [])
  let text: string
  if (observed === null || observed.connection === 'connecting') text = 'connecting…'
  else if (observed.connection === 'off') text = observed.reason ?? 'presence is off'
  else if (observed.connection === 'disconnected') text = 'disconnected — reconnecting'
  else if (observed.peer === null) text = observed.snapshot === null ? `${name} is not on this workspace right now` : `${name} left — showing their last canvas`
  else if (observed.snapshot === null) text = `waiting for ${name}’s canvas…`
  else {
    const s = observed.snapshotSeenAt === null ? 0 : Math.floor((Date.now() - observed.snapshotSeenAt) / 1000)
    const scrubbed = observed.snapshot.redacted > 0 ? ` · ${observed.snapshot.redacted} secret${observed.snapshot.redacted === 1 ? '' : 's'} redacted` : ''
    text = `canvas updated ${s < 5 ? 'just now' : `${s}s ago`}${scrubbed}`
  }
  return <span className="team__status" data-team-status>{text}</span>
}
