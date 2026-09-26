/**
 * M276. The file panel's draft surface: Monaco, in the shape the textarea it
 * replaces already had — a controlled `value`/`onChange` pair plus the two
 * keys this app binds on every text surface (⌘S saves, Escape leaves).
 *
 * Monaco is an imperative widget with its own lifecycle, so this is the fourth
 * surface here that manages a DOM object outside React's render (xterm,
 * `<webview>` and the rich note editor being the others), and it inherits
 * their two rules:
 *
 *  1. The editor is created ONCE and disposed once. Recreating it on a prop
 *     change throws away the cursor, the selection and the undo stack — the
 *     whole reason a person is in an editor rather than a textarea.
 *  2. The value flows IN only when it actually differs from what the editor
 *     already shows. Writing every render's `value` back in would fight the
 *     user's own typing, since `onChange` is what produced that `value`.
 */
import { useEffect, useRef, useState, type JSX, type MutableRefObject } from 'react'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { registerEditor } from './editor-registry'
import type { SharedTextTarget } from '../shared-text/target'

/**
 * Monaco is ~3MB and this app opens on a canvas, not on a file. So it is
 * `import()`ed the first time a draft opens rather than at module scope: a
 * static import here would be reached from Canvas.tsx through FileNode and
 * land in the app's first chunk, paid for by every session including the many
 * that never edit anything.
 *
 * Cached in a module-level promise, so the second draft in a session pays
 * nothing and two drafts opened at once share ONE load rather than racing two.
 */
let loading: Promise<typeof import('./monaco')> | null = null
const loadMonaco = (): Promise<typeof import('./monaco')> => (loading ??= import('./monaco'))

type Props = {
  /** The draft text. Flows in on an external change only — see rule 2 above. */
  value: string
  onChange: (next: string) => void
  /** ⌘S. Same handler the textarea bound, so the key means one thing app-wide. */
  onSave: () => void
  /** Escape. Arms a discard on a dirty draft rather than losing it — see FileNode. */
  onEscape: () => void
  /** The file's path, for syntax highlighting only. */
  path: string
  /** Read-only, for a merged view's lane — the same word ReviewNode and FileNode use. */
  readOnly?: boolean
  /**
   * Bind this editor's text to a shared file's Y.Text (shared-text/binding.ts)
   * while the workspace is shared. Read once, at mount, like everything the
   * editor is created with; absent, the editor is exactly what it was.
   */
  shared?: SharedTextTarget
  /** Filled while bound: the owner's discard, putting the shared text back for everyone. */
  sharedRevertRef?: MutableRefObject<((text: string) => void) | null>
  /** M339. The binding's state as it changes (null once it lets go) — FileNode's record of whether its draft is carried. */
  onSharedState?: (state: string | null) => void
}

