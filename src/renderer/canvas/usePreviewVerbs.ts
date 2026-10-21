import { type Dispatch, type RefObject, type SetStateAction, useCallback } from 'react'
import type { Registry } from '@renderer/session/session-registry'
import type { PersistedWorkItem } from '@shared/work-items'
import { REASON_TOOL_UNREAD } from '@shared/tool-spec'
import { getLiveSession } from '@renderer/session/live-session-store'
import { makeImagePanel, isBrowserPanel, isTerminalPanel, isChatPanel, nextZ, REVIEW_GAP, type Panel, IMAGE_W, IMAGE_H } from '@renderer/panels/panels'
import { DEVICE_WIDTHS, deviceWidth, isDeviceWidthId, normalisePreviewPath, type Discovery as PreviewDiscovery, type PreviewBinding } from '@shared/preview'
import { navigateBrowser, browserGuestId } from '@renderer/browser/browser-store'
import { usePreviewReload } from '@renderer/browser/usePreviewReload'
import { normaliseTypedUrl } from '@shared/browser-panel'
import { displayPath } from '@shared/display-path'
import type { PlaceFn } from './place-new'
import type { Point } from './viewport'
import { adoptedRunId, recordOrchEvent, runOfTask } from '../orchestration/orch-record'

/**
 * M501 (E4, the Canvas.tsx split). The preview's verbs (M185 onward): the
 * subject rule, binding a pane, opening and sizing a preview, capturing it
 * and starting a dev server. Lifted out of Canvas VERBATIM as one contiguous
 * run and called at exactly the position it occupied, between replaceImage
 * and openSkillPanel, with one destructured Deps object so every dependency
 * array names the same values.
 */
export interface UsePreviewVerbsDeps {
  commitHistory: (next: Panel[]) => void
  displayPanelsRef: RefObject<Panel[]>
  focusedIdRef: RefObject<string | null>
  nextIdRef: RefObject<number>
  openBrowserPanel: (url: string, preview?: PreviewBinding, at?: Point) => void
  panelsRef: RefObject<Panel[]>
  placer: (opts?: { quiet?: true; lit?: true; exact?: boolean; }) => PlaceFn
  registry: Registry
  selectedIdsRef: RefObject<ReadonlySet<string>>
  selectOnly: (id: string | null) => void
  setPanels: Dispatch<SetStateAction<Panel[]>>
  workItemsRef: RefObject<PersistedWorkItem[]>
}

