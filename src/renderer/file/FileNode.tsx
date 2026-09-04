import { memo, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { FilePanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { parseWikiLinks, resolveWikiName, type VaultIndex } from '@shared/vault'
import { FILE_MAX_LINES, type FileResult } from '@shared/file-panel'
import { applyFileResult, useFileResult } from '@renderer/session/file-store'
import { buildFileNodeModel } from './file-node-model'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { Pencil, Refresh } from '@renderer/icons'

/**
 * The conflict banner's wording.
 *
 * Two conflict STATES ('disk-changed' and 'refused'), not four or five — a
 * third enum member per non-text arm would be the "add a state" answer the
 * fix-round finding explicitly rejected. What varies is the SENTENCE: "this
 * file changed on disk" is true but weak for a file that was just deleted
 * out from under an open draft, and this repo's standing rule is that two
 * situations with two different fixes must not read as one sentence. So the
 * wording branches on the RESULT's own kind while `conflict` itself stays a
 * plain binary signal of "there is a banner" vs "the save itself was
 * refused".
 */
function conflictMessage(
  conflict: 'disk-changed' | 'refused',
  result: FileResult | undefined
): string {
  if (conflict === 'refused') return 'This file changed on disk, so the save was refused.'
  // Its own sentence, and it has to be: the file is still perfectly readable
  // TEXT, so every generic wording above and below reads as "something
  // changed" when what actually happened is that the file outgrew what this
  // panel can hold — and the fix ("open it somewhere else") is different from
  // every other arm's. It is also the one arm where the ordinary sentence
  // would be actively misleading: "this file changed on disk" invites the
  // user to press Save again, which is exactly the write that would delete
  // the lines past the cap.
  if (result?.kind === 'text' && result.truncatedLines > 0) {
    return `This file grew past the ${FILE_MAX_LINES.toLocaleString()} line viewing limit, so it can no longer be edited here — saving would drop the ${result.truncatedLines.toLocaleString()} lines this panel cannot show.`
  }
  switch (result?.kind) {
    case 'missing':
      return 'This file was deleted from disk.'
    case 'binary':
      return 'This file was replaced with something that no longer looks like text.'
    case 'too-large':
      return 'This file grew past the size this app can show, so it can no longer be edited here.'
    case 'unreadable':
      return 'This file can no longer be read from disk.'
    default:
      return 'This file changed on disk.'
  }
}

/**
 * How long a discard stays armed before it forgets it was ever asked.
 * TerminalPanel's CONFIRM_CLOSE_MS, restated rather than imported: that
 * constant is not exported, and a file panel's confirmation is its own
 * decision that happens to agree today.
 */
const CONFIRM_DISCARD_MS = 3000


/**
 * M85. A note's body with its `[[links]]` painted as controls.
 *
 * One parse, from `shared/vault.ts`, and the offsets it returns are what
 * split the text — a second scan here would be the two-parsers drift the
 * shared module exists to prevent. An UNRESOLVED link is still a link, marked
 * as unresolved, and clicking it offers to create the note: a `[[name]]` that
 * quietly read as text would be a note somebody meant to write.
 */
function renderProseWithLinks(
  body: string,
  vault: { root: string; index: VaultIndex; onOpenNote: (path: string) => void; onCreateNote: (name: string) => void }
): JSX.Element[] {
  const out: JSX.Element[] = []
  let at = 0
  let key = 0
  for (const link of parseWikiLinks(body)) {
    if (link.start > at) out.push(<span key={`t${key++}`}>{body.slice(at, link.start)}</span>)
    const target = resolveWikiName(link.name, vault.index)
    out.push(
      <button
        key={`l${key++}`}
        type="button"
        className={`file-node__wikilink${target === null ? ' file-node__wikilink--unresolved' : ''}`}
        data-wikilink={link.name}
        data-wikilink-resolved={target === null ? 'false' : 'true'}
        title={target === null ? `no note called ${link.name} — click to create it` : target}
        onMouseDown={(event) => { event.stopPropagation() }}
        onClick={(event) => {
          event.stopPropagation()
          if (target === null) vault.onCreateNote(link.name)
          else vault.onOpenNote(target)
        }}
      >{link.text}{target === null && <span className="file-node__wikilink-verb" aria-hidden="true"> · create</span>}</button>
    )
    at = link.end
  }
  if (at < body.length) out.push(<span key={`t${key++}`}>{body.slice(at)}</span>)
  return out
}

export interface FileNodeProps {
  panel: FilePanel
  /**
   * M85. The vault this note belongs to, when it is inside one: its root, the
   * index (so `[[links]]` resolve and backlinks are known) and the verb that
   * opens another note. Absent for every file panel outside a vault, which is
   * most of them — and absent means the links stay literal text, which is the
   * honest rendering when there is no index to resolve them against.
   */
  /**
   * M85. Whether the vault's folder is KNOWN yet. The setting is read
   * asynchronously, so for the first render of a restored canvas every note
   * looks like it is outside a vault; a note that auto-entered its editor in
   * that window would hide the links the vault exists for. False until the
   * settings have answered; a caller with no vault at all passes true.
   */
  vaultReady?: boolean
  vault?: {
    root: string
    index: VaultIndex
    /** Open a note by its path relative to the root. */
    onOpenNote: (path: string) => void
    /** Offer to create a note a link points at but nothing answers. */
    onCreateNote: (name: string) => void
  }
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  /**
   * The same onFocus a terminal panel's body calls, and it buys exactly what
   * it buys for a review node: shouldYieldWheel's rule 3 gives the wheel to
   * the FOCUSED panel, so an unfocused file panel would pan the canvas
   * instead of scrolling its own text. It costs nothing, because a file panel
   * never reaches assignTiers at all — Canvas partitions it out before
   * tiering, so a focused id naming one consumes no LIVE_BUDGET slot.
   */
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  /**
   * SessionHandle.focus() on a panel id — Canvas's own `restoreFocus`, the
   * one the palette and ReviewNode's commit draft already use. The editor
   * textarea is the third surface in this app that takes DOM focus off
   * xterm, so it inherits usePalette's rule 4: an unmounting input's blur
   * leaves focus on `<body>`, where every subsequent keystroke goes nowhere
   * at all. Threaded in rather than looked up here because this layer, like
   * the review layer, deliberately knows nothing about the registry.
   */
  restoreFocus: (id: string) => void
  /**
   * Which panel had app focus when the draft OPENS — captured into a ref at
   * that moment, for the reason usePalette captures rather than clears:
   * `focusedId` still names the terminal panel the user was in, because the
   * edit button's preventDefault deliberately never moved it.
   */
  focusedId: string | null
  /**
   * Shown inside another workspace's lane in M14's merged view, where
   * geometry is read-only. Named `readOnly` rather than a second spelling,
   * to match ReviewNode's own prop of the same name — Canvas.tsx passes
   * `merged` under this name at every one of the five call sites.
   * Suppresses the port handles for the reason ReviewNode's own comment
   * gives: addLink there would write to a workspace record this canvas
   * does not own.
   */
  readOnly?: boolean
  /**
   * Begins a link drag from one of this node's four port handles (M35,
   * Task 7). Required on TerminalPanel's own `onBeginLink`'s precedent: an
   * optional prop here compiles clean on a missed wiring and produces "the
   * ring never appears for file panels" — a feature that reads as
   * unbuilt, `PanelRow.agent`'s own lesson.
   */
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  /**
   * Whether an in-flight link draw would land on THIS panel if released now
   * (M35, Task 7 fix round 1). Required on TerminalPanel's own `linkTarget`
   * precedent: an optional prop here compiles clean on a missed wiring and
   * produces "the ring never appears for file panels" — the exact gap a
   * required `onBeginLink` did not itself catch, because a component that
   * never declares a prop at all has nothing to omit.
   */
  linkTarget: boolean
}

/**
 * A local file on the canvas.
 *
 * Reuses the `.panel` class and `data-panel-id` DELIBERATELY, exactly as
 * ReviewNode does: drag, resize, selection, the pointer corrector and
 * shouldYieldWheel's `closest('.panel')` all key off them, so a bespoke class
 * would mean reimplementing five behaviours that already work.
 *
 * It owns its OWN read, rather than receiving a result from Canvas, for the
 * reason ReviewNode owns its own query and RailPanelRow owns its own
 * agent-state subscription: a canvas can hold several file panels, and lifting
 * their reads into Canvas would make every file change a Canvas re-render —
 * the 60Hz cascade the memo architecture exists to prevent, arriving through
 * a new door. The store fans main's pushes out per panel id instead.
 */
function FileNodeImpl({
  panel, selected, onSelect, onFocus, onBeginDrag, onClose, restoreFocus, focusedId,
  readOnly = false, onBeginLink, linkTarget, vault, vaultReady = true
}: FileNodeProps): JSX.Element {
  const { rect, z } = panel
  const id = rect.id
  const path = panel.source.path
  const result = useFileResult(id)
  // A refresh is a re-run of the effect below rather than a second read path,
  // so "read" and "re-read" cannot drift: one invoke, one arm-the-watch, one
  // place a rejection lands.
  const [refreshToken, setRefreshToken] = useState(0)

  const model = useMemo(
    // Keyed on the three INPUTS, never on a serialised signature of the
    // output. Canvas hands a new `panel` object on every drag frame, but
    // `source` and `title` are carried by REFERENCE through setPanelRect's
    // `{ ...p, rect }`, and `result` is store state a drag does not touch — so
    // React's identity comparison already answers this. ReviewNode's own
    // comment records what the signature version cost: serialising 600 line
    // objects per frame to avoid one object allocation.
    () => buildFileNodeModel({ source: panel.source, title: panel.title, result }),
    [panel.source, panel.title, result]
  )

  // The draft lives HERE, never in file-store.ts. That store's own header
  // says it is "a cache of main's answer, never a second author of it", and a
  // draft is by definition not main's answer. Watcher pushes keep landing in
  // the store while a draft is open — the store stays a faithful cache — and
  // it is this component that decides not to reseed from them.
  const [draft, setDraft] = useState<string | null>(null)
  // The CAS token: the mtime of the result the draft was seeded from. NOT
  // updated by arriving pushes, which is the entire point — a token that
  // followed the disk would make every save succeed and every conflict
  // silent.
  const [baseMtimeMs, setBaseMtimeMs] = useState<number | null>(null)
  const [conflict, setConflict] = useState<null | 'disk-changed' | 'refused'>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const editing = draft !== null

  // The seed the current draft was built from. A ref, not state: comparing
  // against it must not itself trigger a render, and it has to survive
  // across the reseed effect's own writes to `draft`.
  const seedRef = useRef<string>('')
  // Compared against what was SEEDED, not against the live store value —
  // seedRef is the anchor both `dirty` and the reseed effect below share, so
  // the two cannot disagree about what "unsaved" means. Deliberately NOT
  // gated on `result?.kind === 'text'`: whether the file on disk is
  // currently readable has nothing to do with whether the user has unsaved
  // work. Fix-round finding — the `kind` clause used to make `dirty` flip to
  // false the instant a watcher push reported the file missing, so the
  // marker vanished at exactly the moment unsaved work was most at risk.
  const dirty = editing && draft !== seedRef.current

  /**
   * What our own last successful write left on disk, and the mtime main
   * stamped for it.
   *
   * FileWriteResult.mtimeMs was returned and consumed by nobody, and the gap
   * that leaves is a FALSE conflict on the very next edit. Save content that
   * happens to be byte-identical to what is already on disk — revert an edit,
   * or simply press Save twice — and the rename still advances the file's
   * mtime, but file-watch.ts's dedupe hash deliberately EXCLUDES mtimeMs, so
   * the re-read hashes identically and no push is sent. The store therefore
   * still holds the pre-save mtime, the next ✎ seeds `baseMtimeMs` from it,
   * and the next save is refused with "this file changed on disk since it was
   * opened here" — a confident claim about another writer that never existed,
   * offering the user only "discard mine" or "Overwrite theirs".
   *
   * A REF here rather than only `baseMtimeMs` state, because the value has to
   * outlive `closeDraft()` — it is the NEXT draft's seed that is wrong, and by
   * then the state has been thrown away. And keyed on the CONTENT we wrote so
   * it invalidates itself: if anyone else has written since, the watcher push
   * that follows changes `result.content`, the comparison fails, and seeding
   * falls back to the store's own mtime so the CAS correctly refuses. The one
   * case it cannot separate is a third party writing bytes IDENTICAL to ours,
   * where no push arrives either — there the next save refuses as stale,
   * which is the conservative direction and involves no content difference
   * anyway.
   *
   * It stays in the COMPONENT rather than in file-store.ts on that store's own
   * stated rule: it is "a cache of main's answer, never a second author of
   * it", and it holds whole FileResults. Writing this token in would mean
   * either synthesising a `text` result (inventing `lines` and
   * `truncatedLines`, which main alone computes) or teaching the store a
   * second, partial shape — both of which make it an author. A save-time
   * token is this component's own bookkeeping about its own write, so it
   * lives with the draft it belongs to.
   */
  const lastWriteRef = useRef<{ content: string; mtimeMs: number } | null>(null)

  // Captured when the draft OPENS, exactly as ReviewNode's commit draft
  // captures `focusedId` rather than clearing it, and consumed on every exit
  // below — see closeDraft.
  const capturedFocusRef = useRef<string | null>(null)

  /**
   * The two gestures that DESTROY an unsaved draft, each armed once.
   *
   * `dirty` was computed and rendered as a marker and consulted by nothing
   * else: the close × and a bare Escape in the textarea both discarded typed,
   * unsaved work outright. That is the failure this milestone spent a fix
   * round making the marker visible FOR — the user is told there is unsaved
   * work and then loses it to a single mis-aimed click or a reflexive Escape,
   * with nothing recoverable and nothing said.
   *
   * TerminalPanel's × pattern, followed rather than reinvented: one click
   * arms and says so, a second within CONFIRM_DISCARD_MS goes through, and
   * the arming forgets itself. Deliberately NOT a modal — "a dialog on every
   * close trains you to click through the one that mattered", and this app
   * has exactly one modal-shaped surface (the palette's confirm mode) which a
   * panel-local gesture has no business reaching for. Two separate arming
   * states because they are two different verbs with two different losses:
   * the × takes the whole panel, Escape takes only the draft.
   *
   * Armed only while `dirty`. A clean draft has nothing to lose, so it closes
   * outright — the same split TerminalPanel draws between an exited panel and
   * a running one.
   */
  const [closeArmed, setCloseArmed] = useState(false)
  const [discardArmed, setDiscardArmed] = useState(false)
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A file panel unmounts on a workspace switch, and a timer left running
  // would call setState on a gone component.
  useEffect(() => () => {
    if (armTimerRef.current !== null) clearTimeout(armTimerRef.current)
  }, [])
  const disarm = (): void => {
    if (armTimerRef.current !== null) clearTimeout(armTimerRef.current)
    armTimerRef.current = null
    setCloseArmed(false)
    setDiscardArmed(false)
  }
  const arm = (which: 'close' | 'discard'): void => {
    if (armTimerRef.current !== null) clearTimeout(armTimerRef.current)
    if (which === 'close') { setCloseArmed(true); setDiscardArmed(false) }
    else { setDiscardArmed(true); setCloseArmed(false) }
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null
      setCloseArmed(false)
      setDiscardArmed(false)
    }, CONFIRM_DISCARD_MS)
  }

  /**
   * The one way edit mode closes, so every exit restores the keyboard.
   *
   * NO CHECK IN THIS REPO CAN OBSERVE THIS, exactly as ReviewNode's own
   * closeDraft records: the panels suite drives keys through dispatched
   * events, and DOM focus after an unmount is a browser default action an
   * untrusted synthetic event never performs. Deleting the restoreFocus call
   * leaves every automated suite green and leaves the user's next keystroke
   * going nowhere — usePalette's rule 4 failure, silently.
   */
  const closeDraft = (): void => {
    // Every exit clears the arming too, so a timer cannot fire into a panel
    // that has already left edit mode and re-arm nothing visible.
    disarm()
    setDraft(null)
    setConflict(null)
    const fid = capturedFocusRef.current
    capturedFocusRef.current = null
    if (fid !== null) restoreFocus(fid)
  }

  // M27. A note opens ready to write in — that is the whole difference
  // between "a place the user puts thought" and one more read-out.
  //
  // ONCE, behind a ref, and never on every render where `draft === null`:
  // re-entering there would make Escape appear to do nothing at all, since
  // the effect would reopen the draft the user had just discarded. After the
  // first entry a note behaves exactly like any other file panel, and the ✎
  // control is how it is re-entered.
  //
  // Gated on `model.editable` for the reason the save path is gated on it: a
  // truncated or non-text note must not open an editor whose save the gate
  // will then refuse. Such a note opens as a read view instead, which is the
  // honest answer rather than a degradation — there is nothing safe to type.
  const autoEditedRef = useRef(false)
  useEffect(() => {
    if (autoEditedRef.current) return
    if (panel.source.prose !== true) return
    // M85. A note INSIDE A VAULT opens to be read: its links are the point,
    // and an editor over them hides every one. The ✎ control is one click
    // away; a note outside a vault keeps M27's open-to-write. Until the
    // vault's folder is known, nothing is decided — see `vaultReady`.
    if (vaultReady === false) return
    // Decided ONCE: a vault note that opened to read must not snap into its
    // editor later when the root is cleared or re-typed (M85's verifier).
    if (vault !== undefined) { autoEditedRef.current = true; return }
    if (!model.editable || result === undefined || result.kind !== 'text') return
    autoEditedRef.current = true
    seedRef.current = result.content
    setDraft(result.content)
    setBaseMtimeMs(result.mtimeMs)
  }, [panel.source.prose, model.editable, result, vault, vaultReady])

  // Read on mount, close on unmount. This is what makes "the renderer is
  // showing this file" and "main is watching it" one statement: a workspace
  // switch unmounts without disposing, so it correctly stops the watch for a
  // canvas nobody is looking at, and re-arms it on the way back.
  useEffect(() => {
    let live = true
    void window.canvas.file
      .read({ panelId: id, path })
      .then((r) => { if (live) applyFileResult(id, r) })
      // MANDATORY. An unhandled rejection leaves a permanent "reading…", which
      // this milestone's honest-degradation rule forbids: every failure must
      // land in a rendered arm with a sentence. `unreadable` is the arm that
      // already says "this file could not be read: <detail>", which is exactly
      // what a failure at this door means to a user.
      .catch((error: unknown) => {
        if (live) applyFileResult(id, { kind: 'unreadable', detail: String(error) })
      })
    return () => {
      live = false
      void window.canvas.file.close(id)
    }
  }, [id, path, refreshToken])

  // An arriving change while a draft is open. NOT DIRTY reseeds: nothing is
  // lost, and a panel that went stale the moment you opened it to edit would
  // be a worse version of the read view you just left. DIRTY does not: the
  // draft is left exactly as typed and the banner says so, at the moment it
  // happens rather than at the moment the user tries to save.
  useEffect(() => {
    if (draft === null) return
    if (result?.kind !== 'text') {
      // The file stopped being plain, readable text out from under an open
      // draft: deleted, replaced with something binary, grown past the size
      // cap, or gone unreadable. Fix-round finding — this used to bail here
      // silently, so nothing on screen said the file was gone; only
      // model.summary quietly changed to "not found" underneath an editor
      // that still looked perfectly normal. There is no fresh text to
      // reseed from and no mtime to compare, so this is ALWAYS a conflict —
      // unlike the ordinary text-vs-text case below, even a CLEAN draft has
      // just lost the file it was going to save back to.
      setConflict('disk-changed')
      return
    }
    // The file is still text, but it is now TRUNCATED — it grew past
    // FILE_MAX_LINES while the draft was open. This is a conflict and never a
    // reseed, and it is the door the editability gate was bypassed through:
    // buildFileNodeModel sets `editable: false` for a truncated result
    // precisely so a truncated buffer can never be saved back, but that gate
    // only ever guarded the EDIT BUTTON. A draft opened while the file was
    // small, and left untyped-in for a moment while an agent appended 30,000
    // lines, is NOT dirty — so the ordinary "nothing is lost, reseed" arm
    // below would replace the draft with the 10,000-line VIEW of the file and
    // advance baseMtimeMs to the new mtime, at which point the CAS would
    // happily pass and the save would delete everything past the cap. Checked
    // BEFORE the mtime early-return, deliberately: an unchanged mtime cannot
    // produce this today (the edit button refuses a truncated result, so a
    // draft is never seeded from one), but refusing is the safe direction and
    // costs one comparison.
    if (result.truncatedLines > 0) {
      setConflict('disk-changed')
      return
    }
    if (result.mtimeMs === baseMtimeMs) return
    if (dirty) {
      setConflict('disk-changed')
      return
    }
    seedRef.current = result.content
    setDraft(result.content)
    setBaseMtimeMs(result.mtimeMs)
  }, [result, draft, baseMtimeMs, dirty])

  const save = (force: boolean): void => {
    if (draft === null) return
    // THE GATE, ENFORCED WHERE THE WRITE IS ISSUED. `model.editable` was
    // checked only where edit mode is ENTERED, which is a different claim: a
    // draft opened on an editable file can arrive at an uneditable one
    // without passing that door again (the file grows past FILE_MAX_LINES, is
    // replaced with something binary, or is deleted), and until this guard
    // existed `save` consulted nothing but `draft` and `baseMtimeMs`. Do NOT
    // remove this as redundant with the button's own `disabled` — the reseed
    // effect above is a second door into a draft, and that is exactly the
    // path a truncated buffer reached the writer through.
    //
    // Fails VISIBLY. A Save button that silently does nothing is its own
    // defect, so this lands in the same place a rejected write lands, and it
    // reuses the model's own per-arm sentence rather than inventing a generic
    // one — the rule buildFileNodeModel already states for `editableNote`.
    if (!model.editable) {
      setSaveError(model.editableNote ?? 'This file can no longer be saved from here.')
      return
    }
    setSaveError(null)
    void window.canvas.file
      // No panelId: FileWriteRequest is a plain request/response with
      // nothing to key on the panel that issues it — see its own doc
      // comment in ipc-contract.ts.
      .write({ path, content: draft, baseMtimeMs: force ? null : baseMtimeMs })
      .then((res) => {
        if (res.kind === 'written') {
          // Adopt the mtime main stamped for OUR write, as the current token,
          // before the draft closes — see lastWriteRef above for why the ref
          // is the half that matters (this setState is thrown away by
          // closeDraft a line later, and is kept because leaving `baseMtimeMs`
          // describing a superseded revision for even one render is a lie
          // waiting for a future reader to depend on).
          lastWriteRef.current = { content: draft, mtimeMs: res.mtimeMs }
          setBaseMtimeMs(res.mtimeMs)
          // Leave edit mode on success through the same door every other
          // exit uses, so focus comes back exactly once. The watcher's own
          // push will bring the saved content back through the store a
          // moment later, so there is nothing to reseed by hand — one code
          // path for "what does this file say", the same reason the refresh
          // control re-runs the read effect rather than being a second read.
          closeDraft()
          return
        }
        if (res.kind === 'stale') { setConflict('refused'); return }
        setSaveError(res.detail)
      })
      // MANDATORY, the rule the read effect already states: an unhandled
      // rejection leaves a draft that looks saved and is not.
      .catch((error: unknown) => setSaveError(String(error)))
  }

  return (
    <PanelFrame
      id={id}
      kind="file"
      rect={rect}
      z={z}
      selected={selected}
      linkTarget={linkTarget}
      readOnly={readOnly}
      title={model.heading}
      kindWord={model.prose ? 'note' : 'file'}
      onSelect={onSelect}
      onBeginDrag={onBeginDrag}
      onBeginLink={onBeginLink}
      // Arms only while a draft is DIRTY: an unsaved draft is unrecoverable
      // state, exactly like a running process, and reopening the file brings
      // back what is on DISK. A clean panel still closes on one click.
      close={readOnly ? null : {
        armed: closeArmed,
        title: closeArmed ? 'Click again to close and lose your unsaved changes' : 'Close this file',
        armedText: 'lose edits?',
        attrs: { 'data-file-node-close': '' },
        onMouseDown: (event) => {
          event.stopPropagation()
          event.preventDefault()
          if (!dirty || closeArmed) { disarm(); onClose(id); return }
          arm('close')
        }
      }}
      chrome={<>
        {/* Short by construction ("2 KB · 40 lines", "not found"), so it sits
            in the chrome row. The DIRECTORY is an absolute path and would
            squash the heading out of a one-line header, so it renders at the
            top of the body instead — still its own field rather than spliced
            into the heading, which is the rule the inspector's own file arm
            states. */}
        <span className="pf__summary file-node__summary" data-file-node-summary>{model.summary}</span>
        {dirty && (
          // Visible unsaved-work marker. An editor that gives no sign of a
          // pending, un-persisted draft is its own defect — the user has no
          // way to tell "I have edits" from "everything is saved" short of
          // pressing Save and hoping. Amber, matching this app's other
          // "something here wants your attention" colour.
          //
          // Deliberately independent of whether the file is currently
          // READABLE (`dirty` no longer checks `result?.kind`). Whether the
          // draft differs from what it was seeded with has nothing to do
          // with whether disk can presently answer a read — and the case
          // this marker matters most for is exactly the one where the two
          // used to disagree: the file gets deleted out from under an open,
          // edited draft, and the marker must not vanish at the one moment
          // the unsaved work is most at risk.
          <span className="file-node__dirty" data-file-node-dirty title="Unsaved changes">●</span>
        )}
        <button
          type="button"
          className={`file-node__edit${editing ? ' file-node__edit--on' : ''}`}
          data-file-node-edit
          aria-pressed={editing}
          disabled={!model.editable || editing}
          // Present and DISABLED rather than hidden. verify:palette 31's rule:
          // a control that disappears is indistinguishable from a feature that
          // was never built, and a user who wants to edit a 40,000-line log is
          // precisely the person who will go looking for this button.
          title={model.editable ? (editing ? 'Editing — save or discard to finish' : 'Edit this file') : model.editableNote}
          onMouseDown={(event) => {
            // shellControl's rule, which every control in this app obeys:
            // preventDefault keeps DOM focus off the button, stopPropagation
            // stops the header starting a drag from a click inside it.
            event.stopPropagation()
            event.preventDefault()
            if (!model.editable || result?.kind !== 'text') return
            seedRef.current = result.content
            setDraft(result.content)
            // The store's mtime is the freshest answer EXCEPT after a save
            // whose content matched what was already there, which pushes
            // nothing — see lastWriteRef. Keyed on the content, so a genuine
            // third-party write (which does push, and does change the
            // content) falls back to the store and the CAS still refuses.
            const lw = lastWriteRef.current
            setBaseMtimeMs(lw !== null && lw.content === result.content ? lw.mtimeMs : result.mtimeMs)
            setConflict(null)
            setSaveError(null)
            capturedFocusRef.current = focusedId
          }}
        >
          <Pencil />{editing && <span className="file-node__edit-label">editing</span>}
        </button>
        {/* M67. Save lives in the chrome row beside the toggle that opened
            the draft, never over the body (brief, The panel frame). Same
            class and hook as before, so the save-error check still finds it. */}
        {editing && (
          <button
            type="button"
            className="file-node__save"
            data-file-node-save
            title="Save (⌘S)"
            onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); save(false) }}
          >
            Save
          </button>
        )}
        <button
          type="button"
          className="file-node__refresh icon-button"
          title="Read this file again"
          onMouseDown={(event) => {
            // preventDefault is what keeps DOM focus off this button and on
            // whatever had it — shellControl's rule, which every control in
            // this app obeys. stopPropagation is what stops the header's own
            // handler starting a DRAG from a click on a button inside it.
            event.stopPropagation()
            event.preventDefault()
            setRefreshToken((n) => n + 1)
          }}
        >
          <Refresh />
        </button>
      </>}
    >


      <div
        className="pf__body pf__body--text file-node__body"
        // The marker shouldYieldWheel looks for. It is an ATTRIBUTE on the
        // element that actually scrolls, so "does this panel own its wheel" is
        // answered by what the KIND renders rather than by a branch inside the
        // predicate — see Canvas.tsx's rule 3, which needed no edit for this
        // kind precisely because of that.
        data-scroll-host
        onMouseDown={(event) => {
          event.stopPropagation()
          onFocus(id)
        }}
        // stopPropagation on EVERY key, not only ones handled here (there are
        // none). useViewport's keydown listener is on `window`, above this
        // component in the bubble path, so without this a Cmd+N pressed while
        // reading spawns a panel behind the file and a Cmd+K opens the palette
        // over it.
        onKeyDown={(event) => event.stopPropagation()}
      >
        <p className="file-node__directory" data-file-node-directory>{model.directory}</p>
        {editing ? (
          <>
            {conflict !== null && (
              <div className="file-node__conflict" data-file-node-conflict>
                <span>{conflictMessage(conflict, result)}</span>
                {/* One label for every arm, including 'missing': the action
                    is always closeDraft(), which discards the draft and
                    returns to the READ view — and the read view then shows
                    whatever the CURRENT result is (fresh text, or the
                    "not found"/binary/too-large/unreadable note), which is
                    honestly what "reload" means here. There is no separate
                    "load fresh content into the editor" behaviour to word
                    differently for a file with no text left to load. */}
                <button
                  type="button"
                  onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); closeDraft() }}
                >
                  Reload (discard mine)
                </button>
                {conflict === 'refused' && (
                  <button
                    type="button"
                    onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); save(true) }}
                  >
                    Overwrite theirs
                  </button>
                )}
              </div>
            )}
            {saveError !== null && <p className="pf__note file-node__note" data-file-node-save-error>{saveError}</p>}
            {discardArmed && (
              // The arming has to be VISIBLE or it is just a key that stopped
              // working: a first Escape that silently does nothing reads as a
              // broken editor, which is worse than the discard it prevents.
              <p className="pf__note file-node__note" data-file-node-discard-armed>
                Press Escape again to discard your unsaved changes.
              </p>
            )}
            <textarea
              className="file-node__editor"
              data-file-node-editor
              autoFocus
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Every key, not only the two handled here — useViewport's and
                // usePalette's listeners are on `window`, above this in the
                // bubble path, so without this a Cmd+N typed into a draft
                // spawns a panel behind the file. useNavGrid's listener is
                // CAPTURE-phase on `window` and has already run by the time
                // this stopPropagation could reach it — that guard is widened
                // separately, in useNavGrid.ts itself, to name this class.
                event.stopPropagation()
                if (event.metaKey && event.key === 's') { event.preventDefault(); save(false) }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  // Escape on a DIRTY draft arms rather than discards. It is
                  // the most reflexive key on this surface — the way out of
                  // every other overlay in this app — and until this guard it
                  // was also the fastest way to lose typed work with no
                  // confirmation and no undo. A clean draft still leaves on
                  // one press: there is nothing to lose, and making the
                  // ordinary exit ask twice is how a confirmation stops being
                  // read.
                  if (!dirty || discardArmed) { disarm(); closeDraft(); return }
                  arm('discard')
                }
              }}
            />
          </>
        ) : model.note !== undefined ? (
          <p className="pf__note file-node__note" data-file-node-note>{model.note}</p>
        ) : model.prose ? (
          /* M27. A note renders as WRAPPED PROSE with no gutter. It is the
             same `model.lines` the code view uses, joined back — the model
             carries the file's real numbering either way, and what changes
             here is only the painting. `data-file-node-lines` stays on it, so
             every existing reader that asks "is there content on screen"
             keeps working for a note without knowing notes exist. */
          <div className="file-node__prose" data-file-node-lines>
            {/* M85. Inside a vault a `[[name]]` is a CONTROL: it opens the
                note it names, or offers to create it. Outside one it stays
                the text it is — there is no index to resolve it against, and
                a control that could not act would be worse than the text. */}
            {vault === undefined
              ? model.lines.map((line) => line.text).join('\n')
              : renderProseWithLinks(model.lines.map((line) => line.text).join('\n'), vault)}
          </div>
        ) : (
          <pre className="file-node__pre" data-file-node-lines>
            {model.lines.map((line) => (
              <div className="file-node__line" key={line.n}>
                {/* The number of the line in the FILE, from the model, never
                    the array index — the two differ the moment anything is
                    dropped ahead of a rendered line. */}
                <span className="file-node__gutter">{line.n}</span>
                <span className="file-node__text">{line.text}</span>
              </div>
            ))}
          </pre>
        )}
        {model.truncatedNote !== undefined && (
          <p className="pf__more file-node__more" data-file-node-truncated>{model.truncatedNote}</p>
        )}
        {/* M85. BACKLINKS: the notes pointing at this one. Three states, and
            the first is the one that matters — a note outside a vault shows
            no section at all (there is no index, and an empty "Backlinks"
            header would claim nothing points here when nothing was ever
            asked), a note inside one with no incoming links says so, and the
            rest is the list. */}
        {vault !== undefined && panel.source.prose === true && (() => {
          const rel = panel.source.path.startsWith(`${vault.root.replace(/\/+$/, '')}/`)
            ? panel.source.path.slice(vault.root.replace(/\/+$/, '').length + 1)
            : null
          if (rel === null) return null
          const rows = vault.index.backlinks[rel] ?? []
          return (
            <div className="file-node__backlinks" data-file-backlinks={String(rows.length)}>
              <p className="file-node__backlinks-head">Backlinks</p>
              {rows.length === 0 ? (
                <p className="pf__note" data-file-backlinks-arm="none">no note points here yet</p>
              ) : (
                <ul className="file-node__backlinks-list">
                  {rows.map((b) => (
                    <li key={`${b.path}:${b.line}`} className="file-node__backlink">
                      <button
                        type="button"
                        className="file-node__backlink-verb"
                        data-file-backlink={b.path}
                        title={`${b.path} line ${b.line}`}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); vault.onOpenNote(b.path) }}
                      >{b.title}</button>
                      <span className="file-node__backlink-line">line {b.line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })()}
      </div>

    </PanelFrame>
  )
}

export const FileNode = memo(FileNodeImpl)
