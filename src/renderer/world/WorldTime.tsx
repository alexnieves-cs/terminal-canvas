import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type RefObject } from 'react'
import { Close, History, Play, Stop } from '@renderer/icons'
import { getAgent, getJournal, replayAt, setReplayAt, subscribeJournal, useReplayAt } from './agent-world-store'
import { dismissAway, useAwaySince } from './world-away'
import { prefersReducedMotion } from './world-perf'
import { awayBeats, JOURNAL_MAX_AGE_MS, PAST_ROOM_REASON, tickTone, timelineMarks, tourOfferLabel, tourStep, TOUR_BEAT_MS, verbsForRoom, type Beat } from './world-replay'
import type { CameraApi } from './world-set'

/**
 * Time in the room (M425): a scrubber over the last hour the room saw, and —
 * when a person comes back from being away — what happened meanwhile, as a
 * handful of lines and a tour that flies the camera to each.
 *
 * Plain DOM, no three.js (the chrome's rule, `verify:world world.door.1`).
 * The past room is the store's (`setReplayAt`): this only moves its clock.
 * Leaving the room, or pressing Live, puts it back to now — a room left in
 * the past would show a stale world to the next person who opens it.
 */

/** How fast the scrubber plays the past back: ten seconds a second. */
export const PLAY_SPEED = 10

