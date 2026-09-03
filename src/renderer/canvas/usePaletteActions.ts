import { useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { Registry } from '@renderer/session/session-registry'
import { tidyPanels } from './placement'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { clearAgentState } from '@renderer/session/agent-state-store'
import { clearLiveSession, getLiveSession } from '@renderer/session/live-session-store'
import { buildSpawnRequest } from '@renderer/palette/spawn-sheet'
import { clearSubagents } from '@renderer/session/subagent-store'
import { clearFileResult } from '@renderer/session/file-store'
import { clearToolbox } from '@renderer/session/toolbox-store'
import { clearUsage } from '@renderer/session/usage-store'
import { clearMachineCost } from '@renderer/session/machine-cost-store'
import { clearScrollbackTail } from '@renderer/session/scrollback-store'
import {
  isFilePanel, isJiraPanel, isReviewPanel, isTerminalPanel, isToolboxPanel,
  removeLink, setLinkLabel, type Panel
} from '@renderer/panels/panels'
import { expandGroup, removeGroup, toggleGroup, type CanvasGroup } from '@renderer/groups/groups'
import { GROUP_COLOURS } from '@shared/groups'
import type { PaletteActions, PresetRow, PromptRow } from '@renderer/palette/commands'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { InputMode } from '@renderer/palette/Palette'
import { findService } from '@shared/credential-schema'
import type { CapturedPanel, SettingRow, WorktreeListRow } from '@shared/ipc-contract'
import { railLabel } from '../shell/rail-rows'
import type { LinkMode } from './useLinkMode'
import type { Point, WorldRect } from './viewport'
import type { Viewport } from './viewport'
import type { PersistedBookmark } from '@shared/layout-schema'

export interface PaletteActionsDeps {
  registry: Registry
  palette: PaletteController
  linkMode: LinkMode
  /** Read through refs: each changes on every frame of a drag. */
  panelsRef: RefObject<Panel[]>
  displayPanelsRef: RefObject<Panel[]>
  mergedRef: RefObject<boolean>
  promptBodiesRef: RefObject<Map<string, string>>
  nextGroupIdRef: RefObject<number>
  presetRows: PresetRow[]
  promptRows: PromptRow[]
  settingRows: SettingRow[]
  broadcastInput: boolean
  broadcastReady: boolean
  resetViewport: () => void
  centreOn: (rect: WorldRect) => void
  worldCentre: () => Point
  /** M56. The camera's named verbs and the bookmark state, read through refs. */
  goToViewport: (vp: Viewport) => void
  cameraBack: () => void
  cameraForward: () => void
  bookmarksRef: RefObject<PersistedBookmark[]>
  setBookmarks: Dispatch<SetStateAction<PersistedBookmark[]>>
  viewportRef: RefObject<Viewport>
  selectAndRaise: (id: string, additive?: boolean) => void
  selectOnly: (id: string | null) => void
  onSelectPanel: (id: string, additive?: boolean) => void
  onClosePanel: (id: string) => void
  openReview: (subjectId: string) => void
  openFilePanel: (path: string, centre: Point, opts?: { prose?: true }) => void
  openToolboxPanel: (cwd: string, label: string, centre: Point) => void
  openJiraPanel: () => void
  beginNewNote: () => void
  restartWithSpec: (id: string, nextSpec: PanelSpecTemplate) => void
  commitHistory: (next: Panel[]) => void
  switchWorkspace: (id: string) => Promise<boolean>
  movePanelsToWorkspace: (
    panelIds: string[],
    target: { workspaceId: string } | { newName: string }
  ) => void
  toggleMerged: () => void
  reloadPresets: () => void
  reloadPrompts: (capturedId: string | null) => void
  reloadSettings: () => void
  reloadCredentials: () => void
  /** M37. The worktree list, reloaded after a remove. */
  reloadWorktrees: () => void
  /** M37. The palette's current worktree rows, so a confirm can name the branch. */
  worktreeRows: readonly WorktreeListRow[]
  reloadWorkspaces: () => void
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setGroups: Dispatch<SetStateAction<CanvasGroup[]>>
  setInputMode: Dispatch<SetStateAction<InputMode | null>>
  setBroadcastInput: Dispatch<SetStateAction<boolean>>
}

/**
 * Every verb the palette, the top bar, the rail and the inspector can run —
 * the single `actions` object those four surfaces share.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split). Three
 * properties of the original are load-bearing and survive the move unchanged.
 *
 * It stays ONE `useMemo` returning ONE object, with the identical dependency
 * array it had inside Canvas. `Palette.tsx` takes this as its `actions` prop
 * and memoizes its command list on it, so splitting it into per-verb
 * callbacks would hand that memo a fresh identity on every render — the
 * defect "the palette's selection moves only when the user moves it"
 * describes, visible as the selection re-seating itself during an unrelated
 * mousemove over the canvas.
 *
 * The deps object is destructured on entry and the dependency array names the
 * DESTRUCTURED members, never `deps` itself: the caller builds a fresh object
 * literal every render, so a dependency on it would rebuild every verb on
 * every frame of a pan.
 *
 * `deleteWorkspace` still holds one of the canvas layer's five
 * `registry.dispose` call sites. `verify:panels` 94 counts them across this
 * directory rather than in `Canvas.tsx` alone, precisely so this split could
 * happen without weakening the count.
 */
export function usePaletteActions(deps: PaletteActionsDeps): PaletteActions {
  const {
    registry, palette, linkMode, panelsRef, displayPanelsRef, mergedRef,
    promptBodiesRef, nextGroupIdRef, presetRows, promptRows, settingRows,
    broadcastInput, broadcastReady, resetViewport, centreOn, worldCentre,
    goToViewport, cameraBack, cameraForward, bookmarksRef, setBookmarks, viewportRef,
    selectAndRaise, selectOnly, onSelectPanel, onClosePanel, openReview,
    openFilePanel, openToolboxPanel, openJiraPanel, beginNewNote,
    restartWithSpec, commitHistory, switchWorkspace,
    movePanelsToWorkspace, toggleMerged, reloadPresets, reloadPrompts,
    reloadSettings, reloadCredentials, reloadWorkspaces, reloadWorktrees, worktreeRows, setPanels, setGroups,
    setInputMode, setBroadcastInput
  } = deps

  return useMemo<PaletteActions>(() => ({
    spawnPreset: (id) => {
      const row = presetRows.find((p) => p.id === id)
      // buildCommands already disables an unavailable row, so this is the
      // second half of the same rule rather than the only one: a stale list —
      // the palette was open while the store changed — must not spawn a panel
      // that dies instantly with "command not found".
      if (!row || !row.available) return
      // Routed through the SAME main-side path the menu uses, so a palette
      // spawn and a menu spawn cannot drift: main resolves the template
      // (absent command included) and sends PRESET_SPAWN back, which Canvas
      // already handles through onSpawn — which is what gives it the ordinary
      // undo behaviour, where removing a panel disposes its session.
      void window.canvas.preset.spawnById(id)
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
    toggleBroadcastInput: () => {
      // The command's disabled state is UX, not authority: the selection or a
      // session can change while the palette is open, so re-check the live
      // target set at the action boundary before arming the keyboard route.
      if (!broadcastInput && !broadcastReady) return
      setBroadcastInput((active) => !active)
    },
    beginRenamePreset: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: `Rename \u201c${currentName}\u201d to\u2026`,
        initial: currentName,
        submit: (value) => {
          void window.canvas.preset.rename(id, value).then(() => {
            setInputMode(null)
            reloadPresets()
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // — and the effect above would immediately clear it again. Reopening in
      // the same batch is what turns "run the rename command" into "the
      // palette is now a text field", which is the whole point of input mode.
      palette.openPalette()
    },
    deletePreset: (id) => {
      // Gated, not instant. A delete row sat one Enter away from destroying a
      // preset, styled identically to "Go to n1", and the fuzzy matcher will
      // happily put it under a query the user aimed somewhere else.
      //
      // The gate is input mode rather than a dialog, and that is not a
      // shortcut: M5a deferred preset editing entirely because "building a
      // preset-manager dialog now would be the first modal in this app, and it
      // would collide with xterm's keyboard focus". Input mode is that problem
      // already solved, so a confirm inherits all four of usePalette's focus
      // rules instead of reopening the question.
      const name = presetRows.find((p) => p.id === id)?.name ?? id
      setInputMode({
        kind: 'confirm',
        label: `Delete preset \u201c${name}\u201d?`,
        initial: '',
        submit: () => {
          void window.canvas.preset.remove(id).then(reloadPresets)
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // and the clear-on-close effect would wipe it again — the same pairing
      // beginRenamePreset makes, for the same reason.
      palette.openPalette()
    },
    setDefaultPreset: (id) => {
      // No local bookkeeping: main answers by pushing PRESET_DEFAULT, which
      // the existing subscription writes into defaultTemplateRef. One source
      // of truth for what Cmd+N spawns, and it is main's.
      void window.canvas.preset.setDefault(id).then(reloadPresets)
    },
    goToPanel: (id) => {
      // displayPanelsRef, not panelsRef: while merged the rail lists every
      // workspace's panels, and the rect worth framing is the LANE-OFFSET
      // one — the only place that panel exists on screen. Reading `panels`
      // here would leave every foreign row navigating nowhere at all, which
      // reads as the rail being broken rather than as a lookup in the wrong
      // array.
      const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
      if (!panel) return
      centreOn(panel.rect)
      // Selection WITHOUT the wake. onSelectPanel is the click path and it
      // deliberately wakes (a card's whole affordance is "click to start");
      // navigating is not interacting, so the switcher leaves dormancy alone.
      // verify:panels 39.
      //
      // It DOES raise, though, and deliberately: the selection ring is the
      // only feedback this command gives, and a framed panel that happens to
      // sit under an overlapping one shows none of it — the camera moves and
      // nothing visibly happens. Raising is a z change and nothing else, so it
      // costs none of what the no-wake rule is protecting.
      selectAndRaise(id)
    },
    insertPrompt: (id) => {
      // The panel the palette CAPTURED, not the focused one: opening the
      // palette moves DOM focus to its input, and a background click clears
      // focusedId outright.
      const target = palette.capturedId
      const body = promptBodiesRef.current.get(id)
      // A row whose body the last reload did not carry is a list that moved
      // under the user (the file was deleted while the palette was open).
      // Inserting nothing is the only honest answer; inserting the wrong
      // prompt into a running agent is not.
      if (!target || body === undefined) return
      // paste(), NEVER write(). session-factory.ts spells out the failure it
      // exists to prevent: term.paste wraps the payload in bracketed-paste
      // markers when the app has enabled them (and normalises LF to CR), so a
      // multi-line prompt arrives as ONE input. A raw write submits every
      // newline separately — pasting a five-line prompt into `claude` fires
      // off four incomplete fragments and then the tail. EVERY prompt is
      // multi-line, so every use of this feature depends on this call.
      // verify:panels 40 is the check that can tell the two apart.
      registry.get(target)?.handle.paste(body)
    },
    beginSavePrompt: () => {
      const target = palette.capturedId
      // The current SELECTION, the same call that backs Cmd+C. A deliberate
      // gesture and nothing else: capturing automatically would mean
      // retaining everything the user ever types, credentials included.
      const selection = target ? (registry.get(target)?.handle.getSelection() ?? '') : ''
      // buildCommands already disables the row without a selection; this is
      // the second half of the same rule, against a list that went stale
      // while the palette was open.
      if (!selection) return
      setInputMode({
        kind: 'text',
        label: 'Name this prompt\u2026',
        initial: '',
        submit: (name) => {
          void window.canvas.prompt.save(name, selection).then(() => setInputMode(null))
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // and the clear-on-close effect would wipe it again — the same pairing
      // beginRenamePreset makes, for the same reason.
      palette.openPalette()
    },
    deletePrompt: (id) => {
      // Confirmed for the same reason deletePreset is; see there.
      const name = promptRows.find((p) => p.id === id)?.name ?? id
      const captured = palette.capturedId
      setInputMode({
        kind: 'confirm',
        label: `Delete prompt \u201c${name}\u201d?`,
        initial: '',
        submit: () => {
          // Reloaded rather than filtered locally: main is the only side that
          // knows what the store now says, and a project prompt refuses
          // deletion there (the row is disabled, but a stale list could still
          // reach here). Reloaded against the id captured when the row RAN,
          // not against palette.capturedId at confirm time: the confirm step
          // reopens the palette, which re-captures — and re-capturing while
          // the input holds DOM focus can hand back a different panel, whose
          // project prompts are a different directory's.
          void window.canvas.prompt.remove(id).then(() => reloadPrompts(captured))
        }
      })
      palette.openPalette()
    },
    beginRenamePanel: (id, currentTitle) => {
      setInputMode({
        kind: 'text',
        label: 'Name this panel…',
        initial: currentTitle,
        submit: (value) => {
          const name = value.trim()
          setPanels((prev) => {
            // A captured id can outlive its panel — the row is aimed at
            // whatever was focused when the palette opened, and that panel
            // may have since been closed. Mapping over a missing id would
            // still rewrite the array (a fresh reference for every element)
            // and push a no-op history entry, so bail out instead: nothing
            // changed, so nothing should look like it did.
            if (!prev.some((p) => p.rect.id === id)) return prev
            // Palette.tsx only calls submit() with a non-empty trimmed value
            // (an empty Enter is a cancel, not a rename to "") — so `name`
            // is never '' here, and clearing a title is not offered by this
            // surface at all. Rebuilt field by field rather than spread, the
            // same absent-stays-absent rule fromPanels obeys, so a future
            // caller that DOES want to clear a title can't get there by
            // accidentally spreading `title: undefined` through.
            // ALL THREE kinds are rebuilt, and `kind` is carried explicitly
            // by each arm rather than spread: a rename that dropped it would
            // turn a review node or a file panel back into a terminal panel on
            // the next parse, which reads its absent spec and empties the
            // canvas. A fourth kind adds a fourth arm here, and the union's
            // exhaustiveness is what makes forgetting one a compile error
            // rather than a silent loss of a panel's own field.
            const next: Panel[] = prev.map((p) => {
              if (p.rect.id !== id) return p
              if (isReviewPanel(p)) {
                return { kind: p.kind, rect: p.rect, subject: p.subject, z: p.z, title: name, ...(p.links === undefined ? {} : { links: p.links }) }
              }
              if (isFilePanel(p)) {
                return { kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name, ...(p.links === undefined ? {} : { links: p.links }) }
              }
              if (isJiraPanel(p)) return { kind: p.kind, rect: p.rect, z: p.z, title: name, ...(p.links === undefined ? {} : { links: p.links }) }
              if (isToolboxPanel(p)) {
                return { kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name, ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M49. `fontSize` and `links` ride along field by field, absent
              // staying absent: a rename that rebuilt the panel without them
              // silently dropped a font override and every link the panel
              // held — found while adding the override, fixed for both.
              return { kind: p.kind, rect: p.rect, spec: p.spec, z: p.z, title: name,
                ...(p.links === undefined ? {} : { links: p.links }),
                ...(p.fontSize === undefined ? {} : { fontSize: p.fontSize }) }
            })
            // One entry for the whole gesture, on commit — the rule a drag
            // already follows. Pushing per keystroke would make one rename
            // take a dozen Cmd+Z presses to unwind.
            commitHistory(next)
            return next
          })
          setInputMode(null)
        }
      })
      // Same reason beginRenamePreset does this: Palette.tsx closes the
      // overlay BEFORE running a row's command, so without reopening, the mode
      // would be set on a palette that is already gone.
      palette.openPalette()
    },
    jumpPrompt: (id, direction) => {
      registry.get(id)?.handle.jumpPrompt(direction)
    },
    copyLastOutput: (id) => {
      const text = registry.get(id)?.handle.lastCommandOutput()
      if (text !== null && text !== undefined) void navigator.clipboard.writeText(text)
    },
    tidyPanels: (ids) => {
      // ONE history entry for the whole arrangement — twenty panels moving is
      // one gesture to undo, not twenty. Sizes never change (tidyPanels'
      // contract), so no rect can fall under the floor the validator
      // rejects; order never changes, so the arrangement keeps its meaning.
      setPanels((prev) => {
        const wanted = new Set(ids)
        const chosen = prev.filter((p) => wanted.has(p.rect.id))
        if (chosen.length < 2) return prev
        const tidied = new Map(tidyPanels(chosen.map((p) => p.rect)).map((r) => [r.id, r]))
        const next = prev.map((p) => {
          const r = tidied.get(p.rect.id)
          return r === undefined || (r.x === p.rect.x && r.y === p.rect.y) ? p : { ...p, rect: r }
        })
        if (next.every((p, i) => p === prev[i])) return prev
        commitHistory(next)
        return next
      })
    },
    setPanelFontSize: (id, size) => {
      // A COMMIT, one history entry, the rule a drag and a rename follow. The
      // registry does the rest on the next render: it resolves the effective
      // size and refits the live session once. Rebuilt field by field so an
      // absent override stays absent (fromPanels' rule) — `undefined` here
      // means "back to the global", which is the field's absence.
      setPanels((prev) => {
        const target = prev.find((p) => p.rect.id === id)
        if (!target || !isTerminalPanel(target)) return prev
        if (target.fontSize === size) return prev
        const next: Panel[] = prev.map((p) => {
          if (p.rect.id !== id || !isTerminalPanel(p)) return p
          return { kind: p.kind, rect: p.rect, spec: p.spec, z: p.z,
            ...(p.title === undefined ? {} : { title: p.title }),
            ...(p.links === undefined ? {} : { links: p.links }),
            ...(size === undefined ? {} : { fontSize: size }) }
        })
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
    // Cmd+0's INITIAL, which is the only camera reset useViewport exposes.
    zoomToFit: () => resetViewport(),
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
    // M58. Fire-and-forget into main, which owns the dialog, the write and
    // the reveal; a refusal is logged, since the palette has no toast.
    exportPanelText: (panelId) => {
      void window.canvas.export.panelText(panelId).then((r) => {
        if (r.kind !== 'written' && r.kind !== 'cancelled') console.warn(`[export] panel text: ${r.kind}${'reason' in r ? ` — ${r.reason}` : ''}`)
      })
    },
    exportCanvasPng: () => {
      void window.canvas.export.canvasPng().then((r) => {
        if (r.kind === 'failed') console.warn(`[export] canvas png — ${r.reason}`)
      })
    },
    toggleSetting: (id, value) => {
      // Main owns the store, so the write goes there and the row list is
      // reloaded from the answer rather than updated optimistically: an
      // optimistic row that main refused (an unknown id, a wrong type) would
      // show the new value until the next reload and then flip back.
      void window.canvas.settings.set(id, value).then(reloadSettings)
    },
    beginEditSetting: (id, label, current) => {
      // Read off the row we already loaded, rather than hardcoding 250/60000
      // (or any other bound): the schema is the single source of truth for
      // min/max, and a renderer-side constant would silently drift from it
      // the day a range changes. Absent for a row with no bound.
      const row = settingRows.find((s) => s.id === id)
      const { min, max } = row ?? {}

      // Re-entrant so an out-of-range refusal can reopen the same edit with
      // the bad value still visible, rather than starting over from `current`.
      const openEdit = (initial: string, refused?: string): void => {
        setInputMode({
          kind: 'number',
          label: refused ? `${label} (ms) — ${refused}` : `${label} (ms)…`,
          initial,
          // Set ONLY on the refusal reopen. The ordinary label above is a
          // placeholder-worthy hint ("here's the current value"); this one is
          // an answer to a question nobody asked unless they just typed
          // something wrong, and a placeholder can't show it — see
          // InputMode's `feedback` doc comment in Palette.tsx.
          ...(refused ? { feedback: true as const } : {}),
          submit: (value) => {
            const parsed = Number(value)
            // A non-number is a cancel, not a write of NaN. main's
            // setPreference would refuse NaN anyway, but bouncing it here
            // means a typo does not close the palette and silently change
            // nothing.
            if (!Number.isFinite(parsed)) {
              setInputMode(null)
              return
            }
            // Checked here too, even though main enforces the SAME bound in
            // setPreference. main's check is the last line of defence for a
            // file it did not write; it is not enough on its own, because a
            // refusal that happens only there is INVISIBLE — the palette
            // closes exactly as it does on success, SETTINGS_SET's handler
            // resolves regardless, and reloadSettings() re-fetches the
            // unchanged value with nothing anywhere saying the edit was
            // dropped. Re-opening here is what makes the refusal visible to
            // the user; it does not replace main's check, which still catches
            // a value that reached this process by some other route.
            if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
              openEdit(value, `must be ${min ?? '−∞'}–${max ?? '∞'}, got ${parsed}`)
              return
            }
            void window.canvas.settings.set(id, parsed).then(() => {
              setInputMode(null)
              reloadSettings()
            })
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command (and
        // before calling an input mode's submit), so without this the mode
        // would be set on a palette that is already gone and the
        // clear-on-close effect would wipe it — the same pairing
        // beginRenamePreset and deletePreset both make, and the reason the
        // out-of-range branch above must call openEdit (which reopens) rather
        // than just setInputMode.
        palette.openPalette()
      }

      openEdit(String(current))
    },
    switchWorkspace,
    beginCreateWorkspace: () => {
      setInputMode({
        kind: 'text',
        label: 'Name the new workspace…',
        initial: '',
        submit: (value) => {
          const name = value.trim()
          // An empty trimmed value is a cancel, not "name this workspace
          // the empty string" — parseWorkspace accepts '' and it would
          // round-trip to disk, leaving the switch row and the admin rows
          // rendering blank text with no way back to a real name short of
          // deleting the workspace.
          if (name.length === 0) {
            setInputMode(null)
            return
          }
          void window.canvas.workspace.create(name).then((id) => {
            // Create then switch, as two calls rather than one store method.
            // createWorkspace deliberately does NOT activate what it mints
            // (a create that also switched would move the user somewhere
            // they did not ask to go) — but this row is "new workspace",
            // and arriving in it IS what the user asked for. The store
            // keeps the two separable; the command composes them.
            switchWorkspace(id)
            reloadWorkspaces()
            setInputMode(null)
          }, (error: unknown) => {
            // Unhandled otherwise: void-ing this chain silences the lint,
            // not the rejection. Nothing has happened to the canvas yet at
            // this point (create runs before switch), so failing here is
            // the cheap, honest case — just tell the palette to stop
            // waiting rather than leaving it hung on a promise that will
            // never resolve.
            console.warn('[workspace] could not create workspace', name, error)
            setInputMode(null)
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without reopening, the mode would be set on a palette that is gone.
      palette.openPalette()
    },
    beginRenameWorkspace: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: 'Rename this workspace…',
        initial: currentName,
        submit: (value) => {
          const name = value.trim()
          // Same cancel rule as beginCreateWorkspace: an empty trimmed
          // value must not reach the store, or the rename "succeeds" into
          // a blank name that round-trips to disk.
          if (name.length === 0) {
            setInputMode(null)
            return
          }
          void window.canvas.workspace.rename(id, name)
            .catch((error: unknown) => {
              // Unhandled otherwise. Refused or rejected, the palette still
              // has to stop waiting — reloadWorkspaces() below reflects
              // whichever name main actually kept either way.
              console.warn('[workspace] could not rename workspace', id, error)
            })
            .finally(() => {
              reloadWorkspaces()
              setInputMode(null)
            })
        }
      })
      // Same reason beginCreateWorkspace/beginRenamePreset both do this.
      palette.openPalette()
    },
    deleteWorkspace: (id, name, panelCount) => {
      // Gated, not instant — the same reason deletePreset above is: a
      // delete row sat one Enter away from destroying a workspace's worth
      // of running agents, styled identically to "Go to n1".
      //
      // `panelCount` (commands.ts's `w.panelIds.length`) is a PANEL count,
      // not a LIVE one — three dormant, never-spawned panels would read as
      // "stop 3 running agents", which is false, in the one place a false
      // claim is worst: a destructive confirm. Recomputed honestly below,
      // before the question is ever shown, against main's own pty list
      // rather than this renderer's local registry — the same reason
      // dispose()'s own fix above exists: a panel this renderer holds no
      // PanelSession for (another workspace's, or one surviving a reload)
      // can still be genuinely running, so the registry alone would
      // undercount exactly the panels most worth warning about.
      void (async (): Promise<void> => {
        let liveCount = panelCount
        try {
          const [rows, sessions] = await Promise.all([
            window.canvas.workspace.list(),
            window.canvas.pty.list()
          ])
          const row = rows.find((w) => w.id === id)
          if (row) {
            const liveIds = new Set(sessions.map((s) => s.panelId))
            liveCount = row.panelIds.filter((pid) => liveIds.has(pid)).length
          }
        } catch (error: unknown) {
          // Failing toward the ORIGINAL (panel) count is the safe direction
          // for a destructive confirm: overstating what is about to stop is
          // the honest side of a guess to be wrong on, understating it is
          // not.
          console.warn('[workspace] could not compute a live count for delete confirm', id, error)
        }
        setInputMode({
          kind: 'confirm',
          // The count is IN the question. "Delete this workspace?" and
          // "stop 3 running agents?" are different questions, and only the
          // second one is the one actually being asked.
          label:
            liveCount > 0
              ? `Delete “${name}” and stop ${liveCount} running ${liveCount === 1 ? 'agent' : 'agents'}?`
              : `Delete “${name}”?`,
          initial: '',
          submit: () => {
            void (async (): Promise<void> => {
              try {
                const before = await window.canvas.workspace.list()
                const doomed = before.find((w) => w.id === id)
                // Re-read rather than trusting the row's captured
                // panelIds: the palette's list is a snapshot from when it
                // opened, and a panel may have been closed (or opened)
                // since.
                if (doomed) {
                  // Deleting the ACTIVE workspace: switch away BEFORE
                  // removing the record, never after. IPC.WORKSPACE_ACTIVATE's
                  // own doc comment says why — activate() writes its
                  // `outgoing` argument into whichever workspace main
                  // considers active AT THE MOMENT IT RUNS, and main's own
                  // remove() reassigns activeWorkspaceId to a neighbour the
                  // instant this record is gone. An activate() issued AFTER
                  // remove() would therefore write THIS (about-to-be-deleted)
                  // workspace's own stale panels — captured before dispose()
                  // below ever ran — into whatever main just made active,
                  // silently resurrecting a disposed panel's id there. This
                  // was caught by a failing check, not by reading the doc
                  // comment first: verify:panels 69 disposed the session
                  // correctly and then watched it reappear in the registry a
                  // moment later, reintroduced by exactly this write.
                  // Switching first means the outgoing write lands on the
                  // record actually being left — this one, which we are
                  // about to delete anyway, so it is harmless there.
                  //
                  // A workspace with no neighbour (this was the ONLY one)
                  // gets the SAME treatment, not a special one: mint a
                  // fresh replacement and switch to IT first, exactly as
                  // though it were a neighbour that already existed. The
                  // earlier shape of this branch let main's remove()
                  // install its own fresh default and switched to THAT
                  // afterward — which is the identical after-remove()
                  // mistake this comment already rules out, just with the
                  // neighbour missing rather than merely stale: the
                  // outgoing write still landed on a real, currently-active
                  // record (the fresh default) with this doomed workspace's
                  // disposed panels, resurrecting them there. 'Canvas'
                  // matches the name main's own defaultWorkspace() would
                  // have installed, so the user sees the same thing either
                  // way — the only difference is which process decided.
                  // Captured BEFORE the switch below, and out of this
                  // canvas's own panel array, because that array is the only
                  // place a KIND is knowable here: main's workspace rows
                  // carry ids and nothing else. A review node holds no
                  // PanelSession, and dispose() reaches pty.kill regardless
                  // (see the loop's own comment), so an unguarded node id
                  // here sends a kill for a panel that never had a session
                  // and drops the baseline of whatever panel recycles that
                  // id. Positive test, as everywhere else.
                  //
                  // Honest about its reach: this covers the ACTIVE
                  // workspace, which is the only one whose panels this
                  // renderer holds objects for. Deleting a HIDDEN workspace
                  // that contains a review node still sends that stray kill
                  // — harmless in the same way it was harmless everywhere
                  // before this guard (main tolerates destroying a session it
                  // never spawned), and closable only by teaching
                  // WORKSPACE_LIST to carry a kind, which is a channel
                  // change this milestone did not scope.
                  // M16: every SESSIONLESS kind, not only review nodes — a
                  // file panel owns no PanelSession either, so an unguarded
                  // id here sends the same stray kill.
                  const doomedSessionlessIds = doomed.active
                    ? new Set(panelsRef.current
                        .filter((p) => !isTerminalPanel(p))
                        .map((p) => p.rect.id))
                    : new Set<string>()
                  let target = before.find((w) => w.id !== id)
                  if (doomed.active && !target) {
                    const freshId = await window.canvas.workspace.create('Canvas')
                    target = { id: freshId, name: 'Canvas', panelIds: [], active: false }
                  }
                  // AWAITED, and a refusal ABANDONS the delete. This is the
                  // one caller that cannot treat switchWorkspace as
                  // fire-and-forget: the in-flight guard can refuse it (a
                  // chord pressed while this confirm's own awaits were
                  // running), and a delete that carried on regardless would
                  // remove the ACTIVE record without having switched away —
                  // exactly the resurrection this ordering exists to prevent,
                  // with main's remove() reassigning activeWorkspaceId and
                  // this workspace's already-disposed panels landing in the
                  // neighbour. Refusing the whole delete is the honest
                  // failure: the user still has their workspace, and pressing
                  // the row again works.
                  if (doomed.active && target) {
                    const switched = await switchWorkspace(target.id)
                    if (!switched) {
                      console.warn(
                        '[workspace] delete abandoned: could not switch away from the active workspace',
                        id
                      )
                      return
                    }
                  }
                  for (const panelId of doomed.panelIds) {
                    // THE FOURTH registry.dispose CALL SITE in the canvas
                    // layer (after onClosePanel, applyHistory and onReset,
                    // all three still in Canvas.tsx). Said "in this file"
                    // until M28 lifted these actions out of Canvas.tsx; the
                    // count is the layer's, which is the scope verify:panels
                    // 94 now reads. It
                    // adds no caller of pty.kill: dispose(id) and
                    // disposeAll() remain the only two inside
                    // session-registry.ts, and routing through dispose()
                    // rather than reaching for pty.kill directly is exactly
                    // what has kept that count true across four milestones.
                    //
                    // Disposing rather than detaching is deliberate. The
                    // workspace RECORD is going, so a surviving session is
                    // one no UI can ever reach or stop again — the backlog
                    // item for recovering an orphan session does not exist
                    // — which means an agent would burn tokens invisibly
                    // until quit kill-servers the whole tmux socket. This
                    // holds even for a panelId this renderer has no LOCAL
                    // PanelSession for (a hidden workspace's own panel, or
                    // one surviving a reload): dispose()'s own fix sends
                    // pty.kill regardless, mirroring main's PtyManager.kill.
                    // And, like the reset and undo loops, it skips a
                    // sessionless panel's id — see doomedSessionlessIds above
                    // for what the skip buys and exactly how far it reaches.
                    if (doomedSessionlessIds.has(panelId)) {
                      clearFileResult(panelId)
                      clearToolbox(panelId)
                      continue
                    }
                    registry.dispose(panelId)
                    clearAgentState(panelId)
                    clearLiveSession(panelId)
                    clearSubagents(panelId)
                    clearUsage(panelId)
                    clearMachineCost(panelId)
                    clearScrollbackTail(panelId)
                  }
                }
                await window.canvas.workspace.remove(id)
              } catch (error: unknown) {
                // Unhandled otherwise. By the time any of these awaits could
                // reject, the sessions above may already be disposed — the
                // worst case this action's brief calls out — so silence here
                // would strand the user on a canvas full of dead panels with
                // no path back and nothing in any log.
                console.warn('[workspace] could not delete workspace', id, error)
              } finally {
                reloadWorkspaces()
                setInputMode(null)
              }
            })()
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command, so
        // without reopening, the mode would be set on a palette that is
        // gone. Reopened here rather than before the count above, since
        // this whole function is now async: opening early would show a
        // confirm whose wording changes a beat later, which reads as the
        // dialog glitching rather than as a deliberate wait.
        palette.openPalette()
      })()
    },
    // Not a new dispose call site — this IS onClosePanel, the one the panel's
    // own × already uses. See PaletteActions.closePanel for why it is reached
    // through this object rather than closed over directly by the rail.
    closePanel: (id) => onClosePanel(id),
    // The wake path, and deliberately not what a row CLICK does. See
    // PaletteActions.startPanel.
    startPanel: (id) => onSelectPanel(id),
    savePanelAsPreset: (id) => {
      // displayPanelsRef, not panelsRef, and this is the read-only split
      // deciding in favour of ON SCREEN rather than SAVED for once. While
      // merged the inspector can have a FOREIGN panel selected, and against
      // panelsRef the lookup simply found nothing: the Save control stayed
      // enabled and did nothing at all — an affordance that lies, which is
      // worse than a disabled one with a reason, and worse again because the
      // user's next move is to press it harder.
      //
      // Saving a foreign panel is safe where DRAGGING one is not, and the
      // difference is direction: a preset is a READ of the panel's spec and
      // its box into a store of its own. It writes no workspace record, moves
      // no session, and the lane offset never reaches it — the rect's w/h are
      // the only geometry a preset carries, and lanes translate, so they are
      // the panel's own numbers either way.
      const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
      // Nothing to save for a sessionless panel: neither a review node nor a
      // file panel has a spec, and the preset either would produce is a shell
      // in a directory it never named. The POSITIVE test, so a fourth kind is
      // a compile error here rather than a shell spawned in a stranger's cwd.
      if (!panel || !isTerminalPanel(panel)) return
      // Where the panel IS, falling back to where it was spawned — the same
      // asymmetry reloadPrompts obeys, stated there in full.
      const captured: CapturedPanel = {
        cwd: getLiveSession(panel.rect.id)?.cwd ?? panel.spec.cwd,
        args: [...panel.spec.args],
        w: panel.rect.w,
        h: panel.rect.h
      }
      // Absent stays absent: a captured login-shell panel must save as a
      // login-shell preset, not as whatever this machine's shell happens to
      // be. Built field by field for the same reason onCapture is.
      if (panel.spec.command !== undefined) captured.command = panel.spec.command
      if (panel.spec.agent !== undefined) captured.agent = panel.spec.agent
      // M20. Both capture surfaces carry it, never one — presetFromCapture is
      // the shared mint precisely so the menu's path and the inspector's
      // cannot disagree about what a saved preset is, and a knob added to one
      // only would give a user two different presets for one panel depending
      // on which surface saved it.
      if (panel.spec.agentOptions !== undefined) captured.agentOptions = panel.spec.agentOptions
      void window.canvas.preset.savePanel(captured).then(reloadPresets)
    },
    /**
     * Restart in place: end this panel's process and start a fresh one at the
     * same id, the same rect and the same spec.
     *
     * THE FIFTH registry.dispose CALL SITE in this file, and — like the other
     * four — it adds no caller of pty.kill: dispose() is still exactly one of
     * the two, both inside session-registry.ts. verify:panels 94 pins both
     * numbers by reading the source, because no runtime behaviour can observe
     * how many callers a function has and CLAUDE.md records this exact count
     * going stale once already.
     *
     * Four things about the sequence are load-bearing.
     *
     * clearAgentState FIRST, before the dispose. Agent state survives a
     * panel's closure by design — main sends the transition and the
     * renderer's store keeps it until something clears it — so without this a
     * panel restarted out of wants-you keeps its amber border: a fresh agent
     * wearing a dead one's question, and nothing will ever clear it, because
     * only focus or a write acknowledges and neither says anything about the
     * PREVIOUS process. main's `create` sends `starting` directly (it is the
     * one state nothing transitions into, so a change-gated send would never
     * emit it), which is what re-seeds the panel a moment later.
     *
     * AWAIT the dispose. Under tmux the session must be DESTROYED before the
     * respawn, or `new-session -A` attaches to the very session this was meant
     * to replace and the whole verb becomes a silent no-op — the panel blinks
     * and comes back with the same process in it. dispose() returns the
     * kill's promise for exactly this caller.
     *
     * ensure with dormant FALSE, explicitly rather than inherited. A dormant
     * re-ensure leaves the panel refusing to spawn, which on screen is
     * indistinguishable from a restart that did nothing at all.
     *
     * bumpVersion at the end. ensure() deliberately does not bump — it is
     * normally called during render, where notifying a useSyncExternalStore
     * subscriber makes React warn — so from an event handler nothing else
     * would re-render to mount the new handle's slot or re-run the tiering
     * effect, and the panel would show literally nothing with no error
     * anywhere. dispose() did bump, but that bump is a tick stale by the time
     * this resolves. NOT focus(): it bumps too, but it also moves the
     * keyboard, which a shell control must never do (shell-control.ts).
     *
     * No history entry — the panel array does not change, so there is no
     * gesture to undo. No confirm — the process this ends is precisely the one
     * the user asked to replace; the control's own title is where the warning
     * lives instead.
     */
    restartPanel: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      // A sessionless panel has no process to restart. The isRestartable gate
      // inside restartWithSpec would refuse either kind anyway (neither holds
      // a session, so the status is undefined), but the narrowing has to
      // happen before `panel.spec` is read at all.
      if (!panel || !isTerminalPanel(panel)) return
      restartWithSpec(id, panel.spec)
    },
    /**
     * M20. Set a panel's permission mode AND restart it, as ONE gesture.
     *
     * Compound rather than two verbs, and the compounding is the design. A
     * bare "change this panel's mode" is unsound twice: `registry.ensure`
     * returns an existing session unchanged, so the spec would move while the
     * process kept the old flags — every surface reading the session would
     * then disagree with every surface reading the panel — and an undo of the
     * spec edit would lie in the other direction, restoring a spec the running
     * process never had. Restarting closes both, because a restart is the one
     * thing that re-reads the argv: tmux `new-session -A` ignores it entirely
     * on a reattach.
     *
     * It is also what lets the inspector label its rows plainly rather than
     * hedging each with "requested". With this as the only mutation path, the
     * session's spec and the running process cannot disagree.
     *
     * ONE history entry, pushed through commitHistory like every other
     * committed gesture — unlike plain restartPanel, which pushes none
     * because the panel array genuinely does not change there. Here it does:
     * the spec is part of the panel, so an undo has something real to undo.
     */
    restartPanelWithMode: (id, mode) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (!panel || !isTerminalPanel(panel)) return
      // Gated on the SESSION's agent, matching agentArgs: a flag appended to a
      // panel main will not treat as an agent is emitted nowhere, so the verb
      // would look like it worked and do nothing.
      if (registry.get(id)?.spec.agent === undefined) return
      const nextSpec: PanelSpecTemplate = {
        ...panel.spec,
        agentOptions: { ...panel.spec.agentOptions, permissionMode: mode }
      }
      setPanels((current) => {
        const next = current.map((p) =>
          p.rect.id === id && isTerminalPanel(p) ? { ...p, spec: nextSpec } : p
        )
        commitHistory(next)
        return next
      })
      restartWithSpec(id, nextSpec)
    },
    openReview,
    // Reads the panel from the ref rather than closing over `panels`, the
    // rule every other action in this object obeys: `panels` is a fresh array
    // on every setPanelRect, so closing over it would rebuild this whole memo
    // on every frame of a drag.
    openToolbox: (panelId) => {
      const panel = panelsRef.current.find((p) => p.rect.id === panelId)
      if (panel === undefined) return
      const cwd = isTerminalPanel(panel)
        ? panel.spec.cwd
        : isToolboxPanel(panel)
          ? panel.source.cwd
          : ''
      if (cwd === '') return
      openToolboxPanel(cwd, railLabel(panel, registry.get(panelId)?.status), worldCentre())
    },
    // M61. Pure transitions from groups.ts, the same ones GroupLayer's
    // buttons reach through Canvas — one definition of "collapse".
    // Refused in the merged view at the action as well as at the row, the way
    // beginCreateGroup below is: the row's reason is the user-facing refusal,
    // this is the one a future caller cannot forget.
    toggleGroup: (id) => { if (mergedRef.current) return; setGroups((current) => (current.find((g) => g.id === id)?.collapsed ? expandGroup : toggleGroup)(current, id)) },
    removeGroup: (id) => { if (mergedRef.current) return; setGroups((current) => removeGroup(current, id)) },
    beginSpawnSheet: () => {
      // The focused panel's LIVE directory first (M12's poll, falling back to
      // the spawn cwd), then main's recent list, then every panel's directory.
      // The captured id while the palette is open; from the menu (palette
      // closed) the most recently focused panel, which the registry records.
      const focusedAt = registry.lastFocusedAt()
      const lastFocused = Object.keys(focusedAt).sort((a, b) => focusedAt[b] - focusedAt[a])[0]
      const captured = palette.capturedId ?? lastFocused ?? null
      const focusedPanel = captured === null ? undefined : panelsRef.current.find((p) => p.rect.id === captured)
      const focusedCwd = focusedPanel !== undefined && isTerminalPanel(focusedPanel)
        ? (getLiveSession(focusedPanel.rect.id)?.cwd ?? focusedPanel.spec.cwd)
        : undefined
      const panelDirs = panelsRef.current.filter(isTerminalPanel).map((p) => getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd)
      const presets = presetRows.map((p) => ({ id: p.id, name: p.name, available: p.available, ...(p.agent === undefined ? {} : { agent: p.agent }), ...(p.cwd === undefined ? {} : { cwd: p.cwd }), ...(p.agentOptions === undefined ? {} : { agentOptions: p.agentOptions }) }))
      const defaultPresetId = presetRows.find((p) => p.isDefault)?.id ?? presetRows[0]?.id ?? ''
      void window.canvas.spawn.recent().then((recents) => {
        setInputMode({
          kind: 'sheet',
          label: 'New panel',
          initial: '',
          submit: () => {},
          sheet: {
            presets, defaultPresetId, ...(focusedCwd === undefined ? {} : { focusedCwd }), recents, panelDirs,
            submit: (values) => window.canvas.spawn.sheet(buildSpawnRequest(values, presets))
          }
        })
        palette.openPalette()
      })
    },
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
    movePanelsToWorkspace,
    beginMovePanelsToNewWorkspace: (panelIds) => {
      setInputMode({
        kind: 'text',
        label: `Move ${panelIds.length} panel${panelIds.length === 1 ? '' : 's'} to a new workspace named…`,
        initial: '',
        submit: (value) => {
          const name = value.trim()
          // An empty trimmed value is a CANCEL, not "name this workspace the
          // empty string" — the same rule beginCreateWorkspace states, and
          // worse here: an empty name would round-trip to disk on a
          // workspace that now holds the user's panels, leaving every row
          // that names it blank with no way back short of deleting the
          // workspace those panels are in.
          if (name.length === 0) {
            setInputMode(null)
            return
          }
          // ONE call, not create-then-move: main mints the workspace inside
          // movePanels and defers the mint until the move is known non-empty,
          // so a name that turns out to move nothing leaves no empty
          // workspace behind. Composing it here out of create() + a move
          // would put that ordering in a second place and lose it.
          movePanelsToWorkspace(panelIds, { newName: name })
          setInputMode(null)
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without reopening, the mode would be set on a palette that is already
      // gone and the clear-on-close effect would wipe it — the same pairing
      // beginCreateWorkspace and beginRenamePreset both make.
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
     * Masked token entry, gated the same way beginEditSetting's number edit
     * is: RE-ENTRANT, so a refusal from main (an unreachable network, a
     * malformed token) can reopen the same prompt with the reason on screen
     * rather than closing silently. The one deliberate difference from
     * beginEditSetting is `initial`, which stays '' on every call — see
     * InputMode's 'secret' doc comment in Palette.tsx for why a masked field
     * must never be re-seeded with what the user just typed, refusal or not.
     */
    beginSetCredential: (service) => {
      const label = findService(service)?.label ?? service
      const openEntry = (refused?: string): void => {
        setInputMode({
          kind: 'secret',
          label: refused
            ? `${label} token — ${refused}`
            : (findService(service)?.help ?? `Paste the ${label} token…`),
          initial: '',
          ...(refused ? { feedback: true as const } : {}),
          submit: (value) => {
            const jiraLines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            const token = service === 'jira' && jiraLines.length === 3 ? JSON.stringify({ site: jiraLines[0], email: jiraLines[1], token: jiraLines[2] }) : value
            if (service === 'jira' && jiraLines.length !== 3) { openEntry('enter site URL, email, and API token on three lines'); return }
            void window.canvas.credential.set({ service, token }).then((res) => {
              if (!res.ok) {
                openEntry(res.reason)
                return
              }
              setInputMode(null)
              reloadCredentials()
            })
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command, so
        // without this the mode would be set on a palette that is already
        // gone — the same pairing beginRenamePreset and beginEditSetting both
        // make, for the same reason, including on the refusal reopen.
        palette.openPalette()
      }
      openEntry()
    },
    verifyCredential: (service) => {
      // On SUCCESS, the reload is the only signal: the row's own title
      // already reads "Verify X (label)", and a stored, never-verified
      // credential shows the service's own label until this succeeds and
      // CredentialMeta.label updates to what the remote service actually
      // calls the account — a success dialog on top of that would be a
      // second, noisier way to say what the row itself is about to say.
      //
      // On FAILURE, that same silence is exactly wrong: runRow already
      // closed the palette before this ran, so a rejection reason computed
      // in main — "GitHub rejected the token — it may be revoked or lack
      // scope", the single most useful thing this verb can report — would
      // otherwise cross IPC and be dropped with the overlay already gone.
      // Surfaced the same way beginSetCredential's own refusal path already
      // demonstrates: reopen the palette in an input mode carrying the
      // reason, with feedback: true so it renders as an answer rather than a
      // hint. 'confirm' rather than 'secret' or 'text', because there is
      // nothing to type or correct here — only a fact to acknowledge, the
      // same shape deletePreset's question already reuses this mode for.
      const label = findService(service)?.label ?? service
      void window.canvas.credential.verify(service).then((res) => {
        if (!res.ok) {
          setInputMode({
            kind: 'confirm',
            label: `${label} verification failed — ${res.reason}`,
            initial: '',
            feedback: true,
            submit: () => {}
          })
          palette.openPalette()
          return
        }
        reloadCredentials()
      })
    },
    beginDeleteCredential: (service) => {
      // Gated, not instant — the same reason deletePreset and deleteWorkspace
      // above are: a delete row sat one Enter away from destroying a stored
      // credential, styled identically to every other row until the confirm
      // question is on screen.
      const label = findService(service)?.label ?? service
      setInputMode({
        kind: 'confirm',
        label: `Delete the stored ${label} token?`,
        initial: '',
        submit: () => {
          void window.canvas.credential.remove(service).then(reloadCredentials)
        }
      })
      // Same reason beginRenamePreset/deletePreset both do this.
      palette.openPalette()
    },

    /**
     * The palette's door onto a file panel: main owns the native open dialog,
     * so this is an invoke rather than anything the renderer can put on
     * screen itself.
     *
     * A null reply is a CANCEL and must mint nothing — the one outcome a
     * dialog has that a click does not, and the one an unchecked `then` would
     * turn into a panel pointed at the empty string. The camera's own centre
     * is the placement, exactly as a menu-driven spawn uses worldCentre():
     * there is no cursor to land under, because the gesture ended in a
     * separate window.
     */
    openFile: () => {
      void window.canvas.file.open().then((path) => {
        if (path === null) return
        openFilePanel(path, worldCentre())
      })
    },
    openJira: () => openJiraPanel(),
    newNote: () => beginNewNote(),
    setPresetWorktree: (id, on) => {
      // Main owns the store and refuses a built-in; the reload is what makes
      // the toggle row's own title flip.
      void window.canvas.preset.setWorktree(id, on).then(reloadPresets)
    },
    beginRemoveWorktree: (id) => {
      // Gated, for deletePreset's reason. The question names the BRANCH,
      // because that is what the user would recognise; the path is in the
      // row's subtitle they just read. A dirty tree is refused by git itself
      // and the refusal comes back as a note in the palette's input mode
      // rather than as silence.
      const row = worktreeRows.find((w) => w.id === id)
      const branch = row?.branch ?? id
      setInputMode({
        kind: 'confirm',
        label: `Remove worktree “${branch}”? Its branch stays; git refuses if the tree is dirty.`,
        initial: '',
        submit: () => {
          void window.canvas.worktree.remove(id).then((result) => {
            reloadWorktrees()
            if (result.kind === 'refused' || result.kind === 'failed') {
              // Shown, never swallowed: a remove that did nothing and said
              // nothing reads as the row being broken. Input mode is the one
              // surface the palette already has for a sentence the user must
              // read; `submit` closes it.
              setInputMode({ kind: 'confirm', label: `Not removed — ${result.reason}`, initial: '', submit: () => {} })
              palette.openPalette()
            }
          })
        }
      })
      palette.openPalette()
    },
    revealWorktree: (id) => {
      void window.canvas.worktree.reveal(id)
    },
    beginClearScrollback: () => {
      // Gated, for deletePreset's reason: a destructive row still runs on one
      // Enter. The question says what goes, because "scrollback" is jargon
      // and the user may have found this row by typing "clear".
      setInputMode({
        kind: 'confirm',
        label: 'Clear every panel’s recorded output from disk? Restored panels will show nothing until they run again.',
        initial: '',
        submit: () => {
          void window.canvas.scrollback.clear()
        }
      })
      palette.openPalette()
    }
  }), [resetViewport, centreOn, selectAndRaise, presetRows, promptRows,
       reloadPresets, palette.openPalette, palette.closePalette,
       palette.capturedId, reloadPrompts, commitHistory, reloadSettings,
       settingRows, switchWorkspace, reloadWorkspaces, onClosePanel,
       onSelectPanel, openReview, linkMode, reloadCredentials,
       movePanelsToWorkspace, toggleMerged, broadcastInput, broadcastReady,
       openFilePanel, openJiraPanel, worldCentre, beginNewNote, reloadWorktrees,
       worktreeRows, setInputMode, goToViewport, cameraBack, cameraForward, bookmarksRef, setBookmarks, viewportRef])
}
