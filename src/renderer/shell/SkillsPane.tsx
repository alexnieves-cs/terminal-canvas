import { emptyState } from '@shared/empty-states'
import { memo, useState, type DragEvent, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { SkillsWorkspace } from './SkillsWorkspace'
import type { SkillUse } from '@renderer/skills/skill-trail-store'
import { shellControl } from './shell-control'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/primitives'
import { ChevronLeft, Maximize, More } from '@renderer/icons'
import { UNGROUPED_COLUMN_ID, type SkillKey } from '@shared/skills'
import type { ToolScope } from '@shared/toolbox'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'
import {
  noMatchSentence,
  SKILL_CARD_MIME,
  SKILL_PANE_KINDS,
  UNGROUPED_DELETE_REASON,
  type SkillCard,
  type SkillColumn,
  type SkillPaneKind
} from './skills-pane-model'

/**
 * M127. THE SKILLS PANE — the navigator's eighth pane: columns of cards over
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

/**
 * Whether the SHELF itself — the user's own arrangement, a separate record
 * from the inventory — could be read and written.
 *
 * Three states, never two: an unread shelf and an empty shelf both paint no
 * placed cards, but one of them means "you have arranged nothing yet" and
 * the other means "your arrangement is not on screen and a drag you make now
 * will not be saved". Collapsing them tells the user to redo work they have
 * already done.
 */
export type ShelfState =
  | { kind: 'pending' }
  | { kind: 'loaded' }
  | { kind: 'unavailable'; why: string }

export type SkillsInventoryState =
  | { kind: 'unavailable'; why: string }
  | { kind: 'no-cwd' }
  | { kind: 'pending' }
  | { kind: 'inventory'; readAt: number }

export interface SkillsPaneProps {
  onToggle: () => void
  state: SkillsInventoryState
  /** The shelf's own three states — see `ShelfState`. */
  shelfState: ShelfState
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
  /** M131. The roster the assign door offers — choosing among it, never typing a name. */
  teammates: readonly PersistedTeammate[]
  /**
   * M131 fix round 2. Main's real verdict on the last assign-door save —
   * `not visible to <teammate>: <repoRoot> is outside their places` — or an
   * early, ADVISORY sentence from the renderer's own rough check while the
   * real answer is in flight. Null when there is nothing to say.
   */
  assignNotice: string | null
  /** Assign every card in a column to a teammate, in one write. */
  onAssignColumn: (columnId: string, teammateId: string) => void
  /** Assign one card to a teammate. */
  onAssignCard: (key: SkillKey, teammateId: string) => void
  /**
   * M129 fix. The `skill:create` door, wired at last: `skill:create` had no
   * renderer caller at all, so the channel and its refusals existed and
   * nothing could reach them.
   *
   * The pane offers the two roots it ALREADY knows — the user's own
   * `~/.claude/skills` and the current inventory's repository — and nothing
   * else: main derives the real path from the asking panel's cwd, and a
   * renderer that could name a root could widen one.
   */
  onNewSkill: (scope: 'user' | 'project', name: string) => void
  /** Non-null disables the project scope with this sentence, never removes it. */
  projectScopeReason: string | null
  /**
   * M196 (D04). Where a PROJECT skill will actually land, when that is not the
   * folder the pane's subject shows — a dispatched conversation works in a
   * worktree lane and its project skills go to the repository the lane was cut
   * from. A statement, never a refusal: the scope stays enabled and says which
   * repository gets the file.
   */
  projectScopeNote?: string | null
  /** Main's own answer to the last create, as a sentence. Null when there is nothing to say. */
  newSkillResult: string | null
  /** M256. Keys with a skill panel open on this canvas — the "On canvas" state. */
  placedKeys?: ReadonlySet<SkillKey>
  /** M256. Place a skill panel at the canvas centre. */
  onPlaceOnCanvas?: (scope: ToolScope, name: string) => void
  /** M256. A snapshot of skill uses for the workspace's "Recent use". */
  readUsage?: () => SkillUse[]
}

const NO_KEYS: ReadonlySet<SkillKey> = new Set()
const NO_USES = (): SkillUse[] => []

const SCOPES: readonly ToolScope[] = ['user', 'project', 'local']

/**
 * M127 critic wave. The heading's own provenance word — the same fact the
 * cards carry, said once for the whole column, so the rack's ORDER (the
 * user's own columns first, the derived ones after) is legible without
 * reading every card. Ungrouped is neither and says nothing extra.
 */
function columnWhy(column: SkillColumn): string | null {
  if (column.origin === 'placed') return 'placed by you'
  if (column.origin === 'derived') return 'derived'
  return null
}

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
  // The New-skill draft, local to the pane: a name the user is typing is not
  // a fact anything outside this component needs, and lifting it would
  // re-render the shell on every keystroke.
  const [drafting, setDrafting] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftScope, setDraftScope] = useState<'user' | 'project'>('user')
  // M127 fix. ONE menu open at a time, named by its owner (`col:<id>` /
  // `card:<key>`). The navigator is a fixed ~300px wide (M46: its width is the
  // breakpoint's), so a heading that spelled its two verbs out made the column
  // wider than the pane it scrolls inside — the first column rendered half off
  // the left edge. M106's one header rule applies here as it does to a panel:
  // the title GIVES and every control is `flex: 0 0 auto`, which means the
  // verbs collapse into one control rather than shrinking.
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  // M256. The dedicated workspace view — local, like the draft: whether it is
  // open is nothing anything outside the pane needs to know.
  const [workspace, setWorkspace] = useState(false)
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
          {/* M127 critic wave. ONE control, named with words. A bare `+`
              beside a worded `New skill` read as a second, unexplained verb;
              the column door says what it makes. */}
          {/* M256. "Create collection", not "New column": the thing made is a
              named group of skills, and a column is only how this narrow pane
              happens to draw one. The hook keeps its old name for its readers. */}
          <button type="button" className="rail-row__verb" data-skills-new-column
            title="Create a collection to group skills in" {...shellControl(props.onNewColumn)}>Create collection</button>
          <button type="button" className="rail-row__verb" data-skills-new-skill
            title="Scaffold a new skill's SKILL.md" {...shellControl(() => setDrafting((d) => !d))}>New skill</button>
          <button type="button" className="icon-button" data-skills-open-workspace title="Open the skills workspace - list, detail and details side by side"
            aria-label="Open the skills workspace" {...shellControl(() => setWorkspace(true))}><Maximize /></button>
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

      {drafting && (
        /* An inline draft, not a dialog: Electron's renderer has no
           `window.prompt`, and a name is one field. The project scope stays
           PRESENT and disabled with its reason — a scope that vanished when
           no panel had a directory would read as a feature that only ever
           writes to the home folder. */
        <div className="skills-pane__filters" data-skills-new-skill-draft>
          <input className="skills-pane__search" type="text" value={draftName} placeholder="skill name"
            aria-label="New skill name" data-skills-new-skill-name
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setDraftName(e.target.value)} />
          {(['user', 'project'] as const).map((sc) => {
            const reason = sc === 'project' ? props.projectScopeReason : null
            return (
              <button key={sc} type="button" className="skills-pane__filter" data-skills-new-skill-scope={sc}
                aria-pressed={draftScope === sc} disabled={reason !== null}
                title={reason ?? `Write it into the ${sc} skills folder`}
                {...shellControl(() => { if (reason === null) setDraftScope(sc) })}>{sc}</button>
            )
          })}
          <button type="button" className="rail-row__verb" data-skills-new-skill-create
            disabled={draftName.trim() === ''}
            title={draftName.trim() === '' ? 'a skill needs a name' : `Create ${draftName.trim()}`}
            {...shellControl(() => {
              const name = draftName.trim()
              if (name === '') return
              props.onNewSkill(draftScope, name)
              setDraftName('')
            })}>Create</button>
        </div>
      )}

      {/* M196. Shown only while the project scope is the one selected, and
          only when there is a lane — a note about where a user skill goes
          would be answering a question nobody asked. */}
      {drafting && draftScope === 'project' && props.projectScopeNote != null && (
        <p className="pf__note skills-pane__empty" data-skills-project-scope-note>{props.projectScopeNote}</p>
      )}

      {props.newSkillResult !== null && (
        <p className="pf__note skills-pane__empty" data-skills-new-skill-result>{props.newSkillResult}</p>
      )}

      {props.shelfState.kind === 'unavailable' && (
        <p className="pf__note skills-pane__shelf-why" data-skills-shelf-why>
          your columns could not be read, so every card is showing where it derives and a card you move here will not be saved — {props.shelfState.why}
        </p>
      )}

      {props.assignNotice !== null && (
        <p className="pf__note skills-pane__assign-notice" data-skills-assign-notice>{props.assignNotice}</p>
      )}

      {workspace && createPortal(
        <SkillsWorkspace columns={props.state.kind === 'inventory' ? props.columns : []} kind={props.kind} onChooseKind={props.onChooseKind}
          query={props.query} onQuery={props.onQuery}
          {...(props.state.kind === 'inventory' ? {} : { notReady: props.state.kind === 'no-cwd' ? SKILLS_NO_CWD : props.state.kind === 'pending' ? SKILLS_PENDING : props.state.why })}
          placedKeys={props.placedKeys ?? NO_KEYS}
          {...(props.onPlaceOnCanvas === undefined ? {} : { onPlaceOnCanvas: props.onPlaceOnCanvas })}
          readUsage={props.readUsage ?? NO_USES} onCreateCollection={props.onNewColumn} onClose={() => setWorkspace(false)} />,
        document.body
      )}

      {props.state.kind === 'no-cwd' ? (
        <p className="pf__note skills-pane__empty" data-skills-empty>{SKILLS_NO_CWD}</p>
      ) : props.state.kind === 'pending' ? (
        <p className="pf__note skills-pane__empty" data-skills-empty>{SKILLS_PENDING}</p>
      ) : props.state.kind === 'unavailable' ? (
        <p className="pf__note skills-pane__empty" data-skills-empty>{props.state.why}</p>
      ) : props.columns.length === 0 ? (
        <p className="pf__note skills-pane__empty" data-skills-empty>
          {noMatchSentence(props.kind, props.query)}
        </p>
      ) : (
        <div className="skills-pane__columns" data-skills-columns>
          {props.columns.map((col) => {
            // Ungrouped is a real column and cannot be deleted. Its control is
            // PRESENT and disabled with the reason — a control that vanished
            // would read as a feature that was never built.
            const undeletable = col.id === UNGROUPED_COLUMN_ID
            const menuKey = `col:${col.id}`
            const menuOpen = openMenu === menuKey
            return (
              <section key={col.id} className="skills-pane__column" data-skills-column={col.id} {...dropHandlers(col.id)}>
                {/* The provenance word sits on its OWN line under the title,
                    not beside it: the column is 12rem and a word beside the
                    title ate it down to `STARTI…`. M106's rule is unchanged —
                    the title still gives and still ellipsises — but it now
                    gives against the count and the menu alone. */}
                <h3 className="skills-pane__heading">
                  <span className="skills-pane__column-title" title={col.title}>{col.title}</span>
                  <span className="skills-pane__count">{col.cards.length}</span>
                  {/* M276. A POPOVER, not a menu — and that is a correction,
                      not a preference. The surface holds a native <select>,
                      which a `role="menu"` promises does not exist: a menu
                      says its children are menuitems reached with the arrow
                      keys, and a select claims those same keys for its own
                      options. The two fought, silently, and a screen reader
                      was told to expect rows it would never find. Tab walks
                      this, which is what its content actually supports.

                      The class, the host and the data attributes are
                      unchanged, so nothing moves and nothing looks different;
                      only the promise made to the keyboard is now true. */}
                  <span className="skills-pane__menu-host">
                    <Popover open={menuOpen} onOpenChange={(open) => setOpenMenu(open ? menuKey : null)}>
                      <PopoverTrigger className="icon-button skills-pane__menu-button" data-skills-column-menu={col.id}
                        title={`Actions for ${col.title}`} aria-label={`Actions for ${col.title}`}><More /></PopoverTrigger>
                      <PopoverContent>
                        <div className="skills-pane__menu" data-skills-column-menu-open={col.id}>
                          <select className="skills-pane__assign" data-skills-assign-column={col.id}
                            aria-label={`Assign ${col.title} to teammate`} title="Assign to teammate" value=""
                            disabled={col.cards.length === 0 || props.teammates.length === 0}
                            onChange={(e) => { const id = e.target.value; if (id !== '') { props.onAssignColumn(col.id, id); setOpenMenu(null) } }}>
                            <option value="">Assign to teammate…</option>
                            {props.teammates.map((t) => <option key={t.id} value={t.id}>{teammateWord(t)}</option>)}
                          </select>
                          {/* Ungrouped's Delete stays PRESENT and disabled with its
                              reason: a verb that vanished inside the menu would read
                              as a feature that was never built. */}
                          <button type="button" className="rail-row__verb skills-pane__delete" data-skills-delete={col.id}
                            disabled={undeletable}
                            title={undeletable ? UNGROUPED_DELETE_REASON : `Delete ${col.title}; its cards go back to where they derive`}
                            {...shellControl(() => { if (!undeletable) { props.onDeleteColumn(col.id); setOpenMenu(null) } })}>Delete</button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </span>
                </h3>
                {columnWhy(col) !== null && (
                  <p className="skills-pane__origin" data-skills-column-origin={col.origin ?? ''}>{columnWhy(col)}</p>
                )}
                <ul className="rail-list rail-list--skills">
                  {col.cards.length === 0 ? (
                    <li className="rail-empty" data-skills-column-empty>{emptyState('skills-column').sentence}</li>
                  ) : col.cards.map((card) => {
                  const cardMenuKey = `card:${card.key}`
                  const cardMenuOpen = openMenu === cardMenuKey
                  return (
                    <li key={card.key} className="rail-row skill-card" data-skill-card={card.key}
                      data-skill-installed={card.installed ? 'yes' : 'no'} draggable
                      onDragStart={(e) => { e.dataTransfer.setData(SKILL_CARD_MIME, card.key); e.dataTransfer.effectAllowed = 'move' }}>
                      <span className="rail-row__label skill-card__name" title={card.name}>{card.name}</span>
                      {/* The same correction as the column's, and starker: this
                          surface's ONLY child is a <select>, so `role="menu"`
                          described a list of commands that never existed. */}
                      <span className="skills-pane__menu-host skill-card__menu-host">
                        <Popover open={cardMenuOpen} onOpenChange={(open) => setOpenMenu(open ? cardMenuKey : null)}>
                          <PopoverTrigger className="icon-button skills-pane__menu-button" data-skill-card-menu={card.key}
                            title={`Assign ${card.name} to teammate`} aria-label={`Assign ${card.name} to teammate`}><More /></PopoverTrigger>
                          <PopoverContent>
                            <div className="skills-pane__menu">
                              <select className="skills-pane__assign" data-skills-assign-card={card.key}
                                aria-label={`Assign ${card.name} to teammate`} title="Assign to teammate" value=""
                                disabled={props.teammates.length === 0}
                                onChange={(e) => { const id = e.target.value; if (id !== '') { props.onAssignCard(card.key, id); setOpenMenu(null) } }}>
                                <option value="">Assign to teammate…</option>
                                {props.teammates.map((t) => <option key={t.id} value={t.id}>{teammateWord(t)}</option>)}
                              </select>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </span>
                      {card.description !== '' && <span className="skill-card__description" data-skill-description>{card.description}</span>}
                      {/* M127 critic wave. TWO lines, not one ellipsised
                          one: the provenance word is three characters and
                          the resource sentence is a sentence, and joining
                          them cut the sentence mid-word (`no bundled fi…`),
                          which is the one thing a fact line must never do.
                          The word stays on its own nowrap line; the sentence
                          WRAPS beneath it, clamped at two lines. */}
                      <span className="skill-card__facts" data-skill-facts>
                        {[WHY_WORD[card.why], card.pluginId].filter((x) => x !== undefined).join(' · ')}
                      </span>
                      <span className="skill-card__resources" data-skill-resources>{resourceWord(card)}</span>
                      {!card.installed && (
                        <span className="skill-card__note" data-skill-gone>not installed — the shelf kept its slot</span>
                      )}
                    </li>
                  ) })}
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