function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function ago(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

const nameOf = (id: string): string => getAgent(id)?.name ?? id

export function WorldTime({ camera }: { camera: RefObject<CameraApi | null> }): JSX.Element {
  const at = useReplayAt()
  // Re-render when the journal grows — the bar's right end is now.
  const length = useSyncExternalStore(subscribeJournal, () => getJournal().length, () => 0)
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [tour, setTour] = useState<{ beats: Beat[]; index: number } | null>(null)
  const since = useAwaySince()
  const now = Date.now()
  const journal = getJournal()
  const from = Math.max(journal[0]?.at ?? now, now - JOURNAL_MAX_AGE_MS)
  // The bar's marks, re-read every few seconds rather than per event.
  const bucket = Math.floor(now / 3000)
  const marks = useMemo(() => timelineMarks(journal, from, now, 72), [bucket, length > 0])
  const away = useMemo(() => (since === null ? null : awayBeats(journal, since, now, nameOf)), [since, bucket])

  // Back to live when the room goes.
  useEffect(() => () => setReplayAt(null), [])

  // Playing: the past runs forward at PLAY_SPEED and becomes live when it catches up.
  const last = useRef(0)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    last.current = performance.now()
    const step = (): void => {
      const t = performance.now()
      // Read at use: the loop must not close over a stale moment.
      const cur = replayAt() ?? Date.now()
      const next = cur + (t - last.current) * PLAY_SPEED
      last.current = t
      if (next >= Date.now() - 250) { setReplayAt(null); setPlaying(false); return }
      setReplayAt(next)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // The tour: one beat at a time, the room at its moment and the camera on its agent.
  useEffect(() => {
    if (tour === null) return
    const beat = tour.beats[tour.index]
    if (beat === undefined) {
      setReplayAt(null)
      camera.current?.fit()
      dismissAway()
      setTour(null)
      return
    }
    // A stop takes the agent out of the room; show the moment before it, when it was still at its desk.
    setReplayAt(beat.kind === 'stopped' ? beat.at - 1 : beat.at)
    // The fold lands this frame; the robot's station is there on the next.
    // Reduced motion cuts: the same focus, and the rig's glide span is already 0.
    const raf = requestAnimationFrame(() => {
      if (tourStep(prefersReducedMotion()) === 'cut') {
        if (camera.current?.focus(beat.agentId) !== true) camera.current?.fit()
        return
      }
      if (camera.current?.focus(beat.agentId) !== true) camera.current?.fit()
    })
    const timer = window.setTimeout(() => setTour((t) => (t === null ? t : { ...t, index: t.index + 1 })), TOUR_BEAT_MS)
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer) }
  }, [tour, camera])

  const live = at === null
  const showBar = open || !live
  const stopTour = (): void => { setTour(null); setReplayAt(null); camera.current?.fit() }
  // The room's verbs, refused together. Time controls (play, the range, Live) stay: they are how you look.
  const roomVerbs = verbsForRoom(!live, [
    { id: 'ask', label: 'Ask' },
    { id: 'open', label: 'Open' },
    { id: 'approve', label: 'Approve' }
  ])

  return (
    <>
    <div className="world-time-col">
      {showBar ? (
        <div className="world-time" role="group" aria-label="Replay · last hour" data-world-time data-live={live ? '' : undefined}>
          <span className="world-time__title">Replay · last hour</span>
          <button type="button" className="world-time__btn" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play from here'}
            onClick={() => { if (live) setReplayAt(Math.max(from, now - 5 * 60_000)); setPlaying((p) => !p) }}>
            {playing ? <Stop size={12} /> : <Play size={12} />}
          </button>
          <div className="world-time__track">
            <div className="world-time__density" aria-hidden="true">
              {marks.density.map((n, i) => <span key={i} style={{ height: `${Math.min(100, 12 + n * 9)}%` }} />)}
            </div>
            {marks.points.map((p, i) => {
              const tone = p.kind === 'wait' ? tickTone({ agentId: '', seq: 0, ts: p.at, type: 'status', payload: 'waiting_approval' }) : tickTone({ agentId: '', seq: 0, ts: p.at, type: 'error', payload: { message: '' } })
              return <span key={i} className="world-time__mark" data-kind={p.kind} data-tone={tone ?? undefined} style={{ left: `${((p.at - from) / Math.max(1, now - from)) * 100}%` }} aria-hidden="true" />
            })}
            <input
              type="range" className="world-time__range" aria-label="Moment shown"
              min={from} max={now} step={1000} value={at ?? now}
              onChange={(event) => { setPlaying(false); const v = Number(event.target.value); setReplayAt(v >= now - 1500 ? null : v) }}
            />
          </div>
          {/* Live says itself on its own button; the label is for the past moment only. */}
          {live ? null : <span className="world-time__when" aria-live="polite">{`${clock(at)} · ${ago(now - at)}`}</span>}
          <button type="button" className="world-time__live" disabled={live} onClick={() => { setPlaying(false); setTour(null); setReplayAt(null) }}>Live</button>
          {live ? <button type="button" className="world-time__btn" aria-label="Close replay" title="Close" onClick={() => setOpen(false)}><Close size={12} /></button> : null}
          {live ? null : (
            <div className="world-time__past" role="status" data-past-reason>
              {PAST_ROOM_REASON}
              {roomVerbs.map((verb) => (
                <button key={verb.id} type="button" className="world-time__verb" disabled={verb.disabled} title={verb.reason ?? undefined} data-room-verb={verb.id}>{verb.label}</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="world-time__open" onClick={() => setOpen(true)} data-world-time-open><History size={14} /> Replay · last hour</button>
      )}
    </div>

    <div className="world-away-host">
      {away !== null && away.beats.length > 0 && tour === null ? (
        <section className="world-away" aria-label="While you were away" data-world-away>
          <h3>While you were away · <span>{ago(now - since!).replace(' ago', '')}</span></h3>
          <ul>
            {away.beats.map((b) => <li key={`${b.agentId}:${b.kind}`} data-kind={b.kind}>{b.text}</li>)}
            {away.more > 0 ? <li className="world-away__more">and {away.more} more</li> : null}
          </ul>
          <div className="world-away__acts">
            <button type="button" className="world-away__go" aria-label={tourOfferLabel()} onClick={() => setTour({ beats: away.beats, index: 0 })} data-world-tour>{tourOfferLabel()}</button>
            <button type="button" onClick={() => dismissAway()}>Dismiss</button>
          </div>
        </section>
      ) : null}
      {tour !== null ? (
        <section className="world-away world-away--touring" aria-live="polite" data-world-touring>
          <p>{tour.beats[tour.index]?.text}</p>
          <div className="world-away__acts">
            <span>{Math.min(tour.index + 1, tour.beats.length)} of {tour.beats.length}</span>
            <button type="button" onClick={stopTour}>Stop</button>
          </div>
        </section>
      ) : null}
    </div>
    </>
  )
}
