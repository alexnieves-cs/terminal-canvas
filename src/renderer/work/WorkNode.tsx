import { useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { WorkPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { panelState } from '@renderer/panels/panel-state'
import { shellControl } from '@renderer/shell/shell-control'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'
import type { PersistedWorkItem } from '@shared/work-items'

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
 * done). Each is DISABLED BY NAME when its handler is absent — the reason is
 * in the title, the button stays — so a card rendered before the verbs are
 * wired (or under the merged view) is a card with four disabled verbs, not a
 * card with fewer. `Assign to…` opens a menu spanned UNDER the verb row,
 * inside the body: `.panel` clips overflow, so a menu hung off the chrome
 * would be cut at the frame's edge (the harness lesson).
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
  /** M114. Dispatch the item to a teammate. Absent: the verb is disabled by name. */
  onDispatch?: (itemId: string, teammateId: string) => void
  /** M115. Open the pull request from the lane. Absent: disabled by name. */
  onOpenPr?: (itemId: string) => void
  /** M115. Fly to the review of the lane's diff. Absent: disabled by name. */
  onReview?: (itemId: string) => void
  /** M115. Mark the item done. Absent: disabled by name. */
  onDone?: (itemId: string) => void
}

/** The placeholder reason every unwired verb carries — one string, so a grep finds every site when the wiring lands. */
export const REASON_VERB_UNWIRED = 'not wired yet — Track A'
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
  // there), then the missing wiring. `null` means enabled.
  const reasonFor = (wired: boolean): string | null => (readOnly ? REASON_MERGED_VIEW : wired ? null : REASON_VERB_UNWIRED)
  const verb = (key: string, label: string, wired: boolean, run: () => void, extra?: Record<string, string | boolean | undefined>): JSX.Element => {
    const reason = reasonFor(wired)
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
        <span className="pf__summary work-node__summary" data-work-summary>{item.key ?? item.source}</span>
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
              <span className="work-node__state" data-tone={state.tone} data-work-word>{state.word}{item.remoteState === undefined ? '' : ` · ${item.remoteState}`}</span>
            </div>
            <p className="work-node__title" data-work-title>{item.title}</p>
            {/* Three facts, each ABSENT rather than `—` when unknown: a row that says `lane: —` reads as a lane that failed. */}
            <dl className="work-node__facts" data-work-facts>
              {teammateName !== undefined && <div><dt>teammate </dt><dd data-work-teammate>{teammateName}</dd></div>}
              {item.panelId !== undefined && <div><dt>lane </dt><dd data-work-lane>{props.laneLabel ?? item.panelId}</dd></div>}
              {item.pr !== undefined && (
                <div><dt>pr </dt><dd><a href={item.pr.url} data-work-pr onMouseDown={(e) => e.stopPropagation()} onAuxClick={(e) => e.preventDefault()}
                  onClick={(e) => { e.preventDefault(); openLink((item.pr as { url: string }).url) }}>#{item.pr.number}</a></dd></div>
              )}
            </dl>
            {item.note !== undefined && <p className="pf__note work-node__note" data-work-note>{item.note}</p>}
            <div className="work-node__verbs" data-work-verbs>
              {verb('assign', 'Assign to…', props.onDispatch !== undefined, () => setAssignOpen((v) => !v), { 'aria-haspopup': 'menu', 'aria-expanded': assignOpen })}
              {verb('open-pr', 'Open PR', props.onOpenPr !== undefined, () => props.onOpenPr?.(item.id))}
              {verb('review', 'Review', props.onReview !== undefined, () => props.onReview?.(item.id))}
              {verb('done', 'Done', props.onDone !== undefined, () => props.onDone?.(item.id))}
              {assignOpen && (
                <ul className="work-node__menu" role="menu" data-work-assign-menu onMouseDown={(e) => e.stopPropagation()}>
                  {props.teammates.length === 0 ? (
                    <li><p className="work-node__menu-empty" data-work-assign-empty>{REASON_NO_TEAMMATES}</p></li>
                  ) : props.teammates.map((t) => (
                    <li key={t.id} role="none">
                      <button type="button" role="menuitem" className="pf__verb pf__verb--word" data-work-assign={t.id}
                        title={`Dispatch ${item.key ?? item.title} to ${teammateWord(t)}`}
                        {...shellControl(() => { setAssignOpen(false); props.onDispatch?.(item.id, t.id) })}>{teammateWord(t)}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
