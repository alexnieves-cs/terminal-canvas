import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { ChecklistView } from '@shared/checklist'
import type { DeckView } from '@shared/deck'
import type { ImportedNote } from '@shared/imported-note'
import type { InputMode } from '@renderer/palette/Palette'
import type { PaletteActions } from '@renderer/palette/commands'
import { type Panel, makeRelayPanel, isRelayPanel, makeNotePanel, isNotePanel, isImagePanel, makeBrowserPanel, makeMemoryPanel, cascadeCentre, nextZ } from '@renderer/panels/panels'
import { type PersistedTemplate, allTemplates } from '@shared/templates'
import type { SheetView } from '@shared/sheet'
import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'
import { getDraft, selectedOf } from '@renderer/workflow/template-draft-store'
import { TEMPLATE_GONE } from '@renderer/workflow/WorkflowNode'
import type { PreviewBinding } from '@shared/preview'
import { displayPath } from '@shared/display-path'
import { buildFeedback, FEEDBACK_REPO } from '@shared/feedback'
import type { AgentPlanCaller } from '@shared/plan'
import { buildPortable, exportSentence, remapPortable, type parsePortable } from '@shared/portable'
import { NOTE_FORMS, NOTE_TINTS, isNoteForm, isNoteTint, noteSummary, normaliseNoteText } from '@shared/notes'
import { onboardingReadiness, FIRST_LAUNCH_ENGINES } from '@shared/onboarding'
import type { PlaceFn } from './place-new'
import type { Viewport, Point } from './viewport'
import { viewCentre } from './safe-area'
import type { PackPreviewState } from '../pack/PackPreview'

/**
M503. The object verbs (notes, memory, browser, relay, feedback, canvas and pack import/export, node runs, note text and tint), lifted out of Canvas.tsx at exactly this position. No behaviour change.
 */
export interface UseObjectVerbsDeps {
  commitHistory: (next: Panel[]) => void
  focusedIdRef: RefObject<string | null>
  hostRef: RefObject<HTMLDivElement | null>
  nextIdRef: RefObject<number>
  noteRootRef: RefObject<string | null>
  openFilePanel: (path: string, centre: Point, opts?: { prose?: true; checklist?: ChecklistView; imported?: ImportedNote; sheet?: SheetView; deck?: DeckView; exact?: true; }) => void
  palette: PaletteController
  paletteActionsRef: RefObject<PaletteActions | null>
  panelsRef: RefObject<Panel[]>
  placer: (opts?: { quiet?: true; lit?: true; exact?: boolean; }) => PlaceFn
  reloadPresets: () => void
  reloadTemplates: () => void
  reloadWorkspacesRef: RefObject<(() => void) | null>
  selectOnly: (id: string | null) => void
  setDormantIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setInputMode: Dispatch<SetStateAction<InputMode | null>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  switchWorkspace: (id: string) => Promise<boolean>
  templateRowsRef: RefObject<PersistedTemplate[]>
  viewportRef: RefObject<Viewport>
  worldCentre: () => Point
}

