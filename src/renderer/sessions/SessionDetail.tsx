import { useEffect, useState, type JSX } from 'react'
import { outward } from '@shared/outward'
import type { PaletteTheme } from '@shared/state-palette'
import { shellControl } from '@renderer/shell/shell-control'
import { appendTail, formatRun, formatTokens, formatUsd, replyBox, startedFact, stripAnsi, survivesFact, type SessionFact } from './sessions-model'
import { Sparkline } from './Sparkline'

const TAIL_CAP = 80

function scrub(text: string, id: string): string {
  return outward(text, `panel ${id}`).text
}

/**
 * M445. The live tail is the scrollback plus the pty subscription. Send is a
 * button. Enter is swallowed: a shell must not run a command from this box,
 * and an agent must not send until the person presses Send. The delivery
 * the parent performs is paste (or the chat's own send), never pty.write.
 */
export function SessionDetail({ fact, theme, samples, onPause, onDetach, onEnd, onShow, onShowInWorld, onSend }: {
  fact: SessionFact
  theme: PaletteTheme
  samples: readonly number[]
  onPause: () => void
  onDetach: () => void
  onEnd: () => void
  onShow: () => void
  onShowInWorld: () => void
  onSend: (text: string) => void
}): JSX.Element {
  const box = replyBox(fact.shell, fact.canPaste)
  const [text, setText] = useState('')
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => { setText('') }, [fact.id])
  useEffect(() => {
    let live = true
    setLines([])
    void window.canvas.scrollback.tail({ panelId: fact.id, lines: TAIL_CAP }).then(
      (got) => { if (live) setLines(got.slice(-TAIL_CAP).map((line) => scrub(line, fact.id))) },
      () => { if (live) setLines([]) }
    )
    const off = window.canvas.pty.onData((chunk) => {
      if (chunk.panelId !== fact.id) return
      // The tail is leaving the terminal for this page. Scrub it at the
      // read, the same way a line handed to another surface is scrubbed
      // (verify:verbs gate.2). The terminal itself still shows the bytes.
      setLines((prev) => appendTail(prev, scrub(stripAnsi(chunk.data), fact.id), TAIL_CAP))
    })
    return () => { live = false; off() }
  }, [fact.id])
  const survive = survivesFact(fact.survives)
  const started = startedFact(fact.startedAt)
  const tokens = formatTokens(fact.tokens)
  const cost = fact.costUsd !== null && fact.costUsd > 0 ? formatUsd(fact.costUsd) : ''
  const run = formatRun(fact.startedAt, fact.now)
  const facts: { label: string; value: string }[] = []
  if (started !== null) facts.push({ label: 'Started', value: started })
  if (survive !== null) facts.push({ label: 'Survives', value: survive })
  if (tokens !== '') facts.push({ label: 'Tokens', value: tokens })
  if (fact.changes !== null && fact.changes !== '') facts.push({ label: 'Changes', value: fact.changes })
  return (
    <aside className="sessions-detail" data-session-detail={fact.id} aria-label={fact.name}>
      <header className="sessions-detail__head">
        <h2 className="sessions-detail__name">{fact.name}</h2>
        <p className="sessions-detail__meta">{[fact.agent, fact.folder, fact.branch].filter((part) => part !== '').join(' · ')}</p>
        <p className="sessions-state" data-tone={fact.tone}>{fact.word}</p>
        <Sparkline samples={samples} tone={fact.tone} theme={theme} />
      </header>
      <pre className="sessions-tail" data-session-tail>{lines.join('\n')}</pre>
      <form className="sessions-reply" data-session-reply onSubmit={(event) => event.preventDefault()}>
        <label className="sessions-reply__label" htmlFor="sessions-reply-text">Send to this session…</label>
        <input
          id="sessions-reply-text"
          value={text}
          disabled={!box.enabled}
          placeholder={box.enabled ? 'Send to this session…' : (box.reason ?? '')}
          title={box.reason ?? undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter never sends. The button is the submit, so a shell
            // prompt and a half-typed agent line both stay put.
            if (event.key === 'Enter') event.preventDefault()
          }}
        />
        {box.reason !== null && <p className="sessions-reply__reason" data-reply-reason>{box.reason}</p>}
        <button
          type="button"
          data-session-send
          disabled={!box.enabled || text.trim() === ''}
          {...shellControl(() => {
            if (!box.enabled || text.trim() === '') return
            onSend(text)
            setText('')
          })}
        >Send</button>
      </form>
      {facts.length > 0 && (
        <dl className="sessions-facts">
          {facts.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {cost !== '' && <p className="sessions-detail__cost">{cost}{run !== '' ? ` · ${run}` : ''}</p>}
      <div className="sessions-detail__verbs">
        <button type="button" data-session-pause {...shellControl(onPause)}>Pause</button>
        <button type="button" data-session-detach {...shellControl(onDetach)}>Detach</button>
        <button type="button" data-session-end {...shellControl(onEnd)}>End session</button>
      </div>
      <button type="button" className="sessions-show" data-session-show {...shellControl(onShow)}>Show on canvas</button>
      <button type="button" className="sessions-world" data-session-world={fact.id} {...shellControl(onShowInWorld)}>Show in World</button>
    </aside>
  )
}
