import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef } from 'react'
import type { AgentBackend } from '@shared/agent-session'
import type { AgentOptions } from '@shared/cost'
import type { InputMode } from '@renderer/palette/Palette'
import { type PaletteActions, type PresetRow, claudeAvailable } from '@renderer/palette/commands'
import { type Panel, makeWorkflowPanel, isWorkflowPanel, makeWatcherPanel, isWatcherPanel, isChatPanel, nextZ } from '@renderer/panels/panels'
import type { PersistedRun } from '@shared/layout-schema'
import { type PersistedTemplate, allTemplates, isBuiltInTemplate } from '@shared/templates'
import type { SpawnResult } from '@shared/ipc-contract'
import { workflowWatch, workflowFireRefusal, runsForTemplate } from '@renderer/workflow/workflow-diagram'
import { setDisarmed, clearDisarmed } from '@renderer/watcher/watcher-store'
import { setWatcherFiredHandler } from '@renderer/watcher/useWatchers'
import { blockCount } from '@shared/workflow-nodes'
import { clearDraft, getDraft, resetDraft } from '@renderer/workflow/template-draft-store'
import { getPool } from '@renderer/workflow/pool-store'
import { REASON_NOTHING_RUNNING } from '@renderer/workflow/WorkflowNode'
import type { AgentPlanCaller } from '@shared/plan'
import { parseTriggerWords } from '@renderer/watcher/trigger-input'
import { templateHoles, templateRefusal } from '@renderer/palette/template-model'
import type { PlaceFn } from './place-new'
import type { Viewport, Point } from './viewport'
import { viewCentre } from './safe-area'

/**
 * M500 (E4, the Canvas.tsx split). The workflow panel's verbs (M133 onward),
 * lifted out of Canvas VERBATIM as one contiguous run and called at exactly
 * the position it occupied, between beginWatcher and beginNewNote. Every
 * value it reads from Canvas is a dependency named here, destructured on
 * entry, so each dependency array names the same values it did.
 */
export interface UseWorkflowVerbsDeps {
  beginNewChatRef: RefObject<(opts?: { cwd?: string | undefined; title?: string | undefined; agentOptions?: AgentOptions | undefined; appendSystemPrompt?: string | undefined; message?: string | undefined; backend?: AgentBackend | undefined; teammateId?: string | undefined; sandbox?: true | undefined; routine?: true | undefined; } | undefined) => Promise<SpawnResult>>
  commitHistory: (next: Panel[]) => void
  hostRef: RefObject<HTMLDivElement | null>
  instantiateTemplateRef: RefObject<(template: PersistedTemplate, values: Record<string, string>, caller?: AgentPlanCaller | undefined) => Promise<SpawnResult>>
  mergedRef: RefObject<boolean>
  nextIdRef: RefObject<number>
  paletteActionsRef: RefObject<PaletteActions | null>
  panelsRef: RefObject<Panel[]>
  placer: (opts?: { quiet?: true; lit?: true; exact?: boolean; }) => PlaceFn
  presetRowsRef: RefObject<PresetRow[]>
  reloadTemplates: () => void
  runsRef: RefObject<PersistedRun[]>
  selectOnly: (id: string | null) => void
  setInputMode: Dispatch<SetStateAction<InputMode | null>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setTemplateRows: Dispatch<SetStateAction<PersistedTemplate[]>>
  stopPool: (templateId: string, key: string) => void
  templateRowsRef: RefObject<PersistedTemplate[]>
  viewportRef: RefObject<Viewport>
}

