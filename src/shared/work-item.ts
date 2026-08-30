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
