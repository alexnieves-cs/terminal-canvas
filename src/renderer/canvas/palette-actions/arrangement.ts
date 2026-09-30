/**
 * The camera, the arrangement and the view modes.
 *
 * Everything that moves the CAMERA or the geometry rather than the work:
 * zoom, bookmarks and the trail, tidy, groups, links, and the three view
 * toggles (merged, flip, centre view).
 *
 * One slice of `usePaletteActions`. Every body here is the one that lived in
 * that file before the split, moved verbatim — see `./types.ts` for why `ctx.self`
 * is the object under construction rather than a getter.
 */

import { tidyPanels } from '../placement'
import { removeLink, setLinkLabel } from '@renderer/panels/panels'
import { expandGroup, removeGroup, toggleGroup } from '@renderer/groups/groups'
import { GROUP_COLOURS } from '@shared/groups'
import { viewSizeAround, zoomTarget } from '../viewport'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type ArrangementActions = Pick<PaletteActions,
  | 'resetZoom'
  | 'zoomToFit'
  | 'addBookmark'
  | 'goToBookmark'
  | 'deleteBookmark'
  | 'beginRenameBookmark'
  | 'cameraBack'
  | 'cameraForward'
  | 'undoCanvas'
  | 'redoCanvas'
  | 'tidyPanels'
  | 'resetCanvas'
  | 'toggleGroup'
  | 'removeGroup'
  | 'beginCreateGroup'
  | 'beginLink'
  | 'removeLink'
  | 'beginRelabelLink'
  | 'toggleMerged'
  | 'setCenterView'
  | 'toggleFlip'
  | 'toggleBroadcastInput'
>

