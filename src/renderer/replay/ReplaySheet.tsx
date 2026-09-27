import { useEffect, useState, type JSX } from 'react'
import type { TranscriptTurn } from '@shared/transcript'
import { compareFrames, compareWords, fileStateWords, replayAt, replayMoments, replayPath, shellWords, sinceStartWords, type ReplayFile, type ReplayFrame } from '@shared/replay'
import { Dialog, DialogClose, DialogContent } from '@renderer/primitives'
import { closeReplay, compareReplay, onReplay, replayRequest, type ReplayRequest } from './replay-store'

/**
 * M383. THE REPLAY SHEET — a conversation scrubbed back to any turn (M381's
 * `replayAt`), and a second one beside it (`compareFrames`). A VIEW: it reads
 * the renderer's own copy of each transcript and changes nothing — no send,
 * no spawn, no write — so its doors are a person's (the Activity tab's
 * button, a palette row) and a plan never opens it.
 *
 * Each side keeps its OWN moment: two agents rarely ran at the same times, so
 * a shared clock would compare one agent's start with the other's end. Both
 * open on their latest moment, which is the comparison most people want
 * first — where did each end up.
 */
export interface ReplaySheetProps {
  /** Every conversation on the canvas this sheet may show or compare with. */
  chats: ReadonlyArray<{ id: string; label: string; cwd?: string }>
  turnsOf: (id: string) => readonly TranscriptTurn[]
}

/** Past this, a file's content is cut on screen and says so — the sheet is for reading, not a file viewer. */
const CONTENT_SHOWN_MAX = 20_000

