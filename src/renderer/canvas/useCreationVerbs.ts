import { type Dispatch, type RefObject, type SetStateAction, useCallback, useRef } from 'react'
import type { PaletteController } from '@renderer/palette/usePalette'
import { type PersistedGroup, GROUP_COLOURS } from '@shared/groups'
import type { AgentBackend } from '@shared/agent-session'
import type { AgentOptions } from '@shared/cost'
import type { EnvReport } from '@shared/env-report'
import type { ImportedNote } from '@shared/imported-note'
import type { InputMode } from '@renderer/palette/Palette'
import type { PaletteActions } from '@renderer/palette/commands'
import { type PersistedStarter, AGENT_KEY, STARTER_OBJECTS, STARTER_VERSION, starterKeysToApply } from '@shared/starter'
import { type PersistedTeammate, emptyTeammate } from '@shared/teammates'
import { type PersistedTemplate, BUILT_IN_TEMPLATES } from '@shared/templates'
import type { PresetTemplate, SpawnResult, WorkspaceRow } from '@shared/ipc-contract'
import type { PreviewBinding } from '@shared/preview'
import { makeFilePanel, makePanel, makeImagePanel, makeWorkflowPanel, makeWorkPanel, isBrowserPanel, isFilePanel, isChatPanel, nextZ, workCardItemId, type Panel, CHAT_W, CHAT_H, type ChatPanel } from '@renderer/panels/panels'
import { CREATABLE_OBJECTS, creationReason, type CreationHost, type CreationResult } from '@shared/verb-table'
import type { ChecklistView } from '@shared/checklist'
import { DECK_SEED, type DeckView } from '@shared/deck'
import type { SheetView } from '@shared/sheet'
import type { ToolGenerateResult } from '@shared/tool-spec'
import { RELAY_PROGRAM, RELAY_SESSION_ID } from '@shared/relay-protocol'
import { markDraftRead } from '@renderer/workflow/template-draft-store'
import { normaliseTypedUrl } from '@shared/browser-panel'
import { onboardingReadiness, firstWorkPlan, firstWorkRepoAnswer, folderTeammatePlan, LANE_ENGINE, type FirstWorkOutcome, type FirstWorkRequest } from '@shared/onboarding'
import { deliverToComposer } from '@renderer/chat/chat-store'
import { ANNOTATIONS_MAX, type Annotation } from '@shared/annotations'
import { WORK_ITEM_STATES, type PersistedWorkItem } from '@shared/work-items'
import type { BoardVerbs } from './useBoardVerbs'
import type { PlaceFn } from './place-new'
import type { Viewport, Point, WorldRect } from './viewport'
import { viewCentre } from './safe-area'
import { relayNameOf } from '../relay/relay-gate'

/**
 * M502 (E4, the Canvas.tsx split). The creation verbs: the starter canvas,
 * the create sheet's one door (createObject), the generated-tool arrival, and
 * the first-run work doors (startFirstWork, askWithoutFolder, chatInFolder).
 * Lifted out of Canvas VERBATIM as one contiguous run and called at exactly
 * the position it occupied, between onBrowserNavigated and
 * runWorkflowFromPlan, with one destructured Deps object so every dependency
 * array names the same values.
 */
