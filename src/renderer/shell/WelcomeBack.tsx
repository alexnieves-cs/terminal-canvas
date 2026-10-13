import type { JSX, ReactNode } from 'react'
import { shellControl } from './shell-control'

/**
 * The UX pass (notes/ux-proposals.md 4.4). ONE "WHILE YOU WERE AWAY" CARD.
 *
 * A return launch could put four cards on screen at once, each in its own
 * place: the Since-you-left briefing (top centre), the Reopened notice and
 * Unfinished work (bottom left) and the login-shell banner (top centre, on
 * top of the briefing). They are one moment — "here is what happened while
 * the app was closed" — so they are one card, in the briefing's slot, each
 * kept whole as a section, with one Dismiss all.
 *
 * Dismiss all is each section's own "Got it", pressed together: what only
 * informs clears, and anything that still needs a choice (an ended session,
 * an interrupted job) stays, exactly as it would after its own Got it.
 * The head shows only with two sections or more — one section is its own card.
 */
export function welcomeBackKicker(count: number): string {
  return `While you were away · ${count} things`
}

export function WelcomeBack({ count, onDismissAll, children }: {
  count: number
  onDismissAll: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <section className="welcome-back" data-welcome-back="" data-screen-control="" aria-label="While you were away">
      {count > 1 && (
        <header className="welcome-back__head">
          <span className="welcome-back__kicker">{welcomeBackKicker(count)}</span>
          <button type="button" className="pf__verb pf__verb--word" data-welcome-dismiss="" title="Each section's Got it at once; anything that still needs a choice stays" {...shellControl(onDismissAll)}>Dismiss all</button>
        </header>
      )}
      {children}
    </section>
  )
}
