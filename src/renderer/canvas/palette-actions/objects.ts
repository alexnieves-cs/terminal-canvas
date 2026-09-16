/**
 * Authored objects, and what leaves.
 *
 * The objects a person authors — notes, pictures, previews, checklists,
 * decks and sheets — and every door that carries something OUT: the exports,
 * the imports and the three publish verbs.
 *
 * Publishing is from a file a person can SEE (`selectedDraftPath`), and every
 * outward path goes through main so the scrub runs where the bytes are.
 *
 * One slice of `usePaletteActions`. Every body here is the one that lived in
 * that file before the split, moved verbatim — see `./types.ts` for why `ctx.self`
 * is the object under construction rather than a getter.
 */

import { checklistController } from '@renderer/file/checklist-controllers'
import { deckController } from '@renderer/file/deck-controllers'
import { sheetController } from '@renderer/file/sheet-controllers'
import { notify, notifyDone, notifyFailed } from '../../shell/toast'
import { deckExportSentence } from '@shared/deck-pptx'
import type { GithubPublishRequest } from '@shared/ipc-contract'
import { isFilePanel } from '@renderer/panels/panels'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type ObjectsActions = Pick<PaletteActions,
  | 'createObject'
  | 'editChecklist'
  | 'handChecklist'
  | 'editDeck'
  | 'writeDeck'
  | 'reviewDeck'
  | 'presentDeck'
  | 'exportDeckPdf'
  | 'editSheet'
  | 'reviewSheet'
  | 'exportPanelText'
  | 'exportCanvasPng'
  | 'exportCanvas'
  | 'importCanvas'
  | 'importDocx'
  | 'exportDeck'
  | 'exportPack'
  | 'importPack'
  | 'importSamplePack'
  | 'publishRelease'
  | 'publishComment'
  | 'publishDiscussion'
  | 'beginPublish'
  | 'addNote'
  | 'setNoteText'
  | 'setNoteTint'
  | 'addImage'
  | 'replaceImage'
  | 'openPreview'
  | 'bindPreview'
  | 'setPreviewWidth'
  | 'capturePreview'
  | 'startDevServer'
  | 'prepareFeedback'
  | 'say'
>

