import type { JSX } from 'react'
import type { Panel } from '@renderer/panels/panels'
import type { TaskGroup } from '@renderer/shell/task-queue'
import type { FocusSide } from '@renderer/focus/focus-model'
import { Tabs } from '@renderer/primitives'
import { LearnPage } from '../learn/LearnPage'

/**
 * M438. The Review page's mount point, reserved by the redesign and left
 * empty: the top bar's Review tab opened a blank page.
 *
 * M605. Now it holds the two things a review is for. "To review" lists the
 * tasks whose work came back and wants a person — finished with changes
 * nobody has reviewed, or a check that failed — in the task queue's own
 * order and words (`buildTaskQueue`), each opening its focus view on the
 * side that answers it. "Lessons" is the page lane O built, which used to be
 * reachable only from the palette: lessons come from reviews, so they live
 * beside them. Needs-you stays where it is (the bell, ⌘J, Sessions' cards):
 * an agent stopped mid-turn is not a review.
 */
export type ReviewTab = 'queue' | 'lessons'

export interface ReviewHostProps {
  tab: ReviewTab
  onTab: (tab: ReviewTab) => void
  groups: readonly TaskGroup[]
  panels: readonly Panel[]
  onOpen: (itemId: string, side: FocusSide) => void
  onNewTask: () => void
}

/** The groups the page lists: work that came back, never a stopped agent or restart leftovers. */
export function reviewGroups(groups: readonly TaskGroup[]): TaskGroup[] {
  return groups.filter((g) => g.itemId !== null && (g.severity === 'review' || g.severity === 'failed'))
}

const VERDICT: Record<string, string> = { checked: 'its check passed', claimed: 'the agent says it is done' }

export function ReviewHost(p: ReviewHostProps): JSX.Element {
  const rows = reviewGroups(p.groups)
  return (
    <section className="review-host" data-review-host aria-label="Review">
      <header className="review-host__bar">
        <h2 className="review-host__title">Review</h2>
        <Tabs<ReviewTab>
          value={p.tab}
          onSelect={p.onTab}
          label="Review"
          dataAttr="data-review-tab"
          tabs={[{ id: 'queue', label: 'To review', count: rows.length }, { id: 'lessons', label: 'Lessons' }]}
        />
      </header>
      {p.tab === 'lessons' ? <LearnPage panels={p.panels} onShowQueue={() => p.onTab('queue')} /> : rows.length === 0 ? (
        <div className="review-host__empty" data-review-empty>
          <p>Nothing to review. When an agent finishes a task with changes, or a task's check fails, it shows up here.</p>
          <button type="button" className="pf__verb pf__verb--word" data-review-new onClick={p.onNewTask}>New task</button>
        </div>
      ) : (
        <ul className="review-host__list" aria-label="To review">
          {rows.map((g) => {
            const review = g.decisions.find((d) => d.kind === 'review')
            const side: FocusSide = g.severity === 'review' ? 'review' : 'checks'
            return (
              <li key={g.itemId} className="review-host__row" data-review-row={g.itemId} data-review-kind={g.severity}>
                <span className="review-host__name">{g.title}</span>
                <span className="review-host__why">{g.why}{review?.verdict !== undefined ? ` · ${VERDICT[review.verdict] ?? ''}` : ''}</span>
                {(review?.affects ?? '') !== '' && <span className="review-host__affects">{review?.affects}</span>}
                <button type="button" className="pf__verb pf__verb--word" data-review-open={g.itemId} onClick={() => p.onOpen(g.itemId as string, side)}>
                  {g.severity === 'review' ? 'Review changes' : 'See checks'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
