import { memo, type DragEvent, type JSX } from 'react'
import { shellControl } from './shell-control'
import { ChevronLeft } from '@renderer/icons'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'
import { USER_SET_STATES, WORK_ITEM_MIME, WORK_ITEM_STATES, type PersistedWorkItem, type WorkItemState } from '@shared/work-items'

/**
 * M116. THE BOARD PANE — the navigator's seventh pane: four columns over
 * the workspace's work items, in `WORK_ITEM_STATES` order, rows newest
 * first. Every column and every row is a projection of the records the
 * canvas holds; the pane owns nothing and writes through the callbacks.
 *
 * A column is a DROP TARGET only for `USER_SET_STATES` — `data-board-drop`
 * is present on exactly those columns and the drag handlers are mounted
 * only there — so `working` and `review`, which the runtime sets from
 * events (a dispatch, a pull request), cannot be reached by a drag: a card
 * you can drag to a column the runtime owns is a board that lies about what
 * happened. The rule is read off the record's own list, never spelled here,
 * so a state added later is refused as a target by default.
 *
 * A row click FLIES to the item's card through `onGoTo` (the minimap's rule:
 * a camera move, never a focus and never a raise — navigating is not
 * interacting); a row whose item has no card offers `Show on canvas`
 * instead, disabled by nothing, because a board row that did nothing on
 * click would read as a broken row.
 */
export const BOARD_EMPTY = 'Nothing on the board — add a GitHub or Jira item, or ⌘K, then New work item…'

export interface BoardPaneProps {
  onToggle: () => void
  items: readonly PersistedWorkItem[]
  teammates: readonly PersistedTeammate[]
  /** The lane chat's rail label by panel id; undefined when the chat is not on this canvas. */
  laneLabelOf: (panelId: string) => string | undefined
  /** Whether the item has a card on this canvas — a row flies to it, else offers Show on canvas. */
  hasCard: (itemId: string) => boolean
  onGoTo: (itemId: string) => void
  onSetState: (itemId: string, state: WorkItemState) => void
  onShowOnCanvas: (itemId: string) => void
}

function BoardPaneImpl(props: BoardPaneProps): JSX.Element {
  const byState = (state: WorkItemState): PersistedWorkItem[] =>
    props.items.filter((i) => i.state === state).sort((a, b) => b.updatedAt - a.updatedAt)
  const teammateName = (id: string | undefined): string | undefined => {
    if (id === undefined) return undefined
    const t = props.teammates.find((x) => x.id === id)
    return t === undefined ? id : teammateWord(t)
  }
  // The drag handlers exist only on a droppable column; a column that is
  // not one has NO handler, so the browser's default (a refused drop) holds.
  const dropHandlers = (state: WorkItemState): { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void } => ({
    onDragOver: (e) => { if (e.dataTransfer.types.includes(WORK_ITEM_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } },
    onDrop: (e) => {
      const id = e.dataTransfer.getData(WORK_ITEM_MIME)
      if (id === '') return
      e.preventDefault()
      props.onSetState(id, state)
    }
  })
  return (
    <div className="shell__tree board-pane" aria-label="Board" data-board-pane>
      <div className="shell__region-title shell__region-title--action navigator__header">
        <span className="shell__tree-root">Board</span>
        <span className="navigator__header-actions">
          <button type="button" className="shell__rail-toggle icon-button" title="Hide the navigator" aria-label="Hide the navigator" {...shellControl(props.onToggle)}><ChevronLeft /></button>
        </span>
      </div>
      {props.items.length === 0 ? (
        <p className="pf__note board-pane__empty" data-board-empty>{BOARD_EMPTY}</p>
      ) : (
        <div className="board-pane__columns" data-board-columns>
          {WORK_ITEM_STATES.map((state) => {
            const droppable = USER_SET_STATES.includes(state)
            const rows = byState(state)
            return (
              <section key={state} className="board-pane__column" data-board-column={state} {...(droppable ? { 'data-board-drop': '', ...dropHandlers(state) } : {})}>
                <h3 className="board-pane__heading"><span className="board-pane__state">{state}</span><span className="board-pane__count">{rows.length}</span></h3>
                {/* M149 (F.7). An empty column says what it is for — a drop target that
                    looks like one, or the runtime's own rule — never a bare zero. */}
                {rows.length === 0 && (
                  <p className="pf__note board-pane__empty" data-board-empty={state}>{emptyColumnWord(state, droppable)}</p>
                )}
                <ul className="rail-list rail-list--board">
                  {rows.map((item) => {
                    const carded = props.hasCard(item.id)
                    const teammate = teammateName(item.teammateId)
                    const lane = item.panelId === undefined ? undefined : (props.laneLabelOf(item.panelId) ?? item.panelId)
                    return (
                      <li key={item.id} className="rail-row board-row" data-board-row={item.id} draggable
                        onDragStart={(e) => { e.dataTransfer.setData(WORK_ITEM_MIME, item.id); e.dataTransfer.effectAllowed = 'move' }}>
                        <button type="button" className="rail-row__main" title={carded ? `Go to ${item.title}` : `${item.title} has no card on this canvas`}
                          {...shellControl(() => { if (carded) props.onGoTo(item.id) })}>
                          <span className="rail-row__label">{item.title}</span>
                        </button>
                        {/* The key, the teammate and the lane as a SECOND line — three facts do not fit a one-line tail; each ABSENT when unknown, never a dash. */}
                        <span className="board-row__facts" data-board-facts>{[item.key, teammate, lane].filter((x) => x !== undefined).join(' · ')}</span>
                        {item.pr !== undefined && (
                          <a className="board-row__pr" href={item.pr.url} data-board-pr onMouseDown={(e) => e.stopPropagation()} onAuxClick={(e) => e.preventDefault()}
                            onClick={(e) => { e.preventDefault(); void window.canvas.links.open({ panelId: item.panelId ?? '', target: (item.pr as { url: string }).url }) }}>#{item.pr.number}</a>
                        )}
                        {/* A working card's note is the one sentence the runtime left (`lane closed`, a refusal). */}
                        {item.note !== undefined && <span className="board-row__note" data-board-note>{item.note}</span>}
                        {!carded && (
                          <button type="button" className="rail-row__verb board-row__show" data-board-show title="Show a card for this item at the centre of the canvas" {...shellControl(() => props.onShowOnCanvas(item.id))}>Show on canvas</button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** M149 (F.7). The empty column's three arms: a user-set column is a drop target; a runtime column names what sets it. */
export function emptyColumnWord(state: string, droppable: boolean): string {
  if (droppable) return 'nothing here — drop a card, or add one from the palette'
  // The two runtime states are read off WORK_ITEM_STATES by index, never
  // spelled: `verify:rail state.2` forbids the state words as literals outside
  // panel-state.ts, so a renamed state fails here loudly rather than matching nothing.
  if (state === WORK_ITEM_STATES[1]) return 'set when a dispatched lane starts its first turn'
  if (state === WORK_ITEM_STATES[2]) return 'set when a lane opens its pull request'
  return 'nothing here'
}

export const BoardPane = memo(BoardPaneImpl)
