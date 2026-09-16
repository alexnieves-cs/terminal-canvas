/**
 * Prompts, templates and workflows.
 *
 * The saved text and saved SHAPES: a prompt's holes filled and pasted, a
 * selection saved as a template, and the workflow draft's six editing
 * operations with the binding's Update beside them.
 *
 * One slice of `usePaletteActions`. Every body here is the one that lived in
 * that file before the split, moved verbatim — see `./types.ts` for why `ctx.self`
 * is the object under construction rather than a getter.
 */

import { applyDraftOp, getDraft, resetDraft } from '@renderer/workflow/template-draft-store'
import { configureNode, moveNode } from '@shared/template-edit'
import { isBuiltInTemplate } from '@shared/templates'
import { insertIntoComposer } from '@renderer/chat/chat-store'
import { fillPlaceholders, askableHoles, fillBuiltIns } from '@renderer/chat/composer-model'
import { allTemplates } from '@shared/templates'
import { getLiveSession } from '@renderer/session/live-session-store'
import type { HandoffTrigger } from '@shared/handoff'
import type { PersistedTemplate } from '@shared/templates'
import { isChatPanel, isTerminalPanel, linksOf } from '@renderer/panels/panels'
import { railLabel } from '../../shell/rail-rows'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type PromptsActions = Pick<PaletteActions,
  | 'insertPrompt'
  | 'beginSavePrompt'
  | 'deletePrompt'
  | 'beginSaveTemplate'
  | 'updateBoundTemplate'
  | 'editWorkflow'
  | 'beginWorkflowEdit'
  | 'saveWorkflow'
  | 'stopWorkflow'
  | 'runWorkflowNow'
  | 'testNode'
  | 'saveWorkflowCopy'
  | 'openWorkflow'
>

