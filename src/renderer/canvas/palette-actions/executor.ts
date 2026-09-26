/**
 * The verb executor.
 *
 * The ONE place a verb's meaning lives: `facts()` describes the live canvas,
 * `execute` is the switch every door runs through, and the two verbs that
 * drive it — the agent's plan line and the palette's Run a verb.
 *
 * `verify:verbs executor.1` reads THIS file for a `case` per table entry, and
 * `verify:deck deck.origin.1` reads it for how origin is threaded.
 *
 * One slice of `usePaletteActions`. Every body here is the one that lived in
 * that file before the split, moved verbatim — see `./types.ts` for why `ctx.self`
 * is the object under construction rather than a getter.
 */

import { onboardingReadiness, isFirstLaunchBackend, FIRST_LAUNCH_ENGINES } from '@shared/onboarding'
import { CREATABLE_OBJECTS } from '@shared/verb-table'
import { getDraft } from '@renderer/workflow/template-draft-store'
import { LIBRARY, defaultNodeOf, placementFor } from '@shared/template-library'
import { HANDOFF_TRIGGERS } from '@shared/handoff'
import { type TemplateNode } from '@shared/templates'
import { insertIntoComposer, lastAssistantText } from '@renderer/chat/chat-store'
import { buildPlan, describePlan, parsePlanLine, planIsDestructive, runPlan, runAgentPlan, type AgentPlanCaller, type PlanFacts, type PlanStep, type StepOutcome } from '@shared/plan'
import { outward } from '@shared/outward'
import { importedNoteReason } from '@shared/imported-note'
import { REASON_NO_LIVE_PAGE } from '@shared/browser-panel'
import { browserGuestId } from '@renderer/browser/browser-store'
import type { SettingValue } from '@shared/settings-schema'
import { allTemplates } from '@shared/templates'
import { WORK_ITEM_STATES, type PersistedWorkItem } from '@shared/work-items'
import { repoOfKey } from '@shared/work-items'
import { resolveRepository, startWorkNeeds, type StartWorkRepo } from '@renderer/palette/start-work'
import { tidyPanels } from '../placement'
import { getAgentState } from '@renderer/session/agent-state-store'
import { SWARM_PRESETS, SWARM_PRESET_IDS, parseSwarmPresetId } from '@shared/swarm'
import type { HandoffTrigger } from '@shared/handoff'
import { isBrowserPanel, isChatPanel, isFilePanel, isReviewPanel, isTerminalPanel, type Panel } from '@renderer/panels/panels'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type ExecutorActions = Pick<PaletteActions,
  | 'runAgentPlan'
  | 'beginRunVerb'
>