export function objectsActions(ctx: ActionCtx): ObjectsActions {
  const {
    createObjectNow, prepareFeedbackNow, exportCanvasFile, importCanvasFile, importDocxFile,
    exportPackFile, importPackFile, importSamplePackFile, addNote, setNoteText, setNoteTint,
    addImageFromPath, replaceImagePanel, openPreviewNow, bindPreviewNow, setPreviewWidthNow,
    capturePreviewNow, startDevServerNow, registry, panelsRef, selectedIdsRef, setInputMode,
    self
  } = ctx
  /**
   * M255. The ONE selected panel's draft path, or the named reason there is
   * none. Publishing is from a file a person can see on the canvas, never
   * from whatever happened to be focused last.
   */
  const selectedDraftPath = (): string | { reason: string } => {
    const ids = [...(selectedIdsRef.current ?? [])]
    if (ids.length !== 1) return { reason: 'select the one draft file to publish first' }
    const panel = (panelsRef.current ?? []).find((p) => p.rect.id === ids[0])
    if (panel === undefined || !isFilePanel(panel)) return { reason: 'the selected panel is not a file — select the draft (RELEASE_NOTES.md, PR_COMMENT.md…) to publish it' }
    return panel.source.path
  }
  /** M255. One publish, its three answers kept three: published, cancelled (never a refusal), refused by name. */
  const publishDraft = async (target: { kind: 'release'; tag: string } | { kind: 'comment'; number: number } | { kind: 'discussion'; category: string }, file?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const path = file !== undefined && file.trim() !== '' ? file.trim() : selectedDraftPath()
    if (typeof path !== 'string') return { kind: 'refused', reason: path.reason }
    const result = await window.canvas.github.publish({ ...target, path } as GithubPublishRequest)
    if (result.kind === 'published') return { kind: 'ran', note: `published${result.url === '' ? '' : ` — ${result.url}`}${result.redacted === 0 ? '' : ` · ${result.redacted} secret${result.redacted === 1 ? '' : 's'} redacted`}` }
    if (result.kind === 'cancelled') return { kind: 'ran', note: 'nothing was published' }
    return { kind: 'refused', reason: result.reason }
  }

  return ({
    createObject: createObjectNow,
    editChecklist: async (panel, operation, value) => checklistController(panel)?.edit(operation, value) ?? { kind: 'refused', reason: 'open a checklist in this workspace first' },
    handChecklist: async (panel, line, agent) => checklistController(panel)?.hand(line, agent) ?? { kind: 'refused', reason: 'open a checklist in this workspace first' },
    // M248. A plan line cannot hold a newline (runAgentPlan refuses control
    // characters), so `\n` typed in the text is one.
    editDeck: async (panel, slide, text, origin = 'person') => deckController(panel)?.edit(slide, text.replace(/\\n/g, '\n'), origin) ?? { kind: 'refused', reason: `${panel} is not an open deck in this workspace` },
    writeDeck: async (panel, text, origin = 'person') => deckController(panel)?.write(text.replace(/\\n/g, '\n'), origin) ?? { kind: 'refused', reason: `${panel} is not an open deck in this workspace` },
    reviewDeck: async (panel, action, slides, origin = 'person') => {
      const words = slides.trim().split(/\s+/).filter(Boolean)
      if (words.length === 0) return { kind: 'refused', reason: 'name the slides to keep or discard, or all' }
      return deckController(panel)?.review(action, words.length === 1 && words[0] === 'all' ? 'all' : words, origin) ?? { kind: 'refused', reason: `${panel} is not an open deck in this workspace` }
    },
    presentDeck: async (panel, origin = 'person') => deckController(panel)?.present(origin) ?? { kind: 'refused', reason: `${panel} is not an open deck in this workspace` },
    exportDeckPdf: async (panel) => deckController(panel)?.exportPdf() ?? { kind: 'refused', reason: `${panel} is not an open deck in this workspace` },
    editSheet: async (panel, cell, value, caller) => sheetController(panel)?.edit(cell, value, caller) ?? { kind: 'refused', reason: `${panel} is not an open sheet in this workspace` },
    reviewSheet: async (panel, operation, target, caller) => sheetController(panel)?.review(operation, target ?? 'all', caller) ?? { kind: 'refused', reason: `${panel} is not an open sheet in this workspace` },
    // M58. Fire-and-forget into main, which owns the dialog, the write and
    // the reveal; a refusal is logged, since the palette has no toast.
    exportPanelText: (panelId) => {
      // M112. The live buffer rides along when the panel has one, so an
      // export works with persistence off; main decides which source wins.
      const session = registry.get(panelId)
      // `buffer` is `undefined` when the panel never spawned — spread into
      // the request object, that would normally be the `key: undefined`
      // shape the absent-stays-absent rule warns about, but it is benign
      // HERE because main discriminates on `typeof buffer === 'string'`,
      // not `'buffer' in req`. A later refactor to an `in` check would
      // silently flip an unspawned panel's `off` result to `empty`.
      const buffer = session && session.spawned ? session.handle.serialize() ?? undefined : undefined
      void window.canvas.export.panelText({ panelId, buffer }).then((r) => {
        // M112 (review round 1, IMPORTANT 3). The one place `source` is read:
        // a written result names which of the two sources actually answered.
        //
        // Round 8. That comment used to end "the palette has no toast, so
        // console feedback is the whole of it" — which meant an export
        // announced its success to nobody, and a person who had just written
        // a file had no way to know it or to find where it went. There is a
        // toast layer now, and the PATH is the detail line, because "exported"
        // without a location is half an answer.
        if (r.kind === 'written') {
          console.info(`[export] panel text written from the ${r.source} — ${r.path}`)
          notifyDone(`Exported this panel's text from the ${r.source}`, r.path)
        } else if (r.kind !== 'cancelled') {
          // Cancelled is the person's own choice and is never reported back
          // to them — a toast saying "you cancelled" is the app narrating.
          console.warn(`[export] panel text: ${r.kind}${'reason' in r ? ` — ${r.reason}` : ''}`)
          notifyFailed("Couldn't export this panel's text", 'reason' in r ? r.reason : r.kind)
        }
      })
    },
    exportCanvasPng: () => {
      void window.canvas.export.canvasPng().then((r) => {
        if (r.kind === 'failed') { console.warn(`[export] canvas png — ${r.reason}`); notifyFailed("Couldn't export the canvas", r.reason); return }
        if (r.kind !== 'cancelled') notifyDone('Exported the canvas as a picture', 'path' in r ? r.path : undefined)
      })
    },
    exportCanvas: (path, withPixels) => exportCanvasFile(path, withPixels === 'with-pictures'),
    importCanvas: (path) => importCanvasFile(path),
    importDocx: (path) => importDocxFile(path),
    // M251. ONE action for the four doors. The renderer hands main a PATH and
    // never the text: main reads the file itself, so what is exported is what
    // is on disk, and the scrub runs where the bytes are.
    exportDeck: async (panelId) => {
      const panel = panelsRef.current.find((p) => p.rect.id === panelId)
      if (panel === undefined) return { kind: 'refused', reason: `there is no panel ${panelId} on this canvas` }
      if (panel.kind !== 'file') return { kind: 'refused', reason: `${panelId} is not a file panel — a deck is a Markdown file` }
      if (!/\.(md|markdown)$/i.test(panel.source.path)) return { kind: 'refused', reason: `${panel.source.path} is not Markdown — a deck is a .md file with --- between slides` }
      const r = await window.canvas.export.deckPptx({ path: panel.source.path })
      return r.kind === 'written' || r.kind === 'cancelled' ? { kind: 'ran', note: deckExportSentence(r) } : { kind: 'refused', reason: deckExportSentence(r) }
    },
    exportPack: (path) => exportPackFile(path),
    importPack: (path) => importPackFile(path),
    importSamplePack: () => importSamplePackFile(),
    // M255. Publishing. The file is the one on the line, else the SELECTED
    // file panel's; main parses the request, reads the draft's own remote and
    // asks the person with the text in front of them before anything leaves.
    publishRelease: (tag, file) => publishDraft({ kind: 'release', tag }, file),
    publishComment: (number, file) => publishDraft({ kind: 'comment', number: Number(String(number).replace(/^#/, '')) }, file),
    publishDiscussion: (category, file) => publishDraft({ kind: 'discussion', category }, file),
    beginPublish: (kind) => {
      const path = selectedDraftPath()
      if (typeof path !== 'string') { self.say(path.reason); return }
      const label = kind === 'release' ? 'Publish as a release — the tag (e.g. v1.2.0)…' : kind === 'comment' ? 'Comment on pull request number…' : 'Post as a Discussion in category…'
      setInputMode({
        kind: 'text',
        label,
        initial: kind === 'discussion' ? 'Announcements' : '',
        submit: (value) => {
          setInputMode(null)
          const run = kind === 'release' ? self.publishRelease(value.trim(), path) : kind === 'comment' ? self.publishComment(value.trim(), path) : self.publishDiscussion(value.trim(), path)
          void run.then((result) => self.say(result.kind === 'ran' ? (result.note ?? 'published') : result.reason))
        }
      })
    },
    addNote: (form, text) => addNote(form, text),
    setNoteText: (panelId, text) => setNoteText(panelId, text),
    setNoteTint: (panelId, tint) => setNoteTint(panelId, tint),
    addImage: (path) => addImageFromPath(path),
    replaceImage: (panelId, path) => replaceImagePanel(panelId, path),
    openPreview: (url) => openPreviewNow(url),
    bindPreview: () => bindPreviewNow(),
    setPreviewWidth: (device) => setPreviewWidthNow(device),
    capturePreview: () => capturePreviewNow(),
    startDevServer: (script) => startDevServerNow(script),
    prepareFeedback: (says) => prepareFeedbackNow(says),
    // M149. The feedback line as a door of its own: the shape every refusal
    // reopen already uses (a text mode with `feedback`), for a refusal that
    // arrives on a keystroke and would otherwise be swallowed. Enter or
    // Escape closes it; nothing is submitted.
    // M265. Suppress a queue-count restatement the pill already owns — the
    // polite live region still names which panel arrived.
    // Round 8. It is a TOAST now, not the palette.
    //
    // What this line used to do was open the entire command palette — a modal
    // surface with a text input, over the canvas — in order to show one
    // sentence like "copied". A person who pressed Cmd+C got their canvas
    // covered and owed a keystroke to get it back. The palette's feedback
    // line is still exactly right where it started: for a refusal of
    // something typed IN the palette, where the line is kept beside the text
    // so it can be corrected (see the `refused` sites above, and
    // `verbs.1`). This door is the other case — an outcome that arrived while
    // the person was looking at their work — and it belongs in a layer that
    // does not take the screen.
    //
    // The attention suppression moves INTO `notify`, unchanged, so there is
    // one table and not two.
    say: (sentence: string) => { notify({ sentence }) }
  })
}
