/**
 * M383. Which conversation the Replay sheet is showing, and which one beside
 * it — the share dialog's store shape (`share-dialog-store.ts`): a door
 * (the palette row, the Activity tab's button) opens it, the sheet reads it.
 * A view, never an action on the canvas: nothing here spawns, sends or writes.
 */
export interface ReplayRequest { panelId: string; compareWith?: string }

let request: ReplayRequest | null = null
const listeners = new Set<(r: ReplayRequest | null) => void>()
const emit = (): void => { for (const l of listeners) l(request) }

export function openReplay(panelId: string): void { request = { panelId }; emit() }
export function compareReplay(other: string | null): void {
  if (request === null) return
  request = other === null ? { panelId: request.panelId } : { panelId: request.panelId, compareWith: other }
  emit()
}
export function closeReplay(): void { request = null; emit() }
export function replayRequest(): ReplayRequest | null { return request }
export function onReplay(listener: (r: ReplayRequest | null) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * M558 (lane K). "Branch from here" — the sheet's one door that ACTS. The
 * verb lives on the canvas (canvas/useForkVerb.ts, which owns panels and
 * placement) and registers itself here; the sheet stays a view that asks.
 * Absent until the canvas has mounted, and then the button says so.
 */
export type BranchAnswer = { kind: 'forked'; panelId: string; sentence: string } | { kind: 'refused'; sentence: string }
let brancher: ((panelId: string, turn: number) => Promise<BranchAnswer>) | null = null
export function setBrancher(next: typeof brancher): void { brancher = next }
export function branchFromHere(panelId: string, turn: number): Promise<BranchAnswer> {
  return brancher === null ? Promise.resolve({ kind: 'refused', sentence: 'Could not branch: the canvas is not ready yet' }) : brancher(panelId, turn)
}

/**
 * M559. Which chat is a fork of which, and at what turn — for the compare
 * view's caption. Memory only: the fork's own title carries the same fact
 * across a relaunch, so nothing is lost that a person cannot read.
 */
const forks = new Map<string, { from: string; turn: number }>()
export function noteFork(panelId: string, from: string, turn: number): void { forks.set(panelId, { from, turn }) }
export function forkOf(panelId: string): { from: string; turn: number } | undefined { return forks.get(panelId) }
