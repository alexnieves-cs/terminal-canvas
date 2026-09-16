import * as Radix from '@radix-ui/react-tooltip'
import type { ReactNode, ComponentPropsWithoutRef, JSX } from 'react'
import { INERT_PLACEMENT } from './popper'
import { MotionSurface } from './MotionSurface'
import { createContext, useContext, useEffect, useState } from 'react'

/**
 * THE TOOLTIP PRIMITIVE — shipped, and deliberately unadopted this round.
 *
 * There is no tooltip COMPONENT in this app today. `dock.1`'s "tooltip
 * labels", the chrome verbs' hints, every mark's fix-it sentence: all of them
 * are the native `title` attribute, drawn by the OS. That is a real design
 * position, not an omission — a native tooltip cannot be clipped by a panel,
 * cannot be caught in the canvas transform, and costs no paint on a surface
 * that already composites live terminals.
 *
 * Replacing them with styled floating cards is therefore a VISIBLE change, on
 * the dock and on every panel header at once. Under this repo's rules that is
 * a restyle: it needs new rules in styles.css, a fresh-context critic's
 * sentence per changed scene, and regenerated goldens. This round makes no
 * such change, so `title=` is left exactly where it is and this file waits for
 * the round that does.
 *
 * What it is for, when that round comes: a tooltip that must carry markup a
 * `title` cannot — a keyboard shortcut in a <kbd>, a two-line hint, a state
 * word in its tone — and one that appears on FOCUS as well as hover, which is
 * the accessibility gap `title` genuinely has.
 *
 * An adopter must bring its own placement. The popper wrapper is neutralised
 * app-wide (see popper.ts), so a Tooltip positions from a `position: relative`
 * host with its own rule, the way `.shell__view-menu` and `.inspector__menu`
 * already do. Tokens only, and the rule belongs in styles.css where
 * verify:styles can read it.
 */

export interface TooltipProviderProps {
  readonly delayDuration?: number
  readonly children: ReactNode
}

/**
 * Mounted once, near the root, by the round that adopts this. It is what makes
 * a group of tooltips share a delay — the second hint in a row appears at
 * once, which is the behaviour that separates a tooltip from a popup.
 */
export function TooltipProvider({ delayDuration = 400, children }: TooltipProviderProps): JSX.Element {
  return <Radix.Provider delayDuration={delayDuration} skipDelayDuration={300}>{children}</Radix.Provider>
}

export interface TooltipProps {
  readonly children: ReactNode
}

interface TooltipState { open: boolean; onExitComplete: () => void }
const TooltipOpen = createContext<TooltipState>({ open: false, onExitComplete: () => {} })

export function Tooltip({ children }: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { if (open) setMounted(true) }, [open])
  return <TooltipOpen.Provider value={{ open, onExitComplete: () => { if (!open) setMounted(false) } }}><Radix.Root open={mounted} onOpenChange={setOpen}>{children}</Radix.Root></TooltipOpen.Provider>
}

/**
 * The element the hint belongs to, unchanged. An adopter drops its `title`
 * when it does this — leaving both mounts two tooltips, the OS one and this
 * one, over the same control.
 */
export function TooltipTrigger({ children, ...rest }: ComponentPropsWithoutRef<'button'>): JSX.Element {
  return <Radix.Trigger asChild><button type="button" {...rest}>{children}</button></Radix.Trigger>
}

export interface TooltipContentProps extends ComponentPropsWithoutRef<'div'> {
  readonly children: ReactNode
}

export function TooltipContent({ children, ...rest }: TooltipContentProps): JSX.Element {
  const { open, onExitComplete } = useContext(TooltipOpen)
  return (
    <Radix.Content {...INERT_PLACEMENT} asChild forceMount {...rest}>
      <MotionSurface open={open} onExitComplete={onExitComplete}>{children}</MotionSurface>
    </Radix.Content>
  )
}
