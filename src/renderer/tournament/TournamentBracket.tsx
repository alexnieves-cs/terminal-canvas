import { useEffect, useRef, useState, type JSX } from 'react'
import {
  ENTRANT_STATE_WORDS, ENTRANT_TONES, entrantFacts, isEntrantFinished, judgeRefusal, pickRefusal,
  type TournamentStatus
} from '@shared/tournament'

/**
 * M548. THE BRACKET — the live tournament, in screen space over the canvas:
 * one column per entrant, side by side, each with its state word (in the
 * tone `panel-state.ts` draws, never a colour of its own), its change, its
 * cost and its time, and — once the field is scored — its rank and the
 * scorer's reason. Stop while it runs; Pick on each eligible entrant once
 * it is scored (the scorer's winner first, and marked).
 *
 * It reads MAIN's status (`tournament:status`), so what it shows is the
 * runner's, never a projection the renderer could drift from; it polls
 * because the scoring step ends with no agent event behind it. Nothing at
 * all is drawn when no tournament has run, so the resting canvas is
 * unchanged, and a finished bracket can be put away until the next one.
 */
const POLL_MS = 2000

type Outcome = { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }

export function TournamentBracket(props: { run: (op: string, value?: string) => Promise<Outcome>; say: (text: string) => void }): JSX.Element | null {
  const [status, setStatus] = useState<TournamentStatus | null>(null)
  const [hidden, setHidden] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lastRef = useRef('')
  useEffect(() => {
    const door = window.canvas?.tournament
    if (door === undefined) return
    let live = true
    const read = (): void => {
      void door.status().then((st) => {
        if (!live) return
        // Only a change re-renders: an idle poll every two seconds costs one IPC and nothing else.
        const key = JSON.stringify(st)
        if (key === lastRef.current) return
        lastRef.current = key
        setStatus(st)
      }).catch(() => {})
    }
    read()
    const timer = setInterval(read, POLL_MS)
    return () => { live = false; clearInterval(timer) }
  }, [])
  if (status === null || hidden === status.id) return null
  const scored = status.score !== undefined
  const running = !scored && status.state !== 'stopped'
  const rankOf = new Map((status.score?.ranking ?? []).map((r) => [r.id, r]))
  const act = (op: string, value?: string): void => {
    if (busy) return
    setBusy(true)
    void props.run(op, value).then((r) => {
      setBusy(false)
      props.say(r.kind === 'refused' ? r.reason : r.note ?? '')
      // A picked field is settled: the bracket steps aside for the canvas it changed.
      if (op === 'pick' && r.kind === 'ran') setHidden(status.id)
    })
  }
  const now = Date.now()
  return (
    <section className="tn-bracket" data-tournament={status.state} aria-label={`Tournament: ${status.title}`} onMouseDown={(e) => e.stopPropagation()}>
      <header className="tn-bracket__head">
        <span className="tn-bracket__title" title={status.task}>Tournament · {status.title}</span>
        <span className="tn-bracket__check" title="the check every entrant must pass">{status.check}</span>
        <span className="tn-bracket__summary" data-tournament-summary>{status.score?.summary ?? (status.state === 'scoring' ? 'reading each lane\'s changes…' : `${status.entrants.filter((e) => !isEntrantFinished(e.state)).length} of ${status.entrants.length} still running`)}</span>
        {running && <button type="button" className="pf__verb pf__verb--word" data-tournament-stop disabled={busy} onClick={() => act('stop')}>Stop</button>}
        {/* M549. The judge and Combine, once the field is scored; each disabled by its own sentence. */}
        {scored && (() => { const why = judgeRefusal(status); return <button type="button" className="pf__verb pf__verb--word" data-tournament-judge disabled={busy || why !== null} title={why ?? 'a read-only claude chat compares the passing entrants'} onClick={() => act('judge')}>Judge</button> })()}
        {scored && status.itemId !== undefined && <button type="button" className="pf__verb pf__verb--word" data-tournament-combine disabled={busy} title="open the task — its Combine tab puts lanes together and checks the result first" onClick={() => act('combine')}>Combine…</button>}
        {!running && <button type="button" className="pf__verb pf__verb--word" data-tournament-hide onClick={() => setHidden(status.id)} title="put the bracket away until the next tournament">Hide</button>}
      </header>
      <ol className="tn-bracket__field">
        {status.entrants.map((e) => {
          const ranked = rankOf.get(e.id)
          const why = scored ? pickRefusal(status, e.id) : 'the tournament is still running'
          const winner = status.score?.winner === e.id
          return (
            <li key={e.id} className="tn-bracket__entrant" data-tone={ENTRANT_TONES[e.state]} data-entrant={e.id} data-winner={winner ? '' : undefined}>
              <span className="tn-bracket__label">{ranked?.eligible === true ? `${ranked.rank}. ` : ''}{e.label}</span>
              <span className="tn-bracket__state" data-entrant-state={e.state}>{ENTRANT_STATE_WORDS[e.state]}{winner ? ' · winner' : ''}</span>
              <span className="tn-bracket__facts">{entrantFacts(e, now)}</span>
              {(ranked?.why ?? e.reason) !== undefined && <span className="tn-bracket__why">{ranked?.why ?? e.reason}</span>}
              {scored && <button type="button" className="pf__verb pf__verb--word" data-tournament-pick={e.id} disabled={busy || why !== null} title={why ?? `keep ${e.label} as the task's lane and close the other chats`} onClick={() => act('pick', e.id)}>Pick</button>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