export function useObjectVerbs(deps: UseObjectVerbsDeps) {
  const {
    commitHistory, focusedIdRef, hostRef, nextIdRef, noteRootRef, openFilePanel, palette, paletteActionsRef, panelsRef, placer, reloadPresets, reloadTemplates, reloadWorkspacesRef, selectOnly, setDormantIds, setInputMode, setPanels, switchWorkspace, templateRowsRef, viewportRef, worldCentre
  } = deps
  const beginNewNote = useCallback(() => {
    const root = noteRootRef.current
    // The row is already disabled without a root; this is the second half of
    // the same rule, against a selection that changed while the palette was
    // open — the guard beginSavePrompt already keeps for its own list.
    if (root === null) return

    const stamp = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    // A date-stamped default, because the commonest note has no name the user
    // has thought of yet, and an empty field makes them invent one before
    // they can write anything down. Editable, obviously — it is a text field.
    const suggested = `notes/${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}.md`

    const prompt = (initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (name) => {
          // A blank submit is the same CANCEL a blank rename already is.
          if (name.trim() === '') { setInputMode(null); return }
          const seedTitle = name.trim().replace(/\.[^./]*$/, '').split('/').pop() ?? name.trim()
          void window.canvas.file
            .create({ root, name, seed: `# ${seedTitle}\n\n` })
            .then((res) => {
              if (res.kind === 'created') {
                setInputMode(null)
                openFilePanel(res.path, worldCentre(), { prose: true })
                return
              }
              // Every refusal re-prompts carrying the typed name, so the user
              // can correct it — InputMode's `feedback` exists precisely
              // because a placeholder only shows when the field is EMPTY,
              // which it never is on this path.
              const why =
                res.kind === 'exists' ? 'there is already a file with that name'
                  : res.detail
              prompt(name, `Couldn\u2019t create that note \u2014 ${why}`, true)
            })
            .catch((error: unknown) => {
              // Mandatory, for FileNode's reason: an unhandled rejection
              // leaves the input mode open forever with no explanation, which
              // reads as the app having frozen.
              prompt(name, `Couldn\u2019t create that note \u2014 ${String(error)}`, true)
            })
        }
      })
      // Palette.tsx closes the overlay BEFORE it runs a row's command AND
      // before it calls an input mode's submit, so without this the mode
      // would be set on a palette that is already gone and Canvas's own
      // clear-on-close effect would wipe it. The same pairing
      // beginRenamePreset, deletePreset and beginEditSetting all make — and
      // the reason every refusal branch below re-enters through `prompt`
      // rather than calling setInputMode on its own. Watched failing exactly
      // here: verify:panels 176 reported `stillInInput:false` with the
      // palette back in command mode, so a duplicate name silently did
      // nothing rather than saying the name was taken.
      palette.openPalette()
    }

    prompt(suggested, 'Name this note\u2026')
  }, [palette, openFilePanel, worldCentre])

  // Every verb the palette, top bar, rail and inspector share, lifted into
  // usePaletteActions.ts. Still ONE memoized object with the same dependency
  // array — Palette.tsx memoizes its command list on this prop's identity.
  /**
   * M83. The memory node for a panel's directory. The node carries the
   * DIRECTORY; main resolves it to the repository root on every read and
   * write (`memoryRoot` in `main/index.ts`), which is what keeps this door,
   * the chat's first-send context and `tc memory add` on one list. Doing the
   * resolution here instead would put a second resolver in the renderer and
   * the two would disagree only for panels below the root.
   */
  const openMemoryPanel = useCallback(async (): Promise<void> => {
    // The SAME directory the two doors are enabled from (`noteRoot`, the
    // SELECTED panel's, which every kind that has one supplies). Reading the
    // captured or focused panel instead — as the first version did — made the
    // enabling fact and the acting fact two different panels: a selected file
    // node lit the control and clicking it did nothing at all, and a terminal
    // focused in another repository opened THAT repository's memory under the
    // tree of this one. Both are silent (M83's verifier).
    const root = noteRootRef.current
    if (root === null) return
    const centre = viewCentre(hostRef.current, viewportRef.current)
    const memoryId = `m${nextIdRef.current++}`
    const place = placer()
    setPanels((current) => {
      const next = [...current, place(current, makeMemoryPanel(memoryId, centre, nextZ(current), { root }))]
      commitHistory(next)
      return next
    })
    selectOnly(memoryId)
  }, [commitHistory, selectOnly])

  /**
   * M103. Mint a browser panel at the world centre. The url is already
   * http(s) by the caller's rule (`normaliseTypedUrl`); the record holds
   * where the page OPENS, and every later navigation is written back onto it
   * through `onBrowserNavigated` so a relaunch returns to the last page.
   */
  const openBrowserPanel = useCallback((url: string, preview?: PreviewBinding, at?: Point): void => {
    const centre = viewCentre(hostRef.current, viewportRef.current)
    const browserId = `b${nextIdRef.current++}`
    const place = placer({ exact: at !== undefined })
    setPanels((current) => {
      const next = [...current, place(current, makeBrowserPanel(browserId, at ?? centre, nextZ(current), url, preview))]
      commitHistory(next)
      return next
    })
    selectOnly(browserId)
  }, [commitHistory, selectOnly])
  /** M338. A relay terminal at `at`: a fresh session of `program`, or an attach to a session the relay already has. */
  const openRelayPanel = useCallback((relay: { program: string; sessionId?: string; shareId?: string }, at?: Point): void => {
    const centre = viewCentre(hostRef.current, viewportRef.current)
    const relayId = `r${nextIdRef.current++}`
    const place = placer({ exact: at !== undefined })
    setPanels((current) => {
      const made = place(current, makeRelayPanel(relayId, at ?? centre, nextZ(current), relay))
      const next = [...current, relay.sessionId === undefined ? made : { ...made, relay: { ...made.relay, sessionId: relay.sessionId } }]
      commitHistory(next)
      return next
    })
    selectOnly(relayId)
  }, [commitHistory, selectOnly])
  /**
   * M338. The relay minted this panel's session (or it was forgotten, for a
   * new one): written to the record so a relaunch attaches instead of starting
   * a second process. Not an undo step — the person did nothing; the relay
   * answered — so the history is left alone, the rule a browser's navigation follows.
   */
  const setRelaySession = useCallback((panelId: string, sessionId: string | undefined): void => {
    setPanels((current) => current.map((p) => {
      if (p.rect.id !== panelId || !isRelayPanel(p) || p.relay.sessionId === sessionId) return p
      const { sessionId: _old, ...rest } = p.relay
      return { ...p, relay: sessionId === undefined ? rest : { ...rest, sessionId } }
    }))
  }, [])
  /**
   * M190. FEEDBACK — a DRAFT in the person's own browser, never a submission.
   * The facts are chosen by type (a version, a platform, engine words, panel
   * counts) and scrubbed; the draft says so; and the only thing that leaves
   * this app is a link the person opens, through the ONE `link:open` door.
   */
  // M192. The app's own version, learned once from main's update check (which
  // answers `app.getVersion()` in every arm) and used by the feedback draft
  // and the portable file's `app` field.
  const [appVersion, setAppVersion] = useState<string | null>(null)
  useEffect(() => { void window.canvas.update.check().then((r) => { if ('version' in r && typeof r.version === 'string') setAppVersion(r.version) }) }, [])
  const prepareFeedback = useCallback(async (says?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const report = await window.canvas.env.report()
    const counts = new Map<string, number>()
    for (const panel of panelsRef.current) counts.set(panel.kind, (counts.get(panel.kind) ?? 0) + 1)
    const draft = buildFeedback(FEEDBACK_REPO, {
      // The version comes from MAIN (`app.getVersion()`, through the update
      // check's own answer), never a literal in the renderer: a hardcoded
      // number is right for exactly one release and then quietly lies in
      // every bug report that carries it.
      version: appVersion ?? 'unknown',
      platform: 'macOS',
      engines: onboardingReadiness(report).rows.map((row) => ({ name: FIRST_LAUNCH_ENGINES[row.backend].name, state: row.discovery === 'unknown' ? 'unanswered' : row.discovery })),
      kinds: [...counts].map(([kind, count]) => ({ kind, count })),
      says: says ?? ''
    })
    const opened = await window.canvas.links.open({ panelId: focusedIdRef.current ?? 'canvas', target: draft.url })
    if (opened.kind === 'refused') return { kind: 'refused', reason: opened.reason ?? 'that link could not be opened' }
    return { kind: 'ran', note: `a draft in your browser · ${draft.redacted} secret${draft.redacted === 1 ? '' : 's'} scrubbed${draft.truncated ? ' · cut to fit a link' : ''} · nothing was sent` }
  }, [appVersion])

  /**
   * M189. EXPORT — the RENDERER builds the record, because the renderer is
   * the only side that knows what is on this canvas (M113's rule for the
   * board, reached again); main only writes the bytes. Pictures are omitted
   * unless the person asked for them, and the sentence says what travelled,
   * what was scrubbed and what was left out.
   */
  const exportCanvas = useCallback(async (path?: string, withPixels?: boolean): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const persisted = fromPanels(panelsRef.current)
    const images: { id: string; mediaType: string; base64: string }[] = []
    if (withPixels === true) {
      for (const panel of panelsRef.current) {
        if (!isImagePanel(panel) || panel.image.asset === undefined) continue
        const read = await window.canvas.image.read(panel.image.path)
        if (read.kind !== 'data') continue
        const comma = read.dataUrl.indexOf(',')
        images.push({ id: panel.image.asset, mediaType: read.mediaType, base64: read.dataUrl.slice(comma + 1) })
      }
    }
    const file = buildPortable({
      kind: 'canvas',
      workspaceName: (await window.canvas.workspace.list()).find((w) => w.active)?.name ?? 'canvas',
      panels: persisted,
      templates: templateRowsRef.current,
      app: appVersion ?? 'unknown',
      now: Date.now(),
      ...(images.length === 0 ? {} : { images }),
      ...((await window.canvas.routine.list()).length > 0 ? { hasRoutines: true } : {})
    })
    const written = await window.canvas.portable.write({ ...(path === undefined ? {} : { path }), file, suggested: `${file.workspace.name.replace(/[^a-zA-Z0-9-_ ]/g, '') || 'canvas'}.tccanvas` })
    if (written.kind === 'cancelled') return { kind: 'ran', note: 'nothing exported' }
    if (written.kind === 'refused') return { kind: 'refused', reason: written.reason }
    return { kind: 'ran', note: `${displayPath(written.path).short} · ${exportSentence(file)}` }
  }, [appVersion])
  /**
   * M189. IMPORT — a SEPARATE workspace, every id remapped, and nothing
   * started: no PTY is spawned, no chat session created, no watcher armed and
   * no routine scheduled, because the kinds that would do any of those cannot
   * travel at all (`travels`) and every panel arrives in its not-started
   * state, which is the state a persisted panel has always had.
   */
  const importCanvas = useCallback(async (path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const answer = await window.canvas.portable.read(path === undefined ? {} : { path })
    if (answer.kind === 'cancelled') return { kind: 'ran', note: 'nothing imported' }
    if (answer.kind === 'refused') return { kind: 'refused', reason: answer.reason }
    const parse = answer.parse as ReturnType<typeof parsePortable>
    if (parse.kind !== 'file') return { kind: 'refused', reason: parse.reason }
    const remapped = remapPortable(parse.file, (prefix) => `${prefix}i${nextIdRef.current++}`)
    const made = await window.canvas.workspace.create(`${remapped.workspace.name} (imported)`)
    if (made === null || made === undefined || made === '') return { kind: 'refused', reason: 'a new workspace could not be made for the import' }
    // The templates travel with it, each under its new id; a name collision is
    // a copy, never an overwrite of a workflow the person already had.
    // M190 (the critic, 2). An imported template is UNREVIEWED: its action
    // nodes hold verb lines somebody else wrote, and Run is refused by name
    // until a person has read them.
    for (const template of remapped.templates) await window.canvas.template.save({ ...template, reviewed: false })
    reloadTemplates()
    const switched = await switchWorkspace(made)
    reloadWorkspacesRef.current?.()
    if (!switched) return { kind: 'refused', reason: 'the new workspace could not be opened' }
    const next = toPanels(remapped.workspace.panels)
    // M189. EVERY imported panel is DORMANT, exactly as a restored one is
    // (the boot's own rule at `dormantIds`'s seed). Without this a terminal
    // panel added to the array is a NEW panel, and the tiering effect asks
    // `registry.ensure` for it without the dormant flag — which spawns a
    // process the person only asked to look at. The check counts the PTYs
    // across the whole import and requires the count not to move.
    setDormantIds((current) => new Set([...current, ...next.map((p) => p.rect.id)]))
    setPanels(() => {
      commitHistory(next)
      return next
    })
    const warned = parse.warnings.length === 0 ? '' : ` · ${parse.warnings.length} warning${parse.warnings.length === 1 ? '' : 's'}`
    return { kind: 'ran', note: `${remapped.workspace.panels.length} object${remapped.workspace.panels.length === 1 ? '' : 's'} into a new workspace · nothing was started${warned}` }
  }, [commitHistory, reloadTemplates, switchWorkspace])

  /**
   * M253. PACKS. Import READS: main parses, holds the parse under a token and
   * answers requirements, and this only SHOWS it — nothing is added until the
   * preview's Add sends that token back. Main does the adding (a pack's
   * objects are library records only main can mint ids for), so the renderer
   * never supplies a payload. Export is main-built for the same reason.
   */
  const [packPreview, setPackPreview] = useState<PackPreviewState | null>(null)
  const importPack = useCallback(async (path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const answer = await window.canvas.pack.read(path === undefined ? {} : { path })
    if (answer.kind === 'cancelled') return { kind: 'ran', note: 'nothing read' }
    if (answer.kind === 'refused') return { kind: 'refused', reason: answer.reason }
    if (answer.parse.kind !== 'pack') return { kind: 'refused', reason: answer.parse.reason }
    setPackPreview({ token: answer.token, path: answer.path, pack: answer.parse.pack, warnings: answer.parse.warnings, requirements: answer.requirements ?? { credentials: [], tools: [] } })
    return { kind: 'ran', note: `${answer.parse.pack.manifest.name} — nothing is added until you choose Add` }
  }, [])
  // M255. The sample dev-relations pack: main writes it once under userData
  // and answers the path; it is then READ like any pack — same preview, same
  // inert add — so the sample earns no door of its own past the file.
  const importSamplePack = useCallback(async (): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const sample = await window.canvas.pack.sample()
    if (sample.kind === 'refused') return { kind: 'refused', reason: sample.reason }
    return importPack(sample.path)
  }, [importPack])
  const addPack = useCallback(async (token: string) => {
    const added = await window.canvas.pack.add({ token })
    if (added.kind === 'added') { reloadTemplates(); reloadPresets() }
    return added
  }, [reloadTemplates, reloadPresets])
  const exportPack = useCallback(async (path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const name = (await window.canvas.workspace.list()).find((w) => w.active)?.name ?? 'pack'
    const written = await window.canvas.pack.write({ ...(path === undefined ? {} : { path }), name })
    if (written.kind === 'cancelled') return { kind: 'ran', note: 'nothing exported' }
    if (written.kind === 'refused') return { kind: 'refused', reason: written.reason }
    return { kind: 'ran', note: `${displayPath(written.path).short} · ${written.sentence}` }
  }, [])
  const markPresetRead = useCallback(async (id: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const changed = await window.canvas.preset.markReviewed(id)
    if (!changed) return { kind: 'refused', reason: 'that preset no longer exists' }
    reloadPresets()
    return { kind: 'ran', note: 'marked read — it will spawn now' }
  }, [reloadPresets])

  /**
   * M188. RUN ONE NODE — the ONE executor the workflow's own run, the
   * inspector's Test control and the `node-test` verb all take, so a node
   * cannot behave one way when a person tests it and another when the
   * workflow runs it.
   *
   * An `action` node runs its verb LINE through `runAgentPlan` — the same
   * function the agent door takes — so a destructive step still needs its
   * confirmation, an unbindable line is refused by name, and nothing here is
   * a second executor. A `http` node's GET is main's.
   */
  const runNodeNow = useCallback(async (node: { key?: string; kind: string; line?: string; url?: string; method?: string }, caller?: AgentPlanCaller, reviewed?: boolean): Promise<{ kind: 'ok'; output: string; ms: number } | { kind: 'failed'; reason: string; ms: number }> => {
    const started = Date.now()
    if (node.kind === 'action') {
      const line = node.line ?? ''
      // M190 (the critic, finding 2). A template that ARRIVED from a file is
      // unreviewed: its action nodes hold verb lines somebody else wrote, and
      // the import is inert only until the first Run. The person opens the
      // node, sees the line and marks it reviewed; until then it is refused
      // by name with the line quoted, so the refusal is also the review.
      if (reviewed === false) {
        return { kind: 'failed', reason: `this workflow came from outside this canvas (a file, or an agent's answer) and has not been read yet — open ${node.key ?? 'the block'} and confirm its line (${line.slice(0, 80)}) before running it`, ms: Date.now() - started }
      }
      // The CALLER travels with the line: without it a teammate's plan could
      // write a verb into a template and run it with its identity erased.
      const reply = await paletteActionsRef.current?.runAgentPlan(line, caller)
      if (reply === undefined) return { kind: 'failed', reason: 'the canvas is not ready to run a verb', ms: Date.now() - started }
      return reply.kind === 'ran'
        ? { kind: 'ok', output: reply.summary, ms: Date.now() - started }
        : { kind: 'failed', reason: reply.reason, ms: Date.now() - started }
    }
    if (node.kind === 'http') {
      const answer = await window.canvas.node.fetch({ url: node.url ?? '', ...(node.method === undefined ? {} : { method: node.method }) })
      if (answer.kind === 'refused') return { kind: 'failed', reason: answer.reason, ms: Date.now() - started }
      return { kind: 'ok', output: `${answer.status} · ${answer.note}${answer.truncated ? ' · cut' : ''}\n${answer.text.slice(0, 2000)}`, ms: answer.ms }
    }
    // Three states, never two: a kind with no runtime is not a failure of the
    // node, and saying "failed" about it would send a person looking for a
    // fault in a shape that is correct.
    return { kind: 'failed', reason: `a ${node.kind} node runs as part of the workflow, not on its own — Run the workflow to start it`, ms: Date.now() - started }
  }, [])
  const runNodeRef = useRef(runNodeNow)
  runNodeRef.current = runNodeNow
  /**
   * M188. Test this node: ONE node, with its input and its answer, running no
   * neighbour and recording no run. The subject is the SELECTED block of the
   * named template's draft — what the person is looking at.
   */
  const testNode = useCallback(async (templateId: string, key?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const template = getDraft(templateId)?.template ?? allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (template === undefined) return { kind: 'refused', reason: TEMPLATE_GONE }
    const chosenKey = key ?? selectedOf(templateId) ?? undefined
    if (chosenKey === undefined) return { kind: 'refused', reason: 'select a node on the diagram, or name one' }
    const node = template.nodes.find((n) => n.key === chosenKey)
    if (node === undefined) return { kind: 'refused', reason: `no node is called ${chosenKey}` }
    const outcome = await runNodeRef.current(node as { key?: string; kind: string; line?: string; url?: string; method?: string }, undefined, template.reviewed !== false)
    return outcome.kind === 'ok'
      ? { kind: 'ran', note: `${chosenKey} · ${outcome.ms} ms · ${outcome.output.split('\n')[0]?.slice(0, 120) ?? ''}` }
      : { kind: 'refused', reason: `${chosenKey} · ${outcome.ms} ms · ${outcome.reason}` }
  }, [])

  /**
   * M187. THE NOTE'S THREE VERBS. One record, three forms, and one door each:
   * add (the palette's rows and the agent's verb), set the text (the node's
   * own editor commits through here, so the canvas's history has one entry
   * per commit rather than one per keystroke), and tint (a sticky's alone).
   */
  const addNote = useCallback((form: string, text?: string, world?: Point): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    if (!isNoteForm(form)) return { kind: 'refused', reason: `${form} is not a note form — ${NOTE_FORMS.join(', ')}` }
    const at = world ?? viewCentre(hostRef.current, viewportRef.current)
    const noteId = `nt${nextIdRef.current++}`
    // M395. A sticky or a text with no place of its own lands in the FREE spot
    // nearest the view's centre (placement.ts's freeSpot), never on top of what
    // is there — the audit measured a new text over 53% of a sticky. A frame
    // keeps the centre: it goes BEHIND and is made to enclose what is there.
    // M402: through the one placement rule (placer), clear of groups the note is not in.
    const place = world === undefined && form !== 'frame' ? placer() : null
    setPanels((current) => {
      // A FRAME goes to the BACK: a region drawn over the objects it encloses
      // would cover them at the moment it is made, and the first thing a
      // person would have to do is send it backwards.
      const z = form === 'frame' ? Math.min(0, ...current.map((p) => p.z)) - 1 : nextZ(current)
      const next = [...current, place === null
        ? makeNotePanel(noteId, cascadeCentre(at, current), z, form, normaliseNoteText(text ?? ''))
        : place(current, makeNotePanel(noteId, at, z, form, normaliseNoteText(text ?? '')))]
      commitHistory(next)
      return next
    })
    selectOnly(noteId)
    return { kind: 'ran', note: `${form} note` }
  }, [commitHistory, selectOnly])
  const setNoteText = useCallback((panelId: string, text: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const target = panelsRef.current.find((p) => p.rect.id === panelId)
    if (target === undefined || !isNotePanel(target)) return { kind: 'refused', reason: 'that panel is not a note' }
    const next = normaliseNoteText(text)
    setPanels((current) => {
      const updated = current.map((p) => (p.rect.id === panelId && isNotePanel(p) ? { ...p, note: { ...p.note, text: next } } : p))
      commitHistory(updated)
      return updated
    })
    return { kind: 'ran', note: noteSummary(next, target.note.form) }
  }, [commitHistory])
  const setNoteTint = useCallback((panelId: string, tint: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const target = panelsRef.current.find((p) => p.rect.id === panelId)
    if (target === undefined || !isNotePanel(target)) return { kind: 'refused', reason: 'that panel is not a note' }
    if (!isNoteTint(tint)) return { kind: 'refused', reason: `${tint} is not a tint — ${NOTE_TINTS.join(', ')}` }
    if (target.note.form !== 'sticky') return { kind: 'refused', reason: 'only a sticky note carries a tint' }
    setPanels((current) => {
      const updated = current.map((p) => (p.rect.id === panelId && isNotePanel(p) ? { ...p, note: { ...p.note, tint } } : p))
      commitHistory(updated)
      return updated
    })
    return { kind: 'ran', note: `${tint} note` }
  }, [commitHistory])

  return { addNote, addPack, beginNewNote, exportCanvas, exportPack, importCanvas, importPack, importSamplePack, markPresetRead, openBrowserPanel, openMemoryPanel, openRelayPanel, packPreview, prepareFeedback, runNodeNow, runNodeRef, setNoteText, setNoteTint, setPackPreview, setRelaySession, testNode }
}