export interface UseCreationVerbsDeps {
  addImageFromPath: (path: string, world?: Point) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  annotationSeq: RefObject<number>
  beginNewChat: (opts?: { cwd?: string; title?: string; agentOptions?: AgentOptions; appendSystemPrompt?: string; message?: string; backend?: AgentBackend; teammateId?: string; sandbox?: true; routine?: true; at?: Point; }) => Promise<SpawnResult>
  boardVerbsRef: RefObject<BoardVerbs>
  commitHistory: (next: Panel[]) => void
  envReportRef: RefObject<EnvReport | null>
  fitAll: () => void
  fitSelection: (rects: WorldRect[]) => void
  frameReadable: (rects: WorldRect[], focus?: WorldRect | undefined) => void
  hintsSeenRef: RefObject<ReadonlySet<string>>
  hostRef: RefObject<HTMLDivElement | null>
  mergedRef: RefObject<boolean>
  nextGroupIdRef: RefObject<number>
  nextIdRef: RefObject<number>
  noteRootRef: RefObject<string | null>
  onSpawn: (centre: Point, template?: PresetTemplate, opening?: { title?: string; context?: string; focus?: true; exact?: true; atCursor?: true; }) => void
  openBrowserPanel: (url: string, preview?: PreviewBinding, at?: Point) => void
  openFilePanel: (path: string, centre: Point, opts?: { prose?: true; checklist?: ChecklistView; imported?: ImportedNote; sheet?: SheetView; deck?: DeckView; exact?: true; }) => void
  openRelayPanel: (relay: { program: string; sessionId?: string; shareId?: string; }, at?: Point) => void
  openWorkflowPanel: (templateId: string, at?: Point) => void
  palette: PaletteController
  paletteActionsRef: RefObject<PaletteActions | null>
  panelsRef: RefObject<Panel[]>
  placer: (opts?: { quiet?: true; lit?: true; exact?: boolean; }) => PlaceFn
  reloadTeammates: () => void
  rosterNames: ReadonlyMap<string, string>
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>
  setClusterArrival: Dispatch<SetStateAction<boolean>>
  setDormantIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setFirstTask: Dispatch<SetStateAction<{ panelId: string; sent: boolean; itemId?: string | undefined; } | null>>
  setGroups: Dispatch<SetStateAction<PersistedGroup[]>>
  setInputMode: Dispatch<SetStateAction<InputMode | null>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setStarter: Dispatch<SetStateAction<PersistedStarter | undefined>>
  setTemplateRows: Dispatch<SetStateAction<PersistedTemplate[]>>
  starterRef: RefObject<PersistedStarter | undefined>
  teammatesRef: RefObject<PersistedTeammate[]>
  templateRowsRef: RefObject<PersistedTemplate[]>
  transitionRef: RefObject<boolean>
  viewportRef: RefObject<Viewport>
  workItemsRef: RefObject<PersistedWorkItem[]>
  workspaceRows: WorkspaceRow[]
  worldCentre: () => Point
}

