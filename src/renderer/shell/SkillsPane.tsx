import { memo, type DragEvent, type JSX } from 'react'
import { shellControl } from './shell-control'
import { ChevronLeft, Plus } from '@renderer/icons'
import { UNGROUPED_COLUMN_ID, type SkillKey } from '@shared/skills'
import type { ToolScope } from '@shared/toolbox'
import {
  SKILL_CARD_MIME,
  SKILL_PANE_KINDS,
  type SkillCard,
  type SkillColumn,
  type SkillPaneKind
} from './skills-pane-model'

/**
 * M126. THE SKILLS PANE — the navigator's eighth pane: columns of cards over
 * one inventory, three kind tabs (Skills / Agents / Commands) filtering it,
 * a search box and two filters.
 *
 * The pane owns the tabs, the search box and the drag handlers, and NOTHING
 * that decides where a card sits: `buildSkillColumns` is the whole model, and
 * every check lands there rather than on this file.
 *
 * Three renderings the surface owes, and each is a separate one on purpose:
 * "no panel is selected, so there is no directory to read" (the inspector's
 * Toolbox section's own `no-cwd` arm), "asked, not answered yet", and a real
 * inventory. A search that matches nothing is a FOURTH — an empty rack of
 * columns and "no skill matches `q`" lead the user to different fixes, which
 * is why the model returns `[]` rather than empty columns.
 *
 * The card's drag carries the pane's OWN MIME and nothing else — M114's rule
 * for the board's drops — so a drop between columns writes the override and a
 * drop on the canvas is read by the canvas host alone.
 */

export const SKILLS_NO_CWD = 'no directory — select a panel with one to read what it can do'
export const SKILLS_PENDING = 'reading…'

export type SkillsInventoryState =
  | { kind: 'no-cwd' }
  | { kind: 'pending' }
  | { kind: 'inventory'; readAt: number }

export interface SkillsPaneProps {
  onToggle: () => void
  state: SkillsInventoryState
  columns: readonly SkillColumn[]
  kind: SkillPaneKind
  onChooseKind: (kind: SkillPaneKind) => void
  query: string
  onQuery: (query: string) => void
  /** null means every scope. */
  scopes: readonly ToolScope[] | null
  onToggleScope: (scope: ToolScope) => void
  placedOnly: boolean
  onTogglePlacedOnly: () => void
  /** A drag between columns: the override the shelf records. */
  onPlace: (key: SkillKey, columnId: string) => void
  onNewColumn: () => void
  onDeleteColumn: (id: string) => void
}

const SCOPES: readonly ToolScope[] = ['user', 'project', 'local']

/** The word every card wears; the shelf has two authorities and this names which. */
const WHY_WORD: Readonly<Record<SkillCard['why'], string>> = {
  placed: 'placed',
  'by-plugin': 'by plugin',
  'by-scope': 'by scope'
}

/**
 * Three states, never two: "ships nothing" and "we could not look" lead to
 * different fixes, so `unknown` says why rather than printing a confident 0.
 */
function resourceWord(card: SkillCard): string {
  const r = card.resources
  if (r.kind === 'none') return 'no bundled files'
  if (r.kind === 'some') return `${r.n} bundled file${r.n === 1 ? '' : 's'}`
  return `bundled files not counted — ${r.why}`
}

