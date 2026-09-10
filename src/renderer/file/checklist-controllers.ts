import type { CreationResult } from '@shared/verb-table'
export interface ChecklistController {
  edit(operation: string, value?: string): Promise<CreationResult>
  hand(line: number, agent: string): Promise<CreationResult>
}
const controllers = new Map<string, ChecklistController>()
export function checklistController(id: string): ChecklistController | undefined { return controllers.get(id) }
export function registerChecklist(id: string, controller: ChecklistController): () => void {
  controllers.set(id, controller)
  return () => { if (controllers.get(id) === controller) controllers.delete(id) }
}
// Specific surface truth: xterm also uses a textarea, so never guard all inputs.
export function checklistFocused(): boolean { return document.activeElement?.closest('[data-checklist-body]') !== null && document.activeElement?.closest('[data-checklist-body]') !== undefined }