export function useWorkflowVerbs(deps: UseWorkflowVerbsDeps) {
  const {
    beginNewChatRef, commitHistory, hostRef, instantiateTemplateRef, mergedRef, nextIdRef, paletteActionsRef, panelsRef, placer, presetRowsRef, reloadTemplates, runsRef, selectOnly, setInputMode, setPanels, setTemplateRows, stopPool, templateRowsRef, viewportRef
  } = deps
  /**
   * M133. THE WORKFLOW PANEL'S FOUR VERBS, all of them doors that already
   * existed — which is the milestone's claim: no new IPC, no new writer, no
   * new trust boundary.
   *
   *  - open  : a sessionless panel carrying the template's ID alone.
   *  - run   : M80's OWN `instantiateTemplate`, through the ref every other
   *            caller uses. Never a second copy (`workflow.panel.1e`).
   *  - trigger: a WATCHER on this template — `shared/watch-trigger.ts`
   *            unchanged and main's existing arming, asked with the same
   *            words `beginWatcher` asks them in.
   *  - build : §4.1's chat door, pointed at a template file. The message is
   *            INSERTED into the composer, never sent.
   */
  const openWorkflowPanel = useCallback((templateId: string, at?: Point) => {
    if (mergedRef.current) return
    const template = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    const centre = viewCentre(hostRef.current, viewportRef.current)
    const id = `wf${nextIdRef.current++}`
    const place = placer({ exact: at !== undefined })
    setPanels((current) => {
      const next = [...current, place(current, makeWorkflowPanel(id, at ?? centre, nextZ(current), templateId, template?.name ?? templateId))]
      commitHistory(next)
      return next
    })
    selectOnly(id)
  }, [commitHistory, selectOnly])

  // M246. `caller` is who started the run: an agent through `tc plan workflow-run`
  // (its identity rides into every action node), or absent for a person's Run and
  // for a timer's fire (a template a person authored and reviewed).
  const runWorkflow = useCallback((templateId: string, source: 'click' | 'fire' = 'click', caller?: AgentPlanCaller): string | undefined => {
    // M184. The DRAFT is what runs when there is one: what the person sees on
    // the diagram is what the Run button starts. The snapshot the run records
    // below is this same shape, so its outcomes never move under a later edit.
    const template = getDraft(templateId)?.template ?? allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (template === undefined) return 'not run: that template is no longer saved'
    // A template with parameters cannot run unasked. On the CLICK path the
    // sheet is where a person answers them. On the FIRE path there is nobody
    // to answer: a 3am timer would leave a modal over an empty canvas while
    // the watcher recorded a success, so it is refused BY NAME and mints
    // nothing (`workflowFireRefusal`).
    const holes = templateHoles(template)
    if (holes.length > 0) {
      if (source === 'fire') return workflowFireRefusal(holes)
      paletteActionsRef.current?.beginSpawnSheet(templateId)
      return undefined
    }
    // M137. The same refusal Run's door shows (a block that cannot run yet, a
    // missing preset, a cycle), consulted HERE so the fire path returns it —
    // `instantiateTemplate` refuses the same shapes silently, which left a
    // watcher recording a success per tick while minting nothing.
    const refusal = templateRefusal(template, presetRowsRef.current, claudeAvailable(presetRowsRef.current))
    if (refusal !== undefined) return `not run: ${refusal}`
    void instantiateTemplateRef.current(template, {}, caller)
    return undefined
  }, [])

  // Read through a ref by the fired handler, which is installed once.
  const runWorkflowRef = useRef(runWorkflow)
  runWorkflowRef.current = runWorkflow

  const beginWorkflowTrigger = useCallback((templateId: string) => {
    const template = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (template === undefined) return
    // The watcher's directory is the template's FIRST node's — the one
    // directory the shape already names. `~` when it has none.
    const root = template.nodes[0]?.cwd ?? '~'
    const ask = (initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (answer) => {
          const text = answer.trim()
          if (text === '') { setInputMode(null); return }
          const trigger = parseTriggerWords(text, root, undefined)
          if (trigger === null) { ask(text, 'Try: a path, `every 10m`, or `branch`', true); return }
          setInputMode(null)
          const centre = viewCentre(hostRef.current, viewportRef.current)
          const watcherId = `w${nextIdRef.current++}`
          const place = placer()
          setPanels((current) => {
            const next = [...current, place(current, makeWatcherPanel(watcherId, centre, nextZ(current), {
              ...workflowWatch(templateId, root, trigger)
            }))]
            commitHistory(next)
            return next
          })
          selectOnly(watcherId)
        }
      })
    }
    ask('src', `When should ${template.name} run? a path to watch, \`every 10m\`, or \`branch\``)
  }, [commitHistory, selectOnly])

  const buildWorkflowWithAi = useCallback((templateId: string) => {
    const template = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (template === undefined) return
    const root = template.nodes[0]?.cwd ?? '~'
    void beginNewChatRef.current({
      cwd: root,
      title: `build ${template.name}`,
      // Named, not pasted: the chat is told WHERE the template lives and what
      // shape it has, and reads it with its own tools. This app writes no
      // template on an agent's behalf.
      message: `The workflow "${template.name}" (id ${template.id}) is saved in this app's layout file, under the top-level \`templates\` array: each entry is { id, name, description?, nodes[], edges[] }, a node is { key, kind: 'terminal' | 'chat' | 'pool' | 'orchestrator' | 'collect', cwd, dx, dy, ... }, and an edge is { from, to, trigger: 'exit' | 'exit-ok' | 'exit-fail' | 'idle' | 'always' }. It has ${blockCount(template)} blocks today. What should it do differently?`
    })
  }, [])

  /**
   * M133. A WORKFLOW TRIGGER firing. Main armed and ran the watcher exactly
   * as it does every other one; what a workflow watcher's fire MEANS is the
   * renderer's, because only the renderer can mint panels. This is the whole
   * of the "no second scheduler" claim: one subscription, one arming, one
   * table of triggers.
   */
  useEffect(() => {
    setWatcherFiredHandler((watcherId) => {
      const panel = panelsRef.current.find((p) => p.rect.id === watcherId)
      if (panel === undefined || !isWatcherPanel(panel)) return
      const templateId = panel.watch.templateId
      if (templateId === undefined) return
      // A refusal is SAID, on the watcher's own body, rather than swallowed:
      // a trigger that fired and did nothing with no sentence anywhere is the
      // silent failure this whole file is written against.
      const refused = runWorkflowRef.current(templateId, 'fire')
      if (refused !== undefined) setDisarmed(watcherId, refused)
      else clearDisarmed(watcherId)
    })
    return () => setWatcherFiredHandler(null)
  }, [panelsRef])

  /**
   * M184. SAVE THE DRAFT. The revision the draft was READ at is the
   * expectation, so a record saved by anyone else in between is refused as
   * stale with the draft kept — the panel offers Reload and Save a copy.
   * A built-in never reaches here (the panel offers only the copy).
   */
  const saveWorkflowDraft = useCallback(async (templateId: string): Promise<{ kind: 'saved' } | { kind: 'stale'; reason: string } | { kind: 'refused'; reason: string }> => {
    const draft = getDraft(templateId)
    if (draft === undefined || !draft.dirty) return { kind: 'refused', reason: 'nothing to save — the diagram matches the template' }
    if (isBuiltInTemplate(templateId)) return { kind: 'refused', reason: 'a built-in workflow saves as a copy' }
    const result = await window.canvas.template.save(draft.template, draft.baseRevision)
    if (result.kind === 'stale') return { kind: 'stale', reason: result.reason }
    // Round 6. A refusal is passed through as itself, never turned into a
    // stale: the panel's stale arm offers Reload, and reloading a record
    // whose shape main would not accept walks a person in a circle.
    if (result.kind === 'refused') return { kind: 'refused', reason: result.reason }
    resetDraft(templateId, result.template)
    reloadTemplates()
    return { kind: 'saved' }
  }, [reloadTemplates])
  /** M184. The draft under a NEW id at revision 0 — a built-in's only save, and the way out of a stale one. */
  const saveWorkflowCopy = useCallback(async (templateId: string): Promise<{ kind: 'saved'; name?: string } | { kind: 'refused'; reason: string }> => {
    const draft = getDraft(templateId)
    const base = draft?.template ?? allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (base === undefined) return { kind: 'refused', reason: `no template is called ${templateId}` }
    const taken = new Set(allTemplates(templateRowsRef.current).map((t) => t.name))
    let name = `${base.name} (copy)`
    for (let n = 2; taken.has(name); n += 1) name = `${base.name} (copy ${n})`
    const { id: _id, revision: _revision, ...rest } = base
    const result = await window.canvas.template.save({ ...rest, name })
    if (result.kind !== 'saved') return { kind: 'refused', reason: result.reason }
    // M184 (the critic, finding 4). REBIND the panel to the copy, and only
    // then drop the draft: dropping it first snapped the diagram back to the
    // original record, so the edits left the screen with no message and the
    // copy holding them had no panel open on it — visible work loss on a
    // built-in's only save path.
    setPanels((current) => {
      const next = current.map((p) => (isWorkflowPanel(p) && p.workflow.templateId === templateId ? { ...p, workflow: { ...p.workflow, templateId: result.template.id }, title: result.template.name } : p))
      commitHistory(next)
      return next
    })
    resetDraft(templateId)
    reloadTemplates()
    return { kind: 'saved', name }
  }, [reloadTemplates, commitHistory])
  /**
   * M184. Stop: every live pool AND every chat of the selected run interrupted
   * (M138's own pool stop, M71's own interrupt), nothing killed — a budget and
   * a stop are the same shape, and a killed agent loses its turn.
   *
   * M184 (the critic, finding 3). The first cut read pool keys off the RECORD
   * and interrupted no chat at all, so a workflow of three chats mid-turn
   * answered `no pool is running`, which was false. The subject is the run:
   * the named one when the diagram has one selected, otherwise every run of
   * this template still open. A run's own `definition` names its pool blocks,
   * so a block deleted from the draft since is still stopped.
   */
  const stopWorkflowRun = useCallback((templateId: string, runId?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const runs = runsForTemplate(runsRef.current, templateId)
    const chosen = runId === undefined ? runs.filter((r) => r.endedAt === undefined) : runs.filter((r) => r.id === runId)
    const keys = new Set<string>()
    for (const r of chosen) for (const n of r.definition?.nodes ?? []) if (n.kind === 'pool') keys.add(n.key)
    // No run to read from (a run of an earlier session is not attributable,
    // M133's third state) — the record's blocks are the only shape there is.
    if (chosen.length === 0) {
      const template = getDraft(templateId)?.template ?? allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
      for (const n of template?.nodes ?? []) if (n.kind === 'pool') keys.add(n.key)
    }
    const live = [...keys].filter((k) => getPool(templateId, k).live)
    const panelIds = new Set<string>()
    for (const r of chosen) for (const id of r.panelIds) panelIds.add(id)
    const chats = panelsRef.current.filter((p) => panelIds.has(p.rect.id) && isChatPanel(p)).map((p) => p.rect.id)
    if (live.length === 0 && chats.length === 0) return { kind: 'refused', reason: REASON_NOTHING_RUNNING }
    for (const k of live) stopPool(templateId, k)
    for (const id of chats) void window.canvas.agentSession.interrupt(id)
    const parts: string[] = []
    if (live.length > 0) parts.push(`${live.length} pool${live.length === 1 ? '' : 's'}`)
    if (chats.length > 0) parts.push(`${chats.length} chat${chats.length === 1 ? '' : 's'}`)
    return { kind: 'ran', note: `${parts.join(' and ')} interrupted` }
  }, [stopPool])

  /** M184. Discard the draft: the record as it stands is the truth again. */
  const reloadWorkflowDraft = useCallback((templateId: string) => {
    resetDraft(templateId, allTemplates(templateRowsRef.current).find((t) => t.id === templateId))
    reloadTemplates()
  }, [reloadTemplates])

  const deleteWorkflowTemplate = useCallback((templateId: string) => {
    if (isBuiltInTemplate(templateId)) return
    // M182. The draft goes with the record: a deleted template is not editable through a draft that outlived it.
    clearDraft(templateId)
    void window.canvas.template.remove(templateId).then(() => window.canvas.template.list().then(setTemplateRows))
  }, [])

  return { beginWorkflowTrigger, buildWorkflowWithAi, deleteWorkflowTemplate, openWorkflowPanel, reloadWorkflowDraft, runWorkflow, saveWorkflowCopy, saveWorkflowDraft, stopWorkflowRun }
}
