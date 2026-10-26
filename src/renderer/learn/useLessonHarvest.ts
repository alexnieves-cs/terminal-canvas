import { useEffect, useRef } from 'react'
import type { PersistedWorkItem } from '@shared/work-items'
import type { CommentFacts } from '@shared/lessons'

/**
 * M570 (lane O). Every review comment the person SENT to an agent is offered
 * to main as a lesson, once per comment per run of the app.
 *
 * Read from the work items rather than hooked into each place a comment is
 * sent (the task review's Send, the focus view's, an agent line): `sentAt`
 * on a comment is the one fact all of them write, so reading it is the one
 * door that cannot be forgotten by a later sender. Main decides what is a
 * lesson (`lessonFromComment`: the person's own, sent) and keeps one per id,
 * so this hook may offer too much but never files a lesson by itself.
 *
 * A task whose lane has no folder on this canvas (its chat was closed) is
 * skipped and offered again on a later change, when it may have one.
 */
export function useLessonHarvest(workItems: readonly PersistedWorkItem[], folderOf: (panelId: string) => string | undefined): void {
  const offered = useRef(new Set<string>())
  const folderRef = useRef(folderOf)
  folderRef.current = folderOf
  useEffect(() => {
    const record = window.canvas?.learn?.record
    if (record === undefined) return
    for (const item of workItems) {
      const root = item.panelId === undefined ? undefined : folderRef.current(item.panelId)
      if (root === undefined) continue
      for (const c of item.comments ?? []) {
        if (c.sentAt === undefined || c.proposedBy !== undefined) continue
        const key = `${item.id}:${c.id}`
        if (offered.current.has(key)) continue
        offered.current.add(key)
        const facts: CommentFacts = {
          root,
          taskId: item.id,
          taskTitle: item.title,
          ...(item.brief === undefined ? {} : { brief: item.brief }),
          ...(item.checks === undefined ? {} : { checks: item.checks }),
          ...(item.panelId === undefined ? {} : { panelId: item.panelId }),
          comment: { id: c.id, path: c.path, line: c.line, quote: c.quote, body: c.body, sentAt: c.sentAt, at: c.at }
        }
        // Best effort, like the discard's capture: a lesson that could not be
        // kept is offered again next launch, and nothing here is shown.
        void record(facts).catch(() => { offered.current.delete(key) })
      }
    }
  }, [workItems])
}
