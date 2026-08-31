/** The one provider-neutral shape that crosses from a work-service adapter to
 * the canvas. A second provider, not Jira alone, decides any wider surface. */
export interface WorkItem {
  id: string
  title: string
  description: string
  assignee: string | null
  state: string | null
  url: string
}

/**
 * One legal next state for a work item. Provider-neutral like WorkItem, and
 * for the same reason: a second provider, not Jira alone, decides any wider
 * surface. `toState` is nullable because the state a transition leads to is
 * a display convenience, while the id is the fact the write needs.
 */
export interface WorkItemTransition {
  id: string
  name: string
  toState: string | null
}