export function executorActions(ctx: ActionCtx): ExecutorActions {
  const {
    recheckEnvironment, applyStarter, templateRowsRef, registry, palette, panelsRef, presetRows,
    settingRows, resetViewport, fitAll, fitSelection, selectedIdsRef, centreOn, selectAndRaise,
    onSelectPanel, onClosePanel, openReview, beginNewChat, lockPanel, unlockPanel, pinPanel,
    unpinPanel, maximisePanel, restorePanel, restartWithSpec, commitHistory, switchWorkspace,
    reloadSettings, reloadWorktrees, worktreeRows, setInputMode, teammatesRef, workItemsRef,
    self
  } = ctx
  const facts = (): PlanFacts => ({
    // M180. The agent's state word rides on a terminal's facts so the
    // agent door can refuse `submit` against a panel in wants-you
    // (`agentDoorRefusal`); absent stays absent.
    panels: panelsRef.current.map((p) => { const state = getAgentState(p.rect.id); return { id: p.rect.id, kind: p.kind, ...(registry.get(p.rect.id)?.spec.agent === undefined ? {} : { agent: registry.get(p.rect.id)!.spec.agent }), ...(state === undefined ? {} : { state }) } }),
    presets: presetRows.map((r) => ({ id: r.id })),
    // M182. Every template (built-in and saved): the editing verbs bind against it.
    templates: allTemplates(templateRowsRef.current).map((t) => ({ id: t.id })),
    worktrees: worktreeRows.map((w) => ({ id: w.id }))
  })
  // M246. `caller` is WHO asked: present through the agent door (and a
  // workflow an agent triggered), absent for the palette runner and a
  // person's own run. Only verbs whose meaning depends on it read it.
  // M248. HOW it arrived: runAgentPlan (the agent door AND a workflow action
  // node) passes 'door' whatever the caller; the palette's runPlan is a person.
  // A deck edit that arrives through a door stages a proposal instead of writing.
  const execute = async (step: PlanStep, caller?: AgentPlanCaller, origin: 'person' | 'door' = 'person'): Promise<StepOutcome> => {
    const a = step.args
    const creation = CREATABLE_OBJECTS.find((entry) => entry.verb === step.verb)
    if (creation) return self.createObject(creation.id, a.value)
    const panelOf = (id: string): Panel | undefined => panelsRef.current.find((p) => p.rect.id === id)
    switch (step.verb) {
      case 'checklist-edit': return self.editChecklist(a.panel!, a.operation!, a.value)
      case 'checklist-hand': return self.handChecklist(a.panel!, Number(a.line), a.agent!)
      case 'deck-edit': return self.editDeck(a.panel!, Number(a.slide), a.value ?? '', origin)
      case 'deck-write': return self.writeDeck(a.panel!, a.value ?? '', origin)
      case 'deck-review': return self.reviewDeck(a.panel!, a.action ?? '', a.slides ?? '', origin)
      case 'deck-present': return self.presentDeck(a.panel!, origin)
      case 'deck-export-pdf': return self.exportDeckPdf(a.panel!)
      case 'sheet-edit': return self.editSheet(a.panel!, a.cell!, a.value ?? '', caller)
      case 'sheet-review': return self.reviewSheet(a.panel!, a.operation!, a.target, caller)
      case 'agent-links': return self.setAgentLinks(a.state!)
      case 'starter': return applyStarter()
      case 'workflow-save': return self.saveWorkflow(a.template!)
      // M246 (critic, finding 1). The caller rides the run into every action
      // node: dropped here, an agent could put `sheet-review f1 keep all` in a
      // template and run it as if a person had.
      case 'workflow-run': return self.runWorkflowNow(a.template!, caller)
      case 'workflow-stop': return self.stopWorkflow(a.template!)
      case 'workflow-copy': return self.saveWorkflowCopy(a.template!)
      case 'node-test': return self.testNode(a.template!, a.node)
      case 'feedback': return self.prepareFeedback(a.says)
      case 'share-workspace': return self.shareWorkspace(a.org)
      case 'open-share': return self.openSharedWorkspace(a.share)
      case 'share-role': return self.proposeShareRole(a.who, a.role)
      // M352. `origin` is what makes this safe through a door: planCapChange lets a door only lower a cap.
      case 'cap-agent': return self.capAgent(a.panel!, a.cap!, origin)
      case 'review-comment': return self.reviewComment(a.panel!, a.place!, a.comment ?? '', origin, caller)
      case 'export-canvas': return self.exportCanvas(a.path, a.pictures)
      case 'deck-export-pptx': return self.exportDeck(step.args.panel as string)
      case 'import-canvas': return self.importCanvas(a.path)
      // A plan must NAME the document: with no path the import opens the
      // system's chooser, and a modal nobody asked for in front of the
      // person is not a plan's to open. The chooser is the palette row's.
      case 'import-docx': return a.path ? self.importDocx(a.path) : { kind: 'refused', reason: 'name the .docx to import — import-docx <path>; choosing one is the palette row\'s' }
      case 'export-pack': return self.exportPack(a.path)
      case 'import-pack': return self.importPack(a.path)
      case 'sample-pack': return self.importSamplePack()
      case 'publish-release': return self.publishRelease(a.tag!, a.file)
      case 'publish-comment': return self.publishComment(a.number!, a.file)
      case 'publish-discussion': return self.publishDiscussion(a.category!, a.file)
      case 'note-add': return self.addNote(a.form!, a.text)
      case 'note-set': return self.setNoteText(a.panel!, a.text ?? '')
      case 'note-tint': return self.setNoteTint(a.panel!, a.tint!)
      case 'image-add': return self.addImage(a.path!)
      case 'image-replace': return self.replaceImage(a.panel!, a.path)
      case 'preview-open': return self.openPreview(a.url)
      case 'preview-bind': return self.bindPreview()
      case 'review-task': return self.reviewTask(step.args.panel as string)
      case 'show-task': return self.showTask(step.args.panel as string)
      case 'show-related': return self.showRelated(step.args.panel as string)
      case 'arrange-task': return self.arrangeTask(step.args.panel as string)
      case 'fit-task': return self.fitTask()
      case 'preview-width': return self.setPreviewWidth(a.device!)
      case 'preview-capture': return self.capturePreview()
      case 'preview-dev': return self.startDevServer(a.script)
      // M182. The six editing verbs, each one draft operation through the store's door.
      case 'workflow-add': {
        const kind = String(a.kind ?? '')
        // M183. The library's default for the kind, placed where a drop would land (to the right of the rightmost block).
        if (!LIBRARY.some((e) => e.kind === kind)) return { kind: 'refused', reason: `${kind} is not a node kind — ${LIBRARY.map((e) => e.kind).join(', ')}` }
        const saved = allTemplates(templateRowsRef.current).find((t) => t.id === a.template)
        const base = getDraft(a.template!)?.template ?? saved
        const at = base === undefined ? { dx: 0, dy: 0 } : placementFor(base)
        const r = self.editWorkflow(a.template!, { type: 'add', node: { ...defaultNodeOf(kind as TemplateNode['kind']), ...at } as Omit<TemplateNode, 'key'> })
        return r.kind === 'ok' ? { kind: 'ran', note: 'node added to the draft' } : r
      }
      case 'workflow-move': {
        const dx = Number(a.dx), dy = Number(a.dy)
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { kind: 'refused', reason: 'dx and dy must be numbers' }
        const r = self.editWorkflow(a.template!, { type: 'move', key: String(a.key), dx, dy })
        return r.kind === 'ok' ? { kind: 'ran' } : r
      }
      case 'workflow-set': {
        const raw = String(a.value ?? '')
        const field = String(a.field ?? '')
        // A number where the field takes one; a list where it takes one; text otherwise.
        const value: unknown = field === 'width' ? Number(raw) : field === 'args' ? raw.split(/\s+/).filter((w) => w !== '') : raw
        const r = self.editWorkflow(a.template!, { type: 'set', key: String(a.key), patch: { [field]: value } })
        return r.kind === 'ok' ? { kind: 'ran' } : r
      }
      case 'workflow-remove': { const r = self.editWorkflow(a.template!, { type: 'remove', key: String(a.key) }); return r.kind === 'ok' ? { kind: 'ran' } : r }
      case 'workflow-edge': {
        const trigger = String(a.trigger ?? '')
        if (!(HANDOFF_TRIGGERS as readonly string[]).includes(trigger)) return { kind: 'refused', reason: `${trigger} is not a trigger — ${HANDOFF_TRIGGERS.join(', ')}` }
        const r = self.editWorkflow(a.template!, { type: 'edge', from: String(a.from), to: String(a.to), trigger: trigger as HandoffTrigger })
        return r.kind === 'ok' ? { kind: 'ran' } : r
      }
      case 'workflow-unedge': { const r = self.editWorkflow(a.template!, { type: 'unedge', from: String(a.from), to: String(a.to) }); return r.kind === 'ok' ? { kind: 'ran' } : r }
      case 'check-readiness': {
        const readiness = onboardingReadiness(await recheckEnvironment())
        return { kind: 'ran', note: readiness.rows.map((row) => row.sentence).join(' ') }
      }
      case 'new-chat': {
        if (a.backend !== undefined && !isFirstLaunchBackend(a.backend)) return { kind: 'refused', reason: `choose one of ${Object.keys(FIRST_LAUNCH_ENGINES).join(' or ')}` }
        const readiness = onboardingReadiness(await window.canvas.env.report(), a.backend)
        if (readiness.preferred === undefined) return { kind: 'refused', reason: 'no conversation engine is available — check readiness in the launcher' }
        if (a.backend !== undefined && readiness.preferred !== a.backend) return { kind: 'refused', reason: `${a.backend} is not available — check readiness` }
        const result = await beginNewChat({ backend: readiness.preferred })
        return result.kind === 'refused' ? result : { kind: 'ran', note: result.id ?? 'conversation opened' }
      }
      case 'focus': selectAndRaise(a.panel!); { const p = panelOf(a.panel!); if (p) centreOn(p.rect) } return { kind: 'ran' }
      case 'start': onSelectPanel(a.panel!); return { kind: 'ran' }
      case 'spawn': { const row = presetRows.find((p) => p.id === a.preset); if (!row?.available) return { kind: 'refused', reason: `${a.preset} is not available — ${row === undefined ? 'no such preset' : 'its command is not on the PATH'}` }; return window.canvas.preset.spawnById(a.preset!).then((refusal) => (refusal === null ? { kind: 'ran' as const } : { kind: 'refused' as const, reason: refusal })) }
      case 'type': {
        const p = panelOf(a.panel!)
        if (p && isChatPanel(p)) { insertIntoComposer(p.rect.id, a.text ?? ''); return { kind: 'ran', note: 'inserted into the composer' } }
        const h = registry.get(a.panel!)?.handle
        if (!h) return { kind: 'refused', reason: `${a.panel} has no live session — start it first` }
        // paste, not write: bracketed paste is the one handoff an agent
        // TUI treats as text rather than keystrokes (the Jira rule).
        h.paste(a.text ?? '')
        return { kind: 'ran' }
      }
      case 'submit': {
        const p = panelOf(a.panel!)
        if (p && isChatPanel(p)) return { kind: 'refused', reason: 'a chat sends with `send <panel> <text>` — submit is for an agent terminal' }
        const h = registry.get(a.panel!)?.handle
        if (!h) return { kind: 'refused', reason: `${a.panel} has no live session — start it first` }
        h.write('\r')
        return { kind: 'ran' }
      }
      case 'send': {
        const answer = await window.canvas.agentSession.send(a.panel!, a.text ?? '')
        if (typeof answer === 'object') return { kind: 'refused', reason: answer.refused }
        if (answer === 'no-session') return { kind: 'refused', reason: `${a.panel} has no chat session yet — open it first` }
        if (answer.startsWith('refused')) return { kind: 'refused', reason: `the send was refused: ${answer}` }
        return { kind: 'ran', note: answer }
      }
      case 'interrupt': {
        const p = panelOf(a.panel!)
        if (p && isChatPanel(p)) { const did = await window.canvas.agentSession.interrupt(p.rect.id); return did ? { kind: 'ran' } : { kind: 'refused', reason: 'nothing is in flight' } }
        const h = registry.get(a.panel!)?.handle
        if (!h) return { kind: 'refused', reason: `${a.panel} has no live session` }
        h.write('\x03')
        return { kind: 'ran' }
      }
      case 'restart': { const p = panelOf(a.panel!); if (!p || !isTerminalPanel(p)) return { kind: 'refused', reason: 'only a terminal panel restarts' }; restartWithSpec(p.rect.id, p.spec); return { kind: 'ran' } }
      case 'read': {
        // Guardrail 2: through the ONE outward gate, whichever front-end.
        const p = panelOf(a.panel!)
        // M103. A browser panel's text is read in MAIN, which owns the
        // scheme check, the cap and the gate; the note it hands back says
        // the content is a remote page's, and that is what the plan reads
        // out. No live guest is a named refusal, never an empty read.
        if (p && isBrowserPanel(p)) {
          const guest = browserGuestId(p.rect.id)
          if (guest === undefined) return { kind: 'refused', reason: `${a.panel}: ${REASON_NO_LIVE_PAGE}` }
          const page = await window.canvas.browser.read({ panelId: p.rect.id, webContentsId: guest })
          if (page.kind === 'refused') return { kind: 'refused', reason: `${a.panel}: ${page.reason}` }
          return { kind: 'ran', note: `${page.note}: ${page.text.slice(0, 160).replace(/\s+/g, ' ')}` }
        }
        // M250. An imported note nobody has read yet is inert at the APP's
        // doors: the canvas `read` verb refuses it, by the same sentence its
        // banner shows. This is not a filesystem boundary — an agent with a
        // shell can still `cat` the .md; the gate is what this app hands over.
        const importGate = p && isFilePanel(p) ? importedNoteReason(p.source) : undefined
        if (importGate !== undefined) return { kind: 'refused', reason: `${a.panel}: ${importGate}` }
        const raw = p && isChatPanel(p) ? lastAssistantText(p.rect.id) : (await window.canvas.scrollback.tail({ panelId: a.panel!, lines: 40 })).join('\n')
        const gate = outward(raw, `panel ${a.panel}`)
        return { kind: 'ran', note: `${gate.note}: ${gate.text.slice(-160).replace(/\s+/g, ' ')}` }
      }
      case 'set-setting': {
        const row = settingRows.find((r) => r.id === a.setting)
        if (!row) return { kind: 'refused', reason: `no setting is called ${a.setting}` }
        const v = a.value ?? ''
        const value: SettingValue = row.type === 'boolean' ? v === 'true' || v === 'on' : row.type === 'number' ? Number(v) : row.type === 'list' ? v.split(',').map((x) => x.trim()) : v
        if (row.type === 'number' && !Number.isFinite(value as number)) return { kind: 'refused', reason: `${a.setting} takes a number` }
        // Main owns the store and refuses an unknown id or a wrong type; the
        // reload is what makes a refusal visible (the row keeps its value).
        await window.canvas.settings.set(a.setting!, value)
        reloadSettings()
        return { kind: 'ran' }
      }
      case 'lock': lockPanel(a.panel!); return { kind: 'ran' }
      case 'unlock': unlockPanel(a.panel!); return { kind: 'ran' }
      case 'pin': pinPanel(a.panel!); return { kind: 'ran' }
      case 'unpin': unpinPanel(a.panel!); return { kind: 'ran' }
      case 'maximise': maximisePanel(a.panel!); return { kind: 'ran' }
      case 'restore': restorePanel(a.panel!); return { kind: 'ran' }
      case 'tidy': {
        // The same arithmetic as the `tidyPanels` member above (one history
        // entry, locked panels stay), repeated rather than called because a
        // member of this literal cannot name a sibling before the object
        // exists — and `verify:verbs closure.1` maps this verb to it.
        const chosen = panelsRef.current.filter((p) => p.locked !== true)
        if (chosen.length < 2) return { kind: 'refused', reason: 'nothing to tidy — fewer than two unlocked panels' }
        const tidied = new Map(tidyPanels(chosen.map((p) => p.rect)).map((r) => [r.id, r]))
        commitHistory(panelsRef.current.map((p) => { const r = tidied.get(p.rect.id); return r === undefined ? p : { ...p, rect: r } }))
        return { kind: 'ran' }
      }
      case 'zoom-fit': {
        const selected = selectedIdsRef.current
        const rects = panelsRef.current.filter((p) => selected.has(p.rect.id)).map((p) => p.rect)
        if (rects.length > 0) fitSelection(rects)
        else if (panelsRef.current.length > 0) fitAll()
        else resetViewport()
        return { kind: 'ran' }
      }
      case 'zoom-reset': resetViewport(); return { kind: 'ran' }
      // M149. The table had advertised the verb with no arm here (the Act
      // II critic): a plan naming it was refused as `no executor`.
      case 'workspace-from-template': self.workspaceFromTemplate(String(step.args.template ?? '')); return { kind: 'ran' }
      // M149. `dispatch` and `board` had sat in the table since M113–M116
      // with no arm here — `verify:verbs executor.1` found both beside
      // the workspace verb. Each binds by KEY and refuses by name.
      case 'dispatch': {
        const item = (workItemsRef.current ?? []).find((w) => w.id === a.item || w.key === a.item)
        if (item === undefined) return { kind: 'refused', reason: `no work item is called ${a.item} — name one by its id or key` }
        const mate = teammatesRef.current.find((t) => t.id === a.teammate || t.name === a.teammate)
        if (mate === undefined) return { kind: 'refused', reason: `no teammate is called ${a.teammate}` }
        // M197. AWAITED. Before this the verb was called and `ran` was
        // returned in the same breath — every refusal happened after that
        // return, into the card's note, which the plan's caller never
        // reads. A verb that cannot fail in the caller's view is a verb
        // that fails silently.
        const outcome = await self.startWork(item.id, mate.id)
        return outcome.kind === 'started' ? { kind: 'ran', note: `started on ${outcome.panelId}` } : { kind: 'refused', reason: outcome.reason }
      }
      // M275. The arrangement, through the SAME executor the sheet's Start
      // and the card's menu reach. Each of the three arguments binds by
      // KEY and refuses by name — the pattern `dispatch` set — and the
      // ROOT is resolved the way a start with no sheet resolves it: the
      // teammate's places are walked and the item's own clone is taken
      // when exactly one matches. A plan has no typist to answer
      // `ambiguous` or `none`, so both refuse with the sentence that names
      // the choice, rather than picking one.
      case 'swarm': {
        const item = (workItemsRef.current ?? []).find((w) => w.id === a.item || w.key === a.item)
        if (item === undefined) return { kind: 'refused', reason: `no work item is called ${a.item} — name one by its id or key` }
        const mate = teammatesRef.current.find((t) => t.id === a.teammate || t.name === a.teammate)
        if (mate === undefined) return { kind: 'refused', reason: `no teammate is called ${a.teammate}` }
        const presetId = parseSwarmPresetId(a.arrangement)
        if (presetId === null) return { kind: 'refused', reason: `no arrangement is called ${a.arrangement} — one of ${SWARM_PRESET_IDS.join(', ')}` }
        const answer = await window.canvas.board.repositories({ teammateId: mate.id })
        const repos: readonly StartWorkRepo[] = answer.kind === 'repos' ? answer.repos : []
        const wanted = item.key === undefined ? null : repoOfKey(item.key)
        const resolved = resolveRepository(repos, wanted)
        if (resolved.kind !== 'auto') {
          const needs = startWorkNeeds({ title: item.title, teammateId: mate.id }, { teammates: teammatesRef.current ?? [], repos, wanted })
          return { kind: 'refused', reason: needs[0]?.why ?? `choose which of ${mate.name}'s repositories to work in — a plan cannot answer that` }
        }
        const outcome = await self.startSwarm(item.id, mate.id, resolved.path, presetId)
        return outcome.kind === 'started' ? { kind: 'ran', note: `${SWARM_PRESETS[presetId].label} arrangement on ${outcome.panelId}` } : { kind: 'refused', reason: outcome.reason }
      }
      case 'board': {
        const what = String(a.what ?? '').trim()
        if (a.op === 'add') {
          if (what === '') return { kind: 'refused', reason: 'board add needs a title' }
          const id = self.addWorkItem({ source: 'typed', title: what, state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] })
          return { kind: 'ran', note: `added ${id}` }
        }
        if (a.op === 'done') {
          const item = (workItemsRef.current ?? []).find((w) => w.id === what || w.key === what)
          if (item === undefined) return { kind: 'refused', reason: `no work item is called ${what}` }
          self.markDone(item.id); return { kind: 'ran' }
        }
        return { kind: 'refused', reason: `board ${String(a.op)} is not a verb — add <title> or done <id>` }
      }
      case 'workspace': { const ok = await switchWorkspace(a.workspace!); return ok ? { kind: 'ran' } : { kind: 'refused', reason: `could not switch to ${a.workspace}` } }
      case 'review': openReview(a.panel!); return { kind: 'ran' }
      case 'run-template': palette.openPalette(); return { kind: 'refused', reason: 'open the spawn sheet on the template from New panel… — its parameters are asked there' }
      case 'close': onClosePanel(a.panel!); return { kind: 'ran' }
      case 'reset-canvas': void window.canvas.canvas.requestReset(); return { kind: 'ran', note: 'the reset asks once more in its own dialog' }
      case 'discard': {
        const p = panelOf(a.panel!)
        if (!p || !isReviewPanel(p)) return { kind: 'refused', reason: `${a.panel} is not a review node — open one with \`review <panel>\` first` }
        const result = await window.canvas.review.at(p.subject)
        if (result.kind !== 'changes') return { kind: 'refused', reason: `nothing to discard — the review reads ${result.kind}` }
        // M285. The identity this read carried rides along as `expect`, so main
        // refuses by name if the tree moved between the read and the write.
        const done = await window.canvas.review.discard({ root: result.root, baseline: p.subject.baselineSha, subjectId: p.subject.subjectId, paths: result.files.map((f) => f.path), ...(result.identity === undefined ? {} : { expect: result.identity }) })
        if (done.kind === 'discarded') return { kind: 'ran', note: `${result.files.length} files` }
        return { kind: 'refused', reason: done.kind === 'nothing-to-discard' ? 'nothing to discard' : done.kind === 'subject-moved' ? 'the changes moved since they were read — nothing was discarded' : done.detail }
      }
      case 'remove-worktree': {
        const done = await window.canvas.worktree.remove(a.worktree!)
        reloadWorktrees()
        return done.kind === 'removed' ? { kind: 'ran' } : { kind: 'refused', reason: done.kind === 'unknown' ? `no worktree is called ${a.worktree}` : done.reason }
      }
      default: return { kind: 'refused', reason: `${step.verb} has no executor` }
    }
  }
  return ({
    // M96. THE VERB LINE. The palette's text mode takes `verb args; verb
    // args`; the plan is built against the live canvas (M81's facts plus each
    // session's agent kind), refused by name with its fix on the same line
    // (the palette's `feedback` idiom), confirmed once when any step is
    // destructive, and run by the executor below — the ONLY place a verb's
    // meaning lives. The table knows what a verb IS; this knows what it DOES.
    runAgentPlan: (line, caller) => runAgentPlan(line, facts(), (step) => execute(step, caller, 'door'), caller),
    beginRunVerb: () => {
      const open = (initial: string, refused?: string): void => {
        setInputMode({
          kind: 'text',
          // The mode names itself on the line (the critic could not tell it from
          // Rename), and Enter is `run`, not `save`.
          label: refused ? `Run a verb — ${refused}` : 'Run a verb — e.g. focus n3 · type n3 hello · close n3; several with ;',
          verb: 'run',
          initial,
          ...(refused ? { feedback: true as const } : {}),
          submit: (line) => {
            const built = buildPlan(parsePlanLine(line), facts())
            if (built.kind === 'refused') { open(line, `${built.reason} — ${built.fix}`); palette.openPalette(); return }
            const run = (acknowledged: boolean): void => {
              void runPlan(built.plan, execute, { acknowledged }).then((report) => {
                // The report on the same line, in the state vocabulary; a stop
                // re-prompts with the line so it can be corrected.
                const stopped = report.steps.some((r) => r.kind === 'refused')
                const notes = report.steps.filter((r) => r.kind === 'ran' && r.note !== undefined).map((r) => (r as { note: string }).note).join(' · ')
                open(stopped ? line : '', `${report.summary}${notes === '' ? '' : ' · ' + notes}`)
                palette.openPalette()
              })
            }
            if (planIsDestructive(built.plan)) {
              setInputMode({
                kind: 'confirm',
                label: `${describePlan(built.plan).join(' · ')} — run it?`,
                initial: '',
                submit: () => run(true)
              })
              palette.openPalette()
              return
            }
            run(false)
          }
        })
      }
      open('')
      palette.openPalette()
    }
  })
}
