import * as Radix from '@radix-ui/react-dialog'
import type { ReactNode, ComponentPropsWithoutRef, JSX } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import { MotionSurface } from './MotionSurface'

/**
 * THE DIALOG PRIMITIVE — the one overlay Radix does NOT position.
 *
 * Dialog ships no Floating UI and no popper wrapper: Radix supplies the
 * behaviour (focus trap, focus restored on close, Escape, `aria-modal`, the
 * label wiring) and leaves placement entirely to CSS. So unlike Menu and
 * Popover this needs no neutralisation — `.palette`, `.skills-ws` and the deck
 * presenter keep their own rules untouched and land exactly where they land
 * today.
 *
 * `modal` IS a choice here, and the default is the safe one.
 *
 *   modal={false}  (default) No focus trap, no `aria-hidden` on the rest of
 *                  the document, and — the reason it is the default — no
 *                  `pointer-events: none` on <body>. A surface that merely
 *                  floats over the canvas while terminals keep running wants
 *                  this; taking the pointer away from every live PTY because
 *                  a preview is open is the freeze described in Menu.tsx.
 *   modal          For a surface that genuinely OWNS the window until it is
 *                  dismissed. Trapping focus is then correct, and the trap is
 *                  the accessibility win: Tab cannot wander into a canvas the
 *                  person cannot see.
 *
 * No `<Portal>`, for the Menu's reason: the suites and the stylesheet both
 * address these surfaces where they are authored.
 */

export interface DialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Trap focus and inert the rest of the document. Off unless the surface owns the window. */
  readonly modal?: boolean
  readonly children: ReactNode
}

interface DialogState { open: boolean; onExitComplete: () => void }
const DialogOpen = createContext<DialogState>({ open: false, onExitComplete: () => {} })

export function Dialog({ open, onOpenChange, modal = false, children }: DialogProps): JSX.Element {
  const [mounted, setMounted] = useState(open)
  useEffect(() => { if (open) setMounted(true) }, [open])
  return <DialogOpen.Provider value={{ open, onExitComplete: () => { if (!open) setMounted(false) } }}><Radix.Root open={mounted} onOpenChange={onOpenChange} modal={modal}>{children}</Radix.Root></DialogOpen.Provider>
}

export function DialogTrigger({ children, ...rest }: ComponentPropsWithoutRef<'button'>): JSX.Element {
  return <Radix.Trigger asChild><button type="button" {...rest}>{children}</button></Radix.Trigger>
}

export interface DialogContentProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * What names the dialog. Radix requires one and warns to the console
   * otherwise; passing the caller's existing `aria-label` satisfies it without
   * adding a visible title the design does not have.
   */
  readonly 'aria-label': string
  readonly children: ReactNode
}

export function DialogContent({ children, ...rest }: DialogContentProps): JSX.Element {
  const { open, onExitComplete } = useContext(DialogOpen)
  return (
    // M345. NOT force-mounted. Dialog above already keeps Radix open until
    // Motion's exit completes (`mounted`), so the content cannot vanish before
    // its departure is seen. Force-mounted, its dismiss layer and focus scope
    // lived from app start: the scope never "mounted" on open, so focus stayed
    // behind the modal, and a closed force-mounted MENU registered later
    // outranked it as the highest layer and swallowed Escape (share.click.1).
    <Radix.Content
      asChild
      onMouseDown={(event) => event.stopPropagation()}
      // Radix wants a Description too and warns when there is none. These
      // surfaces are labelled, not described, and a hidden paragraph invented
      // to quiet a console warning is a string nobody maintains.
      aria-describedby={undefined}
      {...rest}
    >
      <MotionSurface open={open} onExitComplete={onExitComplete}>{children}</MotionSurface>
    </Radix.Content>
  )
}

/**
 * The scrim. Optional on purpose: the surfaces migrated in this round paint
 * their own ground (`.palette` sits on the shell's own dim, the deck presenter
 * fills the window), and adding an Overlay would put a second scrim over the
 * first — a visible change, which this round does not make.
 */
export function DialogOverlay({ ...rest }: ComponentPropsWithoutRef<'div'>): JSX.Element {
  return <Radix.Overlay asChild><div {...rest} /></Radix.Overlay>
}

export function DialogClose({ children, ...rest }: ComponentPropsWithoutRef<'button'>): JSX.Element {
  return <Radix.Close asChild><button type="button" {...rest}>{children}</button></Radix.Close>
}
