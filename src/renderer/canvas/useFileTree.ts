import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Registry } from '@renderer/session/session-registry'
import { isChatPanel, isFilePanel, type Panel } from '@renderer/panels/panels'
import type { SettingRow } from '@shared/ipc-contract'
import type { DirResult } from '@shared/fs-tree'
import type { LiveSession } from '@renderer/session/live-session-store'
import { buildFileRows, relativePath, shellQuote, treeSignature } from '../shell/file-tree-model'
import { EMPTY_ROWS } from './canvas-constants'
import { insertIntoComposer } from '@renderer/chat/chat-store'
import { inspectionDirectory } from './inspection-directory'

export interface FileTreeDeps {
  registry: Registry
  /**
   * Both come from useRailModels rather than being re-derived here: a second
   * `panels.find(...)`/`useLiveSession(...)` pair would be a second read of
   * the identical fact.
   */
  selectedPanel: Panel | undefined
  selectedLive: LiveSession | undefined
  selectedId: string | null
  /** Identity is the change signal; see useShellChrome's settingsSignal. */
  settingRows: SettingRow[]
  focusedIdRef: RefObject<string | null>
  /**
   * M194. `insertPath` needs the focused panel's RECORD, not only its id: a
   * chat's insertion target is its composer and its own cwd, neither of which
   * the session registry knows about. A ref, never `panels`, for the reason
   * every other ref in this hook is one — `panels` is a fresh array per
   * setPanelRect and would re-make the callback at 60Hz through a drag.
   */
  panelsRef: RefObject<Panel[]>
  /**
   * Published here, read by `beginNewNote`, which is declared ABOVE this
   * hook's call site — the ref is what carries the value backwards.
   */
  noteRootRef: RefObject<string | null>
}

/**
 * The file tree column: its root, its expanded directories, its rows, and the
 * click-to-paste verb.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split).
 *
 * The root/paste asymmetry is the load-bearing part and is easy to "fix" into
 * a bug: the tree ROOTS on the SELECTED panel, while `insertPath` pastes into
 * the FOCUSED one, and it resolves an absolute path whenever the two differ.
 * They are genuinely different questions — a rail click selects without
 * focusing — and collapsing them onto one id makes the tree paste a relative
 * path into a panel sitting in a different directory.
 *
 * `noteRoot` is here rather than beside the tree's other derived values only
 * because it is DERIVED from `treeRoot`; it is note-creation state, and it
 * falls back to a selected file panel's containing directory, which `treeRoot`
 * itself deliberately does not do.
 */
