/**
 * M276. The file editor's harness door, and the live-editor registry behind it.
 *
 * Deliberately SEPARATE from monaco.ts, and the separation is load-bearing
 * rather than tidy: Canvas.tsx installs the window hooks, so anything
 * Canvas.tsx imports is in the app's first chunk. Importing monaco.ts there
 * would pull ~3MB of editor into startup for every session, including the many
 * that never open a file panel — the editor is loaded lazily by CodeEditor for
 * exactly that reason, and a single import here would have quietly undone it
 * while every test still passed.
 *
 * So this module knows the SHAPE of an editor (two methods) and not the
 * library. Monaco's real type is structurally compatible; nothing is cast.
 *
 * WHY a door at all. Every Electron check that edits a file panel used to type
 * by calling the native `HTMLTextAreaElement.prototype.value` setter and
 * dispatching `input` — the standard React-controlled-input trick. Monaco has
 * no such surface: its visible text is a rendered view over a model, and its
 * own `textarea.inputarea` holds only the few characters around the cursor.
 *
 * The alternative considered and REFUSED was keeping a hidden mirror textarea
 * carrying `data-file-node-editor` so those checks kept passing untouched.
 * They would have passed while exercising a control no user can reach — the
 * "passing while exercising nothing" failure that check 140's own header
 * describes, bought deliberately this time. The checks drive the real editor
 * instead, through the app's real edit path: the rule `__m13Open` set.
 */

/**
 * The two methods the door needs, written structurally so this module never
 * imports Monaco. Monaco's `IStandaloneCodeEditor` satisfies it exactly;
 * nothing is cast, so a Monaco upgrade that changed either signature would be
 * a type error here rather than a runtime surprise in a check.
 *
 * The range is spelled out rather than left `unknown` because `unknown` is not
 * assignable to Monaco's own `IRange`, and the compiler would reject the real
 * editor at the one call site that matters.
 */
type TextRange = { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }

export type EditorLike = {
  getModel: () => { getValue: () => string; getFullModelRange: () => TextRange } | null
  executeEdits: (source: string, edits: { range: TextRange; text: string; forceMoveMarkers?: boolean }[]) => unknown
  focus: () => void
}

const editors = new Map<HTMLElement, EditorLike>()

/** Called by CodeEditor on mount; returns its own undo, called on unmount. */
export const registerEditor = (node: HTMLElement, editor: EditorLike): (() => void) => {
  editors.set(node, editor)
  return () => { editors.delete(node) }
}

/**
 * Replace an editor's whole text as a user edit. Returns false if `node` names
 * no live editor — a false here is the check's signal that it addressed the
 * wrong panel, which is the failure mode check 140's header warns about.
 *
 * `executeEdits`, never `setValue`: setValue RESETS the undo stack and is not
 * an edit anyone made, so it would not reproduce what a keystroke does.
 */
export const typeIntoEditor = (node: Element | null, text: string): boolean => {
  const editor = node instanceof HTMLElement ? editors.get(node) : undefined
  const model = editor?.getModel()
  if (!editor || !model) return false
  editor.executeEdits('harness', [{ range: model.getFullModelRange(), text, forceMoveMarkers: true }])
  return true
}

/** The text an editor is currently showing — the `.value` the checks used to read. */
export const editorText = (node: Element | null): string | null => {
  const editor = node instanceof HTMLElement ? editors.get(node) : undefined
  return editor?.getModel()?.getValue() ?? null
}

/**
 * Give an editor the keyboard. A check that presses a key needs the surface it
 * presses into to be focused — ordinary setup, not a stand-in for the gesture
 * under test: the key itself is still delivered by wc.sendInputEvent as a real,
 * trusted event, and Monaco's own keybinding dispatch still decides what it
 * means.
 */
export const focusEditor = (node: Element | null): boolean => {
  const editor = node instanceof HTMLElement ? editors.get(node) : undefined
  if (!editor) return false
  editor.focus()
  return true
}
