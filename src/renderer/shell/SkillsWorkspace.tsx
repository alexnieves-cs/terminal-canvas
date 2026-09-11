import { memo, useEffect, useMemo, useState, type JSX } from 'react'
import { shellControl } from './shell-control'
import { Close, Search } from '@renderer/icons'
import { displayPath } from '@shared/display-path'
import type { SkillKey } from '@shared/skills'
import type { ToolScope } from '@shared/toolbox'
import type { SkillUse } from '@renderer/skills/skill-trail-store'
import {
  noMatchSentence,
  skillBadge,
  skillPurpose,
  skillState,
  SKILL_PANE_KINDS,
  stripFrontmatter,
  type SkillCard,
  type SkillColumn,
  type SkillPaneKind
} from './skills-pane-model'

/**
 * M256. THE SKILLS WORKSPACE — the Skills pane's inventory given the room it
 * needs: a searchable list on the left, the skill itself in the centre, and
 * where it came from, what state it is in and when it was last used on the
 * right.
 *
 * It is a VIEW over the pane's own props, never a second model: the same
 * columns (now called collections), the same query, the same kind tab. A
 * filter set in one is set in the other, so the navigator and this view can
 * never disagree about what "the skills here" are.
 *
 * Preview-before-use reads SKILL.md through the ordinary `file:read` door
 * under this view's own panel id, and closes it when the view closes or the
 * selection moves — the same read-and-close pairing every file surface uses.
 */

const PREVIEW_ID = 'skills-workspace-preview'
const PREVIEW_MAX_LINES = 400

export interface SkillsWorkspaceProps {
  columns: readonly SkillColumn[]
  kind: SkillPaneKind
  onChooseKind: (kind: SkillPaneKind) => void
  query: string
  onQuery: (query: string) => void
  /** Keys of skills that have a panel open on this canvas. */
  placedKeys: ReadonlySet<SkillKey>
  /** Absent disables the verb with its reason — never a hidden door. */
  onPlaceOnCanvas?: (scope: ToolScope, name: string) => void
  /** A snapshot of every skill use the canvas can see, newest first. */
  readUsage: () => SkillUse[]
  onCreateCollection: () => void
  onClose: () => void
  /**
   * Why there is no inventory to list, when there is none — the pane's own
   * sentence. Three states, never two: "no skill matches" over a directory
   * that was never read would send a person to clear a search that is empty.
   */
  notReady?: string
}

type Preview =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'text'; body: string; truncated: number }
  | { kind: 'unreadable'; why: string }

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

