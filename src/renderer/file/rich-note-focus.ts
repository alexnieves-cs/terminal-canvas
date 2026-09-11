/**
 * M250. Whether a rich note editor holds the keyboard — `shouldIgnoreKeys`'
 * clause, so a ⌘V/⌘C/⌘Z aimed at a note never reaches the focused terminal.
 *
 * Its own tiny module rather than an export of RichNoteEditor.tsx so Canvas
 * does not import a component to ask a DOM question. Specific surface truth,
 * checklistFocused()'s rule: xterm also uses a textarea, so this never guards
 * "any input" — only an element inside `[data-rich-note]`.
 */
export function noteEditorFocused(): boolean {
  const active = document.activeElement
  return active !== null && active.closest('[data-rich-note]') !== null
}