export function useFileTree(deps: FileTreeDeps) {
  const {
    registry, selectedPanel, selectedLive, selectedId, settingRows,
    focusedIdRef, panelsRef, noteRootRef
  } = deps

  /**
   * The file tree's root: the SELECTED panel's directory, live where tmux can
   * answer and its spawn cwd otherwise. That fallback is CLAUDE.md's stated
   * rule for a consumer of M12's live-cwd store: a consumer needs A directory
   * and makes no claim about one, so the fallback is never worse than not
   * shipping. A review NODE has no cwd at all — it owns no session — so it
   * roots at the repository its subject names, which the node persists and
   * which therefore survives its subject.
   *
   * Reuses `selectedPanel`/`selectedLive` from the inspector block above
   * rather than re-deriving them: both are already in scope, and a second
   * `panels.find(...)`/`useLiveSession(...)` pair would be a second read of
   * the identical fact.
   */
  const directory = inspectionDirectory(selectedPanel, 'files', selectedLive?.cwd)
  const treeRoot = directory.kind === 'known' ? directory.cwd : null
  // `no-directory` deliberately carries NO reason, so this stays undefined and
  // Canvas's own empty line — which NAMES the panel (M48 §5) — survives. Only
  // the two states that line has never had words for come through here.
  const treeContextReason = directory.kind === 'absent' || directory.kind === 'unavailable' ? directory.reason : undefined

  // Read the same way glowEnabled/pipsEnabled are, and for the same reason:
  // settingRows is loaded only when the palette OPENS, so the tree must know
  // this whether or not the palette has ever been opened. Main's fs:list
  // handler already reads this setting on EVERY call — it is the renderer
  // side that was missing, so toggling it from the palette flipped the row's
  // own display and left the tree showing whatever it last read.
  const [showHidden, setShowHidden] = useState(false)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'files.showHidden')
      if (row) setShowHidden(row.value === true)
    })
  }, [settingRows])

  // Tag the stored data as well as cancelling writers. Effects run AFTER a
  // render; clearing only in an effect can paint A's files under B's name.
  const subject = JSON.stringify([selectedId, treeRoot, showHidden])
  const [treeState, setTreeState] = useState(() => ({ subject, dirs: new Map<string, DirResult>(), expanded: new Set<string>() }))
  const current = treeState.subject === subject
  const treeDirs = useMemo(() => current ? treeState.dirs : new Map<string, DirResult>(), [current, treeState.dirs])
  const treeExpanded = useMemo(() => current ? treeState.expanded : new Set<string>(), [current, treeState.expanded])
  const generation = useRef(0)

  // A pull, never a push. Three signals and nothing else: the root changed, a
  // directory was expanded, and the refresh control. M9b's standing ruling on
  // review nodes, unchanged — a watcher over a repository this app does not
  // own fires on every build artifact, every editor save and every git command
  // run in a terminal elsewhere, and each firing costs a readdir per expanded
  // directory. The signal worth reacting to is a human looking.
  const readDirInto = useCallback((path: string) => {
    const requested = generation.current
    const apply = (result: DirResult): void => {
      if (requested !== generation.current) return
      setTreeState((prev) => prev.subject === subject ? { ...prev, dirs: new Map(prev.dirs).set(path, result) } : prev)
    }
    void window.canvas.files.list(path).then(apply, () => apply({ kind: 'unreadable', detail: 'the read did not answer' }))
  }, [subject])

  // The root changing DISCARDS the previous root's reads and expansions. Both
  // are keyed by absolute path, so carrying them would be harmless and wrong:
  // the user would switch panels and find another project's directories still
  // open, which reads as the tree having failed to re-root. `showHidden` is a
  // dependency for the identical reason: main answers `fs:list` differently
  // once the setting flips, so a toggle gets the same "clear and re-read"
  // treatment a root change already gets — extending this effect rather than
  // adding a second read path, so there is still exactly one place the tree
  // decides to re-read itself.
  useEffect(() => {
    generation.current++
    setTreeState({ subject, dirs: new Map(), expanded: new Set() })
    if (treeRoot !== null) readDirInto(treeRoot)
    return () => { generation.current++ }
  }, [subject, treeRoot, readDirInto])

  // True while the ROOT's own read is in flight: every selection change, and
  // every press of refresh (which clears treeDirs first). buildFileRows
  // deliberately suppresses the depth-0 `loading` row — that row is reserved
  // for a CHILD of an expanded directory — so nothing else closes this gap on
  // its own; FileTree renders "reading…" instead of "empty directory" while
  // this is true. False once treeDirs has ANY entry for this root path,
  // including a failure-arm entry (`gone`/`not-a-directory`/`unreadable`), not
  // only an `ok` one — the pending state is about whether an answer has
  // landed, not about what it says.

  /**
   * M27. Where a NEW NOTE would be saved. Usually the tree's own root, and
   * deliberately not identical to it.
   *
   * `treeRoot` answers for a TERMINAL panel's cwd or a review node's repo
   * root, and null for a file panel — which is right for the tree, whose job
   * is browsing a project a panel is working in. It is wrong here for a
   * reason that only shows up in use: creating a note SELECTS it, so the very
   * next New note row would be disabled by the note the user just made, and
   * a second note would need them to go and re-select a terminal first. The
   * ordinary case for notes is one beside another.
   *
   * So a selected FILE panel contributes its own containing directory, which
   * is also the answer a user would expect. The tree is left alone rather
   * than widened, because re-rooting it on a file panel is a change to M20's
   * behaviour that this milestone has no business making on the way past.
   *
   * Found by verify:panels 176 failing, not by reading the code: the check
   * reported the row DISABLED on its second run, with the note panel selected.
   */
  const noteRoot = useMemo(() => {
    if (treeRoot !== null) return treeRoot
    if (selectedPanel === undefined || !isFilePanel(selectedPanel)) return null
    const path = selectedPanel.source.path
    const cut = path.lastIndexOf('/')
    if (cut < 0) return null
    return cut === 0 ? '/' : path.slice(0, cut)
  }, [treeRoot, selectedPanel])
  noteRootRef.current = noteRoot

  // (The comment above `noteRoot` interrupts this one's own subject; the
  // pending flag below belongs to the paragraph two blocks up.)
  const treeRootPending = treeRoot !== null && !treeDirs.has(treeRoot)

  const toggleDir = useCallback((path: string) => {
    setTreeState((prev) => {
      if (prev.subject !== subject) return prev
      const next = new Set(prev.expanded)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        // Read only when there is no answer yet. A second read of a directory
        // already answered is a subprocess for nothing — the refresh control
        // is what a user who wants a re-read presses. Fired from inside the
        // updater's BRANCH but not from the updater's return path: this is
        // read-and-store, which is idempotent, unlike the settings write
        // useShellChrome deliberately keeps outside its own updater.
        if (!treeDirs.has(path)) readDirInto(path)
      }
      return { ...prev, expanded: next }
    })
  }, [subject, treeDirs, readDirInto])

  // Re-read the root and everything currently open, keeping the expansion.
  // Clearing `treeDirs` first is what makes every re-read visible: each
  // expanded directory falls back to its `loading` row until its answer lands,
  // rather than showing stale rows that may already be wrong.
  const refreshTree = useCallback(() => {
    if (treeRoot === null) return
    generation.current++
    setTreeState({ subject, dirs: new Map(), expanded: treeExpanded })
    readDirInto(treeRoot)
    for (const path of treeExpanded) readDirInto(path)
  }, [subject, treeRoot, treeExpanded, readDirInto])

  const treeBuilt = treeRoot === null ? EMPTY_ROWS : buildFileRows(treeRoot, treeDirs, treeExpanded)
  const treeSig = treeSignature(treeBuilt)
  // The dep is the SIGNATURE, not treeBuilt: when the signature is equal
  // treeBuilt is equal by construction, so returning the previous array is the
  // mechanism rather than a stale read. Canvas re-renders on every mousemove
  // over the canvas and on every frame of a drag; without this, FileTree's memo
  // is defeated and every row reconciles at 60Hz.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const treeRows = useMemo(() => treeBuilt, [treeSig])

  // The basename only — a home-rooted absolute path would wrap the 220px
  // heading to three lines. Split on '/' rather than importing a path module:
  // the renderer has no node:path, and treeRoot is always POSIX (main resolves
  // it before this ever sees it). '.' is unreachable here on purpose — the
  // root itself is never a row, so there is nothing to render '.' for; a
  // trailing-slash root would produce an empty last segment, which is why the
  // filter drops empty segments before taking the last one.
  const treeRootLabel = useMemo(() => {
    if (treeRoot === null) return null
    const segments = treeRoot.split('/').filter((s) => s.length > 0)
    return segments.length > 0 ? segments[segments.length - 1] : treeRoot
  }, [treeRoot])

  // Relative when the tree's root panel IS the focused panel, absolute
  // otherwise. Selection and focus are deliberately different things here — a
  // rail-row click selects without focusing — so when they differ a relative
  // path is correct in the directory the tree is showing and unresolvable in
  // the shell it lands in, silently, since it is just a path that does not
  // resolve. Absolute is longer, which is visible; wrong is not.
  const insertPath = useCallback((path: string) => {
    const target = focusedIdRef.current
    if (!target || treeRoot === null) return
    const session = registry.get(target)
    if (session !== undefined) {
      const text = target === selectedId ? relativePath(treeRoot, path) : path
      // paste(), never write(). A filename may legally contain a newline on
      // macOS, and write() would submit the fragment before it — the same reason
      // insertPrompt in this file is a paste.
      session.handle.paste(shellQuote(text))
      return
    }
    // M194. Before this milestone the tree could only root on a terminal or a
    // review panel, so the focused panel was a terminal in every case a row
    // existed at all. A chat can now be both, and a chat has NO entry in the
    // session registry — `registry.get(id)?.handle.paste` was therefore
    // `undefined?.`, and every row in the pane was a control that did nothing,
    // with nothing on screen saying why. That is the exact failure
    // `FileTree.tsx`'s own comment names, and it lands squarely on D02's
    // acceptance ("inspect its files and tools WITHOUT creating a terminal").
    //
    // A chat takes the composer's verb, not the shell's: the `@` reference a
    // DROP onto a chat has produced since M75, relative to the CHAT's own
    // directory rather than the tree's root — the two differ whenever
    // selection and focus do, and `relativePath` already answers ABSOLUTE for
    // a path outside the root it is given, which is the right answer there.
    const focused = panelsRef.current?.find((p) => p.rect.id === target)
    if (focused !== undefined && isChatPanel(focused)) insertIntoComposer(target, `@${relativePath(focused.chat.cwd, path)} `)
  }, [treeRoot, selectedId, registry, focusedIdRef, panelsRef])

  return {
    treeRoot, treeRootLabel, treeRows, treeRootPending, treeContextReason, noteRoot,
    toggleDir, refreshTree, insertPath
  }
}
