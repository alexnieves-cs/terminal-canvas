import type { JSX } from 'react'

/**
 * The top bar. M8a Task 2 ships the empty region so the grid is real and
 * check 72 can measure it; Task 5 fills it with the spawn, zoom, search and
 * settings controls.
 */
export function TopBar(): JSX.Element {
  return <header className="shell__top" aria-label="Toolbar" />
}
