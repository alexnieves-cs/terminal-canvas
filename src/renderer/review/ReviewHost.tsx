import type { JSX } from 'react'

/**
 * M438. The Review page's mount point. The Review owner fills it. Empty on
 * purpose, the same way SessionsHost is: this lane only reserves the page.
 */
export function ReviewHost(): JSX.Element {
  return <section className="review-host" data-review-host aria-label="Review" />
}
