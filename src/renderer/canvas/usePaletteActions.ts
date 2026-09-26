import { useMemo } from 'react'
import type { PaletteActions } from '@renderer/palette/commands'
import type { PersistedTemplate } from '@shared/templates'
import type { SpawnResult } from '@shared/ipc-contract'
import type { ActionCtx, PaletteActionsDeps } from './palette-actions/types'
import { executorActions, type ExecutorActions } from './palette-actions/executor'
import { presetsActions, type PresetsActions } from './palette-actions/presets'
import { promptsActions, type PromptsActions } from './palette-actions/prompts'
import { arrangementActions, type ArrangementActions } from './palette-actions/arrangement'
import { workspacesActions, type WorkspacesActions } from './palette-actions/workspaces'
import { settingsActions, type SettingsActions } from './palette-actions/settings'
import { boardActions, type BoardActions } from './palette-actions/board'
import { objectsActions, type ObjectsActions } from './palette-actions/objects'
import { sharingActions, type SharingActions } from './palette-actions/sharing'

export type { PaletteActionsDeps }

/**
 * Every verb the palette, the top bar, the rail and the inspector can run —
 * the single `actions` object those four surfaces share.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28), then split by DOMAIN into
 * `./palette-actions/` once the lifted hook had itself grown past 2,600 lines.
 * This file is the composition root and holds no verb of its own.
 *
 * THE THREE PROPERTIES THAT SURVIVED BOTH MOVES UNCHANGED.
 *
 * It is still ONE `useMemo` returning ONE object, with the identical dependency
 * array it had inside Canvas. `Palette.tsx` takes this as its `actions` prop and
 * memoizes its command list on it, so handing back per-verb callbacks — or a
 * fresh object per slice — would give that memo a new identity on every render:
 * the defect "the palette's selection moves only when the user moves it"
 * describes, visible as the selection re-seating itself during an unrelated
 * mousemove over the canvas. The slices are called INSIDE the memo and assigned
 * onto one object for exactly that reason.
 *
 * The deps object is destructured on entry and the dependency array names the
 * DESTRUCTURED members, never `deps` itself: the caller builds a fresh object
 * literal every render, so a dependency on it would rebuild every verb on every
 * frame of a pan.
 *
 * `deleteWorkspace` (now in `./palette-actions/workspaces.ts`) still holds one
 * of the canvas layer's five `registry.dispose` call sites. `verify:panels` 94
 * counts them across this DIRECTORY rather than in `Canvas.tsx` alone —
 * precisely so a split like this one could happen without weakening the count.
 */