function SkillsWorkspaceImpl(props: SkillsWorkspaceProps): JSX.Element {
  const { columns, placedKeys } = props
  const cards = useMemo(() => columns.flatMap((c) => c.cards.map((card) => ({ card, collection: c }))), [columns])
  const [chosen, setChosen] = useState<SkillKey | null>(null)
  // The selection follows the list: a chosen key the filter removed falls
  // back to the first row rather than painting a detail for a hidden skill.
  const current = cards.find((c) => c.card.key === chosen) ?? cards[0]
  const card: SkillCard | undefined = current?.card
  const [usage] = useState(() => props.readUsage())
  const [now] = useState(() => Date.now())

  const [preview, setPreview] = useState<Preview>({ kind: 'none' })
  const sourcePath = card?.sourcePath
  useEffect(() => {
    if (sourcePath === undefined) { setPreview({ kind: 'none' }); return }
    setPreview({ kind: 'pending' })
    let live = true
    void window.canvas.file.read({ panelId: PREVIEW_ID, path: sourcePath })
      .then((r) => {
        if (!live) return
        if (r.kind !== 'text') { setPreview({ kind: 'unreadable', why: r.kind === 'unreadable' ? r.detail : `the file is ${r.kind}` }); return }
        const lines = stripFrontmatter(r.content).split('\n')
        setPreview({ kind: 'text', body: lines.slice(0, PREVIEW_MAX_LINES).join('\n'), truncated: Math.max(0, lines.length - PREVIEW_MAX_LINES) + r.truncatedLines })
      })
      // MANDATORY: a rejected read must land in a sentence, never a
      // permanent "reading…".
      .catch((error: unknown) => { if (live) setPreview({ kind: 'unreadable', why: String(error) }) })
    return () => { live = false; void window.canvas.file.close(PREVIEW_ID) }
  }, [sourcePath])

  // Escape closes the view — the way out of every other overlay here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); props.onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [props.onClose])

  const uses = card === undefined ? [] : usage.filter((u) => u.name === card.name)
  const state = card === undefined ? undefined : skillState(card, placedKeys.has(card.key))

  return (
    <div className="skills-ws" role="dialog" aria-label="Skills workspace" data-skills-workspace
      onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <header className="skills-ws__head">
        <h2 className="skills-ws__title">Skills</h2>
        <div className="skills-ws__tabs" role="tablist" aria-label="Kind">
          {SKILL_PANE_KINDS.map((k) => (
            <button key={k} type="button" role="tab" className="skills-ws__tab" aria-selected={props.kind === k} title={`Show ${k}s`}
              {...shellControl(() => props.onChooseKind(k))}>{k}s</button>
          ))}
        </div>
        <span className="skills-ws__spacer" />
        <button type="button" className="skills-ws__verb" data-skills-ws-create-collection
          title="Create a collection to group skills in - drag skills into it from the navigator"
          {...shellControl(props.onCreateCollection)}>Create collection</button>
        <button type="button" className="icon-button skills-ws__close" title="Close (Esc)" aria-label="Close the skills workspace"
          data-skills-ws-close {...shellControl(props.onClose)}><Close /></button>
      </header>

      <div className="skills-ws__grid">
        {/* LEFT — the list, grouped by collection, purpose before detail. */}
        <nav className="skills-ws__list" aria-label="Skill list">
          <label className="skills-ws__search">
            <Search />
            <input type="search" value={props.query} placeholder={`Search ${props.kind}s`} aria-label={`Search ${props.kind}s`}
              data-skills-ws-search onMouseDown={(e) => e.stopPropagation()} onChange={(e) => props.onQuery(e.target.value)} />
          </label>
          {props.notReady !== undefined ? (
            <p className="skills-ws__empty" data-skills-ws-empty>{props.notReady}</p>
          ) : cards.length === 0 ? (
            <p className="skills-ws__empty" data-skills-ws-empty>{noMatchSentence(props.kind, props.query)}</p>
          ) : columns.filter((c) => c.cards.length > 0).map((col) => (
            <section key={col.id} className="skills-ws__group">
              <h3 className="skills-ws__group-title">{col.title}<span className="skills-ws__group-count">{col.cards.length}</span></h3>
              <ul className="skills-ws__rows">
                {col.cards.map((c) => {
                  const st = skillState(c, placedKeys.has(c.key))
                  return (
                    <li key={c.key}>
                      <button type="button" className="skills-ws__row" data-skills-ws-row={c.key}
                        aria-current={c.key === card?.key ? 'true' : undefined} data-state={st.kind}
                        {...shellControl(() => setChosen(c.key))}>
                        <span className="skills-ws__row-top">
                          <span className="skills-ws__row-name">{c.name}</span>
                          <span className={`skill-badge skill-badge--${skillBadge(c).toLowerCase()}`}>{skillBadge(c)}</span>
                        </span>
                        <span className="skills-ws__row-purpose">{skillPurpose(c.description) || st.why}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>

        {/* CENTRE — the skill, readable: purpose first, then the preview. */}
        <article className="skills-ws__detail" aria-label="Skill detail">
          {card === undefined ? (
            <p className="skills-ws__empty">Choose a {props.kind} on the left to read it here.</p>
          ) : (
            <>
              <p className="skills-ws__eyebrow">
                <span className={`skill-badge skill-badge--${skillBadge(card).toLowerCase()}`}>{skillBadge(card)}</span>
                <span className={`skill-state skill-state--${state!.kind}`} data-skills-ws-state={state!.kind}>{state!.word}</span>
              </p>
              <h1 className="skills-ws__name">{card.name}</h1>
              <p className="skills-ws__purpose" data-skills-ws-purpose>{skillPurpose(card.description) || 'This skill says nothing about itself in its description.'}</p>
              {card.description.length > skillPurpose(card.description).length + 1 && (
                <p className="skills-ws__description">{card.description}</p>
              )}
              <div className="skills-ws__actions">
                <button type="button" className="skills-ws__primary" data-skills-ws-place
                  disabled={props.onPlaceOnCanvas === undefined || !card.installed || props.kind !== 'skill'}
                  title={!card.installed ? 'not installed - there is nothing to place'
                    : props.kind !== 'skill' ? `a ${props.kind} has no panel of its own`
                      : props.onPlaceOnCanvas === undefined ? 'this canvas cannot place a skill panel right now'
                        : 'Open this skill as a panel on the canvas'}
                  {...shellControl(() => { if (card.installed && props.kind === 'skill') props.onPlaceOnCanvas?.(card.scope, card.name) })}
                >{placedKeys.has(card.key) ? 'Place another on canvas' : 'Place on canvas'}</button>
              </div>
              <section className="skills-ws__preview" aria-label="Preview" data-skills-ws-preview={preview.kind}>
                <h2 className="skills-ws__section">Preview</h2>
                {preview.kind === 'none' ? <p className="skills-ws__muted">{card.installed ? 'no file to preview' : 'not installed - its file was not read'}</p>
                  : preview.kind === 'pending' ? <p className="skills-ws__muted">reading…</p>
                    : preview.kind === 'unreadable' ? <p className="skills-ws__muted">could not read it - {preview.why}</p>
                      : <>
                        <div className="skills-ws__prose">{preview.body}</div>
                        {preview.truncated > 0 && <p className="skills-ws__muted">+{preview.truncated} more lines in the file</p>}
                      </>}
              </section>
            </>
          )}
        </article>

        {/* RIGHT — provenance, state, usage; the raw facts behind Advanced. */}
        <aside className="skills-ws__meta" aria-label="Skill details">
          {card !== undefined && state !== undefined && (
            <>
              <dl className="skills-ws__facts">
                <dt>State</dt><dd>{state.word}<span className="skills-ws__why">{state.why}</span></dd>
                <dt>Scope</dt><dd>{skillBadge(card)}{card.pluginId !== undefined && <span className="skills-ws__why">from {card.pluginId}</span>}</dd>
                <dt>Collection</dt><dd>{current!.collection.title}<span className="skills-ws__why">{card.why === 'placed' ? 'placed by you' : card.why === 'by-plugin' ? 'grouped by its plugin' : 'grouped by its scope'}</span></dd>
                {card.sourcePath !== undefined && <><dt>Location</dt><dd title={card.sourcePath} className="skills-ws__mono">{displayPath(card.sourcePath).short}</dd></>}
              </dl>
              <h2 className="skills-ws__section">Recent use</h2>
              {uses.length === 0 ? (
                <p className="skills-ws__muted" data-skills-ws-usage="none">no agent on this canvas has used it yet</p>
              ) : (
                <ul className="skills-ws__uses" data-skills-ws-usage={String(uses.length)}>
                  {uses.slice(0, 6).map((u, i) => (
                    <li key={`${u.panelId}:${u.at}:${i}`}><span>{u.where}</span><span className="skills-ws__muted">{ago(u.at, now)}</span></li>
                  ))}
                  {uses.length > 6 && <li className="skills-ws__muted">+{uses.length - 6} more</li>}
                </ul>
              )}
              <details className="skills-ws__advanced" data-skills-ws-advanced>
                <summary>Advanced</summary>
                <dl className="skills-ws__facts">
                  <dt>Key</dt><dd className="skills-ws__mono">{card.key}</dd>
                  <dt>Active</dt><dd>{card.active}</dd>
                  <dt>Bundled files</dt><dd>{card.resources.kind === 'none' ? 'none' : card.resources.kind === 'some' ? String(card.resources.n) : `not counted - ${card.resources.why}`}</dd>
                  {card.sourcePath !== undefined && <><dt>Path</dt><dd className="skills-ws__mono skills-ws__path">{card.sourcePath}</dd></>}
                </dl>
              </details>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

export const SkillsWorkspace = memo(SkillsWorkspaceImpl)
