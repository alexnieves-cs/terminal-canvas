/**
 * Workspaces.
 *
 * Minting, renaming, switching and deleting a workspace, and moving panels
 * between them. `deleteWorkspace` holds one of the canvas layer's five
 * `registry.dispose` call sites — `verify:panels` 94 counts them across this
 * DIRECTORY, which is what let this split happen without weakening the count.
 *
 * One slice of `usePaletteActions`. Every body here is the one that lived in
 * that file before the split, moved verbatim — see `./types.ts` for why `ctx.self`
 * is the object under construction rather than a getter.
 */

import { disposeRelayTerminal } from '@renderer/relay/RelayTerminal'
import { forgetAgentLinksFor } from '../agent-links-store'
import { disposeWatcher } from '@renderer/watcher/useWatchers'
import { disposeChat } from '@renderer/chat/useChatSessions'
import { allTemplates } from '@shared/templates'
import { FRESH_WORKSPACE_NAME } from '@shared/layout-schema'
import { clearAgentState } from '@renderer/session/agent-state-store'
import { clearLastLine } from '@renderer/session/last-line-store'
import { clearLastActive } from '@renderer/session/last-active-store'
import { clearLiveSession } from '@renderer/session/live-session-store'
import { templateHoles } from '@renderer/palette/template-model'
import { clearSubagents } from '@renderer/session/subagent-store'
import { clearTrail } from '@renderer/skills/skill-trail-store'
import { clearFileResult } from '@renderer/session/file-store'
import { clearToolbox } from '@renderer/session/toolbox-store'
import { clearUsage } from '@renderer/session/usage-store'
import { clearMachineCost } from '@renderer/session/machine-cost-store'
import { clearScrollbackTail } from '@renderer/session/scrollback-store'
import { isTerminalPanel } from '@renderer/panels/panels'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type WorkspacesActions = Pick<PaletteActions,
  | 'switchWorkspace'
  | 'workspaceFromTemplate'
  | 'beginCreateWorkspace'
  | 'beginRenameWorkspace'
  | 'deleteWorkspace'
  | 'movePanelsToWorkspace'
  | 'beginMovePanelsToNewWorkspace'
>

export function workspacesActions(ctx: ActionCtx): WorkspacesActions {
  const {
    registry, palette, panelsRef, switchWorkspace, movePanelsToWorkspace, reloadWorkspaces,
    setInputMode, self, intoNewWorkspace
  } = ctx
  return ({
    switchWorkspace,
    // M147. Three existing doors in order — workspace:create (named after the
    // template), the switch, then M80's instantiation in the new workspace.
    // A template with parameters asks its sheet FIRST (M80's rule: a hole is
    // asked, never guessed) and the three doors run on the sheet's Enter,
    // through the `into` seam beginSpawnSheet threads to the sheet's own
    // instantiate: the first cut minted and switched BEFORE the sheet, so an
    // Escape stranded the user in an empty workspace named after the template
    // (the 4.0 audit's `runs` scene; shell `workspace.template.2`).
    workspaceFromTemplate: (templateId) => {
      void window.canvas.template.list().then(async (templates) => {
        const template = allTemplates(templates).find((t) => t.id === templateId)
        if (template === undefined) return
        if (templateHoles(template).length > 0) { self.beginSpawnSheet(templateId, { intoNewWorkspace: true }); return }
        await intoNewWorkspace(template, {})
      })
    },
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
                  // disposed panels, resurrecting them there. The name is a
                  // fresh layout's (FRESH_WORKSPACE_NAME), not main's repair
                  // default, because this is a new workspace the person
                  // will see, not a file being repaired.
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
                    // M404 (C1). "Workspace", not "Canvas": Canvas is the center
                    // view's name, and a crumb reading it looked like the mode.
                    const freshId = await window.canvas.workspace.create(FRESH_WORKSPACE_NAME)
                    target = { id: freshId, name: FRESH_WORKSPACE_NAME, panelIds: [], active: false }
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
                    // M73. A chat's session is main's and the record is
                    // going, so it is disposed WITH its file — for every
                    // doomed id, since a hidden workspace's chat is not in
                    // panelsRef to be told apart: for any other kind this is
                    // a no-op in main (no session) and on disk (no file).
                    disposeChat(panelId, true); disposeWatcher(panelId); disposeRelayTerminal(panelId)
                    // M247. BEFORE the sessionless `continue` below: a file object is
                    // exactly what agent links point AT, so its links must go too.
                    forgetAgentLinksFor(panelId)
                    if (doomedSessionlessIds.has(panelId)) {
                      clearFileResult(panelId)
                      clearToolbox(panelId)
                      continue
                    }
                    registry.dispose(panelId)
                    clearAgentState(panelId)
                    clearLastLine(panelId)
                    clearLastActive(panelId)
                    clearLiveSession(panelId)
                    clearSubagents(panelId)
                    clearTrail(panelId)
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
    }
  })
}