export function CodeEditor({ value, onChange, onSave, onEscape, path, readOnly, shared, sharedRevertRef, onSharedState }: Props): JSX.Element {
  /**
   * TWO elements, and the split is load-bearing. `rootRef` carries
   * `data-file-node-editor` and holds the pre-paint below, so React owns its
   * children. `hostRef` is handed to Monaco, which appends its own DOM into
   * it imperatively — so React must never render a child there, or the two
   * would each believe they own that subtree.
   */
  const rootRef = useRef<HTMLDivElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  /** The loaded module, for the effects below. A ref, not state: they must not re-run on it. */
  const apiRef = useRef<typeof import('./monaco') | null>(null)
  /**
   * Whether the editor is up. The ONE piece of state here, and it exists for
   * the checks and the reader rather than the paint: until it flips, the host
   * carries `data-file-node-editor-loading`, so a harness that finds the
   * editor element can tell "not ready yet" from "broken" instead of typing
   * into a box with no editor behind it and reading an empty draft as a bug.
   */
  const [ready, setReady] = useState(false)
  /** The shared binding's state, as `data-shared-text` — for the reader's marker and the checks. */
  const [sharedState, setSharedState] = useState<string | null>(null)
  const sharedRef = useRef(shared)
  const revertRef = useRef(sharedRevertRef)
  revertRef.current = sharedRevertRef
  const sharedStateRef = useRef(onSharedState)
  sharedStateRef.current = onSharedState
  /**
   * The three callbacks, read through a ref by the editor's own listeners.
   * Monaco's listeners are registered once for the editor's life (rule 1), so
   * closing over the first render's props would save the first render's draft
   * forever — the stale-closure bug in its most expensive form, since the
   * thing it goes stale about is the bytes that reach disk.
   */
  const handlers = useRef({ onChange, onSave, onEscape })
  handlers.current = { onChange, onSave, onEscape }

  /**
   * The draft, for the async mount below. Between the `import()` starting and
   * the editor existing there is no editor to receive the value sync effect's
   * write, so the editor must be CREATED with whatever the draft says at that
   * later moment — not with the `value` captured when the load began.
   */
  const valueRef = useRef(value)
  valueRef.current = value

  // Guards the echo: `onChange` sets React state, which comes back as `value`,
  // which the sync effect below would write into the model mid-keystroke.
  const echoRef = useRef(false)

  useEffect(() => {
    // Set by the cleanup. A panel closed while Monaco is still loading would
    // otherwise create an editor into a detached node a tick later and leak
    // it, with no unmount left to dispose it.
    let cancelled = false
    const disposers: (() => void)[] = []

    void loadMonaco().then((api) => {
      const host = hostRef.current
      const root = rootRef.current
      if (cancelled || host === null || root === null) return
      apiRef.current = api
      const { monaco } = api
      // A fresh model per editor rather than monaco's URI-keyed cache: two
      // panels can hold the SAME path (the app never forbade it), and a shared
      // model would make typing in one appear in the other with one undo stack
      // between them.
      const editor = monaco.editor.create(host, {
        ...api.EDITOR_OPTIONS,
        value: valueRef.current,
        language: api.languageFor(path),
        theme: api.THEME,
        readOnly: readOnly === true
      })
      editorRef.current = editor
      // Registered before any listener fires, so the harness door can never
      // see a mounted editor it cannot address.
      disposers.push(registerEditor(root, editor))
      // The tokens may have resolved between module load and this mount (the
      // fallback path in `token`); re-reading is free and idempotent.
      api.syncTheme()

      const changed = editor.onDidChangeModelContent(() => {
        echoRef.current = true
        handlers.current.onChange(editor.getValue())
        echoRef.current = false
      })
      disposers.push(() => { changed.dispose() })

      /**
       * EVERY keydown, not only the two bound below, is stopped here so it
       * never reaches `window`. `useViewport`'s and `usePalette`'s listeners
       * live there, above this in the bubble path, so without this a ⌘N typed
       * into a draft spawns a panel behind the file — the guard the textarea
       * carried, kept, because the hazard is the window listeners and not the
       * widget.
       *
       * ON THE HOST, and that placement is the whole of it. The first version
       * used `editor.onKeyDown`, which reads like the same thing and is not:
       * Monaco's public emitter fires from a handler on its inner
       * `textarea.inputarea`, while its KEYBINDING SERVICE listens on the
       * editor container — an ANCESTOR of that textarea. Stopping propagation
       * in the emitter therefore ran before Monaco had decided what the key
       * meant, and killed its entire keybinding dispatch: ⌘S saved nothing,
       * ⌘F opened no find widget, and the editor's own undo never fired. It
       * failed silently and looked like "Monaco ignores keys".
       *
       * The textarea this replaces was safe only by accident of shape — a
       * textarea has no descendants, so "on the element itself" and "outside
       * everything that listens" were the same place. They are not here.
       *
       * A native listener rather than a React `onKeyDown` prop for the
       * neighbouring reason: React delegates from its root container, so its
       * handler would run after this one either way, but a key Monaco consumes
       * and stops itself would never reach a React handler at all — and would
       * reach `window`.
       *
       * `useNavGrid`'s listener is CAPTURE-phase on `window` and has already
       * run before this could stop anything — that guard is widened in
       * useNavGrid.ts itself, exactly as it was for the textarea.
       */
      const stopKeys = (event: KeyboardEvent): void => { event.stopPropagation() }
      root.addEventListener('keydown', stopKeys)
      disposers.push(() => { root.removeEventListener('keydown', stopKeys) })

      // Bound as Monaco COMMANDS, not sniffed out of the keydown above:
      // Monaco owns its keybinding dispatch, and a key it has a binding for is
      // preventDefault'd before any listener of ours decides what it meant.
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { handlers.current.onSave() })
      editor.addCommand(monaco.KeyCode.Escape, () => { handlers.current.onEscape() })

      disposers.push(() => {
        editorRef.current = null
        // Disposes the editor AND the model it created — a model left behind
        // leaks the whole file's text plus its tokenization for the session.
        editor.getModel()?.dispose()
        editor.dispose()
      })

      /**
       * `autoFocus`'s replacement, and it stays HERE rather than in an effect
       * of its own: the editor does not exist until this point, and a focus
       * call on an absent editor is the silent no-op that leaves focus on
       * `<body>` — the failure `restoreFocus` exists for. FileNode still owns
       * the other half (giving focus back on exit).
       */
      editor.focus()
      setReady(true)

      // Shared text, AFTER the editor exists and its own change listener is
      // on: y-monaco's first act may be replacing the model with the doc's
      // text, and that must reach `onChange` (it is how a teammate's unsaved
      // edits become the owner's dirty draft). Its own lazy chunk: yjs and
      // y-monaco are paid for only by a shared workspace.
      const target = sharedRef.current
      if (target !== undefined) {
        void import('../shared-text/binding').then(({ bindSharedText }) => {
          if (cancelled) return
          const binding = bindSharedText(monaco, editor, target, (state) => { setSharedState(state); sharedStateRef.current?.(state) })
          if (revertRef.current) revertRef.current.current = (text) => { binding.revert(text) }
          // Pushed after the model's disposer, so it runs BEFORE it (reverse order).
          disposers.push(() => {
            if (revertRef.current) revertRef.current.current = null
            binding.dispose()
            sharedStateRef.current?.(null)
          })
        })
      }
    })

    return () => {
      cancelled = true
      // Reverse order: the registry entry goes last in, first out, so nothing
      // can address a half-disposed editor.
      for (const dispose of disposers.reverse()) dispose()
    }
    // Once. `value`, `path` and `readOnly` are handled by the effects below;
    // naming them here would recreate the editor and lose the cursor (rule 1).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rule 2: only a value the editor did not itself produce flows in. That is
  // an outside write (the Source/Rich toggle, a refresh, a reseed) and it is
  // pushed as an EDIT so the user's undo stack still reaches back past it.
  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model || echoRef.current) return
    if (model.getValue() === value) return
    editor.executeEdits('external', [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }])
  }, [value])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    const api = apiRef.current
    if (model && api) api.monaco.editor.setModelLanguage(model, api.languageFor(path))
  }, [path])

  useEffect(() => { editorRef.current?.updateOptions({ readOnly: readOnly === true }) }, [readOnly])

  return (
    <div
      ref={rootRef}
      className="file-node__editor"
      data-file-node-editor
      {...(ready ? {} : { 'data-file-node-editor-loading': '' })}
      {...(sharedState === null ? {} : { 'data-shared-text': sharedState })}
      /* The panel is draggable by its body in places; a mousedown that starts
         a selection inside the editor must not also start a panel drag. */
      onMouseDown={(event) => { event.stopPropagation() }}
    >
      <div ref={hostRef} className="file-node__editor-host" />
      {!ready && (
        /**
         * The pre-paint, and it is not a spinner or a nicety.
         *
         * A prose note OPENS INTO ITS EDITOR (FileNode's auto-edit effect,
         * M27's open-to-write), so with Monaco loaded lazily the first thing
         * a person sees on opening a note was an EMPTY BOX where their text
         * should be. The text is already in hand — it is the `value` prop —
         * so there is no reason to show nothing while the editor arrives.
         *
         * It is also what keeps the panel's text in the DOM across the gap:
         * `starter.1` reads the note panel's `textContent` for the word it
         * wrote, and found an empty panel. That check was right — the app had
         * a visible hole in it.
         *
         * Inert by construction: no focus, no selection, `aria-hidden` (the
         * real editor announces itself a moment later), and it unmounts the
         * instant `ready` flips. It shares the mono face, size, line-height
         * and padding with Monaco's own options so the text does not jump
         * when the editor takes over.
         */
        <pre className="file-node__editor-preload" aria-hidden="true">{value}</pre>
      )}
    </div>
  )
}
