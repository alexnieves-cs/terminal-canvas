import type { JSX, ReactNode } from 'react'
import { useState } from 'react'
import { emptyState, BLANK_CANVAS_PURPOSE, GHOST_TARGET, blankCanvasTitle, repoChipLabel } from '@shared/empty-states'
import { EMPTY_CANVAS_GESTURES } from '../canvas/hints'
import { STARTER_LAYOUTS } from '@shared/lineups'
import { blankTaskVerb } from '../palette/start-work'
import { shortcutById } from '@shared/shortcuts'
import { shellControl } from './shell-control'

/**
 * M177. ONE SHAPE for every empty state: the kind's glyph, the sentence from
 * `EMPTY_STATES` (a check pins the words), one verb where the surface has a
 * door. Centred, the UI face. `attrs` carries the data attribute the surface's
 * checks read; `fill` substitutes a `{name}` in the sentence (the chat's
 * engine). The verb is a `shellControl` — it acts on click and never starts a
 * drag beneath a pane.
 */
export function EmptyState({ id, glyph, onVerb, fill, attrs, children }: {
  id: string
  glyph?: ReactNode
  onVerb?: () => void
  fill?: Record<string, string>
  attrs?: Record<string, string | undefined>
  children?: ReactNode
}): JSX.Element {
  const state = emptyState(id)
  const sentence = fill === undefined ? state.sentence : state.sentence.replace(/\{(\w+)\}/g, (m, k: string) => fill[k] ?? m)
  return (
    <div className="empty-state" data-empty-state={id} {...(attrs ?? {})}>
      {glyph !== undefined && <span className="empty-state__glyph" aria-hidden="true">{glyph}</span>}
      <p className="empty-state__sentence">{sentence}</p>
      {state.verb !== undefined && onVerb !== undefined && (
        <button type="button" className="empty-state__verb pf__verb pf__verb--word" data-empty-state-verb title={state.verb} {...shellControl(onVerb)}>{state.verb}</button>
      )}
      {children}
    </div>
  )
}

/**
 * M441. The empty canvas. Quick spawns and starter layouts call back; they
 * do not start a process. The minimap sentence is `emptyState('minimap')`,
 * which L-B's overlay reads too (R-020). A double-click still places a
 * process step until R-022; the sentence is the mockup's.
 */
export function BlankCanvas({ workspace, repo, onStart, onQuick, onLayout }: {
  workspace: string
  repo?: string | null
  onStart?: (sentence: string) => void
  onQuick?: (id: 'agent' | 'shell' | 'import') => void
  onLayout?: (id: string) => void
}): JSX.Element {
  const [text, setText] = useState('')
  const verb = blankTaskVerb(text)
  const agent = shortcutById('new-agent')
  const shell = shortcutById('new-shell')
  const minimap = emptyState('minimap')
  return (
    <div className="rd-empty" data-rd-empty="">
      <div className="rd-empty__card">
        <h1 className="rd-empty__title">{blankCanvasTitle(workspace)}</h1>
        <p className="rd-empty__purpose">{BLANK_CANVAS_PURPOSE}</p>
        <div className="rd-empty__task">
          <input data-edit-owner="" value={text} placeholder="What should the agent do?" aria-label="Task" onChange={(e) => setText(e.target.value)} />
          <span className="rd-empty__chip">{repoChipLabel(repo)}</span>
          <button type="button" className="rd-empty__start" disabled={!verb.enabled} title={verb.reason} onClick={() => { if (verb.enabled) onStart?.(text) }}>{verb.label}</button>
        </div>
        <div className="rd-empty__quick">
          <button type="button" onClick={() => onQuick?.('agent')}>Claude Code {agent?.chord ?? ''}</button>
          <button type="button" onClick={() => onQuick?.('shell')}>Shell {shell?.chord ?? ''}</button>
          <button type="button" onClick={() => onQuick?.('import')}>Import a layout…</button>
        </div>
        <ul className="rd-empty__layouts">
          {STARTER_LAYOUTS.map((layout) => (
            <li key={layout.id}>
              <button type="button" data-layout={layout.id} onClick={() => onLayout?.(layout.id)}>
                <span className="rd-empty__layout-name">{layout.label}</span>
                <span className="rd-empty__layout-sentence">{layout.sentence}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="rd-empty__ghost">{GHOST_TARGET}</p>
        <ul className="rd-empty__hints">
          {EMPTY_CANVAS_GESTURES.map((hint) => <li key={hint.id}>{hint.text}</li>)}
        </ul>
      </div>
      <p className="rd-empty__minimap" data-empty-state="minimap">{minimap.sentence}</p>
    </div>
  )
}