export function useCreationVerbs(deps: UseCreationVerbsDeps) {
  const {
    addImageFromPath, annotationSeq, beginNewChat, boardVerbsRef, commitHistory, envReportRef, fitAll, fitSelection, frameReadable, hintsSeenRef, hostRef, mergedRef, nextGroupIdRef, nextIdRef, noteRootRef, onSpawn, openBrowserPanel, openFilePanel, openRelayPanel, openWorkflowPanel, palette, paletteActionsRef, panelsRef, placer, reloadTeammates, rosterNames, setAnnotations, setClusterArrival, setDormantIds, setFirstTask, setGroups, setInputMode, setPanels, setStarter, setTemplateRows, starterRef, teammatesRef, templateRowsRef, transitionRef, viewportRef, workItemsRef, workspaceRows, worldCentre
  } = deps
  /**
   * M181. THE STARTER CANVAS, laid out around the conversation. Idempotent
   * through the workspace's record: only keys never applied are minted, so a
   * canvas the person has edited is never overwritten and a closed example
   * stays closed. Every object goes through an ordinary path — the chat
   * through `beginNewChat` (it spawns on its first send), the terminal as a
   * DORMANT login-shell card (it wakes on the first click, M4b), the note as
   * a prose file panel over a real Markdown file main wrote once, the
   * workflow as M133's projection, the image as the fifteenth kind over the
   * PNG main wrote beside the note. The examples land in ONE history entry
   * after the chat's own; nothing spawns.
   */
  const applyStarter = useCallback(async (): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    // Every arm says what it decided on the console: a starter that quietly did
    // nothing is indistinguishable from a click that missed (the journey check).
    const say = (what: string): void => { console.info(`[starter] ${what}`) }
    if (mergedRef.current) { say('refused: merged'); return { kind: 'refused', reason: 'the merged view is read-only — leave it to open the starter canvas' } }
    const keys = starterKeysToApply(starterRef.current)
    if (keys.length === 0) { say('refused: every key applied'); return { kind: 'refused', reason: 'every starter object is already on this canvas — close what you do not need; a reset lays it out again' } }
    // A canvas with panels and NO record is the person's own arrangement:
    // the starter lays itself out on an empty canvas only (the primary's
    // door) and never over what is there (the critic's finding 6).
    if (starterRef.current === undefined && panelsRef.current.length > 0) { say('refused: canvas not empty'); return { kind: 'refused', reason: 'this canvas already has panels — the starter lays out on an empty canvas; reset the canvas or make a new workspace for it' } }
    const applied = [...(starterRef.current?.keys ?? [])]
    let origin: WorldRect | undefined = panelsRef.current.find((p): p is ChatPanel => isChatPanel(p))?.rect
    if (keys.includes(AGENT_KEY)) {
      const readiness = onboardingReadiness(envReportRef.current)
      if (readiness.preferred === undefined) { say('refused: no engine discovered'); return { kind: 'refused', reason: 'no conversation engine has been discovered — the starter canvas begins with an agent; install one and Check again' } }
      say(`minting the chat with ${readiness.preferred}`)
      // The chat is placed EXACTLY at the view's centre (`at`), so its rect is
      // known here without waiting for React to commit `beginNewChat`'s
      // setPanels: a frame wait never fired in a hidden window (the shot
      // harness) and a timer is not a commit guarantee (the critic, twice).
      const centre = worldCentre()
      const result = await beginNewChat({ backend: readiness.preferred, title: 'your agent', at: centre })
      if (result.kind === 'refused') { say(`chat refused: ${result.reason}`); return result }
      say(`chat ${result.id ?? '(no id)'} minted`)
      applied.push(AGENT_KEY)
      origin = { id: result.id ?? '', x: centre.x - CHAT_W / 2, y: centre.y - CHAT_H / 2, w: CHAT_W, h: CHAT_H }
    }
    const at: WorldRect = origin ?? { id: '', x: worldCentre().x - CHAT_W / 2, y: worldCentre().y - CHAT_H / 2, w: CHAT_W, h: CHAT_H }
    const wanted = STARTER_OBJECTS.filter((o) => keys.includes(o.key))
    let files: { notePath: string; imagePath: string } | undefined
    if (wanted.some((o) => o.kind === 'file' || o.kind === 'image')) {
      // A refusal after the chat was minted still RECORDS the chat's key: a second click must not mint a second conversation (idempotence, the critic's finding 5).
      try { files = await window.canvas.starter.prepare() } catch { setStarter({ version: STARTER_VERSION, keys: applied }); say('refused: starter files'); return { kind: 'refused', reason: 'the starter files could not be written under the app\'s own folder' } }
    }
    const minted: Panel[] = []
    const captions: Annotation[] = []
    const dormant: string[] = []
    for (const o of wanted) {
      const centre = { x: at.x + o.rect.dx + o.rect.w / 2, y: at.y + o.rect.dy + o.rect.h / 2 }
      const size = { w: o.rect.w, h: o.rect.h }
      const z = nextZ([...panelsRef.current, ...minted]) + 1
      let panel: Panel
      if (o.kind === 'terminal') { const id = `n${nextIdRef.current++}`; panel = { ...makePanel(id, centre, z, undefined, size), title: 'a terminal' }; dormant.push(id) }
      else if (o.kind === 'file') { panel = { ...makeFilePanel(`f${nextIdRef.current++}`, centre, z, { path: files!.notePath, prose: true }, size), title: 'a note' } }
      else if (o.kind === 'workflow') { const t = BUILT_IN_TEMPLATES[0]; const p = makeWorkflowPanel(`wf${nextIdRef.current++}`, centre, z, t.id, t.name); panel = { ...p, rect: { ...p.rect, x: centre.x - size.w / 2, y: centre.y - size.h / 2, w: size.w, h: size.h } } }
      else { const p = makeImagePanel(`im${nextIdRef.current++}`, centre, z, files!.imagePath, 'an image'); panel = { ...p, rect: { ...p.rect, x: centre.x - size.w / 2, y: centre.y - size.h / 2, w: size.w, h: size.h } } }
      minted.push(panel)
      captions.push({ id: `a${Date.now().toString(36)}${(annotationSeq.current++).toString(36)}`, text: o.caption, anchor: { kind: 'panel', panelId: panel.rect.id, dx: 0, dy: panel.rect.h + 22 } })
      applied.push(o.key)
    }
    if (minted.length > 0) {
      // A FUNCTIONAL update, never a value from the ref: the chat's own
      // setPanels is still queued at this point, and a value computed from
      // the ref would replace the array WITHOUT the chat (the act-close
      // visual run: four examples, no conversation).
      setPanels((current) => { const next = [...current, ...minted]; commitHistory(next); return next })
      if (dormant.length > 0) setDormantIds((current) => new Set([...current, ...dormant]))
      setAnnotations((current) => [...current, ...captions].slice(-ANNOTATIONS_MAX))
      const number = nextGroupIdRef.current++
      setGroups((current) => [...current, { id: `g${number}`, label: 'Examples', colour: GROUP_COLOURS[(number - 1) % GROUP_COLOURS.length], panelIds: minted.map((p) => p.rect.id) }])
      // The camera FITS the arrangement (M146's fit, which knows the visible
      // viewport with the inspector open): minted at the view's centre, the
      // chat sat on the right edge with every example off screen under the
      // minimap, and a pan alone left the column under the inspector.
      fitSelection([at, ...minted.map((p) => p.rect)])
    }
    setStarter({ version: STARTER_VERSION, keys: applied })
    say(`laid out ${minted.map((p) => p.rect.id).join(', ') || 'nothing new'}`)
    return { kind: 'ran', note: `${keys.length} starter object${keys.length === 1 ? '' : 's'} laid out` }
  }, [beginNewChat, commitHistory, worldCentre, fitSelection])

  // M248. The deck's view (slide on show, staged proposal) is a fact about the file, carried like the checklist's.
  const setDeckView = useCallback((id: string, view: DeckView) => {
    setPanels((current) => current.map((panel) => isFilePanel(panel) && panel.rect.id === id
      ? { ...panel, source: { ...panel.source, deck: view } } : panel))
  }, [])
  const setChecklistView = useCallback((id: string, view: ChecklistView) => {
    setPanels((current) => current.map((panel) => isFilePanel(panel) && panel.rect.id === id
      ? { ...panel, source: { ...panel.source, checklist: view } } : panel))
  }, [])
  // M252. What a described tool becomes on the canvas — and nothing it
  // becomes is RUN. A workflow is saved `reviewed: false`, so M190's refusal
  // names each action block until a person reads it; an app opens as a
  // preview whose binding is unread, so the pane makes no guest at all. The
  // note is returned, never `say()`d: say opens the palette (M149), and the
  // inert object on the canvas already says what it is.
  const arriveTool = useCallback(async (result: ToolGenerateResult, at: Point): Promise<CreationResult> => {
    if (result.kind === 'refused') return result
    const dropped = result.dropped.length === 0 ? '' : ` · ${result.dropped.length} part${result.dropped.length === 1 ? '' : 's'} of the answer left out: ${result.dropped.join('; ')}`
    if (result.kind === 'workflow') {
      const saved = await window.canvas.template.save(result.template)
      if (saved.kind !== 'saved') return { kind: 'refused', reason: saved.reason }
      const rows = await window.canvas.template.list()
      templateRowsRef.current = rows
      setTemplateRows(rows)
      openWorkflowPanel(saved.template.id, at)
      return { kind: 'ran', note: `${saved.template.name} arrived as a workflow — nothing has run; read its blocks, then choose "I've read this" to allow runs${dropped}` }
    }
    openBrowserPanel(result.url, { root: result.root, reviewed: false, tool: result.capabilities }, at)
    return { kind: 'ran', note: `${result.name} arrived in ${result.root} — nothing of it has run; read what it can reach, then choose "I've read this"${dropped}` }
  }, [openWorkflowPanel, openBrowserPanel])
  // M252. "I've read this" — a PERSON'S act, and deliberately NOT a verb: no
  // palette row, no agent line, no workflow node reaches either function
  // below (verify:verbs tool.door.1), so an agent cannot un-inert its own
  // answer — the shape of Mark reviewed on a review (M202). The workflow's
  // mark is cleared on the RECORD at the revision it was read at; a stale
  // save is refused and said, like any other.
  const markTemplateRead = useCallback(async (templateId: string): Promise<void> => {
    const template = templateRowsRef.current.find((t) => t.id === templateId)
    if (template === undefined) return
    let revision = template.revision ?? 0
    if (template.reviewed === false) {
      const read = { ...template }
      delete read.reviewed
      const saved = await window.canvas.template.save(read, template.revision)
      if (saved.kind !== 'saved') { paletteActionsRef.current?.say(saved.reason); return }
      revision = saved.template.revision ?? revision
      // The renderer's own copies change THE MOMENT the save lands, before the
      // list round-trip: a Run pressed in that gap read the unread row and was
      // refused (verify:panels tool.2, diagnosed by its own detail).
      templateRowsRef.current = templateRowsRef.current.map((t) => (t.id === templateId ? saved.template : t))
      markDraftRead(templateId, revision)
      const rows = await window.canvas.template.list()
      templateRowsRef.current = rows
      setTemplateRows(rows)
      return
    }
    // Run runs the DRAFT when there is one (M184): a record already read with
    // a draft still marked would leave every door refused.
    markDraftRead(templateId, revision)
  }, [])
  const markPreviewRead = useCallback((paneId: string): void => {
    setPanels((current) => current.map((panel) => {
      if (!isBrowserPanel(panel) || panel.rect.id !== paneId || panel.preview?.reviewed !== false) return panel
      const preview = { ...panel.preview }
      delete preview.reviewed
      return { ...panel, preview }
    }))
  }, [])
  // M250. The ONE writer of `reviewed: true` — a person's click on the note.
  const setImportReviewed = useCallback((id: string) => {
    setPanels((current) => current.map((panel) => isFilePanel(panel) && panel.rect.id === id && panel.source.imported !== undefined
      ? { ...panel, source: { ...panel.source, imported: { ...panel.source.imported, reviewed: true as const } } } : panel))
  }, [])
  // M245. Widths and loss consent, never cells — the file holds those.
  const setSheetView = useCallback((id: string, view: SheetView) => {
    setPanels((current) => current.map((panel) => isFilePanel(panel) && panel.rect.id === id
      ? { ...panel, source: { ...panel.source, sheet: view } } : panel))
  }, [])
  const creationWorkspaceRef = useRef<string | undefined>(undefined)
  creationWorkspaceRef.current = workspaceRows.find((w) => w.active)?.id
  // M338. The active workspace's share, for a relay session started in it.
  const creationShareRef = useRef<string | undefined>(undefined)
  creationShareRef.current = workspaceRows.find((w) => w.active)?.share?.id
  const relayNameFor = useCallback((userId: string): string => relayNameOf(rosterNames, userId), [rosterNames])
  const createObject = useCallback(async (kind: string, value?: string): Promise<CreationResult> => {
    const entry = CREATABLE_OBJECTS.find((item) => item.id === kind)
    if (!entry) return { kind: 'refused', reason: `unknown object kind: ${kind}` }
    const reason = creationReason(entry, { merged: mergedRef.current, noteRoot: noteRootRef.current })
    if (reason) return { kind: 'refused', reason }
    // Capture the workspace as well as the camera before an asynchronous chooser.
    // A late answer must not mint into another workspace after a switch.
    const workspace = creationWorkspaceRef.current
    const at = worldCentre()
    // M402 (B4). Every object Create makes goes through its door's own
    // placement — the one rule (placer), measured when it is placed, after any
    // chooser answered, inside the updater — so "+ Create" and ⌘K put the same
    // object in the same place. M395's `spotFor` did the free-spot search here,
    // over panelsRef OUTSIDE the updater, and only for authored objects.
    const current = (): boolean => creationWorkspaceRef.current === workspace && !mergedRef.current && !transitionRef.current
    const refused = (): CreationResult => ({ kind: 'refused', reason: 'the workspace changed — create the object again here' })
    const host: CreationHost = {
      terminal: async () => { onSpawn(at, { cwd: noteRootRef.current ?? '~', args: [] }, { focus: true }); return { kind: 'ran' } },
      agent: async () => {
        const readiness = onboardingReadiness(await window.canvas.env.report())
        if (!current()) return refused()
        if (!readiness.preferred) return { kind: 'refused', reason: 'no conversation engine is available — check readiness' }
        const result = await beginNewChat({ backend: readiness.preferred })
        return result.kind === 'refused' ? result : { kind: 'ran' }
      },
      document: async (view, name) => {
        const root = noteRootRef.current
        if (!root) return { kind: 'refused', reason: 'select a panel with a workspace folder first' }
        if (view === 'sheet') {
          // M245. A new sheet is an empty CSV. xlsx is opened, never minted: an
          // empty workbook is a file nobody asked for in a format they did not choose.
          const filename = name?.trim() || `sheets/sheet-${Date.now()}.csv`
          if (!/\.(csv|tsv)$/i.test(filename)) return { kind: 'refused', reason: 'choose a filename ending in .csv or .tsv' }
          const made = await window.canvas.file.create({ root, name: filename, seed: '' })
          if (made.kind !== 'created') return { kind: 'refused', reason: made.kind === 'exists' ? 'that file already exists — choose another filename' : made.detail }
          if (!current()) return { kind: 'refused', reason: `created ${made.path}; the workspace changed, so open the file there explicitly` }
          openFilePanel(made.path, worldCentre(), { sheet: {} })
          return { kind: 'ran' }
        }
        const checklist = view === 'checklist'
        const filename = name?.trim() || `notes/${view}-${Date.now()}.md`
        if (!/\.md$/i.test(filename)) return { kind: 'refused', reason: 'choose a Markdown filename ending in .md' }
        const seed = view === 'deck' ? DECK_SEED : `# ${checklist ? 'Checklist' : 'Note'}\n\n`
        const result = await window.canvas.file.create({ root, name: filename, seed })
        if (result.kind !== 'created') return { kind: 'refused', reason: result.kind === 'exists' ? 'that file already exists — choose another filename' : result.detail }
        if (!current()) return { kind: 'refused', reason: `created ${result.path}; the workspace changed, so open the file there explicitly` }
        openFilePanel(result.path, worldCentre(), view === 'deck' ? { deck: {} } : { prose: true, ...(checklist ? { checklist: { accepted: seed } } : {}) })
        return { kind: 'ran' }
      },
      image: async (path) => {
        const chosen = path ?? await window.canvas.asset.choose()
        if (!current()) return refused()
        if (!chosen) return { kind: 'refused', reason: 'no image chosen' }
        return addImageFromPath(chosen)
      },
      workflow: async () => {
        const result = await window.canvas.template.save({ name: 'New workflow', nodes: [], edges: [] })
        if (result.kind !== 'saved') return { kind: 'refused', reason: result.reason }
        if (!current()) return refused()
        const rows = await window.canvas.template.list()
        if (!current()) return refused()
        templateRowsRef.current = rows
        setTemplateRows(rows)
        openWorkflowPanel(result.template.id)
        return { kind: 'ran' }
      },
      browser: async (url) => {
        const parsed = normaliseTypedUrl(url ?? 'http://localhost:3000')
        if (parsed.kind === 'refused') return { kind: 'refused', reason: 'use an http(s) URL' }
        openBrowserPanel(parsed.url)
        return { kind: 'ran' }
      },
      relay: async (value) => {
        // Asked FIRST: a relay that is not set up, or a person not signed in,
        // is refused by name here rather than as a dead panel on the canvas.
        const listed = await window.canvas.relay.list()
        if (!current()) return refused()
        if (listed.kind === 'refused') return { kind: 'refused', reason: listed.reason }
        const typed = value?.trim() ?? ''
        const attach = /^attach\s+(\S+)$/.exec(typed)
        if (attach !== null) {
          const sessionId = attach[1]!
          if (!RELAY_SESSION_ID.test(sessionId)) return { kind: 'refused', reason: 'that is not a relay session id' }
          const meta = listed.sessions.find((s) => s.sessionId === sessionId)
          if (meta === undefined) return { kind: 'refused', reason: 'no session by that id that you may attach to — it may have ended' }
          openRelayPanel({ program: meta.program, sessionId, ...(meta.shareId === null ? {} : { shareId: meta.shareId }) })
          return { kind: 'ran' }
        }
        const program = typed === '' ? 'shell' : typed
        if (!RELAY_PROGRAM.test(program)) return { kind: 'refused', reason: 'name a program on the relay (like shell), or attach <session id>' }
        // A shared workspace's session is bound to its share, so its members
        // may attach by their role; an unshared one is the owner's alone.
        const shareId = creationShareRef.current
        openRelayPanel({ program, ...(shareId === undefined ? {} : { shareId }) })
        return { kind: 'ran' }
      },
      tool: async (description) => {
        const folder = noteRootRef.current
        if (!folder) return { kind: 'refused', reason: 'select a panel with a workspace folder first — a tool is made inside one' }
        const typed = description?.trim() ?? ''
        if (typed === '') {
          // The palette FIRST: input mode is cleared whenever the palette is
          // closed, so a prompt set on a closed palette would vanish unseen.
          palette.openPalette()
          setInputMode({ kind: 'text', label: 'Describe a tool — what should it do?', initial: '', submit: (said) => { setInputMode(null); if (said.trim() !== '') void createObject('tool', said) } })
          return { kind: 'ran' }
        }
        const result = await window.canvas.tool.generate({ description: typed, folder })
        if (!current()) return refused()
        return arriveTool(result, at)
      }
    }
    try { const result = await entry.create(host, value); if (result.kind === 'refused') paletteActionsRef.current?.say(result.reason); return result }
    catch (error) { const reason = `Could not create ${entry.label.toLowerCase()}: ${String(error)}`; paletteActionsRef.current?.say(reason); return { kind: 'refused', reason } }
  }, [worldCentre, onSpawn, beginNewChat, openFilePanel, addImageFromPath, openWorkflowPanel, openBrowserPanel, openRelayPanel, arriveTool, palette])
  /**
   * M205 (D09). THE FIRST START — the launcher's primary. A sentence and a
   * folder, run through D05's own executor (`startWork` → `dispatchWorkItem`),
   * so a new person starts through the same path a returning one does.
   *
   * The ORDER is the rule: the pure plan, then the repository question, and
   * only then any mint. `git:status` is read-only, so a folder that is not a
   * repository (or a machine with no git) refuses having minted nothing — no
   * teammate holding a grant for a start that never happened, no card.
   *
   * The teammate is REUSED when a standing one's place contains the folder;
   * otherwise one is minted whose only place is exactly that folder
   * (`firstWorkPlan`'s rules). Main's Places gate stays the authority.
   *
   * A retry of the same sentence in the same folder resumes the SAME item
   * (M198's recovery journal lives on it): the launcher stays up after a
   * refusal BEFORE any mint (`firstWorkPlan`'s own refusals, `not-a-repository`
   * — nothing named above is on the canvas yet, so there is nothing to show
   * but the launcher's own line), and a second press must not mint a twin
   * card. A refusal AFTER the mint (`startWork` itself failing) instead puts
   * the teammate's card on the canvas — the critic's "orphans" finding
   * (M205 2.5): without a panel, a real teammate and a real `todo` item would
   * sit invisibly in the store with only `dispatchWorkItemAttempt`'s own
   * `note` recording why, findable by nobody who does not go looking. The
   * card surfaces that same note and offers the same dispatch retry every
   * other work item already does, so this failure reads and recovers exactly
   * like any other rather than needing a launcher-only special case.
   */
  const firstWorkItemRef = useRef<{ key: string; itemId: string } | null>(null)
  /**
   * M400 (B1). THE REUSE-OR-MINT EXECUTOR for a folder — the launcher's, now
   * shared with every door of the New task sheet (`boardVerbs.teammateFor`),
   * so both answer "who works here?" with the same code. The ORDER is the
   * rule, unchanged from M205: the repository answer (`git:status`, read-only)
   * first, and only then a mint — so a folder that is not a repository, a
   * subfolder of one, or a machine with no git refuses having minted nothing.
   * The reuse is `folderTeammatePlan`'s path-segment containment; the mint's
   * only place is EXACTLY the folder. Main's Places gate stays the authority.
   */
  const teammateForFolder = useCallback(async (typed: string, prefer?: string, agent?: string): Promise<{ kind: 'teammate'; id: string; root: string } | { kind: 'refused' | 'not-a-repository'; reason: string }> => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    // M403. git's top level beside the status, so a symlinked folder is
    // granted and started as the directory git (and main's gate) works in.
    const [status, top] = await Promise.all([window.canvas.git.status(typed), typeof window.canvas.git.root === 'function' ? window.canvas.git.root(typed).catch(() => null) : Promise.resolve(null)])
    const repo = firstWorkRepoAnswer(status, typed, top)
    if (repo.kind !== 'repository') return repo
    const folder = repo.canonical ?? typed
    const plan = folderTeammatePlan(folder, teammatesRef.current, prefer, agent)
    if (plan.reuse !== undefined) return { kind: 'teammate', id: plan.reuse, root: folder }
    const id = `tm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    const saved = await window.canvas.teammate.save({ ...emptyTeammate(id, plan.mint.name), places: plan.mint.places })
    // The mirror is made current HERE: `dispatchWorkItem` → main reads the
    // roster by id, and the reload below lands a render later.
    teammatesRef.current = [...teammatesRef.current.filter((t) => t.id !== id), saved.teammate]
    reloadTeammates()
    return { kind: 'teammate', id, root: folder }
  }, [reloadTeammates])
  boardVerbsRef.current.teammateFor = teammateForFolder
  const startFirstWork = useCallback(async (req: FirstWorkRequest): Promise<FirstWorkOutcome> => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const plan = firstWorkPlan(req, { teammates: teammatesRef.current, readiness: onboardingReadiness(envReportRef.current) })
    if (plan.kind === 'refused') return { kind: 'refused', reason: plan.reason }
    // Codex-only: no lane, so no repository question — a conversation in the
    // folder needs no branch. Inserted, never sent (M80), like chatInFolder.
    if (plan.kind === 'chat') {
      const message = req.intention.trim()
      const r = await beginNewChat({ cwd: plan.folder, ...(plan.engine === LANE_ENGINE ? {} : { backend: plan.engine }), ...(message === '' ? {} : { message }) })
      if (r.kind === 'refused') return { kind: 'refused', reason: r.reason }
      if (r.id !== undefined && !hintsSeenRef.current.has('first-task')) setFirstTask({ panelId: r.id, sent: false })
      // The same one restrained arrival a task start gets (M262's flag, below):
      // every first start places its object the same way.
      setClusterArrival(true)
      window.setTimeout(() => setClusterArrival(false), 1200)
      return { kind: 'started' }
    }
    const actions = paletteActionsRef.current
    if (actions === null || actions === undefined) return { kind: 'refused', reason: 'the canvas is not ready yet' }
    // M400. The repository answer and the reuse-or-mint, in that order — the
    // same executor the New task sheet runs (`teammateForFolder`, above).
    const who = await teammateForFolder(plan.folder)
    if (who.kind !== 'teammate') return who
    const teammateId: string | undefined = who.id
    const key = `${plan.folder}\n${plan.title}`
    const standing = firstWorkItemRef.current?.key === key && workItemsRef.current.some((i) => i.id === firstWorkItemRef.current?.itemId) ? firstWorkItemRef.current.itemId : undefined
    const itemId = standing ?? actions.addWorkItem({ source: 'typed', title: plan.title, ...(plan.description === undefined ? {} : { description: plan.description }), state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] })
    firstWorkItemRef.current = { key, itemId }
    if (teammateId === undefined) return { kind: 'refused', reason: 'no teammate was chosen for this folder' }
    // M403. The folder git works in (a symlink's realpath), which is what the mint granted.
    const outcome = await actions.startWork(itemId, teammateId, who.root)
    if (outcome.kind !== 'started') {
      // The critic's finding (M205 2.5): a failure at THIS stage has already
      // minted a teammate and a work item — `dispatchWorkItemAttempt` already
      // wrote the reason into the item's own `note` — but with no panel
      // neither is visible, so if the launcher is later put away the two
      // records sit invisibly in the store, looking orphaned. A card makes
      // the failure and its retry findable: the note renders on it
      // (WorkNode's `data-work-note`) and `Start work again…` is the SAME
      // dispatch path a second press of Start work above already takes, so
      // there are two doors to one retry, never two retries. Guarded so a
      // second failed attempt at the same item never mints a twin card.
      const failedItem = workItemsRef.current.find((i) => i.id === itemId)
      if (failedItem !== undefined && !panelsRef.current.some((p) => workCardItemId(p) === itemId)) {
        const cardId = `k${nextIdRef.current++}`
        const centre = viewCentre(hostRef.current, viewportRef.current)
        const place = placer()
        setPanels((current) => { const next = [...current, place(current, makeWorkPanel(cardId, centre, nextZ(current), failedItem.id, failedItem.title))]; commitHistory(next); return next })
      }
      return { kind: 'refused', reason: outcome.reason }
    }
    // The keyboard follows the work: the sentence was SENT, so the next thing
    // a person types is the follow-up. An empty insert through the store's
    // own bus is what places the composer's caret (ChatNode's `insertAtCaret`
    // focuses) — the launcher that held focus has just unmounted, and without
    // this the keyboard lands on nothing.
    void deliverToComposer(outcome.panelId, '', { focus: true })
    // M262. The cluster arrival: framed once both have mounted (two frames —
    // the card and the chat land in separate commits), then the flag clears
    // so a later mint rises alone, as it always has.
    setClusterArrival(true)
    // The NEW task, not the whole canvas, at a scale its chat can be read at
    // (`fitReadable`): fitAll zoomed a lone card past 100% and a busy canvas
    // below reading size. Looked up at frame time — both have mounted by then.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const mine = panelsRef.current.filter((p) => p.rect.id === outcome.panelId || workCardItemId(p) === outcome.itemId)
      const chat = mine.find((p) => p.rect.id === outcome.panelId)
      if (mine.length === 0) fitAll(); else frameReadable(mine.map((p) => p.rect), chat?.rect)
    }))
    if (!hintsSeenRef.current.has('first-task')) setFirstTask({ panelId: outcome.panelId, sent: true, itemId: outcome.itemId })
    window.setTimeout(() => setClusterArrival(false), 1200)
    // A later start of the same words in the same folder is a NEW task: the
    // conversation this one made may be closed by then, and reusing its item
    // would fold the second start into the first (the M205 critic).
    firstWorkItemRef.current = null
    return { kind: 'started' }
  }, [teammateForFolder, fitAll, frameReadable, beginNewChat])
  /** M205. The ONE alternative: M120's no-folder conversation, on the engine readiness found, the sentence in its composer — inserted, never sent (M80). */
  const askWithoutFolder = useCallback((intention: string): void => {
    const preferred = onboardingReadiness(envReportRef.current).preferred
    if (preferred === undefined) return
    const message = intention.trim()
    void beginNewChat({ sandbox: true, ...(preferred === 'claude' ? {} : { backend: preferred }), ...(message === '' ? {} : { message }) })
      .then((r) => { if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) })
  }, [beginNewChat])
  /** M205. After `not-a-repository`: a conversation IN that folder. No lane (there is no branch to make), nothing sent. */
  const chatInFolder = useCallback((req: FirstWorkRequest): void => {
    const preferred = onboardingReadiness(envReportRef.current).preferred
    if (preferred === undefined) return
    const message = req.intention.trim()
    void beginNewChat({ cwd: req.folder.trim(), ...(preferred === 'claude' ? {} : { backend: preferred }), ...(message === '' ? {} : { message }) })
      .then((r) => { if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) })
  }, [beginNewChat])


  return { applyStarter, askWithoutFolder, chatInFolder, createObject, creationShareRef, markPreviewRead, markTemplateRead, relayNameFor, setChecklistView, setDeckView, setImportReviewed, setSheetView, startFirstWork }
}
