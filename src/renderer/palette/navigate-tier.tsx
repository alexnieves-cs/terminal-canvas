/**
 * M444. Plan cards and Map dots. Presentation only: the sessions stay.
 *
 * `useTiering` already feeds `collapsedPanelIds` to `assignTiers` as
 * `cardIds`. This mount stamps the tier's ids onto that same set from a
 * layout effect, which runs before the tiering effect, so a terminal in the
 * Plan band (still above LIVE_MIN_SCALE) is a card and its pid is kept.
 * Ids a collapsed group already held are not claimed, so leaving the tier
 * does not expand the group.
 *
 * Entering Plan or Map releases focus first. The focused panel is live
 * unconditionally unless it is in `cardIds` or dormant, and a keystroke
 * must not land in a card.
 */
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type JSX, type RefObject } from 'react'
import { enterTier } from '@renderer/canvas/zoom-tier'
import { getShownTier, planStatusSentence, publishShownTier, subscribeShownTier } from '@renderer/canvas/card-detail'
import { panelState, type StateInput } from '@renderer/panels/panel-state'
import { useAgentState } from '@renderer/session/agent-state-store'
import { useLastLine } from '@renderer/session/last-line-store'

interface NavRect { id: string; x: number; y: number; w: number; h: number }
interface NavPanel { rect: NavRect }
interface NavRow { id: string; label: string; state: StateInput }

export interface NavigateTierProps {
  scale: number
  panels: readonly NavPanel[]
  railRows: readonly NavRow[]
  terminalPanels: readonly NavPanel[]
  focusedId: string | null
  collapsedPanelIds: Set<string>
  releaseFocus: () => void
  hostRef: RefObject<HTMLElement | null>
  onSelect: (id: string) => void
  merged: boolean
  /**
   * The request a panel is waiting on, if any. At Plan the live frame (and the
   * inline approval drawn over it) is hidden or too small to read, so the
   * card carries the same two answers instead.
   */
  approvalOf?: (id: string) => { requestId: string } | undefined
  onAnswer?: (id: string, requestId: string, allow: boolean) => void
  /** Go to the panel: a Map dot's click and a Plan card's double-click. */
  onOpen?: (id: string) => void
}

export function NavigateTier({
  scale, panels, railRows, terminalPanels, focusedId, collapsedPanelIds,
  releaseFocus, hostRef, onSelect, merged, approvalOf, onAnswer, onOpen
}: NavigateTierProps): JSX.Element {
  const tier = useSyncExternalStore(subscribeShownTier, getShownTier, getShownTier)
  const terminalIds = useMemo(() => terminalPanels.map((panel) => panel.rect.id), [terminalPanels])
  const claimed = useRef(new Set<string>())

  useLayoutEffect(() => {
    const world = hostRef.current?.querySelector('.world') ?? null
    const dropClaimed = (): void => {
      for (const id of claimed.current) collapsedPanelIds.delete(id)
      claimed.current.clear()
    }
    if (merged) {
      dropClaimed()
      world?.removeAttribute('data-zoom-tier')
      publishShownTier('work')
      return
    }
    const entry = enterTier({ scale, prev: getShownTier(), focusedId, panelIds: terminalIds })
    publishShownTier(entry.tier)
    if (entry.releaseFocus) {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
      releaseFocus()
      hostRef.current?.focus()
    }
    const next = entry.cardIds
    for (const id of [...claimed.current]) {
      if (next.has(id)) continue
      collapsedPanelIds.delete(id)
      claimed.current.delete(id)
    }
    for (const id of next) {
      if (collapsedPanelIds.has(id)) continue
      collapsedPanelIds.add(id)
      claimed.current.add(id)
    }
    if (entry.tier === 'work') world?.removeAttribute('data-zoom-tier')
    else world?.setAttribute('data-zoom-tier', entry.tier)
    return () => {
      dropClaimed()
      world?.removeAttribute('data-zoom-tier')
    }
  }, [scale, focusedId, terminalIds, merged, collapsedPanelIds, releaseFocus, hostRef])

  const byId = useMemo(() => new Map(railRows.map((row) => [row.id, row])), [railRows])
  return (
    <div className="navigate-tier" data-navigate-tier="" aria-hidden={tier === 'work' ? true : undefined}>
      {tier === 'plan' && panels.map((panel) => {
        const row = byId.get(panel.rect.id)
        if (row === undefined) return null
        return (
          <PlanCard
            key={panel.rect.id}
            id={panel.rect.id}
            name={row.label}
            rect={panel.rect}
            state={row.state}
            onSelect={onSelect}
            approval={approvalOf?.(panel.rect.id)}
            {...(onAnswer === undefined ? {} : { onAnswer })}
            {...(onOpen === undefined ? {} : { onOpen })}
          />
        )
      })}
      {tier === 'map' && panels.map((panel) => {
        const row = byId.get(panel.rect.id)
        if (row === undefined) return null
        return <MapDot key={panel.rect.id} id={panel.rect.id} name={row.label} rect={panel.rect} state={row.state} {...(onOpen === undefined ? {} : { onOpen })} />
      })}
    </div>
  )
}

// A group, not a <button>: the card holds its own answer buttons, and a
// button inside a button is not a button. The card itself still selects on
// press and is reachable by keyboard (Enter opens it).
function PlanCard({ id, name, rect, state, onSelect, approval, onAnswer, onOpen }: {
  id: string
  name: string
  rect: NavRect
  state: StateInput
  onSelect: (id: string) => void
  approval?: { requestId: string } | undefined
  onAnswer?: (id: string, requestId: string, allow: boolean) => void
  onOpen?: (id: string) => void
}): JSX.Element {
  const agent = useAgentState(id)
  const last = useLastLine(id)
  const shown = panelState(state, agent)
  const stop = (event: { preventDefault: () => void; stopPropagation: () => void }): void => { event.preventDefault(); event.stopPropagation() }
  return (
    <div
      role="button"
      tabIndex={0}
      className="navigate-card"
      data-navigate-card={id}
      data-tone={shown.tone}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onMouseDown={(event) => {
        stop(event)
        onSelect(id)
      }}
      onDoubleClick={(event) => { stop(event); onOpen?.(id) }}
      onKeyDown={(event) => { if (event.key === 'Enter') { stop(event); onOpen?.(id) } }}
    >
      <span className="navigate-card__name">{name}</span>
      <span className="navigate-card__pill" data-tone={shown.tone}>{shown.word}</span>
      <span className="navigate-card__line">{planStatusSentence(shown.word, last.line)}</span>
      {approval !== undefined && onAnswer !== undefined && (
        <span className="navigate-card__verbs" data-navigate-card-verbs="">
          <button type="button" data-navigate-allow="" onMouseDown={stop} onClick={() => onAnswer(id, approval.requestId, true)}>Allow once</button>
          <button type="button" data-navigate-deny="" onMouseDown={stop} onClick={() => onAnswer(id, approval.requestId, false)}>Deny</button>
        </span>
      )}
    </div>
  )
}

function MapDot({ id, name, rect, state, onOpen }: { id: string; name: string; rect: NavRect; state: StateInput; onOpen?: (id: string) => void }): JSX.Element {
  const agent = useAgentState(id)
  const shown = panelState(state, agent)
  return (
    <button
      type="button"
      className="navigate-dot"
      data-navigate-dot={id}
      data-tone={shown.tone}
      title={`${name} — ${shown.word}`}
      aria-label={`${name}, ${shown.word}. Go to it`}
      style={{ left: rect.x + rect.w / 2, top: rect.y + rect.h / 2 }}
      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onOpen?.(id) }}
    />
  )
}
