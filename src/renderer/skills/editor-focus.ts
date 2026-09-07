/**
 * M129, fix round 1. "A skill editor field has the keyboard."
 *
 * Module level and outside React, like every other cross-cutting flag this
 * canvas reads from an event handler: `shouldIgnoreKeys` sits in effect
 * dependency arrays that must never be torn down and reinstalled, so what it
 * composes has to be referentially stable and readable with no re-render.
 * Lifting a per-node draft flag into Canvas state is refused by
 * `useNavGrid`'s own entry for exactly the opposite reason — it would
 * re-render the canvas on every keystroke of a draft.
 *
 * What it prevents: `Canvas.tsx`'s `edit:copy`/`edit:paste` listeners route
 * the menu's Cmd+C/Cmd+V into `registry.get(focusedId)` — the RUNNING AGENT
 * — and they gate only on `shouldIgnoreKeys()`. Serving our own input is not
 * enough on its own: with the body textarea focused the paste would land in
 * BOTH places (the editor and the agent), and with a metadata input focused
 * it would land only in the agent, invisibly, while the user watches an
 * unchanged text field. That is the hazard `CLAUDE.md` records for
 * ReviewNode, FileNode and JiraTicket; this is the fifth surface, and the
 * one where the paste is most likely to be a whole prompt.
 *
 * The `edit:undo` half stays open — see `SkillEditor.tsx` for why the two
 * obvious fixes are each blocked, and why this editor's writes are
 * deliberately not in history.
 */
let focused = false

export function setSkillEditorFocused(value: boolean): void {
  focused = value
}

export function skillEditorFocused(): boolean {
  return focused
}