function SkillsPaneImpl(props: SkillsPaneProps): JSX.Element {
  const dropHandlers = (columnId: string): { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void } => ({
    onDragOver: (e) => {
      if (e.dataTransfer.types.includes(SKILL_CARD_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
    },
    onDrop: (e) => {
      const key = e.dataTransfer.getData(SKILL_CARD_MIME)
      if (key === '') return
      e.preventDefault()
      props.onPlace(key, columnId)
    }
  })
  return (
    <div className="shell__tree skills-pane" aria-label="Skills" data-skills-pane>
      <div className="shell__region-title shell__region-title--action navigator__header">
        <span className="shell__tree-root">Skills</span>
        <span className="navigator__header-actions">
          <button type="button" className="shell__region-add icon-button" title="New column" aria-label="New column" data-skills-new-column {...shellControl(props.onNewColumn)}><Plus /></button>
          <button type="button" className="shell__rail-toggle icon-button" title="Hide the navigator" aria-label="Hide the navigator" {...shellControl(props.onToggle)}><ChevronLeft /></button>
        </span>
      </div>

      {/* The three tabs over ONE inventory: toolbox-read already walks all
          three directories, so the extra two cost a filter. */}
      <div className="skills-pane__tabs" role="tablist" aria-label="Kind" data-skills-tabs>
        {SKILL_PANE_KINDS.map((k) => (
          <button key={k} type="button" role="tab" className="skills-pane__tab" data-skills-tab={k}
            aria-selected={props.kind === k} title={`Show ${k}s`} {...shellControl(() => props.onChooseKind(k))}>{k}s</button>
        ))}
      </div>

      <div className="skills-pane__filters">
        <input className="skills-pane__search" type="search" value={props.query} placeholder="Search"
          aria-label="Search skills" data-skills-search
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => props.onQuery(e.target.value)} />
        {SCOPES.map((s) => (
          <button key={s} type="button" className="skills-pane__filter" data-skills-scope={s}
            aria-pressed={props.scopes !== null && props.scopes.includes(s)}
            title={`Show only ${s} — press again for every scope`}
            {...shellControl(() => props.onToggleScope(s))}>{s}</button>
        ))}
        <button type="button" className="skills-pane__filter" data-skills-placed aria-pressed={props.placedOnly}
          title="Show only the cards you placed yourself"
          {...shellControl(props.onTogglePlacedOnly)}>placed only</button>
      </div>

      {props.state.kind === 'no-cwd' ? (
        <p className="pf__note skills-pane__empty" data-skills-empty>{SKILLS_NO_CWD}</p>
      ) : props.state.kind === 'pending' ? (
        <p className="pf__note skills-pane__empty" data-skills-empty>{SKILLS_PENDING}</p>
      ) : props.columns.length === 0 ? (
        <p className="pf__note skills-pane__empty" data-skills-empty>
          {props.query === ''
            ? `no ${props.kind} in this directory`
            : `no ${props.kind} matches ${props.query}`}
        </p>
      ) : (
        <div className="skills-pane__columns" data-skills-columns>
          {props.columns.map((col) => {
            // Ungrouped is a real column and cannot be deleted. Its control is
            // PRESENT and disabled with the reason — a control that vanished
            // would read as a feature that was never built.
            const undeletable = col.id === UNGROUPED_COLUMN_ID
            return (
              <section key={col.id} className="skills-pane__column" data-skills-column={col.id} {...dropHandlers(col.id)}>
                <h3 className="skills-pane__heading">
                  <span className="skills-pane__column-title">{col.title}</span>
                  <span className="skills-pane__count">{col.cards.length}</span>
                  <button type="button" className="rail-row__verb skills-pane__delete" data-skills-delete={col.id}
                    disabled={undeletable}
                    title={undeletable ? 'Ungrouped is where an unplaced card sits — it cannot be deleted' : `Delete ${col.title}; its cards go back to where they derive`}
                    {...shellControl(() => { if (!undeletable) props.onDeleteColumn(col.id) })}>Delete</button>
                </h3>
                <ul className="rail-list rail-list--skills">
                  {col.cards.length === 0 ? (
                    <li className="rail-empty" data-skills-column-empty>drop a card here</li>
                  ) : col.cards.map((card) => (
                    <li key={card.key} className="rail-row skill-card" data-skill-card={card.key}
                      data-skill-installed={card.installed ? 'yes' : 'no'} draggable
                      onDragStart={(e) => { e.dataTransfer.setData(SKILL_CARD_MIME, card.key); e.dataTransfer.effectAllowed = 'move' }}>
                      <span className="rail-row__label skill-card__name" title={card.name}>{card.name}</span>
                      {card.description !== '' && <span className="skill-card__description" data-skill-description>{card.description}</span>}
                      <span className="skill-card__facts" data-skill-facts>
                        {[WHY_WORD[card.why], resourceWord(card), card.pluginId].filter((x) => x !== undefined).join(' · ')}
                      </span>
                      {!card.installed && (
                        <span className="skill-card__note" data-skill-gone>not installed — the shelf kept its slot</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const SkillsPane = memo(SkillsPaneImpl)
