import { memo, type JSX, type MouseEvent } from 'react'
import type { NavGridController } from './useNavGrid'

/**
 * The nav grid overlay (M11).
 *
 * A sibling of `.world`, never a child: `.world` carries the single
 * translate()/scale() transform, so an overlay mounted inside it would pan and
 * zoom away with the canvas — the opposite of a viewport-pinned overlay.
 * EdgeIndicators is a sibling for the same reason.
 *
 * It takes NO DOM focus. The hook needs keyup at the window, and giving the
 * overlay focus would also inherit usePalette's rule 4 (restore focus on
 * close), which would fire into the middle of a workspace switch.
 */
function NavGridImpl({ controller }: { controller: NavGridController }): JSX.Element | null {
  if (!controller.open) return null
  return (
    <div
      className="navgrid"
      data-screen-control=""
      role="presentation"
      // The same guard Palette.tsx carries, for the same reason and in the
      // same parent. This mounts INSIDE .canvas, whose onMouseDown is the
      // background handler: without this, a click on the overlay is hit-tested
      // against the WORLD point underneath it and handed to onSelectPanel,
      // which clears the dormant id and calls registry.wake — so a click on a
      // cell SPAWNS an agent in the workspace the user is about to leave, and
      // clears focusedId, demoting the panel they were working in. The overlay
      // is opaque, so none of that is visible and nothing reaches any log.
      // Clicking a highlighted cell is the natural instinct here precisely
      // because hover already moves the cursor.
      //
      // Bubble phase, and deliberately NO preventDefault: the palette needs
      // one so its input still places a caret, and this overlay takes no DOM
      // focus and has no caret to place. verify:panels 122b.
      onMouseDown={(e: MouseEvent<HTMLDivElement>): void => e.stopPropagation()}
    >
      <div className="navgrid__grid">
        {controller.cells.map((cell, i) => {
          const cursor = i === controller.cursor
          const label =
            cell.kind === 'workspace' ? cell.name : cell.kind === 'more' ? 'More…' : ''
          return (
            <div
              key={i}
              data-cell-index={i}
              data-cell-label={label}
              className={[
                'navgrid__cell',
                `navgrid__cell--${cell.kind}`,
                cursor ? 'navgrid__cell--cursor' : '',
                cell.kind === 'workspace' && cell.active ? 'navgrid__cell--active' : ''
              ].filter(Boolean).join(' ')}
              // Hover MOVES the cursor and does not commit — one commit
              // gesture, not two, and a Cmd-held click is an awkward chord to
              // require. An empty cell leaves the cursor alone, the rule
              // stepCell obeys for the arrows.
              onMouseMove={cell.kind === 'empty' ? undefined : (): void => controller.setCursor(i)}
            >
              <span className="navgrid__name">{label}</span>
              {cell.kind === 'workspace' && (
                <span className="navgrid__meta">
                  {cell.panels} {cell.panels === 1 ? 'panel' : 'panels'}
                  {cell.waiting > 0 ? ` · ${cell.waiting} waiting` : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="navgrid__hint">release ⌘ to jump · esc to cancel</div>
    </div>
  )
}

export const NavGrid = memo(NavGridImpl)
