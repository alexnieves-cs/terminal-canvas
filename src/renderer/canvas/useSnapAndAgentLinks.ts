import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { type Panel, isFilePanel, isChatPanel, occupiedRect, terminalRimAt } from '@renderer/panels/panels'
import { agentLinks } from '@shared/agent-links'
import { indexToolFiles } from '@shared/tool-index'
import { getChat as getChatState, useChatsVersion } from '@renderer/chat/chat-store'
import { sheetController } from '@renderer/file/sheet-controllers'
import type { Viewport, WorldRect } from './viewport'
import { publishAgentLinks } from './agent-links-store'
import { smartSnap, type SpacingGuide } from './arrange'
import { SNAP_PX, type SnapGuide } from './placement'
import { NO_GUIDES } from './canvas-constants'
import type { PaletteActions } from '@renderer/palette/commands'

/**
 * M507 (E4, the Canvas.tsx split). Snapping (its setting, the guides a drag
 * leaves and snapNow) and the agent-to-object links (their setting, the
 * per-agent derivation and the two verbs). Lifted out of Canvas VERBATIM as
 * one contiguous run and called at exactly the position it occupied, with one
 * destructured Deps object so every dependency array names the same values.
 */
export interface UseSnapAndAgentLinksDeps {
  paletteActionsRef: RefObject<PaletteActions | null>
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  viewportRef: RefObject<Viewport>
}