export function promptsActions(ctx: ActionCtx): PromptsActions {
  const {
    saveWorkflowDraft, saveWorkflowCopyDraft, testNodeNow, stopWorkflowRun, runWorkflowNow,
    templateRowsRef, reloadTemplates, registry, palette, panelsRef, mergedRef, promptBodiesRef,
    promptRows, openWorkflowPanel, reloadPrompts, setInputMode, self
  } = ctx
  return ({
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
      // M75. The delivery depends on the target's kind: a chat's composer
      // takes text through the store's insert bus; a terminal takes a
      // bracketed paste. paste(), NEVER write(), for the terminal:
      // session-factory.ts spells out the failure it exists to prevent —
      // term.paste wraps the payload in bracketed-paste markers (and
      // normalises LF to CR), so a multi-line prompt arrives as ONE input; a
      // raw write submits every newline separately. verify:panels 40 is the
      // check that can tell the two apart.
      const deliver = (text: string): void => {
        const panel = panelsRef.current.find((p) => p.rect.id === target)
        if (panel !== undefined && isChatPanel(panel)) insertIntoComposer(target, text)
        else registry.get(target)?.handle.paste(text)
      }
      // M75. Backlog #27: a SAVED prompt's {{holes}} are filled first, one
      // question per hole through the palette's own text line; a project
      // prompt is never expanded (M5b's decision — the same file must behave
      // the same inside and outside this app), so its holes stay as typed.
      // M141. A SAVED prompt's four built-in holes are filled from the target
      // first — live cwd, branch (main's), selection, title — and never
      // asked; only the ordinary holes become questions. A project prompt is
      // untouched by both (`proj:` ids skip every expansion).
      const isProject = id.startsWith('proj:')
      const holes = isProject ? [] : askableHoles(body)
      const withBuiltIns = async (text: string): Promise<string> => {
        if (isProject) return text
        const panel = panelsRef.current.find((p) => p.rect.id === target)
        const session = registry.get(target)
        const cwd = panel !== undefined && isChatPanel(panel) ? panel.chat.cwd : (getLiveSession(target)?.cwd ?? (panel !== undefined && isTerminalPanel(panel) ? panel.spec.cwd : ''))
        let branch = ''
        if (cwd !== '' && /\{\{branch\}\}/.test(text)) {
          try { const status = await window.canvas.git.status(cwd); if (status.kind === 'status') branch = status.branch } catch { branch = '' }
        }
        // `{{panel}}` is the panel's TITLE — railLabel's one-label rule, the
        // words the frame and the rail show — never the switcher's label,
        // which carries `— cwd (id)` for telling two rows apart (core
        // `prompt.builtin.1` reads the frame's title back out of the terminal).
        return fillBuiltIns(text, { cwd, branch, selection: session?.handle.getSelection() ?? '', panel: panel === undefined ? '' : railLabel(panel, session?.status) })
      }
      if (holes.length === 0) { void withBuiltIns(body).then(deliver); return }
      const values: Record<string, string> = {}
      const ask = (i: number): void => {
        const name = holes[i]
        if (name === undefined) { setInputMode(null); void withBuiltIns(fillPlaceholders(body, values)).then(deliver); return }
        setInputMode({
          kind: 'text',
          label: `${name} (${i + 1} of ${holes.length}) — the value for {{${name}}}`,
          initial: '',
          submit: (value) => { values[name] = value; ask(i + 1) }
        })
        // Reopened for EVERY hole, not only the first: Palette.tsx closes
        // before calling submit, so the second hole's mode would otherwise
        // be set on a palette that is already gone and wiped by the
        // clear-on-close effect — the prompt then inserted with its second
        // hole as typed, and nothing said so (M75's verifier).
        palette.openPalette()
      }
      ask(0)
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
    // M80. The selected panels and the enabled handoff edges among them, saved
    // as a shape of work. A kind that is neither a terminal nor a chat is
    // DROPPED with the count said in the sentence — a template makes panels,
    // and a review node's subject would not exist in the new canvas.
    beginSaveTemplate: (panelIds) => {
      // The merged view's rects are lane-space: a template saved there would
      // record a geometry that exists in one render (M80's verifier).
      if (mergedRef.current) { setInputMode({ kind: 'text', label: 'the merged view is read-only — switch to a workspace first', initial: '', submit: () => setInputMode(null) }); palette.openPalette(); return }
      const chosen = panelsRef.current.filter((p) => panelIds.includes(p.rect.id))
      const usable = chosen.filter((p) => isTerminalPanel(p) || isChatPanel(p))
      const dropped = chosen.length - usable.length
      if (usable.length === 0) {
        // Refused BY NAME, never silently: the row was enabled because
        // something was selected, and nothing happening reads as broken.
        setInputMode({ kind: 'text', label: 'a template is made of terminals and chats — none is selected', initial: '', submit: () => setInputMode(null) })
        palette.openPalette()
        return
      }
      setInputMode({
        kind: 'text',
        // M182. Bound panels PREFILL their template's name and the label says
        // what Enter does; another name saves a copy (the critic's F3).
        label: (() => {
          const bs = usable.map((p) => p.templateBinding?.templateId)
          const one = bs[0] !== undefined && bs.every((b) => b === bs[0]) ? allTemplates(templateRowsRef.current).find((t) => t.id === bs[0]) : undefined
          return one !== undefined && !isBuiltInTemplate(one.id)
            ? `Enter updates "${one.name}" (revision ${one.revision ?? 0}); another name saves a copy${dropped === 0 ? '' : ` (${dropped} other panel${dropped === 1 ? '' : 's'} cannot be saved)`}`
            : `Name this ${usable.length}-panel template…${dropped === 0 ? '' : ` (${dropped} other panel${dropped === 1 ? '' : 's'} cannot be saved)`}`
        })(),
        initial: (() => { const bs = usable.map((p) => p.templateBinding?.templateId); const one = bs[0] !== undefined && bs.every((b) => b === bs[0]) ? allTemplates(templateRowsRef.current).find((t) => t.id === bs[0]) : undefined; return one !== undefined && !isBuiltInTemplate(one.id) ? one.name : '' })(),
        submit: (value) => {
          const name = value.trim()
          setInputMode(null)
          if (name === '') return
          const centre = usable.reduce((acc, p) => ({ x: acc.x + (p.rect.x + p.rect.w / 2) / usable.length, y: acc.y + (p.rect.y + p.rect.h / 2) / usable.length }), { x: 0, y: 0 })
          const keyOf = new Map(usable.map((p, i) => [p.rect.id, `n${i + 1}`]))
          const nodes = usable.map((p) => {
            const key = keyOf.get(p.rect.id) as string
            const dx = Math.round(p.rect.x + p.rect.w / 2 - centre.x)
            const dy = Math.round(p.rect.y + p.rect.h / 2 - centre.y)
            if (isChatPanel(p)) return { key, kind: 'chat' as const, cwd: p.chat.cwd, dx, dy, ...(p.title === undefined ? {} : { title: p.title }) }
            const live = getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd
            // The spec's own command and arguments, verbatim. A panel with NO
            // command is the login shell, and only main resolves that — so it
            // saves as the built-in shell preset rather than as nothing, which
            // is what made a saved template unstartable (M80's verifier).
            return {
              key, kind: 'terminal' as const, cwd: live, dx, dy,
              ...(p.title === undefined ? {} : { title: p.title }),
              ...(p.spec.command === undefined
                ? { presetId: 'shell' }
                : { command: p.spec.command, args: [...(p.spec.args ?? [])] })
            }
          })
          const edges = usable.flatMap((p) => linksOf(p)
            .filter((l) => l.automation?.kind === 'handoff' && l.automation.enabled && keyOf.has(l.to))
            .map((l) => ({ from: keyOf.get(p.rect.id) as string, to: keyOf.get(l.to) as string, trigger: (l.automation as { trigger: HandoffTrigger }).trigger })))
          // M182. THE CANVAS BINDING'S UPDATE (the critic's F1–F4): when every
          // saved panel carries one template's binding and the name typed is
          // that template's, the record is updated THROUGH THE OPERATIONS —
          // `moveNode` for every bound panel, `configureNode` for a terminal or
          // chat's captured fields — so a pool, orchestrator or collect node
          // keeps its kind and its fields and an unselected node is left alone.
          // Refused by name for a dirty diagram draft, a key not in the record
          // or two panels on one key; saved with the revision the rows hold,
          // which are reloaded on every save.
          const bindings = usable.map((p) => p.templateBinding?.templateId)
          const boundId = bindings[0] !== undefined && bindings.every((b) => b === bindings[0]) ? bindings[0] : undefined
          const bound = boundId === undefined ? undefined : allTemplates(templateRowsRef.current).find((t) => t.id === boundId)
          if (bound !== undefined && bound.name === name && !isBuiltInTemplate(bound.id)) {
            void self.updateBoundTemplate(usable.map((p) => p.rect.id)).then((r) => {
              if (r.kind === 'refused') { setInputMode({ kind: 'text', label: r.reason, initial: '', submit: () => setInputMode(null) }); palette.openPalette() }
            })
            return
          }
          void window.canvas.template.save({ name, nodes, edges })
        }
      })
      palette.openPalette()
    },
    // M182. The binding's Update as ONE member, so the text mode's submit and
    // a check drive the same path: every selected panel must carry the same
    // template's binding with a key the record holds, once each.
    updateBoundTemplate: async (panelIds) => {
      if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
      const chosen = panelsRef.current.filter((p) => panelIds.includes(p.rect.id) && (isTerminalPanel(p) || isChatPanel(p)))
      const ids = new Set(chosen.map((p) => p.templateBinding?.templateId))
      const templateId = chosen[0]?.templateBinding?.templateId
      if (chosen.length === 0 || templateId === undefined || ids.size !== 1 || ids.has(undefined)) return { kind: 'refused', reason: 'every selected panel must have been minted by the same template — save as a new template instead' }
      const bound = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
      if (bound === undefined) return { kind: 'refused', reason: `the template these panels came from is gone — save as a new template` }
      if (isBuiltInTemplate(bound.id)) return { kind: 'refused', reason: `${bound.name} is built in — save as a new template (a copy)` }
      if (getDraft(bound.id)?.dirty === true) return { kind: 'refused', reason: `the diagram holds unsaved edits to ${bound.name} — save or reload them first` }
      const seen = new Set<string>()
      let next: PersistedTemplate = bound
      const centre = chosen.reduce((acc, p) => ({ x: acc.x + (p.rect.x + p.rect.w / 2) / chosen.length, y: acc.y + (p.rect.y + p.rect.h / 2) / chosen.length }), { x: 0, y: 0 })
      for (const p of chosen) {
        const key = p.templateBinding!.key
        if (seen.has(key)) return { kind: 'refused', reason: `two panels are bound to ${key} — keep one of them` }
        seen.add(key)
        if (!next.nodes.some((n) => n.key === key)) return { kind: 'refused', reason: `${bound.name} has no node ${key} any more — save as a new template` }
        const moved = moveNode(next, key, Math.round(p.rect.x + p.rect.w / 2 - centre.x), Math.round(p.rect.y + p.rect.h / 2 - centre.y))
        if (moved.kind === 'refused') return moved
        next = moved.template
        const node = next.nodes.find((n) => n.key === key)!
        if (node.kind === 'terminal' || node.kind === 'chat') {
          const patch: Record<string, unknown> = isChatPanel(p)
            ? { cwd: p.chat.cwd, ...(p.title === undefined ? {} : { title: p.title }) }
            : isTerminalPanel(p) ? { cwd: getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd, ...(p.title === undefined ? {} : { title: p.title }), ...(p.spec.command === undefined ? { presetId: 'shell' } : { command: p.spec.command, args: [...(p.spec.args ?? [])] }) } : {}
          const set = configureNode(next, key, patch)
          if (set.kind === 'refused') return set
          next = set.template
        }
      }
      const result = await window.canvas.template.save(next, bound.revision ?? 0)
      if (result.kind !== 'saved') return { kind: 'refused', reason: result.reason }
      resetDraft(bound.id, result.template)
      reloadTemplates()
      return { kind: 'ran', note: `${bound.name} updated to revision ${result.template.revision ?? 0}` }
    },
    // M182. ONE door for every editor: the store's `applyDraftOp` over the
    // saved record (`allTemplates`, so a built-in can be edited into a copy).
    editWorkflow: (templateId, op) => {
      if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
      const saved = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
      const r = applyDraftOp(templateId, saved, op)
      return r.kind === 'ok' ? { kind: 'ok' } : r
    },
    beginWorkflowEdit: (templateId, verb) => {
      const labels = { add: 'add <kind> — terminal, chat, pool, orchestrator or collect', move: 'move <key> <dx> <dy>', set: 'set <key> <field> <value>', remove: 'remove <key>', edge: 'edge <from> <to> <trigger>', unedge: 'unedge <from> <to>' }
      setInputMode({
        kind: 'text', label: `${labels[verb]} — on ${allTemplates(templateRowsRef.current).find((t) => t.id === templateId)?.name ?? templateId}`, initial: '',
        submit: (value) => {
          const words = value.trim().split(/\s+/).filter((w) => w !== '')
          // The same plan line the agent door takes, so the two doors cannot differ.
          void self.runAgentPlan(`workflow-${verb} ${templateId} ${words.join(' ')}`).then((reply) => {
            if (reply.kind === 'refused') { setInputMode({ kind: 'text', label: reply.reason, initial: '', submit: () => setInputMode(null) }); palette.openPalette() }
            else setInputMode(null)
          })
        }
      })
      palette.openPalette()
    },
    saveWorkflow: async (templateId) => {
      const r = await saveWorkflowDraft(templateId)
      return r.kind === 'saved' ? { kind: 'ran', note: 'saved' } : { kind: 'refused', reason: r.reason }
    },
    stopWorkflow: (templateId) => stopWorkflowRun(templateId),
    // M184 (the critic, finding 1). `runWorkflow` answers `undefined` on
    // SUCCESS and a refusal SENTENCE on failure (it is the fire path's own
    // shape). The first cut read those the other way round, so the one door
    // with nobody watching reported a refusal for every run that started and
    // a success for every one that did not.
    runWorkflowNow: (templateId, caller) => {
      const refusal = runWorkflowNow(templateId, caller)
      return refusal === undefined ? { kind: 'ran' } : { kind: 'refused', reason: refusal }
    },
    testNode: (templateId, key) => testNodeNow(templateId, key),
    saveWorkflowCopy: async (templateId) => {
      const r = await saveWorkflowCopyDraft(templateId)
      return r.kind === 'refused' ? { kind: 'refused', reason: r.reason } : { kind: 'ran', note: r.name === undefined ? 'saved as a copy' : `saved as ${r.name}` }
    },
    openWorkflow: (templateId) => { openWorkflowPanel(templateId) }
  })
}