export function usePreviewVerbs(deps: UsePreviewVerbsDeps) {
  const {
    commitHistory, displayPanelsRef, focusedIdRef, nextIdRef, openBrowserPanel, panelsRef, placer, registry, selectedIdsRef, selectOnly, setPanels, workItemsRef
  } = deps
  /**
   * M185. THE PREVIEW'S FOUR VERBS, all over one subject rule.
   *
   * The SUBJECT of discovery is a running terminal or chat — the panel that
   * has a directory and a process tree — because that is the only thing on
   * this canvas that knows what project is open and what it started. The
   * focused panel first, then the selection; no subject is a REFUSAL BY NAME
   * that says what to select, never a silent nothing.
   */
  const previewSubject = useCallback((): { id: string; cwd: string; pids: number[] } | undefined => {
    const candidates = [focusedIdRef.current, ...selectedIdsRef.current].filter((id): id is string => id !== null && id !== undefined)
    for (const id of candidates) {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (panel === undefined) continue
      if (isChatPanel(panel)) return { id, cwd: panel.chat.cwd, pids: [] }
      if (!isTerminalPanel(panel)) continue
      const status = registry.get(id)?.status
      const cwd = getLiveSession(id)?.cwd ?? panel.spec.cwd
      return { id, cwd, pids: status?.kind === 'running' ? [status.pid] : [] }
    }
    return undefined
  }, [registry])
  // M195 (D03). One subscription for every preview on the canvas: a file
  // change reloads the pane BOUND to the folder it happened in, and no other.
  usePreviewReload({ onScreenPanelsRef: displayPanelsRef })
  const REASON_NO_PREVIEW_SUBJECT = 'select the terminal your project runs in — discovery reads that panel\'s own directory and processes'
  const discoverProject = useCallback(async (): Promise<PreviewDiscovery | { kind: 'refused'; reason: string }> => {
    const subject = previewSubject()
    if (subject === undefined) return { kind: 'refused', reason: REASON_NO_PREVIEW_SUBJECT }
    return window.canvas.preview.discover({ pids: subject.pids, cwd: subject.cwd })
  }, [previewSubject])
  /** The pane the verbs act on: the selected browser panel, else the focused one. */
  const previewPane = useCallback((): Extract<Panel, { kind: 'browser' }> | undefined => {
    const ids = [...selectedIdsRef.current, focusedIdRef.current]
    for (const id of ids) {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (panel !== undefined && isBrowserPanel(panel)) return panel
    }
    return undefined
  }, [])
  /**
   * M195 (D03). THE BINDING, taken from the SAME subject rule discovery reads.
   *
   * That sameness is what makes it honest rather than a guess: the folder a
   * preview reloads for is the folder its candidate list was answered from. A
   * cwd that is not absolute (a preset's `~`, a spec never resolved) binds
   * NOTHING — `shared/places.ts`'s rule reached from the display side: a
   * relative root would have to be resolved against a root nobody chose, and
   * the pane would then follow whatever that guess hit.
   */
  const previewBindingFor = useCallback((subject: { id: string; cwd: string } | undefined): PreviewBinding | undefined => {
    if (subject === undefined) return undefined
    const root = normalisePreviewPath(subject.cwd)
    return root === null ? undefined : { root, sourcePanelId: subject.id }
  }, [])
  const bindPreview = useCallback((paneId?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    // NAMED by the pane's own control, found by the verb's subject rule
    // otherwise — `setPreviewWidth`'s rule, and for its reason: with two panes
    // selected, a control that did not name itself bound the OTHER one and
    // then rendered the success note on the pane that had not changed.
    const named = paneId === undefined ? undefined : panelsRef.current.find((p) => p.rect.id === paneId)
    const pane = named !== undefined && isBrowserPanel(named) ? named : previewPane()
    if (pane === undefined) return { kind: 'refused', reason: 'select a preview pane first' }
    const subject = previewSubject()
    if (subject === undefined) return { kind: 'refused', reason: REASON_NO_PREVIEW_SUBJECT }
    const binding = previewBindingFor(subject)
    if (binding === undefined) {
      return { kind: 'refused', reason: `that panel's folder is not an absolute path (${subject.cwd === '' ? 'it has none' : subject.cwd}) — there is nothing to bind this preview to` }
    }
    // The filesystem root is refused BY NAME rather than accepted: a pane bound
    // to `/` reloads for every change anywhere, which is the behaviour this
    // milestone exists to end, arrived at by a different road.
    if (binding.root === '/') return { kind: 'refused', reason: 'that panel sits at the filesystem root, so binding to it would reload this preview for every change on the machine — point the panel at a project first' }
    setPanels((current) => {
      const next = current.map((p) => (p.rect.id === pane.rect.id && isBrowserPanel(p) ? { ...p, preview: binding } : p))
      commitHistory(next)
      return next
    })
    return { kind: 'ran', note: `${pane.title ?? 'the preview'} reloads for ${displayPath(binding.root, binding.root).short}` }
  }, [commitHistory, previewBindingFor, previewPane, previewSubject])
  /**
   * M195. Why the pane's Bind control is not available, computed at RENDER so
   * the control can be present-and-disabled with its reason rather than
   * answering a refusal after a press. Safe to call here: `focusedIdRef` and
   * `selectedIdsRef` are both assigned during this render, above.
   */
  const previewSubjectReason = previewSubject() === undefined ? REASON_NO_PREVIEW_SUBJECT : undefined
  const openPreview = useCallback(async (url?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    // M252. An unread tool's pane loads NOTHING, from any door — its page is
    // code nobody has read, and pointing the pane at it is running it.
    if (previewPane()?.preview?.reviewed === false) return { kind: 'refused', reason: REASON_TOOL_UNREAD }
    if (url !== undefined) {
      const normalised = normaliseTypedUrl(url)
      if (normalised.kind === 'refused') return { kind: 'refused', reason: normalised.reason }
      // An open pane is POINTED at the page rather than a second pane minted:
      // two panes on one project is the thing a person then has to tidy. The
      // record is written and the guest reloaded through the store's own door,
      // which is what the node listens to — never a second guest.
      const pane = previewPane()
      // M195. The pane is BOUND to the same subject discovery reads, and the
      // note says which folder — so a binding is never made silently, and a
      // pane opened against no subject says it is bound to nothing rather
      // than quietly reloading for everything (which is what it used to do).
      const binding = previewBindingFor(previewSubject())
      // What the note says about the source, for whichever binding the pane
      // ends up with — the new one, the one it already had, or none.
      const sourceNote = (bound: PreviewBinding | undefined): string =>
        bound === undefined ? 'not bound to a folder yet' : `reloads for ${displayPath(bound.root, bound.root).short}`
      // The guest is NAVIGATED (M185's critic, finding 2) — a reload reloads
      // the page it already has, and the record's new url would then be
      // written back to the old one by the guest's own did-navigate.
      if (pane !== undefined && navigateBrowser(pane.rect.id, normalised.url)) {
        // A navigation writes the url with NO history entry (M186's rule — the
        // guest's own did-navigate writes it back constantly). A BINDING is a
        // deliberate change to what this pane is a preview of, so when this
        // open changes one it takes a history entry, the same as the bind door:
        // otherwise the two doors would disagree about whether binding can be
        // undone, and an accidental rebind here could not be.
        const rebinds = binding !== undefined && binding.root !== pane.preview?.root
        setPanels((current) => {
          const next = current.map((p) => (p.rect.id === pane.rect.id && isBrowserPanel(p)
            // An existing binding is KEPT when this open knows no better one: a
            // person navigating a bound preview to another page of the same
            // project has not unbound it.
            ? { ...p, url: normalised.url, ...(binding === undefined ? {} : { preview: binding }) }
            : p))
          if (rebinds) commitHistory(next)
          return next
        })
        return { kind: 'ran', note: `${pane.title ?? 'the preview'} now shows ${normalised.url} · ${sourceNote(binding ?? pane.preview)}` }
      }
      openBrowserPanel(normalised.url, binding)
      return { kind: 'ran', note: `opened ${normalised.url} · ${sourceNote(binding)}` }
    }
    const found = await discoverProject()
    if (found.kind === 'refused') return found
    if (found.kind === 'one') {
      const one = found.candidates[0]
      if (one === undefined) return { kind: 'refused', reason: found.note }
      // M195. Discovery answered ABOUT the subject, so the pane it opens is
      // bound to that subject's own folder — the binding and the candidate
      // come from one question.
      openBrowserPanel(one.url, previewBindingFor(previewSubject()))
      return { kind: 'ran', note: found.note }
    }
    // `many` and `none` are two different next actions and neither is an open:
    // the note says which, and the pane's own list is where a person picks.
    return { kind: 'refused', reason: found.note }
  }, [discoverProject, openBrowserPanel, previewBindingFor, previewPane, previewSubject])
  /**
   * The pane is NAMED by the pane's own control and found by the verb's
   * subject rule otherwise. The first cut had the control `selectOnly` the
   * pane and then call this, which reads the selection through a ref that
   * React had not written yet — the chip did nothing at all on a pane that
   * was not already selected, and the state update it depended on arrived
   * one render later.
   */
  const setPreviewWidth = useCallback((device: string, paneId?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    if (!isDeviceWidthId(device)) return { kind: 'refused', reason: `${device} is not a device width — ${DEVICE_WIDTHS.map((d) => d.id).join(', ')}` }
    const named = paneId === undefined ? undefined : panelsRef.current.find((p) => p.rect.id === paneId)
    const pane = named !== undefined && isBrowserPanel(named) ? named : previewPane()
    if (pane === undefined) return { kind: 'refused', reason: 'select a preview pane first' }
    setPanels((current) => {
      // `full` is the ABSENT default, so choosing it REMOVES the key rather
      // than writing `device: 'full'`: the record, the parser and the node all
      // spell "the pane's own width" as the absence, and a written `full`
      // would be a second spelling that only the parser would ever see.
      const next = current.map((p) => {
        if (p.rect.id !== pane.rect.id || !isBrowserPanel(p)) return p
        const { device: _was, ...rest } = p
        return (device === 'full' ? rest : { ...rest, device }) as typeof p
      })
      commitHistory(next)
      return next
    })
    return { kind: 'ran', note: `${deviceWidth(device).label} in ${pane.title ?? 'the preview'}` }
  }, [commitHistory, previewPane])
  const capturePreviewNow = useCallback(async (): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const pane = previewPane()
    if (pane === undefined) return { kind: 'refused', reason: 'select a preview pane first' }
    const guestId = browserGuestId(pane.rect.id)
    if (guestId === undefined) return { kind: 'refused', reason: 'no page is open in this pane — open one, then capture it' }
    const shot = await window.canvas.preview.capture({ webContentsId: guestId })
    if (shot.kind === 'refused') return { kind: 'refused', reason: shot.reason }
    // A capture is an ORDINARY image object, not a new kind: it moves, groups,
    // exports and deletes like every other picture, and its title names the
    // page it is of so its provenance is on screen rather than in a log.
    const imageId = `img${nextIdRef.current++}`
    // D12. The task is the one whose lane the pane previews, found through the
    // binding's source panel — never guessed from the camera or the title.
    const boundTo = pane.preview?.sourcePanelId
    const task = boundTo === undefined ? undefined : workItemsRef.current.find((item) => item.panelId === boundTo)
    const artifact = { kind: 'capture' as const, id: shot.id, url: shot.url, capturedAt: shot.capturedAt, sourcePanelId: pane.rect.id, ...(task === undefined ? {} : { taskId: task.id }) }
    // M402. Beside the pane it is a picture of — its parent — by the one rule.
    const place = placer()
    setPanels((current) => {
      const next = [...current, place(current, makeImagePanel(imageId, { x: pane.rect.x + pane.rect.w + REVIEW_GAP + IMAGE_W / 2, y: pane.rect.y + IMAGE_H / 2 }, nextZ(current), shot.path, `capture · ${shot.host}`, undefined, artifact), { anchored: true, parentId: pane.rect.id })]
      commitHistory(next)
      return next
    })
    selectOnly(imageId)
    // M320. A capture of a task's lane is one of the task's DELIVERABLES, and
    // its provenance used to live only on the image panel — delete the panel,
    // lose the fact. The row keeps it (the capture id is main's file name),
    // naming the pane it was taken in even after that pane is gone.
    if (task !== undefined) {
      void recordOrchEvent({
        runId: runOfTask(task.id) ?? adoptedRunId(task.id), itemId: task.id, event: 'artifact', source: 'person',
        title: `Captured ${shot.host}`, detail: shot.url, key: `capture:${shot.id}`, panelId: pane.rect.id,
        producer: { title: pane.title ?? 'a preview', kind: 'browser' }, at: shot.capturedAt
      })
    }
    return { kind: 'ran', note: `captured ${shot.url}` }
  }, [commitHistory, previewPane, selectOnly])
  const startDevServer = useCallback(async (script?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    // M252. The dev script is a generated tool's COMMAND: no process for an
    // unread one, whichever door asked.
    if (previewPane()?.preview?.reviewed === false) return { kind: 'refused', reason: REASON_TOOL_UNREAD }
    const subject = previewSubject()
    if (subject === undefined) return { kind: 'refused', reason: REASON_NO_PREVIEW_SUBJECT }
    const found = await window.canvas.preview.discover({ pids: subject.pids, cwd: subject.cwd })
    const chosen = script === undefined ? found.scripts[0] : found.scripts.find((s) => s.name === script)
    if (chosen === undefined) {
      return { kind: 'refused', reason: found.scripts.length === 0 ? found.note : `${script} is not one of this project's dev scripts — ${found.scripts.map((s) => s.name).join(', ')}` }
    }
    // Through the ORDINARY spawn door: the dev server is a panel a person can
    // see, read and stop, never a hidden child of the preview. Discovery
    // itself still runs nothing — this is a separate verb a person asked for.
    // `npm run <name>` and not the script's own command: the script line is
    // what npm runs FOR you (it resolves the project's own binaries), and
    // running it directly would miss node_modules/.bin. The pane's tooltip
    // says both, so the promise and the spawn agree (M185's critic, 5).
    const spawned = await window.canvas.spawn.sheet({ cwd: subject.cwd, command: `npm run ${chosen.name}`, title: `${chosen.name} · ${found.project ?? 'project'}` })
    if (spawned.kind === 'refused') return { kind: 'refused', reason: spawned.reason }
    return { kind: 'ran', note: `npm run ${chosen.name} in ${subject.cwd}` }
  }, [previewSubject])

  return { bindPreview, capturePreviewNow, discoverProject, openPreview, previewSubjectReason, setPreviewWidth, startDevServer }
}