export function useSnapAndAgentLinks(deps: UseSnapAndAgentLinksDeps) {
  const {
    paletteActionsRef, panels, panelsRef, viewportRef
  } = deps
  // M50. Snapping: applied to applyDrag's OUTPUT, per frame, against every
  // other panel's rect, with the threshold in SCREEN pixels over the scale
  // (verify:viewport 27's 1/k relationship — a world-unit threshold is huge
  // zoomed out and invisible zoomed in). The guides are the one piece of
  // state a drag leaves in React: cleared on commit. Off when the setting
  // is off: a user aligning by eye against a snap is fighting the app.
  const [snapEnabled, setSnapEnabled] = useState(true)
  useEffect(() => {
    // Read at mount and on every settings write (settings:changed, M45):
    // this block sits above settingRows' declaration, and a subscription is
    // the more honest source anyway — the row's own palette toggle and a
    // menu write both land here.
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'placement.snap')
        if (row) setSnapEnabled(row.value === true)
      })
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [])
  const snapEnabledRef = useRef(snapEnabled)
  snapEnabledRef.current = snapEnabled

  // M247. Agent → object links. The toggle is a SETTING (canvas.agentLinks), read
  // the way snap is: at mount and on every settings:changed, so the palette row,
  // the HUD button, the agent line and an action node all land here.
  const [agentLinksOn, setAgentLinksOn] = useState(true)
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'canvas.agentLinks')
        if (row) setAgentLinksOn(row.value === true)
      })
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [])
  // Derived from each conversation's tool calls, never stored: a restart re-derives
  // them from the chat store. Published PER AGENT into agent-links-store, which
  // replaces a snapshot only when its content changed — never the registry's
  // version counter, which a busy agent's tool calls would otherwise drive.
  //
  // useChatsVersion bumps on EVERY chat state replacement, streamed deltas
  // included; the turns array is replaced only when a turn lands. So each
  // agent's links are recomputed only when its turns array or the set of
  // objects (a path, a draft) actually changed — otherwise a streaming reply
  // would re-index every transcript on the canvas several times a second.
  // Its own name: Canvas's `chatsVersion` is declared far below, and a dependency
  // array is evaluated during render, so borrowing it here would throw.
  const linksChatsVersion = useChatsVersion()
  const agentLinkCache = useRef(new Map<string, { turns: unknown; objectsKey: string }>())
  useEffect(() => {
    const objects = panels.filter(isFilePanel).map((p) => ({
      id: p.rect.id,
      path: p.source.path,
      ...(p.source.sheet?.draft?.by === undefined ? {} : { draftBy: p.source.sheet.draft.by })
    }))
    const objectsKey = JSON.stringify(objects)
    for (const agent of panels.filter(isChatPanel)) {
      const turns = getChatState(agent.rect.id).turns
      const hit = agentLinkCache.current.get(agent.rect.id)
      if (hit !== undefined && hit.turns === turns && hit.objectsKey === objectsKey) continue
      agentLinkCache.current.set(agent.rect.id, { turns, objectsKey })
      publishAgentLinks(agent.rect.id, agentLinks({ agent: agent.rect.id, cwd: agent.chat.cwd, touches: indexToolFiles(turns), objects }))
    }
    // A closed agent's cache entry goes with it; its links went at the forget site.
    const live = new Set(panels.map((p) => p.rect.id))
    for (const id of [...agentLinkCache.current.keys()]) if (!live.has(id)) agentLinkCache.current.delete(id)
  }, [panels, linksChatsVersion])
  // A draft badge opens that draft's review: the sheet, brought into view and focused.
  const openDraftReview = useCallback((objectId: string) => {
    paletteActionsRef.current?.goToPanel(objectId)
    sheetController(objectId)?.focusDraft()
  }, [])
  const toggleAgentLinks = useCallback(() => {
    paletteActionsRef.current?.toggleSetting('canvas.agentLinks', !agentLinksOn)
  }, [agentLinksOn])
  const [snapGuides, setSnapGuidesState] = useState<{ guides: readonly SnapGuide[]; spacing: readonly SpacingGuide[] }>(NO_GUIDES)
  // Clearing is the common call (every commit): the same object back when
  // there is nothing to clear, so a release that snapped nothing re-renders nothing.
  const setSnapGuides = useCallback((guides: readonly SnapGuide[], spacing: readonly SpacingGuide[] = []): void => {
    setSnapGuidesState((current) => (guides.length === 0 && spacing.length === 0 ? (current === NO_GUIDES ? current : NO_GUIDES) : { guides, spacing }))
  }, [])
  // M390. smartSnap (arrange.ts) in place of snapRect: edge/centre alignment
  // as before, plus EQUAL SPACING on a move, and a resize floor that is the
  // object's own (`min` — a shape's is SHAPE_MIN, a panel's the 200x160).
  const snapNow = useCallback((rect: WorldRect, exclude: ReadonlySet<string>, resize?: { growsX: boolean; growsY: boolean }, min?: { w: number; h: number }): WorldRect => {
    if (!snapEnabledRef.current) return rect
    const others = panelsRef.current.filter((p) => !exclude.has(p.rect.id)).map((p) => p.rect)
    // M402. The rim a terminal's name paints above its frame (occupiedRect),
    // so a stack snaps the lower name clear of the upper one's bottom row. A
    // multi-move's bounds (`selection`) carry the rim of a terminal on its top
    // edge — its members' TOPMOST, read from their pre-drag rects (the bounds
    // have moved, the members in panelsRef have not). The rim at THIS zoom
    // (terminalRimAt): the strip is taller in the world below 100%.
    const rim = terminalRimAt(viewportRef.current.scale)
    const rimOf = (id: string): number => {
      const members = panelsRef.current.filter((p) => (id === 'selection' ? exclude.has(p.rect.id) : p.rect.id === id))
      const top = Math.min(...members.map((p) => p.rect.y))
      return Math.max(0, ...members.filter((p) => p.rect.y === top).map((p) => p.rect.y - occupiedRect(p, rim).y))
    }
    const out = smartSnap(rect, others, SNAP_PX / viewportRef.current.scale, { ...(resize ? { resize } : {}), ...(min === undefined ? {} : { min }), spacing: true, grid: null, gapGrid: 24, rimOf })
    setSnapGuides(out.guides, out.spacing)
    return out.rect
  }, [setSnapGuides])

  return { agentLinksOn, openDraftReview, setSnapGuides, snapGuides, snapNow, toggleAgentLinks }
}
