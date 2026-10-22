import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Panel, isTerminalPanel } from '@renderer/panels/panels'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { PresetRow, PromptRow } from '@renderer/palette/commands'
import { getLiveSession } from '@renderer/session/live-session-store'
import type { SettingRow, WorkspaceRow, WorktreeListRow } from '@shared/ipc-contract'
import type { CredentialMeta } from '@shared/credential-schema'
import type { PersistedTemplate } from '@shared/templates'
import { EMPTY_CREDENTIALS, EMPTY_PROMPTS, EMPTY_WORKTREES, EMPTY_SETTINGS, EMPTY_WORKSPACES } from './canvas-constants'
import { useAccounts } from '../account/useAccounts'

/**
 * M507 (E4, the Canvas.tsx split). The rows main owns and the renderer lists:
 * the saved templates (M80) and their reload after a save (M182), the worktree
 * list (M37), who is signed in (M336), the credentials and workspaces, and
 * whether the attention jump has somewhere to land (M429). Lifted out of
 * Canvas VERBATIM as one contiguous run and called at exactly the position it
 * occupied, just below the routine fire listener (which stays in Canvas
 * because it reads beginNewChatRef, declared further down).
 */
export interface UseMainRowsDeps {
  attentionJumpRef: RefObject<(panelId: string) => void>
  displayPanels: Panel[]
  displayPanelsRef: RefObject<Panel[]>
  jumpToAttention: (panelId: string) => void
  palette: PaletteController
  panelsRef: RefObject<Panel[]>
  reloadWorkspacesRef: RefObject<(() => void) | null>
  setPresetRows: Dispatch<SetStateAction<PresetRow[]>>
  switchWorkspace: (id: string) => Promise<boolean>
}