export function ReplaySheet({ chats, turnsOf }: ReplaySheetProps): JSX.Element {
  const [request, setRequest] = useState<ReplayRequest | null>(replayRequest())
  useEffect(() => onReplay(setRequest), [])
  const a = request === null ? undefined : chats.find((c) => c.id === request.panelId)
  const b = request?.compareWith === undefined ? undefined : chats.find((c) => c.id === request.compareWith)
  const [at, setAt] = useState<{ a: number | null; b: number | null }>({ a: null, b: null })
  const [picked, setPicked] = useState<{ a: string | null; b: string | null }>({ a: null, b: null })
  // A new conversation (or a new one beside it) opens on its latest moment.
  useEffect(() => { setAt((s) => ({ ...s, a: null })); setPicked((s) => ({ ...s, a: null })) }, [request?.panelId])
  useEffect(() => { setAt((s) => ({ ...s, b: null })); setPicked((s) => ({ ...s, b: null })) }, [request?.compareWith])

  const side = (c: typeof a, index: number | null): { moments: number[]; index: number; frame: ReplayFrame } | null => {
    if (c === undefined) return null
    const turns = turnsOf(c.id)
    const moments = replayMoments(turns)
    if (moments.length === 0) return null
    const i = index === null ? moments.length - 1 : Math.min(index, moments.length - 1)
    return { moments, index: i, frame: replayAt(turns, moments[i] as number) }
  }
  const sa = side(a, at.a)
  const sb = side(b, at.b)
  const diff = sa !== null && sb !== null ? compareFrames(sa.frame, sb.frame) : null

  return (
    <Dialog open={request !== null} onOpenChange={(next) => { if (!next) closeReplay() }} modal>
      <DialogContent aria-label="Replay a conversation">
        {/* The class goes on DialogContent's ONE child (ShareDialog's rule): the scrim, then the card. */}
        <div className="replay-sheet">
        <div className="replay" data-replay={a?.id ?? ''} data-replay-compare-with={b?.id}>
          <header className="replay__head">
            <h2 className="replay__title">Replay</h2>
            <label className="replay__compare">
              <span>Compare with</span>
              <select data-replay-compare value={b?.id ?? ''} onChange={(e) => compareReplay(e.target.value === '' ? null : e.target.value)}>
                <option value="">nothing — this conversation alone</option>
                {chats.filter((c) => c.id !== a?.id).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <DialogClose className="replay__done">Done</DialogClose>
          </header>
          {a === undefined ? (
            <p className="replay__empty">That conversation is no longer on the canvas.</p>
          ) : (
            <div className="replay__cols" data-replay-cols={b === undefined ? '1' : '2'}>
              <ReplayColumn label={a.label} cwd={a.cwd} state={sa} picked={picked.a}
                onIndex={(i) => setAt((s) => ({ ...s, a: i }))} onPick={(p) => setPicked((s) => ({ ...s, a: p }))} side="a" />
              {b !== undefined && (
                <ReplayColumn label={b.label} cwd={b.cwd} state={sb} picked={picked.b}
                  onIndex={(i) => setAt((s) => ({ ...s, b: i }))} onPick={(p) => setPicked((s) => ({ ...s, b: p }))} side="b" />
              )}
            </div>
          )}
          {a !== undefined && b !== undefined && diff !== null && (
            <section className="replay__diff" data-replay-diff aria-label="Files side by side">
              <h3 className="replay__section">Files, side by side</h3>
              {diff.length === 0 ? <p className="replay__empty">Neither had changed a file by these moments.</p> : (
                <ul className="replay__diff-list">
                  {diff.map((row) => (
                    <li key={row.path} className="replay__diff-row" data-replay-same={row.same === null ? 'unknown' : String(row.same)}>
                      <code className="replay__path">{replayPath(row.path, a.cwd)}</code>
                      <span className="replay__words">{compareWords(row, a.label, b.label)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function lastWords(frame: ReplayFrame): string | null {
  for (let i = frame.turns.length - 1; i >= 0; i--) {
    const t = frame.turns[i] as TranscriptTurn
    if (t.role !== 'assistant') continue
    const text = t.blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ').trim()
    if (text !== '') return text.length > 280 ? `${text.slice(0, 277)}…` : text
  }
  return null
}

function ReplayColumn(props: {
  side: 'a' | 'b'
  label: string
  cwd: string | undefined
  state: { moments: number[]; index: number; frame: ReplayFrame } | null
  picked: string | null
  onIndex: (i: number) => void
  onPick: (path: string | null) => void
}): JSX.Element {
  const { state } = props
  if (state === null) {
    return <section className="replay__col" data-replay-side={props.side}><h3 className="replay__who">{props.label}</h3><p className="replay__empty">Nothing has been said in this conversation yet.</p></section>
  }
  const { moments, index, frame } = state
  const said = lastWords(frame)
  const shell = shellWords(frame.shellRuns)
  const open: ReplayFile | undefined = frame.files.find((f) => f.path === props.picked)
  return (
    <section className="replay__col" data-replay-side={props.side} aria-label={`Replay of ${props.label}`}>
      <h3 className="replay__who">{props.label}</h3>
      <input type="range" className="replay__scrub" data-replay-scrub={props.side} min={0} max={moments.length - 1} value={index}
        aria-label={`Moment in ${props.label}`} aria-valuetext={`turn ${frame.turns.length} of ${moments.length}`}
        onChange={(e) => props.onIndex(Number(e.target.value))} />
      <p className="replay__when" data-replay-when={props.side}>
        turn {frame.turns.length} of {moments.length} · {sinceStartWords(frame.at, moments[0] as number)}
        {index === moments.length - 1 ? ' · latest' : ''}
      </p>
      {said !== null && <blockquote className="replay__said">{said}</blockquote>}
      <h4 className="replay__section">Files by then</h4>
      {frame.files.length === 0 ? <p className="replay__empty">No file changed by this moment.</p> : (
        <ul className="replay__files">
          {frame.files.map((f) => (
            <li key={f.path}>
              <button type="button" className="replay__file" data-replay-file={f.state} aria-pressed={props.picked === f.path}
                title={props.picked === f.path ? 'Hide this file' : f.state === 'exact' ? 'Show this file as it stood then' : 'Show the edits the agent made to this file'}
                onClick={() => props.onPick(props.picked === f.path ? null : f.path)}>
                <code className="replay__path">{replayPath(f.path, props.cwd)}</code>
                <span className="replay__words">{fileStateWords(f)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shell !== null && <p className="replay__shell" data-replay-shell>{shell}</p>}
      {open !== undefined && (open.state === 'exact' ? (
        <pre className="replay__content" data-replay-content>{open.content.length > CONTENT_SHOWN_MAX ? `${open.content.slice(0, CONTENT_SHOWN_MAX)}\n… ${open.content.length - CONTENT_SHOWN_MAX} more characters not shown` : open.content}</pre>
      ) : (
        <div className="replay__partial" data-replay-partial>
          <p className="replay__why">{open.why}. Its edits, in order:</p>
          <ol className="replay__edits">
            {open.edits.map((e, i) => <li key={i}><pre className="replay__edit"><del>{e.oldText}</del>{'\n'}<ins>{e.newText}</ins></pre></li>)}
          </ol>
        </div>
      ))}
    </section>
  )
}
