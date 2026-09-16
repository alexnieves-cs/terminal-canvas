import { createStore, type StoreApi } from 'zustand/vanilla'

/** Interaction state belongs to one workflow canvas. Template drafts remain the record editor. */
export interface WorkflowFlowState {
  selected: string | null
  dragging: string | null
  setSelected: (selected: string | null) => void
  setDragging: (dragging: string | null) => void
}

export function createWorkflowFlowStore(): StoreApi<WorkflowFlowState> {
  return createStore<WorkflowFlowState>((set) => ({
    selected: null,
    dragging: null,
    setSelected: (selected) => set({ selected }),
    setDragging: (dragging) => set({ dragging })
  }))
}