export function useMainRows(deps: UseMainRowsDeps) {
  const {
    attentionJumpRef, displayPanels, displayPanelsRef, jumpToAttention, palette, panelsRef, reloadWorkspacesRef, setPresetRows, switchWorkspace
  } = deps
  // M80. The saved shapes of work, for the palette's rows (the sheet asks main
  // itself when it opens, so a template saved while the palette is shut is
  // offered the moment the sheet opens either way).
  const [templateRows, setTemplateRows] = useState<PersistedTemplate[]>([])
  // M133's verbs are read from refs at CALL time, the rule every verb in this
  // file obeys: the user can save or delete a template between opening the
  // palette and running the row.
  const templateRowsRef = useRef<PersistedTemplate[]>([])
  templateRowsRef.current = templateRows
  // M182. Reloaded after every save through the binding's Update: a second
  // Update with the rows read at mount would always expect the old revision.
  const reloadTemplates = useCallback(() => { void window.canvas.template.list().then(setTemplateRows) }, [])
  useEffect(() => { reloadTemplates() }, [reloadTemplates])
  const reloadPresets = useCallback(() => {
    void window.canvas.preset.list().then(setPresetRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadPresets()
  }, [palette.open, reloadPresets])
  // The top bar names the default preset, so the list must exist before the
  // palette has ever been opened — the bar renders on the first paint and the
  // user may never press Cmd+K at all. The palette-open reload above STAYS:
  // this one runs once, and it is the reopen that keeps the rows fresh after
  // a rename, a delete or a change of default.
  useEffect(() => { reloadPresets() }, [reloadPresets])

  // The prompt list, reloaded whenever the palette opens — and whenever the
  // panel it captured changes, because a project's prompts are its own
  // directory's and two panels are rarely in the same one.
  const [promptRows, setPromptRows] = useState<PromptRow[]>(EMPTY_PROMPTS)
  // Bodies are deliberately NOT in the row type the palette renders:
  // buildCommands has no use for a paragraph, and putting one in a list row's
  // props means re-rendering the whole list whenever a prompt file changes.
  const promptBodiesRef = useRef(new Map<string, string>())
  const reloadPrompts = useCallback((capturedId: string | null) => {
    const panel = capturedId ? panelsRef.current.find((p) => p.rect.id === capturedId) : undefined
    // Where the panel IS, falling back to where it was spawned.
    //
    // The fallback is the asymmetry this milestone states once and obeys twice:
    // DISPLAY renders nothing without a live answer, because a spawn-time value
    // under a present-tense label is indistinguishable from a correct one — but
    // a CONSUMER needs a directory, and the spawn cwd is exactly what it used
    // before this milestone, so falling back here is never worse than not
    // shipping. A review node has no cwd of its own and still lists the saved
    // prompts alone, and so does a file panel — the path it names is a FILE,
    // and handing a file to prompt.list as though it were a directory would
    // read the wrong project's commands or none at all.
    const cwd = panel !== undefined && isTerminalPanel(panel)
      ? (getLiveSession(panel.rect.id)?.cwd ?? panel.spec.cwd)
      : null
    void window.canvas.prompt.list(cwd).then((rows) => {
      promptBodiesRef.current = new Map(rows.map((r) => [r.id, r.body]))
      setPromptRows(rows.map(({ id, name, source }) => ({ id, name, source })))
    })
  }, [])
  useEffect(() => {
    if (palette.open) reloadPrompts(palette.capturedId)
  }, [palette.open, palette.capturedId, reloadPrompts])

  // The settings list, reloaded whenever the palette opens — main owns the
  // store, so the row list always reflects what it actually holds rather than
  // whatever the palette last rendered.
  const [settingRows, setSettingRows] = useState<SettingRow[]>(EMPTY_SETTINGS)
  const reloadSettings = useCallback(() => {
    void window.canvas.settings.list().then(setSettingRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadSettings()
  }, [palette.open, reloadSettings])

  // Credential metadata, reloaded on palette open ONLY — the same shape as
  // reloadSettings immediately above, and deliberately not also on mount the
  // way reloadPresets is: nothing outside the palette reads this list, so
  // there is no top-bar-shaped reason to have it ready before a first Cmd+K.
  // That absence is also what keeps credential:list off the boot path —
  // scripts/verify-canvas.cjs's registerIpcHandlers wiring has no credential
  // store to answer it, and firing this at mount would surface as an
  // unrelated-looking canvas failure that points nowhere near this feature.
  const [credentialRows, setCredentialRows] = useState<CredentialMeta[]>(EMPTY_CREDENTIALS)
  const reloadCredentials = useCallback(() => {
    void window.canvas.credential.list().then(setCredentialRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadCredentials()
  }, [palette.open, reloadCredentials])
  // M37. The worktree list, for the same reason and on the same trigger as
  // credentials: main owns the records, the palette is the only reader, and
  // reading at mount would surface a failure nowhere near this feature.
  const [worktreeRows, setWorktreeRows] = useState<WorktreeListRow[]>(EMPTY_WORKTREES)
  const worktreeEpochRef = useRef(0)
  const reloadWorktrees = useCallback(() => {
    // M86. Each row carries where its branch stands against its tracking ref,
    // read per worktree from the LOCAL ref — a fetch is never run, and the
    // phrase says so. A row whose status could not be read keeps no phrase
    // rather than a wrong one.
    // Rows land at once and the phrases enrich them after; an older reload
    // settling after a newer one is dropped, or a removed worktree could
    // reappear (M86's verifier).
    const epoch = ++worktreeEpochRef.current
    void window.canvas.worktree.list().then(async (rows) => {
      if (epoch !== worktreeEpochRef.current) return
      setWorktreeRows(rows)
      const withStatus = await Promise.all(rows.map(async (row) => {
        try {
          const s = await window.canvas.git.status(row.path)
          if (s.kind !== 'status') return row
          const phrase = s.upstream === null ? `${s.branch} · no upstream` : `${s.branch} · ahead ${s.upstream.ahead} · behind ${s.upstream.behind}`
          return { ...row, status: phrase }
        } catch { return row }
      }))
      if (epoch !== worktreeEpochRef.current) return
      setWorktreeRows(withStatus)
    })
  }, [])
  useEffect(() => {
    if (palette.open) reloadWorktrees()
  }, [palette.open, reloadWorktrees])

  // The workspace list, reloaded after every mutation the palette's own
  // create/rename/delete commands drive below — the same "main is the only
  // side that knows what the store now says" rule reloadPresets/
  // reloadPrompts/reloadSettings already follow. It also reloads on mount
  // and on every palette open, the same two occasions the sibling lists
  // reload on below, and every row that needs `attentionIds` reads it from
  // this same state and loader rather than a second one.
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceRow[]>(EMPTY_WORKSPACES)
  // M336. Who is signed in, the active one first; the top bar's account menu
  // and M337's share dialog read the same hook, kept live by auth:changed.
  const accounts = useAccounts()
  /**
   * Which workspaces EXIST, as a value that only changes when one of them
   * does — the merged refetch's dep, and see that effect for what a stale
   * lane costs.
   *
   * Derived rather than read off the array because reloadWorkspaces() hands
   * back a fresh array of fresh objects every time it runs, including on
   * every panels.length change, so the array identity is not evidence that
   * anything moved. JSON.stringify rather than a join for the reason
   * railSignature gives: a workspace NAME is user text, and a separator a
   * name is free to contain lets two different lists collapse to one string
   * — here that means a rename that goes unnoticed and a lane left showing
   * the old name, for the users whose names contain the delimiter and nobody
   * else.
   *
   * panelIds is deliberately NOT in it: it changes on every spawn and close,
   * which panels.length already covers one dep along.
   *
   * NOT rail-sections' own `workspaceSignature`, which this file already
   * imports and uses for the rail's frozen rows: that one folds in each
   * workspace's WAITING COUNT, so it moves on every bell — and a bell must
   * not fire an IPC round trip and a re-tier of every lane. Two signatures
   * over the same rows, answering two different questions.
   */
  const workspaceListSignature = useMemo(
    () => JSON.stringify(workspaceRows.map((w) => [w.id, w.name, w.active])),
    [workspaceRows]
  )
  const reloadWorkspaces = useCallback(() => {
    // Rejection handled rather than voided. void-ing the chain silences the
    // lint, not the failure, and M8d raised what a swallowed one costs: before
    // the rail, a failed reload meant missing rows in a surface that reloads on
    // every open, so the next Cmd+K repaired it. Now it leaves an always-mounted
    // Workspaces section stuck on whatever it last had — at mount, on nothing at
    // all — with no console line naming the reason.
    void window.canvas.workspace.list().then(setWorkspaceRows, (error: unknown) => {
      console.warn('[workspace] could not list workspaces', error)
    })
  }, [])
  // Mount (so the first Cmd+K sees real rows even if no mutation has run
  // yet) and every palette open (so a workspace mutated while the palette
  // was closed still shows up) — the two occasions reloadPresets/
  // reloadSettings already cover for their own lists. Deliberately NOT a
  // dependency of any agent-state effect: the ROWS change rarely, while the
  // waiting COUNT is derived live below from attentionIds, so a bell must
  // not reload this list on every agent:state message.
  useEffect(() => { reloadWorkspaces() }, [reloadWorkspaces])
  // Keeps reloadWorkspacesRef current for switchWorkspace, declared earlier
  // in this component — see that ref's own comment for why.
  useEffect(() => { reloadWorkspacesRef.current = reloadWorkspaces }, [reloadWorkspaces])

  /**
   * D17 / 4.4. Go to a waiting panel WHEREVER it lives: on this canvas, the
   * notification click's own landing; in a hidden workspace, the existing
   * activation first, then the same landing once that canvas has rendered.
   * The landing waits on `displayPanels` holding the id rather than on the
   * switch's promise, because the promise resolves before React has
   * committed the incoming panels, and goToPanel on an id not yet rendered
   * frames nothing. A refused switch (another transition in flight) drops
   * the jump — the same answer a second press gets from Cmd+J.
   */
  const pendingJumpRef = useRef<string | null>(null)
  const jumpAnywhere = useCallback((panelId: string) => {
    if (displayPanelsRef.current.some((p) => p.rect.id === panelId)) { jumpToAttention(panelId); return }
    const owner = workspaceRows.find((w) => !w.active && w.panelIds.includes(panelId))
    if (owner === undefined) return
    pendingJumpRef.current = panelId
    void switchWorkspace(owner.id).then((ok) => { if (!ok) pendingJumpRef.current = null })
  }, [workspaceRows, switchWorkspace, jumpToAttention])
  useEffect(() => { attentionJumpRef.current = jumpAnywhere }, [jumpAnywhere])
  // M429. Whether jumpAnywhere has somewhere to land — its own two cases,
  // asked before the world room closes for it (it drops an id it cannot place,
  // silently, and the room would have closed onto an unchanged canvas).
  const canJumpAnywhere = useCallback((panelId: string): boolean =>
    displayPanelsRef.current.some((p) => p.rect.id === panelId) || workspaceRows.some((w) => !w.active && w.panelIds.includes(panelId)),
  [workspaceRows])
  useEffect(() => {
    const id = pendingJumpRef.current
    if (id === null || !displayPanels.some((p) => p.rect.id === id)) return
    pendingJumpRef.current = null
    jumpToAttention(id)
  }, [displayPanels, jumpToAttention])

  return { accounts, canJumpAnywhere, credentialRows, jumpAnywhere, promptBodiesRef, promptRows, reloadCredentials, reloadPresets, reloadPrompts, reloadSettings, reloadTemplates, reloadWorkspaces, reloadWorktrees, setTemplateRows, settingRows, templateRows, templateRowsRef, workspaceListSignature, workspaceRows, worktreeRows }
}
