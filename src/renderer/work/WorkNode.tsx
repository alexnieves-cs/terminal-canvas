import { useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { WorkPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { panelState } from '@renderer/panels/panel-state'
import { shellControl } from '@renderer/shell/shell-control'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'
import { WORK_ITEM_MIME, type PersistedWorkItem } from '@shared/work-items'

/**
 * M116. THE WORK CARD — the board's row in the world, the twelfth kind,
 * sessionless like Jira's and GitHub's. The panel carries the item's id
 * ALONE and the card reads the live record by it (`item` is looked up by the
 * canvas from the workspace's list on every render), so a card can never
 * say one thing while the board says another. The state word and its tone
 * come from `panelState`'s `work` arm — the one vocabulary — and ride the
 * frame's `state` prop, so the pill, the state edge and the far tiers all
 * paint the ITEM's state with no code of their own; `data-work-state` on
 * the root is what a check reads.
 *
 * A card whose record is gone (dropped from the list, or the workspace
 * restored from a snapshot that never had it) renders the one sentence and
 * only Close — never a blank body, which reads as a card that broke.
 *
 * The verbs are M114/M115's (dispatch, the PR door, the review flight,
 * done). Each is DISABLED BY NAME — the merged view, the PR door's own
 * `prRefusalSync` sentence, a teammate with no places — with the reason in
 * the title and the button kept, never removed. `Assign to…` opens a menu
 * spanned UNDER the verb row, inside the body: `.panel` clips overflow, so a
 * menu hung off the chrome would be cut at the frame's edge (the harness
 * lesson). The chrome is DRAGGABLE with the board's own MIME: the Teammates
 * pane's rows accept it, and a card in the world is the only thing that can
 * share the screen with that pane (the navigator shows one pane at a time).
 */
export interface WorkNodeProps {
  panel: WorkPanel
  /** The record, by the panel's item id; undefined when the board no longer holds it. */
  item: PersistedWorkItem | undefined
  /** The roster, for `Assign to…`. */
  teammates: readonly PersistedTeammate[]
  /** The lane chat's rail label, when the item has one and it is still on this canvas. */
  laneLabel: string | undefined
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
  /** M114. Dispatch the item to a teammate. */
  onDispatch: (itemId: string, teammateId: string) => void
  /** M114. Why a teammate cannot be picked, before main is asked; null when it can. */
  teammateReason: (teammate: PersistedTeammate) => string | null
  /** M115. Open the pull request from the lane. */
  onOpenPr: (itemId: string) => void
  /** M115. The PR door's synchronous refusal (`prRefusalSync`), or null when the door is open — the lane's standing is asked at the click. */
  prReason: string | null
  /** M115. Fly to the review of the lane's diff. */
  onReview: (itemId: string) => void
  /** M115. Mark the item done. */
  onDone: (itemId: string) => void
}

export const REASON_MERGED_VIEW = 'leave merged view to act on the card'
export const WORK_ITEM_GONE = 'this item is no longer on the board'
export const REASON_NO_TEAMMATES = 'no teammates yet — ⌘K, then Manage teammates…'

const press = (fn: () => void) => (e: ReactMouseEvent): void => { e.stopPropagation(); e.preventDefault(); fn() }

export function WorkNode(props: WorkNodeProps): JSX.Element {
  const { panel, item } = props
  const [assignOpen, setAssignOpen] = useState(false)
  const readOnly = props.readOnly === true
  const state = panelState({ kind: 'work', status: undefined, dormant: false, ...(item === undefined ? {} : { work: { state: item.state } }) }, undefined)
  // The teammate's NAME when the roster still holds them, else the id: a card
  // must not lose its assignment because a teammate was deleted.
  const teammate = item?.teammateId === undefined ? undefined : props.teammates.find((t) => t.id === item.teammateId)
  const teammateName = item?.teammateId === undefined ? undefined : (teammate === undefined ? item.teammateId : teammateWord(teammate))
  // A verb's reason, in precedence: the merged view first (nothing acts
  // there), then the verb's own. `null` means enabled.
  const verb = (key: string, label: string, own: string | null, run: () => void, extra?: Record<string, string | boolean | undefined>): JSX.Element => {
    const reason = readOnly ? REASON_MERGED_VIEW : own
    return (
      <button type="button" className="pf__verb pf__verb--word" data-work-verb={key} disabled={reason !== null}
        title={reason ?? label} onMouseDown={press(() => { if (reason === null) run() })} {...extra}>{label}</button>
    )
  }
  const openLink = (target: string): void => { void window.canvas.links.open({ panelId: panel.rect.id, target }) }
  return (
    <PanelFrame
      id={panel.rect.id}
      kind="work"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={readOnly}
      className="work-node"
      rootAttrs={{ 'data-work-node': '', 'data-work-item': panel.work.itemId, 'data-work-state': item === undefined ? undefined : item.state }}
      title={item?.title ?? panel.title ?? 'work'}
      state={state}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={readOnly ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) } }}
      chrome={item === undefined ? undefined : (
        <>
          {/* The state as a PILL in the chrome, where every sibling's lives (the chat's `asleep`, the terminal's dot) — one placement for one family. */}
          <span className="pf__summary work-node__pill" data-tone={state.tone} data-work-word>{state.word}</span>
          {/* The card is the drag source for a drop onto a Teammates-pane row: the board's own MIME, nothing else. */}
          <span className="pf__summary work-node__summary" data-work-summary draggable
            onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData(WORK_ITEM_MIME, item.id); e.dataTransfer.effectAllowed = 'move' }}
            title={`Drag onto a teammate in the Teammates pane to dispatch ${item.key ?? item.title}`}>{item.key ?? item.source}</span>
        </>
      )}
    >
      <div className="pf__body pf__body--text work-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
        {item === undefined ? (
          <p className="pf__note work-node__gone" data-work-arm="gone">{WORK_ITEM_GONE}</p>
        ) : (
          <>
            <div className="work-node__head">
              {/* The key is the item in its own system; a typed item has none and shows its source, plain. */}
              {item.key !== undefined && item.url !== undefined ? (
                <a className="work-node__key" href={item.url} data-work-key onMouseDown={(e) => e.stopPropagation()} onAuxClick={(e) => e.preventDefault()}
                  onClick={(e) => { e.preventDefault(); openLink(item.url as string) }}>{item.key}</a>
              ) : (
                <span className="work-node__key work-node__key--plain" data-work-key>{item.key ?? item.source}</span>
              )}
              {/* The provider's own word rides beside, MUTED: it is GitHub's or Jira's, display only, and painting it in the tone would lend it a meaning it does not have. */}
              {item.remoteState !== undefined && <span className="work-node__remote" data-work-remote>{item.remoteState} on {item.source}</span>}
            </div>
            {/* The title is the chrome's; the body shows the description's first line, the GitHub row's own pattern. */}
            {item.description !== undefined && item.description !== '' && <p className="work-node__title" data-work-description>{item.description.split('\n')[0]}</p>}
            {/* Three facts, each ABSENT rather than `—` when unknown: a row that says `lane: —` reads as a lane that failed. */}
            <dl className="work-node__facts" data-work-facts>
              {teammateName !== undefined && <div><dt>teammate</dt><dd data-work-teammate>{teammateName}</dd></div>}
              {item.panelId !== undefined && <div><dt>lane</dt><dd data-work-lane>{props.laneLabel ?? item.panelId}</dd></div>}
              {item.pr !== undefined && (
                <div><dt>pr</dt><dd><a href={item.pr.url} data-work-pr onMouseDown={(e) => e.stopPropagation()} onAuxClick={(e) => e.preventDefault()}
                  onClick={(e) => { e.preventDefault(); openLink((item.pr as { url: string }).url) }}>#{item.pr.number}</a></dd></div>
              )}
            </dl>
            {item.note !== undefined && <p className="pf__note work-node__note" data-work-note>{item.note}</p>}
            <div className="work-node__verbs" data-work-verbs>
              {/* M197 (D05). The menu's teammate rows are the flow's AGENT
                  field, inline: choosing one routes into the ONE start action
                  (`beginStartWork`), which dispatches straight away when
                  nothing is missing and opens the sheet on the repository
                  question when the item names none — which is every typed and
                  every Jira item, and which before M197 was refused by main
                  with a sentence naming a door that did not exist. The DOM
                  alias `assign` is unchanged (the restyle rule): the checks
                  select on it. */}
              {verb('assign', 'Start work…', null, () => setAssignOpen((v) => !v), { 'aria-haspopup': 'menu', 'aria-expanded': assignOpen })}
              {verb('open-pr', 'Open PR', props.prReason, () => props.onOpenPr(item.id))}
              {verb('review', 'Review', item.panelId === undefined ? 'no lane yet — dispatch the item first' : null, () => props.onReview(item.id))}
              {verb('done', 'Done', null, () => props.onDone(item.id))}
              {assignOpen && (
                <ul className="work-node__menu" role="menu" data-work-assign-menu onMouseDown={(e) => e.stopPropagation()}>
                  {props.teammates.length === 0 ? (
                    <li><p className="work-node__menu-empty" data-work-assign-empty>{REASON_NO_TEAMMATES}</p></li>
                  ) : props.teammates.map((t) => {
                    const why = props.teammateReason(t)
                    return (
                      <li key={t.id} role="none">
                        <button type="button" role="menuitem" className="pf__verb pf__verb--word" data-work-assign={t.id} disabled={why !== null}
                          title={why ?? `Start work on ${item.key ?? item.title} as ${teammateWord(t)}`}
                          {...shellControl(() => { if (why !== null) return; setAssignOpen(false); props.onDispatch(item.id, t.id) })}>{teammateWord(t)}</button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