export function arrangementActions(ctx: ActionCtx): ArrangementActions {
  const {
    palette, linkMode, panelsRef, mergedRef, nextGroupIdRef, broadcastInput, broadcastReady,
    resetViewport, fitAll, fitSelection, selectedIdsRef, goToViewport, cameraBack, worldCentre,
    cameraForward, bookmarksRef, setBookmarks, viewportRef, selectOnly, commitHistory,
    toggleMerged, setPanels, setGroups, setInputMode, setBroadcastInput, setCenterView,
    toggleFlip, undoCanvas, redoCanvas
  } = ctx
  return ({
    // M146. TWO verbs, two names (backlog #23): `Reset zoom` is Cmd+0's
    // INITIAL; `Zoom to fit` frames the SELECTION when there is one and every
    // panel otherwise, as a flight, moving nothing but the camera. An empty
    // canvas has nothing to fit and resets instead — a verb that did nothing
    // would read as broken.
    resetZoom: () => resetViewport(),
    // M409 (C5). Canvas's own step, the one edit:undo runs — never a copy.
    undoCanvas: () => undoCanvas(),
    redoCanvas: () => redoCanvas(),
    zoomToFit: () => {
      const target = zoomTarget(selectedIdsRef.current, panelsRef.current.map((p) => p.rect))
      if (target.kind === 'selection') fitSelection(target.rects)
      else if (target.kind === 'all') fitAll()
      else resetViewport()
    },
    // M56. Bookmarks and the trail. Names are minted as "View N" over the
    // current count; a rename is a later milestone's, and a place with a
    // number is still a place.
    addBookmark: () => {
      const camera = viewportRef.current
      const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      setBookmarks((current) => [...current, { id, name: `View ${current.length + 1}`, camera: { x: camera.x, y: camera.y, scale: camera.scale } }])
    },
    goToBookmark: (id) => {
      const found = bookmarksRef.current.find((b) => b.id === id)
      if (found) goToViewport(found.camera)
    },
    deleteBookmark: (id, name) => {
      // Gated like deletePreset: a delete row one Enter away from a place
      // the user chose to keep, styled like "Go to".
      setInputMode({
        kind: 'confirm',
        label: `Delete bookmark \u201c${name}\u201d?`,
        initial: '',
        submit: () => { setBookmarks((current) => current.filter((b) => b.id !== id)) }
      })
      palette.openPalette()
    },
    beginRenameBookmark: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: `Rename \u201c${currentName}\u201d to\u2026`,
        initial: currentName,
        submit: (value) => {
          const name = value.trim()
          if (name !== '') setBookmarks((current) => current.map((b) => (b.id === id ? { ...b, name } : b)))
          setInputMode(null)
        }
      })
      palette.openPalette()
    },
    cameraBack: () => cameraBack(),
    cameraForward: () => cameraForward(),
    tidyPanels: (ids) => {
      // The merged view is read-only for geometry (M14) — the menu's Tidy and
      // the row both reach here.
      if (mergedRef.current) return
      // ONE history entry for the whole arrangement — twenty panels moving is
      // one gesture to undo, not twenty. Sizes never change (tidyPanels'
      // contract), so no rect can fall under the floor the validator
      // rejects; order never changes, so the arrangement keeps its meaning.
      // M395: packed toward the VIEW's shape, so it frames at a readable zoom
      // (placement.ts) — the host's size, read once, outside the updater.
      const view = viewSizeAround(worldCentre(), viewportRef.current)
      setPanels((prev) => {
        const wanted = new Set(ids)
        // M92. A locked panel stays where it is under Arrange too.
        const chosen = prev.filter((p) => wanted.has(p.rect.id) && p.locked !== true)
        if (chosen.length < 2) return prev
        const tidied = new Map(tidyPanels(chosen.map((p) => p.rect), undefined, { view }).map((r) => [r.id, r]))
        const next = prev.map((p) => {
          const r = tidied.get(p.rect.id)
          return r === undefined || (r.x === p.rect.x && r.y === p.rect.y) ? p : { ...p, rect: r }
        })
        if (next.every((p, i) => p === prev[i])) return prev
        commitHistory(next)
        return next
      })
    },
    resetCanvas: () => {
      // Main owns the confirmation dialog and the counts request. The palette
      // asks for the flow the menu item already runs rather than growing a
      // second one that could drift from it. FIRE-AND-FORGET: main returns
      // before the user answers the dialog, so this promise resolving says
      // nothing about whether a reset happened and nothing here may act on it.
      void window.canvas.canvas.requestReset()
    },
    // M61. Pure transitions from groups.ts, the same ones GroupLayer's
    // buttons reach through Canvas — one definition of "collapse".
    // Refused in the merged view at the action as well as at the row, the way
    // beginCreateGroup below is: the row's reason is the user-facing refusal,
    // this is the one a future caller cannot forget.
    toggleGroup: (id) => { if (mergedRef.current) return; setGroups((current) => (current.find((g) => g.id === id)?.collapsed ? expandGroup : toggleGroup)(current, id)) },
    removeGroup: (id) => { if (mergedRef.current) return; setGroups((current) => removeGroup(current, id)) },
    beginCreateGroup: (panelIds) => {
      if (mergedRef.current) return
      const present = panelIds.filter((id) => panelsRef.current.some((panel) => panel.rect.id === id))
      if (present.length < 2) return
      setInputMode({
        kind: 'text',
        label: `Name this ${present.length}-panel group…`,
        initial: '',
        submit: (value) => {
          const label = value.trim()
          if (label === '') { setInputMode(null); return }
          const number = nextGroupIdRef.current++
          setGroups((current) => [...current, {
            id: `g${number}`,
            label,
            colour: GROUP_COLOURS[(number - 1) % GROUP_COLOURS.length],
            panelIds: present
          }])
          selectOnly(null)
          setInputMode(null)
        }
      })
      palette.openPalette()
    },
    beginLink: (id) => {
      linkMode.arm(id)
      // The overlay must be GONE: the completing gesture is a click on the
      // canvas, and a palette sitting over it would swallow that click as its
      // own outside-click dismissal. runRow already closes before running a
      // command, so this is belt and braces for the inspector's button, which
      // does not go through runRow at all.
      palette.closePalette()
    },
    removeLink: (from, to) => {
      setPanels((current) => {
        const next = removeLink(current, from, to)
        commitHistory(next)
        return next
      })
    },
    beginRelabelLink: (from, to, current) => {
      setInputMode({
        kind: 'text',
        label: 'Label this link',
        initial: current,
        submit: (value) => {
          setPanels((panelsNow) => {
            // Trimmed, and an empty result CLEARS the label rather than
            // storing '' — see setLinkLabel. Otherwise a user who wants a
            // label gone has no verb for it, and a blank label round-trips to
            // disk as a row they can neither see nor explain.
            const next = setLinkLabel(panelsNow, from, to, value.trim())
            commitHistory(next)
            return next
          })
          setInputMode(null)
        }
      })
      // The same reopen beginRenamePreset makes, for the same reason: the
      // overlay is closed BEFORE a row's command runs, so without this the
      // mode would be set on a palette that is already gone and the
      // clear-on-close effect would wipe it again.
      palette.openPalette()
    },
    /**
     * The merged view's second door, beside the top bar's own button. It
     * earns a Command row where closePanel and startPanel deliberately do not
     * (see their own comments): the toolbar can be the only gesture for a
     * verb only if the toolbar is always reachable, and this one is a whole
     * mode — a user who has never noticed the button has no other way in, and
     * a mode with one undiscovered entrance reads as a feature that was never
     * built.
     */
    toggleMerged: () => toggleMerged(),
    setCenterView: (view) => setCenterView(view),
    // M106. The flip is Canvas's view state; the row reaches it through the same event the menu sends.
    toggleFlip: () => toggleFlip(),
    toggleBroadcastInput: () => {
      // The command's disabled state is UX, not authority: the selection or a
      // session can change while the palette is open, so re-check the live
      // target set at the action boundary before arming the keyboard route.
      if (!broadcastInput && !broadcastReady) return
      setBroadcastInput((active) => !active)
    }
  })
}