export function usePaletteActions(deps: PaletteActionsDeps): PaletteActions {
  const {
    createObjectNow, recheckEnvironment, applyStarter, saveWorkflowDraft, saveWorkflowCopyDraft,
    prepareFeedbackNow, exportCanvasFile, importCanvasFile, importDocxFile, exportPackFile,
    importPackFile, importSamplePackFile, markPresetReadNow, testNodeNow, addNote, setNoteText,
    setNoteTint, addImageFromPath, replaceImagePanel, openPreviewNow, bindPreviewNow,
    setPreviewWidthNow, capturePreviewNow, startDevServerNow, discoverProject, stopWorkflowRun,
    runWorkflowNow, registry, palette, linkMode, panelsRef, presetRows, promptRows, settingRows,
    broadcastInput, broadcastReady, resetViewport, fitAll, fitSelection, selectedIdsRef,
    centreOn, worldCentre, goToViewport, cameraBack, cameraForward, bookmarksRef, setBookmarks,
    viewportRef, selectAndRaise, onSelectPanel, onClosePanel, openReview, openFilePanel,
    openJiraPanel, beginNewNote, beginNewChat, openAsChat, openInTerminal, instantiateTemplate,
    lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel, beginAnnotate,
    restartWithSpec, commitHistory, switchWorkspace, movePanelsToWorkspace, toggleMerged,
    reloadPresets, reloadPrompts, reloadSettings, reloadCredentials, reloadWorkspaces,
    reloadWorktrees, worktreeRows, setInputMode, teammatesRef, chooseNavigator, setCenterView,
    openBrowserPanel, openSkillPanel, toggleFlip, workItemsRef, setWorkItems, boardVerbsRef
  } = deps

  // Kept in the ROOT rather than in a slice because TWO domains need it:
  // `workspaceFromTemplate` (workspaces) and the spawn sheet's `instantiate`
  // seam (presets). It rides on the ctx so neither slice has to import the
  // other. M147's original note — that `self` names the object being built,
  // for the one verb that opens another verb's door — is now the composition's
  // own rule and is stated on the memo below.
  //
  // M147/M149. The three doors behind `New workspace from <template>`: a
  // workspace named after the template, the switch, then M80's instantiation
  // there — run only once the shape is fully answered, never before.
  const intoNewWorkspace = async (template: PersistedTemplate, values: Record<string, string>): Promise<SpawnResult> => {
    // A name that is already taken gets a counter: `two shells (2)`. The
    // store appends without deduping, and two identical names in the
    // switcher are two rows nothing tells apart (the Act II critic).
    const taken = new Set((await window.canvas.workspace.list()).map((w) => w.name))
    let name = template.name
    for (let n = 2; taken.has(name); n += 1) name = `${template.name} (${n})`
    const from = await window.canvas.workspace.list().then((ws) => ws.find((w) => w.active)?.id)
    const id = await window.canvas.workspace.create(name)
    const switched = await switchWorkspace(id)
    reloadWorkspaces()
    if (!switched) return { kind: 'refused', reason: 'the new workspace could not be opened' }
    const result = await instantiateTemplate(template, values)
    // A refusal AFTER the mint (a preset gone unavailable between the row
    // and the click) would strand the user in an empty workspace named after
    // the template — the very failure workspace.template.2 closed for
    // Escape. Undo the mint and say why, in the refusal's own words.
    if (result.kind === 'refused') {
      if (from !== undefined) await switchWorkspace(from)
      await window.canvas.workspace.remove(id)
      reloadWorkspaces()
      return { kind: 'refused', reason: `${result.reason} — the new workspace was not kept` }
    }
    return result
  }
  return useMemo<PaletteActions>(() => {
    // The object is created EMPTY and filled, rather than built from spreads,
    // so `ctx.self` is the finished object by the time any verb body runs.
    // Dozens of verbs call a sibling through it (the executor reaches nearly
    // all of them); before the split they did so against the literal under
    // construction, which is the same trick. See ./palette-actions/types.ts.
    const self = {} as PaletteActions
    const ctx: ActionCtx = { ...deps, self, intoNewWorkspace }
    // Order is irrelevant — the slices partition the interface, so no key is
    // written twice (`verify:verbs slices.1`).
    Object.assign(
      self,
      executorActions(ctx),
      presetsActions(ctx),
      promptsActions(ctx),
      arrangementActions(ctx),
      workspacesActions(ctx),
      settingsActions(ctx),
      boardActions(ctx),
      objectsActions(ctx),
      sharingActions(ctx)
    )
    return self
  }, [recheckEnvironment, applyStarter, saveWorkflowDraft, saveWorkflowCopyDraft, prepareFeedbackNow, exportCanvasFile, importCanvasFile, importDocxFile, exportPackFile, importPackFile, importSamplePackFile, markPresetReadNow, testNodeNow, addNote, setNoteText, setNoteTint, addImageFromPath, replaceImagePanel, openPreviewNow, bindPreviewNow, setPreviewWidthNow, capturePreviewNow, startDevServerNow, discoverProject, stopWorkflowRun, runWorkflowNow, resetViewport, fitAll, fitSelection, selectedIdsRef, centreOn, selectAndRaise, presetRows, promptRows,
       reloadPresets, palette.openPalette, palette.closePalette,
       palette.capturedId, reloadPrompts, commitHistory, reloadSettings,
       settingRows, switchWorkspace, reloadWorkspaces, onClosePanel,
       onSelectPanel, openReview, linkMode, reloadCredentials,
       movePanelsToWorkspace, toggleMerged, broadcastInput, broadcastReady,
       openFilePanel, openJiraPanel, worldCentre, beginNewNote, beginNewChat, openAsChat, openInTerminal, reloadWorktrees,
       lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel, beginAnnotate,
       worktreeRows, setInputMode, goToViewport, cameraBack, cameraForward, bookmarksRef, setBookmarks, viewportRef,
       registry, panelsRef, restartWithSpec, onClosePanel, lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel, teammatesRef, chooseNavigator, setCenterView, openBrowserPanel, openSkillPanel, toggleFlip, workItemsRef, setWorkItems, boardVerbsRef, createObjectNow])
}

/**
 * The slices must cover `PaletteActions` exactly. Without this, a verb dropped
 * from every slice during a future move would be `undefined` at run time on a
 * surface nobody clicked during review — legal TypeScript and silent, the shape
 * of defect this repo keeps writing text checks to catch.
 *
 * `AssertNever` fails to compile the moment `Exclude` yields a real key.
 */
type Covered = keyof ExecutorActions | keyof PresetsActions | keyof PromptsActions | keyof ArrangementActions | keyof WorkspacesActions | keyof SettingsActions | keyof BoardActions | keyof ObjectsActions | keyof SharingActions
type AssertNever<T extends never> = T
export type EveryVerbIsCovered = AssertNever<Exclude<keyof PaletteActions, Covered>>
