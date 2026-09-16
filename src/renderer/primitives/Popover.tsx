import * as Radix from '@radix-ui/react-popover'
import { createContext, useContext, type JSX } from 'react'
import { useEffect, useState } from 'react'
import type { ReactNode, ComponentPropsWithoutRef } from 'react'
import { useOpenIntent, triggerProps, contentProps } from './useOpenIntent'
import type { OpenIntent } from './useOpenIntent'
import { INERT_PLACEMENT } from './popper'
import { MotionSurface } from './MotionSurface'

/**
 * THE POPOVER PRIMITIVE — a transient surface with arbitrary content, as
 * opposed to a Menu, which is a list of commands with a roving focus.
 *
 * The distinction is not cosmetic and decides which of the two a surface
 * wants: a Menu's rows answer to the arrow keys and typeahead and announce
 * themselves as `menuitem`; a Popover's content is ordinary tabbable markup —
 * headings, prose, links, a jump verb — and Tab is how it is walked. The
 * dock's attention popover is the second kind: it lists panels with a verb
 * each, and forcing it into `role="menu"` would make a screen reader promise
 * arrow keys that do not work.
 *
 * Same three settings as the Menu, for the same reasons: `modal={false}` so
 * <body> never takes `pointer-events: none` over a live PTY, no `<Portal>` so
 * the content stays a descendant of its owner where the suites look for it,
 * and INERT_PLACEMENT because the stylesheet owns placement (see popper.ts).
 */

interface PopoverContext {
  readonly intent: OpenIntent
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onExitComplete: () => void
}

const Ctx = createContext<PopoverContext | null>(null)

function usePopover(): PopoverContext {
  const ctx = useContext(Ctx)
  if (ctx === null) throw new Error('a Popover part was rendered outside its Popover')
  return ctx
}

export interface PopoverProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly children: ReactNode
}

export function Popover({ open, onOpenChange, children }: PopoverProps): JSX.Element {
  const intent = useOpenIntent()
  const [mounted, setMounted] = useState(open)
  useEffect(() => { if (open) setMounted(true) }, [open])
  return (
    <Ctx.Provider value={{ intent, open, onOpenChange, onExitComplete: () => { if (!open) setMounted(false) } }}>
      <Radix.Root open={mounted} onOpenChange={onOpenChange} modal={false}>{children}</Radix.Root>
    </Ctx.Provider>
  )
}

export function PopoverTrigger({ children, ...rest }: ComponentPropsWithoutRef<'button'>): JSX.Element {
  const { intent, open, onOpenChange } = usePopover()
  return (
    <Radix.Trigger asChild {...triggerProps(intent, () => onOpenChange(!open))}>
      <button type="button" {...rest}>{children}</button>
    </Radix.Trigger>
  )
}

export interface PopoverContentProps extends ComponentPropsWithoutRef<'div'> {
  readonly children: ReactNode
  /**
   * Keep the content mounted while closed, hidden with the `hidden` attribute.
   *
   * The inspector's ⋯ needs it for two reasons at once: its rows are addressed
   * from outside (verify-panels-agents clicks
   * `[data-inspector-action="close"]` without opening the menu), and its own
   * M207 rule is that every verb stays discoverable whether or not the surface
   * has ever been opened. An adopter passing this owns the `hidden` attribute
   * on its own element.
   */
  readonly forceMount?: true
}

/**
 * Unlike a Menu's, a Popover's content is NOT auto-focused even when a key
 * opened it — Radix would focus the content box itself, and the dock's
 * popover is bottom-anchored inside a scrolling column, where that scrolls the
 * column to it. Tab from the trigger reaches the content in DOM order anyway,
 * because it is rendered in place rather than portalled.
 */
export function PopoverContent({ children, forceMount, ...rest }: PopoverContentProps): JSX.Element {
  const { intent, open, onExitComplete } = usePopover()
  const focus = contentProps(intent)
  // The same trap Menu.tsx documents at length: with `forceMount` the
  // DismissableLayer is already listening when the opening pointerdown lands
  // on the trigger, which is outside the content — so Radix opens the surface
  // and the layer dismisses it in one press. `sawPointer` is read as a REF at
  // event time because pointerdown is discrete: React flushes the opening
  // state update before the document listeners run, so a guard conditioned on
  // render-time `open` is already gone by the time the layer asks.
  const guard = forceMount === true
    ? { onInteractOutside: (event: { preventDefault: () => void }) => { if (intent.sawPointer.current) event.preventDefault() } }
    : {}
  return (
    <Radix.Content
      {...INERT_PLACEMENT}
      asChild
      forceMount={forceMount}
      {...guard}
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={focus.onCloseAutoFocus}
      onMouseDown={(event) => event.stopPropagation()}
      {...rest}
    >
      <MotionSurface open={open} onExitComplete={onExitComplete}>{children}</MotionSurface>
    </Radix.Content>
  )
}
