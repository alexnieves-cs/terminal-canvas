/**
 * "A text draft has the keyboard" — the GENERAL half of the rule that
 * `skills/editor-focus.ts`, `note`, `sheet`, `deck`, `checklist` and the pill
 * each re-derived for their own surface.
 *
 * The menu turns ⌘C/⌘V/⌘Z into `edit:*` IPC events rather than native
 * clipboard events, so a focused <input> never receives a native paste. A
 * field that did not subscribe got NOTHING while the canvas's listener sent
 * the text to the focused TERMINAL — a paste aimed at an inspector field or a
 * review comment went into the running agent. This reads the DOM instead of
 * a per-surface flag, so the next text surface is covered without being
 * remembered.
 *
 * A surface that serves its own edit events (chat composer, launcher, rich
 * note, the Orchestrate composer) marks an ancestor `data-edit-owner`; the
 * canvas then only STOPS the terminal route and leaves the field to its owner,
 * because serving it here too would insert the paste twice.
 */

/** The focused editable element, or null when the keyboard is a terminal's or nobody's. */
export function focusedDraft(): HTMLElement | null {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return null
  // xterm's own helper textarea IS a textarea; it is the terminal, not a draft.
  if (el.closest('.xterm') !== null) return null
  if (el instanceof HTMLTextAreaElement) return el.readOnly || el.disabled ? null : el
  if (el instanceof HTMLInputElement) {
    return /^(text|search|url|email|tel|password|number)$/.test(el.type) && !el.readOnly && !el.disabled ? el : null
  }
  return el.isContentEditable ? el : null
}

/**
 * True when the draft's own surface serves this verb itself. `data-edit-owner`
 * surfaces serve copy/paste; only the rich note and Monaco keep their own
 * history, so everyone else's ⌘Z is the field's native undo.
 */
function ownedElsewhere(el: HTMLElement, verb: 'copy' | 'paste' | 'undo' | 'redo'): boolean {
  if (el.closest('.monaco-editor, [data-rich-note]') !== null) return true
  return (verb === 'copy' || verb === 'paste') && el.closest('[data-edit-owner]') !== null
}

/**
 * Serve an edit verb into the focused draft. Returns true when a draft owns
 * the keyboard — the caller must then NOT route the verb to a terminal or to
 * canvas history, whether or not this function performed it.
 */
export function serveDraftEdit(verb: 'copy' | 'paste' | 'undo' | 'redo', text?: string): boolean {
  const el = focusedDraft()
  if (el === null) return false
  if (ownedElsewhere(el, verb)) return true
  if (verb === 'paste') {
    // insertText keeps the field's native undo stack and fires `input`, so a
    // React-controlled field sees the change through its onChange.
    if (text) document.execCommand('insertText', false, text)
  } else if (verb === 'copy') {
    const chosen = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0)
      : window.getSelection()?.toString() ?? ''
    if (chosen !== '') void navigator.clipboard.writeText(chosen)
  } else {
    document.execCommand(verb)
  }
  return true
}
