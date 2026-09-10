import type { CreationResult } from '@shared/verb-table'

/**
 * M245. How the palette, agent and workflow doors reach a mounted sheet — the
 * checklist-controllers.ts shape. The sheet's session lives in its component;
 * a verb that edits it goes through the SAME guarded write a keystroke does,
 * so there is exactly one path to the file.
 */
export interface SheetController {
  edit(cell: string, value: string): Promise<CreationResult>
}
const controllers = new Map<string, SheetController>()
export function sheetController(id: string): SheetController | undefined { return controllers.get(id) }
export function registerSheet(id: string, controller: SheetController): () => void {
  controllers.set(id, controller)
  return () => { if (controllers.get(id) === controller) controllers.delete(id) }
}

/**
 * The sheet's own body, and only it. xterm also focuses a textarea, so "any
 * input is focused" would stand the canvas down for a focused TERMINAL too —
 * which is exactly the Cmd+V this guard exists to route correctly.
 */
export function sheetFocused(): boolean {
  return document.activeElement?.closest('[data-sheet-body]') != null
}
